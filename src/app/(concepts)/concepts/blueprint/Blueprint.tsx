'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import {
  NOW,
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roles,
  roots,
  skills,
} from '../_shared/data';
import { useInView, useReducedMotion } from '../_shared/hooks';
import { projectLinks } from '../_shared/links';
import s from './blueprint.module.scss';
import { concept } from '../_shared/concepts';

const { asOf, person, current, titleOf } = db;
const { freelance, niknam, alget, zeroone, neuroject } = db.roles;
const { bsc, msc } = db.education;
const { robocup } = db.awards;
const [FIRST, LAST] = profile.name.split(' ');
/** "M. BABAZADEH", as the drawings are signed. */
const SIGNED = `${FIRST[0]}. ${LAST}`.toUpperCase();
/** "2007 → 2026": the years the drawing set covers. */
const SET_SPAN = `${person.since} → ${asOf.y}`;

// Drawing sheets use real discipline codes: A architectural, S structural, M mechanical,
// E electrical, T telecom, G general.
const SHEETS = [
  { id: 'a-101', code: 'A-101', title: 'About' },
  { id: 's-201', code: 'S-201', title: 'Experience' },
  { id: 'm-301', code: 'M-301', title: 'Platforms' },
  { id: 'e-401', code: 'E-401', title: 'Hardware' },
  { id: 't-501', code: 'T-501', title: 'Open source' },
  { id: 'g-601', code: 'G-601', title: 'Contact' },
];

/* ------------------------------------------------------------------ tower */

interface Floor {
  id: string;
  code: string;
  name: string;
  el: string;
  years: string;
  detail: string;
  z0: number;
  h: number;
  w: number;
  d: number;
  piles?: boolean;
}

// Elevations count years from the start of the year he started building to a floor's first month.
const el = (d: db.YearMonth) =>
  `EL +${(d.y + ((d.m ?? 1) - 1) / 12 - person.since).toFixed(1).padStart(4, '0')}`;
/** "Senior frontend": a title without its last word, in sentence case. */
const kindOf = (r: db.Role) => {
  const t = titleOf(r).split(' ').slice(0, -1).join(' ');
  return t[0] + t.slice(1).toLowerCase();
};
const lowerFirst = (t: string) => t[0].toLowerCase() + t.slice(1);
const niknamYears = Math.round(fmt.monthsBetween(niknam.from, niknam.to) / 12);

// Floor heights are 12 units per year in the role; elevations count years since the year he started.
const FLOORS: Floor[] = [
  {
    id: 'piles',
    code: 'PILES',
    name: 'EE · Robotics',
    el: 'BELOW GRADE',
    years: fmt.yearSpan(bsc.from, msc.to),
    detail: `${bsc.degree} ${bsc.field.toLowerCase()} in ${bsc.focus.toLowerCase()}, ${msc.degree} ${msc.field.toLowerCase()}, and ${robocup.place} at ${robocup.event} ${robocup.year}.`,
    z0: -56,
    h: 56,
    w: 200,
    d: 140,
    piles: true,
  },
  {
    id: 'fdn',
    code: 'FDN',
    name: `${freelance.org} web`,
    el: 'EL ±00.0',
    years: fmt.yearSpan(freelance.from, freelance.to),
    detail: freelance.summary,
    z0: 0,
    h: 14,
    w: 216,
    d: 156,
  },
  {
    id: 'l1',
    code: 'L1',
    name: niknam.org,
    el: el(niknam.from),
    years: fmt.yearSpan(niknam.from, niknam.to),
    detail: `${niknam.summary} ${fmt.Spell(niknamYears)} years, so the tallest floor.`,
    z0: 14,
    h: 94,
    w: 200,
    d: 140,
  },
  {
    id: 'l2',
    code: 'L2',
    name: alget.org,
    el: el(alget.from),
    years: fmt.yearSpan(alget.from, alget.to),
    detail: `${kindOf(alget)} on ${lowerFirst(alget.summary)}`,
    z0: 108,
    h: 12,
    w: 192,
    d: 134,
  },
  {
    id: 'l3',
    code: 'L3',
    name: zeroone.org,
    el: el(zeroone.from),
    years: fmt.yearSpan(zeroone.from, zeroone.to),
    detail: `${kindOf(zeroone)}: ${zeroone.summary}`,
    z0: 120,
    h: 40,
    w: 184,
    d: 128,
  },
  {
    id: 'l4',
    code: 'L4',
    name: neuroject.org,
    el: el(neuroject.from),
    years: fmt.yearSpan(neuroject.from, current.since),
    detail: `${current.previous.title}: built ${db.products.neurobuild.title} on Next.js, Laravel and AWS.`,
    z0: 160,
    h: 27,
    w: 176,
    d: 122,
  },
  {
    id: 'roof',
    code: 'ROOF',
    name: `${current.company} · ${current.title}`,
    el: el(current.since),
    years: `${current.since.y}–`,
    detail: `${current.title} of ${current.pitch}, now bringing AI into it.`,
    z0: 187,
    h: 9,
    w: 168,
    d: 116,
  },
];

type Pt = [number, number];
const C30 = Math.cos(Math.PI / 6);
const P = (x: number, y: number, z: number): Pt => [200 + (x - y) * C30, 360 + (x + y) / 2 - z];
const pts = (list: Pt[]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

const GEOMETRY = FLOORS.map((f) => {
  if (f.piles) {
    const piles = (
      [
        [0, 140],
        [100, 140],
        [200, 140],
        [200, 70],
        [200, 0],
      ] as Pt[]
    ).map(([x, y]) => ({ a: P(x, y, 0), b: P(x, y, f.z0) }));
    return { f, piles, faces: null, years: [] as string[] };
  }
  const x0 = 100 - f.w / 2,
    y0 = 70 - f.d / 2,
    z1 = f.z0 + f.h;
  const faces = {
    left: pts([
      P(x0, y0 + f.d, f.z0),
      P(x0 + f.w, y0 + f.d, f.z0),
      P(x0 + f.w, y0 + f.d, z1),
      P(x0, y0 + f.d, z1),
    ]),
    right: pts([
      P(x0 + f.w, y0, f.z0),
      P(x0 + f.w, y0 + f.d, f.z0),
      P(x0 + f.w, y0 + f.d, z1),
      P(x0 + f.w, y0, z1),
    ]),
    top: pts([P(x0, y0, z1), P(x0 + f.w, y0, z1), P(x0 + f.w, y0 + f.d, z1), P(x0, y0 + f.d, z1)]),
  };
  const years: string[] = [];
  for (let z = f.z0 + 12; z < z1 - 3; z += 12)
    years.push(pts([P(x0, y0 + f.d, z), P(x0 + f.w, y0 + f.d, z), P(x0 + f.w, y0, z)]));
  return { f, piles: null, faces, years };
});

// Leader labels, spread so they never overlap.
const LABELS = (() => {
  const list = FLOORS.map((f) => {
    const x0 = 100 - f.w / 2,
      y0 = 70 - f.d / 2;
    const [ax, ay] = f.piles ? P(200, 0, f.z0 / 2) : P(x0 + f.w, y0, f.z0 + f.h / 2);
    return { f, ax, ay, ly: ay };
  }).sort((a, b) => a.ay - b.ay);
  for (let i = 1; i < list.length; i++) list[i].ly = Math.max(list[i].ly, list[i - 1].ly + 32);
  return list;
})();

const GROUND = pts([P(-40, -40, 0), P(250, -40, 0), P(250, 190, 0), P(-40, 190, 0)]);
const DATUM = P(250, 190, 0);
const [HOOK_X, CAP_TOP] = P(100, 70, 196);
const CRANE = (() => {
  let d = 'M34,452 V44 M46,452 V44';
  for (let y = 452, i = 0; y > 44; y -= 12, i++)
    d += i % 2 ? ` M46,${y} L34,${y - 12}` : ` M34,${y} L46,${y - 12}`;
  d += ' M0,36 H340 M0,46 H340';
  for (let x = 46, i = 0; x < 340; x += 12, i++)
    d += i % 2 ? ` M${x},36 L${x + 12},46` : ` M${x},46 L${x + 12},36`;
  return `${d} M40,12 V36 M40,12 L340,36 M40,12 L0,36`;
})();

function Tower() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(false, 0.2);
  const [active, setActive] = useState('roof');
  const [cap, setCap] = useState({ lift: 0, animate: false });
  const [hover, setHover] = useState<string | null>(null);
  const clipId = `hook-${useId().replace(/:/g, '')}`;

  // 4D build sequence: piles to roof, with the crane setting the CTO roof last.
  useEffect(() => {
    if (reduced || !inView || hover) return;
    let step = 0;
    let timer = 0;
    const next = () => {
      const floor = FLOORS[step];
      if (floor.id === 'roof') setCap({ lift: 0, animate: true });
      setActive(floor.id);
      step += 1;
      timer = window.setTimeout(
        step < FLOORS.length ? next : restart,
        step < FLOORS.length ? 1100 : 3400,
      );
    };
    const restart = () => {
      step = 0;
      setCap({ lift: 80, animate: false });
      timer = window.setTimeout(next, 80);
    };
    timer = window.setTimeout(restart, 600);
    return () => window.clearTimeout(timer);
  }, [reduced, inView, hover]);

  const shown = hover ?? active;
  const lift = hover ? 0 : cap.lift;
  const floor = FLOORS.find((f) => f.id === shown) ?? FLOORS[FLOORS.length - 1];

  return (
    <div ref={ref} className={s.tower}>
      <svg
        viewBox="0 0 640 640"
        className={s.towerSvg}
        role="img"
        aria-label={`Career drawn as a tower: piles for EE and robotics, a freelance foundation, floors for ${niknam.org}, ${alget.org}, ${zeroone.org} and ${neuroject.org}, and a ${current.title} roof.`}
      >
        <polygon className={s.ground} points={GROUND} />
        <text className={s.datum} x={DATUM[0] - 70} y={DATUM[1] + 18}>
          ±0.00 GRADE
        </text>
        <path className={s.crane} d={CRANE} />
        <rect className={s.craneSolid} x={0} y={46} width={22} height={16} />
        <rect className={s.craneSolid} x={46} y={46} width={14} height={12} />
        <rect className={s.craneSolid} x={HOOK_X - 7} y={46} width={14} height={6} />
        <clipPath id={clipId}>
          <rect x={0} y={52} width={640} height={640} />
        </clipPath>

        {GEOMETRY.map(({ f, piles, faces, years }) => {
          const isRoof = f.id === 'roof';
          return (
            <g
              key={f.id}
              className={`${s.floor} ${shown === f.id ? s.on : ''}`}
              onMouseEnter={() => setHover(f.id)}
              onMouseLeave={() => setHover(null)}
              style={
                isRoof
                  ? {
                      transform: `translateY(${-lift}px)`,
                      transition:
                        cap.animate && !hover ? 'transform 1.3s cubic-bezier(.3,.7,.2,1)' : 'none',
                    }
                  : undefined
              }
            >
              {piles?.map(({ a, b }) => (
                <g key={a.join()}>
                  <line className={s.pile} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                  <circle className={s.pileToe} cx={b[0]} cy={b[1]} r={3} />
                </g>
              ))}
              {faces && (
                <>
                  <polygon className={s.face} points={faces.left} />
                  <polygon className={s.face} points={faces.right} />
                  <polygon className={`${s.face} ${s.faceTop}`} points={faces.top} />
                </>
              )}
              {years.map((line) => (
                <polyline key={line} className={s.yearLine} points={line} />
              ))}
              {isRoof && (
                <g clipPath={`url(#${clipId})`}>
                  <path
                    className={s.hook}
                    d={`M${HOOK_X},${CAP_TOP - 300} V${CAP_TOP - 14} q0,8 -6,8 q-5,0 -5,-5`}
                  />
                  <path
                    className={s.hook}
                    d={`M${HOOK_X - 30},${CAP_TOP + 2} L${HOOK_X},${CAP_TOP - 14} L${HOOK_X + 30},${CAP_TOP + 2}`}
                  />
                </g>
              )}
            </g>
          );
        })}

        {LABELS.map(({ f, ax, ay, ly }) => (
          <g
            key={f.id}
            className={`${s.label} ${shown === f.id ? s.on : ''}`}
            onMouseEnter={() => setHover(f.id)}
            onMouseLeave={() => setHover(null)}
          >
            <polyline
              className={s.leader}
              points={pts([
                [ax + 4, ay],
                [404, ly],
                [414, ly],
              ])}
            />
            <circle className={s.leaderDot} cx={ax + 4} cy={ay} r={2.2} />
            <text className={s.l1} x={420} y={ly - 3}>{`${f.el} · ${f.years}`}</text>
            <text
              className={s.l2}
              x={420}
              y={ly + 13}
            >{`${f.code} · ${f.name.toUpperCase()}`}</text>
          </g>
        ))}
      </svg>

      <div className={s.callout} aria-live="polite">
        <span className={s.calloutKey}>DETAIL {floor.code} / S-201</span>
        <b>{floor.name}</b>
        <span className={s.calloutYears}>{`${floor.el} · ${floor.years}`}</span>
        <p>{floor.detail}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

// A revision cloud: semicircle scallops traced clockwise around a 100x50 box.
const CLOUD = (() => {
  const w = 100,
    h = 50,
    nx = 8,
    ny = 4;
  let d = 'M0,0';
  for (let i = 1; i <= nx; i++) d += ` A${w / nx / 2},${w / nx / 2} 0 0 1 ${(w * i) / nx},0`;
  for (let i = 1; i <= ny; i++) d += ` A${h / ny / 2},${h / ny / 2} 0 0 1 ${w},${(h * i) / ny}`;
  for (let i = 1; i <= nx; i++) d += ` A${w / nx / 2},${w / nx / 2} 0 0 1 ${w - (w * i) / nx},${h}`;
  for (let i = 1; i <= ny; i++) d += ` A${h / ny / 2},${h / ny / 2} 0 0 1 0,${h - (h * i) / ny}`;
  return `${d} Z`;
})();

function Dimension({ label }: { label: string }) {
  return (
    <svg className={s.dimension} viewBox="0 0 470 24" aria-hidden="true">
      <path d="M1 4 V20 M469 4 V20 M1 12 H469" className={s.dimLine} />
      <path d="M-4 17 L6 7 M464 17 L474 7" className={s.dimTick} />
      <rect x="150" y="3" width="170" height="18" className={s.dimMask} />
      <text x="235" y="16" textAnchor="middle" className={s.dimText}>
        {label}
      </text>
    </svg>
  );
}

function Sheet({
  id,
  code,
  title,
  scale,
  children,
}: {
  id: string;
  code: string;
  title: string;
  scale: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.sheet} aria-labelledby={`${id}-title`}>
      <header className={s.sheetHead}>
        <span className={s.sheetCode}>{code}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        <span className={s.sheetScale}>{scale}</span>
      </header>
      {children}
    </section>
  );
}

const YEAR0 = person.since,
  YEAR1 = asOf.y + 1;
const pct = (y: number) => ((y - YEAR0) / (YEAR1 - YEAR0)) * 100;
const GANTT_ROWS = [
  ...roles.map((r) => ({
    id: r.id,
    label: r.org,
    sub: r.title,
    start: r.start,
    end: r.end ?? NOW,
    live: r.end === null,
    study: false,
  })),
  {
    id: 'uni',
    label: bsc.school,
    sub: `${bsc.degree} EE · ${msc.degree} ${msc.field.replace(/ Engineering$/, '')}`,
    start: fmt.frac(bsc.from),
    end: fmt.frac(msc.to),
    live: false,
    study: true,
  },
].sort((a, b) => a.start - b.start);
const YEARS = Array.from({ length: YEAR1 - YEAR0 + 1 }, (_, i) => YEAR0 + i);

function Gantt() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={s.gantt} data-in={inView}>
      <div className={s.axis} aria-hidden="true">
        {YEARS.map((y) => (
          <span key={y} style={{ left: `${pct(y)}%` }}>
            {y % 2 === 1 ? `'${String(y).slice(2)}` : ''}
          </span>
        ))}
      </div>
      {GANTT_ROWS.map((r, i) => (
        <div key={r.id} className={s.row}>
          <div className={s.rowLabel}>
            <b>{r.label}</b>
            <small>{r.sub}</small>
          </div>
          <div className={s.track}>
            <span
              className={`${s.bar} ${r.study ? s.study : ''} ${r.live ? s.live : ''}`}
              style={{
                left: `${pct(r.start)}%`,
                width: `${pct(r.end) - pct(r.start)}%`,
                transitionDelay: `${i * 110}ms`,
              }}
              title={`${r.label}: ${Math.floor(r.start)}–${r.live ? 'now' : Math.floor(r.end)}`}
            />
          </div>
        </div>
      ))}
      <span className={s.today} style={{ '--p': pct(NOW) / 100 } as React.CSSProperties}>
        <i>TODAY · {fmt.iso(asOf)}</i>
      </span>
    </div>
  );
}

const DEVICE_X = [120, 310, 500, 690, 880];

function SingleLine() {
  return (
    <svg
      className={s.sld}
      viewBox="0 0 1000 250"
      role="img"
      aria-label={`Single-line diagram of ${fmt.spell(hardware.length)} devices in production on one bus.`}
    >
      <line x1="40" y1="40" x2="960" y2="40" className={s.bus} />
      <text x="40" y="26" className={s.sldNote}>
        MAIN BUS · {db.yearsBuilding} YRS IN PRODUCTION
      </text>
      {hardware.map((d, i) => {
        const x = DEVICE_X[i];
        return (
          <g key={d.tag}>
            <line x1={x} y1="40" x2={x} y2="92" className={s.drop} />
            <circle cx={x} cy="40" r="4" className={s.node} />
            {i === 0 && (
              <>
                <path
                  d={`M${x - 16},128 L${x},96 L${x + 16},128 Z M${x},96 V132`}
                  className={s.symbol}
                />
                <path
                  d={`M${x + 22},100 a10,10 0 0 1 0,16 M${x + 30},94 a18,18 0 0 1 0,28`}
                  className={s.symbol}
                />
              </>
            )}
            {i === 1 && (
              <>
                <circle cx={x} cy="114" r="20" className={s.symbol} />
                <path d={`M${x},114 L${x + 12},104`} className={s.symbol} />
              </>
            )}
            {i === 2 && (
              <>
                <rect x={x - 26} y="96" width="52" height="36" className={s.symbol} />
                <text x={x} y="119" textAnchor="middle" className={s.symbolText}>
                  PLC
                </text>
              </>
            )}
            {i === 3 && (
              <>
                <rect x={x - 18} y="94" width="36" height="40" rx="4" className={s.symbol} />
                <path
                  d={`M${x - 6},108 a8,8 0 0 1 12,0 M${x - 10},102 a14,14 0 0 1 20,0`}
                  className={s.symbol}
                />
              </>
            )}
            {i === 4 && (
              <>
                <circle cx={x} cy="114" r="12" className={s.symbol} />
                <path
                  d={`M${x + 18},104 a12,12 0 0 1 0,20 M${x + 26},98 a20,20 0 0 1 0,32 M${x - 18},104 a12,12 0 0 0 0,20`}
                  className={s.symbol}
                />
              </>
            )}
            <text x={x} y="166" textAnchor="middle" className={s.sldTag}>
              {d.tag}
            </text>
            <text x={x} y="190" textAnchor="middle" className={s.sldName}>
              {d.name.toUpperCase()}
            </text>
            <text x={x} y="210" textAnchor="middle" className={s.sldNote}>
              {d.kind}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ page */

export default function Blueprint() {
  const heroRef = useRef<HTMLElement>(null);
  const crossH = useRef<HTMLDivElement>(null);
  const crossV = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLElement>(null);

  // CAD crosshair: follows the pointer across the hero and reports it in the title block.
  const onPointerMove = (e: React.PointerEvent) => {
    const hero = heroRef.current;
    if (!hero || !crossH.current || !crossV.current || !cursor.current) return;
    const r = hero.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    crossH.current.style.transform = `translateY(${y}px)`;
    crossV.current.style.transform = `translateX(${x}px)`;
    crossH.current.style.opacity = crossV.current.style.opacity = '1';
    cursor.current.textContent = `X ${String(Math.round(x)).padStart(4, '0')} Y ${String(Math.round(y)).padStart(4, '0')}`;
  };
  const onPointerLeave = () => {
    if (crossH.current && crossV.current)
      crossH.current.style.opacity = crossV.current.style.opacity = '0';
  };

  return (
    <div className={s.root}>
      <header className={s.strip}>
        <a href="#a-001" className={s.brand}>
          <span className={s.logo}>{FIRST[0] + LAST[0]}</span>
          <span className={s.brandText}>
            {profile.name.toUpperCase()} · DRAWING SET {person.since}–{asOf.y}
          </span>
        </a>
        <nav aria-label="Sheets" className={s.nav}>
          {SHEETS.map((sheet) => (
            <a key={sheet.id} href={`#${sheet.id}`}>
              <b>{sheet.code}</b>
              {sheet.title.toUpperCase()}
            </a>
          ))}
        </nav>
      </header>

      <main>
        <section
          id="a-001"
          ref={heroRef}
          className={s.hero}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <div className={s.heroText}>
            <p className={s.tag}>SHEET A-001 · GENERAL ARRANGEMENT</p>
            <h1 className={s.name}>
              {FIRST}
              <br />
              {LAST}
            </h1>
            <Dimension label={`${db.yearsBuilding} YRS · ${SET_SPAN}`} />
            <p className={s.role}>
              <span className={s.rev}>
                <svg viewBox="-6 -6 112 62" preserveAspectRatio="none" aria-hidden="true">
                  <path d={CLOUD} vectorEffect="non-scaling-stroke" />
                </svg>
                {current.title}
              </span>
              <svg className={s.tri} width="26" height="23" viewBox="0 0 26 23" aria-hidden="true">
                <path d="M13 1.5 L24.5 21.5 H1.5 Z" />
                <text x="13" y="18">
                  {String(current.since.y).slice(2)}
                </text>
              </svg>
              <span>· {profile.company}</span>
            </p>
            <p className={s.lede}>
              I architect AI-driven platforms for construction enterprises, and the hardware and
              firmware underneath them.
            </p>
            <div className={s.actions}>
              <a className={`${s.btn} ${s.solid}`} href="#a-101">
                View the drawings
              </a>
              <a className={s.btn} href={profile.cv} target="_blank" rel="noreferrer">
                CV · PDF
              </a>
            </div>
            <div className={s.titleBlock}>
              <div>
                <span>PROJECT</span>
                {person.site}
              </div>
              <div>
                <span>SHEET</span>A-001
              </div>
              <div>
                <span>SCALE</span>1 : {person.since}
              </div>
              <div>
                <span>REV</span>
                {fmt.iso(asOf)} · {current.title}
              </div>
              <div>
                <span>DRAWN</span>
                {SIGNED}
              </div>
              <div className={s.wide}>
                <span>STATUS</span>
                {db.yearsBuilding} YRS IN PRODUCTION
              </div>
              <div>
                <span>CURSOR</span>
                <b ref={cursor}>X 0000 Y 0000</b>
              </div>
            </div>
          </div>
          <Tower />
          <div className={`${s.cross} ${s.crossH}`} ref={crossH} aria-hidden="true" />
          <div className={`${s.cross} ${s.crossV}`} ref={crossV} aria-hidden="true" />
        </section>

        <Sheet id="a-101" code="A-101" title="About" scale="SCALE 1 : 1">
          <div className={s.aboutGrid}>
            <div className={s.prose}>
              {about.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <figure className={s.photo}>
              <Image src={person.photo} width={600} height={600} alt={profile.name} />
              <figcaption>
                PHOTO 01 · {SIGNED} · {asOf.y}
              </figcaption>
            </figure>
            <div className={s.keynotes}>
              <h3>KEYNOTES</h3>
              <ol>
                {skills.map((k, i) => (
                  <li key={k}>
                    <span className={s.hex}>{i + 1}</span>
                    {k}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Sheet>

        <Sheet id="s-201" code="S-201" title="Experience" scale={`4D SCHEDULE · ${SET_SPAN}`}>
          <Gantt />
          <div className={s.notes}>
            <h3>NOTES</h3>
            <ol>
              {jobs.map((job) => (
                <li key={job.company}>
                  <b>
                    {job.title} @{' '}
                    {job.url ? (
                      <a href={job.url} target="_blank" rel="noreferrer">
                        {job.company}
                      </a>
                    ) : (
                      job.company
                    )}
                  </b>
                  <span className={s.range}>{job.range}</span>
                  <ul>
                    {job.duties.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <h3>FOUNDATION · BELOW GRADE</h3>
            <ul className={s.roots}>
              {roots.map((r) => (
                <li key={r.title}>
                  <span>{r.year}</span>
                  <b>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
                  </b>
                  <small>{r.detail}</small>
                </li>
              ))}
            </ul>
          </div>
        </Sheet>

        <Sheet id="m-301" code="M-301" title="Platforms" scale="DETAILS · NOT TO SCALE">
          <div className={s.details}>
            {featuredProjects.map((p, i) => (
              <article key={p.title} className={s.detail}>
                <div className={s.detailImage}>
                  <Image src={p.image} width={1280} height={800} alt={`${p.title}`} />
                  <span className={s.bubble}>
                    <b>{i + 1}</b>
                    <i>M-301</i>
                  </span>
                </div>
                <div className={s.detailText}>
                  <p className={s.kicker}>DETAIL {i + 1}</p>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                  <p className={s.spec}>
                    <span>SPEC</span>
                    {p.tech.join(' · ')}
                  </p>
                  <div className={s.linkRow}>
                    {projectLinks(p.links).map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                        {l.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <h3 className={s.tableTitle}>DRAWING LIST · OTHER WORK</h3>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Built with</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {otherProjects.map((p, i) => (
                  <tr key={p.title}>
                    <td className={s.mono}>M-3{String(i + 10)}</td>
                    <td className={s.strong}>{p.title}</td>
                    <td>{p.description}</td>
                    <td className={s.mono}>{p.tech.join(' · ')}</td>
                    <td>
                      {projectLinks(p.links).map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className={s.tableLink}
                        >
                          {l.label} ↗
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>

        <Sheet id="e-401" code="E-401" title="Hardware" scale="SINGLE-LINE DIAGRAM">
          <div className={s.tableWrap}>
            <SingleLine />
          </div>
          <h3 className={s.tableTitle}>EQUIPMENT SCHEDULE</h3>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Equipment</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Figures</th>
                </tr>
              </thead>
              <tbody>
                {hardware.map((d) => (
                  <tr key={d.tag}>
                    <td className={s.mono}>{d.tag}</td>
                    <td className={s.strong}>{d.name}</td>
                    <td>{d.kind}</td>
                    <td>{d.detail}</td>
                    <td className={s.mono}>{d.figures.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>

        <Sheet
          id="t-501"
          code="T-501"
          title="Open source"
          scale="REVISION HISTORY · MERGED UPSTREAM"
        >
          <p className={s.sheetLede}>
            Merged into packages downloaded {db.downloads.weekly.long} times a week.
          </p>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Rev</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Why it mattered</th>
                  <th>Reach</th>
                  <th>Ref</th>
                </tr>
              </thead>
              <tbody>
                {oss.map((c, i) => (
                  <tr key={c.repo}>
                    <td className={s.mono}>{String.fromCharCode(65 + i)}</td>
                    <td className={s.mono}>{c.year}</td>
                    <td>
                      <b className={s.strong}>{c.repo}</b>
                      <br />
                      {c.change}
                    </td>
                    <td>
                      <span className={`${s.flag} ${c.kind === 'Security' ? s.flagRed : ''}`}>
                        {c.kind}
                      </span>{' '}
                      {c.impact}
                    </td>
                    <td className={s.mono}>
                      ★ {c.stars}
                      <br />
                      {c.weekly}/wk
                    </td>
                    <td>
                      <a href={c.url} target="_blank" rel="noreferrer" className={s.tableLink}>
                        PR ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>

        <Sheet id="g-601" code="G-601" title="Contact" scale="ISSUE SHEET">
          <div className={s.contact}>
            <div>
              <p className={s.contactLede}>
                Building something ambitious in construction, IoT or AI? The drawings are open for
                comment.
              </p>
              <a className={s.email} href={`mailto:${profile.email}`}>
                {profile.email}
              </a>
              <div className={s.linkRow}>
                <a href={profile.linkedin} target="_blank" rel="noreferrer">
                  LinkedIn ↗
                </a>
                <a href={profile.github} target="_blank" rel="noreferrer">
                  GitHub ↗
                </a>
                <a href={profile.cv} target="_blank" rel="noreferrer">
                  CV ↗
                </a>
              </div>
            </div>
            <div className={s.stamp} aria-hidden="true">
              <span>ISSUED FOR</span>
              <b>CONSTRUCTION</b>
              <span>
                {FIRST[0]}.{LAST[0]}. · {fmt.iso(asOf)}
              </span>
            </div>
          </div>
        </Sheet>
      </main>

      <footer className={s.footer}>
        <span>
          DRAWING SET · {person.site.toUpperCase()} · CONCEPT {concept('blueprint').letter}
        </span>
        <span>SHEETS A-001 → G-601</span>
      </footer>
    </div>
  );
}
