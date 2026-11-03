// The mail client's icons, drawn on a 20px grid with one stroke weight.
const Svg = ({
  children,
  size = 18,
  fill,
}: {
  children: React.ReactNode;
  size?: number;
  fill?: boolean;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill={fill ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

type P = { size?: number };

export const Icon = {
  inbox: ({ size }: P) => (
    <Svg size={size}>
      <path d="M3 11.5l2-6.2c.2-.6.8-1 1.4-1h7.2c.6 0 1.2.4 1.4 1l2 6.2V15c0 .8-.7 1.5-1.5 1.5h-11C3.7 16.5 3 15.8 3 15z" />
      <path d="M3 11.5h3.6l1 1.8h4.8l1-1.8H17" />
    </Svg>
  ),
  star: ({ size }: P) => (
    <Svg size={size}>
      <path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" />
    </Svg>
  ),
  starFill: ({ size }: P) => (
    <Svg size={size} fill>
      <path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" />
    </Svg>
  ),
  send: ({ size }: P) => (
    <Svg size={size}>
      <path d="M17 3L8.6 11.4M17 3l-5.2 14-3.2-5.6L3 8.2z" />
    </Svg>
  ),
  draft: ({ size }: P) => (
    <Svg size={size}>
      <path d="M11.5 3H5.5C4.7 3 4 3.7 4 4.5v11c0 .8.7 1.5 1.5 1.5h9c.8 0 1.5-.7 1.5-1.5V7.5z" />
      <path d="M11.5 3v4.5H16M7 11h6M7 14h4" />
    </Svg>
  ),
  archive: ({ size }: P) => (
    <Svg size={size}>
      <rect x={2.8} y={3.5} width={14.4} height={3.6} rx={1} />
      <path d="M4 7.1v8c0 .8.7 1.4 1.5 1.4h9c.8 0 1.5-.6 1.5-1.4v-8M8 10.5h4" />
    </Svg>
  ),
  trash: ({ size }: P) => (
    <Svg size={size}>
      <path d="M3.5 5.5h13M8 5.5V4c0-.6.4-1 1-1h2c.6 0 1 .4 1 1v1.5M5 5.5l.8 10.1c.1.8.7 1.4 1.5 1.4h5.4c.8 0 1.4-.6 1.5-1.4L15 5.5M8.3 8.5v5.5M11.7 8.5v5.5" />
    </Svg>
  ),
  all: ({ size }: P) => (
    <Svg size={size}>
      <rect x={3} y={4.5} width={14} height={11} rx={1.6} />
      <path d="M3.5 5.5L10 10.5l6.5-5" />
      <path d="M5.5 2.5h9" />
    </Svg>
  ),
  label: ({ size }: P) => (
    <Svg size={size}>
      <path d="M3 4.5C3 3.7 3.7 3 4.5 3h5.1c.4 0 .8.2 1.1.4l6 6c.6.6.6 1.5 0 2.1l-5.1 5.1c-.6.6-1.5.6-2.1 0l-6-6c-.3-.3-.5-.7-.5-1.1z" />
      <circle cx={7} cy={7} r={1.2} />
    </Svg>
  ),
  search: ({ size }: P) => (
    <Svg size={size}>
      <circle cx={8.8} cy={8.8} r={5.3} />
      <path d="M12.8 12.8l4 4" />
    </Svg>
  ),
  compose: ({ size }: P) => (
    <Svg size={size}>
      <path d="M13.6 3.4a1.9 1.9 0 012.7 2.7L8 14.4l-3.6.9.9-3.6z" />
      <path d="M12.3 4.7l2.9 2.9" />
    </Svg>
  ),
  reply: ({ size }: P) => (
    <Svg size={size}>
      <path d="M8 5L3.5 9.5 8 14" />
      <path d="M3.5 9.5h8c2.8 0 5 2.2 5 5V16" />
    </Svg>
  ),
  forward: ({ size }: P) => (
    <Svg size={size}>
      <path d="M12 5l4.5 4.5L12 14" />
      <path d="M16.5 9.5h-8c-2.8 0-5 2.2-5 5V16" />
    </Svg>
  ),
  more: ({ size }: P) => (
    <Svg size={size}>
      <circle cx={10} cy={4.5} r={0.6} fill="currentColor" />
      <circle cx={10} cy={10} r={0.6} fill="currentColor" />
      <circle cx={10} cy={15.5} r={0.6} fill="currentColor" />
    </Svg>
  ),
  back: ({ size }: P) => (
    <Svg size={size}>
      <path d="M16 10H4.5M9 5l-5 5 5 5" />
    </Svg>
  ),
  up: ({ size }: P) => (
    <Svg size={size}>
      <path d="M5 12.5l5-5 5 5" />
    </Svg>
  ),
  down: ({ size }: P) => (
    <Svg size={size}>
      <path d="M5 7.5l5 5 5-5" />
    </Svg>
  ),
  right: ({ size }: P) => (
    <Svg size={size}>
      <path d="M7.5 5l5 5-5 5" />
    </Svg>
  ),
  clip: ({ size }: P) => (
    <Svg size={size}>
      <path d="M15.5 9.3l-5.8 5.8a3.6 3.6 0 01-5.1-5.1l6.5-6.5a2.4 2.4 0 013.4 3.4l-6.4 6.4a1.2 1.2 0 01-1.7-1.7l5.8-5.8" />
    </Svg>
  ),
  link: ({ size }: P) => (
    <Svg size={size}>
      <path d="M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1" />
      <path d="M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1" />
    </Svg>
  ),
  check: ({ size }: P) => (
    <Svg size={size}>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </Svg>
  ),
  x: ({ size }: P) => (
    <Svg size={size}>
      <path d="M5 5l10 10M15 5L5 15" />
    </Svg>
  ),
  unread: ({ size }: P) => (
    <Svg size={size}>
      <rect x={2.8} y={5} width={12.4} height={10} rx={1.6} />
      <path d="M3.3 6l5.9 4.5L15 6" />
      <circle cx={16} cy={4.5} r={2.3} fill="currentColor" stroke="none" />
    </Svg>
  ),
  read: ({ size }: P) => (
    <Svg size={size}>
      <path d="M3 8.5L10 3.5l7 5V15.5c0 .8-.7 1.5-1.5 1.5h-11C3.7 17 3 16.3 3 15.5z" />
      <path d="M3.5 9l6.5 4.5L16.5 9" />
    </Svg>
  ),
  print: ({ size }: P) => (
    <Svg size={size}>
      <path d="M5.5 7.5V3h9v4.5M5.5 14H4c-.8 0-1.5-.7-1.5-1.5V9c0-.8.7-1.5 1.5-1.5h12c.8 0 1.5.7 1.5 1.5v3.5c0 .8-.7 1.5-1.5 1.5h-1.5" />
      <path d="M5.5 11.5h9V17h-9z" />
    </Svg>
  ),
  code: ({ size }: P) => (
    <Svg size={size}>
      <path d="M7 6l-4 4 4 4M13 6l4 4-4 4M11 4.5l-2 11" />
    </Svg>
  ),
  page: ({ size }: P) => (
    <Svg size={size}>
      <path d="M5.5 2.8h6l3 3v11.4h-9z" />
      <path d="M11.5 2.8v3h3M7.5 9.5h5M7.5 12h5M7.5 14.5h3" />
    </Svg>
  ),
  keyboard: ({ size }: P) => (
    <Svg size={size}>
      <rect x={2} y={5} width={16} height={10} rx={1.8} />
      <path d="M5 8h.01M8 8h.01M11 8h.01M14 8h.01M5.5 11.8h9" strokeWidth={1.9} />
    </Svg>
  ),
  menu: ({ size }: P) => (
    <Svg size={size}>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
    </Svg>
  ),
  settings: ({ size }: P) => (
    <Svg size={size}>
      <path d="M3.5 6h7M14.5 6h2M3.5 14h2M9.5 14h7" />
      <circle cx={12.5} cy={6} r={2} />
      <circle cx={7.5} cy={14} r={2} />
    </Svg>
  ),
  undo: ({ size }: P) => (
    <Svg size={size}>
      <path d="M7 4.5L3.5 8 7 11.5" />
      <path d="M3.5 8H12a4.5 4.5 0 010 9H8" />
    </Svg>
  ),
  out: ({ size = 14 }: P) => (
    <Svg size={size}>
      <path d="M8 4H4.5C3.7 4 3 4.7 3 5.5v10c0 .8.7 1.5 1.5 1.5h10c.8 0 1.5-.7 1.5-1.5V12M11.5 3H17v5.5M17 3l-7.5 7.5" />
    </Svg>
  ),
  download: ({ size }: P) => (
    <Svg size={size}>
      <path d="M10 3v9.5M6 8.8l4 4 4-4M3.5 16.5h13" />
    </Svg>
  ),
  pdf: ({ size }: P) => (
    <Svg size={size}>
      <path d="M5 2.8h6.5l3.5 3.5v10.9H5z" />
      <path d="M11.5 2.8v3.5H15" />
    </Svg>
  ),
  image: ({ size }: P) => (
    <Svg size={size}>
      <rect x={2.8} y={3.8} width={14.4} height={12.4} rx={1.6} />
      <circle cx={7.3} cy={8} r={1.4} />
      <path d="M3.2 14.5l4.3-4 3.2 3 2.3-2 3.8 3.4" />
    </Svg>
  ),
  copy: ({ size }: P) => (
    <Svg size={size}>
      <rect x={7} y={7} width={9.5} height={9.5} rx={1.6} />
      <path d="M13 7V5c0-.8-.7-1.5-1.5-1.5h-6C4.7 3.5 4 4.2 4 5v6.5c0 .8.7 1.5 1.5 1.5H7" />
    </Svg>
  ),
  expand: ({ size }: P) => (
    <Svg size={size}>
      <path d="M6 8l4-4 4 4M6 12l4 4 4-4" />
    </Svg>
  ),
  user: ({ size }: P) => (
    <Svg size={size}>
      <circle cx={10} cy={7} r={3.3} />
      <path d="M3.8 17c.8-3 3.2-4.6 6.2-4.6s5.4 1.6 6.2 4.6" />
    </Svg>
  ),
  restore: ({ size }: P) => (
    <Svg size={size}>
      <path d="M3.5 10a6.5 6.5 0 106.5-6.5c-2 0-3.8.9-5 2.4" />
      <path d="M4.5 2.8v3.4h3.4" />
    </Svg>
  ),
  minimize: ({ size }: P) => (
    <Svg size={size}>
      <path d="M5 13h10" />
    </Svg>
  ),
  sun: ({ size }: P) => (
    <Svg size={size}>
      <circle cx={10} cy={10} r={3.4} />
      <path d="M10 2.5v1.6M10 15.9v1.6M2.5 10h1.6M15.9 10h1.6M4.7 4.7l1.1 1.1M14.2 14.2l1.1 1.1M4.7 15.3l1.1-1.1M14.2 5.8l1.1-1.1" />
    </Svg>
  ),
};

/** The client's mark: an envelope folded from two strokes, no one's logo. */
export function Mark() {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
      <rect width={28} height={28} rx={8} fill="var(--accent)" />
      <path
        d="M7 10.2c0-.9.7-1.6 1.6-1.6h10.8c.9 0 1.6.7 1.6 1.6v7.6c0 .9-.7 1.6-1.6 1.6H8.6c-.9 0-1.6-.7-1.6-1.6z"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth={1.7}
      />
      <path
        d="M7.6 9.6l6.4 5 6.4-5"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
