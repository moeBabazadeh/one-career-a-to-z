'use client';

// The notebook app: header with menus and toolbar, a table of contents built from the markdown
// headings, the cells, and a status bar. Command mode and edit mode work as in the notebooks
// people know: Esc and Enter switch, A/B insert, D,D deletes, M/Y change type, Shift+Enter runs.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { db, fmt } from '../_shared/data';
import Cell from './Cell';
import { I } from './icons';
import { headings } from './Markdown';
import MenuBar, { type Menu } from './Menus';
import Reader from './Reader';
import {
  checkpoint,
  clearOutputs,
  closeDialog,
  copy,
  dismissToast,
  getNotebook,
  insert,
  interrupt,
  move,
  openDialog,
  paste,
  remove,
  resetNotebook,
  restart,
  restore,
  runAbove,
  runAll,
  runAndAdvance,
  runAndInsert,
  runBelow,
  runInPlace,
  script,
  select,
  setMode,
  setReader,
  setType,
  step,
  toggleLineNumbers,
  toggleOutput,
  toggleToc,
  undoDelete,
  useNotebook,
  type CellState,
  type NotebookState,
} from './store';
import s from './notebook.module.scss';

const KERNEL = 'Python 3 (subset)';
const FILE = 'career.nb';

/** Focus the selected cell (command mode) and keep it in view. */
function focusActive() {
  requestAnimationFrame(() => {
    const nb = getNotebook();
    const el = document.querySelector<HTMLElement>(`[data-cell="${CSS.escape(nb.active)}"]`);
    if (!el) return;
    if (nb.mode === 'command') el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  });
}

function placeCaret(id: string, where: 'start' | 'end') {
  requestAnimationFrame(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      `[data-cell="${CSS.escape(id)}"] textarea`,
    );
    if (!ta) return;
    const pos = where === 'start' ? 0 : ta.value.length;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(pos, pos);
    ta.scrollIntoView({ block: 'nearest' });
  });
}

function download() {
  const blob = new Blob([script()], { type: 'text/x-python' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = FILE.replace(/\.nb$/, '.py');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------------------------------------------ table of contents */

interface Entry {
  cell: string;
  level: number;
  text: string;
  num: string;
  busy: boolean;
  failed: boolean;
}

function contents(cells: CellState[]): Entry[] {
  const out: Entry[] = [];
  const counters = [0, 0, 0, 0, 0, 0];
  cells.forEach((c) => {
    if (c.type !== 'markdown') {
      const last = out[out.length - 1];
      if (last && c.status !== 'idle') last.busy = true;
      if (last && c.outputs.some((o) => o.t === 'error')) last.failed = true;
      return;
    }
    headings(c.source).forEach((h) => {
      let num = '';
      if (h.level > 1) {
        counters[h.level - 1]++;
        for (let k = h.level; k < 6; k++) counters[k] = 0;
        num = counters.slice(1, h.level).join('.');
      }
      out.push({ cell: c.id, level: h.level, text: h.text, num, busy: false, failed: false });
    });
  });
  return out;
}

function Toc({
  entries,
  current,
  onGo,
}: {
  entries: Entry[];
  current: string | null;
  onGo: (id: string) => void;
}) {
  return (
    <nav aria-label="Table of contents">
      <p className={s.sideTitle}>Table of contents</p>
      {entries.length ? (
        <ol className={s.toc}>
          {entries.map((e, i) => (
            <li key={`${e.cell}-${i}`} data-level={e.level}>
              <button
                type="button"
                aria-current={current === e.cell ? 'location' : undefined}
                onClick={() => onGo(e.cell)}
              >
                {e.num && <span className={s.tocNum}>{e.num}</span>}
                <span className={s.tocText}>{e.text}</span>
                {e.busy && <span className={s.spin} aria-label="running" />}
                {!e.busy && e.failed && (
                  <span className={s.tocErr} aria-label="has an error">
                    !
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className={s.sideEmpty}>Add a markdown cell with a # heading to see it here.</p>
      )}
    </nav>
  );
}

/* ------------------------------------------------------------------ dialogs */

const SHORTCUTS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Command mode (Esc)',
    rows: [
      ['Enter', 'edit the selected cell'],
      ['Shift + Enter', 'run, then select below'],
      ['Ctrl + Enter', 'run in place'],
      ['Alt + Enter', 'run, insert below'],
      ['↑ / K, ↓ / J', 'select above / below'],
      ['A / B', 'insert a cell above / below'],
      ['D, D', 'delete the cell'],
      ['Z', 'undo the last delete'],
      ['M / Y', 'make it markdown / code'],
      ['C / X / V', 'copy / cut / paste below'],
      ['Shift + V', 'paste above'],
      ['L', 'toggle line numbers'],
      ['O', 'hide or show the output'],
      ['I, I', 'interrupt the kernel'],
      ['0, 0', 'restart the kernel'],
      ['H', 'this list'],
    ],
  },
  {
    title: 'Edit mode (Enter)',
    rows: [
      ['Esc', 'back to command mode'],
      ['Shift + Enter', 'run, then select below'],
      ['Ctrl + Enter', 'run in place'],
      ['Tab', 'complete a name, or indent'],
      ['Shift + Tab', 'dedent'],
      ['Ctrl + /', 'comment or uncomment'],
      ['↑ on the first line', 'into the cell above'],
      ['↓ on the last line', 'into the cell below'],
      ['Ctrl + S', 'save a checkpoint'],
    ],
  },
];

const REFERENCE: [string, ReactNode][] = [
  ['Values', 'int (exact, any size), float, str, bool, None, list, tuple, dict, set, range'],
  [
    'Syntax',
    'assignment and unpacking, augmented assignment, if / elif / else, for and while with else, break, continue, def with defaults, *args and **kwargs, lambda, try / except / else / finally, raise, assert, del, global, import',
  ],
  [
    'Expressions',
    'arithmetic with // and **, chained comparisons, in, is, and / or / not, conditional expressions, slicing, list, set and dict comprehensions, generator expressions',
  ],
  [
    'Strings',
    'f-strings with !r and format specs ({n:,}, {x:.1f}, {s:>10}, {x=}), str.format, % formatting, and the usual methods',
  ],
  [
    'The facts',
    'profile, roles, products, devices, oss, roots, builds, skills, commits, NOW, AS_OF',
  ],
  [
    'Output',
    'print, display, table(rows, columns=None, title=None), plot.bar, plot.line, plot.timeline',
  ],
  ['Modules', 'math, statistics, collections (import them); plot is already imported'],
  ['Inspection', 'help(x), x?, dir(x), type(x), %whos, %who'],
];

function Dialogs({ dialog }: { dialog: NotebookState['dialog'] }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (dialog && !el.open) el.showModal();
    if (!dialog && el.open) el.close();
  }, [dialog]);

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="nb-dialog-title"
      onClose={() => {
        closeDialog();
        focusActive();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      {dialog === 'shortcuts' && (
        <>
          <h2 id="nb-dialog-title">Keyboard shortcuts</h2>
          <div className={s.keys}>
            {SHORTCUTS.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                <dl>
                  {g.rows.map(([k, v]) => (
                    <div key={k}>
                      <dt>
                        {k
                          .split(/( \+ |, | \/ )/)
                          .map((part, i) =>
                            /^( \+ |, | \/ )$/.test(part) ? (
                              <span key={i}>{part}</span>
                            ) : (
                              <kbd key={i}>{part}</kbd>
                            ),
                          )}
                      </dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className={s.dialogNote}>On a Mac, Cmd works wherever Ctrl is listed.</p>
          <div className={s.dialogActions}>
            <button type="button" className={s.primary} onClick={closeDialog} autoFocus>
              Close
            </button>
          </div>
        </>
      )}
      {dialog === 'reference' && (
        <>
          <h2 id="nb-dialog-title">The kernel’s language</h2>
          <p>
            A tree-walking interpreter for a subset of Python 3, written for this page: a tokenizer,
            a parser and an evaluator, with no eval anywhere. Errors come back as Python tracebacks.
          </p>
          <dl className={s.reference}>
            {REFERENCE.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className={s.dialogActions}>
            <button type="button" className={s.primary} onClick={closeDialog} autoFocus>
              Close
            </button>
          </div>
        </>
      )}
      {dialog === 'restart' && (
        <>
          <h2 id="nb-dialog-title">Restart the kernel?</h2>
          <p>
            Every variable defined by the cells will be lost. Outputs stay until you run the cells
            again.
          </p>
          <div className={s.dialogActions}>
            <button type="button" onClick={closeDialog}>
              Cancel
            </button>
            <button type="button" onClick={() => restart({ runAll: true })}>
              Restart and run all
            </button>
            <button type="button" className={s.danger} onClick={() => restart()} autoFocus>
              Restart
            </button>
          </div>
        </>
      )}
      {dialog === 'reset' && (
        <>
          <h2 id="nb-dialog-title">Reset the notebook?</h2>
          <p>
            Your edits, added cells and deletions are dropped, and the original notebook runs again
            in a fresh kernel.
          </p>
          <div className={s.dialogActions}>
            <button type="button" onClick={closeDialog}>
              Cancel
            </button>
            <button type="button" className={s.danger} onClick={resetNotebook} autoFocus>
              Reset
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ the app */

export default function Notebook() {
  const nb = useNotebook();
  const main = useRef<HTMLElement>(null);
  const chord = useRef({ key: '', at: 0 });
  const [current, setCurrent] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const entries = contents(nb.cells);
  const active = nb.cells.find((c) => c.id === nb.active);

  useEffect(() => {
    restore();
  }, []);

  // Cmd+S anywhere saves a checkpoint instead of the browser's "save page".
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        checkpoint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!nb.toast) return;
    const t = setTimeout(dismissToast, 3600);
    return () => clearTimeout(t);
  }, [nb.toast]);

  const after = () => focusActive();

  /** The page view starts at its top; leaving it returns to the selected cell. */
  const read = (on: boolean) => {
    setReader(on);
    requestAnimationFrame(() => {
      if (on) main.current?.scrollTo({ top: 0 });
      else focusActive();
    });
  };

  const go = (id: string) => {
    setDrawer(false);
    if (getNotebook().reader) setReader(false);
    select(id, 'command');
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-cell="${CSS.escape(id)}"]`);
      el?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      el?.focus({ preventScroll: true });
    });
  };

  const spy = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(spy.current);
    spy.current = requestAnimationFrame(() => {
      const box = main.current;
      if (!box) return;
      const top = box.getBoundingClientRect().top + 96;
      let id: string | null = null;
      for (const e of contents(getNotebook().cells)) {
        const el = box.querySelector<HTMLElement>(`[data-cell="${CSS.escape(e.cell)}"]`);
        if (el && el.getBoundingClientRect().top <= top) id = e.cell;
      }
      setCurrent(id ?? contents(getNotebook().cells)[0]?.cell ?? null);
    });
  };

  const twice = (key: string) => {
    const now = performance.now();
    const hit = chord.current.key === key && now - chord.current.at < 700;
    chord.current = hit ? { key: '', at: 0 } : { key, at: now };
    return hit;
  };

  /** Command-mode keys, on the cells. Edit-mode keys come through the editor (onEditorKey). */
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest('textarea, input, select, [role="menu"], [role="menubar"], dialog')) return;
    if (t.closest('button, a') && (e.key === 'Enter' || e.key === ' ')) return;
    const state = getNotebook();
    if (state.reader) return;
    const mod = e.metaKey || e.ctrlKey;
    let handled = true;
    if (e.key === 'Enter' && e.shiftKey) runAndAdvance();
    else if (e.key === 'Enter' && mod) runInPlace();
    else if (e.key === 'Enter' && e.altKey) runAndInsert();
    else if (e.key === 'Enter') select(state.active, 'edit');
    else if (mod || e.altKey) handled = false;
    else {
      switch (e.key.toLowerCase()) {
        case 'arrowup':
        case 'k':
          step(-1);
          break;
        case 'arrowdown':
        case 'j':
          step(1);
          break;
        case 'a':
          insert('above');
          break;
        case 'b':
          insert('below');
          break;
        case 'd':
          if (twice('d')) remove();
          break;
        case 'z':
          undoDelete();
          break;
        case 'm':
          setType('markdown');
          break;
        case 'y':
          setType('code');
          break;
        case 'c':
          copy();
          break;
        case 'x':
          copy(true);
          break;
        case 'v':
          paste(e.shiftKey ? 'above' : 'below');
          break;
        case 'l':
          toggleLineNumbers();
          break;
        case 'o':
          toggleOutput();
          break;
        case 'i':
          if (twice('i')) interrupt();
          break;
        case '0':
          if (twice('0')) openDialog('restart');
          break;
        case 'h':
          openDialog('shortcuts');
          break;
        default:
          handled = false;
      }
    }
    if (handled) {
      e.preventDefault();
      focusActive();
    }
  };

  /** Edit-mode keys the notebook owns: running, leaving, and arrowing across cells. */
  const onEditorKey = (
    e: KeyboardEvent<HTMLTextAreaElement>,
    at: { first: boolean; last: boolean },
  ) => {
    const mod = e.metaKey || e.ctrlKey;
    const state = getNotebook();
    if (e.key === 'Escape') {
      e.preventDefault();
      setMode('command');
      focusActive();
      return true;
    }
    if (e.key === 'Enter' && e.shiftKey && !mod) {
      e.preventDefault();
      runAndAdvance();
      focusActive();
      return true;
    }
    if (e.key === 'Enter' && mod) {
      e.preventDefault();
      runInPlace();
      focusActive();
      return true;
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      runAndInsert();
      return true;
    }
    if ((e.key === 'ArrowUp' && at.first) || (e.key === 'ArrowDown' && at.last)) {
      if (
        e.shiftKey ||
        mod ||
        e.altKey ||
        e.currentTarget.selectionStart !== e.currentTarget.selectionEnd
      )
        return false;
      const i = state.cells.findIndex((c) => c.id === state.active);
      const next = state.cells[i + (e.key === 'ArrowUp' ? -1 : 1)];
      if (!next) return false;
      e.preventDefault();
      if (next.type === 'markdown' && next.rendered) {
        select(next.id, 'command');
        focusActive();
      } else {
        select(next.id, 'edit');
        placeCaret(next.id, e.key === 'ArrowUp' ? 'end' : 'start');
      }
      return true;
    }
    return false;
  };

  const toggleContents = () => {
    if (matchMedia('(max-width: 760px)').matches) setDrawer((d) => !d);
    else toggleToc();
  };

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'Save checkpoint', keys: 'Ctrl+S', run: checkpoint },
        { label: 'Download as .py', run: download },
        'sep',
        { label: 'Read as a page', run: () => read(true) },
        'sep',
        { label: 'Reset to the original…', run: () => openDialog('reset'), disabled: !nb.edited },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo delete',
          keys: 'Z',
          run: () => (undoDelete(), after()),
          disabled: !nb.trash.length,
        },
        'sep',
        { label: 'Cut cell', keys: 'X', run: () => (copy(true), after()) },
        { label: 'Copy cell', keys: 'C', run: () => copy() },
        {
          label: 'Paste below',
          keys: 'V',
          run: () => (paste('below'), after()),
          disabled: !nb.clipboard,
        },
        { label: 'Delete cell', keys: 'D, D', run: () => (remove(), after()) },
        'sep',
        { label: 'Move up', run: () => (move(-1), after()) },
        { label: 'Move down', run: () => (move(1), after()) },
        'sep',
        { label: 'Clear this output', run: () => clearOutputs(nb.active) },
        { label: 'Clear all outputs', run: () => clearOutputs() },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Table of contents', run: toggleContents, checked: nb.toc },
        { label: 'Line numbers', keys: 'L', run: toggleLineNumbers, checked: nb.lineNumbers },
        {
          label: 'Hide this output',
          keys: 'O',
          run: () => toggleOutput(),
          checked: !!active?.outputHidden,
        },
        'sep',
        { label: 'Read as a page', run: () => read(!nb.reader), checked: nb.reader },
      ],
    },
    {
      label: 'Run',
      items: [
        {
          label: 'Run cell and select below',
          keys: 'Shift+Enter',
          run: () => (runAndAdvance(), after()),
        },
        { label: 'Run cell', keys: 'Ctrl+Enter', run: () => (runInPlace(), after()) },
        { label: 'Run cell and insert below', keys: 'Alt+Enter', run: () => runAndInsert() },
        'sep',
        { label: 'Run all above', run: runAbove },
        { label: 'Run this and all below', run: runBelow },
        { label: 'Run all', run: runAll },
      ],
    },
    {
      label: 'Kernel',
      items: [
        { label: 'Interrupt', keys: 'I, I', run: interrupt, disabled: nb.kernel !== 'busy' },
        { label: 'Restart…', keys: '0, 0', run: () => openDialog('restart') },
        { label: 'Restart and clear outputs', run: () => restart({ clear: true }) },
        { label: 'Restart and run all', run: () => restart({ runAll: true }) },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard shortcuts', keys: 'H', run: () => openDialog('shortcuts') },
        { label: 'The kernel’s language', run: () => openDialog('reference') },
      ],
    },
  ];

  const cellType = active?.type ?? 'code';
  const busyCount = nb.cells.filter((c) => c.status !== 'idle').length;
  const codeCells = nb.cells.filter((c) => c.type === 'code').length;

  return (
    <div
      className={s.root}
      data-toc={nb.toc || undefined}
      data-drawer={drawer || undefined}
      data-reader={nb.reader || undefined}
    >
      <header className={s.header}>
        <div className={s.topbar}>
          <span className={s.brand}>
            <I.logo />
            <span className={s.file}>{FILE}</span>
          </span>
          <span className={s.checkpoint}>
            Facts as of {fmt.month(db.asOf)} ·{' '}
            {nb.edited ? 'edited, saved in this browser' : 'as shipped'}
          </span>
          <span className={s.spacer} />
          <button
            type="button"
            className={s.readBtn}
            onClick={() => read(!nb.reader)}
            aria-pressed={nb.reader}
          >
            <I.page />
            <span>{nb.reader ? 'Back to the notebook' : 'Read as a page'}</span>
          </button>
          <div className={s.kernel} data-state={nb.kernel} role="status" aria-live="polite">
            <span className={s.kernelName}>{KERNEL}</span>
            <i aria-hidden="true" />
            <span className={s.visuallyHidden}>Kernel {nb.kernel}</span>
          </div>
        </div>
        <div className={s.bars}>
          <MenuBar menus={menus} />
          <div className={s.toolbar} role="toolbar" aria-label="Notebook actions">
            <button
              type="button"
              onClick={toggleContents}
              title="Table of contents"
              aria-label="Table of contents"
              aria-pressed={nb.toc}
            >
              <I.toc />
            </button>
            <span className={s.sep} />
            <button
              type="button"
              onClick={checkpoint}
              title="Save checkpoint (Ctrl+S)"
              aria-label="Save checkpoint"
            >
              <I.save />
            </button>
            <button
              type="button"
              onClick={() => (insert('below'), after())}
              title="Insert a cell below (B)"
              aria-label="Insert a cell below"
            >
              <I.plus />
            </button>
            <button
              type="button"
              onClick={() => (copy(true), after())}
              title="Cut cell (X)"
              aria-label="Cut cell"
            >
              <I.cut />
            </button>
            <button
              type="button"
              onClick={() => copy()}
              title="Copy cell (C)"
              aria-label="Copy cell"
            >
              <I.copy />
            </button>
            <button
              type="button"
              onClick={() => (paste('below'), after())}
              title="Paste below (V)"
              aria-label="Paste below"
              disabled={!nb.clipboard}
            >
              <I.paste />
            </button>
            <span className={s.sep} />
            <button
              type="button"
              className={s.runTool}
              onClick={() => (runAndAdvance(), after())}
              title="Run and select below (Shift+Enter)"
            >
              <I.run />
              <span>Run</span>
            </button>
            <button
              type="button"
              onClick={interrupt}
              title="Interrupt (I, I)"
              aria-label="Interrupt the kernel"
              disabled={nb.kernel !== 'busy'}
            >
              <I.stop />
            </button>
            <button
              type="button"
              onClick={() => openDialog('restart')}
              title="Restart the kernel (0, 0)"
              aria-label="Restart the kernel"
            >
              <I.restart />
            </button>
            <button
              type="button"
              onClick={() => restart({ runAll: true })}
              title="Restart and run all"
              aria-label="Restart and run all"
            >
              <I.runAll />
            </button>
            <span className={s.sep} />
            <label className={s.typeSelect}>
              <span className={s.visuallyHidden}>Cell type</span>
              <select
                value={cellType}
                onChange={(e) => setType(e.target.value as 'code' | 'markdown')}
              >
                <option value="code">Code</option>
                <option value="markdown">Markdown</option>
              </select>
            </label>
            <span className={s.spacer} />
            <button
              type="button"
              className={s.textTool}
              onClick={runAll}
              title="Run every cell from the top"
            >
              Run all
            </button>
            <button
              type="button"
              className={s.textTool}
              onClick={() => clearOutputs()}
              title="Clear every output"
            >
              <I.clear />
              <span>Clear outputs</span>
            </button>
            <button
              type="button"
              className={s.textTool}
              onClick={() => openDialog('reset')}
              disabled={!nb.edited}
              title="Back to the notebook as shipped"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => openDialog('shortcuts')}
              title="Keyboard shortcuts (H)"
              aria-label="Keyboard shortcuts"
            >
              <I.keyboard />
            </button>
          </div>
        </div>
      </header>

      <div className={s.body}>
        <aside className={s.side}>
          <button
            type="button"
            className={s.sideClose}
            onClick={() => setDrawer(false)}
            aria-label="Close the table of contents"
          >
            <I.close />
          </button>
          <Toc entries={entries} current={current ?? entries[0]?.cell ?? null} onGo={go} />
          <div className={s.sideFoot}>
            <p className={s.sideTitle}>Kernel</p>
            <p>
              {KERNEL} · {nb.kernel}
              <br />
              {nb.counter} executions · {codeCells} code cells
            </p>
          </div>
        </aside>
        {drawer && (
          <button
            type="button"
            className={s.scrim}
            onClick={() => setDrawer(false)}
            aria-label="Close the table of contents"
            tabIndex={-1}
          />
        )}

        <main ref={main} className={s.main} onScroll={onScroll} onKeyDown={onKeyDown}>
          {nb.reader ? (
            <Reader onBack={() => read(false)} />
          ) : (
            <div className={s.cells} data-mode={nb.mode}>
              {nb.cells.map((c, i) => (
                <Cell
                  key={c.id}
                  cell={c}
                  index={i}
                  active={c.id === nb.active}
                  mode={nb.mode}
                  lineNumbers={nb.lineNumbers}
                  jump={nb.jump && nb.jump.cell === c.id ? nb.jump : null}
                  onEditorKey={onEditorKey}
                  onAfter={after}
                />
              ))}
              <div className={s.addRow}>
                <button
                  type="button"
                  onClick={() => {
                    select(nb.cells[nb.cells.length - 1].id);
                    insert('below', 'code');
                    setMode('edit');
                  }}
                >
                  <I.plus /> Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    select(nb.cells[nb.cells.length - 1].id);
                    insert('below', 'markdown');
                    setMode('edit');
                  }}
                >
                  <I.plus /> Markdown
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className={s.status}>
        <span className={s.modeBadge} data-mode={nb.mode}>
          {nb.mode === 'edit' ? 'Edit' : 'Command'}
        </span>
        {nb.mode === 'edit' && nb.caret && (
          <span>
            Ln {nb.caret.line}, Col {nb.caret.col}
          </span>
        )}
        <span>
          {nb.cells.length} cells
          {active ? ` · ${active.type === 'code' ? 'Code' : 'Markdown'}` : ''}
        </span>
        <span>
          {KERNEL} |{' '}
          {busyCount
            ? `Busy · ${busyCount} queued`
            : nb.kernel === 'restarting'
              ? 'Restarting'
              : 'Idle'}
        </span>
        {nb.lastRun && (
          <span>
            Ran {nb.lastRun.cells} cell{nb.lastRun.cells === 1 ? '' : 's'} in{' '}
            {Math.max(1, Math.round(nb.lastRun.ms))} ms
          </span>
        )}
      </footer>

      {nb.toast && (
        <div className={s.toast} role="status" key={nb.toast.id}>
          {nb.toast.text}
          {nb.edited && nb.toast.text.startsWith('Restored') && (
            <button type="button" onClick={() => openDialog('reset')}>
              Reset
            </button>
          )}
          <button type="button" onClick={dismissToast} aria-label="Dismiss">
            <I.close />
          </button>
        </div>
      )}

      <Dialogs dialog={nb.dialog} />
    </div>
  );
}
