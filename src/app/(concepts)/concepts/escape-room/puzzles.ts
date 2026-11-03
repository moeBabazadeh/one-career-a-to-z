// The study's puzzles: every lock, what opens it, and the clue in the room that teaches it.
// Every code is read from db (through ../_shared/data), never typed, so when a fact changes the
// clue and the lock change together and the room still opens.
import { db, fmt, skills } from '../_shared/data';

export type LockId =
  'seal' | 'safe' | 'cabinet' | 'drawer' | 'cryptex' | 'laptop' | 'shelf' | 'door';
export type ClueId =
  'diploma' | 'calendar' | 'corkboard' | 'reader' | 'card' | 'rolodex' | 'window';
export type ObjectId = LockId | ClueId;
export type SectionId =
  'about' | 'experience' | 'products' | 'hardware' | 'oss' | 'education' | 'cv' | 'contact';
export type Zone = 'shelf' | 'wall' | 'desk' | 'corner';
export type RoleKey = keyof typeof db.roles;

const { education, roles, devices, products, current, person, asOf } = db;
const bsc = education.bsc;
const reader = devices.attendumReader;
const fleet = reader.fleet;
const logger = devices.logger;
const neurobuild = products.neurobuild;
const attendum = products.attendum;

/** A small seeded generator, so every scramble is the same on the server and in the browser. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mod = (n: number, m: number) => ((n % m) + m) % m;
const pad2 = (n: number) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------ the codes */

/** The safe: the year on the framed diploma, dialled as two numbers. */
export const DIPLOMA_YEAR = bsc.to.y;
export const SAFE_CODE: [number, number] = [Math.floor(DIPLOMA_YEAR / 100), DIPLOMA_YEAR % 100];
export const DIAL_STEPS = 100;

/** The parts cabinet: the count on the card reader's label, one digit per wheel. */
export const PADLOCK = String(fleet.online.n).split('').map(Number);
export const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const PADLOCK_START = PADLOCK.map((d, i) => (d + 3 + i * 2) % 10);

/** The desk drawer: the company on the business card, spelled on letter wheels. */
export const WORD = current.company.toUpperCase().replace(/[^A-Z]/g, '');
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Ten letters a wheel, like a real word lock: the right one and nine others, in order. */
export const WORD_WHEELS = [...WORD].map((ch, i) => {
  const next = rng(31 + i * 17);
  const picks = new Set([ch]);
  while (picks.size < 10) picks.add(ALPHA[Math.floor(next() * ALPHA.length)]);
  return [...picks].sort();
});
export const WORD_START = WORD_WHEELS.map(
  (faces, i) => (faces.indexOf(WORD[i]) + 3 + ((i * 3) % 5)) % faces.length,
);

/** The cryptex: three rings of his skills, set to the stack his platform runs on. */
export const STACK = neurobuild.tech.slice(0, 3);
export const CRYPTEX = STACK.map((t) => skills.findIndex((k) => k.includes(t)));
export const CRYPTEX_START = CRYPTEX.map((v, i) => mod(v + 3 + i, skills.length));

/** The bookshelf: one book per role, pulled in the order he joined them. */
export const ROLE_ORDER = (Object.keys(roles) as RoleKey[]).sort(
  (a, b) => fmt.frac(roles[a].from) - fmt.frac(roles[b].from),
);
const same = (a: string[], b: string[]) => a.every((x, i) => x === b[i]);
/** The books as they stand on the shelf: shuffled, never in order and never reversed. */
export const SHELF_ORDER: RoleKey[] = (() => {
  const next = rng(7);
  for (;;) {
    const order = [...ROLE_ORDER];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (
      !same(order, ROLE_ORDER) &&
      !same(order, [...ROLE_ORDER].reverse()) &&
      order[0] !== ROLE_ORDER[0]
    )
      return order;
  }
})();
export const bookName = (id: RoleKey) => {
  const r: db.Role = roles[id];
  return r.short ?? r.org;
};

/** The door: the years he's been building, from the letter's first year and the calendar's. */
export const DOOR = String(db.yearsBuilding);

/* ------------------------------------------------------------------ the sliding tiles */

export const SIZE = 3;
export const GAP = SIZE * SIZE - 1;
export const SOLVED = Array.from({ length: SIZE * SIZE }, (_, i) => i);
export const SLIDER_IMAGE = attendum.image as string;

/** The positions next to `pos` on the board. */
export function around(pos: number) {
  const r = Math.floor(pos / SIZE);
  const c = pos % SIZE;
  const out: number[] = [];
  if (r > 0) out.push(pos - SIZE);
  if (r < SIZE - 1) out.push(pos + SIZE);
  if (c > 0) out.push(pos - 1);
  if (c < SIZE - 1) out.push(pos + 1);
  return out;
}

/** Slides the tile at `pos` into the gap, if they touch. */
export function slide(board: number[], pos: number) {
  const gap = board.indexOf(GAP);
  if (!around(gap).includes(pos)) return board;
  const next = [...board];
  [next[gap], next[pos]] = [next[pos], next[gap]];
  return next;
}

export const isSolved = (board: number[]) => board.every((t, i) => t === i);

/** Scrambled by legal moves from the solved picture, so it can always be solved. */
export const SLIDER_START: number[] = (() => {
  const next = rng(5);
  let board = [...SOLVED];
  let last = -1;
  for (let i = 0; i < 28 || isSolved(board); i++) {
    const gap = board.indexOf(GAP);
    const options = around(gap).filter((p) => p !== last);
    const pick = options[Math.floor(next() * options.length)];
    board = slide(board, pick);
    last = gap;
  }
  return board;
})();

const manhattan = (board: number[]) =>
  board.reduce(
    (sum, t, i) =>
      t === GAP
        ? sum
        : sum +
          Math.abs(Math.floor(t / SIZE) - Math.floor(i / SIZE)) +
          Math.abs((t % SIZE) - (i % SIZE)),
    0,
  );

/** The shortest solution (IDA*), as the positions of the tiles to slide, in turn. */
export function solve(start: number[]): number[] {
  if (isSolved(start)) return [];
  const path: number[] = [];
  let bound = manhattan(start);
  const search = (board: number[], g: number, prevGap: number): number => {
    const f = g + manhattan(board);
    if (f > bound) return f;
    if (isSolved(board)) return -1;
    let min = Infinity;
    const gap = board.indexOf(GAP);
    for (const pos of around(gap)) {
      if (pos === prevGap) continue;
      path.push(pos);
      const t = search(slide(board, pos), g + 1, gap);
      if (t === -1) return -1;
      if (t < min) min = t;
      path.pop();
    }
    return min;
  };
  for (let i = 0; i < 40; i++) {
    const t = search(start, 0, -1);
    if (t === -1) return path;
    bound = t;
  }
  return path;
}

/* ------------------------------------------------------------------ the room */

/** Where things sit in the room's drawing, in its 1600 x 900 units. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ROOM = { w: 1600, h: 900 };

export const ZONES: { id: Zone; name: string; from: number; to: number }[] = [
  { id: 'shelf', name: 'Bookshelf', from: 0, to: 385 },
  { id: 'wall', name: 'Safe wall', from: 385, to: 800 },
  { id: 'desk', name: 'Desk', from: 800, to: 1236 },
  { id: 'corner', name: 'Window and door', from: 1236, to: 1600 },
];

interface Common {
  name: string;
  zone: Zone;
  box: Box;
}

export interface LockDef extends Common {
  kind: 'lock';
  id: LockId;
  mechanism: string;
  section: SectionId;
  /** What's engraved on it: the riddle. */
  plate: string;
  /** Two hints, the second more direct. */
  hints: [string, string];
  /** The try button. */
  action: string;
  /** What "show me" sets, said in words. */
  answer: string;
  /** Said when it opens, and in the room's label once it has. */
  opened: string;
  /** How to work it from the keyboard. */
  keys: string;
}

export interface ClueDef extends Common {
  kind: 'clue';
  id: ClueId;
  /** What the visitor writes down on seeing it. */
  note: string;
}

export type ObjectDef = LockDef | ClueDef;

const cardOrder = (Object.keys(roles) as RoleKey[]).sort((a, b) =>
  roles[a].org.localeCompare(roles[b].org, 'en', { numeric: true }),
);
/** The card file's cards, in the order a card file keeps them: by name. */
export const CARDS = cardOrder.map((id) => {
  const r: db.Role = roles[id];
  return {
    id,
    org: r.org,
    title: db.titlePath(r),
    contract: !!r.contract,
    from: r.from,
    to: r.to,
    range: `${fmt.mon(r.from)} – ${r.to ? fmt.mon(r.to) : 'now'}`,
  };
});

export const LOCKS: Record<LockId, LockDef> = {
  seal: {
    kind: 'lock',
    id: 'seal',
    name: 'Sealed envelope',
    mechanism: 'Wax seal',
    section: 'about',
    zone: 'desk',
    box: { x: 788, y: 520, w: 76, h: 76 },
    plate: 'To whoever is reading this. Press and hold the seal to break it.',
    hints: [
      'Press on the wax seal and keep holding until it cracks.',
      'On a keyboard, focus the seal and press Enter.',
    ],
    action: 'Break the seal',
    answer: 'a firm press',
    opened: 'Envelope opened',
    keys: 'Enter or Space breaks the seal.',
  },
  safe: {
    kind: 'lock',
    id: 'safe',
    name: 'Wall safe',
    mechanism: 'Rotary combination dial',
    section: 'education',
    zone: 'wall',
    box: { x: 414, y: 336, w: 196, h: 212 },
    plate: 'Right, then left, then pull. The year on the wall.',
    hints: [
      'A framed diploma hangs on the wall above the safe. It carries one year.',
      'Split that year in two. Turn right (clockwise) to the first two digits, left to the last two, then pull the handle.',
    ],
    action: 'Pull the handle',
    answer: `right to ${pad2(SAFE_CODE[0])}, left to ${pad2(SAFE_CODE[1])}`,
    opened: 'Safe opened',
    keys: '→ turns right, ← turns left, Shift for ten at a time. Enter pulls the handle.',
  },
  cabinet: {
    kind: 'lock',
    id: 'cabinet',
    name: 'Parts cabinet',
    mechanism: `${fmt.Spell(PADLOCK.length)}-wheel padlock`,
    section: 'hardware',
    zone: 'corner',
    box: { x: 1243, y: 594, w: 182, h: 258 },
    plate: `Readers online at ${fleet.scope}.`,
    hints: [
      `One of those readers sits on the desk. Its label carries the number.`,
      `Drop the plus sign and set the count on the ${fmt.spell(PADLOCK.length)} wheels, digit by digit.`,
    ],
    action: 'Pull the shackle',
    answer: PADLOCK.join(' '),
    opened: 'Cabinet opened',
    keys: '↑ ↓ turn a wheel, ← → move between wheels, or type the digits. Enter pulls the shackle.',
  },
  drawer: {
    kind: 'lock',
    id: 'drawer',
    name: 'Desk drawer',
    mechanism: `${fmt.Spell(WORD.length)}-letter word lock`,
    section: 'cv',
    zone: 'desk',
    box: { x: 866, y: 620, w: 176, h: 78 },
    plate: 'The company on my card.',
    hints: [
      'My business card stands on the desk, between the reader and the card file.',
      `Spell the company on the card that says ${current.title}, one letter a wheel. You can type the letters.`,
    ],
    action: 'Pull the drawer',
    answer: WORD,
    opened: 'Drawer opened',
    keys: '↑ ↓ turn a wheel, ← → move between wheels, or type the letters. Enter pulls the drawer.',
  },
  cryptex: {
    kind: 'lock',
    id: 'cryptex',
    name: 'Cryptex',
    mechanism: `${fmt.Spell(STACK.length)} rings of skills`,
    section: 'oss',
    zone: 'shelf',
    box: { x: 72, y: 428, w: 200, h: 80 },
    plate: `What ${neurobuild.title} runs on, in the order it’s written.`,
    hints: [
      `An index card on the corkboard lists the ${neurobuild.title} stack.`,
      `Take its first ${fmt.spell(STACK.length)}, in order. Each ring has one skill that contains one of them.`,
    ],
    action: 'Twist the caps apart',
    answer: CRYPTEX.map((i) => skills[i]).join(' · '),
    opened: 'Cryptex opened',
    keys: '↑ ↓ turn a ring, ← → move between rings, or type a first letter. Enter twists the caps.',
  },
  laptop: {
    kind: 'lock',
    id: 'laptop',
    name: 'Laptop',
    mechanism: 'Sliding-tile lock screen',
    section: 'products',
    zone: 'desk',
    box: { x: 864, y: 446, w: 186, h: 154 },
    plate: 'Put the picture back together.',
    hints: [
      `The polaroid on the corkboard shows the finished picture: the ${attendum.title} homepage.`,
      'Finish the top row first, then the left column; the last four tiles cycle round the gap. Arrow keys slide a tile into the gap.',
    ],
    action: 'Wake the screen',
    answer: 'the picture, put back together',
    opened: 'Laptop unlocked',
    keys: 'Arrow keys slide the tile next to the gap into it.',
  },
  shelf: {
    kind: 'lock',
    id: 'shelf',
    name: 'Bookshelf',
    mechanism: `Sequence lock, ${fmt.spell(ROLE_ORDER.length)} books`,
    section: 'experience',
    zone: 'shelf',
    box: { x: 54, y: 238, w: 264, h: 130 },
    plate: 'Pull the books in the order I joined them.',
    hints: [
      'The card file on the desk has a card for each of these, with dates.',
      'Start with the earliest date. A wrong book pushes them all back in.',
    ],
    action: 'Pull a book',
    answer: ROLE_ORDER.map(bookName).join(', '),
    opened: 'Bookshelf opened',
    keys: '← → move along the shelf, Enter pulls a book.',
  },
  door: {
    kind: 'lock',
    id: 'door',
    name: 'Door',
    mechanism: 'Keypad',
    section: 'contact',
    zone: 'corner',
    box: { x: 1436, y: 148, w: 158, h: 716 },
    plate: 'Years I’ve been building.',
    hints: [
      'The letter in the envelope says when I started. The wall calendar says when it is now.',
      'Subtract the year I started from the calendar’s year.',
    ],
    action: 'Try the code',
    answer: DOOR,
    opened: 'Door unlocked',
    keys: 'Type the digits, Backspace to clear one, Enter to try.',
  },
};

export const CLUES: Record<ClueId, ClueDef> = {
  diploma: {
    kind: 'clue',
    id: 'diploma',
    name: 'Framed diploma',
    zone: 'wall',
    box: { x: 404, y: 140, w: 212, h: 168 },
    note: `Diploma: ${db.degreeTitle(bsc)}, ${bsc.school}, ${bsc.to.y}.`,
  },
  calendar: {
    kind: 'clue',
    id: 'calendar',
    name: 'Wall calendar',
    zone: 'wall',
    box: { x: 668, y: 160, w: 116, h: 150 },
    note: `Calendar: ${fmt.month(asOf)}.`,
  },
  corkboard: {
    kind: 'clue',
    id: 'corkboard',
    name: 'Corkboard',
    zone: 'desk',
    box: { x: 824, y: 156, w: 234, h: 210 },
    note: `Corkboard: a polaroid of the ${attendum.title} homepage, and a card: ${neurobuild.title} runs on ${neurobuild.tech.join(', ')}.`,
  },
  reader: {
    kind: 'clue',
    id: 'reader',
    name: `${products.attendum.title} reader`,
    zone: 'desk',
    box: { x: 1052, y: 536, w: 40, h: 60 },
    note: `Reader on the desk: ${reader.tag}, ${fleet.online.short} online at ${fleet.scope}.`,
  },
  card: {
    kind: 'clue',
    id: 'card',
    name: 'Business card',
    zone: 'desk',
    box: { x: 1094, y: 548, w: 50, h: 48 },
    note: `My card: ${person.name}, ${current.title}, ${current.company}.`,
  },
  rolodex: {
    kind: 'clue',
    id: 'rolodex',
    name: 'Card file',
    zone: 'desk',
    box: { x: 1146, y: 508, w: 82, h: 88 },
    note: `Card file: ${CARDS.map((c) => `${c.org} from ${fmt.mon(c.from)}`).join('; ')}.`,
  },
  window: {
    kind: 'clue',
    id: 'window',
    name: 'Window',
    zone: 'corner',
    box: { x: 1244, y: 132, w: 172, h: 330 },
    note: `Outside: ${logger.tag}, a ${logger.kind.toLowerCase()}, ${logger.online.short} years online.`,
  },
};

/** Everything in the room, in reading (and tab) order: left to right, top to bottom. */
export const OBJECTS: ObjectDef[] = [
  LOCKS.shelf,
  LOCKS.cryptex,
  CLUES.diploma,
  LOCKS.safe,
  CLUES.calendar,
  CLUES.corkboard,
  LOCKS.seal,
  LOCKS.laptop,
  CLUES.reader,
  CLUES.card,
  CLUES.rolodex,
  LOCKS.drawer,
  CLUES.window,
  LOCKS.cabinet,
  LOCKS.door,
];

export const LOCK_IDS = Object.keys(LOCKS) as LockId[];
export const CLUE_IDS = Object.keys(CLUES) as ClueId[];
export const objectById = (id: ObjectId): ObjectDef =>
  id in LOCKS ? LOCKS[id as LockId] : CLUES[id as ClueId];

/** The notebook's pages, in reading order, and the lock that keeps each. */
export const SECTIONS: { id: SectionId; title: string; lock: LockId }[] = [
  { id: 'about', title: 'About', lock: 'seal' },
  { id: 'experience', title: 'Experience', lock: 'shelf' },
  { id: 'products', title: 'Products', lock: 'laptop' },
  { id: 'hardware', title: 'Hardware', lock: 'cabinet' },
  { id: 'oss', title: 'Open source', lock: 'cryptex' },
  { id: 'education', title: 'Education & awards', lock: 'safe' },
  { id: 'cv', title: 'CV', lock: 'drawer' },
  { id: 'contact', title: 'Contact', lock: 'door' },
];

export const sectionOf = (id: LockId) =>
  SECTIONS.find((s) => s.lock === id) as (typeof SECTIONS)[number];
