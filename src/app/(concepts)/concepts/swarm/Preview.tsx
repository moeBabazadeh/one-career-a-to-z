import { BOX } from './formations';
import { formationOf } from './mission';
import s from './swarm.module.scss';

/** A waypoint's formation as a still: one dot per drone, from the same planner the sim flies. */
export default function Preview({ wp, className }: { wp: number; className?: string }) {
  const f = formationOf(wp);
  const pad = 4;
  const vb = `${-BOX.w / 2 - pad} ${-BOX.h / 2 - pad} ${BOX.w + pad * 2} ${BOX.h + pad * 2}`;
  const dots = Array.from({ length: f.n }, (_, i) => ({
    x: f.u[i].toFixed(2),
    y: (-f.v[i]).toFixed(2),
    c: f.c[i],
  }));
  return (
    <svg
      className={`${s.preview} ${className ?? ''}`}
      viewBox={vb}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x={-BOX.w / 2 - pad}
        y={-BOX.h / 2 - pad}
        width={BOX.w + pad * 2}
        height={BOX.h + pad * 2}
        className={s.previewSky}
      />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={1.15} style={{ fill: `var(--led-${d.c})` }} />
      ))}
      <text x={-BOX.w / 2 - pad + 2.5} y={-BOX.h / 2 - pad + 5} className={s.previewCount}>
        {f.n} drones
      </text>
    </svg>
  );
}
