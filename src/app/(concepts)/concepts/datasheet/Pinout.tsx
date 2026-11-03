'use client';

import { useState } from 'react';
import { db } from '../_shared/data';
import { useInView } from '../_shared/hooks';
import { BLOCKS, PART, PINS, PIN_TYPES, type BlockId } from './content';
import s from './datasheet.module.scss';

/* ------------------------------------------------------------------ package geometry */

// A 32-pin VQFN in a 540 x 540 drawing: 360 body, 0.5-ish pitch scaled to 36, die in the middle.
const B0 = 90,
  B1 = 450,
  C = 270,
  PITCH = 36,
  DIE_PITCH = 26;
const D0 = 150,
  D1 = 390;
const PAD = 33;

type Side = 'l' | 'b' | 'r' | 't';

const GEO = PINS.filter((p) => p.no < PAD).map((pin) => {
  const side = (['l', 'b', 'r', 't'] as Side[])[Math.floor((pin.no - 1) / 8)];
  const i = (pin.no - 1) % 8;
  const along = C + ((side === 'l' || side === 'b' ? i : 7 - i) - 3.5) * PITCH;
  const die = C + (along - C) * (DIE_PITCH / PITCH);
  // Points are written for the left side, then turned to face the pin's side.
  const pt = (out: number, a: number): [number, number] => {
    if (side === 'l') return [B0 + out, a];
    if (side === 'r') return [B1 - out, a];
    if (side === 'b') return [a, B1 - out];
    return [a, B0 + out];
  };
  const horizontal = side === 'l' || side === 'r';
  const rect = (from: number, to: number, w: number) => {
    const [x1, y1] = pt(from, along - w / 2),
      [x2, y2] = pt(to, along + w / 2);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  };
  const [nx, ny] = pt(-16, along);
  const [tx, ty] = pt(horizontal ? 21 : 25, along);
  const [lx, ly] = pt(36, along);
  const [dx, dy] =
    side === 'l'
      ? [D0 + 8, die]
      : side === 'r'
        ? [D1 - 8, die]
        : side === 'b'
          ? [die, D1 - 8]
          : [die, D0 + 8];
  return {
    pin,
    side,
    pad: rect(-10, 14, 14),
    hit: rect(-64, 30, PITCH - 2),
    lead: rect(16, 36, 14),
    num: {
      x: tx,
      y: ty + (horizontal ? 3.5 : side === 'b' ? 0 : 6),
      anchor: side === 'l' ? 'start' : side === 'r' ? 'end' : 'middle',
    },
    name: horizontal
      ? { x: nx, y: ny + 4.5, anchor: side === 'l' ? 'end' : 'start' }
      : {
          x: nx + 4.5,
          y: ny,
          anchor: side === 'b' ? 'end' : 'start',
          rotate: `rotate(-90 ${nx + 4.5} ${ny})`,
        },
    wire: `M${lx.toFixed(1)},${ly.toFixed(1)} L${dx.toFixed(1)},${dy.toFixed(1)}`,
    diePad: { x: dx - 4, y: dy - 4 },
  };
});

// The die floorplan: each block sits next to the side its pins come in on.
const DIE_BLOCKS: {
  id: BlockId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vertical?: boolean;
}[] = [
  { id: 'io', label: 'I/O', x: 172, y: 172, w: 196, h: 26 },
  { id: 'fw', label: 'FW', x: 172, y: 198, w: 26, h: 144, vertical: true },
  { id: 'web', label: 'WEB', x: 198, y: 342, w: 122, h: 26 },
  { id: 'app', label: 'APP', x: 320, y: 342, w: 48, h: 26 },
  { id: 'ctrl', label: 'CTRL', x: 342, y: 198, w: 26, h: 64, vertical: true },
  { id: 'ai', label: 'AI', x: 342, y: 262, w: 26, h: 80, vertical: true },
];

// Standard-cell rows for the die texture, from a small seeded generator so it renders the same everywhere.
const CELLS = (() => {
  let seed = 2007;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cells: [number, number, number][] = [];
  for (const y of [0.6, 4.6]) {
    for (let x = 0; x < 30;) {
      const w = 1.5 + Math.floor(rnd() * 5);
      if (x + w > 30) break;
      cells.push([x, y, w]);
      x += w + 0.8;
    }
  }
  return cells;
})();

const pad2 = (n: number) => String(n).padStart(2, '0');
const TYPE_NAMES: Record<string, string> = {
  I: 'input',
  O: 'output',
  'I/O': 'input or output',
  P: 'power',
  G: 'ground',
  NC: 'no connection',
  '—': 'thermal pad',
};

/* ------------------------------------------------------------------ component */

export default function Pinout() {
  const [active, setActive] = useState<number | null>(null);
  const [focus, setFocus] = useState(1);
  const [mode, setMode] = useState<'top' | 'decap'>('top');
  const [wrap, inView] = useInView<HTMLDivElement>(false, 0.05);

  const current = active ? PINS[active - 1] : null;
  const block = current?.block ?? null;

  const probe = (no: number) => {
    setActive(no);
    setFocus(no);
  };

  // Roving focus: one tab stop for the whole package, arrow keys walk the pins.
  const onKey = (e: React.KeyboardEvent<SVGGElement>, no: number) => {
    const next = {
      ArrowDown: no + 1,
      ArrowRight: no + 1,
      ArrowUp: no - 1,
      ArrowLeft: no - 1,
      Home: 1,
      End: PAD,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const to = ((next - 1 + PAD) % PAD) + 1;
    e.currentTarget.ownerSVGElement?.querySelector<SVGGElement>(`[data-pin="${to}"]`)?.focus();
  };

  const leave = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setActive(null);
  };

  const pinProps = (no: number) => ({
    'data-pin': no,
    tabIndex: focus === no ? 0 : -1,
    role: 'button',
    'aria-label': `Pin ${no}, ${PINS[no - 1].name}, ${TYPE_NAMES[PINS[no - 1].type]}`,
    'aria-pressed': active === no,
    onPointerEnter: () => probe(no),
    onClick: () => probe(no),
    onFocus: () => probe(no),
    onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => onKey(e, no),
  });

  return (
    <div
      ref={wrap}
      className={s.pinout}
      data-mode={mode}
      data-in={inView || undefined}
      data-probing={active ? '' : undefined}
      onPointerLeave={leave}
    >
      <div className={s.pinoutFigure}>
        <div className={s.pinoutBar}>
          <span>RGZ package · 32-pin VQFN · {mode === 'top' ? 'top view' : 'decapped'}</span>
          <div className={s.segmented} role="group" aria-label="Package view">
            <button type="button" aria-pressed={mode === 'top'} onClick={() => setMode('top')}>
              Top view
            </button>
            <button type="button" aria-pressed={mode === 'decap'} onClick={() => setMode('decap')}>
              Decap
            </button>
          </div>
        </div>

        <div className={s.package}>
          {/* layer 1: the line drawing, with the pins you can probe */}
          <svg
            viewBox="0 0 540 540"
            className={s.pkgTop}
            role="group"
            aria-label="Pin configuration. Use the arrow keys to move between pins."
          >
            <rect x={B0} y={B0} width={B1 - B0} height={B1 - B0} rx={6} className={s.body} />
            <circle cx={B0 + 20} cy={B0 + 20} r={5.5} className={s.pin1} />
            <g {...pinProps(PAD)} className={`${s.thermal} ${active === PAD ? s.on : ''}`}>
              <rect x={180} y={180} width={180} height={180} rx={3} />
              <text x={C} y={350} textAnchor="middle" className={s.thermalLabel}>
                THERMAL PAD
              </text>
            </g>
            <g className={s.marking} aria-hidden="true">
              <text x={C} y={256} textAnchor="middle" className={s.markPart}>
                {PART}
              </text>
              <text x={C} y={280} textAnchor="middle">
                {db.current.title} · NJT
              </text>
              <text x={C} y={298} textAnchor="middle">
                {db.person.since} – {db.asOf.y}
              </text>
            </g>
            {GEO.map((g) => (
              <g
                key={g.pin.no}
                {...pinProps(g.pin.no)}
                className={`${s.pinG} ${active === g.pin.no ? s.on : ''} ${g.pin.type === 'NC' ? s.nc : ''}`}
                style={{ '--i': g.pin.no } as React.CSSProperties}
              >
                <rect {...g.hit} className={s.hit} />
                <rect {...g.pad} rx={2} className={s.padRect} />
                <text
                  x={g.num.x}
                  y={g.num.y}
                  textAnchor={g.num.anchor as 'start'}
                  className={s.pinNum}
                >
                  {g.pin.no}
                </text>
                <text
                  x={g.name.x}
                  y={g.name.y}
                  textAnchor={g.name.anchor as 'start'}
                  transform={g.name.rotate}
                  className={s.pinName}
                >
                  {g.pin.name}
                </text>
              </g>
            ))}
          </svg>

          {/* layer 2: the decapped package, etched open from the middle */}
          <div className={s.decap} aria-hidden="true">
            <svg viewBox="0 0 540 540">
              <defs>
                <filter id="ds-die" colorInterpolationFilters="sRGB">
                  <feColorMatrix
                    type="matrix"
                    values="0.3 0.55 0.15 0 0 0.3 0.55 0.15 0 0 0.3 0.55 0.15 0 0 0 0 0 1 0"
                  />
                  <feComponentTransfer>
                    <feFuncR type="table" tableValues="0.10 0.42 0.93" />
                    <feFuncG type="table" tableValues="0.09 0.30 0.80" />
                    <feFuncB type="table" tableValues="0.20 0.42 0.55" />
                  </feComponentTransfer>
                </filter>
                <pattern id="ds-cells" width={30} height={8} patternUnits="userSpaceOnUse">
                  {CELLS.map(([x, y, w]) => (
                    <rect key={`${x}-${y}`} x={x} y={y} width={w} height={2.6} className={s.cell} />
                  ))}
                </pattern>
                <pattern id="ds-metal" width={4} height={4} patternUnits="userSpaceOnUse">
                  <rect width={4} height={1} className={s.metalLine} />
                </pattern>
              </defs>
              <rect x={B0} y={B0} width={B1 - B0} height={B1 - B0} rx={6} className={s.mold} />
              <rect x={110} y={110} width={320} height={320} rx={10} className={s.cavity} />
              <rect
                x={D0 - 8}
                y={D0 - 8}
                width={D1 - D0 + 16}
                height={D1 - D0 + 16}
                rx={2}
                className={`${s.paddle} ${active === PAD ? s.on : ''}`}
              />
              {GEO.map((g) => (
                <rect
                  key={g.pin.no}
                  {...g.lead}
                  className={`${s.lead} ${active === g.pin.no ? s.on : ''}`}
                />
              ))}

              <rect x={D0} y={D0} width={D1 - D0} height={D1 - D0} className={s.die} />
              <rect
                x={D0}
                y={D0}
                width={D1 - D0}
                height={D1 - D0}
                fill="url(#ds-cells)"
                className={s.dieCells}
              />
              <rect
                x={166}
                y={166}
                width={208}
                height={208}
                className={`${s.ring} ${block === 'pwr' ? s.on : ''}`}
              />
              {DIE_BLOCKS.map((b) => (
                <g key={b.id} className={`${s.dieBlock} ${block === b.id ? s.on : ''}`}>
                  <rect x={b.x + 1.5} y={b.y + 1.5} width={b.w - 3} height={b.h - 3} />
                  <text
                    x={b.x + b.w / 2}
                    y={b.y + b.h / 2 + 3.5}
                    textAnchor="middle"
                    transform={
                      b.vertical ? `rotate(-90 ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined
                    }
                  >
                    {b.label}
                  </text>
                </g>
              ))}
              <g className={s.dieLogo}>
                <rect x={174} y={344} width={22} height={22} />
                <text x={185} y={358.5} textAnchor="middle">
                  MB
                </text>
              </g>
              <g className={`${s.core} ${block === 'core' ? s.on : ''}`}>
                <image
                  href={db.person.photo}
                  x={204}
                  y={204}
                  width={132}
                  height={132}
                  preserveAspectRatio="xMidYMid slice"
                  filter="url(#ds-die)"
                />
                <rect
                  x={204}
                  y={204}
                  width={132}
                  height={132}
                  fill="url(#ds-metal)"
                  className={s.metal}
                />
                <rect x={204} y={204} width={132} height={132} className={s.coreEdge} />
              </g>

              {GEO.filter((g) => g.pin.type !== 'NC').map((g) => (
                <g
                  key={g.pin.no}
                  className={`${s.bond} ${active === g.pin.no ? s.on : ''}`}
                  style={{ '--i': g.pin.no } as React.CSSProperties}
                >
                  <rect x={g.diePad.x} y={g.diePad.y} width={8} height={8} className={s.bondPad} />
                  <path d={g.wire} pathLength={1} className={s.wire} />
                </g>
              ))}
            </svg>
          </div>
        </div>

        <div className={s.probe} aria-live="polite">
          {current ? (
            <>
              <p className={s.probeHead}>
                <b>{current.no === PAD ? 'PAD' : `PIN ${pad2(current.no)}`}</b> {current.name}{' '}
                <span>{current.type}</span>
              </p>
              <p>{current.desc}</p>
              <p className={s.probeFoot}>
                {current.block
                  ? `Bonded to the ${BLOCKS[current.block]}.`
                  : 'No bond wire: nothing is connected inside.'}
                {current.link && (
                  <>
                    {' '}
                    <a
                      href={current.link.href}
                      {...(current.link.href.startsWith('http')
                        ? { target: '_blank', rel: 'noreferrer' }
                        : {})}
                    >
                      {current.link.label} ↗
                    </a>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <p className={s.probeHead}>
                <b>PROBE</b> idle <span className={s.scan}>boundary scan</span>
              </p>
              <p>
                Hover, tap or tab to a pin to probe it. Decap the package to see where each pin is
                bonded on the die.
              </p>
            </>
          )}
        </div>
        <p className={s.caption}>
          <b>Figure 5-1.</b> RGZ Package, 32-Pin VQFN With Exposed Thermal Pad,{' '}
          {mode === 'top' ? 'Top View' : 'Decapped (Illustrative)'}
        </p>
      </div>

      <div className={s.tableWrap}>
        <table className={`${s.table} ${s.pinTable}`}>
          <caption>
            <b>Table 5-1.</b> Pin Functions
          </caption>
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Name</th>
              <th scope="col">
                Type<sup>(1)</sup>
              </th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {PINS.map((p) => (
              <tr
                key={p.no}
                className={active === p.no ? s.rowOn : undefined}
                onPointerEnter={() => setActive(p.no)}
                onFocus={() => setActive(p.no)}
              >
                <td className={s.mono}>{p.no === PAD ? '—' : p.no}</td>
                <td className={s.pinCell}>{p.name}</td>
                <td className={s.mono}>{p.type}</td>
                <td>
                  {p.desc}
                  {p.link && (
                    <>
                      {' '}
                      <a
                        href={p.link.href}
                        {...(p.link.href.startsWith('http')
                          ? { target: '_blank', rel: 'noreferrer' }
                          : {})}
                      >
                        {p.link.label}
                      </a>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={s.footnote}>(1) {PIN_TYPES}</p>
      </div>
    </div>
  );
}
