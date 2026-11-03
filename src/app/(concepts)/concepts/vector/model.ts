// The document: a scene graph of pages, frames, shapes, text and images, the way a design tool
// stores a file. Nodes are immutable; edits go through a Draft that copies on write, so every
// version of the file is a cheap snapshot for undo, and React sees a new object only where
// something changed.

export type NodeType = 'page' | 'frame' | 'rect' | 'ellipse' | 'text' | 'image';
export type Sizing = 'fixed' | 'hug' | 'fill';
export type Align = 'start' | 'center' | 'end';
export type Justify = 'start' | 'center' | 'end' | 'between';

export interface Paint {
  color: string;
  opacity: number;
  /** The colour style it is linked to. */
  style?: string;
}

export interface Stroke extends Paint {
  width: number;
}

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface Font {
  family: FamilyId;
  size: number;
  weight: number;
  /** Line height in px; 0 is auto. */
  line: number;
  /** Letter spacing in px. */
  tracking: number;
  align: 'left' | 'center' | 'right';
  upper?: boolean;
  /** The text style it is linked to. */
  style?: string;
}

export interface AutoLayout {
  dir: 'h' | 'v';
  gap: number;
  /** Top, right, bottom, left. */
  pad: [number, number, number, number];
  align: Align;
  justify: Justify;
  wrap?: boolean;
  rowGap?: number;
}

export type Anim = 'instant' | 'dissolve' | 'smart' | 'move' | 'push' | 'slide';
export type Dir = 'left' | 'right' | 'up' | 'down';
export type Ease = 'out' | 'in-out' | 'in' | 'linear';
export type Action = 'navigate' | 'overlay' | 'back' | 'close' | 'url';

/** A prototype interaction: on click, do this. */
export interface Link {
  action: Action;
  to?: string;
  url?: string;
  anim: Anim;
  dir: Dir;
  ms: number;
  ease: Ease;
}

export interface Variant {
  /** The component set it belongs to. */
  set?: string;
  props: Record<string, string>;
}

export interface Node {
  id: string;
  type: NodeType;
  name: string;
  parent: string;
  children: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, about the centre. */
  rot: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  fill: Paint | null;
  stroke: Stroke | null;
  radius: number;
  shadow: Shadow | null;
  clip: boolean;
  layout: AutoLayout | null;
  /** How it sizes inside an auto layout parent (and, for frames and text, around its content). */
  sw: Sizing;
  sh: Sizing;
  /** Absolute position inside an auto layout parent. */
  abs: boolean;
  text?: string;
  font?: Font;
  /** Renamed by hand, so a text layer stops taking its name from its content. */
  named?: boolean;
  src?: string;
  /** A main component (and its variant properties). */
  comp?: Variant;
  /** A component set: the dashed box that holds a component's variants. */
  set?: boolean;
  /** An instance: the main component it was made from. */
  main?: string;
  /** Inside an instance: the node in the main component this one mirrors. */
  ref?: string;
  /** Inside an instance: the properties changed here, which the main no longer drives. */
  ov?: string[];
  link?: Link | null;
  /** Fixed position when the prototype scrolls. */
  fixed?: boolean;
  /** A flow starting point's name. */
  flow?: string;
  /** Where an overlay opens. */
  overlay?: 'center' | 'top' | 'right';
}

export interface ColorStyle {
  id: string;
  name: string;
  color: string;
}

export interface TextStyle {
  id: string;
  name: string;
  font: Omit<Font, 'style' | 'align'>;
}

export interface Doc {
  nodes: Record<string, Node>;
  pages: string[];
  colors: ColorStyle[];
  texts: TextStyle[];
  seq: number;
}

/* ------------------------------------------------------------------ fonts */

// The typefaces the file can use: each is a font the site already loads, read from its CSS variable.
export const FAMILIES = {
  schibsted: {
    label: 'Schibsted Grotesk',
    css: '--font-schibsted',
    weights: [400, 500, 600, 700, 800, 900],
  },
  inter: { label: 'Inter', css: '--font-inter', weights: [300, 400, 500, 600, 700, 800, 900] },
  jetbrains: { label: 'JetBrains Mono', css: '--font-jetbrains', weights: [400, 600, 700] },
  bricolage: {
    label: 'Bricolage Grotesque',
    css: '--font-bricolage',
    weights: [300, 400, 500, 600, 700, 800],
  },
  spaceGrotesk: {
    label: 'Space Grotesk',
    css: '--font-space-grotesk',
    weights: [300, 400, 500, 600, 700],
  },
  manrope: { label: 'Manrope', css: '--font-manrope', weights: [300, 400, 500, 600, 700, 800] },
  geist: { label: 'Geist', css: '--font-geist', weights: [300, 400, 500, 600, 700, 800, 900] },
  literata: { label: 'Literata', css: '--font-literata', weights: [400, 600, 700] },
  playfair: { label: 'Playfair Display', css: '--font-playfair', weights: [400, 700, 900] },
  plexMono: { label: 'IBM Plex Mono', css: '--font-plex-mono', weights: [400, 500, 600] },
} as const;

export type FamilyId = keyof typeof FAMILIES;

export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

/** Auto line height, as the font's own metrics would give it. */
export const lineHeight = (f: Font) => f.line || Math.round(f.size * 1.21);

/* ------------------------------------------------------------------ colour */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();

export function rgba(hex: string, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${Math.round(a * 1000) / 10}%)`;
}

/** A tidy hex for display: "#FBFAF7". */
export const hexOf = (hex: string) => rgbToHex(...hexToRgb(hex));

export function mixHex(a: string, b: string, t: number) {
  const x = hexToRgb(a),
    y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/* ------------------------------------------------------------------ matrices */

/** A 2D affine transform, as canvas takes it: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function inv(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export const apply = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** The vector part only, for deltas. */
export const applyV = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y,
  m[1] * x + m[3] * y,
];

/** A node's transform inside its parent: moved to x, y and turned about its centre. */
export function localMat(n: Node): Mat {
  if (n.type === 'page') return IDENTITY;
  if (!n.rot) return [1, 0, 0, 1, n.x, n.y];
  const r = (n.rot * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  const cx = n.w / 2,
    cy = n.h / 2;
  return [c, s, -s, c, n.x + cx - (c * cx - s * cy), n.y + cy - (s * cx + c * cy)];
}

export function worldMat(nodes: Record<string, Node>, id: string): Mat {
  const chain: Node[] = [];
  for (let n: Node | undefined = nodes[id]; n && n.type !== 'page'; n = nodes[n.parent])
    chain.push(n);
  let m = IDENTITY;
  for (let i = chain.length - 1; i >= 0; i--) m = mul(m, localMat(chain[i]));
  return m;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The axis-aligned box around a transformed w × h rectangle. */
export function aabb(m: Mat, w: number, h: number): Box {
  const pts = [apply(m, 0, 0), apply(m, w, 0), apply(m, w, h), apply(m, 0, h)];
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export const worldBox = (nodes: Record<string, Node>, id: string) =>
  aabb(worldMat(nodes, id), nodes[id].w, nodes[id].h);

export function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* ------------------------------------------------------------------ the tree */

export const isTop = (nodes: Record<string, Node>, id: string) =>
  nodes[nodes[id]?.parent]?.type === 'page';

export function ancestors(nodes: Record<string, Node>, id: string): string[] {
  const out: string[] = [];
  for (let p = nodes[id]?.parent; p && nodes[p]; p = nodes[p].parent) out.push(p);
  return out;
}

export function pageOf(nodes: Record<string, Node>, id: string): string {
  let n = nodes[id];
  while (n && n.type !== 'page') n = nodes[n.parent];
  return n?.id ?? '';
}

export function topOf(nodes: Record<string, Node>, id: string): string {
  let n = nodes[id];
  while (n && nodes[n.parent] && nodes[n.parent].type !== 'page') n = nodes[n.parent];
  return n?.id ?? id;
}

export const isAncestor = (nodes: Record<string, Node>, a: string, b: string) =>
  ancestors(nodes, b).includes(a);

/** A layer inside an instance: it mirrors the main component and can't be moved or removed. */
export const inInstance = (nodes: Record<string, Node>, id: string) =>
  !!nodes[id]?.ref && !!nodes[nodes[id].parent]?.ref;

/** The instance a layer belongs to: itself if it is one. */
export function instanceRoot(nodes: Record<string, Node>, id: string): string | null {
  let n = nodes[id];
  while (n && n.ref) {
    if (!nodes[n.parent]?.ref) return n.id;
    n = nodes[n.parent];
  }
  return null;
}

/** The main component a layer is part of, if any. */
export function mainOf(nodes: Record<string, Node>, id: string): string | null {
  for (let n: Node | undefined = nodes[id]; n && n.type !== 'page'; n = nodes[n.parent])
    if (n.comp) return n.id;
  return null;
}

export function descendants(nodes: Record<string, Node>, id: string, out: string[] = []): string[] {
  for (const c of nodes[id]?.children ?? []) {
    out.push(c);
    descendants(nodes, c, out);
  }
  return out;
}

/** Selected ids without any whose ancestor is also selected. */
export function outermost(nodes: Record<string, Node>, ids: string[]) {
  const set = new Set(ids);
  return ids.filter((id) => nodes[id] && !ancestors(nodes, id).some((a) => set.has(a)));
}

/** A component's display name: its set's name for a variant, or its own. */
export function componentName(nodes: Record<string, Node>, mainId: string | undefined) {
  const m = mainId ? nodes[mainId] : null;
  if (!m) return '';
  return m.comp?.set ? (nodes[m.comp.set]?.name ?? m.name) : m.name;
}

/** The names from a root down to a node, for matching layers across frames and variants. */
export function namePath(nodes: Record<string, Node>, root: string, id: string) {
  const parts: string[] = [];
  for (let n = nodes[id]; n && n.id !== root; n = nodes[n.parent]) parts.unshift(n.name);
  return parts.join('/');
}

/* ------------------------------------------------------------------ the draft */

/**
 * Edits to a document. The first write copies the node table, and each node is copied the
 * first time it changes; untouched nodes stay shared with the original.
 */
export class Draft {
  readonly base: Doc;
  nodes: Record<string, Node>;
  colors: ColorStyle[];
  texts: TextStyle[];
  seq: number;
  pages: string[];
  /** Everything written, for laying out only what changed. */
  touched = new Set<string>();
  private own = new Set<string>();
  private copied = false;

  constructor(doc: Doc) {
    this.base = doc;
    this.nodes = doc.nodes;
    this.colors = doc.colors;
    this.texts = doc.texts;
    this.seq = doc.seq;
    this.pages = doc.pages;
  }

  private write() {
    if (this.copied) return;
    this.nodes = { ...this.nodes };
    this.copied = true;
  }

  get(id: string): Node {
    return this.nodes[id];
  }

  set(id: string, patch: Partial<Node>) {
    const n = this.nodes[id];
    if (!n) return;
    let diff = false;
    for (const k in patch) {
      if (n[k as keyof Node] !== patch[k as keyof Node]) {
        diff = true;
        break;
      }
    }
    if (!diff) return;
    this.write();
    this.touched.add(id);
    if (this.own.has(id)) Object.assign(n, patch);
    else {
      this.nodes[id] = { ...n, ...patch };
      this.own.add(id);
    }
  }

  put(n: Node) {
    this.write();
    this.nodes[n.id] = n;
    this.own.add(n.id);
    this.touched.add(n.id);
  }

  drop(id: string) {
    this.write();
    delete this.nodes[id];
    this.own.delete(id);
    this.touched.delete(id);
  }

  newId() {
    return `n${(this.seq++).toString(36)}`;
  }

  done(): Doc {
    if (
      !this.copied &&
      this.seq === this.base.seq &&
      this.colors === this.base.colors &&
      this.texts === this.base.texts &&
      this.pages === this.base.pages
    )
      return this.base;
    return {
      nodes: this.nodes,
      pages: this.pages,
      colors: this.colors,
      texts: this.texts,
      seq: this.seq,
    };
  }
}

/* ------------------------------------------------------------------ tree edits */

export function blank(id: string, type: NodeType, name: string, p: Partial<Node> = {}): Node {
  return {
    id,
    type,
    name,
    parent: '',
    children: [],
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rot: 0,
    visible: true,
    locked: false,
    opacity: 1,
    fill: null,
    stroke: null,
    radius: 0,
    shadow: null,
    clip: false,
    layout: null,
    sw: 'fixed',
    sh: 'fixed',
    abs: false,
    ...p,
  };
}

export function insert(d: Draft, parent: string, id: string, index?: number) {
  const p = d.get(parent);
  const kids = p.children.filter((c) => c !== id);
  kids.splice(index === undefined ? kids.length : Math.max(0, Math.min(index, kids.length)), 0, id);
  d.set(parent, { children: kids });
  d.set(id, { parent });
}

export function detach(d: Draft, id: string) {
  const n = d.get(id);
  const p = n && d.get(n.parent);
  if (p) d.set(p.id, { children: p.children.filter((c) => c !== id) });
}

export function removeTree(d: Draft, id: string, unlink = true) {
  const n = d.get(id);
  if (!n) return;
  if (unlink) detach(d, id);
  for (const c of n.children) removeTree(d, c, false);
  d.drop(id);
}

/** Copies a subtree under a parent with fresh ids. Returns the new root's id. */
export function cloneTree(
  d: Draft,
  id: string,
  parent: string,
  index?: number,
  map = new Map<string, string>(),
): string {
  const src = d.get(id);
  const nid = d.newId();
  map.set(id, nid);
  const copy: Node = { ...src, id: nid, parent, children: [] };
  delete copy.comp;
  delete copy.set;
  delete copy.flow;
  d.put(copy);
  if (index !== undefined || parent) {
    const p = d.get(parent);
    if (p) {
      const kids = [...p.children];
      kids.splice(index === undefined ? kids.length : index, 0, nid);
      d.set(parent, { children: kids });
    }
  }
  const kids = src.children.map((c) => cloneTree(d, c, nid, undefined, map));
  d.set(nid, { children: kids });
  return nid;
}

/** Moves a node to a new parent, keeping where it sits on the canvas. */
export function reparent(d: Draft, id: string, parent: string, index?: number) {
  const n = d.get(id);
  const wm = worldMat(d.nodes, id);
  detach(d, id);
  insert(d, parent, id, index);
  const pm = worldMat(d.nodes, parent);
  // Undo the new parent's transform, then take the node's own turn back out.
  const local = mul(inv(pm), wm);
  const rot = Math.round(((Math.atan2(local[1], local[0]) * 180) / Math.PI) * 100) / 100;
  const [cx, cy] = apply(local, n.w / 2, n.h / 2);
  d.set(id, { x: Math.round(cx - n.w / 2), y: Math.round(cy - n.h / 2), rot });
}
