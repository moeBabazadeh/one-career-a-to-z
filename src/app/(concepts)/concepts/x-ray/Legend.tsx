'use client';

import { useEffect, useRef } from 'react';
import { useScheme } from '../_shared/hooks';
import { BLOCK, CATS, INDUCTORS, type Cat } from './geometry';
import { ALL_LAYERS, LAYERS, paintWorld, syncPalette } from './paint';
import s from './die.module.scss';

// The legend's swatches are painted by the same renderer as the die, from real spots on it, so
// what you learn to recognise here is exactly what you'll find out there.

const SW = 76,
  SH = 48;

function Swatch({ x, y, z, label }: { x: number; y: number; z: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scheme = useScheme();
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const r = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SW * r;
    cv.height = SH * r;
    syncPalette(cv);
    paintWorld(g, x - SW / 2 / z, y - SH / 2 / z, z * r, cv.width, cv.height, z, ALL_LAYERS);
  }, [x, y, z, scheme]);
  return <canvas ref={ref} className={s.swatch} role="img" aria-label={label} />;
}

const gsm = INDUCTORS[0];
const STRUCTURES: { name: string; look: string; x: number; y: number; z: number }[] = [
  {
    name: 'SRAM',
    look: 'smooth, regular, a rainbow sheen',
    x: BLOCK.slc.x + 3000,
    y: BLOCK.slc.y + 520,
    z: 0.7,
  },
  {
    name: 'Standard cells',
    look: 'granular, like sand',
    x: BLOCK.p0.x + 1860,
    y: BLOCK.p0.y + 1030,
    z: 1.1,
  },
  {
    name: 'Datapath',
    look: 'stripes: identical bit slices',
    x: BLOCK.p0.x + 1000,
    y: BLOCK.p0.y + 1780,
    z: 1.1,
  },
  { name: 'Inductor', look: 'a gold spiral in thick metal', x: gsm.cx, y: gsm.cy, z: 0.07 },
  {
    name: 'Power grid',
    look: 'gold straps over everything',
    x: BLOCK.slc.x + 600,
    y: BLOCK.slc.y + 900,
    z: 0.16,
  },
  {
    name: 'Bitcells',
    look: 'six transistors each, mirrored',
    x: BLOCK.p0.x + 400,
    y: BLOCK.p0.y + 1000,
    z: 110,
  },
];

const CAT_ORDER: Cat[] = ['cpu', 'accel', 'mem', 'hw', 'sys'];

export default function Legend() {
  return (
    <section className={s.legend} aria-labelledby="legend-title">
      <h3 id="legend-title" className={s.sub}>
        Reading a die shot
      </h3>
      <ul className={s.cats}>
        {CAT_ORDER.map((c) => (
          <li key={c}>
            <span style={{ background: CATS[c].color }} aria-hidden="true" />
            {CATS[c].label}
          </li>
        ))}
      </ul>
      <ul className={s.structures}>
        {STRUCTURES.map((st) => (
          <li key={st.name}>
            <Swatch x={st.x} y={st.y} z={st.z} label={`${st.name}: ${st.look}`} />
            <div>
              <b>{st.name}</b>
              <span>{st.look}</span>
            </div>
          </li>
        ))}
      </ul>
      <ul className={s.stack}>
        {[...LAYERS].reverse().map((l) => (
          <li key={l.id}>
            <span style={{ background: l.color, height: l.thick + 2 }} aria-hidden="true" />
            <b>{l.short}</b>
            {l.name} · {l.note}
          </li>
        ))}
      </ul>
    </section>
  );
}
