// Parametric low-poly geometry for the models in ./models, and the procedural textures that go
// on them (silkscreen, chip markings, the LCD, nameplates, the section hatch). Every builder
// returns closed solids, so the section caps can be found with the stencil buffer, and bakes
// its colours into vertex colours, so one part is one mesh and one material.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Boss, Hole, Kind, Mat, Shape, V3 } from './models';

/** How each appearance renders. */
export const PBR: Record<
  Mat,
  { color: string; rough: number; metal: number; opacity?: number; glow?: number }
> = {
  shell: { color: '#d5dae0', rough: 0.55, metal: 0 },
  shellWhite: { color: '#f1f1ee', rough: 0.5, metal: 0 },
  shellDark: { color: '#3b4048', rough: 0.6, metal: 0 },
  lens: { color: '#d4e1ee', rough: 0.12, metal: 0, opacity: 0.42 },
  steel: { color: '#b8bec6', rough: 0.34, metal: 0.85 },
  alu: { color: '#a0a8b1', rough: 0.42, metal: 0.75 },
  gold: { color: '#d6a84e', rough: 0.3, metal: 1 },
  copper: { color: '#c87c4a', rough: 0.35, metal: 0.9 },
  pcbGreen: { color: '#1e6a45', rough: 0.45, metal: 0 },
  pcbBlue: { color: '#1f4479', rough: 0.45, metal: 0 },
  pcbBlack: { color: '#202327', rough: 0.45, metal: 0 },
  pcbPurple: { color: '#4e2c70', rough: 0.45, metal: 0 },
  ic: { color: '#25282d', rough: 0.6, metal: 0 },
  ceramic: { color: '#c8b28a', rough: 0.6, metal: 0 },
  rubber: { color: '#1f2226', rough: 0.88, metal: 0 },
  battery: { color: '#2e7db6', rough: 0.4, metal: 0.1 },
  batteryDark: { color: '#2b2f37', rough: 0.45, metal: 0.1 },
  ledRed: { color: '#e5484d', rough: 0.2, metal: 0, glow: 0.7 },
  ledGreen: { color: '#30a46c', rough: 0.2, metal: 0, glow: 0.7 },
  ledAmber: { color: '#f2a541', rough: 0.2, metal: 0, glow: 0.7 },
  ledBlue: { color: '#3a7bd5', rough: 0.2, metal: 0, glow: 0.7 },
  terminal: { color: '#2f8a58', rough: 0.55, metal: 0 },
  orange: { color: '#ef8a2a', rough: 0.5, metal: 0 },
  white: { color: '#f6f6f3', rough: 0.6, metal: 0 },
  zinc: { color: '#c3c8ce', rough: 0.4, metal: 0.8 },
};

const PIN = '#c6ccd3';
const DARK = '#1b1d21';
const GOLD = '#d6a84e';
const STEEL = '#b8bec6';
const GLASS = '#0e1714';

/* ------------------------------------------------------------------ pieces */

type G = THREE.BufferGeometry;

/** A piece in one colour: non-indexed, no UVs, with a colour attribute. */
function paint(g: G, hex: string): G {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r: number, h: number, seg = 24, x = 0, y = 0, z = 0, rTop = r) =>
  new THREE.CylinderGeometry(rTop, r, h, seg).translate(x, y + h / 2, z);
const lathe = (pts: [number, number][], seg = 32) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
const tube = (r: number, ri: number, h: number, seg = 28) =>
  lathe(
    [
      [ri, 0],
      [r, 0],
      [r, h],
      [ri, h],
      [ri, 0],
    ],
    seg,
  );

function rrectPath<T extends THREE.Path>(p: T, w: number, d: number, r: number, cx = 0, cy = 0): T {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
  const x0 = cx - w / 2,
    x1 = cx + w / 2,
    y0 = cy - d / 2,
    y1 = cy + d / 2;
  p.moveTo(x0 + rr, y0);
  p.lineTo(x1 - rr, y0);
  p.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
  p.lineTo(x1, y1 - rr);
  p.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
  p.lineTo(x0 + rr, y1);
  p.absarc(x0 + rr, y1 - rr, rr, Math.PI / 2, Math.PI, false);
  p.lineTo(x0, y0 + rr);
  p.absarc(x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  return p;
}

/** A hole as a path in shape space; `flip` maps model z to shape -y. */
function holePath(h: Hole, sx: number, sy: number): THREE.Path {
  if (h.w && h.d) return rrectPath(new THREE.Path(), h.w, h.d, h.r, sx, sy);
  const p = new THREE.Path();
  p.absarc(sx, sy, h.r, 0, Math.PI * 2, true);
  return p;
}

const EXTRUDE = (depth: number, curveSegments = 12): THREE.ExtrudeGeometryOptions => ({
  depth,
  bevelEnabled: false,
  curveSegments,
});

/** A shape in the model's XZ plane (z as shape -y), extruded up +Y from 0 to `depth`. */
const flat = (shape: THREE.Shape, depth: number, seg?: number) =>
  new THREE.ExtrudeGeometry(shape, EXTRUDE(depth, seg)).rotateX(-Math.PI / 2);

/** A shape in the model's ZY plane (z as shape -x), extruded along +X from 0 to `depth`. */
const side = (shape: THREE.Shape, depth: number) =>
  new THREE.ExtrudeGeometry(shape, EXTRUDE(depth)).rotateY(Math.PI / 2);

function boss(b: Boss, base: number): G {
  return b.hole
    ? tube(b.r, b.hole, b.h).translate(b.x, b.y ?? base, b.z)
    : cyl(b.r, b.h, 24, b.x, b.y ?? base, b.z);
}

function gullWings(n: number, span: number, edge: number, h: number, pw: number): G[] {
  const pitch = span / n;
  const out: G[] = [];
  for (let k = 0; k < n; k++) {
    const t = -span / 2 + pitch * (k + 0.5);
    out.push(
      box(pw, 0.025, 0.08, t, h * 0.35, edge + 0.04),
      box(pw, h * 0.35, 0.025, t, 0, edge + 0.08),
      box(pw, 0.025, 0.12, t, 0, edge + 0.14),
    );
  }
  return out;
}

/** Where a marking decal sits on a part: centre and size of its top face. */
export interface Top {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
}

export interface Built {
  geo: G;
  top?: Top;
}

/** Builds a part's geometry from its shape, coloured with its appearance. */
export function buildShape(shape: Shape, mat: Mat, hexMat?: Mat): Built {
  const main = PBR[mat].color;
  const pieces: G[] = [];
  const add = (g: G, hex = main) => pieces.push(paint(g, hex));
  let top: Top | undefined;

  switch (shape.t) {
    case 'box': {
      const g = shape.r
        ? new RoundedBoxGeometry(shape.w, shape.h, shape.d, 3, shape.r).translate(0, shape.h / 2, 0)
        : box(shape.w, shape.h, shape.d);
      add(g);
      top = { x: 0, y: shape.h, z: 0, w: shape.w, d: shape.d };
      break;
    }
    case 'cyl':
      add(cyl(shape.r, shape.h, shape.seg ?? 32, 0, 0, 0, shape.r2 ?? shape.r));
      break;
    case 'tube':
      add(tube(shape.r, shape.ri, shape.h, 40));
      break;
    case 'tray': {
      const { w, d, h, wall, r } = shape;
      const floor = rrectPath(new THREE.Shape(), w, d, r);
      for (const hole of shape.holes ?? []) floor.holes.push(holePath(hole, hole.x, -hole.z));
      add(flat(floor, wall));
      const ring = rrectPath(new THREE.Shape(), w, d, r);
      ring.holes.push(
        rrectPath(new THREE.Path(), w - wall * 2, d - wall * 2, Math.max(0.05, r - wall)),
      );
      add(flat(ring, h));
      for (const b of shape.bosses ?? []) add(boss(b, wall));
      break;
    }
    case 'ptray': {
      const { outer, inner, depth, wall, end } = shape;
      const poly = (pts: [number, number][], p: THREE.Path) => {
        pts.forEach(([z, y], i) => (i ? p.lineTo(-z, y) : p.moveTo(-z, y)));
        p.closePath();
        return p;
      };
      const floor = poly(outer, new THREE.Shape()) as THREE.Shape;
      for (const hole of shape.holes ?? []) floor.holes.push(holePath(hole, -hole.x, hole.z));
      add(side(floor, wall).translate(end ? depth - wall : 0, 0, 0));
      const ring = poly(outer, new THREE.Shape()) as THREE.Shape;
      ring.holes.push(poly(inner, new THREE.Path()));
      add(side(ring, depth));
      for (const b of shape.bosses ?? []) {
        const g = (b.hole ? tube(b.r, b.hole, b.h) : cyl(b.r, b.h)).rotateZ(-Math.PI / 2);
        add(g.translate(end ? depth - wall - b.h : wall, b.z, b.x));
      }
      break;
    }
    case 'board': {
      const { w, d, th } = shape;
      let s: THREE.Shape;
      if (shape.round) {
        s = new THREE.Shape();
        s.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
      } else if (shape.outline) {
        s = new THREE.Shape();
        shape.outline.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
        s.closePath();
      } else s = rrectPath(new THREE.Shape(), w, d, shape.r ?? 0.05);
      for (const hole of shape.holes ?? []) s.holes.push(holePath(hole, hole.x, -hole.z));
      add(flat(s, th, shape.round ? 72 : 12));
      top = { x: 0, y: th, z: 0, w, d };
      break;
    }
    case 'lathe': {
      add(lathe(shape.pts, shape.seg ?? 32));
      if (shape.hex) add(lathe(shape.hex, 6), PBR[shape.hexMat ?? hexMat ?? mat].color);
      for (const b of shape.bosses ?? []) add(boss(b, 0));
      break;
    }
    case 'qfp': {
      const { w, h, pins } = shape;
      const so = 0.03;
      add(box(w, h, w, 0, so, 0));
      const n = pins / 4;
      const pw = ((w * 0.82) / n) * 0.45;
      for (let s = 0; s < 4; s++)
        for (const g of gullWings(n, w * 0.82, w / 2, h + so, pw))
          add(g.rotateY((s * Math.PI) / 2), PIN);
      top = { x: 0, y: h + so, z: 0, w, d: w };
      break;
    }
    case 'qfn': {
      const { w, h } = shape;
      add(box(w, h, w, 0, 0.004, 0));
      const n = 8;
      const pitch = (w * 0.8) / n;
      for (let s = 0; s < 4; s++)
        for (let k = 0; k < n; k++)
          add(
            box(pitch * 0.5, 0.03, 0.09, -w * 0.4 + pitch * (k + 0.5), 0, w / 2 - 0.035).rotateY(
              (s * Math.PI) / 2,
            ),
            PIN,
          );
      top = { x: 0, y: h + 0.004, z: 0, w, d: w };
      break;
    }
    case 'soic': {
      const { w, d, h, pins } = shape;
      add(box(w, h, d, 0, 0.03, 0));
      const n = Math.max(1, pins / 2);
      const pw = ((d * 0.8) / n) * 0.45;
      for (const s of [Math.PI / 2, -Math.PI / 2])
        for (const g of gullWings(n, d * 0.8, w / 2, h + 0.03, pw)) add(g.rotateY(s), PIN);
      top = { x: 0, y: h + 0.03, z: 0, w, d };
      break;
    }
    case 'dpak': {
      const { w, d, h } = shape;
      add(box(w, h, d * 0.72, 0, 0.02, d * 0.14));
      add(box(w * 0.86, 0.04, d * 0.34, 0, 0, -d * 0.33), STEEL);
      for (const x of [-w * 0.3, w * 0.3]) add(box(0.08, 0.03, d * 0.3, x, 0, d * 0.55), PIN);
      break;
    }
    case 'module': {
      const { w, d, shield } = shape;
      const [sw, sd, sh] = shield;
      add(box(w, 0.1, d));
      const sz = d / 2 - sd / 2 - 0.08;
      add(box(sw, sh, sd, 0, 0.1, sz), STEEL);
      const n = Math.floor(d / 0.22);
      for (let k = 0; k < n; k++)
        for (const x of [-w / 2 + 0.03, w / 2 - 0.03])
          add(box(0.07, 0.11, 0.09, x, 0, -d / 2 + 0.16 + k * 0.22), GOLD);
      if (shape.antenna) {
        const az = -d / 2 + 0.35;
        for (let k = 0; k < 6; k++)
          add(box(0.06, 0.02, 0.42, -w * 0.32 + k * 0.22, 0.1, az + (k % 2 ? 0.06 : 0)), GOLD);
        for (let k = 0; k < 5; k++)
          add(
            box(0.28, 0.02, 0.06, -w * 0.32 + 0.11 + k * 0.22, 0.1, az + (k % 2 ? -0.18 : 0.24)),
            GOLD,
          );
      }
      top = { x: 0, y: 0.1 + sh, z: sz, w: sw, d: sd };
      break;
    }
    case 'coil': {
      const { w, d, turns, pitch, trace } = shape;
      for (let k = 0; k < turns; k++) {
        const iw = w - k * pitch * 2;
        const id = d - k * pitch * 2;
        add(box(iw, 0.03, trace, 0, 0, -id / 2 + trace / 2));
        add(box(iw, 0.03, trace, 0, 0, id / 2 - trace / 2));
        add(box(trace, 0.03, id - trace * 2, -iw / 2 + trace / 2, 0, 0));
        add(box(trace, 0.03, id - trace * 2, iw / 2 - trace / 2, 0, 0));
      }
      add(cyl(0.09, 0.035, 16, -w / 2 + trace / 2, 0, d / 2 + 0.12), GOLD);
      add(cyl(0.09, 0.035, 16, -w / 2 + turns * pitch, 0, d / 2 - turns * pitch + 0.1), GOLD);
      break;
    }
    case 'meander': {
      const { w, d, n, trace } = shape;
      const step = w / n;
      for (let k = 0; k <= n; k++) add(box(trace, 0.03, d, -w / 2 + k * step, 0, 0));
      for (let k = 0; k < n; k++)
        add(
          box(
            step + trace,
            0.03,
            trace,
            -w / 2 + (k + 0.5) * step,
            0,
            (k % 2 ? 1 : -1) * (d / 2 - trace / 2),
          ),
        );
      add(box(trace, 0.03, 0.4, -w / 2, 0, d / 2 + 0.2));
      break;
    }
    case 'screw': {
      const { head, hh, r, len } = shape;
      add(
        lathe(
          [
            [0, -len],
            [r * 0.5, -len],
            [r, -len + r * 0.9],
            [r, 0],
            [head, 0],
            [head, hh * 0.55],
            [head * 0.8, hh],
            [0, hh],
          ],
          24,
        ),
      );
      add(cyl(head * 0.42, 0.012, 6, 0, hh - 0.004, 0), DARK);
      break;
    }
    case 'terminal': {
      const { n, pitch, h, d } = shape;
      const w = n * pitch;
      add(box(w, h, d));
      for (let k = 0; k < n; k++) {
        const x = -w / 2 + pitch * (k + 0.5);
        add(cyl(pitch * 0.3, 0.05, 16, x, h, -d * 0.15), STEEL);
        add(box(pitch * 0.42, 0.016, 0.05, x, h + 0.05, -d * 0.15), DARK);
        add(box(pitch * 0.56, h * 0.42, 0.02, x, h * 0.18, d / 2), DARK);
      }
      top = { x: 0, y: h, z: 0, w, d };
      break;
    }
    case 'header': {
      const { n, pitch } = shape;
      const w = n * pitch;
      add(box(w, 0.1, pitch));
      for (let k = 0; k < n; k++) add(box(0.06, 0.6, 0.06, -w / 2 + pitch * (k + 0.5), 0, 0), GOLD);
      break;
    }
    case 'ring': {
      const { w, d, r, band, th } = shape;
      const s = rrectPath(new THREE.Shape(), w, d, r);
      s.holes.push(
        rrectPath(new THREE.Path(), w - band * 2, d - band * 2, Math.max(0.05, r - band)),
      );
      add(flat(s, th));
      break;
    }
    case 'extrudeX': {
      const s = new THREE.Shape();
      shape.outline.forEach(([z, y], i) => (i ? s.lineTo(-z, y) : s.moveTo(-z, y)));
      s.closePath();
      for (const hole of shape.holes ?? []) s.holes.push(holePath(hole, -hole.x, hole.z));
      add(side(s, shape.len).translate(-shape.len / 2, 0, 0));
      break;
    }
    case 'tact': {
      const { s, h } = shape;
      add(box(s, h * 0.5, s));
      add(cyl(s * 0.27, h * 0.5, 20, 0, h * 0.5, 0), DARK);
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        add(box(0.08, 0.03, 0.12, x * (s / 2 + 0.04), 0, z * s * 0.3), PIN);
      break;
    }
    case 'ecap': {
      const { r, h } = shape;
      add(cyl(r, h * 0.96, 28));
      add(cyl(r * 0.92, h * 0.04, 28, 0, h * 0.96, 0), STEEL);
      add(box(r * 1.2, 0.012, 0.03, 0, h, 0), DARK);
      add(box(0.03, 0.012, r * 1.2, 0, h, 0), DARK);
      add(box(r * 0.25, h * 0.9, 0.012, -r * 0.55, 0.04, r * 0.82 + 0.006), '#c9ced6');
      break;
    }
    case 'led': {
      const { w, d, h } = shape;
      add(box(w, h * 0.55, d), '#ecebe6');
      add(box(w * 0.78, h * 0.45, d * 0.78, 0, h * 0.55, 0));
      break;
    }
    case 'chip': {
      const { w, d, h } = shape;
      add(box(w * 0.68, h, d));
      add(box(w * 0.16, h, d, -w / 2 + w * 0.08, 0, 0), STEEL);
      add(box(w * 0.16, h, d, w / 2 - w * 0.08, 0, 0), STEEL);
      break;
    }
    case 'lcd': {
      const { w, d, h } = shape;
      add(box(w, h * 0.8, d));
      add(box(w * 0.94, h * 0.2, d * 0.84, 0, h * 0.8, 0), GLASS);
      add(box(w * 0.3, 0.06, 0.3, 0, 0, -d / 2 - 0.15), '#c88a3a');
      top = { x: 0, y: h, z: 0, w: w * 0.9, d: d * 0.78 };
      break;
    }
    case 'sim': {
      const { w, d, h } = shape;
      add(box(w, h, d));
      add(box(w * 0.82, 0.02, d * 0.72, 0, h, d * 0.06), '#e9e7df');
      add(box(w * 0.3, 0.022, d * 0.3, -w * 0.15, h, d * 0.08), GOLD);
      for (const z of [-d * 0.38, d * 0.42]) add(box(w, 0.03, 0.06, 0, h, z));
      break;
    }
    case 'valve': {
      const { r, h } = shape;
      add(box(r * 2 + 0.3, 0.16, r * 2 - 0.1), STEEL);
      add(cyl(r * 1.02, 0.12, 32, 0, 0.16, 0), STEEL);
      add(cyl(r, h - 0.24, 32, 0, 0.28, 0));
      add(cyl(r * 1.02, 0.12, 32, 0, h + 0.04, 0), STEEL);
      add(cyl(r * 0.32, h * 0.42, 24, 0, h + 0.16, 0), STEEL);
      add(cyl(r * 0.46, 0.14, 6, 0, h + 0.16 + h * 0.42, 0), STEEL);
      add(box(0.5, 0.8, 0.9, r + 0.22, h * 0.32, 0), DARK);
      break;
    }
    case 'sensor': {
      const { r, h } = shape;
      add(
        lathe(
          [
            [0, 0],
            [r * 1.3, 0],
            [r * 1.3, 0.34],
            [0, 0.34],
          ],
          6,
        ),
      );
      add(cyl(r, h, 28, 0, 0.34, 0));
      add(cyl(r * 0.85, 0.5, 24, 0, 0.34 + h, 0), DARK);
      add(cyl(r * 0.5, 0.25, 16, 0, 0.84 + h, 0), DARK);
      break;
    }
    case 'relay': {
      const { w, d, h } = shape;
      add(new RoundedBoxGeometry(w, h, d, 2, 0.06).translate(0, h / 2, 0));
      top = { x: 0, y: h, z: 0, w, d };
      break;
    }
    case 'strap': {
      const { w, h, d } = shape;
      const t = 0.08;
      add(box(w, t, d));
      add(box(w, t, d, 0, h - t, 0));
      add(box(w, h, t, 0, 0, d / 2));
      break;
    }
  }

  const merged = pieces.length === 1 ? pieces[0] : (mergeGeometries(pieces) as G);
  if (pieces.length > 1) pieces.forEach((p) => p.dispose());
  const geo = toCreasedNormals(merged, 0.62);
  if (geo !== merged) merged.dispose();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, ...(top ? { top } : {}) };
}

/** A part's footprint on its board (x and z extents), for the silkscreen. */
export function footprint(shape: Shape): [number, number] {
  switch (shape.t) {
    case 'box':
    case 'chip':
    case 'dpak':
    case 'sim':
    case 'lcd':
    case 'relay':
    case 'soic':
    case 'led':
      return [shape.w + (shape.t === 'soic' ? 0.4 : 0), shape.d];
    case 'module':
    case 'coil':
    case 'meander':
      return [shape.w, shape.d];
    case 'qfp':
      return [shape.w + 0.4, shape.w + 0.4];
    case 'qfn':
      return [shape.w + 0.1, shape.w + 0.1];
    case 'terminal':
      return [shape.n * shape.pitch, shape.d];
    case 'header':
      return [shape.n * shape.pitch, shape.pitch];
    case 'tact':
      return [shape.s + 0.16, shape.s];
    case 'ecap':
    case 'tube':
      return [shape.r * 2, shape.r * 2];
    case 'lathe': {
      const r = Math.max(...shape.pts.map((p) => p[0]));
      return [r * 2, r * 2];
    }
    default:
      return [0.4, 0.4];
  }
}

/* ------------------------------------------------------------------ mass properties */

export interface Mass {
  volume: number;
  area: number;
  tris: number;
}

/** Volume (divergence theorem over signed tetrahedra) and surface area of a closed mesh. */
export function massOf(geo: G): Mass {
  const pos = geo.getAttribute('position');
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3();
  let volume = 0,
    area = 0;
  const tris = pos.count / 3;
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    volume += a.dot(ab.copy(b).cross(c)) / 6;
    area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
  }
  return { volume: Math.abs(volume), area, tris };
}

/** The distinct vertex positions of a geometry, for snapping. */
export function cornersOf(geo: G): Float32Array {
  const pos = geo.getAttribute('position');
  const seen = new Set<string>();
  const out: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x, y, z);
  }
  return new Float32Array(out);
}

/* ------------------------------------------------------------------ textures */

export interface Fonts {
  mono: string;
  sans: string;
}

function canvas(w: number, h: number) {
  const el = document.createElement('canvas');
  el.width = Math.max(4, Math.round(w));
  el.height = Math.max(4, Math.round(h));
  return [el, el.getContext('2d') as CanvasRenderingContext2D] as const;
}

function texture(el: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A seeded generator for texture detail, so every load draws the same board. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export const hashOf = (text: string) =>
  [...text].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;

/** Laser marking on a package top: the chip's name, and the pin-1 dot. */
export function markTexture(text: string, w: number, d: number, fonts: Fonts, onMetal: boolean) {
  const px = 320;
  const [el, ctx] = canvas(px, (px * d) / w);
  const ink = onMetal ? 'rgba(48,52,58,0.85)' : 'rgba(214,218,224,0.86)';
  const dot = Math.min(el.width, el.height) * 0.07;
  ctx.fillStyle = onMetal ? 'rgba(48,52,58,0.5)' : 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(dot * 2.2, dot * 2.2, dot, 0, Math.PI * 2);
  ctx.fill();
  if (text) {
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = el.height * 0.3;
    ctx.font = `600 ${size}px ${fonts.mono}`;
    const room = el.width * 0.8;
    const m = ctx.measureText(text).width;
    if (m > room) size *= room / m;
    ctx.font = `600 ${size}px ${fonts.mono}`;
    ctx.fillText(text, el.width / 2, el.height / 2);
  }
  return texture(el);
}

export interface BoardPart {
  ref?: string;
  x: number;
  z: number;
  w: number;
  d: number;
  kind: Kind;
  hub: boolean;
}

export interface BoardArt {
  w: number;
  d: number;
  round?: boolean;
  r?: number;
  outline?: [number, number][];
  holes?: Hole[];
  parts: BoardPart[];
  tag: string;
  spin: number;
  seed: number;
  fonts: Fonts;
}

/** Silkscreen, traces, pads, vias and fiducials for a board, in its own frame (canvas y is board z). */
export function boardTexture(art: BoardArt) {
  const { w, d } = art;
  const ppu = Math.min(150, 1400 / Math.max(w, d));
  const [el, ctx] = canvas(w * ppu, d * ppu);
  const X = (x: number) => (x + w / 2) * ppu;
  const Z = (z: number) => (z + d / 2) * ppu;
  const rand = rng(art.seed);

  const outline = () => {
    ctx.beginPath();
    if (art.round) ctx.arc(X(0), Z(0), (w / 2) * ppu, 0, Math.PI * 2);
    else if (art.outline)
      art.outline.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    else ctx.roundRect(0, 0, el.width, el.height, (art.r ?? 0) * ppu);
    ctx.closePath();
  };

  ctx.save();
  outline();
  ctx.clip();

  // Copper under the mask reads as faintly lighter: a ground pour, then traces.
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  ctx.fillRect(0, 0, el.width, el.height);
  const hubs = art.parts.filter((p) => p.hub);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const vias: [number, number][] = [];
  for (const p of art.parts) {
    if (p.hub || !hubs.length) continue;
    const hub = hubs.reduce((best, h) =>
      Math.hypot(h.x - p.x, h.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? h : best,
    );
    const tx = Math.max(hub.x - hub.w / 2, Math.min(hub.x + hub.w / 2, p.x));
    const tz = Math.max(hub.z - hub.d / 2, Math.min(hub.z + hub.d / 2, p.z));
    const dx = tx - p.x,
      dz = tz - p.z;
    const c = Math.min(Math.abs(dx), Math.abs(dz), 0.25);
    ctx.lineWidth = (0.035 + rand() * 0.03) * ppu;
    ctx.beginPath();
    ctx.moveTo(X(p.x), Z(p.z));
    ctx.lineTo(X(p.x), Z(tz - Math.sign(dz) * c));
    ctx.lineTo(X(p.x + Math.sign(dx) * c), Z(tz));
    ctx.lineTo(X(tx), Z(tz));
    ctx.stroke();
    if (rand() < 0.5) vias.push([p.x, tz - Math.sign(dz) * c]);
  }
  // A few buses between the big parts.
  for (let i = 0; i < hubs.length; i++)
    for (let j = i + 1; j < hubs.length; j++) {
      const a = hubs[i],
        b = hubs[j];
      const lanes = 3 + Math.floor(rand() * 4);
      ctx.lineWidth = 0.04 * ppu;
      for (let k = 0; k < lanes; k++) {
        const o = (k - lanes / 2) * 0.1;
        ctx.beginPath();
        ctx.moveTo(X(a.x), Z(a.z + o));
        const mx = (a.x + b.x) / 2 + o;
        ctx.lineTo(X(mx - Math.abs(b.z - a.z) * 0.2), Z(a.z + o));
        ctx.lineTo(X(mx), Z(b.z + o));
        ctx.lineTo(X(b.x), Z(b.z + o));
        ctx.stroke();
      }
      vias.push([(a.x + b.x) / 2, (a.z + b.z) / 2]);
    }
  for (let i = 0; i < 26; i++) vias.push([(rand() - 0.5) * w * 0.9, (rand() - 0.5) * d * 0.9]);

  // Pads under the small parts.
  ctx.fillStyle = '#cfa457';
  for (const p of art.parts) {
    if (p.kind === 'passive' || p.kind === 'indicator') {
      const pw = p.w * 0.32,
        pd = p.d * 1.25;
      ctx.fillRect(X(p.x - p.w / 2 - 0.03), Z(p.z - pd / 2), pw * ppu, pd * ppu);
      ctx.fillRect(X(p.x + p.w / 2 + 0.03) - pw * ppu, Z(p.z - pd / 2), pw * ppu, pd * ppu);
    }
  }
  for (const [x, z] of vias) {
    ctx.fillStyle = '#c99d50';
    ctx.beginPath();
    ctx.arc(X(x), Z(z), 0.055 * ppu, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,12,14,0.85)';
    ctx.beginPath();
    ctx.arc(X(x), Z(z), 0.025 * ppu, 0, Math.PI * 2);
    ctx.fill();
  }

  // Silkscreen: outlines, designators, pin-1 marks, the board's tag and fiducials.
  ctx.strokeStyle = 'rgba(244,244,238,0.9)';
  ctx.fillStyle = 'rgba(244,244,238,0.92)';
  ctx.lineWidth = 0.022 * ppu;
  const label = (
    text: string,
    x: number,
    z: number,
    size: number,
    align: CanvasTextAlign = 'center',
  ) => {
    ctx.save();
    ctx.translate(X(x), Z(z));
    ctx.rotate(art.spin);
    ctx.font = `600 ${size * ppu}px ${art.fonts.mono}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  for (const p of art.parts) {
    const big =
      p.kind === 'ic' ||
      p.kind === 'module' ||
      p.kind === 'connector' ||
      p.kind === 'display' ||
      p.kind === 'switch' ||
      p.kind === 'power';
    if (big) {
      ctx.strokeRect(
        X(p.x - p.w / 2 - 0.07),
        Z(p.z - p.d / 2 - 0.07),
        (p.w + 0.14) * ppu,
        (p.d + 0.14) * ppu,
      );
      if (p.kind === 'ic') {
        ctx.beginPath();
        ctx.arc(X(p.x - p.w / 2 - 0.16), Z(p.z - p.d / 2 - 0.16), 0.045 * ppu, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (p.ref && (big || p.kind === 'indicator' || p.kind === 'rf' || p.kind === 'passive')) {
      const size = big ? 0.2 : 0.13;
      label(p.ref, p.x, p.z - p.d / 2 - (big ? 0.24 : 0.14), size);
    }
  }
  label(art.tag, -w / 2 + 0.35, d / 2 - 0.35, 0.26, 'left');
  for (const [x, z] of [
    [w / 2 - 0.4, -d / 2 + 0.4],
    [-w / 2 + 0.4, -d / 2 + 0.75],
  ]) {
    ctx.fillStyle = '#d8ad5e';
    ctx.beginPath();
    ctx.arc(X(x), Z(z), 0.07 * ppu, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(X(x), Z(z), 0.16 * ppu, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Plated mounting holes, then the holes themselves.
  for (const h of art.holes ?? []) {
    ctx.fillStyle = '#d0a659';
    ctx.beginPath();
    ctx.arc(X(h.x), Z(h.z), (h.r + 0.12) * ppu, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (const h of art.holes ?? []) {
    ctx.beginPath();
    ctx.arc(X(h.x), Z(h.z), h.r * ppu, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return texture(el);
}

/** The controller's screen: a decorative, seeded readout with no units and no claims. */
export function lcdTexture(tag: string, fonts: Fonts, seed: number) {
  const [el, ctx] = canvas(560, 316);
  const rand = rng(seed);
  const ink = '#a8f0cf';
  const dim = 'rgba(168,240,207,0.35)';
  ctx.fillStyle = '#0d1d17';
  ctx.fillRect(0, 0, el.width, el.height);
  ctx.fillStyle = ink;
  ctx.font = `600 26px ${fonts.mono}`;
  ctx.textBaseline = 'top';
  ctx.fillText(tag, 24, 18);
  ctx.textAlign = 'right';
  ctx.fillText('RUN', el.width - 24, 18);
  ctx.fillRect(24, 56, el.width - 48, 2);
  const sp = 1 + Math.floor(rand() * 400) / 100;
  const pv = sp + (rand() - 0.5) * 0.04;
  ctx.textAlign = 'left';
  ctx.font = `600 22px ${fonts.mono}`;
  ctx.fillStyle = dim;
  ctx.fillText('PV', 24, 84);
  ctx.fillText('SP', 24, 206);
  ctx.fillStyle = ink;
  ctx.font = `700 92px ${fonts.mono}`;
  ctx.fillText(pv.toFixed(2), 74, 70);
  ctx.font = `600 40px ${fonts.mono}`;
  ctx.fillText(sp.toFixed(2), 74, 198);
  const bars = 16;
  for (let i = 0; i < bars; i++) {
    const h = 10 + i * 5;
    ctx.fillStyle = i < bars * 0.62 ? ink : dim;
    ctx.fillRect(330 + i * 13, 280 - h, 9, h);
  }
  return texture(el);
}

/** A printed label: the tag big, then the name and kind. */
export function plateTexture(
  lines: string[],
  wU: number,
  hU: number,
  fonts: Fonts,
  vertical = false,
) {
  const scale = 140;
  const [el, ctx] = canvas(wU * scale, hU * scale);
  ctx.fillStyle = '#f6f6f3';
  ctx.fillRect(0, 0, el.width, el.height);
  ctx.save();
  let W = el.width,
    H = el.height;
  if (vertical) {
    ctx.translate(0, el.height);
    ctx.rotate(-Math.PI / 2);
    [W, H] = [H, W];
  }
  ctx.strokeStyle = '#1b1f26';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = '#1b1f26';
  ctx.textBaseline = 'middle';
  const pad = 26;
  const room = W - pad * 2;
  const fit = (text: string, weight: number, size: number, font: string) => {
    ctx.font = `${weight} ${size}px ${font}`;
    const m = ctx.measureText(text).width;
    if (m > room) ctx.font = `${weight} ${(size * room) / m}px ${font}`;
  };
  if (lines.length > 2) {
    // Wide plate: the tag in its own column, name and kind stacked beside it.
    const split = W * 0.4;
    ctx.font = `700 ${H * 0.4}px ${fonts.mono}`;
    const m = ctx.measureText(lines[0]).width;
    if (m > split - pad * 1.5)
      ctx.font = `700 ${(H * 0.4 * (split - pad * 1.5)) / m}px ${fonts.mono}`;
    ctx.fillText(lines[0], pad, H / 2);
    ctx.fillRect(split, H * 0.22, 3, H * 0.56);
    const right = (text: string, weight: number, size: number, y: number) => {
      ctx.font = `${weight} ${size}px ${fonts.sans}`;
      const room2 = W - split - pad * 2;
      const w2 = ctx.measureText(text).width;
      if (w2 > room2) ctx.font = `${weight} ${(size * room2) / w2}px ${fonts.sans}`;
      ctx.fillText(text, split + pad, y);
    };
    right(lines[1], 700, H * 0.26, H * 0.38);
    right(lines[2], 500, H * 0.17, H * 0.66);
  } else {
    lines.forEach((text, i) => {
      const big = i === 0;
      fit(text, big ? 700 : 600, big ? H * 0.36 : H * 0.24, big ? fonts.mono : fonts.sans);
      ctx.fillText(text, pad, H * [0.38, 0.72][i]);
    });
  }
  ctx.restore();
  return texture(el);
}

/** The section hatch: diagonal lines, multiplied into each part's cap colour. */
export function hatchTexture() {
  const [el, ctx] = canvas(64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#7d828a';
  ctx.lineWidth = 5;
  for (let k = -64; k <= 128; k += 32) {
    ctx.beginPath();
    ctx.moveTo(k, 64);
    ctx.lineTo(k + 64, 0);
    ctx.stroke();
  }
  const t = texture(el);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A soft contact shadow under the model. */
export function shadowTexture() {
  const [el, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return texture(el);
}

export const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
