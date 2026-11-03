'use client';

// The quick input: one box, many pickers, chosen by the first character, the way the real thing
// works. No prefix finds files (fuzzy, recent first), `>` runs commands, `@` goes to a symbol in
// the file, `#` to a symbol anywhere, `:` to a line, and `?` lists them. The colour theme picker
// previews each theme as you move through it, and Escape puts the old one back.

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { readChoice, writeScheme } from '../_shared/scheme';
import { COMMANDS, bindingsOf, keyLabel, label, runCommand } from './commands';
import { fuzzy, fuzzyPath } from './fuzzy';
import { FileIcon, SymIcon } from './icons';
import { REPO } from './repo';
import { PATHS, activeTab, closeQuick, get, openFile, quick, quickActive, useWb } from './store';
import { flatSymbols, langOf, symbolsOf, tokenize, type Sym } from './syntax';
import { useMac } from './Views';
import s from './editor.module.scss';

interface Item {
  id: string;
  label: string;
  /** Matched positions in the label, then in the description. */
  hits?: number[];
  description?: string;
  descHits?: number[];
  detail?: string;
  icon?: ReactNode;
  keys?: string;
  group?: string;
  run: () => void;
  /** Called while the item is highlighted. */
  preview?: () => void;
}

function Hl({ text, hits }: { text: string; hits?: number[] }) {
  if (!hits?.length) return <>{text}</>;
  const set = new Set(hits);
  const out: ReactNode[] = [];
  let run = '';
  let on = false;
  for (let i = 0; i <= text.length; i++) {
    const hit = set.has(i);
    if (i === text.length || hit !== on) {
      if (run) out.push(on ? <b key={i}>{run}</b> : run);
      run = '';
      on = hit;
    }
    if (i < text.length) run += text[i];
  }
  return <>{out}</>;
}

const symbolCache = new Map<string, { text: string; syms: Sym[] }>();
function symbols(path: string, text: string) {
  const hit = symbolCache.get(path);
  if (hit && hit.text === text) return hit.syms;
  const lang = langOf(path);
  const syms = symbolsOf(text, lang, tokenize(text, lang));
  symbolCache.set(path, { text, syms });
  return syms;
}

export default function QuickInput() {
  const q = useWb((st) => st.quick);
  const buffers = useWb((st) => st.buffers);
  const recentFiles = useWb((st) => st.recentFiles);
  const recentCommands = useWb((st) => st.recentCommands);
  const mac = useMac();
  const active = q?.active ?? 0;
  const setActive = quickActive;
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const before = useRef<ReturnType<typeof readChoice> | undefined>(undefined);
  const returnTo = useRef<HTMLElement | null>(null);

  const value = q?.value ?? '';
  const picker = q?.picker ?? null;
  const open = !!q;

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const len = input.current?.value.length ?? 0;
    input.current?.setSelectionRange(len, len);
    if (picker === 'theme') before.current = readChoice();
    return () => {
      // Focus goes back where it was, unless something else took it.
      if (document.activeElement === document.body || !document.activeElement)
        returnTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, picker]);

  const items: Item[] = useMemo(() => {
    if (!q) return [];
    const st = get();
    const tab = activeTab(st);
    const path = tab && tab.mode !== 'shortcuts' ? tab.path : null;

    if (picker === 'theme') {
      const choices: { id: 'light' | 'dark' | null; label: string; detail: string }[] = [
        { id: 'light', label: 'Light', detail: 'Paper: the light editor theme' },
        { id: 'dark', label: 'Dark', detail: 'Ink: the dark editor theme' },
        { id: null, label: 'Follow System', detail: 'Light or dark with the operating system' },
      ];
      return choices
        .map((c) => ({ c, m: fuzzy(value, c.label) }))
        .filter((x) => x.m)
        .map(({ c, m }, i) => ({
          id: String(c.id),
          label: c.label,
          hits: m?.hits,
          description: c.detail,
          group: i === 0 ? 'themes' : undefined,
          preview: () => writeScheme(c.id),
          run: () => {
            before.current = undefined;
            writeScheme(c.id);
          },
        }));
    }

    if (value.startsWith('>')) {
      const query = value.slice(1).trim();
      const all = COMMANDS.filter((c) => !c.hidden);
      const scored = all
        .map((c) => ({ c, m: fuzzy(query, label(c)) }))
        .filter((x) => x.m)
        .sort((a, b) =>
          query ? (b.m as { score: number }).score - (a.m as { score: number }).score : 0,
        );
      const recent = query
        ? []
        : recentCommands
            .map((id) => scored.find((x) => x.c.id === id))
            .filter((x): x is (typeof scored)[number] => !!x);
      const rest = scored.filter((x) => !recent.includes(x));
      return [
        ...recent.map((x) => ({ ...x, group: 'recently used' })),
        ...rest.map((x, i) => ({
          ...x,
          group: recent.length && i === 0 ? 'other commands' : undefined,
        })),
      ].map(({ c, m, group }) => ({
        id: c.id,
        label: label(c),
        hits: m?.hits,
        keys: bindingsOf(c, mac)
          .slice(0, 1)
          .map((b) => keyLabel(b, mac))
          .join(''),
        group,
        run: () => runCommand(c.id),
      }));
    }

    if (value.startsWith(':')) {
      const lines = path ? buffers[path].split('\n').length : 0;
      const [l, c] = value
        .slice(1)
        .split(/[:,]/)
        .map((x) => Number.parseInt(x, 10));
      const cur = path ? st.cursor[path] : undefined;
      if (!path)
        return [{ id: 'none', label: 'Open a text editor first to go to a line.', run: () => {} }];
      if (!l)
        return [
          {
            id: 'info',
            label: `Current Line: ${(cur?.line ?? 0) + 1}, Character: ${(cur?.col ?? 0) + 1}. Type a line number between 1 and ${lines} to navigate to.`,
            run: () => {},
          },
        ];
      const line = Math.min(lines, Math.max(1, l)) - 1;
      return [
        {
          id: 'go',
          label: c ? `Go to line ${line + 1}, character ${c}.` : `Go to line ${line + 1}.`,
          run: () => openFile(path, { line, col: c ? c - 1 : 0 }),
        },
      ];
    }

    if (value.startsWith('@')) {
      if (!path)
        return [
          {
            id: 'none',
            label: 'To go to a symbol, first open a text editor with symbol information.',
            run: () => {},
          },
        ];
      const query = value.slice(1).trim();
      return flatSymbols(symbols(path, buffers[path]))
        .map(({ sym, path: parents }) => ({ sym, parents, m: fuzzy(query, sym.name) }))
        .filter((x) => x.m && x.sym.name)
        .sort((a, b) =>
          query
            ? (b.m as { score: number }).score - (a.m as { score: number }).score
            : a.sym.line - b.sym.line,
        )
        .slice(0, 200)
        .map(({ sym, parents, m }, i) => ({
          id: `${sym.line}:${sym.col}:${i}`,
          label: sym.name,
          hits: m?.hits,
          description: parents.join(' › '),
          icon: <SymIcon kind={sym.kind} />,
          group: i === 0 ? `symbols (${path.split('/').pop()})` : undefined,
          run: () => openFile(path, { line: sym.line, col: sym.col }),
        }));
    }

    if (value.startsWith('#')) {
      const query = value.slice(1).trim();
      if (!query)
        return [
          {
            id: 'hint',
            label: 'Type a symbol name to search across the repository: a role, a heading, a key.',
            run: () => {},
          },
        ];
      const out: (Item & { score: number })[] = [];
      for (const p of PATHS) {
        for (const { sym } of flatSymbols(symbols(p, buffers[p]))) {
          const m = sym.name && fuzzy(query, sym.name);
          if (m)
            out.push({
              id: `${p}:${sym.line}:${sym.col}`,
              label: sym.name,
              hits: m.hits,
              description: p,
              icon: <SymIcon kind={sym.kind} />,
              score: m.score,
              run: () => openFile(p, { line: sym.line, col: sym.col }),
            });
        }
      }
      return out.sort((a, b) => b.score - a.score).slice(0, 120);
    }

    if (value.startsWith('?')) {
      const help: [string, string][] = [
        ['', 'Go to File'],
        ['>', 'Show and Run Commands'],
        ['@', 'Go to Symbol in Editor'],
        ['#', 'Go to Symbol in Workspace'],
        [':', 'Go to Line/Column'],
      ];
      return help.map(([prefix, text]) => ({
        id: `help${prefix}`,
        label: prefix || '…',
        description: text,
        run: () => quick(prefix),
      }));
    }

    // Files: recent first when nothing is typed.
    const query = value.trim();
    if (!query) {
      const recent = recentFiles.filter((p) => PATHS.includes(p));
      const rest = PATHS.filter((p) => !recent.includes(p));
      return [...recent, ...rest].map((p, i) => ({
        id: p,
        label: p.split('/').pop() as string,
        description: p.split('/').slice(0, -1).join('/') || REPO,
        icon: <FileIcon path={p} />,
        group:
          i === 0 && recent.length ? 'recently opened' : i === recent.length ? 'files' : undefined,
        run: () => openFile(p),
      }));
    }
    return PATHS.map((p) => ({ p, m: fuzzyPath(query, p) }))
      .filter((x) => x.m)
      .sort((a, b) => (b.m as { score: number }).score - (a.m as { score: number }).score)
      .map(({ p, m }) => ({
        id: p,
        label: p.split('/').pop() as string,
        hits: m?.name,
        description: p.split('/').slice(0, -1).join('/') || REPO,
        descHits: m?.dir,
        icon: <FileIcon path={p} />,
        run: () => openFile(p),
      }));
  }, [q, value, picker, buffers, recentFiles, recentCommands, mac]);

  const current = Math.min(active, Math.max(0, items.length - 1));

  // The highlighted item previews (the theme picker) and stays in view.
  useEffect(() => {
    items[current]?.preview?.();
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current, items]);

  if (!q) return null;

  const close = (cancel: boolean) => {
    if (cancel && picker === 'theme' && before.current !== undefined) writeScheme(before.current);
    closeQuick();
  };

  const accept = (i: number) => {
    const item = items[i];
    if (!item) return;
    // `?` items switch the box to another picker; the rest act and close it.
    if (item.id.startsWith('help')) {
      item.run();
      setActive(0);
      return;
    }
    closeQuick();
    item.run();
  };

  const placeholder =
    picker === 'theme'
      ? 'Select Color Theme (Up/Down Keys to Preview)'
      : value.startsWith('>')
        ? ''
        : `Search files by name (append : to go to line or @ to go to symbol)`;

  return (
    <div className={s.quickWrap} onMouseDown={(e) => e.target === e.currentTarget && close(true)}>
      <div
        className={s.quick}
        role="dialog"
        aria-label={
          picker === 'theme'
            ? 'Color theme'
            : value.startsWith('>')
              ? 'Command palette'
              : 'Quick open'
        }
      >
        <input
          ref={input}
          className={s.quickInput}
          value={value}
          placeholder={placeholder}
          role="combobox"
          aria-expanded="true"
          aria-controls="quick-list"
          aria-activedescendant={items[current] ? `quick-${current}` : undefined}
          aria-autocomplete="list"
          spellCheck={false}
          onChange={(e) => quick(e.target.value, picker)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((current + 1) % Math.max(1, items.length));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((current - 1 + items.length) % Math.max(1, items.length));
            } else if (e.key === 'PageDown') {
              e.preventDefault();
              setActive(Math.min(items.length - 1, current + 10));
            } else if (e.key === 'PageUp') {
              e.preventDefault();
              setActive(Math.max(0, current - 10));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              accept(current);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            }
          }}
          onBlur={(e) => {
            if (
              !e.relatedTarget ||
              !(e.currentTarget.parentElement as HTMLElement).contains(e.relatedTarget as Node)
            )
              close(true);
          }}
        />
        <ul ref={list} id="quick-list" className={s.quickList} role="listbox">
          {items.length === 0 && (
            <li className={s.quickEmpty}>
              {value.startsWith('>') ? 'No matching commands' : 'No matching results'}
            </li>
          )}
          {items.map((it, i) => (
            <li
              key={it.id}
              id={`quick-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === current}
              data-group={it.group ? true : undefined}
              onMouseMove={() => i !== current && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => accept(i)}
            >
              {it.icon}
              <span className={s.quickLabel}>
                <Hl text={it.label} hits={it.hits} />
              </span>
              {it.description && (
                <span className={s.quickDesc}>
                  <Hl text={it.description} hits={it.descHits} />
                </span>
              )}
              {it.group && <span className={s.quickGroup}>{it.group}</span>}
              {it.keys && <kbd className={s.quickKeys}>{it.keys}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
