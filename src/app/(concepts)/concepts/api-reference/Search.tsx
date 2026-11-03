'use client';

import { useEffect, useRef, useState } from 'react';
import { NOW, db, profile } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import {
  CONTRIBUTIONS,
  DEVICES,
  EDUCATION,
  ENDPOINTS,
  PLATFORMS,
  ROLES,
  VERSIONS,
  titleAt,
  type Method,
} from './model';
import { Icon, Verb, cx, jumpTo } from './parts';
import { closeSearch, openConsole, useConsole } from './store';
import s from './api.module.scss';

type Action =
  | { go: string }
  | { try: { method: Method; target: string } }
  | { href: string }
  | { copy: string }
  | { console: true };

interface Item {
  key: string;
  group: string;
  label: string;
  detail: string;
  method?: Method;
  action: Action;
  /** Shift+Enter, for endpoints: send it in the console. */
  alt?: Action;
}

export const GUIDES: [string, string][] = [
  ['introduction', 'Introduction'],
  ['versioning', 'Versioning & changelog'],
  ['webhooks', 'Webhooks'],
  ['errors', 'Errors'],
  ['pagination', 'Pagination'],
  ['rate-limits', 'Rate limits'],
];

/** A link as people read it: no scheme, no www, no slashes at the ends. */
const bare = (url: string) => url.replace(/^(https?:\/\/(www\.)?|\/)/, '').replace(/\/$/, '');

const ITEMS: Item[] = [
  ...ENDPOINTS.map((ep): Item => ({
    key: `ep-${ep.id}`,
    group: 'Endpoints',
    label: ep.title,
    detail: `${ep.method} ${ep.path}`,
    method: ep.method,
    action: { go: ep.id },
    alt: { try: { method: ep.method, target: ep.example } },
  })),
  ...GUIDES.map(([id, label]): Item => ({
    key: `g-${id}`,
    group: 'Guides',
    label,
    detail: `#${id}`,
    action: { go: id },
  })),
  ...ROLES.map((r): Item => ({
    key: `r-${r.id}`,
    group: 'Experience',
    label: `${titleAt(r, NOW)}, ${r.org}`,
    detail: `${r.startMonth} → ${r.endMonth ?? 'now'} · ${r.summary}`,
    action: { go: `role-${r.id}` },
  })),
  ...PLATFORMS.map((p): Item => ({
    key: `p-${p.id}`,
    group: 'Platforms',
    label: p.name,
    detail: p.stack.join(', '),
    action: { go: `platform-${p.id}` },
    alt: { try: { method: 'GET', target: `/v1/platforms/${p.id}` } },
  })),
  ...CONTRIBUTIONS.map((c): Item => ({
    key: `o-${c.id}`,
    group: 'Open source',
    label: c.repo,
    detail: c.change,
    action: { go: `oss-${c.id}` },
  })),
  ...DEVICES.map((d): Item => ({
    key: `d-${d.id}`,
    group: 'Hardware',
    label: d.name,
    detail: `${d.tag} · ${d.kind}`,
    action: { go: `device-${d.id}` },
  })),
  ...EDUCATION.map((e): Item => ({
    key: `e-${e.id}`,
    group: 'Education',
    label: e.title,
    detail: `${e.year} · ${e.detail}`,
    action: { go: `edu-${e.id}` },
  })),
  ...VERSIONS.map((v): Item => ({
    key: `v-${v.id}`,
    group: 'Changelog',
    label: `Api-Version ${v.id}`,
    detail: v.changes.map(([, t]) => t).join(' '),
    action: { go: `v-${v.id}` },
  })),
  {
    key: 'a-console',
    group: 'Actions',
    label: 'Open the console',
    detail: 'Send requests and watch them stream back',
    action: { console: true },
  },
  {
    key: 'a-email',
    group: 'Actions',
    label: `Email ${db.person.first}`,
    detail: profile.email,
    action: { href: `mailto:${profile.email}` },
  },
  {
    key: 'a-copy',
    group: 'Actions',
    label: 'Copy email address',
    detail: profile.email,
    action: { copy: profile.email },
  },
  {
    key: 'a-cv',
    group: 'Actions',
    label: 'Download the CV',
    detail: bare(profile.cv),
    action: { href: profile.cv },
  },
  {
    key: 'a-linkedin',
    group: 'Actions',
    label: 'LinkedIn',
    detail: bare(profile.linkedin),
    action: { href: profile.linkedin },
  },
  {
    key: 'a-github',
    group: 'Actions',
    label: 'GitHub',
    detail: bare(profile.github),
    action: { href: profile.github },
  },
];

const GROUPS = [...new Set(ITEMS.map((i) => i.group))];

/** 0 when the item doesn't match; higher is better. Every word of the query has to match. */
function score(item: Item, query: string) {
  const label = item.label.toLowerCase();
  const hay = `${label} ${item.detail.toLowerCase()} ${item.group.toLowerCase()}`;
  let total = 0;
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (label.startsWith(word)) total += 5;
    else if (label.split(/[^a-z0-9]+/).some((w) => w.startsWith(word))) total += 4;
    else if (label.includes(word)) total += 3;
    else if (hay.includes(word)) total += 1;
    else return 0;
  }
  return total;
}

function results(query: string) {
  if (!query.trim()) return ITEMS.filter((i) => ['Endpoints', 'Actions'].includes(i.group));
  const scored = ITEMS.map((item) => ({ item, score: score(item, query) })).filter(
    (r) => r.score > 0,
  );
  const best = new Map<string, number>();
  for (const r of scored) best.set(r.item.group, Math.max(best.get(r.item.group) ?? 0, r.score));
  return scored
    .sort(
      (a, b) =>
        (best.get(b.item.group) ?? 0) - (best.get(a.item.group) ?? 0) ||
        GROUPS.indexOf(a.item.group) - GROUPS.indexOf(b.item.group) ||
        b.score - a.score,
    )
    .slice(0, 24)
    .map((r) => r.item);
}

/** Bolds the first match of each query word. */
function Highlight({ text, query }: { text: string; query: string }) {
  const word = query.trim().split(/\s+/)[0]?.toLowerCase();
  const i = word ? text.toLowerCase().indexOf(word) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + word.length)}</mark>
      {text.slice(i + word.length)}
    </>
  );
}

function SearchBody({ reduced }: { reduced: boolean }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const found = results(query);
  const current = Math.min(active, Math.max(0, found.length - 1));

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, query]);

  const run = (item: Item, alt = false) => {
    const action = alt && item.alt ? item.alt : item.action;
    closeSearch();
    if ('go' in action) requestAnimationFrame(() => jumpTo(action.go, reduced));
    else if ('try' in action) openConsole({ ...action.try, send: true });
    else if ('console' in action) openConsole();
    else if ('copy' in action)
      void navigator.clipboard?.writeText(action.copy).catch(() => undefined);
    else if (action.href.startsWith('mailto:')) window.location.href = action.href;
    else window.open(action.href, '_blank', 'noopener,noreferrer');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + found.length) % Math.max(1, found.length));
    } else if (e.key === 'Enter' && found[current]) {
      e.preventDefault();
      run(found[current], e.shiftKey);
    }
  };

  return (
    <>
      <div className={s.searchBox}>
        <Icon.search />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search endpoints, roles, platforms…"
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={found[current] ? `search-${found[current].key}` : undefined}
          aria-label="Search the docs"
          spellCheck={false}
        />
        <kbd>esc</kbd>
      </div>
      <div
        id="search-results"
        className={s.searchList}
        role="listbox"
        ref={list}
        aria-label="Results"
      >
        {found.length === 0 && (
          <p className={s.searchEmpty}>
            No results for “{query}”. Try a stack, like “swift”, or a year.
          </p>
        )}
        {found.map((item, i) => {
          const heading = i === 0 || found[i - 1].group !== item.group ? item.group : null;
          return (
            <div key={item.key} role="presentation">
              {heading && (
                <p className={s.searchGroup} role="presentation">
                  {heading}
                </p>
              )}
              <div
                id={`search-${item.key}`}
                role="option"
                aria-selected={i === current}
                className={cx(s.searchItem, i === current && s.searchActive)}
                onMouseMove={() => setActive(i)}
                onClick={(e) => run(item, e.shiftKey)}
              >
                {item.method ? (
                  <Verb method={item.method} small />
                ) : (
                  <span className={s.searchDot} aria-hidden="true" />
                )}
                <span className={s.searchText}>
                  <b>
                    <Highlight text={item.label} query={query} />
                  </b>
                  <span>{item.detail}</span>
                </span>
                {item.alt && <span className={s.searchAlt}>⇧↵ try</span>}
              </div>
            </div>
          );
        })}
      </div>
      <footer className={s.searchFoot}>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> move
        </span>
        <span>
          <kbd>↵</kbd> open
        </span>
        <span>
          <kbd>⇧↵</kbd> send in console
        </span>
      </footer>
    </>
  );
}

export default function Search() {
  const c = useConsole();
  const reduced = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (c.searchOpen && !d.open) d.showModal();
    else if (!c.searchOpen && d.open) d.close();
  }, [c.searchOpen]);

  return (
    <dialog
      ref={dialog}
      className={s.search}
      aria-label="Search"
      onClose={closeSearch}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearch();
      }}
    >
      {c.searchOpen && <SearchBody key={c.search} reduced={reduced} />}
    </dialog>
  );
}
