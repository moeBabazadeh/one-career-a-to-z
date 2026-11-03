// The production graph: items per minute over the last one or ten game minutes, one line per
// item, with a crosshair that reads out every line at once.

import { ITEMS, shade, type ItemId } from './items';
import { HIST, type Factory } from './sim';
import { C, fmtRate } from './draw';

export interface Size {
  W: number;
  H: number;
}

export const CHART = { wide: { W: 640, H: 270 }, tall: { W: 360, H: 240 } };
const PAD = { L: 38, R: 10, T: 14, B: 22 };
export const POINTS = 61;

export type Span = 60 | 600;

/** The rate behind every point: a trailing window with a smooth bump of weights, so slow
 *  products read as a line rather than a saw. */
const WINDOW: Record<Span, number> = { 60: 36, 600: 120 };

/** Per-minute rates of an item at each point of the span, oldest first. */
export function seriesOf(f: Factory, id: ItemId, span: Span): number[] {
  const step = span / (POINTS - 1);
  const win = WINDOW[span];
  const out: number[] = [];
  const data = f.prod[id];
  for (let p = 0; p < POINTS; p++) {
    const end = f.sec - Math.round((POINTS - 1 - p) * step); // exclusive
    let sum = 0,
      weight = 0;
    for (let k = 1; k <= win; k++) {
      const s = end - k;
      if (s < 0) break;
      const w = Math.sin((Math.PI * k) / (win + 1));
      sum += data[s % HIST] * w;
      weight += w;
    }
    out.push(weight ? (sum * 60) / weight : NaN);
  }
  return out;
}

/** A top for the axis that splits into four round steps. */
function niceMax(v: number) {
  if (v <= 0) return 8;
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= raw) ?? 10) * p;
  return step * 4;
}

export const xAt = ({ W }: Size, p: number) => PAD.L + (p / (POINTS - 1)) * (W - PAD.L - PAD.R);
export const pointAt = ({ W }: Size, x: number) =>
  x < PAD.L - 6
    ? null
    : Math.max(
        0,
        Math.min(POINTS - 1, Math.round(((x - PAD.L) / (W - PAD.L - PAD.R)) * (POINTS - 1))),
      );

export function drawChart(
  ctx: CanvasRenderingContext2D,
  f: Factory,
  items: ItemId[],
  span: Span,
  hover: number | null,
  size: Size,
  mono: string,
  focus: ItemId | null,
) {
  const { W, H } = size;
  ctx.clearRect(0, 0, W, H);
  const data = items.map((id) => [id, seriesOf(f, id, span)] as const);
  const max = niceMax(
    Math.max(8, ...data.flatMap(([, s]) => s.filter((v) => !Number.isNaN(v)))) * 1.08,
  );
  const y = (v: number) => H - PAD.B - (v / max) * (H - PAD.B - PAD.T);
  const font = (px: number, w = 500) => `${w} ${px}px ${mono}`;
  // On a light panel the lighter item colours need some depth to read as lines.
  const deepen = Number(C.chartShade);
  const ink = Object.fromEntries(
    items.map((id) => [id, deepen ? shade(ITEMS[id].color, deepen) : ITEMS[id].color]),
  ) as Record<ItemId, string>;

  // grid
  ctx.font = font(9.5);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.lineWidth = 1;
  for (const k of [0, 0.25, 0.5, 0.75, 1]) {
    const yy = Math.round(y(max * k)) + 0.5;
    ctx.strokeStyle = k ? C.chartGrid : C.chartAxis;
    ctx.beginPath();
    ctx.moveTo(PAD.L, yy);
    ctx.lineTo(W - PAD.R, yy);
    ctx.stroke();
    ctx.fillStyle = C.dim;
    ctx.fillText(fmtRate(max * k), PAD.L - 6, yy);
  }
  ctx.textAlign = 'center';
  const marks =
    span === 60
      ? ['-60s', '-45s', '-30s', '-15s', 'now']
      : ['-10m', '-7.5m', '-5m', '-2.5m', 'now'];
  marks.forEach((m, k) => {
    const x = xAt(size, (k / 4) * (POINTS - 1));
    ctx.fillStyle = C.dim;
    ctx.fillText(m, Math.min(W - PAD.R - 12, Math.max(PAD.L + 10, x)), H - 9);
    ctx.strokeStyle = C.chartTick;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, PAD.T);
    ctx.lineTo(Math.round(x) + 0.5, H - PAD.B);
    ctx.stroke();
  });

  // lines, the focused one last and thicker
  const order = [...data].sort(([a], [b]) => (a === focus ? 1 : b === focus ? -1 : 0));
  for (const [id, s] of order) {
    ctx.strokeStyle = ink[id];
    ctx.globalAlpha = focus && id !== focus ? 0.35 : 1;
    ctx.lineWidth = id === focus ? 2.6 : 1.7;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    s.forEach((v, p) => {
      if (Number.isNaN(v)) return;
      if (started) ctx.lineTo(xAt(size, p), y(v));
      else ctx.moveTo(xAt(size, p), y(v));
      started = true;
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // crosshair
  if (hover != null) {
    const x = Math.round(xAt(size, hover)) + 0.5;
    ctx.strokeStyle = C.chartCross;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, PAD.T);
    ctx.lineTo(x, H - PAD.B);
    ctx.stroke();
    ctx.setLineDash([]);
    const rows = data
      .map(([id, s]) => [id, s[hover]] as const)
      .filter(([, v]) => !Number.isNaN(v))
      .sort((a, b) => b[1] - a[1]);
    for (const [id, v] of rows) {
      ctx.fillStyle = ink[id];
      ctx.beginPath();
      ctx.arc(x, y(v), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (rows.length) {
      ctx.font = font(10);
      const lines = rows
        .slice(0, 8)
        .map(([id, v]) => `${fmtRate(v).padStart(4)}/m  ${ITEMS[id].name}`);
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22;
      const bh = lines.length * 15 + 10;
      const bx = x + bw + 12 > W - PAD.R ? x - bw - 10 : x + 10;
      ctx.fillStyle = C.chartTip;
      ctx.strokeStyle = C.chartTipLine;
      ctx.beginPath();
      ctx.roundRect(bx, PAD.T, bw, bh, 4);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      lines.forEach((l, k) => {
        ctx.fillStyle = ink[rows[k][0]];
        ctx.fillRect(bx + 8, PAD.T + 10 + k * 15, 6, 6);
        ctx.fillStyle = C.text;
        ctx.fillText(l, bx + 18, PAD.T + 13.5 + k * 15);
      });
    }
  }
}
