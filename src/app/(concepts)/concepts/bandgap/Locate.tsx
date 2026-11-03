'use client';

import { useReducedMotion } from '../_shared/hooks';
import { select } from './selection';
import s from './bandgap.module.scss';

/** "Show in the diagram": opens a part of the device from the reading path and scrolls up to it. */
export default function Locate({ id, name }: { id: string; name: string }) {
  const reduced = useReducedMotion();
  return (
    <button
      type="button"
      className={s.locate}
      aria-label={`Show ${name} in the band diagram`}
      onClick={() => {
        select(id);
        document
          .getElementById('device')
          ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        document.getElementById('device-notes')?.focus({ preventScroll: true });
      }}
    >
      <span aria-hidden="true">↑</span> in the diagram
    </button>
  );
}
