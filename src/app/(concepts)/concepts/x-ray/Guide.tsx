'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  NOW,
  oss,
  otherProjects,
  profile,
  roles,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import type { ProjectLinks } from '@/content/projects';
import {
  BLOCK,
  BLOCKS,
  BONDED,
  CATS,
  EARLIER,
  GPU_PRODUCTS,
  MATS,
  PADS,
  PART,
  REV,
  type Block,
  type BlockId,
} from './geometry';
import s from './die.module.scss';

// Where Attendum's universities are: "the UK and US".
const ATTENDUM_COUNTRIES = `the ${fmt.list(db.products.attendum.countries)}`;

const { neurobuild, smartclaim, attendum, educationGuide, activeClass } = db.products;
const { neuroject, zeroone } = db.roles;
const { stations } = db.devices.logger;
const { fleet } = db.devices.attendumReader;

/* ------------------------------------------------------------------ helpers */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (y: number) => `${MONTHS[Math.min(11, Math.floor((y % 1) * 12))]} ${Math.floor(y)}`;
const span = (a: number, b: number) => {
  const m = Math.round((b - a) * 12);
  return (
    [Math.floor(m / 12) && `${Math.floor(m / 12)}y`, m % 12 && `${m % 12}m`]
      .filter(Boolean)
      .join(' ') || '<1m'
  );
};

/** One µm per screen pixel, as a physical scale: "1 px ≈ 125 nm". */
const perPixel = (z: number) => {
  const um = 1 / z;
  return um >= 1
    ? `1 px ≈ ${um < 10 ? um.toFixed(1) : Math.round(um)} µm`
    : `1 px ≈ ${Math.round(um * 1000)} nm`;
};

const projects = [...featuredProjects, ...otherProjects];
const project = (title: string) => projects.find((p) => p.title === title);
const job = (id: string) => {
  const r: db.Role = db.roles[id as db.RoleId];
  return jobs.find((j) => j.company === (r.short ?? r.org))!;
};
const role = (id: string) => roles.find((r) => r.id === id)!;
const device = (id: db.DeviceId) => hardware.find((d) => d.tag === db.devices[id].tag)!;
const fromArchive = (title: string) => archive.find((a) => a.title === title);

function Links({ links }: { links: ProjectLinks }) {
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

function Crosshair() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={s.crosshair}>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 0v5M8 11v5M0 8h5M11 8h5" />
    </svg>
  );
}

export interface GuideActions {
  /** Highlight a part on the die while the reader points at its entry. */
  hint: (part: string | null) => void;
  /** Fly to a part. */
  locate: (block: BlockId, part: string) => void;
  /** Fly to a magnification stop. */
  stop: (x: number, y: number, z: number) => void;
  go: (id: BlockId) => void;
}

/** A story entry tied to a structure on the die: pointing at it lights the structure up. */
function Item({
  part,
  block,
  active,
  act,
  children,
  title,
  meta,
}: {
  part: string;
  block: BlockId;
  active: boolean;
  act: GuideActions;
  children?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (active)
      ref.current?.scrollIntoView({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
  }, [active]);
  return (
    <li
      ref={ref}
      className={s.item}
      data-active={active || undefined}
      onMouseEnter={() => act.hint(part)}
      onMouseLeave={() => act.hint(null)}
    >
      <div className={s.itemHead}>
        <h3>{title}</h3>
        <button
          type="button"
          className={s.locate}
          onClick={() => act.locate(block, part)}
          onFocus={() => act.hint(part)}
          onBlur={() => act.hint(null)}
          aria-label="Show it on the die"
        >
          <Crosshair />
        </button>
      </div>
      {meta && <p className={s.itemMeta}>{meta}</p>}
      {children}
    </li>
  );
}

function Readout({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className={s.regs}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Figures({ items }: { items: string[] }) {
  return (
    <ul className={s.figures}>
      {items.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ stories */

/** The role on each core: the current ones on P0 and P1, the earlier ones on the efficiency cores. */
const CORES: Partial<Record<BlockId, string>> = {
  p0: 'neuroject',
  p1: 'neuroship',
  ...Object.fromEntries(EARLIER.map((r, i) => [`e${i}`, r.id])),
};

/** What a role built elsewhere on the die. */
const BUILT: Record<string, [BlockId, string, string][]> = {
  neuroject: [
    ['gpu', 'gpu-0', `GPU · SC0 ${neurobuild.title}`],
    ['npu', 'npu-0', `NPU0 · ${neurobuild.title} AI`],
  ],
  zeroone: [
    ['rf', 'rf-nfc', `RF · ${db.devices.attendumReader.name}`],
    ['slc', 'slc-attendum', `SLC · ${attendum.title} bank`],
    ['gpu', 'gpu-1', `GPU · ${attendum.title} app`],
    ['gpu', 'gpu-3', `GPU · ${activeClass.title}`],
    ['npu', 'npu-2', 'NPU · identity checks'],
    ['gpu', 'gpu-4', `GPU · ${educationGuide.title}`],
  ],
};

function CoreStory({ b, act }: { b: Block; act: GuideActions }) {
  const id = CORES[b.id]!;
  const j = job(id),
    r = role(id),
    built = BUILT[id];
  return (
    <>
      <p className={s.role}>
        {r.title}
        {j.url && (
          <>
            {' · '}
            <a href={j.url} target="_blank" rel="noreferrer">
              {new URL(j.url).host} ↗
            </a>
          </>
        )}
      </p>
      <Readout
        rows={[
          ['Clocked in', month(r.start)],
          [r.end ? 'Ran for' : 'Uptime', span(r.start, r.end ?? NOW)],
          ['State', r.end ? `power-gated since ${month(r.end)}` : 'running'],
        ]}
      />
      <p className={s.range}>{j.range}</p>
      <ul className={s.duties}>
        {j.duties.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      {b.id === 'p1' && (
        <p className={s.note}>
          P1 is P0 mirrored, which is how real dies place twin cores: one design, flipped, sharing
          the cluster.
        </p>
      )}
      {built && (
        <>
          <h3 className={s.sub}>Elsewhere on this die</h3>
          <div className={s.jumps}>
            {built.map(([blk, part, label]) => (
              <button
                key={part}
                type="button"
                onClick={() => act.locate(blk, part)}
                onMouseEnter={() => act.hint(part)}
                onMouseLeave={() => act.hint(null)}
              >
                <Crosshair />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const appTitle = `${attendum.title} app`,
  ltiTitle = `${attendum.title} Canvas LTI app`;
const GPU_TEXT: Record<string, { text: string; links: ProjectLinks; tech: string[] }> = {
  [appTitle]: {
    text: `The iOS and Android app for ${attendum.title}, the attendance platform live at universities in ${ATTENDUM_COUNTRIES}.`,
    links: fromArchive(appTitle)?.links ?? {},
    tech: fromArchive(appTitle)?.tech ?? [],
  },
  [ltiTitle]: {
    text: `A Canvas LTI app for ${attendum.title}, built alongside the mobile app and the staff dashboard.`,
    links: {},
    tech: fromArchive(ltiTitle)?.tech ?? [],
  },
};

const COUNTS_NOTE = `The chip is a metaphor: its size and stack are made up. The numbers in this guide are real, and so are some counts on the die: ${skills.length} L2 slices for ${skills.length} skills, ${GPU_PRODUCTS.length} shader cores for ${GPU_PRODUCTS.length} products, ${EARLIER.length} efficiency cores for ${EARLIER.length} earlier roles, ${MATS.logger} cache mats for the ${stations.short} ${db.devices.logger.name} stations and ${MATS.attendum} for the ${fleet.online.short} ${attendum.title} devices at ${fleet.scope}.`;

function Story({ b, part, act }: { b: Block; part: string | null; act: GuideActions }) {
  const on = (id: string) => part === id;
  if (b.id in CORES) return <CoreStory b={b} act={act} />;

  switch (b.id) {
    case 'die':
      return (
        <>
          <div className={s.hello}>
            <figure className={s.portrait}>
              <Image
                src={db.person.photo}
                width={600}
                height={600}
                alt={profile.name}
                sizes="104px"
                priority
              />
            </figure>
            <div>
              <p className={s.role}>
                {profile.role} at{' '}
                <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                  {profile.company} ↗
                </a>
              </p>
              <p className={s.tagline}>{profile.tagline}</p>
            </div>
          </div>
          <p className={s.lede}>{profile.lede}</p>
          {about.map((p) => (
            <p key={p.slice(0, 20)} className={s.prose}>
              {p}
            </p>
          ))}
          <h3 className={s.sub}>Electrical characteristics</h3>
          <table className={s.spec}>
            <tbody>
              {stats.map((st) => (
                <tr key={st.label}>
                  <th scope="row">{st.label}</th>
                  <td>{st.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className={s.sub}>Instruction set</h3>
          <ul className={s.isa}>
            {skills.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
          <div className={s.cta}>
            <a href={`mailto:${profile.email}`} className={s.primary}>
              {profile.email}
            </a>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV · PDF ↗
            </a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
          </div>
          <h3 className={s.sub}>Die spec</h3>
          <Readout
            rows={[
              ['Part', `${PART}, stepping ${REV}`],
              ['Die', '11.2 × 9.6 mm · 107.5 mm²'],
              ['Stack', 'FEOL + 6 metal layers + glass'],
              ['Pads', `${PADS.length}, ${BONDED.length} bonded`],
            ]}
          />
          <p className={s.note}>{COUNTS_NOTE}</p>
        </>
      );

    case 'l2':
      return (
        <>
          <p
            className={s.lede}
          >{`Every core reads from the same L2. These are the ${fmt.spell(skills.length)} slices of it: the stack I’ve carried from role to role.`}</p>
          <ol className={s.items}>
            {skills.map((k, i) => (
              <Item
                key={k}
                part={`l2-${i}`}
                block="l2"
                active={on(`l2-${i}`)}
                act={act}
                title={k}
                meta={`slice ${i}`}
              />
            ))}
          </ol>
        </>
      );

    case 'gpu':
      return (
        <>
          <p
            className={s.lede}
          >{`${fmt.Spell(GPU_PRODUCTS.length)} shader cores, one per product people see and tap: web platforms and apps on both stores.`}</p>
          <Figures
            items={[`${stats[1].value} ${stats[1].label}`, `${stats[4].value} ${stats[4].label}`]}
          />
          <ol className={s.items}>
            {GPU_PRODUCTS.map((title, i) => {
              const p = project(title),
                extra = GPU_TEXT[title];
              return (
                <Item
                  key={title}
                  part={`gpu-${i}`}
                  block="gpu"
                  active={on(`gpu-${i}`)}
                  act={act}
                  title={title}
                  meta={`SC${i} · ${(p?.tech ?? extra?.tech ?? []).join(' · ')}`}
                >
                  <p>{p?.description ?? extra?.text}</p>
                  <Links links={p?.links ?? extra?.links ?? {}} />
                </Item>
              );
            })}
          </ol>
        </>
      );

    case 'npu': {
      const sc = smartclaim;
      return (
        <>
          <p className={s.lede}>
            A neural accelerator: two MAC arrays and a vision unit, for the AI in the platforms. The
            glow sweeping the arrays is a systolic wavefront, the way data really moves through one.
          </p>
          <ol className={s.items}>
            <Item
              part="npu-0"
              block="npu"
              active={on('npu-0')}
              act={act}
              title={`${neurobuild.title} AI`}
              meta={`NPU0 · ${neuroject.org}`}
            >
              <p>{neuroject.duties[1]}</p>
              <Links links={{ external: neuroject.url }} />
            </Item>
            <Item
              part="npu-1"
              block="npu"
              active={on('npu-1')}
              act={act}
              title={sc.title}
              meta={`NPU1 · ${sc.tech.join(' · ')}`}
            >
              <p>{sc.description}</p>
              <Links links={sc.links} />
            </Item>
            <Item
              part="npu-2"
              block="npu"
              active={on('npu-2')}
              act={act}
              title={`${activeClass.title} identity checks`}
              meta={`Vision unit · ${zeroone.org}`}
            >
              <p>{zeroone.duties[0]}</p>
              <Links links={activeClass.links} />
            </Item>
          </ol>
        </>
      );
    }

    case 'slc': {
      const logger = device('logger'),
        reader = device('attendumReader');
      return (
        <>
          <p
            className={s.lede}
          >{`The system cache, sized for data at scale. Count the mats: ${MATS.logger} in bank 0 for the ${stations.short} ${logger.name} stations, ${MATS.attendum} in bank 1 for the ${fleet.online.short} ${attendum.title} devices online at ${fleet.scope}.`}</p>
          <ol className={s.items}>
            <Item
              part="slc-logger"
              block="slc"
              active={on('slc-logger')}
              act={act}
              title={`Bank 0 · ${logger.name}`}
              meta={`${MATS.logger} mats · ${logger.kind}s`}
            >
              <p>{db.products.logger.description}</p>
              <Figures items={logger.figures} />
            </Item>
            <Item
              part="slc-attendum"
              block="slc"
              active={on('slc-attendum')}
              act={act}
              title={`Bank 1 · ${attendum.title}`}
              meta={`${MATS.attendum} mats · at ${fleet.scope}`}
            >
              <p>{`At a single university, ${attendum.title} has ${fleet.online.long} devices online, covers ${fleet.classrooms.long} classrooms and ${fmt.grouped(fleet.classes.n)} classes, and has received ${fleet.records.long} records in the past ${fmt.spell(fleet.recordYears)} years.`}</p>
              <Figures items={reader.figures} />
            </Item>
          </ol>
        </>
      );
    }

    case 'rf': {
      const logger = device('logger'),
        reader = device('attendumReader'),
        beacon = device('attendumBeacon');
      return (
        <>
          <p className={s.lede}>
            Three inductors in thick top metal, one for each radio in the devices: GSM, NFC and BLE.
            Under each spiral sits a patterned ground shield; zoom in to see its slots.
          </p>
          <ol className={s.items}>
            <Item
              part="rf-gsm"
              block="rf"
              active={on('rf-gsm')}
              act={act}
              title={`L1 · GSM · ${logger.name}`}
              meta={logger.kind}
            >
              <p>{logger.detail}</p>
              <Figures items={logger.figures} />
            </Item>
            <Item
              part="rf-nfc"
              block="rf"
              active={on('rf-nfc')}
              act={act}
              title={`L3 · NFC + RFID · ${reader.name}`}
              meta={reader.kind}
            >
              <p>{reader.detail} I wrote its firmware.</p>
              <Figures items={reader.figures.map((f) => `${f} at ${fleet.scope}`)} />
            </Item>
            <Item
              part="rf-ble"
              block="rf"
              active={on('rf-ble')}
              act={act}
              title={`L2 · BLE · ${beacon.name}`}
              meta={beacon.kind}
            >
              <p>{beacon.detail} I wrote its firmware.</p>
              <Figures items={beacon.figures} />
            </Item>
          </ol>
        </>
      );
    }

    case 'aon': {
      const { epc, miniPlc: plc, matrixKeypad: keypad, pulseIot: pulse } = db.products;
      return (
        <>
          <p className={s.lede}>
            The always-on microcontroller, the part that never sleeps: embedded firmware, and the
            telemetry behind it.
          </p>
          <Figures
            items={[
              `${stats[2].value} ${stats[2].label}: ${hardware.map((d) => d.name).join(', ')}`,
            ]}
          />
          <ol className={s.items}>
            <Item
              part="aon-0"
              block="aon"
              active={on('aon-0')}
              act={act}
              title={epc.title}
              meta={`Boot ROM · ${epc.tech.join(' · ')}`}
            >
              <p>{epc.description}</p>
            </Item>
            <Item
              part="aon-3"
              block="aon"
              active={on('aon-3')}
              act={act}
              title={plc.title}
              meta={`Timers & PWM · ${plc.tech.join(' · ')}`}
            >
              <p>{plc.description}</p>
            </Item>
            <Item
              part="aon-4"
              block="aon"
              active={on('aon-4')}
              act={act}
              title={keypad.title}
              meta={`GPIO matrix · ${keypad.tech.join(' · ')}`}
            >
              <p>{keypad.description}</p>
              <Links links={keypad.links} />
            </Item>
            <Item
              part="aon-2"
              block="aon"
              active={on('aon-2')}
              act={act}
              title={pulse.title}
              meta={`MCU core · ${pulse.tech.join(' · ')}`}
            >
              <p>{pulse.description}</p>
            </Item>
          </ol>
        </>
      );
    }

    case 'pmu':
      return (
        <>
          <p className={s.lede}>
            Power and analog, the engineering roots: control systems, power electronics and
            nanophotonics.
          </p>
          <ol className={s.items}>
            <Item
              part="pmu-2"
              block="pmu"
              active={on('pmu-2')}
              act={act}
              title={roots[0].title}
              meta={`LDO loop · ${roots[0].year}`}
            >
              <p>
                {roots[0].detail} A regulator does the same job: a feedback loop that holds its
                output at the setpoint.
              </p>
            </Item>
            <Item
              part="pmu-0"
              block="pmu"
              active={on('pmu-0')}
              act={act}
              title={roots[5].title}
              meta={`Power stage · ${roots[5].year}`}
            >
              <p>{roots[5].detail}</p>
              <Links links={{ external: roots[5].url }} />
            </Item>
            <Item
              part="pmu-4"
              block="pmu"
              active={on('pmu-4')}
              act={act}
              title={roots[4].title}
              meta={`Optical test structure · ${roots[4].year}`}
            >
              <p>
                {roots[4].detail} The curved lines are a grating coupler, the kind of structure that
                couples light into silicon.
              </p>
            </Item>
          </ol>
        </>
      );

    case 'dbg':
      return (
        <>
          <p className={s.lede}>
            {`JTAG and trace: where you debug a chip. Here, ${fmt.spell(oss.length)} fixes I sent upstream to open source packages that, together, are downloaded `}
            {stats[5].value} times a week.
          </p>
          <ol className={s.items}>
            {oss.map((c, i) => (
              <Item
                key={c.repo}
                part={`dbg-${i}`}
                block="dbg"
                active={on(`dbg-${i}`)}
                act={act}
                title={
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.repo} ↗
                  </a>
                }
                meta={`Chain ${i} · ${c.year} · ${c.kind} · ★ ${c.stars} · ${c.weekly}/week`}
              >
                <p>{c.change}</p>
                <p className={s.muted}>{c.impact}</p>
              </Item>
            ))}
          </ol>
        </>
      );

    case 'io':
      return (
        <>
          <p className={s.lede}>
            {PADS.length} pads around the edge. {BONDED.length} of them are bonded, with gold wires
            that leave the die: those are the links. The scratch on every pad is where a probe
            needle tested it on the wafer.
          </p>
          <table className={s.pinout}>
            <thead>
              <tr>
                <th scope="col">Pin</th>
                <th scope="col">Name</th>
                <th scope="col">Goes to</th>
              </tr>
            </thead>
            <tbody>
              {BONDED.map((p) => (
                <tr
                  key={p.n}
                  data-active={part === p.name || undefined}
                  onMouseEnter={() => act.hint(p.name ?? null)}
                  onMouseLeave={() => act.hint(null)}
                >
                  <td>{p.n}</td>
                  <td>
                    <button
                      type="button"
                      className={s.pinName}
                      onClick={() => act.locate('io', p.name!)}
                      aria-label={`Show pin ${p.n}, ${p.name}, on the die`}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td>
                    <a
                      href={p.href}
                      target={p.href?.startsWith('mailto:') ? undefined : '_blank'}
                      rel="noreferrer"
                    >
                      {p.label} {p.href?.startsWith('mailto:') ? '' : '↗'}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );

    case 'art': {
      const pipe = fromArchive('Pipe inspection robot');
      return (
        <>
          <p
            className={s.lede}
          >{`Chip designers hide doodles in the top metal. This one is about 300 µm across: a Small Size League field with ${fmt.spell(db.robots.ssl.team)} robots and a ball.`}</p>
          <ol className={s.items}>
            {roots.slice(1, 4).map((r) => (
              <li key={r.title} className={s.item}>
                <h3>{r.title}</h3>
                <p className={s.itemMeta}>{r.year}</p>
                <p>{r.detail}</p>
              </li>
            ))}
            {pipe && (
              <li className={s.item}>
                <h3>{pipe.title}</h3>
                <p className={s.itemMeta}>{pipe.madeAt}</p>
              </li>
            )}
          </ol>
        </>
      );
    }
  }
  return null;
}

/* ------------------------------------------------------------------ the panel */

const STATUS = (b: Block) => (b.live ? 'running' : b.id === 'art' ? 'hidden' : 'power-gated');

export function Magnify({ b, act }: { b: Block; act: GuideActions }) {
  return (
    <div className={s.magnify}>
      <h3 className={s.sub}>Magnify</h3>
      <ol>
        <li>
          <button type="button" onClick={() => act.go(b.id)}>
            <span>{b.id === 'die' ? 'Whole die' : 'Whole block'}</span>
            <small>fit</small>
          </button>
        </li>
        {b.ladder.map(([label, z, x = b.probe[0], y = b.probe[1]]) => (
          <li key={label}>
            <button type="button" onClick={() => act.stop(x, y, z)}>
              <span>{label}</span>
              <small>{perPixel(z)}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Parts({ b, part, act }: { b: Block; part: string | null; act: GuideActions }) {
  const decor = b.parts.filter(
    (p) =>
      !['gpu', 'npu', 'slc', 'rf', 'aon', 'pmu', 'dbg', 'l2'].includes(b.id) ||
      [
        'npu-3',
        'rf-fe',
        'rf-pll',
        'slc-ctrl',
        'aon-1',
        'pmu-1',
        'pmu-3',
        'pmu-5',
        'pmu-6',
      ].includes(p.id),
  );
  if (!decor.length) return null;
  return (
    <div className={s.parts}>
      <h3 className={s.sub}>Floorplan</h3>
      <ul>
        {decor.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              data-active={part === p.id || undefined}
              onClick={() => act.locate(b.id, p.id)}
              onMouseEnter={() => act.hint(p.id)}
              onMouseLeave={() => act.hint(null)}
              onFocus={() => act.hint(p.id)}
              onBlur={() => act.hint(null)}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Guide({
  id,
  part,
  act,
}: {
  id: BlockId;
  part: string | null;
  act: GuideActions;
}) {
  const b = BLOCK[id];
  const i = BLOCKS.findIndex((x) => x.id === id);
  const prev = BLOCKS[(i - 1 + BLOCKS.length) % BLOCKS.length],
    next = BLOCKS[(i + 1) % BLOCKS.length];
  const color = CATS[b.cat].color;
  return (
    <article
      className={s.story}
      style={{ '--cat': color } as React.CSSProperties}
      aria-labelledby="story-title"
    >
      <p className={s.eyebrow}>
        <span className={s.tag}>{b.tag}</span>
        <span>{b.kind}</span>
        <span className={s.state} data-live={b.live || undefined}>
          {STATUS(b)}
        </span>
      </p>
      <h2 id="story-title">{b.name}</h2>
      <Story b={b} part={part} act={act} />
      <Magnify b={b} act={act} />
      <Parts b={b} part={part} act={act} />
      <nav className={s.pager} aria-label="Next block">
        <button type="button" onClick={() => act.go(prev.id)}>
          <small>← prev</small>
          {prev.tag} · {prev.name}
        </button>
        <button type="button" onClick={() => act.go(next.id)}>
          <small>next →</small>
          {next.tag} · {next.name}
        </button>
      </nav>
    </article>
  );
}
