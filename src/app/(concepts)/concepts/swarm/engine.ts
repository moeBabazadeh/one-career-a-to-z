// The ground control station's brain: it runs the simulation on requestAnimationFrame, flies
// the mission plan in AUTO, takes commands in GUIDED, turns the pointer into a beacon, a no-fly
// zone or a steering handle, and writes telemetry straight into the HUD so a frame never
// re-renders React. With reduced motion there's no loop at all: each command is solved and the
// end state drawn once.
import type { Planner } from './assign';
import {
  Painter,
  View,
  type CamId,
  type Overlay,
  type Pointer,
  type Rect,
  type Theme,
} from './draw';
import { formationOf, waypoints } from './mission';
import { CRASHED, DESCEND, FLY, LANDED, N, Swarm, type PlanStats, type Tool } from './sim';

export type Mode = 'DISARMED' | 'AUTO' | 'GUIDED' | 'RTL';
type Phase = 'ground' | 'climb' | 'transit' | 'hold' | 'rtl';

export interface LogEntry {
  id: number;
  t: string;
  kind: 'sys' | 'wp' | 'cmd' | 'warn';
  text: string;
}

export interface Hooks {
  waypoint(i: number): void;
  mode(m: Mode): void;
  log(e: LogEntry): void;
}

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const PLANNER: Record<Planner, string> = {
  optimal: 'Hungarian, min Σd²',
  greedy: 'greedy, nearest free slot',
};

export class Engine {
  readonly swarm = new Swarm();
  readonly view = new View();
  private painter: Painter;
  private ctx: CanvasRenderingContext2D | null;
  private dpr = 1;
  private frame = 0;
  private last = 0;
  private hudAt = 0;
  private logId = 0;
  private phase: Phase = 'ground';
  private pending: number | 'scatter' | null = null;
  private wp: number | null = null;
  private auto = false;
  private holdStart = 0;
  private planEnd = 0;
  private restartAt = 0;
  private started = false;
  private missionStart: number | null = null;
  private mode: Mode = 'DISARMED';
  private labelAlpha = 0;
  private active = false;
  private hudEls: HTMLElement[] = [];
  private dwellEls: HTMLElement[] = [];
  private pulseUntil = 0;
  private drag: {
    x: number;
    y: number;
    moved: number;
    type: string;
    P0: { x: number; y: number; z: number };
    off0: { x: number; y: number; z: number };
  } | null = null;
  reduced = false;
  planner: Planner = 'optimal';
  overlay: Overlay = { paths: true, labels: true };
  pointer: Pointer = { x: 0, y: 0, inside: false, active: false, tool: 'attract' };

  constructor(
    private root: HTMLElement,
    private canvas: HTMLCanvasElement,
    theme: Theme,
    private hooks: Hooks,
  ) {
    this.ctx = canvas.getContext('2d');
    this.painter = new Painter(theme);
    this.hudEls = [...root.querySelectorAll<HTMLElement>('[data-hud]')];
    this.dwellEls = [...root.querySelectorAll<HTMLElement>('[data-dwell]')];
    this.resize();
  }

  /* ------------------------------------------------------------------ lifecycle */

  destroy() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  setTheme(theme: Theme) {
    this.painter.setTheme(theme);
    this.render();
  }

  /** Fits the canvas to its box and keeps the camera's framing clear of the panels over it. */
  resize() {
    const c = this.canvas;
    const w = c.clientWidth || 800,
      h = c.clientHeight || 500;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    const box = c.getBoundingClientRect();
    const safe: Rect = { x0: 0, y0: 0, x1: w, y1: h };
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-avoid]')) {
      const r = el.getBoundingClientRect();
      if (
        !r.width ||
        !r.height ||
        r.right <= box.left ||
        r.left >= box.right ||
        r.bottom <= box.top ||
        r.top >= box.bottom
      )
        continue;
      const side = el.dataset.avoid;
      if (side === 'left') safe.x0 = Math.max(safe.x0, r.right - box.left + 8);
      else if (side === 'right') safe.x1 = Math.min(safe.x1, r.left - box.left - 8);
      else if (side === 'top') safe.y0 = Math.max(safe.y0, r.bottom - box.top + 4);
      else if (side === 'bottom') safe.y1 = Math.min(safe.y1, r.top - box.top - 4);
    }
    if (safe.x1 - safe.x0 < w * 0.4) {
      safe.x0 = 0;
      safe.x1 = w;
    }
    this.view.resize(w, h, safe);
    this.render();
  }

  /** Runs the loop while the station is on screen (and motion is welcome). */
  setActive(on: boolean) {
    this.active = on;
    if (on && !this.started) {
      this.started = true;
      if (this.reduced) {
        this.boot();
        return;
      }
      this.log('sys', `Ground station online. ${N} drones on the pads, all links green.`);
      this.auto = true;
      this.launch(0);
    }
    this.loop();
  }

  setReduced(on: boolean) {
    this.reduced = on;
    if (on) {
      this.auto = false;
      if (this.started) this.settle();
      this.emitMode();
    }
    this.loop();
    this.render();
  }

  /** Reduced motion: no takeoff to watch, the first formation is simply there. */
  private boot() {
    this.log(
      'sys',
      `Ground station online. Reduced motion: formations are shown in place, without flight.`,
    );
    this.launch(0);
    this.settle();
  }

  private loop() {
    const run = this.active && !this.reduced;
    if (run && !this.frame) {
      this.last = 0;
      const tick = (ms: number) => {
        const dt = this.last ? Math.min(0.05, (ms - this.last) / 1000) : 0;
        this.last = ms;
        this.update(dt);
        this.draw(dt);
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    } else if (!run && this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  /** One frame, outside the loop (reduced motion, a resize, a theme change). */
  render() {
    if (this.frame) return;
    requestAnimationFrame(() => {
      if (this.frame) return;
      this.view.ease(0, true);
      this.labelAlpha = this.labelTarget();
      this.draw(0);
      this.writeHud(true);
    });
  }

  /* ------------------------------------------------------------------ the mission */

  private log(kind: LogEntry['kind'], text: string) {
    const t = this.missionStart === null ? 'T+00:00' : clock(this.swarm.t - this.missionStart);
    this.hooks.log({ id: ++this.logId, t, kind, text });
  }

  private emitMode() {
    const m: Mode =
      this.phase === 'rtl'
        ? 'RTL'
        : this.auto
          ? 'AUTO'
          : this.phase === 'ground'
            ? 'DISARMED'
            : 'GUIDED';
    if (m !== this.mode) {
      this.mode = m;
      this.hooks.mode(m);
    }
  }

  private planLine(p: PlanStats) {
    const plan =
      p.kind === 'scatter'
        ? 'no slot assignment'
        : `${PLANNER[p.planner]} in ${p.ms.toFixed(1)} ms`;
    return `${p.moving} drones moving · ${km(p.total)} flown in all, longest leg ${km(p.longest)} · ${p.seconds.toFixed(1)} s · ${plan} · ${p.conflicts} predicted conflict${p.conflicts === 1 ? '' : 's'}`;
  }

  /** Takes off first if anything is on the ground, then flies `next`. */
  private launch(next: number | 'scatter') {
    if (this.swarm.count(LANDED) > 0) {
      const p = this.swarm.takeoff();
      this.pending = next;
      this.phase = 'climb';
      if (this.missionStart === null) this.missionStart = this.swarm.t;
      this.log('sys', `Armed. Takeoff: ${p.moving} drones climbing to hover.`);
      this.emitMode();
      return;
    }
    this.go(next);
  }

  private go(next: number | 'scatter') {
    if (next === 'scatter') {
      const p = this.swarm.scatter();
      this.wp = null;
      this.phase = 'transit';
      this.planEnd = this.swarm.t + p.seconds;
      this.log('cmd', `Scatter: every drone breaks away from the centre. ${this.planLine(p)}.`);
    } else {
      const f = formationOf(next);
      const p = this.swarm.form(f, this.planner);
      const w = waypoints[next];
      this.wp = next;
      this.phase = 'transit';
      this.planEnd = this.swarm.t + p.seconds;
      this.hooks.waypoint(next);
      this.log(
        'wp',
        `${w.code} ${w.title}: ${p.slots} in formation, ${p.standby} on standby. ${this.planLine(p)}.`,
      );
    }
    this.emitMode();
  }

  private rtl() {
    const p = this.swarm.land(this.planner);
    this.phase = 'rtl';
    this.wp = null;
    this.log(
      'cmd',
      `Return to launch: ${p.moving} drones assigned a pad each. ${this.planLine(p)}.`,
    );
    this.emitMode();
  }

  private next(by = 1) {
    const from = this.wp ?? -1;
    const to = from + by;
    if (to >= waypoints.length) this.rtl();
    else this.launch(Math.max(0, to));
  }

  /** The phase machine, without physics: what happens when a plan is done. */
  private advance() {
    const sw = this.swarm;
    if (this.phase === 'climb' && sw.settled(1)) {
      const next = this.pending;
      this.pending = null;
      if (next !== null) this.go(next);
      else this.phase = 'hold';
    } else if (this.phase === 'transit' && (sw.settled(0.9) || sw.t > this.planEnd + 3)) {
      this.phase = 'hold';
      this.holdStart = sw.t;
      if (this.wp !== null) {
        const tm = sw.telemetry();
        this.log(
          'wp',
          `${waypoints[this.wp].code} holding: ${tm.inSlot} of ${tm.slots} drones in their slots, closest pair ${Number.isFinite(tm.minSep) ? tm.minSep.toFixed(1) : '—'} m apart.`,
        );
      }
    } else if (
      this.phase === 'hold' &&
      this.auto &&
      this.wp !== null &&
      !this.pointer.active &&
      sw.t > this.pulseUntil &&
      sw.t - this.holdStart > waypoints[this.wp].dwell
    ) {
      this.next();
    } else if (this.phase === 'rtl') {
      let up = 0;
      for (let i = 0; i < N; i++) if (sw.state[i] === FLY || sw.state[i] === DESCEND) up++;
      if (!up) {
        this.phase = 'ground';
        this.log('sys', `All drones on their pads. Motors off, charging.`);
        const lost = sw.recover();
        if (lost)
          this.log(
            'warn',
            `Ground crew recovered ${lost} downed drone${lost === 1 ? '' : 's'} and set them on free pads.`,
          );
        this.restartAt = sw.t + 6;
        this.emitMode();
      }
    } else if (this.phase === 'ground' && this.auto && sw.t > this.restartAt) {
      this.log('sys', 'Mission restarts from the top.');
      this.launch(0);
    }
  }

  /** Reduced motion: solve every pending plan and jump to its end. */
  private settle() {
    for (let k = 0; k < 6; k++) {
      this.swarm.snap();
      const before = this.phase;
      this.advance();
      if (this.phase === before && (this.phase === 'hold' || this.phase === 'ground')) break;
    }
    this.render();
  }

  private update(dt: number) {
    const sw = this.swarm;
    const events = sw.step(dt);
    for (const e of events)
      this.log('warn', `${e.charAt(0).toUpperCase()}${e.slice(1)}. Collision avoidance is off.`);
    if (this.pointer.active && this.drag === null && sw.t > this.pulseUntil) {
      sw.pointer.on = false;
      this.pointer.active = false;
    }
    if (this.pointer.active && this.phase === 'hold') this.holdStart += dt;
    this.advance();
  }

  private labelTarget() {
    const f = this.swarm.formation;
    if (!f || this.wp === null) return 0;
    if (this.phase === 'hold') return 1;
    const tm = this.swarm.telemetry();
    return tm.slots && tm.inSlot / tm.slots > 0.85 ? 1 : 0;
  }

  private draw(dt: number) {
    if (!this.ctx) return;
    if (dt) {
      this.view.ease(dt, false);
      const target = this.labelTarget();
      this.labelAlpha += (target - this.labelAlpha) * (1 - Math.exp(-dt * 5));
    }
    const hover =
      this.pointer.inside && !this.pointer.active
        ? this.painter.pick(this.view, this.swarm, this.pointer.x, this.pointer.y)
        : -1;
    this.painter.paint(
      this.ctx,
      this.view,
      this.swarm,
      this.dpr,
      this.overlay,
      this.pointer,
      this.labelAlpha,
      hover,
    );
    this.writeHud(false);
  }

  /* ------------------------------------------------------------------ telemetry into the HUD */

  private writeHud(force: boolean) {
    const now = performance.now();
    if (!force && now - this.hudAt < 200) return;
    this.hudAt = now;
    const sw = this.swarm;
    const tm = sw.telemetry();
    const w = this.wp !== null ? waypoints[this.wp] : null;
    const values: Record<string, string> = {
      clock: this.missionStart === null ? 'T+00:00' : clock(sw.t - this.missionStart),
      wp:
        this.phase === 'rtl'
          ? 'RTL'
          : this.phase === 'ground'
            ? 'ON PADS'
            : w
              ? w.code
              : this.phase === 'climb'
                ? 'TAKEOFF'
                : 'SCATTER',
      airborne: `${tm.airborne}`,
      slots: tm.slots ? `${tm.inSlot}/${tm.slots}` : '—',
      standby: `${tm.standby}`,
      lost: `${tm.lost}`,
      alt: `${tm.alt.toFixed(1)} m`,
      altMax: `${tm.altMax.toFixed(0)} m`,
      speed: `${tm.speed.toFixed(1)} m/s`,
      battery: `${Math.round(tm.battery)}%`,
      batteryMin: `${Math.round(tm.batteryMin)}%`,
      link: `${Math.round(tm.link * 100)}%`,
      sep: Number.isFinite(tm.minSep) && tm.airborne > 1 ? `${tm.minSep.toFixed(1)} m` : '—',
      near: `${tm.nearMisses}`,
      hits: `${tm.collisions}`,
    };
    for (const el of this.hudEls) {
      const key = el.dataset.hud as string;
      const v = values[key];
      if (v !== undefined && el.textContent !== v) el.textContent = v;
      if (key === 'battery') el.toggleAttribute('data-warn', tm.batteryMin < 25);
      if (key === 'lost' || key === 'hits')
        el.toggleAttribute('data-warn', key === 'lost' ? tm.lost > 0 : tm.collisions > 0);
      if (key === 'link') el.toggleAttribute('data-warn', tm.link < 0.8);
    }
    // How far through its hold the current waypoint is, for the plan list.
    const p =
      this.phase === 'hold' && this.auto && w ? Math.min(1, (sw.t - this.holdStart) / w.dwell) : 0;
    for (const el of this.dwellEls) {
      const mine = Number(el.dataset.dwell) === this.wp;
      el.style.setProperty('--p', mine ? p.toFixed(3) : '0');
    }
  }

  /* ------------------------------------------------------------------ commands */

  fly(i: number) {
    this.auto = false;
    this.launch(i);
    this.after();
  }

  step(by: 1 | -1) {
    this.auto = false;
    const to = (this.wp ?? (by > 0 ? -1 : waypoints.length)) + by;
    this.launch(Math.min(waypoints.length - 1, Math.max(0, to)));
    this.after();
  }

  scatter() {
    this.auto = false;
    this.launch('scatter');
    this.after();
  }

  land() {
    this.auto = false;
    if (this.phase === 'ground' && this.swarm.count(FLY) === 0) {
      this.log('cmd', 'Already on the pads.');
      this.emitMode();
      return;
    }
    this.rtl();
    this.after();
  }

  toggleAuto() {
    if (this.reduced) return;
    this.auto = !this.auto;
    if (this.auto) {
      this.log('cmd', 'AUTO: flying the mission plan.');
      if (this.phase === 'ground') this.launch(this.wp === null ? 0 : this.wp);
      else if (this.phase === 'hold') {
        if (this.wp === null) this.next();
        else this.holdStart = this.swarm.t;
      }
    } else this.log('cmd', 'GUIDED: holding here. Pick a waypoint or steer.');
    this.emitMode();
  }

  setPlanner(p: Planner) {
    this.planner = p;
    this.log('cmd', `Slot assignment: ${PLANNER[p]}. Applies from the next formation.`);
  }

  setAvoidance(on: boolean) {
    this.swarm.avoidance = on;
    this.log(
      on ? 'cmd' : 'warn',
      on
        ? 'Collision avoidance on.'
        : 'Collision avoidance OFF. Drones fly their legs blind to each other.',
    );
  }

  setWind(level: number) {
    this.swarm.wind = level;
    this.log('cmd', `Wind: ${['calm', 'breeze', 'gusty'][level]}.`);
  }

  setCamera(id: CamId) {
    this.view.setPreset(id);
    if (this.reduced || !this.frame) {
      this.view.ease(0, true);
      this.render();
    }
  }

  setTool(tool: Tool) {
    this.pointer.tool = tool;
    this.swarm.pointer.tool = tool;
    this.render();
  }

  setOverlay(o: Overlay) {
    this.overlay = o;
    this.render();
  }

  /** Steering by keyboard: nudges the formation's offset. */
  nudge(dx: number, dz: number) {
    const t = this.swarm.offTarget;
    t.x = Math.max(-18, Math.min(18, t.x + dx));
    t.z = Math.max(-14, Math.min(14, t.z + dz));
    this.after(true);
  }

  center() {
    this.swarm.offTarget = { x: 0, y: 0, z: 0 };
    this.after(true);
  }

  /** After a command: with reduced motion, solve it now and draw the result. */
  private after(steer = false) {
    if (!this.reduced) return;
    if (steer) this.swarm.off = { ...this.swarm.offTarget };
    this.settle();
  }

  /* ------------------------------------------------------------------ the pointer */

  pointerMove(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = true;
    const d = this.drag;
    if (d) {
      d.moved += Math.hypot(x - d.x, y - d.y);
      d.x = x;
      d.y = y;
      this.aim(x, y);
    }
    if (this.reduced) this.reducedPointer();
  }

  pointerLeave() {
    this.pointer.inside = false;
    if (this.reduced) this.render();
  }

  pointerDown(x: number, y: number, type: string) {
    const P = this.view.unproject(x, y);
    this.pointer = { ...this.pointer, x, y, inside: true, active: true };
    this.drag = {
      x,
      y,
      moved: 0,
      type,
      P0: { x: P.x, y: P.y, z: P.z },
      off0: { ...this.swarm.offTarget },
    };
    this.aim(x, y);
    if (this.reduced) this.reducedPointer();
  }

  pointerUp() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const tool = this.pointer.tool;
    // A tap on a touch screen leaves the beacon (or the no-fly zone) up for a moment.
    if (d.moved < 8 && tool !== 'steer' && d.type !== 'mouse') {
      this.pulseUntil = this.swarm.t + 1.8;
      return;
    }
    if (tool !== 'steer') {
      this.swarm.pointer.on = false;
      this.pointer.active = false;
    } else this.pointer.active = false;
    if (this.reduced) this.reducedPointer();
  }

  private aim(x: number, y: number) {
    const P = this.view.unproject(x, y);
    const sw = this.swarm;
    if (this.pointer.tool === 'steer') {
      const d = this.drag;
      if (!d) return;
      sw.offTarget = {
        x: Math.max(-18, Math.min(18, d.off0.x + P.x - d.P0.x)),
        y: Math.max(-24, Math.min(24, d.off0.y + P.y - d.P0.y)),
        z: Math.max(-14, Math.min(14, d.off0.z + P.z - d.P0.z)),
      };
      sw.pointer.on = false;
      return;
    }
    sw.pointer = { on: true, tool: this.pointer.tool, x: P.x, y: P.y, z: P.z };
  }

  /** Reduced motion: the pointer's effect is shown as a still, with no flight in between. */
  private reducedPointer() {
    this.swarm.off = { ...this.swarm.offTarget };
    if (this.phase === 'hold' || this.phase === 'transit') this.swarm.snap();
    this.render();
  }

  get crashed() {
    return this.swarm.count(CRASHED);
  }
}
