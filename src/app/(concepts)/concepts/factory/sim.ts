// The factory simulation. It runs at a fixed 60 ticks per game second and has no randomness at
// all, so the same clicks at the same ticks always give the same factory.
//
// Belts carry items in a single lane at 1.875 tiles/s with at least half a tile between them.
// Drills mine onto belts, inserters swing items from belts into assemblers and back out,
// splitters alternate between their two outputs (or favour one), and a belt that ends against
// the side of another belt side-loads onto it. Assemblers hold two crafts' worth of each
// ingredient and stop when their output is full. Production and consumption are counted per
// game second, which is what the statistics window and the bottleneck finder read.

import {
  ALL,
  ITEMS,
  PRODUCTS,
  RECIPES,
  type ItemId,
  type ProductId,
  type RawId,
  type Recipe,
} from './items';
import {
  BELTS,
  COLS,
  DOCKS,
  DRILLS,
  DX,
  DY,
  MACHINES,
  ROWS,
  SPLITTERS,
  type Dir,
  type DockId,
} from './world';

export const UPS = 60;
export const DT = 1 / UPS;
export const BELT_SPEED = 1.875;
export const GAP = 0.5;
export const BELT_MAX = (BELT_SPEED / GAP) * 60; // items/min a lane can carry
export const SWING = 0.3; // seconds per half swing
export const INSERTER_MAX = 60 / (SWING * 2);
export const MINE_TIME = 1.5;
export const BUILD_TIME = 2.5;
export const HIST = 1200; // seconds of history kept for the charts
const RING = 120; // seconds kept per building and belt
const OUT_CAP = 2;
const TAU = 10; // seconds, for the utilisation averages

export type Ref = string; // 'm3', 'd1', 'b12', 's2', 'k0'

export interface Tile {
  x: number;
  y: number;
  din: Dir;
  dout: Dir;
  /** 0 on the surface, 1 underground, 2 an underground entrance, 3 an exit. */
  ug: 0 | 1 | 2 | 3;
}

export interface BeltItem {
  item: ItemId;
  d: number;
}

type Sink =
  | { kind: 'splitter'; i: number }
  | { kind: 'belt'; i: number; at: number }
  | { kind: 'dock'; i: number }
  | null;
type Feeder = { kind: 'drill' | 'machine' | 'splitter' | 'belt'; i: number; side?: 0 | 1 };

export interface Belt {
  id: string;
  item: ItemId;
  tiles: Tile[];
  len: number;
  items: BeltItem[]; // front first
  on: boolean;
  sink: Sink;
  feeders: Feeder[];
  flow: Float32Array; // items leaving the belt, per second
  /** How far the belt surface has moved, mod 1, for the tread animation. */
  shift: number;
}

type End = { kind: 'belt'; i: number; at: number } | { kind: 'machine'; i: number };

export interface Inserter {
  x: number;
  y: number;
  dir: Dir;
  from: End;
  to: End;
  owner: number;
  /** 0 waiting at the pickup, 1 swinging to the drop, 2 swinging back. */
  state: 0 | 1 | 2;
  t: number;
  hand: ItemId | null;
}

export interface Machine {
  id: string;
  recipe: Recipe;
  x: number;
  y: number;
  ghost: boolean;
  built: number; // 0 ghost, 0..1 under construction, 1 working
  building: boolean;
  buf: Partial<Record<ItemId, number>>;
  out: number;
  crafting: boolean;
  progress: number;
  spin: number;
  work: number;
  block: number;
  starve: number;
  starveBy: Partial<Record<ItemId, number>>;
  made: number;
  ring: Float32Array;
}

export interface Drill {
  id: string;
  res: RawId;
  x: number;
  y: number;
  dir: Dir;
  ghost: boolean;
  built: number;
  building: boolean;
  out: { i: number; at: number };
  progress: number;
  holding: boolean;
  spin: number;
  work: number;
  made: number;
  ring: Float32Array;
}

export type Mode = 0 | 1 | 2; // balanced, favour left, favour right

export interface Splitter {
  id: string;
  a: [number, number];
  b: [number, number];
  dir: Dir;
  /** Where each output leads, in words. */
  names: [string, string];
  input: number;
  outs: [number, number];
  mode: Mode;
  next: 0 | 1;
  sent: [number, number];
}

export interface Dock {
  id: DockId;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  total: number;
  got: Partial<Record<ItemId, number>>;
  /** The last crates in, newest first, for the loading floor. */
  recent: ItemId[];
  ring: Float32Array;
}

export interface Bottleneck {
  ref: Ref;
  /** All refs in the group, e.g. both firmware assemblers. */
  group: Ref[];
  name: string;
  reason: string;
  short: ItemId;
  products: ProductId[];
  severity: number;
}

export interface LogEntry {
  n: number;
  t: number;
  text: string;
  level: 'info' | 'warn' | 'ok';
}

const key = (x: number, y: number) => y * COLS + x;

/** Belt tiles from waypoints, with the direction in and out of each tile. */
function pathTiles(pts: [number, number][], end?: Dir): Tile[] {
  const cells: [number, number][] = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1],
      [x1, y1] = pts[k];
    const sx = Math.sign(x1 - x0),
      sy = Math.sign(y1 - y0);
    let x = x0,
      y = y0;
    while (x !== x1 || y !== y1) {
      x += sx;
      y += sy;
      cells.push([x, y]);
    }
  }
  const dirOf = (a: [number, number], b: [number, number]): Dir =>
    b[0] > a[0] ? 0 : b[1] > a[1] ? 1 : b[0] < a[0] ? 2 : 3;
  const outs: Dir[] = cells.map((c, k) =>
    k < cells.length - 1 ? dirOf(c, cells[k + 1]) : (end ?? (k ? dirOf(cells[k - 1], c) : 0)),
  );
  return cells.map(([x, y], k) => ({ x, y, dout: outs[k], din: k ? outs[k - 1] : outs[k], ug: 0 }));
}

export class Factory {
  t = 0;
  tick = 0;
  sec = 0;
  version = 0;
  belts: Belt[] = [];
  machines: Machine[] = [];
  drills: Drill[] = [];
  inserters: Inserter[] = [];
  splitters: Splitter[] = [];
  docks: Dock[] = [];
  prod: Record<ItemId, Float32Array>;
  cons: Record<ItemId, Float32Array>;
  bottlenecks: Bottleneck[] = [];
  /** Belts and buildings between a bottleneck and the products it holds back. */
  chain = new Set<Ref>();
  log: LogEntry[] = [];
  private logN = 0;
  private lastTop = '';
  private topSince = 0;
  private logged = '';
  /** What sits on each tile, for hit tests. */
  grid: (Ref | null)[] = new Array(COLS * ROWS).fill(null);
  private beltAt = new Map<number, { i: number; at: number }>();

  constructor() {
    this.prod = Object.fromEntries(ALL.map((id) => [id, new Float32Array(HIST)])) as Record<
      ItemId,
      Float32Array
    >;
    this.cons = Object.fromEntries(ALL.map((id) => [id, new Float32Array(HIST)])) as Record<
      ItemId,
      Float32Array
    >;

    // belts, then underground crossings
    this.belts = BELTS.map((b) => {
      const tiles = pathTiles(b.pts, b.end);
      return {
        id: b.id,
        item: b.item,
        tiles,
        len: tiles.length,
        items: [],
        on: true,
        sink: null,
        feeders: [],
        flow: new Float32Array(RING),
        shift: 0,
      };
    });
    this.buryCrossings();
    this.belts.forEach((b, i) =>
      b.tiles.forEach((t, at) => {
        if (t.ug !== 1) this.beltAt.set(key(t.x, t.y), { i, at });
        if (t.ug !== 1 || !this.grid[key(t.x, t.y)]) this.grid[key(t.x, t.y)] = `b${i}`;
      }),
    );

    this.splitters = SPLITTERS.map((s) => {
      const outs = [s.a, s.b].map(([x, y]) =>
        this.belts.findIndex((b) => b.tiles[0].x === x && b.tiles[0].y === y),
      ) as [number, number];
      return {
        id: s.id,
        a: s.a,
        b: s.b,
        dir: s.dir,
        names: s.names,
        input: -1,
        outs,
        mode: 0,
        next: 0,
        sent: [0, 0],
      };
    });
    this.splitters.forEach((s, i) => {
      this.grid[key(...s.a)] = `s${i}`;
      this.grid[key(...s.b)] = `s${i}`;
    });

    this.docks = DOCKS.map((d) => ({
      ...d,
      total: 0,
      got: {},
      recent: [],
      ring: new Float32Array(RING),
    }));
    this.docks.forEach((d, i) => {
      for (let x = d.x; x < d.x + d.w; x++)
        for (let y = d.y; y < d.y + d.h; y++) this.grid[key(x, y)] = `k${i}`;
    });

    // where each belt ends
    this.belts.forEach((b, i) => {
      const last = b.tiles[b.len - 1];
      const nx = last.x + DX[last.dout],
        ny = last.y + DY[last.dout];
      const sp = this.splitters.findIndex(
        (s) => (s.a[0] === nx && s.a[1] === ny) || (s.b[0] === nx && s.b[1] === ny),
      );
      const onto = this.beltAt.get(key(nx, ny));
      const dock = this.docks.findIndex(
        (d) => nx >= d.x && nx < d.x + d.w && ny >= d.y && ny < d.y + d.h,
      );
      if (sp >= 0) {
        b.sink = { kind: 'splitter', i: sp };
        this.splitters[sp].input = i;
      } else if (onto && onto.i !== i) {
        b.sink = { kind: 'belt', i: onto.i, at: onto.at };
        this.belts[onto.i].feeders.push({ kind: 'belt', i });
      } else if (dock >= 0) b.sink = { kind: 'dock', i: dock };
    });
    this.splitters.forEach((s, i) =>
      s.outs.forEach((o, side) =>
        this.belts[o].feeders.push({ kind: 'splitter', i, side: side as 0 | 1 }),
      ),
    );

    this.machines = MACHINES.map((m) => ({
      id: m.id,
      recipe: RECIPES[m.recipe],
      x: m.x,
      y: m.y,
      ghost: !!m.ghost,
      built: m.ghost ? 0 : 1,
      building: false,
      buf: {},
      out: 0,
      crafting: false,
      progress: 0,
      spin: 0,
      work: 0,
      block: 0,
      starve: 0,
      starveBy: {},
      made: 0,
      ring: new Float32Array(RING),
    }));
    MACHINES.forEach((spec, mi) => {
      for (let x = spec.x; x < spec.x + 3; x++)
        for (let y = spec.y; y < spec.y + 3; y++) this.grid[key(x, y)] = `m${mi}`;
      for (const ins of spec.ins) {
        const p = this.beltAt.get(key(ins.x - DX[ins.dir], ins.y - DY[ins.dir]));
        if (!p) throw new Error(`${spec.id}: no belt to pick from`);
        this.inserters.push({
          x: ins.x,
          y: ins.y,
          dir: ins.dir,
          from: { kind: 'belt', ...p },
          to: { kind: 'machine', i: mi },
          owner: mi,
          state: 0,
          t: 0,
          hand: null,
        });
        this.grid[key(ins.x, ins.y)] = `m${mi}`;
      }
      const q = this.beltAt.get(key(spec.out.x + DX[spec.out.dir], spec.out.y + DY[spec.out.dir]));
      if (!q) throw new Error(`${spec.id}: no belt to drop on`);
      this.inserters.push({
        x: spec.out.x,
        y: spec.out.y,
        dir: spec.out.dir,
        from: { kind: 'machine', i: mi },
        to: { kind: 'belt', ...q },
        owner: mi,
        state: 0,
        t: 0,
        hand: null,
      });
      this.grid[key(spec.out.x, spec.out.y)] = `m${mi}`;
      this.belts[q.i].feeders.push({ kind: 'machine', i: mi });
    });

    this.drills = DRILLS.map((d, di) => {
      const o = this.beltAt.get(key(...d.out));
      if (!o) throw new Error(`${d.id}: no belt`);
      this.belts[o.i].feeders.push({ kind: 'drill', i: di });
      for (let x = d.x; x < d.x + 2; x++)
        for (let y = d.y; y < d.y + 2; y++) this.grid[key(x, y)] = `d${di}`;
      return {
        id: d.id,
        res: d.res,
        x: d.x,
        y: d.y,
        dir: d.dir,
        ghost: !!d.ghost,
        built: d.ghost ? 0 : 1,
        building: false,
        out: o,
        progress: 0,
        holding: false,
        spin: 0,
        work: 0,
        made: 0,
        ring: new Float32Array(RING),
      };
    });
  }

  /** Where two belts cross, the one that can dive goes under, and nearby dives merge. */
  private buryCrossings() {
    const owner = new Map<number, number>();
    this.belts.forEach((b, i) =>
      b.tiles.forEach((t) => owner.set(key(t.x, t.y), owner.has(key(t.x, t.y)) ? -2 - i : i)),
    );
    const straight = (b: Belt, k: number) =>
      k > 0 && k < b.len - 1 && b.tiles[k].din === b.tiles[k].dout;
    const crossings: [number, number][] = [];
    this.belts.forEach((b, i) =>
      b.tiles.forEach((t, k) => {
        const others = this.belts.filter(
          (o, j) => j !== i && o.tiles.some((u) => u.x === t.x && u.y === t.y),
        );
        if (!others.length || !straight(b, k)) return;
        const o = others[0];
        const ok = o.tiles.findIndex((u) => u.x === t.x && u.y === t.y);
        const vertical = t.dout % 2 === 1;
        // prefer burying the vertical belt; otherwise whichever has room for its hoods
        const canMe = straight(b, k - 1) || straight(b, k + 1);
        const canO = straight(o, ok - 1) || straight(o, ok + 1);
        if ((vertical && canMe) || !canO) crossings.push([i, k]);
      }),
    );
    for (const [i, k] of crossings) this.belts[i].tiles[k].ug = 1;
    // merge dives on the same belt that are close, then add hoods
    for (const b of this.belts) {
      const under = b.tiles.map((t) => t.ug === 1);
      for (let k = 0; k < b.len; k++) {
        if (!under[k]) continue;
        let j = k + 1;
        while (j < b.len && !under[j]) j++;
        if (j < b.len && j - k <= 3 && j - k > 1) {
          const span = (() => {
            let s = k;
            while (s > 0 && under[s - 1]) s--;
            return j - s + 1;
          })();
          if (span <= 4) for (let m = k + 1; m < j; m++) under[m] = true;
        }
      }
      for (let k = 0; k < b.len; k++) {
        if (!under[k]) continue;
        b.tiles[k].ug = 1;
        if (k > 0 && !under[k - 1]) b.tiles[k - 1].ug = 2;
        if (k < b.len - 1 && !under[k + 1]) b.tiles[k + 1].ug = 3;
      }
    }
  }

  /* ---------------------------------------------------------------- stepping */

  advance(seconds: number) {
    const n = Math.round(seconds * UPS);
    for (let k = 0; k < n; k++) this.step();
  }

  step() {
    const dt = DT;
    for (const d of this.drills) this.stepDrill(d, dt);
    for (const m of this.machines) this.stepMachine(m, dt);
    for (const ins of this.inserters) this.stepInserter(ins, dt);
    for (const b of this.belts) this.stepBelt(b, dt);
    this.tick++;
    this.t = this.tick / UPS;
    if (this.tick % UPS === 0) this.second();
  }

  private slot() {
    return this.sec % HIST;
  }

  private stepDrill(d: Drill, dt: number) {
    if (d.built < 1) {
      if (d.building) {
        d.built = Math.min(1, d.built + dt / BUILD_TIME);
        if (d.built >= 1) this.note(`Built a second drill on ${ITEMS[d.res].name}.`, 'ok');
      }
      return;
    }
    if (!d.holding) {
      d.progress += dt / MINE_TIME;
      d.spin += dt;
      if (d.progress >= 1) {
        d.progress -= 1;
        d.holding = true;
        d.made++;
        d.ring[this.sec % RING]++;
        this.prod[d.res][this.slot()]++;
      }
    }
    if (d.holding && this.insertAt(this.belts[d.out.i], d.out.at + 0.5, d.res)) d.holding = false;
    d.work += ((d.holding ? 0 : 1) - d.work) * (dt / TAU);
  }

  private tryStart(m: Machine) {
    if (m.out >= OUT_CAP) return;
    for (const [id, n] of m.recipe.inputs) if ((m.buf[id] ?? 0) < n) return;
    for (const [id, n] of m.recipe.inputs) {
      m.buf[id] = (m.buf[id] ?? 0) - n;
      this.cons[id][this.slot()] += n;
    }
    m.crafting = true;
    m.progress = 0;
  }

  private stepMachine(m: Machine, dt: number) {
    if (m.built < 1) {
      if (m.building) {
        m.built = Math.min(1, m.built + dt / BUILD_TIME);
        if (m.built >= 1)
          this.note(`Built a second ${ITEMS[m.recipe.out].name.toLowerCase()} assembler.`, 'ok');
      }
      return;
    }
    if (!m.crafting) this.tryStart(m);
    if (m.crafting) {
      m.progress += dt / m.recipe.time;
      m.spin += dt;
      if (m.progress >= 1) {
        m.crafting = false;
        m.progress = 0;
        m.out++;
        m.made++;
        m.ring[this.sec % RING]++;
        this.prod[m.recipe.out][this.slot()]++;
        this.tryStart(m);
      }
    }
    const k = dt / TAU;
    const blocked = !m.crafting && m.out >= OUT_CAP;
    const starved = !m.crafting && !blocked;
    m.work += ((m.crafting ? 1 : 0) - m.work) * k;
    m.block += ((blocked ? 1 : 0) - m.block) * k;
    m.starve += ((starved ? 1 : 0) - m.starve) * k;
    for (const [id, n] of m.recipe.inputs) {
      const short = starved && (m.buf[id] ?? 0) < n ? 1 : 0;
      m.starveBy[id] = (m.starveBy[id] ?? 0) + (short - (m.starveBy[id] ?? 0)) * k;
    }
  }

  private stepInserter(ins: Inserter, dt: number) {
    const m = this.machines[ins.owner];
    if (m.built < 1) return;
    if (ins.state === 0) {
      if (ins.from.kind === 'belt') {
        const b = this.belts[ins.from.i];
        const at = ins.from.at;
        // only what the recipe needs, up to two crafts' worth
        const k = b.items.findIndex(
          (it) =>
            it.d >= at &&
            it.d <= at + 1 &&
            m.recipe.inputs.some(([id, n]) => id === it.item && (m.buf[id] ?? 0) < n * 2),
        );
        if (k >= 0) {
          ins.hand = b.items[k].item;
          b.items.splice(k, 1);
          b.flow[this.sec % RING]++;
          ins.state = 1;
          ins.t = 0;
        }
      } else if (m.out > 0) {
        m.out--;
        ins.hand = m.recipe.out;
        ins.state = 1;
        ins.t = 0;
      }
      return;
    }
    ins.t = Math.min(SWING, ins.t + dt);
    if (ins.t < SWING) return;
    if (ins.state === 1 && ins.hand) {
      if (ins.to.kind === 'machine') m.buf[ins.hand] = (m.buf[ins.hand] ?? 0) + 1;
      else if (!this.insertAt(this.belts[ins.to.i], ins.to.at + 0.5, ins.hand)) return; // wait for a gap
      ins.hand = null;
      ins.state = 2;
      ins.t = 0;
    } else if (ins.state === 2) {
      ins.state = 0;
      ins.t = 0;
    }
  }

  /** Puts an item on a belt at distance d, if there is room. */
  private insertAt(b: Belt, d: number, item: ItemId) {
    const items = b.items;
    let k = 0;
    while (k < items.length && items[k].d > d) k++;
    if (k > 0 && items[k - 1].d - d < GAP) return false;
    if (k < items.length && d - items[k].d < GAP) return false;
    items.splice(k, 0, { item, d });
    return true;
  }

  private stepBelt(b: Belt, dt: number) {
    if (!b.on) return;
    const v = BELT_SPEED * dt;
    b.shift = (b.shift + v) % 1;
    const items = b.items;
    const endMax = b.sink ? b.len : b.len - 0.25;
    for (let k = 0; k < items.length; k++) {
      const max = k === 0 ? endMax : items[k - 1].d - GAP;
      const nd = Math.min(items[k].d + v, max);
      if (nd > items[k].d) items[k].d = nd;
    }
    const f = items[0];
    if (!f || !b.sink || f.d < b.len - 1e-6) return;
    if (this.hand(b.sink, f.item)) {
      items.shift();
      b.flow[this.sec % RING]++;
    }
  }

  private hand(sink: NonNullable<Sink>, item: ItemId): boolean {
    if (sink.kind === 'dock') {
      const d = this.docks[sink.i];
      d.total++;
      d.got[item] = (d.got[item] ?? 0) + 1;
      d.recent.unshift(item);
      if (d.recent.length > 24) d.recent.length = 24;
      d.ring[this.sec % RING]++;
      this.cons[item][this.slot()]++;
      return true;
    }
    if (sink.kind === 'belt') return this.insertAt(this.belts[sink.i], sink.at + 0.5, item);
    const s = this.splitters[sink.i];
    const room = (side: 0 | 1) => {
      const o = this.belts[s.outs[side]];
      const back = o.items[o.items.length - 1];
      return !back || back.d >= GAP;
    };
    const order: (0 | 1)[] =
      s.mode === 1 ? [0, 1] : s.mode === 2 ? [1, 0] : [s.next, (1 - s.next) as 0 | 1];
    for (const side of order) {
      if (!room(side)) continue;
      this.belts[s.outs[side]].items.push({ item, d: 0 });
      s.sent[side]++;
      if (s.mode === 0) s.next = (1 - side) as 0 | 1;
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- once a second */

  private second() {
    this.sec++;
    const s = this.slot();
    for (const id of ALL) {
      this.prod[id][s] = 0;
      this.cons[id][s] = 0;
    }
    const r = this.sec % RING;
    for (const b of this.belts) b.flow[r] = 0;
    for (const m of this.machines) m.ring[r] = 0;
    for (const d of this.drills) d.ring[r] = 0;
    for (const d of this.docks) d.ring[r] = 0;
    this.analyze();
  }

  /** Items per minute over the last `window` complete game seconds. */
  rate(series: Float32Array, window = 60) {
    const n = Math.min(window, this.sec, series.length - 1);
    if (!n) return 0;
    const len = series.length;
    let sum = 0;
    for (let k = 1; k <= n; k++) sum += series[(((this.sec - k) % len) + len) % len];
    return (sum * 60) / n;
  }

  made(id: ItemId, window = 60) {
    return this.rate(this.prod[id], window);
  }

  used(id: ItemId, window = 60) {
    return this.rate(this.cons[id], window);
  }

  /* ---------------------------------------------------------------- bottlenecks */

  private analyze() {
    const found = new Map<Ref, Bottleneck>();
    const chain = new Set<Ref>();
    this.machines.forEach((m, mi) => {
      const out = m.recipe.out as ProductId;
      if (!PRODUCTS.includes(out) || m.built < 1 || m.starve < 0.12) return;
      const path: Ref[] = [`m${mi}`];
      const root = this.traceMachine(mi, path, 0);
      if (!root) return;
      path.forEach((p) => chain.add(p));
      const prev = found.get(root.ref);
      if (prev) {
        if (!prev.products.includes(out)) prev.products.push(out);
        prev.severity += m.starve;
      } else found.set(root.ref, { ...root, products: [out], severity: m.starve });
    });
    this.bottlenecks = [...found.values()].sort((a, b) => b.severity - a.severity);
    this.chain = chain;
    // log the top bottleneck once it has held for a few seconds
    const top = this.bottlenecks[0]?.ref ?? 'none';
    if (top !== this.lastTop) {
      this.lastTop = top;
      this.topSince = this.sec;
    }
    if (this.sec - this.topSince === 4 && top !== this.logged) {
      this.logged = top;
      const b = this.bottlenecks[0];
      if (b) this.note(`Bottleneck: ${b.name}. ${b.reason}`, 'warn');
      else this.note('No bottleneck: every product line runs at full speed.', 'ok');
    }
  }

  private traceMachine(
    mi: number,
    path: Ref[],
    depth: number,
  ): Omit<Bottleneck, 'products' | 'severity'> | null {
    const m = this.machines[mi];
    let short: ItemId | null = null;
    let worst = 0;
    for (const [id] of m.recipe.inputs) {
      if ((m.starveBy[id] ?? 0) > worst) {
        worst = m.starveBy[id] ?? 0;
        short = id;
      }
    }
    if (!short || depth > 8) return null;
    const ins = this.inserters.find(
      (i) =>
        i.owner === mi &&
        i.to.kind === 'machine' &&
        i.from.kind === 'belt' &&
        this.belts[i.from.i].item === short,
    );
    if (!ins || ins.from.kind !== 'belt') return null;
    return this.traceBelt(ins.from.i, short, path, depth + 1);
  }

  private traceBelt(
    bi: number,
    item: ItemId,
    path: Ref[],
    depth: number,
  ): Omit<Bottleneck, 'products' | 'severity'> | null {
    const b = this.belts[bi];
    path.push(`b${bi}`);
    if (!b.on)
      return {
        ref: `b${bi}`,
        group: [`b${bi}`],
        name: `a disabled ${ITEMS[b.item].name.toLowerCase()} belt`,
        reason: 'Its circuit condition is off, so nothing moves on it.',
        short: item,
      };
    const feeders = b.feeders.filter((f) => {
      if (f.kind === 'drill') return this.drills[f.i].built >= 1 && this.drills[f.i].res === item;
      if (f.kind === 'machine')
        return this.machines[f.i].built >= 1 && this.machines[f.i].recipe.out === item;
      if (f.kind === 'belt')
        return this.belts[f.i].item === item || this.belts[f.i].items.some((x) => x.item === item);
      return true;
    });
    const splitter = feeders.find((f) => f.kind === 'splitter');
    if (splitter && splitter.side !== undefined) {
      const s = this.splitters[splitter.i];
      const favoursOther =
        (s.mode === 1 && splitter.side === 1) || (s.mode === 2 && splitter.side === 0);
      path.push(`s${splitter.i}`);
      if (favoursOther)
        return {
          ref: `s${splitter.i}`,
          group: [`s${splitter.i}`],
          name: `the ${ITEMS[item].name.toLowerCase()} splitter`,
          reason: `It favours ${s.names[splitter.side === 0 ? 1 : 0]}, so ${s.names[splitter.side]} only gets the leftovers.`,
          short: item,
        };
      return this.traceBelt(s.input, item, path, depth + 1);
    }
    const side = feeders.find((f) => f.kind === 'belt');
    if (side) return this.traceBelt(side.i, item, path, depth + 1);
    const machines = feeders.filter((f) => f.kind === 'machine').map((f) => f.i);
    if (machines.length) {
      const busy = machines.filter((i) => this.machines[i].work >= 0.85);
      if (busy.length === machines.length) {
        machines.forEach((i) => path.push(`m${i}`));
        const name = ITEMS[item].name.toLowerCase();
        return {
          ref: `m${machines[0]}`,
          group: machines.map((i) => `m${i}`),
          name: machines.length > 1 ? `the ${name} assemblers` : `the ${name} assembler`,
          reason: `${machines.length > 1 ? 'Both run' : 'It runs'} flat out at ${Math.round((60 / this.machines[machines[0]].recipe.time) * machines.length)} ${name}/min and the products want more.`,
          short: item,
        };
      }
      const starved = machines.reduce(
        (a, i) => (this.machines[i].starve > this.machines[a].starve ? i : a),
        machines[0],
      );
      path.push(`m${starved}`);
      return this.traceMachine(starved, path, depth + 1);
    }
    const drills = feeders.filter((f) => f.kind === 'drill').map((f) => f.i);
    if (drills.length) {
      drills.forEach((i) => path.push(`d${i}`));
      return {
        ref: `d${drills[0]}`,
        group: drills.map((i) => `d${i}`),
        name: `${drills.length > 1 ? 'the drills' : 'the drill'} on ${ITEMS[item].name}`,
        reason: `Mining tops out at ${Math.round((60 / MINE_TIME) * drills.length)} ${ITEMS[item].name}/min.`,
        short: item,
      };
    }
    return null;
  }

  /* ---------------------------------------------------------------- player actions */

  note(text: string, level: LogEntry['level'] = 'info') {
    this.log.unshift({ n: ++this.logN, t: this.t, text, level });
    this.log.length = Math.min(this.log.length, 12);
  }

  toggleBelt(i: number) {
    const b = this.belts[i];
    b.on = !b.on;
    this.version++;
    this.note(
      `${b.on ? 'Enabled' : 'Disabled'} the ${ITEMS[b.item].name.toLowerCase()} belt.`,
      b.on ? 'ok' : 'warn',
    );
  }

  cycleSplitter(i: number) {
    const s = this.splitters[i];
    s.mode = ((s.mode + 1) % 3) as Mode;
    this.version++;
    this.note(
      `Rotated the ${ITEMS[this.belts[s.input].item].name.toLowerCase()} splitter: ${modeLabel(s)}.`,
    );
  }

  build(ref: Ref) {
    const kind = ref[0],
      i = Number(ref.slice(1));
    const e = kind === 'm' ? this.machines[i] : kind === 'd' ? this.drills[i] : null;
    if (!e || e.built > 0 || e.building) return false;
    e.building = true;
    this.version++;
    this.note(
      `Placed a ${kind === 'm' ? 'ghost assembler' : 'ghost drill'}. Construction started.`,
    );
    return true;
  }

  /** Finishes construction at once, for reduced motion. */
  finishBuilds() {
    for (const e of [...this.machines, ...this.drills])
      if (e.building && e.built < 1) e.built = 0.999;
  }

  shippedPerMin() {
    return this.docks.reduce((a, d) => a + this.rate(d.ring), 0);
  }
}

export const modeLabel = (s: Splitter) =>
  s.mode === 0
    ? `balanced between ${s.names[0]} and ${s.names[1]}`
    : `favours ${s.names[s.mode - 1]}`;

/** Clears the log after the warm-up, keeping what the bottleneck finder knows. */
export function freshLog(f: Factory, text: string) {
  f.log.length = 0;
  f.note(text);
}

export const isProduct = (id: ItemId): id is ProductId => (PRODUCTS as ItemId[]).includes(id);
