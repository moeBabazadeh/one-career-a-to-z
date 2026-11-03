'use client';

// The roadmap: roles (cycles), products (projects), degrees, robots and fixes over the real
// years, from the year he started to the facts' date. Bars span what db dates; one-off events are
// milestones; anything db has no dates for sits at the bottom, undated, not guessed.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { db, fmt, NOW } from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import { CYCLES, ISSUES, PROJECTS, PROJECT_STATUS, team } from './model';
import { onlyFilter, openIssue, openProject, setView } from './store';
import { Icon, ProjectMark, cx, type Vars } from './kit';
import s from './tracker.module.scss';

const T0 = db.person.since;
const T1 = Math.floor(NOW) + 1;
const YEARS = Array.from({ length: T1 - T0 }, (_, i) => T0 + i);
const ZOOMS = [36, 64, 112, 200];

interface Bar {
  from: number;
  to: number;
  text: string;
  tone: string;
  open?: boolean;
  /** Later titles within a role. */
  ticks?: { at: number; text: string }[];
}

interface Mark {
  at: number;
  text: string;
}

interface Line {
  key: string;
  name: string;
  sub?: string;
  icon?: ReactNode;
  bar?: Bar;
  marks?: Mark[];
  onOpen: () => void;
  undated?: boolean;
}

const yearOnly = (d: { m?: number }) => !d.m;

function sections(): { title: string; lines: Line[] }[] {
  const cycles: Line[] = [...CYCLES].reverse().map((c) => ({
    key: `c-${c.id}`,
    name: c.org,
    sub: `Cycle ${c.n} · ${c.title}`,
    icon: <Icon name="cycles" size={14} />,
    bar: {
      from: fmt.frac(c.from),
      to: c.to ? fmt.frac(c.to) : NOW,
      text: `${fmt.mon(c.from)} – ${c.to ? fmt.mon(c.to) : 'now'}`,
      tone: c.current ? 'var(--accent)' : 'var(--bar-past)',
      open: c.current,
      ticks: c.role.steps
        .slice(1)
        .map((st) => ({ at: fmt.frac(st.from), text: `${st.title}, ${fmt.mon(st.from)}` })),
    },
    onOpen: () => {
      onlyFilter('cycle', c.id);
      setView('list');
    },
  }));

  const projects: Line[] = PROJECTS.filter((p) => p.start)
    .sort((a, b) => fmt.frac(b.start!) - fmt.frac(a.start!))
    .map((p) => {
      const start = p.start!;
      const from = yearOnly(start) ? start.y : fmt.frac(start);
      const to = p.status === 'progress' ? NOW : (p.last ?? start).y + 1;
      return {
        key: `p-${p.id}`,
        name: p.name,
        sub: PROJECT_STATUS[p.status],
        icon: <ProjectMark id={p.id} />,
        bar: {
          from,
          to: Math.min(to, NOW),
          text: p.last ? `${start.y}–${p.last.y}` : fmt.mon(start),
          tone: p.color,
          open: p.status === 'progress',
        },
        onOpen: () => openProject(p.id),
      };
    });

  const res = ISSUES.filter((i) => i.team === 'res' && i.start);
  const roots: Line[] = res.map((i) => ({
    key: `r-${i.id}`,
    name: i.title,
    sub: i.id,
    icon: <span className={s.rmTeam} style={{ '--c': team('res').color } as Vars} />,
    ...(i.end
      ? {
          bar: {
            from: fmt.frac(i.start!),
            to: fmt.frac(i.end),
            text: fmt.yearSpan(i.start!, i.end),
            tone: 'var(--bar-res)',
          },
        }
      : { marks: [{ at: fmt.frac(i.start!), text: fmt.mon(i.start!) }] }),
    onOpen: () => openIssue(i.id),
  }));

  const oss: Line[] = ISSUES.filter((i) => i.team === 'oss' && i.start)
    .reverse()
    .map((i) => ({
      key: `o-${i.id}`,
      name: i.links[0]?.label ?? i.title,
      sub: i.title,
      icon: <Icon name="pr" size={14} />,
      marks: [{ at: fmt.frac(i.start!), text: String(i.start!.y) }],
      onOpen: () => openIssue(i.id),
    }));

  const undatedProjects = PROJECTS.filter((p) => !p.start).map((p) => ({
    key: `u-${p.id}`,
    name: p.name,
    sub: PROJECT_STATUS[p.status],
    icon: <ProjectMark id={p.id} />,
    undated: true,
    onOpen: () => openProject(p.id),
  }));
  const undatedIssues = ISSUES.filter((i) => i.team === 'res' && !i.start).map((i) => ({
    key: `u-${i.id}`,
    name: i.title,
    sub: i.id,
    icon: <span className={s.rmTeam} style={{ '--c': team('res').color } as Vars} />,
    undated: true,
    onOpen: () => openIssue(i.id),
  }));

  return [
    { title: 'Cycles', lines: cycles },
    { title: 'Projects', lines: projects },
    { title: 'Research', lines: roots },
    { title: 'Open source', lines: oss },
    { title: 'Undated', lines: [...undatedProjects, ...undatedIssues] },
  ];
}

const SECTIONS = sections();

export default function Roadmap() {
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<number | null>(null);
  const reduced = useReducedMotion();
  const px = ZOOMS[zoom];
  const x = (t: number) => (t - T0) * px;
  const width = (T1 - T0) * px;

  // Open on the recent end, where "now" is.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // Zooming keeps the year at the centre where it was.
  useLayoutEffect(() => {
    const el = scroller.current;
    const t = anchor.current;
    if (!el || t === null) return;
    const label = el.querySelector<HTMLElement>('[data-rm-label]')?.offsetWidth ?? 0;
    el.scrollLeft = (t - T0) * px - (el.clientWidth - label) / 2;
    anchor.current = null;
  }, [px]);

  const zoomTo = (z: number) => {
    const el = scroller.current;
    const next = Math.max(0, Math.min(ZOOMS.length - 1, z));
    if (next === zoom) return;
    if (el) {
      const label = el.querySelector<HTMLElement>('[data-rm-label]')?.offsetWidth ?? 0;
      anchor.current = T0 + (el.scrollLeft + (el.clientWidth - label) / 2) / px;
    }
    setZoom(next);
  };

  const today = () => {
    const el = scroller.current;
    if (el)
      el.scrollTo({ left: x(NOW) - el.clientWidth / 2, behavior: reduced ? 'auto' : 'smooth' });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') zoomTo(zoom + 1);
    else if (e.key === '-' || e.key === '_') zoomTo(zoom - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className={s.roadmap} style={{ '--px': `${px}px`, '--track': `${width}px` } as Vars}>
      <div className={s.rmTools}>
        <span className={s.rmSpan}>
          {T0}–{fmt.mon(db.asOf)}
        </span>
        <span className={s.grow} />
        <span className={s.legend}>
          <i className={s.legendBar} /> span
          <i className={s.legendDiamond} /> milestone
        </span>
        <button type="button" className={s.btn} onClick={today}>
          <Icon name="today" size={14} /> Now
        </button>
        <div className={s.segmented} role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => zoomTo(zoom - 1)}
            disabled={zoom === 0}
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <Icon name="zoomOut" size={14} />
          </button>
          <button
            type="button"
            onClick={() => zoomTo(zoom + 1)}
            disabled={zoom === ZOOMS.length - 1}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <Icon name="zoomIn" size={14} />
          </button>
        </div>
      </div>
      <div
        className={s.rmScroll}
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKey}
        aria-label="Timeline, scrolls sideways. Plus and minus zoom."
      >
        <div className={s.rmGrid}>
          <div className={cx(s.rmLabel, s.rmCorner)} data-rm-label>
            Timeline
          </div>
          <div className={s.rmAxis} aria-hidden="true">
            {YEARS.map((y) => (
              <span
                key={y}
                className={s.rmYear}
                style={{ left: x(y) }}
                data-major={y % 5 === 0 || undefined}
              >
                {px >= 56 || y % 2 === 0 ? y : ''}
              </span>
            ))}
            <span className={s.rmNowTag} style={{ left: x(NOW) }}>
              Now
            </span>
          </div>
          <div className={s.rmGridLines} aria-hidden="true">
            {YEARS.map((y) => (
              <i key={y} style={{ left: x(y) }} data-major={y % 5 === 0 || undefined} />
            ))}
            <b style={{ left: x(NOW) }} />
          </div>
          {SECTIONS.map((sec) => (
            <Section key={sec.title} title={sec.title} lines={sec.lines} x={x} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({ title, lines, x }: { title: string; lines: Line[]; x: (t: number) => number }) {
  return (
    <>
      <div className={cx(s.rmLabel, s.rmSection)}>
        {title} <span className={s.count}>{lines.length}</span>
      </div>
      <div className={s.rmSectionTrack} />
      {lines.map((l) => (
        <RoadmapLine key={l.key} line={l} x={x} />
      ))}
    </>
  );
}

/** Roughly how wide a bar's label draws, to decide whether it fits inside the bar. */
const textWidth = (t: string) => t.length * 6.6 + 18;

function RoadmapLine({ line, x }: { line: Line; x: (t: number) => number }) {
  const b = line.bar;
  const w = b ? Math.max(6, x(b.to) - x(b.from)) : 0;
  const inside = b ? w >= textWidth(b.text) : true;
  // Too narrow: the label sits beside the bar, after it if there's room before now, else before it.
  const after = b ? x(b.to) + textWidth(b.text) + 8 < x(T1) : true;
  return (
    <>
      <div className={s.rmLabel}>
        <button
          type="button"
          className={s.rmName}
          onClick={line.onOpen}
          title={line.sub ? `${line.name} · ${line.sub}` : line.name}
        >
          {line.icon}
          <span>
            <b>{line.name}</b>
            {line.sub && <small>{line.sub}</small>}
          </span>
        </button>
      </div>
      <div className={s.rmTrack}>
        {b && (
          <button
            type="button"
            className={s.rmBar}
            data-open={b.open || undefined}
            style={{ left: x(b.from), width: w, '--tone': b.tone } as Vars}
            onClick={line.onOpen}
            title={`${line.name}: ${b.text}`}
            tabIndex={-1}
          >
            {inside && <span>{b.text}</span>}
            {b.ticks?.map((t) => (
              <i
                key={t.at}
                className={s.rmTick}
                style={{ left: x(t.at) - x(b.from) }}
                title={t.text}
              />
            ))}
          </button>
        )}
        {b && !inside && (
          <span
            className={s.rmOutside}
            style={
              after
                ? { left: x(b.to) + 6 }
                : { left: x(b.from) - 6, transform: 'translateX(-100%)' }
            }
            aria-hidden="true"
          >
            {b.text}
          </span>
        )}
        {line.marks?.map((m) => (
          <button
            key={m.at}
            type="button"
            className={s.rmMark}
            style={{ left: x(m.at) }}
            onClick={line.onOpen}
            title={`${line.name}: ${m.text}`}
            tabIndex={-1}
          >
            <i />
            <span>{m.text}</span>
          </button>
        ))}
        {line.undated && <span className={s.rmUndated}>No dates on record</span>}
      </div>
    </>
  );
}
