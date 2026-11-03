// Line icons for nodes, palette entries and the editor chrome, drawn on a 16 x 16 grid.

const PATHS = {
  inject: 'M2 8h7.5M6.5 5l3 3-3 3M13 3v10',
  debug: 'M3 4h10M3 8h10M3 12h6',
  fn: 'M10.8 2.6c-1.7-.5-2.8.3-3.1 2l-1.4 7.2c-.3 1.6-1.3 2.2-2.8 1.7M5 6.5h5.5',
  switch: 'M2 8h4M6 8c2 0 2-4 4-4h4M6 8h8M6 8c2 0 2 4 4 4h4',
  change: 'M2 5h3l6 6h3M2 11h3l6-6h3M12 3l2 2-2 2M12 9l2 2-2 2',
  join: 'M2 4h4c2 0 2 4 4 4M2 8h12M2 12h4c2 0 2-4 4-4',
  clock: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 4.5V8l2.5 1.5',
  link: 'M6.5 9.5l3-3M5 7.5L3.7 8.8a2.3 2.3 0 003.3 3.3L8.3 11M11 8.5l1.3-1.3a2.3 2.3 0 00-3.3-3.3L7.7 5',
  wave: 'M1.5 8h2l1.5-4 2 8 2-6 1.5 2h4',
  pins: 'M2.5 5h11v6h-11zM5 2v3M8 2v3M11 2v3M5 11v3M8 11v3M11 11v3',
  radio:
    'M8 7.5V14M5.5 14h5M5.4 4.4a3.7 3.7 0 000 5.2M10.6 4.4a3.7 3.7 0 010 5.2M3.5 2.5a6.4 6.4 0 000 9M12.5 2.5a6.4 6.4 0 010 9',
  chip: 'M4 4h8v8H4zM6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5',
  db: 'M3 4c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2zM3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2',
  globe: 'M8 2a6 6 0 100 12A6 6 0 008 2zM2 8h12M8 2c2.2 2.2 2.2 9.8 0 12M8 2c-2.2 2.2-2.2 9.8 0 12',
  phone: 'M5.5 1.5h5a1 1 0 011 1v11a1 1 0 01-1 1h-5a1 1 0 01-1-1v-11a1 1 0 011-1zM7 12.5h2',
  browser:
    'M2.5 2.5h11a1 1 0 011 1v9a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9a1 1 0 011-1zM1.5 5.5h13M3.6 4h.01M5.1 4h.01',
  spark:
    'M7 1.5l1.3 3.9 3.9 1.3-3.9 1.3L7 11.9 5.7 8 1.8 6.7l3.9-1.3zM12.5 10l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z',
  npm: 'M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7zM2.5 4.5L8 7.5l5.5-3M8 7.5v7',
  cap: 'M1 6l7-3.5L15 6 8 9.5zM4 7.5V11c1 1 2.5 1.5 4 1.5s3-.5 4-1.5V7.5M14 6.5V10',
  trophy:
    'M5 2.5h6v3a3 3 0 01-6 0zM5 3.5H3.2a2 2 0 001.9 3M11 3.5h1.8a2 2 0 01-1.9 3M8 8.5v3M5.5 13.5h5M6.5 11.5h3',
  robot:
    'M4 5h8a1.5 1.5 0 011.5 1.5v5A1.5 1.5 0 0112 13H4a1.5 1.5 0 01-1.5-1.5v-5A1.5 1.5 0 014 5zM8 2.5V5M6 8.6h.01M10 8.6h.01M6.5 11h3',
  doc: 'M4 1.5h5l3 3v10H4zM9 1.5v3h3M6 8h4M6 10.5h4',
  braces:
    'M6 2.5c-1.5 0-2 .7-2 2V6c0 1-.5 1.5-1.5 2 1 .5 1.5 1 1.5 2v1.5c0 1.3.5 2 2 2M10 2.5c1.5 0 2 .7 2 2V6c0 1 .5 1.5 1.5 2-1 .5-1.5 1-1.5 2v1.5c0 1.3-.5 2-2 2',
  mail: 'M2.5 3.5h11a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-7a1 1 0 011-1zM2 4.5l6 4.5 6-4.5',
  keypad:
    'M3 3h2v2H3zM7 3h2v2H7zM11 3h2v2h-2zM3 7h2v2H3zM7 7h2v2H7zM11 7h2v2h-2zM3 11h2v2H3zM7 11h2v2H7zM11 11h2v2h-2z',
  nfc: 'M5 4.5a5 5 0 010 7M8 3a7 7 0 010 10M2.5 6.5a2 2 0 010 3',
  deploy: 'M8 2v8M5 7l3 3 3-3M2.5 11v2.5h11V11',
  bug: 'M5 7a3 3 0 016 0v3.5a3 3 0 01-6 0zM8 7v6.5M5 9H2M14 9h-3M5 11.8l-2.3 1.5M11 11.8l2.3 1.5M5.3 6.2L3.4 4.6M10.7 6.2l1.9-1.6M6.4 4.5L5.8 2.6M9.6 4.5l.6-1.9',
  info: 'M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 7.2v4.3M8 4.8h.01',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9',
  search: 'M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM10.3 10.3L14 14',
  caret: 'M4 6l4 4 4-4',
  plus: 'M3 8h10M8 3v10',
  minus: 'M3 8h10',
  fit: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4',
  close: 'M4 4l8 8M12 4l-8 8',
  arrow: 'M4 12L12 4M6 4h6v6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The editor's mark: three nodes and two wires. */
export function Logo() {
  return (
    <svg viewBox="0 0 32 24" width={32} height={24} aria-hidden="true">
      <path
        d="M10 6 C16 6 14 12 20 12 M10 18 C16 18 14 12 20 12"
        fill="none"
        stroke="#8c8f99"
        strokeWidth={1.6}
      />
      <rect x={1} y={2} width={9} height={8} rx={2} fill="#a6bbcf" />
      <rect x={1} y={14} width={9} height={8} rx={2} fill="#fdd0a2" />
      <rect x={20} y={8} width={11} height={8} rx={2} fill="#ff6b4a" />
    </svg>
  );
}
