'use client';

import Image from 'next/image';
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { concept } from '../_shared/concepts';
import { db, fmt, profile } from '../_shared/data';
import { readChoice, subscribeScheme, writeScheme } from '../_shared/scheme';
import {
  ACCOUNT,
  BRAND,
  BUCKETS,
  NOTES,
  REGIONS,
  RESOURCES,
  SERVICES,
  accountIdPretty,
  bucketById,
  regionById,
  resourceByKey,
  roleById,
  serviceById,
  type ServiceId,
} from './inventory';
import { USER } from './policy';
import { crumbLabel, crumbs, iconOf } from './labels';
import { Billing } from './Billing';
import { Events, Marketplace } from './Events';
import { Home } from './Home';
import { IamHome, RoleDetail, RolesList, Simulator, UserDetail } from './Iam';
import { Read } from './Read';
import {
  AllResources,
  Catalogue,
  NotFound,
  Regions,
  ResourceDetail,
  ServicePage,
} from './Services';
import { Search } from './Search';
import { Shell } from './Shell';
import { BucketView, StorageHome } from './Storage';
import { Shortcuts, Support } from './Panels';
import { CopyButton, Icon, Mark, cx, type IconName } from './ui';
import { escape, getUi, go, href, openPanel, setUi, toggleShell, useRoute, useUi } from './store';
import s from './console.module.scss';

const C = concept('nimbus');

/* ------------------------------------------------------------------ navigation */

const MANAGEMENT: { path: string; label: string; icon: IconName }[] = [
  { path: 'resources', label: 'All resources', icon: 'resources' },
  { path: 'regions', label: 'Regions', icon: 'regions' },
  { path: 'events', label: 'Audit trail', icon: 'events' },
  { path: 'billing', label: 'Billing', icon: 'billing' },
  { path: 'marketplace', label: 'Marketplace', icon: 'marketplace' },
];

/** Pages that are not tied to a region, as in a real console. */
const GLOBAL = new Set(['iam', 'billing', 'events', 'marketplace', 'storage', 'regions', 'read']);

const countOf = (id: ServiceId) =>
  id === 'storage' ? BUCKETS.length : RESOURCES.filter((r) => r.service === id).length;

function NavLink({
  path,
  label,
  icon,
  current,
  count,
  collapsed,
}: {
  path: string;
  label: string;
  icon: IconName;
  current: boolean;
  count?: number;
  collapsed: boolean;
}) {
  return (
    <a
      href={href(path)}
      className={s.navLink}
      aria-current={current ? 'page' : undefined}
      title={collapsed ? label : undefined}
      onClick={() => setUi({ navOpen: false })}
    >
      <Icon name={icon} />
      <span className={s.navLabel}>{label}</span>
      {count !== undefined && <span className={s.navCount}>{count}</span>}
    </a>
  );
}

function SideNav({ path }: { path: string }) {
  const ui = useUi();
  const top = path.split('/')[0];
  const collapsed = ui.navCollapsed;
  const section = (p: string) =>
    top === p || (p === 'resources' && top === 'resources' && !path.startsWith('resources/'));
  const resourceService = top === 'resources' ? path.split('/')[1] : null;
  return (
    <nav
      id="console-nav"
      className={s.nav}
      data-open={ui.navOpen || undefined}
      data-collapsed={collapsed || undefined}
      aria-label="Console"
    >
      <div className={s.navScroll}>
        <NavLink
          path=""
          label="Console Home"
          icon="home"
          current={path === ''}
          collapsed={collapsed}
        />
        <NavLink
          path="services"
          label="All services"
          icon="services"
          current={path === 'services'}
          collapsed={collapsed}
        />
        <p className={s.navTitle}>Services</p>
        {SERVICES.map((sv) => (
          <NavLink
            key={sv.id}
            path={sv.id}
            label={sv.name}
            icon={iconOf(sv.id)}
            current={top === sv.id || resourceService === sv.id}
            count={countOf(sv.id)}
            collapsed={collapsed}
          />
        ))}
        <p className={s.navTitle}>Management</p>
        {MANAGEMENT.map((m) => (
          <NavLink
            key={m.path}
            path={m.path}
            label={m.label}
            icon={m.icon}
            current={section(m.path) && !resourceService}
            collapsed={collapsed}
          />
        ))}
        <p className={s.navTitle}>Help</p>
        <button
          type="button"
          className={s.navLink}
          title={collapsed ? 'Support' : undefined}
          onClick={() => openPanel('support')}
        >
          <Icon name="help" />
          <span className={s.navLabel}>Support</span>
        </button>
        <button
          type="button"
          className={s.navLink}
          title={collapsed ? 'CloudShell' : undefined}
          onClick={() => toggleShell(true)}
        >
          <Icon name="terminal" />
          <span className={s.navLabel}>CloudShell</span>
          <kbd className={s.navKbd}>`</kbd>
        </button>
        <NavLink
          path="read"
          label="Read as a page"
          icon="book"
          current={false}
          collapsed={collapsed}
        />
        <div className={s.navRegion}>
          <p className={s.navTitle}>Region</p>
          <RegionList onPick={() => setUi({ navOpen: false })} />
        </div>
      </div>
      <button
        type="button"
        className={s.collapse}
        onClick={() => setUi({ navCollapsed: !collapsed })}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={`${collapsed ? 'Expand' : 'Collapse'} ( [ )`}
      >
        <Icon name="panel" size={16} />
        <span className={s.navLabel}>Collapse</span>
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ breadcrumbs */

function Breadcrumbs({ path }: { path: string }) {
  const list = crumbs(path);
  return (
    <nav className={s.crumbs} aria-label="Breadcrumb">
      <ol>
        {list.map((c, i) => (
          <li key={`${c.path}-${i}`}>
            {i < list.length - 1 ? (
              <a href={href(c.path)}>{c.label}</a>
            ) : (
              <span aria-current="page">{c.label}</span>
            )}
            {i < list.length - 1 && <Icon name="right" size={13} />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ menus */

function useOutside(open: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setUi({ menu: null });
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, ref]);
}

function Menu({
  name,
  button,
  label,
  children,
  className,
  buttonClass,
}: {
  name: NonNullable<ReturnType<typeof getUi>['menu']>;
  button: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
  buttonClass?: string;
}) {
  const ui = useUi();
  const open = ui.menu === name;
  const ref = useRef<HTMLDivElement>(null);
  useOutside(open, ref);
  return (
    <div className={s.menuWrap} ref={ref}>
      <button
        type="button"
        className={cx(s.topBtn, buttonClass)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        title={label}
        onClick={() => setUi({ menu: open ? null : name })}
      >
        {button}
      </button>
      {open && (
        <div className={cx(s.menu, className)} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

function RegionList({ onPick }: { onPick?: () => void }) {
  const ui = useUi();
  const pick = (id: string) => {
    setUi({ region: id, menu: null });
    onPick?.();
  };
  return (
    <ul className={s.regionList} role="listbox" aria-label="Region">
      <li role="option" aria-selected={ui.region === 'all'}>
        <button type="button" onClick={() => pick('all')}>
          <span>All regions</span>
          <code>all</code>
        </button>
      </li>
      {REGIONS.map((r) => (
        <li key={r.id} role="option" aria-selected={ui.region === r.id}>
          <button type="button" onClick={() => pick(r.id)}>
            <span>{r.name}</span>
            <code>{r.id}</code>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RegionMenu({ path }: { path: string }) {
  const ui = useUi();
  const global = GLOBAL.has(path.split('/')[0]);
  const region = regionById(ui.region);
  return (
    <Menu
      name="region"
      label="Region"
      className={s.regionMenu}
      buttonClass={s.regionBtn}
      button={
        <>
          <Icon name="globe" size={16} />
          <span>{global ? 'Global' : (region?.name ?? 'All regions')}</span>
          <Icon name="down" size={14} />
        </>
      }
    >
      {global && (
        <p className={s.menuNote}>
          <Icon name="info" size={14} /> This page is global: it shows every region.
        </p>
      )}
      <p className={s.menuTitle}>Regions with resources</p>
      <RegionList />
      <a className={s.menuFoot} href={href('regions')} onClick={() => setUi({ menu: null })}>
        Manage regions
      </a>
    </Menu>
  );
}

function ServicesMenu() {
  const ui = useUi();
  return (
    <Menu
      name="services"
      label="Services"
      className={s.servicesMenu}
      buttonClass={s.servicesBtn}
      button={
        <>
          <Icon name="services" size={16} />
          <span>Services</span>
        </>
      }
    >
      <div className={s.servicesGrid}>
        <div>
          <p className={s.menuTitle}>Recently visited</p>
          <ul className={s.menuLinks}>
            {ui.recent.slice(0, 5).map((p) => (
              <li key={p}>
                <a href={href(p)} onClick={() => setUi({ menu: null })}>
                  <Icon name={iconOf(p.split('/')[0])} size={16} />
                  {crumbLabel(p)}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className={s.menuTitle}>All services</p>
          <ul className={s.menuServices}>
            {SERVICES.map((sv) => (
              <li key={sv.id}>
                <a href={href(sv.id)} onClick={() => setUi({ menu: null })}>
                  <span className={s.svcIcon} data-svc={sv.id}>
                    <Icon name={iconOf(sv.id)} size={16} />
                  </span>
                  <span>
                    <b>{sv.name}</b>
                    <small>{sv.maps}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Menu>
  );
}

function NotesMenu() {
  const ui = useUi();
  const unread = NOTES.filter((n) => !ui.read.includes(n.id)).length;
  return (
    <Menu
      name="notes"
      label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      className={s.notesMenu}
      button={
        <>
          <Icon name="bell" />
          {unread > 0 && <span className={s.badge}>{unread}</span>}
        </>
      }
    >
      <div className={s.notesHead}>
        <b>Notifications</b>
        <button
          type="button"
          disabled={!unread}
          onClick={() => setUi({ read: NOTES.map((n) => n.id) })}
        >
          Mark all as read
        </button>
      </div>
      <ul className={s.notes}>
        {NOTES.map((n) => (
          <li key={n.id} data-unread={!ui.read.includes(n.id) || undefined}>
            <a
              href={href(n.href)}
              onClick={() =>
                setUi((st) => ({ menu: null, read: [...new Set([...st.read, n.id])] }))
              }
            >
              <span className={s.noteDot} data-tone={n.tone} aria-hidden="true" />
              <span>
                <b>{n.title}</b>
                <span>{n.body}</span>
                <small>{n.at ? fmt.month(n.at) : 'Ongoing'}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Menu>
  );
}

function SchemeSwitch() {
  const choice = useSyncExternalStore(subscribeScheme, readChoice, () => null);
  const opts: { v: 'light' | 'dark' | null; label: string; icon: IconName }[] = [
    { v: 'light', label: 'Light', icon: 'sun' },
    { v: 'dark', label: 'Dark', icon: 'moon' },
    { v: null, label: 'System', icon: 'monitor' },
  ];
  return (
    <div className={s.segmented} role="radiogroup" aria-label="Visual mode">
      {opts.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={choice === o.v}
          onClick={() => writeScheme(o.v)}
        >
          <Icon name={o.icon} size={14} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AccountMenu() {
  const initials = profile.name
    .split(' ')
    .map((w) => w[0])
    .join('');
  return (
    <Menu
      name="account"
      label="Account"
      className={s.accountMenu}
      buttonClass={s.accountBtn}
      button={
        <>
          <span className={s.avatar} aria-hidden="true">
            {initials}
          </span>
          <span className={s.accountName}>
            {ACCOUNT} <small>@ {BRAND}</small>
          </span>
          <Icon name="down" size={14} />
        </>
      }
    >
      <div className={s.accountHead}>
        <Image src={db.person.photo} width={96} height={96} alt="" className={s.accountPhoto} />
        <div>
          <b>{profile.name}</b>
          <span>
            {profile.role}, {profile.company}
          </span>
        </div>
      </div>
      <dl className={s.accountIds}>
        <div>
          <dt>Account ID</dt>
          <dd>
            <code>{accountIdPretty}</code>
            <CopyButton text={accountIdPretty} label="Copy account ID" small />
          </dd>
        </div>
        <div>
          <dt>User</dt>
          <dd>
            <code>{USER.crn}</code>
          </dd>
        </div>
      </dl>
      <ul className={s.menuLinks}>
        <li>
          <a href={href(`iam/users/${ACCOUNT}`)} onClick={() => setUi({ menu: null })}>
            <Icon name="user" size={16} /> Account
          </a>
        </li>
        <li>
          <a href={href('billing')} onClick={() => setUi({ menu: null })}>
            <Icon name="billing" size={16} /> Billing
          </a>
        </li>
        <li>
          <a href={href('read')} onClick={() => setUi({ menu: null })}>
            <Icon name="book" size={16} /> Read as a page
          </a>
        </li>
        <li>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            <Icon name="download" size={16} /> Download CV
          </a>
        </li>
        <li>
          <button type="button" onClick={() => openPanel('shortcuts')}>
            <Icon name="keyboard" size={16} /> Keyboard shortcuts
          </button>
        </li>
      </ul>
      <p className={s.menuTitle}>Visual mode</p>
      <SchemeSwitch />
    </Menu>
  );
}

/* ------------------------------------------------------------------ top bar */

function TopBar({ path }: { path: string }) {
  const ui = useUi();
  return (
    <header className={s.top}>
      <button
        type="button"
        className={cx(s.topBtn, s.menuBtn)}
        aria-expanded={ui.navOpen}
        aria-controls="console-nav"
        aria-label="Navigation"
        onClick={() => setUi({ navOpen: !ui.navOpen, menu: null })}
      >
        <Icon name={ui.navOpen ? 'x' : 'menu'} />
      </button>
      <a href={href('')} className={s.brand} aria-label={`${BRAND} console home`}>
        <Mark />
        <span>
          {BRAND}
          <small>console</small>
        </span>
      </a>
      <ServicesMenu />
      <button type="button" className={s.searchBtn} onClick={() => openPanel('search')}>
        <Icon name="search" size={16} />
        <span>Search resources, services and roles</span>
        <kbd>⌘K</kbd>
      </button>
      <div className={s.topRight}>
        <button
          type="button"
          className={cx(s.topBtn, s.searchIcon)}
          aria-label="Search"
          onClick={() => openPanel('search')}
        >
          <Icon name="search" />
        </button>
        <button
          type="button"
          className={s.topBtn}
          aria-label="CloudShell"
          title="CloudShell ( ` )"
          aria-pressed={ui.shell}
          onClick={() => toggleShell()}
        >
          <Icon name="terminal" />
        </button>
        <NotesMenu />
        <button
          type="button"
          className={cx(s.topBtn, s.helpBtn)}
          aria-label="Support"
          title="Support"
          onClick={() => openPanel('support')}
        >
          <Icon name="help" />
        </button>
        <RegionMenu path={path} />
        <AccountMenu />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ views */

function View({ path }: { path: string }) {
  const seg = path.split('/').filter(Boolean);
  const [a, b, c] = seg;
  if (!a) return <Home />;
  if (a === 'services') return <Catalogue />;
  if (a === 'compute' || a === 'iot' || a === 'databases' || a === 'ml')
    return <ServicePage id={a} />;
  if (a === 'iam') {
    if (!b) return <IamHome />;
    if (b === 'roles' && !c) return <RolesList />;
    if (b === 'roles' && c && roleById(c)) return <RoleDetail id={c} />;
    if (b === 'simulator') return <Simulator />;
    if (b === 'users' && c === ACCOUNT) return <UserDetail />;
  }
  if (a === 'storage') {
    if (!b) return <StorageHome />;
    if (bucketById(b)) return <BucketView bucket={b} rest={seg.slice(2).join('/')} />;
  }
  if (a === 'resources') {
    if (!b) return <AllResources />;
    if (serviceById(b) && !c) return <ServicePage id={b as ServiceId} />;
    const r = resourceByKey(`${b}/${c}`);
    if (r) return <ResourceDetail key={`${b}/${c}`} resource={r} />;
  }
  if (a === 'regions') return <Regions />;
  if (a === 'billing') return <Billing />;
  if (a === 'events') return <Events />;
  if (a === 'marketplace') return <Marketplace />;
  return <NotFound path={path} />;
}

/* ------------------------------------------------------------------ keys */

const CHORDS: Record<string, string> = {
  h: '',
  s: 'services',
  r: 'resources',
  i: 'iam/roles',
  c: 'compute',
  d: 'iot',
  b: 'billing',
  e: 'events',
  m: 'marketplace',
  a: 'storage',
};

function useKeys() {
  useEffect(() => {
    let chord = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (getUi().search) setUi({ search: false });
        else openPanel('search');
        return;
      }
      if (e.key === 'Escape') {
        escape();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (chord && e.timeStamp - chord < 1200 && e.key in CHORDS) {
        e.preventDefault();
        chord = 0;
        go(CHORDS[e.key]);
        return;
      }
      chord = 0;
      if (e.key === 'g') chord = e.timeStamp;
      else if (e.key === '/') {
        e.preventDefault();
        openPanel('search');
      } else if (e.key === '`') {
        e.preventDefault();
        toggleShell();
      } else if (e.key === '?') {
        e.preventDefault();
        openPanel('shortcuts');
      } else if (e.key === '[') {
        setUi((st) => ({ navCollapsed: !st.navCollapsed }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/* ------------------------------------------------------------------ page */

function Footer() {
  return (
    <footer className={s.footer}>
      <p>
        <b>{profile.fullName}</b> · {profile.role}, {profile.company} ·{' '}
        <a href={`mailto:${profile.email}`}>{profile.email}</a>
      </p>
      <p>
        Concept {C.letter} · {C.name}. Charts marked <i>Illustrative</i> are seeded series; every
        other figure comes from the record, last checked {fmt.month(db.asOf)}. Months on the bill
        are derived from the role dates.
      </p>
      <p className={s.footLinks}>
        <a href={href('read')}>Read as a page</a>
        <button type="button" onClick={() => openPanel('support')}>
          Contact
        </button>
        <a href={profile.cv} target="_blank" rel="noreferrer">
          CV
        </a>
        <button type="button" onClick={() => openPanel('shortcuts')}>
          Shortcuts
        </button>
      </p>
    </footer>
  );
}

function Toast() {
  const ui = useUi();
  return (
    <div className={s.toast} role="status" aria-live="polite" data-show={ui.toast ? '' : undefined}>
      {ui.toast && (
        <>
          <Icon name="check" size={15} /> {ui.toast}
        </>
      )}
    </div>
  );
}

export default function Console() {
  const path = useRoute();
  const ui = useUi();
  useKeys();

  if (path === 'read') {
    return (
      <div className={cx(s.root, s.readRoot)}>
        <Read />
      </div>
    );
  }

  return (
    <div
      className={s.root}
      data-shell={ui.shell || undefined}
      data-max={ui.shellMax || undefined}
      style={{ '--shell-h': `${ui.shellHeight}px` } as CSSProperties}
    >
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <TopBar path={path} />
      <div className={s.body} data-collapsed={ui.navCollapsed || undefined}>
        <SideNav path={path} />
        {ui.navOpen && (
          <div className={s.scrim} onClick={() => setUi({ navOpen: false })} aria-hidden="true" />
        )}
        <main id="main" className={s.main}>
          <Breadcrumbs path={path} />
          <View path={path} />
          <Footer />
        </main>
      </div>
      <Shell />
      <Search />
      <Support />
      <Shortcuts />
      <Toast />
    </div>
  );
}
