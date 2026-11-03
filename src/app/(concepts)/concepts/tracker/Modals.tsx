'use client';

// The overlays: new issue, the shortcut sheet, the display options, the bulk bar for a
// selection, the toast with Undo, and the hint while a G chord waits for its second key.

import { useEffect, useRef, useState } from 'react';
import type { ProductId } from '@/content/db';
import {
  LABELS,
  PRIORITIES,
  PROJECTS,
  STATUSES,
  TEAMS,
  label,
  type LabelId,
  type Priority,
  type StatusId,
  type TeamId,
} from './model';
import {
  GROUPINGS,
  ORDERINGS,
  PROPS,
  clearSelection,
  closeCreate,
  createIssue,
  dismissToast,
  openIssue,
  openPicker,
  resetDisplay,
  selectAll,
  setDisplay,
  setHelp,
  setView,
  toggleProp,
  undo,
  type State,
} from './store';
import { Icon, Keys, LabelChip, PriorityIcon, ProjectMark, StatusIcon, TeamMark, cx } from './kit';
import s from './tracker.module.scss';

/* ------------------------------------------------------------------ new issue */

export function CreateModal({
  preset,
  filteredTeam,
}: {
  preset: NonNullable<State['create']>;
  filteredTeam?: TeamId;
}) {
  const [teamId, setTeam] = useState<TeamId>(preset.team ?? filteredTeam ?? 'moe');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<StatusId>(preset.status ?? 'todo');
  const [priority, setPriority] = useState<Priority>(0);
  const [labels, setLabels] = useState<LabelId[]>([]);
  const [pid, setPid] = useState<ProductId | ''>('');
  const [more, setMore] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!title.trim()) {
      titleRef.current?.focus();
      return;
    }
    const id = createIssue({
      team: teamId,
      title,
      description,
      status,
      priority,
      labels,
      project: pid || null,
    });
    if (more) {
      setTitle('');
      setDescription('');
      titleRef.current?.focus();
    } else {
      closeCreate();
      openIssue(id);
    }
  };

  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && closeCreate()}>
      <form
        className={s.createModal}
        role="dialog"
        aria-modal="true"
        aria-label="New issue"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeCreate();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <header className={s.createHead}>
          <label className={s.selectPill}>
            <TeamMark id={teamId} size={16} />
            <select
              value={teamId}
              onChange={(e) => setTeam(e.target.value as TeamId)}
              aria-label="Team"
            >
              {TEAMS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Icon name="chevron" size={12} className={s.crumbSep} />
          <span>New issue</span>
          <span className={s.grow} />
          <button type="button" className={s.iconBtn} onClick={closeCreate} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </header>
        <input
          ref={titleRef}
          autoFocus
          className={s.createTitle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
          aria-label="Issue title"
        />
        <textarea
          className={s.createDesc}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add description…"
          aria-label="Description"
          rows={4}
        />
        <div className={s.createPills}>
          <label className={s.selectPill}>
            <StatusIcon status={status} />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusId)}
              aria-label="Status"
            >
              {STATUSES.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </label>
          <label className={s.selectPill}>
            <PriorityIcon priority={priority} />
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as Priority)}
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={s.selectPill}>
            <Icon name="tag" size={14} />
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value as LabelId;
                if (v) setLabels((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));
              }}
              aria-label="Add a label"
            >
              <option value="">{labels.length ? 'Labels' : 'Add label'}</option>
              {LABELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {labels.includes(l.id) ? '✓ ' : ''}
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className={s.selectPill}>
            {pid ? <ProjectMark id={pid} /> : <Icon name="projects" size={14} />}
            <select
              value={pid}
              onChange={(e) => setPid(e.target.value as ProductId | '')}
              aria-label="Project"
            >
              <option value="">No project</option>
              {PROJECTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {labels.map((l) => (
            <button
              key={l}
              type="button"
              className={s.pillBare}
              onClick={() => setLabels((x) => x.filter((y) => y !== l))}
              aria-label={`Remove ${label(l).name}`}
            >
              <LabelChip id={l} />
            </button>
          ))}
        </div>
        <footer className={s.createFoot}>
          <span className={s.muted}>Kept in this browser only. Reset clears it.</span>
          <span className={s.grow} />
          <label className={s.toggle}>
            <input type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} />
            <span aria-hidden="true" />
            Create more
          </label>
          <button type="submit" className={cx(s.btn, s.btnPrimary)} disabled={!title.trim()}>
            Create issue <Keys k="⌘ ↵" />
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ shortcuts */

const SHEET: { title: string; rows: [string, string][] }[] = [
  {
    title: 'General',
    rows: [
      ['⌘ K', 'Command bar'],
      ['C', 'Create issue'],
      ['/', 'Filter'],
      ['⌘ Z', 'Undo'],
      ['?', 'This sheet'],
      ['Esc', 'Close, then clear selection'],
    ],
  },
  {
    title: 'Navigation',
    rows: [
      ['G B', 'Go to board'],
      ['G L', 'Go to list'],
      ['G R', 'Go to roadmap'],
      ['G M', 'Go to my issues'],
      ['G P', 'Go to projects'],
      ['G C', 'Go to cycles'],
      ['J ↓', 'Next issue'],
      ['K ↑', 'Previous issue'],
      ['← →', 'Next column on the board'],
      ['↵ O', 'Open issue'],
      ['Space', 'Peek, and close the peek'],
    ],
  },
  {
    title: 'Issues',
    rows: [
      ['X', 'Select issue'],
      ['⇧ click', 'Select a range'],
      ['⌘ A', 'Select all'],
      ['S', 'Change status'],
      ['P', 'Change priority'],
      ['L', 'Labels'],
      ['M', 'Move to project'],
      ['⇧ ← →', 'Move card a column'],
      ['1 – 5', 'Pick in a menu'],
    ],
  },
  {
    title: 'Roadmap',
    rows: [
      ['+ −', 'Zoom in and out'],
      ['← →', 'Scroll the years'],
    ],
  },
];

export function Help() {
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && setHelp(false)}>
      <div
        className={s.help}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onKeyDown={(e) => e.key === 'Escape' && setHelp(false)}
      >
        <header className={s.createHead}>
          <Icon name="help" size={16} />
          <span>Keyboard shortcuts</span>
          <span className={s.grow} />
          <button
            type="button"
            className={s.iconBtn}
            onClick={() => setHelp(false)}
            aria-label="Close"
            autoFocus
          >
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className={s.helpGrid}>
          {SHEET.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map(([k, v]) => (
                  <div key={v}>
                    <dt>{v}</dt>
                    <dd>
                      <Keys k={k} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ display options */

export function DisplayMenu({ state, onClose }: { state: State; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const d = state.display;
  const board = state.view === 'board';

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, select')?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest('[data-display-toggle]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return (
    <div className={s.menu} ref={ref} role="dialog" aria-label="Display options">
      <div className={s.menuRow}>
        <span>Layout</span>
        <div className={s.segmented} role="group" aria-label="Layout">
          <button
            type="button"
            aria-pressed={state.view === 'list'}
            onClick={() => setView('list')}
          >
            <Icon name="list" size={14} /> List
          </button>
          <button type="button" aria-pressed={board} onClick={() => setView('board')}>
            <Icon name="board" size={14} /> Board
          </button>
        </div>
      </div>
      <label className={s.menuRow}>
        <span>Grouping</span>
        <select
          value={board ? 'status' : d.grouping}
          onChange={(e) => setDisplay({ grouping: e.target.value as typeof d.grouping })}
          disabled={board}
          title={board ? 'The board groups by status' : undefined}
        >
          {GROUPINGS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label className={s.menuRow}>
        <span>Ordering</span>
        <select
          value={d.ordering}
          onChange={(e) => setDisplay({ ordering: e.target.value as typeof d.ordering })}
        >
          {ORDERINGS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className={cx(s.menuRow, s.toggle)}>
        <span>Show empty {board ? 'columns' : 'groups'}</span>
        <input
          type="checkbox"
          checked={d.showEmpty}
          onChange={(e) => setDisplay({ showEmpty: e.target.checked })}
        />
        <span aria-hidden="true" />
      </label>
      <div className={s.menuSep} />
      <p className={s.menuLabel}>Display properties</p>
      <div className={s.propToggles}>
        {PROPS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={d.props.includes(p.id)}
            onClick={() => toggleProp(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className={s.menuSep} />
      <div className={s.menuRow}>
        <button type="button" className={s.textBtn} onClick={resetDisplay}>
          Reset to default
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ selection, toast, chord */

export function BulkBar({ state, order }: { state: State; order: string[] }) {
  const n = state.selected.length;
  if (!n) return null;
  const targets = state.selected;
  return (
    <div className={s.bulk} role="toolbar" aria-label={`${n} selected`}>
      <span className={s.bulkCount}>
        <b>{n}</b> selected
      </span>
      <button type="button" onClick={() => openPicker({ kind: 'status', targets })}>
        <StatusIcon status="progress" /> Status <kbd className={s.kbd}>S</kbd>
      </button>
      <button type="button" onClick={() => openPicker({ kind: 'priority', targets })}>
        <PriorityIcon priority={2} /> Priority <kbd className={s.kbd}>P</kbd>
      </button>
      <button type="button" onClick={() => openPicker({ kind: 'labels', targets })}>
        <Icon name="tag" size={14} /> Labels <kbd className={s.kbd}>L</kbd>
      </button>
      <button type="button" onClick={() => openPicker({ kind: 'project', targets })}>
        <Icon name="projects" size={14} /> Project <kbd className={s.kbd}>M</kbd>
      </button>
      {order.length > n && (
        <button type="button" onClick={() => selectAll(order)}>
          All {order.length}
        </button>
      )}
      <button
        type="button"
        onClick={clearSelection}
        aria-label="Clear selection"
        className={s.bulkClose}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export function Toast({ toast }: { toast: NonNullable<State['toast']> }) {
  return (
    <div className={s.toast} role="status" key={toast.id}>
      <span>{toast.text}</span>
      {toast.undo && (
        <button type="button" onClick={undo}>
          Undo <kbd className={s.kbd}>⌘Z</kbd>
        </button>
      )}
      <button type="button" className={s.iconBtn} onClick={dismissToast} aria-label="Dismiss">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

export function ChordHint() {
  return (
    <div className={s.chord} role="status">
      <kbd className={s.kbd}>G</kbd> then
      {(
        [
          ['B', 'board'],
          ['L', 'list'],
          ['R', 'roadmap'],
          ['M', 'my issues'],
          ['P', 'projects'],
          ['C', 'cycles'],
        ] as const
      ).map(([k, v]) => (
        <span key={k}>
          <kbd className={s.kbd}>{k}</kbd> {v}
        </span>
      ))}
    </div>
  );
}
