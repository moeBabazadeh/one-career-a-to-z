// What each transmitter sends: a chapter of the site, serialised the way that radio would carry
// it, then encoded into real frames with ./codec and parsed back by the same decoders a sniffer
// would use. The beacon advertises About, the Logger stations text Experience and Hardware, the
// card readers post Projects, Roots and Open source over Wi-Fi, and a card tap reads Contact.
import {
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  otherProjects,
  roots,
  skills,
} from '../_shared/data';
import {
  AD,
  TEST_COMPANY,
  adStruct,
  bleAdvertise,
  bleDecode,
  concat,
  fromUtf8,
  ndefMessage,
  ndefMime,
  ndefParse,
  ndefUri,
  nfcDecode,
  nfcExchange,
  prng,
  smsDecode,
  smsSubmit,
  transliterate,
  utf8,
  wifiDecode,
  wifiSegment,
  type Bytes,
  type Link,
  type Row,
} from './codec';

export type ChapterId =
  'about' | 'experience' | 'projects' | 'hardware' | 'oss' | 'roots' | 'contact';

export interface Frame {
  /** Position in the transmitter's cycle. */
  k: number;
  summary: string;
  rows: Row[];
  /** The bytes as captured: on air for BLE and NFC, the PDU for SMS, the MPDU for Wi-Fi. */
  bytes: Bytes;
  ok: boolean;
  /** Who sent it, where that matters (NFC is half duplex). */
  dir?: string;
  /** The decoded payload text this frame carried. */
  piece: string;
}

export interface Program {
  frames: Frame[];
  /** The payload put back together from the frames received so far, with gaps marked. */
  assemble: (got: ArrayLike<number>) => string;
}

const { person, current } = db;

/* ------------------------------------------------------------------ texts */

const roleBlock = (r: db.Role) =>
  [
    `${fmt.monthSpan(r.from, r.to)} · ${r.org}${r.contract ? ' (contract)' : ''}`,
    db.titlePath(r),
    r.summary,
    ...r.duties.map((d) => `- ${d}`),
  ].join('\n');

const deviceBlock = (d: (typeof hardware)[number]) =>
  [`${d.tag} ${d.name} · ${d.kind}`, d.detail, d.figures.join(' · ')].join('\n');

export const texts = {
  about: [
    person.name,
    `${current.title} · ${current.company}`,
    `${person.headline}. ${person.tagline}`,
    '',
    ...db.about.flatMap((p) => [p, '']),
    `Skills: ${skills.join(', ')}`,
  ].join('\n'),
  experience: db.roleList.map(roleBlock).join('\n\n'),
  hardware: hardware.map(deviceBlock).join('\n\n'),
};

const vcard = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  `N:${person.name.split(' ').slice(1).join(' ')};${person.first}`,
  `FN:${person.name}`,
  `TITLE:${current.title}`,
  `ORG:${current.company}`,
  `EMAIL;TYPE=INTERNET:${person.email}`,
  `URL:${person.url}`,
  `NOTE:${person.tagline}`,
  'END:VCARD',
  '',
].join('\r\n');

export const contactLinks = [
  { label: 'Email', url: `mailto:${person.email}`, text: person.email },
  {
    label: 'LinkedIn',
    url: person.linkedin,
    text: person.linkedin.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''),
  },
  { label: 'GitHub', url: person.github, text: person.github.replace(/^https:\/\//, '') },
  { label: 'CV', url: `${person.url}${person.cv}`, text: `${person.site}${person.cv}` },
];

const json = {
  projects: () => ({
    featured: featuredProjects.map(({ title, description, tech, links }) => ({
      title,
      description,
      tech,
      links,
    })),
    more: otherProjects,
    builds: archive,
  }),
  roots: () => ({
    roots,
    undated: [{ title: db.robots.quadcopter.title, detail: db.robots.quadcopter.detail }],
  }),
  oss: () => ({ weeklyDownloads: db.downloads.weekly.long, contributions: oss }),
};

/* ------------------------------------------------------------------ BLE: the beacon advertises About */

const rand = prng(0x5d12);
const bytesOf = (n: number, first?: number) =>
  Uint8Array.from({ length: n }, (_, i) =>
    i === 0 && first !== undefined ? first : Math.floor(rand() * 256),
  );

/** A static random address: the top two bits set. */
const ADV_A = (() => {
  const a = bytesOf(6);
  a[0] |= 0xc0;
  return a;
})();
const FRAG = 25;

function bleProgram(channel: number): Program {
  const pieces: string[] = [];
  let cur = '';
  for (const ch of texts.about) {
    if (utf8(cur + ch).length > FRAG) {
      pieces.push(cur);
      cur = '';
    }
    cur += ch;
  }
  pieces.push(cur);
  const total = pieces.length;
  const head = concat(
    adStruct(AD.flags, [0x06]),
    adStruct(AD.name, utf8(person.name)),
    adStruct(AD.tx, [0x00]),
  );
  const payloads = [
    head,
    ...pieces.map((p, i) =>
      adStruct(AD.mfr, concat([TEST_COMPANY & 0xff, TEST_COMPANY >> 8, i, total], utf8(p))),
    ),
  ];
  const frames = payloads.map((adv, k): Frame => {
    const bytes = bleAdvertise(ADV_A, adv, channel);
    const d = bleDecode(bytes, channel);
    const mfr = d.ad.find((a) => a.type === AD.mfr);
    const name = d.ad.find((a) => a.type === AD.name);
    return {
      k,
      bytes,
      rows: d.rows,
      ok: d.ok,
      dir: `ch ${channel}`,
      summary: mfr
        ? `ADV_NONCONN_IND ${d.advA} frag ${mfr.data[2] + 1}/${mfr.data[3]}`
        : `ADV_NONCONN_IND ${d.advA} “${name ? fromUtf8(name.data) : ''}”`,
      piece: mfr ? fromUtf8(mfr.data.slice(4)) : '',
    };
  });
  return {
    frames,
    assemble: (got) =>
      frames.map((f, i) => (got[i] ? f.piece : '░'.repeat(Math.min(f.piece.length, 12)))).join(''),
  };
}

/* ------------------------------------------------------------------ GSM: the Logger stations text */

function smsProgram(text: string, ref: number): Program {
  const pdus = smsSubmit(transliterate(text), ref, ref * 3);
  const frames = pdus.map((bytes, k): Frame => {
    const d = smsDecode(bytes);
    return {
      k,
      bytes,
      rows: d.rows,
      ok: true,
      summary: `SMS-SUBMIT ref ${ref} part ${d.seq}/${d.total} · ${bytes.length} octets`,
      piece: d.text,
    };
  });
  return {
    frames,
    assemble: (got) =>
      frames
        .map((f, i) => (got[i] ? f.piece : `\n░░░ part ${i + 1} of ${frames.length} missing ░░░\n`))
        .join(''),
  };
}

/* ------------------------------------------------------------------ Wi-Fi: the card readers post */

const MSS = 536;

function wifiProgram(path: string, body: object, channel: number, seed: number): Program {
  const r = prng(seed);
  const b = (n: number, first: number) =>
    Uint8Array.from({ length: n }, (_, i) => (i === 0 ? first : Math.floor(r() * 256)));
  const link: Link = {
    bssid: b(6, 0x06),
    sta: b(6, 0x02),
    dst: b(6, 0x0a),
    srcIp: [10, 20, channel, 10 + Math.floor(r() * 200)],
    // 203.0.113.0/24 is TEST-NET-3, kept for documentation: no real host.
    dstIp: [203, 0, 113, 10 + channel],
    sport: 49152 + Math.floor(r() * 16000),
    dport: 443,
  };
  const content = JSON.stringify(body);
  const req = utf8(
    `POST ${path} HTTP/1.1\r\nHost: ${person.site}\r\nContent-Type: application/json\r\nContent-Length: ${utf8(content).length}\r\n\r\n${content}`,
  );
  const isn = Math.floor(r() * 2 ** 31);
  const ack = Math.floor(r() * 2 ** 31);
  const frames: Frame[] = [];
  for (let off = 0, k = 0; off < req.length; off += MSS, k++) {
    const seg = req.slice(off, off + MSS);
    const bytes = wifiSegment(link, isn + off, ack, seg, 100 + k, 0x3000 + k, 0x18);
    const d = wifiDecode(bytes, channel);
    frames.push({ k, bytes, rows: d.rows, ok: d.ok, summary: d.summary, piece: fromUtf8(seg) });
  }
  return {
    frames,
    assemble: (got) => {
      const all = frames.every((_, i) => got[i]);
      if (!all)
        return frames
          .map((f, i) =>
            got[i] ? f.piece : `\n░░░ segment ${i + 1} of ${frames.length} not yet received ░░░\n`,
          )
          .join('');
      // Complete: reassemble by sequence number and parse the HTTP body, as a real dissector would.
      const raw = frames.map((f) => f.piece).join('');
      const [headers, payload] = raw.split('\r\n\r\n');
      return `${headers}\r\n\r\n${JSON.stringify(JSON.parse(payload), null, 2)}`;
    },
  };
}

/* ------------------------------------------------------------------ NFC: a card tap reads Contact */

function nfcProgram(): Program {
  const r = prng(0x13560);
  const uid = Uint8Array.from([0x08, ...Array.from({ length: 3 }, () => Math.floor(r() * 256))]);
  const msg = ndefMessage([
    ndefMime('text/vcard', vcard),
    ...contactLinks.map((l) => ndefUri(l.url)),
  ]);
  const raw = nfcExchange(uid, msg);
  const frames = raw.map((f, k): Frame => {
    const d = nfcDecode(f, raw[k - 1]);
    return {
      k,
      bytes: f.bytes,
      rows: d.rows,
      ok: d.ok,
      dir: f.dir === 'PCD' ? 'R→C' : 'C→R',
      summary: d.summary,
      piece: d.data ? fromUtf8(d.data.bytes) : '',
    };
  });
  const carriers = raw.map((f, k) => nfcDecode(f, raw[k - 1]).data);
  return {
    frames,
    assemble: (got) => {
      const buf = new Uint8Array(msg.length);
      let have = 0;
      carriers.forEach((c, i) => {
        if (c && got[i]) {
          buf.set(c.bytes, c.offset);
          have += c.bytes.length;
        }
      });
      if (have < msg.length) {
        return `NDEF file: ${have} of ${msg.length} bytes read\n\n${fromUtf8(buf)
          .replace(/\u0000+/g, ' ░░░ ')
          .replace(/[\x01-\x09\x0b\x0c\x0e-\x1f]/g, '·')}`;
      }
      return ndefParse(buf)
        .map(
          (rec, i) =>
            `Record ${i + 1} · ${rec.tnf === 2 ? `MIME ${rec.type}` : `URI`}\n${rec.text.trim()}`,
        )
        .join('\n\n');
    },
  };
}

/* ------------------------------------------------------------------ the set */

const cache = new Map<string, Program>();

/** A transmitter's program, built on first use. BLE frames depend on the channel they're whitened for. */
export function program(id: ChapterId, channel = 37): Program {
  const key = `${id}:${id === 'about' ? channel : ''}`;
  let p = cache.get(key);
  if (!p) {
    if (id === 'about') p = bleProgram(channel);
    else if (id === 'experience') p = smsProgram(texts.experience, 0x2a);
    else if (id === 'hardware') p = smsProgram(texts.hardware, 0x51);
    else if (id === 'projects') p = wifiProgram('/projects', json.projects(), 1, 0x2412);
    else if (id === 'roots') p = wifiProgram('/roots', json.roots(), 6, 0x2437);
    else if (id === 'oss') p = wifiProgram('/open-source', json.oss(), 11, 0x2462);
    else p = nfcProgram();
    cache.set(key, p);
  }
  return p;
}

/** Frames in a transmitter's cycle (the same on every channel). */
export const frameCount = (id: ChapterId) => program(id).frames.length;
