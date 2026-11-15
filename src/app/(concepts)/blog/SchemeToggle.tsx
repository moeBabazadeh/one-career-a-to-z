'use client';

import { useSyncExternalStore } from 'react';
import { readScheme, subscribeScheme, writeScheme } from '../concepts/_shared/scheme';
import s from './blog.module.scss';

/** Light or dark for the blog, the same choice the themes use. CSS picks the icon, so it is right before hydration. */
export default function SchemeToggle() {
  const dark = useSyncExternalStore(
    subscribeScheme,
    () => readScheme() === 'dark',
    () => false,
  );
  return (
    <button
      type="button"
      className={s.scheme}
      onClick={() => writeScheme(dark ? 'light' : 'dark')}
      aria-label="Dark mode"
      aria-pressed={dark}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className={s.moon}>
        <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
      </svg>
      <svg viewBox="0 0 16 16" aria-hidden="true" className={s.sun}>
        <path d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
      </svg>
    </button>
  );
}
