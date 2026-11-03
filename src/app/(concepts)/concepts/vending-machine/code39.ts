// A real Code 39 barcode for the receipts, so a scanner reads the slot code back. Each character
// is five bars and four spaces, three of them wide; a narrow gap separates characters and the
// whole thing is framed by the * start and stop character.
const TABLE: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '*': 'nwnnwnwnn',
};

const NARROW = 1;
const WIDE = 2.5;

/** The bars for `text` as [x, width] pairs, and the total width, in narrow-bar units. */
export function code39(text: string) {
  const chars = `*${text.toUpperCase().replace(/[^0-9A-Z. -]/g, '-')}*`;
  const bars: [number, number][] = [];
  let x = 0;
  for (const ch of chars) {
    const pattern = TABLE[ch];
    for (let i = 0; i < pattern.length; i++) {
      const w = pattern[i] === 'w' ? WIDE : NARROW;
      if (i % 2 === 0) bars.push([x, w]);
      x += w;
    }
    x += NARROW;
  }
  return { bars, width: x - NARROW };
}
