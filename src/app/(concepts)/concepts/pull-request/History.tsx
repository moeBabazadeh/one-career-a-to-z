'use client';

import { useState } from 'react';
import type { Commit, CommitType } from './model';
import { allCommits, usePR } from './store';
import { Avatar, CopyButton, Icon, Inline, cx } from './ui';
import s from './pr.module.scss';

const TYPES: { id: CommitType; label: string }[] = [
  { id: 'feat', label: 'feat' },
  { id: 'fix', label: 'fix' },
  { id: 'docs', label: 'docs' },
  { id: 'chore', label: 'chore' },
];

export const commitDom = (id: string) => `commit-${id}`;

function CommitRow({ c }: { c: Commit }) {
  const [open, setOpen] = useState(false);
  const bodyId = `${commitDom(c.id)}-body`;
  return (
    <li className={s.commit} id={commitDom(c.id)} tabIndex={-1} data-type={c.type}>
      <span className={s.commitDot} aria-hidden="true" />
      <div className={s.commitMain}>
        <p className={s.commitSubject}>
          <span className={s.ctype} data-type={c.type}>
            {c.type}
            {c.breaking && '!'}
          </span>
          <span className={s.cscope}>{c.scope}</span>
          <span className={s.csubject}>{c.subject}</span>
          {c.body && (
            <button
              type="button"
              className={s.ellipsis}
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Hide the commit message' : 'Show the commit message'}
            >
              …
            </button>
          )}
        </p>
        <p className={s.commitMeta}>
          <Avatar person={c.author} size={18} />
          {c.coAuthor && <Avatar person={c.coAuthor} size={18} />}
          <b>{c.author.login}</b>
          {c.coAuthor && <> and {c.coAuthor.login}</>} committed · {c.date}
          {c.breaking && <span className={cx(s.badge, s.badgeRed)}>BREAKING CHANGE</span>}
        </p>
        {open && (
          <div id={bodyId} className={s.commitBody}>
            {c.body.split('\n\n').map((block, i) =>
              block.split('\n').every((l) => l.startsWith('- ')) ? (
                <ul key={i}>
                  {block.split('\n').map((l) => (
                    <li key={l}>
                      <Inline text={l.slice(2)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={i}>
                  {block.split('\n').map((l, k) => (
                    <span key={k} className={s.bodyLine}>
                      <Inline text={l} />
                    </span>
                  ))}
                </p>
              ),
            )}
            {c.url && (
              <a href={c.url} target="_blank" rel="noreferrer" className={s.bodyLink}>
                {c.url.replace(/^https?:\/\//, '')} <Icon.out />
              </a>
            )}
          </div>
        )}
      </div>
      <div className={s.commitSha}>
        <code title={c.sha}>{c.short}</code>
        <CopyButton text={c.sha} label={`Copy the full id of ${c.short}`} />
      </div>
    </li>
  );
}

export default function History() {
  const pr = usePR();
  const commits = allCommits(pr);
  const [only, setOnly] = useState<CommitType | null>(null);
  const shown = commits.filter((c) => !only || c.type === only);

  const groups: { label: string; list: Commit[] }[] = [];
  for (const c of shown) {
    const label =
      c.date === 'in review' || c.date === 'just now'
        ? 'In review'
        : `Commits in ${Math.floor(c.t)}`;
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.list.push(c);
    else groups.push({ label, list: [c] });
  }

  return (
    <div className={s.historyTab}>
      <div className={s.historyBar}>
        <p>
          <b>{commits.length} commits</b> on <code>moe/cto</code>, oldest first. Subjects follow
          Conventional Commits.
        </p>
        <div className={s.chips} role="group" aria-label="Filter by type">
          <button type="button" aria-pressed={only === null} onClick={() => setOnly(null)}>
            All <span>{commits.length}</span>
          </button>
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={only === t.id}
              onClick={() => setOnly(only === t.id ? null : t.id)}
              data-type={t.id}
            >
              {t.label} <span>{commits.filter((c) => c.type === t.id).length}</span>
            </button>
          ))}
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.label} className={s.commitGroup} aria-label={g.label}>
          <h3>
            <Icon.commit /> {g.label}
          </h3>
          <ol className={s.commitList}>
            {g.list.map((c) => (
              <CommitRow key={c.id} c={c} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
