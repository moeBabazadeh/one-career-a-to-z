// The map of the factory, in tiles. Everything flows left to right: resource patches, then the
// part assemblers, a routing channel with splitters and underground belts, the product
// assemblers and the shipping docks. Crossings become underground belts on their own.

import { ITEMS, type ItemId, type PartId, type ProductId, type RawId } from './items';

export const COLS = 49;
export const ROWS = 30;

/** East, south, west, north: the canvas has y pointing down. */
export type Dir = 0 | 1 | 2 | 3;
export const E: Dir = 0,
  S: Dir = 1,
  W: Dir = 2,
  N: Dir = 3;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export interface BeltSpec {
  id: string;
  item: ItemId;
  /** Waypoints, tile coordinates. The belt runs straight between them. */
  pts: [number, number][];
  /** Direction of the last tile, for one-tile belts. */
  end?: Dir;
}

export interface InserterSpec {
  x: number;
  y: number;
  /** From the pickup tile towards the drop tile. */
  dir: Dir;
}

export interface MachineSpec {
  id: string;
  recipe: PartId | ProductId;
  x: number;
  y: number;
  ins: InserterSpec[];
  out: InserterSpec;
  ghost?: boolean;
}

export interface DrillSpec {
  id: string;
  res: RawId;
  x: number;
  y: number;
  /** The belt tile the drill drops onto. */
  out: [number, number];
  dir: Dir;
  ghost?: boolean;
}

export interface SplitterSpec {
  id: string;
  /** Left and right halves, looking downstream. */
  a: [number, number];
  b: [number, number];
  dir: Dir;
  names: [string, string];
}

export type DockId = 'web' | 'appstore' | 'play' | 'field';

export interface DockSpec {
  id: DockId;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PatchSpec {
  res: RawId;
  label: string;
  /** Ore area, in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PATCHES: PatchSpec[] = [
  { res: 'react', label: 'React · Next', x: 0, y: 0, w: 5, h: 3 },
  { res: 'php', label: 'Laravel', x: 0, y: 3, w: 5, h: 3 },
  { res: 'aws', label: 'AWS', x: 0, y: 6, w: 5, h: 3 },
  { res: 'py', label: 'Python', x: 0, y: 9, w: 5, h: 2 },
  { res: 'sql', label: 'SQL', x: 0, y: 11, w: 5, h: 2 },
  { res: 'ts', label: 'TypeScript', x: 0, y: 13, w: 5, h: 3 },
  { res: 'rn', label: 'React Native', x: 0, y: 16, w: 5, h: 3 },
  { res: 'c', label: 'Embedded C', x: 0, y: 21, w: 5, h: 6 },
];

export const DRILLS: DrillSpec[] = [
  { id: 'd-react', res: 'react', x: 3, y: 1, out: [5, 1], dir: E },
  { id: 'd-php', res: 'php', x: 3, y: 4, out: [5, 4], dir: E },
  { id: 'd-aws', res: 'aws', x: 3, y: 7, out: [5, 7], dir: E },
  { id: 'd-py', res: 'py', x: 3, y: 9, out: [5, 9], dir: E },
  { id: 'd-sql', res: 'sql', x: 3, y: 11, out: [5, 11], dir: E },
  { id: 'd-ts', res: 'ts', x: 3, y: 13, out: [5, 13], dir: E },
  { id: 'd-rn', res: 'rn', x: 3, y: 17, out: [5, 17], dir: E },
  { id: 'd-c', res: 'c', x: 3, y: 22, out: [5, 22], dir: E },
  { id: 'd-c2', res: 'c', x: 3, y: 24, out: [5, 24], dir: E, ghost: true },
];

export const MACHINES: MachineSpec[] = [
  {
    id: 'm-web',
    recipe: 'web',
    x: 13,
    y: 0,
    ins: [{ x: 12, y: 1, dir: E }],
    out: { x: 16, y: 1, dir: E },
  },
  {
    id: 'm-api',
    recipe: 'api',
    x: 13,
    y: 3,
    ins: [{ x: 12, y: 4, dir: E }],
    out: { x: 16, y: 4, dir: E },
  },
  {
    id: 'm-cloud',
    recipe: 'cloud',
    x: 13,
    y: 6,
    ins: [{ x: 12, y: 7, dir: E }],
    out: { x: 16, y: 7, dir: E },
  },
  {
    id: 'm-ai',
    recipe: 'ai',
    x: 13,
    y: 9,
    ins: [
      { x: 12, y: 9, dir: E },
      { x: 12, y: 11, dir: E },
    ],
    out: { x: 16, y: 10, dir: E },
  },
  {
    id: 'm-sdk',
    recipe: 'sdk',
    x: 13,
    y: 12,
    ins: [{ x: 12, y: 13, dir: E }],
    out: { x: 16, y: 13, dir: E },
  },
  {
    id: 'm-mob',
    recipe: 'mob',
    x: 13,
    y: 16,
    ins: [{ x: 12, y: 17, dir: E }],
    out: { x: 16, y: 17, dir: E },
  },
  {
    id: 'm-fw',
    recipe: 'fw',
    x: 9,
    y: 24,
    ins: [{ x: 10, y: 23, dir: S }],
    out: { x: 10, y: 27, dir: S },
  },
  {
    id: 'm-fw2',
    recipe: 'fw',
    x: 13,
    y: 24,
    ins: [{ x: 14, y: 23, dir: S }],
    out: { x: 14, y: 27, dir: S },
    ghost: true,
  },
  {
    id: 'm-nb',
    recipe: 'nb',
    x: 32,
    y: 1,
    ins: [
      { x: 31, y: 1, dir: E },
      { x: 31, y: 2, dir: E },
      { x: 31, y: 3, dir: E },
    ],
    out: { x: 35, y: 2, dir: E },
  },
  {
    id: 'm-sc',
    recipe: 'sc',
    x: 32,
    y: 7,
    ins: [
      { x: 31, y: 8, dir: E },
      { x: 31, y: 9, dir: E },
    ],
    out: { x: 35, y: 8, dir: E },
  },
  {
    id: 'm-at',
    recipe: 'at',
    x: 32,
    y: 12,
    ins: [
      { x: 31, y: 12, dir: E },
      { x: 31, y: 14, dir: E },
      { x: 33, y: 15, dir: N },
    ],
    out: { x: 35, y: 13, dir: E },
  },
  {
    id: 'm-eg',
    recipe: 'eg',
    x: 32,
    y: 18,
    ins: [
      { x: 31, y: 19, dir: E },
      { x: 31, y: 20, dir: E },
    ],
    out: { x: 35, y: 19, dir: E },
  },
  {
    id: 'm-lg',
    recipe: 'lg',
    x: 32,
    y: 24,
    ins: [{ x: 31, y: 25, dir: E }],
    out: { x: 35, y: 25, dir: E },
  },
];

export const SPLITTERS: SplitterSpec[] = [
  { id: 's-ts', a: [7, 13], b: [7, 14], dir: E, names: ['the SDK', ITEMS.eg.name] },
  { id: 's-web', a: [18, 1], b: [18, 2], dir: E, names: [ITEMS.nb.name, ITEMS.at.name] },
  { id: 's-mob', a: [18, 17], b: [18, 18], dir: E, names: [ITEMS.at.name, ITEMS.eg.name] },
  { id: 's-fw', a: [24, 27], b: [24, 28], dir: E, names: [ITEMS.at.name, ITEMS.lg.name] },
  { id: 's-at', a: [37, 13], b: [37, 14], dir: E, names: ['the stores', 'the field'] },
  { id: 's-store', a: [42, 15], b: [42, 16], dir: E, names: ['the App Store', 'Google Play'] },
];

export const BELTS: BeltSpec[] = [
  // raw resources
  {
    id: 'b-react',
    item: 'react',
    pts: [
      [5, 1],
      [11, 1],
    ],
  },
  {
    id: 'b-php',
    item: 'php',
    pts: [
      [5, 4],
      [11, 4],
    ],
  },
  {
    id: 'b-aws',
    item: 'aws',
    pts: [
      [5, 7],
      [11, 7],
    ],
  },
  {
    id: 'b-py',
    item: 'py',
    pts: [
      [5, 9],
      [11, 9],
    ],
  },
  {
    id: 'b-sql',
    item: 'sql',
    pts: [
      [5, 11],
      [11, 11],
    ],
  },
  {
    id: 'b-ts',
    item: 'ts',
    pts: [
      [5, 13],
      [6, 13],
    ],
  },
  {
    id: 'b-ts-sdk',
    item: 'ts',
    pts: [
      [7, 13],
      [11, 13],
    ],
  },
  {
    id: 'b-ts-eg',
    item: 'ts',
    pts: [
      [7, 14],
      [8, 14],
      [8, 20],
      [30, 20],
    ],
  },
  {
    id: 'b-rn',
    item: 'rn',
    pts: [
      [5, 17],
      [11, 17],
    ],
  },
  {
    id: 'b-c',
    item: 'c',
    pts: [
      [5, 25],
      [5, 22],
      [17, 22],
    ],
  },
  // parts
  { id: 'b-web', item: 'web', pts: [[17, 1]], end: E },
  {
    id: 'b-web-nb',
    item: 'web',
    pts: [
      [18, 1],
      [30, 1],
    ],
  },
  {
    id: 'b-web-at',
    item: 'web',
    pts: [
      [18, 2],
      [19, 2],
      [19, 12],
      [30, 12],
    ],
  },
  {
    id: 'b-api',
    item: 'api',
    pts: [
      [17, 4],
      [21, 4],
      [21, 2],
      [30, 2],
    ],
  },
  {
    id: 'b-cloud',
    item: 'cloud',
    pts: [
      [17, 7],
      [23, 7],
      [23, 3],
      [30, 3],
    ],
  },
  {
    id: 'b-ai',
    item: 'ai',
    pts: [
      [17, 10],
      [25, 10],
      [25, 8],
      [30, 8],
    ],
  },
  {
    id: 'b-sdk',
    item: 'sdk',
    pts: [
      [17, 13],
      [27, 13],
      [27, 9],
      [30, 9],
    ],
  },
  { id: 'b-mob', item: 'mob', pts: [[17, 17]], end: E },
  {
    id: 'b-mob-at',
    item: 'mob',
    pts: [
      [18, 17],
      [33, 17],
      [33, 16],
    ],
  },
  {
    id: 'b-mob-eg',
    item: 'mob',
    pts: [
      [18, 18],
      [19, 18],
      [19, 19],
      [30, 19],
    ],
  },
  {
    id: 'b-fw',
    item: 'fw',
    pts: [
      [9, 28],
      [23, 28],
    ],
  },
  {
    id: 'b-fw-at',
    item: 'fw',
    pts: [
      [24, 27],
      [25, 27],
      [25, 14],
      [30, 14],
    ],
  },
  {
    id: 'b-fw-lg',
    item: 'fw',
    pts: [
      [24, 28],
      [30, 28],
      [30, 25],
    ],
  },
  // products
  {
    id: 'b-nb',
    item: 'nb',
    pts: [
      [36, 2],
      [43, 2],
    ],
  },
  {
    id: 'b-sc',
    item: 'sc',
    pts: [
      [36, 8],
      [43, 8],
    ],
  },
  { id: 'b-at', item: 'at', pts: [[36, 13]], end: E },
  {
    id: 'b-at-store',
    item: 'at',
    pts: [
      [37, 13],
      [40, 13],
      [40, 15],
      [41, 15],
    ],
  },
  {
    id: 'b-at-field',
    item: 'at',
    pts: [
      [37, 14],
      [38, 14],
      [38, 24],
    ],
  },
  {
    id: 'b-eg',
    item: 'eg',
    pts: [
      [36, 19],
      [40, 19],
      [40, 16],
    ],
  },
  {
    id: 'b-store-app',
    item: 'at',
    pts: [
      [42, 15],
      [43, 15],
    ],
  },
  {
    id: 'b-store-play',
    item: 'at',
    pts: [
      [42, 16],
      [43, 16],
    ],
  },
  {
    id: 'b-lg',
    item: 'lg',
    pts: [
      [36, 25],
      [43, 25],
    ],
  },
];

export const DOCKS: DockSpec[] = [
  { id: 'web', name: 'Web', x: 44, y: 1, w: 5, h: 9 },
  { id: 'appstore', name: 'App Store', x: 44, y: 12, w: 5, h: 4 },
  { id: 'play', name: 'Google Play', x: 44, y: 16, w: 5, h: 4 },
  { id: 'field', name: 'Field', x: 44, y: 22, w: 5, h: 7 },
];

/** Small electric poles, for looks, and the wires between them. */
export const POLES: [number, number][] = [
  [10, 2],
  [10, 5],
  [10, 8],
  [10, 12],
  [10, 15],
  [10, 19],
  [22, 5],
  [22, 11],
  [22, 15],
  [29, 5],
  [29, 11],
  [29, 16],
  [29, 22],
  [36, 5],
  [36, 10],
  [36, 16],
  [36, 22],
];

export const WIRES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [6, 7],
  [7, 8],
  [9, 10],
  [10, 11],
  [11, 12],
  [13, 14],
  [14, 15],
  [15, 16],
  [6, 9],
  [9, 13],
  [8, 11],
  [12, 16],
];
