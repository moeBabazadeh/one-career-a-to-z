'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db, profile } from '../_shared/data';
import {
  useAnimationFrame,
  useInView,
  useReducedMotion,
  useScaledCanvas,
  useScheme,
} from '../_shared/hooks';
import { DARK_ROOM, camera, drawScene, readRoom, type Room } from './draw';
import { PLATE, clock, estimate } from './gcode';
import { opById } from './ops';
import { Machine } from './sim';
import s from './toolpath.module.scss';

/* ------------------------------------------------------------------ operation preview */

const PW = 520,
  PH = 320;
/** Each preview loops in about this many seconds, whatever the real cycle time. */
const LOOP = 8;

/** A small simulation of one operation that plays while on screen. */
export function OpSim({ id, label }: { id: string; label: string }) {
  const op = opById(id);
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.1);
  const machine = useRef<Machine | null>(null);
  const font = useRef('monospace');
  const room = useRef<Room>(DARK_ROOM);
  const last = useRef(0);
  const rest = useRef(0);
  const ticker = useRef<HTMLElement>(null);
  const total = estimate(op.program);
  const speed = Math.max(1, Math.round(total / LOOP));

  const paint = (ctx: CanvasRenderingContext2D, now = 0) => {
    const m = machine.current;
    if (!m) return;
    const c = camera(m.p.stock, -0.32, 0.86, PW, PH, { w: 0.86, h: 0.66, y: 0.6 });
    drawScene(ctx, PW, PH, m, c, {
      now,
      font: font.current,
      backplot: true,
      holder: 'short',
      table: true,
      minLine: 1.2,
      room: room.current,
    });
  };
  const canvas = useScaledCanvas(PW, PH, (ctx) => paint(ctx, last.current));

  // Light or dark room: read once per change and repaint, which also covers a preview off screen.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    room.current = readRoom(el);
    const ctx = el.getContext('2d');
    if (ctx) paint(ctx, last.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme]);

  const show = (m: Machine) => {
    const el = ticker.current;
    if (!el) return;
    const text = m.done ? 'M30' : m.block.text;
    if (el.textContent !== text) el.textContent = text;
  };

  useEffect(() => {
    if (canvas.current) font.current = getComputedStyle(canvas.current).fontFamily || 'monospace';
    const m = new Machine(op.program);
    if (reduced) m.finish();
    machine.current = m;
    show(m);
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paint(ctx, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, reduced]);

  useAnimationFrame((sec) => {
    const m = machine.current;
    if (!m) return;
    const dt = last.current ? Math.min(0.05, sec - last.current) : 0;
    last.current = sec;
    if (m.done) {
      rest.current += dt;
      if (rest.current > 1.8) {
        m.reset();
        rest.current = 0;
      }
    }
    m.tick(dt * speed, sec, m.done ? null : { fro: 1, ro: 1, single: false }, dt);
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paint(ctx, sec);
    show(m);
  }, visible && !reduced);

  return (
    <figure className={s.sim}>
      <div ref={wrap} className={s.simView}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={label}
          style={{ aspectRatio: `${PW} / ${PH}` }}
        />
        <span className={s.simTag}>{reduced ? 'SIM · END STATE' : `SIM ×${speed}`}</span>
      </div>
      <figcaption className={s.simCap}>
        <code ref={ticker} className={s.ticker}>
          M30
        </code>
        <span>
          {op.program.file} · {op.program.blocks.length} blocks · est. {clock(total)}
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ setup tree */

export interface TreeItem {
  id: string;
  tag: string;
  label: string;
  sub?: string;
}

/** The CAM browser: a sticky tree of the setup, with the operation on screen highlighted. */
export function SetupTree({ items }: { items: TreeItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = items.find((it) => seen.get(it.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className={s.tree} aria-label="Setup">
      <p className={s.treeRoot}>
        <span aria-hidden="true">▾</span>
        {` Setup1 · ${PLATE.number}`}
      </p>
      <ol>
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} aria-current={active === it.id ? 'true' : undefined}>
              <span className={s.treeTag}>{it.tag}</span>
              <span className={s.treeLabel}>
                {it.label}
                {it.sub && <small>{it.sub}</small>}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ post processor */

interface OutLine {
  text: string;
  href?: string;
  value?: string;
}

/** A link as people type it: "https://www.linkedin.com/in/x/" → "linkedin.com/in/x". */
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/^\/|\/$/g, '');

const OUT: OutLine[] = [
  { text: '%' },
  { text: `O${db.asOf.y} (CONTACT)` },
  { text: `(${profile.name.toUpperCase()} - ${profile.role} AT ${profile.company.toUpperCase()})` },
  { text: '(EMAIL', value: profile.email, href: `mailto:${profile.email}` },
  { text: '(LINKEDIN', value: bare(profile.linkedin), href: profile.linkedin },
  { text: '(GITHUB', value: bare(profile.github), href: profile.github },
  { text: '(CV', value: bare(profile.cv), href: profile.cv },
  { text: 'M0 (PROGRAM STOP - YOUR MOVE)' },
  { text: 'M30' },
  { text: '%' },
];

/** The contact details, posted out as a program. Streams in once, the first time it's seen. */
export function PostOutput() {
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(true, 0.35);
  const [count, setCount] = useState(0);
  const [runs, setRuns] = useState(0);
  const shown = reduced ? OUT.length : count;
  const bytes = useMemo(
    () => OUT.reduce((n, l) => n + l.text.length + (l.value ? l.value.length + 2 : 0) + 1, 0),
    [],
  );

  useEffect(() => {
    if (!seen || reduced) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= OUT.length) clearInterval(timer);
    }, 140);
    return () => clearInterval(timer);
  }, [seen, reduced, runs]);

  return (
    <div ref={ref} className={s.post}>
      <div className={s.postBar}>
        <span>
          Post processor <b>{`${db.person.site.split('.')[0]}.cps`}</b> · output <b>contact.nc</b> ·{' '}
          {bytes} bytes
        </span>
        <button
          type="button"
          onClick={() => {
            setCount(0);
            setRuns(runs + 1);
          }}
          disabled={!reduced && shown < OUT.length}
        >
          Post again
        </button>
      </div>
      <ol className={s.postOut}>
        {OUT.map((l, i) => (
          <li key={i} data-on={i < shown ? '' : undefined}>
            <span className={s.ln} aria-hidden="true">
              {i + 1}
            </span>
            <code>
              {l.href ? (
                <>
                  {l.text}{' '}
                  <a
                    href={l.href}
                    target={
                      l.href.startsWith('http') || l.href.endsWith('.pdf') ? '_blank' : undefined
                    }
                    rel="noreferrer"
                  >
                    {l.value}
                  </a>
                  )
                </>
              ) : (
                l.text
              )}
            </code>
          </li>
        ))}
      </ol>
      <div
        className={s.progress}
        style={{ '--v': shown / OUT.length } as React.CSSProperties}
        aria-hidden="true"
      />
    </div>
  );
}
