'use client';

// The minimap: every line drawn as coloured blocks, two pixels a line, with the visible region as
// a slider you can drag, and find matches, changes and problems marked. Click anywhere to jump
// there. It repaints when the text, the scroll position or the scheme changes.

import { useEffect, useRef } from 'react';
import { useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import type { LineChange } from './diff';
import type { Kind, Token } from './syntax';
import s from './editor.module.scss';

const LINE = 2;
const CHAR = 1;

export interface MinimapMarks {
  current: number;
  matches: number[];
  changes: LineChange[];
  errors: number[];
}

interface Props {
  lines: string[];
  tokens: Token[][];
  marks: MinimapMarks;
  /** Bumped on every scroll and resize, to repaint. */
  tick: number;
}

const KINDS: Kind[] = [
  'comment',
  'keyword',
  'string',
  'number',
  'constant',
  'type',
  'function',
  'property',
  'variable',
  'punct',
  'operator',
  'heading',
  'hmark',
  'bold',
  'italic',
  'code',
  'link',
  'url',
  'quote',
  'list',
  'rule',
  'fence',
];

/** Where the minimap's content sits for the editor's scroll position. */
function geometry(sc: HTMLDivElement, count: number, height: number) {
  const total = count * LINE;
  const ratio =
    sc.scrollHeight > sc.clientHeight ? sc.scrollTop / (sc.scrollHeight - sc.clientHeight) : 0;
  const offset = Math.max(0, total - height) * ratio;
  const sliderH = Math.max(10, (sc.clientHeight / Math.max(1, sc.scrollHeight)) * total);
  const sliderTop = (sc.scrollTop / Math.max(1, sc.scrollHeight)) * total - offset;
  return { total, offset, sliderH, sliderTop };
}

export default function Minimap({ lines, tokens, marks, tick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // The editor's scroller sits just before the minimap.
  const editor = () => box.current?.previousElementSibling as HTMLDivElement | null | undefined;
  const slider = useRef<HTMLDivElement>(null);
  const scheme = useScheme();
  const drag = useRef<{ startY: number; startTop: number } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    const sc = editor();
    if (!el || !sc) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;
    // Colours come from the theme's tokens, so they follow the scheme.
    const c: Record<string, string> = {};
    for (const k of KINDS) c[k] = token(el, `--tk-${k}`) || token(el, '--ink');
    for (const k of ['ink', 'find', 'err', 'add', 'mod', 'hl-line']) c[k] = token(el, `--${k}`);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { offset, sliderH, sliderTop } = geometry(sc, lines.length, height);
    const first = Math.floor(offset / LINE);
    const last = Math.min(lines.length, Math.ceil((offset + height) / LINE));

    ctx.fillStyle = c['hl-line'];
    ctx.fillRect(0, marks.current * LINE - offset, width, LINE);
    ctx.globalAlpha = 0.72;
    for (let n = first; n < last; n++) {
      const line = lines[n];
      const y = n * LINE - offset;
      const toks = tokens[n] ?? [];
      let t = 0;
      let run = -1;
      let runKind = '';
      const flush = (end: number) => {
        if (run < 0) return;
        const x = 6 + run * CHAR;
        if (x < width) {
          ctx.fillStyle = c[runKind] || c.ink;
          ctx.fillRect(x, y, Math.min(width - x, (end - run) * CHAR), LINE - 0.4);
        }
        run = -1;
      };
      for (let i = 0; i < line.length && 6 + i * CHAR < width; i++) {
        while (t < toks.length && toks[t].end <= i) t++;
        const kind = toks[t] && toks[t].start <= i ? toks[t].kind : 'variable';
        if (line[i] === ' ' || line[i] === '\t') {
          flush(i);
          continue;
        }
        if (run >= 0 && kind !== runKind) flush(i);
        if (run < 0) {
          run = i;
          runKind = kind;
        }
      }
      flush(line.length);
    }
    ctx.globalAlpha = 1;

    marks.changes.forEach((ch, n) => {
      if (!ch || n < first || n > last) return;
      ctx.fillStyle = ch === 'added' ? c.add : c.mod;
      ctx.fillRect(0, n * LINE - offset, 3, LINE);
    });
    ctx.fillStyle = c.find;
    for (const n of marks.matches)
      if (n >= first && n <= last) ctx.fillRect(0, n * LINE - offset - 1, width, LINE + 1);
    ctx.fillStyle = c.err;
    for (const n of marks.errors)
      if (n >= first && n <= last) ctx.fillRect(width - 5, n * LINE - offset - 1, 5, LINE + 2);

    if (slider.current) {
      slider.current.style.transform = `translateY(${sliderTop}px)`;
      slider.current.style.height = `${sliderH}px`;
    }
  }, [lines, tokens, marks, tick, scheme]);

  const jump = (clientY: number) => {
    const el = canvas.current;
    const sc = editor();
    if (!el || !sc) return;
    const rect = el.getBoundingClientRect();
    const { offset } = geometry(sc, lines.length, rect.height);
    const line = Math.max(
      0,
      Math.min(lines.length - 1, Math.floor((clientY - rect.top + offset) / LINE)),
    );
    const row = sc.querySelector<HTMLElement>(`[data-ln="${line}"]`);
    if (row) sc.scrollTop = row.offsetTop - sc.clientHeight / 2;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = canvas.current;
    const sc = editor();
    if (!el || !sc || e.button !== 0) return;
    const rect = el.getBoundingClientRect();
    const { sliderTop, sliderH } = geometry(sc, lines.length, rect.height);
    const y = e.clientY - rect.top;
    if (y < sliderTop || y > sliderTop + sliderH) jump(e.clientY);
    drag.current = { startY: e.clientY, startTop: sc.scrollTop };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.dragging = 'true';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const sc = editor();
    if (!drag.current || !sc) return;
    const total = Math.max(1, lines.length * LINE);
    sc.scrollTop =
      drag.current.startTop + ((e.clientY - drag.current.startY) * sc.scrollHeight) / total;
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    delete e.currentTarget.dataset.dragging;
  };

  return (
    <div
      ref={box}
      className={s.minimap}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <canvas ref={canvas} />
      <div ref={slider} className={s.minimapSlider} />
    </div>
  );
}
