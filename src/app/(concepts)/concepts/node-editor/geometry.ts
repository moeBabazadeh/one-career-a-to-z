// Canvas geometry for the Flow Editor: ports, wire curves, group frames, zoom-to-fit, and the
// simplified vertical layout used on phones.

import {
  FLOWS,
  nodeH,
  nodeW,
  outputsOf,
  type Flow,
  type FlowNode,
  type Group,
  type Wire,
} from './flows';

export interface Pt {
  x: number;
  y: number;
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export type Positions = Record<string, Record<string, Pt>>;
type Seg = [Pt, Pt, Pt, Pt];

const NODES = new Map(FLOWS.flatMap((f) => f.nodes.map((n) => [`${f.id}:${n.id}`, n] as const)));
export const nodeOf = (flowId: string, id: string) => NODES.get(`${flowId}:${id}`)!;

export const INITIAL: Positions = Object.fromEntries(
  FLOWS.map((f) => [f.id, Object.fromEntries(f.nodes.map((n) => [n.id, { x: n.x, y: n.y }]))]),
);

/** Output ports stack 13px apart around the node's middle, as in the editors this imitates. */
export const portOut = (n: FlowNode, p: Pt, i: number): Pt => ({
  x: p.x + nodeW(n),
  y: p.y + nodeH(n) / 2 + (i - (Math.max(1, outputsOf(n)) - 1) / 2) * 13,
});
export const portIn = (n: FlowNode, p: Pt): Pt => ({ x: p.x, y: p.y + nodeH(n) / 2 });

/**
 * A wire as cubic segments. Forwards it is one S-curve whose handles shorten when the nodes are
 * close; backwards it leaves to the right, runs back along the middle and enters from the left.
 */
export function curve(a: Pt, b: Pt): Seg[] {
  if (b.x - a.x >= 0) {
    const k = 75 * Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 100);
    return [[a, { x: a.x + k, y: a.y }, { x: b.x - k, y: b.y }, b]];
  }
  const k = 60;
  const midY = Math.abs(b.y - a.y) < 50 ? Math.max(a.y, b.y) + 46 : (a.y + b.y) / 2;
  const m = { x: (a.x + b.x) / 2, y: midY };
  return [
    [a, { x: a.x + k, y: a.y }, { x: a.x + k, y: midY }, m],
    [m, { x: b.x - k, y: midY }, { x: b.x - k, y: b.y }, b],
  ];
}

export function wireSegs(flow: Flow, wire: Wire, pos: Record<string, Pt>) {
  const from = nodeOf(flow.id, wire.from);
  const to = nodeOf(flow.id, wire.to);
  return curve(portOut(from, pos[wire.from], wire.port), portIn(to, pos[wire.to]));
}

const r1 = (v: number) => Math.round(v * 10) / 10;
export const pathOf = (segs: Seg[]) =>
  segs
    .map(
      ([a, b, c, d], i) =>
        `${i ? '' : `M${r1(a.x)},${r1(a.y)} `}C${r1(b.x)},${r1(b.y)} ${r1(c.x)},${r1(c.y)} ${r1(d.x)},${r1(d.y)}`,
    )
    .join(' ');

function bez([a, b, c, d]: Seg, t: number): Pt {
  const u = 1 - t;
  const [ka, kb, kc, kd] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: ka * a.x + kb * b.x + kc * c.x + kd * d.x,
    y: ka * a.y + kb * b.y + kc * c.y + kd * d.y,
  };
}

export function pointAt(segs: Seg[], t: number): Pt {
  const f = Math.min(segs.length - 1e-6, Math.max(0, t) * segs.length);
  const i = Math.floor(f);
  return bez(segs[i], f - i);
}

export function lengthOf(segs: Seg[]) {
  let len = 0;
  let prev = segs[0][0];
  for (const s of segs)
    for (let i = 1; i <= 12; i++) {
      const p = bez(s, i / 12);
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
  return len;
}

const statusW = (n: FlowNode) => (n.status ? 18 + n.status.text.length * 6.6 : 0);

/** A group's frame: its nodes and their status lines, with room for the label on top. */
export function groupRect(g: Group, pos: Record<string, Pt>, flowId: string) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const id of g.nodes) {
    const n = nodeOf(flowId, id);
    const p = pos[id];
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + Math.max(nodeW(n), statusW(n)));
    y1 = Math.max(y1, p.y + nodeH(n) + (n.status ? 20 : 0));
  }
  return { x: x0 - 16, y: y0 - 30, w: x1 - x0 + 32, h: y1 - y0 + 42 };
}

const COMMENTS = new Map<string, Pt>();

const BOUNDS = new Map(
  FLOWS.map((f) => {
    const pos = INITIAL[f.id];
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const g of f.groups) {
      const r = groupRect(g, pos, f.id);
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    for (const n of f.nodes) {
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + Math.max(nodeW(n), statusW(n)));
      y1 = Math.max(y1, n.y + nodeH(n) + 20);
    }
    // backward wires swing about 45px past the nodes at either end; the comment sits above
    const back = f.wires.some((w) => INITIAL[f.id][w.to].x < INITIAL[f.id][w.from].x) ? 44 : 0;
    COMMENTS.set(f.id, { x: x0, y: y0 - 16 });
    return [f.id, { x: x0 - back, y: y0 - 36, w: x1 - x0 + back * 2, h: y1 - y0 + 36 }] as const;
  }),
);

/** Where a flow's comment line starts. */
export const commentAt = (flowId: string) => COMMENTS.get(flowId)!;

/** Fits a flow into a w x h workspace: centered, never above 100%. */
export function fitView(flowId: string, w: number, h: number): View {
  const b = BOUNDS.get(flowId)!;
  const k = Math.max(0.5, Math.min(1, (w - 56) / b.w, (h - 56) / b.h));
  return {
    k,
    x: Math.round((w - b.w * k) / 2 - b.x * k),
    y: Math.round((h - b.h * k) / 2 - b.y * k),
  };
}

export function zoomAt(v: View, cx: number, cy: number, factor: number): View {
  const k = Math.max(0.4, Math.min(2, v.k * factor));
  return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
}

/* ------------------------------------------------------------------ phone layout */

export interface Rank {
  ids: string[];
  y: number;
  h: number;
  bank: boolean;
  /** First rank of a connected part of the flow: no wire runs into it from above. */
  start: boolean;
}

export interface MobileLayout {
  ranks: Rank[];
  rankOf: Record<string, number>;
  height: number;
}

export const M_GAP = 30;
const M_NODE = 48;
const M_ROW = 54;

/**
 * Lays a flow out top to bottom: each connected part in turn, one rank per step along the
 * longest path, and parallel nodes side by side in a two-column bank.
 */
function mobileLayout(flow: Flow): MobileLayout {
  const wires = flow.wires.filter((w) => w.kind !== 'feedback');
  const root = new Map(flow.nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => (root.get(id) === id ? id : find(root.get(id)!));
  for (const w of wires) root.set(find(w.from), find(w.to));

  const depth: Record<string, number> = {};
  const indegree = new Map(flow.nodes.map((n) => [n.id, 0]));
  for (const w of wires) indegree.set(w.to, indegree.get(w.to)! + 1);
  const queue = flow.nodes.filter((n) => !indegree.get(n.id)).map((n) => n.id);
  for (const id of queue) depth[id] = 0;
  while (queue.length) {
    const id = queue.shift()!;
    for (const w of wires.filter((it) => it.from === id)) {
      depth[w.to] = Math.max(depth[w.to] ?? 0, depth[id] + 1);
      indegree.set(w.to, indegree.get(w.to)! - 1);
      if (!indegree.get(w.to)) queue.push(w.to);
    }
  }

  const parts = new Map<string, FlowNode[]>();
  for (const n of flow.nodes) parts.set(find(n.id), [...(parts.get(find(n.id)) ?? []), n]);
  const ordered = [...parts.values()].sort(
    (a, b) => Math.min(...a.map((n) => n.y)) - Math.min(...b.map((n) => n.y)),
  );

  const ranks: Rank[] = [];
  const rankOf: Record<string, number> = {};
  let y = 14;
  ordered.forEach((nodes, pi) => {
    if (pi) y += 22;
    const max = Math.max(...nodes.map((n) => depth[n.id]));
    let first = true;
    for (let d = 0; d <= max; d++) {
      const ids = nodes
        .filter((n) => depth[n.id] === d)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((n) => n.id);
      if (!ids.length) continue;
      const bank = ids.length > 1;
      const h = bank ? 24 + Math.ceil(ids.length / 2) * M_ROW : M_NODE;
      for (const id of ids) rankOf[id] = ranks.length;
      ranks.push({ ids, y, h, bank, start: first });
      first = false;
      y += h + M_GAP;
    }
  });
  return { ranks, rankOf, height: y - M_GAP + 14 };
}

export const MOBILE = Object.fromEntries(FLOWS.map((f) => [f.id, mobileLayout(f)]));
