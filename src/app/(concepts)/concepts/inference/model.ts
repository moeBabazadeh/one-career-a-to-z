// The toy network behind Fig. 1 of the Forward Pass concept: 11 inputs, two ReLU layers of
// labelled features and a sigmoid head with one unit per thing shipped (multi-label, so the
// outputs don't compete the way a softmax would). Every weight is set by hand and most are zero.
// The hidden layers have no bias, which makes the network piecewise linear and homogeneous:
// a logit minus its bias is exactly the sum of its path contributions, x·w·w·w.

import { db } from '../_shared/data';

const { neurobuild, smartclaim, attendum, educationGuide, activeClass, schoolHow } = db.products;
const { logger, epc, plc, attendumReader: reader, attendumBeacon: beacon } = db.devices;

export interface Unit {
  label: string;
  note: string;
}

export type Kind = 'device' | 'app' | 'platform';

export interface OutputUnit {
  label: string;
  kind: Kind;
  /** Title of the matching entry in content or the hardware list. */
  ref: string;
}

export const INPUTS: Unit[] = [
  { label: 'Embedded C', note: `Firmware for STM, ${reader.chip} and ${beacon.chip} boards.` },
  {
    label: 'Control systems',
    note: `The ${db.education.bsc.degree} focus. A self-balancing robot with fuzzy control.`,
  },
  {
    label: 'BLE · NFC · GSM',
    note: `The radio links on the ${logger.name} and ${attendum.title} devices.`,
  },
  { label: 'TypeScript', note: 'Across the web apps, the mobile apps and a client SDK.' },
  {
    label: 'React & Next.js',
    note: `${neurobuild.title}, ${schoolHow.title}, ${activeClass.title} and the product sites.`,
  },
  {
    label: 'React Native & Expo',
    note: `${attendum.title} and ${educationGuide.title}, on both stores.`,
  },
  { label: 'Laravel (PHP)', note: `${neurobuild.title}’s API, deployed on Laravel Vapor.` },
  { label: 'Python & FastAPI', note: `${smartclaim.title}’s API.` },
  { label: 'PostgreSQL & MySQL', note: 'Relational data, and pgvector for retrieval.' },
  { label: 'AWS', note: 'Amplify, Vapor, alarms and infrastructure as code.' },
  { label: 'LLMs & pgvector', note: `The AI in ${neurobuild.title} and ${smartclaim.title}.` },
];

export const L1: Unit[] = [
  {
    label: 'bare-metal firmware',
    note: 'Drivers, RTOS tasks and over-the-air updates on microcontrollers.',
  },
  {
    label: 'control loops',
    note: 'Holding a setpoint: fuzzy control, PLC logic, pressure and flow.',
  },
  { label: 'radio links', note: 'BLE, NFC, RFID and GSM uplinks.' },
  { label: 'native mobile', note: 'React Native apps for iOS and Android.' },
  { label: 'web frontend', note: 'React and Next.js frontends.' },
  { label: 'PHP backends', note: 'Laravel APIs and their data.' },
  { label: 'Python APIs', note: 'FastAPI services.' },
  { label: 'cloud ops', note: 'AWS hosting, alarms and infrastructure as code.' },
  { label: 'LLMs & retrieval', note: 'Natural-language access to data, backed by vector search.' },
];

export const L2: Unit[] = [
  { label: 'device in the field', note: 'Hardware that ships and keeps running.' },
  { label: 'process control', note: 'Closed-loop control in production.' },
  { label: 'connected device', note: 'Devices that report home or check people in.' },
  { label: 'store app', note: 'Apps on the App Store and Google Play.' },
  { label: 'web app', note: 'Dashboards, platforms and product sites.' },
  {
    label: 'multi-tenant SaaS',
    note: 'One platform for many organisations, with permissions and audit trails.',
  },
  {
    label: 'AI assistance',
    note: 'Natural-language questions, assisted claims and early risk warnings.',
  },
];

const device = (d: db.Device): OutputUnit => ({ label: d.name, kind: 'device', ref: d.tag });
const product = (p: db.Product, kind: Kind, label = p.title): OutputUnit => ({
  label,
  kind,
  ref: p.title,
});

export const OUTPUTS: OutputUnit[] = [
  device(logger),
  device(epc),
  device(plc),
  device(reader),
  device(beacon),
  product(attendum, 'app', `${attendum.title} app`),
  product(educationGuide, 'app'),
  product(activeClass, 'platform'),
  product(schoolHow, 'platform'),
  product(neurobuild, 'platform'),
  product(smartclaim, 'platform'),
];

export const LAYERS = [INPUTS, L1, L2, OUTPUTS] as const;
export const LAYER_NAMES = ['input', 'features_1', 'features_2', 'shipped'];

/** [from, to, weight] */
export type Edge = [number, number, number];

// inputs → features_1
const W1: Edge[] = [
  [0, 0, 1.0],
  [1, 0, 0.2],
  [1, 1, 1.0],
  [0, 1, 0.4],
  [2, 2, 1.0],
  [0, 2, 0.4],
  [5, 3, 1.0],
  [3, 3, 0.3],
  [4, 4, 1.0],
  [3, 4, 0.5],
  [6, 5, 1.0],
  [8, 5, 0.3],
  [7, 6, 1.0],
  [8, 6, 0.3],
  [9, 7, 1.0],
  [6, 7, 0.15],
  [10, 8, 1.0],
  [7, 8, 0.3],
  [8, 8, 0.2],
];

// features_1 → features_2
const W2: Edge[] = [
  [0, 0, 1.0],
  [2, 0, 0.3],
  [1, 1, 1.0],
  [0, 1, 0.3],
  [2, 2, 1.0],
  [0, 2, 0.3],
  [3, 3, 1.0],
  [4, 3, 0.2],
  [4, 4, 1.0],
  [5, 5, 0.8],
  [7, 5, 0.8],
  [4, 5, 0.3],
  [6, 5, 0.2],
  [8, 6, 1.0],
  [6, 6, 0.6],
];

// features_2 → shipped. The few negative weights keep hardware and SaaS features from
// voting for each other's products.
const W3: Edge[] = [
  [0, 0, 3.0],
  [2, 0, 3.0],
  [5, 0, -0.6],
  [1, 1, 3.0],
  [0, 1, 2.4],
  [5, 1, -0.6],
  [1, 2, 3.0],
  [0, 2, 2.4],
  [5, 2, -0.6],
  [0, 3, 3.0],
  [2, 3, 3.0],
  [3, 3, 0.45],
  [0, 4, 2.7],
  [2, 4, 3.0],
  [3, 5, 4.0],
  [2, 5, 1.0],
  [5, 5, 0.6],
  [3, 6, 4.0],
  [4, 7, 4.0],
  [4, 8, 4.0],
  [5, 9, 2.4],
  [4, 9, 1.44],
  [6, 9, 0.84],
  [0, 9, -0.36],
  [6, 10, 4.0],
  [4, 10, 1.2],
  [5, 10, 0.8],
  [0, 10, -0.6],
];

export const WEIGHTS = [W1, W2, W3];

const SIZES = LAYERS.map((l) => l.length);
const relu = (v: number) => (v > 0 ? v : 0);
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function propagate(x: number[], bias: number[]) {
  const a = [x];
  for (let l = 0; l < 3; l++) {
    const z = new Array(SIZES[l + 1]).fill(0);
    for (const [f, t, w] of WEIGHTS[l]) z[t] += w * a[l][f];
    a.push(l < 2 ? z.map(relu) : z.map((v, o) => v + bias[o]));
  }
  return a;
}

/** The head's bias puts every output at logit 3 (p ≈ 0.95) with all inputs on. */
export const BIAS = propagate(new Array(SIZES[0]).fill(1), new Array(SIZES[3]).fill(0))[3].map(
  (z) => Math.round((3 - z) * 100) / 100,
);

export const THRESHOLD = 0.5;

export interface Pass {
  /** Activations per layer: x, features_1, features_2, then logits. */
  a: number[][];
  p: number[];
}

export function forward(x: number[]): Pass {
  const a = propagate(x, BIAS);
  return { a, p: a[3].map(sigmoid) };
}

/** One route from an input to an output, and its contribution to that output's logit. */
export interface Path {
  nodes: [number, number, number, number];
  value: number;
}

/** Every path with a non-zero contribution. With no hidden biases they sum to logit − bias. */
export function allPaths({ a }: Pass): Path[] {
  const out: Path[] = [];
  for (const [i, j, w1] of W1) {
    if (!a[0][i] || !a[1][j]) continue;
    for (const [j2, k, w2] of W2) {
      if (j2 !== j || !a[2][k]) continue;
      for (const [k2, o, w3] of W3) {
        if (k2 === k) out.push({ nodes: [i, j, k, o], value: a[0][i] * w1 * w2 * w3 });
      }
    }
  }
  return out;
}

export interface NodeRef {
  layer: number;
  index: number;
}

export interface Trace {
  paths: Path[];
  /** Summed contribution per edge: edges[l][to][from], for the edge layer l → l + 1. */
  edges: number[][][];
  /** Summed contribution through each node, per layer. */
  nodes: number[][];
  total: number;
}

/** Restricts the paths to those through `node` and sums them per edge and per node. */
export function trace(paths: Path[], node: NodeRef): Trace {
  const edges = [0, 1, 2].map((l) =>
    Array.from({ length: SIZES[l + 1] }, () => new Array(SIZES[l]).fill(0)),
  );
  const nodes = SIZES.map((n) => new Array(n).fill(0));
  const picked = paths.filter((p) => p.nodes[node.layer] === node.index);
  let total = 0;
  for (const p of picked) {
    const [i, j, k, o] = p.nodes;
    edges[0][j][i] += p.value;
    edges[1][k][j] += p.value;
    edges[2][o][k] += p.value;
    nodes[0][i] += p.value;
    nodes[1][j] += p.value;
    nodes[2][k] += p.value;
    nodes[3][o] += p.value;
    total += p.value;
  }
  picked.sort((p, q) => Math.abs(q.value) - Math.abs(p.value));
  return { paths: picked, edges, nodes, total };
}

/**
 * Each input's contribution to a node's pre-activation, through the live paths that reach it.
 * They sum to the node's value (minus the bias, for an output).
 */
export function feeds({ a }: Pass, node: NodeRef): number[] {
  // contributions of every input to every unit, layer by layer, gated by the ReLUs
  let c = a[0].map((x, i) => a[0].map((_, k) => (k === i ? x : 0)));
  for (let l = 0; l < node.layer; l++) {
    const next = Array.from({ length: SIZES[l + 1] }, () => new Array(SIZES[0]).fill(0));
    for (const [f, t, w] of WEIGHTS[l]) {
      if (l < 2 && !a[l + 1][t]) continue;
      for (let i = 0; i < SIZES[0]; i++) next[t][i] += w * c[f][i];
    }
    c = next;
  }
  return c[node.index];
}

/** Inputs that, removed on their own, would push output `o` under the threshold. */
export function necessary(x: number[], o: number): number[] {
  return x.flatMap((v, i) => {
    if (!v) return [];
    const p = forward(x.map((u, k) => (k === i ? 0 : u))).p[o];
    return p < THRESHOLD ? [i] : [];
  });
}

/** Parameter counts for model.summary(): dense shape and non-zero entries. */
export const SUMMARY = [0, 1, 2].map((l) => ({
  name: LAYER_NAMES[l + 1],
  units: SIZES[l + 1],
  activation: l < 2 ? 'relu' : 'sigmoid',
  params: SIZES[l] * SIZES[l + 1] + (l === 2 ? SIZES[3] : 0),
  nonzero: WEIGHTS[l].length + (l === 2 ? SIZES[3] : 0),
}));
