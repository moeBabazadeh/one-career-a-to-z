'use client';

// The workbench: title bar with menus and the command center, activity bar, side bar, editor
// groups, panel and status bar, all resizable, plus the global keybindings (chords included).
// On a phone the same parts become a mobile editor: a file list, a file view, search, source
// control and the terminal, switched from a bottom tab bar.

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { readScheme, writeScheme } from '../_shared/scheme';
import { db } from '../_shared/data';
import {
  COMMANDS,
  COMMAND_MAP,
  bindingsOf,
  emit,
  keyLabel,
  matchPart,
  openPage,
  runCommand,
} from './commands';
import EditorGroup from './EditorGroup';
import { FileIcon, Icon } from './icons';
import { Markdown } from './markdown';
import Panel from './Panel';
import QuickInput from './QuickInput';
import ReadPage from './ReadPage';
import { BRANCH, REPO } from './repo';
import Sidebar from './Sidebar';
import {
  UNCOMMITTED,
  activeTab,
  allDiagnostics,
  changedPaths,
  dirtyPaths,
  flash,
  get,
  liveBlame,
  openFile,
  quick,
  set,
  showPanel,
  showView,
  toggleView,
  useWb,
  type State,
} from './store';
import { LANG_NAMES, langOf } from './syntax';
import { useMac } from './Views';
import { agoOf } from './repo';
import s from './editor.module.scss';

const PHONE = '(max-width: 760px)';
const subscribePhone = (fn: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
};
const usePhone = () =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );

/* ------------------------------------------------------------------ menus */

type MenuItem = string | '-' | { label: string; run: () => void };

const MENUS: { label: string; items: MenuItem[] }[] = [
  {
    label: 'File',
    items: [
      'workbench.action.quickOpen',
      '-',
      'workbench.action.files.save',
      'workbench.action.files.saveAll',
      'workbench.action.files.revert',
      '-',
      'workbench.action.closeActiveEditor',
      'workbench.action.closeAllEditors',
      'workbench.action.reopenClosedEditor',
      '-',
      'site.readAsPage',
      'site.cv',
    ],
  },
  {
    label: 'Edit',
    items: ['actions.find', 'workbench.view.search', '-', 'editor.action.toggleTabFocusMode'],
  },
  {
    label: 'View',
    items: [
      'workbench.action.showCommands',
      '-',
      'workbench.view.explorer',
      'workbench.view.search',
      'workbench.view.scm',
      'workbench.actions.view.problems',
      'workbench.action.terminal.toggleTerminal',
      '-',
      'workbench.action.toggleSidebarVisibility',
      'workbench.action.togglePanel',
      'workbench.action.toggleZenMode',
      '-',
      'editor.action.toggleMinimap',
      'breadcrumbs.toggle',
      'editor.action.toggleWordWrap',
      'git.toggleBlameEditorDecoration',
      'git.toggleBlameStatusBarItem',
      '-',
      'markdown.showPreview',
      'markdown.showPreviewToSide',
      '-',
      'workbench.action.selectTheme',
      'workbench.action.toggleLightDarkThemes',
    ],
  },
  {
    label: 'Go',
    items: [
      'workbench.action.quickOpen',
      'workbench.action.gotoSymbol',
      'workbench.action.showAllSymbols',
      'workbench.action.gotoLine',
      '-',
      'workbench.action.nextEditor',
      'workbench.action.previousEditor',
    ],
  },
  { label: 'Run', items: ['workbench.action.tasks.build', 'npm.career', 'npm.stations'] },
  {
    label: 'Terminal',
    items: [
      'workbench.action.terminal.new',
      'workbench.action.terminal.toggleTerminal',
      'workbench.action.terminal.clear',
      '-',
      'workbench.action.tasks.build',
    ],
  },
  {
    label: 'Help',
    items: [
      'site.readAsPage',
      'workbench.action.openShortcuts',
      'workbench.action.showCommands',
      '-',
      'site.email',
      'site.linkedin',
      'site.github',
      'site.cv',
    ],
  },
];

const CHECKED: Record<string, (st: State) => boolean> = {
  'editor.action.toggleMinimap': (st) => st.minimap,
  'breadcrumbs.toggle': (st) => st.breadcrumbs,
  'git.toggleBlameEditorDecoration': (st) => st.blameGutter,
  'git.toggleBlameStatusBarItem': (st) => st.lineBlame,
  'workbench.action.toggleZenMode': (st) => st.zen,
  'workbench.action.toggleSidebarVisibility': (st) => st.sidebar,
  'workbench.action.togglePanel': (st) => st.panel,
  'editor.action.toggleTabFocusMode': (st) => st.tabFocus,
};

function Menu({
  label,
  items,
  open,
  onOpen,
  onClose,
  icon,
  align,
}: {
  label: string;
  items: MenuItem[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  icon?: ReactNode;
  align?: 'up';
}) {
  const mac = useMac();
  const st = useWb((x) => x);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) (list.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
  }, [open]);

  const move = (e: React.KeyboardEvent) => {
    const all = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[(at + 1) % all.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      all[(at - 1 + all.length) % all.length]?.focus();
    } else if (e.key === 'Home') all[0]?.focus();
    else if (e.key === 'End') all[all.length - 1]?.focus();
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.stopPropagation();
      onClose();
      button.current?.focus();
    }
  };

  return (
    <div className={s.menu} data-align={align}>
      <button
        ref={button}
        type="button"
        className={icon ? s.activityBtn : s.menuBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
        onClick={() => (open ? onClose() : onOpen())}
        onMouseEnter={() =>
          !icon && st.chord === null && document.querySelector(`[data-menubar-open]`) && onOpen()
        }
      >
        {icon ?? label}
      </button>
      {open && (
        <ul ref={list} className={s.menuList} role="menu" aria-label={label} onKeyDown={move}>
          {items.map((it, i) => {
            if (it === '-') return <li key={i} role="separator" className={s.menuSep} />;
            const cmd = typeof it === 'string' ? COMMAND_MAP[it] : null;
            const text = typeof it === 'string' ? (cmd?.title ?? it) : it.label;
            const keys = cmd ? bindingsOf(cmd, mac)[0] : undefined;
            const checked = typeof it === 'string' && CHECKED[it] ? CHECKED[it](st) : undefined;
            return (
              <li key={i} role="none">
                <button
                  type="button"
                  role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={checked}
                  tabIndex={-1}
                  onClick={() => {
                    onClose();
                    if (typeof it === 'string') runCommand(it);
                    else it.run();
                  }}
                >
                  <span className={s.menuCheck}>{checked ? <Icon.check /> : null}</span>
                  <span>{text}</span>
                  {keys && <kbd>{keyLabel(keys, mac)}</kbd>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ sashes */

function Sash({ kind }: { kind: 'sidebar' | 'panel' }) {
  const start = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  return (
    <div
      className={s.sash}
      data-kind={kind}
      role="separator"
      aria-orientation={kind === 'sidebar' ? 'vertical' : 'horizontal'}
      aria-label={kind === 'sidebar' ? 'Resize side bar' : 'Resize panel'}
      tabIndex={0}
      onPointerDown={(e) => {
        const st = get();
        start.current = { x: e.clientX, y: e.clientY, w: st.sidebarWidth, h: st.panelHeight };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const from = start.current;
        if (!from) return;
        if (kind === 'sidebar')
          set({ sidebarWidth: Math.max(170, Math.min(560, from.w + e.clientX - from.x)) });
        else
          set({
            panelHeight: Math.max(
              90,
              Math.min(window.innerHeight - 220, from.h - (e.clientY - from.y)),
            ),
            panelMax: false,
          });
      }}
      onPointerUp={() => (start.current = null)}
      onDoubleClick={() =>
        kind === 'sidebar' ? set({ sidebarWidth: 264 }) : set({ panelHeight: 300 })
      }
      onKeyDown={(e) => {
        const st = get();
        const step = e.shiftKey ? 40 : 10;
        if (kind === 'sidebar' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
          set({
            sidebarWidth: Math.max(
              170,
              Math.min(560, st.sidebarWidth + (e.key === 'ArrowRight' ? step : -step)),
            ),
          });
        if (kind === 'panel' && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))
          set({
            panelHeight: Math.max(
              90,
              Math.min(
                window.innerHeight - 220,
                st.panelHeight + (e.key === 'ArrowUp' ? step : -step),
              ),
            ),
          });
      }}
    />
  );
}

/* ------------------------------------------------------------------ status bar */

function StatusBar() {
  const st = useWb((x) => x);
  const mac = useMac();
  const tab = activeTab(st);
  const path = tab && tab.mode !== 'shortcuts' ? tab.path : null;
  const cursor = path ? (st.cursor[path] ?? { line: 0, col: 0, chars: 0, lines: 0 }) : undefined;
  const diags = Object.values(allDiagnostics(st.buffers)).flat();
  const errors = diags.filter((d) => d.severity === 'error').length;
  const warnings = diags.length - errors;
  const changed = changedPaths(st).length + dirtyPaths(st).length > 0;
  const lang = path ? langOf(path) : null;
  const owner = path && cursor ? liveBlame(st, path)[cursor.line] : null;
  const commit = owner && owner !== UNCOMMITTED ? st.commits.find((c) => c.id === owner) : null;

  return (
    <footer className={s.status} aria-label="Status bar">
      <div className={s.statusLeft}>
        <button
          type="button"
          className={s.statusItem}
          title={`${REPO} (Git) - ${BRANCH}${changed ? ', with changes' : ''}`}
          onClick={() => showView('scm')}
        >
          <Icon.branch /> {BRANCH}
          {changed ? '*' : ''}
        </button>
        <button
          type="button"
          className={s.statusItem}
          title="Synchronize Changes"
          onClick={() => flash('Everything is up to date with the remote.')}
        >
          <Icon.sync />
        </button>
        <button
          type="button"
          className={s.statusItem}
          title={`${errors} errors, ${warnings} warnings`}
          onClick={() => showPanel('problems')}
        >
          <Icon.error /> {errors} <Icon.warning /> {warnings}
        </button>
        {st.chord ? (
          <span className={s.statusMessage}>
            ({keyLabel(st.chord, mac)}) was pressed. Waiting for second key of chord...
          </span>
        ) : st.message ? (
          <span className={s.statusMessage} role="status">
            {st.message.text}
          </span>
        ) : (
          st.lineBlame &&
          path &&
          cursor && (
            <span className={s.statusBlame} title={commit ? commit.subject : 'Uncommitted changes'}>
              {commit
                ? `${commit.author}, ${agoOf(commit)}`
                : owner === UNCOMMITTED
                  ? 'You, Uncommitted changes'
                  : ''}
            </span>
          )
        )}
      </div>
      <div className={s.statusRight}>
        {path && cursor && (
          <button
            type="button"
            className={s.statusItem}
            title="Go to Line/Column"
            onClick={() => quick(':')}
          >
            Ln {cursor.line + 1}, Col {cursor.col + 1}
            {cursor.chars ? ` (${cursor.chars} selected)` : ''}
          </button>
        )}
        {path && <span className={`${s.statusItem} ${s.statusWide}`}>Spaces: 2</span>}
        {path && <span className={`${s.statusItem} ${s.statusWide}`}>UTF-8</span>}
        {path && <span className={`${s.statusItem} ${s.statusWide}`}>LF</span>}
        {lang && (
          <span className={s.statusItem}>
            {lang === 'json' || lang === 'typescript' ? '{ } ' : ''}
            {LANG_NAMES[lang]}
          </span>
        )}
        {st.tabFocus && (
          <button
            type="button"
            className={s.statusItem}
            onClick={() => runCommand('editor.action.toggleTabFocusMode')}
          >
            Tab Moves Focus
          </button>
        )}
        <button
          type="button"
          className={s.statusItem}
          title="Toggle between Light/Dark Themes"
          aria-label="Toggle light or dark theme"
          onClick={() => runCommand('workbench.action.toggleLightDarkThemes')}
        >
          <span className={s.onlyLight}>
            <Icon.moon />
          </span>
          <span className={s.onlyDark}>
            <Icon.sun />
          </span>
        </button>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ the phone's files view */

function PhoneReadme() {
  const text = useWb((st) => st.buffers['README.md']);
  return (
    <section className={s.phoneReadme} aria-label="README">
      <h2 className={s.phoneReadmeHead}>
        <FileIcon path="README.md" /> README.md
      </h2>
      <article className={s.md}>
        <Markdown
          text={text}
          options={{
            dir: '',
            onLink: (t) => {
              if (t.path) openFile(t.path, t.path.endsWith('.md') ? { mode: 'preview' } : {});
              else if (t.anchor)
                document
                  .querySelector(`.${s.phoneReadme} [data-anchor="${t.anchor}"]`)
                  ?.scrollIntoView();
            },
          }}
        />
      </article>
    </section>
  );
}

/* ------------------------------------------------------------------ the workbench */

export default function Workbench() {
  const view = useWb((st) => st.view);
  const sidebar = useWb((st) => st.sidebar);
  const sidebarWidth = useWb((st) => st.sidebarWidth);
  const panel = useWb((st) => st.panel);
  const panelHeight = useWb((st) => st.panelHeight);
  const panelMax = useWb((st) => st.panelMax);
  const groups = useWb((st) => st.groups);
  const mobile = useWb((st) => st.mobile);
  const zen = useWb((st) => st.zen);
  const page = useWb((st) => st.page);
  const buffers = useWb((st) => st.buffers);
  const saved = useWb((st) => st.saved);
  const head = useWb((st) => st.head);
  const phone = usePhone();
  const mac = useMac();
  const [menu, setMenu] = useState<string | null>(null);
  const changes = changedPaths({ ...get(), buffers, saved, head }).length;

  // Narrow screens start with one group: the README's preview, its source a tab away.
  useEffect(() => {
    if (window.innerWidth >= 1100) return;
    const t = window.setTimeout(() => {
      const st = get();
      if (st.groups.length < 2) return;
      const tabs = st.groups.flatMap((g) => g.tabs);
      set({ groups: [{ id: 1, tabs, active: tabs[tabs.length - 1].key }], activeGroup: 0 });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // Global keybindings, chords included.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      const st = get();
      if (st.page) return;
      const isMacNow = mac;
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      const inTerminal = (document.activeElement as HTMLElement | null)?.closest('[data-terminal]');
      if (st.chord) {
        e.preventDefault();
        const first = st.chord;
        const hit = COMMANDS.find((c) =>
          bindingsOf(c, isMacNow).some(
            (b) =>
              b.split(' ')[0] === first &&
              b.split(' ')[1] &&
              matchPart(e, b.split(' ')[1], isMacNow),
          ),
        );
        set({ chord: null });
        if (hit) runCommand(hit.id);
        else
          flash(
            `The key combination (${keyLabel(first, isMacNow)}, ${e.key.length === 1 ? e.key.toUpperCase() : e.key}) is not a command.`,
          );
        return;
      }
      for (const c of COMMANDS) {
        for (const b of bindingsOf(c, isMacNow)) {
          const parts = b.split(' ');
          if (!matchPart(e, parts[0], isMacNow)) continue;
          if (inTerminal && parts[0] === 'mod+k') continue;
          e.preventDefault();
          e.stopPropagation();
          if (parts.length > 1) set({ chord: parts[0] });
          else runCommand(c.id);
          return;
        }
      }
      if (e.key === 'Escape') {
        if (st.zen) set({ zen: false });
        if (menu) setMenu(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mac, menu]);

  // A click outside closes an open menu.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(`.${s.menu}`)) setMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);

  const showSidebar = phone
    ? mobile === 'files' || mobile === 'search' || mobile === 'scm'
    : sidebar && !zen;
  const showPanelNow = phone ? mobile === 'terminal' : panel && !zen;

  const mobileTab = (
    id: 'files' | 'search' | 'scm' | 'terminal',
    label: string,
    icon: ReactNode,
    badge?: number,
  ) => (
    <button
      type="button"
      aria-pressed={mobile === id || (id === 'files' && mobile === 'editor')}
      onClick={() => {
        if (id === 'terminal') {
          set({ mobile: 'terminal', panel: true, panelTab: 'terminal' });
          emit('focus-terminal');
        } else showView(id === 'files' ? 'explorer' : id);
      }}
    >
      {icon}
      <span>{label}</span>
      {badge ? <span className={s.tabBadge}>{badge}</span> : null}
    </button>
  );

  return (
    <div
      className={s.root}
      data-mobile={mobile}
      data-zen={zen || undefined}
      data-page={page || undefined}
      style={
        {
          '--sidebar-w': `${sidebarWidth}px`,
          '--panel-h': panelMax ? '100%' : `${panelHeight}px`,
        } as React.CSSProperties
      }
    >
      <a
        href="#read"
        className={s.skip}
        onClick={(e) => {
          e.preventDefault();
          openPage();
        }}
      >
        Skip the editor and read everything as a page
      </a>

      <header className={s.titlebar}>
        <nav
          className={s.menubar}
          aria-label="Menu bar"
          data-menubar-open={menu ? true : undefined}
        >
          {MENUS.map((m) => (
            <Menu
              key={m.label}
              label={m.label}
              items={m.items}
              open={menu === m.label}
              onOpen={() => setMenu(m.label)}
              onClose={() => setMenu(null)}
            />
          ))}
        </nav>
        <button
          type="button"
          className={s.commandCenter}
          onClick={() => quick('')}
          title={`Search files by name (${keyLabel('mod+p', mac)}), or run a command (${keyLabel('mod+shift+p', mac)})`}
        >
          <Icon.search size={14} />
          <span>{REPO}</span>
          <kbd>{keyLabel('mod+p', mac)}</kbd>
        </button>
        <div className={s.titleActions}>
          <button
            type="button"
            className={s.iconBtn}
            aria-pressed={sidebar}
            title={`Toggle Primary Side Bar (${keyLabel('mod+b', mac)})`}
            aria-label="Toggle side bar"
            onClick={() => runCommand('workbench.action.toggleSidebarVisibility')}
          >
            <Icon.layoutSidebar />
          </button>
          <button
            type="button"
            className={s.iconBtn}
            aria-pressed={panel}
            title={`Toggle Panel (${keyLabel('mod+j', mac)})`}
            aria-label="Toggle panel"
            onClick={() => runCommand('workbench.action.togglePanel')}
          >
            <Icon.layoutPanel />
          </button>
          <button type="button" className={s.readBtn} onClick={openPage}>
            <Icon.page /> Read as a page
          </button>
        </div>
      </header>

      <header className={s.mobileBar}>
        <span className={s.mobileRepo}>
          <b>{REPO}</b>
          <span className={s.mobileBranch}>
            <Icon.branch /> {BRANCH}
          </span>
        </span>
        <button
          type="button"
          className={s.iconBtn}
          aria-label="Go to file"
          onClick={() => quick('')}
        >
          <Icon.search size={18} />
        </button>
        <button
          type="button"
          className={s.iconBtn}
          aria-label="Toggle light or dark theme"
          onClick={() => writeScheme(readScheme() === 'dark' ? 'light' : 'dark')}
        >
          <span className={s.onlyLight}>
            <Icon.moon />
          </span>
          <span className={s.onlyDark}>
            <Icon.sun />
          </span>
        </button>
        <button
          type="button"
          className={s.iconBtn}
          aria-label="Show all commands"
          onClick={() => quick('>')}
        >
          <Icon.more />
        </button>
      </header>

      <div className={s.main}>
        <nav className={s.activity} aria-label="Activity bar">
          {(
            [
              ['explorer', 'Explorer', <Icon.files key="f" />, 'mod+shift+e'],
              ['search', 'Search', <Icon.search key="s" />, 'mod+shift+f'],
              ['scm', 'Source Control', <Icon.scm key="g" />, 'ctrl+shift+g'],
            ] as const
          ).map(([id, label, icon, key]) => (
            <button
              key={id}
              type="button"
              className={s.activityBtn}
              aria-pressed={sidebar && view === id}
              aria-label={label}
              title={`${label} (${keyLabel(key, mac)})`}
              onClick={() => toggleView(id)}
            >
              {icon}
              {id === 'scm' && changes > 0 && <span className={s.activityBadge}>{changes}</span>}
            </button>
          ))}
          <span className={s.activitySpacer} />
          <Menu
            label={`${db.person.name}: contact`}
            icon={<Icon.account />}
            align="up"
            open={menu === 'account'}
            onOpen={() => setMenu('account')}
            onClose={() => setMenu(null)}
            items={[
              'site.email',
              'site.linkedin',
              'site.github',
              'site.cv',
              '-',
              'site.readAsPage',
            ]}
          />
          <Menu
            label="Manage"
            icon={<Icon.gear />}
            align="up"
            open={menu === 'manage'}
            onOpen={() => setMenu('manage')}
            onClose={() => setMenu(null)}
            items={[
              'workbench.action.showCommands',
              'workbench.action.openShortcuts',
              '-',
              'workbench.action.selectTheme',
              'workbench.action.toggleLightDarkThemes',
            ]}
          />
        </nav>

        {showSidebar && (
          <div className={s.sideWrap}>
            <Sidebar />
            {phone && mobile === 'files' && <PhoneReadme />}
          </div>
        )}
        {showSidebar && !phone && <Sash kind="sidebar" />}

        <div className={s.work} data-panel-max={(showPanelNow && panelMax) || undefined}>
          <div className={s.groups} data-count={groups.length}>
            {groups.map((g, i) => (
              <EditorGroup key={g.id} index={i} phone={phone} />
            ))}
          </div>
          {showPanelNow && !phone && <Sash kind="panel" />}
          {showPanelNow && <Panel />}
        </div>
      </div>

      <StatusBar />

      <nav className={s.tabbar} aria-label="Views">
        {mobileTab('files', 'Files', <Icon.files />)}
        {mobileTab('search', 'Search', <Icon.search />)}
        {mobileTab('scm', 'Changes', <Icon.scm />, changes)}
        {mobileTab('terminal', 'Terminal', <Icon.terminal />)}
        <button type="button" aria-pressed={page} onClick={openPage}>
          <Icon.page />
          <span>Page</span>
        </button>
      </nav>

      <QuickInput />
      <ReadPage />
    </div>
  );
}
