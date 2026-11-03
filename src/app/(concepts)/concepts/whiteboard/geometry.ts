// The Whiteboard's geometry: the system-design diagram (one wide layout for the board, one tall
// one for phones), the frames around it, and the timeline Moe's cursor follows to draw it all.

import {
  arc,
  arrowHead,
  bend,
  dashed,
  ellipse,
  hachure,
  hash,
  line,
  path,
  polygon,
  prng,
  rect,
  ring,
  toPath,
  track,
  type Pt,
  type Rand,
  type Sub,
  type Track,
} from './rough';

// Board colours are tokens on the root (see whiteboard.module.scss), so the drawing follows light
// and dark. Set them with `style`, not SVG attributes, so the var() resolves.
export const INK = 'var(--ink)';
export const RED = 'var(--red)';
export const BLUE = 'var(--blue)';
export const GREEN = 'var(--green)';
export const ORANGE = 'var(--orange)';
export const STICKY = 'var(--sticky)';
export const STICKY_BLUE = 'var(--sticky-blue)';
export const STICKY_GREEN = 'var(--sticky-green)';
export const STICKY_RED = 'var(--sticky-red)';
const BLUE_L = 'var(--blue-l)';
const RED_L = 'var(--red-l)';
const GREEN_L = 'var(--green-l)';
const GRAY_L = 'var(--gray-l)';

/** Collaborators' colours. Like a person's colour on a shared board, they stay put in both schemes. */
export const PEER = { blue: '#1971c2', green: '#2f9e44', red: '#e03131' };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ------------------------------------------------------------------ frames */

export type FrameId =
  | 'about'
  | 'shipped'
  | 'more'
  | 'work'
  | 'log'
  | 'decisions'
  | 'oss'
  | 'data'
  | 'roots'
  | 'contact';

export interface FrameSpec {
  id: FrameId;
  /** The frame's name, shown above it the way whiteboard apps label frames. */
  name: string;
  /** Short label for menus. */
  label: string;
  rect: Rect;
}

// Frames sit around the diagram in the direction of the box they belong to; the two
// follow-on frames continue outwards on the left and right.
export const FRAMES: FrameSpec[] = [
  {
    id: 'about',
    name: 'gateway / about.md',
    label: 'About',
    rect: { x: -2300, y: -1320, w: 1480, h: 700 },
  },
  {
    id: 'shipped',
    name: 'client / shipped',
    label: 'Shipped',
    rect: { x: -2300, y: -370, w: 1480, h: 740 },
  },
  {
    id: 'more',
    name: 'client / also-shipped',
    label: 'Also shipped',
    rect: { x: -3940, y: -410, w: 1480, h: 820 },
  },
  {
    id: 'work',
    name: 'services / timeline',
    label: 'Timeline',
    rect: { x: 820, y: -385, w: 1480, h: 770 },
  },
  {
    id: 'log',
    name: 'services / CHANGELOG.md',
    label: 'Changelog',
    rect: { x: 2460, y: -390, w: 1480, h: 780 },
  },
  {
    id: 'decisions',
    name: 'team / decisions',
    label: 'Decisions',
    rect: { x: -660, y: -1300, w: 1320, h: 680 },
  },
  {
    id: 'oss',
    name: 'upstream / pull-requests',
    label: 'Open source',
    rect: { x: 820, y: -1340, w: 1480, h: 720 },
  },
  {
    id: 'data',
    name: 'data / numbers',
    label: 'Numbers & stack',
    rect: { x: 820, y: 620, w: 1480, h: 680 },
  },
  {
    id: 'roots',
    name: 'cold-storage / roots',
    label: 'Roots',
    rect: { x: -660, y: 620, w: 1320, h: 620 },
  },
  {
    id: 'contact',
    name: 'inbox / hello',
    label: 'Contact',
    rect: { x: -1940, y: 620, w: 1120, h: 580 },
  },
];

/** The diagram's box on the board, in world units. */
export const DIAGRAM: Rect = { x: -660, y: -420, w: 1320, h: 840 };

export const BOUNDS: Rect = (() => {
  const rects = [DIAGRAM, ...FRAMES.map((f) => f.rect)];
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y)) - 40;
  const x2 = Math.max(...rects.map((r) => r.x + r.w)),
    y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
})();

/* ------------------------------------------------------------------ the diagram */

export type NodeId =
  'gateway' | 'client' | 'services' | 'team' | 'upstream' | 'data' | 'cold' | 'inbox';
type Shape = 'box' | 'browser' | 'stack' | 'team' | 'cloud' | 'queue' | 'bucket' | 'cylinder';

export interface NodeSpec {
  id: NodeId;
  frame: FrameId;
  title: string;
  sub: string;
  shape: Shape;
  tint: string | null;
}

// In tab order: the gateway (who he is) first, then the rest of the system.
export const NODES: NodeSpec[] = [
  {
    id: 'gateway',
    frame: 'about',
    title: 'API gateway',
    sub: 'about me',
    shape: 'box',
    tint: RED_L,
  },
  {
    id: 'client',
    frame: 'shipped',
    title: 'Client',
    sub: 'what I shipped',
    shape: 'browser',
    tint: BLUE_L,
  },
  {
    id: 'services',
    frame: 'work',
    title: 'Services',
    sub: 'where I’ve worked',
    shape: 'stack',
    tint: GREEN_L,
  },
  { id: 'team', frame: 'decisions', title: 'Team', sub: 'how I lead', shape: 'team', tint: STICKY },
  {
    id: 'upstream',
    frame: 'oss',
    title: 'Upstream',
    sub: 'open-source fixes',
    shape: 'cloud',
    tint: null,
  },
  {
    id: 'data',
    frame: 'data',
    title: 'Data',
    sub: 'numbers & stack',
    shape: 'cylinder',
    tint: BLUE_L,
  },
  {
    id: 'cold',
    frame: 'roots',
    title: 'Cold storage',
    sub: 'roots',
    shape: 'bucket',
    tint: GRAY_L,
  },
  { id: 'inbox', frame: 'contact', title: 'Inbox', sub: 'say hello', shape: 'queue', tint: STICKY },
];

/** The order Moe draws the boxes in: along the request path, then around the edges. */
const DRAW_ORDER: NodeId[] = [
  'client',
  'gateway',
  'services',
  'data',
  'cold',
  'inbox',
  'team',
  'upstream',
];

interface Edge {
  id: string;
  from: Pt;
  to: Pt;
  via?: Pt;
  dashed?: boolean;
  label: string;
  /** Label anchor: centred above a horizontal edge, or left-aligned beside a vertical one. */
  at: Pt;
  align: 'center' | 'left';
}

export interface Layout {
  key: 'wide' | 'tall';
  W: number;
  H: number;
  rough: number;
  /** Stroke width of the marker, and the size of the stack offset and arrowheads. */
  ink: number;
  unit: number;
  font: {
    h1: number;
    role: number;
    tagline: number;
    title: number;
    sub: number;
    edge: number;
    note: number;
  };
  nodes: Record<NodeId, Rect>;
  edges: Edge[];
  /** Where the title block's pieces sit: [left, top] (and a width for the tagline). */
  text: { h1: Pt; role: Pt; tagline: Pt; hint: Pt; here: Pt };
  taglineWidth: number;
  underline: [Pt, Pt];
  hereArrow: Pt[];
  enter: Pt;
}

export const WIDE: Layout = {
  key: 'wide',
  W: 1320,
  H: 840,
  rough: 1,
  ink: 2,
  unit: 10,
  font: { h1: 76, role: 38, tagline: 17, title: 34, sub: 23, edge: 22, note: 25 },
  nodes: {
    team: { x: 535, y: 104, w: 250, h: 126 },
    upstream: { x: 950, y: 80, w: 290, h: 160 },
    client: { x: 105, y: 345, w: 250, h: 150 },
    gateway: { x: 525, y: 345, w: 270, h: 150 },
    services: { x: 955, y: 340, w: 270, h: 160 },
    inbox: { x: 105, y: 632, w: 250, h: 124 },
    cold: { x: 540, y: 618, w: 240, h: 146 },
    data: { x: 975, y: 612, w: 230, h: 156 },
  },
  edges: [
    {
      id: 'https',
      from: [363, 420],
      to: [517, 420],
      label: 'HTTPS',
      at: [440, 386],
      align: 'center',
    },
    {
      id: 'routes',
      from: [803, 422],
      to: [945, 428],
      label: 'routes',
      at: [874, 388],
      align: 'center',
    },
    {
      id: 'owns',
      from: [793, 158],
      via: [930, 200],
      to: [995, 330],
      label: 'owns',
      at: [866, 150],
      align: 'left',
    },
    {
      id: 'npm',
      from: [1100, 250],
      to: [1104, 330],
      dashed: true,
      label: 'npm i',
      at: [1118, 270],
      align: 'left',
    },
    {
      id: 'writes',
      from: [1082, 508],
      to: [1088, 602],
      label: 'writes',
      at: [1100, 536],
      align: 'left',
    },
    {
      id: 'archive',
      from: [965, 694],
      to: [780, 694],
      dashed: true,
      label: 'archive',
      at: [872, 652],
      align: 'center',
    },
    {
      id: 'hello',
      from: [230, 503],
      to: [230, 624],
      label: 'POST /hello',
      at: [244, 546],
      align: 'left',
    },
  ],
  text: { h1: [34, 18], role: [40, 112], tagline: [42, 166], hint: [42, 226], here: [14, 284] },
  taglineWidth: 420,
  underline: [
    [40, 104],
    [468, 98],
  ],
  hereArrow: [
    [60, 314],
    [70, 330],
    [98, 341],
  ],
  enter: [1380, 620],
};

export const TALL: Layout = {
  key: 'tall',
  W: 360,
  H: 560,
  rough: 0.7,
  ink: 1.6,
  unit: 6,
  font: { h1: 54, role: 30, tagline: 15, title: 19, sub: 13.5, edge: 14, note: 18 },
  nodes: {
    team: { x: 133, y: 214, w: 94, h: 72 },
    upstream: { x: 250, y: 206, w: 108, h: 80 },
    client: { x: 10, y: 344, w: 94, h: 78 },
    gateway: { x: 133, y: 344, w: 94, h: 78 },
    services: { x: 254, y: 338, w: 102, h: 86 },
    inbox: { x: 10, y: 478, w: 94, h: 68 },
    cold: { x: 133, y: 470, w: 94, h: 80 },
    data: { x: 260, y: 468, w: 92, h: 84 },
  },
  edges: [
    { id: 'https', from: [108, 384], to: [129, 384], label: '', at: [0, 0], align: 'center' },
    { id: 'routes', from: [231, 384], to: [252, 388], label: '', at: [0, 0], align: 'center' },
    {
      id: 'owns',
      from: [230, 258],
      via: [258, 276],
      to: [270, 332],
      label: '',
      at: [0, 0],
      align: 'left',
    },
    {
      id: 'npm',
      from: [306, 290],
      to: [308, 332],
      dashed: true,
      label: '',
      at: [0, 0],
      align: 'left',
    },
    {
      id: 'writes',
      from: [300, 428],
      to: [302, 464],
      label: 'writes',
      at: [310, 434],
      align: 'left',
    },
    {
      id: 'archive',
      from: [256, 510],
      to: [231, 510],
      dashed: true,
      label: '',
      at: [0, 0],
      align: 'center',
    },
    {
      id: 'hello',
      from: [57, 426],
      to: [57, 472],
      label: 'POST /hello',
      at: [64, 432],
      align: 'left',
    },
  ],
  text: { h1: [6, 0], role: [8, 70], tagline: [8, 112], hint: [8, 168], here: [8, 280] },
  taglineWidth: 330,
  underline: [
    [8, 64],
    [300, 60],
  ],
  hereArrow: [
    [40, 312],
    [44, 326],
    [56, 338],
  ],
  enter: [380, 420],
};

/** The front box of a stack, where its label goes. */
export function front(L: Layout, r: Rect): Rect {
  const o = L.unit * 2;
  return { x: r.x, y: r.y + o, w: r.w - o, h: r.h - o };
}

/** Where a node's label block is centred, given its shape. */
export function labelBox(L: Layout, n: NodeSpec): Rect {
  const r = L.nodes[n.id];
  switch (n.shape) {
    case 'stack':
      return front(L, r);
    case 'browser':
      return { x: r.x, y: r.y + L.unit * 2.4, w: r.w, h: r.h - L.unit * 2.4 };
    case 'cylinder':
    case 'bucket':
      return { x: r.x, y: r.y + L.unit * 3, w: r.w, h: r.h - L.unit * 3 };
    case 'queue':
      return { x: r.x, y: r.y, w: r.w - L.unit * 6.4, h: r.h };
    default:
      return r;
  }
}

const cloudBump = (a: number) => 1 + 0.16 * Math.abs(Math.sin(a * 3.5));

/** A node's strokes: outline groups in drawing order, plus the hachure fill. */
function shape(r: Rand, L: Layout, n: NodeSpec): { outline: Sub[][]; fill: Sub[] } {
  const { x, y, w, h } = L.nodes[n.id];
  const k = L.rough,
    u = L.unit,
    gap = L.ink * 4;
  const box = (b: Rect): Pt[] => [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h],
  ];
  switch (n.shape) {
    case 'box':
      return {
        outline: [rect(r, x, y, w, h, k)],
        fill: hachure(r, box({ x, y, w, h }), gap, -41, k),
      };
    case 'browser': {
      const bar = y + u * 2.4;
      const dots = [0, 1, 2].map((i) =>
        ellipse(r, x + u * (1.4 + i * 1.3), y + u * 1.2, u * 0.38, u * 0.38, k * 0.5),
      );
      return {
        outline: [rect(r, x, y, w, h, k), line(r, x, bar, x + w, bar, k), ...dots],
        fill: hachure(r, box({ x, y: bar, w, h: h - u * 2.4 }), gap, -41, k),
      };
    }
    case 'stack': {
      const f = front(L, { x, y, w, h });
      // The visible corner of each card behind: up from the card in front, across, down, back.
      const back = (o: number): Pt[] => [
        [x + o, y + 3 * u - o],
        [x + o, y + 2 * u - o],
        [x + w - 2 * u + o, y + 2 * u - o],
        [x + w - 2 * u + o, y + h - o],
        [x + w - 3 * u + o, y + h - o],
      ];
      return {
        outline: [
          rect(r, f.x, f.y, f.w, f.h, k),
          polygon(r, back(u), k * 0.8, false),
          polygon(r, back(2 * u), k * 0.8, false),
        ],
        fill: hachure(r, box(f), gap, -41, k),
      };
    }
    case 'team': {
      // Three heads peeking over the top edge.
      const heads = [0.28, 0.5, 0.72].map((p, i) => {
        const rr = u * 1.15,
          cx = x + w * p,
          cy = y - u * 0.5 - (i === 1 ? u * 0.45 : 0);
        const a = Math.asin(Math.min(1, (y - cy) / rr));
        return arc(r, cx, cy, rr, rr, Math.PI - a, Math.PI * 2 + a, k * 0.6);
      });
      return {
        outline: [rect(r, x, y, w, h, k), ...heads],
        fill: hachure(r, box({ x, y, w, h }), gap, -41, k),
      };
    }
    case 'cloud': {
      const cx = x + w / 2,
        cy = y + h / 2,
        rx = w / 2 / 1.16,
        ry = h / 2 / 1.16;
      return { outline: [ellipse(r, cx, cy, rx, ry, k * 0.8, cloudBump, 70)], fill: [] };
    }
    case 'queue': {
      const slots = [1, 2, 3].map((i) =>
        line(r, x + w - u * 2.1 * i, y + u * 1.2, x + w - u * 2.1 * i, y + h - u * 1.2, k * 0.7),
      );
      return {
        outline: [rect(r, x, y, w, h, k), ...slots],
        fill: hachure(r, box({ x, y, w: w - u * 6.4, h }), gap, -41, k),
      };
    }
    case 'bucket': {
      const ry = u * 2,
        inset = u * 2.2,
        ry2 = u * 1.4,
        cx = x + w / 2;
      const body: Pt[] = [
        [x, y + ry],
        [x + w, y + ry],
        [x + w - inset, y + h - ry2],
        ...ring(cx, y + h - ry2, w / 2 - inset, ry2, 16)
          .slice(0, 9)
          .map(([px, py]): Pt => [px, py]),
        [x + inset, y + h - ry2],
      ];
      return {
        outline: [
          ellipse(r, cx, y + ry, w / 2, ry, k * 0.7),
          line(r, x, y + ry, x + inset, y + h - ry2, k),
          arc(r, cx, y + h - ry2, w / 2 - inset, ry2, 0, Math.PI, k * 0.7),
          line(r, x + w, y + ry, x + w - inset, y + h - ry2, k),
        ],
        fill: hachure(r, body, gap, -41, k),
      };
    }
    case 'cylinder': {
      const ry = u * 2.2,
        cx = x + w / 2;
      const body: Pt[] = [
        [x, y + ry],
        [x + w, y + ry],
        ...ring(cx, y + h - ry, w / 2, ry, 16).slice(0, 9),
      ];
      return {
        outline: [
          ellipse(r, cx, y + ry, w / 2, ry, k * 0.7),
          line(r, x, y + ry, x, y + h - ry, k),
          arc(r, cx, y + h - ry, w / 2, ry, 0, Math.PI, k * 0.7),
          line(r, x + w, y + ry, x + w, y + h - ry, k),
        ],
        fill: hachure(r, body, gap, -41, k),
      };
    }
  }
}

/* ------------------------------------------------------------------ the drawing timeline */

export type Target = Pt | { key: string; end: boolean };

export interface Mark {
  d: string;
  kind: 'ink' | 'fill' | 'red' | 'faint';
  tint?: string;
  t0: number;
  t1: number;
}

export interface Write {
  key: string;
  t0: number;
  t1: number;
}

export type Leg = { t0: number; t1: number } & (
  | { kind: 'move'; a: Target; b: Target }
  | { kind: 'draw'; track: Track }
  | { kind: 'write'; key: string; chars: number }
);

export interface Plan {
  marks: Mark[];
  writes: Write[];
  legs: Leg[];
  total: number;
}

export const labelKeys = {
  h1: 'h1',
  role: 'role',
  tagline: 'tagline',
  hint: 'hint',
  here: 'here',
  title: (id: NodeId) => `t-${id}`,
  sub: (id: NodeId) => `s-${id}`,
  edge: (id: string) => `e-${id}`,
};

/**
 * Lays out everything Moe draws, in order, on one clock: the title, then the boxes (each
 * filled with hachure as soon as its outline closes), then the arrows, then the labels.
 * The cursor rides along every stroke and travels between them.
 */
export function plan(
  L: Layout,
  h1: string,
  role: string,
  tagline: string,
  hint: string,
  here: string,
): Plan {
  const r = prng(hash(L.key));
  const marks: Mark[] = [];
  const writes: Write[] = [];
  const legs: Leg[] = [];
  const speed = L.key === 'wide' ? 3000 : 1000;
  let t = 0.2;
  let pen: Target = L.enter;

  const go = (to: Target) => {
    let dur = 0.07;
    if (Array.isArray(pen) && Array.isArray(to)) {
      // Short hops (the next side of a box, the next dash) are a flick of the wrist.
      const dist = Math.hypot(to[0] - pen[0], to[1] - pen[1]);
      dur = dist < L.unit * 3 ? 0.01 : Math.min(0.26, 0.03 + dist / (speed * 2));
    }
    legs.push({ kind: 'move', a: pen, b: to, t0: t, t1: t + dur });
    t += dur;
    pen = to;
  };

  const ink = (subs: Sub[], kind: Mark['kind'] = 'ink', doubled = true) => {
    subs.forEach((sub, i) => {
      const tr = track(sub);
      const quick = doubled && i >= subs.length / 2;
      go(tr.pts[0]);
      const dur = Math.max(0.02, tr.len / (quick ? speed * 2 : speed));
      marks.push({ d: toPath([sub]), kind, t0: t, t1: t + dur });
      legs.push({ kind: 'draw', track: tr, t0: t, t1: t + dur });
      t += dur;
      pen = tr.pts[tr.pts.length - 1];
    });
  };

  // Fills are scribbled in the background while the pen moves on.
  const fill = (subs: Sub[], tint: string) => {
    const span = 0.45;
    subs.forEach((sub, i) => {
      const t0 = t + (i / Math.max(1, subs.length)) * span;
      marks.push({ d: toPath([sub]), kind: 'fill', tint, t0, t1: t0 + 0.07 });
    });
  };

  const write = (key: string, text: string, cps: number) => {
    if (!text) return;
    go({ key, end: false });
    const dur = text.length / cps;
    writes.push({ key, t0: t, t1: t + dur });
    legs.push({ kind: 'write', key, chars: text.length, t0: t, t1: t + dur });
    t += dur;
    pen = { key, end: true };
  };

  // 1. Who this is.
  write(labelKeys.h1, h1, 9);
  ink(
    path(
      r,
      [
        L.underline[0],
        [(L.underline[0][0] + L.underline[1][0]) / 2, L.underline[0][1] + 3],
        L.underline[1],
      ],
      L.rough,
    ),
    'red',
  );
  write(labelKeys.role, role, 14);
  write(labelKeys.tagline, tagline, 95);

  // 2. Boxes.
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, NodeSpec>;
  for (const id of DRAW_ORDER) {
    const n = byId[id];
    const { outline, fill: hatch } = shape(r, L, n);
    outline.forEach((group) => ink(group, 'ink', group.length > 1));
    if (n.tint && hatch.length) fill(hatch, n.tint);
  }

  // 3. Arrows.
  for (const e of L.edges) {
    const pts = e.via ? bend(e.from, e.via, e.to) : null;
    if (e.dashed)
      ink(
        dashed(
          r,
          e.from[0],
          e.from[1],
          e.to[0],
          e.to[1],
          L.unit * 1.2,
          L.unit * 0.9,
          L.rough * 0.6,
        ),
        'ink',
        false,
      );
    else
      ink(pts ? path(r, pts, L.rough) : line(r, e.from[0], e.from[1], e.to[0], e.to[1], L.rough));
    const tail = pts ? pts[pts.length - 3] : e.from;
    ink(arrowHead(r, tail, e.to, L.unit * 1.7, L.rough), 'ink', false);
  }

  // 4. Labels: box names, what they hold, then the arrows.
  for (const id of DRAW_ORDER) {
    write(labelKeys.title(id), byId[id].title, 34);
    write(labelKeys.sub(id), byId[id].sub, 62);
  }
  for (const e of L.edges) write(labelKeys.edge(e.id), e.label, 48);

  // 5. Margin notes.
  write(labelKeys.here, here, 30);
  ink(path(r, L.hereArrow, L.rough * 0.8), 'red');
  ink(
    arrowHead(
      r,
      L.hereArrow[L.hereArrow.length - 2],
      L.hereArrow[L.hereArrow.length - 1],
      L.unit * 1.2,
      L.rough,
    ),
    'red',
    false,
  );
  write(labelKeys.hint, hint, 40);

  return { marks, writes, legs, total: t + 0.3 };
}

/** Static strokes on the board: faint dashed leaders from each box out to its frame. */
export function leaders(): string {
  const r = prng(7);
  const subs: Sub[] = [];
  const node = (id: NodeId): Rect => {
    const n = WIDE.nodes[id];
    return { x: n.x + DIAGRAM.x, y: n.y + DIAGRAM.y, w: n.w, h: n.h };
  };
  const frame = (id: FrameId) => FRAMES.find((f) => f.id === id)!.rect;
  const link = (from: Pt, to: Pt) =>
    subs.push(
      ...dashed(r, from[0], from[1], to[0], to[1], 14, 12, 0.5),
      ...arrowHead(r, from, to, 16, 0.8),
    );

  const client = node('client'),
    services = node('services'),
    team = node('team'),
    up = node('upstream');
  const cold = node('cold'),
    data = node('data'),
    inbox = node('inbox');
  link(
    [client.x - 14, client.y + client.h / 2],
    [frame('shipped').x + frame('shipped').w + 16, client.y + client.h / 2],
  );
  link(
    [services.x + services.w + 14, services.y + services.h / 2 + 10],
    [frame('work').x - 16, services.y + services.h / 2 + 10],
  );
  link(
    [team.x + team.w / 2, team.y - 34],
    [team.x + team.w / 2, frame('decisions').y + frame('decisions').h + 16],
  );
  link([up.x + up.w * 0.75, up.y - 6], [frame('oss').x + 90, frame('oss').y + frame('oss').h + 16]);
  link([cold.x + cold.w / 2, cold.y + cold.h + 14], [cold.x + cold.w / 2, frame('roots').y - 46]);
  link([data.x + data.w * 0.7, data.y + data.h + 14], [frame('data').x + 90, frame('data').y - 46]);
  link(
    [inbox.x + inbox.w * 0.3, inbox.y + inbox.h + 14],
    [frame('contact').x + frame('contact').w - 90, frame('contact').y - 46],
  );
  link(
    [DIAGRAM.x + 20, DIAGRAM.y + 10],
    [frame('about').x + frame('about').w - 60, frame('about').y + frame('about').h + 16],
  );

  // Follow-on frames.
  const across = (a: FrameId, b: FrameId) => {
    const fa = frame(a),
      fb = frame(b);
    const y = fa.y + 140;
    const [x1, x2] = fb.x > fa.x ? [fa.x + fa.w + 16, fb.x - 16] : [fa.x - 16, fb.x + fb.w + 16];
    subs.push(...line(r, x1, y, x2, y, 0.8), ...arrowHead(r, [x1, y], [x2, y], 18, 0.8));
  };
  across('shipped', 'more');
  across('work', 'log');
  return toPath(subs);
}
