// Layer 6: an index lookup in a B+tree, scrubbed by scroll. The query walks root → inner page
// → leaf, reads three tuple IDs, and follows each to its heap page. The keys and rows are the
// real archive: the years of his work, and what he shipped in the year looked up.

import { archive, fmt } from '../../_shared/data';
import {
  C,
  arrowHead,
  clamp,
  easeOut,
  fg,
  focusBox,
  mono,
  rgba,
  roundRect,
  stepAt,
  type Box,
} from '../kit';

/** The year looked up. */
const KEY = '2024';
const ROWS = archive.filter((a) => a.year === KEY).map((a) => a.title);
/** How many rows the lookup returns. */
export const DB_ROWS = ROWS.length;
const TIDS = ['(0,4)', '(2,1)', '(3,6)'];

// The keys are the archive's years, oldest first, in nine leaves under three inner pages. Every
// separator is the first key of the page to its right.
const YEARS = [...new Set(archive.map((a) => a.year))].filter((y) => /^\d+$/.test(y)).sort();
/** Where each leaf starts in YEARS: the second packs two keys, the ninth takes the rest. */
const STARTS = [1, 2, 1, 1, 1, 1, 1, 1].reduce((out, n) => [...out, out[out.length - 1] + n], [0]);
const LEAVES = STARTS.map((at, i) => YEARS.slice(at, STARTS[i + 1]));
const INNER = [0, 1, 2].map((i) => [LEAVES[i * 3 + 1][0], LEAVES[i * 3 + 2][0]]);
const ROOT = [LEAVES[3][0], LEAVES[6][0]];
const leafOf = LEAVES.findIndex((keys) => keys.includes(KEY));
const PATH = { inner: Math.floor(leafOf / 3), leaf: leafOf };
/** The keys the search compares against: at the root, then at the inner page. */
const HIT = { root: ROOT[1], inner: INNER[PATH.inner][0] };

export const DB_CAPTIONS = [
  `SELECT title FROM archive WHERE year = ${KEY}. The planner picks the index on year.`,
  `Read the root page: ${KEY} is not below ${HIT.root}, so take the right-most pointer.`,
  `One level down: ${KEY} is below ${HIT.inner}, so take the left pointer.`,
  `The leaf holds the key and ${fmt.spell(ROWS.length)} tuple IDs: (page, slot) addresses in the table.`,
  'Follow each TID to its heap page and read the row.',
  `${fmt.Spell(ROWS.length)} rows. With hundreds of keys per 8 kB page, four levels can index billions of rows.`,
];

function page(
  ctx: CanvasRenderingContext2D,
  b: Box,
  keys: string[],
  on: number,
  hit: string | null,
  narrow: boolean,
) {
  roundRect(ctx, b.x, b.y, b.w, b.h, 5);
  ctx.fillStyle = on > 0 ? rgba('lilac', 0.08 + 0.16 * on) : fg(0.04);
  ctx.fill();
  ctx.strokeStyle = on > 0 ? C.violet : fg(0.22);
  ctx.lineWidth = on > 0 ? 1.6 : 1;
  ctx.stroke();
  ctx.font = mono(narrow ? 8 : 10, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cw = b.w / keys.length;
  keys.forEach((k, i) => {
    if (i) {
      ctx.strokeStyle = fg(0.15);
      ctx.beginPath();
      ctx.moveTo(b.x + i * cw, b.y + 4);
      ctx.lineTo(b.x + i * cw, b.y + b.h - 4);
      ctx.stroke();
    }
    ctx.fillStyle = hit === k ? C.yellow : on > 0 ? C.fg : fg(0.6);
    ctx.fillText(k, b.x + cw * (i + 0.5), b.y + b.h / 2 + 0.5);
  });
}

export function drawBtree(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  p: number,
) {
  ctx.clearRect(0, 0, w, h);
  const B = focusBox(w, h);
  const narrow = B.w < 520;
  const { k, f } = stepAt(p, DB_CAPTIONS.length);
  const reached = (step: number) => (k > step ? 1 : k === step ? f : 0);

  // The query, typed out in step 0.
  const q = `SELECT title FROM archive WHERE year = ${KEY};`;
  const lh = narrow ? 13 : 16;
  const qb: Box = { x: B.x, y: B.y, w: B.w, h: 28 + lh * 5 };
  roundRect(ctx, qb.x, qb.y, qb.w, qb.h, 8);
  ctx.fillStyle = C.wellDb;
  ctx.fill();
  ctx.strokeStyle = rgba('lilac', 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
  const typed = k > 0 ? q.length : Math.floor(clamp(p * DB_CAPTIONS.length * 2.2) * q.length);
  ctx.font = mono(narrow ? 8.5 : 11, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.fg;
  const shown = `=# ${q.slice(0, typed)}`;
  const line = (i: number) => qb.y + 16 + i * lh;
  ctx.fillText(shown, qb.x + 12, line(0));
  if (typed < q.length && Math.floor(t * 2) % 2)
    ctx.fillRect(qb.x + 12 + ctx.measureText(shown).width + 2, line(0) - 7, 6, 14);
  ctx.font = mono(narrow ? 7.5 : 9.5);
  ctx.fillStyle = rgba('lilac', 0.85);
  if (typed >= q.length)
    ctx.fillText(
      narrow
        ? 'Index Scan using archive_year_idx'
        : `Index Scan using archive_year_idx on archive  (cost=0.14..8.21 rows=${ROWS.length})`,
      qb.x + 12,
      line(1),
    );
  // psql prints the rows once the heap has been read.
  if (k >= 5) {
    ctx.globalAlpha = f;
    ctx.font = mono(narrow ? 8.5 : 11, 600);
    ROWS.forEach((row, i) => {
      ctx.fillStyle = C.fg;
      ctx.fillText(` ${row}`, qb.x + 12, line(2 + i) + 2);
    });
    ctx.textAlign = 'right';
    ctx.fillStyle = C.yellow;
    ctx.font = mono(narrow ? 8 : 10, 600);
    ctx.fillText(`(${ROWS.length} rows)`, qb.x + qb.w - 12, line(4) + 2);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  } else if (typed >= q.length) {
    ctx.fillStyle = fg(0.35);
    ctx.fillText(Math.floor(t * 3) % 2 ? '…' : '', qb.x + 12, line(2) + 2);
  }

  // Geometry of the three levels and the heap.
  const top = qb.y + qb.h + (narrow ? 26 : 36);
  const levels = B.y + B.h - top;
  const ph = narrow ? 26 : 32;
  const rootB: Box = {
    x: B.x + B.w / 2 - (narrow ? 50 : 70),
    y: top,
    w: narrow ? 100 : 140,
    h: ph,
  };
  const innerW = Math.min(150, (B.w - 40) / 3);
  const innerB = INNER.map((_, i): Box => ({
    x: B.x + (B.w / 3) * (i + 0.5) - innerW / 2,
    y: top + levels * 0.2,
    w: innerW,
    h: ph,
  }));
  const lg = narrow ? 4 : 8;
  const leafW = (B.w - lg * 8) / 9;
  const leafB = LEAVES.map((_, i): Box => ({
    x: B.x + i * (leafW + lg),
    y: top + levels * 0.42,
    w: leafW,
    h: ph,
  }));
  const heapY = top + levels * 0.66,
    heapH = levels * 0.3;
  const heapW = (B.w - 3 * 12) / 4;
  const heapB = [0, 1, 2, 3].map((i): Box => ({
    x: B.x + i * (heapW + 12),
    y: heapY,
    w: heapW,
    h: heapH,
  }));

  // Pointers between levels, lit along the search path.
  const link = (from: Box, frac: number, to: Box, on: number) => {
    const x0 = from.x + from.w * frac,
      y0 = from.y + from.h,
      x1 = to.x + to.w / 2,
      y1 = to.y;
    ctx.strokeStyle = on > 0 ? C.yellow : fg(0.14);
    ctx.lineWidth = on > 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const yy = y0 + (y1 - y0) * (on > 0 ? on : 1);
    const xx = x0 + (x1 - x0) * (on > 0 ? on : 1);
    ctx.bezierCurveTo(x0, (y0 + y1) / 2, xx, (y0 + y1) / 2, xx, yy);
    ctx.stroke();
    if (on >= 1) {
      ctx.fillStyle = C.yellow;
      arrowHead(ctx, x1, y1, Math.PI / 2, 7);
    }
  };
  innerB.forEach((b, i) => link(rootB, (i + 0.5) / 3, b, i === PATH.inner ? reached(1) : 0));
  innerB.forEach((ib, i) =>
    [0, 1, 2].forEach((j) => {
      const leaf = i * 3 + j;
      link(ib, (j + 0.5) / 3, leafB[leaf], leaf === PATH.leaf ? reached(2) : 0);
    }),
  );

  // Pages.
  page(ctx, rootB, ROOT, reached(1), k >= 1 ? HIT.root : null, narrow);
  innerB.forEach((b, i) =>
    page(
      ctx,
      b,
      INNER[i],
      i === PATH.inner ? reached(2) : 0,
      i === PATH.inner && k >= 2 ? HIT.inner : null,
      narrow,
    ),
  );
  leafB.forEach((b, i) =>
    page(
      ctx,
      b,
      LEAVES[i],
      i === PATH.leaf ? reached(3) : 0,
      i === PATH.leaf && k >= 3 ? KEY : null,
      narrow,
    ),
  );

  // Leaf siblings: a B+tree's leaves form a linked list for range scans.
  ctx.strokeStyle = fg(0.22);
  ctx.fillStyle = fg(0.22);
  ctx.lineWidth = 1;
  for (let i = 0; i < leafB.length - 1; i++) {
    const a = leafB[i],
      b = leafB[i + 1];
    if (b.x - (a.x + a.w) < 6) continue;
    ctx.beginPath();
    ctx.moveTo(a.x + a.w + 1, a.y + a.h / 2);
    ctx.lineTo(b.x - 2, b.y + b.h / 2);
    ctx.stroke();
  }

  // Level labels.
  if (!narrow) {
    ctx.font = mono(9, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = fg(0.45);
    ctx.fillText('root', B.x, rootB.y + ph / 2);
    ctx.fillText('inner', B.x, innerB[0].y - 10);
    ctx.fillText('leaves', B.x, leafB[0].y - 10);
    ctx.fillText('heap: the table itself, 8 kB pages', B.x, heapY - 12);
  }

  // The leaf's TIDs, then the heap pages they point into.
  const leaf = leafB[PATH.leaf];
  const slots = 7;
  heapB.forEach((b, i) => {
    const target = TIDS.findIndex((tid) => tid.startsWith(`(${i},`));
    const on = target >= 0 ? reached(4) : 0;
    roundRect(ctx, b.x, b.y, b.w, b.h, 5);
    ctx.fillStyle = fg(0.035);
    ctx.fill();
    ctx.strokeStyle = on > 0 ? C.violet : fg(0.18);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = mono(narrow ? 7.5 : 9);
    ctx.fillStyle = fg(0.5);
    ctx.textAlign = 'left';
    ctx.fillText(`page ${i}`, b.x + 7, b.y + 11);
    for (let sl = 0; sl < slots; sl++) {
      const sy = b.y + 22 + sl * ((b.h - 28) / slots);
      const slot = target >= 0 ? Number(TIDS[target].slice(3, -1)) : -1;
      const hot = sl === slot && k >= 4;
      ctx.fillStyle = hot ? C.yellow : fg(0.1);
      ctx.fillRect(
        b.x + 7,
        sy,
        (b.w - 14) * (0.55 + (0.4 * ((sl * 37 + i * 11) % 10)) / 10),
        Math.max(3, (b.h - 28) / slots - 4),
      );
    }
  });
  if (k >= 3) {
    TIDS.forEach((tid, i) => {
      const pg = Number(tid[1]);
      const b = heapB[pg];
      const slot = Number(tid.slice(3, -1));
      const sy = b.y + 22 + slot * ((b.h - 28) / slots);
      const on = k > 3 ? 1 : 0;
      const x0 = leaf.x + leaf.w * (0.25 + i * 0.25),
        y0 = leaf.y + leaf.h + 18;
      ctx.globalAlpha = k === 3 ? f : 1;
      if (i === 0) {
        ctx.font = mono(narrow ? 7.5 : 9, 600);
        ctx.fillStyle = C.yellow;
        ctx.textAlign = 'center';
        ctx.fillText(TIDS.join(' '), leaf.x + leaf.w / 2, y0 - 8);
      }
      if (on) {
        const q = k === 4 ? easeOut(f) : 1;
        ctx.strokeStyle = rgba('yellow', 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        const x1 = b.x + 7,
          y1 = sy + 2;
        ctx.bezierCurveTo(x0, y0 + 40, x1 - 30, y1, x0 + (x1 - x0) * q, y0 + (y1 - y0) * q);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }

  // A read in progress pulses on the page being visited.
  const visiting = k === 1 ? rootB : k === 2 ? innerB[PATH.inner] : k === 3 ? leaf : null;
  if (visiting) {
    ctx.strokeStyle = C.yellow;
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 6);
    roundRect(ctx, visiting.x - 4, visiting.y - 4, visiting.w + 8, visiting.h + 8, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
