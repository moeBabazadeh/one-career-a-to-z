'use client';

import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { db, profile } from '../_shared/data';
import { useInView, useReducedMotion } from '../_shared/hooks';
import {
  NODES,
  PEER,
  TALL,
  WIDE,
  labelBox,
  labelKeys,
  plan,
  type FrameId,
  type Layout,
  type Leg,
  type Plan,
  type Target,
} from './geometry';
import { along, type Pt } from './rough';
import s from './whiteboard.module.scss';

export interface SketchHandle {
  skip(): void;
}

const TEXT = {
  h1: profile.name,
  role: `${profile.role} @ ${profile.company}`,
  tagline: profile.tagline,
  here: 'you are here',
};
const HINT = { wide: 'click any box to dive in', tall: 'tap a box to jump to it' };

const PLANS: Record<Layout['key'], Plan> = {
  wide: plan(WIDE, TEXT.h1, TEXT.role, TEXT.tagline, HINT.wide, TEXT.here),
  tall: plan(TALL, TEXT.h1, TEXT.role, TEXT.tagline, HINT.tall, TEXT.here),
};

/** How much faster than the plan's clock the drawing plays. */
const SPEED = 2.2;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function Pointer({ name, color }: { name: string; color: string }) {
  return (
    <>
      <svg viewBox="0 0 20 22" className={s.pointer} aria-hidden="true">
        <path d="M2.5 2.5 2.5 18.2 7 14 10 20.6 12.9 19.3 9.9 12.7 15.8 12.5Z" fill={color} />
      </svg>
      <span className={s.tag} style={{ background: color }}>
        {name}
      </span>
    </>
  );
}

/**
 * The system-design diagram, drawn live: Moe's cursor writes the title, draws every box and
 * arrow stroke by stroke, then labels them. With reduced motion it is simply there.
 */
export default function Sketch({
  layout: L,
  run,
  onNode,
  onDone,
  onPhase,
  ref,
}: {
  layout: Layout;
  run: number;
  onNode: (frame: FrameId, e: React.MouseEvent) => void;
  onDone?: (pen: Pt) => void;
  onPhase?: (drawing: boolean) => void;
  ref?: React.Ref<SketchHandle>;
}) {
  const reduced = useReducedMotion();
  const [box, inView] = useInView<HTMLDivElement>(true, 0.1);
  const pen = useRef<HTMLDivElement>(null);
  const skipping = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'drawing' | 'done'>('idle');
  const P = PLANS[L.key];

  useImperativeHandle(ref, () => ({ skip: () => void (skipping.current = true) }), []);

  useEffect(() => {
    const root = box.current;
    const cursor = pen.current;
    if (!inView || !root || !cursor) return;
    const paths: SVGPathElement[] = [];
    root
      .querySelectorAll<SVGPathElement>('path[data-m]')
      .forEach((p) => (paths[Number(p.dataset.m)] = p));
    const words = new Map<string, HTMLElement>();
    root.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => words.set(el.dataset.w!, el));

    // Label boxes in the sketch's own units, measured when the pen first needs them (by
    // then the handwriting font has loaded).
    const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
    const measure = (key: string) => {
      let m = boxes.get(key);
      if (!m) {
        const b = root.getBoundingClientRect(),
          r = words.get(key)!.getBoundingClientRect(),
          k = b.width / L.W || 1;
        m = { x: (r.left - b.left) / k, y: (r.top - b.top) / k, w: r.width / k, h: r.height / k };
        boxes.set(key, m);
      }
      return m;
    };
    const resolve = (t: Target): Pt => {
      if (Array.isArray(t)) return t;
      const m = measure(t.key);
      return [m.x + (t.end ? m.w * 0.96 : m.w * 0.03), m.y + m.h * 0.72];
    };
    const penAt = (leg: Leg, t: number): Pt => {
      const p = clamp01((t - leg.t0) / (leg.t1 - leg.t0 || 1));
      if (leg.kind === 'draw') return along(leg.track, p);
      if (leg.kind === 'write') {
        const m = measure(leg.key);
        return [
          m.x + m.w * (0.03 + 0.93 * p),
          m.y + m.h * 0.7 + Math.sin(p * leg.chars * Math.PI) * m.h * 0.12,
        ];
      }
      const a = resolve(leg.a),
        b = resolve(leg.b),
        e = ease(p);
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        lift = Math.sin(Math.PI * e) * Math.min(30, Math.hypot(dx, dy) * 0.12);
      const len = Math.hypot(dx, dy) || 1;
      return [a[0] + dx * e - (dy / len) * lift, a[1] + dy * e + (dx / len) * lift];
    };
    const place = ([x, y]: Pt) => {
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(var(--pen-scale, 1))`;
    };

    let raf = 0,
      start = 0,
      leg = 0,
      cancelled = false;
    const end = () => {
      paths.forEach((p) => (p.style.strokeDashoffset = ''));
      words.forEach((w) => (w.style.clipPath = ''));
      setPhase('done');
      onPhase?.(false);
      const last = P.legs[P.legs.length - 1];
      onDone?.(last ? penAt(last, last.t1) : L.enter);
    };

    if (reduced) {
      raf = requestAnimationFrame(end);
      return () => cancelAnimationFrame(raf);
    }

    skipping.current = false;
    const shown = new Float32Array(paths.length).fill(-1);
    paths.forEach((p) => (p.style.strokeDashoffset = '1'));
    words.forEach((w) => (w.style.clipPath = 'inset(0 100% 0 0)'));
    place(L.enter);

    const tick = (now: number) => {
      if (cancelled) return;
      if (!start) {
        start = now;
        setPhase('drawing');
        onPhase?.(true);
      }
      const t = skipping.current ? P.total : ((now - start) / 1000) * SPEED;
      P.marks.forEach((m, i) => {
        const p = clamp01((t - m.t0) / (m.t1 - m.t0));
        if (p !== shown[i]) {
          shown[i] = p;
          paths[i].style.strokeDashoffset = String(1 - p);
        }
      });
      for (const w of P.writes) {
        const el = words.get(w.key);
        if (!el) continue;
        const p = clamp01((t - w.t0) / (w.t1 - w.t0));
        el.style.clipPath = p >= 1 ? 'none' : `inset(0 ${((1 - p) * 100).toFixed(1)}% 0 0)`;
      }
      while (leg < P.legs.length - 1 && P.legs[leg].t1 < t) leg++;
      if (P.legs[leg]) place(penAt(P.legs[leg], t));
      if (t >= P.total) end();
      else raf = requestAnimationFrame(tick);
    };

    // Wait for the handwriting font, so the labels are measured in Caveat.
    const timer = window.setTimeout(() => {
      if (!raf && !cancelled) raf = requestAnimationFrame(tick);
    }, 1200);
    document.fonts.ready.then(() => {
      if (!raf && !cancelled) raf = requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    // The plan and callbacks are stable for a layout; a new `run` replays the drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced, run]);

  const fonts = L.font;
  const at = ([x, y]: Pt): React.CSSProperties => ({ left: x, top: y });

  return (
    <div
      ref={box}
      className={`${s.sketch} ${L.key === 'wide' ? s.sketchWide : s.sketchTall}`}
      data-phase={reduced ? 'done' : phase}
      style={{ width: L.W, height: L.H, '--ink-w': L.ink } as React.CSSProperties}
    >
      <svg className={s.strokes} viewBox={`0 0 ${L.W} ${L.H}`} aria-hidden="true">
        <g>
          {P.marks.map((m, i) =>
            m.kind === 'fill' ? (
              <path
                key={i}
                data-m={i}
                d={m.d}
                pathLength={1}
                className={s.mFill}
                style={{ stroke: m.tint }}
              />
            ) : null,
          )}
        </g>
        <g>
          {P.marks.map((m, i) =>
            m.kind !== 'fill' ? (
              <path
                key={i}
                data-m={i}
                d={m.d}
                pathLength={1}
                className={m.kind === 'red' ? s.mRed : s.mInk}
              />
            ) : null,
          )}
        </g>
      </svg>

      <h1 className={s.h1} data-w={labelKeys.h1} style={{ ...at(L.text.h1), fontSize: fonts.h1 }}>
        {TEXT.h1}
      </h1>
      <p
        className={s.role}
        data-w={labelKeys.role}
        style={{ ...at(L.text.role), fontSize: fonts.role }}
      >
        {TEXT.role}
      </p>
      <p
        className={s.tagline}
        data-w={labelKeys.tagline}
        style={{ ...at(L.text.tagline), fontSize: fonts.tagline, width: L.taglineWidth }}
      >
        {TEXT.tagline}
      </p>
      <p
        className={s.hint}
        data-w={labelKeys.hint}
        style={{ ...at(L.text.hint), fontSize: fonts.note }}
      >
        {HINT[L.key]}
      </p>
      <p
        className={s.here}
        data-w={labelKeys.here}
        style={{ ...at(L.text.here), fontSize: fonts.note }}
        aria-hidden="true"
      >
        {TEXT.here}
      </p>

      <nav aria-label="System map">
        <ul className={s.nodes}>
          {NODES.map((n) => {
            const r = L.nodes[n.id],
              lb = labelBox(L, n);
            return (
              <li key={n.id}>
                <a
                  href={`#f-${n.frame}`}
                  className={s.node}
                  data-node=""
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  onClick={(e) => onNode(n.frame, e)}
                >
                  <span
                    className={s.nodeLabel}
                    style={{ left: lb.x - r.x, top: lb.y - r.y, width: lb.w, height: lb.h }}
                  >
                    <span
                      className={s.nodeTitle}
                      data-w={labelKeys.title(n.id)}
                      style={{ fontSize: fonts.title }}
                    >
                      {n.title}
                    </span>
                    <span
                      className={s.nodeSub}
                      data-w={labelKeys.sub(n.id)}
                      style={{ fontSize: fonts.sub }}
                    >
                      {n.sub}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {L.edges.map((e) =>
        e.label ? (
          <span
            key={e.id}
            className={`${s.edge} ${e.align === 'center' ? s.edgeCenter : ''}`}
            data-w={labelKeys.edge(e.id)}
            style={{ ...at(e.at), fontSize: fonts.edge }}
            aria-hidden="true"
          >
            {e.label}
          </span>
        ) : null,
      )}

      <div ref={pen} className={s.pen} aria-hidden="true">
        <Pointer name={db.person.first} color={PEER.blue} />
      </div>
    </div>
  );
}
