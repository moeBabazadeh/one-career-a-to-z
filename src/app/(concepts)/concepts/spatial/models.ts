/*
 * The five devices, modelled from primitives: a GSM weather station, a pressure and flow
 * controller, a DIN-rail PLC, a card reader and a BLE beacon. Shapes are generic enclosures
 * (no product's design copied); every printed word on them comes from the facts.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface DeviceInfo {
  key: string;
  tag: string;
  name: string;
  kind: string;
  chip?: string;
}

/** Parts that move on their own: spinning cups, blinking LEDs, a needle that settles. */
export interface Animated {
  update: (t: number, dt: number) => void;
}

export interface Model {
  root: THREE.Group;
  animate: Animated[];
}

/* ------------------------------------------------------------------ materials */

export function kit() {
  const std = (color: number, roughness: number, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    white: new THREE.MeshPhysicalMaterial({
      color: 0xf1f1ec,
      roughness: 0.42,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    }),
    grey: std(0xc5c8cd, 0.55),
    dark: std(0x26282d, 0.55),
    rubber: std(0x1a1b1e, 0.9),
    alu: std(0xc9cdd3, 0.3, 0.9),
    anod: std(0x7f8a99, 0.36, 0.75),
    steel: std(0x8d939b, 0.35, 0.85),
    brass: std(0xc8a058, 0.32, 0.9),
    green: std(0x2f8a4c, 0.6),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0b0d11,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
  };
}

export type Kit = ReturnType<typeof kit>;

const led = (color: number) =>
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: color,
    emissiveIntensity: 0,
    roughness: 0.3,
  });

/** Flat printing: a canvas texture on a plane. */
function print(
  w: number,
  h: number,
  px: number,
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * px);
  c.height = Math.round(h * px);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  draw(g, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, transparent: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Scales a model to a size and centres it on its own bounds. */
function fit(group: THREE.Group, size: number) {
  const box = new THREE.Box3().setFromObject(group);
  const dims = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dims.x, dims.y, dims.z);
  const centre = box.getCenter(new THREE.Vector3());
  const outer = new THREE.Group();
  group.position.sub(centre);
  outer.add(group);
  outer.scale.setScalar(k);
  return outer;
}

/* ------------------------------------------------------------------ the devices */

function weatherStation(d: DeviceInfo, k: Kit, font: string): Model {
  const g = new THREE.Group();
  const animate: Animated[] = [];
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.92, 20), k.alu, 0, 0.46, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.012, 32), k.steel, 0, 0.006, 0));

  // The logger: a white enclosure strapped to the mast, its door seam and printed plate.
  const box = mesh(new RoundedBoxGeometry(0.17, 0.21, 0.085, 4, 0.012), k.white, 0, 0.42, 0.055);
  g.add(box);
  g.add(mesh(new THREE.BoxGeometry(0.004, 0.19, 0.002), k.grey, 0.07, 0.42, 0.098));
  const plate = print(0.12, 0.07, 1400, (c, W, H) => {
    c.fillStyle = '#f7f7f3';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#1d1f24';
    c.font = `700 ${H * 0.32}px ${font}`;
    c.fillText(d.name, W * 0.06, H * 0.42);
    c.font = `500 ${H * 0.2}px ${font}`;
    c.fillStyle = '#5c6068';
    c.fillText(d.tag, W * 0.06, H * 0.78);
    // Signal bars.
    for (let i = 0; i < 4; i++) {
      c.fillStyle = '#1d1f24';
      const bh = H * (0.12 + i * 0.1);
      c.fillRect(W * (0.74 + i * 0.05), H * 0.78 - bh, W * 0.03, bh);
    }
  });
  plate.position.set(0, 0.45, 0.0985);
  g.add(plate);
  const ok = led(0x37d67a);
  g.add(mesh(new THREE.SphereGeometry(0.005, 12, 8), ok, 0.05, 0.36, 0.099));
  animate.push({ update: (t) => (ok.emissiveIntensity = (t * 0.5) % 1 < 0.08 ? 2.4 : 0.15) });

  // GSM antenna.
  g.add(mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.12, 12), k.rubber, 0.06, 0.585, 0.055));

  // Solar panel on a bracket, tilted toward the sky.
  const panel = new THREE.Group();
  panel.add(mesh(new THREE.BoxGeometry(0.22, 0.008, 0.15), k.alu));
  const cells = print(0.208, 0.138, 900, (c, W, H) => {
    c.fillStyle = '#0f1d3a';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(160,190,255,0.35)';
    c.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      c.beginPath();
      c.moveTo((W * i) / 6, 0);
      c.lineTo((W * i) / 6, H);
      c.stroke();
    }
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(0, (H * i) / 4);
      c.lineTo(W, (H * i) / 4);
      c.stroke();
    }
  });
  (cells.material as THREE.MeshStandardMaterial).roughness = 0.15;
  (cells.material as THREE.MeshStandardMaterial).metalness = 0.3;
  cells.rotation.x = -Math.PI / 2;
  cells.position.y = 0.0045;
  panel.add(cells);
  panel.position.set(0, 0.7, 0.07);
  panel.rotation.x = 0.62;
  g.add(panel);
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.05), k.steel, 0, 0.68, 0.03));

  // Radiation shield: stacked plates on a side arm, around the temperature probe.
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.012, 0.012), k.steel, -0.06, 0.26, 0));
  for (let i = 0; i < 6; i++)
    g.add(
      mesh(
        new THREE.CylinderGeometry(0.048 - i * 0.002, 0.05 - i * 0.002, 0.008, 28),
        k.white,
        -0.12,
        0.2 + i * 0.016,
        0,
      ),
    );

  // Cup anemometer on top.
  const cups = new THREE.Group();
  cups.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.03, 16), k.dark));
  const cupGeo = new THREE.SphereGeometry(0.022, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const arm = mesh(
      new THREE.CylinderGeometry(0.0025, 0.0025, 0.08, 8),
      k.steel,
      Math.cos(a) * 0.04,
      0,
      Math.sin(a) * 0.04,
    );
    arm.rotation.set(0, -a, Math.PI / 2);
    cups.add(arm);
    const cup = mesh(cupGeo, k.white, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
    cup.rotation.set(0, -a, 0);
    cup.rotateX(Math.PI / 2);
    cups.add(cup);
  }
  cups.position.y = 0.94;
  g.add(cups);
  animate.push({ update: (_t, dt) => (cups.rotation.y -= dt * 3.2) });

  return { root: fit(g, 0.3), animate };
}

function controller(d: DeviceInfo, k: Kit, font: string): Model {
  const g = new THREE.Group();
  const animate: Animated[] = [];
  g.add(mesh(new RoundedBoxGeometry(0.2, 0.13, 0.1, 4, 0.01), k.anod));
  // Front bezel with a small display: set point and process value as bars and a trend.
  const front = mesh(new RoundedBoxGeometry(0.17, 0.1, 0.006, 3, 0.004), k.glass, 0, 0, 0.05);
  g.add(front);
  const screen = print(0.09, 0.05, 1600, (c, W, H) => {
    c.fillStyle = '#05070a';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#7fe0ff';
    c.font = `600 ${H * 0.2}px ${font}`;
    c.fillText('SP', W * 0.05, H * 0.28);
    c.fillText('PV', W * 0.05, H * 0.58);
    c.fillRect(W * 0.22, H * 0.16, W * 0.5, H * 0.1);
    c.fillStyle = '#9dffb5';
    c.fillRect(W * 0.22, H * 0.46, W * 0.47, H * 0.1);
    c.strokeStyle = '#9dffb5';
    c.lineWidth = H * 0.025;
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const x = W * (0.05 + (i / 40) * 0.9);
      const y = H * (0.86 - 0.12 * (1 - Math.exp(-i / 6)) + 0.012 * Math.sin(i * 1.7));
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
    c.fillStyle = '#5b6474';
    c.font = `500 ${H * 0.13}px ${font}`;
    c.fillText(d.tag, W * 0.76, H * 0.28);
  });
  screen.position.set(-0.025, 0.008, 0.0535);
  (screen.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xffffff);
  (screen.material as THREE.MeshStandardMaterial).emissiveMap = (
    screen.material as THREE.MeshStandardMaterial
  ).map;
  (screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
  g.add(screen);
  const leds = [led(0x37d67a), led(0xffb02e)];
  leds.forEach((m, i) =>
    g.add(mesh(new THREE.SphereGeometry(0.0045, 12, 8), m, 0.05, 0.02 - i * 0.02, 0.054)),
  );
  animate.push({
    update: (t) => {
      leds[0].emissiveIntensity = 1.6;
      leds[1].emissiveIntensity = (t * 1.3) % 1 < 0.5 ? 1.4 : 0.1;
    },
  });

  // Pressure gauge on the top face, with a needle that settles and wavers a little.
  const gauge = new THREE.Group();
  gauge.add(mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.022, 40), k.alu));
  const dial = print(0.084, 0.084, 1600, (c, W) => {
    const r = W / 2;
    c.fillStyle = '#fbfbf8';
    c.beginPath();
    c.arc(r, r, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#1b1d22';
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * 0.75 + (i / 40) * Math.PI * 1.5;
      const inner = i % 5 ? 0.78 : 0.68;
      c.lineWidth = i % 5 ? r * 0.015 : r * 0.03;
      c.beginPath();
      c.moveTo(r + Math.cos(a) * r * inner, r + Math.sin(a) * r * inner);
      c.lineTo(r + Math.cos(a) * r * 0.88, r + Math.sin(a) * r * 0.88);
      c.stroke();
    }
    c.strokeStyle = '#d64545';
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.arc(r, r, r * 0.83, Math.PI * 1.95, Math.PI * 2.25);
    c.stroke();
  });
  dial.rotation.x = -Math.PI / 2;
  dial.position.y = 0.0115;
  gauge.add(dial);
  const needle = new THREE.Group();
  const bar = mesh(
    new THREE.BoxGeometry(0.003, 0.0015, 0.032),
    new THREE.MeshStandardMaterial({ color: 0xc62f2f, roughness: 0.4 }),
    0,
    0,
    -0.012,
  );
  needle.add(bar);
  needle.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 12), k.dark));
  needle.position.y = 0.013;
  gauge.add(needle);
  gauge.position.set(0.0, 0.088, 0);
  g.add(gauge);
  g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.025, 16), k.brass, 0, 0.07, 0));
  animate.push({
    update: (t) =>
      (needle.rotation.y =
        -0.4 -
        1.5 * (1 - Math.exp(-t * 0.8)) +
        0.02 * Math.sin(t * 5.3) +
        0.012 * Math.sin(t * 13.1)),
  });

  // Inlet and outlet: brass hex fittings and pipe stubs.
  for (const side of [-1, 1]) {
    const nut = mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.02, 6),
      k.brass,
      side * 0.11,
      -0.01,
      0,
    );
    nut.rotation.z = Math.PI / 2;
    g.add(nut);
    const pipe = mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.07, 20),
      k.steel,
      side * 0.15,
      -0.01,
      0,
    );
    pipe.rotation.z = Math.PI / 2;
    g.add(pipe);
  }
  // Cable gland underneath.
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.022, 16), k.dark, 0.05, -0.075, 0));
  return { root: fit(g, 0.24), animate };
}

function plc(d: DeviceInfo, k: Kit, font: string): Model {
  const g = new THREE.Group();
  const animate: Animated[] = [];
  // DIN rail behind, the module clipped onto it.
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.035, 0.008), k.steel, 0, 0, -0.04));
  g.add(mesh(new RoundedBoxGeometry(0.13, 0.17, 0.065, 3, 0.006), k.grey, 0, 0, 0));
  g.add(mesh(new RoundedBoxGeometry(0.13, 0.09, 0.03, 3, 0.006), k.grey, 0, 0, 0.04));
  const face = print(0.12, 0.08, 1400, (c, W, H) => {
    c.fillStyle = '#d9dce1';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#1d1f24';
    c.font = `700 ${H * 0.17}px ${font}`;
    c.fillText(d.name, W * 0.05, H * 0.22);
    c.font = `500 ${H * 0.12}px ${font}`;
    c.fillStyle = '#4f535b';
    c.fillText(d.tag, W * 0.05, H * 0.4);
    if (d.chip) c.fillText(d.chip, W * 0.05, H * 0.56);
    c.font = `600 ${H * 0.09}px ${font}`;
    ['PWR', 'RUN', 'I0', 'I1', 'Q0', 'Q1'].forEach((l, i) =>
      c.fillText(l, W * 0.62, H * (0.14 + i * 0.145)),
    );
  });
  face.position.set(0, 0, 0.0555);
  g.add(face);
  const colours = [0x37d67a, 0x37d67a, 0xffb02e, 0xffb02e, 0x4fa3ff, 0x4fa3ff];
  const lights = colours.map((c) => led(c));
  lights.forEach((m, i) =>
    g.add(mesh(new THREE.SphereGeometry(0.0035, 10, 8), m, 0.025, 0.032 - i * 0.0116, 0.056)),
  );
  animate.push({
    update: (t) => {
      // A scan cycle: power on, run blinking, inputs and outputs toggling on a slow pattern.
      lights[0].emissiveIntensity = 1.6;
      lights[1].emissiveIntensity = (t * 2) % 1 < 0.5 ? 1.6 : 0.1;
      const step = Math.floor(t * 1.5);
      [2, 3, 4, 5].forEach((j, n) => (lights[j].emissiveIntensity = (step >> n) & 1 ? 1.5 : 0.08));
    },
  });
  // Terminal blocks along the top and bottom, a screw and a wire entry each.
  for (const row of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      const x = -0.05 + i * 0.02;
      const y = row * 0.068;
      g.add(mesh(new THREE.BoxGeometry(0.018, 0.03, 0.045), k.green, x, y, 0.012));
      const screw = mesh(
        new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 14),
        k.steel,
        x,
        y,
        0.036,
      );
      screw.rotation.x = Math.PI / 2;
      g.add(screw);
      g.add(mesh(new THREE.BoxGeometry(0.008, 0.006, 0.01), k.rubber, x, y + row * 0.016, 0.02));
    }
  }
  g.add(mesh(new THREE.BoxGeometry(0.014, 0.006, 0.006), k.rubber, -0.045, -0.03, 0.057));
  return { root: fit(g, 0.24), animate };
}

function reader(d: DeviceInfo, k: Kit, font: string, accent: THREE.Color): Model {
  const g = new THREE.Group();
  const animate: Animated[] = [];
  g.add(mesh(new RoundedBoxGeometry(0.12, 0.17, 0.032, 5, 0.014), k.white));
  g.add(mesh(new RoundedBoxGeometry(0.106, 0.156, 0.004, 4, 0.01), k.glass, 0, 0, 0.0155));
  // The contactless mark: a dot and three arcs, generic.
  const mark = print(0.06, 0.06, 1600, (c, W) => {
    c.strokeStyle = 'rgba(255,255,255,0.86)';
    c.lineCap = 'round';
    c.lineWidth = W * 0.05;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(W * 0.3, W * 0.5, W * (0.16 + i * 0.13), -0.75, 0.75);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.86)';
    c.beginPath();
    c.arc(W * 0.3, W * 0.5, W * 0.05, 0, Math.PI * 2);
    c.fill();
  });
  mark.position.set(0, 0.018, 0.018);
  g.add(mark);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: accent.clone(),
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });
  const ring = mesh(new THREE.TorusGeometry(0.04, 0.0022, 10, 64), ringMat, 0, 0.018, 0.018);
  g.add(ring);
  const label = print(0.08, 0.02, 1600, (c, W, H) => {
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = `600 ${H * 0.55}px ${font}`;
    c.textAlign = 'center';
    c.fillText(`${d.tag}${d.chip ? ` · ${d.chip}` : ''}`, W / 2, H * 0.7);
  });
  label.position.set(0, -0.058, 0.018);
  g.add(label);
  const status = led(0x37d67a);
  g.add(mesh(new THREE.SphereGeometry(0.003, 10, 8), status, 0, 0.068, 0.018));
  animate.push({
    update: (t) => {
      // A card read every few seconds: the ring brightens and the status light answers.
      const p = (t % 3.2) / 3.2;
      ringMat.emissiveIntensity = 0.5 + (p < 0.12 ? Math.sin((p / 0.12) * Math.PI) * 2.2 : 0);
      status.emissiveIntensity = p > 0.1 && p < 0.2 ? 2.4 : 0.12;
    },
  });
  // Wall bracket.
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.12, 0.006), k.grey, 0, 0, -0.019));
  return { root: fit(g, 0.21), animate };
}

function beacon(d: DeviceInfo, k: Kit, font: string): Model {
  const g = new THREE.Group();
  const animate: Animated[] = [];
  const profile: THREE.Vector2[] = [];
  const R = 0.05,
    H = 0.022,
    e = 0.008;
  profile.push(new THREE.Vector2(0, 0));
  profile.push(new THREE.Vector2(R - e, 0));
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    profile.push(
      new THREE.Vector2(R - e + Math.cos(a) * e, e + Math.sin(a) * e + (i > 4 ? H - 2 * e : 0)),
    );
  }
  profile.push(new THREE.Vector2(R - e * 2, H));
  profile.push(new THREE.Vector2(0, H + 0.002));
  const shell = mesh(new THREE.LatheGeometry(profile, 64), k.white);
  g.add(shell);
  g.add(mesh(new THREE.CylinderGeometry(R - 0.002, R - 0.002, 0.004, 64), k.rubber, 0, -0.001, 0));
  const top = print(0.06, 0.06, 1600, (c, W) => {
    c.fillStyle = 'rgba(40,44,52,0.55)';
    c.font = `600 ${W * 0.11}px ${font}`;
    c.textAlign = 'center';
    c.fillText(d.tag, W / 2, W * 0.78);
    if (d.chip) {
      c.font = `500 ${W * 0.08}px ${font}`;
      c.fillText(d.chip, W / 2, W * 0.9);
    }
  });
  top.rotation.x = -Math.PI / 2;
  top.position.y = H + 0.0026;
  g.add(top);
  const blink = led(0x4fa3ff);
  g.add(mesh(new THREE.SphereGeometry(0.004, 12, 8), blink, 0, H + 0.002, -0.012));
  // Advertising: a short flash about once a second.
  animate.push({ update: (t) => (blink.emissiveIntensity = t % 1 < 0.06 ? 3 : 0.05) });
  const root = fit(g, 0.13);
  // Stood on its edge, tilted toward you, so its face reads.
  root.rotation.x = 1.05;
  const holder = new THREE.Group();
  holder.add(root);
  return { root: holder, animate };
}

/** Builds a device's model from its key in the facts. */
export function build(d: DeviceInfo, k: Kit, font: string, accent: THREE.Color): Model {
  switch (d.key) {
    case 'logger':
      return weatherStation(d, k, font);
    case 'epc':
      return controller(d, k, font);
    case 'plc':
      return plc(d, k, font);
    case 'attendumReader':
      return reader(d, k, font, accent);
    default:
      return beacon(d, k, font);
  }
}

/** Frees everything a model holds on the GPU. */
export function dispose(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mat) => {
      const std = mat as THREE.MeshStandardMaterial;
      std.map?.dispose();
      std.emissiveMap?.dispose();
      mat.dispose();
    });
  });
}
