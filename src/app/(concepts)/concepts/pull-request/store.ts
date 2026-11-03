// Page-wide state as one small external store. The visitor's review, line comments, reactions,
// viewed files and the merge are kept in localStorage (when it is available), so the pull request
// is as they left it. The server and the hydration pass always see the initial state; the saved
// one is read on the first client snapshot, so hydration never mismatches.

import { useSyncExternalStore } from 'react';
import { db } from '../_shared/data';
import { COMMITS, PERSONAS, PR, shaOf, suggestionCommit, type Commit } from './model';
import { THREADS, type Thread } from './changes';
import { logsFor, schedule, SPEED, type Schedule } from './ci';

export type Tab = 'conversation' | 'commits' | 'checks' | 'files';
export const TABS: Tab[] = ['conversation', 'commits', 'checks', 'files'];

export type Verdict = 'comment' | 'approve' | 'changes';
export type MergeMethod = 'squash' | 'merge' | 'rebase';

export interface LineComment {
  id: string;
  path: string;
  line: number;
  side: 'old' | 'new';
  /** The line commented on, for the email. */
  quote: string;
  body: string;
}

export interface Review {
  verdict: Verdict;
  body: string;
  comments: LineComment[];
}

export type VisitorEvent =
  | { id: number; kind: 'review'; review: Review }
  | { id: number; kind: 'suggestion'; sha: string }
  | { id: number; kind: 'resolve' | 'unresolve'; thread: Thread['id'] }
  | { id: number; kind: 'merge'; method: MergeMethod; sha: string }
  | { id: number; kind: 'revert' };

interface Saved {
  draft: string;
  verdict: Verdict;
  pending: LineComment[];
  review: Review | null;
  applied: boolean;
  threads: Partial<Record<Thread['id'], boolean>>;
  reactions: string[];
  viewed: string[];
  merged: { method: MergeMethod; sha: string } | null;
  runs: number;
  events: VisitorEvent[];
  seq: number;
}

export interface Run {
  n: number;
  started: number;
  /** Real milliseconds the run takes to play. */
  ms: number;
  done: boolean;
  trigger: 'rerun' | 'push';
}

export interface State extends Saved {
  run: Run | null;
  job: string;
}

/** Bump the version when the saved shape changes. */
const STORAGE_KEY = 'concepts.pr.v1';

const INITIAL: State = {
  draft: '',
  verdict: 'approve',
  pending: [],
  review: null,
  applied: false,
  threads: {},
  reactions: [],
  viewed: [],
  merged: null,
  runs: 1,
  events: [],
  seq: 0,
  run: null,
  job: 'test',
};

let state: State | null = null;
const listeners = new Set<() => void>();

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Saved>;
      return { ...INITIAL, ...saved, run: null, job: INITIAL.job };
    }
  } catch {
    // Storage blocked or the entry is unreadable: start fresh.
  }
  return INITIAL;
}

const get = () => (state ??= load());

function save(s: State) {
  try {
    const { run: _run, job: _job, ...saved } = s;
    void _run;
    void _job;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Not persisted; the page still works for this visit.
  }
}

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const s = get();
  state = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) };
  save(state);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const usePR = () => useSyncExternalStore(subscribe, get, () => INITIAL);

type NewEvent = VisitorEvent extends infer E
  ? E extends VisitorEvent
    ? Omit<E, 'id'>
    : never
  : never;

const event = (s: State, e: NewEvent): Pick<State, 'events' | 'seq'> => ({
  events: [...s.events, { ...e, id: s.seq + 1 } as VisitorEvent],
  seq: s.seq + 1,
});

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ derived */

export const BASE_HEAD = COMMITS[COMMITS.length - 1];
export const headCommit = (s: Pick<State, 'applied'>): Commit =>
  s.applied ? suggestionCommit(BASE_HEAD.sha, PERSONAS.staff) : BASE_HEAD;
export const allCommits = (s: Pick<State, 'applied'>): Commit[] =>
  s.applied ? [...COMMITS, headCommit(s)] : COMMITS;

export const isResolved = (s: Pick<State, 'threads'>, t: Thread) =>
  s.threads[t.id] ?? Boolean(t.resolvedBy);
export const unresolved = (s: Pick<State, 'threads'>) => THREADS.filter((t) => !isResolved(s, t));

/** The schedule on screen: the playing run's, or the last finished one's. */
export function runSchedule(s: State): { n: number; sched: Schedule } {
  const head = headCommit(s);
  const n = s.run?.n ?? s.runs;
  return { n, sched: schedule(n, logsFor(head.short, head.header)) };
}

export const isRunning = (s: State) => Boolean(s.run && !s.run.done);

/* ------------------------------------------------------------------ actions */

let runTimer = 0;

/** Re-runs every job. With reduced motion the run finishes at once. */
export function startRun(trigger: Run['trigger'] = 'rerun') {
  const s = get();
  const n = s.runs + 1;
  const head = headCommit(s);
  const ms = reduced() ? 0 : (schedule(n, logsFor(head.short, head.header)).total / SPEED) * 1000;
  window.clearTimeout(runTimer);
  if (!ms) {
    set({ run: { n, started: performance.now(), ms: 0, done: true, trigger }, runs: n });
    return;
  }
  set({ run: { n, started: performance.now(), ms, done: false, trigger } });
  runTimer = window.setTimeout(
    () => set((x) => ({ run: x.run ? { ...x.run, done: true } : null, runs: n })),
    ms + 50,
  );
}

let autoRan = false;
/** The first time Checks opens, it re-runs, so the graph plays at least once. */
export function autoRun() {
  if (autoRan || reduced()) return;
  autoRan = true;
  if (!isRunning(get())) startRun('rerun');
}

export const selectJob = (job: string) => set({ job });
export const setDraft = (draft: string) => set({ draft });
export const setVerdict = (verdict: Verdict) => set({ verdict });

export function addComment(c: Omit<LineComment, 'id'>) {
  set((s) => ({ pending: [...s.pending, { ...c, id: `c${s.seq + 1}` }], seq: s.seq + 1 }));
}
export const removeComment = (id: string) =>
  set((s) => ({ pending: s.pending.filter((c) => c.id !== id) }));

export function submitReview() {
  set((s) => {
    const review: Review = { verdict: s.verdict, body: s.draft.trim(), comments: s.pending };
    return { review, draft: '', pending: [], ...event(s, { kind: 'review', review }) };
  });
}

export function applySuggestion() {
  const s = get();
  if (s.applied || s.merged) return;
  const sha = suggestionCommit(BASE_HEAD.sha, PERSONAS.staff).sha;
  set((x) => ({
    applied: true,
    threads: { ...x.threads, classrooms: true },
    ...event(x, { kind: 'suggestion', sha }),
  }));
  // A push re-runs the checks on the new head.
  startRun('push');
}

export function setResolved(id: Thread['id'], resolved: boolean) {
  set((s) => ({
    threads: { ...s.threads, [id]: resolved },
    ...event(s, { kind: resolved ? 'resolve' : 'unresolve', thread: id }),
  }));
}

export const toggleReaction = (key: string) =>
  set((s) => ({
    reactions: s.reactions.includes(key)
      ? s.reactions.filter((r) => r !== key)
      : [...s.reactions, key],
  }));
export const toggleViewed = (path: string) =>
  set((s) => ({
    viewed: s.viewed.includes(path) ? s.viewed.filter((p) => p !== path) : [...s.viewed, path],
  }));

export function merge(method: MergeMethod) {
  set((s) => {
    const sha = shaOf(`${headCommit(s).sha}\n${method}\n${s.review?.body ?? ''}\n${s.seq}`);
    return { merged: { method, sha }, ...event(s, { kind: 'merge', method, sha }) };
  });
}

export const revert = () => set((s) => ({ merged: null, ...event(s, { kind: 'revert' }) }));

export function resetAll() {
  window.clearTimeout(runTimer);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved.
  }
  state = { ...INITIAL };
  listeners.forEach((l) => l());
}

/* ------------------------------------------------------------------ the email */

const VERDICT_TEXT: Record<Verdict, string> = {
  approve: 'Approved',
  changes: 'Changes requested',
  comment: 'Commented',
};
export const verdictText = (v: Verdict) => VERDICT_TEXT[v];

export function mailto(s: State, to: string): string {
  const merged = Boolean(s.merged);
  const subject = merged
    ? `Merged #${PR.number}: ${PR.title}`
    : s.review
      ? `Review on #${PR.number}: ${VERDICT_TEXT[s.review.verdict]}`
      : `About #${PR.number}: ${PR.title}`;
  const lines = [`Hi ${db.person.first},`, ''];
  if (merged) lines.push(`I merged #${PR.number} “${PR.title}” on ${db.person.site}.`, '');
  if (s.review) {
    lines.push(`My review: ${VERDICT_TEXT[s.review.verdict]}`);
    if (s.review.body) lines.push('', s.review.body);
    if (s.review.comments.length) {
      lines.push('', 'Line comments:');
      for (const c of s.review.comments) lines.push(`- ${c.path}:${c.line}: ${c.body}`);
    }
    lines.push('');
  }
  lines.push('—', `Sent from #${PR.number} on ${db.person.site}`);
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

/* ------------------------------------------------------------------ the tab, mirrored to the URL hash */

let tab: Tab | null = null;
const tabListeners = new Set<() => void>();
const fromHash = (): Tab | null => {
  const h = location.hash.slice(1) as Tab;
  return TABS.includes(h) ? h : null;
};
const getTab = () => (tab ??= fromHash() ?? 'conversation');

const subscribeTab = (l: () => void) => {
  tabListeners.add(l);
  const onHash = () => {
    const next = fromHash();
    if (next && next !== tab) {
      tab = next;
      tabListeners.forEach((fn) => fn());
    }
  };
  window.addEventListener('hashchange', onHash);
  return () => {
    tabListeners.delete(l);
    window.removeEventListener('hashchange', onHash);
  };
};

export const useTab = () => useSyncExternalStore(subscribeTab, getTab, () => 'conversation' as Tab);

export function setTab(next: Tab) {
  tab = next;
  try {
    history.replaceState(
      null,
      '',
      next === 'conversation' ? location.pathname + location.search : `#${next}`,
    );
  } catch {
    // Some embeds disallow it; the tab still changes.
  }
  tabListeners.forEach((l) => l());
  if (next === 'checks') autoRun();
}

/** Switches tab, then scrolls to an element once it is on screen. */
export function reveal(next: Tab, id: string) {
  setTab(next);
  window.setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    el.focus?.({ preventScroll: true });
  }, 60);
}
