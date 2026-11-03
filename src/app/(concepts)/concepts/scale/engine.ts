// The zoom engine. Page scroll is the camera: each stop's panel holds the camera on its figure
// while the panel is being read, and the gaps between panels are the zooms. Wheel scrolls the
// page as usual; pinch (a trackpad's ctrl+wheel, or two fingers) and the keys move the same
// scroll position, so every input drives one camera. The canvas only repaints when the camera
// moves, and not at all while the section is off screen.

import { LG, STOPS, sup } from './stops';
import {
  buildLevels,
  clamp,
  loadPhoto,
  paint,
  qForLg,
  readFonts,
  sceneAt,
  type Box,
  type Level,
} from './paint';

export interface HudEls {
  hud: HTMLElement;
  power: HTMLElement;
  count: HTMLElement;
  what: HTMLElement;
  unit: HTMLElement;
  log: HTMLElement;
  density: HTMLElement;
  bar: HTMLElement;
  barLabel: HTMLElement;
}

/** Narrower than this, the HUD sits on top and panels scroll under the field. */
export const WIDE = 900;

/** Where a panel's top starts the hold, and where its bottom ends it, as fractions of the viewport. */
const HOLD = { wide: [0.62, 0.42], narrow: [0.7, 0.56] };

export function fieldBox(W: number, H: number): Box {
  if (W >= WIDE) {
    const col = clamp(W * 0.3, 340, 420);
    const x = 40 + col + 56;
    return { x, y: 56, w: W - 132 - x, h: H - 56 - 52 };
  }
  const y = 170;
  return { x: 16, y, w: W - 32, h: Math.max(160, H * 0.62 - y - 14) };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** "1,000" → "10³" for powers of ten, else grouped digits. */
const compact = (n: number) => {
  if (n < 1) return n.toPrecision(2);
  const lg = Math.log10(n);
  if (Math.abs(lg - Math.round(lg)) < 1e-9 && n >= 1000) return `10${sup(Math.round(lg))}`;
  return n >= 100 ? fmt(n) : n >= 10 ? n.toFixed(0) : n.toFixed(1);
};

export function startZoom(
  section: HTMLElement,
  canvas: HTMLCanvasElement,
  els: HudEls,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const panels = [...section.querySelectorAll<HTMLElement>('li[data-stop]')];

  let W = 0,
    H = 0,
    dpr = 1;
  let box: Box = { x: 0, y: 0, w: 1, h: 1 };
  let levels: Level[] = buildLevels(false);
  let portrait = false;
  let holds: { start: number; end: number }[] = [];
  let q = 0,
    qTarget = 0,
    raf = 0,
    last = 0;
  let visible = true;
  let photo: HTMLCanvasElement | null = null;
  const shown: Record<string, string> = {};
  let current = -1;

  const write = (key: string, el: HTMLElement, text: string) => {
    if (shown[key] !== text) el.textContent = shown[key] = text;
  };

  /* -------------------------------------------------------- layout */

  const layout = () => {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    box = fieldBox(W, H);
    const p = box.h > box.w * 1.2;
    if (p !== portrait || !levels.length) levels = buildLevels((portrait = p));

    const vh = window.innerHeight;
    const [startAt, endAt] = window.innerWidth >= WIDE ? HOLD.wide : HOLD.narrow;
    holds = panels.map((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const bottom = top + el.offsetHeight;
      let start = top - startAt * vh,
        end = bottom - endAt * vh;
      if (end - start < 0.14 * vh) {
        const mid = (start + end) / 2;
        start = mid - 0.07 * vh;
        end = mid + 0.07 * vh;
      }
      return { start, end };
    });
    holds[0].start = -Infinity;
    for (let i = 1; i < holds.length; i++)
      holds[i].start = Math.max(holds[i].start, holds[i - 1].end + 1);
  };

  const qAt = (y: number) => {
    if (!holds.length || y <= holds[0].end) return 0;
    for (let i = 1; i < holds.length; i++) {
      if (y < holds[i].start)
        return i - 1 + clamp((y - holds[i - 1].end) / (holds[i].start - holds[i - 1].end));
      if (y <= holds[i].end) return i;
    }
    return holds.length - 1;
  };

  /** The scroll position for a point on the ladder: a stop's hold middle, or a point in a zoom. */
  const yAtQ = (target: number) => {
    const i = Math.floor(target),
      t = target - i;
    if (t < 1e-4 || i >= holds.length - 1) {
      const h = holds[Math.min(i, holds.length - 1)];
      return i === 0 ? 0 : (h.start + h.end) / 2;
    }
    return holds[i].end + t * (holds[i + 1].start - holds[i].end);
  };

  /* -------------------------------------------------------- frame */

  const render = () => {
    const sc = sceneAt(q);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const res = paint(ctx, W, H, levels, box, sc, photo);

    const near = Math.round(q);
    const settled = Math.abs(q - near) < 0.004;
    const st = STOPS[near];
    const n = Math.floor(sc.lg + 1e-9);
    write('power', els.power, String(n));
    write('count', els.count, settled ? st.display : fmt(sc.F));
    // Between stops the count is a running count, and the HUD says so instead of borrowing a label.
    write(
      'what',
      els.what,
      settled ? st.what : `between ${STOPS[sc.a].display} and ${STOPS[sc.b].display}`,
    );
    write(
      'unit',
      els.unit,
      settled ? [st.mark, st.scope].filter(Boolean).join(' · ') : 'a running count, not a figure',
    );
    write('log', els.log, `log₁₀ n = ${sc.lg.toFixed(2)} · in view: 10${sup(res.frame)} slots`);

    // Scale: the widest block that still fits a short bar, and what one pixel holds.
    const s = res.view.s;
    let k = 0;
    while (k < levels.length - 1 && levels[k + 1].w * s <= 150) k++;
    const barW = levels[k].w * s;
    els.bar.style.width = `${clamp(barW, 4, 150).toFixed(1)}px`;
    // A slot wider than the bar gets a bar for a fraction of it, so the bar never lies.
    write(
      'bar',
      els.barLabel,
      barW > 150
        ? `${(150 / barW).toFixed(2)} of a slot`
        : k === 0
          ? 'one slot'
          : `one block of 10${sup(k)}`,
    );
    const frameL = levels[res.frame];
    const perPx = frameL.size / (frameL.w * frameL.h * s * s);
    const drawnAs =
      res.leaf === 0 ? 'every mark drawn' : `drawn in blocks of ${compact(10 ** res.leaf)} marks`;
    write(
      'density',
      els.density,
      s * 0.72 >= 1
        ? `1 mark ≈ ${(s * 0.72).toFixed(s < 10 ? 1 : 0)} px · ${drawnAs}`
        : `1 px ≈ ${compact(perPx)} marks · ${drawnAs}`,
    );

    els.hud.style.setProperty('--lg', (sc.lg / 9).toFixed(4));
    els.hud.dataset.moving = settled ? 'false' : 'true';
    if (near !== current) {
      current = near;
      els.hud.dataset.active = String(near);
      els.hud.style.setProperty('--accent', `var(--${st.accent})`);
      panels.forEach((el, i) => (el.dataset.current = i === near ? 'true' : 'false'));
    }
  };

  const tick = (ts: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    q += (qTarget - q) * (1 - Math.exp(-dt * 9));
    if (Math.abs(qTarget - q) < 0.0004) q = qTarget;
    render();
    if (q !== qTarget && visible) raf = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => {
    if (!raf && visible) raf = requestAnimationFrame(tick);
  };

  /* -------------------------------------------------------- input */

  const onScroll = () => {
    qTarget = qAt(window.scrollY);
    wake();
  };

  const go = (target: number, smooth: boolean) => {
    window.scrollTo({
      top: Math.max(0, yAtQ(clamp(target, 0, STOPS.length - 1))),
      behavior: smooth ? 'smooth' : ('instant' as ScrollBehavior),
    });
  };

  const inZoom = () => {
    const r = section.getBoundingClientRect();
    return r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || !inZoom()) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const out = e.key === 'ArrowRight' || e.key === '-' || e.key === '_';
    const into = e.key === 'ArrowLeft' || e.key === '+' || e.key === '=';
    if (!out && !into) return;
    e.preventDefault();
    const at = qTarget;
    go(out ? Math.floor(at + 1e-3) + 1 : Math.ceil(at - 1e-3) - 1, true);
  };

  // Pinch: the gesture sets the figure's log directly, then scrolls to wherever that is.
  let pinchLg = 0,
    pinchAt = 0;
  const pinchTo = (lg: number) => go(qForLg(clamp(lg, LG[0], LG[LG.length - 1])), false);

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey || !canvas.contains(e.target as Node)) return;
    e.preventDefault();
    const now = performance.now();
    if (now - pinchAt > 250) pinchLg = sceneAt(qTarget).lg;
    pinchAt = now;
    pinchLg = clamp(pinchLg + e.deltaY * 0.012, LG[0], LG[LG.length - 1]);
    pinchTo(pinchLg);
  };

  let touch0 = 0,
    touchLg = 0;
  const spread = (t: TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: TouchEvent) => {
    // Only a pinch that starts on the field; text panels keep the browser's own zoom.
    if (
      e.touches.length !== 2 ||
      ![...e.touches].every((tp) => canvas.contains(tp.target as Node))
    ) {
      touch0 = 0;
      return;
    }
    touch0 = spread(e.touches);
    touchLg = sceneAt(qTarget).lg;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !touch0) return;
    e.preventDefault();
    pinchTo(touchLg - Math.log10(spread(e.touches) / touch0) * 1.8);
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) touch0 = 0;
  };

  /* -------------------------------------------------------- lifecycle */

  const relayout = () => {
    layout();
    qTarget = qAt(window.scrollY);
    q = qTarget;
    render();
  };
  relayout();
  readFonts();
  document.fonts?.ready.then(() => {
    readFonts();
    relayout();
  });
  loadPhoto().then((p) => {
    photo = p;
    render();
  });

  const resize = new ResizeObserver(() => relayout());
  resize.observe(canvas);
  resize.observe(section);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      q = qTarget = qAt(window.scrollY);
      render();
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
  });
  io.observe(section);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', onKey);
  section.addEventListener('wheel', onWheel, { passive: false });
  section.addEventListener('touchstart', onTouchStart, { passive: true });
  section.addEventListener('touchmove', onTouchMove, { passive: false });
  section.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    panels.forEach((el) => delete el.dataset.current);
    cancelAnimationFrame(raf);
    resize.disconnect();
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('keydown', onKey);
    section.removeEventListener('wheel', onWheel);
    section.removeEventListener('touchstart', onTouchStart);
    section.removeEventListener('touchmove', onTouchMove);
    section.removeEventListener('touchend', onTouchEnd);
  };
}

/** Paints one stop as a still, for reduced motion. */
export function paintStill(
  canvas: HTMLCanvasElement,
  index: number,
  photo: HTMLCanvasElement | null,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const box = { x: 12, y: 10, w: w - 24, h: h - 22 };
  paint(ctx, w, h, buildLevels(box.h > box.w * 1.2), box, sceneAt(index), photo);
}
