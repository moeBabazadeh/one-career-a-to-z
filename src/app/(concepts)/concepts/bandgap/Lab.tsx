'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { useAnimationFrame, useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import {
  HC,
  I0,
  I1,
  N_CONTACT,
  P_CONTACT,
  X_MAX,
  X_MIN,
  deltas,
  frameFor,
  hue,
  iModel,
  itemById,
  items,
  kneeVoltage,
  waveColor,
  wells,
} from './device';
import {
  drawDevice,
  drawIV,
  drawSpectrum,
  hitTest,
  makeLayout,
  readPalette,
  tAt,
  targetRange,
  type Layout,
  type Palette,
} from './draw';
import Notes from './Notes';
import { select, useSelection } from './selection';
import { DEFAULTS, Sim, type Params, type Snapshot } from './sim';
import s from './bandgap.module.scss';

const SEED = 8191;
const V_RANGE = [-1.5, 3.6] as const;
const T_RANGE = [10, 600] as const;
const HW_RANGE = [1.8, 3.9] as const;
/** How far the turn-on voltage moves per kelvin, in millivolts. */
const DRIFT = ((kneeVoltage(350) - kneeVoltage(250)) / 100) * 1000;

interface Experiment {
  id: string;
  label: string;
  params: Partial<Params>;
  note: string;
}

const EXPERIMENTS: Experiment[] = [
  {
    id: 'led',
    label: 'Light it up',
    params: { V: 2.95, T: 300, lamp: false },
    note: 'Forward bias flattens the bands. The contacts inject electrons and holes, they meet in the wells and recombine, and each well glows at its own wavelength: the longer the role, the deeper the well and the redder its light.',
  },
  {
    id: 'detector',
    label: 'Photodetector',
    params: { V: -1, T: 300, hw: 3.6, lamp: true },
    note: 'Reverse bias steepens the bands. Each ultraviolet photon makes an electron–hole pair, the field sweeps the electron to the n⁺ side and the hole to the p⁺ side, and the current goes negative.',
  },
  {
    id: 'colour',
    label: 'Pick a colour',
    params: { V: 2.6, T: 300, hw: 2.3, lamp: true },
    note: 'Green light, below the barrier’s gap: only the deepest wells, the longest roles, can absorb it. The shorter ones let it straight through. Slide the photon energy to see which roles each colour reaches.',
  },
  {
    id: 'cold',
    label: 'Freeze-out',
    params: { V: 0, T: 30, lamp: false },
    note: 'Cold: the impurity levels (the studies and awards) hold on to their carriers, nothing is thermally excited and the Fermi–Dirac step is sharp.',
  },
  {
    id: 'hot',
    label: 'Run hot',
    params: { V: 2.4, T: 600, lamp: false },
    note: `Hot: the impurities ionize, carriers hop out of the localized states, the gap narrows and the turn-on voltage falls by about ${Math.abs(DRIFT).toFixed(1)} mV per kelvin, so the diode conducts at a bias that was off at room temperature.`,
  },
  {
    id: 'eq',
    label: 'Equilibrium',
    params: { V: 0, T: 300, lamp: false },
    note: 'No bias and no light: one Fermi level across the whole device and no current. The built-in field tilts the bands by the full gap.',
  },
];

const pct = (t: number) => `${((t - X_MIN) / (X_MAX - X_MIN)) * 100}%`;

const STRIP = [
  { id: P_CONTACT, label: 'p⁺', name: 'p⁺ contact: about', a: X_MIN, b: I0 },
  ...wells.map((w) => ({ id: w.id, label: w.short, name: `${w.org} well`, a: w.x0, b: w.x1 })),
  { id: N_CONTACT, label: 'n⁺', name: 'n⁺ contact: in production', a: I1, b: X_MAX },
];

function biasWord(V: number, T: number) {
  if (V < -0.02) return 'reverse';
  if (V <= 0.02) return 'zero bias';
  return V >= kneeVoltage(T) ? 'forward, conducting' : 'forward, below turn-on';
}

interface Sizes {
  dpr: number;
  iv: [number, number];
  spec: [number, number];
}

export default function Lab() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [wrap, visible] = useInView<HTMLElement>(false, 0.05);
  const selected = useSelection();
  const hintId = useId();
  const [params, setParams] = useState<Params>(DEFAULTS);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [experiment, setExperiment] = useState<string | null>('led');
  const band = useRef<HTMLCanvasElement>(null);
  const ivRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim | null>(null);
  const pal = useRef<Palette | null>(null);
  const layout = useRef<Layout | null>(null);
  const sizes = useRef<Sizes>({ dpr: 1, iv: [0, 0], spec: [0, 0] });
  const trail = useRef<number[]>([]);
  const clock = useRef({ last: 0, snap: 0, charts: 0, trail: 0, time: 0 });
  const view = useRef<{ selected: string | null; hover: string | null }>({
    selected: null,
    hover: null,
  });
  const running = visible && !reduced && !paused;
  const ready = snap !== null;

  const paintBand = () => {
    const c = band.current;
    const run = sim.current;
    const p = pal.current;
    const L = layout.current;
    const ctx = c?.getContext('2d');
    if (!ctx || !run || !p || !L) return;
    drawDevice(ctx, L, run, p, { ...view.current, time: clock.current.time });
  };

  const paintCharts = () => {
    const run = sim.current;
    const p = pal.current;
    if (!run || !p) return;
    const iv = ivRef.current?.getContext('2d');
    const sp = specRef.current?.getContext('2d');
    if (iv) drawIV(iv, sizes.current.iv[0], sizes.current.iv[1], p, run.params, run, trail.current);
    if (sp) drawSpectrum(sp, sizes.current.spec[0], sizes.current.spec[1], p, run);
  };

  const settleRange = () => {
    const run = sim.current;
    const L = layout.current;
    if (!run || !L) return;
    const target = targetRange(run.frame);
    L.eTop = target.top;
    L.eBot = target.bot;
  };

  // Start a run on the client: a few seconds in, so the wells are already lit.
  useEffect(() => {
    const run = new Sim(SEED, DEFAULTS);
    run.advance(8);
    sim.current = run;
    const id = requestAnimationFrame(() => setSnap(run.snapshot()));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (sim.current) sim.current.visual = !reduced;
  }, [reduced, snap]);

  useEffect(() => {
    view.current = { selected, hover };
  }, [selected, hover]);

  // Canvas sizes follow their elements; the layout reads the plot margins from CSS.
  useEffect(() => {
    const c = band.current;
    const iv = ivRef.current;
    const sp = specRef.current;
    if (!c || !iv || !sp) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizes.current.dpr = dpr;
      for (const el of [c, iv, sp]) {
        const W = el.clientWidth;
        const H = el.clientHeight;
        el.width = Math.round(W * dpr);
        el.height = Math.round(H * dpr);
        el.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      sizes.current.iv = [iv.clientWidth, iv.clientHeight];
      sizes.current.spec = [sp.clientWidth, sp.clientHeight];
      const left = parseFloat(token(c, '--plot-l')) || 52;
      const right = parseFloat(token(c, '--plot-r')) || 110;
      const prev = layout.current;
      layout.current = makeLayout(
        c.clientWidth,
        c.clientHeight,
        left,
        right,
        prev?.eTop ?? 1,
        prev?.eBot ?? -4,
      );
      if (!prev) settleRange();
      paintBand();
      paintCharts();
    };
    fit();
    const observer = new ResizeObserver(fit);
    [c, iv, sp].forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // The canvases paint with the scheme's tokens.
  useEffect(() => {
    if (!wrap.current) return;
    pal.current = readPalette(wrap.current);
    if (!layout.current && sim.current) settleRange();
    paintBand();
    paintCharts();
  }, [scheme, wrap, ready]);

  useEffect(() => {
    clock.current.last = 0;
  }, [running]);

  // While nothing animates, repaint whenever something changes.
  useEffect(() => {
    if (running) return;
    settleRange();
    paintBand();
    paintCharts();
  }, [running, params, snap, selected, hover, scheme]);

  useAnimationFrame((sec) => {
    const run = sim.current;
    const L = layout.current;
    if (!run) return;
    const c = clock.current;
    const dt = c.last ? Math.min(0.05, sec - c.last) : 0;
    c.last = sec;
    c.time = sec;
    if (dt > 0) {
      const steps = dt > 1 / 45 ? 2 : 1;
      for (let k = 0; k < steps; k++) run.step(dt / steps);
    }
    if (L) {
      const target = targetRange(run.frame);
      const k = 1 - Math.exp(-dt * 5);
      L.eTop += (target.top - L.eTop) * k;
      L.eBot += (target.bot - L.eBot) * k;
    }
    paintBand();
    if (sec - c.trail > 0.25) {
      c.trail = sec;
      trail.current.push(run.params.V, run.current);
      if (trail.current.length > 64) trail.current.splice(0, 2);
    }
    if (sec - c.charts > 0.1) {
      c.charts = sec;
      paintCharts();
    }
    if (sec - c.snap > 0.25) {
      c.snap = sec;
      setSnap(run.snapshot());
    }
  }, running);

  /* ---------------------------------------------------------------- actions */

  // With nothing animating (reduced motion, paused, off screen), an action jumps to where the carriers settle.
  const settle = (run: Sim, seconds: number) => {
    if (running) return;
    if (reduced && seconds) run.advance(seconds);
    setSnap(run.snapshot());
  };

  const apply = (patch: Partial<Params>, exp: string | null = null) => {
    const run = sim.current;
    const next = { ...params, ...patch };
    setParams(next);
    setExperiment(exp);
    if (!run) return;
    run.configure(next);
    settle(run, 8);
  };

  const fireAt = (t: number) => {
    const run = sim.current;
    if (!run) return;
    const at =
      t < I0 || t > I1 ? I0 + (I1 - I0) * (0.15 + 0.7 * ((run.totals.fired * 0.618) % 1)) : t;
    run.fire(at);
    settle(run, 1.5);
  };

  const reset = () => {
    const run = new Sim(SEED, params);
    run.visual = !reduced;
    run.advance(3);
    sim.current = run;
    trail.current = [];
    setSnap(run.snapshot());
  };

  const pointer = (e: PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const L = layout.current;
    const run = sim.current;
    if (!L || !run) return;
    const [x, y] = pointer(e);
    const hit = hitTest(L, run.frame, x, y);
    if (hit !== hover) setHover(hit);
  };

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const L = layout.current;
    const run = sim.current;
    if (!L || !run) return;
    const [x, y] = pointer(e);
    const hit = hitTest(L, run.frame, x, y);
    if (!hit) return;
    select(hit);
    const t = tAt(L, x);
    if (t >= I0 && t <= I1) fireAt(t);
  };

  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const at = selected ? items.findIndex((it) => it.id === selected) : -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      select(
        items[
          at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length
        ].id,
      );
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      select(items[e.key === 'Home' ? 0 : items.length - 1].id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fireAt(at >= 0 ? items[at].x : -1);
    } else if (e.key === 'Escape') {
      select(null);
    }
  };

  /* ---------------------------------------------------------------- readouts */

  const frame = frameFor(params.V, params.T);
  const lambda = HC / params.hw;
  const absorbers = wells.filter((_, i) => frame.wells[i].trans <= params.hw);
  const allAbsorb = params.hw >= frame.eg;
  const model = iModel(params.V, params.T, snap?.absorbRate ?? 0);
  const active = EXPERIMENTS.find((x) => x.id === experiment);
  const label = selected ? itemById.get(selected)?.label : null;
  const description = `Energy-band diagram at ${params.V.toFixed(2)} volts and ${params.T} kelvin${snap ? `, with ${snap.electrons} electrons and ${snap.holes} holes` : ''}${label ? `. Selected: ${label}` : ''}.`;

  return (
    <section id="device" ref={wrap} className={s.lab} aria-labelledby="device-title">
      <header className={s.labHead}>
        <div className={s.labTitle}>
          <p className={s.fig}>Fig. 1</p>
          <h2 id="device-title">The career as an energy-band diagram</h2>
        </div>
        <ul className={s.legend} aria-label="Legend">
          <li>
            <i className={s.lgCb} aria-hidden="true" />
            <em>E</em>
            <sub>c</sub>
          </li>
          <li>
            <i className={s.lgVb} aria-hidden="true" />
            <em>E</em>
            <sub>v</sub>
          </li>
          <li>
            <i className={s.lgEf} aria-hidden="true" />
            <em>E</em>
            <sub>F</sub>
          </li>
          <li>
            <i className={s.lgE} aria-hidden="true" />
            electron
          </li>
          <li>
            <i className={s.lgH} aria-hidden="true" />
            hole
          </li>
          <li>
            <span className={s.lgDonor} aria-hidden="true">
              ⊕
            </span>
            study
          </li>
          <li>
            <span className={s.lgAcceptor} aria-hidden="true">
              ⊖
            </span>
            award
          </li>
          <li>
            <span aria-hidden="true">●</span> product <span aria-hidden="true">◆</span> fix{' '}
            <span aria-hidden="true">△</span> personal
          </li>
          <li>
            <span aria-hidden="true">■</span> in production
          </li>
        </ul>
      </header>

      <div className={s.labGrid}>
        <div className={s.stageTop}>
          <div className={s.readouts} aria-live="off">
            <span>
              <em>V</em> {params.V.toFixed(2)} V <small>{biasWord(params.V, params.T)}</small>
            </span>
            <span>
              <em>T</em> {params.T} K <small>{`Eg ${frame.eg.toFixed(3)} eV`}</small>
            </span>
            <span>
              <em>I</em> {snap ? snap.current.toFixed(2) : '—'}{' '}
              <small>{`a.u. measured · model ${model.toFixed(2)}`}</small>
            </span>
            <span>
              {snap ? `${snap.electrons} e⁻ · ${snap.holes} h⁺` : '—'}{' '}
              <small>
                {snap
                  ? `${snap.absorbed} absorbed · ${snap.passed} passed · ${snap.emitted} emitted`
                  : ''}
              </small>
            </span>
          </div>

          <div className={s.canvasWrap}>
            <canvas
              ref={band}
              className={s.band}
              tabIndex={0}
              role="img"
              aria-label={description}
              aria-describedby={hintId}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onClick={onClick}
              onKeyDown={onKey}
              data-hover={hover ? 'true' : undefined}
            />
          </div>

          <div className={s.strip} role="group" aria-label="Layers of the device">
            {STRIP.map((it) => (
              <button
                key={it.id}
                type="button"
                className={s.layer}
                style={{ '--a': pct(it.a), '--b': pct(it.b) } as CSSProperties}
                aria-pressed={selected === it.id}
                aria-label={it.name}
                title={it.name}
                onClick={() => select(it.id)}
              >
                <span>{it.label}</span>
              </button>
            ))}
            {deltas.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`${s.layer} ${s.delta}`}
                style={{ '--a': pct(d.x - 0.12), '--b': pct(d.x + 0.12) } as CSSProperties}
                aria-pressed={selected === d.id}
                aria-label={`${d.role.org}: δ-doped sheet`}
                title={`${d.role.org} (contract)`}
                onClick={() => select(d.id)}
              >
                <span>δ</span>
              </button>
            ))}
          </div>
          <p id={hintId} className={s.hint}>
            Click the diagram to fire a photon there and open what it hits. On the keyboard: focus
            the diagram, then ← → to step through it, Enter to fire.
            {reduced && ' Reduced motion is on: carriers are drawn where they settle.'}
          </p>
        </div>

        <aside id="device-notes" className={s.notes} aria-label="Device notes" tabIndex={-1}>
          <Notes id={selected} snap={snap} params={params} onSelect={select} />
        </aside>

        <div className={s.stageBottom}>
          <div className={s.controls}>
            <fieldset className={s.control}>
              <legend>Bias</legend>
              <label className={s.slider}>
                <span className={s.sr}>Bias voltage</span>
                <input
                  type="range"
                  min={V_RANGE[0]}
                  max={V_RANGE[1]}
                  step={0.01}
                  value={params.V}
                  aria-valuetext={`${params.V.toFixed(2)} volts, ${biasWord(params.V, params.T)}`}
                  onChange={(e) => apply({ V: Number(e.target.value) })}
                />
              </label>
              <p className={s.value}>
                <b>{params.V.toFixed(2)} V</b> {biasWord(params.V, params.T)}
              </p>
              <div className={s.presets}>
                {[-1, 0, 2.6, 2.95, 3.1].map((V) => (
                  <button
                    key={V}
                    type="button"
                    aria-pressed={Math.abs(params.V - V) < 0.005}
                    onClick={() => apply({ V })}
                  >
                    {V > 0 ? `+${V}` : V}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className={s.control}>
              <legend>Temperature</legend>
              <label className={s.slider}>
                <span className={s.sr}>Temperature</span>
                <input
                  type="range"
                  min={T_RANGE[0]}
                  max={T_RANGE[1]}
                  step={1}
                  value={params.T}
                  aria-valuetext={`${params.T} kelvin`}
                  onChange={(e) => apply({ T: Number(e.target.value) })}
                />
              </label>
              <p className={s.value}>
                <b>{params.T} K</b>{' '}
                {`kT ${(frame.kT * 1000).toFixed(1)} meV · turn-on ${kneeVoltage(params.T).toFixed(2)} V`}
              </p>
              <div className={s.presets}>
                {[30, 77, 300, 600].map((T) => (
                  <button
                    key={T}
                    type="button"
                    aria-pressed={params.T === T}
                    onClick={() => apply({ T })}
                  >
                    {T} K
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className={s.control}>
              <legend>Light</legend>
              <label className={s.slider}>
                <span className={s.sr}>Photon energy</span>
                <input
                  type="range"
                  min={HW_RANGE[0]}
                  max={HW_RANGE[1]}
                  step={0.01}
                  value={params.hw}
                  aria-valuetext={`${params.hw.toFixed(2)} electronvolts, ${Math.round(lambda)} nanometres, ${hue(lambda)}`}
                  onChange={(e) => apply({ hw: Number(e.target.value) })}
                />
              </label>
              <p className={s.value}>
                <i
                  className={s.swatch}
                  style={{ background: waveColor(lambda) }}
                  aria-hidden="true"
                />
                <b>{params.hw.toFixed(2)} eV</b> {`${Math.round(lambda)} nm, ${hue(lambda)}`}
              </p>
              <p className={s.absorb}>
                {allAbsorb
                  ? 'Above the barrier gap: absorbed everywhere.'
                  : absorbers.length
                    ? `Absorbed only in ${absorbers.map((w) => w.short).join(', ')}; the rest let it through.`
                    : 'Below every gap: the device is transparent to it.'}
              </p>
              <div className={s.presets}>
                <button
                  type="button"
                  className={s.fire}
                  onClick={() => fireAt(selected ? (itemById.get(selected)?.x ?? -1) : -1)}
                >
                  Fire a photon
                </button>
                <button
                  type="button"
                  aria-pressed={params.lamp}
                  onClick={() => apply({ lamp: !params.lamp })}
                >
                  {params.lamp ? 'Lamp on' : 'Lamp off'}
                </button>
              </div>
            </fieldset>

            <fieldset className={`${s.control} ${s.experiments}`}>
              <legend>Experiments</legend>
              <div className={s.presets}>
                {EXPERIMENTS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={experiment === x.id}
                    onClick={() => apply(x.params, x.id)}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
              <p className={s.expNote} aria-live="polite">
                {active
                  ? active.note
                  : 'Your own settings. Pick an experiment to see one effect at a time.'}
              </p>
              <div className={s.presets}>
                <button
                  type="button"
                  aria-pressed={paused}
                  disabled={reduced}
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? 'Resume' : 'Pause'}
                </button>
                <button type="button" onClick={reset}>
                  Reset carriers
                </button>
              </div>
            </fieldset>
          </div>

          <div className={s.charts}>
            <figure className={s.chart}>
              <figcaption>
                <span className={s.fig}>Fig. 2</span> Current against voltage
                <small>
                  line: diode model · dot: what the carriers measured, which lags after a bias step
                  while stored carriers sweep out
                </small>
              </figcaption>
              <canvas
                ref={ivRef}
                className={s.iv}
                role="img"
                aria-label={`I–V curve: at ${params.V.toFixed(2)} V the model gives ${model.toFixed(2)} and the simulation measures ${snap ? snap.current.toFixed(2) : 'nothing yet'}, in arbitrary units.`}
              />
            </figure>
            <figure className={s.chart}>
              <figcaption>
                <span className={s.fig}>Fig. 3</span> Light emitted
                <small>
                  dashed: each well’s transition · bars: what its carriers emitted, a little redder
                  from the localized states
                </small>
              </figcaption>
              <canvas
                ref={specRef}
                className={s.specCanvas}
                role="img"
                aria-label={`Emission spectrum. Wells emit at ${wells.map((w, i) => `${w.short} ${Math.round(frame.wells[i].lambda)} nm`).join(', ')}.`}
              />
            </figure>
          </div>
        </div>
      </div>

      <p className={s.caption}>
        <b>Fig. 1–3.</b> An illustration, not a measurement and not research results: a
        multi-quantum-well p–i–n diode loosely modelled on InGaN/GaN, grown so that position is
        time. Each well’s width is its role’s duration and its depth grows with it; levels come from
        the finite square well, the gap follows Varshni, current follows the diode law, and the
        rates are chosen to be visible rather than fitted. The facts in the notes are real.
      </p>
    </section>
  );
}
