'use client';

import { useEffect, useRef } from 'react';
import { allFns, sigOf, type Category } from './engine/functions';
import { useMod } from './Bars';
import { useStore } from './store';
import { focusGrid, Icon } from './ui';
import s from './sheet.module.scss';

const CATS: Category[] = ['Math', 'Statistical', 'Logical', 'Text', 'Date', 'Lookup', 'Info'];

/** Keyboard shortcuts, every function the engine knows, and what's defined in this workbook. */
export default function Help() {
  const st = useStore();
  const mod = useMod();
  const ref = useRef<HTMLDialogElement>(null);
  const open = st.ui.dialog === 'help';

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const keys: [string, string][] = [
    ['Arrows', 'Move'],
    ['⇧ Arrows', 'Extend the selection'],
    [`${mod}Arrows`, 'Jump to the edge of the data'],
    ['Enter · ⇧Enter', 'Down · up (inside a selection, cycle through it)'],
    ['Tab · ⇧Tab', 'Right · left'],
    ['F2', 'Edit the cell; while editing, switch Enter and Edit mode'],
    ['Type =', 'Start a formula; click or drag cells (or use arrows) to point at them'],
    ['Esc', 'Cancel the edit, clear the copy marquee, remove arrows'],
    ['Delete', 'Clear the values (formats stay)'],
    [`${mod}C · ${mod}X · ${mod}V`, 'Copy, cut, paste (formulas shift their relative references)'],
    [`${mod}Z · ${mod}⇧Z`, 'Undo · redo'],
    [`${mod}A`, 'Select all'],
    [`${mod}B · ${mod}I`, 'Bold · italic'],
    [`${mod}\``, 'Show formulas'],
    [`${mod}[`, 'Select the precedents of the formula'],
    ['⌥=', 'Sum the numbers above'],
    ['⌥Enter', 'Open the link in the cell'],
    ['F9', 'Calculate every formula now'],
    ['Home · End', 'First · last column'],
    ['Page Up · Page Down', 'A screen up · down'],
    ['⌥↑ · ⌥↓', 'Previous · next sheet'],
    ['⇧Space · Ctrl Space', 'Select the row · the column'],
    ['Fill handle', 'Drag to fill; double-click to fill down beside data'],
    ['Column edge', 'Drag to resize; double-click to fit'],
    ['Name box', 'Type B9, Roles!C2:C7 or a name to go there; a new word names the selection'],
  ];

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="sheet-help-title"
      onClose={() => {
        st.set({ dialog: null });
        focusGrid();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <header className={s.dialogHead}>
        <h2 id="sheet-help-title">Shortcuts and functions</h2>
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()}>
          <Icon.close />
        </button>
      </header>
      <div className={s.dialogBody}>
        <section>
          <h3>Keyboard and mouse</h3>
          <dl className={s.keys}>
            {keys.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3>Functions</h3>
          <p className={s.dialogNote}>
            The engine is a real one: a tokenizer, a precedence-climbing parser, a dependency graph
            that recalculates only what changed, and cycle detection. Errors: #DIV/0!, #VALUE!,
            #REF!, #NAME?, #N/A, #NUM!, #CIRC! and #ERROR!.
          </p>
          {CATS.map((cat) => (
            <div key={cat} className={s.fnGroup}>
              <h4>{cat}</h4>
              <ul>
                {allFns()
                  .filter((f) => f.cat === cat)
                  .map((f) => (
                    <li key={f.name}>
                      <code>{sigOf(f)}</code>
                      <span>{f.desc}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
        <section>
          <h3>In this workbook</h3>
          <h4>Named ranges</h4>
          <ul className={s.plainList}>
            {[...st.book.names.values()].map((n) => (
              <li key={n.name}>
                <code>{n.name}</code> = {st.book.areaLabel(n.area)}
              </li>
            ))}
          </ul>
          <h4>Conditional formatting</h4>
          <ul className={s.plainList}>
            {st.layouts.flatMap((L) =>
              L.cf.map((r, i) => <li key={`${L.name}${i}`}>{`${L.name}: ${r.label}`}</li>),
            )}
          </ul>
          <h4>Charts</h4>
          <ul className={s.plainList}>
            {st.layouts.flatMap((L) =>
              L.charts.map((c) => (
                <li key={c.id}>
                  {c.title}: <code>{[c.labels, c.values, c.ends].filter(Boolean).join(', ')}</code>
                </li>
              )),
            )}
          </ul>
        </section>
      </div>
    </dialog>
  );
}
