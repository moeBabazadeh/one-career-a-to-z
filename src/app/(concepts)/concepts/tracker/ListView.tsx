'use client';

// The list: issues in collapsible groups (by status, project, team, priority or cycle), sorted
// by the display ordering, with the same selection and cursor as the board.

import { useRef, useState, type ReactNode } from 'react';
import type { ProductId, RoleId } from '@/content/db';
import { cycle, project, type Issue, type Priority, type StatusId, type TeamId } from './model';
import { closedShare, groupIssues, openCreate, openProject, type Group, type State } from './store';
import { Row, useFocusFollow } from './Cards';
import { Icon, PriorityIcon, ProjectMark, Ring, StatusIcon, TeamMark } from './kit';
import s from './tracker.module.scss';

function GroupIcon({ g }: { g: Group }) {
  switch (g.field) {
    case 'status':
      return <StatusIcon status={g.key as StatusId} />;
    case 'priority':
      return <PriorityIcon priority={Number(g.key) as Priority} />;
    case 'team':
      return <TeamMark id={g.key as TeamId} size={16} />;
    case 'project':
      return g.key === 'none' ? (
        <Icon name="projects" size={14} />
      ) : (
        <ProjectMark id={g.key as ProductId} />
      );
    case 'cycle':
      return <Icon name="cycles" size={14} />;
    default:
      return <Icon name="list" size={14} />;
  }
}

function groupExtra(g: Group): ReactNode {
  if (g.field === 'project' && g.key !== 'none') {
    const p = project(g.key as ProductId);
    return (
      <button type="button" className={s.groupLink} onClick={() => openProject(p.id)}>
        <Ring share={closedShare(g.issues)} size={13} />
        {Math.round(closedShare(g.issues) * 100)}%
      </button>
    );
  }
  if (g.field === 'cycle' && g.key !== 'none')
    return <span className={s.groupNote}>{cycle(g.key as RoleId).range}</span>;
  return null;
}

export default function IssueList({
  state,
  issues,
  empty,
}: {
  state: State;
  issues: Issue[];
  empty?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const groups = groupIssues(issues, state.display);
  const order = groups
    .filter((g) => !collapsed.includes(`${g.field}:${g.key}`))
    .flatMap((g) => g.issues.map((i) => i.id));
  const tabbable = state.focus && order.includes(state.focus) ? state.focus : order[0];

  useFocusFollow(state.focus, root);

  if (!issues.length)
    return <div className={s.empty}>{empty ?? 'No issues match these filters.'}</div>;

  return (
    <div className={s.list} ref={root}>
      {groups.map((g) => {
        const id = `${g.field}:${g.key}`;
        const shut = collapsed.includes(id);
        return (
          <section key={id} className={s.group} aria-label={`${g.name}, ${g.issues.length}`}>
            {g.field !== 'none' && (
              <header className={s.groupHead}>
                <button
                  type="button"
                  className={s.groupToggle}
                  onClick={() =>
                    setCollapsed((c) => (shut ? c.filter((x) => x !== id) : [...c, id]))
                  }
                  aria-expanded={!shut}
                >
                  <Icon name="chevronDown" size={12} className={s.groupChevron} />
                  <GroupIcon g={g} />
                  <span className={s.groupName}>{g.name}</span>
                  <span className={s.count}>{g.issues.length}</span>
                </button>
                {groupExtra(g)}
                <span className={s.grow} />
                {(g.field === 'status' || g.field === 'team') && (
                  <button
                    type="button"
                    className={s.iconBtn}
                    onClick={() =>
                      openCreate(
                        g.field === 'status'
                          ? { status: g.key as StatusId }
                          : { team: g.key as TeamId },
                      )
                    }
                    aria-label={`Create an issue in ${g.name}`}
                    title={`Create in ${g.name}`}
                  >
                    <Icon name="compose" size={14} />
                  </button>
                )}
              </header>
            )}
            {!shut && (
              <ul className={s.rows} role="listbox" aria-multiselectable="true" aria-label={g.name}>
                {g.issues.map((issue) => (
                  <Row
                    key={issue.id}
                    issue={issue}
                    props={state.display.props}
                    focused={state.focus === issue.id}
                    selected={state.selected.includes(issue.id)}
                    order={order}
                    tabbable={tabbable === issue.id}
                  />
                ))}
                {!g.issues.length && <li className={s.rowEmpty}>No issues</li>}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The order the cursor walks on the list: groups as shown. */
export function listOrder(state: State, issues: Issue[]) {
  return groupIssues(issues, state.display).flatMap((g) => g.issues.map((i) => i.id));
}
