'use client';

import { useEffect, useRef, useState } from 'react';
import { profile } from '../_shared/data';
import { useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import type { Planner } from './assign';
import { readTheme, type CamId } from './draw';
import { Engine, type LogEntry, type Mode } from './engine';
import { firstOf, legs, waypoints } from './mission';
import Payload from './PayloadCard';
import { N, type Tool } from './sim';
import { onFly } from './store';
import s from './swarm.module.scss';

const CAMS: { id: CamId; label: string }[] = [
  { id: 'audience', label: 'Audience' },
  { id: 'chase', label: 'Chase' },
  { id: 'high', label: 'High' },
];

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  {
    id: 'attract',
    label: 'Attract',
    hint: 'Drag in the sky: nearby drones swarm to the beacon, then fly back to their slots.',
  },
  {
    id: 'repel',
    label: 'No-fly',
    hint: 'Drag a no-fly zone through the formation: drones route around it.',
  },
  {
    id: 'steer',
    label: 'Steer',
    hint: 'Drag the whole formation; arrow keys nudge it, Home re-centres.',
  },
];

const WINDS = ['Calm', 'Breeze', 'Gusty'];

const INITIAL_LOG: LogEntry[] = [
  {
    id: 0,
    t: 'T+00:00',
    kind: 'sys',
    text: `Pre-flight: ${N} drones on the pads, batteries charged, geofence loaded.`,
  },
];

const HUD: { key: string; label: string; title: string }[] = [
  { key: 'airborne', label: 'Air', title: 'Drones airborne' },
  { key: 'slots', label: 'Slot', title: 'Drones in their formation slot, of those assigned one' },
  { key: 'standby', label: 'Stby', title: 'Drones on standby over the pads' },
  { key: 'alt', label: 'Alt', title: 'Mean altitude' },
  { key: 'speed', label: 'Spd', title: 'Mean ground speed' },
  { key: 'battery', label: 'Bat', title: 'Mean battery charge' },
  { key: 'link', label: 'Link', title: 'Mean telemetry link quality' },
  { key: 'sep', label: 'Sep', title: 'Closest pair of drones right now' },
];

/** The ground control station: the flight display, the mission plan, the payload and the log. */
export default function Gcs() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [rootRef, visible] = useInView<HTMLElement>(false, 0.02);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const visibleRef = useRef(false);
  const [wp, setWp] = useState(0);
  const [mode, setMode] = useState<Mode>('DISARMED');
  const [log, setLog] = useState<LogEntry[]>(INITIAL_LOG);
  const [planner, setPlanner] = useState<Planner>('optimal');
  const [tool, setTool] = useState<Tool>('attract');
  const [cam, setCam] = useState<CamId>('audience');
  const [wind, setWind] = useState(1);
  const [avoid, setAvoid] = useState(true);
  const [paths, setPaths] = useState(true);
  const [labels, setLabels] = useState(true);
  const [announce, setAnnounce] = useState('');

  // The engine lives as long as the page.
  useEffect(() => {
    const root = rootRef.current,
      canvas = canvasRef.current;
    if (!root || !canvas) return;
    const engine = new Engine(root, canvas, readTheme(canvas, token), {
      waypoint: setWp,
      mode: setMode,
      log: (e) => setLog((l) => [e, ...l].slice(0, 80)),
    });
    engineRef.current = engine;
    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(root);
    observer.observe(canvas);
    document.fonts?.ready.then(() => engine.setTheme(readTheme(canvas, token)));
    const off = onFly((i) => {
      engine.fly(i);
      setAnnounce(`Flying ${waypoints[i].code}: ${waypoints[i].title}`);
    });
    return () => {
      off();
      observer.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [rootRef]);

  useEffect(() => {
    engineRef.current?.setReduced(reduced);
  }, [reduced]);

  useEffect(() => {
    visibleRef.current = visible;
    engineRef.current?.setActive(visible);
  }, [visible]);

  // Night ops or the daylight field test: the canvas repaints from the page's tokens.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) engineRef.current?.setTheme(readTheme(canvas, token));
  }, [scheme]);

  useEffect(() => {
    engineRef.current?.setOverlay({ paths, labels });
  }, [paths, labels]);

  const engine = () => engineRef.current;

  const fly = (i: number) => {
    engine()?.fly(i);
    setAnnounce(`Flying ${waypoints[i].code}: ${waypoints[i].title}`);
  };
  const stepBy = (by: 1 | -1) => {
    const e = engine();
    if (!e) return;
    e.step(by);
  };
  const scatter = () => {
    engine()?.scatter();
    setAnnounce('Scatter');
  };
  const land = () => {
    engine()?.land();
    setAnnounce('Return to launch');
  };
  const toggleAuto = () => engine()?.toggleAuto();
  const pickTool = (t: Tool) => {
    setTool(t);
    engine()?.setTool(t);
  };
  const choosePlanner = (p: Planner) => {
    if (p === planner) return;
    setPlanner(p);
    engine()?.setPlanner(p);
  };
  const chooseAvoid = (on: boolean) => {
    if (on === avoid) return;
    setAvoid(on);
    engine()?.setAvoidance(on);
  };
  const chooseWind = (k: number) => {
    if (k === wind) return;
    setWind(k);
    engine()?.setWind(k);
  };
  const pickCam = (c: CamId) => {
    setCam(c);
    engine()?.setCamera(c);
  };

  // Shortcuts while the station is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!visibleRef.current || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const en = engineRef.current;
      if (!en) return;
      const k = e.key.toLowerCase();
      if (/^[1-9]$/.test(k)) {
        const leg = legs[Number(k) - 1];
        if (!leg) return;
        const i = firstOf(leg.id);
        en.fly(i);
        setAnnounce(`Flying ${waypoints[i].code}: ${waypoints[i].title}`);
      } else if (k === ']') en.step(1);
      else if (k === '[') en.step(-1);
      else if (k === 's') {
        en.scatter();
        setAnnounce('Scatter');
      } else if (k === 'l') {
        en.land();
        setAnnounce('Return to launch');
      } else if (k === 'a') en.toggleAuto();
      else if (k === 'c') {
        setCam((c) => {
          const next = CAMS[(CAMS.findIndex((x) => x.id === c) + 1) % CAMS.length].id;
          en.setCamera(next);
          return next;
        });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onCanvasKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const en = engine();
    if (!en) return;
    const k = e.shiftKey ? 8 : 3;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-k, 0],
      ArrowRight: [k, 0],
      ArrowUp: [0, k],
      ArrowDown: [0, -k],
    };
    if (e.key in dirs) {
      e.preventDefault();
      en.nudge(...dirs[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      en.center();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      en.toggleAuto();
    }
  };

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const current = waypoints[wp];
  const auto = mode === 'AUTO';

  return (
    <section id="gcs" ref={rootRef} className={s.gcs} aria-labelledby="gcs-title" data-mode={mode}>
      <header className={s.ident} data-avoid="left">
        <p className={s.callsign}>
          <span className={s.dot} aria-hidden="true" /> Pilot in command
        </p>
        <h1 id="gcs-title">{profile.name}</h1>
        <p className={s.identRole}>
          {`${profile.role}, `}
          <a href={profile.companyUrl} target="_blank" rel="noreferrer">
            {profile.company}
          </a>
          {` · ${profile.headline.toLowerCase()}`}
        </p>
        <p className={s.identTag}>{profile.tagline}</p>
        <p className={s.identLinks}>
          <a className={s.primary} href={`mailto:${profile.email}`}>
            Email
          </a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV ↗
          </a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn ↗
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </p>
      </header>

      <div className={s.stage}>
        <canvas
          ref={canvasRef}
          className={s.canvas}
          role="application"
          tabIndex={0}
          aria-roledescription="flight display"
          aria-label={`Flight display: ${N} quadcopters flying ${current.code}, ${current.title}. Drag to ${tool === 'attract' ? 'pull drones to a beacon' : tool === 'repel' ? 'push a no-fly zone through the formation' : 'steer the formation'}. Arrow keys steer, Home re-centres, Space toggles AUTO.`}
          aria-describedby="payload-title"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            engine()?.pointerDown(...local(e), e.pointerType);
          }}
          onPointerMove={(e) => engine()?.pointerMove(...local(e))}
          onPointerUp={() => engine()?.pointerUp()}
          onPointerCancel={() => engine()?.pointerUp()}
          onPointerLeave={() => engine()?.pointerLeave()}
          onKeyDown={onCanvasKey}
        />
        <div className={s.hud} data-avoid="top">
          <p className={s.hudMode}>
            <span className={s.modeChip} data-mode={mode}>
              {mode}
            </span>
            <span data-hud="clock">T+00:00</span>
            <span data-hud="wp">ON PADS</span>
          </p>
          <dl className={s.hudStats}>
            {HUD.map((h) => (
              <div key={h.key} title={h.title}>
                <dt>{h.label}</dt>
                <dd data-hud={h.key}>—</dd>
              </div>
            ))}
            <div
              title="Near misses (closer than a metre) and collisions so far"
              className={s.hudSafety}
            >
              <dt>Near / hit</dt>
              <dd>
                <span data-hud="near">0</span>/<span data-hud="hits">0</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className={s.deck} role="toolbar" aria-label="Flight commands" data-avoid="bottom">
        <div className={s.deckGroup}>
          <button
            type="button"
            className={s.autoBtn}
            aria-pressed={auto}
            onClick={toggleAuto}
            disabled={reduced}
            title={
              reduced
                ? 'AUTO is off with reduced motion: step through the plan instead'
                : 'Fly the mission plan by itself'
            }
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              {auto ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5 13 8l-9 5.5z" />}
            </svg>
            Auto
          </button>
          <button
            type="button"
            onClick={() => stepBy(-1)}
            aria-label="Previous waypoint"
            aria-keyshortcuts="["
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10.5 3 5.5 8l5 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => stepBy(1)}
            aria-label="Next waypoint"
            aria-keyshortcuts="]"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.5 3l5 5-5 5" />
            </svg>
          </button>
        </div>
        <div className={s.deckGroup}>
          <button type="button" onClick={scatter} aria-keyshortcuts="s">
            Scatter
          </button>
          <button type="button" onClick={land} aria-keyshortcuts="l">
            Land
          </button>
        </div>
        <div className={s.deckGroup} role="group" aria-label="Pointer tool">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tool === t.id}
              title={t.hint}
              onClick={() => pickTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <aside className={s.payWrap} aria-labelledby="payload-title" data-avoid="right">
        <p className={s.panelTitle}>
          Payload <span>what the swarm is showing</span>
        </p>
        <Payload wp={wp} onFly={fly} />
      </aside>

      <nav className={s.plan} aria-labelledby="plan-title" data-avoid="left">
        <h2 id="plan-title" className={s.panelTitle}>
          Mission plan <span>{waypoints.length} waypoints</span>
        </h2>
        <ol>
          {legs.map((leg, li) => {
            const idx = waypoints.map((w, i) => (w.leg === leg.id ? i : -1)).filter((i) => i >= 0);
            const on = current.leg === leg.id;
            return (
              <li key={leg.id} data-on={on || undefined}>
                <button
                  type="button"
                  className={s.legBtn}
                  onClick={() => fly(idx[0])}
                  aria-current={on ? 'step' : undefined}
                  aria-keyshortcuts={String(li + 1)}
                >
                  <span className={s.legNo}>{String(li + 1).padStart(2, '0')}</span>
                  <span className={s.legName}>{leg.name}</span>
                  {idx.length === 1 && <span className={s.legShows}>{leg.shows}</span>}
                  {idx.length === 1 && (
                    <span className={s.dwell} data-dwell={idx[0]} aria-hidden="true" />
                  )}
                </button>
                {idx.length > 1 && (
                  <span className={s.subs}>
                    {idx.map((i) => (
                      <button
                        key={i}
                        type="button"
                        className={s.sub}
                        data-dwell={i}
                        aria-pressed={i === wp}
                        aria-label={`${waypoints[i].code}: ${waypoints[i].title}`}
                        title={waypoints[i].title}
                        onClick={() => fly(i)}
                      >
                        <span aria-hidden="true">{waypoints[i].sub + 1}</span>
                      </button>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <section className={s.fc} aria-labelledby="fc-title" data-avoid="left">
        <h2 id="fc-title" className={s.panelTitle}>
          Flight controller
        </h2>
        <div className={s.fcRow} role="group" aria-label="Slot assignment">
          <span>Assign</span>
          <button
            type="button"
            aria-pressed={planner === 'optimal'}
            onClick={() => choosePlanner('optimal')}
            title="Hungarian method: minimum sum of squared distances, so paths never cross"
          >
            Optimal
          </button>
          <button
            type="button"
            aria-pressed={planner === 'greedy'}
            onClick={() => choosePlanner('greedy')}
            title="Closest pairs first: every drone takes the nearest free slot"
          >
            Greedy
          </button>
        </div>
        <div className={s.fcRow} role="group" aria-label="Collision avoidance">
          <span>Avoid</span>
          <button type="button" aria-pressed={avoid} onClick={() => chooseAvoid(true)}>
            On
          </button>
          <button
            type="button"
            aria-pressed={!avoid}
            data-danger
            onClick={() => chooseAvoid(false)}
          >
            Off
          </button>
        </div>
        <div className={s.fcRow} role="group" aria-label="Wind">
          <span>Wind</span>
          {WINDS.map((label, k) => (
            <button
              key={label}
              type="button"
              aria-pressed={wind === k}
              onClick={() => chooseWind(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={s.fcRow} role="group" aria-label="Camera">
          <span>Camera</span>
          {CAMS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cam === c.id}
              onClick={() => pickCam(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className={s.fcRow} role="group" aria-label="Overlays">
          <span>Show</span>
          <button type="button" aria-pressed={paths} onClick={() => setPaths(!paths)}>
            Paths
          </button>
          <button type="button" aria-pressed={labels} onClick={() => setLabels(!labels)}>
            Labels
          </button>
        </div>
        <p className={s.keys}>
          <kbd>1</kbd>–<kbd>9</kbd> legs · <kbd>[</kbd> <kbd>]</kbd> waypoints · <kbd>A</kbd> auto ·{' '}
          <kbd>S</kbd> scatter · <kbd>L</kbd> land · <kbd>C</kbd> camera
        </p>
      </section>

      <section className={s.logWrap} aria-labelledby="log-title" data-avoid="right">
        <h2 id="log-title" className={s.panelTitle}>
          Mission log
        </h2>
        <ol className={s.log}>
          {log.map((e) => (
            <li key={e.id} data-kind={e.kind}>
              <time>{e.t}</time>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className={s.sr} aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
