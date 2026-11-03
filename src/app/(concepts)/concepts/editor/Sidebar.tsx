'use client';

// The side bar's views. Explorer: the repository as a tree you can walk with the keyboard, with
// git and problem decorations, plus the active file's outline and timeline. Search: a real
// search across every file in the working copy, with case, whole word, regex and an include
// filter, that jumps to each match. Source Control: the changes you made, a commit box, and the
// history, every commit dated from the facts.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { emit, onUi } from './commands';
import { findAll, findRegex } from './CodeView';
import { FileIcon, Icon, SymIcon } from './icons';
import { db } from '../_shared/data';
import {
  BRANCH,
  REPO,
  TOUCHED,
  TREE,
  agoOf,
  dateOf,
  longDateOf,
  type Commit,
  type TreeNode,
} from './repo';
import {
  PATHS,
  activeTab,
  allDiagnostics,
  changedPaths,
  commitChanges,
  discard,
  dirtyPaths,
  get,
  liveBlame,
  openFile,
  saveAll,
  set,
  useWb,
  type SearchState,
} from './store';
import { langOf, symbolPath, symbolsOf, tokenize, type Sym } from './syntax';
import { useMac } from './Views';
import s from './editor.module.scss';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

function Section({
  title,
  open,
  onToggle,
  actions,
  children,
  grow,
  desktop,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  grow?: boolean;
  desktop?: boolean;
}) {
  return (
    <section className={cx(s.section, grow && open && s.sectionGrow, desktop && s.phoneHide)}>
      <header className={s.sectionHead}>
        <button type="button" aria-expanded={open} onClick={onToggle}>
          <span className={s.chev} data-open={open || undefined}>
            <Icon.chevron />
          </span>
          {title}
        </button>
        {open && actions && <span className={s.sectionActions}>{actions}</span>}
      </header>
      {open && <div className={s.sectionBody}>{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ explorer */

interface Row {
  node: TreeNode;
  depth: number;
}

function flatten(node: TreeNode, expanded: Record<string, boolean>, depth = 0, out: Row[] = []) {
  for (const child of node.children) {
    out.push({ node: child, depth });
    if (child.dir && expanded[child.path]) flatten(child, expanded, depth + 1, out);
  }
  return out;
}

function Explorer() {
  const expanded = useWb((st) => st.expanded);
  const buffers = useWb((st) => st.buffers);
  const saved = useWb((st) => st.saved);
  const head = useWb((st) => st.head);
  const groups = useWb((st) => st.groups);
  const activeGroup = useWb((st) => st.activeGroup);
  const outlineOpen = useWb((st) => st.outline);
  const timelineOpen = useWb((st) => st.timeline);
  const [rootOpen, setRootOpen] = useState(true);
  const [focus, setFocus] = useState(0);
  const tree = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => flatten(TREE, expanded), [expanded]);
  const diags = allDiagnostics(buffers);
  const active = activeTab({ ...get(), groups, activeGroup });
  const activePath = active && active.mode !== 'shortcuts' ? active.path : null;

  useEffect(
    () =>
      onUi('focus-explorer', () =>
        (tree.current?.querySelector('[tabindex="0"]') as HTMLElement | null)?.focus(),
      ),
    [],
  );

  const toggle = (path: string, open?: boolean) =>
    set((st) => ({ expanded: { ...st.expanded, [path]: open ?? !st.expanded[path] } }));

  const status = (path: string) => {
    const modified = saved[path] !== head[path];
    const d = diags[path] ?? [];
    const errors = d.filter((x) => x.severity === 'error').length;
    const warnings = d.length - errors;
    return { modified, dirty: buffers[path] !== saved[path], errors, warnings };
  };
  const dirStatus = (path: string) => {
    const inside = PATHS.filter((p) => p.startsWith(`${path}/`)).map(status);
    return {
      modified: inside.some((x) => x.modified),
      errors: inside.reduce((a, x) => a + x.errors, 0),
      warnings: inside.reduce((a, x) => a + x.warnings, 0),
    };
  };

  const onKey = (e: KeyboardEvent, i: number) => {
    const row = rows[i];
    const focusRow = (n: number) => {
      const next = Math.max(0, Math.min(rows.length - 1, n));
      setFocus(next);
      (tree.current?.querySelector(`[data-row="${next}"]`) as HTMLElement | null)?.focus();
    };
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(i - 1);
    } else if (e.key === 'Home') focusRow(0);
    else if (e.key === 'End') focusRow(rows.length - 1);
    else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (row.node.dir && !expanded[row.node.path]) toggle(row.node.path, true);
      else if (row.node.dir) focusRow(i + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (row.node.dir && expanded[row.node.path]) toggle(row.node.path, false);
      else {
        const parent = row.node.path.split('/').slice(0, -1).join('/');
        const at = rows.findIndex((r) => r.node.path === parent);
        if (at >= 0) focusRow(at);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (row.node.dir) toggle(row.node.path);
      else {
        openFile(row.node.path);
        emit('focus-editor');
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      if (row.node.dir) toggle(row.node.path);
      else openFile(row.node.path, { preview: true, focus: false });
    }
  };

  return (
    <div className={s.explorer}>
      <Section
        title={REPO.toUpperCase()}
        open={rootOpen}
        onToggle={() => setRootOpen((o) => !o)}
        grow
        actions={
          <button
            type="button"
            className={s.iconBtn}
            title="Collapse Folders in Explorer"
            aria-label="Collapse folders"
            onClick={() => set({ expanded: {} })}
          >
            <Icon.collapse />
          </button>
        }
      >
        <div ref={tree} className={s.tree} role="tree" aria-label="Files">
          {rows.map((r, i) => {
            const st = r.node.dir ? dirStatus(r.node.path) : status(r.node.path);
            const open = !!expanded[r.node.path];
            const fileSt = st as ReturnType<typeof status>;
            return (
              <div
                key={r.node.path}
                data-row={i}
                role="treeitem"
                aria-level={r.depth + 1}
                aria-expanded={r.node.dir ? open : undefined}
                aria-selected={r.node.path === activePath}
                tabIndex={i === focus ? 0 : -1}
                className={s.treeRow}
                data-active={r.node.path === activePath || undefined}
                data-git={st.modified ? 'modified' : undefined}
                data-problem={st.errors ? 'error' : st.warnings ? 'warning' : undefined}
                style={{ '--depth': r.depth } as React.CSSProperties}
                onFocus={() => setFocus(i)}
                onClick={() =>
                  r.node.dir
                    ? toggle(r.node.path)
                    : openFile(r.node.path, { preview: true, focus: false })
                }
                onDoubleClick={() => !r.node.dir && openFile(r.node.path)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span className={s.indent} aria-hidden="true" />
                {r.node.dir ? (
                  <span className={s.chev} data-open={open || undefined}>
                    <Icon.chevron />
                  </span>
                ) : (
                  <FileIcon path={r.node.path} />
                )}
                <span className={s.treeName}>{r.node.name}</span>
                <span className={s.treeDeco}>
                  {!r.node.dir && fileSt.dirty && (
                    <span className={s.dirtyMark} title="Unsaved changes" />
                  )}
                  {(st.errors || st.warnings) > 0 && (
                    <span className={s.problemCount}>{st.errors || st.warnings}</span>
                  )}
                  {st.modified &&
                    (r.node.dir ? (
                      <span className={s.gitDot} title="Contains changes" />
                    ) : (
                      <span className={s.gitBadge} title="Modified">
                        M
                      </span>
                    ))}
                </span>
              </div>
            );
          })}
        </div>
      </Section>
      <Section
        title="OUTLINE"
        open={outlineOpen}
        onToggle={() => set((st) => ({ outline: !st.outline }))}
        grow
        desktop
      >
        {activePath ? (
          <Outline path={activePath} />
        ) : (
          <p className={s.emptyNote}>The active editor cannot provide outline information.</p>
        )}
      </Section>
      <Section
        title="TIMELINE"
        open={timelineOpen}
        onToggle={() => set((st) => ({ timeline: !st.timeline }))}
        grow
        desktop
      >
        {activePath ? (
          <Timeline path={activePath} />
        ) : (
          <p className={s.emptyNote}>The active editor cannot provide timeline information.</p>
        )}
      </Section>
    </div>
  );
}

function SymbolTree({
  syms,
  path,
  current,
  depth = 0,
}: {
  syms: Sym[];
  path: string;
  current: Sym[];
  depth?: number;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <>
      {syms.map((sym, i) => {
        const key = `${sym.line}:${sym.col}:${i}`;
        const open = sym.children.length > 0 && !(closed[key] ?? depth > 0);
        return (
          <div key={key} role="none">
            <button
              type="button"
              className={s.symRow}
              role="treeitem"
              aria-selected={current[current.length - 1] === sym}
              aria-level={depth + 1}
              aria-expanded={sym.children.length ? open : undefined}
              data-current={current.includes(sym) || undefined}
              style={{ '--depth': depth } as React.CSSProperties}
              onClick={() => openFile(path, { line: sym.line, col: sym.col })}
            >
              <span className={s.indent} aria-hidden="true" />
              <span
                className={s.chev}
                data-open={open || undefined}
                data-empty={!sym.children.length || undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  setClosed((c) => ({ ...c, [key]: open }));
                }}
                aria-hidden="true"
              >
                <Icon.chevron />
              </span>
              <SymIcon kind={sym.kind} />
              <span className={s.treeName}>
                {sym.name || (sym.kind === 'object' ? '{}' : '[]')}
              </span>
              {sym.detail && <span className={s.symDetail}>{sym.detail}</span>}
            </button>
            {open && (
              <SymbolTree syms={sym.children} path={path} current={current} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}

function Outline({ path }: { path: string }) {
  const text = useWb((st) => st.buffers[path]);
  const line = useWb((st) => st.cursor[path]?.line ?? 0);
  const lang = langOf(path);
  const syms = useMemo(() => symbolsOf(text, lang, tokenize(text, lang)), [text, lang]);
  const current = symbolPath(syms, line);
  if (!syms.length)
    return <p className={s.emptyNote}>No symbols found in {path.split('/').pop()}.</p>;
  return (
    <div role="tree" aria-label="Outline" className={s.tree}>
      <SymbolTree syms={syms} path={path} current={current} />
    </div>
  );
}

/** The first run of lines a commit wrote in a file. */
function runOf(owners: string[], id: string) {
  const start = owners.indexOf(id);
  let end = start;
  while (end + 1 < owners.length && owners[end + 1] === id) end++;
  return [start, end] as const;
}

function Timeline({ path }: { path: string }) {
  const commits = useWb((st) => st.commits);
  const buffers = useWb((st) => st.buffers);
  const owners = liveBlame({ ...get(), buffers }, path);
  const ids = new Set(owners);
  const list = commits.filter((c) => ids.has(c.id));
  return (
    <ol className={s.timeline}>
      {owners.includes('0000000') && (
        <li>
          <span className={s.tlDot} data-you />
          <span className={s.treeName}>Uncommitted changes</span>
          <span className={s.dim}>now</span>
        </li>
      )}
      {list.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            title={`${c.subject}\n${longDateOf(c)}`}
            onClick={() => {
              const [a, b] = runOf(owners, c.id);
              openFile(path, {
                line: a,
                col: 0,
                endLine: b,
                endCol: buffers[path].split('\n')[b].length,
              });
            }}
          >
            <span className={s.tlDot} />
            <span className={s.treeName}>{c.subject}</span>
            <span className={s.dim}>{agoOf(c)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ search */

function globToRe(glob: string) {
  return new RegExp(
    `(^|/)${glob
      .trim()
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '§')
      .replace(/\*/g, '[^/]*')
      .replace(/§/g, '.*')
      .replace(/\?/g, '.')}($|/)`,
  );
}

function SearchView() {
  const search = useWb((st) => st.search);
  const buffers = useWb((st) => st.buffers);
  const [showInclude, setShowInclude] = useState(!!search.include);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => onUi('focus-search', () => input.current?.select()), []);

  const update = (patch: Partial<SearchState>) =>
    set((st) => ({ search: { ...st.search, ...patch } }));
  const re = useMemo(
    () =>
      findRegex({
        query: search.query,
        matchCase: search.matchCase,
        wholeWord: search.wholeWord,
        regex: search.regex,
      }),
    [search.query, search.matchCase, search.wholeWord, search.regex],
  );
  const invalid = !!search.query && search.regex && !re;
  const results = useMemo(() => {
    if (!re) return [];
    const globs = search.include
      .split(',')
      .filter((g) => g.trim())
      .map(globToRe);
    return PATHS.filter((p) => !globs.length || globs.some((g) => g.test(p)))
      .map((path) => {
        const lines = buffers[path].split('\n');
        return { path, lines, matches: findAll(lines, re) };
      })
      .filter((r) => r.matches.length);
  }, [re, buffers, search.include]);
  const total = results.reduce((n, r) => n + r.matches.length, 0);

  return (
    <div className={s.searchView}>
      <div className={s.searchInputs}>
        <div className={s.inputRow} data-invalid={invalid || undefined}>
          <input
            ref={input}
            className={s.field}
            value={search.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Search"
            aria-label="Search across files"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault();
                (
                  document.querySelector(
                    `.${s.searchResults} button[data-match]`,
                  ) as HTMLElement | null
                )?.focus();
              }
            }}
          />
          <span className={s.inputToggles}>
            <button
              type="button"
              className={s.toggle}
              aria-pressed={search.matchCase}
              title="Match Case (Alt+C)"
              aria-label="Match case"
              onClick={() => update({ matchCase: !search.matchCase })}
            >
              <Icon.caseSensitive />
            </button>
            <button
              type="button"
              className={s.toggle}
              aria-pressed={search.wholeWord}
              title="Match Whole Word (Alt+W)"
              aria-label="Match whole word"
              onClick={() => update({ wholeWord: !search.wholeWord })}
            >
              <Icon.wholeWord />
            </button>
            <button
              type="button"
              className={s.toggle}
              aria-pressed={search.regex}
              title="Use Regular Expression (Alt+R)"
              aria-label="Use regular expression"
              onClick={() => update({ regex: !search.regex })}
            >
              <Icon.regex />
            </button>
          </span>
        </div>
        <button
          type="button"
          className={s.moreToggle}
          aria-expanded={showInclude}
          onClick={() => setShowInclude((v) => !v)}
          title="Toggle Search Details"
        >
          <Icon.more />
        </button>
        {showInclude && (
          <label className={s.includeRow}>
            <span>files to include</span>
            <input
              className={s.field}
              value={search.include}
              onChange={(e) => update({ include: e.target.value })}
              placeholder="e.g. roles/*.md, *.json"
              aria-label="Files to include"
            />
          </label>
        )}
      </div>
      {invalid && <p className={s.searchMessage}>The regular expression is not valid.</p>}
      {search.query && !invalid && (
        <p className={s.searchMessage} aria-live="polite">
          {total
            ? `${total} result${total === 1 ? '' : 's'} in ${results.length} file${results.length === 1 ? '' : 's'}`
            : 'No results found. Review your settings for configured exclusions.'}
        </p>
      )}
      {!search.query && (
        <div className={s.searchHints}>
          <p className={s.dim}>Search every file in the repository. Try:</p>
          {HINTS.map((h) => (
            <button
              key={h}
              type="button"
              className={s.chip}
              onClick={() => update({ query: h, regex: h.includes('\\') || h.startsWith('^') })}
            >
              {h}
            </button>
          ))}
        </div>
      )}
      <div className={s.searchResults} role="tree" aria-label="Search results">
        {results.map((r) => {
          const open = !collapsed[r.path];
          return (
            <div key={r.path} role="none">
              <button
                type="button"
                className={s.resultFile}
                role="treeitem"
                aria-selected={false}
                aria-expanded={open}
                onClick={() => setCollapsed((c) => ({ ...c, [r.path]: open }))}
              >
                <span className={s.chev} data-open={open || undefined}>
                  <Icon.chevron />
                </span>
                <FileIcon path={r.path} />
                <span className={s.treeName}>{r.path.split('/').pop()}</span>
                <span className={s.dim}>{r.path.split('/').slice(0, -1).join('/')}</span>
                <span className={s.badge}>{r.matches.length}</span>
              </button>
              {open &&
                r.matches.map((m, k) => {
                  const line = r.lines[m.line];
                  const from = Math.max(0, m.start - 10);
                  return (
                    <button
                      key={k}
                      type="button"
                      data-match
                      role="treeitem"
                      aria-selected={false}
                      className={s.resultLine}
                      title={`${r.path}:${m.line + 1}`}
                      onClick={() =>
                        openFile(r.path, {
                          preview: true,
                          line: m.line,
                          col: m.start,
                          endLine: m.line,
                          endCol: m.end,
                          focus: false,
                        })
                      }
                      onDoubleClick={() =>
                        openFile(r.path, {
                          line: m.line,
                          col: m.start,
                          endLine: m.line,
                          endCol: m.end,
                        })
                      }
                      onKeyDown={(e) => {
                        const all = [
                          ...document.querySelectorAll<HTMLElement>(
                            `.${s.searchResults} button[data-match]`,
                          ),
                        ];
                        const at = all.indexOf(e.currentTarget);
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          all[at + 1]?.focus();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          if (at === 0) input.current?.focus();
                          else all[at - 1]?.focus();
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          openFile(r.path, {
                            line: m.line,
                            col: m.start,
                            endLine: m.line,
                            endCol: m.end,
                          });
                        }
                      }}
                    >
                      <span className={s.resultText}>
                        {from > 0 && '…'}
                        {line.slice(from, m.start).trimStart()}
                        <mark>{line.slice(m.start, m.end)}</mark>
                        {line.slice(m.end, m.end + 80)}
                      </span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Search suggestions: a framework and a chip from the facts, and two regular expressions. */
const HINTS = [
  db.products.neurobuild.tech[1],
  db.devices.attendumReader.chip,
  '^## ',
  'from: \\d{4}',
];

/* ------------------------------------------------------------------ source control */

function SourceControl() {
  const buffers = useWb((st) => st.buffers);
  const saved = useWb((st) => st.saved);
  const head = useWb((st) => st.head);
  const commits = useWb((st) => st.commits);
  const message = useWb((st) => st.commitMessage);
  const [changesOpen, setChangesOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const mac = useMac();
  const box = useRef<HTMLTextAreaElement>(null);
  const historyEl = useRef<HTMLOListElement>(null);

  const state = { ...get(), buffers, saved, head };
  const changed = changedPaths(state);
  const unsaved = dirtyPaths(state);

  useEffect(() => onUi('focus-scm', () => box.current?.focus()), []);
  useEffect(() => {
    const onSelect = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setExpanded(id);
      setHistoryOpen(true);
      window.setTimeout(
        () =>
          historyEl.current
            ?.querySelector(`[data-commit="${id}"]`)
            ?.scrollIntoView({ block: 'center' }),
        50,
      );
    };
    window.addEventListener('scm-select', onSelect);
    return () => window.removeEventListener('scm-select', onSelect);
  }, []);

  const commit = () => {
    if (!changed.length) return;
    const c = commitChanges(message || `Update ${changed.join(', ')}`);
    if (c) setExpanded(c.id);
  };

  const filesOf = (c: Commit) => {
    const fromHead = TOUCHED[c.id];
    if (fromHead) return fromHead;
    const blame = get().blame;
    return PATHS.filter((p) => blame[p].includes(c.id));
  };

  return (
    <div className={s.scm}>
      <div className={s.commitBox}>
        <textarea
          ref={box}
          className={s.field}
          rows={2}
          value={message}
          placeholder={`Message (${mac ? '⌘' : 'Ctrl+'}Enter to commit on "${BRANCH}")`}
          aria-label="Commit message"
          onChange={(e) => set({ commitMessage: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button type="button" className={s.primary} disabled={!changed.length} onClick={commit}>
          <Icon.check /> Commit
        </button>
        {unsaved.length > 0 && (
          <p className={s.scmNote}>
            {unsaved.length} unsaved file{unsaved.length === 1 ? '' : 's'}. Git only sees saved
            changes.{' '}
            <button type="button" className={s.linkBtn} onClick={saveAll}>
              Save all
            </button>
          </p>
        )}
        {!changed.length && !unsaved.length && (
          <p className={s.scmNote}>
            No changes. Edit any file, save it, and it shows up here, with blame and the gutter
            tracking it.
          </p>
        )}
      </div>
      <Section
        title={`CHANGES${changed.length ? ` ${changed.length}` : ''}`}
        open={changesOpen}
        onToggle={() => setChangesOpen((o) => !o)}
        actions={
          changed.length ? (
            <button
              type="button"
              className={s.iconBtn}
              title="Discard All Changes"
              aria-label="Discard all changes"
              onClick={() => discard(changed)}
            >
              <Icon.discard />
            </button>
          ) : null
        }
      >
        <ul className={s.changes}>
          {changed.map((p) => (
            <li key={p}>
              <button
                type="button"
                className={s.changeRow}
                onClick={() => openFile(p, { mode: 'diff' })}
                title={`${p}: open changes`}
              >
                <FileIcon path={p} />
                <span className={s.treeName}>{p.split('/').pop()}</span>
                <span className={s.dim}>{p.split('/').slice(0, -1).join('/')}</span>
              </button>
              <span className={s.rowActions}>
                <button
                  type="button"
                  className={s.iconBtn}
                  title="Open File"
                  aria-label={`Open ${p}`}
                  onClick={() => openFile(p)}
                >
                  <Icon.page />
                </button>
                <button
                  type="button"
                  className={s.iconBtn}
                  title="Discard Changes"
                  aria-label={`Discard changes in ${p}`}
                  onClick={() => discard([p])}
                >
                  <Icon.discard />
                </button>
              </span>
              <span className={s.gitBadge}>M</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="GRAPH" open={historyOpen} onToggle={() => setHistoryOpen((o) => !o)} grow>
        <ol ref={historyEl} className={s.graph} aria-label="Commit history">
          {commits.map((c, i) => {
            const open = expanded === c.id;
            const files = open ? filesOf(c) : [];
            return (
              <li
                key={c.id}
                data-commit={c.id}
                data-open={open || undefined}
                data-you={c.time ? true : undefined}
              >
                <button
                  type="button"
                  className={s.graphRow}
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : c.id)}
                  title={`${c.subject}\n${c.author}, ${longDateOf(c)}\n${c.id}`}
                >
                  <span
                    className={s.graphLane}
                    data-first={i === 0 || undefined}
                    data-last={i === commits.length - 1 || undefined}
                    aria-hidden="true"
                  />
                  <span className={s.graphSubject}>{c.subject}</span>
                  {i === 0 && <span className={s.refBadge}>{BRANCH}</span>}
                  <span className={s.graphDate}>{dateOf(c)}</span>
                </button>
                {open && (
                  <div className={s.graphDetail}>
                    <p>
                      <b>{c.author}</b> · {agoOf(c)} · <code>{c.id}</code>
                    </p>
                    {c.body && <p className={s.dim}>{c.body}</p>}
                    <ul>
                      {files.map((p) => (
                        <li key={p}>
                          <button
                            type="button"
                            className={s.changeRow}
                            onClick={() => {
                              const owners = get().blame[p];
                              const [a, b] = runOf(owners, c.id);
                              const lines = get().head[p].split('\n');
                              openFile(
                                p,
                                a >= 0
                                  ? { line: a, col: 0, endLine: b, endCol: lines[b]?.length ?? 0 }
                                  : {},
                              );
                            }}
                          >
                            <FileIcon path={p} />
                            <span className={s.treeName}>{p.split('/').pop()}</span>
                            <span className={s.dim}>{p.split('/').slice(0, -1).join('/')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ the side bar */

const TITLES = { explorer: 'Explorer', search: 'Search', scm: 'Source Control' };

export default function Sidebar() {
  const view = useWb((st) => st.view);
  return (
    <aside className={s.sidebar} aria-label={TITLES[view]}>
      <header className={s.sidebarHead}>
        <h2>{TITLES[view]}</h2>
        {view === 'search' && (
          <button
            type="button"
            className={s.iconBtn}
            title="Clear Search Results"
            aria-label="Clear search results"
            onClick={() => set((st) => ({ search: { ...st.search, query: '' } }))}
          >
            <Icon.close />
          </button>
        )}
      </header>
      {view === 'explorer' && <Explorer />}
      {view === 'search' && <SearchView />}
      {view === 'scm' && <SourceControl />}
    </aside>
  );
}
