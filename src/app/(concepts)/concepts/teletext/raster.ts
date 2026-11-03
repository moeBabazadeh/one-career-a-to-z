// Draws decoded cells into a 480×480 frame of logical pixels: 40 cells of 12 across, 24 rows of
// 20 down. The screen canvas then scales that frame up with nearest-neighbour sampling, so every
// dot stays a hard-edged block at any size.
import type { Cell } from './decode';
import { CELL_H, CELL_W, COLS, SCREEN_W, block, glyph, isMosaic } from './glyphs';

/** The eight colours of Level 1, at full saturation, as RGB. */
export const RGB: [number, number, number][] = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

// ImageData wants RGBA bytes; on little-endian machines a Uint32 reads them as ABGR.
const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const PIXEL = RGB.map(([r, g, b]) =>
  LITTLE
    ? (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0,
);

export interface Show {
  /** Flashing characters are in their off phase. */
  flashOff: boolean;
  /** Concealed characters are revealed. */
  reveal: boolean;
}

/** Paints the decoded rows into `px`, a SCREEN_W × SCREEN_H frame of packed RGBA. */
export function raster(px: Uint32Array, cells: Cell[][], show: Show) {
  for (let r = 0; r < cells.length; r++) {
    const row = cells[r];
    for (let col = 0; col < COLS; col++) {
      const cell = row[col];
      const fg = PIXEL[cell.fg],
        bg = PIXEL[cell.bg];
      const hidden =
        (cell.conceal && !show.reveal) || (cell.flash && show.flashOff) || cell.code === 0x20;
      const bmp = hidden
        ? null
        : cell.mosaic && isMosaic(cell.code)
          ? block(cell.code, cell.sep)
          : glyph(cell.code);
      const x0 = col * CELL_W,
        y0 = r * CELL_H;
      for (let y = 0; y < CELL_H; y++) {
        // Double height reads each source line twice, the top half from lines 0–9, the bottom from 10–19.
        const sy = cell.dh === 0 ? y : (y >> 1) + (cell.dh === 2 ? CELL_H / 2 : 0);
        let o = (y0 + y) * SCREEN_W + x0;
        if (!bmp) {
          px.fill(bg, o, o + CELL_W);
          continue;
        }
        const s = sy * CELL_W;
        for (let x = 0; x < CELL_W; x++, o++) px[o] = bmp[s + x] ? fg : bg;
      }
    }
  }
}

/** The frame's average colour, for the light the screen throws into the room. */
export function average(px: Uint32Array): [number, number, number] {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < px.length; i += 7) {
    const v = px[i];
    if (LITTLE) {
      r += v & 0xff;
      g += (v >>> 8) & 0xff;
      b += (v >>> 16) & 0xff;
    } else {
      r += v >>> 24;
      g += (v >>> 16) & 0xff;
      b += (v >>> 8) & 0xff;
    }
    n++;
  }
  return [r / n, g / n, b / n];
}
