'use client';

// The left-hand windows: the symbol tree (functions, data, labels, strings, with a filter), the
// program tree (memory blocks and what the image is), and career.h's data types.
import { useEffect, useMemo, useState } from 'react';
import { STAGE } from './analyze';
import { FILE } from './career';
import {
  BASE,
  CRC32,
  END,
  FACTS,
  HEADER,
  PROG,
  addrText,
  fnOf,
  nameAt,
  objOf,
  u32,
} from './program';
import { act, useNotes, useUI, type SideTab } from './store';
import { hex } from './thumb';
import s from './re.module.scss';

type Folder = 'fun' | 'dat' | 'lab' | 'str';
const FOLDERS: { id: Folder; label: string; icon: string }[] = [
  { id: 'fun', label: 'Functions', icon: 'f' },
  { id: 'dat', label: 'Data', icon: 'd' },
  { id: 'lab', label: 'Labels', icon: 'L' },
  { id: 'str', label: 'Strings', icon: 's' },
];

function useSymbols(stage: number, names: Record<string, string>) {
  return useMemo(() => {
    const out: Record<Folder, { addr: number; name: string }[]> = {
      fun: [],
      dat: [],
      lab: [],
      str: [],
    };
    if (stage < STAGE.VECTORS) return out;
    for (const [addr, l] of PROG.labels) {
      const name = nameAt(addr, stage, names);
      if (!name) continue;
      if (l.kind === 'fun') out.fun.push({ addr, name });
      else if (l.kind === 'str' || (l.str && stage >= STAGE.STRINGS)) out.str.push({ addr, name });
      else if (l.kind === 'dat' && (PROG.objs.has(addr) || stage < STAGE.TYPES))
        out.dat.push({ addr, name });
      else if (l.kind === 'vec' || l.kind === 'abs') out.lab.push({ addr, name });
    }
    for (const a of Object.keys(names).map(Number))
      if (!PROG.labels.has(a)) out.lab.push({ addr: a, name: names[a] });
    for (const f of FOLDERS) out[f.id].sort((a, b) => a.addr - b.addr);
    return out;
  }, [stage, names]);
}

function Symbols() {
  const ui = useUI();
  const notes = useNotes();
  const all = useSymbols(ui.stage, notes.names);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<Folder, boolean>>({
    fun: true,
    dat: false,
    lab: false,
    str: false,
  });
  const needle = q.trim().toLowerCase();
  const here = fnOf(ui.cursor, ui.stage) ?? objOf(ui.cursor, ui.stage) ?? ui.cursor;
  return (
    <div className={s.symbols}>
      <label className={s.treeFilter}>
        <span className={s.srOnly}>Filter symbols</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter symbols…"
          spellCheck={false}
        />
      </label>
      <ul className={s.tree} role="tree" aria-label="Symbol tree">
        {FOLDERS.map((f) => {
          const items = needle
            ? all[f.id].filter((i) => i.name.toLowerCase().includes(needle))
            : all[f.id];
          const expanded = needle ? items.length > 0 : open[f.id];
          return (
            <li key={f.id} role="treeitem" aria-expanded={expanded} aria-selected={false}>
              <button
                type="button"
                className={s.folder}
                onClick={() => setOpen({ ...open, [f.id]: !open[f.id] })}
              >
                <span className={s.caret} aria-hidden="true">
                  {expanded ? '▾' : '▸'}
                </span>
                {f.label}
                <span className={s.countTag}>{items.length}</span>
              </button>
              {expanded && (
                <ul role="group">
                  {items.map((i) => (
                    <li key={i.addr} role="treeitem" aria-selected={i.addr === here}>
                      <button
                        type="button"
                        className={`${s.sym} ${i.addr === here ? s.symOn : ''}`}
                        onClick={() => act.goTo(i.addr)}
                        title={`${i.name} · ${addrText(i.addr)}`}
                      >
                        <i className={s[`ic_${f.id}`]} aria-hidden="true">
                          {f.icon}
                        </i>
                        <span>{i.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The image's SHA-256, worked out once in the browser. */
function useSha() {
  const [sha, setSha] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    crypto.subtle
      ?.digest('SHA-256', PROG.bytes.slice().buffer)
      .then((d) => live && setSha([...new Uint8Array(d)].map((b) => hex(b, 2)).join('')))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return sha;
}

export function ProgramInfo({ stage }: { stage: number }) {
  const sha = useSha();
  const rows: [string, string][] = [
    ['Program', FILE],
    ['Format', 'Raw binary'],
    ['Language', 'ARM:LE:32:Cortex · Thumb-2'],
    ['Image base', addrText(BASE)],
    ['Size', `${FACTS.size.toLocaleString('en-US')} bytes (0x${hex(FACTS.size)})`],
    ['Initial SP', addrText(u32(BASE))],
    ['Entry', addrText(u32(BASE + 4) & ~1)],
    ['CRC-32', hex(CRC32, 8)],
    ['SHA-256', sha ?? '…'],
    ['Functions', stage >= STAGE.CODE ? String(FACTS.functions) : '—'],
    ['Instructions', stage >= STAGE.CODE ? String(FACTS.instructions) : '—'],
    ['Strings', stage >= STAGE.STRINGS ? String(FACTS.strings) : '—'],
  ];
  return (
    <dl className={s.info}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className={k === 'SHA-256' ? s.hash : ''}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProgramTree() {
  const ui = useUI();
  const blocks =
    ui.stage >= STAGE.SYMBOLS
      ? PROG.sections
      : [{ name: FILE, start: BASE, end: END, flags: 'rwx' }];
  return (
    <div className={s.programTree}>
      <h3 className={s.sideHead}>Memory blocks</h3>
      <ul className={s.blocks}>
        {blocks.map((b) => {
          const on = ui.cursor >= b.start && ui.cursor < b.end;
          return (
            <li key={b.name}>
              <button type="button" className={on ? s.symOn : ''} onClick={() => act.goTo(b.start)}>
                <b>{b.name}</b>
                <span>{`${addrText(b.start)}–${addrText(b.end - 1)}`}</span>
                <span
                  className={s.dim}
                >{`${b.flags} · ${(b.end - b.start).toLocaleString('en-US')} B`}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <h3 className={s.sideHead}>Program information</h3>
      <ProgramInfo stage={ui.stage} />
    </div>
  );
}

function Types() {
  const [open, setOpen] = useState<string | null>('role_t');
  return (
    <div className={s.types}>
      <p className={s.sideNote}>career.h, applied to every object the symbol table types.</p>
      <ul>
        {HEADER.map((t) => (
          <li key={t.name}>
            <button
              type="button"
              className={s.folder}
              aria-expanded={open === t.name}
              onClick={() => setOpen(open === t.name ? null : t.name)}
            >
              <span className={s.caret} aria-hidden="true">
                {open === t.name ? '▾' : '▸'}
              </span>
              {t.name}
            </button>
            {open === t.name && <pre className={s.typeCode}>{t.lines.join('\n')}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const TABS: { id: SideTab; label: string }[] = [
  { id: 'symbols', label: 'Symbols' },
  { id: 'program', label: 'Program' },
  { id: 'types', label: 'Types' },
];

export default function Side() {
  const ui = useUI();
  return (
    <section
      className={`${s.panel} ${s.sidePanel}`}
      data-panel="symbols"
      aria-label="Symbols and program"
    >
      <div className={s.tabs} role="tablist" aria-label="Side windows">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={ui.side === t.id}
            className={ui.side === t.id ? s.tabOn : ''}
            onClick={() => act.side(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={s.sideBody} role="tabpanel">
        {ui.side === 'symbols' ? <Symbols /> : ui.side === 'program' ? <ProgramTree /> : <Types />}
      </div>
    </section>
  );
}
