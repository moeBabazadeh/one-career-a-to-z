/*
 * Line glyphs in the manner of a system symbol set: 24-unit grid, round caps, one stroke weight
 * that follows the text weight. Drawn here, so there's no third-party mark anywhere.
 */
const PATHS = {
  person: 'M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.2c.9-3.6 3.9-5.6 7.5-5.6s6.6 2 7.5 5.6',
  people:
    'M9 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM2.8 19.4c.8-3 3.2-4.7 6.2-4.7s5.4 1.7 6.2 4.7M16 4.9a3.2 3.2 0 0 1 0 6.2M17.6 14.9c1.9.5 3.2 2 3.7 4.3',
  briefcase:
    'M3.5 8.2h17v11h-17zM8.5 8.2V6a1.6 1.6 0 0 1 1.6-1.6h3.8A1.6 1.6 0 0 1 15.5 6v2.2M3.5 13h17M10.5 13v1.6h3V13',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  apps: 'M5.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18.5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.5 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18.5 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM9.5 4v3M14.5 4v3M9.5 17v3M14.5 17v3M4 9.5h3M4 14.5h3M17 9.5h3M17 14.5h3',
  branch:
    'M7 4.5v15M7 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM7 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17 9.5c0 4.5-10 3.5-10 7',
  leaf: 'M5 19c0-8.5 5.5-14 15-14 0 9.5-5.5 15-14 15M5 19c2.5-4.5 6-7.5 10-9.5',
  envelope: 'M3.5 6h17v12h-17zM3.8 6.4 12 13l8.2-6.6',
  cube: 'M12 3 20 7.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  doc: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15h6M9 18h4',
  house: 'M4 11 12 4.5l8 6.5M6 9.5V19.5h4.5v-5h3v5H18V9.5',
  recenter:
    'M12 4V2.5M12 21.5V20M4 12H2.5M21.5 12H20M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z',
  close: 'M7 7l10 10M17 7 7 17',
  chevronDown: 'M6.5 9.5 12 15l5.5-5.5',
  chevronRight: 'M9.5 6.5 15 12l-5.5 5.5',
  chevronLeft: 'M14.5 6.5 9 12l5.5 5.5',
  external: 'M9 5h10v10M19 5 6 18',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  sun: 'M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4ZM12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z',
  auto: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 3.5v17',
  keyboard: 'M3 6.5h18v11H3zM6.5 10h1M10 10h1M13.5 10h1M17 10h.5M6.5 13.5h1M17 13.5h.5M10 13.5h4',
  motion: 'M8 3.5h8v17H8zM11 17.5h2M4.5 8c-1.3 2.4-1.3 5.6 0 8M19.5 8c1.3 2.4 1.3 5.6 0 8',
  star: 'M12 3.8 14.5 9l5.6.6-4.2 3.8 1.2 5.5L12 16.1l-5.1 2.8 1.2-5.5L3.9 9.6 9.5 9z',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5',
  timeline: 'M4 6.5h9M8 12h12M4 17.5h7M4 3.5v17',
  mountains: 'M2.5 19.5 9 9l4 6 2.5-3.5 6 8zM16.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  rotate: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  copy: 'M8.5 8.5h11v11h-11zM5 15.5H4.5v-11h11V5',
  check: 'M5 12.5 10 17.5 19 7',
  link: 'M10 14a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2',
  code: 'M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15',
  card: 'M3.5 5.5h17v13h-17zM7 14.5h4M7 10.5h2.5a1.5 1.5 0 1 1 0 3H7zM14 10h3.5M14 13h3.5',
  store: 'M6 3.5h12v17H6zM10.5 17.5h3',
  globe:
    'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  crown: 'M8.5 3.5h7v4h-7zM8.5 16.5h7v4h-7zM6 7.5h12v9H6zM9 10v3.5M12 10v3.5M15 10v3.5',
  shield: 'M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 1 1 13 0C18.5 15 12 21 12 21ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  paper: 'M5 4.5h14v15H5zM8 8.5h8M8 11.5h8M8 14.5h5',
  trophy:
    'M8 4.5h8v4.5a4 4 0 0 1-8 0zM8 6.5H5v1.5a3 3 0 0 0 3 3M16 6.5h3v1.5a3 3 0 0 1-3 3M12 13v3.5M8.5 19.5h7M10 16.5h4v3h-4z',
  cap: 'M2.5 9.5 12 5l9.5 4.5L12 14zM6.5 11.5v4.5c3 2.3 8 2.3 11 0v-4.5M21.5 9.5v5',
  robot:
    'M6.5 8.5h11v9h-11zM12 8.5V5.5M12 5.5a1 1 0 1 0 0-2 1 2 0 0 0 0 2ZM9.5 12.5h.5M14 12.5h.5M9.5 15h5M4.5 11.5v3M19.5 11.5v3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
