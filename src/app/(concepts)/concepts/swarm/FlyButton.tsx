'use client';

import { flyTo } from './store';
import s from './swarm.module.scss';

/** Sends the swarm to a waypoint and brings the ground station into view. */
export default function FlyButton({
  wp,
  label,
  children,
}: {
  wp: number;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={s.fly}
      aria-label={label}
      onClick={() => {
        flyTo(wp);
        document.getElementById('gcs')?.scrollIntoView({ block: 'start' });
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 13 L8 3 L13 13 L8 10.4 Z" />
      </svg>
      {children ?? 'Fly it'}
    </button>
  );
}
