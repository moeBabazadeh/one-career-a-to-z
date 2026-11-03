// Layer 4: the route, hop by hop. Scroll pans the camera from the laptop to the data centre;
// packets ride the path on their own clock, losing one TTL per router, and cross the ocean
// as light in a subsea cable. Addresses are from the documentation ranges (RFC 5737) and the
// hostnames use .example (RFC 2606): the route is illustrative, the physics isn't.

import { db } from '../../_shared/data';
import { C, clamp, fg, focusBox, hash, lerp, mono, rgba, roundRect, seg, type Box } from '../kit';

const { site } = db.person;

export const NET_CAPTIONS = [
  'fetch() becomes packets: the request wrapped in TCP, then IP, then Ethernet.',
  'Each router reads the destination, decrements the TTL and forwards. traceroute exploits exactly that.',
  'At the coast the packets go into glass: a subsea cable about as thick as a garden hose.',
  'Light in fibre covers about 200,000 km a second: 6,000 km of ocean costs about 30 ms each way.',
  'Back on land, a few more hops to the edge of the data centre.',
];

interface Hop {
  at: number;
  kind: 'host' | 'router' | 'silent' | 'landing' | 'edge';
  name: string;
  trace?: string;
}

// World positions run 0..1 left to right; the ocean spans OCEAN.
const OCEAN: [number, number] = [0.36, 0.7];
const HOPS: Hop[] = [
  { at: 0.03, kind: 'host', name: 'your laptop' },
  { at: 0.1, kind: 'router', name: 'home router', trace: ' 1  _gateway (192.168.1.1)  1.2 ms' },
  {
    at: 0.17,
    kind: 'router',
    name: 'ISP edge',
    trace: ' 2  edge1.isp.example (198.51.100.1)  7.9 ms',
  },
  { at: 0.23, kind: 'silent', name: 'no ICMP', trace: ' 3  * * *' },
  {
    at: 0.29,
    kind: 'router',
    name: 'exchange',
    trace: ' 4  ix-ams.example (198.51.100.97)  10.8 ms',
  },
  {
    at: 0.345,
    kind: 'landing',
    name: 'landing station',
    trace: ' 5  cls-eu.example (203.0.113.5)  12.4 ms',
  },
  {
    at: 0.715,
    kind: 'landing',
    name: 'landing station',
    trace: ' 6  cls-us.example (203.0.113.130)  79.6 ms',
  },
  { at: 0.79, kind: 'router', name: 'exchange', trace: ' 7  ix-nyc.example (192.0.2.33)  80.7 ms' },
  {
    at: 0.87,
    kind: 'router',
    name: 'transit',
    trace: ' 8  core2.dc.example (192.0.2.65)  81.2 ms',
  },
  {
    at: 0.95,
    kind: 'edge',
    name: 'edge · load balancer',
    trace: ` 9  ${site} (192.0.2.80)  81.6 ms`,
  },
];

/** The cable cross-section, outside in: the materials' own colours, in both schemes. */
const CABLE: [string, string][] = [
  ['polyethylene', '#2a2f3a'],
  ['mylar tape', '#59607a'],
  ['stranded steel wires', '#8b93a6'],
  ['aluminium water barrier', '#b9c0cf'],
  ['polycarbonate', '#3a4256'],
  ['copper tube', '#c8763f'],
  ['petroleum jelly', '#e9d58a'],
  ['optical fibres', ''],
];

function node(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hop: Hop,
  lit: number,
  small: boolean,
) {
  const s = small ? 0.8 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = 0.5 + 0.5 * lit;
  ctx.strokeStyle = hop.kind === 'silent' ? fg(0.4) : C.blue;
  ctx.fillStyle = C.node;
  ctx.lineWidth = 1.6;
  if (hop.kind === 'host') {
    roundRect(ctx, -18, -26, 36, 22, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-24, -2);
    ctx.lineTo(24, -2);
    ctx.stroke();
  } else if (hop.kind === 'landing') {
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-20, -22);
    ctx.lineTo(0, -34);
    ctx.lineTo(20, -22);
    ctx.lineTo(20, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (hop.kind === 'edge') {
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, -18, -36 + i * 12, 36, 10, 2);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.ellipse(0, -14, 20, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (hop.kind === 'silent') ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // The router glyph: four arrows.
    ctx.beginPath();
    ctx.moveTo(-9, -14);
    ctx.lineTo(9, -14);
    ctx.moveTo(0, -20);
    ctx.lineTo(0, -8);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawNetwork(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  p: number,
) {
  ctx.clearRect(0, 0, w, h);
  const B = focusBox(w, h);
  const narrow = B.w < 520;
  const worldW = Math.max(B.w * (narrow ? 4.2 : 2.6), 1400);
  const cam = lerp(0, worldW - B.w, seg(p, 0.06, 0.94));
  const X = (u: number) => B.x + u * worldW - cam;

  const traceH = narrow ? 104 : 150;
  const ground = B.y + traceH + (B.h - traceH) * (narrow ? 0.3 : 0.22);
  const floor = B.y + B.h - 14;
  const seabed = (u: number) => floor - 18 * Math.sin(u * 40) - 10 * Math.sin(u * 97 + 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(B.x - 8, B.y + traceH - 6, B.w + 16, B.h - traceH + 20);
  ctx.clip();

  // Land and sea. The sea fills between the two coasts.
  const [o0, o1] = OCEAN;
  const sea = ctx.createLinearGradient(0, ground, 0, floor);
  sea.addColorStop(0, rgba('blue', 0.2));
  sea.addColorStop(1, rgba('blue', 0.03));
  ctx.fillStyle = sea;
  ctx.beginPath();
  ctx.moveTo(X(o0), ground);
  for (let u = o0; u <= o1; u += 0.004) ctx.lineTo(X(u), ground + 3 * Math.sin(u * 300 + t * 1.6));
  ctx.lineTo(X(o1), floor + 20);
  ctx.lineTo(X(o0), floor + 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('blue', 0.6);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let u = o0; u <= o1; u += 0.004) {
    const y = ground + 3 * Math.sin(u * 300 + t * 1.6);
    if (u === o0) ctx.moveTo(X(u), y);
    else ctx.lineTo(X(u), y);
  }
  ctx.stroke();
  // The coasts and the seabed.
  ctx.strokeStyle = fg(0.35);
  ctx.beginPath();
  ctx.moveTo(X(0), ground);
  ctx.lineTo(X(o0), ground);
  ctx.bezierCurveTo(
    X(o0 + 0.02),
    ground,
    X(o0 + 0.02),
    seabed(o0 + 0.03),
    X(o0 + 0.04),
    seabed(o0 + 0.04),
  );
  for (let u = o0 + 0.04; u <= o1 - 0.04; u += 0.004) ctx.lineTo(X(u), seabed(u));
  ctx.bezierCurveTo(X(o1 - 0.02), seabed(o1 - 0.03), X(o1 - 0.02), ground, X(o1), ground);
  ctx.lineTo(X(1), ground);
  ctx.stroke();

  // The path packets follow: along the ground, down the shelf, along the seabed, and up.
  const pts: [number, number][] = [];
  for (const hop of HOPS) {
    if (hop.at > o0 && pts.length && pts[pts.length - 1][0] <= o0) {
      for (let u = o0 + 0.01; u < o1 - 0.01; u += 0.01) {
        const sink = Math.min(1, (u - o0) / 0.04, (o1 - u) / 0.04);
        pts.push([u, lerp(ground - 6, seabed(u) - 5, clamp(sink))]);
      }
    }
    pts.push([hop.at, ground - 6]);
  }
  // Cumulative cost: light in the cable moves the screen faster than packets on land.
  const cost: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const wet = pts[i][0] > o0 && pts[i - 1][0] < o1 && pts[i][0] < o1 + 0.01;
    const d = Math.hypot((pts[i][0] - pts[i - 1][0]) * worldW, pts[i][1] - pts[i - 1][1]);
    cost.push(cost[i - 1] + d / (wet ? 3.2 : 1));
  }
  const total = cost[cost.length - 1];
  const at = (c: number) => {
    let i = 1;
    while (i < cost.length - 1 && cost[i] < c) i++;
    const f = (c - cost[i - 1]) / Math.max(1e-6, cost[i] - cost[i - 1]);
    return [X(lerp(pts[i - 1][0], pts[i][0], f)), lerp(pts[i - 1][1], pts[i][1], f)];
  };

  // The cable and its pulses of light.
  ctx.strokeStyle = rgba('teal', 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach(([u, y], i) => (i ? ctx.lineTo(X(u), y) : ctx.moveTo(X(u), y)));
  ctx.stroke();

  // Hops.
  HOPS.forEach((hop, i) => {
    const x = X(hop.at);
    if (x < B.x - 60 || x > B.x + B.w + 60) return;
    const lit = clamp(1 - Math.abs(x - (B.x + B.w * 0.5)) / (B.w * 0.6));
    node(ctx, x, ground - 4, hop, lit, narrow);
    ctx.font = mono(narrow ? 8.5 : 10, 600);
    ctx.fillStyle = hop.kind === 'silent' ? fg(0.45) : C.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(hop.name, x, ground - (narrow ? 44 : 52));
    if (hop.trace) {
      ctx.font = mono(narrow ? 8 : 9);
      ctx.fillStyle = rgba('blue', 0.9);
      ctx.fillText(`hop ${i}`, x, ground + 18);
    }
  });

  // Packets on their own clock: one every 0.55 s, TTL 64 minus the routers passed.
  const speed = narrow ? 260 : 340;
  const life = total / speed;
  for (let i = Math.floor((t - life) / 0.55); i <= t / 0.55; i++) {
    const age = t - i * 0.55;
    if (age < 0 || age > life) continue;
    const c = age * speed;
    const [px, py] = at(c);
    if (px < B.x - 20 || px > B.x + B.w + 20) continue;
    const u = (px - B.x + cam) / worldW;
    const passed = HOPS.filter((hp) => hp.kind !== 'host' && hp.at < u).length;
    const wet = u > o0 + 0.01 && u < o1 - 0.01;
    if (wet) {
      ctx.fillStyle = C.teal;
      ctx.shadowColor = C.teal;
      ctx.shadowBlur = 14;
      ctx.fillRect(px - 9, py - 1.5, 18, 3);
      ctx.shadowBlur = 0;
    } else {
      const ack = hash(i) < 0.25;
      ctx.fillStyle = ack ? C.fg : C.blue;
      roundRect(ctx, px - 13, py - 8, 26, 14, 3);
      ctx.fill();
      if (!narrow) {
        ctx.font = mono(7.5, 600);
        ctx.fillStyle = C.ttl;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(64 - passed), px, py - 0.5);
      }
    }
  }

  // The physics, written over the water.
  const mid = X((o0 + o1) / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = mono(narrow ? 9 : 11, 600);
  ctx.fillStyle = C.teal;
  ctx.fillText('≈ 6,000 km of fibre', mid, ground + (floor - ground) * 0.36);
  ctx.font = mono(narrow ? 8.5 : 10);
  ctx.fillStyle = fg(0.7);
  ctx.fillText(
    'light in glass ≈ 200,000 km/s → ≈ 30 ms one way',
    mid,
    ground + (floor - ground) * 0.36 + 18,
  );
  ctx.restore();

  // The cable in cross-section, while the camera is over the water.
  const show = seg(p, 0.3, 0.42) * (1 - seg(p, 0.72, 0.82));
  if (show > 0) {
    const R = narrow ? 38 : 58;
    const cx = B.x + B.w - R - (narrow ? 8 : 24),
      cy = narrow ? ground + (floor - ground) * 0.68 : floor - R - 20;
    ctx.globalAlpha = show;
    CABLE.forEach(([, col], i) => {
      ctx.fillStyle = col || C.teal;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (1 - i * 0.115), 0, Math.PI * 2);
      ctx.fill();
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.2;
      ctx.fillStyle = hash(i + Math.floor(t * 6)) > 0.5 ? '#bafff4' : C.teal;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * 0.09, cy + Math.sin(a) * R * 0.09, R * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!narrow) {
      ctx.font = mono(9);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      CABLE.forEach(([name], i) => {
        const ly = cy - R + 6 + i * ((R * 2 - 12) / 7);
        ctx.fillStyle = fg(0.75);
        ctx.fillText(`${i + 1} ${name}`, cx - R - 14, ly);
      });
      ctx.textAlign = 'center';
      ctx.fillStyle = C.teal;
      ctx.fillText('subsea cable, cross-section', cx, cy + R + 14);
    }
    ctx.globalAlpha = 1;
  }

  // traceroute, filling in as the camera passes each hop.
  const tb: Box = { x: B.x, y: B.y, w: B.w, h: traceH - 16 };
  roundRect(ctx, tb.x, tb.y, tb.w, tb.h, 8);
  ctx.fillStyle = C.wellNet;
  ctx.fill();
  ctx.strokeStyle = rgba('blue', 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(tb.x, tb.y, tb.w, tb.h);
  ctx.clip();
  const lh = narrow ? 10.5 : 12.5;
  ctx.font = mono(narrow ? 8 : 9.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = [
    `$ traceroute ${site}`,
    ...HOPS.filter((hp) => hp.trace && X(hp.at) < B.x + B.w * 0.75).map((hp) => hp.trace as string),
  ];
  const fit = Math.floor((tb.h - 16) / lh);
  lines.slice(-fit).forEach((line, i, arr) => {
    ctx.fillStyle =
      i === 0 && lines.length <= fit ? C.fg : i === arr.length - 1 ? C.blue : fg(0.62);
    ctx.fillText(line, tb.x + 12, tb.y + 9 + i * lh);
  });
  if (Math.floor(t * 2) % 2) {
    ctx.fillStyle = C.blue;
    ctx.fillRect(tb.x + 12, tb.y + 9 + Math.min(lines.length, fit) * lh, 7, lh - 2);
  }
  ctx.restore();
}
