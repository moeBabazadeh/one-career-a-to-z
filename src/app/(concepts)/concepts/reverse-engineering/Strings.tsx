'use client';

// Defined strings: every string analysis found, with its label, length and how many places use
// it. Filter it, sort it, and Enter (or a click) takes the listing there.
import { useMemo, useRef, useState } from 'react';
import { STAGE, type Unit } from './analyze';
import { PROG, addrText, cstr, nameAt, refsTo } from './program';
import { act, useNotes, useUI } from './store';
import s from './re.module.scss';

type Str = Extract<Unit, { k: 'str' }>;
type Sort = 'addr' | 'len' | 'refs';

const ALL = PROG.units.filter((u): u is Str => u.k === 'str' && !u.sym);
const isLink = (t: string) =>
  /^(https?:\/\/|\/[\w.-]+\.pdf$)/.test(t) || /^[^\s@]+@[^\s@]+\.[a-z]+$/.test(t);
const linkOf = (t: string) => (t.includes('@') && !t.startsWith('http') ? `mailto:${t}` : t);

export default function Strings() {
  const ui = useUI();
  const notes = useNotes();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('addr');
  const [sel, setSel] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const ready = ui.stage >= STAGE.STRINGS;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (ready ? ALL : []).map((u) => ({ u, refs: refsTo(u.addr, STAGE.DONE).length }));
    const hit = needle
      ? rows.filter(
          (r) => r.u.s.toLowerCase().includes(needle) || addrText(r.u.addr).includes(needle),
        )
      : rows;
    if (sort === 'len') return [...hit].sort((a, b) => b.u.size - a.u.size);
    if (sort === 'refs') return [...hit].sort((a, b) => b.refs - a.refs || a.u.addr - b.u.addr);
    return hit;
  }, [q, sort, ready]);

  const go = (k: number) => {
    const r = list[k];
    if (!r) return;
    setSel(k);
    act.goTo(r.u.addr);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const k = Math.max(0, Math.min(list.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      setSel(k);
      body.current?.querySelector(`[data-k="${k}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      go(sel);
    }
  };

  const head = (key: Sort, label: string) => (
    <button
      type="button"
      className={sort === key ? s.sortOn : ''}
      onClick={() => setSort(key)}
      aria-pressed={sort === key}
    >
      {label}
    </button>
  );

  return (
    <div className={s.strings}>
      <div className={s.filterBar}>
        <label>
          <span className={s.srOnly}>Filter strings</span>
          <input
            type="search"
            value={q}
            placeholder={`Filter ${ready ? ALL.length : ''} strings…`}
            onChange={(e) => (setQ(e.target.value), setSel(0))}
            spellCheck={false}
          />
        </label>
        <span className={s.sortBy}>
          Sort {head('addr', 'Location')} {head('len', 'Length')} {head('refs', 'Refs')}
        </span>
        <span className={s.countTag}>{`${list.length} shown`}</span>
      </div>
      <div className={s.strHead} aria-hidden="true">
        <span>Location</span>
        <span>Label</span>
        <span>String value</span>
        <span>Len</span>
        <span>Refs</span>
      </div>
      <div
        ref={body}
        className={s.strBody}
        role="listbox"
        tabIndex={0}
        aria-label="Defined strings"
        aria-activedescendant={list[sel] ? `str-${list[sel].u.addr}` : undefined}
        onKeyDown={onKey}
      >
        {!ready && <p className={s.empty}>Strings appear when the string analysis pass runs.</p>}
        {list.map((r, k) => {
          const inside = ui.cursor >= r.u.addr && ui.cursor < r.u.addr + r.u.size;
          return (
            <div
              key={r.u.addr}
              id={`str-${r.u.addr}`}
              data-k={k}
              role="option"
              aria-selected={k === sel}
              className={`${s.strRow} ${inside ? s.cur : ''} ${k === sel ? s.kbd : ''}`}
              onClick={() => go(k)}
            >
              <span className={s.addr}>{addrText(r.u.addr)}</span>
              <span className={s.label}>{nameAt(r.u.addr, ui.stage, notes.names)}</span>
              <span className={s.str}>
                {cstr(r.u.s)}
                {isLink(r.u.s) && (
                  <a
                    href={linkOf(r.u.s)}
                    target="_blank"
                    rel="noreferrer"
                    className={s.open}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Open ${r.u.s}`}
                  >
                    ↗
                  </a>
                )}
              </span>
              <span className={s.num}>{r.u.size - 1}</span>
              <span className={s.num}>{r.refs}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
