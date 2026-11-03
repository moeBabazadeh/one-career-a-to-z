// The floorplan of MB-2007, in micrometres with the origin at the die's top-left corner. Blocks
// are what the guide talks about; regions are what the renderer draws (each one a "fabric":
// standard-cell logic, SRAM, a datapath, an inductor...). The die's size, metal stack and pad
// count are the chip's spec, a metaphor. The counts that matter are real, read from db: an L2
// slice per skill, a shader core per product, a cache mat per Logger station and per Attendum
// device, an efficiency core per earlier role, a scan chain per upstream fix, a bonded pad per link.

import { db, fmt, oss, profile, skills } from '../_shared/data';

const { person, current } = db;
const {
  neurobuild,
  smartclaim,
  attendum,
  educationGuide,
  activeClass,
  schoolHow,
  learningKit,
  examKit,
  pulseIot,
} = db.products;
const { logger, epc, plc, attendumReader: reader, attendumBeacon: beacon } = db.devices;
const { bsc, msc } = db.education;
const paper = db.papers.inverter;

const INITIALS = person.name
  .split(' ')
  .map((w) => w[0])
  .join('');
/** The part number: his initials and the year he started building, "MB-2007". */
export const PART = `${INITIALS}-${person.since}`;
export const MASK = `${INITIALS}${person.since}`;
/** The revision is the date of the facts, "26.10". */
export const REV = fmt.iso(db.asOf).slice(2).replace('-', '.');

/** Roles that ended, newest first: one efficiency core each. */
export const EARLIER = db.roleList.filter((r) => r.to);

export const W = 11200;
export const H = 9600;
export const CORE = { x0: 460, y0: 460, x1: W - 460, y1: H - 460 };

export type Fabric =
  | 'logic'
  | 'sram'
  | 'datapath'
  | 'analog'
  | 'rom'
  | 'mim'
  | 'decap'
  | 'bjt'
  | 'pfet'
  | 'res'
  | 'grating'
  | 'ind'
  | 'fill'
  | 'text'
  | 'art'
  | 'mark'
  | 'bus'
  | 'ring';

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  f: Fabric;
  seed: number;
  /** sram/rom: mats across; ind: turns; bus: 0 runs along x, 1 along y; text: pixel size. */
  a?: number;
  /** sram/rom: mats down. */
  b?: number;
  text?: string;
  /** A phase for the thin-film sheen, so neighbouring arrays don't shimmer in step. */
  hue?: number;
}

export type BlockId =
  | 'die'
  | 'p0'
  | 'p1'
  | 'e0'
  | 'e1'
  | 'e2'
  | 'e3'
  | 'l2'
  | 'gpu'
  | 'npu'
  | 'slc'
  | 'rf'
  | 'aon'
  | 'pmu'
  | 'dbg'
  | 'io'
  | 'art';
export type Cat = 'cpu' | 'accel' | 'mem' | 'hw' | 'sys';

export interface Part {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Block {
  id: BlockId;
  tag: string;
  name: string;
  kind: string;
  cat: Cat;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Running now (a current role, a live product, a device in production) or power-gated. */
  live: boolean;
  parts: Part[];
  /** A point worth magnifying, and the stops on the way down to it: [label, zoom in px/µm]. */
  probe: [number, number];
  ladder: Stop[];
}

/** A magnification stop: a label, a zoom in CSS px per µm and, optionally, its own point. */
export type Stop = [label: string, z: number, x?: number, y?: number];

// Colours are the page's --cat-* tokens; the engine reads the same tokens to draw outlines.
export const CATS: Record<Cat, { label: string; color: string }> = {
  cpu: { label: 'CPU · roles', color: 'var(--cat-cpu)' },
  accel: { label: 'Accelerators · platforms', color: 'var(--cat-accel)' },
  mem: { label: 'Memory · data and stack', color: 'var(--cat-mem)' },
  hw: { label: 'Analog, RF, MCU · hardware', color: 'var(--cat-hw)' },
  sys: { label: 'System · you, links, art', color: 'var(--cat-sys)' },
};

/* ------------------------------------------------------------------ regions */

export const REGIONS: Region[] = [];
let seq = 1;

function add(x: number, y: number, w: number, h: number, f: Fabric, extra: Partial<Region> = {}) {
  const r: Region = {
    x,
    y,
    w,
    h,
    f,
    seed: (seq++ * 7919) % 1000003,
    hue: (seq * 0.137) % 1,
    ...extra,
  };
  REGIONS.push(r);
  return r;
}

type Unit = [
  x: number,
  y: number,
  w: number,
  h: number,
  f: Fabric,
  label: string,
  a?: number,
  b?: number,
];

/**
 * Places a block's units, mirrored on x (m & 1) or y (m & 2) as real dies mirror twin cores.
 * Units of the same template share seeds, so repeated instances look identical, as they do.
 */
function units(
  id: string,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  m: number,
  list: Unit[],
  template: number,
): Part[] {
  return list.map(([ux, uy, uw, uh, f, label, a, b], i) => {
    const x = m & 1 ? bw - ux - uw : ux;
    const y = m & 2 ? bh - uy - uh : uy;
    add(bx + x, by + y, uw, uh, f, {
      a,
      b,
      seed: template * 101 + i * 13,
      hue: (template * 0.31 + i * 0.17) % 1,
    });
    return { id: `${id}-${i}`, label, x: bx + x, y: by + y, w: uw, h: uh };
  });
}

/** A block's power ring, drawn in M5 and M6 just inside its edge. */
function ring(x: number, y: number, w: number, h: number) {
  add(x, y, w, h, 'ring');
}

/* ------------------------------------------------------------------ CPU */

const BIG: Unit[] = [
  [60, 60, 700, 560, 'sram', 'L1 instruction cache', 2, 4],
  [60, 680, 700, 700, 'sram', 'L1 data cache', 2, 4],
  [820, 60, 560, 560, 'sram', 'Branch predictor', 2, 2],
  [1440, 60, 840, 560, 'logic', 'Fetch & decode'],
  [820, 680, 560, 700, 'logic', 'Load / store'],
  [1440, 680, 840, 700, 'logic', 'Rename & schedule'],
  [60, 1440, 460, 680, 'sram', 'Register file', 1, 4],
  [580, 1440, 900, 680, 'datapath', 'Integer ALUs'],
  [1540, 1440, 740, 680, 'datapath', 'FP & SIMD'],
];

const LITTLE: Unit[] = [
  [40, 40, 330, 320, 'sram', 'L1 I', 1, 2],
  [410, 40, 330, 320, 'sram', 'L1 D', 1, 2],
  [40, 400, 700, 520, 'logic', 'Pipeline'],
  [40, 960, 420, 460, 'datapath', 'ALU'],
  [500, 960, 240, 460, 'sram', 'Registers', 1, 2],
  [40, 1460, 700, 780, 'sram', 'Private L2', 2, 4],
];

const P = { y: 3420, w: 2340, h: 2180 };
const p0Parts = units('p0', 520, P.y, P.w, P.h, 0, BIG, 1);
const p1Parts = units('p1', 2960, P.y, P.w, P.h, 1, BIG, 1);
ring(520, P.y, P.w, P.h);
ring(2960, P.y, P.w, P.h);

const E = { y: 6800, w: 780, h: 2280 };
const eX = [520, 1340, 2160, 2980]; // one per earlier role
const eParts = eX.map((x, i) => {
  ring(x, E.y, E.w, E.h);
  return units(`e${i}`, x, E.y, E.w, E.h, i % 2, LITTLE, 2);
});

// The P-cluster's shared L2: one slice per skill.
const L2 = { x: 520, y: 5700, w: 4780, h: 980 };
const SLICE = (L2.w - (skills.length + 1) * 20) / skills.length;
const l2Parts: Part[] = skills.map((skill, i) => {
  const x = L2.x + 20 + i * (SLICE + 20);
  add(x, L2.y + 40, SLICE, 110, 'logic', { seed: 900 + i });
  add(x, L2.y + 170, SLICE, L2.h - 210, 'sram', { a: 2, b: 2, seed: 920, hue: 0.12 * i });
  return { id: `l2-${i}`, label: `Slice ${i} · ${skill}`, x, y: L2.y + 40, w: SLICE, h: L2.h - 80 };
});
ring(L2.x, L2.y, L2.w, L2.h);

/* ------------------------------------------------------------------ GPU */

export const GPU_PRODUCTS = [
  neurobuild.title,
  `${attendum.title} app`,
  `${attendum.title} Canvas LTI app`,
  activeClass.title,
  educationGuide.title,
  schoolHow.title,
  learningKit.title,
  examKit.title,
];

const GPU = { x: 520, y: 520, w: 4180, h: 2780 };
const SC: Unit[] = [
  [40, 40, 890, 320, 'sram', 'Register file', 4, 1],
  [40, 400, 205, 400, 'datapath', 'Lane 0'],
  [265, 400, 205, 400, 'datapath', 'Lane 1'],
  [490, 400, 205, 400, 'datapath', 'Lane 2'],
  [715, 400, 205, 400, 'datapath', 'Lane 3'],
  [40, 840, 520, 220, 'logic', 'Texture unit'],
  [600, 840, 330, 220, 'sram', 'L1', 2, 1],
];
const gpuParts: Part[] = [];
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 4; col++) {
    const i = row * 4 + col;
    const x = GPU.x + 60 + col * 1030,
      y = GPU.y + (row ? 1620 : 60);
    units(`gpu-sc${i}`, x, y, 970, 1100, row ? 2 : 0, SC, 3);
    gpuParts.push({ id: `gpu-${i}`, label: `SC${i} · ${GPU_PRODUCTS[i]}`, x, y, w: 970, h: 1100 });
  }
}
add(GPU.x + 60, GPU.y + 1220, 2000, 340, 'sram', { a: 8, b: 1, seed: 330, hue: 0.4 });
add(GPU.x + 2120, GPU.y + 1220, 2000, 340, 'logic', { seed: 331 });
ring(GPU.x, GPU.y, GPU.w, GPU.h);

/* ------------------------------------------------------------------ NPU */

const NPU = { x: 4820, y: 520, w: 3180, h: 2780 };
add(NPU.x + 60, NPU.y + 60, 3060, 420, 'sram', { a: 8, b: 1, seed: 440, hue: 0.7 });
/** Processing elements: a multiplier datapath, a weight register file and accumulator logic. */
export const PE_ARRAYS: {
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
}[] = [];
for (const ax of [60, 1320]) {
  const arr = { x: NPU.x + ax, y: NPU.y + 540, w: 1200, h: 2180, cols: 8, rows: 14 };
  PE_ARRAYS.push(arr);
  const pw = arr.w / arr.cols,
    ph = arr.h / arr.rows;
  for (let j = 0; j < arr.rows; j++) {
    for (let i = 0; i < arr.cols; i++) {
      const x = arr.x + i * pw + 4,
        y = arr.y + j * ph + 4,
        w = pw - 8,
        h = ph - 8;
      add(x, y, w * 0.6, h, 'datapath', { seed: 450 });
      add(x + w * 0.64, y, w * 0.36, h * 0.52, 'sram', {
        a: 1,
        b: 1,
        seed: 451,
        hue: 0.62 + 0.01 * j,
      });
      add(x + w * 0.64, y + h * 0.58, w * 0.36, h * 0.42, 'logic', { seed: 452 });
    }
  }
}
add(NPU.x + 2580, NPU.y + 540, 540, 1300, 'logic', { seed: 460 });
add(NPU.x + 2580, NPU.y + 1900, 540, 820, 'sram', { a: 2, b: 3, seed: 461, hue: 0.8 });
const npuParts: Part[] = [
  {
    id: 'npu-0',
    label: `NPU0 · ${neurobuild.title} AI`,
    x: PE_ARRAYS[0].x,
    y: PE_ARRAYS[0].y,
    w: 1200,
    h: 2180,
  },
  {
    id: 'npu-1',
    label: `NPU1 · ${smartclaim.title}`,
    x: PE_ARRAYS[1].x,
    y: PE_ARRAYS[1].y,
    w: 1200,
    h: 2180,
  },
  {
    id: 'npu-2',
    label: `Vision · ${activeClass.title}`,
    x: NPU.x + 2580,
    y: NPU.y + 540,
    w: 540,
    h: 2180,
  },
  { id: 'npu-3', label: 'Weight buffer', x: NPU.x + 60, y: NPU.y + 60, w: 3060, h: 420 },
];
ring(NPU.x, NPU.y, NPU.w, NPU.h);

/* ------------------------------------------------------------------ RF */

const RF = { x: 8120, y: 520, w: 2560, h: 2780 };
export const INDUCTORS = [
  { id: 'gsm', cx: RF.x + 600, cy: RF.y + 600, d: 960, turns: 3 },
  { id: 'ble', cx: RF.x + 1770, cy: RF.y + 470, d: 660, turns: 4 },
  { id: 'nfc', cx: RF.x + 1770, cy: RF.y + 1290, d: 660, turns: 5 },
];
for (const l of INDUCTORS)
  add(l.cx - l.d / 2, l.cy - l.d / 2, l.d, l.d, 'ind', { a: l.turns, seed: 500 + l.turns });
add(RF.x + 120, RF.y + 1200, 1060, 760, 'analog', { seed: 510 });
add(RF.x + 120, RF.y + 2020, 1060, 700, 'mim', { seed: 511 });
add(RF.x + 1300, RF.y + 1720, 1200, 1000, 'analog', { seed: 512 });
add(RF.x + 2200, RF.y + 120, 300, 1520, 'fill', { seed: 513 });
const rfParts: Part[] = [
  {
    id: 'rf-gsm',
    label: `L1 · GSM · ${logger.name}`,
    x: RF.x + 120,
    y: RF.y + 120,
    w: 960,
    h: 960,
  },
  {
    id: 'rf-ble',
    label: `L2 · BLE · ${beacon.name}`,
    x: RF.x + 1440,
    y: RF.y + 140,
    w: 660,
    h: 660,
  },
  {
    id: 'rf-nfc',
    label: `L3 · NFC + RFID · ${reader.name}`,
    x: RF.x + 1440,
    y: RF.y + 960,
    w: 660,
    h: 660,
  },
  { id: 'rf-fe', label: 'RX / TX front end', x: RF.x + 120, y: RF.y + 1200, w: 1060, h: 760 },
  { id: 'rf-pll', label: 'PLL', x: RF.x + 1300, y: RF.y + 1720, w: 1200, h: 1000 },
];
ring(RF.x, RF.y, RF.w, RF.h);

/* ------------------------------------------------------------------ system cache */

/** One cache mat per Logger station and per Attendum device online at one university. */
export const MATS = { logger: logger.stations.n, attendum: reader.fleet.online.n };

/** Mats across and down for `n` mats, with about twice as many down as across: 50 is 5 × 10. */
function matGrid(n: number): [number, number] {
  let best: [number, number] = [1, n];
  const off = (a: number, b: number) => Math.abs(Math.log(b / a / 2));
  for (let a = 2; a <= n; a++) if (n % a === 0 && off(a, n / a) < off(...best)) best = [a, n / a];
  return best;
}

const SLC = { x: 5420, y: 3420, w: 5260, h: 3260 };
const [lgA, lgB] = matGrid(MATS.logger),
  [atA, atB] = matGrid(MATS.attendum);
add(SLC.x + 60, SLC.y + 60, 2320, 3140, 'sram', { a: lgA, b: lgB, seed: 600, hue: 0.05 });
add(SLC.x + 2440, SLC.y + 60, 140, 3140, 'logic', { seed: 601 });
add(SLC.x + 2640, SLC.y + 60, 2560, 3140, 'sram', { a: atA, b: atB, seed: 602, hue: 0.55 });
const slcParts: Part[] = [
  {
    id: 'slc-logger',
    label: `Bank 0 · ${logger.name} · ${MATS.logger} mats`,
    x: SLC.x + 60,
    y: SLC.y + 60,
    w: 2320,
    h: 3140,
  },
  { id: 'slc-ctrl', label: 'Controller', x: SLC.x + 2440, y: SLC.y + 60, w: 140, h: 3140 },
  {
    id: 'slc-attendum',
    label: `Bank 1 · ${attendum.title} · ${MATS.attendum} mats`,
    x: SLC.x + 2640,
    y: SLC.y + 60,
    w: 2560,
    h: 3140,
  },
];
ring(SLC.x, SLC.y, SLC.w, SLC.h);

/* ------------------------------------------------------------------ debug, AON, PMU */

const DBG = { x: 3880, y: 6800, w: 1420, h: 2280 };
const dbgParts: Part[] = [];
// One scan chain per upstream fix, sharing the block's height.
const CHAIN = (DBG.h - 80) / oss.length;
for (let i = 0; i < oss.length; i++) {
  const y = DBG.y + 60 + i * CHAIN;
  add(DBG.x + 60, y, 940, CHAIN - 60, 'datapath', { seed: 700 });
  add(DBG.x + 1060, y, 300, CHAIN - 60, 'sram', { a: 1, b: 2, seed: 701, hue: 0.3 + i * 0.1 });
  dbgParts.push({ id: `dbg-${i}`, label: `Chain ${i}`, x: DBG.x + 60, y, w: 1300, h: CHAIN - 60 });
}
ring(DBG.x, DBG.y, DBG.w, DBG.h);

const AON = { x: 5420, y: 6800, w: 1980, h: 2280 };
const aonParts = units(
  'aon',
  AON.x,
  AON.y,
  AON.w,
  AON.h,
  0,
  [
    [60, 60, 900, 860, 'rom', `Boot ROM · ${epc.name}`, 6, 6],
    [1020, 60, 900, 860, 'sram', 'SRAM', 2, 2],
    [60, 980, 1120, 760, 'logic', `MCU core · ${pulseIot.title}`],
    [1240, 980, 680, 760, 'datapath', `Timers & PWM · ${plc.name}`],
    [60, 1800, 1860, 420, 'logic', 'GPIO matrix · keypad scanner'],
  ],
  8,
);
ring(AON.x, AON.y, AON.w, AON.h);

const PMU = { x: 7520, y: 6800, w: 1980, h: 2280 };
const pmuParts = units(
  'pmu',
  PMU.x,
  PMU.y,
  PMU.w,
  PMU.h,
  0,
  [
    [60, 60, 1100, 1100, 'pfet', 'Power stage · inverter paper'],
    [1220, 60, 700, 520, 'bjt', 'Bandgap reference'],
    [1220, 640, 700, 520, 'analog', `LDO loop · ${bsc.focus.toLowerCase()}`],
    [60, 1220, 560, 400, 'res', 'Trim ladder'],
    [680, 1220, 480, 400, 'grating', `Optical test · ${msc.degree}`],
    [1220, 1220, 700, 400, 'mim', 'Compensation caps'],
    [60, 1680, 1860, 540, 'decap', 'Decap array'],
  ],
  9,
);
ring(PMU.x, PMU.y, PMU.w, PMU.h);

/* ------------------------------------------------------------------ marking, art, corners */

const MARK = { x: 9620, y: 6800, w: 1060, h: 2280 };
add(MARK.x, MARK.y, MARK.w, 1800, 'fill', { seed: 800 });
add(MARK.x + 120, MARK.y + 160, 520, 280, 'text', { text: INITIALS, a: 40 });
add(MARK.x + 120, MARK.y + 520, 560, 170, 'text', { text: String(person.since), a: 24 });
add(MARK.x + 120, MARK.y + 790, 800, 60, 'text', { text: profile.name.toUpperCase(), a: 6 });
add(MARK.x + 120, MARK.y + 860, 800, 60, 'text', {
  text: `${current.title} · ${current.company}`.toUpperCase(),
  a: 6,
});
add(MARK.x + 120, MARK.y + 930, 800, 60, 'text', { text: `(C) ${db.asOf.y} · REV ${REV}`, a: 6 });
add(MARK.x + 120, MARK.y + 1100, 820, 40, 'text', { text: `MASK SET ${MASK}-A1`, a: 4 });
add(MARK.x + 120, MARK.y + 1160, 820, 40, 'text', { text: 'PO A1 M1 B0 M2 A2 M3 A0', a: 4 });
add(MARK.x + 120, MARK.y + 1220, 820, 40, 'text', { text: 'M4 A1 M5 A0 M6 C1 PA A0', a: 4 });
add(MARK.x + 380, MARK.y + 1380, 300, 300, 'mark', { a: 1 });

/** The chip art, in a keep-out at the foot of the marking: the die's bottom-right corner. */
export const ART = { x: MARK.x + 340, y: MARK.y + 1870, w: 380, h: 380 };
add(ART.x, ART.y, ART.w, ART.h, 'art');
add(60, 60, 360, 360, 'mark', { a: 0 });
add(W - 420, 60, 360, 360, 'mark', { a: 2 });
add(60, H - 420, 360, 360, 'mark', { a: 3 });
add(W - 420, H - 420, 360, 360, 'mark', { a: 1 });

/* ------------------------------------------------------------------ channels */

const CHANNELS: [number, number, number, number, number][] = [
  [520, 3300, 10160, 120, 0],
  [520, 6680, 10160, 120, 0],
  [520, 5600, 4780, 100, 0],
  [4700, 520, 120, 2780, 1],
  [8000, 520, 120, 2780, 1],
  [2860, 3420, 100, 2180, 1],
  [5300, 3420, 120, 5660, 1],
  [3760, 6800, 120, 2280, 1],
  [7400, 6800, 120, 2280, 1],
  [9500, 6800, 120, 2280, 1],
  [1300, 6800, 40, 2280, 1],
  [2120, 6800, 40, 2280, 1],
  [2940, 6800, 40, 2280, 1],
];
for (const [x, y, w, h, a] of CHANNELS) add(x, y, w, h, 'bus', { a, seed: 1000 + x + y });

/* ------------------------------------------------------------------ pads */

export interface Pad {
  x: number;
  y: number;
  /** 0 left, 1 bottom, 2 right, 3 top. */
  side: number;
  n: number;
  kind: 'io' | 'vdd' | 'vss' | 'link';
  name?: string;
  label?: string;
  href?: string;
}

/** A site's pad, labelled with its host. */
const site = (url: string) => ({ label: new URL(url).host, href: url });

export const LINK_PADS = [
  { name: 'MAIL', label: profile.email, href: `mailto:${profile.email}` },
  { name: 'LNKD', label: 'LinkedIn', href: profile.linkedin },
  { name: 'GHUB', label: 'GitHub', href: profile.github },
  { name: 'CV', label: 'CV · PDF', href: profile.cv },
  { name: 'NJCT', ...site(db.roles.neuroject.url) },
  { name: 'SMCL', ...site(smartclaim.links.external) },
  { name: 'ATDM', ...site(attendum.links.external) },
  { name: 'AT-I', label: `${attendum.title} · App Store`, href: attendum.links.appStore },
  { name: 'AT-A', label: `${attendum.title} · Google Play`, href: attendum.links.playStore },
  {
    name: 'EG-I',
    label: `${educationGuide.title} · App Store`,
    href: educationGuide.links.appStore,
  },
  {
    name: 'EG-A',
    label: `${educationGuide.title} · Google Play`,
    href: educationGuide.links.playStore,
  },
  { name: 'ACLS', ...site(activeClass.links.external) },
  { name: 'SCHL', ...site(schoolHow.links.external) },
  { name: 'LKIT', ...site(learningKit.links.external) },
  { name: 'EKIT', ...site(examKit.links.external) },
  { name: 'ARXV', label: `${paper.venue} paper`, href: paper.url },
];

export const PAD = 84;
export const PAD_IN = 142; // pad centre, from the die edge
export const PADS: Pad[] = [];
{
  const sideN = [71, 84, 71, 84];
  let n = 1;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < sideN[side]; i++) {
      const along =
        side % 2
          ? 620 + 120 * (side === 1 ? i : sideN[side] - 1 - i)
          : 600 + 120 * (side === 0 ? i : sideN[side] - 1 - i);
      const x = side === 0 ? PAD_IN : side === 2 ? W - PAD_IN : along;
      const y = side === 3 ? PAD_IN : side === 1 ? H - PAD_IN : along;
      const kind = n % 6 === 0 ? 'vdd' : n % 6 === 3 ? 'vss' : 'io';
      PADS.push({ x, y, side, n, kind });
      n++;
    }
  }
  // Bond the links on the bottom edge, every other pad, with ground and supply between them.
  const bottom = PADS.filter((p) => p.side === 1);
  LINK_PADS.forEach((l, i) => {
    const pad = bottom[8 + i * 2];
    Object.assign(pad, { kind: 'link', name: l.name, label: l.label, href: l.href });
    const between = bottom[9 + i * 2];
    if (between) between.kind = i % 2 ? 'vdd' : 'vss';
  });
}
export const BONDED = PADS.filter((p) => p.kind === 'link');

/* ------------------------------------------------------------------ power straps */

/** Rectangles the top-metal power grid stays out of: the inductors, the marking and the art. */
const KEEP_OUT = [RF, MARK, ART];

export interface Strap {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 6 for horizontal M6 straps, 5 for vertical M5 straps. */
  layer: number;
}

function cut(a0: number, a1: number, holes: [number, number][]): [number, number][] {
  let spans: [number, number][] = [[a0, a1]];
  for (const [h0, h1] of holes) {
    spans = spans.flatMap(([s0, s1]) =>
      h1 <= s0 || h0 >= s1
        ? [[s0, s1]]
        : (
            [
              [s0, h0],
              [h1, s1],
            ] as [number, number][]
          ).filter(([u, v]) => v - u > 40),
    );
  }
  return spans;
}

export const STRAPS: Strap[] = [];
for (let y = CORE.y0 + 180; y < CORE.y1 - 60; y += 240) {
  const holes = KEEP_OUT.filter((k) => y + 24 > k.y - 30 && y < k.y + k.h + 30).map(
    (k) => [k.x - 30, k.x + k.w + 30] as [number, number],
  );
  for (const [x0, x1] of cut(CORE.x0 + 30, CORE.x1 - 30, holes))
    STRAPS.push({ x: x0, y, w: x1 - x0, h: 24, layer: 6 });
}
for (let x = CORE.x0 + 240; x < CORE.x1 - 60; x += 240) {
  const holes = KEEP_OUT.filter((k) => x + 14 > k.x - 30 && x < k.x + k.w + 30).map(
    (k) => [k.y - 30, k.y + k.h + 30] as [number, number],
  );
  for (const [y0, y1] of cut(CORE.y0 + 30, CORE.y1 - 30, holes))
    STRAPS.push({ x, y: y0, w: 14, h: y1 - y0, layer: 5 });
}

/* ------------------------------------------------------------------ blocks */

const fitLadder = (...stops: Stop[]): Stop[] => stops;

export const BLOCKS: Block[] = [
  {
    id: 'die',
    tag: PART,
    name: profile.name,
    kind: 'Die marking',
    cat: 'sys',
    ...MARK,
    live: true,
    parts: [],
    probe: [MARK.x + 330, MARK.y + 300],
    ladder: fitLadder(['Metal letters', 0.9], ['Slotted top metal', 6]),
  },
  {
    id: 'p0',
    tag: 'P0',
    name: db.roles.neuroject.org,
    kind: 'Performance core',
    cat: 'cpu',
    x: 520,
    y: P.y,
    w: P.w,
    h: P.h,
    live: true,
    parts: p0Parts,
    probe: [520 + 400, P.y + 1000],
    ladder: fitLadder(['L1 data cache', 0.9], ['Bitlines', 8], ['6T bitcells', 220]),
  },
  {
    id: 'p1',
    tag: 'P1',
    name: db.roles.neuroship.org,
    kind: 'Performance core',
    cat: 'cpu',
    x: 2960,
    y: P.y,
    w: P.w,
    h: P.h,
    live: true,
    parts: p1Parts,
    probe: [2960 + 450, P.y + 1000],
    ladder: fitLadder(
      ['Rename & schedule', 0.9],
      ['Cell rows', 5],
      ['Standard cells', 30],
      ['Transistors', 140],
    ),
  },
  ...eX.map((x, i): Block => ({
    id: `e${i}` as BlockId,
    tag: `E${i}`,
    name: EARLIER[i].short ?? EARLIER[i].org,
    kind: 'Efficiency core',
    cat: 'cpu',
    x,
    y: E.y,
    w: E.w,
    h: E.h,
    live: false,
    parts: eParts[i],
    probe: [x + (i % 2 ? 530 : 250), E.y + 1190],
    ladder: fitLadder(['ALU', 1.6], ['Bit slices', 7], ['Transistors', 120]),
  })),
  {
    id: 'l2',
    tag: 'L2',
    name: 'The stack',
    kind: `Shared cache · ${skills.length} slices`,
    cat: 'mem',
    ...L2,
    live: true,
    parts: l2Parts,
    probe: [L2.x + 20 + SLICE * 0.3, L2.y + 400],
    ladder: fitLadder(['One slice', 0.9], ['Mats', 3], ['Bitcells', 220]),
  },
  {
    id: 'gpu',
    tag: 'GPU',
    name: 'Products',
    kind: `${GPU_PRODUCTS.length} shader cores`,
    cat: 'accel',
    ...GPU,
    live: true,
    parts: gpuParts,
    probe: [GPU.x + 60 + 360, GPU.y + 60 + 600],
    ladder: fitLadder(['Shader core', 0.5], ['SIMD lanes', 3], ['Cells', 30]),
  },
  {
    id: 'npu',
    tag: 'NPU',
    name: 'AI platforms',
    kind: 'Neural accelerator',
    cat: 'accel',
    ...NPU,
    live: true,
    parts: npuParts,
    probe: [PE_ARRAYS[0].x + 150 * 3 + 40, PE_ARRAYS[0].y + 155.7 * 6 + 60],
    ladder: fitLadder(['MAC array', 0.35], ['One PE', 3], ['Multiplier cells', 40]),
  },
  {
    id: 'slc',
    tag: 'SLC',
    name: 'Data at scale',
    kind: `System cache · ${MATS.logger + MATS.attendum} mats`,
    cat: 'mem',
    ...SLC,
    live: true,
    parts: slcParts,
    probe: [SLC.x + 2640 + 640, SLC.y + 60 + 500],
    ladder: fitLadder(['Bank', 0.25], ['Mats', 1.4], ['Bitlines', 10], ['Bitcells', 220]),
  },
  {
    id: 'rf',
    tag: 'RF',
    name: 'Radios',
    kind: 'GSM · BLE · NFC',
    cat: 'hw',
    ...RF,
    live: true,
    parts: rfParts,
    probe: [RF.x + 600 + 330, RF.y + 600],
    ladder: fitLadder(['GSM inductor', 0.6], ['Ground shield', 4]),
  },
  {
    id: 'aon',
    tag: 'AON',
    name: 'Firmware',
    kind: 'Always-on MCU',
    cat: 'hw',
    ...AON,
    live: true,
    parts: aonParts,
    probe: [AON.x + 400, AON.y + 400],
    ladder: fitLadder(['Boot ROM', 0.7], ['Bit array', 12], ['Bits', 160]),
  },
  {
    id: 'pmu',
    tag: 'PMU',
    name: 'Roots',
    kind: 'Power and analog',
    cat: 'hw',
    ...PMU,
    live: true,
    parts: pmuParts,
    probe: [PMU.x + 600, PMU.y + 600],
    ladder: fitLadder(['Power stage', 0.6], ['Fingers', 4], ['Gates', 30]),
  },
  {
    id: 'dbg',
    tag: 'DBG',
    name: 'Upstream fixes',
    kind: 'JTAG and trace',
    cat: 'sys',
    ...DBG,
    live: true,
    parts: dbgParts,
    probe: [DBG.x + 500, DBG.y + 250],
    ladder: fitLadder(['Scan chain', 0.7], ['Flops', 20], ['Transistors', 120]),
  },
  {
    id: 'io',
    tag: 'PADS',
    name: 'Pinout',
    kind: `${PADS.length} pads · ${BONDED.length} bonded`,
    cat: 'sys',
    x: 0,
    y: 0,
    w: W,
    h: H,
    live: true,
    parts: [],
    probe: [BONDED[0].x, BONDED[0].y],
    ladder: fitLadder(['Bonded pads', 0.5], ['Ball bond', 4]),
  },
  {
    id: 'art',
    tag: 'ART',
    name: 'Chip art',
    kind: 'Hidden in the corner',
    cat: 'sys',
    ...ART,
    live: false,
    parts: [],
    probe: [ART.x + 190, ART.y + 200],
    ladder: fitLadder(['The field', 2], ['One robot', 9, ART.x + 40 + 186, ART.y + 36 + 74]),
  },
];

export const BLOCK: Record<BlockId, Block> = Object.fromEntries(
  BLOCKS.map((b) => [b.id, b]),
) as Record<BlockId, Block>;

/** True when (x, y) sits in the pad ring: inside the die, outside the core. */
export const inRing = (x: number, y: number) =>
  x >= 0 &&
  y >= 0 &&
  x <= W &&
  y <= H &&
  (x < CORE.x0 || y < CORE.y0 || x > CORE.x1 || y > CORE.y1);

/** The most specific block at a world point, or null in the gaps between blocks. */
export function blockAt(x: number, y: number): Block | null {
  let best: Block | null = null;
  for (const b of BLOCKS) {
    if (b.id === 'io') continue;
    if (
      x >= b.x &&
      y >= b.y &&
      x <= b.x + b.w &&
      y <= b.y + b.h &&
      (!best || b.w * b.h < best.w * best.h)
    )
      best = b;
  }
  if (best) return best;
  return inRing(x, y) ? BLOCK.io : null;
}

export function partAt(b: Block, x: number, y: number): Part | null {
  for (const p of b.parts) if (x >= p.x && y >= p.y && x <= p.x + p.w && y <= p.y + p.h) return p;
  return null;
}

/** The bonded pad nearest a world point, within reach. */
export function padAt(x: number, y: number, reach = PAD): Pad | null {
  for (const p of BONDED)
    if (Math.abs(p.x - x) < reach && Math.abs(p.y - y) < reach * 1.6) return p;
  return null;
}
