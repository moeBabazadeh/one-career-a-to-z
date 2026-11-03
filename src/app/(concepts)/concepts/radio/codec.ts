// The four air interfaces the receiver decodes, encoded and decoded for real: BLE advertising
// (CRC-24 and channel whitening), GSM SMS PDUs (7-bit packing, concatenation), NFC-A with an NFC
// Forum Type 4 tag (CRC_A, ISO-DEP, NDEF), and 802.11 data frames (IPv4 and TCP checksums,
// CRC-32 FCS). Every frame the decoder shows is built here as bytes and parsed back from them.
// Nothing in this file is a fact; it is all protocol.

export type Bytes = Uint8Array;

const enc = new TextEncoder();
const dec = new TextDecoder();
export const utf8 = (s: string) => enc.encode(s);
export const fromUtf8 = (b: Bytes) => dec.decode(b);

export const h2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
export const hex = (b: ArrayLike<number>, sep = ' ') => Array.from(b, h2).join(sep);
const h4 = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();

export function concat(...parts: (Bytes | number[])[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A small seeded PRNG (mulberry32), for texture that must be the same on every render. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rev8 = (b: number) => {
  let r = 0;
  for (let i = 0; i < 8; i++) r |= ((b >> i) & 1) << (7 - i);
  return r;
};

/** One row of a dissection tree: a field and its value, indented by depth. */
export type Row = [label: string, value: string, depth?: number];

/* ================================================================== BLE */

/** The access address every advertising packet uses. */
export const BLE_ADV_AA = 0x8e89bed6;
export const bleChannelMHz = (ch: number) =>
  ch === 37
    ? 2402
    : ch === 38
      ? 2426
      : ch === 39
        ? 2480
        : ch <= 10
          ? 2404 + 2 * ch
          : 2428 + 2 * (ch - 11);

/** CRC-24, x²⁴+x¹⁰+x⁹+x⁶+x⁴+x³+x+1, data LSB first, preset 0x555555 on advertising channels. */
export function crc24(data: Bytes, init = 0x555555) {
  let r = init;
  for (const byte of data) {
    for (let i = 0; i < 8; i++) {
      const top = (r >> 23) & 1;
      r = (r << 1) & 0xffffff;
      if (top !== ((byte >> i) & 1)) r ^= 0x00065b;
    }
  }
  return r;
}

/** Data whitening, x⁷+x⁴+1 seeded from the channel index. Its own inverse. */
export function whiten(data: Bytes, channel: number) {
  const out = new Uint8Array(data);
  let lfsr = rev8(channel) | 2;
  for (let i = 0; i < out.length; i++) {
    for (let m = 1; m < 0x100; m <<= 1) {
      if (lfsr & 0x80) {
        lfsr ^= 0x11;
        out[i] ^= m;
      }
      lfsr = (lfsr << 1) & 0xff;
    }
  }
  return out;
}

export const AD = { flags: 0x01, name: 0x09, tx: 0x0a, uri: 0x24, mfr: 0xff } as const;
/** Company 0xFFFF: the identifier the Bluetooth assigned numbers keep for testing, owned by no one. */
export const TEST_COMPANY = 0xffff;

export const adStruct = (type: number, data: Bytes | number[]) =>
  concat([data.length + 1, type], data);

const PDU_TYPES = [
  'ADV_IND',
  'ADV_DIRECT_IND',
  'ADV_NONCONN_IND',
  'SCAN_REQ',
  'SCAN_RSP',
  'CONNECT_IND',
  'ADV_SCAN_IND',
];
const ADV_NONCONN_IND = 2;

/** An ADV_NONCONN_IND from a random static address, as it goes on air on `channel`: whitened PDU and CRC. */
export function bleAdvertise(advA: Bytes, advData: Bytes, channel: number) {
  const pdu = concat(
    [ADV_NONCONN_IND | 0x40, 6 + advData.length],
    Array.from(advA).reverse(),
    advData,
  );
  const crc = crc24(pdu);
  return whiten(concat(pdu, [rev8(crc >> 16), rev8((crc >> 8) & 0xff), rev8(crc & 0xff)]), channel);
}

export interface BleDecoded {
  rows: Row[];
  ok: boolean;
  advA: string;
  ad: { type: number; data: Bytes }[];
}

const mac = (b: ArrayLike<number>) => Array.from(b, h2).join(':');

/** De-whitens, checks the CRC and splits the AD structures. */
export function bleDecode(air: Bytes, channel: number): BleDecoded {
  const raw = whiten(air, channel);
  const len = raw[1];
  const pdu = raw.slice(0, 2 + len);
  const crcRx = (rev8(raw[2 + len]) << 16) | (rev8(raw[3 + len]) << 8) | rev8(raw[4 + len]);
  const crc = crc24(pdu);
  const advA = mac(Array.from(pdu.slice(2, 8)).reverse());
  const ad: { type: number; data: Bytes }[] = [];
  for (let i = 8; i < pdu.length;) {
    const l = pdu[i];
    if (!l) break;
    ad.push({ type: pdu[i + 1], data: pdu.slice(i + 2, i + 1 + l) });
    i += l + 1;
  }
  const rows: Row[] = [
    ['Access address', `0x${BLE_ADV_AA.toString(16).toUpperCase()} (advertising)`],
    [
      'Channel',
      `${channel} · ${bleChannelMHz(channel)} MHz · whitening seed ${h2(rev8(channel) | 2)}`,
    ],
    ['PDU type', `${PDU_TYPES[pdu[0] & 0x0f]} (0x${h2(pdu[0] & 0x0f)})`],
    ['TxAdd', pdu[0] & 0x40 ? 'random' : 'public', 1],
    ['Length', `${len} bytes`, 1],
    ['AdvA', `${advA} (static random)`],
  ];
  for (const s of ad) {
    if (s.type === AD.flags)
      rows.push([
        'AD 0x01 Flags',
        `0x${h2(s.data[0])} · LE general discoverable, BR/EDR not supported`,
      ]);
    else if (s.type === AD.name)
      rows.push(['AD 0x09 Complete local name', `“${fromUtf8(s.data)}”`]);
    else if (s.type === AD.tx)
      rows.push(['AD 0x0A Tx power level', `${(s.data[0] << 24) >> 24} dBm`]);
    else if (s.type === AD.mfr) {
      const company = s.data[0] | (s.data[1] << 8);
      rows.push(['AD 0xFF Manufacturer data', `${s.data.length} bytes`]);
      rows.push(['Company', `0x${h4(company)} (reserved for testing)`, 1]);
      rows.push(['Fragment', `${s.data[2] + 1} of ${s.data[3]}`, 1]);
      rows.push(['Text', `“${fromUtf8(s.data.slice(4))}”`, 1]);
    } else rows.push([`AD 0x${h2(s.type)}`, hex(s.data)]);
  }
  rows.push([
    'CRC',
    `0x${crcRx.toString(16).padStart(6, '0').toUpperCase()} ${crcRx === crc ? '✓ ok' : '✗ bad'}`,
  ]);
  return { rows, ok: crcRx === crc, advA, ad };
}

/* ================================================================== GSM SMS */

// The GSM 7-bit default alphabet (3GPP TS 23.038) and its extension table, reached through ESC.
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT: Record<string, number> = {
  '\f': 0x0a,
  '^': 0x14,
  '{': 0x28,
  '}': 0x29,
  '\\': 0x2f,
  '[': 0x3c,
  '~': 0x3d,
  ']': 0x3e,
  '|': 0x40,
  '€': 0x65,
};
const GSM7_EXT_REV = Object.fromEntries(Object.entries(GSM7_EXT).map(([c, v]) => [v, c])) as Record<
  number,
  string
>;

/** What a modem's text mode does with characters the alphabet lacks. */
const TRANSLIT: Record<string, string> = {
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '→': '->',
  '…': '...',
  '·': '-',
  '×': 'x',
  ' ': ' ',
};
export const transliterate = (s: string) => s.replace(/[’‘“”–—→…·× ]/g, (c) => TRANSLIT[c]);

/** The septets for a string, or null if it needs UCS-2. Extension characters take two. */
function septets(s: string): number[][] | null {
  const out: number[][] = [];
  for (const ch of s) {
    const i = GSM7.indexOf(ch);
    if (i >= 0 && i !== 0x1b) out.push([i]);
    else if (ch in GSM7_EXT) out.push([0x1b, GSM7_EXT[ch]]);
    else return null;
  }
  return out;
}

function pack(sept: number[], fill: number) {
  const out = new Uint8Array(Math.ceil((fill + sept.length * 7) / 8));
  let bit = fill;
  for (const s of sept) {
    for (let i = 0; i < 7; i++, bit++) if ((s >> i) & 1) out[bit >> 3] |= 1 << (bit & 7);
  }
  return out;
}

function unpack(b: Bytes, count: number, fill: number) {
  const out: number[] = [];
  let bit = fill;
  for (let n = 0; n < count; n++) {
    let s = 0;
    for (let i = 0; i < 7; i++, bit++) if ((b[bit >> 3] >> (bit & 7)) & 1) s |= 1 << i;
    out.push(s);
  }
  return out;
}

const bcd = (digits: string) => {
  const d = digits.length % 2 ? `${digits}F` : digits;
  const out: number[] = [];
  for (let i = 0; i < d.length; i += 2) out.push(parseInt(d[i + 1] + d[i], 16));
  return out;
};

/** The collector the stations text, as a short code. Texture, not a real number. */
export const SMS_DA = '0000';

/**
 * Splits a text into concatenated SMS-SUBMIT PDUs: GSM 7-bit when every character fits
 * (153 septets a part, an escape never split), otherwise UCS-2 (67 characters a part).
 */
export function smsSubmit(text: string, ref: number, mr0: number): Bytes[] {
  const seps = septets(text);
  const parts: { ud: Bytes; udl: number }[] = [];
  const ucs2 = !seps;
  if (seps) {
    let cur: number[] = [];
    const flush = () => {
      parts.push({ ud: pack(cur, 1), udl: 7 + cur.length });
      cur = [];
    };
    for (const s of seps) {
      if (cur.length + s.length > 153) flush();
      cur.push(...s);
    }
    if (cur.length) flush();
  } else {
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i += 67) {
      const chunk = chars.slice(i, i + 67).join('');
      const ud = new Uint8Array(chunk.length * 2);
      for (let k = 0; k < chunk.length; k++) {
        ud[2 * k] = chunk.charCodeAt(k) >> 8;
        ud[2 * k + 1] = chunk.charCodeAt(k) & 0xff;
      }
      parts.push({ ud, udl: 6 + ud.length });
    }
  }
  return parts.map(({ ud, udl }, i) =>
    concat(
      [0x00, 0x51, (mr0 + i) & 0xff, SMS_DA.length, 0x81],
      bcd(SMS_DA),
      [0x00, ucs2 ? 0x08 : 0x00, 0xa7, udl],
      [0x05, 0x00, 0x03, ref & 0xff, parts.length, i + 1],
      ud,
    ),
  );
}

export interface SmsDecoded {
  rows: Row[];
  text: string;
  ref: number;
  total: number;
  seq: number;
}

/** Parses an SMS-SUBMIT PDU back into its fields and text. */
export function smsDecode(pdu: Bytes): SmsDecoded {
  let i = 0;
  const scaLen = pdu[i++];
  i += scaLen;
  const fo = pdu[i++];
  const mr = pdu[i++];
  const daDigits = pdu[i++];
  const daType = pdu[i++];
  const daBytes = pdu.slice(i, i + Math.ceil(daDigits / 2));
  i += daBytes.length;
  const da = Array.from(daBytes, (b) => `${b & 0x0f}${b >> 4 === 0xf ? '' : b >> 4}`).join('');
  const pid = pdu[i++];
  const dcs = pdu[i++];
  const vp = pdu[i++];
  const udl = pdu[i++];
  const ud = pdu.slice(i);
  const udhi = !!(fo & 0x40);
  const udhl = udhi ? ud[0] : -1;
  const iei = ud.slice(1, 1 + udhl);
  const ref = iei[2],
    total = iei[3],
    seq = iei[4];
  let text = '';
  if (dcs === 0x08) {
    const body = ud.slice(udhl + 1);
    for (let k = 0; k + 1 < body.length; k += 2)
      text += String.fromCharCode((body[k] << 8) | body[k + 1]);
  } else {
    const headerSept = Math.ceil(((udhl + 1) * 8) / 7);
    const fill = headerSept * 7 - (udhl + 1) * 8;
    const body = unpack(ud.slice(udhl + 1), udl - headerSept, fill);
    for (let k = 0; k < body.length; k++) {
      if (body[k] === 0x1b) text += GSM7_EXT_REV[body[++k]] ?? '';
      else text += GSM7[body[k]];
    }
  }
  const vpHours =
    vp <= 143
      ? ((vp + 1) * 5) / 60
      : vp <= 167
        ? 12 + (vp - 143) / 2
        : vp <= 196
          ? (vp - 166) * 24
          : (vp - 192) * 168;
  const rows: Row[] = [
    ['SMSC', scaLen ? 'given' : 'stored in the SIM (length 0)'],
    ['TP-MTI', `SMS-SUBMIT · first octet 0x${h2(fo)}`],
    ['TP-VPF', 'relative', 1],
    ['TP-UDHI', udhi ? 'header present' : 'none', 1],
    ['TP-MR', `${mr}`],
    ['TP-DA', `${da} · type 0x${h2(daType)} (short code, collector)`],
    ['TP-PID', `0x${h2(pid)} · plain SMS`],
    ['TP-DCS', dcs === 0x08 ? '0x08 · UCS-2' : '0x00 · GSM 7-bit default alphabet'],
    ['TP-VP', `0x${h2(vp)} · ${vpHours} h`],
    ['TP-UDL', dcs === 0x08 ? `${udl} octets` : `${udl} septets`],
    ['UDH', `IEI 0x00 concatenated SMS, 8-bit ref`],
    ['Reference', `0x${h2(ref)}`, 1],
    ['Part', `${seq} of ${total}`, 1],
    ['Text', `“${text.length > 64 ? `${text.slice(0, 64)}…` : text}”`],
  ];
  return { rows, text, ref, total, seq };
}

/** The 3GPP channel raster: GSM 900 and DCS 1800 uplink frequencies from an ARFCN, in Hz. */
export function arfcnUplink(n: number) {
  if (n >= 1 && n <= 124) return (890 + 0.2 * n) * 1e6;
  if (n >= 512 && n <= 885) return (1710.2 + 0.2 * (n - 512)) * 1e6;
  throw new Error(`ARFCN ${n} is outside GSM 900 and DCS 1800`);
}
/** Downlink sits 45 MHz above uplink on GSM 900 and 95 MHz above on DCS 1800. */
export const arfcnDownlink = (n: number) => arfcnUplink(n) + (n <= 124 ? 45e6 : 95e6);

/* ================================================================== NFC-A, Type 4 tag, NDEF */

/** ISO/IEC 14443-3 CRC_A: CRC-16/CCITT reflected, preset 0x6363, sent low byte first. */
export function crcA(data: Bytes | number[]): [number, number] {
  let crc = 0x6363;
  for (const b of data) {
    let ch = (b ^ crc) & 0xff;
    ch = (ch ^ (ch << 4)) & 0xff;
    crc = ((crc >> 8) ^ (ch << 8) ^ (ch << 3) ^ (ch >> 4)) & 0xffff;
  }
  return [crc & 0xff, crc >> 8];
}
const withCrc = (b: number[] | Bytes) => concat(b, crcA(b));

const URI_PREFIXES = ['', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:'];

/** A URI record with the NFC Forum's prefix abbreviation. */
function uriPayload(uri: string) {
  let code = 0;
  URI_PREFIXES.forEach((p, i) => {
    if (p && uri.startsWith(p) && p.length > URI_PREFIXES[code].length) code = i;
  });
  return concat([code], utf8(uri.slice(URI_PREFIXES[code].length)));
}

export interface NdefRecord {
  tnf: 1 | 2;
  type: string;
  payload: Bytes;
}

export const ndefUri = (uri: string): NdefRecord => ({
  tnf: 1,
  type: 'U',
  payload: uriPayload(uri),
});
export const ndefMime = (type: string, text: string): NdefRecord => ({
  tnf: 2,
  type,
  payload: utf8(text),
});

export function ndefMessage(records: NdefRecord[]) {
  return concat(
    ...records.map((r, i) => {
      const short = r.payload.length < 256;
      const head =
        (i === 0 ? 0x80 : 0) | (i === records.length - 1 ? 0x40 : 0) | (short ? 0x10 : 0) | r.tnf;
      const len = short
        ? [r.payload.length]
        : [
            r.payload.length >>> 24,
            (r.payload.length >> 16) & 0xff,
            (r.payload.length >> 8) & 0xff,
            r.payload.length & 0xff,
          ];
      return concat([head, r.type.length], len, utf8(r.type), r.payload);
    }),
  );
}

export interface ParsedRecord {
  tnf: number;
  type: string;
  text: string;
}

export function ndefParse(msg: Bytes): ParsedRecord[] {
  const out: ParsedRecord[] = [];
  for (let i = 0; i < msg.length;) {
    const head = msg[i++];
    const typeLen = msg[i++];
    let len: number;
    if (head & 0x10) len = msg[i++];
    else {
      len = ((msg[i] << 24) | (msg[i + 1] << 16) | (msg[i + 2] << 8) | msg[i + 3]) >>> 0;
      i += 4;
    }
    const idLen = head & 0x08 ? msg[i++] : 0;
    const type = fromUtf8(msg.slice(i, i + typeLen));
    i += typeLen + idLen;
    const payload = msg.slice(i, i + len);
    i += len;
    const tnf = head & 0x07;
    const text =
      tnf === 1 && type === 'U'
        ? (URI_PREFIXES[payload[0]] ?? '') + fromUtf8(payload.slice(1))
        : fromUtf8(payload);
    out.push({ tnf, type, text });
    if (head & 0x40) break;
  }
  return out;
}

export type NfcDir = 'PCD' | 'PICC';
export interface NfcFrame {
  dir: NfcDir;
  bytes: Bytes;
  /** A short frame carries 7 bits (REQA, WUPA). */
  bits?: number;
}

const NDEF_AID = [0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01];
const CC_FILE = [0xe1, 0x03];
const NDEF_FILE = [0xe1, 0x04];
const OK = [0x90, 0x00];
/** Bytes per READ BINARY. */
const READ = 0x40;

/**
 * The full exchange when a card is tapped on a reader: REQA, anticollision and select with a
 * random single-size UID, RATS, then an NFC Forum Type 4 tag read of the NDEF file.
 */
export function nfcExchange(uid: Bytes, ndef: Bytes): NfcFrame[] {
  const bcc = uid[0] ^ uid[1] ^ uid[2] ^ uid[3];
  const frames: NfcFrame[] = [
    { dir: 'PCD', bytes: Uint8Array.of(0x26), bits: 7 },
    { dir: 'PICC', bytes: Uint8Array.of(0x04, 0x00) },
    { dir: 'PCD', bytes: Uint8Array.of(0x93, 0x20) },
    { dir: 'PICC', bytes: concat(uid, [bcc]) },
    { dir: 'PCD', bytes: withCrc(concat([0x93, 0x70], uid, [bcc])) },
    { dir: 'PICC', bytes: withCrc([0x20]) },
    { dir: 'PCD', bytes: withCrc([0xe0, 0x80]) },
    { dir: 'PICC', bytes: withCrc([0x05, 0x78, 0x80, 0x70, 0x02]) },
  ];
  let block = 0;
  const apdu = (cmd: number[] | Bytes, resp: number[] | Bytes) => {
    const pcb = 0x02 | block;
    frames.push(
      { dir: 'PCD', bytes: withCrc(concat([pcb], cmd)) },
      { dir: 'PICC', bytes: withCrc(concat([pcb], resp)) },
    );
    block ^= 1;
  };
  const file = concat([ndef.length >> 8, ndef.length & 0xff], ndef);
  const cc = [
    0x00,
    0x0f,
    0x20,
    0x00,
    READ,
    0x00,
    0x34,
    0x04,
    0x06,
    ...NDEF_FILE,
    (file.length >> 8) & 0xff,
    file.length & 0xff,
    0x00,
    0xff,
  ];
  apdu([0x00, 0xa4, 0x04, 0x00, NDEF_AID.length, ...NDEF_AID, 0x00], OK);
  apdu([0x00, 0xa4, 0x00, 0x0c, 0x02, ...CC_FILE], OK);
  apdu([0x00, 0xb0, 0x00, 0x00, cc.length], [...cc, ...OK]);
  apdu([0x00, 0xa4, 0x00, 0x0c, 0x02, ...NDEF_FILE], OK);
  apdu([0x00, 0xb0, 0x00, 0x00, 0x02], [file[0], file[1], ...OK]);
  for (let off = 2; off < file.length; off += READ) {
    const n = Math.min(READ, file.length - off);
    apdu([0x00, 0xb0, off >> 8, off & 0xff, n], concat(file.slice(off, off + n), OK));
  }
  frames.push({ dir: 'PCD', bytes: withCrc([0xc2]) }, { dir: 'PICC', bytes: withCrc([0xc2]) });
  return frames;
}

export interface NfcDecoded {
  rows: Row[];
  summary: string;
  ok: boolean;
  /** NDEF file bytes this frame carried, and where they go. */
  data?: { offset: number; bytes: Bytes };
}

const INS: Record<number, string> = { 0xa4: 'SELECT', 0xb0: 'READ BINARY' };

/**
 * Dissects one NFC-A frame. `prev` is the command a response answers, which is how a real
 * sniffer reads a half-duplex exchange.
 */
export function nfcDecode(f: NfcFrame, prev?: NfcFrame): NfcDecoded {
  const b = f.bytes;
  const dirLabel = f.dir === 'PCD' ? 'Reader → card' : 'Card → reader';
  const rows: Row[] = [
    [
      'Direction',
      `${dirLabel} · ${f.dir === 'PCD' ? 'modified Miller, 100 % ASK' : 'Manchester on the 847.5 kHz subcarrier'}`,
    ],
  ];
  const crcOk =
    b.length < 3
      ? true
      : (() => {
          const [lo, hi] = crcA(b.slice(0, -2));
          return lo === b[b.length - 2] && hi === b[b.length - 1];
        })();
  const crcRow = (): Row => ['CRC_A', `${hex(b.slice(-2))} ${crcOk ? '✓ ok' : '✗ bad'}`];
  if (f.bits === 7) {
    rows.push(['Short frame', `0x${h2(b[0])} · 7 bits`], ['Command', 'REQA · request, type A']);
    return { rows, summary: 'REQA', ok: true };
  }
  if (f.dir === 'PICC' && prev?.bits === 7) {
    rows.push(['ATQA', `${hex(b)} · single-size UID, bit-frame anticollision`]);
    return { rows, summary: `ATQA ${hex(b)}`, ok: true };
  }
  if (f.dir === 'PCD' && b[0] === 0x93 && b[1] === 0x20) {
    rows.push(
      ['Command', 'ANTICOLLISION · cascade level 1'],
      ['NVB', '0x20 · no UID bits known yet'],
    );
    return { rows, summary: 'ANTICOLLISION CL1', ok: true };
  }
  if (f.dir === 'PICC' && prev && prev.bytes[0] === 0x93 && prev.bytes[1] === 0x20) {
    const uid = b.slice(0, 4);
    const bccOk = (uid[0] ^ uid[1] ^ uid[2] ^ uid[3]) === b[4];
    rows.push(
      ['UID', `${hex(uid)} · 0x08 first: a random ID, new on every tap`],
      ['BCC', `0x${h2(b[4])} ${bccOk ? '✓' : '✗'}`],
    );
    return { rows, summary: `UID ${hex(uid)}`, ok: bccOk };
  }
  if (f.dir === 'PCD' && b[0] === 0x93 && b[1] === 0x70) {
    rows.push(['Command', 'SELECT · cascade level 1'], ['UID', hex(b.slice(2, 6))], crcRow());
    return { rows, summary: `SELECT ${hex(b.slice(2, 6))}`, ok: crcOk };
  }
  if (f.dir === 'PICC' && prev && prev.bytes[0] === 0x93 && prev.bytes[1] === 0x70) {
    rows.push(['SAK', `0x${h2(b[0])} · UID complete, ISO/IEC 14443-4 compliant`], crcRow());
    return { rows, summary: `SAK ${h2(b[0])}`, ok: crcOk };
  }
  if (f.dir === 'PCD' && b[0] === 0xe0) {
    rows.push(
      ['Command', 'RATS · request for answer to select'],
      ['FSDI', `${b[1] >> 4} · reader takes 256-byte frames`],
      ['CID', `${b[1] & 0x0f}`],
      crcRow(),
    );
    return { rows, summary: 'RATS', ok: crcOk };
  }
  if (f.dir === 'PICC' && prev && prev.bytes[0] === 0xe0) {
    rows.push(
      ['ATS', hex(b.slice(0, -2))],
      ['FSCI', `${b[1] & 0x0f} · card takes 256-byte frames`, 1],
      crcRow(),
    );
    return { rows, summary: 'ATS', ok: crcOk };
  }
  if ((b[0] & 0xf7) === 0xc2) {
    rows.push(['S-block', 'DESELECT'], crcRow());
    return { rows, summary: 'S(DESELECT)', ok: crcOk };
  }
  // ISO-DEP I-blocks carrying APDUs.
  const pcb = b[0];
  const body = b.slice(1, -2);
  rows.push(['I-block', `PCB 0x${h2(pcb)} · block number ${pcb & 1}`]);
  if (f.dir === 'PCD') {
    const ins = body[1];
    const name = INS[ins] ?? `INS 0x${h2(ins)}`;
    rows.push(['APDU', `${name} · CLA ${h2(body[0])} P1 ${h2(body[2])} P2 ${h2(body[3])}`]);
    let summary = name;
    if (ins === 0xa4 && body[2] === 0x04) {
      rows.push(['AID', `${hex(body.slice(5, 5 + body[4]))} · NDEF tag application`, 1]);
      summary = 'SELECT NDEF application';
    } else if (ins === 0xa4) {
      const fid = (body[5] << 8) | body[6];
      rows.push([
        'File',
        `${h4(fid)} · ${fid === 0xe103 ? 'capability container' : 'NDEF file'}`,
        1,
      ]);
      summary = `SELECT ${h4(fid)}`;
    } else if (ins === 0xb0) {
      const off = (body[2] << 8) | body[3];
      rows.push(['Offset', `${off}`, 1], ['Le', `${body[4]} bytes`, 1]);
      summary = `READ BINARY ${off}+${body[4]}`;
    }
    rows.push(crcRow());
    return { rows, summary, ok: crcOk };
  }
  const sw = body.slice(-2);
  const data = body.slice(0, -2);
  rows.push(['SW1 SW2', `${hex(sw)} · ${sw[0] === 0x90 ? 'success' : 'error'}`]);
  let summary = `R-APDU ${hex(sw)}`;
  let carried: NfcDecoded['data'];
  const cmd = prev?.bytes.slice(1, -2);
  if (data.length && cmd && cmd[1] === 0xb0) {
    const off = (cmd[2] << 8) | cmd[3];
    if (off === 0 && data.length === 2) {
      rows.push(['NLEN', `${(data[0] << 8) | data[1]} bytes of NDEF`]);
      summary = `NLEN ${(data[0] << 8) | data[1]}`;
    } else if (off === 0) {
      rows.push([
        'CC',
        `mapping 2.0 · MLe ${data[4]} · NDEF file ${h4((data[9] << 8) | data[10])}, read-only`,
      ]);
      summary = 'Capability container';
    } else {
      rows.push(
        ['Data', `${data.length} bytes of NDEF at ${off}`],
        [
          'ASCII',
          `“${fromUtf8(data)
            .replace(/[\x00-\x1f]/g, '·')
            .slice(0, 48)}…”`,
          1,
        ],
      );
      summary = `${data.length} bytes`;
      carried = { offset: off - 2, bytes: data };
    }
  }
  rows.push(crcRow());
  return { rows, summary, ok: crcOk, data: carried };
}

/* ================================================================== 802.11, IPv4, TCP */

const CRC32 = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** IEEE CRC-32, the 802.11 frame check sequence. */
export function crc32(b: Bytes) {
  let c = 0xffffffff;
  for (const x of b) c = CRC32[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The Internet checksum: one's-complement sum of 16-bit words. */
export function inetSum(b: Bytes, start = 0) {
  let s = start;
  for (let i = 0; i < b.length; i += 2) s += (b[i] << 8) | (b[i + 1] ?? 0);
  while (s >> 16) s = (s & 0xffff) + (s >> 16);
  return s;
}
const checksum = (b: Bytes, start = 0) => ~inetSum(b, start) & 0xffff;

export interface Link {
  bssid: Bytes;
  sta: Bytes;
  dst: Bytes;
  srcIp: number[];
  dstIp: number[];
  sport: number;
  dport: number;
}

/** The 802.11 QoS data frame for one TCP segment from a station to its access point. */
export function wifiSegment(
  link: Link,
  seq: number,
  ack: number,
  payload: Bytes,
  frameSeq: number,
  ipId: number,
  flags = 0x18,
) {
  const tcp = new Uint8Array(20 + payload.length);
  const dv = new DataView(tcp.buffer);
  dv.setUint16(0, link.sport);
  dv.setUint16(2, link.dport);
  dv.setUint32(4, seq >>> 0);
  dv.setUint32(8, ack >>> 0);
  tcp[12] = 5 << 4;
  tcp[13] = flags;
  dv.setUint16(14, 0xfaf0);
  tcp.set(payload, 20);
  const pseudo = concat(link.srcIp, link.dstIp, [0, 6, tcp.length >> 8, tcp.length & 0xff]);
  dv.setUint16(16, checksum(tcp, inetSum(pseudo)));

  const ip = new Uint8Array(20);
  const iv = new DataView(ip.buffer);
  ip[0] = 0x45;
  iv.setUint16(2, 20 + tcp.length);
  iv.setUint16(4, ipId);
  iv.setUint16(6, 0x4000);
  ip[8] = 64;
  ip[9] = 6;
  ip.set(link.srcIp, 12);
  ip.set(link.dstIp, 16);
  iv.setUint16(10, checksum(ip));

  const mac80211 = concat(
    [0x88, 0x41, 0x2c, 0x00],
    link.bssid,
    link.sta,
    link.dst,
    [(frameSeq << 4) & 0xff, (frameSeq >> 4) & 0xff],
    [0x00, 0x00],
  );
  const llc = [0xaa, 0xaa, 0x03, 0x00, 0x00, 0x00, 0x08, 0x00];
  const body = concat(mac80211, llc, ip, tcp);
  const fcs = crc32(body);
  return concat(body, [fcs & 0xff, (fcs >> 8) & 0xff, (fcs >> 16) & 0xff, fcs >>> 24]);
}

export interface WifiDecoded {
  rows: Row[];
  ok: boolean;
  seq: number;
  payload: Bytes;
  summary: string;
}

const ip4 = (b: ArrayLike<number>) => Array.from(b).join('.');

export function wifiDecode(frame: Bytes, channel: number): WifiDecoded {
  const body = frame.slice(0, -4);
  const fcsRx =
    (frame[frame.length - 4] |
      (frame[frame.length - 3] << 8) |
      (frame[frame.length - 2] << 16) |
      (frame[frame.length - 1] << 24)) >>>
    0;
  const fcsOk = fcsRx === crc32(body);
  const seqCtl = body[22] | (body[23] << 8);
  const ip = body.slice(34, 54);
  const ipOk = inetSum(ip) === 0xffff;
  const tcp = body.slice(54);
  const tdv = new DataView(tcp.buffer, tcp.byteOffset);
  const pseudo = concat(ip.slice(12, 16), ip.slice(16, 20), [
    0,
    6,
    tcp.length >> 8,
    tcp.length & 0xff,
  ]);
  const tcpOk = inetSum(tcp, inetSum(pseudo)) === 0xffff;
  const payload = tcp.slice((tcp[12] >> 4) * 4);
  const seq = tdv.getUint32(4);
  const flags = tcp[13];
  const flagNames = [
    flags & 0x08 ? 'PSH' : '',
    flags & 0x10 ? 'ACK' : '',
    flags & 0x01 ? 'FIN' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const text = fromUtf8(payload);
  const first = text.startsWith('POST ') ? text.split('\r\n')[0] : '';
  const rows: Row[] = [
    ['Radio', `802.11 OFDM · channel ${channel} · ${2407 + 5 * channel} MHz · 20 MHz`],
    ['Frame control', `0x${h2(body[0])}${h2(body[1])} · QoS data, to DS, protected`],
    ['CCMP', 'shown decrypted, with the network key loaded', 1],
    ['BSSID', mac(body.slice(4, 10)), 1],
    ['Source', `${mac(body.slice(10, 16))} (reader)`, 1],
    ['Destination', mac(body.slice(16, 22)), 1],
    ['Sequence', `${seqCtl >> 4}`, 1],
    ['LLC/SNAP', 'EtherType 0x0800 · IPv4'],
    ['IPv4', `${ip4(ip.slice(12, 16))} → ${ip4(ip.slice(16, 20))}`],
    ['Header checksum', `0x${h4((ip[10] << 8) | ip[11])} ${ipOk ? '✓' : '✗'}`, 1],
    ['TCP', `${tdv.getUint16(0)} → ${tdv.getUint16(2)} · [${flagNames}]`],
    ['Seq', `${seq}`, 1],
    ['Len', `${payload.length}`, 1],
    ['Checksum', `0x${h4(tdv.getUint16(16))} ${tcpOk ? '✓' : '✗'}`, 1],
  ];
  rows.push(['TLS', 'application data, shown decrypted from the key log']);
  if (first) rows.push(['HTTP', first]);
  rows.push(['Payload', `“${text.replace(/\r\n/g, '⏎').slice(0, 56)}…”`]);
  rows.push([
    'FCS',
    `0x${fcsRx.toString(16).padStart(8, '0').toUpperCase()} ${fcsOk ? '✓ ok' : '✗ bad'}`,
  ]);
  return {
    rows,
    ok: fcsOk && ipOk && tcpOk,
    seq,
    payload,
    summary: first || `TCP seq=${seq} len=${payload.length}`,
  };
}
