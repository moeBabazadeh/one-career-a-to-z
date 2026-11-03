'use client';

import { Fragment, useState } from 'react';
import { db, profile } from '../_shared/data';
import { errorText, execute, type RunResult } from './sql/engine';
import { mailto, useModKey } from './store';
import s from './query.module.scss';

const first = db.person.first;

const quote = (v: string) => `'${v.replace(/'/g, "''")}'`;
const literal = (v: string) => (v.trim() ? quote(v) : 'NULL');

export default function Contact() {
  const mod = useModKey();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [out, setOut] = useState<RunResult | null>(null);

  const sql = `INSERT INTO messages (name, email, body)\nVALUES (${literal(name)}, ${literal(email)}, ${literal(body)})\nRETURNING id, created_at;`;

  const submit = () => {
    const r = execute(sql, { now: new Date() });
    setOut(r);
    if (r.ok && r.mail) window.location.href = mailto(r.mail);
  };

  const lines = [
    <Fragment key="l0">
      <span className={s.t_kw}>INSERT INTO</span> <span className={s.t_tbl}>messages</span>{' '}
      <span className={s.t_op}>(</span>name<span className={s.t_op}>,</span> email
      <span className={s.t_op}>,</span> body<span className={s.t_op}>)</span>
    </Fragment>,
    <Fragment key="l1">
      <span className={s.t_kw}>VALUES</span> <span className={s.t_op}>(</span>
    </Fragment>,
    <label key="l2" className={s.lit}>
      <span className={s.sr}>Your name</span>
      <span className={s.q}>&apos;</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        autoComplete="name"
        spellCheck={false}
        size={Math.max(9, name.length + 1)}
      />
      <span className={s.q}>&apos;</span>
      <span className={s.t_op}>,</span>
      <span className={s.t_com}> -- optional</span>
    </label>,
    <label key="l3" className={s.lit}>
      <span className={s.sr}>Your email</span>
      <span className={s.q}>&apos;</span>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        spellCheck={false}
        size={Math.max(15, email.length + 1)}
      />
      <span className={s.q}>&apos;</span>
      <span className={s.t_op}>,</span>
      <span className={s.t_com}> -- NOT NULL</span>
    </label>,
    <label key="l4" className={`${s.lit} ${s.litBody}`}>
      <span className={s.sr}>Your message</span>
      <span className={s.q}>&apos;</span>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Hi ${first}, we’re building…`}
        rows={Math.min(8, Math.max(3, body.split('\n').length))}
      />
      <span className={s.q}>&apos;</span>
    </label>,
    <Fragment key="l5">
      <span className={s.t_op}>)</span>
    </Fragment>,
    <Fragment key="l6">
      <span className={s.t_kw}>RETURNING</span> id<span className={s.t_op}>,</span> created_at
      <span className={s.t_op}>;</span>
    </Fragment>,
  ];

  return (
    <form
      className={s.insert}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      }}
      aria-describedby="insert-note"
    >
      <div className={s.insertHead}>
        <span className={s.fileTab}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 1.5h5.5L13 5v9.5H4z" />
            <path d="M9.5 1.5V5H13" />
          </svg>
          {`write_to_${first.toLowerCase()}.sql`}
        </span>
        <button type="submit" className={s.runBtn}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 3.5v9l7-4.5z" />
          </svg>
          Execute
          <kbd>{mod}↵</kbd>
        </button>
      </div>
      <ol className={s.insertCode}>
        {lines.map((l, i) => (
          <li key={i} data-indent={i >= 2 && i <= 4 ? '' : undefined}>
            {l}
          </li>
        ))}
      </ol>
      <div className={s.insertOut} aria-live="polite">
        {!out ? (
          <p id="insert-note" className={s.muted}>
            The INSERT runs in this tab, checks its constraints, then opens your mail app with the
            draft. Nothing is sent from this page.
          </p>
        ) : out.ok ? (
          <div className={s.okOut}>
            <p>
              <b>{out.command}</b> · id {String(out.rows[0]?.[0])} · {String(out.rows[0]?.[1])}
            </p>
            <p>
              Your mail app should open with the draft.{' '}
              {out.mail && (
                <a href={mailto(out.mail)} className={s.link}>
                  Open it again
                </a>
              )}
            </p>
          </div>
        ) : (
          <pre className={s.errorPre} role="alert">
            {errorText(out.error!).map((l, i) => (
              <span
                key={i}
                data-tone={/^ERROR/.test(l) ? 'error' : /^HINT/.test(l) ? 'hint' : 'dim'}
              >
                {l}
                {'\n'}
              </span>
            ))}
          </pre>
        )}
        <p className={s.direct}>
          Or write to <a href={`mailto:${profile.email}`}>{profile.email}</a> directly.
        </p>
      </div>
    </form>
  );
}
