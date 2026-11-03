'use client';

import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import { concept } from '../_shared/concepts';
import { db, hardware, profile } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import Boot from './Boot';
import Browser from './Browser';
import { createCube, type Cube } from './cube';
import Editor, { type Doc } from './Editor';
import Files from './Files';
import { HOME, PKGS, TRASH_PATH, USER, nodeAt, type FsNode } from './fs';
import { Icon, IconDefs, type IconName } from './icons';
import { lamp } from './lamp';
import Mail from './Mail';
import type { BarMenu, MenuItem } from './Menu';
import Mines from './Mines';
import Monitor from './Monitor';
import Packages from './Packages';
import { BottomPanel, BottomSkin, Pager, TopPanel, TopSkin, type Launcher } from './Panels';
import Saver from './Saver';
import { About, Ccsm, Run, type Fx } from './Settings';
import { run as runShell, type Effect } from './shell';
import Terminal from './Terminal';
import Window from './Window';
import {
  APPS,
  APP_IDS,
  WORKSPACES,
  initialState,
  onWorkspace,
  topOf,
  wmReducer,
  wrap,
  type AppId,
} from './wm';
import s from './desktop.module.scss';

const PHONE = '(max-width: 700px)';
const IDLE_MS = 120_000;
const BOOT_KEY = 'desktop-booted';
const credit = concept('year-of-linux');

const noop = () => () => {};
const readBooted = () => {
  try {
    return sessionStorage.getItem(BOOT_KEY) === '1';
  } catch {
    return false;
  }
};

type DeskIcon = { key: string; label: string; icon: IconName };
const DESK_ICONS: DeskIcon[] = [
  { key: 'computer', label: 'Computer', icon: 'computer' },
  { key: 'home', label: `${USER}’s Home`, icon: 'home' },
  { key: 'readme', label: 'README.txt', icon: 'editor' },
  { key: 'cv', label: 'resume.pdf', icon: 'pdf' },
  { key: 'trash', label: 'Trash', icon: 'trashFull' },
];

/** Where each face sits in Expo: a two-by-two wall. */
function expoLayout(W: number, H: number, bottom: number) {
  // The wall keeps clear of the theme switcher's corner at the bottom.
  const gap = 24,
    top = 28;
  const sc = Math.min((W - 3 * gap) / (2 * W), (H - top - bottom - gap) / (2 * H));
  const fw = W * sc,
    fh = H * sc;
  const x0 = (W - 2 * fw - gap) / 2,
    y0 = top + (H - top - bottom - 2 * fh - gap) / 2;
  return [0, 1, 2, 3].map((i) => {
    const cx = x0 + (i % 2) * (fw + gap) + fw / 2;
    const cy = y0 + Math.floor(i / 2) * (fh + gap) + fh / 2;
    return { tx: cx - W / 2, ty: cy - H / 2, sc };
  });
}

/** A window's content lives in a node of its own and is moved into whichever frame shows it. */
function Slot({ host }: { host: HTMLElement | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (host && ref.current && host.parentElement !== ref.current) ref.current.appendChild(host);
  });
  return <div ref={ref} className={s.slot} />;
}

export default function Desktop() {
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(wmReducer, undefined, () => initialState());
  const booted = useSyncExternalStore(noop, readBooted, () => false);
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const [boot, setBoot] = useState<'auto' | 'done' | 'grub' | 'gdm'>('auto');
  const [fxPatch, setFxPatch] = useState<Partial<Fx>>({});
  const [desk, setDesk] = useState<[number, number]>([1440, 852]);
  const [clock, setClock] = useState({ time: '', date: '', long: '' });
  const [expo, setExpo] = useState<false | 'in' | 'out'>(false);
  const [saver, setSaver] = useState(false);
  const [picked, setPicked] = useState(-1);
  const [docs, setDocs] = useState<Doc[]>(['readme']);
  const [docAt, setDocAt] = useState(0);
  const [nav, setNav] = useState<{ path: string[]; doc: string | null }>({
    path: [...HOME, 'Work'],
    doc: null,
  });
  const [inject, setInject] = useState<{ cmd: string; n: number } | null>(null);
  const [said, setSaid] = useState('');
  const [page, setPage] = useState('Shipped');
  const [hosts] = useState<Record<AppId, HTMLElement> | null>(() => {
    if (typeof document === 'undefined') return null;
    const make = () => {
      const host = document.createElement('div');
      host.className = s.host;
      return host;
    };
    return Object.fromEntries(APP_IDS.map((id) => [id, make()])) as unknown as Record<
      AppId,
      HTMLElement
    >;
  });

  const fx: Fx = {
    cube: !reduced,
    reflection: true,
    wobbly: !reduced,
    lamp: !reduced,
    expo: true,
    zoom: 0.6,
    speed: 1,
    ...fxPatch,
  };
  const showBoot = boot === 'auto' ? !booted && !reduced : boot !== 'done';

  const screen = useRef<HTMLDivElement>(null);
  const rig = useRef<HTMLDivElement>(null);
  const cubeEl = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const faces = useRef<HTMLElement[]>([]);
  const layer = useRef<HTMLDivElement>(null);
  const cube = useRef<Cube | null>(null);
  const fxRef = useRef(fx);
  const stateRef = useRef(state);
  const expoRef = useRef(expo);
  useLayoutEffect(() => {
    fxRef.current = fx;
    stateRef.current = state;
    expoRef.current = expo;
  });

  /* ---------- focus */

  const focusWin = (id: AppId | null) =>
    requestAnimationFrame(() => {
      const el = id ? document.getElementById(`win-${id}`) : null;
      (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el)?.focus({ preventScroll: true });
    });

  /* ---------- the cube */

  const land = (ws: number) => {
    const before = stateRef.current.ws;
    flushSync(() => dispatch({ type: 'workspace', ws }));
    setSaid(`Workspace ${ws + 1}: ${WORKSPACES[ws].name}, ${WORKSPACES[ws].about}`);
    // Focus follows to the new workspace unless it's on a panel (the pager, a menu).
    const active = document.activeElement;
    if (ws !== before && (!active || active === document.body || active.closest('[data-face]')))
      focusWin(topOf(stateRef.current.wins, ws));
  };
  const landRef = useRef(land);
  useEffect(() => {
    landRef.current = land;
  });

  useEffect(() => {
    const c = createCube(
      () =>
        screen.current && rig.current && cubeEl.current && cap.current
          ? {
              screen: screen.current,
              rig: rig.current,
              cube: cubeEl.current,
              cap: cap.current,
              faces: faces.current,
            }
          : null,
      () => fxRef.current,
      (ws) => landRef.current(ws),
    );
    cube.current = c;
    return () => c.destroy();
  }, []);

  // A switch made without the cube (Expo, or the cube switched off) still moves its front face.
  useEffect(() => {
    cube.current?.sync(state.ws);
  }, [state.ws]);

  const go = (ws: number) => {
    if (expoRef.current === 'in') leaveExpo(ws);
    else if (!expoRef.current) cube.current?.go(wrap(ws));
  };
  const step = (d: number, carry = false) => {
    if (expoRef.current) return;
    const st = stateRef.current;
    if (carry && st.focus && st.wins[st.focus].ws === st.ws && !APPS[st.focus].dialog)
      dispatch({ type: 'send', id: st.focus, ws: st.ws + d });
    cube.current?.step(d);
  };

  /* ---------- expo */

  const enterExpo = () => {
    if (!fxRef.current.expo || expoRef.current || cube.current?.busy || !screen.current) return;
    const { clientWidth: W, clientHeight: H } = screen.current;
    const room =
      parseFloat(getComputedStyle(screen.current).getPropertyValue('--switcher-room-y')) || 84;
    expoLayout(W, H, room).forEach((p, i) => {
      const f = faces.current[i];
      if (!f) return;
      f.style.setProperty('--ex', `${p.tx}px`);
      f.style.setProperty('--ey', `${p.ty}px`);
      f.style.setProperty('--es', String(p.sc));
    });
    setExpo('in');
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-expo-pick="${stateRef.current.ws}"]`)?.focus(),
    );
  };
  const leaveExpo = (ws: number) => {
    // The chosen face zooms back to full screen, then Expo ends.
    flushSync(() => {
      setExpo('out');
      dispatch({ type: 'workspace', ws });
    });
    window.setTimeout(() => setExpo((e) => (e === 'out' ? false : e)), 320);
    setSaid(`Workspace ${ws + 1}: ${WORKSPACES[ws].name}`);
    focusWin(topOf(stateRef.current.wins, ws));
  };

  /* ---------- desk size, clock, keys, idle */

  useEffect(() => {
    const measure = () => {
      const d = faces.current[0]?.querySelector<HTMLElement>(`.${s.desk}`);
      return d ? ([d.clientWidth, d.clientHeight] as [number, number]) : null;
    };
    const frame = requestAnimationFrame(() => {
      const size = measure();
      if (!size) return;
      setDesk(size);
      dispatch({ type: 'fit', vw: size[0], vh: size[1] });
    });
    const onResize = () => {
      const size = measure();
      if (!size) return;
      setDesk(size);
      dispatch({ type: 'clamp', vw: size[0], vh: size[1] });
    };
    addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock({
        time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        long: d.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      });
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (reduced || showBoot || saver) return;
    let timer = window.setTimeout(() => setSaver(true), IDLE_MS);
    const poke = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSaver(true), IDLE_MS);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'];
    events.forEach((t) => addEventListener(t, poke, { capture: true, passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((t) => removeEventListener(t, poke, { capture: true }));
    };
  }, [reduced, showBoot, saver]);

  /* ---------- turning the cube by hand: drag the wallpaper, Ctrl+Alt+drag anywhere, or swipe */

  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || expoRef.current) return;
      const t = e.target as HTMLElement;
      const ctrlAlt = e.ctrlKey && e.altKey;
      const wall = t.hasAttribute('data-wall');
      const touch = e.pointerType === 'touch';
      if (!ctrlAlt && !wall && !touch) return;
      if (ctrlAlt) {
        e.preventDefault();
        e.stopPropagation();
      }
      const sx = e.clientX,
        sy = e.clientY;
      let mode: 'wait' | 'cube' | 'swipe' = 'wait';
      let lastX = sx;
      const end = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', cancel);
      };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const dx = ev.clientX - sx,
          dy = ev.clientY - sy;
        lastX = ev.clientX;
        if (mode === 'wait') {
          const start = ctrlAlt
            ? Math.hypot(dx, dy) > 2
            : touch
              ? Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3
              : Math.hypot(dx, dy) > 5;
          if (touch && !start && Math.abs(dy) > 14) return end();
          if (!start) return;
          getSelection()?.removeAllRanges();
          mode = cube.current?.grab(sx, sy) ? 'cube' : 'swipe';
        }
        if (mode === 'cube') cube.current?.move(ev.clientX, ev.clientY);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        end();
        if (mode === 'cube') cube.current?.release();
        else if (mode === 'swipe' && Math.abs(lastX - sx) > 50) step(lastX < sx ? 1 : -1);
      };
      const cancel = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        end();
        if (mode === 'cube') cube.current?.release();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', cancel);
    };
    const onMenu = (e: MouseEvent) => {
      if (e.ctrlKey && e.altKey) e.preventDefault();
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('contextmenu', onMenu);
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('contextmenu', onMenu);
    };
    // The handlers read everything live through refs.
  }, []);

  /* ---------- windows */

  /** Opens (or raises) a window, turning the cube to its workspace; the File Browser can be given a folder. */
  const launch = (id: AppId, path?: string[], doc: string | null = null) => {
    if (path) setNav({ path, doc });
    const win = state.wins[id];
    const target = win.open ? win.ws : (APPS[id].home ?? state.ws);
    const open = { type: 'open', id, vw: desk[0], vh: desk[1] } as const;
    if (target !== state.ws) {
      dispatch(open);
      go(target);
    } else if (win.open && win.min && fx.lamp && !matchMedia(PHONE).matches) {
      flushSync(() => dispatch(open));
      restoreLamp(id);
    } else dispatch(open);
    focusWin(id);
  };

  const close = (id: AppId) => {
    const next = topOf(state.wins, state.ws, id);
    dispatch({ type: 'close', id });
    if (id === 'editor') {
      setDocs(['readme']);
      setDocAt(0);
    }
    if (id === 'browser') setPage('Shipped');
    focusWin(next);
  };

  const taskRect = (id: AppId) =>
    document.querySelector(`[data-task="${id}"]`)?.getBoundingClientRect();

  const minimize = (id: AppId) => {
    const el = document.getElementById(`win-${id}`);
    const target = taskRect(id);
    const next = topOf(state.wins, state.ws, id);
    if (fx.lamp && el && target && layer.current && !matchMedia(PHONE).matches) {
      el.style.visibility = 'hidden';
      lamp(el, layer.current, target, 'in').then(() => {
        dispatch({ type: 'minimize', id });
        el.style.visibility = '';
      });
    } else dispatch({ type: 'minimize', id });
    if (next) focusWin(next);
    else
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-task="${id}"]`)?.focus(),
      );
  };

  const restoreLamp = (id: AppId) => {
    const el = document.getElementById(`win-${id}`);
    const from = taskRect(id);
    if (!el || !from || !layer.current) return;
    el.style.visibility = 'hidden';
    lamp(el, layer.current, from, 'out', 380).then(() => (el.style.visibility = ''));
  };

  const onTask = (id: AppId) => {
    const win = state.wins[id];
    if (win.min) {
      flushSync(() => dispatch({ type: 'focus', id }));
      if (fx.lamp && !matchMedia(PHONE).matches) restoreLamp(id);
      focusWin(id);
    } else if (state.focus === id) minimize(id);
    else {
      dispatch({ type: 'focus', id });
      focusWin(id);
    }
  };

  const openFiles = (path: string[], doc: string | null = null) => launch('files', path, doc);

  const openDoc = (path: string[]) => {
    const at = docs.findIndex((d) => d !== 'readme' && d.join('/') === path.join('/'));
    if (path.join('/') === [...HOME, 'README.txt'].join('/')) setDocAt(0);
    else if (at >= 0) setDocAt(at);
    else {
      setDocs([...docs, path]);
      setDocAt(docs.length);
    }
    launch('editor');
  };

  const openNode = (n: FsNode, path?: string[]) => {
    if (n.app) launch(n.app);
    else if (n.href && n.kind !== 'text') window.open(n.href, '_blank', 'noopener,noreferrer');
    else if (path) openFiles(path.slice(0, -1), n.name);
  };

  const allOn = () =>
    setFxPatch({ ...fxPatch, cube: true, wobbly: true, lamp: true, expo: true, reflection: true });

  const onEffect = (e: Exclude<Effect, null | { clear: true }>) => {
    if ('exit' in e) close('terminal');
    else if ('href' in e) window.open(e.href, '_blank', 'noopener,noreferrer');
    else if ('compiz' in e) allOn();
    else if ('files' in e) {
      const n = nodeAt(e.files);
      if (n?.kind === 'dir') openFiles(e.files);
      else if (n) openFiles(e.files.slice(0, -1), n.kind === 'text' ? n.name : null);
    } else launch(e.app);
  };

  const runCommand = (cmd: string) => {
    const res = runShell(cmd, { cwd: HOME, history: [], size: [innerWidth, innerHeight] });
    if (res.effect && !('clear' in res.effect) && !('exit' in res.effect)) onEffect(res.effect);
    else {
      setInject({ cmd, n: (inject?.n ?? 0) + 1 });
      launch('terminal');
    }
  };

  const openIcon = (key: string) => {
    if (key === 'computer') launch('about');
    else if (key === 'home') openFiles(HOME);
    else if (key === 'readme') openDoc([...HOME, 'README.txt']);
    else if (key === 'cv') window.open(profile.cv, '_blank', 'noopener,noreferrer');
    else if (key === 'trash') openFiles(TRASH_PATH);
  };

  const bootDone = () => {
    try {
      sessionStorage.setItem(BOOT_KEY, '1');
    } catch {
      // Storage can be blocked; the boot just shows again next time.
    }
    setBoot('done');
    focusWin(topOf(state.wins, state.ws));
  };

  /* ---------- keys: Ctrl+Alt+arrows turn the cube, Ctrl+Alt+↑ is Expo, Alt+F1/F2/F4 as in GNOME */

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (showBoot || saver) return;
      const arrows: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
      if (e.ctrlKey && e.altKey && e.key in arrows) {
        e.preventDefault();
        step(arrows[e.key], e.shiftKey);
      } else if (e.ctrlKey && e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        if (expo === 'in') leaveExpo(state.ws);
        else if (!expo) enterExpo();
      } else if (expo === 'in' && e.key === 'Escape') {
        e.preventDefault();
        leaveExpo(state.ws);
      } else if (e.altKey && e.key === 'F1') {
        e.preventDefault();
        document.querySelector<HTMLElement>('[data-menu="Applications"]')?.click();
      } else if (e.altKey && e.key === 'F2') {
        e.preventDefault();
        launch('run');
      } else if (e.altKey && e.key === 'F4' && state.focus) {
        e.preventDefault();
        close(state.focus);
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  /* ---------- panels */

  const app = (id: AppId, label = APPS[id].name): MenuItem => ({
    label,
    icon: APPS[id].icon,
    onSelect: () => launch(id),
  });
  const place = (label: string, path: string[], icon: IconName = 'folder'): MenuItem => ({
    label,
    icon,
    onSelect: () => launch('files', path),
  });

  const menus: BarMenu[] = [
    {
      label: 'Applications',
      icon: 'cube',
      items: [
        { label: 'Accessories', icon: 'apps', sub: [app('terminal'), app('editor')] },
        { label: 'Games', icon: 'games', sub: [app('mines')] },
        { label: 'Internet', icon: 'browser', sub: [app('browser'), app('mail')] },
        {
          label: 'System Tools',
          icon: 'prefs',
          sub: [app('files'), app('monitor'), app('packages')],
        },
        { separator: true },
        { label: 'Run Application…', icon: 'run', hint: 'Alt+F2', onSelect: () => launch('run') },
      ],
    },
    {
      label: 'Places',
      items: [
        place('Home Folder', HOME, 'home'),
        place('Desktop', [...HOME, 'Desktop'], 'desktop'),
        place('Documents', [...HOME, 'Documents']),
        { separator: true },
        place('Work', [...HOME, 'Work']),
        place('Education', [...HOME, 'Education']),
        place('Awards', [...HOME, 'Awards']),
        place('Projects', [...HOME, 'Projects']),
        place('Patches', [...HOME, 'Patches']),
        { separator: true },
        place('Computer', [], 'computer'),
        {
          label: 'Network',
          icon: 'network',
          sub: [
            { label: profile.company, icon: 'browser', href: profile.companyUrl },
            { label: 'LinkedIn', icon: 'browser', href: profile.linkedin },
            { label: 'GitHub', icon: 'code', href: profile.github },
          ],
        },
        { separator: true },
        { label: 'resume.pdf', icon: 'pdf', href: profile.cv },
        place('Trash', TRASH_PATH, 'trash'),
      ],
    },
    {
      label: 'System',
      items: [
        {
          label: 'Preferences',
          icon: 'prefs',
          sub: [
            app('ccsm', 'CompizConfig Settings Manager'),
            { label: 'Screensaver', icon: 'screensaver', onSelect: () => setSaver(true) },
          ],
        },
        { label: 'Administration', icon: 'prefs', sub: [app('packages'), app('monitor')] },
        {
          label: 'Workspaces',
          icon: 'expo',
          sub: [
            ...WORKSPACES.map((w, i): MenuItem => ({
              label: `${i + 1} · ${w.name}`,
              checked: i === state.ws,
              onSelect: () => go(i),
            })),
            { separator: true },
            { label: 'Expo', hint: 'Ctrl+Alt+↑', disabled: !fx.expo, onSelect: enterExpo },
          ],
        },
        { separator: true },
        app('about', 'About This Computer'),
        { separator: true },
        { label: 'Lock Screen', icon: 'lock', onSelect: () => setSaver(true) },
        { label: `Log Out ${USER}…`, icon: 'logout', onSelect: () => setBoot('gdm') },
        { label: 'Restart…', icon: 'power', onSelect: () => setBoot('grub') },
      ],
    },
  ];

  const launchers: Launcher[] = [
    { label: 'Web Browser', icon: 'browser', onClick: () => launch('browser') },
    { label: 'Mail', icon: 'mail', onClick: () => launch('mail') },
    { label: 'Terminal', icon: 'terminal', onClick: () => launch('terminal') },
    {
      label: 'Expo: all workspaces (Ctrl+Alt+↑)',
      icon: 'expo',
      onClick: () => (expo === 'in' ? leaveExpo(state.ws) : enterExpo()),
    },
  ];

  const user: MenuItem[] = [
    app('about', 'About Me'),
    app('mail', 'Send Mail'),
    { separator: true },
    { label: 'Lock Screen', icon: 'lock', onSelect: () => setSaver(true) },
    { label: 'Log Out…', icon: 'logout', onSelect: () => setBoot('gdm') },
    { label: 'Restart…', icon: 'power', onSelect: () => setBoot('grub') },
  ];

  /* ---------- what each window holds */

  const title = (id: AppId) => {
    if (id === 'files')
      return `${nav.doc ?? (nav.path.length ? nav.path[nav.path.length - 1] : 'File System')} - File Browser`;
    if (id === 'browser') return `${page} - Web Browser`;
    if (id === 'editor') {
      const d = docs[docAt];
      return `${d === 'readme' || !d ? 'README.txt' : d[d.length - 1]} - Text Editor`;
    }
    return APPS[id].title;
  };

  const content = (id: AppId) => {
    switch (id) {
      case 'editor':
        return (
          <Editor
            docs={docs}
            active={docAt}
            onActivate={setDocAt}
            onCloseDoc={(i) => {
              setDocs(docs.filter((_, j) => j !== i));
              setDocAt(Math.min(docAt, docs.length - 2));
            }}
            onClose={() => close('editor')}
            onOpenFiles={() => openFiles(HOME)}
            onAbout={() => launch('about')}
          />
        );
      case 'terminal':
        return (
          <Terminal
            onEffect={onEffect}
            animate={!reduced}
            onClose={() => close('terminal')}
            inject={inject}
          />
        );
      case 'files':
        return (
          <Files
            path={nav.path}
            doc={nav.doc}
            onNavigate={(path, doc = null) => setNav({ path, doc })}
            onEdit={openDoc}
            onApp={(n) => openNode(n)}
            onClose={() => close('files')}
          />
        );
      case 'browser':
        return <Browser onMail={() => launch('mail')} onTitle={setPage} />;
      case 'mail':
        return <Mail />;
      case 'monitor':
        return <Monitor />;
      case 'packages':
        return <Packages animate={!reduced} />;
      case 'mines':
        return (
          <Mines
            onClose={() => close('mines')}
            active={!state.wins.mines.min && state.wins.mines.ws === state.ws}
          />
        );
      case 'ccsm':
        return <Ccsm fx={fx} setFx={(p) => setFxPatch({ ...fxPatch, ...p })} reduced={reduced} />;
      case 'about':
        return <About onClose={() => close('about')} onMail={() => launch('mail')} />;
      case 'run':
        return <Run onRun={runCommand} onClose={() => close('run')} />;
    }
  };

  const devices = hardware.map((d) => `${d.name}: ${d.figures[0]}`).join(' · ');
  const here = onWorkspace(state, state.ws);

  return (
    <div className={s.root}>
      <IconDefs />
      <h1 className={s.srOnly}>
        {profile.name}, {profile.role}, {profile.company}: a Linux desktop of his work, with GNOME 2
        and Compiz
      </h1>
      <p className={s.srOnly} aria-live="polite">
        {said}
      </p>

      <TopPanel
        menus={menus}
        launchers={launchers}
        clock={{ time: clock.time, date: clock.date }}
        updates={PKGS.length}
        onUpdates={() => launch('packages')}
        devices={devices}
        onDevices={() => launch('monitor')}
        user={user}
      />

      <nav className={s.phoneBar} aria-label="Workspaces and windows">
        <Pager state={state} desk={desk} current={state.ws} onPick={go} />
        <div
          className={s.phoneTabs}
          role="tablist"
          aria-label={`Windows on ${WORKSPACES[state.ws].name}`}
        >
          {here.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={state.focus === id}
              className={state.focus === id ? s.phoneTabOn : undefined}
              onClick={() => {
                // A tab only ever brings its window forward; phones don't minimise.
                dispatch({ type: 'focus', id });
                focusWin(id);
              }}
            >
              <Icon name={APPS[id].icon} size={16} />
              {APPS[id].name}
            </button>
          ))}
        </div>
      </nav>

      <div ref={screen} className={s.screen} data-expo={expo || undefined}>
        <div ref={rig} className={s.rig}>
          <div ref={cubeEl} className={s.cube}>
            {WORKSPACES.map((w, i) => {
              const current = i === state.ws;
              const top = topOf(state.wins, i);
              return (
                <section
                  key={w.name}
                  ref={(el) => {
                    if (el) faces.current[i] = el;
                  }}
                  data-face={i}
                  className={`${s.face} ${current ? s.current : ''}`}
                  aria-label={`Workspace ${i + 1}: ${w.name}`}
                  aria-hidden={!current && !expo ? true : undefined}
                >
                  <TopSkin clock={`${clock.date} ${clock.time}`} launchers={launchers} />
                  <div className={s.desk} data-wall inert={!current || !!expo}>
                    <ul className={s.deskIcons} aria-label="Desktop">
                      {DESK_ICONS.map((d, k) => (
                        <li key={d.key}>
                          <button
                            type="button"
                            data-icon={k}
                            tabIndex={k === Math.max(0, picked) ? 0 : -1}
                            className={`${s.deskIcon} ${picked === k ? s.deskPicked : ''}`}
                            onClick={(e) =>
                              e.detail === 0 || matchMedia('(pointer: coarse)').matches
                                ? openIcon(d.key)
                                : setPicked(k)
                            }
                            onDoubleClick={() => openIcon(d.key)}
                            onFocus={() => setPicked(k)}
                            onKeyDown={(e) => {
                              const n = { ArrowDown: 1, ArrowUp: -1 }[e.key];
                              if (!n || e.ctrlKey) return;
                              e.preventDefault();
                              const next = (k + n + DESK_ICONS.length) % DESK_ICONS.length;
                              faces.current[i]
                                ?.querySelector<HTMLElement>(`[data-icon="${next}"]`)
                                ?.focus();
                            }}
                          >
                            <Icon name={d.icon} size={48} />
                            <span>{d.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className={s.wallMark} aria-hidden="true">
                      <b>{db.person.site}</b>
                      <span>
                        {credit.name} · {w.name}
                      </span>
                    </p>
                    {APP_IDS.filter((id) => state.wins[id].open && state.wins[id].ws === i).map(
                      (id) => (
                        <Window
                          key={id}
                          id={id}
                          win={state.wins[id]}
                          focused={state.focus === id && current}
                          top={top === id}
                          title={title(id)}
                          dispatch={dispatch}
                          onClose={() => close(id)}
                          onMinimize={() => minimize(id)}
                          onMaximize={() => dispatch({ type: 'maximize', id })}
                          onSend={(ws) => {
                            dispatch({ type: 'send', id, ws });
                            go(ws);
                          }}
                          wobbly={() => fxRef.current.wobbly}
                        >
                          <Slot host={hosts?.[id]} />
                        </Window>
                      ),
                    )}
                  </div>
                  <BottomSkin state={state} desk={desk} ws={i} />
                  {expo === 'in' && (
                    <button
                      type="button"
                      className={s.expoPick}
                      data-expo-pick={i}
                      aria-label={`Go to workspace ${i + 1}: ${w.name}, ${w.about}`}
                      onClick={() => leaveExpo(i)}
                    >
                      <span>
                        {i + 1} · {w.name}
                      </span>
                    </button>
                  )}
                </section>
              );
            })}
            <div ref={cap} className={s.cap} aria-hidden="true">
              <span>{db.person.site}</span>
            </div>
          </div>
        </div>
      </div>

      <BottomPanel
        state={state}
        desk={desk}
        onTask={onTask}
        onShowDesktop={() => dispatch({ type: 'showDesktop' })}
        onPick={go}
        onTrash={() => openFiles(TRASH_PATH)}
      />

      <div ref={layer} className={s.fxLayer} aria-hidden="true" />

      {mounted &&
        hosts &&
        APP_IDS.filter((id) => state.wins[id].open).map((id) =>
          createPortal(content(id), hosts[id], id),
        )}

      {saver && <Saver still={reduced} onExit={() => setSaver(false)} />}
      {showBoot && <Boot key={boot} from={boot === 'gdm' ? 'gdm' : 'grub'} onDone={bootDone} />}
    </div>
  );
}
