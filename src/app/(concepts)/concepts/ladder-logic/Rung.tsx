'use client';

import { memo, type ReactNode } from 'react';
import { IN, OUT, ST, fmtLTime, type Plc, type Snapshot } from './plc';
import { TAG, fmtDate, type El } from './program';
import s from './ladder.module.scss';

/* ------------------------------------------------------------------ layout */

export const RUNG_W = 780;
const RAIL_L = 10;
/** Phones draw each rung at its natural width, at this scale, instead of stretching to 780. */
const NARROW_SCALE = 0.86;
const CONTACT_W = 92;
const COIL_W = 128;
const ROW = 18;
const GAP = 18;
const BAR = 14;
const CHAR = 6.15;

interface Box {
  name: string;
  type: string;
  l: number;
  b: number;
  r: number;
}

const BOXES: Record<string, Box> = {
  TONR: { name: 'TONR', type: 'LTime', l: 98, b: 76, r: 120 },
  CTU: { name: 'CTU', type: 'Int', l: 98, b: 76, r: 70 },
  RD_LOC_T: { name: 'RD_LOC_T', type: 'DTL', l: 26, b: 90, r: 170 },
  WR_LOC_T: { name: 'WR_LOC_T', type: 'DTL', l: 172, b: 124, r: 120 },
};

interface Size {
  w: number;
  up: number;
  down: number;
}

const cmpWidth = (text: string) => Math.max(96, Math.ceil(text.length * CHAR) + 18);

function measure(el: El): Size {
  switch (el.kind) {
    case 'NO':
    case 'NC':
      return { w: CONTACT_W, up: 42, down: 14 };
    case 'COIL':
      return { w: COIL_W, up: 42, down: 14 };
    case 'CMP':
      return { w: cmpWidth(el.text), up: 50, down: 38 };
    case 'SERIES': {
      const m = el.items.map(measure);
      return {
        w: m.reduce((a, c) => a + c.w, 0),
        up: Math.max(...m.map((c) => c.up)),
        down: Math.max(...m.map((c) => c.down)),
      };
    }
    case 'PAR':
    case 'FORK': {
      const m = el.items.map(measure);
      const off = offsets(m);
      return {
        w: Math.max(...m.map((c) => c.w)) + (el.kind === 'PAR' ? 2 * BAR : BAR),
        up: m[0].up,
        down: off.at(-1)! + m.at(-1)!.down,
      };
    }
    default: {
      const b = BOXES[el.kind];
      return { w: b.l + b.b + b.r, up: 70, down: 2 * ROW + 16 };
    }
  }
}

/** Vertical offset of each parallel branch's rung line from the first one. */
function offsets(m: Size[]) {
  const off = [0];
  for (let i = 1; i < m.length; i++) off.push(off[i - 1] + m[i - 1].down + GAP + m[i].up);
  return off;
}

export function rungHeight(el: El) {
  const m = measure(el);
  return { y: m.up + 10, h: m.up + m.down + 24 };
}

/* ------------------------------------------------------------------ drawing */

interface Wire {
  d: string;
  on: boolean;
}

interface Ctx {
  wires: Wire[];
  nodes: ReactNode[];
  snap: Snapshot;
  live: boolean;
  plc: Plc;
}

const q = (name: string) => {
  const [head, ...rest] = name.split('.');
  return `"${head}"${rest.length ? '.' + rest.join('.') : ''}`;
};

function pill(
  ctx: Ctx,
  key: string,
  x: number,
  y: number,
  text: string,
  anchor: 'start' | 'middle' | 'end' = 'middle',
  hot = false,
) {
  if (!ctx.live) return null;
  const w = text.length * CHAR * 0.94 + 8;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return (
    <g key={key} className={`${s.pill} ${hot ? s.pillHot : ''}`}>
      <rect x={x0} y={y - 9.5} width={w} height={13} rx={2.5} />
      <text x={x0 + w / 2} y={y} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

function operandValue(snap: Snapshot, name: string) {
  if (name === 'Clock.Now') return fmtDate(snap.now);
  const d = new Date(snap.now);
  return String(name.endsWith('YEAR') ? d.getUTCFullYear() : d.getUTCMonth() + 1);
}

/** Press-and-hold for push buttons, toggle for switches. Shared by the rungs and the I/O panel. */
export function inputProps(plc: Plc, tag: string) {
  const isKey = (e: React.KeyboardEvent) => e.key === ' ' || e.key === 'Enter';
  if (TAG[tag].kind === 'switch') {
    return {
      onClick: () => plc.toggle(tag),
      onKeyDown: (e: React.KeyboardEvent) => {
        // Native buttons click on their own; SVG buttons need the key handled here.
        if (isKey(e) && !(e.currentTarget instanceof HTMLButtonElement)) {
          e.preventDefault();
          plc.toggle(tag);
        }
      },
    };
  }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      plc.press(tag, true);
    },
    onPointerUp: () => plc.press(tag, false),
    onPointerCancel: () => plc.press(tag, false),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (isKey(e)) {
        e.preventDefault();
        if (!e.repeat) plc.press(tag, true);
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (isKey(e)) plc.press(tag, false);
    },
  };
}

function wire(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, on: boolean) {
  if (x1 === x2 && y1 === y2) return;
  ctx.wires.push({ d: `M${x1},${y1} L${x2},${y2}`, on });
}

function contact(
  ctx: Ctx,
  el: Extract<El, { kind: 'NO' | 'NC' }>,
  x: number,
  y: number,
  p: number,
) {
  const cx = x + CONTACT_W / 2;
  const tag = TAG[el.tag];
  const closed = !!(p & ST);
  wire(ctx, x, y, cx - 7, y, !!(p & IN));
  wire(ctx, cx + 7, y, x + CONTACT_W, y, !!(p & OUT));
  const isInput = tag.kind === 'push' || tag.kind === 'switch';
  const body = (
    <>
      <text x={cx} y={y - 31} textAnchor="middle" className={s.addr}>
        {tag.addr}
      </text>
      <text x={cx} y={y - 18} textAnchor="middle" className={s.opName}>
        {q(el.tag)}
      </text>
      <rect
        x={cx - 7}
        y={y - 11}
        width={14}
        height={22}
        className={`${s.contactFill} ${closed ? s.on : ''}`}
      />
      <path
        d={`M${cx - 7},${y - 12} V${y + 12} M${cx + 7},${y - 12} V${y + 12}`}
        className={`${s.sym} ${closed ? s.on : ''}`}
      />
      {el.kind === 'NC' && (
        <path
          d={`M${cx - 6},${y + 9} L${cx + 6},${y - 9}`}
          className={`${s.sym} ${closed ? s.on : ''}`}
        />
      )}
    </>
  );
  if (!isInput) {
    ctx.nodes.push(<g key={el.id}>{body}</g>);
    return;
  }
  const on = !!ctx.snap.bits[el.tag];
  const label =
    tag.kind === 'switch'
      ? `${tag.addr} ${el.tag}: ${on ? 'on' : 'off'}. Toggle`
      : `${tag.addr} ${el.tag}: press and hold`;
  ctx.nodes.push(
    <g
      key={el.id}
      className={s.hit}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={tag.kind === 'switch' ? on : undefined}
      {...inputProps(ctx.plc, el.tag)}
    >
      <rect x={cx - 40} y={y - 44} width={80} height={60} rx={5} className={s.hitArea} />
      {body}
    </g>,
  );
}

function coil(ctx: Ctx, el: Extract<El, { kind: 'COIL' }>, x: number, y: number, p: number) {
  const cx = x + COIL_W - 50;
  const tag = TAG[el.tag];
  const on = !!(p & ST);
  const forced = ctx.live && ctx.snap.forces[el.tag];
  wire(ctx, x, y, cx - 10, y, !!(p & IN));
  wire(ctx, cx + 10, y, x + COIL_W, y, on);
  const label = (
    <>
      <text x={cx} y={y - 31} textAnchor="middle" className={s.addr}>
        {tag.addr}
      </text>
      <text x={cx} y={y - 18} textAnchor="middle" className={s.opName}>
        {q(el.tag)}
      </text>
    </>
  );
  ctx.nodes.push(
    <g key={el.id}>
      {tag.project ? (
        <a
          href={`#q-${el.tag}`}
          className={s.opLink}
          aria-label={`${tag.addr} ${tag.project}: go to the project`}
        >
          {label}
        </a>
      ) : (
        label
      )}
      {forced && (
        <g className={s.forceFlag}>
          <rect x={cx + 22} y={y - 40} width={11} height={12} rx={2} />
          <text x={cx + 27.5} y={y - 31} textAnchor="middle">
            F
          </text>
        </g>
      )}
      <circle cx={cx} cy={y} r={8.5} className={`${s.coilFill} ${on ? s.on : ''}`} />
      <path
        d={`M${cx - 6},${y - 12} Q${cx - 14},${y} ${cx - 6},${y + 12} M${cx + 6},${y - 12} Q${cx + 14},${y} ${cx + 6},${y + 12}`}
        className={`${s.sym} ${on ? s.on : ''}`}
      />
    </g>,
  );
}

function compare(ctx: Ctx, el: Extract<El, { kind: 'CMP' }>, x: number, y: number, p: number) {
  const w = cmpWidth(el.text);
  const cx = x + w / 2;
  const state = !!(p & ST);
  wire(ctx, x, y, cx - 23, y, !!(p & IN));
  wire(ctx, cx + 23, y, x + w, y, !!(p & OUT));
  ctx.nodes.push(
    <g key={el.id}>
      {pill(ctx, 'v', cx, y - 34, operandValue(ctx.snap, el.in1))}
      <text x={cx} y={y - 21} textAnchor="middle" className={s.opName}>
        {q(el.in1)}
      </text>
      <rect
        x={cx - 23}
        y={y - 15}
        width={46}
        height={30}
        rx={2}
        className={`${s.box} ${state && ctx.live ? s.boxOn : ''}`}
      />
      <text x={cx} y={y - 1} textAnchor="middle" className={s.boxOp}>
        {el.op}
      </text>
      <text x={cx} y={y + 10} textAnchor="middle" className={s.boxType}>
        {el.type}
      </text>
      <text x={cx} y={y + 29} textAnchor="middle" className={s.literal}>
        {el.text}
      </text>
    </g>,
  );
}

type BoxEl = Extract<El, { kind: 'TONR' | 'CTU' | 'RD_LOC_T' | 'WR_LOC_T' }>;

function box(ctx: Ctx, el: BoxEl, x: number, y: number, p: number, end?: number) {
  const b = BOXES[el.kind];
  const x0 = x + b.l,
    x1 = x0 + b.b,
    mid = x0 + b.b / 2;
  const right = end ?? x + b.l + b.b + b.r;
  const out = !!(p & OUT);
  wire(ctx, x, y, x0, y, !!(p & IN));
  wire(ctx, x1, y, right, y, out);

  const left: [string, ReactNode][] = [];
  const rightRows: [string, ReactNode][] = [];
  let inst: [string, string] | null = null;
  let bar: number | null = null;
  const v = ctx.live;

  const bit = (tag: string) => (
    <text className={`${s.pinOp} ${v && ctx.snap.bits[tag] ? s.pinOpOn : ''}`}>{q(tag)}</text>
  );

  if (el.kind === 'TONR') {
    const t = ctx.snap.timers[el.inst];
    inst = [el.db, el.inst];
    left.push(
      ['IN', null],
      ['R', bit(el.r)],
      [
        'PT',
        <text key="pt" className={s.literal}>
          {el.pt >= 1e12 ? 'LT#106751D…' : fmtLTime(el.pt)}
        </text>,
      ],
    );
    rightRows.push(
      ['Q', null],
      ['ET', pill(ctx, 'et', 0, 0, fmtLTime(t.et), 'start', t.q || !!(p & IN))],
    );
    if (v && el.pt < 1e12) bar = t.et / el.pt;
  } else if (el.kind === 'CTU') {
    const c = ctx.snap.counters[el.inst];
    inst = [el.db, el.inst];
    left.push(
      ['CU', null],
      ['R', bit(el.r)],
      [
        'PV',
        <text key="pv" className={s.literal}>
          {el.pv}
        </text>,
      ],
    );
    rightRows.push(['Q', null], ['CV', pill(ctx, 'cv', 0, 0, String(c.cv), 'start', c.q)]);
    if (v) bar = Math.min(1, c.cv / el.pv);
  } else if (el.kind === 'RD_LOC_T') {
    left.push(['EN', null]);
    rightRows.push(
      ['ENO', null],
      [
        'RET_VAL',
        <g key="r">
          <text className={s.pinOp}>&quot;Clock&quot;.Ret</text>
          {pill(ctx, 'rv', 72, 0, '0', 'start')}
        </g>,
      ],
      [
        'OUT',
        <g key="o">
          <text className={s.pinOp}>&quot;Clock&quot;.Now</text>
          {pill(ctx, 'ov', 72, 0, fmtDate(ctx.snap.now), 'start')}
        </g>,
      ],
    );
  } else {
    left.push(
      ['EN', null],
      ['LOCTIME', <text key="lt" className={s.literal}>{`DTL#${fmtDate(el.loc)}-00:00:00`}</text>],
      [
        'DST',
        <text key="dst" className={s.literal}>
          FALSE
        </text>,
      ],
    );
    rightRows.push(
      ['ENO', null],
      [
        'RET_VAL',
        <g key="r">
          <text className={s.pinOp}>&quot;Clock&quot;.Ret</text>
          {pill(ctx, 'rv', 72, 0, '0', 'start')}
        </g>,
      ],
    );
  }

  const rows = Math.max(left.length, rightRows.length, 3);
  const top = y - 36,
    bottom = y + (rows - 1) * ROW + 14;

  ctx.nodes.push(
    <g key={el.id}>
      {inst && (
        <>
          <text x={mid} y={y - 58} textAnchor="middle" className={s.addr}>
            {inst[0]}
          </text>
          <text x={mid} y={y - 45} textAnchor="middle" className={s.opName}>
            {q(inst[1])}
          </text>
        </>
      )}
      <rect
        x={x0}
        y={top}
        width={b.b}
        height={bottom - top}
        rx={2}
        className={`${s.box} ${v && p & IN ? s.boxOn : ''}`}
      />
      <text x={mid} y={y - 21} textAnchor="middle" className={s.boxTitle}>
        {b.name}
      </text>
      <text x={mid} y={y - 9} textAnchor="middle" className={s.boxType}>
        {b.type}
      </text>
      {bar != null && (
        <g className={s.etBar}>
          <rect x={x0 + 6} y={bottom - 6} width={b.b - 12} height={2.5} />
          <rect
            x={x0 + 6}
            y={bottom - 6}
            width={(b.b - 12) * Math.min(1, bar)}
            height={2.5}
            className={s.barFill}
          />
        </g>
      )}
      {left.map(([pin, operand], i) => (
        <g key={pin}>
          <text x={x0 + 5} y={y + i * ROW + 4} className={s.pin}>
            {pin}
          </text>
          {i > 0 && (
            <>
              <path d={`M${x0 - 10},${y + i * ROW} H${x0}`} className={s.stub} />
              <g transform={`translate(${x0 - 14} ${y + i * ROW + 4})`} textAnchor="end">
                {operand}
              </g>
            </>
          )}
        </g>
      ))}
      {rightRows.map(([pin, operand], i) => (
        <g key={pin}>
          <text x={x1 - 5} y={y + i * ROW + 4} textAnchor="end" className={s.pin}>
            {pin}
          </text>
          {i > 0 && (
            <>
              <path d={`M${x1},${y + i * ROW} H${x1 + 10}`} className={s.stub} />
              <g transform={`translate(${x1 + 14} ${y + i * ROW + 4})`}>{operand}</g>
            </>
          )}
        </g>
      ))}
    </g>,
  );
}

const powerOf = (ctx: Ctx, el: El) => (ctx.live ? (ctx.snap.power[el.id!] ?? 0) : 0);

/** Draws `el` with its rung line at y, from x. With `end`, the element is pushed right to end there. */
function draw(ctx: Ctx, el: El, x: number, y: number, end?: number) {
  const p = powerOf(ctx, el);
  switch (el.kind) {
    case 'NO':
    case 'NC':
      return contact(ctx, el, x, y, p);
    case 'COIL':
      return coil(ctx, el, x, y, p);
    case 'CMP':
      return compare(ctx, el, x, y, p);
    case 'SERIES': {
      let cx = x;
      let flowing = !!(p & IN);
      el.items.forEach((c, i) => {
        const m = measure(c);
        const last = i === el.items.length - 1;
        if (last && end != null && c.kind !== 'FORK') {
          const boxed = c.kind in BOXES;
          const x0 = boxed ? cx : end - m.w;
          wire(ctx, cx, y, x0, y, flowing);
          draw(ctx, c, x0, y, boxed ? end : undefined);
        } else {
          draw(ctx, c, cx, y, last ? end : undefined);
          cx += m.w;
        }
        flowing = !!(powerOf(ctx, c) & OUT);
      });
      return;
    }
    case 'PAR':
    case 'FORK': {
      const m = el.items.map(measure);
      const off = offsets(m);
      const w = measure(el).w;
      const pin = !!(p & IN);
      wire(ctx, x, y, x, y + off.at(-1)!, pin);
      el.items.forEach((c, i) => {
        const by = y + off[i];
        wire(ctx, x, by, x + BAR, by, pin);
        if (el.kind === 'FORK') {
          if (c.kind === 'SERIES') draw(ctx, c, x + BAR, by, end ?? x + w);
          else {
            const tail = (end ?? x + w) - m[i].w;
            wire(ctx, x + BAR, by, tail, by, pin);
            draw(ctx, c, tail, by);
          }
        } else {
          draw(ctx, c, x + BAR, by);
          wire(ctx, x + BAR + m[i].w, by, x + w, by, !!(powerOf(ctx, c) & OUT));
        }
      });
      if (el.kind === 'PAR') wire(ctx, x + w, y, x + w, y + off.at(-1)!, !!(p & OUT));
      return;
    }
    default:
      return box(ctx, el, x, y, p, end);
  }
}

/* ------------------------------------------------------------------ component */

interface RungProps {
  rung: El;
  snap: Snapshot;
  live: boolean;
  flow: boolean;
  visible: boolean;
  plc: Plc;
  label: string;
  narrow: boolean;
}

function RungSvg({ rung, snap, live, flow, plc, label, narrow }: RungProps) {
  const { y, h } = rungHeight(rung);
  const W = narrow ? measure(rung).w + RAIL_L + 40 : RUNG_W;
  const RAIL_R = W - 10;
  const ctx: Ctx = { wires: [], nodes: [], snap, live, plc };
  draw(ctx, rung, RAIL_L + 12, y, RAIL_R);
  const dead = ctx.wires
    .filter((w) => !w.on)
    .map((w) => w.d)
    .join(' ');
  const hot = ctx.wires
    .filter((w) => w.on)
    .map((w) => w.d)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${h}`}
      className={`${s.rung} ${narrow ? s.rungNarrow : ''} ${live ? '' : s.offline}`}
      style={narrow ? { width: W * NARROW_SCALE } : undefined}
      role="group"
      aria-label={label}
    >
      <path d={`M${RAIL_L},4 V${h - 4}`} className={`${s.rail} ${live ? s.railOn : ''}`} />
      <path d={`M${RAIL_R},4 V${h - 4}`} className={s.railReturn} />
      <path d={`M${RAIL_L},${y} H${RAIL_L + 12}`} className={live ? s.wireOn : s.wire} />
      {dead && <path d={dead} className={s.wire} />}
      {hot && live && (
        <g className={s.powered}>
          <path d={hot} className={s.wireOn} />
          {flow && <path d={hot} className={s.flow} />}
        </g>
      )}
      {ctx.nodes}
    </svg>
  );
}

// Off-screen rungs skip the 25 Hz re-render; they catch up as they scroll back in.
export const Rung = memo(
  RungSvg,
  (a, b) =>
    !a.visible && !b.visible && a.live === b.live && a.flow === b.flow && a.narrow === b.narrow,
);
