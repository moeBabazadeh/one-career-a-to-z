'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { profile } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import { CV_FILE } from './model';
import { JOBS, job as jobDef, type JobDef } from './workflow';
import {
  ANNOTATIONS,
  SPEED,
  duration,
  logsFor,
  statusAt,
  type JobTiming,
  type Schedule,
  type Status,
} from './ci';
import {
  autoRun,
  headCommit,
  isRunning,
  runSchedule,
  selectJob,
  startRun,
  usePR,
  type State,
} from './store';
import { Icon, StatusIcon, STATUS_TEXT, cx, type Vars } from './ui';
import s from './pr.module.scss';

/* ------------------------------------------------------------------ the clock */

/** performance.now(), every animation frame while `active`. */
export function useClock(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = requestAnimationFrame(function tick(t) {
      setNow(t);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return now;
}

/** Simulated seconds into the run on screen; past the end when nothing is playing. */
export function runTime(pr: State, now: number, sched: Schedule) {
  if (!pr.run || pr.run.done) return sched.total + 1;
  return Math.max(0, ((now - pr.run.started) / 1000) * SPEED);
}

export function useRun(active = true) {
  const pr = usePR();
  const running = isRunning(pr);
  const now = useClock(active && running);
  const { n, sched } = useMemo(() => runSchedule(pr), [pr]);
  const at = runTime(pr, now, sched);
  const status = (id: string): Status => statusAt(sched.jobs.get(id) as JobTiming, at);
  const done = JOBS.filter((j) => status(j.id) === 'success').length;
  return { pr, n, sched, at, status, done, running: running && at < sched.total };
}

/* ------------------------------------------------------------------ graph layout */

// Columns, left to right: setup, verify, package and the merge gate. Positions are in px.
const W = 940;
const NODE_H = 44;
const ROW = 56;
const TOP = 34;
const COLS = [
  { x: 0, w: 168 },
  { x: 236, w: 210 },
  { x: 520, w: 206 },
  { x: 776, w: 164 },
];
const MATRIX_ROW = 30;
const VERIFY = ['build', 'typecheck', 'test', 'security'];
const FIRMWARE = JOBS.filter((j) => j.device);
const MATRIX_Y = TOP + VERIFY.length * ROW;
const MATRIX_H = NODE_H + FIRMWARE.length * MATRIX_ROW + 8;
const H = MATRIX_Y + MATRIX_H + 8;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BOX: Record<string, Box> = {
  setup: { ...COLS[0], y: TOP + 2 * ROW - NODE_H / 2 + 10, h: NODE_H },
  ...Object.fromEntries(VERIFY.map((id, i) => [id, { ...COLS[1], y: TOP + i * ROW, h: NODE_H }])),
  firmware: { ...COLS[1], y: MATRIX_Y, h: MATRIX_H },
  ios: { ...COLS[2], y: TOP + 0.5 * ROW, h: NODE_H },
  android: { ...COLS[2], y: TOP + 1.5 * ROW, h: NODE_H },
  preview: { ...COLS[2], y: TOP + 2.6 * ROW, h: NODE_H },
  gate: { ...COLS[3], y: TOP + 1.9 * ROW, h: NODE_H + 18 },
};

const port = (id: string) => {
  const b = BOX[id];
  return { inX: b.x, outX: b.x + b.w, y: b.y + NODE_H / 2 + (id === 'gate' ? 9 : 0) };
};

/** An edge that runs along a vertical bus with rounded corners, the way CI graphs draw them. */
function route(x1: number, y1: number, x2: number, y2: number, bx: number) {
  if (Math.abs(y2 - y1) < 1) return `M${x1},${y1} H${x2}`;
  const r = Math.min(9, Math.abs(y2 - y1) / 2);
  const d = y2 > y1 ? 1 : -1;
  return `M${x1},${y1} H${bx - r} Q${bx},${y1} ${bx},${y1 + d * r} V${y2 - d * r} Q${bx},${y2} ${bx + r},${y2} H${x2}`;
}

const nodeOf = (id: string) => (id.startsWith('firmware-') ? 'firmware' : id);
const busX = (fromCol: number) => (COLS[fromCol].x + COLS[fromCol].w + COLS[fromCol + 1].x) / 2;

interface Edge {
  key: string;
  d: string;
  from: string[];
  to: string[];
}

const EDGES: Edge[] = (() => {
  const out: Edge[] = [];
  const seen = new Set<string>();
  for (const j of JOBS) {
    for (const need of j.needs) {
      const a = nodeOf(need);
      const b = nodeOf(j.id);
      const key = `${a}>${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pa = port(a);
      const pb = port(b);
      const fromCol = jobDef(need).stage;
      out.push({
        key,
        d: route(pa.outX, pa.y, pb.inX, pb.y, busX(fromCol)),
        from: a === 'firmware' ? FIRMWARE.map((f) => f.id) : [need],
        to: b === 'firmware' ? FIRMWARE.map((f) => f.id) : [j.id],
      });
    }
  }
  // Everything that nothing else needs feeds the merge gate.
  const leaves = ['ios', 'android', 'preview', 'firmware'];
  for (const a of leaves) {
    const pa = port(a);
    const pb = port('gate');
    const bx = a === 'firmware' ? busX(2) : busX(2);
    out.push({
      key: `${a}>gate`,
      d: route(pa.outX, pa.y, pb.inX, pb.y, bx),
      from: a === 'firmware' ? FIRMWARE.map((f) => f.id) : [a],
      to: ['gate'],
    });
  }
  return out;
})();

const STAGES = [
  { label: 'setup', col: 0 },
  { label: 'verify', col: 1 },
  { label: 'package', col: 2 },
  { label: 'merge', col: 3 },
];

/* ------------------------------------------------------------------ pieces */

function Node({
  j,
  status,
  timing,
  at,
  selected,
  onSelect,
  compact = false,
}: {
  j: JobDef;
  status: Status;
  timing: JobTiming;
  at: number;
  selected: boolean;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const elapsed = status === 'running' ? at - timing.start : timing.end - timing.start;
  const progress =
    status === 'running'
      ? (at - timing.start) / (timing.end - timing.start)
      : status === 'success'
        ? 1
        : 0;
  const label = j.device ? j.device.tag : j.name;
  return (
    <button
      type="button"
      className={cx(compact ? s.mJob : s.job)}
      data-status={status}
      aria-pressed={selected}
      onClick={() => onSelect(j.id)}
      aria-label={`${j.name}: ${STATUS_TEXT[status]}${status === 'queued' ? '' : `, ${duration(elapsed)}`}. Show its log.`}
      style={{ '--p': progress.toFixed(3) } as Vars}
    >
      <StatusIcon status={status} size={compact ? 14 : 16} />
      <span className={s.jobName}>{label}</span>
      {j.device && <span className={s.jobKind}>{j.device.kind.split(' ')[0]}</span>}
      <span className={s.jobTime}>{status === 'queued' ? '—' : duration(elapsed)}</span>
      {!compact && <span className={s.jobBar} aria-hidden="true" />}
    </button>
  );
}

/* ------------------------------------------------------------------ the log viewer */

function LogView({
  id,
  at,
  sched,
  head,
  headSubject,
  follow,
  setFollow,
}: {
  id: string;
  at: number;
  sched: Schedule;
  head: string;
  headSubject: string;
  follow: boolean;
  setFollow: (on: boolean) => void;
}) {
  const j = jobDef(id);
  const steps = logsFor(head, headSubject).get(id) ?? [];
  const timing = sched.jobs.get(id) as JobTiming;
  const status = statusAt(timing, at);
  const [closed, setClosed] = useState<Record<string, boolean>>({ 'Set up job': true });
  const [query, setQuery] = useState('');
  const [stamps, setStamps] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const q = query.trim().toLowerCase();

  const shown = steps.map((step, i) => {
    const t = timing.steps[i];
    const lines = step.lines
      .map((l, k) => ({ ...l, t: t.lines[k], n: k + 1 }))
      .filter((l) => l.t <= at);
    return { step, t, lines, status: statusAt(t, at) };
  });
  const visibleCount = shown.reduce((n, x) => n + x.lines.length, 0);

  // Follow the log down as it streams, unless the reader has scrolled up.
  useEffect(() => {
    const el = body.current;
    if (el && stick.current && status === 'running') el.scrollTop = el.scrollHeight;
  }, [visibleCount, status]);

  const text = shown
    .map((x) => [`## ${x.step.name}`, ...x.lines.map((l) => l.text)].join('\n'))
    .join('\n');
  const matches = q
    ? shown.reduce((n, x) => n + x.lines.filter((l) => l.text.toLowerCase().includes(q)).length, 0)
    : 0;

  return (
    <section className={s.logPanel} aria-label={`Log for ${j.name}`}>
      <header className={s.logHead}>
        <StatusIcon status={status} />
        <div className={s.logTitle}>
          <b>{j.name}</b>
          <span>
            {status === 'queued'
              ? 'Waiting for ' + j.needs.join(', ')
              : status === 'running'
                ? `Running for ${duration(at - timing.start)}`
                : `Succeeded in ${duration(timing.end - timing.start)}`}
          </span>
        </div>
        <span className={s.barSpacer} />
        <label className={s.logSearch}>
          <span className={s.sr}>Search this log</span>
          <input
            type="search"
            placeholder="Search logs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q && <span className={s.logMatches}>{matches}</span>}
        </label>
        <button
          type="button"
          className={s.logTool}
          aria-pressed={stamps}
          onClick={() => setStamps(!stamps)}
          title="Show timestamps"
        >
          <span aria-hidden="true">⏱</span>
          <span className={s.sr}>Show timestamps</span>
        </button>
        <button
          type="button"
          className={s.logTool}
          aria-pressed={follow}
          onClick={() => setFollow(!follow)}
          title="Follow the running job"
        >
          Follow
        </button>
        <button
          type="button"
          className={s.logTool}
          onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}
          title="Copy this log"
          aria-label="Copy this log"
        >
          <Icon.copy />
        </button>
      </header>
      <div
        ref={body}
        className={s.logBody}
        tabIndex={0}
        aria-label={`${j.name} log`}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {shown.map(({ step, t, lines, status: st }, i) => {
          const key = step.name;
          const isClosed = closed[key] ?? false;
          if (st === 'queued') return null;
          return (
            <div key={`${i}-${key}`} className={s.step} data-status={st}>
              <button
                type="button"
                className={s.stepHead}
                aria-expanded={!isClosed}
                onClick={() => setClosed({ ...closed, [key]: !isClosed })}
              >
                <span className={s.chev} data-open={!isClosed || undefined}>
                  <Icon.chevron />
                </span>
                <StatusIcon status={st} size={14} />
                <span className={s.stepName}>{step.name}</span>
                <span className={s.stepTime}>
                  {st === 'running' ? duration(at - t.start) : duration(t.end - t.start)}
                </span>
              </button>
              {!isClosed && (
                <ol className={s.lines}>
                  {lines.map((l, k) => {
                    const hit = q && l.text.toLowerCase().includes(q);
                    const last = st === 'running' && k === lines.length - 1;
                    return (
                      <li
                        key={k}
                        className={s.logLine}
                        data-kind={l.kind}
                        data-hit={hit || undefined}
                        data-dim={(q && !hit) || undefined}
                      >
                        <span className={s.ln}>{l.n}</span>
                        {stamps && <span className={s.ts}>{stamp(l.t)}</span>}
                        <span className={s.txt}>
                          {l.href ? (
                            <a href={l.href} target="_blank" rel="noreferrer">
                              {l.text}
                            </a>
                          ) : (
                            l.text || ' '
                          )}
                          {last && <span className={s.caret} aria-hidden="true" />}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
        {status === 'queued' && (
          <p className={s.logWaiting}>This job is waiting for {j.needs.join(', ')} to finish.</p>
        )}
      </div>
    </section>
  );
}

/** Simulated wall-clock offsets, hh:mm:ss.cc from the start of the run. */
function stamp(t: number) {
  const cs = Math.round(t * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs / 6000) % 60);
  const sec = Math.floor((cs / 100) % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ the tab */

export default function Checks({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const { pr, n, sched, at, status, done, running } = useRun(active);
  const [follow, setFollow] = useState(true);
  const head = headCommit(pr);
  const allDone = done === JOBS.length;

  useEffect(() => {
    if (active) autoRun();
  }, [active]);

  // While following, show the job that started most recently and is still running.
  const followed =
    follow && running
      ? (JOBS.filter((j) => status(j.id) === 'running').sort(
          (a, b) => (sched.jobs.get(b.id)?.start ?? 0) - (sched.jobs.get(a.id)?.start ?? 0),
        )[0]?.id ?? null)
      : null;
  const shownJob = followed ?? pr.job;

  const pick = (id: string) => {
    setFollow(false);
    selectJob(id);
  };

  const gateStatus: Status = allDone ? 'success' : done > 0 || running ? 'running' : 'queued';
  const trigger = pr.run
    ? pr.run.trigger === 'push'
      ? `Pushed by you · ${head.short}`
      : 'Re-run by you'
    : 'Opened by moe';
  const elapsed = Math.min(at, sched.total);
  const annotations = ANNOTATIONS.filter((a) => status(a.job) === 'success');
  const edgeState = (e: Edge) => {
    const fromDone = e.from.every((id) => status(id) === 'success');
    const toStatus =
      e.to[0] === 'gate'
        ? gateStatus
        : e.to.every((id) => status(id) === 'success')
          ? 'success'
          : e.to.some((id) => status(id) === 'running')
            ? 'running'
            : 'queued';
    return toStatus === 'success' && fromDone
      ? 'done'
      : fromDone && toStatus === 'running'
        ? 'flow'
        : fromDone
          ? 'ready'
          : 'idle';
  };

  const byStage = (stage: number) => JOBS.filter((j) => j.stage === stage && !j.device);

  return (
    <div className={s.checksTab}>
      <aside className={s.jobList} aria-label="Jobs">
        <p className={s.sideTitle}>
          <Icon.checks /> review
        </p>
        <ul>
          {JOBS.map((j) => {
            const st = status(j.id);
            const t = sched.jobs.get(j.id) as JobTiming;
            return (
              <li key={j.id}>
                <button
                  type="button"
                  aria-current={shownJob === j.id ? 'true' : undefined}
                  onClick={() => pick(j.id)}
                >
                  <StatusIcon status={st} size={14} />
                  <span>{j.name}</span>
                  <span className={s.jobListTime}>
                    {st === 'queued'
                      ? ''
                      : duration(st === 'running' ? at - t.start : t.end - t.start)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className={s.sideNote}>
          Simulated runner at {SPEED}× speed. The checks themselves run on this page’s data.
        </p>
      </aside>

      <div className={s.checksMain}>
        <section className={s.runCard} aria-label="Workflow run">
          <header className={s.runHead}>
            <div className={s.runTitle}>
              <StatusIcon status={allDone ? 'success' : running ? 'running' : 'queued'} size={22} />
              <div>
                <h2>
                  review <span className={s.muted}>· run #{n}</span>
                </h2>
                <p>
                  {trigger} · <code>{head.short}</code> on <code>moe/cto</code>
                </p>
              </div>
            </div>
            <dl className={s.runStats}>
              <div>
                <dt>Status</dt>
                <dd>{allDone ? 'Success' : running ? 'In progress' : 'Queued'}</dd>
              </div>
              <div>
                <dt>Total duration</dt>
                <dd>{duration(elapsed)}</dd>
              </div>
              <div>
                <dt>Billable time</dt>
                <dd title="It runs in your browser">0s</dd>
              </div>
              <div>
                <dt>Artifacts</dt>
                <dd>
                  {status('build') === 'success' ? (
                    <a href={profile.cv} target="_blank" rel="noreferrer" className={s.artifact}>
                      <Icon.download /> {CV_FILE}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className={cx(s.btn, s.rerun)}
              onClick={() => startRun('rerun')}
              disabled={running}
            >
              <Icon.refresh /> {running ? 'Running…' : 'Re-run all jobs'}
            </button>
          </header>

          <div className={s.runProgress} aria-hidden="true">
            <span style={{ width: `${(done / JOBS.length) * 100}%` }} />
          </div>
          <p className={s.sr} aria-live="polite">
            {allDone
              ? `Run ${n}: all ${JOBS.length} checks passed.`
              : running
                ? `Run ${n} in progress.`
                : ''}
          </p>

          <div className={s.graphScroll}>
            <div
              className={s.graph}
              style={{ '--gw': `${W}px`, '--gh': `${H}px` } as Vars}
              data-reduced={reduced || undefined}
            >
              <svg
                className={s.edges}
                viewBox={`0 0 ${W} ${H}`}
                width={W}
                height={H}
                aria-hidden="true"
              >
                {EDGES.map((e) => (
                  <path key={e.key} d={e.d} className={s.edge} data-state={edgeState(e)} />
                ))}
              </svg>
              {STAGES.map((st, i) => (
                <div
                  key={st.label}
                  className={s.stage}
                  style={{ '--x': `${COLS[st.col].x}px`, '--w': `${COLS[st.col].w}px` } as Vars}
                >
                  <p className={s.stageLabel}>
                    <span>{i + 1}</span> {st.label}
                  </p>
                  {st.col < 3 &&
                    byStage(st.col).map((j) => {
                      const b = BOX[j.id];
                      return (
                        <div
                          key={j.id}
                          className={s.slot}
                          style={
                            { '--x': `${b.x}px`, '--y': `${b.y}px`, '--w': `${b.w}px` } as Vars
                          }
                        >
                          <Node
                            j={j}
                            status={status(j.id)}
                            timing={sched.jobs.get(j.id) as JobTiming}
                            at={at}
                            selected={shownJob === j.id}
                            onSelect={pick}
                          />
                        </div>
                      );
                    })}
                  {st.col === 1 && (
                    <div
                      className={cx(s.slot, s.matrix)}
                      style={
                        {
                          '--x': `${BOX.firmware.x}px`,
                          '--y': `${BOX.firmware.y}px`,
                          '--w': `${BOX.firmware.w}px`,
                        } as Vars
                      }
                    >
                      <p className={s.matrixHead}>
                        <StatusIcon
                          status={
                            FIRMWARE.every((f) => status(f.id) === 'success')
                              ? 'success'
                              : FIRMWARE.some((f) => status(f.id) !== 'queued')
                                ? 'running'
                                : 'queued'
                          }
                        />
                        <b>firmware</b>
                        <span>{FIRMWARE.length} devices</span>
                      </p>
                      {FIRMWARE.map((j) => (
                        <Node
                          key={j.id}
                          j={j}
                          compact
                          status={status(j.id)}
                          timing={sched.jobs.get(j.id) as JobTiming}
                          at={at}
                          selected={shownJob === j.id}
                          onSelect={pick}
                        />
                      ))}
                    </div>
                  )}
                  {st.col === 3 && (
                    <div
                      className={cx(s.slot, s.gate)}
                      data-status={gateStatus}
                      style={
                        {
                          '--x': `${BOX.gate.x}px`,
                          '--y': `${BOX.gate.y}px`,
                          '--w': `${BOX.gate.w}px`,
                        } as Vars
                      }
                    >
                      <StatusIcon status={gateStatus} />
                      <b>merge-ready</b>
                      <span>
                        {done} / {JOBS.length} checks
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {annotations.length > 0 && (
          <section className={s.annotations} aria-label="Annotations">
            <h3>
              Annotations <span className={s.count}>{annotations.length}</span>
            </h3>
            <ul>
              {annotations.map((a) => (
                <li key={a.title} data-level={a.level}>
                  {a.level === 'warning' ? <Icon.alert /> : <Icon.info />}
                  <div>
                    <p className={s.annTitle}>
                      <b>{a.title}</b>
                      <button type="button" onClick={() => pick(a.job)}>
                        {jobDef(a.job).name}
                      </button>
                    </p>
                    <p>
                      {a.text}
                      {a.href && (
                        <>
                          {' '}
                          <a href={a.href} target="_blank" rel="noreferrer">
                            View the pull request <Icon.out />
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <LogView
          id={shownJob}
          at={at}
          sched={sched}
          head={head.short}
          headSubject={head.header}
          follow={follow && running}
          setFollow={setFollow}
        />
      </div>
    </div>
  );
}
