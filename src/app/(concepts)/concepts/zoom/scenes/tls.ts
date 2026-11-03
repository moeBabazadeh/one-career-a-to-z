// Layer 3: a sequence diagram of one HTTPS request, scrubbed by scroll. TCP's three-way
// handshake, a TLS 1.3 full handshake (one round trip, braces mark encrypted records as in
// RFC 8446), then the request and response on HTTP/2 stream 1.

import { db } from '../../_shared/data';
import { C, arrowHead, clamp, fg, fitText, focusBox, mono, rgba, roundRect } from '../kit';

const { site } = db.person;

interface Msg {
  step: number;
  to: 'server' | 'client';
  label: string;
  sub?: string;
  enc?: boolean;
  proto: 'TCP' | 'TLS 1.3' | 'HTTP/2';
}

const MSGS: Msg[] = [
  { step: 0, to: 'server', label: 'SYN', sub: 'seq=x', proto: 'TCP' },
  { step: 1, to: 'client', label: 'SYN, ACK', sub: 'seq=y ack=x+1', proto: 'TCP' },
  { step: 1, to: 'server', label: 'ACK', sub: 'ack=y+1', proto: 'TCP' },
  {
    step: 2,
    to: 'server',
    label: 'ClientHello',
    sub: `key_share x25519 · SNI ${site} · ALPN h2`,
    proto: 'TLS 1.3',
  },
  { step: 3, to: 'client', label: 'ServerHello', sub: 'key_share x25519', proto: 'TLS 1.3' },
  {
    step: 3,
    to: 'client',
    label: '{EncryptedExtensions}',
    sub: 'ALPN h2',
    enc: true,
    proto: 'TLS 1.3',
  },
  { step: 4, to: 'client', label: '{Certificate}', sub: `CN=${site}`, enc: true, proto: 'TLS 1.3' },
  {
    step: 4,
    to: 'client',
    label: '{CertificateVerify, Finished}',
    sub: 'signature over the handshake',
    enc: true,
    proto: 'TLS 1.3',
  },
  { step: 5, to: 'server', label: '{Finished}', enc: true, proto: 'TLS 1.3' },
  {
    step: 6,
    to: 'server',
    label: 'HEADERS  stream 1',
    sub: ':method POST  :path /api/hire',
    enc: true,
    proto: 'HTTP/2',
  },
  { step: 7, to: 'client', label: 'HEADERS  :status 200', enc: true, proto: 'HTTP/2' },
  { step: 7, to: 'client', label: 'DATA  END_STREAM', enc: true, proto: 'HTTP/2' },
];

export const TLS_CAPTIONS = [
  'Before any HTTP, a TCP connection. The browser sends SYN.',
  'SYN-ACK, then ACK: one round trip just to agree to talk.',
  'ClientHello guesses the key exchange and sends its share up front.',
  'ServerHello answers with its share. Both sides derive the keys; everything after is encrypted.',
  'The server proves who it is: certificate, a signature over the handshake, Finished.',
  'The client’s Finished. TLS 1.3 took one round trip, and the lock closes.',
  'POST /api/hire rides HTTP/2 stream 1, headers compressed with HPACK.',
  'HEADERS with :status 200, then DATA. The response is on its way back.',
];

const N = TLS_CAPTIONS.length;

function lock(ctx: CanvasRenderingContext2D, x: number, y: number, closed: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  const lift = (1 - closed) * 7;
  ctx.arc(x, y - 6 - lift, 7, Math.PI, 0);
  ctx.lineTo(x + 7, y - lift - 2 + lift * 0.4);
  ctx.moveTo(x - 7, y - 6 - lift);
  ctx.lineTo(x - 7, y - 2);
  ctx.stroke();
  roundRect(ctx, x - 11, y - 2, 22, 16, 3);
  ctx.fill();
}

export function drawTls(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, p: number) {
  ctx.clearRect(0, 0, w, h);
  const B = focusBox(w, h);
  const narrow = B.w < 520;
  const x = clamp(p, 0, 0.99999) * N;
  const k = Math.floor(x),
    within = x - k;

  const top = B.y + 6,
    headH = 34;
  const xl = B.x + (narrow ? 50 : 86),
    xr = B.x + B.w - (narrow ? 14 : 30);
  const rows = MSGS.length;
  const y0 = top + headH + 26,
    dy = (B.h - headH - 46) / rows,
    slope = dy * 0.62;

  // Lifelines and their heads.
  const heads: [number, string, string][] = [
    [xl, narrow ? 'browser' : 'browser', C.fg],
    [xr, narrow ? site : `${site}:443`, C.teal],
  ];
  for (const [hx, name, col] of heads) {
    ctx.font = mono(narrow ? 9 : 11, 600);
    const tw = ctx.measureText(name).width + 22;
    const bx = Math.min(Math.max(hx - tw / 2, B.x), B.x + B.w - tw);
    roundRect(ctx, bx, top, tw, headH, 8);
    ctx.fillStyle = fg(0.06);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, bx + tw / 2, top + headH / 2 + 0.5);
    ctx.strokeStyle = fg(0.18);
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(hx, top + headH);
    ctx.lineTo(hx, B.y + B.h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The lock between them closes on the client's Finished.
  const closed = k > 5 || (k === 5 && within > 0.4) ? 1 : 0;
  lock(ctx, (xl + xr) / 2, top + headH / 2 - 2, closed, closed ? C.teal : fg(0.45));
  if (!narrow) {
    ctx.font = mono(9);
    ctx.fillStyle = closed ? C.teal : fg(0.4);
    ctx.textAlign = 'center';
    ctx.fillText(
      closed ? 'TLS_AES_128_GCM_SHA256' : 'not yet encrypted',
      (xl + xr) / 2,
      top + headH + 14,
    );
  }

  // Protocol brackets on the left.
  const protos: Msg['proto'][] = ['TCP', 'TLS 1.3', 'HTTP/2'];
  protos.forEach((proto) => {
    const ids = MSGS.map((m, i) => (m.proto === proto ? i : -1)).filter((i) => i >= 0);
    const a = y0 + ids[0] * dy,
      b = y0 + ids[ids.length - 1] * dy + slope;
    const on = MSGS[ids[0]].step <= k;
    ctx.globalAlpha = on ? 1 : 0.25;
    ctx.strokeStyle = proto === 'TCP' ? C.fg : proto === 'HTTP/2' ? C.orange : C.teal;
    ctx.lineWidth = 1.5;
    const bx = B.x + 4;
    ctx.beginPath();
    ctx.moveTo(bx + 8, a);
    ctx.lineTo(bx, a);
    ctx.lineTo(bx, b);
    ctx.lineTo(bx + 8, b);
    ctx.stroke();
    ctx.save();
    ctx.translate(bx + 14, (a + b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = mono(9, 600);
    ctx.textAlign = 'center';
    ctx.fillText(proto, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  });

  // Messages: each step draws its arrows in turn, with a packet at the tip.
  MSGS.forEach((m, i) => {
    if (m.step > k) return;
    const same = MSGS.filter((n) => n.step === m.step);
    const j = same.indexOf(m);
    const local = m.step < k ? 1 : clamp((within / 0.55) * same.length - j);
    if (local <= 0) return;
    const fromX = m.to === 'server' ? xl : xr,
      toX = m.to === 'server' ? xr : xl;
    const ya = y0 + i * dy,
      yb = ya + slope;
    const tx = fromX + (toX - fromX) * local,
      ty = ya + (yb - ya) * local;
    const col = m.proto === 'HTTP/2' ? C.orange : m.enc ? C.teal : C.fg;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = m.step === k ? 2 : 1.4;
    ctx.globalAlpha = m.step === k ? 1 : 0.7;
    if (m.enc) ctx.setLineDash([7, 4]);
    ctx.beginPath();
    ctx.moveTo(fromX, ya);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    if (local >= 1) arrowHead(ctx, toX, yb, Math.atan2(yb - ya, toX - fromX), 8);
    else {
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // A packet keeps travelling the newest arrows, so the step never sits still.
    if (m.step === k && local >= 1) {
      const q = (t * 0.7 + i * 0.37) % 1;
      ctx.beginPath();
      ctx.arc(fromX + (toX - fromX) * q, ya + (yb - ya) * q, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const lx = Math.min(fromX, toX) + 12,
      maxW = Math.abs(toX - fromX) - 24;
    ctx.globalAlpha *= clamp(local * 2);
    ctx.textAlign = m.to === 'server' ? 'left' : 'right';
    const ax = m.to === 'server' ? lx : Math.max(fromX, toX) - 12;
    ctx.font = mono(narrow ? 10 : 12, 600);
    ctx.fillText(fitText(ctx, m.label, maxW), ax, ya - 8);
    if (m.sub && dy > 30) {
      ctx.font = mono(narrow ? 8.5 : 10);
      ctx.fillStyle = fg(0.55);
      ctx.fillText(fitText(ctx, m.sub, maxW * 0.62), ax, ya + slope * 0.5 + 10);
    }
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = 'left';

  // Round-trip markers on the client's lifeline.
  const rtt = (from: number, to: number, label: string, on: boolean) => {
    if (!on) return;
    const a = y0 + from * dy,
      b = y0 + to * dy + slope;
    ctx.strokeStyle = rgba('yellow', 0.75);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xl - 10, a);
    ctx.lineTo(xl - 14, a);
    ctx.lineTo(xl - 14, b);
    ctx.lineTo(xl - 10, b);
    ctx.stroke();
    ctx.fillStyle = C.yellow;
    ctx.font = mono(9, 600);
    ctx.textAlign = 'right';
    ctx.fillText(label, xl - 18, (a + b) / 2 + 3);
    ctx.textAlign = 'left';
  };
  rtt(0, 1, narrow ? 'RTT' : '1 RTT', k >= 1);
  rtt(3, 7, narrow ? 'RTT' : '1 RTT', k >= 4);
}
