// The window server. Every open app is a full-screen layer whose box (centre, size, corner radius)
// is driven by springs: from its icon when it launches, into a card in the app switcher, back to
// its icon when it closes, and under your finger during the home gesture. React decides what is
// open; this moves it, frame by frame, without re-rendering.
import { Motion, SPRINGS, rubber, type SpringConfig } from './spring';

type Key = 'cx' | 'cy' | 'w' | 'h' | 'r' | 'f';
export type Box = Record<Key, number>;

interface Win {
  el: HTMLElement;
  label: HTMLElement | null;
  shadow: HTMLElement | null;
  splash: HTMLElement | null;
  m: Motion<Key>;
  shown: boolean;
}

/** The switcher's card size as a share of the screen, and the gap between card centres. */
const CARD = 0.66;
const SPACING = 0.6;

export class Shell {
  private screen: HTMLElement | null = null;
  private wins = new Map<string, Win>();
  private lockM: Motion<'y'> | null = null;
  private pagesM: Motion<'x'> | null = null;
  private dragged = false;
  private reduced = false;
  W = 390;
  H = 844;
  R = 0;
  /** How far the switcher is scrolled, in cards (0 = the most recent app in the middle). */
  scroll = 0;

  setReduced(on: boolean) {
    this.reduced = on;
  }

  get still() {
    return this.reduced;
  }

  attach(screen: HTMLElement | null) {
    this.screen = screen;
    if (screen) this.measure();
  }

  measure() {
    const s = this.screen;
    if (!s) return;
    this.W = s.offsetWidth || this.W;
    this.H = s.offsetHeight || this.H;
    this.R = parseFloat(getComputedStyle(s).getPropertyValue('--screen-r')) || 0;
  }

  /** Client pixels per screen pixel: the stage scales the phone to fit. */
  scale() {
    const s = this.screen;
    return s ? s.getBoundingClientRect().width / (s.offsetWidth || 1) : 1;
  }

  /** An element's box in screen coordinates. */
  boxOf(el: Element, r?: number): Box {
    const s = this.screen?.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const k = this.scale();
    const w = b.width / k;
    return {
      cx: (b.left - (s?.left ?? 0) + b.width / 2) / k,
      cy: (b.top - (s?.top ?? 0) + b.height / 2) / k,
      w,
      h: b.height / k,
      r: r ?? w * 0.225,
      f: 1,
    };
  }

  full(): Box {
    return { cx: this.W / 2, cy: this.H / 2, w: this.W, h: this.H, r: this.R, f: 0 };
  }

  /** Card i (0 = most recent) in the switcher, at the current scroll. Older apps sit to the left. */
  card(i: number, scroll = this.scroll): Box {
    const w = this.W * CARD;
    return {
      cx: this.W / 2 + (scroll - i) * this.W * SPACING,
      cy: this.H * 0.47,
      w,
      h: this.H * CARD,
      r: Math.max(this.R, 34) * CARD,
      f: 0,
    };
  }

  setScroll(n: number) {
    this.scroll = n;
  }

  get spacing() {
    return this.W * SPACING;
  }

  /* ---------------------------------------------------------------- windows */

  register(
    id: string,
    el: HTMLElement,
    label: HTMLElement | null,
    splash: HTMLElement | null,
    shadow: HTMLElement | null,
  ) {
    const prev = this.wins.get(id);
    prev?.m.stop();
    const win: Win = { el, label, splash, shadow, shown: false, m: null as unknown as Motion<Key> };
    win.m = new Motion<Key>({ ...this.full(), f: 0 }, (v) => this.paint(win, v));
    this.show(win, false);
    this.wins.set(id, win);
  }

  unregister(id: string, el: HTMLElement) {
    const win = this.wins.get(id);
    if (win?.el !== el) return;
    win.m.stop();
    this.wins.delete(id);
  }

  has(id: string) {
    return this.wins.has(id);
  }

  private paint(win: Win, v: Box) {
    const { W, H } = this;
    const s = Math.max(0.02, v.w / W);
    const inset = Math.max(0, (H - v.h / s) / 2);
    const tx = v.cx - (s * W) / 2;
    const ty = v.cy - (s * H) / 2;
    const atFull =
      Math.abs(s - 1) < 0.0005 && Math.abs(tx) < 0.05 && Math.abs(ty) < 0.05 && inset < 0.05;
    // At rest full-screen the layer drops its transform so text stays crisp.
    win.el.style.transform = atFull ? '' : `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
    win.el.style.clipPath = atFull ? '' : `inset(${inset}px 0 round ${v.r / s}px)`;
    if (win.splash) win.splash.style.opacity = String(Math.min(1, Math.max(0, v.f)));
    if (win.label)
      win.label.style.transform = `translate3d(${v.cx}px, ${v.cy - v.h / 2 - 12}px, 0) translate(-50%, -100%)`;
    // The card's shadow lives outside the clipped layer, sized to the visible box.
    if (win.shadow) {
      win.shadow.style.transform = `translate3d(${v.cx - v.w / 2}px, ${v.cy - v.h / 2}px, 0)`;
      win.shadow.style.width = `${v.w}px`;
      win.shadow.style.height = `${v.h}px`;
      win.shadow.style.borderRadius = `${v.r}px`;
    }
  }

  private show(win: Win, on: boolean) {
    win.shown = on;
    win.el.style.visibility = on ? '' : 'hidden';
    if (win.label) win.label.style.visibility = on ? '' : 'hidden';
    if (win.shadow) win.shadow.style.visibility = on ? '' : 'hidden';
  }

  value(id: string) {
    return this.wins.get(id)?.m.value ?? null;
  }

  /** Puts a window somewhere at once. */
  place(id: string, box: Partial<Box>, z?: number) {
    const win = this.wins.get(id);
    if (!win) return;
    this.show(win, true);
    if (z !== undefined) win.el.style.zIndex = String(z);
    win.m.set(box);
  }

  /** Springs a window to a box; `hide` hides it once it gets there. */
  move(
    id: string,
    box: Partial<Box>,
    cfg: SpringConfig = SPRINGS.launch,
    opts: { velocity?: Partial<Box>; hide?: boolean; z?: number; done?: () => void } = {},
  ) {
    const win = this.wins.get(id);
    if (!win) return;
    this.show(win, true);
    if (opts.z !== undefined) win.el.style.zIndex = String(opts.z);
    win.m.to(box, cfg, {
      velocity: opts.velocity,
      instant: this.reduced,
      done: () => {
        if (opts.hide) this.show(win, false);
        opts.done?.();
      },
    });
  }

  hide(id: string) {
    const win = this.wins.get(id);
    if (!win) return;
    win.m.stop();
    this.show(win, false);
  }

  /** Every window but these hides now. */
  hideExcept(ids: string[]) {
    for (const [id, win] of this.wins) if (!ids.includes(id) && win.shown) this.hide(id);
  }

  /** Lays the switcher's cards out at the current scroll; `instant` while a finger drags it. */
  layoutCards(order: string[], instant = false, velocity = 0) {
    order.forEach((id, i) => {
      const box = this.card(i);
      const z = 100 - i;
      if (instant) this.place(id, box, z);
      else this.move(id, box, SPRINGS.settle, { z, velocity: { cx: velocity } });
    });
  }

  /* ---------------------------------------------------------------- lock screen and pages */

  bindLock(el: HTMLElement | null, under: HTMLElement | null) {
    this.lockM?.stop();
    if (!el) {
      this.lockM = null;
      return;
    }
    this.lockM = new Motion({ y: 0 }, ({ y }) => {
      const p = Math.min(1, Math.max(0, -y / (this.H || 1)));
      el.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
      el.style.setProperty('--lift', String(p));
      if (under) {
        under.style.transform = p > 0 && p < 1 ? `scale(${1.06 - 0.06 * p})` : '';
        under.style.filter = p > 0 && p < 0.98 ? `blur(${(1 - p) * 12}px)` : '';
      }
    });
  }

  lockSet(y: number) {
    this.lockM?.set({ y });
  }

  lockTo(y: number, velocity = 0, done?: () => void) {
    this.lockM?.to({ y }, SPRINGS.soft, { velocity: { y: velocity }, instant: this.reduced, done });
  }

  get lockY() {
    return this.lockM?.value.y ?? 0;
  }

  bindPages(el: HTMLElement | null) {
    this.pagesM?.stop();
    this.pagesM = el
      ? new Motion({ x: 0 }, ({ x }) => el.style.setProperty('--px', `${x}px`))
      : null;
  }

  pagesSet(x: number) {
    this.pagesM?.set({ x });
  }

  pagesTo(x: number, velocity = 0) {
    this.pagesM?.to({ x }, SPRINGS.settle, { velocity: { x: velocity }, instant: this.reduced });
  }

  get pagesX() {
    return this.pagesM?.value.x ?? 0;
  }

  /* ---------------------------------------------------------------- clicks after drags */

  markDragged() {
    this.dragged = true;
  }

  /** A new touch starts clean: a drag that ended somewhere no click landed can't eat the next tap. */
  resetDragged() {
    this.dragged = false;
  }

  /** True once after a drag, so the click that ends it doesn't also tap what's under the finger. */
  takeDragged() {
    const d = this.dragged;
    this.dragged = false;
    return d;
  }

  rubber(over: number, size: number) {
    return rubber(over, size);
  }
}

/* -------------------------------------------------------------------- tracking a finger */

export interface Drag {
  dx: number;
  dy: number;
  /** Velocity in screen px per second. */
  vx: number;
  vy: number;
  axis: 'x' | 'y' | null;
  /** How long the finger has been nearly still, in ms. */
  still: number;
}

interface Handlers {
  /** Picks an axis once the finger has moved far enough; return null to keep waiting. */
  slop?: number;
  move?: (d: Drag) => void;
  end?: (d: Drag) => void;
  cancel?: (d: Drag) => void;
}

/**
 * Follows one pointer from its pointerdown until it lifts, in screen pixels (k = client px per
 * screen px). Velocity comes from the last ~90 ms of samples, the way touch systems estimate it.
 */
export function track(
  e: { pointerId: number; clientX: number; clientY: number },
  k: number,
  h: Handlers,
) {
  const sx = e.clientX;
  const sy = e.clientY;
  const slop = h.slop ?? 8;
  const samples: { t: number; x: number; y: number }[] = [{ t: performance.now(), x: sx, y: sy }];
  let axis: 'x' | 'y' | null = null;
  let lastFast = performance.now();
  let last: Drag = { dx: 0, dy: 0, vx: 0, vy: 0, axis: null, still: 0 };

  const read = (x: number, y: number): Drag => {
    const now = performance.now();
    samples.push({ t: now, x, y });
    while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
    const a = samples[0];
    const dt = Math.max(1, now - a.t);
    const vx = ((x - a.x) / dt / k) * 1000;
    const vy = ((y - a.y) / dt / k) * 1000;
    if (Math.hypot(vx, vy) > 90) lastFast = now;
    const dx = (x - sx) / k;
    const dy = (y - sy) / k;
    if (!axis && Math.hypot(dx, dy) > slop) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    return { dx, dy, vx, vy, axis, still: now - lastFast };
  };

  const off = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', cancel);
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    last = read(ev.clientX, ev.clientY);
    h.move?.(last);
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    off();
    last = read(ev.clientX, ev.clientY);
    // A finger that stopped before lifting has no fling left in it.
    if (last.still > 60) last = { ...last, vx: 0, vy: 0 };
    h.end?.(last);
  };
  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    off();
    (h.cancel ?? h.end)?.(last);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', cancel);
  return off;
}
