// Layer 5: a load balancer in front of a pool. Requests arrive, take the next healthy instance
// in turn (round robin), are served and answer back. One instance fails its health checks,
// is drained out of rotation and comes back; scrolling raises the traffic, and the autoscaler
// adds instances that warm up before they take requests. Every number here is simulated.

import { C, clamp, fg, focusBox, hash, lerp, mono, rgba, roundRect, seg } from '../kit';

export const SERVER_CAPTIONS = [
  'The request reaches a load balancer: one address in front of many servers.',
  'Round robin: each healthy instance takes the next request in turn.',
  'Health checks every two seconds. Fail twice and an instance is drained out of rotation.',
  'Traffic climbs, the autoscaler adds instances, and each one warms up before it takes traffic.',
];

const CYCLE = 18;
const GAP = 0.055;

type Health = 'healthy' | 'failing' | 'draining' | 'recovering' | 'warming';

/** Instance 1 fails on a fixed cycle; instances past the first three exist once traffic needs them. */
function health(i: number, t: number, p: number): Health | null {
  const born = i < 3 ? -1 : 0.2 + (i - 3) * 0.22;
  if (born > p) return null;
  if (i >= 3 && p < born + 0.05) return 'warming';
  if (i === 1) {
    const u = t % CYCLE;
    if (u >= 7 && u < 9) return 'failing';
    if (u >= 9 && u < 14) return 'draining';
    if (u >= 14 && u < 16) return 'recovering';
  }
  return 'healthy';
}

const inRotation = (hl: Health | null) => hl === 'healthy' || hl === 'failing';

// Read at paint time: the colours follow the scheme.
const HUE = {
  healthy: 'teal',
  failing: 'yellow',
  draining: 'red',
  recovering: 'yellow',
  warming: 'violet',
} as const;
const color = (st: Health) => C[HUE[st]];

export function drawServers(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  p: number,
) {
  ctx.clearRect(0, 0, w, h);
  const B = focusBox(w, h);
  const narrow = B.w < 520;
  const max = narrow ? 5 : 6;
  const ids = Array.from({ length: max }, (_, i) => i);
  const states = ids.map((i) => health(i, t, p));
  const live = ids.filter((i) => states[i]);
  const density = lerp(0.25, 0.95, seg(p, 0.1, 0.95));

  const lbY = B.y + B.h * 0.2,
    lbH = 46,
    lbW = Math.min(B.w * 0.8, 440),
    lbX = B.x + (B.w - lbW) / 2;
  const poolY = B.y + B.h * 0.48,
    poolH = Math.min(B.h * 0.32, 230);
  const iw = (B.w - (max - 1) * 10) / max;
  const ix = (i: number) => B.x + i * (iw + 10);

  // Instances.
  ids.forEach((i) => {
    const st = states[i];
    const x = ix(i);
    ctx.globalAlpha = st ? 1 : 0.22;
    roundRect(ctx, x, poolY, iw, poolH, 9);
    ctx.fillStyle = fg(0.04);
    ctx.fill();
    ctx.strokeStyle = st ? color(st) : fg(0.3);
    ctx.setLineDash(st ? [] : [4, 4]);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
    // Rack units.
    for (let u = 0; u < 3; u++) {
      const uy = poolY + 36 + u * 14;
      ctx.fillStyle = fg(0.08);
      ctx.fillRect(x + 10, uy, iw - 20, 9);
      if (st && st !== 'draining') {
        ctx.fillStyle = hash(i * 7 + u + Math.floor(t * 8)) > 0.5 ? color(st) : fg(0.25);
        ctx.fillRect(x + iw - 18, uy + 3, 4, 3);
      }
    }
    ctx.font = mono(narrow ? 8.5 : 10, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.fg;
    ctx.fillText(`i-0${i + 1}`, x + 10, poolY + 16);
    ctx.fillStyle = st ? color(st) : fg(0.4);
    ctx.beginPath();
    ctx.arc(x + iw - 14, poolY + 16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = mono(narrow ? 7.5 : 9);
    ctx.fillText(st ?? 'off', x + 10, poolY + poolH - 14);
    ctx.globalAlpha = 1;
  });

  // Health checks: a pulse to every instance every two seconds.
  const hc = t % 2;
  if (hc < 0.6) {
    live.forEach((i) => {
      const st = states[i];
      const tx = ix(i) + iw / 2;
      const q = hc / 0.6;
      ctx.strokeStyle =
        st === 'failing' || st === 'draining' ? rgba('red', 0.55) : rgba('teal', 0.35);
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lbX + lbW / 2, lbY + lbH);
      ctx.lineTo(tx, poolY);
      ctx.stroke();
      ctx.setLineDash([]);
      if (q > 0.5 && !narrow) {
        ctx.font = mono(8.5, 600);
        ctx.textAlign = 'center';
        ctx.fillStyle = st === 'failing' || st === 'draining' ? C.red : C.teal;
        ctx.fillText(
          st === 'failing' || st === 'draining' ? '503' : '200',
          lerp(lbX + lbW / 2, tx, 0.62),
          lerp(lbY + lbH, poolY, 0.62) - 6,
        );
      }
    });
  }

  // Requests: in from the top, through the balancer, to the next instance in rotation, and back.
  const conns = ids.map(() => 0);
  const inbound = 0.45,
    hop = 0.4,
    back = 0.35;
  for (let n = Math.floor((t - 3) / GAP); n <= t / GAP; n++) {
    if (hash(n) > density) continue;
    const t0 = n * GAP,
      age = t - t0;
    if (age < 0) continue;
    const pool = ids.filter((i) => inRotation(health(i, t0 + inbound, p)));
    if (!pool.length) continue;
    const target = pool[((n % pool.length) + pool.length) % pool.length];
    const serve = 0.5 + hash(n * 3.1) * 0.9;
    const sx = B.x + 20 + hash(n * 1.7) * (B.w - 40);
    const tx = ix(target) + iw / 2,
      ty = poolY + 10;
    let x = 0,
      y = 0,
      col = C.orange,
      r = 3;
    if (age < inbound) {
      const q = age / inbound;
      x = lerp(sx, lbX + lbW / 2 + (sx - B.x - B.w / 2) * 0.2, q);
      y = lerp(B.y - 8, lbY, q * q);
    } else if (age < inbound + hop) {
      const q = (age - inbound) / hop;
      x = lerp(lbX + lbW / 2, tx, q);
      y = lerp(lbY + lbH, ty, q);
    } else if (age < inbound + hop + serve) {
      conns[target]++;
      const slot = conns[target] - 1;
      x = ix(target) + 14 + (slot % 6) * ((iw - 28) / 5);
      y = poolY + 88 + Math.floor(slot / 6) * 10;
      if (y > poolY + poolH - 30) continue;
      r = 2.5;
    } else if (age < inbound + hop + serve + back) {
      const q = (age - inbound - hop - serve) / back;
      x = lerp(tx, lbX + lbW / 2, q);
      y = lerp(ty, lbY + lbH, q);
      col = C.teal;
    } else if (age < inbound + hop + serve + back + inbound) {
      const q = (age - inbound - hop - serve - back) / inbound;
      x = lerp(lbX + lbW / 2, sx, q);
      y = lerp(lbY, B.y - 8, Math.sqrt(q));
      col = C.teal;
    } else continue;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Load bars from the live connection counts.
  ids.forEach((i) => {
    if (!states[i]) return;
    const load = clamp(conns[i] / 12);
    const x = ix(i) + 10,
      y = poolY + poolH - 34,
      bw = iw - 20;
    ctx.fillStyle = fg(0.1);
    ctx.fillRect(x, y, bw, 5);
    ctx.fillStyle = load > 0.8 ? C.orange : C.teal;
    ctx.fillRect(x, y, bw * load, 5);
  });

  // The balancer.
  roundRect(ctx, lbX, lbY, lbW, lbH, lbH / 2);
  ctx.fillStyle = C.lb;
  ctx.fill();
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = mono(narrow ? 9 : 11, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.fg;
  ctx.fillText(
    narrow ? 'load balancer · :443' : 'load balancer · :443 · round robin',
    lbX + lbW / 2,
    lbY + lbH / 2 + 0.5,
  );

  // Readouts.
  const rps = Math.round((density / GAP) * 10) / 10;
  const healthy = states.filter((st) => st === 'healthy').length;
  ctx.font = mono(narrow ? 8.5 : 10);
  ctx.textAlign = 'left';
  ctx.fillStyle = fg(0.6);
  const line = `simulated · ${rps.toFixed(0)} req/s · ${healthy}/${live.length} instances healthy`;
  ctx.fillText(line, B.x, B.y + B.h - 4);
}
