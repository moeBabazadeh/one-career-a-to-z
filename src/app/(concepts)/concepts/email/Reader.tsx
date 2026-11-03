'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { db, profile } from '../_shared/data';
import {
  Attachments,
  Avatar,
  Blocks,
  cx,
  Hl,
  HlContext,
  LabelChip,
  Signature,
  SiteFooter,
} from './Body';
import Composer from './Composer';
import { ago, fullDate } from './dates';
import { Icon } from './icons';
import {
  blockText,
  labelById,
  ME,
  MOE,
  THREADS,
  type Attachment,
  type Message,
  type Thread,
} from './mailbox';
import { hrefFor } from './hash';
import {
  boxOf,
  isRead,
  isStarred,
  setDraftOpen,
  toggleStar,
  type Draft,
  type Sent,
  type State,
} from './store';
import s from './mail.module.scss';

export interface ReaderActions {
  back: () => void;
  step: (dir: 1 | -1) => void;
  reply: (t: Thread) => void;
  forward: (t: Thread) => void;
  original: (t: Thread, m: Message) => void;
  preview: (a: Attachment) => void;
  compose: () => void;
  archive: (t: Thread) => void;
  trash: (t: Thread) => void;
  restore: (t: Thread) => void;
  unread: (t: Thread) => void;
}

/* ------------------------------------------------------------------ contact card */

function ContactCard({
  m,
  onClose,
  onCompose,
}: {
  m: Message;
  onClose: () => void;
  onCompose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    ref.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);
  const copy = () => {
    navigator.clipboard?.writeText(profile.email).then(
      () => setCopied(true),
      () => {},
    );
  };
  return (
    <div ref={ref} className={s.card} role="dialog" aria-label={`Contact card: ${MOE.name}`}>
      <div className={s.cardTop}>
        <Avatar sender={MOE} size={56} />
        <div>
          <b>{MOE.name}</b>
          <span>
            {profile.role}, {profile.company}
          </span>
          <span className={s.muted}>{profile.headline}</span>
        </div>
      </div>
      {m.from.id === 'site' && (
        <p className={s.cardNote}>
          This mail came from the site, {db.person.site}. It writes on Moe’s behalf; replies reach
          him.
        </p>
      )}
      <ul className={s.cardList}>
        <li>
          <Icon.all size={16} />
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          <button
            type="button"
            className={s.iconBtn}
            onClick={copy}
            aria-label="Copy address"
            title="Copy address"
          >
            {copied ? <Icon.check size={15} /> : <Icon.copy size={15} />}
          </button>
        </li>
        <li>
          <Icon.link size={16} />
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
        </li>
        <li>
          <Icon.code size={16} />
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </li>
        <li>
          <Icon.pdf size={16} />
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV (PDF)
          </a>
        </li>
      </ul>
      <button
        type="button"
        className={s.cardBtn}
        onClick={() => {
          onClose();
          onCompose();
        }}
      >
        <Icon.compose size={16} /> Send an email
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ a message */

function MessageView({
  t,
  m,
  open,
  last,
  onToggle,
  act,
}: {
  t: Thread;
  m: Message;
  open: boolean;
  last: boolean;
  onToggle: () => void;
  act: ReaderActions;
}) {
  const [details, setDetails] = useState(false);
  const [card, setCard] = useState(false);
  const [trimmed, setTrimmed] = useState(!last);
  const firstText = m.blocks.find((bl) => bl.t === 'p');
  const snippet = firstText ? blockText(firstText) : '';

  if (!open)
    return (
      <li className={s.msgCollapsed}>
        <button type="button" onClick={onToggle} aria-expanded={false}>
          <Avatar sender={m.from} size={32} />
          <b>{m.from.name}</b>
          <span className={s.msgSnippet}>
            <Hl text={snippet} />
          </span>
          <time title={ago(m.date)}>{fullDate(m.date)}</time>
        </button>
      </li>
    );

  return (
    <li className={s.msg}>
      <article aria-label={`${m.from.name}, ${fullDate(m.date)}`}>
        <header className={s.msgHead}>
          <Avatar sender={m.from} size={40} />
          <div className={s.msgWho}>
            <span className={s.msgFromLine}>
              <button
                type="button"
                className={s.sender}
                onClick={() => setCard(!card)}
                aria-expanded={card}
              >
                {m.from.name}
              </button>
              <span className={s.addr}>&lt;{m.from.address}&gt;</span>
            </span>
            <button
              type="button"
              className={s.toMe}
              onClick={() => setDetails(!details)}
              aria-expanded={details}
            >
              to me <Icon.down size={14} />
            </button>
            {card && <ContactCard m={m} onClose={() => setCard(false)} onCompose={act.compose} />}
          </div>
          <div className={s.msgSide}>
            <time className={s.msgDate} title={ago(m.date)}>
              {fullDate(m.date)} <span>({ago(m.date)})</span>
            </time>
            <span className={s.msgBtns}>
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => act.reply(t)}
                aria-label="Reply"
                title="Reply (r)"
              >
                <Icon.reply size={17} />
              </button>
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => act.original(t, m)}
                aria-label="Show original"
                title="Show original"
              >
                <Icon.code size={17} />
              </button>
              {!last && (
                <button
                  type="button"
                  className={s.iconBtn}
                  onClick={onToggle}
                  aria-label="Collapse"
                  title="Collapse"
                >
                  <Icon.up size={17} />
                </button>
              )}
            </span>
          </div>
        </header>
        {details && (
          <dl className={s.details}>
            <div>
              <dt>from</dt>
              <dd>
                {m.from.name} &lt;{m.from.address}&gt;
              </dd>
            </div>
            {m.from.id === 'site' && (
              <div>
                <dt>reply-to</dt>
                <dd>
                  {MOE.name} &lt;{MOE.address}&gt;
                </dd>
              </div>
            )}
            <div>
              <dt>to</dt>
              <dd>you</dd>
            </div>
            <div>
              <dt>date</dt>
              <dd>
                {fullDate(m.date)}
                {m.date && !m.date.d && (
                  <span className={s.muted}>
                    {' '}
                    · {m.date.m ? 'no day' : 'only the year'} on record
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>subject</dt>
              <dd>{t.subject}</dd>
            </div>
            <div>
              <dt>message-id</dt>
              <dd>
                <code>
                  &lt;{m.id}@{db.person.site}&gt;
                </code>
              </dd>
            </div>
          </dl>
        )}
        <div className={s.msgBody}>
          <Blocks blocks={m.blocks} />
        </div>
        <Attachments list={m.attachments} onOpen={act.preview} />
        {m.from.id === 'moe' ? (
          trimmed ? (
            <button
              type="button"
              className={s.trim}
              onClick={() => setTrimmed(false)}
              aria-label="Show trimmed content"
              title="Show trimmed content"
            >
              •••
            </button>
          ) : (
            <Signature />
          )
        ) : (
          <SiteFooter />
        )}
      </article>
    </li>
  );
}

function MineMessage({ d }: { d: Sent }) {
  return (
    <li className={s.msg}>
      <article>
        <header className={s.msgHead}>
          <Avatar sender={ME} size={40} />
          <div className={s.msgWho}>
            <span className={s.msgFromLine}>
              <b className={s.sender}>me</b>
            </span>
            <span className={s.toMe}>to {d.mode === 'forward' ? d.to : MOE.name}</span>
          </div>
          <div className={s.msgSide}>
            <time className={s.msgDate}>{d.sentAt}</time>
          </div>
        </header>
        <p className={s.handed}>
          <Icon.send size={15} /> Handed to your mail app as a draft. Whether it went out is up to
          you; this page never sends mail.
        </p>
        <div className={cx(s.msgBody, s.plainBody)}>{d.body || '(no text)'}</div>
      </article>
    </li>
  );
}

/* ------------------------------------------------------------------ thread */

function Toolbar({
  t,
  st,
  pos,
  total,
  act,
}: {
  t: Thread;
  st: State;
  pos: number;
  total: number;
  act: ReaderActions;
}) {
  const box = boxOf(st, t.id);
  const star = isStarred(st, t);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menu]);
  return (
    <div className={s.toolbar} role="toolbar" aria-label="Conversation actions">
      <button
        type="button"
        className={cx(s.iconBtn, s.backBtn)}
        onClick={act.back}
        aria-label="Back to the list"
        title="Back to the list (u)"
      >
        <Icon.back size={18} />
      </button>
      {box === 'inbox' ? (
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => act.archive(t)}
          aria-label="Archive"
          title="Archive (e)"
        >
          <Icon.archive size={18} />
        </button>
      ) : (
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => act.restore(t)}
          aria-label="Move to Inbox"
          title="Move to Inbox"
        >
          <Icon.inbox size={18} />
        </button>
      )}
      {box !== 'trash' ? (
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => act.trash(t)}
          aria-label="Delete"
          title="Delete (#)"
        >
          <Icon.trash size={18} />
        </button>
      ) : (
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => act.restore(t)}
          aria-label="Restore to Inbox"
          title="Restore to Inbox"
        >
          <Icon.restore size={18} />
        </button>
      )}
      <button
        type="button"
        className={s.iconBtn}
        onClick={() => act.unread(t)}
        aria-label="Mark as unread"
        title="Mark as unread (U)"
      >
        <Icon.unread size={18} />
      </button>
      <span className={s.sep} aria-hidden="true" />
      <button
        type="button"
        className={cx(s.iconBtn, s.starBig)}
        data-on={star || undefined}
        onClick={() => toggleStar(t)}
        aria-pressed={star}
        aria-label={star ? 'Unstar' : 'Star'}
        title={star ? 'Unstar (s)' : 'Star (s)'}
      >
        {star ? <Icon.starFill size={18} /> : <Icon.star size={18} />}
      </button>
      <span className={s.grow} />
      {total > 0 && pos >= 0 && (
        <span className={s.pos}>
          {pos + 1} of {total}
        </span>
      )}
      <button
        type="button"
        className={s.iconBtn}
        onClick={() => act.step(-1)}
        disabled={pos <= 0}
        aria-label="Newer"
        title="Newer (k)"
      >
        <Icon.up size={18} />
      </button>
      <button
        type="button"
        className={s.iconBtn}
        onClick={() => act.step(1)}
        disabled={pos < 0 || pos >= total - 1}
        aria-label="Older"
        title="Older (j)"
      >
        <Icon.down size={18} />
      </button>
      <div className={s.menuWrap} ref={menuRef}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-haspopup="menu"
          aria-label="More"
          title="More"
        >
          <Icon.more size={18} />
        </button>
        {menu && (
          <div className={s.menu} role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                act.reply(t);
              }}
            >
              <Icon.reply size={16} /> Reply <kbd>r</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                act.forward(t);
              }}
            >
              <Icon.forward size={16} /> Forward <kbd>f</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                act.original(t, t.messages[t.messages.length - 1]);
              }}
            >
              <Icon.code size={16} /> Show original
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                window.print();
              }}
            >
              <Icon.print size={16} /> Print conversation
            </button>
            <a role="menuitem" href="#read">
              <Icon.page size={16} /> Read everything as a page
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreadView({
  t,
  st,
  pos,
  total,
  draft,
  act,
}: {
  t: Thread;
  st: State;
  pos: number;
  total: number;
  draft: Draft | null;
  act: ReaderActions;
}) {
  const hl = useContext(HlContext);
  const last = t.messages.length - 1;
  const [open, setOpen] = useState<Set<number>>(() => {
    // An unread conversation opens with every message expanded, as mail clients do; a read one
    // shows its latest message and folds the rest.
    if (!isRead(st, t.id)) return new Set(t.messages.map((_, i) => i));
    const set = new Set([last]);
    // While searching, every message with a match opens too.
    if (hl)
      t.messages.forEach((m, i) => {
        if (m.blocks.some((bl) => new RegExp(hl.source, 'iu').test(blockText(bl)))) set.add(i);
      });
    return set;
  });
  const toggle = (i: number) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const replies = st.sent.filter((x) => x.thread === t.id);
  const box = boxOf(st, t.id);
  const labels = t.labels.map((id) => labelById.get(id)).filter(Boolean);

  return (
    <div className={s.thread}>
      <Toolbar t={t} st={st} pos={pos} total={total} act={act} />
      <div className={s.threadScroll} id="reading-scroll" tabIndex={-1}>
        <header className={s.threadHead}>
          <h1 className={s.threadTitle}>
            <Hl text={t.subject} />
          </h1>
          <div className={s.threadMeta}>
            {box !== 'inbox' && (
              <span className={s.boxTag}>{box === 'archive' ? 'Archived' : 'Trash'}</span>
            )}
            {labels.map(
              (l) =>
                l && <LabelChip key={l.id} label={l} href={hrefFor({ kind: 'label', id: l.id })} />,
            )}
            <span className={s.muted}>
              {t.messages.length + replies.length > 1
                ? `${t.messages.length + replies.length} messages`
                : '1 message'}
            </span>
            {t.messages.length > 1 && (
              <button
                type="button"
                className={s.textBtn}
                onClick={() =>
                  setOpen(
                    open.size === t.messages.length
                      ? new Set([last])
                      : new Set(t.messages.map((_, i) => i)),
                  )
                }
              >
                <Icon.expand size={15} />{' '}
                {open.size === t.messages.length ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
        </header>
        <ol className={s.messages}>
          {t.messages.map((m, i) => (
            <MessageView
              key={m.id}
              t={t}
              m={m}
              open={open.has(i)}
              last={i === last}
              onToggle={() => toggle(i)}
              act={act}
            />
          ))}
          {replies.map((d) => (
            <MineMessage key={d.id} d={d} />
          ))}
        </ol>
        {draft?.open ? (
          <Composer
            key={draft.id}
            draft={draft}
            variant="inline"
            onClose={() => {
              setDraftOpen(draft.id, false);
              document.getElementById('reading-scroll')?.focus({ preventScroll: true });
            }}
          />
        ) : draft ? (
          <button type="button" className={s.draftRow} onClick={() => setDraftOpen(draft.id, true)}>
            <span className={s.draftTag}>Draft</span>
            <span className={s.draftText}>
              {draft.body.split('\n\n')[0].trim() || draft.subject}
            </span>
            <span className={s.muted}>
              {draft.saved ? `saved ${draft.saved}` : ''} · Continue writing
            </span>
          </button>
        ) : (
          <div className={s.replyBar}>
            <button type="button" className={s.ghostBtn} onClick={() => act.reply(t)}>
              <Icon.reply size={17} /> Reply <kbd>r</kbd>
            </button>
            <button type="button" className={s.ghostBtn} onClick={() => act.forward(t)}>
              <Icon.forward size={17} /> Forward <kbd>f</kbd>
            </button>
          </div>
        )}
        <span className={s.paneEnd} aria-hidden="true" />
      </div>
    </div>
  );
}

export function SentView({ d, act }: { d: Sent; act: ReaderActions }) {
  return (
    <div className={s.thread}>
      <div className={s.toolbar} role="toolbar" aria-label="Sent message">
        <button
          type="button"
          className={cx(s.iconBtn, s.backBtn)}
          onClick={act.back}
          aria-label="Back to the list"
          title="Back to the list (u)"
        >
          <Icon.back size={18} />
        </button>
        <span className={s.grow} />
      </div>
      <div className={s.threadScroll} tabIndex={-1}>
        <header className={s.threadHead}>
          <h1 className={s.threadTitle}>{d.subject || '(no subject)'}</h1>
          <div className={s.threadMeta}>
            <span className={s.boxTag}>Sent from your mail app</span>
          </div>
        </header>
        <ol className={s.messages}>
          <MineMessage d={d} />
        </ol>
      </div>
    </div>
  );
}

export function EmptyPane({
  st,
  total,
  onCompose,
}: {
  st: State;
  total: number;
  onCompose: () => void;
}) {
  const unread = THREADS.filter((t) => boxOf(st, t.id) === 'inbox' && !isRead(st, t.id)).length;
  return (
    <div className={s.empty}>
      <svg width={120} height={96} viewBox="0 0 120 96" aria-hidden="true" className={s.emptyArt}>
        <rect x={14} y={30} width={92} height={56} rx={10} className={s.artBack} />
        <path d="M14 58h26l6 10h28l6-10h26" className={s.artLine} />
        <rect x={34} y={10} width={52} height={38} rx={6} className={s.artPaper} />
        <path d="M44 22h32M44 30h22" className={s.artLine} />
      </svg>
      <h2>{total ? 'No conversation selected' : 'Nothing here'}</h2>
      <p>
        {unread ? `${unread} unread in your Inbox. ` : 'You’re all caught up. '}
        Press <kbd>j</kbd> and <kbd>o</kbd> to open the next one, or <kbd>?</kbd> for every
        shortcut.
      </p>
      <button type="button" className={s.ghostBtn} onClick={onCompose}>
        <Icon.compose size={16} /> Write to {MOE.short}
      </button>
    </div>
  );
}
