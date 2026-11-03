'use client';

// The view cube and the axis triad. Both follow the camera through the engine's view
// subscription and write their transforms straight to the DOM, so orbiting never re-renders
// React. Each face of the cube is a 3x3 grid like the real thing: the middle picks the face's
// view, the strips pick the edge views, and the corners pick the corner (isometric) views.
import { useEffect, useRef, useState } from 'react';
import type { Engine } from './engine';
import { Icon } from './icons';
import type { V3 } from './models';
import s from './viewer.module.scss';

interface Face {
  id: string;
  label: string;
  n: V3;
  r: V3;
  u: V3;
  css: string;
}

const FACES: Face[] = [
  {
    id: 'front',
    label: 'Front',
    n: [0, 0, 1],
    r: [1, 0, 0],
    u: [0, 1, 0],
    css: 'translateZ(var(--half))',
  },
  {
    id: 'back',
    label: 'Back',
    n: [0, 0, -1],
    r: [-1, 0, 0],
    u: [0, 1, 0],
    css: 'rotateY(180deg) translateZ(var(--half))',
  },
  {
    id: 'right',
    label: 'Right',
    n: [1, 0, 0],
    r: [0, 0, -1],
    u: [0, 1, 0],
    css: 'rotateY(90deg) translateZ(var(--half))',
  },
  {
    id: 'left',
    label: 'Left',
    n: [-1, 0, 0],
    r: [0, 0, 1],
    u: [0, 1, 0],
    css: 'rotateY(-90deg) translateZ(var(--half))',
  },
  {
    id: 'top',
    label: 'Top',
    n: [0, 1, 0],
    r: [1, 0, 0],
    u: [0, 0, -1],
    css: 'rotateX(90deg) translateZ(var(--half))',
  },
  {
    id: 'bottom',
    label: 'Bottom',
    n: [0, -1, 0],
    r: [1, 0, 0],
    u: [0, 0, 1],
    css: 'rotateX(-90deg) translateZ(var(--half))',
  },
];

const AXIS_WORDS: [string, string][] = [
  ['right', 'left'],
  ['top', 'bottom'],
  ['front', 'back'],
];

/** "front top right" for a direction like (1, 1, 1). */
function describe(d: V3) {
  return [2, 1, 0]
    .map((i) => (d[i] > 0 ? AXIS_WORDS[i][0] : d[i] < 0 ? AXIS_WORDS[i][1] : ''))
    .filter(Boolean)
    .join(' ');
}

const cellDir = (f: Face, row: number, col: number): V3 =>
  [0, 1, 2].map((i) => f.n[i] + (col - 1) * f.r[i] + (1 - row) * f.u[i]) as V3;

export function ViewCube({ engine }: { engine: Engine | null }) {
  const cube = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState<string | null>(null);

  useEffect(() => {
    if (!engine) return;
    return engine.onView((css) => {
      if (cube.current) cube.current.style.transform = css;
    });
  }, [engine]);

  return (
    <div className={s.cubeDock}>
      <div className={s.cubeStage} onPointerLeave={() => setHot(null)}>
        <div ref={cube} className={s.cube}>
          {FACES.map((f) => (
            <div key={f.id} className={s.face} style={{ transform: f.css }}>
              {[0, 1, 2].map((row) =>
                [0, 1, 2].map((col) => {
                  const d = cellDir(f, row, col);
                  const key = d.join(',');
                  const center = row === 1 && col === 1;
                  return (
                    <button
                      key={`${row}${col}`}
                      type="button"
                      className={s.cell}
                      data-hot={hot === key || undefined}
                      tabIndex={center ? 0 : -1}
                      aria-label={`View from ${describe(d)}`}
                      onPointerEnter={() => setHot(key)}
                      onClick={() => engine?.lookFrom(d)}
                    />
                  );
                }),
              )}
              <span className={s.faceLabel}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={s.cubeHome}
        onClick={() => engine?.view('home')}
        aria-label="Home view"
        title="Home view (0)"
      >
        <Icon name="home" size={14} />
      </button>
    </div>
  );
}

const AXES = [
  { label: 'X', cls: 'ax' },
  { label: 'Y', cls: 'ay' },
  { label: 'Z', cls: 'az' },
] as const;

/** The world axes as the camera sees them, bottom left of the viewport. */
export function Triad({ engine }: { engine: Engine | null }) {
  const lines = useRef<(SVGLineElement | null)[]>([]);
  const tags = useRef<(SVGTextElement | null)[]>([]);

  useEffect(() => {
    if (!engine) return;
    return engine.onView((_, m) => {
      for (let i = 0; i < 3; i++) {
        const x = m[i * 4],
          y = m[i * 4 + 1],
          z = m[i * 4 + 2];
        const line = lines.current[i],
          tag = tags.current[i];
        if (!line || !tag) continue;
        line.setAttribute('x2', String(30 + x * 19));
        line.setAttribute('y2', String(30 - y * 19));
        tag.setAttribute('x', String(30 + x * 25));
        tag.setAttribute('y', String(30 - y * 25 + 3.5));
        const o = String(0.45 + 0.55 * ((z + 1) / 2));
        line.style.opacity = o;
        tag.style.opacity = o;
      }
    });
  }, [engine]);

  return (
    <svg className={s.triad} viewBox="0 0 60 60" aria-hidden="true">
      {AXES.map((a, i) => (
        <g key={a.label} className={s[a.cls]}>
          <line
            ref={(el) => {
              lines.current[i] = el;
            }}
            x1={30}
            y1={30}
            x2={30}
            y2={30}
          />
          <text
            ref={(el) => {
              tags.current[i] = el;
            }}
            x={30}
            y={30}
            textAnchor="middle"
          >
            {a.label}
          </text>
        </g>
      ))}
      <circle cx={30} cy={30} r={2.2} className={s.triadDot} />
    </svg>
  );
}
