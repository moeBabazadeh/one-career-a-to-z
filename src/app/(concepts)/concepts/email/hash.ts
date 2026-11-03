// Where the visitor is, in the address bar, the way web mail does it: #inbox, #starred,
// #label/attendum, #search/from%3Amoe, each with an optional /threadId, and #read for the
// plain page. Back and forward work, and every view and thread has a link.
import { useSyncExternalStore } from 'react';

export const FOLDERS = ['inbox', 'starred', 'drafts', 'sent', 'archive', 'trash', 'all'] as const;
export type Folder = (typeof FOLDERS)[number];

export type View =
  { kind: 'folder'; id: Folder } | { kind: 'label'; id: string } | { kind: 'search'; q: string };

export interface Route {
  view: View;
  thread: string | null;
  /** The plain, read-as-a-page view. */
  read: boolean;
}

const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener('hashchange', l);
  window.addEventListener('popstate', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('hashchange', l);
    window.removeEventListener('popstate', l);
  };
};

export const useHash = () =>
  useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );

const isFolder = (s: string): s is Folder => (FOLDERS as readonly string[]).includes(s);
const dec = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export const INBOX: View = { kind: 'folder', id: 'inbox' };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (h === 'read') return { view: INBOX, thread: null, read: true };
  const parts = h.split('/');
  if (parts[0] === 'label' && parts[1])
    return {
      view: { kind: 'label', id: dec(parts[1]) },
      thread: parts[2] ? dec(parts[2]) : null,
      read: false,
    };
  if (parts[0] === 'search')
    return {
      view: { kind: 'search', q: dec(parts[1] ?? '') },
      thread: parts[2] ? dec(parts[2]) : null,
      read: false,
    };
  if (isFolder(parts[0]))
    return {
      view: { kind: 'folder', id: parts[0] },
      thread: parts[1] ? dec(parts[1]) : null,
      read: false,
    };
  return { view: INBOX, thread: null, read: false };
}

const viewPart = (v: View) =>
  v.kind === 'folder'
    ? v.id
    : v.kind === 'label'
      ? `label/${encodeURIComponent(v.id)}`
      : `search/${encodeURIComponent(v.q)}`;

export const hrefFor = (v: View, thread?: string | null) =>
  `#${viewPart(v)}${thread ? `/${encodeURIComponent(thread)}` : ''}`;

export const sameView = (a: View, b: View) =>
  a.kind === b.kind &&
  (a.kind === 'folder'
    ? a.id === (b as typeof a).id
    : a.kind === 'label'
      ? a.id === (b as typeof a).id
      : a.q === (b as typeof a).q);

/** Goes to a hash. `replace` swaps the history entry, for stepping through threads with j and k. */
export function go(href: string, replace = false) {
  const url = href === '#' || !href ? `${window.location.pathname}${window.location.search}` : href;
  if (url === window.location.hash) return;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  listeners.forEach((l) => l());
}
