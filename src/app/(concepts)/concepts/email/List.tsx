'use client';

import { useEffect, useRef } from 'react';
import { Avatar, Hl, LabelChip } from './Body';
import { ago, bucket, fullDate } from './dates';
import { Icon } from './icons';
import { labelById, ME, MOE, type Thread } from './mailbox';
import { hrefFor, type View } from './hash';
import {
  boxOf,
  isRead,
  isStarred,
  move,
  setRead,
  toggleStar,
  type Draft,
  type Sent,
  type State,
} from './store';
import s from './mail.module.scss';

export type Item =
  | { kind: 'thread'; id: string; t: Thread }
  | { kind: 'draft'; id: string; d: Draft }
  | { kind: 'sent'; id: string; d: Sent };

interface Props {
  items: Item[];
  view: View;
  st: State;
  cursor: string | null;
  openId: string | null;
  selected: Set<string>;
  grouped: boolean;
  onSelect: (id: string, on: boolean) => void;
  onOpen: (item: Item) => void;
}

/** Who's in the thread, as the list shows it: "Moe Babazadeh", or "Moe, me (3)" once you've replied. */
function senders(t: Thread, st: State) {
  const replies = st.sent.filter((x) => x.thread === t.id).length;
  const n = t.messages.length + replies;
  const names = [...new Set(t.messages.map((m) => m.from))];
  const label = replies
    ? [...names.map((x) => x.short), ME.short].join(', ')
    : names.map((x) => x.name).join(', ');
  return { label, n };
}

/* ------------------------------------------------------------------ swipe */

const SWIPE = 0.32;

/**
 * Swipe a row on a touch screen: left to archive, right to mark read or unread. The row follows
 * the finger, the action underneath arms past a third of the width, and a release past it acts.
 */
function useSwipe(onLeft: () => void, onRight: () => void) {
  const row = useRef<HTMLDivElement>(null);
  const actions = useRef({ onLeft, onRight });
  useEffect(() => {
    actions.current = { onLeft, onRight };
  });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let g: { x: number; y: number; id: number; on: boolean; dx: number } | null = null;
    let swallow = false;

    const place = (dx: number, animate: boolean) => {
      el.style.transition = animate ? 'transform 220ms cubic-bezier(.2,.8,.2,1)' : 'none';
      el.style.transform = dx ? `translateX(${dx}px)` : '';
      const li = el.parentElement as HTMLElement;
      li.dataset.swipe = dx < 0 ? 'left' : dx > 0 ? 'right' : '';
      li.dataset.armed = Math.abs(dx) > el.offsetWidth * SWIPE ? 'true' : '';
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.button !== 0) return;
      g = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false, dx: 0 };
    };
    const move = (e: PointerEvent) => {
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          g = null;
          return;
        }
        if (Math.abs(dx) < 10) return;
        g.on = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; the swipe still follows the moves it gets.
        }
      }
      g.dx = dx;
      // A little resistance past three quarters, as native lists have.
      const lim = el.offsetWidth * 0.75;
      const mag = Math.abs(dx) > lim ? lim + (Math.abs(dx) - lim) * 0.2 : Math.abs(dx);
      place(Math.sign(dx) * mag, false);
    };
    const up = () => {
      const s0 = g;
      g = null;
      if (!s0 || !s0.on) return;
      swallow = true;
      const w = el.offsetWidth;
      if (s0.dx < -w * SWIPE) {
        place(-w, true);
        window.setTimeout(() => {
          actions.current.onLeft();
          place(0, false);
        }, 200);
      } else if (s0.dx > w * SWIPE) {
        place(0, true);
        actions.current.onRight();
      } else place(0, true);
    };
    const cancel = () => {
      g = null;
      place(0, true);
    };
    const click = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('click', click, true);
    };
  }, []);

  return row;
}

/* ------------------------------------------------------------------ rows */

function ThreadRow({
  t,
  view,
  st,
  cursor,
  open,
  selected,
  onSelect,
  onOpen,
}: {
  t: Thread;
  view: View;
  st: State;
  cursor: boolean;
  open: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
}) {
  const read = isRead(st, t.id);
  const star = isStarred(st, t);
  const box = boxOf(st, t.id);
  const { label, n } = senders(t, st);
  const draft = st.drafts.some((d) => d.thread === t.id);
  const swipe = useSwipe(
    () => move([t.id], box === 'inbox' ? 'archive' : 'inbox'),
    () => setRead([t.id], !read),
  );
  const labels = t.labels
    .map((id) => labelById.get(id))
    .filter((l) => l && !(view.kind === 'label' && view.id === l.id));
  const first = t.messages[t.messages.length - 1].from;

  return (
    <li
      className={s.row}
      data-row={t.id}
      data-unread={!read || undefined}
      data-cursor={cursor || undefined}
      data-open={open || undefined}
      data-selected={selected || undefined}
    >
      <div className={s.swipeBg} aria-hidden="true">
        <span className={s.swipeRight}>
          {read ? <Icon.unread size={20} /> : <Icon.read size={20} />}
          {read ? 'Unread' : 'Read'}
        </span>
        <span className={s.swipeLeft}>
          {box === 'inbox' ? <Icon.archive size={20} /> : <Icon.inbox size={20} />}
          {box === 'inbox' ? 'Archive' : 'Inbox'}
        </span>
      </div>
      <div className={s.rowInner} ref={swipe}>
        <label className={s.pick} title="Select (x)">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select “${t.subject}”`}
          />
          <span className={s.pickAvatar}>
            <Avatar sender={first} size={34} />
          </span>
          <span className={s.pickBox} aria-hidden="true">
            <Icon.check size={14} />
          </span>
        </label>
        <a
          href={hrefFor(view, t.id)}
          className={s.rowLink}
          onClick={onOpen}
          aria-label={`${read ? '' : 'Unread, '}${star ? 'starred, ' : ''}${label}: ${t.subject}. ${fullDate(t.date)}.`}
        >
          <span className={s.rowTop}>
            {!read && <span className={s.unreadDot} aria-hidden="true" />}
            <span className={s.from}>
              {label}
              {n > 1 && <span className={s.n}>{n}</span>}
            </span>
            {draft && <span className={s.draftTag}>Draft</span>}
            {t.hasAttachment && (
              <span className={s.clip} title="Has attachments">
                <Icon.clip size={14} />
              </span>
            )}
            <time className={s.date} title={`${fullDate(t.date)} · ${ago(t.date)}`}>
              {ago(t.date, true)}
            </time>
          </span>
          <span className={s.subject}>
            <Hl text={t.subject} />
          </span>
          <span className={s.snippet}>
            <Hl text={t.snippet} />
          </span>
          {(labels.length > 0 || box !== 'inbox') && (
            <span className={s.chips}>
              {box !== 'inbox' && view.kind !== 'folder' && (
                <span className={s.boxTag}>{box === 'archive' ? 'Archived' : 'Trash'}</span>
              )}
              {labels.slice(0, 3).map((l) => l && <LabelChip key={l.id} label={l} />)}
              {labels.length > 3 && <span className={s.more}>+{labels.length - 3}</span>}
            </span>
          )}
        </a>
        <button
          type="button"
          className={s.starBtn}
          data-on={star || undefined}
          onClick={() => toggleStar(t)}
          aria-pressed={star}
          aria-label={star ? 'Unstar' : 'Star'}
          title={star ? 'Unstar (s)' : 'Star (s)'}
        >
          {star ? <Icon.starFill size={17} /> : <Icon.star size={17} />}
        </button>
        <span className={s.hoverActions}>
          {box !== 'trash' && (
            <button
              type="button"
              onClick={() => move([t.id], box === 'archive' ? 'inbox' : 'archive')}
              aria-label={box === 'archive' ? 'Move to Inbox' : 'Archive'}
              title={box === 'archive' ? 'Move to Inbox' : 'Archive (e)'}
            >
              {box === 'archive' ? <Icon.inbox size={17} /> : <Icon.archive size={17} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => move([t.id], box === 'trash' ? 'inbox' : 'trash')}
            aria-label={box === 'trash' ? 'Restore to Inbox' : 'Delete'}
            title={box === 'trash' ? 'Restore to Inbox' : 'Delete (#)'}
          >
            {box === 'trash' ? <Icon.restore size={17} /> : <Icon.trash size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setRead([t.id], !read)}
            aria-label={read ? 'Mark as unread' : 'Mark as read'}
            title={read ? 'Mark as unread (U)' : 'Mark as read (I)'}
          >
            {read ? <Icon.unread size={17} /> : <Icon.read size={17} />}
          </button>
        </span>
      </div>
    </li>
  );
}

function MineRow({
  item,
  view,
  cursor,
  open,
  onOpen,
}: {
  item: Extract<Item, { kind: 'draft' | 'sent' }>;
  view: View;
  cursor: boolean;
  open: boolean;
  onOpen: () => void;
}) {
  const d = item.d;
  const sent = item.kind === 'sent';
  const href = d.thread && !sent ? hrefFor(view, d.thread) : sent ? hrefFor(view, d.id) : '#drafts';
  return (
    <li
      className={s.row}
      data-row={item.id}
      data-cursor={cursor || undefined}
      data-open={open || undefined}
    >
      <div className={s.rowInner}>
        <span className={s.pick}>
          <span className={s.pickAvatar}>
            <Avatar sender={ME} size={34} />
          </span>
        </span>
        <a
          href={href}
          className={s.rowLink}
          onClick={(e) => {
            if (!d.thread && !sent) e.preventDefault();
            onOpen();
          }}
        >
          <span className={s.rowTop}>
            <span className={s.from}>
              {sent ? (
                <>To: {d.mode === 'forward' ? d.to || 'no one yet' : MOE.name}</>
              ) : (
                <span className={s.draftTag}>Draft</span>
              )}
              {!sent && <> to {d.mode === 'forward' ? d.to || '…' : MOE.short}</>}
            </span>
            <span className={s.date}>{sent ? (item.d as Sent).sentAt : d.saved}</span>
          </span>
          <span className={s.subject}>{d.subject || '(no subject)'}</span>
          <span className={s.snippet}>
            {d.body.split('\n> ')[0].trim() || (sent ? 'Handed to your mail app' : 'Empty draft')}
          </span>
          {sent && (
            <span className={s.chips}>
              <span className={s.boxTag}>Handed to your mail app</span>
            </span>
          )}
        </a>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ list */

export default function List({
  items,
  view,
  st,
  cursor,
  openId,
  selected,
  grouped,
  onSelect,
  onOpen,
}: Props) {
  const heads = items.map((item) =>
    grouped && item.kind === 'thread' ? bucket(item.t.date) : null,
  );
  return (
    <ul className={s.rows} aria-label="Conversations">
      {items.map((item, i) => {
        const head = heads[i];
        const showHead = head && head.key !== heads[i - 1]?.key;
        return [
          showHead ? (
            <li key={`h-${head.key}`} className={s.bucket} aria-hidden="true">
              {head.label}
            </li>
          ) : null,
          item.kind === 'thread' ? (
            <ThreadRow
              key={item.id}
              t={item.t}
              view={view}
              st={st}
              cursor={cursor === item.id}
              open={openId === item.id}
              selected={selected.has(item.id)}
              onSelect={(on) => onSelect(item.id, on)}
              onOpen={() => onOpen(item)}
            />
          ) : (
            <MineRow
              key={item.id}
              item={item}
              view={view}
              cursor={cursor === item.id}
              open={openId === item.id || openId === item.d.thread}
              onOpen={() => onOpen(item)}
            />
          ),
        ];
      })}
    </ul>
  );
}
