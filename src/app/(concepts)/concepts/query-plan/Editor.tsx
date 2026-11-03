'use client';

import { useEffect, useRef, useState } from 'react';
import { complete, type Completion } from './sql/complete';
import Sql from './Sql';
import { run, setText, useModKey, useWorkbench } from './store';
import s from './query.module.scss';

interface Popup extends Completion {
  active: number;
  x: number;
  y: number;
  /** Arrowed through: Enter then accepts even a one-letter prefix. */
  moved: boolean;
}

const PAD = 12;

/** A SQL editor: a transparent textarea over highlighted code, with autocomplete. */
export default function Editor({ onCaret }: { onCaret: (line: number, col: number) => void }) {
  const wb = useWorkbench();
  const mod = useModKey();
  const ta = useRef<HTMLTextAreaElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const metrics = useRef({ ch: 7.8, lh: 21 });
  const [popup, setPopup] = useState<Popup | null>(null);
  const [line, setLine] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const text = wb.text;
  const lines = text.split('\n').length;

  // The error underline, while the text is still what ran.
  const err =
    !wb.result.ok && wb.result.error?.position && wb.ranText === text
      ? wb.offset + wb.result.error.position - 1
      : null;

  // Measure the monospace cell once the font is in.
  useEffect(() => {
    const measure = () => {
      const el = probe.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      metrics.current = { ch: r.width / 40, lh: parseFloat(cs.lineHeight) || r.height };
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Keep the active suggestion in view.
  useEffect(() => {
    if (!popup) return;
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [popup]);

  const sync = () => {
    const el = ta.current;
    if (!el) return;
    if (layer.current)
      layer.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
    if (gutter.current) gutter.current.style.transform = `translateY(${-el.scrollTop}px)`;
  };

  const caretInfo = () => {
    const el = ta.current!;
    const before = el.value.slice(0, el.selectionStart);
    const row = before.split('\n').length - 1;
    const col = before.length - before.lastIndexOf('\n') - 1;
    return { row, col };
  };

  const track = () => {
    const { row, col } = caretInfo();
    setLine(row);
    onCaret(row + 1, col + 1);
  };

  const suggest = (value: string, caret: number, force: boolean) => {
    const c = complete(value, caret, force);
    if (!c) {
      setPopup(null);
      return;
    }
    const el = ta.current!;
    const before = value.slice(0, c.from);
    const row = before.split('\n').length - 1;
    const col = before.length - before.lastIndexOf('\n') - 1;
    const { ch, lh } = metrics.current;
    const x = Math.max(4, Math.min(el.clientWidth - 240, PAD + col * ch - el.scrollLeft - 6));
    const y = PAD + (row + 1) * lh - el.scrollTop + 2;
    setPopup({ ...c, active: 0, x, y, moved: false });
  };

  const accept = (p: Popup, index = p.active) => {
    const el = ta.current;
    const item = p.items[index];
    if (!el || !item) return;
    el.focus();
    el.setSelectionRange(p.from, el.selectionStart);
    // execCommand keeps the native undo stack; setRangeText is the fallback.
    const ok =
      typeof document.execCommand === 'function' &&
      document.execCommand('insertText', false, item.insert);
    if (!ok) {
      el.setRangeText(item.insert, p.from, el.selectionEnd, 'end');
      setText(el.value);
    }
    setPopup(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      setPopup(null);
      run(el.selectionStart, { explain: e.shiftKey });
      return;
    }
    if (e.ctrlKey && (e.key === ' ' || e.code === 'Space')) {
      e.preventDefault();
      suggest(el.value, el.selectionStart, true);
      return;
    }
    if (!popup) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = popup.items.length;
      setPopup({
        ...popup,
        active: (popup.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n,
        moved: true,
      });
    } else if (
      e.key === 'Tab' ||
      (e.key === 'Enter' &&
        (popup.moved || popup.to - popup.from >= 2 || el.value[popup.from - 1] === '.'))
    ) {
      // Enter after a single letter is usually a new line (an alias, say), not a request to complete.
      e.preventDefault();
      accept(popup);
    } else if (e.key === 'Enter') {
      setPopup(null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setPopup(null);
    } else if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      setPopup(null);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    setText(el.value);
    const ev = e.nativeEvent as InputEvent;
    const typed = ev.inputType === 'insertText' && ev.data && /^[\w.$]$/.test(ev.data);
    const erased = ev.inputType?.startsWith('delete') && popup;
    if (typed || erased) suggest(el.value, el.selectionStart, false);
    else setPopup(null);
    track();
  };

  const optionId = (i: number) => `sql-option-${i}`;

  return (
    <div className={s.editor}>
      <div className={s.gutter} aria-hidden="true">
        <div ref={gutter}>
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} data-current={i === line || undefined}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
      <div className={s.code}>
        <div ref={layer} className={s.layer} aria-hidden="true">
          <span className={s.lineBand} style={{ '--line': line } as React.CSSProperties} />
          <pre className={s.hl}>
            <Sql text={text} errorAt={err} />
            {'\n'}
          </pre>
        </div>
        <textarea
          ref={ta}
          className={s.input}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onScroll={sync}
          onSelect={track}
          onClick={() => {
            setPopup(null);
            track();
          }}
          onBlur={() => setPopup(null)}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          aria-label="SQL editor"
          aria-describedby="editor-keys"
          aria-autocomplete="list"
          aria-controls={popup ? 'sql-suggestions' : undefined}
          aria-activedescendant={popup ? optionId(popup.active) : undefined}
        />
        <span ref={probe} className={s.probe} aria-hidden="true">
          {'x'.repeat(40)}
        </span>
        {popup && (
          <ul
            id="sql-suggestions"
            ref={list}
            role="listbox"
            aria-label="Suggestions"
            className={s.suggest}
            style={{ left: popup.x, top: popup.y }}
          >
            {popup.items.map((it, i) => (
              <li
                key={`${it.kind}-${it.label}-${it.detail}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === popup.active}
                data-kind={it.kind}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(popup, i);
                }}
              >
                <i aria-hidden="true">
                  {it.kind === 'table'
                    ? 'T'
                    : it.kind === 'column'
                      ? 'c'
                      : it.kind === 'function'
                        ? 'ƒ'
                        : 'k'}
                </i>
                <b>{it.label}</b>
                <span>{it.detail}</span>
              </li>
            ))}
          </ul>
        )}
        <p id="editor-keys" className={s.sr}>
          {mod}+Enter runs the statement under the caret. Ctrl+Space suggests tables and columns.
        </p>
      </div>
    </div>
  );
}
