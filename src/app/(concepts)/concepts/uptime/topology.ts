// The topology view for the Load Test concept: node cards, edges whose weight follows the
// traffic, and particles that replay sampled traces. Drawn in a fixed logical space: wide
// on desktop, a vertical pipeline on phones.

import { token } from '../_shared/scheme';
import {
  BOOT,
  CACHE_RESTART,
  RESTART,
  STATIC,
  SYNC,
  fmt,
  pct,
  type Sample,
  type Sim,
  type State,
  type Trace,
} from './sim';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Layout = Record<string, Box>;

export const SIZE = { wide: { W: 980, H: 384 }, tall: { W: 360, H: 452 } };

// The canvas palette for the topology and the panels. Each colour is a token on the root (see
// loadtest.module.scss), read again whenever the scheme changes; these are the dark defaults
// for any paint before the first read.
export const C = {
  bg: '#0d1017',
  card: '#131824',
  line: '#262e3e',
  text: '#e6e9ef',
  dim: '#8b94a7',
  faint: '#4b5468',
  ok: '#3dd68c',
  warn: '#f5a524',
  err: '#ff5c5c',
  blue: '#5b8cff',
  job: '#c9a0ff',
  pink: '#ff6fae',
  off: '#0f131b',
  dead: '#2a1418',
  track: '#1d2433',
  dots: 'rgba(139,148,167,.09)',
  edge: 'rgba(132,148,180,.16)',
  edgeDead: 'rgba(255,92,92,.45)',
  repl: '#3a4357',
  short: 'rgba(230,233,239,.42)',
  crawl: '#ff8a4c',
  grid: 'rgba(139,148,167,.12)',
  cross: 'rgba(230,233,239,.35)',
  hi: 'rgba(230,233,239,.6)',
  edgeLine: 'rgba(230,233,239,.5)',
  okArea: 'rgba(61,214,140,.16)',
  errArea: 'rgba(255,92,92,.4)',
  alert: 'rgba(245,165,36,.75)',
  burnZone: 'rgba(255,92,92,.07)',
  page: 'rgba(255,92,92,.8)',
  budget: 'rgba(139,148,167,.6)',
  burnArea: 'rgba(91,140,255,.14)',
  row: 'rgba(139,148,167,.05)',
  heat0: '#16241f',
  heat1: '#3dd68c',
  heat2: '#f5a524',
  heat3: '#ff5c5c',
  heatDead: '#5a1d24',
  heatBoot: '#1f2c52',
};
export type Ink = keyof typeof C;

const kebab = (k: string) => k.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`);
const SHARED = new Set<Ink>(['text', 'dim', 'ok', 'warn', 'err', 'blue', 'job', 'pink']);

/** Reads the palette from the tokens in effect under `el`: the page's own, or the canvas-only `--cv-*`. */
export function readPalette(el: Element) {
  for (const k of Object.keys(C) as Ink[]) {
    const v = token(el, SHARED.has(k) ? `--${k}` : `--cv-${kebab(k)}`);
    if (v) C[k] = v;
  }
}

/** A palette colour at some opacity, for strokes whose weight follows the traffic. */
const alpha = (hex: string, a: number) =>
  `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a.toFixed(3)})`;

const MONO = '"DM Mono", ui-monospace, Menlo, monospace';
const font = (px: number, weight = 400) => `${weight} ${px}px ${MONO}`;

export function layout(tall: boolean): Layout {
  const L: Layout = {};
  const put = (key: string, x: number, y: number, w: number, h: number) =>
    (L[key] = { x, y, w, h });
  if (!tall) {
    put('users', 58, 205, 96, 54);
    put('cdn', 186, 205, 100, 46);
    put('lb', 314, 205, 100, 46);
    for (let i = 0; i < 8; i++) put(`app${i}`, 478, 205 + (i - 3.5) * 42, 124, 36);
    put('cache', 668, 74, 136, 44);
    put('proxy', 668, 205, 136, 44);
    put('queue', 668, 336, 136, 44);
    put('db', 868, 74, 136, 44);
    for (let j = 1; j <= 3; j++) put(`rr${j}`, 868, 146 + (j - 1) * 50, 136, 40);
    put('workers', 868, 336, 136, 44);
    put('breaker', 571, 205, 16, 16);
  } else {
    put('users', 180, 30, 210, 44);
    put('cdn', 180, 92, 210, 40);
    put('lb', 180, 152, 210, 40);
    for (let i = 0; i < 8; i++) put(`app${i}`, 26 + i * 44, 226, 38, 44);
    put('cache', 62, 318, 110, 44);
    put('proxy', 180, 318, 110, 44);
    put('queue', 298, 318, 110, 44);
    put('workers', 298, 318, 110, 44);
    put('db', 46, 404, 84, 44);
    for (let j = 1; j <= 3; j++) put(`rr${j}`, 46 + j * 89.3, 404, 84, 44);
    put('breaker', 180, 284, 14, 14);
  }
  return L;
}

/** A cubic Bézier from one box to the next, leaving and entering square to the flow. */
export function edge(a: Box, b: Box, tall: boolean): number[] {
  const across = tall ? Math.abs(a.y - b.y) < 1 : Math.abs(a.x - b.x) > 1;
  if (across) {
    const s = Math.sign(b.x - a.x) || 1;
    const x0 = a.x + (s * a.w) / 2,
      x3 = b.x - (s * b.w) / 2,
      c = Math.abs(x3 - x0) * 0.5;
    return [x0, a.y, x0 + s * c, a.y, x3 - s * c, b.y, x3, b.y];
  }
  const s = Math.sign(b.y - a.y) || 1;
  const y0 = a.y + (s * a.h) / 2,
    y3 = b.y - (s * b.h) / 2,
    c = Math.abs(y3 - y0) * 0.5;
  return [a.x, y0, a.x, y0 + s * c, b.x, y3 - s * c, b.x, y3];
}

function bez(p: number[], u: number): [number, number] {
  const v = 1 - u,
    a = v * v * v,
    b = 3 * v * v * u,
    c = 3 * v * u * u,
    d = u * u * u;
  return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
}

const curve = (ctx: CanvasRenderingContext2D, p: number[]) => {
  ctx.moveTo(p[0], p[1]);
  ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Nodes a visitor can click to kill. */
export function hitTest(L: Layout, sim: Sim, x: number, y: number) {
  for (const key of Object.keys(L)) {
    const b = L[key];
    if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2 && sim.killable(key))
      return key;
  }
  return null;
}

/* ------------------------------------------------------------------ particles */

interface Particle {
  segs: number[][];
  lens: number[];
  total: number;
  d: number;
  speed: number;
  ink: Ink;
  end: 'ok' | 'err' | null;
}

interface Burst {
  x: number;
  y: number;
  age: number;
  err: boolean;
}

/** Sampled traces replayed in slow motion: one dot per traced request, along its real route. */
export class Flow {
  private ps: Particle[] = [];
  private bursts: Burst[] = [];

  clear() {
    this.ps = [];
    this.bursts = [];
  }

  add(traces: Trace[], L: Layout, tall: boolean) {
    for (const tr of traces) {
      if (this.ps.length > 700) return;
      const segs: number[][] = [],
        lens: number[] = [];
      for (let i = 1; i < tr.hops.length; i++) {
        const a = L[tr.hops[i - 1]],
          b = L[tr.hops[i]];
        if (!a || !b || a === b || (a.x === b.x && a.y === b.y)) continue;
        const p = edge(a, b, tall);
        segs.push(p);
        const chord = Math.hypot(p[6] - p[0], p[7] - p[1]);
        const net =
          Math.hypot(p[2] - p[0], p[3] - p[1]) +
          Math.hypot(p[4] - p[2], p[5] - p[3]) +
          Math.hypot(p[6] - p[4], p[7] - p[5]);
        lens.push((chord + net) / 2);
      }
      if (!segs.length) continue;
      const failed = tr.code !== 200;
      const last = tr.hops[tr.hops.length - 1];
      this.ps.push({
        segs,
        lens,
        total: lens.reduce((s, v) => s + v, 0),
        d: 0,
        // Slow requests crawl: the replay speed falls with the real latency.
        speed: (tr.job ? 240 : 400) / (1 + Math.log10(1 + tr.ms / 40)),
        ink: tr.job
          ? 'job'
          : failed
            ? 'err'
            : tr.hops.length <= 2
              ? 'short'
              : tr.ms > 400
                ? 'crawl'
                : tr.ms > 100
                  ? 'warn'
                  : 'blue',
        end: failed ? 'err' : /^(cache|db|rr|workers)/.test(last) && !tr.job ? 'ok' : null,
      });
    }
  }

  step(dt: number) {
    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < 0.7);
    const keep: Particle[] = [];
    for (const p of this.ps) {
      p.d += p.speed * dt;
      if (p.d < p.total) keep.push(p);
      else if (p.end) {
        const s = p.segs[p.segs.length - 1];
        this.bursts.push({ x: s[6], y: s[7], age: 0, err: p.end === 'err' });
      }
    }
    this.ps = keep;
  }

  private at(p: Particle, d: number): [number, number] {
    let k = 0;
    d = Math.max(0, d);
    while (k < p.segs.length - 1 && d > p.lens[k]) d -= p.lens[k++];
    return bez(p.segs[k], Math.min(1, d / p.lens[k]));
  }

  draw(ctx: CanvasRenderingContext2D) {
    const groups = new Map<Ink, Particle[]>();
    for (const p of this.ps) {
      const g = groups.get(p.ink);
      if (g) g.push(p);
      else groups.set(p.ink, [p]);
    }
    ctx.lineCap = 'round';
    for (const [ink, ps] of groups) {
      ctx.strokeStyle = C[ink];
      ctx.fillStyle = C[ink];
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const p of ps) {
        const [x0, y0] = this.at(p, p.d - 10);
        const [x1, y1] = this.at(p, p.d);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (const p of ps) {
        const [x, y] = this.at(p, p.d);
        ctx.moveTo(x + 2, y);
        ctx.arc(x, y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  drawBursts(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = 1.5;
    for (const b of this.bursts) {
      const k = b.age / 0.7;
      ctx.globalAlpha = (1 - k) * (b.err ? 1 : 0.7);
      ctx.strokeStyle = b.err ? C.err : C.ok;
      ctx.beginPath();
      ctx.arc(b.x, b.y, (b.err ? 3 : 2) + k * (b.err ? 16 : 9), 0, Math.PI * 2);
      ctx.stroke();
      if (b.err && k < 0.5) {
        ctx.beginPath();
        ctx.moveTo(b.x - 3, b.y - 3);
        ctx.lineTo(b.x + 3, b.y + 3);
        ctx.moveTo(b.x + 3, b.y - 3);
        ctx.lineTo(b.x - 3, b.y + 3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ nodes */

type Tone = 'ok' | 'warn' | 'err' | 'dead' | 'boot' | 'off';

interface View {
  title: string;
  value?: string;
  sub?: string;
  bar?: number;
  tone: Tone;
  queue?: number;
}

const toneOf = (load: number): Tone => (load >= 0.9 ? 'err' : load >= 0.7 ? 'warn' : 'ok');
const TONE: Record<Tone, Ink> = {
  ok: 'ok',
  warn: 'warn',
  err: 'err',
  dead: 'err',
  boot: 'blue',
  off: 'faint',
};
const secs = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}s`;

function lifecycle(
  state: State,
  since: number,
  t: number,
  boot: number,
  title: string,
  label = 'booting',
): View | null {
  if (state === 'off') return { title, sub: 'off', tone: 'off' };
  if (state === 'dead')
    return { title, value: 'down', sub: `restart in ${secs(RESTART - (t - since))}`, tone: 'dead' };
  if (state === 'boot')
    return {
      title,
      value: label,
      sub: `ready in ${secs(boot - (t - since))}`,
      bar: (t - since) / boot,
      tone: 'boot',
    };
  return null;
}

function views(sim: Sim, s: Sample | undefined): Record<string, View> {
  const t = sim.t,
    out: Record<string, View> = {};
  const ready = sim.readyCount(),
    live = sim.liveCount();
  const spike = sim.spikeLeft();
  out.users = {
    title: 'k6',
    value: `${fmt(sim.rate())}/s`,
    sub: spike ? `launch · ${Math.ceil(spike)}s` : 'virtual users',
    tone: spike ? 'warn' : 'ok',
  };
  out.cdn = {
    title: 'cdn',
    value: `${fmt(s?.edge ?? 0)}/s`,
    sub: `${pct(STATIC)} at the edge`,
    tone: 'ok',
  };
  out.lb = {
    title: 'lb',
    value: `${ready}/${live} up`,
    sub: `→ ${fmt(s?.origin ?? 0)}/s`,
    tone: !ready ? 'err' : ready < live ? 'warn' : 'ok',
  };
  sim.apps.forEach((a, i) => {
    const title = `app-${i + 1}`;
    const load = s?.load[i] ?? 0;
    out[`app${i}`] = lifecycle(a.state, a.since, t, BOOT, title) ?? {
      title,
      value: a.state === 'drain' ? 'drain' : pct(Math.max(0, load)),
      sub: `q ${a.queue.length} · ${fmt(s?.appRps[i] ?? 0)}/s`,
      bar: Math.max(0, load),
      tone: a.state === 'drain' ? 'off' : toneOf(load),
      queue: a.queue.length,
    };
  });
  const c = sim.cache;
  const hit = s && s.lookups ? s.hits / s.lookups : 0;
  out.cache =
    c.state === 'off'
      ? { title: 'cache', sub: 'disabled', tone: 'off' }
      : c.state === 'dead'
        ? {
            title: 'cache',
            value: 'down',
            sub: `restart in ${secs(CACHE_RESTART - (t - c.since))}`,
            tone: 'dead',
          }
        : {
            title: 'redis',
            value: `hit ${pct(hit)}`,
            sub: c.warm < 0.95 ? `cold · warming ${pct(c.warm)}` : 'cache · warm',
            bar: c.warm,
            tone: hit < 0.5 ? 'warn' : 'ok',
          };
  const waiting = sim.dbs.reduce((n, d) => n + d.queue.length, 0);
  const slow = sim.latencyLeft();
  out.proxy = {
    title: 'db-proxy',
    value: `${fmt(s?.dbCalls ?? 0)}/s`,
    sub: slow ? `+600 ms · ${Math.ceil(slow)}s` : `waiting ${waiting}`,
    tone: slow ? 'err' : waiting > 20 ? 'warn' : 'ok',
  };
  sim.dbs.forEach((d, j) => {
    const key = j ? `rr${j}` : 'db',
      title = j ? `db-replica-${j}` : 'db-primary';
    const load = s?.load[9 + j] ?? 0;
    out[key] = lifecycle(d.state, d.since, t, SYNC, title, 'syncing') ?? {
      title,
      value: d.state === 'drain' ? 'drain' : pct(Math.max(0, load)),
      sub: j
        ? `reads ${fmt(s?.dbRps[j] ?? 0)}/s`
        : `${sim.dbs.some((x, k) => k && x.state === 'up') ? 'writes' : 'reads + writes'} ${fmt(s?.dbRps[0] ?? 0)}/s`,
      bar: Math.max(0, load),
      tone: toneOf(load),
      queue: d.queue.length,
    };
  });
  const lag = sim.lag();
  out.queue = {
    title: 'queue',
    value: fmt(sim.backlog),
    sub: `lag ${lag < 10 ? lag.toFixed(1) : Math.round(lag)}s`,
    tone: lag > 10 ? 'err' : lag > 2 ? 'warn' : 'ok',
  };
  const wl = s?.load[s.load.length - 1] ?? 0;
  out.workers = {
    title: 'workers',
    value: `${sim.workers}×`,
    sub: `${fmt(s?.processed ?? 0)} jobs/s`,
    bar: wl,
    tone: toneOf(wl),
  };
  return out;
}

function card(ctx: CanvasRenderingContext2D, b: Box, v: View, compact: boolean, hover: boolean) {
  const x = b.x - b.w / 2,
    y = b.y - b.h / 2;
  const color = C[TONE[v.tone]];
  roundRect(ctx, x + 0.5, y + 0.5, b.w - 1, b.h - 1, 6);
  ctx.fillStyle = v.tone === 'dead' ? C.dead : v.tone === 'off' ? C.off : C.card;
  ctx.fill();
  ctx.setLineDash(v.tone === 'off' || v.tone === 'boot' || v.tone === 'dead' ? [3, 3] : []);
  ctx.strokeStyle = hover ? C.err : v.tone === 'ok' ? C.line : color;
  ctx.lineWidth = hover ? 1.6 : 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // A queue of waiting requests, drawn as a short line of squares in front of the node.
  if (v.queue) {
    const n = Math.min(compact ? 4 : 9, Math.ceil(Math.log2(v.queue + 1) * 1.4));
    ctx.fillStyle = v.queue > 100 ? C.err : C.warn;
    for (let k = 0; k < n; k++) {
      if (compact) ctx.fillRect(b.x - 9 + (k % 4) * 5, y - 7 - Math.floor(k / 4) * 5, 3.5, 3.5);
      else ctx.fillRect(x - 8 - k * 6, b.y - 2, 4, 4);
    }
  }

  ctx.textBaseline = 'middle';
  if (compact && b.w < 60) {
    ctx.textAlign = 'center';
    ctx.font = font(10, 500);
    ctx.fillStyle = v.tone === 'off' ? C.faint : C.text;
    ctx.fillText(v.title.replace('app-', ''), b.x, y + 13);
    ctx.font = font(8.5);
    ctx.fillStyle = v.tone === 'dead' ? C.err : C.dim;
    ctx.fillText(
      v.tone === 'dead' ? '✕' : v.tone === 'boot' ? '…' : v.tone === 'off' ? '–' : (v.value ?? ''),
      b.x,
      y + 26,
    );
  } else if (compact && b.w < 130) {
    // narrow nodes on phones: the name, then the reading underneath
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 9, y + 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(10, 500);
    ctx.fillStyle = v.tone === 'off' ? C.faint : C.text;
    ctx.fillText(
      v.title.replace('db-replica-', 'replica-').replace('db-primary', 'primary'),
      x + 16,
      y + 12.5,
    );
    ctx.font = font(9);
    ctx.fillStyle = v.tone === 'dead' ? C.err : v.tone === 'boot' ? C.blue : C.dim;
    ctx.fillText(
      v.tone === 'off' ? 'off' : v.tone === 'dead' ? 'down' : (v.value ?? ''),
      x + 9,
      y + 26,
    );
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 10, y + 12, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(compact ? 10 : 11, 500);
    ctx.fillStyle = v.tone === 'off' ? C.faint : C.text;
    ctx.fillText(v.title, x + 18, y + 12.5);
    if (v.value) {
      ctx.textAlign = 'right';
      ctx.fillStyle = v.tone === 'dead' ? C.err : v.tone === 'boot' ? C.blue : C.text;
      ctx.fillText(v.value, x + b.w - 8, y + 12.5);
    }
    if (v.sub && b.h >= 36) {
      ctx.textAlign = 'left';
      ctx.font = font(compact ? 9 : 9.5);
      ctx.fillStyle = v.tone === 'off' ? C.faint : C.dim;
      ctx.fillText(v.sub, x + 10, y + (b.h >= 42 ? 27 : 23.5));
    }
  }
  if (v.bar != null) {
    const bw = b.w - 16;
    ctx.fillStyle = C.track;
    ctx.fillRect(x + 8, y + b.h - 6, bw, 2.5);
    ctx.fillStyle = color;
    ctx.fillRect(x + 8, y + b.h - 6, bw * Math.max(0, Math.min(1, v.bar)), 2.5);
  }
}

/* ------------------------------------------------------------------ scene */

const lw = (rps: number) => Math.max(0, Math.min(1, Math.log10(1 + rps) / Math.log10(6001)));

export function drawTopology(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  flow: Flow | null,
  o: { tall: boolean; hover: string | null; reduced: boolean },
) {
  const { W, H } = o.tall ? SIZE.tall : SIZE.wide;
  const L = layout(o.tall);
  const s = sim.samples[sim.samples.length - 1];
  ctx.clearRect(0, 0, W, H);

  // dot grid
  ctx.fillStyle = C.dots;
  for (let x = 10; x < W; x += 20) for (let y = 10; y < H; y += 20) ctx.fillRect(x, y, 1, 1);

  if (!o.tall) {
    ctx.font = font(9.5, 500);
    ctx.fillStyle = C.faint;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cols: [string, number][] = [
      ['LOAD', 58],
      ['EDGE', 186],
      ['INGRESS', 314],
      ['COMPUTE', 478],
      ['SERVICES', 668],
      ['STATE', 868],
    ];
    for (const [label, x] of cols) ctx.fillText(label, x, 14);
  }

  // edges, weighted by the traffic they carried in the last sample
  const origin = Math.max(1, s?.origin ?? 1);
  const misses = s ? Math.max(0, s.lookups - s.hits) : 0;
  const direct = s ? Math.max(0, s.dbCalls - misses) / origin : 0;
  const E: [string, string, number][] = [
    ['users', 'cdn', s?.edge ?? 0],
    ['cdn', 'lb', s?.origin ?? 0],
  ];
  sim.apps.forEach((a, i) => {
    if (a.state === 'off') return;
    const r = s?.appRps[i] ?? 0;
    E.push(['lb', `app${i}`, r]);
    if (sim.cfg.cache) E.push([`app${i}`, 'cache', (r * (s?.lookups ?? 0)) / origin]);
    E.push([`app${i}`, 'proxy', r * direct], [`app${i}`, 'queue', (r * (s?.jobs ?? 0)) / origin]);
  });
  if (sim.cfg.cache) E.push(['cache', 'proxy', misses]);
  sim.dbs.forEach(
    (d, j) => d.state !== 'off' && E.push(['proxy', j ? `rr${j}` : 'db', s?.dbRps[j] ?? 0]),
  );
  if (!o.tall) E.push(['queue', 'workers', s?.processed ?? 0]);

  ctx.lineWidth = 1;
  ctx.strokeStyle = C.edge;
  ctx.beginPath();
  for (const [a, b] of E) curve(ctx, edge(L[a], L[b], o.tall));
  ctx.stroke();
  for (const [a, b, rps] of E) {
    const w = lw(rps);
    if (w < 0.05) continue;
    const dead =
      /^(app|rr)/.test(b) &&
      (b.startsWith('app') ? sim.apps[Number(b.slice(3))] : sim.dbs[Number(b.slice(2))]).state ===
        'dead';
    ctx.strokeStyle = dead ? C.edgeDead : alpha(C.blue, 0.1 + 0.32 * w);
    ctx.lineWidth = 0.6 + 3 * w;
    ctx.beginPath();
    curve(ctx, edge(L[a], L[b], o.tall));
    ctx.stroke();
  }

  // asynchronous replication from the primary
  const live = [1, 2, 3].filter((j) => sim.dbs[j].state !== 'off');
  if (live.length) {
    ctx.strokeStyle = C.repl;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    const p = L.db;
    if (!o.tall) {
      const x = p.x + p.w / 2 + 14;
      ctx.moveTo(p.x + p.w / 2, p.y);
      ctx.lineTo(x, p.y);
      ctx.lineTo(x, L[`rr${live[live.length - 1]}`].y);
      for (const j of live) {
        ctx.moveTo(x, L[`rr${j}`].y);
        ctx.lineTo(L[`rr${j}`].x + L[`rr${j}`].w / 2, L[`rr${j}`].y);
      }
    } else {
      const y = p.y + p.h / 2 + 6;
      ctx.moveTo(p.x, p.y + p.h / 2);
      ctx.lineTo(p.x, y);
      ctx.lineTo(L[`rr${live[live.length - 1]}`].x, y);
      for (const j of live) {
        ctx.moveTo(L[`rr${j}`].x, y);
        ctx.lineTo(L[`rr${j}`].x, L[`rr${j}`].y + L[`rr${j}`].h / 2);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (!o.tall) {
      ctx.save();
      ctx.translate(p.x + p.w / 2 + 24, (p.y + L.rr1.y) / 2);
      ctx.rotate(Math.PI / 2);
      ctx.font = font(8.5);
      ctx.fillStyle = C.faint;
      ctx.textAlign = 'center';
      ctx.fillText('replication', 0, 0);
      ctx.restore();
    }
  }

  // cache misses fall through to the database
  if (sim.cfg.cache && !o.tall) {
    const [x, y] = bez(edge(L.cache, L.proxy, false), 0.5);
    ctx.font = font(9.5);
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`miss ${fmt(misses)}/s`, x + 7, y);
  }

  if (flow && !o.reduced) flow.draw(ctx);

  const V = views(sim, s);
  for (const key of Object.keys(V)) {
    if (o.tall && key === 'workers') continue;
    const v =
      key === 'queue' && o.tall
        ? { ...V.queue, value: `q ${fmt(sim.backlog)} · ${sim.workers} workers` }
        : V[key];
    card(ctx, L[key], v, o.tall, o.hover === key);
  }

  // the circuit breaker on the way to the database
  const br = L.breaker;
  const state = sim.cfg.breaker ? sim.breaker : null;
  const bc = state === 'open' ? C.err : state === 'half' ? C.warn : state ? C.ok : C.faint;
  ctx.fillStyle = C.bg;
  ctx.strokeStyle = bc;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(br.x, br.y, br.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  if (state === 'open') {
    ctx.moveTo(br.x - 4, br.y + 2);
    ctx.lineTo(br.x + 3, br.y - 4);
  } else if (state) {
    ctx.moveTo(br.x - 4, br.y);
    ctx.lineTo(br.x + 4, br.y);
  }
  ctx.stroke();
  // its state as a pill: one line beside it on phones, two lines above it on desktop
  const lines = o.tall
    ? [state ? `breaker ${state === 'half' ? 'half-open' : state}` : 'no breaker']
    : state
      ? ['breaker', state === 'half' ? 'half-open' : state]
      : ['no', 'breaker'];
  ctx.font = font(9, 500);
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
  const th = lines.length * 11 + 4;
  const px = o.tall ? br.x + 12 : br.x - tw / 2,
    py = o.tall ? br.y - th / 2 : br.y - br.h / 2 - 6 - th;
  roundRect(ctx, px, py, tw, th, 6);
  ctx.fillStyle = C.bg;
  ctx.fill();
  ctx.strokeStyle = bc;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = bc;
  ctx.textAlign = 'center';
  lines.forEach((l, k) => ctx.fillText(l, px + tw / 2, py + 7.5 + k * 11));

  if (flow && !o.reduced) flow.drawBursts(ctx);

  if (o.hover) {
    const b = L[o.hover];
    ctx.font = font(9.5, 500);
    ctx.fillStyle = C.err;
    ctx.textAlign = 'center';
    ctx.fillText('click to kill', b.x, b.y - b.h / 2 - 9);
  }
}
