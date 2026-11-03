// What the panels and the 3D engine agree on: tools, views, displays and their properties, and
// the snapshot the engine publishes to the panels a dozen times a second. No three.js here, so
// the panels render (and the server renders them) before the engine has loaded.
import { db } from '../_shared/data';
import { BAGS } from './bags';
import { TOPICS, type EchoLine } from './msgs';

/* ------------------------------------------------------------------ tools */

export type Tool = 'interact' | 'move' | 'select' | 'focus' | 'measure' | 'goal' | 'point';

export const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  {
    id: 'interact',
    label: 'Interact',
    key: 'i',
    hint: 'Interact: drag a marker handle to move it. Elsewhere, left-drag rotates, shift-drag or middle-drag pans, right-drag or scroll zooms.',
  },
  {
    id: 'move',
    label: 'Move Camera',
    key: 'm',
    hint: 'Move Camera: left-drag rotates, shift-drag or middle-drag pans, right-drag or scroll zooms.',
  },
  {
    id: 'select',
    label: 'Select',
    key: 's',
    hint: 'Select: click a robot to inspect its frame. Click empty space to clear.',
  },
  {
    id: 'focus',
    label: 'Focus Camera',
    key: 'c',
    hint: 'Focus Camera: click a point to orbit around it.',
  },
  {
    id: 'measure',
    label: 'Measure',
    key: 'n',
    hint: 'Measure: click two points to measure the distance between them.',
  },
  {
    id: 'goal',
    label: '2D Nav Goal',
    key: 'g',
    hint: '2D Nav Goal: press on the arena to set the position, drag to set the heading, release to send.',
  },
  {
    id: 'point',
    label: 'Publish Point',
    key: 'u',
    hint: 'Publish Point: click anywhere to publish it on /clicked_point.',
  },
];

/* ------------------------------------------------------------------ views */

export type ViewType = 'orbit' | 'top' | 'side' | 'follow';

export const VIEWS: { id: ViewType; label: string; key: string }[] = [
  { id: 'orbit', label: 'Orbit', key: '1' },
  { id: 'top', label: 'TopDownOrtho', key: '2' },
  { id: 'side', label: 'SideOrtho', key: '3' },
  { id: 'follow', label: 'ThirdPersonFollower', key: '4' },
];

export interface ViewState {
  type: ViewType;
  /** The frame a follower view tracks. */
  target: string;
}

export const FRAMES = [
  'map',
  'odom',
  'base_link',
  'laser',
  'camera_link',
  'quad/base_link',
  'quad/imu_link',
];
/** One frame per robot on the SSL team, as many as the team had. */
export const TEAM = db.robots.ssl.team;
export const SSL_FRAMES = Array.from({ length: TEAM }, (_, i) => `ssl/robot_${i}`);
export const FOLLOW_TARGETS = ['base_link', 'quad/base_link', ...SSL_FRAMES];

/* ------------------------------------------------------------------ displays */

export type DisplayId =
  | 'global'
  | 'grid'
  | 'map'
  | 'tf'
  | 'robot'
  | 'scan'
  | 'cloud'
  | 'path'
  | 'odom'
  | 'markers'
  | 'im'
  | 'imu'
  | 'image';
export type PropVal = boolean | string | number;

export interface PropDef {
  key: string;
  label: string;
  kind: 'bool' | 'enum' | 'text' | 'color';
  options?: string[];
  value: PropVal;
  /** For colours: the CSS token that holds it, so the swatch follows light and dark. */
  token?: string;
}

export interface DisplayDef {
  id: DisplayId;
  name: string;
  /** The display's class, shown as its icon tooltip. */
  type: string;
  topic?: string;
  /** Global Options cannot be switched off. */
  fixed?: boolean;
  on: boolean;
  props: PropDef[];
}

const topic = (name: string): PropDef => ({
  key: 'topic',
  label: 'Topic',
  kind: 'text',
  value: name,
});
const colour = (token: string): PropDef => ({
  key: 'color',
  label: 'Color',
  kind: 'color',
  value: '',
  token,
});

export const DISPLAYS: DisplayDef[] = [
  {
    id: 'global',
    name: 'Global Options',
    type: 'Global',
    fixed: true,
    on: true,
    props: [
      {
        key: 'fixed',
        label: 'Fixed Frame',
        kind: 'enum',
        options: ['map', 'odom', 'base_link', 'quad/base_link'],
        value: 'map',
      },
      { key: 'bg', label: 'Background Color', kind: 'color', value: '', token: '--view-bg' },
      { key: 'fps', label: 'Frame Rate', kind: 'enum', options: ['30', '60'], value: '60' },
    ],
  },
  {
    id: 'grid',
    name: 'Grid',
    type: 'Grid',
    on: true,
    props: [
      { key: 'ref', label: 'Reference Frame', kind: 'text', value: '<Fixed Frame>' },
      {
        key: 'cells',
        label: 'Plane Cell Count',
        kind: 'enum',
        options: ['10', '20', '40'],
        value: '20',
      },
      { key: 'size', label: 'Cell Size', kind: 'enum', options: ['0.25', '0.5', '1'], value: '1' },
      { key: 'alpha', label: 'Alpha', kind: 'enum', options: ['0.25', '0.5', '1'], value: '0.5' },
      colour('--grid'),
    ],
  },
  {
    id: 'map',
    name: 'Map',
    type: 'Map',
    topic: '/map',
    on: true,
    props: [
      topic('/map'),
      {
        key: 'scheme',
        label: 'Color Scheme',
        kind: 'enum',
        options: ['map', 'costmap', 'raw'],
        value: 'map',
      },
      { key: 'alpha', label: 'Alpha', kind: 'enum', options: ['0.4', '0.7', '1'], value: '0.7' },
    ],
  },
  {
    id: 'tf',
    name: 'TF',
    type: 'TF',
    topic: '/tf',
    on: true,
    props: [
      { key: 'names', label: 'Show Names', kind: 'bool', value: true },
      { key: 'axes', label: 'Show Axes', kind: 'bool', value: true },
      { key: 'arrows', label: 'Show Arrows', kind: 'bool', value: true },
      { key: 'scale', label: 'Marker Scale', kind: 'enum', options: ['0.5', '1', '2'], value: '1' },
    ],
  },
  {
    id: 'robot',
    name: 'RobotModel',
    type: 'RobotModel',
    on: true,
    props: [
      { key: 'visual', label: 'Visual Enabled', kind: 'bool', value: true },
      { key: 'collision', label: 'Collision Enabled', kind: 'bool', value: false },
      { key: 'alpha', label: 'Alpha', kind: 'enum', options: ['0.5', '1'], value: '1' },
    ],
  },
  {
    id: 'scan',
    name: 'LaserScan',
    type: 'LaserScan',
    topic: '/scan',
    on: true,
    props: [
      topic('/scan'),
      {
        key: 'style',
        label: 'Style',
        kind: 'enum',
        options: ['Points', 'Flat Squares'],
        value: 'Flat Squares',
      },
      {
        key: 'size',
        label: 'Size (m)',
        kind: 'enum',
        options: ['0.02', '0.04', '0.06'],
        value: '0.04',
      },
      {
        key: 'transformer',
        label: 'Color Transformer',
        kind: 'enum',
        options: ['Intensity', 'FlatColor', 'AxisColor'],
        value: 'Intensity',
      },
      {
        key: 'decay',
        label: 'Decay Time',
        kind: 'enum',
        options: ['0', '1', '3', '10'],
        value: '1',
      },
    ],
  },
  {
    id: 'cloud',
    name: 'PointCloud2',
    type: 'PointCloud2',
    topic: '/points',
    on: true,
    props: [
      topic('/points'),
      {
        key: 'size',
        label: 'Size (m)',
        kind: 'enum',
        options: ['0.015', '0.025', '0.04'],
        value: '0.025',
      },
      {
        key: 'transformer',
        label: 'Color Transformer',
        kind: 'enum',
        options: ['AxisColor', 'FlatColor'],
        value: 'AxisColor',
      },
      { key: 'decay', label: 'Decay Time', kind: 'enum', options: ['0', '1', '5'], value: '0' },
    ],
  },
  {
    id: 'path',
    name: 'Path',
    type: 'Path',
    topic: '/plan',
    on: true,
    props: [
      topic('/plan'),
      {
        key: 'poses',
        label: 'Pose Style',
        kind: 'enum',
        options: ['None', 'Arrows'],
        value: 'Arrows',
      },
      colour('--path'),
    ],
  },
  {
    id: 'odom',
    name: 'Odometry',
    type: 'Odometry',
    topic: '/odom',
    on: false,
    props: [
      topic('/odom'),
      { key: 'keep', label: 'Keep', kind: 'enum', options: ['20', '100', '500'], value: '100' },
      {
        key: 'tol',
        label: 'Position Tolerance',
        kind: 'enum',
        options: ['0.05', '0.1', '0.25'],
        value: '0.1',
      },
      colour('--odom'),
    ],
  },
  {
    id: 'markers',
    name: 'MarkerArray',
    type: 'MarkerArray',
    topic: '/markers',
    on: true,
    props: [
      topic('/markers'),
      { key: 'field', label: 'Namespace: field', kind: 'bool', value: true },
      { key: 'stations', label: 'Namespace: stations', kind: 'bool', value: true },
      { key: 'trail', label: 'Namespace: ball_trail', kind: 'bool', value: true },
    ],
  },
  {
    id: 'im',
    name: 'InteractiveMarkers',
    type: 'InteractiveMarkers',
    topic: '/im/update',
    on: true,
    props: [{ key: 'desc', label: 'Show Descriptions', kind: 'bool', value: true }],
  },
  {
    id: 'imu',
    name: 'Imu',
    type: 'Imu',
    topic: '/imu',
    on: true,
    props: [
      topic('/imu'),
      { key: 'accel', label: 'Show Acceleration', kind: 'bool', value: true },
      {
        key: 'scale',
        label: 'Acceleration Scale',
        kind: 'enum',
        options: ['0.02', '0.05', '0.1'],
        value: '0.05',
      },
    ],
  },
  {
    id: 'image',
    name: 'Image',
    type: 'Image',
    topic: '/camera/image_raw',
    on: true,
    props: [
      topic('/camera/image_raw'),
      { key: 'transport', label: 'Transport Hint', kind: 'text', value: 'raw' },
    ],
  },
];

export type Displays = Record<DisplayId, { on: boolean; props: Record<string, PropVal> }>;

export const initialDisplays = (): Displays =>
  Object.fromEntries(
    DISPLAYS.map((d) => [
      d.id,
      { on: d.on, props: Object.fromEntries(d.props.map((p) => [p.key, p.value])) },
    ]),
  ) as Displays;

/* ------------------------------------------------------------------ inspector */

export type InspectTarget = { kind: 'topic'; name: string } | { kind: 'frame'; name: string };

/* ------------------------------------------------------------------ snapshot */

export interface TopicRow {
  name: string;
  type: string;
  hz: string;
  bw: string;
  count: number;
}

export interface Snapshot {
  ready: boolean;
  bag: number;
  t: number;
  duration: number;
  card: number;
  playing: boolean;
  rate: number;
  loop: boolean;
  simTime: number;
  wallTime: number;
  wallElapsed: number;
  topics: TopicRow[];
  echo: EchoLine[];
  echoNote: string;
  hint: string;
  fps: number;
  view: { distance: string; yaw: string; pitch: string; focal: string };
  status: Partial<Record<DisplayId, string>>;
  /** The viewer's colours as the displays panel shows them ("48; 48; 48"), read from the tokens. */
  colors: Record<string, string>;
}

export const INITIAL: Snapshot = {
  ready: false,
  bag: 0,
  t: 0,
  duration: BAGS[0].duration,
  card: 0,
  playing: false,
  rate: 1,
  loop: true,
  simTime: 0,
  wallTime: 0,
  wallElapsed: 0,
  topics: TOPICS.map((t) => ({ name: t.name, type: t.type, hz: '—', bw: '—', count: 0 })),
  echo: [],
  echoNote: 'Waiting for the first message…',
  hint: 'Loading the 3D view…',
  fps: 0,
  view: { distance: '—', yaw: '—', pitch: '—', focal: '—' },
  status: {},
  colors: {},
};

export interface Store {
  get: () => Snapshot;
  server: () => Snapshot;
  set: (s: Snapshot) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createStore(): Store {
  let snap = INITIAL;
  const subs = new Set<() => void>();
  return {
    get: () => snap,
    server: () => INITIAL,
    set(s) {
      snap = s;
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
