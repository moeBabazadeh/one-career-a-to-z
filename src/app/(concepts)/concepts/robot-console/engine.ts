// The 3D view and everything behind it: the scene in the fixed frame, the displays, the tools,
// the view controllers, bag playback over the simulation, and the topics it publishes. The
// panels talk to it through methods and read it back through the store's snapshots.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { token } from '../_shared/scheme';
import { BAGS, cardAt, type Bag, type Focus } from './bags';
import { arrow, axes, ballMesh, collisionShapes, quadModel, roverModel, sslBot } from './models';
import {
  chapterMsg,
  cloudMsg,
  depthCloud,
  DEPTH,
  echo,
  fmtBw,
  fmtHz,
  imageMsg,
  IMAGE,
  imuMsg,
  mapMsg,
  markersMsg,
  Meter,
  odomMsg,
  pathMsg,
  pointStamped,
  poseStamped,
  quat,
  scan,
  scanMsg,
  SCAN,
  tfMsg,
  TOPICS,
  twistMsg,
  visionMsg,
  type EchoLine,
  type Frame,
  type StationMarker,
} from './msgs';
import {
  BALL_R,
  DT,
  gauss,
  mulberry32,
  QUAD_HOME,
  scriptFor,
  seedOf,
  Sim,
  stationFor,
  wrap,
  type SimEvent,
} from './sim';
import {
  SSL_FRAMES,
  TEAM,
  TOOLS,
  type Displays,
  type InspectTarget,
  type Snapshot,
  type Store,
  type Tool,
  type ViewState,
} from './store';
import { ARENA, BOUNDS, BOXES, CYLS, GRID, grid as occ, PITCH, STATIONS } from './world';

export interface Hooks {
  toolDone: () => void;
  select: (frame: string | null) => void;
}

export interface LabelClasses {
  tf: string;
  station: string;
  stationActive: string;
  stationNext: string;
  im: string;
  measure: string;
}

/* ------------------------------------------------------------------ frames and coordinates */

/** Map-frame points to three's y-up world: the fixed frame's z is up. */
const ros3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

const FOCUS: Record<Focus | 'all', { at: [number, number, number]; dist: number }> = {
  all: { at: [2.2, -0.35, 0.3], dist: 10.5 },
  field: { at: [0.2, 0, 0], dist: 6.4 },
  arena: { at: [ARENA.cx, ARENA.cy, 0], dist: 5.6 },
  quad: { at: [QUAD_HOME[0], QUAD_HOME[1], 0.9], dist: 3.6 },
};

const STATIC: Record<
  string,
  { parent: string; t: [number, number, number]; rpy: [number, number, number] }
> = {
  laser: { parent: 'base_link', t: [SCAN.x, 0, SCAN.z], rpy: [0, 0, 0] },
  camera_link: { parent: 'base_link', t: [DEPTH.x, 0, DEPTH.z], rpy: [0, DEPTH.pitch, 0] },
  'quad/imu_link': { parent: 'quad/base_link', t: [0, 0, 0.02], rpy: [0, 0, 0] },
};

const FRAME_NAMES = [
  'map',
  'odom',
  'base_link',
  'laser',
  'camera_link',
  'quad/base_link',
  'quad/imu_link',
  ...SSL_FRAMES,
];
const PARENT: Record<string, string> = {
  odom: 'map',
  base_link: 'odom',
  laser: 'base_link',
  camera_link: 'base_link',
  'quad/base_link': 'map',
  'quad/imu_link': 'quad/base_link',
  ...Object.fromEntries(SSL_FRAMES.map((f) => [f, 'map'])),
};

const poseMatrix = (
  m: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  roll: number,
  pitch: number,
  yaw: number,
) =>
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, pitch, yaw, 'ZYX')),
    new THREE.Vector3(1, 1, 1),
  );

/** Hue from blue (low) to red (high), the way intensity and axis colouring ramps run. */
function rainbow(t: number, out: THREE.Color) {
  return out.setHSL(0.66 * (1 - Math.min(1, Math.max(0, t))), 0.95, 0.5);
}

type Handle = 'ball' | 'quadXY' | 'quadZ';

interface Drag {
  handle: Handle;
  off: THREE.Vector2;
  z: number;
}

const POOL_SCAN = 101;
const POOL_CLOUD = 26;
const TRAIL = 240;
const INSET = { x: 12, y: 12, w: 192, h: 144, minW: 560, minH: 380 };

/* ------------------------------------------------------------------ engine */

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private scene = new THREE.Scene();
  private ros = new THREE.Group();
  private mapG = new THREE.Group();
  private persp = new THREE.PerspectiveCamera(50, 1, 0.02, 300);
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
  private orbitP: OrbitControls;
  private orbitO: OrbitControls;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.persp;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private size = { w: 1, h: 1 };

  // The camera image: a plain world the rover's camera sees, rendered into an inset.
  private world = new THREE.Scene();
  private worldRoot = new THREE.Group();
  private camMount = new THREE.Group();
  private imgCam = new THREE.PerspectiveCamera(55, IMAGE.w / IMAGE.h, 0.03, 40);
  private worldQuad: THREE.Group;
  private worldProps: THREE.Object3D[];

  // Playback.
  private bagIdx = 0;
  private bag: Bag = BAGS[0];
  private sim: Sim;
  private playing = false;
  /** Bag time as the wall clock drives it; the simulation steps up to it in fixed steps and keeps the remainder. */
  private clock = 0;
  private rate = 1;
  private loop = true;
  private userEvents: SimEvent[] = [];
  /** Copies of the simulation every two seconds of bag time, so a seek replays seconds, not minutes. */
  private cps = new Map<number, Sim>();
  private cpLast = -1;
  private dragT = 0;
  private lastCard = -1;
  private lastPlan = -1;
  private trailT = 0;
  private noise = mulberry32(7);
  private gn = () => gauss(this.noise);

  // What the panels set.
  private displays: Displays;
  private tool: Tool = 'interact';
  private view: ViewState = { type: 'orbit', target: 'base_link' };
  private inspect: InspectTarget = { kind: 'topic', name: '/imu' };
  private noarr = false;
  private reduced: boolean;

  // Topics.
  private meters = new Map<string, Meter>(TOPICS.map((t) => [t.name, new Meter()]));
  private latest = new Map<string, unknown>();
  private seqs = new Map<string, number>();
  private ticks = new Map<string, number>();
  private images = 0;

  // Frames, in the map frame.
  private frameMats = new Map<string, THREE.Matrix4>(
    FRAME_NAMES.map((f) => [f, new THREE.Matrix4()]),
  );
  private fixedInv = new THREE.Matrix4();

  // Visuals.
  private gridLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }),
  );
  private mapPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private mapTex: THREE.DataTexture;
  private field = new THREE.Group();
  private fieldMats: {
    carpet: THREE.MeshBasicMaterial;
    lines: THREE.LineBasicMaterial;
    wall: THREE.MeshStandardMaterial;
  };
  private bots: THREE.Group[] = [];
  private ball: THREE.Object3D;
  private quad: { group: THREE.Group; props: THREE.Object3D[] };
  private rover: { group: THREE.Group; wheels: THREE.Object3D[] };
  private robotRoot = new THREE.Group();
  private collision: ReturnType<typeof collisionShapes>;
  private collisionRoot = new THREE.Group();
  private tfRoot = new THREE.Group();
  private tfAxes = new Map<string, THREE.Group>();
  private tfLabels = new Map<string, CSS2DObject>();
  private tfArrows: THREE.LineSegments;
  private axisMats = [
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
  ];
  private stations: {
    group: THREE.Group;
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    label: CSS2DObject;
  }[] = [];
  private stationRoot = new THREE.Group();
  private trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private trailPts = new Float32Array(TRAIL * 3);
  private trailN = 0;
  private pathLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private pathArrows: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private goalArrow: THREE.Group;
  private goalMat = new THREE.MeshBasicMaterial();
  private pathRoot = new THREE.Group();
  private scanMat = new THREE.PointsMaterial({ vertexColors: true });
  private cloudMat = new THREE.PointsMaterial({ vertexColors: true });
  private scanPool: THREE.Points[] = [];
  private cloudPool: THREE.Points[] = [];
  private scanHead = 0;
  private cloudHead = 0;
  private odomMesh: THREE.InstancedMesh;
  private odomPoses: THREE.Matrix4[] = [];
  private odomLast: [number, number, number] | null = null;
  private imRoot = new THREE.Group();
  private imBall = new THREE.Group();
  private imQuad = new THREE.Group();
  private imMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  private imHot = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  /** Invisible, fatter twins of the marker controls: what the pointer actually grabs. */
  private handles: THREE.Mesh[] = [];
  private imVisuals: THREE.Mesh[] = [];
  private imLabels: CSS2DObject[] = [];
  private imuArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(),
    0.5,
    0xffd60a,
    0.08,
    0.05,
  );
  private selectBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffd60a);
  private selected: THREE.Object3D | null = null;
  private selectedFrame: string | null = null;
  private measure = {
    a: null as THREE.Vector3 | null,
    b: null as THREE.Vector3 | null,
    line: new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ depthTest: false }),
    ),
    label: null as CSS2DObject | null,
  };
  private clicked = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.04, 1),
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  private clickedUntil = 0;
  private goalDraft: { at: THREE.Vector3; yaw: number } | null = null;

  // Interaction.
  private drag: Drag | null = null;
  private hot: Handle | null = null;
  private down: { x: number; y: number } | null = null;
  private tween: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    cam: THREE.Vector3;
    t: number;
    dur: number;
  } | null = null;
  private followOff: THREE.Vector3 | null = null;

  // Loop.
  private raf = 0;
  private last = 0;
  private lastRender = 0;
  private lastSnap = 0;
  private frames = 0;
  private fps = 0;
  private fpsAt = 0;
  private dirty = true;
  private inView = true;
  private running = false;
  private flash = { text: '', until: 0 };
  private colours: Record<string, string> = {};
  private wallStart = 0;
  private resize: ResizeObserver;
  private seen: IntersectionObserver;

  constructor(
    private stage: HTMLElement,
    private root: HTMLElement,
    private store: Store,
    private hooks: { current: Hooks },
    private cls: LabelClasses,
    displays: Displays,
    reduced: boolean,
  ) {
    this.displays = displays;
    this.reduced = reduced;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    stage.appendChild(this.renderer.domElement);
    this.labels.domElement.style.position = 'absolute';
    this.labels.domElement.style.inset = '0';
    this.labels.domElement.style.pointerEvents = 'none';
    // Its own stacking context, so the labels' depth-sorted z-indices stay under the panels on the view.
    this.labels.domElement.style.zIndex = '1';
    stage.appendChild(this.labels.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-4, 8, 6);
    this.scene.add(sun);
    this.ros.rotation.x = -Math.PI / 2;
    this.scene.add(this.ros);
    this.mapG.matrixAutoUpdate = false;
    this.ros.add(this.mapG);

    this.orbitP = new OrbitControls(this.persp, this.renderer.domElement);
    this.orbitO = new OrbitControls(this.ortho, this.renderer.domElement);
    this.orbitP.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.DOLLY,
    };
    this.orbitO.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.DOLLY,
    };
    this.orbitO.enableRotate = false;
    this.orbitO.screenSpacePanning = true;
    this.orbitP.maxDistance = 60;
    this.orbitP.minDistance = 0.3;
    this.orbitO.minZoom = 0.15;
    this.orbitO.maxZoom = 12;
    for (const c of [this.orbitP, this.orbitO]) {
      c.enableDamping = !reduced;
      c.dampingFactor = 0.12;
      c.addEventListener('change', () => (this.dirty = true));
    }
    this.orbitO.enabled = false;
    this.controls = this.orbitP;

    // Grid.
    this.gridLines.renderOrder = -1;
    this.ros.add(this.gridLines);

    // Map.
    this.mapTex = new THREE.DataTexture(new Uint8Array(GRID.w * GRID.h * 4), GRID.w, GRID.h);
    this.mapTex.magFilter = THREE.NearestFilter;
    this.mapTex.minFilter = THREE.NearestFilter;
    this.mapPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID.w * GRID.res, GRID.h * GRID.res),
      new THREE.MeshBasicMaterial({ map: this.mapTex, transparent: true, depthWrite: false }),
    );
    this.mapPlane.position.set(
      GRID.x0 + (GRID.w * GRID.res) / 2,
      GRID.y0 + (GRID.h * GRID.res) / 2,
      0.004,
    );
    this.mapPlane.renderOrder = 0;
    this.mapG.add(this.mapPlane);

    // The pitch, published as markers.
    this.fieldMats = {
      carpet: new THREE.MeshBasicMaterial(),
      lines: new THREE.LineBasicMaterial(),
      wall: new THREE.MeshStandardMaterial({ flatShading: true }),
    };
    this.buildField();
    this.mapG.add(this.field);

    // Robots.
    this.bots = Array.from({ length: TEAM }, (_, i) => sslBot(i));
    this.ball = ballMesh();
    this.quad = quadModel();
    this.rover = roverModel();
    this.robotRoot.add(...this.bots, this.ball, this.quad.group, this.rover.group);
    this.mapG.add(this.robotRoot);
    this.collision = collisionShapes(TEAM);
    this.collisionRoot.add(...this.collision.bots, this.collision.rover, this.collision.quad);
    this.mapG.add(this.collisionRoot);

    // TF.
    for (const f of FRAME_NAMES) {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const ax = axes(0.25, 0.008, this.axisMats);
      ax.name = 'axes';
      g.add(ax);
      const el = document.createElement('div');
      el.className = cls.tf;
      el.textContent = f;
      // Sensor and intermediate frames: a small view hides their names (see the stylesheet).
      if (['odom', 'laser', 'camera_link', 'quad/imu_link', 'map'].includes(f))
        el.dataset.minor = '';
      const label = new CSS2DObject(el);
      label.center.set(-0.08, 1.1);
      g.add(label);
      this.tfAxes.set(f, g);
      this.tfLabels.set(f, label);
      this.tfRoot.add(g);
    }
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((FRAME_NAMES.length - 1) * 6), 3),
    );
    arrowGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array((FRAME_NAMES.length - 1) * 6), 3),
    );
    this.tfArrows = new THREE.LineSegments(
      arrowGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.tfArrows.renderOrder = 5;
    this.tfArrows.frustumCulled = false;
    this.tfRoot.add(this.tfArrows);
    this.mapG.add(this.tfRoot);

    // Station markers.
    STATIONS.forEach(([x, y], i) => {
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12).rotateX(Math.PI / 2).translate(0, 0, 0.06),
        new THREE.MeshStandardMaterial({ flatShading: true, transparent: true }),
      );
      g.add(m);
      const el = document.createElement('div');
      el.className = cls.station;
      el.textContent = `wp_${i}`;
      const label = new CSS2DObject(el);
      label.position.z = 0.3;
      g.add(label);
      this.stationRoot.add(g);
      this.stations.push({ group: g, mesh: m, label });
    });
    this.mapG.add(this.stationRoot);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPts, 3));
    this.trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 }),
    );
    this.trail.frustumCulled = false;
    this.mapG.add(this.trail);

    // Path.
    const pathGeo = new THREE.BufferGeometry();
    pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6000 * 3), 3));
    this.pathLine = new THREE.Line(pathGeo, new THREE.LineBasicMaterial());
    this.pathLine.frustumCulled = false;
    const chevGeo = new THREE.BufferGeometry();
    chevGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1000 * 4 * 3), 3));
    this.pathArrows = new THREE.LineSegments(chevGeo, new THREE.LineBasicMaterial());
    this.pathArrows.frustumCulled = false;
    this.goalArrow = arrow(0.35, 0.012, this.goalMat);
    this.pathRoot.add(this.pathLine, this.pathArrows, this.goalArrow);
    this.mapG.add(this.pathRoot);

    // Odometry arrows, in the fixed frame.
    const odomGeo = new THREE.ConeGeometry(0.028, 0.2, 6)
      .rotateZ(-Math.PI / 2)
      .translate(0.1, 0, 0.02);
    this.odomMesh = new THREE.InstancedMesh(odomGeo, new THREE.MeshBasicMaterial(), 500);
    this.odomMesh.count = 0;
    this.odomMesh.frustumCulled = false;
    this.ros.add(this.odomMesh);

    // Interactive markers.
    this.buildMarkers();
    this.mapG.add(this.imRoot);
    this.mapG.add(this.imuArrow);
    this.selectBox.visible = false;
    this.scene.add(this.selectBox);
    this.measure.line.frustumCulled = false;
    this.measure.line.renderOrder = 6;
    this.mapG.add(this.measure.line);
    this.clicked.visible = false;
    this.mapG.add(this.clicked);

    this.buildWorld();
    const wq = quadModel();
    this.worldQuad = wq.group;
    this.worldProps = wq.props;
    this.worldRoot.add(this.worldQuad);

    this.sim = this.newSim();
    this.applyTheme();
    this.applyDisplays();
    this.fit();
    this.zero(true);
    this.loadBag(0, !reduced, false);

    // Events.
    stage.addEventListener('pointerdown', this.onDown, { capture: true });
    stage.addEventListener('pointermove', this.onMove, { capture: true });
    window.addEventListener('pointerup', this.onUp);
    stage.addEventListener('contextmenu', this.onContext);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(stage);
    this.seen = new IntersectionObserver(([e]) => {
      this.inView = e.isIntersecting;
      this.sync();
    });
    this.seen.observe(stage);
    this.fit();
    this.wallStart = performance.now();
    this.sync();
  }

  /* -------------------------------------------------------------- building */

  private buildField() {
    const g = this.field;
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * BOUNDS.x, 2 * BOUNDS.y),
      this.fieldMats.carpet,
    );
    carpet.position.z = 0.002;
    carpet.userData.frame = 'map';
    g.add(carpet);
    const L = PITCH.L / 2;
    const W = PITCH.W / 2;
    const pts: number[] = [];
    const seg = (x0: number, y0: number, x1: number, y1: number) =>
      pts.push(x0, y0, 0.006, x1, y1, 0.006);
    seg(-L, -W, L, -W);
    seg(L, -W, L, W);
    seg(L, W, -L, W);
    seg(-L, W, -L, -W);
    seg(0, -W, 0, W);
    seg(-L, 0, L, 0);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const b = ((i + 1) / 40) * Math.PI * 2;
      seg(
        PITCH.circleR * Math.cos(a),
        PITCH.circleR * Math.sin(a),
        PITCH.circleR * Math.cos(b),
        PITCH.circleR * Math.sin(b),
      );
    }
    for (const s of [-1, 1]) {
      const x = s * L;
      const xi = s * (L - PITCH.defD);
      seg(x, -PITCH.defW / 2, xi, -PITCH.defW / 2);
      seg(xi, -PITCH.defW / 2, xi, PITCH.defW / 2);
      seg(xi, PITCH.defW / 2, x, PITCH.defW / 2);
      const xg = s * (L + PITCH.goalD);
      seg(x, -PITCH.goalW / 2, xg, -PITCH.goalW / 2);
      seg(xg, -PITCH.goalW / 2, xg, PITCH.goalW / 2);
      seg(xg, PITCH.goalW / 2, x, PITCH.goalW / 2);
    }
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
      this.fieldMats.lines,
    );
    g.add(lines);
    const wallH = 0.08;
    const t = 0.03;
    const walls: [number, number, number, number][] = [
      [0, BOUNDS.y + t / 2, 2 * BOUNDS.x + 2 * t, t],
      [0, -BOUNDS.y - t / 2, 2 * BOUNDS.x + 2 * t, t],
      [BOUNDS.x + t / 2, 0, t, 2 * BOUNDS.y],
      [-BOUNDS.x - t / 2, 0, t, 2 * BOUNDS.y],
    ];
    for (const [x, y, w, d] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, wallH), this.fieldMats.wall);
      m.position.set(x, y, wallH / 2);
      g.add(m);
    }
  }

  private buildMarkers() {
    const hitMat = new THREE.MeshBasicMaterial();
    const control = (
      parent: THREE.Group,
      handle: Handle,
      look: THREE.BufferGeometry,
      hit: THREE.BufferGeometry,
      z = 0,
    ) => {
      const m = new THREE.Mesh(look, this.imMat);
      m.userData.handle = handle;
      m.renderOrder = 8;
      m.position.z = z;
      const h = new THREE.Mesh(hit, hitMat);
      h.userData.handle = handle;
      h.visible = false;
      h.position.z = z;
      parent.add(m, h);
      this.imVisuals.push(m);
      this.handles.push(h);
    };
    // Move-in-plane controls grab anywhere on their disc, not only on the drawn ring.
    const disc = (r: number) => new THREE.CylinderGeometry(r, r, 0.05, 24).rotateX(Math.PI / 2);
    control(this.imBall, 'ball', new THREE.TorusGeometry(0.14, 0.016, 6, 36), disc(0.2));
    control(this.imQuad, 'quadXY', new THREE.TorusGeometry(0.27, 0.02, 6, 44), disc(0.34));
    control(
      this.imQuad,
      'quadZ',
      new THREE.ConeGeometry(0.04, 0.1, 10).rotateX(Math.PI / 2),
      new THREE.ConeGeometry(0.08, 0.16, 8).rotateX(Math.PI / 2),
      0.19,
    );
    control(
      this.imQuad,
      'quadZ',
      new THREE.ConeGeometry(0.04, 0.1, 10).rotateX(-Math.PI / 2),
      new THREE.ConeGeometry(0.08, 0.16, 8).rotateX(-Math.PI / 2),
      -0.19,
    );
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.07),
      new THREE.MeshBasicMaterial({
        color: 0x8899aa,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.imQuad.add(core);
    for (const [g, text, z] of [
      [this.imBall, 'ball', 0.18],
      [this.imQuad, 'quad/setpoint', 0.3],
    ] as const) {
      const el = document.createElement('div');
      el.className = this.cls.im;
      el.textContent = text;
      const label = new CSS2DObject(el);
      label.position.z = z;
      g.add(label);
      this.imLabels.push(label);
    }
    this.imRoot.add(this.imBall, this.imQuad);
  }

  /** The world as a camera sees it: floor, walls, crates and drums, the pitch beyond. */
  private buildWorld() {
    this.world.background = new THREE.Color(0xc9d3de);
    this.world.fog = new THREE.Fog(0xc9d3de, 4, 14);
    this.world.add(new THREE.HemisphereLight(0xf4f7ff, 0x5a5348, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 6, 2);
    this.world.add(sun);
    this.worldRoot.rotation.x = -Math.PI / 2;
    this.world.add(this.worldRoot);
    const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * ARENA.half, 2 * ARENA.half),
      lam(0xb9b2a5),
    );
    floor.position.set(ARENA.cx, ARENA.cy, 0);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), lam(0x7d848c));
    outside.position.set(ARENA.cx, 0, -0.002);
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * BOUNDS.x, 2 * BOUNDS.y),
      lam(0x2f7d3a),
    );
    pitch.position.z = 0.001;
    this.worldRoot.add(floor, outside, pitch);
    const colours = [0xd9822b, 0x3a6fd8, 0xc9a227, 0x8b5cf6, 0xd9534f];
    let k = 0;
    for (const b of BOXES) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.h),
        lam(b.wall ? 0xece7dc : colours[k++ % colours.length]),
      );
      m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.h / 2);
      this.worldRoot.add(m);
    }
    for (const c of CYLS) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(c.r, c.r, c.h, 14).rotateX(Math.PI / 2),
        lam(0x3b9c74),
      );
      m.position.set(c.x, c.y, c.h / 2);
      this.worldRoot.add(m);
    }
    // A camera looks down its -z with y up; the mount is x forward, z up.
    this.imgCam.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-1, 0, 0),
      ),
    );
    this.camMount.add(this.imgCam);
    this.worldRoot.add(this.camMount);
  }

  private buildGrid() {
    const p = this.displays.grid.props;
    const n = Number(p.cells);
    const size = Number(p.size);
    const half = (n * size) / 2;
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const v = -half + i * size;
      pts.push(v, -half, 0, v, half, 0, -half, v, 0, half, v, 0);
    }
    this.gridLines.geometry.dispose();
    this.gridLines.geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(pts, 3),
    );
    this.gridLines.material.opacity = Number(p.alpha);
  }

  private paintMap() {
    const scheme = this.displays.map.props.scheme;
    const data = this.mapTex.image.data as Uint8Array;
    const free = new THREE.Color(this.tok('--map-free'));
    const occd = new THREE.Color(this.tok('--map-occ'));
    const unk = new THREE.Color(this.tok('--map-unknown'));
    const c = new THREE.Color();
    for (let k = 0; k < GRID.w * GRID.h; k++) {
      const o = occ.occ[k];
      const cost = occ.cost[k];
      let a = 255;
      if (scheme === 'map') c.copy(o < 0 ? unk : o === 100 ? occd : free);
      else if (scheme === 'raw') c.setScalar(o < 0 ? 0.5 : 1 - o / 100);
      else if (cost === 255) c.copy(unk);
      else if (cost === 254) c.setRGB(1, 0, 1);
      else if (cost === 253) c.setRGB(0, 1, 1);
      else if (cost === 0) {
        c.setRGB(0, 0, 0);
        a = 0;
      } else rainbow(cost / 252, c);
      data[k * 4] = c.r * 255;
      data[k * 4 + 1] = c.g * 255;
      data[k * 4 + 2] = c.b * 255;
      data[k * 4 + 3] = a;
    }
    // The colours are already linear (THREE.Color converts), so the texture carries no colour space.
    this.mapTex.needsUpdate = true;
  }

  /* -------------------------------------------------------------- theme */

  private tok(name: string) {
    return token(this.root, name) || '#888888';
  }

  /** Reads the viewer's colours from the CSS tokens; called again whenever light or dark changes. */
  applyTheme() {
    const col = (n: string) => new THREE.Color(this.tok(n));
    this.renderer.setClearColor(col('--view-bg'));
    this.gridLines.material.color = col('--grid');
    this.fieldMats.carpet.color = col('--field');
    this.fieldMats.lines.color = col('--field-line');
    this.fieldMats.wall.color = col('--field-wall');
    this.axisMats[0].color = col('--axis-x');
    this.axisMats[1].color = col('--axis-y');
    this.axisMats[2].color = col('--axis-z');
    this.pathLine.material.color = col('--path');
    this.pathArrows.material.color = col('--path');
    this.goalMat.color = col('--path');
    (this.odomMesh.material as THREE.MeshBasicMaterial).color = col('--odom');
    this.trail.material.color = col('--trail');
    this.imMat.color = col('--im');
    this.imHot.color = col('--im-hot');
    this.imuArrow.setColor(col('--imu'));
    (this.selectBox.material as THREE.LineBasicMaterial).color = col('--select');
    (this.measure.line.material as THREE.LineBasicMaterial).color = col('--measure');
    (this.clicked.material as THREE.MeshBasicMaterial).color = col('--measure');
    const parent = col('--tf-parent');
    const child = col('--tf-child');
    const colors = this.tfArrows.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < colors.count; i += 2) {
      colors.setXYZ(i, child.r, child.g, child.b);
      colors.setXYZ(i + 1, parent.r, parent.g, parent.b);
    }
    colors.needsUpdate = true;
    this.paintMap();
    for (const n of ['--view-bg', '--grid', '--path', '--odom']) {
      const h = col(n).getHex();
      this.colours[n] = `${(h >> 16) & 255}; ${(h >> 8) & 255}; ${h & 255}`;
    }
    this.dirty = true;
    this.emit(performance.now());
  }

  /* -------------------------------------------------------------- panels → engine */

  setDisplays(d: Displays) {
    const prev = this.displays;
    this.displays = d;
    if (prev.global.props.fixed !== d.global.props.fixed) {
      // A new fixed frame invalidates everything kept in the old one.
      this.clearDecay();
      this.flashText(`Fixed Frame is now ${d.global.props.fixed}.`);
    }
    this.applyDisplays(prev);
  }

  private applyDisplays(prev?: Displays) {
    const d = this.displays;
    if (!prev || prev.grid.props !== d.grid.props) this.buildGrid();
    if (!prev || prev.map.props.scheme !== d.map.props.scheme) this.paintMap();
    this.gridLines.visible = d.grid.on;
    this.mapPlane.visible = d.map.on;
    this.mapPlane.material.opacity = Number(d.map.props.alpha);
    this.tfRoot.visible = d.tf.on;
    const sc = Number(d.tf.props.scale);
    for (const [, g] of this.tfAxes) {
      const ax = g.getObjectByName('axes');
      if (ax) {
        ax.visible = !!d.tf.props.axes;
        ax.scale.setScalar(sc);
      }
    }
    for (const [, l] of this.tfLabels) l.visible = d.tf.on && !!d.tf.props.names;
    this.tfArrows.visible = !!d.tf.props.arrows;
    this.robotRoot.visible = d.robot.on && !!d.robot.props.visual;
    this.collisionRoot.visible = d.robot.on && !!d.robot.props.collision;
    const alpha = Number(d.robot.props.alpha);
    this.robotRoot.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || o.parent?.userData.dir !== undefined) return;
      m.transparent = alpha < 1;
      m.opacity = alpha;
    });
    const points = d.scan.props.style === 'Points';
    this.scanMat.sizeAttenuation = !points;
    this.scanMat.size = points ? 3 : Number(d.scan.props.size);
    this.scanMat.needsUpdate = true;
    this.cloudMat.size = Number(d.cloud.props.size);
    this.pathRoot.visible = d.path.on;
    this.pathArrows.visible = d.path.props.poses === 'Arrows';
    this.odomMesh.visible = d.odom.on;
    this.field.visible = d.markers.on && !!d.markers.props.field;
    this.stationRoot.visible = d.markers.on && !!d.markers.props.stations;
    this.trail.visible = d.markers.on && !!d.markers.props.trail;
    this.imRoot.visible = d.im.on;
    for (const l of this.imLabels) l.visible = d.im.on && !!d.im.props.desc;
    this.imuArrow.visible = d.imu.on && !!d.imu.props.accel;
    // Labels inside hidden groups still render as DOM; hide them explicitly.
    for (const s of this.stations) s.label.visible = this.stationRoot.visible;
    if (prev && prev.odom.props.keep !== d.odom.props.keep) this.writeOdom();
    this.dirty = true;
    this.sync();
  }

  setTool(t: Tool) {
    if (t === this.tool) return;
    this.tool = t;
    this.goalDraft = null;
    if (t !== 'measure') this.clearMeasure();
    this.setHot(null);
    this.stage.style.cursor = t === 'interact' || t === 'move' ? '' : 'crosshair';
    this.dirty = true;
    this.emit(performance.now());
  }

  setView(v: ViewState) {
    const typeChanged = v.type !== this.view.type;
    const targetChanged = v.target !== this.view.target;
    this.view = v;
    if (typeChanged) this.useView();
    if (typeChanged || targetChanged) this.followOff = null;
    if (typeChanged) this.zero(false);
    this.dirty = true;
  }

  zeroView() {
    this.zero(false);
    this.flashText(`View reset to its default (${this.view.type}).`);
  }

  setInspect(t: InspectTarget, noarr: boolean) {
    this.inspect = t;
    this.noarr = noarr;
    this.emit(performance.now());
  }

  setReduced(r: boolean) {
    this.reduced = r;
    for (const c of [this.orbitP, this.orbitO]) c.enableDamping = !r;
  }

  play(on: boolean) {
    if (on && this.sim.t >= this.bag.duration - 0.01) this.seek(0);
    this.playing = on;
    this.last = 0;
    this.emit(performance.now());
  }

  toggle() {
    this.play(!this.playing);
  }

  setRate(r: number) {
    this.rate = r;
    for (const m of this.meters.values()) m.clear();
    this.emit(performance.now());
  }

  setLoop(l: boolean) {
    this.loop = l;
    this.emit(performance.now());
  }

  /** Steps one scan period forward (or back), as a recorder's step key does while paused. */
  step(dir: 1 | -1) {
    this.playing = false;
    const to = Math.max(0, Math.min(this.bag.duration, this.sim.t + dir * 0.1));
    if (dir > 0) {
      this.clock = to;
      this.stepTo(to, performance.now(), true);
    } else this.seek(to);
    this.dirty = true;
    this.emit(performance.now());
  }

  jump(dir: 1 | -1) {
    const k = cardAt(this.bag, this.sim.t);
    const into = this.sim.t - this.bag.cards[k].start;
    const to =
      dir > 0 ? Math.min(k + 1, this.bag.cards.length - 1) : into > 1.2 ? k : Math.max(0, k - 1);
    this.seek(this.bag.cards[to].start + 0.001);
  }

  seekStart() {
    this.seek(0);
  }

  loadBag(i: number, play: boolean, move = true) {
    this.bagIdx = i;
    this.bag = BAGS[i];
    this.userEvents = [];
    this.cps.clear();
    this.seek(0, false);
    this.publish('/map', mapMsg(this.nextSeq('/map')), 0, false);
    const statics = Object.entries(STATIC).map(([name, s]) => ({
      name,
      parent: s.parent,
      t: s.t,
      q: quat(...s.rpy),
    }));
    this.publish('/tf_static', tfMsg(statics, this.nextSeq('/tf_static'), 0), 0, false);
    this.playing = play;
    if (move) this.focusOn(this.bag.focus);
    this.emit(performance.now());
  }

  /** Re-runs the bag from zero to t: the simulation is deterministic, so this is a true seek. */
  seek(t: number, announce = true) {
    const now = performance.now();
    const back = announce && t < this.sim.t - 0.05;
    // Start from the latest checkpoint a few seconds before t, so the ball's trail fills in too.
    let from: Sim | null = null;
    let fk = -1;
    for (const [k, c] of this.cps) {
      if (k * 2 <= t - 8 && k > fk) {
        fk = k;
        from = c;
      }
    }
    this.sim = from ? from.clone() : this.newSim();
    this.cpLast = fk;
    this.lastCard = -1;
    this.lastPlan = -1;
    this.trailN = 0;
    this.trailT = 0;
    this.ticks.clear();
    this.clearDecay();
    for (const m of this.meters.values()) m.clear();
    this.clock = Math.max(0, Math.min(t, this.bag.duration));
    this.stepTo(this.clock, now, false);
    this.publishAll(now);
    if (back) this.flashText('Detected jump back in time. Resetting displays.');
    this.dirty = true;
    this.emit(now);
  }

  /** Clears what the displays have accumulated, as the Reset button does. */
  reset() {
    this.clearDecay();
    this.clearMeasure();
    this.flashText('Displays reset.');
    this.dirty = true;
  }

  /** Called when light or dark changes. */
  scheme() {
    this.applyTheme();
  }

  private newSim() {
    return new Sim(
      seedOf(this.bag.id),
      scriptFor(this.bag.cards.map((c) => c.start)),
      this.userEvents,
      TEAM,
    );
  }

  /* -------------------------------------------------------------- views */

  private useView() {
    const ortho = this.view.type === 'top' || this.view.type === 'side';
    this.camera = ortho ? this.ortho : this.persp;
    this.orbitP.enabled = !ortho;
    this.orbitO.enabled = ortho;
    this.controls = ortho ? this.orbitO : this.orbitP;
    this.fit();
  }

  private zero(initial: boolean) {
    const f = FOCUS[initial ? 'all' : this.bag.focus];
    const at = ros3(...f.at);
    const v = this.view.type;
    if (v === 'orbit' || v === 'follow') {
      // The field of view is vertical: a tall, narrow view backs off to keep the width in frame.
      const aspect = this.size.w / this.size.h;
      const dist = f.dist * Math.min(1.8, Math.max(1, 1.15 / aspect));
      this.persp.up.set(0, 1, 0);
      this.persp.position.copy(at).add(ros3(-0.45, -0.75, 0.52).normalize().multiplyScalar(dist));
      this.orbitP.target.copy(at);
      this.orbitP.update();
    } else {
      const top = v === 'top';
      this.ortho.up.set(0, top ? 0 : 1, top ? -1 : 0);
      const c = top ? ros3(2.15, 0.35, 0) : ros3(2.15, 0, 0.7);
      this.ortho.position
        .copy(c)
        .add(top ? new THREE.Vector3(0, 40, 0) : new THREE.Vector3(0, 0, 40));
      this.orbitO.target.copy(c);
      this.ortho.zoom = 1;
      this.ortho.updateProjectionMatrix();
      this.orbitO.update();
    }
    this.followOff = null;
    this.tween = null;
    this.dirty = true;
  }

  private focusOn(focus: Focus) {
    if (this.view.type === 'follow') return;
    const f = FOCUS[focus];
    const to = ros3(...f.at);
    if (this.view.type === 'top') to.y = this.orbitO.target.y;
    if (this.view.type === 'side') to.z = this.orbitO.target.z;
    this.tweenTo(to);
  }

  private tweenTo(to: THREE.Vector3) {
    const from = this.controls.target.clone();
    this.tween = { from, to, cam: this.camera.position.clone(), t: 0, dur: this.reduced ? 0 : 0.9 };
    this.stepTween(0);
  }

  private stepTween(dt: number) {
    const tw = this.tween;
    if (!tw) return;
    tw.t = tw.dur ? Math.min(1, tw.t + dt / tw.dur) : 1;
    const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
    const target = tw.from.clone().lerp(tw.to, e);
    this.camera.position.copy(tw.cam).add(target.clone().sub(tw.from));
    this.controls.target.copy(target);
    this.controls.update();
    if (tw.t >= 1) this.tween = null;
    this.dirty = true;
  }

  private fit() {
    const w = Math.max(1, this.stage.clientWidth);
    const h = Math.max(1, this.stage.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    // Ortho views fit the whole world across, then zoom from there.
    const halfH = Math.max(2.6, 5.2 / (w / h));
    this.ortho.left = -halfH * (w / h);
    this.ortho.right = halfH * (w / h);
    this.ortho.top = halfH;
    this.ortho.bottom = -halfH;
    this.ortho.updateProjectionMatrix();
    this.dirty = true;
  }

  private follow() {
    const m = this.frameWorld(this.view.target);
    if (!m) return;
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const e = m.elements;
    const yaw = Math.atan2(-e[2], e[0]);
    if (!this.followOff) this.followOff = new THREE.Vector3(-1.5, 0, 0.85);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const f = this.followOff;
    this.persp.position.set(p.x + c * f.x - s * f.y, p.y + f.z, p.z - (s * f.x + c * f.y));
    this.orbitP.target.copy(p);
    this.orbitP.update();
    // Read back what the user's orbiting did, in the target's yaw frame.
    const d = this.persp.position.clone().sub(p);
    const dx = d.x;
    const dy = -d.z;
    this.followOff.set(c * dx + s * dy, -s * dx + c * dy, d.y);
    this.dirty = true;
  }

  /** A frame's pose in three's world, through the fixed frame. */
  private frameWorld(name: string) {
    const m = this.frameMats.get(name);
    if (!m) return null;
    this.scene.updateMatrixWorld();
    return new THREE.Matrix4().multiplyMatrices(this.mapG.matrixWorld, m);
  }

  /* -------------------------------------------------------------- playback */

  private stepTo(target: number, now: number, publish: boolean) {
    const sim = this.sim;
    while (sim.t + DT <= target + 1e-9) {
      sim.step();
      if (publish) this.publishDue(now, target);
      this.trailTick();
      const k = Math.floor(sim.t / 2 + 1e-9);
      if (k > this.cpLast) {
        this.cpLast = k;
        if (!this.cps.has(k)) this.cps.set(k, sim.clone());
      }
    }
    if (!publish) this.track();
  }

  /** A user event changes the future: checkpoints after it no longer hold. */
  private dropAfter(t: number) {
    for (const k of [...this.cps.keys()]) if (k * 2 > t - 0.01) this.cps.delete(k);
    this.cpLast = Math.min(this.cpLast, Math.floor(this.sim.t / 2 + 1e-9));
  }

  /** Keeps the bookkeeping that publishing would, without the work, while fast-forwarding. */
  private track() {
    this.lastCard = cardAt(this.bag, this.sim.t);
    this.lastPlan = this.sim.rover.planSeq;
    for (const def of TOPICS)
      if (def.rate) this.ticks.set(def.name, Math.floor(this.sim.t * def.rate + 1e-6));
  }

  private trailTick() {
    const sim = this.sim;
    if (sim.t - this.trailT < 0.04) return;
    this.trailT = sim.t;
    const p = this.trailPts;
    if (this.trailN === TRAIL) p.copyWithin(0, 3);
    else this.trailN++;
    const i = (this.trailN - 1) * 3;
    p[i] = sim.ball.x;
    p[i + 1] = sim.ball.y;
    p[i + 2] = 0.005;
  }

  private due(name: string, rate: number) {
    const k = Math.floor(this.sim.t * rate + 1e-6);
    if (k === this.ticks.get(name)) return false;
    this.ticks.set(name, k);
    return true;
  }

  private nextSeq(name: string) {
    const s = (this.seqs.get(name) ?? -1) + 1;
    this.seqs.set(name, s);
    return s;
  }

  private publish(name: string, m: { msg: unknown; bytes: number }, at: number, meter = true) {
    this.latest.set(name, m.msg);
    if (meter) this.meters.get(name)?.add(at, m.bytes);
    else this.meters.get(name)!.count++;
  }

  private publishDue(now: number, target: number) {
    const sim = this.sim;
    const t = sim.t;
    const at = now - ((target - t) / this.rate) * 1000;
    if (this.due('/imu', 100))
      this.publish('/imu', imuMsg(sim.quad, this.nextSeq('/imu'), t, this.gn), at);
    if (this.due('/tf', 50)) {
      this.computeFrames();
      this.publish('/tf', tfMsg(this.dynamicFrames(), this.nextSeq('/tf'), t), at);
    }
    if (this.due('/odom', 50)) {
      this.publish('/odom', odomMsg(sim.rover, this.nextSeq('/odom'), t), at);
      this.addOdom();
    }
    if (this.due('/ssl/vision', 60))
      this.publish('/ssl/vision', visionMsg(sim, this.nextSeq('/ssl/vision'), t, this.gn), at);
    if (this.due('/cmd_vel', 20)) this.publish('/cmd_vel', twistMsg(sim.rover), at);
    if (this.due('/camera/image_raw', 15)) {
      this.images++;
      this.publish('/camera/image_raw', imageMsg(this.nextSeq('/camera/image_raw'), t), at);
    }
    if (this.due('/scan', 10)) this.doScan(at);
    if (this.due('/points', 5)) this.doCloud(at);
    if (this.due('/markers', 2))
      this.publish('/markers', markersMsg(this.stationStates(), this.nextSeq('/markers'), t), at);
    this.events(at);
  }

  /** Topics published on events: a new card, a new plan. */
  private events(at: number, meter = true) {
    const sim = this.sim;
    const k = cardAt(this.bag, sim.t);
    if (k !== this.lastCard) {
      this.lastCard = k;
      const c = this.bag.cards[k];
      this.publish('/chapter', chapterMsg(`${this.bag.file} [${c.kicker}] ${c.title}`), at, meter);
    }
    if (sim.rover.planSeq !== this.lastPlan) {
      this.lastPlan = sim.rover.planSeq;
      if (sim.rover.path)
        this.publish('/plan', pathMsg(sim.rover.path, this.nextSeq('/plan'), sim.t), at, meter);
      this.writePath();
    }
  }

  /** After a seek: the latest message on every topic, so the inspector has something, unmetered. */
  private publishAll(now: number) {
    const sim = this.sim;
    const t = sim.t;
    this.computeFrames();
    this.publish('/imu', imuMsg(sim.quad, this.nextSeq('/imu'), t, this.gn), now, false);
    this.publish('/tf', tfMsg(this.dynamicFrames(), this.nextSeq('/tf'), t), now, false);
    this.publish('/odom', odomMsg(sim.rover, this.nextSeq('/odom'), t), now, false);
    this.publish(
      '/ssl/vision',
      visionMsg(sim, this.nextSeq('/ssl/vision'), t, this.gn),
      now,
      false,
    );
    this.publish('/cmd_vel', twistMsg(sim.rover), now, false);
    this.publish('/camera/image_raw', imageMsg(this.nextSeq('/camera/image_raw'), t), now, false);
    this.publish(
      '/markers',
      markersMsg(this.stationStates(), this.nextSeq('/markers'), t),
      now,
      false,
    );
    this.doScan(now, false);
    this.doCloud(now, false);
    this.lastCard = -1;
    this.lastPlan = -1;
    this.events(now, false);
    this.odomLast = null;
  }

  private doScan(at: number, meter = true) {
    const sim = this.sim;
    const s = scan(sim.rover, this.gn);
    this.publish('/scan', scanMsg(s, this.nextSeq('/scan'), sim.t), at, meter);
    this.computeFrames();
    const pts = new Float32Array(SCAN.n * 3);
    const cols = new Float32Array(SCAN.n * 3);
    const tr = this.displays.scan.props.transformer;
    const flat = new THREE.Color(this.tok('--laser'));
    const c = new THREE.Color();
    let n = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < SCAN.n; i++) {
      if (!Number.isFinite(s.ranges[i])) continue;
      lo = Math.min(lo, s.intensities[i]);
      hi = Math.max(hi, s.intensities[i]);
    }
    const v = new THREE.Vector3();
    for (let i = 0; i < SCAN.n; i++) {
      const r = s.ranges[i];
      if (!Number.isFinite(r)) continue;
      const a = sim.rover.th + SCAN.min + i * SCAN.inc;
      v.set(s.ox + r * Math.cos(a), s.oy + r * Math.sin(a), SCAN.z).applyMatrix4(this.fixedInv);
      pts.set([v.x, v.y, v.z], n * 3);
      if (tr === 'FlatColor') c.copy(flat);
      else if (tr === 'AxisColor') rainbow(SCAN.z / 0.6, c);
      else rainbow((s.intensities[i] - lo) / Math.max(1, hi - lo), c);
      cols.set([c.r, c.g, c.b], n * 3);
      n++;
    }
    this.scanHead = this.pool(
      this.scanPool,
      POOL_SCAN,
      this.scanHead,
      this.scanMat,
      pts,
      cols,
      n,
      SCAN.n,
      sim.t,
    );
  }

  private doCloud(at: number, meter = true) {
    const sim = this.sim;
    const raw = depthCloud(sim.rover, this.gn);
    this.publish('/points', cloudMsg(raw, this.nextSeq('/points'), sim.t), at, meter);
    this.computeFrames();
    const n = raw.length / 3;
    const pts = new Float32Array(raw.length);
    const cols = new Float32Array(raw.length);
    const flat = new THREE.Color(this.tok('--cloud'));
    const axis = this.displays.cloud.props.transformer === 'AxisColor';
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]);
      if (axis) rainbow(v.z / 0.6, c);
      else c.copy(flat);
      v.applyMatrix4(this.fixedInv);
      pts.set([v.x, v.y, v.z], i * 3);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    this.cloudHead = this.pool(
      this.cloudPool,
      POOL_CLOUD,
      this.cloudHead,
      this.cloudMat,
      pts,
      cols,
      n,
      DEPTH.w * DEPTH.h,
      sim.t,
    );
  }

  /** A ring of point sets in the fixed frame, kept for the decay time. */
  private pool(
    pool: THREE.Points[],
    cap: number,
    head: number,
    m: THREE.PointsMaterial,
    pts: Float32Array,
    cols: Float32Array,
    n: number,
    size: number,
    t: number,
  ) {
    let p = pool[head];
    if (!p) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(size * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(size * 3), 3));
      p = new THREE.Points(g, m);
      p.frustumCulled = false;
      pool[head] = p;
      this.ros.add(p);
    }
    const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = p.geometry.getAttribute('color') as THREE.BufferAttribute;
    (pos.array as Float32Array).set(pts.subarray(0, n * 3));
    (col.array as Float32Array).set(cols.subarray(0, n * 3));
    pos.needsUpdate = true;
    col.needsUpdate = true;
    p.geometry.setDrawRange(0, n);
    p.userData.t = t;
    p.userData.n = n;
    p.userData.live = true;
    for (const q of pool) if (q && q !== p) q.userData.latest = false;
    p.userData.latest = true;
    return (head + 1) % cap;
  }

  private clearDecay() {
    for (const p of [...this.scanPool, ...this.cloudPool]) if (p) p.userData.live = false;
    this.odomPoses = [];
    this.odomLast = null;
    this.writeOdom();
  }

  private addOdom() {
    const r = this.sim.rover;
    const tol = Number(this.displays.odom.props.tol);
    const last = this.odomLast;
    if (
      last &&
      Math.hypot(r.x - last[0], r.y - last[1]) < tol &&
      Math.abs(wrap(r.th - last[2])) < 0.25
    )
      return;
    this.odomLast = [r.x, r.y, r.th];
    this.computeFrames();
    // The odometry pose through map → odom is where the robot is; keep it in the fixed frame.
    const m = poseMatrix(new THREE.Matrix4(), r.x, r.y, 0, 0, 0, r.th).premultiply(this.fixedInv);
    this.odomPoses.push(m);
    const keep = Number(this.displays.odom.props.keep);
    while (this.odomPoses.length > keep) this.odomPoses.shift();
    this.writeOdom();
  }

  private writeOdom() {
    const keep = Number(this.displays.odom.props.keep);
    const list = this.odomPoses.slice(-keep);
    list.forEach((m, i) => this.odomMesh.setMatrixAt(i, m));
    this.odomMesh.count = list.length;
    this.odomMesh.instanceMatrix.needsUpdate = true;
  }

  private writePath() {
    const path = this.sim.rover.path;
    const pos = this.pathLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    const chev = this.pathArrows.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!path) {
      this.pathLine.geometry.setDrawRange(0, 0);
      this.pathArrows.geometry.setDrawRange(0, 0);
      return;
    }
    const n = Math.min(path.length, pos.count);
    for (let i = 0; i < n; i++) pos.setXYZ(i, path[i].x, path[i].y, 0.012);
    pos.needsUpdate = true;
    this.pathLine.geometry.setDrawRange(0, n);
    let k = 0;
    for (let i = 0; i < n && k + 4 <= chev.count; i += 6) {
      const p = path[i];
      const back = 0.05;
      for (const side of [-1, 1]) {
        chev.setXYZ(k++, p.x, p.y, 0.012);
        chev.setXYZ(
          k++,
          p.x - back * Math.cos(p.yaw + side * 0.5),
          p.y - back * Math.sin(p.yaw + side * 0.5),
          0.012,
        );
      }
    }
    chev.needsUpdate = true;
    this.pathArrows.geometry.setDrawRange(0, k);
    this.pathLine.geometry.computeBoundingSphere();
  }

  /* -------------------------------------------------------------- frames */

  private computeFrames() {
    const s = this.sim;
    const r = s.rover;
    const q = s.quad;
    const tho = wrap(r.th - r.oth);
    const co = Math.cos(tho);
    const so = Math.sin(tho);
    const tx = r.x - (co * r.ox - so * r.oy);
    const ty = r.y - (so * r.ox + co * r.oy);
    const set = (n: string, x: number, y: number, z: number, ro: number, pi: number, ya: number) =>
      poseMatrix(this.frameMats.get(n)!, x, y, z, ro, pi, ya);
    set('map', 0, 0, 0, 0, 0, 0);
    set('odom', tx, ty, 0, 0, 0, tho);
    set('base_link', r.x, r.y, 0, 0, 0, r.th);
    set('quad/base_link', q.x, q.y, q.z, q.roll, q.pitch, q.yaw);
    s.bots.forEach((b, i) => set(SSL_FRAMES[i], b.x, b.y, 0, 0, 0, b.th));
    for (const [name, st] of Object.entries(STATIC)) {
      const local = poseMatrix(new THREE.Matrix4(), ...st.t, ...st.rpy);
      this.frameMats.get(name)!.multiplyMatrices(this.frameMats.get(st.parent)!, local);
    }
    const fixed = String(this.displays.global.props.fixed);
    this.fixedInv.copy(this.frameMats.get(fixed) ?? new THREE.Matrix4()).invert();
  }

  /** The transforms /tf carries, each relative to its parent. */
  private dynamicFrames(): Frame[] {
    const s = this.sim;
    const r = s.rover;
    const q = s.quad;
    const tho = wrap(r.th - r.oth);
    const odom = new THREE.Vector3().setFromMatrixPosition(this.frameMats.get('odom')!);
    return [
      { name: 'odom', parent: 'map', t: [odom.x, odom.y, 0], q: quat(0, 0, tho) },
      { name: 'base_link', parent: 'odom', t: [r.ox, r.oy, 0], q: quat(0, 0, r.oth) },
      {
        name: 'quad/base_link',
        parent: 'map',
        t: [q.x, q.y, q.z],
        q: quat(q.roll, q.pitch, q.yaw),
      },
      ...s.bots.map((b, i) => ({
        name: SSL_FRAMES[i],
        parent: 'map',
        t: [b.x, b.y, 0] as [number, number, number],
        q: quat(0, 0, b.th),
      })),
    ];
  }

  private stationStates(): StationMarker[] {
    const k = cardAt(this.bag, this.sim.t);
    const live = this.sim.rover.station;
    const active = live >= 0 && this.sim.t >= this.bag.cards[0].start ? live : -1;
    const next = k + 1 < this.bag.cards.length ? stationFor(k + 1) : -1;
    return STATIONS.map(([x, y], i) => ({
      id: i,
      x,
      y,
      text:
        i === active
          ? this.bag.cards[k].marker
          : i === next
            ? `next: ${this.bag.cards[k + 1].marker}`
            : `wp_${i}`,
      state: i === active ? 'active' : i === next ? 'next' : 'idle',
    }));
  }

  /* -------------------------------------------------------------- per frame */

  /** Moves every visual to the simulation's current state. */
  private place() {
    const s = this.sim;
    this.computeFrames();
    this.mapG.matrix.copy(this.fixedInv);
    this.mapG.matrixWorldNeedsUpdate = true;

    s.bots.forEach((b, i) => {
      this.bots[i].position.set(b.x, b.y, 0);
      this.bots[i].rotation.set(0, 0, b.th);
      this.collision.bots[i].position.set(b.x, b.y, 0);
    });
    this.ball.position.set(s.ball.x, s.ball.y, BALL_R);
    const q = s.quad;
    this.quad.group.position.set(q.x, q.y, q.z);
    this.quad.group.rotation.set(q.roll, q.pitch, q.yaw, 'ZYX');
    this.collision.quad.position.copy(this.quad.group.position);
    this.collision.quad.rotation.copy(this.quad.group.rotation);
    for (const props of [this.quad.props, this.worldProps])
      props.forEach((p) => (p.rotation.z = q.spin * (p.userData.dir as number)));
    this.worldQuad.position.copy(this.quad.group.position);
    this.worldQuad.rotation.copy(this.quad.group.rotation);
    const r = s.rover;
    this.rover.group.position.set(r.x, r.y, 0);
    this.rover.group.rotation.set(0, 0, r.th);
    this.rover.wheels[0].rotation.y = r.wl;
    this.rover.wheels[1].rotation.y = r.wr;
    this.collision.rover.position.set(r.x, r.y, 0);
    this.collision.rover.rotation.set(0, 0, r.th);

    // TF.
    const arrows = this.tfArrows.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let k = 0;
    for (const name of FRAME_NAMES) {
      const m = this.frameMats.get(name)!;
      const g = this.tfAxes.get(name)!;
      g.matrix.copy(m);
      g.matrixWorldNeedsUpdate = true;
      const parent = PARENT[name];
      if (!parent) continue;
      a.setFromMatrixPosition(m);
      b.setFromMatrixPosition(this.frameMats.get(parent)!);
      arrows.setXYZ(k++, a.x, a.y, a.z);
      arrows.setXYZ(k++, b.x, b.y, b.z);
    }
    arrows.needsUpdate = true;

    // Stations.
    const states = this.stationStates();
    states.forEach((st, i) => {
      const { mesh, label } = this.stations[i];
      mesh.material.color.set(
        this.tok(
          st.state === 'active' ? '--st-active' : st.state === 'next' ? '--st-next' : '--st-idle',
        ),
      );
      mesh.material.opacity = st.state === 'idle' ? 0.55 : 1;
      mesh.scale.z = st.state === 'active' ? 1.6 : 1;
      if (label.element.textContent !== st.text) label.element.textContent = st.text;
      const cls = `${this.cls.station} ${st.state === 'active' ? this.cls.stationActive : st.state === 'next' ? this.cls.stationNext : ''}`;
      if (label.element.className !== cls) label.element.className = cls;
    });
    const trailGeo = this.trail.geometry;
    (trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    trailGeo.setDrawRange(0, this.trailN);

    // Goal arrow at the rover's current goal while it is driving.
    this.goalArrow.visible = !!r.goal && r.mode !== 'idle';
    if (r.goal) {
      this.goalArrow.position.set(r.goal.x, r.goal.y, 0.03);
      this.goalArrow.rotation.set(0, 0, r.goal.yaw);
    }
    if (this.goalDraft) {
      this.goalArrow.visible = true;
      this.goalArrow.position.copy(this.goalDraft.at).setZ(0.03);
      this.goalArrow.rotation.set(0, 0, this.goalDraft.yaw);
    }

    // Interactive markers.
    this.imBall.position.set(s.ball.x, s.ball.y, 0.02);
    this.imQuad.position.set(q.sp.x, q.sp.y, q.sp.z);
    for (const h of this.imVisuals)
      h.material =
        this.hot &&
        (h.userData.handle === this.hot || (this.drag && this.drag.handle === h.userData.handle))
          ? this.imHot
          : this.imMat;

    // IMU: the accelerometer's vector, at the IMU.
    const f = new THREE.Vector3(...q.f);
    const len = f.length() * Number(this.displays.imu.props.scale);
    this.imuArrow.position.set(q.x, q.y, q.z + 0.02);
    if (len > 1e-3) {
      this.imuArrow.setDirection(f.normalize());
      this.imuArrow.setLength(len, Math.min(0.1, len * 0.25), Math.min(0.06, len * 0.15));
    }

    // Decay.
    const now = s.t;
    for (const [pool, key] of [
      [this.scanPool, 'scan'],
      [this.cloudPool, 'cloud'],
    ] as const) {
      const on = this.displays[key].on;
      const decay = Number(this.displays[key].props.decay);
      for (const p of pool)
        if (p)
          p.visible = on && p.userData.live && (p.userData.latest || now - p.userData.t <= decay);
    }

    if (this.selected) {
      this.selectBox.setFromObject(this.selected);
      this.selectBox.visible = true;
    } else this.selectBox.visible = false;

    if (this.clicked.visible) {
      const left = this.clickedUntil - performance.now();
      if (left <= 0) this.clicked.visible = false;
      else (this.clicked.material as THREE.MeshBasicMaterial).opacity = Math.min(1, left / 600);
    }

    // The camera's mount on the rover, in the world the camera sees.
    const cam = this.frameMats.get('camera_link')!;
    cam.decompose(this.camMount.position, this.camMount.quaternion, this.camMount.scale);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const cap = this.displays.global.props.fps === '30' ? 1000 / 31 : 0;
    if (cap && now - this.last < cap) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;

    if (this.playing) {
      this.clock += dt * this.rate;
      if (this.clock >= this.bag.duration) {
        if (this.loop) this.seek(0, false);
        else {
          this.clock = this.bag.duration;
          this.playing = false;
        }
      }
      this.stepTo(this.clock, now, true);
      this.dirty = true;
    }
    if (this.tween) this.stepTween(dt);
    if (this.view.type === 'follow') this.follow();
    else if (this.controls.update()) this.dirty = true;
    if (this.clicked.visible) this.dirty = true;

    if (this.dirty) {
      this.dirty = false;
      this.place();
      this.render();
      this.lastRender = now;
      this.frames++;
    }
    if (now - this.fpsAt >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt || 1));
      this.frames = 0;
      this.fpsAt = now;
    }
    if (now - this.lastSnap > (this.playing ? 70 : 250)) this.emit(now);
  };

  private render() {
    this.scene.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    const { w, h } = this.size;
    if (this.displays.image.on && w >= INSET.minW && h >= INSET.minH) {
      this.world.updateMatrixWorld();
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(INSET.x, INSET.y, INSET.w, INSET.h);
      this.renderer.setViewport(INSET.x, INSET.y, INSET.w, INSET.h);
      this.renderer.render(this.world, this.imgCam);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
    }
  }

  /** Runs the loop only while the view is on screen and the tab is visible. */
  private sync() {
    const go = this.inView && !document.hidden;
    if (go && !this.running) {
      this.running = true;
      this.last = 0;
      this.dirty = true;
      this.raf = requestAnimationFrame(this.frame);
    } else if (!go && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  private onVisibility = () => this.sync();

  /* -------------------------------------------------------------- snapshot */

  private flashText(text: string) {
    this.flash = { text, until: performance.now() + 3200 };
  }

  /** The status bar: what you are doing beats what just happened, which beats the tool's help. */
  private hint() {
    if (this.drag)
      return this.drag.handle === 'ball'
        ? 'Dragging the ball: the nearest robot will fetch it when you let go.'
        : 'Moving the quad setpoint: it flies there on its position controller.';
    const m = this.measure;
    if (this.tool === 'measure' && m.a) {
      const end = m.b ?? this.measureHover;
      if (end)
        return `Measure: ${m.a.distanceTo(end).toFixed(3)} m from (${m.a.x.toFixed(2)}, ${m.a.y.toFixed(2)}) to (${end.x.toFixed(2)}, ${end.y.toFixed(2)})${m.b ? '. Click to start again.' : ''}`;
    }
    if (this.hot && this.tool === 'interact')
      return this.hot === 'ball'
        ? 'Ball: drag in the plane to place it.'
        : this.hot === 'quadXY'
          ? 'quad/setpoint: drag the disc to move in x and y.'
          : 'quad/setpoint: drag an arrow to change the height.';
    if (performance.now() < this.flash.until) return this.flash.text;
    if (this.touch && (this.tool === 'interact' || this.tool === 'move'))
      return `${this.tool === 'interact' ? 'Drag a marker handle to move it. Elsewhere, o' : 'O'}ne finger rotates, two fingers pan and pinch to zoom.`;
    return TOOLS.find((t) => t.id === this.tool)!.hint;
  }

  private touch = matchMedia('(pointer: coarse)').matches;

  private measureHover: THREE.Vector3 | null = null;

  private frameEcho(name: string): { lines: EchoLine[]; note: string } {
    this.computeFrames();
    const fixed = String(this.displays.global.props.fixed);
    const m = this.frameMats.get(name);
    if (!m) return { lines: [], note: `Frame ${name} does not exist.` };
    const rel = new THREE.Matrix4().multiplyMatrices(this.fixedInv, m);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    rel.decompose(p, q, new THREE.Vector3());
    const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
    const f = (v: number) => v.toFixed(3);
    const deg = (v: number) => ((v * 180) / Math.PI).toFixed(3);
    return {
      note: `Transform ${fixed} → ${name}, at sim time ${this.sim.t.toFixed(3)}`,
      lines: [
        { depth: 0, key: 'At time', value: this.sim.t.toFixed(3), kind: 'num' },
        {
          depth: 0,
          key: 'Translation',
          value: `[${f(p.x)}, ${f(p.y)}, ${f(p.z)}]`,
          kind: 'arr',
          dash: true,
        },
        { depth: 0, key: 'Rotation', value: '', dash: true },
        {
          depth: 1,
          key: 'in Quaternion',
          value: `[${f(q.x)}, ${f(q.y)}, ${f(q.z)}, ${f(q.w)}]`,
          kind: 'arr',
        },
        {
          depth: 1,
          key: 'in RPY (radian)',
          value: `[${f(e.x)}, ${f(e.y)}, ${f(e.z)}]`,
          kind: 'arr',
        },
        {
          depth: 1,
          key: 'in RPY (degree)',
          value: `[${deg(e.x)}, ${deg(e.y)}, ${deg(e.z)}]`,
          kind: 'arr',
        },
        { depth: 0, key: 'parent', value: `"${PARENT[name] ?? '(root)'}"`, kind: 'str' },
      ],
    };
  }

  private emit(now: number) {
    this.lastSnap = now;
    const topics = TOPICS.map((def) => {
      const m = this.meters.get(def.name)!;
      const { hz, bw } = m.stats(now);
      return {
        name: def.name,
        type: def.type,
        hz: def.latched
          ? this.latest.has(def.name)
            ? 'latched'
            : '—'
          : fmtHz(this.playing ? hz : null),
        bw: def.latched ? '—' : fmtBw(this.playing ? bw : null),
        count: m.count,
      };
    });
    let echoLines: EchoLine[] = [];
    let note = '';
    if (this.inspect.kind === 'topic') {
      const msg = this.latest.get(this.inspect.name);
      const def = TOPICS.find((t) => t.name === this.inspect.name);
      if (msg) {
        echoLines = echo(msg, this.noarr);
        note = `${def?.type ?? ''} · seq ${this.meters.get(this.inspect.name)?.count ?? 0}`;
      } else
        note =
          this.inspect.name === '/goal_pose'
            ? 'Nothing yet. Use 2D Nav Goal (G) to send one.'
            : this.inspect.name === '/clicked_point'
              ? 'Nothing yet. Use Publish Point (U) to send one.'
              : 'No messages received yet.';
    } else {
      const e = this.frameEcho(this.inspect.name);
      echoLines = e.lines;
      note = e.note;
    }
    const cam = this.camera.position;
    const tgt = this.controls.target;
    const off = cam.clone().sub(tgt);
    const ox = off.x;
    const oy = -off.z;
    const oz = off.y;
    const focal = this.ros.worldToLocal(tgt.clone());
    const scanN = this.scanPool.filter((p) => p?.visible).length;
    const cloudN = this.cloudPool.filter((p) => p?.visible);
    const sim = this.sim;
    const snap: Snapshot = {
      ready: true,
      bag: this.bagIdx,
      t: sim.t,
      duration: this.bag.duration,
      card: cardAt(this.bag, sim.t),
      playing: this.playing,
      rate: this.rate,
      loop: this.loop,
      simTime: sim.t,
      wallTime: (performance.timeOrigin + now) / 1000,
      wallElapsed: (now - this.wallStart) / 1000,
      topics,
      echo: echoLines,
      echoNote: note,
      hint: this.hint(),
      fps: this.fps,
      view: {
        distance:
          this.camera === this.persp
            ? off.length().toFixed(2)
            : `zoom ${this.ortho.zoom.toFixed(2)}`,
        yaw: Math.atan2(oy, ox).toFixed(3),
        pitch: Math.atan2(oz, Math.hypot(ox, oy)).toFixed(3),
        focal: `${focal.x.toFixed(2)}; ${focal.y.toFixed(2)}; ${focal.z.toFixed(2)}`,
      },
      status: {
        global: `Fixed Frame [${this.displays.global.props.fixed}] OK`,
        grid: `${this.displays.grid.props.cells} × ${this.displays.grid.props.cells} cells of ${this.displays.grid.props.size} m`,
        map: `Map received: ${GRID.w} × ${GRID.h} at ${GRID.res} m/cell`,
        tf: `${FRAME_NAMES.length} frames, ${FRAME_NAMES.length - 1} transforms`,
        robot: `Robot models loaded: ${TEAM + 2} robots, ${this.sim.bots.length + 3} links tracked`,
        scan: `Showing [${scanN * SCAN.n}] points from [${scanN}] messages`,
        cloud: `Showing [${cloudN.reduce((n, p) => n + (p.userData.n as number), 0)}] points from [${cloudN.length}] messages`,
        path: sim.rover.planNote,
        odom: `${this.odomMesh.count} arrows`,
        markers: `${STATIONS.length * 2 + 2} markers in 3 namespaces`,
        im: '2 interactive markers: ball, quad/setpoint',
        imu: `|a| = ${Math.hypot(...sim.quad.f).toFixed(2)} m/s²`,
        image:
          this.size.w >= INSET.minW && this.size.h >= INSET.minH
            ? `${IMAGE.w} × ${IMAGE.h} rgb8, ${this.images} images`
            : 'View too small for the image inset',
      },
      colors: { ...this.colours },
    };
    this.store.set(snap);
  }

  /* -------------------------------------------------------------- picking */

  private ndc(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  /** The pointer's ray, in the map frame. */
  private mapRay(e: PointerEvent) {
    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const inv = this.mapG.matrixWorld.clone().invert();
    const o = this.raycaster.ray.origin.clone().applyMatrix4(inv);
    const d = this.raycaster.ray.direction.clone().transformDirection(inv);
    return { o, d };
  }

  private onPlane(e: PointerEvent, z: number) {
    const { o, d } = this.mapRay(e);
    if (Math.abs(d.z) < 1e-6) return null;
    const t = (z - o.z) / d.z;
    return t > 0 ? o.add(d.multiplyScalar(t)) : null;
  }

  /** What the pointer is over: a robot (with its frame), else the ground, in the map frame. */
  private pick(
    e: PointerEvent,
  ): { at: THREE.Vector3; frame: string | null; object: THREE.Object3D | null } | null {
    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const targets: THREE.Object3D[] = [...this.bots, this.ball, this.quad.group, this.rover.group];
    const hits = this.robotRoot.visible ? this.raycaster.intersectObjects(targets, true) : [];
    const inv = this.mapG.matrixWorld.clone().invert();
    if (hits[0]) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !targets.includes(o)) o = o.parent;
      return {
        at: hits[0].point.clone().applyMatrix4(inv),
        frame: (hits[0].object.userData.frame as string) ?? null,
        object: o,
      };
    }
    const g = this.onPlane(e, 0);
    return g ? { at: g, frame: null, object: null } : null;
  }

  private pickHandle(e: PointerEvent): Handle | null {
    if (!this.imRoot.visible) return null;
    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = this.raycaster.intersectObjects(this.handles, false)[0];
    return hit ? (hit.object.userData.handle as Handle) : null;
  }

  private setHot(h: Handle | null) {
    if (h === this.hot) return;
    this.hot = h;
    if (this.tool === 'interact') this.stage.style.cursor = h ? 'grab' : '';
    this.dirty = true;
    this.emit(performance.now());
  }

  /* -------------------------------------------------------------- pointer */

  private primary(e: PointerEvent) {
    return e.isPrimary && (e.pointerType !== 'mouse' || e.button === 0);
  }

  private onContext = (e: Event) => e.preventDefault();

  private onDown = (e: PointerEvent) => {
    if (!this.primary(e)) return;
    if (this.tool === 'move') return;
    if (this.tool === 'interact') {
      const h = this.pickHandle(e);
      if (!h) return;
      e.stopPropagation();
      e.preventDefault();
      const s = this.sim;
      const z = h === 'ball' ? BALL_R : s.quad.sp.z;
      const p = h === 'quadZ' ? null : this.onPlane(e, z);
      const cx = h === 'ball' ? s.ball.x : s.quad.sp.x;
      const cy = h === 'ball' ? s.ball.y : s.quad.sp.y;
      this.drag = { handle: h, off: new THREE.Vector2(p ? p.x - cx : 0, p ? p.y - cy : 0), z };
      this.hot = h;
      this.dragT = s.t;
      this.stage.style.cursor = 'grabbing';
      this.dirty = true;
      this.emit(performance.now());
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    this.down = { x: e.clientX, y: e.clientY };
    if (this.tool === 'goal') {
      const p = this.onPlane(e, 0);
      if (p) this.goalDraft = { at: p, yaw: this.sim.rover.th };
      this.dirty = true;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (this.drag) {
      e.stopPropagation();
      this.dragTo(e, false);
      return;
    }
    if (this.tool === 'interact' && e.buttons === 0) this.setHot(this.pickHandle(e));
    if (this.tool === 'goal' && this.goalDraft && e.buttons) {
      e.stopPropagation();
      const p = this.onPlane(e, 0);
      if (p && p.distanceTo(this.goalDraft.at) > 0.05)
        this.goalDraft.yaw = Math.atan2(p.y - this.goalDraft.at.y, p.x - this.goalDraft.at.x);
      this.dirty = true;
    }
    if (this.tool === 'measure' && this.measure.a && !this.measure.b) {
      const p = this.pick(e);
      this.measureHover = p?.at ?? null;
      this.drawMeasure();
    }
  };

  private onUp = (e: PointerEvent) => {
    if (this.drag) {
      this.dragTo(e, true);
      this.drag = null;
      this.stage.style.cursor = this.tool === 'interact' ? (this.hot ? 'grab' : '') : 'crosshair';
      this.dirty = true;
      this.emit(performance.now());
      return;
    }
    if (!this.down || !this.primary(e)) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    const t = this.tool;
    if (t === 'goal') {
      const g = this.goalDraft;
      this.goalDraft = null;
      if (g) this.sendGoal(g.at.x, g.at.y, g.yaw);
      this.done();
      return;
    }
    if (moved > 6) return;
    const p = this.pick(e);
    if (t === 'select') {
      this.selected = p?.object ?? null;
      this.selectedFrame = p?.object ? p.frame : null;
      const frame = this.selectedFrame === 'ball' ? null : this.selectedFrame;
      this.hooks.current.select(frame);
      this.flashText(p?.object ? `Selected ${this.selectedFrame}.` : 'Selection cleared.');
    } else if (t === 'focus' && p) {
      this.tweenTo(p.at.clone().applyMatrix4(this.mapG.matrixWorld));
      this.done();
    } else if (t === 'point' && p) {
      const fixed = String(this.displays.global.props.fixed);
      // Published in the fixed frame, as the tool does.
      const pf = p.at.clone().applyMatrix4(this.fixedInv);
      this.publish(
        '/clicked_point',
        pointStamped(this.nextSeq('/clicked_point'), this.sim.t, fixed, pf.x, pf.y, pf.z),
        performance.now(),
      );
      this.clicked.position.copy(p.at);
      this.clicked.visible = true;
      this.clickedUntil = performance.now() + 1500;
      this.flashText(
        `Published /clicked_point (${pf.x.toFixed(3)}, ${pf.y.toFixed(3)}, ${pf.z.toFixed(3)}) in ${fixed}.`,
      );
      this.done();
    } else if (t === 'measure' && p) {
      const m = this.measure;
      if (!m.a || m.b) {
        m.a = p.at.clone();
        m.b = null;
      } else m.b = p.at.clone();
      this.flash.until = 0;
      this.measureHover = null;
      this.drawMeasure();
    }
    this.dirty = true;
  };

  private dragTo(e: PointerEvent, commit: boolean) {
    const d = this.drag!;
    const s = this.sim;
    let ev: SimEvent | null = null;
    if (d.handle === 'quadZ') {
      // The closest point on the vertical line through the setpoint to the pointer's ray.
      const { o, d: dir } = this.mapRay(e);
      const w0 = new THREE.Vector3(s.quad.sp.x, s.quad.sp.y, 0).sub(o);
      const b = dir.z;
      const den = 1 - b * b;
      if (den > 1e-6) {
        const z = (b * w0.dot(dir) - w0.z) / den;
        ev = {
          t: s.t,
          kind: 'setpoint',
          x: s.quad.sp.x,
          y: s.quad.sp.y,
          z: Math.min(2.5, Math.max(0.2, -z)),
        };
      }
    } else {
      const p = this.onPlane(e, d.z);
      if (p) {
        const x = p.x - d.off.x;
        const y = p.y - d.off.y;
        ev =
          d.handle === 'ball'
            ? { t: s.t, kind: 'ball', x, y }
            : { t: s.t, kind: 'setpoint', x, y, z: s.quad.sp.z };
      }
    }
    if (!ev) return;
    if (commit) {
      this.dropAfter(this.dragT);
      this.userEvents.push(ev);
      s.push(ev);
      if (ev.kind === 'setpoint')
        this.publish(
          '/quad/setpoint',
          poseStamped(this.nextSeq('/quad/setpoint'), s.t, 'map', ev.x, ev.y, ev.z, s.quad.sp.yaw),
          performance.now(),
        );
    } else s.applyNow(ev);
    this.dirty = true;
  }

  private sendGoal(x: number, y: number, yaw: number) {
    const s = this.sim;
    const ev: SimEvent = { t: s.t, kind: 'goal', x, y, yaw };
    this.dropAfter(s.t);
    this.userEvents.push(ev);
    s.push(ev);
    this.publish(
      '/goal_pose',
      poseStamped(this.nextSeq('/goal_pose'), s.t, 'map', x, y, 0, yaw),
      performance.now(),
    );
    this.events(performance.now());
    this.flashText(
      `Goal (${x.toFixed(2)}, ${y.toFixed(2)}, ${yaw.toFixed(2)} rad): ${s.rover.planNote}.`,
    );
  }

  private done() {
    this.hooks.current.toolDone();
  }

  private clearMeasure() {
    const m = this.measure;
    m.a = m.b = null;
    this.measureHover = null;
    this.drawMeasure();
  }

  private drawMeasure() {
    const m = this.measure;
    const end = m.b ?? this.measureHover;
    if (!m.a || !end) {
      m.line.visible = false;
      if (m.label) m.label.visible = false;
      this.dirty = true;
      return;
    }
    m.line.geometry.dispose();
    m.line.geometry = new THREE.BufferGeometry().setFromPoints([m.a, end]);
    m.line.visible = true;
    if (!m.label) {
      const el = document.createElement('div');
      el.className = this.cls.measure;
      m.label = new CSS2DObject(el);
      this.mapG.add(m.label);
    }
    m.label.visible = true;
    m.label.position.copy(m.a).add(end).multiplyScalar(0.5);
    m.label.element.textContent = `${m.a.distanceTo(end).toFixed(3)} m`;
    this.dirty = true;
  }

  /* -------------------------------------------------------------- teardown */

  dispose() {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.stage.removeEventListener('pointerdown', this.onDown, { capture: true });
    this.stage.removeEventListener('pointermove', this.onMove, { capture: true });
    window.removeEventListener('pointerup', this.onUp);
    this.stage.removeEventListener('contextmenu', this.onContext);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resize.disconnect();
    this.seen.disconnect();
    this.orbitP.dispose();
    this.orbitO.dispose();
    const textures = new Set<THREE.Texture>([this.mapTex]);
    for (const root of [this.scene, this.world]) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        for (const m of mats) {
          const map = (m as THREE.MeshBasicMaterial).map;
          if (map) textures.add(map);
          m.dispose();
        }
      });
    }
    for (const m of [
      this.scanMat,
      this.cloudMat,
      ...this.axisMats,
      this.imMat,
      this.imHot,
      this.goalMat,
    ])
      m.dispose();
    textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
