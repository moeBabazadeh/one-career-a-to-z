// Every glyph the phone draws: app icon glyphs and the system's line icons, on a 24-unit grid.
// Original drawings; none is any real platform's or company's mark.
import type { IconName } from './content';

const P = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const GLYPHS: Record<IconName, React.ReactNode> = {
  contacts: (
    <>
      <circle cx="12" cy="9" r="3.6" fill="currentColor" stroke="none" />
      <path
        d="M5.2 19.2c1.1-3.2 3.7-4.9 6.8-4.9s5.7 1.7 6.8 4.9"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  mail: (
    <>
      <rect x="3.2" y="5.8" width="17.6" height="12.4" rx="2.4" {...P} />
      <path d="m4 7.4 8 6 8-6" {...P} />
    </>
  ),
  calendar: null,
  files: (
    <path
      d="M3.5 7.2c0-1 .8-1.8 1.8-1.8h4.3l2 2.1h7.1c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  notes: (
    <>
      <path d="M7 8.5h10M7 12h10M7 15.5h6" {...P} />
    </>
  ),
  code: (
    <>
      <path
        d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5M13.4 5.5l-2.8 13"
        {...P}
        strokeWidth={2}
      />
    </>
  ),
  hardware: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.6" {...P} />
      <rect x="10" y="10" width="4" height="4" rx=".6" fill="currentColor" stroke="none" />
      <path
        d="M10 3.8V7M14 3.8V7M10 17v3.2M14 17v3.2M3.8 10H7M3.8 14H7M17 10h3.2M17 14h3.2"
        {...P}
      />
    </>
  ),
  projects: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.8" fill="currentColor" stroke="none" />
      <rect x="13" y="4" width="7" height="7" rx="1.8" {...P} />
      <rect x="4" y="13" width="7" height="7" rx="1.8" {...P} />
      <rect
        x="13"
        y="13"
        width="7"
        height="7"
        rx="1.8"
        fill="currentColor"
        stroke="none"
        opacity=".55"
      />
    </>
  ),
  browser: (
    <>
      <circle cx="12" cy="12" r="8.2" {...P} />
      <path
        d="M3.8 12h16.4M12 3.8c2.3 2.3 3.4 5 3.4 8.2s-1.1 5.9-3.4 8.2c-2.3-2.3-3.4-5-3.4-8.2s1.1-5.9 3.4-8.2z"
        {...P}
      />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" {...P} />
      <path
        d="M12 3.5l1.3 2.2 2.5-.6.7 2.4 2.4.7-.6 2.5 2.2 1.3-2.2 1.3.6 2.5-2.4.7-.7 2.4-2.5-.6L12 20.5l-1.3-2.2-2.5.6-.7-2.4-2.4-.7.6-2.5L3.5 12l2.2-1.3-.6-2.5 2.4-.7.7-2.4 2.5.6z"
        {...P}
      />
    </>
  ),
  checkin: (
    <>
      <path d="M7.6 7.4a6.2 6.2 0 0 1 8.8 0M5.2 5a9.6 9.6 0 0 1 13.6 0" {...P} />
      <rect x="7.5" y="10.2" width="9" height="10" rx="2.2" fill="currentColor" stroke="none" />
      <path
        d="m9.9 15.3 1.5 1.5 2.9-3"
        fill="none"
        stroke="var(--icon-cut, #0d6b63)"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  guide: (
    <>
      <path d="m2.8 9.4 9.2-4.3 9.2 4.3-9.2 4.3z" fill="currentColor" stroke="none" />
      <path d="M6.6 11.4v4.1c1.4 1.4 3.2 2.1 5.4 2.1s4-.7 5.4-2.1v-4.1M21.2 9.4v5.2" {...P} />
    </>
  ),
};

/** An app's glyph, drawn in currentColor. Calendar draws its own date instead. */
export function Glyph({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  );
}

export type UiIcon =
  | 'search'
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronDown'
  | 'close'
  | 'check'
  | 'share'
  | 'download'
  | 'copy'
  | 'link'
  | 'external'
  | 'wifi'
  | 'bluetooth'
  | 'airplane'
  | 'cellular'
  | 'moon'
  | 'sun'
  | 'torch'
  | 'text'
  | 'motion'
  | 'lock'
  | 'unlock'
  | 'mail'
  | 'person'
  | 'globe'
  | 'pr'
  | 'repo'
  | 'star'
  | 'tag'
  | 'list'
  | 'grid'
  | 'doc'
  | 'pdf'
  | 'folder'
  | 'chip'
  | 'bell'
  | 'info'
  | 'image'
  | 'page'
  | 'send'
  | 'home'
  | 'switcher'
  | 'plus'
  | 'phone'
  | 'store'
  | 'play'
  | 'code';

const UI: Record<UiIcon, React.ReactNode> = {
  search: <path d="M10.6 17.2a6.6 6.6 0 1 0 0-13.2 6.6 6.6 0 0 0 0 13.2zM15.4 15.4 20 20" {...P} />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" {...P} strokeWidth={2.2} />,
  chevronLeft: <path d="M14.5 5.5 8 12l6.5 6.5" {...P} strokeWidth={2.2} />,
  chevronDown: <path d="m6 9.5 6 6 6-6" {...P} strokeWidth={2.2} />,
  close: <path d="m6.5 6.5 11 11m0-11-11 11" {...P} strokeWidth={2} />,
  check: <path d="m5.5 12.5 4.2 4.2 8.8-9.4" {...P} strokeWidth={2.2} />,
  share: (
    <path
      d="M12 3.8v11M8 7.6l4-3.8 4 3.8M7.2 10.6H6.4c-.9 0-1.6.7-1.6 1.6v6.4c0 .9.7 1.6 1.6 1.6h11.2c.9 0 1.6-.7 1.6-1.6v-6.4c0-.9-.7-1.6-1.6-1.6h-.8"
      {...P}
    />
  ),
  download: <path d="M12 4v11M7.8 11l4.2 4.2 4.2-4.2M5 19.6h14" {...P} />,
  copy: (
    <>
      <rect x="8.4" y="8.4" width="11" height="11" rx="2" {...P} />
      <path d="M15.6 8.4V6.6c0-1.1-.9-2-2-2H6.6c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h1.8" {...P} />
    </>
  ),
  link: (
    <path
      d="M10.4 13.6a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1 1M13.6 10.4a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1-1"
      {...P}
    />
  ),
  external: (
    <path
      d="M13.5 4.5h6v6M19.5 4.5l-8.5 8.5M17.5 13.8v4.2c0 .8-.7 1.5-1.5 1.5H6c-.8 0-1.5-.7-1.5-1.5V8c0-.8.7-1.5 1.5-1.5h4.2"
      {...P}
    />
  ),
  wifi: (
    <>
      <path
        d="M2.8 9.2a13 13 0 0 1 18.4 0M5.9 12.4a8.6 8.6 0 0 1 12.2 0M9 15.6a4.2 4.2 0 0 1 6 0"
        {...P}
        strokeWidth={2.1}
      />
      <circle cx="12" cy="18.6" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  bluetooth: <path d="m7 7.5 10 9-5 4.5v-18l5 4.5-10 9" {...P} />,
  airplane: (
    <path
      d="M21 15.5v-1.8l-7.5-4.4V4.4a1.5 1.5 0 0 0-3 0v4.9L3 13.7v1.8l7.5-2.3v4.9l-2.2 1.6v1.4L12 20.3l3.7 1.1v-1.4l-2.2-1.6v-4.9z"
      fill="currentColor"
      stroke="none"
    />
  ),
  cellular: (
    <>
      <rect x="3" y="14.5" width="3.2" height="5.5" rx="1" fill="currentColor" />
      <rect x="8" y="11" width="3.2" height="9" rx="1" fill="currentColor" />
      <rect x="13" y="7.5" width="3.2" height="12.5" rx="1" fill="currentColor" />
      <rect x="18" y="4" width="3.2" height="16" rx="1" fill="currentColor" />
    </>
  ),
  moon: (
    <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" fill="currentColor" stroke="none" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"
        {...P}
      />
    </>
  ),
  torch: (
    <path
      d="M8 2.8h8v3.4l-2 3v11c0 .6-.5 1-1 1h-2c-.5 0-1-.4-1-1v-11l-2-3zM8 6.2h8M12 12.5v2"
      {...P}
    />
  ),
  text: (
    <>
      <path d="M3.5 18.5 8 6.5l4.5 12M5.2 14.2h5.6" {...P} />
      <path d="M13.5 18.5l3.2-8.5 3.2 8.5M14.7 15.6h4" {...P} strokeWidth={1.6} />
    </>
  ),
  motion: (
    <>
      <circle cx="12" cy="12" r="8" {...P} />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor" stroke="none" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...P} strokeWidth={2.2} />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor" stroke="none" />
      <path d="M8 10.5V7.4a4 4 0 0 1 7.6-1.7" {...P} strokeWidth={2.2} />
    </>
  ),
  mail: (
    <>
      <rect x="3.2" y="5.8" width="17.6" height="12.4" rx="2.4" {...P} />
      <path d="m4 7.4 8 6 8-6" {...P} />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.6" r="3.8" {...P} />
      <path d="M4.8 20c1-3.6 3.8-5.6 7.2-5.6s6.2 2 7.2 5.6" {...P} />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.2" {...P} />
      <path
        d="M3.8 12h16.4M12 3.8c2.3 2.3 3.4 5 3.4 8.2s-1.1 5.9-3.4 8.2c-2.3-2.3-3.4-5-3.4-8.2s1.1-5.9 3.4-8.2z"
        {...P}
      />
    </>
  ),
  pr: (
    <>
      <circle cx="6.5" cy="5.8" r="2.2" {...P} />
      <circle cx="6.5" cy="18.2" r="2.2" {...P} />
      <circle cx="17.5" cy="18.2" r="2.2" {...P} />
      <path d="M6.5 8v8M17.5 16V9.5c0-1.4-1.1-2.5-2.5-2.5h-4M12.8 4.8 10.6 7l2.2 2.2" {...P} />
    </>
  ),
  repo: (
    <path
      d="M5.5 18.5V5.8c0-1 .8-1.8 1.8-1.8h11.2v12.2H7.3c-1 0-1.8.8-1.8 1.8s.8 1.8 1.8 1.8h11.2M9 8h6"
      {...P}
    />
  ),
  star: <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z" {...P} />,
  tag: (
    <>
      <path
        d="M3.8 12.2V5.3c0-.8.7-1.5 1.5-1.5h6.9l8 8a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0z"
        {...P}
      />
      <circle cx="8.3" cy="8.3" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  list: (
    <path
      d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"
      {...P}
      strokeWidth={2.2}
    />
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" {...P} />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" {...P} />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" {...P} />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" {...P} />
    </>
  ),
  doc: (
    <path
      d="M14 3.5H7.2c-1 0-1.7.8-1.7 1.7v13.6c0 1 .8 1.7 1.7 1.7h9.6c1 0 1.7-.8 1.7-1.7V8zM14 3.5V8h4.5M8.8 12.5h6.4M8.8 16h4.2"
      {...P}
    />
  ),
  pdf: (
    <>
      <path
        d="M14 3.5H7.2c-1 0-1.7.8-1.7 1.7v13.6c0 1 .8 1.7 1.7 1.7h9.6c1 0 1.7-.8 1.7-1.7V8zM14 3.5V8h4.5"
        {...P}
      />
      <path
        d="M8.5 16.8c1.8-1 3.6-3.8 3.9-6.3.2-1.4-1.3-1.5-1.3-.1 0 2.3 2.4 5.2 4.6 5.6 1.2.2 1.2-1.1-.1-1.1-2.5 0-5.8 1.1-7.1 1.9z"
        {...P}
        strokeWidth={1.2}
      />
    </>
  ),
  folder: (
    <path
      d="M3.5 7.2c0-1 .8-1.8 1.8-1.8h4.3l2 2.1h7.1c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8z"
      {...P}
    />
  ),
  chip: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.6" {...P} />
      <path
        d="M10 3.8V7M14 3.8V7M10 17v3.2M14 17v3.2M3.8 10H7M3.8 14H7M17 10h3.2M17 14h3.2"
        {...P}
      />
    </>
  ),
  bell: <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.8h-15zM10 20.5h4" {...P} />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.4" {...P} />
      <path d="M12 11v5.5M12 7.6v.1" {...P} strokeWidth={2.2} />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.4" {...P} />
      <path d="m3.8 16.5 4.7-4.6 3.6 3.4 2.8-2.6 5.4 4.6" {...P} />
      <circle cx="15.6" cy="9.2" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  page: <path d="M6 4.5h12M6 9h12M6 13.5h12M6 18h7" {...P} />,
  send: <path d="M4.5 12 20 4.5 15.5 20l-3-6.5zM12.5 13.5 20 4.5" {...P} />,
  home: (
    <path d="M4.5 10.5 12 4l7.5 6.5V19c0 .6-.4 1-1 1h-4v-5.5h-5V20h-4c-.6 0-1-.4-1-1z" {...P} />
  ),
  switcher: (
    <>
      <rect x="7" y="4.5" width="10" height="15" rx="2" {...P} />
      <path d="M4 7v10M20 7v10" {...P} />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" {...P} strokeWidth={2.2} />,
  phone: <rect x="7" y="3" width="10" height="18" rx="2.6" {...P} />,
  store: (
    <>
      <path d="M5 8.5h14l-1.2 10.2c-.1.8-.8 1.3-1.6 1.3H7.8c-.8 0-1.5-.5-1.6-1.3z" {...P} />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" {...P} />
    </>
  ),
  code: <path d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5M13.4 5.5l-2.8 13" {...P} />,
  play: (
    <path
      d="M7 4.8v14.4c0 .8.9 1.3 1.6.8l10.6-7.2c.6-.4.6-1.2 0-1.6L8.6 4c-.7-.5-1.6 0-1.6.8z"
      {...P}
    />
  ),
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: UiIcon;
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
    >
      {UI[name]}
    </svg>
  );
}
