'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { db } from '../_shared/data';
import { Avatar, cx, HlContext } from './Body';
import Composer from './Composer';
import { Icon, Mark } from './icons';
import List, { type Item } from './List';
import {
  labelById,
  ME,
  MOE,
  THREADS,
  threadById,
  type Attachment,
  type Message,
  type Thread,
} from './mailbox';
import { Lightbox, Modal, Original, Shortcuts } from './Overlays';
import Plain from './Plain';
import { EmptyPane, SentView, ThreadView, type ReaderActions } from './Reader';
import { forwardFor, quoteFor } from './raw';
import { go, hrefFor, INBOX, parseHash, sameView, useHash, type Folder, type View } from './hash';
import SearchBar from './SearchBar';
import { highlighter, matches, mentionsIn, parse, parts, type Facts } from './search';
import Sidebar, { FOLDER_META } from './Sidebar';
import {
  boxOf,
  dismissToast,
  isRead,
  isStarred,
  move,
  newDraft,
  resetMailbox,
  setCompact,
  setDraftOpen,
  setListWidth,
  setRead,
  setStar,
  undo,
  useMailbox,
  type Box,
  type State,
} from './store';
import s from './mail.module.scss';

const WIDE = '(min-width: 861px)';
const subscribeWide = (cb: () => void) => {
  const mq = matchMedia(WIDE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
// False on the server, so nothing is marked read until the client knows the pane is on screen.
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => matchMedia(WIDE).matches,
    () => false,
  );

type Overlay =
  | { kind: 'keys' }
  | { kind: 'image'; list: Attachment[]; start: number }
  | { kind: 'raw'; t: Thread; m: Message }
  | null;

const factsOf = (st: State, t: Thread): Facts => ({
  starred: isStarred(st, t),
  read: isRead(st, t.id),
  box: boxOf(st, t.id),
});

/** Whether a thread belongs in a view, given its state. */
function inView(view: View, t: Thread, f: Facts, ast: ReturnType<typeof parse> | null) {
  if (view.kind === 'label') return t.labels.includes(view.id) && f.box !== 'trash';
  if (view.kind === 'search')
    return (
      Boolean(ast) &&
      matches(ast as NonNullable<typeof ast>, t, f) &&
      (f.box !== 'trash' || mentionsIn(ast as NonNullable<typeof ast>))
    );
  switch (view.id) {
    case 'inbox':
      return f.box === 'inbox';
    case 'starred':
      return f.starred && f.box !== 'trash';
    case 'archive':
      return f.box === 'archive';
    case 'trash':
      return f.box === 'trash';
    case 'all':
      return f.box !== 'trash';
    default:
      return false;
  }
}

function viewTitle(view: View) {
  if (view.kind === 'folder') return FOLDER_META[view.id].name;
  if (view.kind === 'label') return labelById.get(view.id)?.name ?? view.id;
  return 'Search results';
}

/** The conversations a view lists, newest first, or the visitor's own drafts and sent mail. */
function listItems(
  view: View,
  st: State,
  ast: ReturnType<typeof parse> | null,
  unreadOnly: boolean,
): Item[] {
  if (view.kind === 'folder' && view.id === 'drafts')
    return [...st.drafts].reverse().map((d) => ({ kind: 'draft' as const, id: d.id, d }));
  if (view.kind === 'folder' && view.id === 'sent')
    return st.sent.map((d) => ({ kind: 'sent' as const, id: d.id, d }));
  return THREADS.filter((t) => {
    const f = factsOf(st, t);
    return inView(view, t, f, ast) && (!unreadOnly || !f.read);
  }).map((t) => ({ kind: 'thread' as const, id: t.id, t }));
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function Mail() {
  const hash = useHash();
  const route = parseHash(hash);
  const st = useMailbox();
  const wide = useWide();
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [composing, setComposing] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const gAt = useRef(0);

  const view = route.view;
  const searchQ = view.kind === 'search' ? view.q : '';
  const ast = searchQ ? parse(searchQ) : null;
  const hl = ast ? highlighter(ast) : null;
  const items = listItems(view, st, ast, unreadOnly);

  const threadItems = items.filter(
    (i): i is Extract<Item, { kind: 'thread' }> => i.kind === 'thread',
  );
  const openId = route.thread ?? (hash === '' ? 'welcome' : null);
  const openThread = openId ? (threadById.get(openId) ?? null) : null;
  const openSent = openId && !openThread ? (st.sent.find((x) => x.id === openId) ?? null) : null;
  const pos = items.findIndex((i) => i.id === openId);
  const cursorId =
    cursor && items.some((i) => i.id === cursor) ? cursor : (openId ?? items[0]?.id ?? null);
  const draft = openThread ? (st.drafts.find((d) => d.thread === openThread.id) ?? null) : null;
  const composingDraft = composing ? (st.drafts.find((d) => d.id === composing) ?? null) : null;

  // Opening a conversation marks it read, once the reading pane can actually be seen.
  const paneVisible = wide || route.thread !== null;
  useEffect(() => {
    if (openThread && paneVisible) setRead([openThread.id], true, true);
  }, [openThread, paneVisible]);

  // The tab title carries the Inbox's unread count, as web mail does: "(26) E · Email".
  const inboxUnread = THREADS.filter(
    (t) => boxOf(st, t.id) === 'inbox' && !isRead(st, t.id),
  ).length;
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\) /, '');
      const want = inboxUnread ? `(${inboxUnread}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    // The framework may set the page title again after hydration; keep the count on it.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(/^\(\d+\) /, '');
    };
  }, [inboxUnread]);

  // The open conversation's row stays in sight in the list, however it was opened.
  useEffect(() => {
    if (!openId) return;
    document
      .querySelector(`[data-row="${CSS.escape(openId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [openId]);

  // A fresh view starts with nothing selected.
  const viewKey = hrefFor(view);
  const [selView, setSelView] = useState(viewKey);
  if (selView !== viewKey) {
    setSelView(viewKey);
    setSelected(new Set());
    setCursor(null);
  }

  // The settings menu closes on a click outside it.
  useEffect(() => {
    if (!settings) return;
    const onDown = (e: PointerEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setSettings(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [settings]);

  /* ---------------------------------------------------------------- actions */

  const focusRow = (id: string | null) => {
    if (!id) return;
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`);
      row?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    });
  };

  const openItem = (item: Item, replace = false) => {
    setCursor(item.id);
    if (item.kind === 'draft' && !item.d.thread) {
      setDraftOpen(item.id, true);
      setComposing(item.id);
      return;
    }
    if (item.kind === 'draft') setDraftOpen(item.id, true);
    const target = item.kind === 'draft' ? (item.d.thread as string) : item.id;
    go(hrefFor(view, target), replace);
  };

  const back = () => {
    const id = openId;
    go(hrefFor(view));
    focusRow(id);
  };

  const step = (dir: 1 | -1) => {
    const at = pos >= 0 ? pos : items.findIndex((i) => i.id === cursorId);
    const next = items[at + dir];
    if (next) {
      openItem(next, true);
      focusRow(next.id);
    }
  };

  /** Moves threads, and when the open one leaves this view, opens the next, as mail clients do. */
  const moveThreads = (ids: string[], box: Box) => {
    const openLeaves =
      openThread &&
      ids.includes(openThread.id) &&
      !inView(view, openThread, { ...factsOf(st, openThread), box }, ast);
    const at = openThread ? items.findIndex((i) => i.id === openThread.id) : -1;
    move(ids, box);
    setSelected(new Set());
    if (openLeaves && route.thread !== null) {
      const next =
        items.slice(at + 1).find((i) => !ids.includes(i.id)) ??
        items
          .slice(0, Math.max(0, at))
          .reverse()
          .find((i) => !ids.includes(i.id));
      if (next && next.kind === 'thread') {
        go(hrefFor(view, next.id), true);
        setCursor(next.id);
      } else go(hrefFor(view), true);
    }
  };

  const compose = () => {
    const id = newDraft({ mode: 'new', to: MOE.address, subject: '', body: '' });
    setComposing(id);
  };

  const reply = (t: Thread) => {
    const last = t.messages[t.messages.length - 1];
    newDraft({
      mode: 'reply',
      thread: t.id,
      to: MOE.address,
      subject: `Re: ${t.subject}`,
      body: `\n\n${quoteFor(last)}`,
    });
    if (route.thread !== t.id) go(hrefFor(view, t.id));
  };

  const forward = (t: Thread) => {
    const last = t.messages[t.messages.length - 1];
    const link = `${window.location.origin}${window.location.pathname}${hrefFor(INBOX, t.id)}`;
    newDraft({
      mode: 'forward',
      thread: t.id,
      to: '',
      subject: `Fwd: ${t.subject}`,
      body: `\n\n${forwardFor(t, last, link)}`,
    });
    if (route.thread !== t.id) go(hrefFor(view, t.id));
  };

  const act: ReaderActions = {
    back,
    step,
    reply,
    forward,
    original: (t, m) => setOverlay({ kind: 'raw', t, m }),
    preview: (a) => {
      const list = openThread
        ? openThread.messages.flatMap((m) => m.attachments).filter((x) => x.kind === 'image')
        : [a];
      setOverlay({ kind: 'image', list, start: Math.max(0, list.indexOf(a)) });
    },
    compose,
    archive: (t) => moveThreads([t.id], 'archive'),
    trash: (t) => moveThreads([t.id], 'trash'),
    restore: (t) => moveThreads([t.id], 'inbox'),
    unread: (t) => {
      setRead([t.id], false);
      back();
    },
  };

  /** What a keyboard action applies to: the selection, else the open conversation, else the cursor's. */
  const targets = (): Thread[] => {
    if (selected.size)
      return [...selected].map((id) => threadById.get(id)).filter((t): t is Thread => Boolean(t));
    if (openThread && paneVisible) return [openThread];
    const t = cursorId ? threadById.get(cursorId) : undefined;
    return t ? [t] : [];
  };

  /* ---------------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (overlay || composing || route.read) return;
      const k = e.key;

      // Two-key "go to" shortcuts: g, then a letter, within a second.
      if (gAt.current && performance.now() - gAt.current < 1200) {
        gAt.current = 0;
        const to: Record<string, Folder> = {
          i: 'inbox',
          s: 'starred',
          t: 'sent',
          d: 'drafts',
          e: 'archive',
          a: 'all',
        };
        if (to[k]) {
          e.preventDefault();
          go(hrefFor({ kind: 'folder', id: to[k] }));
        }
        return;
      }

      const thread = (fn: (t: Thread[]) => void) => {
        const list = targets();
        if (list.length) fn(list);
      };

      switch (k) {
        case 'g':
          gAt.current = performance.now();
          break;
        case 'j':
        case 'k': {
          e.preventDefault();
          const dir = k === 'j' ? 1 : -1;
          if (openThread && paneVisible && pos >= 0) step(dir);
          else {
            const at = items.findIndex((i) => i.id === cursorId);
            const next = items[Math.min(items.length - 1, Math.max(0, at + dir))];
            if (next) {
              setCursor(next.id);
              focusRow(next.id);
            }
          }
          break;
        }
        case 'o':
        case 'Enter': {
          if (k === 'Enter' && el?.closest('a, button')) return;
          const item = items.find((i) => i.id === cursorId);
          if (item) {
            e.preventDefault();
            openItem(item);
          }
          break;
        }
        case 'u':
          if (route.thread) {
            e.preventDefault();
            back();
          }
          break;
        case 'Escape':
          if (selected.size) setSelected(new Set());
          else if (route.thread && !wide) back();
          else if (view.kind === 'search') go(hrefFor(INBOX));
          break;
        case 'e':
          thread((ts) => {
            const allArchived = ts.every((t) => boxOf(st, t.id) === 'archive');
            moveThreads(
              ts.map((t) => t.id),
              allArchived ? 'inbox' : 'archive',
            );
          });
          break;
        case '#':
          thread((ts) =>
            moveThreads(
              ts.map((t) => t.id),
              'trash',
            ),
          );
          break;
        case 's':
          thread((ts) =>
            setStar(
              ts.map((t) => t.id),
              !ts.every((t) => isStarred(st, t)),
            ),
          );
          break;
        case 'U':
          thread((ts) => {
            setRead(
              ts.map((t) => t.id),
              false,
            );
            if (openThread && ts.includes(openThread) && route.thread) back();
          });
          break;
        case 'I':
          thread((ts) =>
            setRead(
              ts.map((t) => t.id),
              true,
            ),
          );
          break;
        case 'x': {
          const id = cursorId;
          if (id && threadById.has(id)) {
            setSelected((sel) => {
              const n = new Set(sel);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            });
          }
          break;
        }
        case 'z':
          undo();
          break;
        case '/':
          e.preventDefault();
          document.getElementById('mail-search')?.focus();
          break;
        case 'c':
          e.preventDefault();
          compose();
          break;
        case 'r':
        case 'a':
          if (openThread) {
            e.preventDefault();
            reply(openThread);
          }
          break;
        case 'f':
          if (openThread) {
            e.preventDefault();
            forward(openThread);
          }
          break;
        case '?':
          e.preventDefault();
          setOverlay({ kind: 'keys' });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------------------------------------------------------------- the list's width */

  const listW = st.listW;
  const onResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    const list = root?.querySelector<HTMLElement>(`.${s.listPane}`);
    if (!root || !list) return;
    const left = list.getBoundingClientRect().left;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let w = list.offsetWidth;
    const moveTo = (ev: PointerEvent) => {
      w = Math.round(Math.min(640, Math.max(300, ev.clientX - left)));
      root.style.setProperty('--list-w', `${w}px`);
    };
    const up = () => {
      handle.removeEventListener('pointermove', moveTo);
      handle.removeEventListener('pointerup', up);
      setListWidth(w);
    };
    handle.addEventListener('pointermove', moveTo);
    handle.addEventListener('pointerup', up);
  };

  const onResizeKey = (e: React.KeyboardEvent) => {
    const now = listW ?? 400;
    if (e.key === 'ArrowLeft') setListWidth(Math.max(300, now - 24));
    else if (e.key === 'ArrowRight') setListWidth(Math.min(640, now + 24));
    else if (e.key === 'Home') setListWidth(null);
  };

  /* ---------------------------------------------------------------- render */

  if (route.read) return <Plain />;

  const unread = threadItems.filter((i) => !isRead(st, i.id)).length;
  const allSelected = threadItems.length > 0 && threadItems.every((i) => selected.has(i.id));
  const selList = [...selected];
  const title = viewTitle(view);
  const label = view.kind === 'label' ? labelById.get(view.id) : undefined;

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-reading={route.thread !== null || undefined}
      data-compact={st.compact || undefined}
      style={listW ? ({ '--list-w': `${listW}px` } as React.CSSProperties) : undefined}
    >
      <a href="#mail-list" className={s.skip}>
        Skip to the conversations
      </a>
      <header className={s.top}>
        <button
          type="button"
          className={cx(s.iconBtn, s.menuBtn)}
          onClick={() => setDrawer(true)}
          aria-label="Mailboxes and labels"
          aria-expanded={drawer}
        >
          <Icon.menu size={20} />
        </button>
        <a href="#inbox" className={s.brand} aria-label={`${db.person.site} mail, Inbox`}>
          <Mark />
          <span className={s.brandName}>{db.person.site}</span>
          <span className={s.brandApp}>Mail</span>
        </a>
        <SearchBar key={searchQ} initial={searchQ} />
        <div className={s.topRight}>
          <button
            type="button"
            className={cx(s.iconBtn, s.topHelp)}
            onClick={() => setOverlay({ kind: 'keys' })}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Icon.keyboard size={19} />
          </button>
          <div className={s.menuWrap} ref={settingsRef}>
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => setSettings(!settings)}
              aria-expanded={settings}
              aria-haspopup="menu"
              aria-label="Settings"
              title="Settings"
            >
              <Icon.settings size={19} />
            </button>
            {settings && (
              <div className={cx(s.menu, s.menuRight)} role="menu">
                <p className={s.menuHead}>Density</p>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={!st.compact}
                  onClick={() => setCompact(false)}
                >
                  <span className={s.radio} /> Comfortable
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={st.compact}
                  onClick={() => setCompact(true)}
                >
                  <span className={s.radio} /> Compact
                </button>
                <hr />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSettings(false);
                    setOverlay({ kind: 'keys' });
                  }}
                >
                  <Icon.keyboard size={16} /> Keyboard shortcuts
                </button>
                <a role="menuitem" href="#read" onClick={() => setSettings(false)}>
                  <Icon.page size={16} /> Read as a page
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSettings(false);
                    setSelected(new Set());
                    resetMailbox();
                  }}
                >
                  <Icon.restore size={16} /> Reset mailbox
                </button>
              </div>
            )}
          </div>
          <span className={s.me} title="You, reading as a guest">
            <Avatar sender={ME} size={32} />
          </span>
        </div>
      </header>

      <div className={s.frame}>
        <div className={s.side} data-open={drawer || undefined}>
          <div className={s.drawerHead}>
            <Mark />
            <b>{db.person.site}</b>
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => setDrawer(false)}
              aria-label="Close"
            >
              <Icon.x size={18} />
            </button>
          </div>
          <Sidebar
            view={view}
            onCompose={() => {
              setDrawer(false);
              compose();
            }}
            onNavigate={() => setDrawer(false)}
            onKeys={() => {
              setDrawer(false);
              setOverlay({ kind: 'keys' });
            }}
          />
        </div>
        {drawer && (
          <div className={s.drawerScrim} onClick={() => setDrawer(false)} aria-hidden="true" />
        )}

        <HlContext.Provider value={hl}>
          <section className={s.listPane} aria-labelledby="list-title" id="mail-list" tabIndex={-1}>
            <div className={s.listHead}>
              <div className={s.listTitleRow}>
                {threadItems.length > 0 && (
                  <label className={s.selectAll} title="Select all">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) =>
                        void (el && (el.indeterminate = selected.size > 0 && !allSelected))
                      }
                      onChange={() =>
                        setSelected(allSelected ? new Set() : new Set(threadItems.map((i) => i.id)))
                      }
                      aria-label="Select all conversations"
                    />
                  </label>
                )}
                <h2 id="list-title" className={s.listTitle}>
                  {label && (
                    <span
                      className={s.labelDot}
                      style={{ '--h': label.hue } as React.CSSProperties}
                      aria-hidden="true"
                    />
                  )}
                  {title}
                </h2>
                <span className={s.grow} />
                {threadItems.length > 0 || unreadOnly ? (
                  <button
                    type="button"
                    className={s.filterChip}
                    aria-pressed={unreadOnly}
                    onClick={() => setUnreadOnly(!unreadOnly)}
                  >
                    Unread{unread > 0 && !unreadOnly ? ` · ${unread}` : ''}
                  </button>
                ) : null}
              </div>
              <p className={s.listSub}>
                {view.kind === 'folder' && view.id === 'sent'
                  ? 'Drafts you handed to your mail app'
                  : view.kind === 'folder' && view.id === 'drafts'
                    ? 'Saved in this browser as you type'
                    : `${plural(items.length, 'conversation')}${unread ? ` · ${unread} unread` : ''}`}
              </p>
              {view.kind === 'search' && (
                <ul className={s.queryChips} aria-label="Search terms">
                  {parts(view.q).map((p) => (
                    <li key={p.key} data-kind={p.kind}>
                      <span>{p.label}</span>
                      <a
                        href={p.rest ? hrefFor({ kind: 'search', q: p.rest }) : hrefFor(INBOX)}
                        aria-label={`Remove ${p.label}`}
                      >
                        <Icon.x size={13} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {selected.size > 0 && (
                <div className={s.bulk} role="toolbar" aria-label="Selected conversations">
                  <b>{selected.size} selected</b>
                  <span className={s.grow} />
                  <button
                    type="button"
                    className={s.iconBtn}
                    onClick={() =>
                      moveThreads(
                        selList,
                        view.kind === 'folder' && view.id === 'archive' ? 'inbox' : 'archive',
                      )
                    }
                    aria-label="Archive selected"
                    title="Archive (e)"
                  >
                    <Icon.archive size={18} />
                  </button>
                  <button
                    type="button"
                    className={s.iconBtn}
                    onClick={() =>
                      moveThreads(
                        selList,
                        view.kind === 'folder' && view.id === 'trash' ? 'inbox' : 'trash',
                      )
                    }
                    aria-label="Delete selected"
                    title="Delete (#)"
                  >
                    <Icon.trash size={18} />
                  </button>
                  <button
                    type="button"
                    className={s.iconBtn}
                    onClick={() => setRead(selList, true)}
                    aria-label="Mark selected as read"
                    title="Mark as read (I)"
                  >
                    <Icon.read size={18} />
                  </button>
                  <button
                    type="button"
                    className={s.iconBtn}
                    onClick={() => setRead(selList, false)}
                    aria-label="Mark selected as unread"
                    title="Mark as unread (U)"
                  >
                    <Icon.unread size={18} />
                  </button>
                  <button
                    type="button"
                    className={s.iconBtn}
                    onClick={() => setStar(selList, true)}
                    aria-label="Star selected"
                    title="Star (s)"
                  >
                    <Icon.star size={18} />
                  </button>
                  <button
                    type="button"
                    className={s.iconBtn}
                    onClick={() => setSelected(new Set())}
                    aria-label="Clear selection"
                    title="Clear selection (Esc)"
                  >
                    <Icon.x size={18} />
                  </button>
                </div>
              )}
            </div>
            <div className={s.listScroll}>
              {items.length ? (
                <List
                  items={items}
                  view={view}
                  st={st}
                  cursor={cursorId}
                  openId={openId}
                  selected={selected}
                  grouped={view.kind !== 'folder' || (view.id !== 'drafts' && view.id !== 'sent')}
                  onSelect={(id, on) =>
                    setSelected((sel) => {
                      const n = new Set(sel);
                      if (on) n.add(id);
                      else n.delete(id);
                      return n;
                    })
                  }
                  onOpen={(item) => setCursor(item.id)}
                />
              ) : (
                <EmptyList
                  view={view}
                  unreadOnly={unreadOnly}
                  onShowAll={() => setUnreadOnly(false)}
                />
              )}
            </div>
          </section>

          <div
            className={s.resizer}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the list"
            aria-valuenow={listW ?? 400}
            aria-valuemin={300}
            aria-valuemax={640}
            tabIndex={0}
            onPointerDown={onResize}
            onKeyDown={onResizeKey}
            onDoubleClick={() => setListWidth(null)}
          />

          <main className={s.pane} aria-label="Reading pane">
            {openThread ? (
              <ThreadView
                key={`${openThread.id}|${searchQ}`}
                t={openThread}
                st={st}
                pos={pos}
                total={items.length}
                draft={draft}
                act={act}
              />
            ) : openSent ? (
              <SentView d={openSent} act={act} />
            ) : (
              <EmptyPane st={st} total={items.length} onCompose={compose} />
            )}
          </main>
        </HlContext.Provider>
      </div>

      <button type="button" className={s.fab} onClick={compose} aria-label="Compose">
        <Icon.compose size={20} />
        <span>Compose</span>
      </button>

      <div className={s.toasts} role="status" aria-live="polite">
        {st.toast && (
          <div className={s.toast} key={st.toast.id}>
            <span>{st.toast.text}</span>
            {st.toast.undo && (
              <button type="button" onClick={undo}>
                Undo <kbd>z</kbd>
              </button>
            )}
            <button type="button" className={s.toastX} onClick={dismissToast} aria-label="Dismiss">
              <Icon.x size={14} />
            </button>
          </div>
        )}
      </div>

      {composingDraft && (
        <Modal
          label="New message"
          onClose={() => setComposing(null)}
          className={s.composeModal}
          dismissable={false}
        >
          <Composer
            key={composingDraft.id}
            draft={composingDraft}
            variant="modal"
            onClose={() => {
              setDraftOpen(composingDraft.id, false);
              setComposing(null);
            }}
          />
        </Modal>
      )}
      {overlay?.kind === 'keys' && <Shortcuts onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'image' && (
        <Lightbox list={overlay.list} start={overlay.start} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'raw' && (
        <Original t={overlay.t} m={overlay.m} onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}

function EmptyList({
  view,
  unreadOnly,
  onShowAll,
}: {
  view: View;
  unreadOnly: boolean;
  onShowAll: () => void;
}) {
  if (unreadOnly)
    return (
      <div className={s.listEmpty}>
        <Icon.check size={28} />
        <p>No unread mail here.</p>
        <button type="button" className={s.textBtn} onClick={onShowAll}>
          Show all
        </button>
      </div>
    );
  if (view.kind === 'search')
    return (
      <div className={s.listEmpty}>
        <Icon.search size={28} />
        <p>No mail matches.</p>
        <p className={s.muted}>
          Try fewer words, or an operator such as <code>label:robotics</code> or{' '}
          <code>after:2020</code>.
        </p>
      </div>
    );
  const inbox = sameView(view, INBOX);
  return (
    <div className={s.listEmpty}>
      {inbox ? (
        <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden="true" className={s.zero}>
          <circle cx={32} cy={32} r={13} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <path
                key={i}
                d={`M${32 + Math.cos(a) * 19} ${32 + Math.sin(a) * 19}L${32 + Math.cos(a) * 26} ${32 + Math.sin(a) * 26}`}
              />
            );
          })}
        </svg>
      ) : (
        <Icon.inbox size={28} />
      )}
      <p>
        {inbox
          ? 'Inbox zero. Everything is filed.'
          : view.kind === 'folder' && view.id === 'sent'
            ? 'Nothing sent yet. Send hands a draft to your own mail app, and it shows up here.'
            : view.kind === 'folder' && view.id === 'drafts'
              ? 'No drafts. Press c to write to Moe.'
              : 'Nothing here.'}
      </p>
      {inbox && (
        <a className={s.textBtn} href={hrefFor({ kind: 'folder', id: 'archive' })}>
          Open the Archive
        </a>
      )}
    </div>
  );
}
