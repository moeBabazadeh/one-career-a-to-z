// Topics and messages. Each topic has a type and a nominal rate; messages are plain objects in
// the shape of their standard robotics message types, so the inspector can print them the way
// a command-line echo would. Rates and bandwidth are measured from what was actually received,
// over a sliding window, like a topic rate meter: nothing here is a typed-in number for show.
import type { PathPoint } from './world';
import { cast2d, cast3d, GRID, grid } from './world';
import type { Quad, Rover, Sim } from './sim';

export interface TopicDef {
  name: string;
  type: string;
  /** Nominal publish rate in Hz; absent for topics published on events. */
  rate?: number;
  latched?: boolean;
}

export const TOPICS: TopicDef[] = [
  { name: '/camera/image_raw', type: 'sensor_msgs/Image', rate: 15 },
  { name: '/chapter', type: 'std_msgs/String' },
  { name: '/clicked_point', type: 'geometry_msgs/PointStamped' },
  { name: '/cmd_vel', type: 'geometry_msgs/Twist', rate: 20 },
  { name: '/goal_pose', type: 'geometry_msgs/PoseStamped' },
  { name: '/imu', type: 'sensor_msgs/Imu', rate: 100 },
  { name: '/map', type: 'nav_msgs/OccupancyGrid', latched: true },
  { name: '/markers', type: 'visualization_msgs/MarkerArray', rate: 2 },
  { name: '/odom', type: 'nav_msgs/Odometry', rate: 50 },
  { name: '/plan', type: 'nav_msgs/Path' },
  { name: '/points', type: 'sensor_msgs/PointCloud2', rate: 5 },
  { name: '/quad/setpoint', type: 'geometry_msgs/PoseStamped' },
  { name: '/scan', type: 'sensor_msgs/LaserScan', rate: 10 },
  { name: '/ssl/vision', type: 'ssl_msgs/DetectionFrame', rate: 60 },
  { name: '/tf', type: 'tf2_msgs/TFMessage', rate: 50 },
  { name: '/tf_static', type: 'tf2_msgs/TFMessage', latched: true },
];

export type TopicName = (typeof TOPICS)[number]['name'];

/* ------------------------------------------------------------------ maths */

export type Quat = [number, number, number, number];

/** Roll, pitch, yaw (ZYX) to a quaternion [x, y, z, w]. */
export function quat(roll: number, pitch: number, yaw: number): Quat {
  const cr = Math.cos(roll / 2);
  const sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ];
}

/** Rotates a world vector into a body frame given by roll, pitch, yaw: Rᵀ v. */
export function toBody(
  v: [number, number, number],
  roll: number,
  pitch: number,
  yaw: number,
): [number, number, number] {
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  // Columns of R (ZYX) are the body axes in the world.
  const xb = [cy * cp, sy * cp, -sp];
  const yb = [cy * sp * sr - sy * cr, sy * sp * sr + cy * cr, cp * sr];
  const zb = [cy * sp * cr + sy * sr, sy * sp * cr - cy * sr, cp * cr];
  const dot = (a: number[]) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  return [dot(xb), dot(yb), dot(zb)];
}

/* ------------------------------------------------------------------ messages */

const stamp = (t: number) => ({ secs: Math.floor(t), nsecs: Math.round((t % 1) * 1e9) });
export const header = (seq: number, t: number, frame: string) => ({
  seq,
  stamp: stamp(t),
  frame_id: frame,
});
const xyz = (x: number, y: number, z: number) => ({ x, y, z });
const q4 = (q: Quat) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
const HEADER_BYTES = 16;

/** A byte payload too long to print, shown by its length the way an echo with arrays hidden would. */
export interface Bytes {
  bytes: number;
  dtype: string;
}
const bytes = (n: number, dtype = 'uint8'): Bytes => ({ bytes: n, dtype });

const diag = (n: number, v: number) =>
  Array.from({ length: n * n }, (_, i) => (i % (n + 1) ? 0 : v));

export function imuMsg(q: Quad, seq: number, t: number, noise: () => number) {
  const f = toBody(q.f, q.roll, q.pitch, q.yaw);
  return {
    msg: {
      header: header(seq, t, 'quad/imu_link'),
      orientation: q4(
        quat(q.roll + noise() * 0.001, q.pitch + noise() * 0.001, q.yaw + noise() * 0.002),
      ),
      orientation_covariance: diag(3, 0.0025),
      angular_velocity: xyz(
        q.p + 0.0021 + noise() * 0.004,
        q.q - 0.0013 + noise() * 0.004,
        q.r + 0.0008 + noise() * 0.004,
      ),
      angular_velocity_covariance: diag(3, 0.000016),
      linear_acceleration: xyz(
        f[0] + noise() * 0.035,
        f[1] + noise() * 0.035,
        f[2] + noise() * 0.035,
      ),
      linear_acceleration_covariance: diag(3, 0.0012),
    },
    bytes: HEADER_BYTES + 14 + 4 * 8 + 3 * 9 * 8 + 2 * 3 * 8,
  };
}

export function odomMsg(r: Rover, seq: number, t: number) {
  const dist = Math.hypot(r.ox - r.x, r.oy - r.y);
  const cov = Array.from({ length: 36 }, (_, i) =>
    i % 7 ? 0 : i < 14 ? 0.001 + dist * 0.02 : i === 35 ? 0.002 + dist * 0.01 : 1e6,
  );
  return {
    msg: {
      header: header(seq, t, 'odom'),
      child_frame_id: 'base_link',
      pose: {
        pose: { position: xyz(r.ox, r.oy, 0), orientation: q4(quat(0, 0, r.oth)) },
        covariance: cov,
      },
      twist: {
        twist: { linear: xyz(r.v * 1.012, 0, 0), angular: xyz(0, 0, r.w * 0.988) },
        covariance: diag(6, 0.001),
      },
    },
    bytes: HEADER_BYTES + 4 + 13 + 7 * 8 + 36 * 8 + 6 * 8 + 36 * 8,
  };
}

export const SCAN = {
  n: 360,
  min: -Math.PI,
  inc: (2 * Math.PI) / 360,
  rmin: 0.12,
  rmax: 6,
  z: 0.19,
  x: 0.02,
};

/** A 360° planar scan from the rover's lidar: one ray per degree against the arena. */
export function scan(r: Rover, noise: () => number) {
  const ranges = new Float32Array(SCAN.n);
  const intensities = new Float32Array(SCAN.n);
  const ox = r.x + SCAN.x * Math.cos(r.th);
  const oy = r.y + SCAN.x * Math.sin(r.th);
  for (let i = 0; i < SCAN.n; i++) {
    const a = r.th + SCAN.min + i * SCAN.inc;
    const d = cast2d(ox, oy, Math.cos(a), Math.sin(a), SCAN.z);
    const m = d + noise() * 0.008;
    ranges[i] = m > SCAN.rmax || m < SCAN.rmin ? Infinity : m;
    intensities[i] = Number.isFinite(ranges[i])
      ? Math.max(0, 2400 / (1 + m * m) + noise() * 40)
      : 0;
  }
  return { ranges, intensities, ox, oy };
}

export function scanMsg(
  s: { ranges: Float32Array; intensities: Float32Array },
  seq: number,
  t: number,
) {
  return {
    msg: {
      header: header(seq, t, 'laser'),
      angle_min: SCAN.min,
      angle_max: SCAN.min + (SCAN.n - 1) * SCAN.inc,
      angle_increment: SCAN.inc,
      time_increment: 0.1 / SCAN.n,
      scan_time: 0.1,
      range_min: SCAN.rmin,
      range_max: SCAN.rmax,
      ranges: Array.from(s.ranges),
      intensities: Array.from(s.intensities),
    },
    bytes: HEADER_BYTES + 5 + 7 * 4 + 8 + 2 * SCAN.n * 4,
  };
}

export const DEPTH = {
  w: 48,
  h: 27,
  hfov: 1.2,
  vfov: 0.72,
  x: 0.15,
  z: 0.28,
  pitch: 0.3,
  max: 3.5,
};

/** A depth camera on the rover's mast: a grid of rays into the arena, returned in the map frame. */
export function depthCloud(r: Rover, noise: () => number) {
  const out = new Float32Array(DEPTH.w * DEPTH.h * 3);
  const c = Math.cos(r.th);
  const s = Math.sin(r.th);
  const o: [number, number, number] = [r.x + DEPTH.x * c, r.y + DEPTH.x * s, DEPTH.z];
  const cp = Math.cos(DEPTH.pitch);
  const sp = Math.sin(DEPTH.pitch);
  let n = 0;
  for (let v = 0; v < DEPTH.h; v++) {
    for (let u = 0; u < DEPTH.w; u++) {
      // Camera frame: x forward, y left, z up; then pitch down, then yaw.
      const yl = -Math.tan(DEPTH.hfov / 2) * ((2 * u) / (DEPTH.w - 1) - 1);
      const zl = -Math.tan(DEPTH.vfov / 2) * ((2 * v) / (DEPTH.h - 1) - 1);
      const k = 1 / Math.hypot(1, yl, zl);
      const fx = k * cp + zl * k * sp;
      const fz = -k * sp + zl * k * cp;
      const fy = yl * k;
      const d: [number, number, number] = [fx * c - fy * s, fx * s + fy * c, fz];
      const t = cast3d(o, d, DEPTH.max);
      if (t >= DEPTH.max) continue;
      const tn = t + noise() * 0.004 * t * t;
      out[n++] = o[0] + d[0] * tn;
      out[n++] = o[1] + d[1] * tn;
      out[n++] = o[2] + d[2] * tn;
    }
  }
  return out.subarray(0, n);
}

export function cloudMsg(points: Float32Array, seq: number, t: number) {
  const count = points.length / 3;
  const field = (name: string, offset: number) => ({ name, offset, datatype: 7, count: 1 });
  return {
    msg: {
      header: header(seq, t, 'camera_depth_optical_frame'),
      height: 1,
      width: count,
      fields: [field('x', 0), field('y', 4), field('z', 8), field('rgb', 12)],
      is_bigendian: false,
      point_step: 16,
      row_step: 16 * count,
      data: bytes(16 * count),
      is_dense: true,
    },
    bytes: HEADER_BYTES + 26 + 8 + 4 * 14 + 9 + 16 * count + 1,
  };
}

export const IMAGE = { w: 160, h: 120 };

export function imageMsg(seq: number, t: number) {
  return {
    msg: {
      header: header(seq, t, 'camera_link'),
      height: IMAGE.h,
      width: IMAGE.w,
      encoding: 'rgb8',
      is_bigendian: 0,
      step: IMAGE.w * 3,
      data: bytes(IMAGE.w * IMAGE.h * 3),
    },
    bytes: HEADER_BYTES + 11 + 4 + 4 + 8 + 1 + 4 + IMAGE.w * IMAGE.h * 3,
  };
}

export interface Frame {
  name: string;
  parent: string;
  /** Translation and rotation relative to the parent. */
  t: [number, number, number];
  q: Quat;
}

export function tfMsg(frames: Frame[], seq: number, t: number) {
  return {
    msg: {
      transforms: frames.map((f) => ({
        header: header(seq, t, f.parent),
        child_frame_id: f.name,
        transform: { translation: xyz(...f.t), rotation: q4(f.q) },
      })),
    },
    bytes:
      4 +
      frames.reduce((n, f) => n + HEADER_BYTES + f.parent.length + 4 + f.name.length + 7 * 8, 0),
  };
}

export function visionMsg(sim: Sim, frame: number, t: number, noise: () => number) {
  const mm = (v: number) => Math.round(v * 1000 + noise() * 2.5);
  const b = sim.ball;
  return {
    msg: {
      frame_number: frame,
      t_capture: t,
      camera_id: 0,
      balls: [
        {
          confidence: 0.93 + noise() * 0.01,
          x: mm(b.x),
          y: mm(b.y),
          pixel_x: Math.round(390 + b.x * 120),
          pixel_y: Math.round(290 - b.y * 120),
        },
      ],
      robots_yellow: sim.bots.map((r) => ({
        confidence: 0.97 + noise() * 0.005,
        robot_id: r.id,
        x: mm(r.x),
        y: mm(r.y),
        orientation: r.th + noise() * 0.004,
      })),
      robots_blue: [],
    },
    bytes: 24 + 28 + sim.bots.length * 32,
  };
}

export function twistMsg(r: Rover) {
  return { msg: { linear: xyz(r.cmdV, 0, 0), angular: xyz(0, 0, r.cmdW) }, bytes: 48 };
}

export function poseStamped(
  seq: number,
  t: number,
  frame: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
) {
  return {
    msg: {
      header: header(seq, t, frame),
      pose: { position: xyz(x, y, z), orientation: q4(quat(0, 0, yaw)) },
    },
    bytes: HEADER_BYTES + frame.length + 4 + 56,
  };
}

export function pointStamped(
  seq: number,
  t: number,
  frame: string,
  x: number,
  y: number,
  z: number,
) {
  return {
    msg: { header: header(seq, t, frame), point: xyz(x, y, z) },
    bytes: HEADER_BYTES + frame.length + 4 + 24,
  };
}

export function pathMsg(path: PathPoint[], seq: number, t: number) {
  return {
    msg: {
      header: header(seq, t, 'map'),
      poses: path.map((p, i) => ({
        header: header(i, t, 'map'),
        pose: { position: xyz(p.x, p.y, 0), orientation: q4(quat(0, 0, p.yaw)) },
      })),
    },
    bytes: HEADER_BYTES + 7 + path.length * (HEADER_BYTES + 7 + 56),
  };
}

export function mapMsg(seq: number) {
  return {
    msg: {
      header: header(seq, 0, 'map'),
      info: {
        map_load_time: stamp(0),
        resolution: GRID.res,
        width: GRID.w,
        height: GRID.h,
        origin: { position: xyz(GRID.x0, GRID.y0, 0), orientation: q4([0, 0, 0, 1]) },
      },
      data: Array.from(grid.occ),
    },
    bytes: HEADER_BYTES + 7 + 8 + 4 + 8 + 56 + 4 + grid.occ.length,
  };
}

export interface StationMarker {
  id: number;
  x: number;
  y: number;
  text: string;
  state: 'active' | 'next' | 'idle';
}

export function markersMsg(stations: StationMarker[], seq: number, t: number) {
  const colour = (s: StationMarker['state']) =>
    s === 'active'
      ? { r: 0.2, g: 0.78, b: 0.35, a: 1 }
      : s === 'next'
        ? { r: 1, g: 0.72, b: 0.1, a: 1 }
        : { r: 0.6, g: 0.62, b: 0.66, a: 0.6 };
  return {
    msg: {
      markers: stations.flatMap((s) => [
        {
          header: header(seq, t, 'map'),
          ns: 'stations',
          id: s.id,
          type: 3,
          action: 0,
          pose: { position: xyz(s.x, s.y, 0.06), orientation: q4([0, 0, 0, 1]) },
          scale: xyz(0.16, 0.16, 0.12),
          color: colour(s.state),
          text: '',
        },
        {
          header: header(seq, t, 'map'),
          ns: 'labels',
          id: s.id,
          type: 9,
          action: 0,
          pose: { position: xyz(s.x, s.y, 0.32), orientation: q4([0, 0, 0, 1]) },
          scale: xyz(0, 0, 0.08),
          color: colour(s.state),
          text: s.text,
        },
      ]),
    },
    bytes: 4 + stations.length * 2 * (HEADER_BYTES + 3 + 8 + 56 + 24 + 16 + 12),
  };
}

export const chapterMsg = (text: string) => ({ msg: { data: text }, bytes: 4 + text.length });

/* ------------------------------------------------------------------ echo */

export interface EchoLine {
  depth: number;
  key: string;
  value?: string;
  kind?: 'num' | 'str' | 'bool' | 'arr' | 'more';
  /** A list item's first line starts with a dash. */
  dash?: boolean;
}

const INT_KEYS = new Set([
  'seq',
  'secs',
  'nsecs',
  'height',
  'width',
  'step',
  'point_step',
  'row_step',
  'offset',
  'datatype',
  'count',
  'is_bigendian',
  'frame_number',
  'camera_id',
  'robot_id',
  'id',
  'type',
  'action',
  'x_px',
  'pixel_x',
  'pixel_y',
]);
const VISION_MM = new Set(['x', 'y']);

function num(key: string, v: number, ints: boolean) {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
  if (INT_KEYS.has(key) || ints) return String(Math.round(v));
  const s = v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0');
  return s === '-0.0' ? '0.0' : s;
}

/**
 * A message as indented YAML, the way a command-line echo prints it. Long numeric arrays are
 * cut to their first values, or, with `noarr`, shown only by their type and length.
 */
export function echo(msg: unknown, noarr: boolean, depth = 0, mmKeys = false): EchoLine[] {
  const out: EchoLine[] = [];
  if (!msg || typeof msg !== 'object') return out;
  for (const [key, v] of Object.entries(msg as Record<string, unknown>)) {
    const ints = mmKeys && VISION_MM.has(key);
    if (typeof v === 'number') out.push({ depth, key, value: num(key, v, ints), kind: 'num' });
    else if (typeof v === 'string') out.push({ depth, key, value: `"${v}"`, kind: 'str' });
    else if (typeof v === 'boolean')
      out.push({ depth, key, value: v ? 'True' : 'False', kind: 'bool' });
    else if (Array.isArray(v)) {
      if (!v.length) out.push({ depth, key, value: '[]', kind: 'arr' });
      else if (typeof v[0] === 'number') {
        const type = key === 'data' ? 'int8' : key.includes('covariance') ? 'float64' : 'float32';
        if (noarr)
          out.push({
            depth,
            key,
            value: `<array type: ${type}, length: ${v.length}>`,
            kind: 'arr',
          });
        else {
          const shown = v.slice(0, 9).map((x: number) => num(key, x, false));
          out.push({
            depth,
            key,
            value: `[${shown.join(', ')}${v.length > 9 ? `, … ${v.length - 9} more` : ''}]`,
            kind: 'arr',
          });
        }
      } else {
        out.push({ depth, key });
        const limit = noarr ? 0 : 3;
        v.slice(0, limit).forEach((item) => {
          const lines = echo(
            item,
            noarr,
            depth + 1,
            mmKeys || key.startsWith('robots') || key === 'balls',
          );
          if (lines[0]) lines[0].dash = true;
          out.push(...lines);
        });
        if (v.length > limit)
          out.push({
            depth: depth + 1,
            key: noarr ? `<array of ${v.length} items>` : `… ${v.length - limit} more`,
            kind: 'more',
          });
      }
    } else if (v && typeof v === 'object' && 'bytes' in v && 'dtype' in v) {
      const b = v as Bytes;
      out.push({ depth, key, value: `<array type: ${b.dtype}, length: ${b.bytes}>`, kind: 'arr' });
    } else {
      out.push({ depth, key });
      out.push(...echo(v, noarr, depth + 1, mmKeys));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ rate meter */

const WINDOW = 2000;

/** Receive times and sizes over a sliding window: average rate and bandwidth, as a rate meter reports them. */
export class Meter {
  private times: number[] = [];
  private sizes: number[] = [];
  count = 0;

  add(at: number, size: number) {
    this.times.push(at);
    this.sizes.push(size);
    this.count++;
  }

  clear() {
    this.times = [];
    this.sizes = [];
  }

  stats(now: number) {
    while (this.times.length && this.times[0] < now - WINDOW) {
      this.times.shift();
      this.sizes.shift();
    }
    const n = this.times.length;
    if (n < 2 || now - this.times[n - 1] > 1200)
      return { hz: null as number | null, bw: null as number | null };
    const span = (this.times[n - 1] - this.times[0]) / 1000;
    const hz = span > 0 ? (n - 1) / span : null;
    const bw = this.sizes.reduce((a, b) => a + b, 0) / Math.max(span, 0.25);
    return { hz, bw };
  }
}

export const fmtHz = (hz: number | null) =>
  hz === null ? '—' : hz >= 100 ? hz.toFixed(0) : hz.toFixed(1);

export function fmtBw(bw: number | null) {
  if (bw === null) return '—';
  if (bw >= 1e6) return `${(bw / 1e6).toFixed(2)} MB/s`;
  if (bw >= 1e3) return `${(bw / 1e3).toFixed(1)} KB/s`;
  return `${Math.round(bw)} B/s`;
}
