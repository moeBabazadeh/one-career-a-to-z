// The linker. Lays moe.bin out the way a Cortex-M linker script would (vectors, .text with a
// literal pool after each function, .rodata, then an embedded symbol table), assembles every
// function with thumb.ts and writes the facts into .rodata as real little-endian structs.
import {
  ABSOLUTE,
  FUNCTIONS,
  OBJECTS,
  TYPES,
  VECTORS,
  structOf,
  type FV,
  type Obj,
  type YMV,
} from './career';
import { encode, parse, sizeOf, PC, type Ins, type Lit } from './thumb';

export const BASE = 0x08000000;

/** Symbol kinds in the embedded table. */
export const SYM = { FUNC: 1, OBJECT: 2, SECTION: 3, ABS: 4 } as const;
/** "SYMT", little-endian. */
export const SYMTAB_MAGIC = 0x544d5953;
export const SYMTAB_VERSION = 1;

/** Type ids in the symbol table: 0 none, 1 an array of strings, then career.h's structs. */
export const typeId = (ty: string) =>
  ty === 'str' ? 1 : TYPES.findIndex((t) => t.name === ty) + 2;
export const typeName = (id: number) => (id === 1 ? 'char *' : (TYPES[id - 2]?.name ?? ''));

export interface LinkedFn {
  name: string;
  addr: number;
  /** End of the instructions; the literal pool follows. */
  codeEnd: number;
  /** End of the pool. */
  end: number;
  c: string[];
  /** The instructions each C line compiled to. */
  lineAddrs: number[][];
  plate: string[];
  lib: boolean;
}

export interface Section {
  name: string;
  start: number;
  end: number;
  flags: string;
}

export interface Linked {
  base: number;
  bytes: Uint8Array;
  fns: LinkedFn[];
  /** Every string in .rodata, by its text. */
  strings: Map<string, number>;
  sections: Section[];
}

const align = (n: number, a: number) => Math.ceil(n / a) * a;
const utf8 = (s: string) => new TextEncoder().encode(s);

const objSize = (o: Obj) => (o.ty === 'str' ? 4 : (structOf(o.ty)?.size ?? 0)) * o.vals.length;

function objStrings(o: Obj): string[] {
  if (o.ty === 'str') return o.vals.filter((v): v is string => typeof v === 'string');
  return (o.vals as Record<string, FV>[]).flatMap((rec) =>
    Object.values(rec).filter((v): v is string => typeof v === 'string'),
  );
}

export function link(): Linked {
  /* strings, in the order they're first used: the data's, then the code's */
  const order: string[] = [];
  const seen = new Set<string>();
  const addStr = (s: string) => {
    if (seen.has(s)) return;
    seen.add(s);
    order.push(s);
  };
  OBJECTS.forEach((o) => objStrings(o).forEach(addStr));
  const parsed = FUNCTIONS.map((fn) => ({
    fn,
    items: fn.asm.map((a) => ({ line: a.line, src: parse(a.src) })),
  }));
  parsed.forEach((p) =>
    p.items.forEach((it) => it.src.k === 'lit' && 'str' in it.src.lit && addStr(it.src.lit.str)),
  );

  /* layout: .isr_vector, then .text */
  let at = BASE + VECTORS.length * 4;
  const textStart = at;
  const layouts = parsed.map((p) => {
    at = align(at, 4);
    const start = at;
    const labels = new Map<string, number>();
    const pool: Lit[] = [];
    const poolIndex = new Map<string, number>();
    const placed = p.items.map((it) => {
      const addr = at;
      if (it.src.k === 'label') labels.set(it.src.name, addr);
      if (it.src.k === 'lit') {
        const key = JSON.stringify(it.src.lit);
        if (!poolIndex.has(key)) {
          poolIndex.set(key, pool.length);
          pool.push(it.src.lit);
        }
      }
      at += sizeOf(it.src);
      return { ...it, addr };
    });
    const codeEnd = at;
    at = align(at, 4);
    const poolAt = at;
    at += pool.length * 4;
    return { fn: p.fn, start, codeEnd, poolAt, pool, poolIndex, labels, placed, end: at };
  });
  const textEnd = at;

  /* .rodata: the objects, then the strings */
  at = align(at, 16);
  const rodataStart = at;
  const objAddr = new Map<string, number>();
  const objs = OBJECTS.map((o) => {
    at = align(at, 4);
    objAddr.set(o.name, at);
    const placed = { o, addr: at, size: objSize(o) };
    at += placed.size;
    return placed;
  });
  const strings = new Map<string, number>();
  const encoded = new Map<string, Uint8Array>();
  order.forEach((s) => {
    at = align(at, 4);
    strings.set(s, at);
    const b = utf8(s);
    encoded.set(s, b);
    at += b.length + 1;
  });
  const rodataEnd = at;

  /* .symtab: a header, one entry per symbol, then the names */
  at = align(at, 16);
  const symtabStart = at;
  const fnAddr = new Map(layouts.map((l) => [l.fn.name, l.start]));
  const absAddr = new Map(ABSOLUTE.map((a) => [a.name, a.addr]));
  const sections: Section[] = [
    { name: '.isr_vector', start: BASE, end: textStart, flags: 'r--' },
    { name: '.text', start: textStart, end: textEnd, flags: 'r-x' },
    { name: '.rodata', start: rodataStart, end: rodataEnd, flags: 'r--' },
    { name: '.symtab', start: symtabStart, end: 0, flags: 'r--' },
  ];
  type Entry = { value: number; name: string; size: number; kind: number; type: number };
  const entries: Entry[] = [
    ...sections.map((s) => ({ value: s.start, name: s.name, size: 0, kind: SYM.SECTION, type: 0 })),
    ...layouts.map((l) => ({
      value: l.start,
      name: l.fn.name,
      size: l.codeEnd - l.start,
      kind: SYM.FUNC,
      type: 0,
    })),
    ...objs.map((p) => ({
      value: p.addr,
      name: p.o.name,
      size: p.size,
      kind: SYM.OBJECT,
      type: typeId(p.o.ty),
    })),
    ...ABSOLUTE.map((a) => ({ value: a.addr, name: a.name, size: 0, kind: SYM.ABS, type: 0 })),
  ];
  const namesStart = symtabStart + 16 + entries.length * 12;
  at = namesStart;
  const nameAddr = entries.map((e) => {
    const a = at;
    at += utf8(e.name).length + 1;
    return a;
  });
  const end = align(at, 4);
  sections[3].end = end;
  entries[3].size = end - symtabStart;
  entries.slice(0, 3).forEach((e, k) => (e.size = sections[k].end - sections[k].start));

  /* emit */
  const bytes = new Uint8Array(end - BASE);
  const view = new DataView(bytes.buffer);
  const w8 = (a: number, v: number) => view.setUint8(a - BASE, v);
  const w16 = (a: number, v: number) => view.setUint16(a - BASE, v, true);
  const w32 = (a: number, v: number) => view.setUint32(a - BASE, v >>> 0, true);

  const symbol = (name: string) => {
    const f = fnAddr.get(name);
    if (f !== undefined) return f | 1;
    const v = objAddr.get(name) ?? absAddr.get(name);
    if (v === undefined) throw new Error(`link: undefined symbol ${name}`);
    return v;
  };
  const strPtr = (s: string) => {
    const v = strings.get(s);
    if (v === undefined) throw new Error(`link: string not placed: ${s}`);
    return v;
  };

  VECTORS.forEach((v, k) => w32(BASE + k * 4, v ? symbol(v) : 0));

  for (const l of layouts) {
    for (const it of l.placed) {
      const s = it.src;
      let ins: Ins | null = null;
      if (s.k === 'ins') ins = s.ins;
      else if (s.k === 'br') {
        const target = l.labels.get(s.label);
        if (target === undefined) throw new Error(`link: ${l.fn.name}: no label ${s.label}`);
        const off = target - (it.addr + 4);
        ins = s.op === 'b' ? { op: 'b', cond: s.cond, off } : { op: s.op, rn: s.rn, off };
      } else if (s.k === 'bl') {
        const target = fnAddr.get(s.sym);
        if (target === undefined) throw new Error(`link: ${l.fn.name}: bl to unknown ${s.sym}`);
        ins = { op: 'bl', off: target - (it.addr + 4) };
      } else if (s.k === 'lit') {
        const slot = l.poolAt + 4 * (l.poolIndex.get(JSON.stringify(s.lit)) as number);
        ins = { op: 'ldr', rt: s.rt, rn: PC, imm: slot - ((it.addr + 4) & ~3) };
      }
      if (!ins) continue;
      encode(ins).forEach((h, k) => w16(it.addr + 2 * k, h));
    }
    l.pool.forEach((lit, k) =>
      w32(
        l.poolAt + 4 * k,
        'sym' in lit ? symbol(lit.sym) : 'str' in lit ? strPtr(lit.str) : lit.num,
      ),
    );
  }

  const writeField = (a: number, ty: string, v: FV | undefined) => {
    if (ty === 'u8') w8(a, (v as number) ?? 0);
    else if (ty === 'u16') w16(a, (v as number) ?? 0);
    else if (ty === 'u32') w32(a, (v as number) ?? 0);
    else if (ty === 'str') w32(a, typeof v === 'string' ? strPtr(v) : 0);
    else if (ty === 'ptr') w32(a, v && typeof v === 'object' && 'ref' in v ? symbol(v.ref) : 0);
    else if (ty === 'ym') {
      const d = (v as YMV | null) ?? { y: 0, m: 0, d: 0 };
      w16(a, d.y);
      w8(a + 2, d.m);
      w8(a + 3, d.d);
    }
  };
  for (const { o, addr } of objs) {
    if (o.ty === 'str') {
      o.vals.forEach((v, k) => writeField(addr + 4 * k, 'str', v as FV));
      continue;
    }
    const st = structOf(o.ty);
    if (!st) throw new Error(`link: no struct ${o.ty}`);
    (o.vals as Record<string, FV>[]).forEach((rec, k) =>
      st.fields.forEach((f) => writeField(addr + k * st.size + f.off, f.ty, rec[f.name])),
    );
  }
  for (const [s, a] of strings) bytes.set(encoded.get(s) as Uint8Array, a - BASE);

  w32(symtabStart, SYMTAB_MAGIC);
  w16(symtabStart + 4, entries.length);
  w16(symtabStart + 6, SYMTAB_VERSION);
  w32(symtabStart + 8, namesStart);
  w32(symtabStart + 12, end - symtabStart);
  entries.forEach((e, k) => {
    const a = symtabStart + 16 + k * 12;
    w32(a, e.value);
    w32(a + 4, nameAddr[k]);
    w16(a + 8, Math.min(e.size, 0xffff));
    w8(a + 10, e.kind);
    w8(a + 11, e.type);
    bytes.set(utf8(e.name), nameAddr[k] - BASE);
  });

  const fns: LinkedFn[] = layouts.map((l) => {
    const lineAddrs: number[][] = l.fn.c.map(() => []);
    l.placed.forEach((it) => {
      if (it.src.k !== 'label' && it.line >= 0) lineAddrs[it.line].push(it.addr);
    });
    return {
      name: l.fn.name,
      addr: l.start,
      codeEnd: l.codeEnd,
      end: l.end,
      c: l.fn.c,
      lineAddrs,
      plate: l.fn.plate,
      lib: l.fn.lib,
    };
  });

  return { base: BASE, bytes, fns, strings, sections };
}
