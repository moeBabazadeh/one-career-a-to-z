// The program the suite has open: moe.bin linked from career.ts, then analysed from its bytes.
// Both run at import, on the server and the client alike, in a few milliseconds and with the
// same result, so the first paint already has the image. Plus the lookups the views share.
import { analyze, STAGE, type Label, type Unit, type Xref } from './analyze';
import { ABSOLUTE, FUNCTIONS, OBJECTS, TYPES, YM, structOf, type Struct } from './career';
import { link, type LinkedFn } from './link';
import { hex } from './thumb';

export const LINKED = link();
export const PROG = analyze(LINKED.bytes, LINKED.base);
export const BASE = PROG.base;
export const END = PROG.end;

/** Linked functions by entry address. */
export const FN_SRC = new Map<number, LinkedFn>(LINKED.fns.map((f) => [f.addr, f]));
/** The source's names, for the decompiler's tokens: functions, objects and absolute symbols. */
export const SYM_ADDR = new Map<string, number>([
  ...LINKED.fns.map((f) => [f.name, f.addr] as [string, number]),
  ...[...PROG.labels]
    .filter(([, l]) => l.sym)
    .map(([a, l]) => [l.sym as string, a] as [string, number]),
  ...ABSOLUTE.map((a) => [a.name, a.addr] as [string, number]),
]);
export const STRINGS = LINKED.strings;
export const ABS_NOTE = new Map(ABSOLUTE.map((a) => [a.addr, a.note]));
export const LIB = new Set(LINKED.fns.filter((f) => f.lib).map((f) => f.addr));

export const inImage = (a: number) => a >= BASE && a < END;
export const byte = (a: number) => PROG.bytes[a - BASE];
export const u32 = (a: number) =>
  (byte(a) | (byte(a + 1) << 8) | (byte(a + 2) << 16) | (byte(a + 3) << 24)) >>> 0;
export const u16 = (a: number) => byte(a) | (byte(a + 1) << 8);
export const addrText = (a: number) => hex(a, 8);

/* ------------------------------------------------------------------ units */

const UNITS = PROG.units;
const UNIT_ADDRS = UNITS.map((u) => u.addr);

/** The final unit containing an address (whatever stage defined it). */
export function unitOf(a: number): Unit | null {
  let lo = 0;
  let hi = UNIT_ADDRS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (UNIT_ADDRS[mid] <= a) lo = mid + 1;
    else hi = mid - 1;
  }
  const u = UNITS[hi];
  return u && a < u.addr + u.size ? u : null;
}

/** The unit at an address as of a stage: what the listing shows there, or null for an undefined byte. */
export function unitAt(a: number, stage: number): Unit | null {
  const u = unitOf(a);
  return u && u.stage <= stage ? u : null;
}

/** Start of the item containing an address at a stage. */
export const itemStart = (a: number, stage: number) => unitAt(a, stage)?.addr ?? a;

/* ------------------------------------------------------------------ functions */

const ENTRIES = PROG.fnList;

/** The function whose body (code and literal pool) contains an address. */
export function fnOf(a: number, stage: number): number | null {
  if (stage < STAGE.CODE) return null;
  let found: number | null = null;
  for (const e of ENTRIES) {
    if (e > a) break;
    found = e;
  }
  if (found === null) return null;
  const src = FN_SRC.get(found);
  return src && a < src.end ? found : null;
}

/** The C line an instruction compiled from. */
export function lineOf(fn: number, a: number): number {
  const src = FN_SRC.get(fn);
  if (!src) return -1;
  return src.lineAddrs.findIndex((list) => list.includes(a));
}

/* ------------------------------------------------------------------ names */

export type Names = Record<string, string>;

/** The name shown at an address: the visitor's, the symbol table's, or analysis's own. */
export function nameAt(a: number, stage: number, names: Names): string | null {
  const own = names[a];
  if (own) return own;
  const l: Label | undefined = PROG.labels.get(a);
  if (!l) return null;
  if (l.sym && stage >= STAGE.SYMBOLS) return l.sym;
  if (l.str && stage >= STAGE.STRINGS) return l.str;
  return stage >= l.autoStage ? l.auto : null;
}

/** A name, or the address plus an offset into the nearest named thing. */
export function refText(a: number, stage: number, names: Names): string {
  const n = nameAt(a, stage, names);
  if (n) return n;
  const fn = fnOf(a, stage);
  if (fn !== null) return `${nameAt(fn, stage, names) ?? addrText(fn)}+0x${hex(a - fn)}`;
  return addrText(a);
}

/** Where a reference comes from, Ghidra-style: the function (or object) and the address. */
export function fromText(x: Xref, stage: number, names: Names): string {
  const fn = fnOf(x.from, stage);
  const obj = fn === null ? objOf(x.from, stage) : null;
  const owner =
    fn !== null ? nameAt(fn, stage, names) : obj !== null ? nameAt(obj, stage, names) : null;
  return `${owner ? `${owner}:` : ''}${addrText(x.from)}(${x.kind})`;
}

export const refsTo = (a: number, stage: number) =>
  (PROG.xrefs.get(a) ?? []).filter((x) => x.stage <= stage);

/* ------------------------------------------------------------------ data */

export function objOf(a: number, stage: number): number | null {
  if (stage < STAGE.TYPES) return null;
  const u = unitOf(a);
  if (u && u.k === 'data' && u.obj !== undefined && PROG.objs.has(u.obj)) return u.obj;
  return PROG.objs.has(a) ? a : null;
}

export const typeOf = (name: string): Struct | undefined => (name === 'ym_t' ? YM : structOf(name));

/** Readable C for a field's type. */
export function fieldType(ty: string, to?: string) {
  if (ty === 'str') return 'char *';
  if (ty === 'ptr') return to?.endsWith('*') ? `${to}*` : `${to ?? 'void'} *`;
  return { u8: 'uint8_t', u16: 'uint16_t', u32: 'uint32_t', ym: 'ym_t' }[ty] ?? ty;
}

/** Each struct field's C type, by "type.field", for the listing's type column. */
export const TYPE_FIELDS = new Map<string, string>([
  ...TYPES.flatMap((t) =>
    t.fields.map((f) => [`${t.name}.${f.name}`, fieldType(f.ty, f.to)] as [string, string]),
  ),
  ['symtab_t.name', 'char *'],
  ['symtab_t.names', 'char *'],
  ['symtab_t.value', 'addr'],
]);

/** career.h as C, for the data types window. */
export const HEADER: { name: string; lines: string[] }[] = [YM, ...TYPES].map((t) => {
  const width = Math.max(...t.fields.map((f) => fieldType(f.ty, f.to).length));
  return {
    name: t.name,
    lines: [
      `/* ${t.note} */`,
      `typedef struct ${t.name.replace(/_t$/, '')} {`,
      ...t.fields.map(
        (f) =>
          `    ${fieldType(f.ty, f.to).padEnd(width)} ${f.name};${' '.repeat(Math.max(1, 16 - f.name.length))}/* +0x${hex(f.off, 2)} */`,
      ),
      `} ${t.name};   /* ${t.size} bytes */`,
    ],
  };
});

/** The string at an address, if there is one. */
export function stringAt(a: number, stage: number): string | null {
  const u = unitAt(a, stage);
  return u && u.k === 'str' && u.addr === a ? u.s : null;
}

/** "2024-06", "2012", or "present" for a zero month. */
export function ymText(v: number) {
  const y = v & 0xffff;
  const m = (v >>> 16) & 0xff;
  if (!y) return '{0}';
  return m ? `${y}-${String(m).padStart(2, '0')}` : `${y}`;
}

/** A C string literal for display: escapes and quotes. */
export const cstr = (s: string) => JSON.stringify(s);

/* ------------------------------------------------------------------ listing rows */

export type Row =
  | { k: 'sec'; addr: number; name: string; end: number; flags: string }
  | { k: 'gap'; addr: number }
  | { k: 'plate'; addr: number; text: string; edge: boolean }
  | { k: 'sig'; addr: number }
  | { k: 'label'; addr: number }
  | { k: 'unit'; addr: number; u: Unit | null };

export const PLATE_W = 66;
const plateRows = (addr: number, lines: string[]): Row[] => [
  { k: 'plate', addr, text: '*'.repeat(PLATE_W), edge: true },
  ...lines.map((l) => ({
    k: 'plate' as const,
    addr,
    text: `* ${l.length > PLATE_W - 4 ? `${l.slice(0, PLATE_W - 5)}…` : l.padEnd(PLATE_W - 4)} *`,
    edge: false,
  })),
  { k: 'plate', addr, text: '*'.repeat(PLATE_W), edge: true },
];

/** Whether an address has a label at a stage (or one the visitor added). */
export const hasLabel = (a: number, stage: number, names: Names) =>
  nameAt(a, stage, names) !== null;

/** The listing's rows at a stage. Names resolve when rows draw, so a rename doesn't rebuild this. */
export function buildRows(
  stage: number,
  userLabels: number[],
): { rows: Row[]; unitRows: number[] } {
  const rows: Row[] = [];
  const unitRows: number[] = [];
  const extra = new Set(userLabels);
  const sectionAt = new Map(stage >= STAGE.SYMBOLS ? PROG.sections.map((s) => [s.start, s]) : []);
  const emit = (a: number, u: Unit | null) => {
    const sec = sectionAt.get(a);
    if (sec) {
      rows.push(
        { k: 'gap', addr: a },
        { k: 'sec', addr: a, name: sec.name, end: sec.end, flags: sec.flags },
      );
    }
    const fn = stage >= STAGE.CODE && PROG.fns.has(a);
    if (fn) {
      const plate = FN_SRC.get(a)?.plate ?? [];
      rows.push(
        { k: 'gap', addr: a },
        ...(stage >= STAGE.SYMBOLS ? plateRows(a, plate) : plateRows(a, ['FUNCTION'])),
        { k: 'sig', addr: a },
        { k: 'label', addr: a },
      );
    } else {
      const l = PROG.labels.get(a);
      const visible =
        (l && ((l.sym && stage >= STAGE.SYMBOLS) || stage >= l.autoStage)) || extra.has(a);
      if (visible) {
        if (l && (l.kind === 'dat' || l.kind === 'str') && rows[rows.length - 1]?.k === 'unit')
          rows.push({ k: 'gap', addr: a });
        rows.push({ k: 'label', addr: a });
      }
    }
    unitRows.push(rows.length);
    rows.push({ k: 'unit', addr: a, u });
  };
  let a = BASE;
  for (const u of UNITS) {
    if (u.stage > stage) continue;
    for (; a < u.addr; a++) emit(a, null);
    emit(u.addr, u);
    a = u.addr + u.size;
  }
  for (; a < END; a++) emit(a, null);
  return { rows, unitRows };
}

/** The unit row (index into rows) holding an address. */
export function rowOf(rows: Row[], unitRows: number[], a: number): number {
  let lo = 0;
  let hi = unitRows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[unitRows[mid]].addr <= a) lo = mid + 1;
    else hi = mid - 1;
  }
  return unitRows[Math.max(0, hi)];
}

/* ------------------------------------------------------------------ program facts for the info dialog */

export const FACTS = {
  size: PROG.bytes.length,
  functions: PROG.fns.size,
  instructions: UNITS.filter((u) => u.k === 'ins').length,
  strings: UNITS.filter((u) => u.k === 'str' && !u.sym).length,
  objects: OBJECTS.length,
  sourceFunctions: FUNCTIONS.length,
};

/** CRC-32 (IEEE 802.3), the checksum a bootloader would check before jumping to the image. */
export const CRC32 = (() => {
  let crc = 0xffffffff;
  for (const b of PROG.bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
})();
