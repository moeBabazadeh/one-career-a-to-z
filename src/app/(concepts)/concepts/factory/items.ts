// Items and recipes for the Factory concept. Raw resources are the skills on his CV; parts and
// products only combine the tech that the sources list for the product they end up in.

import { db } from '../_shared/data';

const {
  neurobuild: nb,
  smartclaim: sc,
  attendum: at,
  educationGuide: eg,
  logger: lg,
} = db.products;
const { attendumReader: reader, attendumBeacon: beacon } = db.devices;

export type RawId = 'react' | 'php' | 'aws' | 'py' | 'sql' | 'ts' | 'rn' | 'c';
export type PartId = 'web' | 'api' | 'cloud' | 'ai' | 'sdk' | 'mob' | 'fw';
export type ProductId = 'nb' | 'sc' | 'at' | 'eg' | 'lg';
export type ItemId = RawId | PartId | ProductId;
export type Tier = 'raw' | 'part' | 'product';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Two or three letters for the sprite and tight labels. */
  mark: string;
  tier: Tier;
  color: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  react: { id: 'react', name: 'React & Next.js', mark: 'RX', tier: 'raw', color: '#7cc4ea' },
  php: { id: 'php', name: 'Laravel (PHP)', mark: 'PHP', tier: 'raw', color: '#e0645f' },
  aws: { id: 'aws', name: 'AWS', mark: 'AWS', tier: 'raw', color: '#f1a33c' },
  py: { id: 'py', name: 'Python & FastAPI', mark: 'PY', tier: 'raw', color: '#e3cd5d' },
  sql: { id: 'sql', name: 'PostgreSQL & MySQL', mark: 'SQL', tier: 'raw', color: '#55b5a8' },
  ts: { id: 'ts', name: 'TypeScript', mark: 'TS', tier: 'raw', color: '#4a8fd6' },
  rn: { id: 'rn', name: 'React Native & Expo', mark: 'RN', tier: 'raw', color: '#a58fe0' },
  c: { id: 'c', name: 'Embedded C', mark: 'C', tier: 'raw', color: '#cf8752' },
  web: { id: 'web', name: 'Web app', mark: 'WEB', tier: 'part', color: '#7cc4ea' },
  api: { id: 'api', name: 'Laravel API', mark: 'API', tier: 'part', color: '#e0645f' },
  cloud: { id: 'cloud', name: 'Cloud infra', mark: 'AWS', tier: 'part', color: '#f1a33c' },
  ai: { id: 'ai', name: 'AI pipeline', mark: 'AI', tier: 'part', color: '#e3cd5d' },
  sdk: { id: 'sdk', name: 'TypeScript SDK', mark: 'SDK', tier: 'part', color: '#4a8fd6' },
  mob: { id: 'mob', name: 'Mobile app', mark: 'APP', tier: 'part', color: '#a58fe0' },
  fw: { id: 'fw', name: 'Firmware', mark: 'FW', tier: 'part', color: '#5aa469' },
  nb: { id: 'nb', name: nb.title, mark: 'NB', tier: 'product', color: '#4a8fd6' },
  sc: { id: 'sc', name: sc.title, mark: 'SC', tier: 'product', color: '#5aa469' },
  at: { id: 'at', name: at.title, mark: 'AT', tier: 'product', color: '#f1a33c' },
  eg: { id: 'eg', name: eg.title, mark: 'EG', tier: 'product', color: '#a58fe0' },
  lg: { id: 'lg', name: lg.title, mark: 'LG', tier: 'product', color: '#cf8752' },
};

export const RAW: RawId[] = ['react', 'php', 'aws', 'py', 'sql', 'ts', 'rn', 'c'];
export const PARTS: PartId[] = ['web', 'api', 'cloud', 'ai', 'sdk', 'mob', 'fw'];
export const PRODUCTS: ProductId[] = ['nb', 'sc', 'at', 'eg', 'lg'];
export const ALL: ItemId[] = [...PRODUCTS, ...PARTS, ...RAW];

export interface Recipe {
  out: ItemId;
  inputs: [ItemId, number][];
  /** Seconds per craft at crafting speed 1. */
  time: number;
  /** The tech this step stands for, as the sources list it. */
  tech: string;
}

export const RECIPES: Record<PartId | ProductId, Recipe> = {
  web: {
    out: 'web',
    inputs: [['react', 2]],
    time: 3,
    tech: `Next.js and React: the ${nb.title} front end and the ${at.title} staff dashboard.`,
  },
  api: { out: 'api', inputs: [['php', 2]], time: 3.5, tech: `Laravel, the ${nb.title} back end.` },
  cloud: {
    out: 'cloud',
    inputs: [['aws', 1]],
    time: 4,
    tech: `AWS Amplify and Laravel Vapor, where ${nb.title} is hosted.`,
  },
  ai: {
    out: 'ai',
    inputs: [
      ['py', 2],
      ['sql', 1],
    ],
    time: 4.5,
    tech: `The ${sc.title} API: FastAPI, OpenAI and pgvector.`,
  },
  sdk: { out: 'sdk', inputs: [['ts', 1]], time: 3, tech: `The ${sc.title} TypeScript client SDK.` },
  mob: {
    out: 'mob',
    inputs: [['rn', 2]],
    time: 3,
    tech: `React Native and Expo: the ${at.title} app and ${eg.title}.`,
  },
  fw: {
    out: 'fw',
    inputs: [['c', 3]],
    time: 5,
    tech: `Firmware for the ${at.title} ${reader.chip} card readers and ${beacon.chip} beacons, and the ${lg.title} stations.`,
  },
  nb: {
    out: 'nb',
    inputs: [
      ['web', 1],
      ['api', 2],
      ['cloud', 1],
    ],
    time: 8,
    tech: 'Next.js, React 19 and Laravel on AWS Amplify and Laravel Vapor.',
  },
  sc: {
    out: 'sc',
    inputs: [
      ['ai', 2],
      ['sdk', 1],
    ],
    time: 10,
    tech: 'FastAPI and pgvector, OpenAI, and a TypeScript client SDK.',
  },
  at: {
    out: 'at',
    inputs: [
      ['fw', 1],
      ['mob', 1],
      ['web', 1],
    ],
    time: 6,
    tech: `${reader.chip} and ${beacon.chip} firmware, a React Native app and a Next.js dashboard.`,
  },
  eg: {
    out: 'eg',
    inputs: [
      ['mob', 1],
      ['ts', 1],
    ],
    time: 5,
    tech: 'Expo, React Native and TypeScript.',
  },
  lg: {
    out: 'lg',
    inputs: [['fw', 2]],
    time: 10,
    tech: 'Hardware and firmware, GSM, sensors and telemetry.',
  },
};

/** Per minute, at full speed. */
export const perMin = (r: Recipe) => 60 / r.time;

/** A short "2 × A + B → C" line. */
export const recipeLine = (r: Recipe) =>
  `${r.inputs.map(([i, n]) => `${n > 1 ? `${n} × ` : ''}${ITEMS[i].name}`).join(' + ')} → ${ITEMS[r.out].name}`;

/* ------------------------------------------------------------------ sprites */

/** A colour darkened (k < 0) or lightened (k > 0) by a fraction. */
export const shade = (hex: string, k: number) => {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${n.map(f).join(',')})`;
};

/** Raw resources are ore chunks, parts are stamped plates, products are crates. `s` is the size in canvas units. */
export function drawItem(
  ctx: CanvasRenderingContext2D,
  id: ItemId,
  x: number,
  y: number,
  s: number,
) {
  const it = ITEMS[id];
  const h = s / 2;
  if (it.tier === 'raw') {
    // an irregular chunk, the same shape for each resource
    const seed = id.charCodeAt(0) + id.charCodeAt(id.length - 1);
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + seed;
      const r = h * (0.78 + 0.22 * Math.sin(seed * 3.1 + k * 2.3));
      const px = x + Math.cos(a) * r,
        py = y + Math.sin(a) * r * 0.86;
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = shade(it.color, -0.35);
    ctx.fill();
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.ellipse(x - h * 0.12, y - h * 0.14, h * 0.55, h * 0.45, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath();
    ctx.arc(x - h * 0.3, y - h * 0.32, h * 0.16, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (it.tier === 'part') {
    ctx.fillStyle = shade(it.color, -0.45);
    ctx.fillRect(x - h, y - h + s * 0.08, s, s * 0.92);
    ctx.fillStyle = it.color;
    ctx.fillRect(x - h, y - h, s, s * 0.84);
    ctx.fillStyle = 'rgba(27,26,23,.82)';
    partGlyph(ctx, id as PartId, x, y - s * 0.05, s * 0.36);
    return;
  }
  // product crate
  ctx.fillStyle = '#7a5a33';
  ctx.fillRect(x - h, y - h, s, s);
  ctx.fillStyle = '#a77c45';
  ctx.fillRect(x - h + s * 0.08, y - h + s * 0.08, s * 0.84, s * 0.84);
  ctx.strokeStyle = '#6b4c28';
  ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(x - h + s * 0.1, y - h + s * 0.1);
  ctx.lineTo(x + h - s * 0.1, y + h - s * 0.1);
  ctx.stroke();
  ctx.fillStyle = it.color;
  ctx.fillRect(x - h + s * 0.08, y - s * 0.16, s * 0.84, s * 0.32);
}

function partGlyph(ctx: CanvasRenderingContext2D, id: PartId, x: number, y: number, r: number) {
  ctx.save();
  ctx.lineWidth = Math.max(1, r * 0.32);
  ctx.strokeStyle = 'rgba(27,26,23,.82)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (id) {
    case 'web': // a browser window
      ctx.rect(x - r, y - r * 0.8, r * 2, r * 1.6);
      ctx.moveTo(x - r, y - r * 0.3);
      ctx.lineTo(x + r, y - r * 0.3);
      break;
    case 'api': // braces
      ctx.moveTo(x - r * 0.25, y - r);
      ctx.quadraticCurveTo(x - r, y - r, x - r * 0.7, y);
      ctx.quadraticCurveTo(x - r, y + r, x - r * 0.25, y + r);
      ctx.moveTo(x + r * 0.25, y - r);
      ctx.quadraticCurveTo(x + r, y - r, x + r * 0.7, y);
      ctx.quadraticCurveTo(x + r, y + r, x + r * 0.25, y + r);
      break;
    case 'cloud':
      ctx.moveTo(x - r, y + r * 0.5);
      ctx.arc(x - r * 0.35, y + r * 0.05, r * 0.5, Math.PI * 0.75, Math.PI * 1.6);
      ctx.arc(x + r * 0.25, y - r * 0.15, r * 0.55, Math.PI * 1.15, Math.PI * 1.95);
      ctx.lineTo(x + r, y + r * 0.5);
      ctx.closePath();
      break;
    case 'ai': // three connected nodes
      ctx.moveTo(x - r * 0.8, y + r * 0.6);
      ctx.lineTo(x, y - r * 0.7);
      ctx.lineTo(x + r * 0.8, y + r * 0.6);
      ctx.lineTo(x - r * 0.8, y + r * 0.6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(27,26,23,.82)';
      for (const [dx, dy] of [
        [-0.8, 0.6],
        [0, -0.7],
        [0.8, 0.6],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx * r, y + dy * r, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    case 'sdk': // a package
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y - r * 0.45);
      ctx.lineTo(x + r, y + r * 0.6);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y + r * 0.6);
      ctx.lineTo(x - r, y - r * 0.45);
      ctx.closePath();
      ctx.moveTo(x - r, y - r * 0.45);
      ctx.lineTo(x, y + r * 0.05);
      ctx.lineTo(x + r, y - r * 0.45);
      ctx.moveTo(x, y + r * 0.05);
      ctx.lineTo(x, y + r);
      break;
    case 'mob': // a phone
      ctx.rect(x - r * 0.55, y - r, r * 1.1, r * 2);
      ctx.moveTo(x - r * 0.15, y + r * 0.65);
      ctx.lineTo(x + r * 0.15, y + r * 0.65);
      break;
    case 'fw': // a chip with pins
      ctx.rect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2);
      for (const k of [-0.3, 0.3]) {
        ctx.moveTo(x - r, y + k * r);
        ctx.lineTo(x - r * 0.6, y + k * r);
        ctx.moveTo(x + r * 0.6, y + k * r);
        ctx.lineTo(x + r, y + k * r);
        ctx.moveTo(x + k * r, y - r);
        ctx.lineTo(x + k * r, y - r * 0.6);
        ctx.moveTo(x + k * r, y + r * 0.6);
        ctx.lineTo(x + k * r, y + r);
      }
      break;
  }
  ctx.stroke();
  ctx.restore();
}
