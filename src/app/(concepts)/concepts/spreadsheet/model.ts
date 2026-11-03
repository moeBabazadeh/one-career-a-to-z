import type { Tone } from './engine/workbook';

// How each sheet is laid out and dressed: column widths, row heights, frozen panes, merged
// cells, conditional formats and the charts that float over it. The cells themselves live in
// the workbook (engine/workbook.ts).

export interface Pos {
  r: number;
  c: number;
}

/** A rectangle on the visible sheet, 0-based and inclusive. */
export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export type CfRule =
  /** A formula written for the first cell of the range; relative references move with each cell. */
  | { kind: 'formula'; at: Rect; formula: string; tone: Tone | 'strong'; label: string }
  /** A two-colour scale from the lowest value to the highest. */
  | { kind: 'scale'; at: Rect; label: string }
  /** A data bar: each number's share of the largest. */
  | { kind: 'bars'; at: Rect; label: string }
  /** Text equal to a value. */
  | { kind: 'text'; at: Rect; equals: string; tone: Tone; label: string };

export interface ChartDef {
  id: string;
  kind: 'bar' | 'gantt';
  title: string;
  /** Anchored to a cell, at desktop and at phone widths. */
  at: Pos;
  phoneAt: Pos;
  w: number;
  h: number;
  phoneW: number;
  /** The ranges it reads, as a formula would write them. */
  labels: string;
  values: string;
  /** For a Gantt: where each bar ends. */
  ends?: string;
}

export interface SheetLayout {
  name: string;
  cols: number[];
  /** Narrower widths for some columns at phone sizes, by column index. */
  phoneCols?: Record<number, number>;
  rows: number;
  rowH: Record<number, number>;
  freeze: Pos;
  /** Horizontal merges: row r, from c0 to c1. */
  merges: { r: number; c0: number; c1: number }[];
  cf: CfRule[];
  charts: ChartDef[];
}

export const ROW_H = 24;
export const HEAD_H = 24;
export const ROWHEAD_W = 46;

export const rectOf = (a: Pos, b: Pos): Rect => ({
  r0: Math.min(a.r, b.r),
  c0: Math.min(a.c, b.c),
  r1: Math.max(a.r, b.r),
  c1: Math.max(a.c, b.c),
});

export const inRect = (x: Rect, r: number, c: number) =>
  r >= x.r0 && r <= x.r1 && c >= x.c0 && c <= x.c1;

export const rectSize = (x: Rect) => (x.r1 - x.r0 + 1) * (x.c1 - x.c0 + 1);

/* ------------------------------------------------------------------ geometry */

export interface Geometry {
  colX: number[];
  rowY: number[];
  frozenW: number;
  frozenH: number;
}

export function geometry(L: SheetLayout): Geometry {
  const colX = [ROWHEAD_W];
  L.cols.forEach((w, c) => colX.push(colX[c] + w));
  const rowY = [HEAD_H];
  for (let r = 0; r < L.rows; r++) rowY.push(rowY[r] + (L.rowH[r] ?? ROW_H));
  return { colX, rowY, frozenW: colX[L.freeze.c] - ROWHEAD_W, frozenH: rowY[L.freeze.r] - HEAD_H };
}

/** An area's box in the grid's content coordinates. */
export function boxOf(g: Geometry, a: { r0: number; c0: number; r1: number; c1: number }) {
  const rows = g.rowY.length - 1;
  const r1 = Math.min(a.r1, rows - 1);
  const c1 = Math.min(a.c1, g.colX.length - 2);
  return {
    left: g.colX[a.c0],
    top: g.rowY[a.r0],
    width: g.colX[c1 + 1] - g.colX[a.c0],
    height: g.rowY[r1 + 1] - g.rowY[a.r0],
  };
}
