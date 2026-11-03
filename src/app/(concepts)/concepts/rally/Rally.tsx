'use client';

import { useCallback, useState } from 'react';
import { concept } from '../_shared/concepts';
import { db, profile } from '../_shared/data';
import Board, { type Opened, type Stats } from './Board';
import { CHAPTERS, ChapterBody, ZONES } from './Chapters';
import Court, { type Snapshot } from './Court';
import { zoneName, type GameEvent } from './game';
import s from './rally.module.scss';

// Concept R · Rally. The career as a rally you can play: a table seen from behind your end line,
// a ball on real physics, and a bot across the net. The bot's half is split into nine zones, one
// chapter each; every shot of yours that lands opens a chapter on the board beside the table. A
// long rally reads the whole page, and the page is also below, in order, for reading without
// playing. Table tennis is only the interface: the content is the career.

const { person } = db;
const two = (n: number) => String(n).padStart(2, '0');

const START: Snapshot = { you: 0, bot: 0, gamesYou: 0, gamesBot: 0, server: 'you', rally: 0 };
const NO_STATS: Stats = { rally: 0, longest: 0, fastest: 0, spin: 0 };
const CALL_WORDS: Record<string, string> = {
  Long: 'Long',
  Wide: 'Wide',
  Net: 'Into the net',
  Missed: 'Missed',
  Fault: 'Fault',
};

export default function Rally() {
  const [score, setScore] = useState<Snapshot>(START);
  const [stats, setStats] = useState<Stats>(NO_STATS);
  const [opened, setOpened] = useState<Record<number, Opened>>({});
  const [current, setCurrent] = useState<number | null>(null);
  const [say, setSay] = useState('');

  const onEvent = useCallback((e: GameEvent, snap: Snapshot) => {
    if (e.type === 'hit') {
      setStats((st) => ({
        rally: e.n,
        longest: Math.max(st.longest, e.n),
        fastest: e.by === 'you' ? Math.max(st.fastest, e.kmh) : st.fastest,
        spin: e.by === 'you' ? Math.max(st.spin, e.rpm) : st.spin,
      }));
    } else if (e.type === 'land') {
      if (!e.fresh) return;
      const ch = CHAPTERS[e.chapter];
      setOpened((o) => ({ ...o, [e.chapter]: { n: e.n, zone: e.zone, direct: e.direct } }));
      setCurrent(e.chapter);
      setSay(
        e.direct
          ? `Shot ${e.n} landed ${zoneName(e.zone)}. Chapter ${e.chapter + 1}, ${ch.title}, is on the board.`
          : `Shot ${e.n} landed ${zoneName(e.zone)}, already read, so chapter ${e.chapter + 1}, ${ch.title}, opened instead.`,
      );
    } else if (e.type === 'point') {
      setScore(snap);
      setSay(
        `${CALL_WORDS[e.call] ?? e.call}. Point to ${e.winner === 'you' ? 'you' : 'the bot'}. You ${snap.you}, bot ${snap.bot}.`,
      );
    } else if (e.type === 'game') {
      setSay(`Game to ${e.winner === 'you' ? 'you' : 'the bot'}.`);
    } else if (e.type === 'let') {
      setSay('Let: the serve touched the net. Serve again.');
    } else if (e.type === 'phase') {
      setScore(snap);
      if (e.phase === 'ready') setStats((st) => ({ ...st, rally: 0 }));
    }
  }, []);

  const onReset = useCallback(() => {
    setScore(START);
    setStats(NO_STATS);
    setOpened({});
    setCurrent(null);
    setSay('New match. Your serve.');
  }, []);

  const count = Object.keys(opened).length;

  return (
    <div className={s.root}>
      <a className={s.skip} href="#sheet">
        Skip the game and read the page
      </a>

      <header className={s.top}>
        <div className={s.brand}>
          <span className={s.mark} aria-hidden="true">
            {concept('rally').letter}
          </span>
          <div>
            <h1>{profile.name}</h1>
            <p>{`${profile.role} at ${profile.company}`}</p>
          </div>
        </div>
        <p className={s.intro}>
          A rally you can play. Every ball you land on the bot’s half opens the chapter written in
          that zone. Keep it going and you’ve read the whole page.
        </p>
        <nav className={s.topLinks} aria-label="Shortcuts">
          <a href="#sheet" className={s.readLink}>
            Read without playing ↓
          </a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV ↗
          </a>
          <a href={`mailto:${profile.email}`}>Email</a>
        </nav>
      </header>

      <main>
        <section className={s.stage} aria-label="The rally">
          <Court onEvent={onEvent} onReset={onReset} />
          <Board
            score={score}
            stats={stats}
            opened={opened}
            current={current}
            onShow={setCurrent}
          />
          <p className={s.sr} aria-live="polite" aria-atomic="true">
            {say}
          </p>
        </section>

        <section id="sheet" className={s.sheet} aria-labelledby="sheet-title" tabIndex={-1}>
          <header className={s.sheetHead}>
            <p className={s.kicker}>The page, in order</p>
            <h2 id="sheet-title">Read without playing</h2>
            <p>
              Every chapter on the table, from the middle zone out.{' '}
              {count
                ? `You’ve opened ${count} of ${CHAPTERS.length} in play; those are marked.`
                : 'None opened in play yet.'}
            </p>
          </header>
          <ol className={s.chapters}>
            {CHAPTERS.map((ch, i) => {
              const o = opened[i];
              const zone = ZONES.indexOf(i);
              return (
                <li
                  key={ch.id}
                  id={`ch-${ch.id}`}
                  className={s.chapter}
                  data-open={o ? true : undefined}
                >
                  <header>
                    <span className={s.chBig}>{two(i + 1)}</span>
                    <div>
                      <h3>{ch.title}</h3>
                      <p>
                        <span className={s.zoneTag}>{zoneName(zone)}</span>
                        {o ? (
                          <span className={s.stamp}>{`Opened in play, shot ${o.n}`}</span>
                        ) : (
                          <span className={s.unplayed}>Not reached in play yet</span>
                        )}
                      </p>
                    </div>
                  </header>
                  <div className={s.chBody}>
                    <ChapterBody id={ch.id} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </main>

      <footer className={s.footer}>
        <p>
          <b>{`${concept('rally').letter} · ${concept('rally').name}`}</b>
          {`, concept ${concept('rally').letter}. © ${profile.fullName}, ${person.since} → ${db.asOf.y}.`}
        </p>
        <p>
          The ball flies on a real model: gravity, air drag, Magnus force from its spin, table
          bounces with restitution and friction (topspin kicks, backspin checks), and a net with a
          round tape it can clip. Each shot is solved for its height over the net and where it
          lands, against the same model. Regulation table and ball. The game is only the interface;
          the content is the career.
        </p>
      </footer>
    </div>
  );
}
