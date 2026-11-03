'use client';

// One cell: the In [n] prompt, the editor or rendered markdown, the active cell's toolbar and the
// outputs. The blue bar marks the selected cell in command mode; in edit mode it turns green.
import { memo, type KeyboardEvent } from 'react';
import Editor from './Editor';
import { I } from './icons';
import Markdown from './Markdown';
import Outputs from './Outputs';
import {
  duplicate,
  edit,
  insert,
  move,
  remove,
  run,
  select,
  setCaret,
  toggleOutput,
  type CellState,
  type Mode,
} from './store';
import s from './notebook.module.scss';

interface Props {
  cell: CellState;
  index: number;
  active: boolean;
  mode: Mode;
  lineNumbers: boolean;
  jump: { line: number; tick: number } | null;
  onEditorKey: (
    e: KeyboardEvent<HTMLTextAreaElement>,
    at: { first: boolean; last: boolean },
  ) => boolean;
  onAfter: () => void;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

function Cell({ cell, index, active, mode, lineNumbers, jump, onEditorKey, onAfter }: Props) {
  const isCode = cell.type === 'code';
  const editing = active && mode === 'edit';
  const busy = cell.status !== 'idle';
  const dirty = isCode && cell.ranSource !== null && cell.source !== cell.ranSource;
  const count = busy ? '*' : (cell.count ?? ' ');
  const label = isCode ? `Code cell ${index + 1}, In [${count}]` : `Markdown cell ${index + 1}`;
  const showEditor = isCode || !cell.rendered;
  const act = (fn: () => void) => () => {
    fn();
    onAfter();
  };

  return (
    <section
      data-cell={cell.id}
      data-type={cell.type}
      className={cx(
        s.cell,
        active && s.active,
        editing && s.editing,
        busy && s.busy,
        cell.errorLine !== null && s.failed,
      )}
      tabIndex={active && !editing ? 0 : -1}
      aria-label={label}
      aria-current={active || undefined}
      onMouseDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('textarea, button, a, input, select, [data-keep]')) return;
        if (!(active && editing && t.closest(`.${s.inBody}`))) select(cell.id, 'command');
      }}
      onDoubleClick={(e) => {
        if (!isCode && cell.rendered && !(e.target as HTMLElement).closest('a')) {
          select(cell.id, 'edit');
        }
      }}
    >
      <button
        type="button"
        className={s.collapser}
        onClick={act(() => toggleOutput(cell.id))}
        tabIndex={-1}
        aria-label={cell.outputHidden ? 'Show output' : 'Hide output'}
      />
      {active && (
        <div className={s.cellBar} role="toolbar" aria-label="Cell actions" data-keep>
          <button
            type="button"
            onClick={act(() => run([cell.id]))}
            title="Run this cell (Ctrl+Enter)"
            aria-label="Run this cell"
          >
            <I.run />
          </button>
          <button
            type="button"
            onClick={act(() => move(-1, cell.id))}
            title="Move up"
            aria-label="Move cell up"
          >
            <I.up />
          </button>
          <button
            type="button"
            onClick={act(() => move(1, cell.id))}
            title="Move down"
            aria-label="Move cell down"
          >
            <I.down />
          </button>
          <button
            type="button"
            onClick={act(() => duplicate(cell.id))}
            title="Duplicate"
            aria-label="Duplicate cell"
          >
            <I.duplicate />
          </button>
          <button
            type="button"
            onClick={act(() => insert('below'))}
            title="Insert below (B)"
            aria-label="Insert a cell below"
          >
            <I.plus />
          </button>
          <button
            type="button"
            onClick={act(() => remove(cell.id))}
            title="Delete (D, D)"
            aria-label="Delete cell"
          >
            <I.trash />
          </button>
        </div>
      )}
      <div className={s.inRow}>
        <div className={s.prompt}>
          {isCode && (
            <>
              <span className={s.inLabel} title={dirty ? 'Edited since it last ran' : undefined}>
                [{count}]:
              </span>
              {dirty && <i className={s.dirty} aria-label="edited since it last ran" />}
              <button
                type="button"
                className={s.runBtn}
                onClick={act(() => run([cell.id]))}
                aria-label={`Run cell ${index + 1}`}
                data-keep
              >
                {busy ? <span className={s.spin} aria-hidden="true" /> : <I.run />}
              </button>
            </>
          )}
        </div>
        <div className={s.inBody}>
          {showEditor ? (
            <Editor
              id={cell.id}
              value={cell.source}
              language={isCode ? 'python' : 'markdown'}
              lineNumbers={lineNumbers}
              errorLine={cell.errorLine}
              editing={editing}
              label={label}
              jump={jump}
              onChange={(v) => edit(cell.id, v)}
              onFocus={() => {
                if (!editing) select(cell.id, 'edit');
              }}
              onKey={onEditorKey}
              onCaret={(line, col) => setCaret({ line, col })}
            />
          ) : (
            <div className={s.md}>
              <Markdown source={cell.source} />
            </div>
          )}
        </div>
      </div>
      {isCode && cell.outputs.length > 0 && !cell.outputHidden && (
        <Outputs outputs={cell.outputs} />
      )}
      {isCode && cell.outputs.length > 0 && cell.outputHidden && (
        <button type="button" className={s.hiddenOut} onClick={act(() => toggleOutput(cell.id))}>
          Output hidden · show
        </button>
      )}
      {isCode && cell.ms !== null && !busy && (
        <p className={s.timing} aria-live="polite">
          {cell.errorLine === null && !cell.outputs.some((o) => o.t === 'error') ? '✓' : '✗'}{' '}
          {cell.ms < 1 ? '<1' : Math.round(cell.ms)} ms
        </p>
      )}
    </section>
  );
}

export default memo(Cell);
