'use client';

import { useRef, useState } from 'react';
import { useReducedMotion } from '../_shared/hooks';
import Editor from './Editor';
import Explorer, { SavedChips } from './Explorer';
import Plan from './Plan';
import Results from './Results';
import { SAVED } from './saved';
import { loadSaved, run, useModKey, useWorkbench } from './store';
import s from './query.module.scss';

function Play() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 3.5v9l7-4.5z" />
    </svg>
  );
}

export default function Workbench() {
  const wb = useWorkbench();
  const reduced = useReducedMotion();
  const mod = useModKey();
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const box = useRef<HTMLElement>(null);

  const saved = SAVED.find((q) => q.id === wb.saved) ?? null;
  const story = saved?.story.replace('⌘↵', `${mod}↵`) ?? wb.story;
  const file = saved?.file ?? (wb.story ? 'check.sql' : 'console.sql');
  const pending = !reduced && wb.runId > 0 && wb.result.analyzed && wb.result.events.length > 0;

  const textarea = () => box.current?.querySelector('textarea') ?? null;
  const runNow = (explain = false) => run(textarea()?.selectionStart ?? 0, { explain });
  const jump = () => {
    const ta = textarea();
    const pos = wb.result.error?.position;
    if (!ta || !pos) return;
    const at = wb.offset + pos - 1;
    ta.focus();
    ta.setSelectionRange(at, at);
  };

  return (
    <section id="workbench" ref={box} className={s.workbench} aria-label="SQL workbench">
      <div className={s.wbBar}>
        <span className={s.lights} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <b>career</b>
        <span className={s.crumbs}>
          <span>public</span>
          <span>{file}</span>
        </span>
        <span className={s.conn}>
          <i aria-hidden="true" />
          visitor@career · read-only
        </span>
      </div>

      <SavedChips />

      <div className={s.wbGrid}>
        <Explorer />

        <div className={s.center}>
          <div className={s.editorPane}>
            <header className={s.paneHead}>
              <div className={s.fileTab}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 1.5h5.5L13 5v9.5H4z" />
                  <path d="M9.5 1.5V5H13" />
                </svg>
                <span>{file}</span>
                {wb.dirty && <i className={s.dirty} aria-label="edited" />}
              </div>
              <div className={s.toolbar}>
                <button type="button" className={s.runBtn} onClick={() => runNow()}>
                  <Play />
                  Run
                  <kbd>{mod}↵</kbd>
                </button>
                <button
                  type="button"
                  className={s.ghost}
                  onClick={() => runNow(true)}
                  title={`EXPLAIN ANALYZE (${mod}⇧↵)`}
                >
                  Explain
                </button>
                {saved && wb.dirty && (
                  <button
                    type="button"
                    className={s.ghost}
                    onClick={() => loadSaved(saved.id, false)}
                  >
                    Revert
                  </button>
                )}
              </div>
            </header>
            <Editor key={wb.loadId} onCaret={(line, col) => setCaret({ line, col })} />
          </div>

          {story && (
            <div className={s.story} aria-live="polite">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z" />
              </svg>
              <p>
                {saved && <b>{saved.title}. </b>}
                {story}
              </p>
            </div>
          )}

          <Results pending={pending} onJump={jump} />
        </div>

        <Plan result={wb.result} runId={wb.runId} />
      </div>

      <footer className={s.statusBar}>
        <span>
          <i className={s.okDot} aria-hidden="true" />
          connected
        </span>
        <span>in-browser engine</span>
        <span className={s.hideSm}>UTF8</span>
        <span className={s.hideSm}>auto_explain on</span>
        <span className={s.hideSm}>Ctrl+Space suggests</span>
        <span className={s.spacer} />
        <span>
          Ln {caret.line}, Col {caret.col}
        </span>
      </footer>
    </section>
  );
}
