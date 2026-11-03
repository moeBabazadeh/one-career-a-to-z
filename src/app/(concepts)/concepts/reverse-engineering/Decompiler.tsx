'use client';

// The decompiler: the function under the cursor as C, synced both ways with the listing. Click a
// line to select its instructions; pick a token and click it again (or press Enter) to follow it.
// Outside a function it shows the data under the cursor as a C initializer, read from the bytes.
import { useEffect, useMemo, useRef } from 'react';
import { fmt } from '../_shared/data';
import { follow } from './actions';
import { STAGE, type Unit } from './analyze';
import { decompiled, tokenize, type CTok } from './c';
import { FILE, VECTOR_SLOTS } from './career';
import {
  BASE,
  FN_SRC,
  PROG,
  STRINGS,
  addrText,
  cstr,
  fnOf,
  lineOf,
  nameAt,
  objOf,
  stringAt,
  typeOf,
  u32,
  unitAt,
  unitOf,
  type Names,
} from './program';
import { Toks, tokText } from './parts';
import { act, useNotes, useUI } from './store';
import { hex } from './thumb';
import s from './re.module.scss';

interface DLine {
  text: string;
  addr?: number;
}

const strip = (v: number) => (PROG.fns.has(v & ~1) ? v & ~1 : v);

/** A pointer as C: a string literal, a symbol, or a cast address. */
function ptrC(v: number, stage: number, names: Names) {
  if (!v) return 'NULL';
  const to = strip(v);
  const str = stringAt(to, stage);
  if (str !== null && STRINGS.has(str)) return cstr(str);
  const l = PROG.labels.get(to);
  if (l?.sym && stage >= STAGE.SYMBOLS) return l.sym;
  return nameAt(to, stage, names) ?? `(void *)0x${hex(v, 8)}`;
}

function valueC(u: Extract<Unit, { k: 'data' }>, stage: number, names: Names): string {
  if (u.dt === 'ptr' || u.dt === 'addr') return ptrC(u.value, stage, names);
  if (u.dt === 'ym') {
    const y = u.value & 0xffff;
    const m = (u.value >>> 16) & 0xff;
    return `{ ${y}, ${m}, ${u.value >>> 24} }${y ? `   /* ${fmt.month({ y, m })} */` : '   /* present */'}`;
  }
  if (u.values && u.flags)
    return u.value ? u.values.filter((_, k) => u.value & (1 << k)).join(' | ') : '0';
  if (u.values?.[u.value]) return u.values[u.value];
  return String(u.value);
}

/** The data under the cursor, as C. */
function dataLines(
  at: number,
  stage: number,
  names: Names,
): { title: string; lines: DLine[] } | null {
  if (at < BASE + VECTOR_SLOTS.length * 4 && stage >= STAGE.VECTORS) {
    return {
      title: 'vector table',
      lines: [
        {
          text: '/* Cortex-M vector table: the initial stack pointer, then each handler with its Thumb bit set */',
        },
        { text: `void (* const vectors[${VECTOR_SLOTS.length}])(void) = {` },
        ...VECTOR_SLOTS.map((slot, k) => {
          const v = u32(BASE + k * 4);
          const p = ptrC(v, stage, names);
          return {
            text: `    ${k === 0 && !p.startsWith('(') ? `(void *)&${p}` : p},   /* ${slot} */`,
            addr: BASE + k * 4,
          };
        }),
        { text: '};' },
      ],
    };
  }
  const obj = objOf(at, stage);
  if (obj !== null) {
    const o = PROG.objs.get(obj);
    if (!o) return null;
    const name = nameAt(obj, stage, names) ?? `DAT_${hex(obj, 8)}`;
    const original = PROG.labels.get(obj)?.sym ?? name;
    const units = PROG.units.filter(
      (u): u is Extract<Unit, { k: 'data' }> => u.k === 'data' && u.obj === obj && u.stage <= stage,
    );
    if (o.type === 'symtab_t') {
      const entries: DLine[] = [];
      for (let k = 0; k * 12 + 16 < o.size; k++) {
        const e = obj + 16 + k * 12;
        const f = (n: string) => units.find((u) => u.field === `[${k}].${n}`);
        const kind = f('kind');
        const type = f('type');
        const nameStr = unitAt(f('name')?.value ?? 0, stage);
        entries.push({
          text: `    { 0x${hex(f('value')?.value ?? 0, 8)}, ${nameStr?.k === 'str' ? cstr(nameStr.s) : 'NULL'}, ${f('size')?.value ?? 0}, ${kind ? (kind.values?.[kind.value] ?? kind.value) : 0}, ${type?.value ?? 0} },`,
          addr: e,
        });
      }
      return {
        title: 'symbol table',
        lines: [
          { text: '/* The image carries its own symbol table, for crash backtraces. */' },
          {
            text: `const symtab_t __symtab = {   /* ${o.size} bytes at ${addrText(obj)} */`,
            addr: obj,
          },
          ...units.slice(0, 5).map((u) => ({
            text: `    .${u.field} = ${u.dt === 'magic' ? cstr('SYMT') : u.dt === 'ptr' ? `0x${hex(u.value, 8)}` : u.value},`,
            addr: u.addr,
          })),
          { text: `    .entries = {` },
          ...entries.map((l) => ({ ...l, text: `    ${l.text}` })),
          { text: '    }' },
          { text: '};' },
        ],
      };
    }
    const st = typeOf(o.type);
    const head: DLine[] = [...(st ? [{ text: `/* ${st.note} */` }] : []), { text: '' }];
    if (o.type === 'char *') {
      return {
        title: name,
        lines: [
          ...head.slice(1),
          { text: `const char *const ${original}[${o.count}] = {`, addr: obj },
          ...units.map((u) => ({ text: `    ${ptrC(u.value, stage, names)},`, addr: u.addr })),
          { text: '};' },
        ],
      };
    }
    if (!st) return null;
    if (o.count === 1) {
      const w = Math.max(...st.fields.map((f) => f.name.length));
      return {
        title: name,
        lines: [
          ...head,
          {
            text: `const ${o.type} ${original} = {   /* ${st.size} bytes at ${addrText(obj)} */`,
            addr: obj,
          },
          ...units.map((u) => ({
            text: `    .${(u.field ?? '').padEnd(w)} = ${valueC(u, stage, names)},`,
            addr: u.addr,
          })),
          { text: '};' },
        ],
      };
    }
    const rows: DLine[] = [];
    for (let k = 0; k < o.count; k++) {
      const parts = units
        .filter((u) => u.field?.startsWith(`[${k}].`))
        .filter((u) => !u.field?.endsWith('_pad') && !u.field?.endsWith('_pad2'));
      rows.push({
        text: `    { ${parts.map((u) => valueC(u, stage, names).replace(/\s+\/\*.*\*\/$/, '')).join(', ')} },   /* [${k}] */`,
        addr: obj + k * st.size,
      });
    }
    return {
      title: name,
      lines: [
        ...head,
        {
          text: `const ${o.type} ${original}[${o.count}] = {   /* ${o.size} bytes at ${addrText(obj)} */`,
          addr: obj,
        },
        ...rows,
        { text: '};' },
      ],
    };
  }
  const u = unitAt(at, stage);
  if (u?.k === 'str') {
    const name = nameAt(u.addr, stage, names) ?? `s_${hex(u.addr, 8)}`;
    return {
      title: name,
      lines: [
        { text: `/* ${u.size} bytes, UTF-8, NUL-terminated */` },
        { text: `const char ${name}[${u.size}] = ${cstr(u.s)};`, addr: u.addr },
      ],
    };
  }
  return null;
}

/** Lines of C with a gutter, the cursor's line marked and tokens pickable. */
function Code({
  lines,
  cur,
  picked,
  stage,
  names,
  comments,
}: {
  lines: { toks: CTok[]; indent: number; addrs: number[] }[];
  cur: number;
  picked: { line: number; tok: number } | null;
  stage: number;
  names: Names;
  comments: Record<string, string>;
}) {
  const same =
    picked && picked.tok >= 0
      ? tokText(lines[picked.line]?.toks[picked.tok] ?? { t: 'ws', v: '' }, stage, names)
      : null;
  return (
    <ol className={s.code}>
      {lines.map((l, i) => {
        const note = l.addrs.map((a) => comments[a]).find(Boolean);
        return (
          <li
            key={i}
            className={`${s.cline} ${i === cur ? s.curLine : ''} ${l.addrs.length ? s.hasAddr : ''}`}
            data-l={i}
            style={{ '--ind': l.indent } as React.CSSProperties}
          >
            <span className={s.lno} aria-hidden="true">
              {i + 1}
            </span>
            <span className={s.ctext}>
              <Toks
                toks={l.toks}
                stage={stage}
                names={names}
                picked={picked?.line === i ? picked.tok : null}
                same={same && /^[A-Za-z_]/.test(same) ? same : null}
                line={i}
              />
              {note && <span className={s.mine}>{`  // ${note}`}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const lead = (t: string) => (t.match(/^ */) as RegExpMatchArray)[0].length;
const trimToks = (toks: CTok[]) => (toks[0]?.t === 'ws' ? toks.slice(1) : toks);

export default function Decompiler() {
  const ui = useUI();
  const notes = useNotes();
  const box = useRef<HTMLDivElement>(null);
  const stage = ui.stage;
  const fn = fnOf(ui.cursor, stage);
  const at = unitAt(ui.cursor, stage)?.addr ?? ui.cursor;

  const fnLines = useMemo(() => {
    if (fn === null) return null;
    const src = FN_SRC.get(fn);
    if (!src) return null;
    return decompiled(fn).map((toks, i) => ({
      toks: trimToks(toks),
      indent: lead(src.c[i]),
      addrs: src.lineAddrs[i],
    }));
  }, [fn]);
  const plate = fn !== null && stage >= STAGE.SYMBOLS ? (FN_SRC.get(fn)?.plate ?? []) : [];

  const data = fn === null ? dataLines(at, stage, notes.names) : null;
  const dLines = data?.lines.map((l) => ({
    toks: trimToks(tokenize(l.text.trimStart())),
    indent: lead(l.text),
    addrs: l.addr !== undefined ? [l.addr] : [],
  }));

  const picked = ui.dtok && ui.dtok.fn === (fn ?? -1) ? ui.dtok : null;
  let cur = -1;
  if (fnLines && fn !== null) cur = picked ? picked.line : lineOf(fn, at);
  else if (data) {
    const field = unitOf(ui.cursor)?.addr ?? ui.cursor;
    cur = data.lines.findIndex((l) => l.addr === field);
    if (cur < 0)
      cur = data.lines.reduce(
        (best, l, k) =>
          l.addr !== undefined && l.addr <= field && l.addr >= (data.lines[best]?.addr ?? -1)
            ? k
            : best,
        -1,
      );
  }
  const lines = fnLines ?? dLines ?? [];

  // Keep the cursor's line in view without scrolling the page.
  useEffect(() => {
    const el = box.current;
    const li = el?.querySelector<HTMLElement>(`[data-l="${cur}"]`);
    if (!el || !li) return;
    const top = li.offsetTop - el.offsetTop;
    if (top < el.scrollTop + 8 || top + li.offsetHeight > el.scrollTop + el.clientHeight - 24)
      el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [cur, fn, ui.jump]);

  const onClick = (e: React.MouseEvent) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-l]');
    if (!li) return;
    const i = Number(li.dataset.l);
    const tokEl = (e.target as HTMLElement).closest<HTMLElement>('[data-tok]');
    const tok = tokEl ? Number(tokEl.dataset.tok) : -1;
    const line = lines[i];
    if (!line) return;
    if (tok >= 0 && picked && picked.line === i && picked.tok === tok) {
      const t = line.toks[tok];
      if (t?.at !== undefined) {
        follow(t.at);
        return;
      }
    }
    if (line.addrs.length && !line.addrs.includes(at)) act.setCursor(line.addrs[0]);
    if (fn !== null) act.pickToken(fn, i, tok);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      for (let i = cur + dir; i >= 0 && i < lines.length; i += dir) {
        if (lines[i].addrs.length) {
          act.setCursor(lines[i].addrs[0]);
          return;
        }
      }
    }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && fn !== null && cur >= 0) {
      e.preventDefault();
      const toks = lines[cur].toks;
      const ids = toks
        .map((t, k) => (t.at !== undefined || t.t === 'var' || t.t === 'fld' ? k : -1))
        .filter((k) => k >= 0);
      if (!ids.length) return;
      const now = picked?.line === cur ? picked.tok : -1;
      const pos = ids.indexOf(now);
      const next =
        e.key === 'ArrowRight'
          ? ids[(pos + 1) % ids.length]
          : ids[(pos - 1 + ids.length) % ids.length];
      act.pickToken(fn, cur, next);
    }
  };

  const name =
    fn !== null ? (nameAt(fn, stage, notes.names) ?? addrText(fn)) : (data?.title ?? null);
  const kind = fn !== null ? 'Decompile' : 'Data';

  return (
    <section className={`${s.panel} ${s.decompPanel}`} data-panel="decomp" aria-label="Decompiler">
      <header className={s.panelHead}>
        <span className={s.panelTitle}>{name ? `${kind}: ${name}` : 'Decompile'}</span>
        <span className={s.panelSub}>{`- (${FILE})`}</span>
      </header>
      <div
        ref={box}
        className={s.decomp}
        tabIndex={0}
        onClick={onClick}
        onKeyDown={onKey}
        onFocus={() => act.focus('decomp')}
        aria-label="Decompiled C"
      >
        {stage < STAGE.CODE ? (
          <p className={s.empty}>Waiting for auto-analysis to find the functions…</p>
        ) : lines.length ? (
          <>
            {plate.length > 0 && (
              <div className={s.cplate}>
                {plate.map((l, k) => (
                  <p key={k}>{`${k ? '   ' : '/* '}${l}${k === plate.length - 1 ? ' */' : ''}`}</p>
                ))}
              </div>
            )}
            <Code
              lines={lines}
              cur={cur}
              picked={picked}
              stage={stage}
              names={notes.names}
              comments={notes.comments}
            />
          </>
        ) : (
          <p
            className={s.empty}
          >{`No function or typed data at ${addrText(at)}. ${stage < STAGE.TYPES ? 'Types apply later in the analysis.' : 'Try G to go somewhere, or pick a function in the symbol tree.'}`}</p>
        )}
      </div>
    </section>
  );
}
