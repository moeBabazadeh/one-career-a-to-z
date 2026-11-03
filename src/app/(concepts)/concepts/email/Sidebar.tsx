'use client';

import { useState } from 'react';
import { conceptTitle } from '../_shared/concepts';
import { profile } from '../_shared/data';
import { cx } from './Body';
import { fullDate, NOW_DATE } from './dates';
import { Icon } from './icons';
import { LABELS, THREADS, type Label } from './mailbox';
import { hrefFor, type Folder, type View } from './hash';
import { boxOf, isRead, isStarred, storedBytes, useMailbox } from './store';
import s from './mail.module.scss';

export const FOLDER_META: Record<Folder, { name: string; icon: keyof typeof Icon; key?: string }> =
  {
    inbox: { name: 'Inbox', icon: 'inbox', key: 'g i' },
    starred: { name: 'Starred', icon: 'star', key: 'g s' },
    drafts: { name: 'Drafts', icon: 'draft', key: 'g d' },
    sent: { name: 'Sent', icon: 'send', key: 'g t' },
    archive: { name: 'Archive', icon: 'archive', key: 'g e' },
    all: { name: 'All mail', icon: 'all', key: 'g a' },
    trash: { name: 'Trash', icon: 'trash' },
  };

const ORDER: Folder[] = ['inbox', 'starred', 'drafts', 'sent', 'archive', 'all', 'trash'];
const GROUPS: Label['group'][] = ['Roles', 'Products', 'Areas'];

export default function Sidebar({
  view,
  onCompose,
  onNavigate,
  onKeys,
}: {
  view: View;
  onCompose: () => void;
  onNavigate?: () => void;
  onKeys: () => void;
}) {
  const st = useMailbox();
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const counts: Record<Folder, { n: number; strong: boolean }> = {
    inbox: {
      n: THREADS.filter((t) => boxOf(st, t.id) === 'inbox' && !isRead(st, t.id)).length,
      strong: true,
    },
    starred: {
      n: THREADS.filter((t) => isStarred(st, t) && boxOf(st, t.id) !== 'trash').length,
      strong: false,
    },
    drafts: { n: st.drafts.length, strong: false },
    sent: { n: 0, strong: false },
    archive: { n: 0, strong: false },
    all: { n: 0, strong: false },
    trash: { n: THREADS.filter((t) => boxOf(st, t.id) === 'trash').length, strong: false },
  };

  const current = (v: View) =>
    v.kind === view.kind &&
    (v.kind === 'folder'
      ? view.kind === 'folder' && view.id === v.id
      : view.kind === 'label' && view.id === (v as { id: string }).id)
      ? 'page'
      : undefined;
  const bytes = storedBytes(st);

  return (
    <nav className={s.sidebar} aria-label="Mailboxes">
      <button type="button" className={s.compose} onClick={onCompose}>
        <Icon.compose size={18} />
        <span>Compose</span>
        <kbd>c</kbd>
      </button>

      <ul className={s.folders}>
        {ORDER.map((id) => {
          const meta = FOLDER_META[id];
          const I = Icon[meta.icon];
          const c = counts[id];
          const v: View = { kind: 'folder', id };
          return (
            <li key={id}>
              <a
                href={hrefFor(v)}
                className={s.folder}
                aria-current={current(v)}
                onClick={onNavigate}
                title={meta.key ? `${meta.name} (${meta.key})` : meta.name}
              >
                <I size={18} />
                <span className={s.folderName}>{meta.name}</span>
                {c.n > 0 && <span className={cx(s.count, c.strong && s.countStrong)}>{c.n}</span>}
              </a>
            </li>
          );
        })}
      </ul>

      <div className={s.labelsHead}>
        <span>Labels</span>
      </div>
      {GROUPS.map((g) => {
        const list = LABELS.filter((l) => l.group === g);
        const isClosed = closed[g] ?? false;
        return (
          <div key={g} className={s.labelGroup}>
            <button
              type="button"
              className={s.groupToggle}
              aria-expanded={!isClosed}
              onClick={() => setClosed((c) => ({ ...c, [g]: !isClosed }))}
            >
              <Icon.right size={14} />
              {g}
            </button>
            {!isClosed && (
              <ul className={s.labelList}>
                {list.map((l) => {
                  const v: View = { kind: 'label', id: l.id };
                  const n = THREADS.filter(
                    (t) =>
                      t.labels.includes(l.id) && boxOf(st, t.id) !== 'trash' && !isRead(st, t.id),
                  ).length;
                  return (
                    <li key={l.id}>
                      <a
                        href={hrefFor(v)}
                        className={s.folder}
                        aria-current={current(v)}
                        onClick={onNavigate}
                        style={{ '--h': l.hue } as React.CSSProperties}
                      >
                        <span className={s.labelDot} aria-hidden="true" />
                        <span className={s.folderName}>{l.name}</span>
                        {n > 0 && <span className={s.count}>{n}</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      <div className={s.sideFoot}>
        <a href="#read" className={s.sideLink} onClick={onNavigate}>
          <Icon.page size={16} /> Read as a page
        </a>
        <button type="button" className={s.sideLink} onClick={onKeys}>
          <Icon.keyboard size={16} /> Keyboard shortcuts <kbd>?</kbd>
        </button>
        <p className={s.sideMeta}>
          <span className={s.syncDot} aria-hidden="true" />
          Up to date · facts as of {fullDate(NOW_DATE)}
        </p>
        <p className={s.sideMeta}>
          {bytes > 2 ? `${(bytes / 1024).toFixed(1)} KB` : '0 KB'} of mailbox state, kept in this
          browser only.
        </p>
        <p className={s.sideMeta}>
          {conceptTitle('email')}, a concept for {profile.name}’s site. All mail is written from his
          CV; nothing here sends mail.
        </p>
      </div>
    </nav>
  );
}
