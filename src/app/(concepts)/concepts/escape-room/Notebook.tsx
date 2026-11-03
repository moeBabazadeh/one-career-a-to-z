'use client';

import { notesOf } from './Closeup';
import { LOCKS, SECTIONS, type LockId } from './puzzles';
import SectionBody from './Sections';
import type { Progress } from './store';
import s from './escape.module.scss';

interface Props {
  progress: Progress;
  onGoTo: (id: LockId, from: DOMRect) => void;
  onSkip: () => void;
  onReset: () => void;
}

/** What the visitor keeps: a page for every compartment they've opened, and their notes. */
export default function Notebook({ progress, onGoTo, onSkip, onReset }: Props) {
  const open = new Set(progress.open);
  const notes = notesOf(progress);
  const all = open.size === SECTIONS.length;
  return (
    <section id="notebook" className={s.notebook} aria-labelledby="nb-title">
      <div className={s.nbCover}>
        <header className={s.nbHead}>
          <div>
            <h2 id="nb-title">Notebook</h2>
            <p>
              {open.size} of {SECTIONS.length} pages found
              {all ? '. That’s everything.' : '. Each lock you open adds one.'}
            </p>
          </div>
          <div className={s.nbActions}>
            {!all && (
              <button type="button" className={s.ghostBtn} onClick={onSkip}>
                Skip the puzzles, fill it in
              </button>
            )}
            {open.size > 0 && (
              <button type="button" className={s.ghostBtn} onClick={onReset}>
                Lock the room again
              </button>
            )}
          </div>
        </header>
        <div className={s.nbBook}>
          <nav className={s.nbIndex} aria-label="Notebook pages">
            <p className={s.nbLabel}>Contents</p>
            <ol>
              {SECTIONS.map((sec) => {
                const lock = LOCKS[sec.lock];
                const got = open.has(sec.lock);
                return (
                  <li key={sec.id} data-open={got}>
                    <a href={`#page-${sec.id}`}>
                      <span className={s.nbMark} aria-hidden="true">
                        {got ? '✓' : ''}
                      </span>
                      <b>{sec.title}</b>
                      <small>
                        {got
                          ? `from the ${lock.name.toLowerCase()}`
                          : `locked: the ${lock.name.toLowerCase()}`}
                      </small>
                    </a>
                  </li>
                );
              })}
            </ol>
            <div className={s.nbNotes}>
              <p className={s.nbLabel}>Things I noticed</p>
              {notes.length ? (
                <ul>
                  {notes.map((n) => (
                    <li key={n.id}>{n.text}</li>
                  ))}
                </ul>
              ) : (
                <p className={s.nbEmpty}>Nothing yet. Look closer at things in the room.</p>
              )}
            </div>
          </nav>
          <div className={s.nbPages}>
            {SECTIONS.map((sec, i) => {
              const lock = LOCKS[sec.lock];
              if (!open.has(sec.lock))
                return (
                  <article
                    key={sec.id}
                    id={`page-${sec.id}`}
                    className={s.pageLocked}
                    aria-labelledby={`pt-${sec.id}`}
                  >
                    <span className={s.pageNo}>{i + 1}</span>
                    <h3 id={`pt-${sec.id}`}>{sec.title}</h3>
                    <p>
                      Still locked in the {lock.name.toLowerCase()}: a{' '}
                      {lock.mechanism.toLowerCase()}.
                    </p>
                    <button
                      type="button"
                      className={s.ghostBtn}
                      onClick={(e) => onGoTo(sec.lock, e.currentTarget.getBoundingClientRect())}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        onGoTo(sec.lock, e.currentTarget.getBoundingClientRect());
                      }}
                    >
                      Go to the {lock.name.toLowerCase()}
                    </button>
                  </article>
                );
              return (
                <article
                  key={sec.id}
                  id={`page-${sec.id}`}
                  className={s.page}
                  aria-labelledby={`pt-${sec.id}`}
                >
                  <header>
                    <span className={s.pageNo}>{i + 1}</span>
                    <p className={s.pageFrom}>
                      from the {lock.name.toLowerCase()}
                      {progress.shown.includes(sec.lock) && ' · shown'}
                    </p>
                    <h3 id={`pt-${sec.id}`}>{sec.title}</h3>
                  </header>
                  <SectionBody id={sec.id} />
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
