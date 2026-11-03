import type { GlyphName } from './stock';

// Line drawings for the packaging: one per kind of thing in the machine.
const PATHS: Record<GlyphName, React.ReactNode> = {
  gauge: (
    <>
      <path d="M4.5 16a7.5 7.5 0 1 1 15 0" />
      <path d="M12 16l4-5" />
      <circle cx="12" cy="16" r="1.4" />
      <path d="M7 12.5l1 .8M12 8.5v1.3M17 12.5l-1 .8" />
      <path d="M8 20h8" />
    </>
  ),
  plc: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M7 8.5h3M7 11h3M14 8.5h3M14 11h3" />
      <path d="M6.5 15.5h11" />
      <path d="M8 19v1.6M12 19v1.6M16 19v1.6M8 3.4V5M12 3.4V5M16 3.4V5" />
    </>
  ),
  reader: (
    <>
      <rect x="5" y="3.5" width="11" height="17" rx="2" />
      <rect x="7.5" y="6" width="6" height="4" rx=".6" />
      <circle cx="10.5" cy="15" r="2" />
      <path d="M18.5 9.5a4 4 0 0 1 0 5M20.5 7.5a7 7 0 0 1 0 9" />
    </>
  ),
  beacon: (
    <>
      <circle cx="12" cy="13" r="4.5" />
      <path d="M10.5 11l3 3.2-1.5 1.4V9.8l1.5 1.4-3 3.2" />
      <path d="M5.5 8a8.5 8.5 0 0 1 13 0M3 5.5a12 12 0 0 1 18 0" />
    </>
  ),
  robot: (
    <>
      <path d="M5 17.5a7 4.5 0 0 0 14 0V12a7 4.5 0 0 0-14 0z" />
      <path d="M5 12a7 4.5 0 0 0 14 0" />
      <circle cx="9.5" cy="9.6" r=".9" />
      <circle cx="14.5" cy="9.6" r=".9" />
      <path d="M12 7.5V4M10.5 4h3" />
      <circle cx="17.5" cy="19.5" r="1.4" />
    </>
  ),
  drone: (
    <>
      <rect x="9.5" y="10" width="5" height="4" rx="1" />
      <path d="M9.5 11L6 7.5M14.5 11L18 7.5M9.5 13L6 16.5M14.5 13L18 16.5" />
      <ellipse cx="6" cy="7.5" rx="3" ry="1" />
      <ellipse cx="18" cy="7.5" rx="3" ry="1" />
      <ellipse cx="6" cy="16.5" rx="3" ry="1" />
      <ellipse cx="18" cy="16.5" rx="3" ry="1" />
    </>
  ),
  trophy: (
    <>
      <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 6H5a2.5 2.5 0 0 0 2.6 3.6M16.5 6H19a2.5 2.5 0 0 1-2.6 3.6" />
      <path d="M12 13.5V17M8.5 20h7l-.8-3H9.3z" />
    </>
  ),
  medal: (
    <>
      <path d="M8 3l2.5 6M16 3l-2.5 6M10 3h4" />
      <circle cx="12" cy="14.5" r="5.5" />
      <path d="M12 11.5l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.8" width="10" height="18.4" rx="2.2" />
      <path d="M10.5 5.2h3" />
      <rect x="9" y="8" width="2.6" height="2.6" rx=".6" />
      <rect x="12.4" y="8" width="2.6" height="2.6" rx=".6" />
      <rect x="9" y="11.6" width="2.6" height="2.6" rx=".6" />
      <circle cx="12" cy="18.4" r=".8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5c-2.6-2.6-3.6-5.4-3.6-8.5s1-5.9 3.6-8.5z" />
    </>
  ),
  pulse: (
    <>
      <path d="M2.5 12.5h4l2-5 3.5 10 2.5-7 1.6 2h5.4" />
      <circle cx="19.5" cy="6" r="1.6" />
      <path d="M17 3.8a3.5 3.5 0 0 0 0 4.4M22 3.8a3.5 3.5 0 0 1 0 4.4" />
    </>
  ),
  photo: (
    <>
      <rect x="3" y="6" width="13" height="11" rx="1.6" />
      <rect x="8" y="3" width="13" height="11" rx="1.6" />
      <path d="M8 11.5l3.5-3 3 2.5 2-1.5 4.5 3.5" />
      <circle cx="17" cy="6.6" r="1" />
    </>
  ),
  keypad: (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="2" />
      <path
        d="M8 7h.1M12 7h.1M16 7h.1M8 11h.1M12 11h.1M16 11h.1M8 15h.1M12 15h.1M16 15h.1"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M10 18.5h4" />
    </>
  ),
  cap: (
    <>
      <path d="M2.5 9.5L12 5l9.5 4.5L12 14z" />
      <path d="M6.5 11.5v4c1.5 1.6 3.4 2.4 5.5 2.4s4-.8 5.5-2.4v-4" />
      <path d="M21.5 9.5v5.5" />
    </>
  ),
  paper: (
    <>
      <path d="M6 3h8.5L19 7.5V21H6z" />
      <path d="M14.5 3v4.5H19" />
      <path d="M8.5 12h8M8.5 15h8M8.5 18h5" />
      <path d="M8.5 7h3.5" />
    </>
  ),
  merge: (
    <>
      <circle cx="7" cy="5.5" r="2" />
      <circle cx="7" cy="18.5" r="2" />
      <circle cx="17" cy="12.5" r="2" />
      <path d="M7 7.5v9M7 9c0 3 3 3.5 8 3.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="1.6" />
      <path d="M3.5 6.5l8.5 7 8.5-7" />
    </>
  ),
  doc: (
    <>
      <path d="M6 3h12v18H6z" />
      <path d="M9 7h6M9 10.5h6M9 14h6M9 17.5h3.5" />
    </>
  ),
  code: (
    <>
      <path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14" />
    </>
  ),
};

export default function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
