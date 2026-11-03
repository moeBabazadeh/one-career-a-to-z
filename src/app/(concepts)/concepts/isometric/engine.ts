// The viewer's engine: a three.js scene with orbit controls, a studio environment, per-part
// materials for the four display modes, exploded views, a section plane with stencil-capped,
// hatched cut faces, point-to-point measurement that snaps to vertices, and picking. It renders
// on demand (nothing runs while the view is still), pauses while hidden, and cleans up after
// itself. React drives it through the methods below and hears back through Callbacks.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  boardTexture,
  buildShape,
  cornersOf,
  footprint,
  hashOf,
  hatchTexture,
  lcdTexture,
  markTexture,
  massOf,
  PBR,
  plateTexture,
  shadowTexture,
  type BoardPart,
  type Built,
  type Fonts,
} from './geometry';
import { FLAT, type DeviceId, type Explode, type Flat, type Item, type V3 } from './models';

export type RenderMode = 'shaded' | 'edges' | 'wire' | 'xray';
export type Axis = 'x' | 'y' | 'z';
export type Projection = 'persp' | 'ortho';

export interface Section {
  on: boolean;
  axis: Axis;
  flip: boolean;
  /** Where the plane sits across the model, 0 to 1. */
  offset: number;
  caps: boolean;
}

export interface Measure {
  id: number;
  a: V3;
  b: V3;
  d: number;
  delta: V3;
}

export interface PartStats {
  size: V3;
  center: V3;
  volume: number;
  area: number;
  tris: number;
}

export interface Totals {
  tris: number;
  size: V3;
  parts: number;
}

export interface Theme {
  edge: string;
  wire: string;
  select: string;
  hover: string;
  section: string;
  measure: string;
  grid: string;
  gridMajor: string;
  lines: string;
  shadow: number;
  env: number;
  key: number;
}

export interface Classes {
  snap: string;
  pin: string;
  tag: string;
}

export interface Callbacks {
  onHover(id: string | null): void;
  onPick(id: string | null, e: { additive: boolean; double: boolean }): void;
  onContext(id: string | null, x: number, y: number): void;
  onExplode(model: DeviceId, t: number): void;
  onSection(model: DeviceId, s: Section): void;
  onMeasures(model: DeviceId, list: Measure[], pending: boolean): void;
  onStats(model: DeviceId, stats: Record<string, PartStats>, totals: Totals): void;
  onCursor(p: V3 | null, snap: 'vertex' | 'face' | null): void;
}

interface NodeView {
  obj: THREE.Object3D;
  base: THREE.Vector3;
  ex: Explode;
}

interface PartView {
  id: string;
  item: Item;
  index: number;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  edges: THREE.LineSegments;
  edgeGeo: [THREE.BufferGeometry, THREE.BufferGeometry];
  decals: THREE.MeshStandardMaterial[];
  stencil: THREE.Mesh[];
  cap: THREE.Mesh;
  translucent: boolean;
  opacity: number;
  glow: THREE.Color | null;
  corners: Float32Array;
  home: THREE.Vector3;
  visible: boolean;
  look: string;
}

interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  zoom: number;
}

interface ModelView {
  id: DeviceId;
  flat: Flat;
  root: THREE.Group;
  nodes: NodeView[];
  parts: Map<string, PartView>;
  list: PartView[];
  bounds: THREE.Box3;
  radius: number;
  explode: number;
  section: Section;
  measures: Measure[];
  pose: Pose | null;
  caps: THREE.Group;
  capGeo: THREE.PlaneGeometry;
  lines: THREE.LineSegments;
  stats: Record<string, PartStats>;
  totals: Totals;
  disposables: { dispose(): void }[];
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const AXES: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const SNAP_PX = 14;
const FOV = 32;
const ORTHO = 1;

/** The direction each named view looks from. */
export const VIEWS = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  iso: [1, 1, 1],
  home: [1, 0.72, 1.3],
} satisfies Record<string, V3>;

export type ViewName = keyof typeof VIEWS;

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private controls: OrbitControls;
  private envTex: THREE.Texture;
  private key = new THREE.DirectionalLight(0xffffff, 1.2);
  private fill = new THREE.DirectionalLight(0xffffff, 0.35);
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6);
  private models = new Map<DeviceId, ModelView>();
  private mv: ModelView | null = null;
  private geoCache = new Map<
    string,
    Built & { edges: THREE.EdgesGeometry; wire: THREE.EdgesGeometry; corners: Float32Array }
  >();
  private hatch = hatchTexture();
  private shadowTex = shadowTexture();

  private edgeMat = new THREE.LineBasicMaterial({
    color: 0x1a1f26,
    transparent: true,
    opacity: 0.55,
  });
  private wireMat = new THREE.LineBasicMaterial({
    color: 0x1a1f26,
    transparent: true,
    opacity: 0.85,
  });
  private ghostMat = new THREE.LineBasicMaterial({
    color: 0x1a1f26,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  private selMat = new THREE.LineBasicMaterial({ color: 0x3a7bd5 });
  private hovMat = new THREE.LineBasicMaterial({
    color: 0x3a7bd5,
    transparent: true,
    opacity: 0.8,
  });
  private stencilBase = new THREE.MeshBasicMaterial({
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
  });
  private stencilBack: THREE.MeshBasicMaterial;
  private stencilFront: THREE.MeshBasicMaterial;

  private grid: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private gizmo = new THREE.Group();
  private gizmoFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private gizmoEdge: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private arrow = new THREE.Group();
  private arrowMat = new THREE.MeshBasicMaterial({
    color: 0xf2a541,
    depthTest: false,
    transparent: true,
  });
  private handle: THREE.Mesh;
  private measureLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private rubber: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  private mode: RenderMode = 'edges';
  private selected = new Set<string>();
  private preselect = new Set<string>();
  private hovered: string | null = null;
  private hidden = new Set<string>();
  private isolated: Set<string> | null = null;
  private measuring = false;
  private pendingA: THREE.Vector3 | null = null;
  private snapPoint: { p: THREE.Vector3; kind: 'vertex' | 'face' } | null = null;
  private explodeLines = true;
  private reduced = false;
  private active = true;
  private disposed = false;
  private frame = 0;
  private hoverFrame = 0;
  private lastPointer: { x: number; y: number } | null = null;
  private down: { x: number; y: number; button: number; t: number } | null = null;
  private drag: { s0: number } | null = null;
  private camTween: {
    t0: number;
    dur: number;
    q: THREE.Quaternion;
    dir0: THREE.Vector3;
    d0: number;
    d1: number;
    c0: THREE.Vector3;
    c1: THREE.Vector3;
    z0: number;
    z1: number;
  } | null = null;
  private exTween: { t0: number; dur: number; from: number; to: number } | null = null;
  private viewSubs = new Set<(css: string, m: ArrayLike<number>) => void>();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private overlay: HTMLElement;
  private snapEl: HTMLDivElement;
  private pins: { a: HTMLDivElement; b: HTMLDivElement; tag: HTMLDivElement; m: Measure }[] = [];
  private pendingPin: HTMLDivElement;
  private resize: ResizeObserver;
  private onVisibility = () => !document.hidden && this.invalidate();
  private theme: Theme | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    overlay: HTMLElement,
    private cb: Callbacks,
    private fonts: Fonts,
    private classes: Classes,
  ) {
    this.overlay = overlay;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      stencil: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTex = pmrem.fromScene(room, 0.035).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.envTex;
    this.key.position.set(4, 9, 6);
    this.fill.position.set(-6, 3, -4);
    this.scene.add(this.key, this.fill);

    this.persp = new THREE.PerspectiveCamera(FOV, 1, 0.05, 500);
    this.ortho = new THREE.OrthographicCamera(-ORTHO, ORTHO, ORTHO, -ORTHO, 0.05, 1000);
    this.camera = this.persp;

    this.stencilBack = this.stencilBase.clone();
    this.stencilBack.side = THREE.BackSide;
    this.stencilBack.clippingPlanes = [this.plane];
    this.stencilBack.stencilFail =
      this.stencilBack.stencilZFail =
      this.stencilBack.stencilZPass =
        THREE.IncrementWrapStencilOp;
    this.stencilFront = this.stencilBase.clone();
    this.stencilFront.side = THREE.FrontSide;
    this.stencilFront.clippingPlanes = [this.plane];
    this.stencilFront.stencilFail =
      this.stencilFront.stencilZFail =
      this.stencilFront.stencilZPass =
        THREE.DecrementWrapStencilOp;
    for (const m of [this.edgeMat, this.wireMat, this.ghostMat, this.selMat, this.hovMat])
      m.clippingPlanes = [this.plane];

    this.grid = this.makeGrid();
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        map: this.shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.3,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = -2;
    this.scene.add(this.grid, this.shadow);

    // Section gizmo: a translucent plane, its outline, and an arrow to drag along the normal.
    const gmat = new THREE.MeshBasicMaterial({
      color: 0xf2a541,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.gizmoFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gmat);
    const eg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
    ]);
    this.gizmoEdge = new THREE.LineLoop(
      eg,
      new THREE.LineBasicMaterial({ color: 0xf2a541, transparent: true, opacity: 0.9 }),
    );
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.8, 12).translate(0, 0.4, 0),
      this.arrowMat,
    );
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.22, 20).translate(0, 0.9, 0),
      this.arrowMat,
    );
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), this.arrowMat);
    this.handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8).translate(0, 0.55, 0),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    for (const m of [shaft, cone, knob]) m.renderOrder = 999;
    this.arrow.add(shaft, cone, knob, this.handle);
    this.gizmo.add(this.gizmoFill, this.gizmoEdge, this.arrow);
    this.gizmo.visible = false;
    this.scene.add(this.gizmo);

    this.measureLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xe8912d, depthTest: false, transparent: true }),
    );
    this.measureLines.renderOrder = 1000;
    this.rubber = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xe8912d,
        depthTest: false,
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.rubber.renderOrder = 1000;
    this.rubber.visible = false;
    this.scene.add(this.measureLines, this.rubber);

    this.snapEl = document.createElement('div');
    this.snapEl.className = classes.snap;
    this.snapEl.hidden = true;
    this.pendingPin = document.createElement('div');
    this.pendingPin.className = classes.pin;
    this.pendingPin.hidden = true;
    overlay.append(this.snapEl, this.pendingPin);

    // Our pointer handlers go first, so a drag on the section arrow never starts an orbit.
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('dblclick', this.onDouble);
    canvas.addEventListener('contextmenu', this.onContextMenu);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.14;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;
    this.controls.rotateSpeed = 0.8;
    this.controls.addEventListener('change', () => this.invalidate());
    this.controls.addEventListener('start', () => {
      this.camTween = null;
    });

    this.resize = new ResizeObserver(() => this.fit2size());
    this.resize.observe(canvas.parentElement ?? canvas);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.fit2size();
  }

  /* ------------------------------------------------------------------ building */

  private makeGrid() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      uniforms: {
        uMinor: { value: new THREE.Color(0x9aa4b0) },
        uMajor: { value: new THREE.Color(0x7f8c99) },
        uCenter: { value: new THREE.Vector3() },
        uFade: { value: 20 },
        uStep: { value: 1 },
        uAlpha: { value: 0.6 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uMinor;
        uniform vec3 uMajor;
        uniform vec3 uCenter;
        uniform float uFade;
        uniform float uStep;
        uniform float uAlpha;
        varying vec3 vWorld;
        float lineAt(vec2 p, float step) {
          vec2 q = p / step;
          vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }
        void main() {
          vec2 p = vWorld.xz;
          float minor = lineAt(p, uStep);
          float major = lineAt(p, uStep * 5.0);
          float d = length(vWorld.xz - uCenter.xz);
          float fade = 1.0 - smoothstep(uFade * 0.3, uFade, d);
          float a = max(minor * 0.45, major) * fade * uAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(uMinor, uMajor, major), a);
          #include <colorspace_fragment>
        }`,
    });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    g.rotation.x = -Math.PI / 2;
    g.renderOrder = -1;
    return g;
  }

  private shapeOf(item: Item) {
    const node = item.node;
    const key = `${node.mat}|${JSON.stringify(node.shape)}`;
    let entry = this.geoCache.get(key);
    if (!entry) {
      const built = buildShape(node.shape!, node.mat ?? 'shell');
      const edges = new THREE.EdgesGeometry(built.geo, 28);
      // Revolved parts have few creases; wireframe draws their facets too, so they don't vanish.
      const curved = ['lathe', 'cyl', 'tube', 'ecap', 'valve', 'sensor', 'screw'].includes(
        node.shape!.t,
      );
      entry = {
        ...built,
        edges,
        wire: curved ? new THREE.EdgesGeometry(built.geo, 11) : edges,
        corners: cornersOf(built.geo),
      };
      this.geoCache.set(key, entry);
    }
    return entry;
  }

  private build(id: DeviceId): ModelView {
    const flat = FLAT[id];
    const model = flat.model;
    const root = new THREE.Group();
    root.name = model.tag;
    const objs = new Map<string, THREE.Object3D>();
    const nodes: NodeView[] = [];
    const parts = new Map<string, PartView>();
    const list: PartView[] = [];
    const disposables: { dispose(): void }[] = [];
    const caps = new THREE.Group();
    let capGeo = new THREE.PlaneGeometry(1, 1);

    for (const itemId of flat.order) {
      const it = flat.items[itemId];
      const node = it.node;
      const parent = it.parent ? (objs.get(it.parent) as THREE.Object3D) : root;
      let obj: THREE.Object3D;
      if (it.part) {
        const entry = this.shapeOf(it);
        const look = PBR[node.mat ?? 'shell'];
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: look.rough,
          metalness: look.metal,
          clippingPlanes: [this.plane],
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
          transparent: look.opacity !== undefined,
          opacity: look.opacity ?? 1,
          depthWrite: look.opacity === undefined,
        });
        disposables.push(mat);
        const mesh = new THREE.Mesh(entry.geo, mat);
        const at = it.instance?.at;
        const pos = at ? [at[0], at[1], at[2]] : (node.pos ?? [0, 0, 0]);
        const rot = node.rot ?? [0, 0, 0];
        mesh.position.set(pos[0], pos[1], pos[2]);
        mesh.rotation.set(rot[0], rot[1] + (at?.[3] ?? 0), rot[2]);
        mesh.name = itemId;
        const edges = new THREE.LineSegments(entry.edges, this.edgeMat);
        edges.raycast = () => {};
        mesh.add(edges);

        const decals: THREE.MeshStandardMaterial[] = [];
        const dc = node.decal;
        if (dc) {
          let tex: THREE.Texture | null = null;
          let w = 0,
            h = 0;
          const plane = new THREE.Object3D();
          if (dc.kind === 'pcb' && entry.top && node.shape?.t === 'board') {
            const s = node.shape;
            tex = boardTexture({
              w: s.w,
              d: s.d,
              round: s.round,
              r: s.r,
              outline: s.outline,
              holes: s.holes,
              parts: this.boardParts(flat, it),
              tag: model.tag,
              spin: flat.items[it.parent!]?.node.spin ?? 0,
              seed: hashOf(itemId + model.tag),
              fonts: this.fonts,
            });
            [w, h] = [s.w, s.d];
            plane.position.set(0, entry.top.y + 0.002, 0);
            plane.rotation.x = -Math.PI / 2;
          } else if ((dc.kind === 'mark' || dc.kind === 'lcd') && entry.top) {
            const t = entry.top;
            tex =
              dc.kind === 'mark'
                ? markTexture(dc.text, t.w, t.d, this.fonts, node.shape?.t === 'module')
                : lcdTexture(model.tag, this.fonts, hashOf(model.tag));
            [w, h] = [t.w, t.d];
            plane.position.set(t.x, t.y + 0.003, t.z);
            plane.rotation.x = -Math.PI / 2;
          } else if (dc.kind === 'plate' && node.shape?.t === 'box') {
            const s = node.shape;
            tex = plateTexture(dc.lines, s.w, s.h, this.fonts, dc.vertical);
            [w, h] = [s.w, s.h];
            plane.position.set(0, s.h / 2, s.d / 2 + 0.002);
          }
          if (tex) {
            const dmat = new THREE.MeshStandardMaterial({
              map: tex,
              transparent: true,
              depthWrite: false,
              roughness: dc.kind === 'lcd' ? 0.2 : 0.55,
              metalness: 0,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
              clippingPlanes: [this.plane],
              ...(dc.kind === 'lcd'
                ? { emissive: new THREE.Color(0xffffff), emissiveMap: tex, emissiveIntensity: 0.55 }
                : {}),
            });
            const geo = new THREE.PlaneGeometry(w, h);
            const dm = new THREE.Mesh(geo, dmat);
            dm.position.copy(plane.position);
            dm.rotation.copy(plane.rotation);
            dm.renderOrder = 1;
            dm.raycast = () => {};
            mesh.add(dm);
            decals.push(dmat);
            disposables.push(tex, dmat, geo);
          }
        }

        const index = list.length;
        const stencil = [this.stencilBack, this.stencilFront].map((m) => {
          const s = new THREE.Mesh(entry.geo, m);
          s.renderOrder = 10 + index * 2;
          s.visible = false;
          s.raycast = () => {};
          mesh.add(s);
          return s;
        });
        const capColor = new THREE.Color(look.color).lerp(new THREE.Color(0xffffff), 0.12);
        const capMat = new THREE.MeshBasicMaterial({
          color: capColor,
          map: this.hatch,
          side: THREE.DoubleSide,
          stencilWrite: true,
          stencilRef: 0,
          stencilFunc: THREE.NotEqualStencilFunc,
          stencilFail: THREE.ReplaceStencilOp,
          stencilZFail: THREE.ReplaceStencilOp,
          stencilZPass: THREE.ReplaceStencilOp,
        });
        disposables.push(capMat);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.renderOrder = 10 + index * 2 + 1;
        cap.visible = false;
        cap.onAfterRender = (r) => r.clearStencil();
        cap.raycast = () => {};
        caps.add(cap);

        const pv: PartView = {
          id: itemId,
          item: it,
          index,
          mesh,
          mat,
          edges,
          edgeGeo: [entry.edges, entry.wire],
          decals,
          stencil,
          cap,
          translucent: look.opacity !== undefined,
          opacity: look.opacity ?? 1,
          glow: look.glow ? new THREE.Color(look.color) : null,
          corners: entry.corners,
          home: new THREE.Vector3(),
          visible: true,
          look: '',
        };
        parts.set(itemId, pv);
        list.push(pv);
        obj = mesh;
      } else {
        obj = new THREE.Group();
        obj.name = itemId;
        if (!it.pattern) {
          const p = node.pos ?? [0, 0, 0];
          const r = node.rot ?? [0, 0, 0];
          obj.position.set(p[0], p[1], p[2]);
          obj.rotation.set(r[0], r[1], r[2]);
        }
      }
      parent.add(obj);
      objs.set(itemId, obj);
      if (node.ex && !(it.part && it.instance))
        nodes.push({ obj, base: obj.position.clone(), ex: node.ex });
    }

    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    const stats: Record<string, PartStats> = {};
    let tris = 0;
    const box = new THREE.Box3();
    for (const p of list) {
      box.copy(p.mesh.geometry.boundingBox as THREE.Box3).applyMatrix4(p.mesh.matrixWorld);
      if (p.item.node.kind !== 'reference') bounds.union(box);
      box.getCenter(p.home);
      const mass = massOf(p.mesh.geometry);
      tris += mass.tris;
      const size = box.getSize(new THREE.Vector3());
      stats[p.id] = {
        size: [size.x, size.y, size.z],
        center: [p.home.x, p.home.y, p.home.z],
        volume: mass.volume,
        area: mass.area,
        tris: mass.tris,
      };
    }
    const sz = bounds.getSize(new THREE.Vector3());
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    // The caps are one big quad on the section plane; the stencil trims each to its part.
    capGeo.dispose();
    capGeo = new THREE.PlaneGeometry(radius * 6, radius * 6);
    disposables.push(capGeo);
    for (const p of list) p.cap.geometry = capGeo;

    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0x7f8c99,
        dashSize: radius * 0.02,
        gapSize: radius * 0.014,
        transparent: true,
        opacity: 0.8,
      }),
    );
    lines.visible = false;
    lines.renderOrder = 5;
    lines.raycast = () => {};
    disposables.push(lines.geometry, lines.material as THREE.Material);
    root.add(caps, lines);

    const axis: Axis = model.axis === 'X' ? 'z' : 'x';
    return {
      id,
      flat,
      root,
      nodes,
      parts,
      list,
      bounds,
      radius,
      explode: 0,
      section: { on: false, axis, flip: false, offset: 0.5, caps: true },
      measures: [],
      pose: null,
      caps,
      capGeo,
      lines,
      stats,
      totals: {
        tris,
        size: [sz.x, sz.y, sz.z],
        parts: list.filter((p) => p.item.node.kind !== 'reference').length,
      },
      disposables,
    };
  }

  /** The parts that sit on a board, in the board's frame, for its silkscreen. */
  private boardParts(flat: Flat, board: Item): BoardPart[] {
    const group = board.parent ? flat.items[board.parent] : null;
    if (!group) return [];
    const out: BoardPart[] = [];
    const visit = (id: string) => {
      const it = flat.items[id];
      if (it.id === board.id) return;
      if (it.pattern) return it.children.forEach(visit);
      if (!it.part) return it.children.forEach(visit);
      const node = it.node;
      const at = it.instance?.at;
      const pos = at ? [at[0], at[1], at[2]] : (node.pos ?? [0, 0, 0]);
      if (pos[1] < 0 || !node.shape) return;
      const turn = Math.abs(Math.sin((node.rot?.[1] ?? 0) + (at?.[3] ?? 0))) > 0.7;
      const [fw, fd] = footprint(node.shape);
      const hub = node.kind === 'ic' || node.kind === 'module' || node.kind === 'display';
      out.push({
        ref: it.ref,
        x: pos[0],
        z: pos[2],
        w: turn ? fd : fw,
        d: turn ? fw : fd,
        kind: node.kind,
        hub:
          hub &&
          (node.shape.t === 'qfp' ||
            node.shape.t === 'module' ||
            node.shape.t === 'qfn' ||
            node.shape.t === 'lcd'),
      });
    };
    group.children.forEach(visit);
    return out;
  }

  /* ------------------------------------------------------------------ showing a model */

  show(id: DeviceId) {
    if (this.mv?.id === id) return;
    if (this.mv) {
      this.mv.pose = this.pose();
      this.scene.remove(this.mv.root);
    }
    let mv = this.models.get(id);
    if (!mv) {
      mv = this.build(id);
      this.models.set(id, mv);
    }
    this.mv = mv;
    this.scene.add(mv.root);
    this.hovered = null;
    this.pendingA = null;
    this.snapPoint = null;
    this.selected.clear();
    this.preselect.clear();
    this.hidden.clear();
    this.isolated = null;

    const c = mv.bounds.getCenter(new THREE.Vector3());
    const span = Math.max(mv.radius * 6, 18);
    this.grid.scale.set(span, span, 1);
    this.grid.position.set(c.x, mv.bounds.min.y - 0.004, c.z);
    this.grid.material.uniforms.uCenter.value.copy(c);
    this.grid.material.uniforms.uFade.value = span * 0.45;
    const fx = (mv.bounds.max.x - mv.bounds.min.x) * 1.7 + 1,
      fz = (mv.bounds.max.z - mv.bounds.min.z) * 1.7 + 1;
    this.shadow.scale.set(fx, fz, 1);
    this.shadow.position.set(c.x, mv.bounds.min.y - 0.002, c.z);
    this.persp.near = Math.max(0.01, mv.radius / 200);
    this.persp.far = mv.radius * 80;
    this.persp.updateProjectionMatrix();
    this.ortho.far = mv.radius * 80;
    this.ortho.updateProjectionMatrix();
    this.controls.minDistance = mv.radius * 0.08;
    this.controls.maxDistance = mv.radius * 12;
    this.controls.minZoom = 0.02 / mv.radius;
    this.controls.maxZoom = 40 / mv.radius;
    const tiles = 6 / 0.07;
    this.hatch.repeat.set(tiles, tiles);

    this.applyExplode();
    this.applySection();
    this.rebuildPins();
    this.restyle();
    if (mv.pose) {
      this.persp.position.copy(mv.pose.pos);
      this.ortho.position.copy(mv.pose.pos);
      this.ortho.zoom = mv.pose.zoom;
      this.ortho.updateProjectionMatrix();
      this.controls.target.copy(mv.pose.target);
      this.controls.update();
    } else this.view('home', false, true);

    this.cb.onStats(id, mv.stats, mv.totals);
    this.cb.onExplode(id, mv.explode);
    this.cb.onSection(id, { ...mv.section });
    this.cb.onMeasures(id, [...mv.measures], false);
    this.cb.onHover(null);
    this.invalidate();
  }

  private pose(): Pose {
    return {
      pos: this.camera.position.clone(),
      target: this.controls.target.clone(),
      zoom: this.ortho.zoom,
    };
  }

  /* ------------------------------------------------------------------ look */

  setTheme(t: Theme) {
    this.theme = t;
    this.edgeMat.color.set(t.edge);
    this.wireMat.color.set(t.wire);
    this.ghostMat.color.set(t.wire);
    this.selMat.color.set(t.select);
    this.hovMat.color.set(t.hover);
    this.arrowMat.color.set(t.section);
    this.gizmoFill.material.color.set(t.section);
    this.gizmoEdge.material.color.set(t.section);
    this.measureLines.material.color.set(t.measure);
    this.rubber.material.color.set(t.measure);
    this.grid.material.uniforms.uMinor.value.set(t.grid);
    this.grid.material.uniforms.uMajor.value.set(t.gridMajor);
    this.shadow.material.opacity = t.shadow;
    this.scene.environmentIntensity = t.env;
    this.key.intensity = t.key;
    this.fill.intensity = t.key * 0.3;
    for (const mv of this.models.values())
      (mv.lines.material as THREE.LineDashedMaterial).color.set(t.lines);
    for (const mv of this.models.values()) for (const p of mv.list) p.look = '';
    this.restyle();
  }

  setMode(mode: RenderMode) {
    this.mode = mode;
    this.restyle();
  }

  setSelection(ids: string[]) {
    this.selected = new Set(ids);
    this.restyle();
  }

  setPreselect(ids: string[]) {
    this.preselect = new Set(ids);
    this.restyle();
  }

  setVisibility(hidden: string[], isolated: string[] | null) {
    this.hidden = new Set(hidden);
    this.isolated = isolated ? new Set(isolated) : null;
    this.restyle();
    this.updateLines();
  }

  /** Puts each part's look in step with the mode, selection, hover and visibility. */
  private restyle() {
    const mv = this.mv;
    if (!mv) return;
    const t = this.theme;
    const sel = t ? new THREE.Color(t.select) : new THREE.Color(0x3a7bd5);
    const hov = t ? new THREE.Color(t.hover) : sel;
    const capsOn = mv.section.on && mv.section.caps;
    for (const p of mv.list) {
      const isSel = this.selected.has(p.id);
      const isHov = !isSel && (this.hovered === p.id || this.preselect.has(p.id));
      const visible = !this.hidden.has(p.id) && (!this.isolated || this.isolated.has(p.id));
      const ghost = this.mode === 'xray' && !isSel;
      const key = `${this.mode}${isSel ? 1 : 0}${isHov ? 1 : 0}${visible ? 1 : 0}${capsOn ? 1 : 0}`;
      p.visible = visible;
      p.mesh.visible = visible;
      p.cap.visible = visible && capsOn && this.mode !== 'wire';
      for (const s of p.stencil) s.visible = p.cap.visible;
      if (p.look === key) continue;
      p.look = key;
      const m = p.mat;
      const transparent = ghost || p.translucent;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = ghost ? (p.translucent ? 0.1 : 0.16) : p.opacity;
      m.depthWrite = !transparent;
      m.visible = this.mode !== 'wire';
      if (isSel) m.emissive.copy(sel).multiplyScalar(0.55);
      else if (isHov) m.emissive.copy(hov).multiplyScalar(0.3);
      else if (p.glow) m.emissive.copy(p.glow).multiplyScalar(0.55);
      else m.emissive.setRGB(0, 0, 0);
      p.edges.visible = this.mode !== 'shaded' || isSel || isHov;
      p.edges.geometry = p.edgeGeo[this.mode === 'wire' ? 1 : 0];
      p.edges.material = isSel
        ? this.selMat
        : isHov
          ? this.hovMat
          : this.mode === 'wire'
            ? this.wireMat
            : this.mode === 'xray'
              ? this.ghostMat
              : this.edgeMat;
      p.edges.renderOrder = isSel || isHov ? 3 : 0;
      for (const d of p.decals) {
        d.visible = this.mode !== 'wire';
        d.opacity = ghost ? 0.15 : 1;
      }
    }
    this.invalidate();
  }

  /* ------------------------------------------------------------------ explode */

  setExplode(t: number) {
    this.exTween = null;
    if (!this.mv) return;
    this.mv.explode = clamp01(t);
    this.applyExplode();
    this.cb.onExplode(this.mv.id, this.mv.explode);
    this.invalidate();
  }

  animateExplode(to: number) {
    const mv = this.mv;
    if (!mv) return;
    // Frame the end state while the parts travel: measure it, put things back, then move both.
    const from = mv.explode;
    mv.explode = to;
    this.applyExplode();
    const end = this.visibleSphere();
    mv.explode = from;
    this.applyExplode();
    const dur = 650 + 650 * Math.abs(to - from);
    if (end) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      const [dist, zoom] = this.frame4(end.radius);
      this.goTo(dir, end.center, dist, zoom, !this.reduced, dur);
    }
    if (this.reduced) return this.setExplode(to);
    this.exTween = { t0: performance.now(), dur, from, to };
    this.invalidate();
  }

  setExplodeLines(on: boolean) {
    this.explodeLines = on;
    this.updateLines();
    this.invalidate();
  }

  private applyExplode() {
    const mv = this.mv;
    if (!mv) return;
    const t = mv.explode;
    for (const n of mv.nodes) {
      const a = n.ex.st * 0.6;
      const k = ease(clamp01((t - a) / 0.4));
      n.obj.position.set(
        n.base.x + n.ex.d[0] * n.ex.s * k,
        n.base.y + n.ex.d[1] * n.ex.s * k,
        n.base.z + n.ex.d[2] * n.ex.s * k,
      );
    }
    mv.root.updateMatrixWorld(true);
    this.updateLines();
  }

  private updateLines() {
    const mv = this.mv;
    if (!mv) return;
    const pts: number[] = [];
    const now = new THREE.Vector3();
    if (this.explodeLines && mv.explode > 0.001) {
      for (const p of mv.list) {
        if (!p.visible) continue;
        (p.mesh.geometry.boundingBox as THREE.Box3).getCenter(now).applyMatrix4(p.mesh.matrixWorld);
        if (now.distanceTo(p.home) < mv.radius * 0.06) continue;
        pts.push(p.home.x, p.home.y, p.home.z, now.x, now.y, now.z);
      }
    }
    const g = mv.lines.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeBoundingSphere();
    mv.lines.computeLineDistances();
    mv.lines.visible = pts.length > 0;
  }

  /* ------------------------------------------------------------------ section */

  setSection(patch: Partial<Section>) {
    const mv = this.mv;
    if (!mv) return;
    mv.section = { ...mv.section, ...patch, offset: clamp01(patch.offset ?? mv.section.offset) };
    for (const p of mv.list) p.look = '';
    this.applySection();
    this.restyle();
    this.cb.onSection(mv.id, { ...mv.section });
  }

  /** The cut's position along its axis, in model units. */
  sectionAt() {
    const mv = this.mv;
    if (!mv) return 0;
    const { axis, offset } = mv.section;
    const lo = mv.bounds.min[axis] - mv.radius * 0.02,
      hi = mv.bounds.max[axis] + mv.radius * 0.02;
    return lo + (hi - lo) * offset;
  }

  private applySection() {
    const mv = this.mv;
    if (!mv) return;
    const { on, axis, flip } = mv.section;
    if (!on) {
      this.plane.set(new THREE.Vector3(0, 0, -1), 1e6);
      this.gizmo.visible = false;
      this.invalidate();
      return;
    }
    const a = AXES[axis];
    const n = a.clone().multiplyScalar(flip ? 1 : -1);
    const at = this.sectionAt();
    const c = mv.bounds.getCenter(new THREE.Vector3());
    const point = c.clone();
    point[axis] = at;
    this.plane.setFromNormalAndCoplanarPoint(n, point);

    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const p of mv.list) {
      p.cap.position.copy(point);
      p.cap.quaternion.copy(q);
    }
    const size = mv.bounds.getSize(new THREE.Vector3());
    const others = (['x', 'y', 'z'] as Axis[]).filter((k) => k !== axis);
    // The quad's local x and y map onto the two other axes; work out which is which.
    const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const ly = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const along = (v: THREE.Vector3) =>
      others.reduce((best, k) => (Math.abs(v[k]) > Math.abs(v[best]) ? k : best), others[0]);
    this.gizmo.position.copy(point);
    this.gizmoFill.quaternion.copy(q);
    this.gizmoEdge.quaternion.copy(q);
    const sx = size[along(lx)] * 1.18 + mv.radius * 0.1,
      sy = size[along(ly)] * 1.18 + mv.radius * 0.1;
    this.gizmoFill.scale.set(sx, sy, 1);
    this.gizmoEdge.scale.set(sx, sy, 1);
    this.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().negate());
    this.arrow.scale.setScalar(mv.radius * 0.38);
    this.gizmo.visible = true;
    this.invalidate();
  }

  /* ------------------------------------------------------------------ measure */

  setMeasuring(on: boolean) {
    this.measuring = on;
    this.pendingA = null;
    this.snapPoint = null;
    this.snapEl.hidden = true;
    this.pendingPin.hidden = true;
    this.rubber.visible = false;
    this.canvas.style.cursor = on ? 'crosshair' : '';
    if (this.mv) this.cb.onMeasures(this.mv.id, [...this.mv.measures], false);
    this.invalidate();
  }

  clearMeasures() {
    if (!this.mv) return;
    this.mv.measures = [];
    this.pendingA = null;
    this.rebuildPins();
    this.cb.onMeasures(this.mv.id, [], false);
    this.invalidate();
  }

  removeMeasure(id: number) {
    if (!this.mv) return;
    this.mv.measures = this.mv.measures.filter((m) => m.id !== id);
    this.rebuildPins();
    this.cb.onMeasures(this.mv.id, [...this.mv.measures], !!this.pendingA);
    this.invalidate();
  }

  /** Drops a half-made measurement; true if there was one. */
  cancelPending() {
    if (!this.pendingA) return false;
    this.pendingA = null;
    this.pendingPin.hidden = true;
    this.rubber.visible = false;
    if (this.mv) this.cb.onMeasures(this.mv.id, [...this.mv.measures], false);
    this.invalidate();
    return true;
  }

  private addPoint(p: THREE.Vector3) {
    const mv = this.mv;
    if (!mv) return;
    if (!this.pendingA) {
      this.pendingA = p.clone();
      this.cb.onMeasures(mv.id, [...mv.measures], true);
    } else {
      const a = this.pendingA;
      const id = (mv.measures[mv.measures.length - 1]?.id ?? 0) + 1;
      mv.measures.push({
        id,
        a: [a.x, a.y, a.z],
        b: [p.x, p.y, p.z],
        d: a.distanceTo(p),
        delta: [Math.abs(p.x - a.x), Math.abs(p.y - a.y), Math.abs(p.z - a.z)],
      });
      this.pendingA = null;
      this.rubber.visible = false;
      this.rebuildPins();
      this.cb.onMeasures(mv.id, [...mv.measures], false);
    }
    this.invalidate();
  }

  private rebuildPins() {
    for (const p of this.pins) {
      p.a.remove();
      p.b.remove();
      p.tag.remove();
    }
    this.pins = [];
    const ms = this.mv?.measures ?? [];
    const pts: number[] = [];
    for (const m of ms) {
      const a = document.createElement('div');
      const b = document.createElement('div');
      const tag = document.createElement('div');
      a.className = b.className = this.classes.pin;
      tag.className = this.classes.tag;
      const strong = document.createElement('b');
      strong.textContent = `${m.d.toFixed(3)} u`;
      const sub = document.createElement('span');
      sub.textContent = `Δ ${m.delta.map((v) => v.toFixed(2)).join(' · ')}`;
      tag.append(strong, sub);
      this.overlay.append(a, b, tag);
      this.pins.push({ a, b, tag, m });
      pts.push(...m.a, ...m.b);
    }
    this.measureLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.measureLines.geometry.computeBoundingSphere();
  }

  /* ------------------------------------------------------------------ camera */

  setProjection(p: Projection) {
    const want = p === 'ortho' ? this.ortho : this.persp;
    if (this.camera === want) return;
    const target = this.controls.target;
    const dir = this.camera.position.clone().sub(target).normalize();
    if (p === 'ortho') {
      const dist = this.persp.position.distanceTo(target);
      const halfH = dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      this.ortho.zoom = ORTHO / halfH;
      this.ortho.position
        .copy(target)
        .addScaledVector(dir, Math.max(dist, (this.mv?.radius ?? 5) * 4));
    } else {
      const halfH = ORTHO / this.ortho.zoom;
      const dist = halfH / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      this.persp.position.copy(target).addScaledVector(dir, dist);
    }
    this.ortho.updateProjectionMatrix();
    this.camera = want;
    this.controls.object = want;
    this.controls.update();
    this.fit2size();
  }

  /** Turns to a named view; `fit` also frames what's visible. */
  view(name: ViewName, animate = true, fit = name === 'home') {
    this.lookFrom(VIEWS[name], animate, fit);
  }

  lookFrom(d: V3, animate = true, fit = false) {
    const dir = new THREE.Vector3(...d).normalize();
    if (Math.abs(dir.y) > 0.9999) dir.set(0, Math.sign(dir.y), 1e-4).normalize();
    const target = this.controls.target.clone();
    let dist = this.persp.position.distanceTo(target);
    let zoom = this.ortho.zoom;
    if (fit) {
      const s = this.visibleSphere();
      if (s) {
        target.copy(s.center);
        [dist, zoom] = this.frame4(s.radius);
      }
    }
    this.goTo(dir, target, dist, zoom, animate);
  }

  /** Frames the given parts, or everything visible. */
  fit(ids?: string[]) {
    const s = this.visibleSphere(ids);
    if (!s) return;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const [dist, zoom] = this.frame4(s.radius);
    this.goTo(dir, s.center, dist, zoom, true);
  }

  private frame4(r: number): [number, number] {
    const aspect = this.persp.aspect || 1;
    const v = THREE.MathUtils.degToRad(FOV / 2);
    const h = Math.atan(Math.tan(v) * aspect);
    const dist = (r / Math.sin(Math.min(v, h))) * 1.06;
    const zoom = (ORTHO * Math.min(1, aspect)) / (r * 1.1);
    return [dist, zoom];
  }

  private visibleSphere(ids?: string[]) {
    const mv = this.mv;
    if (!mv) return null;
    const box = new THREE.Box3();
    const b = new THREE.Box3();
    for (const p of mv.list) {
      if (!p.visible || (ids && !ids.includes(p.id))) continue;
      if (!ids && p.item.node.kind === 'reference') continue;
      box.union(b.copy(p.mesh.geometry.boundingBox as THREE.Box3).applyMatrix4(p.mesh.matrixWorld));
    }
    if (box.isEmpty()) return null;
    return box.getBoundingSphere(new THREE.Sphere());
  }

  private goTo(
    dir: THREE.Vector3,
    target: THREE.Vector3,
    dist: number,
    zoom: number,
    animate: boolean,
    dur = 520,
  ) {
    const isOrtho = this.camera === this.ortho;
    const placeDist = isOrtho ? Math.max(dist, (this.mv?.radius ?? 5) * 4) : dist;
    if (!animate || this.reduced) {
      this.camTween = null;
      this.controls.target.copy(target);
      this.persp.position.copy(target).addScaledVector(dir, dist);
      this.ortho.position.copy(target).addScaledVector(dir, placeDist);
      this.ortho.zoom = zoom;
      this.ortho.updateProjectionMatrix();
      this.controls.update();
      this.invalidate();
      return;
    }
    const cur = this.camera.position.clone().sub(this.controls.target);
    const d0 = cur.length();
    const dir0 = cur.normalize();
    this.camTween = {
      t0: performance.now(),
      dur,
      q: new THREE.Quaternion().setFromUnitVectors(dir0, dir),
      dir0,
      d0,
      d1: placeDist,
      c0: this.controls.target.clone(),
      c1: target.clone(),
      z0: this.ortho.zoom,
      z1: zoom,
    };
    this.invalidate();
  }

  orbit(dAz: number, dPolar: number) {
    this.camTween = null;
    this.controls.rotateLeft(dAz);
    this.controls.rotateUp(dPolar);
    this.invalidate();
  }

  pan(dx: number, dy: number) {
    this.camTween = null;
    this.controls.pan(dx, dy);
    this.invalidate();
  }

  zoom(factor: number) {
    this.camTween = null;
    if (factor > 1) this.controls.dollyIn(factor);
    else this.controls.dollyOut(1 / factor);
    this.invalidate();
  }

  /** Subscribes to the camera's rotation, as a CSS matrix for the view cube. */
  onView(fn: (css: string, m: ArrayLike<number>) => void) {
    this.viewSubs.add(fn);
    fn(this.cssMatrix(), this.camera.matrixWorldInverse.elements);
    return () => {
      this.viewSubs.delete(fn);
    };
  }

  private cssMatrix() {
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorldInverse.elements;
    const f = (n: number) => (Math.abs(n) < 1e-10 ? 0 : n).toFixed(6);
    return `matrix3d(${f(e[0])},${f(-e[1])},${f(e[2])},0,${f(-e[4])},${f(e[5])},${f(-e[6])},0,${f(e[8])},${f(-e[9])},${f(e[10])},0,0,0,0,1)`;
  }

  setReducedMotion(on: boolean) {
    this.reduced = on;
    this.controls.enableDamping = !on;
  }

  setActive(on: boolean) {
    this.active = on;
    if (on) {
      this.fit2size();
      this.invalidate();
    }
  }

  /* ------------------------------------------------------------------ frame loop */

  invalidate() {
    if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.frame = 0;
    if (this.disposed || !this.active || document.hidden || !this.mv) return;
    let again = false;
    if (this.camTween) {
      const tw = this.camTween;
      const k = ease(clamp01((now - tw.t0) / tw.dur));
      const q = new THREE.Quaternion().slerp(tw.q, k);
      const dir = tw.dir0.clone().applyQuaternion(q);
      const target = tw.c0.clone().lerp(tw.c1, k);
      this.controls.target.copy(target);
      this.camera.position.copy(target).addScaledVector(dir, tw.d0 + (tw.d1 - tw.d0) * k);
      if (this.camera === this.ortho) {
        this.ortho.zoom = tw.z0 + (tw.z1 - tw.z0) * k;
        this.ortho.updateProjectionMatrix();
      }
      if (k >= 1) this.camTween = null;
      again = true;
    }
    if (this.exTween) {
      const tw = this.exTween;
      const k = clamp01((now - tw.t0) / tw.dur);
      this.mv.explode = tw.from + (tw.to - tw.from) * ease(k);
      this.applyExplode();
      this.cb.onExplode(this.mv.id, this.mv.explode);
      if (k >= 1) this.exTween = null;
      again = true;
    }
    if (this.controls.update()) again = true;
    this.renderer.render(this.scene, this.camera);
    const css = this.cssMatrix();
    for (const fn of this.viewSubs) fn(css, this.camera.matrixWorldInverse.elements);
    this.placeOverlay();
    if (again) this.invalidate();
  };

  private fit2size() {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    this.ortho.left = -ORTHO * aspect;
    this.ortho.right = ORTHO * aspect;
    this.ortho.top = ORTHO;
    this.ortho.bottom = -ORTHO;
    this.ortho.updateProjectionMatrix();
    this.invalidate();
  }

  private toScreen(v: THREE.Vector3, out: { x: number; y: number; behind: boolean }) {
    const p = v.clone().project(this.camera);
    out.x = ((p.x + 1) / 2) * this.canvas.clientWidth;
    out.y = ((1 - p.y) / 2) * this.canvas.clientHeight;
    out.behind = p.z > 1;
    return out;
  }

  private placeOverlay() {
    const s = { x: 0, y: 0, behind: false };
    const place = (el: HTMLElement, v: THREE.Vector3) => {
      this.toScreen(v, s);
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      el.style.visibility = s.behind ? 'hidden' : '';
    };
    const a = new THREE.Vector3(),
      b = new THREE.Vector3();
    for (const p of this.pins) {
      a.fromArray(p.m.a);
      b.fromArray(p.m.b);
      place(p.a, a);
      place(p.b, b);
      place(p.tag, a.clone().add(b).multiplyScalar(0.5));
    }
    if (this.snapPoint && this.measuring) {
      this.snapEl.hidden = false;
      this.snapEl.dataset.kind = this.snapPoint.kind;
      place(this.snapEl, this.snapPoint.p);
    } else this.snapEl.hidden = true;
    if (this.pendingA) {
      this.pendingPin.hidden = false;
      place(this.pendingPin, this.pendingA);
    } else this.pendingPin.hidden = true;
  }

  /* ------------------------------------------------------------------ picking */

  private setNdc(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private pick(
    x: number,
    y: number,
  ): { part: PartView; point: THREE.Vector3; dist: number } | null {
    const mv = this.mv;
    if (!mv) return null;
    this.setNdc(x, y);
    const meshes = mv.list.filter((p) => p.visible).map((p) => p.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    const cut = mv.section.on;
    for (const h of hits) {
      if (cut && this.plane.distanceToPoint(h.point) < -1e-4) continue;
      const part = mv.parts.get(h.object.name);
      if (part) return { part, point: h.point.clone(), dist: h.distance };
    }
    return null;
  }

  /** The nearest visible corner of the part under the cursor, or the point on its face. */
  private snap(hit: { part: PartView; point: THREE.Vector3 }, x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    const px = x - rect.left,
      py = y - rect.top;
    const c = hit.part.corners;
    const m = hit.part.mesh.matrixWorld;
    const v = new THREE.Vector3();
    const s = { x: 0, y: 0, behind: false };
    const cands: { d: number; v: THREE.Vector3 }[] = [];
    for (let i = 0; i < c.length; i += 3) {
      v.set(c[i], c[i + 1], c[i + 2]).applyMatrix4(m);
      if (this.mv?.section.on && this.plane.distanceToPoint(v) < -1e-4) continue;
      this.toScreen(v, s);
      const d = (s.x - px) ** 2 + (s.y - py) ** 2;
      if (d < SNAP_PX * SNAP_PX) cands.push({ d, v: v.clone() });
    }
    cands.sort((a, b) => a.d - b.d);
    const mv = this.mv as ModelView;
    const eps = mv.radius * 0.01;
    const meshes = mv.list.filter((p) => p.visible).map((p) => p.mesh);
    const ortho = this.camera === this.ortho;
    const view = this.camera.getWorldDirection(new THREE.Vector3());
    for (const cand of cands.slice(0, 5)) {
      // A corner counts only if nothing sits between the eye and it.
      let origin: THREE.Vector3, dir: THREE.Vector3, len: number;
      if (ortho) {
        len = mv.radius * 10;
        dir = view;
        origin = cand.v.clone().addScaledVector(view, -len);
      } else {
        origin = this.camera.position;
        dir = cand.v.clone().sub(origin);
        len = dir.length();
        dir.normalize();
      }
      this.raycaster.set(origin, dir);
      const first = this.raycaster
        .intersectObjects(meshes, false)
        .find((h) => !(mv.section.on && this.plane.distanceToPoint(h.point) < -1e-4));
      if (!first || first.distance >= len - eps || first.point.distanceTo(cand.v) < eps)
        return { p: cand.v, kind: 'vertex' as const };
    }
    return { p: hit.point, kind: 'face' as const };
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, button: e.button, t: performance.now() };
    const mv = this.mv;
    if (e.button !== 0 || !mv?.section.on || !this.gizmo.visible) return;
    this.setNdc(e.clientX, e.clientY);
    if (!this.raycaster.intersectObject(this.handle, false).length) return;
    const s = this.axisParam();
    if (s === null) return;
    this.drag = { s0: s - this.sectionAt() };
    this.controls.enabled = false;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = 'grabbing';
  };

  /** Where the pointer's ray passes closest to the section axis, as a coordinate on it. */
  private axisParam() {
    const mv = this.mv;
    if (!mv) return null;
    const A = AXES[mv.section.axis];
    const P0 = mv.bounds.getCenter(new THREE.Vector3());
    P0[mv.section.axis] = 0;
    const { origin: O, direction: D } = this.raycaster.ray;
    const w0 = P0.clone().sub(O);
    const b = A.dot(D),
      d = A.dot(w0),
      e = D.dot(w0);
    const den = 1 - b * b;
    if (den < 1e-5) return null;
    return (b * e - d) / den;
  }

  private onMove = (e: PointerEvent) => {
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.drag && this.mv) {
      this.setNdc(e.clientX, e.clientY);
      const s = this.axisParam();
      if (s === null) return;
      const mv = this.mv;
      const lo = mv.bounds.min[mv.section.axis] - mv.radius * 0.02,
        hi = mv.bounds.max[mv.section.axis] + mv.radius * 0.02;
      this.setSection({ offset: (s - this.drag.s0 - lo) / (hi - lo) });
      return;
    }
    if (!this.hoverFrame) this.hoverFrame = requestAnimationFrame(this.hoverPick);
  };

  private hoverPick = () => {
    this.hoverFrame = 0;
    const lp = this.lastPointer;
    if (!lp || this.disposed || !this.mv) return;
    if (
      this.down &&
      (this.down.button !== 0 || Math.hypot(lp.x - this.down.x, lp.y - this.down.y) > 4)
    )
      return;
    const hit = this.pick(lp.x, lp.y);
    let overHandle = false;
    if (this.gizmo.visible) {
      this.setNdc(lp.x, lp.y);
      overHandle = this.raycaster.intersectObject(this.handle, false).length > 0;
    }
    this.arrowMat.opacity = overHandle ? 1 : 0.85;
    this.canvas.style.cursor = overHandle ? 'grab' : this.measuring ? 'crosshair' : '';
    const id = hit?.part.id ?? null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.restyle();
      this.cb.onHover(id);
    }
    if (this.measuring && hit) {
      this.snapPoint = this.snap(hit, lp.x, lp.y);
      if (this.pendingA) {
        this.rubber.geometry.setFromPoints([this.pendingA, this.snapPoint.p]);
        this.rubber.visible = true;
      }
    } else {
      this.snapPoint = null;
      this.rubber.visible = false;
    }
    const p = this.snapPoint?.p ?? hit?.point ?? null;
    this.cb.onCursor(p ? [p.x, p.y, p.z] : null, this.snapPoint?.kind ?? (hit ? 'face' : null));
    this.invalidate();
  };

  private onUp = (e: PointerEvent) => {
    const down = this.down;
    this.down = null;
    if (this.drag) {
      this.drag = null;
      this.controls.enabled = true;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = '';
      return;
    }
    if (
      !down ||
      Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 ||
      performance.now() - down.t > 700
    )
      return;
    if (down.button === 2) {
      const hit = this.pick(e.clientX, e.clientY);
      this.cb.onContext(hit?.part.id ?? null, e.clientX, e.clientY);
      return;
    }
    if (down.button !== 0) return;
    const hit = this.pick(e.clientX, e.clientY);
    if (this.measuring) {
      if (hit) this.addPoint(this.snap(hit, e.clientX, e.clientY).p);
      return;
    }
    this.cb.onPick(hit?.part.id ?? null, {
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      double: false,
    });
  };

  private onDouble = (e: MouseEvent) => {
    if (this.measuring) return;
    const hit = this.pick(e.clientX, e.clientY);
    this.cb.onPick(hit?.part.id ?? null, { additive: false, double: true });
  };

  private onLeave = () => {
    this.lastPointer = null;
    if (this.hovered) {
      this.hovered = null;
      this.restyle();
      this.cb.onHover(null);
    }
    this.snapPoint = null;
    this.rubber.visible = false;
    this.cb.onCursor(null, null);
    this.invalidate();
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  /* ------------------------------------------------------------------ teardown */

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.hoverFrame);
    this.resize.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('dblclick', this.onDouble);
    c.removeEventListener('contextmenu', this.onContextMenu);
    this.controls.dispose();
    for (const mv of this.models.values()) for (const d of mv.disposables) d.dispose();
    for (const e of this.geoCache.values()) {
      e.geo.dispose();
      e.edges.dispose();
      e.wire.dispose();
    }
    for (const o of [
      this.grid,
      this.shadow,
      this.gizmoFill,
      this.gizmoEdge,
      this.measureLines,
      this.rubber,
      ...this.arrow.children,
    ])
      (o as THREE.Mesh).geometry.dispose();
    for (const m of [
      this.edgeMat,
      this.wireMat,
      this.ghostMat,
      this.selMat,
      this.hovMat,
      this.stencilBase,
      this.stencilBack,
      this.stencilFront,
      this.arrowMat,
      this.grid.material,
      this.shadow.material,
      this.gizmoFill.material,
      this.gizmoEdge.material,
      this.measureLines.material,
      this.rubber.material,
    ])
      m.dispose();
    (this.handle.material as THREE.Material).dispose();
    this.hatch.dispose();
    this.shadowTex.dispose();
    this.envTex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.snapEl.remove();
    this.pendingPin.remove();
    for (const p of this.pins) {
      p.a.remove();
      p.b.remove();
      p.tag.remove();
    }
  }
}
