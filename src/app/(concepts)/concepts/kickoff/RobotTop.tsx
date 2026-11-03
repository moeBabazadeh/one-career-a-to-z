import { COL, ID_DOTS, idPattern } from './draw';

// A robot seen from the overhead camera, front up: the flat front carries the dribbler, the
// cover carries the team dot and the four-marker ID pattern.
const F = Math.sqrt(90 * 90 - 72 * 72);

export default function RobotTop({
  id,
  team = 'blue',
  className,
}: {
  id: number;
  team?: 'blue' | 'yellow';
  className?: string;
}) {
  return (
    <svg
      viewBox="-100 -100 200 200"
      x={-100}
      y={-100}
      width={200}
      height={200}
      className={className}
      aria-hidden="true"
    >
      <g transform="rotate(-90)">
        <path
          d={`M72,${F} A90,90 0 1,1 72,${-F} Z`}
          fill={COL.cover}
          stroke="rgba(255,255,255,.35)"
          strokeWidth={3}
        />
        <line x1={68} y1={-F * 0.78} x2={68} y2={F * 0.78} stroke="#8b938c" strokeWidth={8} />
        <circle r={25} fill={team === 'blue' ? COL.blue : COL.yellow} />
        {idPattern(id).map((pink, k) => (
          <circle
            key={k}
            cx={ID_DOTS[k][0]}
            cy={ID_DOTS[k][1]}
            r={20}
            fill={pink ? COL.pink : COL.green}
          />
        ))}
      </g>
    </svg>
  );
}
