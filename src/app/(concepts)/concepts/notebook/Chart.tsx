'use client';

// The figures plot.bar, plot.line and plot.timeline return, drawn as SVG at the width of the
// output area (so text stays its real size on a phone). Colours are CSS tokens, so light and
// dark repaint without JS. Each chart has a hover readout and a "Data" view of its numbers.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { fmt } from '../_shared/data';
import type { BarSpec, FigSpec, LineSpec, TimelineSpec } from './lang/values';
import s from './notebook.module.scss';

const CHAR = 6.5; // average width of a 12px label character, for fitting text
const SERIES = 4;

const compact = (n: number) =>
  Math.abs(n) >= 1000 ? fmt.compact(n) : String(Math.round(n * 100) / 100);
const grouped = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 1000) / 1000);
const yearish = (xs: number[]) => xs.every((x) => Number.isInteger(x) && x > 1800 && x < 2200);

function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const err = raw / mag;
  return (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
}

/** Round ticks covering lo..hi, the last one at or above hi so no mark runs past the axis. */
function ticks(lo: number, hi: number, count: number) {
  const step = niceStep(hi - lo, count);
  const top = Math.ceil(hi / step - 1e-9) * step;
  const out: number[] = [];
  for (let t = Math.floor(lo / step + 1e-9) * step; t <= top + 1e-9; t += step)
    out.push(Math.round(t * 1e6) / 1e6);
  return { ticks: out, step };
}

const fit = (text: string, px: number) => {
  const max = Math.max(3, Math.floor(px / CHAR));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Fractional year to a short date, for readouts: 2024.46 → "2024.5". */
const yearsText = (n: number) =>
  `${Math.round(n * 10) / 10} year${Math.round(n * 10) === 10 ? '' : 's'}`;

function useWidth(fallback = 680) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(8, tip.x + 12), width - 220);
  return (
    <div className={s.tip} style={{ left, top: tip.y }} role="status">
      <b>{tip.title}</b>
      {tip.lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}

function Legend({ groups }: { groups: string[] }) {
  if (groups.length < 2) return null;
  return (
    <ul className={s.legend} aria-label="Legend">
      {groups.map((g, i) => (
        <li key={g}>
          <i style={{ background: `var(--s${i < SERIES ? i + 1 : 'x'})` }} aria-hidden="true" />
          {g}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ timeline */

function Timeline({
  spec,
  width,
  onTip,
}: {
  spec: TimelineSpec;
  width: number;
  onTip: (t: Tip | null) => void;
}) {
  const padL = 10;
  const padR = 18;
  const top = 22;
  const rowH = 44;
  const axisH = 26;
  const starts = spec.items.map((it) => it.start);
  const ends = spec.items.map((it) => it.end ?? spec.now);
  const open = spec.items.some((it) => it.end === null);
  const x0 = Math.floor(Math.min(...starts));
  const x1 = Math.ceil(Math.max(...ends, open ? spec.now : -Infinity) + 0.15);
  const plotW = width - padL - padR;
  const x = (t: number) => padL + ((t - x0) / (x1 - x0 || 1)) * plotW;
  const H = top + spec.items.length * rowH + axisH;
  const yearsPerLabel = [1, 2, 5, 10, 20].find((st) => (plotW / (x1 - x0)) * st >= 44) ?? 50;
  const tickYears: number[] = [];
  for (let y = Math.ceil(x0 / yearsPerLabel) * yearsPerLabel; y <= x1; y += yearsPerLabel)
    tickYears.push(y);
  const color = (g: string) => {
    const i = spec.groups.indexOf(g);
    return `var(--s${i < SERIES ? i + 1 : 'x'})`;
  };

  return (
    <svg
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      role="img"
      aria-label={`Timeline${spec.title ? `: ${spec.title}` : ''}. ${spec.items.map((it) => `${it.label}, ${it.span}`).join('; ')}.`}
    >
      {tickYears.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top - 6} y2={H - axisH} className={s.grid} />
          <text x={x(t)} y={H - 8} textAnchor="middle" className={s.tick}>
            {t}
          </text>
        </g>
      ))}
      <line x1={padL} x2={width - padR} y1={H - axisH} y2={H - axisH} className={s.axis} />
      {open && (
        <g>
          <line x1={x(spec.now)} x2={x(spec.now)} y1={top - 8} y2={H - axisH} className={s.now} />
          <text x={x(spec.now)} y={top - 12} textAnchor="end" className={s.tick}>
            now
          </text>
        </g>
      )}
      {spec.items.map((it, i) => {
        const y = top + i * rowH;
        const a = x(it.start);
        const b = x(it.end ?? spec.now);
        const point = it.end !== null && it.end - it.start < 0.05;
        const room = width - padR - a;
        const full = it.note ? `${it.label} · ${it.note}` : it.label;
        const anchorEnd = room < Math.min(full.length, 24) * CHAR && b - padL > room;
        const avail = anchorEnd ? Math.max(b, a + 10) - padL : room;
        const fitsFull = full.length * CHAR <= avail;
        const label = fit(it.label, avail);
        const note = it.note && fitsFull ? it.note : '';
        const show = () =>
          onTip({
            x: Math.min(b, width - 40),
            y: y + 30,
            title: it.label,
            lines: [
              it.note,
              it.span,
              it.end === null
                ? `${yearsText(spec.now - it.start)}, still running`
                : point
                  ? ''
                  : yearsText(it.end - it.start),
            ].filter(Boolean),
          });
        return (
          <g key={i} className={s.row} onPointerEnter={show} onPointerLeave={() => onTip(null)}>
            <rect x={0} y={y} width={width} height={rowH} className={s.hit} />
            <text
              x={anchorEnd ? Math.max(b, a + 10) : a}
              y={y + 15}
              textAnchor={anchorEnd ? 'end' : 'start'}
              className={s.label}
            >
              {label}
              {note && <tspan className={s.note}>{` · ${note}`}</tspan>}
            </text>
            {point ? (
              <path
                d={`M${a} ${y + 21} l6 6 l-6 6 l-6 -6 z`}
                style={{ fill: color(it.group) }}
                className={s.mark}
              />
            ) : (
              <rect
                x={a}
                y={y + 22}
                width={Math.max(4, b - a)}
                height={10}
                rx={5}
                style={{ fill: color(it.group) }}
                className={s.mark}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ bars */

function Bars({
  spec,
  width,
  onTip,
}: {
  spec: BarSpec;
  width: number;
  onTip: (t: Tip | null) => void;
}) {
  const { labels, values, log } = spec;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const lo = log ? 10 ** Math.floor(Math.log10(min)) : 0;
  const t = log ? null : ticks(0, max, Math.max(2, Math.floor(width / 110)));
  const hi = log ? 10 ** Math.ceil(Math.log10(max)) : (t!.ticks[t!.ticks.length - 1] ?? max);
  const tickVals = log
    ? Array.from({ length: Math.round(Math.log10(hi / lo)) + 1 }, (_, i) => lo * 10 ** i)
    : t!.ticks;
  const scale = (v: number) =>
    log ? (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo) || 1) : v / (hi || 1);

  if (spec.horizontal) {
    const padL = 10;
    const padR = 44;
    const rowH = 44;
    const top = 6;
    const axisH = 26;
    const plotW = width - padL - padR;
    const H = top + labels.length * rowH + axisH;
    const x = (v: number) => padL + scale(v) * plotW;
    return (
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={`Bar chart${spec.title ? `: ${spec.title}` : ''}. ${labels.map((l, i) => `${l}: ${grouped(values[i])}`).join('; ')}.`}
      >
        {tickVals.map((tv) => (
          <g key={tv}>
            <line x1={x(tv)} x2={x(tv)} y1={top} y2={H - axisH} className={s.grid} />
            <text x={x(tv)} y={H - 8} textAnchor="middle" className={s.tick}>
              {compact(tv)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          const y = top + i * rowH;
          const w = Math.max(2, x(values[i]) - padL);
          return (
            <g
              key={i}
              className={s.row}
              onPointerEnter={() =>
                onTip({
                  x: Math.min(padL + w, width - 60),
                  y: y + 34,
                  title: l,
                  lines: [grouped(values[i])],
                })
              }
              onPointerLeave={() => onTip(null)}
            >
              <rect x={0} y={y} width={width} height={rowH} className={s.hit} />
              <text x={padL} y={y + 15} className={s.label}>
                {fit(l, plotW + padR)}
              </text>
              <path
                d={`M${padL} ${y + 21}h${w - 4}a4 4 0 0 1 4 4v6a4 4 0 0 1 -4 4h${-(w - 4)}z`}
                style={{ fill: 'var(--s1)' }}
                className={s.mark}
              />
              <text x={padL + w + 6} y={y + 32} className={s.value}>
                {compact(values[i])}
              </text>
            </g>
          );
        })}
        <line x1={padL} x2={padL} y1={top} y2={H - axisH} className={s.axis} />
      </svg>
    );
  }

  const H = 260;
  const padL = 46;
  const padR = 12;
  const top = 18;
  const axisH = 34;
  const plotW = width - padL - padR;
  const plotH = H - top - axisH;
  const band = plotW / labels.length;
  const bw = Math.min(24, band * 0.6);
  const y = (v: number) => top + plotH - scale(v) * plotH;
  return (
    <svg
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      role="img"
      aria-label={`Bar chart${spec.title ? `: ${spec.title}` : ''}. ${labels.map((l, i) => `${l}: ${grouped(values[i])}`).join('; ')}.`}
    >
      {tickVals.map((tv) => (
        <g key={tv}>
          <line x1={padL} x2={width - padR} y1={y(tv)} y2={y(tv)} className={s.grid} />
          <text x={padL - 8} y={y(tv) + 4} textAnchor="end" className={s.tick}>
            {compact(tv)}
          </text>
        </g>
      ))}
      {labels.map((l, i) => {
        const cx = padL + band * (i + 0.5);
        const top0 = y(values[i]);
        const h = Math.max(2, top + plotH - top0);
        return (
          <g
            key={i}
            className={s.row}
            onPointerEnter={() =>
              onTip({ x: cx, y: top0 - 10, title: l, lines: [grouped(values[i])] })
            }
            onPointerLeave={() => onTip(null)}
          >
            <rect x={cx - band / 2} y={top} width={band} height={plotH + axisH} className={s.hit} />
            <path
              d={`M${cx - bw / 2} ${top + plotH}v${-(h - 4)}a4 4 0 0 1 4 -4h${bw - 8}a4 4 0 0 1 4 4v${h - 4}z`}
              style={{ fill: 'var(--s1)' }}
              className={s.mark}
            />
            <text x={cx} y={top0 - 6} textAnchor="middle" className={s.value}>
              {compact(values[i])}
            </text>
            <text x={cx} y={H - axisH + 18} textAnchor="middle" className={s.tick}>
              {fit(l, band - 4)}
            </text>
          </g>
        );
      })}
      <line x1={padL} x2={width - padR} y1={top + plotH} y2={top + plotH} className={s.axis} />
    </svg>
  );
}

/* ------------------------------------------------------------------ line */

function Line({
  spec,
  width,
  onTip,
}: {
  spec: LineSpec;
  width: number;
  onTip: (t: Tip | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const xs = spec.x;
  const ys = spec.series[0].y;
  const H = 250;
  const padL = 50;
  const padR = 52;
  const top = 22;
  const axisH = 28;
  const plotW = width - padL - padR;
  const plotH = H - top - axisH;
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const yt = ticks(Math.min(0, ...ys), Math.max(...ys), 5);
  const ylo = yt.ticks[0];
  const yhi = yt.ticks[yt.ticks.length - 1];
  const x = (v: number) => padL + ((v - xmin) / (xmax - xmin || 1)) * plotW;
  const y = (v: number) => top + plotH - ((v - ylo) / (yhi - ylo || 1)) * plotH;
  const years = yearish(xs);
  const xt = years
    ? (() => {
        const step = [1, 2, 5, 10].find((st) => (plotW / (xmax - xmin || 1)) * st >= 48) ?? 20;
        const out: number[] = [];
        for (let v = Math.ceil(xmin / step) * step; v <= xmax; v += step) out.push(v);
        return out;
      })()
    : ticks(xmin, xmax, Math.max(2, Math.floor(plotW / 90))).ticks.filter(
        (v) => v >= xmin - 1e-9 && v <= xmax + 1e-9,
      );
  const pts = xs.map((v, i) => [x(v), y(ys[i])] as const);
  const path = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join('');
  const area = `${path}L${pts[pts.length - 1][0]} ${y(ylo)}L${pts[0][0]} ${y(ylo)}Z`;
  const last = pts.length - 1;
  const xLabel = (v: number) => (years ? String(v) : compact(v));

  const move = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * plotW + padL;
    let best = 0;
    pts.forEach(([qx], i) => {
      if (Math.abs(qx - px) < Math.abs(pts[best][0] - px)) best = i;
    });
    setHover(best);
    onTip({
      x: pts[best][0],
      y: pts[best][1] - 4,
      title: xLabel(xs[best]),
      lines: [`${grouped(ys[best])}${spec.ylabel ? ` ${spec.ylabel}` : ''}`],
    });
  };

  return (
    <svg
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      role="img"
      aria-label={`Line chart${spec.title ? `: ${spec.title}` : ''}. ${xs.map((v, i) => `${xLabel(v)}: ${grouped(ys[i])}`).join('; ')}.`}
    >
      {spec.ylabel && (
        <text x={padL - 8} y={12} className={s.tick}>
          {spec.ylabel}
        </text>
      )}
      {yt.ticks.map((tv) => (
        <g key={tv}>
          <line x1={padL} x2={width - padR} y1={y(tv)} y2={y(tv)} className={s.grid} />
          <text x={padL - 8} y={y(tv) + 4} textAnchor="end" className={s.tick}>
            {compact(tv)}
          </text>
        </g>
      ))}
      {xt.map((tv) => (
        <text key={tv} x={x(tv)} y={H - 8} textAnchor="middle" className={s.tick}>
          {xLabel(tv)}
        </text>
      ))}
      <line x1={padL} x2={width - padR} y1={y(ylo)} y2={y(ylo)} className={s.axis} />
      <path d={area} style={{ fill: 'var(--s1)', opacity: 0.1 }} />
      <path
        d={path}
        style={{ fill: 'none', stroke: 'var(--s1)' }}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {hover !== null && (
        <line x1={pts[hover][0]} x2={pts[hover][0]} y1={top} y2={y(ylo)} className={s.cross} />
      )}
      {pts.map(([px, py], i) => (
        <circle
          key={i}
          cx={px}
          cy={py}
          r={hover === i ? 5 : 4}
          style={{ fill: 'var(--s1)' }}
          className={s.dot}
        />
      ))}
      <text x={pts[last][0] + 8} y={pts[last][1] + 4} className={s.value}>
        {compact(ys[last])}
      </text>
      <rect
        x={padL}
        y={top}
        width={plotW}
        height={plotH}
        className={s.hit}
        onPointerMove={move}
        onPointerLeave={() => {
          setHover(null);
          onTip(null);
        }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ the figure */

function dataRows(spec: FigSpec): { head: string[]; rows: ReactNode[][] } {
  if (spec.kind === 'bar')
    return {
      head: [spec.xlabel ?? 'label', spec.ylabel ?? 'value'],
      rows: spec.labels.map((l, i) => [l, grouped(spec.values[i])]),
    };
  if (spec.kind === 'line')
    return {
      head: [spec.xlabel ?? 'x', spec.ylabel ?? 'y'],
      rows: spec.x.map((v, i) => [
        yearish(spec.x) ? String(v) : grouped(v),
        grouped(spec.series[0].y[i]),
      ]),
    };
  return {
    head: ['item', 'detail', 'when', 'group'],
    rows: spec.items.map((it) => [it.label, it.note, it.span, it.group]),
  };
}

export default function Chart({ spec }: { spec: FigSpec }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const groups = spec.kind === 'timeline' ? spec.groups : [];
  const data = table ? dataRows(spec) : null;

  return (
    <figure className={s.figure} aria-labelledby={spec.title ? `${id}-t` : undefined}>
      <div className={s.figHead}>
        {spec.title && (
          <figcaption id={`${id}-t`} className={s.figTitle}>
            {spec.title}
          </figcaption>
        )}
        <button
          type="button"
          className={s.figToggle}
          aria-pressed={table}
          onClick={() => setTable((v) => !v)}
        >
          {table ? 'Chart' : 'Data'}
        </button>
      </div>
      <Legend groups={groups} />
      <div ref={ref} className={s.plot}>
        {data ? (
          <div className={s.tableWrap}>
            <table className={s.df}>
              <thead>
                <tr>
                  {data.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {spec.kind === 'timeline' && <Timeline spec={spec} width={width} onTip={setTip} />}
            {spec.kind === 'bar' && <Bars spec={spec} width={width} onTip={setTip} />}
            {spec.kind === 'line' && <Line spec={spec} width={width} onTip={setTip} />}
            <Tooltip tip={tip} width={width} />
          </>
        )}
      </div>
    </figure>
  );
}
