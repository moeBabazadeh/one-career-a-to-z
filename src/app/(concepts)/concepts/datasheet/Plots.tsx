import { db, fmt } from '../_shared/data';
import { monthOf, NOW_MONTH, toYear } from './content';
import { balance, bulk, inverter, plasmon, surface, type Pt } from './curves';
import Live from './Live';
import s from './datasheet.module.scss';

const { asOf, person, current, contributions, downloads } = db;
const { freelance, niknam, zeroone } = db.roles;
const { bsc, msc } = db.education;
const paper = db.papers.inverter;

/* ------------------------------------------------------------------ a TI-style plot frame */

const W = 400,
  H = 280,
  L = 58,
  R = 14,
  T = 12,
  B = 44;

interface Axis {
  min: number;
  max: number;
  ticks: number[];
  label: string;
  log?: boolean;
  fmt?: (v: number) => string;
}

type Tone = 'blue' | 'red' | 'ink' | 'ref';

interface Series {
  pts: Pt[];
  tone: Tone;
  label?: string;
  dash?: boolean;
}

interface Note {
  x: number;
  y: number;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
  tone?: Tone;
}

const scale = (a: Axis, lo: number, hi: number) => (v: number) => {
  const f = a.log
    ? (Math.log10(v) - Math.log10(a.min)) / (Math.log10(a.max) - Math.log10(a.min))
    : (v - a.min) / (a.max - a.min);
  return lo + f * (hi - lo);
};

const pathOf = (pts: Pt[], X: (v: number) => number, Y: (v: number) => number) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');

function Chart({
  id,
  x,
  y,
  series,
  points = [],
  notes = [],
  legendAt = 'tr',
  label,
}: {
  id: string;
  x: Axis;
  y: Axis;
  series: Series[];
  points?: (Note & { r?: number })[];
  notes?: Note[];
  legendAt?: 'tr' | 'br' | 'tl';
  label: string;
}) {
  const X = scale(x, L, W - R),
    Y = scale(y, H - B, T);
  const fx = x.fmt ?? String,
    fy = y.fmt ?? String;
  const legend = series.filter((d) => d.label);
  const lx = legendAt === 'tl' ? L + 10 : W - R - 128;
  const ly = legendAt === 'br' ? H - B - 10 - legend.length * 15 : T + 10;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.plot} role="img" aria-label={label}>
      <defs>
        <clipPath id={`ds-clip-${id}`}>
          <rect x={L} y={T} width={W - L - R} height={H - T - B} />
        </clipPath>
      </defs>
      {x.ticks.map((v) => (
        <g key={`x${v}`}>
          <line x1={X(v)} x2={X(v)} y1={T} y2={H - B} className={s.grid} />
          <text x={X(v)} y={H - B + 15} textAnchor="middle" className={s.tick}>
            {fx(v)}
          </text>
        </g>
      ))}
      {y.ticks.map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className={s.grid} />
          <text x={L - 6} y={Y(v) + 3.5} textAnchor="end" className={s.tick}>
            {fy(v)}
          </text>
        </g>
      ))}
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className={s.frame} />
      <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" className={s.axisLabel}>
        {x.label}
      </text>
      <text
        transform={`translate(13 ${(T + H - B) / 2}) rotate(-90)`}
        textAnchor="middle"
        className={s.axisLabel}
      >
        {y.label}
      </text>
      <g clipPath={`url(#ds-clip-${id})`}>
        {series.map((d, i) => (
          <path
            key={i}
            d={pathOf(d.pts, X, Y)}
            pathLength={d.dash ? undefined : 1}
            className={`${d.dash ? s.dashed : s.curve} ${s[d.tone]}`}
            style={{ '--i': i } as React.CSSProperties}
          />
        ))}
        {points.map((p, i) => (
          <g key={p.text} className={s.point} style={{ '--i': i } as React.CSSProperties}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={p.r ?? 4} />
            <text
              x={X(p.x) + (p.anchor === 'end' ? -8 : 8)}
              y={Y(p.y) + 3.5}
              textAnchor={p.anchor ?? 'start'}
            >
              {p.text}
            </text>
          </g>
        ))}
      </g>
      {notes.map((n) => (
        <text
          key={n.text}
          x={X(n.x)}
          y={Y(n.y)}
          textAnchor={n.anchor ?? 'start'}
          className={`${s.note} ${n.tone ? s[n.tone] : ''}`}
        >
          {n.text}
        </text>
      ))}
      {legend.length > 0 && (
        <g className={s.legend} transform={`translate(${lx} ${ly})`}>
          <rect x={-6} y={-8} width={128} height={legend.length * 15 + 4} />
          {legend.map((d, i) => (
            <g key={d.label} transform={`translate(0 ${i * 15})`}>
              <line
                x1={0}
                x2={18}
                y1={0}
                y2={0}
                className={`${s[d.tone]} ${d.dash ? s.dashed : ''}`}
              />
              <text x={24} y={3.5}>
                {d.label}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function Figure({
  n,
  title,
  note,
  children,
}: {
  n: number;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={s.plotFig}>
      {children}
      <figcaption>
        <b>Figure 6-{n}.</b> {title}
        {note && <span className={s.figNote}>{note}</span>}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ the six plots */

const k = (v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : String(v));
const num = (v: string) => Number.parseFloat(v) * (v.endsWith('k') ? 1e3 : 1);

// Title level by date, from the roles: each step up lands on its first month. Niknam lists the
// promotion to senior by year only.
const LEVELS = ['', 'Web dev', 'Engineer', 'Senior', 'Lead', 'Chief', current.title];
const STEP_DATES = [
  freelance.from,
  niknam.steps[0].from,
  niknam.steps[1].from,
  zeroone.from,
  current.previous.from,
  current.since,
];
const TITLE_STEPS: Pt[] = STEP_DATES.map((d, i) => [toYear(monthOf(d)), i + 1]);
const titleCurve = (() => {
  const pts: Pt[] = [[person.since, 0]];
  for (const [t, v] of TITLE_STEPS) pts.push([t, pts[pts.length - 1][1]], [t, v]);
  pts.push([toYear(NOW_MONTH), TITLE_STEPS.length]);
  return pts;
})();
const [webDev, engineer, senior, lead, chief] = STEP_DATES.map((d) => d.y);

// Each fix's label, shortened to fit, and the side it sits on.
const repoName = (id: db.ContributionId) => contributions[id].repo.split('/')[1];
const OSS_LABEL: Record<db.ContributionId, [string, 'start' | 'end']> = {
  gatsby: [repoName('gatsby'), 'end'],
  nanostores: [contributions.nanostores.repo, 'start'],
  reactQueryKit: [repoName('reactQueryKit'), 'start'],
  definitelyTyped: [repoName('definitelyTyped'), 'end'],
  i18next: [`…${repoName('i18next').replace(/^gatsby-/, '')}`, 'start'],
};
const FIXES = Object.keys(contributions) as db.ContributionId[];
const OSS_SUM = downloads.weekly.n;

const ROBOT = balance();
const SURFACE = surface();
const INVERTER = inverter();
const SPP_AIR = plasmon(1),
  SPP_GLASS = plasmon(2.25);

export default function TypicalCharacteristics() {
  return (
    <Live className={s.plots}>
      <Figure n={2} title="Title Level vs Time" note="From the job ranges. Real data.">
        <Chart
          id="title"
          label={`Step plot of title level from ${person.since} to ${asOf.y}: web developer in ${webDev}, engineer in ${engineer}, senior in ${senior}, lead in ${lead}, chief in ${chief} and ${current.title} in ${fmt.month(current.since)}.`}
          x={{
            min: person.since,
            max: person.since + 20,
            ticks: [0, 4, 8, 12, 16, 20].map((t) => person.since + t),
            label: 'Year',
          }}
          y={{ min: 0, max: 6.6, ticks: [1, 2, 3, 4, 5, 6], label: '', fmt: (v) => LEVELS[v] }}
          series={[{ pts: titleCurve, tone: 'blue', label: 'Title level' }]}
          legendAt="br"
          notes={[
            {
              x: TITLE_STEPS[TITLE_STEPS.length - 1][0] - 0.27,
              y: 6.25,
              text: `${current.title}, ${fmt.mon(current.since)}`,
              anchor: 'end',
              tone: 'blue',
            },
          ]}
        />
      </Figure>

      <Figure
        n={3}
        title="Weekly Downloads vs Repository Stars"
        note="One point per upstream fix. Real data."
      >
        <Chart
          id="oss"
          label={`Log-log scatter of ${fmt.spell(FIXES.length)} patched packages, weekly downloads against stars. Together they add up to about ${downloads.exact} downloads a week.`}
          x={{
            min: 50,
            max: 2e5,
            ticks: [100, 1e3, 1e4, 1e5],
            label: 'Repository stars',
            log: true,
            fmt: k,
          }}
          y={{
            min: 2e3,
            max: 1e6,
            ticks: [1e4, 1e5, 1e6],
            label: 'Weekly downloads',
            log: true,
            fmt: k,
          }}
          series={[
            {
              pts: [
                [50, OSS_SUM],
                [2e5, OSS_SUM],
              ],
              tone: 'ref',
              dash: true,
            },
          ]}
          notes={[{ x: 70, y: OSS_SUM * 1.25, text: `Σ ${downloads.exact} / week` }]}
          points={FIXES.map((id) => ({
            x: num(contributions[id].stars),
            y: contributions[id].weekly.n,
            text: OSS_LABEL[id][0],
            anchor: OSS_LABEL[id][1],
          }))}
        />
      </Figure>

      <Figure
        n={4}
        title="Tilt Angle vs Time, Two-Wheel Self-Balancing Robot"
        note={`Simulated. The ${bsc.degree} thesis robot used real-time fuzzy control.`}
      >
        <Chart
          id="robot"
          label="Simulated tilt angle after a 10 degree push: with fuzzy control it returns upright within about a second; open loop it falls over."
          x={{ min: 0, max: 2, ticks: [0, 0.5, 1, 1.5, 2], label: 'Time (s)' }}
          y={{ min: -5, max: 25, ticks: [-5, 0, 5, 10, 15, 20, 25], label: 'Tilt angle (°)' }}
          series={[
            { pts: ROBOT.open, tone: 'red', dash: true, label: 'Open loop' },
            { pts: ROBOT.closed, tone: 'blue', label: 'Fuzzy control' },
          ]}
          notes={[{ x: 0.3, y: 9.6, text: 'θ₀ = 10° push at t = 0' }]}
        />
      </Figure>

      <Figure
        n={5}
        title="Controller Output vs Tilt Angle"
        note="Simulated. Five sets per input, 25 rules on a diagonal."
      >
        <Chart
          id="surface"
          label="Simulated fuzzy controller output against tilt angle at three tilt rates. The curves saturate at plus and minus one and shift with the rate."
          x={{ min: -20, max: 20, ticks: [-20, -10, 0, 10, 20], label: 'Tilt angle (°)' }}
          y={{ min: -1.2, max: 1.2, ticks: [-1, -0.5, 0, 0.5, 1], label: 'Output u (normalized)' }}
          series={SURFACE.map((c, i) => ({
            pts: c.pts,
            tone: (['red', 'blue', 'ink'] as Tone[])[i],
            label: `dθ/dt = ${c.rate > 0 ? '+' : ''}${c.rate}°/s`,
          }))}
          legendAt="tl"
        />
      </Figure>

      <Figure
        n={6}
        title="Output Voltage, 7-Level Multicell Inverter"
        note={`Illustrative, nearest-level modulation. The topic of ${paper.venue}:${paper.id}.`}
      >
        <Chart
          id="inverter"
          label="Illustrative staircase output of a three-cell inverter following a 50 hertz sine reference."
          x={{ min: 0, max: 40, ticks: [0, 10, 20, 30, 40], label: 'Time (ms)' }}
          y={{
            min: -3.6,
            max: 3.6,
            ticks: [-3, -2, -1, 0, 1, 2, 3],
            label: 'Output (× cell voltage)',
          }}
          series={[
            { pts: INVERTER.sine, tone: 'ref', dash: true, label: 'Reference' },
            { pts: INVERTER.stair, tone: 'blue', label: 'Output, 3 cells' },
          ]}
        />
      </Figure>

      <Figure
        n={7}
        title="Surface Plasmon Dispersion, Drude Metal"
        note={`Calculated. The ${msc.degree} thesis studied plasmonic wave sources.`}
      >
        <Chart
          id="plasmon"
          label="Calculated surface plasmon dispersion: frequency against wavevector for metal and air and metal and glass interfaces, each flattening below its surface plasmon frequency, with the bulk branch above the plasma frequency."
          x={{
            min: 0,
            max: 2.4,
            ticks: [0, 0.6, 1.2, 1.8, 2.4],
            label: 'Wavevector ck / ωp',
            fmt: (v) => v.toFixed(1),
          }}
          y={{
            min: 0,
            max: 1.5,
            ticks: [0, 0.5, 1, 1.5],
            label: 'Frequency ω / ωp',
            fmt: (v) => v.toFixed(1),
          }}
          series={[
            {
              pts: [
                [0, 0],
                [1.5, 1.5],
              ],
              tone: 'ref',
              dash: true,
            },
            {
              pts: [
                [0, 0],
                [2.4, 1.6],
              ],
              tone: 'ref',
              dash: true,
            },
            {
              pts: [
                [0, SPP_AIR.wsp],
                [2.4, SPP_AIR.wsp],
              ],
              tone: 'ref',
              dash: true,
            },
            { pts: bulk(), tone: 'ink', label: 'Bulk, ω > ωp' },
            { pts: SPP_AIR.pts, tone: 'blue', label: 'SPP, εd = 1.00' },
            { pts: SPP_GLASS.pts, tone: 'red', label: 'SPP, εd = 2.25' },
          ]}
          legendAt="br"
          notes={[
            { x: 2.36, y: SPP_AIR.wsp + 0.05, text: 'ωp/√2', anchor: 'end' },
            { x: 1.02, y: 1.08, text: 'light line', anchor: 'end' },
          ]}
        />
      </Figure>
    </Live>
  );
}
