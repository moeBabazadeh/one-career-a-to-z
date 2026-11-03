// Page-wide state as small external stores: the console (shared by every "Try it" button, the
// rate-limit meter and ⌘K), the search dialog, and the visitor's language tab.
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  LATEST,
  RATE_LIMIT,
  handle,
  hash,
  problem,
  tooMany,
  type ApiResult,
  type Method,
} from './model';
import { LANGS, pretty, type Lang } from './code';

/* ------------------------------------------------------------------ console */

export interface Draft {
  name: string;
  email: string;
  subject: string;
  body: string;
}

export interface Phase {
  label: string;
  start: number;
  ms: number;
}

export interface Exchange {
  id: string;
  method: Method;
  target: string;
  version: string;
  result: ApiResult;
  headers: [string, string][];
  text: string;
  size: number;
  timing: Phase[];
  total: number;
  reused: boolean;
}

export interface ConsoleState {
  open: boolean;
  method: Method;
  target: string;
  version: string;
  draft: Draft;
  key: string;
  pending: Exchange | null;
  exchange: Exchange | null;
  history: Exchange[];
  used: number;
  resetAt: number;
  connectedAt: number;
  search: number;
  searchOpen: boolean;
}

const INITIAL: ConsoleState = {
  open: false,
  method: 'GET',
  target: '/v1/me',
  version: LATEST,
  draft: { name: '', email: '', subject: '', body: '' },
  key: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  pending: null,
  exchange: null,
  history: [],
  used: 0,
  resetAt: 0,
  connectedAt: -Infinity,
  search: 0,
  searchOpen: false,
};

let state = INITIAL;
const listeners = new Set<() => void>();
const emit = (patch: Partial<ConsoleState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useConsole = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
export const setRequest = (
  patch: Partial<Pick<ConsoleState, 'method' | 'target' | 'version' | 'key'>>,
) => emit(patch);
export const setDraft = (patch: Partial<Draft>) => emit({ draft: { ...state.draft, ...patch } });
export const showExchange = (exchange: Exchange) =>
  emit({ exchange, method: exchange.method, target: exchange.target, version: exchange.version });

let opener: HTMLElement | null = null;

export function openConsole(
  preset: Partial<Pick<ConsoleState, 'method' | 'target' | 'version'>> & { send?: boolean } = {},
) {
  if (!state.open && document.activeElement instanceof HTMLElement) opener = document.activeElement;
  const { send: andSend, ...request } = preset;
  emit({ open: true, ...request });
  if (andSend) send();
}

export function closeConsole() {
  emit({ open: false });
  opener?.focus({ preventScroll: true });
  opener = null;
}

/** Esc from anywhere on the page closes the console, unless the search dialog has it. */
export function closeOnEscape() {
  if (state.open && !state.searchOpen) closeConsole();
}

export const openSearch = () => emit({ searchOpen: true, search: state.search + 1 });
export const closeSearch = () => emit({ searchOpen: false });

const randomId = (length: number) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export const newKey = () =>
  emit({
    key:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${randomId(8)}-${randomId(4)}-${randomId(4)}`,
  });

// Idempotency keys this tab has used, with the body each one was first sent with.
const seenKeys = new Map<string, string>();

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** A DevTools-style timing breakdown. Simulated: the response itself is computed locally. */
function timing(reused: boolean, size: number): Phase[] {
  const spans: [string, number][] = [
    ['Queued', between(0.3, 1.4)],
    ['DNS', reused ? 0 : between(6, 22)],
    ['Connect', reused ? 0 : between(8, 24)],
    ['TLS', reused ? 0 : between(12, 32)],
    ['Send', between(0.2, 0.7)],
    ['Wait (TTFB)', between(24, 72) + size / 500],
    ['Download', between(0.8, 3) + size / 1800],
  ];
  let t = 0;
  return spans.map(([label, ms]) => {
    const phase = { label, start: t, ms };
    t += ms;
    return phase;
  });
}

/** How much the simulated latency is slowed down so you can watch it; none for reduced motion. */
const slowdown = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 6);

/** Sends the current request after its simulated latency. */
export function send(slow = slowdown()) {
  if (state.pending) return;
  const now = Date.now();
  let { used, resetAt } = state;
  if (now >= resetAt) [used, resetAt] = [0, now + 60_000];
  const retry = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const limited = used >= RATE_LIMIT;
  used = Math.min(RATE_LIMIT, used + 1);

  const { method, target, version, key } = state;
  const body = method === 'POST' ? { ...state.draft } : undefined;
  let result = limited ? tooMany(retry) : handle({ method, target, version, body, key });
  let replayed = false;
  if (!limited && result.status === 202) {
    const print = JSON.stringify(body);
    const seen = seenKeys.get(key);
    if (seen && seen !== print)
      result = problem(
        422,
        'idempotency-key-reused',
        'Idempotency-Key reused',
        'This key was already used with a different body. Generate a new key to send a different message.',
        { param: 'Idempotency-Key' },
      );
    else if (seen) replayed = true;
    else seenKeys.set(key, print);
  }

  const text = result.body === null ? '' : pretty(result.body);
  const size = new TextEncoder().encode(text).length;
  const reused = now - state.connectedAt < 60_000;
  const phases = timing(reused, size);
  const last = phases[phases.length - 1];
  const total = last.start + last.ms;
  const id = `req_${randomId(14)}`;
  const ok = result.status < 300;
  const headers: [string, string][] = [
    ['date', new Date(now).toUTCString()],
    ...result.headers,
    ['content-length', String(size)],
    ['api-version', version],
    ['cache-control', ok && method === 'GET' ? 'public, max-age=60' : 'no-store'],
    ...(ok && text ? ([['etag', `W/"${hash(text).toString(16)}"`]] as [string, string][]) : []),
    ...(replayed ? ([['idempotent-replayed', 'true']] as [string, string][]) : []),
    ['ratelimit-limit', String(RATE_LIMIT)],
    ['ratelimit-remaining', String(RATE_LIMIT - used)],
    ['ratelimit-reset', String(retry)],
    ['x-request-id', id],
    [
      'server-timing',
      `data;dur=${between(0.4, 2.2).toFixed(1)};desc="data.ts", render;dur=${between(0.2, 1.1).toFixed(1)}`,
    ],
  ];
  const exchange: Exchange = {
    id,
    method,
    target,
    version,
    result,
    headers,
    text,
    size,
    timing: phases,
    total,
    reused,
  };
  emit({ pending: exchange, used, resetAt, connectedAt: now });
  window.setTimeout(
    () => emit({ pending: null, exchange, history: [exchange, ...state.history].slice(0, 8) }),
    total * slow,
  );
}

/** Requests left this minute. Ticks down to the reset, then stops. */
export function useRateLimit() {
  const c = useConsole();
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!c.used) return;
    let timer = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= c.resetAt) window.clearInterval(timer);
    };
    const first = window.setTimeout(tick, 0);
    timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [c.used, c.resetAt]);
  const t = Math.max(now, c.resetAt - 60_000);
  const live = c.used > 0 && t < c.resetAt;
  return {
    used: live ? c.used : 0,
    remaining: live ? RATE_LIMIT - c.used : RATE_LIMIT,
    resetIn: live ? Math.ceil((c.resetAt - t) / 1000) : 60,
  };
}

/* ------------------------------------------------------------------ language tabs */

const LANG_KEY = 'api-concept:lang';
const langListeners = new Set<() => void>();
let memoryLang: Lang | null = null;

function readLang(): Lang {
  if (memoryLang) return memoryLang;
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (LANGS.some((l) => l.id === stored)) return stored as Lang;
  } catch {
    // Storage can be blocked; the in-memory choice still works for this visit.
  }
  return 'curl';
}

const subscribeLang = (l: () => void) => {
  langListeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== LANG_KEY) return;
    memoryLang = null;
    l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    langListeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
};

/** The visitor's language, shared by every code panel and remembered across visits and tabs. */
export const useLang = () => useSyncExternalStore(subscribeLang, readLang, () => 'curl' as Lang);

export function setLang(lang: Lang) {
  memoryLang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Not persisted; fine.
  }
  langListeners.forEach((l) => l());
}

/* ------------------------------------------------------------------ platform */

const noop = () => () => {};

/** "⌘" on Apple devices, "Ctrl" elsewhere. */
export const useModKey = () =>
  useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'),
    () => '⌘',
  );
