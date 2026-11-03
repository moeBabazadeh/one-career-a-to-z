'use client';

// System search: one index over every app's content (apps, the contact card, notes, events,
// pull requests, devices, projects and files), ranked by where the words match. Arrow keys move
// through the hits and Enter opens one.
import { useEffect, useRef, useState } from 'react';
import { AppIcon } from './AppIcon';
import { APPS, search, type Hit } from './content';
import { Icon } from './icons';
import type { Clock } from './ui';
import s from './phone.module.scss';

const SUGGESTED = [
  'contacts',
  'calendar',
  'notes',
  'code',
  'files',
  'projects',
  'hardware',
  'settings',
];

interface Props {
  open: boolean;
  clock: Clock | null;
  go: (hit: Hit) => void;
  launch: (app: string) => void;
  close: () => void;
}

export function Search({ open, clock, go, launch, close }: Props) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = search(q);
  const groups = [...new Set(hits.map((h) => h.app))];
  const flat = groups.flatMap((g) => hits.filter((h) => h.app === g));

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <div className={s.searchSheet}>
      <div className={s.searchTop}>
        <label className={s.searchBox}>
          <Icon name="search" size={17} />
          <input
            ref={input}
            type="search"
            value={q}
            placeholder="Search"
            aria-label="Search the phone"
            aria-controls="phone-search-results"
            aria-activedescendant={flat[sel] ? `hit-${flat[sel].id}` : undefined}
            enterKeyHint="go"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const d = e.key === 'ArrowDown' ? 1 : -1;
                setSel((i) => Math.max(0, Math.min(flat.length - 1, i + d)));
              } else if (e.key === 'Enter' && flat[sel]) {
                e.preventDefault();
                go(flat[sel]);
              }
            }}
          />
          {q && (
            <button
              type="button"
              className={s.searchClear}
              aria-label="Clear"
              onClick={() => setQ('')}
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </label>
        <button type="button" className={s.searchCancel} onClick={close}>
          Cancel
        </button>
      </div>

      <div className={s.searchBody} id="phone-search-results" role="listbox" aria-label="Results">
        {!q.trim() ? (
          <>
            <h3 className={s.searchHead}>Suggestions</h3>
            <ul className={s.suggest}>
              {SUGGESTED.map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => launch(id)}>
                    <AppIcon app={APPS[id]} clock={clock} size={54} />
                    <span>{APPS[id].name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className={s.searchHint}>Try a company, a year, a chip or a skill.</p>
          </>
        ) : hits.length ? (
          groups.map((g) => (
            <section key={g} className={s.hitGroup}>
              <h3 className={s.searchHead}>{APPS[g].name}</h3>
              <ul>
                {hits
                  .filter((h) => h.app === g)
                  .map((h) => {
                    const i = flat.indexOf(h);
                    return (
                      <li key={h.id} id={`hit-${h.id}`} role="option" aria-selected={i === sel}>
                        <button
                          type="button"
                          onClick={() => go(h)}
                          onMouseEnter={() => setSel(i)}
                          tabIndex={-1}
                        >
                          <AppIcon app={APPS[h.app]} clock={clock} size={30} />
                          <span>
                            <strong>{h.title}</strong>
                            <small>{h.sub}</small>
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))
        ) : (
          <p className={s.searchHint}>No results for “{q}”.</p>
        )}
      </div>
    </div>
  );
}
