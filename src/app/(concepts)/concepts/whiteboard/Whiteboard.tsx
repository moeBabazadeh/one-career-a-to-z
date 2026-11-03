'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { db, profile } from '../_shared/data';
import { useAnimationFrame, useInView, useReducedMotion } from '../_shared/hooks';
import { createBoard, type BoardApi, type Cam, type Tool } from './board';
import { Frame } from './Frames';
import {
  BLUE,
  BOUNDS,
  DIAGRAM,
  FRAMES,
  GREEN,
  INK,
  PEER,
  RED,
  TALL,
  WIDE,
  leaders,
  type FrameId,
} from './geometry';
import {
  step as stepPresence,
  trail,
  walker,
  type PeerId,
  type Tour,
  type Trail,
  type Walker,
} from './presence';
import type { Pt } from './rough';
import Sketch, { Pointer, type SketchHandle } from './Sketch';
import s from './whiteboard.module.scss';

/* ------------------------------------------------------------------ board or scroll */

// Phones and small tablets get the frames as a scrolling page instead of a board to pan.
const BOARD = '(min-width: 960px) and (min-height: 560px)';
const subscribeBoard = (onChange: () => void) => {
  const query = matchMedia(BOARD);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const useBoardMode = () =>
  useSyncExternalStore(
    subscribeBoard,
    () => matchMedia(BOARD).matches,
    () => true,
  );

/** Scales the tall sketch to the width of the page. */
function FitWidth({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const k = el.clientWidth / width;
      el.style.setProperty('--k', String(k));
      el.style.height = `${height * k}px`;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height]);
  return (
    <div ref={wrap} className={s.fitWidth}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

const ICONS = {
  select: 'M6 3.5 18 10l-5.4 1.7L10 17.5z',
  hand: 'M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11.5 11V4.8a1.5 1.5 0 0 1 3 0V11M14.5 11.5V6.8a1.5 1.5 0 0 1 3 0V14a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-5-2.7l-2.2-3.4a1.5 1.5 0 0 1 2.5-1.7l1.8 2.4',
  draw: 'M4.5 19.5 8.6 18.6 19 8.2 15.8 5 5.4 15.4zM13.8 7l3.2 3.2',
  laser: 'M4 20 11 13M15 3.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z',
  minus: 'M6 12h12',
  plus: 'M12 6v12M6 12h12',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  home: 'M3.5 6h6v5h-6zM14.5 13h6v5h-6zM9.5 8.5h3.2v7h1.8',
  replay: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7',
  skip: 'M5 6l7 6-7 6zM13 6l7 6-7 6z',
  clear: 'M5 19.5h14M8 16.5l-2-2 9-9 4 4-7 7zM10.5 9.5l4 4',
  prev: 'M14.5 6 8.5 12l6 6',
  next: 'M9.5 6l6 6-6 6',
  stop: 'M7 7h10v10H7z',
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" className={s.icon} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const TOOLS: { id: Tool; label: string; key: string; icon: keyof typeof ICONS }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: 'select' },
  { id: 'hand', label: 'Hand (pan)', key: 'H', icon: 'hand' },
  { id: 'draw', label: 'Draw', key: 'P', icon: 'draw' },
  { id: 'laser', label: 'Laser pointer', key: 'K', icon: 'laser' },
];
// Ink colours as tokens, so they flip with the board; each keeps its light-scheme hex as its name.
const INKS = [
  { c: INK, name: '#1e1e1e' },
  { c: RED, name: '#e03131' },
  { c: BLUE, name: '#1971c2' },
  { c: GREEN, name: '#2f9e44' },
];

const SHORTCUTS: [string, string][] = [
  ['Drag · Space+drag · trackpad', 'Pan'],
  ['Wheel · pinch · + −', 'Zoom'],
  ['Arrow keys', 'Pan'],
  ['Tab', 'Next frame'],
  ['[ ]', 'Previous / next frame'],
  ['Shift+1', 'Fit everything'],
  ['0', 'Zoom to 100%'],
  ['V H P K', 'Select, hand, draw, laser'],
  ['Esc', 'Back to the diagram'],
];

/* ------------------------------------------------------------------ collaborators */

const MOE = db.person.first;
const PEERS: { id: PeerId; name: string; color: string; initial: string; start: Pt }[] = [
  { id: 'moe', name: MOE, color: PEER.blue, initial: MOE[0], start: [0, 0] },
  { id: 'pm', name: 'Product', color: PEER.green, initial: 'P', start: [-250, 160] },
  { id: 'design', name: 'Design', color: PEER.red, initial: 'D', start: [560, -40] },
];

/* ------------------------------------------------------------------ page */

const LEADERS = leaders();
const MM = { x: BOUNDS.x - 120, y: BOUNDS.y - 120, w: BOUNDS.w + 240, h: BOUNDS.h + 240 };

function frameAt({ x, y, z }: Cam): FrameId | null {
  if (z < 0.3) return null;
  return (
    FRAMES.find(({ rect: r }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.id ??
    null
  );
}

export default function Whiteboard() {
  const reduced = useReducedMotion();
  const board = useBoardMode();
  const [rootRef, inView] = useInView<HTMLDivElement>(false, 0);
  const viewport = useRef<HTMLElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const inkLayer = useRef<SVGGElement>(null);
  const laserYou = useRef<SVGPathElement>(null);
  const laserMoe = useRef<SVGPathElement>(null);
  const zoomLabel = useRef<HTMLSpanElement>(null);
  const mmView = useRef<SVGRectElement>(null);
  const minimap = useRef<SVGSVGElement>(null);
  const sketch = useRef<SketchHandle>(null);
  const api = useRef<BoardApi | null>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [ink, setInk] = useState(INK);
  const [space, setSpace] = useState(false);
  const [current, setCurrent] = useState<FrameId | null>(null);
  const [follow, setFollow] = useState<PeerId | null>(null);
  const [tourStep, setTourStep] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [run, setRun] = useState(0);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);

  const currentRef = useRef<FrameId | null>(null);
  const followRef = useRef<PeerId | null>(null);
  const keyboard = useRef(false);
  const latest = useRef({ tool, ink });
  const walkers = useRef<Record<PeerId, Walker>>({
    moe: walker([0, 0], false, 0),
    pm: walker(PEERS[1].start, true, 4.5),
    design: walker(PEERS[2].start, true, 7),
  });
  const tour = useRef<Tour | null>(null);
  const trails = useRef<{ you: Trail[]; moe: Trail[] }>({ you: [], moe: [] });
  const clock = useRef({ last: 0 });

  useEffect(() => {
    latest.current = { tool, ink };
  });

  const stopFollow = () => {
    if (!followRef.current) return;
    followRef.current = null;
    tour.current = null;
    setFollow(null);
  };

  // Keep the chrome in step with the camera without re-rendering the board.
  const sync = (cam: Cam) => {
    const vp = viewport.current;
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(cam.z * 100)}%`;
    if (mmView.current && vp) {
      const w = vp.clientWidth / cam.z,
        h = vp.clientHeight / cam.z;
      mmView.current.setAttribute('x', String(cam.x - w / 2));
      mmView.current.setAttribute('y', String(cam.y - h / 2));
      mmView.current.setAttribute('width', String(w));
      mmView.current.setAttribute('height', String(h));
    }
    const id = frameAt(cam);
    if (id !== currentRef.current) {
      currentRef.current = id;
      setCurrent(id);
    }
  };

  useEffect(() => {
    const vp = viewport.current,
      w = world.current,
      layer = inkLayer.current;
    if (!board || !vp || !w || !layer) return;
    const b = createBoard(vp, w, {
      start: { x: 0, y: 0, z: 0.87 },
      reduced,
      ink: layer,
      onCamera: sync,
      onUser: stopFollow,
      onLaser: (p) => trails.current.you.push({ p, t: performance.now() }),
    });
    b.setTool(latest.current.tool);
    b.setInk(latest.current.ink);
    b.fly(b.fit(DIAGRAM), true);
    api.current = b;
    return () => {
      b.dispose();
      api.current = null;
    };
  }, [board, reduced]);

  useEffect(() => api.current?.setTool(tool), [tool]);
  useEffect(() => api.current?.setInk(ink), [ink]);

  const goTo = (id: FrameId | 'diagram' | 'all') => {
    const b = api.current;
    if (!b) return;
    stopFollow();
    setMenu(false);
    if (id === 'diagram') b.fly(b.fit(DIAGRAM));
    else if (id === 'all') b.fly(b.fit(BOUNDS, 1));
    else b.fly(b.fit(FRAMES.find((f) => f.id === id)!.rect, 1.1));
  };

  const step = (dir: 1 | -1) => {
    const i = FRAMES.findIndex((f) => f.id === currentRef.current);
    const next =
      i < 0 ? (dir === 1 ? 0 : FRAMES.length - 1) : (i + dir + FRAMES.length) % FRAMES.length;
    goTo(FRAMES[next].id);
  };

  // Keyboard: arrows pan, + and - zoom, tool letters, [ and ] step through frames.
  useEffect(() => {
    if (!board) return;
    const typing = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const pressable = (el: Element | null) =>
      !!el?.closest('a, button, summary, input, select, textarea');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') keyboard.current = true;
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const b = api.current;
      if (!b) return;
      const pan = e.shiftKey ? 320 : 110;
      if (e.key === ' ') {
        if (pressable(document.activeElement)) return;
        e.preventDefault();
        if (!e.repeat) {
          b.setSpace(true);
          setSpace(true);
        }
        return;
      }
      if (e.shiftKey && e.code === 'Digit1') return (e.preventDefault(), goTo('all'));
      switch (e.key) {
        case 'ArrowLeft':
          b.panBy(-pan, 0);
          break;
        case 'ArrowRight':
          b.panBy(pan, 0);
          break;
        case 'ArrowUp':
          b.panBy(0, -pan);
          break;
        case 'ArrowDown':
          b.panBy(0, pan);
          break;
        case '+':
        case '=':
          b.zoomBy(1.25);
          break;
        case '-':
        case '_':
          b.zoomBy(0.8);
          break;
        case '0':
          b.fly({ ...b.camera(), z: 1 });
          break;
        case ']':
          step(1);
          break;
        case '[':
          step(-1);
          break;
        case 'v':
        case 'V':
        case '1':
          setTool('select');
          break;
        case 'h':
        case 'H':
        case '2':
          setTool('hand');
          break;
        case 'p':
        case 'P':
        case '3':
          setTool('draw');
          break;
        case 'k':
        case 'K':
        case '4':
          setTool('laser');
          break;
        case '?':
          setHelp((h) => !h);
          break;
        case 'Escape':
          setHelp(false);
          setMenu(false);
          if (followRef.current) stopFollow();
          else goTo('diagram');
          break;
        default:
          return;
      }
      e.preventDefault();
      if (e.key !== 'Escape') stopFollow();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      api.current?.setSpace(false);
      setSpace(false);
    };
    const onPointer = () => (keyboard.current = false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointer, true);
    };
    // goTo, step and stopFollow only touch refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  // Tabbing into a frame flies the camera to it; tabbing back to the diagram flies home.
  const onFrameFocus = (id: FrameId) => {
    if (!keyboard.current || currentRef.current === id) return;
    goTo(id);
  };
  const onNodeFocus = () => {
    if (keyboard.current && currentRef.current) goTo('diagram');
  };
  const onNode = (frame: FrameId, e: React.MouseEvent) => {
    if (!board) return;
    e.preventDefault();
    goTo(frame);
    document.getElementById(`f-${frame}`)?.focus({ preventScroll: true });
  };

  /* ---------------------------------------------------------------- presence */

  const onSketchDone = (pen: Pt) => {
    const moe = walkers.current.moe;
    moe.x = DIAGRAM.x + pen[0];
    moe.y = DIAGRAM.y + pen[1];
    moe.to = [moe.x, moe.y];
    moe.moving = false;
    moe.until = performance.now() / 1000 + 2.5;
    moe.on = true;
  };

  const replay = () => {
    walkers.current.moe.on = false;
    setRun((n) => n + 1);
  };

  const toggleFollow = (id: PeerId) => {
    if (followRef.current === id) return stopFollow();
    followRef.current = id;
    setFollow(id);
    tour.current = id === 'moe' ? { i: -1, next: 0, circle: null } : null;
    if (id !== 'moe') {
      const b = api.current,
        w = walkers.current[id];
      if (b) b.fly({ x: w.x, y: w.y, z: Math.max(0.7, b.camera().z) });
    }
  };

  useAnimationFrame((sec) => {
    const b = api.current;
    const dt = clock.current.last ? Math.min(0.05, sec - clock.current.last) : 0;
    clock.current.last = sec;
    if (!b) return;
    const all = walkers.current;
    stepPresence(
      {
        sec,
        dt,
        board: b,
        walkers: all,
        tour: tour.current,
        follow: followRef.current,
        reduced,
        onTourStep: setTourStep,
        onTourEnd: stopFollow,
      },
      trails.current.moe,
    );
    world.current?.querySelectorAll<HTMLElement>('[data-peer]').forEach((el) => {
      const w = all[el.dataset.peer as PeerId];
      el.style.transform = `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px) scale(var(--iz, 1))`;
      el.style.opacity = w.on ? '1' : '0';
    });
    minimap.current?.querySelectorAll<SVGCircleElement>('[data-dot]').forEach((dot) => {
      const w = all[dot.dataset.dot as PeerId];
      dot.setAttribute('cx', String(w.x));
      dot.setAttribute('cy', String(w.y));
      dot.style.opacity = w.on ? '1' : '0';
    });
    laserYou.current?.setAttribute('d', trail(trails.current.you, sec * 1000));
    laserMoe.current?.setAttribute('d', trail(trails.current.moe, sec * 1000));
  }, board && inView);

  /* ---------------------------------------------------------------- minimap */

  const miniDrag = useRef(false);
  const onMini = (e: React.PointerEvent<SVGSVGElement>) => {
    const b = api.current;
    if (!b) return;
    if (e.type === 'pointerdown') {
      miniDrag.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      stopFollow();
    } else if (e.type === 'pointerup' || e.type === 'pointercancel') {
      miniDrag.current = false;
      return;
    } else if (!miniDrag.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = MM.x + ((e.clientX - r.left) / r.width) * MM.w,
      y = MM.y + ((e.clientY - r.top) / r.height) * MM.h;
    b.fly({ x, y, z: b.camera().z }, e.type === 'pointermove');
  };

  const index = FRAMES.findIndex((f) => f.id === current);
  const followName = PEERS.find((p) => p.id === follow)?.name;
  const followColor = PEERS.find((p) => p.id === follow)?.color;

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-tool={space ? 'hand' : tool}
      data-following={follow ?? undefined}
      style={{ '--follow': followColor } as React.CSSProperties}
    >
      <header className={s.top} data-ui="">
        <a
          href="#f-about"
          className={s.brand}
          onClick={(e) => {
            if (board) {
              e.preventDefault();
              goTo('about');
            }
          }}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true" className={s.logo}>
            <path d="M5 25 7 8l9 11 8-12 2 18" />
          </svg>
          <span>
            <b>{profile.name}</b>
            <small>system-design · whiteboard</small>
          </span>
        </a>

        <div className={s.toolbar} role="toolbar" aria-label="Board tools">
          {TOOLS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={s.tool}
              aria-pressed={tool === t.id}
              aria-label={`${t.label} (${t.key})`}
              title={`${t.label} — ${t.key} or ${i + 1}`}
              onClick={() => setTool(t.id)}
            >
              <Icon name={t.icon} />
              <span className={s.toolKey} aria-hidden="true">
                {i + 1}
              </span>
            </button>
          ))}
          <span className={s.divider} aria-hidden="true" />
          {drawing ? (
            <button type="button" className={s.skip} onClick={() => sketch.current?.skip()}>
              <Icon name="skip" /> Skip drawing
            </button>
          ) : (
            <button
              type="button"
              className={s.tool}
              aria-label="Redraw the diagram"
              title="Redraw the diagram"
              onClick={replay}
            >
              <Icon name="replay" />
            </button>
          )}
          {tool === 'draw' && (
            <span className={s.inks} role="group" aria-label="Ink colour">
              {INKS.map(({ c, name }) => (
                <button
                  key={c}
                  type="button"
                  className={s.swatch}
                  style={{ background: c }}
                  aria-pressed={ink === c}
                  aria-label={`Ink ${name}`}
                  onClick={() => setInk(c)}
                />
              ))}
              <button
                type="button"
                className={s.tool}
                aria-label="Clear your drawing"
                title="Clear your drawing"
                onClick={() => api.current?.clearInk()}
              >
                <Icon name="clear" />
              </button>
            </span>
          )}
        </div>

        <div className={s.people}>
          <ul className={s.avatars} aria-label="On this board">
            {PEERS.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={s.avatar}
                  style={{ '--c': p.color } as React.CSSProperties}
                  aria-pressed={follow === p.id}
                  title={p.id === 'moe' ? `Follow ${MOE}: a guided tour` : `Follow ${p.name}`}
                  onClick={() => toggleFollow(p.id)}
                >
                  {p.initial}
                  <span className={s.srOnly}>
                    {p.id === 'moe'
                      ? `Follow ${MOE} on a guided tour`
                      : `Follow ${p.name}’s cursor`}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <span className={`${s.avatar} ${s.you}`} title="You">
                You
              </span>
            </li>
          </ul>
          <button
            type="button"
            className={s.tourBtn}
            aria-pressed={follow === 'moe'}
            onClick={() => toggleFollow('moe')}
          >
            {follow === 'moe' ? 'Stop tour' : 'Take the tour'}
          </button>
          <a className={s.cta} href={`mailto:${profile.email}`}>
            Email me
          </a>
        </div>
      </header>

      <header className={s.mobileTop}>
        <a href="#top" className={s.brand}>
          <svg viewBox="0 0 32 32" aria-hidden="true" className={s.logo}>
            <path d="M5 25 7 8l9 11 8-12 2 18" />
          </svg>
          <span>
            <b>{profile.name}</b>
            <small>system-design · whiteboard</small>
          </span>
        </a>
        <a className={s.cta} href={`mailto:${profile.email}`}>
          Email me
        </a>
      </header>

      <main ref={viewport} className={s.viewport} id="top">
        <div ref={world} className={s.world}>
          <svg className={s.leaders} aria-hidden="true">
            <path d={LEADERS} />
          </svg>

          <div className={s.wideOnly} onFocus={onNodeFocus}>
            <Sketch
              ref={sketch}
              layout={WIDE}
              run={run}
              onNode={onNode}
              onDone={onSketchDone}
              onPhase={setDrawing}
            />
          </div>
          <div className={s.tallOnly}>
            <FitWidth width={TALL.W} height={TALL.H}>
              <Sketch layout={TALL} run={0} onNode={onNode} />
            </FitWidth>
            <nav className={s.chips} aria-label="Frames">
              {FRAMES.map((f, i) => (
                <a key={f.id} href={`#f-${f.id}`}>
                  <span>{String(i + 1).padStart(2, '0')}</span> {f.label}
                </a>
              ))}
            </nav>
          </div>

          {FRAMES.map((f) => (
            <Frame key={f.id} spec={f} onFocus={onFrameFocus} />
          ))}

          <svg className={s.inkLayer} aria-hidden="true">
            <g ref={inkLayer} className={s.ink} />
            <path ref={laserMoe} className={s.laser} />
            <path ref={laserYou} className={s.laser} />
          </svg>

          {PEERS.map((p) => (
            <div
              key={p.id}
              className={s.peer}
              data-peer={p.id}
              aria-hidden="true"
              style={{
                transform: `translate(${p.start[0]}px, ${p.start[1]}px)`,
                opacity: p.id === 'moe' ? 0 : 1,
              }}
            >
              <Pointer name={p.name} color={p.color} />
            </div>
          ))}
        </div>
      </main>

      {follow && (
        <p className={s.followBadge} data-ui="" role="status">
          <span style={{ background: followColor }} aria-hidden="true" />
          {follow === 'moe'
            ? `${MOE} is presenting · ${tourStep + 1}/${FRAMES.length} ${FRAMES[tourStep]?.label ?? ''}`
            : `Following ${followName}`}
          <button type="button" onClick={stopFollow}>
            <Icon name="stop" /> Stop <kbd>Esc</kbd>
          </button>
        </p>
      )}

      <div className={s.dock} data-ui="">
        <svg
          ref={minimap}
          className={s.minimap}
          style={{ aspectRatio: `${MM.w} / ${MM.h}` }}
          viewBox={`${MM.x} ${MM.y} ${MM.w} ${MM.h}`}
          onPointerDown={onMini}
          onPointerMove={onMini}
          onPointerUp={onMini}
          onPointerCancel={onMini}
          role="img"
          aria-label="Minimap of the board"
        >
          <rect
            x={DIAGRAM.x}
            y={DIAGRAM.y}
            width={DIAGRAM.w}
            height={DIAGRAM.h}
            className={s.mmDiagram}
            rx={40}
          />
          {FRAMES.map((f) => (
            <rect
              key={f.id}
              x={f.rect.x}
              y={f.rect.y}
              width={f.rect.w}
              height={f.rect.h}
              rx={30}
              className={f.id === current ? s.mmActive : s.mmFrame}
            />
          ))}
          {PEERS.map((p) => (
            <circle
              key={p.id}
              data-dot={p.id}
              r={90}
              fill={p.color}
              cx={p.start[0]}
              cy={p.start[1]}
              opacity={p.id === 'moe' ? 0 : 1}
            />
          ))}
          <rect ref={mmView} className={s.mmView} rx={30} />
        </svg>
        <div className={s.zoom} role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out (−)"
            onClick={() => api.current?.zoomBy(0.8)}
          >
            <Icon name="minus" />
          </button>
          <button
            type="button"
            className={s.zoomValue}
            aria-label="Reset zoom to 100%"
            title="Reset to 100% (0)"
            onClick={() => {
              const b = api.current;
              if (b) b.fly({ ...b.camera(), z: 1 });
            }}
          >
            <span ref={zoomLabel}>87%</span>
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in (+)"
            onClick={() => api.current?.zoomBy(1.25)}
          >
            <Icon name="plus" />
          </button>
          <span className={s.divider} aria-hidden="true" />
          <button
            type="button"
            aria-label="Fit everything"
            title="Fit everything (Shift+1)"
            onClick={() => goTo('all')}
          >
            <Icon name="fit" />
          </button>
          <button
            type="button"
            aria-label="Back to the diagram"
            title="Back to the diagram (Esc)"
            onClick={() => goTo('diagram')}
          >
            <Icon name="home" />
          </button>
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            aria-expanded={help}
            title="Shortcuts (?)"
            onClick={() => setHelp(!help)}
          >
            ?
          </button>
        </div>
        {help && (
          <div className={s.help} role="dialog" aria-label="Keyboard shortcuts">
            <dl>
              {SHORTCUTS.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <nav className={s.navigator} data-ui="" aria-label="Frames">
        <button
          type="button"
          aria-label="Previous frame"
          title="Previous frame ([)"
          onClick={() => step(-1)}
        >
          <Icon name="prev" />
        </button>
        <button
          type="button"
          className={s.navCurrent}
          aria-expanded={menu}
          aria-haspopup="true"
          onClick={() => setMenu(!menu)}
        >
          {index >= 0 ? (
            <>
              <span className={s.navNo}>
                {String(index + 1).padStart(2, '0')}/{FRAMES.length}
              </span>{' '}
              {FRAMES[index].label}
            </>
          ) : (
            <>
              <span className={s.navNo}>00/{FRAMES.length}</span> The diagram
            </>
          )}
        </button>
        <button
          type="button"
          aria-label="Next frame"
          title="Next frame (])"
          onClick={() => step(1)}
        >
          <Icon name="next" />
        </button>
        {menu && (
          <ol className={s.navMenu}>
            <li>
              <button type="button" onClick={() => goTo('diagram')}>
                <span className={s.navNo}>00</span> The diagram
              </button>
            </li>
            {FRAMES.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  aria-current={f.id === current ? 'true' : undefined}
                  onClick={() => goTo(f.id)}
                >
                  <span className={s.navNo}>{String(i + 1).padStart(2, '0')}</span> {f.label}
                </button>
              </li>
            ))}
          </ol>
        )}
      </nav>
      <noscript>
        <style>{`.${s.sketch} path{stroke-dasharray:none!important}.${s.sketch} [data-w]{clip-path:none!important}`}</style>
      </noscript>
    </div>
  );
}
