'use client';

// Equipment in the high-performance style: grey shapes, filled when running or open, hollow when
// stopped or closed, and colour kept for alarms. Alarm marks carry their priority three ways at
// once (shape, colour and number), so they read without colour too.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import type { Plant, Prio, PumpState } from './sim';
import { PENS, RING, SAMPLE } from './sim';
import s from './scada.module.scss';

/* ------------------------------------------------------------------ alarm marks */

const PRIO_CLASS: Record<Prio, string> = { 1: s.p1, 2: s.p2, 3: s.p3, 4: s.p4 };

function markPath(prio: Prio, c: number, r: number) {
  if (prio === 1) return `M${c - r},${c - r}h${2 * r}v${2 * r}h${-2 * r}z`;
  if (prio === 2) return `M${c},${c - r - 1}L${c + r + 1},${c + r}H${c - r - 1}z`;
  if (prio === 3) return `M${c - r - 1},${c - r}H${c + r + 1}L${c},${c + r + 1}z`;
  return `M${c},${c - r - 1}L${c + r + 1},${c}L${c},${c + r + 1}L${c - r - 1},${c}z`;
}

/** An alarm indicator: 1 red square, 2 orange triangle, 3 yellow inverted triangle, 4 blue diamond. */
export function AlarmMark({
  prio,
  blink = false,
  label,
}: {
  prio: Prio;
  blink?: boolean;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`${s.mark} ${PRIO_CLASS[prio]} ${blink ? s.blink : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={markPath(prio, 8, 6)} />
      <text x={8} y={prio === 3 ? 10.2 : prio === 2 ? 13 : 11.6} textAnchor="middle">
        {prio}
      </text>
    </svg>
  );
}

/** The same mark inside a schematic. */
export function AlarmGlyph({
  x,
  y,
  prio,
  blink,
}: {
  x: number;
  y: number;
  prio: Prio;
  blink?: boolean;
}) {
  return (
    <g
      transform={`translate(${x - 8} ${y - 8})`}
      className={`${s.markG} ${PRIO_CLASS[prio]} ${blink ? s.blink : ''}`}
      aria-hidden="true"
    >
      <path d={markPath(prio, 8, 6)} />
      <text x={8} y={prio === 3 ? 10.2 : prio === 2 ? 13 : 11.6} textAnchor="middle">
        {prio}
      </text>
    </g>
  );
}

const TEXT_CLASS: Record<Prio, string> = { 1: s.ap1, 2: s.ap2, 3: s.ap3, 4: s.ap4 };

/** A value's class: plain, or boxed in its alarm's priority colour while in alarm. */
export const alarmText = (m: { prio: Prio } | null | undefined, base = s.value) =>
  m ? `${s.inAlarm} ${TEXT_CLASS[m.prio]}` : base;

/* ------------------------------------------------------------------ schematic parts */

/** A focusable, clickable group in a schematic; Enter and Space work like a click. */
export function Hit({
  label,
  onActivate,
  children,
  className,
}: {
  label: string;
  onActivate: () => void;
  children: ReactNode;
  className?: string;
}) {
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  };
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      className={`${s.hit} ${className ?? ''}`}
      onClick={onActivate}
      onKeyDown={onKey}
    >
      <title>{label}</title>
      {children}
    </g>
  );
}

export function Vessel({
  x,
  y,
  w,
  h,
  level,
  open,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  open?: boolean;
}) {
  const lv = Math.max(0, Math.min(1, level));
  const ly = y + h - 4 - (h - 8) * lv;
  return (
    <g>
      <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx={10} className={s.focusRing} />
      <rect x={x} y={y} width={w} height={h} rx={Math.min(10, w / 5)} className={s.vessel} />
      <rect x={x + 4} y={ly} width={w - 8} height={y + h - 4 - ly} rx={2} className={s.level} />
      <line x1={x + 4} x2={x + w - 4} y1={ly} y2={ly} className={s.levelTop} />
      {open && <path d={`M${x + w / 2 - 5},${y + 5}h10l-5,7z`} className={s.fillArrow} />}
    </g>
  );
}

export function Pump({
  cx,
  cy,
  r = 10,
  state,
  dir = 1,
}: {
  cx: number;
  cy: number;
  r?: number;
  state: PumpState;
  dir?: 1 | -1;
}) {
  const t = r * 0.55;
  const cls = state === 'RUN' ? s.on : state === 'START' ? s.travel : s.off;
  return (
    <g className={`${s.pump} ${cls}`}>
      <circle cx={cx} cy={cy} r={r + 5} className={s.focusRing} />
      <circle cx={cx} cy={cy} r={r} className={s.body} />
      <path
        d={`M${cx - dir * t * 0.8},${cy - t}L${cx + dir * t},${cy}L${cx - dir * t * 0.8},${cy + t}z`}
        className={s.glyph}
      />
    </g>
  );
}

/** A bow-tie valve. `pos` is 0–100; between the limit switches it shows half filled (travelling). */
export function Valve({
  cx,
  cy,
  sz = 8,
  pos,
  vertical = false,
  control = false,
}: {
  cx: number;
  cy: number;
  sz?: number;
  pos: number;
  vertical?: boolean;
  control?: boolean;
}) {
  const cls = pos >= 99.5 ? s.on : pos <= 0.5 ? s.off : s.travel;
  const k = sz * 0.75;
  const a = vertical
    ? `M${cx - k},${cy - sz}H${cx + k}L${cx},${cy}z`
    : `M${cx - sz},${cy - k}V${cy + k}L${cx},${cy}z`;
  const b = vertical
    ? `M${cx - k},${cy + sz}H${cx + k}L${cx},${cy}z`
    : `M${cx + sz},${cy - k}V${cy + k}L${cx},${cy}z`;
  return (
    <g className={`${s.valve} ${cls}`}>
      <rect
        x={cx - sz - 5}
        y={cy - sz - (control ? 16 : 5)}
        width={2 * sz + 10}
        height={2 * sz + (control ? 21 : 10)}
        rx={4}
        className={s.focusRing}
      />
      {control && (
        <>
          <line x1={cx} x2={cx} y1={cy} y2={cy - sz - 4} className={s.stem} />
          <path
            d={`M${cx - sz},${cy - sz - 4}a${sz},${sz * 0.9} 0 0 1 ${2 * sz},0z`}
            className={s.body}
          />
        </>
      )}
      <path d={a} className={s.half1} />
      <path d={b} className={s.half2} />
    </g>
  );
}

/** An ISA instrument bubble; `shared` draws the square of a shared (DCS) display. */
export function Bubble({
  cx,
  cy,
  fn,
  loop,
  shared = false,
  r = 17,
}: {
  cx: number;
  cy: number;
  fn: string;
  loop: string;
  shared?: boolean;
  r?: number;
}) {
  return (
    <g className={s.bubble}>
      <rect
        x={cx - r - 5}
        y={cy - r - 5}
        width={2 * r + 10}
        height={2 * r + 10}
        rx={6}
        className={s.focusRing}
      />
      {shared && (
        <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} className={s.bubbleBox} />
      )}
      <circle cx={cx} cy={cy} r={r} className={s.bubbleBody} />
      <line x1={cx - r} x2={cx + r} y1={cy} y2={cy} className={s.bubbleLine} />
      <text x={cx} y={cy - 4} textAnchor="middle" className={s.bubbleFn}>
        {fn}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" className={s.bubbleNo}>
        {loop}
      </text>
    </g>
  );
}

/** An off-page connector: the pentagon that links one display to the next. */
export function Connector({
  x,
  y,
  w = 92,
  label,
  sub,
  dir = 1,
}: {
  x: number;
  y: number;
  w?: number;
  label: string;
  sub?: string;
  dir?: 1 | -1;
}) {
  const h = 26;
  const d =
    dir === 1
      ? `M${x},${y - h / 2}h${w - 12}l12,${h / 2}l-12,${h / 2}h${-(w - 12)}z`
      : `M${x + w},${y - h / 2}h${-(w - 12)}l-12,${h / 2}l12,${h / 2}h${w - 12}z`;
  return (
    <g className={s.connector}>
      <rect
        x={x - 4}
        y={y - h / 2 - 4}
        width={w + 8}
        height={h + 8}
        rx={4}
        className={s.focusRing}
      />
      <path d={d} className={s.connBody} />
      <text
        x={x + w / 2 + (dir === 1 ? -5 : 5)}
        y={y + (sub ? -1 : 4)}
        textAnchor="middle"
        className={s.connText}
      >
        {label}
      </text>
      {sub && (
        <text
          x={x + w / 2 + (dir === 1 ? -5 : 5)}
          y={y + 9}
          textAnchor="middle"
          className={s.connSub}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

/** A process line; the moving dashes show flow and stop when it does. */
export function Pipe({
  d,
  flow = 0,
  nominal = 1,
  signal = false,
}: {
  d: string;
  flow?: number;
  nominal?: number;
  signal?: boolean;
}) {
  if (signal) return <path d={d} className={s.signal} />;
  const rate = Math.max(0, flow / nominal);
  // Quantised, so noise doesn't restart the animation every frame.
  const dur = rate < 0.05 ? 0 : Math.round(10 / Math.min(1.6, rate)) / 10;
  return (
    <g>
      <path d={d} className={s.pipe} />
      {dur > 0 && <path d={d} className={s.flow} style={{ animationDuration: `${dur * 1.6}s` }} />}
    </g>
  );
}

/* ------------------------------------------------------------------ analog indicator */

export interface Limits {
  hh?: number;
  h?: number;
  l?: number;
  ll?: number;
}

/**
 * A moving analog indicator: the range as a track, the normal band shaded, limits as ticks and
 * the value as a pointer. Out of normal, the pointer takes the alarm's colour and mark.
 */
export function Analog({
  value,
  lo,
  hi,
  normal,
  limits,
  sp,
  alarm,
  label,
  compact = false,
}: {
  value: number;
  lo: number;
  hi: number;
  normal?: [number, number];
  limits?: Limits;
  sp?: number;
  alarm?: { prio: Prio; blink: boolean } | null;
  label: string;
  compact?: boolean;
}) {
  const pct = (v: number) =>
    `${(100 * Math.max(0, Math.min(1, (v - lo) / (hi - lo)))).toFixed(2)}%`;
  return (
    <span
      className={`${s.analog} ${compact ? s.analogCompact : ''} ${alarm ? PRIO_CLASS[alarm.prio] : ''}`}
      role="meter"
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuemin={lo}
      aria-valuemax={hi}
      aria-label={label}
    >
      <span className={s.track}>
        {normal && (
          <span
            className={s.band}
            style={{ left: pct(normal[0]), width: `calc(${pct(normal[1])} - ${pct(normal[0])})` }}
          />
        )}
        {limits &&
          (Object.entries(limits) as [keyof Limits, number | undefined][]).map(([k, v]) =>
            v === undefined ? null : (
              <span
                key={k}
                className={`${s.tick} ${k === 'hh' || k === 'll' ? s.tickHard : ''}`}
                style={{ left: pct(v) }}
              />
            ),
          )}
        {sp !== undefined && <span className={s.spMark} style={{ left: pct(sp) }} />}
        <span className={s.pointer} style={{ left: pct(value) }} />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ trends */

export interface Colors {
  ink: string;
  muted: string;
  grid: string;
  band: string;
  pens: string[];
  bg: string;
  p1: string;
  p2: string;
}

export function readColors(el: Element): Colors {
  return {
    ink: token(el, '--ink'),
    muted: token(el, '--muted'),
    grid: token(el, '--grid'),
    band: token(el, '--band'),
    bg: token(el, '--panel'),
    p1: token(el, '--p1'),
    p2: token(el, '--p2'),
    pens: [1, 2, 3, 4, 5, 6].map((k) => token(el, `--pen${k}`)),
  };
}

/** A canvas sized to its box at the device's pixel ratio, repainted when `stamp` or the scheme changes. */
export function useCanvas(
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number, c: Colors) => void,
  stamp: unknown,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scheme = useScheme();
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Canvas state outlives a paint; start each one clean.
      ctx.textAlign = 'left';
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      paintRef.current(ctx, w, h, readColors(canvas));
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [stamp, scheme]);
  return ref;
}

/** The last `seconds` of a pen from the live ring, oldest first. */
export function recent(plant: Plant, pen: string, seconds: number) {
  const i = PENS.findIndex((p) => p.id === pen);
  const n = Math.min(plant.head, Math.round(seconds / SAMPLE), RING);
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = plant.ring[i][(plant.head - n + k) % RING];
  return out;
}

/** A small live trend: SP dashed, PV solid, OUT thin on its own 0–100 % scale. */
export function MiniTrend({
  plant,
  tag,
  lo,
  hi,
  normal,
  seconds = 120,
  stamp,
  label,
  out = true,
}: {
  plant: Plant;
  tag: string;
  lo: number;
  hi: number;
  normal?: [number, number];
  seconds?: number;
  stamp: number;
  label: string;
  out?: boolean;
}) {
  const ref = useCanvas((ctx, w, h, c) => {
    const n = Math.round(seconds / SAMPLE);
    const x = (k: number, len: number) => w - ((len - 1 - k) / (n - 1)) * w;
    const y = (v: number, a = lo, b = hi) => h - 3 - ((v - a) / (b - a)) * (h - 6);
    if (normal) {
      ctx.fillStyle = c.band;
      ctx.fillRect(0, y(normal[1]), w, y(normal[0]) - y(normal[1]));
    }
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo((w * k) / 4 + 0.5, 0);
      ctx.lineTo((w * k) / 4 + 0.5, h);
      ctx.stroke();
    }
    const line = (
      data: Float32Array,
      color: string,
      width: number,
      dash: number[],
      a?: number,
      b?: number,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let pen = false;
      data.forEach((v, k) => {
        if (!Number.isFinite(v)) return void (pen = false);
        const px = x(k, data.length);
        const py = y(v, a, b);
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (out && tag.includes('IC-'))
      line(recent(plant, `${tag}.OUT`, seconds), c.pens[2], 1, [], 0, 100);
    if (tag.includes('IC-')) line(recent(plant, `${tag}.SP`, seconds), c.pens[1], 1.25, [4, 3]);
    line(recent(plant, tag.includes('IC-') ? `${tag}.PV` : tag, seconds), c.pens[0], 1.6, []);
  }, stamp);
  return <canvas ref={ref} className={s.mini} role="img" aria-label={label} />;
}
