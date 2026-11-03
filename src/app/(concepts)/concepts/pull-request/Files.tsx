'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FILES, FILES_APPLIED, THREADS, type FileDef } from './changes';
import { buildDiff, toSplit, type FileDiff, type Row } from './diff';
import { csvCells, csvValue } from './syntax';
import { addComment, removeComment, toggleViewed, usePR, type LineComment } from './store';
import { Code, PendingComment, ReviewForm, ThreadView, tokensFor } from './Review';
import { CopyButton, Icon, Markdown, cx } from './ui';
import s from './pr.module.scss';

/* ------------------------------------------------------------------ diffs, computed once per state */

export interface Entry {
  file: FileDef;
  diff: FileDiff;
}

const DIFFS: Entry[] = FILES.map((file) => ({ file, diff: buildDiff(file) }));
const DIFFS_APPLIED: Entry[] = FILES_APPLIED.map((file) => ({ file, diff: buildDiff(file) }));
export const diffsFor = (applied: boolean) => (applied ? DIFFS_APPLIED : DIFFS);

export function totals(entries: Entry[]) {
  return entries.reduce(
    (t, e) => ({
      additions: t.additions + e.diff.additions,
      deletions: t.deletions + e.diff.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

export const fileDom = (path: string) => `file-${path.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

/** Five squares, green for additions and red for deletions, like a diffstat. */
export function DiffBlocks({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  const green = total ? Math.round((additions / total) * 5) : 0;
  const red = total ? Math.min(5 - green, Math.ceil((deletions / total) * 5)) : 0;
  return (
    <span className={s.blocks} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} data-k={i < green ? 'add' : i < green + red ? 'del' : 'none'} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ narrow screens get unified diffs */

const NARROW = '(max-width: 760px)';
const subscribeNarrow = (cb: () => void) => {
  const q = matchMedia(NARROW);
  q.addEventListener('change', cb);
  return () => q.removeEventListener('change', cb);
};
export const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

/* ------------------------------------------------------------------ file tree */

interface TreeNode {
  name: string;
  path?: string;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', children: [] };
  for (const path of paths) {
    const parts = path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node.children.push({ name: part, path, children: [] });
        return;
      }
      let dir = node.children.find((c) => c.name === part && !c.path);
      if (!dir) {
        dir = { name: part, children: [] };
        node.children.push(dir);
      }
      node = dir;
    });
  }
  return root.children;
}

function Tree({
  entries,
  current,
  onJump,
}: {
  entries: Entry[];
  current: string;
  onJump: (path: string) => void;
}) {
  const pr = usePR();
  const nodes = useMemo(() => buildTree(entries.map((e) => e.file.path)), [entries]);
  const byPath = new Map(entries.map((e) => [e.file.path, e]));
  const render = (list: TreeNode[], depth: number): React.ReactNode =>
    list.map((n) =>
      n.path ? (
        <li key={n.path}>
          <button
            type="button"
            className={s.treeFile}
            style={{ paddingLeft: 10 + depth * 14 }}
            aria-current={current === n.path ? 'true' : undefined}
            onClick={() => onJump(n.path as string)}
            title={n.path}
          >
            <span
              className={s.treeStatus}
              data-status={byPath.get(n.path)?.file.status}
              aria-hidden="true"
            />
            <span className={s.treeName}>{n.name}</span>
            {pr.viewed.includes(n.path) && (
              <span className={s.treeViewed} aria-label="viewed">
                <Icon.check />
              </span>
            )}
            <span className={s.treeCount}>+{byPath.get(n.path)?.diff.additions}</span>
          </button>
        </li>
      ) : (
        <li key={`d-${n.name}`}>
          <span className={s.treeDir} style={{ paddingLeft: 10 + depth * 14 }}>
            <Icon.folder />
            {n.name}
          </span>
          <ul>{render(n.children, depth + 1)}</ul>
        </li>
      ),
    );
  return (
    <nav className={s.tree} aria-label="Changed files">
      <ul>{render(nodes, 0)}</ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ one file */

interface FormAt {
  path: string;
  line: number;
  side: 'old' | 'new';
  quote: string;
}

interface FileProps {
  entry: Entry;
  mode: 'unified' | 'split';
  wrap: boolean;
  open: boolean;
  onToggle: () => void;
  /** Marking a file viewed folds it, and unmarking unfolds it. */
  onViewed: () => void;
  viewed: boolean;
}

const sideOf = (r: Row): 'old' | 'new' => (r.type === 'del' ? 'old' : 'new');
const lineOfRow = (r: Row) => (r.type === 'del' ? (r.oldNo as number) : (r.newNo as number));

function CommentForm({ at, onClose }: { at: FormAt; onClose: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const save = () => {
    if (!text.trim()) return;
    addComment({ ...at, body: text.trim() });
    onClose();
  };
  return (
    <div className={s.lineForm}>
      <label className={s.sr} htmlFor={`form-${at.path}-${at.line}`}>
        Comment on {at.path} line {at.line}
      </label>
      <textarea
        ref={ref}
        id={`form-${at.path}-${at.line}`}
        className={s.textarea}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Comment on line ${at.line}…`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
        }}
      />
      <div className={s.lineFormActions}>
        <span className={s.muted}>
          <kbd>⌘</kbd> <kbd>Enter</kbd> to add
        </span>
        <button type="button" className={cx(s.btn, s.btnSmall)} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={cx(s.btn, s.btnSmall, s.btnPrimary)}
          onClick={save}
          disabled={!text.trim()}
        >
          Add review comment
        </button>
      </div>
    </div>
  );
}

function FileView({ entry, mode, wrap, open, onToggle, onViewed, viewed }: FileProps) {
  const pr = usePR();
  const { file, diff } = entry;
  const [loaded, setLoaded] = useState(!file.generated);
  const [rich, setRich] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [form, setForm] = useState<FormAt | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [announce, setAnnounce] = useState('');
  const dom = fileDom(file.path);

  const threads = THREADS.filter((t) => t.path === file.path && !t.outdated);
  const mine: { c: LineComment; submitted: boolean }[] = [
    ...pr.pending.filter((c) => c.path === file.path).map((c) => ({ c, submitted: false })),
    ...(pr.review?.comments ?? [])
      .filter((c) => c.path === file.path)
      .map((c) => ({ c, submitted: true })),
  ];

  // The rows on screen, in order, for keyboard navigation.
  const visible: Row[] = diff.segments.flatMap((seg) =>
    seg.kind === 'hunk' || expanded.includes(seg.id) ? seg.rows : [],
  );
  const rowKey = (r: Row) => `${r.type}-${r.oldNo ?? ''}-${r.newNo ?? ''}`;
  const indexOf = new Map(visible.map((r, i) => [rowKey(r), i]));

  const openForm = (r: Row) => {
    if (pr.merged) return;
    setForm({ path: file.path, line: lineOfRow(r), side: sideOf(r), quote: r.text });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step: Record<string, number> = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };
    if (e.key in step) {
      e.preventDefault();
      const next = Math.max(0, Math.min(visible.length - 1, cursor + step[e.key]));
      setCursor(next);
      const r = visible[next];
      setAnnounce(
        `Line ${lineOfRow(r)}, ${r.type === 'add' ? 'added' : r.type === 'del' ? 'removed' : 'unchanged'}: ${r.text || 'blank'}`,
      );
      document.getElementById(`${dom}-r${next}`)?.scrollIntoView({ block: 'nearest' });
    } else if ((e.key === 'Enter' || e.key === 'c') && cursor >= 0) {
      e.preventDefault();
      openForm(visible[cursor]);
    }
  };

  const after = (r: Row | undefined, cols: number) => {
    if (!r) return null;
    const side = sideOf(r);
    const line = lineOfRow(r);
    const here = threads.filter((t) => side === 'new' && t.line === line);
    const comments = mine.filter(({ c }) => c.side === side && c.line === line);
    const formHere = form && form.side === side && form.line === line;
    if (!here.length && !comments.length && !formHere) return null;
    return (
      <tr className={s.annotRow}>
        <td colSpan={cols}>
          <div className={s.annot}>
            {here.map((t) => (
              <ThreadView key={t.id} thread={t} inline />
            ))}
            {comments.map(({ c, submitted }) => (
              <PendingComment
                key={c.id}
                c={c}
                submitted={submitted}
                onDelete={submitted ? undefined : () => removeComment(c.id)}
              />
            ))}
            {formHere && <CommentForm at={form} onClose={() => setForm(null)} />}
          </div>
        </td>
      </tr>
    );
  };

  const plus = (r: Row) =>
    pr.merged ? null : (
      <button
        type="button"
        tabIndex={-1}
        className={s.plus}
        onClick={() => openForm(r)}
        aria-label={`Comment on line ${lineOfRow(r)}`}
      >
        <Icon.plus />
      </button>
    );

  const unifiedRow = (r: Row) => {
    const i = indexOf.get(rowKey(r)) ?? -1;
    return (
      <Fragment key={rowKey(r)}>
        <tr
          id={`${dom}-r${i}`}
          className={s.row}
          data-type={r.type}
          data-cursor={i === cursor || undefined}
        >
          <td className={s.num}>{r.oldNo}</td>
          <td className={s.num}>{r.newNo}</td>
          <td className={s.codeCell}>
            {plus(r)}
            <span className={s.sign} aria-hidden="true">
              {r.type === 'add' ? '+' : r.type === 'del' ? '−' : ''}
            </span>
            <code className={s.code}>
              <Code tokens={tokensFor(r.text, file.lang)} span={r.span} />
            </code>
          </td>
        </tr>
        {after(r, 3)}
      </Fragment>
    );
  };

  const half = (r: Row | undefined, side: 'left' | 'right') =>
    r ? (
      <>
        <td className={s.num} data-type={side === 'left' && r.type === 'eq' ? 'eq' : r.type}>
          {side === 'left' ? r.oldNo : r.newNo}
        </td>
        <td className={s.codeCell} data-type={r.type}>
          {plus(r)}
          <span className={s.sign} aria-hidden="true">
            {r.type === 'add' ? '+' : r.type === 'del' ? '−' : ''}
          </span>
          <code className={s.code}>
            <Code tokens={tokensFor(r.text, file.lang)} span={r.span} />
          </code>
        </td>
      </>
    ) : (
      <>
        <td className={s.num} data-type="empty" />
        <td className={s.codeCell} data-type="empty" />
      </>
    );

  const splitRows = (rows: Row[]) =>
    toSplit(rows).map((pair, k) => {
      const r = pair.right ?? pair.left;
      const i = r ? (indexOf.get(rowKey(r)) ?? -1) : -1;
      return (
        <Fragment key={k}>
          <tr id={`${dom}-r${i}`} className={s.row} data-cursor={i === cursor || undefined}>
            {half(pair.left, 'left')}
            {half(pair.right, 'right')}
          </tr>
          {pair.left && pair.left.type === 'del' && after(pair.left, 4)}
          {after(pair.right, 4)}
        </Fragment>
      );
    });

  const cols = mode === 'split' ? 4 : 3;
  const body = diff.segments.map((seg) => {
    if (seg.kind === 'gap') {
      if (expanded.includes(seg.id))
        return (
          <Fragment key={seg.id}>
            {mode === 'split' ? splitRows(seg.rows) : seg.rows.map(unifiedRow)}
          </Fragment>
        );
      return (
        <tr key={seg.id} className={s.gapRow}>
          <td colSpan={cols}>
            <button type="button" onClick={() => setExpanded([...expanded, seg.id])}>
              <span aria-hidden="true">
                {seg.at === 'top' ? '↑' : seg.at === 'end' ? '↓' : '↕'}
              </span>{' '}
              Expand {seg.rows.length} unchanged {seg.rows.length === 1 ? 'line' : 'lines'}
            </button>
          </td>
        </tr>
      );
    }
    return (
      <Fragment key={seg.id}>
        <tr className={s.hunkRow}>
          <td colSpan={mode === 'split' ? 1 : 2} className={s.hunkGutter} aria-hidden="true">
            <Icon.unified />
          </td>
          <td colSpan={mode === 'split' ? 3 : 1}>
            <code>{seg.header}</code>
            {seg.context && <span className={s.hunkCtx}>{seg.context}</span>}
          </td>
        </tr>
        {mode === 'split' ? splitRows(seg.rows) : seg.rows.map(unifiedRow)}
      </Fragment>
    );
  });

  const bodyId = `${dom}-body`;
  const lines = file.text.split('\n').length;

  return (
    <section className={s.file} id={dom} data-viewed={viewed || undefined} aria-label={file.path}>
      <header className={s.fileHead}>
        <button
          type="button"
          className={s.fileToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className={s.chev} data-open={open || undefined}>
            <Icon.chevron />
          </span>
          <span className={s.sr}>{open ? 'Collapse' : 'Expand'} </span>
        </button>
        <span
          className={s.fileStatus}
          data-status={file.status}
          title={file.status === 'added' ? 'Added' : 'Modified'}
        >
          {file.status === 'added' ? 'A' : 'M'}
        </span>
        <span className={s.filePath}>
          {file.path.includes('/') && (
            <span className={s.muted}>{file.path.slice(0, file.path.lastIndexOf('/') + 1)}</span>
          )}
          {file.path.split('/').pop()}
        </span>
        <CopyButton text={file.path} label={`Copy the path ${file.path}`} />
        <span className={s.fileStat}>
          <span className={s.addN}>+{diff.additions}</span>
          <span className={s.delN}>−{diff.deletions}</span>
          <DiffBlocks additions={diff.additions} deletions={diff.deletions} />
        </span>
        <span className={s.fileTools}>
          {file.rich && (
            <span className={s.seg} role="group" aria-label="Show as">
              <button type="button" aria-pressed={!rich} onClick={() => setRich(false)}>
                Source
              </button>
              <button type="button" aria-pressed={rich} onClick={() => setRich(true)}>
                Rendered
              </button>
            </span>
          )}
          <label className={s.viewed}>
            <input
              type="checkbox"
              checked={viewed}
              onChange={() => {
                toggleViewed(file.path);
                onViewed();
              }}
            />
            <span className={s.check} aria-hidden="true">
              <Icon.check />
            </span>
            Viewed
          </label>
        </span>
      </header>

      <div id={bodyId} hidden={!open}>
        {!loaded ? (
          <div className={s.loadDiff}>
            <p>
              <b>Generated file, folded by default.</b> {file.generated} {lines} lines.
            </p>
            <button type="button" className={cx(s.btn, s.btnSmall)} onClick={() => setLoaded(true)}>
              Load diff
            </button>
          </div>
        ) : rich ? (
          <div className={s.rich}>
            {file.lang === 'csv' ? <CsvTable text={file.text} /> : <Markdown text={file.text} />}
          </div>
        ) : (
          <div
            className={s.diffScroll}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onBlur={() => setCursor(-1)}
            aria-label={`Diff of ${file.path}. Arrow keys or j and k move between lines; Enter adds a comment.`}
            data-wrap={wrap || undefined}
          >
            <table className={s.diff} data-mode={mode}>
              {mode === 'split' ? (
                <colgroup>
                  <col className={s.colNum} />
                  <col />
                  <col className={s.colNum} />
                  <col />
                </colgroup>
              ) : (
                <colgroup>
                  <col className={s.colNum} />
                  <col className={s.colNum} />
                  <col />
                </colgroup>
              )}
              <tbody>{body}</tbody>
            </table>
            <p className={s.sr} aria-live="polite">
              {announce}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function CsvTable({ text }: { text: string }) {
  const [head, ...rows] = text.split('\n').map((l) => csvCells(l).map(csvValue));
  return (
    <div className={s.csvWrap}>
      <table className={s.csv}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((cell, i) => (
                <td key={i}>
                  {i === r.length - 1
                    ? cell.split('; ').map((f) => (
                        <span key={f} className={s.fig}>
                          {f}
                        </span>
                      ))
                    : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ the tab */

export default function Files() {
  const pr = usePR();
  const entries = diffsFor(pr.applied);
  const narrow = useNarrow();
  const [view, setView] = useState<'unified' | 'split'>('unified');
  const [wrap, setWrap] = useState(true);
  const [showTree, setShowTree] = useState(true);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState(entries[0].file.path);
  const [reviewOpen, setReviewOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  const mode = narrow ? 'unified' : view;
  const sum = totals(entries);

  const isOpen = (path: string) => openMap[path] ?? !pr.viewed.includes(path);

  // The file at the top of the screen is the current one in the tree.
  useEffect(() => {
    const els = entries
      .map((e) => document.getElementById(fileDom(e.file.path)))
      .filter((el): el is HTMLElement => Boolean(el));
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (list) => {
        for (const entry of list) seen.set(entry.target.id, entry.isIntersecting);
        const first = entries.find((e) => seen.get(fileDom(e.file.path)));
        if (first) setCurrent(first.file.path);
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [entries]);

  useEffect(() => {
    if (!reviewOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setReviewOpen(false);
    const onDown = (e: PointerEvent) => {
      if (pop.current && !pop.current.contains(e.target as Node)) setReviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [reviewOpen]);

  const jump = (path: string) => {
    setOpenMap((m) => ({ ...m, [path]: true }));
    setCurrent(path);
    window.setTimeout(
      () =>
        document
          .getElementById(fileDom(path))
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      30,
    );
  };

  const viewedCount = entries.filter((e) => pr.viewed.includes(e.file.path)).length;

  return (
    <div className={s.filesTab} data-tree={showTree || undefined}>
      <div className={s.filesBar}>
        <button
          type="button"
          className={cx(s.iconBtn, s.treeToggle)}
          aria-pressed={showTree}
          onClick={() => setShowTree(!showTree)}
          aria-label="Show the file tree"
          title="File tree"
        >
          <Icon.sidebar />
        </button>
        <span className={s.filesCount}>
          <b>{entries.length}</b> files · <span className={s.addN}>+{sum.additions}</span>{' '}
          <span className={s.delN}>−{sum.deletions}</span>
        </span>
        <span className={s.viewedMeter} title={`${viewedCount} of ${entries.length} files viewed`}>
          <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
            <circle cx={8} cy={8} r={6} className={s.meterTrack} />
            <circle
              cx={8}
              cy={8}
              r={6}
              className={s.meterFill}
              strokeDasharray={`${(viewedCount / entries.length) * 37.7} 37.7`}
            />
          </svg>
          {viewedCount} / {entries.length} viewed
        </span>
        <label className={s.jump}>
          <span className={s.sr}>Jump to file</span>
          <select value={current} onChange={(e) => jump(e.target.value)}>
            {entries.map((e) => (
              <option key={e.file.path} value={e.file.path}>
                {e.file.path}
              </option>
            ))}
          </select>
        </label>
        <span className={s.barSpacer} />
        <span className={s.seg} role="group" aria-label="Diff view">
          <button
            type="button"
            aria-pressed={mode === 'unified'}
            onClick={() => setView('unified')}
          >
            <Icon.unified /> Unified
          </button>
          <button
            type="button"
            aria-pressed={mode === 'split'}
            onClick={() => setView('split')}
            disabled={narrow}
            title={narrow ? 'Split view needs a wider screen' : undefined}
          >
            <Icon.split /> Split
          </button>
        </span>
        <button
          type="button"
          className={cx(s.btn, s.btnGhost, s.wrapBtn)}
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
          title="Wrap long lines"
        >
          <Icon.wrap /> <span>Wrap</span>
        </button>
        <div className={s.reviewPop} ref={pop}>
          <button
            type="button"
            className={cx(s.btn, s.btnPrimary)}
            aria-expanded={reviewOpen}
            aria-haspopup="dialog"
            onClick={() => setReviewOpen(!reviewOpen)}
            disabled={Boolean(pr.merged)}
          >
            {pr.pending.length ? `Finish your review (${pr.pending.length})` : 'Review changes'}{' '}
            <Icon.down />
          </button>
          {reviewOpen && (
            <div className={s.popover} role="dialog" aria-label="Finish your review">
              <ReviewForm compact onDone={() => setReviewOpen(false)} />
            </div>
          )}
        </div>
      </div>

      <div className={s.filesBody}>
        {showTree && (
          <aside className={s.treeCol}>
            <Tree entries={entries} current={current} onJump={jump} />
            <p className={s.treeHint}>
              Hover a line and press <b>+</b>, or focus a diff and use <kbd>j</kbd> <kbd>k</kbd> and{' '}
              <kbd>Enter</kbd>, to comment on it.
            </p>
          </aside>
        )}
        <div className={s.fileList}>
          {entries.map((e) => (
            <FileView
              key={e.file.path}
              entry={e}
              mode={mode}
              wrap={wrap}
              open={isOpen(e.file.path)}
              viewed={pr.viewed.includes(e.file.path)}
              onToggle={() => setOpenMap((m) => ({ ...m, [e.file.path]: !isOpen(e.file.path) }))}
              onViewed={() =>
                setOpenMap((m) => {
                  const next = { ...m };
                  delete next[e.file.path];
                  return next;
                })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
