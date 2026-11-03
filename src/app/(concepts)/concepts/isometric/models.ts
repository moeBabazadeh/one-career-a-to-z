// The parametric assemblies the viewer opens: one per device in db.devices. Pure data, no three:
// the tree, the BOM and the inspector read it on the server, and the engine builds meshes from it
// on the client. Every model is illustrative geometry in model units (u), not production CAD, so
// nothing here claims a dimension. Names are generic parts; the one fact on a model is the main
// chip's marking, read from db where db has it.
import { db } from '../_shared/data';

export type V3 = [number, number, number];
/** An instance position in the parent frame, with an optional extra turn about Y. */
export type V4 = [number, number, number, number?];
type P2 = [number, number];

export type DeviceId = keyof typeof db.devices;

export type Mat =
  | 'shell'
  | 'shellWhite'
  | 'shellDark'
  | 'lens'
  | 'steel'
  | 'alu'
  | 'gold'
  | 'copper'
  | 'pcbGreen'
  | 'pcbBlue'
  | 'pcbBlack'
  | 'pcbPurple'
  | 'ic'
  | 'ceramic'
  | 'rubber'
  | 'battery'
  | 'batteryDark'
  | 'ledRed'
  | 'ledGreen'
  | 'ledAmber'
  | 'ledBlue'
  | 'terminal'
  | 'orange'
  | 'white'
  | 'zinc';

export type Kind =
  | 'assembly'
  | 'enclosure'
  | 'fastener'
  | 'pcb'
  | 'ic'
  | 'module'
  | 'passive'
  | 'connector'
  | 'power'
  | 'rf'
  | 'display'
  | 'indicator'
  | 'switch'
  | 'mechanical'
  | 'fluid'
  | 'sensor'
  | 'label'
  | 'reference';

export interface Hole {
  x: number;
  z: number;
  r: number;
  w?: number;
  d?: number;
}
/** A boss or post; `y` is where it starts (a tray's floor by default). */
export interface Boss {
  x: number;
  z: number;
  r: number;
  h: number;
  hole?: number;
  y?: number;
}

export type Shape =
  | { t: 'box'; w: number; h: number; d: number; r?: number }
  | { t: 'cyl'; r: number; h: number; r2?: number; seg?: number }
  | { t: 'tube'; r: number; ri: number; h: number }
  | {
      t: 'tray';
      w: number;
      d: number;
      h: number;
      wall: number;
      r: number;
      holes?: Hole[];
      bosses?: Boss[];
    }
  | {
      t: 'ptray';
      outer: P2[];
      inner: P2[];
      depth: number;
      wall: number;
      end?: boolean;
      holes?: Hole[];
      bosses?: Boss[];
    }
  | {
      t: 'board';
      w: number;
      d: number;
      th: number;
      r?: number;
      round?: boolean;
      outline?: P2[];
      holes?: Hole[];
    }
  | { t: 'lathe'; pts: P2[]; seg?: number; hex?: P2[]; hexMat?: Mat; bosses?: Boss[] }
  | { t: 'qfp'; w: number; h: number; pins: number }
  | { t: 'qfn'; w: number; h: number }
  | { t: 'soic'; w: number; d: number; h: number; pins: number }
  | { t: 'dpak'; w: number; d: number; h: number }
  | { t: 'module'; w: number; d: number; shield: V3; antenna?: boolean }
  | { t: 'coil'; w: number; d: number; turns: number; pitch: number; trace: number }
  | { t: 'meander'; w: number; d: number; n: number; trace: number }
  | { t: 'screw'; head: number; hh: number; r: number; len: number }
  | { t: 'terminal'; n: number; pitch: number; h: number; d: number }
  | { t: 'header'; n: number; pitch: number }
  | { t: 'ring'; w: number; d: number; r: number; band: number; th: number }
  | { t: 'extrudeX'; outline: P2[]; holes?: Hole[]; len: number }
  | { t: 'tact'; s: number; h: number }
  | { t: 'ecap'; r: number; h: number }
  | { t: 'led'; w: number; d: number; h: number }
  | { t: 'chip'; w: number; d: number; h: number }
  | { t: 'lcd'; w: number; d: number; h: number }
  | { t: 'sim'; w: number; d: number; h: number }
  | { t: 'valve'; r: number; h: number }
  | { t: 'sensor'; r: number; h: number }
  | { t: 'relay'; w: number; d: number; h: number }
  | { t: 'strap'; w: number; h: number; d: number };

/** Where a part goes when the assembly explodes: a direction in its parent's frame, a distance, and its stage (0 first, 1 last). */
export interface Explode {
  d: V3;
  s: number;
  st: number;
}

export type Decal =
  | { kind: 'mark'; text: string }
  | { kind: 'pcb' }
  | { kind: 'lcd' }
  | { kind: 'plate'; lines: string[]; vertical?: boolean };

export interface Node {
  id: string;
  name: string;
  kind: Kind;
  /** Designator; on a pattern, the first one (D1 → D1…D12). */
  ref?: string;
  /** Generic description for the BOM. */
  desc?: string;
  mat?: Mat;
  shape?: Shape;
  pos?: V3;
  rot?: V3;
  ex?: Explode;
  decal?: Decal;
  /** A pattern: one instance per entry. */
  at?: V4[];
  children?: Node[];
  /** Reference geometry stays out of the BOM. */
  bom?: false;
  /** Parts that share a number in the BOM share this key. */
  pn?: string;
  /** Silkscreen text turns this much on the board (radians). */
  spin?: number;
}

export interface Model {
  id: DeviceId;
  tag: string;
  name: string;
  kind: string;
  /** The axis the assembly comes apart along. */
  axis: string;
  chip?: string;
  root: Node;
}

const { PI } = Math;
const HALF = PI / 2;
const UP: V3 = [0, 1, 0];
const ex = (d: V3, s: number, st: number): Explode => ({ d, s, st });

/* ------------------------------------------------------------------ small part helpers */

const r0402 = { t: 'chip', w: 0.26, d: 0.13, h: 0.09 } as const;
const c0402 = { t: 'chip', w: 0.26, d: 0.13, h: 0.11 } as const;

/** Passives in a ring around a chip at (cx, cz): n spots, alternating sides, deterministic. */
function around(
  cx: number,
  cz: number,
  half: number,
  n: number,
  y: number,
  gap = 0.34,
  sides = [0, 1, 2, 3],
): V4[] {
  const out: V4[] = [];
  const side = Math.ceil(n / sides.length);
  for (let i = 0; i < n; i++) {
    const s = sides[i % sides.length];
    const k = Math.floor(i / sides.length);
    const t = side === 1 ? 0 : (k / (side - 1) - 0.5) * half * 1.4;
    const o = half + gap;
    if (s === 0) out.push([cx + t, y, cz - o, 0]);
    else if (s === 1) out.push([cx + o, y, cz + t, HALF]);
    else if (s === 2) out.push([cx - t, y, cz + o, 0]);
    else out.push([cx - o, y, cz - t, HALF]);
  }
  return out;
}

/** A row of spots from (x0, z0), stepping (dx, dz). */
const row = (x0: number, z0: number, dx: number, dz: number, n: number, y: number, ry = 0): V4[] =>
  Array.from({ length: n }, (_, i) => [x0 + dx * i, y, z0 + dz * i, ry]);

const onRing = (r: number, n: number, y: number, a0 = 0, cx = 0, cz = 0): V4[] =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * PI * 2;
    return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, -a];
  });

const lift = ex(UP, 0.6, 1);

function screws(
  id: string,
  n: number,
  at: V4[],
  rot: V3,
  explode: Explode,
  s: { head: number; hh: number; r: number; len: number },
): Node {
  return {
    id,
    name: 'Machine screw',
    kind: 'fastener',
    desc: 'Machine screw, pan head',
    mat: 'steel',
    shape: { t: 'screw', ...s },
    rot,
    ex: explode,
    at: at.slice(0, n),
    pn: 'screw',
  };
}

function passives(prefix: string, rAt: V4[], cAt: V4[], y = 0): Node[] {
  return [
    {
      id: `${prefix}-r`,
      name: 'Chip resistor',
      kind: 'passive',
      ref: 'R1',
      desc: 'Thick-film chip resistor',
      mat: 'ic',
      shape: r0402,
      at: rAt.map(([x, , z, r]) => [x, y, z, r]),
      ex: lift,
      pn: 'res',
    },
    {
      id: `${prefix}-c`,
      name: 'Ceramic capacitor',
      kind: 'passive',
      ref: 'C1',
      desc: 'Multilayer ceramic capacitor',
      mat: 'ceramic',
      shape: c0402,
      at: cAt.map(([x, , z, r]) => [x, y, z, r]),
      ex: lift,
      pn: 'cap',
    },
  ];
}

/* ------------------------------------------------------------------ the five devices */

const d = db.devices;

function reader(): Model {
  const dev = d.attendumReader;
  const T = 0.12;
  const corners: V4[] = [
    [-2.9, 0, -4.9],
    [2.9, 0, -4.9],
    [-2.9, 0, 4.9],
    [2.9, 0, 4.9],
  ];
  const screwHoles = corners.map(([x, , z]) => ({ x, z, r: 0.15 }));
  return {
    id: 'attendumReader',
    tag: dev.tag,
    name: dev.name,
    kind: dev.kind,
    axis: 'Z',
    chip: dev.chip,
    root: {
      id: 'asm',
      name: `${dev.tag} ${dev.name}`,
      kind: 'assembly',
      children: [
        {
          id: 'enc',
          name: 'Enclosure',
          kind: 'assembly',
          children: [
            {
              id: 'front',
              name: 'Front cover',
              kind: 'enclosure',
              desc: 'Front cover, moulded',
              mat: 'shellWhite',
              shape: {
                t: 'tray',
                w: 7.6,
                d: 11.6,
                h: 1.25,
                wall: 0.16,
                r: 1.1,
                holes: [
                  { x: 0, z: 2.1, r: 3.0 },
                  ...corners.map(([x, , z]) => ({ x, z: -z, r: 0.15 })),
                ],
              },
              pos: [0, 5.8, 1.3],
              rot: [-HALF, 0, 0],
              ex: ex([0, 0, 1], 3.4, 0.33),
            },
            {
              id: 'lens',
              name: 'Lens, tap zone',
              kind: 'enclosure',
              desc: 'Light guide lens, translucent',
              mat: 'lens',
              shape: { t: 'cyl', r: 2.98, h: 0.16, seg: 64 },
              pos: [0, 7.9, 1.14],
              rot: [HALF, 0, 0],
              ex: ex([0, 0, 1], 4.6, 0.5),
            },
            {
              id: 'back',
              name: 'Back plate',
              kind: 'enclosure',
              desc: 'Back plate with screw bosses',
              mat: 'shellDark',
              shape: {
                t: 'tray',
                w: 7.6,
                d: 11.6,
                h: 1.25,
                wall: 0.16,
                r: 1.1,
                holes: [
                  { x: 0, z: -3.6, r: 0.24 },
                  { x: 0, z: 3.6, r: 0.24 },
                ],
                bosses: corners.map(([x, , z]) => ({ x, z, r: 0.42, h: 0.99, hole: 0.12 })),
              },
              pos: [0, 5.8, -1.3],
              rot: [HALF, 0, 0],
              ex: ex([0, 0, -1], 3.2, 0.33),
            },
            screws(
              'screws',
              4,
              corners.map(([x, , z]) => [x, 5.8 - z, 1.3] as V4),
              [HALF, 0, 0],
              ex([0, 0, 1], 6, 0),
              { head: 0.3, hh: 0.13, r: 0.12, len: 2.4 },
            ),
          ],
        },
        {
          id: 'pcba',
          name: 'PCB assembly',
          kind: 'assembly',
          pos: [0, 5.8, -0.15],
          rot: [HALF, 0, 0],
          ex: ex([0, 0, 1], 1.4, 0.66),
          children: [
            {
              id: 'pcb',
              name: 'Printed circuit board',
              kind: 'pcb',
              desc: 'Printed circuit board, 4-layer',
              mat: 'pcbBlue',
              shape: { t: 'board', w: 7.0, d: 11.0, th: T, r: 0.8, holes: screwHoles },
              decal: { kind: 'pcb' },
            },
            {
              id: 'u1',
              name: 'Wireless MCU module',
              kind: 'module',
              ref: 'U1',
              desc: 'Wireless microcontroller module, shielded',
              mat: 'pcbBlack',
              shape: { t: 'module', w: 2.0, d: 2.8, shield: [1.8, 1.7, 0.3], antenna: true },
              pos: [1.55, T, 2.25],
              decal: { kind: 'mark', text: dev.chip },
              ex: ex(UP, 0.8, 1),
            },
            {
              id: 'ant1',
              name: 'NFC antenna coil',
              kind: 'rf',
              ref: 'ANT1',
              desc: 'NFC/RFID loop antenna, PCB copper',
              mat: 'copper',
              shape: { t: 'coil', w: 3.4, d: 3.4, turns: 4, pitch: 0.2, trace: 0.09 },
              pos: [0, T, -2.1],
              ex: ex(UP, 0.3, 1),
            },
            {
              id: 'leds',
              name: 'Indicator LED',
              kind: 'indicator',
              ref: 'D1',
              desc: 'SMD LED',
              mat: 'ledBlue',
              shape: { t: 'led', w: 0.32, d: 0.2, h: 0.12 },
              at: onRing(2.66, 12, T, 0, 0, -2.1),
              ex: ex(UP, 0.5, 1),
            },
            {
              id: 'u2',
              name: 'NFC front-end IC',
              kind: 'ic',
              ref: 'U2',
              desc: 'NFC/RFID reader front-end',
              mat: 'ic',
              shape: { t: 'qfn', w: 0.72, h: 0.12 },
              pos: [-1.6, T, 1.4],
              decal: { kind: 'mark', text: '' },
              ex: lift,
            },
            {
              id: 'y1',
              name: 'Crystal',
              kind: 'passive',
              ref: 'Y1',
              desc: 'Quartz crystal, SMD',
              mat: 'steel',
              shape: { t: 'box', w: 0.5, h: 0.14, d: 0.32, r: 0.03 },
              pos: [-1.6, T, 2.55],
              ex: lift,
            },
            {
              id: 'u3',
              name: 'Voltage regulator',
              kind: 'ic',
              ref: 'U3',
              desc: 'Low-dropout regulator',
              mat: 'ic',
              shape: { t: 'soic', w: 0.32, d: 0.3, h: 0.1, pins: 6 },
              pos: [-0.3, T, 3.4],
              ex: lift,
            },
            {
              id: 'bz1',
              name: 'Buzzer',
              kind: 'indicator',
              ref: 'BZ1',
              desc: 'Magnetic buzzer',
              mat: 'shellDark',
              shape: {
                t: 'lathe',
                pts: [
                  [0, 0],
                  [0.6, 0],
                  [0.6, 0.42],
                  [0.16, 0.45],
                  [0.16, 0.38],
                  [0, 0.38],
                ],
              },
              pos: [-1.7, T, 3.75],
              ex: lift,
            },
            {
              id: 'j1',
              name: 'Programming header',
              kind: 'connector',
              ref: 'J1',
              desc: 'Pin header, 1 row, 6 positions',
              mat: 'ic',
              shape: { t: 'header', n: 6, pitch: 0.25 },
              pos: [0.4, T, 4.65],
              ex: lift,
            },
            {
              id: 'j2',
              name: 'Battery connector',
              kind: 'connector',
              ref: 'J2',
              desc: 'Wire-to-board connector, 2 positions',
              mat: 'white',
              shape: { t: 'box', w: 0.8, h: 0.5, d: 0.45 },
              pos: [2.0, T, 4.4],
              ex: lift,
            },
            ...passives(
              'pas',
              [...around(-1.6, 1.4, 0.36, 6, T), ...row(-0.4, 4.05, 0.38, 0, 3, T)],
              [...around(1.55, 2.25, 1.4, 4, T, 0.24), ...row(-0.9, 3.0, 0, 0.35, 3, T, HALF)],
            ),
          ],
        },
        {
          id: 'bt1',
          name: 'Battery pack',
          kind: 'power',
          ref: 'BT1',
          desc: 'Rechargeable battery pack',
          mat: 'battery',
          shape: { t: 'box', w: 5.4, h: 1.9, d: 0.8, r: 0.3 },
          pos: [0, 1.6, -0.62],
          ex: ex([0, 0, -1], 1.6, 0.66),
        },
      ],
    },
  };
}

function beacon(): Model {
  const dev = d.attendumBeacon;
  const T = 0.1;
  const bossAt: V4[] = [PI / 2, (7 * PI) / 6, (11 * PI) / 6].map((a) => [
    Math.cos(a) * 1.9,
    0,
    Math.sin(a) * 1.9,
  ]);
  return {
    id: 'attendumBeacon',
    tag: dev.tag,
    name: dev.name,
    kind: dev.kind,
    axis: 'Y',
    chip: dev.chip,
    root: {
      id: 'asm',
      name: `${dev.tag} ${dev.name}`,
      kind: 'assembly',
      children: [
        {
          id: 'enc',
          name: 'Housing',
          kind: 'assembly',
          children: [
            {
              id: 'cap',
              name: 'Top cap',
              kind: 'enclosure',
              desc: 'Top cap, domed',
              mat: 'shellWhite',
              shape: {
                t: 'lathe',
                seg: 64,
                pts: [
                  [2.6, 0],
                  [2.6, 0.6],
                  [2.52, 0.8],
                  [2.25, 0.91],
                  [1.2, 0.95],
                  [0.29, 0.95],
                  [0.29, 0.81],
                  [1.2, 0.81],
                  [2.1, 0.77],
                  [2.42, 0.62],
                  [2.46, 0.45],
                  [2.46, 0],
                  [2.6, 0],
                ],
              },
              pos: [0, 0.75, 0],
              ex: ex(UP, 3.0, 0),
            },
            {
              id: 'pipe',
              name: 'Light pipe',
              kind: 'enclosure',
              desc: 'Light pipe, clear',
              mat: 'lens',
              shape: {
                t: 'lathe',
                pts: [
                  [0, 0],
                  [0.26, 0],
                  [0.26, 0.88],
                  [0.18, 0.94],
                  [0, 0.95],
                ],
              },
              pos: [0, 0.78, 0],
              ex: ex(UP, 3.9, 0.15),
            },
            {
              id: 'base',
              name: 'Base',
              kind: 'enclosure',
              desc: 'Base with screw bosses',
              mat: 'shell',
              shape: {
                t: 'lathe',
                seg: 64,
                pts: [
                  [0, 0],
                  [2.38, 0],
                  [2.54, 0.05],
                  [2.6, 0.2],
                  [2.6, 0.75],
                  [2.46, 0.75],
                  [2.46, 0.14],
                  [0, 0.14],
                ],
                bosses: bossAt.map(([x, , z]) => ({ x, z, r: 0.28, h: 0.41, hole: 0.1, y: 0.14 })),
              },
              pos: [0, 0, 0],
            },
            screws(
              'screws',
              3,
              bossAt.map(([x, , z]) => [x, 0.55 + T, z]),
              [0, 0, 0],
              ex(UP, 2.2, 0.4),
              { head: 0.2, hh: 0.08, r: 0.09, len: 0.45 },
            ),
          ],
        },
        {
          id: 'pcba',
          name: 'PCB assembly',
          kind: 'assembly',
          pos: [0, 0.55, 0],
          ex: ex(UP, 1.2, 0.66),
          children: [
            {
              id: 'pcb',
              name: 'Printed circuit board',
              kind: 'pcb',
              desc: 'Printed circuit board, round, 2-layer',
              mat: 'pcbGreen',
              shape: {
                t: 'board',
                w: 4.6,
                d: 4.6,
                th: T,
                round: true,
                holes: bossAt.map(([x, , z]) => ({ x, z, r: 0.12 })),
              },
              decal: { kind: 'pcb' },
            },
            {
              id: 'u1',
              name: 'BLE system-on-chip',
              kind: 'ic',
              ref: 'U1',
              desc: 'Bluetooth Low Energy SoC, QFN',
              mat: 'ic',
              shape: { t: 'qfn', w: 1.0, h: 0.12 },
              pos: [-0.95, T, 0.45],
              decal: { kind: 'mark', text: dev.chip },
              ex: ex(UP, 0.7, 1),
            },
            {
              id: 'y1',
              name: 'Crystal',
              kind: 'passive',
              ref: 'Y1',
              desc: 'Quartz crystal, SMD',
              mat: 'steel',
              shape: { t: 'box', w: 0.5, h: 0.13, d: 0.32, r: 0.03 },
              pos: [-0.95, T, -0.72],
              ex: lift,
            },
            {
              id: 'ant1',
              name: 'PCB trace antenna',
              kind: 'rf',
              ref: 'ANT1',
              desc: '2.4 GHz trace antenna, PCB copper',
              mat: 'copper',
              shape: { t: 'meander', w: 1.9, d: 0.55, n: 6, trace: 0.07 },
              pos: [0.2, T, -1.62],
              ex: ex(UP, 0.3, 1),
            },
            {
              id: 'd1',
              name: 'Status LED',
              kind: 'indicator',
              ref: 'D1',
              desc: 'SMD LED',
              mat: 'ledGreen',
              shape: { t: 'led', w: 0.3, d: 0.3, h: 0.12 },
              pos: [0, T, 0],
              ex: lift,
            },
            {
              id: 'sw1',
              name: 'Tactile switch',
              kind: 'switch',
              ref: 'SW1',
              desc: 'Tactile switch, SMD',
              mat: 'steel',
              shape: { t: 'tact', s: 0.6, h: 0.3 },
              pos: [1.15, T, 0.55],
              ex: lift,
            },
            ...passives('pas', around(-0.95, 0.45, 0.5, 5, T, 0.26), [
              [-1.95, T, 0, HALF],
              [-1.95, T, 0.9, HALF],
              [0.15, T, 0.95, 0],
              [0.55, T, -0.75, 0],
              [0.95, T, -0.75, 0],
            ]),
            {
              id: 'bh1',
              name: 'Coin cell holder',
              kind: 'power',
              ref: 'BH1',
              desc: 'Coin cell retainer, SMD',
              mat: 'steel',
              shape: { t: 'tube', r: 1.1, ri: 1.03, h: 0.36 },
              pos: [0, -0.36, 0.2],
              ex: ex([0, -1, 0], 0.5, 1),
            },
            {
              id: 'bt1',
              name: 'Coin cell',
              kind: 'power',
              ref: 'BT1',
              desc: 'Lithium coin cell',
              mat: 'steel',
              shape: {
                t: 'lathe',
                pts: [
                  [0, 0],
                  [0.96, 0],
                  [1.0, 0.04],
                  [1.0, 0.3],
                  [0.96, 0.33],
                  [0, 0.33],
                ],
              },
              pos: [0, -0.35, 0.2],
              ex: ex([0, -1, 0], 1.0, 1),
            },
          ],
        },
      ],
    },
  };
}

function logger(): Model {
  const dev = d.logger;
  const T = 0.12;
  const posts: V4[] = [
    [-3.9, 0, -5.4],
    [3.9, 0, -5.4],
    [-3.9, 0, 5.4],
    [3.9, 0, 5.4],
  ];
  const stand: [number, number][] = [
    [-3.0, 2.3],
    [3.0, 2.3],
    [-3.0, -4.7],
    [3.0, -4.7],
  ];
  return {
    id: 'logger',
    tag: dev.tag,
    name: dev.name,
    kind: dev.kind,
    axis: 'Z',
    root: {
      id: 'asm',
      name: `${dev.tag} ${dev.name}`,
      kind: 'assembly',
      children: [
        {
          id: 'enc',
          name: 'Enclosure',
          kind: 'assembly',
          children: [
            {
              id: 'body',
              name: 'Enclosure body',
              kind: 'enclosure',
              desc: 'Enclosure body, sealed, with posts',
              mat: 'shell',
              shape: {
                t: 'tray',
                w: 9,
                d: 12,
                h: 4.2,
                wall: 0.2,
                r: 0.6,
                bosses: [
                  ...posts.map(([x, , z]) => ({ x, z, r: 0.45, h: 4.0, hole: 0.14 })),
                  ...stand.map(([x, z]) => ({ x, z, r: 0.3, h: 0.7, hole: 0.1 })),
                ],
              },
              pos: [0, 7.2, -2.5],
              rot: [HALF, 0, 0],
            },
            {
              id: 'lid',
              name: 'Lid assembly',
              kind: 'assembly',
              ex: ex([0, 0, 1], 3.4, 0.33),
              children: [
                {
                  id: 'lid',
                  name: 'Lid',
                  kind: 'enclosure',
                  desc: 'Lid, sealed',
                  mat: 'shell',
                  shape: {
                    t: 'tray',
                    w: 9,
                    d: 12,
                    h: 0.7,
                    wall: 0.2,
                    r: 0.6,
                    holes: posts.map(([x, , z]) => ({ x, z, r: 0.16 })),
                  },
                  pos: [0, 7.2, 2.5],
                  rot: [-HALF, 0, 0],
                },
                {
                  id: 'gasket',
                  name: 'Lid gasket',
                  kind: 'enclosure',
                  desc: 'Gasket, closed-cell rubber',
                  mat: 'rubber',
                  shape: { t: 'ring', w: 8.6, d: 11.6, r: 0.42, band: 0.16, th: 0.1 },
                  pos: [0, 7.2, 1.7],
                  rot: [HALF, 0, 0],
                  ex: ex([0, 0, -1], 0.9, 0.5),
                },
                {
                  id: 'plate',
                  name: 'Nameplate',
                  kind: 'label',
                  desc: 'Nameplate label',
                  mat: 'white',
                  shape: { t: 'box', w: 5.2, h: 1.5, d: 0.02 },
                  pos: [0, 10.0, 2.51],
                  decal: { kind: 'plate', lines: [dev.tag, dev.name, dev.kind] },
                  ex: ex([0, 0, 1], 0.5, 0.66),
                },
              ],
            },
            screws(
              'screws',
              4,
              posts.map(([x, , z]) => [x, 7.2 - z, 2.5] as V4),
              [HALF, 0, 0],
              ex([0, 0, 1], 5, 0),
              { head: 0.3, hh: 0.15, r: 0.13, len: 4.2 },
            ),
            {
              id: 'lugs',
              name: 'Mounting lug',
              kind: 'mechanical',
              desc: 'Wall mounting lug, stainless',
              mat: 'steel',
              shape: {
                t: 'board',
                w: 2.4,
                d: 1.2,
                th: 0.2,
                r: 0.35,
                holes: [{ x: 0, z: 0, r: 0.25 }],
              },
              rot: [HALF, 0, 0],
              at: [
                [0, 13.6, -2.5],
                [0, 0.8, -2.5],
              ],
              ex: ex([0, 0, -1], 1.2, 0.66),
            },
          ],
        },
        {
          id: 'pcba',
          name: 'Logger board',
          kind: 'assembly',
          pos: [0, 8.4, -1.6],
          rot: [HALF, 0, 0],
          ex: ex([0, 0, 1], 2.4, 0.66),
          children: [
            {
              id: 'pcb',
              name: 'Printed circuit board',
              kind: 'pcb',
              desc: 'Printed circuit board, 4-layer',
              mat: 'pcbGreen',
              shape: {
                t: 'board',
                w: 7.2,
                d: 8.0,
                th: T,
                r: 0.4,
                holes: stand.map(([x]) => x).map((x, i) => ({ x, z: i < 2 ? 3.5 : -3.5, r: 0.17 })),
              },
              decal: { kind: 'pcb' },
            },
            {
              id: 'u1',
              name: 'Microcontroller',
              kind: 'ic',
              ref: 'U1',
              desc: 'Microcontroller, LQFP',
              mat: 'ic',
              shape: { t: 'qfp', w: 1.4, h: 0.16, pins: 48 },
              pos: [-1.6, T, 0.5],
              decal: { kind: 'mark', text: '' },
              ex: ex(UP, 0.7, 1),
            },
            {
              id: 'u2',
              name: 'Cellular modem module',
              kind: 'module',
              ref: 'U2',
              desc: 'GSM modem module, shielded',
              mat: 'pcbBlack',
              shape: { t: 'module', w: 2.6, d: 3.0, shield: [2.4, 2.6, 0.3] },
              pos: [1.6, T, -1.5],
              decal: { kind: 'mark', text: '' },
              ex: ex(UP, 0.8, 1),
            },
            {
              id: 'j3',
              name: 'SIM card holder',
              kind: 'connector',
              ref: 'J3',
              desc: 'SIM card holder, hinged',
              mat: 'steel',
              shape: { t: 'sim', w: 1.6, d: 1.3, h: 0.2 },
              pos: [1.6, T, 1.15],
              ex: lift,
            },
            {
              id: 'j4',
              name: 'RF connector',
              kind: 'rf',
              ref: 'J4',
              desc: 'Coaxial RF connector, SMD',
              mat: 'gold',
              shape: {
                t: 'lathe',
                pts: [
                  [0, 0],
                  [0.2, 0],
                  [0.2, 0.08],
                  [0.13, 0.08],
                  [0.13, 0.22],
                  [0, 0.22],
                ],
              },
              pos: [2.9, T, -3.3],
              ex: lift,
            },
            {
              id: 'tb',
              name: 'Sensor terminal block',
              kind: 'connector',
              ref: 'J1',
              desc: 'Terminal block, 4 positions, rising clamp',
              mat: 'terminal',
              shape: { t: 'terminal', n: 4, pitch: 0.5, h: 0.9, d: 0.8 },
              at: [
                [-1.5, T, 3.2],
                [1.5, T, 3.2],
              ],
              ex: ex(UP, 0.9, 1),
            },
            {
              id: 'c1',
              name: 'Electrolytic capacitor',
              kind: 'passive',
              ref: 'C30',
              desc: 'Aluminium electrolytic capacitor',
              mat: 'batteryDark',
              shape: { t: 'ecap', r: 0.45, h: 1.0 },
              pos: [-3.0, T, 1.9],
              ex: lift,
            },
            {
              id: 'u3',
              name: 'Voltage regulator',
              kind: 'ic',
              ref: 'U3',
              desc: 'Voltage regulator, DPAK',
              mat: 'ic',
              shape: { t: 'dpak', w: 0.66, d: 0.6, h: 0.22 },
              pos: [-0.1, T, 2.0],
              ex: lift,
            },
            {
              id: 'y1',
              name: 'Crystal',
              kind: 'passive',
              ref: 'Y1',
              desc: 'Quartz crystal, SMD',
              mat: 'steel',
              shape: { t: 'box', w: 0.5, h: 0.14, d: 0.32, r: 0.03 },
              pos: [-1.6, T, -0.9],
              ex: lift,
            },
            {
              id: 'leds',
              name: 'Status LEDs',
              kind: 'assembly',
              children: [
                {
                  id: 'd1',
                  name: 'Status LED, green',
                  kind: 'indicator',
                  ref: 'D1',
                  desc: 'SMD LED, green',
                  mat: 'ledGreen',
                  shape: { t: 'led', w: 0.3, d: 0.2, h: 0.12 },
                  pos: [-1.0, T, -3.4],
                  ex: lift,
                },
                {
                  id: 'd2',
                  name: 'Status LED, amber',
                  kind: 'indicator',
                  ref: 'D2',
                  desc: 'SMD LED, amber',
                  mat: 'ledAmber',
                  shape: { t: 'led', w: 0.3, d: 0.2, h: 0.12 },
                  pos: [-0.55, T, -3.4],
                  ex: lift,
                },
                {
                  id: 'd3',
                  name: 'Status LED, red',
                  kind: 'indicator',
                  ref: 'D3',
                  desc: 'SMD LED, red',
                  mat: 'ledRed',
                  shape: { t: 'led', w: 0.3, d: 0.2, h: 0.12 },
                  pos: [-0.1, T, -3.4],
                  ex: lift,
                },
              ],
            },
            ...passives(
              'pas',
              [...around(-1.6, 0.5, 0.75, 8, T, 0.3), ...row(0.0, -0.5, 0, 0.36, 3, T, HALF)],
              [...around(1.6, -1.5, 1.5, 4, T, 0.28), ...row(-0.9, 2.7, 0.38, 0, 4, T)],
            ),
          ],
        },
        {
          id: 'power',
          name: 'Power',
          kind: 'assembly',
          children: [
            {
              id: 'bt1',
              name: 'Battery pack',
              kind: 'power',
              ref: 'BT1',
              desc: 'Sealed battery pack',
              mat: 'batteryDark',
              shape: { t: 'box', w: 6.6, h: 2.2, d: 2.4, r: 0.22 },
              pos: [0, 1.9, -1.1],
              ex: ex([0, 0, 1], 2.0, 0.66),
            },
            {
              id: 'strap',
              name: 'Battery strap',
              kind: 'mechanical',
              desc: 'Battery retaining strap',
              mat: 'steel',
              shape: { t: 'strap', w: 0.8, h: 2.5, d: 2.5 },
              pos: [0, 1.75, -2.3],
              ex: ex([0, 0, 1], 3.0, 0.5),
            },
          ],
        },
        {
          id: 'io',
          name: 'External I/O',
          kind: 'assembly',
          children: [
            {
              id: 'ant',
              name: 'GSM whip antenna',
              kind: 'rf',
              ref: 'ANT1',
              desc: 'Whip antenna, bulkhead mount',
              mat: 'rubber',
              shape: {
                t: 'lathe',
                hexMat: 'steel',
                hex: [
                  [0, 0],
                  [0.5, 0],
                  [0.5, 0.3],
                  [0, 0.3],
                ],
                pts: [
                  [0, 0.3],
                  [0.4, 0.3],
                  [0.4, 1.3],
                  [0.3, 1.5],
                  [0.22, 1.6],
                  [0.17, 4.9],
                  [0.22, 5.0],
                  [0.2, 5.15],
                  [0, 5.2],
                ],
              },
              pos: [2.6, 13.2, 0],
              ex: ex(UP, 2.2, 0.33),
            },
            {
              id: 'glands',
              name: 'Cable gland',
              kind: 'connector',
              desc: 'Cable gland, sealed, for sensor cable',
              mat: 'shellDark',
              shape: {
                t: 'lathe',
                hex: [
                  [0, 0],
                  [0.56, 0],
                  [0.56, 0.36],
                  [0, 0.36],
                ],
                pts: [
                  [0, 0.36],
                  [0.46, 0.36],
                  [0.46, 0.7],
                  [0.36, 0.95],
                  [0.2, 1.0],
                  [0.2, 1.3],
                  [0, 1.3],
                ],
              },
              rot: [PI, 0, 0],
              at: [
                [-2.8, 1.2, -0.3],
                [0, 1.2, -0.3],
                [2.8, 1.2, -0.3],
              ],
              ex: ex([0, -1, 0], 1.6, 0.33),
            },
          ],
        },
      ],
    },
  };
}

function epc(): Model {
  const dev = d.epc;
  const T = 0.12;
  const corners: V4[] = [
    [-3.5, 0, -3.55],
    [3.5, 0, -3.55],
    [-3.5, 0, 3.55],
    [3.5, 0, 3.55],
  ];
  const keys = [-1.8, -0.6, 0.6, 1.8];
  return {
    id: 'epc',
    tag: dev.tag,
    name: dev.name,
    kind: dev.kind,
    axis: 'Z',
    root: {
      id: 'asm',
      name: `${dev.tag} ${dev.name}`,
      kind: 'assembly',
      children: [
        {
          id: 'enc',
          name: 'Enclosure',
          kind: 'assembly',
          children: [
            {
              id: 'front',
              name: 'Front shell',
              kind: 'enclosure',
              desc: 'Front shell with display window',
              mat: 'shellWhite',
              shape: {
                t: 'tray',
                w: 8,
                d: 8,
                h: 2,
                wall: 0.18,
                r: 0.5,
                holes: [
                  { x: 0, z: 1.8, r: 0.15, w: 4.4, d: 2.4 },
                  ...keys.map((x) => ({ x, z: -1.0, r: 0.36 })),
                  { x: 2.9, z: 3.2, r: 0.14 },
                  { x: 3.3, z: 3.2, r: 0.14 },
                  ...corners.map(([x, , z]) => ({ x, z, r: 0.16 })),
                ],
              },
              pos: [0, 5.8, 2],
              rot: [-HALF, 0, 0],
              ex: ex([0, 0, 1], 3.0, 0.33),
            },
            {
              id: 'window',
              name: 'Display window',
              kind: 'enclosure',
              desc: 'Window, clear',
              mat: 'lens',
              shape: { t: 'box', w: 4.4, h: 2.4, d: 0.18 },
              pos: [0, 6.4, 1.91],
              ex: ex([0, 0, 1], 3.8, 0.45),
            },
            {
              id: 'keys',
              name: 'Key cap',
              kind: 'switch',
              desc: 'Key cap, elastomer',
              mat: 'shellDark',
              shape: {
                t: 'lathe',
                pts: [
                  [0, 0],
                  [0.33, 0],
                  [0.33, 0.48],
                  [0.27, 0.58],
                  [0, 0.6],
                ],
              },
              rot: [HALF, 0, 0],
              at: keys.map((x) => [x, 4.8, 1.55]),
              ex: ex([0, 0, 1], 4.4, 0.5),
            },
            {
              id: 'rear',
              name: 'Rear shell',
              kind: 'enclosure',
              desc: 'Rear shell with screw posts',
              mat: 'shellDark',
              shape: {
                t: 'tray',
                w: 8,
                d: 8,
                h: 2,
                wall: 0.18,
                r: 0.5,
                bosses: corners.map(([x, , z]) => ({ x, z, r: 0.38, h: 1.82, hole: 0.12 })),
              },
              pos: [0, 5.8, -2],
              rot: [HALF, 0, 0],
              ex: ex([0, 0, -1], 2.6, 0.33),
            },
            screws(
              'screws',
              4,
              corners.map(([x, , z]) => [x, 5.8 - z, 2] as V4),
              [HALF, 0, 0],
              ex([0, 0, 1], 5, 0),
              { head: 0.3, hh: 0.13, r: 0.12, len: 3.6 },
            ),
          ],
        },
        {
          id: 'pcba',
          name: 'Controller board',
          kind: 'assembly',
          pos: [0, 5.8, 0.6],
          rot: [HALF, 0, 0],
          ex: ex([0, 0, 1], 1.4, 0.66),
          children: [
            {
              id: 'pcb',
              name: 'Printed circuit board',
              kind: 'pcb',
              desc: 'Printed circuit board, 4-layer',
              mat: 'pcbBlue',
              shape: { t: 'board', w: 7.2, d: 6.6, th: T, r: 0.3 },
              decal: { kind: 'pcb' },
            },
            {
              id: 'ds1',
              name: 'Display module',
              kind: 'display',
              ref: 'DS1',
              desc: 'Graphic LCD module',
              mat: 'steel',
              shape: { t: 'lcd', w: 4.6, d: 2.6, h: 0.35 },
              pos: [0, T, -1.8],
              decal: { kind: 'lcd' },
              ex: ex(UP, 0.9, 1),
            },
            {
              id: 'sw',
              name: 'Tactile switch',
              kind: 'switch',
              ref: 'SW1',
              desc: 'Tactile switch, through-hole',
              mat: 'steel',
              shape: { t: 'tact', s: 0.6, h: 0.5 },
              at: keys.map((x) => [x, T, 1.0]),
              ex: lift,
            },
            {
              id: 'leds',
              name: 'Status LED',
              kind: 'indicator',
              ref: 'D1',
              desc: 'SMD LED',
              mat: 'ledGreen',
              shape: { t: 'led', w: 0.28, d: 0.2, h: 0.12 },
              at: [
                [2.9, T, -3.2],
                [3.3, T, -3.2],
              ],
              ex: lift,
            },
            {
              id: 'u1',
              name: 'Microcontroller',
              kind: 'ic',
              ref: 'U1',
              desc: 'Microcontroller, LQFP',
              mat: 'ic',
              shape: { t: 'qfp', w: 1.5, h: 0.16, pins: 64 },
              pos: [-2.4, T, 2.2],
              decal: { kind: 'mark', text: '' },
              ex: ex(UP, 0.7, 1),
            },
            {
              id: 'y1',
              name: 'Crystal',
              kind: 'passive',
              ref: 'Y1',
              desc: 'Quartz crystal, SMD',
              mat: 'steel',
              shape: { t: 'box', w: 0.5, h: 0.14, d: 0.32, r: 0.03 },
              pos: [-3.25, T, 0.55],
              ex: lift,
            },
            {
              id: 'q1',
              name: 'Valve driver',
              kind: 'ic',
              ref: 'Q1',
              desc: 'Power MOSFET, DPAK',
              mat: 'ic',
              shape: { t: 'dpak', w: 0.66, d: 0.6, h: 0.22 },
              pos: [-0.45, T, 2.5],
              ex: lift,
            },
            {
              id: 'u2',
              name: 'Sensor amplifier',
              kind: 'ic',
              ref: 'U2',
              desc: 'Instrumentation amplifier, SOIC',
              mat: 'ic',
              shape: { t: 'soic', w: 0.5, d: 0.9, h: 0.14, pins: 8 },
              pos: [0.85, T, 2.55],
              ex: lift,
            },
            {
              id: 'c1',
              name: 'Electrolytic capacitor',
              kind: 'passive',
              ref: 'C30',
              desc: 'Aluminium electrolytic capacitor',
              mat: 'batteryDark',
              shape: { t: 'ecap', r: 0.32, h: 0.7 },
              pos: [0, T, 1.75],
              ex: lift,
            },
            {
              id: 'j1',
              name: 'Power and I/O terminal block',
              kind: 'connector',
              ref: 'J1',
              desc: 'Terminal block, 3 positions',
              mat: 'terminal',
              shape: { t: 'terminal', n: 3, pitch: 0.5, h: 0.8, d: 0.7 },
              pos: [2.6, T, 2.6],
              ex: lift,
            },
            ...passives(
              'pas',
              [
                ...around(-2.4, 2.2, 0.75, 6, T, 0.32, [0, 1, 3]),
                ...row(1.6, 1.8, 0, 0.36, 3, T, HALF),
              ],
              [...row(1.35, 2.2, 0, 0.36, 3, T, HALF), ...row(-1.4, 3.1, 0.36, 0, 3, T)],
            ),
          ],
        },
        {
          id: 'fluid',
          name: 'Fluid path',
          kind: 'assembly',
          ex: ex([0, -1, 0], 1.6, 0.33),
          children: [
            {
              id: 'manifold',
              name: 'Manifold block',
              kind: 'fluid',
              desc: 'Manifold block, through-bore',
              mat: 'alu',
              shape: {
                t: 'extrudeX',
                outline: [
                  [-2, 0],
                  [2, 0],
                  [2, 1.8],
                  [-2, 1.8],
                ],
                holes: [{ x: 0, z: 0.9, r: 0.36 }],
                len: 8,
              },
            },
            {
              id: 'inlet',
              name: 'Inlet fitting',
              kind: 'fluid',
              desc: 'Hose fitting, hex body',
              mat: 'zinc',
              pn: 'fitting',
              shape: {
                t: 'lathe',
                hex: [
                  [0, 0],
                  [0.62, 0],
                  [0.62, 0.55],
                  [0, 0.55],
                ],
                pts: [
                  [0, 0.55],
                  [0.36, 0.55],
                  [0.36, 1.2],
                  [0.44, 1.3],
                  [0.32, 1.45],
                  [0.44, 1.6],
                  [0.3, 1.75],
                  [0, 1.75],
                ],
              },
              pos: [-4, 0.9, 0],
              rot: [0, 0, HALF],
              ex: ex([-1, 0, 0], 1.6, 0.5),
            },
            {
              id: 'outlet',
              name: 'Outlet fitting',
              kind: 'fluid',
              desc: 'Hose fitting, hex body',
              mat: 'zinc',
              pn: 'fitting',
              shape: {
                t: 'lathe',
                hex: [
                  [0, 0],
                  [0.62, 0],
                  [0.62, 0.55],
                  [0, 0.55],
                ],
                pts: [
                  [0, 0.55],
                  [0.36, 0.55],
                  [0.36, 1.2],
                  [0.44, 1.3],
                  [0.32, 1.45],
                  [0.44, 1.6],
                  [0.3, 1.75],
                  [0, 1.75],
                ],
              },
              pos: [4, 0.9, 0],
              rot: [0, 0, -HALF],
              ex: ex([1, 0, 0], 1.6, 0.5),
            },
          ],
        },
        {
          id: 'act',
          name: 'Actuation and sensing',
          kind: 'assembly',
          children: [
            {
              id: 'valve',
              name: 'Proportional valve',
              kind: 'fluid',
              ref: 'V1',
              desc: 'Proportional solenoid valve',
              mat: 'ic',
              shape: { t: 'valve', r: 1.0, h: 1.8 },
              pos: [-1.9, 1.98, -0.75],
              ex: ex(UP, 2.4, 0.66),
            },
            {
              id: 'pt',
              name: 'Pressure transducer',
              kind: 'sensor',
              ref: 'PT1',
              desc: 'Pressure transducer, threaded',
              mat: 'steel',
              shape: { t: 'sensor', r: 0.45, h: 1.6 },
              pos: [2.0, 1.98, -0.75],
              ex: ex(UP, 2.4, 0.66),
            },
          ],
        },
      ],
    },
  };
}

function plc(): Model {
  const dev = d.plc;
  const T = 0.12;
  // The housing's side profile in (z, y): a deep rear and a lower, stepped front.
  const outer: P2[] = [
    [-3, 0],
    [0.8, 0],
    [0.8, 2.0],
    [3, 2.0],
    [3, 7.0],
    [0.8, 7.0],
    [0.8, 9],
    [-3, 9],
  ];
  const inner: P2[] = [
    [-2.8, 0.2],
    [0.6, 0.2],
    [0.6, 2.2],
    [2.8, 2.2],
    [2.8, 6.8],
    [0.6, 6.8],
    [0.6, 8.8],
    [-2.8, 8.8],
  ];
  const screwAt: P2[] = [
    [-2.45, 1.2],
    [-2.45, 7.8],
  ];
  // The board's outline in its own frame (x along the module's height, z its depth).
  const board: P2[] = [
    [-4.2, -2.7],
    [-4.2, 0.5],
    [-2.2, 0.5],
    [-2.2, 2.7],
    [2.2, 2.7],
    [2.2, 0.5],
    [4.2, 0.5],
    [4.2, -2.7],
  ];
  const chipTurn: V3 = [0, -HALF, 0];
  return {
    id: 'plc',
    tag: dev.tag,
    name: dev.name,
    kind: dev.kind,
    axis: 'X',
    chip: dev.chip,
    root: {
      id: 'asm',
      name: `${dev.tag} ${dev.name}`,
      kind: 'assembly',
      children: [
        {
          id: 'enc',
          name: 'Housing',
          kind: 'assembly',
          children: [
            {
              id: 'left',
              name: 'Housing half, left',
              kind: 'enclosure',
              desc: 'Housing half, left',
              mat: 'shell',
              shape: {
                t: 'ptray',
                outer,
                inner,
                depth: 1.78,
                wall: 0.2,
                holes: screwAt.map(([z, y]) => ({ x: z, z: y, r: 0.15 })),
              },
              pos: [-1.8, 0, 0],
              ex: ex([-1, 0, 0], 2.8, 0.33),
            },
            {
              id: 'right',
              name: 'Housing half, right',
              kind: 'enclosure',
              desc: 'Housing half, right, with bosses',
              mat: 'shell',
              shape: {
                t: 'ptray',
                outer,
                inner,
                depth: 1.78,
                wall: 0.2,
                end: true,
                bosses: screwAt.map(([z, y]) => ({ x: z, z: y, r: 0.34, h: 1.06, hole: 0.12 })),
              },
              pos: [0.02, 0, 0],
              ex: ex([1, 0, 0], 2.8, 0.33),
            },
            screws(
              'screws',
              2,
              screwAt.map(([z, y]) => [-1.8, y, z] as V4),
              [0, 0, HALF],
              ex([-1, 0, 0], 3.4, 0),
              { head: 0.3, hh: 0.13, r: 0.12, len: 3.0 },
            ),
            {
              id: 'pipe',
              name: 'Light pipe',
              kind: 'enclosure',
              desc: 'Light pipe, clear',
              mat: 'lens',
              shape: { t: 'box', w: 0.5, h: 3.8, d: 0.12 },
              pos: [-0.95, 2.6, 3.06],
              ex: ex([0, 0, 1], 1.2, 0.5),
            },
            {
              id: 'label',
              name: 'Front label',
              kind: 'label',
              desc: 'Front label',
              mat: 'white',
              shape: { t: 'box', w: 1.6, h: 3.8, d: 0.02 },
              pos: [0.65, 2.6, 3.01],
              decal: { kind: 'plate', lines: [dev.tag, dev.name], vertical: true },
              ex: ex([0, 0, 1], 1.6, 0.66),
            },
            {
              id: 'latch',
              name: 'DIN rail latch',
              kind: 'mechanical',
              desc: 'DIN rail latch, sliding',
              mat: 'orange',
              shape: { t: 'box', w: 2.4, h: 0.6, d: 0.8, r: 0.08 },
              pos: [0, -0.6, -2.6],
              ex: ex([0, -1, 0], 1.0, 0.66),
            },
          ],
        },
        {
          id: 'tbs',
          name: 'Terminal blocks',
          kind: 'assembly',
          children: [
            {
              id: 'tbTop',
              name: 'Pluggable terminal block, top',
              kind: 'connector',
              ref: 'X1',
              desc: 'Pluggable terminal block, 4 positions',
              mat: 'terminal',
              pn: 'tb',
              shape: { t: 'terminal', n: 4, pitch: 0.8, h: 1.0, d: 1.8 },
              pos: [0, 7.0, 1.9],
              ex: ex(UP, 1.6, 0.5),
            },
            {
              id: 'tbBot',
              name: 'Pluggable terminal block, bottom',
              kind: 'connector',
              ref: 'X2',
              desc: 'Pluggable terminal block, 4 positions',
              mat: 'terminal',
              pn: 'tb',
              shape: { t: 'terminal', n: 4, pitch: 0.8, h: 1.0, d: 1.8 },
              pos: [0, 2.0, 1.9],
              rot: [0, 0, PI],
              ex: ex([0, -1, 0], 1.6, 0.5),
            },
          ],
        },
        {
          id: 'pcba',
          name: 'CPU board',
          kind: 'assembly',
          pos: [0.52, 4.5, 0],
          rot: [0, 0, HALF],
          spin: HALF,
          children: [
            {
              id: 'pcb',
              name: 'Printed circuit board',
              kind: 'pcb',
              desc: 'Printed circuit board, 4-layer, stepped',
              mat: 'pcbGreen',
              shape: {
                t: 'board',
                w: 8.4,
                d: 5.4,
                th: T,
                outline: board,
                holes: screwAt.map(([z, y]) => ({ x: y - 4.5, z, r: 0.17 })),
              },
              decal: { kind: 'pcb' },
            },
            {
              id: 'u1',
              name: 'Microcontroller',
              kind: 'ic',
              ref: 'U1',
              desc: 'Microcontroller, LQFP',
              mat: 'ic',
              shape: { t: 'qfp', w: 1.6, h: 0.16, pins: 64 },
              pos: [0, T, -0.8],
              rot: chipTurn,
              decal: { kind: 'mark', text: dev.chip },
              ex: ex(UP, 0.7, 1),
            },
            {
              id: 'y1',
              name: 'Crystal',
              kind: 'passive',
              ref: 'Y1',
              desc: 'Quartz crystal, SMD',
              mat: 'steel',
              shape: { t: 'box', w: 0.5, h: 0.14, d: 0.32, r: 0.03 },
              pos: [1.65, T, -0.8],
              rot: chipTurn,
              ex: lift,
            },
            {
              id: 'k',
              name: 'Relay',
              kind: 'switch',
              ref: 'K1',
              desc: 'Signal relay, sealed',
              mat: 'ic',
              shape: { t: 'relay', w: 1.2, d: 1.8, h: 1.1 },
              at: [
                [-3.0, T, -1.1],
                [3.0, T, -1.1],
              ],
              ex: ex(UP, 0.9, 1),
            },
            {
              id: 'opto',
              name: 'Optocoupler',
              kind: 'ic',
              ref: 'U2',
              desc: 'Optocoupler, 4-pin',
              mat: 'ic',
              shape: { t: 'soic', w: 0.5, d: 0.7, h: 0.18, pins: 4 },
              at: [
                [-2.1, T, 0.25],
                [-1.45, T, 0.25],
                [1.45, T, 0.25],
                [2.1, T, 0.25],
              ],
              ex: lift,
            },
            {
              id: 'u6',
              name: 'Bus transceiver',
              kind: 'ic',
              ref: 'U6',
              desc: 'Line transceiver, SOIC',
              mat: 'ic',
              shape: { t: 'soic', w: 0.5, d: 0.9, h: 0.14, pins: 8 },
              pos: [-1.6, T, -2.1],
              ex: lift,
            },
            {
              id: 'c1',
              name: 'Electrolytic capacitor',
              kind: 'passive',
              ref: 'C30',
              desc: 'Aluminium electrolytic capacitor',
              mat: 'batteryDark',
              shape: { t: 'ecap', r: 0.35, h: 0.9 },
              pos: [1.6, T, -2.2],
              ex: lift,
            },
            {
              id: 'io',
              name: 'I/O LED',
              kind: 'indicator',
              ref: 'D1',
              desc: 'SMD LED',
              mat: 'ledGreen',
              shape: { t: 'led', w: 0.3, d: 0.2, h: 0.15 },
              at: row(-1.75, 2.55, 0.5, 0, 8, T, HALF),
              ex: lift,
            },
            {
              id: 'bh1',
              name: 'Coin cell holder',
              kind: 'power',
              ref: 'BH1',
              desc: 'Coin cell retainer, SMD',
              mat: 'steel',
              shape: { t: 'tube', r: 0.82, ri: 0.76, h: 0.34 },
              pos: [0, T, 1.45],
              ex: lift,
            },
            {
              id: 'bt1',
              name: 'Coin cell (clock backup)',
              kind: 'power',
              ref: 'BT1',
              desc: 'Lithium coin cell',
              mat: 'steel',
              shape: {
                t: 'lathe',
                pts: [
                  [0, 0],
                  [0.72, 0],
                  [0.75, 0.03],
                  [0.75, 0.29],
                  [0.72, 0.32],
                  [0, 0.32],
                ],
              },
              pos: [0, T + 0.01, 1.45],
              ex: ex(UP, 1.1, 1),
            },
            ...passives(
              'pas',
              [...around(0, -0.8, 0.8, 8, T, 0.3)],
              [...row(-0.75, -2.3, 0.36, 0, 3, T), ...row(2.5, 0.2, 0.36, 0, 3, T)],
            ),
          ],
        },
        {
          id: 'rail',
          name: 'DIN rail (reference)',
          kind: 'reference',
          desc: 'Reference geometry, not part of the device',
          mat: 'zinc',
          bom: false,
          shape: {
            t: 'extrudeX',
            len: 7,
            outline: [
              [-3.75, 3.15],
              [-3.75, 5.85],
              [-3.1, 5.85],
              [-3.1, 6.25],
              [-3.0, 6.25],
              [-3.0, 5.75],
              [-3.65, 5.75],
              [-3.65, 3.25],
              [-3.0, 3.25],
              [-3.0, 2.75],
              [-3.1, 2.75],
              [-3.1, 3.15],
            ],
          },
        },
      ],
    },
  };
}

/** The models, in the order db lists the devices. */
const BUILDERS: Record<DeviceId, () => Model> = {
  logger,
  epc,
  plc,
  attendumReader: reader,
  attendumBeacon: beacon,
};
export const DEVICE_IDS = Object.keys(db.devices) as DeviceId[];
export const MODELS: Record<DeviceId, Model> = Object.fromEntries(
  DEVICE_IDS.map((id) => [id, BUILDERS[id]()]),
) as Record<DeviceId, Model>;

/* ------------------------------------------------------------------ flattening: tree, parts, BOM */

export interface Item {
  id: string;
  node: Node;
  name: string;
  kind: Kind;
  depth: number;
  parent: string | null;
  children: string[];
  /** Every part at or below this item. */
  parts: string[];
  part: boolean;
  /** A pattern's container row. */
  pattern: boolean;
  ref?: string;
  pn: string;
  bomKey: string | null;
  instance?: { i: number; n: number; at: V4 };
}

export interface BomRow {
  item: number;
  pn: string;
  name: string;
  desc: string;
  kind: Kind;
  qty: number;
  refs: string[];
  marking?: string;
  ids: string[];
}

export interface Flat {
  model: Model;
  items: Record<string, Item>;
  /** Depth-first order of every item. */
  order: string[];
  root: string;
  parts: string[];
  bom: BomRow[];
}

function refAt(ref: string | undefined, i: number) {
  if (!ref) return undefined;
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return m ? `${m[1]}${Number(m[2]) + i}` : ref;
}

export function flatten(model: Model): Flat {
  const items: Record<string, Item> = {};
  const order: string[] = [];
  const parts: string[] = [];
  const bomKeys: string[] = [];

  const visit = (node: Node, parent: string | null, depth: number): Item => {
    const id = parent ? `${parent}/${node.id}` : node.id;
    const item: Item = {
      id,
      node,
      name: node.name,
      kind: node.kind,
      depth,
      parent,
      children: [],
      parts: [],
      part: false,
      pattern: false,
      ref: node.ref,
      pn: '',
      bomKey: null,
    };
    items[id] = item;
    order.push(id);
    const key = node.bom === false ? null : (node.pn ?? node.id);
    if (node.at) {
      item.pattern = true;
      node.at.forEach((at, i) => {
        const iid = `${id}#${i + 1}`;
        const inst: Item = {
          id: iid,
          node,
          name: `${node.name} <${i + 1}>`,
          kind: node.kind,
          depth: depth + 1,
          parent: id,
          children: [],
          parts: [iid],
          part: true,
          pattern: false,
          ref: refAt(node.ref, i),
          pn: '',
          bomKey: key,
          instance: { i, n: node.at!.length, at },
        };
        items[iid] = inst;
        order.push(iid);
        item.children.push(iid);
        item.parts.push(iid);
        parts.push(iid);
      });
      item.bomKey = key;
      if (key && !bomKeys.includes(key)) bomKeys.push(key);
    } else if (node.shape) {
      item.part = true;
      item.parts.push(id);
      item.bomKey = key;
      parts.push(id);
      if (key && !bomKeys.includes(key)) bomKeys.push(key);
    }
    for (const child of node.children ?? []) {
      const c = visit(child, id, depth + 1);
      item.children.push(c.id);
      item.parts.push(...c.parts);
    }
    return item;
  };

  const root = visit(model.root, null, 0);

  const pnOf = (i: number) => `${model.tag}-${String((i + 1) * 10).padStart(3, '0')}`;
  const bom: BomRow[] = bomKeys.map((key, i) => {
    const members = parts.map((p) => items[p]).filter((it) => it.bomKey === key);
    const first = members[0].node;
    const marking = members
      .map((m) => m.node.decal)
      .find(
        (dc): dc is Extract<Decal, { kind: 'mark' }> => dc?.kind === 'mark' && dc.text !== '',
      )?.text;
    return {
      item: i + 1,
      pn: pnOf(i),
      name: first.name.replace(/, (top|bottom|left|right)$/, ''),
      desc: first.desc ?? first.name,
      kind: first.kind,
      qty: members.length,
      refs: members.map((m) => m.ref).filter((r): r is string => !!r),
      ...(marking ? { marking } : {}),
      ids: members.map((m) => m.id),
    };
  });
  const pnByKey = Object.fromEntries(bomKeys.map((k, i) => [k, pnOf(i)]));
  for (const id of order) {
    const it = items[id];
    it.pn = it.bomKey ? pnByKey[it.bomKey] : it.part || it.pattern ? 'REF' : `${model.tag}-ASM`;
  }

  return { model, items, order, root: root.id, parts, bom };
}

export const FLAT: Record<DeviceId, Flat> = Object.fromEntries(
  DEVICE_IDS.map((id) => [id, flatten(MODELS[id])]),
) as Record<DeviceId, Flat>;

/** Plain words for each kind of part. */
export const KIND_LABEL: Record<Kind, string> = {
  assembly: 'Assembly',
  enclosure: 'Enclosure part',
  fastener: 'Fastener',
  pcb: 'Bare board',
  ic: 'Integrated circuit',
  module: 'Module',
  passive: 'Passive component',
  connector: 'Connector',
  power: 'Power',
  rf: 'RF / antenna',
  display: 'Display',
  indicator: 'Indicator',
  switch: 'Switch',
  mechanical: 'Mechanical',
  fluid: 'Fluid component',
  sensor: 'Sensor',
  label: 'Label',
  reference: 'Reference geometry',
};

/** A plain name for each appearance, and its swatch colour. */
export const MAT_LOOK: Record<Mat, { label: string; color: string }> = {
  shell: { label: 'Plastic, light grey', color: '#d5dae0' },
  shellWhite: { label: 'Plastic, white', color: '#f1f1ee' },
  shellDark: { label: 'Plastic, charcoal', color: '#3b4048' },
  lens: { label: 'Clear plastic', color: '#c9d6e3' },
  steel: { label: 'Steel, bright', color: '#b8bec6' },
  alu: { label: 'Aluminium, anodised', color: '#a0a8b1' },
  gold: { label: 'Gold plate', color: '#d6a84e' },
  copper: { label: 'Copper', color: '#c87c4a' },
  pcbGreen: { label: 'Solder mask, green', color: '#1e6a45' },
  pcbBlue: { label: 'Solder mask, blue', color: '#1f4479' },
  pcbBlack: { label: 'Solder mask, black', color: '#202327' },
  pcbPurple: { label: 'Solder mask, purple', color: '#4e2c70' },
  ic: { label: 'Epoxy, black', color: '#25282d' },
  ceramic: { label: 'Ceramic', color: '#c8b28a' },
  rubber: { label: 'Rubber, black', color: '#1f2226' },
  battery: { label: 'Sleeve, blue', color: '#2e7db6' },
  batteryDark: { label: 'Sleeve, dark', color: '#2b2f37' },
  ledRed: { label: 'LED lens, red', color: '#e5484d' },
  ledGreen: { label: 'LED lens, green', color: '#30a46c' },
  ledAmber: { label: 'LED lens, amber', color: '#f2a541' },
  ledBlue: { label: 'LED lens, blue', color: '#3a7bd5' },
  terminal: { label: 'Polyamide, green', color: '#2f8a58' },
  orange: { label: 'Plastic, orange', color: '#ef8a2a' },
  white: { label: 'Label stock, white', color: '#f6f6f3' },
  zinc: { label: 'Zinc plate', color: '#c3c8ce' },
};
