/*
 * The immersive space: the devices float in an arc in front of you, lit by a soft studio, drawn
 * with the same lens and head pose as the room so they stay put in it as you look around. Drag
 * one to turn it; drag anywhere else to look around. Loaded only when the space opens.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { build, dispose, kit, type DeviceInfo, type Model } from './models';
import type { Pose } from './space';

export interface Anchor {
  x: number;
  y: number;
  visible: boolean;
}

export interface LabOptions {
  canvas: HTMLCanvasElement;
  devices: DeviceInfo[];
  font: string;
  accent: string;
  /** Which way you face when the space opens; the arc centres on it. */
  yaw: number;
  getPose: () => Pose;
  getP: () => number;
  reduced: () => boolean;
  onHover: (i: number | null) => void;
  onSelect: (i: number) => void;
  onLook: (dx: number, dy: number, done: boolean) => void;
  onFrame: (anchors: Anchor[]) => void;
}

export interface Lab {
  select: (i: number | null) => void;
  /** Where a device stands, as an azimuth, so the head can turn to it. */
  azOf: (i: number) => number;
  turn: (i: number, dYaw: number, dPitch: number) => void;
  reset: () => void;
  setAccent: (hex: string) => void;
  destroy: () => void;
}

const RAD = Math.PI / 180;
const SPACING = 11;
const DIST = 1;

interface Slot {
  model: Model;
  /** Placement on the arc, the spin you give it, and where both are easing to. */
  base: THREE.Group;
  spin: THREE.Group;
  yaw: number;
  pitch: number;
  vYaw: number;
  vPitch: number;
  touched: number;
  glow: THREE.Mesh;
  az: number;
  near: number;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createLab(o: LabOptions): Lab {
  const renderer = new THREE.WebGLRenderer({
    canvas: o.canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  room.dispose();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-0.6, 1.2, 0.8);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
  camera.rotation.order = 'YXZ';

  const materials = kit();
  const accent = new THREE.Color(o.accent);
  const glowTex = glowTexture();
  const glowMat = () =>
    new THREE.MeshBasicMaterial({
      map: glowTex,
      color: accent.clone(),
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

  const n = o.devices.length;
  const slots: Slot[] = o.devices.map((d, i) => {
    const model = build(d, materials, o.font, accent);
    const base = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(model.root);
    base.add(spin);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 48), glowMat());
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.16;
    base.add(glow);
    const az = o.yaw + (i - (n - 1) / 2) * SPACING;
    scene.add(base);
    const slot: Slot = {
      model,
      base,
      spin,
      yaw: -0.5 + i * 0.25,
      pitch: 0.08,
      vYaw: 0,
      vPitch: 0,
      touched: -10,
      glow,
      az,
      near: 0,
    };
    spin.rotation.order = 'YXZ';
    spin.userData.slot = i;
    return slot;
  });

  let selected: number | null = null;
  let hover: number | null = null;

  /* ---------- sizing: the lens matches the room's, so the space and the room agree */

  const fitSize = () => {
    const w = o.canvas.clientWidth,
      h = o.canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = (2 * Math.atan(h / 2 / o.getP())) / RAD;
    camera.updateProjectionMatrix();
  };
  fitSize();
  const resizer = new ResizeObserver(fitSize);
  resizer.observe(o.canvas);

  /* ---------- picking */

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (cx: number, cy: number) => {
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(
      slots.map((s) => s.spin),
      true,
    );
    for (const h of hits) {
      let obj: THREE.Object3D | null = h.object;
      while (obj && obj.userData.slot === undefined) obj = obj.parent;
      if (obj) return obj.userData.slot as number;
    }
    return null;
  };

  let drag: {
    id: number;
    mode: 'turn' | 'look';
    i: number | null;
    x: number;
    y: number;
    sx: number;
    sy: number;
    t: number;
  } | null = null;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const i = pick(e.clientX, e.clientY);
    o.canvas.setPointerCapture(e.pointerId);
    drag = {
      id: e.pointerId,
      mode: i === null ? 'look' : 'turn',
      i,
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t: performance.now(),
    };
    if (i !== null) {
      slots[i].vYaw = slots[i].vPitch = 0;
      o.canvas.style.cursor = 'grabbing';
    }
  };
  const onMove = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      const now = performance.now();
      const dt = Math.max(1, now - drag.t) / 1000;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.t = now;
      if (drag.mode === 'turn' && drag.i !== null) {
        const s = slots[drag.i];
        s.yaw += dx * 0.012;
        s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch + dy * 0.01));
        s.vYaw = (dx * 0.012) / dt;
        s.vPitch = (dy * 0.01) / dt;
        s.touched = now / 1000;
      } else o.onLook(dx, dy, false);
      return;
    }
    const i = pick(e.clientX, e.clientY);
    if (i !== hover) {
      hover = i;
      o.onHover(i);
      o.canvas.style.cursor = i === null ? '' : 'grab';
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    if (drag.mode === 'look') o.onLook(0, 0, true);
    if (moved < 5 && drag.i !== null) o.onSelect(drag.i);
    if (o.reduced() && drag.i !== null) slots[drag.i].vYaw = slots[drag.i].vPitch = 0;
    drag = null;
    o.canvas.style.cursor = hover === null ? '' : 'grab';
  };
  o.canvas.addEventListener('pointerdown', onDown);
  o.canvas.addEventListener('pointermove', onMove);
  o.canvas.addEventListener('pointerup', onUp);
  o.canvas.addEventListener('pointercancel', onUp);

  /* ---------- the frame */

  const v = new THREE.Vector3();
  let raf = 0;
  let last = performance.now();
  const t0 = last;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    const still = o.reduced();

    const pose = o.getPose();
    camera.position.set(pose.x, -pose.y, 0);
    camera.rotation.set(pose.pitch * RAD, -pose.yaw * RAD, 0);

    slots.forEach((s, i) => {
      const isSel = selected === i;
      // The one you pick comes toward you; the rest step back.
      const goal = isSel ? 1 : selected === null ? 0 : -0.6;
      s.near += (goal - s.near) * (still ? 1 : 1 - Math.exp(-dt * 6));
      const r = DIST - s.near * 0.22;
      const bob = still ? 0 : Math.sin(t * 0.9 + i * 1.3) * 0.006;
      s.base.position.set(
        Math.sin(s.az * RAD) * r,
        -0.04 + bob + Math.max(0, s.near) * 0.02,
        -Math.cos(s.az * RAD) * r,
      );
      s.base.rotation.y = -s.az * RAD;

      // Spin: inertia after a flick, then a slow turntable when left alone for a while.
      if (!drag || drag.i !== i) {
        if (!still) {
          s.yaw += s.vYaw * dt;
          s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch + s.vPitch * dt));
          const damp = Math.exp(-dt * 3);
          s.vYaw *= damp;
          s.vPitch *= damp;
          if (t - s.touched > 4 && Math.abs(s.vYaw) < 0.05) s.yaw += dt * 0.22;
        }
      }
      s.spin.rotation.set(s.pitch, s.yaw, 0);
      const g = s.glow.material as THREE.MeshBasicMaterial;
      const target = isSel ? 0.75 : hover === i ? 0.5 : 0.22;
      g.opacity += (target - g.opacity) * Math.min(1, dt * 8);
      s.model.animate.forEach((a) => a.update(still ? 2 : t, still ? 0 : dt));
    });

    renderer.render(scene, camera);

    const w = o.canvas.clientWidth,
      h = o.canvas.clientHeight;
    o.onFrame(
      slots.map((s) => {
        v.set(0, -0.15, 0);
        s.base.localToWorld(v);
        v.project(camera);
        return {
          x: ((v.x + 1) / 2) * w,
          y: ((1 - v.y) / 2) * h,
          visible: v.z < 1 && Math.abs(v.x) < 1.2,
        };
      }),
    );
  };
  raf = requestAnimationFrame(frame);

  const onVisibility = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    select: (i) => {
      selected = i;
    },
    azOf: (i) => slots[i]?.az ?? o.yaw,
    turn: (i, dYaw, dPitch) => {
      const s = slots[i];
      if (!s) return;
      s.yaw += dYaw;
      s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch + dPitch));
      s.touched = (performance.now() - t0) / 1000;
    },
    reset: () => {
      slots.forEach((s, i) => {
        s.yaw = -0.5 + i * 0.25;
        s.pitch = 0.08;
        s.vYaw = s.vPitch = 0;
      });
    },
    setAccent: (hex) => {
      accent.set(hex);
      slots.forEach((s) => (s.glow.material as THREE.MeshBasicMaterial).color.set(hex));
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      resizer.disconnect();
      o.canvas.removeEventListener('pointerdown', onDown);
      o.canvas.removeEventListener('pointermove', onMove);
      o.canvas.removeEventListener('pointerup', onUp);
      o.canvas.removeEventListener('pointercancel', onUp);
      slots.forEach((s) => dispose(s.base));
      Object.values(materials).forEach((m) => m.dispose());
      glowTex.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
