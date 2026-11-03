// The rally: rules, scoring, the bot, your paddle and the record of the last point. The ball's
// flight is ./sim; this decides who may hit it, what a hit does, and who wins the point. Runs on
// a fixed 240 Hz step, outside React: the page only hears about events (a hit, a landing, a point).
import {
  DT,
  HL,
  HW,
  R,
  cloneBall,
  copy,
  kmh,
  predict,
  rpm,
  solveServe,
  solveShot,
  spinFor,
  spinParts,
  step,
  v3,
  type Ball,
  type Hit,
  type V3,
} from './sim';

export type Side = 'you' | 'bot';
export type Level = 'feed' | 'spar' | 'match';
export type ServeSpin = 'top' | 'flat' | 'back' | 'side';
export type Phase = 'ready' | 'toss' | 'live' | 'dead';
export type Call = 'Long' | 'Wide' | 'Net' | 'Missed' | 'Fault' | 'Let';

export interface LevelSpec {
  label: string;
  hint: string;
  /** Seconds before it starts to move. */
  react: number;
  /** How fast its paddle travels, m/s. */
  speed: number;
  /** How far from its paddle's centre it still makes contact, m. */
  reach: number;
  pace: [number, number];
  /** Topspin (+) or backspin (−), rad/s. */
  top: [number, number];
  /** How wide it places the ball, as a share of the half-width. */
  spread: number;
  /** How deep, metres past the net. */
  depth: [number, number];
  /** Its own error, m. */
  err: number;
  /** How often it aims away from you. */
  away: number;
}

export const LEVELS: Record<Level, LevelSpec> = {
  feed: {
    label: 'Feeder',
    hint: 'puts every ball back where your paddle is, at an easy pace',
    react: 0.16,
    speed: 5,
    reach: 0.26,
    pace: [5, 6.6],
    top: [50, 130],
    spread: 0.1,
    depth: [0.6, 0.95],
    err: 0.02,
    away: 0,
  },
  spar: {
    label: 'Sparring',
    hint: 'moves you around and mixes in backspin',
    react: 0.13,
    speed: 4,
    reach: 0.2,
    pace: [6.4, 10],
    top: [-170, 300],
    spread: 0.45,
    depth: [0.45, 1.12],
    err: 0.05,
    away: 0.4,
  },
  match: {
    label: 'Match',
    hint: 'plays to win, with wide angles, heavy spin and short drops',
    react: 0.09,
    speed: 4.8,
    reach: 0.18,
    pace: [8.5, 14],
    top: [-280, 460],
    spread: 0.62,
    depth: [0.32, 1.24],
    err: 0.075,
    away: 0.8,
  },
};

export const SPINS: Record<ServeSpin, { label: string; top: number; side: number }> = {
  top: { label: 'Topspin', top: 180, side: 0 },
  flat: { label: 'Flat', top: 0, side: 0 },
  back: { label: 'Backspin', top: -220, side: 0 },
  side: { label: 'Sidespin', top: -40, side: 190 },
};

/* ------------------------------------------------------------------ zones */

/** The far half in a 3 × 3 grid: rows short, half-long, long from the net; columns left to right as you see them. */
export const ROWS = ['short', 'half-long', 'long'] as const;
export const COLS = ['left', 'middle', 'right'] as const;

/** A zone's index, row × 3 + column, for a point on the bot's half. */
export function zoneAt(x: number, y: number): number {
  const col = x < -HW / 3 ? 0 : x > HW / 3 ? 2 : 1;
  const row = y < HL / 3 ? 0 : y < (2 * HL) / 3 ? 1 : 2;
  return row * 3 + col;
}

/** The middle of a zone on the bot's half. */
export const zoneCentre = (zone: number) => ({
  x: ((zone % 3) - 1) * ((2 * HW) / 3),
  y: (Math.floor(zone / 3) + 0.5) * (HL / 3),
});

export const zoneName = (zone: number) => `${ROWS[Math.floor(zone / 3)]}, ${COLS[zone % 3]}`;

/* ------------------------------------------------------------------ randomness */

/** Seeded, so a rally is the same rally for the same play. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------------------------ shapes */

export interface Paddle {
  p: V3;
  /** Where it was over the last frames, for swept contact; sx and sz are the same pointer read on a fixed plane, for the swing. */
  trail: { t: number; x: number; z: number; sx: number; sz: number }[];
  /** Face angle, radians, for drawing: + turns the face to the right. */
  angle: number;
  /** Seconds since it last struck the ball. */
  since: number;
}

interface Shot {
  by: Side;
  serve: boolean;
  /** A serve has bounced on the server's own half. */
  own: boolean;
  /** It has landed on the far half, legally. */
  landed: boolean;
  /** It touched the net on the way. */
  net: boolean;
  /** Where it landed. */
  at: V3 | null;
}

export type GameEvent =
  | { type: 'hit'; by: Side; n: number; kmh: number; rpm: number; top: number; stroke: Stroke }
  | {
      type: 'land';
      zone: number;
      chapter: number;
      fresh: boolean;
      direct: boolean;
      n: number;
      kmh: number;
      rpm: number;
    }
  | { type: 'point'; winner: Side; call: Call; n: number }
  | { type: 'let' }
  | { type: 'game'; winner: Side }
  | { type: 'phase'; phase: Phase; server: Side };

export type Stroke = 'serve' | 'drive' | 'block' | 'chop';

export interface Score {
  you: number;
  bot: number;
  gamesYou: number;
  gamesBot: number;
  server: Side;
}

export interface Mark {
  x: number;
  y: number;
  chapter: number;
  t: number;
}

/** The last point, frame by frame, for the replay. */
export interface Replay {
  /** Stride REC: t, ball xyz, spin xyz, your paddle xyz, the bot's paddle xyz. */
  frames: number[];
  hits: { t: number; kind: Hit['kind'] | 'you' | 'bot'; p: V3 }[];
  call: Call;
  winner: Side;
  duration: number;
}

export const REC = 13;

/** What your paddle is told: a pointer position (already in the hitting plane) or keys. */
export interface Input {
  mode: 'pointer' | 'keys';
  /** Pointer target in the hitting plane, or null if the pointer hasn't been over the table. */
  aim: { x: number; z: number } | null;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Game time a drive or chop key was pressed. */
  drive: number;
  chop: number;
}

export interface Settings {
  level: Level;
  spin: ServeSpin;
  footwork: boolean;
}

/** Your forehand position at rest, and the server's spot. */
const HOME_Y = -1.62;
const SERVE_X = -0.22;
const SWING_WINDOW = 0.2;

/* ------------------------------------------------------------------ the game */

export class Game {
  t = 0;
  ball: Ball = { p: v3(SERVE_X + 0.12, HOME_Y + 0.1, 0.05), v: v3(), w: v3() };
  you: Paddle = { p: v3(SERVE_X, HOME_Y, 0.16), trail: [], angle: 0, since: 9 };
  bot: Paddle = { p: v3(0.1, -HOME_Y, 0.2), trail: [], angle: 0, since: 9 };
  phase: Phase = 'ready';
  score: Score = { you: 0, bot: 0, gamesYou: 0, gamesBot: 0, server: 'you' };
  settings: Settings = { level: 'feed', spin: 'top', footwork: true };
  input: Input = {
    mode: 'pointer',
    aim: null,
    left: false,
    right: false,
    up: false,
    down: false,
    drive: -9,
    chop: -9,
  };
  /** Where your serve is aimed, a zone. */
  serveZone = 4;
  /** Chapters opened, by their order. */
  opened: boolean[];
  /** Zone → chapter. */
  zones: number[];
  events: GameEvent[] = [];
  marks: Mark[] = [];
  /** Recent ball positions for the motion trail. */
  trail: V3[] = [];
  /** The hitting plane you play in: it steps in for short balls and back for deep ones. */
  yp = HOME_Y;
  ypTarget = HOME_Y;
  /** The incoming ball's predicted path, its bounce on your side and where it crosses your plane. */
  incoming: { path: V3[]; bounce: V3; cross: V3; crossI: number; crossT: number } | null = null;
  /** Where your return would land if you met the ball now, with its spread. */
  guide: { x: number; y: number; sd: number; stroke: Stroke } | null = null;
  rally = 0;
  /** When the ball was last put back in the server's hand. */
  readyAt = 0;
  last: Replay | null = null;
  /** How far the unprojected pointer is from plane to plane: set by the page each step. */
  unproject: ((yPlane: number) => { x: number; z: number } | null) | null = null;

  private rng: () => number;
  private acc = 0;
  private shot: Shot | null = null;
  private deadUntil = 0;
  /** When the bot tosses; never, until it is the bot's serve. */
  private serveAt = Infinity;
  private servesLeft = 2;
  private firstServer: Side = 'you';
  private pendingLet = false;
  private plan: { at: V3; react: number } | null = null;
  private rec: number[] = [];
  private recHits: Replay['hits'] = [];
  private pointStart = 0;
  private lastHitAt = 0;
  private tick = 0;
  private prevBall = v3();
  /** Where the ball last fell below the table's height: past the end line is long, else wide. */
  private dropAt = v3();

  constructor(zones: number[], chapters: number, seed = 0x5eed) {
    this.zones = zones;
    this.opened = Array.from({ length: chapters }, () => false);
    this.rng = prng(seed);
    this.serveZone = zones.indexOf(0);
  }

  private gauss() {
    const u = Math.max(1e-9, this.rng());
    const v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private range([a, b]: [number, number]) {
    return lerp(a, b, this.rng());
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  /** The first chapter not yet opened, by order, or −1. */
  nextChapter() {
    return this.opened.indexOf(false);
  }

  /** Aims your serve at the next unread chapter's zone. */
  aimAtNext() {
    const next = this.nextChapter();
    if (next >= 0) this.serveZone = this.zones.indexOf(next);
  }

  reset() {
    this.opened.fill(false);
    this.marks = [];
    this.score = { you: 0, bot: 0, gamesYou: 0, gamesBot: 0, server: 'you' };
    this.servesLeft = 2;
    this.firstServer = 'you';
    this.rally = 0;
    this.last = null;
    this.toReady();
    this.aimAtNext();
  }

  /** Advances real time by `dt` seconds in fixed steps. */
  advance(dt: number) {
    this.acc += Math.min(dt, 0.05);
    let n = 0;
    while (this.acc >= DT && n < 14) {
      this.stepOnce();
      this.acc -= DT;
      n++;
    }
  }

  /* -------------------------------------------------------------- serving */

  /** Holds the ball in the server's hand. */
  private toReady() {
    this.phase = 'ready';
    this.readyAt = this.t;
    this.shot = null;
    this.incoming = null;
    this.guide = null;
    this.plan = null;
    this.rally = 0;
    this.trail = [];
    this.yp = this.ypTarget = HOME_Y;
    this.holdBall();
    this.serveAt = this.score.server === 'bot' ? this.t + 1.1 : Infinity;
    this.rec = [];
    this.recHits = [];
    this.pointStart = this.t;
    this.emit({ type: 'phase', phase: 'ready', server: this.score.server });
  }

  private holdBall() {
    const bot = this.score.server === 'bot';
    const x = bot ? -SERVE_X : SERVE_X;
    this.ball = {
      p: v3(x + (bot ? -0.1 : 0.1), bot ? -HOME_Y - 0.08 : HOME_Y + 0.08, 0.1),
      v: v3(),
      w: v3(),
    };
  }

  /** Your serve, if it's yours to take. */
  serve(zone?: number) {
    if (this.phase !== 'ready' || this.score.server !== 'you') return false;
    if (zone !== undefined) this.serveZone = zone;
    this.toss();
    return true;
  }

  private toss() {
    this.holdBall();
    this.ball.v = v3(0, 0, 1.9);
    this.phase = 'toss';
    this.pointStart = this.t;
    this.emit({ type: 'phase', phase: 'toss', server: this.score.server });
  }

  /** Strikes the tossed ball as it falls past the paddle. */
  private strikeServe() {
    const by = this.score.server;
    const s = by === 'you' ? 1 : -1;
    let row: number;
    let target: { x: number; y: number };
    let spin = SPINS[this.settings.spin];
    if (by === 'you') {
      const c = zoneCentre(this.serveZone);
      row = Math.floor(this.serveZone / 3);
      // a short serve has to drop steeply after the net, so it aims at the back of the short row
      target = { x: c.x + this.gauss() * 0.03, y: Math.max(c.y, 0.34) + this.gauss() * 0.03 };
    } else {
      // the bot serves into your half; a feeder serves long, to where you are
      const lvl = LEVELS[this.settings.level];
      const feed = lvl.away === 0;
      row = feed ? 1 + Math.floor(this.rng() * 2) : Math.floor(this.rng() * 3);
      const x = feed ? clamp(this.you.p.x, -0.5, 0.5) : (this.rng() * 2 - 1) * 0.55;
      target = {
        x: x + this.gauss() * 0.03,
        y: -Math.max((row + 0.5) * (HL / 3), 0.34) + this.gauss() * 0.03,
      };
      const keys = Object.keys(SPINS) as ServeSpin[];
      spin = SPINS[feed ? 'top' : keys[Math.floor(this.rng() * keys.length)]];
    }
    const from = copy(this.ball.p);
    const w = spinFor({ x: 0, y: s }, spin.top, spin.side * s);
    // a spun serve that won't solve cleanly goes flat instead
    const spun = this.solveServeChecked(from, w, s, row, target);
    const flat = spun ? null : this.solveServeChecked(from, v3(), s, row, target);
    this.ball.v = spun ?? flat ?? v3(0, s * 4, 1);
    this.ball.w = spun ? w : v3();
    this.shot = { by, serve: true, own: false, landed: false, net: false, at: null };
    this.phase = 'live';
    this.struck(by, 'serve');
  }

  /**
   * A serve, checked by flying it with the net in the way. Tries a few heights over the net and
   * first guesses, and takes the first that bounces well inside the server's half (not on its end
   * line) and comes down near the target.
   */
  private solveServeChecked(
    from: V3,
    w: V3,
    s: number,
    row: number,
    target: { x: number; y: number },
  ) {
    const bounceY = [-0.75, -0.95, -1.1][row] * s;
    const base = [0.215, 0.23, 0.25][row];
    for (const netZ of [base, base + 0.03, base + 0.07]) {
      for (const k of [1, 1.3, 0.8, 1.6]) {
        const vel = solveServe(from, w, bounceY, target, [3.4, 4.6, 6.2][row] * k, netZ);
        const { hits } = predict({ p: copy(from), v: vel, w: copy(w) }, 2.5, 2);
        if (hits.some((h) => h.kind === 'net' || h.kind === 'tape')) continue;
        const tables = hits.filter((h) => h.kind === 'table');
        if (tables.length !== 2) continue;
        const [a, b] = tables;
        // the path is the real one, so a bounce just inside the end line is still a legal serve
        if (a.p.y * s > -0.1 || a.p.y * s < -(HL - 0.02) || b.p.y * s < 0) continue;
        if (Math.hypot(b.p.x - target.x, b.p.y - target.y) < 0.1) return vel;
      }
    }
    return null;
  }

  /* -------------------------------------------------------------- the step */

  private stepOnce() {
    this.t += DT;
    this.tick++;
    this.movePaddles();

    if (this.phase === 'ready') {
      this.holdBall();
      if (this.t >= this.serveAt) this.toss();
    } else if (this.phase === 'toss') {
      const b = this.ball;
      b.v.z -= 9.81 * DT;
      b.p.z += b.v.z * DT;
      if (b.v.z < 0 && b.p.z <= 0.14) this.strikeServe();
    } else {
      copyInto(this.prevBall, this.ball.p);
      const hit = step(this.ball);
      if (this.prevBall.z >= 0 && this.ball.p.z < 0) copyInto(this.dropAt, this.ball.p);
      if (hit) this.onContact(hit);
      if (this.phase === 'live') this.tryHits();
      if (this.phase === 'live' && this.t - this.lastHitAt > 5)
        this.endPoint(
          this.shot?.landed ? (this.shot.by as Side) : other(this.shot?.by ?? 'you'),
          'Missed',
        );
      if (this.phase === 'dead' && this.t >= this.deadUntil) this.afterPoint();
    }

    if (this.tick % 2 === 0) {
      if (this.phase === 'live' || this.phase === 'dead' || this.phase === 'toss') {
        this.trail.push(copy(this.ball.p));
        if (this.trail.length > 22) this.trail.shift();
      }
      if (this.phase !== 'ready') this.record();
    }
    for (const p of [this.you, this.bot]) p.since += DT;
  }

  private record() {
    const { ball, you, bot } = this;
    if (this.rec.length > REC * 120 * 30) return;
    this.rec.push(
      this.t - this.pointStart,
      ball.p.x,
      ball.p.y,
      ball.p.z,
      ball.w.x,
      ball.w.y,
      ball.w.z,
      you.p.x,
      you.p.y,
      you.p.z,
      bot.p.x,
      bot.p.y,
      bot.p.z,
    );
  }

  /* -------------------------------------------------------------- paddles */

  private movePaddles() {
    const you = this.you;
    const inp = this.input;
    // the hitting plane eases toward where the incoming ball will be best to meet
    this.yp += (this.ypTarget - this.yp) * Math.min(1, DT * 14);
    const cross = this.incoming?.cross ?? null;

    if (this.phase === 'ready' || this.phase === 'toss') {
      // the server stands ready by the ball
      if (this.score.server === 'you') {
        const b = this.ball.p;
        you.p = v3(b.x - 0.1, HOME_Y, this.phase === 'toss' ? Math.max(0.14, b.z) : 0.2);
      } else if (inp.mode === 'pointer' && inp.aim && this.unproject) {
        const a = this.unproject(this.yp);
        if (a) you.p = v3(clamp(a.x, -1.5, 1.5), this.yp, clamp(a.z, -0.3, 0.9));
      }
    } else if (inp.mode === 'pointer') {
      const a = this.unproject?.(this.yp) ?? null;
      if (a)
        you.p = v3(
          clamp(a.x, -1.6, 1.6),
          this.yp,
          clamp(a.z, Math.abs(this.yp) < HL ? 0.04 : -0.3, 0.95),
        );
      else you.p.y = this.yp;
    } else {
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let x = you.p.x;
      if (this.settings.footwork && cross) {
        // auto-footwork: the arrows aim instead, by meeting the ball off-centre
        const want = cross.x - dir * 0.09;
        x += clamp(want - x, -3.2 * DT, 3.2 * DT);
      } else {
        x += dir * 2.6 * DT;
      }
      // height follows the ball when one is coming; the keys don't have to
      const zWant = cross ? cross.z : 0.18;
      const z = you.p.z + (zWant - you.p.z) * Math.min(1, DT * 14);
      you.p = v3(clamp(x, -1.6, 1.6), this.yp, z);
    }
    const ref = inp.mode === 'pointer' ? this.unproject?.(HOME_Y) : null;
    you.trail.push({
      t: this.t,
      x: you.p.x,
      z: you.p.z,
      sx: ref?.x ?? you.p.x,
      sz: ref?.z ?? you.p.z,
    });
    while (you.trail.length && you.trail[0].t < this.t - 0.09) you.trail.shift();
    you.angle += (this.aimAngle() * 0.9 - you.angle) * Math.min(1, DT * 12);

    // the bot's paddle: after its reaction time, straight for the planned contact
    const bot = this.bot;
    const lvl = LEVELS[this.settings.level];
    let goal = v3(
      this.phase === 'ready' && this.score.server === 'bot' ? this.ball.p.x + 0.1 : 0.05,
      -HOME_Y,
      0.2,
    );
    if (this.plan && this.t >= this.plan.react) goal = this.plan.at;
    else if (this.plan) goal = copy(bot.p);
    if (this.phase === 'toss' && this.score.server === 'bot')
      goal = v3(this.ball.p.x + 0.1, -HOME_Y, Math.max(0.1, this.ball.p.z));
    const d = v3(goal.x - bot.p.x, goal.y - bot.p.y, goal.z - bot.p.z);
    const m = Math.hypot(d.x, d.y, d.z);
    const reach = lvl.speed * DT;
    if (m > 1e-6) {
      const k = m > reach ? reach / m : 1;
      bot.p = v3(bot.p.x + d.x * k, bot.p.y + d.y * k, bot.p.z + d.z * k);
    }
    bot.trail.push({ t: this.t, x: bot.p.x, z: bot.p.z, sx: bot.p.x, sz: bot.p.z });
    while (bot.trail.length && bot.trail[0].t < this.t - 0.09) bot.trail.shift();
    bot.angle *= 1 - Math.min(1, DT * 4);
  }

  /** Your paddle's swing over the last few frames, m/s in its plane: x across, z up. */
  private swing(): { x: number; z: number } {
    const inp = this.input;
    if (inp.mode === 'keys') {
      const lat = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * (this.settings.footwork ? 0 : 2.2);
      if (this.t - inp.drive < SWING_WINDOW) return { x: lat, z: 4.6 };
      if (this.t - inp.chop < SWING_WINDOW) return { x: lat, z: -3.2 };
      return { x: lat, z: 0 };
    }
    const tr = this.you.trail;
    if (tr.length < 2) return { x: 0, z: 0 };
    const a = tr[0];
    const b = tr[tr.length - 1];
    const dt = Math.max(0.03, b.t - a.t);
    return { x: (b.sx - a.sx) / dt, z: (b.sz - a.sz) / dt };
  }

  /** The face angle your paddle shows: where on the blade you'd meet the ball. */
  private aimAngle() {
    const cross = this.incoming?.cross;
    if (!cross || this.phase !== 'live') return 0;
    const off = clamp((cross.x - this.you.p.x) / 0.16, -1, 1);
    return off * 0.36 + clamp(this.swing().x, -6, 6) * 0.04;
  }

  /* -------------------------------------------------------------- contact */

  private tryHits() {
    const shot = this.shot;
    if (!shot || !shot.landed) return;
    const b = this.ball.p;
    const prevY = this.prevBall.y;
    if (shot.by === 'bot') {
      const y = this.you.p.y;
      if (prevY > y && b.y <= y) {
        // generous next to a real blade (about 0.08 m): the feeder is for reading, not for losing
        const reachX = this.settings.level === 'feed' ? 0.22 : 0.17;
        const reachZ = this.settings.level === 'feed' ? 0.3 : 0.23;
        // swept: anywhere along the paddle's path over the last frames counts
        const tr = this.you.trail.length
          ? this.you.trail
          : [{ t: this.t, x: this.you.p.x, z: this.you.p.z, sx: 0, sz: 0 }];
        let best = Infinity;
        let at = tr[tr.length - 1];
        for (const s of tr.slice(-6)) {
          const n = Math.hypot((b.x - s.x) / reachX, (b.z - s.z) / reachZ);
          if (n < best) {
            best = n;
            at = s;
          }
        }
        if (best <= 1) this.yourHit(at.x);
      }
    } else {
      const y = this.bot.p.y;
      const lvl = LEVELS[this.settings.level];
      if (prevY < y && b.y >= y) {
        const n = Math.hypot(
          (b.x - this.bot.p.x) / lvl.reach,
          (b.z - this.bot.p.z) / (lvl.reach * 1.3),
        );
        if (n <= 1) this.botHit();
      }
    }
  }

  /**
   * What a return does, from how you met the ball. A swing up is a topspin drive, down a chop,
   * none a block. Where on the blade you meet it angles the face; swing speed sets the depth and
   * how low it skims the net. Incoming spin the stroke doesn't answer pushes the ball long
   * (topspin) or down into the net (backspin).
   */
  private returnPlan(
    contact: V3,
    paddleX: number,
    sw: { x: number; z: number },
    vin: V3,
    win: V3,
    noise: boolean,
  ) {
    const { top: inTop } = spinParts({ p: contact, v: vin, w: win });
    const inPace = Math.hypot(vin.x, vin.y);
    // a flick can be faster than any arm; past these the stroke is simply as hard as it gets
    const up = clamp(sw.z, -4.5, 7);
    const lat = clamp(sw.x, -6, 6);
    const stroke: Stroke = up > 1.1 ? 'drive' : up < -1.1 ? 'chop' : 'block';
    let pace: number;
    let top: number;
    let clear: number;
    // spin tops out near real strokes: about 85 rev/s on a loop, 45 on a chop
    if (stroke === 'drive') {
      pace = 5.2 + up * 1.6;
      top = Math.min(530, 90 + up * 62);
      clear = 0.24 - up * 0.004;
    } else if (stroke === 'chop') {
      pace = 3.9 + -up * 0.35;
      top = -Math.min(280, 140 + -up * 35);
      clear = 0.25;
    } else {
      pace = clamp(2.6 + inPace * 0.42, 3.2, 8.5);
      top = inTop * 0.3;
      clear = 0.245;
    }
    const counter =
      stroke === 'drive'
        ? inTop < 0
          ? 0.2
          : 0.45
        : stroke === 'chop'
          ? inTop < 0
            ? 0.3
            : 1.25
          : 0.9;
    let depth = 0.34 + (pace - 3) * 0.07 + inTop * 0.0008 * counter;
    clear += inTop * 0.00008 * counter;
    const off = clamp((contact.x - paddleX) / 0.16, -1, 1);
    let angle = off * 0.36 + lat * 0.04;
    const sd = 0.02 + 0.003 * pace + 0.04 * off * off + Math.abs(inTop) * 0.00003;
    if (noise) {
      depth += this.gauss() * sd;
      angle += this.gauss() * sd * 0.35;
      clear += this.gauss() * (0.012 + 0.0016 * pace + Math.abs(inTop) * 0.00002);
    }
    const target = { x: contact.x + Math.tan(angle) * (depth + Math.abs(contact.y)), y: depth };
    return { target, pace, top, side: -lat * 22, clear, stroke, sd };
  }

  private yourHit(paddleX: number) {
    const b = this.ball;
    const plan = this.returnPlan(copy(b.p), paddleX, this.swing(), b.v, b.w, true);
    this.launch(plan.target, plan.clear, plan.pace, plan.top, plan.side);
    this.shot = { by: 'you', serve: false, own: true, landed: false, net: false, at: null };
    this.you.since = 0;
    this.struck('you', plan.stroke);
  }

  private botHit() {
    const b = this.ball;
    const lvl = LEVELS[this.settings.level];
    const { top: inTop } = spinParts(b);
    const inPace = Math.hypot(b.v.x, b.v.y);
    let x: number;
    if (lvl.away === 0) x = clamp(this.you.p.x, -0.5, 0.5) * 0.85;
    else if (this.rng() < lvl.away)
      x = -Math.sign(this.you.p.x || 1) * lerp(0.3, HW - 0.1, this.rng());
    else x = (this.rng() * 2 - 1) * lvl.spread * HW;
    let depth = this.range(lvl.depth);
    let pace = this.range(lvl.pace);
    // short balls go slow, so they can land short
    if (depth < 0.5) pace = Math.min(pace, 6.5);
    const err = lvl.err + Math.abs(inTop) * 0.00004 + inPace * 0.003;
    x += this.gauss() * err;
    depth += this.gauss() * err;
    // faster balls skim lower over the net
    const clear = 0.29 - (pace - 5) * 0.008 + inTop * 0.00004 + this.gauss() * err * 0.35;
    this.launch({ x, y: -depth }, clear, pace, this.range(lvl.top), (this.rng() * 2 - 1) * 60);
    this.shot = { by: 'bot', serve: false, own: true, landed: false, net: false, at: null };
    this.bot.since = 0;
    this.bot.angle = clamp(x - b.p.x, -1, 1) * 0.5;
    this.struck('bot', 'drive');
  }

  /** Sends the ball from where it is, over the net at `clear`, to a target, with spin. */
  private launch(
    target: { x: number; y: number },
    clear: number,
    pace: number,
    top: number,
    side: number,
  ) {
    const from = copy(this.ball.p);
    const dir = { x: target.x - from.x, y: target.y - from.y };
    const w = spinFor(dir, top, side);
    // gravity only bends one way: a ball struck high must still pass above the line to its target
    const line =
      from.z + (R - from.z) * (Math.abs(from.y) / (Math.abs(from.y) + Math.abs(target.y)));
    this.ball.v = solveShot(from, w, target, Math.max(clear, line + 0.04), pace);
    this.ball.w = w;
  }

  private struck(by: Side, stroke: Stroke) {
    this.rally++;
    this.lastHitAt = this.t;
    this.recHits.push({ t: this.t - this.pointStart, kind: by, p: copy(this.ball.p) });
    this.emit({
      type: 'hit',
      by,
      n: this.rally,
      kmh: kmh(this.ball.v),
      rpm: rpm(this.ball.w),
      top: spinParts(this.ball).top,
      stroke,
    });
    this.plan = null;
    this.incoming = null;
    this.guide = null;
    if (by === 'you') this.planBot();
    else this.planYou();
  }

  /**
   * Where a shot will bounce on the receiver's half, and the top of that bounce: the point the
   * receiver steps to. After the bounce, the ball is already there. Null if it won't land legally.
   */
  private read(receiver: Side): { path: V3[]; bounce: V3; i0: number; pick: number } | null {
    const s = receiver === 'you' ? -1 : 1;
    const shot = this.shot;
    // a serve's landing is its second bounce, so look one bounce further to see the top after it
    const { path, hits } = predict(this.ball, 2.6, 3);
    let bounce: V3;
    let i0: number;
    if (shot?.landed && shot.at) {
      bounce = shot.at;
      i0 = 0;
    } else {
      const land = hits.find((h) => h.kind === 'table' && h.p.y * s > 0);
      // a serve bounces once on the server's half first; anything else on that half is a fault
      const own = shot?.serve && !shot.own ? 1 : 0;
      if (
        !land ||
        hits.filter((h) => h.kind === 'table' && h.p.y * s < 0 && h.t < land.t).length > own
      )
        return null;
      bounce = land.p;
      i0 = Math.round(land.t / DT);
    }
    let pick = Math.min(path.length - 1, i0 + 30);
    for (let i = i0 + 2; i < path.length - 1; i++) {
      // the top of the bounce, or a little past the end line, whichever comes first
      if (path[i + 1].z <= path[i].z || path[i].y * s > HL + 0.5) {
        pick = i;
        break;
      }
    }
    return { path, bounce, i0, pick };
  }

  /** Reads your shot: the bot heads for the top of its bounce. */
  private planBot() {
    const r = this.read('bot');
    if (!r) return;
    const at = r.path[r.pick];
    this.plan = {
      at: v3(at.x, clamp(at.y, 0.5, 2.2), at.z),
      react: this.plan?.react ?? this.t + LEVELS[this.settings.level].react,
    };
  }

  /** Reads the bot's shot: your plane steps to the top of its bounce on your side. */
  private planYou() {
    const r = this.read('you');
    if (!r) {
      this.incoming = null;
      return;
    }
    const { path, bounce, i0, pick } = r;
    this.ypTarget = clamp(path[pick].y, -2.05, -0.55);
    // where the ball will cross that plane
    let crossI = pick;
    for (let i = i0; i < path.length; i++) {
      if (path[i].y <= this.ypTarget) {
        crossI = i;
        break;
      }
    }
    this.incoming = {
      path,
      bounce: copy(bounce),
      cross: copy(path[crossI]),
      crossI,
      crossT: this.t + crossI * DT,
    };
  }

  /** The aim guide: your return's landing if you met the ball now, as you are. */
  updateGuide() {
    const inc = this.incoming;
    if (this.phase !== 'live' || !inc || this.shot?.by !== 'bot') {
      this.guide = null;
      return;
    }
    const i = Math.max(1, inc.crossI);
    const a = inc.path[i - 1];
    const b = inc.path[i];
    const vin = v3((b.x - a.x) / DT, (b.y - a.y) / DT, (b.z - a.z) / DT);
    const plan = this.returnPlan(
      copy(inc.cross),
      this.you.p.x,
      this.swing(),
      vin,
      this.ball.w,
      false,
    );
    this.guide = { x: plan.target.x, y: plan.target.y, sd: plan.sd, stroke: plan.stroke };
  }

  /* -------------------------------------------------------------- rules */

  private onContact(h: Hit) {
    const shot = this.shot;
    this.recHits.push({ t: this.t - this.pointStart, kind: h.kind, p: copy(h.p) });
    if (!shot || this.phase !== 'live') return;
    if (h.kind === 'tape' || h.kind === 'net') {
      shot.net = true;
      // a clip changes the path: read it again
      if (shot.by === 'you') this.planBot();
      else this.planYou();
      return;
    }
    if (h.kind === 'floor') {
      if (shot.landed) this.endPoint(shot.by, 'Missed');
      else if (shot.serve && !shot.own) this.endPoint(other(shot.by), 'Fault');
      else
        this.endPoint(
          other(shot.by),
          shot.net ? 'Net' : Math.abs(this.dropAt.y) > HL ? 'Long' : 'Wide',
        );
      return;
    }
    const side: Side = h.p.y < 0 ? 'you' : 'bot';
    if (shot.serve && !shot.own) {
      if (side === shot.by) shot.own = true;
      else this.endPoint(other(shot.by), 'Fault');
      return;
    }
    if (!shot.landed) {
      if (side === shot.by) {
        this.endPoint(other(shot.by), shot.net ? 'Net' : 'Fault');
        return;
      }
      shot.landed = true;
      shot.at = copy(h.p);
      if (shot.serve && shot.net) {
        this.pendingLet = true;
        this.endPoint(shot.by, 'Let');
        return;
      }
      if (shot.by === 'you') this.landed(h.p);
      else this.planYou();
      return;
    }
    // a second bounce on the receiver's half
    this.endPoint(shot.by, 'Missed');
  }

  /** Your shot landed on the bot's half: the zone opens its chapter, or the next one. */
  private landed(p: V3) {
    const zone = zoneAt(p.x, p.y);
    let chapter = this.zones[zone];
    let fresh = !this.opened[chapter];
    const direct = fresh;
    if (!fresh) {
      const next = this.nextChapter();
      if (next >= 0) {
        chapter = next;
        fresh = true;
      }
    }
    if (fresh) this.opened[chapter] = true;
    this.marks.push({ x: p.x, y: p.y, chapter, t: this.t });
    if (this.marks.length > 14) this.marks.shift();
    this.emit({
      type: 'land',
      zone,
      chapter,
      fresh,
      direct,
      n: this.rally,
      kmh: kmh(this.ball.v),
      rpm: rpm(this.ball.w),
    });
  }

  private endPoint(winner: Side, call: Call) {
    if (this.phase !== 'live') return;
    this.phase = 'dead';
    this.deadUntil = this.t + (call === 'Let' ? 1.1 : 1.5);
    this.plan = null;
    this.incoming = null;
    this.guide = null;
    this.ypTarget = HOME_Y;
    this.last = {
      frames: this.rec.slice(),
      hits: this.recHits.slice(),
      call,
      winner,
      duration: this.t - this.pointStart,
    };
    if (call === 'Let') {
      this.emit({ type: 'let' });
      this.emit({ type: 'phase', phase: 'dead', server: this.score.server });
      return;
    }
    const sc = this.score;
    if (winner === 'you') sc.you++;
    else sc.bot++;
    this.emit({ type: 'point', winner, call, n: this.rally });
    this.emit({ type: 'phase', phase: 'dead', server: sc.server });
  }

  /** Scores the point's consequences: serve changes and the end of a game. */
  private afterPoint() {
    // a little more of the point gets recorded as the ball dies
    if (this.last)
      this.last = {
        ...this.last,
        frames: this.rec.slice(),
        hits: this.recHits.slice(),
        duration: this.t - this.pointStart,
      };
    if (this.pendingLet) {
      this.pendingLet = false;
      this.toReady();
      return;
    }
    const sc = this.score;
    const lead = Math.abs(sc.you - sc.bot);
    if ((sc.you >= 11 || sc.bot >= 11) && lead >= 2) {
      const winner: Side = sc.you > sc.bot ? 'you' : 'bot';
      if (winner === 'you') sc.gamesYou++;
      else sc.gamesBot++;
      sc.you = 0;
      sc.bot = 0;
      this.firstServer = other(this.firstServer);
      sc.server = this.firstServer;
      this.servesLeft = 2;
      this.emit({ type: 'game', winner });
    } else {
      this.servesLeft--;
      const deuce = sc.you >= 10 && sc.bot >= 10;
      if (this.servesLeft <= 0 || deuce) {
        sc.server = other(sc.server);
        this.servesLeft = deuce ? 1 : 2;
      }
    }
    this.toReady();
    if (sc.server === 'you') this.aimAtNext();
  }

  /** A copy of the incoming ball, for drawing what the guide shows. */
  ballCopy() {
    return cloneBall(this.ball);
  }
}

const other = (s: Side): Side => (s === 'you' ? 'bot' : 'you');

function copyInto(a: V3, b: V3) {
  a.x = b.x;
  a.y = b.y;
  a.z = b.z;
}
