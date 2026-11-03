'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { db, profile } from '../_shared/data';
import { ACCOUNT, hexOf } from './inventory';
import { Ext, Icon, cx } from './ui';
import { closePanel, href, toggleShell, useUi } from './store';
import s from './console.module.scss';

const { person, current } = db;

/** A modal in the top layer: focus is trapped, Esc and the backdrop close it, and focus returns to the opener. */
export function Modal({
  open,
  onClose,
  label,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cx(s.modal, className)}
      aria-label={label}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

/* ------------------------------------------------------------------ support */

const TYPES = ['Hiring or a role', 'A project', 'A question about his work', 'Something else'];

export function Support() {
  const ui = useUi();
  const [type, setType] = useState(TYPES[0]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = `CASE-${hexOf(`${subject}|${body}|${type}`, 6).toUpperCase()}`;
    const mail = `mailto:${person.email}?subject=${encodeURIComponent(`[${id}] ${type}: ${subject || 'Hello'}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = mail;
    setSent(id);
  };

  return (
    <Modal
      open={ui.support}
      onClose={() => closePanel('support')}
      label="Support center"
      className={s.sheet}
    >
      <header className={s.sheetHead}>
        <div>
          <p className={s.kicker}>Support center</p>
          <h2>Contact the account owner</h2>
        </div>
        <button
          type="button"
          className={s.iconBtn}
          aria-label="Close"
          onClick={() => closePanel('support')}
        >
          <Icon name="x" />
        </button>
      </header>
      <div className={s.sheetBody}>
        <p className={s.prose}>
          {profile.name}, {current.title} at {current.company}. Cases open in your own mail client,
          addressed to him; nothing is sent from this page.
        </p>
        <ul className={s.channels}>
          <li>
            <a href={`mailto:${person.email}`}>
              <Icon name="mail" />
              <span>
                <b>Email</b>
                <small>{person.email}</small>
              </span>
            </a>
          </li>
          <li>
            <Ext url={person.linkedin}>
              <Icon name="link" />
              <span>
                <b>LinkedIn</b>
                <small>
                  {person.linkedin.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}
                </small>
              </span>
            </Ext>
          </li>
          <li>
            <Ext url={person.github}>
              <Icon name="code" />
              <span>
                <b>GitHub</b>
                <small>{person.githubUser}</small>
              </span>
            </Ext>
          </li>
          <li>
            <Ext url={person.cv}>
              <Icon name="file" />
              <span>
                <b>CV</b>
                <small>PDF</small>
              </span>
            </Ext>
          </li>
        </ul>
        <form className={s.caseForm} onSubmit={submit}>
          <h3>Create a case</h3>
          <fieldset>
            <legend>Case type</legend>
            <div className={s.caseTypes}>
              {TYPES.map((t) => (
                <label key={t} data-checked={type === t || undefined}>
                  <input
                    type="radio"
                    name="case-type"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                  />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={s.field}>
            <span>Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is it about?"
              maxLength={120}
            />
          </label>
          <label className={s.field}>
            <span>Description</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="A few lines are plenty."
            />
          </label>
          <div className={s.formFoot}>
            {sent ? (
              <p className={s.sent} role="status">
                <Icon name="check" size={15} /> Case {sent} drafted in your mail client.
              </p>
            ) : (
              <p className={s.muted}>Opens your mail client with the case filled in.</p>
            )}
            <button type="submit" className={s.btnPrimary}>
              Open in mail
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ shortcuts */

const KEYS: [string[], string][] = [
  [['⌘', 'K'], 'Search resources, services and roles'],
  [['/'], 'Search'],
  [['`'], 'Open or close CloudShell'],
  [['['], 'Collapse or expand the navigation'],
  [['?'], 'These shortcuts'],
  [['Esc'], 'Close the open menu or panel'],
  [['g', 'h'], 'Console Home'],
  [['g', 's'], 'All services'],
  [['g', 'r'], 'All resources'],
  [['g', 'c'], 'Compute'],
  [['g', 'd'], 'IoT Core (devices)'],
  [['g', 'a'], 'Storage (archive)'],
  [['g', 'i'], 'Identity: roles'],
  [['g', 'b'], 'Billing'],
  [['g', 'e'], 'Audit trail (events)'],
  [['g', 'm'], 'Marketplace'],
];

const SHELL_KEYS: [string[], string][] = [
  [['Tab'], 'Complete; twice lists the choices'],
  [['↑', '↓'], 'Walk history'],
  [['Ctrl', 'L'], 'Clear the screen'],
  [['Ctrl', 'C'], 'Cancel the line'],
  [['Ctrl', 'U'], 'Delete to the start of the line'],
  [['Ctrl', 'W'], 'Delete the previous word'],
  [['!!'], 'Repeat the last command'],
];

export function Shortcuts() {
  const ui = useUi();
  const list = (items: [string[], string][]) => (
    <dl className={s.keys}>
      {items.map(([k, label]) => (
        <div key={label}>
          <dt>
            {k.map((x) => (
              <kbd key={x}>{x}</kbd>
            ))}
          </dt>
          <dd>{label}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <Modal
      open={ui.shortcuts}
      onClose={() => closePanel('shortcuts')}
      label="Keyboard shortcuts"
      className={s.dialog}
    >
      <header className={s.sheetHead}>
        <h2>Keyboard shortcuts</h2>
        <button
          type="button"
          className={s.iconBtn}
          aria-label="Close"
          onClick={() => closePanel('shortcuts')}
        >
          <Icon name="x" />
        </button>
      </header>
      <div className={s.keysGrid}>
        <section>
          <h3>Console</h3>
          {list(KEYS)}
        </section>
        <section>
          <h3>CloudShell</h3>
          {list(SHELL_KEYS)}
          <p className={s.muted}>
            Signed in as <code>{ACCOUNT}</code>. Try{' '}
            <button
              type="button"
              className={s.linkBtn}
              onClick={() => {
                closePanel('shortcuts');
                toggleShell(true);
              }}
            >
              CloudShell
            </button>{' '}
            or <a href={href('read')}>read everything as a page</a>.
          </p>
        </section>
      </div>
    </Modal>
  );
}
