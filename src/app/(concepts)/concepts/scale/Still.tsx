'use client';

import { useEffect, useRef } from 'react';
import { useScheme } from '../_shared/hooks';
import { paintStill } from './engine';
import { loadPhoto, readFonts, readPalette } from './paint';
import { STOPS } from './stops';
import s from './powers.module.scss';

/** One stop of the zoom as a still picture, for visitors who asked for less motion. */
export default function Still({ index, label }: { index: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scheme = useScheme();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let photo: HTMLCanvasElement | null = null;
    let alive = true;
    const draw = () => alive && paintStill(canvas, index, photo);
    readPalette(canvas);
    readFonts();
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    document.fonts?.ready.then(() => {
      readFonts();
      draw();
    });
    if (STOPS[index].decor === 'photo') {
      loadPhoto().then((p) => {
        photo = p;
        draw();
      });
    }
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [index, scheme]);

  return <canvas ref={ref} className={s.still} role="img" aria-label={label} />;
}
