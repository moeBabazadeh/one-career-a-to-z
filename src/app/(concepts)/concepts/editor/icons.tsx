// The workbench's icons: a 16px line set drawn for this editor.

import type { ReactNode } from 'react';
import { langOf, type SymKind } from './syntax';
import s from './editor.module.scss';

const I = ({
  children,
  size = 16,
  fill,
}: {
  children: ReactNode;
  size?: number;
  fill?: boolean;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth={1.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const Icon = {
  files: () => (
    <I size={24}>
      <path d="M9.5 1.5h-5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-7z" />
      <path d="M9.5 1.5v3h3" />
      <path d="M12.5 13.5v.5a1 1 0 0 1-1 1h-7" opacity={0.6} />
    </I>
  ),
  search: (p: { size?: number }) => (
    <I size={p.size ?? 24}>
      <circle cx={9.5} cy={6.5} r={4} />
      <path d="M6.6 9.4 2.5 13.5" />
    </I>
  ),
  scm: (p: { size?: number }) => (
    <I size={p.size ?? 24}>
      <circle cx={4.5} cy={3.5} r={1.6} />
      <circle cx={4.5} cy={12.5} r={1.6} />
      <circle cx={11.5} cy={5.5} r={1.6} />
      <path d="M4.5 5.1v5.8M11.5 7.1c0 2.6-2.2 3.3-5.4 4.1" />
    </I>
  ),
  account: () => (
    <I size={24}>
      <circle cx={8} cy={5.5} r={2.8} />
      <path d="M2.8 14.2c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3" />
    </I>
  ),
  gear: () => (
    <I size={24}>
      <circle cx={8} cy={8} r={2.2} />
      <path d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6 3.5 3.5" />
      <circle cx={8} cy={8} r={4.6} />
    </I>
  ),
  chevron: () => (
    <I>
      <path d="m6 4 4 4-4 4" />
    </I>
  ),
  close: () => (
    <I>
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
    </I>
  ),
  split: () => (
    <I>
      <rect x={2} y={2.5} width={12} height={11} rx={1} />
      <path d="M8 2.5v11" />
    </I>
  ),
  preview: () => (
    <I>
      <rect x={2} y={2.5} width={12} height={11} rx={1} />
      <path d="M8 2.5v11M10 6h2M10 8.5h2M4.5 6l1.5 1.5L4.5 9" />
    </I>
  ),
  source: () => (
    <I>
      <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
    </I>
  ),
  blame: () => (
    <I>
      <circle cx={4.5} cy={4.5} r={1.8} />
      <path d="M1.8 10.5c.4-1.8 1.4-2.8 2.7-2.8s2.3 1 2.7 2.8M9 4h5M9 7h5M9 10h5M2 13h12" />
    </I>
  ),
  more: () => (
    <I fill>
      <circle cx={3.5} cy={8} r={1.1} />
      <circle cx={8} cy={8} r={1.1} />
      <circle cx={12.5} cy={8} r={1.1} />
    </I>
  ),
  terminal: () => (
    <I>
      <rect x={1.5} y={2.5} width={13} height={11} rx={1.2} />
      <path d="m4.5 6 2 2-2 2M8 10.5h3.5" />
    </I>
  ),
  error: () => (
    <I>
      <circle cx={8} cy={8} r={6} />
      <path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" />
    </I>
  ),
  warning: () => (
    <I>
      <path d="M8 2 14.5 13.5h-13z" />
      <path d="M8 6.5v3.2M8 11.6v.1" />
    </I>
  ),
  info: () => (
    <I>
      <circle cx={8} cy={8} r={6} />
      <path d="M8 7.2v4M8 4.9v.1" />
    </I>
  ),
  branch: () => (
    <I>
      <circle cx={4.5} cy={3.5} r={1.5} />
      <circle cx={4.5} cy={12.5} r={1.5} />
      <circle cx={11.5} cy={4.5} r={1.5} />
      <path d="M4.5 5v6M11.5 6c0 3-3 3.5-6.4 5.4" />
    </I>
  ),
  sync: () => (
    <I>
      <path d="M13 7.5A5 5 0 0 0 3.6 5.4M3 8.5a5 5 0 0 0 9.4 2.1" />
      <path d="M3.4 2.6v2.9h2.9M12.6 13.4v-2.9H9.7" />
    </I>
  ),
  bell: () => (
    <I>
      <path d="M4 11V7.2a4 4 0 0 1 8 0V11l1 1.3H3zM6.7 14h2.6" />
    </I>
  ),
  check: () => (
    <I>
      <path d="m3 8.5 3.2 3.2L13 4.8" />
    </I>
  ),
  discard: () => (
    <I>
      <path d="M3.5 6.5h6.5a3.5 3.5 0 0 1 0 7H6" />
      <path d="m6 3.5-2.8 3 2.8 3" />
    </I>
  ),
  plus: () => (
    <I>
      <path d="M8 3v10M3 8h10" />
    </I>
  ),
  trash: () => (
    <I>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9" />
    </I>
  ),
  up: () => (
    <I>
      <path d="m4 10 4-4 4 4" />
    </I>
  ),
  down: () => (
    <I>
      <path d="m4 6 4 4 4-4" />
    </I>
  ),
  collapse: () => (
    <I>
      <rect x={2.5} y={2.5} width={11} height={11} rx={1} />
      <path d="M5.5 8h5" />
    </I>
  ),
  layoutSidebar: () => (
    <I>
      <rect x={1.5} y={2.5} width={13} height={11} rx={1} />
      <path d="M5.5 2.5v11" />
    </I>
  ),
  layoutPanel: () => (
    <I>
      <rect x={1.5} y={2.5} width={13} height={11} rx={1} />
      <path d="M1.5 9.5h13" />
    </I>
  ),
  page: () => (
    <I>
      <path d="M4 1.8h5.5L12.5 5v9.2H4z" />
      <path d="M9.5 1.8V5h3M6 8h4.5M6 10.5h4.5" />
    </I>
  ),
  history: () => (
    <I>
      <circle cx={8} cy={8} r={5.8} />
      <path d="M8 4.8V8l2.2 1.6" />
    </I>
  ),
  back: () => (
    <I>
      <path d="M13 8H3M7 4 3 8l4 4" />
    </I>
  ),
  edit: () => (
    <I>
      <path d="m10.5 2.8 2.7 2.7-7.6 7.6-3.3.6.6-3.3z" />
    </I>
  ),
  sun: () => (
    <I>
      <circle cx={8} cy={8} r={3} />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </I>
  ),
  moon: () => (
    <I>
      <path d="M12.8 10.2A5.5 5.5 0 0 1 5.8 3.2a5.5 5.5 0 1 0 7 7z" />
    </I>
  ),
  link: () => (
    <I>
      <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.7.7M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.7-.7" />
    </I>
  ),
  caseSensitive: () => (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
      <text x={1} y={12} fontSize={10} fontFamily="inherit" fill="currentColor">
        Aa
      </text>
    </svg>
  ),
  wholeWord: () => (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
      <text x={2} y={10.5} fontSize={9} fontFamily="inherit" fill="currentColor">
        ab
      </text>
      <path d="M1.5 13h13M1.5 11v2M14.5 11v2" stroke="currentColor" strokeWidth={1.1} fill="none" />
    </svg>
  ),
  regex: () => (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
      <rect x={2} y={10.5} width={3} height={3} fill="currentColor" />
      <path
        d="M11 2.5v6M8.4 4l5.2 3M13.6 4 8.4 7"
        stroke="currentColor"
        strokeWidth={1.2}
        fill="none"
      />
    </svg>
  ),
};

/** Outline icons: a coloured glyph per symbol kind. */
export function SymIcon({ kind }: { kind: SymKind }) {
  const glyph: Record<SymKind, string> = {
    heading: '#',
    interface: 'I',
    type: 'T',
    function: 'ƒ',
    constant: 'c',
    variable: 'v',
    property: 'p',
    object: '{}',
    array: '[]',
    string: 'ab',
    number: '#',
    boolean: '◑',
    null: '∅',
    key: 'k',
  };
  return (
    <span className={s.symIcon} data-kind={kind} aria-hidden="true">
      {glyph[kind]}
    </span>
  );
}

const BADGES: Record<string, string> = {
  markdown: 'M↓',
  typescript: 'TS',
  json: '{}',
  ignore: '◆',
  plaintext: '≡',
  yaml: 'Y',
  shell: '$',
};

/** A file's type as a small coloured badge, the way file icon themes mark them. */
export function FileIcon({ path, mode }: { path: string; mode?: string }) {
  if (mode === 'shortcuts')
    return (
      <span className={s.fileIcon} data-lang="keys" aria-hidden="true">
        ⌘
      </span>
    );
  if (mode === 'preview')
    return (
      <span className={s.fileIcon} data-lang="preview" aria-hidden="true">
        ◧
      </span>
    );
  const lang = langOf(path);
  return (
    <span className={s.fileIcon} data-lang={lang} aria-hidden="true">
      {BADGES[lang]}
    </span>
  );
}
