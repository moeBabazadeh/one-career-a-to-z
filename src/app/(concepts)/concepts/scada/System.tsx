'use client';

// Level 4: the system behind the screens. The control network, the controller that runs the
// plant's logic (the Mini PLC), its cause-and-effect matrix with live states, and the remote
// fleets: Logger stations on their GSM uplink and the Attendum readers and beacons, with their real figures.
import { useState } from 'react';
import { db, fmt, hardware } from '../_shared/data';
import { useHmi } from './context';
import { Panel } from './Displays';
import { LINES, unitTag, UPLINK } from './plant';
import { LOOPS, START_MIN, TRIP } from './sim';
import { Hit } from './Symbols';
import s from './scada.module.scss';

const { devices, asOf } = db;
const { logger, plc, epc, attendumReader: reader, attendumBeacon: beacon } = devices;

function Network() {
  const { open, nav } = useHmi();
  const node = (
    x: number,
    y: number,
    w: number,
    title: string,
    sub: string,
    onActivate?: () => void,
    label?: string,
  ) => {
    const body = (
      <g>
        <rect x={x - 4} y={y - 4} width={w + 8} height={58} rx={6} className={s.focusRing} />
        <rect x={x} y={y} width={w} height={50} rx={3} className={s.netNode} />
        <text x={x + 10} y={y + 21} className={s.tagText}>
          {title}
        </text>
        <text x={x + 10} y={y + 38} className={s.smallText}>
          {sub}
        </text>
      </g>
    );
    return onActivate ? (
      <Hit key={title} label={label ?? `${title}: ${sub}`} onActivate={onActivate}>
        {body}
      </Hit>
    ) : (
      <g key={title}>{body}</g>
    );
  };
  return (
    <svg
      viewBox="0 0 900 300"
      className={`${s.unitSvg} ${s.netSvg}`}
      role="group"
      aria-label="Control network"
    >
      <path
        d="M140,55H330M440,80V140M80,80V190M190,215H700M480,215V250H520"
        className={s.netLink}
      />
      <text x={235} y={48} textAnchor="middle" className={s.smallText}>
        ETHERNET
      </text>
      <text x={448} y={120} className={s.smallText}>
        FIELDBUS
      </text>
      <text x={500} y={268} textAnchor="middle" className={s.smallText}>
        {UPLINK}
      </text>
      <text x={330} y={207} textAnchor="middle" className={s.smallText}>
        REMOTE TELEMETRY
      </text>
      <text x={88} y={140} className={s.smallText}>
        LAN
      </text>
      {node(20, 30, 120, 'HMI-01', 'this station')}
      {node(330, 30, 220, `${plc.tag} ${plc.name}`, `${plc.chip} · runs interlocks`, () =>
        open(plc.tag),
      )}
      {node(370, 140, 140, `${epc.tag} ${epc.name}`, 'PIC-010 · FIC-020', () =>
        nav({ view: 'epc' }),
      )}
      {node(20, 190, 170, 'HIST-01', 'historian', () => nav({ view: 'trends' }))}
      {node(520, 225, 120, logger.tag, `${logger.stations.short} stations`, () => open(logger.tag))}
      {node(
        700,
        190,
        180,
        `${reader.tag} / ${beacon.tag}`,
        `${reader.fleet.online.short} readers online`,
        () => open(reader.tag),
      )}
    </svg>
  );
}

function CauseEffect() {
  const { snap } = useHmi();
  const [loop, setLoop] = useState('310');
  const l = snap.lines[loop];
  const P = snap.loops['PIC-010'];
  const pal = LOOPS[0].limits.L?.v ?? 0;
  const effects = [
    `Block P-${loop} start`,
    `Block XV-${loop} close`,
    `${TRIP.tag} trip: FV-010 shut, PIC-010 MAN`,
    `Suppress FAL-${loop}`,
  ];
  const causes: { text: string; on: boolean; hits: number[] }[] = [
    { text: `XV-${loop} not fully open`, on: l.valve < 99.5, hits: [0, 3] },
    { text: `Header below ${START_MIN.toFixed(1)} bar`, on: P.pv < START_MIN, hits: [0] },
    { text: `Header below ${pal.toFixed(1)} bar (PAL-010)`, on: P.pv < pal, hits: [3] },
    { text: `PIC-010 at or above ${TRIP.at.toFixed(1)} bar`, on: P.pv >= TRIP.at, hits: [2] },
    { text: `${TRIP.tag} latched`, on: snap.trip, hits: [0, 2, 3] },
    { text: `P-${loop} running or starting`, on: l.pump !== 'STOP', hits: [1] },
    { text: `P-${loop} stopped`, on: l.pump === 'STOP', hits: [3] },
  ];
  const live = effects.map((_, e) => causes.some((c) => c.on && c.hits.includes(e)));
  return (
    <>
      <label className={s.selectRow}>
        Line
        <select value={loop} onChange={(e) => setLoop(e.target.value)}>
          {LINES.map((x) => (
            <option
              key={x.loop}
              value={x.loop}
            >{`${x.loop}: ${unitTag(x.from)} → ${unitTag(x.to)}`}</option>
          ))}
        </select>
      </label>
      <div className={s.tableScroll}>
        <table className={s.ceTable}>
          <thead>
            <tr>
              <th scope="col">Cause</th>
              {effects.map((e, k) => (
                <th key={e} scope="col" className={live[k] ? s.ceLive : ''}>
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {causes.map((c) => (
              <tr key={c.text} className={c.on ? s.ceOn : ''}>
                <th scope="row">
                  <span aria-hidden="true">{c.on ? '● ' : '○ '}</span>
                  {c.text}
                  <span className={s.srOnly}>{c.on ? ' (true)' : ' (false)'}</span>
                </th>
                {effects.map((e, k) => (
                  <td key={e} className={c.hits.includes(k) ? (c.on ? s.ceHitOn : s.ceHit) : ''}>
                    {c.hits.includes(k) ? 'X' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function System() {
  const { snap, open } = useHmi();
  const n = logger.stations.n;
  return (
    <div className={s.unitView}>
      <header className={s.unitHead}>
        <div>
          <p className={s.kicker}>SYSTEM · LEVEL 4 DIAGNOSTICS</p>
          <h1>Control system</h1>
          <p className={s.identRole}>
            The hardware behind the plant: devices built and in production, with the figures on
            record as of {fmt.iso(asOf)}.
          </p>
        </div>
        <span className={s.status}>{`${plc.tag} RUN · SCAN ${snap.scanMs.toFixed(1)} ms`}</span>
      </header>
      <div className={s.schematicWrap}>
        <Network />
      </div>
      <div className={s.sysGrid}>
        <Panel title={`${plc.tag} cause and effect`} meta="live" id="ce-title">
          <p
            className={s.hint}
          >{`The ${plc.name} (${plc.chip}) evaluates this matrix every scan. A row lights when its cause is true; a column lights when any of its causes is.`}</p>
          <CauseEffect />
        </Panel>
        <Panel
          title={`${logger.tag} ${logger.name} fleet`}
          meta="poll cycle simulated"
          id="lg-title"
        >
          <p>{logger.detail}</p>
          <div
            className={s.polls}
            role="img"
            aria-label={`${logger.stations.long} stations, polled in turn over ${UPLINK}`}
            style={{ '--n': n } as React.CSSProperties}
          >
            {Array.from({ length: n }, (_, k) => (
              <span key={k} style={{ animationDelay: `${(k * 0.18).toFixed(2)}s` }} />
            ))}
            <span className={s.pollMore}>+</span>
          </div>
          <dl className={s.facts}>
            <div>
              <dt>Stations</dt>
              <dd>{logger.stations.long}</dd>
            </div>
            <div>
              <dt>Online</dt>
              <dd>{`${logger.online.long} years`}</dd>
            </div>
            <div>
              <dt>FQI records</dt>
              <dd>{logger.records.long}</dd>
            </div>
          </dl>
        </Panel>
      </div>
      <Panel title="Devices in production" meta={`${hardware.length} devices`} id="dev-title">
        <ul className={s.devices}>
          {hardware.map((d) => (
            <li key={d.tag}>
              <button type="button" className={s.device} onClick={() => open(d.tag)}>
                <span className={s.mono}>{d.tag}</span>
                <b>{d.name}</b>
                <span className={s.dim}>{d.kind}</span>
                <span>{d.detail}</span>
                <span className={s.figures}>
                  {d.figures.map((f) => (
                    <i key={f}>{f}</i>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p
          className={s.hint}
        >{`${reader.name}: figures from ${reader.fleet.scope}, ${reader.fleet.classrooms.long} classrooms. Counts that grow are lower bounds.`}</p>
      </Panel>
    </div>
  );
}
