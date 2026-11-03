'use client';

// Level 1 (plant overview), Level 2 (unit displays) and the EPC skid. Schematics are inline SVG in
// the high-performance style; every piece of equipment is a focusable target that opens its
// faceplate, and off-page connectors step to the neighbouring unit.
import Image from 'next/image';
import { useId } from 'react';
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  liveLinks,
  otherProjects,
  profile,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { forTag, forUnit, markOf, useHmi, type Mark } from './context';
import {
  EPC,
  duration,
  exportLines,
  LINES,
  linesFrom,
  linesInto,
  unitById,
  unitName,
  unitTag,
  UNITS,
  type LineDef,
  type UnitDef,
  type UnitId,
} from './plant';
import { LOOPS, TRIP, type LineView, type LoopId } from './sim';
import {
  alarmText,
  AlarmGlyph,
  AlarmMark,
  Analog,
  Bubble,
  Connector,
  Hit,
  MiniTrend,
  Pipe,
  Pump,
  Valve,
  Vessel,
} from './Symbols';
import { num } from './ui';
import s from './scada.module.scss';

const { asOf, devices } = db;

export function Panel({
  title,
  meta,
  children,
  className,
  id,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`${s.panel} ${className ?? ''}`} aria-labelledby={id}>
      <header className={s.panelHead}>
        <h2 id={id}>{title}</h2>
        {meta && <span className={s.panelMeta}>{meta}</span>}
      </header>
      <div className={s.panelBody}>{children}</div>
    </section>
  );
}

export function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <span className={s.links}>
      {items.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label} ↗
        </a>
      ))}
    </span>
  );
}

const pumpWord = (p: LineView['pump']) =>
  p === 'RUN' ? 'RUNNING' : p === 'START' ? 'STARTING' : 'STOPPED';
export const valveWord = (pos: number) =>
  pos >= 99.5 ? 'OPEN' : pos <= 0.5 ? 'CLOSED' : `TRAVEL ${pos.toFixed(0)} %`;

function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker
        id={id}
        viewBox="0 0 8 8"
        refX={7}
        refY={4}
        markerWidth={7}
        markerHeight={7}
        orient="auto-start-reverse"
      >
        <path d="M0,0L8,4L0,8z" className={s.arrowHead} />
      </marker>
    </defs>
  );
}

/* ================================================================== Level 1: plant overview */

const MAIN: UnitId[] = [
  'roots',
  'freelance',
  'niknam',
  'alget',
  'zeroone',
  'neuroject',
  'products',
  'oss',
];
const VW = 56;
const VY = 98;
const VH = 110;
const IN_Y = 122;
const OUT_Y = 190;
const POS: Record<UnitId, { x: number; y: number; w: number; h: number }> = {
  ...(Object.fromEntries(
    MAIN.map((id, i) => [id, { x: 250 + i * 160, y: VY, w: VW, h: VH }]),
  ) as Record<UnitId, { x: number; y: number; w: number; h: number }>),
  neuroship: { x: 1150, y: 290, w: 48, h: 54 },
};

/** Where each transfer line runs on the overview, and where its pump, valve and reading sit. */
function overviewLine(l: LineDef) {
  const a = POS[l.from];
  if (l.to === 'outlet')
    return {
      d: `M${a.x + VW / 2},${OUT_Y}H1462`,
      end: '',
      pump: [a.x + 44, OUT_Y],
      valve: [a.x + 70, OUT_Y],
      text: [a.x + 57, OUT_Y + 20],
    };
  const b = POS[l.to];
  if (l.to === 'neuroship') {
    const x = b.x - b.w / 2;
    return {
      d: `M${a.x + 22},${a.y + a.h}V316H${x}`,
      end: `M${x - 10},316H${x}`,
      pump: [x - 40, 316],
      valve: [x - 16, 316],
      text: [x - 28, 336],
    };
  }
  if (l.from === 'neuroship') {
    const y = b.y + b.h;
    return {
      d: `M${a.x + a.w / 2},316H${b.x + 24}V${y}`,
      end: `M${b.x + 24},${y + 10}V${y}`,
      pump: [a.x + 38, 316],
      valve: [a.x + 60, 316],
      text: [a.x + 50, 336],
    };
  }
  const x = b.x - VW / 2;
  return {
    d: `M${a.x + VW / 2},${OUT_Y}H${x - 18}V${IN_Y}H${x}`,
    end: `M${x - 10},${IN_Y}H${x}`,
    pump: [a.x + 48, OUT_Y],
    valve: [a.x + 76, OUT_Y],
    text: [a.x + 98, OUT_Y + 20],
  };
}

function PlantSchematic() {
  const { snap, nav, open } = useHmi();
  const arrow = useId().replace(/:/g, '');
  const P = snap.loops['PIC-010'];
  const F = snap.loops['FIC-020'];
  const loopText = (id: LoopId) => {
    const l = snap.loops[id];
    return `${l.cfg.id} ${num(l.pv, l.cfg.hi - l.cfg.lo)} ${l.cfg.eu}, SP ${num(l.sp, l.cfg.hi - l.cfg.lo)}, ${l.mode}`;
  };
  const pm = markOf(snap.alarms, forTag('PIC-010'));
  const fm = markOf(snap.alarms, forTag('FIC-020'));
  return (
    <svg
      viewBox="0 0 1550 375"
      className={s.schematic}
      role="group"
      aria-label="Plant overview schematic"
    >
      <ArrowDefs id={arrow} />
      {/* The utility header that every transfer pump draws on. */}
      <path d="M24,40H1450" className={s.header} />
      <text x={230} y={33} className={s.smallText}>
        HEADER
      </text>
      <rect x={14} y={22} width={182} height={310} rx={4} className={s.skid} />
      <Hit label={`${EPC} skid display`} onActivate={() => nav({ view: 'epc' })}>
        <text x={105} y={322} textAnchor="middle" className={s.tagText}>
          {EPC}
        </text>
      </Hit>
      <path d="M60,95V50" className={s.signal} />
      <path d="M60,237V268" className={s.signal} />
      <Hit
        label={`FV-010 header pressure valve, ${P.valve.toFixed(0)} % open`}
        onActivate={() => open('PIC-010')}
      >
        <Valve cx={60} cy={40} pos={P.valve} control />
      </Hit>
      <Pipe d="M24,290H206V176H222" flow={F.pv} nominal={F.cfg.sp} />
      <path d="M206,176H222" className={s.pipeEnd} markerEnd={`url(#${arrow})`} />
      <Hit
        label={`FV-020 feed valve, ${F.valve.toFixed(0)} % open`}
        onActivate={() => open('FIC-020')}
      >
        <Valve cx={60} cy={290} pos={F.valve} control />
      </Hit>
      {(['PIC-010', 'FIC-020'] as LoopId[]).map((id, i) => {
        const l = id === 'PIC-010' ? P : F;
        const y = i ? 220 : 112;
        const m = i ? fm : pm;
        return (
          <Hit key={id} label={loopText(id)} onActivate={() => open(id)}>
            <Bubble cx={60} cy={y} fn={id.split('-')[0]} loop={id.split('-')[1]} shared />
            <text x={86} y={y - 4} className={`${s.valText} ${m ? s.inAlarm : ''}`}>
              {`${num(l.pv, l.cfg.hi - l.cfg.lo)} ${l.cfg.eu}`}
            </text>
            <text x={86} y={y + 12} className={s.smallText}>
              {`SP ${num(l.sp, l.cfg.hi - l.cfg.lo)} · `}
              <tspan className={l.mode === 'MAN' ? s.modeMan : undefined}>{l.mode}</tspan>
            </text>
            {m && <AlarmGlyph x={80} y={y - 20} prio={m.prio} blink={m.blink} />}
          </Hit>
        );
      })}
      {snap.trip && (
        <text x={105} y={170} textAnchor="middle" className={s.tripText}>
          I-010 TRIP
        </text>
      )}

      {LINES.map((l) => {
        const v = snap.lines[l.loop];
        const g = overviewLine(l);
        const m = markOf(snap.alarms, forTag(`FI-${l.loop}`));
        return (
          <g key={l.loop}>
            <Pipe d={g.d} flow={v.flow} nominal={l.nominal} />
            {g.end && <path d={g.end} className={s.pipeEnd} markerEnd={`url(#${arrow})`} />}
            <Hit label={`P-${l.loop} ${pumpWord(v.pump)}`} onActivate={() => open(`P-${l.loop}`)}>
              <Pump cx={g.pump[0]} cy={g.pump[1]} r={8} state={v.pump} />
            </Hit>
            <Hit
              label={`XV-${l.loop} ${valveWord(v.valve)}`}
              onActivate={() => open(`XV-${l.loop}`)}
            >
              <Valve cx={g.valve[0]} cy={g.valve[1]} sz={7} pos={v.valve} />
            </Hit>
            <Hit
              label={`FI-${l.loop} ${num(v.flow, 30)} m³/h`}
              onActivate={() => open(`FI-${l.loop}`)}
            >
              <text
                x={g.text[0]}
                y={g.text[1]}
                textAnchor="middle"
                className={`${s.flowText} ${m ? s.inAlarm : ''}`}
              >
                {num(v.flow, 30)}
              </text>
            </Hit>
            {m && <AlarmGlyph x={g.text[0] + 22} y={g.text[1] - 4} prio={m.prio} blink={m.blink} />}
          </g>
        );
      })}

      {UNITS.map((u) => {
        const p = POS[u.id];
        const m = markOf(snap.alarms, forUnit(u.tag));
        const top = u.id === 'neuroship' ? p.y - 24 : 70;
        return (
          <g key={u.id}>
            <Hit
              label={`${u.tag} ${u.name}: ${u.level.what}, ${u.level.pv} ${u.level.eu}. Open the unit display.`}
              onActivate={() => nav({ view: 'unit', unit: u.id })}
            >
              <text x={p.x} y={top} textAnchor="middle" className={s.tagText}>
                {u.tag}
              </text>
              <text x={p.x} y={top + 15} textAnchor="middle" className={s.nameText}>
                {u.name}
              </text>
              <Vessel
                x={p.x - p.w / 2}
                y={p.y}
                w={p.w}
                h={p.h}
                level={u.level.pv / u.level.hi}
                open={u.open}
              />
              <text x={p.x} y={p.y + p.h + 18} textAnchor="middle" className={s.valText}>
                {`${u.level.pv} ${u.level.eu}`}
              </text>
            </Hit>
            {m && <AlarmGlyph x={p.x + 34} y={top - 4} prio={m.prio} blink={m.blink} />}
          </g>
        );
      })}

      <Hit label="Outlet: contact the engineer" onActivate={() => open('ENG')}>
        <Connector x={1462} y={OUT_Y} w={78} label="OUTLET" sub="contact" />
      </Hit>
    </svg>
  );
}

function UnitRow({ u }: { u: UnitDef }) {
  const { snap, nav, open } = useHmi();
  const m = markOf(snap.alarms, forUnit(u.tag));
  const outs = linesFrom(u.id);
  return (
    <tr>
      <th scope="row">
        <button
          type="button"
          className={s.rowBtn}
          onClick={() => nav({ view: 'unit', unit: u.id })}
        >
          <span className={s.mono}>{u.tag}</span>
          <b>{u.name}</b>
        </button>
      </th>
      <td className={s.cellStage}>
        {u.stage}
        <span className={s.dim}>{u.span}</span>
      </td>
      <td className={s.cellLevel}>
        <Analog
          value={u.level.pv}
          lo={0}
          hi={u.level.hi}
          label={`${u.level.tag} ${u.level.what}`}
          compact
        />
        <span className={s.value}>
          {u.level.pv}
          <small>{u.level.eu}</small>
        </span>
      </td>
      <td className={s.cellFlow}>
        {outs.map((l) => {
          const v = snap.lines[l.loop];
          return (
            <button
              key={l.loop}
              type="button"
              className={s.flowChip}
              onClick={() => open(`FI-${l.loop}`)}
              aria-label={`FI-${l.loop} to ${unitName(l.to)}: ${num(v.flow, 30)} m³/h, pump ${pumpWord(v.pump)}`}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <Pump cx={10} cy={10} r={7} state={v.pump} />
              </svg>
              <span className={s.value}>{num(v.flow, 30)}</span>
              <span className={s.dim}>→ {unitTag(l.to)}</span>
            </button>
          );
        })}
      </td>
      <td className={s.cellAlarm}>
        {m ? (
          <AlarmMark
            prio={m.prio}
            blink={m.blink}
            label={`Priority ${m.prio} alarm${m.rtn ? ', returned to normal' : ''}`}
          />
        ) : (
          <span className={s.dim}>—</span>
        )}
      </td>
    </tr>
  );
}

function LoopTile({ id }: { id: LoopId }) {
  const { snap, plant, open } = useHmi();
  const l = snap.loops[id];
  const c = l.cfg;
  const span = c.hi - c.lo;
  const m = markOf(snap.alarms, forTag(id));
  return (
    <button
      type="button"
      className={s.loopTile}
      onClick={() => open(id)}
      aria-label={`${id} ${c.desc}: PV ${num(l.pv, span)}, SP ${num(l.sp, span)} ${c.eu}, OUT ${l.out.toFixed(1)} %, ${l.mode}. Open faceplate.`}
    >
      <span className={s.loopHead}>
        <b className={s.mono}>{id}</b>
        <span>{c.desc}</span>
        <span className={`${s.mode} ${l.mode === 'MAN' ? s.modeManChip : ''}`}>{l.mode}</span>
        {m && <AlarmMark prio={m.prio} blink={m.blink} />}
      </span>
      <span className={s.loopVals}>
        <span>
          <small>PV</small>
          <b className={alarmText(m)}>{num(l.pv, span)}</b>
          <small>{c.eu}</small>
        </span>
        <span>
          <small>SP</small>
          <b className={s.value}>{num(l.sp, span)}</b>
        </span>
        <span>
          <small>OUT</small>
          <b className={s.value}>{l.out.toFixed(1)}</b>
          <small>%</small>
        </span>
      </span>
      <Analog
        value={l.pv}
        lo={c.lo}
        hi={c.hi}
        sp={l.sp}
        normal={[c.limits.L?.v ?? c.lo, c.limits.H?.v ?? c.hi]}
        limits={{ hh: c.limits.HH?.v, h: c.limits.H?.v, l: c.limits.L?.v }}
        alarm={m}
        label={`${id} PV`}
      />
      <MiniTrend
        plant={plant}
        tag={id}
        lo={c.lo}
        hi={c.hi}
        normal={[l.sp - (c.limits.DEV?.v ?? 0), l.sp + (c.limits.DEV?.v ?? 0)]}
        seconds={120}
        stamp={snap.version}
        label={`${id}: the last two minutes of SP, PV and OUT`}
      />
    </button>
  );
}

export function Overview() {
  const { nav, open } = useHmi();
  return (
    <div className={s.overview}>
      <section className={s.ident} aria-labelledby="plant-name">
        <div className={s.identText}>
          <p className={s.kicker}>PLANT</p>
          <h1 id="plant-name">{profile.name}</h1>
          <p className={s.identRole}>
            {`${profile.role}, `}
            <a href={profile.companyUrl} target="_blank" rel="noreferrer">
              {profile.company}
            </a>
            {` · ${profile.headline}`}
          </p>
          <p className={s.identLede}>{profile.lede}</p>
        </div>
        <dl className={s.kpis} aria-label="Plant KPIs">
          {stats.map((k) => (
            <div key={k.label}>
              <dt>{k.label}</dt>
              <dd>{k.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className={s.schematicWrap}>
        <PlantSchematic />
      </div>

      <div className={s.overGrid}>
        <Panel
          title="Units"
          meta={`${UNITS.length} units · ${LINES.length} transfer lines`}
          className={s.unitsPanel}
          id="units-title"
        >
          <div className={s.tableScroll}>
            <table className={s.unitTable}>
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Level</th>
                  <th scope="col">Transfer out, m³/h</th>
                  <th scope="col">Alm</th>
                </tr>
              </thead>
              <tbody>
                {UNITS.map((u) => (
                  <UnitRow key={u.id} u={u} />
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.note}>
            Levels are real: months in each role, the product register and the PRs, read from the
            facts as of {fmt.iso(asOf)}. Flows, pressures and alarms are a seeded simulation.
          </p>
        </Panel>

        <div className={s.sideCol}>
          <Panel title={`${EPC} loops`} meta="SIM" id="loops-title">
            <div className={s.loopTiles}>
              <LoopTile id="PIC-010" />
              <LoopTile id="FIC-020" />
            </div>
          </Panel>
          <Panel title="Plant description" id="about-title">
            <div className={s.prose}>
              {about.map((p) => (
                <p key={p.slice(0, 20)}>{p}</p>
              ))}
            </div>
            <ul className={s.chips} aria-label="Skills">
              {skills.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Engineer on call" id="call-title">
            <div className={s.onCall}>
              <Image
                src={db.person.photo}
                width={96}
                height={96}
                alt={profile.name}
                className={s.photo}
              />
              <div>
                <b>{profile.name}</b>
                <a href={`mailto:${profile.email}`}>{profile.email}</a>
                <span className={s.links}>
                  <a href={profile.linkedin} target="_blank" rel="noreferrer">
                    LinkedIn ↗
                  </a>
                  <a href={profile.github} target="_blank" rel="noreferrer">
                    GitHub ↗
                  </a>
                  <a href={profile.cv} target="_blank" rel="noreferrer">
                    CV ↗
                  </a>
                </span>
              </div>
            </div>
            <button type="button" className={s.btn} onClick={() => open('ENG')}>
              Call-out faceplate
            </button>
          </Panel>
          <Panel
            title="Field devices"
            meta={
              <button type="button" className={s.linkBtn} onClick={() => nav({ view: 'system' })}>
                System ›
              </button>
            }
            id="field-title"
          >
            <ul className={s.fieldList}>
              {(Object.keys(devices) as (keyof typeof devices)[]).map((k) => {
                const d = devices[k];
                return (
                  <li key={k}>
                    <button type="button" className={s.rowBtn} onClick={() => open(d.tag)}>
                      <span className={s.mono}>{d.tag}</span>
                      <b>{d.name}</b>
                      <span className={s.dim}>{db.deviceFigures(k).join(' · ')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== Level 2: unit displays */

const OUT_ROW = (k: number) => 318 + k * 56;

function UnitSchematic({ u }: { u: UnitDef }) {
  const { snap, nav, open } = useHmi();
  const arrow = useId().replace(/:/g, '');
  const ins = linesInto(u.id);
  const outs = linesFrom(u.id);
  const H = OUT_ROW(outs.length - 1) + 40;
  const V = { x: 330, y: 64, w: 130, h: 210 };
  const lv = u.level.pv / u.level.hi;
  const F = snap.loops['FIC-020'];
  const inlets: {
    key: string;
    label: string;
    sub: string;
    flow: number;
    nominal: number;
    tag: string;
    go: () => void;
  }[] =
    u.id === 'roots'
      ? [
          {
            key: 'feed',
            label: `FROM ${EPC}`,
            sub: 'feed',
            flow: F.pv,
            nominal: F.cfg.sp,
            tag: 'FIC-020',
            go: () => nav({ view: 'epc' }),
          },
        ]
      : ins.map((l) => ({
          key: l.loop,
          label: `FROM ${unitTag(l.from)}`,
          sub: unitName(l.from),
          flow: snap.lines[l.loop].flow,
          nominal: l.nominal,
          tag: `FI-${l.loop}`,
          go: () => nav({ view: 'unit', unit: l.from }),
        }));
  return (
    <svg
      viewBox={`0 0 900 ${H}`}
      className={s.unitSvg}
      role="group"
      aria-label={`${u.tag} schematic`}
    >
      <ArrowDefs id={arrow} />
      {inlets.map((x, k) => {
        const y = 92 + k * 60;
        return (
          <g key={x.key}>
            <Pipe d={`M140,${y}H${V.x}`} flow={x.flow} nominal={x.nominal} />
            <path
              d={`M${V.x - 12},${y}H${V.x}`}
              className={s.pipeEnd}
              markerEnd={`url(#${arrow})`}
            />
            <Hit label={`${x.label}, ${x.sub}`} onActivate={x.go}>
              <Connector x={10} y={y} w={130} label={x.label} sub={x.sub} />
            </Hit>
            <Hit label={`${x.tag}: ${num(x.flow, 30)} m³/h`} onActivate={() => open(x.tag)}>
              <text x={236} y={y - 9} textAnchor="middle" className={s.flowText}>
                {`${x.tag}  ${num(x.flow, 30)}`}
              </text>
            </Hit>
          </g>
        );
      })}

      <Hit
        label={`${u.level.tag}: ${u.level.what}, ${u.level.pv} ${u.level.eu}`}
        onActivate={() => open(`TK-${u.no}`)}
      >
        <Vessel x={V.x} y={V.y} w={V.w} h={V.h} level={lv} open={u.open} />
        <text x={V.x + V.w / 2} y={V.y + V.h - 12} textAnchor="middle" className={s.vesselTag}>
          {`TK-${u.no}`}
        </text>
      </Hit>
      {u.id !== 'oss' &&
        [0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={V.x + V.w}
              x2={V.x + V.w + (f % 0.5 ? 5 : 9)}
              y1={V.y + V.h - 4 - (V.h - 8) * f}
              y2={V.y + V.h - 4 - (V.h - 8) * f}
              className={s.scaleTick}
            />
            {f % 0.5 === 0 && (
              <text
                x={V.x + V.w + 13}
                y={V.y + V.h - 4 - (V.h - 8) * f + 4}
                className={s.smallText}
              >
                {Math.round(u.level.hi * f)}
              </text>
            )}
          </g>
        ))}
      <path d={`M${V.x + V.w / 2},${V.y - 24}V${V.y}`} className={s.signal} />
      <Hit
        label={`${u.level.tag} ${u.level.pv} ${u.level.eu}`}
        onActivate={() => open(`TK-${u.no}`)}
      >
        <Bubble cx={V.x + V.w / 2} cy={V.y - 40} fn="LI" loop={String(u.no)} r={16} />
        <text x={V.x + V.w / 2 + 26} y={V.y - 44} className={s.valTextLg}>
          {`${u.level.pv} ${u.level.eu}`}
        </text>
        <text x={V.x + V.w / 2 + 26} y={V.y - 29} className={s.smallText}>
          {u.level.what.toUpperCase()}
        </text>
      </Hit>

      {u.id === 'oss' &&
        exportLines.map((e, k) => {
          const y = V.y + 24 + k * 38;
          return (
            <g key={e.tag}>
              <Pipe d={`M${V.x + V.w},${y}H612`} flow={1} nominal={1} />
              <path d={`M520,${y - 7}v14M526,${y - 7}v14`} className={s.orifice} />
              <Hit
                label={`${e.tag} ${e.repo}: ${e.weekly} weekly downloads. Open details.`}
                onActivate={() => open(e.tag)}
              >
                <Bubble cx={570} cy={y} fn="FI" loop={e.tag.split('-')[1]} r={13} />
                <path d={`M612,${y - 9}h14l9,9l-9,9h-14z`} className={s.connBody} />
                <text x={644} y={y - 2} className={s.nameTextL}>
                  {e.repo}
                </text>
                <text x={644} y={y + 12} className={s.smallText}>
                  <tspan className={s.valTspan}>{e.weekly}</tspan>
                  {`/wk · ★ ${e.stars} · ${e.kind}`}
                </text>
              </Hit>
            </g>
          );
        })}

      {outs.map((l, k) => {
        const v = snap.lines[l.loop];
        const y = OUT_ROW(k);
        const x0 = V.x + V.w - 20 - k * 30;
        const m = markOf(snap.alarms, forTag(`FI-${l.loop}`));
        const to = l.to;
        return (
          <g key={l.loop}>
            <Pipe d={`M${x0},${V.y + V.h}V${y}H760`} flow={v.flow} nominal={l.nominal} />
            <path d={`M${625},${y - 14}V${y}`} className={s.signal} />
            <Hit
              label={`P-${l.loop} transfer pump, ${pumpWord(v.pump)}`}
              onActivate={() => open(`P-${l.loop}`)}
            >
              <Pump cx={480} cy={y} r={15} state={v.pump} />
              <text
                x={480}
                y={y + 32}
                textAnchor="middle"
                className={s.tagText}
              >{`P-${l.loop}`}</text>
            </Hit>
            <Hit
              label={`XV-${l.loop} isolation valve, ${valveWord(v.valve)}`}
              onActivate={() => open(`XV-${l.loop}`)}
            >
              <Valve cx={548} cy={y} sz={11} pos={v.valve} />
              <text
                x={548}
                y={y + 32}
                textAnchor="middle"
                className={s.tagText}
              >{`XV-${l.loop}`}</text>
            </Hit>
            <Hit
              label={`FI-${l.loop} transfer flow ${num(v.flow, 30)} m³/h`}
              onActivate={() => open(`FI-${l.loop}`)}
            >
              <Bubble cx={625} cy={y - 30} fn="FI" loop={l.loop} r={15} />
              <text x={648} y={y - 34} className={`${s.valTextLg} ${m ? s.inAlarm : ''}`}>
                {num(v.flow, 30)}
              </text>
              <text x={648} y={y - 20} className={s.smallText}>
                m³/h
              </text>
            </Hit>
            {m && <AlarmGlyph x={706} y={y - 38} prio={m.prio} blink={m.blink} />}
            <Hit
              label={
                to === 'outlet'
                  ? 'Outlet: contact the engineer'
                  : `To ${unitTag(to)} ${unitName(to)}`
              }
              onActivate={() => (to === 'outlet' ? open('ENG') : nav({ view: 'unit', unit: to }))}
            >
              <Connector
                x={760}
                y={y}
                w={130}
                label={to === 'outlet' ? 'OUTLET' : `TO ${unitTag(to)}`}
                sub={to === 'outlet' ? 'contact' : unitName(to)}
              />
            </Hit>
          </g>
        );
      })}
    </svg>
  );
}

function EquipmentList({ u }: { u: UnitDef }) {
  const { snap, open } = useHmi();
  const rows: {
    tag: string;
    desc: string;
    state: string;
    value: string;
    mark: Mark | null;
    sim: boolean;
  }[] = [
    {
      tag: `TK-${u.no}`,
      desc: u.level.what,
      state: u.open ? 'FILLING' : 'HOLDING',
      value: `${u.level.pv} ${u.level.eu}`,
      mark: null,
      sim: false,
    },
  ];
  for (const l of linesInto(u.id))
    rows.push({
      tag: `FI-${l.loop}`,
      desc: `Inflow from ${unitTag(l.from)} ${unitName(l.from)}`,
      state: pumpWord(snap.lines[l.loop].pump),
      value: `${num(snap.lines[l.loop].flow, 30)} m³/h`,
      mark: markOf(snap.alarms, forTag(`FI-${l.loop}`)),
      sim: true,
    });
  if (u.id === 'roots')
    rows.push({
      tag: 'FIC-020',
      desc: `Feed from ${EPC}`,
      state: snap.loops['FIC-020'].mode,
      value: `${num(snap.loops['FIC-020'].pv, 60)} m³/h`,
      mark: markOf(snap.alarms, forTag('FIC-020')),
      sim: true,
    });
  for (const l of linesFrom(u.id)) {
    const v = snap.lines[l.loop];
    rows.push({
      tag: `P-${l.loop}`,
      desc: `Transfer pump to ${unitTag(l.to)}`,
      state: pumpWord(v.pump),
      value: '',
      mark: null,
      sim: true,
    });
    rows.push({
      tag: `XV-${l.loop}`,
      desc: 'Discharge isolation valve',
      state: valveWord(v.valve),
      value: '',
      mark: null,
      sim: true,
    });
    rows.push({
      tag: `FI-${l.loop}`,
      desc: `Transfer flow to ${unitName(l.to)}`,
      state: '',
      value: `${num(v.flow, 30)} m³/h`,
      mark: markOf(snap.alarms, forTag(`FI-${l.loop}`)),
      sim: true,
    });
  }
  if (u.id === 'oss')
    for (const e of exportLines)
      rows.push({
        tag: e.tag,
        desc: e.repo,
        state: e.kind.toUpperCase(),
        value: `${e.weekly}/wk`,
        mark: null,
        sim: false,
      });
  return (
    <div className={s.tableScroll}>
      <table className={s.equipTable}>
        <caption className={s.srOnly}>{`${u.tag} equipment`}</caption>
        <thead>
          <tr>
            <th scope="col">Tag</th>
            <th scope="col">Description</th>
            <th scope="col">State</th>
            <th scope="col">Value</th>
            <th scope="col">Q</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tag + r.desc}>
              <th scope="row">
                <button type="button" className={s.tagBtn} onClick={() => open(r.tag)}>
                  {r.tag}
                </button>
              </th>
              <td>{r.desc}</td>
              <td className={s.mono}>{r.state}</td>
              <td className={s.valueCell}>
                {r.mark && (
                  <AlarmMark
                    prio={r.mark.prio}
                    blink={r.mark.blink}
                    label={`Priority ${r.mark.prio} alarm`}
                  />
                )}
                <span className={alarmText(r.mark)}>{r.value}</span>
              </td>
              <td className={s.quality}>{r.sim ? 'SIM' : 'GOOD'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleData({ u }: { u: UnitDef }) {
  const r = u.role as db.Role;
  const made = archive.filter((b) => b.madeAt === r.org);
  return (
    <>
      <h3 className={s.dataTitle}>
        {r.url ? (
          <a href={r.url} target="_blank" rel="noreferrer">
            {r.org} ↗
          </a>
        ) : (
          r.org
        )}
      </h3>
      {r.sector && (
        <p className={s.dim}>
          {r.sector.replace(/^an? /, '').replace(/^./, (c) => c.toUpperCase())}
        </p>
      )}
      <dl className={s.facts}>
        <div>
          <dt>Title</dt>
          <dd>
            {db.titlePath(r)}
            {r.contract ? ' (contract)' : ''}
          </dd>
        </div>
        <div>
          <dt>In service</dt>
          <dd>{fmt.monthSpan(r.from, r.to)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{`${duration(u.level.pv)}${r.to ? '' : ` to ${fmt.mon(asOf)}, and counting`}`}</dd>
        </div>
        {r.steps.length > 1 && (
          <div>
            <dt>Steps</dt>
            <dd>
              <ol className={s.steps}>
                {r.steps.map((st) => (
                  <li key={st.title}>
                    <span className={s.mono}>{fmt.iso(st.from)}</span> {st.title}
                  </li>
                ))}
              </ol>
            </dd>
          </div>
        )}
      </dl>
      <p className={s.summary}>{r.summary}</p>
      <h4 className={s.subhead}>Duties</h4>
      <ul className={s.duties}>
        {r.duties.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      {made.length > 0 && (
        <>
          <h4 className={s.subhead}>Batch records from this unit</h4>
          <BatchTable rows={made} />
        </>
      )}
    </>
  );
}

function BatchTable({ rows }: { rows: typeof archive }) {
  return (
    <div className={s.tableScroll}>
      <table className={s.dataTable}>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Batch</th>
            <th scope="col">Made at</th>
            <th scope="col">Tech</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.title}>
              <td className={s.mono}>{b.year}</td>
              <td>
                {b.title} <Links links={b.links} />
              </td>
              <td>{b.madeAt ?? ''}</td>
              <td className={s.dim}>{b.tech.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RootsData() {
  return (
    <>
      <h3 className={s.dataTitle}>Feed: education, robotics and research</h3>
      <ol className={s.rootList}>
        {roots.map((r) => (
          <li key={r.title}>
            <span className={s.mono}>{r.year}</span>
            <div>
              <b>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title} ↗
                  </a>
                ) : (
                  r.title
                )}
              </b>
              <p>{r.detail}</p>
            </div>
          </li>
        ))}
        <li>
          <span className={s.mono}>—</span>
          <div>
            <b>{db.robots.quadcopter.title}</b>
            <p>{db.robots.quadcopter.detail} Undated.</p>
          </div>
        </li>
      </ol>
    </>
  );
}

export function ProductsData() {
  return (
    <>
      <h3 className={s.dataTitle}>Product register</h3>
      <p
        className={s.dim}
      >{`${db.productsLive.long.replace(/^./, (c) => c.toUpperCase())} products live; ${db.storeApps.length} apps on both the App Store and Google Play.`}</p>
      <div className={s.products}>
        {featuredProjects.map((p) => (
          <article key={p.title} className={s.product}>
            <div className={s.productShot}>
              <Image
                src={p.image}
                width={1280}
                height={800}
                alt={`${p.title} screenshot`}
                sizes="(max-width: 700px) 100vw, 420px"
              />
            </div>
            <div>
              <h4>{p.title}</h4>
              <p>{p.description}</p>
              <p className={s.dim}>{p.tech.join(' · ')}</p>
              <Links links={p.links} />
            </div>
          </article>
        ))}
      </div>
      <h4 className={s.subhead}>Other products and fixes</h4>
      <ul className={s.otherList}>
        {otherProjects.map((p) => (
          <li key={p.title}>
            <b>{p.title}</b>
            <p>{p.description}</p>
            <p className={s.dim}>
              {p.tech.join(' · ')} <Links links={p.links} />
            </p>
          </li>
        ))}
      </ul>
      <h4 className={s.subhead}>Store listings</h4>
      <ul className={s.storeList}>
        {liveLinks.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          </li>
        ))}
      </ul>
      <h4 className={s.subhead}>Batch records</h4>
      <BatchTable rows={archive} />
    </>
  );
}

function OssData() {
  return (
    <>
      <h3 className={s.dataTitle}>Export lines: fixes shipped upstream</h3>
      <p
        className={s.dim}
      >{`Combined, the packages patched are downloaded ${db.downloads.weekly.long} times a week (${db.downloads.exact} summed).`}</p>
      <ul className={s.prList}>
        {exportLines.map((c) => (
          <li key={c.url}>
            <div className={s.prHead}>
              <span className={s.mono}>{c.tag}</span>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.repo} ↗
              </a>
              <span className={s.kind}>{c.kind}</span>
            </div>
            <p>{c.change}</p>
            <p className={s.dim}>{c.impact}</p>
            <p className={s.mono}>{`${c.year} · ★ ${c.stars} · ${c.weekly} downloads a week`}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

export function UnitDisplay({ id }: { id: UnitId }) {
  const { nav } = useHmi();
  const u = unitById(id) as UnitDef;
  const i = UNITS.indexOf(u);
  const prev = UNITS[(i - 1 + UNITS.length) % UNITS.length];
  const next = UNITS[(i + 1) % UNITS.length];
  return (
    <div className={s.unitView}>
      <header className={s.unitHead}>
        <div>
          <p className={s.kicker}>{`${u.tag} · ${u.stage.toUpperCase()} · ${u.span}`}</p>
          <h1>{u.name}</h1>
          {u.role && <p className={s.identRole}>{db.titlePath(u.role)}</p>}
        </div>
        <span className={`${s.status} ${u.open ? s.statusOpen : ''}`}>
          {u.open
            ? 'IN SERVICE · OPEN-ENDED'
            : u.role
              ? `COMPLETE · ${fmt.mon(u.role.to as db.YearMonth).toUpperCase()}`
              : 'IN SERVICE'}
        </span>
        <nav className={s.pager} aria-label="Neighbouring units">
          <button
            type="button"
            className={s.btn}
            onClick={() => nav({ view: 'unit', unit: prev.id })}
          >
            <kbd>[</kbd> {prev.tag}
          </button>
          <button
            type="button"
            className={s.btn}
            onClick={() => nav({ view: 'unit', unit: next.id })}
          >
            {next.tag} <kbd>]</kbd>
          </button>
        </nav>
      </header>
      <div className={s.unitGrid}>
        <div className={s.unitLeft}>
          <div className={s.schematicWrap}>
            <UnitSchematic u={u} />
          </div>
          <Panel title="Equipment" meta="tap a tag for its faceplate" id={`eq-${u.id}`}>
            <EquipmentList u={u} />
          </Panel>
        </div>
        <Panel
          title="Unit data"
          meta={`source: facts as of ${fmt.iso(asOf)}`}
          className={s.unitData}
          id={`data-${u.id}`}
        >
          {u.role ? (
            <RoleData u={u} />
          ) : u.id === 'roots' ? (
            <RootsData />
          ) : u.id === 'products' ? (
            <ProductsData />
          ) : (
            <OssData />
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ================================================================== EPC-01 skid */

export function EpcDisplay() {
  const { snap, open, plant } = useHmi();
  const arrow = useId().replace(/:/g, '');
  const P = snap.loops['PIC-010'];
  const F = snap.loops['FIC-020'];
  const epc = devices.epc;
  const tripM = markOf(snap.alarms, (a) => a.id === 'PIC-010.HH');
  return (
    <div className={s.unitView}>
      <header className={s.unitHead}>
        <div>
          <p className={s.kicker}>{`${epc.tag} · ${epc.kind.toUpperCase()}`}</p>
          <h1>{`${epc.name} skid`}</h1>
          <p className={s.identRole}>{epc.detail}</p>
        </div>
        <span className={`${s.status} ${snap.trip ? s.statusTrip : ''}`}>
          {snap.trip ? 'I-010 TRIPPED' : 'INTERLOCK HEALTHY'}
        </span>
      </header>
      <div className={s.unitGrid}>
        <div className={s.unitLeft}>
          <div className={s.schematicWrap}>
            <svg
              viewBox="0 0 900 360"
              className={s.unitSvg}
              role="group"
              aria-label={`${EPC} piping and instrumentation`}
            >
              <ArrowDefs id={arrow} />
              <rect x={150} y={20} width={600} height={320} rx={4} className={s.skid} />
              <text x={160} y={38} className={s.tagText}>
                {`${epc.tag} PACKAGE`}
              </text>
              {/* Header pressure loop. */}
              <Pipe d="M20,130H880" flow={1} nominal={1} />
              <path d="M868,130H880" className={s.pipeEnd} markerEnd={`url(#${arrow})`} />
              <text x={24} y={120} className={s.smallText}>
                SUPPLY
              </text>
              <text x={876} y={120} textAnchor="end" className={s.smallText}>
                HEADER → TRANSFER PUMPS
              </text>
              <Hit label={`FV-010 ${P.valve.toFixed(0)} % open`} onActivate={() => open('PIC-010')}>
                <Valve cx={300} cy={130} sz={13} pos={P.valve} control />
                <text x={300} y={160} textAnchor="middle" className={s.tagText}>
                  FV-010
                </text>
                <text
                  x={300}
                  y={174}
                  textAnchor="middle"
                  className={s.smallText}
                >{`${P.valve.toFixed(1)} %`}</text>
              </Hit>
              <path d="M520,130V96" className={s.pipeThin} />
              <Bubble cx={520} cy={78} fn="PT" loop="010" r={16} />
              <path d="M504,78H418M300,78V100" className={s.signal} />
              <path d="M300,78H382" className={s.signal} />
              <Hit
                label={`PIC-010 header pressure ${num(P.pv, 10)} bar, ${P.mode}`}
                onActivate={() => open('PIC-010')}
              >
                <Bubble cx={400} cy={78} fn="PIC" loop="010" shared r={18} />
                <text
                  x={400}
                  y={46}
                  textAnchor="middle"
                  className={`${s.valTextLg} ${markOf(snap.alarms, forTag('PIC-010')) ? s.inAlarm : ''}`}
                >{`${num(P.pv, 10)} bar`}</text>
              </Hit>
              <Hit
                label={`Interlock I-010, ${snap.trip ? 'tripped' : 'healthy'}`}
                onActivate={() => open('PIC-010')}
              >
                <path
                  d="M640,62l18,18l-18,18l-18,-18z"
                  className={`${s.interlock} ${snap.trip ? s.interlockTrip : ''}`}
                />
                <text x={640} y={84} textAnchor="middle" className={s.interlockText}>
                  I
                </text>
                <text
                  x={668}
                  y={84}
                  className={s.smallText}
                >{`${TRIP.tag} · ≥ ${TRIP.at} bar`}</text>
              </Hit>
              <path d="M622,80H560M640,98V112" className={s.signal} />
              {tripM && <AlarmGlyph x={660} y={58} prio={tripM.prio} blink={tripM.blink} />}

              {/* Feed flow loop. */}
              <Pipe d="M20,280H880" flow={F.pv} nominal={F.cfg.sp} />
              <path d="M868,280H880" className={s.pipeEnd} markerEnd={`url(#${arrow})`} />
              <text x={876} y={300} textAnchor="end" className={s.smallText}>
                FEED → U-100 ROOTS
              </text>
              <path d="M220,272v16M228,272v16" className={s.orifice} />
              <path d="M224,272V250" className={s.pipeThin} />
              <Bubble cx={224} cy={232} fn="FT" loop="020" r={16} />
              <path d="M240,232H382M420,232H560V252" className={s.signal} />
              <Hit
                label={`FIC-020 feed flow ${num(F.pv, 60)} m³/h, ${F.mode}`}
                onActivate={() => open('FIC-020')}
              >
                <Bubble cx={400} cy={232} fn="FIC" loop="020" shared r={18} />
                <text
                  x={400}
                  y={200}
                  textAnchor="middle"
                  className={`${s.valTextLg} ${markOf(snap.alarms, forTag('FIC-020')) ? s.inAlarm : ''}`}
                >{`${num(F.pv, 60)} m³/h`}</text>
              </Hit>
              <Hit label={`FV-020 ${F.valve.toFixed(0)} % open`} onActivate={() => open('FIC-020')}>
                <Valve cx={560} cy={280} sz={13} pos={F.valve} control />
                <text x={560} y={312} textAnchor="middle" className={s.tagText}>
                  FV-020
                </text>
                <text
                  x={560}
                  y={326}
                  textAnchor="middle"
                  className={s.smallText}
                >{`${F.valve.toFixed(1)} %`}</text>
              </Hit>
            </svg>
          </div>
          <div className={s.loopTiles}>
            <LoopTile id="PIC-010" />
            <LoopTile id="FIC-020" />
          </div>
        </div>
        <Panel
          title="Device data"
          meta="real device · loops simulated"
          className={s.unitData}
          id="epc-data"
        >
          <h3 className={s.dataTitle}>{epc.name}</h3>
          <p>{db.products.epc.description}</p>
          <p className={s.dim}>{db.products.epc.tech.join(' · ')}</p>
          <h4 className={s.subhead}>How this display works</h4>
          <ul className={s.duties}>
            <li>{`Both loops run a PID in the ISA dependent form on percent of span, with derivative on PV and anti-windup. They are modelled as first-order processes with dead time; the ${epc.name}'s own tuning is not published.`}</li>
            <li>
              Open a faceplate to switch AUTO and MAN, move the setpoint or the output, retune by
              hand, or run a relay autotune that measures the ultimate gain and period.
            </li>
            <li>{`Push PIC-010 past ${TRIP.at} bar and interlock ${TRIP.tag} trips: the valve closes, the loop drops to MAN, and the reset is refused until the header falls below ${TRIP.reset} bar.`}</li>
          </ul>
          <MiniTrend
            plant={plant}
            tag="PIC-010"
            lo={LOOPS[0].lo}
            hi={LOOPS[0].hi}
            seconds={300}
            stamp={snap.version}
            label="PIC-010, the last five minutes"
          />
        </Panel>
      </div>
    </div>
  );
}
