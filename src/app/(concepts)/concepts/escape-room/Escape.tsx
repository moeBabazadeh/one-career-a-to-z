'use client';

import { useRef, useState } from 'react';
import { concept } from '../_shared/concepts';
import { db, fmt, profile } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import Closeup from './Closeup';
import Notebook from './Notebook';
import { CLUES, LOCK_IDS, LOCKS, sectionOf, type LockId, type ObjectId } from './puzzles';
import Room from './Room';
import { sfx } from './sound';
import { noteClue, openAll, openLock, resetRoom, setSound, useProgress } from './store';
import s from './escape.module.scss';

const { person } = db;
const TOTAL = LOCK_IDS.length;

export default function Escape() {
  const progress = useProgress();
  const reduced = useReducedMotion();
  const [picked, setPicked] = useState<{ id: ObjectId; from: DOMRect | null } | null>(null);
  const [said, setSaid] = useState({ text: '', n: 0 });
  const toastTimer = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const count = progress.open.length;
  const escaped = count === TOTAL;

  const announce = (text: string, show = true) => {
    setSaid((p) => ({ text, n: p.n + 1 }));
    if (!show) return;
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  };

  const pick = (id: ObjectId, from: DOMRect | null = null) => {
    if (id in CLUES) noteClue(id as keyof typeof CLUES);
    setPicked((p) => ({ id, from: from ?? p?.from ?? null }));
  };

  const opened = (id: LockId, shown: boolean) => {
    const n = progress.open.includes(id) ? count : count + 1;
    openLock(id, shown);
    sfx('open');
    announce(
      `${LOCKS[id].opened}: ${sectionOf(id).title}. ${n} of ${TOTAL} locks open.${n === TOTAL ? ' You’re out.' : ''}`,
    );
  };

  const skip = () => {
    openAll();
    sfx('open');
    announce(
      `Puzzles skipped: all ${fmt.spell(TOTAL)} locks open, and every page is in the notebook.`,
    );
    document
      .getElementById('notebook')
      ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const reset = () => {
    resetRoom();
    announce('The room is locked again.');
  };

  return (
    <div className={s.root} data-escaped={escaped}>
      <a href="#notebook" className={s.skipLink}>
        Skip to the notebook
      </a>
      <header className={s.top}>
        <div className={s.plaque}>
          <p className={s.plaqueKicker}>The study of</p>
          <h1>{profile.name}</h1>
          <p className={s.plaqueRole}>
            {profile.role}, {profile.company} · building since {person.since}
          </p>
        </div>
        <div className={s.tally} role="group" aria-label={`${count} of ${TOTAL} locks open`}>
          <ol aria-hidden="true">
            {LOCK_IDS.map((id) => (
              <li key={id} data-open={progress.open.includes(id)} title={LOCKS[id].name} />
            ))}
          </ol>
          <p>
            <b>{count}</b> of {TOTAL} open
          </p>
        </div>
        <div className={s.topActions}>
          <button
            type="button"
            className={s.soundBtn}
            aria-pressed={progress.sound}
            aria-label={`Sound ${progress.sound ? 'on' : 'off'}`}
            onClick={() => setSound(!progress.sound)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 8h3l4-3v10l-4-3H3z" />
              {progress.sound ? (
                <path d="M13 7c1.4 1.6 1.4 4.4 0 6M15.5 5c2.6 2.8 2.6 7.2 0 10" />
              ) : (
                <path d="M13 8l4 4m0-4-4 4" />
              )}
            </svg>
            <span className={s.soundLabel}>Sound {progress.sound ? 'on' : 'off'}</span>
          </button>
          <a href="#notebook" className={s.ghostBtn}>
            Notebook
          </a>
          {escaped ? (
            <button type="button" className={s.ghostBtn} onClick={reset}>
              Lock it again
            </button>
          ) : (
            <button type="button" className={s.skipBtn} onClick={skip}>
              Skip the puzzles
            </button>
          )}
        </div>
      </header>

      <main>
        <section className={s.intro} aria-labelledby="intro-title">
          <h2 id="intro-title" className={s.sr}>
            How the study works
          </h2>
          <p className={s.introNote}>
            {escaped ? (
              <>
                All {fmt.spell(TOTAL)} locks are open and the door is too. Everything is in the
                notebook below.
              </>
            ) : count ? (
              <>
                {fmt.Spell(count)} down, {fmt.spell(TOTAL - count)} to go. Every combination is a
                fact written somewhere in this room.
              </>
            ) : (
              <>
                You’re locked in my study. Every lock opens with a fact this room tells you: look
                closer at things, and your notebook keeps what you find. Start with the envelope on
                the desk.
              </>
            )}
          </p>
          <p className={s.introKeys}>
            <span>Click anything, or Tab to it and press Enter.</span>
            <span>In a lock, arrow keys turn and Enter tries.</span>
            <span>Hints and “show me” are on every lock.</span>
          </p>
        </section>

        <Room progress={progress} onPick={pick} />

        <Notebook progress={progress} onGoTo={pick} onSkip={skip} onReset={reset} />
      </main>

      <footer className={s.footer}>
        <p>
          © {profile.fullName}, {person.since} → {db.asOf.y} · {concept('escape-room').name},
          concept {concept('escape-room').letter}
        </p>
        <p>
          Every combination in this room is a fact from the career, and every clue to it is written
          somewhere in the room.
        </p>
      </footer>

      <Closeup
        picked={picked}
        progress={progress}
        reduced={reduced}
        onClose={() => setPicked(null)}
        onPick={(id) => pick(id)}
        onOpened={opened}
        said={said.text}
      />

      <p className={s.toast} data-show={!!toast} aria-hidden="true">
        {toast}
      </p>
      <p className={s.sr} aria-live="polite">
        {said.text}
        {said.n % 2 ? '\u200b' : ''}
      </p>
    </div>
  );
}
