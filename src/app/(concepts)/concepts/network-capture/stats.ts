// Statistics computed from the packets themselves: the protocol hierarchy, conversations and
// endpoints, expert information, and the stream reassembly behind Follow.

import { fieldsOf } from './filter';
import { lookup } from './fields';
import { hexBytes, ip4, mac, type Severity } from './net';
import { NAMES, type Packet } from './trace';

/* ------------------------------------------------------------------ protocol hierarchy */

export interface Phs {
  proto: string;
  name: string;
  packets: number;
  bytes: number;
  endPackets: number;
  endBytes: number;
  kids: Phs[];
}

export function hierarchy(packets: Packet[]): Phs {
  const root: Phs = {
    proto: 'frame',
    name: 'Frame',
    packets: 0,
    bytes: 0,
    endPackets: 0,
    endBytes: 0,
    kids: [],
  };
  for (const p of packets) {
    const sizes = new Map<string, number>();
    for (const n of p.tree) if (n.f && !sizes.has(n.f)) sizes.set(n.f, n.n);
    root.packets++;
    root.bytes += p.len;
    let at = root;
    for (const proto of p.protos.slice(1)) {
      let kid = at.kids.find((k) => k.proto === proto);
      if (!kid) {
        kid = {
          proto,
          name: lookup(proto)?.name ?? proto,
          packets: 0,
          bytes: 0,
          endPackets: 0,
          endBytes: 0,
          kids: [],
        };
        at.kids.push(kid);
      }
      kid.packets++;
      kid.bytes += sizes.get(proto) ?? 0;
      at = kid;
    }
    at.endPackets++;
    at.endBytes += sizes.get(at.proto) ?? p.len;
  }
  return root;
}

/* ------------------------------------------------------------------ conversations and endpoints */

export type ConvKind = 'eth' | 'ip' | 'tcp' | 'udp' | 'ble';

export interface Conversation {
  a: string;
  b: string;
  aName?: string;
  bName?: string;
  portA?: number;
  portB?: number;
  stream?: number;
  packets: number;
  bytes: number;
  ab: [number, number];
  ba: [number, number];
  start: number;
  end: number;
  filter: string;
}

const named = (addr: string, name?: string) => ({
  addr,
  name: name && name !== addr ? name : undefined,
});

function addrsOf(
  p: Packet,
  kind: ConvKind,
): [ReturnType<typeof named>, ReturnType<typeof named>] | null {
  const f = fieldsOf(p);
  if (kind === 'eth' || kind === 'ble') {
    const [s, d] = kind === 'eth' ? ['eth.src', 'eth.dst'] : ['bluetooth.src', 'bluetooth.dst'];
    const sv = f.get(s)?.[0]?.v;
    const dv = f.get(d)?.[0]?.v;
    if (!(sv instanceof Uint8Array) || !(dv instanceof Uint8Array)) return null;
    const sn =
      kind === 'eth' ? (f.get('eth.src_resolved')?.[0]?.v as string | undefined) : p.src.name;
    const dn =
      kind === 'eth' ? (f.get('eth.dst_resolved')?.[0]?.v as string | undefined) : p.dst.name;
    return [named(mac(sv), sn), named(mac(dv), dn)];
  }
  const sv = f.get('ip.src')?.[0]?.v;
  const dv = f.get('ip.dst')?.[0]?.v;
  if (typeof sv !== 'number' || typeof dv !== 'number') return null;
  return [named(ip4(sv), NAMES.get(sv)), named(ip4(dv), NAMES.get(dv))];
}

export function conversations(packets: Packet[], kind: ConvKind): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const p of packets) {
    if (kind === 'tcp' && p.tcp === undefined) continue;
    if (kind === 'udp' && p.udp === undefined) continue;
    const ends = addrsOf(p, kind === 'tcp' || kind === 'udp' ? 'ip' : kind);
    if (!ends) continue;
    let [s, d] = ends;
    let sp = p.sport;
    let dp = p.dport;
    let key: string;
    let forward: boolean;
    if (kind === 'tcp' || kind === 'udp') {
      key = `${kind}${kind === 'tcp' ? p.tcp : p.udp}`;
      forward = p.dir !== 1;
      if (!forward) {
        [s, d] = [d, s];
        [sp, dp] = [dp, sp];
      }
    } else {
      forward = s.addr <= d.addr;
      key = forward ? `${s.addr}|${d.addr}` : `${d.addr}|${s.addr}`;
      if (!forward) [s, d] = [d, s];
    }
    let c = map.get(key);
    if (!c) {
      const stream = kind === 'tcp' ? p.tcp : kind === 'udp' ? p.udp : undefined;
      const filter =
        kind === 'tcp'
          ? `tcp.stream eq ${stream}`
          : kind === 'udp'
            ? `udp.stream eq ${stream}`
            : kind === 'ip'
              ? `ip.addr==${s.addr} && ip.addr==${d.addr}`
              : kind === 'eth'
                ? `eth.addr==${s.addr} && eth.addr==${d.addr}`
                : `(bluetooth.src==${s.addr} && bluetooth.dst==${d.addr}) || (bluetooth.src==${d.addr} && bluetooth.dst==${s.addr})`;
      c = {
        a: s.addr,
        b: d.addr,
        aName: s.name,
        bName: d.name,
        portA: kind === 'tcp' || kind === 'udp' ? sp : undefined,
        portB: kind === 'tcp' || kind === 'udp' ? dp : undefined,
        stream,
        packets: 0,
        bytes: 0,
        ab: [0, 0],
        ba: [0, 0],
        start: p.t,
        end: p.t,
        filter,
      };
      map.set(key, c);
    }
    c.packets++;
    c.bytes += p.len;
    const dirAB = kind === 'tcp' || kind === 'udp' ? p.dir !== 1 : forward;
    const side = dirAB ? c.ab : c.ba;
    side[0]++;
    side[1] += p.len;
    c.end = p.t;
  }
  return [...map.values()];
}

export interface Endpoint {
  addr: string;
  name?: string;
  packets: number;
  bytes: number;
  tx: [number, number];
  rx: [number, number];
}

export function endpoints(packets: Packet[]): Endpoint[] {
  const map = new Map<string, Endpoint>();
  const get = (a: { addr: string; name?: string }) => {
    let e = map.get(a.addr);
    if (!e)
      map.set(
        a.addr,
        (e = { addr: a.addr, name: a.name, packets: 0, bytes: 0, tx: [0, 0], rx: [0, 0] }),
      );
    return e;
  };
  for (const p of packets) {
    const ends = addrsOf(p, 'ip');
    if (!ends) continue;
    const [s, d] = ends.map(get);
    s.packets++;
    s.bytes += p.len;
    s.tx[0]++;
    s.tx[1] += p.len;
    d.packets++;
    d.bytes += p.len;
    d.rx[0]++;
    d.rx[1] += p.len;
  }
  return [...map.values()];
}

/* ------------------------------------------------------------------ expert information */

export interface ExpertGroup {
  sev: Severity;
  group: string;
  msg: string;
  proto: string;
  frames: number[];
}

export const SEV_ORDER: Severity[] = ['error', 'warn', 'note', 'chat', 'comment'];

export function expertInfo(packets: Packet[]): ExpertGroup[] {
  const map = new Map<string, ExpertGroup>();
  for (const p of packets) {
    const walk = (nodes: typeof p.tree, proto: string) => {
      for (const n of nodes) {
        const top = n.f && lookup(n.f)?.type === 'proto' ? n.f : proto;
        if (n.x) {
          const key = `${n.x.sev}|${n.x.group}|${n.x.msg}`;
          let g = map.get(key);
          if (!g)
            map.set(
              key,
              (g = {
                sev: n.x.sev,
                group: n.x.group,
                msg: n.x.msg,
                proto: top.toUpperCase(),
                frames: [],
              }),
            );
          if (g.frames[g.frames.length - 1] !== p.no) g.frames.push(p.no);
        }
        if (n.k) walk(n.k, top);
      }
    };
    walk(p.tree, 'frame');
  }
  return [...map.values()].sort(
    (a, b) => SEV_ORDER.indexOf(a.sev) - SEV_ORDER.indexOf(b.sev) || a.frames[0] - b.frames[0],
  );
}

export function worstSeverity(packets: Packet[]): Severity | null {
  let worst: Severity | null = null;
  for (const g of expertInfo(packets))
    if (!worst || SEV_ORDER.indexOf(g.sev) < SEV_ORDER.indexOf(worst)) worst = g.sev;
  return worst;
}

/* ------------------------------------------------------------------ follow */

export type FollowKind = 'tcp' | 'tls' | 'http' | 'udp';

export interface Chunk {
  dir: 0 | 1;
  frame: number;
  bytes: Uint8Array;
}

export interface Followed {
  kind: FollowKind;
  stream: number;
  filter: string;
  chunks: Chunk[];
  client: string;
  server: string;
  pkts: [number, number];
  turns: number;
  bytes: [number, number];
}

/** What Follow offers for a packet, best first. */
export function followKinds(p: Packet | undefined, all: Packet[]): FollowKind[] {
  if (!p) return [];
  if (p.udp !== undefined) return ['udp'];
  if (p.tcp === undefined) return [];
  const decrypted = all.some((q) => q.tcp === p.tcp && q.plain);
  const isHttp = all.some((q) => q.tcp === p.tcp && q.protos.includes('http'));
  return decrypted ? ['tls', 'http', 'tcp'] : isHttp ? ['http', 'tcp'] : ['tcp'];
}

export const followName: Record<FollowKind, string> = {
  tcp: 'TCP Stream',
  tls: 'TLS Stream',
  http: 'HTTP Stream',
  udp: 'UDP Stream',
};

/**
 * Reassembles one stream: each direction in sequence order (a late retransmission goes back in
 * its place, and data already seen is dropped), then both merged by when they became readable.
 */
export function follow(all: Packet[], kind: FollowKind, stream: number): Followed {
  const pick = all.filter((p) => (kind === 'udp' ? p.udp === stream : p.tcp === stream));
  const first = pick[0];
  const useTls = kind === 'tls' || (kind === 'http' && pick.some((p) => p.plain));
  const parts: (Chunk & { t: number; seq: number })[][] = [[], []];
  const seen = [new Set<number>(), new Set<number>()];
  for (const p of pick) {
    const data = kind === 'udp' ? p.payload : useTls ? p.plain : p.payload;
    if (!data || !data.length) continue;
    const dir = (p.dir ?? 0) as 0 | 1;
    const seq = p.seq ?? p.t;
    if (seen[dir].has(seq)) continue;
    seen[dir].add(seq);
    parts[dir].push({ dir, frame: p.no, bytes: data, t: p.t, seq });
  }
  const merged: (Chunk & { eff: number })[] = [];
  for (const list of parts) {
    if (kind !== 'udp') list.sort((a, b) => a.seq - b.seq);
    let eff = 0;
    for (const c of list) {
      eff = Math.max(eff, c.t);
      merged.push({ dir: c.dir, frame: c.frame, bytes: c.bytes, eff });
    }
  }
  merged.sort((a, b) => a.eff - b.eff || a.dir - b.dir);
  let turns = 0;
  merged.forEach((c, i) => {
    if (i && c.dir !== merged[i - 1].dir) turns++;
  });
  const end = (p: Packet | undefined, dir: 0 | 1) => {
    if (!p) return '';
    const a = (p.dir ?? 0) === dir ? p.src : p.dst;
    const port = (p.dir ?? 0) === dir ? p.sport : p.dport;
    return `${a.addr}:${port}`;
  };
  return {
    kind,
    stream,
    filter: `${kind === 'udp' ? 'udp' : 'tcp'}.stream eq ${stream}`,
    chunks: merged.map(({ dir, frame, bytes }) => ({ dir, frame, bytes })),
    client: end(first, 0),
    server: end(first, 1),
    pkts: [
      new Set(merged.filter((c) => c.dir === 0).map((c) => c.frame)).size,
      new Set(merged.filter((c) => c.dir === 1).map((c) => c.frame)).size,
    ],
    turns,
    bytes: [
      merged.filter((c) => c.dir === 0).reduce((s, c) => s + c.bytes.length, 0),
      merged.filter((c) => c.dir === 1).reduce((s, c) => s + c.bytes.length, 0),
    ],
  };
}

/* ------------------------------------------------------------------ text renderings of a stream */

export type ShowAs = 'ascii' | 'utf8' | 'hexdump' | 'carrays' | 'raw' | 'yaml';

const printable = (c: number) => (c >= 32 && c < 127) || c === 10 || c === 13 || c === 9;
const dec = new TextDecoder();

export function chunkText(
  c: Chunk,
  as: ShowAs,
  index: number,
  offset: number,
  all?: Followed,
): string {
  const b = c.bytes;
  switch (as) {
    case 'ascii':
      return Array.from(b, (x) => (printable(x) ? String.fromCharCode(x) : '.')).join('');
    case 'utf8':
      return dec.decode(b);
    case 'raw':
      return hexBytes(b) + '\n';
    case 'hexdump': {
      let out = '';
      const indent = c.dir ? '    ' : '';
      for (let i = 0; i < b.length; i += 16) {
        const row = Array.from(b.subarray(i, i + 16));
        const hexs = row.map((x) => x.toString(16).padStart(2, '0'));
        const left = hexs.slice(0, 8).join(' ');
        const right = hexs.slice(8).join(' ');
        out += `${indent}${(offset + i).toString(16).padStart(8, '0')}  ${left.padEnd(23)}  ${right.padEnd(23)}  ${row.map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}\n`;
      }
      return out;
    }
    case 'carrays': {
      const lines = [];
      for (let i = 0; i < b.length; i += 8)
        lines.push(
          Array.from(b.subarray(i, i + 8), (x) => `0x${x.toString(16).padStart(2, '0')}`).join(
            ', ',
          ),
        );
      return `char peer${c.dir}_${index}[] = { /* Packet ${c.frame} */\n${lines.join(',\n')} };\n`;
    }
    case 'yaml': {
      let s = '';
      for (let i = 0; i < b.length; i += 3) s += String.fromCharCode(...b.subarray(i, i + 3));
      const b64 =
        btoa(s)
          .match(/.{1,72}/g)
          ?.join('\n      ') ?? '';
      const head = index === 0 && c === all?.chunks[0] ? '' : '';
      return `${head}  - packet: ${c.frame}\n    peer: ${c.dir}\n    index: ${index}\n    data: !!binary |\n      ${b64}\n`;
    }
  }
}
