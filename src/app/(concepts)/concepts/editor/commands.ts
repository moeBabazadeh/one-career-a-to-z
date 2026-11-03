// Every command the workbench has: the palette lists them, the menus group them, and the
// keybindings run them. Bindings use the real editor's defaults where the browser lets a page
// have the key (Cmd+W, Cmd+T and Ctrl+Tab belong to the browser, so those have alternatives).

import { db } from '../_shared/data';
import { readChoice, readScheme, writeScheme } from '../_shared/scheme';
import { PAGE } from './repo';
import { langOf } from './syntax';
import {
  activeTab,
  changedPaths,
  closeAll,
  closeTab,
  cycleTab,
  discard,
  dirtyPaths,
  flash,
  get,
  newTerminal,
  openFile,
  openToSide,
  quick,
  reopenClosed,
  revealInExplorer,
  revert,
  save,
  saveAll,
  set,
  showPanel,
  showView,
  termUpdate,
  toggleSidebar,
  togglePanel,
  toggleTerminal,
  activateTab,
} from './store';
import { execute } from './shell';

/* ------------------------------------------------------------------ UI events */

export type UiEvent =
  | 'find'
  | 'focus-terminal'
  | 'focus-editor'
  | 'focus-scm'
  | 'focus-search'
  | 'focus-explorer'
  | 'focus-problems'
  | 'focus-breadcrumbs';

const handlers = new Map<UiEvent, Set<() => void>>();

export function onUi(event: UiEvent, fn: () => void) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(fn);
  return () => {
    handlers.get(event)?.delete(fn);
  };
}

export function emit(event: UiEvent) {
  // After the state change that may have mounted the target.
  window.requestAnimationFrame(() => handlers.get(event)?.forEach((fn) => fn()));
}

/* ------------------------------------------------------------------ commands */

export interface Command {
  id: string;
  title: string;
  category?: string;
  /** Bindings: `mod` is Cmd on a Mac and Ctrl elsewhere; a space separates the keys of a chord. */
  keys?: string[];
  /** Mac-only or other-only bindings. */
  macKeys?: string[];
  run: () => void;
  /** Not listed in the palette. */
  hidden?: boolean;
  /** Runs even while typing in the editor or a field. */
  global?: boolean;
}

export const openUrl = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const openPage = () => {
  set({ page: true, quick: null });
};

const activePath = () => activeTab(get())?.path ?? null;

function runTask(script: string) {
  const s = get();
  showPanel('terminal');
  const id = s.activeTerminal;
  const session = s.terminals.find((t) => t.id === id);
  if (session?.running) return;
  if (session && session.cwd) termUpdate(id, { cwd: '' });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  execute(id, `npm run ${script}`, { openUrl, openPage }, reduced);
}

function toggleTheme() {
  const next = readScheme() === 'dark' ? 'light' : 'dark';
  writeScheme(next);
  flash(`Color theme: ${next === 'dark' ? 'Dark' : 'Light'}`);
}

function preview(side: boolean) {
  const path = activePath();
  if (!path || langOf(path) !== 'markdown') {
    flash('Open a Markdown file to preview it.');
    return;
  }
  if (side) openToSide(path, 'preview');
  else openFile(path, { mode: 'preview' });
}

export const COMMANDS: Command[] = [
  {
    id: 'workbench.action.showCommands',
    title: 'Show All Commands',
    keys: ['mod+shift+p', 'f1'],
    run: () => quick('>'),
    global: true,
  },
  {
    id: 'workbench.action.quickOpen',
    title: 'Go to File...',
    keys: ['mod+p'],
    run: () => quick(''),
    global: true,
  },
  {
    id: 'workbench.action.files.openFile',
    title: 'Open File...',
    category: 'File',
    run: () => quick(''),
  },
  {
    id: 'workbench.action.gotoSymbol',
    title: 'Go to Symbol in Editor...',
    keys: ['mod+shift+o'],
    run: () => quick('@'),
    global: true,
  },
  {
    id: 'workbench.action.showAllSymbols',
    title: 'Go to Symbol in Workspace...',
    keys: ['mod+t'],
    run: () => quick('#'),
    global: true,
  },
  {
    id: 'workbench.action.gotoLine',
    title: 'Go to Line/Column...',
    keys: ['ctrl+g'],
    run: () => quick(':'),
    global: true,
  },
  { id: 'actions.find', title: 'Find', keys: ['mod+f'], run: () => emit('find'), global: true },
  {
    id: 'workbench.action.files.save',
    title: 'Save',
    category: 'File',
    keys: ['mod+s'],
    global: true,
    run: () => (activePath() ? save(activePath() as string) : undefined),
  },
  {
    id: 'workbench.action.files.saveAll',
    title: 'Save All',
    category: 'File',
    keys: ['mod+alt+s'],
    global: true,
    run: saveAll,
  },
  {
    id: 'workbench.action.files.revert',
    title: 'Revert File',
    category: 'File',
    run: () => {
      const p = activePath();
      if (p) revert(p);
    },
  },
  {
    id: 'workbench.action.closeActiveEditor',
    title: 'Close Editor',
    category: 'View',
    keys: ['alt+w', 'ctrl+f4'],
    global: true,
    run: () => {
      const s = get();
      const g = s.groups[s.activeGroup];
      if (g?.active) closeTab(s.activeGroup, g.active);
    },
  },
  {
    id: 'workbench.action.closeAllEditors',
    title: 'Close All Editors',
    category: 'View',
    keys: ['mod+k mod+w'],
    run: closeAll,
    global: true,
  },
  {
    id: 'workbench.action.reopenClosedEditor',
    title: 'Reopen Closed Editor',
    category: 'View',
    keys: ['alt+shift+t'],
    run: reopenClosed,
    global: true,
  },
  {
    id: 'workbench.action.nextEditor',
    title: 'Open Next Editor',
    category: 'View',
    keys: ['ctrl+pagedown', 'mod+alt+arrowright'],
    run: () => cycleTab(1),
    global: true,
  },
  {
    id: 'workbench.action.previousEditor',
    title: 'Open Previous Editor',
    category: 'View',
    keys: ['ctrl+pageup', 'mod+alt+arrowleft'],
    run: () => cycleTab(-1),
    global: true,
  },
  ...Array.from({ length: 9 }, (_, i): Command => ({
    id: `workbench.action.openEditorAtIndex${i + 1}`,
    title: `Open Editor at Index ${i + 1}`,
    category: 'View',
    keys: [`alt+${i + 1}`],
    macKeys: [`ctrl+${i + 1}`],
    hidden: true,
    global: true,
    run: () => {
      const s = get();
      const g = s.groups[s.activeGroup];
      const tab = i === 8 ? g?.tabs[g.tabs.length - 1] : g?.tabs[i];
      if (tab) activateTab(s.activeGroup, tab.key);
    },
  })),
  {
    id: 'workbench.action.toggleSidebarVisibility',
    title: 'Toggle Primary Side Bar Visibility',
    category: 'View',
    keys: ['mod+b'],
    run: toggleSidebar,
    global: true,
  },
  {
    id: 'workbench.action.togglePanel',
    title: 'Toggle Panel Visibility',
    category: 'View',
    keys: ['mod+j'],
    run: togglePanel,
    global: true,
  },
  {
    id: 'workbench.action.terminal.toggleTerminal',
    title: 'Toggle Terminal',
    category: 'View',
    keys: ['ctrl+`'],
    global: true,
    run: () => {
      toggleTerminal();
      if (get().panel) emit('focus-terminal');
      else emit('focus-editor');
    },
  },
  {
    id: 'workbench.action.terminal.new',
    title: 'Create New Terminal',
    category: 'Terminal',
    keys: ['ctrl+shift+`'],
    global: true,
    run: () => {
      newTerminal();
      emit('focus-terminal');
    },
  },
  {
    id: 'workbench.action.terminal.clear',
    title: 'Clear',
    category: 'Terminal',
    run: () => termUpdate(get().activeTerminal, { lines: [] }),
  },
  {
    id: 'workbench.action.tasks.build',
    title: 'Run Build Task',
    category: 'Tasks',
    keys: ['mod+shift+b'],
    run: () => runTask('career'),
    global: true,
  },
  { id: 'npm.career', title: 'Run Script: career', category: 'npm', run: () => runTask('career') },
  {
    id: 'npm.stations',
    title: 'Run Script: stations',
    category: 'npm',
    run: () => runTask('stations'),
  },
  {
    id: 'workbench.view.explorer',
    title: 'Show Explorer',
    category: 'View',
    keys: ['mod+shift+e'],
    global: true,
    run: () => {
      showView('explorer');
      emit('focus-explorer');
    },
  },
  {
    id: 'workbench.view.search',
    title: 'Show Search',
    category: 'View',
    keys: ['mod+shift+f'],
    global: true,
    run: () => {
      showView('search');
      emit('focus-search');
    },
  },
  {
    id: 'workbench.view.scm',
    title: 'Show Source Control',
    category: 'View',
    keys: ['ctrl+shift+g'],
    global: true,
    run: () => {
      showView('scm');
      emit('focus-scm');
    },
  },
  {
    id: 'workbench.actions.view.problems',
    title: 'Focus on Problems View',
    category: 'View',
    keys: ['mod+shift+m'],
    global: true,
    run: () => {
      showPanel('problems');
      emit('focus-problems');
    },
  },
  {
    id: 'editor.action.toggleMinimap',
    title: 'Toggle Minimap',
    category: 'View',
    run: () => set((s) => ({ minimap: !s.minimap })),
  },
  {
    id: 'editor.action.toggleWordWrap',
    title: 'Toggle Word Wrap',
    category: 'View',
    keys: ['alt+z'],
    global: true,
    run: () =>
      set((s) => {
        const p = activePath();
        const current = s.wrap ?? (p ? langOf(p) === 'markdown' : false);
        return { wrap: !current };
      }),
  },
  {
    id: 'breadcrumbs.toggle',
    title: 'Toggle Breadcrumbs',
    category: 'View',
    run: () => set((s) => ({ breadcrumbs: !s.breadcrumbs })),
  },
  {
    id: 'breadcrumbs.focus',
    title: 'Focus Breadcrumbs',
    category: 'View',
    keys: ['mod+shift+.'],
    global: true,
    run: () => emit('focus-breadcrumbs'),
  },
  {
    id: 'workbench.action.toggleZenMode',
    title: 'Toggle Zen Mode',
    category: 'View',
    keys: ['mod+k z'],
    global: true,
    run: () => set((s) => ({ zen: !s.zen })),
  },
  {
    id: 'markdown.showPreview',
    title: 'Open Preview',
    category: 'Markdown',
    keys: ['mod+shift+v'],
    global: true,
    run: () => preview(false),
  },
  {
    id: 'markdown.showPreviewToSide',
    title: 'Open Preview to the Side',
    category: 'Markdown',
    keys: ['mod+k v'],
    global: true,
    run: () => preview(true),
  },
  {
    id: 'markdown.showSource',
    title: 'Open Source',
    category: 'Markdown',
    run: () => {
      const p = activePath();
      if (p) openFile(p);
    },
  },
  {
    id: 'workbench.action.selectTheme',
    title: 'Color Theme',
    category: 'Preferences',
    keys: ['mod+k mod+t'],
    global: true,
    run: () => quick('', 'theme', ['light', 'dark', null].indexOf(readChoice())),
  },
  {
    id: 'workbench.action.toggleLightDarkThemes',
    title: 'Toggle between Light/Dark Themes',
    category: 'Preferences',
    run: toggleTheme,
  },
  {
    id: 'workbench.action.openShortcuts',
    title: 'Open Keyboard Shortcuts',
    category: 'Preferences',
    keys: ['mod+k mod+s'],
    global: true,
    run: () => openFile('Keyboard Shortcuts', { mode: 'shortcuts' }),
  },
  {
    id: 'editor.action.toggleTabFocusMode',
    title: 'Toggle Tab Key Moves Focus',
    keys: ['ctrl+m'],
    global: true,
    run: () => set((s) => ({ tabFocus: !s.tabFocus })),
  },
  {
    id: 'git.toggleBlameEditorDecoration',
    title: 'Toggle File Blame',
    category: 'Git',
    run: () => set((s) => ({ blameGutter: !s.blameGutter })),
  },
  {
    id: 'git.toggleBlameStatusBarItem',
    title: 'Toggle Line Blame',
    category: 'Git',
    run: () => set((s) => ({ lineBlame: !s.lineBlame })),
  },
  {
    id: 'git.commit',
    title: 'Commit',
    category: 'Git',
    run: () => {
      showView('scm');
      emit('focus-scm');
    },
  },
  {
    id: 'git.cleanAll',
    title: 'Discard All Changes',
    category: 'Git',
    run: () => {
      const s = get();
      const paths = [...new Set([...changedPaths(s), ...dirtyPaths(s)])];
      if (paths.length) discard(paths);
    },
  },
  {
    id: 'workbench.files.action.showActiveFileInExplorer',
    title: 'Reveal Active File in Explorer View',
    category: 'File',
    run: () => {
      const p = activePath();
      if (p) revealInExplorer(p);
    },
  },
  {
    id: 'workbench.files.action.collapseExplorerFolders',
    title: 'Collapse Folders in Explorer',
    category: 'Explorer',
    run: () => set({ expanded: {} }),
  },
  { id: 'site.readAsPage', title: 'Read as a Page', category: 'Help', run: openPage },
  ...PAGE.map((section): Command => ({
    id: `site.page.${section.id}`,
    title: `Read as a Page: ${section.title}`,
    category: 'Help',
    run: () => {
      openPage();
      window.setTimeout(() => document.getElementById(`page-${section.id}`)?.scrollIntoView(), 60);
    },
  })),
  {
    id: 'site.email',
    title: `Send an Email to ${db.person.first}`,
    category: 'Contact',
    run: () => (window.location.href = `mailto:${db.person.email}`),
  },
  {
    id: 'site.linkedin',
    title: 'Open LinkedIn Profile',
    category: 'Contact',
    run: () => openUrl(db.person.linkedin),
  },
  {
    id: 'site.github',
    title: 'Open GitHub Profile',
    category: 'Contact',
    run: () => openUrl(db.person.github),
  },
  { id: 'site.cv', title: 'Download CV', category: 'Contact', run: () => openUrl(db.person.cv) },
];

export const COMMAND_MAP: Record<string, Command> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, c]),
);

export const label = (c: Command) => (c.category ? `${c.category}: ${c.title}` : c.title);

export function runCommand(id: string) {
  const c = COMMAND_MAP[id];
  if (!c) return;
  set((s) => ({
    recentCommands: c.hidden
      ? s.recentCommands
      : [id, ...s.recentCommands.filter((x) => x !== id)].slice(0, 8),
  }));
  c.run();
}

/* ------------------------------------------------------------------ keys */

export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const MAC_SYMBOLS: Record<string, string> = { mod: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' };
const KEY_NAMES: Record<string, string> = {
  arrowright: '→',
  arrowleft: '←',
  arrowup: '↑',
  arrowdown: '↓',
  pagedown: 'PageDown',
  pageup: 'PageUp',
  '`': '`',
  enter: '↵',
  escape: 'Esc',
};

/** "⇧⌘P" on a Mac, "Ctrl+Shift+P" elsewhere. Chords are separated by a space. */
export function keyLabel(binding: string, mac: boolean): string {
  return binding
    .split(' ')
    .map((part) => {
      const keys = part.split('+');
      const key = keys.pop() as string;
      const name =
        KEY_NAMES[key] ??
        (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
      if (mac) {
        const order = ['ctrl', 'alt', 'shift', 'mod'];
        return (
          order
            .filter((m) => keys.includes(m))
            .map((m) => MAC_SYMBOLS[m])
            .join('') + name
        );
      }
      const words: Record<string, string> = {
        mod: 'Ctrl',
        ctrl: 'Ctrl',
        alt: 'Alt',
        shift: 'Shift',
      };
      return [...new Set(keys.map((m) => words[m]))].concat(name).join('+');
    })
    .join(' ');
}

export function bindingsOf(c: Command, mac: boolean) {
  return (mac ? (c.macKeys ?? c.keys) : c.keys) ?? [];
}

/** The key of an event, normalised: "p", "`", "arrowright", "f1". */
function keyOf(e: KeyboardEvent) {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  if (e.code === 'Backquote') return '`';
  if (e.code === 'Period') return '.';
  return e.key.toLowerCase();
}

/** Whether a keydown matches one part of a binding ("mod+shift+p"). */
export function matchPart(e: KeyboardEvent, part: string, mac: boolean) {
  const keys = part.split('+');
  const key = keys.pop() as string;
  const want = { meta: false, ctrl: false, alt: false, shift: false };
  for (const m of keys) {
    if (m === 'mod') want[mac ? 'meta' : 'ctrl'] = true;
    else if (m === 'ctrl') want.ctrl = true;
    else if (m === 'alt') want.alt = true;
    else if (m === 'shift') want.shift = true;
  }
  return (
    keyOf(e) === key &&
    e.metaKey === want.meta &&
    e.ctrlKey === want.ctrl &&
    e.altKey === want.alt &&
    e.shiftKey === want.shift
  );
}
