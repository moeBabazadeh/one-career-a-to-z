'use client';

import { useState } from 'react';
import { fmt } from '../_shared/data';
import { format } from './engine/numfmt';
import { lex } from './engine/lexer';
import { MAX_R, type Area, type Value } from './engine/types';
import type { Workbook } from './engine/workbook';
import { boxOf, type ChartDef, type Geometry } from './model';
import { useStore } from './store';
import { cx, usePhone } from './ui';
import s from './sheet.module.scss';

// Charts float over the grid, anchored to a cell, and read their data from ranges the way a
// desktop spreadsheet's charts do: change a cell in the range and the chart redraws.

/** A range written as in a formula ("Roles!C2:C7") as an area. */
export function areaFrom(book: Workbook, text: string, sheet: number): Area | null {
  const t = lex(text).find((x) => x.type === 'ref' || x.type === 'range');
  if (!t?.a) return null;
  const si = t.sheet === undefined ? sheet : book.sheetIndex(t.sheet);
  if (si < 0) return null;
  const b = t.b ?? t.a;
  return {
    sheet: si,
    r0: Math.min(t.a.r, b.r),
    r1: t.cols ? MAX_R - 1 : Math.max(t.a.r, b.r),
    c0: Math.min(t.a.c, b.c),
    c1: Math.max(t.a.c, b.c),
  };
}

function column(book: Workbook, a: Area | null): Value[] {
  if (!a) return [];
  const out: Value[] = [];
  for (let r = a.r0; r <= Math.min(a.r1, a.r0 + 200); r++) out.push(book.value(a.sheet, r, a.c0));
  return out;
}

const label = (v: Value) => (v === null ? '' : typeof v === 'object' ? v.code : String(v));
const mon = (n: number) => format(n, 'mmm yyyy').text;

export function ChartView({ def, g }: { def: ChartDef; g: Geometry }) {
  const st = useStore();
  const phone = usePhone();
  const [hover, setHover] = useState<number | null>(null);
  const at = phone ? def.phoneAt : def.at;
  const w = phone ? def.phoneW : def.w;
  const box = boxOf(g, { r0: at.r, c0: at.c, r1: at.r, c1: at.c });
  const sheet = st.ui.view;
  const areas = [def.labels, def.values, def.ends]
    .filter((x): x is string => !!x)
    .map((t) => ({ text: t, area: areaFrom(st.book, t, sheet) }));
  const labels = column(st.book, areas[0].area);
  const values = column(st.book, areas[1].area);
  const ends = def.ends ? column(st.book, areas[2].area) : [];
  const selected = st.ui.chart === def.id;
  const plotH = def.h - 44;
  const asOfArea = st.book.nameArea('AsOf');
  const asOf = asOfArea ? st.book.value(asOfArea.sheet, asOfArea.r0, asOfArea.c0) : null;

  return (
    <figure
      className={cx(s.chart, s.overlayUi, selected && s.chartOn)}
      style={{ left: box.left + 8, top: box.top + 6, width: w, height: def.h }}
      onPointerDown={() => st.set({ chart: def.id })}
      aria-label={`${def.title}, chart`}
    >
      <figcaption className={s.chartHead}>
        <b>{def.title}</b>
        <span className={s.chartRanges}>
          {areas.map(({ text, area }, i) => (
            <button
              key={text}
              type="button"
              className={s.rangeChip}
              title={`Select ${text}`}
              onClick={(e) => {
                e.stopPropagation();
                if (area) st.goTo(area);
              }}
            >
              {i > 0 && text.split('!')[0] === areas[0].text.split('!')[0]
                ? text.split('!')[1]
                : text}
            </button>
          ))}
        </span>
      </figcaption>
      {def.kind === 'gantt' ? (
        <Gantt
          labels={labels}
          starts={values}
          ends={ends}
          w={w}
          h={plotH}
          asOf={asOf}
          hover={hover}
          setHover={setHover}
          compact={phone}
        />
      ) : (
        <Bars
          labels={labels}
          values={values}
          w={w}
          h={plotH}
          hover={hover}
          setHover={setHover}
          compact={phone}
        />
      )}
    </figure>
  );
}

interface PlotProps {
  w: number;
  h: number;
  hover: number | null;
  setHover: (i: number | null) => void;
  compact: boolean;
}

function Gantt({
  labels,
  starts,
  ends,
  asOf,
  w,
  h,
  hover,
  setHover,
  compact,
}: PlotProps & { labels: Value[]; starts: Value[]; ends: Value[]; asOf: Value }) {
  const rows = labels
    .map((l, i) => ({ label: label(l), a: starts[i], b: ends[i] }))
    .filter(
      (x): x is { label: string; a: number; b: number } =>
        typeof x.a === 'number' && typeof x.b === 'number' && x.label !== '',
    );
  if (!rows.length) return <p className={s.chartEmpty}>No dates in the range</p>;
  const left = compact ? 92 : 168;
  const right = 18;
  const top = 6;
  const bottom = 22;
  const y0 = Math.min(...rows.map((r) => Math.min(r.a, r.b)));
  const y1 = Math.max(...rows.map((r) => Math.max(r.a, r.b)));
  const yearOf = (n: number) => Number(format(n, 'yyyy').text);
  const firstYear = yearOf(y0);
  const lastYear = yearOf(y1) + 1;
  const jan = (y: number) => Math.round((Date.UTC(y, 0, 1) - Date.UTC(1899, 11, 30)) / 864e5);
  const t0 = jan(firstYear);
  const t1 = jan(lastYear);
  const X = (n: number) => left + ((n - t0) / (t1 - t0)) * (w - left - right);
  const band = (h - top - bottom) / rows.length;
  const barH = Math.max(6, Math.min(16, band * 0.56));
  const span = lastYear - firstYear;
  const every = span > 14 ? (compact ? 6 : 3) : span > 7 ? 2 : 1;
  const years = Array.from({ length: span + 1 }, (_, i) => firstYear + i).filter(
    (y) => (y - firstYear) % every === 0,
  );
  const now = typeof asOf === 'number' ? asOf : null;

  return (
    <div className={s.plot}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={rows
          .map((r) => `${r.label}: ${mon(r.a)} to ${now !== null && r.b >= now ? 'now' : mon(r.b)}`)
          .join('; ')}
      >
        {years.map((y) => (
          <g key={y} className={s.axis}>
            <line x1={X(jan(y))} x2={X(jan(y))} y1={top} y2={h - bottom + 3} />
            <text x={X(jan(y))} y={h - 6} textAnchor="middle">
              {y}
            </text>
          </g>
        ))}
        {now !== null && (
          <g className={s.nowLine}>
            <line x1={X(now)} x2={X(now)} y1={top - 2} y2={h - bottom + 3} />
          </g>
        )}
        {rows.map((r, i) => {
          const yc = top + band * i + band / 2;
          const xa = X(Math.min(r.a, r.b));
          const xb = Math.max(xa + 3, X(Math.max(r.a, r.b)));
          const current = now !== null && r.b >= now;
          return (
            <g
              key={i}
              className={cx(s.ganttRow, hover === i && s.rowOn)}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <rect className={s.hit} x={0} y={yc - band / 2} width={w} height={band} />
              <text className={s.rowLabel} x={left - 8} y={yc + 4} textAnchor="end">
                {r.label.length > (compact ? 12 : 24)
                  ? `${r.label.slice(0, compact ? 11 : 23)}…`
                  : r.label}
              </text>
              <rect
                className={cx(s.bar, current && s.barNow)}
                x={xa}
                y={yc - barH / 2}
                width={xb - xa}
                height={barH}
                rx={Math.min(4, barH / 2)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && rows[hover] && (
        <div
          className={s.tip}
          style={{ left: Math.min(w - 170, X(rows[hover].b) + 6), top: top + band * hover }}
        >
          <b>{rows[hover].label}</b>
          <span>
            {mon(rows[hover].a)} –{' '}
            {now !== null && rows[hover].b >= now ? 'now' : mon(rows[hover].b)}
          </span>
          <span>{Math.round(((rows[hover].b - rows[hover].a) / 365.25) * 10) / 10} years</span>
        </div>
      )}
    </div>
  );
}

function Bars({
  labels,
  values,
  w,
  h,
  hover,
  setHover,
  compact,
}: PlotProps & { labels: Value[]; values: Value[] }) {
  const rows = labels
    .map((l, i) => ({ label: label(l), v: values[i] }))
    .filter((x): x is { label: string; v: number } => typeof x.v === 'number' && x.label !== '');
  if (!rows.length) return <p className={s.chartEmpty}>No numbers in the range</p>;
  const left = compact ? 110 : 208;
  const right = 52;
  const top = 4;
  const bottom = 20;
  const max = Math.max(...rows.map((r) => r.v), 0);
  const nice = (() => {
    if (max <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(max));
    const m = max / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  })();
  const X = (v: number) => left + (Math.max(0, v) / nice) * (w - left - right);
  const band = (h - top - bottom) / rows.length;
  const barH = Math.max(6, Math.min(18, band * 0.6));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * nice);
  return (
    <div className={s.plot}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={rows.map((r) => `${r.label}: ${fmt.grouped(r.v)}`).join('; ')}
      >
        {ticks.map((t) => (
          <g key={t} className={s.axis}>
            <line x1={X(t)} x2={X(t)} y1={top} y2={h - bottom + 3} />
            <text x={X(t)} y={h - 5} textAnchor="middle">
              {fmt.compact(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const yc = top + band * i + band / 2;
          return (
            <g
              key={i}
              className={cx(s.ganttRow, hover === i && s.rowOn)}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <rect className={s.hit} x={0} y={yc - band / 2} width={w} height={band} />
              <text className={s.rowLabel} x={left - 8} y={yc + 4} textAnchor="end">
                {r.label.length > (compact ? 14 : 28)
                  ? `${r.label.slice(0, compact ? 13 : 27)}…`
                  : r.label}
              </text>
              <rect
                className={s.bar}
                x={left}
                y={yc - barH / 2}
                width={Math.max(2, X(r.v) - left)}
                height={barH}
                rx={Math.min(4, barH / 2)}
              />
              <text className={s.valLabel} x={X(r.v) + 6} y={yc + 4}>
                {fmt.compact(r.v)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && rows[hover] && (
        <div
          className={s.tip}
          style={{ left: Math.min(w - 170, X(rows[hover].v) + 40), top: top + band * hover }}
        >
          <b>{rows[hover].label}</b>
          <span>{fmt.grouped(rows[hover].v)} a week</span>
        </div>
      )}
    </div>
  );
}
