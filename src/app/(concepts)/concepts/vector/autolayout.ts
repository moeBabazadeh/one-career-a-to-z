// Text shaping and auto layout. Text is measured with the browser's own font metrics and broken
// into lines greedily, word by word, like a design tool's text engine. Auto layout stacks a
// frame's children along an axis with gap and padding, sizes them as fixed, hug or fill, aligns
// them on the cross axis, and wraps rows when asked.

import { FAMILIES, lineHeight, type Draft, type FamilyId, type Font, type Node } from './model';

/* ------------------------------------------------------------------ measuring */

export interface Measurer {
  width(text: string, font: Font): number;
  /** Ascent and descent at the font's size. */
  metrics(font: Font): [number, number];
}

// Before fonts load (and on the server) widths are estimated, so the tree still has sizes.
const estimate: Measurer = {
  width: (t, f) =>
    t.length * f.size * (f.family === 'jetbrains' || f.family === 'plexMono' ? 0.6 : 0.52) +
    t.length * f.tracking,
  metrics: (f) => [f.size * 0.92, f.size * 0.24],
};

let measurer = estimate;
let generation = 0;

const familyCss = new Map<FamilyId, string>();

/** The CSS family list behind a font's variable, as next/font named it. */
export function family(id: FamilyId) {
  let v = familyCss.get(id);
  if (!v && typeof document !== 'undefined') {
    v =
      getComputedStyle(document.documentElement).getPropertyValue(FAMILIES[id].css).trim() ||
      'sans-serif';
    familyCss.set(id, v);
  }
  return v ?? 'sans-serif';
}

export const fontString = (f: Font) => `${f.weight} ${f.size}px ${family(f.family)}`;

/** Whether this canvas can space letters itself. */
export const canTrack =
  typeof CanvasRenderingContext2D !== 'undefined' &&
  'letterSpacing' in CanvasRenderingContext2D.prototype;

/** Swaps the estimate for real metrics read from a canvas. Clears every cached shape. */
export function canvasMetrics() {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return;
  const metricCache = new Map<string, [number, number]>();
  const set = (f: Font) => {
    ctx.font = fontString(f);
    if (canTrack)
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${f.tracking}px`;
  };
  measurer = {
    width(t, f) {
      set(f);
      return ctx.measureText(t).width;
    },
    metrics(f) {
      const key = `${f.family}/${f.weight}/${f.size}`;
      let m = metricCache.get(key);
      if (!m) {
        set(f);
        const tm = ctx.measureText('Hgjy');
        m = [tm.fontBoundingBoxAscent || f.size * 0.92, tm.fontBoundingBoxDescent || f.size * 0.24];
        metricCache.set(key, m);
      }
      return m;
    },
  };
  generation++;
  shapes.clear();
  words.clear();
}

/* ------------------------------------------------------------------ shaping */

export interface Line {
  text: string;
  w: number;
}

export interface Shape {
  w: number;
  h: number;
  lines: Line[];
  /** Line height. */
  lh: number;
  asc: number;
  desc: number;
}

const shapes = new Map<string, Shape>();
const words = new Map<string, number>();

const fontKey = (f: Font) =>
  `${f.family}/${f.weight}/${f.size}/${f.tracking}/${f.upper ? 1 : 0}/${f.line}`;

function wordWidth(w: string, f: Font, key: string) {
  const k = `${key}|${w}`;
  let v = words.get(k);
  if (v === undefined) {
    v = measurer.width(w, f);
    if (words.size > 40000) words.clear();
    words.set(k, v);
  }
  return v;
}

/** Breaks text into lines no wider than maxW (or only at newlines when maxW is null). */
export function shape(text: string, f: Font, maxW: number | null): Shape {
  const key = fontKey(f);
  const ck = `${key}|${maxW === null ? -1 : Math.round(maxW * 100)}|${text}`;
  const hit = shapes.get(ck);
  if (hit) return hit;
  const t = f.upper ? text.toUpperCase() : text;
  const space = wordWidth(' ', f, key);
  const lines: Line[] = [];
  for (const para of t.split('\n')) {
    if (maxW === null) {
      lines.push({ text: para, w: measurer.width(para, f) });
      continue;
    }
    let line = '';
    let lw = 0;
    for (const word of para.split(' ')) {
      const ww = wordWidth(word, f, key);
      if (line && lw + space + ww > maxW + 0.5) {
        lines.push({ text: line, w: lw });
        line = word;
        lw = ww;
      } else {
        lw += (line ? space : 0) + ww;
        line = line ? `${line} ${word}` : word;
      }
      // A single word wider than the box breaks between letters.
      while (lw > maxW + 0.5 && line.length > 1 && !line.includes(' ')) {
        let cut = line.length - 1;
        while (cut > 1 && measurer.width(line.slice(0, cut), f) > maxW) cut--;
        lines.push({ text: line.slice(0, cut), w: measurer.width(line.slice(0, cut), f) });
        line = line.slice(cut);
        lw = measurer.width(line, f);
      }
    }
    lines.push({ text: line, w: lw });
  }
  const lh = lineHeight(f);
  const [asc, desc] = measurer.metrics(f);
  const w = maxW === null ? Math.ceil(Math.max(0, ...lines.map((l) => l.w))) : maxW;
  const s: Shape = { w, h: lines.length * lh, lines, lh, asc, desc };
  if (shapes.size > 20000) shapes.clear();
  shapes.set(ck, s);
  return s;
}

/** The shape a text node draws with at its current size. */
export const textShape = (n: Node) =>
  shape(n.text ?? '', n.font as Font, n.sw === 'hug' ? null : n.w);

/** Bumps when metrics change, so painters can drop anything cached from the estimate. */
export const metricsGeneration = () => generation;

/* ------------------------------------------------------------------ auto layout */

function fitText(d: Draft, id: string) {
  const n = d.get(id);
  if (!n.font) return;
  if (n.sw === 'hug') {
    const s = shape(n.text ?? '', n.font, null);
    d.set(id, { w: s.w, h: n.sh === 'fixed' ? n.h : s.h });
  } else if (n.sh === 'hug') {
    d.set(id, { h: shape(n.text ?? '', n.font, n.w).h });
  }
}

/** Lays out a node and everything inside it. */
export function layoutNode(d: Draft, id: string) {
  const n = d.get(id);
  if (!n) return;
  if (n.type === 'text') return fitText(d, id);
  if (n.type !== 'frame' && n.type !== 'page') return;
  const L = n.layout;
  if (!L || n.type === 'page') {
    for (const c of n.children) layoutNode(d, c);
    return;
  }
  const H = L.dir === 'h';
  const [pt, pr, pb, pl] = L.pad;
  const top = d.get(n.parent)?.type === 'page';
  const sw = n.sw === 'fill' && top ? 'fixed' : n.sw;
  const sh = n.sh === 'fill' && top ? 'fixed' : n.sh;
  const flow = n.children.filter((c) => {
    const k = d.get(c);
    return k.visible && !k.abs;
  });
  const hugMain = H ? sw === 'hug' : sh === 'hug';
  const hugCross = H ? sh === 'hug' : sw === 'hug';
  const main = (k: Node) => (H ? k.w : k.h);
  const cross = (k: Node) => (H ? k.h : k.w);
  const setMain = (c: string, v: number) => d.set(c, H ? { w: v } : { h: v });
  const setCross = (c: string, v: number) => d.set(c, H ? { h: v } : { w: v });
  const mainFill = (k: Node) => (H ? k.sw : k.sh) === 'fill';
  const crossFill = (k: Node) => (H ? k.sh : k.sw) === 'fill';
  const padMain = H ? pl + pr : pt + pb;
  const padCross = H ? pt + pb : pl + pr;

  if (L.wrap && H) return wrapRows(d, id, flow);

  // Cross-axis fill takes the frame's inner size when the frame's size is known.
  const innerCross0 = (H ? n.h : n.w) - padCross;
  for (const c of flow) if (crossFill(d.get(c)) && !hugCross) setCross(c, Math.max(0, innerCross0));
  for (const c of flow) if (!mainFill(d.get(c)) || hugMain) layoutNode(d, c);

  // Main-axis fill shares what's left.
  if (!hugMain) {
    const fills = flow.filter((c) => mainFill(d.get(c)));
    if (fills.length) {
      const fixed = flow.filter((c) => !mainFill(d.get(c))).reduce((s, c) => s + main(d.get(c)), 0);
      const gaps = L.justify === 'between' ? 0 : L.gap * (flow.length - 1);
      const each = Math.max(0, ((H ? n.w : n.h) - padMain - fixed - gaps) / fills.length);
      for (const f of fills) {
        setMain(f, each);
        layoutNode(d, f);
      }
    }
  }

  // A hugging frame is as big as its content; fill children match the largest of the rest.
  if (hugCross) {
    const others = flow.filter((c) => !crossFill(d.get(c)));
    let max = others.length ? Math.max(...others.map((c) => cross(d.get(c)))) : 0;
    for (const c of flow) {
      if (!crossFill(d.get(c))) continue;
      setCross(c, max);
      layoutNode(d, c);
      max = Math.max(max, cross(d.get(c)));
    }
    d.set(id, H ? { h: max + padCross } : { w: max + padCross });
  }
  const sum = flow.reduce((s, c) => s + main(d.get(c)), 0);
  const total = sum + L.gap * Math.max(0, flow.length - 1);
  if (hugMain) d.set(id, H ? { w: total + padMain } : { h: total + padMain });

  const nn = d.get(id);
  const innerMain = (H ? nn.w : nn.h) - padMain;
  const innerCross = (H ? nn.h : nn.w) - padCross;
  let cur = H ? pl : pt;
  let gap = L.gap;
  if (L.justify === 'between' && flow.length > 1) gap = (innerMain - sum) / (flow.length - 1);
  else if (L.justify === 'center') cur += (innerMain - total) / 2;
  else if (L.justify === 'end') cur += innerMain - total;
  const crossStart = H ? pt : pl;
  for (const c of flow) {
    const k = d.get(c);
    const room = innerCross - cross(k);
    const at = crossStart + (L.align === 'center' ? room / 2 : L.align === 'end' ? room : 0);
    d.set(c, H ? { x: cur, y: at } : { x: at, y: cur });
    cur += main(k) + gap;
  }
  for (const c of n.children) if (!flow.includes(c)) layoutNode(d, c);
}

// Horizontal auto layout with wrap: children flow into rows as wide as the frame.
function wrapRows(d: Draft, id: string, flow: string[]) {
  const n = d.get(id);
  const L = n.layout!;
  const [pt, pr, pb, pl] = L.pad;
  const inner = n.w - pl - pr;
  for (const c of flow) layoutNode(d, c);
  const rows: string[][] = [];
  let row: string[] = [];
  let rowW = 0;
  for (const c of flow) {
    const w = d.get(c).w;
    if (row.length && rowW + L.gap + w > inner + 0.5) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    rowW += (row.length ? L.gap : 0) + w;
    row.push(c);
  }
  if (row.length) rows.push(row);
  let y = pt;
  const rowGap = L.rowGap ?? L.gap;
  for (const r of rows) {
    const rh = Math.max(...r.map((c) => d.get(c).h));
    const used = r.reduce((s, c) => s + d.get(c).w, 0);
    let gap = L.gap;
    let x = pl;
    const free = inner - used - L.gap * (r.length - 1);
    if (L.justify === 'between' && r.length > 1) gap = (inner - used) / (r.length - 1);
    else if (L.justify === 'center') x += free / 2;
    else if (L.justify === 'end') x += free;
    for (const c of r) {
      const k = d.get(c);
      const room = rh - k.h;
      d.set(c, { x, y: y + (L.align === 'center' ? room / 2 : L.align === 'end' ? room : 0) });
      x += k.w + gap;
    }
    y += rh + rowGap;
  }
  if (n.sh === 'hug') d.set(id, { h: (rows.length ? y - rowGap : pt) + pb });
  for (const c of n.children) if (!flow.includes(c)) layoutNode(d, c);
}

/** Lays out the top-level nodes that hold anything this draft touched. */
export function layoutTouched(d: Draft) {
  const tops = new Set<string>();
  for (const id of d.touched) {
    let n = d.get(id);
    while (n && d.get(n.parent) && d.get(n.parent).type !== 'page') n = d.get(n.parent);
    if (n && n.type !== 'page') tops.add(n.id);
  }
  for (const t of tops) layoutNode(d, t);
}

export function layoutAll(d: Draft) {
  for (const p of d.pages) for (const c of d.get(p).children) layoutNode(d, c);
}
