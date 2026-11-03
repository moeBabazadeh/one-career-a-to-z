'use client';

// The panel under the editors: Problems, from the live diagnostics, and the integrated terminal,
// which renders the shell's ANSI colours and turns URLs and file paths into links.

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../_shared/hooks';
import { emit, onUi, openPage, openUrl } from './commands';
import { FileIcon, Icon } from './icons';
import {
  PATHS,
  allDiagnostics,
  get,
  isFile,
  killTerminal,
  newTerminal,
  openFile,
  set,
  termUpdate,
  termWrite,
  useWb,
  type PanelTab,
} from './store';
import { complete, execute, interrupt, prompt, resolvePath, setColumns } from './shell';
import s from './editor.module.scss';

/* ------------------------------------------------------------------ ANSI */

interface Seg {
  text: string;
  cls: string[];
}

const FG = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

export function parseAnsi(line: string): Seg[] {
  const out: Seg[] = [];
  let bold = false;
  let dim = false;
  let italic = false;
  let underline = false;
  let fg: string | null = null;
  let bg: string | null = null;
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const cls = [
      bold && 'bold',
      dim && 'dim',
      italic && 'italic',
      underline && 'underline',
      fg && `fg_${fg}`,
      bg && `bg_${bg}`,
    ].filter(Boolean) as string[];
    out.push({ text, cls });
  };
  for (let m = re.exec(line); m; m = re.exec(line)) {
    push(line.slice(last, m.index));
    last = m.index + m[0].length;
    for (const code of (m[1] || '0').split(';').map(Number)) {
      if (code === 0) {
        bold = dim = italic = underline = false;
        fg = null;
        bg = null;
      } else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 3) italic = true;
      else if (code === 4) underline = true;
      else if (code === 22) bold = dim = false;
      else if (code === 23) italic = false;
      else if (code === 24) underline = false;
      else if (code >= 30 && code <= 37) fg = FG[code - 30];
      else if (code >= 90 && code <= 97) fg = `bright_${FG[code - 90]}`;
      else if (code === 39) fg = null;
      else if (code >= 40 && code <= 47) bg = FG[code - 40];
      else if (code >= 100 && code <= 107) bg = FG[code - 100];
      else if (code === 49) bg = null;
    }
  }
  push(line.slice(last));
  return out;
}

const LINK =
  /(https?:\/\/[^\s'")\]]+[^\s'")\].,;:])|((?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:md|ts|json)|\.gitignore)(?::(\d+)(?::(\d+))?)?/g;

function linkify(text: string, cwd: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  LINK.lastIndex = 0;
  for (let m = LINK.exec(text); m; m = LINK.exec(text)) {
    if (m[1]) {
      out.push(text.slice(last, m.index));
      out.push(
        <a
          key={`${key}-${m.index}`}
          href={m[1]}
          target="_blank"
          rel="noreferrer"
          className={s.termLink}
        >
          {m[1]}
        </a>,
      );
      last = m.index + m[0].length;
      continue;
    }
    const path = [resolvePath(cwd, m[2]), resolvePath('', m[2])].find(isFile);
    if (!path) continue;
    const line = m[3] ? Number(m[3]) - 1 : undefined;
    out.push(text.slice(last, m.index));
    out.push(
      <button
        key={`${key}-${m.index}`}
        type="button"
        className={s.termLink}
        title={`Open ${path}${line !== undefined ? `, line ${line + 1}` : ''}`}
        onClick={() =>
          openFile(path, line !== undefined ? { line, col: m[4] ? Number(m[4]) - 1 : 0 } : {})
        }
      >
        {m[0]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function TermLine({ line, cwd }: { line: string; cwd: string }) {
  const segs = parseAnsi(line);
  return (
    <div className={s.termLine}>
      {segs.map((seg, i) => (
        <span key={i} className={seg.cls.map((c) => s[`a_${c}`]).join(' ') || undefined}>
          {linkify(seg.text, cwd, String(i))}
        </span>
      ))}
      {!line && '​'}
    </div>
  );
}

/* ------------------------------------------------------------------ terminal */

let welcomed = false;

function Terminal() {
  const sessions = useWb((st) => st.terminals);
  const activeId = useWb((st) => st.activeTerminal);
  const reduced = useReducedMotion();
  const session = sessions.find((t) => t.id === activeId) ?? sessions[0];
  const out = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [hIndex, setHIndex] = useState<number | null>(null);
  const tabs = useRef(0);

  // The first terminal greets the visitor and runs the career script, like a task on folder open.
  useEffect(() => {
    if (welcomed) return;
    const t = window.setTimeout(() => {
      if (welcomed) return;
      welcomed = true;
      const id = get().terminals[0].id;
      const login = new Date().toString().slice(0, 24);
      termWrite(
        id,
        `\x1b[2mLast login: ${login} on ttys000\x1b[0m`,
        `Type \x1b[36mhelp\x1b[0m for what works here, or \x1b[36mman moe\x1b[0m to read it all as a page.`,
      );
      window.setTimeout(
        () => execute(id, 'npm run career', { openUrl, openPage }, reduced),
        reduced ? 0 : 600,
      );
    }, 80);
    return () => window.clearTimeout(t);
  }, [reduced]);

  useEffect(() => {
    const el = out.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session?.lines.length, session?.running]);

  useEffect(() => onUi('focus-terminal', () => input.current?.focus({ preventScroll: true })), []);

  // While a process runs the terminal itself holds focus, so Ctrl+C reaches it; then the prompt does.
  const running = !!session?.running;
  useEffect(() => {
    const inside = box.current?.contains(document.activeElement);
    if (running && (inside || document.activeElement === document.body))
      box.current?.focus({ preventScroll: true });
    if (!running && box.current === document.activeElement)
      input.current?.focus({ preventScroll: true });
  }, [running]);

  // The shell knows how many columns fit, the way a terminal reports its size to programs.
  useEffect(() => {
    const el = out.current;
    if (!el) return;
    const measure = () => {
      const probe = document.createElement('span');
      probe.textContent = '0'.repeat(20);
      el.appendChild(probe);
      const ch = probe.getBoundingClientRect().width / 20;
      probe.remove();
      const pad =
        parseFloat(getComputedStyle(el).paddingLeft) +
        parseFloat(getComputedStyle(el).paddingRight);
      if (ch) setColumns((el.clientWidth - pad) / ch);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!session) return null;

  const run = () => {
    execute(session.id, value, { openUrl, openPage }, reduced);
    setValue('');
    setHIndex(null);
    tabs.current = 0;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const r = complete(value, session.cwd);
      if (r.options.length) {
        tabs.current++;
        if (tabs.current > 1)
          termWrite(session.id, `${prompt(session.cwd)} ${value}`, r.options.join('  '));
      } else {
        tabs.current = 0;
        setValue(r.value);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!session.history.length) return;
      const next = hIndex === null ? session.history.length - 1 : Math.max(0, hIndex - 1);
      setHIndex(next);
      setValue(session.history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIndex === null) return;
      const next = hIndex + 1;
      if (next >= session.history.length) {
        setHIndex(null);
        setValue('');
      } else {
        setHIndex(next);
        setValue(session.history[next]);
      }
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      termWrite(session.id, `${prompt(session.cwd)} ${value}^C`);
      setValue('');
    } else if ((e.ctrlKey && e.key === 'l') || (e.metaKey && e.key === 'k')) {
      e.preventDefault();
      termUpdate(session.id, { lines: [] });
    } else tabs.current = 0;
  };

  return (
    <div
      ref={box}
      className={s.terminal}
      data-terminal
      onMouseUp={() => {
        if (!window.getSelection()?.toString()) input.current?.focus({ preventScroll: true });
      }}
      onKeyDown={(e) => {
        if (session.running && e.ctrlKey && e.key === 'c') {
          e.preventDefault();
          interrupt(session.id);
        }
      }}
      tabIndex={session.running ? 0 : -1}
      aria-label="Terminal"
    >
      <div ref={out} className={s.termOut} role="log" aria-live="polite">
        {session.lines.map((line, i) => (
          <TermLine key={i} line={line} cwd={session.cwd} />
        ))}
        {!session.running ? (
          <label className={s.termPrompt}>
            <span className={s.termPromptText}>
              {parseAnsi(prompt(session.cwd)).map((seg, i) => (
                <span key={i} className={seg.cls.map((c) => s[`a_${c}`]).join(' ')}>
                  {seg.text}
                </span>
              ))}
            </span>
            <input
              ref={input}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setHIndex(null);
              }}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              aria-label="Terminal input"
            />
          </label>
        ) : (
          <div className={s.termLine}>
            <span className={s.termCursor} />
            <button type="button" className={s.termStop} onClick={() => interrupt(session.id)}>
              Ctrl+C to stop
            </button>
          </div>
        )}
      </div>
      {sessions.length > 1 && (
        <ul className={s.termList} aria-label="Terminals">
          {sessions.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={t.id === session.id}
                onClick={() => set({ activeTerminal: t.id })}
              >
                <Icon.terminal /> {t.name} {i + 1}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ problems */

function Problems() {
  const buffers = useWb((st) => st.buffers);
  const all = allDiagnostics(buffers);
  const files = PATHS.filter((p) => all[p]?.length);
  const list = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      onUi('focus-problems', () =>
        (list.current?.querySelector('button') as HTMLElement | null)?.focus(),
      ),
    [],
  );
  if (!files.length)
    return <p className={s.panelEmpty}>No problems have been detected in the workspace.</p>;
  return (
    <div ref={list} className={s.problems} role="tree" aria-label="Problems">
      {files.map((p) => (
        <Fragment key={p}>
          <div
            className={s.problemFile}
            role="treeitem"
            aria-level={1}
            aria-selected={false}
            aria-expanded
          >
            <FileIcon path={p} />
            <span className={s.treeName}>{p.split('/').pop()}</span>
            <span className={s.dim}>{p.split('/').slice(0, -1).join('/')}</span>
            <span className={s.badge}>{all[p].length}</span>
          </div>
          {all[p].map((d, i) => (
            <button
              key={i}
              type="button"
              role="treeitem"
              aria-level={2}
              aria-selected={false}
              className={s.problemRow}
              data-severity={d.severity}
              onClick={() =>
                openFile(p, { line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol })
              }
            >
              {d.severity === 'error' ? <Icon.error /> : <Icon.warning />}
              <span>{d.message}</span>
              <span className={s.dim}>
                {d.source} [Ln {d.line + 1}, Col {d.col + 1}]
              </span>
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the panel */

export default function Panel() {
  const tab = useWb((st) => st.panelTab);
  const max = useWb((st) => st.panelMax);
  const buffers = useWb((st) => st.buffers);
  const activeId = useWb((st) => st.activeTerminal);
  const all = allDiagnostics(buffers);
  const count = Object.values(all).reduce((n, d) => n + d.length, 0);
  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'problems', label: 'Problems' },
    { id: 'terminal', label: 'Terminal' },
  ];
  return (
    <section className={s.panel} aria-label="Panel">
      <header className={s.panelHead}>
        <div role="tablist" aria-label="Panel views" className={s.panelTabs}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => set({ panelTab: t.id })}
            >
              {t.label}
              {t.id === 'problems' && count > 0 && <span className={s.badge}>{count}</span>}
            </button>
          ))}
        </div>
        <span className={s.panelActions}>
          {tab === 'terminal' && (
            <>
              <button
                type="button"
                className={s.iconBtn}
                title="New Terminal (Ctrl+Shift+`)"
                aria-label="New terminal"
                onClick={() => {
                  newTerminal();
                  emit('focus-terminal');
                }}
              >
                <Icon.plus />
              </button>
              <button
                type="button"
                className={s.iconBtn}
                title="Kill Terminal"
                aria-label="Kill terminal"
                onClick={() => killTerminal(activeId)}
              >
                <Icon.trash />
              </button>
            </>
          )}
          <button
            type="button"
            className={s.iconBtn}
            title={max ? 'Restore Panel Size' : 'Maximize Panel Size'}
            aria-label={max ? 'Restore panel size' : 'Maximize panel size'}
            onClick={() => set((st) => ({ panelMax: !st.panelMax }))}
          >
            {max ? <Icon.down /> : <Icon.up />}
          </button>
          <button
            type="button"
            className={s.iconBtn}
            title="Hide Panel (⌘J)"
            aria-label="Hide panel"
            onClick={() =>
              set({ panel: false, mobile: get().mobile === 'terminal' ? 'files' : get().mobile })
            }
          >
            <Icon.close />
          </button>
        </span>
      </header>
      <div className={s.panelBody}>{tab === 'terminal' ? <Terminal /> : <Problems />}</div>
    </section>
  );
}
