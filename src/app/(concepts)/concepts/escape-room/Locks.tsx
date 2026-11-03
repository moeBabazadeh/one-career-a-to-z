'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { db, skills } from '../_shared/data';
import {
  bookName,
  CRYPTEX,
  CRYPTEX_START,
  DIAL_STEPS,
  DIGITS,
  DOOR,
  GAP,
  isSolved,
  LOCKS,
  mod,
  PADLOCK,
  PADLOCK_START,
  ROLE_ORDER,
  SAFE_CODE,
  SHELF_ORDER,
  SIZE,
  slide,
  SLIDER_IMAGE,
  SLIDER_START,
  solve,
  SOLVED,
  WORD,
  WORD_START,
  WORD_WHEELS,
  type LockId,
  type RoleKey,
} from './puzzles';
import { sfx } from './sound';
import s from './escape.module.scss';

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

export interface LockHandle {
  tryIt: () => void;
  showMe: () => void;
}

export interface LockProps {
  ref?: React.Ref<LockHandle>;
  open: boolean;
  reduced: boolean;
  /** The lock gave: solved, or shown. */
  onSolve: (shown: boolean) => void;
  /** A try that didn't open it, and what the visitor feels. */
  onWrong: (why: string) => void;
}

/** setTimeout that is cleared when the lock goes away. */
function useLater() {
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => clearTimeout(t));
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
}

/** Wheel events turn a control instead of scrolling the page. */
function useWheelTurn<T extends HTMLElement | SVGSVGElement>(
  onStep: (dir: 1 | -1) => void,
  threshold = 44,
) {
  const ref = useRef<T>(null);
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let acc = 0;
    const wheel = (e: Event) => {
      const w = e as WheelEvent;
      if (el.getAttribute('aria-disabled') === 'true') return;
      w.preventDefault();
      acc += Math.max(-threshold, Math.min(threshold, w.deltaY));
      while (Math.abs(acc) >= threshold) {
        const dir = acc > 0 ? 1 : -1;
        stepRef.current(dir);
        acc -= dir * threshold;
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [threshold]);
  return ref;
}

/** Moves focus to the next or previous drum in the same lock. */
function focusSibling(from: Element, dir: 1 | -1) {
  const all = [
    ...(from.closest('[data-drums]')?.querySelectorAll<HTMLElement>('[data-drum]') ?? []),
  ];
  all[all.indexOf(from as HTMLElement) + dir]?.focus();
}

/* ------------------------------------------------------------------ a drum: one wheel of a lock */

interface DrumProps {
  faces: string[];
  raw: number;
  label: string;
  variant: 'digit' | 'letter' | 'skill';
  disabled: boolean;
  onTurn: (dir: 1 | -1) => void;
  onTry: () => void;
  /** A typed key: returns true when it set the wheel. */
  onType?: (key: string) => boolean;
  advance?: boolean;
}

const FACE_PX = { digit: 46, letter: 42, skill: 54 };

function Drum({
  faces,
  raw,
  label,
  variant,
  disabled,
  onTurn,
  onTry,
  onType,
  advance = true,
}: DrumProps) {
  const n = faces.length;
  const value = mod(raw, n);
  const angle = 360 / n;
  const r = FACE_PX[variant] / 2 / Math.tan(Math.PI / n);
  const ref = useWheelTurn<HTMLDivElement>(onTurn, 40);
  const drag = useRef<{ y: number } | null>(null);
  const px = FACE_PX[variant] * 0.8;

  return (
    <div className={s.drumCol} data-variant={variant}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.nudge}
        disabled={disabled}
        onClick={() => onTurn(1)}
      >
        <svg viewBox="0 0 12 8">
          <path d="M1 7 6 2l5 5" />
        </svg>
      </button>
      <div
        ref={ref}
        data-drum
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuetext={faces[value]}
        aria-disabled={disabled}
        className={s.drum}
        style={{ '--r': `${r.toFixed(2)}px`, '--fh': `${FACE_PX[variant]}px` } as Vars}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus();
          drag.current = { y: e.clientY };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const moved = d.y - e.clientY;
          if (Math.abs(moved) < px) return;
          const dir = moved > 0 ? 1 : -1;
          d.y -= dir * px;
          onTurn(dir);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (disabled) return;
          const el = e.currentTarget;
          if (e.key === 'ArrowUp') onTurn(1);
          else if (e.key === 'ArrowDown') onTurn(-1);
          else if (e.key === 'ArrowLeft') focusSibling(el, -1);
          else if (e.key === 'ArrowRight') focusSibling(el, 1);
          else if (e.key === 'Backspace') focusSibling(el, -1);
          else if (e.key === 'Enter') onTry();
          else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && onType?.(e.key)) {
            if (advance) focusSibling(el, 1);
          } else return;
          e.preventDefault();
        }}
      >
        <div className={s.cyl} style={{ '--a': `${(raw * angle).toFixed(2)}deg` } as Vars}>
          {faces.map((f, i) => (
            <span
              key={`${f}${i}`}
              className={s.face}
              style={{ '--f': `${-i * angle}deg` } as Vars}
              aria-hidden="true"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.nudge}
        disabled={disabled}
        onClick={() => onTurn(-1)}
      >
        <svg viewBox="0 0 12 8">
          <path d="M1 1l5 5 5-5" />
        </svg>
      </button>
    </div>
  );
}

/** State for a row of drums: turning, trying, typing, and "show me". */
function useDrums(
  faces: string[][],
  code: number[],
  start: number[],
  { open, reduced, onSolve, onWrong }: Omit<LockProps, 'ref'>,
  wrong: string,
) {
  const [raws, setRaws] = useState(start);
  const [auto, setAuto] = useState(false);
  const later = useLater();
  const busy = open || auto;
  const values = raws.map((v, i) => mod(v, faces[i].length));

  const turn = (i: number, dir: number) => {
    if (busy) return;
    setRaws((r) => r.map((v, j) => (j === i ? v + dir : v)));
    sfx('tick');
  };

  /** Turns wheel i the short way round to face `target`. */
  const setTo = (i: number, target: number) => {
    if (busy) return;
    setRaws((r) =>
      r.map((v, j) => {
        if (j !== i) return v;
        const n = faces[i].length;
        let d = mod(target - v, n);
        if (d > n / 2) d -= n;
        return v + d;
      }),
    );
    sfx('tick');
  };

  const tryIt = () => {
    if (busy) return;
    sfx('pull');
    if (values.every((v, i) => v === code[i])) onSolve(false);
    else onWrong(wrong);
  };

  const showMe = () => {
    if (busy) return;
    setAuto(true);
    let t = 0;
    code.forEach((target, i) => {
      const n = faces[i].length;
      let d = mod(target - raws[i], n);
      if (d > n / 2) d -= n;
      const dir = Math.sign(d);
      for (let k = 0; k < Math.abs(d); k++) {
        t += reduced ? 0 : 85;
        later(() => {
          setRaws((r) => r.map((v, j) => (j === i ? v + dir : v)));
          sfx('tick');
        }, t);
      }
      t += reduced ? 0 : 140;
    });
    later(
      () => {
        setAuto(false);
        onSolve(true);
      },
      t + (reduced ? 0 : 260),
    );
  };

  return { raws, values, busy, turn, setTo, tryIt, showMe };
}

/* ------------------------------------------------------------------ the padlock on the parts cabinet */

const DRAWER_TAGS = Object.values(db.devices).map((d) => d.tag);

export function PadlockLock({ ref, ...props }: LockProps) {
  const faces = PADLOCK.map(() => DIGITS);
  const d = useDrums(faces, PADLOCK, PADLOCK_START, props, 'The shackle won’t budge.');
  useImperativeHandle(ref, () => ({ tryIt: d.tryIt, showMe: d.showMe }));
  const def = LOCKS.cabinet;
  return (
    <div className={s.cabinetScene} data-open={props.open}>
      <div className={s.partsFront} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={s.partDrawer} style={{ '--i': i } as Vars}>
            <i>{DRAWER_TAGS[i] ?? ''}</i>
          </span>
        ))}
      </div>
      <div className={s.hasp} aria-hidden="true" />
      <div className={s.padlock}>
        <button
          type="button"
          tabIndex={-1}
          className={s.shackle}
          aria-label={def.action}
          onClick={d.tryIt}
          disabled={d.busy}
        />
        <div className={s.padBody}>
          <div className={s.drumRow} data-drums role="group" aria-label={`${def.mechanism}`}>
            {faces.map((f, i) => (
              <Drum
                key={i}
                faces={f}
                raw={d.raws[i]}
                variant="digit"
                label={`Wheel ${i + 1} of ${faces.length}`}
                disabled={d.busy}
                onTurn={(dir) => d.turn(i, dir)}
                onTry={d.tryIt}
                onType={(k) => {
                  const at = f.indexOf(k);
                  if (at < 0) return false;
                  d.setTo(i, at);
                  return true;
                }}
              />
            ))}
          </div>
          <span className={s.padMark} aria-hidden="true">
            pull
          </span>
        </div>
        <p className={s.luggageTag} aria-hidden="true">
          {def.plate}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the word lock on the desk drawer */

export function WordLock({ ref, ...props }: LockProps) {
  const code = [...WORD].map((ch, i) => WORD_WHEELS[i].indexOf(ch));
  const d = useDrums(WORD_WHEELS, code, WORD_START, props, 'The drawer rattles, but holds.');
  useImperativeHandle(ref, () => ({ tryIt: d.tryIt, showMe: d.showMe }));
  const def = LOCKS.drawer;
  return (
    <div className={s.drawerScene} data-open={props.open}>
      <div className={s.drawerBox} aria-hidden="true">
        <div className={s.drawerInside}>
          <span className={s.cvPaper}>
            <b>CV</b>
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
      <div className={s.drawerFront}>
        <div className={s.wordPlate}>
          <div className={s.drumRow} data-drums role="group" aria-label={def.mechanism}>
            {WORD_WHEELS.map((f, i) => (
              <Drum
                key={i}
                faces={f}
                raw={d.raws[i]}
                variant="letter"
                label={`Letter ${i + 1} of ${WORD.length}`}
                disabled={d.busy}
                onTurn={(dir) => d.turn(i, dir)}
                onTry={d.tryIt}
                onType={(k) => {
                  const at = f.indexOf(k.toUpperCase());
                  if (at < 0) return false;
                  d.setTo(i, at);
                  return true;
                }}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className={s.drawerPull}
          aria-label={def.action}
          onClick={d.tryIt}
          disabled={d.busy}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the cryptex on the shelf */

export function CryptexLock({ ref, ...props }: LockProps) {
  const faces = CRYPTEX.map(() => skills);
  const d = useDrums(faces, CRYPTEX, CRYPTEX_START, props, 'The caps won’t twist apart.');
  useImperativeHandle(ref, () => ({ tryIt: d.tryIt, showMe: d.showMe }));
  return (
    <div className={s.cryptexScene} data-open={props.open}>
      <div className={s.scroll} aria-hidden="true">
        <span />
      </div>
      <div className={s.cryptex}>
        <button
          type="button"
          tabIndex={-1}
          className={s.capL}
          aria-label={LOCKS.cryptex.action}
          onClick={d.tryIt}
          disabled={d.busy}
        />
        <div className={s.drumRow} data-drums role="group" aria-label={LOCKS.cryptex.mechanism}>
          {faces.map((f, i) => (
            <Drum
              key={i}
              faces={f}
              raw={d.raws[i]}
              variant="skill"
              label={`Ring ${i + 1} of ${faces.length}`}
              disabled={d.busy}
              advance={false}
              onTurn={(dir) => d.turn(i, dir)}
              onTry={d.tryIt}
              onType={(k) => {
                const key = k.toLowerCase();
                const n = f.length;
                for (let step = 1; step <= n; step++) {
                  const at = mod(d.values[i] + step, n);
                  if (f[at].toLowerCase().startsWith(key)) {
                    d.setTo(i, at);
                    return true;
                  }
                }
                return false;
              }}
            />
          ))}
        </div>
        <button
          type="button"
          tabIndex={-1}
          className={s.capR}
          aria-label={LOCKS.cryptex.action}
          onClick={d.tryIt}
          disabled={d.busy}
        />
        <span className={s.cryptexLine} aria-hidden="true" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the safe's rotary dial */

interface Seg {
  dir: 'R' | 'L';
  at: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const DEG = 360 / DIAL_STEPS;
const TICKS = Array.from({ length: DIAL_STEPS }, (_, k) => k);

export function SafeLock({ ref, ...props }: LockProps) {
  const { open, reduced, onSolve, onWrong } = props;
  const [dial, setDial] = useState<{ raw: number; segs: Seg[] }>({ raw: 0, segs: [] });
  const [auto, setAuto] = useState(false);
  const [pull, setPull] = useState(false);
  const later = useLater();
  const busy = open || auto;
  const value = mod(dial.raw, DIAL_STEPS);
  const svgRef = useWheelTurn<SVGSVGElement>((dir) => turn(dir), 50);
  const drag = useRef<{ angle: number; acc: number } | null>(null);

  function turn(delta: number, quiet = false) {
    if (busy && !quiet) return;
    setDial((d) => {
      const raw = d.raw + delta;
      const dir = delta > 0 ? 'R' : 'L';
      const at = mod(raw, DIAL_STEPS);
      const last = d.segs[d.segs.length - 1];
      const segs =
        last?.dir === dir
          ? [...d.segs.slice(0, -1), { dir, at }]
          : [...d.segs, { dir, at }].slice(-4);
      return { raw, segs } as { raw: number; segs: Seg[] };
    });
    sfx('tick');
  }

  const tryIt = () => {
    if (busy) return;
    setPull(true);
    sfx('pull');
    later(() => setPull(false), 380);
    const n = dial.segs.length;
    const [a, b] = SAFE_CODE;
    const ok =
      n >= 2 &&
      dial.segs[n - 2].dir === 'R' &&
      dial.segs[n - 2].at === a &&
      dial.segs[n - 1].dir === 'L' &&
      dial.segs[n - 1].at === b;
    if (ok) onSolve(false);
    else {
      onWrong('The handle won’t turn, and the tumblers drop.');
      later(() => setDial((d) => ({ ...d, segs: [] })), 300);
    }
  };

  const showMe = () => {
    if (busy) return;
    setAuto(true);
    const [a, b] = SAFE_CODE;
    let right = mod(a - dial.raw, DIAL_STEPS);
    if (right === 0) right = DIAL_STEPS;
    let left = mod(dial.raw + right - b, DIAL_STEPS);
    if (left === 0) left = DIAL_STEPS;
    const total = right + left;
    const gap = reduced ? 0 : Math.min(40, 1600 / total);
    let t = 0;
    for (let k = 0; k < right; k++) later(() => turn(1, true), (t += gap));
    t += reduced ? 0 : 300;
    for (let k = 0; k < left; k++) later(() => turn(-1, true), (t += gap));
    later(
      () => {
        setPull(true);
        sfx('pull');
      },
      (t += reduced ? 0 : 320),
    );
    later(
      () => {
        setAuto(false);
        onSolve(true);
      },
      t + (reduced ? 0 : 280),
    );
  };

  useImperativeHandle(ref, () => ({ tryIt, showMe }));

  const angleAt = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (
      (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) /
      Math.PI
    );
  };
  const last = dial.segs.slice(-2);

  return (
    <div className={s.safeScene} data-open={open}>
      <div className={s.safeInside} aria-hidden="true">
        <svg viewBox="0 0 120 150" className={s.trophy}>
          <path className={s.cup} d="M30 12h60v10c0 26-12 44-30 48-18-4-30-22-30-48z" />
          <path className={s.cupHandle} d="M30 20c-14 0-18 22 2 30M90 20c14 0 18 22-2 30" />
          <rect className={s.cup} x="54" y="70" width="12" height="26" />
          <rect className={s.cupBase} x="36" y="96" width="48" height="12" rx="2" />
          <rect className={s.cupBase} x="30" y="108" width="60" height="18" rx="2" />
          <text x="60" y="44" className={s.cupText}>
            {db.awards.robocup.place.split(' ')[0]}
          </text>
          <text x="60" y="121" className={s.cupPlate}>
            {db.awards.robocup.year}
          </text>
        </svg>
        <span className={s.papers} />
      </div>
      <div className={s.safeDoor}>
        <span className={s.rivet} data-c="tl" />
        <span className={s.rivet} data-c="tr" />
        <span className={s.rivet} data-c="bl" />
        <span className={s.rivet} data-c="br" />
        <p className={s.safePlate} aria-hidden="true">
          R · L · pull
        </p>
        <svg
          ref={svgRef}
          viewBox="0 0 200 200"
          className={s.dial}
          role="slider"
          tabIndex={busy ? -1 : 0}
          aria-label="Combination dial. Right arrow turns right, left arrow turns left."
          aria-valuemin={0}
          aria-valuemax={DIAL_STEPS - 1}
          aria-valuenow={value}
          aria-valuetext={`${value}${last.length ? `. Set so far: ${last.map((g) => `${g.dir === 'R' ? 'right' : 'left'} ${g.at}`).join(', ')}` : ''}`}
          aria-disabled={busy}
          onPointerDown={(e) => {
            if (busy) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            (e.currentTarget as SVGSVGElement).focus();
            drag.current = { angle: angleAt(e), acc: 0 };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const a = angleAt(e);
            let delta = a - d.angle;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            d.angle = a;
            d.acc += delta;
            while (Math.abs(d.acc) >= DEG) {
              const dir = d.acc > 0 ? 1 : -1;
              turn(dir);
              d.acc -= dir * DEG;
            }
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            if (busy) return;
            const big = e.shiftKey ? 10 : 1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') turn(big);
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') turn(-big);
            else if (e.key === 'PageUp') turn(10);
            else if (e.key === 'PageDown') turn(-10);
            else if (e.key === 'Enter') tryIt();
            else return;
            e.preventDefault();
          }}
        >
          <circle cx="100" cy="100" r="97" className={s.bezel} />
          <circle cx="100" cy="100" r="88" className={s.bezelInner} />
          <path d="M100 4 94 14h12z" className={s.index} />
          <g className={s.disc} style={{ transform: `rotate(${(dial.raw * DEG).toFixed(2)}deg)` }}>
            <circle cx="100" cy="100" r="84" className={s.discFace} />
            {TICKS.map((k) => (
              <line
                key={k}
                x1="100"
                y1={k % 10 === 0 ? 18 : k % 5 === 0 ? 20 : 22}
                x2="100"
                y2="27"
                className={s.tick}
                transform={`rotate(${-k * DEG} 100 100)`}
              />
            ))}
            {TICKS.filter((k) => k % 10 === 0).map((k) => (
              <text
                key={k}
                x="100"
                y="40"
                className={s.num}
                transform={`rotate(${-k * DEG} 100 100)`}
              >
                {k}
              </text>
            ))}
            <circle cx="100" cy="100" r="44" className={s.knob} />
            <circle cx="100" cy="100" r="36" className={s.knobTop} />
            <rect x="94" y="62" width="12" height="76" rx="6" className={s.grip} />
          </g>
        </svg>
        <div className={s.tumblers} aria-hidden="true">
          {[0, 1].map((i) => (
            <span key={i} data-on={!!last[i]}>
              <b>{last[i]?.dir ?? (i ? 'L' : 'R')}</b>
              {last[i] ? pad2(last[i].at) : '··'}
            </span>
          ))}
          <span className={s.now}>
            <b>at</b>
            {pad2(value)}
          </span>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className={s.handle}
          data-pull={pull}
          aria-label={LOCKS.safe.action}
          onClick={tryIt}
          disabled={busy}
        >
          <span />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the laptop's sliding tiles */

const PLACE = [
  'top left',
  'top middle',
  'top right',
  'middle left',
  'centre',
  'middle right',
  'bottom left',
  'bottom middle',
  'bottom right',
];

export function SliderLock({ ref, ...props }: LockProps) {
  const { open, reduced, onSolve, onWrong } = props;
  const [board, setBoard] = useState(SLIDER_START);
  const [auto, setAuto] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [said, setSaid] = useState('');
  const later = useLater();
  const busy = open || auto;
  const solved = isSolved(board);
  const placed = board.filter((t, i) => t === i && t !== GAP).length;

  const move = (pos: number, quiet = false) => {
    if (busy && !quiet) return;
    const next = slide(board, pos);
    if (next === board) return;
    setBoard(next);
    sfx('tick');
    const tile = board[pos];
    const inPlace = next.filter((t, i) => t === i && t !== GAP).length;
    setSaid(
      `Tile ${tile + 1} moved to the ${PLACE[next.indexOf(tile)]}. ${inPlace} of ${GAP} in place.`,
    );
    if (!quiet && isSolved(next)) later(() => onSolve(false), reduced ? 0 : 420);
  };

  const tryIt = () => {
    if (busy) return;
    if (solved) onSolve(false);
    else onWrong('The screen stays locked until the picture is whole.');
  };

  const showMe = () => {
    if (busy) return;
    setAuto(true);
    const path = solve(board);
    let b = board;
    let t = 0;
    for (const pos of path) {
      b = slide(b, pos);
      const snap = b;
      later(
        () => {
          setBoard(snap);
          sfx('tick');
        },
        (t += reduced ? 0 : 210),
      );
    }
    later(
      () => {
        setAuto(false);
        onSolve(true);
      },
      t + (reduced ? 0 : 480),
    );
  };

  useImperativeHandle(ref, () => ({ tryIt, showMe }));

  const keys = (e: React.KeyboardEvent) => {
    const gap = board.indexOf(GAP);
    const row = Math.floor(gap / SIZE);
    const col = gap % SIZE;
    let pos = -1;
    if (e.key === 'ArrowUp' && row < SIZE - 1) pos = gap + SIZE;
    else if (e.key === 'ArrowDown' && row > 0) pos = gap - SIZE;
    else if (e.key === 'ArrowLeft' && col < SIZE - 1) pos = gap + 1;
    else if (e.key === 'ArrowRight' && col > 0) pos = gap - 1;
    else if (e.key === 'Enter') tryIt();
    else return;
    e.preventDefault();
    if (pos >= 0) move(pos);
  };

  return (
    <div className={s.laptopScene} data-open={open} data-solved={solved}>
      <div className={s.lid}>
        <div className={s.screen} style={{ '--img': `url(${SLIDER_IMAGE})` } as Vars}>
          <div
            className={s.board}
            role="group"
            tabIndex={busy ? -1 : 0}
            aria-label={`Sliding tiles, ${placed} of ${GAP} in place. Arrow keys slide the tile next to the gap into it.`}
            onKeyDown={keys}
            data-numbers={numbers}
          >
            {SOLVED.map((tile) => {
              const pos = board.indexOf(tile);
              const style = {
                '--x': pos % SIZE,
                '--y': Math.floor(pos / SIZE),
                '--bx': tile % SIZE,
                '--by': Math.floor(tile / SIZE),
              } as Vars;
              if (tile === GAP)
                return (
                  <span key={tile} className={s.tile} data-gap style={style} aria-hidden="true" />
                );
              return (
                <button
                  key={tile}
                  type="button"
                  tabIndex={-1}
                  className={s.tile}
                  data-home={pos === tile}
                  style={style}
                  onClick={() => move(pos)}
                  disabled={busy}
                  aria-label={`Tile ${tile + 1}, at the ${PLACE[pos]}`}
                >
                  <i>{tile + 1}</i>
                </button>
              );
            })}
          </div>
          <p className={s.unlocked} aria-hidden={!open}>
            Unlocked
          </p>
        </div>
      </div>
      <div className={s.laptopBase} aria-hidden="true" />
      <label className={s.numbersToggle}>
        <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} />{' '}
        Number the tiles
      </label>
      <p className={s.sr} aria-live="polite">
        {said}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ the bookshelf's sequence */

// Plain books between the role books: they don't pull.
const DECOR = [
  { at: 1, w: 26, h: 84 },
  { at: 4, w: 34, h: 92 },
  { at: 6, w: 22, h: 78 },
];
const BOOK_SIZE = [
  { w: 40, h: 92 },
  { w: 36, h: 86 },
  { w: 44, h: 96 },
  { w: 38, h: 88 },
  { w: 42, h: 94 },
  { w: 36, h: 90 },
];

export function ShelfLock({ ref, ...props }: LockProps) {
  const { open, reduced, onSolve, onWrong } = props;
  const [pulled, setPulled] = useState<RoleKey[]>([]);
  const [shove, setShove] = useState(false);
  const [auto, setAuto] = useState(false);
  const [focus, setFocus] = useState(0);
  const later = useLater();
  const busy = open || auto || shove;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const pull = (id: RoleKey) => {
    if (busy || pulled.includes(id)) return;
    const next = [...pulled, id];
    setPulled(next);
    sfx('pull');
    if (ROLE_ORDER[pulled.length] !== id) {
      setShove(true);
      onWrong(`${bookName(id)} slides out, and every book thuds back in.`);
      later(
        () => {
          setPulled([]);
          setShove(false);
        },
        reduced ? 0 : 650,
      );
    } else if (next.length === ROLE_ORDER.length) later(() => onSolve(false), reduced ? 0 : 380);
  };

  const showMe = () => {
    if (busy) return;
    setAuto(true);
    setPulled([]);
    let t = reduced ? 0 : 200;
    ROLE_ORDER.forEach((id, i) => {
      later(
        () => {
          setPulled(ROLE_ORDER.slice(0, i + 1));
          sfx('pull');
        },
        (t += reduced ? 0 : 340),
      );
    });
    later(
      () => {
        setAuto(false);
        onSolve(true);
      },
      t + (reduced ? 0 : 420),
    );
  };

  const tryIt = () => pull(SHELF_ORDER[focus]);
  useImperativeHandle(ref, () => ({ tryIt, showMe }));

  const go = (i: number) => {
    const k = mod(i, SHELF_ORDER.length);
    setFocus(k);
    refs.current[k]?.focus();
  };

  const slots: React.ReactNode[] = [];
  SHELF_ORDER.forEach((id, i) => {
    const decor = DECOR.find((x) => x.at === i);
    if (decor)
      slots.push(
        <span
          key={`d${i}`}
          className={s.plainBook}
          style={{ '--w': decor.w, '--h': decor.h } as Vars}
          aria-hidden="true"
        />,
      );
    const n = pulled.indexOf(id);
    slots.push(
      <button
        key={id}
        ref={(el) => {
          refs.current[i] = el;
        }}
        type="button"
        className={s.book}
        data-pulled={n >= 0}
        data-shove={shove}
        tabIndex={i === focus ? 0 : -1}
        disabled={open}
        aria-disabled={busy}
        aria-pressed={n >= 0}
        aria-label={`${bookName(id)}${n >= 0 ? `, pulled ${n + 1} of ${ROLE_ORDER.length}` : ''}`}
        style={{ '--w': BOOK_SIZE[i].w, '--h': BOOK_SIZE[i].h, '--c': `var(--book-${i})` } as Vars}
        onFocus={() => setFocus(i)}
        onClick={() => pull(id)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(i + 1);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(i - 1);
          else if (e.key === 'Home') go(0);
          else if (e.key === 'End') go(SHELF_ORDER.length - 1);
          else return;
          e.preventDefault();
        }}
      >
        <span>{bookName(id)}</span>
      </button>,
    );
  });

  return (
    <div className={s.shelfScene} data-open={open}>
      <div className={s.alcove} aria-hidden="true">
        <span className={s.ledgerBook} />
      </div>
      <div className={s.shelfUnit}>
        <div className={s.books} role="toolbar" aria-label="Books on the shelf">
          {slots}
        </div>
        <p className={s.shelfPlate} aria-hidden="true">
          {pulled.length ? `${pulled.length} of ${ROLE_ORDER.length} out` : 'in order, please'}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the door's keypad */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'enter'];

export function DoorLock({ ref, ...props }: LockProps) {
  const { open, reduced, onSolve, onWrong } = props;
  const [entry, setEntry] = useState('');
  const [led, setLed] = useState<'idle' | 'ok' | 'no'>('idle');
  const [auto, setAuto] = useState(false);
  const later = useLater();
  const busy = open || auto || led === 'no';

  const check = (code: string, shown: boolean) => {
    sfx('pull');
    if (code === DOOR) {
      setLed('ok');
      onSolve(shown);
    } else {
      setLed('no');
      onWrong(code ? 'The keypad blinks red and clears.' : 'Type a number first.');
      later(
        () => {
          setEntry('');
          setLed('idle');
        },
        reduced ? 0 : 700,
      );
    }
  };

  const press = (k: string) => {
    if (busy) return;
    if (k === 'clear') setEntry((e) => e.slice(0, -1));
    else if (k === 'enter') check(entry, false);
    else setEntry((e) => (e + k).slice(-4));
    if (k !== 'enter') sfx('tick');
  };

  const showMe = () => {
    if (busy) return;
    setAuto(true);
    setEntry('');
    let t = 0;
    [...DOOR].forEach((ch, i) => {
      later(
        () => {
          setEntry(DOOR.slice(0, i + 1));
          sfx('tick');
        },
        (t += reduced ? 0 : 320),
      );
    });
    later(
      () => {
        setAuto(false);
        check(DOOR, true);
      },
      t + (reduced ? 0 : 380),
    );
  };

  useImperativeHandle(ref, () => ({ tryIt: () => press('enter'), showMe }));

  return (
    <div className={s.doorScene} data-open={open}>
      <div className={s.doorway} aria-hidden="true" />
      <div className={s.doorLeaf}>
        <span className={s.doorPanel} data-p="1" />
        <span className={s.doorPanel} data-p="2" />
        <div
          className={s.keypad}
          role="group"
          aria-label="Keypad. Type the digits, Backspace to clear one, Enter to try."
          tabIndex={busy ? -1 : 0}
          onKeyDown={(e) => {
            if (/^[0-9]$/.test(e.key)) press(e.key);
            else if (e.key === 'Backspace' || e.key === 'Delete') press('clear');
            else if (e.key === 'Enter' && e.target === e.currentTarget) press('enter');
            else return;
            e.preventDefault();
          }}
        >
          <div className={s.lcd} data-led={led} aria-live="polite" aria-label="Display">
            <span className={s.ledLight} />
            <output>{entry.padEnd(Math.max(2, entry.length), '·')}</output>
          </div>
          <div className={s.keys}>
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                tabIndex={-1}
                onClick={() => press(k)}
                disabled={busy}
                data-k={k}
                aria-label={k === 'clear' ? 'Clear one digit' : k === 'enter' ? 'Enter' : k}
              >
                {k === 'clear' ? '⌫' : k === 'enter' ? '↵' : k}
              </button>
            ))}
          </div>
        </div>
        <span className={s.knobDoor} aria-hidden="true" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the envelope's wax seal */

const HOLD_MS = 850;

export function SealLock({ ref, ...props }: LockProps) {
  const { open, reduced, onSolve } = props;
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const later = useLater();

  const start = () => {
    if (open) return;
    setHolding(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      sfx('pull');
      onSolve(false);
    }, HOLD_MS);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const tryIt = () => {
    if (open) return;
    sfx('pull');
    onSolve(false);
  };
  const showMe = () => {
    if (open) return;
    setHolding(true);
    later(
      () => {
        setHolding(false);
        onSolve(true);
      },
      reduced ? 0 : HOLD_MS,
    );
  };
  useImperativeHandle(ref, () => ({ tryIt, showMe }));

  return (
    <div className={s.envelopeScene} data-open={open}>
      <div className={s.envelope}>
        <div className={s.envBack} aria-hidden="true" />
        <div className={s.letterPeek} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className={s.envFront} aria-hidden="true">
          <p>To whoever is reading this</p>
        </div>
        <div className={s.flap} aria-hidden="true" />
        <button
          type="button"
          className={s.seal}
          data-holding={holding}
          disabled={open}
          aria-label="Wax seal. Press and hold, or press Enter, to break it."
          style={{ '--hold': `${HOLD_MS}ms` } as Vars}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start();
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onClick={(e) => {
            // Enter, Space and assistive tech click with no pointer: that breaks it. A pointer needs the hold.
            if (e.detail === 0) tryIt();
          }}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" className={s.holdRing} pathLength={100} />
            <path
              className={s.wax}
              d="M50 8c8 0 10 6 17 8s13 1 16 8-2 12 0 18 6 11 2 17-11 5-15 10-5 13-12 15-12-5-18-5-13 6-19 1-3-12-7-17-12-7-11-14 6-10 5-17-7-11-1-17 12-3 18-8 6-10 14-10z"
            />
            <circle cx="50" cy="50" r="27" className={s.waxIn} />
            <text x="50" y="61" className={s.waxMark}>
              {db.person.first[0]}
            </text>
            <path className={s.crack} d="M30 22 46 44 40 58 56 74 64 90" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export const LOCK_VIEWS: Record<LockId, (p: LockProps) => React.ReactNode> = {
  seal: SealLock,
  safe: SafeLock,
  cabinet: PadlockLock,
  drawer: WordLock,
  cryptex: CryptexLock,
  laptop: SliderLock,
  shelf: ShelfLock,
  door: DoorLock,
};
