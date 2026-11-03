// Protocol encoders. Each writes the real header bytes for its layer and records the dissection
// nodes over them, the way the real dissectors lay a tree on a frame: Ethernet, ARP, IPv4, TCP,
// UDP, DNS, NTP, TLS 1.3, HTTP/1.1, JSON, MQTT 3.1.1, Modbus/TCP and the BLE link layer with
// L2CAP and ATT. Lengths, checksums and the BLE CRC are computed from the bytes.

import {
  B,
  bits,
  bitStr,
  bleCrc,
  hex,
  hex0x,
  hexBytes,
  inet,
  ip4,
  mac,
  pseudo,
  sha256,
  shift,
  utf8,
  wrap,
  type Layer,
  type Node,
  type Severity,
  type Val,
} from './net';

/* ------------------------------------------------------------------ shared */

export interface Mac {
  b: number[];
  /** Resolved name: a vendor-style "ESP32_3a:91:0c", a host name, or "Broadcast". */
  name?: string;
}

export const BROADCAST: Mac = { b: [255, 255, 255, 255, 255, 255], name: 'Broadcast' };
export const macName = (m: Mac) => m.name ?? mac(m.b);
const macFull = (m: Mac) => (m.name ? `${m.name} (${mac(m.b)})` : mac(m.b));

const SEV_NAME: Record<Severity, string> = {
  comment: 'Comment',
  chat: 'Chat',
  note: 'Note',
  warn: 'Warning',
  error: 'Error',
};

/** An "[Expert Info (Chat/Sequence): …]" line, with the children the real tool gives it. */
export function expert(sev: Severity, group: string, msg: string, o = 0, n = 0, s?: number): Node {
  const kid = (t: string): Node => ({ t, o, n, s });
  return {
    t: `[Expert Info (${SEV_NAME[sev]}/${group}): ${msg}]`,
    o,
    n,
    s,
    e: 'expert',
    x: { sev, group, msg },
    k: [kid(`[${msg}]`), kid(`[Severity level: ${SEV_NAME[sev]}]`), kid(`[Group: ${group}]`)],
  };
}

const be32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
/** Seconds at the capture's microsecond resolution, printed to nine places as the real tool does. */
const secs = (v: number) => `${v.toFixed(6)}000 seconds`;

/* ------------------------------------------------------------------ ethernet */

const ETYPE: Record<number, string> = { 0x0800: 'IPv4', 0x0806: 'ARP' };

function ethAddr(b: B, label: string, which: 'dst' | 'src', m: Mac) {
  const o = b.pos;
  b.raw(m.b);
  const first = (m.b[0] << 16) | (m.b[1] << 8) | m.b[2];
  const lg = !!(m.b[0] & 2);
  const ig = !!(m.b[0] & 1);
  const node = b.over(`${label}: ${macFull(m)}`, `eth.${which}`, Uint8Array.from(m.b), o, 6, {
    e: 'eth.addr',
  });
  b.under(node, [
    { t: `Address: ${macFull(m)}`, f: 'eth.addr', v: Uint8Array.from(m.b), o, n: 6 },
    {
      t: `${bitStr(first, 24, 0x020000)} = LG bit: ${lg ? 'Locally administered address (this is NOT the factory default)' : 'Globally unique address (factory default)'}`,
      f: `eth.${which}.lg`,
      v: lg,
      o,
      n: 3,
    },
    {
      t: `${bitStr(first, 24, 0x010000)} = IG bit: ${ig ? 'Group address (multicast/broadcast)' : 'Individual address (unicast)'}`,
      f: `eth.${which}.ig`,
      v: ig,
      o,
      n: 3,
    },
    { t: '', f: `eth.${which}_resolved`, v: macName(m), o, n: 6, h: true },
    { t: '', f: 'eth.addr_resolved', v: macName(m), o, n: 6, h: true },
    { t: '', f: 'eth.lg', v: lg, o, n: 3, h: true },
    { t: '', f: 'eth.ig', v: ig, o, n: 3, h: true },
  ]);
}

/** Ethernet II, padded to the 60-byte minimum when asked (frames as they arrive off the wire). */
export function ether(dst: Mac, src: Mac, type: number, payload: Layer, pad = false): Layer {
  const b = new B();
  b.open(`Ethernet II, Src: ${macFull(src)}, Dst: ${macFull(dst)}`, 'eth', undefined, 'eth');
  ethAddr(b, 'Destination', 'dst', dst);
  ethAddr(b, 'Source', 'src', src);
  b.u16('Type', 'eth.type', type, `${ETYPE[type]} (${hex0x(type, 4)})`);
  const eth = b.close();
  const out = wrap(b, payload);
  if (pad && out.bytes.length < 60) {
    const o = out.bytes.length;
    const n = 60 - o;
    for (let i = 0; i < n; i++) out.bytes.push(0);
    (eth.k ??= []).push({
      t: `Padding: ${'00'.repeat(n)}`,
      f: 'eth.padding',
      v: new Uint8Array(n),
      o,
      n,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ arp */

export function arp(
  op: 1 | 2,
  sMac: Mac,
  sIp: number,
  tMac: Mac,
  tIp: number,
): { layer: Layer; info: string } {
  const b = new B();
  b.open(
    `Address Resolution Protocol (${op === 1 ? 'request' : 'reply'})`,
    'arp',
    undefined,
    'arp',
  );
  b.u16('Hardware type', 'arp.hw.type', 1, 'Ethernet (1)');
  b.u16('Protocol type', 'arp.proto.type', 0x0800, 'IPv4 (0x0800)');
  b.u8('Hardware size', 'arp.hw.size', 6);
  b.u8('Protocol size', 'arp.proto.size', 4);
  b.u16('Opcode', 'arp.opcode', op, op === 1 ? 'request (1)' : 'reply (2)');
  b.field(`Sender MAC address: ${macFull(sMac)}`, 'arp.src.hw_mac', Uint8Array.from(sMac.b), () =>
    b.raw(sMac.b),
  );
  b.field(`Sender IP address: ${ip4(sIp)}`, 'arp.src.proto_ipv4', sIp, () => b.w32(sIp));
  const zero: Mac = { b: [0, 0, 0, 0, 0, 0] };
  const target = op === 1 ? zero : tMac;
  b.field(
    `Target MAC address: ${op === 1 ? '00:00:00:00:00:00' : macFull(target)}`,
    'arp.dst.hw_mac',
    Uint8Array.from(target.b),
    () => b.raw(target.b),
  );
  b.field(`Target IP address: ${ip4(tIp)}`, 'arp.dst.proto_ipv4', tIp, () => b.w32(tIp));
  b.close();
  return {
    layer: b.layer(),
    info: op === 1 ? `Who has ${ip4(tIp)}? Tell ${ip4(sIp)}` : `${ip4(sIp)} is at ${mac(sMac.b)}`,
  };
}

/* ------------------------------------------------------------------ ipv4 */

export interface IpOpts {
  id: number;
  ttl: number;
  srcName?: string;
  dstName?: string;
}

export function ipv4(src: number, dst: number, proto: number, payload: Layer, opts: IpOpts): Layer {
  const len = 20 + payload.bytes.length;
  const hdr = [
    0x45,
    0,
    len >>> 8,
    len & 255,
    opts.id >>> 8,
    opts.id & 255,
    0x40,
    0,
    opts.ttl,
    proto,
    0,
    0,
    ...be32(src),
    ...be32(dst),
  ];
  const ck = inet(hdr);
  const b = new B();
  b.open(`Internet Protocol Version 4, Src: ${ip4(src)}, Dst: ${ip4(dst)}`, 'ip', undefined, 'ip');
  const o0 = b.pos;
  b.w8(0x45);
  b.over('0100 .... = Version: 4', 'ip.version', 4, o0, 1);
  b.over('.... 0101 = Header Length: 20 bytes (5)', 'ip.hdr_len', 20, o0, 1);
  const ds = b.u8(
    'Differentiated Services Field',
    'ip.dsfield',
    0,
    '0x00 (DSCP: CS0, ECN: Not-ECT)',
  );
  ds.e = 'ip.dsfield';
  b.under(ds, [
    {
      t: '0000 00.. = Differentiated Services Codepoint: Default (0)',
      f: 'ip.dsfield.dscp',
      v: 0,
      o: ds.o,
      n: 1,
    },
    {
      t: '.... ..00 = Explicit Congestion Notification: Not ECN-Capable Transport (0)',
      f: 'ip.dsfield.ecn',
      v: 0,
      o: ds.o,
      n: 1,
    },
  ]);
  b.u16('Total Length', 'ip.len', len);
  b.u16('Identification', 'ip.id', opts.id, `${hex0x(opts.id, 4)} (${opts.id})`);
  const fo = b.pos;
  b.w16(0x4000);
  const fl = b.over("010. .... = Flags: 0x2, Don't fragment", 'ip.flags', 2, fo, 1, {
    e: 'ip.flags',
  });
  b.under(fl, [
    { t: '0... .... = Reserved bit: Not set', f: 'ip.flags.rb', v: false, o: fo, n: 1 },
    { t: ".1.. .... = Don't fragment: Set", f: 'ip.flags.df', v: true, o: fo, n: 1 },
    { t: '..0. .... = More fragments: Not set', f: 'ip.flags.mf', v: false, o: fo, n: 1 },
  ]);
  b.over('...0 0000 0000 0000 = Fragment Offset: 0', 'ip.frag_offset', 0, fo, 2);
  b.u8('Time to Live', 'ip.ttl', opts.ttl);
  b.u8('Protocol', 'ip.proto', proto, `${proto === 6 ? 'TCP' : 'UDP'} (${proto})`);
  b.u16('Header Checksum', 'ip.checksum', ck, `${hex0x(ck, 4)} [validation disabled]`);
  b.gen('Header checksum status: Unverified', 'ip.checksum.status', 2);
  const so = b.pos;
  b.w32(src);
  b.over(`Source Address: ${ip4(src)}`, 'ip.src', src, so, 4);
  const d = b.pos;
  b.w32(dst);
  b.over(`Destination Address: ${ip4(dst)}`, 'ip.dst', dst, d, 4);
  if (opts.srcName)
    b.add({ t: `[Source Host: ${opts.srcName}]`, f: 'ip.src_host', v: opts.srcName, o: so, n: 4 });
  if (opts.dstName)
    b.add({
      t: `[Destination Host: ${opts.dstName}]`,
      f: 'ip.dst_host',
      v: opts.dstName,
      o: d,
      n: 4,
    });
  b.hide('ip.addr', src, so, 4);
  b.hide('ip.addr', dst, d, 4);
  b.hide('ip.host', opts.srcName ?? ip4(src), so, 4);
  b.hide('ip.host', opts.dstName ?? ip4(dst), d, 4);
  if (!opts.srcName) b.hide('ip.src_host', ip4(src), so, 4);
  if (!opts.dstName) b.hide('ip.dst_host', ip4(dst), d, 4);
  b.close();
  return wrap(b, payload);
}

/* ------------------------------------------------------------------ tcp */

export const SYN = 0x002;
export const ACK = 0x010;
export const PSH = 0x008;
export const FIN = 0x001;
export const RST = 0x004;

export interface TcpOpt {
  kind: 'nop' | 'mss' | 'sack' | 'ts' | 'ws';
  v?: number;
  v2?: number;
}

export interface TcpAnalysis {
  acks?: number;
  rtt?: number;
  irtt?: number;
  inFlight?: number;
  push?: number;
  retrans?: boolean;
  lost?: boolean;
  dup?: { num: number; of: number };
}

export interface TcpSeg {
  sport: number;
  dport: number;
  serverPort: number;
  seq: number;
  ack: number;
  seqRaw: number;
  ackRaw: number;
  flags: number;
  win: number;
  /** Window multiplier: a power of two, -1 unknown, -2 not used. */
  scale: number;
  opts: TcpOpt[];
  src: number;
  dst: number;
  stream: number;
  completeness: number;
  tRel: number;
  tDelta: number;
  analysis: TcpAnalysis;
}

const FLAG_ORDER: [number, string][] = [
  [FIN, 'FIN'],
  [SYN, 'SYN'],
  [RST, 'RST'],
  [PSH, 'PSH'],
  [ACK, 'ACK'],
  [0x020, 'URG'],
];

export const flagNames = (f: number) =>
  FLAG_ORDER.filter(([bit]) => f & bit)
    .map(([, n]) => n)
    .join(', ');

const COMPLETE = ['SYN', 'SYN-ACK', 'ACK', 'Data', 'FIN', 'RST'];

export function completenessText(c: number) {
  const complete = (c & 7) === 7 && (c & 0x30) !== 0;
  if (complete) return `Complete, ${c & 8 ? 'WITH_DATA' : 'NO_DATA'} (${c})`;
  return `Incomplete${c & 8 ? ', DATA' : c & 4 ? ', ESTABLISHED' : c & 2 ? ', SYN_SENT' : ''} (${c})`;
}

function optBytes(opts: TcpOpt[]) {
  const out: number[] = [];
  for (const o of opts) {
    if (o.kind === 'nop') out.push(1);
    if (o.kind === 'mss') out.push(2, 4, ((o.v ?? 0) >>> 8) & 255, (o.v ?? 0) & 255);
    if (o.kind === 'sack') out.push(4, 2);
    if (o.kind === 'ts') out.push(8, 10, ...be32(o.v ?? 0), ...be32(o.v2 ?? 0));
    if (o.kind === 'ws') out.push(3, 3, o.v ?? 0);
  }
  while (out.length % 4) out.push(1);
  return out;
}

export function tcp(s: TcpSeg, payload?: Layer): { layer: Layer; info: string } {
  const data = payload?.bytes ?? [];
  const opt = optBytes(s.opts);
  const hl = 20 + opt.length;
  const head = [
    (s.sport >>> 8) & 255,
    s.sport & 255,
    (s.dport >>> 8) & 255,
    s.dport & 255,
    ...be32(s.seqRaw),
    ...be32(s.ackRaw),
    (hl / 4) << 4,
    s.flags & 255,
    (s.win >>> 8) & 255,
    s.win & 255,
    0,
    0,
    0,
    0,
    ...opt,
  ];
  const all = head.concat(data);
  const ck = inet(all, 0, all.length, pseudo(s.src, s.dst, 6, all.length));
  const syn = !!(s.flags & SYN);
  const calcWin = !syn && s.scale > 0 ? s.win * s.scale : s.win;
  const len = data.length;

  const b = new B();
  b.open(
    `Transmission Control Protocol, Src Port: ${s.sport}, Dst Port: ${s.dport}, Seq: ${s.seq}${s.flags & ACK ? `, Ack: ${s.ack}` : ''}, Len: ${len}`,
    'tcp',
    undefined,
    'tcp',
  );
  const sp = b.u16('Source Port', 'tcp.srcport', s.sport);
  const dp = b.u16('Destination Port', 'tcp.dstport', s.dport);
  b.hide('tcp.port', s.sport, sp.o, 2);
  b.hide('tcp.port', s.dport, dp.o, 2);
  b.gen(`Stream index: ${s.stream}`, 'tcp.stream', s.stream);
  const comp = b.gen(
    `Conversation completeness: ${completenessText(s.completeness)}`,
    'tcp.completeness',
    s.completeness,
    { e: 'tcp.completeness' },
  );
  comp.k = COMPLETE.map((name, i) => ({
    t: `[${bitStr(s.completeness, 8, 1 << i)} = ${name}: ${s.completeness & (1 << i) ? 'Present' : 'Absent'}]`,
    o: comp.o,
    n: 0,
  })).reverse();
  b.gen(`TCP Segment Len: ${len}`, 'tcp.len', len);
  const seqO = b.pos;
  b.w32(s.seqRaw);
  b.over(`Sequence Number: ${s.seq}    (relative sequence number)`, 'tcp.seq', s.seq, seqO, 4);
  b.over(`Sequence Number (raw): ${s.seqRaw}`, 'tcp.seq_raw', s.seqRaw, seqO, 4);
  const next = s.seq + len + (syn || s.flags & FIN ? 1 : 0);
  if (len || syn || s.flags & FIN)
    b.add({
      t: `[Next Sequence Number: ${next}    (relative sequence number)]`,
      f: 'tcp.nxtseq',
      v: next,
      o: seqO,
      n: 0,
    });
  const ackO = b.pos;
  b.w32(s.ackRaw);
  if (s.flags & ACK) {
    b.over(`Acknowledgment Number: ${s.ack}    (relative ack number)`, 'tcp.ack', s.ack, ackO, 4);
    b.over(`Acknowledgment number (raw): ${s.ackRaw}`, 'tcp.ack_raw', s.ackRaw, ackO, 4);
  } else {
    b.over('Acknowledgment Number: 0', 'tcp.ack', 0, ackO, 4);
  }
  const hO = b.pos;
  b.w8((hl / 4) << 4);
  b.over(
    `${bitStr(hl / 4, 4, 0xf)} .... = Header Length: ${hl} bytes (${hl / 4})`,
    'tcp.hdr_len',
    hl,
    hO,
    1,
  );
  b.w8(s.flags & 255);
  const names = flagNames(s.flags);
  const flags = b.over(`Flags: ${hex0x(s.flags, 3)} (${names})`, 'tcp.flags', s.flags, hO, 2, {
    e: 'tcp.flags',
  });
  const fbits = bits(hO, 2, s.flags, 12, [
    { mask: 0xe00, name: 'Reserved', f: 'tcp.flags.res', bool: true },
    { mask: 0x100, name: 'Accurate ECN', f: 'tcp.flags.ae' },
    { mask: 0x080, name: 'Congestion Window Reduced', f: 'tcp.flags.cwr' },
    { mask: 0x040, name: 'ECN-Echo', f: 'tcp.flags.ece' },
    { mask: 0x020, name: 'Urgent', f: 'tcp.flags.urg' },
    { mask: 0x010, name: 'Acknowledgment', f: 'tcp.flags.ack' },
    { mask: 0x008, name: 'Push', f: 'tcp.flags.push' },
    { mask: 0x004, name: 'Reset', f: 'tcp.flags.reset' },
    { mask: 0x002, name: 'Syn', f: 'tcp.flags.syn' },
    { mask: 0x001, name: 'Fin', f: 'tcp.flags.fin' },
  ]);
  if (syn)
    fbits[8].k = [
      expert(
        'chat',
        'Sequence',
        s.flags & ACK
          ? `Connection establish acknowledge (SYN+ACK): server port ${s.serverPort}`
          : `Connection establish request (SYN): server port ${s.serverPort}`,
        hO,
        2,
      ),
    ];
  if (s.flags & FIN) fbits[9].k = [expert('chat', 'Sequence', 'Connection finish (FIN)', hO, 2)];
  const str = 'RRRACEUAPRSF'
    .split('')
    .map((c, i) => (s.flags & (1 << (11 - i)) ? c : '·'))
    .join('');
  b.under(flags, [...fbits, { t: `[TCP Flags: ${str}]`, f: 'tcp.flags.str', v: str, o: hO, n: 0 }]);
  b.u16('Window', 'tcp.window_size_value', s.win);
  b.gen(`Calculated window size: ${calcWin}`, 'tcp.window_size', calcWin);
  if (!syn)
    b.gen(
      `Window size scaling factor: ${s.scale === -2 ? '-2 (no window scaling used)' : s.scale === -1 ? '-1 (unknown)' : s.scale}`,
      'tcp.window_size_scalefactor',
      s.scale,
    );
  b.u16('Checksum', 'tcp.checksum', ck, `${hex0x(ck, 4)} [unverified]`);
  b.gen('Checksum Status: Unverified', 'tcp.checksum.status', 2);
  b.u16('Urgent Pointer', 'tcp.urgent_pointer', 0);

  if (opt.length) {
    const names2 = s.opts.map(
      (o) =>
        ({
          nop: 'No-Operation (NOP)',
          mss: 'Maximum segment size',
          sack: 'SACK permitted',
          ts: 'Timestamps',
          ws: 'Window scale',
        })[o.kind],
    );
    b.open(
      `Options: (${opt.length} bytes), ${names2.join(', ')}`,
      'tcp.options',
      Uint8Array.from(opt),
      'tcp.options',
    );
    for (const o of s.opts) {
      if (o.kind === 'nop') {
        b.open('TCP Option - No-Operation (NOP)', 'tcp.options.nop', undefined, 'tcp.option');
        b.u8('Kind', 'tcp.option_kind', 1, 'No-Operation (1)');
        b.close();
      } else if (o.kind === 'mss') {
        b.open(
          `TCP Option - Maximum segment size: ${o.v} bytes`,
          undefined,
          undefined,
          'tcp.option',
        );
        b.u8('Kind', 'tcp.option_kind', 2, 'Maximum Segment Size (2)');
        b.u8('Length', 'tcp.option_len', 4);
        b.u16('MSS Value', 'tcp.options.mss_val', o.v ?? 0);
        b.close();
      } else if (o.kind === 'sack') {
        b.open('TCP Option - SACK permitted', 'tcp.options.sack_perm', undefined, 'tcp.option');
        b.u8('Kind', 'tcp.option_kind', 4, 'SACK Permitted (4)');
        b.u8('Length', 'tcp.option_len', 2);
        b.close();
      } else if (o.kind === 'ts') {
        b.open(
          `TCP Option - Timestamps: TSval ${o.v}, TSecr ${o.v2}`,
          undefined,
          undefined,
          'tcp.option',
        );
        b.u8('Kind', 'tcp.option_kind', 8, 'Time Stamp Option (8)');
        b.u8('Length', 'tcp.option_len', 10);
        b.u32('Timestamp value', 'tcp.options.timestamp.tsval', o.v ?? 0);
        b.u32('Timestamp echo reply', 'tcp.options.timestamp.tsecr', o.v2 ?? 0);
        b.close();
      } else {
        const mult = 2 ** (o.v ?? 0);
        b.open(
          `TCP Option - Window scale: ${o.v} (multiply by ${mult})`,
          undefined,
          undefined,
          'tcp.option',
        );
        b.u8('Kind', 'tcp.option_kind', 3, 'Window Scale (3)');
        b.u8('Length', 'tcp.option_len', 3);
        const sh = b.u8('Shift count', 'tcp.options.wscale.shift', o.v ?? 0);
        b.add({
          t: `[Multiplier: ${mult}]`,
          f: 'tcp.options.wscale.multiplier',
          v: mult,
          o: sh.o,
          n: 0,
        });
        b.close();
      }
    }
    while (b.pos < hl) b.w8(1);
    b.close();
  }

  b.open('[Timestamps]', undefined, undefined, 'tcp.timestamps');
  b.gen(`Time since first frame in this TCP stream: ${secs(s.tRel)}`, 'tcp.time_relative', s.tRel);
  b.gen(
    `Time since previous frame in this TCP stream: ${secs(s.tDelta)}`,
    'tcp.time_delta',
    s.tDelta,
  );
  b.close();

  const a = s.analysis;
  const hasAnalysis =
    a.acks !== undefined ||
    a.irtt !== undefined ||
    a.inFlight !== undefined ||
    a.retrans ||
    a.lost ||
    a.dup;
  if (hasAnalysis) {
    b.open('[SEQ/ACK analysis]', 'tcp.analysis', undefined, 'tcp.analysis');
    if (a.acks !== undefined)
      b.gen(
        `This is an ACK to the segment in frame: ${a.acks}`,
        'tcp.analysis.acks_frame',
        a.acks,
        { go: a.acks },
      );
    if (a.rtt !== undefined)
      b.gen(`The RTT to ACK the segment was: ${secs(a.rtt)}`, 'tcp.analysis.ack_rtt', a.rtt);
    if (a.irtt !== undefined) b.gen(`iRTT: ${secs(a.irtt)}`, 'tcp.analysis.initial_rtt', a.irtt);
    if (a.inFlight !== undefined)
      b.gen(`Bytes in flight: ${a.inFlight}`, 'tcp.analysis.bytes_in_flight', a.inFlight);
    if (a.push !== undefined)
      b.gen(`Bytes sent since last PSH flag: ${a.push}`, 'tcp.analysis.push_bytes_sent', a.push);
    if (a.dup) {
      b.gen(`Duplicate ACK #: ${a.dup.num}`, 'tcp.analysis.duplicate_ack_num', a.dup.num);
      b.gen(
        `Duplicate to the ACK in frame: ${a.dup.of}`,
        'tcp.analysis.duplicate_ack_frame',
        a.dup.of,
        { go: a.dup.of },
      );
    }
    if (a.retrans || a.lost || a.dup) {
      const flagsNode = b.gen('TCP Analysis Flags', 'tcp.analysis.flags', undefined, {
        e: 'tcp.analysis.flags',
      });
      const o = flagsNode.o;
      flagsNode.k = [];
      if (a.retrans)
        flagsNode.k.push({
          ...expert('note', 'Sequence', 'This frame is a (suspected) retransmission', o, 0),
          f: 'tcp.analysis.retransmission',
        });
      if (a.lost)
        flagsNode.k.push({
          ...expert(
            'warn',
            'Sequence',
            'Previous segment(s) not captured (common at capture start)',
            o,
            0,
          ),
          f: 'tcp.analysis.lost_segment',
        });
      if (a.dup)
        flagsNode.k.push({
          ...expert('note', 'Sequence', `Duplicate ACK (#${a.dup.num})`, o, 0),
          f: 'tcp.analysis.duplicate_ack',
        });
    }
    b.close();
  }
  if (len) b.over(`TCP payload (${len} bytes)`, 'tcp.payload', Uint8Array.from(data), hl, len);
  b.close();

  const tsOpt = s.opts.find((o) => o.kind === 'ts');
  const mss = s.opts.find((o) => o.kind === 'mss');
  const ws = s.opts.find((o) => o.kind === 'ws');
  const prefix = a.retrans
    ? '[TCP Retransmission] '
    : a.dup
      ? `[TCP Dup ACK ${a.dup.of}#${a.dup.num}] `
      : '';
  const info =
    `${prefix}${s.sport} → ${s.dport} [${names}] Seq=${s.seq}${s.flags & ACK ? ` Ack=${s.ack}` : ''} Win=${calcWin} Len=${len}` +
    (mss ? ` MSS=${mss.v}` : '') +
    (s.opts.some((o) => o.kind === 'sack') ? ' SACK_PERM' : '') +
    (tsOpt ? ` TSval=${tsOpt.v} TSecr=${tsOpt.v2}` : '') +
    (ws ? ` WS=${2 ** (ws.v ?? 0)}` : '');
  return { layer: wrap(b, payload), info };
}

/* ------------------------------------------------------------------ udp */

export function udp(
  sport: number,
  dport: number,
  src: number,
  dst: number,
  payload: Layer,
  stream: number,
  tRel: number,
  tDelta: number,
): Layer {
  const len = 8 + payload.bytes.length;
  const all = [
    (sport >>> 8) & 255,
    sport & 255,
    (dport >>> 8) & 255,
    dport & 255,
    len >>> 8,
    len & 255,
    0,
    0,
  ].concat(payload.bytes);
  const ck = inet(all, 0, all.length, pseudo(src, dst, 17, len)) || 0xffff;
  const b = new B();
  b.open(`User Datagram Protocol, Src Port: ${sport}, Dst Port: ${dport}`, 'udp', undefined, 'udp');
  const sp = b.u16('Source Port', 'udp.srcport', sport);
  const dp = b.u16('Destination Port', 'udp.dstport', dport);
  b.hide('udp.port', sport, sp.o, 2);
  b.hide('udp.port', dport, dp.o, 2);
  b.u16('Length', 'udp.length', len);
  b.u16('Checksum', 'udp.checksum', ck, `${hex0x(ck, 4)} [unverified]`);
  b.gen('Checksum Status: Unverified', 'udp.checksum.status', 2);
  b.gen(`Stream index: ${stream}`, 'udp.stream', stream);
  b.open('[Timestamps]', undefined, undefined, 'udp.timestamps');
  b.gen(`Time since first frame: ${secs(tRel)}`, 'udp.time_relative', tRel);
  b.gen(`Time since previous frame: ${secs(tDelta)}`, 'udp.time_delta', tDelta);
  b.close();
  b.over(
    `UDP payload (${payload.bytes.length} bytes)`,
    'udp.payload',
    Uint8Array.from(payload.bytes),
    8,
    payload.bytes.length,
  );
  b.close();
  return wrap(b, payload);
}

/* ------------------------------------------------------------------ dns */

export interface DnsMsg {
  id: number;
  response: boolean;
  name: string;
  answers?: { ip: number; ttl: number }[];
  link?: number;
  time?: number;
}

const ttlText = (s: number) =>
  s % 3600 === 0
    ? `${s / 3600} hour${s === 3600 ? '' : 's'}`
    : s % 60 === 0
      ? `${s / 60} minute${s === 60 ? '' : 's'}`
      : `${s} seconds`;

export function dns(m: DnsMsg): { layer: Layer; info: string } {
  const b = new B();
  const ans = m.answers ?? [];
  b.open(`Domain Name System (${m.response ? 'response' : 'query'})`, 'dns', undefined, 'dns');
  b.u16('Transaction ID', 'dns.id', m.id, hex0x(m.id, 4));
  const flags = m.response ? 0x8180 : 0x0100;
  const fl = b.u16(
    'Flags',
    'dns.flags',
    flags,
    `${hex0x(flags, 4)} ${m.response ? 'Standard query response, No error' : 'Standard query'}`,
  );
  fl.e = 'dns.flags';
  const def = m.response
    ? [
        {
          mask: 0x8000,
          name: 'Response',
          f: 'dns.flags.response',
          show: () => 'Message is a response',
        },
        { mask: 0x7800, name: 'Opcode', f: 'dns.flags.opcode', show: () => 'Standard query (0)' },
        {
          mask: 0x0400,
          name: 'Authoritative',
          f: 'dns.flags.authoritative',
          show: () => 'Server is not an authority for domain',
        },
        {
          mask: 0x0200,
          name: 'Truncated',
          f: 'dns.flags.truncated',
          show: () => 'Message is not truncated',
        },
        {
          mask: 0x0100,
          name: 'Recursion desired',
          f: 'dns.flags.recdesired',
          show: () => 'Do query recursively',
        },
        {
          mask: 0x0080,
          name: 'Recursion available',
          f: 'dns.flags.recavail',
          show: () => 'Server can do recursive queries',
        },
        { mask: 0x0040, name: 'Z', f: 'dns.flags.z', show: () => 'reserved (0)' },
        {
          mask: 0x0020,
          name: 'Answer authenticated',
          f: 'dns.flags.authenticated',
          show: () => 'Answer/authority portion was not authenticated by the server',
        },
        {
          mask: 0x0010,
          name: 'Non-authenticated data',
          f: 'dns.flags.checkdisable',
          show: () => 'Unacceptable',
        },
        { mask: 0x000f, name: 'Reply code', f: 'dns.flags.rcode', show: () => 'No error (0)' },
      ]
    : [
        {
          mask: 0x8000,
          name: 'Response',
          f: 'dns.flags.response',
          show: () => 'Message is a query',
        },
        { mask: 0x7800, name: 'Opcode', f: 'dns.flags.opcode', show: () => 'Standard query (0)' },
        {
          mask: 0x0200,
          name: 'Truncated',
          f: 'dns.flags.truncated',
          show: () => 'Message is not truncated',
        },
        {
          mask: 0x0100,
          name: 'Recursion desired',
          f: 'dns.flags.recdesired',
          show: () => 'Do query recursively',
        },
        { mask: 0x0040, name: 'Z', f: 'dns.flags.z', show: () => 'reserved (0)' },
        {
          mask: 0x0010,
          name: 'Non-authenticated data',
          f: 'dns.flags.checkdisable',
          show: () => 'Unacceptable',
        },
      ];
  b.under(
    fl,
    bits(fl.o, 2, flags, 16, def).map((n, i) => ({
      ...n,
      v: def[i].mask === 0x7800 || def[i].mask === 0x000f ? 0 : n.v,
    })),
  );
  b.u16('Questions', 'dns.count.queries', 1);
  b.u16('Answer RRs', 'dns.count.answers', ans.length);
  b.u16('Authority RRs', 'dns.count.auth_rr', 0);
  b.u16('Additional RRs', 'dns.count.add_rr', 0);

  const labels = m.name.split('.');
  b.open('Queries', undefined, undefined, 'dns.queries');
  b.open(`${m.name}: type A, class IN`, undefined, undefined, 'dns.query');
  const no = b.pos;
  for (const l of labels) {
    b.w8(l.length);
    b.text(l);
  }
  b.w8(0);
  b.over(`Name: ${m.name}`, 'dns.qry.name', m.name, no, b.pos - no);
  b.add({
    t: `[Name Length: ${m.name.length}]`,
    f: 'dns.qry.name.len',
    v: m.name.length,
    o: no,
    n: 0,
  });
  b.add({
    t: `[Label Count: ${labels.length}]`,
    f: 'dns.count.labels',
    v: labels.length,
    o: no,
    n: 0,
  });
  b.u16('Type', 'dns.qry.type', 1, 'A (1) (Host Address)');
  b.u16('Class', 'dns.qry.class', 1, 'IN (0x0001)');
  b.close();
  b.close();

  if (ans.length) {
    b.open('Answers', undefined, undefined, 'dns.answers');
    for (const a of ans) {
      b.open(`${m.name}: type A, class IN, addr ${ip4(a.ip)}`, undefined, undefined, 'dns.answer');
      b.field(`Name: ${m.name}`, 'dns.resp.name', m.name, () => b.w16(0xc00c));
      b.u16('Type', 'dns.resp.type', 1, 'A (1) (Host Address)');
      b.u16('Class', 'dns.resp.class', 1, 'IN (0x0001)');
      b.u32('Time to live', 'dns.resp.ttl', a.ttl, `${a.ttl} (${ttlText(a.ttl)})`);
      b.u16('Data length', 'dns.resp.len', 4);
      b.field(`Address: ${ip4(a.ip)}`, 'dns.a', a.ip, () => b.w32(a.ip));
      b.close();
    }
    b.close();
  }
  if (m.link !== undefined)
    b.gen(
      `${m.response ? 'Request In' : 'Response In'}: ${m.link}`,
      m.response ? 'dns.response_to' : 'dns.response_in',
      m.link,
      { go: m.link },
    );
  if (m.time !== undefined) b.gen(`Time: ${secs(m.time)}`, 'dns.time', m.time);
  b.close();
  const info = `Standard query${m.response ? ' response' : ''} ${hex0x(m.id, 4)} A ${m.name}${ans.map((a) => ` A ${ip4(a.ip)}`).join('')}`;
  return { layer: b.layer(), info };
}

/* ------------------------------------------------------------------ ntp */

const NTP_EPOCH = 2208988800;

export interface NtpMsg {
  mode: 3 | 4;
  stratum: number;
  poll: number;
  precision: number;
  rootDelay: number;
  rootDisp: number;
  refid: number[];
  ref: number;
  org: number;
  rec: number;
  xmt: number;
  when: (epoch: number) => string;
}

export function ntp(m: NtpMsg): { layer: Layer; info: string } {
  const b = new B();
  b.open(
    'Network Time Protocol (NTP Version 4, ' + (m.mode === 3 ? 'client)' : 'server)'),
    'ntp',
    undefined,
    'ntp',
  );
  const flags = (0 << 6) | (4 << 3) | m.mode;
  const fl = b.u8(
    'Flags',
    'ntp.flags',
    flags,
    `${hex0x(flags)}, Leap Indicator: no warning, Version number: NTP Version 4, Mode: ${m.mode === 3 ? 'client' : 'server'}`,
  );
  fl.e = 'ntp.flags';
  b.under(
    fl,
    bits(fl.o, 1, flags, 8, [
      { mask: 0xc0, name: 'Leap Indicator', f: 'ntp.flags.li', show: () => 'no warning (0)' },
      { mask: 0x38, name: 'Version number', f: 'ntp.flags.vn', show: () => 'NTP Version 4 (4)' },
      {
        mask: 0x07,
        name: 'Mode',
        f: 'ntp.flags.mode',
        show: (v) => `${v === 3 ? 'client' : 'server'} (${v})`,
      },
    ]),
  );
  b.u8(
    'Peer Clock Stratum',
    'ntp.stratum',
    m.stratum,
    m.stratum ? `secondary reference (${m.stratum})` : 'unspecified or invalid (0)',
  );
  b.u8('Peer Polling Interval', 'ntp.ppoll', m.poll, `${m.poll} (${2 ** m.poll} seconds)`);
  b.field(
    `Peer Clock Precision: ${(2 ** m.precision).toFixed(9)} seconds`,
    'ntp.precision',
    m.precision,
    () => b.w8(m.precision & 255),
  );
  const fixed = (v: number) => Math.round(v * 65536);
  b.field(`Root Delay: ${m.rootDelay.toFixed(6)} seconds`, 'ntp.rootdelay', m.rootDelay, () =>
    b.w32(fixed(m.rootDelay)),
  );
  b.field(
    `Root Dispersion: ${m.rootDisp.toFixed(6)} seconds`,
    'ntp.rootdispersion',
    m.rootDisp,
    () => b.w32(fixed(m.rootDisp)),
  );
  b.bytesField('Reference ID', 'ntp.refid', m.refid, m.refid.join('.'));
  const stamp = (label: string, f: string, epoch: number) => {
    const sec = epoch ? Math.floor(epoch) + NTP_EPOCH : 0;
    const frac = epoch ? Math.floor((epoch % 1) * 2 ** 32) : 0;
    b.field(
      `${label}: ${epoch ? m.when(epoch) : 'NULL'}`,
      f,
      epoch ? m.when(epoch) : 'NULL',
      () => {
        b.w32(sec >>> 0);
        b.w32(frac >>> 0);
      },
    );
  };
  stamp('Reference Timestamp', 'ntp.reftime', m.ref);
  stamp('Origin Timestamp', 'ntp.org', m.org);
  stamp('Receive Timestamp', 'ntp.rec', m.rec);
  stamp('Transmit Timestamp', 'ntp.xmt', m.xmt);
  b.close();
  return { layer: b.layer(), info: `NTP Version 4, ${m.mode === 3 ? 'client' : 'server'}` };
}

/* ------------------------------------------------------------------ tls */

const SUITES: Record<number, string> = {
  0x1301: 'TLS_AES_128_GCM_SHA256',
  0x1302: 'TLS_AES_256_GCM_SHA384',
  0x1303: 'TLS_CHACHA20_POLY1305_SHA256',
};
const GROUPS: Record<number, string> = {
  0x001d: 'x25519',
  0x0017: 'secp256r1',
  0x0018: 'secp384r1',
};
const SIGALGS: Record<number, string> = {
  0x0403: 'ecdsa_secp256r1_sha256',
  0x0804: 'rsa_pss_rsae_sha256',
  0x0401: 'rsa_pkcs1_sha256',
  0x0807: 'ed25519',
};
const EXT_NAMES: Record<number, string> = {
  0: 'server_name',
  10: 'supported_groups',
  13: 'signature_algorithms',
  16: 'application_layer_protocol_negotiation',
  43: 'supported_versions',
  45: 'psk_key_exchange_modes',
  51: 'key_share',
};

function recordHead(b: B, type: number, version: number, len: number, opaque = false) {
  const names: Record<number, string> = {
    20: 'Change Cipher Spec',
    22: 'Handshake',
    23: 'Application Data',
  };
  b.u8(
    opaque ? 'Opaque Type' : 'Content Type',
    opaque ? 'tls.record.opaque_type' : 'tls.record.content_type',
    type,
    `${names[type]} (${type})`,
  );
  b.u16(
    'Version',
    'tls.record.version',
    version,
    `${version === 0x0301 ? 'TLS 1.0' : 'TLS 1.2'} (${hex0x(version, 4)})`,
  );
  b.u16('Length', 'tls.record.length', len);
}

/** A Client/Server Hello extension, its length patched in once the body is written. */
function ext(b: B, type: number, body: () => void, extra = '') {
  const node = b.open(
    `Extension: ${EXT_NAMES[type]} (len=?)${extra}`,
    undefined,
    undefined,
    `tls.ext.${type}`,
  );
  b.u16('Type', 'tls.handshake.extension.type', type, `${EXT_NAMES[type]} (${type})`);
  const lenAt = b.pos;
  b.w16(0);
  const lenNode = b.over('Length: 0', 'tls.handshake.extension.len', 0, lenAt, 2);
  body();
  b.close();
  const len = b.pos - lenAt - 2;
  b.bytes[lenAt] = len >>> 8;
  b.bytes[lenAt + 1] = len & 255;
  lenNode.t = `Length: ${len}`;
  lenNode.v = len;
  node.t = node.t.replace('len=?', `len=${len}`);
}

export interface Hello {
  layer: Layer;
  info: string;
}

/** A TLS 1.3 Client Hello with SNI, optional ALPN, and the JA4 fingerprint worked out from it. */
export function clientHello(
  sni: string,
  alpn: string | null,
  random: number[],
  sessionId: number[],
  keyShare: number[],
): Hello {
  const suites = [0x1301, 0x1302, 0x1303];
  const groups = [0x001d, 0x0017, 0x0018];
  const sigs = [0x0403, 0x0804, 0x0401, 0x0807];
  const b = new B();
  b.open('Transport Layer Security', 'tls', undefined, 'tls');
  b.open(
    'TLSv1.3 Record Layer: Handshake Protocol: Client Hello',
    'tls.record',
    undefined,
    'tls.record',
  );
  b.u8('Content Type', 'tls.record.content_type', 22, 'Handshake (22)');
  b.u16('Version', 'tls.record.version', 0x0301, 'TLS 1.0 (0x0301)');
  const recLenAt = b.pos;
  b.w16(0);
  const recLen = b.over('Length: 0', 'tls.record.length', 0, recLenAt, 2);
  b.open('Handshake Protocol: Client Hello', 'tls.handshake', undefined, 'tls.handshake');
  b.u8('Handshake Type', 'tls.handshake.type', 1, 'Client Hello (1)');
  const hsLenAt = b.pos;
  b.w8(0);
  b.w16(0);
  const hsLen = b.over('Length: 0', 'tls.handshake.length', 0, hsLenAt, 3);
  b.u16('Version', 'tls.handshake.version', 0x0303, 'TLS 1.2 (0x0303)');
  b.bytesField('Random', 'tls.handshake.random', random);
  b.u8('Session ID Length', 'tls.handshake.session_id_length', sessionId.length);
  b.bytesField('Session ID', 'tls.handshake.session_id', sessionId);
  b.u16('Cipher Suites Length', 'tls.handshake.cipher_suites_length', suites.length * 2);
  b.open(
    `Cipher Suites (${suites.length} suites)`,
    'tls.handshake.ciphersuites',
    undefined,
    'tls.suites',
  );
  for (const c of suites)
    b.u16('Cipher Suite', 'tls.handshake.ciphersuite', c, `${SUITES[c]} (${hex0x(c, 4)})`);
  b.close();
  b.u8('Compression Methods Length', 'tls.handshake.comp_methods_length', 1);
  b.open('Compression Methods (1 method)', undefined, undefined, 'tls.comp');
  b.u8('Compression Method', 'tls.handshake.comp_method', 0, 'null (0)');
  b.close();
  const extLenAt = b.pos;
  b.w16(0);
  const extLen = b.over('Extensions Length: 0', 'tls.handshake.extensions_length', 0, extLenAt, 2);
  const exts = [0, 10, 13, ...(alpn ? [16] : []), 45, 43, 51];

  ext(
    b,
    0,
    () => {
      b.open('Server Name Indication extension', undefined, undefined, 'tls.sni');
      b.u16(
        'Server Name list length',
        'tls.handshake.extensions_server_name_list_len',
        sni.length + 3,
      );
      b.u8('Server Name Type', 'tls.handshake.extensions_server_name_type', 0, 'host_name (0)');
      b.u16('Server Name length', 'tls.handshake.extensions_server_name_len', sni.length);
      b.str('Server Name', 'tls.handshake.extensions_server_name', sni);
      b.close();
    },
    ` name=${sni}`,
  );
  ext(b, 10, () => {
    b.u16(
      'Supported Groups List Length',
      'tls.handshake.extensions_supported_groups_length',
      groups.length * 2,
    );
    b.open(`Supported Groups (${groups.length} groups)`, undefined, undefined, 'tls.groups');
    for (const g of groups)
      b.u16(
        'Supported Group',
        'tls.handshake.extensions_supported_group',
        g,
        `${GROUPS[g]} (${hex0x(g, 4)})`,
      );
    b.close();
  });
  ext(b, 13, () => {
    b.u16('Signature Hash Algorithms Length', 'tls.handshake.sig_hash_alg_len', sigs.length * 2);
    b.open(
      `Signature Hash Algorithms (${sigs.length} algorithms)`,
      undefined,
      undefined,
      'tls.sigs',
    );
    for (const g of sigs)
      b.u16(
        'Signature Algorithm',
        'tls.handshake.sig_hash_alg',
        g,
        `${SIGALGS[g]} (${hex0x(g, 4)})`,
      );
    b.close();
  });
  if (alpn)
    ext(b, 16, () => {
      b.u16('ALPN Extension Length', 'tls.handshake.extensions_alpn_len', alpn.length + 1);
      b.open('ALPN Protocol', undefined, undefined, 'tls.alpn');
      b.u8('ALPN string length', 'tls.handshake.extensions_alpn_str_len', alpn.length);
      b.str('ALPN Next Protocol', 'tls.handshake.extensions_alpn_str', alpn);
      b.close();
    });
  ext(b, 45, () => {
    b.u8('PSK Key Exchange Modes Length', 'tls.extension.psk_ke_modes_length', 1);
    b.u8(
      'PSK Key Exchange Mode',
      'tls.extension.psk_ke_mode',
      1,
      'PSK with (EC)DHE key establishment (psk_dhe_ke) (1)',
    );
  });
  ext(
    b,
    43,
    () => {
      b.u8('Supported Versions length', 'tls.handshake.extensions.supported_versions_len', 2);
      b.u16(
        'Supported Version',
        'tls.handshake.extensions.supported_version',
        0x0304,
        'TLS 1.3 (0x0304)',
      );
    },
    ' TLS 1.3',
  );
  ext(
    b,
    51,
    () => {
      b.open('Key Share extension', undefined, undefined, 'tls.keyshare');
      b.u16(
        'Client Key Share Length',
        'tls.handshake.extensions_key_share_client_length',
        keyShare.length + 4,
      );
      b.open(
        `Key Share Entry: Group: x25519, Key Exchange length: ${keyShare.length}`,
        undefined,
        undefined,
        'tls.keyshare.entry',
      );
      b.u16('Group', 'tls.handshake.extensions_key_share_group', 0x001d, 'x25519 (29)');
      b.u16(
        'Key Exchange Length',
        'tls.handshake.extensions_key_share_key_exchange_length',
        keyShare.length,
      );
      b.bytesField('Key Exchange', 'tls.handshake.extensions_key_share_key_exchange', keyShare);
      b.close();
      b.close();
    },
    ' x25519',
  );

  // JA4: protocol, version, SNI, counts, ALPN ends, then hashes of the sorted lists.
  const h4 = (n: number) => hex(n, 4);
  const sortedSuites = [...suites]
    .sort((x, y) => x - y)
    .map(h4)
    .join(',');
  const sortedExts = exts
    .filter((e) => e !== 0 && e !== 16)
    .sort((x, y) => x - y)
    .map(h4)
    .join(',');
  const sigList = sigs.map(h4).join(',');
  const head = `t13d${String(suites.length).padStart(2, '0')}${String(exts.length).padStart(2, '0')}${alpn ? alpn[0] + alpn[alpn.length - 1] : '00'}`;
  const ja4r = `${head}_${sortedSuites}_${sortedExts}_${sigList}`;
  const ja4 = `${head}_${sha256(utf8(sortedSuites)).slice(0, 12)}_${sha256(utf8(`${sortedExts}_${sigList}`)).slice(0, 12)}`;
  b.gen(`JA4: ${ja4}`, 'tls.handshake.ja4', ja4);
  b.gen(`JA4_r: ${ja4r}`, 'tls.handshake.ja4_r', ja4r);

  const extTotal = b.pos - extLenAt - 2;
  b.bytes[extLenAt] = extTotal >>> 8;
  b.bytes[extLenAt + 1] = extTotal & 255;
  extLen.t = `Extensions Length: ${extTotal}`;
  extLen.v = extTotal;
  b.close();
  const hsTotal = b.pos - hsLenAt - 3;
  b.bytes[hsLenAt] = 0;
  b.bytes[hsLenAt + 1] = hsTotal >>> 8;
  b.bytes[hsLenAt + 2] = hsTotal & 255;
  hsLen.t = `Length: ${hsTotal}`;
  hsLen.v = hsTotal;
  b.close();
  const recTotal = b.pos - recLenAt - 2;
  b.bytes[recLenAt] = recTotal >>> 8;
  b.bytes[recLenAt + 1] = recTotal & 255;
  recLen.t = `Length: ${recTotal}`;
  recLen.v = recTotal;
  b.close();
  return { layer: b.layer(), info: 'Client Hello' + (sni ? ` (SNI=${sni})` : '') };
}

/** Server Hello, Change Cipher Spec, and the encrypted rest of the handshake (opaque: the key log holds traffic secrets only). */
export function serverHello(
  random: number[],
  sessionId: number[],
  keyShare: number[],
  opaque: number[],
  appProto: string,
): Hello {
  const b = new B();
  b.open('Transport Layer Security', 'tls', undefined, 'tls');
  b.open(
    'TLSv1.3 Record Layer: Handshake Protocol: Server Hello',
    'tls.record',
    undefined,
    'tls.record',
  );
  const bodyLen = 2 + 32 + 1 + sessionId.length + 2 + 1 + 2 + (4 + 4 + keyShare.length) + 6;
  recordHead(b, 22, 0x0303, bodyLen + 4);
  b.open('Handshake Protocol: Server Hello', 'tls.handshake', undefined, 'tls.handshake');
  b.u8('Handshake Type', 'tls.handshake.type', 2, 'Server Hello (2)');
  b.field(`Length: ${bodyLen}`, 'tls.handshake.length', bodyLen, () => {
    b.w8(0);
    b.w16(bodyLen);
  });
  b.u16('Version', 'tls.handshake.version', 0x0303, 'TLS 1.2 (0x0303)');
  b.bytesField('Random', 'tls.handshake.random', random);
  b.u8('Session ID Length', 'tls.handshake.session_id_length', sessionId.length);
  b.bytesField('Session ID', 'tls.handshake.session_id', sessionId);
  b.u16('Cipher Suite', 'tls.handshake.ciphersuite', 0x1301, `${SUITES[0x1301]} (0x1301)`);
  b.u8('Compression Method', 'tls.handshake.comp_method', 0, 'null (0)');
  b.u16('Extensions Length', 'tls.handshake.extensions_length', 4 + 4 + keyShare.length + 6);
  ext(
    b,
    51,
    () => {
      b.open(`Key Share extension`, undefined, undefined, 'tls.keyshare');
      b.open(
        `Key Share Entry: Group: x25519, Key Exchange length: ${keyShare.length}`,
        undefined,
        undefined,
        'tls.keyshare.entry',
      );
      b.u16('Group', 'tls.handshake.extensions_key_share_group', 0x001d, 'x25519 (29)');
      b.u16(
        'Key Exchange Length',
        'tls.handshake.extensions_key_share_key_exchange_length',
        keyShare.length,
      );
      b.bytesField('Key Exchange', 'tls.handshake.extensions_key_share_key_exchange', keyShare);
      b.close();
      b.close();
    },
    ' x25519',
  );
  ext(
    b,
    43,
    () =>
      b.u16(
        'Supported Version',
        'tls.handshake.extensions.supported_version',
        0x0304,
        'TLS 1.3 (0x0304)',
      ),
    ' TLS 1.3',
  );
  b.close();
  b.close();
  ccs(b);
  opaqueRecord(b, opaque, appProto);
  b.close();
  return { layer: b.layer(), info: 'Server Hello, Change Cipher Spec, Application Data' };
}

function ccs(b: B) {
  b.open(
    'TLSv1.3 Record Layer: Change Cipher Spec Protocol: Change Cipher Spec',
    'tls.record',
    undefined,
    'tls.record',
  );
  recordHead(b, 20, 0x0303, 1);
  b.field('Change Cipher Spec Message', 'tls.change_cipher_spec', undefined, () => b.w8(1));
  b.close();
}

function opaqueRecord(b: B, cipher: number[], appProto: string) {
  b.open(
    `TLSv1.3 Record Layer: Application Data Protocol: ${appProto}`,
    'tls.record',
    undefined,
    'tls.record',
  );
  recordHead(b, 23, 0x0303, cipher.length, true);
  b.bytesField(
    'Encrypted Application Data',
    'tls.app_data',
    cipher,
    `${hexBytes(cipher.slice(0, 24))}…`,
  );
  b.gen(`Application Data Protocol: ${appProto}`, 'tls.app_data_proto', appProto);
  b.close();
}

/** The client's Change Cipher Spec and encrypted Finished. */
export function clientFinished(cipher: number[], appProto: string): Hello {
  const b = new B();
  b.open('Transport Layer Security', 'tls', undefined, 'tls');
  ccs(b);
  opaqueRecord(b, cipher, appProto);
  b.close();
  return { layer: b.layer(), info: 'Change Cipher Spec, Application Data' };
}

/** Encrypted application data with no keys to open it. */
export function opaqueData(cipher: number[], appProto: string): Hello {
  const b = new B();
  b.open('Transport Layer Security', 'tls', undefined, 'tls');
  opaqueRecord(b, cipher, appProto);
  b.close();
  return { layer: b.layer(), info: 'Application Data' };
}

export interface Segment {
  frame: number;
  len: number;
}

/**
 * An application-data record the key log opens. The frame carries ciphertext; source 1 is this
 * record's plaintext. On the record that completes a message, `segments` lists every record the
 * message spans and the reassembled message becomes source 2.
 */
export function appRecord(
  cipher: number[],
  plainLen: number,
  appProto: string,
  reassembledIn?: number,
  segments?: Segment[],
): Layer {
  const b = new B();
  b.open('Transport Layer Security', 'tls', undefined, 'tls');
  b.open(
    `TLSv1.3 Record Layer: Application Data Protocol: ${appProto}`,
    'tls.record',
    undefined,
    'tls.record',
  );
  recordHead(b, 23, 0x0303, cipher.length, true);
  b.bytesField(
    'Encrypted Application Data',
    'tls.app_data',
    cipher,
    `${hexBytes(cipher.slice(0, 24))}…`,
  );
  b.gen(`Application Data Protocol: ${appProto}`, 'tls.app_data_proto', appProto);
  b.close();
  b.close();
  const out = b.layer();
  if (reassembledIn !== undefined)
    out.tree.push({
      t: `[${appProto} segment data (${plainLen} bytes)]`,
      s: 1,
      o: 0,
      n: plainLen,
      k: [
        {
          t: `[Reassembled PDU in frame: ${reassembledIn}]`,
          f: 'tls.reassembled.in',
          v: reassembledIn,
          o: 0,
          n: 0,
          s: 1,
          go: reassembledIn,
        },
      ],
      e: 'tls.segment_data',
    });
  if (segments) {
    const total = segments.reduce((sum, x) => sum + x.len, 0);
    let at = 0;
    const kids: Node[] = segments.map((x) => {
      const node: Node = {
        t: `[Frame: ${x.frame}, payload: ${at}-${at + x.len - 1} (${x.len} bytes)]`,
        f: 'tls.segment',
        v: x.frame,
        s: 2,
        o: at,
        n: x.len,
        go: x.frame,
      };
      at += x.len;
      return node;
    });
    kids.push({
      t: `[Segment count: ${segments.length}]`,
      f: 'tls.segment.count',
      v: segments.length,
      s: 2,
      o: 0,
      n: 0,
    });
    kids.push({
      t: `[Reassembled TLS length: ${total}]`,
      f: 'tls.reassembled.length',
      v: total,
      s: 2,
      o: 0,
      n: 0,
    });
    out.tree.push({
      t: `[${segments.length} Reassembled TLS segments (${total} bytes): ${segments.map((x) => `#${x.frame}(${x.len})`).join(', ')}]`,
      f: 'tls.segments',
      s: 2,
      o: 0,
      n: total,
      k: kids,
      e: 'tls.segments',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ json */

const json1 = (v: unknown) => JSON.stringify(v);
const preview = (s: string, max = 240) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function primitiveText(v: unknown) {
  return typeof v === 'string' ? json1(v) : String(v);
}

function valueField(v: unknown): { f: string; val?: Val } {
  if (typeof v === 'string') return { f: 'json.value.string', val: v };
  if (typeof v === 'number') return { f: 'json.value.number', val: v };
  if (v === true) return { f: 'json.value.true' };
  if (v === false) return { f: 'json.value.false' };
  return { f: 'json.value.null' };
}

function summary(v: unknown): string {
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (v && typeof v === 'object') {
    const first = Object.entries(v).find(([, x]) => typeof x === 'string' || typeof x === 'number');
    return first ? `{${first[0]}: ${preview(primitiveText(first[1]), 48)}, …}` : '{…}';
  }
  return preview(primitiveText(v));
}

const isObj = (x: unknown): x is object => x !== null && typeof x === 'object';
const isUrl = (x: unknown) => (typeof x === 'string' && /^https?:\/\//.test(x) ? x : undefined);
const shownValue = (x: unknown) => (x === null ? 'null' : String(x));

/**
 * Writes `value` as JSON into `b` (pretty, two-space, or compact) and lays the tree over it in the
 * devtools-like compact form: members read `"key": value`, objects and arrays fold. Hidden key,
 * value and path fields sit under each member for the filter.
 */
export function json(b: B, value: unknown, pretty: boolean, contentType = 'application/json') {
  const start = b.pos;
  const top = b.open(`JavaScript Object Notation: ${contentType}`, 'json', undefined, 'json');
  const nl = (depth: number) => (pretty ? `\n${'  '.repeat(depth)}` : '');
  const sep = pretty ? ': ' : ':';

  const container = (v: object, depth: number, path: string) => {
    const isArr = Array.isArray(v);
    const entries: [string, unknown][] = isArr
      ? (v as unknown[]).map((x, i) => [String(i), x])
      : Object.entries(v);
    b.text(isArr ? '[' : '{');
    entries.forEach(([k, x], i) => {
      b.text(nl(depth + 1));
      const childPath = `${path}/${k}`;
      const o = b.pos;
      const keyText = json1(k);
      if (isObj(x)) {
        const label = isArr ? `[${k}]: ${summary(x)}` : `${keyText}: ${summary(x)}`;
        b.open(
          label,
          isArr ? (Array.isArray(x) ? 'json.array' : 'json.object') : 'json.member',
          isArr ? undefined : k,
          isArr ? 'json.item' : 'json.member',
        );
        if (!isArr) {
          b.text(keyText + sep);
          b.add({ t: `Key: ${k}`, f: 'json.key', v: k, o, n: keyText.length });
        }
        b.add({ t: `[Path: ${childPath}]`, f: 'json.path', v: childPath, o, n: 0 });
        container(x, depth + 1, childPath);
        b.close();
      } else {
        if (!isArr) b.text(keyText + sep);
        const vo = b.pos;
        b.text(json1(x));
        const { f, val } = valueField(x);
        const kind =
          f === 'json.value.string'
            ? 'String value'
            : f === 'json.value.number'
              ? 'Number value'
              : x === null
                ? 'Null value'
                : x
                  ? 'True value'
                  : 'False value';
        const node = isArr
          ? b.over(`[${k}]: ${preview(primitiveText(x))}`, f, val, vo, b.pos - vo, {
              url: isUrl(x),
            })
          : b.over(
              `${keyText}: ${preview(primitiveText(x))}`,
              'json.member_with_value',
              `${k}:${shownValue(x)}`,
              o,
              b.pos - o,
              { url: isUrl(x) },
            );
        const kids: Node[] = [
          { t: `[Path: ${childPath}]`, f: 'json.path', v: childPath, o, n: 0 },
          {
            t: '',
            f: 'json.path_with_value',
            v: `${childPath}:${shownValue(x)}`,
            o,
            n: b.pos - o,
            h: true,
          },
        ];
        if (!isArr)
          kids.unshift(
            { t: `${kind}: ${preview(shownValue(x))}`, f, v: val, o: vo, n: b.pos - vo },
            { t: `Key: ${k}`, f: 'json.key', v: k, o, n: keyText.length },
            { t: '', f: 'json.member', v: k, o, n: b.pos - o, h: true },
          );
        b.under(node, kids);
      }
      if (i < entries.length - 1) b.text(',');
    });
    if (entries.length) b.text(nl(depth));
    b.text(isArr ? ']' : '}');
  };

  if (isObj(value)) {
    const arr = Array.isArray(value);
    b.open(
      arr ? 'Array' : 'Object',
      arr ? 'json.array' : 'json.object',
      undefined,
      arr ? 'json.array' : 'json.object',
    );
    container(value, 0, '');
    b.close();
  } else {
    const o = b.pos;
    b.text(json1(value));
    const { f, val } = valueField(value);
    b.over(preview(primitiveText(value)), f, val, o, b.pos - o);
  }
  b.close();
  return { start, len: b.pos - start, node: top };
}

/* ------------------------------------------------------------------ http */

export interface HttpMsg {
  start: string;
  headers: [string, string][];
  body?: { json: unknown; pretty: boolean; type: string } | null;
}

const HEADER_FIELDS: Record<string, string> = {
  host: 'http.host',
  accept: 'http.accept',
  'accept-encoding': 'http.accept_encoding',
  connection: 'http.connection',
  'user-agent': 'http.user_agent',
  'content-type': 'http.content_type',
  date: 'http.date',
  location: 'http.location',
  'cache-control': 'http.cache_control',
};

export interface HttpMeta {
  request: boolean;
  scheme: string;
  host: string;
  uri: string;
  number: number;
  total: number;
  /** For a request: the response. For a response: the request. */
  link?: number;
  prev?: number;
  next?: number;
  time?: number;
}

/** The body bytes of a message, so a caller can learn Content-Length before writing headers. */
export function bodyBytes(body: HttpMsg['body']): number[] {
  if (!body) return [];
  const b = new B();
  json(b, body.json, body.pretty, body.type);
  return b.bytes;
}

/** Writes an HTTP/1.1 message (start line, headers, body) into `b`, with its dissection. */
export function http(b: B, msg: HttpMsg, meta: HttpMeta | null) {
  const node = b.open('Hypertext Transfer Protocol', 'http', undefined, 'http');
  const so = b.pos;
  b.text(`${msg.start}\r\n`);
  const line = b.over(
    `${msg.start}\\r\\n`,
    meta?.request === false ? 'http.response.line' : 'http.request.line',
    msg.start,
    so,
    b.pos - so,
    { e: 'http.start' },
  );
  const parts = msg.start.split(' ');
  if (meta?.request) {
    const [method, uri, version] = parts;
    line.f = undefined;
    line.k = [
      expert('chat', 'Sequence', `${msg.start}\\r\\n`, so, b.pos - so, b.src || undefined),
      {
        t: `Request Method: ${method}`,
        f: 'http.request.method',
        v: method,
        o: so,
        n: method.length,
      },
      {
        t: `Request URI: ${uri}`,
        f: 'http.request.uri',
        v: uri,
        o: so + method.length + 1,
        n: uri.length,
      },
      {
        t: `Request Version: ${version}`,
        f: 'http.request.version',
        v: version,
        o: so + method.length + uri.length + 2,
        n: version.length,
      },
      { t: '', f: 'http.request', v: true, o: so, n: 0, h: true },
    ];
  } else if (meta) {
    const [version, code] = parts;
    const phrase = parts.slice(2).join(' ');
    line.f = undefined;
    line.k = [
      expert('chat', 'Sequence', `${msg.start}\\r\\n`, so, b.pos - so, b.src || undefined),
      {
        t: `Response Version: ${version}`,
        f: 'http.response.version',
        v: version,
        o: so,
        n: version.length,
      },
      {
        t: `Status Code: ${code}`,
        f: 'http.response.code',
        v: Number(code),
        o: so + version.length + 1,
        n: code.length,
      },
      {
        t: `[Status Code Description: ${phrase}]`,
        f: 'http.response.code.desc',
        v: phrase,
        o: so,
        n: 0,
      },
      {
        t: `Response Phrase: ${phrase}`,
        f: 'http.response.phrase',
        v: phrase,
        o: so + version.length + code.length + 2,
        n: phrase.length,
      },
      { t: '', f: 'http.response', v: true, o: so, n: 0, h: true },
    ];
  }
  if (b.src) line.k?.forEach((n) => (n.s = b.src));
  for (const [name, value] of msg.headers) {
    const ho = b.pos;
    b.text(`${name}: ${value}\r\n`);
    const f = HEADER_FIELDS[name.toLowerCase()];
    const h = b.over(
      `${name}: ${value}\\r\\n`,
      f ?? (meta?.request === false ? 'http.response.line' : 'http.request.line'),
      value,
      ho,
      b.pos - ho,
    );
    if (name.toLowerCase() === 'content-length') {
      h.f = 'http.response.line';
      h.k = [
        {
          t: `[Content length: ${value}]`,
          f: 'http.content_length',
          v: Number(value),
          o: ho + name.length + 2,
          n: value.length,
          s: b.src || undefined,
        },
      ];
      h.e = 'http.content_length';
    }
    b.hide(
      meta?.request === false ? 'http.response.line' : 'http.request.line',
      `${name}: ${value}`,
      ho,
      b.pos - ho,
    );
  }
  const crlf = b.pos;
  b.text('\r\n');
  b.over('\\r\\n', undefined, undefined, crlf, 2);
  if (meta) {
    const full = `${meta.scheme}://${meta.host}${meta.uri}`;
    if (meta.request) {
      b.gen(`Full request URI: ${full}`, 'http.request.full_uri', full, { url: full });
      b.gen(`HTTP request ${meta.number}/${meta.total}`, 'http.request_number', meta.number);
      if (meta.prev !== undefined)
        b.gen(`Prev request in frame: ${meta.prev}`, 'http.prev_request_in', meta.prev, {
          go: meta.prev,
        });
      if (meta.link !== undefined)
        b.gen(`Response in frame: ${meta.link}`, 'http.response_in', meta.link, { go: meta.link });
      if (meta.next !== undefined)
        b.gen(`Next request in frame: ${meta.next}`, 'http.next_request_in', meta.next, {
          go: meta.next,
        });
    } else {
      b.gen(`HTTP response ${meta.number}/${meta.total}`);
      if (meta.time !== undefined)
        b.gen(`Time since request: ${secs(meta.time)}`, 'http.time', meta.time);
      if (meta.prev !== undefined)
        b.gen(`Prev request in frame: ${meta.prev}`, 'http.prev_request_in', meta.prev, {
          go: meta.prev,
        });
      if (meta.link !== undefined)
        b.gen(`Request in frame: ${meta.link}`, 'http.request_in', meta.link, { go: meta.link });
      if (meta.next !== undefined)
        b.gen(`Next request in frame: ${meta.next}`, 'http.next_request_in', meta.next, {
          go: meta.next,
        });
      b.gen(`Request URI: ${meta.uri}`, 'http.response_for.uri', meta.uri);
      b.gen(`Full request URI: ${full}`, 'http.request.full_uri', full, { url: full });
    }
  }
  let body: ReturnType<typeof json> | null = null;
  if (msg.body) {
    const bodyAt = b.pos;
    // The JSON tree is a sibling of HTTP: written by a second builder, then spliced in.
    const jb = new B(b.src);
    body = json(jb, msg.body.json, msg.body.pretty, msg.body.type);
    b.raw(jb.bytes);
    b.over(
      `File Data: ${jb.bytes.length} bytes`,
      'http.file_data',
      Uint8Array.from(jb.bytes),
      bodyAt,
      jb.bytes.length,
    );
    b.close();
    shift(jb.root, bodyAt, b.src);
    for (const n of jb.root) b.add(n);
  } else {
    b.close();
  }
  return { node, body };
}

/* ------------------------------------------------------------------ mqtt */

export type MqttMsg =
  | {
      type: 'connect';
      clientId: string;
      keepalive: number;
      will?: { topic: string; msg: string; qos: number; retain: boolean };
    }
  | { type: 'connack'; sp: boolean }
  | {
      type: 'publish';
      topic: string;
      qos: number;
      retain: boolean;
      msgid?: number;
      payload: unknown;
    }
  | { type: 'puback'; msgid: number }
  | { type: 'subscribe'; msgid: number; topic: string; qos: number }
  | { type: 'suback'; msgid: number; qos: number }
  | { type: 'pingreq' }
  | { type: 'pingresp' }
  | { type: 'disconnect' };

const MQTT_TYPES: Record<string, [number, string]> = {
  connect: [1, 'Connect Command'],
  connack: [2, 'Connect Ack'],
  publish: [3, 'Publish Message'],
  puback: [4, 'Publish Ack'],
  subscribe: [8, 'Subscribe Request'],
  suback: [9, 'Subscribe Ack'],
  pingreq: [12, 'Ping Request'],
  pingresp: [13, 'Ping Response'],
  disconnect: [14, 'Disconnect Req'],
};
const QOS = [
  'At most once delivery (Fire and Forget)',
  'At least once delivery (Acknowledged deliver)',
  'Exactly once delivery (Assured Delivery)',
];

const varint = (n: number) => {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    out.push(byte);
  } while (n > 0);
  return out;
};

export function mqtt(m: MqttMsg): { layer: Layer; info: string } {
  // Body first, to learn the remaining length.
  const body = new B();
  const strField = (label: string, lenF: string, f: string, s: string) => {
    body.u16(`${label} Length`, lenF, utf8(s).length);
    body.str(label, f, s);
  };
  let payloadJson: B | null = null;
  if (m.type === 'connect') {
    strField('Protocol Name', 'mqtt.proto_len', 'mqtt.protoname', 'MQTT');
    body.u8('Version', 'mqtt.ver', 4, 'MQTT v3.1.1 (4)');
    const w = m.will;
    const flags = (w ? (w.retain ? 0x20 : 0) | (w.qos << 3) | 0x04 : 0) | 0x02;
    const names = [
      w ? `QoS Level: ${QOS[w.qos]}` : null,
      w ? 'Will Flag' : null,
      'Clean Session Flag',
    ]
      .filter(Boolean)
      .join(', ');
    const fl = body.u8('Connect Flags', 'mqtt.conflags', flags, `${hex0x(flags)}, ${names}`);
    fl.e = 'mqtt.conflags';
    body.under(
      fl,
      bits(fl.o, 1, flags, 8, [
        { mask: 0x80, name: 'User Name Flag', f: 'mqtt.conflag.uname' },
        { mask: 0x40, name: 'Password Flag', f: 'mqtt.conflag.passwd' },
        { mask: 0x20, name: 'Will Retain', f: 'mqtt.conflag.retain' },
        { mask: 0x18, name: 'QoS Level', f: 'mqtt.conflag.qos', show: (v) => `${QOS[v]} (${v})` },
        { mask: 0x04, name: 'Will Flag', f: 'mqtt.conflag.willflag' },
        { mask: 0x02, name: 'Clean Session Flag', f: 'mqtt.conflag.cleansess' },
        { mask: 0x01, name: '(Reserved)', f: 'mqtt.conflag.reserved' },
      ]),
    );
    body.u16('Keep Alive', 'mqtt.kalive', m.keepalive);
    strField('Client ID', 'mqtt.clientid_len', 'mqtt.clientid', m.clientId);
    if (w) {
      strField('Will Topic', 'mqtt.willtopic_len', 'mqtt.willtopic', w.topic);
      body.u16('Will Message Length', 'mqtt.willmsg_len', w.msg.length);
      body.bytesField('Will Message', 'mqtt.willmsg', utf8(w.msg));
    }
  } else if (m.type === 'connack') {
    const fl = body.u8('Acknowledge Flags', 'mqtt.conack.flags', m.sp ? 1 : 0, hex0x(m.sp ? 1 : 0));
    body.under(
      fl,
      bits(fl.o, 1, m.sp ? 1 : 0, 8, [
        { mask: 0x01, name: 'Session Present', f: 'mqtt.conack.flags.sp' },
      ]),
    );
    body.u8('Return Code', 'mqtt.conack.val', 0, 'Connection Accepted (0)');
  } else if (m.type === 'publish') {
    strField('Topic', 'mqtt.topic_len', 'mqtt.topic', m.topic);
    if (m.qos) body.u16('Message Identifier', 'mqtt.msgid', m.msgid ?? 0);
    const jb = new B();
    json(jb, m.payload, false);
    body.bytesField('Message', 'mqtt.msg', jb.bytes, `${hexBytes(jb.bytes.slice(0, 24))}…`);
    payloadJson = jb;
  } else if (m.type === 'puback') {
    body.u16('Message Identifier', 'mqtt.msgid', m.msgid);
  } else if (m.type === 'subscribe') {
    body.u16('Message Identifier', 'mqtt.msgid', m.msgid);
    strField('Topic', 'mqtt.topic_len', 'mqtt.topic', m.topic);
    body.u8('Requested QoS', 'mqtt.sub.qos', m.qos, `${QOS[m.qos]} (${m.qos})`);
  } else if (m.type === 'suback') {
    body.u16('Message Identifier', 'mqtt.msgid', m.msgid);
    body.u8('Granted QoS', 'mqtt.sub.qos', m.qos, `${QOS[m.qos]} (${m.qos})`);
  }

  const [type, name] = MQTT_TYPES[m.type];
  const qos = m.type === 'publish' ? m.qos : m.type === 'subscribe' ? 1 : 0;
  const retain = m.type === 'publish' && m.retain;
  const hflags = (type << 4) | (qos << 1) | (retain ? 1 : 0);
  const b = new B();
  b.open(`MQ Telemetry Transport Protocol, ${name}`, 'mqtt', undefined, 'mqtt');
  const hf = b.u8(
    'Header Flags',
    'mqtt.hdrflags',
    hflags,
    `${hex0x(hflags)}, Message Type: ${name}${m.type === 'publish' ? `, QoS Level: ${QOS[qos]}${retain ? ', Retain' : ''}` : ''}`,
  );
  hf.e = 'mqtt.hdrflags';
  b.under(
    hf,
    bits(hf.o, 1, hflags, 8, [
      { mask: 0xf0, name: 'Message Type', f: 'mqtt.msgtype', show: (v) => `${name} (${v})` },
      { mask: 0x08, name: 'DUP Flag', f: 'mqtt.dupflag' },
      { mask: 0x06, name: 'QoS Level', f: 'mqtt.qos', show: (v) => `${QOS[v]} (${v})` },
      { mask: 0x01, name: 'Retain', f: 'mqtt.retain' },
    ]),
  );
  const len = varint(body.bytes.length);
  b.field(`Msg Len: ${body.bytes.length}`, 'mqtt.len', body.bytes.length, () => b.raw(len));
  const at = b.pos;
  b.raw(body.bytes);
  shift(body.root, at);
  for (const n of body.root) b.add(n);
  b.close();
  const out = b.layer();
  if (payloadJson) {
    const msgAt = out.bytes.length - payloadJson.bytes.length;
    shift(payloadJson.root, msgAt);
    out.tree.push(...payloadJson.root);
  }
  const info =
    m.type === 'publish'
      ? `${name}${m.qos ? ` (id=${m.msgid})` : ''} [${m.topic}]`
      : m.type === 'puback' || m.type === 'suback'
        ? `${name} (id=${m.msgid})`
        : m.type === 'subscribe'
          ? `${name} (id=${m.msgid}) [${m.topic}]`
          : name;
  return { layer: out, info };
}

/* ------------------------------------------------------------------ modbus */

export type ModbusPdu =
  | { fc: 3; req: true; ref: number; count: number }
  | { fc: 3; req: false; regs: number[] }
  | { fc: 6; req: boolean; ref: number; value: number }
  | { fc: 43; req: true }
  | { fc: 43; req: false; objects: [number, string][] };

const FC_NAME: Record<number, string> = {
  3: 'Read Holding Registers',
  6: 'Write Single Register',
  43: 'Encapsulated Interface Transport',
};
const OBJ_NAME = [
  'VendorName',
  'ProductCode',
  'MajorMinorRevision',
  'VendorUrl',
  'ProductName',
  'ModelName',
  'UserApplicationName',
];

export interface ModbusMeta {
  link?: number;
  time?: number;
  /** The register map's reading of a holding-register response. */
  epc?: { psp: number; ppv: number; fsp: number; fpv: number };
}

export function modbus(
  trans: number,
  unit: number,
  p: ModbusPdu,
  meta: ModbusMeta,
): { layer: Layer; info: string } {
  const body = new B();
  const fco = body.pos;
  body.w8(p.fc);
  body.over(
    `${bitStr(p.fc, 8, 0x7f)} = Function Code: ${FC_NAME[p.fc]} (${p.fc})`,
    'modbus.func_code',
    p.fc,
    fco,
    1,
  );
  if (meta.link !== undefined) {
    if (p.req) body.gen(`Response In: ${meta.link}`, undefined, undefined, { go: meta.link });
    else
      body.gen(`Request Frame: ${meta.link}`, 'modbus.request_frame', meta.link, { go: meta.link });
  }
  if (!p.req && meta.time !== undefined)
    body.gen(`Time from request: ${secs(meta.time)}`, 'modbus.response_time', meta.time);
  if (p.fc === 3 && p.req) {
    body.u16('Reference Number', 'modbus.reference_num', p.ref);
    body.u16('Word Count', 'modbus.word_cnt', p.count);
  } else if (p.fc === 3) {
    body.u8('Byte Count', 'modbus.byte_cnt', p.regs.length * 2);
    p.regs.forEach((v, i) => {
      const o = body.pos;
      body.w16(v);
      body.over(`Register ${i} (UINT16): ${v}`, undefined, undefined, o, 2, {
        e: 'modbus.register',
        k: [
          { t: `Register Number: ${i}`, f: 'modbus.regnum16', v: i, o, n: 0 },
          { t: `Register Value (UINT16): ${v}`, f: 'modbus.regval_uint16', v, o, n: 2 },
        ],
      });
    });
  } else if (p.fc === 6) {
    body.u16('Reference Number', 'modbus.reference_num', p.ref);
    body.u16('Data', 'modbus.regval_uint16', p.value);
  } else if (p.fc === 43 && p.req) {
    body.u8('MEI type', 'modbus.mei', 14, 'Read Device Identification (14)');
    body.u8('Read Device ID', 'modbus.read_device_id', 2, 'Regular Device Identification (2)');
    body.u8('Object ID', 'modbus.object_id', 0, 'VendorName (0)');
  } else if (p.fc === 43) {
    body.u8('MEI type', 'modbus.mei', 14, 'Read Device Identification (14)');
    body.u8('Read Device ID', 'modbus.read_device_id', 2, 'Regular Device Identification (2)');
    body.u8(
      'Conformity Level',
      'modbus.conformity_level',
      0x82,
      '0x82 (Regular Device Identification, individual access)',
    );
    body.u8('More Follows', 'modbus.more_follows', 0, 'No (0)');
    body.u8('Next Object ID', 'modbus.next_object_id', 0);
    body.u8('Number of Objects', 'modbus.num_objects', p.objects.length);
    for (const [id, value] of p.objects) {
      body.open(`Object: ${OBJ_NAME[id]}`, undefined, undefined, 'modbus.object');
      body.u8('Object ID', 'modbus.object_id', id, `${OBJ_NAME[id]} (${id})`);
      body.u8('Object length', 'modbus.list_object_len', utf8(value).length);
      body.str('Object String Value', 'modbus.object_str_value', value);
      body.close();
    }
  }

  const b = new B();
  b.open('Modbus/TCP', 'mbtcp', undefined, 'mbtcp');
  b.u16('Transaction Identifier', 'mbtcp.trans_id', trans);
  b.u16('Protocol Identifier', 'mbtcp.prot_id', 0);
  b.u16('Length', 'mbtcp.len', body.bytes.length + 1);
  b.u8('Unit Identifier', 'mbtcp.unit_id', unit);
  b.close();
  const at = b.pos;
  b.raw(body.bytes);
  shift(body.root, at);
  b.add({ t: 'Modbus', f: 'modbus', o: at, n: body.bytes.length, k: body.root, e: 'modbus' });
  if (meta.epc && p.fc === 3 && !p.req) {
    const { psp, ppv, fsp, fpv } = meta.epc;
    const err = ((ppv - psp) / psp) * 100;
    const r = at + 2;
    b.add({
      t: 'EPC register map',
      f: 'epc',
      o: r,
      n: 8,
      e: 'epc',
      k: [
        { t: `Pressure setpoint: ${psp.toFixed(2)} bar`, f: 'epc.pressure.sp', v: psp, o: r, n: 2 },
        { t: `Pressure: ${ppv.toFixed(2)} bar`, f: 'epc.pressure.pv', v: ppv, o: r + 2, n: 2 },
        {
          t: `[Pressure error: ${err >= 0 ? '+' : '−'}${Math.abs(err).toFixed(1)} %]`,
          f: 'epc.pressure.error',
          v: err,
          o: r + 2,
          n: 0,
        },
        { t: `Flow setpoint: ${fsp.toFixed(1)} L/min`, f: 'epc.flow.sp', v: fsp, o: r + 4, n: 2 },
        { t: `Flow: ${fpv.toFixed(1)} L/min`, f: 'epc.flow.pv', v: fpv, o: r + 6, n: 2 },
      ],
    });
  }
  const info = `${p.req ? 'Query' : 'Response'}: Trans: ${String(trans).padStart(5)}; Unit: ${String(unit).padStart(3)}, Func: ${String(p.fc).padStart(3)}: ${FC_NAME[p.fc]}`;
  return { layer: b.layer(), info };
}

/* ------------------------------------------------------------------ bluetooth low energy */

export const ADV_AA = 0x8e89bed6;

export interface BleRf {
  rf: number;
  signal: number;
  noise: number;
  aa: number;
  crcInit: number;
  src: Mac;
  dst: Mac;
}

export interface AdEntry {
  type: number;
  data: number[];
}

export type BlePdu =
  | { kind: 'adv'; type: 0 | 2 | 4; adv: Mac; ad: AdEntry[] }
  | { kind: 'scan_req'; scanner: Mac; adv: Mac; scannerRandom: boolean }
  | {
      kind: 'connect';
      init: Mac;
      adv: Mac;
      ll: {
        aa: number;
        crcInit: number;
        win: number;
        offset: number;
        interval: number;
        latency: number;
        timeout: number;
        chmap: number[];
        hop: number;
        sca: number;
      };
    }
  | {
      kind: 'data';
      llid: 1 | 2 | 3;
      nesn: number;
      sn: number;
      md: boolean;
      central: boolean;
      payload: number[];
      att?: AttPdu;
      control?: number;
      event: number;
      channel: number;
    };

export type AttPdu =
  | { op: 0x02 | 0x03; mtu: number }
  | { op: 0x10; start: number; end: number; uuid: number }
  | { op: 0x11; size: number; items: { start: number; end: number; uuid: number | number[] }[] }
  | { op: 0x01; reqOp: number; handle: number; error: number }
  | { op: 0x0a; handle: number }
  | { op: 0x0b; handle: number; value: number[] }
  | { op: 0x12 | 0x52 | 0x1b; handle: number; value: number[] }
  | { op: 0x13; handle: number };

const PDU_NAME: Record<number, string> = {
  0: 'ADV_IND',
  2: 'ADV_NONCONN_IND',
  3: 'SCAN_REQ',
  4: 'SCAN_RSP',
  5: 'CONNECT_IND',
};
const AD_NAME: Record<number, string> = {
  0x01: 'Flags',
  0x09: 'Device Name',
  0x0a: 'Tx Power Level',
  0xff: 'Manufacturer Specific',
};
const ATT_NAME: Record<number, string> = {
  0x01: 'Error Response',
  0x02: 'Exchange MTU Request',
  0x03: 'Exchange MTU Response',
  0x0a: 'Read Request',
  0x0b: 'Read Response',
  0x10: 'Read By Group Type Request',
  0x11: 'Read By Group Type Response',
  0x12: 'Write Request',
  0x13: 'Write Response',
  0x1b: 'Handle Value Notification',
  0x52: 'Write Command',
};
const UUID16: Record<number, string> = {
  0x1800: 'Generic Access Profile',
  0x180a: 'Device Information',
  0x2800: 'GATT Primary Service Declaration',
  0x2a00: 'Device Name',
  0x2a24: 'Model Number String',
  0x2902: 'Client Characteristic Configuration',
};

/** What each handle on the beacon is, for the "Handle: 0x0003 (Generic Access Profile: Device Name)" labels. */
export const HANDLES: Record<number, [string, string]> = {
  0x0003: ['Generic Access Profile', 'Device Name'],
  0x0008: ['Device Information', 'Model Number String'],
  0x000c: ['Unknown', 'Unknown'],
  0x000e: ['Unknown', 'Unknown'],
  0x000f: ['Unknown', 'Unknown: Client Characteristic Configuration'],
  0x0011: ['Unknown', 'Unknown'],
};
const handleText = (h: number) =>
  `${hex0x(h, 4)} (${HANDLES[h] ? HANDLES[h].join(': ') : 'Unknown'})`;

const rfText = (rf: number) => {
  const mhz = 2402 + rf * 2;
  if (rf === 0) return `${rf} (${mhz} MHz - Advertising - 37)`;
  if (rf === 12) return `${rf} (${mhz} MHz - Advertising - 38)`;
  if (rf === 39) return `${rf} (${mhz} MHz - Advertising - 39)`;
  return `${rf} (${mhz} MHz - Data - ${rf < 12 ? rf - 1 : rf - 2})`;
};

/** A BLE data-channel index (0–36) on its RF channel. */
export const dataRf = (ch: number) => (ch <= 10 ? ch + 1 : ch + 2);

const addrBytes = (m: Mac) => [...m.b].reverse();

function attBytes(a: AttPdu): number[] {
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
  switch (a.op) {
    case 0x02:
    case 0x03:
      return [a.op, ...u16(a.mtu)];
    case 0x10:
      return [a.op, ...u16(a.start), ...u16(a.end), ...u16(a.uuid)];
    case 0x11:
      return [
        a.op,
        a.size,
        ...a.items.flatMap((i) => [
          ...u16(i.start),
          ...u16(i.end),
          ...(typeof i.uuid === 'number' ? u16(i.uuid) : i.uuid),
        ]),
      ];
    case 0x01:
      return [a.op, a.reqOp, ...u16(a.handle), a.error];
    case 0x0a:
    case 0x13:
      return [a.op, ...u16(a.handle)];
    default:
      return [a.op, ...u16(a.handle), ...a.value];
  }
}

export const attPayload = (a: AttPdu) => {
  const att = attBytes(a);
  return [att.length & 255, att.length >>> 8, 4, 0, ...att];
};

const uuid128Text = (u: number[]) => {
  const h = hexBytes([...u].reverse());
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

function attTree(b: B, a: AttPdu, central: boolean): string {
  const name = ATT_NAME[a.op];
  b.open('Bluetooth Attribute Protocol', 'btatt', undefined, 'btatt');
  const oo = b.pos;
  b.w8(a.op);
  const opNode = b.over(`Opcode: ${name} (${hex0x(a.op)})`, 'btatt.opcode', a.op, oo, 1, {
    e: 'btatt.opcode',
  });
  b.under(
    opNode,
    bits(oo, 1, a.op, 8, [
      {
        mask: 0x80,
        name: 'Authentication Signature',
        f: 'btatt.opcode.authentication_signature',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x40,
        name: 'Command',
        f: 'btatt.opcode.command',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x3f,
        name: 'Method',
        f: 'btatt.opcode.method',
        show: (v) => `${ATT_NAME[a.op]} (${hex0x(v)})`,
      },
    ]),
  );
  const dir = central ? 'Sent' : 'Rcvd';
  let info = `${dir} ${name}`;
  switch (a.op) {
    case 0x02:
      b.u16le('Client Rx MTU', 'btatt.client_rx_mtu', a.mtu);
      info += `, Client Rx MTU: ${a.mtu}`;
      break;
    case 0x03:
      b.u16le('Server Rx MTU', 'btatt.server_rx_mtu', a.mtu);
      info += `, Server Rx MTU: ${a.mtu}`;
      break;
    case 0x10:
      b.u16le('Starting Handle', 'btatt.starting_handle', a.start, hex0x(a.start, 4));
      b.u16le('Ending Handle', 'btatt.ending_handle', a.end, hex0x(a.end, 4));
      b.u16le('UUID', 'btatt.uuid16', a.uuid, `${UUID16[a.uuid]} (${hex0x(a.uuid, 4)})`);
      info += `, ${UUID16[a.uuid]}, Handles: ${hex0x(a.start, 4)}..${hex0x(a.end, 4)}`;
      break;
    case 0x11: {
      b.u8('Length', 'btatt.length', a.size);
      b.open('Attribute Data List', undefined, undefined, 'btatt.list');
      const names: string[] = [];
      for (const it of a.items) {
        const svc =
          typeof it.uuid === 'number' ? UUID16[it.uuid] : `Unknown (${uuid128Text(it.uuid)})`;
        names.push(typeof it.uuid === 'number' ? UUID16[it.uuid] : 'Unknown');
        b.open(
          `Attribute Data, Handle: ${hex0x(it.start, 4)}, Group End Handle: ${hex0x(it.end, 4)}, UUID: ${svc}`,
          'btatt.attribute_data',
          undefined,
          'btatt.attribute_data',
        );
        b.u16le(
          'Handle',
          'btatt.handle',
          it.start,
          `${hex0x(it.start, 4)} (${typeof it.uuid === 'number' ? UUID16[it.uuid] : 'Unknown'})`,
        );
        b.u16le('Group End Handle', 'btatt.ending_handle', it.end, hex0x(it.end, 4));
        if (typeof it.uuid === 'number')
          b.u16le(
            'UUID',
            'btatt.service_uuid16',
            it.uuid,
            `${UUID16[it.uuid]} (${hex0x(it.uuid, 4)})`,
          );
        else b.bytesField('UUID', 'btatt.uuid128', it.uuid, uuid128Text(it.uuid));
        b.close();
      }
      b.close();
      info += `, Attribute List Length: ${a.items.length}, ${names.join(', ')}`;
      break;
    }
    case 0x01:
      b.u8(
        'Request Opcode in Error',
        'btatt.req_opcode_in_error',
        a.reqOp,
        `${ATT_NAME[a.reqOp]} (${hex0x(a.reqOp)})`,
      );
      b.u16le('Handle in Error', 'btatt.handle', a.handle, `${hex0x(a.handle, 4)} (Unknown)`);
      b.u8('Error Code', 'btatt.error_code', a.error, `Attribute Not Found (${hex0x(a.error)})`);
      info = `${dir} Error Response - Attribute Not Found, Handle: ${hex0x(a.handle, 4)} (Unknown)`;
      break;
    case 0x0a:
    case 0x13:
      b.u16le('Handle', 'btatt.handle', a.handle, handleText(a.handle));
      info += `, Handle: ${handleText(a.handle)}`;
      break;
    default: {
      b.u16le('Handle', 'btatt.handle', a.handle, handleText(a.handle));
      const v = a.value;
      const text = String.fromCharCode(...v);
      const printable = v.length > 2 && v.every((c) => c >= 32 && c < 127);
      if (a.op === 0x0b && a.handle === 0x0003) b.str('Device Name', 'btatt.device_name', text);
      else if (a.op === 0x0b && a.handle === 0x0008)
        b.str('Model Number String', 'btatt.model_number_string', text);
      else
        b.bytesField(
          'Value',
          'btatt.value',
          v,
          printable
            ? `${hexBytes(v.slice(0, 32))}${v.length > 32 ? '…' : ''}`
            : hexBytes(v.slice(0, 32)) + (v.length > 32 ? '…' : ''),
        );
      info += `, Handle: ${handleText(a.handle)}`;
    }
  }
  b.close();
  return info;
}

/**
 * A BLE frame as a sniffer records it: the RF pseudo-header, the link-layer PDU, and the
 * CRC-24 the radio computes over it. Addresses go over the air least significant byte first.
 */
export function ble(rf: BleRf, p: BlePdu): { layer: Layer; info: string; proto: string } {
  const b = new B();
  b.open('Bluetooth', 'bluetooth', undefined, 'bluetooth');
  b.gen(`Source: ${macFull(rf.src)}`, 'bluetooth.src', Uint8Array.from(rf.src.b));
  b.gen(`Destination: ${macFull(rf.dst)}`, 'bluetooth.dst', Uint8Array.from(rf.dst.b));
  b.close();

  b.open('Bluetooth Low Energy RF Info', 'btle_rf', undefined, 'btle_rf');
  b.u8('RF Channel', 'btle_rf.channel', rf.rf, rfText(rf.rf));
  b.field(`Signal dBm: ${rf.signal}`, 'btle_rf.signal_dbm', rf.signal, () => b.w8(rf.signal & 255));
  b.field(`Noise dBm: ${rf.noise}`, 'btle_rf.noise_dbm', rf.noise, () => b.w8(rf.noise & 255));
  b.u8('Access Address Offenses', 'btle_rf.access_address_offenses', 0);
  b.field(
    `Reference Access Address: ${hex0x(rf.aa, 8)}`,
    'btle_rf.reference_access_address',
    rf.aa,
    () => b.w32le(rf.aa),
  );
  const flags = 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0400 | 0x0800;
  const fl = b.field(`Flags: ${hex0x(flags, 4)}`, 'btle_rf.flags', flags, () => b.w16le(flags), {
    e: 'btle_rf.flags',
  });
  b.under(
    fl,
    bits(fl.o, 2, flags, 16, [
      {
        mask: 0x0001,
        name: 'Dewhitened',
        f: 'btle_rf.flags.dewhitened',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x0002,
        name: 'Signal Power Valid',
        f: 'btle_rf.flags.signal_power_valid',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x0004,
        name: 'Noise Power Valid',
        f: 'btle_rf.flags.noise_power_valid',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x0008,
        name: 'Decrypted',
        f: 'btle_rf.flags.decrypted',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x0010,
        name: 'Reference Access Address Valid',
        f: 'btle_rf.flags.reference_access_address_valid',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x0020,
        name: 'Access Address Offenses Valid',
        f: 'btle_rf.flags.access_address_offenses_valid',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x0040,
        name: 'Channel Aliased',
        f: 'btle_rf.flags.channel_aliased',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x0400,
        name: 'CRC Checked',
        f: 'btle_rf.flags.crc_checked',
        show: (v) => (v ? 'True' : 'False'),
      },
      {
        mask: 0x0800,
        name: 'CRC Valid',
        f: 'btle_rf.flags.crc_valid',
        show: (v) => (v ? 'True' : 'False'),
      },
    ]),
  );
  b.close();

  const llStart = b.pos;
  b.open('Bluetooth Low Energy Link Layer', 'btle', undefined, 'btle');
  b.field(`Access Address: ${hex0x(rf.aa, 8)}`, 'btle.access_address', rf.aa, () => b.w32le(rf.aa));
  const pduStart = b.pos;
  let info = '';
  let proto = 'LE LL';

  const advHeader = (type: number, tx: boolean, rx: boolean, len: number, chsel: boolean) => {
    const h0 = type | (chsel ? 0x20 : 0) | (tx ? 0x40 : 0) | (rx ? 0x80 : 0);
    const o = b.pos;
    b.w8(h0);
    b.w8(len);
    const parts = [
      `PDU Type: ${PDU_NAME[type]}`,
      chsel ? 'ChSel: #2' : null,
      `TxAdd: ${tx ? 'Random' : 'Public'}`,
      type === 3 || type === 5 ? `RxAdd: ${rx ? 'Random' : 'Public'}` : null,
    ].filter(Boolean);
    const node = b.over(
      `Packet Header: ${hex0x(h0 | (len << 8), 4)} (${parts.join(', ')})`,
      'btle.advertising_header',
      h0 | (len << 8),
      o,
      2,
      { e: 'btle.advertising_header' },
    );
    b.under(node, [
      ...bits(o, 1, h0, 8, [
        {
          mask: 0x0f,
          name: 'PDU Type',
          f: 'btle.advertising_header.pdu_type',
          show: (v) => `${hex0x(v, 1)} ${PDU_NAME[v]}`,
        },
        { mask: 0x10, name: 'Reserved', show: (v) => String(v) },
        {
          mask: 0x20,
          name: 'Channel Selection Algorithm',
          f: 'btle.advertising_header.ch_sel',
          show: (v) => (v ? '#2' : '#1'),
        },
        {
          mask: 0x40,
          name: 'Tx Address',
          f: 'btle.advertising_header.randomized_tx',
          show: (v) => (v ? 'Random' : 'Public'),
        },
        {
          mask: 0x80,
          name: 'Rx Address',
          f: 'btle.advertising_header.randomized_rx',
          show: (v) => (v ? 'Random' : 'Public'),
        },
      ]),
      { t: `Length: ${len}`, f: 'btle.length', v: len, o: o + 1, n: 1 },
    ]);
  };
  const addr = (label: string, f: string, m: Mac) =>
    b.field(`${label}: ${macFull(m)}`, f, Uint8Array.from(m.b), () => b.raw(addrBytes(m)));
  const isRandom = (m: Mac) => (m.b[0] & 0xc0) !== 0;

  if (p.kind === 'adv') {
    const adLen = p.ad.reduce((s, e) => s + e.data.length + 2, 0);
    advHeader(p.type, isRandom(p.adv), false, 6 + adLen, p.type === 0);
    addr('Advertising Address', 'btle.advertising_address', p.adv);
    b.open(
      p.type === 4 ? 'Scan Response Data' : 'Advertising Data',
      'btcommon.eir_ad.advertising_data',
      undefined,
      'btcommon.eir_ad',
    );
    for (const e of p.ad) {
      b.open(
        AD_NAME[e.type],
        'btcommon.eir_ad.entry',
        undefined,
        `btcommon.eir_ad.entry.${e.type}`,
      );
      b.u8('Length', 'btcommon.eir_ad.entry.length', e.data.length + 1);
      b.u8('Type', 'btcommon.eir_ad.entry.type', e.type, `${AD_NAME[e.type]} (${hex0x(e.type)})`);
      if (e.type === 0x01) {
        const o = b.pos;
        b.raw(e.data);
        const v = e.data[0];
        b.under(
          b.over(`Flags: ${hex0x(v)}`, undefined, undefined, o, 1),
          bits(o, 1, v, 8, [
            { mask: 0xe0, name: 'Reserved', show: (x) => hex0x(x, 1) },
            {
              mask: 0x10,
              name: 'Simultaneous LE and BR/EDR to Same Device Capable (Host)',
              show: (x) => `${x ? 'true' : 'false'} (${hex0x(x, 1)})`,
            },
            {
              mask: 0x08,
              name: 'Simultaneous LE and BR/EDR to Same Device Capable (Controller)',
              show: (x) => `${x ? 'true' : 'false'} (${hex0x(x, 1)})`,
            },
            {
              mask: 0x04,
              name: 'BR/EDR Not Supported',
              f: 'btcommon.eir_ad.entry.flags.bredr_not_supported',
              show: (x) => `${x ? 'true' : 'false'} (${hex0x(x, 1)})`,
            },
            {
              mask: 0x02,
              name: 'LE General Discoverable Mode',
              f: 'btcommon.eir_ad.entry.flags.le_general_discoverable_mode',
              show: (x) => `${x ? 'true' : 'false'} (${hex0x(x, 1)})`,
            },
            {
              mask: 0x01,
              name: 'LE Limited Discoverable Mode',
              show: (x) => `${x ? 'true' : 'false'} (${hex0x(x, 1)})`,
            },
          ]),
        );
      } else if (e.type === 0x09) {
        b.str('Device Name', 'btcommon.eir_ad.entry.device_name', String.fromCharCode(...e.data));
      } else if (e.type === 0x0a) {
        const v = e.data[0] > 127 ? e.data[0] - 256 : e.data[0];
        b.field(`Power Level (dBm): ${v}`, 'btcommon.eir_ad.entry.power_level', v, () =>
          b.raw(e.data),
        );
      } else {
        const cid = e.data[0] | (e.data[1] << 8);
        b.field(
          `Company ID: For use in internal and interoperability tests (${hex0x(cid, 4)})`,
          'btcommon.eir_ad.entry.company_id',
          cid,
          () => b.raw(e.data.slice(0, 2)),
        );
        b.bytesField('Data', 'btcommon.eir_ad.entry.data', e.data.slice(2));
      }
      b.close();
    }
    b.close();
    info = PDU_NAME[p.type];
  } else if (p.kind === 'scan_req') {
    advHeader(3, p.scannerRandom, isRandom(p.adv), 12, false);
    addr('Scanning Address', 'btle.scanning_address', p.scanner);
    addr('Advertising Address', 'btle.advertising_address', p.adv);
    info = 'SCAN_REQ';
  } else if (p.kind === 'connect') {
    advHeader(5, isRandom(p.init), isRandom(p.adv), 34, false);
    addr('Initiator Address', 'btle.initiator_address', p.init);
    addr('Advertising Address', 'btle.advertising_address', p.adv);
    const l = p.ll;
    b.open('Link Layer Data', 'btle.link_layer_data', undefined, 'btle.link_layer_data');
    b.field(`Access Address: ${hex0x(l.aa, 8)}`, 'btle.link_layer_data.access_address', l.aa, () =>
      b.w32le(l.aa),
    );
    b.field(`CRC Init: ${hex0x(l.crcInit, 6)}`, 'btle.link_layer_data.crc_init', l.crcInit, () =>
      b.w24le(l.crcInit),
    );
    b.u8(
      'Window Size',
      'btle.link_layer_data.window_size',
      l.win,
      `${l.win} (${(l.win * 1.25).toFixed(2)} msec)`,
    );
    b.u16le(
      'Window Offset',
      'btle.link_layer_data.window_offset',
      l.offset,
      `${l.offset} (${(l.offset * 1.25).toFixed(2)} msec)`,
    );
    b.u16le(
      'Interval',
      'btle.link_layer_data.interval',
      l.interval,
      `${l.interval} (${(l.interval * 1.25).toFixed(2)} msec)`,
    );
    b.u16le('Latency', 'btle.link_layer_data.latency', l.latency);
    b.u16le(
      'Timeout',
      'btle.link_layer_data.timeout',
      l.timeout,
      `${l.timeout} (${l.timeout * 10} msec)`,
    );
    b.bytesField('Channel Map', 'btle.link_layer_data.channel_map', l.chmap);
    const hs = l.hop | (l.sca << 5);
    const ho = b.pos;
    b.w8(hs);
    b.over(`${bitStr(hs, 8, 0x1f)} = Hop: ${l.hop}`, 'btle.link_layer_data.hop', l.hop, ho, 1);
    b.over(
      `${bitStr(hs, 8, 0xe0)} = Sleep Clock Accuracy: 151 ppm to 250 ppm (${l.sca})`,
      'btle.link_layer_data.sleep_clock_accuracy',
      l.sca,
      ho,
      1,
    );
    b.close();
    info = 'CONNECT_IND';
  } else {
    const h0 = p.llid | (p.nesn << 2) | (p.sn << 3) | (p.md ? 0x10 : 0);
    const o = b.pos;
    b.w8(h0);
    b.w8(p.payload.length);
    const node = b.over(
      `Data Header: ${hex0x(h0 | (p.payload.length << 8), 4)}`,
      'btle.data_header',
      h0 | (p.payload.length << 8),
      o,
      2,
      { e: 'btle.data_header' },
    );
    const llidName = [
      'Reserved',
      'Continuation fragment of an L2CAP message, or an Empty PDU',
      'Start of an L2CAP message or a complete L2CAP message with no fragmentation',
      'Control PDU',
    ][p.llid];
    b.under(node, [
      ...bits(o, 1, h0, 8, [
        {
          mask: 0x03,
          name: 'LLID',
          f: 'btle.data_header.llid',
          show: (v) => `${llidName} (${hex0x(v, 1)})`,
        },
        {
          mask: 0x04,
          name: 'Next Expected Sequence Number',
          f: 'btle.data_header.next_expected_sequence_number',
          show: (v) => String(v),
        },
        {
          mask: 0x08,
          name: 'Sequence Number',
          f: 'btle.data_header.sequence_number',
          show: (v) => String(v),
        },
        {
          mask: 0x10,
          name: 'More Data',
          f: 'btle.data_header.more_data',
          show: (v) => (v ? 'True' : 'False'),
        },
      ]),
      { t: `Length: ${p.payload.length}`, f: 'btle.length', v: p.payload.length, o: o + 1, n: 1 },
    ]);
    b.gen(
      `${p.central ? 'Central' : 'Peripheral'} Address: ${macFull(p.central ? rf.src : rf.dst)}`,
      p.central ? 'btle.central_bd_addr' : 'btle.peripheral_bd_addr',
      Uint8Array.from((p.central ? rf.src : rf.dst).b),
    );
    b.gen(`Connection Event Counter: ${p.event}`, 'btle.event_counter', p.event);
    b.gen(`Data Channel Index: ${p.channel}`, 'btle.data_channel', p.channel);
    if (p.llid === 3) {
      b.u8('Control Opcode', 'btle.control_opcode', p.control ?? 0, 'LL_TERMINATE_IND (0x02)');
      b.u8(
        'Error Code',
        'btle.control.error_code',
        p.payload[1],
        'Remote User Terminated Connection (0x13)',
      );
      info = 'Control Opcode: LL_TERMINATE_IND';
    } else if (!p.payload.length) {
      info = 'Empty PDU';
    }
  }
  // L2CAP and ATT are siblings of the link layer in the tree, though their bytes sit inside it,
  // before the CRC.
  const ll = b.close();
  if (p.kind === 'data' && p.att) {
    b.open('Bluetooth L2CAP Protocol', 'btl2cap', undefined, 'btl2cap');
    b.u16le('Length', 'btl2cap.length', p.payload.length - 4);
    b.u16le('CID', 'btl2cap.cid', 4, 'Attribute Protocol (0x0004)');
    b.close();
    info = attTree(b, p.att, p.central);
    proto = 'ATT';
  }
  const crcAt = b.pos;
  const crc = bleCrc(b.bytes.slice(pduStart), rf.crcInit);
  b.w24le(crc);
  (ll.k ??= []).push({ t: `CRC: ${hex0x(crc, 6)}`, f: 'btle.crc', v: crc, o: crcAt, n: 3 });
  ll.n = b.pos - llStart;
  return { layer: b.layer(), info, proto };
}
