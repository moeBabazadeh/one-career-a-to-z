'use client';

// The editor surface. The text lives in a real <textarea> laid exactly over the highlighted lines,
// so the caret, selection, keyboard navigation, IME, copy and undo are the browser's own, while
// every line underneath is drawn from the tokenizer with its gutter: line numbers, change bars
// against HEAD, blame, indent guides, bracket pairs, problems and find matches. Cmd/Ctrl-click
// follows a link; hovering shows what the editor knows about the spot.

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { onUi, openUrl } from './commands';
import { carryBlame, lineDiff, type LineChange } from './diff';
import { resolve } from './markdown';
import Minimap from './Minimap';
import { COMMIT_MAP, agoOf, dateOf, longDateOf, type Commit } from './repo';
import {
  UNCOMMITTED,
  allDiagnostics,
  flash,
  get,
  isDir,
  isFile,
  openFile,
  revealInExplorer,
  set,
  showView,
  useWb,
  type Reveal,
} from './store';
import { tokenize, type Lang, type Token } from './syntax';
import s from './editor.module.scss';

const LINE_H = 20;

interface Deco {
  start: number;
  end: number;
  cls: string;
  /** Index into the file's diagnostics, for the hover. */
  diag?: number;
}

/* ------------------------------------------------------------------ helpers */

/** Splits a line into spans at every token and decoration boundary. */
function segments(text: string, tokens: Token[], decos: Deco[]): ReactNode[] {
  if (!text) return [];
  const cuts = new Set([0, text.length]);
  for (const t of tokens) cuts.add(t.start).add(t.end);
  for (const d of decos)
    cuts
      .add(Math.max(0, Math.min(text.length, d.start)))
      .add(Math.max(0, Math.min(text.length, d.end)));
  const points = [...cuts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const out: ReactNode[] = [];
  let t = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a === b) continue;
    while (t < tokens.length && tokens[t].end <= a) t++;
    const tok = tokens[t] && tokens[t].start <= a ? tokens[t] : null;
    const classes = [tok ? s[`tk_${tok.kind}`] : ''];
    let diag: number | undefined;
    for (const d of decos) {
      if (d.start <= a && d.end >= b) {
        classes.push(s[d.cls]);
        if (d.diag !== undefined) diag = d.diag;
      }
    }
    const cls = classes.filter(Boolean).join(' ');
    if (!cls && !tok?.href) out.push(text.slice(a, b));
    else
      out.push(
        <span key={a} className={cls || undefined} data-href={tok?.href} data-diag={diag}>
          {text.slice(a, b)}
        </span>,
      );
  }
  return out;
}

/** Bracket pairs, from punctuation tokens only, so brackets in strings and comments don't count. */
function bracketPairs(lines: string[], tokens: Token[][]) {
  const open = '([{';
  const close = ')]}';
  const pairs = new Map<string, [number, number]>();
  const stack: [number, number, string][] = [];
  tokens.forEach((toks, n) => {
    for (const t of toks) {
      if (t.kind !== 'punct' || t.end - t.start !== 1) continue;
      const ch = lines[n][t.start];
      if (open.includes(ch)) stack.push([n, t.start, ch]);
      else if (close.includes(ch)) {
        const top = stack[stack.length - 1];
        if (top && open.indexOf(top[2]) === close.indexOf(ch)) {
          stack.pop();
          pairs.set(`${top[0]}:${top[1]}`, [n, t.start]);
          pairs.set(`${n}:${t.start}`, [top[0], top[1]]);
        }
      }
    }
  });
  return pairs;
}

function indents(lines: string[]) {
  const raw = lines.map((l) => (l.trim() ? Math.floor((l.length - l.trimStart().length) / 2) : -1));
  // Blank lines take the indent of the next line that has text, the way guides run through them.
  for (let i = raw.length - 1, next = 0; i >= 0; i--) {
    if (raw[i] < 0) raw[i] = next;
    else next = raw[i];
  }
  return raw;
}

const offsetOf = (lines: string[], line: number, col: number) => {
  let at = 0;
  for (let i = 0; i < Math.min(line, lines.length); i++) at += lines[i].length + 1;
  return at + Math.min(col, lines[Math.min(line, lines.length - 1)]?.length ?? 0);
};

function posOf(text: string, offset: number) {
  let line = 0;
  let start = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      start = i + 1;
    }
  }
  return { line, col: offset - start };
}

export interface FindState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export function findRegex(f: FindState): RegExp | null {
  if (!f.query) return null;
  try {
    const src = f.regex ? f.query : f.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(f.wholeWord ? `\\b${src}\\b` : src, f.matchCase ? 'g' : 'gi');
  } catch {
    return null;
  }
}

export function findAll(lines: string[], re: RegExp | null) {
  const out: { line: number; start: number; end: number }[] = [];
  if (!re) return out;
  lines.forEach((text, line) => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!m[0].length) {
        re.lastIndex++;
        continue;
      }
      out.push({ line, start: m.index, end: m.index + m[0].length });
      if (out.length > 2000) return;
    }
  });
  return out;
}

/** Where tabs keep their scroll and selection while another tab is showing. */
const viewState = new Map<string, { top: number; left: number; start: number; end: number }>();
const handledReveals = new Set<number>();

/* ------------------------------------------------------------------ a line */

interface LineProps {
  n: number;
  text: string;
  tokens: Token[];
  decos: Deco[];
  current: boolean;
  change: LineChange;
  deletedAbove: boolean;
  blame: { commit: Commit | null; first: boolean; age: number } | null;
  after: string | null;
  indent: number;
}

const Line = memo(
  function Line({
    n,
    text,
    tokens,
    decos,
    current,
    change,
    deletedAbove,
    blame,
    after,
    indent,
  }: LineProps) {
    return (
      <div className={s.line} data-ln={n} data-current={current || undefined}>
        <div className={s.gutter}>
          {blame && (
            <span
              className={s.blameCell}
              data-first={blame.first || undefined}
              style={{ '--age': blame.age } as CSSProperties}
              data-commit={blame.commit?.id ?? UNCOMMITTED}
            >
              {blame.first && (
                <>
                  <span className={s.blameMsg}>
                    {blame.commit ? blame.commit.subject : 'Uncommitted changes'}
                  </span>
                  <span className={s.blameDate}>{blame.commit ? dateOf(blame.commit) : 'now'}</span>
                </>
              )}
            </span>
          )}
          <span className={s.ln}>{n + 1}</span>
          <span
            className={s.change}
            data-change={change ?? undefined}
            data-deleted={deletedAbove || undefined}
          />
        </div>
        <div className={s.code}>
          {indent > 0 && (
            <span className={s.guides} style={{ width: `${indent * 2}ch` }} aria-hidden="true" />
          )}
          {segments(text, tokens, decos)}
          {text ? null : '​'}
          {after && (
            <span className={s.after}>
              <span className={s.afterText} data-blame-line={n}>
                {after}
              </span>
            </span>
          )}
        </div>
      </div>
    );
  },
  (a, b) =>
    a.text === b.text &&
    a.tokens === b.tokens &&
    a.current === b.current &&
    a.change === b.change &&
    a.deletedAbove === b.deletedAbove &&
    a.after === b.after &&
    a.indent === b.indent &&
    a.blame?.commit === b.blame?.commit &&
    a.blame?.first === b.blame?.first &&
    a.blame?.age === b.blame?.age &&
    (a.blame === null) === (b.blame === null) &&
    a.decos.length === b.decos.length &&
    a.decos.every(
      (d, i) =>
        d.start === b.decos[i].start && d.end === b.decos[i].end && d.cls === b.decos[i].cls,
    ),
);

/* ------------------------------------------------------------------ hover */

type Hover =
  | { x: number; y: number; kind: 'link'; href: string }
  | { x: number; y: number; kind: 'blame'; commit: Commit | null }
  | { x: number; y: number; kind: 'diag'; index: number };

/* ------------------------------------------------------------------ the view */

interface Props {
  path: string;
  lang: Lang;
  tabKey: string;
  group: number;
  phone: boolean;
}

export default function CodeView({ path, lang, tabKey, group, phone }: Props) {
  const text = useWb((st) => st.buffers[path]);
  const head = useWb((st) => st.head[path]);
  const headBlame = useWb((st) => st.blame[path]);
  const commits = useWb((st) => st.commits);
  const minimap = useWb((st) => st.minimap);
  const wrapPref = useWb((st) => st.wrap);
  const blameGutter = useWb((st) => st.blameGutter);
  const lineBlame = useWb((st) => st.lineBlame);
  const reveal = useWb((st) => st.reveal);
  const tabFocus = useWb((st) => st.tabFocus);
  const buffers = useWb((st) => st.buffers);
  const isActive = useWb((st) => st.groups[st.activeGroup]?.active === tabKey);

  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const linesEl = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef(0);
  const keyNav = useRef(false);
  const [cursor, setCursor] = useState({ line: 0, col: 0, start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const [flashRange, setFlashRange] = useState<{
    line: number;
    start: number;
    end: number;
    endLine: number;
  } | null>(null);
  const [find, setFind] = useState<(FindState & { open: boolean }) | null>(null);
  const [editing, setEditing] = useState(false);
  const findInput = useRef<HTMLInputElement>(null);

  const wrap = phone || (wrapPref ?? lang === 'markdown');
  const readOnly = phone && !editing;

  const lines = useMemo(() => text.split('\n'), [text]);
  const tokens = useMemo(() => tokenize(text, lang), [text, lang]);
  const diff = useMemo(() => lineDiff(head, text), [head, text]);
  const owners = useMemo(
    () => (text === head ? headBlame : carryBlame(head, headBlame, text, UNCOMMITTED)),
    [text, head, headBlame],
  );
  const pairs = useMemo(() => bracketPairs(lines, tokens), [lines, tokens]);
  const indentOf = useMemo(() => indents(lines), [lines]);
  const diags = useMemo(() => allDiagnostics(buffers)[path] ?? [], [buffers, path]);
  const digits = String(lines.length).length;
  const commitOf = useMemo(() => {
    const map = new Map<string, Commit>(commits.map((c) => [c.id, c]));
    return (id: string) => (id === UNCOMMITTED ? null : (map.get(id) ?? COMMIT_MAP[id] ?? null));
  }, [commits]);

  const findRe = useMemo(() => (find?.open ? findRegex(find) : null), [find]);
  const matches = useMemo(() => findAll(lines, findRe), [lines, findRe]);
  const currentMatch = useMemo(() => {
    if (!matches.length) return -1;
    const at = matches.findIndex(
      (m) =>
        m.line === cursor.line &&
        m.start === cursor.col - (cursor.end - cursor.start) &&
        cursor.end !== cursor.start,
    );
    return at;
  }, [matches, cursor]);
  // With no match selected, the count starts from the next one after the caret.
  const nearestMatch = useMemo(() => {
    if (currentMatch >= 0 || !matches.length) return currentMatch;
    const after = matches.findIndex(
      (m) => m.line > cursor.line || (m.line === cursor.line && m.start >= cursor.col),
    );
    return after < 0 ? 0 : after;
  }, [matches, cursor, currentMatch]);

  // Ages for the blame heat: newest commits are the strongest.
  const ages = useMemo(() => {
    const dated = [...new Set(owners)]
      .map(commitOf)
      .filter((c): c is Commit => !!c && !!(c.date || c.time));
    const years = dated.map((c) => (c.time ? 9999 : (c.date as { y: number }).y));
    const min = Math.min(...years);
    const max = Math.max(...years);
    return (c: Commit | null) =>
      !c ? 1 : c.time ? 1 : c.date ? (max === min ? 1 : (c.date.y - min) / (max - min)) : 0;
  }, [owners, commitOf]);

  /* decorations per line */
  const decos = useMemo(() => {
    const out: Deco[][] = lines.map(() => []);
    diags.forEach((d, i) => {
      for (let n = d.line; n <= d.endLine && n < lines.length; n++) {
        const start = n === d.line ? d.col : 0;
        const end = n === d.endLine ? d.endCol : lines[n].length;
        out[n].push({
          start,
          end: Math.max(end, start + 1),
          cls: d.severity === 'error' ? 'sqErr' : 'sqWarn',
          diag: i,
        });
      }
    });
    matches.forEach((m, i) =>
      out[m.line]?.push({
        start: m.start,
        end: m.end,
        cls: i === currentMatch ? 'findCurrent' : 'findMatch',
      }),
    );
    if (flashRange) {
      for (let n = flashRange.line; n <= flashRange.endLine && n < lines.length; n++) {
        out[n].push({
          start: n === flashRange.line ? flashRange.start : 0,
          end: n === flashRange.endLine ? flashRange.end : lines[n].length,
          cls: 'revealFlash',
        });
      }
    }
    // The bracket at the caret and its pair.
    if (cursor.start === cursor.end) {
      const at = pairs.get(`${cursor.line}:${cursor.col}`)
        ? cursor.col
        : pairs.get(`${cursor.line}:${cursor.col - 1}`)
          ? cursor.col - 1
          : -1;
      if (at >= 0) {
        const other = pairs.get(`${cursor.line}:${at}`) as [number, number];
        out[cursor.line].push({ start: at, end: at + 1, cls: 'bracket' });
        out[other[0]]?.push({ start: other[1], end: other[1] + 1, cls: 'bracket' });
      }
    }
    return out;
  }, [lines, diags, matches, currentMatch, flashRange, cursor, pairs]);

  /* keep the textarea in step with the buffer when it changes from elsewhere */
  useLayoutEffect(() => {
    const ta = area.current;
    if (ta && ta.value !== text) {
      const { selectionStart, selectionEnd } = ta;
      ta.value = text;
      if (document.activeElement === ta)
        ta.setSelectionRange(
          Math.min(selectionStart, text.length),
          Math.min(selectionEnd, text.length),
        );
    }
  }, [text]);

  /* restore the tab's scroll and selection */
  useLayoutEffect(() => {
    const vs = viewState.get(tabKey);
    const sc = scroller.current;
    const ta = area.current;
    if (!sc || !ta || !vs) return;
    sc.scrollTop = vs.top;
    sc.scrollLeft = vs.left;
    ta.setSelectionRange(vs.start, vs.end);
  }, [tabKey]);

  const syncCursor = () => {
    const ta = area.current;
    if (!ta) return;
    const active = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
    const { line, col } = posOf(ta.value, active);
    const next = { line, col, start: ta.selectionStart, end: ta.selectionEnd };
    setCursor((prev) =>
      prev.line === next.line &&
      prev.col === next.col &&
      prev.start === next.start &&
      prev.end === next.end
        ? prev
        : next,
    );
    const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    const cur = get().cursor[path];
    const lineCount = selected ? selected.split('\n').length : 0;
    if (!cur || cur.line !== line || cur.col !== col || cur.chars !== selected.length) {
      set((st) => ({
        cursor: { ...st.cursor, [path]: { line, col, chars: selected.length, lines: lineCount } },
      }));
    }
    const vs = viewState.get(tabKey);
    viewState.set(tabKey, {
      top: vs?.top ?? 0,
      left: vs?.left ?? 0,
      start: ta.selectionStart,
      end: ta.selectionEnd,
    });
    if (keyNav.current) {
      keyNav.current = false;
      ensureVisible(line, col);
    }
  };

  const ensureVisible = (line: number, col: number) => {
    const sc = scroller.current;
    const row = linesEl.current?.children[line] as HTMLElement | undefined;
    if (!sc || !row) return;
    if (row.offsetTop < sc.scrollTop + 4) sc.scrollTop = row.offsetTop - 4;
    else if (row.offsetTop + LINE_H > sc.scrollTop + sc.clientHeight - 4)
      sc.scrollTop = row.offsetTop + LINE_H - sc.clientHeight + 4;
    if (!wrap && measure.current) {
      const ch = measure.current.getBoundingClientRect().width / 10;
      const gutter = (row.firstElementChild as HTMLElement).offsetWidth;
      const x = col * ch;
      const view = sc.clientWidth - gutter - 24;
      if (x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 24);
      else if (x > sc.scrollLeft + view) sc.scrollLeft = x - view + 24;
    }
  };

  // Selection changes from the keyboard, the mouse and the find widget all land here.
  useEffect(() => {
    const onSel = () => {
      if (document.activeElement === area.current) syncCursor();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  });

  const applyReveal = (r: Reveal) => {
    const ta = area.current;
    const sc = scroller.current;
    if (!ta || !sc) return;
    const start = offsetOf(lines, r.line, r.col);
    const end = offsetOf(lines, r.endLine, r.endCol);
    if (r.focus && !phone) ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, end);
    const row = linesEl.current?.children[r.line] as HTMLElement | undefined;
    if (row) sc.scrollTop = row.offsetTop - sc.clientHeight / 3;
    sc.scrollLeft = 0;
    viewState.set(tabKey, { top: sc.scrollTop, left: 0, start, end });
    syncCursor();
    if (end > start) {
      window.setTimeout(
        () => setFlashRange({ line: r.line, start: r.col, end: r.endCol, endLine: r.endLine }),
        0,
      );
      window.setTimeout(() => setFlashRange(null), 1400);
    }
  };

  /* reveal requests: Go to Line, search results, symbols, problems */
  useEffect(() => {
    if (!reveal || reveal.path !== path || handledReveals.has(reveal.n) || !isActive) return;
    handledReveals.add(reveal.n);
    applyReveal(reveal);
  });

  /* commands that reach into the editor */
  useEffect(() => {
    const mine = () => {
      const st = get();
      return st.groups[st.activeGroup]?.active === tabKey;
    };
    const offFind = onUi('find', () => {
      if (!mine()) return;
      const ta = area.current;
      const selected = ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '';
      setFind((f) => ({
        query: selected && !selected.includes('\n') ? selected : (f?.query ?? ''),
        matchCase: f?.matchCase ?? false,
        wholeWord: f?.wholeWord ?? false,
        regex: f?.regex ?? false,
        open: true,
      }));
      window.setTimeout(() => {
        findInput.current?.focus();
        findInput.current?.select();
      }, 0);
    });
    const offFocus = onUi('focus-editor', () => {
      if (mine() && !phone) area.current?.focus({ preventScroll: true });
    });
    return () => {
      offFind();
      offFocus();
    };
  });

  /* editing */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    setHover(null);
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'PageUp',
        'PageDown',
        'Home',
        'End',
      ].includes(e.key)
    )
      keyNav.current = true;
    if (e.key === 'Escape' && find?.open) {
      setFind((f) => (f ? { ...f, open: false } : f));
      return;
    }
    if (ta.readOnly) return;
    if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !tabFocus) {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      return;
    }
    if (
      e.key === 'Enter' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      ta.selectionStart === ta.selectionEnd
    ) {
      const before = ta.value.slice(0, ta.selectionStart);
      const lineStart = before.lastIndexOf('\n') + 1;
      const current = before.slice(lineStart);
      let indent = /^\s*/.exec(current)?.[0] ?? '';
      if (/[{[(]\s*$/.test(current)) indent += '  ';
      const list = lang === 'markdown' ? /^(\s*)([-*+]|\d+[.)])\s+(?=\S)/.exec(current) : null;
      if (list)
        indent = `${list[1]}${/\d/.test(list[2]) ? `${Number.parseInt(list[2], 10) + 1}${list[2].slice(-1)}` : list[2]} `;
      e.preventDefault();
      document.execCommand('insertText', false, `\n${indent}`);
    }
  };

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const value = e.currentTarget.value;
    set((st) =>
      st.buffers[path] === value
        ? {}
        : {
            buffers: { ...st.buffers, [path]: value },
            groups: st.groups.map((g) => ({
              ...g,
              tabs: g.tabs.map((t) => (t.path === path && !t.pinned ? { ...t, pinned: true } : t)),
            })),
          },
    );
  };

  /* hovers and links */
  const pick = (x: number, y: number) => {
    const els = document.elementsFromPoint(x, y) as HTMLElement[];
    for (const el of els) {
      if (!scroller.current?.contains(el)) continue;
      if (el.dataset.href) return { kind: 'link' as const, el };
      if (el.dataset.blameLine !== undefined) return { kind: 'blame' as const, el };
      if (el.dataset.commit !== undefined) return { kind: 'gutterBlame' as const, el };
      if (el.dataset.diag !== undefined) return { kind: 'diag' as const, el };
    }
    return null;
  };

  const follow = (href: string) => {
    if (/^(https?:|mailto:)/.test(href)) {
      if (href.startsWith('mailto:')) window.location.href = href;
      else openUrl(href);
      return;
    }
    if (href.startsWith('/')) {
      openUrl(href);
      return;
    }
    const target = resolve(path.split('/').slice(0, -1).join('/'), href);
    if (target.path && isFile(target.path))
      openFile(target.path, target.anchor ? { anchor: target.anchor } : {});
    else if (target.path && isDir(target.path.replace(/\/$/, ''))) {
      revealInExplorer(target.path.replace(/\/$/, ''));
      showView('explorer');
    } else flash(`Could not open ${href}`);
  };

  const hot = useRef<HTMLElement | null>(null);
  const setHot = (el: HTMLElement | null) => {
    if (hot.current === el) return;
    hot.current?.classList.remove(s.linkHot);
    el?.classList.add(s.linkHot);
    hot.current = el;
    if (area.current) area.current.style.cursor = el ? 'pointer' : '';
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const hit = pick(e.clientX, e.clientY);
    setHot(mod && hit?.kind === 'link' ? hit.el : null);
    window.clearTimeout(hoverTimer.current);
    const { clientX, clientY } = e;
    hoverTimer.current = window.setTimeout(() => {
      const h = pick(clientX, clientY);
      const box = scroller.current?.parentElement?.getBoundingClientRect();
      if (!h || !box) {
        setHover(null);
        return;
      }
      const r = h.el.getBoundingClientRect();
      const x = Math.min(r.left - box.left, box.width - 340);
      const y = r.bottom - box.top + 4;
      if (h.kind === 'link') setHover({ kind: 'link', href: h.el.dataset.href as string, x, y });
      else if (h.kind === 'blame')
        setHover({ kind: 'blame', commit: commitOf(owners[Number(h.el.dataset.blameLine)]), x, y });
      else if (h.kind === 'gutterBlame')
        setHover({
          kind: 'blame',
          commit: commitOf(h.el.dataset.commit as string),
          x: r.left - box.left,
          y,
        });
      else setHover({ kind: 'diag', index: Number(h.el.dataset.diag), x, y });
    }, 380);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!(e.metaKey || e.ctrlKey) && !readOnly) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit?.kind === 'link') {
      e.preventDefault();
      follow(hit.el.dataset.href as string);
    } else if (readOnly) {
      // Reading on a phone: a tap moves the current line, for blame and breadcrumbs.
      const row = (document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[]).find(
        (el) => el.dataset.ln !== undefined,
      );
      if (row) {
        const line = Number(row.dataset.ln);
        const start = offsetOf(lines, line, 0);
        setCursor({ line, col: 0, start, end: start });
        set((st) => ({ cursor: { ...st.cursor, [path]: { line, col: 0, chars: 0, lines: 0 } } }));
      }
    }
  };

  // Holding Cmd/Ctrl over a link underlines it, before any mouse move.
  useEffect(() => {
    const up = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) setHot(null);
    };
    window.addEventListener('keyup', up);
    return () => window.removeEventListener('keyup', up);
  });

  /* scroll */
  const onScroll = () => {
    const sc = scroller.current;
    if (!sc) return;
    const ta = area.current;
    viewState.set(tabKey, {
      top: sc.scrollTop,
      left: sc.scrollLeft,
      start: ta?.selectionStart ?? 0,
      end: ta?.selectionEnd ?? 0,
    });
    setTick((t) => t + 1);
    setHover(null);
    // The preview of this file follows the editor.
    const first = Math.floor(sc.scrollTop / LINE_H);
    let line = first;
    if (wrap && linesEl.current) {
      const rows = linesEl.current.children;
      let lo = 0;
      let hi = rows.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((rows[mid] as HTMLElement).offsetTop <= sc.scrollTop) lo = mid;
        else hi = mid - 1;
      }
      line = lo;
    }
    window.dispatchEvent(new CustomEvent('editor-scroll', { detail: { path, line } }));
  };

  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  /* find widget */
  const goMatch = (dir: 1 | -1) => {
    if (!matches.length) return;
    const ta = area.current;
    const here = ta ? ta.selectionEnd : 0;
    const offsets = matches.map((m) => offsetOf(lines, m.line, m.start));
    let next =
      dir === 1
        ? offsets.findIndex((o) => o >= here)
        : (offsets
            .map((o, i) => [o, i])
            .filter(([o]) => o < (ta ? ta.selectionStart : 0))
            .pop()?.[1] ?? -1);
    if (next < 0) next = dir === 1 ? 0 : matches.length - 1;
    const m = matches[next];
    applyReveal({
      path,
      line: m.line,
      col: m.start,
      endLine: m.line,
      endCol: m.end,
      n: -1,
      focus: false,
    });
  };

  const current = cursor.line;
  const blameFor = (n: number) => {
    if (!blameGutter) return null;
    const c = commitOf(owners[n]);
    return { commit: c, first: n === 0 || owners[n - 1] !== owners[n], age: ages(c) };
  };
  const afterFor = (n: number) => {
    if (!lineBlame || n !== current || (!focused && !isActive && !phone)) return null;
    const c = commitOf(owners[n]);
    return c ? `${c.author}, ${agoOf(c)} • ${c.subject}` : 'You, Uncommitted changes';
  };

  const errorLines = useMemo(
    () => [...new Set(diags.filter((d) => d.severity === 'error').map((d) => d.line))],
    [diags],
  );
  const marks = useMemo(
    () => ({
      current,
      matches: matches.map((m) => m.line),
      changes: diff.change,
      errors: errorLines,
    }),
    [current, matches, diff.change, errorLines],
  );

  return (
    <div
      className={s.codeView}
      data-wrap={wrap || undefined}
      data-blame={blameGutter || undefined}
      data-focused={focused || undefined}
      data-readonly={readOnly || undefined}
      style={
        {
          '--gutter-w': `calc(${blameGutter ? '204px + ' : ''}${digits + 1}ch + 30px)`,
          '--digits': `${digits + 1}ch`,
        } as CSSProperties
      }
    >
      <div
        ref={scroller}
        className={s.scroller}
        onScroll={onScroll}
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          window.clearTimeout(hoverTimer.current);
          setHot(null);
        }}
        onMouseDown={onMouseDown}
      >
        <div className={s.sizer}>
          <div ref={linesEl} className={s.lines} role="presentation">
            {lines.map((line, n) => (
              <Line
                key={n}
                n={n}
                text={line}
                tokens={tokens[n]}
                decos={decos[n]}
                current={n === current}
                change={diff.change[n]}
                deletedAbove={diff.deletedAbove.has(n)}
                blame={blameFor(n)}
                after={afterFor(n)}
                indent={indentOf[n]}
              />
            ))}
          </div>
          <textarea
            ref={area}
            className={s.input}
            defaultValue={text}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            wrap={wrap ? 'soft' : 'off'}
            readOnly={readOnly}
            aria-label={`${path}, editor content. ${tabFocus ? 'Tab moves focus.' : 'Press Ctrl+M to make Tab move focus.'}`}
            aria-multiline="true"
            onKeyDown={onKeyDown}
            onInput={onInput}
            onFocus={() => {
              setFocused(true);
              set({ focusPath: path, activeGroup: group });
              syncCursor();
            }}
            onBlur={() => setFocused(false)}
            onMouseUp={syncCursor}
          />
        </div>
        <span ref={measure} className={s.measure} aria-hidden="true">
          MMMMMMMMMM
        </span>
      </div>
      {minimap && !phone && <Minimap lines={lines} tokens={tokens} marks={marks} tick={tick} />}
      {phone && (
        <button
          type="button"
          className={s.editToggle}
          data-on={editing || undefined}
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      )}
      {find?.open && (
        <div className={s.findWidget} role="search">
          <input
            ref={findInput}
            value={find.query}
            placeholder="Find"
            aria-label="Find"
            onChange={(e) => setFind({ ...find, query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                goMatch(e.shiftKey ? -1 : 1);
              } else if (e.key === 'Escape') {
                setFind({ ...find, open: false });
                area.current?.focus({ preventScroll: true });
              }
            }}
          />
          <button
            type="button"
            className={s.toggle}
            aria-pressed={find.matchCase}
            title="Match Case"
            onClick={() => setFind({ ...find, matchCase: !find.matchCase })}
          >
            Aa
          </button>
          <button
            type="button"
            className={s.toggle}
            aria-pressed={find.wholeWord}
            title="Match Whole Word"
            onClick={() => setFind({ ...find, wholeWord: !find.wholeWord })}
          >
            <u>ab</u>
          </button>
          <button
            type="button"
            className={s.toggle}
            aria-pressed={find.regex}
            title="Use Regular Expression"
            onClick={() => setFind({ ...find, regex: !find.regex })}
          >
            .*
          </button>
          <span
            className={s.findCount}
            data-none={find.query && !matches.length ? true : undefined}
          >
            {!find.query
              ? 'No results'
              : matches.length
                ? `${nearestMatch + 1} of ${matches.length}`
                : 'No results'}
          </span>
          <button
            type="button"
            className={s.iconBtn}
            title="Previous Match (Shift+Enter)"
            onClick={() => goMatch(-1)}
            aria-label="Previous match"
          >
            ↑
          </button>
          <button
            type="button"
            className={s.iconBtn}
            title="Next Match (Enter)"
            onClick={() => goMatch(1)}
            aria-label="Next match"
          >
            ↓
          </button>
          <button
            type="button"
            className={s.iconBtn}
            title="Close (Escape)"
            aria-label="Close find"
            onClick={() => {
              setFind({ ...find, open: false });
              area.current?.focus({ preventScroll: true });
            }}
          >
            ×
          </button>
        </div>
      )}
      {hover && (
        <div
          className={s.hover}
          style={{ left: Math.max(8, hover.x), top: hover.y }}
          onMouseLeave={() => setHover(null)}
          role="tooltip"
        >
          {hover.kind === 'link' && (
            <p>
              <button type="button" className={s.hoverLink} onClick={() => follow(hover.href)}>
                Follow link
              </button>{' '}
              <span className={s.dim}>(cmd + click)</span>
              <br />
              <code>{hover.href}</code>
            </p>
          )}
          {hover.kind === 'blame' &&
            (hover.commit ? (
              <div className={s.blameCard}>
                <p className={s.blameWho}>
                  <span className={s.avatar} aria-hidden="true">
                    {hover.commit.author
                      .split(' ')
                      .map((w) => w[0])
                      .join('')}
                  </span>
                  <span>
                    <b>{hover.commit.author}</b>, {agoOf(hover.commit)}{' '}
                    <span className={s.dim}>({longDateOf(hover.commit)})</span>
                  </span>
                </p>
                <p className={s.blameSubject}>{hover.commit.subject}</p>
                {hover.commit.body && <p className={s.dim}>{hover.commit.body}</p>}
                <p className={s.blameFoot}>
                  <code>{hover.commit.id}</code>
                  <button
                    type="button"
                    className={s.hoverLink}
                    onClick={() => {
                      showView('scm');
                      window.dispatchEvent(
                        new CustomEvent('scm-select', { detail: hover.commit?.id }),
                      );
                    }}
                  >
                    Show in Source Control
                  </button>
                </p>
              </div>
            ) : (
              <p>
                <b>You</b>, uncommitted changes.{' '}
                <span className={s.dim}>Save, then commit from Source Control.</span>
              </p>
            ))}
          {hover.kind === 'diag' && diags[hover.index] && (
            <p>
              {diags[hover.index].message}{' '}
              <span className={s.dim}>{diags[hover.index].source}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
