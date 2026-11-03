'use client';

import Image from 'next/image';
import { Fragment, useEffect, useRef } from 'react';
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roles,
  roots,
  skills,
} from '../_shared/data';
import { useReducedMotion, useScheme } from '../_shared/hooks';
import { projectLinks } from '../_shared/links';
import { startZoom } from './engine';
import { readPalette } from './paint';
import Still from './Still';
import { LG, OSS_COLORS, ROLE_COLORS, STOPS, powerOf, sup, type Stop } from './stops';
import s from './powers.module.scss';
import { conceptTitle } from '../_shared/concepts';

type Links = Parameters<typeof projectLinks>[0];

function LinkRow({ links }: { links: Links }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <ul className={s.linkRow}>
      {items.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer">
            {l.label} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

// Where Attendum's universities are: "the UK and US".
const ATTENDUM_COUNTRIES = `the ${fmt.list(db.products.attendum.countries)}`;

const { person, current, commits, downloads, products } = db;
const { logger, attendumReader, attendumBeacon } = db.devices;
const { fleet } = attendumReader;

const project = (title: string) => featuredProjects.find((p) => p.title === title)!;
const ATTENDUM = project(products.attendum.title);
const NEUROBUILD = project(products.neurobuild.title);
const LOGGER = project(products.logger.title);
const ATTENDUM_DEVICES = hardware.filter((d) => d.tag.startsWith('AT'));
const neurobuildDuty = current.role.duties.find((d) => d.includes(NEUROBUILD.title)) ?? '';
const fixes = new Set(oss.map((c) => c.url));
const builds = otherProjects.filter((p) => !(p.links.github && fixes.has(p.links.github)));

/** Ruler labels, nudged apart where two figures sit close on the log axis. */
const LABEL_AT = LG.reduce<number[]>((out, lg, i) => {
  out.push(i ? Math.max(lg / 9, out[i - 1] + 0.032) : lg / 9);
  return out;
}, []);

const TITLES: Record<string, string> = {
  devices: 'devices in production',
  years: `years, ${roles.length} roles`,
  stations: `${logger.name} weather stations`,
  classrooms: `classrooms on ${ATTENDUM.title}`,
  readers: `${ATTENDUM.title} devices online`,
  neurobuild: `commits in ${NEUROBUILD.title}`,
  classes: 'classes covered',
  commits: `commits since ${commits.since}`,
  downloads: 'weekly downloads, combined',
  records: `${ATTENDUM.title} records in ${fmt.spell(fleet.recordYears)} years`,
  logger: `sensor records from ${logger.name}`,
};

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** A figure's phrase, worded the way the panels say it: "over 3 million" → "more than 3 million". */
const moreThan = (f: db.Figure) => f.long.replace(/^over /, 'more than ');

const NEUROJECT_NOTE = `At ${current.company}: ${current.previous.title} from ${fmt.month(current.previous.from)}, ${current.title} since ${fmt.month(current.since)}.`;

const LAST = STOPS[STOPS.length - 1];
/** How many powers of ten the zoom covers, from the single mark to the last figure. */
const DECADES = Math.log10(LAST.n).toFixed(1);
/** The power the camera passes without a figure, just below the last stop. */
const SKIPPED = powerOf(LAST.n) - 1;

function Body({ st }: { st: Stop }) {
  switch (st.id) {
    case 'devices':
      return (
        <>
          <p>{`${fmt.Spell(hardware.length)} devices in production, from GSM weather stations to a compact PLC. On the field, each mark carries its tag.`}</p>
          <ul className={s.devices}>
            {hardware.map((d) => (
              <li key={d.tag}>
                <span className={s.tag}>{d.tag}</span>
                <div>
                  <h3>
                    {d.name} <span>· {d.kind}</span>
                  </h3>
                  <p>{d.detail}</p>
                  <p className={s.figs}>{d.figures.join(' · ')}</p>
                </div>
              </li>
            ))}
          </ul>
          <p
            className={s.note}
          >{`For both ${ATTENDUM.title} parts, the reader and the beacon, I wrote the firmware.`}</p>
        </>
      );
    case 'years':
      return (
        <>
          <p>{`From freelance websites in ${person.since} to ${current.title} at ${current.company}. Each mark is a year from ${fmt.month(db.roles.freelance.from)}. Its twelve stripes are its months, coloured by the role I held, with a lower band when a second role ran alongside.`}</p>
          <ol className={s.roles}>
            {roles.map((r) => (
              <li
                key={r.id}
                style={{ '--c': `var(--${ROLE_COLORS[r.id]})` } as React.CSSProperties}
              >
                <span className={s.swatch} aria-hidden="true" />
                <div>
                  <h3>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.org} ↗
                      </a>
                    ) : (
                      r.org
                    )}{' '}
                    <span>{r.range}</span>
                  </h3>
                  <p className={s.roleTitle}>{r.title}</p>
                  <p>{r.summary}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className={s.note}>{NEUROJECT_NOTE}</p>
        </>
      );
    case 'stations':
      return (
        <>
          <p>{LOGGER.description}</p>
          <p className={s.figs}>{hardware[0].figures.join(' · ')}</p>
          <p
            className={s.note}
          >{`Their records come back at the end of the zoom, at 10${sup(powerOf(logger.records.n))}.`}</p>
        </>
      );
    case 'classrooms':
      return (
        <>
          <p>{`Attendance monitoring, live at universities in ${ATTENDUM_COUNTRIES}. The ${ATTENDUM.title} figures here all come from one of them, where it covers ${moreThan(fleet.classrooms)} classrooms.`}</p>
          <p>{`I wrote the firmware for the ${attendumReader.chip} card readers and the ${attendumBeacon.chip} Bluetooth beacons, and built the iOS and Android app, the staff dashboard and a Canvas LTI app.`}</p>
          <LinkRow links={ATTENDUM.links} />
        </>
      );
    case 'readers':
      return (
        <>
          <figure className={s.shot}>
            <Image
              src={ATTENDUM.image}
              width={1280}
              height={800}
              alt={`${ATTENDUM.title} screenshot`}
              sizes="(max-width: 900px) 92vw, 400px"
            />
          </figure>
          <p>{`${cap(fleet.online.long)} devices online at that same university. The ${fmt.spell(ATTENDUM_DEVICES.length)} ${ATTENDUM.title} devices:`}</p>
          <ul className={s.devices}>
            {ATTENDUM_DEVICES.map((d) => (
              <li key={d.tag}>
                <span className={s.tag}>{d.tag}</span>
                <div>
                  <h3>
                    {d.name} <span>· {d.kind}</span>
                  </h3>
                  <p>{d.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      );
    case 'neurobuild':
      return (
        <>
          <figure className={s.shot}>
            <Image
              src={NEUROBUILD.image}
              width={1280}
              height={800}
              alt={`${NEUROBUILD.title} screenshot`}
              sizes="(max-width: 900px) 92vw, 400px"
            />
          </figure>
          <p>{NEUROBUILD.description}</p>
          <p>{neurobuildDuty}</p>
          <p className={s.note}>{NEUROJECT_NOTE}</p>
          <LinkRow links={NEUROBUILD.links} />
        </>
      );
    case 'classes':
      return (
        <>
          <p>{`Back at the same university, ${fmt.spell(powerOf(fleet.classes.n) - powerOf(fleet.classrooms.n))} powers up from its classrooms: ${ATTENDUM.title} has covered ${moreThan(fleet.classes)} classes there.`}</p>
          <p className={s.note}>
            The marks are now a few pixels wide. Watch the gutters: every gap marks where a block of
            ten, a hundred or a thousand ends.
          </p>
        </>
      );
    case 'commits':
      return (
        <>
          <p>{`Commits since ${commits.since}. The bright ones are ${NEUROBUILD.title}’s ${commits.neurobuild.short} from 10${sup(powerOf(commits.neurobuild.n))}: the previous stop, sitting inside this one.`}</p>
          <p className={s.label}>Written in</p>
          <ul className={s.chips}>
            {skills.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </>
      );
    case 'downloads':
      return (
        <>
          <p>{`Fixes I sent upstream, to packages that together are downloaded ${downloads.weekly.long} times a week. The figure is the combined total, so the field splits it by package.`}</p>
          <ol className={s.prs}>
            {oss.map((c, i) => (
              <li
                key={c.repo}
                style={
                  { '--c': `var(--${OSS_COLORS[i % OSS_COLORS.length]})` } as React.CSSProperties
                }
              >
                <span className={s.swatch} aria-hidden="true" />
                <div>
                  <h3>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.repo} ↗
                    </a>
                  </h3>
                  <p className={s.figs}>
                    {c.year} · {c.kind} · {c.weekly} a week · ★ {c.stars}
                  </p>
                  <p>{c.change}</p>
                  <p className={s.dim}>{c.impact}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      );
    case 'records':
      return (
        <>
          <p>{`${cap(moreThan(fleet.records))} ${ATTENDUM.title} records received in the past ${fmt.spell(fleet.recordYears)} years, from that ${fleet.scope}.`}</p>
          <p className={s.note}>
            A mark is now smaller than a pixel, so each square on screen is a block of marks and the
            readout says how many. The count stays exact; only the drawing is aggregated.
          </p>
        </>
      );
    case 'logger':
      return (
        <>
          <p>{`${cap(logger.records.long)} records from the ${logger.name} fleet, online for ${logger.online.long} years: GSM weather stations with several sensors each, ${logger.stations.long} of them active.`}</p>
          <p
            className={s.note}
          >{`That is ${DECADES} powers of ten from the single mark at the top. All ${fmt.grouped(logger.records.n)} are counted; on screen they are drawn in blocks.`}</p>
        </>
      );
    default:
      return null;
  }
}

const EXTRAS = [
  {
    n: db.storeApps.length,
    display: String(db.storeApps.length),
    what: 'apps on the App Store and Google Play',
    id: '',
  },
  { n: db.productsLive.n, display: db.productsLive.short, what: 'products live', id: '' },
  {
    n: logger.online.n,
    display: logger.online.short,
    what: `years the ${logger.name} fleet has been online`,
    id: '',
  },
];
const MAGNITUDES = [
  ...STOPS.slice(1).map((st) => ({
    n: st.n,
    display: st.display,
    what: [st.what, st.scope].filter(Boolean).join(', '),
    id: st.id,
  })),
  ...EXTRAS,
].sort((a, b) => a.n - b.n);

export default function Powers() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const power = useRef<HTMLElement>(null);
  const count = useRef<HTMLParagraphElement>(null);
  const what = useRef<HTMLParagraphElement>(null);
  const unit = useRef<HTMLParagraphElement>(null);
  const log = useRef<HTMLParagraphElement>(null);
  const density = useRef<HTMLParagraphElement>(null);
  const bar = useRef<HTMLElement>(null);
  const barLabel = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) return;
    const els = {
      hud: hud.current,
      power: power.current,
      count: count.current,
      what: what.current,
      unit: unit.current,
      log: log.current,
      density: density.current,
      bar: bar.current,
      barLabel: barLabel.current,
    };
    if (!section.current || !canvas.current || Object.values(els).some((el) => !el)) return;
    // The scheme's colours are read once here, and a scheme change restarts the engine to repaint.
    readPalette(section.current);
    return startZoom(
      section.current,
      canvas.current,
      els as { [K in keyof typeof els]: NonNullable<(typeof els)[K]> },
    );
  }, [reduced, scheme]);

  const last = STOPS.length - 1;

  return (
    <div className={s.root} data-reduced={reduced ? 'true' : 'false'}>
      <a href="#magnitudes" className={s.skip}>
        Skip the zoom
      </a>
      <main>
        <section
          ref={section}
          className={s.zoom}
          aria-label="Powers of ten: the career zoomed out one order of magnitude at a time"
        >
          {!reduced && (
            <div ref={hud} className={s.hud} data-active="0" data-moving="false">
              <div className={s.hudInner}>
                <div className={s.readout} aria-hidden="true">
                  <p className={s.brand}>
                    <b>V</b> Powers of Ten
                  </p>
                  <p className={s.power}>
                    10<sup ref={power}>0</sup>
                  </p>
                  <div className={s.countBox}>
                    <p ref={count} className={s.count}>
                      1
                    </p>
                    <p ref={what} className={s.what}>
                      {STOPS[0].what}
                    </p>
                    <p ref={unit} className={s.unit}>
                      {STOPS[0].mark}
                    </p>
                  </div>
                </div>
                <i className={s.edge} aria-hidden="true" />
                <div className={s.meta} aria-hidden="true">
                  <p className={s.scale}>
                    <i ref={bar} />
                    <span ref={barLabel}>one slot</span>
                  </p>
                  <p ref={density} />
                  <p ref={log} className={s.logLine} />
                  <p className={s.keys}>
                    <kbd>scroll</kbd> <kbd>pinch</kbd> <kbd>←</kbd> <kbd>→</kbd> to zoom
                  </p>
                </div>
                <nav className={s.ruler} aria-label="Stops on the zoom">
                  <span className={s.axis} aria-hidden="true" />
                  <ol className={s.ticks} aria-hidden="true">
                    {Array.from({ length: 10 }, (_, k) => (
                      <li key={k} style={{ '--at': k / 9 } as React.CSSProperties}>
                        10{sup(k)}
                      </li>
                    ))}
                  </ol>
                  <ol className={s.dots} aria-hidden="true">
                    {STOPS.map((st, i) => (
                      <li
                        key={st.id}
                        data-i={i}
                        style={
                          { '--at': LG[i] / 9, '--c': `var(--${st.accent})` } as React.CSSProperties
                        }
                      />
                    ))}
                  </ol>
                  <ol className={s.labels}>
                    {STOPS.map((st, i) => (
                      <li
                        key={st.id}
                        data-i={i}
                        style={{ '--at': LABEL_AT[i] } as React.CSSProperties}
                      >
                        <a href={`#p-${st.id}`} aria-label={`${st.display} ${st.what}`}>
                          {st.display}
                        </a>
                      </li>
                    ))}
                  </ol>
                  <span className={s.needle} aria-hidden="true" />
                </nav>
              </div>
            </div>
          )}

          {!reduced && (
            <div className={s.stageWrap}>
              <div className={s.stage}>
                <canvas
                  ref={canvas}
                  role="img"
                  aria-label="A field of marks, one per unit of the figure in view, zooming out by powers of ten as you scroll. The panels describe each stop."
                />
              </div>
            </div>
          )}

          <ol className={s.stops}>
            <li
              id="p-one"
              data-stop="0"
              className={`${s.stop} ${s.hero}`}
              style={{ '--accent': `var(--${STOPS[0].accent})` } as React.CSSProperties}
            >
              <article className={s.panel} aria-labelledby="t-one">
                {reduced && (
                  <Still
                    index={0}
                    label={`One mark: a portrait of ${person.first}, the first slot of ten.`}
                  />
                )}
                <p className={s.kicker}>
                  <span className={s.pow}>10⁰</span>
                  <span>1 mark = 1 person</span>
                </p>
                <h1 id="t-one">{profile.name}</h1>
                <p className={s.lede}>{profile.lede}</p>
                <p>
                  Every stop below is a real figure from my career, drawn as exactly that many
                  marks. Zoom out and each order of magnitude turns out to be made of the one
                  before.
                </p>
                <p className={s.how}>
                  <kbd>scroll</kbd> <kbd>pinch</kbd> or <kbd>←</kbd> <kbd>→</kbd> to zoom by ×10
                </p>
                <ul className={s.linkRow}>
                  <li>
                    <a href={`mailto:${profile.email}`}>{profile.email}</a>
                  </li>
                  <li>
                    <a href={profile.linkedin} target="_blank" rel="noreferrer">
                      LinkedIn ↗
                    </a>
                  </li>
                  <li>
                    <a href={profile.github} target="_blank" rel="noreferrer">
                      GitHub ↗
                    </a>
                  </li>
                  <li>
                    <a href={profile.cv} target="_blank" rel="noreferrer">
                      CV ↗
                    </a>
                  </li>
                </ul>
              </article>
            </li>

            {STOPS.slice(1).map((st, j) => {
              const i = j + 1;
              const p = powerOf(st.n);
              return (
                <Fragment key={st.id}>
                  {i === last && (
                    <li className={s.interlude} style={{ '--travel': 0.6 } as React.CSSProperties}>
                      <p>
                        <span className={s.pow}>{`10${sup(SKIPPED)}`}</span>
                        {` No figure here lands on 10${sup(SKIPPED)}, so the camera passes it rather than invent one. The next is ${fmt.grouped(LAST.n / 10 ** SKIPPED)} times larger.`}
                      </p>
                    </li>
                  )}
                  <li
                    id={`p-${st.id}`}
                    data-stop={i}
                    className={s.stop}
                    style={
                      {
                        '--accent': `var(--${st.accent})`,
                        '--travel': i === last ? 0.7 : LG[i] - LG[i - 1],
                      } as React.CSSProperties
                    }
                  >
                    <article className={s.panel} aria-labelledby={`t-${st.id}`}>
                      {reduced && (
                        <Still
                          index={i}
                          label={`${st.display} ${st.what}, drawn as ${st.n.toLocaleString('en-US')} marks.`}
                        />
                      )}
                      <p className={s.kicker}>
                        <span className={s.pow}>10{sup(p)}</span>
                        <span>{st.mark}</span>
                        {st.scope && <span className={s.scope}>{st.scope}</span>}
                      </p>
                      <h2 id={`t-${st.id}`}>
                        <span className={s.figure}>{st.display}</span>{' '}
                        <span className={s.title}>{TITLES[st.id]}</span>
                      </h2>
                      <Body st={st} />
                      {st.drawn && <p className={s.drawn}>{st.drawn}</p>}
                    </article>
                  </li>
                </Fragment>
              );
            })}
          </ol>

          <div className={s.outro}>
            <p>
              From <b>1</b> to <b>{fmt.grouped(LAST.n)}</b>
              {`: ${DECADES} powers of ten.`}
            </p>
            <a href="#magnitudes">The table of magnitudes ↓</a>
          </div>
        </section>

        <section id="magnitudes" className={s.section} aria-labelledby="magnitudes-title">
          <header className={s.head}>
            <p className={s.eyebrow}>After the zoom</p>
            <h2 id="magnitudes-title">Table of magnitudes</h2>
            <p>
              Every figure on one log scale, smallest first. The bar’s length is the figure’s power
              of ten.
            </p>
          </header>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">10ⁿ</th>
                <th scope="col">Figure</th>
                <th scope="col">What it counts</th>
                <th scope="col">
                  <span className={s.srOnly}>Log scale</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {MAGNITUDES.map((m) => (
                <tr key={m.what}>
                  <td className={s.mono}>10{sup(powerOf(m.n))}</td>
                  <td className={s.fig}>{m.display}</td>
                  <td>
                    {m.what}
                    {m.id ? (
                      <a className={s.jump} href={`#p-${m.id}`}>
                        see it ↑
                      </a>
                    ) : (
                      <span className={s.offzoom}>not on the zoom</span>
                    )}
                  </td>
                  <td className={s.barCell} aria-hidden="true">
                    <span
                      style={{ '--w': Math.max(0.02, Math.log10(m.n) / 9) } as React.CSSProperties}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="platforms" className={s.section} aria-labelledby="platforms-title">
          <header className={s.head}>
            <p className={s.eyebrow}>Back to 10⁰, one at a time</p>
            <h2 id="platforms-title">Platforms</h2>
          </header>
          <div className={s.cards}>
            {featuredProjects.map((p) => (
              <article key={p.title} className={s.card}>
                <figure className={s.shot}>
                  <Image
                    src={p.image}
                    width={1280}
                    height={800}
                    alt={`${p.title} screenshot`}
                    sizes="(max-width: 900px) 92vw, 380px"
                  />
                </figure>
                <h3>{p.title}</h3>
                <p>{p.description}</p>
                <p className={s.figs}>{p.tech.join(' · ')}</p>
                <LinkRow links={p.links} />
              </article>
            ))}
          </div>
        </section>

        <section id="career" className={s.section} aria-labelledby="career-title">
          <header className={s.head}>
            <p className={s.eyebrow}>{`The ${db.yearsBuilding} marks, at full resolution`}</p>
            <h2 id="career-title">Career</h2>
          </header>
          <div className={s.about}>
            {about.map((para) => (
              <p key={para.slice(0, 32)}>{para}</p>
            ))}
          </div>
          <ol className={s.jobs}>
            {jobs.map((j) => (
              <li key={j.company}>
                <p className={s.range}>{j.range}</p>
                <div>
                  <h3>
                    {j.title} ·{' '}
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noreferrer">
                        {j.company} ↗
                      </a>
                    ) : (
                      j.company
                    )}
                  </h3>
                  <ul>
                    {j.duties.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="builds" className={s.section} aria-labelledby="builds-title">
          <header className={s.head}>
            <p className={s.eyebrow}>Smaller than a platform</p>
            <h2 id="builds-title">More builds</h2>
          </header>
          <ul className={s.builds}>
            {builds.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.description}</p>
                <p className={s.figs}>{p.tech.join(' · ')}</p>
                <LinkRow links={p.links} />
              </li>
            ))}
          </ul>
          <details className={s.archive}>
            <summary>The whole archive · {archive.length} entries</summary>
            <table className={s.archiveTable}>
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col">Title</th>
                  <th scope="col">Made at</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((a) => {
                  const link = projectLinks(a.links)[0];
                  return (
                    <tr key={a.title}>
                      <td className={s.mono}>{a.year}</td>
                      <td>
                        {link ? (
                          <a href={link.url} target="_blank" rel="noreferrer">
                            {a.title} ↗
                          </a>
                        ) : (
                          a.title
                        )}
                      </td>
                      <td className={s.dim}>{a.madeAt ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </section>

        <section id="roots" className={s.section} aria-labelledby="roots-title">
          <header className={s.head}>
            <p className={s.eyebrow}>Alongside the marks</p>
            <h2 id="roots-title">Roots</h2>
          </header>
          <ol className={s.roots}>
            {roots.map((r) => (
              <li key={r.title}>
                <p className={s.range}>{r.year}</p>
                <div>
                  <h3>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.title} ↗
                      </a>
                    ) : (
                      r.title
                    )}
                  </h3>
                  <p>{r.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="contact" className={s.contact} aria-labelledby="contact-title">
          <figure className={s.portrait}>
            <Image src={person.photo} width={600} height={600} alt={profile.name} sizes="160px" />
            <figcaption>10⁰</figcaption>
          </figure>
          <div>
            <p className={s.eyebrow}>Back to 10⁰</p>
            <h2 id="contact-title">One email away</h2>
            <p>
              {profile.role} at {profile.company}
              {`, building since ${person.since}. Tell me what you’re building: the platform, the product or the team behind it.`}
            </p>
            <a className={s.email} href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
            <ul className={s.linkRow}>
              <li>
                <a href={profile.linkedin} target="_blank" rel="noreferrer">
                  LinkedIn ↗
                </a>
              </li>
              <li>
                <a href={profile.github} target="_blank" rel="noreferrer">
                  GitHub ↗
                </a>
              </li>
              <li>
                <a href={profile.cv} target="_blank" rel="noreferrer">
                  CV (PDF) ↗
                </a>
              </li>
              <li>
                <a href="#p-one">Back to 10⁰ ↑</a>
              </li>
            </ul>
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <span>{`${conceptTitle('scale')} · a concept for ${person.site}`}</span>
        <span>After Charles and Ray Eames, 1977 · © {profile.fullName}</span>
      </footer>
    </div>
  );
}
