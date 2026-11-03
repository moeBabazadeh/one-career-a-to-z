'use client';

// The VFO readout, tuned a digit at a time: scroll on a digit, drag it up or down, click its
// upper or lower half, or focus the readout and use the arrows (←/→ pick a digit, ↑/↓ change
// it) or type digits over it.
import { Fragment, useEffect, useRef } from 'react';
import { hz } from './units';
import s from './radio.module.scss';

export const PLACES = 10;
export const F_MIN = 1e6;
export const F_MAX = 6e9;

interface Props {
  value: number;
  place: number;
  onChange: (f: number) => void;
  onPlace: (p: number) => void;
}

export function Readout({ value, place, onChange, onPlace }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef({ value, place, onChange, onPlace });
  const drag = useRef<{ p: number; y: number; acc: number; moved: boolean; top: boolean } | null>(
    null,
  );
  useEffect(() => {
    live.current = { value, place, onChange, onPlace };
  });

  // Wheel needs a non-passive listener to keep the page still while a digit turns.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const digit = (e.target as HTMLElement).closest<HTMLElement>('[data-place]');
      if (!digit) return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 30) return;
      const p = Number(digit.dataset.place);
      const dir = acc < 0 ? 1 : -1;
      acc = 0;
      live.current.onPlace(p);
      live.current.onChange(live.current.value + dir * 10 ** p);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const step = (p: number, dir: number) => onChange(value + dir * 10 ** p);

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    let handled = true;
    if (k === 'ArrowLeft') onPlace(Math.min(PLACES - 1, place + 1));
    else if (k === 'ArrowRight') onPlace(Math.max(0, place - 1));
    else if (k === 'ArrowUp') step(place, 1);
    else if (k === 'ArrowDown') step(place, -1);
    else if (k === 'PageUp') step(Math.min(PLACES - 1, place + 1), 1);
    else if (k === 'PageDown') step(Math.min(PLACES - 1, place + 1), -1);
    else if (/^[0-9]$/.test(k)) {
      // Typing over a digit replaces it and moves on, like the dial of a bench receiver.
      const cur = Math.floor(value / 10 ** place) % 10;
      onChange(value + (Number(k) - cur) * 10 ** place);
      onPlace(Math.max(0, place - 1));
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onDown = (e: React.PointerEvent<HTMLSpanElement>, p: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { p, y: e.clientY, acc: 0, moved: false, top: e.clientY < r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    onPlace(p);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) >= 12) {
      d.moved = true;
      d.y = e.clientY;
      live.current.onChange(live.current.value + Math.sign(dy) * 10 ** d.p);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) step(d.p, d.top ? 1 : -1);
  };

  const digits = String(Math.round(value)).padStart(PLACES, '0');
  const lead = digits.search(/[1-9]/);

  return (
    <div
      ref={ref}
      className={s.readout}
      role="spinbutton"
      tabIndex={0}
      aria-label="Frequency. Left and right pick a digit, up and down change it."
      aria-valuenow={Math.round(value)}
      aria-valuemin={F_MIN}
      aria-valuemax={F_MAX}
      aria-valuetext={hz(value)}
      onKeyDown={onKey}
    >
      {digits.split('').map((d, i) => {
        const p = PLACES - 1 - i;
        return (
          <Fragment key={p}>
            <span
              data-place={p}
              className={`${s.digit} ${p === place ? s.digitOn : ''} ${i < lead ? s.digitLead : ''}`}
              onPointerDown={(e) => onDown(e, p)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => (drag.current = null)}
            >
              {d}
            </span>
            {p % 3 === 0 && p > 0 && (
              <span className={`${s.sep} ${i < lead ? s.digitLead : ''}`}>.</span>
            )}
          </Fragment>
        );
      })}
      <span className={s.unit}>Hz</span>
    </div>
  );
}
