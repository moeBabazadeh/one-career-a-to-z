// Collaborators on the board: cursors that wander between frames, Moe's guided tour, and the
// laser-pointer trails. Plain functions over plain state, stepped once per animation frame.

import type { BoardApi } from './board';
import { DIAGRAM, FRAMES } from './geometry';
import type { Pt } from './rough';

export type PeerId = 'moe' | 'pm' | 'design';

export interface Walker {
  x: number;
  y: number;
  from: Pt;
  to: Pt;
  bend: number;
  t0: number;
  dur: number;
  until: number;
  moving: boolean;
  on: boolean;
  seed: number;
}

export interface Tour {
  i: number;
  next: number;
  circle: { at: number; cx: number; cy: number; rest: Pt; rested: boolean } | null;
}

export interface Trail {
  p: Pt;
  t: number;
}

const TRAIL_MS = 600;
const CIRCLE_S = 1.1;
/** Seconds Moe spends on each frame of the tour. */
export const TOUR_DWELL = 7;

export const walker = (start: Pt, on: boolean, seed: number): Walker => ({
  x: start[0],
  y: start[1],
  from: start,
  to: start,
  bend: 0,
  t0: 0,
  dur: 1,
  until: 2 + seed,
  moving: false,
  on,
  seed,
});

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A random spot worth looking at: somewhere inside a frame or the diagram. */
function somewhere(): Pt {
  const rects = [DIAGRAM, DIAGRAM, ...FRAMES.map((f) => f.rect)];
  const r = rects[Math.floor(Math.random() * rects.length)];
  return [r.x + r.w * (0.12 + Math.random() * 0.76), r.y + r.h * (0.15 + Math.random() * 0.7)];
}

/** Sends a cursor towards `to` on a gently bent path, at roughly `speed` units a second. */
export function walk(w: Walker, to: Pt, now: number, speed: number, reduced: boolean) {
  w.from = [w.x, w.y];
  w.to = to;
  w.t0 = now;
  w.dur = reduced
    ? 0.001
    : Math.min(3.2, Math.max(0.6, Math.hypot(to[0] - w.x, to[1] - w.y) / speed));
  w.bend = (Math.random() - 0.5) * 0.5;
  w.moving = true;
}

export interface Frame {
  sec: number;
  dt: number;
  board: BoardApi;
  walkers: Record<PeerId, Walker>;
  tour: Tour | null;
  follow: PeerId | null;
  reduced: boolean;
  onTourStep: (i: number) => void;
  onTourEnd: () => void;
}

/** Advances the tour and every cursor by one frame. */
export function step(
  { sec, dt, board, walkers, tour, follow, reduced, onTourStep, onTourEnd }: Frame,
  moeTrail: Trail[],
) {
  const moe = walkers.moe;

  // Moe's tour: fly to each frame, circle its heading with the laser, give it a few seconds.
  if (tour && sec >= tour.next) {
    tour.i += 1;
    if (tour.i >= FRAMES.length) {
      onTourEnd();
      board.fly(board.fit(DIAGRAM));
    } else {
      const f = FRAMES[tour.i].rect;
      // Circle the heading, then step aside to the frame's empty top-right corner.
      const rest: Pt = [f.x + f.w - 150, f.y + 70];
      board.fly(board.fit(f, 1.1));
      moe.on = true;
      walk(moe, reduced ? rest : [f.x + 70, f.y + 150], sec, 2200, reduced);
      tour.circle = reduced
        ? null
        : { at: sec + moe.dur + 0.15, cx: f.x + 210, cy: f.y + 118, rest, rested: false };
      tour.next = sec + TOUR_DWELL;
      onTourStep(tour.i);
    }
  }

  for (const id of ['moe', 'pm', 'design'] as PeerId[]) {
    const w = walkers[id];
    const c = id === 'moe' ? tour?.circle : null;
    if (c && sec >= c.at && sec < c.at + CIRCLE_S) {
      const a = -Math.PI * 0.9 + Math.PI * 2.25 * easeInOut((sec - c.at) / CIRCLE_S);
      w.x = c.cx + Math.cos(a) * 190;
      w.y = c.cy + Math.sin(a) * 52;
      w.to = [w.x, w.y];
      moeTrail.push({ p: [w.x, w.y], t: sec * 1000 });
      continue;
    }
    if (c && !c.rested && sec >= c.at + CIRCLE_S) {
      c.rested = true;
      walk(w, c.rest, sec, 1600, reduced);
    }
    if (w.moving) {
      const k = Math.min(1, (sec - w.t0) / w.dur),
        e = easeInOut(k);
      const dx = w.to[0] - w.from[0],
        dy = w.to[1] - w.from[1],
        len = Math.hypot(dx, dy) || 1;
      const lift = Math.sin(Math.PI * e) * w.bend * len * 0.3;
      w.x = w.from[0] + dx * e - (dy / len) * lift;
      w.y = w.from[1] + dy * e + (dx / len) * lift;
      if (k >= 1) {
        w.moving = false;
        w.until = sec + 1.6 + Math.random() * 3.6;
      }
    } else if (!reduced) {
      // A resting hand still drifts a little, then wanders off to look at something else.
      w.x = w.to[0] + Math.sin(sec * 1.7 + w.seed * 3) * 3;
      w.y = w.to[1] + Math.cos(sec * 1.3 + w.seed * 5) * 2;
      if (!(id === 'moe' && tour) && w.on && sec > w.until)
        walk(w, somewhere(), sec, id === 'moe' ? 520 : 760, reduced);
    }
  }

  // Following someone keeps their cursor in the middle of the screen.
  if (follow && follow !== 'moe') {
    const w = walkers[follow];
    board.nudge(
      { x: w.x, y: w.y, z: Math.max(0.6, Math.min(1, board.camera().z)) },
      1 - Math.exp(-dt * 2.4),
    );
  }
}

/** The visible part of a laser trail as path data; older points fall off the tail. */
export function trail(points: Trail[], nowMs: number) {
  while (points.length && nowMs - points[0].t > TRAIL_MS) points.shift();
  return points.length > 1
    ? points.map(({ p }, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')
    : '';
}
