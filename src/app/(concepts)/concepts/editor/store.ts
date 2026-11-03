// The workbench's state as one small external store: layout, editor groups and tabs, the
// working copy of every file (with what's saved and what's committed), the terminals, search and
// the quick input. The server and the hydration pass see the initial state; everything else
// changes in event handlers.

import { useSyncExternalStore } from 'react';
import { carryBlame } from './diff';
import { diagnose, type Diagnostic } from './diagnostics';
import { COMMITS, DIRS, FILE_LIST, FILE_MAP, sha, type Commit } from './repo';
import { langOf } from './syntax';

export type View = 'explorer' | 'search' | 'scm';
export type PanelTab = 'problems' | 'output' | 'terminal';
export type Mode = 'source' | 'preview' | 'shortcuts' | 'diff';
export type MobileView = 'files' | 'editor' | 'search' | 'scm' | 'terminal';

export interface Tab {
  key: string;
  path: string;
  mode: Mode;
  /** An unpinned tab is a preview: italic, and the next file opened replaces it. */
  pinned: boolean;
}

export interface Group {
  id: number;
  tabs: Tab[];
  active: string | null;
}

export interface Cursor {
  line: number;
  col: number;
  /** Characters and lines selected. */
  chars: number;
  lines: number;
}

export interface Reveal {
  path: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  /** Bumped on every request, so the same place can be revealed twice. */
  n: number;
  focus: boolean;
  anchor?: string;
}

export interface Session {
  id: number;
  name: string;
  lines: string[];
  cwd: string;
  history: string[];
  running: boolean;
}

export interface SearchState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
  include: string;
}

export type Picker = 'theme' | null;

export interface State {
  view: View;
  sidebar: boolean;
  sidebarWidth: number;
  panel: boolean;
  panelTab: PanelTab;
  panelHeight: number;
  panelMax: boolean;
  groups: Group[];
  activeGroup: number;
  closed: Tab[];
  buffers: Record<string, string>;
  saved: Record<string, string>;
  head: Record<string, string>;
  blame: Record<string, string[]>;
  /** Bumped when a buffer is replaced from outside the editor (revert, discard). */
  versions: Record<string, number>;
  commits: Commit[];
  expanded: Record<string, boolean>;
  cursor: Record<string, Cursor>;
  focusPath: string | null;
  minimap: boolean;
  wrap: boolean | null;
  blameGutter: boolean;
  lineBlame: boolean;
  breadcrumbs: boolean;
  zen: boolean;
  tabFocus: boolean;
  quick: { value: string; picker: Picker; active: number } | null;
  reveal: Reveal | null;
  mobile: MobileView;
  page: boolean;
  chord: string | null;
  message: { text: string; n: number } | null;
  terminals: Session[];
  activeTerminal: number;
  search: SearchState;
  outline: boolean;
  timeline: boolean;
  recentFiles: string[];
  recentCommands: string[];
  commitMessage: string;
  output: string[];
}

const README = 'README.md';
const tabKey = (path: string, mode: Mode) => `${mode}:${path}`;

const files = Object.fromEntries(FILE_LIST.map((f) => [f.path, f.text]));

export const INITIAL: State = {
  view: 'explorer',
  sidebar: true,
  sidebarWidth: 264,
  panel: true,
  panelTab: 'terminal',
  panelHeight: 300,
  panelMax: false,
  groups: [
    {
      id: 1,
      tabs: [{ key: tabKey(README, 'source'), path: README, mode: 'source', pinned: true }],
      active: tabKey(README, 'source'),
    },
    {
      id: 2,
      tabs: [{ key: tabKey(README, 'preview'), path: README, mode: 'preview', pinned: true }],
      active: tabKey(README, 'preview'),
    },
  ],
  activeGroup: 0,
  closed: [],
  buffers: files,
  saved: files,
  head: files,
  blame: Object.fromEntries(FILE_LIST.map((f) => [f.path, f.blame])),
  versions: {},
  commits: COMMITS,
  expanded: { roles: true },
  cursor: {},
  focusPath: README,
  minimap: true,
  wrap: null,
  blameGutter: false,
  lineBlame: true,
  breadcrumbs: true,
  zen: false,
  tabFocus: false,
  quick: null,
  reveal: null,
  mobile: 'files',
  page: false,
  chord: null,
  message: null,
  terminals: [{ id: 1, name: 'zsh', lines: [], cwd: '', history: [], running: false }],
  activeTerminal: 1,
  search: { query: '', matchCase: false, wholeWord: false, regex: false, include: '' },
  outline: false,
  timeline: false,
  recentFiles: [README],
  recentCommands: [],
  commitMessage: '',
  output: [],
};

let state = INITIAL;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const get = () => state;

export function set(update: Partial<State> | ((s: State) => Partial<State>)) {
  const patch = typeof update === 'function' ? update(state) : update;
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export function useWb<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(INITIAL),
  );
}

/* ------------------------------------------------------------------ the workspace */

/** Every path in the working copy. Files can't be created or deleted here, so it's fixed. */
export const PATHS = FILE_LIST.map((f) => f.path);
export const isFile = (path: string) => path in FILE_MAP;
export const isDir = (path: string) => path === '' || DIRS.has(path);

const diagCache = new WeakMap<Record<string, string>, Record<string, Diagnostic[]>>();

/** Diagnostics for every file, computed once per working copy. */
export function allDiagnostics(buffers: Record<string, string>): Record<string, Diagnostic[]> {
  const hit = diagCache.get(buffers);
  if (hit) return hit;
  const view = {
    kind: (p: string) =>
      isFile(p) ? ('file' as const) : isDir(p.replace(/\/$/, '')) ? ('dir' as const) : null,
    read: (p: string) => buffers[p],
  };
  const out = Object.fromEntries(PATHS.map((p) => [p, diagnose(p, buffers[p], langOf(p), view)]));
  diagCache.set(buffers, out);
  return out;
}

export const UNCOMMITTED = '0000000';

/** The working copy's blame: lines that survived from HEAD keep their commit. */
const blameCache = new Map<string, { text: string; head: string; owners: string[] }>();
export function liveBlame(s: State, path: string): string[] {
  const text = s.buffers[path];
  const head = s.head[path];
  const hit = blameCache.get(path);
  if (hit && hit.text === text && hit.head === head) return hit.owners;
  const owners = text === head ? s.blame[path] : carryBlame(head, s.blame[path], text, UNCOMMITTED);
  blameCache.set(path, { text, head, owners });
  return owners;
}

/** Files whose saved copy differs from HEAD (Source Control's changes), and unsaved ones. */
export const changedPaths = (s: State) => PATHS.filter((p) => s.saved[p] !== s.head[p]);
export const dirtyPaths = (s: State) => PATHS.filter((p) => s.buffers[p] !== s.saved[p]);

/* ------------------------------------------------------------------ messages */

let messageN = 0;
export function flash(text: string) {
  const n = ++messageN;
  set({ message: { text, n } });
  window.setTimeout(() => {
    if (state.message?.n === n) set({ message: null });
  }, 3200);
}

/* ------------------------------------------------------------------ editors */

let revealN = 0;

export interface OpenOptions {
  mode?: Mode;
  /** Open as a preview tab, replaced by the next one. */
  preview?: boolean;
  group?: number;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  focus?: boolean;
  anchor?: string;
}

export function openFile(path: string, o: OpenOptions = {}) {
  if (!isFile(path) && o.mode !== 'shortcuts') return;
  const mode = o.mode ?? 'source';
  set((s) => {
    const gi = Math.min(o.group ?? s.activeGroup, s.groups.length - 1);
    const groups = s.groups.map((g) => ({ ...g, tabs: [...g.tabs] }));
    const g = groups[gi];
    const key = tabKey(path, mode);
    const existing = g.tabs.findIndex((t) => t.key === key);
    if (existing >= 0) {
      if (!o.preview) g.tabs[existing] = { ...g.tabs[existing], pinned: true };
    } else {
      const tab: Tab = { key, path, mode, pinned: !o.preview };
      const previewAt = o.preview ? g.tabs.findIndex((t) => !t.pinned) : -1;
      if (previewAt >= 0) g.tabs[previewAt] = tab;
      else {
        const at = g.tabs.findIndex((t) => t.key === g.active);
        g.tabs.splice(at + 1, 0, tab);
      }
    }
    g.active = key;
    const reveal: Reveal | null =
      o.line !== undefined || o.anchor
        ? {
            path,
            line: o.line ?? 0,
            col: o.col ?? 0,
            endLine: o.endLine ?? o.line ?? 0,
            endCol: o.endCol ?? o.col ?? 0,
            n: ++revealN,
            focus: o.focus ?? true,
            anchor: o.anchor,
          }
        : s.reveal;
    return {
      groups,
      activeGroup: gi,
      reveal,
      mobile: 'editor',
      focusPath: path,
      recentFiles:
        mode === 'shortcuts' || mode === 'diff'
          ? s.recentFiles
          : [path, ...s.recentFiles.filter((p) => p !== path)].slice(0, 12),
      page: false,
    };
  });
}

/** Opens a file in the other group, making one if there is only one. */
export function openToSide(path: string, mode: Mode) {
  const s = get();
  if (s.groups.length === 1) {
    const key = tabKey(path, mode);
    set({
      groups: [
        ...s.groups,
        {
          id: Math.max(...s.groups.map((g) => g.id)) + 1,
          tabs: [{ key, path, mode, pinned: true }],
          active: key,
        },
      ],
      activeGroup: 1,
      focusPath: path,
    });
    return;
  }
  openFile(path, { mode, group: s.activeGroup === 0 ? 1 : 0 });
}

export function activeTab(s: State, gi = s.activeGroup): Tab | null {
  const g = s.groups[gi];
  return g?.tabs.find((t) => t.key === g.active) ?? null;
}

export function activateTab(gi: number, key: string) {
  set((s) => {
    const tab = s.groups[gi].tabs.find((t) => t.key === key);
    return {
      groups: s.groups.map((g, i) => (i === gi ? { ...g, active: key } : g)),
      activeGroup: gi,
      focusPath: tab?.path ?? s.focusPath,
      mobile: 'editor',
    };
  });
}

export function pinTab(gi: number, key: string) {
  set((s) => ({
    groups: s.groups.map((g, i) =>
      i === gi
        ? { ...g, tabs: g.tabs.map((t) => (t.key === key ? { ...t, pinned: true } : t)) }
        : g,
    ),
  }));
}

export function closeTab(gi: number, key: string) {
  set((s) => {
    const g = s.groups[gi];
    if (!g) return {};
    const at = g.tabs.findIndex((t) => t.key === key);
    if (at < 0) return {};
    const tabs = g.tabs.filter((t) => t.key !== key);
    // The neighbour to the right takes focus, the way editors do, else the one to the left.
    const active = g.active === key ? ((tabs[at] ?? tabs[at - 1])?.key ?? null) : g.active;
    let groups = s.groups.map((x, i) => (i === gi ? { ...x, tabs, active } : x));
    let activeGroup = s.activeGroup;
    if (!tabs.length && groups.length > 1) {
      groups = groups.filter((_, i) => i !== gi);
      activeGroup = 0;
    }
    const closed = [g.tabs[at], ...s.closed].slice(0, 20);
    const next = activeTab({ ...s, groups, activeGroup });
    return { groups, activeGroup, closed, focusPath: next?.path ?? null };
  });
}

export function closeAll() {
  set((s) => ({
    groups: [{ ...s.groups[0], tabs: [], active: null }],
    activeGroup: 0,
    closed: [...s.groups.flatMap((g) => g.tabs), ...s.closed].slice(0, 20),
    focusPath: null,
  }));
}

export function closeOthers(gi: number, key: string) {
  set((s) => ({
    groups: s.groups.map((g, i) =>
      i === gi ? { ...g, tabs: g.tabs.filter((t) => t.key === key), active: key } : g,
    ),
  }));
}

export function reopenClosed() {
  const [tab, ...rest] = get().closed;
  if (!tab) return;
  set({ closed: rest });
  openFile(tab.path, { mode: tab.mode });
}

export function cycleTab(dir: 1 | -1) {
  const s = get();
  const g = s.groups[s.activeGroup];
  if (!g?.tabs.length) return;
  const at = g.tabs.findIndex((t) => t.key === g.active);
  const next = g.tabs[(at + dir + g.tabs.length) % g.tabs.length];
  activateTab(s.activeGroup, next.key);
}

export function moveTab(gi: number, from: string, to: string) {
  set((s) => ({
    groups: s.groups.map((g, i) => {
      if (i !== gi) return g;
      const tabs = [...g.tabs];
      const a = tabs.findIndex((t) => t.key === from);
      const b = tabs.findIndex((t) => t.key === to);
      if (a < 0 || b < 0) return g;
      const [tab] = tabs.splice(a, 1);
      tabs.splice(b, 0, tab);
      return { ...g, tabs };
    }),
  }));
}

/* ------------------------------------------------------------------ the working copy */

export function edit(path: string, text: string) {
  set((s) => {
    if (s.buffers[path] === text) return {};
    // Editing a preview tab keeps it.
    const groups = s.groups.some((g) => g.tabs.some((t) => t.path === path && !t.pinned))
      ? s.groups.map((g) => ({
          ...g,
          tabs: g.tabs.map((t) => (t.path === path ? { ...t, pinned: true } : t)),
        }))
      : s.groups;
    return { buffers: { ...s.buffers, [path]: text }, groups };
  });
}

export function save(path: string) {
  set((s) =>
    s.saved[path] === s.buffers[path] ? {} : { saved: { ...s.saved, [path]: s.buffers[path] } },
  );
}

export function saveAll() {
  set((s) => ({ saved: { ...s.buffers } }));
}

const bump = (s: State, paths: string[]) => ({
  ...s.versions,
  ...Object.fromEntries(paths.map((p) => [p, (s.versions[p] ?? 0) + 1])),
});

export function revert(path: string) {
  set((s) => ({ buffers: { ...s.buffers, [path]: s.saved[path] }, versions: bump(s, [path]) }));
}

export function discard(paths: string[]) {
  set((s) => {
    const back = Object.fromEntries(paths.map((p) => [p, s.head[p]]));
    return {
      buffers: { ...s.buffers, ...back },
      saved: { ...s.saved, ...back },
      versions: bump(s, paths),
    };
  });
}

/** Commits the saved changes as the visitor: blame moves to the new commit for changed lines. */
export function commitChanges(message: string): Commit | null {
  const s = get();
  const paths = changedPaths(s);
  const subject = message.trim();
  if (!paths.length || !subject) return null;
  const time = Date.now();
  const hash = sha(`${subject}|${time}`);
  const c: Commit = {
    id: hash.slice(0, 7),
    hash,
    date: null,
    subject,
    author: 'You',
    email: '',
    time,
  };
  const blame = { ...s.blame };
  const head = { ...s.head };
  for (const p of paths) {
    blame[p] = carryBlame(s.head[p], s.blame[p], s.saved[p], c.id);
    head[p] = s.saved[p];
  }
  set({ blame, head, commits: [c, ...s.commits], commitMessage: '' });
  return c;
}

/* ------------------------------------------------------------------ layout */

export function showView(view: View) {
  set({ view, sidebar: true, mobile: view === 'explorer' ? 'files' : view, zen: false });
}

/** The activity bar: clicking the open view hides the side bar. */
export function toggleView(view: View) {
  set((s) =>
    s.sidebar && s.view === view
      ? { sidebar: false }
      : { view, sidebar: true, mobile: view === 'explorer' ? 'files' : view },
  );
}

export const toggleSidebar = () => set((s) => ({ sidebar: !s.sidebar }));
export const togglePanel = () => set((s) => ({ panel: !s.panel, panelMax: false }));

export function showPanel(tab: PanelTab) {
  set({ panel: true, panelTab: tab, mobile: tab === 'terminal' ? 'terminal' : get().mobile });
}

export function toggleTerminal() {
  const s = get();
  if (s.panel && s.panelTab === 'terminal') set({ panel: false });
  else showPanel('terminal');
}

export function revealInExplorer(path: string) {
  const parts = path.split('/');
  set((s) => ({
    expanded: {
      ...s.expanded,
      ...Object.fromEntries(
        parts
          .slice(0, isDir(path) ? parts.length : -1)
          .map((_, i) => [parts.slice(0, i + 1).join('/'), true]),
      ),
    },
    view: 'explorer',
    sidebar: true,
    mobile: 'files',
  }));
}

export function quick(value = '', picker: Picker = null, active = 0) {
  set({ quick: { value, picker, active } });
}

export function quickActive(active: number) {
  set((s) => (s.quick ? { quick: { ...s.quick, active } } : {}));
}

export const closeQuick = () => set({ quick: null });

/* ------------------------------------------------------------------ terminals */

export function termWrite(id: number, ...lines: string[]) {
  set((s) => ({
    terminals: s.terminals.map((t) =>
      t.id === id ? { ...t, lines: [...t.lines, ...lines].slice(-800) } : t,
    ),
  }));
}

export function termUpdate(id: number, patch: Partial<Session>) {
  set((s) => ({ terminals: s.terminals.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function newTerminal() {
  set((s) => {
    const id = Math.max(0, ...s.terminals.map((t) => t.id)) + 1;
    return {
      terminals: [
        ...s.terminals,
        { id, name: 'zsh', lines: [], cwd: '', history: [], running: false },
      ],
      activeTerminal: id,
      panel: true,
      panelTab: 'terminal',
    };
  });
}

export function killTerminal(id: number) {
  set((s) => {
    const terminals = s.terminals.filter((t) => t.id !== id);
    if (!terminals.length)
      return {
        terminals: [{ id: id + 1, name: 'zsh', lines: [], cwd: '', history: [], running: false }],
        activeTerminal: id + 1,
        panel: false,
      };
    return {
      terminals,
      activeTerminal:
        s.activeTerminal === id ? terminals[terminals.length - 1].id : s.activeTerminal,
    };
  });
}
