'use client';

import { useState } from 'react';
import { db, profile } from '../_shared/data';
import { tokenId, tokenize } from './tokens';
import s from './neural.module.scss';

const PLACEHOLDER = `Hi ${db.person.first}, we’re building … and would like to talk about …`;
const SUBJECT = `Hello from ${db.person.site}`;
const TINTS = [s.t0, s.t1, s.t2, s.t3, s.t4];

const TOOLS: [string, string, string][] = [
  ['email', profile.email, `mailto:${profile.email}`],
  ['linkedin', new URL(profile.linkedin).pathname, profile.linkedin],
  ['github', profile.github.replace('https://', ''), profile.github],
  ['cv', profile.cv, profile.cv],
];

export default function Inference() {
  const [prompt, setPrompt] = useState('');
  const [ids, setIds] = useState(false);
  const text = prompt || PLACEHOLDER;
  const tokens = tokenize(text);
  const href = `mailto:${profile.email}?subject=${encodeURIComponent(SUBJECT)}${prompt ? `&body=${encodeURIComponent(prompt)}` : ''}`;

  return (
    <div className={s.inference}>
      <div className={s.playground}>
        <p className={s.pgHead}>
          <span className={s.role}>user</span>
          <span>
            {tokens.length} tokens · {text.length} chars
          </span>
        </p>
        <label className={s.sr} htmlFor="prompt">{`Your message to ${db.person.first}`}</label>
        <textarea
          id="prompt"
          value={prompt}
          rows={4}
          placeholder={PLACEHOLDER}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') window.location.href = href;
          }}
        />
        <div className={s.tokView} aria-hidden="true" data-empty={prompt ? undefined : ''}>
          {tokens.map((t, i) => (
            <span key={i} className={TINTS[i % TINTS.length]}>
              {ids ? tokenId(t) : t}
            </span>
          ))}
        </div>
        <p className={s.pgHead}>
          <span className={`${s.role} ${s.roleAsst}`}>assistant</span>
          <span>toy tokenizer · ids are hashed</span>
        </p>
        <p className={s.reply}>
          Send opens your mail app with this message, addressed to <b>{profile.email}</b>.
        </p>
        <div className={s.pgFoot}>
          <label className={s.check}>
            <input type="checkbox" checked={ids} onChange={() => setIds(!ids)} /> Show token ids
          </label>
          <a className={s.send} href={href}>
            Send <kbd>⌘ ⏎</kbd>
          </a>
        </div>
      </div>

      <div className={s.tools}>
        <p className={s.kicker}>tools.json</p>
        <pre className={s.json}>
          {'{\n'}
          {TOOLS.map(([key, label, url], i) => (
            <span key={key}>
              {'  '}
              <span className={s.jKey}>&quot;{key}&quot;</span>:{' '}
              <a
                href={url}
                target={key === 'email' ? undefined : '_blank'}
                rel="noreferrer"
                className={s.jVal}
              >
                &quot;{label}&quot;
              </a>
              {i < TOOLS.length - 1 ? ',' : ''}
              {'\n'}
            </span>
          ))}
          {'}'}
        </pre>
        <p className={s.muted}>Or call one of the tools directly.</p>
      </div>
    </div>
  );
}
