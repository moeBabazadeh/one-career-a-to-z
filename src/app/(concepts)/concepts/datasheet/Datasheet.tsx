import Image from 'next/image';
import {
  about,
  db,
  featuredProjects,
  fmt,
  otherProjects,
  profile,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import {
  ABS_MAX,
  DEVICES,
  DOC_LINE,
  ELECTRICAL,
  ERRATA,
  FEEDBACK,
  fileOf,
  GLOSSARY,
  LIFETIME,
  min,
  ORDERING,
  OVERLAP,
  PAGES,
  PART,
  PROMOTION,
  REC_OP,
  REVISIONS,
  ROOTS,
  SPANS,
  TOC,
  years,
  type SpecRow,
} from './content';
import {
  ApplicationSchematic,
  BlockDiagram,
  ESDIcon,
  Icon,
  PackageOutline,
  PowerUp,
  TimingDiagram,
} from './Figures';
import Live from './Live';
import Pinout from './Pinout';
import TypicalCharacteristics from './Plots';
import Viewer from './Viewer';
import s from './datasheet.module.scss';
import { concept } from '../_shared/concepts';

const { asOf, person, current, commits, titleOf } = db;
const { neuroject, neuroship } = db.roles;
const { bsc, msc } = db.education;
const { robocup } = db.awards;
const { logger, attendumReader: reader, attendumBeacon: beacon } = db.devices;
const paper = db.papers.inverter;
const [siteName, siteTld] = person.site.split('.');

/* ------------------------------------------------------------------ page furniture */

function Sheet({ n, children }: { n: number; children: React.ReactNode }) {
  const odd = n % 2 === 1;
  return (
    <article
      id={`page-${n}`}
      data-page={n}
      className={`${s.page} ${n === 1 ? s.first : ''}`}
      aria-label={`Page ${n} of ${PAGES.length}`}
    >
      {n > 1 && (
        <header className={`${s.runHead} ${odd ? s.odd : ''}`}>
          <span>
            <b>{PART}</b>
            <br />
            {DOC_LINE}
          </span>
          <a href="#page-1">www.{person.site}</a>
        </header>
      )}
      <div className={s.pageBody}>{children}</div>
      <footer className={`${s.runFoot} ${odd ? '' : s.even}`}>
        <a href={FEEDBACK}>Submit Document Feedback</a>
        <span>
          Copyright © {person.since}–{asOf.y}, {profile.name}
          <br />
          <span className={s.folderLinks}>Product Folder Links: {PART}</span>
        </span>
        <b className={s.pageNum}>{n}</b>
      </footer>
    </article>
  );
}

const H2 = ({ id, no, children }: { id?: string; no: string; children: React.ReactNode }) => (
  <h2 id={id} className={s.h2}>
    <span>{no}</span> {children}
  </h2>
);

const H3 = ({ id, no, children }: { id?: string; no: string; children: React.ReactNode }) => (
  <h3 id={id} className={s.h3}>
    <span>{no}</span> {children}
  </h3>
);

const ext = { target: '_blank', rel: 'noreferrer' } as const;
const Sym = ({ sym }: { sym: string }) => {
  const [a, b] = sym.split('_');
  return b ? (
    <i className={s.sym}>
      {a}
      <sub>{b}</sub>
    </i>
  ) : (
    <i className={s.sym}>{a}</i>
  );
};

function SpecTable({
  no,
  title,
  rows,
  cond = true,
  nom = false,
  words = false,
  foot,
}: {
  no: string;
  title: string;
  rows: { group?: string; rows: SpecRow[] }[];
  cond?: boolean;
  nom?: boolean;
  words?: boolean;
  foot?: React.ReactNode;
}) {
  let r = 0;
  return (
    <Live className={s.tableWrap}>
      <table className={`${s.table} ${s.spec} ${words ? s.words : ''}`}>
        <caption>
          <b>Table {no}.</b> {title}
        </caption>
        <thead>
          <tr>
            <th scope="col" colSpan={2}>
              Parameter
            </th>
            {cond && (
              <th scope="col" className={s.condCol}>
                Test conditions
              </th>
            )}
            <th scope="col" className={s.num}>
              Min
            </th>
            <th scope="col" className={s.num}>
              {nom ? 'Nom' : 'Typ'}
            </th>
            <th scope="col" className={s.num}>
              Max
            </th>
            <th scope="col">Unit</th>
          </tr>
        </thead>
        {rows.map((g) => (
          <tbody key={g.group ?? 'all'}>
            {g.group && (
              <tr className={s.groupRow}>
                <th scope="rowgroup" colSpan={cond ? 7 : 6}>
                  {g.group}
                </th>
              </tr>
            )}
            {g.rows.map((row) => (
              <tr key={row.sym} style={{ '--r': r++ } as React.CSSProperties}>
                <td className={s.symCell}>
                  <Sym sym={row.sym} />
                </td>
                <td>
                  {row.param}
                  {cond && row.cond && <span className={s.condInline}>{row.cond}</span>}
                </td>
                {cond && <td className={`${s.cond} ${s.condCol}`}>{row.cond ?? ''}</td>}
                <td className={s.num}>{row.min ?? ''}</td>
                <td className={s.num}>{row.typ ?? ''}</td>
                <td className={s.num}>{row.max ?? ''}</td>
                <td className={s.unit}>{row.unit}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {foot && <div className={s.footnote}>{foot}</div>}
    </Live>
  );
}

const LinkList = ({ links }: { links: ReturnType<typeof projectLinks> }) => (
  <span className={s.links}>
    {links.map((l) => (
      <a key={l.url} href={l.url} {...ext}>
        {l.label} ↗
      </a>
    ))}
  </span>
);

/* ------------------------------------------------------------------ the data sheet */

const FOLDER = [
  { label: 'Product Folder', href: '#application', icon: Icon.folder },
  { label: 'Order Now', href: '#ordering', icon: Icon.cart },
  { label: 'Technical Documents', href: profile.cv, icon: Icon.doc },
  { label: 'Tools & Software', href: profile.github, icon: Icon.tool },
  { label: 'Support & Community', href: profile.linkedin, icon: Icon.people },
];

const stat = (label: string) => stats.find((x) => x.label.startsWith(label))?.value ?? '';

export default function Datasheet() {
  return (
    <Viewer>
      {/* ---------------------------------------------------------- page 1 */}
      <Sheet n={1}>
        <div className={s.titleHead}>
          <a className={s.brand} href="#page-1" aria-label={person.site}>
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <rect x={5} y={5} width={18} height={18} rx={2} />
              <path d="M9 1v4M14 1v4M19 1v4M9 23v4M14 23v4M19 23v4M1 9h4M1 14h4M1 19h4M23 9h4M23 14h4M23 19h4" />
              <circle cx={9} cy={9} r={1.6} />
            </svg>
            <span>
              <b>{siteName}</b>.{siteTld}
            </span>
          </a>
          <nav className={s.folder} aria-label="Product links">
            {FOLDER.map((f) => (
              <a key={f.label} href={f.href} {...(f.href.startsWith('#') ? {} : ext)}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  {f.icon}
                </svg>
                {f.label}
              </a>
            ))}
          </nav>
        </div>
        <div className={s.partLine}>
          <span className={s.partNo}>{PART}</span>
          <span className={s.docLine}>{DOC_LINE}</span>
        </div>
        <h1 className={s.h1}>
          <span className={s.h1Part}>{PART}</span> <span className={s.h1Name}>{profile.name}:</span>{' '}
          Sensor-to-AI Engineering Leader With Integrated Firmware, Platform and AI Cores
        </h1>

        <div className={s.cols3}>
          <section aria-labelledby="features">
            <H2 id="features" no="1">
              Features
            </H2>
            <ul className={s.bullets}>
              <li>
                Building since {person.since}: robots, IoT and firmware, then web, mobile and AI
                platforms
              </li>
              <li>
                {current.title} at{' '}
                <a href={profile.companyUrl} {...ext}>
                  {current.company}
                </a>
                , {current.pitch}
              </li>
              <li>
                Wide stack range, firmware to AI:
                <ul>
                  <li>
                    Embedded C on {reader.chip}, {beacon.chip} and STM microcontrollers
                  </li>
                  <li>TypeScript, React &amp; Next.js, Laravel (PHP)</li>
                  <li>Python &amp; FastAPI, OpenAI, pgvector</li>
                  <li>React Native &amp; Expo, AWS, PostgreSQL &amp; MySQL</li>
                </ul>
              </li>
              <li>
                {stat('commits')} commits since {commits.since}
              </li>
              <li>
                {stat('products')} products live, {stat('apps')} apps on the App Store and Google
                Play
              </li>
              <li>
                {stat('devices')} devices in production, {stat('sensor')} sensor records logged
              </li>
              <li>Fixes upstream in packages with {stat('weekly')} weekly downloads</li>
              <li>
                {robocup.place}, {robocup.event} {robocup.year}
              </li>
              <li>Available in 32-pin VQFN and 600 × 600 px portrait packages</li>
            </ul>
          </section>
          <section aria-labelledby="applications">
            <H2 id="applications" no="2">
              Applications
            </H2>
            <ul className={s.bullets}>
              <li>
                Construction enterprise platforms: BIM, WBS, quantity take-off, tenders and 4D
                progress
              </li>
              <li>AI for project data and early risk warning</li>
              <li>AI-assisted R&amp;D tax credit claims</li>
              <li>IoT telemetry and GSM data logging</li>
              <li>Attendance monitoring over NFC, RFID and BLE</li>
              <li>LMS and live exam proctoring</li>
              <li>Pressure and flow control, compact PLCs</li>
              <li>Technical leadership: architecture, roadmap and delivery</li>
            </ul>
            <figure className={s.portrait}>
              <Image src={person.photo} width={600} height={600} alt={profile.name} priority />
              <figcaption>{PART}, actual size</figcaption>
            </figure>
          </section>
          <section aria-labelledby="description">
            <H2 id="description" no="3">
              Description
            </H2>
            <p>
              The {PART} is an engineering leader that integrates firmware, platform and AI cores in
              a single package. It has been in continuous operation since {person.since}: robots,
              IoT and firmware first, then web, mobile and AI platforms.
            </p>
            <p>
              The device is deployed as {current.title} at {current.company}, where it leads the
              architecture, roadmap and delivery of a cloud-native, multi-tenant platform that
              connects BIM, schedules, budgets and risks into traceable decisions, and brings AI
              into it. Since {fmt.month(neuroship.from)} it also runs a contract channel as{' '}
              {titleOf(neuroship)} at {neuroship.org}.
            </p>
            <div className={s.tableWrap}>
              <table className={`${s.table} ${s.devInfo}`}>
                <caption>
                  <b>Device Information</b>
                  <sup>(1)</sup>
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Part number</th>
                    <th scope="col">Package</th>
                    <th scope="col">Body size (nom)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td rowSpan={2} className={s.devPart}>
                      {PART}
                    </td>
                    <td>VQFN (32)</td>
                    <td>
                      {LIFETIME} yr × {LIFETIME} yr
                    </td>
                  </tr>
                  <tr>
                    <td>Portrait</td>
                    <td>600 px × 600 px</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={s.footnote}>
              (1) For all available packages, see the <a href="#ordering">orderable addendum</a> at
              the end of the data sheet.
            </p>
          </section>
        </div>

        <figure className={s.figure}>
          <BlockDiagram />
          <figcaption>Functional Block Diagram</figcaption>
        </figure>
      </Sheet>

      {/* ---------------------------------------------------------- page 2 */}
      <Sheet n={2}>
        <h2 className={s.h2Plain}>Table of Contents</h2>
        <ol className={s.toc}>
          {TOC.map(([no, title, id, page]) => (
            <li key={no} className={no.includes('.') ? s.tocSub : undefined}>
              <a href={`#${id}`}>
                <span>{no}</span> {title}
                <i aria-hidden="true" />
                <b>{page}</b>
              </a>
            </li>
          ))}
        </ol>

        <H2 id="revisions" no="4">
          Revision History
        </H2>
        <p className={s.note}>
          <b>NOTE:</b> Page numbers for previous revisions may differ from page numbers in the
          current version.
        </p>
        {REVISIONS.map((rev, i) => {
          const prev = REVISIONS[i + 1];
          return (
            <section key={rev.rev} className={s.revision}>
              <h3 className={s.revHead}>
                {prev ? (
                  <>
                    Changes from {prev.rev === '*' ? 'Original' : `Revision ${prev.rev}`} (
                    {prev.date}) to Revision {rev.rev} ({rev.date})
                  </>
                ) : (
                  <>Original Release ({rev.date})</>
                )}
                <span>Page</span>
              </h3>
              <ul className={s.revList}>
                <li className={s.revChange}>
                  <span>{rev.change}</span>
                  <i aria-hidden="true" />
                  <a href={`#page-${rev.bullets[0][1]}`}>{rev.bullets[0][1]}</a>
                </li>
                {rev.bullets.map(([text, page]) => (
                  <li key={text}>
                    <span>{text}</span>
                    <i aria-hidden="true" />
                    <a href={`#page-${page}`} aria-label={`page ${page}`}>
                      {page}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Sheet>

      {/* ---------------------------------------------------------- page 3 */}
      <Sheet n={3}>
        <H2 id="pins" no="5">
          Pin Configuration and Functions
        </H2>
        <p className={s.lede}>
          Each pin is an interface the {PART} has shipped through. Probe one to read its function,
          or decap the package to see the block it is bonded to on the die.
        </p>
        <Pinout />
      </Sheet>

      {/* ---------------------------------------------------------- page 4 */}
      <Sheet n={4}>
        <H2 id="specs" no="6">
          Specifications
        </H2>
        <H3 no="6.1">Absolute Maximum Ratings</H3>
        <p className={s.cond}>
          Over the operating period, {person.since} to {asOf.y} (unless otherwise noted)
          <sup>(1)</sup>
        </p>
        <SpecTable
          no="6-1"
          title="Absolute Maximum Ratings"
          rows={[{ rows: ABS_MAX }]}
          foot={
            <>
              (1) Stresses beyond those listed under Absolute Maximum Ratings have not been
              characterized. These are the highest values the device has been operated at, which
              does not imply that it cannot go further.
            </>
          }
        />
        <H3 no="6.2">Recommended Operating Conditions</H3>
        <SpecTable
          no="6-2"
          title="Recommended Operating Conditions"
          rows={[{ rows: REC_OP }]}
          cond={false}
          nom
          words
        />
        <H3 no="6.3">Electrical Characteristics</H3>
        <p className={s.cond}>
          T = {fmt.month(asOf)} (unless otherwise noted). Lower bounds are listed as MIN:{' '}
          {commits.total.short} reads as MIN {min(commits.total)}.
        </p>
        <SpecTable no="6-3" title="Electrical Characteristics" rows={ELECTRICAL} />
      </Sheet>

      {/* ---------------------------------------------------------- page 5 */}
      <Sheet n={5}>
        <H3 id="timing" no="6.4">
          Timing Requirements
        </H3>
        <p className={s.cond}>
          Durations from the first month of each role. Roles still running are listed as MIN.
        </p>
        <Live className={s.tableWrap}>
          <table className={`${s.table} ${s.spec}`}>
            <caption>
              <b>Table 6-4.</b> Timing Requirements
            </caption>
            <thead>
              <tr>
                <th scope="col" colSpan={2}>
                  Parameter
                </th>
                <th scope="col" className={s.condCol}>
                  Conditions
                </th>
                <th scope="col" className={s.num}>
                  Min
                </th>
                <th scope="col" className={s.num}>
                  Nom
                </th>
                <th scope="col" className={s.num}>
                  Max
                </th>
                <th scope="col">Unit</th>
              </tr>
            </thead>
            <tbody>
              {SPANS.map((sp, i) => (
                <tr key={sp.org} style={{ '--r': i } as React.CSSProperties}>
                  <td className={s.symCell}>
                    <Sym sym={sp.sym} />
                  </td>
                  <td>
                    {sp.title}, {sp.org}
                    <span className={s.condInline}>{sp.range}</span>
                  </td>
                  <td className={`${s.cond} ${s.condCol}`}>{sp.range}</td>
                  <td className={s.num}>{sp.open ? years(sp.end - sp.start) : ''}</td>
                  <td className={s.num}>{sp.open ? '' : years(sp.end - sp.start)}</td>
                  <td className={s.num} />
                  <td className={s.unit}>yr</td>
                </tr>
              ))}
              <tr style={{ '--r': SPANS.length } as React.CSSProperties}>
                <td className={s.symCell}>
                  <Sym sym={OVERLAP.sym} />
                </td>
                <td>
                  {OVERLAP.label}
                  <span className={s.condInline}>{OVERLAP.range}</span>
                </td>
                <td className={`${s.cond} ${s.condCol}`}>{OVERLAP.range}</td>
                <td className={s.num} />
                <td className={s.num}>{years(OVERLAP.to - OVERLAP.from)}</td>
                <td className={s.num} />
                <td className={s.unit}>yr</td>
              </tr>
              <tr style={{ '--r': SPANS.length + 1 } as React.CSSProperties}>
                <td className={s.symCell}>
                  <Sym sym={PROMOTION.sym} />
                </td>
                <td>
                  {PROMOTION.label}
                  <span className={s.condInline}>{PROMOTION.range}</span>
                </td>
                <td className={`${s.cond} ${s.condCol}`}>{PROMOTION.range}</td>
                <td className={s.num} />
                <td className={s.num}>{years(PROMOTION.to - PROMOTION.from)}</td>
                <td className={s.num} />
                <td className={s.unit}>yr</td>
              </tr>
            </tbody>
          </table>
        </Live>
        <figure className={s.figure}>
          <TimingDiagram />
          <figcaption>
            <b>Figure 6-1.</b> Role Timing Diagram
          </figcaption>
        </figure>
      </Sheet>

      {/* ---------------------------------------------------------- page 6 */}
      <Sheet n={6}>
        <H3 id="typical" no="6.5">
          Typical Characteristics
        </H3>
        <p className={s.cond}>T = {fmt.month(asOf)} (unless otherwise noted)</p>
        <TypicalCharacteristics />
      </Sheet>

      {/* ---------------------------------------------------------- page 7 */}
      <Sheet n={7}>
        <H2 id="detailed" no="7">
          Detailed Description
        </H2>
        <H3 no="7.1">Overview</H3>
        {about.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
        <H3 no="7.2">Functional Block Diagram</H3>
        <p>
          See the <a href="#page-1">Functional Block Diagram</a> on page 1, and the die floorplan in{' '}
          <a href="#pins">Figure 5-1</a> (decap view).
        </p>
        <H3 no="7.3">Feature Description: Devices in Production</H3>
        <p>
          {fmt.Spell(DEVICES.length)} devices in the field, from GSM weather stations that have
          logged for {logger.online.long} years to a beacon updated over the air.
        </p>
        <Live className={s.tableWrap}>
          <table className={`${s.table} ${s.devices}`}>
            <caption>
              <b>Table 7-1.</b> Devices in Production
            </caption>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Device</th>
                <th scope="col">Description</th>
                <th scope="col">Figures</th>
              </tr>
            </thead>
            <tbody>
              {DEVICES.map((d, i) => (
                <tr key={d.tag} style={{ '--r': i } as React.CSSProperties}>
                  <td className={s.mono}>{d.tag}</td>
                  <td>
                    <b>{d.name}</b>
                    <br />
                    <span className={s.cond}>{d.kind}</span>
                  </td>
                  <td>{d.detail}</td>
                  <td className={s.mono}>
                    {d.figures.map((f) => (
                      <span key={f} className={s.figTag}>
                        {f}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Live>
        <H3 no="7.4">Device Functional Modes</H3>
        <dl className={s.modes}>
          <div>
            <dt>
              {current.title} mode, {current.company} (default since {fmt.month(current.since)})
            </dt>
            <dd>
              Architecture, roadmap and delivery of {db.products.neurobuild.title}, and AI inside
              it: natural-language access to project data, and early warning on schedule and cost
              risk.
            </dd>
          </div>
          <div>
            <dt>
              Contract mode, {neuroship.org} (since {fmt.month(neuroship.from)})
            </dt>
            <dd>
              {titleOf(neuroship)} on contract, alongside {neuroject.org}.
            </dd>
          </div>
        </dl>
        <H3 no="7.5">Programming</H3>
        <p>The {PART} is programmed in:</p>
        <ul className={s.chips}>
          {skills.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      </Sheet>

      {/* ---------------------------------------------------------- page 8 */}
      <Sheet n={8}>
        <H2 id="application" no="8">
          Application and Implementation
        </H2>
        <H3 no="8.1">Application Information</H3>
        <p>
          The {PART} is typically deployed as the technical lead of a product platform, from
          firmware on the device to the AI that reads its data. Figure 8-1 shows it driving five
          platforms, with hardware on its firmware pins. Parts and connectors in the schematic link
          to the live products and store listings.
        </p>
        <H3 no="8.2">Typical Application</H3>
        <figure className={s.figure}>
          <ApplicationSchematic />
          <figcaption>
            <b>Figure 8-1.</b> Typical Application Schematic
          </figcaption>
        </figure>
        <H3 no="8.2.1">Evaluation Modules</H3>
        <div className={s.evms}>
          {featuredProjects.map((p, i) => (
            <article key={p.title} className={s.evm}>
              <div className={s.evmShot}>
                <Image src={p.image} width={1280} height={800} alt={`${p.title} screenshot`} />
              </div>
              <h4>
                {p.title}{' '}
                <span className={s.evmPart}>
                  {PART}EVM-{p.title.toUpperCase().replace(/[^A-Z]/g, '')}
                </span>
              </h4>
              <p>{p.description}</p>
              <p className={s.stack}>{p.tech.join(' · ')}</p>
              {projectLinks(p.links).length > 0 ? (
                <LinkList links={projectLinks(p.links)} />
              ) : (
                <span className={s.cond}>In production; no public site.</span>
              )}
              <p className={s.evmCap}>
                <b>Figure 8-{i + 2}.</b> {p.title} evaluation module
              </p>
            </article>
          ))}
        </div>
      </Sheet>

      {/* ---------------------------------------------------------- page 9 */}
      <Sheet n={9}>
        <H3 no="8.3">Other Applications</H3>
        <Live className={s.tableWrap}>
          <table className={`${s.table} ${s.others}`}>
            <caption>
              <b>Table 8-1.</b> Other Applications
            </caption>
            <thead>
              <tr>
                <th scope="col">Application</th>
                <th scope="col">Description</th>
                <th scope="col">Stack</th>
                <th scope="col">Links</th>
              </tr>
            </thead>
            <tbody>
              {otherProjects.map((p, i) => (
                <tr key={p.title} style={{ '--r': i } as React.CSSProperties}>
                  <td>
                    <b>{p.title}</b>
                  </td>
                  <td>{p.description}</td>
                  <td className={s.cond}>{p.tech.join(', ')}</td>
                  <td>
                    <LinkList links={projectLinks(p.links)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Live>

        <H2 id="power" no="9">
          Power Supply Recommendations
        </H2>
        <p>
          The {PART} was brought up on electrical engineering and robotics. Each rail ramped up over
          the years shown and is still up: the control-systems training runs every feedback loop in
          the device.
        </p>
        <figure className={s.figure}>
          <PowerUp />
          <figcaption>
            <b>Figure 9-1.</b> Power-Up Sequence
          </figcaption>
        </figure>
        <Live className={s.tableWrap}>
          <table className={`${s.table} ${s.roots}`}>
            <caption>
              <b>Table 9-1.</b> Supply Rails
            </caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Rail</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {ROOTS.map((r, i) => (
                <tr key={r.title} style={{ '--r': i } as React.CSSProperties}>
                  <td className={s.mono}>{r.year}</td>
                  <td>
                    <b>
                      {r.url ? (
                        <a href={r.url} {...ext}>
                          {r.title} ↗
                        </a>
                      ) : (
                        r.title
                      )}
                    </b>
                  </td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Live>
      </Sheet>

      {/* ---------------------------------------------------------- page 10 */}
      <Sheet n={10}>
        <H2 id="support" no="10">
          Device and Documentation Support
        </H2>
        <H3 no="10.1">Related Documentation</H3>
        <ul className={s.bullets}>
          <li>
            <i>{paper.title}</i>. {paper.venue}, {paper.date.y}.{' '}
            <a href={paper.url} {...ext}>
              {paper.venue}:{paper.id} ↗
            </a>
          </li>
          <li>
            {profile.fullName}, <i>Résumé</i>.{' '}
            <a href={profile.cv} {...ext}>
              {fileOf(profile.cv)} ↗
            </a>
          </li>
        </ul>

        <H3 id="errata" no="10.2">
          Errata: Fixes Upstream
        </H3>
        <p>
          Faults found in other people’s parts and fixed at the source, in packages downloaded{' '}
          {db.downloads.weekly.long} times a week. Each advisory links to its pull request.
        </p>
        <Live className={s.tableWrap}>
          <table className={`${s.table} ${s.errata}`}>
            <caption>
              <b>Table 10-1.</b> Advisory List
            </caption>
            <thead>
              <tr>
                <th scope="col">Advisory</th>
                <th scope="col">Part</th>
                <th scope="col">Symptom</th>
                <th scope="col">Fix</th>
                <th scope="col">Reach</th>
              </tr>
            </thead>
            <tbody>
              {ERRATA.map((e, i) => (
                <tr key={e.id} style={{ '--r': i } as React.CSSProperties}>
                  <td className={s.mono}>
                    {e.id}
                    <br />
                    <span className={`${s.kind} ${e.kind === 'Security' ? s.kindHot : ''}`}>
                      {e.kind}
                    </span>
                  </td>
                  <td>
                    <a href={e.url} {...ext}>
                      <b>{e.repo}</b>
                    </a>
                    <br />
                    <span className={s.cond}>
                      {e.year} · PR #{e.pr}
                    </span>
                  </td>
                  <td>{e.impact}</td>
                  <td>{e.change}</td>
                  <td className={s.mono}>
                    ★ {e.stars}
                    <br />
                    {e.weekly}/wk
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Live>

        <H3 no="10.3">Community Resources</H3>
        <p>
          Code lives on{' '}
          <a href={profile.github} {...ext}>
            GitHub ↗
          </a>
          ; the career, on{' '}
          <a href={profile.linkedin} {...ext}>
            LinkedIn ↗
          </a>
          .
        </p>
        <H3 no="10.4">Trademarks</H3>
        <p>
          App Store, Google Play, AWS, Autodesk and all other trademarks are the property of their
          respective owners.
        </p>
        <H3 no="10.5">Electrostatic Discharge Caution</H3>
        <div className={s.esdNote}>
          <ESDIcon />
          <p>
            This device has been in continuous operation since {person.since}. Handle it like any
            long-running system: with monitoring, audit trails and a permission check on every
            route.
          </p>
        </div>
        <H3 no="10.6">Glossary</H3>
        <dl className={s.glossary}>
          {GLOSSARY.map(([term, def]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{def}</dd>
            </div>
          ))}
        </dl>
      </Sheet>

      {/* ---------------------------------------------------------- page 11 */}
      <Sheet n={11}>
        <H2 id="ordering" no="11">
          Mechanical, Packaging, and Orderable Information
        </H2>
        <p>
          The following pages include mechanical, packaging, and orderable information. This
          information is the most current data available for the designated device.
        </p>
        <H3 no="11.1">Package Option Addendum</H3>
        <Live className={s.tableWrap}>
          <table className={`${s.table} ${s.ordering}`}>
            <caption>
              <b>Table 11-1.</b> Orderable Devices
            </caption>
            <thead>
              <tr>
                <th scope="col">Orderable device</th>
                <th scope="col">
                  Status<sup>(1)</sup>
                </th>
                <th scope="col">Channel</th>
                <th scope="col">Package qty</th>
                <th scope="col">Order</th>
              </tr>
            </thead>
            <tbody>
              {ORDERING.map((o, i) => (
                <tr key={o.part} style={{ '--r': i } as React.CSSProperties}>
                  <td className={s.mono}>{o.part}</td>
                  <td>
                    <span className={s.active}>ACTIVE</span>
                  </td>
                  <td>{o.channel}</td>
                  <td className={s.mono}>1</td>
                  <td>
                    <a href={o.href} {...(o.href.startsWith('mailto') ? {} : ext)}>
                      {o.label} {o.href.startsWith('mailto') ? '' : '↗'}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={s.footnote}>(1) ACTIVE: Product device recommended for new designs.</p>
        </Live>
        <div className={s.order}>
          <div>
            <p className={s.orderHead}>Order now</p>
            <p>Write about a platform, a device or a team that needs building.</p>
          </div>
          <a href={`mailto:${profile.email}`} className={s.orderButton}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              {Icon.cart}
            </svg>
            {profile.email}
          </a>
        </div>

        <H3 no="11.2">Package Outline</H3>
        <figure className={s.figure}>
          <div className={s.scrollFig}>
            <PackageOutline />
          </div>
          <figcaption>
            <b>Figure 11-1.</b> RGZ0032A VQFN Package Outline
          </figcaption>
        </figure>
        <ol className={s.mechNotes}>
          <li>
            All linear dimensions are in years. Dimensions in parentheses are for reference only.
          </li>
          <li>This drawing is subject to change without notice.</li>
          <li>
            The exposed thermal pad is soldered to {neuroject.org}, where the die has been attached
            since {fmt.month(neuroject.from)}.
          </li>
        </ol>

        <aside className={s.notice} aria-labelledby="notice">
          <h2 id="notice">Important Notice and Disclaimer</h2>
          <p>
            The figures in this data sheet are facts from {profile.name}’s career: roles, dates,
            products, devices, records and fixes. MIN columns hold lower bounds and TYP columns hold
            approximate values. Figures 6-4 to 6-7 are simulations of the topics of his {bsc.degree}{' '}
            thesis, his {paper.date.y} paper and his {msc.degree} thesis, not measurements. The pin,
            die and package drawings are illustrative.
          </p>
          <p>
            Concept {concept('datasheet').letter} of the {person.site} redesign. Printing is
            supported: use the print button in the toolbar for a paper copy.
          </p>
        </aside>
      </Sheet>
    </Viewer>
  );
}
