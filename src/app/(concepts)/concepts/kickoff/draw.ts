// Canvas drawing for the Kickoff concept: the view from the overhead cameras, plus the overlays
// an SSL team would have on its own screen. Geometry is drawn in a landscape space at 0.2 px per
// mm; on phones the whole field is turned upright and text is placed in screen space.

import {
  BALL_R,
  BOUNDARY,
  CENTER_R,
  DECEL,
  DEF_R,
  DEF_STRETCH,
  FRONT,
  GOAL_DEPTH,
  GOAL_HALF,
  GOAL_WALL,
  HL,
  HW,
  PENALTY_LINE,
  PENALTY_SPOT,
  ROBOT_R,
  STOP_DIST,
  label,
  openGoal,
  ownGoal,
  passOptions,
  type Match,
  type Robot,
  type Vec,
} from './sim';

export const S = 0.2;
export const W = (HL + BOUNDARY) * 2 * S; // 1310
export const H = (HW + BOUNDARY) * 2 * S; // 910

export const COL = {
  carpet: '#2a8c45',
  line: '#ffffff',
  ball: '#ff8c1a',
  blue: '#2f6fff',
  yellow: '#ffd400',
  pink: '#ff5ad2',
  green: '#63ff7d',
  cover: '#121512',
};

/** The four ID markers around the team dot, in mm in the robot's frame (x forward). */
export const ID_DOTS: [number, number][] = [
  [35, -54],
  [35, 54],
  [-46, 46],
  [-46, -46],
];
/** Which markers are pink for an ID (the rest are green): four bits, sixteen robots per team. */
export const idPattern = (id: number) => [8, 4, 2, 1].map((bit) => (id & bit) !== 0);

export interface Overlays {
  vision: boolean;
  velocity: boolean;
  paths: boolean;
  lanes: boolean;
}

/** The carpet and its lighting, from the page's tokens: floodlit for the night match, sunlit by day. */
export interface Pitch {
  carpet: string;
  glow: string;
  shade: string;
  wall: string;
}

export const FLOODLIT: Pitch = {
  carpet: COL.carpet,
  glow: 'rgba(255,255,255,0.05)',
  shade: 'rgba(0,0,0,0.2)',
  wall: '#0e1410',
};

export interface View {
  portrait: boolean;
  /** Canvas units per CSS pixel, so text and strokes keep a readable size at any width. */
  ui: number;
  mono: string;
  display: string;
  cursor: Vec | null;
  pitch: Pitch;
}

const X = (x: number) => (x + HL + BOUNDARY) * S;
const Y = (y: number) => (y + HW + BOUNDARY) * S;
const teamCol = (r: Robot) => (r.team === 'blue' ? COL.blue : COL.yellow);
/** Overlay strokes and text: the blue team colour is too dark to read on the carpet. */
const overlayCol = (r: Robot) => (r.team === 'blue' ? '#a9c2ff' : COL.yellow);

/** Hash noise for the vision jitter: the same frame always detects the same way. */
const noise = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

function field(ctx: CanvasRenderingContext2D, v: View) {
  const p = v.pitch;
  ctx.fillStyle = p.carpet;
  ctx.fillRect(0, 0, W, H);

  // two overhead cameras, each lighting and vignetting its own half
  for (const k of [0, 1]) {
    const cx = W / 4 + (k * W) / 2;
    const g = ctx.createRadialGradient(cx, H / 2, 40, cx, H / 2, W * 0.4);
    g.addColorStop(0, p.glow);
    g.addColorStop(1, p.shade);
    ctx.fillStyle = g;
    ctx.fillRect((k * W) / 2, 0, W / 2, H);
  }

  ctx.strokeStyle = COL.line;
  ctx.lineWidth = Math.max(10 * S, 1.1 * v.ui);
  ctx.beginPath();
  ctx.rect(X(-HL), Y(-HW), HL * 2 * S, HW * 2 * S);
  ctx.moveTo(X(0), Y(-HW));
  ctx.lineTo(X(0), Y(HW));
  ctx.moveTo(X(CENTER_R), Y(0));
  ctx.arc(X(0), Y(0), CENTER_R * S, 0, Math.PI * 2);
  // defense areas: two quarter circles joined by a straight stretch (2010 rules)
  const r = DEF_R * S,
    h = DEF_STRETCH / 2;
  ctx.moveTo(X(-HL), Y(-h - DEF_R));
  ctx.arc(X(-HL), Y(-h), r, -Math.PI / 2, 0);
  ctx.lineTo(X(-HL + DEF_R), Y(h));
  ctx.arc(X(-HL), Y(h), r, 0, Math.PI / 2);
  ctx.moveTo(X(HL), Y(-h - DEF_R));
  ctx.arc(X(HL), Y(-h), r, -Math.PI / 2, -Math.PI, true);
  ctx.lineTo(X(HL - DEF_R), Y(h));
  ctx.arc(X(HL), Y(h), r, Math.PI, Math.PI / 2, true);
  ctx.stroke();

  ctx.fillStyle = COL.line;
  for (const x of [0, -HL + PENALTY_SPOT, HL - PENALTY_SPOT]) {
    ctx.beginPath();
    ctx.arc(X(x), Y(0), Math.max(2, 0.9 * v.ui), 0, Math.PI * 2);
    ctx.fill();
  }

  // goals: 700 mm wide, 180 mm deep, with 20 mm walls
  for (const s of [-1, 1]) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(
      Math.min(X(s * HL), X(s * (HL + GOAL_DEPTH))),
      Y(-GOAL_HALF),
      GOAL_DEPTH * S,
      GOAL_HALF * 2 * S,
    );
    ctx.strokeStyle = '#d9dfda';
    ctx.lineWidth = Math.max(GOAL_WALL * S * 1.4, 1.4 * v.ui);
    ctx.beginPath();
    ctx.moveTo(X(s * HL), Y(-GOAL_HALF - GOAL_WALL / 2));
    ctx.lineTo(X(s * (HL + GOAL_DEPTH + GOAL_WALL / 2)), Y(-GOAL_HALF - GOAL_WALL / 2));
    ctx.lineTo(X(s * (HL + GOAL_DEPTH + GOAL_WALL / 2)), Y(GOAL_HALF + GOAL_WALL / 2));
    ctx.lineTo(X(s * HL), Y(GOAL_HALF + GOAL_WALL / 2));
    ctx.stroke();
  }

  // the wall around the carpet
  ctx.strokeStyle = p.wall;
  ctx.lineWidth = 3 * v.ui;
  ctx.strokeRect(0, 0, W, H);
}

function robot(ctx: CanvasRenderingContext2D, r: Robot, m: Match) {
  const R = ROBOT_R * S,
    f = Math.acos(FRONT / ROBOT_R);
  ctx.save();
  ctx.translate(X(r.x), Y(r.y));
  ctx.rotate(r.a);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(1.5, 2, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, R, f, Math.PI * 2 - f);
  ctx.closePath();
  ctx.fillStyle = COL.cover;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.stroke();
  // dribbler bar across the flat front
  const half = Math.sin(f) * R * 0.78;
  ctx.strokeStyle = '#8b938c';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(FRONT * S - 1.6, -half);
  ctx.lineTo(FRONT * S - 1.6, half);
  ctx.stroke();
  // team dot and the ID pattern
  ctx.fillStyle = teamCol(r);
  ctx.beginPath();
  ctx.arc(0, 0, 25 * S, 0, Math.PI * 2);
  ctx.fill();
  idPattern(r.id).forEach((pink, k) => {
    ctx.fillStyle = pink ? COL.pink : COL.green;
    ctx.beginPath();
    ctx.arc(ID_DOTS[k][0] * S, ID_DOTS[k][1] * S, 20 * S, 0, Math.PI * 2);
    ctx.fill();
  });
  // kicker flash
  const since = m.t - r.kickedAt;
  if (since >= 0 && since < 0.14) {
    ctx.strokeStyle = `rgba(255,255,255,${1 - since / 0.14})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(FRONT * S, 0, 8 + since * 120, -1.1, 1.1);
    ctx.stroke();
  }
  ctx.restore();
}

function ball(ctx: CanvasRenderingContext2D, m: Match, v: View) {
  const b = m.ball;
  const t = b.trail;
  ctx.lineCap = 'round';
  for (let i = 1; i < t.length; i++) {
    ctx.strokeStyle = `rgba(255,140,26,${(i / t.length) * 0.55})`;
    ctx.lineWidth = Math.max(BALL_R * S, 1.6 * v.ui) * (i / t.length) * 1.4;
    ctx.beginPath();
    ctx.moveTo(X(t[i - 1].x), Y(t[i - 1].y));
    ctx.lineTo(X(t[i].x), Y(t[i].y));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  const r = Math.max(BALL_R * S, 2.6 * v.ui);
  const g = ctx.createRadialGradient(X(b.x), Y(b.y), r * 0.5, X(b.x), Y(b.y), r * 3.2);
  g.addColorStop(0, 'rgba(255,140,26,0.55)');
  g.addColorStop(1, 'rgba(255,140,26,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(X(b.x), Y(b.y), r * 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.ball;
  ctx.beginPath();
  ctx.arc(X(b.x), Y(b.y), r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(X(b.x) - r * 0.35, Y(b.y) - r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: string,
  w: number,
) {
  const len = Math.hypot(dx, dy);
  if (len < 3) return;
  const a = Math.atan2(dy, dx),
    head = Math.min(7, len * 0.4) * (w / 1.6);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - Math.cos(a - 0.45) * head, y + dy - Math.sin(a - 0.45) * head);
  ctx.lineTo(x + dx - Math.cos(a + 0.45) * head, y + dy - Math.sin(a + 0.45) * head);
  ctx.fill();
}

function paths(ctx: CanvasRenderingContext2D, m: Match, v: View) {
  for (const r of m.robots) {
    const c = overlayCol(r);
    if (r.tree.length) {
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 0.8 * v.ui;
      ctx.beginPath();
      for (let i = 0; i < r.tree.length; i += 4) {
        ctx.moveTo(X(r.tree[i]), Y(r.tree[i + 1]));
        ctx.lineTo(X(r.tree[i + 2]), Y(r.tree[i + 3]));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (Math.hypot(r.tx - r.x, r.ty - r.y) < 70) continue;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.3 * v.ui;
    ctx.setLineDash([5 * v.ui, 4 * v.ui]);
    ctx.beginPath();
    ctx.moveTo(X(r.x), Y(r.y));
    for (const p of r.path.slice(1)) ctx.lineTo(X(p.x), Y(p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.2 * v.ui;
    ctx.beginPath();
    ctx.arc(X(r.tx), Y(r.ty), ROBOT_R * S * 0.55, 0, Math.PI * 2);
    ctx.moveTo(X(r.tx), Y(r.ty));
    ctx.lineTo(X(r.tx) + Math.cos(r.ta) * ROBOT_R * S, Y(r.ty) + Math.sin(r.ta) * ROBOT_R * S);
    ctx.stroke();
  }
}

/** Pass options and the open part of the goal, for the team on the ball. */
function lanes(ctx: CanvasRenderingContext2D, m: Match, v: View, labels: Label[]) {
  const b = m.ball;
  const team = m.poss;
  const holder = b.holder >= 0 ? b.holder : -1;
  const shot = openGoal(m, b, team);
  if (shot.width > 0.005) {
    ctx.fillStyle = 'rgba(255,140,26,0.2)';
    ctx.strokeStyle = 'rgba(255,170,80,0.75)';
    ctx.lineWidth = 1 * v.ui;
    ctx.beginPath();
    ctx.moveTo(X(b.x), Y(b.y));
    ctx.lineTo(X(shot.gx), Y(shot.y0));
    ctx.lineTo(X(shot.gx), Y(shot.y1));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    labels.push({
      x: shot.gx - Math.sign(shot.gx) * 260,
      y: shot.target.y - 420,
      text: `open ${((shot.width * 180) / Math.PI).toFixed(1)}°`,
      color: '#ffc58a',
    });
  }
  for (const o of passOptions(m, b, team, holder)) {
    const t = m.robots[o.to];
    const hue = Math.round(o.score * 125);
    ctx.strokeStyle = `hsla(${hue},95%,58%,0.9)`;
    ctx.lineWidth = (1 + o.score * 2.2) * v.ui;
    ctx.setLineDash(o.score < 0.3 ? [3 * v.ui, 4 * v.ui] : []);
    ctx.beginPath();
    ctx.moveTo(X(b.x), Y(b.y));
    ctx.lineTo(X(t.x), Y(t.y));
    ctx.stroke();
    ctx.setLineDash([]);
    labels.push({
      x: (b.x + t.x) / 2,
      y: (b.y + t.y) / 2,
      text: o.score.toFixed(2).slice(1),
      color: `hsl(${hue},95%,70%)`,
      box: true,
    });
  }
}

function rules(ctx: CanvasRenderingContext2D, m: Match, v: View, labels: Label[]) {
  const b = m.ball,
    c = m.cmd.type;
  const keepOut =
    c === 'STOP' ||
    c === 'BALL_PLACEMENT' ||
    (!m.running && (c === 'DIRECT_FREE' || c === 'PREPARE_PENALTY'));
  if (keepOut) {
    ctx.strokeStyle = 'rgba(255,90,70,0.85)';
    ctx.lineWidth = 1.2 * v.ui;
    ctx.setLineDash([4 * v.ui, 4 * v.ui]);
    ctx.beginPath();
    ctx.arc(X(b.x), Y(b.y), STOP_DIST * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (c === 'BALL_PLACEMENT' && m.placeTo) {
    const p = m.placeTo;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4 * v.ui;
    ctx.setLineDash([2 * v.ui, 3 * v.ui]);
    ctx.beginPath();
    ctx.moveTo(X(b.x), Y(b.y));
    ctx.lineTo(X(p.x), Y(p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), 150 * S, 0, Math.PI * 2);
    ctx.moveTo(X(p.x) - 12, Y(p.y));
    ctx.lineTo(X(p.x) + 12, Y(p.y));
    ctx.moveTo(X(p.x), Y(p.y) - 12);
    ctx.lineTo(X(p.x), Y(p.y) + 12);
    ctx.stroke();
    labels.push({ x: p.x, y: p.y - 260, text: 'placement ±150 mm', color: '#ffffff' });
  }
  if (
    (c === 'PREPARE_PENALTY' || (c === 'NORMAL_START' && m.restart === 'penalty' && !m.running)) &&
    m.restartTeam
  ) {
    const gx = ownGoal(m, m.restartTeam === 'blue' ? 'yellow' : 'blue'),
      s = Math.sign(gx);
    const x = gx - s * (PENALTY_SPOT + PENALTY_LINE);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2 * v.ui;
    ctx.setLineDash([6 * v.ui, 5 * v.ui]);
    ctx.beginPath();
    ctx.moveTo(X(x), Y(-HW));
    ctx.lineTo(X(x), Y(HW));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function vision(ctx: CanvasRenderingContext2D, m: Match, v: View, labels: Label[]) {
  // camera footprints, overlapping across the halfway line
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1 * v.ui;
  ctx.setLineDash([2 * v.ui, 5 * v.ui]);
  ctx.strokeRect(X(-HL - 200), Y(-HW - 200), (HL + 450) * S, (HW + 200) * 2 * S);
  ctx.strokeRect(X(-250), Y(-HW - 190), (HL + 450) * S, (HW + 190) * 2 * S);
  ctx.setLineDash([]);

  const frame = Math.floor(m.steps / 2);
  const detail = v.ui < 2;
  for (const r of m.robots) {
    const jx = (noise(frame, r.i) - 0.5) * 22,
      jy = (noise(r.i, frame) - 0.5) * 22;
    const x = X(r.x + jx),
      y = Y(r.y + jy),
      h = (ROBOT_R + 34) * S,
      k = h * 0.45;
    ctx.strokeStyle = overlayCol(r);
    ctx.lineWidth = 1.2 * v.ui;
    ctx.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      ctx.moveTo(x + sx * h, y + sy * h - sy * k);
      ctx.lineTo(x + sx * h, y + sy * h);
      ctx.lineTo(x + sx * h - sx * k, y + sy * h);
    }
    ctx.stroke();
    if (detail)
      labels.push({
        x: r.x + jx + ROBOT_R + 40,
        y: r.y + jy - ROBOT_R - 50,
        text: `${label(r)} ${(0.9 + noise(frame + 7, r.i) * 0.095).toFixed(2).slice(1)}`,
        color: overlayCol(r),
        small: true,
        left: true,
      });
  }
  const b = m.ball;
  const bx = X(b.x + (noise(frame, 99) - 0.5) * 14),
    by = Y(b.y + (noise(99, frame) - 0.5) * 14);
  ctx.strokeStyle = COL.ball;
  ctx.lineWidth = 1.1 * v.ui;
  ctx.beginPath();
  ctx.arc(bx, by, 70 * S, 0, Math.PI * 2);
  ctx.moveTo(bx - 110 * S, by);
  ctx.lineTo(bx - 40 * S, by);
  ctx.moveTo(bx + 40 * S, by);
  ctx.lineTo(bx + 110 * S, by);
  ctx.moveTo(bx, by - 110 * S);
  ctx.lineTo(bx, by - 40 * S);
  ctx.moveTo(bx, by + 40 * S);
  ctx.lineTo(bx, by + 110 * S);
  ctx.stroke();
  if (detail)
    labels.push({
      x: b.x + 120,
      y: b.y + 150,
      text: `ball ${(0.88 + noise(frame, 5) * 0.1).toFixed(2).slice(1)}`,
      color: '#ffb366',
      small: true,
      left: true,
    });
}

function velocities(ctx: CanvasRenderingContext2D, m: Match, v: View) {
  for (const r of m.robots) {
    const sp = Math.hypot(r.vx, r.vy);
    if (sp < 120) continue;
    arrow(
      ctx,
      X(r.x),
      Y(r.y),
      r.vx * 0.35 * S,
      r.vy * 0.35 * S,
      r.team === 'blue' ? '#9db9ff' : '#fff08a',
      1.4 * v.ui,
    );
  }
  const b = m.ball,
    sp = Math.hypot(b.vx, b.vy);
  if (sp > 60 && b.holder < 0) {
    // where it will stop, with rolling friction alone
    const d = (sp * sp) / (2 * DECEL),
      ex = b.x + (b.vx / sp) * d,
      ey = b.y + (b.vy / sp) * d;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1 * v.ui;
    ctx.setLineDash([3 * v.ui, 4 * v.ui]);
    ctx.beginPath();
    ctx.moveTo(X(b.x), Y(b.y));
    ctx.lineTo(X(ex), Y(ey));
    ctx.stroke();
    ctx.setLineDash([]);
    const k = 4 * v.ui;
    ctx.beginPath();
    ctx.moveTo(X(ex) - k, Y(ey) - k);
    ctx.lineTo(X(ex) + k, Y(ey) + k);
    ctx.moveTo(X(ex) + k, Y(ey) - k);
    ctx.lineTo(X(ex) - k, Y(ey) + k);
    ctx.stroke();
    arrow(ctx, X(b.x), Y(b.y), b.vx * 0.3 * S, b.vy * 0.3 * S, '#ffffff', 1.6 * v.ui);
  }
}

interface Label {
  x: number;
  y: number;
  text: string;
  color: string;
  small?: boolean;
  box?: boolean;
  left?: boolean;
}

/** Draws one frame of the match. */
export function drawMatch(ctx: CanvasRenderingContext2D, m: Match, o: Overlays, v: View) {
  const cw = v.portrait ? H : W,
    ch = v.portrait ? W : H;
  const P = (x: number, y: number): [number, number] =>
    v.portrait ? [Y(y), W - X(x)] : [X(x), Y(y)];
  const labels: Label[] = [];

  ctx.save();
  if (v.portrait) {
    ctx.translate(0, W);
    ctx.rotate(-Math.PI / 2);
  }
  field(ctx, v);
  if (o.lanes) lanes(ctx, m, v, labels);
  if (o.paths) paths(ctx, m, v);
  rules(ctx, m, v, labels);
  ball(ctx, m, v);
  for (const r of m.robots) robot(ctx, r, m);
  if (o.vision) vision(ctx, m, v, labels);
  if (o.velocity) velocities(ctx, m, v);
  ctx.restore();

  // text, upright in screen space
  const fs = 10.5 * v.ui;
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${fs}px ${v.mono}`;
  ctx.textAlign = 'center';
  for (const r of m.robots) {
    const [x, y] = P(r.x, r.y);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(String(r.id), x + 1 - fs * 1.35, y + 1 - fs * 1.2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(r.id), x - fs * 1.35, y - fs * 1.2);
  }
  for (const l of labels) {
    const [x, y] = P(l.x, l.y);
    const size = l.small ? fs * 0.9 : fs;
    ctx.font = `600 ${size}px ${v.mono}`;
    ctx.textAlign = l.left ? 'left' : 'center';
    if (l.box) {
      const w = ctx.measureText(l.text).width + size * 0.8;
      ctx.fillStyle = 'rgba(8,14,10,0.78)';
      ctx.fillRect(x - w / 2, y - size * 0.75, w, size * 1.5);
    }
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, x, y);
  }

  if (o.vision) {
    ctx.font = `600 ${fs}px ${v.mono}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    const pad = 10 * v.ui;
    const frame = String(Math.floor(m.steps / 2)).padStart(6, '0');
    ctx.fillText(
      v.portrait ? `ssl-vision · frame ${frame}` : `ssl-vision · cam 0 + cam 1 · frame ${frame}`,
      pad,
      pad + fs * 0.4,
    );
    if (!v.portrait) {
      ctx.textAlign = 'right';
      ctx.fillText(`t_capture ${m.t.toFixed(3)} s`, cw - pad, pad + fs * 0.4);
    }
  }

  // goal and stoppage banners
  const flash = m.goalFlash && m.t - m.goalFlash.at < 2.6 ? m.goalFlash : null;
  const big = (text: string, color: string, sub: string, k = 1) => {
    const size = Math.min(cw, ch) * 0.16 * k;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k);
    ctx.fillStyle = 'rgba(8,14,10,0.62)';
    ctx.fillRect(0, ch / 2 - size * 0.9, cw, size * 1.8);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = `800 ${size}px ${v.display}`;
    ctx.fillText(text, cw / 2, ch / 2 - size * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${size * 0.2}px ${v.mono}`;
    ctx.fillText(sub, cw / 2, ch / 2 + size * 0.52);
    ctx.restore();
  };
  if (flash) {
    const k = Math.min(1, (m.t - flash.at) * 5);
    big(
      'GOAL',
      flash.team === 'blue' ? '#7fa6ff' : COL.yellow,
      `${flash.team.toUpperCase()} ${m.score.blue} : ${m.score.yellow}`,
      0.6 + 0.4 * k,
    );
  } else if (m.cmd.type === 'HALT') {
    big('HALT', '#ffffff', 'robots frozen · call a restart to play on');
  } else if (m.stage === 'NORMAL_HALF_TIME') {
    big('HALF TIME', '#ffffff', 'teams swap ends');
  } else if (m.stage === 'POST_GAME') {
    big('FULL TIME', '#ffffff', `BLUE ${m.score.blue} : ${m.score.yellow} YELLOW`);
  }

  // keyboard placement cursor
  if (v.cursor) {
    const [x, y] = P(v.cursor.x, v.cursor.y);
    const k = 16 * v.ui;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * v.ui;
    ctx.beginPath();
    ctx.arc(x, y, k * 0.6, 0, Math.PI * 2);
    ctx.moveTo(x - k, y);
    ctx.lineTo(x + k, y);
    ctx.moveTo(x, y - k);
    ctx.lineTo(x, y + k);
    ctx.stroke();
    ctx.font = `600 ${fs}px ${v.mono}`;
    const flip = x > cw * 0.7;
    ctx.textAlign = flip ? 'right' : 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Enter: place ball', flip ? x - k - 4 : x + k + 4, y - k * 0.6);
  }
}
