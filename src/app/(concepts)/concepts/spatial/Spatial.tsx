'use client';

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { concept } from '../_shared/concepts';
import { profile } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import { readChoice, subscribeScheme, writeScheme } from '../_shared/scheme';
import { About, Contact, Experience, Hardware, OpenSource, Projects, Roots } from './Apps';
import Home, { type HomeApp } from './Home';
import { Icon, type IconName } from './icons';
import Immersive from './Immersive';
import Reader from './Reader';
import Room, { FloorMark, TEXEL } from './Room';
import {
  IDS,
  PHONE,
  PITCH_MAX,
  R_MAX,
  R_MIN,
  WINS,
  YAW_MAX,
  clamp,
  defaultLayout,
  dynamicScale,
  focal,
  layoutReducer,
  loadLayout,
  newCamera,
  poseOf,
  saveLayout,
  screenToDir,
  uiScale,
  viewTransform,
  wrapDeg,
  type Placement,
  type Pose,
  type WinId,
} from './space';
import type { Grip, Manager } from './Window';
import s from './spatial.module.scss';

const credit = concept('spatial');
const TIPS_KEY = 'spatial-tips-seen';
const DEG = 180 / Math.PI;

type Mode = 'space' | 'home' | 'immersive';

const APP_LOOK: Record<WinId, { icon: IconName; tint: [string, string] }> = {
  about: { icon: 'person', tint: ['#7aa2ff', '#3d63e0'] },
  experience: { icon: 'briefcase', tint: ['#ffb36b', '#f0703a'] },
  projects: { icon: 'grid', tint: ['#c3a6ff', '#7d55e6'] },
  hardware: { icon: 'cpu', tint: ['#6fe0c0', '#1e9e86'] },
  oss: { icon: 'branch', tint: ['#9aa3b5', '#4a5263'] },
  roots: { icon: 'leaf', tint: ['#a8e06f', '#4e9e33'] },
  contact: { icon: 'envelope', tint: ['#6fd0ff', '#2689d9'] },
};

const ENV_NAME = { light: 'Day', dark: 'Evening' } as const;

const isPhone = () => matchMedia(PHONE).matches;

/** Shortcuts, as the sheet lists them. */
const KEYS: [string, string][] = [
  ['H', 'Home: your apps, people and environments'],
  ['1 – 7', 'Bring a window in front of you'],
  ['R', 'Recenter everything around you'],
  ['I', 'Open the hardware in your space'],
  ['P', 'Read everything as a page'],
  ['← → ↑ ↓', 'Look around (hold Alt inside a window)'],
  ['Drag the room', 'Look around; flick it to keep turning'],
  ['Drag a window bar', 'Move it; scroll while dragging to push it back or pull it in'],
  ['Window bar + arrows', 'Move it; Page Up and Page Down change its distance'],
  ['Corner + arrows', 'Resize'],
  ['Esc', 'Close Home, the controls or the immersive space'],
  ['?', 'This list'],
];

function CcButton({
  label,
  icon,
  kbd,
  active,
  onPick,
  done,
}: {
  label: string;
  icon: IconName;
  kbd?: string;
  active?: boolean;
  onPick: () => void;
  done: () => void;
}) {
  return (
    <button
      type="button"
      className={`${s.ccItem} ${s.gz}`}
      data-active={active || undefined}
      onClick={() => {
        done();
        onPick();
      }}
    >
      <span className={s.ccIcon}>
        <Icon name={icon} size={20} />
      </span>
      <span>{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
}

export default function Spatial() {
  const reduced = useReducedMotion();
  const choice = useSyncExternalStore(subscribeScheme, readChoice, () => null);
  const [layout, dispatch] = useReducer(layoutReducer, undefined, defaultLayout);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const [mode, setMode] = useState<Mode>('space');
  const [homeYaw, setHomeYaw] = useState(0);
  const [labYaw, setLabYaw] = useState(0);
  const [reader, setReader] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [cc, setCc] = useState(false);
  const [tips, setTips] = useState(false);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const [lens, setLens] = useState<{ P: number; k: number; phone: boolean } | null>(null);
  const [dragging, setDragging] = useState<WinId | null>(null);
  const [motion, setMotion] = useState<'off' | 'on'>('off');
  const [current, setCurrent] = useState(0);
  const [clock, setClock] = useState('');

  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const roomEl = useRef<HTMLDivElement>(null);
  const spaceEl = useRef<HTMLDivElement>(null);
  const homeEl = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const sheetEl = useRef<HTMLDialogElement>(null);
  const cam = useRef(newCamera());
  const pose = useRef<Pose>({ yaw: 0, pitch: 0, x: 0, y: 0 });
  const lensRef = useRef({ P: 1224, k: 1, phone: false });
  const layoutRef = useRef(layout);
  const modeRef = useRef(mode);
  const reducedRef = useRef(reduced);
  const intro = useRef<{ from: number; t0: number; dur: number } | null>(null);
  const input = useRef<'pointer' | 'key'>('pointer');
  const toastTimer = useRef(0);
  const tilt = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  useEffect(() => {
    layoutRef.current = layout;
    modeRef.current = mode;
    reducedRef.current = reduced;
  });

  const say = (text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast((t) => ({ text, n: (t?.n ?? 0) + 1 }));
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  /* ---------- the lens, the saved layout, and a first look around */

  useEffect(() => {
    const measure = () => {
      const W = innerWidth,
        H = innerHeight;
      const next = { P: focal(W, H), k: uiScale(W, H), phone: isPhone() };
      lensRef.current = next;
      setLens(next);
    };
    let settle = 0;
    const frame = requestAnimationFrame(() => {
      measure();
      const saved = loadLayout();
      if (saved) dispatch({ type: 'load', layout: saved });
      let seen = false;
      try {
        seen = !!localStorage.getItem(TIPS_KEY);
      } catch {
        // Storage blocked: show the tips this once.
      }
      setTips(!seen);
      if (!saved && !reducedRef.current && !isPhone()) {
        // Arrive looking a little to one side, then settle on the first window.
        cam.current.yaw = cam.current.tYaw = -30;
        intro.current = { from: -30, t0: performance.now() + 250, dur: 2100 };
      }
      setReady(true);
      settle = window.setTimeout(() => setSettled(true), 2600);
    });
    addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      removeEventListener('resize', measure);
    };
  }, []);

  // Keep the arrangement for next time.
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => saveLayout(layout), 300);
    return () => window.clearTimeout(t);
  }, [layout, ready]);

  // Motion stops listening when the page goes.
  useEffect(
    () => () => {
      if (tilt.current) removeEventListener('deviceorientation', tilt.current);
      window.clearTimeout(toastTimer.current);
    },
    [],
  );

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  /* ---------- the frame: ease the head, then write one transform per layer */

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let prev = '';
    let parts: { el: HTMLElement; id: WinId; base: number }[] | null = null;
    const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = cam.current;
      const still = reducedRef.current;
      const { P, phone } = lensRef.current;

      const tw = intro.current;
      if (tw) {
        const p = clamp((now - tw.t0) / tw.dur, 0, 1);
        c.yaw = c.tYaw = tw.from * (1 - ease(p));
        if (p >= 1) intro.current = null;
      } else {
        if (!c.hold && !still && (Math.abs(c.vYaw) > 0.05 || Math.abs(c.vPitch) > 0.05)) {
          c.tYaw += c.vYaw * dt;
          c.tPitch += c.vPitch * dt;
          const damp = Math.exp(-dt * 4.2);
          c.vYaw *= damp;
          c.vPitch *= damp;
        } else if (!c.hold) c.vYaw = c.vPitch = 0;
        c.tYaw = clamp(c.tYaw, -YAW_MAX, YAW_MAX);
        c.tPitch = clamp(c.tPitch, -PITCH_MAX, PITCH_MAX);
        const k = still ? 1 : 1 - Math.exp(-dt * 7);
        c.yaw += (c.tYaw - c.yaw) * k;
        c.pitch += (c.tPitch - c.pitch) * k;
      }
      if (!c.hold) {
        const k = still ? 1 : 1 - Math.exp(-dt * 3.2);
        const tx = still || phone ? 0 : c.tlx,
          ty = still || phone ? 0 : c.tly;
        c.lx += (tx - c.lx) * k;
        c.ly += (ty - c.ly) * k;
      }

      const p = poseOf(c);
      if (still) {
        p.x = p.y = 0;
      }
      pose.current = p;
      // Nearer windows draw over farther ones, and a window well behind you isn't drawn at all.
      const L = layoutRef.current;
      const order = [...IDS].sort((a, b) => L[b].r - L[a].r);
      const behind = IDS.filter((id) => Math.abs(wrapDeg(L[id].az - p.yaw)) > 118);
      const key = `${p.yaw.toFixed(3)}|${p.pitch.toFixed(3)}|${p.x.toFixed(4)}|${p.y.toFixed(4)}|${P}|${phone}|${order.join()}|${behind.join()}`;
      if (key === prev) return;
      prev = key;
      if (roomEl.current)
        roomEl.current.style.transform = viewTransform(
          phone ? { ...p, pitch: p.pitch - 3 } : p,
          TEXEL,
        );
      if (homeEl.current) homeEl.current.style.transform = phone ? '' : viewTransform(p, P);
      // Each part of each window takes the view on its own (see .part in the stylesheet).
      if (!parts && spaceEl.current) {
        parts = [...spaceEl.current.querySelectorAll<HTMLElement>('[data-part]')].map((el) => ({
          el,
          id: (el.closest('[data-win]') as HTMLElement).dataset.win as WinId,
          base: el.dataset.part === 'panel' ? 0 : 1,
        }));
      }
      const view = viewTransform(p, P);
      parts?.forEach(({ el, id, base }) => {
        if (phone) {
          el.style.removeProperty('--sp-view');
          el.style.zIndex = '';
          el.style.visibility = '';
          return;
        }
        el.style.setProperty('--sp-view', view);
        el.style.zIndex = String(10 + order.indexOf(id) * 4 + base);
        el.style.visibility = behind.includes(id) ? 'hidden' : '';
      });
      // The glass edges catch the light from the window as you turn.
      spaceEl.current?.querySelectorAll<HTMLElement>('[data-rim]').forEach((rim) => {
        const id = rim.dataset.rim as WinId;
        const az = layoutRef.current[id]?.az ?? 0;
        rim.style.setProperty('--a', `${(132 + wrapDeg(p.yaw - az) * 1.5).toFixed(1)}deg`);
        rim.style.setProperty('--sheen', `${(50 + wrapDeg(p.yaw - az) * 1.8).toFixed(1)}%`);
      });
    };
    raf = requestAnimationFrame(tick);
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /* ---------- the pointer: head movement, gaze highlights and the pinch cursor */

  useEffect(() => {
    const gaze = `.${s.gz}`;
    let over: Element | null = null;
    const onMove = (e: PointerEvent) => {
      const c = cam.current;
      if (e.pointerType !== 'touch') {
        c.tlx = clamp((e.clientX / innerWidth) * 2 - 1, -1, 1);
        c.tly = clamp((e.clientY / innerHeight) * 2 - 1, -1, 1);
        if (root.current && root.current.dataset.pointer !== 'fine')
          root.current.dataset.pointer = 'fine';
        const dot = cursor.current;
        if (dot) dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }
      const t = e.target as HTMLElement;
      const g = t.closest?.(gaze) as HTMLElement | null;
      if (g && t === g) {
        g.style.setProperty('--gx', `${e.offsetX}px`);
        g.style.setProperty('--gy', `${e.offsetY}px`);
      }
      const hit = g ?? t.closest?.('a, button, summary, input, [role="tab"]') ?? null;
      if (hit !== over) {
        over = hit;
        if (cursor.current) cursor.current.dataset.over = hit ? '1' : '';
      }
    };
    const onLeave = () => {
      cam.current.tlx = cam.current.tly = 0;
      if (cursor.current) cursor.current.dataset.away = '1';
    };
    const onEnter = () => {
      if (cursor.current) cursor.current.dataset.away = '';
    };
    const onDown = (e: PointerEvent) => {
      input.current = 'pointer';
      if (e.pointerType === 'touch' && root.current) root.current.dataset.pointer = 'coarse';
      cursor.current?.setAttribute('data-pinch', '1');
    };
    const onUp = () => cursor.current?.setAttribute('data-pinch', '');
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true, capture: true });
    addEventListener('pointerup', onUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.documentElement.addEventListener('pointerenter', onEnter);
    return () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown, { capture: true });
      removeEventListener('pointerup', onUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.documentElement.removeEventListener('pointerenter', onEnter);
    };
  }, []);

  /* ---------- turning your head: drag or scroll the room */

  const look = (dx: number, dy: number) => {
    const c = cam.current;
    const P = lensRef.current.P;
    c.tYaw = c.yaw = clamp(c.yaw - (dx / P) * DEG, -YAW_MAX, YAW_MAX);
    c.tPitch = c.pitch = clamp(c.pitch + (dy / P) * DEG, -PITCH_MAX, PITCH_MAX);
  };

  const onStageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || lensRef.current.phone) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-win] > *, button, a, input, summary, [role="tablist"]')) return;
    if (modeRef.current === 'immersive') return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const c = cam.current;
    intro.current = null;
    c.hold = true;
    c.vYaw = c.vPitch = 0;
    let x = e.clientX,
      y = e.clientY,
      t0 = performance.now(),
      moved = 0;
    let vx = 0,
      vy = 0;
    root.current?.setAttribute('data-looking', '');
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - x,
        dy = ev.clientY - y;
      const now = performance.now();
      const dt = Math.max(8, now - t0) / 1000;
      moved += Math.abs(dx) + Math.abs(dy);
      look(dx, dy);
      const P = lensRef.current.P;
      vx = vx * 0.6 + ((-(dx / P) * DEG) / dt) * 0.4;
      vy = vy * 0.6 + (((dy / P) * DEG) / dt) * 0.4;
      x = ev.clientX;
      y = ev.clientY;
      t0 = now;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      root.current?.removeAttribute('data-looking');
      c.hold = false;
      if (performance.now() - t0 < 60 && !reducedRef.current) {
        c.vYaw = clamp(vx, -160, 160);
        c.vPitch = clamp(vy, -60, 60);
      }
      // A tap on the room while Home is up puts Home away.
      if (moved < 4 && modeRef.current === 'home') setMode('space');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (lensRef.current.phone || modeRef.current === 'immersive') return;
      if ((e.target as HTMLElement).closest('[data-win] > *')) return;
      e.preventDefault();
      intro.current = null;
      const c = cam.current;
      c.tYaw = clamp(c.tYaw + (e.deltaX + e.deltaY) * 0.05, -YAW_MAX, YAW_MAX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* ---------- the window manager */

  const [wm] = useState<Manager>(() => ({
    grab: (id: WinId, grip: Grip, e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || lensRef.current.phone) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const c = cam.current;
      c.hold = true;
      intro.current = null;
      const p0 = poseOf(c);
      const { P, k } = lensRef.current;
      const W = innerWidth,
        H = innerHeight;
      const start = layoutRef.current[id];
      const d0 = screenToDir(e.clientX - W / 2, e.clientY - H / 2, P, p0);
      let r = start.r;
      let pending: Partial<Placement> | null = null;
      let raf = 0;
      const flush = () => {
        raf = 0;
        if (pending) dispatch({ type: 'place', id, ...pending });
        pending = null;
      };
      const push = (a: Partial<Placement>) => {
        pending = { ...pending, ...a };
        if (!raf) raf = requestAnimationFrame(flush);
      };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        if (grip === 'move') {
          const d = screenToDir(ev.clientX - W / 2, ev.clientY - H / 2, P, p0);
          push({ az: start.az + wrapDeg(d.az - d0.az), el: start.el + (d.el - d0.el), r });
        } else {
          // Pointer travel at the window's distance, in the window's own pixels.
          const f = start.r / (dynamicScale(start.r) * k);
          const dx = (ev.clientX - e.clientX) * f,
            dy = (ev.clientY - e.clientY) * f;
          push({ w: start.w + (grip === 'right' ? 2 : -2) * dx, h: start.h + 2 * dy });
        }
      };
      const wheel = (ev: WheelEvent) => {
        ev.preventDefault();
        if (grip !== 'move') return;
        r = clamp(r * Math.exp(ev.deltaY * 0.0012), R_MIN, R_MAX);
        push({ r });
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        removeEventListener('wheel', wheel);
        cancelAnimationFrame(raf);
        flush();
        c.hold = false;
        setDragging(null);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      addEventListener('wheel', wheel, { passive: false });
      setDragging(id);
    },
    nudge: (id, grip, e) => {
      const p = layoutRef.current[id];
      const big = e.shiftKey;
      let a: Partial<Placement> | null = null;
      if (grip === 'move') {
        if (e.key === 'ArrowLeft') a = { az: p.az - (big ? 10 : 3) };
        else if (e.key === 'ArrowRight') a = { az: p.az + (big ? 10 : 3) };
        else if (e.key === 'ArrowUp') a = { el: p.el + (big ? 6 : 2) };
        else if (e.key === 'ArrowDown') a = { el: p.el - (big ? 6 : 2) };
        else if (e.key === 'PageUp') a = { r: p.r / 1.12 };
        else if (e.key === 'PageDown') a = { r: p.r * 1.12 };
      } else {
        const step = big ? 60 : 20;
        const sx = grip === 'right' ? 1 : -1;
        if (e.key === 'ArrowLeft') a = { w: p.w - step * sx };
        else if (e.key === 'ArrowRight') a = { w: p.w + step * sx };
        else if (e.key === 'ArrowUp') a = { h: p.h - step };
        else if (e.key === 'ArrowDown') a = { h: p.h + step };
      }
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: 'place', id, ...a });
      if (a.az !== undefined) cam.current.tYaw = clamp(a.az, -YAW_MAX, YAW_MAX);
    },
    close: (id) => {
      dispatch({ type: 'close', id });
      const next = IDS.find((w) => w !== id && layoutRef.current[w].open);
      requestAnimationFrame(() =>
        (next
          ? document.querySelector<HTMLElement>(`#win-${next} [data-scroll]`)
          : root.current
        )?.focus({ preventScroll: true }),
      );
    },
  }));

  /** On a phone, slides the carousel to a window. */
  const showCard = (i: number) => {
    const card = spaceEl.current?.querySelectorAll<HTMLElement>('[data-win]')[i];
    card?.scrollIntoView({
      behavior: reducedRef.current ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  };

  /** Brings a window in front of you, opening it if it was closed. */
  const summon = (id: WinId) => {
    setMode('space');
    if (lensRef.current.phone) {
      showCard(IDS.indexOf(id));
      return;
    }
    const p = pose.current;
    intro.current = null;
    dispatch({ type: 'open', id, az: p.yaw, el: clamp(p.pitch, -8, 12) });
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(`#win-${id} [data-scroll]`)
          ?.focus({ preventScroll: true }),
      60,
    );
  };

  const recenter = () => {
    intro.current = null;
    dispatch({ type: 'recenter' });
    const c = cam.current;
    c.tYaw = c.tPitch = c.vYaw = c.vPitch = 0;
    setMode('space');
    say('Recentered');
  };

  const toggleHome = () => {
    if (modeRef.current === 'home') return setMode('space');
    setHomeYaw(Math.round(cam.current.tYaw));
    setMode('home');
    setCc(false);
    window.setTimeout(
      () => document.querySelector<HTMLElement>('[data-home-app]')?.focus({ preventScroll: true }),
      80,
    );
  };

  const enterLab = () => {
    setLabYaw(lensRef.current.phone ? 0 : Math.round(cam.current.tYaw));
    setMode('immersive');
    setCc(false);
  };

  const cycleEnv = () => {
    const next = choice === null ? 'light' : choice === 'light' ? 'dark' : null;
    writeScheme(next);
    say(next ? `${ENV_NAME[next]} room` : 'Room follows your system');
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => say('Email copied'),
      () => say(text),
    );
  };

  const enableMotion = async () => {
    const D = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
      }
    ).DeviceOrientationEvent;
    if (!D) return say('This device has no motion sensors');
    try {
      if (D.requestPermission && (await D.requestPermission()) !== 'granted')
        return say('Motion access was declined');
    } catch {
      return say('Motion access was declined');
    }
    let base: { b: number; g: number } | null = null;
    if (tilt.current) removeEventListener('deviceorientation', tilt.current);
    tilt.current = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      base ??= { b: e.beta, g: e.gamma };
      cam.current.ox = clamp((e.gamma - base.g) * 0.7, -16, 16);
      cam.current.oy = clamp(-(e.beta - base.b) * 0.45, -10, 10);
    };
    addEventListener('deviceorientation', tilt.current);
    setMotion('on');
    say('Tilt to look around');
  };

  /* ---------- keys */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      input.current = 'key';
      if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], dialog')) return;
      if (modeRef.current === 'immersive') return;
      const k = e.key;
      const c = cam.current;
      const free = t === document.body || t === root.current || t === stage.current;
      if (k === 'Escape') {
        if (cc) setCc(false);
        else if (modeRef.current === 'home') setMode('space');
        return;
      }
      if (e.altKey && !k.startsWith('Arrow')) return;
      if (k === 'h' || k === 'H') toggleHome();
      else if (k === 'r' || k === 'R') recenter();
      else if (k === 'i' || k === 'I') enterLab();
      else if (k === 'p' || k === 'P') setReader(true);
      else if (k === '?') setSheet(true);
      else if (/^[1-7]$/.test(k)) summon(WINS[Number(k) - 1].id);
      else if (k.startsWith('Arrow') && (free || e.altKey) && !lensRef.current.phone) {
        e.preventDefault();
        intro.current = null;
        const step = e.shiftKey ? 15 : 6;
        if (k === 'ArrowLeft') c.tYaw -= step;
        else if (k === 'ArrowRight') c.tYaw += step;
        else if (k === 'ArrowUp') c.tPitch += step / 1.5;
        else c.tPitch -= step / 1.5;
      } else return;
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  // Keyboard focus moving into a window off to the side turns your head toward it.
  useEffect(() => {
    const el = spaceEl.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => {
      if (input.current !== 'key' || lensRef.current.phone) return;
      const win = (e.target as HTMLElement).closest<HTMLElement>('[data-win]');
      if (!win) return;
      const p = layoutRef.current[win.dataset.win as WinId];
      const c = cam.current;
      if (Math.abs(wrapDeg(p.az - c.tYaw)) > 14) c.tYaw = clamp(p.az, -YAW_MAX, YAW_MAX);
      if (Math.abs(p.el - c.tPitch) > 10) c.tPitch = clamp(p.el, -PITCH_MAX, PITCH_MAX);
    };
    el.addEventListener('focusin', onFocus);
    return () => el.removeEventListener('focusin', onFocus);
  }, []);

  /* ---------- phones: a carousel of windows that lean as they slide */

  useEffect(() => {
    const sc = spaceEl.current;
    if (!sc) return;
    let raf = 0;
    const lean = () => {
      raf = 0;
      const cards = sc.querySelectorAll<HTMLElement>('[data-win]');
      if (!lensRef.current.phone) {
        cards.forEach((c) => (c.style.transform = ''));
        return;
      }
      const mid = sc.scrollLeft + sc.clientWidth / 2;
      let best = 0,
        bestD = Infinity;
      cards.forEach((c, i) => {
        const off = (c.offsetLeft + c.clientWidth / 2 - mid) / c.clientWidth;
        if (Math.abs(off) < bestD) {
          bestD = Math.abs(off);
          best = i;
        }
        const o = clamp(off, -1.5, 1.5);
        c.style.transform = reducedRef.current
          ? ''
          : `rotateY(${(-o * 16).toFixed(2)}deg) translateZ(${(-Math.abs(o) * 40).toFixed(1)}px)`;
      });
      setCurrent(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(lean);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, [lens]);

  /* ---------- dialogs */

  useEffect(() => {
    const d = sheetEl.current;
    if (!d) return;
    if (sheet && !d.open) d.showModal();
    else if (!sheet && d.open) d.close();
  }, [sheet]);

  const dismissTips = () => {
    setTips(false);
    try {
      localStorage.setItem(TIPS_KEY, '1');
    } catch {
      // Storage blocked; the tips just come back next time.
    }
  };

  /* ---------- render */

  const away = mode !== 'space';
  const phone = lens?.phone ?? false;
  const P = lens?.P ?? 1224;
  const k = lens?.k ?? 1;
  const chrome = (id: WinId, order: number) => ({ id, place: layout[id], wm, away, order, phone });

  const homeApps: HomeApp[] = [
    ...WINS.map((w) => ({
      id: w.id,
      label: w.title,
      icon: APP_LOOK[w.id].icon,
      tint: APP_LOOK[w.id].tint,
      onOpen: () => summon(w.id),
    })),
    {
      id: 'lab',
      label: 'Hardware space',
      icon: 'cube' as IconName,
      tint: ['#8f8bff', '#4b3fd6'] as [string, string],
      onOpen: enterLab,
    },
    {
      id: 'reader',
      label: 'Read as page',
      icon: 'doc' as IconName,
      tint: ['#f4f5f7', '#c9ced8'] as [string, string],
      onOpen: () => setReader(true),
    },
  ];
  const people: HomeApp[] = [
    {
      id: 'me',
      label: profile.name,
      icon: 'person',
      tint: ['#6fd0ff', '#2689d9'],
      onOpen: () => summon('contact'),
    },
  ];
  const envs: HomeApp[] = [
    {
      id: 'day',
      label: 'Day room',
      icon: 'sun',
      tint: ['#ffe39a', '#f2a93b'],
      on: choice === 'light',
      onOpen: () => writeScheme('light'),
    },
    {
      id: 'evening',
      label: 'Evening room',
      icon: 'moon',
      tint: ['#7f86c9', '#2c2f63'],
      on: choice === 'dark',
      onOpen: () => writeScheme('dark'),
    },
    {
      id: 'auto',
      label: 'Follow system',
      icon: 'auto',
      tint: ['#d7dbe3', '#8b93a3'],
      on: choice === null,
      onOpen: () => writeScheme(null),
    },
    {
      id: 'lab',
      label: 'Hardware space',
      icon: 'cube',
      tint: ['#8f8bff', '#4b3fd6'],
      onOpen: enterLab,
    },
  ];

  return (
    <div
      className={s.root}
      ref={root}
      tabIndex={-1}
      data-mode={mode}
      data-ready={ready || undefined}
      data-settled={settled || undefined}
      data-dragging={dragging ?? undefined}
      style={lens ? ({ '--P': `${P}px`, '--k': k } as CSSProperties) : undefined}
    >
      <button type="button" className={s.skip} onClick={() => setReader(true)}>
        Read everything as a page
      </button>
      <h1 className={s.srOnly}>
        {profile.name}, {credit.name}
      </h1>

      <div className={s.stage} ref={stage} onPointerDown={onStageDown}>
        <Room roomRef={roomEl}>
          {WINS.map(({ id }) => {
            const p = layout[id];
            const sc = dynamicScale(p.r) * k;
            return (
              <FloorMark
                key={id}
                az={p.az}
                el={p.el}
                r={p.r}
                width={p.w * sc}
                height={p.h * sc}
                open={p.open && ready && !away && !phone}
                P={P}
              />
            );
          })}
        </Room>
        <div className={s.space} ref={spaceEl}>
          <About {...chrome('about', 0)} onReader={() => setReader(true)} />
          <Experience {...chrome('experience', 1)} />
          <Projects {...chrome('projects', 2)} />
          <Hardware {...chrome('hardware', 3)} onImmersive={enterLab} />
          <OpenSource {...chrome('oss', 4)} />
          <Roots {...chrome('roots', 5)} />
          <Contact {...chrome('contact', 6)} onCopy={copy} />
          {WINS.map((w, i) => (
            <i
              key={w.id}
              className={s.snap}
              style={{ '--order': i } as CSSProperties}
              aria-hidden="true"
            />
          ))}
        </div>
        <div className={s.veil} aria-hidden="true" />
        <Home
          open={mode === 'home'}
          yaw={homeYaw}
          apps={homeApps}
          people={people}
          envs={envs}
          layerRef={homeEl}
        />
      </div>

      {mode === 'immersive' && (
        <Immersive
          yaw={labYaw}
          getPose={() => pose.current}
          getP={() => lensRef.current.P}
          reduced={reduced}
          onLook={(dx, dy) => {
            intro.current = null;
            look(dx, dy);
          }}
          onFace={(az) => {
            intro.current = null;
            cam.current.tYaw = clamp(az, -YAW_MAX, YAW_MAX);
            cam.current.tPitch = 0;
          }}
          onExit={() => {
            setMode('space');
            say('Back in the room');
          }}
        />
      )}

      <nav className={s.phoneTabs} aria-label="Windows">
        {WINS.map((w, i) => (
          <button
            key={w.id}
            type="button"
            className={s.gz}
            aria-current={current === i && mode === 'space' ? 'true' : undefined}
            onClick={() => summon(w.id)}
          >
            {w.title}
          </button>
        ))}
      </nav>

      <div className={s.cc} data-open={cc || undefined}>
        <button
          type="button"
          className={`${s.ccToggle} ${s.gz}`}
          aria-expanded={cc}
          aria-controls="spatial-cc"
          onClick={() => setCc(!cc)}
        >
          <Icon name="chevronDown" size={16} />
          <span className={s.ccClock}>{clock}</span>
          <span className={s.srOnly}>Controls</span>
        </button>
        <div id="spatial-cc" className={s.ccPanel} hidden={!cc}>
          <CcButton
            label="Home"
            icon="house"
            kbd="H"
            onPick={toggleHome}
            done={() => setCc(false)}
          />
          {!phone && (
            <CcButton
              label="Recenter"
              icon="recenter"
              kbd="R"
              onPick={recenter}
              done={() => setCc(false)}
            />
          )}
          <CcButton
            label="Hardware space"
            icon="cube"
            kbd="I"
            onPick={enterLab}
            done={() => setCc(false)}
          />
          <CcButton
            label="Read as page"
            icon="doc"
            kbd="P"
            onPick={() => setReader(true)}
            done={() => setCc(false)}
          />
          <CcButton
            label={choice ? `${ENV_NAME[choice]} room` : 'Room: system'}
            icon={choice === 'dark' ? 'moon' : choice === 'light' ? 'sun' : 'auto'}
            onPick={cycleEnv}
            done={() => setCc(false)}
          />
          {phone && (
            <CcButton
              label={motion === 'on' ? 'Motion on' : 'Use motion'}
              icon="motion"
              active={motion === 'on'}
              onPick={enableMotion}
              done={() => setCc(false)}
            />
          )}
          {!phone && (
            <CcButton
              label="Shortcuts"
              icon="keyboard"
              kbd="?"
              onPick={() => setSheet(true)}
              done={() => setCc(false)}
            />
          )}
        </div>
      </div>

      {tips && ready && mode === 'space' && (
        <aside className={s.tips} aria-label="Tips">
          <p className={s.tipsDesk}>
            <b>Look around:</b> drag the room or move to the edges. <b>Move a window</b> by the bar
            beneath it, and scroll while you hold it to push it back. <kbd>H</kbd> opens Home.
          </p>
          <p className={s.tipsPhone}>
            <b>Swipe</b> between windows. The tabs above jump straight to one, and{' '}
            <Icon name="chevronDown" size={13} /> holds the controls.
          </p>
          <button type="button" className={`${s.pill} ${s.gz}`} onClick={dismissTips}>
            Got it
          </button>
        </aside>
      )}

      <div className={s.toast} role="status" aria-live="polite">
        {toast && <span key={toast.n}>{toast.text}</span>}
      </div>

      <Reader open={reader} onClose={() => setReader(false)} />

      <dialog
        ref={sheetEl}
        className={s.sheet}
        aria-labelledby="spatial-keys"
        onClose={() => setSheet(false)}
        onCancel={() => setSheet(false)}
      >
        <h2 id="spatial-keys">Shortcuts</h2>
        <dl>
          {KEYS.map(([k2, v]) => (
            <div key={k2}>
              <dt>
                <kbd>{k2}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className={`${s.pill} ${s.gz}`}
          onClick={() => setSheet(false)}
          autoFocus
        >
          Done
        </button>
      </dialog>

      <div className={s.cursor} ref={cursor} aria-hidden="true" />
    </div>
  );
}
