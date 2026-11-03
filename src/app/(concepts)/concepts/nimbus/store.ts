// Console state as small external stores: the route (the URL hash, so back, forward and deep
// links work), and the UI around it (region, panels, the shell drawer, read notifications).
// A few choices persist in localStorage, like a real console remembers your region.
import { useSyncExternalStore } from 'react';

/* ------------------------------------------------------------------ router */

const routeListeners = new Set<() => void>();
let lastPath = '';

const readHash = () =>
  typeof window === 'undefined'
    ? ''
    : decodeURIComponent(window.location.hash.replace(/^#\/?/, '')).replace(/\/+$/, '');

function onHash() {
  const path = readHash();
  if (path === lastPath) return;
  lastPath = path;
  rememberVisit(path);
  routeListeners.forEach((l) => l());
  // A new page starts at the top, and focus moves to its heading for screen readers.
  window.scrollTo({ top: 0 });
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('[data-page-title]')?.focus({ preventScroll: true }),
  );
}

function subscribeRoute(l: () => void) {
  if (routeListeners.size === 0) {
    lastPath = readHash();
    window.addEventListener('hashchange', onHash);
  }
  routeListeners.add(l);
  return () => {
    routeListeners.delete(l);
    if (routeListeners.size === 0) window.removeEventListener('hashchange', onHash);
  };
}

/** The current console path, like "iam/roles/neuroject". Empty on the server and on home. */
export const useRoute = () => useSyncExternalStore(subscribeRoute, readHash, () => '');

export const href = (path: string) => `#/${path}`;

export function go(path: string) {
  if (readHash() === path) return;
  window.location.hash = `/${path}`;
}

/* ------------------------------------------------------------------ persisted UI */

export interface Ui {
  region: string;
  navOpen: boolean;
  navCollapsed: boolean;
  shell: boolean;
  shellMax: boolean;
  shellHeight: number;
  search: boolean;
  support: boolean;
  shortcuts: boolean;
  menu: null | 'region' | 'account' | 'notes' | 'services';
  read: string[];
  restored: string[];
  recent: string[];
  toast: string | null;
}

const INITIAL: Ui = {
  region: 'all',
  navOpen: false,
  navCollapsed: false,
  shell: false,
  shellMax: false,
  shellHeight: 340,
  search: false,
  support: false,
  shortcuts: false,
  menu: null,
  read: [],
  restored: [],
  recent: ['iam/roles', 'iot', 'billing', 'compute'],
  toast: null,
};

const KEY = 'cloud-console';
const PERSIST: (keyof Ui)[] = ['region', 'navCollapsed', 'shellHeight', 'read', 'recent'];

let state: Ui = INITIAL;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Ui>;
    const pick = Object.fromEntries(PERSIST.filter((k) => k in saved).map((k) => [k, saved[k]]));
    state = { ...state, ...pick };
  } catch {
    // Storage can be blocked; defaults are fine.
  }
}

function save() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, state[k]]))),
    );
  } catch {
    // Storage can be blocked; the choice holds for this visit.
  }
}

export function setUi(patch: Partial<Ui> | ((s: Ui) => Partial<Ui>)) {
  load();
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  if (PERSIST.some((k) => k in next)) save();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const snapshot = () => {
  load();
  return state;
};

export const useUi = () => useSyncExternalStore(subscribe, snapshot, () => INITIAL);
export const getUi = () => snapshot();

function rememberVisit(path: string) {
  if (!path || path === 'read') return;
  const top = path.split('/').slice(0, 2).join('/');
  setUi((s) => ({ recent: [top, ...s.recent.filter((p) => p !== top)].slice(0, 6) }));
}

/* ------------------------------------------------------------------ panels */

let opener: HTMLElement | null = null;
const remember = () => {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
    opener = document.activeElement;
};
const restore = () => {
  opener?.focus({ preventScroll: true });
  opener = null;
};

export function openPanel(name: 'search' | 'support' | 'shortcuts') {
  remember();
  setUi({ search: false, support: false, shortcuts: false, menu: null, [name]: true });
}

export function closePanel(name: 'search' | 'support' | 'shortcuts') {
  setUi({ [name]: false });
  restore();
}

export function toggleShell(open?: boolean) {
  setUi((s) => ({ shell: open ?? !s.shell, menu: null }));
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string) {
  setUi({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUi({ toast: null }), 2600);
}

/** Esc closes the topmost thing: a menu, then a panel, then the phone nav. */
export function escape() {
  const s = getUi();
  if (s.menu) return setUi({ menu: null });
  if (s.search) return closePanel('search');
  if (s.shortcuts) return closePanel('shortcuts');
  if (s.support) return closePanel('support');
  if (s.navOpen) return setUi({ navOpen: false });
}
