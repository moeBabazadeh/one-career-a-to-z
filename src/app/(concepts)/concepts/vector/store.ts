// The editor's state, outside React: the file, the page, the selection, the tool, and the undo
// history. Every edit runs on a Draft, then instances are synced and the touched frames laid
// out again, and the result becomes the new document. A gesture (a drag, a scrub, typing) edits
// from the document it started with, and lands in the history as one step when it ends.

import { useSyncExternalStore } from 'react';
import { DOC, PINS, arrange, refs } from './build';
import { canvasMetrics, layoutAll, layoutTouched } from './autolayout';
import {
  ancestors,
  apply,
  applyV,
  blank,
  cloneTree,
  Draft,
  inInstance,
  insert,
  inv,
  isAncestor,
  isTop,
  mainOf,
  outermost,
  pageOf,
  removeTree,
  reparent,
  union,
  worldBox,
  worldMat,
  FAMILIES,
  type AutoLayout,
  type Box,
  type Doc,
  type Font,
  type Link,
  type Node,
  type NodeType,
} from './model';
import {
  detachInstance,
  instantiate,
  OVERRIDABLE,
  override,
  resetOverrides,
  swap,
  syncAll,
  instancesOf,
} from './sync';

export type Tool = 'move' | 'frame' | 'rect' | 'text' | 'hand' | 'comment';
export type Tab = 'design' | 'prototype' | 'inspect';

export interface Reply {
  id: string;
  who: 'moe' | 'you';
  body: string;
}

export interface Thread {
  id: string;
  at: string;
  fx: number;
  fy: number;
  replies: Reply[];
  resolved: boolean;
}

export interface State {
  doc: Doc;
  page: string;
  sel: string[];
  tool: Tool;
  tab: Tab;
  left: 'layers' | 'assets';
  editing: string | null;
  ready: boolean;
  play: { start: string } | null;
  reading: boolean;
  expanded: Record<string, boolean>;
  threads: Thread[];
  open: string | null;
  showComments: boolean;
  toast: { n: number; text: string } | null;
  rulers: boolean;
  ui: boolean;
  help: boolean;
  undo: number;
  redo: number;
}

const INITIAL: State = {
  doc: DOC,
  page: refs.pages.design,
  sel: [],
  tool: 'move',
  tab: 'design',
  left: 'layers',
  editing: null,
  ready: false,
  play: null,
  reading: false,
  expanded: {},
  threads: PINS.map((p) => ({
    id: p.id,
    at: p.at,
    fx: p.fx,
    fy: p.fy,
    replies: [{ id: `${p.id}-0`, who: 'moe', body: p.body }],
    resolved: false,
  })),
  open: null,
  showComments: true,
  toast: null,
  rulers: true,
  ui: true,
  help: false,
  undo: 0,
  redo: 0,
};

let state = INITIAL;
const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

function emit() {
  listeners.forEach((f) => f());
}

export function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

const getServer = () => INITIAL;

/** The whole state; re-renders on every change. */
export const useEditor = () => useSyncExternalStore(store.subscribe, store.get, getServer);

/** One slice of the state; re-renders only when that slice changes (by identity). */
export function useSlice<T>(pick: (s: State) => T) {
  return useSyncExternalStore(
    store.subscribe,
    () => pick(state),
    () => pick(INITIAL),
  );
}

/* ------------------------------------------------------------------ hover (separate, it changes on every move) */

let hovered: string | null = null;
const hoverListeners = new Set<() => void>();

export const hover = {
  get: () => hovered,
  set(id: string | null) {
    if (id === hovered) return;
    hovered = id;
    hoverListeners.forEach((f) => f());
  },
  subscribe(fn: () => void) {
    hoverListeners.add(fn);
    return () => {
      hoverListeners.delete(fn);
    };
  },
};

export const useHovered = (id: string) =>
  useSyncExternalStore(
    hover.subscribe,
    () => hovered === id,
    () => false,
  );

/* ------------------------------------------------------------------ toasts */

let toastN = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string) {
  set({ toast: { n: ++toastN, text } });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => set({ toast: null }), 2600);
}

/* ------------------------------------------------------------------ history */

interface Snap {
  doc: Doc;
  sel: string[];
  page: string;
}

const past: Snap[] = [];
const future: Snap[] = [];
let gesture: Snap | null = null;

function finish(d: Draft) {
  syncAll(d);
  layoutTouched(d);
  return d.done();
}

function push(snap: Snap) {
  past.push(snap);
  if (past.length > 200) past.shift();
  future.length = 0;
}

const clean = (doc: Doc, sel: string[]) => sel.filter((id) => doc.nodes[id]);

/** A one-step edit. */
export function edit(fn: (d: Draft) => void, sel?: string[]) {
  const before: Snap = { doc: state.doc, sel: state.sel, page: state.page };
  const d = new Draft(state.doc);
  fn(d);
  const doc = finish(d);
  if (doc === state.doc && !sel) return;
  push(before);
  set({ doc, sel: clean(doc, sel ?? state.sel), undo: past.length, redo: 0 });
}

/** Starts a gesture: edits from now on preview from this document until `endGesture`. */
export function beginGesture() {
  gesture = { doc: state.doc, sel: state.sel, page: state.page };
}

export const inGesture = () => !!gesture;

/** Re-runs a gesture's edit from the document it started with. */
export function preview(fn: (d: Draft) => void, sel?: string[]) {
  if (!gesture) beginGesture();
  const d = new Draft((gesture as Snap).doc);
  fn(d);
  const doc = finish(d);
  set({ doc, sel: clean(doc, sel ?? state.sel) });
}

export function endGesture() {
  const g = gesture;
  gesture = null;
  if (!g || g.doc === state.doc) return;
  push(g);
  set({ undo: past.length, redo: 0 });
}

export function cancelGesture() {
  const g = gesture;
  gesture = null;
  if (g) set({ doc: g.doc, sel: g.sel });
}

export function undo() {
  if (state.editing) stopEditing();
  const s = past.pop();
  if (!s) return toast('Nothing to undo');
  future.push({ doc: state.doc, sel: state.sel, page: state.page });
  set({
    doc: s.doc,
    sel: clean(s.doc, s.sel),
    page: s.doc.nodes[s.page] ? s.page : state.page,
    undo: past.length,
    redo: future.length,
  });
}

export function redo() {
  const s = future.pop();
  if (!s) return toast('Nothing to redo');
  past.push({ doc: state.doc, sel: state.sel, page: state.page });
  set({
    doc: s.doc,
    sel: clean(s.doc, s.sel),
    page: s.doc.nodes[s.page] ? s.page : state.page,
    undo: past.length,
    redo: future.length,
  });
}

/* ------------------------------------------------------------------ start-up */

/** Real font metrics: waits for the file's fonts, then lays everything out again. */
let preparing = false;

export async function prepare() {
  if (preparing) return;
  preparing = true;
  const fams = new Set<string>();
  for (const t of state.doc.texts) fams.add(`${t.font.weight}|${t.font.family}`);
  const loads = [...fams].map((k) => {
    const [w, fam] = k.split('|');
    const css = getComputedStyle(document.documentElement)
      .getPropertyValue(FAMILIES[fam as keyof typeof FAMILIES].css)
      .trim();
    return document.fonts.load(`${w} 16px ${css}`).catch(() => []);
  });
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
  canvasMetrics();
  const d = new Draft(state.doc);
  layoutAll(d);
  arrange(d);
  set({ doc: d.done(), ready: true });
}

/** Loads a family the file didn't use yet, then re-shapes text. */
export async function loadFamily(fam: keyof typeof FAMILIES, weight: number) {
  const css = getComputedStyle(document.documentElement).getPropertyValue(FAMILIES[fam].css).trim();
  await document.fonts.load(`${weight} 16px ${css}`).catch(() => []);
  canvasMetrics();
  const d = new Draft(state.doc);
  layoutAll(d);
  set({ doc: d.done() });
}

/* ------------------------------------------------------------------ navigation */

export function setPage(page: string) {
  if (page === state.page) return;
  stopEditing();
  const proto = refs.pages.prototype;
  const tab =
    page === proto && state.tab === 'design'
      ? 'prototype'
      : state.page === proto && state.tab === 'prototype'
        ? 'design'
        : state.tab;
  set({ page, sel: [], open: null, tab });
}

export function setTool(tool: Tool) {
  stopEditing();
  set({ tool });
}

/** Opens the layers down to each selected node. */
function revealed(sel: string[], doc = state.doc) {
  const expanded = { ...state.expanded };
  let changed = false;
  for (const id of sel)
    for (const a of ancestors(doc.nodes, id)) {
      if (doc.nodes[a]?.type === 'page' || expanded[a]) continue;
      expanded[a] = true;
      changed = true;
    }
  return changed ? expanded : state.expanded;
}

export function select(ids: string[], opts: { add?: boolean; toggle?: boolean } = {}) {
  let sel = ids;
  if (opts.toggle) {
    sel = [...state.sel];
    for (const id of ids) sel = sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id];
  } else if (opts.add) sel = [...new Set([...state.sel, ...ids])];
  // A selection never mixes a layer with one of its own ancestors.
  sel = sel.filter((id) => !ancestors(state.doc.nodes, id).some((a) => sel.includes(a)));
  if (state.editing && !sel.includes(state.editing)) stopEditing();
  const page = sel.length ? pageOf(state.doc.nodes, sel[0]) : state.page;
  if (
    sel.length === state.sel.length &&
    sel.every((s, i) => s === state.sel[i]) &&
    page === state.page
  )
    return;
  set({ sel, page, expanded: revealed(sel) });
}

export function toggleExpanded(id: string, all = false) {
  const open = !state.expanded[id];
  const expanded = { ...state.expanded, [id]: open };
  if (all) {
    const walk = (c: string) => {
      const n = state.doc.nodes[c];
      if (!n?.children.length) return;
      expanded[c] = open;
      n.children.forEach(walk);
    };
    walk(id);
  }
  set({ expanded });
}

/** Esc and Shift+Enter: up to the parent. */
export function selectParent() {
  const N = state.doc.nodes;
  const parents = [
    ...new Set(state.sel.map((id) => N[id]?.parent).filter((p) => p && N[p]?.type !== 'page')),
  ];
  select(parents);
}

/** Enter: down into the children. */
export function selectChildren() {
  const N = state.doc.nodes;
  const kids = state.sel.flatMap((id) => N[id]?.children ?? []).filter((c) => N[c].visible);
  if (kids.length) select(kids);
}

/** Tab and Shift+Tab: the next sibling, in layer order. */
export function selectSibling(dir: 1 | -1) {
  const N = state.doc.nodes;
  const id = state.sel[state.sel.length - 1];
  if (!id) {
    const first = N[state.page].children[0];
    if (first) select([first]);
    return;
  }
  const sibs = N[N[id].parent].children;
  const i = sibs.indexOf(id);
  select([sibs[(i + dir + sibs.length) % sibs.length]]);
}

export function selectAll() {
  const N = state.doc.nodes;
  const id = state.sel[0];
  const parent = id ? N[id].parent : state.page;
  select(N[parent].children.filter((c) => N[c].visible && !N[c].locked));
}

/* ------------------------------------------------------------------ guards */

/** Layers inside an instance mirror the main: they can be restyled, not moved or removed. */
export function locked(ids: string[], verb: string) {
  const N = state.doc.nodes;
  if (ids.some((id) => inInstance(N, id))) {
    toast(`Can’t ${verb} layers inside an instance. Edit the main component, or hide the layer.`);
    return true;
  }
  return false;
}

/** Whether a change to these keys is allowed on a layer (inside an instance only some are). */
export function canEdit(id: string, keys: string[]) {
  const N = state.doc.nodes;
  if (!inInstance(N, id)) return true;
  return keys.every((k) => OVERRIDABLE.has(k));
}

/** Writes properties to layers, recording overrides inside instances. */
export function patchNodes(
  d: Draft,
  ids: string[],
  patch: Partial<Node> | ((n: Node) => Partial<Node>),
) {
  for (const id of ids) {
    const n = d.get(id);
    if (!n) continue;
    const p = typeof patch === 'function' ? patch(n) : patch;
    if (!canEdit(id, Object.keys(p))) continue;
    if (n.ref) override(d, id, p);
    else d.set(id, p);
  }
}

/* ------------------------------------------------------------------ editing */

export function remove() {
  const N = state.doc.nodes;
  const ids = outermost(N, state.sel);
  if (!ids.length || locked(ids, 'delete')) return;
  const parent = N[ids[0]].parent;
  edit(
    (d) => {
      for (const id of ids) {
        // Instances of a removed main keep their layers, detached.
        if (d.get(id)?.comp || d.get(id)?.set) {
          const mains = d.get(id).set ? d.get(id).children : [id];
          for (const m of mains)
            for (const inst of instancesOf(d.nodes, m)) detachInstance(d, inst);
        }
        removeTree(d, id);
      }
    },
    N[parent]?.type === 'page' ? [] : [parent].filter((p) => !ids.includes(p)),
  );
}

/** ⌘D: copies beside the original, or the next item in an auto layout. A main gives an instance. */
export function duplicate() {
  const N = state.doc.nodes;
  const ids = outermost(N, state.sel);
  if (!ids.length || locked(ids, 'duplicate')) return;
  const made: string[] = [];
  edit((d) => {
    for (const id of ids) {
      const n = d.get(id);
      const p = d.get(n.parent);
      const at = p.children.indexOf(id) + 1;
      const copy = n.comp ? instantiate(d, id, n.parent, at) : cloneTree(d, id, n.parent, at);
      const top = p.type === 'page';
      if (n.comp) d.set(copy, { sw: n.sw, sh: n.sh });
      if (!p.layout || n.abs)
        d.set(copy, top ? { x: n.x + n.w + 80, y: n.y } : { x: n.x + 10, y: n.y + 10 });
      if (top && !n.comp) d.set(copy, { name: n.name });
      made.push(copy);
    }
  });
  select(made);
}

let clipboard: { doc: Doc; ids: string[] } | null = null;

export function copy() {
  const ids = outermost(state.doc.nodes, state.sel);
  if (!ids.length) return;
  clipboard = { doc: state.doc, ids };
  toast(ids.length === 1 ? 'Copied' : `Copied ${ids.length} layers`);
}

export function cut() {
  if (locked(state.sel, 'cut')) return;
  copy();
  remove();
}

/** ⌘V: into the selected frame if there is one, else onto the page; mains paste as instances. */
export function paste() {
  if (!clipboard) return toast('Nothing to paste');
  const N = state.doc.nodes;
  const target =
    state.sel.length === 1 &&
    N[state.sel[0]]?.type === 'frame' &&
    !inInstance(N, state.sel[0]) &&
    !N[state.sel[0]].ref
      ? state.sel[0]
      : state.page;
  const made: string[] = [];
  const src = clipboard;
  edit((d) => {
    for (const id of src.ids) {
      if (!d.get(id)) continue;
      const n = d.get(id);
      const copy = n.comp ? instantiate(d, id, target) : cloneTree(d, id, target);
      if (d.get(target).type === 'page') d.set(copy, { x: n.x + 40, y: n.y + 40 });
      else if (!d.get(target).layout) d.set(copy, { x: 20, y: 20 });
      made.push(copy);
    }
  });
  select(made);
}

/** Arrow keys: nudge by a pixel (ten with Shift); inside an auto layout, move through the order. */
export function nudge(dx: number, dy: number) {
  const N = state.doc.nodes;
  const ids = outermost(N, state.sel);
  if (!ids.length || locked(ids, 'move')) return;
  const p = N[N[ids[0]].parent];
  if (ids.length === 1 && p.layout && !N[ids[0]].abs) {
    const along = p.layout.dir === 'h' ? dx : dy;
    if (!along) return;
    const i = p.children.indexOf(ids[0]);
    edit((d) => insert(d, p.id, ids[0], i + Math.sign(along)));
    return;
  }
  edit((d) => {
    for (const id of ids) {
      const n = d.get(id);
      const [lx, ly] = applyV(inv(worldMat(d.nodes, n.parent)), dx, dy);
      d.set(id, { x: Math.round((n.x + lx) * 100) / 100, y: Math.round((n.y + ly) * 100) / 100 });
    }
  });
}

/** ⌘] and ⌘[: forward and back in the stack (to the front or back with Shift). */
export function reorder(dir: 1 | -1, all = false) {
  const N = state.doc.nodes;
  const ids = outermost(N, state.sel);
  if (!ids.length || locked(ids, 'reorder')) return;
  edit((d) => {
    for (const id of dir > 0 ? [...ids].reverse() : ids) {
      const p = d.get(d.get(id).parent);
      const i = p.children.indexOf(id);
      insert(d, p.id, id, all ? (dir > 0 ? p.children.length : 0) : i + dir);
    }
  });
}

export function toggle(key: 'visible' | 'locked', ids = state.sel) {
  const N = state.doc.nodes;
  if (!ids.length) return;
  if (key === 'locked' && locked(ids, 'lock')) return;
  const to = !ids.every((id) => N[id]?.[key]);
  edit((d) =>
    patchNodes(d, ids, { [key]: key === 'visible' ? !ids.every((id) => N[id]?.visible) : to }),
  );
}

export function rename(id: string, name: string) {
  const t = name.trim();
  if (!t) return;
  edit((d) => patchNodes(d, [id], { name: t, named: true }));
}

/** Writes a property to every selected layer, as one step or as part of a gesture. */
export function update(
  patch: Partial<Node> | ((n: Node) => Partial<Node>),
  live = false,
  ids = state.sel,
) {
  const run = (d: Draft) => patchNodes(d, ids, patch);
  if (live) preview(run);
  else edit(run);
}

/* ------------------------------------------------------------------ layout commands */

/** Shift+A: auto layout on a frame, or a new auto layout frame around the selection. */
export function addAutoLayout() {
  const N = state.doc.nodes;
  const ids = outermost(N, state.sel);
  if (!ids.length || locked(ids, 'wrap')) return;
  const one = ids.length === 1 ? N[ids[0]] : null;
  if (one && one.type === 'frame' && !one.layout && !one.ref) {
    const kids = one.children.map((c) => N[c]).filter((k) => k.visible);
    const xs = kids.map((k) => k.x),
      ys = kids.map((k) => k.y);
    const spreadX = xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      spreadY = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    const dir = spreadX > spreadY ? 'h' : 'v';
    edit((d) => {
      // Order the children as they read on the canvas.
      const sorted = [...one.children].sort((a, b) =>
        dir === 'h' ? N[a].x - N[b].x : N[a].y - N[b].y,
      );
      d.set(one.id, {
        children: sorted,
        layout: { dir, gap: 10, pad: [10, 10, 10, 10], align: 'start', justify: 'start' },
        sw: 'hug',
        sh: 'hug',
      });
    });
    return toast('Auto layout added');
  }
  if (one?.layout) return frameSelection(true);
  frameSelection(true);
}

/** ⌘⌥G: a frame around the selection (with auto layout from Shift+A). */
export function frameSelection(auto = false) {
  const N = state.doc.nodes;
  const ids = outermost(N, state.sel);
  if (!ids.length || locked(ids, 'wrap')) return;
  const parent = N[ids[0]].parent;
  if (ids.some((id) => N[id].parent !== parent)) return toast('Select layers with the same parent');
  const boxes = ids.map((id) => worldBox(N, id));
  const box = union(boxes) as Box;
  let made = '';
  edit((d) => {
    const p = d.get(parent);
    const at = Math.min(...ids.map((id) => p.children.indexOf(id)));
    made = d.newId();
    const dir = box.w > box.h ? 'h' : 'v';
    const sorted = [...ids].sort((a, b) => (dir === 'h' ? N[a].x - N[b].x : N[a].y - N[b].y));
    d.put(
      blank(made, 'frame', auto ? 'Auto layout' : 'Frame', {
        parent,
        fill: auto ? null : { color: '#FFFFFF', opacity: 1 },
      }),
    );
    insert(d, parent, made, at);
    const [px, py] = apply(inv(worldMat(d.nodes, parent)), box.x, box.y);
    d.set(made, {
      x: Math.round(px),
      y: Math.round(py),
      w: Math.round(box.w),
      h: Math.round(box.h),
    });
    for (const id of sorted) reparent(d, id, made);
    if (auto) {
      const gaps = sorted
        .slice(1)
        .map((id, i) =>
          dir === 'h'
            ? N[id].x - (N[sorted[i]].x + N[sorted[i]].w)
            : N[id].y - (N[sorted[i]].y + N[sorted[i]].h),
        );
      const gap = Math.max(
        0,
        Math.round(gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 10),
      );
      d.set(made, {
        layout: { dir, gap, pad: [0, 0, 0, 0], align: 'start', justify: 'start' },
        sw: 'hug',
        sh: 'hug',
      });
      if (p.layout) d.set(made, { x: 0, y: 0 });
    }
  });
  select([made]);
}

export function setLayout(patch: Partial<AutoLayout> | null, live = false) {
  update(
    (n) =>
      patch === null
        ? { layout: null, sw: n.sw === 'hug' ? 'fixed' : n.sw, sh: n.sh === 'hug' ? 'fixed' : n.sh }
        : {
            layout: {
              ...(n.layout ?? {
                dir: 'v',
                gap: 10,
                pad: [10, 10, 10, 10],
                align: 'start',
                justify: 'start',
              }),
              ...patch,
            },
          },
    live,
  );
}

export function setFont(patch: Partial<Font>, live = false) {
  update(
    (n) =>
      n.font
        ? {
            font: {
              ...n.font,
              ...patch,
              ...(('size' in patch ||
                'weight' in patch ||
                'family' in patch ||
                'line' in patch ||
                'tracking' in patch) &&
              !('style' in patch)
                ? { style: undefined }
                : {}),
            },
          }
        : {},
    live,
  );
  if (patch.family || patch.weight) {
    const n = state.doc.nodes[state.sel[0]];
    if (n?.font) void loadFamily(n.font.family, n.font.weight);
  }
}

/** Aligns the selection to itself, or a single layer to its parent. */
export function alignTo(edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
  const N = state.doc.nodes;
  const ids = outermost(N, state.sel);
  if (!ids.length || locked(ids, 'move')) return;
  const single = ids.length === 1;
  const p = N[N[ids[0]].parent];
  if (single && (p.type === 'page' || (p.layout && !N[ids[0]].abs))) return;
  const ref = single ? worldBox(N, p.id) : (union(ids.map((id) => worldBox(N, id))) as Box);
  edit((d) => {
    for (const id of ids) {
      const b = worldBox(d.nodes, id);
      let dx = 0,
        dy = 0;
      if (edge === 'left') dx = ref.x - b.x;
      if (edge === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
      if (edge === 'right') dx = ref.x + ref.w - (b.x + b.w);
      if (edge === 'top') dy = ref.y - b.y;
      if (edge === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
      if (edge === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      const n = d.get(id);
      const [lx, ly] = applyV(inv(worldMat(d.nodes, n.parent)), dx, dy);
      d.set(id, { x: Math.round(n.x + lx), y: Math.round(n.y + ly) });
    }
  });
}

/* ------------------------------------------------------------------ components */

/** ⌘⌥K: turns a frame into a main component. */
export function createComponent() {
  const N = state.doc.nodes;
  const ids = outermost(N, state.sel);
  if (ids.length !== 1 || locked(ids, 'convert')) return;
  const n = N[ids[0]];
  if (n.comp) return toast('Already a component');
  if (n.ref) return toast('Detach the instance first');
  if (mainOf(N, n.id)) return toast('Components can’t be nested inside a main component this way');
  edit((d) => {
    if (n.type !== 'frame') {
      // Wrap a shape in a frame first, as the real tool does.
      const f = d.newId();
      d.put(
        blank(f, 'frame', n.name, {
          parent: n.parent,
          x: n.x,
          y: n.y,
          w: n.w,
          h: n.h,
          comp: { props: {} },
        }),
      );
      insert(d, n.parent, f, d.get(n.parent).children.indexOf(n.id));
      reparent(d, n.id, f);
      d.set(n.id, { x: 0, y: 0 });
    } else d.set(n.id, { comp: { props: {} } });
  });
  toast('Component created');
}

export function swapVariant(id: string, main: string) {
  edit((d) => swap(d, id, main));
}

export function resetInstance(id: string) {
  edit((d) => resetOverrides(d, id));
  toast('Overrides reset');
}

export function detachInstanceAt(id: string) {
  edit((d) => detachInstance(d, id));
  toast('Instance detached');
}

export function goToMain(id: string) {
  const N = state.doc.nodes;
  const main = N[id]?.main;
  if (!main || !N[main]) return;
  set({ page: pageOf(N, main) });
  select([main]);
  focusRequest = { ids: [main], n: ++focusN };
  emit();
}

/** Drops an instance of a component into the page or the selected frame. */
export function insertInstance(main: string, at?: { x: number; y: number }) {
  const N = state.doc.nodes;
  const target =
    state.sel.length === 1 &&
    N[state.sel[0]]?.type === 'frame' &&
    !N[state.sel[0]].ref &&
    !isAncestor(N, state.sel[0], main) &&
    state.sel[0] !== main &&
    !mainOf(N, state.sel[0])
      ? state.sel[0]
      : state.page;
  let made = '';
  edit((d) => {
    made = instantiate(d, main, target);
    const m = d.get(main);
    d.set(made, { sw: m.sw === 'fill' ? 'fixed' : m.sw, sh: m.sh === 'fill' ? 'fixed' : m.sh });
    if (d.get(target).type === 'page' && at)
      d.set(made, { x: Math.round(at.x - m.w / 2), y: Math.round(at.y - m.h / 2) });
    else if (!d.get(target).layout) d.set(made, { x: 20, y: 20 });
  });
  select([made]);
  focusRequest = { ids: [made], n: ++focusN };
  emit();
}

/* ------------------------------------------------------------------ prototype */

export function setLink(id: string, link: Link | null) {
  edit((d) => patchNodes(d, [id], { link }));
}

export function setFlow(id: string, flow: string | undefined) {
  edit((d) => d.set(id, { flow }));
}

/** Which page holds the flows: the current one if it has any, else the Prototype page. */
export function flowPage() {
  const N = state.doc.nodes;
  const has = (p: string) => N[p].children.some((c) => N[c].flow);
  return has(state.page) ? state.page : refs.pages.prototype;
}

export function play(start?: string) {
  const N = state.doc.nodes;
  stopEditing();
  const page = flowPage();
  let s = start;
  if (!s) {
    // Start from the selected screen when there is one, else from the first flow.
    const top = state.sel[0] ? N[state.sel[0]] && topFrame(state.sel[0]) : null;
    if (top && pageOf(N, top) === page) s = top;
    else if (top && page === refs.pages.prototype) {
      const match = N[page].children.find((c) => N[c].ref === top);
      if (match) s = match;
    }
    // Phones start on the mobile flow.
    const narrow = typeof window !== 'undefined' && window.innerWidth < 768;
    s ??=
      N[page].children.find((c) => N[c].flow && (!narrow || N[c].w < 600)) ??
      N[page].children.find((c) => N[c].flow);
  }
  if (s) set({ play: { start: s } });
}

function topFrame(id: string) {
  const N = state.doc.nodes;
  let n = N[id];
  while (n && !isTop(N, n.id)) n = N[n.parent];
  return n?.id ?? null;
}

/* ------------------------------------------------------------------ styles */

export function setColorStyle(id: string, color: string, live = false) {
  const run = (d: Draft) => {
    d.colors = d.colors.map((c) => (c.id === id ? { ...c, color } : c));
    for (const nid in d.nodes) {
      const n = d.nodes[nid];
      if (n.fill?.style === id && !(n.ref && n.ov?.includes('fill')))
        d.set(nid, { fill: { ...n.fill, color } });
      if (n.stroke?.style === id && !(n.ref && n.ov?.includes('stroke')))
        d.set(nid, { stroke: { ...n.stroke, color } });
    }
  };
  if (live) preview(run);
  else edit(run);
}

export function setTextStyle(id: string, patch: Partial<Font>, live = false) {
  const run = (d: Draft) => {
    d.texts = d.texts.map((t) => (t.id === id ? { ...t, font: { ...t.font, ...patch } } : t));
    const font = d.texts.find((t) => t.id === id)?.font;
    for (const nid in d.nodes) {
      const n = d.nodes[nid];
      if (n.font?.style === id && font && !(n.ref && n.ov?.includes('font')))
        d.set(nid, { font: { ...n.font, ...font } });
    }
    layoutAll(d);
  };
  if (live) preview(run);
  else edit(run);
}

/* ------------------------------------------------------------------ creating */

const DEFAULT_FILL = { color: '#D9D9D9', opacity: 1 };

/** Where a new layer goes: the deepest frame under the point that can take children. */
export function dropTarget(
  doc: Doc,
  page: string,
  wx: number,
  wy: number,
  exclude: Set<string> = new Set(),
) {
  const N = doc.nodes;
  let found = page;
  const walk = (id: string) => {
    const n = N[id];
    for (let i = n.children.length - 1; i >= 0; i--) {
      const c = N[n.children[i]];
      if (c.type !== 'frame' || !c.visible || c.locked || exclude.has(c.id) || c.ref || c.set)
        continue;
      const [lx, ly] = apply(inv(worldMat(N, c.id)), wx, wy);
      if (lx >= 0 && ly >= 0 && lx <= c.w && ly <= c.h) {
        found = c.id;
        walk(c.id);
        return;
      }
    }
  };
  walk(page);
  return found;
}

export function newNode(d: Draft, type: NodeType, parent: string, wx: number, wy: number): string {
  const id = d.newId();
  const label =
    type === 'frame'
      ? 'Frame'
      : type === 'rect'
        ? 'Rectangle'
        : type === 'ellipse'
          ? 'Ellipse'
          : 'Text';
  // Numbered after the highest of its kind already in the file, as the real tool names them.
  const re = new RegExp(`^${label} (\\d+)$`);
  let n = 0;
  for (const k in d.nodes) {
    const m = re.exec(d.nodes[k].name);
    if (m) n = Math.max(n, Number(m[1]));
  }
  const [lx, ly] = apply(inv(worldMat(d.nodes, parent)), wx, wy);
  const base: Partial<Node> = { parent, x: Math.round(lx), y: Math.round(ly), w: 0, h: 0 };
  if (type === 'frame') Object.assign(base, { fill: { color: '#FFFFFF', opacity: 1 }, clip: true });
  if (type === 'rect' || type === 'ellipse') Object.assign(base, { fill: DEFAULT_FILL });
  if (type === 'text')
    Object.assign(base, {
      text: '',
      font: { family: 'inter', size: 16, weight: 400, line: 0, tracking: 0, align: 'left' },
      fill: { color: '#151513', opacity: 1 },
      sw: 'hug',
      sh: 'hug',
      h: 19,
    });
  d.put(blank(id, type, type === 'text' ? 'Text' : `${label} ${n + 1}`, base));
  insert(d, parent, id);
  return id;
}

/* ------------------------------------------------------------------ text editing */

export function startEditing(id: string) {
  const n = state.doc.nodes[id];
  if (!n || n.type !== 'text') return;
  if (!canEdit(id, ['text'])) return;
  beginGesture();
  set({ editing: id, sel: [id], tool: 'move' });
}

export function typeText(text: string) {
  const id = state.editing;
  if (!id) return;
  preview((d) => {
    const n = d.get(id);
    patchNodes(d, [id], {
      text,
      ...(n.named || n.ref ? {} : { name: text.slice(0, 48) || 'Text' }),
    });
  });
}

export function stopEditing() {
  const id = state.editing;
  if (!id) return;
  const n = state.doc.nodes[id];
  set({ editing: null });
  if (n && !n.text?.trim() && !n.ref) {
    // An empty new text layer is thrown away, as in the real tool.
    const d = new Draft(state.doc);
    removeTree(d, id);
    set({ doc: finish(d), sel: [] });
  }
  endGesture();
}

/* ------------------------------------------------------------------ moving between parents */

/** Moves layers into a parent at an index (from the layers panel), keeping their place on canvas. */
export function moveInto(ids: string[], parent: string, index: number) {
  const N = state.doc.nodes;
  const list = outermost(N, ids);
  if (!list.length || locked(list, 'move')) return;
  if (list.some((id) => id === parent || isAncestor(N, id, parent))) return;
  if (N[parent].ref || (N[parent].type !== 'frame' && N[parent].type !== 'page'))
    return toast('Layers can only go into frames');
  if (wouldCycle(N, list, parent))
    return toast('An instance can’t go inside its own main component');
  edit((d) => {
    let at = index;
    for (const id of list) {
      const n = d.get(id);
      if (n.parent === parent && d.get(parent).children.indexOf(id) < at) at--;
      reparent(d, id, parent, at);
      if (d.get(parent).layout) d.set(id, { rot: 0 });
      if (d.get(parent).type === 'page' && d.get(id).sw === 'fill') d.set(id, { sw: 'fixed' });
      at++;
    }
  });
}

export function wouldCycle(N: Record<string, Node>, ids: string[], parent: string) {
  const chain = new Set([parent, ...ancestors(N, parent)]);
  const check = (id: string): boolean =>
    (N[id].main && chain.has(N[id].main as string)) || N[id].children.some(check);
  return ids.some(check);
}

/* ------------------------------------------------------------------ the camera, asked for by the panels */

let focusN = 0;
let focusRequest: { ids: string[]; n: number } | null = null;

/** Panels ask the canvas to bring layers into view; the canvas polls this when the state changes. */
export const takeFocus = () => {
  const r = focusRequest;
  focusRequest = null;
  return r;
};

export function focusOn(ids: string[]) {
  focusRequest = { ids, n: ++focusN };
  emit();
}

/* ------------------------------------------------------------------ comments */

let replyN = 0;

export function reply(thread: string, body: string) {
  const t = body.trim();
  if (!t) return;
  set({
    threads: state.threads.map((th) =>
      th.id === thread
        ? { ...th, replies: [...th.replies, { id: `r${++replyN}`, who: 'you', body: t }] }
        : th,
    ),
  });
}

export function addThread(at: string, fx: number, fy: number) {
  const id = `t${++replyN}`;
  set({
    threads: [...state.threads, { id, at, fx, fy, replies: [], resolved: false }],
    open: id,
    tool: 'move',
  });
}

export function resolveThread(id: string) {
  set({
    threads: state.threads.map((t) => (t.id === id ? { ...t, resolved: !t.resolved } : t)),
    open: null,
  });
}

export function dropEmptyThread(id: string) {
  const t = state.threads.find((th) => th.id === id);
  if (t && !t.replies.length) set({ threads: state.threads.filter((th) => th.id !== id) });
}
