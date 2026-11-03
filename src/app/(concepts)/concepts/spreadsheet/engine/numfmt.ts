import { DAYS, MONTHS, serial, ymd } from './dates';
import { isErr, type Scalar, type Value } from './types';

// Number formats, in the desktop spreadsheet's format-code language: up to four sections
// (positive;negative;zero;text), digit placeholders 0 # ?, thousands separators, trailing
// commas that scale by a thousand each ("0.0,,,"B+"" shows 500000000 as 0.5B+), percent,
// quoted literals, [Color] tags and date codes (yyyy, mmm, d …). TEXT() uses the same code.

export interface Shown {
  text: string;
  color?: string;
}

/** Rounds half away from zero, correcting for binary fractions (1.005 → 1.01). */
export function round(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** digits;
  const y = Math.abs(x) * f;
  const r = Math.round(Number(y.toPrecision(15)));
  return (Math.sign(x) * r) / f;
}

/** The General format: integers as they are, fractions to ten significant digits. */
export function general(n: number): string {
  if (Object.is(n, -0)) return '0';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) {
    const [m, e] = n.toExponential(5).split('e');
    const mant = m.replace(/\.?0+$/, '');
    const exp = Number(e);
    return `${mant}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(10)));
}

type Tok =
  | { k: 'lit'; v: string }
  | { k: 'ph'; v: '0' | '#' | '?' }
  | { k: 'dot' }
  | { k: 'comma' }
  | { k: 'pct' }
  | { k: 'at' }
  | { k: 'exp'; sign: '+' | '-' }
  | { k: 'date'; v: string }
  | { k: 'general' };

interface Section {
  toks: Tok[];
  color?: string;
  date: boolean;
  text: boolean;
}

const COLORS = ['black', 'blue', 'cyan', 'green', 'magenta', 'red', 'white', 'yellow'];
const DATE_CODE = /^(yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|e)/i;

function tokenize(code: string): Section {
  const toks: Tok[] = [];
  let color: string | undefined;
  let i = 0;
  let date = false;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"') {
      const j = code.indexOf('"', i + 1);
      const end = j < 0 ? code.length : j;
      toks.push({ k: 'lit', v: code.slice(i + 1, end) });
      i = end + 1;
    } else if (ch === '\\') {
      toks.push({ k: 'lit', v: code[i + 1] ?? '' });
      i += 2;
    } else if (ch === '_') {
      toks.push({ k: 'lit', v: ' ' });
      i += 2;
    } else if (ch === '*') {
      i += 2;
    } else if (ch === '[') {
      const j = code.indexOf(']', i);
      const tag = code.slice(i + 1, j < 0 ? code.length : j).toLowerCase();
      if (COLORS.includes(tag)) color = tag;
      i = j < 0 ? code.length : j + 1;
    } else if (/^general/i.test(code.slice(i))) {
      toks.push({ k: 'general' });
      i += 7;
    } else if (ch === '0' || ch === '#' || ch === '?') {
      toks.push({ k: 'ph', v: ch });
      i++;
    } else if (ch === '.') {
      toks.push({ k: 'dot' });
      i++;
    } else if (ch === ',') {
      toks.push({ k: 'comma' });
      i++;
    } else if (ch === '%') {
      toks.push({ k: 'pct' });
      i++;
    } else if (ch === '@') {
      toks.push({ k: 'at' });
      i++;
    } else if (
      (ch === 'E' || ch === 'e') &&
      (code[i + 1] === '+' || code[i + 1] === '-') &&
      toks.some((t) => t.k === 'ph')
    ) {
      toks.push({ k: 'exp', sign: code[i + 1] as '+' | '-' });
      i += 2;
    } else {
      const m = DATE_CODE.exec(code.slice(i));
      if (m) {
        toks.push({ k: 'date', v: m[0].toLowerCase() });
        date = true;
        i += m[0].length;
      } else {
        toks.push({ k: 'lit', v: ch });
        i++;
      }
    }
  }
  return { toks, color, date, text: toks.some((t) => t.k === 'at') };
}

function splitSections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') quoted = !quoted;
    if (ch === '\\' && !quoted) {
      cur += ch + (code[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const cache = new Map<string, Section[]>();
function compile(code: string): Section[] {
  let s = cache.get(code);
  if (!s) {
    s = splitSections(code).map(tokenize);
    cache.set(code, s);
  }
  return s;
}

function formatDate(n: number, toks: Tok[]): string {
  if (n < 0 || !Number.isFinite(n)) return '#'.repeat(8);
  const { y, m, d } = ymd(n);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return toks
    .map((t) => {
      if (t.k === 'lit') return t.v;
      if (t.k !== 'date')
        return t.k === 'ph' ? t.v : t.k === 'dot' ? '.' : t.k === 'comma' ? ',' : '';
      switch (t.v) {
        case 'yyyy':
        case 'e':
          return String(y);
        case 'yy':
          return String(y % 100).padStart(2, '0');
        case 'mmmmm':
          return MONTHS[m - 1][0];
        case 'mmmm':
          return MONTHS[m - 1];
        case 'mmm':
          return MONTHS[m - 1].slice(0, 3);
        case 'mm':
          return String(m).padStart(2, '0');
        case 'm':
          return String(m);
        case 'dddd':
          return DAYS[wd];
        case 'ddd':
          return DAYS[wd].slice(0, 3);
        case 'dd':
          return String(d).padStart(2, '0');
        default:
          return String(d);
      }
    })
    .join('');
}

function formatNumber(n: number, toks: Tok[], signed: boolean): string {
  if (toks.some((t) => t.k === 'general')) {
    const g = general(signed ? n : Math.abs(n));
    return toks.map((t) => (t.k === 'general' ? g : t.k === 'lit' ? t.v : '')).join('');
  }
  const phIdx = toks.flatMap((t, i) => (t.k === 'ph' ? [i] : []));
  if (!phIdx.length) {
    // Only literals: the value isn't shown at all ("Yes";"No" style).
    return toks.map((t) => (t.k === 'lit' ? t.v : t.k === 'pct' ? '%' : '')).join('');
  }
  const first = phIdx[0];
  const last = phIdx[phIdx.length - 1];
  const dot = toks.findIndex((t, i) => t.k === 'dot' && i > first && i <= last + 1);
  const expAt = toks.findIndex((t) => t.k === 'exp');

  // Commas straight after the last placeholder scale by a thousand each.
  let scale = 0;
  let after = last + 1;
  while (toks[after]?.k === 'comma') {
    scale++;
    after++;
  }
  const intEnd = dot >= 0 ? dot : expAt >= 0 ? expAt : last + 1;
  const intPh = toks
    .slice(first, intEnd)
    .filter((t): t is { k: 'ph'; v: '0' | '#' | '?' } => t.k === 'ph');
  const decEnd = expAt >= 0 ? expAt : last + 1;
  const decPh =
    dot >= 0
      ? toks
          .slice(dot + 1, decEnd)
          .filter((t): t is { k: 'ph'; v: '0' | '#' | '?' } => t.k === 'ph')
      : [];
  const grouping = toks
    .slice(first, intEnd)
    .some((t, i, arr) => t.k === 'comma' && arr.slice(i + 1).some((u) => u.k === 'ph'));
  const pct = toks.filter((t) => t.k === 'pct').length;

  let v = Math.abs(n) * 100 ** pct;
  v /= 1000 ** scale;
  let expText = '';
  if (expAt >= 0) {
    const e = v === 0 ? 0 : Math.floor(Math.log10(v));
    v /= 10 ** e;
    const expPh = toks.slice(expAt + 1).filter((t) => t.k === 'ph').length;
    const sign = e < 0 ? '-' : (toks[expAt] as { sign: string }).sign === '+' ? '+' : '';
    expText = `E${sign}${String(Math.abs(e)).padStart(expPh, '0')}`;
  }
  const rounded = round(v, decPh.length);
  const fixed = rounded.toFixed(decPh.length);
  let [ip, fp = ''] = fixed.split('.');
  const minInt = intPh.filter((t) => t.v === '0').length;
  if (ip === '0' && minInt === 0) ip = '';
  ip = ip.padStart(minInt, '0');
  if (grouping) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Optional decimals (#) drop trailing zeros; ? keeps their width as spaces.
  const fc = fp.split('');
  for (let k = fc.length - 1; k >= 0 && fc[k] === '0'; k--) {
    if (decPh[k].v === '#') fc.pop();
    else if (decPh[k].v === '?') fc[k] = ' ';
    else break;
  }
  fp = fc.join('');
  const num = ip + (dot >= 0 ? '.' + fp : '') + expText;
  const negative = signed && n < 0 && rounded !== 0;

  let out = '';
  let placed = false;
  const skipEnd = Math.max(after, expAt >= 0 ? toks.length : 0);
  toks.forEach((t, i) => {
    if (
      i >= first &&
      i < skipEnd &&
      (t.k === 'ph' || t.k === 'dot' || t.k === 'comma' || t.k === 'exp')
    ) {
      if (!placed) {
        out += num;
        placed = true;
      }
      return;
    }
    if (t.k === 'lit') out += t.v;
    else if (t.k === 'pct') out += '%';
    else if (t.k === 'comma' || t.k === 'dot') out += t.k === 'comma' ? ',' : '.';
  });
  return (negative ? '-' : '') + out;
}

/** A value shown through a format code (General when there is none). */
export function format(value: Value, code?: string): Shown {
  if (value === null) return { text: '' };
  if (isErr(value)) return { text: value.code };
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE' };
  if (!code || /^general$/i.test(code)) {
    return { text: typeof value === 'number' ? general(value) : value };
  }
  const sections = compile(code);
  if (typeof value === 'string') {
    const sec = sections[3] ?? sections.find((s) => s.text);
    if (!sec) return { text: value };
    return {
      text: sec.toks.map((t) => (t.k === 'at' ? value : t.k === 'lit' ? t.v : '')).join(''),
      color: sec.color,
    };
  }
  let sec = sections[0];
  let signed = true;
  if (sections.length >= 2 && value < 0) {
    sec = sections[1];
    signed = false;
  } else if (sections.length >= 3 && value === 0) {
    sec = sections[2];
  }
  if (sec.text && !sec.toks.some((t) => t.k === 'ph' || t.k === 'general' || t.k === 'date'))
    return { text: general(value), color: sec.color };
  const text = sec.date ? formatDate(value, sec.toks) : formatNumber(value, sec.toks, signed);
  return { text, color: sec.color };
}

/** True when a format code shows dates. */
export const isDateFormat = (code?: string) => !!code && compile(code)[0].date;

/** How many decimals a format shows, and the same format with one more or one fewer. */
export function stepDecimals(code: string | undefined, value: Scalar, delta: 1 | -1): string {
  let base = code && !/^general$/i.test(code) ? code : '';
  if (!base) {
    const g = typeof value === 'number' ? general(value) : '0';
    const dec = g.includes('.') && !g.includes('E') ? g.split('.')[1].length : 0;
    base = dec ? `0.${'0'.repeat(dec)}` : '0';
  }
  if (isDateFormat(base)) return base;
  return splitSections(base)
    .map((sec) => {
      const m = /([0#?])(\.([0#?]*))?(?=[^0#?.]*$)/.exec(
        sec.replace(/"[^"]*"/g, (q) => q.replace(/[0#?.]/g, ' ')),
      );
      if (!m) return sec;
      const at = m.index;
      const dec = m[3] ?? '';
      if (delta > 0) return sec.slice(0, at + 1) + '.' + dec + '0' + sec.slice(at + m[0].length);
      if (!dec.length) return sec;
      const next = dec.slice(0, -1);
      return sec.slice(0, at + 1) + (next ? '.' + next : '') + sec.slice(at + m[0].length);
    })
    .join(';');
}

const MON = MONTHS.map((m) => m.slice(0, 3).toLowerCase());
const monthOf = (s: string) => {
  const k = s.slice(0, 3).toLowerCase();
  const i = MON.indexOf(k);
  return i >= 0 && MONTHS[i].toLowerCase().startsWith(s.toLowerCase()) ? i + 1 : 0;
};

/** What typing a constant into a cell means: a number, a date, a boolean or text, and a format to go with it. */
export function parseInput(text: string): { value: Scalar; fmt?: string } {
  const s = text.trim();
  if (text === '') return { value: null };
  if (text.startsWith("'")) return { value: text.slice(1), fmt: '@' };
  if (/^(true|false)$/i.test(s)) return { value: s.toUpperCase() === 'TRUE' };
  const num = /^([+-]?)(\d{1,3}(?:,\d{3})+|\d*)(\.\d+)?(?:[eE]([+-]?\d+))?(%?)$/.exec(s);
  if (num && (num[2] || num[3])) {
    let v = Number(
      `${num[1]}${num[2].replace(/,/g, '')}${num[3] ?? ''}${num[4] ? `e${num[4]}` : ''}`,
    );
    const dec = num[3] ? num[3].length - 1 : 0;
    if (num[5]) return { value: v / 100, fmt: dec ? `0.${'0'.repeat(dec)}%` : '0%' };
    if (num[2].includes(',')) return { value: v, fmt: dec ? `#,##0.${'0'.repeat(dec)}` : '#,##0' };
    if (Object.is(v, -0)) v = 0;
    return { value: v };
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31)
    return { value: serial(+m[1], +m[2], +m[3]), fmt: 'yyyy-mm-dd' };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31)
    return { value: serial(+m[3], +m[1], +m[2]), fmt: 'm/d/yyyy' };
  m = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (m && monthOf(m[1])) return { value: serial(+m[2], monthOf(m[1]), 1), fmt: 'mmm yyyy' };
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (m && monthOf(m[2])) return { value: serial(+m[3], monthOf(m[2]), +m[1]), fmt: 'd mmm yyyy' };
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && monthOf(m[1])) return { value: serial(+m[3], monthOf(m[1]), +m[2]), fmt: 'mmm d, yyyy' };
  return { value: text };
}
