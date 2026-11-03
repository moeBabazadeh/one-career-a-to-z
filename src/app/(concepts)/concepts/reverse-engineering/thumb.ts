// A small Thumb-2 toolchain for the Cortex-M subset moe.bin is written in: a line assembler that
// parses the source, an encoder that turns each instruction into its real halfwords, and a
// decoder that reads them back. The image is assembled with the first two and the listing is a
// disassembly made with the third, so every byte in the hex view is the instruction it shows.

export const REG = [
  'r0',
  'r1',
  'r2',
  'r3',
  'r4',
  'r5',
  'r6',
  'r7',
  'r8',
  'r9',
  'r10',
  'r11',
  'r12',
  'sp',
  'lr',
  'pc',
];
export const SP = 13;
export const LR = 14;
export const PC = 15;

export const CONDS = [
  'eq',
  'ne',
  'cs',
  'cc',
  'mi',
  'pl',
  'vs',
  'vc',
  'hi',
  'ls',
  'ge',
  'lt',
  'gt',
  'le',
] as const;
export type Cond = (typeof CONDS)[number];

/** The sixteen 16-bit data-processing operations, in encoding order. */
export const ALU = [
  'ands',
  'eors',
  'lsls',
  'lsrs',
  'asrs',
  'adcs',
  'sbcs',
  'rors',
  'tst',
  'rsbs',
  'cmp',
  'cmn',
  'orrs',
  'muls',
  'bics',
  'mvns',
] as const;
export type Alu = (typeof ALU)[number];

const HINTS = ['nop', 'yield', 'wfe', 'wfi', 'sev'] as const;
type Hint = (typeof HINTS)[number];

export type Ins =
  | { op: 'push' | 'pop'; regs: number[] }
  | { op: 'movs' | 'cmp' | 'adds' | 'subs'; rd: number; imm: number }
  | { op: 'movw' | 'movt'; rd: number; imm: number }
  | { op: 'mov'; rd: number; rm: number }
  /** Immediate offset; rn 13 is sp-relative and rn 15 a literal load. */
  | { op: 'ldr' | 'str' | 'ldrb' | 'strb' | 'ldrh' | 'strh'; rt: number; rn: number; imm: number }
  /** Register offset: ldr rt, [rn, rm]. */
  | { op: 'ldrr'; rt: number; rn: number; rm: number }
  | { op: 'lsli' | 'lsri'; rd: number; rm: number; imm: number }
  | { op: 'alu'; alu: Alu; rd: number; rm: number }
  | { op: 'b'; cond: Cond | null; off: number }
  | { op: 'cbz' | 'cbnz'; rn: number; off: number }
  | { op: 'bl'; off: number }
  | { op: 'bx'; rm: number }
  | { op: 'sp'; sub: boolean; imm: number }
  | { op: 'udiv'; rd: number; rn: number; rm: number }
  | { op: 'mls'; rd: number; rn: number; rm: number; ra: number }
  | { op: 'hint'; name: Hint }
  | { op: 'cps'; enable: boolean }
  | { op: 'bkpt' | 'udf'; imm: number };

const fail = (msg: string): never => {
  throw new Error(`thumb: ${msg}`);
};

const range = (v: number, lo: number, hi: number, step: number, what: string) => {
  if (v < lo || v > hi || v % step) fail(`${what} ${v} out of range`);
  return v;
};

const low = (r: number) => r >= 0 && r < 8;
const lowReg = (r: number, what = 'register') => (low(r) ? r : fail(`${what} must be r0-r7`));

/* ------------------------------------------------------------------ encoder */

/** The halfwords of one instruction. Branch offsets are from the instruction's address + 4. */
export function encode(i: Ins): number[] {
  switch (i.op) {
    case 'push':
    case 'pop': {
      const wide = i.op === 'push' ? LR : PC;
      const mask = i.regs.filter(low).reduce((m, r) => m | (1 << r), 0);
      if (i.regs.some((r) => !low(r) && r !== wide)) fail(`${i.op} list`);
      return [(i.op === 'push' ? 0xb400 : 0xbc00) | (i.regs.includes(wide) ? 0x100 : 0) | mask];
    }
    case 'movs':
    case 'cmp':
    case 'adds':
    case 'subs': {
      const base = { movs: 0x2000, cmp: 0x2800, adds: 0x3000, subs: 0x3800 }[i.op];
      return [base | (lowReg(i.rd) << 8) | range(i.imm, 0, 255, 1, 'imm8')];
    }
    case 'movw':
    case 'movt': {
      const v = range(i.imm, 0, 0xffff, 1, 'imm16');
      return [
        (i.op === 'movw' ? 0xf240 : 0xf2c0) | (((v >> 11) & 1) << 10) | ((v >> 12) & 0xf),
        (((v >> 8) & 7) << 12) | (i.rd << 8) | (v & 0xff),
      ];
    }
    case 'mov':
      return [0x4600 | ((i.rd & 8) << 4) | (i.rm << 3) | (i.rd & 7)];
    case 'ldr':
    case 'str': {
      if (i.rn === PC) {
        if (i.op === 'str') fail('str to pc');
        return [0x4800 | (lowReg(i.rt) << 8) | (range(i.imm, 0, 1020, 4, 'literal offset') >> 2)];
      }
      if (i.rn === SP)
        return [
          (i.op === 'ldr' ? 0x9800 : 0x9000) |
            (lowReg(i.rt) << 8) |
            (range(i.imm, 0, 1020, 4, 'sp offset') >> 2),
        ];
      return [
        (i.op === 'ldr' ? 0x6800 : 0x6000) |
          ((range(i.imm, 0, 124, 4, 'word offset') >> 2) << 6) |
          (lowReg(i.rn) << 3) |
          lowReg(i.rt),
      ];
    }
    case 'ldrb':
    case 'strb':
      return [
        (i.op === 'ldrb' ? 0x7800 : 0x7000) |
          (range(i.imm, 0, 31, 1, 'byte offset') << 6) |
          (lowReg(i.rn) << 3) |
          lowReg(i.rt),
      ];
    case 'ldrh':
    case 'strh':
      return [
        (i.op === 'ldrh' ? 0x8800 : 0x8000) |
          ((range(i.imm, 0, 62, 2, 'halfword offset') >> 1) << 6) |
          (lowReg(i.rn) << 3) |
          lowReg(i.rt),
      ];
    case 'ldrr':
      return [0x5800 | (lowReg(i.rm) << 6) | (lowReg(i.rn) << 3) | lowReg(i.rt)];
    case 'lsli':
    case 'lsri':
      return [
        (i.op === 'lsli' ? 0 : 0x0800) |
          ((range(i.imm, i.op === 'lsli' ? 0 : 1, i.op === 'lsli' ? 31 : 32, 1, 'shift') & 31) <<
            6) |
          (lowReg(i.rm) << 3) |
          lowReg(i.rd),
      ];
    case 'alu':
      return [0x4000 | (ALU.indexOf(i.alu) << 6) | (lowReg(i.rm) << 3) | lowReg(i.rd)];
    case 'b':
      if (i.cond)
        return [
          0xd000 |
            (CONDS.indexOf(i.cond) << 8) |
            ((range(i.off, -256, 254, 2, 'b<c> offset') >> 1) & 0xff),
        ];
      return [0xe000 | ((range(i.off, -2048, 2046, 2, 'b offset') >> 1) & 0x7ff)];
    case 'cbz':
    case 'cbnz': {
      const off = range(i.off, 0, 126, 2, 'cbz offset');
      return [
        (i.op === 'cbz' ? 0xb100 : 0xb900) |
          (((off >> 6) & 1) << 9) |
          (((off >> 1) & 0x1f) << 3) |
          lowReg(i.rn),
      ];
    }
    case 'bl': {
      const off = range(i.off, -(1 << 24), (1 << 24) - 2, 2, 'bl offset');
      const s = off < 0 ? 1 : 0;
      const j1 = ~(((off >> 23) & 1) ^ s) & 1;
      const j2 = ~(((off >> 22) & 1) ^ s) & 1;
      return [
        0xf000 | (s << 10) | ((off >> 12) & 0x3ff),
        0xd000 | (j1 << 13) | (j2 << 11) | ((off >> 1) & 0x7ff),
      ];
    }
    case 'bx':
      return [0x4700 | (i.rm << 3)];
    case 'sp':
      return [(i.sub ? 0xb080 : 0xb000) | (range(i.imm, 0, 508, 4, 'sp adjust') >> 2)];
    case 'udiv':
      return [0xfbb0 | i.rn, 0xf0f0 | (i.rd << 8) | i.rm];
    case 'mls':
      return [0xfb00 | i.rn, (i.ra << 12) | (i.rd << 8) | 0x10 | i.rm];
    case 'hint':
      return [0xbf00 | (HINTS.indexOf(i.name) << 4)];
    case 'cps':
      return [i.enable ? 0xb662 : 0xb672];
    case 'bkpt':
      return [0xbe00 | range(i.imm, 0, 255, 1, 'bkpt')];
    case 'udf':
      return [0xde00 | range(i.imm, 0, 255, 1, 'udf')];
  }
}

/** True when a halfword starts a 32-bit instruction. */
export const isWide = (h: number) =>
  h >>> 11 === 0b11101 || h >>> 11 === 0b11110 || h >>> 11 === 0b11111;

/* ------------------------------------------------------------------ decoder */

const sext = (v: number, bits: number) => (v << (32 - bits)) >> (32 - bits);

/** One instruction from its halfwords, or null when it isn't in the subset (or isn't code). */
export function decode(h: number, h2: number): { ins: Ins; size: 2 | 4 } | null {
  if (isWide(h)) {
    const ins = decode32(h, h2);
    return ins ? { ins, size: 4 } : null;
  }
  const ins = decode16(h);
  return ins ? { ins, size: 2 } : null;
}

function decode32(h: number, h2: number): Ins | null {
  if ((h & 0xf800) === 0xf000 && (h2 & 0xd000) === 0xd000) {
    const s = (h >> 10) & 1;
    const i1 = ~(((h2 >> 13) & 1) ^ s) & 1;
    const i2 = ~(((h2 >> 11) & 1) ^ s) & 1;
    const imm = (s << 24) | (i1 << 23) | (i2 << 22) | ((h & 0x3ff) << 12) | ((h2 & 0x7ff) << 1);
    return { op: 'bl', off: sext(imm, 25) };
  }
  if (((h & 0xfbf0) === 0xf240 || (h & 0xfbf0) === 0xf2c0) && !(h2 & 0x8000)) {
    const imm = ((h & 0xf) << 12) | (((h >> 10) & 1) << 11) | (((h2 >> 12) & 7) << 8) | (h2 & 0xff);
    return { op: (h & 0xfbf0) === 0xf240 ? 'movw' : 'movt', rd: (h2 >> 8) & 0xf, imm };
  }
  if ((h & 0xfff0) === 0xfbb0 && (h2 & 0xf0f0) === 0xf0f0)
    return { op: 'udiv', rd: (h2 >> 8) & 0xf, rn: h & 0xf, rm: h2 & 0xf };
  if ((h & 0xfff0) === 0xfb00 && (h2 & 0xf0) === 0x10)
    return { op: 'mls', rd: (h2 >> 8) & 0xf, rn: h & 0xf, rm: h2 & 0xf, ra: h2 >>> 12 };
  return null;
}

function decode16(h: number): Ins | null {
  const r3 = (s: number) => (h >> s) & 7;
  if ((h & 0xfe00) === 0xb400 || (h & 0xfe00) === 0xbc00) {
    const push = (h & 0xfe00) === 0xb400;
    const regs = [0, 1, 2, 3, 4, 5, 6, 7].filter((r) => h & (1 << r));
    if (h & 0x100) regs.push(push ? LR : PC);
    return { op: push ? 'push' : 'pop', regs };
  }
  if ((h & 0xe000) === 0x2000)
    return {
      op: (['movs', 'cmp', 'adds', 'subs'] as const)[(h >> 11) & 3],
      rd: r3(8),
      imm: h & 0xff,
    };
  if ((h & 0xff87) === 0x4700) return { op: 'bx', rm: (h >> 3) & 0xf };
  if ((h & 0xff00) === 0x4600)
    return { op: 'mov', rd: ((h >> 4) & 8) | (h & 7), rm: (h >> 3) & 0xf };
  if ((h & 0xfc00) === 0x4000) return { op: 'alu', alu: ALU[(h >> 6) & 0xf], rd: h & 7, rm: r3(3) };
  if ((h & 0xf800) === 0x4800) return { op: 'ldr', rt: r3(8), rn: PC, imm: (h & 0xff) << 2 };
  if ((h & 0xfe00) === 0x5800) return { op: 'ldrr', rt: h & 7, rn: r3(3), rm: r3(6) };
  if ((h & 0xe000) === 0x6000 || (h & 0xf000) === 0x8000) {
    const kind = (h >> 12) & 0xf;
    const load = !!(h & 0x800);
    const off = (h >> 6) & 0x1f;
    if (kind === 6) return { op: load ? 'ldr' : 'str', rt: h & 7, rn: r3(3), imm: off << 2 };
    if (kind === 7) return { op: load ? 'ldrb' : 'strb', rt: h & 7, rn: r3(3), imm: off };
    return { op: load ? 'ldrh' : 'strh', rt: h & 7, rn: r3(3), imm: off << 1 };
  }
  if ((h & 0xf000) === 0x9000)
    return { op: h & 0x800 ? 'ldr' : 'str', rt: r3(8), rn: SP, imm: (h & 0xff) << 2 };
  if ((h & 0xf000) === 0x0000)
    return {
      op: h & 0x800 ? 'lsri' : 'lsli',
      rd: h & 7,
      rm: r3(3),
      imm: h & 0x800 && !((h >> 6) & 0x1f) ? 32 : (h >> 6) & 0x1f,
    };
  if ((h & 0xff00) === 0xb000) return { op: 'sp', sub: !!(h & 0x80), imm: (h & 0x7f) << 2 };
  if ((h & 0xf500) === 0xb100)
    return {
      op: h & 0x800 ? 'cbnz' : 'cbz',
      rn: h & 7,
      off: (((h >> 9) & 1) << 6) | (((h >> 3) & 0x1f) << 1),
    };
  if ((h & 0xff0f) === 0xbf00 && ((h >> 4) & 0xf) < HINTS.length)
    return { op: 'hint', name: HINTS[(h >> 4) & 0xf] };
  if (h === 0xb662 || h === 0xb672) return { op: 'cps', enable: h === 0xb662 };
  if ((h & 0xff00) === 0xbe00) return { op: 'bkpt', imm: h & 0xff };
  if ((h & 0xff00) === 0xde00) return { op: 'udf', imm: h & 0xff };
  if ((h & 0xf000) === 0xd000 && ((h >> 8) & 0xf) < CONDS.length)
    return { op: 'b', cond: CONDS[(h >> 8) & 0xf], off: sext(h & 0xff, 8) << 1 };
  if ((h & 0xf800) === 0xe000) return { op: 'b', cond: null, off: sext(h & 0x7ff, 11) << 1 };
  return null;
}

/* ------------------------------------------------------------------ text */

export type Flow = 'seq' | 'call' | 'jump' | 'cjump' | 'ret' | 'halt';

/** An operand piece, so the listing can colour registers and turn addresses into names. */
export interface Op {
  t: 'reg' | 'imm' | 'addr' | 'lit' | 'txt';
  v: string;
  /** For `addr`: the branch target. For `lit`: the literal pool word it loads. */
  at?: number;
}

export interface Text {
  mn: string;
  ops: Op[];
  flow: Flow;
}

export const hex = (n: number, w = 0) => (n >>> 0).toString(16).padStart(w, '0');
const imm = (n: number): Op => ({
  t: 'imm',
  v: n > 9 || n < -9 ? `#${n < 0 ? '-' : ''}0x${hex(Math.abs(n))}` : `#${n}`,
});
const reg = (r: number): Op => ({ t: 'reg', v: REG[r] });
const txt = (v: string): Op => ({ t: 'txt', v });
const comma = txt(', ');

const regList = (regs: number[]) => {
  const out: Op[] = [txt('{')];
  regs.forEach((r, k) => {
    if (k) out.push(comma);
    out.push(reg(r));
  });
  out.push(txt('}'));
  return out;
};

const mem = (rn: number, off: Op | number): Op[] => {
  if (typeof off === 'number' && off === 0) return [txt('['), reg(rn), txt(']')];
  return [txt('['), reg(rn), comma, typeof off === 'number' ? imm(off) : off, txt(']')];
};

/** The mnemonic and operands as a disassembler prints them, with targets resolved. */
export function text(i: Ins, addr: number): Text {
  const pc = addr + 4;
  const target = (off: number): Op => ({ t: 'addr', v: hex(pc + off, 8), at: pc + off });
  switch (i.op) {
    case 'push':
      return { mn: 'push', ops: regList(i.regs), flow: 'seq' };
    case 'pop':
      return { mn: 'pop', ops: regList(i.regs), flow: i.regs.includes(PC) ? 'ret' : 'seq' };
    case 'movs':
    case 'cmp':
    case 'adds':
    case 'subs':
    case 'movw':
    case 'movt':
      return { mn: i.op, ops: [reg(i.rd), comma, imm(i.imm)], flow: 'seq' };
    case 'mov':
      return { mn: 'mov', ops: [reg(i.rd), comma, reg(i.rm)], flow: i.rd === PC ? 'ret' : 'seq' };
    case 'ldr':
      if (i.rn === PC) {
        const lit = ((pc & ~3) + i.imm) >>> 0;
        return {
          mn: 'ldr',
          ops: [reg(i.rt), comma, { t: 'lit', v: `[pc, #0x${hex(i.imm)}]`, at: lit }],
          flow: 'seq',
        };
      }
      return { mn: 'ldr', ops: [reg(i.rt), comma, ...mem(i.rn, i.imm)], flow: 'seq' };
    case 'str':
    case 'ldrb':
    case 'strb':
    case 'ldrh':
    case 'strh':
      return { mn: i.op, ops: [reg(i.rt), comma, ...mem(i.rn, i.imm)], flow: 'seq' };
    case 'ldrr':
      return { mn: 'ldr', ops: [reg(i.rt), comma, ...mem(i.rn, reg(i.rm))], flow: 'seq' };
    case 'lsli':
    case 'lsri':
      return {
        mn: i.op === 'lsli' ? 'lsls' : 'lsrs',
        ops: [reg(i.rd), comma, reg(i.rm), comma, imm(i.imm)],
        flow: 'seq',
      };
    case 'alu':
      return { mn: i.alu, ops: [reg(i.rd), comma, reg(i.rm)], flow: 'seq' };
    case 'b':
      return {
        mn: i.cond ? `b${i.cond}` : 'b',
        ops: [target(i.off)],
        flow: i.cond ? 'cjump' : i.off === -4 ? 'halt' : 'jump',
      };
    case 'cbz':
    case 'cbnz':
      return { mn: i.op, ops: [reg(i.rn), comma, target(i.off)], flow: 'cjump' };
    case 'bl':
      return { mn: 'bl', ops: [target(i.off)], flow: 'call' };
    case 'bx':
      return { mn: 'bx', ops: [reg(i.rm)], flow: i.rm === LR ? 'ret' : 'jump' };
    case 'sp':
      return { mn: i.sub ? 'sub' : 'add', ops: [reg(SP), comma, imm(i.imm)], flow: 'seq' };
    case 'udiv':
      return { mn: 'udiv', ops: [reg(i.rd), comma, reg(i.rn), comma, reg(i.rm)], flow: 'seq' };
    case 'mls':
      return {
        mn: 'mls',
        ops: [reg(i.rd), comma, reg(i.rn), comma, reg(i.rm), comma, reg(i.ra)],
        flow: 'seq',
      };
    case 'hint':
      return { mn: i.name, ops: [], flow: 'seq' };
    case 'cps':
      return { mn: i.enable ? 'cpsie' : 'cpsid', ops: [txt('i')], flow: 'seq' };
    case 'bkpt':
    case 'udf':
      return { mn: i.op, ops: [imm(i.imm)], flow: i.op === 'udf' ? 'halt' : 'seq' };
  }
}

/* ------------------------------------------------------------------ assembler */

/** A literal-pool operand: `=symbol`, `=0x40011000` or `="text"`. */
export type Lit = { sym: string } | { num: number } | { str: string };

/** A parsed source line, with names left for the linker to resolve. */
export type Src =
  | { k: 'ins'; ins: Ins }
  | { k: 'br'; op: 'b' | 'cbz' | 'cbnz'; cond: Cond | null; rn: number; label: string }
  | { k: 'bl'; sym: string }
  | { k: 'lit'; rt: number; lit: Lit }
  | { k: 'label'; name: string };

const regOf = (s: string) => {
  const r = REG.indexOf(s.trim().toLowerCase());
  return r < 0 ? fail(`bad register "${s}"`) : r;
};

const immOf = (s: string) => {
  const t = s.trim();
  if (!t.startsWith('#')) fail(`expected an immediate, got "${t}"`);
  const n = Number(t.slice(1));
  return Number.isFinite(n) ? n : fail(`bad immediate "${t}"`);
};

/** Operands split on the commas that aren't inside brackets, braces or quotes. */
function operands(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = '';
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (quote) {
      cur += c;
      if (c === '\\') cur += s[++k];
      else if (c === '"') quote = false;
      continue;
    }
    if (c === '"') quote = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function regs(list: string): number[] {
  const inner = list.trim().replace(/^\{|\}$/g, '');
  return inner.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map((x) => regOf(x));
    if (b === undefined) return [a];
    return Array.from({ length: b - a + 1 }, (_, k) => a + k);
  });
}

function memOf(s: string): { rn: number; imm: number; rm?: number } {
  const m = s.trim().match(/^\[([^\],]+)(?:,\s*([^\]]+))?\]$/);
  if (!m) return fail(`bad memory operand "${s}"`);
  const rn = regOf(m[1]);
  if (!m[2]) return { rn, imm: 0 };
  if (m[2].trim().startsWith('#')) return { rn, imm: immOf(m[2]) };
  return { rn, imm: 0, rm: regOf(m[2]) };
}

function litOf(s: string): Lit {
  const t = s.trim();
  if (t.startsWith('"')) return { str: JSON.parse(t) as string };
  if (/^-?(0x[0-9a-f]+|\d+)$/i.test(t)) return { num: Number(t) };
  return { sym: t };
}

const COND_ALIAS: Record<string, Cond> = { hs: 'cs', lo: 'cc' };
const condOf = (s: string): Cond | null | undefined => {
  if (s === '') return null;
  if (s in COND_ALIAS) return COND_ALIAS[s];
  return (CONDS as readonly string[]).includes(s) ? (s as Cond) : undefined;
};

/** One line of assembly. */
export function parse(line: string): Src {
  const src = line.trim();
  const label = src.match(/^([A-Za-z_.$][\w.$]*):$/);
  if (label) return { k: 'label', name: label[1] };
  const sp = src.search(/\s/);
  const mn = (sp < 0 ? src : src.slice(0, sp)).toLowerCase();
  const ops = sp < 0 ? [] : operands(src.slice(sp + 1));

  switch (mn) {
    case 'push':
    case 'pop':
      return { k: 'ins', ins: { op: mn, regs: regs(ops.join(',')) } };
    case 'movs':
    case 'adds':
    case 'subs':
      return { k: 'ins', ins: { op: mn, rd: regOf(ops[0]), imm: immOf(ops[1]) } };
    case 'cmp':
      if (ops[1].trim().startsWith('#'))
        return { k: 'ins', ins: { op: 'cmp', rd: regOf(ops[0]), imm: immOf(ops[1]) } };
      return { k: 'ins', ins: { op: 'alu', alu: 'cmp', rd: regOf(ops[0]), rm: regOf(ops[1]) } };
    case 'movw':
    case 'movt':
      return { k: 'ins', ins: { op: mn, rd: regOf(ops[0]), imm: immOf(ops[1]) } };
    case 'mov':
      return { k: 'ins', ins: { op: 'mov', rd: regOf(ops[0]), rm: regOf(ops[1]) } };
    case 'add':
    case 'sub':
      if (regOf(ops[0]) !== SP) fail(`${mn} only adjusts sp`);
      return { k: 'ins', ins: { op: 'sp', sub: mn === 'sub', imm: immOf(ops[ops.length - 1]) } };
    case 'ldr':
    case 'str':
    case 'ldrb':
    case 'strb':
    case 'ldrh':
    case 'strh': {
      const rt = regOf(ops[0]);
      if (ops[1].trim().startsWith('=')) {
        if (mn !== 'ldr') fail('only ldr takes a literal');
        return { k: 'lit', rt, lit: litOf(ops[1].trim().slice(1)) };
      }
      const m = memOf(ops[1]);
      if (m.rm !== undefined) {
        if (mn !== 'ldr') fail('register offset is ldr only');
        return { k: 'ins', ins: { op: 'ldrr', rt, rn: m.rn, rm: m.rm } };
      }
      return { k: 'ins', ins: { op: mn, rt, rn: m.rn, imm: m.imm } };
    }
    case 'lsls':
    case 'lsrs':
      return {
        k: 'ins',
        ins: {
          op: mn === 'lsls' ? 'lsli' : 'lsri',
          rd: regOf(ops[0]),
          rm: regOf(ops[1]),
          imm: immOf(ops[2]),
        },
      };
    case 'ands':
    case 'eors':
    case 'tst':
    case 'orrs':
    case 'muls':
    case 'bics':
    case 'mvns':
      return { k: 'ins', ins: { op: 'alu', alu: mn, rd: regOf(ops[0]), rm: regOf(ops[1]) } };
    case 'cbz':
    case 'cbnz':
      return { k: 'br', op: mn, cond: null, rn: regOf(ops[0]), label: ops[1] };
    case 'bl':
      return { k: 'bl', sym: ops[0] };
    case 'bx':
      return { k: 'ins', ins: { op: 'bx', rm: regOf(ops[0]) } };
    case 'udiv':
      return {
        k: 'ins',
        ins: { op: 'udiv', rd: regOf(ops[0]), rn: regOf(ops[1]), rm: regOf(ops[2]) },
      };
    case 'mls':
      return {
        k: 'ins',
        ins: {
          op: 'mls',
          rd: regOf(ops[0]),
          rn: regOf(ops[1]),
          rm: regOf(ops[2]),
          ra: regOf(ops[3]),
        },
      };
    case 'cpsid':
    case 'cpsie':
      return { k: 'ins', ins: { op: 'cps', enable: mn === 'cpsie' } };
    case 'bkpt':
    case 'udf':
      return { k: 'ins', ins: { op: mn, imm: ops.length ? immOf(ops[0]) : 0 } };
  }
  if ((HINTS as readonly string[]).includes(mn))
    return { k: 'ins', ins: { op: 'hint', name: mn as Hint } };
  if (mn.startsWith('b')) {
    const cond = condOf(mn.slice(1));
    if (cond !== undefined) return { k: 'br', op: 'b', cond, rn: 0, label: ops[0] };
  }
  return fail(`unknown instruction "${src}"`);
}

/** The size in bytes a parsed line will take once assembled. */
export function sizeOf(s: Src): number {
  if (s.k === 'label') return 0;
  if (s.k === 'bl') return 4;
  if (s.k === 'br' || s.k === 'lit') return 2;
  return encode(s.ins).length * 2;
}
