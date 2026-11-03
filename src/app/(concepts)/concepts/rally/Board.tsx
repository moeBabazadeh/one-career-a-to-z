'use client';

import { CHAPTERS, ChapterBody, ZONES } from './Chapters';
import type { Snapshot } from './Court';
import { zoneName } from './game';
import s from './rally.module.scss';

export interface Opened {
  /** The shot in the rally that opened it. */
  n: number;
  zone: number;
  /** Landed in its own zone (rather than opening the next one). */
  direct: boolean;
}

export interface Stats {
  rally: number;
  longest: number;
  fastest: number;
  spin: number;
}

const two = (n: number) => String(n).padStart(2, '0');

/** A flip card: a new value drops in from the top. */
function Flip({
  value,
  big = false,
  label,
}: {
  value: number | string;
  big?: boolean;
  label: string;
}) {
  return (
    <span className={s.flip} data-big={big || undefined} aria-label={label} role="img">
      <span key={String(value)} className={s.card}>
        {value}
      </span>
    </span>
  );
}

/** The far half as you see it from your end: long at the top, short by the net. */
const MAP_ROWS = [2, 1, 0];

export default function Board({
  score,
  stats,
  opened,
  current,
  onShow,
}: {
  score: Snapshot;
  stats: Stats;
  opened: Record<number, Opened>;
  current: number | null;
  onShow: (chapter: number) => void;
}) {
  const count = Object.keys(opened).length;
  const shown = current !== null ? CHAPTERS[current] : null;
  const info = current !== null ? opened[current] : null;

  return (
    <aside className={s.board} aria-labelledby="board-title">
      <h2 id="board-title" className={s.sr}>
        Scoreboard and reader
      </h2>
      <div className={s.score}>
        {(['you', 'bot'] as const).map((side) => (
          <div key={side} className={s.side} data-side={side}>
            <span className={s.who}>
              <i
                className={s.serveDot}
                data-on={score.server === side || undefined}
                title={score.server === side ? 'Serving' : undefined}
              />
              {side === 'you' ? 'You' : 'Bot'}
            </span>
            <span className={s.games}>
              <small>Games</small>
              <Flip
                value={side === 'you' ? score.gamesYou : score.gamesBot}
                label={`${side === 'you' ? 'Your' : 'The bot’s'} games: ${side === 'you' ? score.gamesYou : score.gamesBot}`}
              />
            </span>
            <Flip
              big
              value={side === 'you' ? score.you : score.bot}
              label={`${side === 'you' ? 'Your' : 'The bot’s'} points: ${side === 'you' ? score.you : score.bot}`}
            />
          </div>
        ))}
      </div>
      <dl className={s.stats}>
        <div>
          <dt>Rally</dt>
          <dd>{stats.rally}</dd>
        </div>
        <div>
          <dt>Longest</dt>
          <dd>{stats.longest}</dd>
        </div>
        <div>
          <dt>Your fastest</dt>
          <dd>
            {Math.round(stats.fastest)}
            <small>km/h</small>
          </dd>
        </div>
        <div>
          <dt>Most spin</dt>
          <dd>
            {(stats.spin / 1000).toFixed(1)}
            <small>k rpm</small>
          </dd>
        </div>
      </dl>

      <section className={s.reader} aria-labelledby="reader-title" data-empty={!shown || undefined}>
        <header className={s.readerHead}>
          <span className={s.chNo}>
            <Flip
              value={shown ? two((current as number) + 1) : '--'}
              label={shown ? `Chapter ${(current as number) + 1}` : 'No chapter yet'}
            />
            <small>/ {two(CHAPTERS.length)}</small>
          </span>
          <div>
            <h3 id="reader-title">{shown ? shown.title : 'Nothing on the board yet'}</h3>
            <p>
              {info
                ? `Shot ${info.n} of its rally, ${zoneName(info.zone)}${info.direct ? '' : ' (that zone was read, so the next chapter opened)'}`
                : `${count} of ${CHAPTERS.length} chapters open`}
            </p>
          </div>
        </header>
        <div
          key={current ?? 'empty'}
          className={s.readerBody}
          tabIndex={shown ? 0 : -1}
          aria-label={shown ? `${shown.title}, chapter ${(current as number) + 1}` : undefined}
        >
          {shown ? (
            <ChapterBody id={shown.id} compact />
          ) : (
            <ol className={s.how}>
              <li>
                <b>Serve into a zone.</b> The bot’s half is split into nine zones, and each one
                holds a chapter of the career.
              </li>
              <li>
                <b>Keep the ball in play.</b> Every shot of yours that lands opens the chapter where
                it lands. Land on one you’ve read and the next unread one opens instead.
              </li>
              <li>
                <b>Rally long enough</b> and you’ve read the whole page. Or skip the game and{' '}
                <a href="#sheet">read it in order</a>.
              </li>
            </ol>
          )}
        </div>
      </section>

      <nav className={s.map} aria-label="Chapters on the table">
        <p className={s.mapHead}>
          <span>The bot’s end</span>
          <span>
            {count}/{CHAPTERS.length} open
          </span>
        </p>
        <ol>
          {MAP_ROWS.flatMap((row) =>
            [0, 1, 2].map((col) => {
              const zone = row * 3 + col;
              const ch = ZONES[zone];
              const open = !!opened[ch];
              return (
                <li key={zone}>
                  <button
                    type="button"
                    data-open={open || undefined}
                    data-current={current === ch || undefined}
                    aria-disabled={!open}
                    aria-current={current === ch ? 'true' : undefined}
                    onClick={() => open && onShow(ch)}
                    title={
                      open
                        ? `Show ${CHAPTERS[ch].title}`
                        : `Land a ball ${zoneName(zone)} to open ${CHAPTERS[ch].title}`
                    }
                  >
                    <b>{two(ch + 1)}</b>
                    <span>{CHAPTERS[ch].short}</span>
                  </button>
                </li>
              );
            }),
          )}
        </ol>
        <p className={s.mapFoot}>Net, then your end ↓</p>
      </nav>
    </aside>
  );
}
