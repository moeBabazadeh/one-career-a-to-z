'use client';

import { useEffect, useRef } from 'react';
import { useAnimationFrame, useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { MODE, clamp, readColors } from './kit';

/**
 * Scroll progress through a sticky scene: 0 when the section's top reaches the top of the
 * viewport, 1 when its bottom reaches the bottom. Positions are measured on resize only, so a
 * scroll costs one read of scrollY and a few style writes, never a layout read.
 *
 * Writes `--p` (progress) and `--in` (how far the section has slid into view) on the section,
 * and `data-step` when the scene is split into `steps`. `onProgress` runs on the same frame.
 */
export function useSceneProgress<T extends HTMLElement>(
  steps = 0,
  onProgress?: (p: number) => void,
) {
  const ref = useRef<T>(null);
  const progress = useRef(0);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let top = 0,
      height = 0,
      vh = 0,
      frame = 0,
      step = -1,
      lastP = '',
      lastIn = '';

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const p = clamp((y - top) / Math.max(1, height - vh));
      const enter = clamp((y - top + vh) / vh);
      progress.current = p;
      const ps = p.toFixed(4),
        ins = enter.toFixed(3);
      if (ps !== lastP) el.style.setProperty('--p', (lastP = ps));
      if (ins !== lastIn) el.style.setProperty('--in', (lastIn = ins));
      if (steps) {
        const k = Math.min(steps - 1, Math.floor(p * steps));
        if (k !== step) el.dataset.step = String((step = k));
      }
      onProgressRef.current?.(p);
    };
    const measure = () => {
      const r = el.getBoundingClientRect();
      top = r.top + window.scrollY;
      height = r.height;
      vh = window.innerHeight;
      update();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    observer.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, [steps]);

  return [ref, progress] as const;
}

export type SceneDraw = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  p: number,
) => void;

/**
 * A canvas that fills its stage and redraws every frame while the stage is on screen, with the
 * clock in seconds and the scene's scroll progress. With reduced motion it paints a single
 * still at `poster` progress, and again on resize or a change of scheme.
 */
export function useStageCanvas(
  draw: SceneDraw,
  progress: React.RefObject<number>,
  poster = 0.6,
  still = 2.4,
) {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  const clock = useRef(still);
  const reducedRef = useRef(reduced);
  const schemeRef = useRef(scheme);
  useEffect(() => {
    drawRef.current = draw;
    reducedRef.current = reduced;
    schemeRef.current = scheme;
  });

  const paint = () => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = el.width / Math.max(1, el.clientWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColors(el, schemeRef.current);
    const still = reducedRef.current;
    MODE.still = still;
    drawRef.current(
      ctx,
      el.clientWidth,
      el.clientHeight,
      clock.current,
      still ? poster : progress.current,
    );
  };
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });

  // Fit the backing store to the box and the device pixel ratio.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      // Cap the backing store: very tall stages (a stretched viewport) must stay under canvas limits.
      const dpr = Math.min(
        w * h > 1_000_000 ? 1.5 : 2,
        window.devicePixelRatio || 1,
        8000 / Math.max(1, w, h),
      );
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      paintRef.current();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    document.fonts?.ready.then(() => paintRef.current());
    return () => observer.disconnect();
  }, []);

  // Repaint the still when motion preference flips.
  useEffect(() => {
    if (reduced) {
      clock.current = still;
      paintRef.current();
    }
  }, [reduced, still]);

  // Repaint in the other scheme's colours straight away, still or not.
  useEffect(() => {
    paintRef.current();
  }, [scheme]);

  useAnimationFrame((sec) => {
    clock.current = sec;
    paintRef.current();
  }, visible && !reduced);

  return { wrap, canvas, visible };
}
