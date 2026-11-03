'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { concept } from '../_shared/concepts';
import { useInView, useReducedMotion } from '../_shared/hooks';
import type { Spot } from './build';
import { decodePage, plainText } from './decode';
import { CYCLE_SECONDS, Tv } from './engine';
import { SCREEN_H, SCREEN_W, charOf } from './glyphs';
import { PAGES, SERVICE } from './pages';
import { average, raster } from './raster';
import ReadAsPage from './ReadAsPage';
import Remote, { KEYS, type Action } from './Remote';
import s from './teletext.module.scss';

const credit = concept('teletext');

/* ------------------------------------------------------------------ small stores */

// "Read as a page" lives in the URL hash, so it can be linked and survives a reload.
const viewListeners = new Set<() => void>();
const subscribeView = (fn: () => void) => {
  viewListeners.add(fn);
  window.addEventListener('hashchange', fn);
  return () => {
    viewListeners.delete(fn);
    window.removeEventListener('hashchange', fn);
  };
};
const readView = () => window.location.hash === '#read';
function setReadView(on: boolean) {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', on ? `${pathname}${search}#read` : `${pathname}${search}`);
  viewListeners.forEach((fn) => fn());
}

// The CRT effects (scanlines, glass and glow) are a preference kept per visitor.
const CRT_KEY = 'teletext-crt';
const crtListeners = new Set<() => void>();
const subscribeCrt = (fn: () => void) => {
  crtListeners.add(fn);
  return () => {
    crtListeners.delete(fn);
  };
};
const readCrt = () => {
  try {
    return localStorage.getItem(CRT_KEY) !== 'off';
  } catch {
    return true;
  }
};
function setCrt(on: boolean) {
  try {
    localStorage.setItem(CRT_KEY, on ? 'on' : 'off');
  } catch {
    // Storage can be blocked; the choice holds until reload.
  }
  crtListeners.forEach((fn) => fn());
}

/* ------------------------------------------------------------------ the screen */

function open(href: string) {
  if (href.startsWith('mailto:')) window.location.href = href;
  else window.open(href, '_blank', 'noopener,noreferrer');
}

interface ScreenProps {
  tv: Tv;
  crt: boolean;
  reduced: boolean;
  label: string;
  onAmbient: (rgb: [number, number, number]) => void;
}

/** The picture tube: decodes the rows the set composes and scans them onto a canvas. */
function Screen({ tv, crt, reduced, label, onAmbient }: ScreenProps) {
  const [box, visible] = useInView<HTMLDivElement>(false, 0.01);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const ambientRef = useRef(onAmbient);
  useEffect(() => {
    ambientRef.current = onAmbient;
  });

  useEffect(() => {
    const canvas = canvasRef.current,
      wrap = box.current;
    if (!canvas || !wrap || !visible) return;
    const ctx = canvas.getContext('2d');
    const off = document.createElement('canvas');
    off.width = SCREEN_W;
    off.height = SCREEN_H;
    const octx = off.getContext('2d');
    if (!ctx || !octx) return;
    const img = octx.createImageData(SCREEN_W, SCREEN_H);
    const px = new Uint32Array(img.data.buffer);
    let lastVersion = -1,
      lastFlash = false,
      hasFlash = false,
      filling = false,
      dirty = true,
      lastArrivals = -1;

    const fit = () => {
      // Layout size, not the bounding box: the switch-on animation scales the tube.
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      // One scanline per pair of logical lines: the 240 lines of a field.
      wrap.style.setProperty('--scan', `${(h / 240).toFixed(3)}px`);
      dirty = true;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    let raf = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      tv.advance(ms / 1000, new Date());
      // Flash runs three parts on to one part off, once a second.
      const flashOff = !reduced && ms % 1000 >= 750;
      if (!dirty && !filling && tv.version === lastVersion && !(hasFlash && flashOff !== lastFlash))
        return;
      dirty = false;
      lastVersion = tv.version;
      lastFlash = flashOff;
      const out = tv.compose(reduced);
      filling = out.filling;
      const cells = decodePage(out.rows);
      hasFlash = cells.some((row) => row.some((c) => c.flash));
      const { size, reveal, arrivals } = tv.getSnapshot();
      raster(px, cells, { flashOff, reveal });
      octx.putImageData(img, 0, 0);
      const sy = size === 2 ? SCREEN_H / 2 : 0,
        sh = size ? SCREEN_H / 2 : SCREEN_H;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, sy, SCREEN_W, sh, 0, 0, canvas.width, canvas.height);
      const glow = glowRef.current?.getContext('2d');
      if (glow && crt) {
        glow.imageSmoothingEnabled = true;
        glow.drawImage(off, 0, sy, SCREEN_W, sh, 0, 0, glow.canvas.width, glow.canvas.height);
      }
      if (arrivals !== lastArrivals && !filling) {
        lastArrivals = arrivals;
        ambientRef.current(average(px));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [tv, visible, reduced, crt, box]);

  const spotAt = (
    e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>,
  ): Spot | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const { size } = tv.getSnapshot();
    const col = Math.floor(((e.clientX - r.left) / r.width) * 40);
    const row =
      Math.floor(((e.clientY - r.top) / r.height) * (size ? 12 : 24)) + (size === 2 ? 12 : 0);
    return tv.spotAt(row, col);
  };

  return (
    <div ref={box} className={s.tube} data-crt={crt || undefined}>
      <canvas
        ref={canvasRef}
        className={s.canvas}
        role="img"
        aria-label={label}
        onPointerMove={(e) => {
          e.currentTarget.style.cursor = spotAt(e) ? 'pointer' : '';
        }}
        onClick={(e) => {
          const spot = spotAt(e);
          if (!spot) return;
          if (spot.key !== undefined) tv.fastext(spot.key);
          else if (spot.go) tv.go(spot.go);
          else if (spot.href) open(spot.href);
        }}
      />
      {crt && (
        <canvas ref={glowRef} className={s.glow} width={160} height={128} aria-hidden="true" />
      )}
      {crt && <div className={s.scanlines} aria-hidden="true" />}
    </div>
  );
}

/* ------------------------------------------------------------------ the room */

// What a page offers besides its picture: its text for screen readers and the page numbers on it.
const infoCache = new Map<string, { lines: string[]; onScreen: { num: number; text: string }[] }>();
function pageInfo(num: number, subIndex: number) {
  const key = `${num}/${subIndex}`;
  const hit = infoCache.get(key);
  if (hit) return hit;
  const page = PAGES.get(num);
  const sub = page?.subs[subIndex] ?? page?.subs[0];
  const seen = new Set<number>();
  const info = {
    lines: sub
      ? plainText(decodePage([new Array<number>(40).fill(0x20), ...sub.rows.slice(1)]))
      : [],
    onScreen: (sub?.spots ?? []).flatMap((sp) => {
      if (!sp.go || seen.has(sp.go) || !sub) return [];
      seen.add(sp.go);
      return [{ num: sp.go, text: spotText(sub.rows, sp) }];
    }),
  };
  infoCache.set(key, info);
  return info;
}

const spotText = (rows: number[][], spot: Spot) =>
  rows[spot.row]
    .slice(spot.c0, spot.c1)
    .map((c) => (c < 0x20 ? ' ' : charOf(c)))
    .join('')
    .trim();

export default function Teletext() {
  const reduced = useReducedMotion();
  const [tv] = useState(() => new Tv());
  const snap = useSyncExternalStore(tv.subscribe, tv.getSnapshot, tv.getSnapshot);
  const read = useSyncExternalStore(subscribeView, readView, () => false);
  const crt = useSyncExternalStore(subscribeCrt, readCrt, () => true);
  const [lit, setLit] = useState<Action | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const litTimer = useRef(0);

  const run = useCallback(
    (a: Action) => {
      if (a.startsWith('d')) tv.digit(Number(a.slice(1)));
      else if (a === 'red') tv.fastext(0);
      else if (a === 'green') tv.fastext(1);
      else if (a === 'yellow') tv.fastext(2);
      else if (a === 'blue') tv.fastext(3);
      else if (a === 'up') tv.step(1);
      else if (a === 'down') tv.step(-1);
      else if (a === 'left') tv.subStep(-1);
      else if (a === 'right') tv.subStep(1);
      else if (a === 'hold') tv.toggleHold();
      else if (a === 'reveal') tv.toggleReveal();
      else if (a === 'size') tv.cycleSize();
      else if (a === 'index') tv.go(100);
      else if (a === 'cancel') tv.cancel();
    },
    [tv],
  );

  const press = useCallback(
    (a: Action) => {
      run(a);
      setLit(a);
      window.clearTimeout(litTimer.current);
      litTimer.current = window.setTimeout(() => setLit(null), 160);
    },
    [run],
  );

  // The remote's keys on the keyboard, while the set is on and nothing else has focus.
  useEffect(() => {
    if (read) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (target && target !== document.body && !rootRef.current?.contains(target)) return;
      const a = KEYS[e.key];
      if (!a) return;
      e.preventDefault();
      press(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [read, press]);

  useEffect(() => () => window.clearTimeout(litTimer.current), []);

  const onAmbient = useCallback(([r, g, b]: [number, number, number]) => {
    const el = rootRef.current;
    if (!el) return;
    const m = Math.max(r, g, b, 1);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    el.style.setProperty(
      '--ambient',
      `${Math.round((r / m) * 255)}, ${Math.round((g / m) * 255)}, ${Math.round((b / m) * 255)}`,
    );
    el.style.setProperty('--ambient-a', Math.min(0.5, 0.16 + lum * 1.4).toFixed(3));
  }, []);

  const watch = useCallback(
    (num: number) => {
      setReadView(false);
      tv.go(num);
      window.scrollTo({ top: 0 });
    },
    [tv],
  );

  const page = PAGES.get(snap.page) ?? PAGES.get(100);
  const { lines, onScreen } = pageInfo(snap.page, snap.sub);

  const label = `Teletext page ${snap.page}, ${page?.title ?? ''}${snap.subs > 1 ? `, subpage ${snap.sub + 1} of ${snap.subs}` : ''}`;
  let status: string;
  if (snap.entry) status = `Keying P${snap.entry.padEnd(3, '-')}`;
  else if (snap.target !== null && snap.lost)
    status = `P${snap.target} has not come round in a whole cycle, so it is not in service. Try the index, 100, or the A-Z on 199.`;
  else if (snap.target !== null)
    status = `Searching for P${snap.target}. It is on air in turn, so it can take a few seconds.`;
  else
    status = `P${snap.page} · ${page?.title ?? ''}${snap.subs > 1 ? ` · subpage ${snap.sub + 1} of ${snap.subs}` : ''}${snap.hold ? ' · held' : ''}${snap.reveal ? ' · revealed' : ''}`;

  return (
    <div ref={rootRef} className={s.root} data-view={read ? 'read' : 'tv'}>
      <header className={s.bar}>
        <p className={s.credit}>
          <b>{credit.letter}</b>
          <span>{credit.name}</span>
        </p>
        <div className={s.barTools}>
          {!read && (
            <button
              type="button"
              className={s.barButton}
              aria-pressed={crt}
              onClick={() => setCrt(!crt)}
            >
              CRT effects
            </button>
          )}
          <button
            type="button"
            className={`${s.barButton} ${s.barPrimary}`}
            onClick={() => setReadView(!read)}
          >
            {read ? 'Back to the set' : 'Read as a page'}
          </button>
        </div>
      </header>

      {read ? (
        <ReadAsPage onWatch={watch} />
      ) : (
        <main className={s.stage}>
          <div className={s.set}>
            <div className={s.tv}>
              <div className={s.bezel}>
                <Screen tv={tv} crt={crt} reduced={reduced} label={label} onAmbient={onAmbient} />
              </div>
              <div className={s.chin}>
                <span className={s.badge}>{credit.name}</span>
                <span className={s.grille} aria-hidden="true" />
                <span className={s.led} aria-hidden="true" />
              </div>
            </div>
            <Remote
              lit={lit}
              hold={snap.hold}
              reveal={snap.reveal}
              size={snap.size}
              onPress={press}
            />
          </div>
          <div className={s.shelf} aria-hidden="true" />
          <div className={s.below}>
            <section className={s.onScreen} aria-label="This page">
              <p className={s.status} aria-live="polite">
                {status}
              </p>
              {(onScreen.length > 0 || (page?.links.length ?? 0) > 0) && (
                <nav className={s.chips} aria-label="Pages and links on screen">
                  {onScreen.map((o) => (
                    <button
                      key={o.num}
                      type="button"
                      className={s.chip}
                      onClick={() => tv.go(o.num)}
                    >
                      <b>{o.num}</b>
                      {o.text && o.text !== String(o.num) ? ` ${o.text}` : ''}
                    </button>
                  ))}
                  {page?.links.map((l) => (
                    <a
                      key={l.href}
                      className={`${s.chip} ${s.chipLink}`}
                      href={l.href}
                      target={l.href.startsWith('mailto:') ? undefined : '_blank'}
                      rel="noreferrer"
                    >
                      {l.label}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  ))}
                </nav>
              )}
              <div className={s.srOnly}>
                {lines.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            </section>
            <aside className={s.guide} aria-label="Quick guide">
              <h2>
                {SERVICE} <span>quick guide</span>
              </h2>
              <dl>
                <dt>0–9</dt>
                <dd>Key a page number</dd>
                <dt>R G Y B</dt>
                <dd>Fastext keys (or F1–F4)</dd>
                <dt>↑ ↓</dt>
                <dd>Next or previous page</dd>
                <dt>← →</dt>
                <dd>Step through subpages</dd>
                <dt>H · V · S</dt>
                <dd>Hold, reveal, double height</dd>
                <dt>I · Esc</dt>
                <dd>Index, cancel a search</dd>
              </dl>
              <p>
                Pages arrive as the carousel comes round, about every {Math.round(CYCLE_SECONDS)}{' '}
                seconds. Fastext pages are caught ahead and come up at once.
              </p>
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
