// Auto-analysis. Knows nothing about the source: it reads moe.bin's bytes the way a disassembler
// would. The vector table gives the entry points, recursive descent finds every instruction and
// every function reachable by a call, literal pools become data and references, the embedded
// symbol table names things, career.h types the structs, and a scan finds the strings. Each fact
// records the pass that found it, so the listing can show the analysis filling in.
import { PRIM_SIZE, TYPES, VECTOR_SLOTS, type Prim } from './career';
import { SYM, SYMTAB_MAGIC, typeName } from './link';
import { decode, hex, text, type Ins, type Text } from './thumb';

/** The passes, in order. Stage n means the first n have run. */
export const PASSES = [
  'Load raw binary',
  'ARM Cortex-M vector table',
  'Disassemble (recursive descent)',
  'Literal pools and references',
  'Embedded symbol table',
  'Apply data types (career.h)',
  'ASCII and UTF-8 strings',
  'Call graph and decompiler',
] as const;

export const STAGE = {
  LOADED: 1,
  VECTORS: 2,
  CODE: 3,
  REFS: 4,
  SYMBOLS: 5,
  TYPES: 6,
  STRINGS: 7,
  DONE: 8,
} as const;

export type DataType = 'addr' | 'ptr' | 'u8' | 'u16' | 'u32' | 'ym' | 'magic';

export type Unit =
  | { k: 'ins'; addr: number; size: number; stage: number; ins: Ins; t: Text }
  | {
      k: 'data';
      addr: number;
      size: number;
      stage: number;
      dt: DataType;
      value: number;
      field?: string;
      obj?: number;
      values?: string[];
      flags?: boolean;
    }
  | { k: 'str'; addr: number; size: number; stage: number; s: string; sym?: boolean }
  | { k: 'align'; addr: number; size: number; stage: number };

export type RefKind = 'c' | 'j' | 'r' | '*';

export interface Xref {
  from: number;
  to: number;
  kind: RefKind;
  stage: number;
}

export interface Label {
  /** The name analysis gives it before symbols, and when. */
  auto: string;
  autoStage: number;
  /** The embedded symbol table's name. */
  sym?: string;
  /** The name the string pass gives a DAT_ label once it finds a string there. */
  str?: string;
  kind: 'fun' | 'lab' | 'dat' | 'str' | 'vec' | 'abs';
}

export interface Fn {
  addr: number;
  /** End of its instructions. */
  end: number;
  calls: number[];
  callers: number[];
}

export interface Obj {
  addr: number;
  size: number;
  type: string;
  count: number;
}

export interface Program {
  base: number;
  end: number;
  bytes: Uint8Array;
  units: Unit[];
  fns: Map<number, Fn>;
  /** Function entries, by address. */
  fnList: number[];
  labels: Map<number, Label>;
  xrefs: Map<number, Xref[]>;
  objs: Map<number, Obj>;
  sections: { name: string; start: number; end: number; flags: string }[];
  /** A line for the console per pass. */
  log: string[];
  symtab: number;
}

const RAM = [0x20000000, 0x20020000];
const PERIPH = [0x40000000, 0x60000000];
const within = (a: number, [lo, hi]: number[]) => a >= lo && a < hi;

export function analyze(bytes: Uint8Array, base: number): Program {
  const end = base + bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u8 = (a: number) => view.getUint8(a - base);
  const u16 = (a: number) => view.getUint16(a - base, true);
  const u32 = (a: number) => view.getUint32(a - base, true);
  const inImage = (a: number) => a >= base && a < end;

  const units = new Map<number, Unit>();
  const owner = new Map<number, number>(); // byte → its unit's start, to keep units from overlapping
  const put = (u: Unit) => {
    for (let k = 0; k < u.size; k++) if (owner.has(u.addr + k)) return false;
    units.set(u.addr, u);
    for (let k = 0; k < u.size; k++) owner.set(u.addr + k, u.addr);
    return true;
  };
  const free = (a: number, n: number) => {
    for (let k = 0; k < n; k++) if (owner.has(a + k) || !inImage(a + k)) return false;
    return true;
  };

  const labels = new Map<number, Label>();
  const label = (a: number, auto: string, kind: Label['kind'], stage: number) => {
    if (!labels.has(a)) labels.set(a, { auto, autoStage: stage, kind });
  };
  const xrefs: Xref[] = [];
  const log: string[] = [];

  log.push(
    `Loaded ${bytes.length.toLocaleString('en-US')} bytes as a raw binary at ${hex(base, 8)} (ARM:LE:32:Cortex, Thumb-2)`,
  );

  /* ---- vectors */
  const entries: number[] = [];
  VECTOR_SLOTS.forEach((slot, k) => {
    const a = base + k * 4;
    const v = u32(a);
    put({ k: 'data', addr: a, size: 4, stage: STAGE.VECTORS, dt: 'addr', value: v, field: slot });
    label(a, slot === 'Reserved' ? `Reserved_${k}` : slot, 'vec', STAGE.VECTORS);
    if (k && v & 1 && inImage(v & ~1)) {
      entries.push(v & ~1);
      xrefs.push({ from: a, to: v & ~1, kind: '*', stage: STAGE.VECTORS });
    } else if (k === 0) xrefs.push({ from: a, to: v, kind: '*', stage: STAGE.VECTORS });
  });
  log.push(
    `Vector table: initial SP ${hex(u32(base), 8)}, reset at ${hex(u32(base + 4) & ~1, 8)}, ${new Set(entries).size} handlers`,
  );

  /* ---- recursive descent */
  const fns = new Map<number, Fn>();
  const pools = new Map<number, number>(); // literal word → the instruction that loads it
  const work = [...new Set(entries)];
  let count = 0;
  while (work.length) {
    const entry = work.shift() as number;
    if (fns.has(entry)) continue;
    const fn: Fn = { addr: entry, end: entry, calls: [], callers: [] };
    fns.set(entry, fn);
    label(entry, `FUN_${hex(entry, 8)}`, 'fun', STAGE.CODE);
    const todo = [entry];
    const seen = new Set<number>();
    while (todo.length) {
      let a = todo.pop() as number;
      while (inImage(a) && !seen.has(a)) {
        const d = decode(u16(a), a + 2 < end ? u16(a + 2) : 0);
        if (
          !d ||
          !put({
            k: 'ins',
            addr: a,
            size: d.size,
            stage: STAGE.CODE,
            ins: d.ins,
            t: text(d.ins, a),
          })
        )
          break;
        seen.add(a);
        count++;
        fn.end = Math.max(fn.end, a + d.size);
        const t = text(d.ins, a);
        const target = t.ops.find((o) => o.t === 'addr')?.at;
        const lit = t.ops.find((o) => o.t === 'lit')?.at;
        if (lit !== undefined) pools.set(lit, a);
        if (t.flow === 'call' && target !== undefined) {
          if (!fn.calls.includes(target)) fn.calls.push(target);
          xrefs.push({ from: a, to: target, kind: 'c', stage: STAGE.CODE });
          if (!fns.has(target)) work.push(target);
        }
        if ((t.flow === 'jump' || t.flow === 'cjump') && target !== undefined) {
          xrefs.push({ from: a, to: target, kind: 'j', stage: STAGE.CODE });
          label(target, `LAB_${hex(target, 8)}`, 'lab', STAGE.CODE);
          todo.push(target);
        }
        if (t.flow === 'jump' || t.flow === 'ret' || t.flow === 'halt') break;
        a += d.size;
      }
    }
  }
  const fnList = [...fns.keys()].sort((a, b) => a - b);
  for (const f of fns.values()) for (const c of f.calls) fns.get(c)?.callers.push(f.addr);
  log.push(`Disassembled ${count} instructions in ${fns.size} functions`);

  /* ---- literal pools */
  const classify = (v: number): DataType =>
    inImage(v) || within(v, RAM) || within(v, PERIPH) ? 'ptr' : 'u32';
  let ptrs = 0;
  for (const [a, by] of pools) {
    const v = u32(a);
    const dt = classify(v);
    put({ k: 'data', addr: a, size: 4, stage: STAGE.REFS, dt, value: v });
    if (dt !== 'ptr') continue;
    ptrs++;
    const to = fns.has(v & ~1) ? v & ~1 : v;
    xrefs.push({ from: by, to, kind: 'r', stage: STAGE.REFS });
    if (inImage(to)) label(to, `DAT_${hex(to, 8)}`, 'dat', STAGE.REFS);
  }
  log.push(`Literal pools: ${pools.size} words, ${ptrs} of them pointers`);

  /* ---- the embedded symbol table */
  let symtab = 0;
  for (
    let a = fnList.length ? Math.max(...[...fns.values()].map((f) => f.end)) : base;
    a + 16 <= end;
    a += 4
  ) {
    a = Math.ceil(a / 4) * 4;
    if (u32(a) === SYMTAB_MAGIC) {
      symtab = a;
      break;
    }
  }
  const sections: Program['sections'] = [];
  const objs = new Map<number, Obj>();
  if (symtab) {
    const n = u16(symtab + 4);
    put({
      k: 'data',
      addr: symtab,
      size: 4,
      stage: STAGE.SYMBOLS,
      dt: 'magic',
      value: u32(symtab),
      field: 'magic',
      obj: symtab,
    });
    put({
      k: 'data',
      addr: symtab + 4,
      size: 2,
      stage: STAGE.SYMBOLS,
      dt: 'u16',
      value: n,
      field: 'count',
      obj: symtab,
    });
    put({
      k: 'data',
      addr: symtab + 6,
      size: 2,
      stage: STAGE.SYMBOLS,
      dt: 'u16',
      value: u16(symtab + 6),
      field: 'version',
      obj: symtab,
    });
    put({
      k: 'data',
      addr: symtab + 8,
      size: 4,
      stage: STAGE.SYMBOLS,
      dt: 'ptr',
      value: u32(symtab + 8),
      field: 'names',
      obj: symtab,
    });
    put({
      k: 'data',
      addr: symtab + 12,
      size: 4,
      stage: STAGE.SYMBOLS,
      dt: 'u32',
      value: u32(symtab + 12),
      field: 'size',
      obj: symtab,
    });
    labels.set(symtab, { auto: '__symtab', autoStage: STAGE.SYMBOLS, kind: 'dat' });
    objs.set(symtab, { addr: symtab, size: 16 + n * 12, type: 'symtab_t', count: 1 });
    const cstr = (a: number) => {
      let z = a;
      while (z < end && u8(z)) z++;
      return { s: new TextDecoder().decode(bytes.subarray(a - base, z - base)), size: z - a + 1 };
    };
    for (let k = 0; k < n; k++) {
      const e = symtab + 16 + k * 12;
      const value = u32(e);
      const nameAt = u32(e + 4);
      const size = u16(e + 8);
      const kind = u8(e + 10);
      const type = u8(e + 11);
      const at = (field: string) => `[${k}].${field}`;
      put({
        k: 'data',
        addr: e,
        size: 4,
        stage: STAGE.SYMBOLS,
        dt: kind === SYM.ABS ? 'u32' : 'ptr',
        value,
        field: at('value'),
        obj: symtab,
      });
      put({
        k: 'data',
        addr: e + 4,
        size: 4,
        stage: STAGE.SYMBOLS,
        dt: 'ptr',
        value: nameAt,
        field: at('name'),
        obj: symtab,
      });
      put({
        k: 'data',
        addr: e + 8,
        size: 2,
        stage: STAGE.SYMBOLS,
        dt: 'u16',
        value: size,
        field: at('size'),
        obj: symtab,
      });
      put({
        k: 'data',
        addr: e + 10,
        size: 1,
        stage: STAGE.SYMBOLS,
        dt: 'u8',
        value: kind,
        field: at('kind'),
        obj: symtab,
        values: ['', 'SYM_FUNC', 'SYM_OBJECT', 'SYM_SECTION', 'SYM_ABS'],
      });
      put({
        k: 'data',
        addr: e + 11,
        size: 1,
        stage: STAGE.SYMBOLS,
        dt: 'u8',
        value: type,
        field: at('type'),
        obj: symtab,
        values: Array.from({ length: TYPES.length + 2 }, (_, i) => typeName(i)),
      });
      const name = cstr(nameAt);
      put({ k: 'str', addr: nameAt, size: name.size, stage: STAGE.SYMBOLS, s: name.s, sym: true });
      if (kind === SYM.SECTION) {
        sections.push({
          name: name.s,
          start: value,
          end: value + size,
          flags: name.s === '.text' ? 'r-x' : 'r--',
        });
        continue;
      }
      const l = labels.get(value);
      if (l) l.sym = name.s;
      else
        labels.set(value, {
          auto: kind === SYM.ABS ? name.s : `DAT_${hex(value, 8)}`,
          autoStage: STAGE.SYMBOLS,
          sym: name.s,
          kind: kind === SYM.FUNC ? 'fun' : kind === SYM.ABS ? 'abs' : 'dat',
        });
      if (kind === SYM.OBJECT && type) {
        const elem = type === 1 ? 4 : (TYPES[type - 2]?.size ?? 4);
        objs.set(value, {
          addr: value,
          size,
          type: typeName(type),
          count: Math.max(1, Math.round(size / elem)),
        });
      }
    }
    const applied = [...labels.values()].filter((l) => l.sym).length;
    log.push(
      `Symbol table at ${hex(symtab, 8)}: ${n} entries, ${applied} names applied, ${sections.length} sections`,
    );
  } else log.push('No embedded symbol table found');

  /* ---- data types */
  let fields = 0;
  for (const o of objs.values()) {
    if (o.type === 'symtab_t') continue;
    const st = TYPES.find((t) => t.name === o.type);
    for (let k = 0; k < o.count; k++) {
      const layout: { name: string; ty: Prim; off: number; values?: string[]; flags?: boolean }[] =
        st ? st.fields : [{ name: '', ty: 'str', off: 0 }];
      const at = o.addr + k * (st ? st.size : 4);
      for (const f of layout) {
        const a = at + f.off;
        const size = PRIM_SIZE[f.ty];
        const value = size === 4 ? u32(a) : size === 2 ? u16(a) : u8(a);
        const dt: DataType = f.ty === 'str' || f.ty === 'ptr' ? 'ptr' : f.ty === 'ym' ? 'ym' : f.ty;
        const name = o.count > 1 ? `[${k}]${f.name ? `.${f.name}` : ''}` : f.name;
        if (
          put({
            k: 'data',
            addr: a,
            size,
            stage: STAGE.TYPES,
            dt,
            value,
            field: name,
            obj: o.addr,
            values: f.values,
            flags: f.flags,
          })
        )
          fields++;
        if (dt === 'ptr' && value)
          xrefs.push({ from: a, to: value, kind: '*', stage: STAGE.TYPES });
      }
    }
  }
  log.push(
    `Applied ${TYPES.length} structures from career.h to ${objs.size - (symtab ? 1 : 0)} objects (${fields} fields)`,
  );

  /* ---- strings: first everything something points at, then a scan of what's left */
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const printable = (b: number) =>
    b === 9 || b === 10 || b === 13 || (b >= 0x20 && b < 0x7f) || b >= 0x80;
  const tryString = (a: number, min: number) => {
    let z = a;
    while (z < end && u8(z) && printable(u8(z))) z++;
    if (z >= end || u8(z) !== 0 || z - a < min || !free(a, z - a + 1)) return false;
    try {
      const s = decoder.decode(bytes.subarray(a - base, z - base));
      put({ k: 'str', addr: a, size: z - a + 1, stage: STAGE.STRINGS, s });
      const name = `s_${
        s
          .replace(/[^A-Za-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 24) || 'str'
      }_${hex(a, 8)}`;
      const had = labels.get(a);
      if (had && !had.sym && had.kind === 'dat') had.str = name;
      else label(a, name, 'str', STAGE.STRINGS);
      return true;
    } catch {
      return false;
    }
  };
  let found = 0;
  const targets = [
    ...new Set(xrefs.filter((x) => x.kind === 'r' || x.kind === '*').map((x) => x.to)),
  ]
    .filter(inImage)
    .sort((a, b) => a - b);
  targets.forEach((a) => !owner.has(a) && tryString(a, 1) && found++);
  for (let a = base; a < end; a++) {
    if (owner.has(a) || !u8(a) || (a > base && u8(a - 1) && !owner.has(a - 1))) continue;
    if (tryString(a, 4)) found++;
  }
  log.push(`Found ${found} strings`);

  /* ---- what's left: alignment padding, merged into runs */
  for (let a = base; a < end;) {
    if (owner.has(a) || u8(a)) {
      a++;
      continue;
    }
    let z = a;
    while (z < end && !owner.has(z) && !u8(z)) z++;
    put({ k: 'align', addr: a, size: z - a, stage: STAGE.STRINGS });
    a = z;
  }

  const byTarget = new Map<number, Xref[]>();
  for (const x of xrefs) {
    const list = byTarget.get(x.to) ?? [];
    list.push(x);
    byTarget.set(x.to, list);
  }
  for (const list of byTarget.values()) list.sort((a, b) => a.from - b.from);
  const edges = [...fns.values()].reduce((n, f) => n + f.calls.length, 0);
  log.push(
    `Call graph: ${fns.size} functions, ${edges} call edges, ${xrefs.length} references in all`,
  );

  return {
    base,
    end,
    bytes,
    units: [...units.values()].sort((a, b) => a.addr - b.addr),
    fns,
    fnList,
    labels,
    xrefs: byTarget,
    objs,
    sections,
    log,
    symtab,
  };
}
