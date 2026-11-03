// The band plan and everything on the air. Each section of the site is a station at the real
// frequency of the radio that carries it, from the devices in db: the Attendum beacon on the
// three BLE advertising channels, the Attendum readers on Wi-Fi channels 1, 6 and 11 and on
// NFC at 13.56 MHz, and Logger stations on the GSM 900 and DCS 1800 uplinks. Around them sits
// the texture any receiver sees: the cells the stations talk to, access point beacons, the
// reader field's harmonics. Timing is seeded, so every visit hears the same air.
import { db } from '../_shared/data';
import { arfcnDownlink, arfcnUplink, prng } from './codec';
import { program, type ChapterId } from './programs';

export type Mode = 'AM' | 'NFM' | 'WFM' | 'USB' | 'LSB' | 'DIG';
export const MODES: Mode[] = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'DIG'];
/** The filter each mode opens with. DIG matches the signal under the VFO when there is one. */
export const MODE_BW: Record<Mode, number> = {
  AM: 10e3,
  NFM: 12.5e3,
  WFM: 200e3,
  USB: 2.7e3,
  LSB: 2.7e3,
  DIG: 200e3,
};
export const MODE_NAME: Record<Mode, string> = {
  AM: 'Amplitude (envelope detector)',
  NFM: 'Narrow FM (discriminator)',
  WFM: 'Wide FM (discriminator)',
  USB: 'Upper sideband',
  LSB: 'Lower sideband',
  DIG: 'Digital (demodulator and decoder)',
};

export type Proto = 'ble' | 'gsm' | 'wifi' | 'nfc';
/** Spectral shapes the display knows how to draw. */
export type Kind = 'gfsk' | 'gmsk' | 'ofdm' | 'carrier' | 'ask' | 'subcarrier' | 'tone';

const MHz = 1e6;
const { attendumBeacon: beacon, attendumReader: reader, logger } = db.devices;

export interface Station {
  id: ChapterId;
  /** The chapter's name. */
  title: string;
  freq: number;
  /** Other frequencies carrying the same transmission. */
  alts: number[];
  proto: Proto;
  kind: Kind;
  device: { tag: string; name: string; kind: string };
  /** Where on the air, in the band's own terms. */
  where: string;
  modulation: string;
  /** Modes whose demodulator this decoder can work from. */
  modes: Mode[];
  /** The bookmark's mode, filter and step. */
  mode: Mode;
  bw: number;
  /** The narrowest filter that still passes enough of the signal to decode. */
  minBw: number;
  narrowHint: string;
  /** Occupied bandwidth. */
  occ: number;
  step: number;
  /** The view the bookmark opens when the station is off screen. */
  view: { center: number; span: number };
  /** Power at the antenna, dBm, while transmitting. */
  level: number;
  /** SNR the decoder needs, dB. */
  minSnr: number;
  /** Seconds between frames, the pause after a full cycle, and how long each burst lasts. */
  period: number;
  gap: number;
  burst: number;
  phase: number;
  /** What the decoder does once locked. */
  decodes: string;
}

const SMS_DECODES =
  'Unpacking the SMS-SUBMIT PDUs from 7-bit septets and reassembling the concatenated parts by reference and sequence number.';
const ISM = { center: 2442 * MHz, span: 100 * MHz };
const EXP_ARFCN = 62;
const HW_ARFCN = 600;

const wifi = (id: ChapterId, title: string, ch: number, level: number, phase: number): Station => ({
  id,
  title,
  freq: (2407 + 5 * ch) * MHz,
  alts: [],
  proto: 'wifi',
  kind: 'ofdm',
  device: reader,
  where: `Wi-Fi 2.4 GHz · channel ${ch}`,
  modulation: 'OFDM · 52 subcarriers · 20 MHz',
  modes: ['DIG'],
  mode: 'DIG',
  bw: 20 * MHz,
  minBw: 17 * MHz,
  narrowHint:
    'An OFDM receiver needs every subcarrier: open the filter to the full 20 MHz channel.',
  occ: 20 * MHz,
  step: 5 * MHz,
  view: ISM,
  level,
  minSnr: 12,
  period: 0.09,
  gap: 1.1,
  burst: 0.004,
  phase,
  decodes:
    'Following the reader’s TCP stream: each frame checked against its FCS, the IP and TCP checksums verified, and the segments put back in sequence-number order into one HTTP body.',
});

export const stations: Station[] = [
  {
    id: 'about',
    title: 'About',
    freq: 2402 * MHz,
    alts: [2426 * MHz, 2480 * MHz],
    proto: 'ble',
    kind: 'gfsk',
    device: beacon,
    where: 'BLE advertising · channels 37, 38, 39',
    modulation: 'GFSK · 1 Msym/s · BT 0.5',
    modes: ['DIG', 'NFM', 'WFM'],
    mode: 'DIG',
    bw: 2 * MHz,
    minBw: 1 * MHz,
    narrowHint: 'GFSK at 1 Msym/s deviates ±250 kHz: open the filter to at least 1 MHz.',
    occ: 2 * MHz,
    step: 2 * MHz,
    view: ISM,
    level: -56,
    minSnr: 10,
    period: 0.1,
    gap: 0,
    burst: 0.002,
    phase: 0.02,
    decodes:
      'De-whitening each packet with the channel’s seed, checking its CRC-24, and putting the manufacturer-data fragments back in order.',
  },
  {
    id: 'experience',
    title: 'Experience',
    freq: arfcnUplink(EXP_ARFCN),
    alts: [],
    proto: 'gsm',
    kind: 'gmsk',
    device: logger,
    where: `GSM 900 uplink · ARFCN ${EXP_ARFCN}`,
    modulation: 'GMSK · 270.833 kbit/s · TDMA',
    modes: ['DIG'],
    mode: 'DIG',
    bw: 200e3,
    minBw: 150e3,
    narrowHint: 'A GSM channel is 200 kHz wide: open the filter to at least 150 kHz.',
    occ: 200e3,
    step: 200e3,
    view: { center: 902 * MHz, span: 10 * MHz },
    level: -92,
    minSnr: 9,
    period: 0.22,
    gap: 1.4,
    burst: 0.16,
    phase: 0.3,
    decodes: SMS_DECODES,
  },
  wifi('projects', 'Projects', 1, -61, 0.15),
  {
    id: 'hardware',
    title: 'Hardware',
    freq: arfcnUplink(HW_ARFCN),
    alts: [],
    proto: 'gsm',
    kind: 'gmsk',
    device: logger,
    where: `DCS 1800 uplink · ARFCN ${HW_ARFCN}`,
    modulation: 'GMSK · 270.833 kbit/s · TDMA',
    modes: ['DIG'],
    mode: 'DIG',
    bw: 200e3,
    minBw: 150e3,
    narrowHint: 'A GSM channel is 200 kHz wide: open the filter to at least 150 kHz.',
    occ: 200e3,
    step: 200e3,
    view: { center: 1728 * MHz, span: 10 * MHz },
    level: -97,
    minSnr: 9,
    period: 0.3,
    gap: 1.6,
    burst: 0.22,
    phase: 0.7,
    decodes: SMS_DECODES,
  },
  wifi('oss', 'Open source', 11, -59, 0.55),
  wifi('roots', 'Roots', 6, -66, 0.35),
  {
    id: 'contact',
    title: 'Contact',
    freq: 13.56 * MHz,
    alts: [],
    proto: 'nfc',
    kind: 'carrier',
    device: reader,
    where: 'NFC-A · 13.56 MHz ISM',
    modulation: 'ASK · 106 kbit/s · 847.5 kHz subcarrier',
    modes: ['DIG', 'AM'],
    mode: 'DIG',
    bw: 2 * MHz,
    minBw: 1.8 * MHz,
    narrowHint:
      'The card answers on a subcarrier 847.5 kHz either side of the carrier: open the filter to at least 1.8 MHz to hear both directions.',
    occ: 2 * MHz,
    step: 10e3,
    view: { center: 13.56 * MHz, span: 5 * MHz },
    level: -30,
    minSnr: 10,
    period: 0.07,
    gap: 1.2,
    burst: 0.05,
    phase: 0.1,
    decodes:
      'Following the tap: anticollision and select, then the Type 4 tag read, CRC_A on every frame, and the NDEF file parsed once every block is in.',
  },
];

export const stationById = Object.fromEntries(stations.map((s) => [s.id, s])) as Record<
  ChapterId,
  Station
>;

/** Regulatory allocations, drawn along the top of the spectrum. */
export const BANDS = [
  { lo: 13.553 * MHz, hi: 13.567 * MHz, name: '13.56 MHz ISM' },
  { lo: 26.957 * MHz, hi: 27.283 * MHz, name: '27 MHz ISM' },
  { lo: 40.66 * MHz, hi: 40.7 * MHz, name: '40.68 MHz ISM' },
  { lo: 890 * MHz, hi: 915 * MHz, name: 'GSM 900 uplink' },
  { lo: 935 * MHz, hi: 960 * MHz, name: 'GSM 900 downlink' },
  { lo: 1710 * MHz, hi: 1785 * MHz, name: 'DCS 1800 uplink' },
  { lo: 1805 * MHz, hi: 1880 * MHz, name: 'DCS 1800 downlink' },
  { lo: 2400 * MHz, hi: 2483.5 * MHz, name: '2.4 GHz ISM' },
];

/* ------------------------------------------------------------------ emitters */

export type Sched =
  | { type: 'frames'; station: ChapterId; filter?: 'R→C' | 'C→R'; flicker?: number }
  | { type: 'field'; station: ChapterId }
  | { type: 'always' }
  | { type: 'periodic'; period: number; dur: number; phase: number }
  | { type: 'random'; rate: number; dur: number; seed: number };

export interface Emitter {
  f: number;
  kind: Kind;
  /** dBm while on. */
  level: number;
  sched: Sched;
  station?: ChapterId;
  /** What the hover readout and the decoder call it. */
  label: string;
  /** Why it doesn't decode, for emitters that aren't stations. */
  note?: string;
}

const emitters: Emitter[] = [];

for (const s of stations) {
  for (const f of [s.freq, ...s.alts]) {
    if (s.proto === 'nfc') continue;
    const ch = s.proto === 'ble' ? `ch ${37 + [s.freq, ...s.alts].indexOf(f)}` : '';
    const label = `${s.device.name} · ${s.proto === 'ble' ? `BLE advertising ${ch}` : s.where}`;
    emitters.push({
      f,
      kind: s.kind,
      level: s.level,
      station: s.id,
      label,
      sched: { type: 'frames', station: s.id, flicker: s.proto === 'gsm' ? 0.72 : undefined },
    });
  }
}

// The NFC reader: its field (and the field's harmonics), its own ASK sidebands while it talks,
// and the card's load modulation on the 847.5 kHz subcarrier while the card answers.
const nfc = stationById.contact;
const nfcLabel = `${reader.name} · NFC-A field`;
emitters.push(
  {
    f: nfc.freq,
    kind: 'carrier',
    level: nfc.level,
    station: 'contact',
    label: nfcLabel,
    sched: { type: 'field', station: 'contact' },
  },
  {
    f: nfc.freq,
    kind: 'ask',
    level: nfc.level - 36,
    station: 'contact',
    label: `${reader.name} · reader → card`,
    sched: { type: 'frames', station: 'contact', filter: 'R→C' },
  },
  {
    f: nfc.freq,
    kind: 'subcarrier',
    level: nfc.level - 50,
    station: 'contact',
    label: 'Card → reader · 847.5 kHz subcarrier',
    sched: { type: 'frames', station: 'contact', filter: 'C→R' },
  },
  ...[2, 3].map((h): Emitter => ({
    f: nfc.freq * h,
    kind: 'tone',
    level: nfc.level - 34 - 10 * h,
    label: `${reader.name} · field harmonic ×${h}`,
    note: `The reader field’s ${h === 2 ? 'second' : 'third'} harmonic, at ${h} × 13.56 MHz. Nothing to decode here: tune to the fundamental.`,
    sched: { type: 'field', station: 'contact' },
  })),
);

// The cells the Logger stations talk to: continuous broadcast carriers on the downlink.
const cells = (arfcns: number[], band: string, gap: number, seed: number) => {
  const r = prng(seed);
  for (const n of arfcns) {
    emitters.push({
      f: arfcnDownlink(n),
      kind: 'gmsk',
      level: -54 - r() * 22,
      label: `${band} downlink · ARFCN ${n} · network cell`,
      note: `A network cell’s broadcast carrier, not a ${logger.name} station. The stations transmit on the uplink, ${gap} MHz lower.`,
      sched: { type: 'always' },
    });
  }
};
cells([3, 18, 41, EXP_ARFCN, 77, 96, 115], 'GSM 900', 45, 0x900);
cells([520, 547, 583, HW_ARFCN, 641, 702, 760, 811], 'DCS 1800', 95, 0x1800);

// Other handsets on the uplinks: short, sporadic bursts that never decode.
const handsets = (arfcns: number[], band: string, seed: number) => {
  const r = prng(seed);
  arfcns.forEach((n, i) =>
    emitters.push({
      f: arfcnUplink(n),
      kind: 'gmsk',
      level: -98 - r() * 10,
      label: `${band} uplink · ARFCN ${n} · a handset`,
      note: `A handset’s burst on the uplink, not a ${logger.name} station: its traffic is ciphered and none of it is addressed here.`,
      sched: { type: 'random', rate: 0.5 + r() * 0.4, dur: 0.1 + r() * 0.15, seed: seed + i * 31 },
    }),
  );
};
handsets([9, 27, 48, 55, 70, 79, 101, 118], 'GSM 900', 0x91);
handsets([540, 571, 590, 611, 626, 690, 745], 'DCS 1800', 0x181);

// Each reader's access point beacons every 102.4 ms, and the rest of the channel is busy too.
for (const [i, s] of stations.filter((x) => x.proto === 'wifi').entries()) {
  const ch = (s.freq / MHz - 2407) / 5;
  const note = `Traffic on Wi-Fi channel ${ch} that isn’t from a reader. Tune to the channel centre to follow the reader’s frames.`;
  emitters.push(
    {
      f: s.freq,
      kind: 'ofdm',
      level: s.level - 4,
      label: `Wi-Fi channel ${ch} · access point beacon`,
      note,
      sched: { type: 'periodic', period: 0.1024, dur: 0.0006, phase: i * 0.031 },
    },
    {
      f: s.freq,
      kind: 'ofdm',
      level: s.level - 12,
      label: `Wi-Fi channel ${ch} · other traffic`,
      note,
      sched: { type: 'random', rate: 1.1, dur: 0.003, seed: 0x24 + i },
    },
  );
}

export { emitters };

/* ------------------------------------------------------------------ timing */

const cycleOf = (s: Station, n: number) => n * s.period + s.gap;
const dirs = new Map<ChapterId, string[]>();
const dirOf = (id: ChapterId, k: number) => {
  let d = dirs.get(id);
  if (!d) dirs.set(id, (d = program(id).frames.map((f) => f.dir ?? '')));
  return d[k];
};
const counts = new Map<ChapterId, number>();
export const framesOf = (id: ChapterId) => {
  let n = counts.get(id);
  if (n === undefined) counts.set(id, (n = program(id).frames.length));
  return n;
};

/** advDelay: BLE adds 0–10 ms of pseudo-random delay to every advertising event. */
const jitter = (s: Station, abs: number) =>
  s.proto === 'ble' ? ((Math.imul(abs + 1, 2654435761) >>> 0) / 4294967296) * 0.01 : 0;

/** When frame `abs` (counted from the start of time, across cycles) goes out. */
export function frameTime(s: Station, abs: number) {
  const n = framesOf(s.id);
  return Math.floor(abs / n) * cycleOf(s, n) + (abs % n) * s.period + s.phase + jitter(s, abs);
}

/** Every frame that starts in [t0, t1), as absolute numbers. */
export function framesStarting(s: Station, t0: number, t1: number): number[] {
  const n = framesOf(s.id);
  const c = cycleOf(s, n);
  const out: number[] = [];
  const first = Math.max(0, Math.floor((t0 - s.phase - 0.02) / c) * n);
  for (let abs = first; ; abs++) {
    const t = frameTime(s, abs);
    if (t >= t1) break;
    if (t >= t0) out.push(abs);
    if (abs - first > 4 * n) break;
  }
  return out;
}

const hash = (x: number) => (Math.imul(Math.floor(x) ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296;

/** How much of the row [t0, t1) the emitter is on for, 0 or 1 (bursts shorter than a row still show). */
export function activity(e: Emitter, t0: number, t1: number): number {
  const sc = e.sched;
  switch (sc.type) {
    case 'always':
      return 1;
    case 'periodic': {
      const k = Math.floor((t1 - sc.phase) / sc.period);
      const start = k * sc.period + sc.phase;
      return start + sc.dur > t0 ? 1 : 0;
    }
    case 'random': {
      // Poisson-ish: one slot per 1/rate/4 seconds, each live with probability 1/4.
      const slot = 1 / sc.rate / 4;
      for (let k = Math.floor((t0 - sc.dur) / slot); k * slot < t1; k++)
        if (hash(k * 7 + sc.seed) < 0.25) return 1;
      return 0;
    }
    case 'field': {
      const s = stationById[sc.station];
      const n = framesOf(s.id);
      const c = cycleOf(s, n);
      const into = (((t0 - s.phase) % c) + c) % c;
      if (into < n * s.period + 0.05) return 1;
      // Low-power card detection between taps: a short pulse of field every 250 ms.
      return (into - n * s.period) % 0.25 < 0.02 ? 1 : 0;
    }
    case 'frames': {
      const s = stationById[sc.station];
      const dur = s.burst;
      for (const abs of framesStarting(s, t0 - dur, t1)) {
        const t = frameTime(s, abs);
        if (t + dur <= t0) continue;
        if (sc.filter && dirOf(s.id, abs % framesOf(s.id)) !== sc.filter) continue;
        if (sc.flicker && hash(t0 * 216.7) > sc.flicker) return 0;
        return 1;
      }
      return 0;
    }
  }
}

/* ------------------------------------------------------------------ lookup */

/** The station a frequency is tuned to, if it's within the decoder's capture range. */
export function stationAt(f: number) {
  for (const s of stations) {
    for (const g of [s.freq, ...s.alts])
      if (Math.abs(f - g) <= Math.max(0.15 * s.occ, 2e3))
        return { station: s, freq: g, offset: f - g };
  }
  return null;
}

/** The emitter under a frequency, nearest centre first, within its occupied bandwidth. */
export function emitterAt(f: number, slack = 0) {
  let best: Emitter | null = null;
  let dist = Infinity;
  for (const e of emitters) {
    const half = occOf(e) / 2 + slack;
    const d = Math.abs(f - e.f);
    if (d <= half && d < dist) {
      best = e;
      dist = d;
    }
  }
  return best;
}

export function occOf(e: Emitter) {
  switch (e.kind) {
    case 'gfsk':
      return 2 * MHz;
    case 'gmsk':
      return 200e3;
    case 'ofdm':
      return 20 * MHz;
    case 'subcarrier':
      return 2 * MHz;
    case 'ask':
      return 400e3;
    default:
      return 20e3;
  }
}

/** Which BLE advertising channel a frequency is. */
export const bleChannelOf = (f: number) => (f === 2426 * MHz ? 38 : f === 2480 * MHz ? 39 : 37);
