'use client';

import { useEffect, useRef, useState } from 'react';
import { db, profile } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import { PR } from './model';
import { JOBS } from './workflow';
import { duration, type JobTiming } from './ci';
import {
  allCommits,
  headCommit,
  mailto,
  merge,
  reveal,
  revert,
  selectJob,
  setTab,
  unresolved,
  verdictText,
  type MergeMethod,
} from './store';
import { useRun } from './Checks';
import { threadDom } from './Review';
import { Icon, StatusIcon, cx } from './ui';
import s from './pr.module.scss';

const METHODS: { id: MergeMethod; label: string; confirm: string; help: string }[] = [
  {
    id: 'squash',
    label: 'Squash and merge',
    confirm: 'Confirm squash and merge',
    help: 'The commits on moe/cto become one commit on main.',
  },
  {
    id: 'merge',
    label: 'Create a merge commit',
    confirm: 'Confirm merge',
    help: 'Every commit is kept, joined by a merge commit.',
  },
  {
    id: 'rebase',
    label: 'Rebase and merge',
    confirm: 'Confirm rebase and merge',
    help: 'The commits are replayed onto main, one by one.',
  },
];

type Req = {
  key: string;
  ok: boolean | null;
  title: string;
  detail: React.ReactNode;
  action?: React.ReactNode;
};

export default function MergeBox() {
  const reduced = useReducedMotion();
  const { pr, status, done, running, sched, at } = useRun(true);
  const [method, setMethod] = useState<MergeMethod>('squash');
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const commits = allCommits(pr);
  const [title, setTitle] = useState(`${PR.title} (#${PR.number})`);
  const menuRef = useRef<HTMLDivElement>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !menuRef.current?.contains(e.target as Node)
      )
        setMenu(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close);
    };
  }, [menu]);

  const open = unresolved(pr);
  const checksOk = done === JOBS.length && !running;
  const verdict = pr.review?.verdict;
  const m = METHODS.find((x) => x.id === method) as (typeof METHODS)[number];

  const reqs: Req[] = [
    {
      key: 'review',
      ok: verdict === 'approve' ? true : verdict === 'changes' ? false : null,
      title:
        verdict === 'approve'
          ? 'Changes approved'
          : verdict === 'changes'
            ? 'Changes requested'
            : 'Review required',
      detail:
        verdict === 'approve'
          ? 'Approved by you, the code owner for this path.'
          : verdict === 'changes'
            ? `You requested changes. Approve to unblock the merge, or tell ${db.person.first} what to change.`
            : 'An approving review from you, the code owner, is required.',
      action:
        verdict !== 'approve' ? (
          <button
            type="button"
            className={cx(s.btn, s.btnSmall)}
            onClick={() => reveal('conversation', 'review-form')}
          >
            Add your review
          </button>
        ) : undefined,
    },
    {
      key: 'threads',
      ok: open.length === 0,
      title: open.length
        ? `${open.length} unresolved ${open.length === 1 ? 'conversation' : 'conversations'}`
        : 'All conversations resolved',
      detail: open.length
        ? 'Conversations on code must be resolved before merging.'
        : 'Every review thread has been resolved.',
      action: open.length ? (
        <button
          type="button"
          className={cx(s.btn, s.btnSmall)}
          onClick={() => reveal('conversation', threadDom(open[0].id))}
        >
          Show it
        </button>
      ) : undefined,
    },
    {
      key: 'checks',
      ok: checksOk ? true : null,
      title: checksOk ? 'All checks have passed' : 'Checks in progress',
      detail: checksOk
        ? `${JOBS.length} successful checks on ${headCommit(pr).short}.`
        : `${done} of ${JOBS.length} checks complete.`,
      action: (
        <button
          type="button"
          className={cx(s.btn, s.btnSmall)}
          aria-expanded={showChecks}
          onClick={() => setShowChecks(!showChecks)}
        >
          {showChecks ? 'Hide checks' : 'Show checks'}
        </button>
      ),
    },
    {
      key: 'conflicts',
      ok: true,
      title: 'No conflicts with the base branch',
      detail: `Merging can be performed automatically into ${PR.baseRef}.`,
    },
  ];
  const ready = reqs.every((r) => r.ok === true);

  const doMerge = () => {
    setConfirming(false);
    if (reduced) {
      merge(method);
      return;
    }
    setMerging(true);
    timer.current = window.setTimeout(() => {
      setMerging(false);
      merge(method);
    }, 1100);
  };

  const squashBody = commits.map((c) => `* ${c.header}`).join('\n');

  return (
    <section className={s.mergeBox} data-ready={ready || undefined} aria-label="Merge">
      <div className={s.mergeIcon} data-ready={ready || undefined} aria-hidden="true">
        <Icon.merge />
      </div>
      <div className={s.mergeCard}>
        <ul className={s.reqs}>
          {reqs.map((r) => (
            <li key={r.key} data-ok={r.ok === true ? 'yes' : r.ok === false ? 'no' : 'wait'}>
              <span className={s.reqIcon} aria-hidden="true">
                {r.key === 'checks' && !checksOk ? (
                  <StatusIcon status={running ? 'running' : 'queued'} size={20} />
                ) : r.ok === true ? (
                  <Icon.check />
                ) : r.ok === false ? (
                  <Icon.x />
                ) : (
                  <span className={s.reqDot} />
                )}
              </span>
              <div className={s.reqText}>
                <p className={s.reqTitle}>
                  <span className={s.sr}>
                    {r.ok === true ? 'Met: ' : r.ok === false ? 'Blocking: ' : 'Pending: '}
                  </span>
                  {r.title}
                </p>
                <p className={s.reqDetail}>{r.detail}</p>
              </div>
              {r.action}
              {r.key === 'checks' && showChecks && (
                <ul className={s.checkList}>
                  {JOBS.map((j) => {
                    const st = status(j.id);
                    const t = sched.jobs.get(j.id) as JobTiming;
                    return (
                      <li key={j.id}>
                        <StatusIcon status={st} size={14} />
                        <span className={s.checkName}>
                          review / <b>{j.name}</b>
                        </span>
                        <span className={s.muted}>
                          {st === 'queued'
                            ? 'Queued'
                            : st === 'running'
                              ? `In progress · ${duration(at - t.start)}`
                              : `Successful in ${duration(t.end - t.start)}`}
                        </span>
                        <button
                          type="button"
                          className={s.linkBtn}
                          onClick={() => {
                            selectJob(j.id);
                            setTab('checks');
                          }}
                        >
                          Details
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {confirming ? (
          <div className={s.confirm}>
            <label className={s.reviewLabel} htmlFor="merge-title">
              Commit message
            </label>
            <input
              id="merge-title"
              className={s.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {method === 'squash' && (
              <pre className={s.squashBody} aria-label="Extended description">
                {squashBody}
              </pre>
            )}
            <p className={s.muted}>{m.help}</p>
            <div className={s.confirmActions}>
              <button
                type="button"
                className={cx(s.btn, s.btnMerge)}
                onClick={doMerge}
                disabled={!title.trim()}
              >
                {m.confirm}
              </button>
              <button type="button" className={s.btn} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={s.mergeActions}>
            <div className={s.splitBtn} ref={menuRef}>
              <button
                type="button"
                className={cx(s.btn, s.btnMerge)}
                disabled={!ready || merging}
                onClick={() => setConfirming(true)}
              >
                {merging ? (
                  <>
                    <StatusIcon status="running" size={14} /> Merging…
                  </>
                ) : (
                  m.label
                )}
              </button>
              <button
                type="button"
                className={cx(s.btn, s.btnMerge, s.caretBtn)}
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-label="Choose how to merge"
                onClick={() => setMenu(!menu)}
                disabled={merging}
              >
                <Icon.down />
              </button>
              {menu && (
                <div className={s.menu} role="menu" aria-label="Merge method">
                  {METHODS.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={method === x.id}
                      onClick={() => {
                        setMethod(x.id);
                        setMenu(false);
                      }}
                    >
                      <span className={s.menuCheck}>{method === x.id && <Icon.check />}</span>
                      <span>
                        <b>{x.label}</b>
                        <small>{x.help}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className={s.mergeHint}>
              {ready ? (
                'Everything this branch needs is in place.'
              ) : (
                <>
                  <Icon.lock /> Merging is blocked until every requirement above is met.
                </>
              )}
            </p>
          </div>
        )}
        {verdict === 'changes' && (
          <p className={s.changesNote}>
            Prefer to talk it through?{' '}
            <a href={mailto(pr, profile.email)}>
              <Icon.mail /> {`Send ${db.person.first} your review`}
            </a>
          </p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ after the merge */

export function Merged() {
  const reduced = useReducedMotion();
  const { pr } = useRun(false);
  if (!pr.merged) return null;
  const short = pr.merged.sha.slice(0, 7);
  const how =
    pr.merged.method === 'squash'
      ? 'squashed and merged'
      : pr.merged.method === 'rebase'
        ? 'rebased and merged'
        : 'merged';
  return (
    <section className={s.merged} data-animate={!reduced || undefined} aria-label="Merged">
      <svg
        className={s.mergedArt}
        viewBox="0 0 760 70"
        preserveAspectRatio="xMinYMid meet"
        aria-hidden="true"
      >
        <path d="M6 50 H754" className={s.maMain} />
        <path
          d="M40 50 C 76 50 76 18 112 18 H600 C 636 18 636 50 672 50"
          className={s.maBranch}
          pathLength={1}
        />
        {Array.from({ length: 12 }, (_, i) => 150 + i * 38).map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={18}
            r={4.5}
            className={s.maDot}
            style={{ animationDelay: `${0.2 + i * 0.05}s` }}
          />
        ))}
        <circle cx={672} cy={50} r={9} className={s.maMerge} />
        <circle cx={40} cy={50} r={5} className={s.maBase} />
        <text x={680} y={36} className={s.maLabel}>
          main
        </text>
      </svg>
      <div className={s.mergedText}>
        <p className={s.mergedTitle}>
          <Icon.merge /> Pull request successfully merged and closed
        </p>
        <p>
          You {how} <code>{PR.headRef}</code> into <code>{PR.baseRef}</code> as <code>{short}</code>
          {pr.review ? (
            <>
              , with your review: <b>{verdictText(pr.review.verdict)}</b>.
            </>
          ) : (
            '.'
          )}{' '}
          The next step is a conversation.
        </p>
        <div className={s.mergedActions}>
          <a className={cx(s.btn, s.btnMerge)} href={mailto(pr, profile.email)}>
            <Icon.mail /> {`Email ${db.person.first} the merge note`}
          </a>
          <a className={s.btn} href={profile.cv} target="_blank" rel="noreferrer">
            <Icon.download /> CV (PDF)
          </a>
          <a className={s.btn} href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn <Icon.out />
          </a>
          <button type="button" className={cx(s.btn, s.btnGhost)} onClick={revert}>
            <Icon.revert /> Revert
          </button>
        </div>
        <p className={s.mergedNote}>
          The email opens in your mail app with your review filled in. Nothing is sent from this
          page.
        </p>
      </div>
    </section>
  );
}
