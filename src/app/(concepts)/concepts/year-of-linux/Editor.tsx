import { useState } from 'react';
import { profile } from '../_shared/data';
import { README, nodeAt, pretty } from './fs';
import { Icon } from './icons';
import { Menubar } from './Menu';
import s from './desktop.module.scss';

/** A document the editor has open: README.txt, or a path in the file system. */
export type Doc = string[] | 'readme';

const docName = (d: Doc) => (d === 'readme' ? 'README.txt' : d[d.length - 1]);
const docText = (d: Doc) => (d === 'readme' ? README : (nodeAt(d)?.text ?? []));
const docPath = (d: Doc) => (d === 'readme' ? '~/README.txt' : pretty(d));

const LINK = /(https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.]+|~\/Documents\/resume\.pdf)/g;

/** A line of text with its addresses made clickable and a search term marked. */
function Text({ line, find }: { line: string; find: string }) {
  const parts = line.split(LINK);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2) {
          const href = part.startsWith('http')
            ? part
            : part.includes('@')
              ? `mailto:${part}`
              : profile.cv;
          return (
            <a
              key={i}
              href={href}
              target={href.startsWith('mailto') ? undefined : '_blank'}
              rel="noreferrer"
            >
              {part}
            </a>
          );
        }
        if (!find) return <span key={i}>{part}</span>;
        const bits = part.split(
          new RegExp(`(${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        );
        return <span key={i}>{bits.map((b, j) => (j % 2 ? <mark key={j}>{b}</mark> : b))}</span>;
      })}
    </>
  );
}

interface EditorProps {
  docs: Doc[];
  active: number;
  onActivate: (i: number) => void;
  onCloseDoc: (i: number) => void;
  onClose: () => void;
  onOpenFiles: () => void;
  onAbout: () => void;
}

export default function Editor({
  docs,
  active,
  onActivate,
  onCloseDoc,
  onClose,
  onOpenFiles,
  onAbout,
}: EditorProps) {
  const [numbers, setNumbers] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState('');
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const doc = docs[active] ?? 'readme';
  const text = docText(doc);
  const hits = find
    ? text.reduce((n, l) => n + (l.toLowerCase().split(find.toLowerCase()).length - 1), 0)
    : 0;

  // The status bar follows the caret: the line it's on, and how far along.
  const track = () => {
    const sel = getSelection();
    const node = sel?.anchorNode;
    const el = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(
      '[data-ln]',
    );
    if (!el || !sel) return;
    let col = sel.anchorOffset;
    // Offsets count within a text node; add the text before it on the same line.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && n !== node; n = walker.nextNode())
      col += n.textContent?.length ?? 0;
    setPos({ ln: Number(el.dataset.ln), col: col + 1 });
  };

  const selectAll = () => {
    const page = document.getElementById('editor-page');
    if (page) getSelection()?.selectAllChildren(page);
  };

  return (
    <div className={s.app}>
      <Menubar
        menus={[
          {
            label: 'File',
            items: [
              { label: 'Open…', icon: 'folder', hint: 'Ctrl+O', onSelect: onOpenFiles },
              { label: 'Save', icon: 'document', disabled: true },
              { separator: true },
              {
                label: 'Close Document',
                disabled: active === 0,
                onSelect: () => onCloseDoc(active),
              },
              { label: 'Quit', onSelect: onClose },
            ],
          },
          { label: 'Edit', items: [{ label: 'Select All', onSelect: selectAll }] },
          {
            label: 'View',
            items: [
              { label: 'Line Numbers', checked: numbers, onSelect: () => setNumbers(!numbers) },
              { label: 'Text Wrapping', checked: wrap, onSelect: () => setWrap(!wrap) },
            ],
          },
          {
            label: 'Search',
            items: [
              { label: 'Find…', icon: 'search', hint: 'Ctrl+F', onSelect: () => setFindOpen(true) },
            ],
          },
          {
            label: 'Documents',
            items: docs.map((d, i) => ({
              label: docName(d),
              checked: i === active,
              onSelect: () => onActivate(i),
            })),
          },
          {
            label: 'Help',
            items: [{ label: 'About This Computer', icon: 'info', onSelect: onAbout }],
          },
        ]}
      />
      <div className={s.toolbar} role="toolbar" aria-label="Text Editor">
        <button type="button" className={s.toolBtn} onClick={onOpenFiles}>
          <Icon name="folder" size={22} />
          <span>Open</span>
        </button>
        <button type="button" className={s.toolBtn} disabled title="Read-only">
          <Icon name="document" size={22} />
          <span>Save</span>
        </button>
        <span className={s.toolSep} />
        <button
          type="button"
          className={s.toolBtn}
          aria-pressed={findOpen}
          onClick={() => setFindOpen(!findOpen)}
        >
          <Icon name="search" size={22} />
          <span>Find</span>
        </button>
      </div>
      <div className={s.notebook} role="tablist" aria-label="Documents">
        {docs.map((d, i) => (
          <div key={docPath(d)} className={`${s.ntab} ${i === active ? s.ntabOn : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => onActivate(i)}
              title={docPath(d)}
            >
              <Icon name="document" size={16} />
              {docName(d)}
            </button>
            {i > 0 && (
              <button
                type="button"
                className={s.ntabClose}
                aria-label={`Close ${docName(d)}`}
                onClick={() => onCloseDoc(i)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {findOpen && (
        <div className={s.findBar}>
          <label>
            Find:
            <input
              className={s.entry}
              value={find}
              autoFocus
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setFindOpen(false);
                  setFind('');
                }
              }}
            />
          </label>
          <span aria-live="polite">{find ? `${hits} match${hits === 1 ? '' : 'es'}` : ''}</span>
        </div>
      )}
      <div
        id="editor-page"
        className={`${s.editorPage} ${wrap ? '' : s.noWrap}`}
        tabIndex={0}
        role="document"
        aria-label={docName(doc)}
        onMouseUp={track}
        onKeyUp={track}
      >
        {text.map((line, i) => (
          <div
            key={i}
            className={`${s.edLine} ${/^[A-Z][A-Z ]+$/.test(line) ? s.edHead : ''}`}
            data-ln={i + 1}
          >
            {numbers && (
              <span className={s.ln} aria-hidden="true">
                {i + 1}
              </span>
            )}
            <span className={s.edText}>{line ? <Text line={line} find={find} /> : ' '}</span>
          </div>
        ))}
      </div>
      <p className={s.statusbar}>
        <span>{docPath(doc)}</span>
        <span>
          Ln {pos.ln}, Col {pos.col}
        </span>
        <span>INS</span>
      </p>
    </div>
  );
}
