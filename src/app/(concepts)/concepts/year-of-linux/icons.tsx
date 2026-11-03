// Icons in the spirit of the 2008 Tango set: a 24 x 24 grid, soft gradients, one-pixel dark
// outlines and a highlight. All original drawings; nothing here is a product's logo.

const STOPS: Record<string, [string, string]> = {
  alu: ['#ffffff', '#d3d7cf'],
  alu2: ['#eeeeec', '#a8aba5'],
  dark: ['#6e7270', '#1e2223'],
  blue: ['#8fb5e0', '#2d5f9e'],
  arch: ['#5fc0ee', '#0f6fa3'],
  green: ['#9be74a', '#4e9a06'],
  orange: ['#fcaf3e', '#ce5c00'],
  red: ['#f05252', '#a40000'],
  butter: ['#fff38a', '#c4a000'],
  choc: ['#efc58a', '#b2700e'],
  folder: ['#c9d9ec', '#89a5c9'],
  fback: ['#9db2cf', '#6683aa'],
  paper: ['#ffffff', '#e4e4df'],
  screen: ['#5a7fb0', '#16263b'],
  skin: ['#fde3c2', '#e2a971'],
};

/** The gradients every icon draws with. Rendered once per page. */
export function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(STOPS).map(([id, [a, b]]) => (
          <linearGradient key={id} id={`gi-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

const g = (id: string) => `url(#gi-${id})`;

const folder = (
  <>
    <path d="M2.5 5.5h7l2 2h10v13h-19z" fill={g('fback')} stroke="#3b5a85" strokeLinejoin="round" />
    <path d="M2.5 9.5h19l-.5 11h-18z" fill={g('folder')} stroke="#3b5a85" strokeLinejoin="round" />
    <path d="M3.5 10.5h17" stroke="#fff" strokeOpacity=".7" />
  </>
);

const paper = (
  <>
    <path d="M4.5 2.5h11l4 4v15h-15z" fill={g('paper')} stroke="#888a85" strokeLinejoin="round" />
    <path d="M15.5 2.5v4h4" fill="#d3d7cf" stroke="#888a85" strokeLinejoin="round" />
  </>
);

const ICONS = {
  folder,
  home: (
    <>
      <path d="M5.5 11v9.5h13V11" fill={g('alu')} stroke="#555753" />
      <path
        d="M12 3 2 11.8l1.4 1.4L12 5.6l8.6 7.6 1.4-1.4z"
        fill={g('red')}
        stroke="#a40000"
        strokeLinejoin="round"
      />
      <path d="M9.5 20.5v-5h4v5" fill={g('choc')} stroke="#8f5902" />
      <rect x="14.5" y="12.5" width="3" height="3" fill={g('blue')} stroke="#204a87" />
      <path d="M16.5 4.5h2v4" fill="#888a85" stroke="#555753" />
    </>
  ),
  document: (
    <>
      {paper}
      <path d="M7 9.5h9M7 12.5h9M7 15.5h9M7 18.5h5" stroke="#a8aba5" />
    </>
  ),
  editor: (
    <>
      {paper}
      <path d="M7 9.5h8M7 12.5h6M7 15.5h4" stroke="#a8aba5" />
      <path
        d="M11.5 20.5l1-3.4 7.4-7.4 2.4 2.4-7.4 7.4z"
        fill={g('butter')}
        stroke="#8f5902"
        strokeLinejoin="round"
      />
      <path d="M11.5 20.5l1-3.4 2.4 2.4z" fill="#e9b96e" stroke="#8f5902" strokeLinejoin="round" />
    </>
  ),
  pdf: (
    <>
      {paper}
      <rect x="4.5" y="13.5" width="11" height="5" fill={g('red')} stroke="#a40000" />
      <path d="M6.5 16h7" stroke="#fff" strokeWidth="1.4" />
      <path d="M7 6.5h6M7 9.5h9" stroke="#a8aba5" />
    </>
  ),
  link: (
    <>
      {paper}
      <circle cx="12" cy="13.5" r="5" fill={g('blue')} stroke="#204a87" />
      <path
        d="M8.5 12c1.5-1.5 3-1 3.5 0s2 1.5 3.5 0M9 15.5c2 1 4 1 6 0"
        stroke="#8ae234"
        fill="none"
        strokeWidth="1.2"
      />
    </>
  ),
  code: (
    <>
      {paper}
      <path
        d="M9.5 10 6.5 13l3 3M14.5 10l3 3-3 3M13 9l-2 8"
        stroke="#3465a4"
        fill="none"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  terminal: (
    <>
      <rect x="2.5" y="3.5" width="19" height="17" rx="1.5" fill={g('alu2')} stroke="#555753" />
      <rect x="4.5" y="5.5" width="15" height="13" fill="#262a2b" stroke="#111" />
      <path d="M6.5 9l2.5 2-2.5 2" stroke="#fff" fill="none" />
      <path d="M10 14h4" stroke="#8ae234" />
    </>
  ),
  browser: (
    <>
      <circle cx="12" cy="12" r="9.5" fill={g('blue')} stroke="#204a87" />
      <path
        d="M5.3 8c1.8-1.9 4.6-2.7 5.7-1.5s-.8 2.1.3 3.1 2.2 1 1.2 3-3.2.8-3.3 2.9.3 3.3-.9 3.3-2.6-2.9-2.6-4.9-1.6-3.7-.4-5.9z"
        fill={g('green')}
        stroke="#3c7a04"
        strokeWidth=".7"
      />
      <path
        d="M14.2 4.4c2.3.3 5 2.4 5.3 5.4s-1.1 1.9-2 1-1.9 1.1-.9 2.9-1.1 4-2.1 4 .1-3-.9-3.9-1-2.1 0-4.1-.2-5.3.6-5.3z"
        fill={g('green')}
        stroke="#3c7a04"
        strokeWidth=".7"
      />
      <ellipse cx="9" cy="7" rx="4" ry="2" fill="#fff" opacity=".35" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="5.5" width="19" height="14" rx="1" fill={g('alu')} stroke="#888a85" />
      <path d="M3 6.2l9 7.3 9-7.3" fill="none" stroke="#888a85" />
      <path d="M3 19l7-6.2M21 19l-7-6.2" stroke="#babdb6" fill="none" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="3.5" width="19" height="14" rx="1" fill={g('alu2')} stroke="#555753" />
      <rect x="4.5" y="5.5" width="15" height="10" fill="#1d2a1d" />
      <path d="M5 13l3-3 2 2 3-5 2 4 2-2 2.5 2.5" stroke="#8ae234" fill="none" />
      <path d="M8 20.5h8M12 17.5v3" stroke="#555753" strokeWidth="1.5" />
    </>
  ),
  package: (
    <>
      <path
        d="M2.5 8.5 12 4.5l9.5 4v10L12 22l-9.5-3.5z"
        fill={g('choc')}
        stroke="#8f5902"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 8.5 12 12.5l9.5-4M12 12.5V22"
        fill="none"
        stroke="#8f5902"
        strokeLinejoin="round"
      />
      <path d="M7 6.5l9.5 4v3.5" fill="none" stroke="#fce94f" strokeWidth="1.6" />
    </>
  ),
  update: (
    <>
      <circle cx="12" cy="12" r="9.5" fill={g('orange')} stroke="#ce5c00" />
      <path
        d="M12 17V7.5M8 11l4-4 4 4"
        stroke="#fff"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  mines: (
    <>
      <path
        d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7"
        stroke="#2e3436"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="6.3" fill={g('dark')} stroke="#111" />
      <circle cx="9.8" cy="9.8" r="1.9" fill="#fff" opacity=".85" />
    </>
  ),
  flag: (
    <>
      <path d="M8 2.5v17" stroke="#2e3436" strokeWidth="1.6" />
      <path d="M8.5 3l10.5 4.2L8.5 11.5z" fill={g('red')} stroke="#a40000" strokeLinejoin="round" />
      <path d="M4 20.5h9" stroke="#2e3436" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  cube: (
    <>
      <path
        d="M12 2.5l8.5 4.5L12 11.5 3.5 7z"
        fill="#8fd3f4"
        stroke="#0b4f75"
        strokeLinejoin="round"
      />
      <path d="M3.5 7 12 11.5v10L3.5 17z" fill="#0f6fa3" stroke="#0b4f75" strokeLinejoin="round" />
      <path
        d="M20.5 7 12 11.5v10l8.5-4.5z"
        fill="#1793d1"
        stroke="#0b4f75"
        strokeLinejoin="round"
      />
      <path d="M5 7.2 12 4l7 3.2" stroke="#fff" strokeOpacity=".7" fill="none" />
    </>
  ),
  computer: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13" rx="1" fill={g('alu')} stroke="#555753" />
      <rect x="4.5" y="5.5" width="15" height="9" fill={g('screen')} />
      <path d="M5 6h14L5 12z" fill="#fff" opacity=".16" />
      <path d="M9.5 16.5l-1 3h7l-1-3" fill="#babdb6" stroke="#555753" />
      <rect x="6.5" y="19.5" width="11" height="2" rx=".5" fill={g('alu2')} stroke="#555753" />
    </>
  ),
  desktop: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13" rx="1" fill={g('alu')} stroke="#555753" />
      <rect x="4.5" y="5.5" width="15" height="9" fill={g('arch')} />
      <rect x="6" y="7" width="3" height="2.5" fill="#fff" opacity=".8" />
      <path d="M9.5 16.5l-1 3h7l-1-3" fill="#babdb6" stroke="#555753" />
      <rect x="6.5" y="19.5" width="11" height="2" rx=".5" fill={g('alu2')} stroke="#555753" />
    </>
  ),
  prefs: (
    <>
      <circle
        cx="12"
        cy="12"
        r="7.6"
        fill="none"
        stroke="#555753"
        strokeWidth="4.2"
        strokeDasharray="2.39 2.39"
      />
      <circle cx="12" cy="12" r="6.6" fill={g('alu2')} stroke="#555753" />
      <circle cx="12" cy="12" r="2.6" fill="#fff" stroke="#555753" />
    </>
  ),
  run: (
    <>
      <circle
        cx="10"
        cy="10"
        r="6.2"
        fill="none"
        stroke="#555753"
        strokeWidth="3.6"
        strokeDasharray="1.95 1.95"
      />
      <circle cx="10" cy="10" r="5.4" fill={g('alu2')} stroke="#555753" />
      <circle cx="10" cy="10" r="2" fill="#fff" stroke="#555753" />
      <path d="M13.5 13.5v8l7-4z" fill={g('green')} stroke="#3c7a04" strokeLinejoin="round" />
    </>
  ),
  trash: (
    <>
      <path
        d="M5.5 7.5h13l-1.2 13.8H6.7z"
        fill={g('alu2')}
        stroke="#555753"
        strokeLinejoin="round"
      />
      <path d="M9 10.5v8.5M12 10.5v8.5M15 10.5v8.5" stroke="#888a85" />
      <rect x="4.5" y="4.5" width="15" height="3" rx="1" fill={g('alu')} stroke="#555753" />
      <path d="M10 4.5V3h4v1.5" fill="none" stroke="#555753" />
    </>
  ),
  trashFull: (
    <>
      <path
        d="M7 7.5l2-4.5 5 1.5-1 3M13 7.5l3-3.5 3 3"
        fill={g('paper')}
        stroke="#888a85"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 7.5h13l-1.2 13.8H6.7z"
        fill={g('alu2')}
        stroke="#555753"
        strokeLinejoin="round"
      />
      <path d="M9 10.5v8.5M12 10.5v8.5M15 10.5v8.5" stroke="#888a85" />
    </>
  ),
  user: (
    <>
      <path
        d="M3.5 21.5c0-5 3.6-7.5 8.5-7.5s8.5 2.5 8.5 7.5z"
        fill={g('blue')}
        stroke="#204a87"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="8" r="4.5" fill={g('skin')} stroke="#8f5902" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="1" fill={g('paper')} stroke="#888a85" />
      <rect x="3.5" y="4.5" width="17" height="4" fill={g('red')} stroke="#a40000" />
      <path
        d="M6 11.5h2M11 11.5h2M16 11.5h2M6 14.5h2M11 14.5h2M16 14.5h2M6 17.5h2M11 17.5h2"
        stroke="#888a85"
        strokeWidth="1.6"
      />
    </>
  ),
  signal: (
    <>
      {[0, 1, 2, 3].map((b) => (
        <rect
          key={b}
          x={3.5 + b * 4.5}
          y={16.5 - b * 4}
          width="3"
          height={4 + b * 4}
          fill={g('green')}
          stroke="#3c7a04"
        />
      ))}
    </>
  ),
  back: (
    <path
      d="M3 12l8-7.5V9h9.5v6H11v4.5z"
      fill={g('blue')}
      stroke="#204a87"
      strokeLinejoin="round"
    />
  ),
  forward: (
    <path
      d="M21 12l-8-7.5V9H3.5v6H13v4.5z"
      fill={g('blue')}
      stroke="#204a87"
      strokeLinejoin="round"
    />
  ),
  up: (
    <path
      d="M12 3l7.5 8H15v9.5H9V11H4.5z"
      fill={g('blue')}
      stroke="#204a87"
      strokeLinejoin="round"
    />
  ),
  reload: (
    <>
      <path
        d="M18.5 9.5A7 7 0 1 0 19 14"
        fill="none"
        stroke="#3c7a04"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M18.5 9.5A7 7 0 1 0 19 14"
        fill="none"
        stroke="#8ae234"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M21.5 4v7h-7z" fill={g('green')} stroke="#3c7a04" strokeLinejoin="round" />
    </>
  ),
  stop: (
    <>
      <path
        d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z"
        fill={g('red')}
        stroke="#a40000"
        strokeLinejoin="round"
      />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  search: (
    <>
      <circle
        cx="10"
        cy="10"
        r="6"
        fill="#dbe8f6"
        fillOpacity=".7"
        stroke="#555753"
        strokeWidth="2"
      />
      <path d="M14.5 14.5l6 6" stroke="#555753" strokeWidth="3.2" strokeLinecap="round" />
    </>
  ),
  antenna: (
    <>
      <path d="M12 9v12.5M8.5 21.5h7" stroke="#555753" strokeWidth="1.6" />
      <rect x="8.5" y="12.5" width="7" height="5" rx="1" fill={g('alu')} stroke="#555753" />
      <circle cx="12" cy="7" r="2" fill={g('orange')} stroke="#ce5c00" />
      <path
        d="M7.5 3.5a6 6 0 0 0 0 7M16.5 3.5a6 6 0 0 1 0 7M5 1.8a9 9 0 0 0 0 10.4M19 1.8a9 9 0 0 1 0 10.4"
        fill="none"
        stroke="#3465a4"
      />
    </>
  ),
  gauge: (
    <>
      <circle cx="12" cy="13" r="8.5" fill={g('alu')} stroke="#555753" />
      <path d="M6.5 13a5.5 5.5 0 0 1 11 0" fill="none" stroke="#babdb6" strokeWidth="2" />
      <path d="M15 10.5a5.5 5.5 0 0 1 2.5 2.5" fill="none" stroke="#cc0000" strokeWidth="2" />
      <path d="M12 13l4-5" stroke="#2e3436" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="13" r="1.4" fill="#2e3436" />
    </>
  ),
  chip: (
    <>
      <path
        d="M8 3v3M12 3v3M16 3v3M8 18v3M12 18v3M16 18v3M3 8h3M3 12h3M3 16h3M18 8h3M18 12h3M18 16h3"
        stroke="#888a85"
        strokeWidth="1.5"
      />
      <rect x="5.5" y="5.5" width="13" height="13" rx="1" fill={g('dark')} stroke="#111" />
      <circle cx="8.5" cy="8.5" r="1" fill="#888a85" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="7.5" width="14" height="13" rx="1.5" fill={g('arch')} stroke="#0b4f75" />
      <rect
        x="4.5"
        y="10"
        width="4"
        height="3"
        rx=".5"
        fill={g('butter')}
        stroke="#8f5902"
        strokeWidth=".6"
      />
      <path d="M4.5 17h9" stroke="#fff" strokeOpacity=".7" />
      <path
        d="M17 7a4 4 0 0 1 0 5M19.5 4.5a7.5 7.5 0 0 1 0 10"
        fill="none"
        stroke="#3465a4"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  beacon: (
    <>
      <ellipse cx="12" cy="16" rx="7.5" ry="4.5" fill={g('alu')} stroke="#555753" />
      <circle cx="12" cy="15.5" r="1.6" fill="#1793d1" />
      <path
        d="M8.5 9a5 5 0 0 1 7 0M6 6.5a8.5 8.5 0 0 1 12 0"
        fill="none"
        stroke="#3465a4"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  trophy: (
    <>
      <path
        d="M7 4.5h10v4a5 5 0 0 1-10 0z"
        fill={g('butter')}
        stroke="#8f5902"
        strokeLinejoin="round"
      />
      <path
        d="M7 6H4.5c0 3 1.5 4.5 3.5 4.5M17 6h2.5c0 3-1.5 4.5-3.5 4.5"
        fill="none"
        stroke="#8f5902"
      />
      <path d="M12 13.5v4M8.5 20.5h7v-3h-7z" fill={g('choc')} stroke="#8f5902" />
      <path d="M9 5.5v3" stroke="#fff" strokeOpacity=".8" />
    </>
  ),
  medal: (
    <>
      <path
        d="M7.5 2.5h3l2 6h-3zM16.5 2.5h-3l-2 6h3z"
        fill={g('blue')}
        stroke="#204a87"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="15" r="6" fill={g('choc')} stroke="#8f5902" />
      <circle cx="12" cy="15" r="3.6" fill="none" stroke="#fce4b8" />
    </>
  ),
  diploma: (
    <>
      <path d="M12 4 2 8.5l10 4.5 10-4.5z" fill={g('dark')} stroke="#111" strokeLinejoin="round" />
      <path
        d="M6.5 10.8v4.7c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.7L12 13.3z"
        fill={g('dark')}
        stroke="#111"
        strokeLinejoin="round"
      />
      <path d="M20 9.5v6" stroke="#edd400" strokeWidth="1.4" />
      <circle cx="20" cy="16.5" r="1.3" fill="#edd400" />
    </>
  ),
  robot: (
    <>
      <path d="M12 2.5v3" stroke="#555753" />
      <circle cx="12" cy="2.5" r="1.2" fill="#cc0000" />
      <rect x="4.5" y="5.5" width="15" height="11" rx="2" fill={g('alu')} stroke="#555753" />
      <circle cx="9" cy="10.5" r="2" fill={g('arch')} stroke="#0b4f75" />
      <circle cx="15" cy="10.5" r="2" fill={g('arch')} stroke="#0b4f75" />
      <path d="M9 14h6" stroke="#555753" />
      <path d="M7.5 16.5v4h9v-4" fill={g('alu2')} stroke="#555753" />
    </>
  ),
  image: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="1" fill={g('paper')} stroke="#888a85" />
      <rect x="4.5" y="6.5" width="15" height="11" fill={g('arch')} />
      <path d="M4.5 17.5l5-6 3.5 4 2-2 4.5 4z" fill={g('green')} />
      <circle cx="16" cy="9.5" r="1.6" fill="#fce94f" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2" fill={g('dark')} stroke="#111" />
      <rect x="8" y="5" width="8" height="12" fill={g('screen')} />
      <circle cx="12" cy="19.2" r=".9" fill="#888a85" />
    </>
  ),
  lock: (
    <>
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#888a85" strokeWidth="2.2" />
      <rect x="5.5" y="10.5" width="13" height="10" rx="1.5" fill={g('butter')} stroke="#8f5902" />
      <circle cx="12" cy="15" r="1.4" fill="#8f5902" />
    </>
  ),
  logout: (
    <>
      <rect x="3.5" y="3.5" width="10" height="17" fill={g('choc')} stroke="#8f5902" />
      <circle cx="11" cy="12" r=".9" fill="#fce94f" />
      <path
        d="M14 12h7M18 9l3 3-3 3"
        stroke="#cc0000"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  power: (
    <>
      <circle cx="12" cy="12" r="9.5" fill={g('red')} stroke="#a40000" />
      <path
        d="M8.5 8.5a5 5 0 1 0 7 0M12 5.5v6"
        stroke="#fff"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9.5" fill={g('blue')} stroke="#204a87" />
      <path
        d="M9.2 9.3a2.9 2.9 0 1 1 3.9 2.7c-.8.3-1.1.8-1.1 1.7v.6"
        stroke="#fff"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.3" r="1.2" fill="#fff" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" fill={g('blue')} stroke="#204a87" />
      <circle cx="12" cy="7.5" r="1.4" fill="#fff" />
      <path d="M12 10.5v7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  star: (
    <path
      d="M12 2.5l2.8 6 6.6.7-4.9 4.4 1.4 6.5L12 16.8l-5.9 3.3 1.4-6.5-4.9-4.4 6.6-.7z"
      fill={g('butter')}
      stroke="#c4a000"
      strokeLinejoin="round"
    />
  ),
  screensaver: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13" rx="1" fill={g('alu')} stroke="#555753" />
      <rect x="4.5" y="5.5" width="15" height="9" fill="#101828" />
      <path
        d="M8 8.5h.01M15 7h.01M12 11h.01M17 12.5h.01M6.5 12h.01"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M9.5 16.5l-1 3h7l-1-3" fill="#babdb6" stroke="#555753" />
      <rect x="6.5" y="19.5" width="11" height="2" rx=".5" fill={g('alu2')} stroke="#555753" />
    </>
  ),
  network: (
    <>
      <rect x="2.5" y="3.5" width="11" height="8" rx="1" fill={g('alu')} stroke="#555753" />
      <rect x="4" y="5" width="8" height="5" fill={g('screen')} />
      <rect x="10.5" y="11.5" width="11" height="8" rx="1" fill={g('alu')} stroke="#555753" />
      <rect x="12" y="13" width="8" height="5" fill={g('screen')} />
      <path d="M5 15.5h4v4" stroke="#555753" fill="none" />
    </>
  ),
  apps: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" fill={g('arch')} stroke="#0b4f75" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" fill={g('orange')} stroke="#ce5c00" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" fill={g('green')} stroke="#3c7a04" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" fill={g('alu2')} stroke="#555753" />
    </>
  ),
  games: (
    <>
      <rect x="2.5" y="7.5" width="19" height="11" rx="5" fill={g('alu2')} stroke="#555753" />
      <path d="M7.5 10.5v5M5 13h5" stroke="#2e3436" strokeWidth="1.8" />
      <circle cx="16" cy="11.5" r="1.3" fill="#cc0000" />
      <circle cx="18" cy="14.5" r="1.3" fill="#3465a4" />
    </>
  ),
  expo: (
    <>
      <rect x="2.5" y="3.5" width="8.5" height="7.5" fill={g('arch')} stroke="#0b4f75" />
      <rect x="13" y="3.5" width="8.5" height="7.5" fill={g('blue')} stroke="#204a87" />
      <rect x="2.5" y="13" width="8.5" height="7.5" fill={g('blue')} stroke="#204a87" />
      <rect x="13" y="13" width="8.5" height="7.5" fill={g('blue')} stroke="#204a87" />
      <rect x="4.5" y="5.5" width="4" height="3" fill="#fff" opacity=".8" />
    </>
  ),
  wobbly: (
    <>
      <path
        d="M3.5 5.5c4-1.5 13-1.5 17 0 1 4 .5 9-.5 13.5-5 1.5-11 1.5-16 0C3.3 14 2.8 9.5 3.5 5.5z"
        fill={g('paper')}
        stroke="#555753"
      />
      <path
        d="M3.6 5.5c4-1.5 13-1.5 17 0l.2 3c-5-1.3-12.5-1.3-17.4 0z"
        fill={g('blue')}
        stroke="#204a87"
      />
    </>
  ),
  lamp: (
    <>
      <path
        d="M3.5 3.5h17L15 13l-1.2 7.5h-3.6L9 13z"
        fill={g('paper')}
        stroke="#555753"
        strokeLinejoin="round"
      />
      <path d="M3.5 3.5h17l-1 2h-15z" fill={g('blue')} stroke="#204a87" />
      <rect x="8.5" y="19.5" width="7" height="2.5" rx="1" fill={g('alu2')} stroke="#555753" />
    </>
  ),
  reflect: (
    <>
      <path d="M12 2.5l6 3-6 3-6-3z" fill="#8fd3f4" stroke="#0b4f75" strokeLinejoin="round" />
      <path
        d="M6 5.5l6 3v5l-6-3zM18 5.5l-6 3v5l6-3z"
        fill="#1793d1"
        stroke="#0b4f75"
        strokeLinejoin="round"
      />
      <path d="M6 13.5l6 3v5l-6-3zM18 13.5l-6 3v5l6-3z" fill="#1793d1" opacity=".3" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {ICONS[name]}
    </svg>
  );
}
