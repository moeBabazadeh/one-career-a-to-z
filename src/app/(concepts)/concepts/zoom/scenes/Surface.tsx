'use client';

import { useEffect, useRef } from 'react';
import { db, profile } from '../../_shared/data';
import { useReducedMotion, useScheme } from '../../_shared/hooks';
import { useSceneProgress } from '../depth';
import { BRAND, C, channels, ease, lerp, readColors, seg } from '../kit';
import s from '../stack.module.scss';

// The surface: a plain, crisp UI with a "Hire Moe" button. Scrolling zooms into one
// anti-aliased pixel of the button's label, through the pixel grid to the RGB subpixels. The UI
// is the same in both schemes; on light, the subpixels are drawn as on a printed page.

const ZMAX = 900;

const { person } = db;
const [GIVEN, FAMILY] = profile.name.split(' ');

interface Bitmap {
  img: HTMLCanvasElement;
  data: Uint8ClampedArray;
  W: number;
  H: number;
  /** The target pixel, in stage pixels. */
  tx: number;
  ty: number;
}

/** Zoom factor at progress p: exponential, so every scroll step feels the same. */
const zoomAt = (p: number) => Math.exp(Math.log(ZMAX) * ease(seg(p, 0.05, 0.78)));

/** Where the target pixel sits on screen: it starts on the button and drifts to the centre. */
const anchorAt = (b: Bitmap, z: number, w: number, h: number) => {
  const k = ease(seg(Math.log(z), Math.log(2), Math.log(60)));
  return [lerp(b.tx + 0.5, w / 2, k), lerp(b.ty + 0.5, h / 2, k)];
};

/** Offsets of `el` from `root`, ignoring transforms (so it measures right mid-zoom). */
function offsetWithin(el: HTMLElement, root: HTMLElement) {
  let x = 0,
    y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/** Redraws the button at 1x into an offscreen bitmap and picks an anti-aliased pixel on its label. */
function buildBitmap(ui: HTMLElement, hire: HTMLElement, label: HTMLElement): Bitmap | null {
  const W = ui.clientWidth,
    H = ui.clientHeight;
  if (!W || !H || W * H > 16_000_000) return null;
  const img = document.createElement('canvas');
  img.width = W;
  img.height = H;
  const ctx = img.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = BRAND.paper;
  ctx.fillRect(0, 0, W, H);

  const { x, y } = offsetWithin(hire, ui);
  const bw = hire.offsetWidth,
    bh = hire.offsetHeight;
  ctx.fillStyle = BRAND.orange;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, bh / 2);
  ctx.fill();

  const cs = getComputedStyle(label);
  const lo = offsetWithin(label, ui);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ('letterSpacing' in ctx)
    ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  ctx.fillStyle = BRAND.ink;
  ctx.textBaseline = 'middle';
  ctx.fillText(label.textContent ?? '', lo.x, lo.y + label.offsetHeight / 2);

  // Find an anti-aliased pixel on the label: the one closest to an even blend of button and
  // ink, scanning outward from the label's middle row.
  const data = ctx.getImageData(0, 0, W, H).data;
  const mid = Math.round(lo.y + label.offsetHeight / 2);
  let tx = Math.round(lo.x + 2),
    ty = mid,
    best = Infinity;
  for (let d = 0; d < label.offsetHeight / 2 && best > 6; d++) {
    for (const yy of [mid - d, mid + d]) {
      for (let xx = Math.round(lo.x); xx < lo.x + label.offsetWidth; xx++) {
        const i = (yy * W + xx) * 4;
        const r = data[i],
          g = data[i + 1];
        // On the line from button (255, 93, 46) to ink (6, 7, 10), green tracks red.
        if (Math.abs(g - (7 + ((r - 6) / 249) * 86)) > 8) continue;
        const score = Math.abs(r - 150);
        if (score < best) {
          best = score;
          tx = xx;
          ty = yy;
        }
      }
    }
  }
  return { img, data, W, H, tx, ty };
}

function drawZoom(ctx: CanvasRenderingContext2D, b: Bitmap, w: number, h: number, z: number) {
  ctx.fillStyle = BRAND.paper;
  ctx.fillRect(0, 0, w, h);
  const [ax, ay] = anchorAt(b, z, w, h);
  // Visible bitmap pixels.
  const x0 = Math.max(0, Math.floor(b.tx + 0.5 - ax / z)),
    x1 = Math.min(b.W, Math.ceil(b.tx + 0.5 + (w - ax) / z));
  const y0 = Math.max(0, Math.floor(b.ty + 0.5 - ay / z)),
    y1 = Math.min(b.H, Math.ceil(b.ty + 0.5 + (h - ay) / z));
  if (x1 <= x0 || y1 <= y0) return;
  const sx = (px: number) => ax + (px - b.tx - 0.5) * z;
  const sy = (py: number) => ay + (py - b.ty - 0.5) * z;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(b.img, x0, y0, x1 - x0, y1 - y0, sx(x0), sy(y0), (x1 - x0) * z, (y1 - y0) * z);

  // Subpixels: each pixel is three stripes, red, green and blue, lit by its own value. An unlit
  // stripe is the `off` colour: black on a screen, paper on the light scheme's printed page.
  const sub = seg(z, 36, 120);
  if (sub > 0 && (x1 - x0) * (y1 - y0) < 6000) {
    ctx.globalAlpha = sub;
    ctx.fillStyle = C.matrix;
    ctx.fillRect(sx(x0), sy(y0), (x1 - x0) * z, (y1 - y0) * z);
    const gap = z * 0.06;
    const [or, og, ob] = channels('off');
    const lit = (v: number, off: number) => Math.round(off + ((255 - off) * v) / 255);
    const dark = (v: number, off: number) => Math.round(off * (1 - v / 255));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * b.W + px) * 4;
        const X = sx(px),
          Y = sy(py),
          sw = z / 3;
        const r = b.data[i],
          g = b.data[i + 1],
          bl = b.data[i + 2];
        ctx.fillStyle = `rgb(${lit(r, or)},${dark(r, og)},${dark(r, ob)})`;
        ctx.fillRect(X + gap, Y + gap * 1.5, sw - gap * 1.4, z - gap * 3);
        ctx.fillStyle = `rgb(${dark(g, or)},${lit(g, og)},${dark(g, ob)})`;
        ctx.fillRect(X + sw + gap * 0.7, Y + gap * 1.5, sw - gap * 1.4, z - gap * 3);
        ctx.fillStyle = `rgb(${dark(bl, or)},${dark(bl, og)},${lit(bl, ob)})`;
        ctx.fillRect(X + 2 * sw + gap * 0.4, Y + gap * 1.5, sw - gap * 1.4, z - gap * 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  // The pixel grid.
  const grid = seg(z, 5, 14) * (1 - sub * 0.7);
  if (grid > 0) {
    ctx.strokeStyle = `rgba(6,7,10,${0.28 * grid})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let px = x0; px <= x1; px++) {
      const X = Math.round(sx(px)) + 0.5;
      ctx.moveTo(X, sy(y0));
      ctx.lineTo(X, sy(y1));
    }
    for (let py = y0; py <= y1; py++) {
      const Y = Math.round(sy(py)) + 0.5;
      ctx.moveTo(sx(x0), Y);
      ctx.lineTo(sx(x1), Y);
    }
    ctx.stroke();
  }

  // Outline the target pixel.
  const mark = seg(z, 8, 16);
  if (mark > 0) {
    ctx.strokeStyle = `rgba(124,77,255,${mark})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx(b.tx) - 1, sy(b.ty) - 1, z + 2, z + 2);
  }
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

export default function Surface() {
  const ui = useRef<HTMLDivElement>(null);
  const hire = useRef<HTMLAnchorElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const bitmap = useRef<Bitmap | null>(null);
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const reducedRef = useRef(reduced);
  const schemeRef = useRef(scheme);
  useEffect(() => {
    reducedRef.current = reduced;
    schemeRef.current = scheme;
  });

  const paint = (p: number) => {
    const b = bitmap.current,
      el = canvas.current,
      u = ui.current;
    if (!b || !el || !u || reducedRef.current) return;
    const z = zoomAt(p);
    const w = el.clientWidth,
      h = el.clientHeight;
    const [ax, ay] = anchorAt(b, z, w, h);
    // The DOM UI zooms the same way until the canvas takes over.
    u.style.setProperty('--z', z.toFixed(4));
    u.style.setProperty('--dx', `${(ax - b.tx - 0.5).toFixed(2)}px`);
    u.style.setProperty('--dy', `${(ay - b.ty - 0.5).toFixed(2)}px`);
    const show = seg(z, 2.2, 4);
    el.style.opacity = show.toFixed(3);
    u.style.opacity = (1 - seg(z, 3.5, 6)).toFixed(3);
    u.style.visibility = z > 6 ? 'hidden' : 'visible';
    if (readout.current)
      readout.current.parentElement!.style.opacity = (
        seg(z, 14, 30) *
        (1 - seg(p, 0.8, 0.86))
      ).toFixed(3);
    if (show <= 0) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = el.width / Math.max(1, w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColors(el, schemeRef.current);
    drawZoom(ctx, b, w, h, z);
  };
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });

  const [section, progress] = useSceneProgress<HTMLElement>(0, (p) => paintRef.current(p));

  useEffect(() => {
    paintRef.current(progress.current);
  }, [scheme, progress]);

  useEffect(() => {
    const u = ui.current,
      el = canvas.current;
    if (!u || !el) return;
    const build = () => {
      if (!hire.current || !label.current || reducedRef.current) return;
      el.width = Math.round(el.clientWidth * Math.min(2, window.devicePixelRatio || 1));
      el.height = Math.round(el.clientHeight * Math.min(2, window.devicePixelRatio || 1));
      const b = buildBitmap(u, hire.current, label.current);
      bitmap.current = b;
      if (b) {
        u.style.transformOrigin = `${b.tx + 0.5}px ${b.ty + 0.5}px`;
        const i = (b.ty * b.W + b.tx) * 4;
        const [r = 0, g = 0, bl = 0] = [b.data[i], b.data[i + 1], b.data[i + 2]];
        if (readout.current)
          readout.current.textContent = `pixel (${b.tx}, ${b.ty}) · rgb(${r} ${g} ${bl}) · ${hex(r, g, bl)}`;
      }
      paintRef.current(progress.current);
    };
    build();
    document.fonts?.ready.then(build);
    const observer = new ResizeObserver(build);
    observer.observe(u);
    return () => observer.disconnect();
  }, [progress]);

  return (
    <section ref={section} id="surface" className={s.surface} aria-labelledby="surface-title">
      <div className={s.surfaceStage}>
        <div ref={ui} className={s.ui}>
          <header className={s.uiBar}>
            <span className={s.uiMark}>{person.site}</span>
            <nav aria-label="Shortcuts">
              <a href="#render">Platforms</a>
              <a href="#kernel">Career</a>
              <a href="#contact">Contact</a>
            </nav>
          </header>
          <div className={s.uiHero}>
            <p className={s.uiKicker}>
              {profile.role} at {profile.company}
              {` · building since ${person.since}`}
            </p>
            <h1 id="surface-title">
              {GIVEN} <br />
              {FAMILY}
            </h1>
            <p className={s.uiLede}>
              {profile.tagline} {profile.lede.split('. ')[0]}.
            </p>
            <div className={s.uiActions}>
              <span className={s.hireWrap}>
                <a ref={hire} href="#contact" className={s.hire}>
                  <span ref={label}>{`Hire ${person.first}`}</span>
                </a>
                <svg className={s.cursor} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 2 L4 19 L8.6 14.8 L11.6 21.4 L14.4 20.2 L11.4 13.8 L17.6 13.6 Z" />
                </svg>
              </span>
              <span className={s.uiHint}>or scroll, and follow the click down the stack ↓</span>
            </div>
          </div>
        </div>
        <canvas ref={canvas} className={s.zoom} aria-hidden="true" />
        <p className={s.readout} aria-hidden="true">
          <span ref={readout} />
        </p>
        <p className={s.fall} aria-hidden="true">
          One anti-aliased pixel. Who decided its colour? <b>Down we go.</b>
        </p>
      </div>
    </section>
  );
}
