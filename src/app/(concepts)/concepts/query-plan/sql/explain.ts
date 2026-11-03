// The plan as data for the view, and as the text EXPLAIN prints.
import { fmtCost, type Est, type Node, type NodeKind } from './plan';

export interface Act {
  /** Rows emitted across all loops. */
  rows: number;
  loops: number;
  /** Milliseconds, per loop, as EXPLAIN prints them. */
  startup: number;
  total: number;
  /** Milliseconds across all loops, this operator only. */
  self: number;
  removed: number;
  removedJoin: number;
  extra: [string, string][];
}

export interface PlanView {
  id: number;
  op: string;
  kind: NodeKind;
  relation?: string;
  alias?: string;
  index?: string;
  details: [string, string][];
  est: Est;
  act: Act | null;
  children: PlanView[];
}

// The simulated clock runs in microseconds of engine work; EXPLAIN prints milliseconds.
const ms = (us: number) => (us * 2.5) / 1000;

export function toView(n: Node, analyzed: boolean): PlanView {
  const children = n.children.map((c) => toView(c, analyzed));
  const childTime = n.children.reduce((s, c) => s + c.time, 0);
  return {
    id: n.id,
    op: n.op,
    kind: n.kind,
    relation: n.relation,
    alias: n.alias,
    index: n.index,
    details: n.details,
    est: n.est,
    act: analyzed
      ? {
          rows: n.rows,
          loops: n.loops,
          startup: n.loops ? ms(n.startup / n.loops) : 0,
          total: n.loops ? ms(n.time / n.loops) : 0,
          self: ms(Math.max(0, n.time - childTime)),
          removed: n.removed,
          removedJoin: n.removedJoin,
          extra: n.extra,
        }
      : null,
    children,
  };
}

export const title = (p: PlanView) => {
  if (p.op === 'Index Scan')
    return `Index Scan using ${p.index} on ${p.relation}${p.alias ? ` ${p.alias}` : ''}`;
  if (p.relation) return `${p.op} on ${p.relation}${p.alias ? ` ${p.alias}` : ''}`;
  return p.op;
};

/** One operator's detail lines, with the runtime counters EXPLAIN ANALYZE adds. */
export function detailLines(p: PlanView): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of p.details) {
    out.push([k, v]);
    if (p.act?.loops && (k === 'Filter' || k === 'One-Time Filter'))
      out.push(['Rows Removed by Filter', String(Math.round(p.act.removed / p.act.loops))]);
    if (p.act?.loops && k === 'Join Filter')
      out.push([
        'Rows Removed by Join Filter',
        String(Math.round(p.act.removedJoin / p.act.loops)),
      ]);
  }
  if (p.act?.loops) out.push(...p.act.extra);
  return out;
}

export const actualText = (a: Act) =>
  a.loops
    ? `actual time=${a.startup.toFixed(3)}..${a.total.toFixed(3)} rows=${Math.round(a.rows / a.loops)} loops=${a.loops}`
    : 'never executed';

export function explainText(
  plan: PlanView,
  analyzed: boolean,
  planning: number,
  execution: number,
): string[] {
  const lines: string[] = [];
  const visit = (p: PlanView, depth: number) => {
    const head = depth ? `${' '.repeat(depth * 6 - 4)}->  ` : '';
    const pad = ' '.repeat(depth ? depth * 6 + 2 : 2);
    lines.push(`${head}${title(p)}  (${fmtCost(p.est)})${p.act ? ` (${actualText(p.act)})` : ''}`);
    for (const [k, v] of detailLines(p)) lines.push(`${pad}${k}: ${v}`);
    p.children.forEach((c) => visit(c, depth + 1));
  };
  visit(plan, 0);
  lines.push(`Planning Time: ${planning.toFixed(3)} ms`);
  if (analyzed) lines.push(`Execution Time: ${execution.toFixed(3)} ms`);
  return lines;
}

export function flatten(p: PlanView, out: PlanView[] = []): PlanView[] {
  out.push(p);
  p.children.forEach((c) => flatten(c, out));
  return out;
}
