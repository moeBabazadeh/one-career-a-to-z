// Draws nodes onto a 2D canvas: fills, inside strokes, corner radii, shadows, clipping, images
// cropped to cover, and text from the shaper, line by line. Tiny text is greeked into bars the
// way design tools do when zoomed far out, and anything off screen is skipped.

import { canTrack, fontString, textShape } from './autolayout';
import { localMat, mul, rgba, type Box, type Mat, type Node } from './model';

/* ------------------------------------------------------------------ images */

const images = new Map<string, HTMLImageElement>();
const imageWaiters = new Set<() => void>();

export function imageFor(src: string): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => imageWaiters.forEach((f) => f());
    img.src = src;
    images.set(src, img);
  }
  return img.complete && (img.naturalWidth || img.width) ? img : null;
}

export function onImage(fn: () => void) {
  imageWaiters.add(fn);
  return () => {
    imageWaiters.delete(fn);
  };
}

/* ------------------------------------------------------------------ shapes */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (!rr) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shapePath(ctx: CanvasRenderingContext2D, n: Node, inset = 0) {
  if (n.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      n.w / 2,
      n.h / 2,
      Math.max(0, n.w / 2 - inset),
      Math.max(0, n.h / 2 - inset),
      0,
      0,
      Math.PI * 2,
    );
    return;
  }
  roundRect(
    ctx,
    inset,
    inset,
    Math.max(0, n.w - inset * 2),
    Math.max(0, n.h - inset * 2),
    Math.max(0, n.radius - inset),
  );
}

export interface PaintOpts {
  /** Device pixels per world unit, for shadows and greeking. */
  scale: number;
  /** World-space rectangle on screen; anything outside is skipped. */
  view?: Box | null;
  /** Layers not to draw (the text being edited, fixed layers drawn separately). */
  skip?: Set<string> | null;
  /** Layers to draw as fixed (pinned while scrolling): skipped here, drawn by the caller. */
  skipFixed?: boolean;
  /** Tint for images that haven't loaded. */
  placeholder?: string;
}

function setShadow(ctx: CanvasRenderingContext2D, n: Node, o: PaintOpts) {
  const s = n.shadow;
  if (!s) return false;
  ctx.shadowColor = rgba(s.color, s.opacity);
  ctx.shadowBlur = s.blur * o.scale;
  ctx.shadowOffsetX = s.x * o.scale;
  ctx.shadowOffsetY = s.y * o.scale;
  return true;
}

function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Draws a node's own visuals (not its children) in its local space. */
export function paintSelf(ctx: CanvasRenderingContext2D, n: Node, o: PaintOpts) {
  if (n.type === 'text') return paintText(ctx, n, o);
  const shadow = setShadow(ctx, n, o);
  if (n.type === 'image') {
    const img = n.src ? imageFor(n.src) : null;
    shapePath(ctx, n);
    ctx.fillStyle = o.placeholder ?? '#E6E6E6';
    ctx.fill();
    if (shadow) clearShadow(ctx);
    if (img) {
      ctx.save();
      shapePath(ctx, n);
      ctx.clip();
      const iw = img.naturalWidth || img.width || n.w,
        ih = img.naturalHeight || img.height || n.h;
      const k = Math.max(n.w / iw, n.h / ih);
      const sw = n.w / k,
        sh = n.h / k;
      ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, n.w, n.h);
      ctx.restore();
    }
  } else if (n.fill) {
    shapePath(ctx, n);
    ctx.fillStyle = rgba(n.fill.color, n.fill.opacity);
    ctx.fill();
  } else if (shadow) {
    // A shadow needs something to cast it; a transparent fill casts nothing, as in the real tool.
  }
  if (shadow) clearShadow(ctx);
  if (n.stroke && n.stroke.width > 0) {
    shapePath(ctx, n, n.stroke.width / 2);
    ctx.lineWidth = n.stroke.width;
    ctx.strokeStyle = rgba(n.stroke.color, n.stroke.opacity);
    ctx.stroke();
  }
}

function paintText(ctx: CanvasRenderingContext2D, n: Node, o: PaintOpts) {
  const f = n.font;
  if (!f || !n.fill) return;
  const s = textShape(n);
  const color = rgba(n.fill.color, n.fill.opacity);
  ctx.fillStyle = color;
  const top = (l: number) => l * s.lh + (s.lh - (s.asc + s.desc)) / 2;
  const xOf = (w: number) =>
    f.align === 'center' ? (n.w - w) / 2 : f.align === 'right' ? n.w - w : 0;
  if (f.size * o.scale < 3.2) {
    // Greeked: a bar per line, as the text would read from this far away.
    ctx.globalAlpha *= 0.42;
    s.lines.forEach((l, i) => {
      if (l.w > 0)
        ctx.fillRect(xOf(l.w), top(i) + s.asc * 0.3, l.w, Math.max(s.asc * 0.62, 1 / o.scale));
    });
    ctx.globalAlpha /= 0.42;
    return;
  }
  ctx.font = fontString(f);
  if (canTrack)
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${f.tracking}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  s.lines.forEach((l, i) => {
    if (l.text) ctx.fillText(l.text, xOf(l.w), top(i) + s.asc);
  });
  if (canTrack) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
}

/* ------------------------------------------------------------------ trees */

function outside(m: Mat, n: Node, view: Box) {
  // The node's box on the canvas, conservatively: corners through the matrix.
  const xs = [m[4], m[0] * n.w + m[4], m[2] * n.h + m[4], m[0] * n.w + m[2] * n.h + m[4]];
  const ys = [m[5], m[1] * n.w + m[5], m[3] * n.h + m[5], m[1] * n.w + m[3] * n.h + m[5]];
  return (
    Math.max(...xs) < view.x ||
    Math.min(...xs) > view.x + view.w ||
    Math.max(...ys) < view.y ||
    Math.min(...ys) > view.y + view.h
  );
}

/**
 * Draws a node and its children. `world` is the parent's transform in world space; `base` maps
 * world space to device pixels.
 */
export function paintTree(
  ctx: CanvasRenderingContext2D,
  nodes: Record<string, Node>,
  id: string,
  world: Mat,
  base: Mat,
  alpha: number,
  o: PaintOpts,
) {
  const n = nodes[id];
  if (!n || !n.visible || o.skip?.has(id) || (o.skipFixed && n.fixed)) return;
  const m = n.type === 'page' ? world : mul(world, localMat(n));
  const a = alpha * n.opacity;
  if (a <= 0.001) return;
  const culled = o.view && n.type !== 'page' && outside(m, n, o.view);
  if (culled && (n.clip || !n.children.length)) return;
  const full = mul(base, m);
  if (!culled && n.type !== 'page') {
    ctx.setTransform(full[0], full[1], full[2], full[3], full[4], full[5]);
    ctx.globalAlpha = a;
    paintSelf(ctx, n, o);
  }
  if (!n.children.length) return;
  if (n.clip && n.type !== 'page') {
    ctx.save();
    ctx.setTransform(full[0], full[1], full[2], full[3], full[4], full[5]);
    shapePath(ctx, n);
    ctx.clip();
  }
  for (const c of n.children) paintTree(ctx, nodes, c, m, base, a, o);
  if (n.clip && n.type !== 'page') ctx.restore();
}

/** Renders a node on its own into a new canvas, for exports and thumbnails. */
export function rasterize(nodes: Record<string, Node>, id: string, scale: number, bg?: string) {
  const n = nodes[id];
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(n.w * scale));
  canvas.height = Math.max(1, Math.round(n.h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // Draw it at the origin, unturned: its own box is the export.
  const local: Mat = [1, 0, 0, 1, 0, 0];
  const at = { ...nodes, [id]: { ...n, x: 0, y: 0, rot: 0 } };
  paintTree(ctx, at, id, local, [scale, 0, 0, scale, 0, 0], 1, { scale });
  return canvas;
}
