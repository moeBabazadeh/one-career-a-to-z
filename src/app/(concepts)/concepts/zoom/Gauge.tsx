'use client';

import { useEffect, useRef, useState } from 'react';
import { LAYERS } from './layers';
import s from './stack.module.scss';

/**
 * The depth gauge: a jump list of every layer with a needle that follows the scroll. Depth runs
 * 0 → 9 on the way down and back to 0 on the climb out. On narrow screens it folds into a chip.
 */
export default function Gauge() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let tops: number[] = [],
      ascent = { top: 0, height: 0 },
      vh = 0,
      frame = 0,
      last = -1;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      let depth = 0;
      for (let i = 0; i < tops.length - 1; i++) {
        if (y >= tops[i])
          depth = i + Math.min(1, (y - tops[i]) / Math.max(1, tops[i + 1] - tops[i]));
      }
      depth = Math.min(9, depth);
      const climb = (y - ascent.top) / Math.max(1, ascent.height - vh);
      if (y >= ascent.top) depth = Math.max(0, 9 * (1 - Math.min(1, climb)));
      el.style.setProperty('--depth', depth.toFixed(3));
      el.dataset.on = y > vh * 0.35 ? 'true' : 'false';

      // The active layer is the one under the middle of the viewport; past the climb it's contact.
      const mid = y + vh / 2;
      let now = 0;
      for (let i = 0; i < tops.length - 1; i++) if (mid >= tops[i]) now = i;
      if (mid >= ascent.top) now = climb >= 1 ? 10 : -1;
      if (now !== last) setActive((last = now));
    };
    const measure = () => {
      vh = window.innerHeight;
      tops = [...LAYERS.map((l) => l.id), 'ascent'].map((id) => {
        const sec = document.getElementById(id);
        return sec ? sec.getBoundingClientRect().top + window.scrollY : 0;
      });
      const a = document.getElementById('ascent');
      if (a)
        ascent = { top: a.getBoundingClientRect().top + window.scrollY, height: a.offsetHeight };
      update();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const current = active >= 0 && active < LAYERS.length ? LAYERS[active] : null;

  return (
    <nav
      ref={root}
      className={s.gauge}
      aria-label="Depth gauge"
      data-open={open}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      style={{ '--accent': current?.accent ?? 'var(--orange-ink)' } as React.CSSProperties}
    >
      <button
        type="button"
        className={s.gaugeChip}
        aria-expanded={open}
        aria-controls="gauge-list"
        onClick={() => setOpen(!open)}
      >
        <span className={s.gaugeChipDepth}>
          {current ? `L${current.n}` : active === 10 ? '↑' : '▲'}
        </span>
        <span>{current ? current.tech : active === 10 ? 'Contact' : 'Climbing'}</span>
        <span aria-hidden="true" className={s.gaugeCaret}>
          ▾
        </span>
      </button>
      <div className={s.gaugePanel}>
        <p className={s.gaugeTitle} aria-hidden="true">
          <span>Depth</span>
          <span>
            {current ? current.scale : active === 10 ? 'back at the surface' : 'climbing'}
          </span>
        </p>
        <div className={s.gaugeScale}>
          <span className={s.needle} aria-hidden="true" />
          <ol id="gauge-list" className={s.gaugeList}>
            {LAYERS.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  aria-current={active === l.n ? 'location' : undefined}
                  onClick={() => setOpen(false)}
                  style={{ '--accent': l.accent } as React.CSSProperties}
                >
                  <span className={s.gaugeN}>{String(l.n).padStart(2, '0')}</span>
                  <span className={s.gaugeTech}>{l.tech}</span>
                  <span className={s.gaugeTopic}>{l.topic}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
        <a
          href="#contact"
          className={s.gaugeUp}
          aria-current={active === 10 ? 'location' : undefined}
          onClick={() => setOpen(false)}
        >
          ↑ Back up to contact
        </a>
      </div>
    </nav>
  );
}
