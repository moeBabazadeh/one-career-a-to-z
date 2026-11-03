// A Level 1 page decoder. Each row is 40 bytes; codes below 0x20 are spacing attributes that
// occupy a cell and change what follows. Some act on their own cell ("Set-At": steady, normal
// size, conceal, contiguous, separated, black and new background, hold) and the rest from the
// next cell on ("Set-After": the colours, flash, double height, release). Every row starts as
// white alphanumerics on black, steady, contiguous, normal size, revealed, released.
import { charOf, isMosaic } from './glyphs';

export const C = {
  AlphaRed: 0x01,
  AlphaGreen: 0x02,
  AlphaYellow: 0x03,
  AlphaBlue: 0x04,
  AlphaMagenta: 0x05,
  AlphaCyan: 0x06,
  AlphaWhite: 0x07,
  Flash: 0x08,
  Steady: 0x09,
  EndBox: 0x0a,
  StartBox: 0x0b,
  NormalSize: 0x0c,
  DoubleHeight: 0x0d,
  GfxRed: 0x11,
  GfxGreen: 0x12,
  GfxYellow: 0x13,
  GfxBlue: 0x14,
  GfxMagenta: 0x15,
  GfxCyan: 0x16,
  GfxWhite: 0x17,
  Conceal: 0x18,
  Contiguous: 0x19,
  Separated: 0x1a,
  BlackBg: 0x1c,
  NewBg: 0x1d,
  Hold: 0x1e,
  Release: 0x1f,
} as const;

/** One decoded cell: what to draw and how. `dh` is 0 for normal size, 1 for the top half of a double-height character, 2 for its bottom half. */
export interface Cell {
  code: number;
  fg: number;
  bg: number;
  mosaic: boolean;
  sep: boolean;
  flash: boolean;
  conceal: boolean;
  dh: 0 | 1 | 2;
}

const SPACE = 0x20;

function decodeRow(row: number[], allowDouble: boolean): { cells: Cell[]; double: boolean } {
  let fg = 7,
    bg = 0,
    gfx = false,
    sep = false,
    flash = false,
    conceal = false,
    dh = false,
    hold = false;
  let held = SPACE,
    heldSep = false,
    double = false;
  const cells: Cell[] = [];
  for (let x = 0; x < 40; x++) {
    const c = (row[x] ?? SPACE) & 0x7f;
    if (c >= 0x20) {
      cells.push({ code: c, fg, bg, mosaic: gfx, sep, flash, conceal, dh: dh ? 1 : 0 });
      if (gfx && isMosaic(c)) {
        held = c;
        heldSep = sep;
      }
      continue;
    }
    // Set-At: these change the cell they sit in.
    if (c === C.Steady) flash = false;
    else if (c === C.NormalSize && dh) {
      dh = false;
      held = SPACE;
    } else if (c === C.Conceal) conceal = true;
    else if (c === C.Contiguous) sep = false;
    else if (c === C.Separated) sep = true;
    else if (c === C.BlackBg) bg = 0;
    else if (c === C.NewBg) bg = fg;
    else if (c === C.Hold) hold = true;
    // The attribute's own cell shows a space, or under hold the last mosaic, as it was drawn.
    const showHeld = hold && gfx;
    cells.push({
      code: showHeld ? held : SPACE,
      fg,
      bg,
      mosaic: gfx,
      sep: showHeld ? heldSep : sep,
      flash,
      conceal,
      dh: dh ? 1 : 0,
    });
    // Set-After: these take effect from the next cell.
    if (c >= C.AlphaRed && c <= C.AlphaWhite) {
      fg = c;
      conceal = false;
      if (gfx) {
        gfx = false;
        held = SPACE;
      }
    } else if (c >= C.GfxRed && c <= C.GfxWhite) {
      fg = c - 0x10;
      conceal = false;
      if (!gfx) {
        gfx = true;
        held = SPACE;
      }
    } else if (c === C.Flash) flash = true;
    else if (c === C.DoubleHeight && allowDouble && !dh) {
      dh = true;
      double = true;
      held = SPACE;
    } else if (c === C.Release) hold = false;
  }
  return { cells, double };
}

/**
 * Decodes a whole page. A row with double height takes over the row below: that row's own bytes
 * are ignored and it shows the bottom halves, with plain background where the row above had
 * normal-size characters. Rows 0 and 23 cannot start double height.
 */
export function decodePage(rows: number[][]): Cell[][] {
  const out: Cell[][] = [];
  let lowerFrom: Cell[] | null = null;
  for (let y = 0; y < rows.length; y++) {
    if (lowerFrom) {
      out.push(
        lowerFrom.map((cell) =>
          cell.dh ? { ...cell, dh: 2 } : { ...cell, code: SPACE, mosaic: false, dh: 0 },
        ),
      );
      lowerFrom = null;
      continue;
    }
    const { cells, double } = decodeRow(rows[y], y > 0 && y < rows.length - 1);
    out.push(cells);
    if (double) lowerFrom = cells;
  }
  return out;
}

/** The page as plain text, one string per row that has any text, for screen readers. */
export function plainText(cells: Cell[][]): string[] {
  const lines: string[] = [];
  cells.forEach((row) => {
    if (row.some((c) => c.dh === 2)) return;
    const text = row
      .map((c) => ((c.mosaic && isMosaic(c.code)) || c.conceal ? ' ' : charOf(c.code)))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) lines.push(text);
  });
  return lines;
}
