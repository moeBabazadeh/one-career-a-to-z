'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { concept } from '../_shared/concepts';
import { profile } from '../_shared/data';
import { useAnimationFrame, useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { Brief, CHAPTERS } from './chapters';
import {
  Renderer,
  drawTrace,
  fitView,
  palette,
  toWorld,
  type Layers,
  type Palette,
  type View,
} from './draw';
import Joystick from './Joystick';
import {
  DT,
  MARK_P,
  NX,
  TEMPER,
  V_MAX,
  Z_STOP,
  Z_VERIFY,
  at,
  cellAt,
  clock,
  confirm,
  createSim,
  hudOf,
  runUntil,
  scanAt,
  setMode,
  tick,
  type EventKind,
  type Hud,
  type Mark,
  type Mode,
  type Sim,
  type Vec,
} from './sim';
import s from './minefield.module.scss';

const C = concept('minefield');
/** One mine for each chapter of the career. */
const MINES = CHAPTERS.length;
/** The field every visitor sees first; New field deals another. */
const SEED = 0xabb01fb9;
const SPEEDS = [1, 2, 4, 8, 16];
const STEP_TICKS = 6;

interface Snap extends Hud {
  holdMark: Mark | null;
  summary: string | null;
}

function snap(sim: Sim): Snap {
  const h = hudOf(sim);
  const done = sim.phase === 'done' ? sim.events.findLast((e) => e.kind === 'done') : undefined;
  return {
    ...h,
    holdMark: sim.hold !== null ? (sim.marks[sim.hold - 1] ?? null) : null,
    summary: done ? done.text : null,
  };
}

const INITIAL = snap(createSim(SEED, MINES));

interface LogLine {
  id: number;
  t: number;
  kind: EventKind;
  text: string;
  chapter?: string;
}

interface Readout {
  x: number;
  y: number;
  pm: number;
  ps: number;
  lo: number;
  peak: number;
  state: string;
}

const NARROW = '(max-width: 760px)';
const subscribeNarrow = (onChange: () => void) => {
  const q = matchMedia(NARROW);
  q.addEventListener('change', onChange);
  return () => q.removeEventListener('change', onChange);
};
/** Phones get the field turned upright. */
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

const pct = (p: number) =>
  p >= 0.995 ? '>99%' : p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
const deg = (th: number) => Math.round((th * 180) / Math.PI);

function phaseLabel(h: Snap) {
  if (h.hold !== null) return `Holding at mark ${h.hold}`;
  if (h.mode === 'manual') return 'Operator driving';
  if (h.phase === 'coverage') return `Survey, lane ${h.lane} of ${h.lanes}`;
  if (h.phase === 'investigate') return `Pinpointing, look ${h.standoff}`;
  if (h.phase === 'frontier') return 'Sweeping up gaps';
  if (h.phase === 'return') return 'Returning to start';
  return 'Survey complete';
}

function readoutAt(sim: Sim, p: Vec): Readout | null {
  const k = cellAt(p);
  if (k < 0) return null;
  const pm = sim.P[k],
    ps = sim.Ps[k];
  const near = sim.marks.find((m) => Math.hypot(m.x - p.x, m.y - p.y) < 0.12);
  const state = near
    ? `mark ${near.n}`
    : pm > 0.3
      ? 'suspected'
      : pm < sim.P0 * 0.25
        ? 'cleared'
        : ps > 0.6
          ? 'scrap'
          : sim.swept[k]
            ? 'swept'
            : 'unknown';
  return {
    x: (k % NX) * 0.1 + 0.05,
    y: Math.floor(k / NX) * 0.1 + 0.05,
    pm,
    ps,
    lo: sim.L[k],
    peak: sim.peakZ[k],
    state,
  };
}

const KEYS: [string, string][] = [
  ['W A S D', 'drive (switches to manual)'],
  ['Shift', 'creep while driving'],
  ['Click', 'put the coil over a spot'],
  ['M', 'auto or manual'],
  ['Space', 'pause or resume'],
  ['.', 'step 0.1 s'],
  ['N', 'run to the next find'],
  ['Enter', 'confirm a mark and go on'],
  ['[ ]', 'slower, faster'],
  ['R', 'new field'],
  ['H P T C', 'heatmap, plan, truth, cleared'],
  ['?', 'these keys'],
];

export default function Console() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const narrow = useNarrow();
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.05);

  const [hud, setHud] = useState<Snap>(INITIAL);
  const [log, setLog] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [layers, setLayers] = useState<Layers>({
    heat: true,
    cleared: true,
    plan: true,
    trail: true,
    truth: false,
  });
  const [holdOnMark, setHoldOnMark] = useState(true);
  const [opened, setOpened] = useState(0);
  const [tab, setTab] = useState('brief');
  const [locked, setLocked] = useState<number | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [help, setHelp] = useState(false);
  const [ff, setFf] = useState(false);

  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const traceCanvas = useRef<HTMLCanvasElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const logBox = useRef<HTMLOListElement>(null);
  const sim = useRef<Sim | null>(null);
  const renderer = useRef(new Renderer());
  const view = useRef<View | null>(null);
  const pal = useRef<Palette | null>(null);
  const cursor = useRef<Vec | null>(null);
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const seen = useRef(0);
  const acc = useRef(0);
  const last = useRef(0);
  const lastHud = useRef(0);
  const ffBefore = useRef(0);
  const opts = useRef({ speed, layers, narrow, paused, visible, ff });
  useEffect(() => {
    opts.current = { speed, layers, narrow, paused, visible, ff };
  });

  /* ---------------------------------------------------------------- drawing */

  const paint = (now = performance.now() / 1000) => {
    const c = canvas.current,
      m = sim.current,
      v = view.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !m || !v) return;
    pal.current ??= palette(c);
    renderer.current.render(ctx, m, v, pal.current, opts.current.layers, cursor.current, now);
    const tc = traceCanvas.current;
    const tctx = tc?.getContext('2d');
    if (tc && tctx)
      drawTrace(
        tctx,
        tc.clientWidth,
        tc.clientHeight,
        Math.min(2, devicePixelRatio || 1),
        m,
        pal.current,
      );
  };

  /** Push what changed in the sim to the HUD, the log and the chapters. */
  const sync = () => {
    const m = sim.current;
    if (!m) return;
    setHud(snap(m));
    if (cursor.current) setReadout(readoutAt(m, cursor.current));
    if (m.eventId === seen.current) return;
    const fresh = m.events.filter((e) => e.id > seen.current);
    seen.current = m.eventId;
    for (const e of fresh) {
      if (e.kind === 'mark' && e.mark !== undefined && e.mark <= CHAPTERS.length) {
        const n = e.mark;
        setOpened((o) => Math.max(o, n));
        setTab(CHAPTERS[n - 1].id);
        setLocked(null);
      }
      if (e.kind === 'done') {
        setLayers((l) => ({ ...l, truth: true }));
        m.dirty = true;
      }
    }
    setLog(
      m.events.slice(-80).map((e) => ({
        id: e.id,
        t: e.t,
        kind: e.kind,
        text: e.text,
        ...(e.kind === 'mark' && e.mark !== undefined && e.mark <= CHAPTERS.length
          ? { chapter: CHAPTERS[e.mark - 1].title }
          : {}),
      })),
    );
  };

  const resize = () => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    view.current = fitView(r.width, r.height, dpr, opts.current.narrow);
    const tc = traceCanvas.current;
    if (tc) {
      tc.width = Math.round(tc.clientWidth * dpr);
      tc.height = Math.round(tc.clientHeight * dpr);
    }
    paint();
  };

  /* ---------------------------------------------------------------- setup */

  const start = (seed: number) => {
    const m = createSim(seed, MINES);
    m.holdOnMark = holdOnMark;
    sim.current = m;
    seen.current = 0;
    acc.current = 0;
    renderer.current.invalidate();
    keys.current.clear();
    setLayers((l) => ({ ...l, truth: false }));
    setFf(false);
    sync();
    paint();
  };

  const onReady = useEffectEvent(() => {
    setPaused(reduced);
    resize();
    sync();
  });
  const onResize = useEffectEvent(() => resize());
  const onRepaint = useEffectEvent((fresh: boolean) => {
    if (fresh) {
      pal.current = null;
      renderer.current.invalidate();
    }
    if (sim.current) {
      sim.current.dirty = true;
      sim.current.holdOnMark = holdOnMark;
    }
    paint();
  });

  // the first field; with reduced motion it waits for the visitor to start it
  useEffect(() => {
    sim.current = createSim(SEED, MINES);
    const frame = requestAnimationFrame(() => onReady());
    document.fonts?.ready.then(() => onRepaint(true));
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ro = new ResizeObserver(() => onResize());
    ro.observe(c);
    return () => ro.disconnect();
  }, [narrow]);

  // new colours for the field when the scheme changes
  useEffect(() => onRepaint(true), [scheme]);
  useEffect(() => onRepaint(false), [layers, holdOnMark]);

  // the log follows the newest line
  useEffect(() => {
    const el = logBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  /* ---------------------------------------------------------------- the loop */

  /** The operator's stick or keys, as a command for the sim. */
  const input = () => {
    const k = keys.current,
      j = stick.current;
    if (j.x || j.y) return { v: -j.y, w: -j.x * 0.8 };
    const fwd =
      (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const turn =
      (k.has('a') || k.has('arrowleft') ? 1 : 0) - (k.has('d') || k.has('arrowright') ? 1 : 0);
    const slow = k.has('shift') ? 0.4 : 1;
    return { v: fwd * slow, w: turn * (fwd ? 0.6 : 0.7) * slow };
  };

  const takeControl = () => {
    const m = sim.current;
    if (!m) return;
    if (m.mode === 'auto') setMode(m, 'manual');
    confirm(m);
    if (opts.current.paused) setPaused(false);
  };

  useAnimationFrame(
    (sec) => {
      const m = sim.current;
      if (!m) return;
      const dt = last.current ? Math.min(0.1, sec - last.current) : 0;
      last.current = sec;
      const o = opts.current;
      if (o.ff) {
        // fast-forward to the next find, a slice per frame so the page stays responsive
        const done = runUntil(
          m,
          (x) => x.marks.length > ffBefore.current || x.phase === 'done',
          25,
        );
        if (done || m.t > 3600) setFf(false);
        paint(sec);
        sync();
        return;
      }
      const cmd = input();
      if (cmd.v || cmd.w) {
        if (m.mode === 'auto' || m.hold !== null) takeControl();
      }
      m.input = m.mode === 'manual' ? cmd : { v: 0, w: 0 };
      acc.current += dt * SPEEDS[o.speed];
      let n = Math.min(400, Math.floor(acc.current / DT));
      acc.current -= n * DT;
      while (n-- > 0) tick(m);
      paint(sec);
      if (sec - lastHud.current > 0.1 || m.eventId !== seen.current) {
        lastHud.current = sec;
        sync();
      }
    },
    visible && (!paused || ff),
  );

  /* ---------------------------------------------------------------- commands */

  const act = (fn: (m: Sim) => void) => {
    const m = sim.current;
    if (!m) return;
    fn(m);
    sync();
    paint();
  };

  const toggleMode = (mode?: Mode) =>
    act((m) => {
      const next = mode ?? (m.mode === 'auto' ? 'manual' : 'auto');
      confirm(m);
      setMode(m, next);
    });

  const step = () =>
    act((m) => {
      for (let i = 0; i < STEP_TICKS; i++) tick(m);
    });

  const nextFind = () =>
    act((m) => {
      if (m.phase === 'done') return;
      if (m.mode === 'manual') setMode(m, 'auto');
      confirm(m);
      ffBefore.current = m.marks.length;
      if (reduced)
        runUntil(m, (x) => x.marks.length > ffBefore.current || x.phase === 'done', 1800);
      else setFf(true);
    });

  const go = () =>
    act((m) => {
      confirm(m);
      if (paused) setPaused(false);
    });

  const newField = () => start((Math.random() * 0xffffffff) >>> 0);
  const restart = () => start(sim.current?.seed ?? SEED);

  const toggleLayer = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  const readChapter = () => {
    panel.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    panel.current?.querySelector<HTMLElement>('[role="tabpanel"]')?.focus({ preventScroll: true });
  };

  /* ---------------------------------------------------------------- keys */

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const el = root.current;
      const inside = !!el && el.contains(document.activeElement);
      const idle = document.activeElement === document.body || document.activeElement === null;
      if (!inside && !(idle && opts.current.visible)) return;
      const onButton =
        document.activeElement instanceof HTMLButtonElement ||
        document.activeElement instanceof HTMLAnchorElement;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(k) || (inside && k.startsWith('arrow') && !onButton)) {
        e.preventDefault();
        keys.current.add(k);
        return;
      }
      if (k === 'shift') {
        keys.current.add('shift');
        return;
      }
      if (k === ' ' && inside && !onButton) {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (k === 'enter' && !onButton) {
        e.preventDefault();
        go();
      } else if (k === 'm') toggleMode();
      else if (k === 'n') nextFind();
      else if (k === '.') step();
      else if (k === '[') setSpeed((v) => Math.max(0, v - 1));
      else if (k === ']') setSpeed((v) => Math.min(SPEEDS.length - 1, v + 1));
      else if (k === 'r') {
        if (e.shiftKey) restart();
        else newField();
      } else if (k === 'h') toggleLayer('heat');
      else if (k === 'p') toggleLayer('plan');
      else if (k === 't') toggleLayer('truth');
      else if (k === 'c') toggleLayer('cleared');
      else if (k === '?') setHelp((v) => !v);
      else if (k === 'escape') setHelp(false);
    }
  });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => onKey(e);
    const onUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
    };
  }, []);

  /* ---------------------------------------------------------------- the field under the pointer */

  const worldAt = (e: React.PointerEvent | React.MouseEvent) => {
    const v = view.current;
    if (!v) return null;
    const r = e.currentTarget.getBoundingClientRect();
    return toWorld(v, e.clientX - r.left, e.clientY - r.top);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') return;
    const p = worldAt(e),
      m = sim.current;
    cursor.current = p;
    if (m && p) setReadout(readoutAt(m, p));
    if (opts.current.paused) paint();
  };

  const onLeave = () => {
    cursor.current = null;
    setReadout(null);
    if (opts.current.paused) paint();
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = worldAt(e);
    if (!p) return;
    act((m) => {
      confirm(m);
      if (m.mode === 'auto') setMode(m, 'manual');
      scanAt(m, p);
    });
    if (paused) setPaused(false);
  };

  /* ---------------------------------------------------------------- render */

  const manual = hud.mode === 'manual';
  const holding = hud.holdMark;
  const chapterOf = (n: number) => CHAPTERS[n - 1];
  const current = CHAPTERS.find((c) => c.id === tab);
  const z = hud.z;
  const signal = z >= Z_VERIFY ? 'mine-strength' : z >= Z_STOP ? 'signal' : 'quiet';

  const how = (
    <div className={s.how}>
      <h4>How it works</h4>
      <ol>
        <li>The robot mows lanes with its detector boom swinging ahead of the wheels.</li>
        <li>
          Every reading updates a Bayesian map of where mines and scrap could be. Amber to red is
          the chance of a mine; green is ground the map calls clear.
        </li>
        <li>
          A strong signal stops it. It pinpoints from the standoff that should teach it most, and
          keeps its wheels on cleared ground.
        </li>
        <li>{`It marks a mine once the map is ${Math.round(MARK_P * 100)}% sure and the coil has passed right over it. Each mark opens a chapter.`}</li>
      </ol>
      <p className={s.dim}>
        Drive it yourself with W A S D or the stick, or click the field to send the coil somewhere.
        Press ? for every key.
      </p>
    </div>
  );

  return (
    <section ref={root} className={s.console} aria-label={`${C.name}: a demining robot simulator`}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <span className={s.badge} aria-hidden="true">
            {C.letter}
          </span>
          <div>
            <h1>
              {profile.name}
              <span>{`${profile.role}, ${profile.company}`}</span>
            </h1>
            <p>{`${C.name} · demining simulator`}</p>
          </div>
        </div>

        <div className={s.tools} role="toolbar" aria-label="Simulation">
          <div className={s.seg} role="group" aria-label="Mode">
            <button type="button" aria-pressed={!manual} onClick={() => toggleMode('auto')}>
              Auto
            </button>
            <button type="button" aria-pressed={manual} onClick={() => toggleMode('manual')}>
              Manual
            </button>
          </div>
          <div className={s.seg} role="group" aria-label="Transport">
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? 'Run' : 'Pause'}
              title={paused ? 'Run (Space)' : 'Pause (Space)'}
            >
              {paused ? (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 2.5v11l9-5.5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
                </svg>
              )}
            </button>
            <button type="button" onClick={step} disabled={!paused} title="Step 0.1 s (.)">
              Step
            </button>
            <button
              type="button"
              onClick={nextFind}
              disabled={hud.phase === 'done' || ff}
              title="Run to the next find (N)"
            >
              {ff ? 'Searching…' : 'Next find'}
            </button>
          </div>
          <div className={s.seg} role="group" aria-label="Simulation speed">
            {SPEEDS.map((v, i) => (
              <button
                key={v}
                type="button"
                aria-pressed={speed === i}
                onClick={() => setSpeed(i)}
                title={`${v}× real time`}
              >
                {v}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className={s.btn}
            onClick={newField}
            title="A new field from a new seed (R)"
          >
            New field
          </button>
        </div>

        <div className={s.end}>
          <button
            type="button"
            className={s.btn}
            aria-expanded={help}
            aria-controls="mf-keys"
            onClick={() => setHelp(!help)}
          >
            Keys
          </button>
          <a href="#report" className={s.read}>
            Read as a page
          </a>
        </div>
      </header>

      {help && (
        <div id="mf-keys" className={s.keys} role="dialog" aria-label="Keyboard shortcuts">
          <div className={s.keysHead}>
            <h2>Keys</h2>
            <button type="button" className={s.btn} onClick={() => setHelp(false)}>
              Close
            </button>
          </div>
          <dl>
            {KEYS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  {k.split(' ').map((x) => (
                    <kbd key={x}>{x}</kbd>
                  ))}
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className={s.main}>
        <div className={s.stage}>
          <div ref={wrap} className={s.field}>
            <canvas
              ref={canvas}
              tabIndex={0}
              role="application"
              aria-roledescription="minefield map"
              aria-label="The minefield from above, with the probability map. Drive with W A S D or the arrow keys, Space pauses, N runs to the next find, Enter confirms a mark. Click to send the coil to a spot."
              aria-describedby="mf-state"
              onPointerMove={onMove}
              onPointerLeave={onLeave}
              onClick={onClick}
            />
            {holding && (
              <div className={s.banner} role="status">
                <span className={s.bannerTag}>Mark {holding.n}</span>
                <span>
                  <span
                    className={s.bannerDetail}
                  >{`P ${holding.p.toFixed(3)} at ${at(holding)} m. `}</span>
                  {chapterOf(holding.n) ? <b>{`Opens ${chapterOf(holding.n).title}.`}</b> : null}
                </span>
                <span className={s.bannerActs}>
                  {chapterOf(holding.n) && (
                    <button type="button" className={s.btnGhost} onClick={readChapter}>
                      Read
                    </button>
                  )}
                  <button type="button" className={s.btnSolid} onClick={go}>
                    Continue <kbd>⏎</kbd>
                  </button>
                </span>
              </div>
            )}
            {!holding && hud.summary && (
              <div className={s.banner} role="status" data-done="">
                <span className={s.bannerTag}>Done</span>
                <span>{hud.summary.replace(/^Done in /, 'Surveyed in ')}</span>
                <span className={s.bannerActs}>
                  <button type="button" className={s.btnSolid} onClick={newField}>
                    New field
                  </button>
                </span>
              </div>
            )}
            {readout && (
              <div className={s.readout} aria-hidden="true">
                <b>{`${readout.x.toFixed(2)}, ${readout.y.toFixed(2)} m`}</b>
                <span>{`mine ${pct(readout.pm)}`}</span>
                <span>{`scrap ${pct(readout.ps)}`}</span>
                <span>{`log-odds ${readout.lo.toFixed(1)}`}</span>
                <span>{`peak ${readout.peak.toFixed(2)}`}</span>
                <i>{readout.state}</i>
              </div>
            )}
            {paused && !holding && (
              <p className={s.pausedTag}>
                {reduced ? 'Paused for reduced motion: press Run, Step or Next find' : 'Paused'}
              </p>
            )}
            {manual && (
              <div className={s.drive}>
                <Joystick
                  onChange={(x, y) => {
                    stick.current = { x, y };
                    if (x || y) takeControl();
                  }}
                />
                <p>
                  <span className={s.hintKeys}>
                    <kbd>W</kbd>
                    <kbd>A</kbd>
                    <kbd>S</kbd>
                    <kbd>D</kbd> or the stick to drive, <kbd>Shift</kbd> to creep. Click the field
                    to send the coil there.
                  </span>
                  <span className={s.hintTouch}>
                    Push the stick to drive, sideways to turn. Tap the field to send the coil there.
                  </span>
                </p>
              </div>
            )}

            <div className={s.layers} role="group" aria-label="Layers">
              {(
                [
                  ['heat', 'Heatmap'],
                  ['cleared', 'Cleared'],
                  ['plan', 'Plan'],
                  ['trail', 'Trail'],
                  ['truth', 'Truth'],
                ] as [keyof Layers, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={layers[k]}
                  onClick={() => toggleLayer(k)}
                  data-layer={k}
                >
                  <i aria-hidden="true" />
                  {label}
                </button>
              ))}
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={holdOnMark}
                  onChange={(e) => setHoldOnMark(e.target.checked)}
                />
                Stop at each mark
              </label>
              <span className={s.scale} aria-hidden="true">
                <i />
                <span>prior</span>
                <span>certain</span>
              </span>
            </div>
          </div>

          <section className={s.telemetry} aria-labelledby="mf-tel">
            <h2 id="mf-tel" className={s.cardHead}>
              Telemetry
              <span
                id="mf-state"
                className={s.state}
                data-phase={hud.hold !== null ? 'hold' : manual ? 'manual' : hud.phase}
              >
                {phaseLabel(hud)}
              </span>
            </h2>
            <dl className={s.tele}>
              <div>
                <dt>Pose</dt>
                <dd>
                  {hud.x.toFixed(2)}, {hud.y.toFixed(2)} m<small>{`heading ${deg(hud.th)}°`}</small>
                </dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>
                  {hud.v.toFixed(2)} m/s<small>{`turning ${hud.w.toFixed(2)} rad/s`}</small>
                </dd>
              </div>
              <div className={s.wheels}>
                <dt>Wheels</dt>
                <dd>
                  {(['L', 'R'] as const).map((side) => {
                    const v = side === 'L' ? hud.vl : hud.vr;
                    return (
                      <span key={side} className={s.meter}>
                        <b>{side}</b>
                        <span className={s.bar}>
                          <i style={{ '--v': v / V_MAX } as CSSProperties} />
                        </span>
                      </span>
                    );
                  })}
                </dd>
              </div>
              <div>
                <dt>Detector</dt>
                <dd>
                  <span className={s.z} data-signal={signal}>
                    {z.toFixed(2)}
                  </span>
                  <small>{`${signal} · boom ${deg(hud.phi)}°`}</small>
                </dd>
              </div>
              <div className={s.chart}>
                <dt className={s.sr}>Detector, last ten seconds</dt>
                <dd>
                  <canvas ref={traceCanvas} aria-hidden="true" />
                  <span className={s.chartKey} aria-hidden="true">
                    <i data-k="stop" /> stop <i data-k="mine" /> mine-strength
                  </span>
                </dd>
              </div>
              <div>
                <dt>Under the coil</dt>
                <dd>
                  {pct(hud.pNear)}
                  <small>chance of a mine</small>
                </dd>
              </div>
              <div>
                <dt>Coverage</dt>
                <dd>
                  {hud.coverage.toFixed(1)}%
                  <span className={s.cover}>
                    <i style={{ width: `${Math.min(100, hud.coverage)}%` }} />
                  </span>
                </dd>
              </div>
              <div>
                <dt>Marks</dt>
                <dd>
                  {hud.marks} of {hud.mines} laid
                  <small>
                    {hud.meanErr !== null ? `mean error ${hud.meanErr.toFixed(1)} cm` : 'none yet'}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Contacts</dt>
                <dd data-bad={hud.contacts > 0 || undefined}>
                  {hud.contacts}
                  <small>wheels over a mine</small>
                </dd>
              </div>
              <div>
                <dt>Driven</dt>
                <dd>{hud.odo.toFixed(1)} m</dd>
              </div>
              <div>
                <dt>Sim time</dt>
                <dd>{clock(hud.t)}</dd>
              </div>
              <div>
                <dt>Seed</dt>
                <dd>
                  {hud.seed.toString(16).toUpperCase()}
                  <button
                    type="button"
                    className={s.link}
                    onClick={restart}
                    title="Run this field again (Shift+R)"
                  >
                    rerun
                  </button>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className={s.side}>
          <section ref={panel} className={s.panel} aria-label="Chapters">
            <div className={s.tabs} role="tablist" aria-label="Chapters">
              <button
                type="button"
                role="tab"
                id="mf-tab-brief"
                aria-selected={tab === 'brief' && locked === null}
                aria-controls="mf-chapter"
                onClick={() => {
                  setTab('brief');
                  setLocked(null);
                }}
              >
                <span className={s.tabNo}>0</span>Brief
              </button>
              {CHAPTERS.map((c, i) => {
                const open = i < opened;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    id={`mf-tab-${c.id}`}
                    aria-selected={open ? tab === c.id && locked === null : locked === i}
                    aria-controls="mf-chapter"
                    aria-disabled={!open || undefined}
                    data-open={open || undefined}
                    title={open ? c.blurb : `Opens at mark ${i + 1}`}
                    onClick={() => {
                      if (open) {
                        setTab(c.id);
                        setLocked(null);
                      } else setLocked(i);
                    }}
                  >
                    <span className={s.tabNo}>{i + 1}</span>
                    {c.title}
                    {!open && (
                      <svg viewBox="0 0 12 12" className={s.lock} aria-label="locked">
                        <path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5M2.5 5h7v5.5h-7z" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
            <div
              id="mf-chapter"
              role="tabpanel"
              tabIndex={-1}
              aria-labelledby={
                locked !== null
                  ? `mf-tab-${CHAPTERS[locked].id}`
                  : tab === 'brief'
                    ? 'mf-tab-brief'
                    : `mf-tab-${tab}`
              }
              className={s.chapterBody}
              key={locked !== null ? `locked-${locked}` : tab}
            >
              {locked !== null ? (
                <div className={s.lockedNote}>
                  <h3>{CHAPTERS[locked].title}</h3>
                  <p>{`Buried. The robot opens this chapter when it marks mine ${locked + 1}.`}</p>
                  <p>
                    <button
                      type="button"
                      className={s.btnSolid}
                      onClick={nextFind}
                      disabled={hud.phase === 'done' || ff}
                    >
                      Run to the next find
                    </button>{' '}
                    or <a href="#report">read everything as a page</a>.
                  </p>
                </div>
              ) : tab === 'brief' || !current ? (
                <>
                  <h3>{profile.name}</h3>
                  <Brief how={how} />
                </>
              ) : (
                <>
                  <p
                    className={s.kicker}
                  >{`Mark ${CHAPTERS.indexOf(current) + 1} · ${current.blurb}`}</p>
                  <h3>{current.title}</h3>
                  <current.Body />
                </>
              )}
            </div>
          </section>

          <section className={s.logCard} aria-labelledby="mf-log">
            <h2 id="mf-log" className={s.cardHead}>
              Log
              <span className={s.dim}>{`likelihoods tempered ×${TEMPER}`}</span>
            </h2>
            <ol ref={logBox} className={s.log}>
              {log.map((e) => (
                <li key={e.id} data-kind={e.kind}>
                  <time>{clock(e.t)}</time>
                  <span>
                    {e.text}
                    {e.chapter && <b>{` Opens ${e.chapter}.`}</b>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </section>
  );
}
