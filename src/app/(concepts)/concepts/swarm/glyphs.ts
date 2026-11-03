// Shapes the swarm can fly: a stroke font and a set of line icons, both as polylines. Drone
// shows draw with strokes of lights rather than filled shapes, so every shape here is a set of
// paths that formations.ts spaces drones along. Units are free; y points down while authoring
// and is flipped when a shape is placed in the sky.

export type Pt = readonly [number, number];

/** A polyline with the LED colour its drones show. One point is a single drone. */
export interface Stroke {
  pts: Pt[];
  c: number;
}

/** LED colours, as indices into the --led-* tokens. */
export const LED = { cyan: 0, amber: 1, orange: 2, green: 3, ice: 4, blue: 5 } as const;
export const LED_COUNT = 6;

/* ------------------------------------------------------------------ the stroke font */

// Capitals and digits on a 4 x 6 grid with chamfered corners, the drone-show way of drawing a
// curve with few lights. Each entry is [advance width, strokes].
type GlyphDef = [number, Pt[][]];

const O: Pt[] = [
  [1, 0],
  [3, 0],
  [4, 1],
  [4, 5],
  [3, 6],
  [1, 6],
  [0, 5],
  [0, 1],
  [1, 0],
];
const P_BOWL: Pt[] = [
  [0, 6],
  [0, 0],
  [3, 0],
  [4, 1],
  [4, 2.4],
  [3, 3.4],
  [0, 3.4],
];

const FONT: Record<string, GlyphDef> = {
  A: [
    4,
    [
      [
        [0, 6],
        [0, 1],
        [1, 0],
        [3, 0],
        [4, 1],
        [4, 6],
      ],
      [
        [0, 3.5],
        [4, 3.5],
      ],
    ],
  ],
  B: [
    4,
    [
      [
        [0, 6],
        [0, 0],
        [3, 0],
        [4, 1],
        [4, 2],
        [3, 3],
        [0, 3],
      ],
      [
        [3, 3],
        [4, 4],
        [4, 5],
        [3, 6],
        [0, 6],
      ],
    ],
  ],
  C: [
    4,
    [
      [
        [4, 1],
        [3, 0],
        [1, 0],
        [0, 1],
        [0, 5],
        [1, 6],
        [3, 6],
        [4, 5],
      ],
    ],
  ],
  D: [
    4,
    [
      [
        [0, 0],
        [3, 0],
        [4, 1],
        [4, 5],
        [3, 6],
        [0, 6],
        [0, 0],
      ],
    ],
  ],
  E: [
    3.6,
    [
      [
        [3.6, 0],
        [0, 0],
        [0, 6],
        [3.6, 6],
      ],
      [
        [0, 3],
        [3, 3],
      ],
    ],
  ],
  F: [
    3.6,
    [
      [
        [3.6, 0],
        [0, 0],
        [0, 6],
      ],
      [
        [0, 3],
        [3, 3],
      ],
    ],
  ],
  G: [
    4,
    [
      [
        [4, 1],
        [3, 0],
        [1, 0],
        [0, 1],
        [0, 5],
        [1, 6],
        [3, 6],
        [4, 5],
        [4, 3.4],
        [2.2, 3.4],
      ],
    ],
  ],
  H: [
    4,
    [
      [
        [0, 0],
        [0, 6],
      ],
      [
        [4, 0],
        [4, 6],
      ],
      [
        [0, 3],
        [4, 3],
      ],
    ],
  ],
  I: [
    2,
    [
      [
        [0, 0],
        [2, 0],
      ],
      [
        [1, 0],
        [1, 6],
      ],
      [
        [0, 6],
        [2, 6],
      ],
    ],
  ],
  J: [
    4,
    [
      [
        [4, 0],
        [4, 5],
        [3, 6],
        [1, 6],
        [0, 5],
      ],
    ],
  ],
  K: [
    4,
    [
      [
        [0, 0],
        [0, 6],
      ],
      [
        [4, 0],
        [0, 4],
      ],
      [
        [1.6, 2.4],
        [4, 6],
      ],
    ],
  ],
  L: [
    3.6,
    [
      [
        [0, 0],
        [0, 6],
        [3.6, 6],
      ],
    ],
  ],
  M: [
    5,
    [
      [
        [0, 6],
        [0, 0],
        [2.5, 3.4],
        [5, 0],
        [5, 6],
      ],
    ],
  ],
  N: [
    4,
    [
      [
        [0, 6],
        [0, 0],
        [4, 6],
        [4, 0],
      ],
    ],
  ],
  O: [4, [O]],
  P: [4, [P_BOWL]],
  Q: [
    4,
    [
      O,
      [
        [2.6, 4.6],
        [4, 6],
      ],
    ],
  ],
  R: [
    4,
    [
      P_BOWL,
      [
        [2.2, 3.4],
        [4, 6],
      ],
    ],
  ],
  S: [
    4,
    [
      [
        [4, 1],
        [3, 0],
        [1, 0],
        [0, 1],
        [0, 2],
        [1, 3],
        [3, 3],
        [4, 4],
        [4, 5],
        [3, 6],
        [1, 6],
        [0, 5],
      ],
    ],
  ],
  T: [
    4,
    [
      [
        [0, 0],
        [4, 0],
      ],
      [
        [2, 0],
        [2, 6],
      ],
    ],
  ],
  U: [
    4,
    [
      [
        [0, 0],
        [0, 5],
        [1, 6],
        [3, 6],
        [4, 5],
        [4, 0],
      ],
    ],
  ],
  V: [
    4,
    [
      [
        [0, 0],
        [2, 6],
        [4, 0],
      ],
    ],
  ],
  W: [
    5.4,
    [
      [
        [0, 0],
        [1.35, 6],
        [2.7, 2.4],
        [4.05, 6],
        [5.4, 0],
      ],
    ],
  ],
  X: [
    4,
    [
      [
        [0, 0],
        [4, 6],
      ],
      [
        [4, 0],
        [0, 6],
      ],
    ],
  ],
  Y: [
    4,
    [
      [
        [0, 0],
        [2, 3],
        [4, 0],
      ],
      [
        [2, 3],
        [2, 6],
      ],
    ],
  ],
  Z: [
    4,
    [
      [
        [0, 0],
        [4, 0],
        [0, 6],
        [4, 6],
      ],
    ],
  ],
  '0': [4, [O]],
  '1': [
    3,
    [
      [
        [0.3, 1.4],
        [1.8, 0],
        [1.8, 6],
      ],
      [
        [0.3, 6],
        [3, 6],
      ],
    ],
  ],
  '2': [
    4,
    [
      [
        [0, 1],
        [1, 0],
        [3, 0],
        [4, 1],
        [4, 2.4],
        [0, 6],
        [4, 6],
      ],
    ],
  ],
  '3': [
    4,
    [
      [
        [0, 1],
        [1, 0],
        [3, 0],
        [4, 1],
        [4, 2],
        [3, 3],
        [1.4, 3],
      ],
      [
        [3, 3],
        [4, 4],
        [4, 5],
        [3, 6],
        [1, 6],
        [0, 5],
      ],
    ],
  ],
  '4': [
    4,
    [
      [
        [3, 6],
        [3, 0],
        [0, 4],
        [4, 4],
      ],
    ],
  ],
  '5': [
    4,
    [
      [
        [4, 0],
        [0, 0],
        [0, 2.8],
        [3, 2.8],
        [4, 3.8],
        [4, 5],
        [3, 6],
        [1, 6],
        [0, 5],
      ],
    ],
  ],
  '6': [
    4,
    [
      [
        [4, 1],
        [3, 0],
        [1, 0],
        [0, 1],
        [0, 5],
        [1, 6],
        [3, 6],
        [4, 5],
        [4, 4],
        [3, 3],
        [0, 3],
      ],
    ],
  ],
  '7': [
    4,
    [
      [
        [0, 0],
        [4, 0],
        [1.4, 6],
      ],
    ],
  ],
  '8': [
    4,
    [
      [
        [1, 3],
        [0, 2],
        [0, 1],
        [1, 0],
        [3, 0],
        [4, 1],
        [4, 2],
        [3, 3],
        [1, 3],
        [0, 4],
        [0, 5],
        [1, 6],
        [3, 6],
        [4, 5],
        [4, 4],
        [3, 3],
      ],
    ],
  ],
  '9': [
    4,
    [
      [
        [4, 3],
        [1, 3],
        [0, 2],
        [0, 1],
        [1, 0],
        [3, 0],
        [4, 1],
        [4, 5],
        [3, 6],
        [1, 6],
        [0, 5],
      ],
    ],
  ],
  '+': [
    4,
    [
      [
        [2, 1.6],
        [2, 5.4],
      ],
      [
        [0.1, 3.5],
        [3.9, 3.5],
      ],
    ],
  ],
  '.': [0.6, [[[0.3, 6]]]],
  '-': [
    3,
    [
      [
        [0.2, 3.4],
        [2.8, 3.4],
      ],
    ],
  ],
  '/': [
    3,
    [
      [
        [0, 6],
        [3, 0],
      ],
    ],
  ],
  ' ': [2.2, []],
};

const CAP = 6;
const GAP = 1.6;

/** Text as strokes, cap height 6, starting at x = 0. Unknown characters are skipped. */
export function textStrokes(
  text: string,
  color: (ch: string) => number = () => LED.cyan,
): { strokes: Stroke[]; w: number; h: number } {
  const strokes: Stroke[] = [];
  let x = 0;
  const chars = [...text.toUpperCase()].filter((ch) => FONT[ch]);
  chars.forEach((ch, i) => {
    const [w, paths] = FONT[ch];
    for (const p of paths)
      strokes.push({ pts: p.map(([px, py]) => [px + x, py] as Pt), c: color(ch) });
    x += w + (i < chars.length - 1 ? GAP : 0);
  });
  return { strokes, w: x, h: CAP };
}

/* ------------------------------------------------------------------ icons */

/** An arc as a polyline: centre, radius, start and end angle in degrees (y down, so clockwise). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps?: number): Pt[] {
  const n = steps ?? Math.max(3, Math.round(Math.abs(a1 - a0) / 15));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });
}

const circle = (cx: number, cy: number, r: number) =>
  arc(cx, cy, r, 0, 360, Math.max(8, Math.round(r * 5)));
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
const s = (c: number, ...paths: Pt[][]): Stroke[] => paths.map((pts) => ({ pts, c }));

/** A quadcopter seen from above: four rotors, the arms and the body. */
function quad(): Stroke[] {
  const rotors: Pt[] = [
    [4, 3],
    [16, 3],
    [4, 13],
    [16, 13],
  ];
  const R = 2.8;
  const arms = rotors.map(([x, y]) => {
    const dx = 10 - x,
      dy = 8 - y,
      d = Math.hypot(dx, dy);
    return [
      [x + (dx / d) * R, y + (dy / d) * R],
      [10 - (dx / d) * 2.2, 8 - (dy / d) * 1.6],
    ] as Pt[];
  });
  return [
    ...s(LED.amber, ...rotors.map(([x, y]) => circle(x, y, R))),
    ...s(LED.cyan, ...arms, rect(7.8, 6.4, 12.2, 9.6)),
    ...s(LED.green, [[10, 4.6]]),
  ];
}

/** A small-size-league robot: a circle with the flat front where the dribbler sits. */
function robot(cx: number, cy: number, r: number, facing: number): Pt[] {
  return [
    ...arc(cx, cy, r, facing + 42, facing + 318, 10),
    [
      cx + r * Math.cos(((facing + 42) * Math.PI) / 180),
      cy + r * Math.sin(((facing + 42) * Math.PI) / 180),
    ],
  ];
}

/** A team of `n` robots in a zig-zag, facing the ball. */
function team(n: number): Stroke[] {
  const bots = Array.from({ length: n }, (_, i) => {
    const x = n === 1 ? 10 : 2.6 + (i * 14.8) / (n - 1);
    const y = i % 2 ? 10.4 : 4.2;
    const facing = (Math.atan2(15 - y, 10 - x) * 180) / Math.PI;
    return robot(x, y, 2.3, facing);
  });
  return [...s(LED.cyan, ...bots), ...s(LED.orange, [[10, 15]])];
}

export type IconId =
  | 'quad'
  | 'trophy'
  | 'medal'
  | 'cap'
  | 'paper'
  | 'building'
  | 'claim'
  | 'reader'
  | 'beacon'
  | 'mast'
  | 'screen'
  | 'gauge'
  | 'plc'
  | 'envelope'
  | 'team';

/** Line icons, drawn in about a 20 x 14 box. `team` takes the team size. */
export function iconStrokes(id: IconId, n = 5): Stroke[] {
  switch (id) {
    case 'quad':
      return quad();
    case 'team':
      return team(n);
    case 'trophy':
      return [
        ...s(LED.amber, [
          [5, 1],
          [15, 1],
          [15, 5],
          [14, 8],
          [12, 10],
          [8, 10],
          [6, 8],
          [5, 5],
          [5, 1],
        ]),
        ...s(
          LED.amber,
          [
            [5, 2.6],
            [2.4, 2.6],
            [2, 4.4],
            [3.2, 6.4],
            [5.6, 7.2],
          ],
          [
            [15, 2.6],
            [17.6, 2.6],
            [18, 4.4],
            [16.8, 6.4],
            [14.4, 7.2],
          ],
        ),
        ...s(
          LED.ice,
          [
            [10, 10],
            [10, 12],
          ],
          rect(6.5, 12, 13.5, 14.4),
        ),
      ];
    case 'medal':
      return [
        ...s(
          LED.blue,
          [
            [6, 0],
            [9, 5.4],
          ],
          [
            [14, 0],
            [11, 5.4],
          ],
        ),
        ...s(LED.amber, circle(10, 9.6, 4.4)),
        ...s(LED.orange, circle(10, 9.6, 1.8)),
      ];
    case 'cap':
      return [
        ...s(LED.cyan, [
          [10, 1],
          [20, 5],
          [10, 9],
          [0, 5],
          [10, 1],
        ]),
        ...s(LED.cyan, [
          [4, 6.6],
          [4, 11],
          [6, 12.6],
          [14, 12.6],
          [16, 11],
          [16, 6.6],
        ]),
        ...s(
          LED.amber,
          [
            [10, 5],
            [17.4, 7.6],
            [17.4, 12],
          ],
          [[17.4, 13.6]],
        ),
      ];
    case 'paper':
      return [
        ...s(
          LED.ice,
          [
            [4, 0],
            [12, 0],
            [16, 4],
            [16, 16],
            [4, 16],
            [4, 0],
          ],
          [
            [12, 0],
            [12, 4],
            [16, 4],
          ],
        ),
        ...s(
          LED.cyan,
          [
            [6.6, 7],
            [13.4, 7],
          ],
          [
            [6.6, 10],
            [13.4, 10],
          ],
          [
            [6.6, 13],
            [11, 13],
          ],
        ),
      ];
    case 'claim':
      return [
        ...s(
          LED.ice,
          [
            [3, 0],
            [11, 0],
            [15, 4],
            [15, 16],
            [3, 16],
            [3, 0],
          ],
          [
            [11, 0],
            [11, 4],
            [15, 4],
          ],
        ),
        ...s(LED.green, [
          [5.6, 9.4],
          [8.4, 12.4],
          [13, 6.4],
        ]),
      ];
    case 'building': {
      // An isometric block with floors, the way a BIM viewer draws it.
      const H = 11;
      return [
        ...s(LED.cyan, [
          [10, 15 - H],
          [17, 11.5 - H],
          [10, 8 - H],
          [3, 11.5 - H],
          [10, 15 - H],
        ]),
        ...s(
          LED.cyan,
          [
            [3, 11.5 - H],
            [3, 11.5],
            [10, 15],
            [17, 11.5],
            [17, 11.5 - H],
          ],
          [
            [10, 15 - H],
            [10, 15],
          ],
        ),
        ...s(
          LED.green,
          [
            [3, 7.8],
            [10, 11.3],
            [17, 7.8],
          ],
          [
            [3, 4.1],
            [10, 7.6],
            [17, 4.1],
          ],
        ),
      ];
    }
    case 'reader':
      return [
        ...s(LED.cyan, rect(1, 1, 10, 15), rect(3, 3, 8, 7)),
        ...s(LED.green, [[5.5, 11.6]]),
        ...s(
          LED.amber,
          arc(10, 8, 3.4, -40, 40, 4),
          arc(10, 8, 6, -40, 40, 6),
          arc(10, 8, 8.6, -40, 40, 8),
        ),
      ];
    case 'beacon':
      return [
        ...s(LED.green, circle(10, 8, 2.8)),
        ...s(
          LED.cyan,
          arc(10, 8, 5.6, -42, 42, 5),
          arc(10, 8, 8.6, -42, 42, 7),
          arc(10, 8, 5.6, 138, 222, 5),
          arc(10, 8, 8.6, 138, 222, 7),
        ),
      ];
    case 'mast':
      return [
        ...s(
          LED.ice,
          [
            [10, 3],
            [10, 16],
          ],
          [
            [10, 12.4],
            [6.6, 16],
          ],
          [
            [10, 12.4],
            [13.4, 16],
          ],
          [
            [5, 3],
            [15, 3],
          ],
        ),
        ...s(
          LED.cyan,
          [
            [5.6, 3],
            [5.6, 0.6],
          ],
          [
            [3.6, 0.6],
            [7.6, 0.6],
          ],
        ),
        ...s(
          LED.amber,
          [
            [14.4, 3],
            [14.4, 0.8],
          ],
          [
            [12.6, 0.8],
            [17, 0.8],
          ],
        ),
        ...s(LED.green, rect(10.6, 6.6, 14.4, 10)),
      ];
    case 'screen':
      return [
        ...s(
          LED.cyan,
          rect(1, 1, 19, 12),
          [
            [10, 12],
            [10, 14.6],
          ],
          [
            [6, 14.6],
            [14, 14.6],
          ],
        ),
        ...s(
          LED.amber,
          [
            [5, 9.6],
            [5, 6.6],
          ],
          [
            [8.4, 9.6],
            [8.4, 4.4],
          ],
          [
            [11.8, 9.6],
            [11.8, 7.4],
          ],
          [
            [15.2, 9.6],
            [15.2, 3.6],
          ],
        ),
      ];
    case 'gauge': {
      const ticks = Array.from({ length: 7 }, (_, i) => {
        const a = ((150 + i * 40) * Math.PI) / 180;
        return [
          [10 + 5.2 * Math.cos(a), 9 + 5.2 * Math.sin(a)],
          [10 + 6.6 * Math.cos(a), 9 + 6.6 * Math.sin(a)],
        ] as Pt[];
      });
      return [
        ...s(LED.cyan, arc(10, 9, 8, 150, 390, 16)),
        ...s(LED.ice, ...ticks),
        ...s(LED.orange, [
          [10, 9],
          [14.6, 4.2],
        ]),
        ...s(LED.amber, circle(10, 9, 1.2)),
      ];
    }
    case 'plc':
      return [
        ...s(
          LED.ice,
          rect(4, 1, 16, 15),
          [
            [0.5, 8],
            [4, 8],
          ],
          [
            [16, 8],
            [19.5, 8],
          ],
        ),
        ...s(
          LED.amber,
          ...[6, 8, 10, 12, 14].map((x) => [[x, 2.8]] as Pt[]),
          ...[6, 8, 10, 12, 14].map((x) => [[x, 13.2]] as Pt[]),
        ),
        ...s(LED.green, [[6.6, 6.4]], [[6.6, 9.6]]),
        ...s(LED.cyan, rect(9.4, 5.6, 14.2, 10.4)),
      ];
    case 'envelope':
      return [
        ...s(LED.cyan, rect(1, 2, 19, 15)),
        ...s(LED.amber, [
          [1, 2],
          [10, 9.6],
          [19, 2],
        ]),
      ];
  }
}

/** The bounds of a set of strokes. */
export function bounds(strokes: Stroke[]) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const st of strokes)
    for (const [x, y] of st.pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Scales and moves strokes so their box is `h` tall (or `w` wide, whichever is smaller) with its top-left at (x, y). */
export function place(
  strokes: Stroke[],
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): { strokes: Stroke[]; w: number; h: number } {
  const b = bounds(strokes);
  const k = Math.min(maxW / (b.w || 1), maxH / (b.h || 1));
  return {
    strokes: strokes.map((st) => ({
      c: st.c,
      pts: st.pts.map(([px, py]) => [x + (px - b.x0) * k, y + (py - b.y0) * k] as Pt),
    })),
    w: b.w * k,
    h: b.h * k,
  };
}
