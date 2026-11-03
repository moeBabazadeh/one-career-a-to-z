// Compiz's magic lamp: a minimised window pours into its window-list button through a curved
// funnel. A single transform can't bend a window, so the window is copied into horizontal
// bands; each band is clipped to its slice and mapped onto its own quad (see geom.ts), and
// the quads stack up into the funnel's curve. The copies live for the length of the effect.

import { bandToQuad, clamp, easeInOut, lerp, smooth, type Quad } from './geom';

const BANDS = 16;

/** The funnel at progress t (0 is the window, 1 is the button): each band's quad. */
function funnel(S: DOMRect, T: DOMRect, t: number): Quad[] {
  // The sides bend in first, then the window slides down the funnel into the button.
  const bend = smooth(t / 0.42);
  const slide = easeInOut(clamp((t - 0.2) / 0.8, 0, 1));
  const span = Math.max(1, T.top - S.top);
  const line = (v: number): [number, number, number] => {
    const y = lerp(S.top + v * S.height, T.top + v * T.height, slide);
    const k = bend * smooth((y - S.top) / span);
    return [lerp(S.left, T.left, k), lerp(S.right, T.right, k), y];
  };
  const quads: Quad[] = [];
  let top = line(0);
  for (let i = 1; i <= BANDS; i++) {
    const bottom = line(i / BANDS);
    quads.push([
      [top[0], top[2]],
      [top[1], top[2]],
      [bottom[1], bottom[2]],
      [bottom[0], bottom[2]],
    ]);
    top = bottom;
  }
  return quads;
}

/** Copies a window for the effect: no ids, not focusable, canvases repainted. */
function copy(win: HTMLElement, w: number, h: number) {
  const clone = win.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  Object.assign(clone.style, {
    left: '0px',
    top: '0px',
    width: `${w}px`,
    height: `${h}px`,
    transform: '',
    visibility: 'visible',
    zIndex: '0',
  });
  const from = win.querySelectorAll('canvas');
  clone.querySelectorAll('canvas').forEach((c, i) => {
    const src = from[i];
    if (!src) return;
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d')?.drawImage(src, 0, 0);
  });
  return clone;
}

/**
 * Plays the lamp from the window to the button (`in`, minimising) or back (`out`, restoring).
 * The real window should be hidden while it plays.
 */
export function lamp(
  win: HTMLElement,
  layer: HTMLElement,
  button: DOMRect,
  dir: 'in' | 'out',
  ms = 440,
): Promise<void> {
  const S = win.getBoundingClientRect();
  const w = win.offsetWidth,
    h = win.offsetHeight;
  const bands = Array.from({ length: BANDS }, (_, i) => {
    const band = document.createElement('div');
    const y0 = (i * h) / BANDS,
      y1 = ((i + 1) * h) / BANDS;
    // Each band overlaps its neighbours by a pixel, so no seams show between them.
    Object.assign(band.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: `${w}px`,
      height: `${h}px`,
      transformOrigin: '0 0',
      clipPath: `inset(${Math.max(0, y0 - 0.75)}px 0 ${Math.max(0, h - y1 - 0.75)}px 0)`,
      willChange: 'transform',
    });
    band.appendChild(copy(win, w, h));
    layer.appendChild(band);
    return { band, y0, y1 };
  });
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const p = clamp((now - start) / ms, 0, 1);
      const t = dir === 'in' ? p : 1 - p;
      const quads = funnel(S, button, t);
      bands.forEach(({ band, y0, y1 }, i) => {
        band.style.transform = bandToQuad(w, y0, y1, quads[i]);
        band.style.opacity = String(1 - smooth((t - 0.8) / 0.2) * 0.85);
      });
      if (p < 1) requestAnimationFrame(step);
      else {
        bands.forEach(({ band }) => band.remove());
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
