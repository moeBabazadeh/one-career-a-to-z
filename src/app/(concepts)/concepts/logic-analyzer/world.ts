// The device under test, as wires. Each bus encoder turns bytes into the edges a real peripheral
// would drive (UART 8N1 frames, I²C starts, acks and stops, SPI mode 0 clocking), at the bus's
// real timings, so the decoders in decode.ts have honest edges to sample. The firmware runs a
// loop: the whole sequence repeats every `cycle` seconds, which is what a trigger waits on.
import {
  CRLF,
  FLASH_DUMMY,
  FLASH_READ,
  PROMPT,
  SCAN_FROM,
  SCAN_TO,
  deviceReads,
  eepromReads,
  flashRecords,
  session,
  type I2cRead,
} from './content';

/** A digital channel: its level at the start and the times it toggles, ascending. */
export interface Trace {
  init: 0 | 1;
  edges: Float64Array;
}

export interface World {
  /** The firmware loop's period, in seconds. */
  cycle: number;
  traces: Trace[];
  /** The 3V3 rail's load, as the spans the flash is selected (for the analog channel). */
  load: Float64Array;
}

/* ------------------------------------------------------------------ the buses' settings */

export const UART_BAUD = 115200;
/** The firmware's UART clock divider lands a hair fast, as real ones do. Texture, not a claim. */
const TX_SKEW = 1.0011;
export const I2C_HZ = 400e3;
export const SPI_HZ = 1e6;

// I²C fast mode: 2.5 µs per bit, low longer than high, data moved a little after SCL falls.
const I2C_LOW = 1.4e-6;
const I2C_HIGH = 1 / I2C_HZ - I2C_LOW;
const I2C_HOLD = 0.3e-6;
const I2C_SETUP = 0.6e-6;
const I2C_FREE = 1.3e-6;

const SPI_HALF = 0.5 / SPI_HZ;

/* ------------------------------------------------------------------ seeded texture */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A wire being driven: it records a time only when the level actually changes. */
class Wire {
  readonly init: 0 | 1;
  level: 0 | 1;
  readonly t: number[] = [];
  private readonly rand: () => number;

  constructor(init: 0 | 1, seed: number) {
    this.init = init;
    this.level = init;
    this.rand = mulberry32(seed);
  }

  set(time: number, v: number) {
    const level = (v ? 1 : 0) as 0 | 1;
    if (level === this.level) return;
    // A couple of nanoseconds of edge jitter, kept in order.
    const last = this.t.length ? this.t[this.t.length - 1] : -Infinity;
    this.t.push(Math.max(time + (this.rand() - 0.5) * 4e-9, last + 1e-9));
    this.level = level;
  }

  trace(): Trace {
    return { init: this.init, edges: Float64Array.from(this.t) };
  }
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/* ------------------------------------------------------------------ UART */

/** Sends bytes as 8N1 frames, LSB first, back to back. Returns when the last stop bit ends. */
function uartSend(w: Wire, t: number, bytes: Uint8Array, baud: number) {
  const bit = 1 / baud;
  for (const b of bytes) {
    w.set(t, 0);
    for (let i = 0; i < 8; i++) w.set(t + (1 + i) * bit, (b >> i) & 1);
    w.set(t + 9 * bit, 1);
    t += 10 * bit;
  }
  return t;
}

/** One line at a time, with the small idle gaps a print task leaves between lines. */
function uartPrint(w: Wire, t: number, text: string, baud: number, rand: () => number) {
  const lines = text.split(CRLF);
  lines.forEach((line, i) => {
    t = uartSend(w, t, utf8(i < lines.length - 1 ? line + CRLF : line), baud);
    if (i < lines.length - 1) t += 15e-6 + rand() * 110e-6;
  });
  return t;
}

/* ------------------------------------------------------------------ I²C */

class I2c {
  readonly scl: Wire;
  readonly sda: Wire;

  constructor() {
    this.scl = new Wire(1, 21);
    this.sda = new Wire(1, 22);
  }

  /** SDA falls while SCL is high. Returns when SCL has fallen. */
  start(t: number) {
    this.sda.set(t, 0);
    this.scl.set(t + I2C_SETUP, 0);
    return t + I2C_SETUP;
  }

  /** From SCL low: release SDA, raise SCL, then pull SDA low under it. */
  restart(t: number) {
    this.sda.set(t + I2C_HOLD, 1);
    this.scl.set(t + I2C_LOW, 1);
    this.sda.set(t + I2C_LOW + I2C_SETUP, 0);
    this.scl.set(t + I2C_LOW + 2 * I2C_SETUP, 0);
    return t + I2C_LOW + 2 * I2C_SETUP;
  }

  /** From SCL low: SDA low, SCL up, then SDA rises while SCL is high. */
  stop(t: number) {
    this.sda.set(t + I2C_HOLD, 0);
    this.scl.set(t + I2C_LOW, 1);
    this.sda.set(t + I2C_LOW + I2C_SETUP, 1);
    return t + I2C_LOW + I2C_SETUP + I2C_FREE;
  }

  /** One clock: data placed while SCL is low, sampled on the rise. `stretch` holds SCL low longer. */
  bit(t: number, v: number, stretch = 0) {
    this.sda.set(t + I2C_HOLD, v);
    this.scl.set(t + I2C_LOW + stretch, 1);
    this.scl.set(t + I2C_LOW + stretch + I2C_HIGH, 0);
    return t + I2C_LOW + stretch + I2C_HIGH;
  }

  /** Eight bits MSB first, then the ninth: 0 is ACK, 1 is NACK. */
  byte(t: number, v: number, nack: boolean, stretch = 0) {
    for (let i = 7; i >= 0; i--) t = this.bit(t, (v >> i) & 1, i === 7 ? stretch : 0);
    return this.bit(t, nack ? 1 : 0);
  }

  /** The address probe a bus scan sends: a write with no data, then stop. */
  probe(t: number, addr: number, present: boolean) {
    t = this.start(t);
    t = this.byte(t, addr << 1, !present);
    return this.stop(t);
  }

  /** Write the register pointer, repeated start, read the bytes, NACK the last, stop. */
  read(t: number, r: I2cRead, bytes: Uint8Array, stretch: number) {
    t = this.start(t);
    t = this.byte(t, r.addr << 1, false);
    for (const reg of r.reg) t = this.byte(t, reg, false);
    t = this.restart(t);
    t = this.byte(t, (r.addr << 1) | 1, false);
    bytes.forEach((b, i) => {
      t = this.byte(t, b, i === bytes.length - 1, i === 0 ? stretch : 0);
    });
    return this.stop(t);
  }
}

/* ------------------------------------------------------------------ SPI */

class Spi {
  readonly sclk = new Wire(0, 41);
  readonly mosi = new Wire(0, 42);
  readonly miso = new Wire(1, 43);
  readonly cs = new Wire(1, 44);

  /** Mode 0: SCLK idles low, data changes on the falling edge and is sampled on the rising one. */
  transfer(t: number, out: number[], back: number[]) {
    this.cs.set(t, 0);
    let fall = t + 0.4e-6;
    for (let k = 0; k < out.length; k++) {
      for (let i = 7; i >= 0; i--) {
        this.mosi.set(fall + 12e-9, (out[k] >> i) & 1);
        this.miso.set(fall + 25e-9, (back[k] >> i) & 1);
        const rise = fall + SPI_HALF;
        this.sclk.set(rise, 1);
        this.sclk.set(rise + SPI_HALF, 0);
        fall = rise + SPI_HALF;
      }
      // The peripheral reloads its shift register between bytes.
      fall += 0.25e-6;
    }
    const end = fall + 0.4e-6;
    this.cs.set(end, 1);
    // The flash lets go of MISO and the pull-up takes it high; MOSI rests low.
    this.miso.set(end + 40e-9, 1);
    this.mosi.set(end + 60e-9, 0);
    return end;
  }

  /** READ, three address bytes, then clock out the record while the flash answers. */
  read(t: number, addr: number, bytes: Uint8Array) {
    const cmd = [FLASH_READ, (addr >> 16) & 0xff, (addr >> 8) & 0xff, addr & 0xff];
    const out = [...cmd, ...Array.from(bytes, () => FLASH_DUMMY)];
    // While the command goes out, nothing drives MISO and it reads high.
    const back = [...cmd.map(() => 0xff), ...bytes];
    return this.transfer(t, out, back);
  }
}

/* ------------------------------------------------------------------ the loop */

/** Seconds a byte string takes on each bus, to plan the loop before driving it. */
const uartTime = (n: number, baud: number) => (n * 10) / baud;

function buildWorld(): World {
  const rand = mulberry32(0x4c41);
  const tx = new Wire(1, 11);
  const rx = new Wire(1, 12);
  const txBaud = UART_BAUD * TX_SKEW;

  // The console session. The host sends each command line at once; the firmware echoes it,
  // thinks for a moment, prints the answer and a fresh prompt.
  // The first line is an empty Enter that wakes the console up and gets a prompt.
  const replies = session.map((x) =>
    x.cmd ? `${CRLF}${x.out}${CRLF}${PROMPT}` : `${CRLF}${PROMPT}`,
  );
  const lineGaps = (text: string) => text.split(CRLF).length * 70e-6;
  const busy = session.reduce(
    (sum, x, i) =>
      sum +
      uartTime(x.cmd.length + 1, UART_BAUD) +
      uartTime(utf8(replies[i]).length, txBaud) +
      lineGaps(replies[i]) +
      1e-3,
    0,
  );
  // The loop is a whole number of quarter seconds, with room to breathe between commands.
  const cycle = Math.max(1, Math.ceil((busy * 1.25) / 0.25) * 0.25);
  // The wake-up Enter comes a few milliseconds into the loop and `help` right after it; the rest
  // are spread out. Everything is said by 95% of the loop, so a capture triggered on the first
  // keystroke holds all of it.
  const first = 3e-3;
  const quick = 1e-3;
  const lastEnd = cycle * 0.95;
  const gap = (lastEnd - first - busy - quick) / (session.length - 2);

  let t = first;
  session.forEach((x, i) => {
    const line = utf8(`${x.cmd}\r`);
    // RX: the command line; TX: each character echoed as it lands.
    let rxT = t;
    let txT = t;
    line.forEach((b, k) => {
      rxT = uartSend(rx, rxT, Uint8Array.of(b), UART_BAUD);
      const echo = k === line.length - 1 ? utf8(CRLF) : Uint8Array.of(b);
      txT = uartSend(tx, Math.max(txT, rxT + 6e-6 + rand() * 10e-6), echo, txBaud);
    });
    const think = 0.35e-3 + rand() * 0.9e-3;
    const end = uartPrint(tx, txT + think, replies[i].slice(CRLF.length), txBaud, rand);
    t = end + (i === 0 ? quick : gap);
  });

  // I²C: a bus scan as the loop starts, then the device descriptors and the roots, spread out.
  const i2c = new I2c();
  const present = new Set([...deviceReads, ...eepromReads].map((r) => r.addr));
  let ti = 0.1e-3;
  for (let a = SCAN_FROM; a <= SCAN_TO; a++)
    ti = i2c.probe(ti, a, present.has(a)) + 4e-6 + rand() * 3e-6;
  const reads = [...deviceReads, ...eepromReads];
  const scanEnd = ti;
  const i2cStep = (cycle - 60e-3 - scanEnd) / reads.length;
  reads.forEach((r, i) => {
    const at = Math.max(ti + 0.5e-3, scanEnd + 2e-3 + i2cStep * i + rand() * i2cStep * 0.2);
    ti = i2c.read(
      at,
      r,
      utf8(r.text),
      r.addr === eepromReads[0]?.addr ? 0 : 12e-6 + rand() * 30e-6,
    );
  });

  // SPI: one flash record per transaction, read on a timer that starts just after the console wakes.
  const spi = new Spi();
  const load: number[] = [];
  const s0 = first + 0.15e-3;
  let ts = s0;
  const spiStep = (cycle - 40e-3 - s0) / flashRecords.length;
  flashRecords.forEach((rec, i) => {
    const at = i ? Math.max(ts + 0.3e-3, s0 + spiStep * i + rand() * spiStep * 0.25) : s0;
    const end = spi.read(at, rec.addr, utf8(rec.text));
    load.push(at, end);
    ts = end;
  });

  return {
    cycle,
    traces: [tx, rx, i2c.scl, i2c.sda, spi.sclk, spi.mosi, spi.miso, spi.cs].map((w) => w.trace()),
    load: Float64Array.from(load),
  };
}

let cached: World | null = null;

/** The device's wires, built once on first use. */
export const world = () => (cached ??= buildWorld());

/* ------------------------------------------------------------------ the 3V3 rail */

const RAIL = 3.3;

/** A smooth, repeatable hum: a few slow sines, so the rail never looks drawn with a ruler. */
const hum = (t: number) =>
  0.0035 * Math.sin(t * 2 * Math.PI * 50) +
  0.0018 * Math.sin(t * 2 * Math.PI * 371 + 1.3) +
  0.0012 * Math.sin(t * 2 * Math.PI * 2930 + 0.4);

/**
 * The rail's voltage at a world time: a regulator's hum, and a droop while the flash is selected
 * that recovers with the output capacitor's time constant. Texture, not a measurement.
 */
export function railAt(w: World, t: number) {
  const tm = ((t % w.cycle) + w.cycle) % w.cycle;
  const { load } = w;
  let droop = 0;
  // The most recent load span that started before t.
  let lo = 0;
  let hi = load.length / 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (load[mid * 2] <= tm) lo = mid + 1;
    else hi = mid;
  }
  const k = lo - 1;
  if (k >= 0) {
    const a = load[k * 2];
    const b = load[k * 2 + 1];
    const tau = 60e-6;
    const depth = 0.026;
    droop =
      tm < b
        ? depth * (1 - Math.exp(-(tm - a) / tau))
        : depth * (1 - Math.exp(-(b - a) / tau)) * Math.exp(-(tm - b) / (tau * 2.2));
  }
  return RAIL + hum(t) - droop;
}
