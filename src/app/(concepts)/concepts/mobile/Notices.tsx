'use client';

// Notifications, stacked by app the way a phone groups them: a stack opens on tap, each one
// opens its app, and a sideways swipe clears it.
import { useState } from 'react';
import { AppIcon } from './AppIcon';
import { APPS, type Notice } from './content';
import { Icon } from './icons';
import { track } from './shell';
import type { Clock } from './ui';
import s from './phone.module.scss';

interface Props {
  notices: Notice[];
  clock: Clock | null;
  /** Client px per screen px, for following a finger. */
  scale: () => number;
  open: (n: Notice) => void;
  clear: (ids: string[]) => void;
  /** Lock screen stacks start folded; the notification centre's too. */
  label: string;
}

export function Notices({ notices, clock, scale, open, clear, label }: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const groups = [...new Set(notices.map((n) => n.app))].map((app) => ({
    app,
    items: notices.filter((n) => n.app === app),
  }));

  if (!groups.length) return <p className={s.noNotices}>No notifications</p>;

  const swipe = (e: React.PointerEvent<HTMLElement>, ids: string[]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget;
    track(e, scale(), {
      move: (d) => {
        if (d.axis !== 'x') return;
        el.dataset.drag = '';
        el.style.transform = `translateX(${d.dx < 0 ? d.dx : d.dx * 0.25}px)`;
      },
      end: (d) => {
        delete el.dataset.drag;
        if (d.axis === 'x' && (d.dx < -el.offsetWidth * 0.4 || d.vx < -800)) {
          el.style.transform = `translateX(-110%)`;
          el.dataset.gone = '';
          window.setTimeout(() => clear(ids), 220);
        } else {
          el.style.transform = '';
        }
        if (d.axis) el.dataset.swiped = '';
      },
    });
  };

  return (
    <ul className={s.notices} aria-label={label}>
      {groups.map(({ app, items }) => {
        const open1 = expanded.includes(app) || items.length === 1;
        const def = APPS[app];
        return (
          <li
            key={app}
            className={s.stack}
            data-open={open1 || undefined}
            data-more={items.length > 1 ? Math.min(2, items.length - 1) : undefined}
          >
            {open1 && items.length > 1 && (
              <div className={s.stackHead}>
                <span>{def.name}</span>
                <button
                  type="button"
                  onClick={() => setExpanded((x) => x.filter((a) => a !== app))}
                >
                  Show less
                </button>
                <button
                  type="button"
                  aria-label={`Clear ${def.name} notifications`}
                  onClick={() => clear(items.map((i) => i.id))}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            )}
            {(open1 ? items : items.slice(0, 1)).map((n) => (
              <div
                key={n.id}
                className={s.notice}
                onPointerDown={(e) => swipe(e, open1 ? [n.id] : items.map((i) => i.id))}
              >
                <button
                  type="button"
                  className={s.noticeHit}
                  onClick={(e) => {
                    const card = e.currentTarget.parentElement;
                    if (card && 'swiped' in card.dataset) {
                      delete card.dataset.swiped;
                      return;
                    }
                    if (!open1) setExpanded((x) => [...x, app]);
                    else open(n);
                  }}
                  aria-label={`${def.name}: ${n.title}. ${n.body}${!open1 ? ` ${items.length - 1} more` : ''}`}
                >
                  <span className={s.noticeIcon}>
                    <AppIcon app={def} clock={clock} size={38} />
                  </span>
                  <span className={s.noticeText}>
                    <span className={s.noticeTop}>
                      <strong>{n.title}</strong>
                      <time>{n.when}</time>
                    </span>
                    <span className={s.noticeBody}>{n.body}</span>
                    {!open1 && (
                      <span className={s.noticeMore}>
                        {items.length - 1} more from {def.name}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
