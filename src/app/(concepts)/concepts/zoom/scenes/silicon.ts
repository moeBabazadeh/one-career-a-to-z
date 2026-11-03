// Layer 9: one transistor. Scroll zooms from a patch of standard cells down to an n-channel
// MOSFET in cross-section. The gate is clocked: above threshold an inversion layer forms and
// electrons drift from source to drain; below it the channel vanishes and they stay put.

import {
  BRAND,
  C,
  clamp,
  ease,
  fg,
  focusBox,
  hash,
  lerp,
  mono,
  rgba,
  roundRect,
  seg,
} from '../kit';

export const SILICON_CAPTIONS = [
  'A modern processor holds billions of transistors. Zoom in on one.',
  'An n-channel MOSFET: source, drain, and a gate on a dielectric only nanometres thick.',
  'Raise the gate above its threshold and electrons gather into a channel: the switch is on.',
  'Drop it and the channel vanishes. Every layer above is built on this: 1, 0, 1.',
];

const VDD = 0.8,
  VTH = 0.3;

/** The gate voltage: a clock with soft edges, 1.6 s a period. */
const vgs = (t: number) => {
  const u = (t % 1.6) / 1.6;
  const rise = clamp((u - 0.05) / 0.06),
    fall = clamp((u - 0.55) / 0.06);
  return VDD * (rise - fall);
};

function cells(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  cx: number,
  cy: number,
) {
  // Standard-cell rows: rails, cells of varying width, metal tracks, all procedural.
  const rowH = 26 * z;
  const rows = Math.ceil(h / rowH) + 2;
  const r0 = Math.floor((cy - h / 2 / z) / 26) - 1;
  for (let r = r0; r < r0 + rows; r++) {
    const ry = y + h / 2 + (r * 26 - cy) * z;
    ctx.fillStyle = rgba('violet', 0.35);
    ctx.fillRect(x, ry, w, 2 * z);
    let u = Math.floor((cx - w / 2 / z) / 10) * 10 - 20;
    while (u < cx + w / 2 / z + 20) {
      const cw = 6 + Math.floor(hash(r * 131 + u) * 4) * 4;
      const sx = x + w / 2 + (u - cx) * z;
      ctx.fillStyle = hash(r * 7 + u * 3) > 0.5 ? rgba('teal', 0.22) : rgba('orange', 0.18);
      ctx.fillRect(sx + z, ry + 4 * z, (cw - 2) * z, 18 * z);
      ctx.fillStyle = rgba('yellow', 0.4);
      ctx.fillRect(sx + cw * z * 0.5, ry + 4 * z, Math.max(1, 0.8 * z), 18 * z);
      u += cw;
    }
  }
}

export function drawSilicon(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  p: number,
) {
  ctx.clearRect(0, 0, w, h);
  const B = focusBox(w, h);
  const narrow = B.w < 520;

  // Stage one: the die, zooming in.
  const zoomOut = seg(p, 0.08, 0.3);
  const dieAlpha = 1 - seg(p, 0.22, 0.32);
  if (dieAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = dieAlpha;
    roundRect(ctx, B.x, B.y, B.w, B.h, 10);
    ctx.clip();
    cells(ctx, B.x, B.y, B.w, B.h, lerp(1, 14, ease(zoomOut)), 400, 300);
    ctx.restore();
    ctx.globalAlpha = dieAlpha;
    ctx.strokeStyle = rgba('violet', 0.5);
    roundRect(ctx, B.x, B.y, B.w, B.h, 10);
    ctx.stroke();
    ctx.font = mono(narrow ? 9 : 11, 600);
    ctx.fillStyle = C.fg;
    ctx.fillText('standard cells, as laid out on the die', B.x + 14, B.y + 22);
    ctx.globalAlpha = 1;
  }
  const mosAlpha = seg(p, 0.24, 0.34);
  if (mosAlpha <= 0) return;
  ctx.globalAlpha = mosAlpha;

  // Stage two: the MOSFET cross-section.
  const v = vgs(t);
  const on = clamp((v - VTH) / (VDD - VTH));
  const scopeH = narrow ? 70 : 90;
  const devY = B.y + scopeH + (narrow ? 38 : 56);
  const devH = B.y + B.h - devY;
  const subY = devY + devH * 0.3;
  const wellW = B.w * 0.26,
    wellH = devH * 0.24;
  const sx0 = B.x + B.w * 0.06,
    dx0 = B.x + B.w * 0.94 - wellW;
  const chX0 = sx0 + wellW,
    chX1 = dx0;
  const oxH = Math.max(5, devH * 0.025);
  const gateH = devH * 0.14;

  // Substrate, p-type.
  const sub = ctx.createLinearGradient(0, subY, 0, B.y + B.h);
  sub.addColorStop(0, C.subTop);
  sub.addColorStop(1, C.subBottom);
  ctx.fillStyle = sub;
  roundRect(ctx, B.x, subY, B.w, B.y + B.h - subY, 8);
  ctx.fill();
  // Holes: the p-type majority carriers, jiggling.
  for (let i = 0; i < 60; i++) {
    const hx = B.x + 10 + hash(i) * (B.w - 20);
    const hy = subY + wellH + 16 + hash(i * 2.3) * (B.y + B.h - subY - wellH - 30);
    ctx.strokeStyle = rgba('lilac', 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(
      hx + Math.sin(t * 3 + i) * 2,
      hy + Math.cos(t * 2.6 + i * 1.7) * 2,
      2.6,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  // Source and drain, n+ wells.
  for (const [x, name] of [
    [sx0, 'n+ source'],
    [dx0, 'n+ drain'],
  ] as [number, string][]) {
    roundRect(ctx, x, subY, wellW, wellH, 14);
    ctx.fillStyle = rgba('teal', 0.22);
    ctx.fill();
    ctx.strokeStyle = rgba('teal', 0.6);
    ctx.stroke();
    ctx.fillStyle = C.teal;
    ctx.font = mono(narrow ? 8 : 10, 600);
    ctx.textAlign = 'center';
    ctx.fillText(name, x + wellW / 2, subY + wellH + 16);
  }
  ctx.fillStyle = rgba('lilac', 0.8);
  ctx.font = mono(narrow ? 8 : 10, 600);
  ctx.fillText('p-type silicon substrate', B.x + B.w / 2, B.y + B.h - 14);

  // Gate stack: dielectric, then the gate electrode.
  ctx.fillStyle = C.oxide;
  ctx.fillRect(chX0 - 6, subY - oxH, chX1 - chX0 + 12, oxH);
  // The gate glows in the brand orange with ink on it, in both schemes.
  const gateGlow = 0.35 + 0.65 * (v / VDD);
  ctx.fillStyle = `rgba(255,93,46,${gateGlow})`;
  roundRect(ctx, chX0 - 6, subY - oxH - gateH, chX1 - chX0 + 12, gateH, 4);
  ctx.fill();
  ctx.fillStyle = BRAND.ink;
  ctx.font = mono(narrow ? 8.5 : 11, 600);
  ctx.textAlign = 'center';
  ctx.fillText('gate', (chX0 + chX1) / 2, subY - oxH - gateH / 2 + 4);
  ctx.fillStyle = fg(0.6);
  ctx.font = mono(narrow ? 7.5 : 9);
  ctx.textAlign = 'center';
  ctx.fillText(
    narrow ? 'gate dielectric ↑' : '↑ gate dielectric, nanometres thick',
    (chX0 + chX1) / 2,
    subY + devH * 0.1 + 26,
  );

  // Contacts and terminals.
  const term = (x: number, top: number, label: string, volts: string) => {
    ctx.fillStyle = fg(0.25);
    ctx.fillRect(x - 3, devY, 6, top - devY);
    ctx.fillStyle = C.fg;
    ctx.font = mono(narrow ? 9 : 11, 600);
    ctx.textAlign = 'center';
    ctx.fillText(label, x, devY - 18);
    ctx.fillStyle = fg(0.55);
    ctx.font = mono(narrow ? 7.5 : 9);
    ctx.fillText(volts, x, devY - 5);
  };
  term(sx0 + wellW * 0.4, subY, 'S', '0 V');
  term((chX0 + chX1) / 2, subY - oxH - gateH, 'G', `${v.toFixed(2)} V`);
  term(dx0 + wellW * 0.6, subY, 'D', `${VDD} V`);

  // The inversion layer.
  if (on > 0) {
    ctx.fillStyle = rgba('teal', 0.55 * on);
    ctx.fillRect(chX0 - 4, subY, chX1 - chX0 + 8, 3 + 7 * on);
  }
  // Depletion region under the gate grows with the field.
  ctx.fillStyle = fg(0.04 + 0.05 * (v / VDD));
  ctx.fillRect(chX0, subY, chX1 - chX0, devH * 0.1 + devH * 0.06 * (v / VDD));

  // Electrons: they wait in the source, and drift through the channel while it exists.
  const n = narrow ? 26 : 40;
  for (let i = 0; i < n; i++) {
    const seed = hash(i * 3.7);
    const lane = hash(i * 9.1);
    let x: number, y: number;
    const travel = (t * 0.55 + seed) % 1;
    const inChannel = on > 0.6;
    if (inChannel) {
      x = lerp(sx0 + wellW * 0.3, dx0 + wellW * 0.7, travel);
      const ch = x > chX0 && x < chX1;
      y = ch ? subY + 2 + lane * 6 : subY + 8 + lane * (wellH - 18);
    } else {
      const inSource = seed < 0.5;
      const bx = inSource ? sx0 : dx0;
      x = bx + 10 + hash(i * 5.3) * (wellW - 20) + Math.sin(t * 4 + i) * 2;
      y = subY + 8 + lane * (wellH - 18) + Math.cos(t * 3.4 + i) * 2;
    }
    ctx.fillStyle = C.teal;
    ctx.shadowColor = C.teal;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // A scope trace of Vgs, with the threshold and the logic level it means.
  const sb = { x: B.x, y: B.y, w: B.w, h: scopeH };
  roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 8);
  ctx.fillStyle = C.wellSi;
  ctx.fill();
  ctx.strokeStyle = rgba('violet', 0.4);
  ctx.stroke();
  const vy = (volts: number) => sb.y + sb.h - 14 - (volts / VDD) * (sb.h - 30);
  ctx.strokeStyle = rgba('red', 0.6);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(sb.x + 8, vy(VTH));
  ctx.lineTo(sb.x + sb.w - 8, vy(VTH));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= sb.w - 16; x += 2) {
    const tt = t - (sb.w - 16 - x) / 140;
    const yy = vy(vgs(tt));
    if (x === 0) ctx.moveTo(sb.x + 8 + x, yy);
    else ctx.lineTo(sb.x + 8 + x, yy);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  const chip = (label: string, x: number, color: string, size: number, right = false) => {
    ctx.font = mono(size, 600);
    const tw = ctx.measureText(label).width;
    const bx = right ? x - tw - 12 : x;
    roundRect(ctx, bx, sb.y + 7, tw + 12, size + 9, 4);
    ctx.fillStyle = C.chipSi;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(label, bx + 6, sb.y + 12 + size / 2);
  };
  chip(`Vgs · Vth ≈ ${VTH} V`, sb.x + 8, C.orange, narrow ? 8 : 9.5);
  chip(
    on > 0.6 ? 'gate 1 → ON' : 'gate 0 → OFF',
    sb.x + sb.w - 8,
    on > 0.6 ? C.teal : C.fg,
    narrow ? 9 : 11,
    true,
  );
  ctx.globalAlpha = 1;
}
