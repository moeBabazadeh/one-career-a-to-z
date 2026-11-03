'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { cx, useFileSize } from './Body';
import { Icon } from './icons';
import type { Attachment, Message, Thread } from './mailbox';
import { rawSource } from './raw';
import s from './mail.module.scss';

/** A dialog that holds focus while it's open, closes on Escape and gives focus back after. */
export function Modal({
  label,
  onClose,
  className,
  children,
  dismissable = true,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // Children may already have put focus where it belongs (a composer's subject line).
    if (el && !el.contains(document.activeElement))
      (
        el.querySelector<HTMLElement>('[data-autofocus]') ??
        el.querySelector<HTMLElement>('button, a, input, textarea, [tabindex]')
      )?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!dismissable) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const focusables = [
        ...el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [onClose, dismissable]);
  return (
    <div
      className={s.scrim}
      onPointerDown={(e) => dismissable && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className={cx(s.modal, className)}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shortcuts */

const KEYS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Navigation',
    rows: [
      [['j'], 'Older conversation'],
      [['k'], 'Newer conversation'],
      [['o', '↵'], 'Open conversation'],
      [['u'], 'Back to the list'],
      [['/'], 'Search'],
      [['g', 'i'], 'Go to Inbox'],
      [['g', 's'], 'Go to Starred'],
      [['g', 't'], 'Go to Sent'],
      [['g', 'd'], 'Go to Drafts'],
      [['g', 'e'], 'Go to Archive'],
      [['g', 'a'], 'Go to All mail'],
    ],
  },
  {
    title: 'Actions',
    rows: [
      [['e'], 'Archive'],
      [['#'], 'Delete (to Trash, in this browser)'],
      [['s'], 'Star or unstar'],
      [['⇧', 'u'], 'Mark as unread'],
      [['⇧', 'i'], 'Mark as read'],
      [['x'], 'Select conversation'],
      [['z'], 'Undo'],
    ],
  },
  {
    title: 'Writing',
    rows: [
      [['c'], 'Compose'],
      [['r'], 'Reply'],
      [['f'], 'Forward'],
      [['⌘', '↵'], 'Send (opens your mail app)'],
      [['Esc'], 'Close, keeping the draft'],
    ],
  },
  {
    title: 'Search operators',
    rows: [
      [['from:moe'], 'Sender'],
      [['label:attendum'], 'Label'],
      [['has:attachment'], 'Attachments'],
      [['is:starred'], 'Starred, unread, read'],
      [['after:2020'], 'From a year on'],
      [['before:2012'], 'Before a year'],
      [['-word'], 'Leave out'],
      [['a OR b'], 'Either'],
    ],
  },
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="Keyboard shortcuts" onClose={onClose} className={s.keys}>
      <header className={s.modalHead}>
        <h2>Keyboard shortcuts</h2>
        <button
          type="button"
          className={s.iconBtn}
          onClick={onClose}
          aria-label="Close"
          data-autofocus
        >
          <Icon.x size={18} />
        </button>
      </header>
      <div className={s.keysGrid}>
        {KEYS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.rows.map(([keys, what]) => (
                <div key={what}>
                  <dt>
                    {keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && keys.length === 2 && keys[0] === 'g' && (
                          <span className={s.then}>then</span>
                        )}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ attachment preview */

export function Lightbox({
  list,
  start,
  onClose,
}: {
  list: Attachment[];
  start: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const att = list[i];
  const size = useFileSize(att.href);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(list.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [list.length]);
  return (
    <Modal label={`Preview: ${att.name}`} onClose={onClose} className={s.lightbox}>
      <header className={s.lightHead}>
        <Icon.image size={18} />
        <b>{att.name}</b>
        <span className={s.muted}>{size}</span>
        <span className={s.grow} />
        {list.length > 1 && (
          <span className={s.muted}>
            {i + 1} of {list.length}
          </span>
        )}
        <a href={att.href} download className={s.iconBtn} aria-label="Download" title="Download">
          <Icon.download size={18} />
        </a>
        <button
          type="button"
          className={s.iconBtn}
          onClick={onClose}
          aria-label="Close"
          data-autofocus
        >
          <Icon.x size={18} />
        </button>
      </header>
      <div className={s.lightBody}>
        <Image
          src={att.href}
          width={att.w ?? 1280}
          height={att.h ?? 800}
          alt={att.name}
          sizes="90vw"
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ show original */

export function Original({ t, m, onClose }: { t: Thread; m: Message; onClose: () => void }) {
  const src = rawSource(t, m);
  const [copied, setCopied] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([src], { type: 'message/rfc822' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${
      t.subject
        .replace(/[^\w\s.-]+/g, '')
        .trim()
        .slice(0, 60) || 'message'
    }.eml`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal label="Original message" onClose={onClose} className={s.original}>
      <header className={s.modalHead}>
        <h2>Original message</h2>
        <span className={s.grow} />
        <button
          type="button"
          className={s.ghostBtn}
          onClick={() =>
            navigator.clipboard?.writeText(src).then(
              () => setCopied(true),
              () => {},
            )
          }
        >
          {copied ? <Icon.check size={16} /> : <Icon.copy size={16} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className={s.ghostBtn} onClick={download}>
          <Icon.download size={16} /> Download .eml
        </button>
        <button
          type="button"
          className={s.iconBtn}
          onClick={onClose}
          aria-label="Close"
          data-autofocus
        >
          <Icon.x size={18} />
        </button>
      </header>
      <dl className={s.origMeta}>
        <div>
          <dt>Message ID</dt>
          <dd>
            <code>{`<${m.id}@…>`}</code>
          </dd>
        </div>
        <div>
          <dt>Threading</dt>
          <dd>
            {t.messages.indexOf(m)
              ? 'In-Reply-To and References point at the earlier messages'
              : 'Starts the thread'}
          </dd>
        </div>
        <div>
          <dt>Encoding</dt>
          <dd>UTF-8, quoted-printable</dd>
        </div>
      </dl>
      <pre className={s.source} tabIndex={0}>
        {src}
      </pre>
    </Modal>
  );
}
