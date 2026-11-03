// The capture itself: a merged multi-interface trace of the visitor fetching the career from the
// site, an Attendum reader checking in over Wi-Fi, the beacon it talks to over BLE, logger
// stations publishing over GSM to their broker, and the Mini PLC polling the EPC over Modbus.
// Scenes create events with real TCP sequence state; frame numbers are given once every event
// is sorted by time, and then each event builds its bytes and tree, cross-references resolved.

import { db } from '../_shared/data';
import {
  API,
  ATTENDUM_HOST,
  DEVICES,
  FEATURED_HOSTS,
  PRODUCT_HOSTS,
  SITE,
  hostOf,
  identity,
  loggerFleet,
} from './career';
import { FIELDS } from './fields';
import {
  ACK,
  ADV_AA,
  BROADCAST,
  FIN,
  PSH,
  SYN,
  appRecord,
  arp,
  attPayload,
  ble,
  bodyBytes,
  clientFinished,
  clientHello,
  dataRf,
  dns,
  ether,
  expert,
  http,
  ipv4,
  macName,
  modbus,
  mqtt,
  ntp,
  opaqueData,
  serverHello,
  tcp,
  udp,
  type AttPdu,
  type BlePdu,
  type HttpMsg,
  type Mac,
  type ModbusPdu,
  type MqttMsg,
} from './layers';
import {
  B,
  arrival,
  httpDate,
  ip4,
  mac,
  rng,
  utf8,
  type Layer,
  type Node,
  type Rng,
  type Src,
} from './net';

/* ------------------------------------------------------------------ shapes */

export interface Iface {
  name: string;
  desc: string;
  link: string;
  encap: number;
}

const { logger, reader, beacon, plc, epc } = DEVICES;

export const IFACES: Iface[] = [
  { name: 'en0', desc: 'Your machine', link: 'Ethernet', encap: 1 },
  { name: 'wlan0', desc: `${reader.name} uplink`, link: 'Ethernet', encap: 1 },
  {
    name: 'ble0',
    desc: `${beacon.chip} sniffer`,
    link: 'Bluetooth Low Energy Link Layer RF',
    encap: 161,
  },
  { name: 'broker0', desc: `${logger.name} broker`, link: 'Ethernet', encap: 1 },
  { name: 'plc0', desc: `${plc.name} fieldbus`, link: 'Ethernet', encap: 1 },
];

export interface Addr {
  addr: string;
  name?: string;
}

export interface Packet {
  no: number;
  /** Seconds since the first packet. */
  t: number;
  epoch: number;
  iface: number;
  len: number;
  srcs: Src[];
  tree: Node[];
  src: Addr;
  dst: Addr;
  proto: string;
  info: string;
  tcp?: number;
  udp?: number;
  /** 0 from the side that opened the conversation, 1 back. */
  dir?: 0 | 1;
  /** Ports, for conversation statistics. */
  sport?: number;
  dport?: number;
  /** Relative TCP sequence number, so Follow can put a late retransmission back in its place. */
  seq?: number;
  /** TCP payload as captured, and TLS plaintext where the key log opens it, for Follow. */
  payload?: Uint8Array;
  plain?: Uint8Array;
  retrans?: boolean;
  protos: string[];
  comment?: string;
}

interface Built {
  layer: Layer;
  srcs?: Src[];
  src: Addr;
  dst: Addr;
  proto: string;
  info: string;
  tcp?: Conv;
  udp?: Udp;
  dir?: 0 | 1;
  sport?: number;
  dport?: number;
  seq?: number;
  payload?: number[];
  plain?: number[];
  retrans?: boolean;
}

interface Ev {
  t: number;
  iface: number;
  no: number;
  comment?: string;
  conv?: Conv;
  udp?: Udp;
  cflags?: number;
  build: () => Built;
}

const no = (e: Ev | undefined) => (e && e.no > 0 ? e.no : undefined);

/* ------------------------------------------------------------------ hosts */

interface Stack {
  mss: number;
  synWin: number;
  win: number;
  ws: number | null;
  sack: boolean;
  ts: boolean;
}

interface Host {
  ip: number;
  name?: string;
  /** TTL as it arrives at the capture point. */
  ttl: number;
  stack: Stack;
}

interface End {
  host: Host;
  port: number;
  /** The MAC this end has on the captured segment: its own, or the router's for remote hosts. */
  mac: Mac;
}

const LINUX: Stack = { mss: 1460, synWin: 64240, win: 502, ws: 7, sack: true, ts: true };
const SERVER: Stack = { mss: 1460, synWin: 65160, win: 509, ws: 7, sack: true, ts: true };
// lwIP on the embedded parts: MSS only, a small fixed window, no scaling, no timestamps.
const LWIP: Stack = { mss: 1440, synWin: 5744, win: 5744, ws: null, sack: false, ts: false };
const FIELDBUS: Stack = { mss: 1460, synWin: 2920, win: 2920, ws: null, sack: false, ts: false };
const MODEM: Stack = { mss: 1360, synWin: 8192, win: 8192, ws: null, sack: false, ts: false };

const ip = (a: number, b: number, c: number, d: number) =>
  ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

/** Locally administered MACs throughout: no vendor's address block is borrowed. */
function laa(r: Rng, name?: string): Mac {
  const b = r.bytes(6);
  b[0] = (b[0] & 0xfc) | 0x02;
  return { b, name };
}

/** The capture's name table: what View ▸ Name Resolution shows instead of numbers. */
export const NAMES = new Map<number, string>();

/* ------------------------------------------------------------------ tcp */

type Payload = {
  bytes: number[];
  plain?: number[];
  dissect?: () => { tree: Node[]; proto: string; info: string; srcs?: Src[] };
};

interface SegExtra {
  retrans?: boolean;
  lost?: boolean;
  dupOf?: Ev;
  dupNum?: number;
  seq?: number;
  ack?: number;
}

class Conv {
  stream = -1;
  flags = 0;
  readonly iface: number;
  readonly ends: [End, End];
  readonly r: Rng;
  private seq = [0, 0];
  private acked = [1, 1];
  private lastAck = [0, 0];
  private push = [0, 0];
  private unacked: { end: number; ev: Ev; t: number }[][] = [[], []];
  private isn: number[];
  private tsBase: number[];
  private peerTs = [0, 0];
  private ipId: number[];
  private t0 = -1;
  private lastT = -1;
  private synT = 0;
  private synAckT = 0;
  private irtt?: number;
  readonly ws: boolean;
  readonly ts: boolean;
  /** HTTP requests on this connection, in order, for "HTTP request 2/3" and the frame links. */
  readonly http: { req?: Ev; resp?: Ev; uri: string; t: number }[] = [];
  lastEv?: Ev;

  constructor(iface: number, client: End, server: End, r: Rng) {
    this.iface = iface;
    this.ends = [client, server];
    this.r = r;
    this.isn = [r.int(1, 0xfffffffe), r.int(1, 0xfffffffe)];
    this.tsBase = [r.int(1e8, 4e9), r.int(1e8, 4e9)];
    this.ipId = [r.int(0, 0xffff), r.int(0, 0xffff)];
    this.ws = client.host.stack.ws !== null && server.host.stack.ws !== null;
    this.ts = client.host.stack.ts && server.host.stack.ts;
  }

  /** Data the capture never saw (lost on the way), so sequence numbers move on without a frame. */
  skip(dir: 0 | 1, len: number) {
    const at = this.seq[dir];
    this.seq[dir] += len;
    return at;
  }

  seg(t: number, dir: 0 | 1, flags: number, payload?: Payload, x: SegExtra = {}): Ev {
    const me = this.ends[dir];
    const peer = this.ends[1 - dir];
    const stack = me.host.stack;
    const len = payload?.bytes.length ?? 0;
    const syn = !!(flags & SYN);
    const fin = !!(flags & FIN);
    const seq = x.seq ?? this.seq[dir];
    if (x.seq === undefined) this.seq[dir] = seq + len + (syn || fin ? 1 : 0);
    const ack = flags & ACK ? (x.ack ?? this.seq[1 - dir]) : 0;

    const ev: Ev = { t, iface: this.iface, no: 0, conv: this, build: () => ({}) as Built };
    let acks: Ev | undefined;
    let rtt: number | undefined;
    if (flags & ACK && ack > this.lastAck[dir]) {
      const list = this.unacked[1 - dir];
      let hit: { end: number; ev: Ev; t: number } | undefined;
      while (list.length && list[0].end <= ack) hit = list.shift();
      if (hit) {
        acks = hit.ev;
        rtt = t - hit.t;
      }
      this.lastAck[dir] = ack;
      this.acked[1 - dir] = Math.max(this.acked[1 - dir], ack);
    }
    if (syn && !(flags & ACK)) this.synT = t;
    if (syn && flags & ACK) this.synAckT = t;
    if (!syn && flags & ACK && this.irtt === undefined && this.synAckT) this.irtt = t - this.synT;
    let inFlight: number | undefined;
    let pushed: number | undefined;
    if (len && !x.retrans) {
      inFlight = seq + len - this.acked[dir];
      this.push[dir] += len;
      if (flags & PSH) {
        pushed = this.push[dir];
        this.push[dir] = 0;
      }
    }
    if ((len || syn || fin) && !x.retrans)
      this.unacked[dir].push({ end: seq + len + (syn || fin ? 1 : 0), ev, t });

    // Options as each stack sends them.
    const opts: { kind: 'nop' | 'mss' | 'sack' | 'ts' | 'ws'; v?: number; v2?: number }[] = [];
    const tsval = (this.tsBase[dir] + Math.round(t * 1000)) >>> 0;
    if (syn) {
      const answering = !!(flags & ACK);
      const peerStack = peer.host.stack;
      opts.push({ kind: 'mss', v: stack.mss });
      if (stack.sack && (!answering || peerStack.sack)) opts.push({ kind: 'sack' });
      if (stack.ts && (!answering || peerStack.ts))
        opts.push({ kind: 'ts', v: tsval, v2: answering ? this.peerTs[dir] : 0 });
      if (stack.ws !== null && (!answering || peerStack.ws !== null))
        opts.push({ kind: 'nop' }, { kind: 'ws', v: stack.ws });
    } else if (this.ts) {
      opts.push({ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', v: tsval, v2: this.peerTs[dir] });
    }
    if (stack.ts) this.peerTs[1 - dir] = tsval;

    const win = syn ? stack.synWin : stack.win;
    const scale = this.ws ? 2 ** (stack.ws ?? 0) : -2;
    const id = this.ipId[dir]++ & 0xffff;
    if (this.t0 < 0) this.t0 = t;
    const tRel = t - this.t0;
    const tDelta = this.lastT < 0 ? 0 : t - this.lastT;
    this.lastT = t;
    const irtt = syn ? undefined : this.irtt;
    ev.cflags =
      (syn && !(flags & ACK) ? 1 : 0) |
      (syn && flags & ACK ? 2 : 0) |
      (!syn && flags & ACK ? 4 : 0) |
      (len ? 8 : 0) |
      (fin ? 16 : 0) |
      (flags & 0x004 ? 32 : 0);

    ev.build = () => {
      const d = x.retrans ? undefined : payload?.dissect?.();
      const seg = tcp(
        {
          sport: me.port,
          dport: peer.port,
          serverPort: this.ends[1].port,
          seq,
          ack,
          seqRaw: (this.isn[dir] + seq) >>> 0,
          ackRaw: flags & ACK ? (this.isn[1 - dir] + ack) >>> 0 : 0,
          flags,
          win,
          scale,
          opts,
          src: me.host.ip,
          dst: peer.host.ip,
          stream: this.stream,
          completeness: this.flags,
          tRel,
          tDelta,
          analysis: {
            acks: no(acks),
            rtt: no(acks) ? rtt : undefined,
            irtt,
            inFlight,
            push: pushed,
            retrans: x.retrans,
            lost: x.lost,
            dup:
              x.dupOf && no(x.dupOf)
                ? { num: x.dupNum ?? 1, of: no(x.dupOf) as number }
                : undefined,
          },
        },
        payload ? { bytes: payload.bytes, tree: d?.tree ?? [] } : undefined,
      );
      const net = ipv4(me.host.ip, peer.host.ip, 6, seg.layer, {
        id,
        ttl: me.host.ttl,
        srcName: me.host.name,
        dstName: peer.host.name,
      });
      const layer = ether(peer.mac, me.mac, 0x0800, net);
      const lostPrefix = x.lost ? '[TCP Previous segment not captured] ' : '';
      return {
        layer,
        srcs: d?.srcs,
        src: { addr: ip4(me.host.ip), name: me.host.name },
        dst: { addr: ip4(peer.host.ip), name: peer.host.name },
        proto: d && !x.dupOf ? d.proto : 'TCP',
        info:
          d && !x.dupOf ? lostPrefix + d.info : (x.lost && !x.retrans ? lostPrefix : '') + seg.info,
        tcp: this,
        dir,
        sport: me.port,
        dport: peer.port,
        seq,
        payload: payload?.bytes,
        plain: payload?.plain,
        retrans: x.retrans,
      };
    };
    this.lastEv = ev;
    return ev;
  }
}

class Udp {
  stream = -1;
  t0 = -1;
  lastT = -1;
  times(t: number) {
    if (this.t0 < 0) this.t0 = t;
    const out = { rel: t - this.t0, delta: this.lastT < 0 ? 0 : t - this.lastT };
    this.lastT = t;
    return out;
  }
}

/* ------------------------------------------------------------------ the capture */

export interface Capture {
  packets: Packet[];
  epoch0: number;
  /** When the scripted part ends: everything after is the steady state. */
  scriptEnd: number;
  limit: number;
}

const SEED = 0x6e63_2026 ^ db.person.since;
const CHUNK = 1380;

export function buildCapture(limit = 1000, horizon = 400): Capture {
  const r = rng(SEED);
  const evs: Ev[] = [];
  const add = (...e: Ev[]) => {
    evs.push(...e);
    return e[e.length - 1];
  };
  const { asOf } = db;
  const epoch0 = Date.UTC(asOf.y, (asOf.m ?? 1) - 1, asOf.d ?? 1, 10, 14, 3) / 1000 + 0.218431;

  const name = (h: Host) => {
    if (h.name) NAMES.set(h.ip, h.name);
    return h;
  };

  /* ---------------- hosts on each segment ---------------- */

  const you = name({ ip: ip(192, 168, 1, 23), name: 'you', ttl: 64, stack: LINUX });
  const youMac = laa(r);
  const gw = name({ ip: ip(192, 168, 1, 1), name: 'gateway', ttl: 64, stack: LINUX });
  const gwMac = laa(r, 'gateway');
  const site = name({ ip: ip(198, 51, 100, 24), name: SITE, ttl: 56, stack: SERVER });
  const products = new Map<string, Host>();
  PRODUCT_HOSTS.forEach((h, i) =>
    products.set(
      h,
      name({ ip: ip(203, 0, 113, 10 + i * 7), name: h, ttl: r.int(48, 57), stack: SERVER }),
    ),
  );
  const zeroOneHost = hostOf(db.roles.zeroone.url);
  if (!products.has(zeroOneHost))
    products.set(
      zeroOneHost,
      name({ ip: ip(203, 0, 113, 90), name: zeroOneHost, ttl: 51, stack: SERVER }),
    );

  const at01 = name({ ip: ip(10, 42, 7, 31), name: reader.tag, ttl: 255, stack: LWIP });
  const at01Mac = laa(r, reader.tag);
  const campusGw = name({ ip: ip(10, 42, 0, 1), name: 'campus-gw', ttl: 64, stack: LINUX });
  const campusMac = laa(r, 'campus-gw');
  const attendum = products.get(ATTENDUM_HOST) as Host;

  const broker = name({ ip: ip(192, 0, 2, 10), name: 'broker', ttl: 64, stack: SERVER });
  const brokerMac = laa(r, 'broker');
  const ingest = name({ ip: ip(192, 0, 2, 11), name: 'ingest', ttl: 64, stack: LINUX });
  const ingestMac = laa(r, 'ingest');
  const edgeMac = laa(r, 'edge-router');
  // Every station shares the carrier's NAT address; only the source port tells them apart.
  const carrier: Host = { ip: ip(203, 0, 113, 201), ttl: 46, stack: MODEM };

  const plc01 = name({ ip: ip(10, 20, 0, 11), name: plc.tag, ttl: 255, stack: FIELDBUS });
  const plcMac = laa(r, plc.tag);
  const epc01 = name({ ip: ip(10, 20, 0, 12), name: epc.tag, ttl: 255, stack: FIELDBUS });
  const epcMac = laa(r, epc.tag);
  const hmi = name({ ip: ip(10, 20, 0, 50), name: 'hmi', ttl: 64, stack: LINUX });
  const hmiMac = laa(r, 'hmi');
  const plcGw = name({ ip: ip(10, 20, 0, 1), name: 'plc-gw', ttl: 64, stack: LINUX });
  const plcGwMac = laa(r, 'plc-gw');

  /* ---------------- helpers ---------------- */

  const end = (host: Host, port: number, m: Mac): End => ({ host, port, mac: m });
  let ephemeral = 52010;

  function dnsLookup(
    iface: number,
    t: number,
    cli: Host,
    cliMac: Mac,
    resolver: Host,
    resMac: Mac,
    qname: string,
    answer: number,
    rtt: number,
  ) {
    const conv = new Udp();
    const id = r.int(0, 0xffff);
    const port = r.int(49152, 65000);
    const q: Ev = { t, iface, no: 0, udp: conv, build: () => ({}) as Built };
    const a: Ev = { t: t + rtt, iface, no: 0, udp: conv, build: () => ({}) as Built };
    const qt = conv.times(q.t);
    const at = conv.times(a.t);
    const mk = (ev: Ev, response: boolean, tt: { rel: number; delta: number }) => () => {
      const d = dns({
        id,
        response,
        name: qname,
        answers: response ? [{ ip: answer, ttl: 300 }] : undefined,
        link: no(response ? q : a),
        time: response ? rtt : undefined,
      });
      const [s, dd, sp, dp, sm, dm] = response
        ? [resolver, cli, 53, port, resMac, cliMac]
        : [cli, resolver, port, 53, cliMac, resMac];
      const u = udp(sp, dp, s.ip, dd.ip, d.layer, conv.stream, tt.rel, tt.delta);
      return {
        layer: ether(
          dm,
          sm,
          0x0800,
          ipv4(s.ip, dd.ip, 17, u, {
            id: r.int(0, 0xffff),
            ttl: s.ttl,
            srcName: s.name,
            dstName: dd.name,
          }),
        ),
        src: { addr: ip4(s.ip), name: s.name },
        dst: { addr: ip4(dd.ip), name: dd.name },
        proto: 'DNS',
        info: d.info,
        udp: conv,
        dir: (response ? 1 : 0) as 0 | 1,
        sport: sp,
        dport: dp,
        payload: d.layer.bytes,
      };
    };
    q.build = mk(q, false, qt);
    a.build = mk(a, true, at);
    add(q, a);
    return t + rtt;
  }

  /** A TLS application-data payload for one plaintext chunk. */
  const record = (plain: number[]) => {
    const cipher = r.bytes(plain.length + 17);
    return {
      cipher,
      bytes: appRecord(cipher, plain.length, 'Hypertext Transfer Protocol').bytes,
      plain,
    };
  };

  function handshake(c: Conv, t: number, rtt: number, sni: string, alpn: string | null): number {
    add(c.seg(t, 0, SYN));
    add(c.seg((t += rtt), 1, SYN | ACK));
    add(c.seg((t += 0.00006), 0, ACK));
    const ch = clientHello(sni, alpn, r.bytes(32), r.bytes(32), r.bytes(32));
    add(
      c.seg((t += 0.0004), 0, PSH | ACK, {
        bytes: ch.layer.bytes,
        dissect: () => ({ tree: ch.layer.tree, proto: 'TLSv1.3', info: ch.info }),
      }),
    );
    // The capture is at the client: every answer arrives a full round trip after what caused it.
    const sh = serverHello(
      r.bytes(32),
      r.bytes(32),
      r.bytes(32),
      r.bytes(r.int(980, 1240)),
      'Hypertext Transfer Protocol',
    );
    add(
      c.seg((t += rtt + 0.0021), 1, PSH | ACK, {
        bytes: sh.layer.bytes,
        dissect: () => ({ tree: sh.layer.tree, proto: 'TLSv1.3', info: sh.info }),
      }),
    );
    const cf = clientFinished(r.bytes(53), 'Hypertext Transfer Protocol');
    add(
      c.seg((t += 0.0011), 0, PSH | ACK, {
        bytes: cf.layer.bytes,
        dissect: () => ({ tree: cf.layer.tree, proto: 'TLSv1.3', info: cf.info }),
      }),
    );
    return t;
  }

  interface Exchange {
    method: string;
    uri: string;
    reqHeaders?: [string, string][];
    reqBody?: unknown;
    code: number;
    phrase: string;
    respHeaders?: [string, string][];
    body?: unknown;
    pretty?: boolean;
    comment?: string;
  }

  /** One HTTP request and its response over TLS the key log opens, split into records and segments. */
  function https(
    c: Conv,
    t: number,
    host: string,
    x: Exchange,
    srvTime: number,
    rtt: number,
    ackEvery = 2,
  ): number {
    const reqBodyJson =
      x.reqBody === undefined ? null : { json: x.reqBody, pretty: false, type: 'application/json' };
    const reqMsg: HttpMsg = {
      start: `${x.method} ${x.uri} HTTP/1.1`,
      headers: [
        ['Host', host],
        ...(x.reqHeaders ?? []),
        ...(reqBodyJson
          ? ([
              ['Content-Type', 'application/json'],
              ['Content-Length', String(bodyBytes(reqBodyJson).length)],
            ] as [string, string][])
          : []),
      ],
      body: reqBodyJson,
    };
    const reqPlain = (() => {
      const hb = new B(1);
      http(hb, reqMsg, null);
      return hb.bytes;
    })();
    const entry: { req?: Ev; resp?: Ev; uri: string; t: number } = { uri: x.uri, t };
    c.http.push(entry);
    const index = c.http.length;
    const meta = (request: boolean) => {
      const list = c.http;
      const i = index - 1;
      return {
        request,
        scheme: 'https',
        host,
        uri: x.uri,
        number: index,
        total: list.length,
        link: no(request ? entry.resp : entry.req),
        prev: i > 0 ? no(list[i - 1].req) : undefined,
        next: no(list[i + 1]?.req),
        time: request ? undefined : (entry.resp?.t ?? 0) - entry.t,
      };
    };
    const reqRec = record(reqPlain);
    const reqEv = c.seg(t, 0, PSH | ACK, {
      bytes: reqRec.bytes,
      plain: reqPlain,
      dissect: () => {
        const hb = new B(1);
        http(hb, reqMsg, meta(true));
        return {
          tree: [
            ...appRecord(reqRec.cipher, reqPlain.length, 'Hypertext Transfer Protocol').tree,
            ...hb.root,
          ],
          proto: reqBodyJson ? 'HTTP/JSON' : 'HTTP',
          info: `${x.method} ${x.uri} HTTP/1.1${reqBodyJson ? '  (application/json)' : ''}`,
          srcs: [
            { label: `Decrypted TLS (${reqPlain.length} bytes)`, bytes: Uint8Array.from(reqPlain) },
          ],
        };
      },
    });
    entry.req = add(reqEv);

    const tResp = t + rtt + srvTime;
    const body =
      x.body === undefined
        ? null
        : { json: x.body, pretty: x.pretty ?? true, type: 'application/json' };
    const respMsg: HttpMsg = {
      start: `HTTP/1.1 ${x.code} ${x.phrase}`,
      headers: [
        ['Date', httpDate(epoch0 + tResp)],
        ...(body
          ? ([
              ['Content-Type', 'application/json; charset=utf-8'],
              ['Content-Length', String(bodyBytes(body).length)],
            ] as [string, string][])
          : []),
        ...(x.respHeaders ?? []),
      ],
      body,
    };
    const respPlain = (() => {
      const hb = new B(2);
      http(hb, respMsg, null);
      return hb.bytes;
    })();
    const chunks: number[][] = [];
    for (let i = 0; i < respPlain.length; i += CHUNK) chunks.push(respPlain.slice(i, i + CHUNK));
    const evsOut: Ev[] = [];
    let tt = tResp;
    if (srvTime > 0.04) add(c.seg(t + rtt + 0.04, 1, ACK)); // delayed ACK while the server works
    chunks.forEach((chunk, i) => {
      const rec = record(chunk);
      const last = i === chunks.length - 1;
      const single = chunks.length === 1;
      const ev = c.seg(tt, 1, PSH | ACK, {
        bytes: rec.bytes,
        plain: chunk,
        dissect: () => {
          const srcs: Src[] = [
            { label: `Decrypted TLS (${chunk.length} bytes)`, bytes: Uint8Array.from(chunk) },
          ];
          if (!last)
            return {
              tree: appRecord(
                rec.cipher,
                chunk.length,
                'Hypertext Transfer Protocol',
                no(evsOut[evsOut.length - 1]),
              ).tree,
              proto: 'TLSv1.3',
              info: 'Application Data',
              srcs,
            };
          const src = single ? 1 : 2;
          const hb = new B(src);
          http(hb, respMsg, meta(false));
          if (!single)
            srcs.push({
              label: `Reassembled TLS (${respPlain.length} bytes)`,
              bytes: Uint8Array.from(respPlain),
            });
          const segs = single
            ? undefined
            : evsOut.map((e, j) => ({ frame: no(e) ?? 0, len: chunks[j].length }));
          return {
            tree: [
              ...appRecord(rec.cipher, chunk.length, 'Hypertext Transfer Protocol', undefined, segs)
                .tree,
              ...hb.root,
            ],
            proto: body ? 'HTTP/JSON' : 'HTTP',
            info: `HTTP/1.1 ${x.code} ${x.phrase}${body ? '  (application/json)' : ''}`,
            srcs,
          };
        },
      });
      evsOut.push(ev);
      add(ev);
      if (last && x.comment) ev.comment = x.comment;
      if ((i + 1) % ackEvery === 0 || last) add(c.seg(tt + 0.00009 + (last ? 0.00002 : 0), 0, ACK));
      tt += 0.00011 + r.next() * 0.00008;
    });
    entry.resp = evsOut[evsOut.length - 1];
    return tt;
  }

  /** A plain HTTP exchange on port 80. */
  function plainHttp(
    c: Conv,
    t: number,
    host: string,
    reqMsg: HttpMsg,
    respMsg: HttpMsg,
    rtt: number,
  ): number {
    const entry: { req?: Ev; resp?: Ev; uri: string; t: number } = {
      uri: reqMsg.start.split(' ')[1],
      t,
    };
    c.http.push(entry);
    const meta = (request: boolean) => ({
      request,
      scheme: 'http',
      host,
      uri: entry.uri,
      number: 1,
      total: 1,
      link: no(request ? entry.resp : entry.req),
      time: request ? undefined : (entry.resp?.t ?? 0) - t,
    });
    const bytesOf = (m: HttpMsg) => {
      const hb = new B();
      http(hb, m, null);
      return hb.bytes;
    };
    const reqBytes = bytesOf(reqMsg);
    entry.req = add(
      c.seg(t, 0, PSH | ACK, {
        bytes: reqBytes,
        dissect: () => {
          const hb = new B();
          http(hb, reqMsg, meta(true));
          return { tree: hb.root, proto: 'HTTP', info: reqMsg.start };
        },
      }),
    );
    add(c.seg(t + rtt, 1, ACK));
    const respBytes = bytesOf(respMsg);
    entry.resp = add(
      c.seg(t + rtt + 0.0012, 1, PSH | ACK, {
        bytes: respBytes,
        dissect: () => {
          const hb = new B();
          http(hb, respMsg, meta(false));
          return { tree: hb.root, proto: 'HTTP', info: respMsg.start };
        },
      }),
    );
    return t + rtt + 0.0012;
  }

  /** Client and server close, server first after its keep-alive timeout. */
  function closeByServer(c: Conv, t: number, rtt: number) {
    add(c.seg(t, 1, FIN | ACK));
    add(c.seg(t + 0.00004, 0, ACK));
    add(c.seg(t + 0.0002, 0, FIN | ACK));
    add(c.seg(t + rtt + 0.0003, 1, ACK));
  }

  /* ---------------- en0: your visit ---------------- */

  const siteRtt = 0.0213;
  let t = dnsLookup(0, 0, you, youMac, gw, gwMac, SITE, site.ip, 0.0118);
  const youEnd = (port: number) => end(you, port, youMac);
  const remoteEnd = (h: Host, port: number) => end(h, port, gwMac);

  // Port 80 first, and the redirect every engineer expects.
  const c80 = new Conv(0, youEnd(ephemeral++), remoteEnd(site, 80), r);
  add(c80.seg((t += 0.0004), 0, SYN));
  add(c80.seg((t += siteRtt), 1, SYN | ACK));
  add(c80.seg((t += 0.00005), 0, ACK));
  t = plainHttp(
    c80,
    (t += 0.0002),
    SITE,
    {
      start: 'GET / HTTP/1.1',
      headers: [
        ['Host', SITE],
        ['Accept', 'text/html'],
        ['Connection', 'keep-alive'],
      ],
    },
    {
      start: 'HTTP/1.1 301 Moved Permanently',
      headers: [
        ['Location', `${db.person.url}/`],
        ['Content-Length', '0'],
        ['Date', httpDate(epoch0 + t + siteRtt)],
      ],
    },
    siteRtt,
  );
  add(c80.seg((t += 0.00008), 0, ACK));
  add(c80.seg((t += 0.0002), 0, FIN | ACK));
  add(c80.seg((t += siteRtt), 1, FIN | ACK));
  add(c80.seg((t += 0.00004), 0, ACK));

  // Then three connections in parallel, the way a browser fans out after the redirect.
  const tlsStart = t + 0.0009;
  const conns = [0, 1, 2].map(() => new Conv(0, youEnd(ephemeral++ + 1), remoteEnd(site, 443), r));
  const ready = conns.map((c, i) =>
    handshake(c, tlsStart + i * 0.00061, siteRtt + i * 0.0004, SITE, 'http/1.1'),
  );
  const reqH: [string, string][] = [
    ['Accept', 'application/json'],
    ['Accept-Encoding', 'identity'],
    ['Connection', 'keep-alive'],
  ];
  const json200 = (x: { path: string; body: () => unknown }, comment?: string): Exchange => ({
    method: 'GET',
    uri: x.path,
    reqHeaders: reqH,
    code: 200,
    phrase: 'OK',
    respHeaders: [
      ['Cache-Control', 'public, max-age=300'],
      ['Keep-Alive', 'timeout=5'],
      ['Connection', 'keep-alive'],
    ],
    body: x.body(),
    comment,
  });
  const plan: Exchange[][] = [
    [json200(API.profile, db.person.tagline), json200(API.roles), json200(API.education)],
    [json200(API.projects), json200(API.builds)],
    [
      json200(API.devices),
      json200(API.oss),
      json200(API.contact),
      {
        method: 'HEAD',
        uri: db.person.cv,
        reqHeaders: [
          ['Accept', 'application/pdf'],
          ['Connection', 'keep-alive'],
        ],
        code: 200,
        phrase: 'OK',
        respHeaders: [
          ['Content-Type', 'application/pdf'],
          ['Cache-Control', 'public, max-age=86400'],
          ['Keep-Alive', 'timeout=5'],
        ],
      },
    ],
  ];
  const idle = plan.map((list, i) => {
    let at = ready[i] + 0.0006;
    for (const x of list)
      at =
        https(conns[i], at, SITE, x, 0.0024 + r.next() * 0.006, siteRtt) +
        0.0011 +
        r.next() * 0.004;
    return at;
  });
  idle.forEach((at, i) => closeByServer(conns[i], at + 5 + r.next() * 0.01, siteRtt));

  // The page's links are prefetched, and the featured products' sites are opened.
  let tp = 0.92;
  for (const host of products.keys())
    tp = dnsLookup(
      0,
      tp + 0.0013 + r.next() * 0.003,
      you,
      youMac,
      gw,
      gwMac,
      host,
      (products.get(host) as Host).ip,
      0.009 + r.next() * 0.03,
    );
  let tv = 1.6;
  for (const host of FEATURED_HOSTS) {
    const h = products.get(host) as Host;
    const rtt = 0.02 + r.next() * 0.07;
    const c = new Conv(0, youEnd(ephemeral++ + 4), remoteEnd(h, 443), r);
    let at = handshake(c, tv, rtt, host, 'http/1.1');
    const get = opaqueData(r.bytes(r.int(380, 460)), 'Hypertext Transfer Protocol');
    add(
      c.seg((at += 0.0004), 0, PSH | ACK, {
        bytes: get.layer.bytes,
        dissect: () => ({ tree: get.layer.tree, proto: 'TLSv1.3', info: get.info }),
      }),
    );
    for (let i = 0; i < 2; i++) {
      const resp = opaqueData(r.bytes(r.int(900, CHUNK)), 'Hypertext Transfer Protocol');
      add(
        c.seg((at += i ? 0.00012 : rtt + 0.004), 1, PSH | ACK, {
          bytes: resp.layer.bytes,
          dissect: () => ({ tree: resp.layer.tree, proto: 'TLSv1.3', info: resp.info }),
        }),
      );
    }
    add(c.seg((at += 0.0001), 0, ACK));
    tv += 0.35 + r.next() * 0.3;
  }

  /* ---------------- wlan0: the card reader ---------------- */

  const wl = 1;
  const attRtt = 0.0387;
  let tw = dnsLookup(
    wl,
    0.35,
    at01,
    at01Mac,
    campusGw,
    campusMac,
    ATTENDUM_HOST,
    attendum.ip,
    0.0149,
  );
  const rc = new Conv(wl, end(at01, 49153, at01Mac), end(attendum, 443, campusMac), r);
  tw = handshake(rc, tw + 0.002, attRtt, ATTENDUM_HOST, null);
  const ua: [string, string] = ['User-Agent', `${reader.tag} (${reader.chip})`];
  const uid = () =>
    r
      .bytes(7)
      .map((x, i) => (i ? x : 0x04))
      .map((x) => x.toString(16).padStart(2, '0').toUpperCase())
      .join(':');
  const tap = (at: number, tech: string, comment?: string) =>
    https(
      rc,
      at,
      ATTENDUM_HOST,
      {
        method: 'POST',
        uri: '/v1/taps',
        reqHeaders: [ua],
        reqBody: { reader: reader.tag, kind: reader.kind, uid: uid(), tech },
        code: 201,
        phrase: 'Created',
        body: { ok: true },
        pretty: false,
        comment,
      },
      0.011 + r.next() * 0.01,
      attRtt,
      1,
    );
  tw = tap(tw + 0.004, 'NFC', reader.detail);
  const etag = `"${mac(r.bytes(8)).replace(/:/g, '')}"`;
  https(
    rc,
    tw + 0.05,
    ATTENDUM_HOST,
    {
      method: 'GET',
      uri: `/v1/ota/${reader.tag}?chip=${reader.chip}`,
      reqHeaders: [ua, ['If-None-Match', etag]],
      code: 304,
      phrase: 'Not Modified',
      respHeaders: [['ETag', etag]],
    },
    0.006,
    attRtt,
    1,
  );
  for (let at = 17; at < horizon; at += 15 + r.next() * 8) tap(at, r.next() < 0.6 ? 'NFC' : 'RFID');

  /* ---------------- ble0: the beacon ---------------- */

  const bl = 2;
  const beaconAddr: Mac = { b: [0xc0 | r.int(0, 0x3f), ...r.bytes(5)], name: beacon.tag };
  // The reader's Bluetooth address is its base MAC plus two, as that chip derives it.
  const readerBt: Mac = {
    b: [...at01Mac.b.slice(0, 5), (at01Mac.b[5] + 2) & 255],
    name: reader.tag,
  };
  const roomId = r.bytes(4);
  const advAd = [
    { type: 0x01, data: [0x06] },
    { type: 0x09, data: Array.from(utf8(beacon.tag)) },
    { type: 0x0a, data: [0xfc] },
    { type: 0xff, data: [0xff, 0xff, ...roomId] },
  ];
  const airtime = (pduLen: number) => (1 + 4 + 2 + pduLen + 3) * 8e-6;
  const bleEv = (
    at: number,
    rf: number,
    aa: number,
    crcInit: number,
    src: Mac,
    dst: Mac,
    p: BlePdu,
    comment?: string,
  ): Ev => {
    const signal = Math.round(r.near(src === beaconAddr ? -58 : -64, 6));
    const noise = Math.round(r.near(-96, 2));
    const ev: Ev = {
      t: at,
      iface: bl,
      no: 0,
      comment,
      build: () => {
        const out = ble({ rf, signal, noise, aa, crcInit, src, dst }, p);
        return {
          layer: out.layer,
          src: { addr: mac(src.b), name: src.name },
          dst: { addr: mac(dst.b), name: dst.name },
          proto: out.proto,
          info: out.info,
        };
      },
    };
    return add(ev);
  };
  const adv = (at: number) =>
    bleEv(at, 0, ADV_AA, 0x555555, beaconAddr, BROADCAST, {
      kind: 'adv',
      type: 0,
      adv: beaconAddr,
      ad: advAd,
    });
  const scan = (at: number) => {
    const phone: Mac = { b: [0x40 | r.int(0, 0x3f), ...r.bytes(5)] };
    const advEnd = at + airtime(6 + advAd.reduce((s, e) => s + e.data.length + 2, 0)) + 150e-6;
    bleEv(advEnd, 0, ADV_AA, 0x555555, phone, beaconAddr, {
      kind: 'scan_req',
      scanner: phone,
      adv: beaconAddr,
      scannerRandom: true,
    });
    bleEv(advEnd + airtime(12) + 150e-6, 0, ADV_AA, 0x555555, beaconAddr, BROADCAST, {
      kind: 'adv',
      type: 4,
      adv: beaconAddr,
      ad: [{ type: 0x09, data: Array.from(utf8(beacon.name)) }],
    });
  };
  let ta = 0.21;
  const advTimes: number[] = [];
  for (; ta < horizon; ta += 1 + r.next() * 0.01) advTimes.push(ta);
  const connectAt = advTimes.find((x) => x > 3) as number;
  const connEnd = connectAt + 0.42;
  for (const at of advTimes) if (at < connectAt || at > connEnd + 0.3) adv(at);
  advTimes.filter((x, i) => i % 9 === 4 && (x < connectAt || x > connEnd + 0.3)).forEach(scan);
  adv(connectAt);

  // The reader connects to the beacon, reads it, and pushes a firmware image the DFU way.
  const ll = {
    aa: r.int(0x10000000, 0x7fffffff) >>> 0,
    crcInit: r.int(0, 0xffffff),
    win: 3,
    offset: 4,
    interval: 24,
    latency: 0,
    timeout: 400,
    chmap: [0xff, 0xff, 0xff, 0xff, 0x1f],
    hop: 7,
    sca: 1,
  };
  const advLen = 6 + advAd.reduce((s, e) => s + e.data.length + 2, 0);
  const tConnect = connectAt + airtime(advLen) + 150e-6;
  bleEv(tConnect, 0, ADV_AA, 0x555555, readerBt, beaconAddr, {
    kind: 'connect',
    init: readerBt,
    adv: beaconAddr,
    ll,
  });
  const anchor0 = tConnect + airtime(34) + 1.25e-3 + ll.offset * 1.25e-3 + 0.6e-3;
  const firmware = r.bytes(244 * 3);
  const crc32 = (data: number[]) => {
    let c = 0xffffffff;
    for (const x of data) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const le32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const svc128 = r.bytes(16);
  const steps: [AttPdu | null, AttPdu | null][] = [
    [{ op: 0x02, mtu: 247 }, null],
    [null, { op: 0x03, mtu: 247 }],
    [{ op: 0x10, start: 0x0001, end: 0xffff, uuid: 0x2800 }, null],
    [
      null,
      {
        op: 0x11,
        size: 6,
        items: [
          { start: 0x0001, end: 0x0005, uuid: 0x1800 },
          { start: 0x0006, end: 0x0009, uuid: 0x180a },
        ],
      },
    ],
    [{ op: 0x10, start: 0x000a, end: 0xffff, uuid: 0x2800 }, null],
    [null, { op: 0x11, size: 20, items: [{ start: 0x000a, end: 0x0011, uuid: svc128 }] }],
    [{ op: 0x10, start: 0x0012, end: 0xffff, uuid: 0x2800 }, null],
    [null, { op: 0x01, reqOp: 0x10, handle: 0x0012, error: 0x0a }],
    [{ op: 0x0a, handle: 0x0003 }, null],
    [null, { op: 0x0b, handle: 0x0003, value: Array.from(utf8(beacon.name)) }],
    [{ op: 0x0a, handle: 0x0008 }, null],
    [null, { op: 0x0b, handle: 0x0008, value: Array.from(utf8(beacon.kind)) }],
    [{ op: 0x0a, handle: 0x000c }, null],
    [null, { op: 0x0b, handle: 0x000c, value: Array.from(utf8(beacon.detail)) }],
    [{ op: 0x12, handle: 0x000f, value: [0x01, 0x00] }, null],
    [null, { op: 0x13, handle: 0x000f }],
    [{ op: 0x12, handle: 0x000e, value: [0x01, 0x01, ...le32(firmware.length)] }, null],
    [null, { op: 0x13, handle: 0x000e }],
    [null, { op: 0x1b, handle: 0x000e, value: [0x60, 0x01, 0x01] }],
    [{ op: 0x52, handle: 0x0011, value: firmware.slice(0, 244) }, null],
    [{ op: 0x52, handle: 0x0011, value: firmware.slice(244, 488) }, null],
    [{ op: 0x52, handle: 0x0011, value: firmware.slice(488) }, null],
    [{ op: 0x12, handle: 0x000e, value: [0x03] }, null],
    [null, { op: 0x13, handle: 0x000e }],
    [
      null,
      {
        op: 0x1b,
        handle: 0x000e,
        value: [0x60, 0x03, 0x01, ...le32(firmware.length), ...le32(crc32(firmware))],
      },
    ],
    [{ op: 0x12, handle: 0x000e, value: [0x04] }, null],
    [null, { op: 0x13, handle: 0x000e }],
    [null, { op: 0x1b, handle: 0x000e, value: [0x60, 0x04, 0x01] }],
  ];
  let unmapped = 0;
  const dataPdu = (
    event: number,
    central: boolean,
    att: AttPdu | null,
    control?: number[],
  ): BlePdu => {
    const payload = att ? attPayload(att) : (control ?? []);
    return {
      kind: 'data',
      llid: att ? 2 : control ? 3 : 1,
      nesn: central ? event % 2 : (event + 1) % 2,
      sn: event % 2,
      md: false,
      central,
      payload,
      att: att ?? undefined,
      control: control?.[0],
      event,
      channel: 0,
    };
  };
  const connEvent = (event: number, c: BlePdu, p: BlePdu, comment?: string) => {
    unmapped = (unmapped + ll.hop) % 37;
    const ch = unmapped;
    const at = anchor0 + event * ll.interval * 1.25e-3;
    if (c.kind === 'data') c.channel = ch;
    if (p.kind === 'data') p.channel = ch;
    bleEv(at, dataRf(ch), ll.aa, ll.crcInit, readerBt, beaconAddr, c);
    const cLen = c.kind === 'data' ? c.payload.length : 0;
    bleEv(
      at + airtime(2 + cLen) + 150e-6,
      dataRf(ch),
      ll.aa,
      ll.crcInit,
      beaconAddr,
      readerBt,
      p,
      comment,
    );
  };
  steps.forEach(([c, p], i) =>
    connEvent(
      i,
      dataPdu(i, true, c),
      dataPdu(i, false, p),
      p && p.op === 0x0b && p.handle === 0x000c ? beacon.detail : undefined,
    ),
  );
  connEvent(
    steps.length,
    dataPdu(steps.length, true, null, [0x02, 0x13]),
    dataPdu(steps.length, false, null),
  );

  /* ---------------- broker0: the logger stations ---------------- */

  const bk = 3;
  const brokerEnd = () => end(broker, 1883, brokerMac);
  const ingestConv = new Conv(bk, end(ingest, 44120, ingestMac), brokerEnd(), r);
  // The ingest connection is shared by every station's forwards and its own keepalives, so its
  // segments are queued and created in time order once every station has been scheduled.
  const ingestQ: { t: number; run: () => void }[] = [];
  const lan = 0.00021;
  const mq = (m: MqttMsg) => {
    const out = mqtt(m);
    return {
      bytes: out.layer.bytes,
      dissect: () => ({ tree: out.layer.tree, proto: 'MQTT', info: out.info }),
    };
  };
  let tb = 0.3;
  add(ingestConv.seg(tb, 0, SYN));
  add(ingestConv.seg((tb += lan), 1, SYN | ACK));
  add(ingestConv.seg((tb += 0.00004), 0, ACK));
  add(
    ingestConv.seg(
      (tb += 0.0002),
      0,
      PSH | ACK,
      mq({ type: 'connect', clientId: 'ingest', keepalive: 60 }),
    ),
  );
  add(ingestConv.seg((tb += lan), 1, PSH | ACK, mq({ type: 'connack', sp: false })));
  add(
    ingestConv.seg(
      (tb += 0.0003),
      0,
      PSH | ACK,
      mq({ type: 'subscribe', msgid: 1, topic: `${'logger'}/#`, qos: 1 }),
    ),
  );
  add(ingestConv.seg((tb += lan), 1, PSH | ACK, mq({ type: 'suback', msgid: 1, qos: 1 })));
  const fleetEv = add(
    ingestConv.seg(
      (tb += 0.00003),
      1,
      PSH | ACK,
      mq({ type: 'publish', topic: 'logger/fleet', qos: 0, retain: true, payload: loggerFleet() }),
    ),
  );
  fleetEv.comment = logger.detail;
  add(ingestConv.seg((tb += 0.00005), 0, ACK));
  for (let at = 60.3; at < horizon; at += 60) {
    ingestQ.push({
      t: at,
      run: () => {
        add(ingestConv.seg(at, 0, PSH | ACK, mq({ type: 'pingreq' })));
        add(ingestConv.seg(at + lan, 1, PSH | ACK, mq({ type: 'pingresp' })));
        add(ingestConv.seg(at + lan + 0.00004, 0, ACK));
      },
    });
  }
  let ingestMsgId = 1;

  const stations = [3, 7, 12, 19, 26, 31, 38, 44]
    .filter((n) => n <= logger.stations.n)
    .map((n) => `${logger.tag}-${String(n).padStart(2, '0')}`);
  let seqNo = r.int(1200, 9000);
  const telemetry = (id: string) => ({
    station: id,
    seq: seqNo++,
    t_air_c: +r.near(11.5, 4).toFixed(1),
    rh_pct: Math.round(r.near(78, 9)),
    p_hpa: +r.near(1012.6, 4).toFixed(1),
    wind_ms: +Math.abs(r.near(3.2, 2.4)).toFixed(1),
    rain_mm: +(r.next() < 0.7 ? 0 : r.next() * 1.4).toFixed(1),
    csq: r.int(11, 24),
    vbat_v: +r.near(3.94, 0.08).toFixed(2),
  });
  let natPort = r.int(30000, 40000);
  /** A battery-saving GSM station: connect, publish its logs, disconnect. */
  const cycle = (at: number, id: string, lossy: boolean) => {
    const rtt = 0.34 + r.next() * 0.42;
    const c = new Conv(bk, end(carrier, (natPort += r.int(3, 40)), edgeMac), brokerEnd(), r);
    add(c.seg(at, 0, SYN));
    add(c.seg((at += 0.0001), 1, SYN | ACK));
    add(c.seg((at += rtt), 0, ACK));
    add(
      c.seg(
        (at += 0.0007),
        0,
        PSH | ACK,
        mq({
          type: 'connect',
          clientId: id,
          keepalive: 300,
          will: { topic: `logger/${id}/status`, msg: 'offline', qos: 1, retain: true },
        }),
      ),
    );
    const connAck = add(c.seg((at += 0.0001), 1, PSH | ACK, mq({ type: 'connack', sp: false })));
    let msgid = 1;
    const forward = (t2: number, payload: unknown) =>
      ingestQ.push({
        t: t2,
        run: () => {
          const mid = ++ingestMsgId;
          add(
            ingestConv.seg(
              t2,
              1,
              PSH | ACK,
              mq({
                type: 'publish',
                topic: `logger/${id}/telemetry`,
                qos: 1,
                retain: false,
                msgid: mid,
                payload,
              }),
            ),
          );
          add(ingestConv.seg(t2 + lan + 0.0001, 0, PSH | ACK, mq({ type: 'puback', msgid: mid })));
        },
      });
    const readings = [telemetry(id), telemetry(id)];
    if (lossy) {
      // The first publish is lost on the radio link: the broker sees the second, a gap before it,
      // ACKs what it has twice, then the retransmission fills the hole.
      const first = mq({
        type: 'publish',
        topic: `logger/${id}/telemetry`,
        qos: 1,
        retain: false,
        msgid: msgid++,
        payload: readings[0],
      });
      const firstSeq = c.skip(0, first.bytes.length);
      at += rtt + 0.03;
      add(
        c.seg(
          at,
          0,
          PSH | ACK,
          mq({
            type: 'publish',
            topic: `logger/${id}/telemetry`,
            qos: 1,
            retain: false,
            msgid: msgid++,
            payload: readings[1],
          }),
          { lost: true },
        ),
      );
      add(c.seg((at += 0.0001), 1, ACK, undefined, { dupOf: connAck, dupNum: 1, ack: firstSeq }));
      add(
        c.seg((at += 1.2 + r.next() * 0.4), 0, PSH | ACK, first, { retrans: true, seq: firstSeq }),
      );
      add(c.seg((at += 0.0001), 1, PSH | ACK, mq({ type: 'puback', msgid: 1 })));
      add(c.seg((at += 0.00008), 1, PSH | ACK, mq({ type: 'puback', msgid: 2 })));
      forward(at + 0.0003, readings[0]);
      forward(at + 0.0009, readings[1]);
    } else {
      for (const reading of readings) {
        at += rtt + 0.02 + r.next() * 0.05;
        add(
          c.seg(
            at,
            0,
            PSH | ACK,
            mq({
              type: 'publish',
              topic: `logger/${id}/telemetry`,
              qos: 1,
              retain: false,
              msgid: msgid,
              payload: reading,
            }),
          ),
        );
        add(c.seg(at + 0.0001, 1, PSH | ACK, mq({ type: 'puback', msgid: msgid++ })));
        forward(at + 0.0004, reading);
      }
    }
    at += rtt / 2 + 0.05;
    add(c.seg(at, 0, PSH | ACK, mq({ type: 'disconnect' })));
    add(c.seg((at += 0.0002), 1, FIN | ACK));
    add(c.seg((at += rtt), 0, FIN | ACK));
    add(c.seg((at += 0.0001), 1, ACK));
  };
  cycle(0.8, stations[0], false);
  cycle(5.6, stations[1], true);
  let si = 2;
  for (let at = 13; at < horizon; at += 10 + r.next() * 5)
    cycle(at, stations[si++ % stations.length], r.next() < 0.12);
  ingestQ.sort((a, b) => a.t - b.t).forEach((q) => q.run());

  /* ---------------- plc0: the Mini PLC and the EPC ---------------- */

  const pl = 4;
  const plcLan = 0.00034;
  // NTP first: the PLC sets its clock before it polls anything.
  {
    const u = new Udp();
    const t1 = 0.05;
    const t2 = t1 + 0.00041;
    const port = 49200 + r.int(0, 300);
    const when = (e: number) => arrival(e);
    const refid = [192, 0, 2, 123];
    const mk = (at: number, server: boolean) => {
      const tt = u.times(at);
      return {
        t: at,
        iface: pl,
        no: 0,
        udp: u,
        build: () => {
          const m = ntp({
            mode: server ? 4 : 3,
            stratum: server ? 2 : 0,
            poll: 6,
            precision: server ? -24 : -18,
            rootDelay: server ? 0.0123 : 0,
            rootDisp: server ? 0.0291 : 0,
            refid: server ? refid : [0, 0, 0, 0],
            ref: server ? epoch0 - 41.7 : 0,
            org: server ? epoch0 + t1 : 0,
            rec: server ? epoch0 + t1 + 0.00017 : 0,
            xmt: server ? epoch0 + t2 - 0.00002 : epoch0 + t1,
            when,
          });
          const [s, d, sp, dp, sm, dm] = server
            ? [plcGw, plc01, 123, port, plcGwMac, plcMac]
            : [plc01, plcGw, port, 123, plcMac, plcGwMac];
          const uu = udp(sp, dp, s.ip, d.ip, m.layer, u.stream, tt.rel, tt.delta);
          return {
            layer: ether(
              dm,
              sm,
              0x0800,
              ipv4(s.ip, d.ip, 17, uu, {
                id: r.int(0, 0xffff),
                ttl: s.ttl,
                srcName: s.name,
                dstName: d.name,
              }),
            ),
            src: { addr: ip4(s.ip), name: s.name },
            dst: { addr: ip4(d.ip), name: d.name },
            proto: 'NTP',
            info: m.info,
            udp: u,
            dir: (server ? 1 : 0) as 0 | 1,
            sport: sp,
            dport: dp,
            payload: m.layer.bytes,
          };
        },
      } as Ev;
    };
    add(mk(t1, false), mk(t2, true));
  }
  const arpPair = (at: number, sMac: Mac, s: Host, tMac: Mac, target: Host) => {
    const q: Ev = {
      t: at,
      iface: pl,
      no: 0,
      build: () => {
        const a = arp(1, sMac, s.ip, tMac, target.ip);
        return {
          layer: ether(BROADCAST, sMac, 0x0806, a.layer, true),
          src: { addr: mac(sMac.b), name: macName(sMac) },
          dst: { addr: mac(BROADCAST.b), name: 'Broadcast' },
          proto: 'ARP',
          info: a.info,
        };
      },
    };
    const rep: Ev = {
      t: at + plcLan,
      iface: pl,
      no: 0,
      build: () => {
        const a = arp(2, tMac, target.ip, sMac, s.ip);
        return {
          layer: ether(sMac, tMac, 0x0806, a.layer, true),
          src: { addr: mac(tMac.b), name: macName(tMac) },
          dst: { addr: mac(sMac.b), name: macName(sMac) },
          proto: 'ARP',
          info: a.info,
        };
      },
    };
    add(q, rep);
  };
  arpPair(0.1, plcMac, plc01, epcMac, epc01);

  const mb = (
    c: Conv,
    at: number,
    trans: number,
    req: ModbusPdu,
    resp: ModbusPdu,
    epcMap?: { psp: number; ppv: number; fsp: number; fpv: number },
    comment?: string,
    lateAck = true,
  ) => {
    const link: { resp?: Ev } = {};
    const enc = (p: ModbusPdu, link: () => Ev | undefined, time?: number) => {
      const bytes = modbus(trans, 1, p, {}).layer.bytes;
      return {
        bytes,
        dissect: () => {
          const out = modbus(trans, 1, p, { link: no(link()), time, epc: epcMap });
          return { tree: out.layer.tree, proto: 'Modbus/TCP', info: out.info };
        },
      };
    };
    const rt = plcLan + 0.0019 + r.next() * 0.0012;
    const reqEv = add(
      c.seg(
        at,
        0,
        PSH | ACK,
        enc(req, () => link.resp),
      ),
    );
    const respEv = add(
      c.seg(
        at + rt,
        1,
        PSH | ACK,
        enc(resp, () => reqEv, rt),
      ),
    );
    link.resp = respEv;
    if (comment) respEv.comment = comment;
    if (lateAck) add(c.seg(at + rt + 0.25, 0, ACK));
  };

  const plcConv = new Conv(pl, end(plc01, 49153, plcMac), end(epc01, 502, epcMac), r);
  let tl = 0.1004;
  add(plcConv.seg((tl += 0.0003), 0, SYN));
  add(plcConv.seg((tl += plcLan), 1, SYN | ACK));
  add(plcConv.seg((tl += 0.00005), 0, ACK));
  let trans = 1;
  mb(
    plcConv,
    (tl += 0.001),
    trans++,
    { fc: 43, req: true },
    { fc: 43, req: false, objects: identity(epc) },
    undefined,
    epc.detail,
  );

  const hmiConv = new Conv(pl, end(hmi, 50114, hmiMac), end(plc01, 502, plcMac), r);
  let th = 0.62;
  add(hmiConv.seg(th, 0, SYN));
  add(hmiConv.seg((th += plcLan), 1, SYN | ACK));
  add(hmiConv.seg((th += 0.00005), 0, ACK));
  mb(
    hmiConv,
    (th += 0.0008),
    1,
    { fc: 43, req: true },
    { fc: 43, req: false, objects: identity(plc) },
    undefined,
    plc.detail,
    false,
  );
  add(hmiConv.seg((th += 0.004), 0, FIN | ACK));
  add(hmiConv.seg((th += plcLan), 1, FIN | ACK));
  add(hmiConv.seg((th += 0.00005), 0, ACK));

  // The control loop: the EPC holds pressure and flow at their setpoints; the PLC polls and
  // now and then moves the pressure setpoint, and the reading follows with a first-order lag.
  let psp = 2.5;
  let ppv = 2.48;
  const fsp = 12;
  let fpv = 11.9;
  let lastPoll = 0.5;
  const nextSp = [3, 2.5, 2.8, 2.2, 2.5];
  let spIdx = 0;
  for (let at = 0.5; at < horizon; at += 2 + r.next() * 0.004) {
    const dt = at - lastPoll;
    lastPoll = at;
    ppv += (psp - ppv) * (1 - Math.exp(-dt / 3)) + r.near(0, 0.01);
    fpv += (fsp - fpv) * (1 - Math.exp(-dt / 1.5)) + r.near(0, 0.05);
    const regs = [
      Math.round(psp * 100),
      Math.round(ppv * 100),
      Math.round(fsp * 10),
      Math.round(fpv * 10),
    ];
    const snap = { psp: regs[0] / 100, ppv: regs[1] / 100, fsp: regs[2] / 10, fpv: regs[3] / 10 };
    mb(
      plcConv,
      at,
      trans++ & 0xffff,
      { fc: 3, req: true, ref: 0, count: 4 },
      { fc: 3, req: false, regs },
      snap,
    );
    if ((at > 5 && spIdx === 0) || (at > 50 + spIdx * 45 && spIdx > 0 && spIdx < nextSp.length)) {
      psp = nextSp[spIdx++];
      const value = Math.round(psp * 100);
      mb(
        plcConv,
        at + 0.31,
        trans++ & 0xffff,
        { fc: 6, req: true, ref: 0, value },
        { fc: 6, req: false, ref: 0, value },
      );
    }
  }

  /* ---------------- merge, number, build ---------------- */

  // pcapng stores microseconds: every time is rounded to that before anything reads it back.
  for (const e of evs) e.t = Math.round(e.t * 1e6) / 1e6;
  evs.sort((a, b) => a.t - b.t);
  const kept = evs.slice(0, limit);
  kept.forEach((e, i) => (e.no = i + 1));
  for (const e of kept) if (e.conv) e.conv.flags |= e.cflags ?? 0;

  let nextTcp = 0;
  let nextUdp = 0;
  let prevT = 0;
  const packets: Packet[] = kept.map((e) => {
    if (e.conv && e.conv.stream < 0) e.conv.stream = nextTcp++;
    if (e.udp && e.udp.stream < 0) e.udp.stream = nextUdp++;
    const b = e.build();
    const bytes = Uint8Array.from(b.layer.bytes);
    const protos = b.layer.tree
      .filter((n) => n.f && FIELDS.get(n.f)?.type === 'proto')
      .map((n) => n.f as string);
    const chain = protos.flatMap((p) => (p === 'eth' ? ['eth', 'ethertype'] : [p])).join(':');
    const iface = IFACES[e.iface];
    const delta = e.t - prevT;
    prevT = e.t;
    const len = bytes.length;
    const frame: Node = {
      t: `Frame ${e.no}: ${len} bytes on wire (${len * 8} bits), ${len} bytes captured (${len * 8} bits) on interface ${iface.name}, id ${e.iface}`,
      f: 'frame',
      o: 0,
      n: len,
      e: 'frame',
      k: [
        { t: 'Section number: 1', f: 'frame.section_number', v: 1, o: 0, n: 0 },
        {
          t: `Interface id: ${e.iface} (${iface.name})`,
          f: 'frame.interface_id',
          v: e.iface,
          o: 0,
          n: 0,
          e: 'frame.interface',
          k: [
            {
              t: `Interface name: ${iface.name}`,
              f: 'frame.interface_name',
              v: iface.name,
              o: 0,
              n: 0,
            },
            {
              t: `Interface description: ${iface.desc}`,
              f: 'frame.interface_description',
              v: iface.desc,
              o: 0,
              n: 0,
            },
          ],
        },
        {
          t: `Encapsulation type: ${iface.link} (${iface.encap})`,
          f: 'frame.encap_type',
          v: iface.encap,
          o: 0,
          n: 0,
        },
        {
          t: `Arrival Time: ${arrival(epoch0 + e.t)}`,
          f: 'frame.time',
          v: arrival(epoch0 + e.t),
          o: 0,
          n: 0,
        },
        {
          t: `UTC Arrival Time: ${arrival(epoch0 + e.t)}`,
          f: 'frame.time_utc',
          v: arrival(epoch0 + e.t),
          o: 0,
          n: 0,
        },
        {
          t: `Epoch Arrival Time: ${(epoch0 + e.t).toFixed(6)}000`,
          f: 'frame.time_epoch',
          v: epoch0 + e.t,
          o: 0,
          n: 0,
        },
        { t: '[Time shift for this packet: 0.000000000 seconds]', o: 0, n: 0 },
        {
          t: `[Time delta from previous captured frame: ${delta.toFixed(6)}000 seconds]`,
          f: 'frame.time_delta',
          v: delta,
          o: 0,
          n: 0,
        },
        {
          t: `[Time since reference or first frame: ${e.t.toFixed(6)}000 seconds]`,
          f: 'frame.time_relative',
          v: e.t,
          o: 0,
          n: 0,
        },
        { t: `Frame Number: ${e.no}`, f: 'frame.number', v: e.no, o: 0, n: 0 },
        { t: `Frame Length: ${len} bytes (${len * 8} bits)`, f: 'frame.len', v: len, o: 0, n: 0 },
        {
          t: `Capture Length: ${len} bytes (${len * 8} bits)`,
          f: 'frame.cap_len',
          v: len,
          o: 0,
          n: 0,
        },
        { t: '[Frame is marked: False]', f: 'frame.marked', o: 0, n: 0 },
        { t: '[Frame is ignored: False]', f: 'frame.ignored', v: false, o: 0, n: 0 },
        { t: `[Protocols in frame: ${chain}]`, f: 'frame.protocols', v: chain, o: 0, n: 0 },
        { t: '[Coloring Rule Name: ]', f: 'frame.coloring_rule.name', o: 0, n: 0 },
        { t: '[Coloring Rule String: ]', f: 'frame.coloring_rule.string', o: 0, n: 0 },
      ],
    };
    const tree: Node[] = [frame, ...b.layer.tree];
    if (e.comment)
      tree.unshift({
        t: 'Packet comments',
        f: 'pkt_comment',
        o: 0,
        n: 0,
        e: 'pkt_comment',
        k: [
          {
            t: e.comment,
            f: 'frame.comment',
            v: e.comment,
            o: 0,
            n: 0,
            e: 'frame.comment',
            k: [expert('comment', 'Comment', e.comment)],
          },
        ],
      });
    return {
      no: e.no,
      t: e.t,
      epoch: epoch0 + e.t,
      iface: e.iface,
      len,
      srcs: [{ label: `Frame (${len} bytes)`, bytes }, ...(b.srcs ?? [])],
      tree,
      src: b.src,
      dst: b.dst,
      proto: b.proto,
      info: b.info,
      tcp: b.tcp?.stream,
      udp: b.udp?.stream,
      dir: b.dir,
      sport: b.sport,
      dport: b.dport,
      seq: b.seq,
      payload: b.payload ? Uint8Array.from(b.payload) : undefined,
      plain: b.plain ? Uint8Array.from(b.plain) : undefined,
      retrans: b.retrans,
      protos: ['frame', ...protos],
      comment: e.comment,
    };
  });
  return { packets, epoch0, scriptEnd: 12, limit };
}
