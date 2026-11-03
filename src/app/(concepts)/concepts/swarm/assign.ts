// Who flies to which slot. Two planners: the Hungarian method, which minimises the sum of
// squared distances (the CAPT result: with that cost, drones that leave together and arrive
// together on straight lines never cross paths), and the greedy one, where the closest
// drone-slot pairs are taken first and every drone takes the nearest slot still free.

export type Planner = 'optimal' | 'greedy';

/**
 * Assigns each of `rows` drones to one of `cols` slots (rows <= cols), given a cost matrix in
 * row-major order. Returns the slot per drone.
 */
export function hungarian(cost: Float64Array, rows: number, cols: number): Int32Array {
  const INF = Number.MAX_VALUE;
  const u = new Float64Array(rows + 1);
  const v = new Float64Array(cols + 1);
  const p = new Int32Array(cols + 1);
  const way = new Int32Array(cols + 1);
  const minv = new Float64Array(cols + 1);
  const used = new Uint8Array(cols + 1);
  for (let i = 1; i <= rows; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(INF);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      const row = (i0 - 1) * cols;
      let delta = INF,
        j1 = 0;
      for (let j = 1; j <= cols; j++) {
        if (used[j]) continue;
        const cur = cost[row + j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= cols; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = new Int32Array(rows).fill(-1);
  for (let j = 1; j <= cols; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

/** Closest pairs first: each drone gets the nearest slot that is still free. */
export function greedy(cost: Float64Array, rows: number, cols: number): Int32Array {
  const order = new Uint32Array(rows * cols);
  for (let k = 0; k < order.length; k++) order[k] = k;
  order.sort((a, b) => cost[a] - cost[b]);
  const out = new Int32Array(rows).fill(-1);
  const taken = new Uint8Array(cols);
  let left = rows;
  for (let k = 0; k < order.length && left; k++) {
    const r = Math.floor(order[k] / cols),
      c = order[k] % cols;
    if (out[r] !== -1 || taken[c]) continue;
    out[r] = c;
    taken[c] = 1;
    left--;
  }
  return out;
}

/**
 * Pairs of drones whose straight, synchronised paths pass closer than `radius`: for each pair,
 * the closest approach of (S_i - S_j) + s((G_i - S_i) - (G_j - S_j)) over s in [0, 1].
 */
export function conflicts(
  sx: Float32Array,
  sy: Float32Array,
  sz: Float32Array,
  gx: Float32Array,
  gy: Float32Array,
  gz: Float32Array,
  who: number[],
  radius: number,
) {
  let count = 0;
  const r2 = radius * radius;
  for (let a = 0; a < who.length; a++) {
    const i = who[a];
    for (let b = a + 1; b < who.length; b++) {
      const j = who[b];
      const dx = sx[i] - sx[j],
        dy = sy[i] - sy[j],
        dz = sz[i] - sz[j];
      const ex = gx[i] - sx[i] - (gx[j] - sx[j]),
        ey = gy[i] - sy[i] - (gy[j] - sy[j]),
        ez = gz[i] - sz[i] - (gz[j] - sz[j]);
      const ee = ex * ex + ey * ey + ez * ez;
      const s = ee > 1e-9 ? Math.max(0, Math.min(1, -(dx * ex + dy * ey + dz * ez) / ee)) : 0;
      const cx = dx + ex * s,
        cy = dy + ey * s,
        cz = dz + ez * s;
      if (cx * cx + cy * cy + cz * cz < r2) count++;
    }
  }
  return count;
}
