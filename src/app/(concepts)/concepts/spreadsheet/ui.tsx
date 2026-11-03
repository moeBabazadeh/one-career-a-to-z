'use client';

import { useSyncExternalStore, type ReactNode, type SVGProps } from 'react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

const PHONE = '(max-width: 640px)';

const subscribePhone = (fn: () => void) => {
  const mq = matchMedia(PHONE);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
};

/** True at phone widths. False on the server, so markup never branches on it before hydration settles. */
export const usePhone = () =>
  useSyncExternalStore(
    subscribePhone,
    () => matchMedia(PHONE).matches,
    () => false,
  );

/** Read at the moment of an event, for actions that differ on a phone. */
export const isPhone = () => typeof window !== 'undefined' && matchMedia(PHONE).matches;

/** The modifier key's label: ⌘ on a Mac, Ctrl elsewhere. Read in event handlers and effects only. */
export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Moves keyboard focus back to the grid after an edit or a toolbar action. */
export function focusGrid() {
  document.querySelector<HTMLElement>('[data-grid-focus]')?.focus({ preventScroll: true });
}

function Svg({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  app: () => (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
      <rect x={1} y={1} width={26} height={26} rx={6} fill="var(--brand)" />
      <path
        d="M7 9.5h14M7 14h14M7 18.5h14M12 6.5v15M17 6.5v15"
        stroke="var(--on-brand)"
        strokeWidth={1.4}
        opacity={0.9}
      />
      <rect
        x={7}
        y={6.5}
        width={14}
        height={15}
        rx={1.5}
        fill="none"
        stroke="var(--on-brand)"
        strokeWidth={1.4}
      />
    </svg>
  ),
  undo: () => (
    <Svg>
      <path d="M6.5 5 3.5 8l3 3" />
      <path d="M3.5 8h7a4 4 0 0 1 0 8H8" />
    </Svg>
  ),
  redo: () => (
    <Svg>
      <path d="m11.5 5 3 3-3 3" />
      <path d="M14.5 8h-7a4 4 0 0 0 0 8H10" />
    </Svg>
  ),
  percent: () => (
    <Svg>
      <path d="M13.5 4.5 4.5 13.5" />
      <circle cx={5.5} cy={5.5} r={1.6} />
      <circle cx={12.5} cy={12.5} r={1.6} />
    </Svg>
  ),
  decLess: () => (
    <Svg strokeWidth={1.3}>
      <text x={1} y={11} fontSize={8.5} fill="currentColor" stroke="none" fontFamily="inherit">
        .0
      </text>
      <path d="M16 14H9m0 0 2-2m-2 2 2 2" />
    </Svg>
  ),
  decMore: () => (
    <Svg strokeWidth={1.3}>
      <text x={0} y={11} fontSize={8.5} fill="currentColor" stroke="none" fontFamily="inherit">
        .00
      </text>
      <path d="M9 14h7m0 0-2-2m2 2-2 2" />
    </Svg>
  ),
  bold: () => (
    <Svg strokeWidth={2}>
      <path d="M5.5 3.5h4.2a2.8 2.8 0 0 1 0 5.6H5.5zM5.5 9.1h5a2.7 2.7 0 0 1 0 5.4h-5z" />
    </Svg>
  ),
  italic: () => (
    <Svg>
      <path d="M8 3.5h5M5 14.5h5M10.5 3.5l-3 11" />
    </Svg>
  ),
  alignLeft: () => (
    <Svg>
      <path d="M3 4.5h12M3 8h8M3 11.5h12M3 15h8" />
    </Svg>
  ),
  alignCenter: () => (
    <Svg>
      <path d="M3 4.5h12M5 8h8M3 11.5h12M5 15h8" />
    </Svg>
  ),
  alignRight: () => (
    <Svg>
      <path d="M3 4.5h12M7 8h8M3 11.5h12M7 15h8" />
    </Svg>
  ),
  sigma: () => (
    <Svg>
      <path d="M13.5 4.5v-1h-9l5 5.5-5 5.5h9v-1" />
    </Svg>
  ),
  trace: () => (
    <Svg>
      <circle cx={4} cy={13.5} r={1.8} fill="currentColor" />
      <path d="M5.5 12.2 13 5.5" />
      <path d="M9.6 5.2h3.7v3.7" />
    </Svg>
  ),
  further: () => (
    <Svg>
      <circle cx={3.5} cy={14} r={1.5} fill="currentColor" />
      <circle cx={8.5} cy={9} r={1.5} fill="currentColor" />
      <path d="M4.6 12.9 7.4 10M9.6 7.9l4.4-4.4M11 3.4h3.1v3.1" />
    </Svg>
  ),
  noArrows: () => (
    <Svg>
      <path d="M4.5 13.5 13 5M9.6 4.8h3.7v3.7" opacity={0.55} />
      <path d="m3.5 3.5 11 11" />
    </Svg>
  ),
  formulas: () => (
    <Svg>
      <path d="M7.5 15c1.5 0 1.8-1.3 2-3l.9-6.3c.2-1.4.7-2.2 2.1-2.2M6.5 8h5" />
      <path d="m11 10.5 4 4M15 10.5l-4 4" />
    </Svg>
  ),
  recalc: () => (
    <Svg>
      <path d="M14.5 9a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M14.5 3.5v3h-3" />
    </Svg>
  ),
  help: () => (
    <Svg>
      <circle cx={9} cy={9} r={6.5} />
      <path d="M7.1 7.2a2 2 0 1 1 2.6 1.9c-.5.2-.7.6-.7 1.1v.4" />
      <circle cx={9} cy={12.9} r={0.3} fill="currentColor" />
    </Svg>
  ),
  page: () => (
    <Svg>
      <path d="M4.5 2.5h6l3 3v10h-9z" />
      <path d="M10.5 2.5v3h3M6.5 8.5h5M6.5 11h5M6.5 13.5h3" />
    </Svg>
  ),
  sheet: () => (
    <Svg strokeWidth={1.3}>
      <rect x={3} y={3.5} width={12} height={11} rx={1.5} />
      <path d="M3 7.2h12M3 10.8h12M7 3.5v11" />
    </Svg>
  ),
  chevron: () => (
    <Svg>
      <path d="m5 7 4 4 4-4" />
    </Svg>
  ),
  link: () => (
    <Svg>
      <path d="M10 3.5h4.5V8M14.5 3.5 8 10M12.5 10.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </Svg>
  ),
  close: () => (
    <Svg>
      <path d="m4.5 4.5 9 9M13.5 4.5l-9 9" />
    </Svg>
  ),
  check: () => (
    <Svg strokeWidth={2}>
      <path d="m3.5 9.5 3.5 3.5 7.5-8" />
    </Svg>
  ),
  menu: () => (
    <Svg>
      <path d="M3 5h12M3 9h12M3 13h12" />
    </Svg>
  ),
  fx: () => (
    <svg width={22} height={16} viewBox="0 0 22 16" aria-hidden="true">
      <text
        x={2}
        y={12.5}
        fontSize={13}
        fontStyle="italic"
        style={{ fontFamily: 'var(--font-literata)' }}
        fill="currentColor"
      >
        f
      </text>
      <text
        x={8.5}
        y={12.5}
        fontSize={11.5}
        fontStyle="italic"
        style={{ fontFamily: 'var(--font-literata)' }}
        fill="currentColor"
      >
        x
      </text>
    </svg>
  ),
};
