'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { db, fmt, profile } from '../_shared/data';
import { writeScheme } from '../_shared/scheme';
import {
  EVENTS,
  LISTINGS,
  PAGES,
  REGIONS,
  RESOURCES,
  SERVICES,
  STATUS,
  eventTime,
} from './inventory';
import { iconOf } from './labels';
import { Modal } from './Panels';
import { runInShell } from './Shell';
import { Icon, cx, type IconName } from './ui';
import { closePanel, getUi, go, openPanel, setUi, toast, toggleShell, useUi } from './store';
import s from './console.module.scss';

type Group =
  'Services' | 'Resources' | 'Roles' | 'Pages' | 'Regions' | 'Marketplace' | 'Events' | 'Actions';

interface Hit {
  id: string;
  group: Group;
  title: string;
  sub: string;
  icon: IconName;
  text: string;
  path?: string;
  run?: () => void;
}

const INDEX: Hit[] = [
  ...SERVICES.map((sv) => ({
    id: `svc-${sv.id}`,
    group: 'Services' as const,
    title: sv.name,
    sub: sv.maps,
    icon: iconOf(sv.id),
    text: `${sv.name} ${sv.id} ${sv.maps} ${sv.blurb}`,
    path: sv.id,
  })),
  ...RESOURCES.filter((r) => r.service !== 'iam').map((r) => ({
    id: `res-${r.service}-${r.id}`,
    group: 'Resources' as const,
    title: r.name,
    sub: `${r.kind} · ${STATUS[r.status].label}${r.created !== '—' ? ` · ${r.created}` : ''}`,
    icon: iconOf(r.service),
    text: `${r.name} ${r.id} ${r.kind} ${r.summary} ${r.tech.join(' ')} ${r.tags.map((t) => t[1]).join(' ')} ${r.crn}`,
    path: r.href,
  })),
  ...db.roleList.map((r) => ({
    id: `role-${r.id}`,
    group: 'Roles' as const,
    title: r.id,
    sub: `${db.titlePath(r)}, ${r.org} · ${fmt.yearSpan(r.from, r.to, '–')}`,
    icon: 'iam' as const,
    text: `${r.id} ${r.org} ${db.titlePath(r)} ${r.summary} ${r.duties.join(' ')}`,
    path: `iam/roles/${r.id}`,
  })),
  ...PAGES.filter((p) => !SERVICES.some((sv) => sv.id === p.path)).map((p) => ({
    id: `page-${p.path}`,
    group: 'Pages' as const,
    title: p.title,
    sub: p.section,
    icon: iconOf(p.path.split('/')[0]),
    text: `${p.title} ${p.section} ${p.keywords ?? ''}`,
    path: p.path,
  })),
  ...REGIONS.map((r) => ({
    id: `region-${r.id}`,
    group: 'Regions' as const,
    title: `Switch to ${r.name}`,
    sub: `${r.id} · ${r.products.map((p) => db.products[p].title).join(', ')}`,
    icon: 'globe' as const,
    text: `${r.name} ${r.id} region country`,
    run: () => {
      setUi({ region: r.id });
      toast(`Region set to ${r.name}`);
    },
  })),
  ...LISTINGS.map((l) => ({
    id: `oss-${l.id}`,
    group: 'Marketplace' as const,
    title: l.repo,
    sub: `#${l.pr} · ${l.kind} · ${l.year}`,
    icon: 'code' as const,
    text: `${l.repo} ${l.change} ${l.impact} ${l.kind} open source pull request`,
    path: 'marketplace',
  })),
  ...EVENTS.filter((e) => e.name !== 'PutObject').map((e) => ({
    id: `ev-${e.id}`,
    group: 'Events' as const,
    title: e.summary,
    sub: `${e.name} · ${eventTime(e)}`,
    icon: 'events' as const,
    text: `${e.name} ${e.summary} ${e.resource}`,
    path: 'events',
  })),
  {
    id: 'a-shell',
    group: 'Actions',
    title: 'Open CloudShell',
    sub: 'Shortcut `',
    icon: 'terminal',
    text: 'cloudshell terminal cli shell console command',
    run: () => toggleShell(true),
  },
  {
    id: 'a-contact',
    group: 'Actions',
    title: 'Contact support',
    sub: `Write to ${profile.name}`,
    icon: 'mail',
    text: 'contact email support hire message',
    run: () => openPanel('support'),
  },
  {
    id: 'a-cv',
    group: 'Actions',
    title: 'Download CV',
    sub: 'PDF',
    icon: 'download',
    text: 'cv resume pdf download',
    run: () => window.open(profile.cv, '_blank'),
  },
  {
    id: 'a-whoami',
    group: 'Actions',
    title: 'Who am I?',
    sub: 'cloud whoami',
    icon: 'user',
    text: 'whoami profile who is he',
    run: () => runInShell('cloud whoami'),
  },
  {
    id: 'a-dark',
    group: 'Actions',
    title: 'Dark mode',
    sub: 'Visual mode',
    icon: 'moon',
    text: 'dark mode theme appearance',
    run: () => writeScheme('dark'),
  },
  {
    id: 'a-light',
    group: 'Actions',
    title: 'Light mode',
    sub: 'Visual mode',
    icon: 'sun',
    text: 'light mode theme appearance',
    run: () => writeScheme('light'),
  },
  {
    id: 'a-system',
    group: 'Actions',
    title: 'Match system appearance',
    sub: 'Visual mode',
    icon: 'monitor',
    text: 'system mode theme appearance auto',
    run: () => writeScheme(null),
  },
  {
    id: 'a-keys',
    group: 'Actions',
    title: 'Keyboard shortcuts',
    sub: '?',
    icon: 'keyboard',
    text: 'keyboard shortcuts keys help',
    run: () => openPanel('shortcuts'),
  },
];

const ORDER: Group[] = [
  'Services',
  'Resources',
  'Roles',
  'Pages',
  'Actions',
  'Regions',
  'Marketplace',
  'Events',
];
const SUGGESTED = [
  'svc-iam',
  'svc-iot',
  'svc-compute',
  'page-billing',
  'page-events',
  'page-marketplace',
  'a-shell',
  'a-contact',
];

function find(q: string): Hit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length)
    return SUGGESTED.map((id) => INDEX.find((h) => h.id === id)).filter((h): h is Hit =>
      Boolean(h),
    );
  const scored = INDEX.map((h) => {
    const text = `${h.title} ${h.text}`.toLowerCase();
    if (!terms.every((t) => text.includes(t))) return null;
    const title = h.title.toLowerCase();
    const score =
      (title.startsWith(terms[0]) ? 100 : title.includes(terms[0]) ? 60 : 10) -
      ORDER.indexOf(h.group);
    return { h, score };
  }).filter((x): x is { h: Hit; score: number } => x !== null);
  const groups = new Map<Group, { h: Hit; score: number }[]>();
  for (const x of scored.sort((a, b) => b.score - a.score)) {
    const list = groups.get(x.h.group) ?? [];
    if (list.length < 5) list.push(x);
    groups.set(x.h.group, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1][0].score - a[1][0].score)
    .flatMap(([, list]) => list.map((x) => x.h));
}

function Palette() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const hits = useMemo(() => find(q), [q]);
  const at = Math.min(active, Math.max(0, hits.length - 1));

  const choose = (h: Hit | undefined) => {
    if (!h) return;
    closePanel('search');
    if (h.path !== undefined) go(h.path);
    h.run?.();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = (at + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(1, hits.length);
      setActive(n);
      document.getElementById(`hit-${n}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(hits[at]);
    }
  };

  const heads = hits.map((h, i) =>
    q && (i === 0 || hits[i - 1].group !== h.group) ? h.group : null,
  );
  return (
    <div className={s.palette}>
      <div className={s.paletteInput}>
        <Icon name="search" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder="Search resources, services, roles and actions"
          role="combobox"
          aria-expanded
          aria-controls="search-hits"
          aria-activedescendant={hits.length ? `hit-${at}` : undefined}
          aria-label="Search"
          spellCheck={false}
        />
        <kbd>Esc</kbd>
      </div>
      <ul id="search-hits" className={s.hits} role="listbox" aria-label="Results">
        {!q && <li className={s.hitGroup}>Suggested</li>}
        {hits.map((h, i) => {
          const head = heads[i];
          return (
            <li key={h.id} role="presentation">
              {head && <span className={s.hitGroup}>{head}</span>}
              <div
                id={`hit-${i}`}
                role="option"
                aria-selected={i === at}
                className={cx(s.hit, i === at && s.hitActive)}
                onPointerMove={() => i !== at && setActive(i)}
                onClick={() => choose(h)}
              >
                <span className={s.hitIcon}>
                  <Icon name={h.icon} size={16} />
                </span>
                <span className={s.hitText}>
                  <b>{h.title}</b>
                  <small>{h.sub}</small>
                </span>
                {i === at && <Icon name="right" size={14} className={s.hitGo} />}
              </div>
            </li>
          );
        })}
        {!hits.length && (
          <li className={s.noHits}>
            No results for “{q}”. Try a product, a chip, a company or a year, or run{' '}
            <code>cloud resources list</code> in CloudShell.
          </li>
        )}
      </ul>
      <footer className={s.paletteFoot}>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> move
        </span>
        <span>
          <kbd>↵</kbd> open
        </span>
        <span>{INDEX.length} items indexed</span>
      </footer>
    </div>
  );
}

export function Search() {
  const ui = useUi();
  return (
    <Modal
      open={ui.search}
      onClose={() => getUi().search && closePanel('search')}
      label="Search"
      className={s.searchModal}
    >
      <Palette />
    </Modal>
  );
}
