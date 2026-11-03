'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CATALOG, TABLES } from './sql/catalog';
import type { Table } from './sql/types';
import { revealWorkbench, runText } from './store';
import s from './query.module.scss';

const TW = 220;
const HEAD = 34;
const ROW = 21;
const W = 1224;
const H = 752;

// Where each table sits, in four columns: who he is, where he worked, what he built, and how.
const POS: Record<string, [number, number]> = {
  profile: [20, 20],
  roots: [20, 300],
  skills: [20, 475],
  facts: [20, 587],
  orgs: [330, 20],
  roles: [330, 175],
  duties: [330, 400],
  messages: [330, 560],
  projects: [640, 20],
  project_tech: [950, 20],
  tech: [950, 140],
  devices: [950, 260],
  contributions: [950, 480],
};

// How each foreign key is routed: which side it leaves and enters, and its vertical lane.
const ROUTES: Record<string, { exit: 'l' | 'r'; enter: 'l' | 'r'; lane: number }> = {
  'profile.company_id': { exit: 'r', enter: 'l', lane: 284 },
  'roles.org_id': { exit: 'l', enter: 'l', lane: 312 },
  'duties.org_id': { exit: 'l', enter: 'l', lane: 300 },
  'projects.org_id': { exit: 'l', enter: 'r', lane: 596 },
  'projects.parent_id': { exit: 'r', enter: 'r', lane: 880 },
  'project_tech.project_id': { exit: 'l', enter: 'r', lane: 904 },
  'project_tech.tech_id': { exit: 'r', enter: 'r', lane: 1194 },
  'devices.project_id': { exit: 'l', enter: 'r', lane: 928 },
  'contributions.project_id': { exit: 'l', enter: 'r', lane: 916 },
};

const NARROW = '(max-width: 720px)';
const subscribeNarrow = (fn: () => void) => {
  const q = matchMedia(NARROW);
  q.addEventListener('change', fn);
  return () => q.removeEventListener('change', fn);
};
/** Phones open the diagram zoomed out, so more than one table is in view. */
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

const heightOf = (t: Table) => HEAD + t.columns.length * ROW + 8;
const rowY = (t: Table, i: number) => POS[t.name][1] + HEAD + i * ROW + ROW / 2 + 2;

interface Rel {
  key: string;
  child: string;
  parent: string;
  d: string;
  marks: string;
  nullable: boolean;
}

/** An orthogonal path with rounded corners. */
function ortho(pts: [number, number][], r = 7) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const k1 = Math.min(r, Math.hypot(x - px, y - py) / 2);
    const k2 = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
    const ax = x - Math.sign(x - px) * k1;
    const ay = y - Math.sign(y - py) * k1;
    const bx = x + Math.sign(nx - x) * k2;
    const by = y + Math.sign(ny - y) * k2;
    d += `L${ax} ${ay}Q${x} ${y} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1];
  return `${d}L${last[0]} ${last[1]}`;
}

function relations(): Rel[] {
  const out: Rel[] = [];
  for (const t of TABLES) {
    t.columns.forEach((c, i) => {
      if (!c.fk) return;
      const key = `${t.name}.${c.name}`;
      const route = ROUTES[key];
      const parent = CATALOG.get(c.fk.table)!;
      if (!route) return;
      const pi = parent.columns.findIndex((x) => x.name === c.fk!.column);
      const cx = route.exit === 'l' ? POS[t.name][0] : POS[t.name][0] + TW;
      const px = route.enter === 'l' ? POS[parent.name][0] : POS[parent.name][0] + TW;
      const cy = rowY(t, i);
      const py = rowY(parent, pi);
      const pts: [number, number][] =
        cy === py && route.exit !== route.enter
          ? [
              [cx, cy],
              [px, py],
            ]
          : [
              [cx, cy],
              [route.lane, cy],
              [route.lane, py],
              [px, py],
            ];
      // many (crow's foot, with "zero or" circle) at the child; one at the parent
      const d1 = Math.sign(route.lane - cx) || (route.exit === 'l' ? -1 : 1);
      const e = route.enter === 'l' ? -1 : 1; // outward direction from the parent edge
      let marks = `M${cx + d1 * 12} ${cy}L${cx} ${cy - 5}M${cx + d1 * 12} ${cy}L${cx} ${cy + 5}`;
      marks += `M${px + e * 6} ${py - 5}V${py + 5}`;
      if (c.notNull) marks += `M${px + e * 10} ${py - 5}V${py + 5}`;
      out.push({
        key,
        child: t.name,
        parent: parent.name,
        d: ortho(pts),
        marks,
        nullable: !c.notNull,
      });
    });
  }
  return out;
}

const RELS = relations();

export default function Erd() {
  const narrow = useNarrow();
  const [picked, setZoom] = useState<number | null>(null);
  const zoom = picked ?? (narrow ? 0.72 : 1);
  const [active, setActive] = useState<string | null>(null);
  const view = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; a plain wheel still scrolls the page.
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) =>
        Math.max(
          0.5,
          Math.min(
            1.6,
            +(
              (z ?? (matchMedia(NARROW).matches ? 0.72 : 1)) * (e.deltaY > 0 ? 0.92 : 1.08)
            ).toFixed(3),
          ),
        ),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const query = (name: string) => {
    runText(`SELECT *\nFROM ${name}\nLIMIT 50;`);
    revealWorkbench();
  };

  const fit = () => {
    const el = view.current;
    if (el) setZoom(Math.max(0.5, Math.min(1.6, +((el.clientWidth - 8) / W).toFixed(3))));
  };

  const related = (name: string) => RELS.filter((r) => r.child === name || r.parent === name);
  const lit = active ? new Set(related(active).flatMap((r) => [r.child, r.parent])) : null;

  return (
    <div className={s.erd}>
      <div className={s.erdBar}>
        <div className={s.legend} aria-hidden="true">
          <span>
            <svg viewBox="0 0 16 16" className={s.keyIcon} data-kind="pk">
              <circle cx="5.5" cy="8" r="3" />
              <path d="M8.5 8H14M12 8v2.5M14 8v2" />
            </svg>
            primary key
          </span>
          <span>
            <svg viewBox="0 0 16 16" className={s.keyIcon} data-kind="fk">
              <path d="M6.5 9.5l3-3M5 7.5L3.6 8.9a2.1 2.1 0 0 0 3 3L8 10.5M11 8.5l1.4-1.4a2.1 2.1 0 0 0-3-3L8 5.5" />
            </svg>
            foreign key
          </span>
          <span>
            <svg viewBox="0 0 30 12" className={s.crow}>
              <path d="M2 6H28M28 6L16 1M28 6L16 11M6 1V11M10 1V11" />
            </svg>
            one to many
          </span>
        </div>
        <div className={s.zoom} role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => setZoom(Math.max(0.5, +(zoom - 0.1).toFixed(2)))}
            aria-label="Zoom out"
          >
            −
          </button>
          <output aria-live="polite">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            onClick={() => setZoom(Math.min(1.6, +(zoom + 0.1).toFixed(2)))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" onClick={fit}>
            Fit
          </button>
        </div>
      </div>
      <div
        ref={view}
        className={s.erdView}
        tabIndex={0}
        role="region"
        aria-label="Entity-relationship diagram. Drag or scroll to pan, Ctrl or Command and the wheel to zoom."
        onPointerDown={(e) => {
          if (
            e.pointerType !== 'mouse' ||
            e.button !== 0 ||
            (e.target as Element).closest('[data-table]')
          )
            return;
          const el = e.currentTarget;
          drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          el.setPointerCapture(e.pointerId);
          el.dataset.dragging = '';
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
          e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
        }}
        onPointerUp={(e) => {
          drag.current = null;
          delete e.currentTarget.dataset.dragging;
        }}
        onPointerCancel={(e) => {
          drag.current = null;
          delete e.currentTarget.dataset.dragging;
        }}
      >
        <svg
          width={W * zoom}
          height={H * zoom}
          viewBox={`0 0 ${W} ${H}`}
          className={s.erdSvg}
          data-focus={active ? '' : undefined}
        >
          <defs>
            <pattern id="erd-dots" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" style={{ fill: 'var(--erd-dots)' }} />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#erd-dots)" />
          {RELS.map((r) => (
            <g
              key={r.key}
              className={s.rel}
              data-lit={(active && (r.child === active || r.parent === active)) || undefined}
            >
              <path d={r.d} />
              <path d={r.marks} className={s.marks} />
            </g>
          ))}
          {TABLES.map((t) => {
            const [x, y] = POS[t.name];
            const h = heightOf(t);
            return (
              <g
                key={t.name}
                data-table={t.name}
                className={s.erdTable}
                data-dim={(lit && !lit.has(t.name)) || undefined}
                data-active={active === t.name || undefined}
                transform={`translate(${x} ${y})`}
                tabIndex={0}
                role="button"
                aria-label={`${t.name}: ${t.rows.length} rows, ${t.columns.length} columns. ${t.comment} Press Enter to query it.`}
                onMouseEnter={() => setActive(t.name)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(t.name)}
                onBlur={() => setActive(null)}
                onClick={() => query(t.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    query(t.name);
                  }
                }}
              >
                <rect className={s.erdCard} width={TW} height={h} rx="8" />
                <path
                  className={s.erdHead}
                  d={`M0 8a8 8 0 0 1 8-8h${TW - 16}a8 8 0 0 1 8 8v${HEAD - 8}H0z`}
                />
                <text x="12" y="22" className={s.erdName}>
                  {t.name}
                </text>
                <text
                  x={TW - 12}
                  y="22"
                  textAnchor="end"
                  className={s.erdRows}
                  data-writable={t.writable || undefined}
                >
                  {t.writable
                    ? 'INSERT only'
                    : `${t.rows.length} row${t.rows.length === 1 ? '' : 's'}`}
                </text>
                {t.columns.map((c, i) => {
                  const cy = HEAD + i * ROW + ROW / 2 + 2;
                  return (
                    <g key={c.name}>
                      {c.pk ? (
                        <g className={s.erdPk} transform={`translate(10 ${cy - 6})`}>
                          <circle cx="4" cy="6" r="2.6" />
                          <path d="M6.6 6H12M10.5 6v2.2" />
                        </g>
                      ) : c.fk ? (
                        <path className={s.erdFk} d={`M10 ${cy}l4-4 4 4-4 4z`} />
                      ) : (
                        <rect
                          className={s.erdCol}
                          x="12"
                          y={cy - 2.5}
                          width="5"
                          height="5"
                          rx="1"
                        />
                      )}
                      <text
                        x="28"
                        y={cy + 4}
                        className={s.erdColName}
                        data-key={c.pk ? 'pk' : c.fk ? 'fk' : undefined}
                      >
                        {c.name}
                      </text>
                      <text x={TW - 12} y={cy + 4} textAnchor="end" className={s.erdType}>
                        {c.type}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className={s.sr}>
        {RELS.map((r) => (
          <li key={r.key}>
            {r.key} references {r.parent}.id{r.nullable ? ', optional' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
