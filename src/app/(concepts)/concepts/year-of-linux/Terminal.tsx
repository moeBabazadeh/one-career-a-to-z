import { useEffect, useRef, useState } from 'react';
import { HOME, USER } from './fs';
import { Menubar } from './Menu';
import { complete, prompt, run, type Effect, type Line } from './shell';
import s from './desktop.module.scss';

interface Row {
  id: number;
  line: Line;
}

const MOTD: Line[] = [
  [{ t: 'Last login: on tty1. Type ' }, { t: 'help', c: 'bold' }, { t: ' for the commands.' }],
  [],
];
const DEMO = 'screenfetch';

const C: Record<string, string | undefined> = {
  blue: s.cBlue,
  green: s.cGreen,
  red: s.cRed,
  yellow: s.cYellow,
  cyan: s.cCyan,
  magenta: s.cMagenta,
  bold: s.cBold,
  dim: s.cDim,
  arch: s.cArch,
};

function Segs({ line }: { line: Line }) {
  return (
    <>
      {line.length
        ? line.map((seg, i) =>
            seg.href ? (
              <a
                key={i}
                href={seg.href}
                target="_blank"
                rel="noreferrer"
                className={C[seg.c ?? '']}
              >
                {seg.t}
              </a>
            ) : (
              <span key={i} className={C[seg.c ?? '']}>
                {seg.t}
              </span>
            ),
          )
        : ' '}
    </>
  );
}

interface TerminalProps {
  onEffect: (e: Exclude<Effect, null | { clear: true }>) => void;
  animate: boolean;
  onClose: () => void;
  /** A command handed over from Run Application; `n` changes each time. */
  inject: { cmd: string; n: number } | null;
}

export default function Terminal({ onEffect, animate, onClose, inject }: TerminalProps) {
  const [rows, setRows] = useState<Row[]>(() => MOTD.map((line, i) => ({ id: -1 - i, line })));
  const [cwd, setCwd] = useState<string[]>(HOME);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const nextId = useRef(0);
  const history = useRef<string[]>([]);
  const hIndex = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const out = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const cwdRef = useRef(cwd);
  const effect = useRef(onEffect);
  useEffect(() => {
    effect.current = onEffect;
    cwdRef.current = cwd;
  });

  const add = (lines: Line[]) =>
    setRows((prev) =>
      [...prev, ...lines.map((line) => ({ id: nextId.current++, line }))].slice(-500),
    );

  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const exec = (cmd: string, at: string[]) => {
    // Columns that fit: the terminal's width over one character's.
    const el = out.current;
    const cols = el
      ? Math.floor((el.clientWidth - 16) / (parseFloat(getComputedStyle(el).fontSize) * 0.6))
      : 80;
    const res = run(cmd, {
      cwd: at,
      history: history.current,
      size: [innerWidth, innerHeight],
      cols,
    });
    const echo: Line = [...prompt(at), { t: cmd }];
    if (res.effect && 'clear' in res.effect) setRows([]);
    else add([echo, ...res.out]);
    setCwd(res.cwd);
    if (cmd.trim()) history.current.push(cmd);
    hIndex.current = history.current.length;
    if (res.stream) {
      if (!animate) {
        // Under reduced motion, a stream prints its finished state at once.
        const final: Line[] = [];
        res.stream.forEach((st) =>
          st.replace ? (final[final.length - 1] = st.line) : final.push(st.line),
        );
        add(final);
      } else {
        setBusy(true);
        const last = res.stream[res.stream.length - 1].at;
        res.stream.forEach((st) =>
          timers.current.push(
            window.setTimeout(() => {
              setRows((prev) => {
                const row = { id: nextId.current++, line: st.line };
                return st.replace ? [...prev.slice(0, -1), row] : [...prev, row];
              });
            }, st.at),
          ),
        );
        timers.current.push(window.setTimeout(() => setBusy(false), last + 30));
      }
    }
    if (res.effect && !('clear' in res.effect)) effect.current(res.effect);
  };

  // On first open the shell types screenfetch by itself; any key takes over.
  useEffect(() => {
    const t = timers.current;
    if (!animate) t.push(window.setTimeout(() => exec(DEMO, HOME), 0));
    else {
      [...DEMO].forEach((_, i) =>
        t.push(window.setTimeout(() => setValue(DEMO.slice(0, i + 1)), 700 + i * 70)),
      );
      t.push(
        window.setTimeout(
          () => {
            setValue('');
            exec(DEMO, HOME);
          },
          700 + DEMO.length * 70 + 240,
        ),
      );
    }
    return () => t.forEach((id) => window.clearTimeout(id));
    // Once per terminal: it's part of the shell's first start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inject) return;
    const t = window.setTimeout(() => exec(inject.cmd, cwdRef.current), 0);
    return () => window.clearTimeout(t);
    // Runs when a new command is handed over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inject?.n]);

  useEffect(() => {
    if (out.current) out.current.scrollTop = out.current.scrollHeight;
  }, [rows]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      stop();
      setBusy(false);
      add([[...prompt(cwd), { t: `${value}^C` }]]);
      setValue('');
      return;
    }
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      setRows([]);
      return;
    }
    if (busy) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      stop();
      exec(value, cwd);
      setValue('');
    } else if (e.key === 'ArrowUp' && history.current.length) {
      e.preventDefault();
      hIndex.current = Math.max(0, hIndex.current - 1);
      setValue(history.current[hIndex.current]);
    } else if (e.key === 'ArrowDown' && history.current.length) {
      e.preventDefault();
      hIndex.current = Math.min(history.current.length, hIndex.current + 1);
      setValue(history.current[hIndex.current] ?? '');
    } else if (e.key === 'Tab' && value.trim()) {
      const done = complete(value, cwd);
      if (done !== value) {
        e.preventDefault();
        setValue(done);
      }
    }
  };

  const say = (cmd: string) => {
    stop();
    exec(cmd, cwd);
    input.current?.focus();
  };

  return (
    <div className={s.app}>
      <Menubar
        menus={[
          { label: 'File', items: [{ label: 'Close Window', onSelect: onClose }] },
          {
            label: 'View',
            items: [
              {
                label: 'Zoom In',
                hint: 'Ctrl++',
                onSelect: () => setZoom(Math.min(1.6, zoom + 0.1)),
              },
              {
                label: 'Zoom Out',
                hint: 'Ctrl+-',
                onSelect: () => setZoom(Math.max(0.7, zoom - 0.1)),
              },
              { label: 'Normal Size', onSelect: () => setZoom(1) },
            ],
          },
          {
            label: 'Terminal',
            items: [
              { label: 'Reset and Clear', onSelect: () => setRows([]) },
              { separator: true },
              { label: 'screenfetch', onSelect: () => say('screenfetch') },
              { label: 'sudo pacman -Syu', onSelect: () => say('sudo pacman -Syu') },
              { label: `man ${USER}`, onSelect: () => say(`man ${USER}`) },
            ],
          },
          { label: 'Help', items: [{ label: 'Commands', onSelect: () => say('help') }] },
        ]}
      />
      {/* Clicking anywhere in the terminal puts the cursor back on the prompt. */}
      <div
        ref={out}
        className={s.term}
        style={{ '--zoom': zoom } as React.CSSProperties}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a') && !getSelection()?.toString())
            input.current?.focus({ preventScroll: true });
        }}
      >
        <div role="log" aria-live="polite" aria-label="Terminal output">
          {rows.map((r) => (
            <div key={r.id} className={s.termLine}>
              <Segs line={r.line} />
            </div>
          ))}
        </div>
        <label className={s.termPrompt} hidden={busy}>
          <span className={s.termPs}>
            <Segs line={prompt(cwd)} />
          </span>
          <input
            ref={input}
            type="text"
            value={value}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Command"
            data-autofocus
            onChange={(e) => {
              stop();
              setValue(e.target.value);
            }}
            onKeyDown={onKeyDown}
          />
        </label>
      </div>
    </div>
  );
}
