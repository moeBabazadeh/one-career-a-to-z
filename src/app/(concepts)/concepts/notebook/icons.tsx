// The notebook's toolbar glyphs, drawn on a 16px grid with a 1.5px stroke.
import type { ReactNode } from 'react';

const icon = (path: ReactNode, filled = false) =>
  function Icon() {
    return (
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {path}
      </svg>
    );
  };

export const I = {
  logo: function Logo() {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <rect x="3.5" y="2.5" width="17" height="19" rx="3" fill="var(--accent)" />
        <path
          d="M7 7.5h3M7 11h6M7 14.5h4.5"
          stroke="var(--on-accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M14.5 15.5l2.2-2.2-2.2-2.2"
          stroke="var(--on-accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  },
  run: icon(<path d="M5 3.5v9l7.5-4.5z" />, true),
  stop: icon(<rect x="4" y="4" width="8" height="8" rx="1.2" />, true),
  restart: icon(
    <>
      <path d="M12.8 6.2A5 5 0 1 0 13 9.5" />
      <path d="M13.2 2.8v3.6H9.6" />
    </>,
  ),
  runAll: icon(<path d="M2.5 3.5v9l5.5-4.5zM8.5 3.5v9l5.5-4.5z" />, true),
  plus: icon(<path d="M8 3v10M3 8h10" />),
  cut: icon(
    <>
      <circle cx="4.5" cy="11.5" r="2" />
      <circle cx="11.5" cy="11.5" r="2" />
      <path d="M5.8 10L11 3M10.2 10L5 3" />
    </>,
  ),
  copy: icon(
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </>,
  ),
  paste: icon(
    <>
      <rect x="3" y="3.5" width="10" height="10.5" rx="1.5" />
      <path d="M6 3.5V2.5h4v1M6 8h4M6 10.5h3" />
    </>,
  ),
  up: icon(<path d="M8 13V3M4 7l4-4 4 4" />),
  down: icon(<path d="M8 3v10M4 9l4 4 4-4" />),
  trash: icon(
    <>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.6a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.6" />
    </>,
  ),
  duplicate: icon(
    <>
      <rect x="2.5" y="2.5" width="8" height="8" rx="1.5" />
      <path d="M13.5 6v6.5a1 1 0 0 1-1 1H6M10.5 13.5" />
    </>,
  ),
  save: icon(
    <>
      <path d="M3 3.5a1 1 0 0 1 1-1h6.5l2.5 2.5V12.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M5.5 2.5v3h4v-3M5 13.5V9.5h6v4" />
    </>,
  ),
  page: icon(
    <>
      <path d="M4 2.5h5.5L12.5 5.5v8H4z" />
      <path d="M9.5 2.5v3h3M6 8.5h4.5M6 11h4.5" />
    </>,
  ),
  toc: icon(<path d="M2.5 4h1M6 4h7.5M2.5 8h1M6 8h7.5M2.5 12h1M6 12h7.5" />),
  close: icon(<path d="M4 4l8 8M12 4l-8 8" />),
  menu: icon(<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />),
  keyboard: icon(
    <>
      <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" />
      <path d="M4 6.5h.5M6.5 6.5H7M9 6.5h.5M11.5 6.5h.5M4.5 10h7" />
    </>,
  ),
  back: icon(<path d="M10 3.5L5.5 8l4.5 4.5" />),
  clear: icon(
    <>
      <path d="M3 13.5h10M5 10.5l6-6M5.5 4.5h7v0" />
    </>,
  ),
};
