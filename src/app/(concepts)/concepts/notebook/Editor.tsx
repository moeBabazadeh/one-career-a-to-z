'use client';

// The cell editor: a textarea over a highlighted copy of its text, so typing, selection, undo and
// IME stay native while the code is coloured. It indents like a code editor (Tab, Shift+Tab,
// Enter after a colon, Backspace through an indent, Cmd+/ to comment) and Tab completes names
// from the live kernel.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { highlightMarkdown, highlightPython } from './highlight';
import { BUILTIN_NAMES, completions, type Completion } from './store';
import s from './notebook.module.scss';

const INDENT = '    ';

interface Props {
  id: string;
  value: string;
  language: 'python' | 'markdown';
  lineNumbers: boolean;
  errorLine: number | null;
  editing: boolean;
  label: string;
  jump: { line: number; tick: number } | null;
  onChange: (value: string) => void;
  onFocus: () => void;
  /** The notebook's own keys (run, escape, cross-cell arrows); true when it handled one. */
  onKey: (e: KeyboardEvent<HTMLTextAreaElement>, at: { first: boolean; last: boolean }) => boolean;
  onCaret: (line: number, col: number) => void;
}

/** Replaces a range through the browser's editing command, so Cmd+Z undoes it like typing. */
function replace(
  ta: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  sel?: [number, number],
) {
  ta.focus();
  ta.setSelectionRange(start, end);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (sel) ta.setSelectionRange(sel[0], sel[1]);
}

const lineStartOf = (text: string, pos: number) => text.lastIndexOf('\n', pos - 1) + 1;
const lineEndOf = (text: string, pos: number) => {
  const i = text.indexOf('\n', pos);
  return i < 0 ? text.length : i;
};

const KIND: Record<Completion['kind'], string> = {
  field: 'f',
  method: 'm',
  function: 'ƒ',
  variable: 'v',
  keyword: 'k',
  module: 'M',
  class: 'C',
};

export default function Editor(p: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    from: number;
    items: Completion[];
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const lines =
    p.language === 'python' ? highlightPython(p.value, BUILTIN_NAMES) : highlightMarkdown(p.value);

  // Edit mode puts the caret here; command mode takes it away.
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    if (p.editing && document.activeElement !== el) el.focus({ preventScroll: true });
    if (!p.editing && document.activeElement === el) el.blur();
  }, [p.editing]);

  // A traceback link: caret to the start of that line's code.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el || !p.jump) return;
    const rows = el.value.split('\n');
    const line = Math.min(rows.length, Math.max(1, p.jump.line));
    let pos = 0;
    for (let i = 0; i < line - 1; i++) pos += rows[i].length + 1;
    pos += /^\s*/.exec(rows[line - 1] ?? '')?.[0].length ?? 0;
    el.focus({ preventScroll: true });
    el.setSelectionRange(pos, pos);
    el.closest('section')?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [p.jump]);

  const caretInfo = () => {
    const el = ta.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const line = before.split('\n').length;
    p.onCaret(line, pos - before.lastIndexOf('\n'));
  };

  /** Where the caret sits in the editor box, by laying the text out in a hidden twin. */
  const caretXY = (pos: number) => {
    const m = mirror.current;
    if (!m) return { x: 0, y: 0 };
    m.textContent = p.value.slice(0, pos);
    const mark = document.createElement('span');
    mark.textContent = '​';
    m.appendChild(mark);
    return { x: mark.offsetLeft, y: mark.offsetTop + mark.offsetHeight };
  };

  const accept = (item: Completion) => {
    const el = ta.current;
    if (!el || !menu) return;
    replace(el, menu.from, el.selectionStart, item.label);
    setMenu(null);
  };

  const complete = (el: HTMLTextAreaElement) => {
    const found = completions(el.value, el.selectionStart);
    if (!found || !found.items.length) return false;
    const typed = el.value.slice(found.from, el.selectionStart);
    if (found.items.length === 1) {
      replace(el, found.from, el.selectionStart, found.items[0].label);
      return true;
    }
    // Fill in what every option shares, then offer the list.
    let common = found.items[0].label;
    for (const it of found.items) while (!it.label.startsWith(common)) common = common.slice(0, -1);
    if (common.length > typed.length) replace(el, found.from, el.selectionStart, common);
    const { x, y } = caretXY(found.from);
    setMenu({ from: found.from, items: found.items.slice(0, 60), index: 0, x, y });
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const mod = e.metaKey || e.ctrlKey;

    if (menu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setMenu({ ...menu, index: (menu.index + d + menu.items.length) % menu.items.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        accept(menu.items[menu.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
      setMenu(null);
    }

    const first = !value.slice(0, a).includes('\n');
    const last = !value.slice(b).includes('\n');
    if (p.onKey(e, { first, last })) return;

    if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault();
      const ls = lineStartOf(value, a);
      const multi = value.slice(a, b).includes('\n');
      if (e.shiftKey || multi) {
        // Indent or dedent every selected line.
        const le = lineEndOf(value, b > a && value[b - 1] === '\n' ? b - 1 : b);
        const block = value.slice(ls, le).split('\n');
        const changed = block.map((l) => (e.shiftKey ? l.replace(/^( {1,4}|\t)/, '') : INDENT + l));
        const text = changed.join('\n');
        const firstShift = changed[0].length - block[0].length;
        replace(el, ls, le, text, [Math.max(ls, a + firstShift), b + (text.length - (le - ls))]);
        return;
      }
      const before = value.slice(ls, a);
      // Mid-word, Tab only ever completes; with nothing to offer it does nothing.
      if (p.language === 'python' && /[\w.]$/.test(before) && a === b) {
        complete(el);
        return;
      }
      const pad = INDENT.slice(before.length % INDENT.length);
      replace(el, a, b, pad || INDENT);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      const ls = lineStartOf(value, a);
      const line = value.slice(ls, a);
      let indent = /^[ \t]*/.exec(line)![0];
      if (p.language === 'python') {
        const code = line.replace(/#.*$/, '').trimEnd();
        if (code.endsWith(':')) indent += INDENT;
        else if (/^\s*(return|pass|break|continue|raise)\b/.test(line))
          indent = indent.slice(0, Math.max(0, indent.length - INDENT.length));
      }
      replace(el, a, b, `\n${indent}`);
      return;
    }

    if (e.key === 'Backspace' && a === b && a > 0 && !mod && !e.altKey) {
      const ls = lineStartOf(value, a);
      const before = value.slice(ls, a);
      if (before.length && /^ +$/.test(before)) {
        e.preventDefault();
        const drop = before.length % INDENT.length || INDENT.length;
        replace(el, a - drop, a, '');
      }
      return;
    }

    if (mod && e.key === '/') {
      e.preventDefault();
      const mark = p.language === 'python' ? '# ' : '<!-- ';
      const ls = lineStartOf(value, a);
      const le = lineEndOf(value, b);
      const block = value.slice(ls, le).split('\n');
      if (p.language !== 'python') return;
      const all = block.filter((l) => l.trim()).every((l) => /^\s*#/.test(l));
      const text = block
        .map((l) =>
          !l.trim() ? l : all ? l.replace(/^(\s*)# ?/, '$1') : l.replace(/^(\s*)/, `$1${mark}`),
        )
        .join('\n');
      replace(el, ls, le, text, [ls, ls + text.length]);
    }
  };

  const numbered = p.lineNumbers;
  return (
    <div className={s.editor} data-numbers={numbered || undefined} data-lang={p.language}>
      <pre className={s.code} aria-hidden="true">
        {lines.map((toks, i) => (
          <span
            key={i}
            className={s.line}
            data-n={i + 1}
            data-error={p.errorLine === i + 1 || undefined}
          >
            {toks.length
              ? toks.map((t, j) =>
                  t.cls ? (
                    <span key={j} className={s[`t_${t.cls}`]}>
                      {t.text}
                    </span>
                  ) : (
                    t.text
                  ),
                )
              : '​'}
            {'\n'}
          </span>
        ))}
      </pre>
      <div ref={mirror} className={`${s.code} ${s.mirror}`} aria-hidden="true" />
      <textarea
        ref={ta}
        className={`${s.code} ${s.input}`}
        value={p.value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        aria-label={p.label}
        aria-autocomplete="list"
        aria-controls={menu ? `${p.id}-complete` : undefined}
        aria-activedescendant={menu ? `${p.id}-opt-${menu.index}` : undefined}
        rows={1}
        onChange={(e) => p.onChange(e.target.value)}
        onFocus={p.onFocus}
        onKeyDown={onKeyDown}
        onKeyUp={caretInfo}
        onClick={caretInfo}
        onSelect={caretInfo}
        onBlur={() => setMenu(null)}
      />
      {menu && (
        <ul
          id={`${p.id}-complete`}
          className={s.complete}
          role="listbox"
          aria-label="Completions"
          style={{ left: menu.x, top: menu.y + 2 }}
        >
          {menu.items.map((it, i) => (
            <li
              key={it.label}
              id={`${p.id}-opt-${i}`}
              role="option"
              aria-selected={i === menu.index}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(it);
              }}
            >
              <i data-kind={it.kind} aria-hidden="true">
                {KIND[it.kind]}
              </i>
              <span>{it.label}</span>
              <small>{it.detail}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
