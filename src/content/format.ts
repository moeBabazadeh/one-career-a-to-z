// Formatting for the facts in db.ts. Facts are stored once, as numbers and dates; these turn them
// into the words pages show, so every page phrases the same fact the same way. No facts here.

/** A month, or just a year when that is all that's known. `m` runs 1–12; `d`, the day, is rarely needed. */
export interface YearMonth {
  y: number;
  m?: number;
  d?: number;
}

/** A count shown as a lower bound: the number, its short form ("200+") and its phrase ("more than 200"). */
export interface Figure {
  n: number;
  short: string;
  long: string;
}

export const fig = (n: number, short: string, long: string): Figure => ({ n, short, long });

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "September 2026", or "2017" when only the year is known. */
export const month = (d: YearMonth) => (d.m ? `${MONTHS[d.m - 1]} ${d.y}` : `${d.y}`);

/** "Sep 2026", or "2017". */
export const mon = (d: YearMonth) => (d.m ? `${MONTHS[d.m - 1].slice(0, 3)} ${d.y}` : `${d.y}`);

/** "September", "Sep" — the month alone. */
export const monthName = (d: YearMonth, short = false) =>
  d.m ? MONTHS[d.m - 1].slice(0, short ? 3 : undefined) : '';

/** "2026-09", or "2017". */
export const iso = (d: YearMonth) => (d.m ? `${d.y}-${String(d.m).padStart(2, '0')}` : `${d.y}`);

/**
 * The date as a fractional year, for timelines. A month sits at mid-month (September 2026 is
 * 2026.71), a bare year mid-year, and a day at the start of that day.
 */
export function frac(d: YearMonth) {
  if (!d.d) return d.y + ((d.m ?? 7) - 0.5) / 12;
  const start = Date.UTC(d.y, 0, 1);
  return d.y + (Date.UTC(d.y, (d.m ?? 1) - 1, d.d) - start) / (Date.UTC(d.y + 1, 0, 1) - start);
}

/** Whole months from one date to another. */
export const monthsBetween = (from: YearMonth, to: YearMonth) =>
  (to.y - from.y) * 12 + ((to.m ?? 7) - (from.m ?? 7));

/** "2008–2012", "2024 – now": years, with a separator and a word for an open end. */
export const yearSpan = (from: YearMonth, to: YearMonth | null, sep = '–', open = 'now') =>
  `${from.y}${sep}${to ? to.y : open}`;

/** "June 2024 – Present": months, for CV-style ranges. */
export const monthSpan = (from: YearMonth, to: YearMonth | null, open = 'Present') =>
  `${month(from)} – ${to ? month(to) : open}`;

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0–99 in words: 19 is "nineteen", 26 "twenty-six". Larger numbers come back as digits. */
export function spell(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  return String(n);
}

/** "Nineteen" — spell() with a capital, for the start of a sentence or a heading. */
export const Spell = (n: number) => spell(n).replace(/^./, (c) => c.toUpperCase());

/** "163k", "5.4k", "1.2M": a count in compact form, without the "+". */
export function compact(n: number): string {
  const [div, unit] =
    n >= 1e9 ? [1e9, 'B'] : n >= 1e6 ? [1e6, 'M'] : n >= 1e3 ? [1e3, 'k'] : [1, ''];
  const v = n / div;
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`;
}

/** "UK and US"; "UK, Ireland, Australia, and South Africa" (with the serial comma unless told not to). */
export function list(items: string[], serial = true): string {
  if (items.length < 3) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}${serial ? ',' : ''} and ${items[items.length - 1]}`;
}

/** 10000 as "10,000". */
export const grouped = (n: number) => n.toLocaleString('en-US');
