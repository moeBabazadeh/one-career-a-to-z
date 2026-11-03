// Display navigation and formatting. The display hierarchy lives in the URL hash, so Back steps
// back through displays the way an HMI's back key does, and any display or faceplate can be linked.
import { useSyncExternalStore } from 'react';
import { UNITS, type UnitId } from './plant';
import type { Prio } from './sim';

export type View =
  'overview' | 'unit' | 'epc' | 'alarms' | 'trends' | 'events' | 'system' | 'report';

export interface Route {
  view: View;
  unit?: UnitId;
  /** The faceplate open over the display: a tag. */
  fp?: string;
}

const VIEWS: View[] = ['overview', 'unit', 'epc', 'alarms', 'trends', 'events', 'system', 'report'];

export function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [v, arg] = path.split('/');
  const view = (VIEWS.includes(v as View) ? v : 'overview') as View;
  const fp = new URLSearchParams(query).get('fp') ?? undefined;
  const unit =
    view === 'unit' ? UNITS.find((u) => u.id === arg || String(u.no) === arg)?.id : undefined;
  if (view === 'unit' && !unit) return { view: 'overview', fp };
  return { view, unit, fp };
}

export const href = (r: Route) =>
  `#/${r.view}${r.unit ? `/${r.unit}` : ''}${r.fp ? `?fp=${encodeURIComponent(r.fp)}` : ''}`;

const subscribeHash = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};

/** The display on screen, from the hash. The server (and first paint) shows the overview. */
export const useHash = () =>
  useSyncExternalStore(
    subscribeHash,
    () => location.hash,
    () => '',
  );

/** Goes to a display; a new display (not just a faceplate) starts at the top. */
export function go(r: Route) {
  const was = parse(location.hash);
  location.hash = href(r);
  if (was.view !== r.view || was.unit !== r.unit) window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ formatting */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local wall-clock time, "14:03:22". */
export const clock = (ms: number) => {
  if (!ms) return '--:--:--';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** "14:03:22.4", for alarm and event times. */
export const stampMs = (ms: number) => (ms ? `${clock(ms)}.${Math.floor((ms % 1000) / 100)}` : '—');

export const day = (ms: number) => {
  if (!ms) return '----------';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A value with the decimals its span calls for. */
export const num = (v: number, span = 100) =>
  Number.isFinite(v) ? v.toFixed(span <= 20 ? 2 : 1) : '----';

export const PRIO_NAME: Record<Prio, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };

export const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable)
  );
};
