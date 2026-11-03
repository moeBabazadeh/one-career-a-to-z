'use client';

import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { db } from '../_shared/data';
import {
  useAnimationFrame,
  useInView,
  useReducedMotion,
  useScaledCanvas,
  useScheme,
} from '../_shared/hooks';
import { DARK_ROOM, camera, drawScene, readRoom, type Fit, type Room } from './draw';
import { CHARSET } from './font';
import { PLATE, clock, estimate, heroProgram, type Program } from './gcode';
import { Machine } from './sim';
import s from './toolpath.module.scss';

type Status = 'auto' | 'run' | 'hold' | 'stop' | 'idle' | 'done';
type ViewName = 'iso' | 'top' | 'free';

const VIEWS = { iso: { yaw: -0.2, pitch: 0.74 }, top: { yaw: 0, pitch: Math.PI / 2 } };
const DEFAULT_NAME = PLATE.name;

const STATUS: Record<Exclude<Status, 'auto'>, string> = {
  run: 'CYCLE',
  hold: 'FEED HOLD',
  stop: 'SINGLE BLOCK',
  idle: 'READY',
  done: 'M30 · DONE',
};

const NARROW = '(max-width: 700px)';
const subscribeNarrow = (cb: () => void) => {
  const q = matchMedia(NARROW);
  q.addEventListener('change', cb);
  return () => q.removeEventListener('change', cb);
};

/* ------------------------------------------------------------------ listing */

const WORD = /(\([^)]*\))|([A-Z])(-?[\d.]+)|(%)/g;

function tokens(line: string) {
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const m of line.matchAll(WORD)) {
    if (m.index > at) out.push(line.slice(at, m.index));
    const [all, comment, letter, num] = m;
    let cls = s.wNum;
    if (comment) cls = s.wComment;
    else if (letter === 'G') cls = num === '0' ? s.wRapid : /^[123]$/.test(num) ? s.wCut : s.wG;
    else if (letter === 'M' || letter === 'T' || letter === 'O' || letter === 'H') cls = s.wM;
    else if (letter === 'F' || letter === 'S') cls = s.wFeed;
    else if ('IJRQ'.includes(letter)) cls = s.wArc;
    out.push(
      <span key={m.index} className={cls}>
        {all}
      </span>,
    );
    at = m.index + all.length;
  }
  if (at < line.length) out.push(line.slice(at));
  return out;
}

const Listing = memo(function Listing({
  program,
  listRef,
}: {
  program: Program;
  listRef: React.RefObject<HTMLOListElement | null>;
}) {
  return (
    <ol
      ref={listRef}
      className={s.listing}
      tabIndex={0}
      aria-label={`Program ${program.number}, ${program.blocks.length} blocks`}
    >
      {program.blocks.map((b, i) => (
        <li key={i}>
          <span className={s.ln} aria-hidden="true">
            {i + 1}
          </span>
          <code>{tokens(b.text)}</code>
        </li>
      ))}
    </ol>
  );
});

/* ------------------------------------------------------------------ controller */

const pad = (v: number, int = 3) => {
  const t = Math.abs(v)
    .toFixed(3)
    .padStart(int + 4, ' ');
  return `${v < -0.0005 ? '-' : '+'}${t}`.replace(/^([+-])(\s+)/, '$2$1');
};

const toolLabel = (p: Program, t: number) => {
  const tool = p.tools.find((x) => x.t === t);
  if (!tool) return '';
  if (tool.kind === 'vbit') return `${tool.angle}° ${tool.tip ? 'engraver' : 'V-bit'} · Ø${tool.d}`;
  if (tool.kind === 'drill') return `drill · Ø${tool.d}`;
  return `${tool.kind === 'face' ? 'face mill' : 'end mill'} · Ø${tool.d}`;
};

export default function Controller() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );
  const [W, H] = narrow ? [640, 520] : [1000, 580];
  const fit: Fit = narrow ? { w: 0.94, h: 0.56, y: 0.64 } : { w: 0.88, h: 0.62, y: 0.63 };

  const [name, setName] = useState(DEFAULT_NAME);
  const [draft, setDraft] = useState(DEFAULT_NAME);
  const program = useMemo(
    () =>
      name === DEFAULT_NAME
        ? heroProgram()
        : heroProgram(name, `MADE AT ${db.person.site.toUpperCase()}`, 'O9000'),
    [name],
  );

  const [status, setStatus] = useState<Status>('auto');
  const [fro, setFro] = useState(100);
  const [ro, setRo] = useState(100);
  const [single, setSingle] = useState(false);
  const [view, setView] = useState<ViewName>('iso');
  const [backplot, setBackplot] = useState(true);
  const [parts, setParts] = useState(0);

  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.05);
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const machine = useRef<Machine | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const cam = useRef({ yaw: VIEWS.iso.yaw, pitch: VIEWS.iso.pitch });
  const last = useRef(0);
  const line = useRef(-1);
  const font = useRef('monospace');
  const room = useRef<Room>(DARK_ROOM);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const shown: Exclude<Status, 'auto'> = status === 'auto' ? (reduced ? 'done' : 'run') : status;
  const running = status === 'run' || (status === 'auto' && !reduced);

  const paint = (ctx: CanvasRenderingContext2D, now = 0) => {
    const m = machine.current;
    if (!m) return;
    const c = camera(m.p.stock, cam.current.yaw, cam.current.pitch, W, H, fit);
    drawScene(ctx, W, H, m, c, {
      now,
      font: font.current,
      backplot,
      holder: 'full',
      table: true,
      minLine: 1.4,
      room: room.current,
    });
  };
  const canvas = useScaledCanvas(W, H, (ctx) => paint(ctx, last.current));

  // The room around the part follows light and dark: read it once per change, then repaint, so a
  // paused or finished part switches too.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    room.current = readRoom(el);
    const ctx = el.getContext('2d');
    if (ctx) paint(ctx, last.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme]);

  // Readouts are written straight to the DOM every frame; React only renders on state changes.
  const put = (key: string, text: string) => {
    const el = nodes.current.get(key);
    if (el && el.textContent !== text) el.textContent = text;
  };

  const hud = (m: Machine) => {
    const p = m.p;
    const [x, y, z] = m.pos();
    const blk = m.block;
    const mod = blk.modal;
    put('x', pad(x));
    put('y', pad(y));
    put('z', pad(z));
    put('mx', pad(x + p.offset[0]));
    put('my', pad(y + p.offset[1]));
    put('mz', pad(z + p.offset[2]));
    put('dtg', m.dtg().toFixed(3));
    const v = m.velocity(fro / 100, ro / 100);
    put('fa', String(Math.round(running ? v : 0)).padStart(5, ' '));
    put('f', mod.feed ? String(mod.feed) : '—');
    put('sa', String(Math.round(m.rpm)).padStart(5, ' '));
    put('s', mod.rpm ? String(mod.rpm) : '—');
    put('dir', mod.spindle === 'M3' ? 'M3 CW' : 'M5 STOP');
    put('t', `T${mod.tool}`);
    put('tname', toolLabel(p, mod.tool));
    put('h', mod.tlo ? `G43 H${mod.tool}` : 'G49');
    put('load', `${Math.round(m.load * 100)}%`);
    nodes.current.get('loadbar')?.style.setProperty('--v', String(Math.min(1, m.load * 1.6)));
    nodes.current.get('m7')?.toggleAttribute('data-on', !m.done && mod.coolant === 'M7');
    nodes.current.get('m8')?.toggleAttribute('data-on', !m.done && mod.coolant === 'M8');
    nodes.current.get('m3')?.toggleAttribute('data-on', m.rpm > 1);
    const motion = mod.cycle !== 'G80' ? mod.cycle : mod.motion || 'G0';
    put(
      'modal',
      `${motion} G17 G21 G40 ${mod.tlo ? 'G43' : 'G49'} G54 ${mod.cycle === 'G80' ? 'G80' : 'G98'} ${mod.abs} G94`,
    );
    put('blk', `${m.index + 1}/${p.blocks.length}`);
    put('run', clock(m.elapsed));
    put('left', clock(m.left(fro / 100, ro / 100)));
    put('cycle', clock(estimate(p, 0, fro / 100, ro / 100)));
    const note = !m.done && blk.note && m.c.w < blk.dwell ? blk.note : '';
    put('note', note);
    nodes.current.get('note')?.toggleAttribute('data-on', !!note);

    // follow the current line, without scrolling the page
    const i = m.done ? p.blocks.length - 1 : m.index;
    const list = listRef.current;
    if (list && i !== line.current) {
      const items = list.children;
      items[line.current]?.removeAttribute('data-cur');
      if (i < line.current) for (const li of items) li.removeAttribute('data-ran');
      for (let k = Math.max(0, line.current); k < i; k++) items[k]?.setAttribute('data-ran', '');
      const li = items[i] as HTMLElement | undefined;
      li?.setAttribute('data-cur', '');
      if (li) list.scrollTop = li.offsetTop - list.clientHeight * 0.38;
      line.current = i;
    }
  };

  // A fresh machine for each program; reduced motion shows the finished part.
  useEffect(() => {
    const el = root.current;
    if (el) {
      font.current = getComputedStyle(el).fontFamily || 'monospace';
      nodes.current = new Map(
        [...el.querySelectorAll<HTMLElement>('[data-ui]')].map((n) => [n.dataset.ui ?? '', n]),
      );
    }
    const m = new Machine(program);
    if (reduced) m.finish();
    machine.current = m;
    line.current = -1;
    hud(m);
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paint(ctx, 0);
    // hud and paint read the latest state through their closures; re-run only for a new program
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, reduced]);

  useAnimationFrame(
    (sec) => {
      const m = machine.current;
      if (!m) return;
      const dt = last.current ? Math.min(0.05, sec - last.current) : 0;
      last.current = sec;

      const stopped = m.tick(dt, sec, running ? { fro: fro / 100, ro: ro / 100, single } : null);
      if (running && m.done) {
        setStatus('done');
        setParts((n) => n + 1);
      } else if (stopped) setStatus('stop');

      if (view !== 'free' && !drag.current) {
        const target = VIEWS[view];
        const k = 1 - Math.exp(-dt * 5);
        cam.current.yaw += (target.yaw - cam.current.yaw) * k;
        cam.current.pitch += (target.pitch - cam.current.pitch) * k;
      }
      const ctx = canvas.current?.getContext('2d');
      if (ctx) paint(ctx, sec);
      hud(m);
    },
    visible && (!reduced || status !== 'auto'),
  );

  // Static repaint when something changes while the loop is off (reduced motion).
  useEffect(() => {
    if (!reduced || status !== 'auto') return;
    const m = machine.current;
    if (!m) return;
    cam.current = { ...cam.current, ...(view === 'free' ? {} : VIEWS[view]) };
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paint(ctx, 0);
    hud(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, backplot, fro, ro, reduced, status, W]);

  const cycleStart = () => {
    const m = machine.current;
    if (m && (m.done || shown === 'done')) {
      m.reset();
      line.current = -1;
    }
    setStatus('run');
  };
  const feedHold = () => {
    if (running) setStatus('hold');
  };
  const reset = () => {
    machine.current?.reset();
    line.current = -1;
    setStatus('idle');
  };

  const post = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = [...draft.toUpperCase()]
      .filter((ch) => CHARSET.has(ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 18);
    const next = clean || DEFAULT_NAME;
    setDraft(next);
    setName(next);
    setStatus('run');
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw: cam.current.yaw, pitch: cam.current.pitch };
    setView('free');
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    cam.current = {
      yaw: Math.max(-0.9, Math.min(0.9, d.yaw + (e.clientX - d.x) * 0.006)),
      pitch: Math.max(0.3, Math.min(Math.PI / 2, d.pitch + (e.clientY - d.y) * 0.005)),
    };
    const ctx = canvas.current?.getContext('2d');
    if (ctx && reduced && status === 'auto') paint(ctx, 0);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const p = program;
  const total = estimate(p);

  return (
    <div ref={root} className={s.controller} data-status={shown}>
      <div className={s.dro} aria-label="Machine readouts">
        <section className={s.panel} aria-labelledby="dro-pos">
          <h2 id="dro-pos" className={s.panelHead}>
            <span>Position</span>
            <span>WCS G54</span>
          </h2>
          <div className={s.axes}>
            {(['x', 'y', 'z'] as const).map((a) => (
              <div key={a} className={s.axis}>
                <span className={s.axisName}>{a.toUpperCase()}</span>
                <span className={s.axisValue} data-ui={a}>
                  {'   +0.000'}
                </span>
                <span className={s.axisMach}>
                  MCS <span data-ui={`m${a}`}>0.000</span>
                </span>
              </div>
            ))}
          </div>
          <p className={s.dtg}>
            DTG <span data-ui="dtg">0.000</span> mm
          </p>
        </section>

        <section className={s.panel} aria-label="Feed and spindle">
          <div className={s.pair}>
            <div>
              <h3 className={s.label}>Feed mm/min</h3>
              <p className={s.lcd} data-ui="fa">
                0
              </p>
              <p className={s.sub}>
                F <span data-ui="f">—</span> · FRO {fro}%
              </p>
            </div>
            <div>
              <h3 className={s.label}>Spindle rpm</h3>
              <p className={s.lcd} data-ui="sa">
                0
              </p>
              <p className={s.sub}>
                S <span data-ui="s">—</span> · <span data-ui="dir">M5</span>
              </p>
            </div>
          </div>
          <div className={s.load}>
            <span>LOAD</span>
            <span className={s.loadBar} data-ui="loadbar" />
            <span data-ui="load">0%</span>
          </div>
        </section>

        <section className={s.panel} aria-label="Tool and coolant">
          <div className={s.toolRow}>
            <b data-ui="t">T1</b>
            <span data-ui="tname">90° V-bit · Ø6</span>
            <span className={s.dim} data-ui="h">
              G49
            </span>
          </div>
          <div className={s.lamps}>
            <span className={s.lamp} data-ui="m3">
              Spindle
            </span>
            <span className={s.lamp} data-ui="m8">
              M8 Flood
            </span>
            <span className={s.lamp} data-ui="m7">
              M7 Mist
            </span>
          </div>
          <p className={s.modal}>
            <span className={s.label}>Active</span>{' '}
            <span data-ui="modal">G0 G17 G21 G40 G49 G54 G80 G90 G94</span>
          </p>
        </section>
      </div>

      <div ref={wrap} className={s.viewport}>
        <canvas
          ref={canvas}
          style={{ aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label={`A CNC machine view. Program ${p.number} engraves “${name}” into a black anodized aluminium plate with a V-bit, then the role line with a fine engraver, then peck-drills four mounting holes.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className={s.vpTop}>
          <div className={s.seg} role="group" aria-label="View">
            {(['iso', 'top'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {v.toUpperCase()}
              </button>
            ))}
            <button type="button" aria-pressed={backplot} onClick={() => setBackplot(!backplot)}>
              PATH
            </button>
          </div>
          <span className={s.vpTag}>
            {p.number} · {p.file}
          </span>
        </div>
        <p className={s.note} data-ui="note" aria-hidden="true" />
        {shown === 'done' && (
          <p className={s.doneNote}>
            M30 · part {Math.max(1, parts)} complete ·{' '}
            <button type="button" onClick={cycleStart}>
              new blank ▸
            </button>
          </p>
        )}
        <p className={s.vpFoot}>
          <span>STOCK 200 × 80 × 6 · 6061-T6 · BLACK ANODIZED</span>
          <span className={s.vpHint}>drag to orbit</span>
        </p>
      </div>

      <section className={s.program} aria-labelledby="prog-head">
        <h2 id="prog-head" className={s.panelHead}>
          <span>Program</span>
          <span>
            {p.blocks.length} blocks · {(p.bytes / 1024).toFixed(1)} KB
          </span>
        </h2>
        <Listing program={p} listRef={listRef} />
        <dl className={s.cycle}>
          <div>
            <dt>Block</dt>
            <dd data-ui="blk">1/{p.blocks.length}</dd>
          </div>
          <div>
            <dt>Run</dt>
            <dd data-ui="run">00:00</dd>
          </div>
          <div>
            <dt>Left</dt>
            <dd data-ui="left">{clock(total)}</dd>
          </div>
          <div>
            <dt>Cycle</dt>
            <dd data-ui="cycle">{clock(total)}</dd>
          </div>
        </dl>
      </section>

      <div className={s.controls}>
        <div className={s.status} role="status">
          <span className={s.statusLamp} />
          {STATUS[shown]}
        </div>
        <div className={s.keys} role="group" aria-label="Cycle controls">
          <button type="button" className={s.start} onClick={cycleStart} disabled={running}>
            Cycle start
          </button>
          <button type="button" className={s.hold} onClick={feedHold} disabled={!running}>
            Feed hold
          </button>
          <button
            type="button"
            className={s.toggle}
            aria-pressed={single}
            onClick={() => setSingle(!single)}
          >
            Single block
          </button>
          <button type="button" className={s.resetKey} onClick={reset}>
            Reset
          </button>
        </div>
        <label className={s.fro}>
          <span>FRO</span>
          <input
            type="range"
            min={0}
            max={200}
            step={10}
            value={fro}
            onChange={(e) => setFro(Number(e.target.value))}
            aria-valuetext={`${fro}% feed override`}
          />
          <output>{fro}%</output>
        </label>
        <div className={s.rapids} role="group" aria-label="Rapid override">
          <span>RAPID</span>
          {[25, 50, 100].map((r) => (
            <button key={r} type="button" aria-pressed={ro === r} onClick={() => setRo(r)}>
              {r}%
            </button>
          ))}
        </div>
        <form className={s.mdi} onSubmit={post}>
          <label htmlFor="engrave">Engrave</label>
          <input
            id="engrave"
            value={draft}
            maxLength={18}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
          />
          <button type="submit">Post</button>
        </form>
      </div>
    </div>
  );
}
