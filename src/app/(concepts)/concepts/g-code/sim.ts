// The controller's interpolator for the Toolpath concept. A Machine walks a Program block by
// block at the programmed feeds (scaled by the overrides) and keeps what the cut leaves
// behind: grooves and holes for the renderer, a short heat history, and chips.

import {
  RAPID,
  cutWidth,
  estimate,
  type Block,
  type Move,
  type Program,
  type Tool,
  type V3,
} from './gcode';

/** Seconds a fresh cut takes to cool from white-hot back to bare metal. */
export const COOL = 1.6;

export interface Cursor {
  b: number;
  m: number;
  /** Millimetres into the current move. */
  d: number;
  /** Seconds into the block's dwell. */
  w: number;
}

interface Stamp {
  b: number;
  m: number;
  t0: number;
  t1: number;
}

export interface Chip {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

export interface Hole {
  x: number;
  y: number;
  r: number;
}

export type CutStyle = 'groove' | 'faced' | 'floor';

export const styleOf = (tool: Tool): CutStyle =>
  tool.kind === 'vbit' ? 'groove' : tool.kind === 'face' ? 'faced' : 'floor';

/** The point `d` millimetres along a move. */
export function along(mv: Move, d: number): V3 {
  if (d <= 0) return mv.pts[0];
  if (d >= mv.len) return mv.pts[mv.pts.length - 1];
  let i = 1;
  while (i < mv.cum.length - 1 && mv.cum[i] < d) i++;
  const a = mv.pts[i - 1],
    b = mv.pts[i];
  const k = (d - mv.cum[i - 1]) / (mv.cum[i] - mv.cum[i - 1] || 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Calls `seg` for each piece of a move that is below the stock top, up to `upTo` mm. */
export function eachCut(
  mv: Move,
  upTo: number,
  seg: (a: V3, b: V3, from: number, to: number) => void,
) {
  for (let i = 1; i < mv.pts.length && mv.cum[i - 1] < upTo; i++) {
    const end = Math.min(mv.cum[i], upTo);
    const a = mv.pts[i - 1];
    const b = end < mv.cum[i] ? along(mv, end) : mv.pts[i];
    if (b[2] < -1e-4) seg(a[2] < -1e-4 ? a : [a[0], a[1], b[2]], b, mv.cum[i - 1], end);
  }
}

const isPlunge = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3;

export class Machine {
  p: Program;
  c: Cursor = { b: 0, m: 0, d: 0, w: 0 };
  /** Program seconds run so far. */
  elapsed = 0;
  /** Actual spindle speed, which lags the command. */
  rpm = 0;
  load = 0;
  /** Spindle angle, for drawing the flutes. */
  phase = 0;
  recent: Stamp[] = [];
  chips: Chip[] = [];
  /** Finished grooves, by cut style and width, in work coordinates. */
  cuts = new Map<string, Path2D>();
  holes: Hole[] = [];
  private baked = 0;

  constructor(p: Program) {
    this.p = p;
  }

  get done() {
    return this.c.b >= this.p.blocks.length;
  }

  get index() {
    return Math.min(this.c.b, this.p.blocks.length - 1);
  }

  get block(): Block {
    return this.p.blocks[this.index];
  }

  get move(): Move | null {
    return this.done ? null : (this.block.moves[this.c.m] ?? null);
  }

  toolOf(b: Block): Tool {
    return this.p.tools.find((t) => t.t === b.modal.tool) ?? this.p.tools[0];
  }

  get tool() {
    return this.toolOf(this.block);
  }

  pos(): V3 {
    const mv = this.move;
    return mv
      ? along(mv, this.c.d)
      : this.done
        ? this.p.blocks[this.p.blocks.length - 1].end
        : this.block.end;
  }

  /** Commanded velocity right now, mm/min. */
  velocity(fro: number, ro: number) {
    const mv = this.move;
    if (!mv) return 0;
    return mv.rapid ? RAPID * ro : mv.feed * fro;
  }

  /** Distance to go in the current move. */
  dtg() {
    const mv = this.move;
    return mv ? mv.len - this.c.d : 0;
  }

  /** Seconds left at the given overrides. */
  left(fro: number, ro: number) {
    if (this.done) return 0;
    const blk = this.block;
    let t = estimate(this.p, this.c.b + 1, fro, ro) + Math.max(0, blk.dwell - this.c.w);
    blk.moves.forEach((mv, i) => {
      if (i < this.c.m) return;
      const len = i === this.c.m ? mv.len - this.c.d : mv.len;
      t += len / ((mv.rapid ? RAPID * Math.max(ro, 0.01) : mv.feed * Math.max(fro, 0.01)) / 60);
    });
    return t;
  }

  reset() {
    this.c = { b: 0, m: 0, d: 0, w: 0 };
    this.elapsed = 0;
    this.recent = [];
    this.chips = [];
    this.cuts = new Map();
    this.holes = [];
    this.drilled = new Set();
    this.baked = 0;
  }

  /** Runs straight to M30, for reduced motion and the finished-part view. */
  finish() {
    while (!this.done) this.step(3600, 1, 1, false);
    this.bake();
    this.recent = [];
    this.chips = [];
    this.rpm = 0;
  }

  /** Moves the cursor on by `dt` seconds. Returns true when single block wants to stop. */
  private step(dt: number, fro: number, ro: number, single: boolean) {
    const blocks = this.p.blocks;
    while (dt > 1e-9 && this.c.b < blocks.length) {
      const blk = blocks[this.c.b];
      if (this.c.m < blk.moves.length) {
        const mv = blk.moves[this.c.m];
        const v = (mv.rapid ? RAPID * ro : mv.feed * fro) / 60;
        if (v <= 0) {
          this.elapsed += dt;
          return false;
        }
        const left = mv.len - this.c.d;
        if (left <= v * dt) {
          dt -= left / v;
          this.elapsed += left / v;
          this.c.m++;
          this.c.d = 0;
        } else {
          this.c.d += v * dt;
          this.elapsed += dt;
          dt = 0;
        }
      } else if (this.c.w < blk.dwell) {
        const left = blk.dwell - this.c.w;
        const used = Math.min(left, dt);
        this.c.w += used;
        this.elapsed += used;
        dt -= used;
      } else {
        this.c = { b: this.c.b + 1, m: 0, d: 0, w: 0 };
        if (single && !/^[(%]/.test(blk.text)) return true;
      }
    }
    return false;
  }

  /**
   * One frame: advance the program (when running), cool the cut, spin the spindle and fly the
   * chips. `now` is wall-clock seconds; `dt` is already scaled by any simulation speed.
   */
  tick(
    dt: number,
    now: number,
    run: { fro: number; ro: number; single: boolean } | null,
    frameDt = dt,
  ) {
    let stopped = false;
    if (run && !this.done) {
      const from = { ...this.c };
      stopped = this.step(dt, run.fro, run.ro, run.single);
      this.stamp(from, now);
      this.bake();
    }
    this.recent = this.recent.filter((s) => s.t1 > now - COOL);

    const blk = this.block;
    const target = !this.done && blk.modal.spindle === 'M3' ? blk.modal.rpm : 0;
    this.rpm += (target - this.rpm) * Math.min(1, frameDt * 2.4);
    if (Math.abs(target - this.rpm) < 5) this.rpm = target;
    this.phase += (this.rpm / 60) * frameDt * 0.02 * Math.PI * 2;

    const mv = this.move;
    const at = this.pos();
    const cutting = !!run && !!mv && !mv.rapid && at[2] < 0 && run.fro > 0;
    this.load +=
      ((cutting
        ? 0.22 + Math.min(0.4, -at[2] * 0.04) + Math.random() * 0.08
        : this.rpm > 0
          ? 0.04
          : 0) -
        this.load) *
      Math.min(1, frameDt * 6);
    if (cutting && mv) this.spray(at, mv, frameDt, run.fro);
    this.fly(frameDt);
    return stopped;
  }

  private stamp(from: Cursor, now: number) {
    const blocks = this.p.blocks;
    let { b, m } = from;
    while (b < blocks.length && (b < this.c.b || (b === this.c.b && m <= this.c.m))) {
      const mv = blocks[b].moves[m];
      if (mv) {
        const last = this.recent[this.recent.length - 1];
        if (last && last.b === b && last.m === m) last.t1 = now;
        else this.recent.push({ b, m, t0: now, t1: now });
        // a drill leaves its hole as soon as the point is below the top
        if (!mv.rapid)
          this.drillAt(
            along(mv, b === this.c.b && m === this.c.m ? this.c.d : mv.len),
            this.toolOf(blocks[b]),
          );
        m++;
      } else {
        b++;
        m = 0;
      }
    }
  }

  /** Folds finished blocks into the cached groove paths. */
  private bake() {
    while (this.baked < Math.min(this.c.b, this.p.blocks.length)) {
      const blk = this.p.blocks[this.baked++];
      const tool = this.toolOf(blk);
      for (const mv of blk.moves) {
        if (mv.rapid) continue;
        this.carve(mv, tool, mv.len);
        this.drillAt(mv.pts[mv.pts.length - 1], tool);
      }
    }
  }

  private drilled = new Set<string>();

  private drillAt(tip: V3, tool: Tool) {
    const key = `${tip[0].toFixed(3)},${tip[1].toFixed(3)}`;
    if (tool.kind !== 'drill' || tip[2] >= 0 || this.drilled.has(key)) return;
    this.drilled.add(key);
    this.holes.push({ x: tip[0], y: tip[1], r: tool.d / 2 });
  }

  /** Adds a cut move (up to `upTo` mm) to the groove paths. Drills leave holes instead. */
  carve(mv: Move, tool: Tool, upTo: number, into?: Map<string, Path2D>) {
    if (tool.kind === 'drill') return;
    eachCut(mv, upTo, (a, b) => {
      const key = `${styleOf(tool)}:${cutWidth(tool, -b[2]).toFixed(3)}`;
      const map = into ?? this.cuts;
      let path = map.get(key);
      if (!path) map.set(key, (path = new Path2D()));
      path.moveTo(a[0], a[1]);
      path.lineTo(b[0] + (isPlunge(a, b) ? 1e-3 : 0), b[1]);
    });
  }

  /** Heat history: each recent cut segment with its age in seconds. */
  heat(now: number, seg: (a: V3, b: V3, age: number, tool: Tool) => void) {
    for (const s of this.recent) {
      const blk = this.p.blocks[s.b];
      const mv = blk.moves[s.m];
      if (!mv || mv.rapid) continue;
      const tool = this.toolOf(blk);
      if (tool.kind === 'drill') continue;
      const current = s.b === this.c.b && s.m === this.c.m;
      const upTo = current ? this.c.d : mv.len;
      eachCut(mv, upTo, (a, b, _from, to) =>
        seg(a, b, now - (s.t0 + (s.t1 - s.t0) * (to / (upTo || 1))), tool),
      );
    }
  }

  private spray(at: V3, mv: Move, dt: number, fro: number) {
    const n = Math.min(
      4,
      Math.random() < dt * 40 * Math.min(1.5, fro) ? 1 + Math.floor(Math.random() * 2) : 0,
    );
    const dir = Math.atan2(
      mv.pts[mv.pts.length - 1][1] - mv.pts[0][1],
      mv.pts[mv.pts.length - 1][0] - mv.pts[0][0],
    );
    for (let i = 0; i < n && this.chips.length < 160; i++) {
      const a =
        dir + Math.PI / 2 + (Math.random() - 0.5) * 2.4 + (Math.random() < 0.5 ? Math.PI : 0);
      const v = 20 + Math.random() * 45;
      this.chips.push({
        x: at[0],
        y: at[1],
        z: 0.2,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: 25 + Math.random() * 50,
        age: 0,
        life: 0.7 + Math.random() * 0.8,
      });
    }
  }

  private fly(dt: number) {
    for (const c of this.chips) {
      c.age += dt;
      if (c.z > 0) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.vz -= 380 * dt;
        if (c.z <= 0) c.z = 0;
      }
    }
    this.chips = this.chips.filter((c) => c.age < c.life);
  }
}
