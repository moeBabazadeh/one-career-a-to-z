'use client';

// The phone: lock screen, home screen, app windows, app switcher, notification and control
// centres, search and quick actions, all driven by one reducer (os.ts) and moved by springs
// (shell.ts). Gestures, keys and taps all end up in the same handful of transitions below.
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { concept } from '../_shared/concepts';
import { db, hardware, profile } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import { AppIcon } from './AppIcon';
import { Browser } from './apps/Browser';
import { Calendar } from './apps/Calendar';
import { Code } from './apps/Code';
import { Files } from './apps/Files';
import { Hardware } from './apps/Hardware';
import { Notes } from './apps/Notes';
import { Contacts, Mail } from './apps/People';
import { Projects } from './apps/Projects';
import { GESTURES, KEYS, Settings } from './apps/Settings';
import { StoreApp } from './apps/StoreApp';
import {
  APPS,
  CV,
  FEATURED,
  NOTES,
  NOTICES,
  PAGES,
  STORE_IDS,
  WALLPAPERS,
  current,
  mailto,
  projectSlug,
  vcard,
  vcardName,
  type Hit,
  type Notice,
} from './content';
import { Control } from './Control';
import { Home } from './Home';
import { Icon, type UiIcon } from './icons';
import { Notices } from './Notices';
import { initialOS, reduce, top, type Action, type OS } from './os';
import { Search } from './Search';
import { Shell, track, type Box } from './shell';
import { SPRINGS, curve, project, rubber } from './spring';
import { copy, save, type AppCtx, type Clock } from './ui';
import s from './phone.module.scss';

const me = concept('mobile');

// CSS transitions use the same spring physics, sampled into linear() easings.
const EASE = curve(SPRINGS.launch);
const SOFT = curve(SPRINGS.soft);
const POP = curve(SPRINGS.pop);
const SPRING_VARS = {
  '--spring': EASE.easing,
  '--spring-ms': `${EASE.ms}ms`,
  '--spring-soft': SOFT.easing,
  '--spring-soft-ms': `${SOFT.ms}ms`,
  '--spring-pop': POP.easing,
  '--spring-pop-ms': `${POP.ms}ms`,
} as React.CSSProperties;

/** Device size in CSS px, and the bezel around it on the stage. */
const DEVICE = { w: 390, h: 844, bezel: 14 };
const PHONE_MQ = '(max-width: 600px)';

/** Windows render in a fixed order so reordering recents never moves (and reloads) a DOM node. */
const ORDER = Object.keys(APPS);

/** A quick action: a link, a place in an app, or one of the system's own operations. */
interface Act {
  label: string;
  icon: UiIcon;
  href?: string;
  go?: { app: string; stack?: string[] };
  op?: 'copy-email' | 'vcard';
}

/** What touching and holding an icon offers. */
function actionsFor(id: string): Act[] {
  const go = (app: string, stack?: string[]) => ({ app, stack });
  switch (id) {
    case 'contacts':
      return [
        { label: 'Copy Email Address', icon: 'copy', op: 'copy-email' },
        { label: 'Share Contact', icon: 'share', op: 'vcard' },
        { label: 'Open CV', icon: 'pdf', href: db.person.cv },
      ];
    case 'mail':
      return [
        { label: 'New Message', icon: 'send', go: go('mail') },
        { label: `Email ${db.person.first} in your mail app`, icon: 'mail', href: mailto('', '') },
      ];
    case 'calendar':
      return [
        {
          label: `${current.title}, ${current.company}`,
          icon: 'info',
          go: go('calendar', [`event/${current.role.id}`]),
        },
        { label: 'Every role', icon: 'list', go: go('calendar') },
      ];
    case 'files':
      return [
        { label: CV.name, icon: 'pdf', go: go('files', ['folder/docs', 'file/cv']) },
        { label: 'Archive', icon: 'folder', go: go('files', ['folder/archive']) },
      ];
    case 'notes':
      return NOTES.slice(0, 3).map((n) => ({
        label: n.title,
        icon: 'doc' as UiIcon,
        go: go('notes', [`note/${n.id}`]),
      }));
    case 'code':
      return [
        { label: 'Pull Requests', icon: 'pr', go: go('code') },
        { label: 'Profile', icon: 'person', href: db.person.github },
      ];
    case 'hardware':
      return hardware.slice(0, 3).map((d) => ({
        label: d.name,
        icon: 'chip' as UiIcon,
        go: go('hardware', [`device/${d.tag}`]),
      }));
    case 'projects':
      return FEATURED.slice(0, 3).map((p) => ({
        label: p.title,
        icon: 'grid' as UiIcon,
        go: go('projects', [`project/${projectSlug(p.title)}`]),
      }));
    case 'browser':
      return [{ label: db.person.site, icon: 'globe', href: db.person.url }];
    case 'settings':
      return [
        { label: 'Display & Brightness', icon: 'sun', go: go('settings', ['display']) },
        { label: 'Wallpaper', icon: 'image', go: go('settings', ['wallpaper']) },
        { label: 'About', icon: 'info', go: go('settings', ['general', 'about']) },
      ];
  }
  if (STORE_IDS.includes(id as db.ProductId)) {
    const links: db.ProjectLinks = db.products[id as db.ProductId].links;
    return [
      ...(links.appStore
        ? [{ label: 'App Store', icon: 'store' as UiIcon, href: links.appStore }]
        : []),
      ...(links.playStore
        ? [{ label: 'Google Play', icon: 'play' as UiIcon, href: links.playStore }]
        : []),
      ...(links.external
        ? [{ label: 'Website', icon: 'globe' as UiIcon, href: links.external }]
        : []),
    ];
  }
  return [];
}

type SideKey = 'home' | 'switcher' | 'notifications' | 'control' | 'search' | 'power';

const SIDE: [string, UiIcon, string, SideKey][] = [
  ['Home', 'home', 'H', 'home'],
  ['Open apps', 'switcher', 'S', 'switcher'],
  ['Notifications', 'bell', 'N', 'notifications'],
  ['Control centre', 'sun', 'C', 'control'],
  ['Search', 'search', '/', 'search'],
  ['Lock', 'lock', 'L', 'power'],
];

function formatClock(d: Date): Clock {
  const h12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
    .resolvedOptions()
    .hourCycle?.startsWith('h1');
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  return {
    time: h12 ? `${h % 12 || 12}:${mm}` : `${String(h).padStart(2, '0')}:${mm}`,
    date: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase().replace('.', ''),
    day: d.getDate(),
    month: d.getMonth(),
    year: d.getFullYear(),
  };
}

export function Phone({ active, onRead }: { active: boolean; onRead: () => void }) {
  const system = useReducedMotion();
  const [os, dispatch] = useReducer(reduce, undefined, initialOS);
  const reduced = system || os.toggles.motion;
  const [shell] = useState(() => new Shell());
  const [clock, setClock] = useState<Clock | null>(null);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [said, setSaid] = useState('');

  const stage = useRef<HTMLDivElement>(null);
  const device = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const desk = useRef<HTMLDivElement>(null);
  const lockEl = useRef<HTMLDivElement>(null);
  const pagesEl = useRef<HTMLDivElement>(null);
  const ncEl = useRef<HTMLDivElement>(null);
  const ccEl = useRef<HTMLDivElement>(null);
  const searchEl = useRef<HTMLDivElement>(null);
  const homeEl = useRef<HTMLDivElement>(null);
  const osRef = useRef<OS>(os);
  const pending = useRef<{ app: string; stack?: string[] } | null>(null);
  const tipShown = useRef(false);

  useLayoutEffect(() => {
    osRef.current = os;
    shell.setReduced(reduced);
  });

  /* ---------------------------------------------------------------- helpers */

  const say = (text: string) => setSaid(text);
  const soon = (find: () => HTMLElement | null | undefined) =>
    requestAnimationFrame(() => find()?.focus({ preventScroll: true }));
  const toast = (text: string) => dispatch({ type: 'toast', text });

  /** An app's icon on the page in view or in the dock, where a window flies to and from. */
  const iconOf = (id: string) => {
    const o = osRef.current;
    return (
      screen.current?.querySelector<HTMLElement>(
        `[data-page="${o.page}"] [data-icon="${id}"] [data-tile], [data-dock] [data-icon="${id}"] [data-tile]`,
      ) ?? null
    );
  };

  /** The icon's box once the home screen settles: undoes the zoom it is springing back from. */
  const iconBox = (id: string): Box | null => {
    const el = iconOf(id);
    if (!el) return null;
    const b = shell.boxOf(el);
    const m = homeEl.current
      ? new DOMMatrixReadOnly(
          getComputedStyle(homeEl.current).transform === 'none'
            ? undefined
            : getComputedStyle(homeEl.current).transform,
        )
      : null;
    const k = m ? m.a : 1;
    if (Math.abs(k - 1) < 0.001) return b;
    const cx = shell.W / 2;
    const cy = shell.H / 2;
    return {
      ...b,
      cx: cx + (b.cx - cx) / k,
      cy: cy + (b.cy - cy) / k,
      w: b.w / k,
      h: b.h / k,
      r: b.r / k,
    };
  };

  const fallbackBox = (): Box => ({
    cx: shell.W / 2,
    cy: shell.H / 2,
    w: shell.W * 0.18,
    h: shell.W * 0.18,
    r: shell.W * 0.04,
    f: 1,
  });

  /* ---------------------------------------------------------------- transitions */

  const openApp = (id: string, from?: Element | null, stack?: string[]) => {
    const o = osRef.current;
    if (!APPS[id] || !o.power) return;
    if (o.locked) {
      pending.current = { app: id, stack };
      unlock();
      return;
    }
    const wasFront = o.mode === 'app' && o.app === id;
    const fromSwitcher = o.mode === 'switcher' && o.recents.includes(id);
    flushSync(() => dispatch({ type: 'open', app: id, stack }));
    if (!wasFront && !fromSwitcher) {
      const box = from ? { ...shell.boxOf(from), f: 1 } : (iconBox(id) ?? fallbackBox());
      shell.place(id, { ...box, f: 1 }, 200);
    }
    shell.move(id, shell.full(), SPRINGS.launch, { z: 200, done: () => shell.hideExcept([id]) });
    say(`${APPS[id].name} open`);
    soon(() => document.getElementById(`win-${id}`));
  };

  const goHome = (velocity?: Partial<Box>) => {
    const o = osRef.current;
    if (!o.power || o.locked) return;
    if (o.menu) return dispatch({ type: 'menu', menu: null });
    if (o.overlay) {
      flushSync(() => dispatch({ type: 'overlay', overlay: null }));
      if (o.mode === 'home') return;
    }
    if (o.mode === 'home') {
      if (o.page) setPage(0);
      return;
    }
    const was = o.mode;
    const id = o.app;
    flushSync(() => dispatch({ type: 'home' }));
    const flying = was === 'switcher' ? o.recents : id ? [id] : [];
    flying.forEach((rid, i) =>
      shell.move(rid, iconBox(rid) ?? fallbackBox(), SPRINGS.launch, {
        velocity: i === 0 ? velocity : undefined,
        hide: true,
      }),
    );
    say('Home');
    soon(
      () =>
        (id ? iconOf(id)?.closest('button') : null) ??
        screen.current?.querySelector<HTMLElement>(`[data-page="${o.page}"] button`),
    );
  };

  const showSwitcher = (velocity?: Partial<Box>) => {
    const o = osRef.current;
    if (!o.power || o.locked) return;
    if (!o.recents.length) {
      toast('No open apps');
      return;
    }
    const wasShown = o.recents.filter((id) => o.mode === 'app' && id === o.app);
    shell.setScroll(0);
    flushSync(() => dispatch({ type: 'switcher' }));
    o.recents.forEach((id, i) => {
      // Apps in the background slide in from the left, behind the one you came from.
      if (!wasShown.includes(id)) shell.place(id, shell.card(i, -1.4), 100 - i);
      shell.move(id, shell.card(i), SPRINGS.settle, {
        z: 100 - i,
        velocity: i === 0 ? velocity : undefined,
      });
    });
    say(`Open apps: ${o.recents.map((id) => APPS[id].name).join(', ')}`);
    soon(() => screen.current?.querySelector<HTMLElement>(`[data-card="${o.recents[0]}"]`));
  };

  const killApp = (id: string, vy = -1600) => {
    shell.move(id, { cy: -shell.H * 0.5 }, SPRINGS.settle, {
      velocity: { cy: vy },
      hide: true,
      done: () => {
        const left = osRef.current.recents.filter((r) => r !== id);
        flushSync(() => dispatch({ type: 'kill', app: id }));
        say(`${APPS[id].name} closed`);
        if (!left.length) goHome();
        else {
          shell.setScroll(Math.min(shell.scroll, left.length - 1));
          shell.layoutCards(left);
          soon(() =>
            screen.current?.querySelector<HTMLElement>(
              `[data-card="${left[Math.round(shell.scroll)]}"]`,
            ),
          );
        }
      },
    });
  };

  /** Swipe along the bottom edge: the previous app slides in from the left, or the oldest from the right. */
  const switchApp = (dir: 1 | -1, velocity = 0) => {
    const o = osRef.current;
    if (o.locked || o.recents.length < 2) return;
    const cur = o.mode === 'app' ? o.app : null;
    const id = dir === 1 ? o.recents[1] : o.recents[o.recents.length - 1];
    if (!cur) return openApp(o.recents[0]);
    flushSync(() => dispatch({ type: 'open', app: id }));
    const full = shell.full();
    shell.place(id, { ...full, cx: full.cx - dir * shell.W * 1.04 }, 200);
    shell.move(id, full, SPRINGS.settle, {
      velocity: { cx: velocity },
      z: 200,
      done: () => shell.hideExcept([id]),
    });
    shell.move(cur, { ...full, cx: full.cx + dir * shell.W * 1.04 }, SPRINGS.settle, {
      velocity: { cx: velocity },
      z: 199,
    });
    say(`${APPS[id].name} open`);
    soon(() => document.getElementById(`win-${id}`));
  };

  const setPage = (p: number, velocity = 0) => {
    const n = Math.max(0, Math.min(PAGES.length - 1, p));
    dispatch({ type: 'page', page: n });
    shell.pagesTo(-n * shell.W, velocity);
    say(`Page ${n + 1} of ${PAGES.length}`);
  };

  const unlock = (velocity = 0) => {
    const o = osRef.current;
    if (!o.locked) return;
    if (!o.power) dispatch({ type: 'power', on: true });
    shell.lockTo(-shell.H, velocity, () => {
      flushSync(() => dispatch({ type: 'unlock' }));
      say('Unlocked');
      const p = pending.current;
      pending.current = null;
      if (p) openApp(p.app, null, p.stack);
      else {
        const now = osRef.current;
        soon(() =>
          now.mode === 'app' && now.app
            ? document.getElementById(`win-${now.app}`)
            : screen.current?.querySelector<HTMLElement>(`[data-page="${now.page}"] button`),
        );
      }
    });
  };

  const lockNow = () => {
    flushSync(() => dispatch({ type: 'lock' }));
    shell.lockSet(0);
    say('Locked');
    soon(() => lockEl.current);
  };

  const sleep = () => {
    flushSync(() => dispatch({ type: 'power', on: false }));
    shell.lockSet(0);
    say('Screen off');
  };

  const wake = () => {
    dispatch({ type: 'power', on: true });
    say('Locked. Swipe up or press Space to unlock.');
    soon(() => lockEl.current);
  };

  const overlay = (which: OS['overlay']) => {
    const o = osRef.current;
    if (!o.power || (o.locked && which !== 'control')) return;
    dispatch({ type: 'overlay', overlay: o.overlay === which ? null : which });
    if (which && o.overlay !== which)
      say(
        which === 'notifications'
          ? 'Notification centre'
          : which === 'control'
            ? 'Control centre'
            : 'Search',
      );
  };

  const openMenu = (button: Element) => {
    const id = button.getAttribute('data-icon');
    const tile = button.querySelector('[data-tile]');
    if (!id || !tile) return;
    shell.markDragged();
    navigator.vibrate?.(8);
    const b = shell.boxOf(tile);
    dispatch({ type: 'menu', menu: { app: id, x: b.cx, y: b.cy, w: b.w, h: b.h } });
    soon(() => screen.current?.querySelector<HTMLElement>('[role="menuitem"]'));
  };

  const go = (hit: Hit) => {
    dispatch({ type: 'overlay', overlay: null });
    openApp(hit.app, null, hit.path ? hit.path.split('>') : undefined);
  };

  const openNotice = (n: Notice) => {
    dispatch({ type: 'overlay', overlay: null });
    openApp(n.app, null, n.path ? [n.path] : undefined);
  };

  /* ---------------------------------------------------------------- quick actions */

  const runAct = async (a: Act) => {
    dispatch({ type: 'menu', menu: null });
    if (a.op === 'copy-email') {
      if (await copy(db.person.email)) toast('Email address copied');
    } else if (a.op === 'vcard') {
      save(vcardName, vcard(), 'text/vcard');
      toast('Contact card saved');
    } else if (a.go) openApp(a.go.app, null, a.go.stack);
  };

  const runSide = (key: SideKey) => {
    const o = osRef.current;
    if (key === 'home') return o.locked ? unlock() : goHome();
    if (key === 'switcher') return showSwitcher();
    if (key === 'notifications' || key === 'control') return overlay(key);
    if (key === 'search') {
      if (o.mode !== 'home') goHome();
      return overlay('search');
    }
    return o.power ? sleep() : wake();
  };

  /* ---------------------------------------------------------------- gestures */

  const onHomeDown = (e: React.PointerEvent) => {
    const o = osRef.current;
    if (e.button !== 0 || o.mode !== 'home' || o.locked || o.overlay || o.menu) return;
    const icon = (e.target as Element).closest('[data-icon]');
    // The dock and the page dots only take taps and long presses; pages swipe from anywhere else.
    const still = !!(e.target as Element).closest('[data-dock], [role="group"]');
    const x0 = -o.page * shell.W;
    const maxX = 0;
    const minX = -(PAGES.length - 1) * shell.W;
    const sheet = searchEl.current;
    let hold = icon ? window.setTimeout(() => openMenu(icon), 480) : 0;
    const stopHold = () => {
      window.clearTimeout(hold);
      hold = 0;
    };
    track(e, shell.scale(), {
      move: (d) => {
        if (Math.hypot(d.dx, d.dy) > 8) stopHold();
        if (still) return;
        if (d.axis === 'x') {
          shell.markDragged();
          let x = x0 + d.dx;
          if (x > maxX) x = maxX + rubber(x - maxX, shell.W);
          if (x < minX) x = minX + rubber(x - minX, shell.W);
          shell.pagesSet(x);
        } else if (d.axis === 'y' && d.dy > 0 && sheet) {
          shell.markDragged();
          sheet.dataset.pull = '';
          sheet.style.setProperty('--pull', String(Math.min(1, d.dy / 140)));
        }
      },
      end: (d) => {
        stopHold();
        if (still) return;
        if (d.axis === 'x') {
          const projected = x0 + d.dx + project(d.vx) * 0.6;
          const from = o.page;
          const target = Math.max(from - 1, Math.min(from + 1, Math.round(-projected / shell.W)));
          setPage(target, d.vx);
        } else if (d.axis === 'y' && sheet && 'pull' in sheet.dataset) {
          if (d.dy > 60 || d.vy > 400)
            flushSync(() => dispatch({ type: 'overlay', overlay: 'search' }));
          delete sheet.dataset.pull;
          sheet.style.removeProperty('--pull');
        }
      },
    });
  };

  const onHomeBarDown = (e: React.PointerEvent) => {
    const o = osRef.current;
    if (e.button !== 0 || o.locked || !o.power || o.overlay || o.menu) return;
    e.preventDefault();
    const id = o.mode === 'app' ? o.app : null;
    if (o.mode === 'switcher') return;
    let armed = false;
    let timer = 0;
    const { W, H, R } = shell;
    track(e, shell.scale(), {
      slop: 4,
      move: (d) => {
        shell.markDragged();
        const up = Math.max(0, -d.dy);
        window.clearTimeout(timer);
        // Pause partway up and the open apps are a release away.
        timer = window.setTimeout(() => {
          if (Math.max(0, -d.dy) > H * 0.08) {
            armed = true;
            screen.current?.setAttribute('data-armed', '');
          }
        }, 140);
        if (armed && d.still < 60 && Math.hypot(d.vx, d.vy) > 600) {
          armed = false;
          screen.current?.removeAttribute('data-armed');
        }
        if (!id) return;
        screen.current?.setAttribute('data-peek', '');
        const p = Math.min(1, up / (H * 0.85));
        const sc = 1 - 0.56 * (1 - (1 - p) * (1 - p));
        const w = W * sc;
        const h = H * sc;
        shell.place(
          id,
          {
            cx: W / 2 + d.dx * 0.85,
            cy: H - up - h / 2,
            w,
            h,
            r: R + (36 - R) * Math.min(1, p * 3),
            f: 0,
          },
          200,
        );
      },
      end: (d) => {
        window.clearTimeout(timer);
        screen.current?.removeAttribute('data-armed');
        screen.current?.removeAttribute('data-peek');
        const up = Math.max(0, -d.dy);
        const velocity = { cx: d.vx, cy: d.vy };
        if (!id) {
          if (up > 50 && (armed || d.still > 120)) showSwitcher();
          return;
        }
        if (up < 50 && Math.abs(d.dx) > 60 && o.recents.length > 1) {
          shell.move(id, shell.full(), SPRINGS.settle);
          switchApp(d.dx > 0 ? 1 : -1, d.vx);
        } else if (armed && Math.abs(d.vy) < 500) showSwitcher(velocity);
        else if (up > H * 0.16 || d.vy < -550) goHome(velocity);
        else shell.move(id, shell.full(), SPRINGS.settle, { velocity });
      },
    });
  };

  const onSwitcherDown = (e: React.PointerEvent) => {
    const o = osRef.current;
    if (e.button !== 0 || o.mode !== 'switcher') return;
    const card = (e.target as Element).closest('[data-card]')?.getAttribute('data-card') ?? null;
    const i = card ? o.recents.indexOf(card) : -1;
    const s0 = shell.scroll;
    const n = o.recents.length;
    track(e, shell.scale(), {
      move: (d) => {
        if (d.axis === 'x') {
          shell.markDragged();
          let sc = s0 + d.dx / shell.spacing;
          if (sc < 0) sc = rubber(sc, 1);
          if (sc > n - 1) sc = n - 1 + rubber(sc - (n - 1), 1);
          shell.setScroll(sc);
          shell.layoutCards(o.recents, true);
        } else if (d.axis === 'y' && card) {
          shell.markDragged();
          const b = shell.card(i);
          shell.place(card, { ...b, cy: b.cy + (d.dy < 0 ? d.dy : rubber(d.dy, shell.H) * 0.4) });
        }
      },
      end: (d) => {
        if (d.axis === 'x') {
          const target = Math.max(
            0,
            Math.min(n - 1, Math.round(s0 + (d.dx + project(d.vx) * 0.5) / shell.spacing)),
          );
          shell.setScroll(target);
          shell.layoutCards(o.recents, false, d.vx);
        } else if (d.axis === 'y' && card) {
          if (d.dy < -shell.H * 0.16 || d.vy < -700) killApp(card, Math.min(d.vy, -900));
          else shell.move(card, shell.card(i), SPRINGS.settle, { velocity: { cy: d.vy } });
        }
      },
    });
  };

  const onLockDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button, a')) return;
    track(e, shell.scale(), {
      slop: 6,
      move: (d) => {
        if (d.axis !== 'y') return;
        shell.markDragged();
        shell.lockSet(d.dy < 0 ? d.dy : rubber(d.dy, shell.H) * 0.3);
      },
      end: (d) => {
        if (d.axis !== 'y') return;
        if (d.dy < -shell.H * 0.2 || d.vy < -600) unlock(d.vy);
        else shell.lockTo(0, d.vy);
      },
    });
  };

  /** Pulling a centre down from the status bar. */
  const onPull = (e: React.PointerEvent, which: 'notifications' | 'control') => {
    const o = osRef.current;
    const el = which === 'notifications' ? ncEl.current : ccEl.current;
    if (
      e.button !== 0 ||
      !el ||
      !o.power ||
      o.overlay === which ||
      (o.locked && which === 'notifications')
    )
      return;
    track(e, shell.scale(), {
      slop: 4,
      move: (d) => {
        if (d.axis !== 'y' || d.dy <= 0) return;
        shell.markDragged();
        el.dataset.pull = '';
        el.style.setProperty('--pull', String(Math.min(1, d.dy / (shell.H * 0.42))));
      },
      end: (d) => {
        const pulled = 'pull' in el.dataset;
        if (pulled && (d.dy > 70 || d.vy > 500))
          flushSync(() => dispatch({ type: 'overlay', overlay: which }));
        delete el.dataset.pull;
        el.style.removeProperty('--pull');
      },
    });
  };

  /** Pushing a centre back up. */
  const onPush = (e: React.PointerEvent, el: HTMLElement | null) => {
    if (e.button !== 0 || !el || (e.target as Element).closest('button, a, input, label')) return;
    track(e, shell.scale(), {
      move: (d) => {
        if (d.axis !== 'y' || d.dy >= 0) return;
        shell.markDragged();
        el.dataset.pull = '';
        el.style.setProperty('--pull', String(Math.max(0, 1 + d.dy / (shell.H * 0.42))));
      },
      end: (d) => {
        const pulled = 'pull' in el.dataset;
        if ((pulled && (d.dy < -50 || d.vy < -500)) || !d.axis)
          flushSync(() => dispatch({ type: 'overlay', overlay: null }));
        delete el.dataset.pull;
        el.style.removeProperty('--pull');
      },
    });
  };

  const swallow = (e: React.MouseEvent) => {
    if (shell.takeDragged()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  /* ---------------------------------------------------------------- effects */

  // Size the phone to the stage, measure the screen, and keep every layer laid out on resize.
  useLayoutEffect(() => {
    const scr = screen.current;
    const dev = device.current;
    const stg = stage.current;
    if (!scr || !dev || !stg) return;
    shell.attach(scr);
    shell.bindLock(lockEl.current, desk.current);
    shell.bindPages(pagesEl.current);
    const phone = matchMedia(PHONE_MQ);
    const fit = () => {
      if (phone.matches) dev.style.removeProperty('--k');
      else {
        const k = Math.min(
          1,
          (stg.clientHeight - 8) / (DEVICE.h + DEVICE.bezel * 2),
          (stg.clientWidth - 8) / (DEVICE.w + DEVICE.bezel * 2),
        );
        dev.style.setProperty('--k', String(Math.max(0.5, k)));
      }
      shell.measure();
      const o = osRef.current;
      shell.pagesSet(-o.page * shell.W);
      shell.lockSet(o.locked ? 0 : -shell.H);
      if (o.mode === 'app' && o.app) shell.place(o.app, shell.full(), 200);
      if (o.mode === 'switcher') shell.layoutCards(o.recents, true);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stg);
    ro.observe(scr);
    return () => {
      ro.disconnect();
      shell.bindLock(null, null);
      shell.bindPages(null);
      shell.attach(null);
    };
  }, [shell]);

  // The clock, from the visitor's own device, ticking on the minute.
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const d = new Date();
      setClock(formatClock(d));
      timer = window.setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);
    };
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // The real battery, where the browser shares it.
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<EventTarget & { level: number; charging: boolean }>;
    };
    if (!nav.getBattery) return;
    let b: (EventTarget & { level: number; charging: boolean }) | null = null;
    let live = true;
    const read = () => b && live && setBattery({ level: b.level, charging: b.charging });
    nav
      .getBattery()
      .then((x) => {
        b = x;
        read();
        x.addEventListener('levelchange', read);
        x.addEventListener('chargingchange', read);
      })
      .catch(() => {});
    return () => {
      live = false;
      b?.removeEventListener('levelchange', read);
      b?.removeEventListener('chargingchange', read);
    };
  }, []);

  // A tip arrives a moment after the first unlock, unless Do Not Disturb is on.
  useEffect(() => {
    if (!os.unlockedOnce || tipShown.current) return;
    tipShown.current = true;
    const t = window.setTimeout(() => {
      if (!osRef.current.toggles.focus && !osRef.current.locked)
        dispatch({ type: 'banner', id: 'tip' });
    }, 1600);
    return () => window.clearTimeout(t);
  }, [os.unlockedOnce]);

  useEffect(() => {
    if (!os.toast) return;
    const t = window.setTimeout(() => dispatch({ type: 'toast', text: null }), 2400);
    return () => window.clearTimeout(t);
  }, [os.toast]);

  useEffect(() => {
    if (!os.banner) return;
    const t = window.setTimeout(() => dispatch({ type: 'banner', id: null }), 5500);
    return () => window.clearTimeout(t);
  }, [os.banner]);

  // Hardware keys and shortcuts. Handlers read live state through osRef.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      const o = osRef.current;
      const t = e.target as HTMLElement;
      const typing = !!t.closest?.('input, textarea, select, [contenteditable="true"]');
      const k = e.key;
      if (k === 'Escape') {
        if (!o.power || o.locked) return;
        e.preventDefault();
        if (o.overlay || o.menu) {
          const back = o.mode === 'app' && o.app ? o.app : null;
          dispatch(o.menu ? { type: 'menu', menu: null } : { type: 'overlay', overlay: null });
          soon(() =>
            back
              ? document.getElementById(`win-${back}`)
              : screen.current?.querySelector<HTMLElement>(`[data-page="${o.page}"] button`),
          );
        } else goHome();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'k' && !o.locked && o.power) {
        e.preventDefault();
        if (o.mode !== 'home') goHome();
        overlay('search');
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!o.power) {
        e.preventDefault();
        wake();
        return;
      }
      if (o.locked) {
        if ((k === ' ' || k === 'Enter' || k === 'ArrowUp') && !t.closest('button, a')) {
          e.preventDefault();
          unlock();
        } else if (k.toLowerCase() === 'l') sleep();
        else if (k.toLowerCase() === 'c') overlay('control');
        return;
      }
      const inside = !!t.closest?.('[role="radiogroup"], [role="menu"], [role="listbox"]');
      switch (k.toLowerCase()) {
        case 'h':
          goHome();
          break;
        case 's':
          showSwitcher();
          break;
        case 'n':
          overlay('notifications');
          break;
        case 'c':
          overlay('control');
          break;
        case '/':
          e.preventDefault();
          if (o.mode !== 'home') goHome();
          overlay('search');
          break;
        case 'l':
          sleep();
          break;
        case '[':
          switchApp(1);
          break;
        case ']':
          switchApp(-1);
          break;
        case 'arrowleft':
        case 'arrowright':
          if (o.mode === 'home' && !o.overlay && !o.menu && !inside) {
            e.preventDefault();
            setPage(o.page + (k === 'ArrowRight' ? 1 : -1));
          } else if (o.mode === 'switcher' && !inside) {
            e.preventDefault();
            const n = o.recents.length;
            const next = Math.max(
              0,
              Math.min(n - 1, Math.round(shell.scroll) + (k === 'ArrowLeft' ? 1 : -1)),
            );
            shell.setScroll(next);
            shell.layoutCards(o.recents);
            soon(() =>
              screen.current?.querySelector<HTMLElement>(`[data-card="${o.recents[next]}"]`),
            );
          }
          break;
        case 'backspace':
          if (o.mode === 'app' && o.app && (o.stacks[o.app]?.length ?? 1) > 1) {
            e.preventDefault();
            dispatch({ type: 'pop', app: o.app });
          }
          break;
      }
    };
  });

  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => keys.current(e);
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [active]);

  /* ---------------------------------------------------------------- render */

  const ctxFor = (id: string): AppCtx => ({
    id,
    path: top(os, id),
    depth: (os.stacks[id] ?? ['']).length,
    push: (path) => dispatch({ type: 'push', app: id, path }),
    pop: () => dispatch({ type: 'pop', app: id }),
    reset: (path) => dispatch({ type: 'reset', app: id, path }),
    open: (app, stack) => openApp(app, null, stack),
    home: () => goHome(),
    toast,
    os,
    dispatch,
    clock,
    read: onRead,
  });

  const body = (id: string) => {
    const ctx = ctxFor(id);
    switch (id) {
      case 'contacts':
        return <Contacts ctx={ctx} />;
      case 'mail':
        return <Mail ctx={ctx} />;
      case 'calendar':
        return <Calendar ctx={ctx} />;
      case 'files':
        return <Files ctx={ctx} />;
      case 'notes':
        return <Notes ctx={ctx} />;
      case 'code':
        return <Code ctx={ctx} />;
      case 'hardware':
        return <Hardware ctx={ctx} />;
      case 'projects':
        return <Projects ctx={ctx} />;
      case 'browser':
        return <Browser ctx={ctx} />;
      case 'settings':
        return <Settings ctx={ctx} />;
    }
    return APPS[id]?.product ? (
      <StoreApp ctx={ctx} product={APPS[id].product as db.ProductId} />
    ) : null;
  };

  const notices = NOTICES.filter((n) => !os.cleared.includes(n.id) && !os.muted.includes(n.app));
  const t = os.toggles;
  const tone = os.locked || os.mode !== 'app' || os.overlay ? 'light' : 'auto';
  const wall = WALLPAPERS[os.wallpaper];
  const menuActs: Act[] = os.menu
    ? [
        { label: `Open ${APPS[os.menu.app].name}`, icon: 'phone', go: { app: os.menu.app } },
        ...actionsFor(os.menu.app),
      ]
    : [];

  return (
    <div className={s.stage} style={SPRING_VARS} data-torch={t.torch || undefined}>
      <aside className={s.side} aria-label="About this phone">
        <p className={s.kicker}>
          {me.letter} · {me.name}
        </p>
        <h1 className={s.sideName}>{profile.name}</h1>
        <p className={s.sideRole}>
          {profile.role}, {profile.company}
        </p>
        <p className={s.sideLede}>
          {profile.headline}. A working phone with his work on it: unlock it, open the apps, swipe
          around.
        </p>
        <div className={s.sideButtons}>
          {SIDE.map(([label, icon, key, id]) => (
            <button key={id} type="button" onClick={() => runSide(id)}>
              <Icon name={icon} size={16} />
              <span>{id === 'power' && !os.power ? 'Wake' : label}</span>
              <kbd>{key}</kbd>
            </button>
          ))}
        </div>
        <details className={s.sideMore}>
          <summary>Gestures and keys</summary>
          <dl>
            {[...GESTURES.slice(0, 7), ...KEYS.slice(5, 8)].map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
        </details>
        <button type="button" className={s.readBtn} onClick={onRead}>
          <Icon name="page" size={16} /> Read as a page
        </button>
      </aside>

      <div className={s.deviceWrap} ref={stage}>
        <div className={s.device} ref={device}>
          <span className={s.torchBeam} aria-hidden="true" />
          <button
            type="button"
            className={s.power}
            aria-label={os.power ? 'Side button: lock' : 'Side button: wake'}
            onClick={() => (os.power ? sleep() : wake())}
          />
          <span className={s.volUp} aria-hidden="true" />
          <span className={s.volDown} aria-hidden="true" />
          <div
            ref={screen}
            className={s.screen}
            style={{ '--h': wall.hue, '--tx': os.text } as React.CSSProperties}
            data-mode={os.mode}
            data-locked={os.locked || undefined}
            data-overlay={os.overlay ?? undefined}
            data-still={reduced || undefined}
            role="application"
            onPointerDownCapture={() => shell.resetDragged()}
            aria-roledescription="phone"
            aria-label={`Phone, ${os.locked ? 'locked' : os.mode === 'app' && os.app ? APPS[os.app].name : os.mode === 'switcher' ? 'open apps' : 'home screen'}`}
          >
            <div ref={desk} className={s.desk}>
              <div className={s.wall} aria-hidden="true" />
              <Home
                os={os}
                clock={clock}
                pagesRef={pagesEl}
                onPointerDown={onHomeDown}
                onClickCapture={swallow}
                open={(id, from, stack) => openApp(id, from, stack)}
                menu={openMenu}
                page={(n) => setPage(n)}
                search={() => overlay('search')}
                rootRef={homeEl}
              />
              <div
                className={s.switchBack}
                onPointerDown={onSwitcherDown}
                onClick={(e) => !shell.takeDragged() && e.target === e.currentTarget && goHome()}
                aria-hidden="true"
              />
              <div className={s.windows} onPointerDown={onSwitcherDown}>
                {ORDER.filter((id) => os.recents.includes(id)).map((id) => (
                  <Win
                    key={id}
                    id={id}
                    shell={shell}
                    front={os.mode === 'app' && os.app === id && !os.locked && !os.overlay}
                    switcher={os.mode === 'switcher'}
                    clock={clock}
                    nav={os.nav[id]}
                    onOpen={() => !shell.takeDragged() && openApp(id)}
                    onKill={() => killApp(id)}
                  >
                    {body(id)}
                  </Win>
                ))}
              </div>
            </div>

            <div className={s.status} data-tone={tone}>
              <button
                type="button"
                className={s.statusLeft}
                aria-label="Notification centre"
                onPointerDown={(e) => onPull(e, 'notifications')}
                onClick={() => !shell.takeDragged() && overlay('notifications')}
              >
                {os.locked ? <Icon name="lock" size={13} /> : <time>{clock?.time}</time>}
              </button>
              <span className={s.island} aria-hidden="true" />
              <button
                type="button"
                className={s.statusRight}
                aria-label="Control centre"
                onPointerDown={(e) => onPull(e, 'control')}
                onClick={() => !shell.takeDragged() && overlay('control')}
              >
                {t.focus && <Icon name="moon" size={13} />}
                {t.airplane ? (
                  <Icon name="airplane" size={15} />
                ) : (
                  <Icon name="cellular" size={15} className={t.cellular ? undefined : s.dimIcon} />
                )}
                {t.wifi && <Icon name="wifi" size={15} />}
                <span
                  className={s.battery}
                  data-charging={battery?.charging || undefined}
                  aria-label={battery ? `Battery ${Math.round(battery.level * 100)}%` : 'Battery'}
                >
                  <i style={{ width: `${Math.round((battery?.level ?? 1) * 100)}%` }} />
                </span>
              </button>
            </div>

            <Lock
              os={os}
              clock={clock}
              lockRef={lockEl}
              onPointerDown={onLockDown}
              unlock={() => unlock()}
              swallow={() => shell.takeDragged()}
              notices={notices}
              scale={() => shell.scale()}
              openNotice={openNotice}
              clear={(ids) => dispatch({ type: 'clear', ids })}
              dispatch={dispatch}
            />

            <div
              ref={ncEl}
              className={s.nc}
              data-open={os.overlay === 'notifications' || undefined}
              inert={os.overlay !== 'notifications'}
              onPointerDown={(e) => onPush(e, ncEl.current)}
              onClickCapture={swallow}
            >
              <div className={s.ncHead}>
                <p className={s.ncTime}>{clock?.time}</p>
                <p className={s.ncDate}>{clock?.date}</p>
              </div>
              <div className={s.ncBody} data-notices>
                <Notices
                  notices={notices}
                  clock={clock}
                  scale={() => shell.scale()}
                  open={openNotice}
                  clear={(ids) => dispatch({ type: 'clear', ids })}
                  label="Notifications"
                />
                {notices.length > 0 && (
                  <button
                    type="button"
                    className={s.clearAll}
                    onClick={() => dispatch({ type: 'clear', ids: notices.map((n) => n.id) })}
                  >
                    Clear all
                  </button>
                )}
              </div>
              <span className={s.grabber} aria-hidden="true" />
            </div>

            <div
              ref={ccEl}
              className={s.ccLayer}
              data-open={os.overlay === 'control' || undefined}
              inert={os.overlay !== 'control'}
              onPointerDown={(e) => onPush(e, ccEl.current)}
              onClickCapture={swallow}
            >
              <Control os={os} dispatch={dispatch} lock={lockNow} read={onRead} />
            </div>

            <div
              ref={searchEl}
              className={s.searchLayer}
              data-open={os.overlay === 'search' || undefined}
              inert={os.overlay !== 'search'}
            >
              <Search
                open={os.overlay === 'search'}
                clock={clock}
                go={go}
                launch={(id) => openApp(id)}
                close={() => dispatch({ type: 'overlay', overlay: null })}
              />
            </div>

            {os.menu && (
              <div className={s.menuLayer} onClick={() => dispatch({ type: 'menu', menu: null })}>
                <span
                  className={s.menuIcon}
                  style={{
                    left: os.menu.x - os.menu.w / 2,
                    top: os.menu.y - os.menu.h / 2,
                    width: os.menu.w,
                    height: os.menu.h,
                  }}
                >
                  <AppIcon app={APPS[os.menu.app]} clock={clock} size={os.menu.w} />
                </span>
                <ul
                  role="menu"
                  aria-label={`${APPS[os.menu.app].name} quick actions`}
                  className={s.menu}
                  data-up={os.menu.y > shell.H * 0.55 || undefined}
                  style={{
                    left: Math.max(12, Math.min(os.menu.x - 120, shell.W - 252)),
                    top:
                      os.menu.y > shell.H * 0.55
                        ? os.menu.y - os.menu.h / 2 - 10
                        : os.menu.y + os.menu.h / 2 + 10,
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                    e.preventDefault();
                    const items = [
                      ...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
                    ];
                    const i = items.indexOf(document.activeElement as HTMLElement);
                    items[
                      (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                    ]?.focus();
                  }}
                >
                  {menuActs.map((a) => (
                    <li key={a.label} role="none">
                      {a.href ? (
                        <a
                          role="menuitem"
                          href={a.href}
                          target={a.href.startsWith('http') ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          onClick={() => dispatch({ type: 'menu', menu: null })}
                        >
                          <span>{a.label}</span>
                          <Icon name={a.icon} size={18} />
                        </a>
                      ) : (
                        <button type="button" role="menuitem" onClick={() => runAct(a)}>
                          <span>{a.label}</span>
                          <Icon name={a.icon} size={18} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {os.banner && !os.locked && (
              <div key={os.banner.n} className={s.banner} role="status">
                <button
                  type="button"
                  className={s.bannerHit}
                  onClick={() => {
                    dispatch({ type: 'banner', id: null });
                    openApp('settings', null, ['general', 'gestures']);
                  }}
                >
                  <AppIcon app={APPS.settings} clock={clock} size={38} />
                  <span>
                    <span className={s.noticeTop}>
                      <strong>Gestures</strong>
                      <time>now</time>
                    </span>
                    <span className={s.noticeBody}>
                      Swipe up from the bottom and pause to see open apps. Pull down from the top
                      right for controls.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={s.bannerX}
                  aria-label="Dismiss"
                  onClick={() => dispatch({ type: 'banner', id: null })}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}

            {os.toast && (
              <p key={os.toast.n} className={s.toast} role="status">
                {os.toast.text}
              </p>
            )}

            <button
              type="button"
              className={s.homeBar}
              aria-label={
                os.mode === 'app'
                  ? 'Home. Swipe up to go home, pause for open apps'
                  : 'Home indicator. Swipe up and pause for open apps'
              }
              onPointerDown={onHomeBarDown}
              onClick={() => !shell.takeDragged() && os.mode === 'app' && goHome()}
              hidden={os.locked || !!os.overlay}
            >
              <span />
            </button>

            <div
              className={s.dimmer}
              style={{ opacity: (1 - os.brightness) * 0.85 }}
              aria-hidden="true"
            />
            <div
              className={s.off}
              data-on={!os.power || undefined}
              aria-hidden={os.power}
              onClick={wake}
            >
              {!os.power && clock && <span className={s.aod}>{clock.time}</span>}
            </div>
          </div>
        </div>
      </div>

      <button type="button" className={s.readFab} onClick={onRead} aria-label="Read as a page">
        <Icon name="page" size={20} />
      </button>
      <p className={s.srOnly} aria-live="polite">
        {said}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- windows */

interface WinProps {
  id: string;
  shell: Shell;
  front: boolean;
  switcher: boolean;
  clock: Clock | null;
  nav?: 'push' | 'pop' | 'none';
  onOpen: () => void;
  onKill: () => void;
  children: React.ReactNode;
}

function Win({ id, shell, front, switcher, clock, nav, onOpen, onKill, children }: WinProps) {
  const el = useRef<HTMLElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const splash = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const app = APPS[id];

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    shell.register(id, node, label.current, splash.current, shadow.current);
    return () => shell.unregister(id, node);
  }, [id, shell]);

  return (
    <>
      <span ref={shadow} className={s.winShadow} aria-hidden="true" />
      <section
        ref={el}
        id={`win-${id}`}
        className={s.win}
        data-app={id}
        data-nav={nav}
        tabIndex={-1}
        aria-label={app.name}
      >
        <div className={s.winBody} inert={!front}>
          {children}
        </div>
        <div ref={splash} className={`${s.splash} ${s[`ic_${app.icon}`] ?? ''}`} aria-hidden="true">
          <AppIcon app={app} clock={clock} />
        </div>
        {switcher && (
          <button
            type="button"
            className={s.cover}
            data-card={id}
            aria-label={`${app.name}. Enter opens it, Delete closes it.`}
            onClick={onOpen}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'ArrowUp') {
                e.preventDefault();
                onKill();
              }
            }}
          />
        )}
      </section>
      <div ref={label} className={s.winLabel} aria-hidden="true">
        <AppIcon app={app} clock={clock} size={26} />
        <span>{app.name}</span>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- lock screen */

interface LockProps {
  os: OS;
  clock: Clock | null;
  lockRef: React.Ref<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent) => void;
  unlock: () => void;
  swallow: () => boolean;
  notices: Notice[];
  scale: () => number;
  openNotice: (n: Notice) => void;
  clear: (ids: string[]) => void;
  dispatch: React.Dispatch<Action>;
}

function Lock({
  os,
  clock,
  lockRef,
  onPointerDown,
  unlock,
  swallow,
  notices,
  scale,
  openNotice,
  clear,
  dispatch,
}: LockProps) {
  return (
    <div
      ref={lockRef}
      className={s.lock}
      data-on={os.locked || undefined}
      inert={!os.locked || !os.power}
      tabIndex={-1}
      aria-label="Lock screen. Swipe up, click, or press Space to unlock."
      onPointerDown={onPointerDown}
      onClick={(e) => {
        if (swallow() || (e.target as Element).closest('button, a')) return;
        unlock();
      }}
    >
      <div className={s.lockTop}>
        <span className={s.padlock} aria-hidden="true">
          <Icon name="lock" size={18} />
        </span>
        <p className={s.lockDate}>{clock?.date ?? ' '}</p>
        <p className={s.lockTime}>{clock?.time ?? ' '}</p>
        <p className={s.lockOwner}>
          {profile.name} · {current.title}, {current.company}
        </p>
      </div>
      <div className={s.lockNotices} data-notices>
        <Notices
          notices={notices}
          clock={clock}
          scale={scale}
          open={openNotice}
          clear={clear}
          label="Notifications on the lock screen"
        />
      </div>
      <div className={s.lockBottom}>
        <button
          type="button"
          className={s.lockBtn}
          aria-pressed={os.toggles.torch}
          aria-label="Torch"
          onClick={() => dispatch({ type: 'toggle', key: 'torch' })}
        >
          <Icon name="torch" size={22} />
        </button>
        <p className={s.unlockHint}>Swipe up to open</p>
        <button
          type="button"
          className={s.lockBtn}
          aria-pressed={os.toggles.focus}
          aria-label="Do Not Disturb"
          onClick={() => dispatch({ type: 'toggle', key: 'focus' })}
        >
          <Icon name="moon" size={20} />
        </button>
      </div>
      <span className={s.lockBar} aria-hidden="true" />
    </div>
  );
}
