'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  useAnimationFrame,
  useInView,
  useReducedMotion,
  useScaledCanvas,
  useScheme,
} from '../_shared/hooks';
import {
  HEAT,
  PANEL,
  cellAt,
  drawBurn,
  drawErrors,
  drawHeatmap,
  drawLatency,
  drawThroughput,
  indexAt,
  type Size,
} from './charts';
import {
  APP_MAX,
  DEFAULTS,
  HPA_MIN,
  HPA_TARGET,
  LATENCY_MS,
  RR_MAX,
  SEED,
  SLO,
  SPIKE,
  Sim,
  WINDOW,
  fmt,
  fmtMs,
  pct,
  type Config,
  type Sample,
  type Snapshot,
} from './sim';
import { setHealth } from './store';
import { Flow, SIZE, drawTopology, hitTest, layout, readPalette } from './topology';
import s from './loadtest.module.scss';

const NARROW = '(max-width: 720px)';
const subscribeNarrow = (onChange: () => void) => {
  const query = matchMedia(NARROW);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

const PREWARM = 60_000; // a minute of steady traffic, so the charts start full
const STEP = 10_000; // with reduced motion the run advances 10 s per action

// The rate slider is logarithmic: 50 to 10,000 rps in 100 steps.
const MIN_RPS = 50,
  MAX_RPS = 10_000;
const toRps = (v: number) => Math.round((MIN_RPS * (MAX_RPS / MIN_RPS) ** (v / 100)) / 10) * 10;
const toPos = (rps: number) =>
  Math.round((Math.log(rps / MIN_RPS) / Math.log(MAX_RPS / MIN_RPS)) * 100);

const clock = (ms: number) => {
  const sec = ms / 1000;
  return `T+${String(Math.floor(sec / 60)).padStart(2, '0')}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
};

type Tone = 'ok' | 'warn' | 'err' | 'info';
const TONE_WORD: Record<Tone, string> = {
  ok: 'healthy',
  warn: 'degraded',
  err: 'failing',
  info: '',
};
const band = (v: number, warn: number, err: number): Tone =>
  v >= err ? 'err' : v >= warn ? 'warn' : 'ok';

type CanvasRef = React.RefObject<HTMLCanvasElement | null>;
type Draw = (
  ctx: CanvasRenderingContext2D,
  data: Sample[],
  hover: number | null,
  size: Size,
) => void;

function Switch({
  on,
  label,
  note,
  onChange,
}: {
  on: boolean;
  label: string;
  note: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={s.switch}
      onClick={() => onChange(!on)}
    >
      <span className={s.track} aria-hidden="true" />
      <span className={s.ctlText}>
        <b>{label}</b>
        <small>{note}</small>
      </span>
    </button>
  );
}

function Stepper({
  label,
  note,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  note: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={s.stepper} role="group" aria-label={label}>
      <span className={s.ctlText}>
        <b>{label}</b>
        <small>{note}</small>
      </span>
      <span className={s.keys}>
        <button
          type="button"
          aria-label={`Remove one: ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button
          type="button"
          aria-label={`Add one: ${label}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </span>
    </div>
  );
}

function Panel({
  id,
  title,
  note,
  canvas,
  W,
  H,
  label,
  onHover,
  children,
}: {
  id: string;
  title: string;
  note: string;
  canvas: CanvasRef;
  W: number;
  H: number;
  label: string;
  onHover: (x: number | null) => void;
  children?: React.ReactNode;
}) {
  return (
    <figure className={s.panel} aria-labelledby={`${id}-t`}>
      <figcaption>
        <h3 id={`${id}-t`}>{title}</h3>
        <span>{note}</span>
      </figcaption>
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onHover(((e.clientX - r.left) / r.width) * W);
        }}
        onPointerLeave={() => onHover(null)}
      />
      {children}
    </figure>
  );
}

export default function Console() {
  const reduced = useReducedMotion();
  const tall = useNarrow();
  const scheme = useScheme();
  const [wrap, visible] = useInView<HTMLElement>(false, 0.05);
  const sim = useRef<Sim | null>(null);
  const flow = useRef<Flow | null>(null);
  const last = useRef(0);
  const seen = useRef(-1);
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const running = visible && !reduced && !paused;

  const { W, H } = tall ? SIZE.tall : SIZE.wide;
  const panel = tall ? PANEL.tall : PANEL.wide;
  const grid = tall ? HEAT.tall : HEAT.wide;
  const L = useMemo(() => layout(tall), [tall]);
  const series = () => sim.current?.samples.slice(-WINDOW) ?? [];

  const topo = useScaledCanvas(W, H, (ctx) => {
    if (sim.current) drawTopology(ctx, sim.current, flow.current, { tall, hover: target, reduced });
  });
  const tput = useScaledCanvas(panel.W, panel.H, (ctx) =>
    drawThroughput(ctx, series(), hover, panel),
  );
  const lat = useScaledCanvas(panel.W, panel.H, (ctx) => drawLatency(ctx, series(), hover, panel));
  const errs = useScaledCanvas(panel.W, panel.H, (ctx) => drawErrors(ctx, series(), hover, panel));
  const burn = useScaledCanvas(panel.W, panel.H, (ctx) => drawBurn(ctx, series(), hover, panel));
  const heat = useScaledCanvas(grid.W, grid.H, (ctx) => drawHeatmap(ctx, series(), hover, grid));

  // Boot a run on the client only: a minute of steady traffic before anyone looks.
  useEffect(() => {
    const run = new Sim(SEED, DEFAULTS);
    run.advance(PREWARM);
    run.drainTraces();
    sim.current = run;
    flow.current = new Flow();
    const id = requestAnimationFrame(() => setSnap(run.snapshot()));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    last.current = 0;
  }, [running]);

  useEffect(() => {
    flow.current?.clear();
  }, [tall]);

  useAnimationFrame((sec) => {
    const run = sim.current;
    if (!run || !flow.current) return;
    const dt = last.current ? Math.min(0.1, sec - last.current) : 0;
    last.current = sec;
    run.advance(dt * 1000);
    flow.current.add(run.drainTraces(), L, tall);
    flow.current.step(dt);
    const ctx = topo.current?.getContext('2d');
    if (ctx) drawTopology(ctx, run, flow.current, { tall, hover: target, reduced });
    if (run.version !== seen.current) {
      seen.current = run.version;
      setSnap(run.snapshot());
    }
  }, running);

  // The canvases paint with the scheme's tokens: read them once per change, then repaint below.
  useEffect(() => {
    if (wrap.current) readPalette(wrap.current);
  }, [scheme, wrap]);

  // Repaint the panels on every new sample, and the topology whenever it isn't animating.
  useEffect(() => {
    const run = sim.current;
    if (!run || !snap) return;
    const data = run.samples.slice(-WINDOW);
    const panels: [CanvasRef, Draw, Size][] = [
      [tput, drawThroughput, panel],
      [lat, drawLatency, panel],
      [errs, drawErrors, panel],
      [burn, drawBurn, panel],
      [heat, drawHeatmap, grid],
    ];
    for (const [ref, draw, size] of panels) {
      const ctx = ref.current?.getContext('2d');
      if (ctx) draw(ctx, data, hover, size);
    }
    if (!running) {
      const ctx = topo.current?.getContext('2d');
      if (ctx) drawTopology(ctx, run, flow.current, { tall, hover: target, reduced });
    }
    setHealth(snap.status, snap.firing.length);
  }, [
    snap,
    hover,
    target,
    running,
    tall,
    reduced,
    panel,
    grid,
    tput,
    lat,
    errs,
    burn,
    heat,
    topo,
    scheme,
  ]);

  /* ---------------------------------------------------------------- actions */

  const commit = (run: Sim, advance: boolean) => {
    if (advance && reduced) {
      run.advance(STEP);
      run.drainTraces();
    }
    setSnap(run.snapshot());
  };

  const apply = (patch: Partial<Config>) => {
    const run = sim.current;
    if (!run) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    run.configure(next);
    commit(run, !('rps' in patch));
  };

  const act = (fn: (run: Sim) => void) => {
    const run = sim.current;
    if (!run) return;
    fn(run);
    commit(run, true);
  };

  const reset = () => {
    const run = new Sim(SEED, DEFAULTS);
    run.advance(PREWARM);
    run.drainTraces();
    sim.current = run;
    flow.current?.clear();
    setCfg(DEFAULTS);
    setPaused(false);
    setSnap(run.snapshot());
  };

  const pointer = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return sim.current
      ? hitTest(
          L,
          sim.current,
          ((e.clientX - r.left) / r.width) * W,
          ((e.clientY - r.top) / r.height) * H,
        )
      : null;
  };

  // One crosshair shared by every panel, as in Grafana.
  const track =
    (toIndex: (x: number, W: number) => number | null, W0: number) => (x: number | null) => {
      const i = x == null ? null : toIndex(x, W0);
      if (i !== hover) setHover(i);
    };

  /* ---------------------------------------------------------------- render */

  const n = snap;
  const dash = '—';
  const tiles: [string, string, string, Tone | null][] = [
    ['Throughput', n ? fmt(n.rps) : dash, 'req/s at the edge', n ? 'info' : null],
    ['p99 latency', n ? fmtMs(n.p99) : dash, 'API, last second', n ? band(n.p99, 300, 500) : null],
    [
      'Error rate',
      n ? pct(n.errors, n.errors < 0.1 ? 2 : 1) : dash,
      '5xx of API requests',
      n ? band(n.errors, 0.005, 0.05) : null,
    ],
    [
      'Apdex',
      n ? n.apdex.toFixed(2) : dash,
      'T = 100 ms',
      n ? band(1 - n.apdex, 0.06, 0.15) : null,
    ],
    [
      'Error budget',
      n ? (n.budget <= 0 ? 'spent' : pct(n.budget)) : dash,
      `SLO ${pct(SLO, 1)} · 5 min`,
      n ? band(1 - n.budget, 0.5, 1) : null,
    ],
    [
      'App replicas',
      n ? `${n.ready}/${n.live}` : dash,
      cfg.autoscale ? 'ready / desired · HPA' : 'ready / desired',
      n ? (n.ready === n.live ? 'ok' : n.ready ? 'warn' : 'err') : null,
    ],
  ];
  const spikeLeft = n?.spikeLeft ?? 0;
  const latencyLeft = n?.latencyLeft ?? 0;

  return (
    <section ref={wrap} id="console" className={s.console} aria-labelledby="console-title">
      <header className={s.consoleHead}>
        <div className={s.consoleTitle}>
          <span className={s.runDot} data-running={running} aria-hidden="true" />
          <h2 id="console-title">launch-day.js</h2>
          <span className={s.meta}>a load test, simulated in your browser · seed {SEED}</span>
        </div>
        <div className={s.consoleActions}>
          {n && n.firing.length > 0 && (
            <ul className={s.firing} aria-label="Alerts firing">
              {n.firing.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
          <span className={s.clock}>{n ? clock(n.t) : 'T+00:00.0'}</span>
          {reduced ? (
            <button type="button" className={s.ghost} onClick={() => act(() => {})}>
              Advance 10 s
            </button>
          ) : (
            <button
              type="button"
              className={s.ghost}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button type="button" className={s.ghost} onClick={reset}>
            Reset
          </button>
        </div>
      </header>

      <p className={s.sr} aria-live="polite">
        {n ? `System ${n.status}.` : ''}
      </p>

      <dl className={s.tiles}>
        {tiles.map(([label, value, note, tone]) => (
          <div key={label} data-tone={tone ?? undefined}>
            <dt>
              {tone && <span className={s.toneDot} aria-hidden="true" />}
              {label}
            </dt>
            <dd>
              {value}
              {tone && tone !== 'info' && <span className={s.sr}> ({TONE_WORD[tone]})</span>}
            </dd>
            <dd className={s.tileNote}>{note}</dd>
          </div>
        ))}
      </dl>

      <div className={s.stage}>
        <figure className={s.topology}>
          <canvas
            ref={topo}
            role="img"
            aria-label={
              n
                ? `Topology: ${fmt(n.rps)} requests per second reach the CDN; ${fmt(n.origin)} go on through the load balancer to ${n.ready} of ${n.live} app replicas, a cache at ${pct(n.hit)} hit rate, a database proxy, the primary database and ${n.replicas} read replicas. Writes queue background jobs. Circuit breaker ${cfg.breaker ? n.breaker : 'off'}. Click a node to kill it.`
                : 'Topology of a web stack under load.'
            }
            style={{ aspectRatio: `${W} / ${H}`, cursor: target ? 'pointer' : undefined }}
            onPointerMove={(e) => {
              const key = pointer(e);
              if (key !== target) setTarget(key);
            }}
            onPointerLeave={() => setTarget(null)}
            onClick={(e) => {
              const key = pointer(e);
              if (key && sim.current?.kill(key)) {
                setTarget(null);
                commit(sim.current, true);
              }
            }}
          />
          <figcaption className={s.legend}>
            {reduced ? (
              <span>Reduced motion: no particles, and the run advances 10 s with each change.</span>
            ) : (
              <>
                <span>
                  <i style={{ background: 'var(--blue)' }} />
                  fast
                </span>
                <span>
                  <i style={{ background: 'var(--warn)' }} />
                  slow &gt; 100 ms
                </span>
                <span>
                  <i style={{ background: 'var(--err)' }} />
                  error
                </span>
                <span>
                  <i style={{ background: 'var(--job)' }} />
                  async job
                </span>
                <span className={s.legendNote}>
                  1 in {n?.every ?? '…'} requests traced, replayed in slow motion
                </span>
              </>
            )}
          </figcaption>
        </figure>

        <div className={s.controls}>
          <fieldset>
            <legend>Traffic</legend>
            <label className={s.range}>
              <span className={s.ctlText}>
                <b>Arrival rate</b>
                <small>k6 constant-arrival-rate</small>
              </span>
              <output>{fmt(cfg.rps)} rps</output>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={toPos(cfg.rps)}
                aria-valuetext={`${fmt(cfg.rps)} requests per second`}
                onChange={(e) => apply({ rps: toRps(Number(e.target.value)) })}
              />
            </label>
            <button
              type="button"
              className={`${s.action} ${s.spike}`}
              disabled={spikeLeft > 0}
              onClick={() => act((run) => run.spike())}
            >
              <b>Launch day ×{SPIKE}</b>
              <small>
                {spikeLeft > 0
                  ? `in progress · ${Math.ceil(spikeLeft)} s left`
                  : `ramp to ${fmt(cfg.rps * SPIKE)} rps for 20 s`}
              </small>
            </button>
          </fieldset>

          <fieldset>
            <legend>Compute</legend>
            <Stepper
              label="App replicas"
              note={cfg.autoscale ? 'managed by the autoscaler' : '8 workers each'}
              value={cfg.autoscale ? (n?.live ?? cfg.replicas) : cfg.replicas}
              min={1}
              max={APP_MAX}
              disabled={cfg.autoscale}
              onChange={(v) => apply({ replicas: v })}
            />
            <Switch
              on={cfg.autoscale}
              label="Autoscaling"
              note={`HPA at ${pct(HPA_TARGET)} busy, ${HPA_MIN}–${APP_MAX} · KEDA`}
              onChange={(on) =>
                apply(
                  on
                    ? { autoscale: true }
                    : { autoscale: false, replicas: sim.current?.liveCount() ?? cfg.replicas },
                )
              }
            />
          </fieldset>

          <fieldset>
            <legend>Data</legend>
            <Switch
              on={cfg.cache}
              label="Cache"
              note={
                cfg.cache ? `hit rate ${n ? pct(n.hit) : dash}` : 'every read hits the database'
              }
              onChange={(on) => apply({ cache: on })}
            />
            <Stepper
              label="Read replicas"
              note="7 s to sync a new one"
              value={cfg.readReplicas}
              min={0}
              max={RR_MAX}
              onChange={(v) => apply({ readReplicas: v })}
            />
          </fieldset>

          <fieldset>
            <legend>Resilience</legend>
            <Switch
              on={cfg.breaker}
              label="Circuit breaker"
              note={
                cfg.breaker
                  ? `on the database · ${n?.breaker === 'half' ? 'half-open' : (n?.breaker ?? 'closed')}`
                  : 'calls wait for the database'
              }
              onChange={(on) => apply({ breaker: on })}
            />
            <div className={s.chaos}>
              <button type="button" className={s.action} onClick={() => act((run) => run.chaos())}>
                <b>Chaos monkey</b>
                <small>kill a random node</small>
              </button>
              <button
                type="button"
                className={s.action}
                disabled={latencyLeft > 0}
                onClick={() => act((run) => run.latency())}
              >
                <b>Latency monkey</b>
                <small>
                  {latencyLeft > 0
                    ? `${Math.ceil(latencyLeft)} s left`
                    : `+${LATENCY_MS} ms on the database`}
                </small>
              </button>
            </div>
          </fieldset>
        </div>

        <div className={s.tries}>
          <h3>Try this</h3>
          <ol>
            <li>Launch day with autoscaling off. Then turn it on and launch again.</li>
            <li>Turn the cache off, then launch. Add read replicas until it holds.</li>
            <li>Latency monkey with the breaker on, then off. Watch p50 and Apdex.</li>
            <li>
              Click an app to kill it: the balancer keeps sending it traffic until two health checks
              fail.
            </li>
          </ol>
        </div>
      </div>

      <div className={s.panels}>
        <Panel
          id="p-tput"
          title="Throughput"
          note="req/s · 2xx vs 5xx"
          canvas={tput}
          W={panel.W}
          H={panel.H}
          onHover={track(indexAt, panel.W)}
          label={
            n
              ? `Throughput over the last 60 seconds. Now ${fmt(n.origin * (1 - n.errors))} successful and ${fmt(n.origin * n.errors)} failed API requests per second.`
              : 'Throughput over the last 60 seconds.'
          }
        />
        <Panel
          id="p-lat"
          title="Latency"
          note="histogram_quantile · log scale"
          canvas={lat}
          W={panel.W}
          H={panel.H}
          onHover={track(indexAt, panel.W)}
          label={
            n
              ? `Latency over the last 60 seconds. Now p50 ${fmtMs(n.p50)}, p95 ${fmtMs(n.p95)}, p99 ${fmtMs(n.p99)}.`
              : 'Latency percentiles over the last 60 seconds.'
          }
        />
        <Panel
          id="p-err"
          title="Errors by status"
          note="share of API requests"
          canvas={errs}
          W={panel.W}
          H={panel.H}
          onHover={track(indexAt, panel.W)}
          label={
            n
              ? `Errors over the last 60 seconds: now ${pct(n.errors, 1)} of API requests fail.`
              : 'Errors by status code over the last 60 seconds.'
          }
        >
          <p className={s.codes}>
            <span>
              <i style={{ background: 'var(--err)' }} />
              502 backend gone
            </span>
            <span>
              <i style={{ background: 'var(--warn)' }} />
              503 shed or breaker
            </span>
            <span>
              <i style={{ background: 'var(--job)' }} />
              504 timeout (1 s)
            </span>
          </p>
        </Panel>
        <Panel
          id="p-burn"
          title="SLO burn rate"
          note={`${pct(SLO, 1)} of requests succeed`}
          canvas={burn}
          W={panel.W}
          H={panel.H}
          onHover={track(indexAt, panel.W)}
          label={
            n
              ? `Error budget burn rate, now ${n.burn.toFixed(1)} times; ${n.budget <= 0 ? 'the 5 minute budget is spent' : `${pct(n.budget)} of the 5 minute budget left`}.`
              : 'Error budget burn rate over the last 60 seconds.'
          }
        />
        <Panel
          id="p-heat"
          title="Utilisation by node"
          note="busy workers and connections"
          canvas={heat}
          W={grid.W}
          H={grid.H}
          onHover={track(cellAt, grid.W)}
          label="Heatmap of how busy each node was over the last 60 seconds: green is idle, amber busy, red saturated."
        />
        <section className={s.events} aria-labelledby="events-t">
          <h3 id="events-t">Events</h3>
          <ol>
            {n?.events.map((e) => (
              <li key={e.id} data-level={e.level}>
                <time>{clock(e.t)}</time>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <p className={s.consoleFoot}>
        Every number in this console comes from a queueing model running in your browser: Poisson
        arrivals, finite workers and connections, FIFO backlogs and a 1 s client timeout. Same seed,
        same inputs, same run.
      </p>
    </section>
  );
}
