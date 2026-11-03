'use client';

// The system's UI kit, shared by every app: navigation bars with large titles that collapse as
// you scroll, inset grouped lists, switches, segmented controls and search fields.
import { useState } from 'react';
import { Icon, type UiIcon } from './icons';
import type { Action, OS } from './os';
import s from './apps.module.scss';

export interface Clock {
  time: string;
  date: string;
  weekday: string;
  day: number;
  month: number;
  year: number;
}

/** What an app gets from the system. */
export interface AppCtx {
  id: string;
  path: string;
  depth: number;
  push: (path: string) => void;
  pop: () => void;
  reset: (path?: string) => void;
  open: (app: string, stack?: string[]) => void;
  home: () => void;
  toast: (text: string) => void;
  os: OS;
  dispatch: React.Dispatch<Action>;
  clock: Clock | null;
  read: () => void;
}

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

interface ScreenProps {
  ctx: AppCtx;
  title: string;
  /** The previous screen's title, shown on the back button. */
  back?: string;
  /** Large title that collapses into the bar as you scroll. */
  large?: boolean;
  /** Buttons on the right of the bar. */
  actions?: React.ReactNode;
  /** Replaces the back button (e.g. Cancel). */
  lead?: React.ReactNode;
  /** A fixed bar under the content (toolbars, tab bars). */
  foot?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Screen({
  ctx,
  title,
  back,
  large = true,
  actions,
  lead,
  foot,
  className,
  children,
}: ScreenProps) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div className={cx(s.screen, className)} data-scrolled={scrolled || !large || undefined}>
      <div className={s.bar}>
        <div className={s.barLead}>
          {lead ??
            (ctx.depth > 1 && (
              <button type="button" className={s.back} onClick={ctx.pop} data-autofocus>
                <Icon name="chevronLeft" size={22} />
                <span>{back ?? 'Back'}</span>
              </button>
            ))}
        </div>
        <p className={s.barTitle} aria-hidden={large && !scrolled ? true : undefined}>
          {title}
        </p>
        <div className={s.barActions}>{actions}</div>
      </div>
      <div className={s.scroll} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 34)}>
        {large && <h2 className={s.large}>{title}</h2>}
        {!large && <h2 className={s.srOnly}>{title}</h2>}
        {children}
      </div>
      {foot}
    </div>
  );
}

export function Group({
  header,
  footer,
  children,
  className,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(s.group, className)}>
      {header && <h3 className={s.groupHead}>{header}</h3>}
      <ul className={s.list}>{children}</ul>
      {footer && <p className={s.groupFoot}>{footer}</p>}
    </section>
  );
}

interface RowProps {
  icon?: UiIcon;
  /** A tinted square behind the icon, settings-style. */
  tint?: string;
  label: React.ReactNode;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  href?: string;
  download?: string | boolean;
  onClick?: () => void;
  chevron?: boolean;
  /** An element on the right instead of a value (a switch). */
  end?: React.ReactNode;
  lead?: React.ReactNode;
  className?: string;
  /** Read out instead of the visible text, when that is terse. */
  aria?: string;
}

export function Row({
  icon,
  tint,
  label,
  sub,
  value,
  href,
  download,
  onClick,
  chevron,
  end,
  lead,
  className,
  aria,
}: RowProps) {
  const external = !!href && /^https?:/.test(href);
  const body = (
    <>
      {lead}
      {icon && (
        <span
          className={s.rowIcon}
          style={tint ? ({ '--tint': tint } as React.CSSProperties) : undefined}
          data-tinted={tint ? true : undefined}
        >
          <Icon name={icon} size={tint ? 17 : 20} />
        </span>
      )}
      <span className={s.rowText}>
        <span className={s.rowLabel}>{label}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
      </span>
      {value !== undefined && <span className={s.rowValue}>{value}</span>}
      {end}
      {external && !chevron && <Icon name="external" size={15} className={s.rowExt} />}
      {chevron && <Icon name="chevronRight" size={15} className={s.chev} />}
    </>
  );
  return (
    <li className={cx(s.row, className)}>
      {href ? (
        <a
          className={s.rowHit}
          href={href}
          download={download}
          aria-label={aria}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {body}
        </a>
      ) : onClick ? (
        <button type="button" className={s.rowHit} onClick={onClick} aria-label={aria}>
          {body}
        </button>
      ) : (
        <div className={s.rowHit} data-static aria-label={aria}>
          {body}
        </div>
      )}
    </li>
  );
}

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={s.switch}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

/** A switch on a row: the whole row toggles it. */
export function ToggleRow({
  icon,
  tint,
  label,
  sub,
  on,
  onChange,
}: {
  icon?: UiIcon;
  tint?: string;
  label: string;
  sub?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <li className={s.row}>
      <div className={s.rowHit} data-static>
        {icon && (
          <span
            className={s.rowIcon}
            style={tint ? ({ '--tint': tint } as React.CSSProperties) : undefined}
            data-tinted={tint ? true : undefined}
          >
            <Icon name={icon} size={17} />
          </span>
        )}
        <span className={s.rowText}>
          <span className={s.rowLabel}>{label}</span>
          {sub && <span className={s.rowSub}>{sub}</span>}
        </span>
        <Switch on={on} onChange={onChange} label={label} />
      </div>
    </li>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const i = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  return (
    <div
      className={s.seg}
      role="radiogroup"
      aria-label={label}
      style={{ '--n': options.length, '--i': i } as React.CSSProperties}
    >
      <span className={s.segThumb} aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const next = options[(i + d + options.length) % options.length];
            onChange(next.id);
            const group = e.currentTarget.parentElement;
            requestAnimationFrame(() =>
              group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(),
            );
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  label,
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <label className={s.searchField}>
      <Icon name="search" size={17} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        enterKeyHint="search"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
      />
      {value && (
        <button
          type="button"
          className={s.searchClear}
          aria-label="Clear search"
          onClick={() => onChange('')}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </label>
  );
}

export function Chip({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={s.chip}
      style={tone ? ({ '--tone': tone } as React.CSSProperties) : undefined}
      data-toned={tone ? true : undefined}
    >
      {children}
    </span>
  );
}

/** A big pill button, filled or plain. */
export function Button({
  children,
  href,
  onClick,
  icon,
  plain,
  download,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  icon?: UiIcon;
  plain?: boolean;
  download?: string | boolean;
}) {
  const external = !!href && /^https?:/.test(href);
  const body = (
    <>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </>
  );
  return href ? (
    <a
      className={s.button}
      data-plain={plain || undefined}
      href={href}
      download={download}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {body}
    </a>
  ) : (
    <button type="button" className={s.button} data-plain={plain || undefined} onClick={onClick}>
      {body}
    </button>
  );
}

/** Copies text, falling back to a hidden textarea where the clipboard API is blocked. */
export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

/** Saves text as a file the visitor downloads. */
export function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Calendar colours, by calendar. */
export const CAL_TINT: Record<string, string> = {
  work: 'var(--c-blue)',
  study: 'var(--c-green)',
  awards: 'var(--c-orange)',
  papers: 'var(--c-purple)',
  oss: 'var(--c-pink)',
  builds: 'var(--c-gray)',
};
