// The character generator. An SAA5050-style set drawn here dot by dot: 5×9 alphanumerics in a
// 6×10 cell, with the English national option (£ ← ½ → ↑ # — ¼ ‖ ¾ ÷), and the 2×3 block mosaics.
// Like the real chip, it rounds characters: each dot is doubled to a 10×20 grid and every
// diagonal step gets a half-dot filled in, so slopes come out smooth at any scale.

/** Logical pixels per character cell: the 6×10 dot cell, doubled by character rounding. */
export const CELL_W = 12;
export const CELL_H = 20;
export const COLS = 40;
export const ROWS = 24;
export const SCREEN_W = COLS * CELL_W;
export const SCREEN_H = ROWS * CELL_H;

// Rows of dots from the top of the cell. Row 0 is the line above capitals, rows 8 and 9 hold
// descenders. '#' is a lit dot. Codes 0x20–0x7f, keyed by the code the decoder sees.
const DOTS: Record<number, string> = {
  0x21: '|..#..|..#..|..#..|..#..|..#..|.....|..#..',
  0x22: '|.#.#.|.#.#.|.#.#.',
  0x23: '|..##.|.#..#|.#...|###..|.#...|.#...|#####', // £
  0x24: '|.###.|#.#.#|#.#..|.###.|..#.#|#.#.#|.###.',
  0x25: '|##...|##..#|...#.|..#..|.#...|#..##|...##',
  0x26: '|.#...|#.#..|#.#..|.#...|#.#.#|#..#.|.##.#',
  0x27: '|..#..|..#..|..#..',
  0x28: '|...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  0x29: '|.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  0x2a: '|..#..|#.#.#|.###.|..#..|.###.|#.#.#|..#..',
  0x2b: '|.....|..#..|..#..|#####|..#..|..#..',
  0x2c: '|.....|.....|.....|.....|.....|..#..|..#..|.#...',
  0x2d: '|.....|.....|.....|.###.',
  0x2e: '|.....|.....|.....|.....|.....|.....|..#..',
  0x2f: '|.....|....#|...#.|..#..|.#...|#....',
  0x30: '|..#..|.#.#.|#...#|#...#|#...#|.#.#.|..#..',
  0x31: '|..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  0x32: '|.###.|#...#|....#|..##.|.#...|#....|#####',
  0x33: '|#####|....#|...#.|..##.|....#|#...#|.###.',
  0x34: '|...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  0x35: '|#####|#....|####.|....#|....#|#...#|.###.',
  0x36: '|..##.|.#...|#....|####.|#...#|#...#|.###.',
  0x37: '|#####|....#|...#.|..#..|.#...|.#...|.#...',
  0x38: '|.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  0x39: '|.###.|#...#|#...#|.####|....#|...#.|.##..',
  0x3a: '|.....|.....|..#..|.....|.....|.....|..#..',
  0x3b: '|.....|.....|..#..|.....|.....|..#..|..#..|.#...',
  0x3c: '|...#.|..#..|.#...|#....|.#...|..#..|...#.',
  0x3d: '|.....|.....|#####|.....|#####',
  0x3e: '|.#...|..#..|...#.|....#|...#.|..#..|.#...',
  0x3f: '|.###.|#...#|...#.|..#..|..#..|.....|..#..',
  0x40: '|.###.|#...#|#.###|#.#.#|#.###|#....|.###.',
  0x41: '|..#..|.#.#.|#...#|#...#|#####|#...#|#...#',
  0x42: '|####.|#...#|#...#|####.|#...#|#...#|####.',
  0x43: '|.###.|#...#|#....|#....|#....|#...#|.###.',
  0x44: '|####.|#...#|#...#|#...#|#...#|#...#|####.',
  0x45: '|#####|#....|#....|####.|#....|#....|#####',
  0x46: '|#####|#....|#....|####.|#....|#....|#....',
  0x47: '|.###.|#...#|#....|#....|#..##|#...#|.####',
  0x48: '|#...#|#...#|#...#|#####|#...#|#...#|#...#',
  0x49: '|.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  0x4a: '|....#|....#|....#|....#|....#|#...#|.###.',
  0x4b: '|#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  0x4c: '|#....|#....|#....|#....|#....|#....|#####',
  0x4d: '|#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  0x4e: '|#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  0x4f: '|.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  0x50: '|####.|#...#|#...#|####.|#....|#....|#....',
  0x51: '|.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  0x52: '|####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  0x53: '|.###.|#...#|#....|.###.|....#|#...#|.###.',
  0x54: '|#####|..#..|..#..|..#..|..#..|..#..|..#..',
  0x55: '|#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  0x56: '|#...#|#...#|#...#|.#.#.|.#.#.|..#..|..#..',
  0x57: '|#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  0x58: '|#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  0x59: '|#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  0x5a: '|#####|....#|...#.|..#..|.#...|#....|#####',
  0x5b: '|.....|..#..|.#...|#####|.#...|..#..', // ←
  0x5c: '|#....|#....|#....|#..##|....#|...#.|..###', // ½
  0x5d: '|.....|..#..|...#.|#####|...#.|..#..', // →
  0x5e: '|..#..|.###.|#.#.#|..#..|..#..|..#..|..#..', // ↑
  0x5f: '|.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.', // #
  0x60: '|.....|.....|.....|#####', // —
  0x61: '|.....|.....|.###.|....#|.####|#...#|.####',
  0x62: '|#....|#....|####.|#...#|#...#|#...#|####.',
  0x63: '|.....|.....|.####|#....|#....|#....|.####',
  0x64: '|....#|....#|.####|#...#|#...#|#...#|.####',
  0x65: '|.....|.....|.###.|#...#|#####|#....|.###.',
  0x66: '|..##.|.#...|.#...|###..|.#...|.#...|.#...',
  0x67: '|.....|.....|.####|#...#|#...#|#...#|.####|....#|.###.',
  0x68: '|#....|#....|####.|#...#|#...#|#...#|#...#',
  0x69: '|..#..|.....|.##..|..#..|..#..|..#..|.###.',
  0x6a: '|...#.|.....|..##.|...#.|...#.|...#.|...#.|...#.|.##..',
  0x6b: '|.#...|.#...|.#..#|.#.#.|.##..|.#.#.|.#..#',
  0x6c: '|.##..|..#..|..#..|..#..|..#..|..#..|.###.',
  0x6d: '|.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#',
  0x6e: '|.....|.....|####.|#...#|#...#|#...#|#...#',
  0x6f: '|.....|.....|.###.|#...#|#...#|#...#|.###.',
  0x70: '|.....|.....|####.|#...#|#...#|#...#|####.|#....|#....',
  0x71: '|.....|.....|.####|#...#|#...#|#...#|.####|....#|....#',
  0x72: '|.....|.....|.#.##|.##..|.#...|.#...|.#...',
  0x73: '|.....|.....|.####|#....|.###.|....#|####.',
  0x74: '|.#...|.#...|###..|.#...|.#...|.#...|..##.',
  0x75: '|.....|.....|#...#|#...#|#...#|#...#|.####',
  0x76: '|.....|.....|#...#|#...#|.#.#.|.#.#.|..#..',
  0x77: '|.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.',
  0x78: '|.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  0x79: '|.....|.....|#...#|#...#|#...#|#...#|.####|....#|.###.',
  0x7a: '|.....|.....|#####|...#.|..#..|.#...|#####',
  0x7b: '|#....|#....|#....|#..#.|..##.|.#.#.|.####|...#.', // ¼
  0x7c: '|.#.#.|.#.#.|.#.#.|.#.#.|.#.#.|.#.#.|.#.#.', // ‖
  0x7d: '|##...|..#..|##...|..##.|##.#.|..###|...#.', // ¾
  0x7e: '|.....|..#..|.....|#####|.....|..#..', // ÷
  0x7f: '#####|#####|#####|#####|#####|#####|#####|#####|#####|#####', // ■
};

/** The 5×10 dot matrix of a code, as rows of booleans. */
function dots(code: number): boolean[][] {
  const rows = (DOTS[code] ?? '').split('|');
  return Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) => rows[r]?.[c] === '#'),
  );
}

/**
 * Character rounding, as the chip does it on the second field: double every dot, then wherever
 * two dots touch only at a corner, fill the half-dots either side of the joint.
 */
function rounded(code: number): Uint8Array {
  const g = dots(code);
  const out = new Uint8Array(CELL_W * CELL_H);
  // The glyph sits in the right five of the cell's six dot columns.
  const set = (y: number, x: number) => {
    out[y * CELL_W + x + 2] = 1;
  };
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 5; c++)
      if (g[r][c]) {
        set(2 * r, 2 * c);
        set(2 * r, 2 * c + 1);
        set(2 * r + 1, 2 * c);
        set(2 * r + 1, 2 * c + 1);
      }
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 4; c++) {
      const a = g[r][c],
        b = g[r][c + 1],
        d = g[r + 1][c],
        e = g[r + 1][c + 1];
      // Down and to the right: ■ above-left, ■ below-right.
      if (a && e && !b && !d) {
        set(2 * r + 1, 2 * c + 2);
        set(2 * r + 2, 2 * c + 1);
      }
      // Down and to the left.
      if (b && d && !a && !e) {
        set(2 * r + 1, 2 * c + 1);
        set(2 * r + 2, 2 * c + 2);
      }
    }
  return out;
}

/**
 * A block mosaic. The six cells of the 2×3 grid are the code's bits 0–4 and 6. The rows split the
 * ten-line cell 3:4:3; separated mosaics lose a dot down the left and a line along the bottom.
 */
function mosaic(code: number, separated: boolean): Uint8Array {
  const out = new Uint8Array(CELL_W * CELL_H);
  const bits = [code & 1, code & 2, code & 4, code & 8, code & 16, code & 64];
  const ys = [0, 6, 14, 20];
  for (let i = 0; i < 6; i++) {
    if (!bits[i]) continue;
    const col = i % 2,
      row = (i / 2) | 0;
    const x0 = col * 6 + (separated ? 2 : 0),
      x1 = col * 6 + 6;
    const y0 = ys[row],
      y1 = ys[row + 1] - (separated ? 2 : 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[y * CELL_W + x] = 1;
  }
  return out;
}

const glyphCache = new Map<number, Uint8Array>();
const mosaicCache = new Map<number, Uint8Array>();

export function glyph(code: number) {
  let g = glyphCache.get(code);
  if (!g) glyphCache.set(code, (g = rounded(code)));
  return g;
}

export function block(code: number, separated: boolean) {
  const key = code | (separated ? 0x100 : 0);
  let m = mosaicCache.get(key);
  if (!m) mosaicCache.set(key, (m = mosaic(code, separated)));
  return m;
}

/** The six-bit sextant mask, top-left first, as a G1 mosaic code. */
export const sextant = (mask: number) => 0x20 | (mask & 0x1f) | (mask & 0x20 ? 0x40 : 0);

/** A code shows as a mosaic in graphics mode unless it is one of the blast-through capitals. */
export const isMosaic = (code: number) => (code & 0x20) !== 0;

/** The caps of the character set, rows 1–7, for drawing big mosaic headlines. */
export function capRows(ch: string): boolean[][] {
  const code = encodeChar(ch);
  return dots(code).slice(1, 8);
}

// Unicode in, the 7-bit English set out. Anything the set lacks falls back to its nearest.
const TO_CODE: Record<string, number> = {
  '£': 0x23,
  '#': 0x5f,
  '←': 0x5b,
  '½': 0x5c,
  '→': 0x5d,
  '↑': 0x5e,
  '—': 0x60,
  '¼': 0x7b,
  '‖': 0x7c,
  '¾': 0x7d,
  '÷': 0x7e,
  '■': 0x7f,
  '’': 0x27,
  '‘': 0x27,
  '`': 0x27,
  '“': 0x22,
  '”': 0x22,
  '–': 0x2d,
  _: 0x2d,
  '~': 0x2d,
  '·': 0x2e,
  '•': 0x2a,
  '[': 0x28,
  ']': 0x29,
  '{': 0x28,
  '}': 0x29,
  '|': 0x2f,
  '\\': 0x2f,
  '×': 0x78,
};

export function encodeChar(ch: string): number {
  if (ch in TO_CODE) return TO_CODE[ch];
  const c = ch.normalize('NFD').charCodeAt(0);
  if (
    c >= 0x20 &&
    c < 0x7f &&
    c !== 0x23 &&
    c !== 0x5b &&
    c !== 0x5c &&
    c !== 0x5d &&
    c !== 0x5e &&
    c !== 0x5f &&
    c !== 0x60 &&
    c < 0x7b
  )
    return c;
  return 0x3f;
}

/** The text a code stands for, for screen readers and the page's plain text. */
const FROM_CODE: Record<number, string> = {
  0x23: '£',
  0x5b: '←',
  0x5c: '½',
  0x5d: '→',
  0x5e: '↑',
  0x5f: '#',
  0x60: '—',
  0x7b: '¼',
  0x7c: '‖',
  0x7d: '¾',
  0x7e: '÷',
  0x7f: '■',
};
export const charOf = (code: number) => FROM_CODE[code] ?? String.fromCharCode(code);
