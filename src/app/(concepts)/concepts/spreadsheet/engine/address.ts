import { MAX_C, MAX_R, type Area, type Ref } from './types';

/** 0 → A, 25 → Z, 26 → AA. */
export function colName(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** A → 0, AA → 26. */
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const CELL = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;

/** "$B$3" → a reference; null when it isn't one. */
export function parseRef(text: string): Ref | null {
  const m = CELL.exec(text);
  if (!m) return null;
  const r = Number(m[4]) - 1;
  if (r < 0) return null;
  return { r, c: colIndex(m[2]), ac: m[1] === '$', ar: m[3] === '$' };
}

export const refText = (ref: Ref) =>
  `${ref.ac ? '$' : ''}${colName(ref.c)}${ref.ar ? '$' : ''}${ref.r + 1}`;

/** "B3", without anchors. */
export const a1 = (r: number, c: number) => `${colName(c)}${r + 1}`;

/** A sheet name as a formula writes it: quoted when it has a space or other punctuation. */
export const sheetPrefix = (name: string) =>
  /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;

/** "B3" or "B3:D9", optionally with its sheet: "'Open source'!E2:E6". */
export function areaText(a: Area, sheetName?: string): string {
  const one = a.r0 === a.r1 && a.c0 === a.c1;
  const body = one ? a1(a.r0, a.c0) : `${a1(a.r0, a.c0)}:${a1(a.r1, a.c1)}`;
  return sheetName ? `${sheetPrefix(sheetName)}!${body}` : body;
}

/** Normalises two corners into an area. */
export const areaOf = (sheet: number, ra: number, ca: number, rb: number, cb: number): Area => ({
  sheet,
  r0: Math.min(ra, rb),
  c0: Math.min(ca, cb),
  r1: Math.max(ra, rb),
  c1: Math.max(ca, cb),
});

export const validRef = (r: number, c: number) => r >= 0 && c >= 0 && r < MAX_R && c < MAX_C;
