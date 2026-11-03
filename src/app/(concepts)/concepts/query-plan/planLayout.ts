// Lays a plan tree out top-down (root first, data flowing up), with edge geometry for the
// particles. Pure and deterministic, so the server renders the same layout as the client.
import type { PlanView } from './sql/explain';

export const NW = 172;
export const NH = 66;
const GX = 14;
const GY = 38;
const TOP = 62;
const PAD = 14;

/** Each node kind's colour, as the token the particles read at paint time (see query.module.scss). */
export const KIND_TOKEN: Record<string, string> = {
  scan: '--blue',
  join: '--pink',
  hash: '--pink-2',
  agg: '--amber',
  sort: '--amber',
  limit: '--amber-2',
  other: '--other',
  client: '--green',
};

export interface Box {
  id: number;
  x: number;
  y: number;
  depth: number;
  parent: number | null;
  view: PlanView;
}

export interface Edge {
  /** The operator whose rows travel along this edge; the root's edge goes to the client. */
  from: number;
  to: number | 'client';
  p: [number, number, number, number, number, number, number, number];
  length: number;
}

export interface Layout {
  W: number;
  H: number;
  boxes: Box[];
  edges: Edge[];
  sink: { x: number; y: number; w: number; h: number };
}

function curve(x0: number, y0: number, x1: number, y1: number): Edge['p'] {
  const h = (y0 - y1) * 0.5;
  return [x0, y0, x0, y0 - h, x1, y1 + h, x1, y1];
}

export function bez(p: Edge['p'], u: number): [number, number] {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
}

const lengthOf = (p: Edge['p']) => {
  let len = 0;
  let [px, py] = bez(p, 0);
  for (let i = 1; i <= 16; i++) {
    const [x, y] = bez(p, i / 16);
    len += Math.hypot(x - px, y - py);
    [px, py] = [x, y];
  }
  return len;
};

export const pathOf = (p: Edge['p']) =>
  `M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}`;

export function layoutPlan(plan: PlanView): Layout {
  const boxes: Box[] = [];
  let leaf = 0;
  let depthMax = 0;
  const place = (p: PlanView, depth: number, parent: number | null): number => {
    depthMax = Math.max(depthMax, depth);
    let cx: number;
    if (!p.children.length) {
      cx = PAD + leaf * (NW + GX) + NW / 2;
      leaf++;
    } else {
      const xs = p.children.map((c) => place(c, depth + 1, p.id));
      cx = (xs[0] + xs[xs.length - 1]) / 2;
    }
    boxes.push({ id: p.id, x: cx - NW / 2, y: TOP + depth * (NH + GY), depth, parent, view: p });
    return cx;
  };
  place(plan, 0, null);
  boxes.sort((a, b) => a.id - b.id);
  const W = PAD * 2 + leaf * NW + (leaf - 1) * GX;
  const H = TOP + (depthMax + 1) * (NH + GY) - GY + PAD;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const root = byId.get(plan.id)!;
  const sink = { x: root.x + NW / 2 - 70, y: 12, w: 140, h: 28 };

  const edges: Edge[] = [];
  for (const b of boxes) {
    if (b.parent === null) {
      const p = curve(b.x + NW / 2, b.y, b.x + NW / 2, sink.y + sink.h);
      edges.push({ from: b.id, to: 'client', p, length: lengthOf(p) });
      continue;
    }
    const parent = byId.get(b.parent)!;
    const siblings = parent.view.children;
    const i = siblings.findIndex((c) => c.id === b.id);
    const offset = (i - (siblings.length - 1) / 2) * 40;
    const p = curve(b.x + NW / 2, b.y, parent.x + NW / 2 + offset, parent.y + NH);
    edges.push({ from: b.id, to: parent.id, p, length: lengthOf(p) });
  }
  return { W, H, boxes, edges, sink };
}
