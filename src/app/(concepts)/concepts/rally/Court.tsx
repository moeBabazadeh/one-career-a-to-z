'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAnimationFrame, useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import { CHAPTERS, ZONES } from './Chapters';
import {
  FALLBACK,
  camera,
  drawScene,
  onPlaneY,
  onTable,
  spinOrient,
  type Camera,
  type Palette,
  type Scene,
} from './draw';
import {
  Game,
  LEVELS,
  REC,
  SPINS,
  zoneAt,
  zoneName,
  type GameEvent,
  type Level,
  type Phase,
  type Replay,
  type ServeSpin,
  type Side,
} from './game';
import { HL, HW, spinParts, v3, type V3 } from './sim';
import s from './rally.module.scss';

export interface Snapshot {
  you: number;
  bot: number;
  gamesYou: number;
  gamesBot: number;
  server: Side;
  rally: number;
}

const TOKENS: [keyof Palette, string][] = [
  ['hall', '--k-hall'],
  ['hallLow', '--k-hall-low'],
  ['floor', '--k-floor'],
  ['floorLine', '--k-floor-line'],
  ['spot', '--k-spot'],
  ['table', '--k-table'],
  ['tableFar', '--k-table-far'],
  ['tableEdge', '--k-table-edge'],
  ['frame', '--k-frame'],
  ['line', '--k-line'],
  ['net', '--k-net'],
  ['tape', '--k-tape'],
  ['ball', '--k-ball'],
  ['ballShade', '--k-ball-shade'],
  ['shadow', '--k-shadow'],
  ['you', '--k-you'],
  ['youEdge', '--k-you-edge'],
  ['bot', '--k-bot'],
  ['botEdge', '--k-bot-edge'],
  ['arm', '--k-arm'],
  ['zone', '--k-zone'],
  ['zoneInk', '--k-zone-ink'],
  ['zoneOpen', '--k-zone-open'],
  ['aim', '--k-aim'],
  ['guide', '--k-guide'],
  ['barrier', '--k-barrier'],
  ['barrierInk', '--k-barrier-ink'],
];

const subscribeHidden = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};
/** True while the tab is in view. */
const usePageVisible = () =>
  useSyncExternalStore(
    subscribeHidden,
    () => document.visibilityState === 'visible',
    () => true,
  );

const CALLS: Record<string, string> = {
  Long: 'Long',
  Wide: 'Wide',
  Net: 'Net',
  Missed: 'Missed',
  Fault: 'Fault',
  Let: 'Let, serve again',
};

const RATES = [0.25, 0.5, 1];
const LEVEL_KEYS = Object.keys(LEVELS) as Level[];
const SPIN_KEYS = Object.keys(SPINS) as ServeSpin[];
const two = (n: number) => String(n).padStart(2, '0');

/** A frame of the last point at time t, interpolated. */
function frameAt(r: Replay, t: number): number[] {
  const f = r.frames;
  const n = f.length / REC;
  if (!n) return [];
  let i = 0;
  while (i < n - 1 && f[(i + 1) * REC] <= t) i++;
  const j = Math.min(n - 1, i + 1);
  const a = f[i * REC];
  const b = f[j * REC];
  const k = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
  const out: number[] = [];
  for (let c = 0; c < REC; c++) out.push(f[i * REC + c] + (f[j * REC + c] - f[i * REC + c]) * k);
  return out;
}

const at = (f: number[], i: number): V3 => v3(f[i], f[i + 1], f[i + 2]);

export default function Court({
  onEvent,
  onReset,
}: {
  onEvent: (e: GameEvent, snap: Snapshot) => void;
  onReset: () => void;
}) {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const pageVisible = usePageVisible();
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.05);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLSpanElement>(null);

  const [level, setLevel] = useState<Level>('feed');
  const [spin, setSpin] = useState<ServeSpin>('top');
  const [guide, setGuide] = useState(true);
  const [slow, setSlow] = useState(false);
  const [footwork, setFootwork] = useState(true);
  const [anyway, setAnyway] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [server, setServer] = useState<Side>('you');
  const [hasReplay, setHasReplay] = useState(false);
  const [replay, setReplay] = useState<{ playing: boolean; rate: number } | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [call, setCall] = useState<{ key: number; text: string; who: string } | null>(null);
  const [touch, setTouch] = useState(false);
  const [aimZone, setAimZone] = useState(ZONES.indexOf(0));
  const [replayLen, setReplayLen] = useState(1);

  const game = useRef<Game | null>(null);
  const cam = useRef<Camera | null>(null);
  const pal = useRef<Palette>(FALLBACK);
  const pointer = useRef<{ x: number; y: number; touch: boolean } | null>(null);
  const hover = useRef<number | null>(null);
  const orient = useRef([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const flash = useRef<{ chapter: number; t: number } | null>(null);
  const last = useRef(0);
  /** When the visitor last touched the controls, so a table waiting for a serve can stop repainting. */
  const lastInput = useRef(0);
  const rp = useRef({ t: 0 });
  const opts = useRef({ guide, slow, replay });
  useEffect(() => {
    opts.current = { guide, slow, replay };
  });

  const motion = !reduced || anyway;
  const active = visible && pageVisible && motion;

  /* -------------------------------------------------------------- drawing */

  const paint = useCallback((dt = 0) => {
    const el = canvas.current;
    const g = game.current;
    const ctx = el?.getContext('2d');
    if (!el || !g || !ctx) return;
    const c = cam.current;
    if (!c) return;
    const o = opts.current;
    let sc: Scene;
    const base = {
      t: g.t,
      zones: ZONES,
      labels: CHAPTERS.map((ch) => ch.short),
      opened: g.opened,
      flash: flash.current,
      marks: g.marks,
      compact: c.w < 520,
      orient: orient.current,
    };
    if (o.replay && g.last) {
      // the last point, from the record
      const r = g.last;
      const f = frameAt(r, rp.current.t);
      if (!f.length) return;
      const n = r.frames.length / REC;
      const path: V3[] = [];
      for (let i = 0; i < n; i += 2) path.push(at(r.frames, i * REC + 1));
      const trail: V3[] = [];
      const i0 = Math.max(0, Math.floor(rp.current.t * 120) - 18);
      for (let i = i0; i < Math.min(n, i0 + 18); i++)
        if (r.frames[i * REC] <= rp.current.t) trail.push(at(r.frames, i * REC + 1));
      if (dt) spinOrient(orient.current, at(f, 4), dt * o.replay.rate);
      // the ball's speed and spin at this moment, from the record
      const f2 = frameAt(r, rp.current.t + 0.012);
      const vel = v3((f2[1] - f[1]) / 0.012, (f2[2] - f[2]) / 0.012, (f2[3] - f[3]) / 0.012);
      const w = at(f, 4);
      const { top } = spinParts({ p: at(f, 1), v: vel, w });
      const spinRpm = (Math.hypot(w.x, w.y, w.z) * 60) / (2 * Math.PI);
      if (readout.current)
        readout.current.textContent = `${rp.current.t.toFixed(2)} s · ${Math.round(Math.hypot(vel.x, vel.y, vel.z) * 3.6)} km/h · ${(spinRpm / 1000).toFixed(1)}k rpm ${spinRpm < 200 ? '' : top >= 0 ? 'topspin' : 'backspin'}`;
      sc = {
        ...base,
        ball: at(f, 1),
        trail,
        you: { p: at(f, 7), angle: 0, since: 9 },
        bot: { p: at(f, 10), angle: 0, since: 9 },
        youIdle: false,
        aimZone: null,
        hoverZone: null,
        guide: null,
        bounce: null,
        timing: null,
        replay: { path, hits: r.hits },
      };
    } else {
      if (dt) spinOrient(orient.current, g.ball.w, dt);
      const yours = g.phase === 'ready' && g.score.server === 'you';
      const inc = g.incoming;
      const keys = g.input.mode === 'keys' && g.phase === 'live' && inc;
      const until = inc ? inc.crossT - g.t : 0;
      if (o.guide) g.updateGuide();
      sc = {
        ...base,
        ball: g.ball.p,
        trail: g.trail,
        you: g.you,
        bot: g.bot,
        youIdle: yours || g.phase === 'toss',
        aimZone: yours ? g.serveZone : null,
        hoverZone: yours ? hover.current : null,
        guide: o.guide ? g.guide : null,
        bounce: o.guide && inc ? inc.bounce : null,
        timing: keys
          ? { k: Math.min(1, Math.max(0, until / 0.6)), hot: until < 0.17 && until > -0.03 }
          : null,
        replay: null,
      };
    }
    drawScene(ctx, c, pal.current, sc);
  }, []);

  const fit = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 600;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    el.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam.current = camera(w, h);
    paint();
  }, [paint]);

  // the game, the camera, and a size that follows the canvas
  useEffect(() => {
    const g = new Game(ZONES, CHAPTERS.length);
    g.aimAtNext();
    g.unproject = (y) => {
      const p = pointer.current;
      if (!p) return null;
      return cam.current ? onPlaneY(cam.current, p.x, p.y - (p.touch ? 36 : 0), y) : null;
    };
    game.current = g;
    const el = canvas.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    pal.current = {
      ...pal.current,
      display: css.getPropertyValue('--font-saira-cond').trim() || 'sans-serif',
      mono: css.getPropertyValue('--font-geist-mono').trim() || 'monospace',
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready.then(() => paint());
    return () => ro.disconnect();
  }, [fit, paint]);

  // light or dark: the hall's colours come from the page's tokens
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const next = { ...pal.current };
    for (const [key, name] of TOKENS) next[key] = token(el, name) || FALLBACK[key];
    pal.current = next;
    paint();
  }, [scheme, paint]);

  useEffect(() => {
    const g = game.current;
    if (!g) return;
    g.settings = { level, spin, footwork };
    paint();
  }, [level, spin, footwork, guide, paint]);

  /* -------------------------------------------------------------- events */

  const flush = useCallback(() => {
    const g = game.current;
    if (!g || !g.events.length) return;
    const events = g.events.splice(0);
    const snap: Snapshot = { ...g.score, rally: g.rally };
    for (const e of events) {
      if (e.type === 'phase') {
        setPhase(e.phase);
        setServer(e.server);
        if (e.phase === 'ready') setAimZone(g.serveZone);
        if (e.phase === 'dead') setHasReplay(!!g.last);
      } else if (e.type === 'land' && e.fresh) {
        flash.current = { chapter: e.chapter, t: g.t };
        setToast({ key: g.t, text: `${two(e.chapter + 1)} · ${CHAPTERS[e.chapter].title}` });
      } else if (e.type === 'point') {
        setCall({
          key: g.t,
          text: CALLS[e.call],
          who: e.winner === 'you' ? 'Point to you' : 'Point to the bot',
        });
      } else if (e.type === 'let') {
        setCall({ key: g.t, text: CALLS.Let, who: 'No point' });
      }
      onEvent(e, snap);
    }
  }, [onEvent]);

  useAnimationFrame((sec) => {
    const g = game.current;
    if (!g) return;
    const dt = last.current ? Math.min(0.05, sec - last.current) : 0;
    last.current = sec;
    const o = opts.current;
    if (o.replay && g.last) {
      if (o.replay.playing) {
        rp.current.t += dt * o.replay.rate;
        if (rp.current.t >= g.last.duration) {
          rp.current.t = g.last.duration;
          setReplay({ ...o.replay, playing: false });
        }
        if (scrub.current) scrub.current.value = String(rp.current.t);
      }
      paint(dt);
      return;
    }
    // waiting for your serve with nothing moving: skip the work until something happens
    if (
      g.phase === 'ready' &&
      g.score.server === 'you' &&
      g.t - g.readyAt > 1.5 &&
      sec * 1000 - lastInput.current > 1500
    )
      return;
    g.advance(dt * (o.slow ? 0.45 : 1));
    paint(dt);
    flush();
  }, active);

  // a paused loop restarts its clock rather than jumping
  useEffect(() => {
    if (!active) last.current = 0;
    paint();
  }, [active, paint]);

  // toasts and calls fade on their own
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!call) return;
    const id = setTimeout(() => setCall(null), 1800);
    return () => clearTimeout(id);
  }, [call]);

  /* -------------------------------------------------------------- commands */

  const serve = (zone?: number) => {
    const g = game.current;
    if (!g || !motion) return;
    if (g.serve(zone)) flush();
  };

  const startReplay = () => {
    const g = game.current;
    if (!g?.last || g.phase === 'live' || g.phase === 'toss') return;
    // with reduced motion the whole path is shown at once and the slider moves the ball
    rp.current.t = reduced && !anyway ? g.last.duration : 0;
    setReplayLen(g.last.duration);
    setReplay({ playing: !reduced || anyway, rate: 0.25 });
  };

  const stopReplay = () => {
    setReplay(null);
    requestAnimationFrame(() => paint());
  };

  useEffect(() => {
    if (scrub.current && replay) scrub.current.value = String(rp.current.t);
    paint();
  }, [replay, paint]);

  const reset = () => {
    const g = game.current;
    if (!g) return;
    g.reset();
    setAimZone(g.serveZone);
    flash.current = null;
    setReplay(null);
    setHasReplay(false);
    setPhase('ready');
    setServer('you');
    g.events.length = 0;
    onReset();
    paint();
  };

  /* -------------------------------------------------------------- input */

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** The zone of the bot's half under a screen point, if any. */
  const zoneUnder = (x: number, y: number) => {
    const p = cam.current ? onTable(cam.current, x, y) : null;
    if (!p || p.y < 0 || p.y > HL || Math.abs(p.x) > HW) return null;
    return zoneAt(p.x, p.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = game.current;
    if (!g) return;
    lastInput.current = e.timeStamp;
    const p = local(e);
    const isTouch = e.pointerType === 'touch';
    pointer.current = { ...p, touch: isTouch };
    g.input.mode = 'pointer';
    g.input.aim = { x: 0, z: 0 };
    hover.current = g.phase === 'ready' && g.score.server === 'you' ? zoneUnder(p.x, p.y) : null;
    if (!active) paint();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = game.current;
    if (!g) return;
    lastInput.current = e.timeStamp;
    const p = local(e);
    const isTouch = e.pointerType === 'touch';
    if (isTouch !== touch) setTouch(isTouch);
    pointer.current = { ...p, touch: isTouch };
    g.input.mode = 'pointer';
    g.input.aim = { x: 0, z: 0 };
    if (isTouch) e.currentTarget.setPointerCapture(e.pointerId);
    if (replay) return;
    if (g.phase === 'ready' && g.score.server === 'you') {
      const z = zoneUnder(p.x, p.y);
      serve(z ?? undefined);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const g = game.current;
    if (!g) return;
    lastInput.current = e.timeStamp;
    const k = e.key;
    const yours = g.phase === 'ready' && g.score.server === 'you';
    if (k === 'Escape' && replay) {
      stopReplay();
      return;
    }
    if (k === 'r' || k === 'R') {
      e.preventDefault();
      if (replay) stopReplay();
      else startReplay();
      return;
    }
    if (replay) return;
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      if (yours) {
        const col = g.serveZone % 3;
        const row = Math.floor(g.serveZone / 3);
        const nc = Math.max(
          0,
          Math.min(2, col + (k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0)),
        );
        const nr = Math.max(
          0,
          Math.min(2, row + (k === 'ArrowUp' ? 1 : k === 'ArrowDown' ? -1 : 0)),
        );
        g.serveZone = nr * 3 + nc;
        setAimZone(g.serveZone);
        if (!active) paint();
        return;
      }
      g.input.mode = 'keys';
      if (k === 'ArrowLeft') g.input.left = true;
      if (k === 'ArrowRight') g.input.right = true;
      if (k === 'ArrowUp') g.input.up = true;
      if (k === 'ArrowDown') g.input.down = true;
      return;
    }
    if (k === ' ' || k === 'Enter' || k === 'c' || k === 'C') {
      e.preventDefault();
      if (yours) {
        g.input.mode = 'keys';
        serve();
        return;
      }
      g.input.mode = 'keys';
      if (k === 'c' || k === 'C' || e.shiftKey) g.input.chop = g.t;
      else g.input.drive = g.t;
    }
  };

  const onKeyUp = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const g = game.current;
    if (!g) return;
    if (e.key === 'ArrowLeft') g.input.left = false;
    if (e.key === 'ArrowRight') g.input.right = false;
    if (e.key === 'ArrowUp') g.input.up = false;
    if (e.key === 'ArrowDown') g.input.down = false;
  };

  const yours = phase === 'ready' && server === 'you';
  const prompt = !motion
    ? null
    : replay
      ? null
      : yours
        ? touch
          ? 'Your serve: tap a zone to serve into it'
          : 'Your serve: click a zone, or press Space'
        : phase === 'ready'
          ? 'The bot serves'
          : null;

  return (
    <div className={s.court}>
      <div
        ref={wrap}
        className={s.tableWrap}
        data-live={phase === 'live' || phase === 'toss' || undefined}
      >
        <canvas
          ref={canvas}
          className={s.canvas}
          role="application"
          tabIndex={0}
          aria-label="The table. Move your paddle with the mouse or a finger and swing up through the ball to drive it, down to chop it, or hold still to block. With the keyboard: arrow keys aim your serve, Space serves; in a rally, Space swings, C chops and the arrows aim. R replays the last point."
          aria-describedby="rally-keys"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerLeave={(e) => {
            hover.current = null;
            lastInput.current = e.timeStamp;
            if (!active) paint();
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={() => {
            const gm = game.current;
            if (gm) Object.assign(gm.input, { left: false, right: false, up: false, down: false });
          }}
        />

        {toast && (
          <p key={toast.key} className={s.toast} aria-hidden="true">
            <small>Opened</small>
            {toast.text}
          </p>
        )}
        {call && (
          <p key={call.key} className={s.call} aria-hidden="true">
            <b>{call.text}</b>
            <small>{call.who}</small>
          </p>
        )}
        {prompt && !toast && (
          <p className={s.prompt} aria-hidden="true">
            {prompt}
          </p>
        )}
        {replay && (
          <p className={s.replayBadge} aria-hidden="true">
            Replay · {replay.rate === 1 ? '1×' : replay.rate === 0.5 ? '½×' : '¼×'}
          </p>
        )}
        {!motion && (
          <div className={s.still}>
            <p>
              <b>Reduced motion is on, so the rally waits for you.</b> The table above shows where
              each chapter lives. Every chapter is in the page below.
            </p>
            <div>
              <button type="button" onClick={() => setAnyway(true)}>
                Play anyway
              </button>
              <a href="#sheet">Read without playing ↓</a>
            </div>
          </div>
        )}
      </div>

      <div className={s.controls}>
        {replay ? (
          <div className={s.replayBar} role="group" aria-label="Replay of the last point">
            {(!reduced || anyway) && (
              <button
                type="button"
                className={s.primary}
                onClick={() => {
                  if (rp.current.t >= replayLen) rp.current.t = 0;
                  setReplay({ ...replay, playing: !replay.playing });
                }}
              >
                {replay.playing ? 'Pause' : 'Play'}
              </button>
            )}
            {(!reduced || anyway) && (
              <div className={s.seg} role="radiogroup" aria-label="Replay speed">
                {RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={replay.rate === r}
                    onClick={() => setReplay({ ...replay, rate: r })}
                  >
                    {r === 1 ? '1×' : r === 0.5 ? '½×' : '¼×'}
                  </button>
                ))}
              </div>
            )}
            <label className={s.scrub}>
              <span>Time</span>
              <input
                ref={scrub}
                type="range"
                min={0}
                max={replayLen}
                step={0.005}
                defaultValue={0}
                aria-label="Replay position, seconds into the point"
                onChange={(e) => {
                  rp.current.t = Number(e.target.value);
                  if (replay.playing) setReplay({ ...replay, playing: false });
                  paint();
                }}
              />
            </label>
            <span ref={readout} className={s.readout} aria-hidden="true" />
            <button type="button" onClick={stopReplay}>
              Close replay
            </button>
          </div>
        ) : (
          <>
            <div className={s.row}>
              <button
                type="button"
                className={s.primary}
                disabled={!yours || !motion}
                onClick={() => {
                  serve();
                  // the rally is played on the table: keys go there next
                  canvas.current?.focus({ preventScroll: true });
                }}
              >
                Serve
                <kbd>Space</kbd>
              </button>
              <div className={s.seg} role="radiogroup" aria-label="Serve spin">
                {SPIN_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={spin === k}
                    onClick={() => setSpin(k)}
                  >
                    {SPINS[k].label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={startReplay}
                disabled={!hasReplay || phase === 'live' || phase === 'toss'}
              >
                Replay last point
                <kbd>R</kbd>
              </button>
            </div>
            <div className={s.row}>
              <div className={s.seg} role="radiogroup" aria-label="Bot level">
                {LEVEL_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={level === k}
                    title={`The ${LEVELS[k].label.toLowerCase()} ${LEVELS[k].hint}.`}
                    onClick={() => setLevel(k)}
                  >
                    {LEVELS[k].label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={s.toggle}
                aria-pressed={guide}
                onClick={() => setGuide(!guide)}
              >
                Aim guide
              </button>
              {motion && (
                <button
                  type="button"
                  className={s.toggle}
                  aria-pressed={slow}
                  onClick={() => setSlow(!slow)}
                >
                  Slow-mo
                </button>
              )}
              <button
                type="button"
                className={s.toggle}
                aria-pressed={footwork}
                onClick={() => setFootwork(!footwork)}
                title="With the keyboard, your paddle moves to the ball and the arrows aim"
              >
                Auto-footwork
              </button>
              <button type="button" className={s.quiet} onClick={reset}>
                New match
              </button>
            </div>
          </>
        )}
        <p id="rally-keys" className={s.keys}>
          <span>
            <b>Bot</b> {LEVELS[level].hint}.
          </span>
          {touch ? (
            <span>
              Tap a zone to serve into it. Then drag the paddle: flick up through the ball to drive,
              down to chop, hold still to block.
            </span>
          ) : (
            <span>
              Mouse: click a zone to serve, then swing up through the ball to drive, down to chop,
              or hold still to block. Keys: <kbd>←</kbd>
              <kbd>↑</kbd>
              <kbd>→</kbd>
              <kbd>↓</kbd> aim the serve and <kbd>Space</kbd> serves; in a rally <kbd>←</kbd>
              <kbd>→</kbd> aim, <kbd>Space</kbd> drives, <kbd>C</kbd> chops; <kbd>R</kbd> replays.
            </span>
          )}
          {yours && (
            <span
              className={s.sr}
            >{`Serve aimed at the ${zoneName(aimZone)} zone: ${CHAPTERS[ZONES[aimZone]].title}.`}</span>
          )}
        </p>
      </div>
    </div>
  );
}
