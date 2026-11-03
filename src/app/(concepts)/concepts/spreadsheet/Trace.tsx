'use client';

import { highlight, traceEdges, type TraceEdge } from './analysis';
import { a1 } from './engine/address';
import { boxOf, type Geometry } from './model';
import { shown, useStore, type Store } from './store';
import { cx, Icon } from './ui';
import s from './sheet.module.scss';

// Trace precedents: arrows from every cell a figure reads to the figure, the way a desktop
// spreadsheet's auditing arrows work. Same-sheet precedents get a box and a solid arrow; a
// precedent on another sheet gets a dashed arrow from a sheet tag that jumps there, and on
// that sheet the range points back to where it's used.

const center = (b: { left: number; top: number; width: number; height: number }) => ({
  x: b.left + b.width / 2,
  y: b.top + b.height / 2,
});

function shorten(x1: number, y1: number, x2: number, y2: number, by: number) {
  const d = Math.hypot(x2 - x1, y2 - y1) || 1;
  return { x: x2 - ((x2 - x1) / d) * by, y: y2 - ((y2 - y1) / d) * by };
}

export function TraceLayer({ g }: { g: Geometry }) {
  const st = useStore();
  const t = st.ui.trace;
  if (!t) return null;
  const view = st.ui.view;
  const edges = traceEdges(st.book, t);
  const seen = new Set<string>();
  const local: TraceEdge[] = [];
  const incoming: TraceEdge[] = [];
  const outgoing: TraceEdge[] = [];
  for (const e of edges) {
    const key = `${e.from.sheet}:${e.from.r0}:${e.from.c0}:${e.from.r1}:${e.from.c1}>${e.to.sheet}:${e.to.r}:${e.to.c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const toHere = e.to.sheet === view;
    const fromHere = e.from.sheet === view;
    if (toHere && fromHere) local.push(e);
    else if (toHere) incoming.push(e);
    else if (fromHere) outgoing.push(e);
  }
  if (!local.length && !incoming.length && !outgoing.length) return null;

  // Sheet tags for incoming precedents sit beside their cell, stacked.
  const tagsByCell = new Map<string, TraceEdge[]>();
  incoming.forEach((e) => {
    const k = `${e.to.r}:${e.to.c}`;
    tagsByCell.set(k, [...(tagsByCell.get(k) ?? []), e]);
  });
  const W = g.colX[g.colX.length - 1];
  const H = g.rowY[g.rowY.length - 1];

  const tags: {
    e: TraceEdge;
    x: number;
    y: number;
    ax: number;
    ay: number;
    text: string;
    dir: 'in' | 'out';
  }[] = [];
  for (const list of tagsByCell.values()) {
    list.forEach((e, i) => {
      const tb = boxOf(g, { r0: e.to.r, c0: e.to.c, r1: e.to.r, c1: e.to.c });
      const x = Math.min(W - 200, tb.left + tb.width + 34);
      const y = tb.top + tb.height / 2 + (i - (list.length - 1) / 2) * 30;
      tags.push({
        e,
        x,
        y,
        ax: tb.left + tb.width - 3,
        ay: tb.top + tb.height / 2,
        text: e.name ? `${e.name} · ${st.book.areaLabel(e.from)}` : st.book.areaLabel(e.from),
        dir: 'in',
      });
    });
  }
  // Where a range here is used on another sheet, a tag below its corner points the way back.
  outgoing.forEach((e, i) => {
    const sb = boxOf(g, e.from);
    tags.push({
      e,
      x: Math.min(W - 200, sb.left + sb.width + 18),
      y: sb.top + sb.height + 18 + i * 30,
      ax: sb.left + sb.width,
      ay: sb.top + sb.height,
      text: `${st.book.sheetName(e.to.sheet)}!${a1(e.to.r, e.to.c)}`,
      dir: 'out',
    });
  });

  return (
    <>
      <svg className={s.traceSvg} width={W} height={H} aria-hidden="true">
        <defs>
          <marker
            id="sheet-arrow"
            viewBox="0 0 10 10"
            refX={8}
            refY={5}
            markerWidth={7}
            markerHeight={7}
            orient="auto-start-reverse"
          >
            <path d="M0 0 10 5 0 10z" className={s.arrowHead} />
          </marker>
        </defs>
        {local.map((e, i) => {
          const sb = boxOf(g, e.from);
          const tb = boxOf(g, { r0: e.to.r, c0: e.to.c, r1: e.to.r, c1: e.to.c });
          const multi = e.from.r0 !== e.from.r1 || e.from.c0 !== e.from.c1;
          const a = center(multi ? { ...sb, height: Math.min(sb.height, 24), top: sb.top } : sb);
          const b = center(tb);
          const end = shorten(a.x, a.y, b.x, b.y, 6);
          // Bow the line a little, to its left, so it doesn't run straight over the cells between.
          const len = Math.hypot(end.x - a.x, end.y - a.y) || 1;
          const bow = Math.min(36, 10 + len * 0.12);
          const mx = (a.x + end.x) / 2 + ((end.y - a.y) / len) * -bow;
          const my = (a.y + end.y) / 2 + ((end.x - a.x) / len) * bow * (end.y === a.y ? -1 : 1);
          return (
            <g key={i} className={cx(s.arrow, e.level > 1 && s.arrowDeep)}>
              {multi && (
                <rect
                  x={sb.left + 1}
                  y={sb.top + 1}
                  width={sb.width - 2}
                  height={sb.height - 2}
                  className={s.precBox}
                />
              )}
              <path
                d={`M${a.x} ${a.y} Q${mx} ${my} ${end.x} ${end.y}`}
                markerEnd="url(#sheet-arrow)"
              />
              <circle cx={a.x} cy={a.y} r={3.2} className={s.arrowDot} />
            </g>
          );
        })}
        {outgoing.map((e, i) => {
          const sb = boxOf(g, e.from);
          return (
            <rect
              key={`o${i}`}
              x={sb.left + 1}
              y={sb.top + 1}
              width={sb.width - 2}
              height={sb.height - 2}
              className={s.precBox}
            />
          );
        })}
        {tags.map((tg, i) => (
          <path
            key={`t${i}`}
            className={cx(s.arrow, s.arrowSheet)}
            d={
              tg.dir === 'in'
                ? `M${tg.x} ${tg.y} L${tg.ax + 6} ${tg.ay}`
                : `M${tg.ax} ${tg.ay} L${tg.x - 2} ${tg.y}`
            }
            markerEnd="url(#sheet-arrow)"
          />
        ))}
      </svg>
      {tags.map((tg, i) => (
        <button
          key={i}
          type="button"
          className={cx(s.sheetTag, s.overlayUi, tg.dir === 'out' && s.sheetTagOut)}
          style={{ left: tg.x, top: tg.y - 12 }}
          onClick={() =>
            tg.dir === 'in'
              ? st.goTo(tg.e.from)
              : st.goTo({
                  sheet: tg.e.to.sheet,
                  r0: tg.e.to.r,
                  c0: tg.e.to.c,
                  r1: tg.e.to.r,
                  c1: tg.e.to.c,
                })
          }
          title={tg.dir === 'in' ? `Go to ${tg.text}` : `Used by ${tg.text}`}
        >
          <Icon.sheet />
          {tg.dir === 'out' && <span aria-hidden="true">→</span>}
          {tg.text}
        </button>
      ))}
    </>
  );
}

/** A few of an area's values, formatted. */
function preview(st: Store, e: TraceEdge) {
  const a = e.from;
  const out: string[] = [];
  let n = 0;
  for (let r = a.r0; r <= Math.min(a.r1, st.book.usedRows(a.sheet) - 1); r++) {
    for (let c = a.c0; c <= a.c1; c++) {
      n++;
      if (out.length < 4) out.push(shown(st.book.cell(a.sheet, r, c)).text || '·');
    }
  }
  return n > 4 ? `${out.join(' · ')} · +${n - 4}` : out.join(' · ');
}

/** The written-out trace: the figure, its formula, and each thing it reads with its values. */
export function TraceCard() {
  const st = useStore();
  const t = st.ui.trace;
  if (!t || st.ui.edit) return null;
  const cell = st.book.cell(t.sheet, t.r, t.c);
  if (!cell?.input.startsWith('=')) return null;
  const edges = traceEdges(st.book, t);
  // Only on a sheet the trace touches; elsewhere its arrows aren't drawn either.
  if (st.ui.view !== t.sheet && !edges.some((e) => e.from.sheet === st.ui.view)) return null;
  const rowLabel = st.book.cell(t.sheet, t.r, 0);
  const title = t.c > 0 && typeof rowLabel?.value === 'string' ? rowLabel.value : null;
  const { spans } = highlight(cell.input, st.book, t.sheet);
  const byTarget = new Map<string, TraceEdge[]>();
  for (const e of edges) {
    const k = `${e.level}|${e.to.sheet}|${e.to.r}|${e.to.c}`;
    byTarget.set(k, [...(byTarget.get(k) ?? []), e]);
  }
  return (
    <aside className={s.traceBar} aria-label="Trace precedents">
      <div className={s.traceHead}>
        <span className={s.traceTitle}>
          <Icon.trace />
          <b>
            {st.book.sheetName(t.sheet)}!{a1(t.r, t.c)}
          </b>
          {title && <span className={s.traceLabel}>{title}</span>}
        </span>
        <code className={s.traceFormula}>
          {spans.map((sp, i) => (
            <span key={i} className={sp.kind === 'ref' ? s[`ref${sp.color}`] : s[`tok_${sp.kind}`]}>
              {sp.text}
            </span>
          ))}
          <span className={s.traceValue}> → {shown(cell).text}</span>
        </code>
        <span className={s.traceActions}>
          <button
            type="button"
            onClick={() => st.traceFurther()}
            disabled={t.levels >= 4}
            title="Trace one level further"
          >
            <Icon.further />
            <span>Level {t.levels}</span>
          </button>
          <button
            type="button"
            onClick={() => st.set({ trace: null })}
            aria-label="Remove arrows"
            title="Remove arrows"
          >
            <Icon.close />
          </button>
        </span>
      </div>
      <ol className={s.traceList}>
        {[...byTarget.entries()].map(([k, list]) => {
          const to = list[0].to;
          const level = list[0].level;
          const f = st.book.cell(to.sheet, to.r, to.c);
          return (
            <li key={k} className={level > 1 ? s.traceDeep : undefined}>
              {level > 1 && (
                <button
                  type="button"
                  className={s.traceVia}
                  onClick={() =>
                    st.goTo({ sheet: to.sheet, r0: to.r, c0: to.c, r1: to.r, c1: to.c })
                  }
                  title={f?.input}
                >
                  {st.book.areaLabel(
                    { sheet: to.sheet, r0: to.r, c0: to.c, r1: to.r, c1: to.c },
                    t.sheet,
                  )}
                </button>
              )}
              {list.map((e, i) => (
                <button
                  key={i}
                  type="button"
                  className={s.traceRow}
                  onClick={() => st.goTo(e.from)}
                  title={`Select ${st.book.areaLabel(e.from)}`}
                >
                  <span className={s.traceRef}>
                    <span aria-hidden="true">←</span> {e.name ? <b>{e.name}</b> : null}{' '}
                    {st.book.areaLabel(e.from, t.sheet)}
                  </span>
                  <span className={s.traceVals}>{preview(st, e)}</span>
                </button>
              ))}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
