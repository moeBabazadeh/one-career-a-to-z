// Low-poly robot models, built in the robot's own frame (x forward, y left, z up, metres), as a
// robot description would place its links. Flat shading keeps the facets readable.
import * as THREE from 'three';
import { BALL_R, BOT_F, BOT_R, ROVER } from './sim';

const mat = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.62,
    metalness: 0.08,
    ...extra,
  });

/** A cylinder standing on its axis along z, the way robot descriptions orient them. */
function zCyl(r: number, h: number, segs: number, m: THREE.Material) {
  const g = new THREE.CylinderGeometry(r, r, h, segs);
  g.rotateX(Math.PI / 2);
  return new THREE.Mesh(g, m);
}

function box(w: number, d: number, h: number, m: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, d, h), m);
}

/** Tags every mesh under a model with the frame it belongs to, for picking. */
function tag<T extends THREE.Object3D>(root: T, frame: string): T {
  root.traverse((o) => {
    o.userData.frame = frame;
  });
  return root;
}

/* ------------------------------------------------------------------ SSL robot */

const SSL_GREEN = 0x39d353;
const SSL_PINK = 0xff3fb4;
const SSL_YELLOW = 0xffd60a;

/**
 * A Small Size League robot: a cylinder with the front cut flat for the kicker and dribbler,
 * and the vision pattern on top: the team's centre dot and four dots whose colours encode the ID.
 */
export function sslBot(id: number) {
  const g = new THREE.Group();
  const y0 = Math.sqrt(BOT_R * BOT_R - BOT_F * BOT_F);
  const a0 = Math.atan2(y0, BOT_F);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, BOT_R, a0, 2 * Math.PI - a0, false);
  shape.lineTo(BOT_F, y0);
  const height = 0.14;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 7 }),
    mat(0x2b2f36),
  );
  g.add(body);
  const lid = new THREE.Mesh(new THREE.ShapeGeometry(shape, 7), mat(0x101215, { roughness: 0.9 }));
  lid.position.z = height + 0.001;
  g.add(lid);
  const dot = (x: number, y: number, r: number, color: number) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 10),
      new THREE.MeshBasicMaterial({ color }),
    );
    m.position.set(x, y, height + 0.002);
    g.add(m);
  };
  dot(0, 0, 0.025, SSL_YELLOW);
  const spots: [number, number][] = [
    [0.034, 0.052],
    [-0.044, 0.044],
    [-0.044, -0.044],
    [0.034, -0.052],
  ];
  spots.forEach(([x, y], bit) => dot(x, y, 0.02, (id >> bit) & 1 ? SSL_GREEN : SSL_PINK));
  // Dribbler bar and kicker plate across the flat front.
  const drib = box(0.012, 0.074, 0.016, mat(0x7c8590, { metalness: 0.4 }));
  drib.position.set(BOT_F + 0.004, 0, 0.03);
  g.add(drib);
  const plate = box(0.004, 0.06, 0.05, mat(0x9aa3ad, { metalness: 0.5 }));
  plate.position.set(BOT_F + 0.001, 0, 0.075);
  g.add(plate);
  return tag(g, `ssl/robot_${id}`);
}

export function ballMesh() {
  const m = new THREE.Mesh(
    new THREE.IcosahedronGeometry(BALL_R, 1),
    mat(0xff7a1a, { roughness: 0.5 }),
  );
  m.position.z = BALL_R;
  return tag(m, 'ball');
}

/* ------------------------------------------------------------------ quadcopter */

export function quadModel() {
  const g = new THREE.Group();
  const dark = mat(0x31363e);
  const carbon = mat(0x1d2025, { roughness: 0.8 });
  const front = mat(0xe5413a);
  const body = box(0.13, 0.1, 0.05, dark);
  g.add(body);
  const battery = box(0.1, 0.05, 0.025, mat(0x4a79d8));
  battery.position.z = 0.037;
  g.add(battery);
  const props: THREE.Object3D[] = [];
  const arm = 0.155;
  const corners: [number, number, boolean][] = [
    [arm, arm, true],
    [arm, -arm, true],
    [-arm, arm, false],
    [-arm, -arm, false],
  ];
  corners.forEach(([x, y, isFront], i) => {
    const len = Math.hypot(x, y);
    const a = box(len, 0.02, 0.012, isFront ? front : carbon);
    a.position.set(x / 2, y / 2, 0.006);
    a.rotation.z = Math.atan2(y, x);
    g.add(a);
    const motor = zCyl(0.019, 0.03, 8, mat(0x8a929c, { metalness: 0.5 }));
    motor.position.set(x, y, 0.02);
    g.add(motor);
    const hub = new THREE.Group();
    hub.position.set(x, y, 0.038);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 18),
      new THREE.MeshBasicMaterial({
        color: 0x9aa4b0,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    hub.add(disc);
    const blade = box(0.19, 0.014, 0.003, mat(i % 2 ? 0x22262c : 0x3a4048));
    hub.add(blade);
    hub.userData.dir = i === 0 || i === 3 ? 1 : -1;
    g.add(hub);
    props.push(hub);
  });
  for (const side of [-1, 1]) {
    const skid = box(0.22, 0.008, 0.008, carbon);
    skid.position.set(0, side * 0.065, -0.051);
    g.add(skid);
    for (const fx of [-0.05, 0.05]) {
      const leg = box(0.008, 0.008, 0.05, carbon);
      leg.position.set(fx, side * 0.06, -0.026);
      leg.rotation.x = side * 0.25;
      g.add(leg);
    }
  }
  return { group: tag(g, 'quad/base_link'), props };
}

/* ------------------------------------------------------------------ rover */

export function roverModel() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const hw = 0.18;
  const hd = 0.135;
  const c = 0.04;
  shape.moveTo(-hw + c, -hd);
  shape.lineTo(hw - c, -hd);
  shape.lineTo(hw, -hd + c);
  shape.lineTo(hw, hd - c);
  shape.lineTo(hw - c, hd);
  shape.lineTo(-hw + c, hd);
  shape.lineTo(-hw, hd - c);
  shape.lineTo(-hw, -hd + c);
  const chassis = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.085, bevelEnabled: false }),
    mat(0x3b4048),
  );
  chassis.position.z = 0.032;
  g.add(chassis);
  const deck = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }),
    mat(0xf29d38),
  );
  deck.scale.set(0.94, 0.92, 1);
  deck.position.z = 0.117;
  g.add(deck);
  const wheelMat = mat(0x16181c, { roughness: 0.95 });
  const hubMat = mat(0xb9c0c8, { metalness: 0.4 });
  const wheels: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(0, (side * ROVER.track) / 2, ROVER.wheelR);
    const tyre = new THREE.Mesh(
      new THREE.CylinderGeometry(ROVER.wheelR, ROVER.wheelR, 0.032, 12),
      wheelMat,
    );
    w.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.034, 6), hubMat);
    w.add(hub);
    const spoke = box(0.07, 0.035, 0.01, hubMat);
    w.add(spoke);
    g.add(w);
    wheels.push(w);
  }
  const caster = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), hubMat);
  caster.position.set(-0.14, 0, 0.022);
  g.add(caster);
  const lidarBase = zCyl(0.042, 0.03, 10, mat(0x23262b));
  lidarBase.position.set(0.02, 0, 0.145);
  g.add(lidarBase);
  const lidarTop = zCyl(0.036, 0.022, 10, mat(0x4d5560, { metalness: 0.3 }));
  lidarTop.position.set(0.02, 0, 0.17);
  g.add(lidarTop);
  const mast = box(0.016, 0.016, 0.15, mat(0x8a929c));
  mast.position.set(0.13, 0, 0.2);
  g.add(mast);
  const cam = box(0.03, 0.1, 0.03, mat(0x1d2025));
  cam.position.set(0.15, 0, 0.28);
  cam.rotation.y = 0.3;
  g.add(cam);
  const lens = zCyl(0.008, 0.006, 8, mat(0x4a79d8, { metalness: 0.6 }));
  lens.rotation.y = Math.PI / 2 + 0.3;
  lens.position.set(0.167, 0.025, 0.275);
  g.add(lens);
  const lens2 = lens.clone();
  lens2.position.y = -0.025;
  g.add(lens2);
  return { group: tag(g, 'base_link'), wheels };
}

/* ------------------------------------------------------------------ collision shapes */

export function collisionShapes(team: number) {
  const m = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    wireframe: false,
  });
  const bots = Array.from({ length: team }, () => {
    const c = zCyl(BOT_R, 0.15, 12, m);
    c.position.z = 0.075;
    const g = new THREE.Group();
    g.add(c);
    return g;
  });
  const rover = new THREE.Group();
  const rb = box(0.38, 0.36, 0.3, m);
  rb.position.z = 0.15;
  rover.add(rb);
  const quad = new THREE.Group();
  quad.add(box(0.5, 0.5, 0.13, m));
  return { bots, rover, quad };
}

/* ------------------------------------------------------------------ frames */

/** A frame's axes as three solid rods, red x, green y, blue z. */
export function axes(len: number, r: number, mats: THREE.Material[]) {
  const g = new THREE.Group();
  const x = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mats[0]);
  x.rotation.z = -Math.PI / 2;
  x.position.x = len / 2;
  const y = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mats[1]);
  y.position.y = len / 2;
  const z = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mats[2]);
  z.rotation.x = Math.PI / 2;
  z.position.z = len / 2;
  g.add(x, y, z);
  return g;
}

/** An arrow along +x: a shaft and a cone, as one mesh group. */
export function arrow(len: number, r: number, m: THREE.Material) {
  const g = new THREE.Group();
  const head = len * 0.3;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len - head, 6), m);
  shaft.rotation.z = -Math.PI / 2;
  shaft.position.x = (len - head) / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 2.4, head, 8), m);
  cone.rotation.z = -Math.PI / 2;
  cone.position.x = len - head / 2;
  g.add(shaft, cone);
  return g;
}
