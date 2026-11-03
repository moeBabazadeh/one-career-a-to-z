// Picking and snapping on the canvas: which layer is under the pointer (and which one a click
// should select, by the design-tool rules), where a dragged layer would land in an auto layout,
// and the edge and centre snaps that smart guides draw.

import { apply, inv, worldBox, worldMat, type Box, type Doc, type Node } from './model';

/** The layers under a point, outermost first: [top-level frame, …, deepest]. */
export function hitPath(doc: Doc, page: string, wx: number, wy: number): string[] {
  const N = doc.nodes;
  const walk = (id: string, pm: ReturnType<typeof worldMat>): string[] | null => {
    const n = N[id];
    if (!n.visible || n.locked) return null;
    const m = worldMatFrom(pm, n);
    const [lx, ly] = apply(inv(m), wx, wy);
    let inside = lx >= 0 && ly >= 0 && lx <= n.w && ly <= n.h;
    if (inside && n.type === 'ellipse')
      inside = ((lx - n.w / 2) / (n.w / 2)) ** 2 + ((ly - n.h / 2) / (n.h / 2)) ** 2 <= 1;
    if (n.clip && !inside) return null;
    for (let i = n.children.length - 1; i >= 0; i--) {
      const p = walk(n.children[i], m);
      if (p) return [id, ...p];
    }
    return inside ? [id] : null;
  };
  const kids = N[page].children;
  for (let i = kids.length - 1; i >= 0; i--) {
    const p = walk(kids[i], [1, 0, 0, 1, 0, 0]);
    if (p) return p;
  }
  return [];
}

function worldMatFrom(pm: [number, number, number, number, number, number], n: Node) {
  if (!n.rot)
    return [
      pm[0],
      pm[1],
      pm[2],
      pm[3],
      pm[0] * n.x + pm[2] * n.y + pm[4],
      pm[1] * n.x + pm[3] * n.y + pm[5],
    ] as typeof pm;
  const r = (n.rot * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  const cx = n.w / 2,
    cy = n.h / 2;
  const l = [c, s, -s, c, n.x + cx - (c * cx - s * cy), n.y + cy - (s * cx + c * cy)];
  return [
    pm[0] * l[0] + pm[2] * l[1],
    pm[1] * l[0] + pm[3] * l[1],
    pm[0] * l[2] + pm[2] * l[3],
    pm[1] * l[2] + pm[3] * l[3],
    pm[0] * l[4] + pm[2] * l[5] + pm[4],
    pm[1] * l[4] + pm[3] * l[5] + pm[5],
  ] as typeof pm;
}

/**
 * Which layer a click selects. A click picks the layer just inside the top-level frame; once
 * something is selected, a click picks at that level (its siblings), a click inside the selection
 * keeps it, and ⌘ picks the deepest layer.
 */
export function resolveClick(
  doc: Doc,
  path: string[],
  sel: string[],
  deep: boolean,
): string | null {
  if (!path.length) return null;
  if (deep) return path[path.length - 1];
  for (const s of sel) if (path.includes(s)) return s;
  const N = doc.nodes;
  for (const s of sel) {
    const i = path.indexOf(N[s]?.parent);
    if (i >= 0 && i + 1 < path.length) return path[i + 1];
  }
  if (path.length > 1) return path[1];
  return N[path[0]].children.length ? null : path[0];
}

/** Double-click goes one level deeper than the selection along the path. */
export function deeper(path: string[], sel: string[]): string | null {
  for (const s of sel) {
    const i = path.indexOf(s);
    if (i >= 0 && i + 1 < path.length) return path[i + 1];
  }
  return null;
}

/* ------------------------------------------------------------------ auto layout drops */

/** The index a layer dropped at a point would take among a frame's children. */
export function flowIndex(doc: Doc, parent: string, wx: number, wy: number, moving: Set<string>) {
  const N = doc.nodes;
  const p = N[parent];
  const L = p.layout;
  if (!L) return p.children.length;
  const [lx, ly] = apply(inv(worldMat(N, parent)), wx, wy);
  const kids = p.children.filter((c) => !moving.has(c) && N[c].visible && !N[c].abs);
  for (const c of kids) {
    const k = N[c];
    if (L.wrap) {
      if (ly < k.y || (ly < k.y + k.h && lx < k.x + k.w / 2)) return p.children.indexOf(c);
    } else if (L.dir === 'h' ? lx < k.x + k.w / 2 : ly < k.y + k.h / 2)
      return p.children.indexOf(c);
  }
  return p.children.length;
}

/** The line between two items where a drop would land, in the parent's local space. */
export function insertionLine(
  doc: Doc,
  parent: string,
  index: number,
  moving: Set<string>,
): [number, number, number, number] | null {
  const N = doc.nodes;
  const p = N[parent];
  const L = p.layout;
  if (!L) return null;
  const kids = p.children.filter((c) => !moving.has(c) && N[c].visible && !N[c].abs);
  const before = kids.filter((c) => p.children.indexOf(c) < index);
  const prev = before.length ? N[before[before.length - 1]] : null;
  const next = kids.find((c) => p.children.indexOf(c) >= index);
  const nx = next ? N[next] : null;
  const [pt, pr, pb, pl] = L.pad;
  if (L.dir === 'h' && !L.wrap) {
    const x =
      prev && nx
        ? (prev.x + prev.w + nx.x) / 2
        : prev
          ? prev.x + prev.w + Math.min(L.gap, 8) / 2
          : nx
            ? nx.x - Math.min(L.gap, 8) / 2
            : pl;
    return [x, pt, x, p.h - pb];
  }
  if (L.wrap) {
    const ref = nx ?? prev;
    if (!ref) return [pl, pt, pl, p.h - pb];
    const x = nx ? nx.x - L.gap / 2 : ref.x + ref.w + L.gap / 2;
    return [x, ref.y, x, ref.y + ref.h];
  }
  const y =
    prev && nx
      ? (prev.y + prev.h + nx.y) / 2
      : prev
        ? prev.y + prev.h + Math.min(L.gap, 8) / 2
        : nx
          ? nx.y - Math.min(L.gap, 8) / 2
          : pt;
  return [pl, y, p.w - pr, y];
}

/* ------------------------------------------------------------------ smart guides */

export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** Snaps a moving box to the edges and centres of others. Returns the correction and the guides. */
export function snapBox(
  moving: Box,
  others: Box[],
  threshold: number,
  axes: { x: boolean; y: boolean } = { x: true, y: true },
) {
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  let bestX: { d: number; at: number } | null = null;
  let bestY: { d: number; at: number } | null = null;
  for (const o of others) {
    const ox = [o.x, o.x + o.w / 2, o.x + o.w];
    const oy = [o.y, o.y + o.h / 2, o.y + o.h];
    if (axes.x)
      for (const a of mx)
        for (const b of ox) {
          const dd = b - a;
          if (Math.abs(dd) <= threshold && (!bestX || Math.abs(dd) < Math.abs(bestX.d)))
            bestX = { d: dd, at: b };
        }
    if (axes.y)
      for (const a of my)
        for (const b of oy) {
          const dd = b - a;
          if (Math.abs(dd) <= threshold && (!bestY || Math.abs(dd) < Math.abs(bestY.d)))
            bestY = { d: dd, at: b };
        }
  }
  const dx = bestX?.d ?? 0,
    dy = bestY?.d ?? 0;
  const m = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h };
  const guides: Guide[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  if (bestX) {
    const at = bestX.at;
    const hits = others.filter((o) => [o.x, o.x + o.w / 2, o.x + o.w].some((v) => near(v, at)));
    const ys = [m.y, m.y + m.h, ...hits.flatMap((o) => [o.y, o.y + o.h])];
    guides.push({ axis: 'x', at, from: Math.min(...ys), to: Math.max(...ys) });
  }
  if (bestY) {
    const at = bestY.at;
    const hits = others.filter((o) => [o.y, o.y + o.h / 2, o.y + o.h].some((v) => near(v, at)));
    const xs = [m.x, m.x + m.w, ...hits.flatMap((o) => [o.x, o.x + o.w])];
    guides.push({ axis: 'y', at, from: Math.min(...xs), to: Math.max(...xs) });
  }
  return { dx, dy, guides };
}

/** Snaps single values (a resized edge) to the nearest edge or centre among others. */
export function snapValue(v: number, axis: 'x' | 'y', others: Box[], threshold: number) {
  let best: number | null = null;
  for (const o of others) {
    const vals = axis === 'x' ? [o.x, o.x + o.w / 2, o.x + o.w] : [o.y, o.y + o.h / 2, o.y + o.h];
    for (const b of vals)
      if (Math.abs(b - v) <= threshold && (best === null || Math.abs(b - v) < Math.abs(best - v)))
        best = b;
  }
  return best;
}

/** The boxes a layer can snap to: its visible siblings and its parent. */
export function snapTargets(doc: Doc, parent: string, exclude: Set<string>): Box[] {
  const N = doc.nodes;
  const p = N[parent];
  const out = p.children.filter((c) => !exclude.has(c) && N[c].visible).map((c) => worldBox(N, c));
  if (p.type !== 'page') out.push(worldBox(N, parent));
  return out;
}

/* ------------------------------------------------------------------ measuring */

export interface Measure {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  v: number;
}

/** Distances from one box to another (Alt held): gaps between them, or to the edges of a container. */
export function measure(a: Box, b: Box): Measure[] {
  const out: Measure[] = [];
  const contains = b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h;
  const cy = a.y + a.h / 2,
    cx = a.x + a.w / 2;
  if (contains) {
    out.push({ x1: b.x, y1: cy, x2: a.x, y2: cy, v: a.x - b.x });
    out.push({ x1: a.x + a.w, y1: cy, x2: b.x + b.w, y2: cy, v: b.x + b.w - (a.x + a.w) });
    out.push({ x1: cx, y1: b.y, x2: cx, y2: a.y, v: a.y - b.y });
    out.push({ x1: cx, y1: a.y + a.h, x2: cx, y2: b.y + b.h, v: b.y + b.h - (a.y + a.h) });
    return out.filter((m) => m.v > 0.01);
  }
  const oy0 = Math.max(a.y, b.y),
    oy1 = Math.min(a.y + a.h, b.y + b.h);
  const ox0 = Math.max(a.x, b.x),
    ox1 = Math.min(a.x + a.w, b.x + b.w);
  const my = oy1 > oy0 ? (oy0 + oy1) / 2 : cy;
  const mx = ox1 > ox0 ? (ox0 + ox1) / 2 : cx;
  if (b.x >= a.x + a.w) out.push({ x1: a.x + a.w, y1: my, x2: b.x, y2: my, v: b.x - (a.x + a.w) });
  else if (b.x + b.w <= a.x)
    out.push({ x1: b.x + b.w, y1: my, x2: a.x, y2: my, v: a.x - (b.x + b.w) });
  if (b.y >= a.y + a.h) out.push({ x1: mx, y1: a.y + a.h, x2: mx, y2: b.y, v: b.y - (a.y + a.h) });
  else if (b.y + b.h <= a.y)
    out.push({ x1: mx, y1: b.y + b.h, x2: mx, y2: a.y, v: a.y - (b.y + b.h) });
  return out;
}
