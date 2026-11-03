// The editor's toolkit: what an operator at the inserter used to compose pages, as code. Rows are
// 40 bytes of text and spacing attributes; helpers wrap text, draw block mosaics from ASCII art,
// set big mosaic headlines and lay out the Fastext row, and split long stories into subpages.
import { C } from './decode';
import { capRows, encodeChar, sextant } from './glyphs';

/** The last row a story may use: row 23 carries the Fastext prompts. */
export const LAST = 22;
export const FASTEXT_ROW = 23;

/** A hotspot on the screen: a page number to go to, a link to open, or a Fastext prompt. */
export interface Spot {
  row: number;
  c0: number;
  c1: number;
  go?: number;
  href?: string;
  key?: number;
  /** Only live once the page is revealed. */
  concealed?: boolean;
}

/** Text that is also a hotspot. `conceal` hides it until REVEAL. */
export interface Span {
  t: string;
  go?: number;
  href?: string;
  conceal?: boolean;
}

/** A row part: a raw attribute or mosaic code, codes in a run, text, or a hotspot. */
export type Part = number | number[] | string | Span;

export interface Link {
  label: string;
  href: string;
}

export interface Sub {
  rows: number[][];
  spots: Spot[];
}

export interface Page {
  num: number;
  /** The Fastext prompt that points here, at most nine characters. */
  short: string;
  /** The page's name, for the A–Z, the link strip and screen readers. */
  title: string;
  subs: Sub[];
  /** Red, green, yellow and blue. */
  fast: [number, number, number, number];
  links: Link[];
}

const SPACE = 0x20;
export const blankRow = () => new Array<number>(40).fill(SPACE);

/** Encodes parts into a 40-byte row, noting any hotspots in `spots`. */
export function encode(parts: Part[], row = 0, spots?: Spot[]): number[] {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'number') out.push(p);
    else if (Array.isArray(p)) out.push(...p);
    else if (typeof p === 'string') for (const ch of p) out.push(encodeChar(ch));
    else {
      if (p.conceal) out.push(C.Conceal);
      const c0 = out.length;
      for (const ch of p.t) out.push(encodeChar(ch));
      if (spots && (p.go || p.href))
        spots.push({
          row,
          c0,
          c1: Math.min(40, out.length),
          go: p.go,
          href: p.href,
          concealed: p.conceal,
        });
    }
  }
  out.length = Math.min(out.length, 40);
  while (out.length < 40) out.push(SPACE);
  return out;
}

/** Visible width of parts, in cells. */
export function width(parts: Part[]): number {
  return parts.reduce<number>(
    (n, p) =>
      n +
      (typeof p === 'number'
        ? 1
        : Array.isArray(p)
          ? p.length
          : typeof p === 'string'
            ? [...p].length
            : [...p.t].length + (p.conceal ? 1 : 0)),
    0,
  );
}

/** Word-wraps text to lines of at most `w` characters; words longer than a line are broken. */
export function wrap(text: string, w: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (rest.length > w) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(rest.slice(0, w));
      rest = rest.slice(w);
    }
    if (!line) line = rest;
    else if (line.length + 1 + rest.length <= w) line += ` ${rest}`;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Breaks a URL at its slashes so it wraps cleanly. */
export function wrapUrl(url: string, w: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const piece of url.split(/(?<=\/)/)) {
    if (line && line.length + piece.length > w) {
      lines.push(line);
      line = '';
    }
    line += piece;
  }
  if (line) lines.push(line);
  return lines.flatMap((l) => (l.length > w ? wrap(l, w) : [l]));
}

export const pad = (s: string, n: number) =>
  s.length > n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
export const padStart = (s: string, n: number) =>
  s.length > n ? s.slice(0, n) : ' '.repeat(n - s.length) + s;
export const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/* ------------------------------------------------------------------ mosaics */

/**
 * ASCII art to block mosaics: '#' is a lit sextant. Each cell takes two columns and three lines,
 * so the art's width should be even and its height a multiple of three.
 */
export function mosaicRows(art: string[]): number[][] {
  const h = Math.ceil(art.length / 3),
    w = Math.ceil(Math.max(...art.map((l) => l.length)) / 2);
  const on = (x: number, y: number) => art[y]?.[x] === '#';
  return Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => {
      const x = c * 2,
        y = r * 3;
      const mask =
        (on(x, y) ? 1 : 0) |
        (on(x + 1, y) ? 2 : 0) |
        (on(x, y + 1) ? 4 : 0) |
        (on(x + 1, y + 1) ? 8 : 0) |
        (on(x, y + 2) ? 16 : 0) |
        (on(x + 1, y + 2) ? 32 : 0);
      return sextant(mask);
    }),
  );
}

/** Text in the character set's own capitals, blown up to a 9-line mosaic: three rows tall. */
export function bigText(text: string): string[] {
  const lines = Array.from({ length: 9 }, () => '');
  [...text.toUpperCase()].forEach((ch, i) => {
    const gap = i > 0 ? '.' : '';
    if (ch === ' ') {
      for (let y = 0; y < 9; y++) lines[y] += gap + '..';
      return;
    }
    const rows = capRows(ch);
    for (let y = 0; y < 9; y++)
      lines[y] +=
        gap + (y >= 1 && y <= 7 ? rows[y - 1].map((b) => (b ? '#' : '.')).join('') : '.....');
  });
  return lines;
}

/** Graphics colour code for a colour 1–7. */
export const gfx = (colour: number) => 0x10 + colour;
/** Alphanumeric colour code for a colour 1–7. */
export const alpha = (colour: number) => colour;

export const RED = 1,
  GREEN = 2,
  YELLOW = 3,
  BLUE = 4,
  MAGENTA = 5,
  CYAN = 6,
  WHITE = 7;

export interface Look {
  band: number;
  ink: number;
}

/**
 * The section masthead: three rows of a coloured band with the section's name in big mosaic
 * capitals, and the subpage counter ("2/5") set small at the right when there is one.
 */
export function masthead(title: string, look: Look, counter?: string): number[][] {
  const art = mosaicRows(bigText(title));
  const room = counter ? 40 - 4 - (counter.length + 2) : 40 - 4;
  return art.map((cells, r) => {
    const row = [gfx(look.band), C.NewBg, gfx(look.ink), SPACE, ...cells.slice(0, room)];
    while (row.length < 4 + room) row.push(SPACE);
    if (counter)
      row.push(
        ...(r === 1
          ? [C.AlphaWhite, ...[...counter].map(encodeChar)]
          : new Array<number>(counter.length + 1).fill(SPACE)),
        SPACE,
      );
    return encode([row]);
  });
}

const FAST_COLOURS = [C.AlphaRed, C.AlphaGreen, C.AlphaYellow, C.AlphaCyan];

/**
 * Row 23: the four prompts in red, green, yellow and cyan (blue type is unreadable on black, so
 * the blue key's prompt is set in cyan), spread across the row.
 */
export function fastextRow(labels: string[], spots: Spot[]): number[] {
  const ls = labels.map((l) => l.slice(0, 12));
  while (ls.reduce((n, l) => n + l.length, 0) > 36 - 3) {
    const longest = ls.reduce((a, l, i) => (l.length > ls[a].length ? i : a), 0);
    ls[longest] = ls[longest].slice(0, -1);
  }
  const spare = 40 - 4 - ls.reduce((n, l) => n + l.length, 0);
  const gaps = [0, 1, 2].map((i) => Math.floor(spare / 3) + (i < spare % 3 ? 1 : 0));
  const row: number[] = [];
  ls.forEach((l, i) => {
    const c0 = row.length;
    row.push(FAST_COLOURS[i], ...[...l].map(encodeChar));
    spots.push({ row: FASTEXT_ROW, c0, c1: row.length, key: i });
    if (i < 3) row.push(...new Array<number>(gaps[i]).fill(SPACE));
  });
  return encode([row]);
}

/* ------------------------------------------------------------------ stories */

/** A story line: parts on one row, or a double-height row that takes two. */
export interface Line {
  parts: Part[];
  double?: boolean;
}

export const line = (...parts: Part[]): Line => ({ parts });
export const dbl = (...parts: Part[]): Line => ({
  parts: [C.DoubleHeight, ...parts],
  double: true,
});
export const gap = (): Line => ({ parts: [] });

/** A paragraph in one colour, wrapped to the row with the attribute in column 0. */
export function para(text: string, colour = WHITE, indent = 0): Line[] {
  return wrap(text, 38 - indent).map((t) => line(alpha(colour), ' '.repeat(indent), t));
}

/** A headline in double height, wrapped if it must be. */
export function headline(text: string, colour = YELLOW): Line[] {
  return wrap(text, 37).map((t) => dbl(alpha(colour), t));
}

const heightOf = (ls: Line[]) => ls.reduce((n, l) => n + (l.double ? 2 : 1), 0);

const OPTIONAL = new WeakSet<Line[]>();
/** Marks a block (a picture, say) to be left out rather than pushed onto a subpage of its own. */
export function optional(block: Line[]): Line[] {
  OPTIONAL.add(block);
  return block;
}

/**
 * Lays blocks of lines out over as many subpages as they need, below a masthead. A block is
 * kept together when it fits on a fresh page; blocks are separated by a blank row.
 */
export function paginate(blocks: Line[][], top = 5, spacing = 1): Line[][] {
  const room = LAST - top + 1;
  const pages: Line[][] = [[]];
  for (const block of blocks.filter((b) => b.length)) {
    let page = pages[pages.length - 1];
    const used = heightOf(page);
    const need = heightOf(block) + (used ? spacing : 0);
    if (used + need <= room) {
      if (used && spacing) page.push(gap());
      page.push(...block);
      continue;
    }
    if (OPTIONAL.has(block)) continue;
    if (heightOf(block) <= room) {
      pages.push([...block]);
      continue;
    }
    // Too tall for any page: split it line by line.
    for (const l of block) {
      page = pages[pages.length - 1];
      if (heightOf(page) + (l.double ? 2 : 1) > room) pages.push((page = []));
      page.push(l);
    }
  }
  return pages;
}

/** A sheet under construction: 24 rows, written top to bottom, with its hotspots. */
export class Sheet {
  rows: number[][] = Array.from({ length: 24 }, blankRow);
  spots: Spot[] = [];
  y = 1;

  put(y: number, parts: Part[]) {
    if (y < 0 || y > LAST) return;
    this.rows[y] = encode(parts, y, this.spots);
  }

  raw(y: number, row: number[]) {
    if (y >= 0 && y <= LAST) this.rows[y] = encode([row]);
  }

  add(l: Line) {
    this.put(this.y, l.parts);
    this.y += l.double ? 2 : 1;
  }

  lines(ls: Line[]) {
    ls.forEach((l) => this.add(l));
  }

  skip(n = 1) {
    this.y += n;
  }

  done(fast: string[]): Sub {
    this.rows[FASTEXT_ROW] = fastextRow(fast, this.spots);
    return { rows: this.rows, spots: this.spots };
  }
}
