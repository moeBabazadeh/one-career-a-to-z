'use client';

import { useState } from 'react';
import { useInView, useReducedMotion } from '../_shared/hooks';
import { COL, idPattern } from './draw';
import s from './robocup.module.scss';

// A Small Size robot in side elevation at 1.6 px per mm, front to the left. It comes apart in
// layers once it scrolls into view; the numbers match the parts list next to it.
const PARTS = [
  {
    n: 1,
    name: 'Cover',
    text: 'The team dot and four ID markers on top, read by the cameras above the field.',
  },
  {
    n: 2,
    name: 'Control board',
    text: 'A microcontroller and motor drivers close the wheel-speed loops.',
  },
  { n: 3, name: 'Radio', text: 'Takes its commands from the AI computer beside the field.' },
  { n: 4, name: 'Battery', text: 'A LiPo pack for the motors and the kicker.' },
  {
    n: 5,
    name: 'Kicker',
    text: 'Capacitors charged to high voltage fire a solenoid plunger into the ball.',
  },
  {
    n: 6,
    name: 'Drive and dribbler',
    text: 'Four omni-wheels to drive in any direction while turning, and a spinning bar that holds the ball with backspin.',
  },
];

const Tag = ({ n, x, y }: { n: number; x: number; y: number }) => (
  <g className={s.xTag}>
    <line x1={x - 34} y1={y} x2={x - 12} y2={y} />
    <circle cx={x} cy={y} r={11} />
    <text x={x} y={y + 4} textAnchor="middle">
      {n}
    </text>
  </g>
);

const ROLLERS = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);

function Wheel({ cx }: { cx: number }) {
  return (
    <g>
      <circle cx={cx} cy={500} r={40} fill="#1b201c" stroke="#8b938c" strokeWidth={2} />
      {ROLLERS.map((a) => (
        <rect
          key={a}
          x={cx + Math.cos(a) * 34 - 5}
          y={500 + Math.sin(a) * 34 - 3}
          width={10}
          height={6}
          rx={3}
          fill="#4b544d"
          transform={`rotate(${(a * 180) / Math.PI + 90} ${cx + Math.cos(a) * 34} ${500 + Math.sin(a) * 34})`}
        />
      ))}
      <circle cx={cx} cy={500} r={9} fill="#8b938c" />
    </g>
  );
}

export default function Exploded() {
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(true, 0.35);
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? (reduced || seen);
  const dots = idPattern(5);

  return (
    <div ref={ref} className={s.exploded} data-open={open || undefined}>
      <div className={s.xFigure}>
        <svg
          viewBox="40 80 480 500"
          role="img"
          aria-label="Side view of a Small Size League robot taken apart in layers: cover, control board with radio, battery, kicker, and the drive with omni-wheels and the dribbler holding an orange golf ball."
        >
          {/* 6 · drive and dribbler, the base everything sits on */}
          <g
            className={s.xLayer}
            style={{ '--lift': '0px', '--d': '0.32s' } as React.CSSProperties}
          >
            <rect x={152} y={462} width={284} height={10} rx={2} fill="#59625b" />
            <rect x={190} y={432} width={46} height={30} rx={4} fill="#6c766e" />
            <rect x={352} y={432} width={46} height={30} rx={4} fill="#6c766e" />
            <Wheel cx={214} />
            <Wheel cx={374} />
            <line x1={152} y1={468} x2={140} y2={486} stroke="#8b938c" strokeWidth={4} />
            <circle cx={140} cy={486} r={11} fill="#8b938c" />
            <circle cx={100} cy={506} r={34} fill={COL.ball} />
            <circle cx={88} cy={494} r={8} fill="rgba(255,255,255,.7)" />
            <Tag n={6} x={474} y={470} />
          </g>
          {/* 5 · kicker */}
          <g
            className={s.xLayer}
            style={{ '--lift': '-38px', '--d': '0.24s' } as React.CSSProperties}
          >
            <rect x={160} y={398} width={272} height={5} fill="#1f7a43" />
            <rect x={164} y={408} width={110} height={22} rx={9} fill="#b87333" />
            {[178, 194, 210, 226, 242, 258].map((x) => (
              <line key={x} x1={x} y1={409} x2={x} y2={429} stroke="#8a5424" strokeWidth={2} />
            ))}
            <rect x={150} y={415} width={18} height={8} rx={2} fill="#c9d1cb" />
            <rect x={290} y={406} width={124} height={12} rx={6} fill="#2a3a5e" />
            <rect x={290} y={421} width={124} height={12} rx={6} fill="#2a3a5e" />
            <Tag n={5} x={474} y={416} />
          </g>
          {/* 4 · battery */}
          <g
            className={s.xLayer}
            style={{ '--lift': '-78px', '--d': '0.16s' } as React.CSSProperties}
          >
            <rect
              x={200}
              y={362}
              width={190}
              height={26}
              rx={3}
              fill="#262b27"
              stroke={COL.yellow}
              strokeWidth={1.5}
            />
            <text x={295} y={380} textAnchor="middle" className={s.xLabel}>
              LiPo
            </text>
            <Tag n={4} x={474} y={375} />
          </g>
          {/* 2 · control board, 3 · radio */}
          <g
            className={s.xLayer}
            style={{ '--lift': '-122px', '--d': '0.08s' } as React.CSSProperties}
          >
            <rect x={156} y={330} width={276} height={7} rx={1} fill="#1f8a4c" />
            <rect x={250} y={319} width={48} height={11} rx={1} fill="#101210" />
            {[176, 200, 334, 358].map((x) => (
              <rect key={x} x={x} y={323} width={18} height={7} fill="#2a2f2b" />
            ))}
            <rect x={394} y={315} width={30} height={15} rx={2} fill="#3b403c" />
            <line x1={418} y1={315} x2={418} y2={282} stroke="#c9d1cb" strokeWidth={2.5} />
            {[166, 422].map((x) => (
              <line key={x} x1={x} y1={337} x2={x} y2={356} stroke="#8b938c" strokeWidth={2} />
            ))}
            <Tag n={2} x={474} y={334} />
            <Tag n={3} x={474} y={298} />
          </g>
          {/* 1 · cover with the colour pattern */}
          <g
            className={s.xLayer}
            style={{ '--lift': '-172px', '--d': '0s' } as React.CSSProperties}
          >
            <rect
              x={150}
              y={276}
              width={288}
              height={10}
              rx={3}
              fill="#151915"
              stroke="rgba(255,255,255,.4)"
              strokeWidth={1.5}
            />
            <rect x={278} y={271} width={32} height={5} rx={2} fill={COL.blue} />
            {[188, 222, 366, 400].map((x, k) => (
              <rect
                key={x}
                x={x}
                y={272}
                width={22}
                height={4}
                rx={2}
                fill={dots[k] ? COL.pink : COL.green}
              />
            ))}
            <Tag n={1} x={474} y={278} />
          </g>

          {/* rule limits */}
          <g className={s.xDims}>
            <line x1={150} y1={562} x2={438} y2={562} />
            <line x1={150} y1={554} x2={150} y2={570} />
            <line x1={438} y1={554} x2={438} y2={570} />
            <text x={294} y={556} textAnchor="middle">
              ø 180 mm max
            </text>
            <line x1={150} y1={540} x2={438} y2={540} className={s.xGround} />
          </g>
          <g className={s.xHeight}>
            <line x1={470} y1={276} x2={470} y2={540} />
            <line x1={462} y1={276} x2={478} y2={276} />
            <line x1={462} y1={540} x2={478} y2={540} />
            <text x={0} y={0} transform="translate(492 408) rotate(90)" textAnchor="middle">
              150 mm max
            </text>
          </g>
        </svg>
        <button
          type="button"
          className={s.xToggle}
          aria-pressed={open}
          onClick={() => setManual(!open)}
        >
          {open ? 'Assemble' : 'Take it apart'}
        </button>
      </div>
      <ol className={s.parts}>
        {PARTS.map((p) => (
          <li key={p.n}>
            <span className={s.partNo}>{p.n}</span>
            <div>
              <h4>{p.name}</h4>
              <p>{p.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
