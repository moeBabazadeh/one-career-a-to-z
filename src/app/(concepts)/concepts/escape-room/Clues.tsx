'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { db, fmt } from '../_shared/data';
import { CARDS, mod, type ClueId } from './puzzles';
import { sfx } from './sound';
import s from './escape.module.scss';

const { education, person, current, devices, products, asOf } = db;
const bsc = education.bsc;
const reader = devices.attendumReader;
const logger = devices.logger;
const neurobuild = products.neurobuild;
const attendum = products.attendum;
const DEGREE: Record<string, string> = { BSc: 'Bachelor of Science', MSc: 'Master of Science' };

/* ------------------------------------------------------------------ the framed diploma */

function Diploma() {
  return (
    <div className={s.diplomaFrame}>
      <div className={s.diploma}>
        <p className={s.dSchool}>{bsc.school}</p>
        <p className={s.dSmall}>on the recommendation of the faculty, confers upon</p>
        <p className={s.dName}>{person.fullName}</p>
        <p className={s.dSmall}>the degree of</p>
        <p className={s.dDegree}>{DEGREE[bsc.degree] ?? bsc.degree}</p>
        <p className={s.dField}>
          {bsc.field}
          {bsc.focus && <span> · {bsc.focus}</span>}
        </p>
        <p className={s.dYear}>
          <span>in the year</span> {bsc.to.y}
        </p>
        <span className={s.rosette} aria-hidden="true" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the wall calendar */

const MONTH_DAYS = new Date(Date.UTC(asOf.y, asOf.m ?? 1, 0)).getUTCDate();
// Weeks start on Monday.
const FIRST = (new Date(Date.UTC(asOf.y, (asOf.m ?? 1) - 1, 1)).getUTCDay() + 6) % 7;

function Calendar() {
  return (
    <div className={s.calendar}>
      <span className={s.calNail} aria-hidden="true" />
      <div className={s.calTop}>
        <p className={s.calMonth}>{fmt.monthName(asOf)}</p>
        <p className={s.calYear}>{asOf.y}</p>
      </div>
      <ol className={s.calGrid} aria-label={`${fmt.month(asOf)}, with day ${asOf.d} circled`}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <li key={`h${i}`} className={s.calHead} aria-hidden="true">
            {d}
          </li>
        ))}
        {Array.from({ length: FIRST }, (_, i) => (
          <li key={`b${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: MONTH_DAYS }, (_, i) => (
          <li key={i} data-today={i + 1 === asOf.d} aria-hidden="true">
            {i + 1}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ the corkboard */

function Corkboard() {
  return (
    <div className={s.cork}>
      <figure className={s.polaroid}>
        <span className={s.pin} aria-hidden="true" />
        <Image
          src={attendum.image as string}
          width={1280}
          height={800}
          alt={`The ${attendum.title} homepage`}
          sizes="300px"
        />
        <figcaption>{attendum.title}</figcaption>
      </figure>
      <div className={s.indexCard}>
        <span className={s.pin} data-c="brass" aria-hidden="true" />
        <p className={s.icTitle}>{neurobuild.title}</p>
        <p className={s.icLabel}>runs on</p>
        <ol>
          {neurobuild.tech.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </div>
      <p className={s.corkNote} aria-hidden="true">
        ship it!
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ the card reader on the desk */

function Reader() {
  const f = reader.fleet;
  return (
    <div className={s.readerScene}>
      <div className={s.readerDevice} aria-hidden="true">
        <span className={s.readerLed} />
        <svg viewBox="0 0 40 40" className={s.nfc}>
          <path d="M14 12c4 5 4 11 0 16M20 9c6 7 6 15 0 22M26 6c8 9 8 19 0 28" />
        </svg>
        <span className={s.readerBrand}>{attendum.title.toLowerCase()}</span>
      </div>
      <dl className={s.label}>
        <div className={s.labelHead}>
          <dt>Model</dt>
          <dd>
            {reader.tag} · {reader.name}
          </dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{reader.kind}</dd>
        </div>
        <div>
          <dt>Battery</dt>
          <dd>about {reader.batteryMonths} months</dd>
        </div>
        <div>
          <dt>Fleet</dt>
          <dd>
            {f.online.short} online at {f.scope}
          </dd>
        </div>
        <div>
          <dt>Covers</dt>
          <dd>
            {f.classrooms.short} classrooms · {f.classes.short} classes
          </dd>
        </div>
        <span className={s.barcode} aria-hidden="true" />
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ his business card */

function Card() {
  return (
    <div className={s.cardScene}>
      <div className={s.bizCard}>
        <p className={s.bizName}>{person.name}</p>
        <p className={s.bizTitle}>{current.title}</p>
        <p className={s.bizCompany}>{current.company}</p>
        <p className={s.bizLine}>
          <span>{person.email}</span>
          <span>{person.site}</span>
        </p>
      </div>
      <span className={s.cardStand} aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------ the card file */

function Rolodex() {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number } | null>(null);
  const flip = (dir: number) => {
    setAt((a) => mod(a + dir, CARDS.length));
    sfx('tick');
  };
  const flipRef = useRef(flip);
  useEffect(() => {
    flipRef.current = flip;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let acc = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += Math.max(-60, Math.min(60, e.deltaY));
      if (Math.abs(acc) >= 60) {
        flipRef.current(acc > 0 ? 1 : -1);
        acc = 0;
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const card = CARDS[at];
  return (
    <div className={s.rolodexScene}>
      <div
        ref={ref}
        className={s.rolodex}
        role="group"
        tabIndex={0}
        aria-roledescription="card file"
        aria-label={`Card file, ${CARDS.length} cards in order of name. Up and down arrows flip.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') flip(1);
          else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') flip(-1);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || Math.abs(d.y - e.clientY) < 36) return;
          flip(d.y > e.clientY ? 1 : -1);
          d.y = e.clientY;
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <span className={s.rdxBack} aria-hidden="true" />
        <span className={s.rdxBack} data-n="2" aria-hidden="true" />
        <article key={card.id} className={s.rdxCard} aria-live="polite">
          <span className={s.rdxTab} aria-hidden="true">
            {card.org[0]}
          </span>
          <h3>{card.org}</h3>
          <p className={s.rdxTitle}>
            {card.title}
            {card.contract && ' · contract'}
          </p>
          <p className={s.rdxRange}>{card.range}</p>
          <p className={s.rdxCount} aria-hidden="true">
            {at + 1} / {CARDS.length}
          </p>
        </article>
        <span className={s.rdxKnob} data-side="l" aria-hidden="true" />
        <span className={s.rdxKnob} data-side="r" aria-hidden="true" />
      </div>
      <div className={s.rdxButtons}>
        <button type="button" onClick={() => flip(-1)} aria-label="Previous card">
          ↑
        </button>
        <button type="button" onClick={() => flip(1)} aria-label="Next card">
          ↓
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the window and the station outside */

function Window() {
  return (
    <div className={s.windowScene}>
      <div className={s.pane}>
        <svg viewBox="0 0 300 300" className={s.outside} aria-hidden="true">
          <rect width="300" height="300" className={s.sky} />
          <g className={s.stars}>
            {[
              [30, 40],
              [80, 22],
              [140, 60],
              [210, 30],
              [260, 70],
              [50, 110],
              [190, 100],
              [240, 140],
            ].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />
            ))}
          </g>
          <circle cx="232" cy="62" r="20" className={s.orb} />
          <g className={s.clouds}>
            <ellipse cx="70" cy="70" rx="40" ry="12" />
            <ellipse cx="96" cy="62" rx="26" ry="12" />
            <ellipse cx="190" cy="120" rx="34" ry="9" />
          </g>
          <path d="M0 250 Q80 220 150 240 T300 230 V300 H0z" className={s.hills} />
          <g className={s.station}>
            <rect x="146" y="120" width="6" height="150" />
            <rect x="120" y="190" width="58" height="44" rx="3" className={s.stBox} />
            <rect x="126" y="200" width="30" height="10" rx="1" className={s.stLabel} />
            <circle cx="168" cy="204" r="3" className={s.stLed} />
            <rect
              x="152"
              y="150"
              width="56"
              height="26"
              transform="rotate(-18 180 163)"
              className={s.panel}
            />
            <line x1="149" y1="120" x2="149" y2="96" />
            <g className={s.anemo}>
              <line x1="125" y1="96" x2="173" y2="96" />
              <line x1="149" y1="72" x2="149" y2="120" />
              <circle cx="125" cy="96" r="7" />
              <circle cx="173" cy="96" r="7" />
              <circle cx="149" cy="72" r="7" />
              <circle cx="149" cy="120" r="7" />
            </g>
            <line x1="120" y1="190" x2="112" y2="150" />
          </g>
        </svg>
        <span className={s.mullion} data-d="v" aria-hidden="true" />
        <span className={s.mullion} data-d="h" aria-hidden="true" />
      </div>
      <dl className={s.label} data-kind="station">
        <div className={s.labelHead}>
          <dt>On the sill</dt>
          <dd>
            {logger.tag} · {logger.name}
          </dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{logger.kind}</dd>
        </div>
        {db.deviceFigures('logger').map((f) => (
          <div key={f}>
            <dt>Fleet</dt>
            <dd>{f}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export const CLUE_VIEWS: Record<ClueId, () => React.ReactNode> = {
  diploma: Diploma,
  calendar: Calendar,
  corkboard: Corkboard,
  reader: Reader,
  card: Card,
  rolodex: Rolodex,
  window: Window,
};
