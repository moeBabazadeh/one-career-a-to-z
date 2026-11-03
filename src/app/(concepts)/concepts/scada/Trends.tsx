'use client';

// The historian. Pens are drawn on their own engineering ranges, plot-optimised (min and max per
// pixel column, as a historian returns them), with a cursor that reads every pen at one instant.
// Live data comes from this session; the 24 hours before it are backfilled from a seeded model,
// and the display says so.
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { db } from '../_shared/data';
import { useHmi } from './context';
import { BF_N, BF_STEP, LOOPS, PENS, RING, SAMPLE, type Plant } from './sim';
import { useCanvas } from './Symbols';
import s from './scada.module.scss';

const RANGES = [
  { label: '5 min', ms: 300000 },
  { label: '30 min', ms: 1800000 },
  { label: '2 h', ms: 7200000 },
  { label: '8 h', ms: 28800000 },
  { label: '24 h', ms: 86400000 },
];
const MAX_PENS = 6;
const DEFAULT = ['PIC-010.PV', 'PIC-010.SP', 'PIC-010.OUT', 'FIC-020.PV', 'FI-510', 'FI-610'];
const M = { l: 54, r: 10, t: 10, b: 24 };

interface Cols {
  min: Float32Array;
  max: Float32Array;
  /** Columns that hold lost data (a gap the historian recorded), as opposed to no sample at all. */
  gap: Uint8Array;
}

/** Min and max of a pen in each of `cols` columns between t0 and t1 (wall ms). */
function columns(plant: Plant, i: number, t0: number, t1: number, cols: number): Cols {
  const min = new Float32Array(cols).fill(NaN);
  const max = new Float32Array(cols).fill(NaN);
  const gap = new Uint8Array(cols);
  const put = (ts: number, v: number) => {
    if (ts < t0 || ts > t1) return;
    const c = Math.min(cols - 1, Math.floor(((ts - t0) / (t1 - t0)) * cols));
    if (!Number.isFinite(v)) {
      gap[c] = 1;
      return;
    }
    if (!(min[c] <= v)) min[c] = v;
    if (!(max[c] >= v)) max[c] = v;
  };
  if (plant.t0 && t0 < plant.t0) {
    const bf = plant.backfill(i);
    const first = Math.max(0, Math.floor(BF_N - (plant.t0 - t0) / (BF_STEP * 1000)));
    for (let j = first; j < BF_N; j++) put(plant.t0 - (BF_N - j) * BF_STEP * 1000, bf[j]);
  }
  if (plant.head && t1 >= plant.t0) {
    const ring = plant.ring[i];
    const lo = Math.max(plant.head - RING, Math.floor((t0 - plant.t0) / (SAMPLE * 1000)), 0);
    const hi = Math.min(plant.head - 1, Math.ceil((t1 - plant.t0) / (SAMPLE * 1000)));
    for (let k = lo; k <= hi; k++) put(plant.t0 + k * SAMPLE * 1000, ring[k % RING]);
  }
  return { min, max, gap };
}

/** Each pen's value at an instant (nearest sample), and its min, max and mean over the window. */
function readings(
  plant: Plant,
  pens: string[],
  t0: number,
  t1: number,
  at: number | null,
  version: number,
) {
  void version;
  return pens.map((id) => {
    const i = PENS.findIndex((p) => p.id === id);
    const c = columns(plant, i, t0, t1, 240);
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    let n = 0;
    c.min.forEach((v, k) => {
      if (!Number.isFinite(v)) return;
      lo = Math.min(lo, v);
      hi = Math.max(hi, c.max[k]);
      sum += (v + c.max[k]) / 2;
      n++;
    });
    let cur = NaN;
    if (at !== null) {
      // The nearest column with data: backfill is sparser than the columns in a short window.
      const k0 = Math.min(239, Math.max(0, Math.floor(at * 240)));
      for (let d = 0; d < 240 && Number.isNaN(cur); d++) {
        for (const k of [k0 - d, k0 + d]) {
          if (k >= 0 && k < 240 && Number.isFinite(c.max[k]) && !c.gap[k]) {
            cur = (c.min[k] + c.max[k]) / 2;
            break;
          }
        }
      }
    }
    return { id, pen: PENS[i], lo, hi, avg: n ? sum / n : NaN, cur };
  });
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number, sec: boolean) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${sec ? `:${pad(d.getSeconds())}` : ''}`;
};
const STEPS = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600].map((x) => x * 1000);

export function Trends() {
  const { snap, plant } = useHmi();
  const [range, setRange] = useState(RANGES[0].ms);
  const [end, setEnd] = useState<number | null>(null);
  const [pens, setPens] = useState(DEFAULT);
  const [scalePen, setScalePen] = useState(DEFAULT[0]);
  const [cursor, setCursor] = useState<number | null>(null);
  const t1 = end ?? snap.now;
  const t0 = t1 - range;
  const started = snap.now > 0;

  const ref = useCanvas((ctx, w, h, c) => {
    const cw = w - M.l - M.r;
    const ch = h - M.t - M.b;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = c.bg;
    ctx.fillRect(M.l, M.t, cw, ch);
    if (!started) {
      ctx.fillStyle = c.muted;
      ctx.fillText('Waiting for the first samples…', M.l + 12, M.t + 20);
      return;
    }
    const x = (ts: number) => M.l + ((ts - t0) / (t1 - t0)) * cw;
    // Backfill region.
    if (plant.t0 > t0) {
      const bx = Math.min(M.l + cw, x(plant.t0));
      ctx.fillStyle = c.band;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(M.l, M.t, bx - M.l, ch);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.muted;
      if (bx - M.l > 140) ctx.fillText('BACKFILL (SIM)', M.l + 8, M.t + ch - 8);
      if (bx < M.l + cw) {
        ctx.strokeStyle = c.ink;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(bx) + 0.5, M.t);
        ctx.lineTo(Math.round(bx) + 0.5, M.t + ch);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText('SESSION START', Math.min(bx + 6, M.l + cw - 100), M.t + ch - 8);
      }
    }
    // Grid: ten divisions up, and time lines on round local times.
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    for (let k = 0; k <= 10; k++) {
      const y = Math.round(M.t + (ch * k) / 10) + 0.5;
      ctx.beginPath();
      ctx.moveTo(M.l, y);
      ctx.lineTo(M.l + cw, y);
      ctx.stroke();
    }
    const step = STEPS.find((st) => range / st <= 8) ?? STEPS[STEPS.length - 1];
    const tz = new Date(t0).getTimezoneOffset() * 60000;
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'center';
    for (let ts = Math.ceil((t0 - tz) / step) * step + tz; ts <= t1; ts += step) {
      const gx = Math.round(x(ts)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, M.t);
      ctx.lineTo(gx, M.t + ch);
      ctx.stroke();
      ctx.fillText(hhmm(ts, step < 60000), gx, h - 8);
    }
    // The scale pen's axis and limits.
    const sp = PENS.find((p) => p.id === scalePen) ?? PENS[0];
    ctx.textAlign = 'right';
    for (let k = 0; k <= 10; k += 2) {
      const v = sp.lo + ((sp.hi - sp.lo) * k) / 10;
      ctx.fillText(
        Number.isInteger(v) ? String(v) : v.toFixed(1),
        M.l - 6,
        M.t + ch - (ch * k) / 10 + 4,
      );
    }
    ctx.save();
    ctx.translate(12, M.t + ch / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(`${sp.tag} ${sp.eu}`, 0, 0);
    ctx.restore();
    const cfg = LOOPS.find((l) => `${l.id}.PV` === sp.id);
    if (cfg) {
      ctx.setLineDash([6, 4]);
      for (const [k, lim] of Object.entries(cfg.limits)) {
        if (k === 'DEV' || !lim) continue;
        const y = M.t + ch - ((lim.v - sp.lo) / (sp.hi - sp.lo)) * ch;
        ctx.strokeStyle = lim.prio === 1 ? c.p1 : c.p2;
        ctx.beginPath();
        ctx.moveTo(M.l, y);
        ctx.lineTo(M.l + cw, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // Pens, plot-optimised: a vertical stroke from min to max in each column, joined up.
    const cols = Math.max(2, Math.floor(cw));
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, cw, ch);
    ctx.clip();
    pens.forEach((id, n) => {
      const i = PENS.findIndex((p) => p.id === id);
      const pen = PENS[i];
      const { min, max, gap } = columns(plant, i, t0, t1, cols);
      const y = (v: number) => M.t + ch - ((v - pen.lo) / (pen.hi - pen.lo)) * ch;
      ctx.strokeStyle = c.pens[n % c.pens.length];
      ctx.lineWidth = id === scalePen ? 2 : 1.4;
      ctx.setLineDash(id.endsWith('.SP') ? [5, 3] : []);
      ctx.beginPath();
      let on = false;
      for (let k = 0; k < cols; k++) {
        // An empty column just lies between samples; a recorded gap breaks the line.
        if (!Number.isFinite(min[k])) {
          if (gap[k]) on = false;
          continue;
        }
        const px = M.l + k + 0.5;
        if (on) ctx.lineTo(px, y(min[k]));
        else ctx.moveTo(px, y(min[k]));
        if (max[k] !== min[k]) ctx.lineTo(px, y(max[k]));
        on = true;
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
    if (cursor !== null) {
      const cx = Math.round(M.l + cursor * cw) + 0.5;
      ctx.strokeStyle = c.ink;
      ctx.beginPath();
      ctx.moveTo(cx, M.t);
      ctx.lineTo(cx, M.t + ch);
      ctx.stroke();
      ctx.textAlign = cursor > 0.8 ? 'right' : 'left';
      ctx.fillStyle = c.ink;
      ctx.fillText(hhmm(t0 + cursor * range, true), cx + (cursor > 0.8 ? -6 : 6), M.t + 26);
    }
    ctx.strokeStyle = c.muted;
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, cw - 1, ch - 1);
  }, `${snap.version}-${range}-${end}-${pens.join()}-${scalePen}-${cursor}`);

  const rows = readings(plant, pens, t0, t1, cursor, snap.version);
  const pan = (k: number) => {
    const next = Math.min(snap.now, t1 + k * range * 0.5);
    setEnd(next >= snap.now ? null : next);
  };
  const zoom = (k: number) => {
    const i = RANGES.findIndex((r) => r.ms === range);
    setRange(RANGES[Math.max(0, Math.min(RANGES.length - 1, i + k))].ms);
  };
  const pointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left - M.l) / (r.width - M.l - M.r);
    setCursor(f >= 0 && f <= 1 ? f : null);
  };
  const keys = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey) pan(d);
      else setCursor(Math.max(0, Math.min(1, (cursor ?? 0.5) + d * 0.01)));
    } else if (e.key === '+' || e.key === '=') zoom(-1);
    else if (e.key === '-') zoom(1);
    else if (e.key === 'Home') setEnd(null);
  };
  const toggle = (id: string) => {
    if (pens.includes(id)) {
      const next = pens.filter((p) => p !== id);
      setPens(next);
      if (scalePen === id && next.length) setScalePen(next[0]);
    } else if (pens.length < MAX_PENS) setPens([...pens, id]);
  };
  const fmtV = (v: number, span: number) =>
    Number.isFinite(v) ? v.toFixed(span <= 20 ? 2 : 1) : '----';
  const logger = db.devices.logger;

  return (
    <div className={s.trendView}>
      <header className={s.unitHead}>
        <div>
          <p className={s.kicker}>HISTORIAN · SIMULATED, SEEDED</p>
          <h1>Trends</h1>
          <p
            className={s.identRole}
          >{`Process data from this session at ${SAMPLE} s, and a seeded 24 h backfill before it. Not plant records. (The real archive behind this kind of screen: the ${logger.name} fleet, ${logger.records.long} records in ${logger.online.long} years.)`}</p>
        </div>
      </header>
      <div className={s.alarmBar}>
        <div className={s.filters} role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.ms}
              type="button"
              aria-pressed={range === r.ms}
              onClick={() => setRange(r.ms)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className={s.filters} role="group" aria-label="Pan">
          <button type="button" onClick={() => pan(-1)} aria-label="Back half a window">
            ◀
          </button>
          <button
            type="button"
            onClick={() => pan(1)}
            disabled={end === null}
            aria-label="Forward half a window"
          >
            ▶
          </button>
          <button type="button" aria-pressed={end === null} onClick={() => setEnd(null)}>
            {end === null ? '● Live' : 'Live'}
          </button>
        </div>
      </div>
      <canvas
        ref={ref}
        className={s.trend}
        tabIndex={0}
        role="img"
        aria-label={`Trend of ${pens.join(', ')} over ${RANGES.find((r) => r.ms === range)?.label}. Arrow keys move the cursor, Shift and arrows pan, plus and minus zoom, Home returns to live.`}
        onPointerMove={pointer}
        onPointerLeave={() => setCursor(null)}
        onKeyDown={keys}
      />
      <div className={s.tableScroll}>
        <table className={s.penTable}>
          <thead>
            <tr>
              <th scope="col">Pen</th>
              <th scope="col">{cursor === null ? 'Now' : 'At cursor'}</th>
              <th scope="col">Min</th>
              <th scope="col">Max</th>
              <th scope="col">Mean</th>
              <th scope="col">EU</th>
              <th scope="col">Scale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, n) => (
              <tr key={r.id}>
                <th scope="row">
                  <i className={s.swatch} style={{ background: `var(--pen${(n % 6) + 1})` }} />
                  <span className={s.mono}>{r.pen.label}</span>
                </th>
                <td className={s.mono}>
                  {fmtV(cursor === null ? plant.read(r.id) : r.cur, r.pen.hi - r.pen.lo)}
                </td>
                <td className={s.mono}>{fmtV(r.lo, r.pen.hi - r.pen.lo)}</td>
                <td className={s.mono}>{fmtV(r.hi, r.pen.hi - r.pen.lo)}</td>
                <td className={s.mono}>{fmtV(r.avg, r.pen.hi - r.pen.lo)}</td>
                <td className={s.mono}>{r.pen.eu}</td>
                <td>
                  <input
                    type="radio"
                    name="scale"
                    checked={scalePen === r.id}
                    onChange={() => setScalePen(r.id)}
                    aria-label={`Show the ${r.pen.tag} scale`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset className={s.penPick}>
        <legend>{`Pens (${pens.length}/${MAX_PENS})`}</legend>
        {PENS.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={pens.includes(p.id)}
              disabled={!pens.includes(p.id) && pens.length >= MAX_PENS}
              onChange={() => toggle(p.id)}
            />
            <span className={s.mono}>{p.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
