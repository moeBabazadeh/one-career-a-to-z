// The workbench's state as a small external store, so the hero, the ERD and the contact form
// can load and run queries too. The first query runs at import time on both server and client:
// reads are deterministic, so the page renders its first result and plan before hydration.
import { useSyncExternalStore } from 'react';
import { profile } from '../_shared/data';
import { errorText, execute, type RunResult } from './sql/engine';
import { statementAt } from './sql/lexer';
import { SAVED, VERIFY } from './saved';

export interface LogEntry {
  id: number;
  prompt: string;
  lines: string[];
  ok: boolean;
}

export interface WorkbenchState {
  text: string;
  saved: string | null;
  /** A narrative for a query that isn't in the saved list (the hero's checks). */
  story: string | null;
  dirty: boolean;
  result: RunResult;
  /** Bumps on every run, to restart the plan animation. */
  runId: number;
  /** Where the statement that ran starts in the editor text, for the error underline. */
  offset: number;
  /** The editor text when it last ran: the underline only shows while it still matches. */
  ranText: string;
  log: LogEntry[];
  tab: 'results' | 'messages';
  /** Bumps when a query is loaded from outside the editor, which resets it. */
  loadId: number;
}

const first = SAVED[0];
const initialResult = execute(first.sql);

const logFor = (id: number, sql: string, r: RunResult): LogEntry => {
  const prompt = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = r.ok
    ? [
        ...(r.command ? [r.command] : []),
        ...r.notices,
        ...(r.kind === 'select' || r.kind === 'explain'
          ? [`Time: ${(r.planning + r.execution).toFixed(3)} ms (simulated)`]
          : []),
      ]
    : errorText(r.error!);
  return { id, prompt, lines, ok: r.ok };
};

const INITIAL: WorkbenchState = {
  text: first.sql,
  saved: first.id,
  story: null,
  dirty: false,
  result: initialResult,
  runId: 0,
  offset: 0,
  ranText: first.sql,
  log: [logFor(0, first.sql, initialResult)],
  tab: 'results',
  loadId: 0,
};

let state = INITIAL;
const listeners = new Set<() => void>();
const emit = (patch: Partial<WorkbenchState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useWorkbench = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
export const getWorkbench = () => state;

export const setText = (text: string) => emit({ text, dirty: true });
export const setTab = (tab: WorkbenchState['tab']) => emit({ tab });

/** A draft for the mail app: the INSERT is real, the sending is yours. */
export function mailto(m: { name: string; email: string; body: string }) {
  const subject = m.name ? `Hello from ${m.name}` : 'Hello from your website';
  const body = `${m.body}\n\n— ${m.name ? `${m.name} ` : ''}<${m.email}>`;
  return `mailto:${profile.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Runs the statement under the caret, the way DataGrip does. */
export function run(caret = 0, opts: { explain?: boolean } = {}) {
  const seg = statementAt(state.text, caret);
  if (!seg) {
    emit({
      log: [
        ...state.log,
        {
          id: state.runId + 1,
          prompt: '',
          lines: ['Nothing to run: the editor is empty.'],
          ok: true,
        },
      ],
      tab: 'messages',
    });
    return;
  }
  const lead = seg.text.length - seg.text.trimStart().length;
  let sql = seg.text.trim();
  let offset = seg.start + lead;
  if (opts.explain && !/^\s*(--[^\n]*\n\s*)*explain\b/i.test(sql)) {
    // Explain the statement itself, skipping its leading comments.
    const body = sql.replace(/^(\s*--[^\n]*\n)+/, '');
    offset += sql.length - body.length - 'EXPLAIN ANALYZE '.length;
    sql = `EXPLAIN ANALYZE ${body}`;
  }
  const result = execute(sql, { now: new Date() });
  const runId = state.runId + 1;
  const log = [...state.log, logFor(runId, sql, result)].slice(-40);
  const tab =
    result.ok && !result.columns.length && result.kind !== 'select' ? 'messages' : 'results';
  emit({ result, runId, offset, log, tab, ranText: state.text });
  if (result.ok && result.mail) window.location.href = mailto(result.mail);
}

export function loadSaved(id: string, andRun = true) {
  const saved = SAVED.find((s) => s.id === id);
  if (!saved) return;
  emit({ text: saved.sql, saved: saved.id, story: null, dirty: false, loadId: state.loadId + 1 });
  if (andRun) run(0);
}

/** Loads any SQL into the editor and runs it: the ERD, the hero checks. */
export function runText(sql: string, story: string | null = null) {
  emit({ text: sql, saved: null, story, dirty: false, loadId: state.loadId + 1 });
  run(0);
}

export function runVerify(key: keyof typeof VERIFY) {
  runText(VERIFY[key].sql, VERIFY[key].story);
}

export function revealWorkbench() {
  const el = document.getElementById('workbench');
  if (!el) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ row stream */

// The plan view tells the results grid when each row reaches the client.
export type StreamEvent =
  | { type: 'start'; runId: number }
  | { type: 'row'; runId: number; index: number }
  | { type: 'done'; runId: number };
const streamListeners = new Set<(e: StreamEvent) => void>();
export const onStream = (fn: (e: StreamEvent) => void) => {
  streamListeners.add(fn);
  return () => {
    streamListeners.delete(fn);
  };
};
export const stream = (e: StreamEvent) => streamListeners.forEach((fn) => fn(e));

/* ------------------------------------------------------------------ platform */

const noop = () => () => {};

/** "⌘" on Apple devices, "Ctrl" elsewhere. */
export const useModKey = () =>
  useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'),
    () => '⌘',
  );
