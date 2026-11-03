'use client';

// An editor group: its tabs (preview tabs in italics, dirty dots, middle-click to close, drag to
// reorder), the editor actions, breadcrumbs with pickers for every segment, and the editor itself.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { COMMAND_MAP, bindingsOf, keyLabel, label, onUi, openPage, runCommand } from './commands';
import CodeView from './CodeView';
import { FileIcon, Icon, SymIcon } from './icons';
import { REPO } from './repo';
import {
  PATHS,
  activateTab,
  closeTab,
  get,
  isDir,
  moveTab,
  openFile,
  openToSide,
  pinTab,
  set,
  useWb,
  type Tab,
} from './store';
import { langOf, symbolPath, symbolsOf, tokenize, type Sym } from './syntax';
import { DiffView, Preview, Shortcuts, useMac } from './Views';
import s from './editor.module.scss';

export const tabTitle = (t: Tab) =>
  t.mode === 'shortcuts'
    ? 'Keyboard Shortcuts'
    : t.mode === 'preview'
      ? `Preview ${t.path.split('/').pop()}`
      : t.mode === 'diff'
        ? `${t.path.split('/').pop()} (Working Tree)`
        : (t.path.split('/').pop() as string);

/* ------------------------------------------------------------------ breadcrumbs */

interface Crumb {
  label: string;
  icon?: React.ReactNode;
  items: () => {
    label: string;
    detail?: string;
    icon?: React.ReactNode;
    run: () => void;
    current?: boolean;
  }[];
}

function Breadcrumbs({ path, mode }: { path: string; mode: Tab['mode'] }) {
  const text = useWb((st) => st.buffers[path]);
  const cursorLine = useWb((st) => st.cursor[path]?.line ?? 0);
  const [open, setOpen] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const nav = useRef<HTMLElement>(null);
  const lang = langOf(path);
  const syms = useMemo(
    () =>
      mode === 'source' || mode === 'preview' ? symbolsOf(text, lang, tokenize(text, lang)) : [],
    [text, lang, mode],
  );
  const chain = mode === 'source' ? symbolPath(syms, cursorLine) : [];

  useEffect(
    () =>
      onUi('focus-breadcrumbs', () =>
        (nav.current?.querySelector('button') as HTMLButtonElement | null)?.focus(),
      ),
    [],
  );

  const parts = path.split('/');
  const crumbs: Crumb[] = [
    ...parts.map((part, i): Crumb => {
      const dir = parts.slice(0, i).join('/');
      const isLast = i === parts.length - 1;
      return {
        label: part,
        icon: isLast ? <FileIcon path={path} mode={mode} /> : undefined,
        items: () => {
          const prefix = dir ? `${dir}/` : '';
          const names = [
            ...new Set(
              PATHS.filter((p) => p.startsWith(prefix)).map(
                (p) => p.slice(prefix.length).split('/')[0],
              ),
            ),
          ];
          return names.map((n) => {
            const full = prefix + n;
            return {
              label: n,
              icon: isDir(full) ? (
                <span className={s.folderGlyph}>▸</span>
              ) : (
                <FileIcon path={full} />
              ),
              current: n === part,
              run: () => {
                if (!isDir(full)) openFile(full);
                else {
                  const first = PATHS.find((p) => p.startsWith(`${full}/`));
                  if (first) openFile(first);
                }
              },
            };
          });
        },
      };
    }),
    ...chain.map((sym, i): Crumb => {
      const siblings = i === 0 ? syms : chain[i - 1].children;
      return {
        label: sym.name || (sym.kind === 'object' ? '{}' : '[]'),
        icon: <SymIcon kind={sym.kind} />,
        items: () =>
          siblings.map((x: Sym) => ({
            label: x.name || (x.kind === 'object' ? '{}' : '[]'),
            detail: x.detail,
            icon: <SymIcon kind={x.kind} />,
            current: x === sym,
            run: () => openFile(path, { line: x.line, col: x.col }),
          })),
      };
    }),
  ];

  const items = open !== null ? crumbs[open].items() : [];

  const onKey = (e: KeyboardEvent) => {
    if (open === null) return;
    if (e.key === 'Escape') {
      setOpen(null);
      e.stopPropagation();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
      setOpen(null);
    }
  };

  return (
    <nav ref={nav} className={s.crumbs} aria-label="Breadcrumbs" onKeyDown={onKey}>
      <span className={s.crumbRoot}>{REPO}</span>
      {crumbs.map((c, i) => (
        <span key={`${i}-${c.label}`} className={s.crumb}>
          <span className={s.crumbSep} aria-hidden="true">
            <Icon.chevron />
          </span>
          <button
            type="button"
            aria-expanded={open === i}
            aria-haspopup="listbox"
            onClick={() => {
              const next = open === i ? null : i;
              setOpen(next);
              if (next !== null)
                setActive(
                  Math.max(
                    0,
                    crumbs[i].items().findIndex((x) => x.current),
                  ),
                );
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight')
                (
                  e.currentTarget.parentElement?.nextElementSibling?.querySelector(
                    'button',
                  ) as HTMLButtonElement | null
                )?.focus();
              if (e.key === 'ArrowLeft')
                (
                  e.currentTarget.parentElement?.previousElementSibling?.querySelector(
                    'button',
                  ) as HTMLButtonElement | null
                )?.focus();
            }}
          >
            {c.icon}
            {c.label}
          </button>
          {open === i && (
            <ul className={s.crumbMenu} role="listbox" aria-label={c.label}>
              {items.map((it, j) => (
                <li
                  key={`${j}-${it.label}`}
                  role="option"
                  aria-selected={j === active}
                  data-current={it.current || undefined}
                  onMouseEnter={() => setActive(j)}
                  onClick={() => {
                    it.run();
                    setOpen(null);
                  }}
                >
                  {it.icon}
                  <span>{it.label}</span>
                  {it.detail && <span className={s.dim}>{it.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </span>
      ))}
      {open !== null && (
        <button
          type="button"
          className={s.scrim}
          aria-label="Close"
          tabIndex={-1}
          onClick={() => setOpen(null)}
        />
      )}
    </nav>
  );
}

/* ------------------------------------------------------------------ the empty group */

const WATERMARK = [
  'workbench.action.showCommands',
  'workbench.action.quickOpen',
  'workbench.view.search',
  'workbench.action.terminal.toggleTerminal',
  'workbench.action.tasks.build',
  'site.readAsPage',
];

function Watermark() {
  const mac = useMac();
  return (
    <div className={s.watermark}>
      <dl>
        {WATERMARK.map((id) => {
          const c = COMMAND_MAP[id];
          const keys = bindingsOf(c, mac);
          return (
            <div key={id}>
              <dt>{id === 'workbench.action.tasks.build' ? 'Run npm run career' : c.title}</dt>
              <dd>
                {keys.length ? (
                  <kbd>{keyLabel(keys[0], mac)}</kbd>
                ) : (
                  <button type="button" className={s.linkBtn} onClick={() => runCommand(id)}>
                    open
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ the group */

export default function EditorGroup({ index, phone }: { index: number; phone: boolean }) {
  const group = useWb((st) => st.groups[index]);
  const activeGroup = useWb((st) => st.activeGroup);
  const buffers = useWb((st) => st.buffers);
  const saved = useWb((st) => st.saved);
  const crumbs = useWb((st) => st.breadcrumbs);
  const groupCount = useWb((st) => st.groups.length);
  const blameGutter = useWb((st) => st.blameGutter);
  const mac = useMac();
  const dragging = useRef<string | null>(null);
  const tabsEl = useRef<HTMLDivElement>(null);

  const tab = group?.tabs.find((t) => t.key === group.active) ?? null;

  // The active tab scrolls into view in an overflowing strip.
  useEffect(() => {
    const el = tabsEl.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [group?.active]);

  if (!group) return null;
  const names = group.tabs.map((t) => tabTitle(t));
  const md = tab && langOf(tab.path) === 'markdown';

  const tabKeys = (e: KeyboardEvent<HTMLDivElement>, t: Tab, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateTab(index, t.key);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next =
        group.tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + group.tabs.length) % group.tabs.length];
      (
        tabsEl.current?.querySelector(`[data-key="${CSS.escape(next.key)}"]`) as HTMLElement | null
      )?.focus();
    } else if (e.key === 'Delete' || e.key === 'Backspace') closeTab(index, t.key);
  };

  return (
    <section
      className={s.group}
      data-active={index === activeGroup || undefined}
      aria-label={`Editor group ${index + 1}`}
      onMouseDown={() => index !== get().activeGroup && set({ activeGroup: index })}
    >
      <div className={s.tabBar}>
        <div ref={tabsEl} className={s.tabs} role="tablist" aria-label="Open editors">
          {group.tabs.map((t, i) => {
            const dirty = t.mode === 'source' && buffers[t.path] !== saved[t.path];
            const dup = names.filter((n) => n === names[i]).length > 1;
            return (
              <div
                key={t.key}
                data-key={t.key}
                role="tab"
                tabIndex={t.key === group.active ? 0 : -1}
                aria-selected={t.key === group.active}
                className={s.tab}
                data-preview={!t.pinned || undefined}
                data-dirty={dirty || undefined}
                title={
                  t.mode === 'shortcuts'
                    ? 'Keyboard Shortcuts'
                    : `${t.path}${!t.pinned ? ' (preview: double-click to keep open)' : ''}`
                }
                draggable
                onDragStart={(e) => {
                  dragging.current = t.key;
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging.current && dragging.current !== t.key)
                    moveTab(index, dragging.current, t.key);
                  dragging.current = null;
                }}
                onClick={() => activateTab(index, t.key)}
                onDoubleClick={() => pinTab(index, t.key)}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault();
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(index, t.key);
                  }
                }}
                onKeyDown={(e) => tabKeys(e, t, i)}
              >
                <FileIcon path={t.path} mode={t.mode} />
                <span className={s.tabName}>{names[i]}</span>
                {dup && t.mode !== 'shortcuts' && (
                  <span className={s.tabDesc}>{t.path.split('/').slice(-2, -1)[0] ?? REPO}</span>
                )}
                <button
                  type="button"
                  className={s.tabClose}
                  aria-label={`Close ${names[i]}`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(index, t.key);
                  }}
                  title={`Close (${keyLabel('alt+w', mac)})`}
                >
                  <span className={s.dirtyDot} aria-hidden="true" />
                  <Icon.close />
                </button>
              </div>
            );
          })}
        </div>
        {tab && (
          <div className={s.editorActions}>
            {md && tab.mode === 'source' && (
              <button
                type="button"
                className={s.iconBtn}
                title={`Open Preview to the Side (${keyLabel('mod+k v', mac)})`}
                aria-label="Open preview to the side"
                onClick={() => openToSide(tab.path, 'preview')}
              >
                <Icon.preview />
              </button>
            )}
            {tab.mode === 'preview' && (
              <button
                type="button"
                className={s.iconBtn}
                title="Open Source"
                aria-label="Open source"
                onClick={() => openFile(tab.path, { group: index })}
              >
                <Icon.source />
              </button>
            )}
            {tab.mode === 'source' && (
              <button
                type="button"
                className={s.iconBtn}
                aria-pressed={blameGutter}
                title="Toggle File Blame"
                aria-label="Toggle file blame"
                onClick={() => runCommand('git.toggleBlameEditorDecoration')}
              >
                <Icon.blame />
              </button>
            )}
            {tab.mode !== 'shortcuts' && (
              <button
                type="button"
                className={s.iconBtn}
                title="Split Editor"
                aria-label="Split editor"
                onClick={() => openToSide(tab.path, tab.mode)}
              >
                <Icon.split />
              </button>
            )}
            {groupCount > 1 && (
              <button
                type="button"
                className={s.iconBtn}
                title="Close Group"
                aria-label="Close group"
                onClick={() => group.tabs.forEach((t) => closeTab(index, t.key))}
              >
                <Icon.close />
              </button>
            )}
          </div>
        )}
      </div>

      {/* The phone's header: back to the files, the file, and source or preview. */}
      {tab && (
        <div className={s.phoneBar}>
          <button
            type="button"
            className={s.iconBtn}
            aria-label="Back to files"
            onClick={() => set({ mobile: 'files' })}
          >
            <Icon.back />
          </button>
          <span className={s.phoneTitle}>
            <FileIcon path={tab.path} mode={tab.mode} />
            {tab.mode === 'shortcuts' ? 'Keyboard Shortcuts' : tab.path}
          </span>
          {md && (
            <span className={s.segmented} role="group" aria-label="View">
              <button
                type="button"
                aria-pressed={tab.mode === 'source'}
                onClick={() => openFile(tab.path, { group: index })}
              >
                Code
              </button>
              <button
                type="button"
                aria-pressed={tab.mode === 'preview'}
                onClick={() => openFile(tab.path, { mode: 'preview', group: index })}
              >
                Preview
              </button>
            </span>
          )}
        </div>
      )}

      {tab && crumbs && tab.mode !== 'shortcuts' && <Breadcrumbs path={tab.path} mode={tab.mode} />}

      <div className={s.editorBody}>
        {!tab && <Watermark />}
        {tab?.mode === 'source' && (
          <CodeView
            key={tab.key}
            path={tab.path}
            lang={langOf(tab.path)}
            tabKey={tab.key}
            group={index}
            phone={phone}
          />
        )}
        {tab?.mode === 'preview' && (
          <Preview key={tab.key} path={tab.path} tabKey={tab.key} group={index} />
        )}
        {tab?.mode === 'shortcuts' && <Shortcuts />}
        {tab?.mode === 'diff' && <DiffView path={tab.path} />}
      </div>
    </section>
  );
}

export { label, openPage };
