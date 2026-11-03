'use client';

// Browser: a start page of favourites (every live product, profile and store listing) with an
// address bar at the bottom. Pages open in a real tab.
import { useState } from 'react';
import { db, liveLinks } from '../../_shared/data';
import { host } from '../content';
import { Icon } from '../icons';
import { type AppCtx } from '../ui';
import s from '../apps.module.scss';

interface Fav {
  title: string;
  url: string;
}

const uniq = (favs: Fav[]) => favs.filter((f, i) => favs.findIndex((g) => g.url === f.url) === i);

const SITES: Fav[] = uniq([
  { title: db.person.site, url: db.person.url },
  ...Object.values(db.products)
    .filter((p) => (p.links as db.ProjectLinks).external)
    .map((p) => ({ title: p.title, url: (p.links as db.ProjectLinks).external as string })),
  ...db.roleList.filter((r) => r.url).map((r) => ({ title: r.org, url: r.url as string })),
]);

const PROFILES: Fav[] = [
  { title: 'LinkedIn', url: db.person.linkedin },
  { title: 'GitHub', url: db.person.github },
  { title: db.papers.inverter.venue, url: db.papers.inverter.url },
];

const STORES: Fav[] = liveLinks.map((l) => ({ title: l.label, url: l.url }));

const TINTS = [
  '#2f7cf6',
  '#34c25a',
  '#f7962f',
  '#8f5cf0',
  '#f4473d',
  '#2fb8c9',
  '#e8508e',
  '#5b5ce2',
];
const tint = (s: string) =>
  TINTS[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];

/** What the address bar would open: a URL as typed, or nothing for plain words. */
function toUrl(text: string) {
  const t = text.trim();
  if (!t || /\s/.test(t) || !/\.[a-z]{2,}/i.test(t)) return null;
  try {
    return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).href;
  } catch {
    return null;
  }
}

export function Browser({ ctx }: { ctx: AppCtx }) {
  const [q, setQ] = useState('');
  const url = toUrl(q);
  const match = (f: Fav) =>
    !q.trim() || `${f.title} ${f.url}`.toLowerCase().includes(q.trim().toLowerCase());
  const sections: [string, Fav[]][] = [
    ['Favourites', SITES.filter(match)],
    ['Profiles', PROFILES.filter(match)],
    ['Store listings', STORES.filter(match)],
  ];

  return (
    <div className={s.browser}>
      <div className={s.browserScroll}>
        <h2 className={s.browserTitle}>Start Page</h2>
        {sections.map(([name, favs]) =>
          favs.length ? (
            <section key={name} className={s.favs}>
              <h3>{name}</h3>
              <ul>
                {favs.map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      <span
                        className={s.favTile}
                        style={{ background: tint(f.title) }}
                        aria-hidden="true"
                      >
                        {f.title
                          .replace(/[^A-Za-z0-9]/g, '')
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <span className={s.favName}>{f.title}</span>
                      <span className={s.favHost}>{host(f.url)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
        {sections.every(([, f]) => !f.length) && (
          <p className={s.empty}>
            {url ? `Press Go to open ${host(url)} in a new tab.` : `No favourites match “${q}”.`}
          </p>
        )}
      </div>
      <form
        className={s.address}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
          else ctx.toast('Type an address, like a .com');
        }}
      >
        <label>
          <Icon name={url ? 'globe' : 'search'} size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or enter address"
            aria-label="Address"
            enterKeyHint="go"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" disabled={!url}>
          Go
        </button>
      </form>
    </div>
  );
}
