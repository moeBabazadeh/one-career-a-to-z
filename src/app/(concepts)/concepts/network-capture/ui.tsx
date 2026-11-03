'use client';

// Shared pieces: class names, icons, the popup menu every menu and context menu uses, and the
// dialog shell. Menus follow the WAI-ARIA menu pattern: arrows move, → opens a submenu, ← and
// Esc close, and ← → at the top level move along the menu bar.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import s from './capture.module.scss';

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ icons */

const PATHS: Record<string, ReactNode> = {
  start: <circle cx="8" cy="8" r="5" />,
  stop: <rect x="3.5" y="3.5" width="9" height="9" rx="1" />,
  restart: (
    <path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2M12.5 2.8v2.4h-2.4" fill="none" strokeWidth="1.6" />
  ),
  find: <path d="M7 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm3 7 3.2 3.2" fill="none" strokeWidth="1.6" />,
  up: <path d="M8 3.5 3.5 9h9z" />,
  down: <path d="M8 12.5 3.5 7h9z" />,
  first: <path d="M4 3.5h8M8 6l-4 5h8z" fill="none" strokeWidth="1.5" />,
  last: <path d="M4 12.5h8M8 10 4 5h8z" fill="none" strokeWidth="1.5" />,
  scroll: <path d="M8 2.5v9M4.5 8.5 8 12l3.5-3.5M3.5 14h9" fill="none" strokeWidth="1.5" />,
  color: <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />,
  expand: <path d="M3 5.5h10M3 10.5h10M8 2.5v3M8 10.5v3" fill="none" strokeWidth="1.5" />,
  collapse: <path d="M3 8h10" fill="none" strokeWidth="1.8" />,
  follow: (
    <path
      d="M2.5 5h8M8 2.5 10.5 5 8 7.5M13.5 11h-8M8 8.5 5.5 11 8 13.5"
      fill="none"
      strokeWidth="1.5"
    />
  ),
  stats: <path d="M3 13V8M6.5 13V4M10 13V6.5M13.5 13V2.5" fill="none" strokeWidth="1.8" />,
  page: (
    <path d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4" fill="none" strokeWidth="1.3" />
  ),
  bookmark: <path d="M4.5 2.5h7v11L8 10.5l-3.5 3z" fill="none" strokeWidth="1.4" />,
  clear: <path d="M4.5 4.5l7 7m0-7-7 7" fill="none" strokeWidth="1.6" />,
  apply: <path d="M3 8h9M9 4.5 12.5 8 9 11.5" fill="none" strokeWidth="1.6" />,
  caret: <path d="M4 6l4 4 4-4" fill="none" strokeWidth="1.6" />,
  plus: <path d="M8 3.5v9M3.5 8h9" fill="none" strokeWidth="1.6" />,
  menu: <path d="M3 4.5h10M3 8h10M3 11.5h10" fill="none" strokeWidth="1.6" />,
  close: <path d="M4 4l8 8m0-8-8 8" fill="none" strokeWidth="1.6" />,
  goto: <path d="M3 8h7M7.5 5 10.5 8 7.5 11M12.5 3.5v9" fill="none" strokeWidth="1.5" />,
  link: <path d="M9 3.5h3.5V7M12.5 3.5 7 9M11 9.5v3H3.5V5h3" fill="none" strokeWidth="1.4" />,
};

export function Icon({
  name,
  className,
}: {
  name: keyof typeof PATHS | string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className={cx(s.icon, className)}
      fill="currentColor"
      stroke="currentColor"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ menus */

export interface MenuItem {
  label?: string;
  key?: string;
  act?: () => void;
  href?: string;
  disabled?: boolean;
  checked?: boolean;
  sub?: MenuItem[];
  sep?: boolean;
}

interface PopupProps {
  items: MenuItem[];
  x: number;
  y: number;
  label: string;
  onClose: (refocus?: boolean) => void;
  /** At the top level of a menu bar: move to the previous or next menu. */
  onSide?: (dir: -1 | 1) => void;
  /** For a submenu: ← closes only this level. */
  onBack?: () => void;
}

export function Popup({ items, x, y, label, onClose, onSide, onBack }: PopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ i: number; x: number; y: number } | null>(null);

  // Keep the menu on screen, then focus its first item.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [x, y]);

  useEffect(() => {
    if (onBack) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-popup]')) onClose(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [onClose, onBack]);

  const focusables = () =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        ':scope > [role^="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
  const openSub = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setOpen({ i, x: r.right - 2, y: r.top - 4 });
  };
  const run = (item: MenuItem, el: HTMLElement, index: number) => {
    if (item.disabled) return;
    if (item.sub) return openSub(index, el);
    onClose(true);
    item.act?.();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const list = focusables();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
      next?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? list[0] : list[list.length - 1])?.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const el = list[at];
      const index = Number(el?.dataset.index);
      if (el && items[index]?.sub) openSub(index, el);
      else onSide?.(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (onBack) onBack();
      else onSide?.(-1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (onBack) onBack();
      else onClose(true);
    } else if (e.key === 'Tab') {
      onClose(false);
    }
  };

  return (
    <div
      ref={ref}
      className={s.popup}
      role="menu"
      aria-label={label}
      data-popup
      onKeyDown={onKey}
      style={{ left: x, top: y }}
    >
      {items.map((item, i) =>
        item.sep ? (
          <div key={i} role="separator" className={s.popupSep} />
        ) : item.href ? (
          <a
            key={i}
            role="menuitem"
            tabIndex={-1}
            data-index={i}
            href={item.href}
            target={item.href.startsWith('http') ? '_blank' : undefined}
            rel="noreferrer"
            className={s.popupItem}
            onClick={() => onClose(false)}
          >
            <span className={s.popupCheck} />
            <span className={s.popupLabel}>{item.label}</span>
            <span className={s.popupKey}>↗</span>
          </a>
        ) : (
          <button
            key={i}
            type="button"
            role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={item.checked}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={item.sub ? 'menu' : undefined}
            aria-expanded={item.sub ? open?.i === i : undefined}
            tabIndex={-1}
            data-index={i}
            className={cx(s.popupItem, item.disabled && s.popupDisabled)}
            onClick={(e) => run(item, e.currentTarget, i)}
            onPointerEnter={(e) => (item.sub ? openSub(i, e.currentTarget) : open && setOpen(null))}
          >
            <span className={s.popupCheck}>{item.checked ? '✓' : ''}</span>
            <span className={s.popupLabel}>{item.label}</span>
            <span className={s.popupKey}>{item.sub ? '▸' : item.key}</span>
          </button>
        ),
      )}
      {open && items[open.i]?.sub && (
        <Popup
          items={items[open.i].sub as MenuItem[]}
          x={open.x}
          y={open.y}
          label={items[open.i].label ?? ''}
          onClose={onClose}
          onBack={() => {
            const i = open.i;
            setOpen(null);
            ref.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ dialogs */

export function Dialog({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  className,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    (
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector<HTMLElement>('button, [href], input, select, [tabindex="0"]')
    )?.focus();
    return () => before?.focus?.();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
    if (e.key === 'Tab' && ref.current) {
      const list = Array.from(
        ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex="0"]',
        ),
      );
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={cx(s.dialog, s[`dialog_${size}`], className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKey}
      >
        <div className={s.dialogHead}>
          <h2 id={titleId} className={s.dialogTitle}>
            {title}
          </h2>
          <button type="button" className={s.dialogClose} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className={s.dialogBody}>{children}</div>
        {footer && <div className={s.dialogFoot}>{footer}</div>}
      </div>
    </div>
  );
}
