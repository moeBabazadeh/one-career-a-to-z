// The visitor's progress through the study: which locks are open, which clues they've noted, how
// many hints they took, and whether the room makes sound. Kept in localStorage when it's
// available, so the notebook is as they left it. The server and the hydration pass see the
// locked room; the saved state is read on the first client snapshot, so hydration never mismatches.
import { useSyncExternalStore } from 'react';
import { CLUE_IDS, LOCK_IDS, type ClueId, type LockId } from './puzzles';

export interface Progress {
  open: LockId[];
  /** Locks opened with "show me" rather than solved. */
  shown: LockId[];
  noted: ClueId[];
  hints: Partial<Record<LockId, number>>;
  sound: boolean;
}

const KEY = 'concepts.escape.v1';
const INITIAL: Progress = { open: [], shown: [], noted: [], hints: {}, sound: false };

let state: Progress | null = null;
const listeners = new Set<() => void>();

function load(): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return INITIAL;
    const locks = (v: unknown) =>
      Array.isArray(v) ? (v.filter((id) => LOCK_IDS.includes(id)) as LockId[]) : [];
    const hints: Progress['hints'] = {};
    for (const id of LOCK_IDS)
      if (typeof saved.hints?.[id] === 'number') hints[id] = Math.min(2, saved.hints[id]);
    return {
      open: locks(saved.open),
      shown: locks(saved.shown),
      noted: Array.isArray(saved.noted)
        ? saved.noted.filter((id: ClueId) => CLUE_IDS.includes(id))
        : [],
      hints,
      sound: saved.sound === true,
    };
  } catch {
    return INITIAL;
  }
}

export const getProgress = () => (state ??= load());

function update(change: (p: Progress) => Progress) {
  const next = change(getProgress());
  if (next === state) return;
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked; progress still holds for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useProgress = () => useSyncExternalStore(subscribe, getProgress, () => INITIAL);

export function openLock(id: LockId, shown = false) {
  update((p) =>
    p.open.includes(id)
      ? p
      : { ...p, open: [...p.open, id], shown: shown ? [...p.shown, id] : p.shown },
  );
}

export function noteClue(id: ClueId) {
  update((p) => (p.noted.includes(id) ? p : { ...p, noted: [...p.noted, id] }));
}

export function takeHint(id: LockId) {
  update((p) => ({ ...p, hints: { ...p.hints, [id]: Math.min(2, (p.hints[id] ?? 0) + 1) } }));
}

/** "Skip the puzzles": every lock open at once, every clue noted. */
export function openAll() {
  update((p) => ({ ...p, open: [...LOCK_IDS], noted: [...CLUE_IDS] }));
}

/** Locks the room again, keeping the sound setting. */
export function resetRoom() {
  update((p) => ({ ...INITIAL, sound: p.sound }));
}

export function setSound(on: boolean) {
  update((p) => ({ ...p, sound: on }));
}
