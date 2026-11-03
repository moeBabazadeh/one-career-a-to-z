import { useEffect, useRef, useState } from 'react';
import { db } from '../_shared/data';
import { AWARDS } from './fs';
import { Icon } from './icons';
import { Menubar } from './Menu';
import { GAME } from './wm';
import s from './desktop.module.scss';

const { robocup } = db.awards;

// Mines, after the robot demining challenge Moe won at university. Mines are laid on the
// first click, so it's always safe; the Scores are his real results.

const LEVELS = {
  small: { cols: 8, rows: 8, mines: 10, label: 'Small' },
  medium: { cols: 16, rows: 16, mines: 40, label: 'Medium' },
};
type Level = keyof typeof LEVELS;

interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  n: number;
}

type Phase = 'ready' | 'playing' | 'won' | 'lost';

const fresh = (level: Level): Cell[] =>
  Array.from({ length: LEVELS[level].cols * LEVELS[level].rows }, () => ({
    mine: false,
    open: false,
    flag: false,
    n: 0,
  }));

function neighbours(i: number, cols: number, rows: number) {
  const x = i % cols,
    y = Math.floor(i / cols);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx,
        ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
    }
  return out;
}

function plant(cells: Cell[], level: Level, safe: number) {
  const { cols, rows, mines } = LEVELS[level];
  const keepClear = new Set([safe, ...neighbours(safe, cols, rows)]);
  const next = cells.map((c) => ({ ...c, mine: false }));
  for (let placed = 0; placed < mines;) {
    const i = Math.floor(Math.random() * next.length);
    if (next[i].mine || keepClear.has(i)) continue;
    next[i].mine = true;
    placed++;
  }
  next.forEach((c, i) => {
    c.n = neighbours(i, cols, rows).filter((j) => next[j].mine).length;
  });
  return next;
}

function flood(cells: Cell[], level: Level, start: number[]) {
  const { cols, rows } = LEVELS[level];
  const next = cells.map((c) => ({ ...c }));
  const stack = [...start];
  while (stack.length) {
    const i = stack.pop()!;
    const c = next[i];
    if (c.open || c.flag) continue;
    c.open = true;
    if (!c.mine && c.n === 0) stack.push(...neighbours(i, cols, rows));
  }
  return next;
}

function Face({ mood }: { mood: 'ok' | 'oh' | 'dead' | 'cool' }) {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="url(#gi-butter)" stroke="#8f5902" />
      {mood === 'dead' ? (
        <path d="M7 8l3 3M10 8l-3 3M14 8l3 3M17 8l-3 3" stroke="#2e3436" strokeWidth="1.4" />
      ) : mood === 'cool' ? (
        <path d="M5.5 9h13l-1 3h-4l-1.5-2-1.5 2h-4z" fill="#2e3436" />
      ) : (
        <>
          <circle cx="8.5" cy="9.5" r="1.4" fill="#2e3436" />
          <circle cx="15.5" cy="9.5" r="1.4" fill="#2e3436" />
        </>
      )}
      {mood === 'oh' ? (
        <circle cx="12" cy="16" r="2" fill="#2e3436" />
      ) : (
        <path
          d={mood === 'dead' ? 'M8 17c2.5-2.5 5.5-2.5 8 0' : 'M7.5 14.5c2.5 3 6.5 3 9 0'}
          stroke="#2e3436"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

const NUM = ['', s.n1, s.n2, s.n3, s.n4, s.n5, s.n6, s.n7, s.n8];
const clock = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

export default function Mines({ onClose, active }: { onClose: () => void; active: boolean }) {
  const [level, setLevel] = useState<Level>('small');
  const [cells, setCells] = useState(() => fresh('small'));
  const [phase, setPhase] = useState<Phase>('ready');
  const [seconds, setSeconds] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [boom, setBoom] = useState(-1);
  const [scores, setScores] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const hold = useRef<number | null>(null);
  const held = useRef(false);
  const { cols, rows, mines } = LEVELS[level];

  useEffect(() => {
    if (phase !== 'playing' || !active) return;
    const timer = window.setInterval(() => setSeconds((t) => Math.min(5999, t + 1)), 1000);
    return () => window.clearInterval(timer);
  }, [phase, active]);

  const reset = (next: Level = level) => {
    setLevel(next);
    setCells(fresh(next));
    setPhase('ready');
    setSeconds(0);
    setBoom(-1);
    setCursor(0);
  };

  const settle = (next: Cell[], hit: number) => {
    if (next[hit]?.mine && next[hit].open) {
      setBoom(hit);
      setPhase('lost');
      setCells(next.map((c) => (c.mine ? { ...c, open: true } : c)));
      return;
    }
    if (next.filter((c) => !c.open).length === mines) {
      setPhase('won');
      setCells(next.map((c) => (c.mine ? { ...c, flag: true } : c)));
      setScores(true);
      return;
    }
    setCells(next);
  };

  const reveal = (i: number) => {
    if (phase === 'won' || phase === 'lost') return;
    const c = cells[i];
    if (c.flag) return;
    let board = cells;
    if (phase === 'ready') {
      board = plant(cells, level, i);
      setPhase('playing');
    }
    if (c.open) {
      // Revealing a number whose flags are all placed opens everything around it.
      const around = neighbours(i, cols, rows);
      if (c.n && around.filter((j) => board[j].flag).length === c.n) {
        const next = flood(board, level, around);
        settle(next, around.find((j) => next[j].mine && next[j].open) ?? i);
      }
      return;
    }
    settle(flood(board, level, [i]), i);
  };

  const flag = (i: number) => {
    if (phase === 'won' || phase === 'lost' || cells[i].open) return;
    setCells(cells.map((c, j) => (j === i ? { ...c, flag: !c.flag } : c)));
  };

  const focusCell = (i: number) => {
    setCursor(i);
    grid.current?.querySelector<HTMLButtonElement>(`[data-i="${i}"]`)?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const x = i % cols,
      y = Math.floor(i / cols);
    const move: Record<string, number> = {
      ArrowLeft: y * cols + Math.max(0, x - 1),
      ArrowRight: y * cols + Math.min(cols - 1, x + 1),
      ArrowUp: Math.max(0, y - 1) * cols + x,
      ArrowDown: Math.min(rows - 1, y + 1) * cols + x,
    };
    if (e.key in move && !e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      focusCell(move[e.key]);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      flag(i);
    }
  };

  const startHold = (i: number) => {
    held.current = false;
    hold.current = window.setTimeout(() => {
      held.current = true;
      flag(i);
    }, 420);
  };
  const endHold = () => {
    if (hold.current) window.clearTimeout(hold.current);
    hold.current = null;
  };

  const flags = cells.filter((c) => c.flag).length;
  const mood = phase === 'lost' ? 'dead' : phase === 'won' ? 'cool' : pressing ? 'oh' : 'ok';

  const cellLabel = (c: Cell, i: number) => {
    const where = `Row ${Math.floor(i / cols) + 1}, column ${(i % cols) + 1}`;
    if (c.flag && !c.open) return `${where}, flagged`;
    if (!c.open) return `${where}, hidden`;
    if (c.mine) return `${where}, mine`;
    return `${where}, ${c.n ? `${c.n} mine${c.n > 1 ? 's' : ''} nearby` : 'clear'}`;
  };

  return (
    <div className={s.mines}>
      <Menubar
        menus={[
          {
            label: 'Game',
            items: [
              { label: 'New', hint: 'Ctrl+N', onSelect: () => reset() },
              { label: 'Scores', icon: 'trophy', onSelect: () => setScores(true) },
              { separator: true },
              { label: 'Quit', onSelect: onClose },
            ],
          },
          {
            label: 'Settings',
            items: (Object.keys(LEVELS) as Level[]).map((l) => ({
              label: `${LEVELS[l].label} (${LEVELS[l].cols}×${LEVELS[l].rows})`,
              checked: level === l,
              onSelect: () => reset(l),
            })),
          },
        ]}
      />
      <div className={s.mineHead}>
        <span className={s.mineStat}>
          Flags: {flags}/{mines}
        </span>
        <button type="button" className={s.faceBtn} onClick={() => reset()} aria-label="New game">
          <Face mood={mood} />
        </button>
        <span className={s.mineStat}>Time: {clock(seconds)}</span>
      </div>
      <div
        ref={grid}
        className={s.mineGrid}
        style={{ gridTemplateColumns: `repeat(${cols}, var(--cell))` }}
        role="grid"
        aria-label={`Minefield, ${cols} by ${rows}. Arrow keys move, Enter reveals, F flags.`}
        onPointerDown={() => setPressing(true)}
        onPointerUp={() => setPressing(false)}
        onPointerLeave={() => setPressing(false)}
      >
        {Array.from({ length: rows }, (_, y) => (
          <div key={y} role="row" className={s.mineRow}>
            {cells.slice(y * cols, y * cols + cols).map((c, x) => {
              const i = y * cols + x;
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  data-i={i}
                  tabIndex={i === cursor ? 0 : -1}
                  aria-label={cellLabel(c, i)}
                  className={`${s.cell} ${c.open ? s.cellOpen : ''} ${i === boom ? s.cellBoom : ''} ${c.open && !c.mine ? NUM[c.n] : ''}`}
                  onClick={() => {
                    if (held.current) return;
                    setCursor(i);
                    reveal(i);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    flag(i);
                  }}
                  onKeyDown={(e) => onKey(e, i)}
                  onPointerDown={(e) => e.pointerType === 'touch' && startHold(i)}
                  onPointerUp={endHold}
                  onPointerCancel={endHold}
                >
                  {c.open && c.mine ? (
                    <Icon name="mines" size={18} />
                  ) : c.flag ? (
                    <Icon name="flag" size={18} />
                  ) : c.open && c.n ? (
                    c.n
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className={s.statusbar} aria-live="polite">
        <span>
          {phase === 'won'
            ? `Cleared in ${clock(seconds)}.`
            : phase === 'lost'
              ? 'Boom. Click the face to try again.'
              : `${GAME}: ${robocup.event} ${robocup.year}`}
        </span>
      </p>
      {scores && (
        <div
          className={s.sheet}
          role="dialog"
          aria-modal="true"
          aria-labelledby="scores-title"
          onKeyDown={(e) => e.key === 'Escape' && setScores(false)}
        >
          <h3 id="scores-title">
            <Icon name="trophy" size={24} /> Mines Scores
          </h3>
          {phase === 'won' && (
            <p
              className={s.sheetNote}
            >{`You cleared the field in ${clock(seconds)}. Here's how the real one went:`}</p>
          )}
          <table className={s.scores}>
            <thead>
              <tr>
                <th>Place</th>
                <th>Event</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {AWARDS.map((a) => (
                <tr key={a.event}>
                  <td>{a.place}</td>
                  <td>
                    {a.event}
                    <small>{a.challenge}</small>
                  </td>
                  <td>{a.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={s.btnRow}>
            <button type="button" className={s.btn} autoFocus onClick={() => setScores(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
