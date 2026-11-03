'use client';

import Image from 'next/image';
import { useState } from 'react';
import { db } from '../_shared/data';
import { hash32, type Label as LabelDef, type Person } from './model';
import type { Status } from './ci';
import s from './pr.module.scss';

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');
export type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/* ------------------------------------------------------------------ icons */

const Svg = ({
  children,
  size = 16,
  className,
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
);

export const Icon = {
  pr: () => (
    <Svg>
      <circle cx={4} cy={3.5} r={1.6} />
      <circle cx={4} cy={12.5} r={1.6} />
      <circle cx={12} cy={12.5} r={1.6} />
      <path d="M4 5.1v5.8M12 10.9V6.5c0-1.4-.8-2.2-2.2-2.2H7.5M9 2.6L7.3 4.3 9 6" />
    </Svg>
  ),
  merge: () => (
    <Svg>
      <circle cx={4} cy={3.5} r={1.6} />
      <circle cx={4} cy={12.5} r={1.6} />
      <circle cx={12} cy={8} r={1.6} />
      <path d="M4 5.1v5.8M4 5.3c.4 1.7 2 2.7 4.2 2.7h2.2" />
    </Svg>
  ),
  commit: () => (
    <Svg>
      <circle cx={8} cy={8} r={2.6} />
      <path d="M1.5 8h3.9M10.6 8h3.9" />
    </Svg>
  ),
  checks: () => (
    <Svg>
      <circle cx={8} cy={8} r={6.2} />
      <path d="M5.3 8.2l1.9 1.9 3.6-3.8" />
    </Svg>
  ),
  files: () => (
    <Svg>
      <path d="M3.5 1.8h6l3 3v9.4h-9z" />
      <path d="M9.5 1.8v3h3M8 7v4M6 9h4" />
    </Svg>
  ),
  comment: () => (
    <Svg>
      <path d="M2.5 3.5c0-.8.7-1.5 1.5-1.5h8c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5H7l-3 2.5V11c-.8 0-1.5-.7-1.5-1.5z" />
    </Svg>
  ),
  check: () => (
    <Svg>
      <path d="M3 8.5l3 3 7-7" />
    </Svg>
  ),
  x: () => (
    <Svg>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  ),
  chevron: () => (
    <Svg>
      <path d="M6 4l4 4-4 4" />
    </Svg>
  ),
  down: () => (
    <Svg size={12}>
      <path d="M4 6l4 4 4-4" />
    </Svg>
  ),
  copy: () => (
    <Svg size={14}>
      <rect x={5} y={5} width={8.5} height={8.5} rx={1.6} />
      <path d="M10.5 5V3.6c0-.9-.7-1.6-1.6-1.6H3.6C2.7 2 2 2.7 2 3.6v5.3c0 .9.7 1.6 1.6 1.6H5" />
    </Svg>
  ),
  out: () => (
    <Svg size={12}>
      <path d="M6 3h7v7M13 3L4 12" />
    </Svg>
  ),
  mail: () => (
    <Svg>
      <rect x={2} y={3.5} width={12} height={9} rx={1.5} />
      <path d="M2.5 4.5L8 9l5.5-4.5" />
    </Svg>
  ),
  file: () => (
    <Svg size={14}>
      <path d="M4 1.8h5l3 3v9.4H4z" />
      <path d="M9 1.8v3h3" />
    </Svg>
  ),
  folder: () => (
    <Svg size={14}>
      <path d="M1.8 4c0-.6.5-1.1 1.1-1.1h3.4l1.4 1.6h5.4c.6 0 1.1.5 1.1 1.1v6.3c0 .6-.5 1.1-1.1 1.1H2.9c-.6 0-1.1-.5-1.1-1.1z" />
    </Svg>
  ),
  eye: () => (
    <Svg size={14}>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx={8} cy={8} r={2} />
    </Svg>
  ),
  plus: () => (
    <Svg size={12}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  ),
  branch: () => (
    <Svg size={14}>
      <circle cx={4.5} cy={3.5} r={1.5} />
      <circle cx={4.5} cy={12.5} r={1.5} />
      <circle cx={11.5} cy={5} r={1.5} />
      <path d="M4.5 5v6M11.5 6.5c0 2.5-2 3.4-5.8 4.6" />
    </Svg>
  ),
  tag: () => (
    <Svg size={14}>
      <path d="M2 2.5h5.3l6.2 6.2-4.8 4.8L2.5 7.3z" />
      <circle cx={5} cy={5.3} r={0.9} />
    </Svg>
  ),
  refresh: () => (
    <Svg size={14}>
      <path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v3h-3" />
    </Svg>
  ),
  smile: () => (
    <Svg size={14}>
      <circle cx={8} cy={8} r={6} />
      <path d="M5.6 9.6c.6.9 1.4 1.3 2.4 1.3s1.8-.4 2.4-1.3" />
      <path d="M6 6.4h.01M10 6.4h.01" strokeWidth={2} />
    </Svg>
  ),
  shield: () => (
    <Svg size={14}>
      <path d="M8 1.8l5 1.9v4c0 3.2-2.2 5.4-5 6.5-2.8-1.1-5-3.3-5-6.5v-4z" />
    </Svg>
  ),
  info: () => (
    <Svg size={14}>
      <circle cx={8} cy={8} r={6.2} />
      <path d="M8 7.3v3.6M8 5h.01" />
    </Svg>
  ),
  alert: () => (
    <Svg size={14}>
      <path d="M8 2.2l6.2 11H1.8z" />
      <path d="M8 6.5v3M8 11.3h.01" />
    </Svg>
  ),
  unified: () => (
    <Svg size={14}>
      <rect x={2} y={2.5} width={12} height={11} rx={1.5} />
      <path d="M4.5 6h7M4.5 8.5h7M4.5 11h4" />
    </Svg>
  ),
  split: () => (
    <Svg size={14}>
      <rect x={2} y={2.5} width={12} height={11} rx={1.5} />
      <path d="M8 2.5v11M4 6h2M4 8.5h2M10 6h2M10 8.5h2" />
    </Svg>
  ),
  wrap: () => (
    <Svg size={14}>
      <path d="M2 4h12M2 8h9.5a2 2 0 010 4H8M9.5 10.5L8 12l1.5 1.5M2 12h3" />
    </Svg>
  ),
  sidebar: () => (
    <Svg size={14}>
      <rect x={2} y={2.5} width={12} height={11} rx={1.5} />
      <path d="M6 2.5v11" />
    </Svg>
  ),
  lock: () => (
    <Svg size={14}>
      <rect x={3} y={7} width={10} height={7} rx={1.5} />
      <path d="M5.2 7V5a2.8 2.8 0 015.6 0v2" />
    </Svg>
  ),
  download: () => (
    <Svg size={14}>
      <path d="M8 2v8M4.8 7L8 10.2 11.2 7M2.5 13.5h11" />
    </Svg>
  ),
  cpu: () => (
    <Svg size={14}>
      <rect x={4} y={4} width={8} height={8} rx={1} />
      <path d="M6 1.8V4M10 1.8V4M6 12v2.2M10 12v2.2M1.8 6H4M1.8 10H4M12 6h2.2M12 10h2.2" />
    </Svg>
  ),
  revert: () => (
    <Svg size={14}>
      <path d="M5 3.5L2.5 6 5 8.5" />
      <path d="M2.5 6h7a4 4 0 010 8H6" />
    </Svg>
  ),
};

/* ------------------------------------------------------------------ avatars */

/** A 5×5 mirrored identicon, from the login's hash. */
export function Identicon({ person, size = 32 }: { person: Person; size?: number }) {
  const h = hash32(person.login, 3);
  const cells: [number, number][] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((h >>> (y * 3 + x)) & 1) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 -1 7 7"
      aria-hidden="true"
      className={s.identicon}
      style={{ '--c': person.color } as Vars}
    >
      <rect x={-1} y={-1} width={7} height={7} className={s.idBg} />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} className={s.idCell} />
      ))}
    </svg>
  );
}

export function Avatar({ person, size = 32 }: { person: Person; size?: number }) {
  if (person.kind === 'author') {
    return (
      <Image
        src={db.person.photo}
        width={size}
        height={size}
        alt=""
        className={s.avatar}
        style={{ width: size, height: size }}
      />
    );
  }
  if (person.kind === 'you') {
    return (
      <span
        className={cx(s.avatar, s.youAvatar)}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        aria-hidden="true"
      >
        you
      </span>
    );
  }
  return (
    <span className={s.avatar} style={{ width: size, height: size }}>
      <Identicon person={person} size={size} />
    </span>
  );
}

export function Who({ person }: { person: Person }) {
  return (
    <span className={s.who}>
      <b>{person.login}</b>
      {person.kind === 'persona' && (
        <span className={s.personaTag} title={`A fictional reviewer who looks at ${person.focus}`}>
          persona
        </span>
      )}
      {person.kind === 'author' && <span className={s.roleTag}>Author</span>}
    </span>
  );
}

export function LabelChip({ label }: { label: LabelDef }) {
  return (
    <span className={s.label} style={{ '--c': label.color } as Vars} title={label.description}>
      {label.name}
    </span>
  );
}

/* ------------------------------------------------------------------ job status */

export function StatusIcon({
  status,
  size = 16,
}: {
  status: Status | 'pending' | 'skipped';
  size?: number;
}) {
  if (status === 'running') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className={cx(s.statusIcon, s.spin)}
        data-status="running"
        aria-hidden="true"
      >
        <circle cx={8} cy={8} r={6} fill="none" strokeWidth={2} className={s.spinTrack} />
        <path d="M8 2a6 6 0 016 6" fill="none" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  if (status === 'success') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className={s.statusIcon}
        data-status="success"
        aria-hidden="true"
      >
        <circle cx={8} cy={8} r={7} />
        <path
          d="M5 8.2l2 2 4-4.2"
          fill="none"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === 'failure') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className={s.statusIcon}
        data-status="failure"
        aria-hidden="true"
      >
        <circle cx={8} cy={8} r={7} />
        <path
          d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
          fill="none"
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={s.statusIcon}
      data-status="queued"
      aria-hidden="true"
    >
      <circle cx={8} cy={8} r={5.5} fill="none" strokeWidth={1.6} strokeDasharray="2.4 2.2" />
    </svg>
  );
}

export const STATUS_TEXT: Record<Status, string> = {
  queued: 'Queued',
  running: 'In progress',
  success: 'Successful',
  failure: 'Failed',
};

/* ------------------------------------------------------------------ copy */

export function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setDone(true);
        window.setTimeout(() => setDone(false), 1400);
      },
      () => setDone(false),
    );
  };
  return (
    <button
      type="button"
      className={cx(s.iconBtn, className)}
      onClick={copy}
      aria-label={done ? 'Copied' : label}
      title={label}
    >
      {done ? <Icon.check /> : <Icon.copy />}
    </button>
  );
}

/* ------------------------------------------------------------------ a little Markdown */

/** Inline Markdown: `code`, **bold**, [links](url), <email> and bare URLs. */
export function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re =
    /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)|<([^>\s]+@[^>\s]+)>|(https?:\/\/[^\s)]+)|_([^_]+)_/g;
  let last = 0;
  let k = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<code key={k++}>{m[1]}</code>);
    else if (m[2]) parts.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3])
      parts.push(
        <a key={k++} href={m[4]} target="_blank" rel="noreferrer">
          {m[3]}
        </a>,
      );
    else if (m[5])
      parts.push(
        <a key={k++} href={`mailto:${m[5]}`}>
          {m[5]}
        </a>,
      );
    else if (m[6])
      parts.push(
        <a key={k++} href={m[6]} target="_blank" rel="noreferrer">
          {m[6].replace(/^https?:\/\//, '')}
        </a>,
      );
    else if (m[7]) parts.push(<em key={k++}>{m[7]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Block Markdown for the README and CHANGELOG previews: headings, lists and paragraphs. */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let k = 0;
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (!line.trim()) {
      i++;
    } else if (h) {
      const level = Math.min(6, h[1].length + 1);
      const Tag = `h${level}` as 'h2';
      blocks.push(
        <Tag key={k++}>
          <Inline text={h[2]} />
        </Tag>,
      );
      i++;
    } else if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]\s|\s{2})/.test(lines[i]) && lines[i].trim()) {
        if (/^\s*[-*]\s/.test(lines[i])) items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      blocks.push(
        <ul key={k++}>
          {items.map((it, n) => (
            <li key={n}>
              <Inline text={it} />
            </li>
          ))}
        </ul>,
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*]\s)/.test(lines[i]))
        para.push(lines[i++]);
      blocks.push(
        <p key={k++}>
          <Inline text={para.join(' ')} />
        </p>,
      );
    }
  }
  return <div className={s.md}>{blocks}</div>;
}
