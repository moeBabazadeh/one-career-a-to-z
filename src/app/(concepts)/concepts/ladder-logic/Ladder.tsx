'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { db, profile, stats } from '../_shared/data';
import { useAnimationFrame, useInView, useReducedMotion } from '../_shared/hooks';
import { Devices, Diagnostics, Hmi, Led, Library, OnlineAccess, TagTable } from './Panels';
import { Rung, inputProps } from './Rung';
import { WARP, createPlc, fmtClock, fmtSpan, type Plc, type Snapshot } from './plc';
import { INPUTS, NETWORKS, OUTPUTS, PLC_CHIP, ROLE_TIMERS, type Network } from './program';
import s from './ladder.module.scss';
import { concept } from '../_shared/concepts';

/* ------------------------------------------------------------------ small parts */

const { person } = db;
/** The Mini PLC this program runs on. */
const CPU = db.devices.plc;

function StackLight({ snap }: { snap: Snapshot }) {
  const { LampRed, LampAmber, LampGreen } = snap.outputs;
  const state = LampRed
    ? 'red: stopped'
    : LampAmber
      ? 'amber: catching up'
      : LampGreen
        ? 'green: up to date'
        : 'off';
  return (
    <svg viewBox="0 0 16 44" className={s.stack} role="img" aria-label={`Stack light ${state}`}>
      <rect
        x={2}
        y={1}
        width={12}
        height={11}
        rx={2}
        className={`${s.lamp} ${LampRed ? s.lampRed : ''}`}
      />
      <rect
        x={2}
        y={13}
        width={12}
        height={11}
        rx={2}
        className={`${s.lamp} ${LampAmber ? s.lampAmber : ''}`}
      />
      <rect
        x={2}
        y={25}
        width={12}
        height={11}
        rx={2}
        className={`${s.lamp} ${LampGreen ? s.lampGreen : ''}`}
      />
      <rect x={6} y={37} width={4} height={6} className={s.lampPole} />
    </svg>
  );
}

const SECTIONS = [
  { id: 'main', label: 'Main [OB1]', icon: 'block' },
  { id: 'tags', label: 'Default tag table', icon: 'table' },
  { id: 'hmi', label: 'Screens', icon: 'screen' },
  { id: 'devices', label: 'Device configuration', icon: 'rack' },
  { id: 'diagnostics', label: 'Online & diagnostics', icon: 'diag' },
  { id: 'library', label: 'Roots', icon: 'lib' },
  { id: 'online', label: 'Go online', icon: 'plug' },
] as const;

const ICONS: Record<string, string> = {
  folder: 'M1.5 3.5h4l1.5 1.5h7.5v8h-13z',
  cpu: 'M3 2.5h10v11H3z M5.5 5h5v3h-5z M5.5 10.5h1 M8 10.5h1',
  block: 'M3 2.5h10v11H3z M5 6h6 M5 8.5h6 M5 11h4',
  table: 'M2 3h12v10H2z M2 6h12 M2 9.5h12 M6 3v10',
  screen: 'M1.5 3h13v8.5h-13z M6 14h4 M8 11.5V14',
  rack: 'M1.5 4h13v8h-13z M4.5 4v8 M7.5 4v8 M10.5 4v8',
  diag: 'M2 12.5l3-4 3 2 3-5 3 3 M2 2.5v11h12',
  lib: 'M2.5 2.5h3v11h-3z M6.5 2.5h3v11h-3z M10.5 3l2.6-.6 2 10.6-2.6.6z',
  plug: 'M5 1.5v4 M11 1.5v4 M3.5 5.5h9v2.5a4.5 4.5 0 0 1-9 0z M8 12.5v2',
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 16 16" className={s.icon} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const NARROW = '(max-width: 899px)';
const subscribeNarrow = (onChange: () => void) => {
  const query = matchMedia(NARROW);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** Phone layout. Always false on the server, so the first paint matches. */
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

/* ------------------------------------------------------------------ project tree */

function Tree() {
  const [active, setActive] = useState('main');
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const item = (id: (typeof SECTIONS)[number]['id'], depth: number) => {
    const sec = SECTIONS.find((x) => x.id === id)!;
    return (
      <li style={{ '--depth': depth } as React.CSSProperties}>
        <a href={`#${id}`} aria-current={active === id ? 'location' : undefined}>
          <Icon name={sec.icon} />
          {sec.label}
        </a>
      </li>
    );
  };
  const folder = (label: string, icon: string, depth: number) => (
    <li style={{ '--depth': depth } as React.CSSProperties} className={s.folder}>
      <span>
        <span className={s.caretDown} aria-hidden="true">
          ▾
        </span>
        <Icon name={icon} />
        {label}
      </span>
    </li>
  );

  return (
    <nav className={s.tree} aria-label="Project tree">
      <p className={s.treeHead}>Project tree</p>
      <ul>
        {folder(person.site, 'folder', 0)}
        {folder(`PLC_1 [${CPU.tag} ${CPU.name}]`, 'cpu', 1)}
        {item('devices', 2)}
        {item('diagnostics', 2)}
        {folder('Program blocks', 'folder', 2)}
        {item('main', 3)}
        {folder('PLC tags', 'folder', 2)}
        {item('tags', 3)}
        {folder('HMI_1 [Platforms]', 'screen', 1)}
        {item('hmi', 2)}
        {folder('Global libraries', 'lib', 1)}
        {item('library', 2)}
        {item('online', 0)}
      </ul>
      <dl className={s.treeDetails}>
        <dt>Language</dt>
        <dd>LAD</dd>
        <dt>Target</dt>
        <dd>{`${CPU.tag} · ${PLC_CHIP}`}</dd>
        <dt>Scan</dt>
        <dd>top to bottom, left to right</dd>
      </dl>
    </nav>
  );
}

/* ------------------------------------------------------------------ toolbar */

function TopBar({ plc, snap, paused }: { plc: Plc; snap: Snapshot; paused: boolean }) {
  const forced = Object.keys(snap.forces).length;
  return (
    <header className={s.bar}>
      <div className={s.titlebar}>
        <a href="#main" className={s.app}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 2v16 M17 2v16 M3 6h4 M13 6h4 M7 3.5v5 M9.5 3.5v5 M3 14h5.5 M11.5 14h5.5" />
            <path d="M8.5 11.5a3 3 0 0 0 0 5 M11.5 11.5a3 3 0 0 1 0 5" />
          </svg>
          {`${CPU.tag} Studio`}
        </a>
        <span
          className={s.crumbs}
        >{`${person.site} › PLC_1 [${CPU.tag}] › Program blocks › Main [OB1]`}</span>
        <span className={s.onlinePill}>
          <i aria-hidden="true" />
          {snap.mode === 'RUN' ? 'Online' : 'Online · CPU in STOP'}
        </span>
      </div>
      <div className={s.toolbar}>
        <a href="#main" className={s.appMini} aria-label={`${CPU.tag} Studio, back to top`}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 2v16 M17 2v16 M3 6h4 M13 6h4 M7 3.5v5 M9.5 3.5v5 M3 14h5.5 M11.5 14h5.5" />
          </svg>
        </a>
        <div className={s.mode} role="group" aria-label="CPU operating mode">
          {(['RUN', 'STOP'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={snap.mode === m}
              onClick={() => plc.setMode(m)}
              className={m === 'RUN' ? s.modeRun : s.modeStop}
            >
              {m === 'RUN' ? '▶' : '■'} {m}
            </button>
          ))}
        </div>
        <div className={s.clock}>
          <span className={s.k}>CPU clock</span>
          <output className={s.v} aria-live="off">
            {fmtClock(snap.rtc)}
          </output>
          <span className={`${s.warp} ${snap.warping ? s.warpOn : ''}`}>
            {snap.warping ? `×${WARP} d/s` : paused ? 'paused' : 'real time'}
          </span>
        </div>
        <div className={s.cycle}>
          <span className={s.k}>Cycle</span>
          <output className={s.v}>
            {snap.cycle ? `${(snap.cycle * 1000).toFixed(1)} µs` : '—'}
          </output>
          <span className={s.k2}>{snap.scans.toLocaleString('en-US')} scans</span>
        </div>
        <div className={s.leds} role="group" aria-label="CPU status LEDs">
          <span>
            <Led on tone={snap.mode === 'RUN' ? 'green' : 'amber'} />
            RUN/STOP
          </span>
          <span>
            <Led on={false} tone="red" />
            ERROR
          </span>
          <span>
            <Led on={forced > 0} tone="amber" />
            MAINT
          </span>
        </div>
        <StackLight snap={snap} />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

const PROPS = [
  ['Author', profile.fullName],
  ['Family', `${profile.role}, ${profile.company}`],
  ['Language', 'LAD'],
  ['Created', String(person.since)],
];

function Hero() {
  return (
    <section id="main" className={`${s.window} ${s.hero}`} aria-labelledby="name">
      <div className={s.winHead}>
        <span className={s.tab}>Main [OB1] · Properties</span>
        <span className={s.tabMeta}>Program cycle · optimized block access</span>
      </div>
      <div className={s.heroBody}>
        <div className={s.heroText}>
          <p className={s.field}>Block title</p>
          <h1 id="name">{profile.name}</h1>
          <p className={s.role}>
            {profile.role} at{' '}
            <a href={profile.companyUrl} target="_blank" rel="noreferrer">
              {profile.company}
            </a>
            <span>{` · building since ${person.since}`}</span>
          </p>
          <p className={s.field}>Comment</p>
          <p className={s.lede}>
            <span aria-hidden="true">{'// '}</span>
            {profile.tagline} {profile.lede}
          </p>
          <div className={s.ctas}>
            <a className={s.primary} href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV ↗
            </a>
          </div>
        </div>
        <figure className={s.portrait}>
          <Image src={person.photo} width={600} height={600} alt={profile.name} priority />
          <figcaption>
            <dl>
              {PROPS.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </figcaption>
        </figure>
      </div>
      <dl className={s.stats}>
        {stats.map((m) => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd>{m.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ editor */

function NetworkView({
  nw,
  n,
  snap,
  plc,
  monitoring,
  comments,
  flow,
  narrow,
}: {
  nw: Network;
  n: number;
  snap: Snapshot;
  plc: Plc;
  monitoring: boolean;
  comments: boolean;
  flow: boolean;
  narrow: boolean;
}) {
  const [outer, seen] = useInView<HTMLLIElement>(true, 0.35);
  const [inner, visible] = useInView<HTMLDivElement>(false, 0);
  const [open, setOpen] = useState(false);
  const live = monitoring && seen && snap.mode === 'RUN';
  const timer = ROLE_TIMERS.find((t) => t.network === nw.id);
  const et = timer ? snap.timers[timer.inst].et : 0;
  const shown = comments || open;

  return (
    <li ref={outer} id={nw.id} className={s.network} aria-labelledby={`${nw.id}-t`}>
      <div className={s.nwHead}>
        <span className={s.nwNo}>Network {n}:</span>
        <h3 id={`${nw.id}-t`}>{nw.title}</h3>
        {nw.meta && <span className={s.nwMeta}>{nw.meta}</span>}
        {timer && live && et > 0 && (
          <span className={`${s.served} ${timer.open ? s.servedOpen : ''}`}>ET {fmtSpan(et)}</span>
        )}
      </div>
      <p className={s.nwComment}>{nw.comment}</p>
      {nw.note && <p className={s.nwNote}>{nw.note}</p>}
      {nw.details && (
        <>
          {shown && (
            <ul className={s.nwDetails} id={`${nw.id}-d`}>
              {nw.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {!comments && (
            <button
              type="button"
              className={s.more}
              aria-expanded={open}
              aria-controls={`${nw.id}-d`}
              onClick={() => setOpen(!open)}
            >
              {open
                ? '▾ Hide comment'
                : `▸ Comment, ${nw.details.length} ${nw.details.length === 1 ? 'line' : 'lines'}`}
            </button>
          )}
        </>
      )}
      <div ref={inner} className={s.rungWrap}>
        <Rung
          rung={nw.rung}
          snap={snap}
          live={live}
          flow={flow && visible}
          visible={visible}
          plc={plc}
          narrow={narrow}
          label={`Network ${n} rung: ${nw.title}`}
        />
      </div>
    </li>
  );
}

function Editor({ plc, snap, reduced }: { plc: Plc; snap: Snapshot; reduced: boolean }) {
  const [monitoring, setMonitoring] = useState(true);
  const [comments, setComments] = useState(false);
  const narrow = useNarrow();
  return (
    <section id="ob1" className={`${s.window} ${s.editor}`} aria-labelledby="ob1-t">
      <div className={`${s.winHead} ${monitoring ? s.winOnline : ''}`}>
        <h2 className={s.tab} id="ob1-t">
          PLC_1 › Program blocks › Main [OB1]
        </h2>
        <span className={s.tabMeta}>
          {monitoring
            ? snap.mode === 'RUN'
              ? 'Monitoring'
              : 'CPU in STOP: no program status'
            : 'Offline view'}
        </span>
      </div>
      <div className={s.edTools}>
        <button type="button" aria-pressed={monitoring} onClick={() => setMonitoring(!monitoring)}>
          <svg viewBox="0 0 20 12" aria-hidden="true">
            <circle cx={5} cy={7} r={3.5} />
            <circle cx={15} cy={7} r={3.5} />
            <path d="M8.5 6.5h3 M1.5 6l1-4 M18.5 6l-1-4" />
          </svg>
          Monitoring
        </button>
        <button type="button" aria-pressed={comments} onClick={() => setComments(!comments)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3h12v8H7l-3 3v-3H2z" />
          </svg>
          Network comments
        </button>
        <p className={s.hint}>
          <span className={s.legendOn} /> power flow <span className={s.legendOff} /> no flow ·
          Click any contact on an <b>%I</b> address to change it.
          <span className={s.swipe}> Long rungs scroll sideways.</span>
        </p>
      </div>
      <ol className={s.networks}>
        {NETWORKS.map((nw, i) => (
          <NetworkView
            key={nw.id}
            nw={nw}
            n={i + 1}
            snap={snap}
            plc={plc}
            monitoring={monitoring}
            comments={comments}
            flow={!reduced}
            narrow={narrow}
          />
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ PLCSIM panel */

const PUSH_STYLE: Record<string, string> = { Start: s.pbGreen, Stop: s.pbRed, Replay: s.pbBlue };
const MAX_SERVED = Math.max(...ROLE_TIMERS.filter((t) => !t.open).map((t) => t.pt));

function SimInputs({ plc, snap }: { plc: Plc; snap: Snapshot }) {
  const pushes = INPUTS.filter((t) => t.kind === 'push');
  const switches = INPUTS.filter((t) => t.kind === 'switch');
  return (
    <div className={`${s.simBlock} ${s.simInputs}`}>
      <h2 className={s.simHead}>
        <span>PLCSIM · Inputs</span>
        <span className={s.simAddr}>DI 8 · %IB0</span>
      </h2>
      <div className={s.pushes}>
        {pushes.map((t) => (
          <div key={t.name} className={s.push}>
            <button
              type="button"
              className={`${s.pb} ${PUSH_STYLE[t.name]}`}
              aria-label={`${t.name}, ${t.addr}, press and hold`}
              {...inputProps(plc, t.name)}
            >
              <span aria-hidden="true" />
            </button>
            <b>
              <Led on={!!snap.bits[t.name]} />
              {t.name}
            </b>
            <small>
              {t.addr} · {t.name === 'Stop' ? 'NC' : 'NO'}
            </small>
          </div>
        ))}
      </div>
      <ul className={s.switches}>
        {switches.map((t) => {
          const on = !!snap.bits[t.name];
          return (
            <li key={t.name}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                className={s.switch}
                title={t.comment}
                {...inputProps(plc, t.name)}
              >
                <span className={s.knob} aria-hidden="true" />
                <span className={s.swName}>{t.name}</span>
                <span className={s.swAddr}>{t.addr}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SimOutputs({ plc, snap }: { plc: Plc; snap: Snapshot }) {
  return (
    <div className={`${s.simBlock} ${s.simOutputs}`}>
      <h2 className={s.simHead}>
        <span>Outputs · force table</span>
        <span className={s.simAddr}>DQ 16 · %QB0</span>
      </h2>
      <ul className={s.outputs}>
        {OUTPUTS.filter((t) => t.kind === 'output').map((t) => {
          const on = snap.outputs[t.name];
          const forced = !!snap.forces[t.name];
          return (
            <li key={t.name}>
              <Led on={on} />
              <span className={s.outAddr}>{t.addr}</span>
              <a href={`#q-${t.name}`}>{t.name}</a>
              <button
                type="button"
                className={s.force}
                aria-pressed={forced}
                aria-label={`Force ${t.addr} ${t.name} to TRUE`}
                title="Force to TRUE"
                onClick={() => plc.force(t.name)}
              >
                F
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SimWatch({ snap }: { snap: Snapshot }) {
  return (
    <div className={`${s.simBlock} ${s.simWatch}`}>
      <h2 className={s.simHead}>
        <span>Watch table · Career</span>
        <span className={s.simAddr}>ET of each TONR</span>
      </h2>
      <table className={s.watch}>
        <tbody>
          {ROLE_TIMERS.map((t) => {
            const et = snap.timers[t.inst].et;
            return (
              <tr key={t.inst}>
                <th scope="row">
                  <a href={`#${t.network}`}>{t.role.org.split(' ')[0]}</a>
                </th>
                <td className={s.watchBar}>
                  <i
                    style={{ width: `${Math.min(100, (et / MAX_SERVED) * 100)}%` }}
                    className={t.open && et > 0 ? s.running : ''}
                  />
                </td>
                <td className={s.watchVal}>{et > 0 ? fmtSpan(et) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Ladder() {
  const [plc] = useState(createPlc);
  const snap = useSyncExternalStore(plc.subscribe, plc.get, plc.server);
  const reduced = useReducedMotion();
  const [zone, inView] = useInView<HTMLDivElement>(false, 0);
  const last = useRef(0);
  const watched = useRef(false);
  const running = inView && !reduced;

  useEffect(() => {
    plc.setInstant(reduced);
  }, [plc, reduced]);

  useEffect(() => {
    last.current = 0;
    if (running) watched.current = true;
    else if (watched.current) plc.settle();
  }, [plc, running]);

  useAnimationFrame((sec) => {
    const ms = last.current ? (sec - last.current) * 1000 : 0;
    last.current = sec;
    plc.tick(ms);
  }, running);

  return (
    <div className={s.root}>
      <TopBar plc={plc} snap={snap} paused={!running && !reduced} />
      <nav className={s.tabs} aria-label="Sections">
        {SECTIONS.map((x) => (
          <a key={x.id} href={`#${x.id}`}>
            <Icon name={x.icon} />
            {x.label}
          </a>
        ))}
      </nav>
      <div className={s.body}>
        <Tree />
        <main className={s.main}>
          <div ref={zone} className={s.zone}>
            <Hero />
            <aside className={s.sim} aria-label="PLCSIM: inputs, outputs and watch table">
              <SimInputs plc={plc} snap={snap} />
              <SimOutputs plc={plc} snap={snap} />
              <SimWatch snap={snap} />
            </aside>
            <Editor plc={plc} snap={snap} reduced={reduced} />
          </div>
          <TagTable snap={snap} />
          <Hmi snap={snap} />
          <Devices snap={snap} />
          <Diagnostics />
          <Library />
          <OnlineAccess />
          <footer className={s.status}>
            <span>
              <Led on={snap.mode === 'RUN'} />{' '}
              {snap.mode === 'RUN' ? 'Connected to PLC_1 · RUN' : 'Connected to PLC_1 · STOP'}
            </span>
            <span>{`${concept('ladder-logic').name} · concept ${concept('ladder-logic').letter}`}</span>
            <span>
              © {profile.fullName}
              {` · ${person.since} → ${db.asOf.y}`}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
