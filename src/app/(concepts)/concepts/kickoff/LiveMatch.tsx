'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  useAnimationFrame,
  useInView,
  useReducedMotion,
  useScaledCanvas,
  useScheme,
} from '../_shared/hooks';
import { token } from '../_shared/scheme';
import { FLOODLIT, H, S, W, drawMatch, type Overlays, type View } from './draw';
import {
  BOUNDARY,
  HL,
  HW,
  call,
  clampToField,
  createMatch,
  fastForward,
  hudOf,
  placeBall,
  step,
  type Call,
  type Hud,
  type Match,
  type Stage,
  type Team,
  type Vec,
} from './sim';
import s from './robocup.module.scss';

/** The seed for the match every visitor sees first. */
const SEED = 2010;
const INITIAL: Hud = hudOf(createMatch(SEED));

const PORTRAIT = '(max-width: 640px)';
const subscribePortrait = (onChange: () => void) => {
  const query = matchMedia(PORTRAIT);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
/** Phones get the field turned upright. */
const usePortrait = () =>
  useSyncExternalStore(
    subscribePortrait,
    () => matchMedia(PORTRAIT).matches,
    () => false,
  );

const STAGES: Record<Stage, string> = {
  NORMAL_FIRST_HALF: '1st half',
  NORMAL_HALF_TIME: 'Half time',
  NORMAL_SECOND_HALF: '2nd half',
  POST_GAME: 'Full time',
};

const OVERLAYS: { key: keyof Overlays; label: string; hint: string }[] = [
  { key: 'vision', label: 'Vision', hint: 'ssl-vision detections from the two overhead cameras' },
  { key: 'paths', label: 'Paths', hint: 'planned paths and the RRT trees behind them' },
  { key: 'velocity', label: 'Velocity', hint: 'velocity vectors and where the ball will stop' },
  {
    key: 'lanes',
    label: 'Pass lanes',
    hint: 'pass options scored 0 to 1, and the open part of the goal',
  },
];

const RESTARTS: { call: Call; label: string }[] = [
  { call: 'KICKOFF', label: 'Kickoff' },
  { call: 'FREE', label: 'Free kick' },
  { call: 'PENALTY', label: 'Penalty' },
];

/** Still frame for reduced motion: a one-touch pass on its way. */
const showcase = (m: Match) =>
  fastForward(m, 120, (x) => !!x.pass?.oneTouch && x.t - x.pass.at > 0.3);

function paint(
  canvas: HTMLCanvasElement | null,
  m: Match | null,
  v: View,
  o: { overlays: Overlays; portrait: boolean },
) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || !m) return;
  v.portrait = o.portrait;
  v.ui = Math.max(1, (o.portrait ? H : W) / (canvas.clientWidth || W));
  drawMatch(ctx, m, o.overlays, v);
}

export default function LiveMatch() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const portrait = usePortrait();
  const cw = portrait ? H : W,
    ch = portrait ? W : H;
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.05);
  const [hud, setHud] = useState<Hud>(INITIAL);
  const [overlays, setOverlays] = useState<Overlays>({
    vision: true,
    paths: true,
    velocity: true,
    lanes: false,
  });
  const [slow, setSlow] = useState(false);

  const match = useRef<Match | null>(null);
  const view = useRef<View>({
    portrait: false,
    ui: 1.4,
    mono: 'monospace',
    display: 'sans-serif',
    cursor: null,
    pitch: FLOODLIT,
  });
  const opts = useRef({ overlays, slow, portrait });
  const shown = useRef('');
  const last = useRef(0);
  useEffect(() => {
    opts.current = { overlays, slow, portrait };
  });

  const canvas = useScaledCanvas(cw, ch, (ctx) =>
    paint(ctx.canvas, match.current, view.current, opts.current),
  );
  const redraw = () => paint(canvas.current, match.current, view.current, opts.current);
  const sync = (m: Match) => {
    shown.current = `${m.version}|${Math.ceil(m.clock)}`;
    setHud(hudOf(m));
  };

  // Start the match, or for reduced motion, run it ahead to a still worth looking at.
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    view.current.mono = css.getPropertyValue('--font-chivo-mono').trim() || 'monospace';
    view.current.display = css.getPropertyValue('--font-bricolage').trim() || 'sans-serif';
    const m = createMatch(SEED);
    match.current = m;
    if (reduced) showcase(m);
    const frame = requestAnimationFrame(() => {
      paint(canvas.current, m, view.current, opts.current);
      shown.current = `${m.version}|${Math.ceil(m.clock)}`;
      setHud(hudOf(m));
    });
    document.fonts?.ready.then(() =>
      paint(canvas.current, match.current, view.current, opts.current),
    );
    return () => cancelAnimationFrame(frame);
  }, [reduced, canvas]);

  useAnimationFrame((sec) => {
    const m = match.current;
    if (!m) return;
    const dt = last.current ? Math.min(0.05, sec - last.current) : 0;
    last.current = sec;
    step(m, dt * (opts.current.slow ? 0.3 : 1));
    redraw();
    if (shown.current !== `${m.version}|${Math.ceil(m.clock)}`) sync(m);
  }, visible && !reduced);

  // Night or day: the carpet's colours come from the page's tokens, read once per change.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const read = (name: string, fallback: string) => token(el, name) || fallback;
    view.current.pitch = {
      carpet: read('--carpet', FLOODLIT.carpet),
      glow: read('--carpet-glow', FLOODLIT.glow),
      shade: read('--carpet-shade', FLOODLIT.shade),
      wall: read('--carpet-wall', FLOODLIT.wall),
    };
    paint(el, match.current, view.current, opts.current);
  }, [scheme, canvas]);

  // Overlay and orientation changes show up even while the match is still.
  useEffect(() => {
    paint(canvas.current, match.current, view.current, { overlays, portrait });
  }, [overlays, portrait, canvas]);

  /** With reduced motion, a command plays out off screen and the result is shown. */
  const after = (m: Match, seconds: number, until?: (x: Match) => boolean) => {
    if (reduced) fastForward(m, seconds, until);
    redraw();
    sync(m);
  };

  const referee = (what: Call, team?: Team) => {
    const m = match.current;
    if (!m) return;
    call(m, what, team);
    // restarts play out until the kick is taken; stop and force start just need a moment
    if (what === 'KICKOFF' || what === 'FREE' || what === 'PENALTY')
      after(m, 12, (x) => x.running && x.t - x.runningAt > 0.45);
    else after(m, what === 'HALT' ? 0 : 1.5);
  };

  const place = (p: Vec) => {
    const m = match.current;
    if (!m) return;
    placeBall(m, p);
    after(m, 14, (x) => x.cmd.type === 'DIRECT_FREE' && x.t - x.cmdAt > 0.4);
  };

  const toField = (e: React.MouseEvent<HTMLCanvasElement>): Vec => {
    const r = e.currentTarget.getBoundingClientRect();
    const lx = ((e.clientX - r.left) / r.width) * cw,
      ly = ((e.clientY - r.top) / r.height) * ch;
    const px = portrait ? W - ly : lx,
      py = portrait ? lx : ly;
    return { x: px / S - HL - BOUNDARY, y: py / S - HW - BOUNDARY };
  };

  const onKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const m = match.current;
    if (!m) return;
    const v = view.current;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (e.key in dirs) {
      e.preventDefault();
      const [sx, sy] = dirs[e.key];
      const [dx, dy] = portrait ? [-sy, sx] : [sx, sy];
      const c = v.cursor ?? m.ball,
        k = e.shiftKey ? 600 : 200;
      v.cursor = clampToField({ x: c.x + dx * k, y: c.y + dy * k });
      redraw();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      place(v.cursor ?? m.ball);
    }
  };

  const idle = hud.stage === 'NORMAL_HALF_TIME' || hud.stage === 'POST_GAME';

  return (
    <div className={s.live}>
      <div className={s.broadcast}>
        <div className={s.bug} id="scorebug">
          <span className={s.bugTeam} data-team="blue">
            BLUE
          </span>
          <b className={s.bugScore} aria-label={`Blue ${hud.blue}`}>
            {hud.blue}
          </b>
          <span className={s.bugClock}>
            <i>{STAGES[hud.stage]}</i>
            <b>{hud.clock}</b>
          </span>
          <b className={s.bugScore} aria-label={`Yellow ${hud.yellow}`}>
            {hud.yellow}
          </b>
          <span className={s.bugTeam} data-team="yellow">
            YELLOW
          </span>
          <span className={s.bugCmd} data-team={hud.cmdTeam}>
            <span className={s.dot} data-live={!reduced || undefined} aria-hidden="true" />
            {hud.cmd}
          </span>
        </div>

        <div ref={wrap} className={s.pitch}>
          <canvas
            ref={canvas}
            role="application"
            tabIndex={0}
            aria-label="Live Small Size League match from the overhead cameras. Click the field, or move the cursor with the arrow keys and press Enter, to have blue place the ball there."
            aria-describedby="scorebug"
            style={{ aspectRatio: `${cw} / ${ch}` }}
            onClick={(e) => place(toField(e))}
            onKeyDown={onKey}
            onFocus={() => {
              const m = match.current;
              if (m) view.current.cursor = clampToField(m.ball);
              redraw();
            }}
            onBlur={() => {
              view.current.cursor = null;
              redraw();
            }}
          />
        </div>

        <div className={s.toggles} role="group" aria-label="Overlays">
          {OVERLAYS.map((o) => (
            <button
              key={o.key}
              type="button"
              title={o.hint}
              aria-pressed={overlays[o.key]}
              onClick={() => setOverlays({ ...overlays, [o.key]: !overlays[o.key] })}
            >
              {o.label}
            </button>
          ))}
          {!reduced && (
            <button type="button" aria-pressed={slow} onClick={() => setSlow(!slow)}>
              Slow-mo
            </button>
          )}
        </div>

        <ul className={s.legend}>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx={12} cy={12} r={10} fill="#121512" />
              <circle cx={12} cy={12} r={3} fill="#2f6fff" />
              <circle cx={16} cy={7} r={2.4} fill="#ff5ad2" />
              <circle cx={16} cy={17} r={2.4} fill="#63ff7d" />
              <circle cx={7} cy={17} r={2.4} fill="#ff5ad2" />
              <circle cx={7} cy={7} r={2.4} fill="#63ff7d" />
            </svg>
            Five robots a side. Team dot plus four ID markers, flat front with the dribbler.
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M2 20 L10 10 L22 6"
                fill="none"
                style={{ stroke: 'var(--legend-path)' }}
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            </svg>
            Planned paths. The faint branches are the RRT search behind them.
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 12 H19 M14 7 L20 12 L14 17"
                fill="none"
                style={{ stroke: 'var(--legend-vel)' }}
                strokeWidth={2}
              />
            </svg>
            Velocity, and a dashed line to where the ball will stop.
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx={12}
                cy={12}
                r={9}
                fill="none"
                stroke="#ff5a46"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
              <circle cx={12} cy={12} r={3} fill="#ff8c1a" />
            </svg>
            500 mm keep-out while play is stopped.
          </li>
        </ul>
      </div>

      <aside className={s.refbox} aria-labelledby="refbox-title">
        <div className={s.refHead}>
          <h2 id="refbox-title">Referee box</h2>
          <p>You have the whistle.</p>
        </div>
        <div className={s.refGame} role="group" aria-label="Game commands">
          <button type="button" onClick={() => referee('HALT')} disabled={idle} data-kind="halt">
            Halt
          </button>
          <button type="button" onClick={() => referee('STOP')} disabled={idle}>
            Stop
          </button>
          <button
            type="button"
            onClick={() => referee('FORCE_START')}
            disabled={idle}
            data-kind="go"
          >
            Force start
          </button>
        </div>
        <div className={s.refTeams}>
          {(['blue', 'yellow'] as Team[]).map((team) => (
            <div
              key={team}
              className={s.refRow}
              role="group"
              aria-label={`Restarts for ${team}`}
              data-team={team}
            >
              <span>{team}</span>
              {RESTARTS.map((r) => (
                <button
                  key={r.call}
                  type="button"
                  onClick={() => referee(r.call, team)}
                  disabled={idle}
                  aria-label={`${r.label} for ${team}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className={s.refTip}>
          {reduced
            ? 'Reduced motion is on, so each call plays out off screen and you see the result. '
            : ''}
          Click anywhere on the field and a blue robot dribbles the ball there for a free kick.
        </p>
        <div className={s.logBox}>
          <h3 className={s.logTitle}>Log</h3>
          <ol className={s.log}>
            {hud.log.slice(0, 7).map((e) => (
              <li key={e.n} data-kind={e.kind} data-team={e.team}>
                <time>{e.clock}</time>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
