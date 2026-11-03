'use client';

// The editors that aren't text: the Markdown preview (live, following the editor's scroll, with
// links that open files or the real URL), the Keyboard Shortcuts editor and the working tree diff.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { COMMANDS, bindingsOf, isMac, keyLabel, label, runCommand } from './commands';
import { unified } from './diff';
import { Markdown, type LinkTarget, type MdOptions } from './markdown';
import { isDir, isFile, openFile, revealInExplorer, useWb } from './store';
import { langOf } from './syntax';
import s from './editor.module.scss';

const previewScroll = new Map<string, number>();
const noop = () => () => {};

export const useMac = () => useSyncExternalStore(noop, isMac, () => true);

/* ------------------------------------------------------------------ preview */

export function Preview({ path, tabKey, group }: { path: string; tabKey: string; group: number }) {
  const text = useWb((st) => st.buffers[path]);
  const reveal = useWb((st) => st.reveal);
  const ref = useRef<HTMLDivElement>(null);
  const dir = path.split('/').slice(0, -1).join('/');

  const scrollToAnchor = (anchor: string) => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchor)}"]`);
    if (el && ref.current) ref.current.scrollTop = el.offsetTop - 12;
  };

  const options: MdOptions = useMemo(
    () => ({
      dir,
      lines: true,
      onLink: (t: LinkTarget) => {
        if (t.path) {
          if (isFile(t.path)) {
            if (langOf(t.path) === 'markdown')
              openFile(t.path, { mode: 'preview', group, anchor: t.anchor });
            else openFile(t.path, { group: group === 0 ? 0 : 0 });
          } else if (isDir(t.path.replace(/\/$/, ''))) revealInExplorer(t.path.replace(/\/$/, ''));
          return;
        }
        if (t.anchor) scrollToAnchor(t.anchor);
      },
    }),
    [dir, group],
  );

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = previewScroll.get(tabKey) ?? 0;
  }, [tabKey]);

  // Anchors from links into this file.
  useEffect(() => {
    if (!reveal || reveal.path !== path || !reveal.anchor) return;
    const t = window.setTimeout(() => scrollToAnchor(reveal.anchor as string), 30);
    return () => window.clearTimeout(t);
  }, [reveal, path]);

  // Scroll with the editor showing the same file.
  useEffect(() => {
    const onScroll = (e: Event) => {
      const { path: p, line } = (e as CustomEvent<{ path: string; line: number }>).detail;
      const box = ref.current;
      if (p !== path || !box) return;
      const blocks = [...box.querySelectorAll<HTMLElement>('[data-line]')];
      let best: HTMLElement | null = null;
      let next: HTMLElement | null = null;
      for (const b of blocks) {
        if (Number(b.dataset.line) <= line) best = b;
        else {
          next = b;
          break;
        }
      }
      if (!best) {
        box.scrollTop = 0;
        return;
      }
      // Interpolate between this block and the next, the way the preview tracks the source.
      const a = Number(best.dataset.line);
      const b = next ? Number(next.dataset.line) : a + 1;
      const frac = Math.min(1, (line - a) / Math.max(1, b - a));
      const top = best.offsetTop + (next ? (next.offsetTop - best.offsetTop) * frac : 0);
      box.scrollTop = top - 8;
    };
    window.addEventListener('editor-scroll', onScroll);
    return () => window.removeEventListener('editor-scroll', onScroll);
  }, [path]);

  return (
    <div
      ref={ref}
      className={s.preview}
      onScroll={(e) => previewScroll.set(tabKey, e.currentTarget.scrollTop)}
      onDoubleClick={(e) => {
        // Double-click jumps to the source line.
        const block = (e.target as HTMLElement).closest<HTMLElement>('[data-line]');
        if (block) openFile(path, { line: Number(block.dataset.line), group: 0 });
      }}
    >
      <article className={s.md}>
        <Markdown text={text} options={options} />
      </article>
    </div>
  );
}

/* ------------------------------------------------------------------ keyboard shortcuts */

export function Shortcuts() {
  const mac = useMac();
  const [q, setQ] = useState('');
  const rows = COMMANDS.filter((c) => !c.hidden || bindingsOf(c, mac).length).filter(
    (c) =>
      !q ||
      `${label(c)} ${c.id} ${bindingsOf(c, mac)
        .map((b) => keyLabel(b, mac))
        .join(' ')}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <div className={s.shortcuts}>
      <input
        className={s.field}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Type to search in keybindings"
        aria-label="Search keybindings"
      />
      <div className={s.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Command</th>
              <th>Keybinding</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                tabIndex={0}
                onDoubleClick={() => runCommand(c.id)}
                onKeyDown={(e) => e.key === 'Enter' && runCommand(c.id)}
                title="Double-click or Enter to run"
              >
                <td>
                  {label(c)}
                  <span className={s.dim}> {c.id}</span>
                </td>
                <td>
                  {bindingsOf(c, mac).map((b) => (
                    <kbd key={b}>{keyLabel(b, mac)}</kbd>
                  ))}
                </td>
                <td className={s.dim}>
                  {c.id.startsWith('site.') || c.id.startsWith('npm.') ? 'Workspace' : 'Default'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ diff */

export function DiffView({ path }: { path: string }) {
  const head = useWb((st) => st.head[path]);
  const text = useWb((st) => st.buffers[path]);
  // Each line with its old and new numbers.
  const rows = useMemo(() => {
    const out: { line: string; hunk: boolean; op: string; a: number | ''; b: number | '' }[] = [];
    let a = 0;
    let b = 0;
    for (const line of unified(head, text)) {
      const hunk = /^@@ -(\d+),\d+ \+(\d+),\d+ @@/.exec(line);
      if (hunk) {
        a = Number(hunk[1]);
        b = Number(hunk[2]);
        out.push({ line, hunk: true, op: '', a: '', b: '' });
        continue;
      }
      const op = line[0];
      out.push({
        line: line.slice(1),
        hunk: false,
        op,
        a: op === '+' ? '' : a++,
        b: op === '-' ? '' : b++,
      });
    }
    return out;
  }, [head, text]);
  if (!rows.length)
    return <p className={s.emptyNote}>No changes in {path} since the last commit.</p>;
  return (
    <div className={s.diff} role="table" aria-label={`Changes in ${path}`}>
      {rows.map((r, i) =>
        r.hunk ? (
          <div key={i} className={s.diffHunk} role="row">
            {r.line}
          </div>
        ) : (
          <div
            key={i}
            className={s.diffLine}
            data-op={r.op === '+' ? 'add' : r.op === '-' ? 'del' : undefined}
            role="row"
          >
            <span className={s.diffNum}>{r.a}</span>
            <span className={s.diffNum}>{r.b}</span>
            <span className={s.diffOp}>{r.op === ' ' ? '' : r.op}</span>
            <span className={s.diffText}>{r.line || '\u200b'}</span>
          </div>
        ),
      )}
    </div>
  );
}
