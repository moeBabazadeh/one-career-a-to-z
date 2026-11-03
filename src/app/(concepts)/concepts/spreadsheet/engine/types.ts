// The engine's values. A cell holds a number, text, a boolean, nothing (null, a blank cell) or
// an error, the same five kinds a desktop spreadsheet has. Dates are numbers: days since the
// 1899-12-30 epoch, shown as dates by their number format.

export type ErrCode =
  '#NULL!' | '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#NUM!' | '#N/A' | '#CIRC!' | '#ERROR!';

export const ERR_CODES: ErrCode[] = [
  '#NULL!',
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#NUM!',
  '#N/A',
  '#CIRC!',
  '#ERROR!',
];

/** An error value, with the reason a tooltip shows. */
export class CellError {
  code: ErrCode;
  why: string;
  constructor(code: ErrCode, why = '') {
    this.code = code;
    this.why = why;
  }
}

export type Scalar = number | string | boolean | null;
export type Value = Scalar | CellError;

export const isErr = (v: unknown): v is CellError => v instanceof CellError;

export const err = (code: ErrCode, why = '') => new CellError(code, why);

/** A rectangle of cells on one sheet: 0-based, inclusive. */
export interface Area {
  sheet: number;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** A reference inside an expression, with which parts are anchored by `$`. */
export interface Ref {
  r: number;
  c: number;
  ar: boolean;
  ac: boolean;
}

/** The grid's hard limits, for #REF! when a reference is shifted off the edge. */
export const MAX_R = 2000;
export const MAX_C = 52;

export const areaSize = (a: Area) => (a.r1 - a.r0 + 1) * (a.c1 - a.c0 + 1);

export const inArea = (a: Area, sheet: number, r: number, c: number) =>
  a.sheet === sheet && r >= a.r0 && r <= a.r1 && c >= a.c0 && c <= a.c1;

/** A cell's key on its sheet, and across the book. */
export const cellKey = (r: number, c: number) => r * MAX_C + c;
export const bookKey = (sheet: number, r: number, c: number) => (sheet * MAX_R + r) * MAX_C + c;
export const fromBookKey = (k: number) => ({
  sheet: Math.floor(k / (MAX_R * MAX_C)),
  r: Math.floor(k / MAX_C) % MAX_R,
  c: k % MAX_C,
});
