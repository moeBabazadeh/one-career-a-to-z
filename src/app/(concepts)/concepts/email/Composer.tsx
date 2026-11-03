'use client';

import { useEffect, useRef, useState } from 'react';
import { profile } from '../_shared/data';
import { cx } from './Body';
import { Icon } from './icons';
import { mailtoHref } from './raw';
import { discardDraft, markSent, saveDraft, type Draft } from './store';
import s from './mail.module.scss';

const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/**
 * A draft being written. It saves itself to Drafts as you type; Send hands it to your own mail
 * app as a mailto: link, addressed to Moe (or to whoever you forward it to). Nothing is sent
 * from this page.
 */
export default function Composer({
  draft,
  variant,
  onClose,
}: {
  draft: Draft;
  variant: 'modal' | 'inline';
  onClose: () => void;
}) {
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [dirty, setDirty] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const forward = draft.mode === 'forward';

  // Autosave, a moment after the last keystroke.
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      saveDraft(draft.id, { to, subject, body });
      setDirty(false);
    }, 700);
    return () => window.clearTimeout(t);
  }, [dirty, to, subject, body, draft.id]);

  // Focus where the writing starts: the recipients of a forward, the subject of a new mail, or
  // the top of a reply, above the quote.
  useEffect(() => {
    const el = forward
      ? toRef.current
      : draft.mode === 'new' && !draft.subject
        ? subjectRef.current
        : bodyRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (el === bodyRef.current) bodyRef.current.setSelectionRange(0, 0);
    if (variant === 'inline')
      rootRef.current?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
  }, [forward, draft.mode, draft.subject, variant]);

  const close = () => {
    saveDraft(draft.id, { to, subject, body });
    onClose();
  };

  const recipients = forward ? to.trim() : profile.email;
  const canSend = Boolean(recipients) && Boolean(subject.trim() || body.trim());

  const send = () => {
    if (!canSend) return;
    const href = mailtoHref(recipients, subject.trim(), body);
    saveDraft(draft.id, { to, subject, body });
    markSent(draft.id);
    onClose();
    window.location.href = href;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const title = draft.mode === 'new' ? 'New message' : forward ? 'Forward' : 'Reply';

  return (
    <form
      ref={rootRef}
      className={cx(s.composer, variant === 'inline' ? s.composerInline : s.composerModal)}
      onKeyDown={onKey}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      aria-label={title}
    >
      <header className={s.composerHead}>
        <b>{title}</b>
        <span className={s.saved} aria-live="polite">
          {dirty ? 'Saving…' : draft.saved ? `Draft saved ${draft.saved}` : ''}
        </span>
        <button
          type="button"
          className={s.iconBtn}
          onClick={close}
          aria-label="Close and keep the draft"
          title="Close (Esc)"
        >
          <Icon.x size={16} />
        </button>
      </header>
      <div className={s.field}>
        <span className={s.fieldLabel}>To</span>
        {forward ? (
          <input
            ref={toRef}
            type="text"
            inputMode="email"
            autoComplete="email"
            value={to}
            placeholder="Who should get it?"
            aria-label="Recipients"
            onChange={(e) => {
              setTo(e.target.value);
              setDirty(true);
            }}
          />
        ) : (
          <span className={s.recipient} title="Mail from this page always goes to Moe">
            <span className={s.recipientDot} aria-hidden="true">
              {profile.name.charAt(0)}
            </span>
            {profile.name} <span className={s.muted}>&lt;{profile.email}&gt;</span>
          </span>
        )}
      </div>
      <label className={s.field}>
        <span className={s.fieldLabel}>Subject</span>
        <input
          ref={subjectRef}
          type="text"
          value={subject}
          placeholder="What’s it about?"
          onChange={(e) => {
            setSubject(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <textarea
        ref={bodyRef}
        className={s.composerBody}
        value={body}
        aria-label="Message"
        placeholder={draft.mode === 'new' ? `Write to ${profile.name.split(' ')[0]}…` : ''}
        onChange={(e) => {
          setBody(e.target.value);
          setDirty(true);
        }}
      />
      <footer className={s.composerFoot}>
        <button type="submit" className={s.sendBtn} disabled={!canSend}>
          <Icon.send size={16} />
          Send
          <kbd>{MOD}↵</kbd>
        </button>
        <span className={s.composerNote}>
          Opens in your own mail app. Nothing is sent from this page.
        </span>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => {
            discardDraft(draft.id);
            onClose();
          }}
          aria-label="Discard draft"
          title="Discard draft"
        >
          <Icon.trash size={17} />
        </button>
      </footer>
    </form>
  );
}
