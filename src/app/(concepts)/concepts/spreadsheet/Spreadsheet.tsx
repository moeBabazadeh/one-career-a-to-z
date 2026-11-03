'use client';

import { useEffect, type KeyboardEvent } from 'react';
import { a1 } from './engine/address';
import { FormulaBar, SheetTabs, StatusBar, TitleBar, Toolbar } from './Bars';
import { PhoneSheet } from './Editor';
import Grid from './Grid';
import Help from './Help';
import Reader from './Reader';
import { shown, useStore } from './store';
import { TraceCard } from './Trace';
import { focusGrid, usePhone } from './ui';
import s from './sheet.module.scss';

// A working spreadsheet, unbranded: seven sheets filled from the facts, a formula engine with a
// dependency graph, charts bound to ranges, and arrows that show where each figure comes from.

export default function Spreadsheet() {
  const st = useStore();
  const ui = st.ui;
  const flashId = ui.flash?.id;
  const phone = usePhone();

  // Phones get narrower columns, so a sheet's first figures fit on screen.
  useEffect(() => {
    st.setPhone(phone);
  }, [phone, st]);

  // Messages in the status bar fade after a few seconds.
  useEffect(() => {
    if (flashId === undefined) return;
    const t = setTimeout(() => st.set({ flash: null }), 3500);
    return () => clearTimeout(t);
  }, [flashId, st]);

  // The page opens on the first figure, so the trace is the first thing a visitor sees.
  useEffect(() => {
    if (st.ui.trace || st.ui.view !== 0) return;
    const t = setTimeout(() => {
      if (!st.ui.edit && st.sel().active.r === 0 && st.sel().active.c === 0)
        st.select({ r: 8, c: 1 });
    }, 0);
    return () => clearTimeout(t);
  }, [st]);

  if (ui.reader) {
    return (
      <div className={s.root} data-reader="">
        <Reader />
      </div>
    );
  }

  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const inField = (e.target as HTMLElement).closest('input, textarea, dialog, [role="menu"]');
    if (mod && e.key === '/') {
      e.preventDefault();
      st.set({ dialog: 'help' });
    } else if (mod && e.key === '`') {
      e.preventDefault();
      st.set({ showFormulas: !st.ui.showFormulas });
    } else if (mod && !inField && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) st.redo();
      else st.undo();
      focusGrid();
    } else if (mod && !inField && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      st.redo();
      focusGrid();
    }
  };

  const a = st.sel().active;
  const cell = st.book.cell(ui.view, a.r, a.c);
  const live = `${st.layouts[ui.view].name} ${a1(a.r, a.c)}: ${shown(cell).text || 'empty'}${cell?.input.startsWith('=') ? `, formula ${cell.input}` : ''}`;

  return (
    <div className={s.root} onKeyDown={onKey}>
      <div className={s.app}>
        <TitleBar />
        <Toolbar />
        <FormulaBar />
        <TraceCard />
        <main className={s.body}>
          <Grid />
        </main>
        <footer className={s.foot}>
          <SheetTabs />
          <StatusBar />
        </footer>
        <PhoneSheet />
        <Help />
        <p className={s.srOnly} aria-live="polite">
          {live}
        </p>
      </div>
    </div>
  );
}
