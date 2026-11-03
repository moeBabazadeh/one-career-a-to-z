'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { profile } from '../_shared/data';
import { useReducedMotion, useScheme } from '../_shared/hooks';
import { BAGS } from './bags';
import type { Engine, Hooks } from './engine';
import {
  ChapterCard,
  DisplaysPanel,
  HelpDialog,
  InspectorPanel,
  TimePanel,
  Toolbar,
  TopicsPanel,
  ViewsPanel,
  type Controls,
} from './Panels';
import Reader from './Reader';
import s from './console.module.scss';
import {
  createStore,
  initialDisplays,
  TOOLS,
  VIEWS,
  type Displays,
  type InspectTarget,
  type Tool,
  type ViewState,
} from './store';

/* ------------------------------------------------------------------ read as a page */

const subscribeHash = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
/** The plain page is open when the address ends in #read, so it can be linked and the back button closes it. */
const useReading = () =>
  useSyncExternalStore(
    subscribeHash,
    () => location.hash === '#read',
    () => false,
  );

export type Tab = 'chapter' | 'displays' | 'topics' | 'inspector' | 'views';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chapter', label: 'Chapter' },
  { id: 'displays', label: 'Displays' },
  { id: 'topics', label: 'Topics' },
  { id: 'inspector', label: 'Inspect' },
  { id: 'views', label: 'Views' },
];

const RATES = [0.25, 0.5, 1, 2, 4];

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));

export default function RobotConsole() {
  const reading = useReading();
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [store] = useState(createStore);
  const snap = useSyncExternalStore(store.subscribe, store.get, store.server);

  const [displays, setDisplays] = useState<Displays>(initialDisplays);
  const [tool, setTool] = useState<Tool>('interact');
  const [view, setView] = useState<ViewState>({ type: 'orbit', target: 'base_link' });
  const [inspect, setInspect] = useState<InspectTarget>({ kind: 'topic', name: '/imu' });
  const [noarr, setNoarr] = useState(false);
  const [tab, setTab] = useState<Tab>('chapter');
  const [sheetFull, setSheetFull] = useState(false);
  const [help, setHelp] = useState(false);
  const [ready, setReady] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const hooks = useRef<Hooks>({ toolDone: () => {}, select: () => {} });
  const latest = useRef({ displays, reduced });

  useEffect(() => {
    latest.current = { displays, reduced };
    hooks.current = {
      toolDone: () => setTool('interact'),
      select: (frame) => {
        if (frame) {
          setInspect({ kind: 'frame', name: frame });
          setTab('inspector');
        }
      },
    };
  });

  // three.js loads after first paint, and only on the client.
  useEffect(() => {
    let dead = false;
    let made: Engine | null = null;
    import('./engine').then(({ Engine }) => {
      if (dead || !stage.current || !rootRef.current) return;
      made = new Engine(
        stage.current,
        rootRef.current,
        store,
        hooks,
        {
          tf: s.tfLabel,
          station: s.stationLabel,
          stationActive: s.stationActive,
          stationNext: s.stationNext,
          im: s.imLabel,
          measure: s.measureLabel,
        },
        latest.current.displays,
        latest.current.reduced,
      );
      engine.current = made;
      setReady(true);
    });
    return () => {
      dead = true;
      made?.dispose();
      engine.current = null;
    };
  }, [store]);

  useEffect(() => engine.current?.setDisplays(displays), [ready, displays]);
  useEffect(() => engine.current?.setTool(tool), [ready, tool]);
  useEffect(() => engine.current?.setView(view), [ready, view]);
  useEffect(() => engine.current?.setInspect(inspect, noarr), [ready, inspect, noarr]);
  useEffect(() => engine.current?.setReduced(reduced), [ready, reduced]);
  useEffect(() => engine.current?.scheme(), [ready, scheme]);

  const controls: Controls = {
    toggle: () => engine.current?.toggle(),
    loadBag: (i) => engine.current?.loadBag(i, true),
    seek: (t) => engine.current?.seek(t),
    step: (d) => engine.current?.step(d),
    jump: (d) => engine.current?.jump(d),
    start: () => engine.current?.seekStart(),
    rate: (r) => engine.current?.setRate(r),
    loop: (l) => engine.current?.setLoop(l),
    reset: () => engine.current?.reset(),
    zero: () => engine.current?.zeroView(),
  };
  const ctl = useRef(controls);
  const keyState = useRef({ snap, view, help, reading });
  useEffect(() => {
    ctl.current = controls;
    keyState.current = { snap, view, help, reading };
  });

  // The keyboard: the visualiser's tool keys, a recorder's transport keys, and a few of our own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { snap: sn, view: v, help: h, reading: r } = keyState.current;
      if (r || h || e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target) && e.key !== 'Escape') return;
      const c = ctl.current;
      const k = e.key;
      const tl = TOOLS.find((t) => t.key === k.toLowerCase());
      let handled = true;
      if (k === ' ') c.toggle();
      else if (tl && !e.shiftKey) setTool(tl.id);
      else if (k === 'Escape') setTool('interact');
      else if (/^[1-9]$/.test(k) && Number(k) <= BAGS.length) c.loadBag(Number(k) - 1);
      else if (k === 'ArrowRight' || k === 'ArrowLeft')
        c.seek(
          Math.max(
            0,
            Math.min(sn.duration, sn.t + (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1)),
          ),
        );
      else if (k === ']') c.jump(1);
      else if (k === '[') c.jump(-1);
      else if (k === '.') c.step(1);
      else if (k === ',') c.step(-1);
      else if (k === 'Home') c.start();
      else if (k === '-' || k === '_') c.rate(RATES[Math.max(0, RATES.indexOf(sn.rate) - 1)]);
      else if (k === '=' || k === '+')
        c.rate(RATES[Math.min(RATES.length - 1, RATES.indexOf(sn.rate) + 1)]);
      else if (k === 'l' || k === 'L') c.loop(!sn.loop);
      else if (k === 'v' || k === 'V')
        setView({
          ...v,
          type: VIEWS[(VIEWS.findIndex((x) => x.id === v.type) + 1) % VIEWS.length].id,
        });
      else if (k === 'z' || k === 'Z') c.zero();
      else if (k === 'r' || k === 'R') c.reset();
      else if (k === 'p' || k === 'P') location.hash = 'read';
      else if (k === '?') setHelp(true);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const bag = BAGS[snap.bag];

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-tab={tab}
      data-sheet={sheetFull ? 'full' : undefined}
      data-reading={reading || undefined}
    >
      <h1 className={s.srOnly}>{`${profile.name}, ${profile.role} at ${profile.company}`}</h1>
      <div className={s.app} hidden={reading}>
        <Toolbar tool={tool} onTool={setTool} onHelp={() => setHelp(true)} />

        <section className={s.view} aria-label="3D view">
          <div
            ref={stage}
            className={s.stage}
            role="img"
            aria-label="A 3D robot visualiser: a Small Size League team passing a ball on a practice pitch, a quadcopter hovering beside it, and a mobile robot driving a walled arena with its laser scan, point cloud and planned path."
          />
          <ChapterCard
            bag={bag}
            card={snap.card}
            t={snap.t}
            variant="overlay"
            onJump={controls.jump}
          />
          {displays.image.on && (
            <div className={s.inset} aria-hidden="true">
              <span>/camera/image_raw</span>
            </div>
          )}
          <p className={s.status} aria-live="off">
            <button
              type="button"
              className={s.resetBtn}
              onClick={controls.reset}
              title="Reset displays (R)"
            >
              Reset
            </button>
            <span className={s.hint}>{snap.hint}</span>
            <span className={s.fps}>{snap.ready ? `${snap.fps} fps` : '—'}</span>
          </p>
        </section>

        <div className={s.tabs} role="tablist" aria-label="Panels">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              data-tab-btn={t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className={s.chapterDock}
          id="panel-chapter"
          role="tabpanel"
          aria-labelledby="tab-chapter"
          data-panel="chapter"
        >
          <ChapterCard
            bag={bag}
            card={snap.card}
            t={snap.t}
            variant="dock"
            onJump={controls.jump}
          />
        </div>

        <div className={s.dockLeft}>
          <DisplaysPanel
            displays={displays}
            status={snap.status}
            colors={snap.colors}
            onChange={setDisplays}
          />
          <TopicsPanel
            rows={snap.topics}
            selected={inspect.kind === 'topic' ? inspect.name : null}
            playing={snap.playing}
            onPick={(name) => {
              setInspect({ kind: 'topic', name });
              setTab('inspector');
            }}
          />
        </div>

        <div className={s.dockRight}>
          <ViewsPanel view={view} info={snap.view} onView={setView} onZero={controls.zero} />
          <InspectorPanel
            target={inspect}
            lines={snap.echo}
            note={snap.echoNote}
            noarr={noarr}
            onNoarr={setNoarr}
            onTarget={setInspect}
          />
        </div>

        <TimePanel
          snap={snap}
          controls={controls}
          rates={RATES}
          sheetFull={sheetFull}
          onSheet={() => setSheetFull(!sheetFull)}
        />
      </div>

      {reading && <Reader />}
      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
