'use client';

import { useRef, useState } from 'react';
import { NOW, db } from '../_shared/data';
import { useAnimationFrame, useInView, useReducedMotion } from '../_shared/hooks';
import { BRANCHES, HEAD, LOG, TIPS, WIP, commit, type BranchId, type Commit } from './history';
import Icon from './Icon';
import s from './commits.module.scss';

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/* ------------------------------------------------------------------ layout: time runs left to right */

const { person } = db;
const W = 1100;
const H = 276;
const T0 = person.since - 0.1;
const T1 = db.asOf.y + 1.3;
const X = (t: number) => 34 + ((t - T0) / (T1 - T0)) * (W - 60);
// Lanes top to bottom: upstream pull requests, the job lane, main, then study and Neuroject.
const LANE_Y = [156, 96, 216, 38];
const AXIS_Y = 262;
const BEND = 26;
const DURATION = 5.2;

const CHRONO = [...LOG].reverse();
const POS = new Map<string, { x: number; y: number }>();
const laneEnd = new Map<number, number>();
for (const c of CHRONO) {
  const y = LANE_Y[c.branch.col];
  // Keep dots on a lane apart, and leave room for the curve when a commit changes lanes.
  let x = Math.max(X(c.t), (laneEnd.get(y) ?? 0) + 10);
  for (const p of c.parents) {
    const pp = POS.get(p);
    if (pp && pp.y !== y) x = Math.max(x, pp.x + BEND + 4);
  }
  POS.set(c.id, { x, y });
  laneEnd.set(y, x);
}
const pos = (id: string) => POS.get(id) as { x: number; y: number };

const EDGES = CHRONO.flatMap((c) =>
  c.parents.map((pid, i) => {
    const a = pos(pid);
    const b = pos(c.id);
    const lane = i > 0 ? commit(pid).branch : c.branch;
    let d = `M${a.x},${a.y} H${b.x}`;
    if (a.y !== b.y && i > 0) {
      d = `M${a.x},${a.y} H${b.x - BEND} C${b.x - BEND / 2},${a.y} ${b.x - BEND / 2},${b.y} ${b.x},${b.y}`;
    } else if (a.y !== b.y) {
      d = `M${a.x},${a.y} C${a.x + BEND / 2},${a.y} ${a.x + BEND / 2},${b.y} ${a.x + BEND},${b.y} H${b.x}`;
    }
    return { key: `${pid}>${c.id}`, d, color: lane.color, branch: lane.id, wip: c.kind === 'wip' };
  }),
);

// Where each lane is being drawn, for the pens that ride the playhead.
const SEGMENTS = (Object.keys(BRANCHES) as BranchId[])
  .filter((id) => id !== 'upstream')
  .map((id) => {
    const on = CHRONO.filter((c) => c.branch.id === id);
    const first = pos(on[0].id);
    const forked = on[0].parents.length > 0 && commit(on[0].parents[0]).branch.id !== id;
    const merge = CHRONO.find((c) => c.parents[1] === on[on.length - 1].id);
    return {
      y: first.y,
      x0: forked ? first.x - BEND / 2 : first.x,
      x1: merge ? pos(merge.id).x - BEND : pos(on[on.length - 1].id).x,
      color: BRANCHES[id].color,
    };
  });
const PEN_ROWS = [...new Set(SEGMENTS.map((g) => g.y))];

const PR_ROW = CHRONO.filter((c) => c.kind === 'pr');

// Branch labels, placed by hand so none of them collide.
const LABELS: { id: BranchId; at: string; dx: number; dy: number }[] = [
  { id: 'main', at: 'init', dx: -50, dy: 0 },
  { id: 'freelance', at: 'freelance', dx: 6, dy: -17 },
  { id: 'bsc', at: 'bsc', dx: 2, dy: 18 },
  { id: 'niknam', at: 'niknam', dx: 6, dy: -17 },
  { id: 'msc', at: 'msc', dx: 2, dy: 18 },
  { id: 'alget', at: 'alget', dx: -24, dy: -17 },
  { id: 'zeroone', at: 'zeroone', dx: 26, dy: -17 },
  { id: 'neuroject', at: 'neuroject', dx: 2, dy: 18 },
  { id: 'neuroship', at: 'neuroship', dx: -16, dy: -17 },
  { id: 'upstream', at: 'pr-i18n', dx: -76, dy: 0 },
];
const pillW = (text: string) => text.length * 6.3 + 14;

const YEARS = Array.from({ length: db.yearsBuilding + 1 }, (_, i) => person.since + i);
const OPEN = db.roleList.filter((r) => !r.to).map((r) => r.org);
const PLAY_END = pos(WIP).x + 14;

/* ------------------------------------------------------------------ component */

export default function Overview({
  selected,
  solo,
  onSelect,
}: {
  selected: string;
  solo: BranchId | null;
  onSelect: (id: string, reveal?: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.05);
  const [playing, setPlaying] = useState(true);
  const [cursor, setCursor] = useState(-1);
  const [hover, setHover] = useState<string | null>(null);

  const elapsed = useRef(0);
  const last = useRef(0);
  const clip = useRef<SVGRectElement>(null);
  const head = useRef<SVGGElement>(null);
  const year = useRef<SVGTextElement>(null);
  const pens = useRef<(SVGCircleElement | null)[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  const live = playing && !reduced;

  useAnimationFrame((sec) => {
    const dt = last.current ? Math.min(0.05, sec - last.current) : 0;
    last.current = sec;
    elapsed.current += dt;
    const p = Math.min(1, elapsed.current / DURATION);
    const x = X(T0) + (PLAY_END - X(T0)) * p;
    clip.current?.setAttribute('width', String(x));
    head.current?.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
    if (year.current)
      year.current.textContent = String(
        Math.min(Math.floor(T0 + ((x - 34) / (W - 60)) * (T1 - T0)), Math.floor(NOW)),
      );
    PEN_ROWS.forEach((y, i) => {
      const seg = SEGMENTS.find((g) => g.y === y && x >= g.x0 && x <= g.x1);
      const pen = pens.current[i];
      if (!pen) return;
      pen.setAttribute('cx', x.toFixed(1));
      pen.style.opacity = seg && p < 1 ? '1' : '0';
      if (seg) pen.style.fill = seg.color;
    });
    // Follow the playhead when the graph is wider than the screen.
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth)
      el.scrollLeft = (x / W) * el.scrollWidth - el.clientWidth * 0.62;

    let idx = -1;
    while (idx + 1 < CHRONO.length && pos(CHRONO[idx + 1].id).x <= x) idx++;
    if (idx !== cursor) setCursor(idx);
    if (p >= 1) setPlaying(false);
  }, live && visible);

  const replay = () => {
    elapsed.current = 0;
    last.current = 0;
    setCursor(-1);
    setPlaying(true);
  };

  const at = reduced || !playing ? CHRONO.length - 1 : cursor;
  const shown: Commit | null = at >= 0 ? CHRONO[at] : null;
  const tip = hover ? commit(hover) : null;
  const dim = (id: BranchId) => (solo && solo !== id ? '' : undefined);

  return (
    <figure className={s.overview} ref={wrap}>
      <figcaption className={s.ovHead}>
        <code>
          <span className={s.prompt}>$</span> git log --graph --all --reverse
        </code>
        <span className={s.ovTools}>
          <span className={s.ovHint}>Click a commit to open it</span>
          {!reduced && (
            <button type="button" className={s.replay} onClick={replay} disabled={live}>
              <Icon name="replay" />
              Replay
            </button>
          )}
        </span>
      </figcaption>

      <div className={s.ovScroll} ref={scroller}>
        <div className={s.ovCanvas}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`The whole history at a glance: main runs from ${person.since} to today, with a branch for freelance work, each degree and each company, merged back when it ended. ${OPEN.join(' and ')} are still open, and HEAD is on ${commit(HEAD).branch.ref}.`}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <clipPath id="ov-reveal">
                <rect ref={clip} x={0} y={0} height={H} width={live ? 0 : W} />
              </clipPath>
            </defs>

            {YEARS.map((y) => (
              <g key={y} className={s.ovYear}>
                <line x1={X(y)} y1={14} x2={X(y)} y2={AXIS_Y - 14} />
                <text x={X(y) + 3} y={AXIS_Y}>{`’${String(y).slice(2)}`}</text>
              </g>
            ))}
            <line x1={X(NOW)} y1={10} x2={X(NOW)} y2={AXIS_Y - 14} className={s.ovNow} />

            <g clipPath="url(#ov-reveal)">
              <line
                x1={pos(PR_ROW[0].id).x - 8}
                y1={LANE_Y[3]}
                x2={pos(PR_ROW[PR_ROW.length - 1].id).x + 8}
                y2={LANE_Y[3]}
                className={s.ovRemote}
                data-dim={dim('upstream')}
              />
              {EDGES.map((e) => (
                <path
                  key={e.key}
                  d={e.d}
                  style={{ stroke: e.color }}
                  className={`${s.ovEdge} ${e.wip ? s.edgeWip : ''}`}
                  data-dim={dim(e.branch)}
                />
              ))}
              {LABELS.map(({ id, at, dx, dy }) => {
                const b = BRANCHES[id];
                const p = pos(at);
                const w = pillW(b.ref);
                return (
                  <g
                    key={id}
                    className={s.ovLabel}
                    transform={`translate(${p.x + dx} ${p.y + dy})`}
                    data-dim={dim(id)}
                  >
                    <rect x={0} y={-9} width={w} height={18} rx={9} style={{ stroke: b.color }} />
                    <text x={w / 2} y={3.6} textAnchor="middle" style={{ fill: b.ink }}>
                      {b.ref}
                    </text>
                  </g>
                );
              })}
              {CHRONO.map((c) => {
                const p = pos(c.id);
                const on = c.id === selected;
                return (
                  <g
                    key={c.id}
                    className={`${s.ovNode} ${s[c.kind]}`}
                    style={{ '--c': c.branch.color } as Vars}
                    data-dim={dim(c.branch.id)}
                    data-on={on || undefined}
                  >
                    {c.tags.length > 0 && (
                      <path
                        d={`M${p.x - 4},${p.y - 15} h8 v5 l-4,3.5 l-4,-3.5 z`}
                        className={s.ovTag}
                      />
                    )}
                    {c.id === HEAD && <circle cx={p.x} cy={p.y} r={9.5} className={s.headRing} />}
                    {on && <circle cx={p.x} cy={p.y} r={10.5} className={s.selRing} />}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={c.kind === 'merge' ? 3.6 : 4.8}
                      className={s.dot}
                    />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={11}
                      className={s.hit}
                      onPointerEnter={() => setHover(c.id)}
                      onClick={() => onSelect(c.id, true)}
                    />
                  </g>
                );
              })}
              <g
                className={s.ovHeadLabel}
                transform={`translate(${pos(HEAD).x - 23} ${LANE_Y[2] - 26})`}
              >
                <rect x={0} y={-9} width={46} height={18} rx={4} />
                <text x={23} y={3.6} textAnchor="middle">
                  HEAD
                </text>
              </g>
            </g>

            {live && (
              <g ref={head} className={s.playhead}>
                <line x1={0} y1={10} x2={0} y2={AXIS_Y - 12} />
                <rect x={-21} y={AXIS_Y - 12} width={42} height={17} rx={8.5} />
                <text ref={year} x={0} y={AXIS_Y + 0.5} textAnchor="middle">
                  {person.since}
                </text>
              </g>
            )}
            {live &&
              PEN_ROWS.map((y, i) => (
                <circle
                  key={y}
                  ref={(el) => {
                    pens.current[i] = el;
                  }}
                  cx={0}
                  cy={y}
                  r={6.5}
                  className={s.pen}
                />
              ))}
          </svg>

          {tip && (
            <div
              className={s.ovTip}
              data-flip={pos(tip.id).x > W * 0.68 || undefined}
              style={
                {
                  left: `${(pos(tip.id).x / W) * 100}%`,
                  top: `${(pos(tip.id).y / H) * 100}%`,
                  '--c': tip.branch.color,
                  '--lane-ink': tip.branch.ink,
                } as Vars
              }
              aria-hidden="true"
            >
              <span className={s.ovTipMeta}>
                <b>{tip.short}</b> {tip.branch.ref} · {tip.date}
              </span>
              {tip.subject}
            </div>
          )}
        </div>
      </div>

      {shown ? (
        <button
          type="button"
          className={s.ticker}
          onClick={() => onSelect(shown.id, true)}
          aria-label={`Open ${shown.short}: ${shown.subject}`}
        >
          <span className={s.tickDot} style={{ '--c': shown.branch.color } as Vars} />
          <code className={s.tickSha}>{shown.short}</code>
          <span className={s.tickDate}>{shown.date}</span>
          <span className={s.tickRef} style={{ '--lane-ink': shown.branch.ink } as Vars}>
            {TIPS.get(shown.id) === 'neuroject' ? 'HEAD → neuroject' : shown.branch.ref}
          </span>
          <span className={s.tickMsg}>{shown.subject}</span>
          <span className={s.tickOpen} aria-hidden="true">
            show →
          </span>
        </button>
      ) : (
        <p className={s.ticker}>
          <span className={s.tickMsg}>Replaying history from the first commit…</span>
        </p>
      )}
    </figure>
  );
}
