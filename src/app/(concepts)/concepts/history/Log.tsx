'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { db } from '../_shared/data';
import { useInView, useReducedMotion } from '../_shared/hooks';
import { AUTHOR, BRANCHES, HEAD, LOG, TIPS, commit, type BranchId, type Commit } from './history';
import Icon from './Icon';
import s from './commits.module.scss';

type Select = (id: string, reveal?: boolean) => void;
type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

export const rowId = (id: string) => `commit-${id}`;

/* ------------------------------------------------------------------ graph geometry */

const ROW = 44;
const gx = (col: number) => 18 + col * 16;
const gy = (row: number) => row * ROW + ROW / 2;
const GRAPH_W = gx(3) + 16;
const GRAPH_H = LOG.length * ROW;
const LAST = LOG.length - 1;
// While it draws itself, the graph grows upward from the first commit at this many rows a second.
const SPEED = 34;

interface Edge {
  key: string;
  d: string;
  branch: BranchId;
  color: string;
  from: number;
  to: number;
  dashed: boolean;
}

// One edge per parent link, drawn from the parent (older, lower) up to the child. A branch bends
// out of its parent's lane in the row above the fork; a merge leaves its lane in the row below
// the merge commit. Both are the shapes Fork and GitKraken draw.
const EDGES: Edge[] = LOG.flatMap((c) =>
  c.parents.map((pid, i) => {
    const p = commit(pid);
    const [x1, y1, x2, y2] = [gx(p.branch.col), gy(p.row), gx(c.branch.col), gy(c.row)];
    const merge = i > 0;
    const lane = merge ? p.branch : c.branch;
    let d = `M${x1},${y1} V${y2}`;
    if (x1 !== x2 && merge) {
      const yk = y2 + ROW;
      d = `M${x1},${y1} V${yk} C${x1},${yk - ROW / 2} ${x2},${yk - ROW / 2} ${x2},${y2}`;
    } else if (x1 !== x2) {
      const yk = y1 - ROW;
      d = `M${x1},${y1} C${x1},${y1 - ROW / 2} ${x2},${y1 - ROW / 2} ${x2},${yk} V${y2}`;
    }
    return {
      key: `${pid}>${c.id}`,
      d,
      branch: lane.id,
      color: lane.color,
      from: p.row,
      to: c.row,
      dashed: c.kind === 'wip',
    };
  }),
);

const timing = (from: number, to = from): Vars => ({
  '--delay': `${((LAST - from) / SPEED).toFixed(3)}s`,
  '--dur': `${Math.max(0.05, (from - to) / SPEED).toFixed(3)}s`,
});

function Node({ c, on }: { c: Commit; on: boolean }) {
  const x = gx(c.branch.col);
  const y = gy(c.row);
  const style = { ...timing(c.row), '--c': c.branch.color } as Vars;
  return (
    <g className={`${s.node} ${s[c.kind]}`} style={style}>
      {c.id === HEAD && <circle cx={x} cy={y} r={10} className={s.headRing} />}
      {on && <circle cx={x} cy={y} r={11.5} className={s.selRing} />}
      <circle cx={x} cy={y} r={c.kind === 'merge' ? 4 : 5.5} className={s.dot} />
    </g>
  );
}

/* ------------------------------------------------------------------ rows */

export function Refs({ c }: { c: Commit }) {
  const tip = TIPS.get(c.id);
  const branch = tip ? BRANCHES[tip] : null;
  return (
    <>
      {branch && (
        <span className={s.ref} style={{ '--c': branch.color, '--lane-ink': branch.ink } as Vars}>
          {c.id === HEAD && <b>HEAD →</b>}
          {branch.ref}
        </span>
      )}
      {c.pr && (
        <span
          className={s.ref}
          style={{ '--c': c.branch.color, '--lane-ink': c.branch.ink } as Vars}
        >
          {c.pr.repo}
        </span>
      )}
      {c.tags.map((t) => (
        <span key={t} className={s.tagRef}>
          <Icon name="tag" />
          {t}
        </span>
      ))}
      {c.kind === 'wip' && <span className={s.wipRef}>not committed yet</span>}
    </>
  );
}

export function Log({
  selected,
  solo,
  onSelect,
}: {
  selected: string;
  solo: BranchId | null;
  onSelect: Select;
}) {
  const reduced = useReducedMotion();
  const [wrap, seen] = useInView<HTMLDivElement>(true, 0.08);
  const state = reduced ? 'static' : seen ? 'play' : 'idle';

  // j/k and the arrow keys walk the history, like tig and lazygit.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowDown: 1,
      j: 1,
      ArrowUp: -1,
      k: -1,
      Home: -LOG.length,
      End: LOG.length,
    };
    if (!(e.key in step) || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    const next = LOG[Math.max(0, Math.min(LAST, commit(selected).row + step[e.key]))];
    onSelect(next.id);
    document.getElementById(rowId(next.id))?.focus();
  };

  return (
    <div ref={wrap} className={s.log} data-state={state} data-solo={solo ?? undefined}>
      <div className={s.logHead} aria-hidden="true">
        <span>Graph</span>
        <span>Description</span>
        <span>Date</span>
        <span>Commit</span>
      </div>
      <div className={s.logBody}>
        <svg
          className={s.graph}
          width={GRAPH_W}
          height={GRAPH_H}
          viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
          aria-hidden="true"
        >
          {EDGES.map((e) => (
            <path
              key={e.key}
              d={e.d}
              pathLength={1}
              className={`${s.edge} ${e.dashed ? s.wipEdge : ''}`}
              data-dim={solo && solo !== e.branch ? '' : undefined}
              style={{ ...timing(e.from, e.to), stroke: e.color }}
            />
          ))}
          {LOG.map((c) => (
            <g key={c.id} data-dim={solo && solo !== c.branch.id ? '' : undefined}>
              <Node c={c} on={c.id === selected} />
            </g>
          ))}
        </svg>
        <ol
          className={s.rows}
          onKeyDown={onKeyDown}
          aria-label="Commit history, newest first. Use the arrow keys or j and k to move through it."
        >
          {LOG.map((c) => (
            <li key={c.id} data-dim={solo && solo !== c.branch.id ? '' : undefined}>
              <button
                id={rowId(c.id)}
                type="button"
                className={s.row}
                tabIndex={c.id === selected ? 0 : -1}
                aria-current={c.id === selected ? 'true' : undefined}
                onClick={() => onSelect(c.id)}
                style={{ '--c': c.branch.color, '--lane-ink': c.branch.ink } as Vars}
              >
                <span className={s.desc}>
                  <span className={s.refs}>
                    <Refs c={c} />
                  </span>
                  <span className={`${s.subject} ${c.kind === 'merge' ? s.mergeSubject : ''}`}>
                    {c.subject}
                  </span>
                </span>
                <span className={s.when}>{c.date}</span>
                <span className={s.sha}>{c.short}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ inspector */

function Body({ c }: { c: Commit }) {
  if (c.kind === 'merge') return <pre className={s.mergeLog}>{c.body}</pre>;
  return (
    <div className={s.body}>
      {c.body.split('\n\n').map((block) =>
        block.startsWith('- ') ? (
          <ul key={block}>
            {block.split('\n').map((line) => (
              <li key={line}>{line.slice(2)}</li>
            ))}
          </ul>
        ) : (
          <p key={block}>{block}</p>
        ),
      )}
    </div>
  );
}

export function Diff({ minus, plus, label }: { minus: string; plus: string; label: string }) {
  return (
    <div className={s.diff} role="group" aria-label={label}>
      <p className={s.hunk}>@@ before → after @@</p>
      <p className={s.minus}>
        <span aria-hidden="true">−</span>
        <span className={s.sr}>Before: </span>
        {minus}
      </p>
      <p className={s.plus}>
        <span aria-hidden="true">+</span>
        <span className={s.sr}>After: </span>
        {plus}
      </p>
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied(null), 1600);
      },
      () => setCopied(null),
    );
  };
  return [copied, copy] as const;
}

export function Inspector({
  id,
  open,
  onSelect,
  onClose,
}: {
  id: string;
  open: boolean;
  onSelect: Select;
  onClose: () => void;
}) {
  const c = commit(id);
  const [copied, copy] = useCopy();
  const b = c.branch;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside
      className={s.inspector}
      data-open={open}
      aria-label="Commit details"
      style={{ '--c': b.color, '--lane-ink': b.ink } as Vars}
    >
      <header className={s.inspBranch}>
        <span className={s.laneDot} />
        <span className={s.inspRef}>{b.ref}</span>
        <span className={s.inspOrg}>
          {b.url ? (
            <a href={b.url} target="_blank" rel="noreferrer">
              {b.org}
            </a>
          ) : (
            b.org
          )}
          <span> · {b.range}</span>
        </span>
        <button type="button" className={s.sheetClose} onClick={onClose} aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>
      <p className={s.inspRole}>{b.title}</p>

      <h3 className={s.inspSubject}>{c.subject}</h3>
      <p className={s.inspRefs}>
        <Refs c={c} />
      </p>

      <dl className={s.meta}>
        {c.hash && (
          <div>
            <dt>commit</dt>
            <dd className={s.fullHash}>
              <code>{c.hash}</code>
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => copy(c.hash, 'hash')}
                aria-label="Copy the full hash"
              >
                <Icon name={copied === 'hash' ? 'check' : 'copy'} />
              </button>
            </dd>
          </div>
        )}
        {c.pr && (
          <div>
            <dt>pull</dt>
            <dd>
              <a href={c.pr.url} target="_blank" rel="noreferrer">
                {c.pr.repo}
                {c.short}
              </a>{' '}
              <span className={s.merged}>Merged</span>
            </dd>
          </div>
        )}
        <div>
          <dt>author</dt>
          <dd className={s.author}>
            <Image src={db.person.photo} width={40} height={40} alt="" />
            {AUTHOR}
          </dd>
        </div>
        <div>
          <dt>date</dt>
          <dd>{c.kind === 'wip' ? 'not committed yet' : c.date}</dd>
        </div>
        {c.parents.length > 0 && c.kind !== 'wip' && (
          <div>
            <dt>{c.parents.length > 1 ? 'parents' : 'parent'}</dt>
            <dd className={s.parents}>
              {c.parents.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSelect(p, true)}
                  style={{ '--c': commit(p).branch.color } as Vars}
                >
                  {commit(p).short}
                </button>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {c.pr ? (
        <>
          <p className={s.prMeta}>
            <span
              className={`${s.label} ${c.pr.kind === 'Security' || c.pr.kind === 'Data loss' ? s.labelHot : ''}`}
            >
              {c.pr.kind}
            </span>
            ★ {c.pr.stars} · {c.pr.weekly} downloads a week
          </p>
          <Diff
            minus={c.pr.impact}
            plus={c.pr.change}
            label={`What pull request ${c.short} changed`}
          />
        </>
      ) : (
        <Body c={c} />
      )}

      {c.links.length > 0 && (
        <ul className={s.inspLinks}>
          {c.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label}
                <Icon name="external" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {c.files.length > 0 && (
        <div className={s.files}>
          <h4>
            {c.kind === 'wip'
              ? 'Untracked files'
              : `${c.files.length} ${c.files.length === 1 ? 'file' : 'files'} changed`}
          </h4>
          <ul>
            {c.files.map(([st, path]) => (
              <li key={path}>
                <span className={s[`st${st === '??' ? 'U' : st}`]}>{st}</span>
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.raw && (
        <details className={s.raw}>
          <summary>
            <code>git cat-file -p {c.short}</code>
          </summary>
          <pre>{c.raw}</pre>
          <p>
            A real commit object: copy it and run{' '}
            <code>pbpaste | git hash-object -t commit --stdin</code> to get <code>{c.short}…</code>{' '}
            back.
            <button type="button" className={s.copyRaw} onClick={() => copy(c.raw, 'raw')}>
              <Icon name={copied === 'raw' ? 'check' : 'copy'} />
              {copied === 'raw' ? 'Copied' : 'Copy object'}
            </button>
          </p>
        </details>
      )}
    </aside>
  );
}
