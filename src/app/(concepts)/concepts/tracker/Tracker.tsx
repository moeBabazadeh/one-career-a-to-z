'use client';

// Concept T · Tracker. Moe's work in an issue tracker: roles as cycles, products as projects and
// every issue a real piece of work from db, on a board with drag and drop, a grouped list, a
// roadmap over the real years, a command bar and the keyboard a tracker has.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductId } from '@/content/db';
import { db, profile } from '../_shared/data';
import { concept } from '../_shared/concepts';
import { writeScheme, readScheme } from '../_shared/scheme';
import { CONTACT, PROJECTS, STATUSES, TEAMS, WORKSPACE, isClosed, type TeamId } from './model';
import {
  ISSUE_VIEWS,
  VIEW_NAME,
  clearFilters,
  clearSelection,
  closePeek,
  closePicker,
  editCount,
  get,
  issuesOf,
  moveIssue,
  onlyFilter,
  openCreate,
  openIssue,
  openPicker,
  openProject,
  resetAll,
  selectAll,
  setChord,
  setDrawer,
  setFilter,
  setFocus,
  setHelp,
  setQuery,
  setReading,
  setView,
  toggleSelect,
  undo,
  useTracker,
  visibleOf,
  type State,
  type ViewId,
} from './store';
import Board, { columnsOf } from './Board';
import IssueList, { listOrder } from './ListView';
import Roadmap from './Roadmap';
import { IssuePeek, ProjectPeek } from './Peek';
import { PickerHost, filterSummary } from './Picker';
import { CyclesView, MyIssues, ProfileView, ProjectsView, myIssuesList } from './Pages';
import { BulkBar, ChordHint, CreateModal, DisplayMenu, Help, Toast } from './Modals';
import ReadPage from './ReadPage';
import { Avatar, Icon, LINK_ICON, ProjectMark, TeamMark, cx, type IconName } from './kit';
import s from './tracker.module.scss';

const VIEW_ICON: Record<ViewId, IconName> = {
  board: 'board',
  list: 'list',
  roadmap: 'roadmap',
  my: 'my',
  projects: 'projects',
  cycles: 'cycles',
  profile: 'profile',
};
const CHORD: Record<string, ViewId> = {
  b: 'board',
  l: 'list',
  r: 'roadmap',
  m: 'my',
  p: 'projects',
  c: 'cycles',
};

/** The issues J and K walk, in the order the current view shows them. */
function navOrder(st: State): string[] {
  if (st.view === 'board') return columnsOf(st).flatMap((c) => c.issues.map((i) => i.id));
  if (st.view === 'list') return listOrder(st, visibleOf(st));
  if (st.view === 'my') return listOrder(st, myIssuesList(st));
  return [];
}

/* ------------------------------------------------------------------ sidebar */

function NavItem({
  icon,
  label,
  active,
  onClick,
  count,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className={s.navItem}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
      >
        {icon}
        <span className={s.navLabel}>{label}</span>
        {children}
        {count !== undefined && <span className={s.navCount}>{count}</span>}
      </button>
    </li>
  );
}

function Sidebar({ state }: { state: State }) {
  const all = issuesOf(state);
  const open = all.filter((i) => i.assignee === 'moe' && !isClosed(i.status)).length;
  const teamFilter = state.filters.find((f) => f.field === 'team')?.values;
  const edits = editCount(state);
  const goTeam = (id: TeamId) => {
    onlyFilter('team', id);
    if (!ISSUE_VIEWS.includes(get().view) || get().view === 'my') setView('list');
    setDrawer(false);
  };

  return (
    <nav className={s.sidebar} aria-label="Workspace">
      <div className={s.wsRow}>
        <button
          type="button"
          className={s.wsBtn}
          onClick={() => setView('profile')}
          title={`${profile.name}, ${profile.role}`}
        >
          <Avatar who="moe" size={22} />
          <b>{WORKSPACE}</b>
          <Icon name="chevronDown" size={12} />
        </button>
        <span className={s.grow} />
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => openPicker({ kind: 'command' })}
          aria-label="Search and commands"
          title="Search (⌘K)"
        >
          <Icon name="search" size={15} />
        </button>
        <button
          type="button"
          className={cx(s.iconBtn, s.compose)}
          onClick={() => openCreate()}
          aria-label="Create issue"
          title="Create issue (C)"
        >
          <Icon name="compose" size={15} />
        </button>
      </div>

      <div className={s.sideScroll}>
        <ul className={s.navList}>
          <NavItem
            icon={<Icon name="my" size={16} />}
            label="My issues"
            active={state.view === 'my'}
            onClick={() => setView('my')}
            count={open}
          />
          <NavItem
            icon={<Icon name="book" size={16} />}
            label="Read as a page"
            onClick={() => setReading(true)}
          />
        </ul>

        <p className={s.navHead}>Workspace</p>
        <ul className={s.navList}>
          {(['board', 'list', 'roadmap', 'projects', 'cycles'] as ViewId[]).map((v) => (
            <NavItem
              key={v}
              icon={<Icon name={VIEW_ICON[v]} size={16} />}
              label={VIEW_NAME[v]}
              active={state.view === v}
              onClick={() => setView(v)}
            />
          ))}
        </ul>

        <p className={s.navHead}>Favorites</p>
        <ul className={s.navList}>
          {PROJECTS.filter((p) => p.featured).map((p) => (
            <NavItem
              key={p.id}
              icon={<ProjectMark id={p.id} size={15} />}
              label={p.name}
              active={state.peek?.kind === 'project' && state.peek.id === p.id}
              onClick={() => openProject(p.id as ProductId)}
            />
          ))}
        </ul>

        <p className={s.navHead}>Teams</p>
        <ul className={s.navList}>
          {TEAMS.map((t) => (
            <NavItem
              key={t.id}
              icon={<TeamMark id={t.id} size={16} />}
              label={t.name}
              active={teamFilter?.length === 1 && teamFilter[0] === t.id}
              onClick={() => goTeam(t.id)}
              count={all.filter((i) => i.team === t.id).length}
            />
          ))}
        </ul>

        <p className={s.navHead}>Contact</p>
        <ul className={s.navList}>
          {CONTACT.map((l) => (
            <li key={l.url}>
              <a
                className={s.navItem}
                href={l.url}
                target={l.kind === 'mail' ? undefined : '_blank'}
                rel="noreferrer"
              >
                <Icon name={LINK_ICON[l.kind]} size={16} />
                <span className={s.navLabel}>{l.kind === 'mail' ? 'Email' : l.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className={s.sideFoot}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => writeScheme(readScheme() === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle light and dark"
          title="Toggle theme"
        >
          <Icon name="moon" size={15} className={s.moon} />
          <Icon name="sun" size={15} className={s.sun} />
        </button>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => setHelp(true)}
          aria-label="Keyboard shortcuts"
          title="Shortcuts (?)"
        >
          <Icon name="help" size={15} />
        </button>
        <span className={s.grow} />
        <button
          type="button"
          className={s.resetBtn}
          onClick={resetAll}
          disabled={!edits}
          title="Drop every change made on this device"
        >
          <Icon name="reset" size={13} /> Reset{edits ? ` · ${edits}` : ''}
        </button>
      </div>

      <button type="button" className={s.member} onClick={() => setView('profile')}>
        <Avatar who="moe" size={28} />
        <span>
          <b>{profile.name}</b>
          <small>
            {profile.role} · {profile.company}
          </small>
        </span>
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ header and filters */

function Header({ state }: { state: State }) {
  const [display, setDisplay] = useState(false);
  const issueView = ISSUE_VIEWS.includes(state.view);
  const visible = visibleOf(state);
  const close = useCallback(() => setDisplay(false), []);
  const active = state.filters.reduce((n, f) => n + f.values.length, 0) + (state.query ? 1 : 0);

  return (
    <header className={s.header}>
      <button
        type="button"
        className={cx(s.iconBtn, s.phoneOnly)}
        onClick={() => setDrawer(true)}
        aria-label="Open the menu"
      >
        <Avatar who="moe" size={24} />
      </button>
      <h1 className={s.viewTitle}>
        <Icon name={VIEW_ICON[state.view]} size={16} />
        <span>{VIEW_NAME[state.view]}</span>
        {(state.view === 'board' || state.view === 'list') && (
          <span className={s.count}>{visible.length}</span>
        )}
      </h1>
      {(state.view === 'board' || state.view === 'list') && (
        <div className={cx(s.segmented, s.desktopOnly)} role="group" aria-label="Layout">
          <button
            type="button"
            aria-pressed={state.view === 'list'}
            onClick={() => setView('list')}
            title="List (G L)"
          >
            <Icon name="list" size={14} />
          </button>
          <button
            type="button"
            aria-pressed={state.view === 'board'}
            onClick={() => setView('board')}
            title="Board (G B)"
          >
            <Icon name="board" size={14} />
          </button>
        </div>
      )}
      <span className={s.grow} />
      {issueView && (
        <>
          <button
            type="button"
            className={s.btn}
            onClick={() => openPicker({ kind: 'filter' })}
            title="Filter (/)"
            data-active={active || undefined}
          >
            <Icon name="filter" size={14} />
            <span className={s.btnText}>Filter</span>
            {active > 0 && <span className={s.badge}>{active}</span>}
          </button>
          <div className={s.menuAnchor}>
            <button
              type="button"
              className={s.btn}
              onClick={() => setDisplay((d) => !d)}
              aria-expanded={display}
              data-display-toggle
            >
              <Icon name="display" size={14} />
              <span className={s.btnText}>Display</span>
            </button>
            {display && <DisplayMenu state={state} onClose={close} />}
          </div>
        </>
      )}
      <button
        type="button"
        className={cx(s.iconBtn, s.phoneOnly)}
        onClick={() => openPicker({ kind: 'command' })}
        aria-label="Search and commands"
      >
        <Icon name="search" size={16} />
      </button>
      <button
        type="button"
        className={cx(s.iconBtn, s.phoneOnly, s.compose)}
        onClick={() => openCreate()}
        aria-label="Create issue"
      >
        <Icon name="compose" size={16} />
      </button>
    </header>
  );
}

function FilterBar({ state }: { state: State }) {
  if (!state.filters.length && !state.query) return null;
  return (
    <div className={s.filterBar} role="group" aria-label="Filters">
      {state.filters.map((f) => (
        <span key={f.field} className={s.filterChip}>
          <button type="button" onClick={() => openPicker({ kind: 'filter', field: f.field })}>
            <span className={s.muted}>
              {f.field === 'label' ? 'Label' : f.field.charAt(0).toUpperCase() + f.field.slice(1)}
            </span>
            <span className={s.muted}>{f.values.length > 1 ? 'is any of' : 'is'}</span>
            <b>{filterSummary(f.field, f.values)}</b>
          </button>
          <button
            type="button"
            className={s.chipX}
            onClick={() => setFilter(f.field, [])}
            aria-label={`Remove the ${f.field} filter`}
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      {state.query && (
        <span className={s.filterChip}>
          <button type="button" onClick={() => openPicker({ kind: 'filter' })}>
            <span className={s.muted}>Title contains</span>
            <b>“{state.query}”</b>
          </button>
          <button
            type="button"
            className={s.chipX}
            onClick={() => setQuery('')}
            aria-label="Remove the text filter"
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      )}
      <button type="button" className={s.textBtn} onClick={clearFilters}>
        Clear
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ phone */

const PHONE_NAV: { view: ViewId; label: string }[] = [
  { view: 'list', label: 'Issues' },
  { view: 'board', label: 'Board' },
  { view: 'roadmap', label: 'Roadmap' },
  { view: 'my', label: 'My issues' },
];

function PhoneNav({ state }: { state: State }) {
  return (
    <nav className={s.phoneNav} aria-label="Views">
      {PHONE_NAV.map((n) => (
        <button
          key={n.view}
          type="button"
          aria-current={state.view === n.view && !state.peek ? 'page' : undefined}
          onClick={() => {
            closePeek();
            setView(n.view);
          }}
        >
          <Icon name={VIEW_ICON[n.view]} size={18} />
          <span>{n.label}</span>
        </button>
      ))}
      <button type="button" onClick={() => setDrawer(true)} aria-expanded={state.drawer}>
        <Icon name="menu" size={18} />
        <span>More</span>
      </button>
    </nav>
  );
}

function Skeleton() {
  return (
    <div className={s.skeleton} aria-hidden="true">
      {STATUSES.map((st, i) => (
        <div key={st.id} className={s.skeletonCol}>
          <i style={{ width: `${40 + ((i * 17) % 30)}%` }} />
          {Array.from({ length: 4 - (i % 3) }, (_, j) => (
            <b key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the app */

export default function Tracker() {
  const state = useTracker();
  const chordTimer = useRef(0);
  const order = navOrder(state);
  const teamFilter = state.filters.find((f) => f.field === 'team' && f.values.length === 1)
    ?.values[0] as TeamId | undefined;

  // The keyboard, wired once; it reads the store at the moment of the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = get();
      const target = e.target as HTMLElement;
      const typing = Boolean(target.closest?.('input, textarea, select, [contenteditable="true"]'));
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (mod && key === 'k') {
        e.preventDefault();
        if (st.picker?.kind === 'command') closePicker();
        else openPicker({ kind: 'command' });
        return;
      }
      if (st.picker || st.create) return;
      if (st.help) {
        if (key === 'Escape' || key === '?') setHelp(false);
        return;
      }
      if (st.reading) {
        if (key === 'Escape') setReading(false);
        return;
      }
      if (typing) return;

      const nav = navOrder(st);
      const issueView = ISSUE_VIEWS.includes(st.view);
      const targets = st.selected.length
        ? st.selected
        : st.peek?.kind === 'issue'
          ? [st.peek.id]
          : st.focus
            ? [st.focus]
            : [];

      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && key === 'a' && issueView) {
        e.preventDefault();
        selectAll(nav);
        return;
      }
      if (mod || e.altKey) return;

      if (st.chord) {
        window.clearTimeout(chordTimer.current);
        setChord(false);
        const v = CHORD[key];
        if (v) {
          e.preventDefault();
          setView(v);
        }
        return;
      }

      const step = (d: number) => {
        if (!nav.length) return;
        const at = st.focus ? nav.indexOf(st.focus) : -1;
        const next =
          nav[
            at < 0 ? (d > 0 ? 0 : nav.length - 1) : Math.max(0, Math.min(nav.length - 1, at + d))
          ];
        if (st.peek?.kind === 'issue') openIssue(next);
        else setFocus(next);
      };

      // On the board, left and right jump to the same place in the next column.
      const sideways = (d: number) => {
        const cols = columnsOf(st).filter((c) => c.issues.length);
        const ci = cols.findIndex((c) => c.issues.some((i) => i.id === st.focus));
        if (ci < 0) return step(1);
        const row = cols[ci].issues.findIndex((i) => i.id === st.focus);
        const col = cols[ci + d];
        if (col) setFocus(col.issues[Math.min(row, col.issues.length - 1)].id);
      };

      const onIssue = target === document.body || Boolean(target.closest?.('[data-issue]'));

      switch (key) {
        case 'g':
          e.preventDefault();
          setChord(true);
          chordTimer.current = window.setTimeout(() => setChord(false), 1400);
          return;
        case 'c':
          e.preventDefault();
          openCreate();
          return;
        case '?':
          e.preventDefault();
          setHelp(true);
          return;
        case '/':
          if (!issueView) return;
          e.preventDefault();
          openPicker({ kind: 'filter' });
          return;
        case 'j':
        case 'ArrowDown':
          if (!issueView) return;
          e.preventDefault();
          step(1);
          return;
        case 'k':
        case 'ArrowUp':
          if (!issueView) return;
          e.preventDefault();
          step(-1);
          return;
        case 'ArrowLeft':
        case 'ArrowRight':
          if (st.view !== 'board') return;
          e.preventDefault();
          if (e.shiftKey && st.focus) {
            const issue = issuesOf(st).find((i) => i.id === st.focus);
            const at = STATUSES.findIndex((x) => x.id === issue?.status);
            const to = STATUSES[at + (key === 'ArrowLeft' ? -1 : 1)];
            if (issue && to) moveIssue(issue.id, to.id, issue.sort);
          } else sideways(key === 'ArrowLeft' ? -1 : 1);
          return;
        case 'x':
          if (!st.focus) return;
          e.preventDefault();
          toggleSelect(st.focus);
          return;
        case 's':
        case 'p':
        case 'l':
        case 'm':
          if (!targets.length) return;
          e.preventDefault();
          openPicker({
            kind:
              key === 's'
                ? 'status'
                : key === 'p'
                  ? 'priority'
                  : key === 'l'
                    ? 'labels'
                    : 'project',
            targets,
          });
          return;
        case 'Enter':
        case 'o':
          if (!st.focus || (key === 'Enter' && !onIssue)) return;
          e.preventDefault();
          openIssue(st.focus);
          return;
        case ' ':
          if (!st.focus || !onIssue) return;
          e.preventDefault();
          if (st.peek?.id === st.focus) closePeek();
          else openIssue(st.focus);
          return;
        case 'Escape':
          if (st.drawer) setDrawer(false);
          else if (st.peek) closePeek();
          else if (st.selected.length) clearSelection();
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const c = concept('tracker');
  const peekOpen = Boolean(state.peek);

  let view: React.ReactNode = null;
  if (!state.ready) view = <Skeleton />;
  else if (state.view === 'board') view = <Board state={state} />;
  else if (state.view === 'list') view = <IssueList state={state} issues={visibleOf(state)} />;
  else if (state.view === 'roadmap') view = <Roadmap />;
  else if (state.view === 'my') view = <MyIssues state={state} />;
  else if (state.view === 'projects') view = <ProjectsView state={state} />;
  else if (state.view === 'cycles') view = <CyclesView state={state} />;
  else if (state.view === 'profile') view = <ProfileView state={state} />;

  return (
    <div
      className={s.root}
      data-peek={peekOpen || undefined}
      data-view={state.view}
      data-drawer={state.drawer || undefined}
    >
      <a href="#tracker-main" className={s.skip}>
        Skip to the issues
      </a>
      <div className={s.sideWrap}>
        <Sidebar state={state} />
      </div>
      {state.drawer && (
        <div className={s.drawerScrim} onClick={() => setDrawer(false)} aria-hidden="true" />
      )}

      <main className={s.main} id="tracker-main" tabIndex={-1}>
        <Header state={state} />
        {ISSUE_VIEWS.includes(state.view) && <FilterBar state={state} />}
        <div className={s.viewArea}>
          <div className={s.view}>{view}</div>
          {state.ready && state.peek?.kind === 'issue' && (
            <IssuePeek state={state} id={state.peek.id} order={order} />
          )}
          {state.ready && state.peek?.kind === 'project' && (
            <ProjectPeek state={state} id={state.peek.id as ProductId} />
          )}
        </div>
      </main>

      <PhoneNav state={state} />
      {state.ready && <BulkBar state={state} order={order} />}
      {state.picker && <PickerHost picker={state.picker} state={state} />}
      {state.create && <CreateModal preset={state.create} filteredTeam={teamFilter} />}
      {state.help && <Help />}
      {state.reading && <ReadPage />}
      {state.toast && <Toast toast={state.toast} />}
      {state.chord && <ChordHint />}
      <p className={s.credit}>
        {c.letter} · {c.name}. Every issue is real work from {db.person.first}’s CV; your edits stay
        in this browser.
      </p>
    </div>
  );
}
