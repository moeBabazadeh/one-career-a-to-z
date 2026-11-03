'use client';

import { useMemo, useRef, useState } from 'react';
import { NOW, db, fmt, jobs, roles } from '../_shared/data';
import { useInView } from '../_shared/hooks';
import s from './neural.module.scss';

// Fig. 2: the career as TensorBoard runs. Each role is a run, fine-tuned from the one before it,
// so it starts at a lower loss than its parent did. The loss is illustrative; the dates are real.

// CSS tokens of the concept, so the runs follow light and dark.
const COLOR: Record<string, string> = {
  freelance: 'var(--grey)',
  niknam: 'var(--cyan)',
  alget: 'var(--amber)',
  zeroone: 'var(--pink)',
  neuroject: 'var(--purple)',
  neuroship: 'var(--fg)',
};

// initial loss, floor, time constant in years
const CURVE: Record<string, [number, number, number]> = {
  freelance: [2.35, 1.3, 1.7],
  niknam: [1.9, 0.8, 2.1],
  alget: [1.3, 0.78, 0.35],
  zeroone: [1.12, 0.52, 1.1],
  neuroject: [0.95, 0.36, 0.8],
  neuroship: [0.72, 0.46, 0.25],
};

// Checkpoints inside a run: a promotion bumps the loss for a while, like a warm restart. Each
// title after a role's first is one, labelled by what changed: "senior", then "CTO".
const PROMOTIONS = db.roleList.flatMap((r) =>
  r.steps.slice(1).map((step, k) => {
    const before = r.steps[k].title;
    const label = step.title.endsWith(` ${before}`)
      ? step.title.slice(0, -before.length - 1).toLowerCase()
      : step.title;
    return { run: r.id, at: fmt.frac(step.from), label };
  }),
);

/** The company name the job list uses for a role. */
const companyOf = (id: string) => {
  const r: db.Role = db.roles[id as db.RoleId];
  return r.short ?? r.org;
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stamp = (t: number) =>
  `${Math.floor(t)}-${String(Math.min(12, Math.floor((t % 1) * 12 + 1e-6) + 1)).padStart(2, '0')}`;

const RUNS = [...roles]
  .sort((a, b) => a.start - b.start)
  .map((r, i) => {
    const rand = mulberry32(i * 977 + 13);
    const [init, floor, tau] = CURVE[r.id];
    const end = r.end ?? NOW;
    const points: [number, number][] = [];
    for (let t = r.start; t <= end + 1e-6; t += 1 / 24) {
      let v = floor + (init - floor) * Math.exp(-(t - r.start) / tau);
      for (const p of PROMOTIONS)
        if (p.run === r.id && t >= p.at) v += 0.24 * Math.exp(-(t - p.at) / 0.5);
      points.push([t, v * (1 + (rand() - 0.5) * 0.22)]);
    }
    return {
      ...r,
      name: `${stamp(r.start)}_${r.id}`,
      color: COLOR[r.id],
      points,
      job: jobs.find((j) => j.company === companyOf(r.id)),
    };
  });

/** TensorBoard's smoothing: an exponential moving average, debiased for the first points. */
function smooth(points: [number, number][], w: number) {
  let last = 0;
  return points.map(([t, v], n) => {
    last = last * w + (1 - w) * v;
    return [t, last / (1 - Math.pow(w, n + 1) || 1)] as [number, number];
  });
}

const W = 1000,
  H = 380,
  L = 56,
  R = 18,
  T = 18,
  B = 40;
// From the year he started building to the year after the facts.
const X0 = db.person.since,
  X1 = db.asOf.y + 1,
  Y1 = 2.6;
const sx = (t: number) => L + ((t - X0) / (X1 - X0)) * (W - L - R);
const sy = (v: number) => T + (1 - Math.min(v, Y1) / Y1) * (H - T - B);
const line = (pts: [number, number][]) =>
  pts.map(([t, v], i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(v).toFixed(1)}`).join('');

export default function Scalars() {
  const [ref, seen] = useInView<HTMLDivElement>(true, 0.3);
  const [hidden, setHidden] = useState<string[]>([]);
  const [weight, setWeight] = useState(0.6);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const smoothed = useMemo(() => RUNS.map((r) => smooth(r.points, weight)), [weight]);
  const shown = RUNS.map((r) => !hidden.includes(r.id));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const t = X0 + ((((e.clientX - box.left) / box.width) * W - L) / (W - L - R)) * (X1 - X0);
    setHover(t >= X0 + 0.4 && t <= NOW + 0.05 ? Math.min(t, NOW) : null);
  };

  const rows =
    hover == null
      ? []
      : RUNS.flatMap((r, i) => {
          if (!shown[i] || hover < r.start || hover > (r.end ?? NOW)) return [];
          const k = Math.min(r.points.length - 1, Math.round((hover - r.start) * 24));
          return [{ r, raw: r.points[k][1], sm: smoothed[i][k][1], t: r.points[k][0] }];
        });

  return (
    <div ref={ref} className={`${s.scalars} ${seen ? s.drawn : ''}`}>
      <div className={s.runsPanel}>
        <fieldset className={s.runs}>
          <legend>Runs</legend>
          {RUNS.map((r, i) => (
            <label key={r.id} style={{ '--c': r.color } as React.CSSProperties}>
              <input
                type="checkbox"
                checked={shown[i]}
                onChange={() =>
                  setHidden(shown[i] ? [...hidden, r.id] : hidden.filter((h) => h !== r.id))
                }
              />
              <span className={s.runName}>{r.name}</span>
            </label>
          ))}
        </fieldset>
        <label className={s.smoothing}>
          <span>Smoothing</span>
          <input
            type="range"
            min={0}
            max={0.99}
            step={0.01}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
          <output>{weight.toFixed(2)}</output>
        </label>
        <p className={s.runsNote}>
          Each run is fine-tuned from the checkpoint before it. Loss is illustrative; run dates are
          real.
        </p>
      </div>

      <figure className={s.chartCard}>
        <p className={s.chartTitle}>train/loss</p>
        <div className={s.chartBox}>
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            className={s.chart}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`Loss curves, one run per role from ${X0} to ${db.asOf.y}. Each new run starts lower than the last.`}
          >
            {[0, 0.5, 1, 1.5, 2, 2.5].map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className={s.grid} />
                <text x={L - 10} y={sy(v) + 4} textAnchor="end" className={s.tick}>
                  {v.toFixed(1)}
                </text>
              </g>
            ))}
            {Array.from({ length: (X1 - X0) / 2 + 1 }, (_, i) => X0 + i * 2).map((y) => (
              <text key={y} x={sx(y)} y={H - 14} textAnchor="middle" className={s.tick}>
                {y}
              </text>
            ))}
            <line x1={sx(NOW)} x2={sx(NOW)} y1={T} y2={H - B} className={s.nowLine} />
            <text x={sx(NOW) - 6} y={T + 10} textAnchor="end" className={s.tick}>
              now
            </text>

            {RUNS.map((r, i) =>
              shown[i] ? (
                <g
                  key={r.id}
                  style={{ '--c': r.color, '--i': i } as React.CSSProperties}
                  className={s.run}
                >
                  <path d={line(r.points)} className={s.raw} pathLength={1} />
                  <path d={line(smoothed[i])} className={s.smooth} pathLength={1} />
                  <circle
                    cx={sx(r.start)}
                    cy={sy(smoothed[i][0][1])}
                    r={4.5}
                    className={s.ckptDot}
                  />
                  <text
                    x={sx(r.start) + (sx(r.start) > 900 ? -8 : 8)}
                    y={sy(smoothed[i][0][1]) - 8}
                    textAnchor={sx(r.start) > 900 ? 'end' : 'start'}
                    className={s.ckptLabel}
                  >
                    {r.org}
                  </text>
                  {PROMOTIONS.filter((p) => p.run === r.id).map((p) => {
                    const k = Math.min(r.points.length - 1, Math.round((p.at - r.start) * 24));
                    const [px, py] = [sx(p.at), sy(smoothed[i][k][1])];
                    return (
                      <g key={p.label}>
                        <path
                          d={`M${px},${py - 6} L${px + 6},${py} L${px},${py + 6} L${px - 6},${py} Z`}
                          className={s.promo}
                        />
                        <text x={px} y={py + 22} textAnchor="middle" className={s.ckptLabel}>
                          {p.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ) : null,
            )}

            {hover != null && (
              <g className={s.cursor}>
                <line x1={sx(hover)} x2={sx(hover)} y1={T} y2={H - B} />
                {rows.map(({ r, sm }) => (
                  <circle key={r.id} cx={sx(hover)} cy={sy(sm)} r={4} style={{ fill: r.color }} />
                ))}
              </g>
            )}
          </svg>
          {hover != null && rows.length > 0 && (
            <div
              className={s.tip}
              style={{ left: `${(sx(hover) / W) * 100}%` }}
              data-flip={hover > X0 + (X1 - X0) * 0.6 ? '' : undefined}
            >
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Smoothed</th>
                    <th>Value</th>
                    <th>Step</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ r, raw, sm, t }) => (
                    <tr key={r.id}>
                      <td>
                        <i style={{ background: r.color }} />
                        {r.name}
                      </td>
                      <td>{sm.toFixed(3)}</td>
                      <td>{raw.toFixed(3)}</td>
                      <td>{stamp(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <figcaption className={s.caption}>
          <b>Fig. 2.</b> One run per role, x in years. Circles mark where a run starts from its
          parent’s checkpoint; diamonds mark promotions inside a run.
        </figcaption>
      </figure>

      <ol className={s.ckpts}>
        {[...RUNS].reverse().map((r) => (
          <li key={r.id} style={{ '--c': r.color } as React.CSSProperties}>
            <details open={r.id === 'neuroject'}>
              <summary>
                <span className={s.ckptRun}>{r.name}</span>
                <span className={s.ckptTitle}>
                  {r.title} <span>· {r.org}</span>
                </span>
                <span className={s.ckptRange}>{r.job?.range ?? r.range}</span>
              </summary>
              <div className={s.ckptBody}>
                <p>{r.summary}</p>
                {r.job && (
                  <ul>
                    {r.job.duties.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {new URL(r.url).host} ↗
                  </a>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
