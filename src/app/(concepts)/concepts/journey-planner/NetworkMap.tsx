'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db, fmt } from '../_shared/data';
import { useAnimationFrame, useInView, useReducedMotion } from '../_shared/hooks';
import {
  ERAS,
  EXTENSION,
  H,
  LINE,
  LINES,
  PRESETS,
  SERVICES,
  STATION,
  STATIONS,
  TRACK,
  TRACKS,
  W,
  bounds,
  journeyTrack,
  linesAt,
  plan,
  positionAt,
  subpath,
  trainAt,
  yearOf,
  type Leg,
  type LineId,
  type Station,
  type Track,
} from './network';
import s from './transit.module.scss';

/* ------------------------------------------------------------------ small parts */

export function Bullet({ id, size }: { id: LineId; size?: 'sm' | 'lg' }) {
  const line = LINE[id];
  return (
    <span
      className={`${s.bullet} ${size ? s[size] : ''}`}
      style={{ '--c': line.color, '--k': line.ink } as React.CSSProperties}
      aria-hidden="true"
    >
      {id}
    </span>
  );
}

const lineNames = (ids: LineId[]) => {
  const names = ids.map((id) => LINE[id].name);
  return `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]} line${names.length > 1 ? 's' : ''}`;
};

/* ------------------------------------------------------------------ map drawing */

const NAME = 14.5;
const LEAD = 15.5;

/** Where a station's label goes, from the side it was given. */
function labelBox(st: Station) {
  const b = bounds(st);
  const lines = st.label ?? [st.name];
  const h = lines.length * LEAD + 12;
  switch (st.side) {
    case 'n':
      return { lines, x: b.cx, y: b.y0 - 18 - h, anchor: 'middle' as const };
    case 's':
      return { lines, x: b.cx, y: b.y1 + 18, anchor: 'middle' as const };
    case 'e':
      return { lines, x: b.x1 + 18, y: b.cy - h / 2, anchor: 'start' as const };
    default:
      return { lines, x: b.x0 - 18, y: b.cy - h / 2, anchor: 'end' as const };
  }
}

const TICK: Record<Station['side'], Pt2> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
type Pt2 = [number, number];

const TERMINI = new Set(
  TRACKS.flatMap((t) =>
    t.id === 'E2' ? [t.stops[t.stops.length - 1]] : [t.stops[0], t.stops[t.stops.length - 1]],
  ),
);

function StationMark({ st, dim, open }: { st: Station; dim: boolean; open: boolean }) {
  const ids = linesAt(st);
  const b = bounds(st);
  const cls = `${s.st} ${dim ? s.dim : ''} ${open ? s.open : ''}`;
  const tag = { 'data-st': st.id };
  if (ids.length > 1) {
    return b.x0 === b.x1 && b.y0 === b.y1 ? (
      <circle cx={b.cx} cy={b.cy} r={9} className={`${cls} ${s.interchange}`} {...tag} />
    ) : (
      <rect
        x={b.x0 - 9}
        y={b.y0 - 9}
        width={b.x1 - b.x0 + 18}
        height={b.y1 - b.y0 + 18}
        rx={9}
        className={`${cls} ${s.interchange}`}
        {...tag}
      />
    );
  }
  const [x, y] = st.at[ids[0]]!;
  const [dx, dy] = TICK[st.side];
  const color = LINE[ids[0]].color;
  // A terminus gets a bar right across the line; other stations get a tick on the label side.
  const back = TERMINI.has(st.id) ? 13 : 0;
  return (
    <line
      x1={x - dx * back}
      y1={y - dy * back}
      x2={x + dx * 13}
      y2={y + dy * 13}
      stroke={color}
      className={`${cls} ${s.tick}`}
      {...tag}
    />
  );
}

function StationLabel({ st, dim }: { st: Station; dim: boolean }) {
  const { lines, x, y, anchor } = labelBox(st);
  return (
    <text x={x} y={y + NAME * 0.8} textAnchor={anchor} className={`${s.label} ${dim ? s.dim : ''}`}>
      {lines.map((t, i) => (
        <tspan key={t} x={x} dy={i ? LEAD : 0}>
          {t}
        </tspan>
      ))}
      <tspan x={x} dy={LEAD - 2} className={s.sub}>
        {st.sub}
      </tspan>
    </text>
  );
}

/** Trains start here when nothing moves (server render, reduced motion). */
const T0 = 6.5;

function trainTransform(track: Track, s0: number, dir: number) {
  const p = positionAt(track, s0);
  const heading = p.a + (dir < 0 ? Math.PI : 0);
  // Left-hand running: each direction keeps to its own side of the line.
  const off = 2.6;
  const x = p.x + Math.sin(heading) * off,
    y = p.y - Math.cos(heading) * off;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((heading * 180) / Math.PI).toFixed(1)})`;
}

const STATIC = SERVICES.map((sv) => {
  const at = trainAt(sv.tt, T0 + sv.offset);
  return trainTransform(TRACK[sv.track], at.s, at.dir || 1);
});

function Train({
  color,
  className,
  ...rest
}: { color: string; className?: string } & React.SVGProps<SVGGElement>) {
  return (
    <g className={`${s.train} ${className ?? ''}`} {...rest}>
      <rect x={-14} y={-4.5} width={28} height={9} rx={4.5} />
      <rect x={6} y={-2.5} width={5} height={5} rx={1} fill={color} className={s.cab} />
    </g>
  );
}

/* ------------------------------------------------------------------ station card */

function Card({
  st,
  pinned,
  onClose,
  onPlan,
  cardRef,
}: {
  st: Station;
  pinned: boolean;
  onClose: () => void;
  onPlan: (end: 'from' | 'to', id: string) => void;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const b = bounds(st);
  const ids = linesAt(st);
  const style = {
    '--x': `${(b.cx / W) * 100}%`,
    '--y': `${(b.cy / H) * 100}%`,
  } as React.CSSProperties;
  return (
    <div
      ref={cardRef}
      className={s.card}
      style={style}
      data-h={b.cx > W * 0.58 ? 'left' : 'right'}
      data-v={b.cy < H * 0.36 ? 'top' : b.cy > H * 0.68 ? 'bottom' : 'mid'}
      tabIndex={-1}
      role="region"
      aria-labelledby="station-card-title"
    >
      <div className={s.cardHead} style={{ '--c': LINE[ids[0]].color } as React.CSSProperties}>
        <span className={s.cardBullets}>
          {ids.map((id) => (
            <Bullet key={id} id={id} />
          ))}
        </span>
        <span className={s.cardKind}>
          {ids.length > 1 ? 'Interchange' : `${LINE[ids[0]].name} line`}
        </span>
        {pinned && (
          <button
            type="button"
            className={s.cardClose}
            onClick={onClose}
            aria-label="Close station card"
          >
            ×
          </button>
        )}
      </div>
      <h3 id="station-card-title">{st.name}</h3>
      <p className={s.cardTitle}>{st.title}</p>
      <p className={s.cardWhen}>{st.when}</p>
      <p className={s.cardText}>{st.text}</p>
      {st.facts && (
        <ul className={s.facts}>
          {st.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {(st.links?.length || st.platform) && (
        <p className={s.cardLinks}>
          {st.links?.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
          {st.platform ? <a href={`#platform-${st.platform}`}>Platform {st.platform} ↓</a> : null}
        </p>
      )}
      <div className={s.cardPlan}>
        <button type="button" onClick={() => onPlan('from', st.id)}>
          Journey from here
        </button>
        <button type="button" onClick={() => onPlan('to', st.id)}>
          Journey to here
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the network */

const BY_NAME = [...STATIONS].sort((a, b) => a.name.localeCompare(b.name));

export default function NetworkMap({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [stage, visible] = useInView<HTMLDivElement>(false, 0.05);
  const scroller = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const trainEls = useRef<(SVGGElement | null)[]>([]);
  const journeyEl = useRef<SVGGElement>(null);
  const svgEl = useRef<SVGSVGElement>(null);
  const dwelling = useRef(new Set<string>());
  const clock = useRef(T0);
  const journeyClock = useRef(0);
  const last = useRef(0);
  const hideTimer = useRef<number | undefined>(undefined);

  const [isolate, setIsolate] = useState<LineId | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const legs = useMemo(() => (from && to ? plan(from, to) : null), [from, to]);
  const journey = useMemo(() => (legs ? journeyTrack(legs) : null), [legs]);

  const openId = pinned ?? hover;
  const open = openId ? STATION[openId] : null;
  const onRoute = useMemo(() => new Set(legs?.flatMap((l) => l.stops)), [legs]);
  const focusLine = legs ? null : isolate;
  const dimStation = (st: Station) =>
    legs ? !onRoute.has(st.id) : focusLine ? !st.at[focusLine] : false;

  // Phones see the map through a window: start at the present and let them swipe back.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, []);

  // A new journey starts its train from the top, and on a phone the map swipes to show it.
  useEffect(() => {
    journeyClock.current = 0;
    const el = scroller.current;
    if (!journey || !el || el.scrollWidth <= el.clientWidth) return;
    const xs = journey.track.xs;
    const mid = ((Math.min(...xs) + Math.max(...xs)) / 2 / W) * el.scrollWidth;
    el.scrollTo({ left: mid - el.clientWidth / 2, behavior: reduced ? 'auto' : 'smooth' });
  }, [journey, reduced]);

  // Close a pinned card on Escape or on a click elsewhere.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPinned(null);
      document.getElementById(`st-${pinned}`)?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!t.closest(`.${s.card}`) && !t.closest(`.${s.hit}`)) setPinned(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [pinned]);

  useAnimationFrame((sec) => {
    const dt = last.current ? Math.min(0.05, sec - last.current) : 0;
    last.current = sec;
    clock.current += dt;
    journeyClock.current += dt;
    const now = new Set<string>();
    SERVICES.forEach((sv, i) => {
      const el = trainEls.current[i];
      if (!el) return;
      const tr = TRACK[sv.track];
      const at = trainAt(sv.tt, clock.current + sv.offset);
      el.setAttribute('transform', trainTransform(tr, at.s, at.dir || 1));
      if (at.standing) now.add(tr.stops[tr.stopAt.indexOf(at.s)]);
    });
    // A station lights up while a train stands at its platform.
    const svg = svgEl.current;
    if (svg) {
      for (const id of new Set([...dwelling.current, ...now])) {
        const mark = svg.querySelector<SVGElement>(`[data-st="${id}"]`);
        if (now.has(id)) mark?.setAttribute('data-dwell', '');
        else mark?.removeAttribute('data-dwell');
      }
    }
    dwelling.current = now;
    if (journey && journeyEl.current) {
      const at = trainAt(journey.tt, journeyClock.current);
      journeyEl.current.setAttribute('transform', trainTransform(journey.track, at.s, 1));
    }
  }, visible && !reduced);

  const show = (id: string) => {
    window.clearTimeout(hideTimer.current);
    setHover(id);
  };
  const hide = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHover(null), 160);
  };

  const pick = (id: string, e: React.MouseEvent) => {
    const next = pinned === id ? null : id;
    setPinned(next);
    // From the keyboard, move into the card so its links are next in line.
    if (next && e.detail === 0) requestAnimationFrame(() => cardRef.current?.focus());
  };

  const planEnd = (end: 'from' | 'to', id: string) => {
    if (end === 'from') {
      setFrom(id);
      if (to === id) setTo('');
    } else {
      setTo(id);
      if (from === id) setFrom('');
    }
    setIsolate(null);
    setPinned(null);
    document
      .getElementById('planner')
      ?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };

  const choosePreset = (p: (typeof PRESETS)[number]) => {
    setIsolate(null);
    setFrom(p.from);
    setTo(p.to);
  };

  const journeyStatic = journey
    ? trainTransform(journey.track, journey.track.length * 0.999, 1)
    : '';

  return (
    <>
      <div ref={stage} className={s.stage}>
        <div className={s.cartouche}>{children}</div>
        <div ref={scroller} className={s.scroller} tabIndex={-1}>
          <div className={s.canvas}>
            <svg ref={svgEl} viewBox={`0 0 ${W} ${H}`} className={s.map} aria-hidden="true">
              <defs>
                <pattern
                  id="tx-hatch"
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="8" className={s.hatch} />
                </pattern>
              </defs>

              {/* Eras, shaded like fare zones */}
              {ERAS.map((era, i) => (
                <g key={era.label}>
                  <rect
                    x={era.x0}
                    y={0}
                    width={era.x1 - era.x0}
                    height={H}
                    className={i % 2 ? s.zoneB : s.zoneA}
                  />
                  <text x={era.x0 + 14} y={H - 34} className={s.zoneLabel}>
                    {era.label} · {era.name}
                  </text>
                </g>
              ))}

              {/* Grid references, as on a printed map */}
              <g className={s.grid}>
                {Array.from({ length: 8 }, (_, i) => (
                  <text key={i} x={i * 200 + 100} y={H - 10} textAnchor="middle">
                    {'ABCDEFGH'[i]}
                  </text>
                ))}
                {Array.from({ length: 4 }, (_, i) => (
                  <text key={i} x={W - 12} y={i * 215 + 112} textAnchor="end">
                    {i + 1}
                  </text>
                ))}
              </g>

              {/* Track: each line over a paper casing, so crossings read as bridges */}
              {TRACKS.map((tr) => (
                <g
                  key={tr.id}
                  className={focusLine && tr.line !== focusLine ? s.dim : legs ? s.ghost : ''}
                >
                  <path d={tr.d} className={s.casing} />
                  <path d={tr.d} stroke={LINE[tr.line].color} className={s.track} />
                </g>
              ))}
              <g
                className={focusLine && focusLine !== EXTENSION.line ? s.dim : legs ? s.ghost : ''}
              >
                <path
                  d={`M${EXTENSION.from.join(',')} H${EXTENSION.to[0]}`}
                  stroke={LINE[EXTENSION.line].color}
                  className={s.planned}
                />
                <text
                  x={EXTENSION.to[0]}
                  y={EXTENSION.from[1] - 14}
                  textAnchor="end"
                  className={s.note}
                >
                  under construction
                </text>
              </g>
              <text
                x={690}
                y={340}
                textAnchor="middle"
                className={`${s.note} ${focusLine && focusLine !== 'A' ? s.dim : ''}`}
              >
                {`express, no stops ${STATION.balance.sub} → ${STATION.hub.sub}`}
              </text>

              {/* Journey overlay */}
              {legs && (
                <g className={s.route}>
                  {legs.map((leg) => {
                    const tr = TRACK[leg.track];
                    const d = subpath(tr, tr.stopAt[leg.i0], tr.stopAt[leg.i1]);
                    return (
                      <g key={`${leg.track}-${leg.i0}`}>
                        <path d={d} className={s.routeCasing} />
                        <path d={d} stroke={LINE[leg.line].color} className={s.routeTrack} />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Stations */}
              {STATIONS.map((st) => (
                <StationMark key={st.id} st={st} dim={dimStation(st)} open={openId === st.id} />
              ))}

              {/* Trains */}
              <g className={legs ? s.ghost : ''}>
                {SERVICES.map((sv, i) => (
                  <Train
                    key={`${sv.track}-${sv.phase}`}
                    color={LINE[sv.line].color}
                    className={focusLine && sv.line !== focusLine ? s.dim : ''}
                    transform={STATIC[i]}
                    ref={(el) => {
                      trainEls.current[i] = el;
                    }}
                  />
                ))}
              </g>
              {journey && (
                <Train
                  color="#1a1a1a"
                  className={s.journeyTrain}
                  transform={journeyStatic}
                  ref={journeyEl}
                />
              )}

              {STATIONS.map((st) => (
                <StationLabel key={st.id} st={st} dim={dimStation(st)} />
              ))}

              {/* You are here */}
              <g
                className={s.here}
                transform={`translate(${STATION.cto.at.L![0]} ${STATION.cto.at.L![1] - 98})`}
              >
                <circle r={16} className={s.hereRing} />
                <circle r={7} className={s.hereDot} />
                <text x={0} y={-24} textAnchor="middle">
                  You are here
                </text>
              </g>
            </svg>

            <ul className={s.hits} aria-label="Stations">
              {STATIONS.map((st) => {
                const b = bounds(st);
                const ids = linesAt(st);
                return (
                  <li key={st.id}>
                    <button
                      id={`st-${st.id}`}
                      type="button"
                      className={s.hit}
                      style={
                        {
                          '--x': `${(b.cx / W) * 100}%`,
                          '--y': `${(b.cy / H) * 100}%`,
                          '--h': `${((b.y1 - b.y0 + 30) / H) * 100}%`,
                        } as React.CSSProperties
                      }
                      aria-label={`${st.name}, ${st.when}. ${lineNames(ids)}.`}
                      aria-expanded={openId === st.id}
                      onPointerEnter={(e) => e.pointerType === 'mouse' && show(st.id)}
                      onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
                      onFocus={() => show(st.id)}
                      onBlur={hide}
                      onClick={(e) => pick(st.id, e)}
                    />
                  </li>
                );
              })}
            </ul>

            {open && (
              <div
                onPointerEnter={() => window.clearTimeout(hideTimer.current)}
                onPointerLeave={hide}
              >
                <Card
                  st={open}
                  pinned={pinned === open.id}
                  cardRef={cardRef}
                  onClose={() => setPinned(null)}
                  onPlan={planEnd}
                />
              </div>
            )}
          </div>
        </div>
        <p className={s.swipe} aria-hidden="true">
          ← Swipe back in time · tap a station
        </p>
      </div>

      <div className={s.mapFoot}>
        <section className={s.key} aria-labelledby="key-title">
          <h2 id="key-title" className={s.footTitle}>
            Key <span>Pick a line to isolate it</span>
          </h2>
          <ul className={s.keyLines}>
            {LINES.map((l) => {
              const count = STATIONS.filter((st) => st.at[l.id]).length;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    aria-pressed={focusLine === l.id}
                    onClick={() => {
                      setFrom('');
                      setTo('');
                      setIsolate(focusLine === l.id ? null : l.id);
                    }}
                    style={{ '--c': l.color } as React.CSSProperties}
                  >
                    <span className={s.keySwatch} aria-hidden="true" />
                    <Bullet id={l.id} />
                    <b>{l.name}</b>
                    <small>{l.blurb}</small>
                    <i>{count} stations</i>
                  </button>
                </li>
              );
            })}
          </ul>
          <ul className={s.symbols} aria-label="Map symbols">
            <li>
              <svg viewBox="0 0 40 20" aria-hidden="true">
                <line x1="0" y1="12" x2="40" y2="12" className={s.symLine} />
                <line
                  x1="20"
                  y1="12"
                  x2="20"
                  y2="3"
                  className={s.symLine}
                  style={{ strokeWidth: 4 }}
                />
              </svg>
              Station
            </li>
            <li>
              <svg viewBox="0 0 40 20" aria-hidden="true">
                <line x1="0" y1="10" x2="40" y2="10" className={s.symLine} />
                <circle cx="20" cy="10" r="6.5" className={s.interchange} />
              </svg>
              Interchange
            </li>
            <li>
              <svg viewBox="0 0 40 20" aria-hidden="true">
                <line x1="0" y1="10" x2="34" y2="10" className={s.symLine} />
                <line
                  x1="34"
                  y1="1"
                  x2="34"
                  y2="19"
                  className={s.symLine}
                  style={{ strokeWidth: 4 }}
                />
              </svg>
              Terminus
            </li>
            <li>
              <svg viewBox="0 0 40 20" aria-hidden="true">
                <line x1="0" y1="10" x2="40" y2="10" className={`${s.symLine} ${s.symPlanned}`} />
              </svg>
              Under construction
            </li>
            <li>
              <svg viewBox="0 0 40 20" aria-hidden="true">
                <g transform="translate(20 10)">
                  <rect x={-12} y={-4} width={24} height={8} rx={4} className={s.symTrain} />
                </g>
              </svg>
              Train in service
            </li>
          </ul>
        </section>

        <section id="planner" className={s.planner} aria-labelledby="planner-title">
          <h2 id="planner-title" className={s.footTitle}>
            Journey planner <span>{`Routes through ${fmt.spell(db.yearsBuilding)} years`}</span>
          </h2>
          <div className={s.presets} role="group" aria-label="Suggested journeys">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={from === p.from && to === p.to}
                onClick={() => choosePreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={s.fromTo}>
            <label>
              <span>From</span>
              <select value={from} onChange={(e) => planEnd('from', e.target.value)}>
                <option value="">Choose a station</option>
                {BY_NAME.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={s.swap}
              aria-label="Swap from and to"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
            >
              ⇄
            </button>
            <label>
              <span>To</span>
              <select value={to} onChange={(e) => planEnd('to', e.target.value)}>
                <option value="">Choose a station</option>
                {BY_NAME.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Itinerary legs={legs} from={from} to={to} onClear={() => (setFrom(''), setTo(''))} />
        </section>
      </div>
    </>
  );
}

function Itinerary({
  legs,
  from,
  to,
  onClear,
}: {
  legs: Leg[] | null;
  from: string;
  to: string;
  onClear: () => void;
}) {
  if (!legs) {
    return (
      <p className={s.idle}>
        {from || to
          ? 'Pick the other end of the journey.'
          : 'Pick a suggested journey, or any two stations. Station cards on the map can set either end too.'}
      </p>
    );
  }
  const changes = legs.length - 1;
  const stops = legs.reduce((n, l) => n + l.stops.length - 1, 0);
  const y0 = yearOf(STATION[from]),
    y1 = yearOf(STATION[to]);
  return (
    <div className={s.itinerary} aria-live="polite">
      <p className={s.summary}>
        <b>{STATION[from].name}</b> to <b>{STATION[to].name}</b>
        <span>
          {stops} stop{stops === 1 ? '' : 's'} ·{' '}
          {changes ? `${changes} change${changes === 1 ? '' : 's'}` : 'direct'}
          {y0 && y1 ? ` · ${y0} → ${y1}` : ''}
        </span>
      </p>
      <ol>
        {legs.map((leg, i) => (
          <li
            key={`${leg.track}-${leg.i0}`}
            style={{ '--c': LINE[leg.line].color } as React.CSSProperties}
          >
            <p className={s.legHead}>
              <Bullet id={leg.line} />
              <span>
                {i === 0 ? 'Board' : 'Change to'} the <b>{LINE[leg.line].name} line</b> at{' '}
                {STATION[leg.stops[0]].name}, towards {leg.towards}
              </span>
            </p>
            <ol className={s.calling}>
              {leg.stops.slice(1).map((id) => (
                <li key={id}>{STATION[id].name}</li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <button type="button" className={s.clear} onClick={onClear}>
        Clear journey
      </button>
    </div>
  );
}
