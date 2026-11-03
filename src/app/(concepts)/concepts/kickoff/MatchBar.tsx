'use client';

import { useEffect, useRef } from 'react';
import { profile } from '../_shared/data';
import RobotTop from './RobotTop';
import s from './robocup.module.scss';

export interface Stop {
  id: string;
  label: string;
  minute: string;
}

/**
 * The sticky top bar: the page as a 90-minute match. The ball runs along the track as you
 * scroll, the clock reads the minute, and the section you're in lights up.
 */
export default function MatchBar({ stops }: { stops: Stop[] }) {
  const bar = useRef<HTMLElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLElement>(null);

  useEffect(() => {
    let frame = 0;
    let shown = '';
    const update = () => {
      frame = 0;
      const el = bar.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      el.style.setProperty('--p', p.toFixed(4));
      if (clock.current) clock.current.textContent = `${Math.round(p * 90)}'`;
      let active = stops[0].id;
      for (const st of stops) {
        const sec = document.getElementById(st.id);
        if (sec && sec.getBoundingClientRect().top < innerHeight * 0.4) active = st.id;
      }
      if (active === shown) return;
      shown = active;
      el.querySelectorAll<HTMLAnchorElement>('a[data-stop]').forEach((a) => {
        if (a.getAttribute('data-stop') !== active) return a.removeAttribute('aria-current');
        a.setAttribute('aria-current', 'location');
        // on phones the stops scroll sideways: keep the current one in sight
        const t = track.current;
        if (t && t.scrollWidth > t.clientWidth) t.scrollTo({ left: a.offsetLeft - 16 });
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, [stops]);

  return (
    <header ref={bar} className={s.bar}>
      <a href="#kickoff" className={s.brand}>
        <RobotTop id={7} className={s.brandBot} />
        <span>
          <b>{profile.name}</b>
          <i>Kickoff</i>
        </span>
      </a>
      <nav ref={track} aria-label="Sections" className={s.track}>
        <ol>
          {stops.map((st) => (
            <li key={st.id}>
              <a href={`#${st.id}`} data-stop={st.id}>
                <i>{st.minute}</i>
                {st.label}
              </a>
            </li>
          ))}
        </ol>
        <span className={s.trackBall} aria-hidden="true" />
      </nav>
      <span className={s.minute} aria-hidden="true">
        <span ref={clock}>0&apos;</span>
      </span>
    </header>
  );
}
