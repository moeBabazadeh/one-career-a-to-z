'use client';

import { useEffect, useRef, useState } from 'react';
import { db } from '../_shared/data';
import { useAnimationFrame, useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { projectLinks } from '../_shared/links';
import { DARK_INK, drawCloud, readInk } from './draw';
import { GROUPS, POINTS, neighbours, type Method } from './embed';
import s from './neural.module.scss';

const COLOR = Object.fromEntries(GROUPS.map((g) => [g.id, `var(${g.token})`]));
const DEFAULT = POINTS.findIndex((p) => p.title === db.products.neurobuild.title);
const METHODS: [Method, string][] = [
  ['tsne', 't-SNE'],
  ['pca', 'PCA'],
];
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** The cloud mid-morph: `k` runs from the old layout (0) to the new one (1). */
const cloudAt = (from: Method, to: Method, k: number, colors: Record<string, string>) =>
  POINTS.map((p) => ({
    pos: p.layouts[from].map((v, c) => v + (p.layouts[to][c] - v) * ease(k)) as [
      number,
      number,
      number,
    ],
    color: colors[p.group],
    label: p.title,
  }));

/** The canvas's colours, resolved from the CSS tokens: the shared ink and each group's colour. */
const readColors = (el: Element) => {
  const css = getComputedStyle(el);
  return {
    ink: readInk(el),
    groups: Object.fromEntries(GROUPS.map((g) => [g.id, css.getPropertyValue(g.token).trim()])),
  };
};

interface Drag {
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  moved: boolean;
}

export default function Projector() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.05);
  const [sel, setSel] = useState(DEFAULT);
  const [hover, setHover] = useState<number | null>(null);
  const [method, setMethod] = useState<Method>('tsne');
  const near = neighbours(sel);
  const point = POINTS[sel];

  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef({ w: 0, h: 0, fonts: { sans: 'sans-serif', mono: 'monospace' } });
  const view = useRef({ yaw: 0.7, pitch: 0.38, last: 0 });
  const drag = useRef<Drag | null>(null);
  const screen = useRef<[number, number, number][]>([]);
  const state = useRef({ sel, hover, near });
  const morph = useRef({ from: 'tsne' as Method, k: 1 });
  const colors = useRef({ ink: DARK_INK, groups: {} as Record<string, string> });

  const paint = () => {
    const ctx = canvas.current?.getContext('2d');
    const { w, h, fonts } = box.current;
    if (!ctx || !w) return;
    const { from, k } = morph.current;
    screen.current = drawCloud(ctx, w, h, {
      points: cloudAt(from, method, reduced ? 1 : k, colors.current.groups),
      ink: colors.current.ink,
      yaw: view.current.yaw,
      pitch: view.current.pitch,
      axes: method === 'pca' && (reduced || k >= 1) ? ['PC1', 'PC2', 'PC3'] : null,
      fonts,
      ...state.current,
    });
  };
  const paintRef = useRef(paint);
  // Colours come from the CSS tokens: read again when the scheme flips, then repainted below.
  useEffect(() => {
    if (canvas.current) colors.current = readColors(canvas.current);
  }, [scheme]);
  useEffect(() => {
    state.current = { sel, hover, near };
    paintRef.current = paint;
    paintRef.current();
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const css = getComputedStyle(el);
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(el.clientWidth * dpr);
      el.height = Math.round(el.clientHeight * dpr);
      el.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      box.current = {
        w: el.clientWidth,
        h: el.clientHeight,
        fonts: {
          sans: css.getPropertyValue('--sans') || 'sans-serif',
          mono: css.getPropertyValue('--mono') || 'monospace',
        },
      };
      paintRef.current();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Turntable spin, paused while the pointer is over a point or dragging.
  useAnimationFrame((t) => {
    const dt = view.current.last ? Math.min(0.05, t - view.current.last) : 0;
    view.current.last = t;
    if (!drag.current && state.current.hover == null) view.current.yaw += dt * 0.16;
    morph.current.k = Math.min(1, morph.current.k + dt / 1.4);
    paintRef.current();
  }, visible && !reduced);

  const switchTo = (next: Method) => {
    if (next === method) return;
    morph.current = { from: method, k: 0 };
    setMethod(next);
  };

  const hit = (e: React.PointerEvent) => {
    const r = canvas.current?.getBoundingClientRect();
    if (!r) return null;
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    let best: number | null = null,
      dist = 16;
    for (const [i, [px, py]] of screen.current.entries()) {
      const d = Math.hypot(px - x, py - y);
      if (d < dist) [best, dist] = [i, d];
    }
    return best;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: view.current.yaw,
      pitch: view.current.pitch,
      moved: false,
    };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) {
        d.moved = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (d.moved) {
        view.current.yaw = d.yaw + dx * 0.008;
        view.current.pitch = Math.max(-1.2, Math.min(1.2, d.pitch + dy * 0.008));
        paintRef.current();
        return;
      }
    }
    const i = hit(e);
    if (i !== hover) setHover(i);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const i = hit(e);
      if (i != null) setSel(i);
    }
  };

  return (
    <div ref={wrap} className={s.projector}>
      <div className={s.cloudBox}>
        <canvas
          ref={canvas}
          className={s.cloud}
          data-hover={hover != null ? '' : undefined}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => {
            if (!drag.current) setHover(null);
          }}
          role="img"
          aria-label={`A 3D scatter of ${POINTS.length} projects, papers and fixes, placed by their tech tags. ${point.title} is selected.`}
        />
        <ul className={s.groups}>
          {GROUPS.map((g) => (
            <li key={g.id}>
              <i style={{ background: COLOR[g.id] }} />
              {g.label}
            </li>
          ))}
        </ul>
        <div className={s.methods} role="group" aria-label="Projection">
          {METHODS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={method === id}
              onClick={() => switchTo(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={s.cloudHint}>
          {POINTS.length} points · {POINTS[0].vec.length} dims → 3 ·{' '}
          {method === 'tsne' ? 'perplexity 10, initialised from PCA' : 'top 3 components'} · drag to
          rotate
        </p>
      </div>

      <div className={s.projSide}>
        <div className={s.projDetail} aria-live="polite">
          <p className={s.inspKicker}>
            {point.year} · {point.madeAt}
          </p>
          <h3 className={s.inspTitle}>{point.title}</h3>
          {point.description && <p className={s.inspText}>{point.description}</p>}
          <ul className={s.chips}>
            {point.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {projectLinks(point.links).length > 0 && (
            <p className={s.inspLinks}>
              {projectLinks(point.links).map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </p>
          )}
          <h4 className={s.inspH}>
            Nearest neighbours <span>cosine</span>
          </h4>
          <ol className={s.near}>
            {near.map(({ j, sim }) => (
              <li key={j}>
                <button type="button" onClick={() => setSel(j)}>
                  {POINTS[j].title}
                </button>
                <span>{sim.toFixed(3)}</span>
              </li>
            ))}
          </ol>
        </div>

        <ol className={s.pointList} aria-label="All points">
          {POINTS.map((p, i) => (
            <li key={p.title}>
              <button
                type="button"
                aria-pressed={i === sel}
                onClick={() => setSel(i)}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                data-hover={i === hover ? '' : undefined}
              >
                <i style={{ background: COLOR[p.group] }} />
                <span className={s.ptYear}>{p.year}</span>
                <span className={s.ptTitle}>{p.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
