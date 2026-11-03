'use client';

import Image from 'next/image';
import { useState } from 'react';
import {
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  otherProjects,
  profile,
  roots,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import type { Snapshot } from './plc';
import { INPUTS, NETWORKS, OUTPUTS, PLC_CHIP, TAGS, XREF, outputFor, type Tag } from './program';

const { person, devices } = db;
import s from './ladder.module.scss';

export function Led({
  on,
  tone = 'green',
  blink = false,
  label,
}: {
  on: boolean;
  tone?: 'green' | 'amber' | 'red';
  blink?: boolean;
  label?: string;
}) {
  return (
    <i
      className={`${s.led} ${on ? s[tone] : ''} ${on && blink ? s.blink : ''}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}

function Window({
  id,
  path,
  title,
  meta,
  children,
  className = '',
}: {
  id: string;
  path: string;
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`${s.window} ${s.panel} ${className}`} aria-labelledby={`${id}-h`}>
      <div className={s.winHead}>
        <span className={s.tab}>{path}</span>
        {meta && <span className={s.tabMeta}>{meta}</span>}
      </div>
      <div className={s.panelBody}>
        <h2 id={`${id}-h`} className={s.h2}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <div className={s.links}>
      {items.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className={l.kind === 'store' ? s.store : ''}
        >
          {l.label} ↗
        </a>
      ))}
    </div>
  );
}

const value = (snap: Snapshot, t: Tag) =>
  t.kind === 'output' || t.kind === 'lamp' ? snap.outputs[t.name] : !!snap.bits[t.name];

/* ------------------------------------------------------------------ PLC tags */

export function TagTable({ snap }: { snap: Snapshot }) {
  return (
    <Window
      id="tags"
      path="PLC_1 › PLC tags › Default tag table"
      meta={`${TAGS.length} tags · monitoring`}
      title="PLC tags"
    >
      <p className={s.intro}>
        Every input is a discipline, and its comment lists the tools behind it. The outputs are what
        shipped. Cross-references are worked out from the program, so they point at the networks
        that read <b>R</b> or write <b>W</b> each tag.
      </p>
      <div className={s.scrollX}>
        <table className={s.tags}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Address</th>
              <th scope="col">Monitor</th>
              <th scope="col">Comment</th>
              <th scope="col">Used in</th>
            </tr>
          </thead>
          <tbody>
            {TAGS.map((t) => {
              const v = value(snap, t);
              return (
                <tr
                  key={t.name}
                  className={INPUTS.includes(t) && t.kind === 'switch' ? s.skillRow : ''}
                >
                  <th scope="row">
                    <span className={s.tagIcon} data-kind={t.kind} aria-hidden="true" />
                    &quot;{t.name}&quot;
                  </th>
                  <td className={`${s.mono} ${s.colType}`}>{t.type}</td>
                  <td className={`${s.mono} ${s.colAddr}`}>{t.addr}</td>
                  <td>
                    <span className={`${s.bool} ${v ? s.boolOn : ''}`}>{v ? 'TRUE' : 'FALSE'}</span>
                  </td>
                  <td className={t.kind === 'switch' ? s.skills : s.comment}>{t.comment}</td>
                  <td className={s.xref}>
                    {(XREF[t.name] ?? []).map((u) => (
                      <a
                        key={`${u.network}${u.access}`}
                        href={`#${u.id}`}
                        className={u.access === 'W' ? s.xw : ''}
                      >
                        {`NW${u.network} ${u.access}`}
                      </a>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Window>
  );
}

/* ------------------------------------------------------------------ HMI screens */

const PLATFORM_NW = NETWORKS.findIndex((nw) => nw.id === 'nw-platforms') + 1;

export function Hmi({ snap }: { snap: Snapshot }) {
  return (
    <Window
      id="hmi"
      path="HMI_1 [Platforms] › Screens"
      meta={`${featuredProjects.length} screens · live`}
      title="Platforms shipped"
    >
      <p className={s.intro}>
        Each platform is an output of network {PLATFORM_NW}. Its lamp follows the program: switch
        off a discipline it needs and the lamp goes out.
      </p>
      <div className={s.screens}>
        {featuredProjects.map((p) => {
          const tag = outputFor(p.title);
          const on = tag ? snap.outputs[tag.name] : false;
          return (
            <article key={p.title} id={tag ? `q-${tag.name}` : undefined} className={s.screen}>
              <div className={s.bezel}>
                <div className={s.bezelBar}>
                  <span>{p.title}</span>
                  {tag && <Led on={on} />}
                </div>
                <div className={`${s.display} ${on ? '' : s.displayOff}`}>
                  <Image src={p.image} width={1280} height={800} alt={`${p.title} screenshot`} />
                </div>
              </div>
              <div className={s.screenText}>
                {tag && (
                  <p className={s.screenTag}>
                    <span className={s.mono}>{tag.addr}</span> &quot;{tag.name}&quot;
                    <span className={`${s.bool} ${on ? s.boolOn : ''}`}>
                      {on ? 'TRUE' : 'FALSE'}
                    </span>
                  </p>
                )}
                <h3>{p.title}</h3>
                <p>{p.description}</p>
                <ul className={s.chips}>
                  {p.tech.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <Links links={p.links} />
              </div>
            </article>
          );
        })}
      </div>

      <h3 className={s.h3}>More blocks</h3>
      <ul className={s.blocks}>
        {otherProjects.map((p, i) => {
          const tag = outputFor(p.title);
          return (
            <li key={p.title} id={tag ? `q-${tag.name}` : undefined}>
              <span className={s.blockNo}>{tag ? tag.addr : `FB${20 + i}`}</span>
              <div>
                <h4>
                  {tag && <Led on={snap.outputs[tag.name]} />}
                  {p.title}
                </h4>
                <p>{p.description}</p>
                <p className={s.blockTech}>{p.tech.join(' · ')}</p>
                <Links links={p.links} />
              </div>
            </li>
          );
        })}
      </ul>
    </Window>
  );
}

/* ------------------------------------------------------------------ device configuration */

type LedSpec = [label: string, state: 'on' | 'off' | 'blink' | 'slow'];

const DEVICE_LEDS: Record<string, LedSpec[]> = {
  [devices.logger.tag]: [
    ['PWR', 'on'],
    ['GSM', 'blink'],
    ['LOG', 'slow'],
  ],
  [devices.epc.tag]: [
    ['PWR', 'on'],
    ['CTRL', 'on'],
    ['ALM', 'off'],
  ],
  [devices.attendumReader.tag]: [
    ['PWR', 'on'],
    ['NFC', 'slow'],
    ['BLE', 'blink'],
    ['OTA', 'off'],
  ],
  [devices.attendumBeacon.tag]: [
    ['PWR', 'on'],
    ['BLE', 'blink'],
  ],
};

const CPU = hardware.find((d) => d.tag === devices.plc.tag)!;
const FIELD = hardware.filter((d) => d.tag !== devices.plc.tag);
// The output module drives one coil per shipped platform and per device in production.
const SHIPPED = OUTPUTS.filter((t) => t.kind === 'output');
const DEVICE_COILS = SHIPPED.filter((t) => hardware.some((d) => d.name === t.project)).length;

export function Devices({ snap }: { snap: Snapshot }) {
  const [sel, setSel] = useState(CPU.tag);
  const inputs = INPUTS;
  const outs = OUTPUTS;
  const forced = Object.keys(snap.forces).length > 0;

  const rows = [
    {
      slot: 1,
      tag: CPU.tag,
      name: CPU.name,
      kind: CPU.kind,
      detail: CPU.detail,
      figures: CPU.figures,
      io: 'Runs OB1 on this page',
    },
    {
      slot: 2,
      tag: 'DI 8',
      name: 'Digital input',
      kind: '8 × 24 V DC',
      detail: 'Start, Stop, Replay and the five disciplines.',
      figures: [],
      io: 'I 0.0 – 0.7',
    },
    {
      slot: 3,
      tag: 'DQ 16',
      name: 'Digital output',
      kind: '16 × 24 V DC',
      detail: `${fmt.Spell(SHIPPED.length - DEVICE_COILS)} platforms, ${fmt.spell(DEVICE_COILS)} devices and a three-colour stack light.`,
      figures: [],
      io: 'Q 0.0 – 1.2',
    },
    ...FIELD.map((d, i) => ({
      slot: 4 + i,
      tag: d.tag,
      name: d.name,
      kind: d.kind,
      detail: d.detail,
      figures: d.figures,
      io: '',
    })),
  ];

  return (
    <Window
      id="devices"
      path={`PLC_1 [${CPU.tag} ${CPU.name}] › Device configuration`}
      meta={`${hardware.length} devices in production`}
      title="Hardware in production"
    >
      <p
        className={s.intro}
      >{`The rack is the hardware I’ve shipped: the ${CPU.name} as the CPU, then field devices from ${devices.logger.kind}s to Bluetooth beacons. Select a module to find it in the overview.`}</p>
      <div className={s.scrollX}>
        <div className={s.rack} role="group" aria-label="Rack">
          <div className={s.dinRail} aria-hidden="true" />
          <button
            type="button"
            className={`${s.module} ${s.cpuModule}`}
            aria-pressed={sel === CPU.tag}
            onClick={() => setSel(CPU.tag)}
          >
            <span className={s.slot}>1</span>
            <span className={s.modTag}>{CPU.tag}</span>
            <span className={s.modName}>{CPU.name}</span>
            <span className={s.modLeds}>
              <span>
                <Led on tone={snap.mode === 'RUN' ? 'green' : 'amber'} />
                RUN
              </span>
              <span>
                <Led on={false} tone="red" />
                ERROR
              </span>
              <span>
                <Led on={forced} tone="amber" />
                MAINT
              </span>
            </span>
            <span className={s.port} aria-hidden="true" />
            <span className={s.modKind}>
              {`${PLC_CHIP} · `}
              {CPU.kind}
            </span>
          </button>
          <button
            type="button"
            className={`${s.module} ${s.ioModule}`}
            aria-pressed={sel === 'DI 8'}
            onClick={() => setSel('DI 8')}
          >
            <span className={s.slot}>2</span>
            <span className={s.modTag}>DI 8</span>
            <span className={s.channels}>
              {inputs.map((t) => (
                <span key={t.name}>
                  <Led on={!!snap.bits[t.name]} />
                  {t.addr.slice(-3)}
                </span>
              ))}
            </span>
            <span className={s.modKind}>24 V DC</span>
          </button>
          <button
            type="button"
            className={`${s.module} ${s.ioModule}`}
            aria-pressed={sel === 'DQ 16'}
            onClick={() => setSel('DQ 16')}
          >
            <span className={s.slot}>3</span>
            <span className={s.modTag}>DQ 16</span>
            <span className={`${s.channels} ${s.channels2}`}>
              {outs.map((t) => (
                <span key={t.name}>
                  <Led
                    on={snap.outputs[t.name]}
                    tone={
                      t.kind === 'lamp'
                        ? t.name === 'LampRed'
                          ? 'red'
                          : t.name === 'LampAmber'
                            ? 'amber'
                            : 'green'
                        : 'green'
                    }
                  />
                  {t.addr.slice(-3)}
                </span>
              ))}
            </span>
            <span className={s.modKind}>24 V DC</span>
          </button>
          {FIELD.map((d, i) => (
            <button
              key={d.tag}
              type="button"
              className={`${s.module} ${s.fieldModule}`}
              aria-pressed={sel === d.tag}
              onClick={() => setSel(d.tag)}
            >
              <span className={s.slot}>{4 + i}</span>
              <span className={s.modTag}>{d.tag}</span>
              <span className={s.modName}>{d.name}</span>
              <span className={s.modLeds}>
                {(DEVICE_LEDS[d.tag] ?? []).map(([label, state]) => (
                  <span key={label}>
                    <i
                      className={`${s.led} ${state !== 'off' ? s.green : ''} ${state === 'blink' ? s.blink : state === 'slow' ? s.blinkSlow : ''}`}
                      aria-hidden="true"
                    />
                    {label}
                  </span>
                ))}
              </span>
              <span className={s.modKind}>{d.kind}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={s.scrollX}>
        <table className={s.overview}>
          <caption>Device overview</caption>
          <thead>
            <tr>
              <th scope="col">Slot</th>
              <th scope="col">Module</th>
              <th scope="col">Type</th>
              <th scope="col">Description</th>
              <th scope="col">In the field</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.tag}
                aria-selected={sel === r.tag}
                className={sel === r.tag ? s.selRow : ''}
              >
                <td className={`${s.mono} ${s.colSlot}`}>{r.slot}</td>
                <th scope="row">
                  <span className={s.mono}>{r.tag}</span> {r.name}
                </th>
                <td>{r.kind}</td>
                <td>{r.detail}</td>
                <td className={s.figures}>
                  {r.figures.length ? (
                    r.figures.map((f) => <span key={f}>{f}</span>)
                  ) : (
                    <span className={s.mono}>{r.io}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Window>
  );
}

/* ------------------------------------------------------------------ diagnostics buffer */

const EVENTS = [...oss].sort((a, b) => b.year - a.year);

export function Diagnostics() {
  return (
    <Window
      id="diagnostics"
      path="PLC_1 › Online & diagnostics › Diagnostics buffer"
      meta={`${EVENTS.length} events · newest first`}
      title="Fixed upstream"
    >
      <p
        className={s.intro}
      >{`Faults found in other people’s code and fixed at the source, in packages downloaded ${db.downloads.weekly.long} times a week.`}</p>
      <ol className={s.diag}>
        <li className={s.diagHead} aria-hidden="true">
          <span>No.</span>
          <span>Year</span>
          <span>Event</span>
          <span>Reach</span>
        </li>
        {EVENTS.map((c, i) => (
          <li key={c.repo}>
            <span className={s.diagNo}>{i + 1}</span>
            <span className={s.diagYear}>{c.year}</span>
            <div className={s.diagEvent}>
              <p className={s.diagTitle}>
                <span
                  className={`${s.kind} ${c.kind === 'Security' || c.kind === 'Data loss' ? s.kindHot : ''}`}
                >
                  {c.kind}
                </span>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.repo} ↗
                </a>
              </p>
              <p className={s.diagFault}>
                <b>Fault</b> {c.impact}
              </p>
              <p className={s.diagFix}>
                <b>Fix</b> {c.change}
              </p>
            </div>
            <span className={s.diagReach}>
              <span>★ {c.stars}</span>
              <span>{c.weekly}/wk</span>
            </span>
          </li>
        ))}
      </ol>
    </Window>
  );
}

/* ------------------------------------------------------------------ library */

const ROOT_YEARS = roots.flatMap((r) => (r.year.match(/\d{4}/g) ?? []).map(Number));

export function Library() {
  return (
    <Window
      id="library"
      path="Global libraries › Roots"
      meta={`${roots.length} types · ${Math.min(...ROOT_YEARS)} → ${Math.max(...ROOT_YEARS)}`}
      title="Roots"
    >
      <div className={s.libGrid}>
        <div className={s.history}>
          <h3 className={s.h3}>Project history</h3>
          {about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
        <ul className={s.types}>
          {roots.map((r) => (
            <li key={r.title}>
              <span className={s.version}>V{r.year}</span>
              <div>
                <h4>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title} ↗
                    </a>
                  ) : (
                    r.title
                  )}
                </h4>
                <p>{r.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}

/* ------------------------------------------------------------------ online access */

const NODES = [
  { iface: 'Email', addr: profile.email, href: `mailto:${profile.email}`, external: false },
  {
    iface: 'LinkedIn',
    addr: profile.linkedin.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''),
    href: profile.linkedin,
    external: true,
  },
  {
    iface: 'GitHub',
    addr: profile.github.replace(/^https:\/\//, ''),
    href: profile.github,
    external: true,
  },
  { iface: 'CV (PDF)', addr: `${person.site}${profile.cv}`, href: profile.cv, external: true },
];

export function OnlineAccess() {
  return (
    <Window
      id="online"
      path="Online access › Accessible devices"
      meta={`${NODES.length} nodes reachable`}
      title="Go online"
      className={s.online}
    >
      <div className={s.onlineGrid}>
        <div>
          <p className={s.onlineLede}>
            Building a platform, a device, or the team behind them? Connect.
          </p>
          <a className={s.goOnline} href={`mailto:${profile.email}`}>
            <span aria-hidden="true">⇄</span> Go online · {profile.email}
          </a>
        </div>
        <table className={s.nodes}>
          <caption className={s.srOnly}>{`Ways to reach ${person.first}`}</caption>
          <thead>
            <tr>
              <th scope="col">Interface</th>
              <th scope="col">Address</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {NODES.map((n) => (
              <tr key={n.iface}>
                <th scope="row">{n.iface}</th>
                <td>
                  <a href={n.href} {...(n.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                    {n.addr}
                    {n.external ? ' ↗' : ''}
                  </a>
                </td>
                <td>
                  <Led on /> reachable
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Window>
  );
}
