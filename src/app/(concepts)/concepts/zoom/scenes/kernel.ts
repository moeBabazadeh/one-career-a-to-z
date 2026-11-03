// Layer 7: the server's process as the kernel sees it. Scroll steps through an strace of the
// request, each syscall trapping from ring 3 into the kernel subsystem that serves it; under
// it the scheduler hands four cores between processes in time slices.

import { db } from '../../_shared/data';
import {
  C,
  clamp,
  fg,
  fitText,
  focusBox,
  hash,
  mono,
  rgba,
  roundRect,
  stepAt,
  type Box,
} from '../kit';

interface Call {
  line: string;
  sys: 'net' | 'vfs' | 'sched';
}

// The Postgres simple-query message: 'Q', an int32 length (48), the SQL, a NUL.
const CALLS: Call[] = [
  { line: 'epoll_wait(5, [{events=EPOLLIN, data={u32=6}}], 512, -1) = 1', sys: 'sched' },
  {
    line: 'accept4(6, {sa_family=AF_INET, sin_port=htons(51234)}, [16], SOCK_CLOEXEC) = 7',
    sys: 'net',
  },
  {
    line: `read(7, "POST /api/hire HTTP/1.1\\r\\nHost: ${db.person.site}"..., 8192) = 431`,
    sys: 'vfs',
  },
  {
    line: 'sendto(9, "Q\\0\\0\\0000SELECT title FROM archive WHERE"..., 49, MSG_NOSIGNAL, NULL, 0) = 49',
    sys: 'net',
  },
  {
    line: 'recvfrom(9, "T\\0\\0\\0\\36\\0\\1title\\0"..., 16384, 0, NULL, NULL) = 132',
    sys: 'net',
  },
  {
    line: 'writev(7, [{iov_base="HTTP/1.1 200 OK\\r\\n"..., iov_len=17}, {...}], 2) = 289',
    sys: 'vfs',
  },
  { line: 'close(7) = 0', sys: 'vfs' },
];

export const KERNEL_CAPTIONS = [
  'epoll_wait: the server sleeps until a socket has data. No CPU spent waiting.',
  'accept4: the new connection becomes file descriptor 7.',
  'read: the request bytes are copied from kernel buffers into user space.',
  'sendto: a query to the database, in Postgres’s wire protocol: Q, a length, the SQL.',
  'recvfrom: the rows come back, starting with a RowDescription.',
  'writev: status line, headers and body leave in one call.',
  'close: descriptor 7 is free. Between every one of these, the scheduler chose who ran next.',
];

// Read at paint time: the colours follow the scheme.
const PROCS: [string, () => string][] = [
  ['node', () => C.yellow],
  ['postgres', () => C.lilac],
  ['nginx', () => C.teal],
  ['kworker', () => fg(0.35)],
];

export function drawKernel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  p: number,
) {
  ctx.clearRect(0, 0, w, h);
  const B = focusBox(w, h);
  const narrow = B.w < 520;
  const { k, f } = stepAt(p, CALLS.length);

  // strace.
  const lh = narrow ? 15 : 19;
  const sb: Box = { x: B.x, y: B.y, w: B.w, h: 34 + CALLS.length * lh };
  roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 8);
  ctx.fillStyle = C.wellKernel;
  ctx.fill();
  ctx.strokeStyle = rgba('teal', 0.3);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = mono(narrow ? 8 : 10);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg(0.5);
  ctx.fillText('$ strace -p 4242 -e trace=network,desc', sb.x + 12, sb.y + 15);
  CALLS.forEach((c, i) => {
    if (i > k) return;
    const y = sb.y + 34 + i * lh + lh / 2 - 4;
    const cur = i === k;
    const chars = cur ? Math.floor(c.line.length * clamp(f * 1.4)) : c.line.length;
    ctx.fillStyle = cur ? C.teal : fg(0.55);
    ctx.fillText(fitText(ctx, c.line.slice(0, Math.max(1, chars)), sb.w - 24), sb.x + 12, y);
  });

  // Rings: user space above, the kernel below; the current call traps down and returns.
  const ry = sb.y + sb.h + (narrow ? 22 : 30);
  const rh = narrow ? 120 : 150;
  const userB: Box = { x: B.x, y: ry, w: B.w, h: rh * 0.36 };
  const kernB: Box = { x: B.x, y: ry + rh * 0.42, w: B.w, h: rh * 0.58 };
  ctx.fillStyle = fg(0.04);
  ctx.fillRect(userB.x, userB.y, userB.w, userB.h);
  ctx.fillStyle = rgba('teal', 0.07);
  ctx.fillRect(kernB.x, kernB.y, kernB.w, kernB.h);
  ctx.strokeStyle = C.teal;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(B.x, ry + rh * 0.39);
  ctx.lineTo(B.x + B.w, ry + rh * 0.39);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = mono(narrow ? 8 : 9.5, 600);
  ctx.fillStyle = fg(0.6);
  ctx.fillText('ring 3 · user space · node server.js', B.x + 10, userB.y + 14);
  ctx.fillStyle = C.teal;
  ctx.fillText('ring 0 · kernel', B.x + 10, kernB.y + 14);

  const subs: ['net' | 'vfs' | 'sched', string][] = [
    ['net', 'TCP/IP'],
    ['vfs', 'VFS · fds'],
    ['sched', 'scheduler'],
  ];
  const subW = (B.w - 40) / 3;
  const subX = (i: number) => B.x + 10 + i * (subW + 10);
  const active = CALLS[k].sys;
  subs.forEach(([id, name], i) => {
    const b: Box = { x: subX(i), y: kernB.y + 24, w: subW, h: kernB.h - 32 };
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = id === active ? rgba('teal', 0.22) : fg(0.04);
    ctx.fill();
    ctx.strokeStyle = id === active ? C.teal : fg(0.2);
    ctx.stroke();
    ctx.fillStyle = id === active ? C.fg : fg(0.55);
    ctx.textAlign = 'center';
    ctx.fillText(name, b.x + b.w / 2, b.y + b.h / 2);
    ctx.textAlign = 'left';
  });
  // The trap: syscall goes down, sysret comes back up.
  const ai = subs.findIndex(([id]) => id === active);
  const tx = subX(ai) + subW / 2;
  const q = (t * 0.9) % 1;
  const down = q < 0.5;
  const yy = down
    ? userB.y + userB.h * 0.7 + (kernB.y + 24 - userB.y - userB.h * 0.7) * (q / 0.5)
    : kernB.y + 24 - (kernB.y + 24 - userB.y - userB.h * 0.7) * ((q - 0.5) / 0.5);
  ctx.strokeStyle = rgba('yellow', 0.5);
  ctx.beginPath();
  ctx.moveTo(tx, userB.y + userB.h * 0.7);
  ctx.lineTo(tx, kernB.y + 24);
  ctx.stroke();
  ctx.fillStyle = C.yellow;
  ctx.beginPath();
  ctx.arc(tx, yy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = mono(narrow ? 7.5 : 9, 600);
  ctx.fillText(down ? 'syscall' : 'sysret', tx + 9, (userB.y + userB.h + kernB.y) / 2 + 2);

  // The scheduler: four cores, time slices scrolling left.
  const gy = ry + rh + (narrow ? 26 : 34);
  const gh = B.y + B.h - gy;
  if (gh < 60) return;
  const cores = 4,
    rowH = Math.min(30, (gh - 30) / cores);
  const labelW = narrow ? 34 : 46;
  const span = B.w - labelW;
  const slice = 0.55,
    pxs = narrow ? 50 : 70;
  ctx.font = mono(narrow ? 8 : 9.5, 600);
  ctx.fillStyle = fg(0.6);
  ctx.fillText('CFS run queues · 4 cores', B.x, gy - 2);
  for (let c = 0; c < cores; c++) {
    const y = gy + 12 + c * (rowH + 6);
    ctx.fillStyle = fg(0.5);
    ctx.font = mono(narrow ? 8 : 9);
    ctx.fillText(`cpu${c}`, B.x, y + rowH / 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(B.x + labelW, y, span, rowH);
    ctx.clip();
    const first = Math.floor((t - span / pxs) / slice) - 1;
    for (let n = first; n <= t / slice + 1; n++) {
      const r = hash(c * 977 + n);
      const len = slice * (0.4 + hash(n * 3 + c) * 0.9);
      const x0 = B.x + labelW + span - (t - n * slice) * pxs;
      const ww = len * pxs - 2;
      if (r < 0.14) continue;
      const proc = PROCS[r < 0.5 ? 0 : r < 0.75 ? 1 : r < 0.9 ? 2 : 3];
      ctx.fillStyle = proc[1]();
      ctx.globalAlpha = 0.85;
      roundRect(ctx, x0, y + 2, ww, rowH - 4, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (ww > 52) {
        ctx.fillStyle = C.on;
        ctx.font = mono(narrow ? 7.5 : 8.5, 600);
        ctx.fillText(proc[0], x0 + 6, y + rowH / 2 + 0.5);
      }
    }
    ctx.restore();
  }
  // "now" sits at the right edge.
  ctx.strokeStyle = C.fg;
  ctx.beginPath();
  ctx.moveTo(B.x + B.w - 0.5, gy + 8);
  ctx.lineTo(B.x + B.w - 0.5, gy + 12 + cores * (rowH + 6));
  ctx.stroke();
}
