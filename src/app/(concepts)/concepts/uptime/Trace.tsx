'use client';

import { useState } from 'react';
import { NOW, db, fmt, jobs, profile, roles } from '../_shared/data';
import s from './loadtest.module.scss';

// The career as a distributed trace: one root span, a span per role, and child spans
// where a role changed title. Dates come from the job ranges, to the month.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const NOW_M = Math.floor(NOW) * 12 + Math.floor((NOW % 1) * 12);
const FROM = db.person.since * 12,
  TO = (db.asOf.y + 1) * 12;

/** "June 2024" → months since year 0; "Present" → null; a bare "2017" → January. */
function month(text: string) {
  const parts = text.trim().split(' ');
  if (parts[0] === 'Present') return null;
  return parts.length === 1
    ? Number(parts[0]) * 12
    : Number(parts[1]) * 12 + MONTHS.indexOf(parts[0]);
}

function duration(months: number) {
  const y = Math.floor(months / 12),
    m = months % 12;
  return [y && `${y}y`, m && `${m}mo`].filter(Boolean).join(' ') || '<1mo';
}

interface Span {
  id: string;
  service: string;
  org: string;
  name: string;
  range: string;
  start: number;
  end: number | null;
  depth: number;
  color: string;
  url?: string;
  exact: boolean;
  logs: string[];
}

/** The company name a role's job entry goes by. */
const JOB: Record<string, string> = Object.fromEntries(
  db.roleList.map((r) => [r.id, r.short ?? r.org]),
);
const COLOR: Record<string, string> = {
  freelance: 'var(--dim)',
  niknam: 'var(--cyan)',
  alget: 'var(--pink)',
  zeroone: 'var(--job)',
  neuroject: 'var(--ok)',
  neuroship: 'var(--blue)',
};

// Title changes within a role, to the month when both ends are known to the month.
const CHILDREN: Record<string, [string, string][]> = Object.fromEntries(
  db.roleList
    .filter((r) => r.steps.length > 1)
    .map((r) => [
      r.id,
      r.steps.map((st, i): [string, string] => {
        const to = r.steps[i + 1]?.from ?? r.to;
        return [
          st.title,
          st.from.m && (!to || to.m)
            ? fmt.monthSpan(st.from, to)
            : fmt.yearSpan(st.from, to, ' – ', 'Present'),
        ];
      }),
    ]),
);

const SPANS: Span[] = (() => {
  const out: Span[] = [];
  for (const role of [...roles].sort((a, b) => a.start - b.start)) {
    const job = jobs.find((j) => j.company === JOB[role.id]);
    if (!job) continue;
    const [a, b] = job.range.split(' – ');
    out.push({
      id: role.id,
      service: job.company,
      org: role.org,
      name: role.title,
      range: job.range,
      start: month(a)!,
      end: month(b),
      depth: 1,
      color: COLOR[role.id],
      url: job.url,
      exact: true,
      logs: job.duties,
    });
    for (const [name, range] of CHILDREN[role.id] ?? []) {
      const [ca, cb] = range.split(' – ');
      // Year-only dates place the change at the turn of that year; the parent's own dates win.
      const parentEnd = month(b);
      const childEnd = month(cb);
      const start = Math.max(month(a)!, month(ca)!);
      const end =
        childEnd == null
          ? null
          : parentEnd != null && Math.floor(parentEnd / 12) === Math.floor(childEnd / 12)
            ? parentEnd
            : Math.min(childEnd, parentEnd ?? Infinity);
      out.push({
        id: `${role.id}-${name}`,
        service: job.company,
        org: role.org,
        name,
        range,
        start,
        end,
        depth: 2,
        color: COLOR[role.id],
        exact: ca.includes(' '),
        logs: [],
      });
    }
  }
  const first = Math.min(...out.map((sp) => sp.start));
  out.unshift({
    id: 'root',
    service: db.person.first.toLowerCase(),
    org: profile.fullName,
    name: 'career',
    range: `${MONTHS[first % 12]} ${Math.floor(first / 12)} – Present`,
    start: first,
    end: null,
    depth: 0,
    color: 'var(--text)',
    exact: true,
    logs: [profile.lede],
  });
  return out;
})();

const pos = (m: number) => ((m - FROM) / (TO - FROM)) * 100;
const TICKS = Array.from(
  { length: Math.ceil((TO - FROM) / 24) },
  (_, i) => db.person.since + i * 2,
);

/** Where a span's duration goes: after the bar, before it, or inside it when there's no room. */
function labelAt(start: number, end: number): [React.CSSProperties, boolean] {
  const a = pos(start),
    b = pos(end);
  if (b <= 80) return [{ left: `calc(${b}% + 8px)` }, false];
  if (a >= 22) return [{ right: `calc(${100 - a}% + 8px)` }, false];
  return [{ left: `calc(${a}% + 8px)` }, true];
}
const running = SPANS.filter((sp) => sp.depth === 1 && sp.end == null).length;
const services = new Set(SPANS.filter((sp) => sp.depth === 1).map((sp) => sp.service)).size;

export default function Trace() {
  const [open, setOpen] = useState(db.current.role.id);
  const root = SPANS[0];

  return (
    <div className={s.trace} style={{ '--now': `${pos(NOW_M)}%` } as React.CSSProperties}>
      <div className={s.traceHead}>
        <span>
          <b>career</b> · trace
        </span>
        <span>{duration(NOW_M - root.start)}</span>
        <span>{services} services</span>
        <span>{SPANS.length} spans</span>
        <span className={s.traceRunning}>{running} running</span>
      </div>
      <div className={s.traceAxis} aria-hidden="true">
        <span />
        <span className={s.traceTicks}>
          {TICKS.map((y) => (
            <i key={y} style={{ left: `${pos(y * 12)}%` }}>
              {y}
            </i>
          ))}
          <b style={{ left: `${pos(NOW_M)}%` }}>now</b>
        </span>
      </div>
      <ol className={s.spans}>
        {SPANS.map((sp) => {
          const end = sp.end ?? NOW_M;
          const isOpen = open === sp.id;
          const [at, inside] = labelAt(sp.start, end);
          const job = jobs.find((j) => j.company === JOB[sp.id]);
          return (
            <li key={sp.id} data-depth={sp.depth}>
              <button
                type="button"
                className={s.span}
                aria-expanded={isOpen}
                aria-controls={`span-${sp.id}`}
                onClick={() => setOpen(isOpen ? '' : sp.id)}
                style={{ '--c': sp.color } as React.CSSProperties}
              >
                <span className={s.spanName} style={{ paddingLeft: `${sp.depth * 14}px` }}>
                  {sp.depth < 2 && <b>{sp.service}</b>}{' '}
                  <span>{sp.depth === 2 ? `↳ ${sp.name}` : sp.name}</span>
                </span>
                <span className={s.spanTrack}>
                  <span
                    className={s.spanBar}
                    data-running={sp.end == null}
                    style={{
                      left: `${pos(sp.start)}%`,
                      width: `${Math.max(0.6, pos(end) - pos(sp.start))}%`,
                    }}
                  />
                  <span className={s.spanDur} style={at} data-inside={inside}>
                    {sp.exact ? duration(end - sp.start) : sp.range}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div id={`span-${sp.id}`} className={s.spanDetail}>
                  <table>
                    <caption>Tags</caption>
                    <tbody>
                      <tr>
                        <th scope="row">service.name</th>
                        <td>{sp.service}</td>
                      </tr>
                      <tr>
                        <th scope="row">organization</th>
                        <td>{sp.org}</td>
                      </tr>
                      <tr>
                        <th scope="row">span.name</th>
                        <td>{sp.name}</td>
                      </tr>
                      <tr>
                        <th scope="row">period</th>
                        <td>{sp.range}</td>
                      </tr>
                      {sp.exact && (
                        <tr>
                          <th scope="row">duration</th>
                          <td>{duration(end - sp.start)}</td>
                        </tr>
                      )}
                      {(sp.url ?? job?.url) && (
                        <tr>
                          <th scope="row">url</th>
                          <td>
                            <a href={sp.url ?? job?.url} target="_blank" rel="noreferrer">
                              {new URL((sp.url ?? job?.url)!).host} ↗
                            </a>
                          </td>
                        </tr>
                      )}
                      <tr>
                        <th scope="row">status</th>
                        <td data-running={sp.end == null}>
                          {sp.end == null ? 'running' : 'ended'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {sp.logs.length > 0 && (
                    <div className={s.spanLogs}>
                      <h4>Logs</h4>
                      <ul>
                        {sp.logs.map((line) => (
                          <li key={line.slice(0, 32)}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sp.depth === 2 && (
                    <p className={s.spanNote}>
                      A child span of {sp.service}: the title it held for this part of the role.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
