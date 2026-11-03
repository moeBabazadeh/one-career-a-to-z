'use client';

// Concept V · Vector. A design tool with babazadeh.dev as the open file: pages, frames and real
// layers on an infinite canvas, a layer tree, a properties panel whose auto layout really lays
// things out, components with instances and variants, comments, an inspect tab that writes CSS,
// and Play, which turns the frames into the site. Phones get a view-only canvas and a drawer.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { concept } from '../_shared/concepts';
import { db, profile } from '../_shared/data';
import Canvas from './Canvas';
import { cx, Icon, type IconName } from './controls';
import { Assets, Layers, LeftTabs, Pages } from './Layers';
import { InspectTab, RightPanel, RightTabs } from './Panel';
import Player from './Player';
import Reader from './Reader';
import { fitAll, fitSelection, useStage, zoomBy, zoomTo } from './stage';
import {
  addAutoLayout,
  alignTo,
  copy,
  createComponent,
  cut,
  detachInstanceAt,
  duplicate,
  frameSelection,
  nudge,
  paste,
  play,
  prepare,
  redo,
  remove,
  reorder,
  selectAll,
  selectChildren,
  selectParent,
  selectSibling,
  set,
  setLayout,
  setPage,
  setTool,
  startEditing,
  store,
  toggle,
  undo,
  useSlice,
  type Tool,
} from './store';
import s from './vector.module.scss';

/* ------------------------------------------------------------------ phone or not */

const PHONE = '(max-width: 767px)';
const subscribePhone = (fn: () => void) => {
  const q = matchMedia(PHONE);
  q.addEventListener('change', fn);
  return () => q.removeEventListener('change', fn);
};
const usePhone = () =>
  useSyncExternalStore(
    subscribePhone,
    () => matchMedia(PHONE).matches,
    () => false,
  );

/* ------------------------------------------------------------------ tools */

const TOOLS: { id: Tool; label: string; key: string; icon: IconName }[] = [
  { id: 'move', label: 'Move', key: 'V', icon: 'move' },
  { id: 'frame', label: 'Frame', key: 'F', icon: 'frame' },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: 'rect' },
  { id: 'text', label: 'Text', key: 'T', icon: 'text' },
  { id: 'hand', label: 'Hand', key: 'H', icon: 'hand' },
  { id: 'comment', label: 'Comment', key: 'C', icon: 'comment' },
];

const SHORTCUTS: [string, [string, string][]][] = [
  [
    'Tools',
    [
      ['V', 'Move'],
      ['F', 'Frame'],
      ['R', 'Rectangle'],
      ['T', 'Text'],
      ['H', 'Hand'],
      ['C', 'Comment'],
    ],
  ],
  [
    'View',
    [
      ['Space + drag', 'Pan'],
      ['⌘ + scroll · pinch', 'Zoom'],
      ['⇧1', 'Zoom to fit'],
      ['⇧2', 'Zoom to selection'],
      ['⇧0', 'Zoom to 100%'],
      ['+ / −', 'Zoom in / out'],
      ['⇧R', 'Rulers'],
      ['⌘\\', 'Hide the interface'],
      ['Hold ⌥', 'Measure to the hovered layer'],
    ],
  ],
  [
    'Edit',
    [
      ['⌘Z / ⌘⇧Z', 'Undo / redo'],
      ['⌘D', 'Duplicate'],
      ['⌘C ⌘X ⌘V', 'Copy, cut, paste'],
      ['⌫', 'Delete'],
      ['Arrows', 'Nudge (⇧ for 10)'],
      ['⌥ + drag', 'Duplicate while moving'],
      ['⇧ + drag', 'Lock to an axis, or keep proportions'],
      ['⌘ + drag', 'Move without snapping'],
      ['⌘] / ⌘[', 'Bring forward / send backward'],
      ['⇧⌘H / ⇧⌘L', 'Hide / lock'],
    ],
  ],
  [
    'Select',
    [
      ['Click · ⌘ click', 'Select · select deepest'],
      ['Double-click', 'Into a frame, or edit text'],
      ['Enter / ⇧Enter', 'Children / parent'],
      ['Tab / ⇧Tab', 'Next / previous layer'],
      ['⌘A', 'Select all'],
    ],
  ],
  [
    'Layout and components',
    [
      ['⇧A', 'Add auto layout'],
      ['⌥⇧A', 'Remove auto layout'],
      ['⌥⌘G', 'Frame selection'],
      ['⌥⌘K', 'Create component'],
      ['⌥⌘B', 'Detach instance'],
      ['⌥A ⌥H ⌥D', 'Align left, centre, right'],
      ['⌥W ⌥V ⌥S', 'Align top, middle, bottom'],
    ],
  ],
  [
    'Prototype',
    [
      ['⌥⌘↵', 'Play'],
      ['← →', 'Previous / next frame'],
      ['R', 'Restart'],
      ['Esc', 'Close'],
    ],
  ],
];

/* ------------------------------------------------------------------ the top bar */

function ZoomLabel() {
  const stage = useStage();
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!stage) return;
    const put = () => {
      if (label.current) label.current.textContent = `${Math.round(stage.cam.z * 100)}%`;
    };
    put();
    return stage.onView(put);
  }, [stage]);
  return <span ref={label}>100%</span>;
}

function Menu({
  items,
  label,
  children,
  className,
}: {
  items: ({ label: string; kbd?: string; on: () => void; checked?: boolean } | null)[];
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  return (
    <div ref={box} className={cx(s.menuWrap, className)}>
      <button
        type="button"
        className={s.barBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen(!open)}
      >
        {children}
      </button>
      {open && (
        <ul className={s.menu} role="menu">
          {items.map((it, i) =>
            it ? (
              <li key={it.label} role="none">
                <button
                  type="button"
                  role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={it.checked}
                  onClick={() => {
                    setOpen(false);
                    it.on();
                  }}
                >
                  <span className={s.menuCheck}>
                    {it.checked ? <Icon name="check" size={12} /> : null}
                  </span>
                  <span>{it.label}</span>
                  {it.kbd && <kbd>{it.kbd}</kbd>}
                </button>
              </li>
            ) : (
              <li key={`sep${i}`} role="separator" className={s.menuSep} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ShareDialog({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="share-title">
        <header className={s.dialogHead}>
          <h2 id="share-title">Share {db.person.site}</h2>
          <button type="button" className={s.mini} onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className={s.shareRow}>
          <input className={s.textInput} readOnly value={db.person.url} aria-label="Site address" />
          <button
            ref={first}
            type="button"
            className={s.primaryBtn}
            onClick={() => {
              void navigator.clipboard?.writeText(db.person.url).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <h3 className={s.overline}>Owner</h3>
        <div className={s.owner}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={db.person.photo} alt="" width={36} height={36} className={s.avatarLg} />
          <div>
            <b>{profile.name}</b>
            <span className={s.selType}>
              {db.current.title}, {db.current.company}
            </span>
          </div>
        </div>
        <ul className={s.contactList}>
          <li>
            <a href={`mailto:${profile.email}`}>
              <Icon name="send" size={14} /> {profile.email}
            </a>
          </li>
          <li>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              <Icon name="link" size={14} /> LinkedIn
            </a>
          </li>
          <li>
            <a href={profile.github} target="_blank" rel="noreferrer">
              <Icon name="link" size={14} /> GitHub
            </a>
          </li>
          <li>
            <a href={profile.cv}>
              <Icon name="export" size={14} /> Download CV
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={cx(s.dialog, s.dialogWide)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
      >
        <header className={s.dialogHead}>
          <h2 id="keys-title">Keyboard shortcuts</h2>
          <button type="button" className={s.mini} onClick={onClose} aria-label="Close" autoFocus>
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className={s.keysGrid}>
          {SHORTCUTS.map(([group, list]) => (
            <section key={group}>
              <h3 className={s.overline}>{group}</h3>
              <dl>
                {list.map(([k, v]) => (
                  <div key={k + v}>
                    <dt>{v}</dt>
                    <dd>
                      <kbd>{k}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the editor */

export default function Vector() {
  const phone = usePhone();
  const tool = useSlice((st) => st.tool);
  const play_ = useSlice((st) => st.play);
  const reading = useSlice((st) => st.reading);
  const help = useSlice((st) => st.help);
  const rulers = useSlice((st) => st.rulers);
  const ui = useSlice((st) => st.ui);
  const toast = useSlice((st) => st.toast);
  const undoN = useSlice((st) => st.undo);
  const redoN = useSlice((st) => st.redo);
  const ready = useSlice((st) => st.ready);
  const showComments = useSlice((st) => st.showComments);
  const page = useSlice((st) => st.page);
  const doc = useSlice((st) => st.doc);
  const [share, setShare] = useState(false);
  const [drawer, setDrawer] = useState<'layers' | 'inspect' | null>(null);
  const me = concept('vector');

  useEffect(() => {
    if (!store.get().ready) void prepare();
  }, []);

  // Shortcuts for the whole editor. Inputs, the layer tree and dialogs handle their own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = store.get();
      const t = e.target as HTMLElement;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (st.play) return;
      if (st.reading) {
        if (e.key === 'Escape') set({ reading: false });
        return;
      }
      if (phone) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const onCanvas = t?.tagName === 'CANVAS' || t === document.body;
      const done = () => e.preventDefault();
      if (mod) {
        if (k === 'z') return (done(), e.shiftKey ? redo() : undo());
        if (k === 'y') return (done(), redo());
        if (k === 'd') return (done(), duplicate());
        if (k === 'c' && !e.altKey)
          return window.getSelection()?.toString() ? undefined : (done(), copy());
        if (k === 'x') return (done(), cut());
        if (k === 'v' && !e.altKey) return (done(), paste());
        if (k === 'a') return (done(), selectAll());
        if (e.code === 'KeyG' && e.altKey) return (done(), frameSelection());
        if (e.code === 'KeyK' && e.altKey) return (done(), createComponent());
        if (e.code === 'KeyB' && e.altKey) {
          done();
          const id = st.sel[0];
          if (id && st.doc.nodes[id]?.main) detachInstanceAt(id);
          return;
        }
        if (e.code === 'BracketRight') return (done(), reorder(1, e.shiftKey));
        if (e.code === 'BracketLeft') return (done(), reorder(-1, e.shiftKey));
        if (e.shiftKey && k === 'h') return (done(), toggle('visible'));
        if (e.shiftKey && k === 'l') return (done(), toggle('locked'));
        if (k === '=' || k === '+') return (done(), zoomBy(1.25));
        if (k === '-') return (done(), zoomBy(0.8));
        if (k === '0') return (done(), zoomTo(1));
        if (k === '\\') return (done(), set({ ui: !st.ui }));
        if (k === 'enter' && e.altKey) return (done(), play());
        return;
      }
      if (e.altKey && !e.shiftKey) {
        const map: Record<string, Parameters<typeof alignTo>[0]> = {
          KeyA: 'left',
          KeyH: 'hcenter',
          KeyD: 'right',
          KeyW: 'top',
          KeyV: 'vcenter',
          KeyS: 'bottom',
        };
        if (map[e.code]) return (done(), alignTo(map[e.code]));
      }
      if (e.shiftKey && e.code === 'Digit1') return (done(), fitAll());
      if (e.shiftKey && e.code === 'Digit2') return (done(), fitSelection());
      if (e.shiftKey && e.code === 'Digit0') return (done(), zoomTo(1));
      if (e.shiftKey && e.altKey && e.code === 'KeyA') return (done(), setLayout(null));
      if (e.shiftKey && e.code === 'KeyA') return (done(), addAutoLayout());
      if (e.shiftKey && e.code === 'KeyR') return (done(), set({ rulers: !st.rulers }));
      if (e.key === '?') return (done(), set({ help: !st.help }));
      if (e.key === 'Delete' || e.key === 'Backspace') return (done(), remove());
      if (e.key === 'Escape') {
        if (st.open) return set({ open: null });
        if (st.tool !== 'move') return setTool('move');
        if (st.sel.length) return selectParent();
        return;
      }
      if (e.key === 'Enter') {
        done();
        if (e.shiftKey) return selectParent();
        const id = st.sel[0];
        if (st.sel.length === 1 && st.doc.nodes[id]?.type === 'text') return startEditing(id);
        return selectChildren();
      }
      if (e.key === 'Tab' && onCanvas && t?.tagName === 'CANVAS')
        return (done(), selectSibling(e.shiftKey ? -1 : 1));
      if (
        e.key.startsWith('Arrow') &&
        st.sel.length &&
        !t?.closest('[role="tree"], [role="tablist"], [role="slider"], [role="group"]')
      ) {
        done();
        const d = e.shiftKey ? 10 : 1;
        return nudge(
          e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0,
          e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0,
        );
      }
      if (e.key === '+' || e.key === '=') return (done(), zoomBy(1.25));
      if (e.key === '-' || e.key === '_') return (done(), zoomBy(0.8));
      if (e.altKey || e.shiftKey) return;
      const tools: Record<string, Tool> = {
        v: 'move',
        f: 'frame',
        a: 'frame',
        r: 'rect',
        t: 'text',
        h: 'hand',
        c: 'comment',
      };
      if (tools[k]) return (done(), setTool(tools[k]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phone]);

  const mainMenu = [
    { label: 'Read as a page', on: () => set({ reading: true }) },
    { label: 'Keyboard shortcuts', kbd: '?', on: () => set({ help: true }) },
    null,
    { label: 'Undo', kbd: '⌘Z', on: undo },
    { label: 'Redo', kbd: '⇧⌘Z', on: redo },
    null,
    { label: 'Rulers', kbd: '⇧R', on: () => set({ rulers: !rulers }), checked: rulers },
    { label: 'Comments', on: () => set({ showComments: !showComments }), checked: showComments },
    { label: 'Hide interface', kbd: '⌘\\', on: () => set({ ui: false }) },
    null,
    {
      label: `Email ${db.person.first}`,
      on: () => (window.location.href = `mailto:${profile.email}`),
    },
  ];
  const zoomMenu = [
    { label: 'Zoom in', kbd: '+', on: () => zoomBy(1.25) },
    { label: 'Zoom out', kbd: '−', on: () => zoomBy(0.8) },
    null,
    { label: 'Zoom to fit', kbd: '⇧1', on: () => fitAll() },
    { label: 'Zoom to selection', kbd: '⇧2', on: () => fitSelection() },
    { label: 'Zoom to 50%', on: () => zoomTo(0.5) },
    { label: 'Zoom to 100%', kbd: '⇧0', on: () => zoomTo(1) },
    { label: 'Zoom to 200%', on: () => zoomTo(2) },
  ];

  return (
    <div
      className={s.root}
      data-phone={phone || undefined}
      data-ui={ui ? undefined : 'hidden'}
      data-tool={tool}
    >
      <a
        href="#read"
        className={s.skip}
        onClick={(e) => (e.preventDefault(), set({ reading: true }))}
      >
        Skip the editor and read everything as a page
      </a>

      <header className={s.bar}>
        <div className={s.barLeft}>
          <Menu items={mainMenu} label="Main menu">
            <span className={s.mark} aria-hidden="true">
              {me.letter}
            </span>
            <Icon name="down" size={11} />
          </Menu>
          {!phone && (
            <div className={s.tools} role="toolbar" aria-label="Tools">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={s.tool}
                  aria-pressed={tool === t.id}
                  aria-label={`${t.label} (${t.key})`}
                  title={`${t.label} — ${t.key}`}
                  onClick={() => setTool(t.id)}
                >
                  <Icon name={t.icon} size={17} />
                </button>
              ))}
              <span className={s.barSep} aria-hidden="true" />
              <button
                type="button"
                className={s.tool}
                aria-label="Undo (⌘Z)"
                title="Undo — ⌘Z"
                disabled={!undoN}
                onClick={undo}
              >
                <Icon name="undo" size={16} />
              </button>
              <button
                type="button"
                className={s.tool}
                aria-label="Redo (⇧⌘Z)"
                title="Redo — ⇧⌘Z"
                disabled={!redoN}
                onClick={redo}
              >
                <Icon name="redo" size={16} />
              </button>
            </div>
          )}
        </div>
        <div className={s.barTitle}>
          <span className={s.barTeam}>{profile.name} /</span>
          <h1 className={s.fileName}>{db.person.site}</h1>
          {phone && <span className={s.barPage}>{doc.nodes[page]?.name}</span>}
        </div>
        <div className={s.barRight}>
          {!phone && (
            <ul className={s.people} aria-label="In this file">
              <li title={`${profile.name} (owner)`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={db.person.photo}
                  alt={`${profile.name}, owner`}
                  width={26}
                  height={26}
                  className={s.avatar}
                />
              </li>
              <li title="You (viewing)">
                <span className={`${s.avatar} ${s.avatarYou}`} aria-label="You">
                  Y
                </span>
              </li>
            </ul>
          )}
          <button
            type="button"
            className={cx(s.barBtn, s.readBtn)}
            onClick={() => set({ reading: true })}
            title="Read everything as a plain page"
          >
            <Icon name="book" size={15} />
            <span>Read as page</span>
          </button>
          {!phone && (
            <button type="button" className={s.barBtn} onClick={() => setShare(true)}>
              <Icon name="share" size={15} />
              <span>Share</span>
            </button>
          )}
          <button
            type="button"
            className={cx(s.barBtn, s.playBtn)}
            onClick={() => play()}
            title="Play the prototype (⌥⌘↵)"
            disabled={!ready}
          >
            <Icon name="play" size={13} />
            <span>Play</span>
          </button>
          {!phone && (
            <Menu items={zoomMenu} label="Zoom" className={s.zoomMenu}>
              <ZoomLabel />
              <Icon name="down" size={11} />
            </Menu>
          )}
        </div>
      </header>

      {!phone && (
        <aside className={s.left} aria-label="Pages and layers">
          <Pages />
          <LeftTabs />
          <LeftBody />
        </aside>
      )}

      <main className={s.stage} aria-label="Canvas">
        <Canvas readOnly={phone} onTap={(id) => phone && id && setDrawer((d) => d ?? 'inspect')} />
        {!ui && (
          <button type="button" className={s.showUi} onClick={() => set({ ui: true })}>
            Show interface <kbd>⌘\</kbd>
          </button>
        )}
        {toast && (
          <p key={toast.n} className={s.toast} role="status">
            {toast.text}
          </p>
        )}
        {phone && (
          <nav className={s.phoneTabs} aria-label="Pages and panels">
            <select
              className={s.phonePage}
              value={page}
              aria-label="Page"
              onChange={(e) => setPage(e.target.value)}
            >
              {doc.pages.map((p) => (
                <option key={p} value={p}>
                  {doc.nodes[p].name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={s.barBtn}
              aria-pressed={drawer === 'layers'}
              onClick={() => setDrawer(drawer === 'layers' ? null : 'layers')}
            >
              <Icon name="rows" size={14} /> Layers
            </button>
            <button
              type="button"
              className={s.barBtn}
              aria-pressed={drawer === 'inspect'}
              onClick={() => setDrawer(drawer === 'inspect' ? null : 'inspect')}
            >
              <Icon name="frame" size={14} /> Inspect
            </button>
            <button type="button" className={s.barBtn} onClick={() => fitAll()}>
              Fit all
            </button>
          </nav>
        )}
      </main>

      {!phone && (
        <aside className={s.right} aria-label="Properties">
          <RightTabs />
          <RightPanel />
        </aside>
      )}

      {phone && drawer && (
        <section className={s.drawer} aria-label={drawer === 'layers' ? 'Layers' : 'Inspect'}>
          <header className={s.drawerHead}>
            <h2>{drawer === 'layers' ? 'Layers' : 'Inspect'}</h2>
            <button
              type="button"
              className={s.mini}
              onClick={() => setDrawer(null)}
              aria-label="Close panel"
            >
              <Icon name="close" size={15} />
            </button>
          </header>
          <div className={s.drawerBody}>
            {drawer === 'layers' ? <PhoneLayers /> : <InspectTab />}
          </div>
        </section>
      )}

      {play_ && <Player start={play_.start} />}
      {share && <ShareDialog onClose={() => setShare(false)} />}
      {help && <Shortcuts onClose={() => set({ help: false })} />}
      <Reader open={reading} onClose={() => set({ reading: false })} />
      <noscript>
        <style>{`#read{display:block!important;position:static!important}`}</style>
      </noscript>
    </div>
  );
}

function LeftBody() {
  const left = useSlice((st) => st.left);
  return left === 'layers' ? <Layers /> : <Assets />;
}

function PhoneLayers() {
  // Selecting a layer on the phone flies the canvas to it.
  const sel = useSlice((st) => st.sel);
  const stage = useStage();
  const last = useRef<string | null>(null);
  useEffect(() => {
    const id = sel[0] ?? null;
    if (id && id !== last.current) stage?.fitIds([id]);
    last.current = id;
  }, [sel, stage]);
  return <Layers readOnly />;
}
