// Layer 2: the JavaScript event loop, scrubbed by scroll. The click becomes a task, the handler
// calls fetch(), the stack unwinds, a frame renders, the response queues a task, resolving the
// Promise queues a microtask, and microtasks drain before the next frame. Spec order, HTML §8.1.

import { C, fg, focusBox, hash, mono, panel, rgba, roundRect, stepAt, type Box } from '../kit';

type Phase = 'idle' | 'task' | 'micro' | 'render';

interface LoopState {
  stack: string[];
  apis: string[];
  tasks: string[];
  micro: string[];
  phase: Phase;
  caption: string;
}

export const LOOP: LoopState[] = [
  {
    stack: [],
    apis: [],
    tasks: [],
    micro: [],
    phase: 'idle',
    caption: 'The main thread is idle. The event loop waits for something to do.',
  },
  {
    stack: [],
    apis: [],
    tasks: ['click'],
    micro: [],
    phase: 'idle',
    caption: 'Pointer down, pointer up: the browser queues a click task.',
  },
  {
    stack: ['dispatchEvent(click)'],
    apis: [],
    tasks: [],
    micro: [],
    phase: 'task',
    caption: 'The loop takes the oldest task and runs it to completion.',
  },
  {
    stack: ['dispatchEvent(click)', 'onClick(e)', 'hire()'],
    apis: [],
    tasks: [],
    micro: [],
    phase: 'task',
    caption: 'Listeners run on the call stack, one frame per function call.',
  },
  {
    stack: ['dispatchEvent(click)', 'onClick(e)', 'hire()', "fetch('/api/hire')"],
    apis: ['fetch /api/hire'],
    tasks: [],
    micro: [],
    phase: 'task',
    caption: 'fetch() hands the request to the browser and returns a pending Promise.',
  },
  {
    stack: [],
    apis: ['fetch /api/hire'],
    tasks: [],
    micro: [],
    phase: 'render',
    caption: 'The stack unwinds, nothing blocks, and a frame paints the pressed button.',
  },
  {
    stack: [],
    apis: [],
    tasks: ['fetch response'],
    micro: [],
    phase: 'idle',
    caption: 'Bytes arrive. The networking task source queues a task.',
  },
  {
    stack: ['resolve(response)'],
    apis: [],
    tasks: [],
    micro: ['then(showThanks)'],
    phase: 'task',
    caption: 'Resolving the Promise queues a microtask, not a task.',
  },
  {
    stack: ['showThanks()'],
    apis: [],
    tasks: [],
    micro: [],
    phase: 'micro',
    caption: 'Microtasks drain before anything else runs. All of them.',
  },
  {
    stack: [],
    apis: [],
    tasks: [],
    micro: [],
    phase: 'render',
    caption: 'requestAnimationFrame, style, layout, paint: the button says thanks.',
  },
];

const PHASE_ANGLE: Record<Phase, number> = {
  idle: -Math.PI / 2,
  task: -Math.PI / 2,
  micro: Math.PI / 6,
  render: (5 * Math.PI) / 6,
};

interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draws a list keyed by label, sliding kept items and fading items in and out. */
function drawList(
  ctx: CanvasRenderingContext2D,
  prev: string[],
  next: string[],
  f: number,
  slot: (i: number) => Slot,
  color: string,
  t: number,
  top = -1,
) {
  const lerp = (a: number, b: number) => a + (b - a) * f;
  for (const label of prev) {
    if (next.includes(label)) continue;
    const r = slot(prev.indexOf(label));
    drawItem(ctx, label, { ...r, y: r.y - 14 * f }, color, 1 - f, false, t);
  }
  next.forEach((label, i) => {
    const j = prev.indexOf(label);
    const to = slot(i);
    const r =
      j >= 0
        ? { ...to, x: lerp(slot(j).x, to.x), y: lerp(slot(j).y, to.y) }
        : { ...to, y: to.y + 14 * (1 - f) };
    drawItem(ctx, label, r, color, j >= 0 ? 1 : f, i === (top < 0 ? next.length - 1 : top), t);
  });
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  label: string,
  r: Slot,
  color: string,
  alpha: number,
  hot: boolean,
  t: number,
) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  roundRect(ctx, r.x, r.y, r.w, r.h, 7);
  ctx.fillStyle = hot ? color : fg(0.06);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = hot ? 0 : 1.2;
  if (!hot) ctx.stroke();
  if (hot) {
    ctx.globalAlpha = alpha * (0.35 + 0.25 * Math.sin(t * 5));
    roundRect(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 9);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  ctx.fillStyle = hot ? C.on : C.fg;
  ctx.font = mono(Math.min(12, r.h * 0.4), 600);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let s = label;
  while (ctx.measureText(s).width > r.w - 20 && s.length > 4) s = s.slice(0, -2);
  ctx.fillText(s === label ? s : `${s}…`, r.x + 10, r.y + r.h / 2 + 0.5);
  ctx.globalAlpha = 1;
}

function lane(ctx: CanvasRenderingContext2D, b: Box, label: string, color: string, note: string) {
  panel(ctx, b, label, color);
  ctx.font = mono(9);
  ctx.fillStyle = fg(0.45);
  ctx.textAlign = 'right';
  ctx.fillText(note, b.x + b.w - 12, b.y + b.h - 11);
  ctx.textAlign = 'left';
}

export function drawLoop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  p: number,
) {
  ctx.clearRect(0, 0, w, h);
  const B = focusBox(w, h);
  const { k, f } = stepAt(p, LOOP.length);
  const prev = LOOP[Math.max(0, k - 1)],
    next = LOOP[k];
  const narrow = B.w < 520;
  const gap = narrow ? 14 : 20;

  const stackB: Box = { x: B.x, y: B.y + 8, w: B.w * (narrow ? 0.54 : 0.46), h: B.h * 0.5 };
  const apiB: Box = {
    x: stackB.x + stackB.w + gap,
    y: stackB.y,
    w: B.w - stackB.w - gap,
    h: B.h * 0.17,
  };
  const ringBox: Box = {
    x: apiB.x,
    y: apiB.y + apiB.h + gap,
    w: apiB.w,
    h: stackB.h - apiB.h - gap,
  };
  const taskB: Box = {
    x: B.x,
    y: stackB.y + stackB.h + gap * 1.4,
    w: B.w,
    h: Math.min(84, B.h * 0.16),
  };
  const microB: Box = { x: B.x, y: taskB.y + taskB.h + gap * 1.4, w: B.w, h: taskB.h };

  // Call stack: frames pile up from the bottom.
  panel(ctx, stackB, 'CALL STACK', C.yellow);
  const fh = Math.min(38, (stackB.h - 40) / 4.6);
  drawList(
    ctx,
    prev.stack,
    next.stack,
    f,
    (i) => ({
      x: stackB.x + 12,
      y: stackB.y + stackB.h - 14 - (i + 1) * (fh + 8) + 8,
      w: stackB.w - 24,
      h: fh,
    }),
    C.yellow,
    t,
  );
  if (!next.stack.length) {
    ctx.font = mono(10);
    ctx.fillStyle = fg(0.35);
    ctx.fillText('(empty)', stackB.x + 14, stackB.y + stackB.h - 26);
  }

  // Web APIs: work the browser does off the main thread.
  panel(ctx, apiB, 'WEB APIS', C.violet);
  drawList(
    ctx,
    prev.apis,
    next.apis,
    f,
    () => ({ x: apiB.x + 12, y: apiB.y + apiB.h / 2 - fh / 2 + 2, w: apiB.w - 60, h: fh }),
    C.violet,
    t,
    99,
  );
  if (next.apis.length) {
    const cx = apiB.x + apiB.w - 26,
      cy = apiB.y + apiB.h / 2 + 2;
    ctx.strokeStyle = C.violet;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, t * 6, t * 6 + 4.2);
    ctx.stroke();
  }

  // The loop itself: a ring with three stops, and a marker that moves to the current phase.
  const cx = ringBox.x + ringBox.w / 2,
    cy = ringBox.y + ringBox.h / 2;
  const r = Math.max(20, Math.min(ringBox.w * 0.3, ringBox.h * 0.34));
  ctx.strokeStyle = fg(0.14);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const stops: [Phase, string, string][] = [
    ['task', 'task', C.orange],
    ['micro', 'microtasks', C.teal],
    ['render', 'render', C.violet],
  ];
  ctx.font = mono(narrow ? 9 : 10, 600);
  ctx.textBaseline = 'middle';
  for (const [ph, name, col] of stops) {
    const a = PHASE_ANGLE[ph];
    const on = next.phase === ph;
    ctx.fillStyle = on ? col : fg(0.4);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, on ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    const ly = cy + Math.sin(a) * (r + 16);
    const tw = ctx.measureText(name).width;
    // Keep labels inside the ring's box: below the ring when there's no room beside it.
    let lx =
      cx + Math.cos(a) * (r + 14) - (Math.cos(a) > 0.3 ? 0 : Math.cos(a) < -0.3 ? tw : tw / 2);
    let yy = ph === 'task' ? ly - 6 : ly;
    if (lx < ringBox.x || lx + tw > ringBox.x + ringBox.w) {
      lx = Math.min(Math.max(lx, ringBox.x), ringBox.x + ringBox.w - tw);
      yy += 16;
    }
    ctx.textAlign = 'left';
    ctx.fillText(name, lx, yy);
  }
  const target = PHASE_ANGLE[next.phase] + (next.phase === 'idle' ? t * 1.6 : 0);
  ctx.strokeStyle = next.phase === 'idle' ? rgba('yellow', 0.6) : C.yellow;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, target - 0.45, target + 0.05);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.textAlign = 'center';
  ctx.fillStyle = C.fg;
  ctx.font = mono(narrow ? 9 : 10, 600);
  ctx.fillText('EVENT', cx, cy - 7);
  ctx.fillText('LOOP', cx, cy + 7);
  if (next.phase === 'render') {
    // The rendering steps of one frame, lit in turn.
    const steps = ['rAF', 'style', 'layout', 'paint'];
    const lit = Math.floor((t * 4) % 5);
    const sw = Math.min(64, (ringBox.w - 8) / 4 - 4);
    steps.forEach((name, i) => {
      const x = ringBox.x + ringBox.w / 2 + (i - 2) * (sw + 4) + 2;
      const y = ringBox.y + ringBox.h - 8;
      roundRect(ctx, x, y - 9, sw, 18, 9);
      ctx.fillStyle = i < lit ? C.violet : rgba('violet', 0.15);
      ctx.fill();
      ctx.fillStyle = i < lit ? C.fg : fg(0.6);
      ctx.font = mono(9, 600);
      ctx.fillText(name, x + sw / 2, y + 0.5);
    });
  }
  ctx.textAlign = 'left';

  // Queues: oldest on the left, taken first.
  lane(ctx, taskB, 'TASK QUEUE', C.orange, 'one per turn');
  lane(ctx, microB, 'MICROTASK QUEUE', C.teal, 'drained every turn');
  const qw = Math.min(200, B.w * 0.42),
    qh = Math.min(34, taskB.h - 30);
  drawList(
    ctx,
    prev.tasks,
    next.tasks,
    f,
    (i) => ({
      x: taskB.x + 14 + i * (qw + 10),
      y: taskB.y + taskB.h / 2 - qh / 2 + 2,
      w: qw,
      h: qh,
    }),
    C.orange,
    t,
    0,
  );
  drawList(
    ctx,
    prev.micro,
    next.micro,
    f,
    (i) => ({
      x: microB.x + 14 + i * (qw + 10),
      y: microB.y + microB.h / 2 - qh / 2 + 2,
      w: qw,
      h: qh,
    }),
    C.teal,
    t,
    0,
  );

  // Background noise: other tasks that come and go, so the loop never looks staged.
  for (let i = 0; i < 4; i++) {
    const phase = (t * 0.35 + hash(i) * 4) % 4;
    if (phase > 1) continue;
    const x = taskB.x + taskB.w - 24 - phase * (taskB.w * 0.35);
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.35;
    ctx.fillStyle = C.orange;
    ctx.fillRect(x, taskB.y + taskB.h - 8, 14, 3);
    ctx.globalAlpha = 1;
  }
}
