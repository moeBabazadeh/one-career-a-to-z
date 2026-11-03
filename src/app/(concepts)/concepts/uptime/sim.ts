// Load Test concept: a queueing simulation of a small web stack.
//
// Time advances in 1 ms steps and every random draw comes from one seeded PRNG, so the same
// inputs at the same moments always give the same run. Requests arrive as a Poisson process.
// 40% are static and answered by the CDN; the rest go through the load balancer to an app
// replica, which holds one of its workers for the whole request: CPU, a cache lookup for
// reads, a database call on a miss or a write, then CPU again. Workers, connections and
// backlogs are all finite, so latency is wait plus service, a full backlog sheds load with
// a 503, and anything still unanswered after the 1 s client timeout becomes a 504.

export const SEED = 2007;
export const TIMEOUT = 1000;
export const SLO = 0.995;
export const SPIKE = 6;
export const APP_MAX = 8;
export const RR_MAX = 3;
export const HPA_MIN = 3;
export const HPA_TARGET = 0.6;
export const LATENCY_MS = 600;
export const SAMPLE_MS = 500;
export const WINDOW = 120; // samples on the charts: the last 60 s
export const STATIC = 0.4; // share of traffic the CDN answers

const WRITES = 0.15; // share of API traffic that writes (and enqueues a job)
const APP_SLOTS = 8; // workers per replica
const APP_BACKLOG = 200; // accepted connections waiting for a worker, per replica
export const BOOT = 6000; // a new replica passes its readiness probe after 6 s
export const RESTART = 8000; // a killed node is restarted after 8 s
const DB_CONNS = 8;
export const SYNC = 7000; // a new read replica restores a snapshot before it serves
const CACHE_KEYS = 2500; // a cold cache is mostly warm after a few thousand misses
const HIT_MAX = 0.92; // the long tail that never stays cached
export const CACHE_RESTART = 6000;
const JOB_MS = 40;
const SLOW_CALL = 250; // the breaker counts a database call this slow as a failure
export const SPIKE_S = 26; // 4 s ramp, 16 s hold, 6 s cool-down
export const LATENCY_S = 15;
const BUDGET = 600; // samples in the error-budget window: 5 min
const BPO = 8; // histogram buckets per octave, from 1 ms to 4 s
const NB = 12 * BPO + 1;

/** mulberry32: a tiny seeded PRNG with a full 32-bit period. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type State = 'off' | 'boot' | 'up' | 'dead' | 'drain';
export type Code = 200 | 502 | 503 | 504;
export type Reason = 'ok' | 'dead' | 'shed' | 'timeout' | 'breaker' | 'nobackend';
export type Breaker = 'closed' | 'open' | 'half';
export type Level = 'info' | 'ok' | 'warn' | 'error';
export type Status = 'operational' | 'degraded' | 'outage';

export interface Config {
  rps: number;
  replicas: number;
  cache: boolean;
  readReplicas: number;
  breaker: boolean;
  autoscale: boolean;
}

export const DEFAULTS: Config = {
  rps: 900,
  replicas: 3,
  cache: true,
  readReplicas: 1,
  breaker: true,
  autoscale: false,
};

/** A sampled request's route through the stack, for the particles. */
export interface Trace {
  hops: string[];
  code: Code;
  reason: Reason;
  ms: number;
  job?: boolean;
}

export interface SimEvent {
  id: number;
  t: number;
  level: Level;
  text: string;
  key?: string;
}

interface Req {
  t0: number;
  write: boolean;
  app: number;
  phase: 0 | 1 | 2 | 3; // CPU, cache, database, CPU
  left: number;
  dbT: number;
  done: boolean;
  failed: boolean;
  dead: boolean;
  hops: string[] | null;
}

export interface Node {
  state: State;
  since: number;
  running: Req[];
  queue: Req[];
  busy: number;
  hpaBusy: number;
  arrivals: number;
  inPool: boolean;
  fails: number;
}

export interface Sample {
  t: number;
  edge: number; // req/s at the CDN
  origin: number; // req/s past it
  ok: number;
  e502: number;
  e503: number;
  e504: number;
  p50: number;
  p95: number;
  p99: number;
  apdex: number;
  burn: number;
  load: number[]; // per LOAD_ROWS: 0..1 busy, or OFF, DEAD, BOOTING
  appRps: number[];
  dbRps: number[];
  lookups: number;
  hits: number;
  dbCalls: number;
  jobs: number;
  processed: number;
}

export const OFF = -1;
export const DEAD = -2;
export const BOOTING = -3;
export const LOAD_ROWS = [
  ...Array.from({ length: APP_MAX }, (_, i) => `app-${i + 1}`),
  'cache',
  'db-primary',
  ...Array.from({ length: RR_MAX }, (_, i) => `db-replica-${i + 1}`),
  'workers',
];

export interface Snapshot {
  t: number;
  status: Status;
  rps: number;
  origin: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
  apdex: number;
  budget: number;
  burn: number;
  ready: number;
  live: number;
  replicas: number;
  hit: number;
  backlog: number;
  workers: number;
  breaker: Breaker;
  spikeLeft: number;
  latencyLeft: number;
  firing: string[];
  events: SimEvent[];
  every: number;
}

interface Rule {
  name: string;
  hold: number;
  test: (s: Sample) => boolean;
  text: (s: Sample) => string;
  state: 'ok' | 'pending' | 'firing';
  since: number;
}

const node = (state: State): Node => ({
  state,
  since: 0,
  running: [],
  queue: [],
  busy: 0,
  hpaBusy: 0,
  arrivals: 0,
  inPool: state === 'up',
  fails: 0,
});
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (x: number) => x * x * (3 - 2 * x);
const bucket = (ms: number) => clamp(Math.floor(Math.log2(Math.max(1, ms)) * BPO), 0, NB - 1);
export const errRate = (s: Sample) => {
  const n = s.ok + s.e502 + s.e503 + s.e504;
  return n ? (n - s.ok) / n : 0;
};
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const pct = (f: number, digits = 0) => `${(f * 100).toFixed(digits)}%`;
export const fmtMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;

/** Prometheus-style histogram_quantile: find the bucket, interpolate inside it. */
function quantile(h: Float64Array, total: number, q: number) {
  if (!total) return 0;
  const rank = q * total;
  let cum = 0;
  for (let i = 0; i < NB; i++) {
    if (cum + h[i] >= rank) {
      const lo = 2 ** (i / BPO),
        hi = 2 ** ((i + 1) / BPO);
      return lo + (hi - lo) * (h[i] ? (rank - cum) / h[i] : 0);
    }
    cum += h[i];
  }
  return 2 ** (NB / BPO);
}

const fresh = () => ({
  edge: 0,
  origin: 0,
  c200: 0,
  c502: 0,
  c503: 0,
  c504: 0,
  sat: 0,
  tol: 0,
  lookups: 0,
  hits: 0,
  dbCalls: 0,
  jobs: 0,
  processed: 0,
  workerCap: 0,
});

export class Sim {
  t = 0;
  cfg: Config;
  apps: Node[];
  dbs: Node[]; // [0] is the primary
  cache = { state: 'up' as State, since: 0, warm: 1 };
  breaker: Breaker = 'closed';
  backlog = 0;
  workers = 6;
  samples: Sample[] = [];
  events: SimEvent[] = [];
  version = 0;

  private rand: () => number;
  private spare: number | null = null;
  private carry = 0;
  private nextArrival = 0;
  private spikeAt = -1e9;
  private spikeOn = false;
  private latencyAt = -1e9;
  private latencyOn = false;
  private pool: number[] = [];
  private lbNext = 0;
  private rrNext = 0;
  private traceP = 0.1;
  private traces: Trace[] = [];
  private eventId = 0;
  private brOk = new Array<number>(20).fill(0);
  private brFail = new Array<number>(20).fill(0);
  private brSlot = 0;
  private brSince = 0;
  private probes = 0;
  private probeOk = 0;
  private probeFail = 0;
  private recs: [number, number][] = [];
  private workerBoots: number[] = [];
  private jobsIn = 0;
  private hist = new Float64Array(NB);
  private prevHist = new Float64Array(NB);
  private prevApdex = [0, 0, 0];
  private acc = fresh();
  private rules: Rule[];

  constructor(seed = SEED, cfg: Config = DEFAULTS) {
    this.rand = mulberry32(seed);
    this.cfg = { ...cfg };
    this.apps = Array.from({ length: APP_MAX }, (_, i) => node(i < cfg.replicas ? 'up' : 'off'));
    this.dbs = Array.from({ length: RR_MAX + 1 }, (_, i) =>
      node(i <= cfg.readReplicas ? 'up' : 'off'),
    );
    this.cache.state = cfg.cache ? 'up' : 'off';
    this.repool();
    const rules: Omit<Rule, 'state' | 'since'>[] = [
      {
        name: 'High5xxRate',
        hold: 5000,
        test: (s) => errRate(s) > 0.01,
        text: (s) => `5xx at ${pct(errRate(s), 1)}, over 1% for 5 s`,
      },
      {
        name: 'HighLatencyP99',
        hold: 5000,
        test: (s) => s.p99 > 500,
        text: (s) => `p99 at ${fmtMs(s.p99)}, over 500 ms for 5 s`,
      },
      {
        name: 'ErrorBudgetBurn',
        hold: 0,
        test: () => this.burn(10) > 14.4 && this.burn(60) > 14.4,
        text: () => `burning ${this.burn(10).toFixed(0)}× over both 5 s and 30 s`,
      },
      {
        name: 'JobQueueLag',
        hold: 5000,
        test: () => this.lag() > 10,
        text: () => `jobs waiting ~${this.lag().toFixed(0)} s`,
      },
    ];
    this.rules = rules.map((r) => ({ ...r, state: 'ok', since: 0 }));
    this.log(`k6 run launch-day.js · ${fmt(cfg.rps)} rps · seed ${seed}`, 'info');
  }

  /* ---------------------------------------------------------------- controls */

  configure(next: Config) {
    const prev = this.cfg;
    this.cfg = { ...next };
    if (next.rps !== prev.rps) this.log(`k6: target rate ${fmt(next.rps)} rps`, 'info', 'rps');
    if (next.replicas !== prev.replicas && !next.autoscale && next.replicas !== this.liveCount()) {
      this.log(`deploy: app replicas ${this.liveCount()} → ${next.replicas}`, 'info');
      this.scaleApps(next.replicas);
    }
    if (next.cache !== prev.cache) {
      this.cache = { state: next.cache ? 'up' : 'off', since: this.t, warm: 0 };
      this.log(
        next.cache
          ? 'cache: enabled, starting cold'
          : 'cache: disabled, every read goes to the database',
        'warn',
      );
    }
    if (next.readReplicas !== prev.readReplicas) this.scaleReplicas(next.readReplicas);
    if (next.breaker !== prev.breaker) {
      this.breaker = 'closed';
      this.log(
        next.breaker
          ? 'breaker db: armed (opens at 50% failed or slow calls)'
          : 'breaker db: removed, calls always go through',
        'info',
      );
    }
    if (next.autoscale !== prev.autoscale) {
      this.recs = [];
      this.log(
        next.autoscale
          ? `hpa: on, target ${pct(HPA_TARGET)} busy workers, ${HPA_MIN}–${APP_MAX} replicas; keda on the job queue`
          : 'hpa: off, replicas stay where they are',
        'info',
      );
    }
  }

  spike() {
    this.spikeAt = this.t;
    this.spikeOn = true;
    this.log(`k6: launch day, ramping to ${SPIKE}× (${fmt(this.cfg.rps * SPIKE)} rps)`, 'warn');
  }

  latency() {
    this.latencyAt = this.t;
    this.latencyOn = true;
    this.log(
      `latency-monkey: +${LATENCY_MS} ms on every database query for ${LATENCY_S} s`,
      'error',
    );
  }

  /** Kills a node. Returns false when there is nothing there to kill. */
  kill(key: string, by = 'you') {
    if (key.startsWith('app')) {
      const i = Number(key.slice(3));
      const a = this.apps[i];
      if (!a || (a.state !== 'up' && a.state !== 'boot')) return false;
      for (const r of a.running) this.fail(r, 502, 'dead');
      for (const r of a.queue) this.fail(r, 502, 'dead');
      a.running = [];
      a.queue = [];
      a.state = 'dead';
      a.since = this.t;
      a.fails = 0;
      this.log(`${by}: terminated app-${i + 1}`, 'error');
      return true;
    }
    if (key === 'cache') {
      if (this.cache.state !== 'up') return false;
      this.cache = { state: 'dead', since: this.t, warm: 0 };
      this.log(`${by}: terminated the cache, reads fall through to the database`, 'error');
      return true;
    }
    if (key.startsWith('rr')) {
      const j = Number(key.slice(2));
      const d = this.dbs[j];
      if (!d || j < 1 || d.state !== 'up') return false;
      for (const r of [...d.running, ...d.queue]) r.failed = true;
      d.running = [];
      d.queue = [];
      d.state = 'dead';
      d.since = this.t;
      this.log(`${by}: terminated db-replica-${j}`, 'error');
      return true;
    }
    return false;
  }

  killable(key: string) {
    if (key.startsWith('app'))
      return ['up', 'boot'].includes(this.apps[Number(key.slice(3))]?.state);
    if (key === 'cache') return this.cache.state === 'up';
    if (key.startsWith('rr')) return this.dbs[Number(key.slice(2))]?.state === 'up';
    return false;
  }

  /** Kills a random node, chosen by the seeded PRNG. */
  chaos() {
    const pick = [
      ...this.apps.map((_, i) => `app${i}`),
      'cache',
      ...this.dbs.map((_, j) => `rr${j}`),
    ].filter((k) => this.killable(k));
    if (!pick.length) {
      this.log('chaos-monkey: nothing left to kill', 'warn');
      return null;
    }
    const key = pick[Math.floor(this.rand() * pick.length)];
    this.kill(key, 'chaos-monkey');
    return key;
  }

  /* ---------------------------------------------------------------- reading */

  rate(t = this.t) {
    const wobble = 1 + 0.05 * Math.sin(t / 3700) + 0.03 * Math.sin(t / 1130);
    const x = (t - this.spikeAt) / 1000;
    const env =
      x < 0 || x > SPIKE_S ? 0 : x < 4 ? smooth(x / 4) : x < 20 ? 1 : smooth(1 - (x - 20) / 6);
    return this.cfg.rps * wobble * (1 + (SPIKE - 1) * env);
  }

  liveCount() {
    return this.apps.filter((a) => a.state === 'up' || a.state === 'boot' || a.state === 'dead')
      .length;
  }

  readyCount() {
    return this.pool.filter((i) => this.apps[i].state === 'up').length;
  }

  spikeLeft() {
    return this.spikeOn ? Math.max(0, SPIKE_S - (this.t - this.spikeAt) / 1000) : 0;
  }

  latencyLeft() {
    return this.latencyOn ? Math.max(0, LATENCY_S - (this.t - this.latencyAt) / 1000) : 0;
  }

  /** Seconds the newest job will wait, at the current processing rate. */
  lag() {
    return this.backlog / ((this.workers / JOB_MS) * 1000);
  }

  /** Error-budget burn rate over the last n samples: 1× spends the budget exactly on time. */
  burn(n: number) {
    let bad = 0,
      all = 0;
    for (let i = Math.max(0, this.samples.length - n); i < this.samples.length; i++) {
      const s = this.samples[i];
      all += s.ok + s.e502 + s.e503 + s.e504;
      bad += s.e502 + s.e503 + s.e504;
    }
    return all ? bad / all / (1 - SLO) : 0;
  }

  /**
   * Error budget left in the 5 min rolling window. Until the window has filled, the volume
   * is extrapolated from the current rate, as it would be at steady state.
   */
  budget() {
    let bad = 0,
      all = 0;
    for (const s of this.samples) {
      all += s.ok + s.e502 + s.e503 + s.e504;
      bad += s.e502 + s.e503 + s.e504;
    }
    return all ? 1 - bad / ((1 - SLO) * (all / this.samples.length) * BUDGET) : 1;
  }

  /** One request in this many is traced and drawn. */
  traceEvery() {
    return Math.max(1, Math.round(1 / this.traceP));
  }

  /** The new sampled requests since the last call. */
  drainTraces() {
    const out = this.traces;
    this.traces = [];
    return out;
  }

  snapshot(): Snapshot {
    const s = this.samples[this.samples.length - 1];
    const err = s ? errRate(s) : 0;
    const status: Status =
      !this.pool.length || err > 0.1
        ? 'outage'
        : err > 0.005 || (s?.p99 ?? 0) > 500
          ? 'degraded'
          : 'operational';
    return {
      t: this.t,
      status,
      rps: s?.edge ?? 0,
      origin: s?.origin ?? 0,
      p50: s?.p50 ?? 0,
      p95: s?.p95 ?? 0,
      p99: s?.p99 ?? 0,
      errors: err,
      apdex: s?.apdex ?? 1,
      budget: this.budget(),
      burn: s?.burn ?? 0,
      ready: this.readyCount(),
      live: this.liveCount(),
      replicas: this.dbs.filter((d, j) => j > 0 && d.state === 'up').length,
      hit: s && s.lookups ? s.hits / s.lookups : 0,
      backlog: this.backlog,
      workers: this.workers,
      breaker: this.breaker,
      spikeLeft: this.spikeLeft(),
      latencyLeft: this.latencyLeft(),
      firing: this.rules.filter((r) => r.state === 'firing').map((r) => r.name),
      events: this.events.slice(-9).reverse(),
      every: this.traceEvery(),
    };
  }

  /* ---------------------------------------------------------------- stepping */

  advance(ms: number) {
    this.carry += ms;
    while (this.carry >= 1) {
      this.carry -= 1;
      this.step();
    }
  }

  private step() {
    const t = ++this.t;
    if (t % 100 === 0) {
      this.lifecycle();
      this.tickBreaker();
    }
    if (t % 1000 === 0) this.healthChecks();
    if (t % 3000 === 0) this.autoscale();

    const perMs = this.rate(t) / 1000;
    while (this.nextArrival <= t) {
      this.arrive(this.nextArrival);
      this.nextArrival += -Math.log(1 - this.rand()) / perMs;
    }
    for (let i = 0; i < this.apps.length; i++) this.runApp(this.apps[i]);
    for (const d of this.dbs) this.runDb(d);

    const cap = this.workers / JOB_MS;
    const done = Math.min(this.backlog, cap);
    this.backlog -= done;
    this.acc.processed += done;
    this.acc.workerCap += cap;

    if (t % SAMPLE_MS === 0) this.sample();
  }

  private arrive(t0: number) {
    this.acc.edge++;
    const traced = this.rand() < this.traceP;
    if (this.rand() < STATIC) {
      if (traced) this.emit({ hops: ['users', 'cdn'], code: 200, reason: 'ok', ms: 12 });
      return;
    }
    this.acc.origin++;
    const r: Req = {
      t0,
      write: this.rand() < WRITES,
      app: -1,
      phase: 0,
      left: 0,
      dbT: 0,
      done: false,
      failed: false,
      dead: false,
      hops: traced ? ['users', 'cdn', 'lb'] : null,
    };
    if (!this.pool.length) return this.finish(r, 503, 'nobackend');
    const i = this.pool[this.lbNext++ % this.pool.length];
    const a = this.apps[i];
    r.app = i;
    r.hops?.push(`app${i}`);
    a.arrivals++;
    // The balancer still believes in a dead replica until its health checks fail.
    if (a.state === 'dead') return this.finish(r, 502, 'dead');
    if (a.running.length < APP_SLOTS) this.begin(a, r);
    else if (a.queue.length < APP_BACKLOG) a.queue.push(r);
    else this.finish(r, 503, 'shed');
  }

  private begin(a: Node, r: Req) {
    r.phase = 0;
    r.left = this.ln(6, 0.6);
    a.running.push(r);
  }

  private runApp(a: Node) {
    if (a.state !== 'up' && a.state !== 'drain') return;
    const t = this.t;
    // The client has hung up on anything that waited too long for a worker.
    while (a.queue.length && t - a.queue[0].t0 >= TIMEOUT)
      this.finish(a.queue.shift()!, 504, 'timeout');
    const run = a.running;
    for (let k = run.length - 1; k >= 0; k--) {
      const r = run[k];
      if (t - r.t0 >= TIMEOUT) {
        run.splice(k, 1);
        this.fail(r, 504, 'timeout');
      } else if (this.work(r)) {
        run.splice(k, 1);
      }
    }
    while (run.length < APP_SLOTS && a.queue.length) this.begin(a, a.queue.shift()!);
    a.busy += run.length;
    a.hpaBusy += run.length;
    if (a.state === 'drain' && !run.length && !a.queue.length) a.state = 'off';
  }

  /** One millisecond of a request on its worker. True when it has left the worker. */
  private work(r: Req) {
    switch (r.phase) {
      case 0:
        if ((r.left -= 1) > 0) return false;
        if (!r.write && this.cfg.cache) {
          r.phase = 1;
          r.left = this.cache.state === 'up' ? 0.6 : 2; // a dead cache refuses the connection
          r.hops?.push('cache');
          return false;
        }
        return this.query(r);
      case 1:
        if ((r.left -= 1) > 0) return false;
        if (this.cache.state === 'up') {
          this.acc.lookups++;
          if (this.rand() < HIT_MAX * this.cache.warm) {
            this.acc.hits++;
            return this.render(r);
          }
          this.cache.warm += (1 - this.cache.warm) / CACHE_KEYS;
        }
        return this.query(r);
      case 2:
        if (r.failed) {
          this.record(false);
          this.finish(r, 502, 'dead');
          return true;
        }
        return r.done ? this.render(r) : false;
      default:
        if ((r.left -= 1) > 0) return false;
        this.finish(r, 200, 'ok');
        if (r.write) {
          this.backlog++;
          this.acc.jobs++;
          this.jobsIn++;
          if (r.hops)
            this.emit({
              hops: [`app${r.app}`, 'queue', 'workers'],
              code: 200,
              reason: 'ok',
              ms: 0,
              job: true,
            });
        }
        return true;
    }
  }

  private render(r: Req) {
    r.phase = 3;
    r.left = this.ln(3, 0.6);
    return false;
  }

  private query(r: Req) {
    if (this.cfg.breaker && !this.allow()) {
      r.hops?.push('breaker');
      this.finish(r, 503, 'breaker');
      return true;
    }
    r.hops?.push('proxy');
    const j = r.write ? 0 : this.replica();
    const d = this.dbs[j];
    r.hops?.push(j ? `rr${j}` : 'db');
    r.phase = 2;
    r.dbT = this.t;
    this.acc.dbCalls++;
    d.arrivals++;
    if (d.running.length < DB_CONNS) this.exec(d, r);
    else d.queue.push(r);
    return false;
  }

  private exec(d: Node, r: Req) {
    r.left = this.ln(r.write ? 7 : 5, 0.5) + (this.latencyOn ? LATENCY_MS : 0);
    d.running.push(r);
  }

  /** Reads go round-robin to replicas that are in sync, or to the primary if there are none. */
  private replica() {
    for (let k = 0; k < RR_MAX; k++) {
      const idx = (this.rrNext + k) % RR_MAX;
      if (this.dbs[idx + 1].state === 'up') {
        this.rrNext = idx + 1;
        return idx + 1;
      }
    }
    return 0;
  }

  private runDb(d: Node) {
    if (d.state !== 'up' && d.state !== 'drain') return;
    const run = d.running;
    for (let k = run.length - 1; k >= 0; k--) {
      const r = run[k];
      if ((r.left -= 1) > 0) continue;
      run.splice(k, 1);
      // A query whose caller already gave up still held its connection to the end.
      if (!r.dead) {
        r.done = true;
        this.record(this.t - r.dbT < SLOW_CALL);
      }
    }
    while (run.length < DB_CONNS && d.queue.length) {
      const r = d.queue.shift()!;
      if (!r.dead) this.exec(d, r);
    }
    d.busy += run.length;
    if (d.state === 'drain' && !run.length && !d.queue.length) d.state = 'off';
  }

  private fail(r: Req, code: Code, reason: Reason) {
    if (r.phase === 2 && !r.done && !r.dead) {
      r.dead = true;
      this.record(false);
    }
    this.finish(r, code, reason);
  }

  private finish(r: Req, code: Code, reason: Reason) {
    const ms = Math.max(0.5, this.t - r.t0);
    const a = this.acc;
    if (code === 200) {
      a.c200++;
      if (ms <= 100) a.sat++;
      else if (ms <= 400) a.tol++;
    } else if (code === 502) a.c502++;
    else if (code === 503) a.c503++;
    else a.c504++;
    this.hist[bucket(ms)]++;
    if (r.hops) this.emit({ hops: r.hops, code, reason, ms });
  }

  private emit(trace: Trace) {
    if (this.traces.length < 400) this.traces.push(trace);
  }

  /* ---------------------------------------------------------------- control plane */

  private allow() {
    if (this.breaker === 'closed') return true;
    if (this.breaker === 'open') return false;
    if (this.probes >= 10) return false;
    this.probes++;
    return true;
  }

  private record(ok: boolean) {
    if (ok) this.brOk[this.brSlot]++;
    else this.brFail[this.brSlot]++;
    if (this.breaker === 'half') {
      if (ok) this.probeOk++;
      else this.probeFail++;
    }
  }

  // A 2 s rolling window in 100 ms slots.
  private tickBreaker() {
    this.brSlot = (this.brSlot + 1) % 20;
    this.brOk[this.brSlot] = 0;
    this.brFail[this.brSlot] = 0;
    if (!this.cfg.breaker) return;
    const t = this.t;
    if (this.breaker === 'closed') {
      const ok = this.brOk.reduce((s, v) => s + v, 0),
        bad = this.brFail.reduce((s, v) => s + v, 0);
      if (ok + bad >= 20 && bad / (ok + bad) >= 0.5) {
        this.breaker = 'open';
        this.brSince = t;
        this.log(
          `breaker db: closed → open, ${pct(bad / (ok + bad))} of calls failed or slow`,
          'error',
        );
      }
    } else if (this.breaker === 'open') {
      if (t - this.brSince >= 4000) {
        this.breaker = 'half';
        this.brSince = t;
        this.probes = this.probeOk = this.probeFail = 0;
        this.log('breaker db: open → half-open, letting 10 probes through', 'warn');
      }
    } else if (this.probeFail >= 3) {
      this.breaker = 'open';
      this.brSince = t;
      this.log('breaker db: probes failed, back to open', 'error');
    } else if (this.probeOk >= 8) {
      this.breaker = 'closed';
      this.brOk.fill(0);
      this.brFail.fill(0);
      this.log('breaker db: probes passed, closed', 'ok');
    }
  }

  private lifecycle() {
    const t = this.t;
    this.apps.forEach((a, i) => {
      if (a.state === 'boot' && t - a.since >= BOOT) {
        a.state = 'up';
        a.since = t;
      } else if (a.state === 'dead' && t - a.since >= RESTART) {
        a.state = 'boot';
        a.since = t;
        a.inPool = false;
        this.repool();
        this.log(`app-${i + 1}: restarting`, 'info');
      }
    });
    for (let j = 1; j <= RR_MAX; j++) {
      const d = this.dbs[j];
      if (d.state === 'boot' && t - d.since >= SYNC) {
        d.state = 'up';
        this.log(`db-replica-${j}: in sync, serving reads`, 'ok');
      } else if (d.state === 'dead' && t - d.since >= RESTART) {
        d.state = 'boot';
        d.since = t;
        this.log(`db-replica-${j}: restarting, catching up`, 'info');
      }
    }
    if (this.cache.state === 'dead' && t - this.cache.since >= CACHE_RESTART) {
      this.cache = { state: 'up', since: t, warm: 0 };
      this.log('cache: back up, but cold', 'warn');
    }
    while (this.workerBoots.length && this.workerBoots[0] <= t) {
      this.workerBoots.shift();
      this.workers++;
    }
    if (this.spikeOn && t - this.spikeAt >= SPIKE_S * 1000) {
      this.spikeOn = false;
      this.log(`k6: launch day over, back to ${fmt(this.cfg.rps)} rps`, 'info');
    }
    if (this.latencyOn && t - this.latencyAt >= LATENCY_S * 1000) {
      this.latencyOn = false;
      this.log('latency-monkey: database latency back to normal', 'ok');
    }
  }

  private healthChecks() {
    let changed = false;
    this.apps.forEach((a, i) => {
      if (a.state === 'up' && !a.inPool) {
        a.inPool = true;
        changed = true;
        this.log(`lb: app-${i + 1} healthy, in rotation`, 'ok');
      } else if (a.state === 'dead' && a.inPool && ++a.fails >= 2) {
        a.inPool = false;
        changed = true;
        this.log(`lb: app-${i + 1} failed 2 health checks, out of rotation`, 'warn');
      }
    });
    if (changed) this.repool();
  }

  // Like a Kubernetes HPA: scale up at once, scale down only to the highest
  // recommendation of the last 15 s. KEDA does the same for workers on queue depth.
  private autoscale() {
    const t = this.t;
    if (this.cfg.autoscale) {
      const ready = this.apps.filter((a) => a.state === 'up' && a.inPool);
      const live = this.liveCount();
      if (ready.length) {
        const util = ready.reduce((s, a) => s + a.hpaBusy, 0) / (ready.length * APP_SLOTS * 3000);
        const ratio = util / HPA_TARGET;
        const want = clamp(
          Math.abs(ratio - 1) <= 0.1 ? live : Math.ceil(ready.length * ratio),
          HPA_MIN,
          APP_MAX,
        );
        this.recs = [...this.recs.filter(([at]) => t - at < 15000), [t, want]];
        const floor = Math.max(...this.recs.map(([, w]) => w));
        const next = want > live ? want : Math.min(live, floor);
        if (next !== live) {
          this.log(
            `hpa: app ${live} → ${next}, workers ${pct(util)} busy (target ${pct(HPA_TARGET)})`,
            'info',
          );
          this.scaleApps(next);
        }
      }
      const current = this.workers + this.workerBoots.length;
      const wantW = clamp(
        Math.ceil(((this.jobsIn / 3) * JOB_MS) / 1000 / 0.7 + this.backlog / 250),
        2,
        24,
      );
      if (wantW > current) {
        for (let k = current; k < wantW; k++) this.workerBoots.push(t + 3000);
        this.log(`keda: workers ${current} → ${wantW}, ${fmt(this.backlog)} jobs queued`, 'info');
      } else if (wantW < current && this.backlog < 50) {
        this.workerBoots = [];
        this.workers = wantW;
        this.log(`keda: workers ${current} → ${wantW}`, 'info');
      }
    }
    for (const a of this.apps) a.hpaBusy = 0;
    this.jobsIn = 0;
  }

  private scaleApps(n: number) {
    const live = () =>
      this.apps.filter((a) => a.state === 'up' || a.state === 'boot' || a.state === 'dead');
    while (live().length < n) {
      const a =
        this.apps.find((x) => x.state === 'drain') ?? this.apps.find((x) => x.state === 'off');
      if (!a) break;
      if (a.state === 'drain') a.state = 'up';
      else Object.assign(a, { state: 'boot', since: this.t, inPool: false, fails: 0 });
    }
    // Scale in from the top: booting replicas first, then dead ones, then healthy ones.
    while (live().length > n) {
      const order = [...this.apps].reverse();
      const a =
        order.find((x) => x.state === 'boot') ??
        order.find((x) => x.state === 'dead') ??
        order.find((x) => x.state === 'up');
      if (!a) break;
      if (a.state === 'up') a.state = 'drain';
      else a.state = 'off';
      a.inPool = false;
    }
    this.repool();
  }

  private scaleReplicas(n: number) {
    const live = () =>
      this.dbs.filter(
        (d, j) => j > 0 && (d.state === 'up' || d.state === 'boot' || d.state === 'dead'),
      );
    while (live().length < n) {
      const j = this.dbs.findIndex((d, k) => k > 0 && (d.state === 'off' || d.state === 'drain'));
      if (j < 0) break;
      const d = this.dbs[j];
      if (d.state === 'drain') d.state = 'up';
      else Object.assign(d, { state: 'boot', since: this.t });
      this.log(
        d.state === 'up'
          ? `db-replica-${j}: kept`
          : `rds: created db-replica-${j}, restoring a snapshot`,
        'info',
      );
    }
    while (live().length > n) {
      const j =
        [3, 2, 1].find((k) => this.dbs[k].state === 'boot' || this.dbs[k].state === 'dead') ??
        [3, 2, 1].find((k) => this.dbs[k].state === 'up');
      if (j == null) break;
      const d = this.dbs[j];
      d.state = d.state === 'up' ? 'drain' : 'off';
      this.log(`rds: removed db-replica-${j}`, 'info');
    }
  }

  private repool() {
    this.pool = this.apps.flatMap((a, i) => (a.inPool ? [i] : []));
  }

  /* ---------------------------------------------------------------- samples */

  private sample() {
    const a = this.acc,
      k = 1000 / SAMPLE_MS;
    const h = new Float64Array(NB);
    let n = 0;
    for (let i = 0; i < NB; i++) {
      h[i] = this.hist[i] + this.prevHist[i];
      n += h[i];
    }
    const [ps, pt, pn] = this.prevApdex;
    const total = a.c200 + a.c502 + a.c503 + a.c504;
    const busy = (x: Node, slots: number) =>
      x.state === 'off'
        ? OFF
        : x.state === 'dead'
          ? DEAD
          : x.state === 'boot'
            ? BOOTING
            : Math.min(1, x.busy / (slots * SAMPLE_MS));
    const s: Sample = {
      t: this.t,
      edge: a.edge * k,
      origin: a.origin * k,
      ok: a.c200 * k,
      e502: a.c502 * k,
      e503: a.c503 * k,
      e504: a.c504 * k,
      p50: quantile(h, n, 0.5),
      p95: quantile(h, n, 0.95),
      p99: quantile(h, n, 0.99),
      apdex: total + pn ? (a.sat + ps + (a.tol + pt) / 2) / (total + pn) : 1,
      burn: 0,
      load: [
        ...this.apps.map((x) => busy(x, APP_SLOTS)),
        this.cache.state === 'off'
          ? OFF
          : this.cache.state === 'dead'
            ? DEAD
            : Math.min(1, (a.lookups * k) / 40000),
        ...this.dbs.map((x) => busy(x, DB_CONNS)),
        a.workerCap ? a.processed / a.workerCap : 0,
      ],
      appRps: this.apps.map((x) => x.arrivals * k),
      dbRps: this.dbs.map((x) => x.arrivals * k),
      lookups: a.lookups * k,
      hits: a.hits * k,
      dbCalls: a.dbCalls * k,
      jobs: a.jobs * k,
      processed: a.processed * k,
    };
    this.samples.push(s);
    if (this.samples.length > BUDGET) this.samples.shift();
    s.burn = this.burn(10);

    for (const x of [...this.apps, ...this.dbs]) {
      x.busy = 0;
      x.arrivals = 0;
    }
    this.prevApdex = [a.sat, a.tol, total];
    this.prevHist = this.hist;
    this.hist = new Float64Array(NB);
    this.acc = fresh();
    const r = Math.max(1, this.rate());
    this.traceP = Math.min(1, (22 * Math.sqrt(r / 100)) / r);

    for (const rule of this.rules) {
      if (rule.test(s)) {
        if (rule.state === 'ok') {
          rule.state = 'pending';
          rule.since = this.t;
        }
        if (rule.state === 'pending' && this.t - rule.since >= rule.hold) {
          rule.state = 'firing';
          this.log(`alert firing: ${rule.name}, ${rule.text(s)}`, 'error');
        }
      } else {
        if (rule.state === 'firing') this.log(`alert resolved: ${rule.name}`, 'ok');
        rule.state = 'ok';
      }
    }
    this.version++;
  }

  /* ---------------------------------------------------------------- helpers */

  private log(text: string, level: Level, key?: string) {
    const last = this.events[this.events.length - 1];
    // A slider drag updates one line instead of writing fifty.
    if (key && last?.key === key && this.t - last.t < 3000) {
      this.events[this.events.length - 1] = { ...last, text };
      return;
    }
    this.events.push({ id: ++this.eventId, t: this.t, level, text, key });
    if (this.events.length > 60) this.events.shift();
  }

  private normal() {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    const u = 1 - this.rand(),
      v = this.rand();
    const m = Math.sqrt(-2 * Math.log(u));
    this.spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  }

  /** A lognormal service time with the given mean: most are quick, a few are slow. */
  private ln(mean: number, sigma: number) {
    return mean * Math.exp(sigma * this.normal() - (sigma * sigma) / 2);
  }
}
