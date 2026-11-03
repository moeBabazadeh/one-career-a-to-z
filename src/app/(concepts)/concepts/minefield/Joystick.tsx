'use client';

import { useRef, useState } from 'react';
import s from './minefield.module.scss';

/**
 * A thumb stick for driving on a touch screen (a mouse works too). Up drives forward, down
 * reverses, sideways turns; the further from the centre, the faster. Letting go stops.
 */
export default function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const move = (e: React.PointerEvent) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R,
      y = (e.clientY - (r.top + R)) / R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    setKnob({ x, y });
    onChange(x, y);
  };

  const release = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div className={s.stick}>
      <div
        ref={base}
        className={s.stickBase}
        role="img"
        aria-label="Drive stick: push up to drive forward, down to reverse, sideways to turn"
        onPointerDown={(e) => {
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => {
          if (pointer.current === e.pointerId) move(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <span className={s.stickRing} aria-hidden="true" />
        <span
          className={s.stickKnob}
          style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
