'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { readScheme, subscribeScheme, type Scheme } from './scheme';

const REDUCED = '(prefers-reduced-motion: reduce)';

const subscribeReduced = (onChange: () => void) => {
  const query = matchMedia(REDUCED);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** True when the visitor asked for less motion. Always false on the server. */
export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReduced,
    () => matchMedia(REDUCED).matches,
    () => false,
  );

/**
 * The scheme in effect, light or dark, for drawing code (canvas, colours computed in JS) that
 * has to repaint when it changes. Always light on the server, so never branch markup on it:
 * style markup with CSS tokens and the scheme mixins instead.
 */
export const useScheme = () =>
  useSyncExternalStore<Scheme>(subscribeScheme, readScheme, () => 'light');

/**
 * Tracks whether an element is on screen. With `once`, it stays true after the first sighting,
 * which suits entrance animations; without it, it follows the element in and out, which suits
 * pausing loops that are off screen.
 */
export function useInView<T extends Element>(once = true, threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold]);

  return [ref, inView] as const;
}

/**
 * A canvas that draws in a fixed W x H coordinate space at any CSS size. The context is
 * scaled to the element (and the device pixel ratio) and `paint` runs again on every resize.
 */
export function useScaledCanvas(
  W: number,
  H: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.clientWidth || W;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(((width * H) / W) * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      paintRef.current(ctx);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [W, H]);

  return ref;
}

/** Calls `draw(time)` every animation frame while `active`. */
export function useAnimationFrame(draw: (seconds: number) => void, active: boolean) {
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const loop = (ms: number) => {
      drawRef.current(ms / 1000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}
