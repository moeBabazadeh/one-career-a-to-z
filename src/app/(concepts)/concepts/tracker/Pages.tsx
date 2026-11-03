'use client';

// The views that aren't the board or the list: projects, cycles, the member profile, and
// My issues with its activity feed.

import Image from 'next/image';
import type { ReactNode } from 'react';
import { db, fmt, profile, skills, stats } from '../_shared/data';
import {
  CONTACT,
  CYCLES,
  ISSUES,
  PROJECTS,
  PROJECT_STATUS,
  STATUSES,
  activityOf,
  isClosed,
  type Activity,
  type Issue,
  type Project,
} from './model';
import {
  closedShare,
  issuesOf,
  matches,
  onlyFilter,
  openIssue,
  openProject,
  setMyTab,
  setView,
  type MyTab,
  type State,
} from './store';
import IssueList from './ListView';
import {
  Avatar,
  Icon,
  LINK_ICON,
  ProjectMark,
  ProjectStatusIcon,
  Ring,
  StatusIcon,
  cx,
} from './kit';
import s from './tracker.module.scss';

/* ------------------------------------------------------------------ projects */

function ProjectRow({ p, issues }: { p: Project; issues: Issue[] }) {
  const mine = issues.filter((i) => i.project === p.id);
  const share = closedShare(mine);
  return (
    <li className={s.pRow}>
      <button type="button" onClick={() => openProject(p.id)} className={s.pRowBtn}>
        <span className={s.pName}>
          <ProjectMark id={p.id} size={16} />
          <b>{p.name}</b>
          {p.featured && <Icon name="star" size={12} className={s.star} />}
        </span>
        <span className={s.pStatusCell}>
          <ProjectStatusIcon status={p.status} /> {PROJECT_STATUS[p.status]}
        </span>
        <span className={s.pLead}>
          <Avatar who="moe" size={18} />
        </span>
        <span className={s.pDate}>{p.start ? fmt.mon(p.start) : '—'}</span>
        <span className={cx(s.pDate, s.muted)}>—</span>
        <span className={s.pProgress}>
          <Ring share={share} size={14} /> {Math.round(share * 100)}%
        </span>
        <span className={s.pCount}>{mine.length}</span>
      </button>
    </li>
  );
}

export function ProjectsView({ state }: { state: State }) {
  const issues = issuesOf(state);
  const featured = PROJECTS.filter((p) => p.featured);
  const rest = PROJECTS.filter((p) => !p.featured);
  const table = (title: string, list: Project[]) => (
    <section className={s.pSection}>
      <h3 className={s.pSectionHead}>
        {title} <span className={s.count}>{list.length}</span>
      </h3>
      <ul className={s.pTable}>
        {list.map((p) => (
          <ProjectRow key={p.id} p={p} issues={issues} />
        ))}
      </ul>
    </section>
  );
  return (
    <div className={s.pageScroll}>
      <div className={s.pHeadRow} aria-hidden="true">
        <span>Name</span>
        <span>Status</span>
        <span>Lead</span>
        <span>Start</span>
        <span>Target</span>
        <span>Progress</span>
        <span>Issues</span>
      </div>
      {table('Featured', featured)}
      {table('All other projects', rest)}
    </div>
  );
}

/* ------------------------------------------------------------------ cycles */

export function CyclesView({ state }: { state: State }) {
  const issues = issuesOf(state);
  return (
    <div className={s.pageScroll}>
      <ol className={s.cycles}>
        {[...CYCLES].reverse().map((c) => {
          const mine = issues.filter((i) => i.cycle === c.id);
          const share = closedShare(mine);
          return (
            <li key={c.id} className={s.cycleCard} data-current={c.current || undefined}>
              <div className={s.cycleTop}>
                <span className={s.cycleNum}>Cycle {c.n}</span>
                {c.current && <span className={s.currentBadge}>Current</span>}
                {c.role.contract && <span className={s.muted}>Contract</span>}
                <span className={s.grow} />
                <span className={s.cycleRange}>
                  <Icon name="calendar" size={13} /> {c.range}
                </span>
              </div>
              <h3 className={s.cycleOrg}>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.role.org}
                  </a>
                ) : (
                  c.role.org
                )}
              </h3>
              <p className={s.cycleTitle}>{c.title}</p>
              <p className={s.cycleSummary}>{c.summary}</p>
              <ul className={s.duties}>
                {c.role.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <div className={s.cycleFoot}>
                <span className={s.cycleScope}>
                  <Ring share={share} size={14} /> {mine.length}{' '}
                  {mine.length === 1 ? 'issue' : 'issues'} · {Math.round(share * 100)}% closed
                </span>
                <span className={s.progressBar} aria-hidden="true">
                  {STATUSES.map((st) => {
                    const n = mine.filter((i) => i.status === st.id).length;
                    return n ? <i key={st.id} data-status={st.id} style={{ flex: n }} /> : null;
                  })}
                </span>
                <button
                  type="button"
                  className={s.btn}
                  onClick={() => {
                    onlyFilter('cycle', c.id);
                    setView('list');
                  }}
                  disabled={!mine.length}
                >
                  View issues <Icon name="chevron" size={12} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ profile */

export function ProfileView({ state }: { state: State }) {
  const issues = issuesOf(state).filter((i) => i.assignee === 'moe');
  const open = issues.filter((i) => !isClosed(i.status)).length;
  return (
    <div className={s.pageScroll}>
      <article className={s.profile}>
        <header className={s.profileHead}>
          <div className={s.profilePhoto}>
            <Image src={db.person.photo} width={600} height={600} alt={profile.name} sizes="96px" />
          </div>
          <div>
            <h2>{profile.name}</h2>
            <p className={s.profileRole}>
              {profile.role} ·{' '}
              <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                {profile.company}
              </a>
            </p>
            <p className={s.muted}>{profile.headline}</p>
          </div>
        </header>
        <p className={s.tagline}>{profile.tagline}</p>
        <div className={s.profileStats}>
          <button
            type="button"
            onClick={() => {
              setMyTab('assigned');
              setView('my');
            }}
          >
            <b>{open}</b> open
          </button>
          <button
            type="button"
            onClick={() => {
              setMyTab('completed');
              setView('my');
            }}
          >
            <b>{issues.length - open}</b> closed
          </button>
          <button type="button" onClick={() => setView('projects')}>
            <b>{PROJECTS.length}</b> projects
          </button>
          <button type="button" onClick={() => setView('cycles')}>
            <b>{CYCLES.length}</b> cycles
          </button>
        </div>
        <section className={s.peekSection}>
          <h3>About</h3>
          <div className={s.desc}>
            {db.about.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
        <section className={s.peekSection}>
          <h3>By the numbers</h3>
          <dl className={s.numbers}>
            {stats.map((st) => (
              <div key={st.label}>
                <dt>{st.label}</dt>
                <dd>{st.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={s.peekSection}>
          <h3>Skills</h3>
          <div className={s.stack}>
            {skills.map((k) => (
              <span key={k}>{k}</span>
            ))}
          </div>
        </section>
        <section className={s.peekSection}>
          <h3>Contact</h3>
          <div className={s.links}>
            {CONTACT.map((l) => (
              <a
                key={l.url}
                className={s.linkRow}
                href={l.url}
                target={l.kind === 'mail' ? undefined : '_blank'}
                rel="noreferrer"
              >
                <span className={s.linkIcon} data-kind={l.kind}>
                  <Icon name={LINK_ICON[l.kind]} size={15} />
                </span>
                <span className={s.linkText}>
                  <b>{l.label}</b>
                  <small>{l.meta}</small>
                </span>
              </a>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}

/* ------------------------------------------------------------------ my issues */

const TABS: { id: MyTab; name: string }[] = [
  { id: 'assigned', name: 'Assigned' },
  { id: 'completed', name: 'Completed' },
  { id: 'activity', name: 'Activity' },
  { id: 'created', name: 'Created by you' },
];

interface FeedItem {
  key: string;
  at: number;
  year: string;
  issue: Issue;
  a: Activity;
}

/** Moe's dated activity across every issue, newest first: when work started and when it closed. */
const FEED: FeedItem[] = ISSUES.flatMap((i) =>
  activityOf(i)
    .filter(
      (a) => a.when && (a.kind === 'create' || (a.kind === 'status' && a.to && isClosed(a.to))),
    )
    .map((a) => ({
      key: `${i.id}-${a.key}`,
      at: fmt.frac(a.when!),
      year: String(a.when!.y),
      issue: i,
      a,
    })),
).sort((x, y) => y.at - x.at || (x.a.kind === 'status' ? -1 : 1));

function FeedLine({
  issue,
  who,
  text,
  when,
  icon,
}: {
  issue: Issue;
  who: 'moe' | 'you';
  text: string;
  when: string;
  icon?: ReactNode;
}) {
  return (
    <li className={s.feedItem}>
      <span className={s.eventIcon}>{icon ?? <Avatar who={who} size={16} />}</span>
      <div className={s.feedBody}>
        <button type="button" className={s.feedIssue} onClick={() => openIssue(issue.id)}>
          <span className={s.issueId}>{issue.id}</span> {issue.title}
        </button>
        <p>
          <b>{who === 'moe' ? db.person.first : 'You'}</b> {text}
        </p>
      </div>
      <span className={s.eventWhen}>{when}</span>
    </li>
  );
}

function Feed({ state }: { state: State }) {
  const all = issuesOf(state);
  const local = [...state.log].reverse();
  const years: { year: string; items: FeedItem[] }[] = [];
  for (const f of FEED) {
    const last = years[years.length - 1];
    if (last?.year === f.year) last.items.push(f);
    else years.push({ year: f.year, items: [f] });
  }
  return (
    <div className={s.pageScroll}>
      <div className={s.feed}>
        {local.length > 0 && (
          <section>
            <h3 className={s.feedYear}>On this device</h3>
            <ol>
              {local.map((e) => {
                const issue = all.find((i) => i.id === e.issue);
                if (!issue) return null;
                return (
                  <FeedLine
                    key={`l${e.id}`}
                    issue={issue}
                    who="you"
                    text={e.kind === 'comment' ? `commented: “${e.text}”` : e.text}
                    when={e.stamp}
                    icon={
                      e.kind === 'status' && e.to ? (
                        <StatusIcon status={e.to} size={13} />
                      ) : undefined
                    }
                  />
                );
              })}
            </ol>
          </section>
        )}
        {years.map((y) => (
          <section key={y.year}>
            <h3 className={s.feedYear}>{y.year}</h3>
            <ol>
              {y.items.map((f) => (
                <FeedLine
                  key={f.key}
                  issue={all.find((i) => i.id === f.issue.id) ?? f.issue}
                  who="moe"
                  text={f.a.kind === 'create' ? 'started it' : f.a.text}
                  when={fmt.mon(f.a.when!)}
                  icon={
                    f.a.kind === 'status' && f.a.to ? (
                      <StatusIcon status={f.a.to} size={13} />
                    ) : undefined
                  }
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

export function MyIssues({ state }: { state: State }) {
  const all = issuesOf(state).filter((i) => matches(i, state.filters, state.query));
  const assigned = all.filter((i) => i.assignee === 'moe' && !isClosed(i.status));
  const completed = all.filter((i) => i.assignee === 'moe' && isClosed(i.status));
  const created = all.filter((i) => i.creator === 'you');
  const counts: Record<MyTab, number | null> = {
    assigned: assigned.length,
    completed: completed.length,
    activity: null,
    created: created.length,
  };
  const tabs = TABS.filter((t) => t.id !== 'created' || state.created.length);
  const tab = tabs.some((t) => t.id === state.myTab) ? state.myTab : 'assigned';

  return (
    <div className={s.my}>
      <div className={s.tabs} role="tablist" aria-label="My issues">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={s.tab}
            onClick={() => setMyTab(t.id)}
          >
            {t.name}
            {counts[t.id] !== null && <span className={s.count}>{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      <div className={s.myBody} role="tabpanel">
        {tab === 'assigned' && (
          <IssueList
            state={state}
            issues={assigned}
            empty="Nothing open. Everything assigned is done or shipped."
          />
        )}
        {tab === 'completed' && <IssueList state={state} issues={completed} />}
        {tab === 'created' && (
          <IssueList
            state={state}
            issues={created}
            empty="Issues you create with C show up here."
          />
        )}
        {tab === 'activity' && <Feed state={state} />}
      </div>
    </div>
  );
}

/** The issues a view walks with J and K, in the order it shows them. */
export function myIssuesList(state: State): Issue[] {
  const all = issuesOf(state).filter((i) => matches(i, state.filters, state.query));
  if (state.myTab === 'completed')
    return all.filter((i) => i.assignee === 'moe' && isClosed(i.status));
  if (state.myTab === 'created') return all.filter((i) => i.creator === 'you');
  if (state.myTab === 'activity') return [];
  return all.filter((i) => i.assignee === 'moe' && !isClosed(i.status));
}
