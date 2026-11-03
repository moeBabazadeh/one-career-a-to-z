'use client';

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { a1 } from './engine/address';
import { getFn, sigOf, type FnDef } from './engine/functions';
import { argHint, argSlot, highlight, suggestions } from './analysis';
import { canPoint, useStore, type Edit, type Store } from './store';
import { cx, focusGrid, Icon } from './ui';
import s from './sheet.module.scss';

// Editing a cell: the input (with references coloured as you type, the colours matching the
// boxes drawn on the grid), autocomplete for functions, the argument hint, and the keys that
// commit, cancel, toggle Enter/Edit mode and point at cells with the arrows.

const DIRS: Record<string, [number, number, 'down' | 'up' | 'right' | 'left']> = {
  ArrowDown: [1, 0, 'down'],
  ArrowUp: [-1, 0, 'up'],
  ArrowRight: [0, 1, 'right'],
  ArrowLeft: [0, -1, 'left'],
};

export function editorKey(ev: KeyboardEvent<HTMLInputElement>, st: Store, where: Edit['where']) {
  const e = st.ui.edit;
  if (!e) return;
  // Keys the editor handles stop here, so the grid underneath doesn't act on them as well.
  if (
    [
      'Enter',
      'Tab',
      'Escape',
      'F2',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'Delete',
      'Backspace',
    ].includes(ev.key) ||
    ev.key.length === 1
  )
    ev.stopPropagation();
  const sug = !e.quiet ? suggestions(e.text, e.caret) : null;
  if (sug) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const n = sug.fns.length;
      st.setPick((e.pick + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n);
      return;
    }
    if (ev.key === 'Tab' || ev.key === 'Enter') {
      ev.preventDefault();
      st.complete(sug.fns[Math.min(e.pick, sug.fns.length - 1)].name);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      st.quiet();
      return;
    }
  }
  const done = () => {
    if (where !== 'sheet') focusGrid();
  };
  switch (ev.key) {
    case 'Enter':
      ev.preventDefault();
      st.commit(ev.shiftKey ? 'up' : 'down');
      done();
      return;
    case 'Tab':
      ev.preventDefault();
      st.commit(ev.shiftKey ? 'left' : 'right');
      done();
      return;
    case 'Escape':
      ev.preventDefault();
      st.cancel();
      done();
      return;
    case 'F2':
      ev.preventDefault();
      st.editMode(e.mode === 'enter' ? 'edit' : 'enter');
      return;
  }
  const dir = DIRS[ev.key];
  if (dir && !ev.altKey && !ev.metaKey && !ev.ctrlKey) {
    const pointing = e.point && e.point.end === e.caret;
    if ((e.mode === 'enter' || pointing) && canPoint(e)) {
      ev.preventDefault();
      st.pointMove(dir[0], dir[1], ev.shiftKey);
    } else if (e.mode === 'enter' && where === 'cell') {
      ev.preventDefault();
      st.commit(dir[2]);
      done();
    }
  }
}

/** The text input with a coloured mirror behind it. */
export function FormulaInput({
  where,
  label,
  className,
}: {
  where: Edit['where'];
  label: string;
  className?: string;
}) {
  const st = useStore();
  const e = st.ui.edit as Edit;
  const input = useRef<HTMLInputElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const { spans } = highlight(e.text, st.book, e.sheet);
  const mine = e.where === where;

  // Focus this input when it's the one editing, and put the caret where the store says.
  useEffect(() => {
    const el = input.current;
    if (!el || !mine) return;
    el.focus({ preventScroll: true });
    const caret = Math.min(st.ui.edit?.caret ?? el.value.length, el.value.length);
    el.setSelectionRange(caret, caret);
  }, [mine, e.stamp, st]);

  useLayoutEffect(() => {
    if (mirror.current && input.current) mirror.current.scrollLeft = input.current.scrollLeft;
  });

  const sync = () => {
    if (mirror.current && input.current) mirror.current.scrollLeft = input.current.scrollLeft;
  };

  return (
    <div className={cx(s.fi, e.text.startsWith('=') && s.fiFormula, className)}>
      <div ref={mirror} className={s.fiMirror} aria-hidden="true">
        {spans.map((sp, i) => (
          <span key={i} className={sp.kind === 'ref' ? s[`ref${sp.color}`] : s[`tok_${sp.kind}`]}>
            {sp.text}
          </span>
        ))}
        {'​'}
      </div>
      <input
        ref={input}
        className={s.fiInput}
        value={e.text}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="done"
        onFocus={() => {
          if (!mine) st.editWhere(where);
        }}
        onChange={(ev) =>
          st.editText(ev.target.value, ev.target.selectionStart ?? ev.target.value.length)
        }
        onSelect={(ev) => {
          st.editCaret(ev.currentTarget.selectionStart ?? 0);
          sync();
        }}
        onScroll={sync}
        onKeyDown={(ev) => editorKey(ev, st, where)}
      />
    </div>
  );
}

/** Autocomplete for function names, or the hint for the function the caret is in. */
export function Assist({ edit, className }: { edit: Edit; className?: string }) {
  const st = useStore();
  const sug = !edit.quiet ? suggestions(edit.text, edit.caret) : null;
  if (sug) {
    return (
      <div className={cx(s.assist, className)} role="listbox" aria-label="Functions">
        {sug.fns.map((f, i) => (
          <button
            key={f.name}
            type="button"
            role="option"
            aria-selected={i === edit.pick}
            className={s.assistItem}
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => st.complete(f.name)}
          >
            <b>{f.name}</b>
            <span>{f.desc}</span>
          </button>
        ))}
        <p className={s.assistFoot}>
          <kbd>Tab</kbd> to insert · <kbd>↑</kbd>
          <kbd>↓</kbd> to choose
        </p>
      </div>
    );
  }
  const hint = argHint(edit.text, edit.caret);
  if (!hint) return null;
  const slot = argSlot(hint.fn, hint.arg);
  return (
    <div className={cx(s.assist, s.hint, className)} role="note">
      <code>
        {hint.fn.name}(
        {hint.fn.args.map((a, i) => (
          <span key={i}>
            {i ? ', ' : ''}
            <span className={i === slot ? s.hintOn : undefined}>{a}</span>
          </span>
        ))}
        )
      </code>
      <span>{hint.fn.desc}</span>
    </div>
  );
}

const KEYS = ['=', '(', ')', ':', ',', '+', '-', '*', '/', '&', '"', '$'];
const QUICK = [
  'SUM',
  'AVERAGE',
  'COUNT',
  'MAX',
  'MIN',
  'IF',
  'ROUND',
  'DATEDIF',
  'YEARFRAC',
  'TEXT',
  'CONCAT',
  'VLOOKUP',
];

/** The phone's editing sheet: it slides up over the bottom of the grid, which stays tappable for pointing. */
export function PhoneSheet() {
  const st = useStore();
  const e = st.ui.edit;
  if (!e || e.where !== 'sheet') return null;
  const formula = e.text.startsWith('=');
  return (
    <section className={s.phoneSheet} aria-label={`Editing ${a1(e.r, e.c)}`}>
      <header className={s.phoneHead}>
        <button type="button" className={s.phoneBtn} onClick={() => st.cancel()}>
          Cancel
        </button>
        <span className={s.phoneAddr}>
          {st.book.sheetName(e.sheet)} · <b>{a1(e.r, e.c)}</b>
          {formula && canPoint(e) && <em> · tap cells to point</em>}
        </span>
        <button
          type="button"
          className={cx(s.phoneBtn, s.phoneDone)}
          onClick={() => st.commit(null)}
          aria-label="Done"
        >
          <Icon.check />
        </button>
      </header>
      <FormulaInput where="sheet" label={`Contents of ${a1(e.r, e.c)}`} className={s.phoneInput} />
      <Assist edit={e} className={s.phoneAssist} />
      <div className={s.phoneKeys} aria-label="Formula keys">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => st.insert(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <div className={s.phoneFns} aria-label="Functions">
        {QUICK.map((f) => (
          <button
            key={f}
            type="button"
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => st.insert(`${f}()`, 1)}
            title={sigOf(getFn(f) as FnDef)}
          >
            {f}
          </button>
        ))}
      </div>
    </section>
  );
}
