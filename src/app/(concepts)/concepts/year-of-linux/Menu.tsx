import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';
import s from './desktop.module.scss';

// GTK menus and menu bars, with GTK's keyboard model: arrows move, Right opens a submenu,
// Left closes it, Escape backs out, and a letter jumps to the item that starts with it.

export type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      icon?: IconName;
      hint?: string;
      checked?: boolean;
      disabled?: boolean;
      href?: string;
      onSelect?: () => void;
      sub?: MenuItem[];
    };

type Entry = Exclude<MenuItem, { separator: true }>;

interface MenuProps {
  items: MenuItem[];
  label: string;
  onClose: (refocus: boolean) => void;
  /** Called with -1 or 1 when Left or Right has nothing to open or close here. */
  onSide?: (dir: -1 | 1) => void;
  className?: string;
  /** Focus the first item on mount (opened from the keyboard). */
  autoFocus?: boolean;
}

export function Menu({ items, label, onClose, onSide, className, autoFocus = true }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<number | null>(null);
  const [subFocus, setSubFocus] = useState(false);

  useEffect(() => {
    if (autoFocus)
      ref.current?.querySelector<HTMLElement>('[data-item]:not([aria-disabled="true"])')?.focus();
  }, [autoFocus]);

  // A menu that would run off the screen moves up or opens to the other side.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const floor = innerHeight - 4;
    if (r.bottom > floor)
      el.style.top = `${el.offsetTop - Math.min(r.bottom - floor, r.top - 4)}px`;
    if (r.right > innerWidth - 4) {
      if (el.classList.contains(s.submenu)) {
        el.style.left = 'auto';
        el.style.right = 'calc(100% - 2px)';
      } else el.style.left = `${el.offsetLeft - (r.right - innerWidth + 4)}px`;
    }
  }, []);

  const entries = () => [
    ...(ref.current?.querySelectorAll<HTMLElement>(':scope > div > [data-item]') ?? []),
  ];
  const itemAt = (i: number) =>
    ref.current?.querySelector<HTMLElement>(`:scope > div > [data-item="${i}"]`);

  const move = (from: HTMLElement, step: number | 'first' | 'last') => {
    const list = entries().filter((el) => el.getAttribute('aria-disabled') !== 'true');
    if (!list.length) return;
    const at = list.indexOf(from);
    const next =
      step === 'first'
        ? 0
        : step === 'last'
          ? list.length - 1
          : (at + step + list.length) % list.length;
    list[next].focus();
  };

  const activate = (item: Entry, i: number, viaKey: boolean) => {
    if (item.disabled) return;
    if (item.sub) {
      setSub(i);
      setSubFocus(viaKey);
      return;
    }
    item.onSelect?.();
    onClose(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>, item: Entry, i: number) => {
    const el = e.currentTarget;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(el, 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(el, -1);
        break;
      case 'Home':
        e.preventDefault();
        move(el, 'first');
        break;
      case 'End':
        e.preventDefault();
        move(el, 'last');
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (item.sub) activate(item, i, true);
        else onSide?.(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onSide?.(-1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose(true);
        break;
      case 'Tab':
        onClose(false);
        break;
      case 'Enter':
      case ' ':
        if (item.href) return;
        e.preventDefault();
        activate(item, i, true);
        break;
      default:
        if (/^[a-z0-9]$/i.test(e.key))
          entries()
            .find((n) => n.dataset.key === e.key.toLowerCase())
            ?.focus();
    }
  };

  return (
    <div ref={ref} role="menu" aria-label={label} className={`${s.menu} ${className ?? ''}`}>
      {items.map((item, i) => {
        if (item.separator) return <hr key={`sep${i}`} className={s.menuSep} />;
        const common = {
          role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox',
          'aria-checked': item.checked,
          'data-item': i,
          tabIndex: -1,
          'data-key': item.label[0].toLowerCase(),
          'aria-disabled': item.disabled || undefined,
          'aria-haspopup': item.sub ? ('menu' as const) : undefined,
          'aria-expanded': item.sub ? sub === i : undefined,
          className: `${s.menuItem} ${sub === i ? s.menuItemOpen : ''}`,
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
            setSub(item.sub ? i : null);
            setSubFocus(false);
            if (!item.disabled) e.currentTarget.focus({ preventScroll: true });
          },
          onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => onKeyDown(e, item, i),
        };
        const body = (
          <>
            {item.checked !== undefined ? (
              <span className={s.menuCheck}>{item.checked ? '✔' : ''}</span>
            ) : (
              <span className={s.menuIcon}>{item.icon && <Icon name={item.icon} size={16} />}</span>
            )}
            <span className={s.menuLabel}>{item.label}</span>
            {item.hint && <span className={s.menuHint}>{item.hint}</span>}
            {item.sub && (
              <span className={s.menuArrow} aria-hidden="true">
                ▸
              </span>
            )}
          </>
        );
        return (
          <div key={`${item.label}${i}`} className={s.menuSlot}>
            {item.href ? (
              <a
                {...common}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => onClose(false)}
              >
                {body}
              </a>
            ) : (
              <button {...common} type="button" onClick={() => activate(item, i, false)}>
                {body}
              </button>
            )}
            {item.sub && sub === i && (
              <Menu
                items={item.sub}
                label={item.label}
                className={s.submenu}
                autoFocus={subFocus}
                onClose={(refocus) => {
                  setSub(null);
                  if (refocus) itemAt(i)?.focus();
                  else onClose(false);
                }}
                onSide={(dir) => {
                  if (dir === -1) {
                    setSub(null);
                    itemAt(i)?.focus();
                  } else onSide?.(1);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface BarMenu {
  label: string;
  icon?: IconName;
  /** Show only the icon (the label stays for screen readers). */
  iconOnly?: boolean;
  items: MenuItem[];
}

/** A menu bar: a window's File, Edit, View, or the panel's Applications, Places, System. */
export function Menubar({
  menus,
  className,
  label = 'Menu bar',
}: {
  menus: BarMenu[];
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [viaKey, setViaKey] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const button = (i: number) =>
    bar.current?.querySelectorAll<HTMLButtonElement>(`:scope > div > .${s.menubarBtn}`)[i];

  return (
    <div ref={bar} className={`${s.menubar} ${className ?? ''}`} role="menubar" aria-label={label}>
      {menus.map((m, i) => (
        <div key={m.label} className={s.menubarSlot}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            aria-label={m.iconOnly ? m.label : undefined}
            data-menu={m.label}
            className={`${s.menubarBtn} ${open === i ? s.menubarOpen : ''}`}
            onClick={(e) => {
              setViaKey(e.detail === 0);
              setOpen(open === i ? null : i);
            }}
            onMouseEnter={() => open !== null && setOpen(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setViaKey(true);
                setOpen(i);
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                button(
                  (i + (e.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length,
                )?.focus();
              }
            }}
          >
            {m.icon && <Icon name={m.icon} size={m.iconOnly ? 20 : 18} />}
            {!m.iconOnly && <span>{m.label}</span>}
          </button>
          {open === i && (
            <Menu
              key={i}
              items={m.items}
              label={m.label}
              className={s.dropdown}
              autoFocus={viaKey}
              onClose={(refocus) => {
                setOpen(null);
                if (refocus) button(i)?.focus();
              }}
              onSide={(dir) => {
                const next = (i + dir + menus.length) % menus.length;
                setViaKey(true);
                setOpen(next);
                button(next)?.focus();
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
