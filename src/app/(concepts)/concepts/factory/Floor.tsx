'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  useAnimationFrame,
  useInView,
  useReducedMotion,
  useScaledCanvas,
  useScheme,
} from '../_shared/hooks';
import { CHART, drawChart, pointAt, type Span } from './chart';
import { SAVE } from './content';
import { H, T, W, bounds, drawFactory, fmtRate, hitTest, readPalette, type View } from './draw';
import Icon from './Icon';
import Inspector from './Inspector';
import { ITEMS, PARTS, PRODUCTS, RAW, type ItemId } from './items';
import { DT, Factory, UPS, freshLog, type Ref } from './sim';
import { nameOf, snapshot, type Fix, type Snap } from './snap';
import s from './factory.module.scss';

const PREWARM = 600; // ten game minutes, so the charts start full
const NARROW = '(max-width: 720px)';
const subscribeNarrow = (onChange: () => void) => {
  const query = matchMedia(NARROW);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

type Cat = 'product' | 'part' | 'raw';
const CATS: { key: Cat; label: string; items: ItemId[] }[] = [
  { key: 'product', label: 'Products', items: PRODUCTS },
  { key: 'part', label: 'Parts', items: PARTS },
  { key: 'raw', label: 'Raw skills', items: RAW },
];

const clock = (t: number) => {
  const m = Math.floor(t / 60),
    sec = Math.floor(t % 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

function boot() {
  const f = new Factory();
  f.advance(PREWARM);
  freshLog(f, 'Save loaded, ten game minutes in.');
  return f;
}

export default function Floor() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const narrow = useNarrow();
  const [wrap, visible] = useInView<HTMLElement>(false, 0.02);
  const fac = useRef<Factory | null>(null);
  const view = useRef<View>({
    clock: 0,
    alt: false,
    hover: null,
    selected: null,
    sans: 'sans-serif',
    mono: 'monospace',
    reduced: false,
  });
  const last = useRef(0);
  const acc = useRef(0);
  const lastSnap = useRef(0);

  const [snap, setSnap] = useState<Snap | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 4>(1);
  const [alt, setAlt] = useState(false);
  const [selected, setSelected] = useState<Ref | null>(null);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState(false);
  const [span, setSpan] = useState<Span>(60);
  const [cat, setCat] = useState<Cat>('product');
  const [series, setSeries] = useState<ItemId[]>(PRODUCTS);
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [focusItem, setFocusItem] = useState<ItemId | null>(null);
  const [palette, setPalette] = useState(0);

  const running = visible && !reduced;
  const opts = useRef({ paused, speed, selected });
  useEffect(() => {
    opts.current = { paused, speed, selected };
  });

  const canvas = useScaledCanvas(W, H, (ctx) => {
    if (fac.current) drawFactory(ctx, fac.current, view.current);
  });
  const size = narrow ? CHART.tall : CHART.wide;
  const chart = useScaledCanvas(size.W, size.H, (ctx) => {
    if (fac.current)
      drawChart(ctx, fac.current, series, span, chartHover, size, view.current.mono, focusItem);
  });

  const paint = () => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx && fac.current) drawFactory(ctx, fac.current, view.current);
  };

  // The map and the graph paint with the scheme's tokens: read them again when it changes, and
  // repaint both if they did.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !readPalette(el)) return;
    const ctx = el.getContext('2d');
    if (ctx && fac.current) drawFactory(ctx, fac.current, view.current);
    const id = requestAnimationFrame(() => setPalette((n) => n + 1));
    return () => cancelAnimationFrame(id);
  }, [scheme, canvas]);

  // Boot on the client: ten game minutes of production before anyone looks.
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    view.current.sans = css.getPropertyValue('--font-titillium').trim() || 'sans-serif';
    view.current.mono = css.getPropertyValue('--font-rh-mono').trim() || 'monospace';
    const f = boot();
    fac.current = f;
    const first = f.bottlenecks[0]?.ref ?? null;
    view.current.selected = first;
    const id = requestAnimationFrame(() => {
      setSelected(first);
      setSnap(snapshot(f, first));
      const ctx = canvas.current?.getContext('2d');
      if (ctx) drawFactory(ctx, f, view.current);
    });
    document.fonts?.ready.then(() => {
      const ctx = canvas.current?.getContext('2d');
      if (ctx && fac.current) drawFactory(ctx, fac.current, view.current);
    });
    return () => cancelAnimationFrame(id);
  }, [canvas]);

  useEffect(() => {
    last.current = 0;
    acc.current = 0;
  }, [running, paused]);

  // View options reach the canvas even when nothing is moving.
  useEffect(() => {
    view.current.alt = alt;
    view.current.selected = selected;
    view.current.reduced = reduced;
    const ctx = canvas.current?.getContext('2d');
    if (ctx && fac.current) drawFactory(ctx, fac.current, view.current);
  }, [alt, selected, reduced, canvas]);

  useAnimationFrame((sec) => {
    const f = fac.current;
    if (!f) return;
    const o = opts.current;
    const dt = last.current ? Math.min(0.1, sec - last.current) : 0;
    last.current = sec;
    if (!o.paused) {
      acc.current += dt * o.speed;
      let n = 0;
      while (acc.current >= DT && n < 40) {
        f.step();
        acc.current -= DT;
        n++;
      }
      if (n >= 40) acc.current = 0;
    }
    view.current.clock = sec;
    paint();
    if (sec - lastSnap.current >= 0.25) {
      lastSnap.current = sec;
      setSnap(snapshot(f, o.selected));
    }
  }, running);

  // The graph follows the snapshots.
  useEffect(() => {
    const ctx = chart.current?.getContext('2d');
    if (ctx && fac.current && snap)
      drawChart(ctx, fac.current, series, span, chartHover, size, view.current.mono, focusItem);
  }, [snap, series, span, chartHover, focusItem, size, chart, palette]);

  /* ---------------------------------------------------------------- actions */

  const refresh = (f: Factory, ref: Ref | null) => {
    setSnap(snapshot(f, ref));
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawFactory(ctx, f, view.current);
  };

  const choose = (ref: Ref | null) => {
    const f = fac.current;
    if (!f) return;
    const r = ref || null;
    setSelected(r);
    view.current.selected = r;
    opts.current.selected = r;
    refresh(f, r);
  };

  const act = (fix: Fix) => {
    const f = fac.current;
    if (!f) return;
    const i = Number(fix.ref.slice(1));
    if (fix.action === 'build') f.build(fix.ref);
    else if (fix.action === 'toggle') f.toggleBelt(i);
    else if (fix.ref[0] === 's') {
      if (fix.label.includes('balanced')) while (f.splitters[i].mode !== 0) f.cycleSplitter(i);
      else f.cycleSplitter(i);
    }
    if (reduced) {
      f.finishBuilds();
      f.advance(60);
    }
    setSelected(fix.ref);
    view.current.selected = fix.ref;
    opts.current.selected = fix.ref;
    refresh(f, fix.ref);
  };

  /** Click a ghost to build it; click a selected splitter or belt again to rotate or toggle it. */
  const primary = (ref: Ref, again: boolean) => {
    const f = fac.current;
    if (!f) return;
    const kind = ref[0],
      i = Number(ref.slice(1));
    const e = kind === 'm' ? f.machines[i] : kind === 'd' ? f.drills[i] : null;
    if (e && e.built === 0 && !e.building) return act({ label: 'Build', action: 'build', ref });
    if (again && kind === 's') return act({ label: 'Rotate', action: 'rotate', ref });
    if (again && kind === 'b') return act({ label: 'Toggle', action: 'toggle', ref });
    choose(ref);
  };

  const reset = () => {
    const f = boot();
    fac.current = f;
    const first = f.bottlenecks[0]?.ref ?? null;
    setPaused(false);
    setSpeed(1);
    setSelected(first);
    view.current.selected = first;
    opts.current.selected = first;
    refresh(f, first);
  };

  const toWorld = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  const move = (dx: number, dy: number) => {
    const f = fac.current;
    if (!f) return;
    const refs: Ref[] = [
      ...f.machines.map((_, i) => `m${i}`),
      ...f.drills.map((_, i) => `d${i}`),
      ...f.splitters.map((_, i) => `s${i}`),
      ...f.docks.map((_, i) => `k${i}`),
      ...f.belts.map((_, i) => `b${i}`),
    ];
    const center = (ref: Ref) => {
      if (ref[0] === 'b') {
        const b = f.belts[Number(ref.slice(1))];
        const t = b.tiles[Math.floor(b.len / 2)];
        return [(t.x + 0.5) * T, (t.y + 0.5) * T];
      }
      const bb = bounds(f, ref);
      return bb ? [bb[0] + bb[2] / 2, bb[1] + bb[3] / 2] : [0, 0];
    };
    const from = selected ? center(selected) : [0, 0];
    let best: Ref | null = null,
      score = Infinity;
    for (const r of refs) {
      if (r === selected) continue;
      const [x, y] = center(r);
      const vx = x - from[0],
        vy = y - from[1];
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const sc = along + across * 2.2;
      if (sc < score) [score, best] = [sc, r];
    }
    if (best) choose(best);
  };

  const onKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (e.key in arrows) {
      e.preventDefault();
      move(...arrows[e.key]);
    } else if (e.key === 'Enter' && selected) {
      e.preventDefault();
      primary(selected, true);
    } else if ((e.key === 'r' || e.key === 'R') && selected?.[0] === 's') {
      e.preventDefault();
      act({ label: 'Rotate', action: 'rotate', ref: selected });
    } else if (e.key === ' ' && !reduced) {
      e.preventDefault();
      setPaused(!paused);
    } else if (e.key === 'Alt') {
      e.preventDefault();
      setAlt(!alt);
    } else if (e.key === 'Escape') {
      choose(null);
    } else if ((e.key === '1' || e.key === '4') && !reduced) {
      setSpeed(e.key === '1' ? 1 : 4);
    }
  };

  /* ---------------------------------------------------------------- render */

  const n = snap;
  const top = n?.bottlenecks[0];
  const shownItems = CATS.find((c) => c.key === cat)?.items ?? PRODUCTS;
  const rows = n?.rows.filter((r) => shownItems.includes(r.id)) ?? [];
  const maxRate = Math.max(1, ...rows.map((r) => Math.max(r.made, r.used)));
  const selName = n?.sel
    ? `${n.sel.kind === 'machine' ? `${ITEMS[n.sel.recipe.out].name} assembler` : n.sel.kind === 'drill' ? `Drill on ${ITEMS[n.sel.res].name}` : n.sel.kind === 'belt' ? `${ITEMS[n.sel.item].name} belt` : n.sel.kind === 'splitter' ? `${ITEMS[n.sel.item].name} splitter` : `${n.sel.name} dock`}`
    : '';

  return (
    <section ref={wrap} id="factory" className={s.floor} aria-labelledby="factory-title">
      <div className={s.window}>
        <header className={s.bar}>
          <div className={s.barTitle}>
            <span
              className={s.runLamp}
              data-on={(running && !paused) || undefined}
              aria-hidden="true"
            />
            <h2 id="factory-title">Factory</h2>
            <span className={s.barMeta}>
              {`${SAVE}.save · deterministic, `}
              {UPS} ticks per game second
            </span>
          </div>
          <div className={s.controls} role="group" aria-label="Simulation">
            {reduced ? (
              <button
                type="button"
                className={s.btn}
                onClick={() => {
                  const f = fac.current;
                  if (!f) return;
                  f.advance(60);
                  refresh(f, selected);
                }}
              >
                Advance 1 min
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={s.btn}
                  aria-pressed={paused}
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? 'Resume' : 'Pause'} <kbd>Space</kbd>
                </button>
                <span className={s.seg} role="radiogroup" aria-label="Game speed">
                  {([1, 4] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={speed === v}
                      className={s.btn}
                      onClick={() => setSpeed(v)}
                    >
                      {v}×
                    </button>
                  ))}
                </span>
              </>
            )}
            <button type="button" className={s.btn} aria-pressed={alt} onClick={() => setAlt(!alt)}>
              Alt-mode <kbd>Alt</kbd>
            </button>
            <button type="button" className={s.btn} onClick={reset}>
              Reset
            </button>
          </div>
          <dl className={s.kpis}>
            <div>
              <dt>Game time</dt>
              <dd>{n ? clock(n.t) : '—'}</dd>
            </div>
            <div>
              <dt>Tick</dt>
              <dd>{n ? n.tick.toLocaleString('en-US') : '—'}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{n ? `${fmtRate(n.shipped)}/min` : '—'}</dd>
            </div>
          </dl>
        </header>

        <div className={s.stage}>
          <div className={s.mapCol}>
            <div className={s.viewport} style={{ overflowX: 'auto' }}>
              <canvas
                ref={canvas}
                className={s.map}
                role="application"
                tabIndex={0}
                aria-roledescription="factory map"
                aria-label="Top-down factory: eight resource patches named after his skills feed assemblers that make parts, then his products, which belts carry to four shipping docks. Arrow keys move the selection, Enter builds a ghost, rotates a splitter or toggles a belt, R rotates, Space pauses, Alt switches alt-mode."
                aria-describedby="factory-sel"
                style={{ aspectRatio: `${W} / ${H}` }}
                onPointerMove={(e) => {
                  const f = fac.current;
                  if (!f) return;
                  const ref = hitTest(f, ...toWorld(e));
                  if (ref === view.current.hover) return;
                  view.current.hover = ref;
                  e.currentTarget.style.cursor = ref ? 'pointer' : 'default';
                  setHoverName(ref ? nameOf(f, ref) : null);
                  if (!running) paint();
                }}
                onPointerLeave={() => {
                  view.current.hover = null;
                  setHoverName(null);
                  if (!running) paint();
                }}
                onClick={(e) => {
                  const f = fac.current;
                  if (!f) return;
                  const ref = hitTest(f, ...toWorld(e));
                  if (!ref) return choose(null);
                  primary(ref, ref === selected);
                }}
                onKeyDown={onKey}
                onFocus={() => setMapFocus(true)}
                onBlur={() => setMapFocus(false)}
              />
            </div>
            <p className={s.hint} aria-hidden="true">
              {hoverName ? (
                <>
                  <b>{hoverName}</b>
                  {hoverName.endsWith('splitter')
                    ? ' · click to open, click again to rotate'
                    : hoverName.endsWith('belt')
                      ? ' · click to open, click again to toggle'
                      : ' · click to open'}
                </>
              ) : mapFocus ? (
                <>
                  <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> select · <kbd>Enter</kbd>{' '}
                  build, rotate or toggle · <kbd>R</kbd> rotate · <kbd>Space</kbd> pause ·{' '}
                  <kbd>Alt</kbd> alt-mode · <kbd>Esc</kbd> deselect
                </>
              ) : narrow ? (
                'Swipe sideways to pan the map. Tap anything to open it.'
              ) : (
                'Hover anything to name it. Blue ghosts are ready to build.'
              )}
            </p>
            <p id="factory-sel" className={s.sr} aria-live="polite">
              {selName ? `Selected: ${selName}.` : ''}
            </p>
          </div>

          <aside className={s.inspector} aria-label="Inspector">
            <Inspector
              sel={n?.sel ?? null}
              reduced={reduced}
              onAction={act}
              onSelect={(r) => r && choose(r)}
              onClose={() => choose(null)}
            />
          </aside>
        </div>
      </div>

      <div className={s.window} id="stats">
        <header className={s.bar}>
          <div className={s.barTitle}>
            <h2>Production statistics</h2>
            <span className={s.barMeta}>items per game minute, as the simulation counts them</span>
          </div>
          <div className={s.controls}>
            <span className={s.seg} role="radiogroup" aria-label="Time span">
              {([60, 600] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={span === v}
                  className={s.btn}
                  onClick={() => setSpan(v)}
                >
                  {v === 60 ? '1 min' : '10 min'}
                </button>
              ))}
            </span>
          </div>
        </header>

        <div className={s.statsBody}>
          <div className={s.alerts}>
            {top ? (
              <div className={s.alertCard} data-tone="err">
                <p className={s.alertKicker}>Bottleneck</p>
                <h3>
                  <Icon id={top.short} size={20} />
                  {top.name[0].toUpperCase() + top.name.slice(1)}
                </h3>
                <p>{top.reason}</p>
                <p className={s.holds}>
                  Holds back{' '}
                  {top.products.map((p, k) => (
                    <span key={p}>
                      {k > 0 && (k === top.products.length - 1 ? ' and ' : ', ')}
                      <b>{ITEMS[p].name}</b>
                    </span>
                  ))}
                  .
                </p>
                <div className={s.alertActions}>
                  {n?.fix && (
                    <button
                      type="button"
                      className={s.action}
                      data-primary
                      onClick={() => n.fix && act(n.fix)}
                    >
                      {n.fix.label}
                    </button>
                  )}
                  <button type="button" className={s.action} onClick={() => choose(top.ref)}>
                    Show it
                  </button>
                </div>
                {n?.fix?.action === 'rotate' && top.ref[0] === 'm' && (
                  <p className={s.muted}>
                    There is no room for another one. Its splitter decides which product gets what
                    it makes.
                  </p>
                )}
                {(n?.bottlenecks.length ?? 0) > 1 && (
                  <p className={s.more}>
                    Also:{' '}
                    {n?.bottlenecks.slice(1).map((b, k) => (
                      <span key={b.ref}>
                        {k > 0 && ', '}
                        <button type="button" className={s.textBtn} onClick={() => choose(b.ref)}>
                          {b.name}
                        </button>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            ) : (
              <div className={s.alertCard} data-tone="ok">
                <p className={s.alertKicker}>{n ? 'No bottleneck' : 'Loading the save'}</p>
                <h3>{n ? 'Every product line runs at full speed' : '…'}</h3>
                <p>{n ? 'The slowest step in each line is the product assembler itself.' : ''}</p>
              </div>
            )}
            <ol className={s.log} aria-label="Factory log">
              {n?.log.map((l) => (
                <li key={l.n} data-level={l.level}>
                  <time>{clock(l.t)}</time>
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
          </div>

          <figure className={s.graph}>
            <div className={s.tabs} role="tablist" aria-label="Item group">
              {CATS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={cat === c.key}
                  onClick={() => {
                    setCat(c.key);
                    setSeries(c.items);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <canvas
              ref={chart}
              role="img"
              aria-label={`Production over the last ${span === 60 ? 'minute' : 'ten minutes'}: ${rows
                .filter((r) => series.includes(r.id))
                .map((r) => `${ITEMS[r.id].name} ${fmtRate(r.made)} per minute`)
                .join(', ')}.`}
              style={{ aspectRatio: `${size.W} / ${size.H}` }}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const p = pointAt(size, ((e.clientX - r.left) / r.width) * size.W);
                if (p !== chartHover) setChartHover(p);
              }}
              onPointerLeave={() => setChartHover(null)}
            />
          </figure>

          <div className={s.table}>
            <div className={s.thead} aria-hidden="true">
              <span>Item</span>
              <span>▲ made</span>
              <span>▼ {cat === 'product' ? 'shipped' : 'used'}</span>
            </div>
            <ul aria-label="Items: click to show or hide on the graph">
              {rows.map((r) => {
                const on = series.includes(r.id);
                const flagged = n?.bottlenecks.some((b) => b.short === r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      data-flag={flagged || undefined}
                      onClick={() =>
                        setSeries(on ? series.filter((x) => x !== r.id) : [...series, r.id])
                      }
                      onPointerEnter={() => setFocusItem(r.id)}
                      onPointerLeave={() => setFocusItem(null)}
                      onFocus={() => setFocusItem(r.id)}
                      onBlur={() => setFocusItem(null)}
                    >
                      <span
                        className={s.swatch}
                        style={{
                          background: on ? ITEMS[r.id].color : 'transparent',
                          borderColor: ITEMS[r.id].color,
                        }}
                        aria-hidden="true"
                      />
                      <Icon id={r.id} size={18} />
                      <span className={s.itemName}>{ITEMS[r.id].name}</span>
                      <span className={s.num}>
                        {fmtRate(r.made)}
                        <i
                          style={{
                            width: `${(r.made / maxRate) * 100}%`,
                            background: ITEMS[r.id].color,
                          }}
                          aria-hidden="true"
                        />
                      </span>
                      <span className={s.num}>
                        {fmtRate(r.used)}
                        <i style={{ width: `${(r.used / maxRate) * 100}%` }} aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
