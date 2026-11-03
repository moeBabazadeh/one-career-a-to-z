// Components. An instance is a live copy of a main component: every layer inside it mirrors a
// layer in the main (`ref`) and takes the main's properties, except the ones changed on the
// instance (`ov`, its overrides). After every edit the instances are brought back in step with
// their mains, innermost components first, so a change to a main reaches every copy.

import { blank, namePath, removeTree, type Draft, type Node } from './model';

/** Properties a layer inside an instance takes from the layer it mirrors. */
const MIRRORED = [
  'type',
  'name',
  'x',
  'y',
  'w',
  'h',
  'rot',
  'visible',
  'opacity',
  'fill',
  'stroke',
  'radius',
  'shadow',
  'clip',
  'layout',
  'sw',
  'sh',
  'abs',
  'text',
  'font',
  'src',
  'main',
  'link',
  'fixed',
  'named',
] as const;

/** The instance itself keeps its own place, size and sizing, and its own interactions. */
const ROOT_OWN = new Set([
  'x',
  'y',
  'rot',
  'sw',
  'sh',
  'abs',
  'name',
  'main',
  'link',
  'fixed',
  'visible',
  'named',
]);

/** What can be changed on a layer inside an instance. */
export const OVERRIDABLE = new Set([
  'text',
  'fill',
  'stroke',
  'visible',
  'font',
  'src',
  'opacity',
  'radius',
  'shadow',
  'link',
  'name',
  'named',
]);

type Key = (typeof MIRRORED)[number];

function copyFrom(d: Draft, id: string, src: Node, root: boolean) {
  const n = d.get(id);
  const ov = n.ov ?? [];
  // Geometry that auto layout decides is left to the layout pass, or every sync would undo it.
  const sizing = root ? n : src;
  const inFlow = !root && !!d.get(src.parent)?.layout && !src.abs;
  const patch: Partial<Node> = {};
  for (const k of MIRRORED) {
    if (root && ROOT_OWN.has(k)) continue;
    if (ov.includes(k)) continue;
    if (inFlow && (k === 'x' || k === 'y')) continue;
    if (k === 'w' && sizing.sw !== 'fixed') continue;
    if (k === 'h' && sizing.sh !== 'fixed') continue;
    if (n[k] !== src[k]) (patch as Record<Key, unknown>)[k] = src[k];
  }
  d.set(id, patch);
}

/** Makes a fresh mirror of a main's layer (and its subtree) under a parent. */
export function mirror(d: Draft, srcId: string, parent: string): string {
  const src = d.get(srcId);
  const id = d.newId();
  const n = blank(id, src.type, src.name, { parent, ref: srcId, ov: [] });
  for (const k of MIRRORED) (n as unknown as Record<string, unknown>)[k] = src[k];
  d.put(n);
  d.set(id, { children: src.children.map((c) => mirror(d, c, id)) });
  return id;
}

function syncChildren(d: Draft, id: string, srcId: string) {
  const n = d.get(id);
  const src = d.get(srcId);
  const byRef = new Map<string, string>();
  for (const c of n.children) {
    const r = d.get(c)?.ref;
    if (r) byRef.set(r, c);
  }
  const next = src.children.map((sc) => {
    const have = byRef.get(sc);
    if (have) {
      byRef.delete(sc);
      copyFrom(d, have, d.get(sc), false);
      syncChildren(d, have, sc);
      return have;
    }
    return mirror(d, sc, id);
  });
  for (const gone of byRef.values()) removeTree(d, gone);
  const cur = d.get(id).children;
  if (cur.length !== next.length || cur.some((c, i) => c !== next[i]))
    d.set(id, { children: next });
}

/** How deeply a main nests other components, so inner ones sync first. */
function depth(
  d: Draft,
  mainId: string,
  memo: Map<string, number>,
  seen = new Set<string>(),
): number {
  const known = memo.get(mainId);
  if (known !== undefined) return known;
  if (seen.has(mainId)) return 0;
  seen.add(mainId);
  let deepest = 0;
  const walk = (id: string) => {
    const n = d.get(id);
    if (!n) return;
    if (n.id !== mainId && n.main) deepest = Math.max(deepest, 1 + depth(d, n.main, memo, seen));
    n.children.forEach(walk);
  };
  walk(mainId);
  memo.set(mainId, deepest);
  return deepest;
}

/** Every instance root in the file. */
export function instanceRoots(d: Draft) {
  const out: string[] = [];
  for (const id in d.nodes) {
    const n = d.nodes[id];
    if (n.main && n.ref === n.main && !d.nodes[n.parent]?.ref) out.push(id);
  }
  return out;
}

/** Brings every instance in step with its main component. */
export function syncAll(d: Draft) {
  const memo = new Map<string, number>();
  const roots = instanceRoots(d)
    .map((id) => ({
      id,
      level: d.get(d.get(id).main as string) ? depth(d, d.get(id).main as string, memo) : -1,
    }))
    .sort((a, b) => a.level - b.level);
  for (const { id, level } of roots) {
    if (level < 0) {
      detachInstance(d, id);
      continue;
    }
    const main = d.get(d.get(id).main as string);
    copyFrom(d, id, main, true);
    syncChildren(d, id, main.id);
  }
}

/** Makes an instance of a main component. */
export function instantiate(d: Draft, mainId: string, parent: string, index?: number): string {
  const main = d.get(mainId);
  const id = d.newId();
  const n = blank(id, 'frame', main.comp?.set ? d.get(main.comp.set).name : main.name, {
    parent,
    main: mainId,
    ref: mainId,
    ov: [],
  });
  for (const k of MIRRORED)
    if (k !== 'name' && k !== 'main') (n as unknown as Record<string, unknown>)[k] = main[k];
  d.put(n);
  const p = d.get(parent);
  if (p) {
    const kids = [...p.children];
    kids.splice(index ?? kids.length, 0, id);
    d.set(parent, { children: kids });
  }
  d.set(id, { children: main.children.map((c) => mirror(d, c, id)) });
  return id;
}

/** Changes properties on a layer and records them as overrides when it's inside an instance. */
export function override(d: Draft, id: string, patch: Partial<Node>) {
  const n = d.get(id);
  d.set(id, patch);
  if (!n.ref) return;
  const keys = Object.keys(patch).filter(
    (k) => n.ref !== n.main || k === 'w' || k === 'h' || !ROOT_OWN.has(k),
  );
  const ov = [...new Set([...(n.ov ?? []), ...keys])];
  if (ov.length !== (n.ov ?? []).length) d.set(id, { ov });
}

/** Overrides by layer path inside an instance, as a variant swap carries them across. */
function collectOverrides(d: Draft, root: string) {
  const out = new Map<string, Partial<Node>>();
  const walk = (id: string) => {
    const n = d.get(id);
    if (id !== root && n.ov?.length) {
      const p: Partial<Node> = {};
      for (const k of n.ov) (p as Record<string, unknown>)[k] = n[k as keyof Node];
      out.set(namePath(d.nodes, root, id), p);
    }
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

function applyOverrides(d: Draft, root: string, ovs: Map<string, Partial<Node>>) {
  const walk = (id: string) => {
    const p = ovs.get(namePath(d.nodes, root, id));
    if (id !== root && p) override(d, id, p);
    d.get(id).children.forEach(walk);
  };
  walk(root);
}

/** Swaps an instance to another variant, keeping overrides on layers with the same names. */
export function swap(d: Draft, id: string, mainId: string) {
  const ovs = collectOverrides(d, id);
  for (const c of d.get(id).children) removeTree(d, c, false);
  const main = d.get(mainId);
  d.set(id, { children: [], main: mainId, ref: mainId });
  copyFrom(d, id, main, true);
  const ov = d.get(id).ov ?? [];
  d.set(id, {
    children: main.children.map((c) => mirror(d, c, id)),
    w: ov.includes('w') ? d.get(id).w : main.w,
    h: main.h,
    ov: ov.filter((k) => k !== 'h'),
  });
  applyOverrides(d, id, ovs);
}

/** Drops every override inside an instance. */
export function resetOverrides(d: Draft, id: string) {
  const walk = (c: string) => {
    if (c !== id) d.set(c, { ov: [] });
    d.get(c).children.forEach(walk);
  };
  walk(id);
  d.set(id, { ov: (d.get(id).ov ?? []).filter((k) => k === 'w') });
}

/** Turns an instance into plain layers. */
export function detachInstance(d: Draft, id: string) {
  const walk = (c: string) => {
    const n = d.get(c);
    const p: Partial<Node> = { ref: undefined, ov: undefined };
    if (c === id || n.ref) p.main = undefined;
    d.set(c, p);
    n.children.forEach(walk);
  };
  walk(id);
}

/** Instances made from a main (or any variant in a set). */
export function instancesOf(nodes: Record<string, Node>, mainId: string) {
  const out: string[] = [];
  for (const id in nodes) if (nodes[id].main === mainId && nodes[id].ref === mainId) out.push(id);
  return out;
}

/** The variants beside a main in its set, with their properties. */
export function variantsOf(nodes: Record<string, Node>, mainId: string) {
  const m = nodes[mainId];
  const set = m?.comp?.set;
  if (!set) return [];
  return nodes[set].children
    .filter((c) => nodes[c]?.comp)
    .map((c) => ({ id: c, props: nodes[c].comp!.props }));
}
