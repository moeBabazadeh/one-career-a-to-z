// Programs for the Toolpath concept. A small post-processor writes Fanuc-style G-code (modal
// words, trailing-dot integers, I/J arc centres, canned drilling cycles) and, for every block,
// the exact motion it commands. The simulator plays those motions, so what you see cut is what
// the listing says.

import { db } from '../_shared/data';
import { layout, measure, type P, type Stroke } from './font';

export type V3 = [number, number, number];

export interface Tool {
  t: number;
  kind: 'vbit' | 'drill' | 'face' | 'flat';
  name: string;
  d: number;
  /** Included angle, for V-bits and drill points. */
  angle?: number;
  /** Flat at the tip of a V-bit. */
  tip?: number;
  flutes: number;
  /** Stick-out below the holder. */
  length: number;
}

export interface Move {
  rapid: boolean;
  feed: number;
  pts: V3[];
  cum: number[];
  len: number;
}

export interface Modal {
  motion: string;
  tool: number;
  rpm: number;
  spindle: 'M3' | 'M5';
  coolant: 'M7' | 'M8' | 'M9';
  feed: number;
  tlo: boolean;
  cycle: 'G80' | 'G81' | 'G83';
  abs: 'G90' | 'G91';
}

export interface Block {
  text: string;
  moves: Move[];
  dwell: number;
  modal: Modal;
  /** Position after the block. */
  end: V3;
  /** Shown over the viewport while the block runs. */
  note?: string;
}

export interface Pad {
  x: number;
  y: number;
  r: number;
}

export interface Stock {
  w: number;
  h: number;
  t: number;
  kind: 'alu' | 'pcb';
  material: string;
  pads?: Pad[];
}

export interface Program {
  number: string;
  file: string;
  blocks: Block[];
  tools: Tool[];
  stock: Stock;
  home: V3;
  /** G54 work offset: machine = work + offset. */
  offset: V3;
  /** Seconds at 100% overrides, from each block to the end: feed moves, rapids, dwells. */
  feedLeft: number[];
  rapidLeft: number[];
  dwellLeft: number[];
  bytes: number;
}

/** G0 traverse rate, mm/min. */
export const RAPID = 20000;

/** Fanuc-style number: up to three decimals, integers with a trailing point. */
export const fmt = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  if (r === 0) return '0.';
  return Number.isInteger(r) ? `${r}.` : String(r);
};

function makeMove(pts: V3[], rapid: boolean, feed: number): Move {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return { rapid, feed, pts, cum, len: cum[cum.length - 1] };
}

interface Target {
  x?: number;
  y?: number;
  z?: number;
}

/** A tiny post-processor. Each call appends one block of G-code and the motion it commands. */
class Post {
  blocks: Block[] = [];
  pos: V3;
  m: Modal = {
    motion: '',
    tool: 0,
    rpm: 0,
    spindle: 'M5',
    coolant: 'M9',
    feed: 0,
    tlo: false,
    cycle: 'G80',
    abs: 'G90',
  };
  home: V3;
  toolChange: number;

  constructor(home: V3, toolChange = 2.4, loaded = 0) {
    this.home = home;
    this.pos = [...home];
    this.toolChange = toolChange;
    this.m.tool = loaded;
  }

  emit(text: string, moves: Move[] = [], dwell = 0, note?: string) {
    this.blocks.push({ text, moves, dwell, note, modal: { ...this.m }, end: [...this.pos] });
  }

  comment(text: string) {
    this.emit(`(${text.toUpperCase()})`);
  }

  code(text: string, change: Partial<Modal> = {}, dwell = 0, note?: string) {
    Object.assign(this.m, change);
    this.emit(text, [], dwell, note);
  }

  private target(t: Target): V3 {
    return [t.x ?? this.pos[0], t.y ?? this.pos[1], t.z ?? this.pos[2]];
  }

  private axes(to: V3, force = false) {
    return (['X', 'Y', 'Z'] as const)
      .map((a, i) => (force || Math.abs(to[i] - this.pos[i]) > 5e-4 ? `${a}${fmt(to[i])}` : ''))
      .filter(Boolean)
      .join(' ');
  }

  private motion(g: string) {
    const word = this.m.motion === g ? '' : g;
    this.m.motion = g;
    return word;
  }

  private feedWord(f: number) {
    const word = this.m.feed === f ? '' : `F${fmt(f)}`;
    this.m.feed = f;
    return word;
  }

  rapid(t: Target, extra: { pre?: string; post?: string; change?: Partial<Modal> } = {}) {
    const to = this.target(t);
    const ax = this.axes(to);
    if (!ax) return;
    Object.assign(this.m, extra.change);
    const words = [this.motion('G0'), extra.pre, ax, extra.post];
    const move = makeMove([this.pos, to], true, RAPID);
    this.pos = to;
    this.emit(words.filter(Boolean).join(' '), [move]);
  }

  linear(t: Target, f: number) {
    const to = this.target(t);
    const ax = this.axes(to);
    if (!ax) return;
    const words = [this.motion('G1'), ax, this.feedWord(f)];
    const move = makeMove([this.pos, to], false, f);
    this.pos = to;
    this.emit(words.filter(Boolean).join(' '), [move]);
  }

  /** A G2 (sweep < 0) or G3 arc in the XY plane, `sweep` in degrees. */
  arc(to: P, c: P, sweep: number, f: number) {
    const from = this.pos;
    const end: V3 = [to[0], to[1], from[2]];
    const r = Math.hypot(from[0] - c[0], from[1] - c[1]);
    const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    const sw = (sweep * Math.PI) / 180;
    const n = Math.max(6, Math.ceil((Math.abs(sw) * r) / 0.35));
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++)
      pts.push([
        c[0] + r * Math.cos(a0 + (sw * i) / n),
        c[1] + r * Math.sin(a0 + (sw * i) / n),
        from[2],
      ]);
    pts[n] = end;
    const words = [
      this.motion(sweep < 0 ? 'G2' : 'G3'),
      this.axes(end),
      `I${fmt(c[0] - from[0])}`,
      `J${fmt(c[1] - from[1])}`,
      this.feedWord(f),
    ];
    this.pos = end;
    this.emit(words.filter(Boolean).join(' '), [makeMove(pts, false, f)]);
  }

  /** G81 drilling or G83 peck drilling at each hole, returning to the initial level (G98). */
  drill(
    holes: P[],
    { g, z, r, q = 0, f }: { g: 'G81' | 'G83'; z: number; r: number; q?: number; f: number },
  ) {
    const init = this.pos[2];
    holes.forEach((h, k) => {
      const moves: Move[] = [];
      let at: V3 = [...this.pos];
      const go = (zz: number, rapid: boolean) => {
        const to: V3 = [h[0], h[1], zz];
        moves.push(makeMove([at, to], rapid, rapid ? RAPID : f));
        at = to;
      };
      if (Math.hypot(at[0] - h[0], at[1] - h[1]) > 1e-3) {
        moves.push(makeMove([at, [h[0], h[1], init]], true, RAPID));
        at = [h[0], h[1], init];
      }
      go(r, true);
      if (g === 'G81') go(z, false);
      else {
        for (let depth = r; depth > z + 1e-6;) {
          const next = Math.max(z, depth - q);
          if (depth < r) go(depth + 0.3, true);
          go(next, false);
          go(r, true);
          depth = next;
        }
      }
      go(init, true);

      const words =
        k === 0
          ? [
              'G98',
              g,
              `X${fmt(h[0])}`,
              `Y${fmt(h[1])}`,
              `Z${fmt(z)}`,
              `R${fmt(r)}`,
              q ? `Q${fmt(q)}` : '',
              `F${fmt(f)}`,
            ]
          : [this.axes([h[0], h[1], init])];
      this.m.motion = g;
      this.m.cycle = g;
      this.m.feed = f;
      this.pos = at;
      this.emit(words.filter(Boolean).join(' '), moves);
    });
    this.code('G80', { cycle: 'G80', motion: '' });
  }

  /** M6 with the spindle stopped (skipped when the tool is already in), then spin up to speed. */
  tool(tool: Tool, rpm: number, coolant: 'M7' | 'M8') {
    const loaded = this.m.tool === tool.t;
    this.comment(`T${tool.t} ${tool.name}`);
    this.code(
      `T${tool.t} M6`,
      { tool: tool.t, tlo: false },
      loaded ? 0.3 : this.toolChange,
      !this.toolChange
        ? undefined
        : loaded
          ? `M6 · T${tool.t} ALREADY IN SPINDLE`
          : `M6 · TOOL CHANGE · T${tool.t}`,
    );
    this.code(
      `S${rpm} M3`,
      { rpm, spindle: 'M3' },
      this.toolChange ? 1 : 0,
      this.toolChange ? `M3 · SPINDLE TO ${rpm} RPM` : undefined,
    );
    this.code(coolant, { coolant });
    this.m.motion = '';
  }

  /** G28 G91: back to machine home on the named axes, by way of the current position. */
  home28(axes: ('X' | 'Y' | 'Z')[]) {
    const to: V3 = [...this.pos];
    for (const a of axes) to['XYZ'.indexOf(a)] = this.home['XYZ'.indexOf(a)];
    Object.assign(this.m, { abs: 'G91', motion: 'G0' }, axes.includes('Z') ? { tlo: false } : {});
    const move = makeMove([this.pos, to], true, RAPID);
    this.pos = to;
    this.emit(`G28 G91 ${axes.map((a) => `${a}0.`).join(' ')}`, [move]);
    this.code('G90', { abs: 'G90' });
  }

  /** Spindle and coolant off, Z home. */
  park() {
    this.code('M5', { spindle: 'M5', rpm: 0 });
    this.code('M9', { coolant: 'M9' });
    this.home28(['Z']);
  }

  /** Engraves strokes: rapid over, drop to the feed height, plunge, cut, retract. */
  engrave(
    strokes: Stroke[],
    {
      depth,
      feed,
      plunge,
      retract = 2,
    }: { depth: number; feed: number; plunge: number; retract?: number },
  ) {
    for (const s of strokes) {
      if (this.pos[2] < retract) this.rapid({ z: retract });
      this.rapid({ x: s.start[0], y: s.start[1] });
      this.rapid({ z: 0.5 });
      this.linear({ z: -depth }, plunge);
      for (const seg of s.segs) {
        if (seg.kind === 'line') this.linear({ x: seg.to[0], y: seg.to[1] }, feed);
        else this.arc(seg.to, seg.c, seg.a1 - seg.a0, feed);
      }
    }
    this.rapid({ z: retract });
  }

  finish(meta: { number: string; file: string; tools: Tool[]; stock: Stock; offset: V3 }): Program {
    const n = this.blocks.length;
    const feedLeft = new Array<number>(n + 1).fill(0);
    const rapidLeft = new Array<number>(n + 1).fill(0);
    const dwellLeft = new Array<number>(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      const b = this.blocks[i];
      let fe = 0,
        ra = 0;
      for (const mv of b.moves) {
        if (mv.rapid) ra += mv.len / (RAPID / 60);
        else fe += mv.len / (mv.feed / 60);
      }
      feedLeft[i] = feedLeft[i + 1] + fe;
      rapidLeft[i] = rapidLeft[i + 1] + ra;
      dwellLeft[i] = dwellLeft[i + 1] + b.dwell;
    }
    const bytes = this.blocks.reduce((sum, b) => sum + b.text.length + 1, 0);
    return { ...meta, blocks: this.blocks, home: this.home, feedLeft, rapidLeft, dwellLeft, bytes };
  }
}

/** Seconds to run from block `b` to the end at the given overrides (1 = 100%). */
export const estimate = (p: Program, b = 0, fro = 1, ro = 1) =>
  p.feedLeft[b] / Math.max(fro, 0.01) + p.rapidLeft[b] / Math.max(ro, 0.01) + p.dwellLeft[b];

/** Width of the groove a tool leaves at a depth: V-bits widen as they go down. */
export function cutWidth(tool: Tool, depth: number) {
  if (tool.kind === 'vbit')
    return (
      (tool.tip ?? 0) + 2 * Math.max(0, depth) * Math.tan(((tool.angle ?? 90) * Math.PI) / 360)
    );
  return tool.d;
}

export const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/* ------------------------------------------------------------------ the hero program */

export const HERO_TOOLS: Tool[] = [
  { t: 1, kind: 'vbit', name: '90DEG V-BIT D=6.', d: 6, angle: 90, tip: 0, flutes: 2, length: 26 },
  {
    t: 2,
    kind: 'vbit',
    name: '60DEG ENGRAVER D=3.175 TIP=0.1',
    d: 3.175,
    angle: 60,
    tip: 0.1,
    flutes: 1,
    length: 22,
  },
  {
    t: 3,
    kind: 'drill',
    name: 'DRILL D=3.4 M3 CLEARANCE',
    d: 3.4,
    angle: 118,
    flutes: 2,
    length: 30,
  },
];

/** The nameplate as posted by default: his name, his role line, and a program number from the year he started. */
export const PLATE = {
  name: db.person.name.toUpperCase(),
  role: `${db.current.title} · ${db.current.company}`.toUpperCase(),
  number: `O${db.person.since}`,
};

/** A program's file name: "MOE_BABAZADEH.NC". */
export const ncFile = (name: string) => `${name.trim().replace(/\s+/g, '_') || 'BLANK'}.NC`;

const HERO_STOCK: Stock = { w: 200, h: 80, t: 6, kind: 'alu', material: '6061-T6, black anodized' };
const G54: V3 = [-318.4, -207.15, -96.48];

/**
 * The nameplate: a name cut with a V-bit, a role line with a fine engraver, and four mounting
 * holes peck-drilled through. Long names shrink to fit the plate.
 */
export function heroProgram(name = PLATE.name, role = PLATE.role, number = PLATE.number): Program {
  const st = HERO_STOCK;
  const home: V3 = [-G54[0], -G54[1], -G54[2]];
  const [t1, t2, t3] = HERO_TOOLS;
  const nameH = Math.min(15, ((st.w - 26) * 10) / Math.max(1, measure(name)));
  const roleH = Math.min(5.5, ((st.w - 40) * 10) / Math.max(1, measure(role)));
  const nameStrokes = layout(name, { x: st.w / 2, y: 38, height: nameH, center: true });
  const roleStrokes = layout(role, { x: st.w / 2, y: 22, height: roleH, center: true });
  const file = ncFile(name);

  const p = new Post(home, 2.4, 1);
  p.emit('%');
  p.emit(`${number} (${name.trim().toUpperCase() || 'BLANK'})`);
  p.comment(role.replace('·', '-'));
  p.comment('STOCK 200 X 80 X 6 - 6061-T6 BLACK ANODIZED');
  p.comment('G54 - X0 Y0 FRONT LEFT - Z0 TOP OF STOCK');
  p.comment('T1 D=6. TAPER=90DEG - ZMIN=-0.5 - V-BIT');
  p.comment('T2 D=3.175 TAPER=60DEG - ZMIN=-0.3 - ENGRAVER');
  p.comment('T3 D=3.4 - ZMIN=-7.2 - DRILL');
  p.code('G90 G94 G17 G21 G40 G49 G80');
  p.code('G54');

  p.comment('OP1 ENGRAVE NAME');
  p.tool(t1, 18000, 'M8');
  if (nameStrokes.length) {
    p.rapid({ x: nameStrokes[0].start[0], y: nameStrokes[0].start[1] });
    p.rapid({ z: 15 }, { pre: 'G43', post: 'H1', change: { tlo: true } });
    p.engrave(nameStrokes, { depth: 0.5, feed: 1800, plunge: 600 });
    p.rapid({ z: 15 });
  }
  p.park();

  p.comment('OP2 ENGRAVE ROLE');
  p.tool(t2, 24000, 'M7');
  if (roleStrokes.length) {
    p.rapid({ x: roleStrokes[0].start[0], y: roleStrokes[0].start[1] });
    p.rapid({ z: 15 }, { pre: 'G43', post: 'H2', change: { tlo: true } });
    p.engrave(roleStrokes, { depth: 0.3, feed: 1200, plunge: 400 });
    p.rapid({ z: 15 });
  }
  p.park();

  p.comment('OP3 DRILL MOUNTING HOLES');
  p.tool(t3, 4500, 'M8');
  const holes: P[] = [
    [6, 6],
    [194, 6],
    [194, 74],
    [6, 74],
  ];
  p.rapid({ x: 6, y: 6 });
  p.rapid({ z: 15 }, { pre: 'G43', post: 'H3', change: { tlo: true } });
  p.drill(holes, { g: 'G83', z: -7.2, r: 1, q: 1.5, f: 250 });
  p.park();
  p.home28(['X', 'Y']);
  p.code('M30', {}, 0, 'M30 · PROGRAM END');
  p.emit('%');

  return p.finish({ number, file, tools: HERO_TOOLS, stock: st, offset: G54 });
}

/* ------------------------------------------------------------------ operation previews */

const BLOCK_STOCK: Stock = { w: 120, h: 70, t: 24, kind: 'alu', material: '6061-T6' };

function opStart(p: Post, label: string, tool: Tool, rpm: number, at: P) {
  p.emit('%');
  p.comment(label);
  p.code('G90 G94 G17 G21 G40 G49 G80');
  p.code('G54');
  p.tool(tool, rpm, 'M8');
  p.rapid({ x: at[0], y: at[1] });
  p.rapid({ z: 15 }, { pre: 'G43', post: `H${tool.t}`, change: { tlo: true } });
}

function opEnd(p: Post) {
  p.rapid({ z: 15 });
  p.code('M5', { spindle: 'M5', rpm: 0 });
  p.code('M9', { coolant: 'M9' });
  p.code('M30');
  p.emit('%');
}

export interface Op {
  id: string;
  op: string;
  strategy: string;
  tool: Tool;
  rpm: number;
  feed: number;
  program: Program;
}

/** OP10: zig-zag facing with a 40 mm face mill, 180° arcs at the turns. */
function facing(): Program {
  const st = BLOCK_STOCK;
  const tool: Tool = {
    t: 5,
    kind: 'face',
    name: 'FACE MILL D=40. 5 INSERTS',
    d: 40,
    flutes: 5,
    length: 40,
  };
  const step = tool.d * 0.7;
  const x0 = -tool.d / 2 - 4,
    x1 = st.w + tool.d / 2 + 4;
  const p = new Post([x0, st.h - tool.d * 0.35, 40], 0);
  opStart(p, 'OP10 FACE', tool, 6000, [x0, st.h - tool.d * 0.35]);
  p.rapid({ z: 5 });
  p.linear({ z: -0.5 }, 800);
  let y = st.h - tool.d * 0.35;
  let dir = 1;
  while (y > -tool.d * 0.35) {
    p.linear({ x: dir > 0 ? x1 : x0 }, 2400);
    if (y - step <= -tool.d * 0.35) break;
    const cx = dir > 0 ? x1 : x0;
    p.arc([cx, y - step], [cx, y - step / 2], dir > 0 ? -180 : 180, 2400);
    y -= step;
    dir = -dir;
  }
  opEnd(p);
  return p.finish({ number: 'O0010', file: 'OP10_FACE.NC', tools: [tool], stock: st, offset: G54 });
}

/** OP20: trochoidal adaptive clearing of an 80 x 40 pocket, then a finishing pass on the walls. */
function adaptive(): Program {
  const st = BLOCK_STOCK;
  const tool: Tool = {
    t: 1,
    kind: 'flat',
    name: 'FLAT END MILL D=8. 3FL',
    d: 8,
    flutes: 3,
    length: 30,
  };
  const R = 3,
    adv = 2.4,
    depth = 6;
  const px0 = 20,
    px1 = 100,
    py0 = 15,
    py1 = 55;
  const xs = px0 + tool.d / 2 + R,
    xe = px1 - tool.d / 2 - R;
  const lanes = [py0 + tool.d / 2 + R, (py0 + py1) / 2, py1 - tool.d / 2 - R];
  const p = new Post([xs, lanes[0] - R, 40], 0);
  opStart(p, 'OP20 ADAPTIVE', tool, 12000, [xs, lanes[0] - R]);
  for (const yc of lanes) {
    p.rapid({ z: 5 });
    p.rapid({ x: xs, y: yc - R });
    p.linear({ z: -depth }, 600);
    for (let cx = xs; cx < xe - 1e-6; cx += adv) {
      p.arc([cx, yc + R], [cx, yc], 180, 3000);
      p.arc([cx + adv, yc - R], [cx + adv / 2, yc], 180, 3000);
    }
  }
  // finishing pass around the walls, R6 corners
  const off = tool.d / 2,
    rc = 6 - off;
  const [a, b, c, d] = [px0 + off, py0 + off, px1 - off, py1 - off];
  p.linear({ x: c - rc, y: b }, 1500);
  p.arc([c, b + rc], [c - rc, b + rc], 90, 1500);
  p.linear({ y: d - rc }, 1500);
  p.arc([c - rc, d], [c - rc, d - rc], 90, 1500);
  p.linear({ x: a + rc }, 1500);
  p.arc([a, d - rc], [a + rc, d - rc], 90, 1500);
  p.linear({ y: b + rc }, 1500);
  p.arc([a + rc, b], [a + rc, b + rc], 90, 1500);
  p.linear({ x: c - rc }, 1500);
  opEnd(p);
  return p.finish({
    number: 'O0020',
    file: 'OP20_ADAPTIVE.NC',
    tools: [tool],
    stock: st,
    offset: G54,
  });
}

/** OP30: an outside profile around a 16:9 part, climb cut (clockwise), two step-downs, tabs on the last. */
function contour(): Program {
  const st: Stock = { w: 120, h: 70, t: 10, kind: 'alu', material: '6061-T6' };
  const tool: Tool = {
    t: 2,
    kind: 'flat',
    name: 'FLAT END MILL D=6. 2FL',
    d: 6,
    flutes: 2,
    length: 28,
  };
  const off = tool.d / 2;
  const [a, b, c, d] = [12 - off, 8 - off, 108 + off, 62 + off];
  const rc = 6 + off,
    rl = 6,
    xs = 70,
    ym = (b + d) / 2;
  const p = new Post([xs + rl, b - rl, 40], 0);
  opStart(p, 'OP30 2D CONTOUR', tool, 14000, [xs + rl, b - rl]);
  for (const [k, z] of [-5, -10.5].entries()) {
    const f = 1600;
    // raise over a tab between two points along the current edge
    const tab = (y0: number, y1: number) => {
      if (k === 0) return;
      p.linear({ y: y0 }, f);
      p.linear({ z: -7.5 }, f);
      p.linear({ y: y1 }, f);
      p.linear({ z }, f);
    };
    p.rapid({ z: 2 });
    p.rapid({ x: xs + rl, y: b - rl });
    p.linear({ z }, 500);
    p.arc([xs, b], [xs, b - rl], 90, f);
    p.linear({ x: a + rc }, f);
    p.arc([a, b + rc], [a + rc, b + rc], -90, f);
    tab(ym - 5, ym + 5);
    p.linear({ y: d - rc }, f);
    p.arc([a + rc, d], [a + rc, d - rc], -90, f);
    p.linear({ x: c - rc }, f);
    p.arc([c, d - rc], [c - rc, d - rc], -90, f);
    tab(ym + 5, ym - 5);
    p.linear({ y: b + rc }, f);
    p.arc([c - rc, b], [c - rc, b + rc], -90, f);
    p.linear({ x: xs - 4 }, f);
    p.arc([xs - 4 - rl, b - rl], [xs - 4, b - rl], 90, f);
  }
  opEnd(p);
  return p.finish({
    number: 'O0030',
    file: 'OP30_CONTOUR.NC',
    tools: [tool],
    stock: st,
    offset: G54,
  });
}

const PCB: Stock = {
  w: 100,
  h: 60,
  t: 1.6,
  kind: 'pcb',
  material: 'FR-4, 1.6 mm, 1 oz copper',
  pads: [],
};

/** Nearest-neighbour hole order, the way CAM shortens drilling rapids. */
function tour(holes: P[], from: P): P[] {
  const left = [...holes];
  const out: P[] = [];
  let at = from;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (
        Math.hypot(left[i][0] - at[0], left[i][1] - at[1]) <
        Math.hypot(left[best][0] - at[0], left[best][1] - at[1])
      )
        best = i;
    }
    at = left.splice(best, 1)[0];
    out.push(at);
  }
  return out;
}

/** OP40: a PCB drill file. DIP-8 and header pins, terminal block, then mounting holes. */
function drilling(): Program {
  const pins: P[] = [];
  for (let i = 0; i < 4; i++) pins.push([20 + i * 2.54, 22], [20 + i * 2.54, 22 + 7.62]);
  for (let i = 0; i < 10; i++) pins.push([44 + i * 2.54, 46], [44 + i * 2.54, 48.54]);
  for (let i = 0; i < 6; i++) pins.push([50 + i * 2.54, 16]);
  const term: P[] = [
    [82, 26],
    [87.08, 26],
    [82, 34],
    [87.08, 34],
  ];
  const mount: P[] = [
    [4, 4],
    [96, 4],
    [96, 56],
    [4, 56],
  ];
  const stock: Stock = {
    ...PCB,
    pads: [
      ...pins.map(([x, y]) => ({ x, y, r: 0.85 })),
      ...term.map(([x, y]) => ({ x, y, r: 1.3 })),
      ...mount.map(([x, y]) => ({ x, y, r: 2.6 })),
    ],
  };
  const tools: Tool[] = [
    { t: 1, kind: 'drill', name: 'DRILL D=0.8 CARBIDE', d: 0.8, angle: 130, flutes: 2, length: 12 },
    { t: 2, kind: 'drill', name: 'DRILL D=1.2 CARBIDE', d: 1.2, angle: 130, flutes: 2, length: 14 },
    { t: 3, kind: 'drill', name: 'DRILL D=3.2 CARBIDE', d: 3.2, angle: 130, flutes: 2, length: 18 },
  ];
  const p = new Post([0, 0, 30], 0.6);
  p.emit('%');
  p.comment('OP40 DRILL - PCB');
  p.code('G90 G94 G17 G21 G40 G49 G80');
  p.code('G54');
  let at: P = [0, 0];
  for (const [i, set] of [pins, term, mount].entries()) {
    const order = tour(set, at);
    p.tool(tools[i], 24000, 'M7');
    p.rapid({ x: order[0][0], y: order[0][1] });
    p.rapid({ z: 5 }, { pre: 'G43', post: `H${tools[i].t}`, change: { tlo: true } });
    p.drill(order, { g: 'G81', z: -2.2, r: 0.5, f: 600 });
    at = order[order.length - 1];
    p.rapid({ z: 15 });
  }
  p.code('M5', { spindle: 'M5', rpm: 0 });
  p.code('M9', { coolant: 'M9' });
  p.code('M30');
  p.emit('%');
  return p.finish({ number: 'O0040', file: 'OP40_DRILL.NC', tools, stock, offset: G54 });
}

/** OP50: the merged pull requests, engraved with the same font as the name. */
function engraving(prs: string[]): Program {
  const st: Stock = { w: 100, h: 70, t: 6, kind: 'alu', material: '6061-T6, black anodized' };
  const tool: Tool = {
    t: 4,
    kind: 'vbit',
    name: '60DEG ENGRAVER D=3.175 TIP=0.1',
    d: 3.175,
    angle: 60,
    tip: 0.1,
    flutes: 1,
    length: 22,
  };
  const strokes = prs.flatMap((pr, i) => layout(pr, { x: 10, y: 56 - i * 11.5, height: 6.5 }));
  const p = new Post([strokes[0].start[0], strokes[0].start[1], 40], 0);
  opStart(p, 'OP50 ENGRAVE', tool, 24000, strokes[0].start);
  p.engrave(strokes, { depth: 0.35, feed: 1200, plunge: 400 });
  opEnd(p);
  return p.finish({
    number: 'O0050',
    file: 'OP50_ENGRAVE.NC',
    tools: [tool],
    stock: st,
    offset: G54,
  });
}

export function buildOps(prs: string[]): Op[] {
  const make = (
    id: string,
    op: string,
    strategy: string,
    program: Program,
    rpm: number,
    feed: number,
  ): Op => ({ id, op, strategy, tool: program.tools[0], rpm, feed, program });
  return [
    make('op10', 'OP10', 'Face', facing(), 6000, 2400),
    make('op20', 'OP20', 'Adaptive clearing', adaptive(), 12000, 3000),
    make('op30', 'OP30', '2D contour', contour(), 14000, 1600),
    make('op40', 'OP40', 'Drill · G81', drilling(), 24000, 600),
    make('op50', 'OP50', 'Engrave', engraving(prs), 24000, 1200),
  ];
}
