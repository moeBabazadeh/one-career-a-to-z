// The tracker's small parts: status rings, priority bars, avatars, labels, project marks and the
// line icons, all drawn here as SVG so they take the theme's tokens.

import type { CSSProperties, ReactNode } from 'react';
import type { ProductId } from '@/content/db';
import { db } from '../_shared/data';
import {
  label,
  priorityName,
  project,
  statusName,
  team,
  type LabelId,
  type LinkKind,
  type Priority,
  type ProjectStatus,
  type StatusId,
  type TeamId,
} from './model';
import s from './tracker.module.scss';

export type Vars = CSSProperties & Record<`--${string}`, string | number>;

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ status */

export function StatusIcon({ status, size = 14 }: { status: StatusId; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={s.statusIcon}
      data-status={status}
      role="img"
      aria-label={statusName(status)}
    >
      {status === 'backlog' && (
        <circle cx="7" cy="7" r="5.6" fill="none" strokeWidth="1.5" strokeDasharray="1.4 1.65" />
      )}
      {status === 'todo' && <circle cx="7" cy="7" r="5.6" fill="none" strokeWidth="1.5" />}
      {status === 'progress' && (
        <>
          <circle cx="7" cy="7" r="5.6" fill="none" strokeWidth="1.5" />
          <path d="M7 3.6 A3.4 3.4 0 0 1 7 10.4 Z" className={s.statusFill} />
        </>
      )}
      {status === 'done' && (
        <>
          <circle cx="7" cy="7" r="6.4" className={s.statusFill} />
          <path
            d="M4.3 7.1 6.2 9 9.8 5.2"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={s.statusMark}
          />
        </>
      )}
      {status === 'shipped' && (
        <>
          <circle cx="7" cy="7" r="6.4" className={s.statusFill} />
          <path
            d="M7 10V4.4M4.6 6.6 7 4.2l2.4 2.4"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={s.statusMark}
          />
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ priority */

export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === 0)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        className={s.prioIcon}
        role="img"
        aria-label={priorityName(0)}
      >
        <rect x="1.5" y="6.25" width="2.6" height="1.5" rx="0.6" />
        <rect x="5.7" y="6.25" width="2.6" height="1.5" rx="0.6" />
        <rect x="9.9" y="6.25" width="2.6" height="1.5" rx="0.6" />
      </svg>
    );
  if (priority === 1)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        className={s.prioUrgent}
        role="img"
        aria-label={priorityName(1)}
      >
        <rect x="1" y="1" width="12" height="12" rx="3" />
        <path d="M7 3.8v4" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="10.1" r="0.95" />
      </svg>
    );
  const on = 5 - priority;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={s.prioIcon}
      role="img"
      aria-label={priorityName(priority)}
    >
      {[0, 1, 2].map((b) => (
        <rect
          key={b}
          x={1.5 + b * 4.2}
          y={12.5 - (b + 1) * 3.3}
          width="2.8"
          height={(b + 1) * 3.3}
          rx="0.8"
          data-off={b >= on || undefined}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ people */

export function Avatar({ who, size = 20 }: { who: 'moe' | 'you' | null; size?: number }) {
  if (!who)
    return (
      <span
        className={cx(s.avatar, s.avatarNone)}
        style={{ '--size': `${size}px` } as Vars}
        role="img"
        aria-label="Unassigned"
      >
        <svg viewBox="0 0 16 16" width={size * 0.6} height={size * 0.6} aria-hidden="true">
          <circle cx="8" cy="6" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M3.4 13.2c.9-2.2 2.6-3.2 4.6-3.2s3.7 1 4.6 3.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  if (who === 'you')
    return (
      <span
        className={cx(s.avatar, s.avatarYou)}
        style={{ '--size': `${size}px` } as Vars}
        role="img"
        aria-label="You"
      >
        Y
      </span>
    );
  return (
    <span
      className={s.avatar}
      style={{ '--size': `${size}px`, backgroundImage: `url(${db.person.photo})` } as Vars}
      role="img"
      aria-label={db.person.first}
    />
  );
}

export const personName = (who: 'moe' | 'you' | null) =>
  who === 'moe' ? db.person.first : who === 'you' ? 'You' : 'Unassigned';

/* ------------------------------------------------------------------ labels, teams, projects */

export function LabelChip({ id, compact }: { id: LabelId; compact?: boolean }) {
  const l = label(id);
  return (
    <span
      className={cx(s.labelChip, compact && s.labelCompact)}
      style={{ '--c': l.color } as Vars}
      title={l.name}
    >
      <i aria-hidden="true" />
      <span>{l.name}</span>
    </span>
  );
}

export function LabelDot({ id }: { id: LabelId }) {
  return <i className={s.labelDot} style={{ '--c': label(id).color } as Vars} aria-hidden="true" />;
}

export function TeamMark({ id, size = 16 }: { id: TeamId; size?: number }) {
  const t = team(id);
  return (
    <span
      className={s.teamMark}
      style={{ '--c': t.color, '--size': `${size}px` } as Vars}
      aria-hidden="true"
    >
      {t.name.charAt(0)}
    </span>
  );
}

export function ProjectMark({ id, size = 14 }: { id: ProductId; size?: number }) {
  const p = project(id);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={s.projectMark}
      style={{ '--c': p.color } as Vars}
      aria-hidden="true"
    >
      <path d="M7 1.2 12.2 4v6L7 12.8 1.8 10V4Z" />
      <path d="M1.8 4 7 6.8 12.2 4M7 6.8v6" className={s.projectMarkEdge} />
    </svg>
  );
}

export function ProjectStatusIcon({ status, size = 14 }: { status: ProjectStatus; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={s.pStatus}
      data-status={status}
      aria-hidden="true"
    >
      {status === 'progress' && (
        <>
          <circle cx="7" cy="7" r="5.6" fill="none" strokeWidth="1.5" />
          <path d="M7 3.6 A3.4 3.4 0 1 1 3.6 7 L7 7 Z" className={s.pStatusFill} />
        </>
      )}
      {status === 'live' && (
        <>
          <circle cx="7" cy="7" r="5.6" fill="none" strokeWidth="1.5" />
          <circle cx="7" cy="7" r="3" className={s.pStatusFill} />
        </>
      )}
      {status === 'completed' && (
        <>
          <circle cx="7" cy="7" r="6.4" className={s.pStatusFill} />
          <path
            d="M4.3 7.1 6.2 9 9.8 5.2"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            stroke="#fff"
          />
        </>
      )}
    </svg>
  );
}

/** A progress ring, as a share from 0 to 1. */
export function Ring({ share, size = 14 }: { share: number; size?: number }) {
  const r = 5;
  const len = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={s.ring} aria-hidden="true">
      <circle cx="7" cy="7" r={r} className={s.ringTrack} />
      <circle
        cx="7"
        cy="7"
        r={r}
        className={s.ringFill}
        strokeDasharray={`${len * share} ${len}`}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
}

/** A shortcut as keys: "G B" draws as G then B. */
export function Keys({ k }: { k: string }) {
  return (
    <span className={s.keys}>
      {k.split(' ').map((part, i) => (
        <Kbd key={i}>{part}</Kbd>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ line icons */

const PATHS = {
  inbox: 'M2.5 9.5h3l1 1.5h3l1-1.5h3M3.6 3.5h8.8l1.1 6v3h-11v-3z',
  my: 'M8 8.2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4ZM3 13.5c.8-2.3 2.7-3.5 5-3.5s4.2 1.2 5 3.5',
  board: 'M2.5 3h3v10h-3zM6.5 3h3v7h-3zM10.5 3h3v5h-3z',
  list: 'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  roadmap: 'M2.5 3v10M2.5 4.5h6M5 8h7.5M3.8 11.5h5.2',
  projects: 'M8 1.8 13.5 4.8v6.4L8 14.2 2.5 11.2V4.8ZM2.5 4.8 8 7.8l5.5-3M8 7.8v6.4',
  cycles: 'M13 8a5 5 0 1 1-1.5-3.6M13 2.8v2.4h-2.4',
  search: 'M7.2 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6ZM10.6 10.6l3 3',
  compose:
    'M7.5 2.5h-4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4M11.6 2.2l2.2 2.2L8.3 9.9 5.6 10.4l.5-2.7z',
  filter: 'M2.5 4h11M4.5 8h7M6.5 12h3',
  display: 'M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6M10 3v3M6 10v3',
  chevron: 'M6 4l4 4-4 4',
  chevronDown: 'M4 6l4 4 4-4',
  close: 'M4 4l8 8M12 4l-8 8',
  check: 'M3.5 8.3 6.6 11.2 12.5 4.8',
  link: 'M7 9a3 3 0 0 0 4.2.3l2-2a3 3 0 0 0-4.2-4.2l-1 1M9 7a3 3 0 0 0-4.2-.3l-2 2A3 3 0 0 0 7 12.9l1-1',
  pr: 'M4.5 5.5v5M4.5 5.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM4.5 13.7a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM11.5 13.7a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM11.5 10.5V6a2 2 0 0 0-2-2H7.5M8.8 2.6 7.4 4l1.4 1.4',
  site: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM2 8h12M8 2c1.6 1.7 2.4 3.7 2.4 6S9.6 12.3 8 14M8 2C6.4 3.7 5.6 5.7 5.6 8s.8 4.3 2.4 6',
  store: 'M5 1.8h6a1 1 0 0 1 1 1v10.4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1ZM7 12h2',
  code: 'M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5',
  paper: 'M4 1.8h5.2L12.5 5v9.2H4zM9 1.8V5h3.5M6 8.2h4.5M6 10.8h4.5',
  mail: 'M2 4h12v8.5H2zM2.4 4.4 8 9l5.6-4.6',
  cv: 'M4 1.8h5.2L12.5 5v9.2H4zM9 1.8V5h3.5M8.2 7.5v4.6M6.2 10.2l2 2 2-2',
  profile:
    'M2.5 3.5h11v9h-11zM6 8.6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM3.9 11c.4-1 1.1-1.5 2.1-1.5s1.7.5 2.1 1.5M9.5 6.5h2.5M9.5 9h2.5',
  sun: 'M8 10.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6ZM8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9',
  moon: 'M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z',
  help: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM6.3 6.2a1.8 1.8 0 0 1 3.5.6c0 1.2-1.8 1.6-1.8 2.7M8 11.4v.01',
  reset: 'M3 8a5 5 0 1 0 1.5-3.6M3 2.8v2.4h2.4',
  book: 'M2.5 3.2c1.8-.6 3.8-.4 5.5.8 1.7-1.2 3.7-1.4 5.5-.8v9.6c-1.8-.6-3.8-.4-5.5.8-1.7-1.2-3.7-1.4-5.5-.8ZM8 4v9.6',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  star: 'M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z',
  up: 'M8 13V3M4 7l4-4 4 4',
  down: 'M8 3v10M4 9l4 4 4-4',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9',
  menu: 'M2.5 4h11M2.5 8h11M2.5 12h11',
  team: 'M5.5 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM11 7.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM1.8 13c.6-2 2-3 3.7-3s3.1 1 3.7 3M10 9.8c1.9-.4 3.4.5 4.1 2.6',
  calendar: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
  tag: 'M2.5 2.5h5l6 6-5 5-6-6zM5.2 5.2h.01',
  external:
    'M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5',
  copy: 'M5.5 5.5h7v8h-7zM3.5 10.5v-8h7',
  undo: 'M5 3 2.5 5.5 5 8M2.5 5.5H10a3.5 3.5 0 0 1 0 7H6',
  zoomIn: 'M7.2 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6ZM10.6 10.6l3 3M5.2 7.2h4M7.2 5.2v4',
  zoomOut: 'M7.2 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6ZM10.6 10.6l3 3M5.2 7.2h4',
  today: 'M8 2v12M5 4.5h6',
  stack: 'M8 2 14 5 8 8 2 5ZM2 8l6 3 6-3M2 11l6 3 6-3',
  comment: 'M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z',
  sparkle: 'M8 2.2v3.2M8 10.6v3.2M2.2 8h3.2M10.6 8h3.2',
} as const;

export type IconName = keyof typeof PATHS;

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
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cx(s.icon, className)}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export const LINK_ICON: Record<LinkKind, IconName> = {
  pr: 'pr',
  site: 'site',
  store: 'store',
  code: 'code',
  paper: 'paper',
  mail: 'mail',
  cv: 'cv',
  profile: 'profile',
};
