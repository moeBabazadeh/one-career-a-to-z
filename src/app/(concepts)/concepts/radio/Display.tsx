'use client';

// The spectrum and the waterfall. One animation loop synthesises an FFT frame of the band (see
// dsp.ts), averages it into the spectrum trace, scrolls a row into the waterfall, asks the
// decoder what the VFO is on, and hands it any frames that went out while it was locked. It
// runs only while the display is on screen and the receiver is running, and holds a still,
// fully drawn picture for reduced motion.
import { memo, useEffect, useRef } from 'react';
import { useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import { colormap, dbOf, synthesize } from './dsp';
import {
  BANDS,
  emitterAt,
  framesOf,
  framesStarting,
  occOf,
  stations,
  type Station,
} from './stations';
import { BW_MAX, BW_MIN, edges, evaluate, gainOf, sameLock, type Lock, type Rx } from './rx';
import type { ChapterId } from './programs';
import { emitTelemetry } from './telemetry';
import type { RadioAudio } from './audio';
import { hz, niceStep, sUnits, tick } from './units';
import s from './radio.module.scss';

export interface DisplayApi {
  tune: (f: number, snap: boolean) => void;
  pan: (center: number) => void;
  setBw: (bw: number) => void;
  zoomAt: (dir: number, anchor: number) => void;
  goStation: (id: ChapterId, freq?: number) => void;
  onLock: (lock: Lock) => void;
  onFrames: (id: ChapterId, freq: number, abs: number[]) => void;
}

interface Props {
  rx: Rx;
  api: DisplayApi;
  audio: React.RefObject<RadioAudio | null>;
}

const BAND_H = 18;
const AXIS_H = 20;

interface Colors {
  scr: string;
  grid: string;
  gridStrong: string;
  axis: string;
  trace: string;
  traceFill: string;
  peak: string;
  vfo: string;
  filter: string;
  filterEdge: string;
  band: string;
  bandInk: string;
  flag: string;
  flagInk: string;
  flagOn: string;
  flagOnInk: string;
  alert: string;
  stamp: string;
  lut: Uint8ClampedArray;
}

function readColors(el: Element): Colors {
  const t = (n: string) => token(el, n);
  return {
    scr: t('--scr'),
    grid: t('--scr-grid'),
    gridStrong: t('--scr-grid-2'),
    axis: t('--scr-axis'),
    trace: t('--trace'),
    traceFill: t('--trace-fill'),
    peak: t('--peak'),
    vfo: t('--vfo'),
    filter: t('--filter'),
    filterEdge: t('--filter-edge'),
    band: t('--band'),
    bandInk: t('--band-ink'),
    flag: t('--flag'),
    flagInk: t('--flag-ink'),
    flagOn: t('--lock'),
    flagOnInk: t('--on-lock'),
    alert: t('--alert'),
    stamp: t('--scr-axis'),
    lut: colormap([0, 1, 2, 3, 4, 5, 6].map((i) => t(`--wf${i}`))),
  };
}

interface Flag {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  id: ChapterId;
  f: number;
}

interface Engine {
  t: number;
  bins: Float32Array;
  avg: Float32Array;
  peak: Float32Array;
  px: Float32Array;
  view: { center: number; span: number; fft: number };
  colors: Colors | null;
  w: number;
  hs: number;
  hw: number;
  dpr: number;
  row: ImageData | null;
  tmp: HTMLCanvasElement | null;
  floor: number;
  lock: Lock | null;
  ovlUntil: number;
  overloaded: boolean;
  flags: Flag[];
  stamp: number;
  tele: number;
  /** Instantaneous channel power, dBFS, for the meter. */
  chan: number;
  /** Stations already handed over whole, for reduced motion. */
  dumped: Set<string>;
  fps: number;
}

const newEngine = (): Engine => ({
  t: 30,
  bins: new Float32Array(0),
  avg: new Float32Array(0),
  peak: new Float32Array(0),
  px: new Float32Array(0),
  view: { center: 0, span: 0, fft: 0 },
  colors: null,
  w: 0,
  hs: 0,
  hw: 0,
  dpr: 1,
  row: null,
  tmp: null,
  floor: -110,
  lock: null,
  ovlUntil: 0,
  overloaded: false,
  flags: [],
  stamp: -1,
  tele: 0,
  chan: -120,
  dumped: new Set(),
  fps: 0,
});

/** The noise floor: the 30th percentile of a sample of the bins. */
function floorOf(bins: Float32Array) {
  const sample: number[] = [];
  for (let i = 0; i < bins.length; i += Math.max(1, bins.length >> 7)) sample.push(bins[i]);
  sample.sort((x, y) => x - y);
  return sample[Math.floor(sample.length * 0.3)];
}

/** Max-hold decimation of the FFT bins onto `n` columns. */
function columns(src: Float32Array, out: Float32Array, n: number) {
  const m = src.length;
  for (let x = 0; x < n; x++) {
    const a = Math.floor((x * m) / n);
    const b = Math.max(a + 1, Math.floor(((x + 1) * m) / n));
    let v = -300;
    for (let i = a; i < b; i++) if (src[i] > v) v = src[i];
    out[x] = v;
  }
}

function Display({ rx, api, audio }: Props) {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.01);
  const spec = useRef<HTMLCanvasElement>(null);
  const wf = useRef<HTMLCanvasElement>(null);
  const passEl = useRef<HTMLDivElement>(null);
  const vfoEl = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const hair = useRef<HTMLDivElement>(null);
  const live = useRef({ rx, api, reduced });
  const eng = useRef<Engine | null>(null);
  /** Draws one frame: `dt` seconds of air, or 0 to redraw what's there. */
  const frameRef = useRef<(dt: number) => void>(() => {});

  useEffect(() => {
    live.current = { rx, api, reduced };
  });

  // The engine, its sizing, and the frame routine.
  useEffect(() => {
    const e = (eng.current ??= newEngine());
    const box = wrap.current;
    const sc = spec.current;
    const wc = wf.current;
    if (!box || !sc || !wc) return;

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(sc.clientWidth));
      const hs = Math.max(1, Math.round(sc.clientHeight));
      const hw = Math.max(1, Math.round(wc.clientHeight));
      if (w === e.w && hs === e.hs && hw === e.hw && dpr === e.dpr) return;
      const old =
        e.w && wc.width
          ? (() => {
              const c = document.createElement('canvas');
              c.width = wc.width;
              c.height = wc.height;
              c.getContext('2d')?.drawImage(wc, 0, 0);
              return c;
            })()
          : null;
      Object.assign(e, { w, hs, hw, dpr });
      sc.width = Math.round(w * dpr);
      sc.height = Math.round(hs * dpr);
      wc.width = Math.round(w * dpr);
      wc.height = Math.round(hw * dpr);
      e.row = new ImageData(wc.width, Math.max(1, Math.round(dpr)));
      e.px = new Float32Array(wc.width);
      const ctx = wc.getContext('2d');
      if (ctx && old) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          old,
          0,
          0,
          old.width,
          old.height,
          0,
          0,
          wc.width,
          Math.min(wc.height, old.height * (wc.width / old.width)),
        );
      } else if (ctx) prefill();
      frameRef.current(0);
    };

    /** Fills the waterfall with history in one pass, so it never starts blank. */
    const prefill = () => {
      const { rx: r } = live.current;
      if (!e.colors) e.colors = readColors(box);
      const ctx = wc.getContext('2d');
      if (!ctx || !wc.width || !wc.height) return;
      const W = wc.width,
        H = wc.height;
      const img = ctx.createImageData(W, H);
      const bins = new Float32Array(Math.min(2048, r.fft));
      const cols = new Float32Array(W);
      const gain = gainOf(r);
      const fe = { center: r.center, span: r.span, gain, dc: r.dc };
      // Prefill bins are wider than the live FFT's, so their floor sits higher: take it back off.
      const adj = 10 * Math.log10(r.fft / bins.length);
      synthesize(bins, fe, e.t - 1 / 60, e.t, true);
      e.floor = floorOf(bins) - adj;
      const { wfLo, wfSpan } = range(r);
      const lut = e.colors.lut;
      const per = Math.max(1, Math.round(e.dpr));
      for (let row = 0; row * per < H; row++) {
        const t = e.t - row / 60;
        synthesize(bins, fe, t - 1 / 60, t, r.running);
        columns(bins, cols, W);
        for (let x = 0; x < W; x++) {
          const v =
            Math.max(0, Math.min(255, Math.round(((cols[x] - adj - wfLo) / wfSpan) * 255))) * 4;
          for (let y = row * per; y < Math.min(H, (row + 1) * per); y++) {
            const o = (y * W + x) * 4;
            img.data[o] = lut[v];
            img.data[o + 1] = lut[v + 1];
            img.data[o + 2] = lut[v + 2];
            img.data[o + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    /** One frame: synthesise, average, draw. `scroll` adds a waterfall row. */
    const step = (dt: number, scroll: boolean, draw = true) => {
      const { rx: r, api: a, reduced: still } = live.current;
      if (!e.colors) e.colors = readColors(box);
      const c = e.colors;
      const gain = gainOf(r);
      const n = r.fft;
      if (e.bins.length !== n) {
        e.bins = new Float32Array(n).fill(-140);
        e.avg = new Float32Array(n).fill(-140);
        e.peak = new Float32Array(n).fill(-300);
      }

      // A new view: carry the waterfall across by scaling and shifting what's already drawn.
      if (e.view.center !== r.center || e.view.span !== r.span) {
        const old = e.view;
        e.view = { center: r.center, span: r.span, fft: n };
        e.avg.fill(-140);
        e.peak.fill(-300);
        if (old.span && still) prefill();
        else if (old.span) reproject(old.center, old.span, r.center, r.span);
      }

      const fresh = dt > 0 && r.running;
      if (fresh) {
        const st = synthesize(
          e.bins,
          { center: r.center, span: r.span, gain, dc: r.dc },
          e.t - dt,
          e.t,
          true,
        );
        if (st.overload) e.ovlUntil = e.t + 0.6;
        // Exponential averaging in linear power, then peak hold.
        const k = r.avg;
        for (let i = 0; i < n; i++) {
          const lin = k * 10 ** (e.avg[i] / 10) + (1 - k) * 10 ** (e.bins[i] / 10);
          e.avg[i] = k ? dbOf(lin) : e.bins[i];
          if (e.avg[i] > e.peak[i]) e.peak[i] = e.avg[i];
          else e.peak[i] -= dt * 1.5;
        }
        // The noise floor for auto range: a low percentile of this frame, smoothed.
        e.floor = e.floor * 0.95 + floorOf(e.bins) * 0.05;
      } else if (dt > 0 && !r.running) {
        // Stopped: the picture holds.
      } else if (!e.bins.some((v) => v > -140)) {
        synthesize(
          e.bins,
          { center: r.center, span: r.span, gain, dc: r.dc },
          e.t - 1 / 60,
          e.t,
          true,
        );
        e.avg.set(e.bins);
      }
      e.overloaded = e.t < e.ovlUntil;

      if (fresh && scroll) drawRow(r);
      if (!draw) return;
      drawSpectrum(r, c);
      placeOverlay(r);

      // The decoder.
      const lock = evaluate(r, e.overloaded);
      if (!e.lock || !sameLock(lock, e.lock)) {
        e.lock = lock;
        a.onLock(lock);
      }
      if (lock.status === 'locked' && lock.station) {
        const st = stations.find((x) => x.id === lock.station) as Station;
        if (still) {
          const key = `${st.id}:${lock.freq}`;
          if (!e.dumped.has(key)) {
            e.dumped.add(key);
            a.onFrames(
              st.id,
              lock.freq,
              Array.from({ length: framesOf(st.id) }, (_, i) => i),
            );
          }
        } else if (fresh) {
          const abs = framesStarting(st, e.t - dt, e.t);
          if (abs.length) {
            a.onFrames(st.id, lock.freq, abs);
            audio.current?.blip(st.proto);
          }
        }
      }

      // Meters and sound, ten times a second.
      if (e.t - e.tele > 0.1 || dt === 0) {
        e.tele = e.t;
        const [lo, hi] = edges(r.mode, r.vfo, r.bw);
        const rbw = r.span / n;
        const i0 = Math.max(0, Math.floor((lo - (r.center - r.span / 2)) / rbw));
        const i1 = Math.min(n - 1, Math.ceil((hi - (r.center - r.span / 2)) / rbw));
        let sum = 0;
        for (let i = i0; i <= i1; i++) sum += 10 ** (e.bins[i] / 10);
        const chan = i1 >= i0 ? dbOf(sum) : -150;
        e.chan = chan;
        const dbm = chan - gain + 20;
        emitTelemetry({
          chan,
          dbm,
          s: sUnits(dbm, r.vfo),
          snr: lock.snr,
          gain,
          overload: e.overloaded,
          squelched: r.sql && lock.level < r.sqlLevel,
          fps: fresh ? e.fps : 0,
        });
        audio.current?.update(r, lock, chan, e.overloaded);
      }
    };

    const reproject = (oc: number, os: number, nc: number, ns: number) => {
      const ctx = wc.getContext('2d');
      if (!ctx || !e.colors) return;
      const W = wc.width,
        H = wc.height;
      const scale = os / ns;
      const dx = W / 2 - (W / 2) * scale + ((oc - nc) / ns) * W;
      const floor = e.colors.lut;
      ctx.save();
      if (scale > 64 || scale < 1 / 64 || Math.abs(dx) > W * 3) {
        ctx.restore();
        prefill();
        return;
      }
      const tmp = (e.tmp ??= document.createElement('canvas'));
      tmp.width = W;
      tmp.height = H;
      tmp.getContext('2d')?.drawImage(wc, 0, 0);
      ctx.fillStyle = `rgb(${floor[0]},${floor[1]},${floor[2]})`;
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = scale < 1;
      ctx.drawImage(tmp, 0, 0, W, H, dx, 0, W * scale, H);
      ctx.restore();
    };

    const range = (r: Rx) => {
      if (r.autoRange) {
        const bottom = e.floor - 12;
        return {
          top: bottom + r.range,
          bottom,
          wfLo: e.floor - 4,
          wfSpan: Math.max(30, r.range * 0.62),
        };
      }
      return { top: r.ref, bottom: r.ref - r.range, wfLo: r.ref - r.range, wfSpan: r.range * 0.8 };
    };

    const drawRow = (r: Rx) => {
      const ctx = wc.getContext('2d');
      if (!ctx || !e.row || !e.colors) return;
      const W = wc.width,
        H = wc.height;
      const rows = e.row.height;
      ctx.drawImage(wc, 0, 0, W, H - rows, 0, rows, W, H - rows);
      columns(e.bins, e.px, W);
      const { wfLo, wfSpan } = range(r);
      const lut = e.colors.lut;
      const d = e.row.data;
      for (let x = 0; x < W; x++) {
        const v = Math.max(0, Math.min(255, Math.round(((e.px[x] - wfLo) / wfSpan) * 255))) * 4;
        for (let y = 0; y < rows; y++) {
          const o = (y * W + x) * 4;
          d[o] = lut[v];
          d[o + 1] = lut[v + 1];
          d[o + 2] = lut[v + 2];
          d[o + 3] = 255;
        }
      }
      ctx.putImageData(e.row, 0, 0);
      // A time mark every five seconds, as the row it was drawn on scrolls down.
      const mark = Math.floor(e.t / 5);
      if (mark !== e.stamp && !live.current.reduced) {
        e.stamp = mark;
        const now = new Date();
        const p = (x: number) => String(x).padStart(2, '0');
        ctx.fillStyle = e.colors.stamp;
        ctx.fillRect(0, 0, 6 * e.dpr, 1 * e.dpr);
        ctx.font = `${9 * e.dpr}px ui-monospace, monospace`;
        ctx.textBaseline = 'top';
        ctx.fillText(
          `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`,
          8 * e.dpr,
          1 * e.dpr,
        );
      }
    };

    const drawSpectrum = (r: Rx, c: Colors) => {
      const ctx = sc.getContext('2d');
      if (!ctx) return;
      const W = e.w,
        H = e.hs,
        dpr = e.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = c.scr;
      ctx.fillRect(0, 0, W, H);
      const top = BAND_H,
        bottom = H - AXIS_H,
        ph = bottom - top;
      const lo = r.center - r.span / 2;
      const fx = (f: number) => ((f - lo) / r.span) * W;
      const { top: dbTop, bottom: dbBot } = range(r);
      const fy = (db: number) =>
        top + Math.max(0, Math.min(1, (dbTop - db) / (dbTop - dbBot))) * ph;

      // Band plan.
      ctx.font = '600 10px var(--font-rh-text), system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      for (const b of BANDS) {
        const x0 = fx(b.lo),
          x1 = fx(b.hi);
        if (x1 < 0 || x0 > W) continue;
        const a = Math.max(0, x0),
          z = Math.min(W, x1);
        ctx.fillStyle = c.band;
        ctx.fillRect(a, 3, Math.max(2, z - a), BAND_H - 6);
        const label = b.name;
        const tw = ctx.measureText(label).width;
        if (z - a > tw + 10) {
          ctx.fillStyle = c.bandInk;
          ctx.fillText(label, a + 5, BAND_H / 2);
        }
      }

      // Graticule: dB rows and frequency columns.
      ctx.lineWidth = 1;
      ctx.font = '10px var(--font-rh-mono), ui-monospace, monospace';
      const dbStep = (dbTop - dbBot) / ph > 0.4 ? 20 : 10;
      ctx.textBaseline = 'bottom';
      let unit = true;
      for (let db = Math.floor(dbTop / dbStep) * dbStep; db >= dbBot; db -= dbStep) {
        const y = Math.round(fy(db)) + 0.5;
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.fillStyle = c.axis;
        if (y > top + 12 && y < bottom - 4) {
          // The unit rides on the top label.
          ctx.fillText(unit ? `${db} dBFS` : `${db}`, 4, y - 2);
          unit = false;
        }
      }
      const fstep = niceStep(r.span, Math.max(3, W / 110));
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (let f = Math.ceil(lo / fstep) * fstep; f <= lo + r.span; f += fstep) {
        const x = Math.round(fx(f)) + 0.5;
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.fillStyle = c.axis;
        if (x > 22 && x < W - 22) ctx.fillText(tick(f, fstep), x, bottom + AXIS_H / 2);
      }
      ctx.textAlign = 'right';
      ctx.fillText('MHz', W - 4, bottom + AXIS_H / 2);
      ctx.textAlign = 'left';
      ctx.strokeStyle = c.gridStrong;
      ctx.beginPath();
      ctx.moveTo(0, bottom + 0.5);
      ctx.lineTo(W, bottom + 0.5);
      ctx.stroke();

      // Filter passband, under the trace.
      const [pl, phz] = edges(r.mode, r.vfo, r.bw);
      let x0 = fx(pl),
        x1 = fx(phz);
      if (x1 - x0 < 3) {
        const m = (x0 + x1) / 2;
        x0 = m - 1.5;
        x1 = m + 1.5;
      }
      ctx.fillStyle = c.filter;
      ctx.fillRect(x0, top, x1 - x0, ph);

      // Trace and peak hold.
      const cols = e.px.length >= W ? e.px.subarray(0, W) : new Float32Array(W);
      columns(e.avg, cols, W);
      ctx.beginPath();
      for (let x = 0; x < W; x++) {
        const y = fy(cols[x]);
        if (x) ctx.lineTo(x + 0.5, y);
        else ctx.moveTo(0, y);
      }
      ctx.lineTo(W, bottom);
      ctx.lineTo(0, bottom);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, c.traceFill);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      for (let x = 0; x < W; x++) {
        const y = fy(cols[x]);
        if (x) ctx.lineTo(x + 0.5, y);
        else ctx.moveTo(0, y);
      }
      ctx.strokeStyle = c.trace;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      if (r.peak) {
        columns(e.peak, cols, W);
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
          const y = fy(cols[x]);
          if (x) ctx.lineTo(x + 0.5, y);
          else ctx.moveTo(0, y);
        }
        ctx.strokeStyle = c.peak;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Filter edges with their grips, and the VFO.
      ctx.strokeStyle = c.filterEdge;
      ctx.lineWidth = 1;
      for (const x of [x0, x1]) {
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, top);
        ctx.lineTo(Math.round(x) + 0.5, bottom);
        ctx.stroke();
      }
      ctx.fillStyle = c.filterEdge;
      for (const x of [x0, x1]) ctx.fillRect(Math.round(x) - 2, top + ph * 0.5 - 9, 5, 18);
      ctx.strokeStyle = c.vfo;
      ctx.lineWidth = 1.5;
      const xv = Math.round(fx(r.vfo)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(xv, top);
      ctx.lineTo(xv, bottom);
      ctx.stroke();

      // Bookmarks, as flags along the top of the plot.
      ctx.font = '600 10px var(--font-rh-text), system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const flags: Flag[] = [];
      const rowsEnd = [-1e9, -1e9, -1e9];
      const marks = stations
        .flatMap((st) =>
          [st.freq, ...st.alts].map((f, i) => ({
            st,
            f,
            label: i ? `${st.title} ·${37 + i}` : st.title,
          })),
        )
        .filter((m) => m.f > lo && m.f < lo + r.span)
        .sort((a, b) => a.f - b.f);
      for (const m of marks) {
        const x = fx(m.f);
        const tw = ctx.measureText(m.label).width + 10;
        const fx0 = Math.min(W - tw - 2, Math.max(2, x - tw / 2));
        let row = rowsEnd.findIndex((end) => fx0 > end + 3);
        if (row < 0) row = 0;
        rowsEnd[row] = fx0 + tw;
        const y0 = top + 4 + row * 17;
        const on = e.lock?.status === 'locked' && e.lock.station === m.st.id && e.lock.freq === m.f;
        ctx.strokeStyle = on ? c.flagOn : c.flag;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, y0 + 14);
        ctx.lineTo(Math.round(x) + 0.5, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = on ? c.flagOn : c.flag;
        ctx.beginPath();
        ctx.roundRect(fx0, y0, tw, 14, 3);
        ctx.fill();
        ctx.fillStyle = on ? c.flagOnInk : c.flagInk;
        ctx.fillText(m.label, fx0 + 5, y0 + 7.5);
        flags.push({ x0: fx0, x1: fx0 + tw, y0, y1: y0 + 14, id: m.st.id, f: m.f });
      }
      e.flags = flags;

      if (e.overloaded) {
        ctx.font = '700 11px var(--font-rh-mono), ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = c.alert;
        ctx.fillText('ADC OVERLOAD', W - 8, top + 12);
        ctx.textAlign = 'left';
      }
    };

    const placeOverlay = (r: Rx) => {
      const W = e.w;
      const lo = r.center - r.span / 2;
      const [pl, phz] = edges(r.mode, r.vfo, r.bw);
      const x0 = ((pl - lo) / r.span) * W;
      const x1 = ((phz - lo) / r.span) * W;
      const xv = ((r.vfo - lo) / r.span) * W;
      if (passEl.current) {
        passEl.current.style.transform = `translateX(${x0}px)`;
        passEl.current.style.width = `${Math.max(2, x1 - x0)}px`;
      }
      if (vfoEl.current) vfoEl.current.style.transform = `translateX(${xv}px)`;
    };

    frameRef.current = (dt: number) => {
      if (!e.w) return;
      if (dt > 0) {
        e.t += dt;
        e.fps = e.fps ? e.fps * 0.92 + (1 / dt) * 0.08 : 1 / dt;
      }
      step(dt, true);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(sc);
    ro.observe(wc);
    return () => ro.disconnect();
  }, [wrap, audio]);

  // New colours when the scheme flips: the spectrum repaints at once, the waterfall as it scrolls.
  useEffect(() => {
    const e = eng.current;
    if (!e) return;
    e.colors = null;
    frameRef.current(0);
  }, [scheme]);

  const active = visible && !reduced && rx.running;

  useEffect(() => {
    if (!active) return;
    const speaker = audio;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frameRef.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      speaker.current?.mute();
    };
  }, [active, audio]);

  // While the loop is idle (stopped, off screen, reduced motion), redraw on every change.
  useEffect(() => {
    if (!active) frameRef.current(0);
  }, [rx, active]);

  /* ------------------------------------------------------------------ pointer */

  const drag = useRef<
    | { kind: 'press'; x: number; center: number; moved: boolean; id: number }
    | { kind: 'bw'; side: -1 | 1; id: number }
    | { kind: 'pinch'; d: number; span: number }
    | null
  >(null);
  const pointers = useRef(new Map<number, number>());

  const locate = (ev: React.PointerEvent | WheelEvent) => {
    const box = wrap.current as HTMLDivElement;
    const r = box.getBoundingClientRect();
    const { rx: x } = live.current;
    const px = ev.clientX - r.left;
    const py = ev.clientY - r.top;
    return {
      px,
      py,
      f: x.center - x.span / 2 + (px / r.width) * x.span,
      w: r.width,
      inSpec: py < (spec.current?.clientHeight ?? 0),
    };
  };

  const onDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    const e = eng.current;
    if (!e || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    pointers.current.set(ev.pointerId, ev.clientX);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { kind: 'pinch', d: Math.abs(a - b), span: live.current.rx.span };
      return;
    }
    const { px, py, inSpec } = locate(ev);
    const { rx: r } = live.current;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const flag = inSpec
      ? e.flags.find((g) => px >= g.x0 && px <= g.x1 && py >= g.y0 && py <= g.y1)
      : undefined;
    if (flag) {
      live.current.api.goStation(flag.id, flag.f);
      drag.current = null;
      return;
    }
    const lo = r.center - r.span / 2;
    const [pl, phz] = edges(r.mode, r.vfo, r.bw);
    const x0 = ((pl - lo) / r.span) * e.w;
    const x1 = ((phz - lo) / r.span) * e.w;
    if (inSpec && x1 - x0 > 8 && (Math.abs(px - x0) < 7 || Math.abs(px - x1) < 7)) {
      drag.current = {
        kind: 'bw',
        side: Math.abs(px - x0) < Math.abs(px - x1) ? -1 : 1,
        id: ev.pointerId,
      };
      return;
    }
    drag.current = {
      kind: 'press',
      x: ev.clientX,
      center: r.center,
      moved: false,
      id: ev.pointerId,
    };
  };

  const onMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const { rx: r, api: a } = live.current;
    const where = locate(ev);
    hover(where);
    if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, ev.clientX);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pinch') {
      const [p, q] = [...pointers.current.values()];
      const dist = Math.abs(p - q);
      if (d.d > 20 && dist > 20 && Math.abs(Math.log(dist / d.d)) > 0.35) {
        a.zoomAt(dist > d.d ? 1 : -1, r.vfo);
        d.d = dist;
      }
      return;
    }
    if (d.kind === 'bw') {
      const off = where.f - r.vfo;
      const raw = r.mode === 'USB' ? off : r.mode === 'LSB' ? -off : 2 * Math.abs(off);
      const mag = 10 ** Math.floor(Math.log10(Math.max(BW_MIN, raw)) - 1);
      a.setBw(Math.max(BW_MIN, Math.min(BW_MAX, r.span, Math.round(raw / mag) * mag)));
      return;
    }
    const dx = ev.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 4) d.moved = true;
    if (d.moved) a.pan(d.center - (dx / where.w) * r.span);
  };

  const onUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(ev.pointerId);
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'press' && !d.moved) live.current.api.tune(locate(ev).f, true);
  };

  const hover = (where: ReturnType<typeof locate>) => {
    const e = eng.current;
    const t = tip.current;
    const h = hair.current;
    if (!e || !t || !h) return;
    const { rx: r } = live.current;
    const n = e.avg.length;
    const i = Math.max(
      0,
      Math.min(n - 1, Math.floor(((where.f - (r.center - r.span / 2)) / r.span) * n)),
    );
    const em = emitterAt(where.f, (r.span / where.w) * 3);
    const near = em ? ` · ${em.label}` : '';
    t.textContent = `${hz(where.f)} · ${e.avg[i]?.toFixed(0) ?? ''} dBFS${near}`;
    t.style.transform = `translate(${Math.min(where.px + 12, where.w - t.offsetWidth - 6)}px, ${where.py + 14}px)`;
    t.dataset.on = '1';
    h.style.transform = `translateX(${where.px}px)`;
    h.dataset.on = '1';
  };
  const leave = () => {
    if (tip.current) tip.current.dataset.on = '';
    if (hair.current) hair.current.dataset.on = '';
  };

  // Wheel: pinch or ctrl-scroll zooms around the cursor; plain scroll tunes once the display has focus.
  useEffect(() => {
    const box = wrap.current;
    if (!box) return;
    let acc = 0;
    const onWheel = (ev: WheelEvent) => {
      const focused = document.activeElement === box;
      if (!ev.ctrlKey && !ev.metaKey && !focused) return;
      ev.preventDefault();
      acc += ev.deltaY;
      if (Math.abs(acc) < 40) return;
      const dir = acc < 0 ? 1 : -1;
      acc = 0;
      const { rx: r, api: a } = live.current;
      if (ev.ctrlKey || ev.metaKey) {
        const rect = box.getBoundingClientRect();
        a.zoomAt(dir, r.center - r.span / 2 + ((ev.clientX - rect.left) / rect.width) * r.span);
      } else a.tune(r.vfo + dir * r.step, false);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [wrap]);

  const occ = emitterAt(rx.vfo);

  return (
    <div
      ref={wrap}
      className={s.display}
      tabIndex={0}
      role="application"
      aria-roledescription="spectrum display"
      aria-label={`Spectrum and waterfall, ${hz(rx.center - rx.span / 2)} to ${hz(rx.center + rx.span / 2)}. Click to tune, drag to pan, drag the filter edges to change the bandwidth; with focus, scroll tunes by the step and Ctrl+scroll zooms.${occ ? ` Tuned to ${occ.label}, ${hz(occOf(occ))} wide.` : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={leave}
    >
      <canvas ref={spec} className={s.spec} />
      <div className={s.wfBox}>
        <canvas ref={wf} className={s.wf} />
        <div ref={passEl} className={s.wfPass} />
        <div ref={vfoEl} className={s.wfVfo} />
      </div>
      <div ref={hair} className={s.hair} />
      <div ref={tip} className={s.tip} aria-hidden="true" />
    </div>
  );
}

export default memo(Display);
