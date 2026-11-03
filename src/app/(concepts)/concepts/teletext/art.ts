// Block-mosaic artwork, drawn the way a graphics editor at the inserter would: on a grid of
// sextants (two across, three down per cell), with lines, boxes and arcs. Pictures only; every
// chart that carries a number is drawn from the data in pages.ts.

export class Pix {
  readonly d: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.d = new Uint8Array(w * h);
  }

  set(x: number, y: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = 1;
  }

  fill(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y);
  }

  rect(x0: number, y0: number, x1: number, y1: number) {
    for (let x = x0; x <= x1; x++) {
      this.set(x, y0);
      this.set(x, y1);
    }
    for (let y = y0; y <= y1; y++) {
      this.set(x0, y);
      this.set(x1, y);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  }

  /** An arc, angles in degrees with 0 to the right and 90 straight up. */
  arc(cx: number, cy: number, r: number, from = 0, to = 360) {
    const steps = Math.max(8, Math.round(r * 8));
    for (let i = 0; i <= steps; i++) {
      const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
      this.set(cx + Math.cos(a) * r, cy - Math.sin(a) * r);
    }
  }

  disc(cx: number, cy: number, r: number) {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y);
  }

  art(): string[] {
    return Array.from({ length: this.h }, (_, y) =>
      Array.from({ length: this.w }, (_, x) => (this.d[y * this.w + x] ? '#' : '.')).join(''),
    );
  }
}

/** A GSM weather station: a louvred screen on legs, the mast with its cup anemometer, solar panel, logger box and aerial. */
export function station() {
  const p = new Pix(40, 18);
  p.line(0, 17, 39, 17);
  // The instrument screen.
  p.rect(2, 6, 13, 12);
  [8, 10].forEach((y) => p.line(3, y, 12, y));
  p.line(3, 13, 3, 16);
  p.line(12, 13, 12, 16);
  // Mast and anemometer.
  p.fill(26, 2, 27, 16);
  p.line(19, 2, 34, 2);
  p.fill(17, 1, 19, 3);
  p.fill(34, 1, 36, 3);
  p.fill(25, 1, 28, 1);
  // Solar panel.
  for (let k = 0; k < 3; k++) p.line(28, 9 + k, 36, 5 + k);
  // Logger box with its GSM aerial.
  p.rect(19, 9, 24, 14);
  p.fill(21, 11, 22, 12);
  p.line(20, 9, 20, 5);
  p.arc(20, 5, 2, 30, 150);
  p.arc(20, 5, 4, 35, 145);
  p.line(13, 9, 18, 9);
  return p.art();
}

/** A pressure gauge on a pipe, the needle at its setpoint. */
export function gauge() {
  const p = new Pix(30, 18);
  p.arc(15, 7, 7);
  p.arc(15, 7, 5, 200, 340);
  p.line(15, 7, 19, 3);
  p.fill(14, 6, 16, 8);
  p.fill(14, 14, 16, 15);
  p.fill(0, 15, 29, 17);
  p.line(3, 13, 6, 13);
  p.line(5, 12, 6, 13);
  p.line(24, 13, 27, 13);
  p.line(26, 12, 27, 13);
  return p.art();
}

/** A DIN-rail PLC module: screw terminals top and bottom, status lights, a label. */
export function plcModule() {
  const p = new Pix(30, 15);
  p.rect(1, 3, 28, 11);
  for (let x = 3; x <= 26; x += 3) {
    p.fill(x, 0, x, 2);
    p.fill(x, 12, x, 14);
  }
  [4, 7, 10].forEach((x) => p.fill(x, 6, x + 1, 7));
  p.line(15, 6, 25, 6);
  p.line(15, 8, 22, 8);
  return p.art();
}

/** A wall-mounted card reader with a card held to it. */
export function reader() {
  const p = new Pix(30, 18);
  p.rect(3, 1, 13, 16);
  p.rect(5, 3, 11, 7);
  p.fill(6, 10, 7, 11);
  p.fill(9, 10, 10, 11);
  p.fill(6, 13, 10, 13);
  p.arc(14, 8, 3, -50, 50);
  p.arc(14, 8, 6, -45, 45);
  p.rect(21, 4, 28, 13);
  p.fill(23, 6, 25, 7);
  return p.art();
}

/** A BLE beacon puck, broadcasting. */
export function beacon() {
  const p = new Pix(30, 15);
  p.fill(10, 11, 19, 13);
  p.fill(11, 10, 18, 10);
  p.fill(14, 8, 15, 9);
  p.arc(14.5, 9, 4, 35, 145);
  p.arc(14.5, 9, 7, 30, 150);
  p.arc(14.5, 9, 10, 28, 152);
  return p.art();
}

/** A small-size-league robot and its ball. */
export function robot() {
  const p = new Pix(30, 15);
  p.rect(4, 2, 19, 11);
  p.line(5, 1, 18, 1);
  p.fill(6, 4, 9, 5);
  p.fill(14, 4, 17, 5);
  p.line(19, 9, 22, 9);
  p.fill(5, 12, 8, 13);
  p.fill(15, 12, 18, 13);
  p.disc(25, 11, 2);
  return p.art();
}

/** A self-balancing two-wheel robot. */
export function balancer() {
  const p = new Pix(30, 15);
  p.rect(12, 1, 17, 9);
  p.fill(13, 3, 16, 4);
  p.line(14, 9, 14, 11);
  p.line(15, 9, 15, 11);
  p.arc(14.5, 12, 2.4);
  p.line(4, 14, 25, 14);
  return p.art();
}

/** An envelope. */
export function envelope() {
  const p = new Pix(30, 15);
  p.rect(3, 1, 26, 13);
  p.line(3, 1, 14.5, 8);
  p.line(26, 1, 14.5, 8);
  return p.art();
}

/** A chip on a board: the hardware section's picture. */
export function chip() {
  const p = new Pix(36, 15);
  p.rect(9, 2, 26, 12);
  p.fill(11, 4, 12, 5);
  for (let y = 3; y <= 11; y += 2) {
    p.line(4, y, 8, y);
    p.line(27, y, 31, y);
  }
  p.line(0, 7, 4, 7);
  p.line(31, 7, 35, 7);
  return p.art();
}
