import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { db, featuredProjects, profile } from '../_shared/data';
import { HOST } from './fs';
import s from './desktop.module.scss';

// gnome-screensaver's "Pictures folder" theme, playing the screenshots of what Moe shipped.
// The first key or click brings up the unlock dialog.

const SLIDES = featuredProjects.filter((p) => p.image.endsWith('.jpg'));

export default function Saver({ onExit, still }: { onExit: () => void; still: boolean }) {
  const [i, setI] = useState(0);
  const [locked, setLocked] = useState(false);
  const exit = useRef(onExit);
  useEffect(() => {
    exit.current = onExit;
  });

  useEffect(() => {
    if (still || locked) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), 5200);
    return () => window.clearInterval(t);
  }, [still, locked]);

  useEffect(() => {
    if (locked) return;
    let armed = false;
    const arm = window.setTimeout(() => (armed = true), 500);
    let origin: [number, number] | null = null;
    const wake = (e: Event) => {
      if (!armed) return;
      if (e instanceof PointerEvent && e.type === 'pointermove') {
        origin ??= [e.clientX, e.clientY];
        if (Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) < 8) return;
      }
      e.preventDefault();
      setLocked(true);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'];
    events.forEach((t) => addEventListener(t, wake, { capture: true }));
    return () => {
      window.clearTimeout(arm);
      events.forEach((t) => removeEventListener(t, wake, { capture: true }));
    };
  }, [locked]);

  const slide = SLIDES[i];
  return (
    <div className={s.saver} role="dialog" aria-label="Screensaver">
      <div key={slide.title} className={`${s.saverSlide} ${still ? '' : s.saverPan}`}>
        <Image
          src={slide.image}
          width={1280}
          height={800}
          alt={`${slide.title} screenshot`}
          sizes="100vw"
        />
      </div>
      <p className={s.saverCaption}>{slide.title}</p>
      {locked && (
        <div className={s.unlock} role="alertdialog" aria-labelledby="unlock-title">
          <Image src={db.person.photo} width={600} height={600} alt="" />
          <div>
            <p id="unlock-title">
              <b>{profile.name}</b>
            </p>
            <p>This computer, {HOST}, is locked.</p>
            <div className={s.btnRow}>
              <button type="button" className={s.btn} onClick={() => setLocked(false)}>
                Cancel
              </button>
              <button type="button" className={s.btn} autoFocus onClick={() => exit.current()}>
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
