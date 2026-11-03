'use client';

// The suite: a reverse-engineering workbench opened on moe.bin. Menus, a toolbar, the symbol
// tree, the listing, the decompiler and a dock of bytes, strings, call graph and console, with
// the keys the real tools use. On a phone the windows become tabs.
import { useEffect, useRef, useState } from 'react';
import {
  follow,
  openComment,
  openRename,
  openXrefs,
  stepFunction,
  target,
  undoNote,
} from './actions';
import { PASSES, STAGE } from './analyze';
import { FILE } from './career';
import Decompiler from './Decompiler';
import Dialogs, { Preview } from './Dialogs';
import Graph from './Graph';
import Hex from './Hex';
import Listing from './Listing';
import { unitSummary } from './parts';
import { BASE, PROG, SYM_ADDR, addrText, fnOf, nameAt, objOf, unitAt } from './program';
import Report from './Report';
import Side from './Side';
import Strings from './Strings';
import {
  act,
  analysisStarted,
  getUI,
  notesAct,
  runAnalysis,
  setPageView,
  useNotes,
  usePageView,
  useUI,
  type DockTab,
  type MobileTab,
} from './store';
import { hex } from './thumb';
import s from './re.module.scss';

/* ------------------------------------------------------------------ icons */

const ICONS: Record<string, string> = {
  back: 'M10 3 5 8l5 5',
  fwd: 'M6 3l5 5-5 5',
  goto: 'M2 8h9M8 4.5 11.5 8 8 11.5M13.5 3v10',
  rename: 'M2.5 11.5 10 4l2 2-7.5 7.5H2.5zM9 5l2 2',
  comment: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
  xrefs: 'M4 4h3M4 8h8M4 12h5M11 2.5l2.5 2.5L11 7.5',
  search: 'M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.5 10.5 14 14',
  follow: 'M3 8h8M8 5l3 3-3 3M13 3v10',
  undo: 'M5 4 2.5 6.5 5 9M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7',
  page: 'M4 1.5h5.5L13 5v9.5H4zM9.5 1.5V5H13M6 8h5M6 10.5h5',
  keys: 'M1.5 4.5h13v7h-13zM4 7h1M7 7h1M10 7h2M4 9.5h8',
};

const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={s.icon}>
    <path d={ICONS[name]} />
  </svg>
);

/* ------------------------------------------------------------------ menus */

type Item = { label: string; key?: string; run: () => void } | 'sep';

function download() {
  const blob = new Blob([PROG.bytes.slice()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILE;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  act.log(
    `Saved ${FILE}: ${PROG.bytes.length.toLocaleString('en-US')} bytes. Load it raw at ${addrText(BASE)}, ARM Cortex-M, little-endian.`,
    'ok',
  );
}

const goSym = (name: string) => {
  const a = SYM_ADDR.get(name);
  if (a !== undefined) act.goTo(a);
};

const showDock = (tab: DockTab) => {
  act.dock(tab);
  if (tab !== 'console') act.mobile(tab);
};

const MENUS: { id: string; label: string; items: Item[] }[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'Read as a page', key: 'P', run: () => setPageView(true) },
      { label: `Export ${FILE}…`, run: download },
      'sep',
      {
        label: 'Reset my annotations',
        run: () => {
          notesAct.reset();
          act.log('Cleared your renames and comments.', 'ok');
        },
      },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Rename…', key: 'L', run: openRename },
      { label: 'Set comment…', key: ';', run: openComment },
      'sep',
      { label: 'Undo', key: 'Ctrl+Z', run: undoNote },
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    items: [
      {
        label: 'Auto analyze again',
        run: () => runAnalysis(matchMedia('(prefers-reduced-motion: reduce)').matches),
      },
      { label: 'Analysis log', run: () => showDock('console') },
    ],
  },
  {
    id: 'nav',
    label: 'Navigation',
    items: [
      { label: 'Go to…', key: 'G', run: () => act.open({ k: 'goto' }) },
      { label: 'Follow reference', key: 'Enter', run: () => follow() },
      { label: 'Back', key: 'Esc', run: () => act.back() },
      { label: 'Forward', key: 'Alt+→', run: () => act.forward() },
      'sep',
      { label: 'Next function', key: 'Ctrl+↓', run: () => stepFunction(1) },
      { label: 'Previous function', key: 'Ctrl+↑', run: () => stepFunction(-1) },
      'sep',
      { label: 'Entry point', run: () => goSym('Reset_Handler') },
      { label: 'main', run: () => goSym('main') },
    ],
  },
  {
    id: 'search',
    label: 'Search',
    items: [
      { label: 'Memory…', key: 'S', run: () => act.open({ k: 'search' }) },
      { label: 'References to…', key: 'X', run: openXrefs },
      { label: 'Strings window', run: () => showDock('strings') },
    ],
  },
  {
    id: 'window',
    label: 'Window',
    items: [
      { label: 'Bytes', run: () => showDock('hex') },
      { label: 'Defined strings', run: () => showDock('strings') },
      { label: 'Function call graph', run: () => showDock('graph') },
      { label: 'Console', run: () => showDock('console') },
      'sep',
      { label: 'Symbol tree', run: () => (act.side('symbols'), act.mobile('symbols')) },
      { label: 'Program tree', run: () => (act.side('program'), act.mobile('symbols')) },
      { label: 'Data types', run: () => (act.side('types'), act.mobile('symbols')) },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'Keyboard shortcuts', key: '?', run: () => act.open({ k: 'keys' }) },
      { label: `About ${FILE}`, run: () => act.open({ k: 'about' }) },
    ],
  },
];

function Menubar() {
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const focusItem = (id: string, k: number) => {
    requestAnimationFrame(() => {
      const items = bar.current?.querySelectorAll<HTMLElement>(
        `[data-menu="${id}"] [role="menuitem"]`,
      );
      if (items?.length) items[(k + items.length) % items.length].focus();
    });
  };
  const openAt = (k: number, first = true) => {
    const m = MENUS[(k + MENUS.length) % MENUS.length];
    setOpen(m.id);
    if (first) focusItem(m.id, 0);
  };

  const onMenuKey = (e: React.KeyboardEvent, k: number) => {
    const items = [
      ...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, () => void> = {
      ArrowDown: () => items[(i + 1) % items.length]?.focus(),
      ArrowUp: () => items[(i - 1 + items.length) % items.length]?.focus(),
      ArrowRight: () => openAt(k + 1),
      ArrowLeft: () => openAt(k - 1),
      Escape: () => {
        setOpen(null);
        bar.current?.querySelectorAll<HTMLElement>('[data-top]')[k]?.focus();
      },
      Tab: () => setOpen(null),
    };
    if (moves[e.key]) {
      if (e.key !== 'Tab') e.preventDefault();
      e.stopPropagation();
      moves[e.key]();
    }
  };

  return (
    <div ref={bar} className={s.menubar} role="menubar" aria-label="Menu">
      {MENUS.map((m, k) => (
        <div key={m.id} className={s.menuWrap} data-menu={m.id}>
          <button
            type="button"
            role="menuitem"
            data-top=""
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            className={open === m.id ? s.menuOn : ''}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onPointerEnter={() => open && open !== m.id && setOpen(m.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openAt(k);
              }
            }}
          >
            {m.label}
          </button>
          {open === m.id && (
            <div
              className={s.menu}
              role="menu"
              aria-label={m.label}
              onKeyDown={(e) => onMenuKey(e, k)}
            >
              {m.items.map((it, j) =>
                it === 'sep' ? (
                  <hr key={j} />
                ) : (
                  <button
                    key={it.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(null);
                      it.run();
                    }}
                  >
                    <span>{it.label}</span>
                    {it.key && <kbd>{it.key}</kbd>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ dock and console */

function Console() {
  const ui = useUI();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ui.log.length]);
  return (
    <div ref={box} className={s.console} role="log" aria-live="polite" aria-label="Console">
      {ui.log.map((l) => (
        <p key={l.id} className={s[`log_${l.kind}`]}>
          <span className={s.dim}>
            {l.kind === 'pass' ? '[analysis] ' : l.kind === 'warn' ? '[warn] ' : '> '}
          </span>
          {l.text}
        </p>
      ))}
    </div>
  );
}

const DOCK: { id: DockTab; label: string }[] = [
  { id: 'hex', label: 'Bytes' },
  { id: 'strings', label: 'Defined strings' },
  { id: 'graph', label: 'Function call graph' },
  { id: 'console', label: 'Console' },
];

function Dock() {
  const ui = useUI();
  const show = (id: DockTab) => ui.dock === id || ui.mobile === id;
  return (
    <section className={`${s.panel} ${s.dock}`} aria-label="Dock">
      <div className={s.tabs} role="tablist" aria-label="Dock windows">
        {DOCK.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={ui.dock === t.id}
            className={ui.dock === t.id ? s.tabOn : ''}
            onClick={() => act.dock(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={s.dockBody}>
        {show('hex') && (
          <div className={s.dockPane} data-dp="hex">
            <Hex />
          </div>
        )}
        {show('strings') && (
          <div className={s.dockPane} data-dp="strings">
            <Strings />
          </div>
        )}
        {show('graph') && (
          <div className={s.dockPane} data-dp="graph">
            <Graph />
          </div>
        )}
        {show('console') && (
          <div className={s.dockPane} data-dp="console">
            <Console />
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ status bar */

function Status() {
  const ui = useUI();
  const notes = useNotes();
  const u = unitAt(ui.cursor, ui.stage);
  const fn = fnOf(ui.cursor, ui.stage);
  const obj = fn === null ? objOf(ui.cursor, ui.stage) : null;
  const where =
    fn !== null
      ? `${nameAt(fn, ui.stage, notes.names)}+0x${hex(ui.cursor - fn)}`
      : obj !== null
        ? `${nameAt(obj, ui.stage, notes.names)}+0x${hex(ui.cursor - obj)}`
        : null;
  const progress = Math.min(1, (ui.pass + ui.passProgress) / PASSES.length);
  return (
    <footer className={s.status}>
      <span className={s.stAddr}>{addrText(ui.cursor)}</span>
      {where && <span className={s.stWhere}>{where}</span>}
      <span className={s.stUnit}>{unitSummary(u, ui.cursor, ui.stage, notes.names)}</span>
      <span className={s.spacer} />
      {ui.done ? (
        <span
          className={s.stDone}
        >{`${PROG.fns.size} functions · ${PROG.labels.size} labels · analysis complete`}</span>
      ) : (
        <span
          className={s.stProgress}
          role="progressbar"
          aria-label="Auto-analysis"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span>{ui.log.length ? PASSES[Math.min(ui.pass, PASSES.length - 1)] : 'Loading…'}</span>
          <span className={s.bar}>
            <i style={{ transform: `scaleX(${progress})` }} />
          </span>
        </span>
      )}
    </footer>
  );
}

/* ------------------------------------------------------------------ hover previews */

function useHover() {
  const [hover, setHover] = useState<{ addr: number; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const over = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]');
    if (timer.current) clearTimeout(timer.current);
    if (!el || el.dataset.ref === undefined || el.dataset.ref === '') {
      setHover(null);
      return;
    }
    const addr = Number(el.dataset.ref);
    const r = el.getBoundingClientRect();
    const x = Math.min(r.left, window.innerWidth - 460);
    const below = r.bottom + 8;
    const y = below + 220 > window.innerHeight ? Math.max(8, r.top - 228) : below;
    timer.current = setTimeout(() => setHover({ addr, x: Math.max(8, x), y }), 420);
  };
  const out = () => {
    if (timer.current) clearTimeout(timer.current);
    setHover(null);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { hover, over, out };
}

/* ------------------------------------------------------------------ the suite */

const MOBILE: { id: MobileTab; label: string }[] = [
  { id: 'listing', label: 'Listing' },
  { id: 'decomp', label: 'Decompile' },
  { id: 'strings', label: 'Strings' },
  { id: 'graph', label: 'Graph' },
  { id: 'hex', label: 'Hex' },
  { id: 'symbols', label: 'Symbols' },
];

function Tool() {
  const ui = useUI();
  const root = useRef<HTMLDivElement>(null);
  const { hover, over, out } = useHover();

  useEffect(() => {
    if (!analysisStarted()) runAnalysis(matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || getUI().dialog) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (t !== document.body && !root.current?.contains(t)) return;
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') act.back();
        else act.forward();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoNote();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t.closest('[role="menu"], [role="menubar"]')) return;
      const run: Record<string, () => void> = {
        g: () => act.open({ k: 'goto' }),
        l: openRename,
        ';': openComment,
        x: openXrefs,
        s: () => act.open({ k: 'search' }),
        p: () => setPageView(true),
        '?': () => act.open({ k: 'keys' }),
        Escape: () => act.back(),
        Enter: () => {
          if (t.closest('button, a')) return;
          follow(target().follow);
        },
      };
      const fn = run[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? run[e.key];
      if (fn) {
        if (e.key === 'Enter' && t.closest('button, a')) return;
        e.preventDefault();
        fn();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const tb = (icon: string, label: string, key: string, run: () => void, disabled = false) => (
    <button
      type="button"
      className={s.tool}
      onClick={run}
      disabled={disabled}
      title={`${label} (${key})`}
      aria-label={`${label} (${key})`}
    >
      <Icon name={icon} />
      <span className={s.toolLabel}>{label}</span>
    </button>
  );

  return (
    <div
      ref={root}
      className={s.suite}
      data-m={ui.mobile}
      data-dock={ui.dock}
      onPointerOver={over}
      onPointerLeave={out}
      onPointerDown={out}
    >
      <header className={s.top}>
        <div className={s.titleBar}>
          <span className={s.appMark} aria-hidden="true">
            <i />
          </span>
          <h1 className={s.file}>
            {FILE}
            <span
              className={s.fileMeta}
            >{` · ARM Cortex-M · Thumb-2 · LE · ${addrText(BASE)}`}</span>
          </h1>
          <Menubar />
          <span className={s.spacer} />
          <button type="button" className={s.readBtn} onClick={() => setPageView(true)}>
            <Icon name="page" />
            Read as a page
          </button>
        </div>
        <div className={s.toolbar} role="toolbar" aria-label="Tools">
          {tb('back', 'Back', 'Esc', () => act.back(), ui.at === 0)}
          {tb('fwd', 'Forward', 'Alt+→', () => act.forward(), ui.at >= ui.hist.length - 1)}
          <span className={s.sep} />
          {tb('goto', 'Go to', 'G', () => act.open({ k: 'goto' }))}
          {tb('follow', 'Follow', 'Enter', () => follow())}
          {tb('rename', 'Rename', 'L', openRename)}
          {tb('comment', 'Comment', ';', openComment)}
          {tb('xrefs', 'References', 'X', openXrefs)}
          {tb('search', 'Search', 'S', () => act.open({ k: 'search' }))}
          <span className={s.sep} />
          {tb('undo', 'Undo', 'Ctrl+Z', undoNote)}
          {tb('keys', 'Keys', '?', () => act.open({ k: 'keys' }))}
          <span className={s.histNote} aria-live="off">
            {ui.stage >= STAGE.CODE ? `${ui.at + 1}/${ui.hist.length}` : ''}
          </span>
        </div>
        <nav className={s.mtabs} role="tablist" aria-label="Windows">
          {MOBILE.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={ui.mobile === t.id}
              className={ui.mobile === t.id ? s.tabOn : ''}
              onClick={() => act.mobile(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className={s.work}>
        <Side />
        <Listing />
        <Dock />
        <Decompiler />
        <Status />
      </main>
      <Dialogs />
      {hover && (
        <div className={s.hover} style={{ left: hover.x, top: hover.y }} role="tooltip">
          <Preview addr={hover.addr} stage={ui.stage} />
        </div>
      )}
    </div>
  );
}

export default function Suite() {
  const page = usePageView();
  return <div className={s.root}>{page ? <Report /> : <Tool />}</div>;
}
