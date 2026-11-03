'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { concept } from '../_shared/concepts';
import { db, profile } from '../_shared/data';
import { readScheme, writeScheme } from '../_shared/scheme';
import { DURATIONS, RATES, type Cond } from './capture';
import Panel, { FrameNav } from './Panel';
import Report from './Report';
import {
  CHANNELS,
  FASTEST,
  boot,
  capSpan,
  clearMarkers,
  cycle,
  fit,
  get,
  home,
  pan,
  placeMarker,
  set,
  setSettings,
  start,
  stepEdge,
  stepFrame,
  stop,
  useLA,
  zoomAt,
} from './store';
import { count, duration, freq, rate, time } from './units';
import { I2C_HZ, SPI_HZ, UART_BAUD } from './world';
import Waveform from './Waveform';
import s from './logic.module.scss';

const me = concept('logic-analyzer');

/* ------------------------------------------------------------------ read as a page, by hash */

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const useReading = () =>
  useSyncExternalStore(
    subscribeHash,
    () => window.location.hash === '#read',
    () => false,
  );

/* ------------------------------------------------------------------ trigger presets */

const none = (): Cond[] => CHANNELS.map(() => 'none');
const withConds = (pairs: [number, Cond][]) => {
  const t = none();
  pairs.forEach(([ch, c]) => (t[ch] = c));
  return t;
};

const PRESETS: { id: string; label: string; trig: Cond[] }[] = [
  { id: 'none', label: 'None: start now', trig: none() },
  { id: 'rx', label: 'D1 RX falls: a keystroke', trig: withConds([[1, 'fall']]) },
  { id: 'tx', label: 'D0 TX falls: the console talks', trig: withConds([[0, 'fall']]) },
  {
    id: 'i2c',
    label: 'I²C start: SDA falls, SCL high',
    trig: withConds([
      [2, 'high'],
      [3, 'fall'],
    ]),
  },
  { id: 'cs', label: 'D7 CS falls: flash selected', trig: withConds([[7, 'fall']]) },
  {
    id: 'fault',
    label: 'SPI fault: SCLK high, CS high',
    trig: withConds([
      [4, 'high'],
      [7, 'high'],
    ]),
  },
];

const sameTrig = (a: Cond[], b: Cond[]) => a.every((c, i) => c === b[i]);

/** "↓ D1 RX", "D2 high · ↓ D3 SDA": the trigger in a few characters. */
export function trigText(trig: Cond[]) {
  const parts = trig
    .map((c, i) =>
      c === 'none'
        ? ''
        : c === 'rise'
          ? `↑ D${i} ${CHANNELS[i].name}`
          : c === 'fall'
            ? `↓ D${i} ${CHANNELS[i].name}`
            : `D${i} ${c}`,
    )
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : 'none';
}

/* ------------------------------------------------------------------ header */

function Mark() {
  return (
    <svg viewBox="0 0 28 28" width={28} height={28} aria-hidden="true" className={s.mark}>
      <rect x={1} y={1} width={26} height={26} rx={7} />
      <path d="M5 18h3v-8h3v8h3v-8h3v8h3v-8h3" />
    </svg>
  );
}

function CaptureControls() {
  const phase = useLA((st) => st.phase);
  const settings = useLA((st) => st.settings);
  const busy = phase === 'waiting' || phase === 'recording';
  const preset = PRESETS.find((p) => sameTrig(p.trig, settings.trig))?.id ?? 'custom';
  const low = settings.rate < FASTEST * 4;
  return (
    <div className={s.capture} role="group" aria-label="Capture">
      <button
        type="button"
        className={s.startBtn}
        data-busy={busy || undefined}
        onClick={() => (busy ? stop() : start())}
        aria-keyshortcuts="R"
      >
        <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
          {busy ? (
            <rect x={3.5} y={3.5} width={9} height={9} rx={1.5} />
          ) : (
            <path d="M4.5 2.8v10.4L13 8z" />
          )}
        </svg>
        {busy ? 'Stop' : 'Start'}
      </button>
      <label className={s.field} data-warn={low || undefined}>
        <span>Rate</span>
        <select
          value={settings.rate}
          onChange={(e) => setSettings({ rate: Number(e.target.value) })}
          title={
            low
              ? `Below 4× the ${freq(FASTEST)} SPI clock: expect decode errors`
              : 'Digital sample rate'
          }
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {rate(r)}
            </option>
          ))}
        </select>
      </label>
      <label className={s.field}>
        <span>Length</span>
        <select
          value={settings.duration}
          onChange={(e) => setSettings({ duration: Number(e.target.value) })}
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {duration(d)}
            </option>
          ))}
        </select>
      </label>
      <label className={`${s.field} ${s.trigField}`}>
        <span>Trigger</span>
        <select
          value={preset}
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            if (p) setSettings({ trig: p.trig });
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          {preset === 'custom' && (
            <option value="custom">{`Custom: ${trigText(settings.trig)}`}</option>
          )}
        </select>
      </label>
    </div>
  );
}

function SchemeToggle() {
  return (
    <button
      type="button"
      className={s.iconBtn}
      onClick={() => writeScheme(readScheme() === 'dark' ? 'light' : 'dark')}
      aria-label="Switch light or dark theme"
      title="Light or dark theme"
    >
      <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" className={s.sun}>
        <circle cx={8} cy={8} r={3} />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" />
      </svg>
      <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" className={s.moon}>
        <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ view toolbar */

function Toolbar() {
  const view = useLA((st) => st.view);
  const cap = useLA((st) => st.cap);
  const center = view.t0 + view.span / 2;
  return (
    <div className={s.toolbar} role="toolbar" aria-label="View">
      <div className={s.tGroup}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => zoomAt(center, 2)}
          disabled={!cap}
          aria-label="Zoom out"
          title="Zoom out (S)"
        >
          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
            <path d="M3.5 8h9" />
          </svg>
        </button>
        <output className={s.span} title="Time across the view">
          {time(view.span, 3)}
        </output>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => zoomAt(center, 0.5)}
          disabled={!cap}
          aria-label="Zoom in"
          title="Zoom in (W)"
        >
          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
            <path d="M3.5 8h9M8 3.5v9" />
          </svg>
        </button>
        <button
          type="button"
          className={s.btn}
          onClick={fit}
          disabled={!cap}
          title="Zoom to fit (F)"
        >
          Fit
        </button>
        <button
          type="button"
          className={s.btn}
          onClick={() => home()}
          disabled={!cap}
          title="Back to the trigger (T)"
        >
          Trigger
        </button>
      </div>
      <FrameNav />
      <div className={s.tGroup}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => stepEdge(-1)}
          disabled={!cap}
          aria-label="Previous edge on the selected channel"
          title="Previous edge ([)"
        >
          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
            <path d="M14 12H9V4H4M6.5 6.5L4 4l2.5-2.5" />
          </svg>
        </button>
        <span className={s.tLabel}>Edge</span>
        <button
          type="button"
          className={s.iconBtn}
          onClick={() => stepEdge(1)}
          disabled={!cap}
          aria-label="Next edge on the selected channel"
          title="Next edge (])"
        >
          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
            <path d="M2 12h5V4h5M9.5 6.5L12 4 9.5 1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ status bar */

function StatusBar() {
  const cap = useLA((st) => st.cap);
  const phase = useLA((st) => st.phase);
  const hover = useLA((st) => st.hover);
  const markers = useLA((st) => st.markers);
  const settings = useLA((st) => st.settings);
  const dec = useLA((st) => st.dec);
  const { A, B } = markers;
  const edges = cap ? cap.traces.reduce((n, t) => n + t.edges.length, 0) : 0;
  const errors = dec
    ? [dec.tx, dec.rx, dec.i2c, dec.spi].reduce(
        (n, fr) => n + fr.reduce((m, f) => m + (f.err ? 1 : 0), 0),
        0,
      )
    : 0;
  return (
    <footer className={s.status}>
      <dl className={s.stats}>
        <div>
          <dt>Cursor</dt>
          <dd>{hover ? time(hover.t, 7, true) : '—'}</dd>
        </div>
        <div>
          <dt>A</dt>
          <dd>{A === null ? '—' : time(A, 6, true)}</dd>
        </div>
        <div>
          <dt>B</dt>
          <dd>{B === null ? '—' : time(B, 6, true)}</dd>
        </div>
        <div>
          <dt>Δt</dt>
          <dd>
            {A !== null && B !== null
              ? `${time(Math.abs(B - A), 5)}${A !== B ? ` · ${freq(1 / Math.abs(B - A))}` : ''}`
              : '—'}
          </dd>
        </div>
      </dl>
      <p className={s.capInfo}>
        {cap ? (
          <>
            <span>{`${duration(capSpan(cap))} at ${rate(cap.rate)}`}</span>
            <span>{`${count(Math.round(capSpan(cap) * cap.rate))}samples`}</span>
            <span>{`${count(edges)} edges`}</span>
            <span>
              {cap.triggered
                ? `trigger ${trigText(cap.trig)} at loop ${time(cap.phase, 4, true)}`
                : 'untriggered'}
            </span>
            {phase === 'waiting' && <span>{`armed: ${trigText(settings.trig)}`}</span>}
            {phase === 'done' && (
              <span data-err={errors > 0 || undefined}>
                {errors ? `${errors} decode errors` : 'decoded clean'}
              </span>
            )}
          </>
        ) : (
          <span>Arming…</span>
        )}
        <span className={s.keysHint}>Press ? for keys</span>
      </p>
    </footer>
  );
}

/* ------------------------------------------------------------------ keys */

const KEYS: [string, string][] = [
  ['R', 'Start or stop a capture'],
  ['W  ↑  +', 'Zoom in'],
  ['S  ↓  −', 'Zoom out'],
  ['A  ←', 'Pan left (with Shift, a whole screen)'],
  ['D  →', 'Pan right'],
  ['Wheel', 'Zoom at the pointer; Shift or sideways to pan'],
  ['Drag', 'Pan; drag a marker flag to move it'],
  ['F', 'Zoom to fit the capture'],
  ['T', 'Back to the trigger'],
  ['N  Shift+N', 'Next or previous frame of the focused analyzer'],
  ['[  ]', 'Previous or next edge on the selected channel'],
  ['M', 'Drop a timing marker at the cursor'],
  ['⌘F  Ctrl+F', 'Search the decoded data'],
  ['Esc', 'Clear markers and selection'],
  ['?', 'This list'],
];

function Keys({ onClose }: { onClose: () => void }) {
  return (
    <div className={s.keysBack} onClick={onClose}>
      <div
        className={s.keys}
        role="dialog"
        aria-modal="true"
        aria-labelledby="la-keys"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="la-keys">Keyboard shortcuts</h2>
        <dl>
          {KEYS.map(([k, v]) => (
            <div key={k}>
              <dt>
                {k.split('  ').map((x) => (
                  <kbd key={x}>{x}</kbd>
                ))}
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className={s.btn} onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ root */

const LABEL = `Eight digital channels and the 3V3 rail of a device: a serial console at ${UART_BAUD} baud, an I²C bus at ${I2C_HZ / 1e3} kHz and an SPI flash at ${SPI_HZ / 1e6} MHz, with the decoded bytes drawn over the traces. The same text is in the terminal beside it, or read it as a page.`;

export default function Logic() {
  const reading = useReading();
  const [keys, setKeys] = useState(false);

  // The first capture arms at power-on, so it opens on the console waking up.
  useEffect(() => {
    const id = requestAnimationFrame(() => boot());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (reading) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, select, textarea, [contenteditable="true"]')) {
        if (e.key === 'Escape') el.blur();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('la-search')?.focus();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Keys that act on buttons and links keep their usual meaning there.
      if ((e.key === ' ' || e.key === 'Enter') && el?.closest('button, a, [tabindex]')) return;
      const st = get();
      const { view } = st;
      const at = st.hover ? st.hover.t : view.t0 + view.span / 2;
      const k = e.key;
      let handled = true;
      if (k === 'r' || k === 'R') {
        if (st.phase === 'waiting' || st.phase === 'recording') stop();
        else start();
      } else if (k === 'w' || k === 'W' || k === 'ArrowUp' || k === '+' || k === '=')
        zoomAt(at, 0.6);
      else if (k === 's' || k === 'S' || k === 'ArrowDown' || k === '-' || k === '_')
        zoomAt(at, 1 / 0.6);
      else if (k === 'a' || k === 'A' || k === 'ArrowLeft') pan(e.shiftKey ? -0.9 : -0.2);
      else if (k === 'd' || k === 'D' || k === 'ArrowRight') pan(e.shiftKey ? 0.9 : 0.2);
      else if (k === 'f' || k === 'F' || k === '0') fit();
      else if (k === 't' || k === 'T' || k === 'Home') home();
      else if (k === 'n') stepFrame(1);
      else if (k === 'N') stepFrame(-1);
      else if (k === ']') stepEdge(1);
      else if (k === '[') stepEdge(-1);
      else if (k === 'm' || k === 'M') {
        if (st.cap) placeMarker(at);
      } else if (k === 'Escape') {
        clearMarkers();
        set({ sel: null });
        setKeys(false);
      } else if (k === '?') setKeys((v) => !v);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reading]);

  return (
    <div className={s.root} data-reading={reading || undefined}>
      <header className={s.top}>
        <div className={s.brand}>
          <Mark />
          <div>
            <b>{me.name}</b>
            <span>{`${profile.name} · 8 ch · loop ${duration(cycle())}`}</span>
          </div>
        </div>
        {!reading && <CaptureControls />}
        <nav className={s.topNav} aria-label="Views">
          {reading ? (
            <a className={s.btn} href="#">
              Back to the analyzer
            </a>
          ) : (
            <a className={s.btn} href="#read">
              Read as a page
            </a>
          )}
          <SchemeToggle />
          {!reading && (
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => setKeys(true)}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
                <rect x={1.5} y={4} width={13} height={8.5} rx={1.5} />
                <path d="M4 7h1M7 7h2M11 7h1M4.5 9.8h7" />
              </svg>
            </button>
          )}
        </nav>
      </header>

      {reading ? (
        <main className={s.reading}>
          <Report />
        </main>
      ) : (
        <>
          <main className={s.main}>
            <h1 className={s.sr}>
              {profile.name}, {db.current.title} at {db.current.company}: a logic analyzer capture
              of a device that tells the story over its buses
            </h1>
            <div className={s.center}>
              <Toolbar />
              <Waveform label={LABEL} />
            </div>
            <Panel />
          </main>
          <StatusBar />
        </>
      )}
      {keys && !reading && <Keys onClose={() => setKeys(false)} />}
    </div>
  );
}
