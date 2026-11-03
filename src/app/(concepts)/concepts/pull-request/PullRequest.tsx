'use client';

import { useEffect, useRef, useState } from 'react';
import { db, NOW, profile } from '../_shared/data';
import { useInView } from '../_shared/hooks';
import { PR, type Commit } from './model';
import { THREADS } from './changes';
import { JOBS } from './workflow';
import { TABS, allCommits, reveal, setTab, usePR, useTab, type Tab } from './store';
import Conversation from './Conversation';
import History, { commitDom } from './History';
import Checks, { useRun } from './Checks';
import Files, { DiffBlocks, diffsFor, totals } from './Files';
import { Avatar, Icon, StatusIcon, cx, type Vars } from './ui';
import { YOU } from './model';
import s from './pr.module.scss';
import { conceptTitle } from '../_shared/concepts';

/* ------------------------------------------------------------------ the mark */

function Mark() {
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden="true" className={s.mark}>
      <rect width={26} height={26} rx={7} />
      <path d="M8.5 7.5v11M8.5 10.5c0 3 2.2 4.5 5.5 4.5h1.5" />
      <circle cx={8.5} cy={7.5} r={2} />
      <circle cx={8.5} cy={18.5} r={2} />
      <circle cx={17.5} cy={15} r={2.3} className={s.markHead} />
    </svg>
  );
}

/* ------------------------------------------------------------------ the branch strip */

// The strip runs from just before he started building to just past the facts' date.
const SINCE = db.person.since;
const T0 = SINCE - 0.1;
const T1 = Math.ceil(NOW) + 0.1;
const SW = 1000;
// A year mark every four years, from the year after he started.
const YEAR_MARKS = Array.from(
  { length: Math.floor((NOW - SINCE - 1) / 4) + 1 },
  (_, i) => SINCE + 1 + i * 4,
);
const SX = (t: number) => 18 + ((t - T0) / (T1 - T0)) * (SW - 60);
const MAIN_Y = 46;
const BR_Y = 16;

function BranchStrip({ commits, merged }: { commits: Commit[]; merged: boolean }) {
  const [hover, setHover] = useState<Commit | null>(null);
  // Commits in the same year sit side by side.
  const xs: number[] = [];
  commits.forEach((c, i) => xs.push(Math.max(SX(c.t), i ? xs[i - 1] + 11 : 0)));
  const end = xs[xs.length - 1];
  const fork = SX(SINCE + 0.35);
  const mergeX = end + 36;
  return (
    <div className={s.strip} data-merged={merged || undefined}>
      <svg
        viewBox={`0 0 ${SW} 64`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        onPointerLeave={() => setHover(null)}
      >
        {YEAR_MARKS.map((y) => (
          <g key={y} className={s.stripYear}>
            <line x1={SX(y)} x2={SX(y)} y1={4} y2={58} />
            <text x={SX(y) + 4} y={62}>
              {y}
            </text>
          </g>
        ))}
        <path d={`M4 ${MAIN_Y} H${SW - 4}`} className={s.stripMain} />
        <path
          d={`M${fork - 22} ${MAIN_Y} C ${fork - 8} ${MAIN_Y} ${fork - 10} ${BR_Y} ${fork + 6} ${BR_Y} H${end}`}
          className={s.stripBranch}
          pathLength={1}
        />
        <path
          d={`M${end} ${BR_Y} C ${end + 18} ${BR_Y} ${mergeX - 14} ${MAIN_Y} ${mergeX} ${MAIN_Y}`}
          className={s.stripMerge}
          pathLength={1}
        />
        <text x={4} y={MAIN_Y + 16} className={s.stripLabel}>
          main
        </text>
        <text x={fork + 10} y={BR_Y - 9} className={cx(s.stripLabel, s.stripLabelBranch)}>
          moe/cto
        </text>
        <circle cx={fork - 22} cy={MAIN_Y} r={4} className={s.stripBase} />
        <circle cx={mergeX} cy={MAIN_Y} r={6.5} className={s.stripMergeNode} />
        {commits.map((c, i) => (
          <circle
            key={c.id}
            cx={xs[i]}
            cy={BR_Y}
            r={c.breaking ? 6 : 4.2}
            className={cx(s.stripDot, c.breaking && s.stripBreaking)}
            style={{ '--i': i } as Vars}
            onPointerEnter={() => setHover(c)}
            onClick={() => reveal('commits', commitDom(c.id))}
          />
        ))}
        {!merged && <circle cx={end} cy={BR_Y} r={9} className={s.stripHead} />}
      </svg>
      {hover && (
        <p
          className={s.stripTip}
          style={{ left: `${(xs[commits.indexOf(hover)] / SW) * 100}%` }}
          data-flip={xs[commits.indexOf(hover)] > SW * 0.7 || undefined}
        >
          <code>{hover.short}</code> {hover.date} · {hover.header}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ tabs */

const TAB_META: Record<Tab, { label: string; short: string; icon: React.ReactNode }> = {
  conversation: { label: 'Conversation', short: 'Thread', icon: <Icon.comment /> },
  commits: { label: 'Commits', short: 'Commits', icon: <Icon.commit /> },
  checks: { label: 'Checks', short: 'Checks', icon: <Icon.checks /> },
  files: { label: 'Files changed', short: 'Files', icon: <Icon.files /> },
};

function StatePill({ merged, small }: { merged: boolean; small?: boolean }) {
  return (
    <span className={cx(s.state, small && s.stateSmall)} data-state={merged ? 'merged' : 'open'}>
      {merged ? <Icon.merge /> : <Icon.pr />}
      {merged ? 'Merged' : 'Open'}
    </span>
  );
}

/** The live parts of the header. Each re-renders on its own while a run plays, not the page. */
function ChecksCount() {
  const { done, running } = useRun(true);
  return (
    <span className={s.tabCount} data-live={running || undefined}>
      {running ? `${done}/${JOBS.length}` : JOBS.length}
    </span>
  );
}

function MetaChecks() {
  const { done, running } = useRun(true);
  const ok = done === JOBS.length && !running;
  return (
    <span className={s.metaChecks}>
      <StatusIcon status={ok ? 'success' : 'running'} size={14} />
      {ok ? 'checks passed' : `checks running · ${done}/${JOBS.length}`}
    </span>
  );
}

/* ------------------------------------------------------------------ page */

export default function PullRequest() {
  const pr = usePR();
  const tab = useTab();
  const commits = allCommits(pr);
  const entries = diffsFor(pr.applied);
  const sum = totals(entries);
  const [headRef, headSeen] = useInView<HTMLElement>(false, 0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);
  const merged = Boolean(pr.merged);

  const conversationCount =
    THREADS.reduce((n, t) => n + t.comments.length, 0) +
    3 +
    pr.events.filter((e) => e.kind === 'review').length;
  const counts: Record<Tab, string> = {
    conversation: String(conversationCount),
    commits: String(commits.length),
    checks: String(JOBS.length),
    files: String(entries.length),
  };

  // The underline slides to the selected tab, and follows it when a count changes its width.
  useEffect(() => {
    const list = tabsRef.current;
    const ink = inkRef.current;
    if (!list || !ink) return;
    const place = () => {
      const el = list.querySelector<HTMLElement>(`[aria-selected="true"]`);
      if (!el) return;
      ink.style.transform = `translateX(${el.offsetLeft}px)`;
      ink.style.width = `${el.offsetWidth}px`;
      ink.style.opacity = '1';
    };
    place();
    const observer = new ResizeObserver(place);
    list.querySelectorAll('[role="tab"]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tab]);

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    const next =
      e.key === 'ArrowRight'
        ? TABS[(i + 1) % TABS.length]
        : e.key === 'ArrowLeft'
          ? TABS[(i + TABS.length - 1) % TABS.length]
          : e.key === 'Home'
            ? TABS[0]
            : e.key === 'End'
              ? TABS[TABS.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const go = (t: Tab) => {
    setTab(t);
    // The tab bar is sticky, so measure from the header above it.
    const head = document.getElementById('pr-head');
    const top = head ? head.offsetTop + head.offsetHeight : 0;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'instant' });
  };

  return (
    <div className={s.root} data-merged={merged || undefined}>
      <a href="#pr-tabs" className={s.skip}>
        Skip to the pull request
      </a>
      <header className={s.top}>
        <span className={s.brand}>
          <Mark />
          <span className={s.repo}>
            <span className={s.muted}>your-company /</span> <b>hiring</b>
          </span>
        </span>
        <span className={s.topNav}>
          <span className={s.topLink} aria-current="page">
            <Icon.pr /> Pull requests <span className={s.count}>1</span>
          </span>
        </span>
        <span className={s.barSpacer} />
        <a className={s.topLink} href={profile.cv} target="_blank" rel="noreferrer">
          CV
        </a>
        <a className={cx(s.btn, s.btnSmall, s.topCta)} href={`mailto:${profile.email}`}>
          <Icon.mail /> Contact
        </a>
        <span className={s.topYou} title="You are reviewing as “you”">
          <Avatar person={YOU} size={28} />
        </span>
      </header>

      <header className={s.prHead} ref={headRef} id="pr-head">
        <div className={s.prTitleRow}>
          <h1 className={s.title}>
            {PR.title} <span className={s.prNum}>#{PR.number}</span>
          </h1>
          <div className={s.headActions}>
            <button type="button" className={s.btn} onClick={() => go('files')}>
              <Icon.files /> Read the diff
            </button>
            <button
              type="button"
              className={cx(s.btn, s.btnPrimary)}
              onClick={() => reveal('conversation', merged ? 'pr-tabs' : 'review-form')}
            >
              {merged ? 'Merged' : 'Review'}
            </button>
          </div>
        </div>
        <div className={s.prMeta}>
          <StatePill merged={merged} />
          <p>
            {merged ? (
              <>
                <b>you</b> merged {commits.length} commits into{' '}
                <code className={s.ref}>{PR.baseRef}</code> from{' '}
                <code className={s.ref}>{PR.headRef}</code>
              </>
            ) : (
              <>
                <b>moe</b> wants to merge {commits.length} commits into{' '}
                <code className={s.ref}>{PR.baseRef}</code> from{' '}
                <code className={s.ref}>{PR.headRef}</code>
              </>
            )}
          </p>
          <MetaChecks />
        </div>
        <BranchStrip commits={commits} merged={merged} />
      </header>

      <div className={s.tabsBar} id="pr-tabs" tabIndex={-1}>
        <div className={s.tabsInner}>
          <div className={s.mini} data-show={!headSeen || undefined} aria-hidden={headSeen}>
            <StatePill merged={merged} small />
            <b>{PR.title}</b>
            <span className={s.muted}>#{PR.number}</span>
          </div>
          <div
            className={s.tabs}
            role="tablist"
            aria-label="Pull request"
            ref={tabsRef}
            onKeyDown={onTabKey}
          >
            {TABS.map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                className={s.tab}
                onClick={() => go(t)}
              >
                {TAB_META[t].icon}
                <span className={s.tabLong}>{TAB_META[t].label}</span>
                <span className={s.tabShort}>{TAB_META[t].short}</span>
                {t === 'checks' ? <ChecksCount /> : <span className={s.tabCount}>{counts[t]}</span>}
              </button>
            ))}
            <span className={s.tabInk} ref={inkRef} aria-hidden="true" />
          </div>
          <span
            className={s.tabsStat}
            title={`${sum.additions} additions and ${sum.deletions} deletions`}
          >
            <span className={s.addN}>+{sum.additions}</span>
            <span className={s.delN}>−{sum.deletions}</span>
            <DiffBlocks additions={sum.additions} deletions={sum.deletions} />
          </span>
        </div>
      </div>

      <main className={s.main}>
        {TABS.map((t) => (
          <div
            key={t}
            id={`panel-${t}`}
            role="tabpanel"
            aria-labelledby={`tab-${t}`}
            hidden={tab !== t}
            className={s.panel}
          >
            {t === 'conversation' && <Conversation />}
            {t === 'commits' && <History />}
            {t === 'checks' && <Checks active={tab === 'checks'} />}
            {t === 'files' && <Files />}
          </div>
        ))}
      </main>

      <footer className={s.foot}>
        <p>
          <b>{conceptTitle('pull-request')}</b>, a concept for {profile.name}’s site. The reviewers
          are fictional personas, CI timings are simulated, and every fact comes from his CV and
          project write-ups.
        </p>
      </footer>
    </div>
  );
}
