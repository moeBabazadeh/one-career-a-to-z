// The window manager's state: which windows are open, on which workspace, where, and in what
// stacking order. Pure, so it can be reasoned about apart from the effects drawn on top of it.

import { db } from '../_shared/data';
import type { IconName } from './icons';

/** The mine game is named after the robot challenge Moe won at university. */
export const GAME = db.awards.robocup.game;

/** The four workspaces, which are also the four faces of the cube. */
export const WORKSPACES = [
  { name: 'Home', about: 'README and a terminal' },
  { name: 'Work', about: 'roles, education and awards' },
  { name: 'Web', about: 'products and mail' },
  { name: 'Lab', about: 'devices, upstream fixes and Mines' },
];
export const WS = WORKSPACES.length;

export type AppId =
  | 'editor'
  | 'terminal'
  | 'files'
  | 'browser'
  | 'mail'
  | 'monitor'
  | 'packages'
  | 'mines'
  | 'ccsm'
  | 'about'
  | 'run';

export interface AppSpec {
  title: string;
  /** The short name in the window list and menus. */
  name: string;
  icon: IconName;
  /** The workspace it lives on; dialogs open wherever you are. */
  home: number | null;
  /** x, y, width, height on a 1440 x 852 desk. An x of -1 centres it; a size of 0 fits the content. */
  rect: [number, number, number, number];
  /** Dialogs keep their size and have no minimise or maximise. */
  dialog?: boolean;
}

export const APPS: Record<AppId, AppSpec> = {
  editor: {
    title: 'README.txt - Text Editor',
    name: 'Text Editor',
    icon: 'editor',
    home: 0,
    rect: [128, 22, 740, 640],
  },
  terminal: {
    title: 'moe@moe-arch: ~',
    name: 'Terminal',
    icon: 'terminal',
    home: 0,
    rect: [780, 236, 610, 470],
  },
  files: {
    title: 'Work - File Browser',
    name: 'File Browser',
    icon: 'home',
    home: 1,
    rect: [150, 34, 1060, 660],
  },
  browser: {
    title: 'Shipped - Web Browser',
    name: 'Web Browser',
    icon: 'browser',
    home: 2,
    rect: [128, 20, 1000, 720],
  },
  mail: {
    title: 'Compose Message',
    name: 'Mail',
    icon: 'mail',
    home: 2,
    rect: [930, 300, 480, 470],
  },
  monitor: {
    title: 'System Monitor',
    name: 'System Monitor',
    icon: 'monitor',
    home: 3,
    rect: [120, 22, 640, 500],
  },
  packages: {
    title: 'Package Manager',
    name: 'Package Manager',
    icon: 'package',
    home: 3,
    rect: [600, 286, 790, 480],
  },
  mines: {
    title: 'Mines',
    name: 'Mines',
    icon: 'mines',
    home: 3,
    rect: [1036, 24, 0, 0],
    dialog: true,
  },
  ccsm: {
    title: 'CompizConfig Settings Manager',
    name: 'CompizConfig',
    icon: 'cube',
    home: null,
    rect: [-1, 60, 780, 560],
  },
  about: {
    title: 'About This Computer',
    name: 'About',
    icon: 'computer',
    home: null,
    rect: [-1, 70, 460, 0],
    dialog: true,
  },
  run: {
    title: 'Run Application',
    name: 'Run Application',
    icon: 'run',
    home: null,
    rect: [-1, 140, 440, 0],
    dialog: true,
  },
};

export const APP_IDS = Object.keys(APPS) as AppId[];

export interface Win {
  open: boolean;
  min: boolean;
  max: boolean;
  ws: number;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface WmState {
  wins: Record<AppId, Win>;
  /** Open windows in the order their window-list buttons appear. */
  order: AppId[];
  /** The workspace on screen. */
  ws: number;
  focus: AppId | null;
  z: number;
}

export type WmAction =
  | { type: 'open'; id: AppId; vw: number; vh: number }
  | { type: 'close'; id: AppId }
  | { type: 'focus'; id: AppId | null }
  | { type: 'minimize'; id: AppId }
  | { type: 'maximize'; id: AppId }
  | { type: 'place'; id: AppId; x: number; y: number; w?: number; h?: number }
  | {
      type: 'nudge';
      id: AppId;
      mode: 'move' | 'size';
      dx: number;
      dy: number;
      vw: number;
      vh: number;
    }
  | { type: 'fit'; vw: number; vh: number }
  | { type: 'clamp'; vw: number; vh: number }
  | { type: 'workspace'; ws: number }
  | { type: 'send'; id: AppId; ws: number }
  | { type: 'showDesktop' };

const DESK_W = 1440;
const DESK_H = 852;
export const MIN_W = 300;
export const MIN_H = 180;

export const wrap = (ws: number) => ((ws % WS) + WS) % WS;

/** A spec's rect, scaled to a vw x vh desk and kept on it. */
export function startRect(id: AppId, vw = DESK_W, vh = DESK_H) {
  const [rx, ry, rw, rh] = APPS[id].rect;
  const sx = Math.min(1, vw / DESK_W),
    sy = Math.min(1, vh / DESK_H);
  const w = Math.round(Math.min(rw ? Math.max(MIN_W, rw * Math.max(sx, 0.8)) : 320, vw - 12));
  const h = Math.round(Math.min(rh ? Math.max(MIN_H, rh * Math.max(sy, 0.85)) : 420, vh - 12));
  let x = rx === -1 ? (vw - w) / 2 : rx * sx;
  let y = ry * sy;
  x = Math.round(Math.max(6, Math.min(x, vw - w - 6)));
  y = Math.round(Math.max(4, Math.min(y, vh - h - 6)));
  return { x, y, w, h };
}

/** Everything the first screen shows: every app open on its own workspace. */
export const FIRST_OPEN: AppId[] = [
  'editor',
  'terminal',
  'files',
  'browser',
  'mail',
  'monitor',
  'packages',
  'mines',
];

export function initialState(open: AppId[] = FIRST_OPEN): WmState {
  const wins = Object.fromEntries(
    APP_IDS.map((id) => [
      id,
      { open: false, min: false, max: false, ws: APPS[id].home ?? 0, z: 0, ...startRect(id) },
    ]),
  ) as Record<AppId, Win>;
  open.forEach((id, i) => {
    wins[id] = { ...wins[id], open: true, z: i + 1 };
  });
  return { wins, order: [...open], ws: 0, focus: topOf(wins, 0), z: open.length };
}

/** The top visible window on a workspace, other than `except`. */
export function topOf(wins: Record<AppId, Win>, ws: number, except?: AppId): AppId | null {
  let best: AppId | null = null;
  for (const id of APP_IDS) {
    const w = wins[id];
    if (id === except || !w.open || w.min || w.ws !== ws) continue;
    if (!best || w.z > wins[best].z) best = id;
  }
  return best;
}

/** Open windows on a workspace, in window-list order. */
export const onWorkspace = (state: WmState, ws: number) =>
  state.order.filter((id) => state.wins[id].ws === ws);

export function wmReducer(state: WmState, action: WmAction): WmState {
  const { wins } = state;
  switch (action.type) {
    case 'open': {
      const win = wins[action.id];
      const z = state.z + 1;
      // A window that's open stays where it is; a closed one opens on its home workspace, or here.
      const ws = win.open ? win.ws : (APPS[action.id].home ?? state.ws);
      const geometry = win.open ? {} : startRect(action.id, action.vw, action.vh);
      // The workspace itself only changes when the cube lands (see the 'workspace' action).
      return {
        ...state,
        wins: {
          ...wins,
          [action.id]: {
            ...win,
            ...geometry,
            open: true,
            min: false,
            max: win.open ? win.max : false,
            ws,
            z,
          },
        },
        order: win.open ? state.order : [...state.order, action.id],
        focus: action.id,
        z,
      };
    }
    case 'close': {
      const next = {
        ...wins,
        [action.id]: { ...wins[action.id], open: false, min: false, max: false },
      };
      return {
        ...state,
        wins: next,
        order: state.order.filter((id) => id !== action.id),
        focus: state.focus === action.id ? topOf(next, state.ws) : state.focus,
      };
    }
    case 'focus': {
      if (action.id === null) return state.focus === null ? state : { ...state, focus: null };
      const win = wins[action.id];
      if (state.focus === action.id && win.z === state.z && !win.min) return state;
      const z = state.z + 1;
      return {
        ...state,
        wins: { ...wins, [action.id]: { ...win, min: false, z } },
        focus: action.id,
        z,
      };
    }
    case 'minimize': {
      const next = { ...wins, [action.id]: { ...wins[action.id], min: true } };
      return { ...state, wins: next, focus: topOf(next, state.ws) };
    }
    case 'maximize': {
      const z = state.z + 1;
      const win = wins[action.id];
      return {
        ...state,
        wins: { ...wins, [action.id]: { ...win, max: !win.max, min: false, z } },
        focus: action.id,
        z,
      };
    }
    case 'place': {
      const win = wins[action.id];
      return {
        ...state,
        wins: {
          ...wins,
          [action.id]: {
            ...win,
            x: action.x,
            y: action.y,
            w: action.w ?? win.w,
            h: action.h ?? win.h,
          },
        },
      };
    }
    case 'nudge': {
      const win = wins[action.id];
      const { dx, dy, vw, vh } = action;
      const next =
        action.mode === 'move'
          ? {
              x: Math.max(80 - win.w, Math.min(win.x + dx, vw - 80)),
              y: Math.max(0, Math.min(win.y + dy, vh - 30)),
            }
          : {
              w: Math.max(MIN_W, Math.min(win.w + dx, vw - win.x)),
              h: Math.max(MIN_H, Math.min(win.h + dy, vh - win.y)),
            };
      return { ...state, wins: { ...wins, [action.id]: { ...win, ...next } } };
    }
    case 'fit': {
      const next = { ...wins };
      for (const id of APP_IDS) next[id] = { ...next[id], ...startRect(id, action.vw, action.vh) };
      return { ...state, wins: next };
    }
    case 'clamp': {
      const next = { ...wins };
      for (const id of APP_IDS) {
        const win = next[id];
        const w = Math.min(win.w, action.vw - 12),
          h = Math.min(win.h, action.vh - 12);
        next[id] = {
          ...win,
          w,
          h,
          x: Math.max(80 - w, Math.min(win.x, action.vw - 80)),
          y: Math.max(0, Math.min(win.y, action.vh - 30)),
        };
      }
      return { ...state, wins: next };
    }
    case 'workspace': {
      const ws = wrap(action.ws);
      if (ws === state.ws) return state;
      return { ...state, ws, focus: topOf(wins, ws) };
    }
    case 'send': {
      // The window goes first; the cube follows it there.
      const ws = wrap(action.ws);
      const z = state.z + 1;
      return {
        ...state,
        wins: { ...wins, [action.id]: { ...wins[action.id], ws, z, min: false } },
        focus: action.id,
        z,
      };
    }
    case 'showDesktop': {
      // Minimises everything on this workspace; a second press brings it all back.
      const here = APP_IDS.filter((id) => wins[id].open && wins[id].ws === state.ws);
      const allMin = here.every((id) => wins[id].min);
      const next = { ...wins };
      for (const id of here) next[id] = { ...next[id], min: !allMin };
      return { ...state, wins: next, focus: allMin ? topOf(next, state.ws) : null };
    }
  }
}
