'use client';

// An issue as a board card and as a list row, with the properties the display options show.

import { useEffect, type CSSProperties } from 'react';
import { dateLabel, project, type Issue } from './model';
import { openIssue, openPicker, selectRange, toggleSelect, type Prop } from './store';
import { Avatar, Icon, LabelChip, PriorityIcon, ProjectMark, StatusIcon, cx } from './kit';
import s from './tracker.module.scss';

/** Click opens; ⌘/Ctrl-click toggles the selection; Shift-click selects a range. */
export function clickIssue(e: React.MouseEvent, id: string, order: string[]) {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    toggleSelect(id);
  } else if (e.shiftKey) {
    e.preventDefault();
    selectRange(order, id);
  } else {
    openIssue(id);
  }
}

function LinkBadge({ issue }: { issue: Issue }) {
  const pr = issue.links.find((l) => l.kind === 'pr');
  if (pr) {
    const num = pr.label.split('#')[1];
    return (
      <span className={s.linkBadge} title={pr.label}>
        <Icon name="pr" size={12} />#{num}
      </span>
    );
  }
  if (!issue.links.length) return null;
  return (
    <span className={s.linkBadge} title={issue.links.map((l) => l.label).join(', ')}>
      <Icon name="link" size={12} />
      {issue.links.length}
    </span>
  );
}

interface CardProps {
  issue: Issue;
  props: Prop[];
  focused: boolean;
  selected: boolean;
  order: string[];
  dragging?: boolean;
  tabbable: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>, issue: Issue) => void;
  style?: CSSProperties;
}

export function Card({
  issue,
  props,
  focused,
  selected,
  order,
  dragging,
  tabbable,
  onPointerDown,
  style,
}: CardProps) {
  const has = (p: Prop) => props.includes(p);
  return (
    <div
      className={s.card}
      data-issue={issue.id}
      data-focused={focused || undefined}
      data-selected={selected || undefined}
      data-dragging={dragging || undefined}
      role="button"
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${issue.id} ${issue.title}`}
      aria-pressed={selected}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, issue) : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-stop]')) return;
        clickIssue(e, issue.id, order);
      }}
      style={style}
    >
      <div className={s.cardTop}>
        {has('id') && <span className={s.issueId}>{issue.id}</span>}
        {issue.local && <span className={s.localBadge}>Local</span>}
        <span className={s.grow} />
        {has('assignee') && <Avatar who={issue.assignee} size={18} />}
      </div>
      <div className={s.cardTitle}>
        {has('status') && <StatusIcon status={issue.status} />}
        <span>{issue.title}</span>
      </div>
      <div className={s.cardMeta}>
        {has('priority') && (
          <button
            type="button"
            data-stop
            className={s.metaBtn}
            onClick={() => openPicker({ kind: 'priority', targets: [issue.id] })}
            aria-label={`Priority of ${issue.id}`}
            tabIndex={-1}
          >
            <PriorityIcon priority={issue.priority} />
          </button>
        )}
        {has('labels') && issue.labels.slice(0, 2).map((l) => <LabelChip key={l} id={l} compact />)}
        {has('labels') && issue.labels.length > 2 && (
          <span className={s.moreChip}>+{issue.labels.length - 2}</span>
        )}
        {has('project') && issue.project && (
          <span className={s.projectChip}>
            <ProjectMark id={issue.project} size={12} />
            <span>{project(issue.project).name}</span>
          </span>
        )}
        {has('links') && <LinkBadge issue={issue} />}
        {has('date') && issue.start && <span className={s.dateChip}>{dateLabel(issue.start)}</span>}
      </div>
    </div>
  );
}

interface RowProps {
  issue: Issue;
  props: Prop[];
  focused: boolean;
  selected: boolean;
  order: string[];
  tabbable: boolean;
}

export function Row({ issue, props, focused, selected, order, tabbable }: RowProps) {
  const has = (p: Prop) => props.includes(p);
  return (
    <li
      className={s.row}
      data-issue={issue.id}
      data-focused={focused || undefined}
      data-selected={selected || undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${issue.id} ${issue.title}`}
      aria-selected={selected}
      role="option"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-stop]')) return;
        clickIssue(e, issue.id, order);
      }}
    >
      <button
        type="button"
        data-stop
        className={s.rowCheck}
        data-on={selected || undefined}
        onClick={() => toggleSelect(issue.id)}
        aria-label={`Select ${issue.id}`}
        tabIndex={-1}
      >
        <Icon name="check" size={11} />
      </button>
      {has('priority') && (
        <button
          type="button"
          data-stop
          className={s.metaBtn}
          onClick={() => openPicker({ kind: 'priority', targets: [issue.id] })}
          aria-label={`Priority of ${issue.id}`}
          tabIndex={-1}
        >
          <PriorityIcon priority={issue.priority} />
        </button>
      )}
      {has('id') && <span className={cx(s.issueId, s.rowId)}>{issue.id}</span>}
      {has('status') && (
        <button
          type="button"
          data-stop
          className={s.metaBtn}
          onClick={() => openPicker({ kind: 'status', targets: [issue.id] })}
          aria-label={`Status of ${issue.id}`}
          tabIndex={-1}
        >
          <StatusIcon status={issue.status} />
        </button>
      )}
      <span className={s.rowTitle}>{issue.title}</span>
      {issue.local && <span className={s.localBadge}>Local</span>}
      <span className={s.rowMeta}>
        {has('links') && <LinkBadge issue={issue} />}
        {has('labels') && (
          <span className={s.rowLabels}>
            {issue.labels.map((l) => (
              <LabelChip key={l} id={l} compact />
            ))}
          </span>
        )}
        {has('project') && issue.project && (
          <span className={cx(s.projectChip, s.rowProject)}>
            <ProjectMark id={issue.project} size={12} />
            <span>{project(issue.project).name}</span>
          </span>
        )}
        {has('date') && <span className={cx(s.dateChip, s.rowDate)}>{dateLabel(issue.start)}</span>}
        {has('assignee') && <Avatar who={issue.assignee} size={18} />}
      </span>
    </li>
  );
}

/**
 * Keeps keyboard focus on the issue under the cursor as J and K move it, without stealing
 * focus from a field, and scrolls it into view.
 */
export function useFocusFollow(
  focus: string | null,
  container: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const root = container.current;
    if (!root || !focus) return;
    const el = root.querySelector<HTMLElement>(`[data-issue="${focus}"]`);
    if (!el) return;
    const active = document.activeElement;
    const free = !active || active === document.body || root.contains(active);
    if (free) el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focus, container]);
}
