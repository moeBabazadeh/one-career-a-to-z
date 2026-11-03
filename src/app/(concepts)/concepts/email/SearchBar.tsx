'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { cx, Hl, HlContext } from './Body';
import { Icon } from './icons';
import { LABELS, labelSlug, THREADS } from './mailbox';
import { go, hrefFor, INBOX } from './hash';
import { highlighter, matches, parse, suggest } from './search';
import { boxOf, isRead, isStarred, useMailbox } from './store';
import s from './mail.module.scss';

const EXAMPLES: { q: string; hint: string }[] = [
  { q: 'from:site', hint: 'the site’s own reports' },
  { q: 'label:open-source', hint: 'pull requests' },
  { q: 'has:attachment', hint: 'the CV and screenshots' },
  { q: 'is:starred', hint: 'the highlights' },
  { q: 'after:2020 before:2024', hint: 'a range of years' },
  { q: 'firmware OR beacon', hint: 'either word' },
  { q: '"self-balancing"', hint: 'an exact phrase' },
  { q: 'label:robotics -label:education', hint: 'minus excludes' },
];

const labelValues = LABELS.map(labelSlug);

type Option =
  | { kind: 'suggest'; insert: string; label: string; hint: string }
  | { kind: 'example'; q: string; hint: string }
  | { kind: 'thread'; id: string; subject: string };

/** The search box: operators autocomplete, the top hits show as you type, Enter searches. */
export default function SearchBar({ initial, onDone }: { initial: string; onDone?: () => void }) {
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const st = useMailbox();

  const options: Option[] = useMemo(() => {
    if (!text.trim()) return EXAMPLES.map((x) => ({ kind: 'example' as const, ...x }));
    const sug = suggest(text, labelValues).map((x) => ({ kind: 'suggest' as const, ...x }));
    const ast = parse(text);
    const hits = THREADS.filter(
      (t) =>
        boxOf(st, t.id) !== 'trash' &&
        matches(ast, t, {
          starred: isStarred(st, t),
          read: isRead(st, t.id),
          box: boxOf(st, t.id),
        }),
    )
      .slice(0, 5)
      .map((t) => ({ kind: 'thread' as const, id: t.id, subject: t.subject }));
    return [...sug, ...hits];
  }, [text, st]);

  const hl = useMemo(() => (text.trim() ? highlighter(parse(text)) : null), [text]);

  const submit = (q: string) => {
    const query = q.trim();
    setOpen(false);
    input.current?.blur();
    go(query ? hrefFor({ kind: 'search', q: query }) : hrefFor(INBOX));
    onDone?.();
  };

  const pick = (o: Option) => {
    if (o.kind === 'suggest') {
      setText(o.insert);
      setActive(-1);
      input.current?.focus();
    } else if (o.kind === 'example') {
      setText(o.q);
      submit(o.q);
    } else {
      setOpen(false);
      input.current?.blur();
      go(hrefFor({ kind: 'search', q: text.trim() }, o.id));
      onDone?.();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && options[active]) pick(options[active]);
      else submit(text);
    } else if (e.key === 'Tab' && open && options[0]?.kind === 'suggest' && !e.shiftKey) {
      e.preventDefault();
      pick(options[Math.max(0, active)]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (open && text) setOpen(false);
      else {
        setOpen(false);
        input.current?.blur();
      }
    }
  };

  const show = open && options.length > 0;

  return (
    <form
      className={s.search}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(text);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <Icon.search size={18} />
      <input
        ref={input}
        id="mail-search"
        type="search"
        value={text}
        placeholder="Search mail"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-label="Search mail. Operators: from, label, has, is, in, before, after"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      {text && (
        <button
          type="button"
          className={s.iconBtn}
          aria-label="Clear search"
          onClick={() => {
            setText('');
            input.current?.focus();
          }}
        >
          <Icon.x size={16} />
        </button>
      )}
      <kbd className={s.searchKey} aria-hidden="true">
        /
      </kbd>
      {show && (
        <div className={s.suggest}>
          {!text.trim() && <p className={s.suggestHead}>Search with operators</p>}
          <ul id={listId} role="listbox" aria-label="Suggestions">
            {options.map((o, i) => (
              <li
                key={o.kind === 'thread' ? o.id : o.kind === 'example' ? o.q : o.insert}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cx(s.option, i === active && s.optionActive)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
              >
                {o.kind === 'thread' ? (
                  <>
                    <Icon.inbox size={16} />
                    <span className={s.optionText}>
                      <HlContext.Provider value={hl}>
                        <Hl text={o.subject} />
                      </HlContext.Provider>
                    </span>
                  </>
                ) : (
                  <>
                    {o.kind === 'example' ? <Icon.search size={16} /> : <Icon.label size={16} />}
                    <code>{o.kind === 'example' ? o.q : o.label}</code>
                    <span className={s.optionHint}>{o.hint}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className={s.suggestFoot}>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> choose
            </span>
            <span>
              <kbd>Tab</kbd> complete
            </span>
            <span>
              <kbd>↵</kbd> search
            </span>
          </p>
        </div>
      )}
    </form>
  );
}
