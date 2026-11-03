'use client';

// R · Radio. A software-defined receiver: a VFO you tune digit by digit, a spectrum and a
// waterfall across the band, a filter you drag, mode, gain, squelch and span, and a decoder
// that locks onto the radios Moe built and decodes each into a chapter of the site. Below it,
// the station log reads the whole thing as a page.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { concept } from '../_shared/concepts';
import { profile } from '../_shared/data';
import { useInView } from '../_shared/hooks';
import { RadioAudio } from './audio';
import Decoder, { type Entry, type Tab } from './Decoder';
import Display, { type DisplayApi } from './Display';
import Log from './Log';
import { frameCount, type ChapterId } from './programs';
import { F_MAX, F_MIN, Readout } from './Readout';
import {
  BW_MAX,
  BW_MIN,
  FFTS,
  SPANS,
  STEPS,
  evaluate,
  gainOf,
  initialRx,
  type Lock,
  type Rx,
} from './rx';
import {
  MODES,
  MODE_BW,
  MODE_NAME,
  emitterAt,
  frameTime,
  framesOf,
  stationAt,
  stationById,
  stations,
  type Mode,
} from './stations';
import { onTelemetry } from './telemetry';
import { hz, width } from './units';
import s from './radio.module.scss';

const me = concept('radio');
const BWS = [
  500, 1e3, 2.7e3, 5e3, 10e3, 12.5e3, 25e3, 50e3, 100e3, 200e3, 500e3, 1e6, 2e6, 5e6, 10e6, 20e6,
  25e6,
];
const placeOf = (step: number) => Math.floor(Math.log10(step) + 1e-9);
const clampF = (f: number) => Math.max(F_MIN, Math.min(F_MAX, f));

/** "2426M", "13.56 MHz", "902.4", "1.8g": a frequency typed by hand, in MHz unless it says otherwise. */
function parseFreq(text: string) {
  const m = text
    .trim()
    .toLowerCase()
    .replace(/,/g, '.')
    .match(/^(\d+(?:\.\d+)?)\s*(hz|k|khz|m|mhz|g|ghz)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  const u = m[2] ?? 'm';
  return v * (u.startsWith('g') ? 1e9 : u.startsWith('m') ? 1e6 : u.startsWith('k') ? 1e3 : 1);
}

/* ------------------------------------------------------------------ meters */

const ICONS = {
  audio: 'M3 9h4l5-4v14l-5-4H3zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  mute: 'M3 9h4l5-4v14l-5-4H3zM16 9.5l5 5M21 9.5l-5 5',
  keys: 'M3 6h18v12H3zM6.5 9.5h1M10 9.5h1M13.5 9.5h1M17 9.5h.5M6.5 13h1M17 13h.5M9.5 15h5',
  page: 'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 14.5h7M9 18h4',
};

const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className={s.icon}>
    <path d={ICONS[name]} />
  </svg>
);

function SMeter() {
  const bar = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLElement>(null);
  const dbm = useRef<HTMLElement>(null);
  const ovl = useRef<HTMLSpanElement>(null);
  const sql = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      onTelemetry((t) => {
        if (bar.current)
          bar.current.style.clipPath = `inset(0 ${((1 - t.s.frac) * 100).toFixed(1)}% 0 0)`;
        if (label.current) label.current.textContent = t.s.over ? `S9 +${t.s.over}` : `S${t.s.s}`;
        if (dbm.current) dbm.current.textContent = `${Math.round(t.dbm)} dBm`;
        if (ovl.current) ovl.current.dataset.on = t.overload ? '1' : '';
        if (sql.current) sql.current.dataset.on = t.squelched ? '1' : '';
      }),
    [],
  );
  return (
    <div className={s.smeter} aria-label="Signal strength in the passband">
      <div className={s.smeterTop}>
        <b ref={label}>S0</b>
        <i ref={dbm}>–</i>
        <span ref={sql} className={s.flagLamp}>
          SQL
        </span>
        <span ref={ovl} className={`${s.flagLamp} ${s.ovl}`}>
          OVL
        </span>
      </div>
      <div className={s.smeterBar}>
        <span ref={bar} />
      </div>
      <div className={s.smeterScale} aria-hidden="true">
        {['1', '3', '5', '7', '9', '+20', '+40', '+60'].map((k, i) => (
          <span
            key={k}
            style={{ left: `${(i < 5 ? (1 + 2 * i) / 15 : 0.6 + ((i - 4) * 20) / 150) * 100}%` }}
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBar({ rx }: { rx: Rx }) {
  const fps = useRef<HTMLElement>(null);
  useEffect(
    () =>
      onTelemetry((t) => {
        if (fps.current) fps.current.textContent = t.fps ? `${Math.round(t.fps)} fps` : 'still';
      }),
    [],
  );
  const gain = gainOf(rx);
  return (
    <footer className={s.status}>
      <span>
        LO <b>{hz(rx.center)}</b>
      </span>
      <span>
        Span <b>{width(rx.span)}</b>
      </span>
      <span>
        FFT <b>{rx.fft}</b> · RBW <b>{width(rx.span / rx.fft)}</b>
      </span>
      <span>
        Gain <b>{gain} dB</b>
        {rx.agc ? ' AGC' : ''}
      </span>
      <span>
        <b ref={fps}>–</b>
      </span>
      <span className={s.keysHint}>
        <kbd>←</kbd>
        <kbd>→</kbd> step · <kbd>↑</kbd>
        <kbd>↓</kbd> digit · <kbd>M</kbd> mode · <kbd>N</kbd> next station · <kbd>?</kbd> all keys
      </span>
    </footer>
  );
}

/* ------------------------------------------------------------------ keys */

const KEYS: [string, string][] = [
  ['← →', 'Tune down or up by the step'],
  ['↑ ↓', 'Tune by the selected readout digit'],
  ['M / Shift+M', 'Next or previous mode'],
  ['[ ]', 'Narrower or wider filter'],
  ['− +', 'Zoom out or in'],
  ['C', 'Centre the view on the VFO'],
  ['N / P', 'Next or previous station'],
  ['1–7', 'Jump to a station'],
  ['G', 'Tuner AGC on or off'],
  ['S', 'Squelch on or off'],
  ['A', 'Audio on or off'],
  ['F', 'Focus the frequency readout (then ← → pick a digit, type over it)'],
  ['Space', 'Start or stop the receiver'],
  ['?', 'This list'],
];

/* ------------------------------------------------------------------ root */

const emptyGot = () =>
  Object.fromEntries(stations.map((st) => [st.id, new Uint8Array(frameCount(st.id))])) as Record<
    ChapterId,
    Uint8Array
  >;
const emptyLog = () =>
  Object.fromEntries(stations.map((st) => [st.id, [] as Entry[]])) as Record<ChapterId, Entry[]>;

export default function Radio() {
  const [rx, setRx] = useState<Rx>(initialRx);
  const [lock, setLock] = useState<Lock>(() => evaluate(initialRx, false));
  const [viewing, setViewing] = useState<ChapterId>('about');
  const [got, setGot] = useState(emptyGot);
  const [log, setLog] = useState(emptyLog);
  const [tab, setTab] = useState<Tab>('payload');
  const [sel, setSel] = useState<number | null>(null);
  const [goto, setGoto] = useState('');
  const audio = useRef<RadioAudio | null>(null);
  const counter = useRef(0);
  const help = useRef<HTMLDialogElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const [section, rxVisible] = useInView<HTMLElement>(false, 0.55);

  const patch = useCallback(
    (p: Partial<Rx> | ((r: Rx) => Partial<Rx>)) =>
      setRx((r) => ({ ...r, ...(typeof p === 'function' ? p(r) : p) })),
    [],
  );

  /** Keeps the VFO on screen: tuning past an edge recentres the view. */
  const follow = (r: Rx, f: number) =>
    Math.abs(f - r.center) > r.span * 0.47 ? { center: f } : {};

  const tune = useCallback(
    (f: number, snap: boolean) =>
      patch((r) => {
        let g = clampF(f);
        if (snap && r.snap) {
          const e = emitterAt(g, r.span / 150);
          g = e ? e.f : Math.round(g / r.step) * r.step;
        }
        return { vfo: g, ...follow(r, g) };
      }),
    [patch],
  );

  const goStation = useCallback(
    (id: ChapterId, freq?: number) =>
      patch((r) => {
        const st = stationById[id];
        const f = freq ?? st.freq;
        const inView =
          Math.abs(f - r.center) < r.span * 0.45 &&
          r.span >= st.minBw * 1.5 &&
          r.span <= st.view.span * 4;
        return {
          vfo: f,
          mode: st.mode,
          bw: st.bw,
          step: st.step,
          place: placeOf(st.step),
          running: true,
          ...(inView ? {} : { center: st.view.center, span: st.view.span }),
        };
      }),
    [patch],
  );

  const setMode = useCallback(
    (m: Mode) =>
      patch((r) => {
        const hit = stationAt(r.vfo);
        const bw = m === r.mode ? r.bw : m === 'DIG' ? (hit ? hit.station.bw : r.bw) : MODE_BW[m];
        return { mode: m, bw: Math.min(bw, r.span) };
      }),
    [patch],
  );

  const zoomAt = useCallback(
    (dir: number, anchor: number) =>
      patch((r) => {
        const i = SPANS.findIndex((x) => x >= r.span - 1);
        const span =
          SPANS[Math.max(0, Math.min(SPANS.length - 1, (i < 0 ? SPANS.length - 1 : i) - dir))];
        if (span === r.span) return {};
        const a = Math.abs(anchor - r.center) < r.span / 2 ? anchor : r.center;
        return { span, center: a - (a - r.center) * (span / r.span) };
      }),
    [patch],
  );

  const setBw = useCallback(
    (bw: number) => patch((r) => ({ bw: Math.max(BW_MIN, Math.min(BW_MAX, r.span, bw)) })),
    [patch],
  );
  const pan = useCallback(
    (center: number) =>
      patch((r) => {
        const c = Math.max(r.span / 2, Math.min(F_MAX, center));
        const vfo = Math.max(c - r.span * 0.49, Math.min(c + r.span * 0.49, r.vfo));
        return { center: c, vfo };
      }),
    [patch],
  );

  const onLock = useCallback((l: Lock) => {
    setLock(l);
    if (l.station) setViewing(l.station);
  }, []);

  const onFrames = useCallback((id: ChapterId, f: number, abs: number[]) => {
    const st = stationById[id];
    const n = framesOf(id);
    const add: Entry[] = abs.map((a) => ({
      n: ++counter.current,
      t: frameTime(st, a),
      k: a % n,
      f,
    }));
    setGot((g) => {
      if (abs.every((a) => g[id][a % n])) return g;
      const next = new Uint8Array(g[id]);
      for (const a of abs) next[a % n] = 1;
      return { ...g, [id]: next };
    });
    setLog((l) => ({ ...l, [id]: [...l[id], ...add].slice(-400) }));
  }, []);

  const api = useMemo<DisplayApi>(
    () => ({ tune, pan, setBw, zoomAt, goStation, onLock, onFrames }),
    [tune, pan, setBw, zoomAt, goStation, onLock, onFrames],
  );

  const toggleAudio = useCallback(() => {
    const a = (audio.current ??= new RadioAudio());
    patch((r) => ({ audio: !r.audio }));
    void a.resume();
  }, [patch]);

  useEffect(() => () => audio.current?.close(), []);

  const bwStep = useCallback(
    (dir: number) =>
      patch((r) => ({
        bw: Math.min(
          r.span,
          dir > 0
            ? (BWS.find((b) => b > r.bw * 1.001) ?? BW_MAX)
            : ([...BWS].reverse().find((b) => b < r.bw * 0.999) ?? BW_MIN),
        ),
      })),
    [patch],
  );

  const nextStation = useCallback(
    (dir: number) => {
      const i = stations.findIndex((st) => st.id === (lock.station ?? viewing));
      const st = stations[(i + dir + stations.length) % stations.length];
      goStation(st.id);
    },
    [lock.station, viewing, goStation],
  );

  // The receiver's keyboard, while it fills the screen and focus isn't in a field or the log.
  const keys = useRef({ rx, rxVisible, nextStation, toggleAudio });
  useEffect(() => {
    keys.current = { rx, rxVisible, nextStation, toggleAudio };
  });
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || ev.altKey || ev.metaKey || ev.ctrlKey) return;
      const t = ev.target as HTMLElement;
      if (t.closest('input, select, textarea, dialog, [role="spinbutton"], #log')) return;
      const { rx: r, rxVisible: on, nextStation: next, toggleAudio: snd } = keys.current;
      if (!on) return;
      const k = ev.key;
      const isButton = !!t.closest('button, a, summary');
      let done = true;
      if (k === 'ArrowLeft') tune(r.vfo - r.step, false);
      else if (k === 'ArrowRight') tune(r.vfo + r.step, false);
      else if (k === 'ArrowUp') tune(r.vfo + 10 ** r.place, false);
      else if (k === 'ArrowDown') tune(r.vfo - 10 ** r.place, false);
      else if (k === 'm' || k === 'M')
        setMode(
          MODES[(MODES.indexOf(r.mode) + (ev.shiftKey ? MODES.length - 1 : 1)) % MODES.length],
        );
      else if (k === '[') bwStep(-1);
      else if (k === ']') bwStep(1);
      else if (k === '-' || k === '_') zoomAt(-1, r.vfo);
      else if (k === '=' || k === '+') zoomAt(1, r.vfo);
      else if (k === 'c' || k === 'C') patch({ center: r.vfo });
      else if (k === 'n' || k === 'N') next(1);
      else if (k === 'p' || k === 'P') next(-1);
      else if (/^[1-7]$/.test(k)) goStation(stations[Number(k) - 1].id);
      else if (k === 'g' || k === 'G') patch({ agc: !r.agc, gain: gainOf(r) });
      else if (k === 's' || k === 'S') patch({ sql: !r.sql });
      else if (k === 'a' || k === 'A') snd();
      else if (k === 'f' || k === 'F')
        readout.current?.querySelector<HTMLElement>('[role="spinbutton"]')?.focus();
      else if (k === '?') help.current?.showModal();
      else if (k === ' ' && !isButton) patch({ running: !r.running });
      else done = false;
      if (done) ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tune, setMode, bwStep, zoomAt, patch, goStation]);

  const gain = gainOf(rx);
  const decRx = useMemo(
    () => ({ ...initialRx, mode: rx.mode, span: rx.span, sqlLevel: rx.sqlLevel }),
    [rx.mode, rx.span, rx.sqlLevel],
  );
  const tunedId = lock.station;

  const submitGoto = (ev: React.FormEvent) => {
    ev.preventDefault();
    const f = parseFreq(goto);
    if (f === null) return;
    tune(f, false);
    setGoto('');
  };

  return (
    <div className={s.root}>
      <section ref={section} id="receiver" className={s.rx} aria-label="Receiver">
        <header className={s.bar}>
          <div className={s.brand}>
            <h1>{profile.name}</h1>
            <p>
              {profile.role} · {profile.company}
            </p>
          </div>
          <button
            type="button"
            className={s.run}
            aria-pressed={rx.running}
            onClick={() => patch({ running: !rx.running })}
            title="Start or stop the receiver (Space)"
          >
            <span aria-hidden="true">{rx.running ? '■' : '▶'}</span> {rx.running ? 'Stop' : 'Start'}
          </button>
          <div ref={readout} className={s.vfo}>
            <span className={s.vfoLabel}>VFO</span>
            <Readout
              value={rx.vfo}
              place={rx.place}
              onChange={(f) => tune(f, false)}
              onPlace={(p) => patch({ place: p })}
            />
            <span className={s.vfoMeta}>
              <b>{rx.mode}</b> {width(rx.bw)}
            </span>
          </div>
          <SMeter />
          <div className={s.tools}>
            <button
              type="button"
              className={s.tool}
              aria-pressed={rx.audio}
              onClick={toggleAudio}
              title="Audio (A)"
            >
              <Icon name={rx.audio ? 'audio' : 'mute'} />
              <span className={s.toolText}>{rx.audio ? 'Audio on' : 'Audio off'}</span>
            </button>
            <button
              type="button"
              className={s.tool}
              onClick={() => help.current?.showModal()}
              title="Keyboard shortcuts (?)"
            >
              <Icon name="keys" />
              <span className={s.toolText}>Keys</span>
            </button>
            <a className={s.tool} href="#log">
              <Icon name="page" />
              <span className={s.toolText}>Read as a page</span>
            </a>
          </div>
        </header>

        <div className={s.toolbar} role="toolbar" aria-label="Tuning">
          <div className={s.modes} role="group" aria-label="Demodulator mode">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={rx.mode === m}
                onClick={() => setMode(m)}
                title={MODE_NAME[m]}
              >
                {m}
              </button>
            ))}
          </div>
          <div className={s.stepper}>
            <span>Filter</span>
            <button type="button" onClick={() => bwStep(-1)} aria-label="Narrower filter ([)">
              −
            </button>
            <b>{width(rx.bw)}</b>
            <button type="button" onClick={() => bwStep(1)} aria-label="Wider filter (])">
              +
            </button>
          </div>
          <div className={s.stepper}>
            <span>Span</span>
            <button type="button" onClick={() => zoomAt(-1, rx.vfo)} aria-label="Zoom out (−)">
              −
            </button>
            <b>{width(rx.span)}</b>
            <button type="button" onClick={() => zoomAt(1, rx.vfo)} aria-label="Zoom in (+)">
              +
            </button>
          </div>
          <label className={s.field}>
            <span>Step</span>
            <select
              value={rx.step}
              onChange={(e) =>
                patch({ step: Number(e.target.value), place: placeOf(Number(e.target.value)) })
              }
            >
              {STEPS.map((x) => (
                <option key={x} value={x}>
                  {width(x)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={s.plain}
            onClick={() => patch({ center: rx.vfo })}
            title="Centre the view on the VFO (C)"
          >
            Centre
          </button>
        </div>

        <div className={s.screen}>
          <Display rx={rx} api={api} audio={audio} />
        </div>

        <aside className={s.side} aria-label="Stations and settings">
          <div className={s.stationsBox}>
            <h2 className={s.panelTitle}>Stations</h2>
            <ol className={s.stations}>
              {stations.map((st, i) => {
                const g = got[st.id];
                const have = g.reduce((n, x) => n + x, 0);
                const on = tunedId === st.id;
                const state =
                  on && lock.status === 'locked'
                    ? 'locked'
                    : have === g.length
                      ? 'done'
                      : have
                        ? 'part'
                        : 'none';
                return (
                  <li key={st.id}>
                    <button
                      type="button"
                      className={s.station}
                      data-state={state}
                      aria-current={on ? 'true' : undefined}
                      onClick={() => goStation(st.id)}
                    >
                      <span className={s.stKey}>{i + 1}</span>
                      <span className={s.stName}>{st.title}</span>
                      <span className={s.stFreq}>{hz(st.freq)}</span>
                      <span className={s.stWhere}>
                        {st.mode} · {st.device.name} · {st.where.split(' · ')[0]}
                      </span>
                      <span className={s.stBar} aria-hidden="true">
                        <i style={{ width: `${(have / g.length) * 100}%` }} />
                      </span>
                      <span className={s.srOnly}>
                        {state === 'done'
                          ? ', decoded'
                          : have
                            ? `, ${have} of ${g.length} frames`
                            : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className={s.settings}>
            <details className={s.group} open>
              <summary>Radio</summary>
              <form className={s.goto} onSubmit={submitGoto}>
                <label>
                  <span>Go to</span>
                  <input
                    value={goto}
                    onChange={(e) => setGoto(e.target.value)}
                    placeholder="2426M, 13.56, 1727.8 MHz"
                    inputMode="decimal"
                    aria-label="Go to frequency, in MHz unless you add a unit"
                  />
                </label>
                <button type="submit">Tune</button>
              </form>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={rx.snap}
                  onChange={(e) => patch({ snap: e.target.checked })}
                />
                <span>Snap clicks to the step and onto carriers</span>
              </label>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={rx.sql}
                  onChange={(e) => patch({ sql: e.target.checked })}
                />
                <span>Squelch</span>
              </label>
              <label className={s.range}>
                <span>
                  Squelch level <b>{rx.sqlLevel} dBFS</b>
                </span>
                <input
                  type="range"
                  min={-140}
                  max={-20}
                  step={1}
                  value={rx.sqlLevel}
                  disabled={!rx.sql}
                  onChange={(e) => patch({ sqlLevel: Number(e.target.value) })}
                />
              </label>
            </details>

            <details className={s.group} open>
              <summary>RF front end</summary>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={rx.agc}
                  onChange={(e) => patch({ agc: e.target.checked, gain })}
                />
                <span>Tuner AGC</span>
              </label>
              <label className={s.range}>
                <span>
                  Gain <b>{gain} dB</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={gain}
                  disabled={rx.agc}
                  onChange={(e) => patch({ gain: Number(e.target.value) })}
                />
              </label>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={rx.dc}
                  onChange={(e) => patch({ dc: e.target.checked })}
                />
                <span>DC removal (hides the LO spike)</span>
              </label>
              <p className={s.note}>
                AGC holds the strongest signal in the band near −18 dBFS. Off, too much gain clips
                the ADC; too little leaves weak stations under the noise.
              </p>
            </details>

            <details className={s.group} open>
              <summary>Display</summary>
              <label className={s.field}>
                <span>FFT size</span>
                <select value={rx.fft} onChange={(e) => patch({ fft: Number(e.target.value) })}>
                  {FFTS.map((x) => (
                    <option key={x} value={x}>
                      {x} · RBW {width(rx.span / x)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.range}>
                <span>
                  Averaging <b>{Math.round(rx.avg * 100)} %</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={0.95}
                  step={0.05}
                  value={rx.avg}
                  onChange={(e) => patch({ avg: Number(e.target.value) })}
                />
              </label>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={rx.peak}
                  onChange={(e) => patch({ peak: e.target.checked })}
                />
                <span>Peak hold</span>
              </label>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={rx.autoRange}
                  onChange={(e) => patch({ autoRange: e.target.checked })}
                />
                <span>Auto range</span>
              </label>
              <label className={s.range}>
                <span>
                  Reference <b>{rx.ref} dBFS</b>
                </span>
                <input
                  type="range"
                  min={-90}
                  max={0}
                  step={1}
                  value={rx.ref}
                  disabled={rx.autoRange}
                  onChange={(e) => patch({ ref: Number(e.target.value) })}
                />
              </label>
              <label className={s.range}>
                <span>
                  Range <b>{rx.range} dB</b>
                </span>
                <input
                  type="range"
                  min={40}
                  max={140}
                  step={5}
                  value={rx.range}
                  onChange={(e) => patch({ range: Number(e.target.value) })}
                />
              </label>
            </details>

            <details className={s.group} open>
              <summary>Audio</summary>
              <button
                type="button"
                className={s.plain}
                aria-pressed={rx.audio}
                onClick={toggleAudio}
              >
                {rx.audio ? 'Mute' : 'Turn audio on'}
              </button>
              <label className={s.range}>
                <span>
                  Volume <b>{Math.round(rx.volume * 100)} %</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={rx.volume}
                  onChange={(e) => patch({ volume: Number(e.target.value) })}
                />
              </label>
            </details>
          </div>
        </aside>

        <div className={s.decWrap}>
          <Decoder
            rx={decRx}
            lock={lock}
            viewing={viewing}
            got={got[viewing]}
            log={log[viewing]}
            tab={tab}
            onTab={setTab}
            sel={sel}
            onSel={setSel}
          />
        </div>

        <StatusBar rx={rx} />
      </section>

      <Log onTune={goStation} />

      <dialog ref={help} className={s.help} aria-labelledby="keys-title">
        <h2 id="keys-title">Keyboard</h2>
        <dl>
          {KEYS.map(([k, v]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p>
          On the display: click to tune, drag to pan, drag a filter edge to change the bandwidth,
          Ctrl+scroll or pinch to zoom. On the readout: scroll, drag or click a digit.
        </p>
        <form method="dialog">
          <button type="submit">Close</button>
        </form>
        <p className={s.credit}>{`Concept ${me.letter} · ${me.name}`}</p>
      </dialog>
    </div>
  );
}
