'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ACCOUNT } from './inventory';
import { WELCOME, complete, run, type Line } from './cli';
import { getUi, go, openPanel, setUi, toast, toggleShell, useUi } from './store';
import { Icon, cx } from './ui';
import s from './console.module.scss';

/* ------------------------------------------------------------------ session */

interface Entry {
  id: number;
  /** The command as typed, or null for the welcome banner. */
  cmd: string | null;
  region: string;
  out: Line[];
  code: number;
}

const HISTORY_KEY = 'cloud-console-history';

let entries: Entry[] = [{ id: 0, cmd: null, region: 'all', out: WELCOME, code: 0 }];
let history: string[] = [];
let historyLoaded = false;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function loadHistory() {
  if (historyLoaded) return;
  historyLoaded = true;
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[];
  } catch {
    history = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-100)));
  } catch {
    // Storage can be blocked; history lasts for this visit.
  }
}

const push = (e: Omit<Entry, 'id'>) => {
  entries = [...entries, { ...e, id: nextId++ }].slice(-200);
  emit();
};

/** Expands !!, !n and !prefix the way bash does. */
function expand(raw: string): string | null {
  const t = raw.trim();
  if (t === '!!') return history.at(-1) ?? null;
  const n = t.match(/^!(\d+)$/);
  if (n) return history[Number(n[1]) - 1] ?? null;
  const p = t.match(/^!([a-z].*)$/);
  if (p) return [...history].reverse().find((h) => h.startsWith(p[1])) ?? null;
  return t;
}

/** Runs a command in CloudShell and applies what it asks of the console. */
export function exec(raw: string) {
  loadHistory();
  const region = getUi().region;
  const cmd = expand(raw);
  if (cmd === null) {
    push({
      cmd: raw,
      region,
      out: [[{ t: `cloudshell: ${raw.trim()}: event not found`, c: 'err' }]],
      code: 1,
    });
    return;
  }
  if (!cmd) {
    push({ cmd: '', region, out: [], code: 0 });
    return;
  }
  if (history.at(-1) !== cmd) history = [...history, cmd];
  saveHistory();
  const res = run(cmd, { region, history, restored: getUi().restored, now: new Date() });
  if (res.clear) {
    entries = [];
    emit();
  } else
    push({
      cmd: cmd !== raw.trim() ? `${raw.trim()}  →  ${cmd}` : cmd,
      region,
      out: res.lines,
      code: res.code,
    });
  if (res.region) {
    setUi({ region: res.region });
    toast(`Region set to ${res.region}`);
  }
  if (res.restore)
    setUi((st) => ({ restored: [...new Set([...st.restored, res.restore as string])] }));
  if (res.go !== undefined) go(res.go);
  if (res.support) openPanel('support');
  if (res.exit) toggleShell(false);
}

/** Opens CloudShell and runs a command in it, from anywhere in the console. */
export function runInShell(cmd: string) {
  setUi({ shell: true, menu: null });
  exec(cmd);
}

const useEntries = () =>
  useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );

/* ------------------------------------------------------------------ view */

function Output({ lines }: { lines: Line[] }) {
  if (!lines.length) return null;
  return (
    <div className={s.shOut}>
      {lines.map((l, i) => (
        <div key={i} className={s.shLine}>
          {l.length === 0 ? '​' : null}
          {l.map((seg, j) =>
            seg.href ? (
              <a
                key={j}
                href={seg.href}
                target={seg.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className={s[`t_${seg.c ?? 'str'}`]}
              >
                {seg.t}
              </a>
            ) : seg.go !== undefined ? (
              <a key={j} href={`#/${seg.go}`} className={s[`t_${seg.c ?? 'accent'}`]}>
                {seg.t}
              </a>
            ) : (
              <span key={j} className={seg.c ? s[`t_${seg.c}`] : undefined}>
                {seg.t}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

const Prompt = ({ region }: { region: string }) => (
  <span className={s.shPrompt} aria-hidden="true">
    <span className={s.t_ok}>{ACCOUNT}@cloudshell</span>
    <span className={s.t_muted}>:</span>
    <span className={s.t_accent}>~</span>
    <span className={s.t_muted}> ({region})</span>
    <span className={s.t_muted}>$ </span>
  </span>
);

/** Lays completion candidates out in columns, as a shell does. */
function columns(options: string[]): Line[] {
  const w = Math.max(...options.map((o) => o.length)) + 2;
  const per = Math.max(1, Math.floor(72 / w));
  const rows: Line[] = [];
  for (let i = 0; i < options.length; i += per)
    rows.push([
      {
        t: options
          .slice(i, i + per)
          .map((o) => o.padEnd(w))
          .join(''),
        c: 'muted',
      },
    ]);
  return rows;
}

export function Shell() {
  const ui = useUi();
  const list = useEntries();
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const cursor = useRef<number | null>(null);
  const draft = useRef('');
  const tabs = useRef(0);

  // Focus the prompt when the drawer opens.
  useEffect(() => {
    if (ui.shell) input.current?.focus({ preventScroll: true });
  }, [ui.shell]);

  // Follow the output down.
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list, ui.shell]);

  if (!ui.shell) return null;

  const setLine = (v: string) => {
    setValue(v);
    requestAnimationFrame(() => {
      const el = input.current;
      if (el) el.setSelectionRange(v.length, v.length);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    loadHistory();
    if (e.key !== 'Tab') tabs.current = 0;
    if (e.key === 'Enter') {
      e.preventDefault();
      exec(value);
      setValue('');
      cursor.current = null;
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const c = complete(value);
      tabs.current += 1;
      if (c.value !== value) {
        setLine(c.value);
        tabs.current = 0;
      } else if (c.options.length && tabs.current >= 2) {
        push({ cmd: value, region: getUi().region, out: columns(c.options), code: 0 });
        tabs.current = 0;
      }
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      if (cursor.current === null) {
        if (e.key === 'ArrowDown') return;
        draft.current = value;
        cursor.current = history.length - 1;
      } else cursor.current += e.key === 'ArrowUp' ? -1 : 1;
      if (cursor.current < 0) cursor.current = 0;
      if (cursor.current >= history.length) {
        cursor.current = null;
        setLine(draft.current);
      } else setLine(history[cursor.current]);
      return;
    }
    if (!e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'l') {
      e.preventDefault();
      exec('clear');
    } else if (k === 'c') {
      if (window.getSelection()?.toString()) return;
      e.preventDefault();
      push({ cmd: `${value}^C`, region: getUi().region, out: [], code: 130 });
      setValue('');
      cursor.current = null;
    } else if (k === 'u') {
      e.preventDefault();
      setValue(value.slice(e.currentTarget.selectionStart ?? value.length));
    } else if (k === 'w') {
      e.preventDefault();
      const at = e.currentTarget.selectionStart ?? value.length;
      const before = value.slice(0, at).replace(/\S+\s*$/, '');
      setValue(before + value.slice(at));
    } else if (k === 'a') {
      e.preventDefault();
      e.currentTarget.setSelectionRange(0, 0);
    } else if (k === 'e') {
      e.preventDefault();
      e.currentTarget.setSelectionRange(value.length, value.length);
    }
  };

  // Drag the top edge to resize; the arrow keys do the same on the focused handle.
  const onDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (ui.shellMax) return;
    const startY = e.clientY;
    const startH = ui.shellHeight;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) =>
      setUi({
        shellHeight: Math.round(
          Math.max(160, Math.min(window.innerHeight - 120, startH + startY - ev.clientY)),
        ),
      });
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const onHandleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setUi((st) => ({
      shellHeight: Math.max(
        160,
        Math.min(window.innerHeight - 120, st.shellHeight + (e.key === 'ArrowUp' ? 32 : -32)),
      ),
    }));
  };

  return (
    <section className={s.shell} aria-label="CloudShell">
      <div
        className={s.shHandle}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize CloudShell"
        aria-valuenow={ui.shellHeight}
        aria-valuemin={160}
        tabIndex={0}
        onPointerDown={onDrag}
        onKeyDown={onHandleKey}
      />
      <header className={s.shHead}>
        <span className={s.shTab}>
          <Icon name="terminal" size={15} />
          CloudShell
          <span className={s.shRegion}>{ui.region}</span>
        </span>
        <span className={s.shHint}>Tab completes · ↑↓ history · Ctrl+L clears</span>
        <div className={s.shActions}>
          <button
            type="button"
            aria-label="Clear"
            title="Clear (Ctrl+L)"
            onClick={() => exec('clear')}
          >
            <Icon name="refresh" size={15} />
          </button>
          <button
            type="button"
            aria-label={ui.shellMax ? 'Restore size' : 'Maximize'}
            title={ui.shellMax ? 'Restore size' : 'Maximize'}
            onClick={() => setUi({ shellMax: !ui.shellMax })}
          >
            <Icon name={ui.shellMax ? 'min' : 'max'} size={15} />
          </button>
          <button
            type="button"
            aria-label="Close CloudShell"
            title="Close ( ` )"
            onClick={() => toggleShell(false)}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      </header>
      <div
        className={s.shBody}
        ref={body}
        onClick={(e) => {
          if (!window.getSelection()?.toString() && !(e.target as HTMLElement).closest('a'))
            input.current?.focus({ preventScroll: true });
        }}
      >
        <div role="log" aria-live="polite" aria-label="CloudShell output">
          {list.map((en) => (
            <div key={en.id} className={cx(s.shEntry, en.code !== 0 && s.shFailed)}>
              {en.cmd !== null && (
                <div className={s.shLine}>
                  <Prompt region={en.region} />
                  <span className={s.shCmd}>{en.cmd}</span>
                </div>
              )}
              <Output lines={en.out} />
            </div>
          ))}
        </div>
        <label className={s.shInput}>
          <Prompt region={ui.region} />
          <input
            ref={input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              cursor.current = null;
            }}
            onKeyDown={onKey}
            aria-label="Command"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="send"
          />
        </label>
      </div>
    </section>
  );
}
