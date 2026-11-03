'use client';

import { useEffect, useRef, useState } from 'react';
import { db } from '../_shared/data';
import { CLUE_VIEWS } from './Clues';
import { LOCK_VIEWS, type LockHandle } from './Locks';
import {
  CLUES,
  objectById,
  OBJECTS,
  sectionOf,
  type ClueId,
  type LockDef,
  type LockId,
  type ObjectId,
} from './puzzles';
import SectionBody from './Sections';
import { takeHint, type Progress } from './store';
import { sfx } from './sound';
import s from './escape.module.scss';

interface Props {
  picked: { id: ObjectId; from: DOMRect | null } | null;
  progress: Progress;
  reduced: boolean;
  onClose: () => void;
  onPick: (id: ObjectId) => void;
  onOpened: (id: LockId, shown: boolean) => void;
  /** The page's latest announcement, repeated in here while the dialog has the page's attention. */
  said: string;
}

/** Everything written down so far: the clues noted, and the letter once it's open. */
export function notesOf(progress: Progress) {
  const notes = OBJECTS.filter(
    (o): o is (typeof CLUES)[ClueId] => o.kind === 'clue' && progress.noted.includes(o.id),
  ).map((o) => ({ id: o.id as string, text: o.note }));
  if (progress.open.includes('seal'))
    notes.unshift({ id: 'letter', text: `Letter: building since ${db.person.since}.` });
  return notes;
}

function Notes({ progress }: { progress: Progress }) {
  const notes = notesOf(progress);
  return (
    <div className={s.notes}>
      <h3>Your notes</h3>
      {notes.length ? (
        <ul>
          {notes.map((n) => (
            <li key={n.id}>{n.text}</li>
          ))}
        </ul>
      ) : (
        <p>
          Nothing written down yet. Clues are written on things around the room; look closer at one
          and it goes in here.
        </p>
      )}
    </div>
  );
}

function LockSide({
  def,
  progress,
  status,
  onTry,
  onShow,
}: {
  def: LockDef;
  progress: Progress;
  status: { text: string; tone: string; n: number };
  onTry: () => void;
  onShow: () => void;
}) {
  const hints = progress.hints[def.id] ?? 0;
  return (
    <>
      <div className={s.plate}>
        <span className={s.screw} aria-hidden="true" />
        <p>{def.plate}</p>
        <span className={s.screw} aria-hidden="true" />
      </div>
      <p className={s.status} data-tone={status.tone} role="status">
        {status.text}
      </p>
      <div className={s.actions}>
        {def.id !== 'laptop' && (
          <button type="button" className={s.tryBtn} onClick={onTry}>
            {def.action}
            <kbd>Enter</kbd>
          </button>
        )}
        <button
          type="button"
          className={s.ghostBtn}
          disabled={hints >= def.hints.length}
          onClick={() => {
            takeHint(def.id);
            sfx('tick');
          }}
        >
          {hints ? `Another hint (${hints}/${def.hints.length})` : 'A hint'}
        </button>
        <button type="button" className={s.ghostBtn} onClick={onShow}>
          Show me
        </button>
      </div>
      {hints > 0 && (
        <ol className={s.hints} aria-label="Hints">
          {def.hints.slice(0, hints).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      )}
      <p className={s.keysHelp}>
        <span>Keys</span> {def.keys}
      </p>
      <Notes progress={progress} />
    </>
  );
}

export default function Closeup({
  picked,
  progress,
  reduced,
  onClose,
  onPick,
  onOpened,
  said,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const lock = useRef<LockHandle>(null);
  const [status, setStatus] = useState({ text: '', tone: 'idle', n: 0, id: '' as ObjectId | '' });
  const [fresh, setFresh] = useState<LockId | null>(null);
  const id = picked?.id ?? null;
  const def = id ? objectById(id) : null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (id && picked) {
      if (!d.open) {
        const r = picked.from;
        d.style.setProperty('--ox', r ? `${r.left + r.width / 2 - innerWidth / 2}px` : '0px');
        d.style.setProperty('--oy', r ? `${r.top + r.height / 2 - innerHeight / 2}px` : '40px');
        d.showModal();
      }
      // Hands go straight to the mechanism, or to the close button when there's nothing to work.
      // A frame later, so the keystroke that opened this can't also press what gets focus.
      const frame = requestAnimationFrame(() => {
        const target =
          d.querySelector<HTMLElement>('[data-stage] [tabindex="0"]') ??
          d.querySelector<HTMLElement>('[data-stage] button:not([disabled]):not([tabindex="-1"])');
        (target ?? d.querySelector<HTMLElement>('[data-close]'))?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    } else if (!id && d.open) d.close();
  }, [id, picked]);

  /** Enter and Space act on keydown, so they never carry over to what the dialog focuses next. */
  const press = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    fn();
  };

  const i = id ? OBJECTS.findIndex((o) => o.id === id) : 0;
  const prev = OBJECTS[(i - 1 + OBJECTS.length) % OBJECTS.length];
  const next = OBJECTS[(i + 1) % OBJECTS.length];
  const isOpen = def?.kind === 'lock' && progress.open.includes(def.id);
  const shown = def?.kind === 'lock' && progress.shown.includes(def.id);
  const live = status.id === id ? status : { text: '', tone: 'idle', n: 0 };
  const Lock = def?.kind === 'lock' ? LOCK_VIEWS[def.id] : null;
  const Clue = def?.kind === 'clue' ? CLUE_VIEWS[def.id] : null;

  const solve = (lockId: LockId) => (wasShown: boolean) => {
    setFresh(lockId);
    setStatus({ text: '', tone: 'idle', n: 0, id: lockId });
    onOpened(lockId, wasShown);
  };
  const wrong = (lockId: LockId) => (why: string) => {
    sfx('wrong');
    setStatus((st) => {
      const n = st.id === lockId ? st.n + 1 : 1;
      const stuck = n >= 2 && !(progress.hints[lockId] ?? 0) ? ' Stuck? Take a hint.' : '';
      return { text: `${why}${stuck}`, tone: 'wrong', n, id: lockId };
    });
  };

  return (
    <dialog
      ref={ref}
      className={s.closeup}
      aria-labelledby="cu-title"
      onClose={(e) => {
        // The close event is queued: if the dialog was opened again meanwhile, it's stale.
        if (!e.currentTarget.open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      {def && (
        <div className={s.cuInner} data-kind={def.kind} data-object={def.id}>
          <header className={s.cuHead}>
            <button
              type="button"
              className={s.cuNav}
              onClick={() => onPick(prev.id)}
              onKeyDown={press(() => onPick(prev.id))}
              aria-label={`Previous: ${prev.name}`}
            >
              <span aria-hidden="true">‹</span>
              <span className={s.cuNavName}>{prev.name}</span>
            </button>
            <div className={s.cuTitle}>
              <p>
                {def.kind === 'lock'
                  ? isOpen
                    ? `${def.mechanism} · open`
                    : def.mechanism
                  : 'Clue · look closely'}
              </p>
              <h2 id="cu-title">{def.name}</h2>
            </div>
            <button
              type="button"
              className={s.cuNav}
              data-dir="next"
              onClick={() => onPick(next.id)}
              onKeyDown={press(() => onPick(next.id))}
              aria-label={`Next: ${next.name}`}
            >
              <span className={s.cuNavName}>{next.name}</span>
              <span aria-hidden="true">›</span>
            </button>
            <button
              type="button"
              className={s.cuClose}
              data-close
              onClick={() => ref.current?.close()}
              aria-label="Back to the room"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 3.5l9 9m0-9-9 9" />
              </svg>
            </button>
          </header>
          <div className={s.cuBody}>
            <div
              className={s.cuStage}
              data-stage
              data-shake={live.tone === 'wrong' ? (live.n % 2 ? 'a' : 'b') : undefined}
            >
              {Lock && def.kind === 'lock' && (
                <Lock
                  key={def.id}
                  ref={lock}
                  open={isOpen}
                  reduced={reduced}
                  onSolve={solve(def.id)}
                  onWrong={wrong(def.id)}
                />
              )}
              {Clue && <Clue key={def.id} />}
            </div>
            <div className={s.cuSide}>
              {def.kind === 'clue' && (
                <>
                  <p className={s.notedTag}>Written in your notebook</p>
                  <p className={s.noteHand}>{def.note}</p>
                  <p className={s.cuHelp}>
                    Clues are written on things. Keep looking: every lock in the study asks for
                    something you can read in here.
                  </p>
                  <Notes progress={progress} />
                </>
              )}
              {def.kind === 'lock' && !isOpen && (
                <LockSide
                  def={def}
                  progress={progress}
                  status={live.text ? live : { text: 'Locked.', tone: 'idle', n: 0 }}
                  onTry={() => lock.current?.tryIt()}
                  onShow={() => lock.current?.showMe()}
                />
              )}
              {def.kind === 'lock' && isOpen && (
                <div className={s.found} data-fresh={fresh === def.id}>
                  <p className={s.foundStamp}>
                    {def.opened}
                    {shown && <span> · shown</span>}
                  </p>
                  <h3>{sectionOf(def.id).title}</h3>
                  <p className={s.kept}>
                    Kept in your notebook.{' '}
                    <a href={`#page-${sectionOf(def.id).id}`} onClick={() => ref.current?.close()}>
                      Read it there ↓
                    </a>
                  </p>
                  <div className={s.sectionBody}>
                    <SectionBody id={sectionOf(def.id).id} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className={s.sr} aria-live="polite">
            {said}
          </p>
        </div>
      )}
    </dialog>
  );
}
