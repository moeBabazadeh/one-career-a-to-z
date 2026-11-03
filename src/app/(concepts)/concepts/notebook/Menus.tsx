'use client';

// The menu bar: File, Edit, View, Run, Kernel, Help. It follows the WAI-ARIA menubar pattern:
// arrows move between menus and items, Enter or Space runs an item, Escape closes and returns
// focus. Menus open in a fixed layer, so a scrolling bar on a phone can't clip them.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import s from './notebook.module.scss';

export type MenuItem =
  { label: string; keys?: string; run: () => void; disabled?: boolean; checked?: boolean } | 'sep';
export interface Menu {
  label: string;
  items: MenuItem[];
}

export default function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<{
    index: number;
    left: number;
    top: number;
    focus: 'first' | 'last' | null;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !layer.current?.contains(t)) setOpen(null);
    };
    const close = () => setOpen(null);
    document.addEventListener('pointerdown', away);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => {
    if (!open?.focus) return;
    const items = [
      ...(layer.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ??
        []),
    ];
    (open.focus === 'first' ? items[0] : items[items.length - 1])?.focus();
  }, [open]);

  const show = (index: number, focus: 'first' | 'last' | null) => {
    const btn = triggers.current[index];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setOpen({ index, left: Math.min(r.left, window.innerWidth - 268), top: r.bottom + 2, focus });
  };

  const onBarKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = menus.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      triggers.current[j]?.focus();
      if (open) show(j, null);
    } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      show(i, 'first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      show(i, 'last');
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(null);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const items = [
      ...(layer.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ??
        []),
    ];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      items[(at + d + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? items[0] : items[items.length - 1])?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const j = (open.index + (e.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length;
      triggers.current[j]?.focus();
      show(j, 'first');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      triggers.current[open.index]?.focus();
      setOpen(null);
    } else if (e.key === 'Tab') {
      setOpen(null);
    }
  };

  const menu = open ? menus[open.index] : null;
  return (
    <>
      <div ref={root} className={s.menubar} role="menubar" aria-label="Notebook menu">
        {menus.map((m, i) => (
          <button
            key={m.label}
            ref={(el) => {
              triggers.current[i] = el;
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open?.index === i}
            className={s.menuTrigger}
            tabIndex={i === 0 ? 0 : -1}
            onClick={() => (open?.index === i ? setOpen(null) : show(i, null))}
            onPointerEnter={() => open && open.index !== i && show(i, null)}
            onKeyDown={(e) => onBarKey(e, i)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {menu && open && (
        <div
          ref={layer}
          className={s.menu}
          role="menu"
          aria-label={menu.label}
          style={{ left: open.left, top: open.top }}
          onKeyDown={onMenuKey}
        >
          {menu.items.map((it, k) =>
            it === 'sep' ? (
              <hr key={k} />
            ) : (
              <button
                key={it.label}
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                disabled={it.disabled}
                tabIndex={-1}
                onClick={() => {
                  setOpen(null);
                  it.run();
                }}
              >
                <span className={s.check} aria-hidden="true">
                  {it.checked ? '✓' : ''}
                </span>
                <span>{it.label}</span>
                {it.keys && <kbd>{it.keys}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
