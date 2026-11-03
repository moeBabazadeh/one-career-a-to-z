// A Small Size League match for the Kickoff concept: ten robots, an orange golf ball and an
// automatic referee, simulated deterministically from a seed. Units are millimetres, seconds
// and radians; x runs along the field, y across it (y down, like the canvas).
//
// Geometry follows the 2010 rules, the seasons the team played: a 6050 x 4050 mm field,
// 700 mm goals, and defense areas made of two 500 mm quarter circles joined by a 350 mm line.
// The AI is a small STP stack (plays assign roles, roles run skills) with ERRT path planning.

export const HL = 3025;
export const HW = 2025;
export const BOUNDARY = 250;
export const GOAL_HALF = 350;
export const GOAL_DEPTH = 180;
export const GOAL_WALL = 20;
export const CENTER_R = 500;
export const DEF_R = 500;
export const DEF_STRETCH = 350;
export const PENALTY_SPOT = 750;
export const PENALTY_LINE = 400;
export const ROBOT_R = 90;
/** Centre to the flat front, where the dribbler and the kicker sit. */
export const FRONT = 72;
export const BALL_R = 21.5;
export const STOP_DIST = 500;

export const DT = 1 / 120;
export const DECEL = 480; // rolling friction of a golf ball on carpet, mm/s²
const HALF = 600; // two 10-minute halves
const HALF_TIME = 20; // shortened for the web
const KEEP = STOP_DIST + ROBOT_R + 50;

export type Team = 'blue' | 'yellow';
export type CommandType =
  | 'HALT'
  | 'STOP'
  | 'NORMAL_START'
  | 'FORCE_START'
  | 'PREPARE_KICKOFF'
  | 'PREPARE_PENALTY'
  | 'DIRECT_FREE'
  | 'BALL_PLACEMENT';
export type Stage = 'NORMAL_FIRST_HALF' | 'NORMAL_HALF_TIME' | 'NORMAL_SECOND_HALF' | 'POST_GAME';
export type Role =
  'goalie' | 'attack' | 'receive' | 'kicker' | 'placer' | 'support' | 'defend' | 'mark';

export interface Vec {
  x: number;
  y: number;
}

export interface Command {
  type: CommandType;
  team?: Team;
}

export interface Kick {
  kind: 'shot' | 'pass' | 'clear';
  target: Vec;
  speed: number;
  to: number;
  oneTouch: boolean;
  at: number;
}

export interface Robot {
  i: number;
  team: Team;
  id: number;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  w: number;
  role: Role;
  slot: Vec;
  tx: number;
  ty: number;
  ta: number;
  vmax: number;
  keep: number;
  path: Vec[];
  /** RRT edges from the last plan, as x1, y1, x2, y2 runs, for the overlay. */
  tree: number[];
  planAt: number;
  planFor: Vec;
  kick: Kick | null;
  kickedAt: number;
  noCatch: number;
  steal: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  holder: number;
  trail: Vec[];
}

export interface LogEntry {
  n: number;
  clock: string;
  kind: 'cmd' | 'event' | 'play';
  text: string;
  team?: Team;
}

export interface Match {
  rs: number;
  t: number;
  acc: number;
  steps: number;
  stage: Stage;
  clock: number;
  score: Record<Team, number>;
  /** Sign of x at blue's own goal. Teams swap ends at half time. */
  blueSide: 1 | -1;
  firstKickoff: Team;
  cmd: Command;
  cmdAt: number;
  restart: 'kickoff' | 'penalty' | 'free' | 'placement' | null;
  restartTeam: Team | null;
  restartSpot: Vec | null;
  running: boolean;
  runningAt: number;
  next: { cmd: Command; at: number; point?: Vec } | null;
  placeTo: Vec | null;
  placedAt: number;
  kicker: number;
  keeperGuess: number;
  robots: Robot[];
  ball: Ball;
  pass: { from: number; to: number; oneTouch: boolean; at: number; target: Vec } | null;
  lastTouch: number;
  lastKickAt: number;
  shotAt: number;
  poss: Team;
  rolesAt: number;
  spotsAt: number;
  spots: Record<Team, Vec[]>;
  goalFlash: { team: Team; at: number } | null;
  log: LogEntry[];
  logN: number;
  version: number;
}

/* ------------------------------------------------------------------ helpers */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hyp = Math.hypot;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: Vec, b: Vec) => hyp(a.x - b.x, a.y - b.y);
export const other = (t: Team): Team => (t === 'blue' ? 'yellow' : 'blue');
export const label = (r: Robot) => `${r.team === 'blue' ? 'B' : 'Y'}${r.id}`;

function rand(m: Match) {
  m.rs = (m.rs + 0x6d2b79f5) >>> 0;
  let t = m.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** x of a team's own goal line. */
export const ownGoal = (m: Match, team: Team) => (team === 'blue' ? m.blueSide : -m.blueSide) * HL;
const attackDir = (m: Match, team: Team) => -Math.sign(ownGoal(m, team));

/** Distance from p to the 350 mm line a defense area is drawn around. */
const defDist = (p: Vec, gx: number) => hyp(p.x - gx, Math.max(0, Math.abs(p.y) - DEF_STRETCH / 2));

function outOfDefense(p: Vec, gx: number, margin: number): Vec {
  const need = DEF_R + margin;
  if (defDist(p, gx) >= need) return p;
  const cy = clamp(p.y, -DEF_STRETCH / 2, DEF_STRETCH / 2);
  let dx = p.x - gx;
  const dy = p.y - cy;
  if (dx * Math.sign(gx) > 0) dx = -dx;
  const d = hyp(dx, dy);
  if (d < 1) return { x: gx - Math.sign(gx) * need, y: p.y };
  return { x: gx + (dx / d) * need, y: cy + (dy / d) * need };
}

function awayFrom(p: Vec, c: Vec, rad: number): Vec {
  const d = dist(p, c);
  if (d >= rad) return p;
  if (d < 1) return { x: c.x, y: c.y + (c.y > 0 ? -rad : rad) };
  return { x: c.x + ((p.x - c.x) / d) * rad, y: c.y + ((p.y - c.y) / d) * rad };
}

const inField = (p: Vec, margin: number): Vec => ({
  x: clamp(p.x, -HL + margin, HL - margin),
  y: clamp(p.y, -HW + margin, HW - margin),
});

/** A legal spot for a restart: inside the field and clear of both defense areas. */
function legalSpot(p: Vec): Vec {
  let q = inField(p, 150);
  q = outOfDefense(q, -HL, 250);
  return outOfDefense(q, HL, 250);
}

const clockText = (s: number) => {
  const v = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

export const commandName = (c: Command) => (c.team ? `${c.type}_${c.team.toUpperCase()}` : c.type);

function log(m: Match, kind: LogEntry['kind'], text: string, team?: Team) {
  m.log.push({ n: m.logN++, clock: clockText(m.clock), kind, text, team });
  if (m.log.length > 40) m.log.shift();
  m.version++;
}

/* ------------------------------------------------------------------ setup and referee */

function makeRobot(i: number): Robot {
  return {
    i,
    team: i < 5 ? 'blue' : 'yellow',
    id: i % 5,
    x: 0,
    y: 0,
    a: 0,
    vx: 0,
    vy: 0,
    w: 0,
    role: 'support',
    slot: { x: 0, y: 0 },
    tx: 0,
    ty: 0,
    ta: 0,
    vmax: 2000,
    keep: 0,
    path: [],
    tree: [],
    planAt: -9,
    planFor: { x: 0, y: 0 },
    kick: null,
    kickedAt: -9,
    noCatch: 0,
    steal: 0,
  };
}

export function createMatch(seed = 2010): Match {
  const m: Match = {
    rs: seed,
    t: 0,
    acc: 0,
    steps: 0,
    stage: 'NORMAL_FIRST_HALF',
    clock: HALF,
    score: { blue: 0, yellow: 0 },
    blueSide: -1,
    firstKickoff: 'blue',
    cmd: { type: 'HALT' },
    cmdAt: 0,
    restart: null,
    restartTeam: null,
    restartSpot: null,
    running: false,
    runningAt: 0,
    next: null,
    placeTo: null,
    placedAt: -1,
    kicker: 1,
    keeperGuess: 0,
    robots: Array.from({ length: 10 }, (_, i) => makeRobot(i)),
    ball: { x: 0, y: 0, vx: 0, vy: 0, holder: -1, trail: [] },
    pass: null,
    lastTouch: -1,
    lastKickAt: 0,
    shotAt: -9,
    poss: 'blue',
    rolesAt: 0,
    spotsAt: 0,
    spots: { blue: [], yellow: [] },
    goalFlash: null,
    log: [],
    logN: 0,
    version: 0,
  };
  // Robots start roughly where the team put them down, and drive into their kickoff spots.
  const START = [
    [-2700, 300],
    [-650, 420],
    [-900, -1500],
    [-800, 1500],
    [-2100, -700],
    [2700, -300],
    [1100, -1000],
    [1000, 1100],
    [2000, -400],
    [2200, 800],
  ];
  for (const r of m.robots) {
    [r.x, r.y] = START[r.i];
    r.a = r.team === 'blue' ? 0 : Math.PI;
    r.tx = r.x;
    r.ty = r.y;
    r.ta = r.a;
  }
  log(m, 'event', m.stage);
  issue(m, { type: 'STOP' });
  m.next = { cmd: { type: 'PREPARE_KICKOFF', team: 'blue' }, at: 0.4 };
  return m;
}

function place(m: Match, p: Vec) {
  const b = m.ball;
  b.x = p.x;
  b.y = p.y;
  b.vx = b.vy = 0;
  b.holder = -1;
  b.trail = [];
}

function nearest(m: Match, team: Team, p: Vec) {
  let best = m.robots.find((r) => r.team === team && r.id !== 0) as Robot;
  for (const r of m.robots)
    if (r.team === team && r.id !== 0 && dist(r, p) < dist(best, p)) best = r;
  return best.i;
}

/** Applies a referee command. The visitor and the automatic referee both come through here. */
export function issue(m: Match, cmd: Command, point?: Vec) {
  const b = m.ball;
  m.cmd = cmd;
  m.cmdAt = m.t;
  m.next = null;
  m.pass = null;
  m.running = cmd.type === 'FORCE_START';
  m.runningAt = m.t;
  b.holder = -1;
  for (const r of m.robots) {
    r.kick = null;
    r.noCatch = 0;
  }
  const team = cmd.team;
  switch (cmd.type) {
    case 'PREPARE_KICKOFF':
      place(m, { x: 0, y: 0 });
      m.restart = 'kickoff';
      break;
    case 'PREPARE_PENALTY': {
      const gx = ownGoal(m, other(team!));
      place(m, { x: gx - Math.sign(gx) * PENALTY_SPOT, y: 0 });
      m.restart = 'penalty';
      m.keeperGuess = rand(m) < 0.55 ? (rand(m) < 0.5 ? -1 : 1) : 0;
      break;
    }
    case 'DIRECT_FREE': {
      const p = legalSpot(point ?? b);
      if (dist(p, b) > 1) place(m, p);
      m.restart = 'free';
      break;
    }
    case 'BALL_PLACEMENT':
      m.placeTo = legalSpot(point ?? b);
      m.placedAt = -1;
      m.restart = 'placement';
      break;
    case 'NORMAL_START':
      break;
    default:
      m.restart = null;
  }
  if (team) {
    m.restartTeam = team;
    m.kicker = nearest(m, team, b);
  } else if (cmd.type !== 'NORMAL_START') {
    m.restartTeam = null;
  }
  m.restartSpot = { x: b.x, y: b.y };
  m.rolesAt = 0;
  log(m, 'cmd', commandName(cmd), team);
}

/** The ball went out: stop, the referee puts it down by hand (as in 2010), free kick. */
function stopThen(m: Match, event: string, by: Team | null, team: Team, point: Vec) {
  log(m, 'event', event, by ?? undefined);
  issue(m, { type: 'STOP' });
  m.next = { cmd: { type: 'DIRECT_FREE', team }, at: m.t + 1.2, point };
}

const settled = (m: Match) =>
  m.robots.every((r) => hyp(r.tx - r.x, r.ty - r.y) < 120 && hyp(r.vx, r.vy) < 250);

function referee(m: Match) {
  const b = m.ball;
  const c = m.cmd;
  if (m.next && m.t >= m.next.at) {
    const n = m.next;
    issue(m, n.cmd, n.point);
    return;
  }

  if (m.stage === 'NORMAL_HALF_TIME' || m.stage === 'POST_GAME') return;

  if (
    (c.type === 'PREPARE_KICKOFF' || c.type === 'PREPARE_PENALTY') &&
    !m.next &&
    (settled(m) || m.t - m.cmdAt > 6)
  ) {
    m.next = { cmd: { type: 'NORMAL_START' }, at: m.t + 0.9 };
  }

  if (c.type === 'BALL_PLACEMENT' && m.placeTo) {
    const there = dist(b, m.placeTo) < 150 && b.holder < 0 && hyp(b.vx, b.vy) < 60;
    if (there && m.placedAt >= 0 && m.t - m.placedAt > 0.7) {
      log(m, 'event', 'PLACEMENT_SUCCEEDED', c.team);
      issue(m, { type: 'DIRECT_FREE', team: c.team });
    } else if (m.t - m.cmdAt > 14) {
      log(m, 'event', 'PLACEMENT_FAILED', c.team);
      place(m, m.placeTo);
      issue(m, { type: 'DIRECT_FREE', team: c.team });
    }
    return;
  }

  // A restart is taken once the ball has moved.
  const taking = c.type === 'NORMAL_START' || c.type === 'DIRECT_FREE';
  if (taking && !m.running && m.restartSpot && dist(b, m.restartSpot) > 50) {
    m.running = true;
    m.runningAt = m.t;
  }
  if (!m.running && !taking) return;

  // Ball out, or in the goal.
  const sx = Math.sign(b.x);
  const lastTeam = m.lastTouch >= 0 ? m.robots[m.lastTouch].team : null;
  if (Math.abs(b.x) > HL + BALL_R) {
    const defender: Team = ownGoal(m, 'blue') * sx > 0 ? 'blue' : 'yellow';
    const attacker = other(defender);
    if (Math.abs(b.y) < GOAL_HALF) return goal(m, attacker);
    const sy = Math.sign(b.y) || 1;
    if (lastTeam === defender)
      stopThen(m, 'BALL_LEFT_FIELD_GOAL_LINE', lastTeam, attacker, {
        x: sx * (HL - 150),
        y: sy * (HW - 150),
      });
    else
      stopThen(m, 'BALL_LEFT_FIELD_GOAL_LINE', lastTeam, defender, {
        x: sx * (HL - 600),
        y: sy * (HW - 150),
      });
    return;
  }
  if (Math.abs(b.y) > HW + BALL_R) {
    const to = lastTeam ? other(lastTeam) : 'blue';
    stopThen(m, 'BALL_LEFT_FIELD_TOUCH_LINE', lastTeam, to, {
      x: clamp(b.x, -HL + 250, HL - 250),
      y: Math.sign(b.y) * (HW - 150),
    });
    return;
  }

  // Nobody has kicked for a while: the referee calls it and drops the ball.
  if (m.t - Math.max(m.lastKickAt, m.cmdAt) > 9) {
    log(m, 'event', 'NO_PROGRESS_IN_GAME');
    issue(m, { type: 'STOP' });
    m.next = { cmd: { type: 'FORCE_START' }, at: m.t + 1.6 };
  }
}

function goal(m: Match, team: Team) {
  m.score[team]++;
  const by =
    m.lastTouch >= 0 && m.robots[m.lastTouch].team === team
      ? ` · ${label(m.robots[m.lastTouch])}`
      : '';
  log(m, 'event', `GOAL${by}`, team);
  m.goalFlash = { team, at: m.t };
  issue(m, { type: 'STOP' });
  m.next = { cmd: { type: 'PREPARE_KICKOFF', team: other(team) }, at: m.t + 3 };
}

function stageClock(m: Match, dt: number) {
  if (m.cmd.type === 'HALT') return;
  m.clock -= dt;
  if (m.clock > 0) return;
  if (m.stage === 'NORMAL_FIRST_HALF') {
    m.stage = 'NORMAL_HALF_TIME';
    m.clock = HALF_TIME;
    m.blueSide = m.blueSide === -1 ? 1 : -1;
    log(m, 'event', m.stage);
    issue(m, { type: 'STOP' });
  } else if (m.stage === 'NORMAL_HALF_TIME') {
    m.stage = 'NORMAL_SECOND_HALF';
    m.clock = HALF;
    log(m, 'event', m.stage);
    issue(m, { type: 'PREPARE_KICKOFF', team: other(m.firstKickoff) });
  } else if (m.stage === 'NORMAL_SECOND_HALF') {
    m.stage = 'POST_GAME';
    m.clock = 12;
    log(m, 'event', m.stage);
    issue(m, { type: 'STOP' });
  } else {
    // A fresh match, with the same robots where they stand.
    const fresh = createMatch(m.rs);
    fresh.robots.forEach((r, i) =>
      Object.assign(r, { x: m.robots[i].x, y: m.robots[i].y, a: m.robots[i].a }),
    );
    Object.assign(m, fresh);
  }
}

/* ------------------------------------------------------------------ evaluation */

export interface Opening {
  y0: number;
  y1: number;
  width: number;
  target: Vec;
  gx: number;
}

/** The widest gap in the opponent's goal as seen from `from`, after every robot's shadow. */
export function openGoal(m: Match, from: Vec, team: Team): Opening {
  const gx = ownGoal(m, other(team));
  const s = Math.sign(gx);
  const lo = -GOAL_HALF + BALL_R + 10,
    hi = GOAL_HALF - BALL_R - 10;
  const dx = gx - from.x;
  const shadows: [number, number][] = [];
  for (const r of m.robots) {
    if ((r.x - from.x) * s <= 0 || (gx - r.x) * s < -ROBOT_R) continue;
    const ox = r.x - from.x,
      oy = r.y - from.y,
      d = hyp(ox, oy);
    const rad = ROBOT_R + BALL_R;
    if (d <= rad) continue;
    const half = Math.asin(rad / d),
      base = Math.atan2(oy, ox);
    const ys = [base - half, base + half].map((a) => {
      const cx = Math.cos(a);
      if (cx * s <= 1e-6) return Math.sin(a) > 0 ? 1e6 : -1e6;
      return from.y + (dx / cx) * Math.sin(a);
    });
    shadows.push([Math.min(ys[0], ys[1]), Math.max(ys[0], ys[1])]);
  }
  shadows.sort((a, b) => a[0] - b[0]);
  let best: [number, number] = [0, 0],
    cursor = lo;
  for (const [a, b] of shadows) {
    if (a > cursor && Math.min(a, hi) - cursor > best[1] - best[0])
      best = [cursor, Math.min(a, hi)];
    cursor = Math.max(cursor, b);
    if (cursor >= hi) break;
  }
  if (hi - cursor > best[1] - best[0]) best = [cursor, hi];
  const ax = Math.abs(dx) || 1;
  const width =
    best[1] > best[0]
      ? Math.abs(Math.atan2(best[1] - from.y, ax) - Math.atan2(best[0] - from.y, ax))
      : 0;
  return { y0: best[0], y1: best[1], width, target: { x: gx, y: (best[0] + best[1]) / 2 }, gx };
}

const segDist = (p: Vec, a: Vec, b: Vec) => {
  const vx = b.x - a.x,
    vy = b.y - a.y,
    l2 = vx * vx + vy * vy;
  const t = l2 ? clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / l2, 0, 1) : 0;
  return hyp(p.x - a.x - t * vx, p.y - a.y - t * vy);
};

/** How far the nearest robot in the way is from the lane, past touching it. */
function laneClearance(m: Match, from: Vec, to: Vec, team: Team, skip = -1) {
  let min = 1e9;
  for (const r of m.robots) {
    if (r.i === skip || dist(r, to) < 1) continue;
    min = Math.min(min, segDist(r, from, to) - ROBOT_R - BALL_R - (r.team === team ? 0 : 60));
  }
  return min;
}

export interface PassOption {
  to: number;
  score: number;
  oneTouch: boolean;
}

export function passOptions(m: Match, from: Vec, team: Team, except: number): PassOption[] {
  const dir = attackDir(m, team);
  const out: PassOption[] = [];
  for (const t of m.robots) {
    if (t.team !== team || t.i === except || t.id === 0) continue;
    const d = dist(from, t);
    const lane = laneClearance(m, from, t, team, except);
    const shot = openGoal(m, t, team);
    const progress = clamp(((t.x - from.x) * dir) / 2600 + 0.4, 0, 1);
    let score =
      0.4 * clamp(lane / 450, 0, 1) + 0.4 * clamp(shot.width / 0.22, 0, 1) + 0.2 * progress;
    if (lane < 30 || d < 600 || d > 3800) score *= 0.25;
    const turn = Math.abs(
      wrap(
        Math.atan2(t.y - from.y, t.x - from.x) -
          Math.atan2(shot.target.y - t.y, shot.target.x - t.x),
      ),
    );
    out.push({
      to: t.i,
      score,
      oneTouch: shot.width > 0.1 && turn < 1.35 && d > 900 && score > 0.45,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

const passSpeed = (d: number, arrive: number) =>
  clamp(Math.sqrt(arrive * arrive + 2 * DECEL * d), 1400, 6000);

/** What to do with the ball from here: shoot, pass, or clear it up the wing. */
function decide(m: Match, r: Robot, from: Vec): Kick {
  const gx = ownGoal(m, other(r.team));
  const toGoal = hyp(gx - from.x, from.y);
  const shot = openGoal(m, from, r.team);
  const best = passOptions(m, from, r.team, r.i)[0];
  const shoot = (): Kick => ({
    kind: 'shot',
    target: shot.target,
    speed: 6000,
    to: -1,
    oneTouch: false,
    at: m.t,
  });
  const pass = (): Kick => {
    const t = m.robots[best.to];
    const lead = { x: t.x + t.vx * 0.3, y: t.y + t.vy * 0.3 };
    return {
      kind: 'pass',
      target: lead,
      speed: passSpeed(dist(from, lead), best.oneTouch ? 2300 : 1700),
      to: best.to,
      oneTouch: best.oneTouch,
      at: m.t,
    };
  };
  if (r.id !== 0 && toGoal < 3400 && shot.width > 0.07 + toGoal / 60000) return shoot();
  if (best && best.score > 0.36) return pass();
  if (r.id !== 0 && toGoal < 2300 && shot.width > 0.035) return shoot();
  if (best && best.score > 0.16) return pass();
  const dir = attackDir(m, r.team);
  const y = clamp(from.y * 0.3 + (rand(m) - 0.5) * 1400, -HW + 700, HW - 700);
  const target = { x: clamp(from.x + dir * 2000, -HL + 900, HL - 900), y };
  return {
    kind: 'clear',
    target,
    speed: passSpeed(dist(from, target), 900),
    to: -1,
    oneTouch: false,
    at: m.t,
  };
}

/** Where to stand to be useful: an open shot, a clean lane from the ball, not too close to anyone. */
function supportSpots(m: Match, team: Team): Vec[] {
  const dir = attackDir(m, team);
  const b = m.ball;
  const scored: { p: Vec; v: number }[] = [];
  for (const fx of [0.08, 0.24, 0.4, 0.56, 0.7, 0.82]) {
    for (const fy of [-0.78, -0.48, -0.16, 0.16, 0.48, 0.78]) {
      const p = { x: dir * fx * HL, y: fy * HW };
      if (defDist(p, ownGoal(m, other(team))) < DEF_R + 250) continue;
      let v =
        openGoal(m, p, team).width * 3 + clamp(laneClearance(m, b, p, team) / 600, 0, 1) * 0.6;
      v -= (Math.abs(dist(b, p) - 1900) / 3000) * 0.5;
      for (const r of m.robots)
        if (r.team !== team) v -= (Math.max(0, 650 - dist(r, p)) / 650) * 0.4;
      scored.push({ p, v: v + rand(m) * 0.02 });
    }
  }
  scored.sort((a, b2) => b2.v - a.v);
  const first = scored[0].p;
  const second = scored.find((s) => dist(s.p, first) > 1300)?.p ?? scored[1].p;
  return [first, second];
}

function defendSpots(m: Match, team: Team, n: number): Vec[] {
  const gx = ownGoal(m, team),
    s = Math.sign(gx),
    b = m.ball;
  const c = { x: gx, y: clamp(b.y, -DEF_STRETCH / 2, DEF_STRETCH / 2) };
  let ux = b.x - c.x,
    uy = b.y - c.y;
  if (ux * s > 0) ux = -s * 100;
  const d = hyp(ux, uy) || 1;
  ux /= d;
  uy /= d;
  const R = DEF_R + ROBOT_R + 70;
  const base = { x: c.x + ux * R, y: c.y + uy * R };
  const pts =
    n === 1
      ? [base]
      : [-1, 1].map((k) => ({
          x: base.x - uy * k * (ROBOT_R + 14),
          y: base.y + ux * k * (ROBOT_R + 14),
        }));
  return pts.map((p) => outOfDefense(inField(p, 110), gx, ROBOT_R + 40));
}

function markSpot(m: Match, team: Team): Vec {
  const gx = ownGoal(m, team);
  let threat: Robot | null = null;
  for (const r of m.robots) {
    if (r.team === team || r.id === 0 || dist(r, m.ball) < 500) continue;
    if (!threat || Math.abs(r.x - gx) < Math.abs(threat.x - gx)) threat = r;
  }
  if (!threat) return { x: gx * 0.5, y: 0 };
  const ux = gx - threat.x,
    uy = -threat.y,
    d = hyp(ux, uy) || 1;
  return outOfDefense(
    inField({ x: threat.x + (ux / d) * 420, y: threat.y + (uy / d) * 420 }, 110),
    gx,
    ROBOT_R + 40,
  );
}

/* ------------------------------------------------------------------ plays: role assignment */

const timeTo = (r: Robot, p: Vec) =>
  dist(r, p) / 1800 + (Math.abs(wrap(Math.atan2(p.y - r.y, p.x - r.x) - r.a)) / Math.PI) * 0.25;

function fastest(m: Match, team: Team) {
  let best: Robot | null = null,
    bt = 1e9;
  for (const r of m.robots) {
    if (r.team !== team || r.id === 0) continue;
    const t = timeTo(r, m.ball) * (r.role === 'attack' ? 0.8 : 1);
    if (t < bt) {
      bt = t;
      best = r;
    }
  }
  return { r: best as Robot, t: bt };
}

function assignRoles(m: Match) {
  const b = m.ball;
  const c = m.cmd.type;
  const prep =
    !m.running &&
    (m.restart === 'kickoff' || m.restart === 'penalty') &&
    (c === 'PREPARE_KICKOFF' || c === 'PREPARE_PENALTY' || c === 'NORMAL_START');
  const restartOpen =
    !m.running &&
    (m.restart === 'free' || m.restart === 'placement') &&
    (c === 'DIRECT_FREE' || c === 'BALL_PLACEMENT');

  // possession, with a little hysteresis
  if (b.holder >= 0) m.poss = m.robots[b.holder].team;
  else if (m.pass) m.poss = m.robots[m.pass.from].team;
  else if (restartOpen || prep) m.poss = m.restartTeam ?? m.poss;
  else {
    const fb = fastest(m, 'blue').t,
      fy = fastest(m, 'yellow').t;
    const lead = m.poss === 'blue' ? fy - fb : fb - fy;
    if (lead < -0.25) m.poss = other(m.poss);
  }

  for (const team of ['blue', 'yellow'] as Team[]) {
    const mine = m.robots.filter((r) => r.team === team);
    mine[0].role = 'goalie';
    let first: Robot | null = null;
    let firstRole: Role = 'attack';
    if ((prep || restartOpen) && m.restartTeam === team) {
      first = m.robots[m.kicker];
      firstRole = m.restart === 'placement' ? 'placer' : 'kicker';
    } else if (m.pass && m.robots[m.pass.to].team === team) {
      first = m.robots[m.pass.to];
      firstRole = 'receive';
    } else if (!prep) {
      first = fastest(m, team).r;
    }
    if (first) first.role = firstRole;

    const rest = mine.filter((r) => r.id !== 0 && r !== first);
    const slots = slotsFor(m, team, rest.length, prep);
    // try every assignment of robots to slots (at most 4! = 24) and keep the shortest total drive
    let bestCost = 1e12,
      bestPerm: number[] = [];
    const permute = (left: number[], acc: number[], cost: number) => {
      if (cost >= bestCost) return;
      if (!left.length) {
        bestCost = cost;
        bestPerm = acc;
        return;
      }
      for (const k of left)
        permute(
          left.filter((x) => x !== k),
          [...acc, k],
          cost + dist(rest[acc.length], slots[k].at),
        );
    };
    permute(
      slots.map((_, k) => k),
      [],
      0,
    );
    rest.forEach((r, k) => {
      const s = slots[bestPerm[k]];
      r.role = s.role;
      r.slot = s.at;
      if (r.kick?.oneTouch) r.kick = null;
    });
  }
}

function slotsFor(m: Match, team: Team, n: number, prep: boolean): { role: Role; at: Vec }[] {
  const d = attackDir(m, team);
  if (prep && m.restart === 'kickoff') {
    const pts =
      m.restartTeam === team
        ? [
            { x: -d * 260, y: -1300 },
            { x: -d * 260, y: 1300 },
            { x: -d * 1750, y: 0 },
          ]
        : [
            { x: -d * 760, y: -760 },
            { x: -d * 760, y: 760 },
            { x: -d * 1750, y: -420 },
            { x: -d * 1750, y: 420 },
          ];
    return pts.slice(0, n).map((at) => ({ role: 'support', at }));
  }
  if (prep && m.restart === 'penalty') {
    const gx = ownGoal(m, other(m.restartTeam!)),
      s = Math.sign(gx);
    const line = gx - s * (PENALTY_SPOT + PENALTY_LINE + 160);
    const pts =
      m.restartTeam === team
        ? [
            { x: line, y: -520 },
            { x: line, y: 520 },
            { x: line - s * 900, y: 0 },
          ]
        : [
            { x: line, y: -1150 },
            { x: line, y: 1150 },
            { x: line - s * 620, y: -420 },
            { x: line - s * 620, y: 420 },
          ];
    return pts.slice(0, n).map((at) => ({ role: 'support', at }));
  }
  const out: { role: Role; at: Vec }[] = [];
  if (m.poss === team) {
    const [s1, s2] = m.spots[team].length
      ? m.spots[team]
      : [
          { x: d * 1000, y: -900 },
          { x: d * 1000, y: 900 },
        ];
    out.push({ role: 'support', at: s1 }, { role: 'support', at: s2 });
    for (const at of defendSpots(m, team, n >= 4 ? 2 : 1)) out.push({ role: 'defend', at });
  } else {
    for (const at of defendSpots(m, team, 2)) out.push({ role: 'defend', at });
    out.push({ role: 'mark', at: markSpot(m, team) });
    if (n >= 4) out.push({ role: 'support', at: { x: 0, y: m.ball.y > 0 ? -1200 : 1200 } });
  }
  return out.slice(0, n);
}

/* ------------------------------------------------------------------ roles: skills */

function go(r: Robot, p: Vec, a: number, vmax = 2000, keep = 0) {
  r.tx = p.x;
  r.ty = p.y;
  r.ta = a;
  r.vmax = vmax;
  r.keep = keep;
}

const facing = (r: Robot, p: Vec) => Math.atan2(p.y - r.y, p.x - r.x);

function keepFor(m: Match, r: Robot) {
  const c = m.cmd.type;
  if (c === 'STOP' || c === 'HALT') return KEEP;
  if (c === 'BALL_PLACEMENT') return r.role === 'placer' ? 0 : KEEP;
  if (
    !m.running &&
    (c === 'DIRECT_FREE' ||
      c === 'NORMAL_START' ||
      c === 'PREPARE_KICKOFF' ||
      c === 'PREPARE_PENALTY')
  ) {
    if (r.role === 'kicker') return 0;
    return r.team === m.restartTeam ? 250 : KEEP;
  }
  return 0;
}

/** A teammate is lining up a pass to this robot. */
const expecting = (m: Match, r: Robot) =>
  m.robots.some(
    (o) =>
      o.team === r.team && o.kick?.kind === 'pass' && o.kick.to === r.i && dist(o, m.ball) < 700,
  );

/** Keep a planned pass aimed at where the receiver is now. */
function refreshPass(m: Match, r: Robot) {
  const k = r.kick;
  if (!k || k.kind !== 'pass') return;
  const t = m.robots[k.to];
  k.target = { x: t.x, y: t.y };
  k.speed = passSpeed(dist(m.ball, t), k.oneTouch ? 2300 : 1700);
}

function holdSlot(m: Match, r: Robot) {
  const b = m.ball;
  if (m.cmd.type !== 'STOP' && expecting(m, r)) return go(r, r, facing(r, b), 0);
  const keep = keepFor(m, r);
  let p = r.slot;
  if (keep) p = awayFrom(p, b, keep + 20);
  if (m.cmd.type === 'BALL_PLACEMENT' && m.placeTo) p = awayFrom(p, m.placeTo, KEEP);
  p = outOfDefense(outOfDefense(inField(p, 100), -HL, ROBOT_R + 40), HL, ROBOT_R + 40);
  const slow = m.cmd.type === 'STOP' || m.cmd.type === 'BALL_PLACEMENT';
  go(r, p, facing(r, b), slow ? 1400 : 2000, keep || (m.running && b.holder < 0 ? 260 : 0));
}

/** Drive around behind the ball, line up with the target, then drive through it. */
function approach(m: Match, r: Robot, target: Vec, vmax = 2000) {
  const b = m.ball;
  let dx = target.x - b.x,
    dy = target.y - b.y;
  const d = hyp(dx, dy) || 1;
  dx /= d;
  dy /= d;
  const rx = r.x - b.x,
    ry = r.y - b.y;
  const along = rx * dx + ry * dy,
    lateral = Math.abs(-rx * dy + ry * dx);
  const a = Math.atan2(dy, dx);
  if (along < -FRONT + 10 && lateral < 45 && Math.abs(wrap(r.a - a)) < 0.3) {
    go(
      r,
      { x: b.x - dx * (FRONT + BALL_R - 40), y: b.y - dy * (FRONT + BALL_R - 40) },
      a,
      Math.min(vmax, 1300),
    );
  } else {
    const back = FRONT + BALL_R + 110;
    go(r, { x: b.x - dx * back, y: b.y - dy * back }, a, vmax, 160);
  }
}

/** Where this robot can meet a rolling ball. */
function interceptPoint(m: Match, r: Robot): Vec {
  const b = m.ball,
    sp = hyp(b.vx, b.vy),
    ux = b.vx / sp,
    uy = b.vy / sp;
  const stop = (sp * sp) / (2 * DECEL);
  for (let t = 0.1; t < 3; t += 0.1) {
    const s = Math.min(sp * t - 0.5 * DECEL * t * t, stop);
    const p = { x: b.x + ux * s, y: b.y + uy * s };
    if (dist(r, p) / 1900 + 0.15 <= t) return inField(p, -BOUNDARY + ROBOT_R);
  }
  return inField({ x: b.x + ux * stop, y: b.y + uy * stop }, -BOUNDARY + ROBOT_R);
}

function attack(m: Match, r: Robot) {
  const b = m.ball;
  const keep = keepFor(m, r);
  if (keep) {
    // Not allowed near the ball yet: stand between it and our goal.
    const g = { x: ownGoal(m, r.team), y: 0 },
      d = dist(b, g) || 1;
    const p = {
      x: b.x + ((g.x - b.x) / d) * (keep + 30),
      y: b.y + ((g.y - b.y) / d) * (keep + 30),
    };
    return go(r, outOfDefense(inField(p, 100), g.x, ROBOT_R + 40), facing(r, b), 1400, keep);
  }
  if (b.holder === r.i) return carry(m, r);
  if (b.holder >= 0) {
    // Press the robot on the ball: get our front onto it.
    const h = m.robots[b.holder],
      ux = b.x - h.x,
      uy = b.y - h.y,
      d = hyp(ux, uy) || 1;
    return go(
      r,
      { x: b.x + (ux / d) * (FRONT + BALL_R - 10), y: b.y + (uy / d) * (FRONT + BALL_R - 10) },
      Math.atan2(-uy, -ux),
      2000,
    );
  }
  const sp = hyp(b.vx, b.vy);
  if (sp > 600) {
    const p = interceptPoint(m, r);
    const a = Math.atan2(-b.vy, -b.vx);
    r.kick = null;
    return go(
      r,
      { x: p.x - Math.cos(a) * (FRONT + BALL_R), y: p.y - Math.sin(a) * (FRONT + BALL_R) },
      a,
      2200,
    );
  }
  if (!r.kick || (m.t - r.kick.at > 0.45 && dist(r, b) > 450)) r.kick = decide(m, r, b);
  refreshPass(m, r);
  approach(m, r, r.kick.target);
}

/** Holding the ball on the dribbler: turn to the target, then kick. */
function carry(m: Match, r: Robot) {
  if (!r.kick || m.t - r.kick.at > 0.6) r.kick = decide(m, r, m.ball);
  refreshPass(m, r);
  const a = Math.atan2(r.kick.target.y - m.ball.y, r.kick.target.x - m.ball.x);
  go(r, r, a, 300);
  const pressed = m.robots.some((o) => o.team !== r.team && dist(o, r) < 320);
  if (Math.abs(wrap(r.a - a)) < 0.05 || (pressed && Math.abs(wrap(r.a - a)) < 0.14)) kick(m, r);
}

function receive(m: Match, r: Robot) {
  const b = m.ball,
    p = m.pass;
  const sp = hyp(b.vx, b.vy);
  if (!p || sp < 250 || b.holder >= 0) {
    m.pass = null;
    return attack(m, r);
  }
  // Meet the ball where its line passes the spot it was aimed at, so the target holds still.
  const ux = b.vx / sp,
    uy = b.vy / sp;
  const ahead = (p.target.x - b.x) * ux + (p.target.y - b.y) * uy;
  if (ahead < 120 && (r.x - b.x) * ux + (r.y - b.y) * uy < 0) {
    m.pass = null;
    return attack(m, r);
  }
  const along = Math.max(220, ahead);
  const meet = { x: b.x + ux * along, y: b.y + uy * along };
  let a = Math.atan2(-uy, -ux);
  if (p.oneTouch && r.kick) {
    if (m.t - r.kick.at > 0.25)
      r.kick = { ...r.kick, target: openGoal(m, meet, r.team).target, at: m.t };
    // Turn to the bisector of the incoming ball and the shot, so it deflects goalward.
    const ox = r.kick.target.x - meet.x,
      oy = r.kick.target.y - meet.y,
      od = hyp(ox, oy) || 1;
    a = Math.atan2(-uy + oy / od, -ux + ox / od);
  }
  go(
    r,
    { x: meet.x - Math.cos(a) * (FRONT + BALL_R), y: meet.y - Math.sin(a) * (FRONT + BALL_R) },
    a,
    2300,
  );
}

function kicker(m: Match, r: Robot) {
  const b = m.ball,
    c = m.cmd.type,
    d = attackDir(m, r.team);
  const wait = (gap: number) =>
    go(r, { x: b.x - d * (FRONT + BALL_R + gap), y: b.y }, d > 0 ? 0 : Math.PI, 1500);
  if (c === 'PREPARE_KICKOFF' || c === 'PREPARE_PENALTY')
    return wait(c === 'PREPARE_PENALTY' ? 260 : 180);
  if (c === 'DIRECT_FREE' && m.t - m.cmdAt < 0.5) {
    if (!r.kick) r.kick = decide(m, r, b);
    const back = FRONT + BALL_R + 200,
      a = Math.atan2(r.kick.target.y - b.y, r.kick.target.x - b.x);
    return go(r, { x: b.x - Math.cos(a) * back, y: b.y - Math.sin(a) * back }, a, 1500, 160);
  }
  if (!r.kick) {
    if (m.restart === 'penalty') {
      const gx = ownGoal(m, other(r.team)),
        side = rand(m) < 0.5 ? -1 : 1;
      r.kick = {
        kind: 'shot',
        target: { x: gx, y: side * (190 + rand(m) * 90) },
        speed: 6000,
        to: -1,
        oneTouch: false,
        at: m.t,
      };
    } else if (m.restart === 'kickoff') {
      const mates = passOptions(m, b, r.team, r.i).filter((o) => Math.abs(m.robots[o.to].y) > 800);
      const to = m.robots[(mates[0] ?? passOptions(m, b, r.team, r.i)[0]).to];
      r.kick = {
        kind: 'pass',
        target: { x: to.x, y: to.y },
        speed: passSpeed(dist(b, to), 1600),
        to: to.i,
        oneTouch: false,
        at: m.t,
      };
    } else {
      r.kick = decide(m, r, b);
    }
  }
  if (m.restart !== 'kickoff') refreshPass(m, r);
  approach(m, r, r.kick.target, 1400);
}

function placer(m: Match, r: Robot) {
  const b = m.ball,
    P = m.placeTo!;
  if (m.placedAt >= 0) {
    const ux = r.x - b.x,
      uy = r.y - b.y,
      d = hyp(ux, uy) || 1;
    return go(
      r,
      { x: b.x + (ux / d) * (FRONT + BALL_R + 260), y: b.y + (uy / d) * (FRONT + BALL_R + 260) },
      facing(r, b),
      600,
    );
  }
  const toP = dist(b, P);
  if (b.holder === r.i) {
    const a = toP > 140 ? facing(r, P) : r.a;
    go(
      r,
      { x: P.x - Math.cos(r.a) * (FRONT + BALL_R), y: P.y - Math.sin(r.a) * (FRONT + BALL_R) },
      a,
      900,
    );
    if (toP < 45 && hyp(r.vx, r.vy) < 90) {
      b.holder = -1;
      b.vx = b.vy = 0;
      r.noCatch = m.t + 3;
      m.placedAt = m.t;
    }
    return;
  }
  if (toP < 60 && hyp(b.vx, b.vy) < 60) {
    m.placedAt = m.t;
    return;
  }
  if (hyp(b.vx, b.vy) > 600) return attack(m, r);
  // Come in from the far side, so the robot already faces the target once it has the ball;
  // if the ball is up against the wall, just take it from this side and turn with it.
  const ux = P.x - b.x,
    uy = P.y - b.y,
    d = hyp(ux, uy) || 1;
  const back = {
    x: b.x - (ux / d) * (FRONT + BALL_R + 110),
    y: b.y - (uy / d) * (FRONT + BALL_R + 110),
  };
  const reach =
    Math.abs(back.x) < HL + BOUNDARY - ROBOT_R - 10 &&
    Math.abs(back.y) < HW + BOUNDARY - ROBOT_R - 10;
  const wall = {
    x: Math.abs(b.x) > HL + BOUNDARY - 160 ? Math.sign(b.x) : 0,
    y: Math.abs(b.y) > HW + BOUNDARY - 160 ? Math.sign(b.y) : 0,
  };
  approach(m, r, reach ? P : { x: b.x + wall.x * 500, y: b.y + wall.y * 500 }, 1500);
}

function goalie(m: Match, r: Robot) {
  const b = m.ball,
    gx = ownGoal(m, r.team),
    s = Math.sign(gx);
  const line = gx - s * (ROBOT_R + 25);
  if (m.cmd.type === 'HALT') return;
  if (b.holder === r.i) return carry(m, r);

  // A penalty: stay on the line, and maybe guess a side as it's struck.
  if (
    m.restart === 'penalty' &&
    m.restartTeam !== r.team &&
    (!m.running || (m.keeperGuess && m.t - m.runningAt < 0.6))
  ) {
    const y = m.running ? m.keeperGuess * 240 : 0;
    return go(r, { x: gx - s * (ROBOT_R - 30), y }, s > 0 ? Math.PI : 0, 2600);
  }

  // A shot on the way: get across to where it will cross the line.
  if (b.vx * s > 300 && b.holder < 0) {
    const t = (line - b.x) / b.vx;
    const y = b.y + b.vy * t;
    if (t > 0 && t < 2.5 && Math.abs(y) < GOAL_HALF + 250)
      return go(r, { x: line, y: clamp(y, -GOAL_HALF + 40, GOAL_HALF - 40) }, facing(r, b), 2800);
  }

  // A loose ball in the box is the keeper's to clear.
  const keep = keepFor(m, r);
  if (
    !keep &&
    b.holder < 0 &&
    defDist(b, gx) < DEF_R - 30 &&
    hyp(b.vx, b.vy) < 500 &&
    Math.abs(b.x) < HL
  ) {
    if (!r.kick || (m.t - r.kick.at > 0.5 && dist(r, b) > 450)) r.kick = decide(m, r, b);
    refreshPass(m, r);
    return approach(m, r, r.kick.target, 1600);
  }

  // Otherwise cover the angle, just off the line.
  const y = clamp(b.y * 0.32, -GOAL_HALF + 70, GOAL_HALF - 70);
  go(r, { x: gx - s * (ROBOT_R + 40 + (1 - Math.abs(y) / GOAL_HALF) * 50), y }, facing(r, b), 2400);
}

function think(m: Match) {
  if (m.cmd.type === 'HALT') {
    for (const r of m.robots) go(r, r, r.a, 0);
    return;
  }
  if (m.t >= m.spotsAt) {
    m.spots.blue = supportSpots(m, 'blue');
    m.spots.yellow = supportSpots(m, 'yellow');
    m.spotsAt = m.t + 0.5;
  }
  if (m.t >= m.rolesAt) {
    assignRoles(m);
    m.rolesAt = m.t + 0.2;
  }
  for (const r of m.robots) {
    if (r.role === 'goalie') goalie(m, r);
    else if (r.role === 'attack') attack(m, r);
    else if (r.role === 'receive') receive(m, r);
    else if (r.role === 'kicker') kicker(m, r);
    else if (r.role === 'placer') placer(m, r);
    else holdSlot(m, r);
  }
}

/* ------------------------------------------------------------------ path planning (ERRT) */

type Obstacle =
  { kind: 'circle'; x: number; y: number; r: number } | { kind: 'defense'; gx: number; r: number };

function segSegDist(a: Vec, b: Vec, c: Vec, d: Vec) {
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}

function blocked(o: Obstacle, a: Vec, b: Vec) {
  if (o.kind === 'circle') return segDist(o, a, b) < o.r;
  return segSegDist(a, b, { x: o.gx, y: -DEF_STRETCH / 2 }, { x: o.gx, y: DEF_STRETCH / 2 }) < o.r;
}

const inside = (o: Obstacle, p: Vec) =>
  o.kind === 'circle' ? dist(o, p) < o.r : defDist(p, o.gx) < o.r;

function plan(m: Match, r: Robot) {
  const start = { x: r.x, y: r.y },
    goalP = { x: r.tx, y: r.ty };
  const obs: Obstacle[] = [];
  for (const o of m.robots)
    if (o !== r) obs.push({ kind: 'circle', x: o.x, y: o.y, r: ROBOT_R * 2 + 20 });
  if (r.keep) obs.push({ kind: 'circle', x: m.ball.x, y: m.ball.y, r: r.keep });
  if (r.role !== 'goalie')
    for (const gx of [-HL, HL]) obs.push({ kind: 'defense', gx, r: DEF_R + ROBOT_R + 20 });
  // Ignore anything we are already inside, or that sits on the target, so we can always get out.
  const live = obs.filter((o) => !inside(o, start) && !inside(o, goalP));
  const clear = (a: Vec, b: Vec) => live.every((o) => !blocked(o, a, b));

  r.planAt = m.t;
  r.planFor = goalP;
  r.tree = [];
  if (clear(start, goalP)) {
    r.path = [start, goalP];
    return;
  }

  const cache = r.path.slice(1, -1);
  const xs = [start.x],
    ys = [start.y],
    parent = [-1];
  const STEP = 260;
  let reached = -1;
  for (let it = 0; it < 220 && reached < 0; it++) {
    const u = rand(m);
    const s =
      u < 0.18
        ? goalP
        : u < 0.4 && cache.length
          ? cache[Math.floor(rand(m) * cache.length)]
          : { x: (rand(m) * 2 - 1) * (HL + 150), y: (rand(m) * 2 - 1) * (HW + 150) };
    let k = 0,
      kd = 1e12;
    for (let j = 0; j < xs.length; j++) {
      const dd = (xs[j] - s.x) ** 2 + (ys[j] - s.y) ** 2;
      if (dd < kd) {
        kd = dd;
        k = j;
      }
    }
    const len = Math.sqrt(kd);
    const f = len > STEP ? STEP / len : 1;
    const n = { x: xs[k] + (s.x - xs[k]) * f, y: ys[k] + (s.y - ys[k]) * f };
    if (!clear({ x: xs[k], y: ys[k] }, n)) continue;
    xs.push(n.x);
    ys.push(n.y);
    parent.push(k);
    r.tree.push(xs[k], ys[k], n.x, n.y);
    if (clear(n, goalP)) reached = xs.length - 1;
  }
  if (reached < 0) {
    r.path = [start, goalP];
    return;
  }
  const raw: Vec[] = [goalP];
  for (let k = reached; k >= 0; k = parent[k]) raw.push({ x: xs[k], y: ys[k] });
  raw.reverse();
  // shortcut smoothing
  const path = [raw[0]];
  for (let i = 0; i < raw.length - 1;) {
    let j = raw.length - 1;
    while (j > i + 1 && !clear(raw[i], raw[j])) j--;
    path.push(raw[j]);
    i = j;
  }
  r.path = path;
}

/* ------------------------------------------------------------------ physics */

function drive(m: Match, r: Robot, dt: number) {
  const goalie = r.role === 'goalie';
  const amax = goalie ? 5200 : 3200;
  if (
    dist(r.planFor, { x: r.tx, y: r.ty }) > 120 ||
    m.t - r.planAt > 0.3 + r.i * 0.007 ||
    !r.path.length
  )
    plan(m, r);
  let wp = r.path[1] ?? { x: r.tx, y: r.ty };
  if (r.path.length > 2 && dist(r, wp) < 110) {
    r.path.shift();
    wp = r.path[1];
  }
  let rem = dist(r, wp);
  for (let k = 2; k < r.path.length; k++) rem += dist(r.path[k - 1], r.path[k]);
  const dx = wp.x - r.x,
    dy = wp.y - r.y,
    d = hyp(dx, dy);
  const speed = rem < 6 ? 0 : Math.min(r.vmax, Math.sqrt(2 * amax * 0.8 * rem));
  let dvx = (d > 1 ? (dx / d) * speed : 0) - r.vx,
    dvy = (d > 1 ? (dy / d) * speed : 0) - r.vy;
  const dv = hyp(dvx, dvy),
    lim = amax * dt;
  if (dv > lim) {
    dvx *= lim / dv;
    dvy *= lim / dv;
  }
  r.vx += dvx;
  r.vy += dvy;
  r.x += r.vx * dt;
  r.y += r.vy * dt;
  const wd = clamp(wrap(r.ta - r.a) * 9, -9, 9);
  r.w += clamp(wd - r.w, -60 * dt, 60 * dt);
  r.a = wrap(r.a + r.w * dt);
  r.x = clamp(r.x, -HL - BOUNDARY + ROBOT_R, HL + BOUNDARY - ROBOT_R);
  r.y = clamp(r.y, -HW - BOUNDARY + ROBOT_R, HW + BOUNDARY - ROBOT_R);
  for (const g of GOAL_BOXES) {
    const cx = clamp(r.x, g.x0, g.x1),
      cy = clamp(r.y, g.y0, g.y1),
      d = hyp(r.x - cx, r.y - cy);
    if (d < ROBOT_R && d > 1e-6) {
      r.x = cx + ((r.x - cx) / d) * ROBOT_R;
      r.y = cy + ((r.y - cy) / d) * ROBOT_R;
    }
  }
}

function separate(m: Match) {
  const rs = m.robots;
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i],
        b = rs[j];
      const dx = b.x - a.x,
        dy = b.y - a.y,
        d = hyp(dx, dy),
        min = ROBOT_R * 2;
      if (d >= min || d < 1e-6) continue;
      const nx = dx / d,
        ny = dy / d,
        push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        a.vx += nx * rel * 0.5;
        a.vy += ny * rel * 0.5;
        b.vx -= nx * rel * 0.5;
        b.vy -= ny * rel * 0.5;
      }
    }
  }
}

const GOAL_BOXES = [-1, 1].flatMap((s) => {
  const x0 = s * HL,
    x1 = s * (HL + GOAL_DEPTH),
    x2 = s * (HL + GOAL_DEPTH + GOAL_WALL);
  return [
    {
      x0: Math.min(x1, x2),
      x1: Math.max(x1, x2),
      y0: -GOAL_HALF - GOAL_WALL,
      y1: GOAL_HALF + GOAL_WALL,
    },
    { x0: Math.min(x0, x2), x1: Math.max(x0, x2), y0: GOAL_HALF, y1: GOAL_HALF + GOAL_WALL },
    { x0: Math.min(x0, x2), x1: Math.max(x0, x2), y0: -GOAL_HALF - GOAL_WALL, y1: -GOAL_HALF },
  ];
});

function rollBall(m: Match, dt: number) {
  const b = m.ball;
  if (b.holder >= 0) return;
  const sp = hyp(b.vx, b.vy);
  if (sp > 0) {
    const k = Math.max(0, sp - DECEL * dt) / sp;
    b.vx *= k;
    b.vy *= k;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const wx = HL + BOUNDARY - BALL_R,
    wy = HW + BOUNDARY - BALL_R;
  if (Math.abs(b.x) > wx) {
    b.x = Math.sign(b.x) * wx;
    b.vx *= -0.4;
  }
  if (Math.abs(b.y) > wy) {
    b.y = Math.sign(b.y) * wy;
    b.vy *= -0.4;
  }
  for (const g of GOAL_BOXES) {
    const cx = clamp(b.x, g.x0, g.x1),
      cy = clamp(b.y, g.y0, g.y1);
    const dx = b.x - cx,
      dy = b.y - cy,
      d = hyp(dx, dy);
    if (d >= BALL_R || d < 1e-6) continue;
    const nx = dx / d,
      ny = dy / d;
    b.x = cx + nx * BALL_R;
    b.y = cy + ny * BALL_R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= 1.3 * vn * nx;
      b.vy -= 1.3 * vn * ny;
    }
  }
}

function canTouch(m: Match, r: Robot) {
  const c = m.cmd.type;
  if (m.running || c === 'FORCE_START') return true;
  if (c === 'NORMAL_START' || c === 'DIRECT_FREE') return r.i === m.kicker;
  if (c === 'BALL_PLACEMENT') return r.role === 'placer';
  return false;
}

function kick(m: Match, r: Robot) {
  const k = r.kick!,
    b = m.ball;
  const toTarget = Math.atan2(k.target.y - b.y, k.target.x - b.x);
  const aim = (k.oneTouch ? toTarget : r.a) + (rand(m) - 0.5) * (k.kind === 'shot' ? 0.075 : 0.035);
  b.holder = -1;
  b.x = r.x + Math.cos(r.a) * (FRONT + BALL_R + 2);
  b.y = r.y + Math.sin(r.a) * (FRONT + BALL_R + 2);
  b.vx = Math.cos(aim) * k.speed;
  b.vy = Math.sin(aim) * k.speed;
  r.kick = null;
  r.kickedAt = m.t;
  r.noCatch = m.t + 0.3;
  m.lastTouch = r.i;
  m.lastKickAt = m.t;
  m.rolesAt = 0;
  m.pass = null;
  if (k.kind === 'pass') {
    const to = m.robots[k.to];
    m.pass = { from: r.i, to: k.to, oneTouch: k.oneTouch, at: m.t, target: k.target };
    to.kick = k.oneTouch
      ? {
          kind: 'shot',
          target: openGoal(m, to, to.team).target,
          speed: 6000,
          to: -1,
          oneTouch: true,
          at: m.t,
        }
      : null;
    log(m, 'play', `${label(r)} → ${label(to)}${k.oneTouch ? ' · one-touch set up' : ''}`, r.team);
  } else if (k.kind === 'shot') {
    m.shotAt = m.t;
    log(m, 'play', `${label(r)} ${k.oneTouch ? 'one-touch shot' : 'shoots'}`, r.team);
  } else {
    log(m, 'play', `${label(r)} clears`, r.team);
  }
}

function saved(m: Match, r: Robot) {
  log(m, 'play', `${label(r)} saves`, r.team);
  m.shotAt = -9;
}

function touchBall(m: Match, dt: number) {
  const b = m.ball;
  if (b.holder >= 0) {
    const h = m.robots[b.holder];
    b.x = h.x + Math.cos(h.a) * (FRONT + BALL_R);
    b.y = h.y + Math.sin(h.a) * (FRONT + BALL_R);
    b.vx = h.vx;
    b.vy = h.vy;
    // An opponent's dribbler on the ball long enough knocks it loose.
    for (const r of m.robots) {
      if (r.team === h.team) continue;
      const lx = (b.x - r.x) * Math.cos(r.a) + (b.y - r.y) * Math.sin(r.a);
      const ly = -(b.x - r.x) * Math.sin(r.a) + (b.y - r.y) * Math.cos(r.a);
      if (lx > FRONT - 6 && lx < FRONT + BALL_R + 30 && Math.abs(ly) < 50) r.steal += dt;
      else r.steal = Math.max(0, r.steal - dt);
      if (r.steal > 0.45) {
        r.steal = 0;
        b.holder = -1;
        h.kick = null;
        h.noCatch = m.t + 0.6;
        const a = r.a + (rand(m) - 0.5) * 1.6;
        b.vx = Math.cos(a) * 900;
        b.vy = Math.sin(a) * 900;
        m.lastTouch = r.i;
        m.lastKickAt = m.t;
        break;
      }
    }
    return;
  }
  for (const r of m.robots) {
    const dx = b.x - r.x,
      dy = b.y - r.y,
      d = hyp(dx, dy);
    if (d > ROBOT_R + BALL_R || m.t - r.kickedAt < 0.2) continue;
    const ca = Math.cos(r.a),
      sa = Math.sin(r.a);
    const lx = dx * ca + dy * sa,
      ly = -dx * sa + dy * ca;
    // the flat front sits closer to the centre than the round body
    const front = lx > 0 && Math.abs(ly) < 50;
    if (front && lx >= FRONT + BALL_R) continue;
    const save = r.role === 'goalie' && m.t - m.shotAt < 1.6 && hyp(b.vx, b.vy) > 1500;
    if (front && lx > FRONT - 6 && canTouch(m, r) && m.t > r.noCatch) {
      const rel = hyp(b.vx - r.vx, b.vy - r.vy);
      const k = r.kick;
      const aligned =
        k &&
        (k.oneTouch || Math.abs(wrap(r.a - Math.atan2(k.target.y - b.y, k.target.x - b.x))) < 0.07);
      if (k && aligned && rel < 5200) {
        if (k.oneTouch && m.pass?.to !== r.i) r.kick = null;
        else {
          kick(m, r);
          return;
        }
      }
      if (rel < 3200) {
        if (save) saved(m, r);
        b.holder = r.i;
        m.lastTouch = r.i;
        m.pass = null;
        return;
      }
    }
    // bounce off the body, or off the flat front
    const nx = front ? ca : dx / (d || 1),
      ny = front ? sa : dy / (d || 1);
    if (front) {
      b.x = r.x + ca * (FRONT + BALL_R) + -sa * ly;
      b.y = r.y + sa * (FRONT + BALL_R) + ca * ly;
    } else {
      b.x = r.x + nx * (ROBOT_R + BALL_R);
      b.y = r.y + ny * (ROBOT_R + BALL_R);
    }
    const vn = (b.vx - r.vx) * nx + (b.vy - r.vy) * ny;
    if (vn < 0) {
      if (save) saved(m, r);
      b.vx -= 1.25 * vn * nx;
      b.vy -= 1.25 * vn * ny;
    }
    if (m.running || m.cmd.type === 'FORCE_START') m.lastTouch = r.i;
    if (m.pass && m.pass.to !== r.i) m.pass = null;
  }
}

/** Advances the match by `seconds`, in fixed 1/120 s steps, so any frame rate plays the same match. */
export function step(m: Match, seconds: number) {
  m.acc = Math.min(m.acc + seconds, 0.25);
  while (m.acc >= DT) {
    m.acc -= DT;
    m.t += DT;
    m.steps++;
    stageClock(m, DT);
    referee(m);
    think(m);
    for (const r of m.robots) {
      if (m.cmd.type === 'HALT') {
        const f = Math.max(0, 1 - 8 * DT);
        r.vx *= f;
        r.vy *= f;
        r.w *= f;
        r.x += r.vx * DT;
        r.y += r.vy * DT;
      } else drive(m, r, DT);
    }
    separate(m);
    rollBall(m, DT);
    touchBall(m, DT);
    if (m.steps % 3 === 0) {
      m.ball.trail.push({ x: m.ball.x, y: m.ball.y });
      if (m.ball.trail.length > 22) m.ball.trail.shift();
    }
  }
}

/** Runs the match ahead without drawing, for still frames; stops early once `until` holds. */
export function fastForward(m: Match, seconds: number, until?: (m: Match) => boolean) {
  for (let t = 0; t < seconds; t += 0.05) {
    step(m, 0.05);
    if (until?.(m)) return;
  }
}

/* ------------------------------------------------------------------ visitor */

export type Call = 'HALT' | 'STOP' | 'FORCE_START' | 'KICKOFF' | 'FREE' | 'PENALTY';

/** The referee box buttons. */
export function call(m: Match, what: Call, team: Team = 'blue') {
  if (m.stage === 'NORMAL_HALF_TIME' || m.stage === 'POST_GAME') return;
  if (what === 'HALT') issue(m, { type: 'HALT' });
  else if (what === 'STOP') {
    issue(m, { type: 'STOP' });
    m.next = { cmd: { type: 'FORCE_START' }, at: m.t + 4 };
  } else if (what === 'FORCE_START') issue(m, { type: 'FORCE_START' });
  else if (what === 'KICKOFF') issue(m, { type: 'PREPARE_KICKOFF', team });
  else if (what === 'PENALTY') issue(m, { type: 'PREPARE_PENALTY', team });
  else issue(m, { type: 'DIRECT_FREE', team });
}

/** A click on the field: blue's robots carry the ball there, then take a free kick. */
export function placeBall(m: Match, p: Vec) {
  if (m.stage === 'NORMAL_HALF_TIME' || m.stage === 'POST_GAME') return;
  issue(m, { type: 'BALL_PLACEMENT', team: 'blue' }, p);
}

/** Field coordinates of a point inside the field, for the keyboard cursor. */
export const clampToField = (p: Vec) => inField(p, 0);

export interface Hud {
  blue: number;
  yellow: number;
  stage: Stage;
  clock: string;
  cmd: string;
  cmdTeam?: Team;
  log: LogEntry[];
}

export const hudOf = (m: Match): Hud => ({
  blue: m.score.blue,
  yellow: m.score.yellow,
  stage: m.stage,
  clock: clockText(m.clock),
  cmd: commandName(m.cmd),
  cmdTeam: m.cmd.team,
  log: m.log.slice(-8).reverse(),
});
