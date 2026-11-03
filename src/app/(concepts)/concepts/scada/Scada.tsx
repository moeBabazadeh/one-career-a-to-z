'use client';

// Concept S · SCADA: an operator station in the high-performance HMI style. The career is a
// process plant: units are its stages, tank levels are real figures, and the plant runs, with
// loops to tune, pumps and valves behind PLC interlocks, alarms to acknowledge and shelve, and a
// historian. Navigation follows the display hierarchy: plant overview, unit display, faceplate,
// diagnostics.
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKey,
} from 'react';
import { concept } from '../_shared/concepts';
import { db, featuredProjects, hardware, profile } from '../_shared/data';
import { AlarmSummary, Banner, bannerAlarm, Events } from './Alarms';
import { HmiContext, type Confirm, type Hmi } from './context';
import { EpcDisplay, Overview, UnitDisplay } from './Displays';
import { describe, Faceplate, knownTag } from './Faceplate';
import { exportLines, LINES, unitById, UNITS, EPC } from './plant';
import { Report } from './Report';
import { Plant, type Result } from './sim';
import { AlarmMark, Pump, Valve } from './Symbols';
import { System } from './System';
import { Trends } from './Trends';
import { clock, day, go, isTyping, parse, useHash, type Route, type View } from './ui';
import s from './scada.module.scss';

const me = concept('scada');
const { plc } = db.devices;

const NAV: { view: View; label: string; key: string }[] = [
  { view: 'overview', label: 'Overview', key: 'O' },
  { view: 'epc', label: 'EPC skid', key: '0' },
  { view: 'alarms', label: 'Alarms', key: 'A' },
  { view: 'trends', label: 'Trends', key: 'T' },
  { view: 'events', label: 'Events', key: 'E' },
  { view: 'system', label: 'System', key: 'D' },
  { view: 'report', label: 'Read as a page', key: 'R' },
];

const VIEW_NAME: Record<View, string> = {
  overview: 'Plant overview',
  unit: 'Unit',
  epc: `${EPC} skid`,
  alarms: 'Alarm summary',
  trends: 'Historian',
  events: 'Event journal',
  system: 'System',
  report: 'Plant report',
};

/* ------------------------------------------------------------------ dialogs */

/** A modal dialog in the top layer. Its contents sit in a dialog form, so any submit button closes it. */
function Modal({
  onClose,
  label,
  className,
  children,
}: {
  onClose: () => void;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    d?.querySelector<HTMLElement>('[data-focus]')?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <form method="dialog">{children}</form>
    </dialog>
  );
}

function ConfirmDialog({ c, onDone }: { c: Confirm; onDone: () => void }) {
  return (
    <Modal onClose={onDone} label={c.title} className={s.confirm}>
      <p className={s.kicker}>CONFIRM COMMAND</p>
      {/* The title takes focus, so a stray Enter does nothing; Tab reaches Cancel first. */}
      <h2 tabIndex={-1} data-focus>
        {c.title}
      </h2>
      <p>{c.body}</p>
      <div className={s.btnRow}>
        <button type="submit" value="cancel" className={s.btn}>
          Cancel
        </button>
        <button
          type="submit"
          value="ok"
          className={`${s.btn} ${s.execute}`}
          onClick={() => c.run()}
        >
          {c.verb}
        </button>
      </div>
    </Modal>
  );
}

const KEYS: [string, string][] = [
  ['O', 'Plant overview'],
  ['1 – 9', 'Unit displays U-100 to U-800'],
  ['0', `${EPC} skid (the control loops)`],
  ['[  ]', 'Previous and next unit'],
  ['A  T  E  D', 'Alarms, trends, events, diagnostics'],
  ['R', 'Read everything as a plain page'],
  ['/', 'Go to a tag'],
  ['K', 'Acknowledge the banner alarm'],
  ['H', 'Silence the horn'],
  ['Esc', 'Close the faceplate, then up one level'],
  ['↑ ↓  Shift', 'In a loop faceplate: nudge SP or OUT, ×10'],
];

function Help({ onDone }: { onDone: () => void }) {
  return (
    <Modal onClose={onDone} label="Keys and symbols" className={s.help}>
      <div className={s.helpHead}>
        <h2>Keys and symbols</h2>
        <button type="submit" className={s.close} aria-label="Close" autoFocus>
          ×
        </button>
      </div>
      <div className={s.helpGrid}>
        <dl className={s.keyList}>
          {KEYS.map(([k, v]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className={s.subhead}>Equipment</h3>
          <ul className={s.legendList}>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <Pump cx={12} cy={12} r={9} state="RUN" />
              </svg>
              Filled: running or open
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <Pump cx={12} cy={12} r={9} state="STOP" />
              </svg>
              Hollow: stopped or closed
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <Valve cx={12} cy={12} sz={8} pos={50} />
              </svg>
              Half: travelling or starting
            </li>
          </ul>
          <h3 className={s.subhead}>Alarm priorities</h3>
          <ul className={s.legendList}>
            {([1, 2, 3, 4] as const).map((p) => (
              <li key={p}>
                <AlarmMark prio={p} />
                {['Urgent: act now', 'High: act soon', 'Medium: act when able', 'Low: note'][p - 1]}
              </li>
            ))}
          </ul>
          <p className={s.hint}>
            Grey is normal. Colour appears only for alarms, so an abnormal state stands out.
            Flashing means unacknowledged. Values marked SIM are simulated; GOOD values are facts.
          </p>
        </div>
      </div>
    </Modal>
  );
}

interface TagHit {
  tag: string;
  desc: string;
  route: Route;
}

const TAG_INDEX: TagHit[] = [
  ...UNITS.map((u) => ({
    tag: u.tag,
    desc: `${u.name} · ${u.stage}`,
    route: { view: 'unit', unit: u.id } as Route,
  })),
  ...UNITS.map((u) => ({
    tag: `TK-${u.no}`,
    desc: u.level.what,
    route: { view: 'unit', unit: u.id, fp: `TK-${u.no}` } as Route,
  })),
  ...LINES.flatMap((l) =>
    ['P', 'XV', 'FI'].map((p) => ({
      tag: `${p}-${l.loop}`,
      desc: describe(`${p}-${l.loop}`),
      route: { view: 'unit', unit: l.from, fp: `${p}-${l.loop}` } as Route,
    })),
  ),
  ...(['PIC-010', 'FIC-020'] as const).map((t) => ({
    tag: t,
    desc: describe(t),
    route: { view: 'epc', fp: t } as Route,
  })),
  ...hardware.map((d) => ({
    tag: d.tag,
    desc: `${d.name} · ${d.kind}`,
    route: { view: 'system', fp: d.tag } as Route,
  })),
  ...exportLines.map((e) => ({
    tag: e.tag,
    desc: e.repo,
    route: { view: 'unit', unit: 'oss', fp: e.tag } as Route,
  })),
  ...featuredProjects.map((p) => ({
    tag: 'U-700',
    desc: p.title,
    route: { view: 'unit', unit: 'products' } as Route,
  })),
  { tag: 'ENG', desc: 'Engineer on call: contact', route: { view: 'overview', fp: 'ENG' } },
];

function TagSearch({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const hits = TAG_INDEX.filter((h) =>
    `${h.tag} ${h.desc}`.toLowerCase().includes(q.trim().toLowerCase()),
  ).slice(0, 8);
  const pick = (h: TagHit | undefined) => {
    if (!h) return;
    // Unmounting the dialog closes it; then the display changes underneath.
    onDone();
    go(h.route);
  };
  const keys = (e: ReactKey<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setI((i + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % Math.max(1, hits.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(hits[i]);
    }
  };
  return (
    <Modal onClose={onDone} label="Go to tag" className={s.search}>
      <label className={s.searchBox}>
        <span>GO TO TAG</span>
        <input
          autoFocus
          value={q}
          placeholder={`P-310, TK-600, ${db.products.attendum.title}…`}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={keys}
          aria-controls="tag-hits"
          aria-activedescendant={hits[i] ? `hit-${i}` : undefined}
        />
      </label>
      <ul id="tag-hits" role="listbox" className={s.hits}>
        {hits.map((h, k) => (
          <li
            key={h.tag + h.desc}
            id={`hit-${k}`}
            role="option"
            aria-selected={k === i}
            onClick={() => pick(h)}
            onMouseEnter={() => setI(k)}
          >
            <b className={s.mono}>{h.tag}</b>
            <span>{h.desc}</span>
          </li>
        ))}
        {!hits.length && <li className={s.dim}>No tag matches.</li>}
      </ul>
    </Modal>
  );
}

/* ------------------------------------------------------------------ the station */

function useHorn(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = () => {
      const t = ctx.currentTime;
      [0, 0.32].forEach((d, k) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = k ? 660 : 880;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.26);
        o.connect(g).connect(ctx.destination);
        o.start(t + d);
        o.stop(t + d + 0.28);
      });
    };
    beep();
    const id = window.setInterval(beep, 1400);
    return () => {
      window.clearInterval(id);
      void ctx.close();
    };
  }, [on]);
}

export default function Scada() {
  const [plant] = useState(() => new Plant());
  const snap = useSyncExternalStore(plant.subscribe, plant.getSnapshot, plant.getSnapshot);
  const route = parse(useHash());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [msg, setMsg] = useState<Result | null>(null);
  const [hornOn, setHornOn] = useState(false);
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLElement>(null);

  // On a phone the header tucks away as you scroll, leaving the alarm banner pinned: its sticky
  // offset is minus everything below the banner.
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const fit = () => {
      const banner = el.firstElementChild as HTMLElement | null;
      el.style.setProperty('--tuck', `${banner ? banner.offsetHeight - el.offsetHeight : 0}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Run the plant while the tab is visible; it catches up when you come back.
  useEffect(() => {
    let id = 0;
    const tick = () => plant.advance(Date.now());
    const start = () => {
      if (id) return;
      tick();
      id = window.setInterval(tick, 100);
    };
    const stop = () => {
      window.clearInterval(id);
      id = 0;
    };
    const vis = () => (document.hidden ? stop() : start());
    vis();
    document.addEventListener('visibilitychange', vis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [plant]);

  useHorn(hornOn && snap.horn);

  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(null), 7000);
    return () => window.clearTimeout(id);
  }, [msg]);

  // The keyboard reads the latest display and alarms without re-binding every tick.
  const live = useRef({ route, snap });
  useEffect(() => {
    live.current = { route, snap };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        isTyping(e.target) ||
        document.querySelector('dialog[open]')
      )
        return;
      const { route: r, snap: sn } = live.current;
      const k = e.key;
      const unitAt = (n: number) => UNITS[(n + UNITS.length) % UNITS.length];
      const here = r.unit ? UNITS.findIndex((u) => u.id === r.unit) : -1;
      let used = true;
      if (k === 'Escape') {
        if (r.fp) go({ view: r.view, unit: r.unit });
        else if (r.view !== 'overview') go({ view: 'overview' });
        else used = false;
      } else if (/^[1-9]$/.test(k) && UNITS[Number(k) - 1])
        go({ view: 'unit', unit: UNITS[Number(k) - 1].id });
      else if (k === '0') go({ view: 'epc' });
      else if (k === '[' || k === ']')
        go({
          view: 'unit',
          unit: unitAt(here < 0 ? (k === ']' ? 0 : -1) : here + (k === ']' ? 1 : -1)).id,
        });
      else if (k === 'o' || k === 'O') go({ view: 'overview' });
      else if (k === 'a' || k === 'A') go({ view: 'alarms' });
      else if (k === 't' || k === 'T') go({ view: 'trends' });
      else if (k === 'e' || k === 'E') go({ view: 'events' });
      else if (k === 'd' || k === 'D') go({ view: 'system' });
      else if (k === 'r' || k === 'R') go({ view: 'report' });
      else if (k === 'k' || k === 'K') {
        const top = bannerAlarm(sn.alarms);
        if (top && (top.state === 'UNACK' || top.state === 'RTNUN')) plant.ack([top.id]);
      } else if (k === 'h' || k === 'H') plant.silence();
      else if (k === '?') setHelp(true);
      else if (k === '/') setSearch(true);
      else used = false;
      if (used) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [plant]);

  const hmi: Hmi = {
    plant,
    snap,
    route,
    open: (tag) => go({ view: route.view, unit: route.unit, fp: tag }),
    nav: go,
    confirm: setConfirm,
    say: (r) => {
      if (r.msg) setMsg(r);
    },
  };

  const u = route.unit ? unitById(route.unit) : undefined;
  const crumbs: { label: string; to?: Route }[] = [
    {
      label: 'PLANT',
      to: route.view === 'overview' && !route.fp ? undefined : { view: 'overview' },
    },
  ];
  if (route.view === 'unit' && u)
    crumbs.push({
      label: `${u.tag} ${u.name}`,
      to: route.fp ? { view: 'unit', unit: u.id } : undefined,
    });
  else if (route.view !== 'overview')
    crumbs.push({ label: VIEW_NAME[route.view], to: route.fp ? { view: route.view } : undefined });
  if (route.fp && knownTag(route.fp)) crumbs.push({ label: route.fp });
  const unacked = snap.unacked[1] + snap.unacked[2] + snap.unacked[3] + snap.unacked[4];

  return (
    <HmiContext.Provider value={hmi}>
      <div className={s.root}>
        <button type="button" className={s.skip} onClick={() => mainRef.current?.focus()}>
          Skip to the display
        </button>
        <header ref={topRef} className={s.top}>
          <Banner hornOn={hornOn} onHorn={() => setHornOn(!hornOn)} />
          <nav className={s.nav} aria-label="Displays">
            <a className={s.identLink} href="#/overview">
              <b>{profile.name}</b>
              <span>{`${profile.role}, ${profile.company}`}</span>
            </a>
            <ul className={s.navBtns}>
              {NAV.map((n) => (
                <li key={n.view}>
                  <a
                    href={`#/${n.view}`}
                    aria-current={
                      route.view === n.view || (n.view === 'overview' && route.view === 'unit')
                        ? 'page'
                        : undefined
                    }
                    onClick={() => window.scrollTo({ top: 0 })}
                  >
                    {n.label}
                    {n.view === 'alarms' && unacked > 0 && (
                      <span className={s.navCount}>{unacked}</span>
                    )}
                    <kbd>{n.key}</kbd>
                  </a>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => setSearch(true)}>
                  Tag <kbd>/</kbd>
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setHelp(true)}>
                  Keys <kbd>?</kbd>
                </button>
              </li>
            </ul>
            <span className={s.clock}>
              <time>{clock(snap.now)}</time>
              <small>{day(snap.now)}</small>
            </span>
          </nav>
          <div className={s.crumbs}>
            <ol aria-label="Display hierarchy">
              {crumbs.map((c, k) => (
                <li key={c.label}>
                  {c.to ? (
                    <button type="button" onClick={() => go(c.to as Route)}>
                      {c.label}
                    </button>
                  ) : (
                    <span aria-current={k === crumbs.length - 1 ? 'location' : undefined}>
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <ul className={s.unitStrip} aria-label="Units">
              {UNITS.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    aria-current={route.unit === x.id ? 'page' : undefined}
                    onClick={() => go({ view: 'unit', unit: x.id })}
                    title={x.name}
                  >
                    {x.tag}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </header>

        <main
          ref={mainRef}
          tabIndex={-1}
          className={`${s.main} ${route.view === 'report' ? s.mainReport : ''}`}
        >
          {route.view === 'overview' && <Overview />}
          {route.view === 'unit' && route.unit && <UnitDisplay key={route.unit} id={route.unit} />}
          {route.view === 'epc' && <EpcDisplay />}
          {route.view === 'alarms' && <AlarmSummary />}
          {route.view === 'trends' && <Trends />}
          {route.view === 'events' && <Events />}
          {route.view === 'system' && <System />}
          {route.view === 'report' && <Report />}
        </main>

        <footer className={s.statusBar}>
          <span className={s.statusItem}>
            <i className={s.runLed} aria-hidden="true" />
            {`${plc.tag} ${plc.name} RUN · scan ${snap.scanMs.toFixed(1)} ms`}
          </span>
          <span
            className={s.statusItem}
          >{`HIST-01 OK · ${snap.trip ? 'I-010 TRIPPED' : 'interlocks healthy'}`}</span>
          <span className={`${s.statusMsg} ${msg && !msg.ok ? s.statusBad : ''}`} role="status">
            {msg?.msg ?? 'Operator: visitor · view and operate'}
          </span>
          <span className={s.statusItem}>{`Concept ${me.letter} · ${me.name}`}</span>
        </footer>

        {route.fp && knownTag(route.fp) && (
          <Faceplate
            key={route.fp}
            tag={route.fp}
            msg={msg}
            onClose={() => go({ view: route.view, unit: route.unit })}
          />
        )}
        {confirm && (
          <ConfirmDialog
            key={confirm.title + confirm.verb}
            c={confirm}
            onDone={() => setConfirm(null)}
          />
        )}
        {help && <Help onDone={() => setHelp(false)} />}
        {search && <TagSearch onDone={() => setSearch(false)} />}
      </div>
    </HmiContext.Provider>
  );
}
