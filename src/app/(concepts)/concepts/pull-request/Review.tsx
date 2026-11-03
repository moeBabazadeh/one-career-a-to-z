'use client';

import { useId, useState } from 'react';
import { PERSONAS, YOU } from './model';
import { FILES, type Lang, type Thread } from './changes';
import { diffLines, type Row } from './diff';
import { highlightLine, type Token } from './syntax';
import {
  applySuggestion,
  isResolved,
  setDraft,
  setResolved,
  setVerdict,
  submitReview,
  usePR,
  verdictText,
  type LineComment,
  type Verdict,
} from './store';
import { Avatar, Icon, Inline, Who, cx } from './ui';
import s from './pr.module.scss';

/* ------------------------------------------------------------------ code lines */

/** Renders tokens, with the changed span marked and URLs as links. */
export function Code({ tokens, span }: { tokens: Token[]; span?: [number, number] }) {
  const out: React.ReactNode[] = [];
  let at = 0;
  let k = 0;
  for (const t of tokens) {
    const start = at;
    const end = at + t.text.length;
    at = end;
    const cls = t.kind ? s[`t_${t.kind}`] : undefined;
    const pieces: [string, boolean][] =
      span && end > span[0] && start < span[1]
        ? ([
            [t.text.slice(0, Math.max(0, span[0] - start)), false],
            [
              t.text.slice(Math.max(0, span[0] - start), Math.min(t.text.length, span[1] - start)),
              true,
            ],
            [t.text.slice(Math.min(t.text.length, span[1] - start)), false],
          ] as [string, boolean][])
        : [[t.text, false]];
    for (const [text, marked] of pieces) {
      if (!text) continue;
      const inner =
        t.kind === 'url' && !marked ? (
          <a
            key={k++}
            className={cls}
            href={text.startsWith('/') || text.startsWith('http') ? text : `https://${text}`}
            target="_blank"
            rel="noreferrer"
          >
            {text}
          </a>
        ) : (
          <span key={k++} className={cls}>
            {text}
          </span>
        );
      out.push(marked ? <mark key={k++}>{inner}</mark> : inner);
    }
  }
  return <>{out}</>;
}

export const tokensFor = (text: string, lang: Lang) => highlightLine(text, lang);

/** A small unified diff, for suggestions and thread context. */
export function MiniDiff({ rows, lang, numbers }: { rows: Row[]; lang: Lang; numbers?: boolean }) {
  return (
    <div className={s.miniDiff}>
      {rows.map((r, i) => (
        <div key={i} className={s.miniRow} data-type={r.type}>
          {numbers && <span className={s.miniNo}>{r.newNo ?? r.oldNo}</span>}
          <span className={s.sign} aria-hidden="true">
            {r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}
          </span>
          <span className={s.sr}>
            {r.type === 'add' ? 'Added: ' : r.type === 'del' ? 'Removed: ' : ''}
          </span>
          <code className={s.miniCode}>
            <Code tokens={tokensFor(r.text, lang)} span={r.span} />
          </code>
        </div>
      ))}
    </div>
  );
}

const langOf = (path: string) => FILES.find((f) => f.path === path)?.lang ?? 'yaml';

/* ------------------------------------------------------------------ threads */

export const threadDom = (id: string) => `thread-${id}`;

export function ThreadView({ thread, inline = false }: { thread: Thread; inline?: boolean }) {
  const pr = usePR();
  const resolved = isResolved(pr, thread);
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? !resolved;
  const lang = langOf(thread.path);
  const contextRows: Row[] = thread.context.map((text, i) => ({
    type: thread.outdated ? 'eq' : 'add',
    text,
    newNo: thread.line + i,
  }));
  const bodyId = useId();
  const canCommit = thread.id === 'classrooms' && !pr.applied && !pr.merged;

  return (
    <section
      className={s.thread}
      id={threadDom(thread.id)}
      tabIndex={-1}
      data-resolved={resolved || undefined}
      data-inline={inline || undefined}
      aria-label={`Conversation on ${thread.path} line ${thread.line}`}
    >
      <header className={s.threadHead}>
        <button
          type="button"
          className={s.threadToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setOpen(!expanded)}
        >
          <span className={s.chev} data-open={expanded || undefined}>
            <Icon.chevron />
          </span>
          {!inline && (
            <span className={s.threadPath}>
              {thread.path}
              <span className={s.muted}> · line {thread.line}</span>
            </span>
          )}
          {inline && (
            <span className={s.threadPath}>
              {thread.comments.length} {thread.comments.length === 1 ? 'comment' : 'comments'}
            </span>
          )}
        </button>
        {thread.outdated && <span className={cx(s.badge, s.badgeMuted)}>Outdated</span>}
        {resolved ? (
          <span className={cx(s.badge, s.badgePurple)}>
            <Icon.check /> Resolved
          </span>
        ) : (
          <span className={cx(s.badge, s.badgeAmber)}>Unresolved</span>
        )}
      </header>

      <div id={bodyId} hidden={!expanded} className={s.threadBody}>
        {!inline && <MiniDiff rows={contextRows} lang={lang} numbers />}
        <ol className={s.threadComments}>
          {thread.comments.map((c, i) => (
            <li key={i} className={s.tComment}>
              <Avatar person={c.author} size={28} />
              <div className={s.tMain}>
                <p className={s.tMeta}>
                  <Who person={c.author} />
                  {i === 0 && c.author.kind === 'persona' && (
                    <span className={s.muted}>
                      {' '}
                      · {thread.review === 'approved' ? 'reviewed' : 'commented'}
                    </span>
                  )}
                </p>
                <p className={s.tText}>
                  <Inline text={c.body} />
                </p>
                {c.suggestion && (
                  <div className={s.suggestion}>
                    <p className={s.suggestHead}>
                      <Icon.files /> Suggested change
                      {(c.after || (thread.id === 'classrooms' && pr.applied)) && (
                        <span className={cx(s.badge, s.badgeGreen)}>Committed</span>
                      )}
                    </p>
                    <MiniDiff rows={diffLines(c.suggestion.remove, c.suggestion.add)} lang={lang} />
                    {canCommit && (
                      <div className={s.suggestActions}>
                        <button
                          type="button"
                          className={cx(s.btn, s.btnPrimary, s.btnSmall)}
                          onClick={applySuggestion}
                        >
                          Commit suggestion
                        </button>
                        <span className={s.muted}>
                          Pushes a commit to {`moe/cto`} and re-runs the checks.
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {c.after && (
                  <p className={s.tEvent}>
                    <Icon.commit /> <b>{c.author.login}</b> {c.after}
                  </p>
                )}
              </div>
            </li>
          ))}
          {thread.id === 'classrooms' && pr.applied && (
            <li className={s.tComment}>
              <Avatar person={YOU} size={28} />
              <div className={s.tMain}>
                <p className={s.tEvent}>
                  <Icon.commit /> <b>you</b> committed this suggestion, co-authored by{' '}
                  {PERSONAS.staff.login}
                </p>
              </div>
            </li>
          )}
        </ol>
        <footer className={s.threadFoot}>
          {resolved ? (
            <>
              <span className={s.muted}>
                Resolved by{' '}
                <b>
                  {pr.threads[thread.id] === true ? 'you' : (thread.resolvedBy?.login ?? 'you')}
                </b>
              </span>
              <button
                type="button"
                className={cx(s.btn, s.btnSmall)}
                onClick={() => setResolved(thread.id, false)}
                disabled={Boolean(pr.merged)}
              >
                Unresolve conversation
              </button>
            </>
          ) : (
            <button
              type="button"
              className={cx(s.btn, s.btnSmall)}
              onClick={() => setResolved(thread.id, true)}
              disabled={Boolean(pr.merged)}
            >
              Resolve conversation
            </button>
          )}
        </footer>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ the visitor's line comments */

export function PendingComment({
  c,
  onDelete,
  submitted,
}: {
  c: LineComment;
  onDelete?: () => void;
  submitted?: boolean;
}) {
  return (
    <div className={s.pending} data-submitted={submitted || undefined}>
      <Avatar person={YOU} size={24} />
      <div className={s.tMain}>
        <p className={s.tMeta}>
          <b>you</b>
          <span className={cx(s.badge, submitted ? s.badgeMuted : s.badgeAmber)}>
            {submitted ? 'Submitted' : 'Pending'}
          </span>
          {!submitted && <span className={s.muted}> · sent with your review</span>}
        </p>
        <p className={s.tText}>{c.body}</p>
      </div>
      {onDelete && (
        <button
          type="button"
          className={s.iconBtn}
          onClick={onDelete}
          aria-label="Delete this pending comment"
        >
          <Icon.x />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ review form */

const VERDICTS: { id: Verdict; label: string; help: string }[] = [
  { id: 'comment', label: 'Comment', help: 'General feedback, without approving.' },
  { id: 'approve', label: 'Approve', help: 'Approve merging these changes.' },
  {
    id: 'changes',
    label: 'Request changes',
    help: 'Feedback that must be addressed before merging.',
  },
];

export function ReviewForm({
  onDone,
  compact = false,
}: {
  onDone?: () => void;
  compact?: boolean;
}) {
  const pr = usePR();
  const id = useId();
  const merged = Boolean(pr.merged);
  const empty = !pr.draft.trim() && !pr.pending.length;
  // Approving needs no words; a comment or a change request does.
  const blocked = merged || (pr.verdict !== 'approve' && empty);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    submitReview();
    onDone?.();
  };

  return (
    <form
      className={cx(s.reviewForm, compact && s.reviewCompact)}
      onSubmit={submit}
      aria-label="Your review"
    >
      <label htmlFor={`${id}-body`} className={s.reviewLabel}>
        {pr.review ? 'Leave another review' : 'Leave a review'}
        <span className={s.muted}> · kept in this browser until you send it</span>
      </label>
      <textarea
        id={`${id}-body`}
        className={s.textarea}
        rows={compact ? 4 : 5}
        value={pr.draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="What would you want to know before hiring a CTO? Your words go into the email at the end."
        disabled={merged}
      />
      <fieldset className={s.verdicts} disabled={merged}>
        <legend className={s.sr}>Review verdict</legend>
        {VERDICTS.map((v) => (
          <label key={v.id} className={s.verdict} data-tone={v.id}>
            <input
              type="radio"
              name={`${id}-verdict`}
              value={v.id}
              checked={pr.verdict === v.id}
              onChange={() => setVerdict(v.id)}
            />
            <span className={s.radio} aria-hidden="true" />
            <span>
              <b>{v.label}</b>
              <small>{v.help}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className={s.reviewActions}>
        {pr.pending.length > 0 && (
          <span className={s.muted}>
            {pr.pending.length} pending line {pr.pending.length === 1 ? 'comment' : 'comments'} will
            be included
          </span>
        )}
        <button type="submit" className={cx(s.btn, s.btnPrimary)} disabled={blocked}>
          {merged ? 'Merged' : 'Submit review'}
        </button>
      </div>
      {pr.review && !merged && (
        <p className={s.lastReview}>
          Your last review: <b>{verdictText(pr.review.verdict)}</b>
        </p>
      )}
    </form>
  );
}
