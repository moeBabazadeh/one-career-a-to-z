import { useRef, useState } from 'react';
import { NOW, db } from '../_shared/data';
import { HOME, TRASH_PATH, USER, nodeAt, pretty, type FsNode } from './fs';
import { Icon } from './icons';
import { Menubar } from './Menu';
import s from './desktop.module.scss';

const SINCE = db.person.since;
const SPAN = NOW - SINCE;

const PLACES: { label: string; path: string[]; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { label: USER, path: HOME, icon: 'home' },
  { label: 'Desktop', path: [...HOME, 'Desktop'], icon: 'desktop' },
  { label: 'File System', path: [], icon: 'computer' },
  { label: 'Trash', path: TRASH_PATH, icon: 'trash' },
];
const BOOKMARKS = ['Work', 'Education', 'Awards', 'Projects', 'Patches', 'Documents'];

const kindName = (n: FsNode) =>
  ({
    dir: 'folder',
    text: 'plain text document',
    link: 'link',
    pdf: 'PDF document',
    device: 'character device',
    app: 'application',
  })[n.kind];
const same = (a: string[], b: string[]) => a.join('/') === b.join('/');

interface FilesProps {
  path: string[];
  doc: string | null;
  onNavigate: (path: string[], doc?: string | null) => void;
  onEdit: (path: string[]) => void;
  onApp: (n: FsNode) => void;
  onClose: () => void;
}

/** Nautilus in browser mode: places on the left, the folder in icons or a list, and a path bar. */
export default function Files({ path, doc, onNavigate, onEdit, onApp, onClose }: FilesProps) {
  const [view, setView] = useState<'icons' | 'list'>('icons');
  const [sel, setSel] = useState(0);
  const [back, setBack] = useState<string[][]>([]);
  const [fwd, setFwd] = useState<string[][]>([]);
  const grid = useRef<HTMLDivElement>(null);
  const folder = nodeAt(path);
  const kids = (folder?.children ?? []).filter((c) => !c.name.startsWith('.'));
  const opened = doc ? kids.find((c) => c.name === doc) : null;
  const picked = kids[Math.min(sel, kids.length - 1)];

  const go = (next: string[], keep = false) => {
    if (same(next, path) && !doc) return;
    if (!keep) {
      setBack([...back, path]);
      setFwd([]);
    }
    setSel(0);
    onNavigate(next, null);
  };
  const goBack = () => {
    if (doc) return onNavigate(path, null);
    const prev = back[back.length - 1];
    if (!prev) return;
    setBack(back.slice(0, -1));
    setFwd([path, ...fwd]);
    setSel(0);
    onNavigate(prev, null);
  };
  const goFwd = () => {
    const next = fwd[0];
    if (!next) return;
    setFwd(fwd.slice(1));
    setBack([...back, path]);
    setSel(0);
    onNavigate(next, null);
  };
  const up = () => path.length && go(path.slice(0, -1));

  const open = (n: FsNode) => {
    if (n.kind === 'dir') go([...path, n.name]);
    else if (n.kind === 'text') onNavigate(path, n.name);
    else if (n.kind === 'device' || n.kind === 'app') onApp(n);
    else if (n.href) window.open(n.href, '_blank', 'noopener,noreferrer');
  };

  const pick = (i: number) => {
    const next = Math.max(0, Math.min(kids.length - 1, i));
    setSel(next);
    grid.current?.querySelector<HTMLElement>(`[data-i="${next}"]`)?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const cols =
      view === 'list' ? 1 : Math.max(1, Math.floor((grid.current?.clientWidth ?? 600) / 112));
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: cols,
      ArrowUp: -cols,
      Home: -1e3,
      End: 1e3,
    };
    if (e.key in step) {
      e.preventDefault();
      pick(i + step[e.key]);
    } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault();
      up();
    }
  };

  // The path bar: one button per folder, as GNOME 2.24 drew it.
  const inHome = path.length >= HOME.length && same(path.slice(0, HOME.length), HOME);
  const crumbs = (inHome ? path.slice(HOME.length - 1) : path).map((name, i) => ({
    name,
    path: inHome ? path.slice(0, HOME.length + i) : path.slice(0, i + 1),
  }));

  const status = opened
    ? `“${opened.name}”: ${kindName(opened)}`
    : picked
      ? `“${picked.name}” selected (${picked.children ? `${picked.children.length} items` : kindName(picked)})${picked.note && picked.kind === 'dir' ? ` · ${picked.note}` : ''}`
      : `${kids.length} items`;

  return (
    <div className={s.app}>
      <Menubar
        menus={[
          {
            label: 'File',
            items: [
              {
                label: 'Open',
                disabled: !picked || !!opened,
                onSelect: () => picked && open(picked),
              },
              {
                label: 'Open with Text Editor',
                disabled: !(opened ?? picked)?.text,
                onSelect: () => onEdit([...path, (opened ?? picked)!.name]),
              },
              { separator: true },
              { label: 'Close', onSelect: onClose },
            ],
          },
          {
            label: 'View',
            items: [
              { label: 'Icons', checked: view === 'icons', onSelect: () => setView('icons') },
              { label: 'List', checked: view === 'list', onSelect: () => setView('list') },
            ],
          },
          {
            label: 'Go',
            items: [
              { label: 'Back', icon: 'back', disabled: !back.length && !doc, onSelect: goBack },
              { label: 'Forward', icon: 'forward', disabled: !fwd.length, onSelect: goFwd },
              { label: 'Open Parent', icon: 'up', disabled: !path.length, onSelect: up },
              { separator: true },
              { label: 'Home Folder', icon: 'home', onSelect: () => go(HOME) },
              { label: 'Trash', icon: 'trash', onSelect: () => go(TRASH_PATH) },
            ],
          },
          {
            label: 'Bookmarks',
            items: BOOKMARKS.map((b) => ({
              label: b,
              icon: 'folder' as const,
              onSelect: () => go([...HOME, b]),
            })),
          },
        ]}
      />
      <div className={s.toolbar} role="toolbar" aria-label="File Browser">
        <button
          type="button"
          className={s.toolBtn}
          onClick={goBack}
          disabled={!back.length && !doc}
        >
          <Icon name="back" size={22} />
          <span>Back</span>
        </button>
        <button type="button" className={s.toolBtn} onClick={goFwd} disabled={!fwd.length}>
          <Icon name="forward" size={22} />
          <span>Forward</span>
        </button>
        <button type="button" className={s.toolBtn} onClick={up} disabled={!path.length}>
          <Icon name="up" size={22} />
          <span>Up</span>
        </button>
        <span className={s.toolSep} />
        <button type="button" className={s.toolBtn} onClick={() => go(HOME)}>
          <Icon name="home" size={22} />
          <span>Home</span>
        </button>
        <span className={s.toolSep} />
        <div className={s.seg} role="group" aria-label="View as">
          <button type="button" aria-pressed={view === 'icons'} onClick={() => setView('icons')}>
            Icons
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            List
          </button>
        </div>
      </div>
      <nav className={s.pathbar} aria-label="Location">
        {inHome ? null : (
          <button
            type="button"
            className={s.crumb}
            aria-current={!path.length ? 'page' : undefined}
            onClick={() => go([])}
          >
            <Icon name="computer" size={16} />
          </button>
        )}
        {crumbs.map((c) => (
          <button
            key={c.path.join('/')}
            type="button"
            className={s.crumb}
            aria-current={same(c.path, path) && !opened ? 'page' : undefined}
            onClick={() => go(c.path)}
          >
            {same(c.path, HOME) && <Icon name="home" size={16} />}
            {c.name}
          </button>
        ))}
        {opened && (
          <span className={s.crumb} aria-current="page">
            {opened.name}
          </span>
        )}
      </nav>
      <div className={s.filesBody}>
        <nav className={s.places} aria-label="Places">
          <p className={s.paneHead}>Places</p>
          <ul>
            {PLACES.map((p) => (
              <li key={p.label}>
                <button
                  type="button"
                  className={same(p.path, path) ? s.placeOn : undefined}
                  onClick={() => go(p.path)}
                >
                  <Icon name={p.icon} size={16} />
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
          <hr />
          <ul>
            {BOOKMARKS.map((b) => (
              <li key={b}>
                <button
                  type="button"
                  className={same([...HOME, b], path) ? s.placeOn : undefined}
                  onClick={() => go([...HOME, b])}
                >
                  <Icon name="folder" size={16} />
                  {b}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {opened ? (
          <article className={s.docView} aria-label={opened.name}>
            <header>
              <Icon name={opened.icon} size={48} />
              <div>
                <h3>{opened.name}</h3>
                <p>{pretty([...path, opened.name])}</p>
              </div>
            </header>
            <div className={s.docText}>
              {(opened.text ?? []).map((l, i) => (
                <p key={i}>
                  {/^https?:\/\//.test(l) ? (
                    <a href={l} target="_blank" rel="noreferrer">
                      {l}
                    </a>
                  ) : (
                    l || ' '
                  )}
                </p>
              ))}
            </div>
            <div className={s.btnRow}>
              <button type="button" className={s.btn} onClick={goBack}>
                Back to {folder?.name}
              </button>
              <button
                type="button"
                className={s.btn}
                onClick={() => onEdit([...path, opened.name])}
              >
                <Icon name="editor" size={16} /> Open with Text Editor
              </button>
              {opened.href && (
                <a className={s.btn} href={opened.href} target="_blank" rel="noreferrer">
                  Open link ↗
                </a>
              )}
            </div>
          </article>
        ) : (
          <div
            ref={grid}
            className={view === 'icons' ? s.iconView : s.listView}
            role="listbox"
            aria-label={`${folder?.name ?? 'Folder'} contents`}
          >
            {view === 'list' && (
              <div className={s.listHead} aria-hidden="true">
                <span>Name</span>
                <span>Description</span>
                <span>Dates</span>
                {kids.some((k) => k.span) && (
                  <span className={s.axis}>
                    <i>{SINCE}</i>
                    <i>now</i>
                  </span>
                )}
              </div>
            )}
            {!kids.length && <p className={s.empty}>This folder is empty.</p>}
            {kids.map((n, i) => (
              <button
                key={n.name}
                type="button"
                role="option"
                aria-selected={i === sel}
                data-i={i}
                tabIndex={i === sel ? 0 : -1}
                className={`${view === 'icons' ? s.fileIcon : s.fileRow} ${i === sel ? s.fileSel : ''}`}
                onClick={(e) => (e.detail === 0 ? open(n) : setSel(i))}
                onDoubleClick={() => open(n)}
                onKeyDown={(e) => onKey(e, i)}
                title={n.note}
              >
                <span className={s.fileArt}>
                  <Icon name={n.icon} size={view === 'icons' ? 48 : 16} />
                  {n.emblem && (
                    <span className={s.emblem}>
                      <Icon
                        name={n.emblem === 'star' ? 'star' : 'link'}
                        size={view === 'icons' ? 18 : 10}
                      />
                    </span>
                  )}
                </span>
                <span className={s.fileName}>{n.name}</span>
                {view === 'list' && (
                  <>
                    <span className={s.fileNote}>{n.note ?? kindName(n)}</span>
                    <span className={s.fileDates}>{n.dates ?? ''}</span>
                    {kids.some((k) => k.span) && (
                      <span className={s.fileSpan} aria-hidden="true">
                        {n.span && (
                          <i
                            style={{
                              left: `${((n.span[0] - SINCE) / SPAN) * 100}%`,
                              right: `${((NOW - (n.span[1] ?? NOW)) / SPAN) * 100}%`,
                            }}
                          />
                        )}
                      </span>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className={s.statusbar}>
        <span>{status}</span>
        {!opened && kids.length > 0 && <span>Double-click or Enter to open</span>}
      </p>
    </div>
  );
}
