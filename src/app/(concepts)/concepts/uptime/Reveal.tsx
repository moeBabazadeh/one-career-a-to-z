'use client';

import { useEffect, useRef } from 'react';
import s from './loadtest.module.scss';

/**
 * Fades its content in the first time it scrolls into view. Anything already on screen at
 * load is left alone, and nothing is hidden without JavaScript or with reduced motion.
 */
export default function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      el.getBoundingClientRect().top < innerHeight
    )
      return;
    el.dataset.reveal = 'out';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = 'in';
        observer.disconnect();
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={s.reveal}>
      {children}
    </div>
  );
}
