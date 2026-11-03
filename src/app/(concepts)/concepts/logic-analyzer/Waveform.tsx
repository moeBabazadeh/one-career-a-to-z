'use client';

import { useEffect, useRef } from 'react';
import { useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import { upper, type Capture, type Cond } from './capture';
import type { AnalyzerId, Frame } from './decode';
import { forgetWidths, labels, layout, paint, type Colors, type Layout } from './draw';
import {
  ANALOG_ROW,
  ANALYZERS,
  CHANNELS,
  capSpan,
  get,
  placeMarker,
  set,
  setTraceWidth,
  setTrig,
  setView,
  subscribe,
  useLA,
  zoomAt,
  type State,
} from './store';
import { freq, time } from './units';
import { railAt, world } from './world';
import s from './logic.module.scss';

/* ------------------------------------------------------------------ channel list */

const NEXT: Record<Cond, Cond> = {
  none: 'rise',
  rise: 'fall',
  fall: 'high',
  high: 'low',
  low: 'none',
};
const COND_NAME: Record<Cond, string> = {
  none: 'no trigger',
  rise: 'rising edge',
  fall: 'falling edge',
  high: 'high level',
  low: 'low level',
};

/** The little waveform glyph on a channel's trigger button. */
export function CondIcon({ c }: { c: Cond }) {
  const d = {
    none: 'M2 8h12',
    rise: 'M2 12h5V4h7',
    fall: 'M2 4h5v8h7',
    high: 'M2 4h12',
    low: 'M2 12h12',
  }[c];
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" data-cond={c}>
      <path d={d} className={c === 'none' ? s.condNone : undefined} />
      {(c === 'rise' || c === 'fall') && (
        <path d={c === 'rise' ? 'M5 7l2-3 2 3' : 'M5 9l2 3 2-3'} />
      )}
    </svg>
  );
}

function Channels() {
  const trig = useLA((st) => st.settings.trig);
  const sel = useLA((st) => st.ch);
  return (
    <div className={s.labels} data-labels>
      <div className={s.labHead}>
        <span>Channels</span>
        <span className={s.labTrig}>Trigger</span>
      </div>
      {CHANNELS.map((c, i) => (
        <div
          key={c.name}
          className={s.lab}
          data-sel={sel === i || undefined}
          style={{ '--ch': `var(--ch${i})` } as React.CSSProperties}
        >
          <button
            type="button"
            className={s.labName}
            onClick={() => set({ ch: i })}
            aria-pressed={sel === i}
            title="Select for edge navigation ([ and ])"
          >
            <i className={s.swatch} aria-hidden="true" />
            <b>D{i}</b>
            <span>{c.name}</span>
            <small>{c.bus}</small>
          </button>
          <button
            type="button"
            className={s.trigBtn}
            data-on={trig[i] !== 'none' || undefined}
            onClick={() => setTrig(i, NEXT[trig[i]])}
            aria-label={`D${i} ${c.name} trigger: ${COND_NAME[trig[i]]}. Change.`}
            title={`Trigger: ${COND_NAME[trig[i]]}`}
          >
            <CondIcon c={trig[i]} />
          </button>
        </div>
      ))}
      <div
        className={`${s.lab} ${s.labAnalog}`}
        style={{ '--ch': 'var(--a0)' } as React.CSSProperties}
      >
        <span className={s.labName}>
          <i className={s.swatch} aria-hidden="true" />
          <b>A0</b>
          <span>3V3</span>
          <small>rail</small>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hover readout */

function pulse(cap: Capture, ch: number, t: number) {
  const tr = cap.traces[ch];
  const { edges } = tr;
  const i = upper(edges, t);
  const level = tr.init ^ (i & 1);
  if (i < 1 || i >= edges.length) return { level, width: null, period: null, duty: null };
  const width = edges[i] - edges[i - 1];
  const period = i + 1 < edges.length ? edges[i + 1] - edges[i - 1] : null;
  const high = period === null ? null : level ? width : period - width;
  return { level, width, period, duty: period && high !== null ? high / period : null };
}

/** The frame under a point on a row, if any. */
function frameAt(
  st: Pick<State, 'dec' | 'shown'>,
  row: number,
  t: number,
  slack: number,
): { an: AnalyzerId; i: number; f: Frame } | null {
  if (!st.dec) return null;
  for (const a of ANALYZERS) {
    if (!a.rows.includes(row) || !st.shown[a.id]) continue;
    const fr = st.dec[a.id];
    let lo = 0;
    let hi = fr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fr[mid].t1 + slack < t) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < fr.length && fr[i].t0 - slack <= t; i++) {
      if (fr[i].k === 'start' || fr[i].k === 'stop' || fr[i].k === 'restart') continue;
      return { an: a.id, i, f: fr[i] };
    }
  }
  return null;
}

function Readout() {
  const hover = useLA((st) => st.hover);
  const cap = useLA((st) => st.cap);
  const phase = useLA((st) => st.phase);
  const radix = useLA((st) => st.radix);
  const dec = useLA((st) => st.dec);
  const view = useLA((st) => st.view);
  const shown = useLA((st) => st.shown);
  if (!hover || !cap || phase !== 'done') return null;
  const lines: string[] = [];
  let head: string;
  if (hover.row === ANALOG_ROW) {
    head = 'A0 3V3';
    lines.push(`${railAt(world(), cap.at + hover.t).toFixed(3)} V`);
  } else {
    const p = pulse(cap, hover.row, hover.t);
    head = `D${hover.row} ${CHANNELS[hover.row].name} · ${p.level ? 'high' : 'low'}`;
    if (p.width !== null) lines.push(`width ${time(p.width)}`);
    if (p.period !== null) lines.push(`period ${time(p.period)} · ${freq(1 / p.period)}`);
    if (p.duty !== null) lines.push(`duty ${(p.duty * 100).toFixed(1)}%`);
    const hit = frameAt({ dec, shown }, hover.row, hover.t, (view.span / 1000) * 2);
    if (hit) {
      const name = ANALYZERS.find((a) => a.id === hit.an)?.name;
      lines.push(`${name}: ${labels(hit.an, hit.f, hover.row, radix)[0]}`);
    }
  }
  lines.push(`at ${time(hover.t, 7, true)}`);
  return (
    <div
      className={s.readout}
      style={{ '--x': `${hover.x}px`, '--y': `${hover.y}px` } as React.CSSProperties}
      data-flip={hover.x > 260 || undefined}
      data-up={hover.y > 280 || undefined}
      aria-hidden="true"
    >
      <b>{head}</b>
      {lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the trace area */

const MAX_SCROLL = 2e6;

function readColors(el: Element): Colors {
  const v = (n: string) => token(el, n);
  const an = (id: string) => ({
    fill: v(`--b-${id}`),
    ink: v(`--b-${id}-ink`),
    line: v(`--b-${id}-line`),
  });
  return {
    bg: v('--wave-bg'),
    rowAlt: v('--wave-alt'),
    grid: v('--wave-grid'),
    sep: v('--wave-sep'),
    ruler: v('--ruler-bg'),
    rulerInk: v('--ruler-ink'),
    muted: v('--muted'),
    ch: CHANNELS.map((_, i) => v(`--ch${i}`)),
    analog: v('--a0'),
    analogFill: v('--a0-fill'),
    an: { tx: an('tx'), rx: an('rx'), i2c: an('i2c'), spi: an('spi') },
    err: an('err'),
    ok: v('--ok'),
    warn: v('--warn'),
    stopDot: v('--stop'),
    markA: v('--mark-a'),
    markB: v('--mark-b'),
    shade: v('--mark-shade'),
    trig: v('--trig'),
    cursor: v('--cursor'),
    sel: v('--sel'),
    hit: v('--hit'),
    pulse: v('--pulse'),
    dot: v('--dot'),
    mono: v('--mono') || 'monospace',
  };
}

export default function Waveform({ label }: { label: string }) {
  const scheme = useScheme();
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const colors = useRef<Colors | null>(null);
  const L = useRef<Layout | null>(null);
  const frame = useRef(0);
  const expected = useRef(-1);
  const draw = useRef<() => void>(() => {});

  // Colours come from the tokens; read them again when the scheme flips.
  useEffect(() => {
    colors.current = null;
    forgetWidths();
    draw.current();
  }, [scheme]);

  useEffect(() => {
    const cv = canvas.current;
    const sc = scroller.current;
    const sp = spacer.current;
    const root = wrap.current;
    if (!cv || !sc || !sp || !root) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let dpr = 1;

    const syncScroll = (st: State) => {
      const W = sc.clientWidth;
      const cap = st.cap;
      if (!cap) {
        sp.style.width = `${W}px`;
        return;
      }
      const total = capSpan(cap);
      const sw = Math.max(W, Math.min(MAX_SCROLL, (W * total) / st.view.span));
      sp.style.width = `${sw}px`;
      const range = sw - W;
      const free = total - st.view.span;
      const want = free > 0 ? ((st.view.t0 - cap.t0) / free) * range : 0;
      if (Math.abs(sc.scrollLeft - want) > 1) {
        sc.scrollLeft = want;
        expected.current = sc.scrollLeft;
      }
    };

    const paintNow = () => {
      frame.current = 0;
      const lay = L.current;
      if (!lay) return;
      const st = get();
      syncScroll(st);
      colors.current ??= readColors(root);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, { s: st, w: world(), c: colors.current, L: lay, dpr });
    };
    const request = () => {
      if (!frame.current) frame.current = requestAnimationFrame(paintNow);
    };
    draw.current = request;

    const fitCanvas = () => {
      dpr = Math.min(3, window.devicePixelRatio || 1);
      const W = sc.clientWidth;
      const H = sc.clientHeight;
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      L.current = layout(W, H);
      setTraceWidth(W);
      const labels = root.querySelector<HTMLElement>('[data-labels]');
      if (labels) labels.style.height = `${H}px`;
      paintNow();
    };
    fitCanvas();
    const ro = new ResizeObserver(fitCanvas);
    ro.observe(sc);
    const unsub = subscribe(request);
    // Canvas text waits for the webfont.
    document.fonts?.ready.then(() => {
      forgetWidths();
      request();
    });

    /* ---------------- pointer and wheel */

    const timeAt = (x: number) => {
      const { view } = get();
      return view.t0 + (x / sc.clientWidth) * view.span;
    };
    const local = (e: { clientX: number; clientY: number }) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const rowAt = (y: number) => L.current?.rows.findIndex((r) => y >= r.y && y < r.y + r.h) ?? -1;

    /** Snaps to the nearest edge within a few pixels: the row's own channel if it has one. */
    const snapT = (t: number, row: number) => {
      const st = get();
      const cap = st.cap;
      if (!cap) return t;
      const tol = (7 / sc.clientWidth) * st.view.span;
      const chans = row >= 0 && row < ANALOG_ROW ? [row] : CHANNELS.map((_, i) => i);
      let best = t;
      let gap = tol;
      for (const ch of chans) {
        const e = cap.traces[ch].edges;
        const i = upper(e, t);
        for (const k of [i - 1, i]) {
          if (k >= 0 && k < e.length && Math.abs(e[k] - t) < gap) {
            gap = Math.abs(e[k] - t);
            best = e[k];
          }
        }
      }
      return best;
    };

    const onWheel = (e: WheelEvent) => {
      const st = get();
      if (!st.cap) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sc.clientWidth : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const { x } = local(e);
      if (e.shiftKey || Math.abs(dx) > Math.abs(dy)) {
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        setView({ t0: st.view.t0 + (d / sc.clientWidth) * st.view.span, span: st.view.span });
        return;
      }
      zoomAt(timeAt(x), Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0022)));
    };
    sc.addEventListener('wheel', onWheel, { passive: false });

    let drag: {
      id: number;
      x: number;
      t0: number;
      moved: boolean;
      marker: 'A' | 'B' | null;
    } | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      const { x, y } = local(e);
      const st = get();
      let marker: 'A' | 'B' | null = null;
      if (y < (L.current?.ruler ?? 30)) {
        for (const id of ['A', 'B'] as const) {
          const t = st.markers[id];
          if (t !== null && Math.abs(((t - st.view.t0) / st.view.span) * sc.clientWidth - x) < 9)
            marker = id;
        }
      }
      drag = { id: e.pointerId, x, t0: st.view.t0, moved: false, marker };
      cv.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      const st = get();
      if (drag && drag.id === e.pointerId) {
        if (Math.abs(x - drag.x) > 3) drag.moved = true;
        if (drag.moved) {
          if (drag.marker) {
            set({ markers: { ...st.markers, [drag.marker]: snapT(timeAt(x), -1) }, hover: null });
          } else {
            setView({
              t0: drag.t0 - ((x - drag.x) / sc.clientWidth) * st.view.span,
              span: st.view.span,
            });
            cv.dataset.grab = '1';
          }
          return;
        }
      }
      if (e.pointerType === 'touch') return;
      const row = rowAt(y);
      set({ hover: row >= 0 ? { row, t: timeAt(x), x, y } : null });
    };

    const onUp = (e: PointerEvent) => {
      const { x, y } = local(e);
      const d = drag;
      drag = null;
      delete cv.dataset.grab;
      if (d && d.moved) return;
      const st = get();
      if (!st.cap) return;
      const t = timeAt(x);
      const ruler = L.current?.ruler ?? 30;
      if (y < ruler) {
        if (!d?.marker) placeMarker(snapT(t, -1));
        return;
      }
      const row = rowAt(y);
      if (row < 0) return;
      const hit = frameAt(st, row, t, (st.view.span / sc.clientWidth) * 2);
      if (hit) set({ sel: { an: hit.an, i: hit.i }, focus: hit.an });
      else if (row < ANALOG_ROW) set({ ch: row, sel: null });
    };

    const onLeave = () => set({ hover: null });
    const onDbl = (e: MouseEvent) => {
      const { x } = local(e);
      zoomAt(timeAt(x), e.shiftKey ? 2.5 : 0.4);
    };

    const onScroll = () => {
      if (Math.abs(sc.scrollLeft - expected.current) <= 1) return;
      expected.current = sc.scrollLeft;
      const st = get();
      const cap = st.cap;
      if (!cap) return;
      const range = sp.clientWidth - sc.clientWidth;
      const free = capSpan(cap) - st.view.span;
      if (range <= 0 || free <= 0) return;
      setView({ t0: cap.t0 + (sc.scrollLeft / range) * free, span: st.view.span });
    };

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', () => {
      drag = null;
    });
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('dblclick', onDbl);
    sc.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      ro.disconnect();
      unsub();
      cancelAnimationFrame(frame.current);
      sc.removeEventListener('wheel', onWheel);
      sc.removeEventListener('scroll', onScroll);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('dblclick', onDbl);
      draw.current = () => {};
    };
  }, []);

  return (
    <div className={s.wave} ref={wrap}>
      <Channels />
      <div className={s.traceBox}>
        <div
          className={s.scroller}
          ref={scroller}
          tabIndex={0}
          role="group"
          aria-label="Traces. W and S zoom, A and D pan, N steps frames, M drops a marker, R captures. Press ? for every key."
        >
          <div className={s.spacer} ref={spacer}>
            <canvas ref={canvas} className={s.canvas} role="img" aria-label={label} />
          </div>
        </div>
        <Readout />
        <Status />
      </div>
    </div>
  );
}

/** What the analyzer is doing, over the traces while it waits or records. */
function Status() {
  const phase = useLA((st) => st.phase);
  const progress = useLA((st) => st.progress);
  if (phase !== 'waiting' && phase !== 'recording') return null;
  return (
    <p className={s.waiting} role="status">
      <i aria-hidden="true" />
      {phase === 'waiting' ? 'Waiting for trigger…' : `Recording ${Math.round(progress * 100)}%`}
    </p>
  );
}
