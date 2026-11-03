'use client';

import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from './Icon';
import s from './commits.module.scss';

export interface PaletteItem {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  color?: string;
  run: () => void;
}

const LIMIT = 60;

/** A ⌘K palette over sections, branches, every commit and every link on the page. */
export default function Palette({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: PaletteItem[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = items
    .filter((item) =>
      terms.every((t) =>
        `${item.group} ${item.label} ${item.hint ?? ''}`.toLowerCase().includes(t),
      ),
    )
    .slice(0, LIMIT);
  const current = Math.min(active, results.length - 1);

  const close = () => {
    setQuery('');
    setActive(0);
    onClose();
  };

  const run = (item: PaletteItem) => {
    close();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next =
        (current + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length);
      setActive(next);
      document.getElementById(`pal-${results[next]?.key}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && results[current]) {
      e.preventDefault();
      run(results[current]);
    }
  };

  return (
    <dialog
      ref={dialog}
      className={s.palette}
      aria-label="Go to anything"
      onClose={close}
      onClick={(e) => e.target === dialog.current && close()}
    >
      {open && (
        <div className={s.palBox}>
          <div className={s.palInput}>
            <Icon name="search" />
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="pal-list"
              aria-activedescendant={results[current] ? `pal-${results[current].key}` : undefined}
              aria-autocomplete="list"
              placeholder="Jump to a section, branch, commit or link…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            <kbd>esc</kbd>
          </div>
          <ul id="pal-list" role="listbox" className={s.palList} aria-label="Results">
            {results.map((item, i) => (
              <li
                key={item.key}
                id={`pal-${item.key}`}
                role="option"
                aria-selected={i === current}
                onPointerMove={() => i !== current && setActive(i)}
                onClick={() => run(item)}
                style={item.color ? ({ '--c': item.color } as React.CSSProperties) : undefined}
              >
                <Icon name={item.icon} />
                <span className={s.palLabel}>{item.label}</span>
                {item.hint && <span className={s.palHint}>{item.hint}</span>}
                <span className={s.palGroup}>{item.group}</span>
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p className={s.palEmpty}>
              fatal: ambiguous argument &apos;{query}&apos;: unknown revision or path not in the
              working tree.
            </p>
          )}
          <p className={s.palFoot}>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> move
            </span>
            <span>
              <kbd>↵</kbd> open
            </span>
            <span>
              <kbd>j</kbd>
              <kbd>k</kbd> walk the log
            </span>
          </p>
        </div>
      )}
    </dialog>
  );
}
