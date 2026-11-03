// Geometry for the effects. Compiz deforms windows by drawing them as textured meshes; a page
// can't, but CSS can apply any projective transform with matrix3d. So the effects here reduce
// each deformation to quads: a rectangle of the window mapped onto four moving corners.

export type Pt = [number, number];
/** Four corners, clockwise from top left. */
export type Quad = [Pt, Pt, Pt, Pt];
/** A 3 x 3 matrix, row-major. */
type M3 = [number, number, number, number, number, number, number, number, number];

/**
 * The projective map from the unit square onto a quad (Heckbert, "Fundamentals of Texture
 * Mapping", 1989): (0,0), (1,0), (1,1), (0,1) land on the quad's corners in order.
 */
function squareToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad): M3 {
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9)
    return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
  const dx1 = x1 - x2,
    dx2 = x3 - x2,
    dy1 = y1 - y2,
    dy2 = y3 - y2;
  const det = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / det;
  const h = (dx1 * sy - sx * dy1) / det;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

const mul = (a: M3, b: M3): M3 => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
  a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
  a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
  a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
  a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
  a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
  a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];

const css = (m: M3) => {
  const n = (v: number) => (Math.abs(v) < 1e-10 ? 0 : +v.toFixed(10));
  // matrix3d is column-major: the 3 x 3 homography sits in x, y and w, with z left alone.
  return `matrix3d(${n(m[0])},${n(m[3])},0,${n(m[6])},${n(m[1])},${n(m[4])},0,${n(m[7])},0,0,1,0,${n(m[2])},${n(m[5])},0,${n(m[8])})`;
};

/**
 * A matrix3d that maps the band of an element from y0 to y1 (its full width w) onto a quad, in
 * the element's own pixels. Set `transform-origin: 0 0` on the element.
 */
export function bandToQuad(w: number, y0: number, y1: number, quad: Quad) {
  const bh = Math.max(1e-6, y1 - y0);
  return css(mul(squareToQuad(quad), [1 / w, 0, 0, 0, 1 / bh, -y0 / bh, 0, 0, 1]));
}

/** A matrix3d that maps a w x h element onto a quad. */
export const rectToQuad = (w: number, h: number, quad: Quad) => bandToQuad(w, 0, h, quad);

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
