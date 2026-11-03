// The capture's building blocks: a seeded PRNG, typed dissection nodes, and a builder that writes
// bytes and records each field's offset as it goes, so every node in the details tree points at
// the exact bytes it came from. Checksums and the BLE CRC are computed, not faked.

/* ------------------------------------------------------------------ random */

/** mulberry32: small, fast, and the same sequence for the same seed on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next,
    int,
    /** A value around `base`, off by up to `spread` either way. */
    near: (base: number, spread: number) => base + (next() * 2 - 1) * spread,
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
    bytes: (n: number) => Array.from({ length: n }, () => int(0, 255)),
  };
}
export type Rng = ReturnType<typeof rng>;

/* ------------------------------------------------------------------ nodes */

export type Val = number | string | boolean | Uint8Array;

export type Severity = 'comment' | 'chat' | 'note' | 'warn' | 'error';

export interface Expert {
  sev: Severity;
  group: string;
  msg: string;
}

/** One line in the details tree, and one field the display filter can test. */
export interface Node {
  /** The label, as shown. */
  t: string;
  /** The field's filter name ("tcp.srcport"). */
  f?: string;
  /** Its typed value. */
  v?: Val;
  /** Which byte source it lives in: 0 is the frame, then decrypted and reassembled data. */
  s?: number;
  o: number;
  n: number;
  k?: Node[];
  /** Expansion key: a subtree opened in one packet is open in every packet, as in the real tool. */
  e?: string;
  /** Only for filtering, never shown (ip.addr, tcp.port). */
  h?: boolean;
  x?: Expert;
  /** A frame this line points at ("Response in frame: 45"). */
  go?: number;
  url?: string;
}

export interface Src {
  label: string;
  bytes: Uint8Array;
}

/* ------------------------------------------------------------------ formatting */

export const hex = (v: number, width = 2) => (v >>> 0).toString(16).padStart(width, '0');
export const hex0x = (v: number, width = 2) => `0x${hex(v, width)}`;
export const hexBytes = (b: ArrayLike<number>, sep = '') => Array.from(b, (x) => hex(x)).join(sep);
export const ip4 = (v: number) => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
export const mac = (b: ArrayLike<number>) => hexBytes(b, ':');

export function parseIp(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** "...1 .... = " for a bit field: the bits of `mask` within a `width`-bit value, the rest dotted. */
export function bitStr(value: number, width: number, mask: number) {
  let out = '';
  for (let i = width - 1; i >= 0; i--) {
    const bit = 2 ** i;
    out += Math.floor(mask / bit) % 2 ? (Math.floor(value / bit) % 2 ? '1' : '0') : '.';
    if (i && i % 4 === 0) out += ' ';
  }
  return out;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const secs = (s: number, digits = 9) => s.toFixed(digits);

const enc = new TextEncoder();
export const utf8 = (s: string) => enc.encode(s);
const dec = new TextDecoder();
export const fromUtf8 = (b: Uint8Array) => dec.decode(b);
export const latin1 = (b: ArrayLike<number>) =>
  Array.from(b, (c) => String.fromCharCode(c)).join('');

/* ------------------------------------------------------------------ checksums */

/** The Internet checksum (RFC 1071) over 16-bit words. */
export function inet(bytes: ArrayLike<number>, start = 0, end = bytes.length, seed = 0) {
  let sum = seed;
  for (let i = start; i < end; i += 2) sum += (bytes[i] << 8) | (i + 1 < end ? bytes[i + 1] : 0);
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return ~sum & 0xffff;
}

/** Sum of the TCP/UDP pseudo-header, to seed `inet`. */
export function pseudo(src: number, dst: number, proto: number, len: number) {
  return (src >>> 16) + (src & 0xffff) + (dst >>> 16) + (dst & 0xffff) + proto + len;
}

const reverse24 = (v: number) => {
  let r = 0;
  for (let i = 0; i < 24; i++) r |= ((v >>> i) & 1) << (23 - i);
  return r >>> 0;
};

/** The BLE link-layer CRC over a PDU, bit by bit, LSB first, as the radio computes it. */
export function bleCrc(pdu: ArrayLike<number>, init = 0x555555) {
  let state = reverse24(init);
  for (let i = 0; i < pdu.length; i++) {
    let cur = pdu[i];
    for (let j = 0; j < 8; j++) {
      const next = (state ^ cur) & 1;
      cur >>>= 1;
      state >>>= 1;
      if (next) state = (state | (1 << 23)) ^ 0x5a6000;
    }
  }
  return state >>> 0;
}

/* ------------------------------------------------------------------ builder */

export interface Layer {
  bytes: number[];
  tree: Node[];
}

/** Moves the nodes of one byte source along by whatever was written in front of them. */
export function shift(nodes: Node[], by: number, src = 0): Node[] {
  for (const n of nodes) {
    if ((n.s ?? 0) === src) n.o += by;
    if (n.k) shift(n.k, by, src);
  }
  return nodes;
}

/** Puts a header in front of a payload: bytes concatenated, payload nodes shifted. */
export function wrap(head: B, payload?: Layer): Layer {
  if (!payload) return head.layer();
  const at = head.pos;
  return {
    bytes: head.bytes.concat(payload.bytes),
    tree: [...head.root, ...shift(payload.tree, at)],
  };
}

/**
 * Writes bytes and records the node for each field at its offset. `open`/`close` nest nodes;
 * `gen` adds the bracketed fields the analyser works out rather than reads.
 */
export class B {
  bytes: number[] = [];
  root: Node[] = [];
  private stack: Node[] = [];
  readonly src: number;

  constructor(src = 0) {
    this.src = src;
  }

  get pos() {
    return this.bytes.length;
  }

  add(n: Node): Node {
    if (this.src) n.s = this.src;
    const top = this.stack[this.stack.length - 1];
    if (top) (top.k ??= []).push(n);
    else this.root.push(n);
    return n;
  }

  /* raw writes */
  w8(v: number) {
    this.bytes.push(v & 255);
  }
  w16(v: number) {
    this.w8(v >>> 8);
    this.w8(v);
  }
  w16le(v: number) {
    this.w8(v);
    this.w8(v >>> 8);
  }
  w24le(v: number) {
    this.w8(v);
    this.w8(v >>> 8);
    this.w8(v >>> 16);
  }
  w32(v: number) {
    this.w16(v >>> 16);
    this.w16(v & 0xffff);
  }
  w32le(v: number) {
    this.w16le(v & 0xffff);
    this.w16le(v >>> 16);
  }
  raw(b: ArrayLike<number>) {
    for (let i = 0; i < b.length; i++) this.bytes.push(b[i] & 255);
  }
  text(s: string) {
    this.raw(utf8(s));
  }

  /* annotated */
  node(
    t: string,
    f: string | undefined,
    v: Val | undefined,
    o: number,
    n: number,
    more?: Partial<Node>,
  ): Node {
    return this.add({ t, f, v, o, n, ...more });
  }
  /** A field over bytes written by `write`. */
  field(
    t: string,
    f: string | undefined,
    v: Val | undefined,
    write: () => void,
    more?: Partial<Node>,
  ): Node {
    const o = this.pos;
    write();
    return this.node(t, f, v, o, this.pos - o, more);
  }
  u8(label: string, f: string, v: number, show = `${v}`) {
    return this.field(`${label}: ${show}`, f, v, () => this.w8(v));
  }
  u16(label: string, f: string, v: number, show = `${v}`) {
    return this.field(`${label}: ${show}`, f, v, () => this.w16(v));
  }
  u16le(label: string, f: string, v: number, show = `${v}`) {
    return this.field(`${label}: ${show}`, f, v, () => this.w16le(v));
  }
  u32(label: string, f: string, v: number, show = `${v}`) {
    return this.field(`${label}: ${show}`, f, v, () => this.w32(v));
  }
  bytesField(label: string, f: string, b: ArrayLike<number>, show = hexBytes(b)) {
    return this.field(`${label}: ${show}`, f, Uint8Array.from(b), () => this.raw(b));
  }
  str(label: string, f: string, s: string) {
    return this.field(`${label}: ${s}`, f, s, () => this.text(s));
  }
  /** A node with children, over the bytes written until `close`. */
  open(t: string, f?: string, v?: Val, e?: string): Node {
    const n = this.add({ t, f, v, o: this.pos, n: 0, e });
    this.stack.push(n);
    return n;
  }
  close(): Node {
    const n = this.stack.pop() as Node;
    n.n = this.pos - n.o;
    return n;
  }
  /** A node over bytes already written. */
  over(
    t: string,
    f: string | undefined,
    v: Val | undefined,
    o: number,
    n: number,
    more?: Partial<Node>,
  ) {
    return this.add({ t, f, v, o, n, ...more });
  }
  /** A bracketed field the analyser works out: no bytes of its own. */
  gen(t: string, f?: string, v?: Val, more?: Partial<Node>) {
    return this.add({ t: `[${t}]`, f, v, o: this.pos, n: 0, ...more });
  }
  /** A field only the filter sees. */
  hide(f: string, v: Val, o: number, n: number) {
    return this.add({ t: f, f, v, o, n, h: true });
  }
  /** Children for a node already added (bit fields under their parent). */
  under(parent: Node, kids: Node[]) {
    if (this.src) kids.forEach((k) => (k.s = this.src));
    (parent.k ??= []).push(...kids);
    return parent;
  }
  layer(): Layer {
    return { bytes: this.bytes, tree: this.root };
  }
}

/** Bit-field children over one field's bytes: "...1 .... = Name: Set". */
export function bits(
  o: number,
  n: number,
  value: number,
  width: number,
  defs: { mask: number; name: string; f?: string; show?: (v: number) => string; bool?: boolean }[],
): Node[] {
  return defs.map(({ mask, name, f, show, bool }) => {
    let shiftBy = 0;
    while (shiftBy < 32 && !((mask >>> shiftBy) & 1)) shiftBy++;
    const v = (value & mask) >>> shiftBy;
    const isBool = bool ?? mask >>> shiftBy === 1;
    const text = show ? show(v) : isBool ? (v ? 'Set' : 'Not set') : `${v}`;
    return { t: `${bitStr(value, width, mask)} = ${name}: ${text}`, f, v: isBool ? !!v : v, o, n };
  });
}

/* ------------------------------------------------------------------ time */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** A UTC calendar date from seconds since 1970, without Date (days-from-civil, inverted). */
export function civil(epoch: number) {
  const days = Math.floor(epoch / 86400);
  const rest = epoch - days * 86400;
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const whole = Math.floor(rest);
  return {
    y: yoe + era * 400 + (m <= 2 ? 1 : 0),
    m,
    d,
    wd: (((days + 4) % 7) + 7) % 7,
    h: Math.floor(whole / 3600),
    mi: Math.floor((whole % 3600) / 60),
    s: whole % 60,
    us: Math.round((rest - whole) * 1e6),
  };
}

export const clock = (epoch: number, digits = 6) => {
  const c = civil(epoch);
  return `${p2(c.h)}:${p2(c.mi)}:${p2(c.s)}.${String(c.us).padStart(6, '0').slice(0, digits)}`;
};
/** "Oct 27, 2026 10:14:03.512345000 UTC", the way arrival times read. */
export const arrival = (epoch: number) => {
  const c = civil(epoch);
  return `${MON[c.m - 1]} ${p2(c.d)}, ${c.y} ${clock(epoch)}000 UTC`;
};
export const isoDay = (epoch: number) => {
  const c = civil(epoch);
  return `${c.y}-${p2(c.m)}-${p2(c.d)}`;
};
/** "Tue, 27 Oct 2026 10:14:03 GMT", for the HTTP Date header. */
export const httpDate = (epoch: number) => {
  const c = civil(epoch);
  return `${DAY[c.wd]}, ${p2(c.d)} ${MON[c.m - 1]} ${c.y} ${p2(c.h)}:${p2(c.mi)}:${p2(c.s)} GMT`;
};

/* ------------------------------------------------------------------ sha-256 */

const K = Array.from({ length: 64 }, (_, i) => {
  // The first 32 bits of the fractional parts of the cube roots of the first 64 primes.
  let n = 2;
  for (let found = 0; ; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
    if (prime && found++ === i) break;
  }
  return Math.floor((Math.cbrt(n) % 1) * 2 ** 32) >>> 0;
});

/** SHA-256 as hex, for the JA4 fingerprint's hashed parts. */
export function sha256(msg: Uint8Array): string {
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const bitsLen = len * 8;
  buf[total - 4] = (bitsLen >>> 24) & 255;
  buf[total - 3] = (bitsLen >>> 16) & 255;
  buf[total - 2] = (bitsLen >>> 8) & 255;
  buf[total - 1] = bitsLen & 255;
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++)
      w[i] =
        (buf[off + i * 4] << 24) |
        (buf[off + i * 4 + 1] << 16) |
        (buf[off + i * 4 + 2] << 8) |
        buf[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 =
        (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => hex(x, 8)).join('');
}
