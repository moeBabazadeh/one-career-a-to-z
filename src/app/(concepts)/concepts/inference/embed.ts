// Embeddings for the Projector: every archive entry becomes a bag of its tech tags, expanded
// with a small taxonomy (ESP32 → firmware, Next.js → web, ...) plus where it was made, then
// L2-normalised. Two 3D layouts, as in TensorBoard's projector: the first three principal
// components, and an exact t-SNE initialised from them (so it's deterministic). Nearest
// neighbours use cosine similarity in the original space.

import { archive, db, featuredProjects, oss, otherProjects } from '../_shared/data';
import type { ArchiveEntry } from '@/content/projects';

const { activeClass, learningKit, examKit, logger, attendum } = db.products;
const { epc, attendumReader: reader, attendumBeacon: beacon } = db.devices;
const { bsc } = db.education;
const { robocup } = db.awards;
const { ssl } = db.robots;
const paper = db.papers.inverter;

const FAMILIES: Record<string, string[]> = {
  web: [
    'React',
    'Next.js',
    'Gatsby',
    'Nuxt',
    'Preact',
    'Vite',
    'MUI',
    'Redux',
    'Office.js',
    'SvelteKit',
    'Vanilla JS',
    'VideoSDK',
  ],
  typed: ['TypeScript'],
  mobile: ['Expo', 'React Native'],
  apple: ['Swift', 'SwiftUI', 'Vision'],
  backend: ['Laravel', 'PHP', 'FastAPI', 'Node.js', 'OpenAPI', 'Firebase', 'AWS Lambda'],
  cloud: ['AWS', 'AWS Lambda', 'Firebase'],
  ai: ['OpenAI', 'pgvector', 'Vision'],
  firmware: [
    reader.chip,
    'ESP-IDF',
    beacon.chip,
    'Zephyr',
    'C',
    'FreeRTOS',
    'STM',
    'Firmware',
    'Embedded',
    'Hardware',
  ],
  radio: ['BLE', 'NFC', 'GSM'],
  control: ['Control systems', 'Robotics', 'Power electronics'],
};

export type Group = 'work' | 'oss' | 'hardware' | 'personal';

// Colours are CSS tokens of the concept, so they follow light and dark (the canvas resolves them).
export const GROUPS: { id: Group; label: string; token: string }[] = [
  { id: 'work', label: 'Products at work', token: '--purple' },
  { id: 'hardware', label: 'Hardware and research', token: '--cyan' },
  { id: 'oss', label: 'Open source', token: '--pink' },
  { id: 'personal', label: 'Personal', token: '--fg' },
];

const groupOf = (madeAt = ''): Group => {
  if (madeAt === 'Open source' || madeAt === db.contributions.definitelyTyped.repo.split('/')[0])
    return 'oss';
  if (madeAt === 'Personal') return 'personal';
  if (['In production', bsc.school, paper.venue, 'Robotics'].includes(madeAt)) return 'hardware';
  return 'work';
};

// Longer descriptions for entries whose detail lives elsewhere in the content.
const project = (title: string) =>
  [...featuredProjects, ...otherProjects].find((p) => p.title === title)?.description;
/** The title of the archive entry a test picks, for entries named in words of their own. */
const titleWhere = (pick: (a: ArchiveEntry) => boolean) => archive.find(pick)?.title ?? '';
const EXTRA: Record<string, string | undefined> = {
  [`${activeClass.title} dashboard`]: activeClass.description,
  [`${activeClass.title} Office add-in`]: activeClass.description,
  [`${activeClass.title} website`]: activeClass.description,
  [`${learningKit.title} website`]: learningKit.description,
  [`${examKit.title} website`]: examKit.description,
  [`${logger.title}: ${db.devices.logger.kind}s`]: logger.description,
  [`${epc.name}: ${epc.kind.toLowerCase()}`]: epc.detail,
  [titleWhere((a) => a.tech.includes(reader.chip))]: reader.detail,
  [titleWhere((a) => a.tech.includes(beacon.chip))]: beacon.detail,
  [`${attendum.title} app`]: attendum.description,
  [titleWhere((a) => a.madeAt === bsc.school && a.year === String(bsc.to.y))]:
    `${bsc.school}. Thesis: ${bsc.thesis}.`,
  [ssl.title]: ssl.detail,
  [titleWhere((a) => a.title.startsWith(robocup.event))]:
    `${robocup.place.replace('1st', 'First')} in the ${robocup.challenge} at ${robocup.event} ${robocup.year}.`,
  [titleWhere((a) => a.links.external === paper.url)]: `${paper.title}.`,
};

function describe(a: ArchiveEntry) {
  const c = oss.find((o) => o.url === a.links.github);
  return project(a.title) ?? (c ? `${c.change} ${c.impact}` : EXTRA[a.title]);
}

const FAMILY_NAMES = Object.keys(FAMILIES);
const VOCAB = [...new Set(archive.flatMap((a) => a.tech))];
const PLACES = [...new Set(archive.map((a) => a.madeAt ?? ''))];
const DIMS = FAMILY_NAMES.length + VOCAB.length + PLACES.length;

function vectorOf({ tech, madeAt = '' }: ArchiveEntry) {
  const v = new Array(DIMS).fill(0);
  for (const t of tech) {
    FAMILY_NAMES.forEach((f, i) => {
      if (FAMILIES[f].includes(t)) v[i] += 1;
    });
    v[FAMILY_NAMES.length + VOCAB.indexOf(t)] += 0.8;
  }
  v[FAMILY_NAMES.length + VOCAB.length + PLACES.indexOf(madeAt)] += 0.7;
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

/** Top `k` principal components by power iteration with deflation. Deterministic. */
function pca(rows: number[][], k: number) {
  const d = rows[0].length;
  const mean = new Array(d).fill(0);
  for (const r of rows) r.forEach((x, j) => (mean[j] += x / rows.length));
  const X = rows.map((r) => r.map((x, j) => x - mean[j]));
  const C = Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0) / (rows.length - 1)),
  );
  const comps: number[][] = [];
  for (let c = 0; c < k; c++) {
    let v = Array.from({ length: d }, (_, j) => 1 / (j + 1 + c));
    for (let it = 0; it < 300; it++) {
      const w = C.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      const n = Math.hypot(...w) || 1;
      v = w.map((x) => x / n);
    }
    const lambda = v.reduce((s, x, i) => s + x * C[i].reduce((t, y, j) => t + y * v[j], 0), 0);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] -= lambda * v[i] * v[j];
    comps.push(v);
  }
  return X.map((r) => comps.map((v) => r.reduce((s, x, j) => s + x * v[j], 0)));
}

export interface Point extends ArchiveEntry {
  group: Group;
  description?: string;
  vec: number[];
  layouts: Record<'pca' | 'tsne', [number, number, number]>;
}

/** Exact t-SNE: perplexity-calibrated affinities, early exaggeration, momentum. */
function tsne(X: number[][], init: number[][], perplexity = 10, iterations = 600) {
  const n = X.length;
  const D = X.map((a) => X.map((b) => a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0)));
  const P = D.map((row, i) => {
    let lo = 0,
      hi = Infinity,
      beta = 1,
      p: number[] = [];
    for (let it = 0; it < 60; it++) {
      p = row.map((d, j) => (j === i ? 0 : Math.exp(-d * beta)));
      const sum = p.reduce((a, b) => a + b, 0) || 1e-12;
      const H = Math.log(sum) + (beta * p.reduce((a, pj, j) => a + pj * row[j], 0)) / sum;
      if (Math.abs(H - Math.log(perplexity)) < 1e-5) break;
      if (H > Math.log(perplexity))
        [lo, beta] = [beta, hi === Infinity ? beta * 2 : (beta + hi) / 2];
      else [hi, beta] = [beta, (beta + lo) / 2];
    }
    const sum = p.reduce((a, b) => a + b, 0) || 1e-12;
    return p.map((v) => v / sum);
  });
  const sym = P.map((row, i) => row.map((v, j) => Math.max((v + P[j][i]) / (2 * n), 1e-12)));
  const Y = init.map((r) => r.map((v) => v * 1e-2));
  const V = Y.map((r) => r.map(() => 0));
  for (let it = 0; it < iterations; it++) {
    const exaggerate = it < 120 ? 4 : 1;
    const momentum = it < 120 ? 0.5 : 0.8;
    const num = Y.map((a) => Y.map((b) => 1 / (1 + a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0))));
    let Z = 0;
    num.forEach((row, i) => row.forEach((v, j) => (Z += i === j ? 0 : v)));
    for (let i = 0; i < n; i++) {
      const g = [0, 0, 0];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const f = 4 * (exaggerate * sym[i][j] - num[i][j] / Z) * num[i][j];
        for (let k = 0; k < 3; k++) g[k] += f * (Y[i][k] - Y[j][k]);
      }
      for (let k = 0; k < 3; k++) V[i][k] = momentum * V[i][k] - 60 * g[k];
    }
    Y.forEach((r, i) => r.forEach((_, k) => (r[k] += V[i][k])));
  }
  return Y;
}

/** Centres a layout and scales it so its spread is comparable between methods. */
function fit(layout: number[][]): [number, number, number][] {
  const mean = [0, 1, 2].map((c) => layout.reduce((s, p) => s + p[c], 0) / layout.length);
  const centred = layout.map((p) => p.map((v, c) => v - mean[c]));
  const max = Math.max(...centred.map((p) => Math.hypot(...p))) || 1;
  return centred.map((p) => p.map((v) => (v / max) * 1.1) as [number, number, number]);
}

const VECS = archive.map(vectorOf);
const PROJ = pca(VECS, 3);
const STD = [0, 1, 2].map((c) =>
  Math.sqrt(PROJ.reduce((s, p) => s + p[c] * p[c], 0) / PROJ.length),
);
const PCA_LAYOUT = PROJ.map((p, i) => {
  // a whisper of deterministic jitter, so entries with identical tags don't hide each other
  const j = (n: number) => Math.sin(i * 12.9898 + n * 78.233) * 0.05;
  return p.map((v, c) => Math.max(-1.25, Math.min(1.25, (v / STD[c]) * 0.5)) + j(c)) as [
    number,
    number,
    number,
  ];
});
const TSNE_LAYOUT = fit(tsne(VECS, PCA_LAYOUT));

export type Method = 'pca' | 'tsne';

export const POINTS: Point[] = archive.map((a, i) => ({
  ...a,
  group: groupOf(a.madeAt),
  description: describe(a),
  vec: VECS[i],
  layouts: { pca: PCA_LAYOUT[i], tsne: TSNE_LAYOUT[i] },
}));

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

export function neighbours(i: number, k = 5) {
  return POINTS.map((p, j) => ({ j, sim: cosine(POINTS[i].vec, p.vec) }))
    .filter(({ j }) => j !== i)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
}
