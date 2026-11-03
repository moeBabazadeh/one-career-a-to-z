'use client';

import { useEffect, useRef, useState } from 'react';
import { about, db, fmt, profile, skills, stats } from '../_shared/data';
import { COMMITS, LABELS, MOE, PERSONAS, PR, YOU, commitById, type Person } from './model';
import { thread } from './changes';
import { JOBS } from './workflow';
import {
  allCommits,
  isResolved,
  reveal,
  resetAll,
  setTab,
  toggleReaction,
  usePR,
  verdictText,
  type VisitorEvent,
} from './store';
import { useRun } from './Checks';
import MergeBox, { Merged } from './Merge';
import { PendingComment, ReviewForm, ThreadView } from './Review';
import { commitDom } from './History';
import { Avatar, CopyButton, Icon, LabelChip, StatusIcon, Who, cx } from './ui';
import s from './pr.module.scss';

/* ------------------------------------------------------------------ reactions */

const REACTIONS: { key: string; emoji: string; name: string; by: Person[] }[] = [
  { key: '+1', emoji: '👍', name: 'thumbs up', by: [PERSONAS.staff, PERSONAS.security] },
  { key: 'rocket', emoji: '🚀', name: 'rocket', by: [PERSONAS.recruiter] },
  { key: 'eyes', emoji: '👀', name: 'eyes', by: [PERSONAS.staff] },
  { key: 'hooray', emoji: '🎉', name: 'hooray', by: [] },
  { key: 'heart', emoji: '❤️', name: 'heart', by: [] },
];

function Reactions() {
  const pr = usePR();
  const [picker, setPicker] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)
      )
        setPicker(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close);
    };
  }, [picker]);

  return (
    <div className={s.reactions} ref={wrap}>
      {REACTIONS.map((r) => {
        const mine = pr.reactions.includes(r.key);
        const count = r.by.length + (mine ? 1 : 0);
        if (!count) return null;
        const who = [...(mine ? ['you'] : []), ...r.by.map((p) => p.login)];
        return (
          <button
            key={r.key}
            type="button"
            className={s.reaction}
            aria-pressed={mine}
            onClick={() => toggleReaction(r.key)}
            title={`${who.join(', ')} reacted with ${r.name}`}
            aria-label={`${r.name}: ${count}. ${who.join(', ')}. ${mine ? 'Remove yours' : 'Add yours'}`}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <b>{count}</b>
          </button>
        );
      })}
      <button
        type="button"
        className={cx(s.reaction, s.addReaction)}
        aria-expanded={picker}
        aria-label="Add a reaction"
        onClick={() => setPicker(!picker)}
      >
        <Icon.smile />
      </button>
      {picker && (
        <div className={s.picker} role="group" aria-label="Pick a reaction">
          {REACTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={pr.reactions.includes(r.key)}
              aria-label={r.name}
              onClick={() => {
                toggleReaction(r.key);
                setPicker(false);
              }}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the description */

const { current, products } = db;
const { attendumReader, attendumBeacon } = db.devices;

const BRINGS: string[] = [
  `Architecture, roadmap and delivery of a cloud-native, multi-tenant platform: ${current.title} at ${current.company} since ${fmt.month(current.since)}.`,
  'AI in the product, from natural-language access to project data to early warning on schedule and cost risk.',
  `Firmware shipped for ${attendumReader.chip} card readers and ${attendumBeacon.chip} BLE beacons, with the iOS and Android app beside them (${products.attendum.title}).`,
  'A permission check on every API route, audit trails, and production alarms kept in infrastructure as code.',
  `Security gates on every pull request: secret scanning, Semgrep and Trivy (${products.smartclaim.title}).`,
  `Fixes merged upstream, in packages with ${db.downloads.weekly.short} weekly downloads combined.`,
];

/** The downloads figure is a sum over several packages, so its label says so. */
const statLabel = (st: { value: string; label: string }) =>
  st.value === db.downloads.weekly.short ? `${st.label}, combined` : st.label;

function Description() {
  return (
    <article className={s.opening} aria-label="Pull request description">
      <div className={s.tlAvatar}>
        <Avatar person={MOE} size={40} />
      </div>
      <div className={s.openCard}>
        <header className={s.cardHead}>
          <Who person={MOE} />
          <span className={s.muted}>opened this pull request · {PR.opened}</span>
        </header>
        <div className={s.desc}>
          <h2 className={s.h}>
            <span aria-hidden="true">##</span> Summary
          </h2>
          <p className={s.tagline}>{profile.tagline}</p>
          <p className={s.lede}>{profile.lede}</p>

          <h2 className={s.h}>
            <span aria-hidden="true">##</span> Why
          </h2>
          {about.map((p) => (
            <p key={p.slice(0, 20)}>{p}</p>
          ))}

          <h2 className={s.h}>
            <span aria-hidden="true">##</span> What this pull request brings
          </h2>
          <ul className={s.tasks}>
            {BRINGS.map((b) => (
              <li key={b}>
                <span className={s.taskBox} aria-hidden="true">
                  <Icon.check />
                </span>
                <span className={s.sr}>Done: </span>
                {b}
              </li>
            ))}
          </ul>

          <h2 className={s.h}>
            <span aria-hidden="true">##</span> By the numbers
          </h2>
          <table className={s.mdTable}>
            <thead>
              <tr>
                <th scope="col">Value</th>
                <th scope="col">What</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((st) => (
                <tr key={st.label}>
                  <td>
                    <code>{st.value}</code>
                  </td>
                  <td>{statLabel(st)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className={s.h}>
            <span aria-hidden="true">##</span> Stack
          </h2>
          <p className={s.stack}>
            {skills.map((sk) => (
              <code key={sk}>{sk}</code>
            ))}
          </p>

          <h2 className={s.h}>
            <span aria-hidden="true">##</span> How to review
          </h2>
          <ol className={s.howto}>
            <li>
              Read the diff in{' '}
              <button type="button" className={s.linkBtn} onClick={() => setTab('files')}>
                Files changed
              </button>
              : roles, roots, devices and what shipped, as data.
            </li>
            <li>
              Watch{' '}
              <button type="button" className={s.linkBtn} onClick={() => setTab('checks')}>
                Checks
              </button>{' '}
              run: the tests assert every claim here against the sources.
            </li>
            <li>Resolve the open thread, approve, then squash and merge.</li>
          </ol>
        </div>
        <footer className={s.cardFoot}>
          <Reactions />
        </footer>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ timeline pieces */

function Event({
  icon,
  tone,
  children,
  id,
}: {
  icon: React.ReactNode;
  tone?: 'green' | 'purple' | 'red' | 'amber';
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <li className={s.event} data-tone={tone} id={id}>
      <span className={s.eventIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={s.eventText}>{children}</div>
    </li>
  );
}

function ReviewCard({
  person,
  state,
  children,
  body,
}: {
  person: Person;
  state: 'approved' | 'commented' | 'changes';
  children?: React.ReactNode;
  body?: string;
}) {
  const icon =
    state === 'approved' ? <Icon.check /> : state === 'changes' ? <Icon.x /> : <Icon.eye />;
  const text =
    state === 'approved'
      ? 'approved these changes'
      : state === 'changes'
        ? 'requested changes'
        : 'reviewed';
  return (
    <li className={s.reviewItem} data-state={state}>
      <span className={s.eventIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={s.reviewBox}>
        <p className={s.reviewHead}>
          <Avatar person={person} size={22} />
          <Who person={person} /> <span className={s.muted}>{text}</span>
        </p>
        {body && <p className={s.reviewBody}>{body}</p>}
        {children}
      </div>
    </li>
  );
}

function Pushed() {
  const pr = usePR();
  const [all, setAll] = useState(false);
  const commits = COMMITS.filter((c) => c.id !== 'review-dates');
  const shown = all ? commits : commits.slice(-4);
  return (
    <Event icon={<Icon.commit />}>
      <p>
        <b>moe</b> added {commits.length} commits{' '}
        <span
          className={s.muted}
        >{`· roles, degrees, awards, products and upstream fixes since ${db.person.since}`}</span>
      </p>
      <ol className={s.pushed}>
        {!all && (
          <li>
            <button type="button" className={s.linkBtn} onClick={() => setAll(true)}>
              Show {commits.length - shown.length} earlier commits
            </button>
          </li>
        )}
        {shown.map((c) => (
          <li key={c.id}>
            <span className={s.ctype} data-type={c.type}>
              {c.type}
              {c.breaking && '!'}
            </span>
            <span className={s.pushedSubject}>{c.subject}</span>
            <button
              type="button"
              className={s.shaBtn}
              onClick={() => reveal('commits', commitDom(c.id))}
              aria-label={`Open ${c.short} in Commits`}
            >
              {c.short}
            </button>
          </li>
        ))}
      </ol>
      {pr.applied && <span className={s.sr}>A suggestion commit was added later.</span>}
    </Event>
  );
}

function ChecksEvent() {
  const { done, running, n } = useRun(true);
  const ok = done === JOBS.length && !running;
  return (
    <Event
      icon={<StatusIcon status={ok ? 'success' : 'running'} size={16} />}
      tone={ok ? 'green' : 'amber'}
    >
      <p>
        <b>{ok ? 'All checks have passed' : 'Checks are running'}</b>{' '}
        <span className={s.muted}>
          · run #{n} ·{' '}
          {ok ? `${JOBS.length} successful checks` : `${done} of ${JOBS.length} complete`}
        </span>{' '}
        <button type="button" className={s.linkBtn} onClick={() => setTab('checks')}>
          {ok ? 'View run' : 'Watch it'}
        </button>
      </p>
    </Event>
  );
}

function VisitorItem({ e }: { e: VisitorEvent }) {
  const pr = usePR();
  switch (e.kind) {
    case 'review': {
      const state =
        e.review.verdict === 'approve'
          ? 'approved'
          : e.review.verdict === 'changes'
            ? 'changes'
            : 'commented';
      return (
        <ReviewCard person={YOU} state={state} body={e.review.body || undefined}>
          {e.review.comments.length > 0 && (
            <div className={s.reviewComments}>
              {e.review.comments.map((c) => (
                <div key={c.id}>
                  <p className={s.commentOn}>
                    <code>
                      {c.path}:{c.line}
                    </code>
                  </p>
                  <PendingComment c={c} submitted />
                </div>
              ))}
            </div>
          )}
        </ReviewCard>
      );
    }
    case 'suggestion': {
      const head = allCommits(pr).find((c) => c.sha === e.sha);
      return (
        <Event icon={<Icon.commit />}>
          <p>
            <b>you</b> committed a suggestion from {PERSONAS.staff.login}:{' '}
            <span className={s.pushedSubject}>{head?.header}</span>{' '}
            <code className={s.shaPlain}>{e.sha.slice(0, 7)}</code>
          </p>
        </Event>
      );
    }
    case 'resolve':
    case 'unresolve':
      return (
        <Event icon={<Icon.comment />}>
          <p>
            <b>you</b> {e.kind === 'resolve' ? 'resolved' : 'reopened'} a conversation on{' '}
            <code>{thread(e.thread).path}</code>
          </p>
        </Event>
      );
    case 'merge':
      return (
        <Event icon={<Icon.merge />} tone="purple">
          <p>
            <b>you</b> merged commit <code className={s.shaPlain}>{e.sha.slice(0, 7)}</code> into{' '}
            <code>{PR.baseRef}</code>
          </p>
        </Event>
      );
    case 'revert':
      return (
        <Event icon={<Icon.revert />}>
          <p>
            <b>you</b> reverted the merge, and the pull request is open again
          </p>
        </Event>
      );
  }
}

/* ------------------------------------------------------------------ sidebar */

function Sidebar() {
  const pr = usePR();
  const v = pr.review?.verdict;
  const reviewers: { p: Person; icon: React.ReactNode; state: string }[] = [
    {
      p: YOU,
      icon:
        v === 'approve' ? (
          <Icon.check />
        ) : v === 'changes' ? (
          <Icon.x />
        ) : v === 'comment' ? (
          <Icon.comment />
        ) : (
          <span className={s.reqDot} />
        ),
      state: v ? verdictText(v) : 'Awaiting your review',
    },
    { p: PERSONAS.staff, icon: <Icon.comment />, state: 'Commented' },
    { p: PERSONAS.recruiter, icon: <Icon.comment />, state: 'Commented' },
    { p: PERSONAS.security, icon: <Icon.check />, state: 'Approved' },
  ];
  return (
    <aside className={s.sidebar} aria-label="Details">
      <section>
        <h3>Reviewers</h3>
        <ul className={s.reviewers}>
          {reviewers.map(({ p, icon, state }) => (
            <li key={p.login} data-state={state}>
              <Avatar person={p} size={20} />
              <span className={s.revName}>{p.login}</span>
              <span
                className={s.revState}
                title={state}
                data-tone={
                  state === 'Approved'
                    ? 'green'
                    : state === 'Changes requested'
                      ? 'red'
                      : state.startsWith('Awaiting')
                        ? 'amber'
                        : undefined
                }
              >
                {icon}
                <span className={s.sr}>{state}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className={s.sideNote}>Apart from you, the reviewers are fictional personas.</p>
      </section>
      <section>
        <h3>Assignee</h3>
        <p className={s.assignee}>
          <Avatar person={MOE} size={20} /> <b>moe</b>{' '}
          <span className={s.muted}>{profile.name}</span>
        </p>
      </section>
      <section>
        <h3>Labels</h3>
        <p className={s.labels}>
          {LABELS.map((l) => (
            <LabelChip key={l.name} label={l} />
          ))}
        </p>
      </section>
      <section>
        <h3>Branch</h3>
        <p className={s.branchLine}>
          <code>{PR.head}</code>
          <CopyButton text={PR.head} label="Copy the branch name" />
        </p>
        <p className={s.muted}>
          into <code>{PR.base}</code>
        </p>
      </section>
      <section>
        <h3>Reach the author</h3>
        <ul className={s.contactList}>
          <li>
            <a href={`mailto:${profile.email}`}>
              <Icon.mail /> {profile.email}
            </a>
          </li>
          <li>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              <Icon.out /> LinkedIn
            </a>
          </li>
          <li>
            <a href={profile.github} target="_blank" rel="noreferrer">
              <Icon.out /> GitHub
            </a>
          </li>
          <li>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              <Icon.download /> CV (PDF)
            </a>
          </li>
        </ul>
      </section>
      <section>
        <h3>Participants</h3>
        <p className={s.participants}>
          {[MOE, PERSONAS.recruiter, PERSONAS.staff, PERSONAS.security, YOU].map((p) => (
            <span key={p.login} title={p.login}>
              <Avatar person={p} size={26} />
            </span>
          ))}
        </p>
      </section>
      <button type="button" className={s.reset} onClick={resetAll}>
        Reset this pull request
      </button>
    </aside>
  );
}

/* ------------------------------------------------------------------ the tab */

export default function Conversation() {
  const pr = usePR();
  const dates = thread('dates');
  const gates = thread('gates');
  const classrooms = thread('classrooms');
  const fix = commitById('review-dates');
  // The latest check status sits just before the merge, so the visitor's commits and reviews come first.
  const cut = pr.events.findIndex((e) => e.kind === 'merge');
  const before = cut < 0 ? pr.events : pr.events.slice(0, cut);
  const after = cut < 0 ? [] : pr.events.slice(cut);

  return (
    <div className={s.convTab}>
      <div className={s.convMain}>
        <Description />
        <ol className={s.timeline}>
          <Pushed />
          <Event icon={<Icon.tag />}>
            <p className={s.labelEvent}>
              <b>moe</b> added the labels{' '}
              {LABELS.map((l) => (
                <LabelChip key={l.name} label={l} />
              ))}
            </p>
          </Event>
          <Event icon={<Icon.eye />}>
            <p>
              <b>moe</b> requested reviews from <b>{PERSONAS.staff.login}</b>,{' '}
              <b>{PERSONAS.recruiter.login}</b>, <b>{PERSONAS.security.login}</b> and <b>you</b>
            </p>
          </Event>
          <ReviewCard person={PERSONAS.recruiter} state="commented" body="One question on dates.">
            <ThreadView thread={dates} />
          </ReviewCard>
          <Event icon={<Icon.commit />}>
            <p>
              <b>moe</b> committed <span className={s.pushedSubject}>{fix.header}</span>{' '}
              <button
                type="button"
                className={s.shaBtn}
                onClick={() => reveal('commits', commitDom(fix.id))}
              >
                {fix.short}
              </button>
            </p>
          </Event>
          <ReviewCard
            person={PERSONAS.security}
            state="approved"
            body="Looked at the security job and the links. Approving that side."
          >
            <ThreadView thread={gates} />
          </ReviewCard>
          <ReviewCard
            person={PERSONAS.staff}
            state="commented"
            body={`Read every file. One suggestion on the devices table${isResolved(pr, classrooms) ? '' : ', still open'}.`}
          >
            <ThreadView thread={classrooms} />
          </ReviewCard>
          {before.map((e) => (
            <VisitorItem key={e.id} e={e} />
          ))}
          <ChecksEvent />
          {after.map((e) => (
            <VisitorItem key={e.id} e={e} />
          ))}
        </ol>

        {pr.merged ? <Merged /> : <MergeBox />}

        {!pr.merged && (
          <section
            className={s.addReview}
            id="review-form"
            tabIndex={-1}
            aria-label="Add your review"
          >
            <div className={s.tlAvatar}>
              <Avatar person={YOU} size={40} />
            </div>
            <div className={s.addReviewCard}>
              <ReviewForm />
            </div>
          </section>
        )}
      </div>
      <Sidebar />
    </div>
  );
}
