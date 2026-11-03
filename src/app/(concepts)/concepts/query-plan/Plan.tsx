'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import type { RunResult } from './sql/engine';
import { actualText, detailLines, explainText, flatten, title, type PlanView } from './sql/explain';
import { fmtCost } from './sql/plan';
import { KIND_TOKEN, NH, NW, bez, layoutPlan, pathOf, type Edge } from './planLayout';
import { stream } from './store';
import s from './query.module.scss';

const ABOUT_OP: Record<string, string> = {
  'Seq Scan': 'Reads every row of the table and keeps the ones that pass the filter.',
  'Index Scan': 'Looks rows up through the primary-key index instead of reading the whole table.',
  'Hash Join': 'Builds a hash table from the inner side, then probes it once for each outer row.',
  'Hash Left Join': 'A hash join that also keeps outer rows without a match, padded with NULLs.',
  Hash: 'Collects the inner side into an in-memory hash table, all of it, before the join can start.',
  'Nested Loop': 'Runs the inner side once for every outer row; loops counts how many times.',
  'Nested Loop Left Join':
    'A nested loop that also keeps outer rows without a match, padded with NULLs.',
  HashAggregate: 'Groups rows in a hash table and computes each group’s aggregates.',
  Aggregate: 'Folds every input row into a single row of aggregates.',
  Sort: 'Needs every input row before it can return the first sorted one.',
  Limit: 'Stops pulling once it has enough rows, and everything below it stops too.',
  Unique: 'Drops adjacent duplicates from its sorted input.',
  Materialize: 'Caches the inner rows so later loops replay them from memory.',
  Result: 'Computes a row without reading any table.',
};

const n0 = (n: number) => n.toLocaleString('en-US');
const msText = (v: number) => (v < 0.001 && v > 0 ? '<0.001' : v.toFixed(3));

/** The second line of a node card: what it reads or on what it joins, sorts or groups. */
function subline(p: PlanView) {
  const d = Object.fromEntries(p.details);
  const strip = (t: string) => t.replace(/^\((.*)\)$/, '$1');
  if (p.op === 'Index Scan')
    return `${p.relation}${p.alias ? ` ${p.alias}` : ''} · ${strip(d['Index Cond'] ?? '')}`;
  if (p.relation)
    return `${p.relation}${p.alias ? ` ${p.alias}` : ''}${d.Filter ? ` · ${strip(d.Filter)}` : ''}`;
  if (d['Hash Cond']) return strip(d['Hash Cond']);
  if (d['Join Filter']) return strip(d['Join Filter']);
  if (d['Sort Key']) return d['Sort Key'];
  if (d['Group Key']) return `by ${d['Group Key']}`;
  if (p.op === 'Nested Loop' || p.op === 'Nested Loop Left Join')
    return 'inner side once per outer row';
  if (p.op === 'Hash') return 'build the hash table';
  if (p.op === 'Aggregate') return 'one row of aggregates';
  if (p.op === 'Limit') return `first ${p.est.rows} rows`;
  return ABOUT_OP[p.op]?.split(' ').slice(0, 4).join(' ') ?? '';
}

/** Rows per loop, as the planner sees them: under- or over-estimated, and by how much. */
function misestimate(p: PlanView) {
  if (!p.act?.loops) return null;
  const actual = Math.max(1, Math.round(p.act.rows / p.act.loops));
  const est = Math.max(1, p.est.rows);
  const f = actual / est;
  if (f >= 2) return { dir: 'under', f: Math.round(f) };
  if (f <= 0.5) return { dir: 'over', f: Math.round(1 / f) };
  return null;
}

interface Flight {
  edge: Edge;
  t0: number;
  dur: number;
  kind: string;
  packet: boolean;
  row: number;
}

interface Burst {
  x: number;
  y: number;
  t0: number;
  kind: string;
}

export default function Plan({ result, runId }: { result: RunResult; runId: number }) {
  const plan = result.plan;
  const reduced = useReducedMotion();
  const [wrapRef, inView] = useInView<HTMLDivElement>(true, 0.25);
  const [picked, setPicked] = useState<{ run: number; id: number } | null>(null);
  const selected = picked && picked.run === runId ? picked.id : null;
  const setSelected = (id: number | null) => setPicked(id === null ? null : { run: runId, id });
  const [view, setView] = useState<'graph' | 'text'>('graph');
  const [replay, setReplay] = useState(0);
  const graph = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const counters = useRef(new Map<number, HTMLElement>());
  const timers = useRef(new Map<number, HTMLElement>());
  const sinkCount = useRef<HTMLElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const scheme = useScheme();
  const colors = useRef<Record<string, string>>({});

  const layout = useMemo(() => (plan ? layoutPlan(plan) : null), [plan]);
  const nodes = useMemo(() => (plan ? flatten(plan) : []), [plan]);
  const maxSelf = Math.max(0, ...nodes.map((n) => n.act?.self ?? 0));
  const totalSelf = nodes.reduce((t, n) => t + (n.act?.self ?? 0), 0) || 1;
  const maxRows = Math.max(1, ...nodes.map((n) => n.act?.rows ?? n.est.rows));
  const clientRows = result.kind === 'select' ? result.rows.length : (plan?.act?.rows ?? 0);
  const animate = Boolean(plan && result.analyzed && result.events.length && !reduced);

  // Fit the graph to its panel: width always, height too when the panel has one.
  useEffect(() => {
    const el = graph.current;
    const inner = layer.current;
    if (!el || !inner || !layout) return;
    const fit = () => {
      const w = el.clientWidth - 8;
      const tall = getComputedStyle(el).getPropertyValue('--fit-height').trim() === '1';
      const h = el.clientHeight - 8;
      const k = Math.max(0.5, Math.min(1, w / layout.W, tall ? h / layout.H : Infinity));
      inner.style.transform = `scale(${k})`;
      inner.style.left = `${Math.max(0, (w - layout.W * k) / 2) + 4}px`;
      // A short plan sits a little above the middle of a tall panel, not pinned to its top.
      inner.style.top = `${tall ? Math.max(4, (h - layout.H * k) * 0.35) : 4}px`;
      if (!tall) el.style.height = `${layout.H * k + 8}px`;
      else el.style.height = '';
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, view]);

  // The particles paint in the scheme's kind colours, read once each time the scheme changes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    colors.current = Object.fromEntries(
      [...Object.entries(KIND_TOKEN), ['bg', '--bg']].map(([k, name]) => [k, token(el, name)]),
    );
  }, [scheme, wrapRef]);

  // Replays the run: one particle per row, along the edge it really took.
  useEffect(() => {
    const cv = canvas.current;
    if (!layout || !plan || !cv || view !== 'graph') return;
    const finalize = () => {
      for (const n of nodes) {
        const c = counters.current.get(n.id);
        if (c) c.textContent = n0(n.act?.rows ?? n.est.rows);
        const t = timers.current.get(n.id);
        if (t && n.act) t.textContent = msText(n.act.total * Math.max(1, n.act.loops));
      }
      if (sinkCount.current) sinkCount.current.textContent = n0(clientRows);
      root.current?.removeAttribute('data-running');
    };
    if (!animate || (!inView && runId === 0)) {
      finalize();
      return;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(layout.W * dpr);
    cv.height = Math.round(layout.H * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const events = result.events;
    const n = events.length;
    const t0 = events[0].t;
    const span = Math.max(1e-6, events[n - 1].t - t0);
    const D = Math.max(1500, Math.min(4600, 1000 + n * 8));
    const launch = events.map(
      (e, i) => D * (0.6 * (n > 1 ? i / (n - 1) : 0) + 0.4 * ((e.t - t0) / span)),
    );
    const edgeFrom = new Map(layout.edges.map((e) => [e.from, e]));
    const kindOf = new Map(nodes.map((v) => [v.id, v.kind]));
    const parentOf = new Map(layout.boxes.map((b) => [b.id, b.parent]));
    const counts = new Map<number, number>();
    const flights: Flight[] = [];
    const bursts: Burst[] = [];
    let next = 0;
    let rootRow = 0;
    let arrived = 0;
    let start = 0;
    let frame = 0;

    for (const v of nodes) {
      const c = counters.current.get(v.id);
      if (c) c.textContent = '0';
      const t = timers.current.get(v.id);
      if (t) t.textContent = '…';
    }
    if (sinkCount.current) sinkCount.current.textContent = '0';
    root.current?.setAttribute('data-running', '');
    stream({ type: 'start', runId });

    const tick = (now: number) => {
      start ||= now;
      const el = now - start;
      while (next < n && launch[next] <= el) {
        const e = events[next++];
        if (e.kind === 1) {
          counts.set(e.node, (counts.get(e.node) ?? 0) + 1);
          const c = counters.current.get(e.node);
          if (c) c.textContent = n0(counts.get(e.node)!);
          continue;
        }
        const edge =
          e.kind === 2 ? layout.edges.find((x) => x.from === e.node) : edgeFrom.get(e.node);
        if (e.kind === 0) {
          counts.set(e.node, (counts.get(e.node) ?? 0) + 1);
          const c = counters.current.get(e.node);
          if (c) c.textContent = n0(counts.get(e.node)!);
        }
        if (!edge) continue;
        const isRoot = parentOf.get(e.node) === null;
        flights.push({
          edge,
          t0: launch[next - 1],
          dur: Math.max(240, Math.min(640, edge.length * 2.4)),
          kind: isRoot ? 'client' : (kindOf.get(e.node) ?? 'other'),
          packet: e.kind === 2,
          row: isRoot && e.kind === 0 ? rootRow++ : -1,
        });
      }

      const pal = colors.current;
      ctx.clearRect(0, 0, layout.W, layout.H);
      ctx.lineCap = 'round';
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        const u = (el - f.t0) / f.dur;
        if (u >= 1) {
          flights.splice(i, 1);
          const [x, y] = bez(f.edge.p, 1);
          bursts.push({ x, y, t0: el, kind: f.kind });
          if (f.row >= 0) {
            arrived++;
            if (sinkCount.current) sinkCount.current.textContent = n0(arrived);
            stream({ type: 'row', runId, index: f.row });
          }
          continue;
        }
        const ease = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        const [x, y] = bez(f.edge.p, ease);
        if (f.packet) {
          ctx.fillStyle = pal[f.kind];
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.roundRect(x - 9, y - 5, 18, 10, 3);
          ctx.fill();
          ctx.fillStyle = pal.bg;
          ctx.fillRect(x - 5, y - 1.5, 10, 1);
          ctx.fillRect(x - 5, y + 1, 10, 1);
          continue;
        }
        const [tx, ty] = bez(f.edge.p, Math.max(0, ease - 0.08));
        ctx.strokeStyle = pal[f.kind];
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = pal[f.kind];
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const k = (el - b.t0) / 420;
        if (k >= 1) {
          bursts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = pal[b.kind];
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2 + k * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (next >= n && !flights.length && !bursts.length) {
        finalize();
        stream({ type: 'done', runId });
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, layout.W, layout.H);
      finalize();
      stream({ type: 'done', runId });
    };
  }, [layout, plan, nodes, result.events, animate, inView, runId, replay, view, clientRows]);

  const sel = nodes.find((n) => n.id === selected) ?? null;
  const text = plan ? explainText(plan, result.analyzed, result.planning, result.execution) : [];

  return (
    <section className={s.plan} ref={wrapRef} aria-labelledby="plan-title">
      <header className={s.paneHead}>
        <h2 id="plan-title">
          <span className={s.paneDot} aria-hidden="true" />
          Query plan
          <small>{result.analyzed ? 'EXPLAIN ANALYZE' : plan ? 'EXPLAIN' : 'no plan'}</small>
        </h2>
        <div className={s.seg} role="tablist" aria-label="Plan view">
          {(['graph', 'text'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
            >
              {v === 'graph' ? 'Graph' : 'Text'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={s.ghost}
          onClick={() => setReplay((r) => r + 1)}
          disabled={!animate || view !== 'graph'}
          aria-label="Replay the rows through the plan"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" />
          </svg>
          <span className={s.hideSm}>Replay</span>
        </button>
      </header>

      {!plan || !layout ? (
        <div className={s.planEmpty}>
          {result.ok ? (
            <p>
              <b>{result.command || 'Done'}</b>
              {result.kind === 'insert'
                ? ' · an INSERT is a Result node feeding Insert on messages. Nothing to stream.'
                : ' · meta-commands read the catalog, not a plan.'}
            </p>
          ) : (
            <p>
              <b>No plan.</b> The statement failed before the planner could finish. Fix the error
              and run it again.
            </p>
          )}
        </div>
      ) : view === 'text' ? (
        <pre className={s.planText} tabIndex={0} aria-label="EXPLAIN output">
          {text.map((l, i) => {
            const m = /^(\s*(?:->\s+)?)([A-Z][A-Za-z ]+?)(  \(|\s+on |\s+using |:)(.*)$/.exec(l);
            if (!m) return <span key={i}>{`${l}\n`}</span>;
            const isNode = m[3] !== ':';
            return (
              <span key={i}>
                {m[1]}
                <b className={isNode ? s.t_node : s.t_key}>{m[2]}</b>
                {m[3]}
                {m[4]
                  .split(/(\d+(?:\.\d+)?)/)
                  .map((part, j) => (j % 2 ? <i key={j}>{part}</i> : part))}
                {'\n'}
              </span>
            );
          })}
        </pre>
      ) : (
        <div className={s.graph} ref={graph}>
          <div ref={root} className={s.graphRoot}>
            <div className={s.layer2} ref={layer} style={{ width: layout.W, height: layout.H }}>
              <svg className={s.edges} width={layout.W} height={layout.H} aria-hidden="true">
                {layout.edges.map((e) => {
                  const v = nodes.find((x) => x.id === e.from)!;
                  const rows = v.act?.rows ?? v.est.rows;
                  const w = 1 + 3.2 * (Math.log10(1 + rows) / Math.log10(1 + maxRows));
                  return (
                    <path
                      key={e.from}
                      d={pathOf(e.p)}
                      strokeWidth={w}
                      data-kind={e.to === 'client' ? 'client' : v.kind}
                    />
                  );
                })}
              </svg>
              <canvas
                ref={canvas}
                className={s.particles}
                style={{ width: layout.W, height: layout.H }}
                aria-hidden="true"
              />
              <div
                className={s.sink}
                style={{
                  left: layout.sink.x,
                  top: layout.sink.y,
                  width: layout.sink.w,
                  height: layout.sink.h,
                }}
              >
                <span className={s.sinkDot} aria-hidden="true" />
                client ← <b ref={sinkCount}>{n0(clientRows)}</b>
                &nbsp;{clientRows === 1 ? 'row' : 'rows'}
              </div>
              {layout.boxes.map((b) => {
                const v = b.view;
                const mis = misestimate(v);
                const self = v.act?.self ?? 0;
                const slow = nodes.length > 2 && self === maxSelf && self > 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={s.node}
                    data-kind={v.kind}
                    data-never={(v.act && !v.act.loops) || undefined}
                    aria-pressed={selected === v.id}
                    style={
                      {
                        left: b.x,
                        top: b.y,
                        width: NW,
                        height: NH,
                        '--share': `${Math.round((self / totalSelf) * 100)}%`,
                      } as React.CSSProperties
                    }
                    onClick={() => setSelected(selected === v.id ? null : v.id)}
                    aria-label={`${title(v)}: ${v.act ? (v.act.loops ? `${v.act.rows} rows in ${v.act.loops} loop${v.act.loops > 1 ? 's' : ''}` : 'never executed') : `${v.est.rows} rows estimated`}. Show details.`}
                  >
                    <span className={s.nodeHead}>
                      <i aria-hidden="true" />
                      <b>{v.op}</b>
                      {slow && <em className={s.badge}>slowest</em>}
                      {!slow && mis && (
                        <em className={s.badge} data-tone="warn">{`×${mis.f} ${mis.dir}`}</em>
                      )}
                    </span>
                    <span className={s.nodeSub}>{subline(v)}</span>
                    <span className={s.nodeFoot}>
                      <span>
                        <b
                          ref={(el) => {
                            if (el) counters.current.set(v.id, el);
                            else counters.current.delete(v.id);
                          }}
                        >
                          {n0(v.act?.rows ?? v.est.rows)}
                        </b>{' '}
                        {v.act ? ((v.act.rows ?? 0) === 1 ? 'row' : 'rows') : 'est.'}
                        {v.act && v.act.loops > 1 && <em className={s.loops}>×{v.act.loops}</em>}
                      </span>
                      {v.act && (
                        <span>
                          <b
                            ref={(el) => {
                              if (el) timers.current.set(v.id, el);
                              else timers.current.delete(v.id);
                            }}
                          >
                            {v.act.loops ? msText(v.act.total * v.act.loops) : '—'}
                          </b>{' '}
                          ms
                        </span>
                      )}
                    </span>
                    <span className={s.nodeShare} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {plan && view === 'graph' && (
        <div className={s.planFoot} data-open={sel ? '' : undefined}>
          {sel ? (
            <div className={s.detail} aria-live="polite">
              <div className={s.detailHead}>
                <b data-kind={sel.kind}>{title(sel)}</b>
                <button
                  type="button"
                  className={s.close}
                  onClick={() => setSelected(null)}
                  aria-label="Close details"
                >
                  ×
                </button>
              </div>
              <p>{ABOUT_OP[sel.op]}</p>
              <dl>
                <div>
                  <dt>Estimate</dt>
                  <dd>{fmtCost(sel.est)}</dd>
                </div>
                {sel.act && (
                  <div>
                    <dt>Actual</dt>
                    <dd>{actualText(sel.act)}</dd>
                  </div>
                )}
                {sel.act && sel.act.loops > 0 && (
                  <div>
                    <dt>Self time</dt>
                    <dd>
                      {msText(sel.act.self)} ms · {Math.round((sel.act.self / totalSelf) * 100)}% of
                      the run
                    </dd>
                  </div>
                )}
                {misestimate(sel) && (
                  <div>
                    <dt>Rows</dt>
                    <dd>
                      {misestimate(sel)!.dir}-estimated ×{misestimate(sel)!.f}
                    </dd>
                  </div>
                )}
                {detailLines(sel).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className={s.timing}>
              <span>
                Planning <b>{result.planning.toFixed(3)}</b> ms
              </span>
              {result.analyzed && (
                <span>
                  Execution <b>{result.execution.toFixed(3)}</b> ms
                </span>
              )}
              <span className={s.muted}>rows real · costs modelled · times simulated</span>
            </p>
          )}
        </div>
      )}
      <p className={s.sr} aria-live="polite">
        {result.ok && result.kind === 'select'
          ? `Plan: ${nodes.length} operators, ${clientRows} rows to the client.`
          : ''}
      </p>
    </section>
  );
}
