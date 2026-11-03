'use client';

// The suite's dialogs, each the one a disassembler has: Go To, Rename, Set Comment, References
// To, Search Memory, the key map and About. Plus the hover preview a symbol shows.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { concept } from '../_shared/concepts';
import { db } from '../_shared/data';
import { follow } from './actions';
import { STAGE } from './analyze';
import { decompiled } from './c';
import { FILE } from './career';
import { ProgramInfo } from './Side';
import {
  ABS_NOTE,
  BASE,
  END,
  FN_SRC,
  PROG,
  addrText,
  byte,
  cstr,
  fnOf,
  fromText,
  inImage,
  nameAt,
  objOf,
  refsTo,
  stringAt,
  unitAt,
  type Names,
} from './program';
import { Toks, unitSummary } from './parts';
import { act, getNotes, notesAct, useNotes, useUI } from './store';
import { hex } from './thumb';
import s from './re.module.scss';

/* ------------------------------------------------------------------ the frame */

function Modal({
  title,
  children,
  wide,
  onSubmit,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  onSubmit?: () => void;
}) {
  const box = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = box.current;
    const first =
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector<HTMLElement>('input, textarea') ??
      el?.querySelector<HTMLElement>('button[type="submit"]');
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
    return () => prev?.focus?.();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      act.close();
    }
    if (e.key === 'Tab' && box.current) {
      const items = [
        ...box.current.querySelectorAll<HTMLElement>('input, textarea, button, [tabindex="0"]'),
      ].filter((el) => !el.hasAttribute('disabled'));
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (!e.shiftKey && i === items.length - 1) {
        e.preventDefault();
        items[0]?.focus();
      }
    }
  };
  return (
    <div className={s.scrim} onMouseDown={(e) => e.target === e.currentTarget && act.close()}>
      <form
        ref={box}
        className={`${s.dialog} ${wide ? s.wide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={onKey}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <header className={s.dlgHead}>
          <h2 id={id}>{title}</h2>
          <button type="button" className={s.x} onClick={() => act.close()} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </form>
    </div>
  );
}

const Buttons = ({ ok = 'OK', extra }: { ok?: string; extra?: React.ReactNode }) => (
  <footer className={s.dlgFoot}>
    {extra}
    <span className={s.spacer} />
    <button type="button" onClick={() => act.close()}>
      Cancel
    </button>
    <button type="submit" className={s.primary}>
      {ok}
    </button>
  </footer>
);

/** Every named address, for Go To's suggestions and the uniqueness check. */
function allNames(stage: number, names: Names) {
  const out = new Map<string, number>();
  for (const a of PROG.labels.keys()) {
    const n = nameAt(a, stage, names);
    if (n) out.set(n, a);
  }
  for (const [a, n] of Object.entries(names)) out.set(n, Number(a));
  return out;
}

/* ------------------------------------------------------------------ Go To */

function GoTo() {
  const ui = useUI();
  const notes = useNotes();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(0);
  const [err, setErr] = useState('');
  const names = useMemo(() => allNames(ui.stage, notes.names), [ui.stage, notes.names]);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return [];
    const hits = [...names].filter(([n]) => n.toLowerCase().includes(needle));
    const rank = ([n, a]: [string, number]) =>
      (n.toLowerCase().startsWith(needle) ? 0 : 2) + (PROG.fns.has(a) ? 0 : 1);
    hits.sort((a, b) => rank(a) - rank(b) || a[0].length - b[0].length);
    return hits.slice(0, 8);
  }, [names, needle]);

  const go = (addr: number) => {
    act.close();
    if (inImage(addr)) act.goTo(addr);
    else follow(addr);
  };
  const submit = () => {
    const exact = [...names].find(([n]) => n.toLowerCase() === needle);
    if (exact) return go(exact[1]);
    const h = needle.replace(/^(ram:|0x)/, '');
    if (/^[0-9a-f]{1,8}$/.test(h)) {
      const a = parseInt(h, 16);
      const full = a < END - BASE && h.length < 6 ? BASE + a : a;
      if (inImage(full) || ABS_NOTE.has(full)) return go(full);
      setErr(`${addrText(full)} is outside ${FILE} (${addrText(BASE)}–${addrText(END - 1)}).`);
      return;
    }
    if (matches[pick]) return go(matches[pick][1]);
    setErr(`No address or label matches “${q}”.`);
  };
  return (
    <Modal title="Go To Address or Label" onSubmit={submit}>
      <div className={s.dlgBody}>
        <label className={s.field}>
          <span>Address, offset or label</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPick(0);
              setErr('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setPick((p) =>
                  Math.max(0, Math.min(matches.length - 1, p + (e.key === 'ArrowDown' ? 1 : -1))),
                );
              }
            }}
            placeholder={`main, role_${db.current.role.id}_main, ${addrText(BASE + 0x40)}, 0x1a0`}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="re-goto-hint"
          />
        </label>
        <p id="re-goto-hint" className={s.hint}>
          A hex address, an offset into the image, or any name (partial names list matches).
        </p>
        {err && <p className={s.error}>{err}</p>}
        {matches.length > 0 && (
          <ul className={s.suggest} role="listbox" aria-label="Matching labels">
            {matches.map(([n, a], k) => (
              <li key={n} role="option" aria-selected={k === pick}>
                <button type="button" className={k === pick ? s.kbd : ''} onClick={() => go(a)}>
                  <span className={PROG.fns.has(a) ? s.fnRef : s.glob}>{n}</span>
                  <span className={s.addr}>{addrText(a)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Buttons ok="Go" />
    </Modal>
  );
}

/* ------------------------------------------------------------------ Rename */

function Rename({ addr }: { addr: number }) {
  const ui = useUI();
  const notes = useNotes();
  const current = nameAt(addr, ui.stage, notes.names);
  const original = nameAt(addr, ui.stage, {});
  const [v, setV] = useState(current ?? '');
  const [err, setErr] = useState('');
  const fn = PROG.fns.has(addr) && ui.stage >= STAGE.CODE;
  const title = fn
    ? `Rename Function at ${addrText(addr)}`
    : current
      ? `Edit Label at ${addrText(addr)}`
      : `Add Label at ${addrText(addr)}`;
  const submit = () => {
    const name = v.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name))
      return setErr(
        'A name is a letter or underscore, then letters, digits or underscores (up to 64).',
      );
    const taken = allNames(ui.stage, notes.names).get(name);
    if (taken !== undefined && taken !== addr)
      return setErr(`${name} is already the name at ${addrText(taken)}.`);
    act.close();
    if (name === current) return;
    notesAct.rename(addr, name === original ? null : name);
    act.log(
      `${current ? `Renamed ${current} to ${name}` : `Added label ${name}`} at ${addrText(addr)}.`,
      'ok',
    );
  };
  return (
    <Modal title={title} onSubmit={submit}>
      <div className={s.dlgBody}>
        <label className={s.field}>
          <span>Name</span>
          <input
            value={v}
            onChange={(e) => {
              setV(e.target.value);
              setErr('');
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <p
          className={s.hint}
        >{`Every reference to ${addrText(addr)} shows the new name: listing, decompiler, call graph and symbol tree. Saved in this browser.`}</p>
        {err && <p className={s.error}>{err}</p>}
      </div>
      <Buttons
        extra={
          notes.names[addr] ? (
            <button
              type="button"
              onClick={() => {
                notesAct.rename(addr, null);
                act.log(`Restored ${original ?? addrText(addr)}.`, 'ok');
                act.close();
              }}
            >
              Restore default
            </button>
          ) : null
        }
      />
    </Modal>
  );
}

/* ------------------------------------------------------------------ Comment */

function Comment({ addr }: { addr: number }) {
  const notes = useNotes();
  const ui = useUI();
  const [v, setV] = useState(notes.comments[addr] ?? '');
  const submit = () => {
    notesAct.comment(addr, v);
    act.log(
      v.trim() ? `Comment set at ${addrText(addr)}.` : `Comment cleared at ${addrText(addr)}.`,
      'ok',
    );
    act.close();
  };
  return (
    <Modal title={`Set Comment at ${addrText(addr)}`} onSubmit={submit}>
      <div className={s.dlgBody}>
        <p className={s.hint}>
          <code>{unitSummary(unitAt(addr, ui.stage), addr, ui.stage, notes.names)}</code>
        </p>
        <label className={s.field}>
          <span>EOL comment</span>
          <textarea
            value={v}
            rows={3}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>
        <p className={s.hint}>
          Enter saves, Shift+Enter starts a new line. It shows in the listing and on the
          decompiler’s line.
        </p>
      </div>
      <Buttons
        extra={
          notes.comments[addr] ? (
            <button
              type="button"
              onClick={() => {
                notesAct.comment(addr, '');
                act.log(`Comment cleared at ${addrText(addr)}.`, 'ok');
                act.close();
              }}
            >
              Clear
            </button>
          ) : null
        }
      />
    </Modal>
  );
}

/* ------------------------------------------------------------------ References */

const KIND: Record<string, string> = { c: 'CALL', j: 'JUMP', r: 'READ', '*': 'PTR' };

function Xrefs({ addr }: { addr: number }) {
  const ui = useUI();
  const notes = useNotes();
  const refs = refsTo(addr, ui.stage);
  const [pick, setPick] = useState(0);
  const go = (k: number) => {
    const r = refs[k];
    if (!r) return;
    act.close();
    act.goTo(r.from);
  };
  return (
    <Modal
      title={`References to ${nameAt(addr, ui.stage, notes.names) ?? addrText(addr)} (${refs.length})`}
      wide
      onSubmit={() => go(pick)}
    >
      <div className={s.dlgBody}>
        {refs.length === 0 ? (
          <p className={s.hint}>Nothing in the image refers to this address.</p>
        ) : (
          <div
            className={s.xrefTable}
            role="listbox"
            tabIndex={0}
            data-autofocus=""
            aria-label="References"
            aria-activedescendant={`xr-${pick}`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setPick((p) =>
                  Math.max(0, Math.min(refs.length - 1, p + (e.key === 'ArrowDown' ? 1 : -1))),
                );
              }
            }}
          >
            <div className={s.xrefHead} aria-hidden="true">
              <span>From</span>
              <span>Location</span>
              <span>Type</span>
              <span>Code unit</span>
            </div>
            {refs.map((r, k) => (
              <div
                key={`${r.from}-${k}`}
                id={`xr-${k}`}
                role="option"
                aria-selected={k === pick}
                className={`${s.xrefRow} ${k === pick ? s.kbd : ''}`}
                onClick={() => go(k)}
              >
                <span className={s.addr}>{addrText(r.from)}</span>
                <span className={s.label}>
                  {fromText(r, ui.stage, notes.names).replace(/:[0-9a-f]{8}\(.\)$/, '')}
                </span>
                <span className={s.kindTag}>{KIND[r.kind]}</span>
                <span className={s.dim}>
                  {unitSummary(unitAt(r.from, ui.stage), r.from, ui.stage, notes.names)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <Buttons ok="Go" />
    </Modal>
  );
}

/* ------------------------------------------------------------------ Search memory */

function searchBytes(q: string, mode: 'string' | 'hex', exact: boolean): number[] | string {
  let pat: (number | null)[];
  if (mode === 'hex') {
    const parts =
      q
        .trim()
        .replace(/\s+/g, '')
        .match(/.{1,2}/g) ?? [];
    if (!parts.length || parts.some((p) => !/^([0-9a-f]{2}|\?\?)$/i.test(p)))
      return 'Hex is pairs of digits, with ?? for any byte: 00 f0 ?? f8';
    pat = parts.map((p) => (p === '??' ? null : parseInt(p, 16)));
  } else {
    if (!q) return '';
    pat = [...new TextEncoder().encode(q)];
  }
  const fold = (b: number) => (!exact && b >= 0x41 && b <= 0x5a ? b + 32 : b);
  const hits: number[] = [];
  const bytes = PROG.bytes;
  outer: for (let i = 0; i + pat.length <= bytes.length && hits.length < 200; i++) {
    for (let k = 0; k < pat.length; k++) {
      const p = pat[k];
      if (p !== null && fold(bytes[i + k]) !== fold(p)) continue outer;
    }
    hits.push(BASE + i);
  }
  return hits;
}

function Search() {
  const ui = useUI();
  const notes = useNotes();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'string' | 'hex'>('string');
  const [exact, setExact] = useState(false);
  const [pick, setPick] = useState(0);
  const res = useMemo(() => searchBytes(q, mode, exact), [q, mode, exact]);
  const hits = Array.isArray(res) ? res : [];
  const go = (a: number | undefined) => {
    if (a === undefined) return;
    act.close();
    act.goTo(a);
  };
  const where = (a: number) => {
    const fn = fnOf(a, ui.stage);
    const obj = objOf(a, ui.stage);
    const own = fn ?? obj ?? unitAt(a, ui.stage)?.addr ?? a;
    return nameAt(own, ui.stage, notes.names) ?? '';
  };
  return (
    <Modal title="Search Memory" wide onSubmit={() => go(hits[pick])}>
      <div className={s.dlgBody}>
        <div className={s.searchRow}>
          <label className={s.field}>
            <span>Search value</span>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPick(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setPick((p) =>
                    Math.max(0, Math.min(hits.length - 1, p + (e.key === 'ArrowDown' ? 1 : -1))),
                  );
                }
              }}
              placeholder={mode === 'hex' ? '70 b5 ?? 46' : db.current.company}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <div className={s.seg} role="radiogroup" aria-label="Format">
            {(['string', 'hex'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? s.segOn : ''}
                onClick={() => setMode(m)}
              >
                {m === 'string' ? 'String' : 'Hex'}
              </button>
            ))}
          </div>
          {mode === 'string' && (
            <label className={s.check}>
              <input type="checkbox" checked={exact} onChange={() => setExact(!exact)} />
              Case sensitive
            </label>
          )}
        </div>
        {typeof res === 'string' && res && <p className={s.error}>{res}</p>}
        {q && Array.isArray(res) && (
          <p
            className={s.hint}
          >{`${hits.length}${hits.length === 200 ? '+' : ''} match${hits.length === 1 ? '' : 'es'} in ${PROG.bytes.length.toLocaleString('en-US')} bytes`}</p>
        )}
        <ul className={s.hits} aria-label="Matches">
          {hits.map((a, k) => (
            <li key={a}>
              <button type="button" className={k === pick ? s.kbd : ''} onClick={() => go(a)}>
                <span className={s.addr}>{addrText(a)}</span>
                <span className={s.glob}>{where(a)}</span>
                <span className={s.dim}>
                  {Array.from({ length: 8 }, (_, i) =>
                    a + i < END ? hex(byte(a + i), 2) : '',
                  ).join(' ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Buttons ok="Go" />
    </Modal>
  );
}

/* ------------------------------------------------------------------ keys, about */

export const KEYS: [string, string][] = [
  ['G', 'Go to an address or label'],
  ['L', 'Rename the symbol (or add a label)'],
  [';', 'Set an end-of-line comment'],
  ['X', 'References to the symbol'],
  ['S', 'Search memory for a string or bytes'],
  ['Enter · double-click', 'Follow the reference under the cursor'],
  ['Esc · Alt+←', 'Back'],
  ['Alt+→', 'Forward'],
  ['↑ ↓ · PgUp PgDn', 'Move through the listing'],
  ['← →', 'Address or operand field (listing); token (decompiler)'],
  ['Ctrl+↓ · Ctrl+↑', 'Next or previous function'],
  ['Ctrl+Z', 'Undo the last rename or comment'],
  ['?', 'This list'],
];

function Keys() {
  return (
    <Modal title="Keyboard shortcuts" onSubmit={() => act.close()}>
      <div className={s.dlgBody}>
        <dl className={s.keys}>
          {KEYS.map(([k, v]) => (
            <div key={k}>
              <dt>
                {k.split(' · ').map((part) => (
                  <kbd key={part}>{part}</kbd>
                ))}
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Buttons ok="Close" />
    </Modal>
  );
}

function About() {
  const ui = useUI();
  const c = concept('reverse-engineering');
  return (
    <Modal title={`About ${FILE}`} onSubmit={() => act.close()}>
      <div className={s.dlgBody}>
        <p className={s.hint}>
          {`A Cortex-M firmware image built in your browser from the facts on this site. Every string and struct in it is real; the machine is a fiction. It is assembled to genuine Thumb-2, analysed from its bytes, and yours to download from File.`}
        </p>
        <ProgramInfo stage={ui.stage} />
        <p className={s.hint}>{`Concept ${c.letter} · ${c.name}`}</p>
      </div>
      <Buttons ok="Close" />
    </Modal>
  );
}

export default function Dialogs() {
  const ui = useUI();
  const d = ui.dialog;
  if (!d) return null;
  if (d.k === 'goto') return <GoTo />;
  if (d.k === 'rename') return <Rename key={d.addr} addr={d.addr} />;
  if (d.k === 'comment') return <Comment key={d.addr} addr={d.addr} />;
  if (d.k === 'xrefs') return <Xrefs key={d.addr} addr={d.addr} />;
  if (d.k === 'search') return <Search />;
  if (d.k === 'keys') return <Keys />;
  return <About />;
}

/* ------------------------------------------------------------------ hover preview */

/** What a symbol's tooltip shows: a function's first lines, a struct's fields, a string. */
export function Preview({ addr, stage }: { addr: number; stage: number }) {
  const names = getNotes().names;
  const name = nameAt(addr, stage, names) ?? addrText(addr);
  if (PROG.fns.has(addr) && stage >= STAGE.CODE) {
    const lines = decompiled(addr).slice(0, 9);
    const plate = stage >= STAGE.SYMBOLS ? (FN_SRC.get(addr)?.plate.slice(0, 3) ?? []) : [];
    return (
      <>
        {plate.length > 0 && <pre className={s.cm}>{plate.join('\n')}</pre>}
        <pre>
          {lines.map((l, k) => (
            <div key={k}>
              <Toks toks={l} stage={stage} names={names} />
            </div>
          ))}
          {decompiled(addr).length > 9 && <div className={s.dim}> …</div>}
        </pre>
      </>
    );
  }
  const str = stringAt(addr, stage);
  if (str !== null) return <pre className={s.str}>{cstr(str)}</pre>;
  const obj = PROG.objs.get(addr);
  if (obj && stage >= STAGE.TYPES) {
    const fields = PROG.units.filter((u) => u.k === 'data' && u.obj === addr).slice(0, 10);
    return (
      <pre>
        <div>
          <span className={s.ty}>{obj.type}</span> <span className={s.glob}>{name}</span>
          {obj.count > 1 ? `[${obj.count}]` : ''}
        </div>
        {fields.map((u) => (
          <div key={u.addr}>
            {'  '}
            {unitSummary(u, u.addr, stage, names).replace(/^\S+(\s\*)?\s/, '')}
          </div>
        ))}
        {PROG.units.filter((u) => u.k === 'data' && u.obj === addr).length > 10 && (
          <div className={s.dim}> …</div>
        )}
      </pre>
    );
  }
  const note = ABS_NOTE.get(addr);
  return (
    <pre>
      <span className={s.glob}>{name}</span>
      {note ? `  ${note}` : `  ${unitSummary(unitAt(addr, stage), addr, stage, names)}`}
    </pre>
  );
}
