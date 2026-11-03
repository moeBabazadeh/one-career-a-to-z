/*
 * The space: where each window sits around you, the camera that looks at them, and the maths
 * that turns a pointer on the screen into a direction in the room.
 *
 * Units. Positions are in "P units": one unit is the focal length P in CSS pixels, so the room
 * keeps its proportions at any viewport, while a window's own size stays in CSS pixels and so
 * reads at the same size on every screen. A window at r = 1 is drawn at 1:1.
 *
 * Axes follow CSS: x right, y down, z toward you. You stand at the origin looking down -z.
 * A window lives on a sphere around you: azimuth (degrees, + is to your right), elevation
 * (degrees, + is up) and distance r. It always faces you, the way spatial windows turn toward
 * you as you move them.
 */

export type WinId = 'about' | 'experience' | 'projects' | 'hardware' | 'oss' | 'roots' | 'contact';

export interface Placement {
  az: number;
  el: number;
  r: number;
  w: number;
  h: number;
  open: boolean;
}

export type Layout = Record<WinId, Placement>;

export interface WinSpec {
  id: WinId;
  title: string;
  /** The digit that summons it. */
  key: string;
  min: [number, number];
  max: [number, number];
  home: Placement;
}

const at = (az: number, el: number, r: number, w: number, h: number): Placement => ({
  az,
  el,
  r,
  w,
  h,
  open: true,
});

/** Every window, left to right as they first stand around you. */
export const WINS: WinSpec[] = [
  {
    id: 'about',
    title: 'About',
    key: '1',
    min: [420, 380],
    max: [900, 820],
    home: at(0, 1, 1, 620, 560),
  },
  {
    id: 'experience',
    title: 'Experience',
    key: '2',
    min: [420, 380],
    max: [900, 860],
    home: at(35, 0, 1.3, 580, 580),
  },
  {
    id: 'projects',
    title: 'Projects',
    key: '3',
    min: [460, 400],
    max: [980, 860],
    home: at(-36, 0, 1.32, 640, 580),
  },
  {
    id: 'hardware',
    title: 'Hardware',
    key: '4',
    min: [420, 380],
    max: [900, 820],
    home: at(68, 0, 1.36, 600, 560),
  },
  {
    id: 'oss',
    title: 'Open source',
    key: '5',
    min: [420, 380],
    max: [900, 820],
    home: at(-70, 0, 1.36, 600, 560),
  },
  {
    id: 'roots',
    title: 'Roots',
    key: '6',
    min: [400, 360],
    max: [860, 820],
    home: at(99, 0, 1.36, 540, 540),
  },
  {
    id: 'contact',
    title: 'Contact',
    key: '7',
    min: [360, 360],
    max: [760, 760],
    home: at(-99, -1, 1.3, 440, 500),
  },
];

export const SPEC = Object.fromEntries(WINS.map((w) => [w.id, w])) as Record<WinId, WinSpec>;
export const IDS = WINS.map((w) => w.id);

export const defaultLayout = (): Layout =>
  Object.fromEntries(WINS.map((w) => [w.id, { ...w.home }])) as Layout;

/* ------------------------------------------------------------------ limits */

export const R_MIN = 0.55;
export const R_MAX = 2.3;
export const EL_MIN = -28;
export const EL_MAX = 34;
/** How far you can turn your head, either way. */
export const YAW_MAX = 78;
export const PITCH_MAX = 24;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Windows grow as they move away so they stay legible, but not quite enough to hide the move. */
export const dynamicScale = (r: number) => Math.pow(r, 0.62);

/** Wraps an angle into -180..180. */
export const wrapDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/* ------------------------------------------------------------------ the room, in P units */

export const ROOM = {
  floor: 0.56,
  ceiling: -1.26,
  back: -3.2,
  front: 1.8,
  side: 2.9,
};

/* ------------------------------------------------------------------ the lens */

export const PHONE = '(max-width: 700px)';

/** The focal length in CSS pixels: about a 60° horizontal field on a desktop. */
export function focal(W: number, H: number) {
  if (W <= 700) return Math.round(clamp(H * 0.95, 560, 900));
  return Math.round(clamp(W * 0.85, 760, 1400));
}

/** How big the windows are drawn on this screen: smaller on short laptop screens. */
export const uiScale = (W: number, H: number) => (W <= 700 ? 1 : clamp((H - 40) / 860, 0.7, 1.08));

/* ------------------------------------------------------------------ the camera */

export interface Camera {
  /** Where you've turned to (dragging the room, the arrow keys). Degrees. */
  yaw: number;
  pitch: number;
  /** Where that turn is easing toward. */
  tYaw: number;
  tPitch: number;
  /** Spin left over from a flick of the room. Degrees per second. */
  vYaw: number;
  vPitch: number;
  /** The small head movement that follows the pointer, -1..1 on each axis, and its target. */
  lx: number;
  ly: number;
  tlx: number;
  tly: number;
  /** A phone's tilt, in degrees, relative to how it was held when motion was switched on. */
  ox: number;
  oy: number;
  /** Head movement stops following the pointer while something is being dragged. */
  hold: boolean;
}

export const newCamera = (): Camera => ({
  yaw: 0,
  pitch: 0,
  tYaw: 0,
  tPitch: 0,
  vYaw: 0,
  vPitch: 0,
  lx: 0,
  ly: 0,
  tlx: 0,
  tly: 0,
  ox: 0,
  oy: 0,
  hold: false,
});

/** How far the pointer turns your head at the edge of the screen, and how far your head moves. */
export const LOOK = { yaw: 9, pitch: 5, x: 0.05, y: 0.03 };

export interface Pose {
  yaw: number;
  pitch: number;
  /** Head position, in P units. */
  x: number;
  y: number;
}

export const poseOf = (c: Camera): Pose => ({
  yaw: c.yaw + c.lx * LOOK.yaw + c.ox,
  pitch: c.pitch - c.ly * LOOK.pitch + c.oy,
  x: c.lx * LOOK.x,
  y: c.ly * LOOK.y,
});

/**
 * The CSS transform that puts the world in front of the lens: the view matrix, as CSS. `unit`
 * is how many pixels one P unit is in that layer (the room is drawn smaller than true scale,
 * which perspective can't tell apart, as long as the head moves at the same scale).
 */
export const viewTransform = (p: Pose, unit: number) =>
  `translateZ(var(--P)) rotateX(${p.pitch.toFixed(3)}deg) rotateY(${p.yaw.toFixed(3)}deg) translate3d(${(-p.x * unit).toFixed(2)}px, ${(-p.y * unit).toFixed(2)}px, 0)`;

const RAD = Math.PI / 180;

/**
 * The direction a screen point looks in, as azimuth and elevation in degrees. It runs the
 * view rotation backwards: a ray (sx, sy, -P) from the eye, un-pitched, then un-yawed.
 */
export function screenToDir(sx: number, sy: number, P: number, pose: Pose) {
  const cp = Math.cos(pose.pitch * RAD),
    sp = Math.sin(pose.pitch * RAD);
  const cy = Math.cos(pose.yaw * RAD),
    sy2 = Math.sin(pose.yaw * RAD);
  const dz = -P;
  const v1x = sx,
    v1y = cp * sy + sp * dz,
    v1z = -sp * sy + cp * dz;
  const x = cy * v1x - sy2 * v1z,
    y = v1y,
    z = sy2 * v1x + cy * v1z;
  return { az: Math.atan2(x, -z) / RAD, el: Math.atan2(-y, Math.hypot(x, z)) / RAD };
}

/** Where a direction lands on the screen, or null when it's behind you. */
export function dirToScreen(az: number, el: number, P: number, pose: Pose) {
  const ca = Math.cos(az * RAD),
    sa = Math.sin(az * RAD),
    ce = Math.cos(el * RAD),
    se = Math.sin(el * RAD);
  // A unit vector toward (az, el), then the view rotation: yaw, then pitch.
  const wx = ce * sa,
    wy = -se,
    wz = -ce * ca;
  const cy = Math.cos(pose.yaw * RAD),
    sy = Math.sin(pose.yaw * RAD);
  const x1 = cy * wx + sy * wz,
    z1 = -sy * wx + cy * wz;
  const cp = Math.cos(pose.pitch * RAD),
    sp = Math.sin(pose.pitch * RAD);
  const y2 = cp * wy - sp * z1,
    z2 = sp * wy + cp * z1;
  if (z2 >= -0.05) return null;
  return { x: (x1 * P) / -z2, y: (y2 * P) / -z2 };
}

/* ------------------------------------------------------------------ keeping the layout */

const KEY = 'spatial-layout';
const VERSION = 1;

export function loadLayout(): Layout | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as {
      v: number;
      wins: Partial<Record<WinId, Partial<Placement>>>;
    };
    if (saved.v !== VERSION || !saved.wins) return null;
    const base = defaultLayout();
    for (const id of IDS) {
      const s = saved.wins[id];
      if (!s) continue;
      const spec = SPEC[id];
      const num = (v: unknown, fallback: number) =>
        typeof v === 'number' && Number.isFinite(v) ? v : fallback;
      base[id] = {
        az: wrapDeg(num(s.az, base[id].az)),
        el: clamp(num(s.el, base[id].el), EL_MIN, EL_MAX),
        r: clamp(num(s.r, base[id].r), R_MIN, R_MAX),
        w: clamp(num(s.w, base[id].w), spec.min[0], spec.max[0]),
        h: clamp(num(s.h, base[id].h), spec.min[1], spec.max[1]),
        open: typeof s.open === 'boolean' ? s.open : true,
      };
    }
    return base;
  } catch {
    return null;
  }
}

export function saveLayout(layout: Layout | null) {
  try {
    if (layout) localStorage.setItem(KEY, JSON.stringify({ v: VERSION, wins: layout }));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked; the layout still holds for this visit.
  }
}

/* ------------------------------------------------------------------ the window manager */

export type Action =
  | { type: 'load'; layout: Layout }
  | { type: 'place'; id: WinId; az?: number; el?: number; r?: number; w?: number; h?: number }
  | { type: 'open'; id: WinId; az: number; el: number }
  | { type: 'close'; id: WinId }
  | { type: 'recenter' };

export function layoutReducer(state: Layout, a: Action): Layout {
  switch (a.type) {
    case 'load':
      return a.layout;
    case 'recenter':
      return defaultLayout();
    case 'close':
      return { ...state, [a.id]: { ...state[a.id], open: false } };
    case 'place': {
      const p = state[a.id];
      const spec = SPEC[a.id];
      return {
        ...state,
        [a.id]: {
          ...p,
          az: a.az === undefined ? p.az : wrapDeg(a.az),
          el: a.el === undefined ? p.el : clamp(a.el, EL_MIN, EL_MAX),
          r: a.r === undefined ? p.r : clamp(a.r, R_MIN, R_MAX),
          w: a.w === undefined ? p.w : clamp(a.w, spec.min[0], spec.max[0]),
          h: a.h === undefined ? p.h : clamp(a.h, spec.min[1], spec.max[1]),
        },
      };
    }
    case 'open': {
      // A window you summon comes to where you're looking, just in front of anything already there.
      const near = IDS.filter(
        (id) =>
          id !== a.id &&
          state[id].open &&
          Math.abs(wrapDeg(state[id].az - a.az)) < 16 &&
          state[id].r < 1.15,
      ).map((id) => state[id].r);
      const r = near.length ? Math.max(R_MIN, Math.min(...near) - 0.12) : 0.98;
      return {
        ...state,
        [a.id]: {
          ...state[a.id],
          az: wrapDeg(a.az),
          el: clamp(a.el, EL_MIN, EL_MAX),
          r,
          open: true,
        },
      };
    }
  }
}
