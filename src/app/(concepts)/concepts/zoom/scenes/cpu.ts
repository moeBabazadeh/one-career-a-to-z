// Layer 8: the B-tree's inner search as the CPU runs it. A real lower_bound in x86-64 (Intel
// syntax) is executed by a tiny interpreter over eight sorted keys, so the registers on screen
// are the true values. A five-stage pipeline predicts branches not-taken, so every taken
// conditional branch flushes the two instructions behind it. The keys fill one 64-byte line.

import { C, clamp, fg, focusBox, mono, rgba, roundRect, stepAt, type Box } from '../kit';

export const CPU_CAPTIONS = [
  'The B-tree’s search inside a page, compiled: a binary search in a dozen x86-64 instructions.',
  'Registers hold everything in flight: lo in rax, hi in rsi, mid in rcx, the key in rdx.',
  'Five pipeline stages overlap five instructions. A mispredicted branch flushes the work behind it.',
  'Eight 8-byte keys fill one 64-byte cache line. The first load waits on DRAM, about 100 ns; the rest hit L1 in about 1 ns.',
];

const KEYS = [2009, 2012, 2017, 2021, 2022, 2023, 2024, 2025];
const TARGET = 2024;
const BASE = 0x55d0c0a0;

interface Regs {
  rax: number;
  rcx: number;
  rdx: number;
  rsi: number;
  rdi: number;
  cf: boolean;
  zf: boolean;
}

interface Ins {
  line: number;
  asm: string;
  cond?: boolean;
  /** Runs the instruction; returns the jump target (an instruction index), or -1 to fall through. */
  run: (r: Regs) => { to: number; mem?: number };
}

const LISTING: [string, string][] = [
  ['lower_bound:', 'rdi keys, rsi n, rdx key'],
  ['  xor   eax, eax', 'lo = 0'],
  ['.loop:', ''],
  ['  cmp   rax, rsi', 'lo < hi ?'],
  ['  jae   .done', ''],
  ['  lea   rcx, [rax+rsi]', ''],
  ['  shr   rcx, 1', 'mid = (lo + hi) / 2'],
  ['  cmp   [rdi+rcx*8], rdx', 'keys[mid] vs key'],
  ['  jae   .left', ''],
  ['  lea   rax, [rcx+1]', 'lo = mid + 1'],
  ['  jmp   .loop', ''],
  ['.left:', ''],
  ['  mov   rsi, rcx', 'hi = mid'],
  ['  jmp   .loop', ''],
  ['.done:', ''],
  ['  ret', 'rax = index of the key'],
];

const cmp = (r: Regs, a: number, b: number) => {
  r.cf = a < b;
  r.zf = a === b;
};

const INS: Ins[] = [
  { line: 1, asm: 'xor', run: (r) => ((r.rax = 0), (r.zf = true), (r.cf = false), { to: -1 }) },
  { line: 3, asm: 'cmp', run: (r) => (cmp(r, r.rax, r.rsi), { to: -1 }) },
  { line: 4, asm: 'jae', cond: true, run: (r) => ({ to: r.cf ? -1 : 11 }) },
  { line: 5, asm: 'lea', run: (r) => ((r.rcx = r.rax + r.rsi), { to: -1 }) },
  { line: 6, asm: 'shr', run: (r) => ((r.rcx >>= 1), { to: -1 }) },
  { line: 7, asm: 'cmp', run: (r) => (cmp(r, KEYS[r.rcx], r.rdx), { to: -1, mem: r.rcx }) },
  { line: 8, asm: 'jae', cond: true, run: (r) => ({ to: r.cf ? -1 : 9 }) },
  { line: 9, asm: 'lea', run: (r) => ((r.rax = r.rcx + 1), { to: -1 }) },
  { line: 10, asm: 'jmp', run: () => ({ to: 1 }) },
  { line: 12, asm: 'mov', run: (r) => ((r.rsi = r.rcx), { to: -1 }) },
  { line: 13, asm: 'jmp', run: () => ({ to: 1 }) },
  { line: 15, asm: 'ret', run: () => ({ to: -2 }) },
];

interface Step {
  ins: number;
  regs: Regs;
  taken: boolean;
  mem?: number;
}

// Execute once, up front: the trace is the same on every visit.
const TRACE: Step[] = (() => {
  const r: Regs = {
    rax: 0,
    rcx: 0,
    rdx: TARGET,
    rsi: KEYS.length,
    rdi: BASE,
    cf: false,
    zf: false,
  };
  const out: Step[] = [];
  let pc = 0;
  while (pc >= 0 && out.length < 64) {
    const { to, mem } = INS[pc].run(r);
    const taken = !!INS[pc].cond && to >= 0;
    out.push({ ins: pc, regs: { ...r }, taken, mem });
    pc = to === -2 ? -1 : to >= 0 ? to : pc + 1;
  }
  return out;
})();

// The fetch stream: predicted not-taken, so a taken conditional branch drags two wrong-path
// instructions in behind it, which are flushed when it resolves in EX.
interface Slot {
  ins: number;
  n: number;
  wrong: boolean;
}
const STREAM: Slot[] = TRACE.flatMap((s, n) => {
  const slot = { ins: s.ins, n, wrong: false };
  return s.taken
    ? [slot, { ins: s.ins + 1, n, wrong: true }, { ins: s.ins + 2, n, wrong: true }]
    : [slot];
});

const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const PERIOD = 0.42;
const CYCLES = STREAM.length + STAGES.length + 4;

const hex = (n: number) => `0x${n.toString(16)}`;

export function drawCpu(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, p: number) {
  ctx.clearRect(0, 0, w, h);
  const B = focusBox(w, h);
  const narrow = B.w < 520;
  const { k } = stepAt(p, CPU_CAPTIONS.length);
  const cycle = Math.floor(t / PERIOD) % CYCLES;
  const phase = (t / PERIOD) % 1;
  const at = (stage: number) => {
    const i = cycle - stage;
    return i >= 0 && i < STREAM.length ? STREAM[i] : null;
  };
  // What has executed: the newest correct-path instruction to reach EX.
  let done = -1;
  for (let s = 2; s < 5; s++) {
    const sl = at(s);
    if (sl && !sl.wrong) done = Math.max(done, sl.n);
  }
  const ex = at(2);
  const regs =
    done >= 0
      ? TRACE[done].regs
      : { rax: 0, rcx: 0, rdx: TARGET, rsi: KEYS.length, rdi: BASE, cf: false, zf: false };
  const focus = (panelStep: number) => (k === panelStep ? 1 : 0.55);

  const gap = narrow ? 12 : 18;
  const lh = narrow ? 12.5 : 16;
  const listB: Box = { x: B.x, y: B.y, w: narrow ? B.w : B.w * 0.6, h: 24 + LISTING.length * lh };
  const regB: Box = narrow
    ? { x: B.x, y: listB.y + listB.h + gap, w: B.w, h: 52 }
    : { x: listB.x + listB.w + gap, y: B.y, w: B.w - listB.w - gap, h: listB.h };
  const pipeB: Box = { x: B.x, y: regB.y + regB.h + gap + 6, w: B.w, h: narrow ? 58 : 74 };
  const memY = pipeB.y + pipeB.h + gap + 22;
  const memB: Box = { x: B.x, y: memY, w: B.w, h: B.y + B.h - memY };

  // Listing, with the instruction in EX marked.
  ctx.globalAlpha = focus(0);
  roundRect(ctx, listB.x, listB.y, listB.w, listB.h, 8);
  ctx.fillStyle = C.wellCpu;
  ctx.fill();
  ctx.strokeStyle = rgba('yellow', 0.3);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = mono(narrow ? 8.5 : 10.5);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const exLine = ex ? INS[ex.ins].line : -1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(listB.x, listB.y, listB.w, listB.h);
  ctx.clip();
  LISTING.forEach(([code, note], i) => {
    const y = listB.y + 16 + i * lh;
    const hot = i === exLine;
    if (hot) {
      ctx.fillStyle = ex?.wrong ? rgba('red', 0.25) : rgba('yellow', 0.18);
      ctx.fillRect(listB.x + 4, y - lh / 2, listB.w - 8, lh);
      ctx.fillStyle = ex?.wrong ? C.red : C.yellow;
      ctx.fillText('▶', listB.x + 8, y);
    }
    ctx.fillStyle = code.endsWith(':') ? C.yellow : hot ? C.fg : fg(0.72);
    ctx.fillText(code, listB.x + 22, y);
    if (note && !narrow) {
      ctx.fillStyle = fg(0.38);
      ctx.fillText(`; ${note}`, listB.x + listB.w * 0.52, y);
    }
  });
  ctx.restore();

  // Registers.
  ctx.globalAlpha = focus(1);
  roundRect(ctx, regB.x, regB.y, regB.w, regB.h, 8);
  ctx.fillStyle = C.wellCpu;
  ctx.fill();
  ctx.strokeStyle = rgba('yellow', 0.3);
  ctx.stroke();
  const regRows: [string, string][] = [
    ['rax', String(regs.rax)],
    ['rcx', String(regs.rcx)],
    ['rdx', String(regs.rdx)],
    ['rsi', String(regs.rsi)],
    ['rdi', hex(regs.rdi)],
    ['CF ZF', `${+regs.cf} ${+regs.zf}`],
  ];
  if (narrow) {
    ctx.font = mono(8.5, 600);
    regRows.forEach(([name, val], i) => {
      const col = i % 3,
        row = Math.floor(i / 3);
      const x = regB.x + 10 + col * (regB.w / 3),
        y = regB.y + 16 + row * 20;
      ctx.fillStyle = C.yellow;
      ctx.fillText(name, x, y);
      ctx.fillStyle = C.fg;
      ctx.fillText(val, x + 36, y);
    });
  } else {
    ctx.font = mono(10, 600);
    ctx.fillStyle = fg(0.5);
    ctx.fillText('REGISTERS', regB.x + 12, regB.y + 16);
    const rh = (regB.h - 40) / regRows.length;
    regRows.forEach(([name, val], i) => {
      const y = regB.y + 40 + i * rh + rh / 2 - 6;
      ctx.font = mono(11, 600);
      ctx.fillStyle = C.yellow;
      ctx.fillText(name, regB.x + 14, y);
      ctx.fillStyle = C.fg;
      ctx.font = mono(15, 600);
      ctx.textAlign = 'right';
      ctx.fillText(val, regB.x + regB.w - 14, y);
      ctx.textAlign = 'left';
    });
  }

  // Pipeline.
  ctx.globalAlpha = focus(2);
  const sw = (pipeB.w - 4 * 8) / 5;
  STAGES.forEach((name, s) => {
    const sl = at(s);
    const x = pipeB.x + s * (sw + 8);
    const flushed = !!sl?.wrong;
    const bubble = flushed && s >= 2;
    const killed = flushed && s < 2 && !!ex && ex.n === sl?.n && !ex.wrong;
    roundRect(ctx, x, pipeB.y, sw, pipeB.h, 8);
    ctx.fillStyle = killed ? rgba('red', 0.22) : sl && !bubble ? rgba('yellow', 0.12) : fg(0.03);
    ctx.fill();
    ctx.strokeStyle = killed ? C.red : s === 2 ? C.yellow : fg(0.22);
    ctx.lineWidth = s === 2 ? 1.6 : 1;
    ctx.stroke();
    ctx.font = mono(narrow ? 8 : 9.5, 600);
    ctx.fillStyle = fg(0.5);
    ctx.textAlign = 'center';
    ctx.fillText(name, x + sw / 2, pipeB.y + 14);
    ctx.font = mono(narrow ? 9 : 12, 600);
    ctx.fillStyle = killed ? C.red : bubble ? fg(0.35) : C.fg;
    const label = !sl ? '·' : bubble ? 'bubble' : (INS[sl.ins]?.asm ?? '·');
    ctx.fillText(label, x + sw / 2, pipeB.y + pipeB.h / 2 + 6);
    if (killed) {
      ctx.strokeStyle = C.red;
      ctx.beginPath();
      ctx.moveTo(x + 12, pipeB.y + pipeB.h / 2 + 6);
      ctx.lineTo(x + sw - 12, pipeB.y + pipeB.h / 2 + 6);
      ctx.stroke();
    }
  });
  ctx.textAlign = 'left';
  ctx.font = mono(narrow ? 8 : 9.5);
  ctx.fillStyle = fg(0.55);
  const flushing = !!ex && TRACE[ex.n]?.taken && !ex.wrong;
  ctx.fillText(
    `cycle ${String(cycle).padStart(2, '0')}${flushing ? ' · branch taken, predicted not: flush' : ''}`,
    pipeB.x,
    pipeB.y + pipeB.h + 14,
  );

  // The cache line and the memory hierarchy.
  ctx.globalAlpha = focus(3);
  if (memB.h < 60) {
    ctx.globalAlpha = 1;
    return;
  }
  const memSlot = at(3);
  const load = memSlot && !memSlot.wrong ? TRACE[memSlot.n].mem : undefined;
  const firstLoad = TRACE.findIndex((s) => s.mem !== undefined);
  const miss = load !== undefined && memSlot?.n === firstLoad;
  const lineY = memB.y + 18;
  const cw = (memB.w - 7 * 4) / 8;
  ctx.font = mono(narrow ? 8 : 9.5);
  ctx.fillStyle = fg(0.55);
  ctx.fillText(`one 64-byte cache line at ${hex(BASE)}: keys[0..7]`, memB.x, memB.y + 4);
  const inL1 = done >= firstLoad && firstLoad >= 0;
  KEYS.forEach((key, i) => {
    const x = memB.x + i * (cw + 4);
    const hot = load === i;
    roundRect(ctx, x, lineY, cw, 30, 5);
    ctx.fillStyle = hot ? C.yellow : inL1 ? rgba('yellow', 0.14) : fg(0.05);
    ctx.fill();
    ctx.strokeStyle = rgba('yellow', 0.35);
    ctx.stroke();
    ctx.fillStyle = hot ? C.on : C.fg;
    ctx.textAlign = 'center';
    ctx.font = mono(narrow ? 8.5 : 11, 600);
    ctx.fillText(String(key), x + cw / 2, lineY + 15);
  });
  ctx.textAlign = 'left';

  const levels: [string, string, number][] = [
    ['L1d', '≈ 1 ns · 4 cycles', 0.08],
    ['L2', '≈ 4 ns', 0.18],
    ['L3', '≈ 12 ns', 0.34],
    ['DRAM', '≈ 100 ns', 1],
  ];
  const ly0 = lineY + 46;
  const lvH = Math.min(22, (memB.y + memB.h - ly0) / 4 - 5);
  if (lvH > 8) {
    const lw = memB.w - (narrow ? 44 : 60);
    levels.forEach(([name, lat, frac], i) => {
      const y = ly0 + i * (lvH + 5);
      ctx.font = mono(narrow ? 8 : 9.5, 600);
      ctx.fillStyle = C.yellow;
      ctx.fillText(name, memB.x, y + lvH / 2);
      const bx = memB.x + (narrow ? 44 : 60);
      ctx.fillStyle = fg(0.07);
      ctx.fillRect(bx, y, lw, lvH);
      const lit = miss ? clamp(phase * 1.4 - (3 - i) * 0.25) > 0 : load !== undefined && i === 0;
      ctx.fillStyle = lit ? (miss ? C.orange : C.teal) : rgba('yellow', 0.35);
      ctx.fillRect(bx, y, lw * frac, lvH);
      ctx.fillStyle = C.fg;
      ctx.font = mono(narrow ? 7.5 : 9);
      ctx.fillText(
        lat,
        bx + lw * frac + 8 > bx + lw - 90 ? bx + 8 : bx + lw * frac + 8,
        y + lvH / 2,
      );
    });
    if (load !== undefined) {
      ctx.font = mono(narrow ? 8 : 9.5, 600);
      ctx.fillStyle = miss ? C.orange : C.teal;
      ctx.textAlign = 'right';
      ctx.fillText(miss ? 'miss → fetched from DRAM' : 'L1 hit', memB.x + memB.w, memB.y + 4);
      ctx.textAlign = 'left';
    }
  }
  ctx.globalAlpha = 1;
}
