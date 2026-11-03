// The receiver. A broadcast carousel sends every page in turn, each taking as long as its packets
// do on the vertical blanking lines, the index twice a cycle. The set waits for the page you key
// while the header rolls through whatever is going past; pages its Fastext memory has already
// caught (the current page's four links, the index and the pages either side) come up at once.
// Carousel pages change subpage on a timer at the broadcaster, unless the set is on HOLD.
import { encode, type Page, type Spot } from './build';
import { C } from './decode';
import { ORDER, PAGES, SERVICE } from './pages';

/** Packets a second: four VBI lines a field, fifty fields a second. */
const PACKETS_PER_SECOND = 200;
/** Seconds each subpage of a carousel page stays on air. */
export const ROTATE = 20;
/** How long the first page takes to come round after the set is switched on. */
const FIRST_WAIT = 0.9;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

interface Slot {
  num: number;
  start: number;
  dur: number;
}

/** The transmission sequence: every page once in page order, with the index sent again mid-cycle. */
function schedule() {
  const seq = [...ORDER];
  seq.splice(Math.floor(seq.length / 2), 0, ORDER[0]);
  let t = 0;
  const slots: Slot[] = seq.map((num) => {
    const rows = (PAGES.get(num) as Page).subs[0].rows;
    const packets = 1 + rows.slice(1).filter((r) => r.some((c) => c !== 0x20)).length;
    const slot = { num, start: t, dur: packets / PACKETS_PER_SECOND };
    t += slot.dur;
    return slot;
  });
  return { slots, cycle: t };
}

const { slots: SLOTS, cycle: CYCLE } = schedule();
export const CYCLE_SECONDS = CYCLE;

const subsOf = (num: number) => PAGES.get(num)?.subs.length ?? 1;
/** The subpage on air for a page at broadcast time t. */
const onAir = (num: number, t: number) => Math.floor(t / ROTATE) % subsOf(num);

export type Size = 0 | 1 | 2;

export interface Snapshot {
  /** The page on screen. */
  page: number;
  sub: number;
  subs: number;
  hold: boolean;
  reveal: boolean;
  /** 0 normal, 1 top half doubled, 2 bottom half doubled. */
  size: Size;
  /** Digits keyed so far, before the third. */
  entry: string;
  /** The page being searched for. */
  target: number | null;
  /** A full cycle has passed without the page searched for. */
  lost: boolean;
  /** Bumped every time a page or subpage comes up. */
  arrivals: number;
}

export class Tv {
  private offset: number | null = null;
  private t = 0;
  private k = -1;
  private shown: { num: number; sub: number; at: number; fill: number } | null = null;
  private entry = '';
  private target: number | null;
  private searchFrom = 0;
  private hold = false;
  private reveal = false;
  private size: Size = 0;
  private manual = false;
  private memory = new Set<number>();
  private rolling: number;
  private clock = { date: '', time: '' };
  private arrivals = 0;
  private lost = false;
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  /** Bumped whenever the picture changes. */
  version = 0;

  constructor(first = ORDER[0]) {
    this.target = first;
    this.rolling = first;
    this.snap = this.makeSnap();
  }

  /* ------------------------------------------------------------------ store */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  private makeSnap(): Snapshot {
    const page = this.shown?.num ?? this.target ?? ORDER[0];
    return {
      page,
      sub: this.shown?.sub ?? 0,
      subs: subsOf(page),
      hold: this.hold,
      reveal: this.reveal,
      size: this.size,
      entry: this.entry,
      target: this.target,
      lost: this.lost,
      arrivals: this.arrivals,
    };
  }

  private changed() {
    this.version++;
    const next = this.makeSnap();
    const prev = this.snap;
    if ((Object.keys(next) as (keyof Snapshot)[]).some((key) => next[key] !== prev[key])) {
      this.snap = next;
      this.listeners.forEach((fn) => fn());
    }
  }

  /* ------------------------------------------------------------------ the broadcast */

  /** Runs the carousel up to `seconds` (a monotonic clock), with `now` for the header clock. */
  advance(seconds: number, now: Date) {
    // Start the cycle just before the first page comes round, so it arrives after a short search.
    if (this.offset === null) this.offset = CYCLE - FIRST_WAIT - seconds;
    const t = seconds + this.offset;
    this.t = t;
    const cycle = Math.floor(t / CYCLE);
    const into = t - cycle * CYCLE;
    let i = SLOTS.findIndex((s) => into < s.start + s.dur);
    if (i < 0) i = SLOTS.length - 1;
    const K = cycle * SLOTS.length + i;
    if (this.k < 0) this.k = K - 1;
    // After a long pause, one full cycle is enough to catch up.
    for (let k = Math.max(this.k + 1, K - SLOTS.length + 1); k <= K; k++) {
      const slot = SLOTS[((k % SLOTS.length) + SLOTS.length) % SLOTS.length];
      this.receive(slot, Math.floor(k / SLOTS.length) * CYCLE + slot.start);
    }
    this.k = K;

    if (!this.hold) {
      const date = `${DAYS[now.getDay()]} ${two(now.getDate())} ${MONTHS[now.getMonth()]}`;
      const time = `${two(now.getHours())}:${two(now.getMinutes())}/${two(now.getSeconds())}`;
      if (date !== this.clock.date || time !== this.clock.time) {
        this.clock = { date, time };
        this.version++;
      }
    }
    const lost = this.target !== null && t - this.searchFrom > CYCLE * 1.5;
    if (lost !== this.lost) {
      this.lost = lost;
      this.changed();
    }
  }

  /** A page header has come in off air. */
  private receive(slot: Slot, start: number) {
    const { num } = slot;
    if (this.target !== null && this.rolling !== num) {
      this.rolling = num;
      this.version++;
    }
    if (this.wanted().has(num)) this.memory.add(num);
    if (this.target === num) {
      this.target = null;
      this.present(num, onAir(num, start), start, Math.max(slot.dur, 0.18));
    } else if (!this.hold && !this.manual && this.shown?.num === num) {
      const sub = onAir(num, start);
      if (sub !== this.shown.sub) this.present(num, sub, start, Math.max(slot.dur, 0.18));
    }
  }

  /** The pages a Fastext set keeps catching for the page on screen. */
  private wanted() {
    const set = new Set<number>([ORDER[0]]);
    const num = this.shown?.num;
    if (num === undefined) return set;
    PAGES.get(num)?.fast.forEach((n) => set.add(n));
    const i = ORDER.indexOf(num);
    set.add(ORDER[(i + 1) % ORDER.length]);
    set.add(ORDER[(i - 1 + ORDER.length) % ORDER.length]);
    return set;
  }

  private present(num: number, sub: number, at: number, fill: number) {
    const newPage = this.shown?.num !== num;
    this.shown = { num, sub, at, fill };
    if (newPage) {
      this.reveal = false;
      this.manual = false;
      // Memory now serves the new page's links; anything else is let go.
      const keep = this.wanted();
      this.memory = new Set([...this.memory].filter((n) => keep.has(n)));
      this.memory.add(num);
    }
    this.arrivals++;
    this.changed();
  }

  /* ------------------------------------------------------------------ the remote */

  /** Asks for a page: at once from memory, otherwise wait for it to come round. */
  go(num: number) {
    if (!Number.isInteger(num) || num < 100 || num > 899) return;
    this.entry = '';
    this.hold = false;
    if (this.shown?.num === num || this.memory.has(num)) {
      this.target = null;
      this.present(num, this.shown?.num === num ? this.shown.sub : onAir(num, this.t), this.t, 0);
      return;
    }
    this.target = num;
    this.searchFrom = this.t;
    this.rolling = num;
    this.changed();
  }

  digit(d: number) {
    // Magazines run 1 to 8: a first digit of 0 or 9 is not a page.
    if (!this.entry && (d === 0 || d === 9)) return;
    this.entry += String(d);
    if (this.entry.length === 3) this.go(Number(this.entry));
    else this.changed();
  }

  fastext(i: number) {
    const n = this.shown && PAGES.get(this.shown.num)?.fast[i];
    if (n) this.go(n);
  }

  /** Page up or down, through the pages in service (the set knows them from the page table). */
  step(dir: 1 | -1) {
    const from = this.target ?? this.shown?.num ?? ORDER[0];
    let i = ORDER.findIndex((n) => (dir > 0 ? n > from : n >= from));
    if (dir > 0) i = i < 0 ? 0 : i;
    else i = (i < 0 ? ORDER.length : i) - 1;
    this.go(ORDER[(i + ORDER.length) % ORDER.length]);
  }

  /** Steps through a carousel page's subpages from memory; the rotation stops while you do. */
  subStep(dir: 1 | -1) {
    if (!this.shown) return;
    const n = subsOf(this.shown.num);
    if (n < 2) return;
    this.manual = true;
    this.present(this.shown.num, (this.shown.sub + dir + n) % n, this.t, 0);
  }

  cancel() {
    if (!this.entry && this.target === null) return;
    this.entry = '';
    this.target = null;
    this.changed();
  }

  toggleHold() {
    this.hold = !this.hold;
    this.changed();
  }

  toggleReveal() {
    this.reveal = !this.reveal;
    this.changed();
  }

  cycleSize() {
    this.size = ((this.size + 1) % 3) as Size;
    this.changed();
  }

  /* ------------------------------------------------------------------ the picture */

  /** The rows on screen now: the header the set builds, and the page as far as it has come in. */
  compose(reduced: boolean): { rows: number[][]; filling: boolean } {
    const rows: number[][] = [this.header()];
    const page = this.shown ? PAGES.get(this.shown.num) : null;
    const sub = page?.subs[this.shown?.sub ?? 0];
    let upTo = 23,
      filling = false;
    if (this.shown && this.shown.fill > 0 && !reduced) {
      const p = (this.t - this.shown.at) / this.shown.fill;
      if (p < 1) {
        upTo = Math.max(0, Math.floor(p * 23));
        filling = true;
      }
    }
    for (let y = 1; y < 24; y++) rows.push(sub && y <= upTo ? sub.rows[y] : encode([]));
    return { rows, filling };
  }

  /** Row 0: the set's own eight cells (the page asked for, or HOLD), then the header off air. */
  private header(): number[] {
    let status: (number | string)[];
    if (this.hold) status = [C.AlphaRed, 'HOLD'];
    else if (this.entry) status = [C.AlphaWhite, `P${this.entry.padEnd(3, '-')}`];
    else if (this.target !== null) status = [C.AlphaWhite, `P${this.target}`];
    else status = [C.AlphaGreen, `P${this.shown?.num ?? ''}`];
    const num = this.target !== null ? this.rolling : (this.shown?.num ?? this.rolling);
    const left = [C.AlphaCyan, SERVICE];
    const right = [C.AlphaWhite, `${num} ${this.clock.date}`, C.AlphaYellow, this.clock.time];
    const used =
      1 + SERVICE.length + 1 + `${num} ${this.clock.date}`.length + 1 + this.clock.time.length;
    return encode([...status, '   ', ...left, ' '.repeat(Math.max(1, 32 - used)), ...right]);
  }

  /** The hotspot under a cell, if any. */
  spotAt(row: number, col: number): Spot | null {
    if (!this.shown) return null;
    const sub = PAGES.get(this.shown.num)?.subs[this.shown.sub];
    return (
      sub?.spots.find(
        (s) => s.row === row && col >= s.c0 && col < s.c1 && (!s.concealed || this.reveal),
      ) ?? null
    );
  }
}
