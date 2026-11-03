// Time-series panels for the Load Test concept. Each draws the last 60 s of samples in a
// fixed logical space, with a legend that reads out the latest values, or the values under
// the shared crosshair when the pointer is over any panel.

import {
  BOOTING,
  DEAD,
  LOAD_ROWS,
  OFF,
  SLO,
  WINDOW,
  errRate,
  fmt,
  fmtMs,
  pct,
  type Sample,
} from './sim';
import { C, type Ink } from './topology';

export interface Size {
  W: number;
  H: number;
}

// Logical sizes: phones get their own, so the text stays readable at 360 px.
export const PANEL = { wide: { W: 460, H: 200 }, tall: { W: 360, H: 196 } };
export const HEAT = { wide: { W: 640, H: 250 }, tall: { W: 360, H: 290 } };
export const PAD = { L: 46, R: 12, T: 34, B: 22 };

const MONO = '"DM Mono", ui-monospace, Menlo, monospace';
const font = (px: number, weight = 400) => `${weight} ${px}px ${MONO}`;
const LAT: Record<'p50' | 'p95' | 'p99', Ink> = { p50: 'blue', p95: 'job', p99: 'pink' };
const CODES: Record<'e502' | 'e503' | 'e504', Ink> = { e502: 'err', e503: 'warn', e504: 'job' };

/** The sample under the crosshair, or the latest one. */
const pick = (data: Sample[], hover: number | null) => {
  if (!data.length) return undefined;
  if (hover == null) return data[data.length - 1];
  const k = hover - (WINDOW - data.length);
  return k >= 0 ? data[k] : undefined;
};

const xAt = (W: number, i: number) => PAD.L + (i / (WINDOW - 1)) * (W - PAD.L - PAD.R);

/** The window index under a pointer at logical x on a panel, or null outside the plot. */
export const indexAt = (x: number, W: number) =>
  x < PAD.L - 4
    ? null
    : Math.max(
        0,
        Math.min(WINDOW - 1, Math.round(((x - PAD.L) / (W - PAD.L - PAD.R)) * (WINDOW - 1))),
      );

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v) ?? 10) * p;
}

function legend(ctx: CanvasRenderingContext2D, items: [string, string, boolean?][]) {
  ctx.font = font(10.5);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let x = PAD.L;
  for (const [color, text, dashed] of items) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dashed ? [3, 2] : []);
    ctx.beginPath();
    ctx.moveTo(x, 13);
    ctx.lineTo(x + 12, 13);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.text;
    ctx.fillText(text, x + 17, 13.5);
    x += ctx.measureText(text).width + 32;
  }
}

function frame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  ticks: [number, string][],
  hover: number | null,
) {
  ctx.clearRect(0, 0, W, H);
  ctx.font = font(9.5);
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'right';
  ctx.beginPath();
  for (const [y, label] of ticks) {
    ctx.moveTo(PAD.L, Math.round(y) + 0.5);
    ctx.lineTo(W - PAD.R, Math.round(y) + 0.5);
    ctx.fillText(label, PAD.L - 7, y);
  }
  ctx.stroke();
  ctx.textAlign = 'center';
  for (const [i, label] of [
    [0, '-60s'],
    [30, '-45s'],
    [60, '-30s'],
    [90, '-15s'],
    [WINDOW - 1, 'now'],
  ] as const) {
    ctx.fillText(label, Math.min(W - PAD.R - 10, xAt(W, i)), H - 9);
  }
  if (hover != null) {
    ctx.strokeStyle = C.cross;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(xAt(W, hover)) + 0.5, PAD.T - 6);
    ctx.lineTo(Math.round(xAt(W, hover)) + 0.5, H - PAD.B);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function line(
  ctx: CanvasRenderingContext2D,
  W: number,
  data: Sample[],
  y: (s: Sample) => number,
  color: string,
  width = 2,
  dash: number[] = [],
) {
  const off = WINDOW - data.length;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  data.forEach((s, k) =>
    k ? ctx.lineTo(xAt(W, off + k), y(s)) : ctx.moveTo(xAt(W, off + k), y(s)),
  );
  ctx.stroke();
  ctx.setLineDash([]);
}

function area(
  ctx: CanvasRenderingContext2D,
  W: number,
  data: Sample[],
  top: (s: Sample) => number,
  bottom: (s: Sample) => number,
  fill: string,
) {
  const off = WINDOW - data.length;
  ctx.fillStyle = fill;
  ctx.beginPath();
  data.forEach((s, k) => ctx.lineTo(xAt(W, off + k), top(s)));
  for (let k = data.length - 1; k >= 0; k--) ctx.lineTo(xAt(W, off + k), bottom(data[k]));
  ctx.closePath();
  ctx.fill();
}

function threshold(
  ctx: CanvasRenderingContext2D,
  W: number,
  y: number,
  label: string,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD.L, Math.round(y) + 0.5);
  ctx.lineTo(W - PAD.R, Math.round(y) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = font(9);
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.fillText(label, W - PAD.R - 2, y - 7);
}

/* ------------------------------------------------------------------ panels */

export function drawThroughput(
  ctx: CanvasRenderingContext2D,
  data: Sample[],
  hover: number | null,
  { W, H }: Size,
) {
  const max = niceMax(Math.max(100, ...data.map((s) => s.edge)) * 1.08);
  const y = (v: number) => H - PAD.B - (v / max) * (H - PAD.B - PAD.T);
  frame(
    ctx,
    W,
    H,
    [0, 0.5, 1].map((f) => [y(max * f), fmt(max * f)]),
    hover,
  );
  const err = (s: Sample) => s.e502 + s.e503 + s.e504;
  area(
    ctx,
    W,
    data,
    (s) => y(s.ok),
    () => y(0),
    C.okArea,
  );
  area(
    ctx,
    W,
    data,
    (s) => y(s.ok + err(s)),
    (s) => y(s.ok),
    C.errArea,
  );
  line(ctx, W, data, (s) => y(s.edge), C.edgeLine, 1.25, [3, 3]);
  line(ctx, W, data, (s) => y(s.ok), C.ok, 1.75);
  const s = pick(data, hover);
  legend(ctx, [
    [C.ok, `2xx ${fmt(s?.ok ?? 0)}/s`],
    [C.err, `5xx ${fmt(s ? err(s) : 0)}/s`],
    [C.hi, `edge ${fmt(s?.edge ?? 0)}/s`, true],
  ]);
}

const LOG = (lo: number, hi: number, H: number) => (v: number) =>
  H -
  PAD.B -
  ((Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) /
    (Math.log10(hi) - Math.log10(lo))) *
    (H - PAD.B - PAD.T);

export function drawLatency(
  ctx: CanvasRenderingContext2D,
  data: Sample[],
  hover: number | null,
  { W, H }: Size,
) {
  const y = LOG(1, 2000, H);
  frame(
    ctx,
    W,
    H,
    [
      [y(1), '1ms'],
      [y(10), '10ms'],
      [y(100), '100ms'],
      [y(1000), '1s'],
    ],
    hover,
  );
  threshold(ctx, W, y(500), 'alert · p99 500 ms', C.alert);
  for (const q of ['p50', 'p95', 'p99'] as const)
    line(ctx, W, data, (s) => y(s[q]), C[LAT[q]], q === 'p99' ? 2 : 1.6);
  const s = pick(data, hover);
  legend(
    ctx,
    (['p50', 'p95', 'p99'] as const).map((q) => [C[LAT[q]], `${q} ${s ? fmtMs(s[q]) : '–'}`]),
  );
}

export function drawErrors(
  ctx: CanvasRenderingContext2D,
  data: Sample[],
  hover: number | null,
  { W, H }: Size,
) {
  const share = (s: Sample, k: keyof typeof CODES) => {
    const n = s.ok + s.e502 + s.e503 + s.e504;
    return n ? s[k] / n : 0;
  };
  const max = Math.max(0.05, niceMax(Math.max(...data.map(errRate), 0) * 1.1));
  const y = (v: number) => H - PAD.B - (v / max) * (H - PAD.B - PAD.T);
  frame(
    ctx,
    W,
    H,
    [0, 0.5, 1].map((f) => [y(max * f), pct(max * f)]),
    hover,
  );
  const off = WINDOW - data.length;
  const bw = Math.max(1, (W - PAD.L - PAD.R) / WINDOW - 1);
  data.forEach((s, k) => {
    let acc = 0;
    for (const code of ['e502', 'e503', 'e504'] as const) {
      const v = share(s, code);
      if (!v) continue;
      ctx.fillStyle = C[CODES[code]];
      ctx.fillRect(xAt(W, off + k) - bw / 2, y(acc + v), bw, y(acc) - y(acc + v));
      acc += v;
    }
  });
  threshold(ctx, W, y(0.01), 'alert · 1%', C.alert);
  const s = pick(data, hover);
  legend(ctx, [
    [C[CODES.e502], `502 ${s ? pct(share(s, 'e502'), 1) : '–'}`],
    [C[CODES.e503], `503 ${s ? pct(share(s, 'e503'), 1) : '–'}`],
    [C[CODES.e504], `504 ${s ? pct(share(s, 'e504'), 1) : '–'}`],
  ]);
}

export function drawBurn(
  ctx: CanvasRenderingContext2D,
  data: Sample[],
  hover: number | null,
  { W, H }: Size,
) {
  const y = LOG(0.1, 200, H);
  frame(
    ctx,
    W,
    H,
    [
      [y(0.1), '0.1×'],
      [y(1), '1×'],
      [y(10), '10×'],
      [y(100), '100×'],
    ],
    hover,
  );
  ctx.fillStyle = C.burnZone;
  ctx.fillRect(PAD.L, PAD.T, W - PAD.L - PAD.R, y(14.4) - PAD.T);
  threshold(ctx, W, y(14.4), 'page · 14.4×', C.page);
  threshold(ctx, W, y(1), 'on budget · 1×', C.budget);
  area(
    ctx,
    W,
    data,
    (s) => y(Math.max(0.1, s.burn)),
    () => y(0.1),
    C.burnArea,
  );
  line(ctx, W, data, (s) => y(Math.max(0.1, s.burn)), C.blue, 1.75);
  const s = pick(data, hover);
  legend(ctx, [
    [
      C.blue,
      `burn rate (5 s) ${s ? `${s.burn < 10 ? s.burn.toFixed(1) : Math.round(s.burn)}×` : '–'} · SLO ${pct(SLO, 1)}`,
    ],
  ]);
}

/* ------------------------------------------------------------------ utilisation heatmap */

const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)),
    pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
};

export function heat(v: number) {
  if (v < 0.7) return mix(C.heat0, C.heat1, v / 0.7);
  if (v < 0.9) return mix(C.heat1, C.heat2, (v - 0.7) / 0.2);
  return mix(C.heat2, C.heat3, Math.min(1, (v - 0.9) / 0.1));
}

export const HEAT_PAD = { L: 88, R: 40, T: 8, B: 22 };

/** The heatmap column under a pointer at logical x, or null outside the grid. */
export const cellAt = (x: number, W: number) =>
  x < HEAT_PAD.L || x > W - HEAT_PAD.R
    ? null
    : Math.min(WINDOW - 1, Math.floor(((x - HEAT_PAD.L) / (W - HEAT_PAD.L - HEAT_PAD.R)) * WINDOW));

export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  data: Sample[],
  hover: number | null,
  { W, H }: Size,
) {
  const P = HEAT_PAD;
  ctx.clearRect(0, 0, W, H);
  const rows = LOAD_ROWS.length;
  const rh = (H - P.T - P.B) / rows;
  const cw = (W - P.L - P.R) / WINDOW;
  const off = WINDOW - data.length;
  const last = pick(data, hover);
  ctx.font = font(9.5);
  ctx.textBaseline = 'middle';
  LOAD_ROWS.forEach((name, r) => {
    const y = P.T + r * rh;
    const now = last?.load[r] ?? OFF;
    ctx.fillStyle = now === OFF ? C.faint : C.dim;
    ctx.textAlign = 'right';
    ctx.fillText(name, P.L - 8, y + rh / 2);
    ctx.fillStyle = C.row;
    ctx.fillRect(P.L, y + 0.5, W - P.L - P.R, rh - 1);
    data.forEach((s, k) => {
      const v = s.load[r];
      if (v === OFF) return;
      ctx.fillStyle = v === DEAD ? C.heatDead : v === BOOTING ? C.heatBoot : heat(v);
      ctx.fillRect(P.L + (off + k) * cw, y + 1, Math.ceil(cw), rh - 2);
    });
    ctx.textAlign = 'left';
    ctx.fillStyle =
      now === DEAD ? C.err : now === BOOTING ? C.blue : now === OFF ? C.faint : C.text;
    ctx.fillText(
      now === OFF ? '–' : now === DEAD ? 'down' : now === BOOTING ? 'boot' : pct(now),
      W - P.R + 6,
      y + rh / 2,
    );
  });
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'center';
  for (const [i, label] of [
    [0, '-60s'],
    [30, '-45s'],
    [60, '-30s'],
    [90, '-15s'],
    [WINDOW - 1, 'now'],
  ] as const) {
    ctx.fillText(label, Math.min(W - P.R - 10, P.L + (i + 0.5) * cw), H - 9);
  }
  if (hover != null) {
    ctx.strokeStyle = C.hi;
    ctx.lineWidth = 1;
    ctx.strokeRect(P.L + hover * cw - 0.5, P.T, Math.ceil(cw) + 1, H - P.T - P.B);
  }
}
