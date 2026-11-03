'use client';

import { memo, useEffect, useState } from 'react';
import { db, jobs, roles } from '../_shared/data';
import { useInView, useReducedMotion } from '../_shared/hooks';
import { Bullet } from './NetworkMap';
import { LINE, type LineId } from './network';
import s from './transit.module.scss';

// The order of the characters on a split-flap drum. A flap only turns forward, so getting from
// blank to "N" takes fourteen flips, and getting to "9" takes thirty-six.
const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&.→:-';
const STEP_MS = 42;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const stamp = (year: number) =>
  `${MONTHS[Math.floor((year % 1) * 12)]} ${String(Math.floor(year)).slice(2)}`;

const COLS = { time: 6, dest: 9, service: 21, remark: 10 };

// The lines each role runs on the board.
const LINES_OF: Record<db.RoleId, LineId[]> = {
  neuroship: ['W', 'L'],
  neuroject: ['L', 'W', 'A'],
  zeroone: ['L', 'W', 'M', 'E', 'A'],
  alget: ['W'],
  niknam: ['E', 'W', 'L'],
  freelance: ['W'],
};

// Boards abbreviate a title the way boards do, and only as far as it takes to fit.
const SHORTER: [RegExp, string][] = [
  [/ENGINEER/g, 'ENG'],
  [/DEVELOPER/g, 'DEV'],
  [/FULL STACK/g, 'FS'],
  [/SOFTWARE ENG/g, 'ENG'],
];
function boardTitle(title: string) {
  let text = title.toUpperCase();
  for (const [long, short] of SHORTER) {
    if (text.length <= COLS.service) break;
    text = text.replace(long, short);
  }
  return text;
}

const ROWS = [...roles]
  .sort((a, b) => b.start - a.start)
  .map((r) => {
    const role: db.Role = db.roles[r.id as db.RoleId];
    const company = role.short ?? role.org;
    return {
      ...r,
      dest: company.toUpperCase(),
      service: boardTitle(db.titlePath(role)),
      lines: LINES_OF[r.id as db.RoleId],
      job: company,
      time: stamp(r.start),
      remark: r.end ? 'DEPARTED' : 'IN SERVICE',
    };
  });

/** Enough steps for the slowest flap on the last row to land. */
const DONE = DRUM.length + COLS.service + ROWS.length * 3 + 12;
const pad = (text: string, n: number) => text.padEnd(n).slice(0, n);

/* ------------------------------------------------------------------ flaps */

/** One split-flap character. Each change replays the fall of the top leaf. */
const Flap = memo(function Flap({ ch, prev }: { ch: string; prev: string }) {
  return (
    <span className={s.flap}>
      <span className={s.flapTop}>{ch}</span>
      <span className={s.flapBottom}>{prev}</span>
      {prev !== ch && (
        <>
          <span key={`t${ch}`} className={s.leafTop}>
            {prev}
          </span>
          <span key={`b${ch}`} className={s.leafBottom}>
            {ch}
          </span>
        </>
      )}
    </span>
  );
});

/** A run of flaps that spin up to `text`, starting `delay` steps after the board wakes. */
function FlapText({ text, tick, delay }: { text: string; tick: number; delay: number }) {
  return (
    <span className={s.flaps} aria-hidden="true">
      {[...text].map((c, i) => {
        const target = Math.max(0, DRUM.indexOf(c));
        const step = Math.min(target, Math.max(0, tick - delay - i));
        const settled = tick - delay - i > target;
        return (
          <Flap key={i} ch={DRUM[step]} prev={settled ? DRUM[step] : DRUM[Math.max(0, step - 1)]} />
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ clock */

const hhmm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** A flap clock: turns over once a minute, like the one above every board. */
function FlapClock() {
  const [time, setTime] = useState({ now: '--:--', was: '--:--' });
  useEffect(() => {
    const update = () => setTime((t) => (t.now === hhmm() ? t : { now: hhmm(), was: t.now }));
    const first = window.setTimeout(update, 0);
    const every = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
  return (
    <span className={s.boardClock} aria-label={`Local time ${time.now}`}>
      <span className={s.flaps} aria-hidden="true">
        {[...time.now].map((c, i) => (
          <Flap key={i} ch={c} prev={time.was[i] ?? c} />
        ))}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ the board */

export default function Departures() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(true, 0.25);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState('neuroject');
  const done = tick >= DONE;

  useEffect(() => {
    if (!inView || reduced || done) return;
    const id = window.setInterval(() => setTick((t) => Math.min(DONE, t + 1)), STEP_MS);
    return () => window.clearInterval(id);
  }, [inView, reduced, done]);

  const now = reduced ? DONE : tick;
  const row = ROWS.find((r) => r.id === selected)!;
  const job = jobs.find((j) => j.company === row.job)!;
  const color = LINE[row.lines[0]].color;

  return (
    <div className={s.departures}>
      <div ref={ref} className={s.board}>
        <div className={s.boardHead}>
          <h3>
            Departures <span>{`Services since ${db.person.since}`}</span>
          </h3>
          <FlapClock />
        </div>
        <div className={s.boardCols} aria-hidden="true">
          <span className={s.colTime}>Time</span>
          <span className={s.colDest}>Destination</span>
          <span className={s.colService}>Service</span>
          <span className={s.colLines}>Lines</span>
          <span className={`${s.colRemark} ${s.colRemarkHead}`}>Remarks</span>
        </div>
        <ul className={s.boardRows}>
          {ROWS.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                className={s.boardRow}
                aria-pressed={selected === r.id}
                data-live={!r.end || undefined}
                onClick={() => setSelected(r.id)}
              >
                <span className={s.sr}>
                  {r.org}, {r.title}, {r.range}. {r.end ? 'Departed.' : 'In service now.'}
                </span>
                <span className={s.colTime}>
                  <FlapText text={pad(r.time, COLS.time)} tick={now} delay={i * 3} />
                </span>
                <span className={s.colDest}>
                  <FlapText text={pad(r.dest, COLS.dest)} tick={now} delay={i * 3 + 4} />
                </span>
                <span className={s.colService}>
                  <FlapText text={pad(r.service, COLS.service)} tick={now} delay={i * 3 + 8} />
                </span>
                <span className={`${s.colLines} ${s.boardLines}`} aria-hidden="true">
                  {r.lines.map((id) => (
                    <Bullet key={id} id={id} size="sm" />
                  ))}
                </span>
                <span className={`${s.colRemark} ${s.remark}`}>
                  <FlapText text={pad(r.remark, COLS.remark)} tick={now} delay={i * 3 + 12} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className={s.boardNote}>Select a service for its calling points.</p>
      </div>

      <section
        className={s.service}
        style={{ '--c': color } as React.CSSProperties}
        aria-live="polite"
        aria-labelledby="service-title"
      >
        <p className={s.serviceKicker}>
          {row.lines.map((id) => (
            <Bullet key={id} id={id} size="sm" />
          ))}
          <span>{row.end ? 'Departed' : 'In service'}</span>
        </p>
        <div className={s.serviceGrid}>
          <div>
            <h3 id="service-title">
              {job.title} at{' '}
              {job.url ? (
                <a href={job.url} target="_blank" rel="noreferrer">
                  {job.company} ↗
                </a>
              ) : (
                job.company
              )}
            </h3>
            <p className={s.serviceRange}>{job.range}</p>
            <p className={s.serviceLines}>
              {row.lines.map((id) => LINE[id].name).join(', ')} lines
            </p>
          </div>
          <div>
            <p className={s.callingAt}>Calling at</p>
            <ol className={s.stops}>
              {job.duties.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
