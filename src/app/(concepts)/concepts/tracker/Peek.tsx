'use client';

// The side peek: an issue (properties, description, links, activity and a comment box) or a
// project (status, dates, progress, resources and its issues). On phones it fills the screen.

import Image from 'next/image';
import { useState } from 'react';
import type { ProductId } from '@/content/db';
import { db } from '../_shared/data';
import {
  PROJECT_STATUS,
  STATUSES,
  activityOf,
  cycle,
  isClosed,
  label,
  priorityName,
  project,
  spanLabel,
  statusName,
  team,
  type Activity,
  type Block,
  type Issue,
  type Link,
} from './model';
import {
  addComment,
  closePeek,
  deleteIssue,
  findIssue,
  issuesOf,
  localActivity,
  onlyFilter,
  openIssue,
  openPicker,
  openProject,
  setView,
  toast,
  toggleCheck,
  type State,
} from './store';
import {
  Avatar,
  Icon,
  Kbd,
  LINK_ICON,
  LabelChip,
  PriorityIcon,
  ProjectMark,
  ProjectStatusIcon,
  Ring,
  StatusIcon,
  TeamMark,
  cx,
  personName,
  type Vars,
} from './kit';
import s from './tracker.module.scss';

/* ------------------------------------------------------------------ shared */

function PeekHead({
  crumbs,
  order,
  current,
  onClose,
  extra,
}: {
  crumbs: React.ReactNode;
  order?: string[];
  current?: string;
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  const at = order && current ? order.indexOf(current) : -1;
  const go = (d: number) => {
    if (!order || at < 0) return;
    const next = order[at + d];
    if (next) openIssue(next);
  };
  return (
    <header className={s.peekHead}>
      <button
        type="button"
        className={cx(s.iconBtn, s.peekBack)}
        onClick={onClose}
        aria-label="Back"
      >
        <Icon name="chevron" size={16} className={s.flip} />
      </button>
      <div className={s.crumbs}>{crumbs}</div>
      <span className={s.grow} />
      {extra}
      {order && at >= 0 && (
        <>
          <span className={s.peekPos}>
            {at + 1} / {order.length}
          </span>
          <button
            type="button"
            className={s.iconBtn}
            onClick={() => go(-1)}
            disabled={at <= 0}
            aria-label="Previous issue"
            title="Previous (K)"
          >
            <Icon name="up" size={14} />
          </button>
          <button
            type="button"
            className={s.iconBtn}
            onClick={() => go(1)}
            disabled={at >= order.length - 1}
            aria-label="Next issue"
            title="Next (J)"
          >
            <Icon name="down" size={14} />
          </button>
        </>
      )}
      <button
        type="button"
        className={cx(s.iconBtn, s.peekClose)}
        onClick={onClose}
        aria-label="Close"
        title="Close (Esc)"
      >
        <Icon name="close" size={14} />
      </button>
    </header>
  );
}

function LinkRow({ link }: { link: Link }) {
  const external = !link.url.startsWith('mailto:') && !link.url.startsWith('/');
  return (
    <a
      className={s.linkRow}
      href={link.url}
      target={link.url.startsWith('mailto:') ? undefined : '_blank'}
      rel="noreferrer"
    >
      <span className={s.linkIcon} data-kind={link.kind}>
        <Icon name={LINK_ICON[link.kind]} size={15} />
      </span>
      <span className={s.linkText}>
        <b>{link.label}</b>
        <small>
          {link.meta ??
            (link.kind === 'pr'
              ? 'Pull request'
              : link.kind === 'store'
                ? 'Store listing'
                : link.kind === 'paper'
                  ? 'Paper'
                  : link.kind === 'code'
                    ? 'Repository'
                    : 'Website')}
        </small>
      </span>
      {external && <Icon name="external" size={13} className={s.linkOut} />}
    </a>
  );
}

function Blocks({
  issue,
  blocks,
  checks,
}: {
  issue: Issue;
  blocks: Block[];
  checks: State['checks'];
}) {
  return (
    <div className={s.desc}>
      {blocks.map((b, bi) => {
        switch (b.t) {
          case 'p':
            return <p key={bi}>{b.text}</p>;
          case 'h':
            return <h4 key={bi}>{b.text}</h4>;
          case 'check':
            return (
              <ul key={bi} className={s.checklist}>
                {b.items.map((it, ii) => {
                  const k = `${bi}.${ii}`;
                  const done = checks[`${issue.id}:${k}`] ?? it.done;
                  return (
                    <li key={ii}>
                      <label>
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggleCheck(issue.id, k, it.done)}
                        />
                        <span className={s.checkBox} aria-hidden="true">
                          <Icon name="check" size={11} />
                        </span>
                        <span data-done={done || undefined}>{it.text}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            );
          case 'facts':
            return (
              <dl key={bi} className={s.facts}>
                {b.rows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            );
          case 'keys':
            return (
              <dl key={bi} className={s.keyList}>
                {b.rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      {k
                        .split(' ')
                        .map((part, i) =>
                          part === 'then' || part === '·' || part === '/' ? (
                            <span key={i}>{part}</span>
                          ) : (
                            <Kbd key={i}>{part}</Kbd>
                          ),
                        )}
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            );
          case 'links':
            return (
              <div key={bi} className={s.links}>
                {b.links.map((l) => (
                  <LinkRow key={l.url} link={l} />
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}

function ActivityItem({ a }: { a: Activity }) {
  const when = a.stamp ?? (a.when ? spanLabel({ start: a.when }) : '');
  if (a.kind === 'comment')
    return (
      <li className={s.comment}>
        <Avatar who={a.who} size={20} />
        <div>
          <p className={s.commentHead}>
            <b>{personName(a.who)}</b> <span>{when}</span>
          </p>
          <p>{a.text}</p>
        </div>
      </li>
    );
  return (
    <li className={s.event}>
      <span className={s.eventIcon}>
        {a.kind === 'status' && a.to ? (
          <StatusIcon status={a.to} size={13} />
        ) : (
          <Avatar who={a.who} size={16} />
        )}
      </span>
      <p>
        <b>{personName(a.who)}</b> {a.text}
        {when && <span className={s.eventWhen}> · {when}</span>}
      </p>
    </li>
  );
}

function CommentBox({ id }: { id: string }) {
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    addComment(id, text);
    setText('');
    toast('Comment saved on this device');
  };
  return (
    <form
      className={s.commentBox}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Avatar who="you" size={20} />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Leave a comment… (kept on this device)"
        rows={2}
        aria-label="Comment"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button type="submit" className={s.btn} disabled={!text.trim()}>
        Comment
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ issue */

function Prop({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className={s.prop}>
      <span className={s.propName}>{name}</span>
      <div className={s.propValue}>{children}</div>
    </div>
  );
}

export function IssuePeek({ state, id, order }: { state: State; id: string; order: string[] }) {
  const issue = findIssue(state, id);
  if (!issue) return null;
  const t = team(issue.team);
  const events: Activity[] = [
    ...activityOf(issue),
    ...localActivity(state, issue.id).map((e) => ({
      key: `l${e.id}`,
      who: 'you' as const,
      kind: e.kind,
      text: e.text,
      stamp: e.stamp,
      from: e.from,
      to: e.to,
    })),
  ];
  const c = issue.cycle ? cycle(issue.cycle) : null;
  const targets = [issue.id];

  return (
    <aside className={s.peek} aria-label={`${issue.id}: ${issue.title}`}>
      <PeekHead
        crumbs={
          <>
            <TeamMark id={issue.team} size={16} />
            <span>{t.name}</span>
            <Icon name="chevron" size={12} className={s.crumbSep} />
            <span className={s.issueId}>{issue.id}</span>
          </>
        }
        order={order}
        current={issue.id}
        onClose={closePeek}
        extra={
          <button
            type="button"
            className={s.iconBtn}
            aria-label="Copy link"
            title="Copy link"
            onClick={() =>
              navigator.clipboard
                ?.writeText(`${location.origin}${location.pathname}#list/${issue.id}`)
                .then(
                  () => toast(`Copied a link to ${issue.id}`),
                  () => toast('Could not copy the link'),
                )
            }
          >
            <Icon name="link" size={14} />
          </button>
        }
      />
      <div className={s.peekScroll}>
        <h2 className={s.peekTitle}>{issue.title}</h2>

        <div className={s.props}>
          <Prop name="Status">
            <button
              type="button"
              className={s.pill}
              onClick={() => openPicker({ kind: 'status', targets })}
            >
              <StatusIcon status={issue.status} /> {statusName(issue.status)}
            </button>
          </Prop>
          <Prop name="Priority">
            <button
              type="button"
              className={s.pill}
              onClick={() => openPicker({ kind: 'priority', targets })}
            >
              <PriorityIcon priority={issue.priority} /> {priorityName(issue.priority)}
            </button>
          </Prop>
          <Prop name="Assignee">
            <span className={s.pillStatic}>
              <Avatar who={issue.assignee} size={18} /> {personName(issue.assignee)}
            </span>
          </Prop>
          <Prop name="Labels">
            <div className={s.pillWrap}>
              {issue.labels.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={s.pillBare}
                  onClick={() => openPicker({ kind: 'labels', targets })}
                  aria-label={`Label ${label(l).name}, change labels`}
                >
                  <LabelChip id={l} />
                </button>
              ))}
              <button
                type="button"
                className={cx(s.pill, s.pillAdd)}
                onClick={() => openPicker({ kind: 'labels', targets })}
                aria-label="Add label"
              >
                <Icon name="tag" size={13} />
                {issue.labels.length ? '' : 'Add label'}
              </button>
            </div>
          </Prop>
          <Prop name="Project">
            <button
              type="button"
              className={s.pill}
              onClick={() => openPicker({ kind: 'project', targets })}
            >
              {issue.project ? (
                <>
                  <ProjectMark id={issue.project} /> {project(issue.project).name}
                </>
              ) : (
                <>
                  <Icon name="projects" size={14} /> No project
                </>
              )}
            </button>
            {issue.project && (
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => openProject(issue.project as ProductId)}
                aria-label={`Open ${project(issue.project).name}`}
                title="Open project"
              >
                <Icon name="external" size={13} />
              </button>
            )}
          </Prop>
          <Prop name="Cycle">
            {c ? (
              <button
                type="button"
                className={s.pill}
                onClick={() => {
                  onlyFilter('cycle', c.id);
                  setView('list');
                }}
                title={`${c.title}, ${c.range}`}
              >
                <Icon name="cycles" size={14} /> Cycle {c.n} · {c.org}
              </button>
            ) : (
              <span className={s.pillStatic}>No cycle</span>
            )}
          </Prop>
          <Prop name="Dates">
            <span className={s.pillStatic}>
              <Icon name="calendar" size={14} /> {spanLabel(issue)}
            </span>
          </Prop>
          {issue.tag && (
            <Prop name="Asset">
              <span className={cx(s.pillStatic, s.mono)}>{issue.tag}</span>
            </Prop>
          )}
        </div>

        {issue.body.length > 0 ? (
          <Blocks issue={issue} blocks={issue.body} checks={state.checks} />
        ) : (
          <p className={s.descEmpty}>No description.</p>
        )}

        {issue.stack.length > 0 && (
          <section className={s.peekSection}>
            <h3>Stack</h3>
            <div className={s.stack}>
              {issue.stack.map((t2) => (
                <span key={t2}>{t2}</span>
              ))}
            </div>
          </section>
        )}

        {issue.links.length > 0 && (
          <section className={s.peekSection}>
            <h3>{issue.links.some((l) => l.kind === 'pr') ? 'Pull request' : 'Links'}</h3>
            <div className={s.links}>
              {issue.links.map((l) => (
                <LinkRow key={l.url} link={l} />
              ))}
            </div>
          </section>
        )}

        {issue.local && (
          <section className={s.peekSection}>
            <p className={s.localNote}>
              You created this issue. It lives in this browser only.{' '}
              <button type="button" className={s.textBtn} onClick={() => deleteIssue(issue.id)}>
                Delete it
              </button>
            </p>
          </section>
        )}

        <section className={cx(s.peekSection, s.activity)}>
          <h3>Activity</h3>
          <ol>
            {events.map((a) => (
              <ActivityItem key={a.key} a={a} />
            ))}
          </ol>
          <CommentBox key={issue.id} id={issue.id} />
        </section>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ project */

export function ProjectPeek({ state, id }: { state: State; id: ProductId }) {
  const p = project(id);
  const issues = issuesOf(state).filter((i) => i.project === id);
  const closed = issues.filter((i) => isClosed(i.status)).length;
  const share = issues.length ? closed / issues.length : 0;
  const teams = [...new Set(issues.map((i) => i.team))];
  const c = p.cycle ? cycle(p.cycle) : null;

  return (
    <aside className={s.peek} aria-label={`Project ${p.name}`}>
      <PeekHead
        crumbs={
          <>
            <Icon name="projects" size={14} />
            <span>Projects</span>
            <Icon name="chevron" size={12} className={s.crumbSep} />
            <span>{p.name}</span>
          </>
        }
        onClose={closePeek}
      />
      <div className={s.peekScroll}>
        {p.image && (
          <div className={s.cover}>
            <Image
              src={p.image}
              width={1280}
              height={800}
              alt={`${p.name}, screenshot`}
              sizes="(max-width: 760px) 100vw, 480px"
            />
          </div>
        )}
        <div className={s.projectHead}>
          <span className={s.projectIconLg} style={{ '--c': p.color } as Vars}>
            <ProjectMark id={p.id} size={22} />
          </span>
          <h2 className={s.peekTitle}>{p.name}</h2>
          {p.featured && (
            <span className={s.featured} title="Featured">
              <Icon name="star" size={12} /> Featured
            </span>
          )}
        </div>

        <div className={s.props}>
          <Prop name="Status">
            <span className={s.pillStatic}>
              <ProjectStatusIcon status={p.status} /> {PROJECT_STATUS[p.status]}
            </span>
          </Prop>
          <Prop name="Lead">
            <span className={s.pillStatic}>
              <Avatar who="moe" size={18} /> {db.person.first}
            </span>
          </Prop>
          <Prop name="Start date">
            <span className={s.pillStatic}>
              <Icon name="calendar" size={14} />{' '}
              {p.start ? spanLabel({ start: p.start }) : 'Not on record'}
            </span>
          </Prop>
          <Prop name="Target date">
            <span className={cx(s.pillStatic, s.muted)}>No target</span>
          </Prop>
          {c && (
            <Prop name="Cycle">
              <span className={s.pillStatic}>
                <Icon name="cycles" size={14} /> Cycle {c.n} · {c.org}
              </span>
            </Prop>
          )}
          <Prop name="Teams">
            <div className={s.pillWrap}>
              {teams.map((tid) => (
                <span key={tid} className={s.pillStatic}>
                  <TeamMark id={tid} size={14} /> {team(tid).name}
                </span>
              ))}
            </div>
          </Prop>
        </div>

        <div className={s.desc}>
          <p>{p.description}</p>
        </div>

        <section className={s.peekSection}>
          <h3>Progress</h3>
          <div className={s.progress}>
            <Ring share={share} size={28} />
            <div>
              <b>{Math.round(share * 100)}%</b>
              <small>
                {closed} of {issues.length} issues done or shipped
              </small>
            </div>
          </div>
          <div className={s.progressBar} aria-hidden="true">
            {STATUSES.map((st) => {
              const n = issues.filter((i) => i.status === st.id).length;
              return n ? (
                <i key={st.id} data-status={st.id} style={{ flex: n }} title={`${st.name}: ${n}`} />
              ) : null;
            })}
          </div>
        </section>

        {p.stack.length > 0 && (
          <section className={s.peekSection}>
            <h3>Stack</h3>
            <div className={s.stack}>
              {p.stack.map((t2) => (
                <span key={t2}>{t2}</span>
              ))}
            </div>
          </section>
        )}

        {p.links.length > 0 && (
          <section className={s.peekSection}>
            <h3>Resources</h3>
            <div className={s.links}>
              {p.links.map((l) => (
                <LinkRow key={l.url} link={l} />
              ))}
            </div>
          </section>
        )}

        <section className={s.peekSection}>
          <h3>
            Issues <span className={s.count}>{issues.length}</span>
          </h3>
          <ul className={s.miniList}>
            {issues.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => openIssue(i.id)}>
                  <StatusIcon status={i.status} />
                  <span className={s.issueId}>{i.id}</span>
                  <span className={s.miniTitle}>{i.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
