'use client';

// The display filter bar: green when the expression compiles, red with the error and its place
// when it doesn't, yellow for a deprecated form. Field names complete as you type; Enter applies.
// Below it, the filter buttons: saved expressions one click away, and your own added with +.

import { useRef, useState, type RefObject } from 'react';
import { compile, completions } from './filter';
import type { FieldDef } from './fields';
import { Icon, Popup, cx, type MenuItem } from './ui';
import s from './capture.module.scss';

export interface FilterButton {
  label: string;
  filter: string;
  custom?: boolean;
}

interface Props {
  text: string;
  setText: (t: string) => void;
  applied: string;
  apply: (t: string) => void;
  recent: string[];
  buttons: FilterButton[];
  addButton: (b: FilterButton) => void;
  removeButton: (label: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  matched: number | null;
}

const wordAt = (text: string, caret: number) => {
  let a = caret;
  while (a > 0 && /[A-Za-z0-9_.]/.test(text[a - 1])) a--;
  let b = caret;
  while (b < text.length && /[A-Za-z0-9_.]/.test(text[b])) b++;
  return { from: a, to: b, word: text.slice(a, caret) };
};

export default function FilterBar({
  text,
  setText,
  applied,
  apply,
  recent,
  buttons,
  addButton,
  removeButton,
  inputRef,
  matched,
}: Props) {
  const res = compile(text);
  const state = !text.trim() ? 'empty' : !res.ok ? 'bad' : res.warning ? 'warn' : 'ok';
  const [comp, setComp] = useState<{
    items: FieldDef[];
    i: number;
    from: number;
    to: number;
  } | null>(null);
  const [menu, setMenu] = useState<{ kind: 'recent' | 'saved'; x: number; y: number } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const listId = 'nc-filter-completions';
  const addRef = useRef<HTMLInputElement>(null);

  const refresh = (value: string, caret: number) => {
    const w = wordAt(value, caret);
    // Only offer names where a field can start: not inside a quoted string, not after an operator's value.
    const quotes = (value.slice(0, w.from).match(/"/g) ?? []).length % 2 === 1;
    const items = !quotes && w.word.length ? completions(w.word) : [];
    setComp(items.length ? { items, i: -1, from: w.from, to: w.to } : null);
  };

  const accept = (f: FieldDef) => {
    if (!comp) return;
    const next = text.slice(0, comp.from) + f.abbrev + text.slice(comp.to);
    setText(next);
    setComp(null);
    const caret = comp.from + f.abbrev.length;
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(caret, caret));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (comp && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const n = comp.items.length;
      setComp({
        ...comp,
        i:
          (comp.i +
            (e.key === 'ArrowDown' ? 1 : n - 1) +
            (comp.i < 0 && e.key === 'ArrowUp' ? 1 : 0)) %
          n,
      });
      return;
    }
    if (comp && comp.i >= 0 && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      accept(comp.items[comp.i]);
      return;
    }
    if (comp && e.key === 'Tab' && comp.items.length === 1) {
      e.preventDefault();
      accept(comp.items[0]);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      setComp(null);
      if (res.ok) apply(text);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (comp) setComp(null);
      else setText(applied);
    }
  };

  const err = !res.ok && text.trim() ? res : null;
  const recentItems: MenuItem[] = recent.length
    ? recent.map((r) => ({ label: r, act: () => (setText(r), apply(r)) }))
    : [{ label: 'No recent filters', disabled: true }];
  const savedItems: MenuItem[] = [
    {
      label: 'Save this filter as a button…',
      disabled: state !== 'ok',
      act: () => (setAdding(''), requestAnimationFrame(() => addRef.current?.focus())),
    },
    { label: 'Clear filter', disabled: !text, act: () => (setText(''), apply('')) },
    { sep: true },
    ...buttons.map((b) => ({
      label: `${b.label}: ${b.filter}`,
      act: () => (setText(b.filter), apply(b.filter)),
    })),
  ];

  return (
    <div className={s.filterWrap}>
      <div className={s.filterRow}>
        <button
          type="button"
          className={s.filterBookmark}
          aria-label="Saved display filters"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'saved'}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu(menu ? null : { kind: 'saved', x: r.left, y: r.bottom + 2 });
          }}
        >
          <Icon name="bookmark" />
        </button>
        <div className={cx(s.filterField, s[`filter_${state}`])}>
          <input
            ref={inputRef}
            className={s.filterInput}
            value={text}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder="Apply a display filter … <Ctrl/⌘ F>"
            aria-label="Display filter"
            aria-invalid={state === 'bad'}
            aria-describedby={err ? 'nc-filter-error' : undefined}
            role="combobox"
            aria-expanded={!!comp}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={comp && comp.i >= 0 ? `nc-comp-${comp.i}` : undefined}
            onChange={(e) => {
              setText(e.target.value);
              refresh(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={onKey}
            onBlur={() => setTimeout(() => setComp(null), 120)}
          />
          {text && (
            <button
              type="button"
              className={s.filterIconBtn}
              aria-label="Clear the display filter"
              onClick={() => (setText(''), apply(''), inputRef.current?.focus())}
            >
              <Icon name="clear" />
            </button>
          )}
          <button
            type="button"
            className={s.filterIconBtn}
            aria-label="Apply the display filter"
            disabled={state === 'bad'}
            onClick={() => apply(text)}
          >
            <Icon name="apply" />
          </button>
          <button
            type="button"
            className={s.filterIconBtn}
            aria-label="Recent display filters"
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'recent'}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu(menu ? null : { kind: 'recent', x: r.right - 280, y: r.bottom + 2 });
            }}
          >
            <Icon name="caret" />
          </button>
          {comp && (
            <ul className={s.completions} role="listbox" id={listId} aria-label="Field names">
              {comp.items.map((f, i) => (
                <li
                  key={f.abbrev}
                  id={`nc-comp-${i}`}
                  role="option"
                  aria-selected={i === comp.i}
                  className={cx(s.completion, i === comp.i && s.completionOn)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    accept(f);
                  }}
                >
                  <span className={s.completionName}>{f.abbrev}</span>
                  <span className={s.completionDesc}>{f.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {err && (
        <div className={s.filterError} id="nc-filter-error" role="status">
          <code className={s.filterErrorCode}>
            {text.slice(0, err.at[0])}
            <span className={s.squiggle}>{text.slice(err.at[0], err.at[1]) || ' '}</span>
            {text.slice(err.at[1])}
          </code>
          <span>{err.error}</span>
        </div>
      )}
      {!err && res.ok && res.warning && text.trim() && (
        <div className={cx(s.filterError, s.filterWarn)} role="status">
          <span>{res.warning}</span>
        </div>
      )}
      <div className={s.buttonsRow} role="toolbar" aria-label="Filter buttons">
        {buttons.map((b) => (
          <span key={b.label} className={s.fbWrap}>
            <button
              type="button"
              className={cx(s.fb, applied === b.filter && s.fbOn)}
              aria-pressed={applied === b.filter}
              title={b.filter}
              onClick={() =>
                applied === b.filter
                  ? (setText(''), apply(''))
                  : (setText(b.filter), apply(b.filter))
              }
            >
              {b.label}
            </button>
            {b.custom && (
              <button
                type="button"
                className={s.fbRemove}
                aria-label={`Remove the ${b.label} button`}
                onClick={() => removeButton(b.label)}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {adding === null ? (
          <button
            type="button"
            className={s.fbAdd}
            aria-label="Add the current filter as a button"
            title={state === 'ok' ? `Add “${text}” as a button` : 'Type a valid filter first'}
            disabled={state !== 'ok'}
            onClick={() => (setAdding(''), requestAnimationFrame(() => addRef.current?.focus()))}
          >
            <Icon name="plus" />
          </button>
        ) : (
          <form
            className={s.fbForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (adding.trim()) addButton({ label: adding.trim(), filter: text, custom: true });
              setAdding(null);
            }}
          >
            <input
              ref={addRef}
              className={s.fbLabel}
              value={adding}
              placeholder="Button label"
              aria-label="Button label"
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(null)}
            />
            <button type="submit" className={s.fb}>
              Save
            </button>
          </form>
        )}
        {matched !== null && (
          <span className={s.fbCount}>
            {matched === 0 ? 'No packets match' : `Displayed: ${matched}`}
          </span>
        )}
      </div>
      {menu && (
        <Popup
          items={menu.kind === 'recent' ? recentItems : savedItems}
          x={menu.x}
          y={menu.y}
          label={menu.kind === 'recent' ? 'Recent display filters' : 'Saved display filters'}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
