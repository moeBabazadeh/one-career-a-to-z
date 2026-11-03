import Image from 'next/image';
import { useState } from 'react';
import { db, featuredProjects, profile } from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { PRODUCTS } from './fs';
import { Icon } from './icons';
import { Menubar } from './Menu';
import s from './desktop.module.scss';

// A 2008 web browser, unbranded. Its home page lists what Moe shipped; each product gets a page
// with its screenshot and links out to the real thing.

type Product = (typeof PRODUCTS)[number];
const HOME = 'about:shipped';
const slug = (p: Product) =>
  p.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const bySlug = new Map(PRODUCTS.map((p) => [slug(p), p]));
const shot = (p: Product) => featuredProjects.find((f) => f.title === p.title)?.image;
const url = (page: string) => {
  if (page === HOME) return HOME;
  const p = bySlug.get(page);
  return p?.links.external ?? `about:shipped/${page}`;
};
const pageTitle = (page: string) => (page === HOME ? 'Shipped' : (bySlug.get(page)?.title ?? page));

interface Tab {
  id: number;
  stack: string[];
  at: number;
}

function Home({ go, query }: { go: (page: string, newTab: boolean) => void; query: string }) {
  const q = query.trim().toLowerCase();
  const list = PRODUCTS.filter(
    (p) => !q || `${p.title} ${p.description} ${p.tech.join(' ')}`.toLowerCase().includes(q),
  );
  return (
    <div className={s.web}>
      <header className={s.webHero}>
        <h3>Shipped</h3>
        <p>
          {db.productsLive.long} products live, {db.storeApps.length} on both app stores.{' '}
          {profile.name}, {profile.role}, {profile.company}.
        </p>
      </header>
      {q && (
        <p
          className={s.webNote}
        >{`${list.length} result${list.length === 1 ? '' : 's'} for “${query}”`}</p>
      )}
      <ul className={s.webGrid}>
        {list.map((p) => {
          const img = shot(p);
          return (
            <li key={p.title} className={img ? s.webCardBig : s.webCard}>
              <a
                href={`#${slug(p)}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(slug(p), e.ctrlKey || e.metaKey);
                }}
              >
                {img && (
                  <Image
                    src={img}
                    width={1280}
                    height={800}
                    alt=""
                    sizes="(max-width: 700px) 90vw, 320px"
                  />
                )}
                <b>{p.title}</b>
                <span>{p.tech.slice(0, 4).join(' · ')}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Page({ p, go }: { p: Product; go: (page: string, newTab: boolean) => void }) {
  const img = shot(p);
  const links = projectLinks(p.links);
  return (
    <article className={s.web}>
      <p className={s.webCrumb}>
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            go(HOME, false);
          }}
        >
          Shipped
        </a>{' '}
        › {p.title}
      </p>
      <h3 className={s.webTitle}>{p.title}</h3>
      {img && (
        <div className={s.webShot}>
          <Image
            src={img}
            width={1280}
            height={800}
            alt={`${p.title} screenshot`}
            sizes="(max-width: 700px) 92vw, 640px"
          />
        </div>
      )}
      <p className={s.webText}>{p.description}</p>
      <ul className={s.chips} aria-label="Built with">
        {p.tech.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {links.length ? (
        <p className={s.webLinks}>
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={s.btn}>
              {l.kind === 'store' ? (
                <Icon name="phone" size={16} />
              ) : l.kind === 'code' ? (
                <Icon name="code" size={16} />
              ) : (
                <Icon name="browser" size={16} />
              )}
              {l.label} ↗
            </a>
          ))}
        </p>
      ) : (
        <p className={s.webNote}>
          No public page: this one is hardware in the field or a private build.
        </p>
      )}
    </article>
  );
}

export default function Browser({
  onMail,
  onTitle,
}: {
  onMail: () => void;
  onTitle: (title: string) => void;
}) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 0, stack: [HOME], at: 0 }]);
  const [active, setActive] = useState(0);
  const [nextId, setNextId] = useState(1);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState('');
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const page = tab.stack[tab.at];

  // Every change of tab or page goes through here, so the window's title follows the page.
  const commit = (next: Tab[], on: number) => {
    setTabs(next);
    setActive(on);
    const t = next.find((x) => x.id === on) ?? next[0];
    onTitle(pageTitle(t.stack[t.at]));
  };
  const update = (t: Tab) =>
    commit(
      tabs.map((x) => (x.id === t.id ? t : x)),
      active,
    );
  const go = (next: string, newTab: boolean) => {
    if (newTab) {
      setNextId(nextId + 1);
      return commit([...tabs, { id: nextId, stack: [next], at: 0 }], nextId);
    }
    if (next === page) return;
    update({ ...tab, stack: [...tab.stack.slice(0, tab.at + 1), next], at: tab.at + 1 });
  };
  const closeTab = (id: number) => {
    if (tabs.length === 1) return update({ ...tab, stack: [HOME], at: 0 });
    const i = tabs.findIndex((t) => t.id === id);
    const rest = tabs.filter((t) => t.id !== id);
    commit(rest, id === active ? rest[Math.max(0, i - 1)].id : active);
  };
  const product = bySlug.get(page);
  const featured = featuredProjects
    .map((f) => PRODUCTS.find((p) => p.title === f.title)!)
    .filter(Boolean);

  return (
    <div className={s.app}>
      <Menubar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'New Tab', hint: 'Ctrl+T', onSelect: () => go(HOME, true) },
              { label: 'Close Tab', onSelect: () => closeTab(tab.id) },
              { separator: true },
              { label: 'Send Link…', icon: 'mail', onSelect: onMail },
            ],
          },
          {
            label: 'History',
            items: tab.stack.map((p, i) => ({
              label: pageTitle(p),
              checked: i === tab.at,
              onSelect: () => update({ ...tab, at: i }),
            })),
          },
          {
            label: 'Bookmarks',
            items: PRODUCTS.map((p) => ({
              label: p.title,
              icon: 'link' as const,
              onSelect: () => go(slug(p), false),
            })),
          },
        ]}
      />
      <div className={s.navbar} role="toolbar" aria-label="Navigation">
        <button
          type="button"
          className={s.navBtn}
          aria-label="Back"
          disabled={tab.at === 0}
          onClick={() => update({ ...tab, at: tab.at - 1 })}
        >
          <Icon name="back" size={22} />
        </button>
        <button
          type="button"
          className={s.navBtn}
          aria-label="Forward"
          disabled={tab.at >= tab.stack.length - 1}
          onClick={() => update({ ...tab, at: tab.at + 1 })}
        >
          <Icon name="forward" size={22} />
        </button>
        <button
          type="button"
          className={s.navBtn}
          aria-label="Reload"
          onClick={() => update({ ...tab })}
        >
          <Icon name="reload" size={22} />
        </button>
        <button
          type="button"
          className={s.navBtn}
          aria-label="Home"
          onClick={() => go(HOME, false)}
        >
          <Icon name="home" size={22} />
        </button>
        <label className={s.urlbar}>
          <Icon name={product?.links.external ? 'browser' : 'document'} size={16} />
          <span className={s.srOnly}>Address</span>
          <input readOnly value={url(page)} />
        </label>
        <label className={s.searchbar}>
          <Icon name="search" size={16} />
          <span className={s.srOnly}>Search what Moe shipped</span>
          <input
            placeholder={`Search: ${db.products.smartclaim.tech[3]}, ${db.devices.attendumReader.chip}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go(HOME, false);
            }}
          />
        </label>
      </div>
      <div className={s.bookmarks} aria-label="Bookmarks toolbar">
        {featured.map((p) => (
          <button
            key={p.title}
            type="button"
            onClick={(e) => go(slug(p), e.ctrlKey || e.metaKey)}
            onMouseEnter={() => setHover(url(slug(p)))}
            onMouseLeave={() => setHover('')}
          >
            <Icon name="link" size={16} />
            {p.title}
          </button>
        ))}
      </div>
      <div className={s.btabs} role="tablist" aria-label="Tabs">
        {tabs.map((t) => (
          <div key={t.id} className={`${s.btab} ${t.id === tab.id ? s.btabOn : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={t.id === tab.id}
              onClick={() => commit(tabs, t.id)}
            >
              <Icon name="browser" size={16} />
              <span>{pageTitle(t.stack[t.at])}</span>
            </button>
            <button
              type="button"
              className={s.btabClose}
              aria-label={`Close ${pageTitle(t.stack[t.at])}`}
              onClick={() => closeTab(t.id)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className={s.btabNew}
          aria-label="New tab"
          onClick={() => go(HOME, true)}
        >
          +
        </button>
      </div>
      <div
        className={s.viewport}
        onMouseOver={(e) =>
          setHover(
            (e.target as HTMLElement)
              .closest('a')
              ?.getAttribute('href')
              ?.replace(/^#/, 'about:shipped/') ?? '',
          )
        }
      >
        {product ? <Page p={product} go={go} /> : <Home go={go} query={query} />}
      </div>
      <p className={s.statusbar}>
        <span>{hover || 'Done'}</span>
      </p>
    </div>
  );
}
