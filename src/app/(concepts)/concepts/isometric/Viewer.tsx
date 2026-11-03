'use client';

// I · Isometric. A 3D CAD viewer opened on Moe's hardware: one document per device in db, with
// orbit, a view cube, exploded views, a section plane, measuring, four display modes, a model
// tree, properties and a BOM. The career lives in the project's notes, which also serve as the
// plain page. The engine (three.js) loads after first paint; everything else renders on the server.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { concept } from '../_shared/concepts';
import { db } from '../_shared/data';
import { useReducedMotion, useScheme } from '../_shared/hooks';
import { readScheme, token, writeScheme } from '../_shared/scheme';
import { Bom } from './Bom';
import type {
  Axis,
  Engine,
  Measure,
  PartStats,
  Projection,
  RenderMode,
  Section,
  Theme,
  Totals,
} from './engine';
import { Icon, type IconName } from './icons';
import { Inspector } from './Inspector';
import { DEVICE_IDS, FLAT, type DeviceId, type V3 } from './models';
import { Notes } from './Notes';
import { Tree } from './Tree';
import { Triad, ViewCube } from './ViewCube';
import s from './viewer.module.scss';

const ME = concept('isometric');

/* ------------------------------------------------------------------ documents, from the URL hash */

type Doc = DeviceId | 'notes';
const SLUG = Object.fromEntries(
  DEVICE_IDS.map((id) => [id, id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)]),
) as Record<DeviceId, string>;
const docOf = (hash: string): Doc =>
  hash === 'notes' ? 'notes' : (DEVICE_IDS.find((id) => SLUG[id] === hash) ?? DEVICE_IDS[0]);
const subscribeHash = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
const readHash = () => location.hash.slice(1);
const openDoc = (d: Doc) => {
  location.hash = d === 'notes' ? 'notes' : SLUG[d];
};

/* ------------------------------------------------------------------ live values the engine streams */

interface Live {
  explode: number;
  section: Section;
  measures: Measure[];
  pending: boolean;
}

function makeLive() {
  let state: Live = {
    explode: 0,
    section: { on: false, axis: 'x', flip: false, offset: 0.5, caps: true },
    measures: [],
    pending: false,
  };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<Live>) {
      state = { ...state, ...patch };
      subs.forEach((f) => f());
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
type LiveStore = ReturnType<typeof makeLive>;
const useLive = (live: LiveStore) => useSyncExternalStore(live.subscribe, live.get, live.get);

/* ------------------------------------------------------------------ per-document state */

interface DocState {
  sel: string[];
  hidden: string[];
  isolated: string[] | null;
}
const EMPTY: DocState = { sel: [], hidden: [], isolated: null };

const MODES: { id: RenderMode; label: string; icon: IconName }[] = [
  { id: 'shaded', label: 'Shaded', icon: 'shaded' },
  { id: 'edges', label: 'Shaded with edges', icon: 'edges' },
  { id: 'wire', label: 'Wireframe', icon: 'wire' },
  { id: 'xray', label: 'X-ray', icon: 'xray' },
];

const VIEW_KEYS = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso'] as const;
const PLANES: { axis: Axis; label: string }[] = [
  { axis: 'z', label: 'Front' },
  { axis: 'y', label: 'Top' },
  { axis: 'x', label: 'Right' },
];

const SHORTCUTS: [string, string][] = [
  ['F', 'Zoom to fit'],
  ['0', 'Home view'],
  ['1 to 7', 'Front, back, left, right, top, bottom, isometric'],
  ['P', 'Perspective or orthographic'],
  ['E', 'Explode or collapse'],
  ['S', 'Section on or off'],
  ['X  Y  Z', 'Section on the right, top or front plane'],
  ['M', 'Measure, point to point'],
  ['D', 'Next display mode'],
  ['H', 'Hide or show the selection'],
  ['Shift H', 'Show everything'],
  ['I', 'Isolate the selection'],
  ['B', 'Bill of materials'],
  ['[  ]', 'Previous or next document'],
  ['Esc', 'Cancel, then clear the selection'],
  ['?', 'This list'],
  ['Arrows', 'Orbit, with the viewport focused'],
  ['Shift arrows', 'Pan'],
  ['+  −', 'Zoom'],
];

const MOUSE: [string, string][] = [
  ['Drag', 'Orbit'],
  ['Right drag, or Shift drag', 'Pan'],
  ['Wheel or pinch', 'Zoom at the cursor'],
  ['Click, Shift click', 'Select, add to selection'],
  ['Double-click', 'Zoom to the part'],
  ['Right-click', 'Part menu'],
];

function readTheme(el: Element): Theme {
  const t = (n: string) => token(el, n);
  return {
    edge: t('--v-edge'),
    wire: t('--v-wire'),
    select: t('--v-select'),
    hover: t('--v-hover'),
    section: t('--v-section'),
    measure: t('--v-measure'),
    grid: t('--v-grid'),
    gridMajor: t('--v-grid-major'),
    lines: t('--v-lines'),
    shadow: Number(t('--v-shadow')) || 0.3,
    env: Number(t('--v-env')) || 1,
    key: Number(t('--v-key')) || 1,
  };
}

interface Handlers {
  onPick(id: string | null, e: { additive: boolean; double: boolean }): void;
  onContext(id: string | null, x: number, y: number): void;
}

const toggleIn = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
const same = (a: string[] | null, b: string[]) =>
  !!a && a.length === b.length && b.every((x) => a.includes(x));

/* ------------------------------------------------------------------ the app */

export default function Viewer() {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '');
  const doc = docOf(hash);
  const model: DeviceId = doc === 'notes' ? DEVICE_IDS[0] : doc;
  const flat = FLAT[model];
  const scheme = useScheme();
  const reduced = useReducedMotion();

  const root = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const lastModel = useRef<DeviceId>(DEVICE_IDS[0]);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [live] = useState(makeLive);

  const [docs, setDocs] = useState<Partial<Record<DeviceId, DocState>>>({});
  const [mode, setMode] = useState<RenderMode>('edges');
  const [projection, setProjection] = useState<Projection>('persp');
  const [measuring, setMeasuring] = useState(false);
  const [explodeTool, setExplodeTool] = useState(false);
  const [trails, setTrails] = useState(true);
  const [bomOpen, setBomOpen] = useState(false);
  const [insTab, setInsTab] = useState<'device' | 'props'>('device');
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('peek');
  const [sheetTab, setSheetTab] = useState<'tree' | 'insp' | 'bom'>('insp');
  const [hover, setHover] = useState<string | null>(null);
  const [treeHover, setTreeHover] = useState<string | null>(null);
  const [stats, setStats] = useState<
    Partial<Record<DeviceId, { stats: Record<string, PartStats>; totals: Totals }>>
  >({});
  const [ctx, setCtx] = useState<{ id: string | null; x: number; y: number } | null>(null);
  const [help, setHelp] = useState(false);

  const ds = docs[model] ?? EMPTY;
  const selParts = useMemo(
    () => [...new Set(ds.sel.flatMap((id) => flat.items[id]?.parts ?? []))],
    [ds.sel, flat],
  );
  const selSet = useMemo(() => new Set(selParts), [selParts]);
  const hiddenSet = useMemo(() => new Set(ds.hidden), [ds.hidden]);
  const isoSet = useMemo(() => (ds.isolated ? new Set(ds.isolated) : null), [ds.isolated]);

  const patch = (fn: (d: DocState) => DocState) =>
    setDocs((all) => ({ ...all, [model]: fn(all[model] ?? EMPTY) }));

  /* ---------------- actions */

  const select = (id: string | null, additive = false) => {
    patch((d) => ({
      ...d,
      sel: id === null ? (additive ? d.sel : []) : additive ? toggleIn(d.sel, id) : [id],
    }));
    if (id) setInsTab('props');
  };
  const selectMany = (ids: string[]) => {
    patch((d) => ({ ...d, sel: ids }));
    setInsTab('props');
  };
  const toggleHidden = (ids: string[]) =>
    patch((d) => {
      const all = ids.every((p) => d.hidden.includes(p));
      return {
        ...d,
        hidden: all
          ? d.hidden.filter((p) => !ids.includes(p))
          : [...new Set([...d.hidden, ...ids])],
      };
    });
  const isolate = (ids: string[]) =>
    patch((d) => ({ ...d, isolated: !ids.length || same(d.isolated, ids) ? null : ids }));
  const showAll = () => patch((d) => ({ ...d, hidden: [], isolated: null }));
  const zoomTo = (ids: string[]) => engineRef.current?.fit(ids.length ? ids : undefined);

  const toggleExplode = () => {
    const eng = engineRef.current;
    const open = !explodeTool;
    setExplodeTool(open);
    eng?.animateExplode(open ? 1 : 0);
  };
  const toggleSection = () => engineRef.current?.setSection({ on: !live.get().section.on });
  const toggleMeasure = () => setMeasuring((m) => !m);
  const cycleMode = () =>
    setMode((m) => MODES[(MODES.findIndex((x) => x.id === m) + 1) % MODES.length].id);
  const step = (dir: 1 | -1) => {
    const all: Doc[] = [...DEVICE_IDS, 'notes'];
    openDoc(all[(all.indexOf(doc) + dir + all.length) % all.length]);
  };
  const toNotes = () => {
    openDoc('notes');
    window.scrollTo(0, 0);
  };

  /* ---------------- engine: created once, after first paint */

  const handlers = useRef<Handlers>({ onPick: () => {}, onContext: () => {} });
  useEffect(() => {
    handlers.current = {
      onPick: (id, e) => {
        if (e.double) {
          if (id) engineRef.current?.fit([id]);
          return;
        }
        select(id, e.additive);
      },
      onContext: (id, x, y) => {
        if (id && !selSet.has(id)) select(id);
        setCtx({ id, x, y });
      },
    };
  });

  useEffect(() => {
    let alive = true;
    let eng: Engine | null = null;
    const el = root.current as HTMLDivElement;
    const css = getComputedStyle(el);
    const fonts = {
      mono: css.getPropertyValue('--font-plex-mono').trim() || 'monospace',
      sans: css.getPropertyValue('--font-plex-sans').trim() || 'sans-serif',
    };
    const load = (f: string) => document.fonts?.load(f).catch(() => []) ?? Promise.resolve([]);
    Promise.all([
      import('./engine'),
      load(`600 24px ${fonts.mono}`),
      load(`500 24px ${fonts.sans}`),
    ]).then(([mod]) => {
      if (!alive || !canvasRef.current || !overlayRef.current) return;
      eng = new mod.Engine(
        canvasRef.current,
        overlayRef.current,
        {
          onHover: (id) => setHover(id),
          onPick: (id, e) => handlers.current.onPick(id, e),
          onContext: (id, x, y) => handlers.current.onContext(id, x, y),
          onExplode: (_, t) => live.set({ explode: t }),
          onSection: (_, sec) => live.set({ section: sec }),
          onMeasures: (_, list, pending) => live.set({ measures: list, pending }),
          onStats: (m, st, totals) => setStats((all) => ({ ...all, [m]: { stats: st, totals } })),
          onCursor: (p, snap) => {
            const c = cursorRef.current;
            if (c)
              c.textContent = p
                ? `${p.map((v) => v.toFixed(3)).join('  ')}${snap === 'vertex' ? '  · vertex' : ''}`
                : '—';
          },
        },
        fonts,
        { snap: s.snap, pin: s.pin, tag: s.mtag },
      );
      engineRef.current = eng;
      setEngine(eng);
    });
    return () => {
      alive = false;
      eng?.dispose();
      engineRef.current = null;
    };
  }, [live]);

  // Push React's state into the engine. Showing the document comes first: it resets the rest.
  useEffect(() => {
    if (doc !== 'notes') lastModel.current = doc;
    engine?.setActive(doc !== 'notes');
    if (engine && doc !== 'notes') engine.show(doc);
  }, [engine, doc]);
  // Keep the open document's tab in view when the strip scrolls (phones).
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = tabsRef.current?.parentElement;
    const tab = tabsRef.current?.querySelector('[aria-selected="true"]') as HTMLElement | null;
    if (strip && tab)
      strip.scrollLeft = Math.max(0, tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2);
  }, [doc]);
  useEffect(() => {
    engine?.setSelection(selParts);
  }, [engine, doc, selParts]);
  useEffect(() => {
    engine?.setVisibility(ds.hidden, ds.isolated);
  }, [engine, doc, ds.hidden, ds.isolated]);
  useEffect(() => {
    engine?.setPreselect(treeHover ? (flat.items[treeHover]?.parts ?? []) : []);
  }, [engine, flat, treeHover]);
  useEffect(() => {
    engine?.setMode(mode);
  }, [engine, mode]);
  useEffect(() => {
    engine?.setProjection(projection);
  }, [engine, projection]);
  useEffect(() => {
    engine?.setMeasuring(measuring);
    // Dimensions belong to the tool: closing it clears them.
    if (!measuring) engine?.clearMeasures();
  }, [engine, measuring, doc]);
  useEffect(() => {
    engine?.setExplodeLines(trails);
  }, [engine, trails]);
  useEffect(() => {
    engine?.setReducedMotion(reduced);
  }, [engine, reduced]);
  useEffect(() => {
    if (engine && root.current) engine.setTheme(readTheme(root.current));
  }, [engine, scheme]);

  /* ---------------- keyboard */

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (doc === 'notes' || help || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey)
        return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const eng = engineRef.current;
      const k = e.key;
      if (/^[1-7]$/.test(k)) eng?.view(VIEW_KEYS[Number(k) - 1]);
      else if (k === '0') eng?.view('home');
      else if (k === 'f' || k === 'F') zoomTo(selParts);
      else if (k === 'p' || k === 'P') setProjection((p) => (p === 'persp' ? 'ortho' : 'persp'));
      else if (k === 'e' || k === 'E') toggleExplode();
      else if (k === 's' || k === 'S') toggleSection();
      else if (k === 'x' || k === 'y' || k === 'z' || k === 'X' || k === 'Y' || k === 'Z')
        eng?.setSection({ on: true, axis: k.toLowerCase() as Axis });
      else if (k === 'm' || k === 'M') toggleMeasure();
      else if (k === 'd' || k === 'D') cycleMode();
      else if (k === 'H' && e.shiftKey) showAll();
      else if (k === 'h') {
        if (selParts.length) toggleHidden(selParts);
      } else if (k === 'i' || k === 'I') {
        if (selParts.length) isolate(selParts);
        else if (ds.isolated) showAll();
      } else if (k === 'b' || k === 'B') {
        setBomOpen((o) => !o);
        setSheetTab('bom');
      } else if (k === '[') step(-1);
      else if (k === ']') step(1);
      else if (k === '?') setHelp(true);
      else if (k === 'Escape') {
        if (ctx) setCtx(null);
        else if (eng?.cancelPending()) return;
        else if (measuring) setMeasuring(false);
        else if (ds.sel.length) select(null);
        else if (ds.isolated) showAll();
        else return;
      } else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const fn = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const onViewportKey = (e: React.KeyboardEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    const stepA = Math.PI / 12;
    const pan = 40;
    switch (e.key) {
      case 'ArrowLeft':
        if (e.shiftKey) eng.pan(pan, 0);
        else eng.orbit(stepA, 0);
        break;
      case 'ArrowRight':
        if (e.shiftKey) eng.pan(-pan, 0);
        else eng.orbit(-stepA, 0);
        break;
      case 'ArrowUp':
        if (e.shiftKey) eng.pan(0, pan);
        else eng.orbit(0, stepA);
        break;
      case 'ArrowDown':
        if (e.shiftKey) eng.pan(0, -pan);
        else eng.orbit(0, -stepA);
        break;
      case '+':
      case '=':
        eng.zoom(1.2);
        break;
      case '-':
      case '_':
        eng.zoom(1 / 1.2);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  /* ---------------- render */

  const totals = stats[model]?.totals;
  const selName =
    ds.sel.length === 1
      ? flat.items[ds.sel[0]]?.name
      : ds.sel.length
        ? `${selParts.length} parts`
        : null;
  const studio = (
    <>
      <span className={s.onLight}>Light studio</span>
      <span className={s.onDark}>Dark studio</span>
    </>
  );

  return (
    <div
      ref={root}
      className={s.root}
      data-doc={doc === 'notes' ? 'notes' : 'model'}
      data-sheet={sheet}
      data-tab={sheetTab}
      data-bom={bomOpen || undefined}
    >
      <header className={s.titlebar}>
        <div className={s.brand}>
          <span className={s.logo} aria-hidden="true">
            <Icon name="cube" size={16} />
          </span>
          <b>{ME.name}</b>
          <span className={s.crumb}>
            <span>{db.person.site}</span>
            <span aria-hidden="true">/</span>
            <span>hardware</span>
          </span>
        </div>
        <div className={s.titleTools}>
          <button
            type="button"
            className={s.textBtn}
            onClick={() => (doc === 'notes' ? openDoc(lastModel.current) : toNotes())}
          >
            <Icon name={doc === 'notes' ? 'cube' : 'page'} size={15} />
            <span>{doc === 'notes' ? 'Back to the model' : 'Read as page'}</span>
          </button>
          <button
            type="button"
            className={s.iconBtn}
            onClick={() => setHelp(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Icon name="keyboard" size={16} />
          </button>
        </div>
      </header>

      <nav className={s.docTabs} aria-label="Documents">
        <div ref={tabsRef} role="tablist" aria-label="Open documents" className={s.tabList}>
          {[...DEVICE_IDS, 'notes' as const].map((d) => {
            const on = d === doc;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="workspace"
                tabIndex={on ? 0 : -1}
                className={s.docTab}
                onClick={() => (d === 'notes' ? toNotes() : openDoc(d))}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  e.preventDefault();
                  const list = e.currentTarget.parentElement;
                  const all: Doc[] = [...DEVICE_IDS, 'notes'];
                  const next =
                    all[
                      (all.indexOf(d) + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length
                    ];
                  if (next === 'notes') toNotes();
                  else openDoc(next);
                  requestAnimationFrame(() =>
                    (list?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus(),
                  );
                }}
              >
                <Icon name={d === 'notes' ? 'notes' : 'cube'} size={14} />
                {d === 'notes' ? (
                  <span className={s.tabName}>Notes</span>
                ) : (
                  <>
                    <span className={s.tabTag}>{db.devices[d].tag}</span>
                    <span className={s.tabName}>{db.devices[d].name}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {doc === 'notes' ? (
        <main id="workspace" className={s.reading}>
          <Notes onOpen={(id) => openDoc(id)} onBack={() => openDoc(lastModel.current)} />
        </main>
      ) : null}

      <Toolbar
        live={live}
        engine={engine}
        mode={mode}
        setMode={setMode}
        projection={projection}
        setProjection={setProjection}
        measuring={measuring}
        onMeasure={toggleMeasure}
        explodeTool={explodeTool}
        onExplode={toggleExplode}
        onSection={toggleSection}
        bomOpen={bomOpen}
        onBom={() => {
          setBomOpen((o) => !o);
          setSheetTab('bom');
          setSheet((sh) => (sh === 'peek' ? 'half' : sh));
        }}
        onFit={() => zoomTo(selParts)}
        studio={studio}
      />

      <div id={doc === 'notes' ? undefined : 'workspace'} className={s.work}>
        <aside className={s.treePane} data-pane="tree" aria-label="Model tree">
          <Tree
            key={model}
            flat={flat}
            selected={ds.sel}
            selParts={selSet}
            hidden={hiddenSet}
            isolated={isoSet}
            hover={hover}
            onSelect={(id, add) => select(id, add)}
            onZoom={(id) => zoomTo(flat.items[id].parts)}
            onToggle={(id) => toggleHidden(flat.items[id].parts)}
            onIsolate={(id) => isolate(flat.items[id].parts)}
            onPreselect={setTreeHover}
          />
        </aside>

        <section
          className={s.viewport}
          aria-label={`3D viewport: ${flat.model.tag} ${flat.model.name}`}
          aria-describedby="vp-help"
          tabIndex={0}
          onKeyDown={onViewportKey}
        >
          <p id="vp-help" className={s.sr}>
            Drag to orbit, right-drag to pan, scroll to zoom. With the viewport focused, the arrow
            keys orbit, Shift and the arrows pan, and plus and minus zoom. Press question mark for
            every shortcut.
          </p>
          <div className={s.canvasHost}>
            <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />
          </div>
          <div ref={overlayRef} className={s.overlay} />
          <div className={s.stamp}>
            <b>{`${flat.model.tag} · ${flat.model.name}`}</b>
            <span>Illustrative geometry · not production CAD</span>
          </div>
          <ViewCube engine={engine} />
          <Triad engine={engine} />
          {!engine && <p className={s.loading}>Loading geometry…</p>}
          <Hud
            live={live}
            engine={engine}
            explodeTool={explodeTool}
            onExplodeClose={toggleExplode}
            trails={trails}
            setTrails={setTrails}
            measuring={measuring}
            onMeasureClose={() => setMeasuring(false)}
          />
        </section>

        <section className={s.bomPane} data-pane="bom" aria-label="Bill of materials">
          <Bom
            flat={flat}
            selParts={selSet}
            onSelect={selectMany}
            onClose={() => setBomOpen(false)}
          />
        </section>

        <aside className={s.inspPane} data-pane="insp" aria-label="Inspector">
          <Inspector
            flat={flat}
            doc={model}
            tab={insTab}
            onTab={setInsTab}
            sel={ds.sel}
            selParts={selParts}
            hidden={hiddenSet}
            stats={stats[model]?.stats}
            totals={totals}
            onZoom={zoomTo}
            onHide={toggleHidden}
            onIsolate={isolate}
            onNotes={toNotes}
          />
        </aside>

        <div className={s.sheetBar}>
          <button
            type="button"
            className={s.grip}
            aria-label={
              sheet === 'peek'
                ? 'Open the panel'
                : sheet === 'half'
                  ? 'Expand the panel'
                  : 'Collapse the panel'
            }
            onClick={() =>
              setSheet((sh) => (sh === 'peek' ? 'half' : sh === 'half' ? 'full' : 'peek'))
            }
          >
            <i />
          </button>
          <div className={s.sheetTabs} role="tablist" aria-label="Panels">
            {(
              [
                ['tree', 'Parts', 'layers'],
                ['insp', 'Inspector', 'page'],
                ['bom', 'BOM', 'table'],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={sheetTab === id && sheet !== 'peek'}
                className={s.sheetTab}
                data-active={sheetTab === id || undefined}
                onClick={() => {
                  if (sheetTab === id && sheet !== 'peek') setSheet('peek');
                  else {
                    setSheetTab(id);
                    setSheet((sh) => (sh === 'peek' ? 'half' : sh));
                  }
                }}
              >
                <Icon name={icon} size={14} />
                {label}
                {id === 'insp' && selParts.length > 0 && (
                  <span className={s.badge}>{selParts.length}</span>
                )}
              </button>
            ))}
          </div>
          {selName && (
            <button
              type="button"
              className={s.sheetSel}
              onClick={() => {
                setSheetTab('insp');
                setInsTab('props');
                setSheet('half');
              }}
            >
              <Icon name="target" size={13} />
              <span>{selName}</span>
            </button>
          )}
        </div>
      </div>

      <Status
        live={live}
        cursorRef={cursorRef}
        selName={selName}
        hoverName={hover ? flat.items[hover]?.name : null}
        measuring={measuring}
        totals={totals}
        projection={projection}
        mode={mode}
      />

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          name={ctx.id ? flat.items[ctx.id]?.name : null}
          onClose={() => setCtx(null)}
          items={[
            ...(ctx.id
              ? [
                  {
                    label: 'Zoom to',
                    key: 'F',
                    run: () => zoomTo(selParts.length ? selParts : [ctx.id as string]),
                  },
                  {
                    label: hiddenSet.has(ctx.id) ? 'Show' : 'Hide',
                    key: 'H',
                    run: () => toggleHidden(selParts.length ? selParts : [ctx.id as string]),
                  },
                  {
                    label: 'Isolate',
                    key: 'I',
                    run: () => isolate(selParts.length ? selParts : [ctx.id as string]),
                  },
                  {
                    label: 'Properties',
                    key: '',
                    run: () => {
                      setInsTab('props');
                      setSheetTab('insp');
                      setSheet((sh) => (sh === 'peek' ? 'half' : sh));
                    },
                  },
                ]
              : []),
            { label: 'Show all', key: 'Shift H', run: showAll },
            { label: 'Zoom to fit', key: 'F', run: () => zoomTo([]) },
            { label: 'Home view', key: '0', run: () => engineRef.current?.view('home') },
          ]}
        />
      )}

      {help && <Help onClose={() => setHelp(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ toolbar */

interface ToolbarProps {
  live: LiveStore;
  engine: Engine | null;
  mode: RenderMode;
  setMode(m: RenderMode): void;
  projection: Projection;
  setProjection(p: Projection): void;
  measuring: boolean;
  onMeasure(): void;
  explodeTool: boolean;
  onExplode(): void;
  onSection(): void;
  bomOpen: boolean;
  onBom(): void;
  onFit(): void;
  studio: React.ReactNode;
}

function Tool({
  icon,
  label,
  keyHint,
  pressed,
  onClick,
  wide,
}: {
  icon: IconName;
  label: string;
  keyHint?: string;
  pressed?: boolean;
  onClick(): void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={s.tool}
      data-wide={wide || undefined}
      aria-pressed={pressed}
      onClick={onClick}
      title={keyHint ? `${label} (${keyHint})` : label}
      aria-keyshortcuts={keyHint}
    >
      <Icon name={icon} size={17} />
      <span>{label}</span>
    </button>
  );
}

function Toolbar(p: ToolbarProps) {
  const { section } = useLive(p.live);
  const [views, setViews] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!views) return;
    (menu.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
    const close = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setViews(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [views]);

  return (
    <div className={s.toolbar} role="toolbar" aria-label="Viewer tools">
      <div className={s.group}>
        <Tool icon="fit" label="Fit" keyHint="F" onClick={p.onFit} />
        <div className={s.menuWrap} ref={menu}>
          <button
            type="button"
            className={s.tool}
            aria-haspopup="menu"
            aria-expanded={views}
            onClick={() => setViews((v) => !v)}
            title="Standard views (1 to 7)"
          >
            <Icon name="views" size={17} />
            <span>Views</span>
          </button>
          {views && (
            <div
              className={s.menu}
              role="menu"
              aria-label="Standard views"
              onKeyDown={(e) => e.key === 'Escape' && setViews(false)}
            >
              {[...VIEW_KEYS, 'home' as const].map((v, i) => (
                <button
                  key={v}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    p.engine?.view(v);
                    setViews(false);
                  }}
                >
                  <span>
                    {v === 'iso'
                      ? 'Isometric'
                      : v === 'home'
                        ? 'Home'
                        : v[0].toUpperCase() + v.slice(1)}
                  </span>
                  <kbd>{v === 'home' ? '0' : String(i + 1)}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
        <Tool
          icon={p.projection === 'persp' ? 'persp' : 'ortho'}
          label={p.projection === 'persp' ? 'Perspective' : 'Orthographic'}
          keyHint="P"
          onClick={() => p.setProjection(p.projection === 'persp' ? 'ortho' : 'persp')}
          wide
        />
      </div>
      <div className={s.group}>
        <Tool
          icon="explode"
          label="Explode"
          keyHint="E"
          pressed={p.explodeTool}
          onClick={p.onExplode}
        />
        <Tool
          icon="section"
          label="Section"
          keyHint="S"
          pressed={section.on}
          onClick={p.onSection}
        />
        <Tool
          icon="measure"
          label="Measure"
          keyHint="M"
          pressed={p.measuring}
          onClick={p.onMeasure}
        />
      </div>
      <div className={s.group} role="radiogroup" aria-label="Display mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={p.mode === m.id}
            className={s.seg}
            onClick={() => p.setMode(m.id)}
            title={`${m.label} (D cycles)`}
          >
            <Icon name={m.icon} size={17} />
            <span>{m.id === 'edges' ? 'Edges' : m.label}</span>
          </button>
        ))}
      </div>
      <div className={s.group}>
        <button
          type="button"
          className={s.tool}
          data-wide
          onClick={() => writeScheme(readScheme() === 'dark' ? 'light' : 'dark')}
          title="Studio environment, light or dark"
        >
          <span className={s.onLight}>
            <Icon name="sun" size={17} />
          </span>
          <span className={s.onDark}>
            <Icon name="moon" size={17} />
          </span>
          <span>{p.studio}</span>
        </button>
        <Tool icon="table" label="BOM" keyHint="B" pressed={p.bomOpen} onClick={p.onBom} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ HUD: the active tools' options */

interface HudProps {
  live: LiveStore;
  engine: Engine | null;
  explodeTool: boolean;
  onExplodeClose(): void;
  trails: boolean;
  setTrails(on: boolean): void;
  measuring: boolean;
  onMeasureClose(): void;
}

function Hud({
  live,
  engine,
  explodeTool,
  onExplodeClose,
  trails,
  setTrails,
  measuring,
  onMeasureClose,
}: HudProps) {
  const { explode, section, measures, pending } = useLive(live);
  if (!explodeTool && !section.on && !measuring) return null;
  const at = engine?.sectionAt() ?? 0;
  const last = measures[measures.length - 1];
  return (
    <div className={s.hud}>
      {explodeTool && (
        <div className={s.hudRow} role="group" aria-label="Explode">
          <span className={s.hudName}>
            <Icon name="explode" size={14} />
            Explode
          </span>
          <button
            type="button"
            className={s.hudBtn}
            onClick={() => engine?.animateExplode(explode > 0.5 ? 0 : 1)}
            aria-label={explode > 0.5 ? 'Collapse' : 'Explode'}
          >
            <Icon name={explode > 0.5 ? 'reverse' : 'play'} size={13} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(explode * 100)}
            onChange={(e) => engine?.setExplode(Number(e.target.value) / 100)}
            aria-label="Explode distance"
            className={s.slider}
          />
          <output className={s.hudVal}>{`${Math.round(explode * 100)}%`}</output>
          <label className={s.check}>
            <input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} />
            Trails
          </label>
          <button
            type="button"
            className={s.hudClose}
            onClick={onExplodeClose}
            aria-label="Close explode and collapse"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      {section.on && (
        <div className={s.hudRow} role="group" aria-label="Section">
          <span className={s.hudName}>
            <Icon name="section" size={14} />
            Section
          </span>
          <span className={s.segs} role="radiogroup" aria-label="Section plane">
            {PLANES.map((pl) => (
              <button
                key={pl.axis}
                type="button"
                role="radio"
                aria-checked={section.axis === pl.axis}
                onClick={() => engine?.setSection({ axis: pl.axis })}
                title={`${pl.label} plane (${pl.axis.toUpperCase()})`}
              >
                {pl.label}
              </button>
            ))}
          </span>
          <button
            type="button"
            className={s.hudBtn}
            aria-pressed={section.flip}
            onClick={() => engine?.setSection({ flip: !section.flip })}
            aria-label="Flip the cut"
            title="Flip the cut"
          >
            <Icon name="flip" size={13} />
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(section.offset * 1000)}
            onChange={(e) => engine?.setSection({ offset: Number(e.target.value) / 1000 })}
            aria-label="Section offset"
            className={s.slider}
          />
          <output className={s.hudVal}>{`${section.axis.toUpperCase()} ${at.toFixed(2)}`}</output>
          <label className={s.check}>
            <input
              type="checkbox"
              checked={section.caps}
              onChange={(e) => engine?.setSection({ caps: e.target.checked })}
            />
            Caps
          </label>
          <button
            type="button"
            className={s.hudClose}
            onClick={() => engine?.setSection({ on: false })}
            aria-label="Turn the section off"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      {measuring && (
        <div className={s.hudRow} role="group" aria-label="Measure">
          <span className={s.hudName}>
            <Icon name="measure" size={14} />
            Measure
          </span>
          <span className={s.hudText} aria-live="polite">
            {pending ? (
              'Pick the second point'
            ) : last ? (
              <>
                <b>{`${last.d.toFixed(3)} u`}</b>
                {`  Δ ${last.delta.map((v) => v.toFixed(2)).join(' · ')}`}
              </>
            ) : (
              'Pick a point. It snaps to the nearest vertex'
            )}
          </span>
          <span className={s.hudCount}>{`${measures.length} placed`}</span>
          <button
            type="button"
            className={s.miniBtn}
            onClick={() => engine?.clearMeasures()}
            disabled={!measures.length}
          >
            Clear
          </button>
          <button
            type="button"
            className={s.hudClose}
            onClick={onMeasureClose}
            aria-label="Stop measuring"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ status bar */

function Status({
  live,
  cursorRef,
  selName,
  hoverName,
  measuring,
  totals,
  projection,
  mode,
}: {
  live: LiveStore;
  cursorRef: React.RefObject<HTMLSpanElement | null>;
  selName: string | null;
  hoverName: string | null;
  measuring: boolean;
  totals?: Totals;
  projection: Projection;
  mode: RenderMode;
}) {
  const { section, explode, pending } = useLive(live);
  const hint = measuring
    ? pending
      ? 'Measure: pick the second point · Esc cancels'
      : 'Measure: pick the first point'
    : section.on
      ? 'Section: drag the arrow to move the cut'
      : explode > 0
        ? 'Exploded view'
        : 'Ready';
  return (
    <footer className={s.status}>
      <span className={s.stHint}>{hint}</span>
      <span className={s.stSel} aria-live="polite">
        {selName ? `Selected: ${selName}` : hoverName ? hoverName : ''}
      </span>
      <span className={s.stCursor}>
        <span className={s.stKey}>XYZ</span>
        <span ref={cursorRef}>—</span>
      </span>
      <span
        className={s.stMeta}
      >{`u · ${projection === 'persp' ? 'Persp' : 'Ortho'} · ${MODES.find((m) => m.id === mode)?.label} · ${totals ? totals.tris.toLocaleString('en-US') : '—'} tris`}</span>
    </footer>
  );
}

/* ------------------------------------------------------------------ context menu and help */

function ContextMenu({
  x,
  y,
  name,
  items,
  onClose,
}: {
  x: number;
  y: number;
  name: string | null;
  items: { label: string; key: string; run(): void }[];
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
    el.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
    (el.querySelector('button') as HTMLButtonElement | null)?.focus();
    const close = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) closeRef.current();
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [x, y]);
  const onKey = (e: React.KeyboardEvent) => {
    const btns = [...(ref.current?.querySelectorAll('button') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') btns[(i + 1) % btns.length]?.focus();
    else if (e.key === 'ArrowUp') btns[(i - 1 + btns.length) % btns.length]?.focus();
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div
      ref={ref}
      className={s.ctx}
      role="menu"
      aria-label={name ?? 'Viewport'}
      style={{ left: x, top: y }}
      onKeyDown={onKey}
    >
      {name && <p className={s.ctxHead}>{name}</p>}
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          onClick={() => {
            it.run();
            onClose();
          }}
        >
          <span>{it.label}</span>
          {it.key && <kbd>{it.key}</kbd>}
        </button>
      ))}
    </div>
  );
}

function Help({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // No close() on cleanup: it would fire onClose, and StrictMode's re-run would shut the dialog.
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.help}
      aria-labelledby="help-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <header>
        <h2 id="help-title">Keyboard and mouse</h2>
        <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Close">
          <Icon name="close" size={15} />
        </button>
      </header>
      <div className={s.helpCols}>
        <dl>
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt>
                {k.split(/\s{2,}| (?=[A-Z])/).map((part) => (
                  <kbd key={part}>{part}</kbd>
                ))}
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <dl>
          {MOUSE.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
  );
}

export type { V3 };
