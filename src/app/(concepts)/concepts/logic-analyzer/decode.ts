// The protocol analyzers. Each one reads only the sampled edges of its channels, the way a
// hardware decoder would: UART samples mid-bit from the start edge, I²C watches SDA against
// SCL for starts, stops and data, SPI samples on the clock edge its mode names. What they
// can't make sense of comes out as an error frame, not a guess from the source text.
import { levelAt, lower, upper, type Capture } from './capture';
import type { Trace } from './world';

export type AnalyzerId = 'tx' | 'rx' | 'i2c' | 'spi';

export type FrameKind = 'byte' | 'start' | 'restart' | 'stop' | 'addr' | 'data' | 'word';

export interface Frame {
  t0: number;
  t1: number;
  k: FrameKind;
  /** The byte: UART data, I²C address (7-bit) or data, SPI MOSI. */
  v: number;
  /** SPI only: the MISO byte clocked in alongside. */
  m?: number;
  /** I²C: acknowledged. */
  ack?: boolean;
  /** I²C address: a read. */
  rd?: boolean;
  err?: 'framing' | 'partial';
}

export interface SerialCfg {
  baud: number;
}

export interface SpiCfg {
  /** Clock polarity and phase: mode = cpol * 2 + cpha. */
  mode: 0 | 1 | 2 | 3;
  msb: boolean;
}

export interface Config {
  tx: SerialCfg;
  rx: SerialCfg;
  spi: SpiCfg;
}

/* ------------------------------------------------------------------ async serial */

/** 8N1, LSB first, idle high. A start bit must still be low half a bit in, or it was a glitch. */
export function decodeSerial(tr: Trace, from: number, to: number, cfg: SerialCfg): Frame[] {
  const bit = 1 / cfg.baud;
  const { edges } = tr;
  const frames: Frame[] = [];
  let i = lower(edges, from);
  while (i < edges.length) {
    const e = edges[i];
    // Falling edges only: the level after edge i is init ^ ((i + 1) & 1).
    if ((tr.init ^ ((i + 1) & 1)) !== 0) {
      i++;
      continue;
    }
    if (e + 10 * bit > to) break;
    if (levelAt(tr, e + bit / 2) !== 0) {
      i++;
      continue;
    }
    let v = 0;
    for (let b = 0; b < 8; b++) if (levelAt(tr, e + (1.5 + b) * bit)) v |= 1 << b;
    const stop = levelAt(tr, e + 9.5 * bit);
    frames.push({
      t0: e,
      t1: e + 10 * bit,
      k: 'byte',
      v,
      ...(stop ? {} : { err: 'framing' as const }),
    });
    // Look for the next start bit after this frame's stop-bit sample.
    i = upper(edges, e + 9.5 * bit);
  }
  return frames;
}

/* ------------------------------------------------------------------ I²C */

/** Walks SCL and SDA together. Ties go to SCL, so a start squeezed into one sample is missed. */
export function decodeI2c(scl: Trace, sda: Trace): Frame[] {
  const frames: Frame[] = [];
  const a = scl.edges;
  const b = sda.edges;
  let i = 0;
  let j = 0;
  let c = scl.init;
  let d = sda.init;
  let inside = false;
  let first = false;
  let bits = 0;
  let value = 0;
  let lastFall = a.length ? a[0] : 0;
  let byteFrom = 0;
  let open: Frame | null = null;
  while (i < a.length || j < b.length) {
    const ta = i < a.length ? a[i] : Infinity;
    const tb = j < b.length ? b[j] : Infinity;
    if (tb < ta) {
      const nd = (d ^ 1) as 0 | 1;
      if (c === 1) {
        open = null;
        // A stop or repeated start always rides on one clock of its own; more than that is a cut byte.
        if (bits > 1) frames.push({ t0: byteFrom, t1: tb, k: 'data', v: value, err: 'partial' });
        if (nd === 0) {
          frames.push({ t0: tb, t1: tb, k: inside ? 'restart' : 'start', v: 0 });
          inside = true;
          first = true;
        } else {
          frames.push({ t0: tb, t1: tb, k: 'stop', v: 0 });
          inside = false;
        }
        bits = 0;
        value = 0;
      }
      d = nd;
      j++;
    } else {
      const nc = (c ^ 1) as 0 | 1;
      if (nc === 1 && inside) {
        if (bits === 0) byteFrom = lastFall;
        if (bits < 8) value = (value << 1) | d;
        bits++;
        if (bits === 9) {
          const ack = d === 0;
          const f: Frame = first
            ? { t0: byteFrom, t1: ta, k: 'addr', v: value >> 1, rd: (value & 1) === 1, ack }
            : { t0: byteFrom, t1: ta, k: 'data', v: value, ack };
          frames.push(f);
          open = f;
          first = false;
          bits = 0;
          value = 0;
        }
      } else if (nc === 0) {
        lastFall = ta;
        // The byte's bubble runs to the fall that ends its ACK clock.
        if (open) {
          open.t1 = ta;
          open = null;
        }
      }
      c = nc;
      i++;
    }
  }
  return frames;
}

/* ------------------------------------------------------------------ SPI */

export interface SpiDecode {
  frames: Frame[];
  /** Chip-select windows: [t0, t1, first frame, frame count]. */
  txns: [number, number, number, number][];
}

/**
 * Enable is CS low. The sampling edge is the clock's leading edge for CPHA 0 and its trailing
 * edge for CPHA 1; leading is rising for CPOL 0. MOSI and MISO are read on the same edge.
 */
export function decodeSpi(
  sclk: Trace,
  mosi: Trace,
  miso: Trace,
  cs: Trace,
  from: number,
  to: number,
  cfg: SpiCfg,
): SpiDecode {
  const cpol = cfg.mode >> 1;
  const cpha = cfg.mode & 1;
  // The level the clock goes to on a sampling edge.
  const sampleLevel = cpol ^ cpha ^ 1;
  const frames: Frame[] = [];
  const txns: SpiDecode['txns'] = [];
  const ce = cs.edges;
  // CS windows: from a falling edge (or the capture start, if already low) to the next rise.
  const windows: [number, number, boolean][] = [];
  let low = cs.init === 0;
  let since = from;
  for (let k = 0; k < ce.length; k++) {
    if (low) windows.push([since, ce[k], since === from && cs.init === 0]);
    else since = ce[k];
    low = !low;
  }
  if (low) windows.push([since, to, since === from && cs.init === 0]);

  const ck = sclk.edges;
  for (const [w0, w1, cut] of windows) {
    const firstFrame = frames.length;
    let bits = 0;
    let mo = 0;
    let mi = 0;
    let byteFrom = w0;
    let prev = w0;
    for (let k = upper(ck, w0); k < ck.length && ck[k] < w1; k++) {
      const t = ck[k];
      const after = sclk.init ^ ((k + 1) & 1);
      if (after === sampleLevel) {
        if (bits === 0) byteFrom = prev;
        const o = levelAt(mosi, t);
        const n = levelAt(miso, t);
        if (cfg.msb) {
          mo = (mo << 1) | o;
          mi = (mi << 1) | n;
        } else {
          mo |= o << bits;
          mi |= n << bits;
        }
        bits++;
        if (bits === 8) {
          // The bubble ends at the next clock edge, or half a bit on if there isn't one.
          const next = k + 1 < ck.length && ck[k + 1] < w1 ? ck[k + 1] : t + (t - prev);
          frames.push({
            t0: byteFrom,
            t1: next,
            k: 'word',
            v: mo,
            m: mi,
            ...(cut && frames.length === firstFrame ? { err: 'partial' as const } : {}),
          });
          bits = 0;
          mo = 0;
          mi = 0;
        }
      }
      prev = t;
    }
    if (bits)
      frames.push({
        t0: byteFrom,
        t1: Math.min(w1, prev + (prev - byteFrom) / Math.max(1, bits)),
        k: 'word',
        v: mo,
        m: mi,
        err: 'partial',
      });
    txns.push([w0, w1, firstFrame, frames.length - firstFrame]);
  }
  return { frames, txns };
}

/* ------------------------------------------------------------------ all of them */

export interface Decoded {
  tx: Frame[];
  rx: Frame[];
  i2c: Frame[];
  spi: Frame[];
  spiTxns: SpiDecode['txns'];
}

export function decodeAll(cap: Capture, cfg: Config): Decoded {
  const [tx, rx, scl, sda, sclk, mosi, miso, cs] = cap.traces;
  const spi = decodeSpi(sclk, mosi, miso, cs, cap.t0, cap.t1, cfg.spi);
  return {
    tx: decodeSerial(tx, cap.t0, cap.t1, cfg.tx),
    rx: decodeSerial(rx, cap.t0, cap.t1, cfg.rx),
    i2c: decodeI2c(scl, sda),
    spi: spi.frames,
    spiTxns: spi.txns,
  };
}
