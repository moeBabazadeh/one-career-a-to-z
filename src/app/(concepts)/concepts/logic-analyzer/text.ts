// Turns decoded frames back into text for the terminal view and for search. The text comes from
// the frames alone (UTF-8 decoded byte by byte), so a broken capture reads broken. Every
// character remembers the frame it came from, so a line or a search hit can jump to the trace.
import { db } from '../_shared/data';
import { FLASH_READ } from './content';
import type { AnalyzerId, Decoded, Frame } from './decode';

export interface Seg {
  text: string;
  href?: string;
}

export interface Line {
  segs: Seg[];
  /** The frame the line starts on. */
  frame: number;
  kind: 'text' | 'head' | 'cmd';
}

export interface Stream {
  text: string;
  /** For each UTF-16 unit of `text`, the frame it came from. */
  map: Int32Array;
  lines: Line[];
}

const hex = (v: number, n = 2) => `0x${v.toString(16).toUpperCase().padStart(n, '0')}`;

/** Links and addresses in a line, as their own segments. Site paths stay relative. */
const LINK = /(https?:\/\/[^\s<>"'()]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

export function linkify(text: string): Seg[] {
  const segs: Seg[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    const raw = m[0].replace(/[.,;:]+$/, '');
    const i = m.index ?? 0;
    if (i > at) segs.push({ text: text.slice(at, i) });
    const site = `${db.person.url}/`;
    const href = raw.includes('://')
      ? raw.startsWith(site)
        ? raw.slice(site.length - 1)
        : raw
      : `mailto:${raw}`;
    segs.push({ text: raw, href });
    at = i + raw.length;
  }
  if (at < text.length) segs.push({ text: text.slice(at) });
  return segs;
}

class Builder {
  private text = '';
  private map: number[] = [];
  private lines: Line[] = [];
  private line = '';
  private lineFrame = -1;
  private readonly base: Line['kind'];
  private lineKind: Line['kind'];

  constructor(base: Line['kind'] = 'text') {
    this.base = base;
    this.lineKind = base;
  }

  private push(ch: string, frame: number) {
    this.text += ch;
    for (let k = 0; k < ch.length; k++) this.map.push(frame);
  }

  /** Ends the current line, even if empty. */
  newline(frame: number) {
    this.lines.push({
      segs: this.lineKind === 'head' ? [{ text: this.line }] : linkify(this.line),
      frame: this.lineFrame < 0 ? frame : this.lineFrame,
      kind: this.lineKind,
    });
    this.push('\n', frame);
    this.line = '';
    this.lineFrame = -1;
    this.lineKind = this.base;
  }

  char(ch: string, frame: number) {
    if (this.lineFrame < 0) this.lineFrame = frame;
    this.line += ch;
    this.push(ch, frame);
  }

  /** A heading line of its own, like a transaction's address. */
  head(text: string, frame: number) {
    if (this.line) this.newline(frame);
    this.lineKind = 'head';
    for (const ch of text) this.char(ch, frame);
    this.newline(frame);
  }

  /** Decodes UTF-8 from a run of bytes; malformed bytes and errored frames read as U+FFFD. */
  bytes(items: { v: number; frame: number; bad?: boolean }[]) {
    let cr = false;
    for (let i = 0; i < items.length; i++) {
      const { v, frame, bad } = items[i];
      if (bad) {
        this.char('�', frame);
        continue;
      }
      if (v === 0x0d || v === 0x0a) {
        // CRLF, a lone CR and a lone LF all end the line once.
        if (v === 0x0a && cr) {
          cr = false;
          continue;
        }
        cr = v === 0x0d;
        this.newline(frame);
        continue;
      }
      cr = false;
      if (v < 0x80) {
        this.char(v >= 0x20 && v < 0x7f ? String.fromCharCode(v) : '·', frame);
        continue;
      }
      const need = v >= 0xf0 && v < 0xf8 ? 3 : v >= 0xe0 ? 2 : v >= 0xc0 ? 1 : -1;
      let cp = need === 3 ? v & 0x07 : need === 2 ? v & 0x0f : v & 0x1f;
      let ok = need > 0 && i + need < items.length;
      for (let k = 1; ok && k <= need; k++) {
        const c = items[i + k];
        if (c.bad || (c.v & 0xc0) !== 0x80) ok = false;
        else cp = (cp << 6) | (c.v & 0x3f);
      }
      if (!ok) {
        this.char('�', frame);
        continue;
      }
      this.char(String.fromCodePoint(cp), frame);
      i += need;
    }
  }

  done(): Stream {
    if (this.line || this.lineFrame >= 0)
      this.newline(this.map.length ? this.map[this.map.length - 1] : 0);
    return { text: this.text, map: Int32Array.from(this.map), lines: this.lines };
  }
}

function serialStream(frames: Frame[], kind: Line['kind']): Stream {
  const b = new Builder(kind);
  b.bytes(frames.map((f, i) => ({ v: f.v, frame: i, bad: !!f.err })));
  return b.done();
}

/** Transactions from start to stop; address-only probes fold into one scan line. */
function i2cStream(frames: Frame[]): Stream {
  const b = new Builder();
  let i = 0;
  let scan: { from: number; to: number; acks: number[]; frame: number } | null = null;
  const flushScan = () => {
    if (!scan) return;
    const found = scan.acks.length ? scan.acks.map((a) => hex(a)).join(' ') : 'none';
    b.head(`scan ${hex(scan.from)}–${hex(scan.to)} · ACK from ${found}`, scan.frame);
    scan = null;
  };
  while (i < frames.length) {
    // Find this transaction's frames, start to stop.
    if (frames[i].k !== 'start') {
      i++;
      continue;
    }
    const s = i;
    let e = i + 1;
    while (e < frames.length && frames[e].k !== 'stop' && frames[e].k !== 'start') e++;
    const tx = frames.slice(s, e);
    const addrs = tx.map((f, k) => [f, s + k] as const).filter(([f]) => f.k === 'addr');
    const data = tx.map((f, k) => [f, s + k] as const).filter(([f]) => f.k === 'data');
    i = e;
    if (!addrs.length) continue;
    const [a0, a0i] = addrs[0];
    if (!data.length && addrs.length === 1) {
      scan ??= { from: a0.v, to: a0.v, acks: [], frame: a0i };
      scan.to = a0.v;
      if (a0.ack) scan.acks.push(a0.v);
      continue;
    }
    flushScan();
    const read = addrs.find(([f]) => f.rd);
    const reg = data.filter(([f]) => f.t0 < (read ? read[0].t0 : Infinity));
    const got = read ? data.filter(([f]) => f.t0 > read[0].t0) : [];
    const nack = addrs.some(([f]) => !f.ack) ? ' · NACK' : '';
    if (read) {
      // A register (one byte) or a memory address (two or three) set up before the read.
      const ptr =
        reg.length === 1
          ? ` · reg ${hex(reg[0][0].v)}`
          : reg.length <= 3 && reg.length
            ? ` · mem ${hex(
                reg.reduce((acc, [f]) => acc * 256 + f.v, 0),
                reg.length * 2,
              )}`
            : reg.length
              ? ` · ${reg.length} B written`
              : '';
      b.head(`${hex(a0.v)}${ptr} · read ${got.length} B${nack}`, a0i);
    } else {
      const shown = reg
        .slice(0, 8)
        .map(([f]) => hex(f.v))
        .join(' ');
      b.head(
        `${hex(a0.v)} · write ${reg.length} B${shown ? `: ${shown}${reg.length > 8 ? ' …' : ''}` : ''}${nack}`,
        a0i,
      );
    }
    if (got.length) b.bytes(got.map(([f, k]) => ({ v: f.v, frame: k, bad: !!f.err })));
  }
  flushScan();
  return b.done();
}

function spiStream(d: Decoded): Stream {
  const b = new Builder();
  for (const [, , first, count] of d.spiTxns) {
    if (!count) continue;
    const fr = d.spi.slice(first, first + count);
    if (fr.length >= 4 && fr[0].v === FLASH_READ && !fr[0].err) {
      const addr = (fr[1].v << 16) | (fr[2].v << 8) | fr[3].v;
      b.head(`READ ${hex(addr, 6)} · ${fr.length - 4} B`, first);
      b.bytes(fr.slice(4).map((f, k) => ({ v: f.m ?? 0, frame: first + 4 + k, bad: !!f.err })));
    } else {
      const shown = fr
        .slice(0, 8)
        .map((f) => hex(f.v))
        .join(' ');
      b.head(
        `${fr[0].err ? 'cut off · ' : ''}${count} B · MOSI ${shown}${count > 8 ? ' …' : ''}`,
        first,
      );
    }
  }
  return b.done();
}

export type Streams = Record<AnalyzerId, Stream>;

export function streams(d: Decoded): Streams {
  return {
    tx: serialStream(d.tx, 'text'),
    rx: serialStream(d.rx, 'cmd'),
    i2c: i2cStream(d.i2c),
    spi: spiStream(d),
  };
}
