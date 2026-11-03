// The display filter language: a lexer, a recursive-descent parser and a compiler to closures.
// It follows the real grammar where it matters: field and protocol names, == != === !== ~= > <
// >= <= (and eq ne gt lt ge le), contains, matches/~, in {…} with ranges, & (bitwise and),
// slices [i] [i:n] [i-j], len() count() upper() lower(), && || ! (and or not) and parentheses.
// Literals are parsed against the field's type: numbers, IPv4 with CIDR or a host name from the
// capture, MAC and byte strings, quoted strings. `!=` means "no occurrence equals", as it has
// since 3.6; `!==` is "any differs".

import { ALL_FIELDS, lookup, type FieldDef } from './fields';
import { hex, hexBytes, ip4, latin1, mac, parseIp, utf8, type Node, type Val } from './net';
import { NAMES, type Packet } from './trace';

/* ------------------------------------------------------------------ field values per packet */

export interface Occ {
  v: Val | undefined;
  node: Node;
  /** The raw bytes under the node, for slices and len(). */
  raw: Uint8Array;
}

const cache = new WeakMap<Packet, Map<string, Occ[]>>();

/** Every field in a packet, by name, with each occurrence (ip.addr twice, tcp.port twice…). */
export function fieldsOf(p: Packet): Map<string, Occ[]> {
  const hit = cache.get(p);
  if (hit) return hit;
  const map = new Map<string, Occ[]>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.f) {
        const def = lookup(n.f);
        const src = p.srcs[n.s ?? 0]?.bytes ?? new Uint8Array();
        const raw = def?.type === 'proto' ? src.subarray(n.o) : src.subarray(n.o, n.o + n.n);
        const v = def?.type === 'proto' ? raw : n.v;
        const list = map.get(n.f);
        const occ = { v, node: n, raw };
        if (list) list.push(occ);
        else map.set(n.f, [occ]);
      }
      if (n.k) walk(n.k);
    }
  };
  walk(p.tree);
  cache.set(p, map);
  return map;
}

/** What a filter can ask that isn't in the bytes: marks and the colouring rule that matched. */
export interface Ctx {
  marked: (p: Packet) => boolean;
  rule: (p: Packet) => { name: string; filter: string } | null;
}

const NO_CTX: Ctx = { marked: () => false, rule: () => null };

function occurrences(p: Packet, f: string, ctx: Ctx): Occ[] {
  if (f === 'frame.marked') {
    const m = ctx.marked(p);
    return [{ v: m, node: { t: '', o: 0, n: 0 }, raw: new Uint8Array() }];
  }
  if (f === 'frame.coloring_rule.name' || f === 'frame.coloring_rule.string') {
    const r = ctx.rule(p);
    return r
      ? [
          {
            v: f.endsWith('name') ? r.name : r.filter,
            node: { t: '', o: 0, n: 0 },
            raw: new Uint8Array(),
          },
        ]
      : [];
  }
  return fieldsOf(p).get(f) ?? [];
}

/* ------------------------------------------------------------------ lexer */

type TokKind = 'word' | 'str' | 'op' | 'lp' | 'rp' | 'lb' | 'rb' | 'slice' | 'comma' | 'end';

interface Tok {
  k: TokKind;
  s: string;
  at: number;
  end: number;
}

export class FilterError extends Error {
  readonly at: [number, number];
  constructor(msg: string, at: [number, number]) {
    super(msg);
    this.at = at;
  }
}

const OPS = ['===', '!==', '==', '!=', '~=', '>=', '<=', '&&', '||', '^^', '>', '<', '!', '~', '&'];
const WORD = /[A-Za-z0-9_.:\-/+]/;

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const at = i;
    if (c === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) {
          const e = src[i + 1];
          if (e === 'x' && /^[0-9a-fA-F]{2}$/.test(src.slice(i + 2, i + 4))) {
            s += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16));
            i += 4;
            continue;
          }
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e;
          i += 2;
          continue;
        }
        s += src[i++];
      }
      if (i >= src.length)
        throw new FilterError('The string literal is missing its closing quote.', [at, src.length]);
      i++;
      out.push({ k: 'str', s, at, end: i });
      continue;
    }
    if (c === '(') out.push({ k: 'lp', s: c, at, end: ++i });
    else if (c === ')') out.push({ k: 'rp', s: c, at, end: ++i });
    else if (c === '{') out.push({ k: 'lb', s: c, at, end: ++i });
    else if (c === '}') out.push({ k: 'rb', s: c, at, end: ++i });
    else if (c === ',') out.push({ k: 'comma', s: c, at, end: ++i });
    else if (c === '[') {
      const close = src.indexOf(']', i);
      if (close < 0)
        throw new FilterError('The slice is missing its closing "]".', [at, src.length]);
      out.push({ k: 'slice', s: src.slice(i + 1, close).trim(), at, end: close + 1 });
      i = close + 1;
    } else {
      const op = OPS.find((o) => src.startsWith(o, i));
      if (op) {
        out.push({ k: 'op', s: op, at, end: (i += op.length) });
      } else if (WORD.test(c)) {
        while (i < src.length && WORD.test(src[i])) i++;
        out.push({ k: 'word', s: src.slice(at, i), at, end: i });
      } else {
        throw new FilterError(`"${c}" was unexpected in this context.`, [at, at + 1]);
      }
    }
  }
  out.push({ k: 'end', s: '', at: src.length, end: src.length });
  return out;
}

/* ------------------------------------------------------------------ ast */

type Rel =
  'any_eq' | 'all_ne' | 'all_eq' | 'any_ne' | 'gt' | 'lt' | 'ge' | 'le' | 'contains' | 'matches';

interface Entity {
  field: FieldDef;
  slice?: { start: number; end?: number };
  fn?: 'len' | 'count' | 'upper' | 'lower';
  at: [number, number];
}

interface Lit {
  tok: Tok;
  to?: Tok;
}

type Ast =
  | { k: 'or' | 'and' | 'xor'; a: Ast; b: Ast }
  | { k: 'not'; a: Ast }
  | { k: 'exists'; e: Entity }
  | { k: 'rel'; rel: Rel; e: Entity; v: Lit; mask?: Lit }
  | { k: 'in'; e: Entity; set: Lit[]; negate: boolean }
  | { k: 'bitand'; e: Entity; mask: Lit };

const REL_WORDS: Record<string, Rel> = {
  eq: 'any_eq',
  any_eq: 'any_eq',
  ne: 'all_ne',
  all_ne: 'all_ne',
  all_eq: 'all_eq',
  any_ne: 'any_ne',
  gt: 'gt',
  lt: 'lt',
  ge: 'ge',
  le: 'le',
  contains: 'contains',
  matches: 'matches',
};
const REL_OPS: Record<string, Rel> = {
  '==': 'any_eq',
  '!=': 'all_ne',
  '===': 'all_eq',
  '!==': 'any_ne',
  '~=': 'any_ne',
  '>': 'gt',
  '<': 'lt',
  '>=': 'ge',
  '<=': 'le',
  '~': 'matches',
};

class Parser {
  private i = 0;
  readonly warnings: string[] = [];
  private readonly toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  private peek() {
    return this.toks[this.i];
  }
  private next() {
    return this.toks[this.i++];
  }
  private isWord(t: Tok, ...w: string[]) {
    return t.k === 'word' && w.includes(t.s.toLowerCase());
  }

  parse(): Ast {
    const ast = this.or();
    const t = this.peek();
    if (t.k === 'rp')
      throw new FilterError('Unexpected ")": there is no "(" to close.', [t.at, t.end]);
    if (t.k !== 'end')
      throw new FilterError(`"${t.s}" was unexpected in this context.`, [t.at, t.end]);
    return ast;
  }

  private or(): Ast {
    let a = this.and();
    for (;;) {
      const t = this.peek();
      if ((t.k === 'op' && t.s === '||') || this.isWord(t, 'or')) {
        this.next();
        a = { k: 'or', a, b: this.and() };
      } else if ((t.k === 'op' && t.s === '^^') || this.isWord(t, 'xor')) {
        this.next();
        a = { k: 'xor', a, b: this.and() };
      } else return a;
    }
  }

  private and(): Ast {
    let a = this.unary();
    for (;;) {
      const t = this.peek();
      if ((t.k === 'op' && t.s === '&&') || this.isWord(t, 'and')) {
        this.next();
        a = { k: 'and', a, b: this.unary() };
      } else return a;
    }
  }

  private unary(): Ast {
    const t = this.peek();
    if ((t.k === 'op' && t.s === '!') || this.isWord(t, 'not')) {
      this.next();
      return { k: 'not', a: this.unary() };
    }
    return this.primary();
  }

  private primary(): Ast {
    const t = this.peek();
    if (t.k === 'lp') {
      this.next();
      const inner = this.or();
      const close = this.next();
      if (close.k !== 'rp')
        throw new FilterError('Missing closing parenthesis: this "(" is never closed.', [
          t.at,
          t.end,
        ]);
      return inner;
    }
    if (t.k === 'end') throw new FilterError('Unexpected end of filter expression.', [t.at, t.end]);
    return this.test();
  }

  private entity(): Entity {
    const t = this.next();
    if (t.k !== 'word') {
      if (t.k === 'end')
        throw new FilterError('Unexpected end of filter expression.', [t.at, t.end]);
      throw new FilterError(`"${t.s}" was unexpected in this context.`, [t.at, t.end]);
    }
    const fnName = t.s.toLowerCase();
    if (['len', 'count', 'upper', 'lower'].includes(fnName) && this.peek().k === 'lp') {
      this.next();
      const inner = this.entity();
      const close = this.next();
      if (close.k !== 'rp')
        throw new FilterError(`The function ${fnName}() is missing its closing ")".`, [
          t.at,
          close.end,
        ]);
      if ((fnName === 'upper' || fnName === 'lower') && inner.field.type !== 'str')
        throw new FilterError(
          `${fnName}() needs a string field, and "${inner.field.abbrev}" is ${article(inner.field)}.`,
          [t.at, close.end],
        );
      return { ...inner, fn: fnName as Entity['fn'], at: [t.at, close.end] };
    }
    const field = lookup(t.s);
    if (!field)
      throw new FilterError(`"${t.s}" is not a valid protocol or protocol field.`, [t.at, t.end]);
    const e: Entity = { field, at: [t.at, t.end] };
    if (this.peek().k === 'slice') {
      const s = this.next();
      e.slice = parseSlice(s);
      e.at = [t.at, s.end];
    }
    return e;
  }

  private literal(): Lit {
    const t = this.next();
    if (t.k === 'word' || t.k === 'str') return { tok: t };
    if (t.k === 'end')
      throw new FilterError('Unexpected end of filter expression: a value is missing.', [
        t.at,
        t.end,
      ]);
    throw new FilterError(`"${t.s}" was unexpected where a value was expected.`, [t.at, t.end]);
  }

  private test(): Ast {
    const e = this.entity();
    const t = this.peek();
    const rel =
      t.k === 'op' ? REL_OPS[t.s] : t.k === 'word' ? REL_WORDS[t.s.toLowerCase()] : undefined;
    if (rel) {
      this.next();
      if (t.s === '~=')
        this.warnings.push('"~=" is deprecated; use "!==" for "any occurrence differs".');
      return { k: 'rel', rel, e, v: this.literal() };
    }
    if (t.k === 'op' && t.s === '&') {
      this.next();
      const mask = this.literal();
      const after = this.peek();
      const rel2 =
        after.k === 'op'
          ? REL_OPS[after.s]
          : after.k === 'word'
            ? REL_WORDS[after.s.toLowerCase()]
            : undefined;
      if (rel2 && rel2 !== 'contains' && rel2 !== 'matches') {
        this.next();
        return { k: 'rel', rel: rel2, e, v: this.literal(), mask };
      }
      return { k: 'bitand', e, mask };
    }
    if (
      this.isWord(t, 'in') ||
      (this.isWord(t, 'not') && this.isWord(this.toks[this.i + 1], 'in'))
    ) {
      const negate = this.isWord(t, 'not');
      this.next();
      if (negate) this.next();
      const open = this.next();
      if (open.k !== 'lb')
        throw new FilterError('"in" needs a set of values in braces, like {80 443}.', [
          open.at,
          open.end,
        ]);
      const set: Lit[] = [];
      for (;;) {
        const n = this.peek();
        if (n.k === 'rb') {
          this.next();
          break;
        }
        if (n.k === 'comma') {
          this.next();
          continue;
        }
        if (n.k === 'end')
          throw new FilterError('The set is missing its closing "}".', [open.at, n.end]);
        const lit = this.literal();
        // "3..5" lexes as one word; split it into a range.
        const m = lit.tok.k === 'word' ? /^(.+?)\.\.(.+)$/.exec(lit.tok.s) : null;
        if (m) set.push({ tok: { ...lit.tok, s: m[1] }, to: { ...lit.tok, s: m[2] } });
        else set.push(lit);
      }
      if (!set.length) throw new FilterError('The set is empty.', [open.at, this.peek().at]);
      return { k: 'in', e, set, negate };
    }
    return { k: 'exists', e };
  }
}

function parseSlice(t: Tok): { start: number; end?: number } {
  const s = t.s;
  const bad = () =>
    new FilterError(`"[${s}]" is not a valid slice. Try [0], [0:2] or [2-5].`, [t.at, t.end]);
  let m = /^(-?\d+)$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    return { start: a, end: a === -1 ? undefined : a + 1 };
  }
  m = /^(-?\d*):(\d*)$/.exec(s);
  if (m) {
    const a = m[1] === '' ? 0 : Number(m[1]);
    return { start: a, end: m[2] === '' ? undefined : a + Number(m[2]) };
  }
  m = /^(\d+)-(\d+)$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b < a) throw bad();
    return { start: a, end: b + 1 };
  }
  throw bad();
}

const article = (f: FieldDef) => {
  const n = {
    proto: 'a protocol',
    none: 'a label',
    u: 'an unsigned integer',
    i: 'a signed integer',
    bool: 'a boolean',
    ipv4: 'an IPv4 address',
    ether: 'a MAC address',
    str: 'a string',
    bytes: 'a byte string',
    f: 'a number',
  }[f.type];
  return n;
};

/* ------------------------------------------------------------------ literals */

type Kind = 'num' | 'str' | 'bytes' | 'ip';

interface Typed {
  kind: Kind;
  num?: number;
  str?: string;
  bytes?: Uint8Array;
  ip?: { addr: number; mask: number };
}

function parseBytes(s: string): Uint8Array | null {
  const clean = s.replace(/^0x/i, '');
  let parts: string[];
  if (/^[0-9a-fA-F]{1,2}([:\-.][0-9a-fA-F]{1,2})*$/.test(clean)) parts = clean.split(/[:\-.]/);
  else if (/^([0-9a-fA-F]{2})+$/.test(clean)) parts = clean.match(/../g) as string[];
  else if (/^([0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}$/.test(clean))
    parts = clean.replace(/\./g, '').match(/../g) as string[];
  else return null;
  return Uint8Array.from(parts.map((p) => parseInt(p, 16)));
}

function parseNum(s: string): number | null {
  if (/^-?0x[0-9a-f]+$/i.test(s))
    return s.startsWith('-') ? -parseInt(s.slice(3), 16) : parseInt(s.slice(2), 16);
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) return Number(s);
  return null;
}

/** A literal read the way the field on the left needs it. */
function typed(lit: Tok, e: Entity, rel: Rel | 'in' | 'mask'): Typed {
  const s = lit.s;
  const quoted = lit.k === 'str';
  const err = (what: string) => new FilterError(`"${s}" is not ${what}.`, [lit.at, lit.end]);
  const f = e.field;
  if (e.fn === 'len' || e.fn === 'count') {
    const n = quoted ? null : parseNum(s);
    if (n === null) throw err('a valid number');
    return { kind: 'num', num: n };
  }
  if (e.fn === 'upper' || e.fn === 'lower') return { kind: 'str', str: s };
  if (rel === 'matches') {
    if (!quoted)
      throw new FilterError('"matches" needs a quoted regular expression.', [lit.at, lit.end]);
    return { kind: 'str', str: s };
  }
  if (e.slice || f.type === 'bytes' || f.type === 'ether' || f.type === 'proto') {
    if (rel === 'mask') {
      const n = parseNum(s);
      if (n === null) throw err('a valid number');
      return { kind: 'num', num: n };
    }
    if (quoted) return { kind: 'bytes', bytes: utf8(s) };
    const b = parseBytes(s);
    if (b && (f.type !== 'ether' || e.slice || b.length === 6 || rel === 'contains'))
      return { kind: 'bytes', bytes: b };
    if (f.type === 'ether') throw err('a valid MAC address');
    if (rel === 'contains' && f.type === 'proto') return { kind: 'bytes', bytes: utf8(s) };
    throw err('a valid byte string');
  }
  if (f.type === 'none')
    throw new FilterError(
      `"${f.abbrev}" is a label with no value; it can only be tested for presence.`,
      e.at,
    );
  if (f.type === 'str') {
    if (rel === 'mask')
      throw new FilterError(`"&" needs an integer field, and "${f.abbrev}" is a string.`, e.at);
    return { kind: 'str', str: s };
  }
  if (quoted)
    throw new FilterError(`"${f.abbrev}" is ${article(f)}; compare it without quotes.`, [
      lit.at,
      lit.end,
    ]);
  if (f.type === 'ipv4') {
    const [a, bitsStr] = s.split('/');
    let addr = parseIp(a);
    if (addr === null) {
      for (const [ipv, name] of NAMES) if (name.toLowerCase() === a.toLowerCase()) addr = ipv;
    }
    if (addr === null) throw err('a valid IPv4 address or a host name in this capture');
    const bits = bitsStr === undefined ? 32 : Number(bitsStr);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw err('a valid CIDR prefix');
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return { kind: 'ip', ip: { addr: (addr & mask) >>> 0, mask } };
  }
  if (f.type === 'bool') {
    const v = /^(1|true)$/i.test(s) ? 1 : /^(0|false)$/i.test(s) ? 0 : null;
    if (v === null) throw err('a valid boolean (1, 0, True or False)');
    return { kind: 'num', num: v };
  }
  const n = parseNum(s);
  if (n !== null) {
    if ((f.type === 'u' || f.type === 'i') && !Number.isInteger(n)) throw err('a valid integer');
    if (f.type === 'u' && n < 0) throw err('a valid unsigned integer');
    return { kind: 'num', num: n };
  }
  const named =
    f.enums && Object.entries(f.enums).find(([k]) => k.toLowerCase() === s.toLowerCase());
  if (named) return { kind: 'num', num: named[1] };
  throw err(
    f.enums ? `a valid number or one of ${Object.keys(f.enums).join(', ')}` : 'a valid number',
  );
}

/* ------------------------------------------------------------------ compile */

type Test = (p: Packet, ctx: Ctx) => boolean;

/** The value an entity yields for one occurrence: a number, string or bytes. */
function valueOf(e: Entity, o: Occ): number | string | Uint8Array | undefined {
  if (e.slice) {
    const raw = o.raw;
    const start = e.slice.start < 0 ? raw.length + e.slice.start : e.slice.start;
    const end =
      e.slice.end === undefined
        ? raw.length
        : e.slice.start < 0
          ? raw.length + e.slice.start + (e.slice.end - e.slice.start)
          : e.slice.end;
    if (start < 0 || end > raw.length || start >= end) return undefined;
    return raw.subarray(start, end);
  }
  const v = o.v;
  if (e.fn === 'len')
    return typeof v === 'string' ? v.length : v instanceof Uint8Array ? v.length : o.raw.length;
  if (e.fn === 'upper' && typeof v === 'string') return v.toUpperCase();
  if (e.fn === 'lower' && typeof v === 'string') return v.toLowerCase();
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

const beInt = (b: Uint8Array) => b.reduce((acc, x) => acc * 256 + x, 0);
function bytesHas(hay: Uint8Array, needle: Uint8Array) {
  if (!needle.length) return true;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}
function cmpBytes(a: Uint8Array, b: Uint8Array) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** One occurrence against one literal. */
function relate(rel: Rel, v: number | string | Uint8Array, lit: Typed, re?: RegExp): boolean {
  if (rel === 'matches') {
    const text = typeof v === 'string' ? v : v instanceof Uint8Array ? latin1(v) : String(v);
    return (re as RegExp).test(text);
  }
  if (rel === 'contains') {
    if (typeof v === 'string') return v.includes(lit.str ?? (lit.bytes ? latin1(lit.bytes) : ''));
    if (v instanceof Uint8Array) return bytesHas(v, lit.bytes ?? utf8(lit.str ?? ''));
    return false;
  }
  let c: number;
  if (lit.kind === 'ip' && typeof v === 'number') {
    const masked = (v & (lit.ip as { mask: number }).mask) >>> 0;
    c = masked === lit.ip?.addr ? 0 : masked < (lit.ip?.addr ?? 0) ? -1 : 1;
  } else if (typeof v === 'number') c = v - (lit.num ?? 0);
  else if (typeof v === 'string') c = v === lit.str ? 0 : v < (lit.str ?? '') ? -1 : 1;
  else c = lit.bytes ? cmpBytes(v, lit.bytes) : beInt(v) - (lit.num ?? 0);
  switch (rel) {
    case 'any_eq':
    case 'all_eq':
    case 'all_ne':
    case 'any_ne':
      return c === 0;
    case 'gt':
      return c > 0;
    case 'lt':
      return c < 0;
    case 'ge':
      return c >= 0;
    case 'le':
      return c <= 0;
  }
}

function compileAst(a: Ast): Test {
  switch (a.k) {
    case 'or': {
      const x = compileAst(a.a);
      const y = compileAst(a.b);
      return (p, c) => x(p, c) || y(p, c);
    }
    case 'and': {
      const x = compileAst(a.a);
      const y = compileAst(a.b);
      return (p, c) => x(p, c) && y(p, c);
    }
    case 'xor': {
      const x = compileAst(a.a);
      const y = compileAst(a.b);
      return (p, c) => x(p, c) !== y(p, c);
    }
    case 'not': {
      const x = compileAst(a.a);
      return (p, c) => !x(p, c);
    }
    case 'exists': {
      const f = a.e.field.abbrev;
      if (a.e.fn)
        throw new FilterError(
          `${a.e.fn}() needs to be compared with something, like ${a.e.fn}(${f}) > 1.`,
          a.e.at,
        );
      if (a.e.slice) {
        const e = a.e;
        return (p, c) => occurrences(p, f, c).some((o) => valueOf(e, o) !== undefined);
      }
      return (p, c) => occurrences(p, f, c).length > 0;
    }
    case 'bitand': {
      const e = a.e;
      if (!['u', 'i', 'bool'].includes(e.field.type) && !e.slice)
        throw new FilterError(
          `"&" needs an integer field or a slice, and "${e.field.abbrev}" is ${article(e.field)}.`,
          e.at,
        );
      const m = typed(a.mask.tok, e, 'mask').num ?? 0;
      const f = e.field.abbrev;
      return (p, c) =>
        occurrences(p, f, c).some((o) => {
          const v = valueOf(e, o);
          const n = v instanceof Uint8Array ? beInt(v) : typeof v === 'number' ? v : 0;
          return (n & m) !== 0;
        });
    }
    case 'in': {
      const e = a.e;
      const f = e.field.abbrev;
      const items = a.set.map((l) => ({
        from: typed(l.tok, e, 'in'),
        to: l.to ? typed(l.to, e, 'in') : undefined,
      }));
      const hit = (v: number | string | Uint8Array) =>
        items.some(({ from, to }) =>
          to ? relate('ge', v, from) && relate('le', v, to) : relate('any_eq', v, from),
        );
      return (p, c) => {
        const any = (
          e.fn === 'count'
            ? [occurrences(p, f, c).length]
            : occurrences(p, f, c).map((o) => valueOf(e, o))
        ).some((v) => v !== undefined && hit(v));
        return a.negate ? !any : any;
      };
    }
    case 'rel': {
      const e = a.e;
      const f = e.field.abbrev;
      if (e.field.type === 'none' && !e.fn)
        throw new FilterError(
          `"${f}" is a label with no value; it can only be tested for presence.`,
          e.at,
        );
      if (
        (a.rel === 'contains' || a.rel === 'matches') &&
        !e.slice &&
        !e.fn &&
        !['str', 'bytes', 'proto', 'ether'].includes(e.field.type)
      )
        throw new FilterError(
          `"${f}" is ${article(e.field)}; "${a.rel}" needs a string, bytes or a protocol.`,
          e.at,
        );
      if (
        a.rel !== 'contains' &&
        a.rel !== 'matches' &&
        e.field.type === 'proto' &&
        !e.slice &&
        !e.fn
      )
        throw new FilterError(
          `"${f}" is a protocol; test it on its own, with "contains", or slice it.`,
          e.at,
        );
      const lit = typed(a.v.tok, e, a.rel);
      let re: RegExp | undefined;
      if (a.rel === 'matches') {
        let body = lit.str ?? '';
        let flags = '';
        if (body.startsWith('(?i)')) {
          body = body.slice(4);
          flags = 'i';
        }
        try {
          re = new RegExp(body, flags);
        } catch {
          throw new FilterError(`"${lit.str}" is not a valid regular expression.`, [
            a.v.tok.at,
            a.v.tok.end,
          ]);
        }
      }
      const mask = a.mask ? (typed(a.mask.tok, e, 'mask').num ?? 0) : undefined;
      const rel = a.rel;
      const one = (v: number | string | Uint8Array | undefined) => {
        if (v === undefined) return false;
        if (mask !== undefined) v = (v instanceof Uint8Array ? beInt(v) : Number(v)) & mask;
        return relate(rel, v, lit, re);
      };
      return (p, c) => {
        const occ = occurrences(p, f, c);
        const vals = e.fn === 'count' ? [occ.length] : occ.map((o) => valueOf(e, o));
        if (rel === 'all_ne') return !vals.some(one);
        if (rel === 'all_eq') return vals.length > 0 && vals.every(one);
        if (rel === 'any_ne') return vals.some((v) => v !== undefined && !one(v));
        return vals.some(one);
      };
    }
  }
}

export interface Compiled {
  text: string;
  test: (p: Packet, ctx?: Ctx) => boolean;
  warning?: string;
}

export type Result =
  | { ok: true; filter: Compiled | null; warning?: string }
  | { ok: false; error: string; at: [number, number] };

const memo = new Map<string, Result>();

/** Parses and compiles a filter. An empty one is valid and matches everything. */
export function compile(text: string): Result {
  const hit = memo.get(text);
  if (hit) return hit;
  let out: Result;
  if (!text.trim()) out = { ok: true, filter: null };
  else {
    try {
      const parser = new Parser(lex(text));
      const ast = parser.parse();
      const test = compileAst(ast);
      const warning = parser.warnings[0];
      out = {
        ok: true,
        filter: { text, test: (p, ctx = NO_CTX) => test(p, ctx), warning },
        warning,
      };
    } catch (e) {
      if (!(e instanceof FilterError)) throw e;
      out = { ok: false, error: e.message, at: e.at };
    }
  }
  if (memo.size > 300) memo.clear();
  memo.set(text, out);
  return out;
}

/* ------------------------------------------------------------------ building filters */

/** "tcp.srcport == 443": a node as a filter, the way Apply as Filter writes it. */
export function filterFor(n: Node): string | null {
  if (!n.f) return null;
  const def = lookup(n.f);
  if (!def) return null;
  const v = n.v;
  switch (def.type) {
    case 'proto':
    case 'none':
      return def.abbrev;
    case 'u':
    case 'i':
      return typeof v === 'number'
        ? `${def.abbrev} == ${def.hex && v >= 0 ? `0x${hex(v, def.hex)}` : v}`
        : def.abbrev;
    case 'f':
      return typeof v === 'number' ? `${def.abbrev} == ${+v.toFixed(9)}` : def.abbrev;
    case 'bool':
      return `${def.abbrev} == ${v ? 1 : 0}`;
    case 'ipv4':
      return typeof v === 'number' ? `${def.abbrev} == ${ip4(v)}` : def.abbrev;
    case 'ether':
      return v instanceof Uint8Array ? `${def.abbrev} == ${mac(v)}` : def.abbrev;
    case 'str':
      return typeof v === 'string' ? `${def.abbrev} == ${JSON.stringify(v)}` : def.abbrev;
    case 'bytes':
      return v instanceof Uint8Array
        ? `${def.abbrev} == ${hexBytes(v.subarray(0, 64), ':')}`
        : def.abbrev;
  }
}

/** Field names that complete the word being typed. */
export function completions(prefix: string, max = 9): FieldDef[] {
  if (!prefix || /^[\d"]/.test(prefix)) return [];
  const p = prefix.toLowerCase();
  const direct = ALL_FIELDS.filter((f) => f.abbrev.startsWith(p) && f.abbrev !== p);
  // Prefer the next level down: "tcp." offers tcp.port before tcp.analysis.acks_frame.
  const depth = p.split('.').length;
  direct.sort(
    (a, b) =>
      a.abbrev.split('.').length - depth - (b.abbrev.split('.').length - depth) ||
      a.abbrev.localeCompare(b.abbrev),
  );
  return direct.slice(0, max);
}

/* ------------------------------------------------------------------ colouring rules */

export interface ColorRule {
  id: string;
  name: string;
  filter: string;
  /** Whether the rule ships with the tool or was added in this profile. */
  custom?: boolean;
}

export const COLOR_RULES: ColorRule[] = [
  { id: 'badtcp', name: 'Bad TCP', filter: 'tcp.analysis.flags && !tcp.analysis.window_update' },
  { id: 'arp', name: 'ARP', filter: 'arp' },
  { id: 'rst', name: 'TCP RST', filter: 'tcp.flags.reset eq 1' },
  { id: 'ttl', name: 'TTL low or unexpected', filter: 'ip.dst != 224.0.0.0/4 && ip.ttl < 5' },
  { id: 'http', name: 'HTTP', filter: 'http || tcp.port == 80' },
  { id: 'synfin', name: 'TCP SYN/FIN', filter: 'tcp.flags & 0x02 || tcp.flags.fin == 1' },
  { id: 'tcp', name: 'TCP', filter: 'tcp' },
  { id: 'udp', name: 'UDP', filter: 'udp' },
  { id: 'broadcast', name: 'Broadcast', filter: 'eth[0] & 1' },
  { id: 'bleatt', name: 'BLE attribute protocol', filter: 'btatt', custom: true },
  { id: 'ble', name: 'BLE link layer', filter: 'btle', custom: true },
];
