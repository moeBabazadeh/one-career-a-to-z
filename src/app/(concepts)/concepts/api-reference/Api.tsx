'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { db, profile } from '../_shared/data';
import { useInView, useReducedMotion } from '../_shared/hooks';
import { BASE, ENDPOINTS, LATEST, handle, type Method } from './model';
import { highlight, lengthOf, pretty } from './code';
import Console from './Console';
import { CodeView, CopyButton, Icon, StatusChip, Verb, cx, follow } from './parts';
import Search from './Search';
import {
  Education,
  Errors,
  Experience,
  Hardware,
  Messages,
  OpenSource,
  Pagination,
  Platform,
  Platforms,
  Profile,
  RateLimits,
  Versioning,
  Webhooks,
} from './Sections';
import { closeOnEscape, openConsole, openSearch, useModKey } from './store';
import s from './api.module.scss';
import { conceptTitle } from '../_shared/concepts';

/* ------------------------------------------------------------------ navigation */

interface NavItem {
  id: string;
  label: string;
  method?: Method;
}

/** The site's name, without the domain. */
const BRAND = db.person.site.split('.')[0];

const NAV: { title: string; items: NavItem[] }[] = [
  { title: 'Getting started', items: [{ id: 'introduction', label: 'Introduction' }] },
  {
    title: 'Resources',
    items: ENDPOINTS.filter((e) => e.method === 'GET').map((e) => ({
      id: e.id,
      label: e.name,
      method: e.method,
    })),
  },
  {
    title: 'Write',
    items: ENDPOINTS.filter((e) => e.method === 'POST').map((e) => ({
      id: e.id,
      label: e.name,
      method: e.method,
    })),
  },
  {
    title: 'History',
    items: [
      { id: 'versioning', label: 'Versioning' },
      { id: 'webhooks', label: 'Webhooks' },
    ],
  },
  {
    title: 'Conventions',
    items: [
      { id: 'errors', label: 'Errors' },
      { id: 'pagination', label: 'Pagination' },
      { id: 'rate-limits', label: 'Rate limits' },
    ],
  },
];

function Logo() {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true" className={s.logo}>
      <rect width={28} height={28} rx={8} />
      <path d="M11 7.5c-1.9 0-2.8.9-2.8 2.7v1.6c0 1.2-.6 1.9-1.8 2.2 1.2.3 1.8 1 1.8 2.2v1.6c0 1.8.9 2.7 2.8 2.7M17 7.5c1.9 0 2.8.9 2.8 2.7v1.6c0 1.2.6 1.9 1.8 2.2-1.2.3-1.8 1-1.8 2.2v1.6c0 1.8-.9 2.7-2.8 2.7" />
      <circle cx={14} cy={14} r={1.9} />
    </svg>
  );
}

function Nav({
  active,
  open,
  onNavigate,
}: {
  active: string;
  open: boolean;
  onNavigate: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);

  // The active marker slides to the current item, and the list scrolls to keep it in view.
  useEffect(() => {
    const link = scroller.current?.querySelector<HTMLElement>(`[data-nav="${active}"]`);
    const bar = marker.current;
    const box = scroller.current;
    if (!link || !bar || !box) return;
    bar.style.transform = `translateY(${link.offsetTop}px)`;
    bar.style.height = `${link.offsetHeight}px`;
    bar.style.opacity = '1';
    if (
      link.offsetTop < box.scrollTop + 40 ||
      link.offsetTop + link.offsetHeight > box.scrollTop + box.clientHeight - 40
    ) {
      box.scrollTo({ top: link.offsetTop - box.clientHeight / 3 });
    }
  }, [active]);

  return (
    <nav id="api-nav" className={s.nav} data-open={open || undefined} aria-label="API reference">
      <div className={s.navScroll} ref={scroller}>
        <div className={s.navList}>
          <span className={s.navMarker} ref={marker} aria-hidden="true" />
          {NAV.map((group) => (
            <div key={group.title} className={s.navGroup}>
              <p className={s.navTitle}>{group.title}</p>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      data-nav={item.id}
                      aria-current={active === item.id ? 'location' : undefined}
                      onClick={onNavigate}
                    >
                      {item.method ? (
                        <Verb method={item.method} small />
                      ) : (
                        <span className={s.navDot} aria-hidden="true" />
                      )}
                      <span>{item.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={s.navFoot}>
          <p className={s.navTitle}>Reach him</p>
          <a href={`mailto:${profile.email}`}>
            <Icon.mail /> Email
          </a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            <Icon.out /> LinkedIn
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            <Icon.out /> GitHub
          </a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            <Icon.file /> CV (PDF)
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ quickstart */

const QUICK_CMD = `curl ${BASE}/v1/me`;
const QUICK_TEXT = pretty(handle({ method: 'GET', target: '/v1/me' }).body);
const QUICK_LINES = highlight(QUICK_TEXT, 'json');
const QUICK_TOTAL = lengthOf(QUICK_LINES);
const START = 500;
const TYPE_MS = 24;
const SENT = START + QUICK_CMD.length * TYPE_MS;
const RESPONSE = SENT + 420;
const STREAM_MS = 1500;
const DONE = RESPONSE + STREAM_MS;

/** A terminal that types a request and streams the response back, once, when it comes into view. */
function Quickstart() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(true, 0.2);
  const [elapsed, setElapsed] = useState(0);
  const body = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!inView || reduced) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      setElapsed(now - start);
      if (now - start < DONE) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced]);

  const time = reduced ? DONE : elapsed;
  const typed = Math.max(0, Math.min(QUICK_CMD.length, Math.floor((time - START) / TYPE_MS)));
  const streamed =
    time < RESPONSE
      ? 0
      : Math.min(QUICK_TOTAL, Math.ceil(((time - RESPONSE) / STREAM_MS) * QUICK_TOTAL));
  const done = time >= DONE;

  // Follow the stream down, like a terminal does.
  useEffect(() => {
    const el = body.current;
    if (el && streamed > 0 && !done) el.scrollTop = el.scrollHeight;
  }, [streamed, done]);

  return (
    <div ref={ref} className={cx(s.panel, s.quick)}>
      <div className={s.panelHead}>
        <span className={s.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={s.panelTitle}>Quickstart</span>
        <span className={s.mime}>zsh</span>
        <CopyButton text={QUICK_CMD} label="Copy command" />
      </div>
      <pre
        ref={body}
        className={cx(s.pre, s.json, s.quickPre)}
        tabIndex={0}
        aria-label={`Quickstart: ${QUICK_CMD}, and its response`}
      >
        <code className={s.code}>
          <span className={s.line}>
            <span className={s.prompt}>$ </span>
            <span className={s.t_fn}>{QUICK_CMD.slice(0, Math.min(typed, 4))}</span>
            <span className={s.t_str}>{QUICK_CMD.slice(4, typed)}</span>
            {time < RESPONSE && <span className={s.caret} aria-hidden="true" />}
          </span>
        </code>
        {streamed > 0 && (
          <CodeView
            lines={QUICK_LINES}
            upto={streamed}
            json
            wrap
            onFollow={done ? follow : undefined}
          />
        )}
        {done && (
          <code className={s.code}>
            <span className={s.line}>
              <span className={s.prompt}>$ </span>
              <span className={cx(s.caret, s.caretIdle)} aria-hidden="true" />
            </span>
          </code>
        )}
      </pre>
      <div className={s.quickFoot}>
        <StatusChip status={200} />
        <span className={s.mime}>application/json</span>
        <button
          type="button"
          className={s.try}
          onClick={() => openConsole({ method: 'GET', target: '/v1/me', send: true })}
        >
          <Icon.play /> Run it in the console
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ introduction */

const CARDS: { id: string; blurb: string }[] = [
  { id: 'me', blurb: 'Who he is, what he does now and how to reach him.' },
  { id: 'experience', blurb: `Every role since ${db.person.since}, with dates and duties.` },
  { id: 'platforms', blurb: 'What he shipped, with live sites and store links.' },
  { id: 'messages', blurb: 'Write to him. Drafts an email, sends nothing.' },
];

function Intro() {
  return (
    <section
      id="introduction"
      data-spy
      className={cx(s.section, s.intro)}
      aria-labelledby="introduction-title"
    >
      <div className={s.prose}>
        <p className={s.pills}>
          <span className={s.operational}>
            <i aria-hidden="true" /> All systems operational
          </span>
          <span className={s.pill}>REST · JSON</span>
          <span className={s.pill}>Api-Version {LATEST}</span>
        </p>
        <div className={s.hello}>
          <Image
            src={db.person.photo}
            width={600}
            height={600}
            alt={profile.name}
            className={s.avatar}
            priority
            sizes="88px"
          />
          <div>
            <p className={s.kicker}>API reference</p>
            <h1 id="introduction-title">{profile.name}</h1>
          </div>
        </div>
        <p className={s.tagline}>{profile.tagline}</p>
        <p className={s.lede}>{profile.lede}</p>
        <p>
          This reference documents him the way he would document a platform: typed resources,
          examples in five languages and a console that answers. Every response is computed in your
          browser from the same data as the rest of the site.
        </p>
        <div className={s.baseUrl}>
          <span className={s.label}>Base URL</span>
          <code>{BASE}/v1</code>
          <CopyButton text={`${BASE}/v1`} label="Copy base URL" />
        </div>
        <ul className={s.cards}>
          {CARDS.map((card) => {
            const ep = ENDPOINTS.find((e) => e.id === card.id);
            if (!ep) return null;
            return (
              <li key={card.id}>
                <a href={`#${ep.id}`}>
                  <span className={s.cardRoute}>
                    <Verb method={ep.method} small />
                    <code>{ep.path}</code>
                  </span>
                  <b>{ep.title}</b>
                  <span>{card.blurb}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <div className={s.callout}>
          <b>Authentication</b>
          <p>
            None. Every endpoint is public and read-only, except <code>POST /v1/messages</code>,
            which only drafts an email in your own mail client.
          </p>
        </div>
      </div>
      <div className={s.aside}>
        <div className={s.sticky}>
          <Quickstart />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ page */

export default function Api() {
  const [active, setActive] = useState('introduction');
  const [navOpen, setNavOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const spied = useRef(false);
  const reduced = useReducedMotion();
  const mod = useModKey();

  // Scroll-spy: the last section whose top has passed the reading line is the active one.
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('[data-spy]')];
    let frame = 0;
    const update = () => {
      frame = 0;
      const atEnd =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const current = atEnd
        ? sections[sections.length - 1]
        : (sections.filter((el) => el.getBoundingClientRect().top <= 160).at(-1) ?? sections[0]);
      setActive(current.id);
    };
    const onScroll = () => {
      spied.current = true;
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Deep links: the address bar follows the section you are reading.
  useEffect(() => {
    if (!spied.current) return;
    const url = active === 'introduction' ? window.location.pathname : `#${active}`;
    window.history.replaceState(window.history.state, '', url);
  }, [active]);

  // Panels rise in as they scroll into view.
  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    el.dataset.motion = 'on';
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.seen = '';
          observer.unobserve(e.target);
        }
      },
      { threshold: 0.08 },
    );
    el.querySelectorAll('[data-reveal]').forEach((t) => observer.observe(t));
    return () => {
      observer.disconnect();
      delete el.dataset.motion;
    };
  }, [reduced]);

  // ⌘K or / opens search; Esc closes the nav and the console.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        openSearch();
      } else if (e.key === 'Escape') {
        setNavOpen(false);
        closeOnEscape();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={s.root} ref={root}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.top}>
        <button
          type="button"
          className={s.menu}
          aria-expanded={navOpen}
          aria-controls="api-nav"
          aria-label="Menu"
          onClick={() => setNavOpen(!navOpen)}
        >
          {navOpen ? <Icon.close /> : <Icon.menu />}
        </button>
        <a href="#introduction" className={s.brand}>
          <Logo />
          <span>{BRAND}</span>
          <span className={s.brandSub}>API reference</span>
        </a>
        <button
          type="button"
          className={s.searchBtn}
          onClick={openSearch}
          aria-label="Search the docs"
        >
          <Icon.search />
          <span>Search the docs</span>
          <kbd>{mod} K</kbd>
        </button>
        <nav className={s.topLinks} aria-label="Shortcuts">
          <a href="#versioning">Changelog</a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <button type="button" className={s.consoleBtn} onClick={() => openConsole()}>
          <Icon.play />
          <span>Console</span>
        </button>
      </header>

      <div className={s.layout}>
        <Nav active={active} open={navOpen} onNavigate={() => setNavOpen(false)} />
        {navOpen && (
          <div className={s.scrim} onClick={() => setNavOpen(false)} aria-hidden="true" />
        )}
        <main id="main" className={s.main}>
          <Intro />
          <Profile />
          <Experience />
          <Platforms />
          <Platform />
          <OpenSource />
          <Hardware />
          <Education />
          <Messages />
          <Versioning />
          <Webhooks />
          <Errors />
          <Pagination />
          <RateLimits />
          <footer className={s.footer}>
            <p>
              <b>{profile.fullName}</b> · {profile.role} at{' '}
              <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                {profile.company}
              </a>{' '}
              · <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </p>
            <p>
              Concept {conceptTitle('api-reference')}. Responses are computed in your browser;
              latencies and request ids are simulated.
            </p>
          </footer>
        </main>
      </div>

      <Console />
      <Search />
    </div>
  );
}
