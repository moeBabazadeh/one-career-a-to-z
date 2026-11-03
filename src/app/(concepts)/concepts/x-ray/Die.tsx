'use client';

import { useEffect, useRef, useState } from 'react';
import { db, profile } from '../_shared/data';
import { useReducedMotion, useScheme } from '../_shared/hooks';
import { createEngine, type Engine } from './engine';
import { BLOCK, BLOCKS, CATS, PART, REV, type BlockId } from './geometry';
import Guide, { type GuideActions } from './Guide';
import Legend from './Legend';
import { ALL_LAYERS, LAYERS } from './paint';
import s from './die.module.scss';
import { conceptTitle } from '../_shared/concepts';

const PRESETS = [
  { label: 'As shot', mask: ALL_LAYERS },
  { label: 'No glass', mask: 0x7f },
  { label: 'Etch to M1', mask: 0b11 },
  { label: 'Bare silicon', mask: 0b1 },
];

const hashBlock = (): BlockId | null => {
  const h = window.location.hash.slice(1);
  return BLOCKS.some((b) => b.id === h) ? (h as BlockId) : null;
};

function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={s.markIcon}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
      <rect x="7" y="7" width="6" height="5" />
      <rect x="14" y="7" width="3" height="10" />
      <rect x="7" y="13" width="6" height="4" />
      <path d="M3.5 6h-2M3.5 10h-2M3.5 14h-2M3.5 18h-2M22.5 6h-2M22.5 10h-2M22.5 14h-2M22.5 18h-2" />
    </svg>
  );
}

export default function Die() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [sel, setSel] = useState<BlockId>('die');
  const [part, setPart] = useState<string | null>(null);
  const [mask, setMask] = useState(ALL_LAYERS);
  const [labels, setLabels] = useState(true);
  const [thermal, setThermal] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  const viewer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hotspots = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLParagraphElement>(null);
  const coords = useRef<HTMLSpanElement>(null);
  const zoom = useRef<HTMLSpanElement>(null);
  const lod = useRef<HTMLSpanElement>(null);
  const scaleBar = useRef<HTMLSpanElement>(null);
  const scaleLabel = useRef<HTMLSpanElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const guide = useRef<HTMLElement>(null);
  const engine = useRef<Engine | null>(null);

  useEffect(() => {
    if (!viewer.current || !canvas.current) return;
    const e = createEngine({
      viewer: viewer.current,
      canvas: canvas.current,
      hud: {
        coords: coords.current,
        zoom: zoom.current,
        lod: lod.current,
        scaleBar: scaleBar.current,
        scaleLabel: scaleLabel.current,
        tip: tip.current,
        minimap: minimap.current,
        status: status.current,
      },
      hotspots: hotspots.current,
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      initial: hashBlock(),
      onSelect: (id, p) => {
        setSel(id);
        setPart(p);
      },
      onUser: () => setTouched(true),
    });
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => engine.current?.setReduced(reduced), [reduced]);
  // Light or dark changes the die's lamp: the engine reads its colour tokens again and repaints.
  useEffect(() => engine.current?.restyle(), [scheme]);
  useEffect(() => engine.current?.setMask(mask), [mask]);
  useEffect(() => engine.current?.setLabels(labels), [labels]);
  useEffect(() => engine.current?.setThermal(thermal), [thermal]);
  // The hash follows the selection, but a hash we didn't write (a deep link) is left for the engine to read.
  const wrote = useRef(false);
  useEffect(() => {
    engine.current?.select(sel, part);
    if (sel !== 'die') {
      window.history.replaceState(null, '', `#${sel}`);
      wrote.current = true;
    } else if (wrote.current) window.history.replaceState(null, '', window.location.pathname);
  }, [sel, part]);
  useEffect(() => {
    guide.current?.scrollTo({ top: 0 });
    // Keep the chosen block's chip in view in the scrolling row (narrow screens), without moving the page.
    const row = guide.current?.querySelector<HTMLElement>('nav ul');
    const chip = row?.querySelector<HTMLElement>('button[aria-current]');
    if (row && chip && row.scrollWidth > row.clientWidth) {
      const at =
        row.scrollLeft + chip.getBoundingClientRect().left - row.getBoundingClientRect().left;
      row.scrollTo({
        left: at - row.clientWidth / 2 + chip.offsetWidth / 2,
        behavior: reduced ? 'auto' : 'smooth',
      });
    }
  }, [sel, reduced]);

  const go = (id: BlockId, p: string | null = null) => {
    setSel(id);
    setPart(p);
    setTouched(true);
    engine.current?.flyTo(id, p);
  };

  const act: GuideActions = {
    hint: (p) => engine.current?.setGuidePart(p),
    locate: (id, p) => go(id, p),
    stop: (x, y, z) => {
      setTouched(true);
      engine.current?.flyToPoint(x, y, z);
    },
    go: (id) => go(id),
  };

  const toggle = (i: number) => setMask((m) => m ^ (1 << i));
  const b = BLOCK[sel];

  return (
    <div className={s.root}>
      <header className={s.top}>
        <a className={s.brand} href="#" onClick={(e) => (e.preventDefault(), go('die'))}>
          <Mark />
          <span>
            <b>{PART}</b>
            <small>{`die shot · rev ${REV}`}</small>
          </span>
        </a>
        <p className={s.who}>
          <b>{profile.name}</b>
          <span>
            {profile.role} at{' '}
            <a href={profile.companyUrl} target="_blank" rel="noreferrer">
              {profile.company}
            </a>
          </span>
        </p>
        <nav className={s.nav} aria-label="Contact">
          <a href={`mailto:${profile.email}`}>Contact</a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer" className={s.wideOnly}>
            GitHub
          </a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer" className={s.wideOnly}>
            LinkedIn
          </a>
        </nav>
      </header>

      <div className={s.app}>
        <section
          ref={viewer}
          className={s.viewer}
          aria-label="Die viewer. Arrow keys pan, plus and minus zoom, 0 fits the die, Enter opens the block in the middle, Escape returns to the whole die."
          tabIndex={0}
          onKeyDown={(e) => {
            if (engine.current?.key(e.nativeEvent)) e.preventDefault();
          }}
        >
          <canvas ref={canvas} className={s.canvas} aria-hidden="true" />
          <div ref={hotspots} className={s.hotspots}>
            {BLOCKS.map((bl) => (
              <button
                key={bl.id}
                type="button"
                data-block={bl.id}
                className={s.hotspot}
                aria-label={`${bl.tag}, ${bl.name}: ${bl.kind}`}
                aria-current={sel === bl.id || undefined}
                onFocus={() => engine.current?.setFocus(bl.id)}
                onBlur={() => engine.current?.setFocus(null)}
                onClick={() => go(bl.id)}
              />
            ))}
          </div>
          <p ref={tip} className={s.tip} hidden aria-hidden="true" />

          <p className={s.readout} aria-hidden="true">
            <span ref={coords}>X 5.600 mm Y 4.800 mm</span>
            <span ref={zoom} className={s.mag}>
              ×1.0
            </span>
            <span ref={lod} className={s.lod}>
              die
            </span>
            <span ref={status} className={s.status}>
              Stitching frames
            </span>
          </p>

          <div className={s.overlays} data-ui>
            <button type="button" aria-pressed={labels} onClick={() => setLabels((v) => !v)}>
              Labels
            </button>
            <button
              type="button"
              aria-pressed={thermal}
              onClick={() => setThermal((v) => !v)}
              title="Infrared: live work runs warm, past roles are power-gated"
            >
              IR
            </button>
            <button
              type="button"
              className={s.layersBtn}
              aria-expanded={layersOpen}
              aria-controls="die-layers"
              onClick={() => setLayersOpen((v) => !v)}
            >
              Layers
            </button>
          </div>

          <div id="die-layers" className={s.layers} data-open={layersOpen || undefined} data-ui>
            <p className={s.layersTitle}>Layers</p>
            <ol>
              {[...LAYERS.keys()].reverse().map((i) => {
                const l = LAYERS[i];
                const on = !!(mask & (1 << i));
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(i)}
                      aria-label={`${l.short}, ${l.name}: ${l.note}`}
                    >
                      <span
                        className={s.layerSwatch}
                        style={{ background: l.color, height: l.thick + 3 }}
                        aria-hidden="true"
                      />
                      <b>{l.short}</b>
                      <span className={s.layerName}>{l.name}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className={s.presets}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={mask === p.mask}
                  onClick={() => setMask(p.mask)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {thermal && (
            <p className={s.irKey}>
              <span>power-gated</span>
              <i aria-hidden="true" />
              <span>running</span>
            </p>
          )}

          <div className={s.dock} data-ui>
            <div className={s.zoomBtns}>
              <button type="button" onClick={() => engine.current?.zoomBy(2)} aria-label="Zoom in">
                +
              </button>
              <button
                type="button"
                onClick={() => engine.current?.zoomBy(0.5)}
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => engine.current?.fit()}
                aria-label="Fit the whole die"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
                </svg>
              </button>
            </div>
            <div className={s.scale} aria-hidden="true">
              <span ref={scaleBar} className={s.scaleBar} />
              <span ref={scaleLabel}>1 mm</span>
            </div>
          </div>

          <canvas
            ref={minimap}
            className={s.minimap}
            aria-label="Minimap: click or drag to move the view"
            role="img"
          />

          <p className={s.hint} data-hidden={touched || undefined} aria-hidden="true">
            <span className={s.hintWide}>Scroll to zoom · drag to pan · click a block</span>
            <span className={s.hintNarrow}>Pinch to zoom · drag to pan · tap a block</span>
          </p>
        </section>

        <aside ref={guide} className={s.guide} aria-label="Block guide">
          <nav className={s.index} aria-label="Blocks on the die">
            <ul>
              {BLOCKS.map((bl) => (
                <li key={bl.id}>
                  <button
                    type="button"
                    aria-current={sel === bl.id || undefined}
                    onClick={() => go(bl.id)}
                    style={{ '--cat': CATS[bl.cat].color } as React.CSSProperties}
                  >
                    <span className={s.dot} data-live={bl.live || undefined} aria-hidden="true" />
                    <b>{bl.tag}</b>
                    <span>{bl.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <p className={s.srOnly} aria-live="polite">
            {`${b.tag}, ${b.name}`}
          </p>
          <Guide id={sel} part={part} act={act} />
          <Legend />
          <footer className={s.foot}>
            <span>{`${conceptTitle('x-ray')} · a concept for ${db.person.site}`}</span>
            <span>Generated, not photographed: every structure is procedural.</span>
          </footer>
        </aside>
      </div>
    </div>
  );
}
