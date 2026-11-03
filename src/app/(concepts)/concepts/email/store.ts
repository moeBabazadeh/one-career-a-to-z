// The visitor's mailbox state as one small external store: what they've read, starred,
// archived and binned, their drafts and what they've handed to their mail app. It lives in
// localStorage, follows other tabs through the storage event, and the server and hydration
// pass always see the fresh mailbox, so hydration never mismatches.
import { useSyncExternalStore } from 'react';
import { THREADS, type Thread } from './mailbox';

export type Box = 'inbox' | 'archive' | 'trash';

export interface Draft {
  id: string;
  mode: 'new' | 'reply' | 'forward';
  /** The thread a reply or forward belongs to. */
  thread?: string;
  to: string;
  subject: string;
  body: string;
  /** When it was last saved, for display ("14:02"). */
  saved: string;
  /** Open for editing; a closed draft waits in Drafts and under its thread. */
  open?: boolean;
}

export interface Sent extends Draft {
  /** When it was handed to the visitor's mail app, for display. */
  sentAt: string;
}

interface Saved {
  read: Record<string, boolean>;
  star: Record<string, boolean>;
  box: Record<string, Box>;
  drafts: Draft[];
  sent: Sent[];
  seq: number;
  compact: boolean;
  listW: number | null;
}

export interface Toast {
  id: number;
  text: string;
  undo: boolean;
}

export interface State extends Saved {
  toast: Toast | null;
}

const KEY = 'concepts.email.v1';

const FRESH: Saved = {
  read: {},
  star: {},
  box: {},
  drafts: [],
  sent: [],
  seq: 0,
  compact: false,
  listW: null,
};
const INITIAL: State = { ...FRESH, toast: null };

let state: State | null = null;
const listeners = new Set<() => void>();
const undoStack: Saved[] = [];
let toastSeq = 0;
let toastTimer = 0;

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...INITIAL, ...(JSON.parse(raw) as Partial<Saved>), toast: null };
  } catch {
    // Storage blocked or unreadable: start with a fresh mailbox.
  }
  return INITIAL;
}

const get = () => (state ??= load());

const saved = (s: State): Saved => {
  const { toast: _toast, ...rest } = s;
  void _toast;
  return rest;
};

function persist(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved(s)));
  } catch {
    // Not persisted; the mailbox still works for this visit.
  }
}

const emit = () => listeners.forEach((l) => l());

function set(
  patch: Partial<State> | ((s: State) => Partial<State>),
  opts: { undoable?: boolean; persist?: boolean } = {},
) {
  const s = get();
  if (opts.undoable) {
    undoStack.push(saved(s));
    if (undoStack.length > 30) undoStack.shift();
  }
  state = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) };
  if (opts.persist !== false) persist(state);
  emit();
}

const onStorage = (e: StorageEvent) => {
  if (e.key !== KEY) return;
  // Another tab changed the mailbox: take its state, keep our toast.
  const toast = get().toast;
  state = { ...load(), toast };
  emit();
};

const subscribe = (l: () => void) => {
  if (!listeners.size) window.addEventListener('storage', onStorage);
  listeners.add(l);
  return () => {
    listeners.delete(l);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
};

export const useMailbox = () => useSyncExternalStore(subscribe, get, () => INITIAL);

/** The bytes the mailbox keeps in this browser, for the sidebar's storage line. */
export function storedBytes(s: State) {
  return new Blob([JSON.stringify(saved(s))]).size;
}

/* ------------------------------------------------------------------ reads */

export const isRead = (s: State, id: string) => s.read[id] ?? false;
export const isStarred = (s: State, t: Thread) => s.star[t.id] ?? t.star;
export const boxOf = (s: State, id: string): Box => s.box[id] ?? 'inbox';

/* ------------------------------------------------------------------ toasts */

export function toast(text: string, undo = false) {
  window.clearTimeout(toastTimer);
  set({ toast: { id: ++toastSeq, text, undo } }, { persist: false });
  toastTimer = window.setTimeout(
    () => set({ toast: null }, { persist: false }),
    undo ? 6000 : 4200,
  );
}

export const dismissToast = () => set({ toast: null }, { persist: false });

const many = (n: number, one: string) =>
  n === 1 ? one : `${n} ${one.toLowerCase().replace('conversation', 'conversations')}`;

/* ------------------------------------------------------------------ actions */

export function setRead(ids: string[], read: boolean, quiet = false) {
  if (!ids.length) return;
  const s = get();
  if (ids.every((id) => isRead(s, id) === read)) return;
  set((x) => ({ read: { ...x.read, ...Object.fromEntries(ids.map((id) => [id, read])) } }), {
    undoable: !quiet,
  });
  if (!quiet)
    toast(`${many(ids.length, 'Conversation')} marked as ${read ? 'read' : 'unread'}`, true);
}

export function setStar(ids: string[], star: boolean) {
  if (!ids.length) return;
  set((x) => ({ star: { ...x.star, ...Object.fromEntries(ids.map((id) => [id, star])) } }), {
    undoable: true,
  });
}

export function toggleStar(t: Thread) {
  setStar([t.id], !isStarred(get(), t));
}

const BOX_WORDS: Record<Box, string> = {
  inbox: 'moved to Inbox',
  archive: 'archived',
  trash: 'moved to Trash',
};

export function move(ids: string[], box: Box) {
  if (!ids.length) return;
  set((x) => ({ box: { ...x.box, ...Object.fromEntries(ids.map((id) => [id, box])) } }), {
    undoable: true,
  });
  toast(`${many(ids.length, 'Conversation')} ${BOX_WORDS[box]}`, true);
}

export function undo() {
  const prev = undoStack.pop();
  if (!prev) {
    toast('Nothing to undo');
    return;
  }
  set({ ...prev }, {});
  toast('Action undone');
}

export const canUndo = () => undoStack.length > 0;

/* ------------------------------------------------------------------ drafts and sent */

/** "14:02", or "2 Nov" for an older one: the visitor's own clock, for their own drafts. */
export function stamp(at: Date) {
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function newDraft(d: Omit<Draft, 'id' | 'saved' | 'open'>): string {
  const s = get();
  // Reopen the draft already in progress on this thread instead of starting another.
  const existing = d.thread ? s.drafts.find((x) => x.thread === d.thread) : undefined;
  if (existing) {
    setDraftOpen(existing.id, true);
    return existing.id;
  }
  const id = `d${s.seq + 1}`;
  set((x) => ({ drafts: [...x.drafts, { ...d, id, saved: '', open: true }], seq: x.seq + 1 }));
  return id;
}

export function setDraftOpen(id: string, open: boolean) {
  set((x) => ({ drafts: x.drafts.map((d) => (d.id === id ? { ...d, open } : d)) }));
}

export function saveDraft(id: string, patch: Partial<Pick<Draft, 'to' | 'subject' | 'body'>>) {
  set((x) => ({
    drafts: x.drafts.map((d) => (d.id === id ? { ...d, ...patch, saved: stamp(new Date()) } : d)),
  }));
}

export function discardDraft(id: string) {
  const s = get();
  const d = s.drafts.find((x) => x.id === id);
  if (!d) return;
  set((x) => ({ drafts: x.drafts.filter((y) => y.id !== id) }), { undoable: true });
  toast('Draft discarded', true);
}

/** Moves a draft to Sent once it's been handed to the mail app. */
export function markSent(id: string) {
  const s = get();
  const d = s.drafts.find((x) => x.id === id);
  if (!d) return;
  const sent: Sent = {
    ...d,
    open: false,
    id: `s${s.seq + 1}`,
    sentAt: new Date().toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
  set((x) => ({
    drafts: x.drafts.filter((y) => y.id !== id),
    sent: [sent, ...x.sent],
    seq: x.seq + 1,
  }));
  toast('Opened in your mail app. Nothing is sent from this page.');
}

export const setCompact = (compact: boolean) => set({ compact });
export const setListWidth = (listW: number | null) => set({ listW });

export function resetMailbox() {
  undoStack.length = 0;
  set({ ...FRESH, toast: null });
  toast('Mailbox reset');
}

/* ------------------------------------------------------------------ counts */

export function unreadIn(s: State, filter: (t: Thread) => boolean) {
  return THREADS.filter((t) => filter(t) && !isRead(s, t.id)).length;
}
