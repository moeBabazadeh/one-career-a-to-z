'use client';

import { useState } from 'react';
import { db, fmt } from '../_shared/data';
import {
  BILL,
  BILL_TOTAL,
  CHART_ORDER,
  PERIOD,
  ROLES,
  SPAN,
  USAGE,
  YEARS,
  accountIdPretty,
  hexOf,
} from './inventory';
import { runInShell } from './Shell';
import { Card, Icon, PageHead, Pill, useWidth } from './ui';
import { href } from './store';
import s from './console.module.scss';

const { person } = db;
const roleOf = (id: string) => ROLES.find((r) => r.id === id);
const yearsAndMonths = (n: number) => `${Math.floor(n / 12)} yr ${n % 12} mo`;
const INVOICE = `INV-${hexOf(`${person.email}|${fmt.iso(PERIOD.to)}`, 8).toUpperCase()}`;
const totals = YEARS.map((_, i) => CHART_ORDER.reduce((sum, id) => sum + USAGE[id][i], 0));
const OVERLAP = BILL_TOTAL - SPAN;

function Legend() {
  return (
    <ul className={s.legend}>
      {CHART_ORDER.map((id, i) => (
        <li key={id}>
          <span className={s.swatch} data-series={i} aria-hidden="true" />
          {roleOf(id)?.name}
        </li>
      ))}
    </ul>
  );
}

/** Months per role per year, stacked: oldest role at the bottom, a surface gap between segments. */
function UsageChart() {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const H = 260;
  const pad = { l: 34, r: 8, t: 12, b: 26 };
  const w = width - pad.l - pad.r;
  const h = H - pad.t - pad.b;
  const top = Math.ceil(Math.max(...totals) / 6) * 6;
  const band = w / YEARS.length;
  const bar = Math.min(24, band * 0.62);
  const y = (v: number) => pad.t + h - (v / top) * h;
  const every = band < 30 ? (band < 18 ? 4 : 2) : 1;
  const GAP = 2;

  const column = (i: number) => {
    let base = 0;
    const segs = CHART_ORDER.map((id, si) => ({ id, si, v: USAGE[id][i] })).filter((x) => x.v > 0);
    return segs.map((seg, k) => {
      const y0 = y(base);
      base += seg.v;
      const y1 = y(base);
      const x0 = pad.l + band * i + (band - bar) / 2;
      const topSeg = k === segs.length - 1;
      const height = Math.max(1, y0 - y1 - (k > 0 ? GAP : 0));
      const yTop = y1;
      const r = topSeg ? Math.min(4, height / 2) : 0;
      const d = `M${x0},${yTop + height}V${yTop + r}${r ? `Q${x0},${yTop} ${x0 + r},${yTop}` : ''}H${x0 + bar - r}${r ? `Q${x0 + bar},${yTop} ${x0 + bar},${yTop + r}` : ''}V${yTop + height}Z`;
      return <path key={seg.id} d={d} className={s.seg} data-series={seg.si} />;
    });
  };

  return (
    <div className={s.usage}>
      <Legend />
      <div ref={ref} className={s.usagePlot}>
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`Months worked per role in each year from ${YEARS[0]} to ${YEARS[YEARS.length - 1]}. The table view lists every value.`}
          onPointerMove={(e) => {
            const i = Math.floor(
              (e.clientX - e.currentTarget.getBoundingClientRect().left - pad.l) / band,
            );
            setHover(i >= 0 && i < YEARS.length ? i : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {Array.from({ length: top / 6 + 1 }, (_, k) => k * 6).map((v) => (
            <g key={v}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={y(v)}
                y2={y(v)}
                className={v === 0 ? s.baseline : s.grid}
              />
              <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className={s.axis}>
                {v}
              </text>
            </g>
          ))}
          {YEARS.map((yr, i) => (
            <g key={yr} className={s.col} data-hover={hover === i || undefined}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={h} className={s.colHit} />
              {column(i)}
              {i % every === 0 && (
                <text
                  x={pad.l + band * i + band / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className={s.axis}
                >
                  {every > 1 ? `’${String(yr).slice(2)}` : yr}
                </text>
              )}
            </g>
          ))}
        </svg>
        {hover !== null && (
          <div
            className={s.tooltip}
            style={{
              left: Math.min(width - 190, Math.max(0, pad.l + band * hover + band / 2 - 95)),
            }}
          >
            <b>{YEARS[hover]}</b>
            <ul>
              {CHART_ORDER.map((id, si) =>
                USAGE[id][hover] ? (
                  <li key={id}>
                    <span className={s.swatch} data-series={si} aria-hidden="true" />
                    <span>{roleOf(id)?.name}</span>
                    <b>{USAGE[id][hover]} mo</b>
                  </li>
                ) : null,
              )}
            </ul>
            <p>
              Total <b>{totals[hover]} mo</b>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function UsageTable() {
  return (
    <div className={s.tableScroll}>
      <table className={s.plainTable}>
        <caption className={s.srOnly}>Months per role per year</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            {CHART_ORDER.map((id) => (
              <th key={id} scope="col" className={s.end}>
                {roleOf(id)?.name}
              </th>
            ))}
            <th scope="col" className={s.end}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {YEARS.map((yr, i) => (
            <tr key={yr}>
              <th scope="row">{yr}</th>
              {CHART_ORDER.map((id) => (
                <td key={id} className={s.end}>
                  {USAGE[id][i] || '·'}
                </td>
              ))}
              <td className={s.end}>
                <b>{totals[i]}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Billing() {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const longest = ROLES.reduce((a, b) => (b.months > a.months ? b : a));
  const active = ROLES.filter((r) => r.active);
  return (
    <div className={s.page}>
      <PageHead
        kicker="Billing and cost management"
        title="Billing"
        lede={`Time invested per role, in months, derived from each role's start and end dates. Billing period ${fmt.mon(PERIOD.from)} to ${fmt.mon(PERIOD.to)}; open roles are billed to the facts' date.`}
        actions={
          <button
            type="button"
            className={s.btn}
            onClick={() => runInShell('cloud billing summary')}
          >
            <Icon name="terminal" size={16} /> Summary in CloudShell
          </button>
        }
      />
      <ul className={s.billTiles}>
        <li className={s.card}>
          <span>Total billed</span>
          <b>{BILL_TOTAL}</b>
          <small>months · {yearsAndMonths(BILL_TOTAL)}</small>
        </li>
        <li className={s.card}>
          <span>Calendar span</span>
          <b>{SPAN}</b>
          <small>months, first role to today</small>
        </li>
        <li className={s.card}>
          <span>Concurrent</span>
          <b>{OVERLAP}</b>
          <small>months billed to two roles at once</small>
        </li>
        <li className={s.card}>
          <span>Longest role</span>
          <b>{longest.months}</b>
          <small>
            months · <a href={href(`iam/roles/${longest.id}`)}>{longest.name}</a>
          </small>
        </li>
        <li className={s.card}>
          <span>Running now</span>
          <b>{active.length}</b>
          <small>{active.map((r) => r.name).join(' and ')}</small>
        </li>
      </ul>

      <Card
        title="Usage by role, per year"
        actions={
          <div className={s.segmented} role="radiogroup" aria-label="View">
            <button
              type="button"
              role="radio"
              aria-checked={view === 'chart'}
              onClick={() => setView('chart')}
            >
              Chart
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === 'table'}
              onClick={() => setView('table')}
            >
              Table
            </button>
          </div>
        }
      >
        {view === 'chart' ? <UsageChart /> : <UsageTable />}
        <p className={s.chartNote}>
          Months per calendar year, from the role dates on record; a role&rsquo;s end month is not
          counted. Years above twelve had two roles running at once.
        </p>
      </Card>

      <section className={s.invoice} aria-labelledby="invoice-title">
        <header className={s.invoiceHead}>
          <div>
            <p className={s.kicker}>Invoice</p>
            <h2 id="invoice-title">{INVOICE}</h2>
          </div>
          <Pill tone="ok">
            <Icon name="check" size={13} /> Paid in full, in months
          </Pill>
        </header>
        <dl className={s.invoiceMeta}>
          <div>
            <dt>Bill to</dt>
            <dd>{person.name}</dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd className={s.mono}>{accountIdPretty}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>
              {fmt.mon(PERIOD.from)} – {fmt.mon(PERIOD.to)}
            </dd>
          </div>
          <div>
            <dt>Unit</dt>
            <dd>months</dd>
          </div>
        </dl>
        <div className={s.tableScroll}>
          <table className={s.invoiceTable}>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Period</th>
                <th scope="col" className={s.end}>
                  Qty
                </th>
              </tr>
            </thead>
            {BILL.map((b) => (
              <tbody key={b.info.id}>
                <tr className={s.invoiceRole}>
                  <th scope="rowgroup" colSpan={2}>
                    <a href={href(`iam/roles/${b.info.id}`)}>{b.info.role.org}</a>
                    {b.info.role.contract && <Pill>contract</Pill>}
                    {b.info.active && <Pill tone="ok">running</Pill>}
                  </th>
                  <td className={s.end}>
                    <b>{b.info.months}</b>
                  </td>
                </tr>
                {b.steps.map((st) => (
                  <tr key={st.title} className={s.invoiceStep}>
                    <td>{st.title}</td>
                    <td className={s.invoicePeriod}>
                      {fmt.mon(st.from)} – {st.to ? fmt.mon(st.to) : 'now'}
                    </td>
                    <td className={s.end}>{st.months} mo</td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  Total
                </th>
                <td className={s.end}>
                  <b>{BILL_TOTAL} mo</b>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={s.chartNote}>
          A step whose start is known only to the year is counted from mid-year. {OVERLAP} months
          appear twice because roles overlapped; the calendar span is {SPAN} months.
        </p>
      </section>
    </div>
  );
}
