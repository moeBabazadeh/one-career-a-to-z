'use client';

import { useEffect, useRef } from 'react';
import { drawItem, type ItemId } from './items';
import s from './factory.module.scss';

/** An item sprite, drawn by the same code as the belts. */
export default function Icon({ id, size = 18 }: { id: ItemId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawItem(ctx, id, size / 2, size / 2, size * 0.78);
  }, [id, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className={s.icon}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
