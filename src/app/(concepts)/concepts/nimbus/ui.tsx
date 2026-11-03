'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { jsonLines, type Line } from './cli';
import { STATUS, rng, hash, type Status as StatusId } from './inventory';
import { href } from './store';
import s from './console.module.scss';

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ icons */

const P = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm9 2-4.2-4.2',
  terminal: 'M4 5h16v14H4zM7.5 9.5 10 12l-2.5 2.5M12.5 15H16',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4h4',
  help: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-2.4-11.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.5M12 17h.01',
  globe:
    'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0 0c2.5-2.5 3.6-5.5 3.6-9S14.5 5.5 12 3m0 18c-2.5-2.5-3.6-5.5-3.6-9S9.5 5.5 12 3M3.5 9h17M3.5 15h17',
  down: 'm6 9 6 6 6-6',
  right: 'm9 6 6 6-6 6',
  left: 'm15 6-6 6 6 6',
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  compute: 'M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5h.01M7.5 16.5h.01M11 7.5h5M11 16.5h5',
  iot: 'M8 8h8v8H8zM10 4v4M14 4v4M10 16v4M14 16v4M4 10h4M4 14h4M16 10h4M16 14h4',
  databases:
    'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  ml: 'M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  storage: 'M4 6.5 12 3l8 3.5v11L12 21l-8-3.5zM4 6.5l8 3.5 8-3.5M12 10v11',
  iam: 'M8.5 14a4.5 4.5 0 1 1 3.9-6.75L21 7.3V11h-2v2h-2.5v-2.2h-4.1A4.5 4.5 0 0 1 8.5 14Zm-1-4.5h.01',
  billing: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  events: 'M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11',
  marketplace:
    'M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s2.7-1.3 2.7-3c0 1.7 1.3 3 2.8 3s2.8-1.3 2.8-3c0 1.7 1.2 3 2.7 3s2-1.3 2-3M10 20v-5h4v5',
  regions:
    'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  resources: 'm12 3 9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
  services: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  x: 'M6 6l12 12M18 6 6 18',
  out: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 9a7.5 7.5 0 0 1 15 0',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  book: 'M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h13v-4',
  mail: 'M3 5h18v14H3zm0 1 9 7 9-7',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  code: 'm8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
  panel: 'M4 4h16v16H4zM9 4v16',
  max: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  min: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  info: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0-10v6m0-9.5h.01',
  play: 'M7 4.5v15l12-7.5z',
  download: 'M12 4v11m-5-5 5 5 5-5M4 20h16',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0-13v5l3 2',
  filter: 'M4 5h16l-6 7.5V19l-4 2v-8.5z',
  sort: 'M8 4v16m0 0-4-4m4 4 4-4M16 20V4m0 0-4 4m4-4 4 4',
  up: 'm6 15 6-6 6 6',
  restore: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5M12 8v4l3 2',
  shield: 'M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z',
  spark: 'M4 18 9 12l4 3 7-9',
  plus: 'M12 5v14M5 12h14',
  dot: 'M12 12h.01',
} as const;

export type IconName = keyof typeof P;

export function Icon({
  name,
  size = 18,
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
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx(s.icon, className)}
    >
      <path d={P[name]} />
    </svg>
  );
}

/** The console's mark: a stack of three offset rounded tiles. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={s.mark}>
      <rect x="2" y="9" width="20" height="20" rx="6" className={s.markA} />
      <rect x="10" y="3" width="20" height="20" rx="6" className={s.markB} />
      <path d="M15 13h10M15 17.5h6" className={s.markC} />
    </svg>
  );
}

/* ------------------------------------------------------------------ small parts */

export function StatusBadge({ status, label }: { status: StatusId; label?: string }) {
  const st = STATUS[status];
  return (
    <span className={s.status} data-tone={st.tone}>
      <i aria-hidden="true" />
      {label ?? st.label}
    </span>
  );
}

export function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'accent' | 'ok' | 'warn' | 'muted' | 'info';
}) {
  return (
    <span className={s.pill} data-tone={tone}>
      {children}
    </span>
  );
}

export function Illustrative() {
  return (
    <span className={s.illustrative} title="Seeded, illustrative series: not a measurement">
      <Icon name="info" size={12} /> Illustrative
    </span>
  );
}

export function CopyButton({
  text,
  label = 'Copy',
  small,
}: {
  text: string;
  label?: string;
  small?: boolean;
}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className={cx(s.copy, small && s.copySmall)}
      aria-label={done ? 'Copied' : label}
      title={label}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => setDone(true),
          () => undefined,
        );
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={small ? 13 : 15} />
    </button>
  );
}

export function Crn({ value }: { value: string }) {
  return (
    <span className={s.crn}>
      <code>{value}</code>
      <CopyButton text={value} label="Copy CRN" small />
    </span>
  );
}

export function Ext({
  url,
  children,
  className,
}: {
  url: string;
  children: ReactNode;
  className?: string;
}) {
  const external = /^https?:/.test(url);
  return (
    <a
      href={url}
      className={className}
      target={external || url.endsWith('.pdf') ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      {children}
      {external && <Icon name="out" size={12} className={s.extIcon} />}
    </a>
  );
}

export function PageHead({
  title,
  kicker,
  lede,
  actions,
  children,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={s.pageHead}>
      <div className={s.pageHeadText}>
        {kicker && <p className={s.kicker}>{kicker}</p>}
        <h1 tabIndex={-1} data-page-title>
          {title}
        </h1>
        {lede && <p className={s.lede}>{lede}</p>}
        {children}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  id,
  flush,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={cx(s.card, flush && s.cardFlush, className)}
      id={id}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {(title || actions) && (
        <header className={s.cardHead}>
          {title && <h2>{title}</h2>}
          {actions && <div className={s.cardActions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function KeyValues({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className={s.kv}>
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tags({ tags }: { tags: [string, string][] }) {
  return (
    <ul className={s.tags}>
      {tags.map(([k, v], i) => (
        <li key={`${k}-${v}-${i}`}>
          <span>{k}</span>
          <b>{v}</b>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      <Icon name="resources" size={28} />
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ tabs */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const id = useId();
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === value);
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    let to = -1;
    if (e.key in step) to = (i + step[e.key] + tabs.length) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
  };
  return (
    <div className={s.tabs} role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${id}-${t.id}`}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count !== undefined && <span className={s.tabCount}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ code */

export function LinesView({
  lines,
  numbered,
  className,
  label,
}: {
  lines: Line[];
  numbered?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <pre
      className={cx(s.code, numbered && s.codeNumbered, className)}
      tabIndex={0}
      aria-label={label}
    >
      {lines.map((l, i) => (
        <span key={i} className={s.codeLine}>
          {numbered && (
            <span className={s.ln} aria-hidden="true">
              {i + 1}
            </span>
          )}
          <span>
            {l.length === 0 ? '​' : null}
            {l.map((seg, j) =>
              seg.href ? (
                <a
                  key={j}
                  href={seg.href}
                  target={seg.href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  className={s[`t_${seg.c ?? 'str'}`]}
                >
                  {seg.t}
                </a>
              ) : seg.go !== undefined ? (
                <a key={j} href={href(seg.go)} className={s[`t_${seg.c ?? 'accent'}`]}>
                  {seg.t}
                </a>
              ) : (
                <span key={j} className={seg.c ? s[`t_${seg.c}`] : undefined}>
                  {seg.t}
                </span>
              ),
            )}
          </span>
        </span>
      ))}
    </pre>
  );
}

export function JsonView({
  value,
  label,
  title,
}: {
  value: unknown;
  label: string;
  title?: ReactNode;
}) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const lines = useMemo(() => jsonLines(value), [value]);
  return (
    <div className={s.codePanel}>
      <div className={s.codeHead}>
        <span>{title ?? 'JSON'}</span>
        <CopyButton text={text} label={`Copy ${label}`} />
      </div>
      <LinesView lines={lines} numbered label={label} />
    </div>
  );
}

/* ------------------------------------------------------------------ data table */

export interface Col<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  /** Hidden on phones. */
  wide?: boolean;
  align?: 'end';
}

export function DataTable<T>({
  rows,
  cols,
  rowKey,
  search,
  title,
  actions,
  pageSize = 12,
  initialSort,
  empty = 'No resources match.',
  placeholder = 'Find resources',
  toolbar,
}: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (row: T) => string;
  search?: (row: T) => string;
  title?: ReactNode;
  actions?: ReactNode;
  pageSize?: number;
  initialSort?: { key: string; dir: 1 | -1 };
  empty?: string;
  placeholder?: string;
  toolbar?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let out =
      search && terms.length
        ? rows.filter((r) => terms.every((t) => search(r).toLowerCase().includes(t)))
        : rows;
    const col = sort && cols.find((c) => c.key === sort.key);
    if (col?.sort && sort) {
      const by = col.sort;
      out = [...out].sort((a, b) => {
        const x = by(a);
        const y = by(b);
        return (
          (typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y))) * sort.dir
        );
      });
    }
    return out;
  }, [rows, q, sort, cols, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const at = Math.min(page, pages - 1);
  const shown = filtered.slice(at * pageSize, at * pageSize + pageSize);

  return (
    <div className={s.table}>
      {(title || search || actions) && (
        <div className={s.tableHead}>
          {title && (
            <h2>
              {title}{' '}
              <span className={s.count}>
                (
                {filtered.length === rows.length
                  ? rows.length
                  : `${filtered.length}/${rows.length}`}
                )
              </span>
            </h2>
          )}
          {actions && <div className={s.tableActions}>{actions}</div>}
        </div>
      )}
      {(search || toolbar) && (
        <div className={s.tableTools}>
          {search && (
            <label className={s.find}>
              <Icon name="search" size={15} />
              <input
                type="search"
                value={q}
                placeholder={placeholder}
                aria-label={placeholder}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          )}
          {toolbar}
          {pages > 1 && (
            <nav className={s.pager} aria-label="Pages">
              <button
                type="button"
                aria-label="Previous page"
                disabled={at === 0}
                onClick={() => setPage(at - 1)}
              >
                <Icon name="left" size={15} />
              </button>
              <span>
                {at + 1} / {pages}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={at >= pages - 1}
                onClick={() => setPage(at + 1)}
              >
                <Icon name="right" size={15} />
              </button>
            </nav>
          )}
        </div>
      )}
      <div className={s.tableScroll}>
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={cx(c.wide && s.wide, c.align === 'end' && s.end)}
                  aria-sort={
                    sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined
                  }
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort(
                          sort?.key === c.key
                            ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 }
                            : { key: c.key, dir: 1 },
                        )
                      }
                    >
                      {c.label}
                      <Icon
                        name={sort?.key === c.key ? (sort.dir === 1 ? 'up' : 'down') : 'sort'}
                        size={12}
                      />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={rowKey(r)}>
                {cols.map((c) => (
                  <td key={c.key} className={cx(c.wide && s.wide, c.align === 'end' && s.end)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={cols.length} className={s.noRows}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ charts */

/** The width of an element, kept current. */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.max(120, Math.round(e.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export const RANGES = [
  { id: '1h', label: '1h', points: 60, ticks: ['-60m', '-45m', '-30m', '-15m', 'now'] },
  { id: '12h', label: '12h', points: 72, ticks: ['-12h', '-9h', '-6h', '-3h', 'now'] },
  { id: '1d', label: '1d', points: 96, ticks: ['-24h', '-18h', '-12h', '-6h', 'now'] },
  { id: '1w', label: '1w', points: 84, ticks: ['-7d', '-5d', '-3d', '-1d', 'now'] },
  { id: '30d', label: '30d', points: 90, ticks: ['-30d', '-22d', '-15d', '-7d', 'now'] },
] as const;
export type RangeId = (typeof RANGES)[number]['id'];

export interface Metric {
  id: string;
  label: string;
  unit: string;
  /** Typical level and how far it swings. */
  base: number;
  swing: number;
  digits?: number;
  /** A fixed top for the axis, like 100 for a percentage. */
  max?: number;
  /** A straight trend per point instead of noise around a level (battery drain). */
  slope?: number;
  note?: string;
}

/** A seeded series: a daily rhythm plus a random walk, the texture of a real metric. */
export function seriesFor(seed: string, metric: Metric, range: RangeId) {
  const r = RANGES.find((x) => x.id === range) ?? RANGES[2];
  const rand = rng(hash(`${seed}:${metric.id}:${range}`));
  const cycles =
    range === '1h' ? 0.05 : range === '12h' ? 0.5 : range === '1d' ? 1 : range === '1w' ? 7 : 30;
  let walk = 0;
  return Array.from({ length: r.points }, (_, i) => {
    if (metric.slope !== undefined)
      return Math.max(0, metric.base + metric.slope * i + (rand() - 0.5) * metric.swing * 0.1);
    walk = walk * 0.85 + (rand() - 0.5) * 0.6;
    const day = Math.sin((i / r.points) * cycles * Math.PI * 2 - Math.PI / 2);
    const spike = rand() > 0.985 ? rand() * 0.9 : 0;
    return Math.max(0, metric.base + metric.swing * (0.55 * day + walk + spike));
  });
}

const niceMax = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
};

export function MetricChart({
  seed,
  metric,
  range,
  height = 150,
}: {
  seed: string;
  metric: Metric;
  range: RangeId;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const [hover, setHover] = useState<number | null>(null);
  const values = useMemo(() => seriesFor(seed, metric, range), [seed, metric, range]);
  const r = RANGES.find((x) => x.id === range) ?? RANGES[2];
  const pad = { l: 40, r: 10, t: 10, b: 22 };
  const max = metric.max ?? niceMax(Math.max(...values) * 1.1);
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (values.length - 1)) * w;
  const y = (v: number) => pad.t + h - (v / max) * h;
  const path = values
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join('');
  const area = `${path}L${x(values.length - 1)},${pad.t + h}L${pad.l},${pad.t + h}Z`;
  const fmtV = (v: number) => v.toFixed(metric.digits ?? 0);
  const last = values[values.length - 1];
  const onMove = (clientX: number, rect: DOMRect) => {
    const i = Math.round(((clientX - rect.left - pad.l) / w) * (values.length - 1));
    setHover(Math.max(0, Math.min(values.length - 1, i)));
  };

  return (
    <figure className={s.metric}>
      <figcaption>
        <span className={s.metricLabel}>{metric.label}</span>
        <span className={s.metricValue}>
          {fmtV(hover !== null ? values[hover] : last)}
          <small>{metric.unit}</small>
        </span>
        <Illustrative />
      </figcaption>
      <div ref={ref} className={s.metricPlot}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${metric.label}, illustrative seeded series over ${r.label}, last value ${fmtV(last)} ${metric.unit}`}
          onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={pad.t + h * (1 - f)}
                y2={pad.t + h * (1 - f)}
                className={s.grid}
              />
              <text x={pad.l - 6} y={pad.t + h * (1 - f) + 3.5} textAnchor="end" className={s.axis}>
                {max * f >= 10 ? Math.round(max * f) : fmtV(max * f)}
              </text>
            </g>
          ))}
          {r.ticks.map((t, i) => (
            <text
              key={t}
              x={pad.l + (i / (r.ticks.length - 1)) * w}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === r.ticks.length - 1 ? 'end' : 'middle'}
              className={s.axis}
            >
              {t}
            </text>
          ))}
          <path d={area} className={s.area} />
          <path d={path} className={s.line} />
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} className={s.cross} />
              <circle cx={x(hover)} cy={y(values[hover])} r={4} className={s.dotMark} />
            </g>
          )}
          {hover === null && (
            <circle cx={x(values.length - 1)} cy={y(last)} r={4} className={s.dotMark} />
          )}
        </svg>
      </div>
      {metric.note && <p className={s.metricNote}>{metric.note}</p>}
    </figure>
  );
}

export function RangePicker({
  value,
  onChange,
}: {
  value: RangeId;
  onChange: (r: RangeId) => void;
}) {
  return (
    <div className={s.segmented} role="radiogroup" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={value === r.id}
          onClick={() => onChange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
