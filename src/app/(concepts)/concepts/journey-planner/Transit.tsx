'use client';

import Image from 'next/image';
import { useRef, useState, useSyncExternalStore } from 'react';
import {
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  profile,
  skills,
  stats,
} from '../_shared/data';
import { useInView } from '../_shared/hooks';
import { projectLinks } from '../_shared/links';
import Departures from './Departures';
import NetworkMap, { Bullet } from './NetworkMap';
import { LINE, LINES, STATION, STATIONS, TRACK, gridRef, linesAt, type LineId } from './network';
import s from './transit.module.scss';
import { concept } from '../_shared/concepts';

const { person, yearsBuilding, downloads } = db;
const { logger } = db.devices;
/** The network is named for its owner. */
const METRO = `${person.name.split(' ').pop()} Metro`;

/* ------------------------------------------------------------------ clock */

const subscribeSecond = (onChange: () => void) => {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
};
const timeNow = () => new Date().toTimeString().slice(0, 8);

/** A station clock, read on the client only. */
function Clock() {
  const time = useSyncExternalStore(subscribeSecond, timeNow, () => '--:--:--');
  return <time className={s.clock}>{time}</time>;
}

/* ------------------------------------------------------------------ line diagrams */

// The stopping pattern of each line, west to east. The Embedded line also has a short research
// branch (MSc and the arXiv paper) that leaves the main line at Niknam.
const BRANCH = TRACK.E2.stops.slice(1);

function Stops({ ids, line, branch }: { ids: string[]; line: LineId; branch?: boolean }) {
  return (
    <ol className={s.pattern}>
      {ids.map((id, i) => {
        const st = STATION[id];
        const others = linesAt(st).filter((l) => l !== line);
        return (
          <li
            key={id}
            className={`${s.stop} ${others.length ? s.isX : ''}`}
            data-first={(i === 0 && !branch) || undefined}
            data-last={i === ids.length - 1 || undefined}
          >
            <span className={s.rail} aria-hidden="true" />
            <div className={s.stopBody}>
              <h3>{st.name}</h3>
              <p className={s.stopMeta}>
                {st.when} · grid {gridRef(st)}
              </p>
              <p>{st.brief}</p>
              {(others.length > 0 || st.links?.length || st.platform) && (
                <p className={s.stopLinks}>
                  {others.length > 0 && (
                    <span className={s.change}>
                      Change for
                      {others.map((o) => (
                        <Bullet key={o} id={o} size="sm" />
                      ))}
                    </span>
                  )}
                  {st.links?.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                      {l.label} ↗
                    </a>
                  ))}
                  {st.platform ? (
                    <a href={`#platform-${st.platform}`}>Platform {st.platform} ↓</a>
                  ) : null}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function LineDiagrams() {
  const [active, setActive] = useState<LineId>('E');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const line = LINE[active];
  const stops = TRACK[active].stops;
  const ends = [STATION[stops[0]].name, STATION[stops[stops.length - 1]].name];
  const count = stops.length + (active === 'E' ? BRANCH.length : 0);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + LINES.length) % LINES.length;
    setActive(LINES[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <div className={s.lines} style={{ '--c': line.color, '--k': line.ink } as React.CSSProperties}>
      <div className={s.lineTabs} role="tablist" aria-label="Lines" aria-orientation="vertical">
        {LINES.map((l, i) => (
          <button
            key={l.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${l.id}`}
            aria-selected={active === l.id}
            aria-controls="line-panel"
            tabIndex={active === l.id ? 0 : -1}
            onClick={() => setActive(l.id)}
            onKeyDown={(e) => onKey(e, i)}
            style={{ '--c': l.color } as React.CSSProperties}
          >
            <Bullet id={l.id} size="lg" />
            <span>
              <b>{l.name} line</b>
              <small>{l.blurb}</small>
            </span>
          </button>
        ))}
      </div>

      <div
        id="line-panel"
        role="tabpanel"
        aria-labelledby={`tab-${active}`}
        className={s.linePanel}
      >
        <div className={s.dotMatrix} aria-hidden="true">
          <span key={active} className={s.ticker}>
            This is a {line.name} line service to {ends[1]}. Calling at{' '}
            {stops
              .slice(1)
              .map((id) => STATION[id].name)
              .join(', ')}
            .
          </span>
        </div>
        <p className={s.lineMeta}>
          <b>{line.name} line</b> · {ends[0]} ↔ {ends[1]} · {count} stations
        </p>
        <Stops ids={stops} line={active} />
        {active === 'E' && (
          <>
            <p
              className={s.branchHead}
            >{`Research branch · from ${STATION[TRACK.E2.stops[0]].name}`}</p>
            <Stops ids={BRANCH} line="E" branch />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ depot */

function Depot() {
  const [ref, inView] = useInView<HTMLUListElement>(true, 0.2);
  return (
    <ul ref={ref} className={`${s.sidings} ${inView ? s.arrived : ''}`}>
      {hardware.map((d, i) => (
        <li key={d.tag} className={s.siding} style={{ '--i': i } as React.CSSProperties}>
          <div className={s.road}>
            <span className={s.roadNo}>Road {i + 1}</span>
            <div className={s.rails}>
              <div className={s.unit}>
                <span className={s.blind}>{d.tag}</span>
                <span className={s.windows} />
                <span className={s.bogies} />
              </div>
              <span className={s.buffer} />
            </div>
          </div>
          <div className={s.unitInfo}>
            <h3>
              {d.name} <span>{d.kind}</span>
            </h3>
            <p>{d.detail}</p>
            <ul className={s.facts}>
              {d.figures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ page */

const NAV = [
  ['map', 'Map'],
  ['departures', 'Departures'],
  ['lines', 'Lines'],
  ['platforms', 'Platforms'],
  ['depot', 'Depot'],
  ['status', 'Status'],
  ['ticket', 'Ticket'],
];

const featuredLines = (n: number) => {
  const st = STATIONS.find((x) => x.platform === n);
  return st ? linesAt(st) : [];
};

function Head({
  kicker,
  title,
  id,
  children,
}: {
  kicker: string;
  title: string;
  id: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={s.head}>
      <p className={s.kicker}>{kicker}</p>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </header>
  );
}

export default function Transit() {
  return (
    <div className={s.root}>
      <header className={s.top}>
        <a href="#map" className={s.brand}>
          <svg viewBox="0 0 32 32" className={s.logo} aria-hidden="true">
            <rect width="32" height="32" rx="8" style={{ fill: 'var(--bar)' }} />
            {LINES.map((l, i) => (
              <path
                key={l.id}
                d={`M5 ${8 + i * 4} H${12 + i * 2} L${20 + i * 2} ${16 + i * 4 - 8} H27`}
                stroke={l.color}
                strokeWidth="2.6"
                fill="none"
                transform={`translate(0 ${2 - i})`}
              />
            ))}
          </svg>
          <span>
            <b>{METRO}</b>
            <small>{`Career network · since ${person.since}`}</small>
          </span>
        </a>
        <nav aria-label="Sections" className={s.nav}>
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <p className={s.status}>
          <span className={s.ok} aria-hidden="true" />
          <span className={s.statusText}>Good service</span>
          <Clock />
        </p>
      </header>

      <main>
        <section id="map" className={s.hero} aria-labelledby="map-title">
          <NetworkMap>
            <p className={s.edition}>{`Career network map · ${fmt.month(db.asOf)} edition`}</p>
            <h1 id="map-title">{profile.name}</h1>
            <p className={s.role}>
              {profile.role} at{' '}
              <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                {profile.company}
              </a>
            </p>
            <p
              className={s.lede}
            >{`Leading the platform that connects BIM, schedules, budgets and risks for construction enterprises. Building since ${person.since}: robots, IoT and firmware, then web, mobile and AI platforms.`}</p>
            <p className={s.howTo}>
              Hover or tap a station for details. Pick a line in the key to isolate it, or plan a
              journey below.
            </p>
            <p className={s.heroLinks}>
              <a href="#ticket" className={s.btn}>
                Buy a ticket
              </a>
              <a href={profile.cv} target="_blank" rel="noreferrer" className={s.btnGhost}>
                CV ↗
              </a>
            </p>
          </NetworkMap>
        </section>

        <section id="about" className={s.section} aria-labelledby="about-title">
          <Head
            kicker="Network information"
            title={`One network, ${fmt.spell(yearsBuilding)} years`}
            id="about"
          />
          <div className={s.about}>
            <div className={s.prose}>
              {about.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <div>
              <dl className={s.factsGrid}>
                {stats.map((m) => (
                  <div key={m.label}>
                    <dt>{m.label}</dt>
                    <dd>{m.value}</dd>
                  </div>
                ))}
              </dl>
              <p className={s.toolLabel}>Signalling and rolling stock</p>
              <ul className={s.tools}>
                {skills.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          id="departures"
          className={`${s.section} ${s.dark}`}
          aria-labelledby="departures-title"
        >
          <Head kicker="Timetable" title="Where I’ve worked" id="departures" />
          <Departures />
        </section>

        <section id="lines" className={s.section} aria-labelledby="lines-title">
          <Head kicker="Line diagrams" title="Every station, line by line" id="lines">
            <p className={s.intro}>
              The strip maps from above the train doors: each discipline as a line, with roles,
              projects, devices and milestones as its stations.
            </p>
          </Head>
          <LineDiagrams />
        </section>

        <section id="platforms" className={s.section} aria-labelledby="platforms-title">
          <Head kicker="Platforms" title="Platforms I’ve shipped" id="platforms" />
          <div className={s.platforms}>
            {featuredProjects.map((p, i) => (
              <article key={p.title} id={`platform-${i + 1}`} className={s.platform}>
                <div className={s.platformSign}>
                  <span className={s.platformNo}>{i + 1}</span>
                  <span className={s.platformWord}>Platform</span>
                  <span className={s.platformLines}>
                    {featuredLines(i + 1).map((id) => (
                      <Bullet key={id} id={id} size="sm" />
                    ))}
                  </span>
                </div>
                <div className={s.poster}>
                  <Image
                    src={p.image}
                    width={1280}
                    height={800}
                    alt={`${p.title} screenshot`}
                    sizes="(max-width: 860px) 100vw, 50vw"
                  />
                </div>
                <div className={s.platformText}>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                  <ul className={s.techs}>
                    {p.tech.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <p className={s.platformLinks}>
                    {projectLinks(p.links).map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        data-kind={l.kind}
                      >
                        {l.label} ↗
                      </a>
                    ))}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <p className={s.edge} aria-hidden="true">
            <span>Mind the gap</span>
          </p>
        </section>

        <section id="depot" className={s.section} aria-labelledby="depot-title">
          <Head kicker="Depot" title="Hardware in service" id="depot">
            <p
              className={s.intro}
            >{`${fmt.Spell(hardware.length)} units on the fleet list, from weather stations that have logged for ${logger.online.long} years to the card readers checking students into lectures.`}</p>
          </Head>
          <Depot />
        </section>

        <section id="status" className={s.section} aria-labelledby="status-title">
          <Head kicker="Service status" title="Fixes I sent upstream" id="status">
            <p
              className={s.intro}
            >{`Disruptions found in other people’s networks, fixed at the source, in packages downloaded ${downloads.weekly.long} times a week.`}</p>
          </Head>
          <div className={s.statusBoard}>
            <p className={s.statusTop}>
              <span className={s.ok} aria-hidden="true" /> Good service on all lines{' '}
              <span>{oss.length} notices · all resolved</span>
            </p>
            <ul>
              {[...oss]
                .sort((a, b) => b.year - a.year)
                .map((c) => (
                  <li key={c.repo}>
                    <details>
                      <summary>
                        <span className={s.repo}>{c.repo}</span>
                        <span className={s.kind} data-kind={c.kind}>
                          {c.kind}
                        </span>
                        <span className={s.resolved}>Resolved {c.year}</span>
                      </summary>
                      <dl className={s.notice}>
                        <div>
                          <dt>Disruption</dt>
                          <dd>{c.impact}</dd>
                        </div>
                        <div>
                          <dt>Fix</dt>
                          <dd>{c.change}</dd>
                        </div>
                        <div>
                          <dt>Reach</dt>
                          <dd>
                            ★ {c.stars} stars · {c.weekly} downloads a week
                          </dd>
                        </div>
                      </dl>
                      <a href={c.url} target="_blank" rel="noreferrer" className={s.prLink}>
                        Read the pull request ↗
                      </a>
                    </details>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        <section id="ticket" className={s.section} aria-labelledby="ticket-title">
          <Head kicker="Tickets" title="Get in touch" id="ticket">
            <p className={s.intro}>
              Tell me where you’re heading: a platform, a device or a team that needs building.
            </p>
          </Head>
          <div className={s.ticket}>
            <div className={s.ticketMain}>
              <div className={s.ticketTop}>
                <span>{METRO}</span>
                <span>Season ticket, all lines</span>
              </div>
              <div className={s.ticketBody}>
                <Image
                  src={person.photo}
                  width={600}
                  height={600}
                  alt={profile.name}
                  className={s.photo}
                />
                <dl>
                  <div>
                    <dt>Holder</dt>
                    <dd>{profile.fullName}</dd>
                  </div>
                  <div>
                    <dt>Current station</dt>
                    <dd>
                      {profile.role}, {profile.company}
                    </dd>
                  </div>
                  <div>
                    <dt>Valid from</dt>
                    <dd>{person.since}</dd>
                  </div>
                  <div>
                    <dt>Zones</dt>
                    <dd className={s.zones}>
                      {LINES.map((l) => (
                        <Bullet key={l.id} id={l.id} size="sm" />
                      ))}
                    </dd>
                  </div>
                </dl>
              </div>
              <a href={`mailto:${profile.email}`} className={s.email}>
                {profile.email}
              </a>
            </div>
            <div className={s.stub}>
              <a href={profile.linkedin} target="_blank" rel="noreferrer">
                LinkedIn ↗
              </a>
              <a href={profile.github} target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
              <a href={profile.cv} target="_blank" rel="noreferrer">
                CV (PDF) ↗
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <span>Diagram not to scale. After Harry Beck (1931) and Massimo Vignelli (1972).</span>
        <span>{`${concept('journey-planner').name} · concept ${concept('journey-planner').letter} · © ${profile.fullName}`}</span>
      </footer>
    </div>
  );
}
