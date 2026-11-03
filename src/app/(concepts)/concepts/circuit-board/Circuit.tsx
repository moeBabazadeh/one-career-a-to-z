'use client';

import Image from 'next/image';
import { useId } from 'react';
import {
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
} from '../_shared/data';
import { useReducedMotion } from '../_shared/hooks';
import { projectLinks } from '../_shared/links';
import s from './circuit.module.scss';
import { concept } from '../_shared/concepts';

/* ------------------------------------------------------------------ facts */

const { person, current, commits, yearsBuilding, asOf, products } = db;
const { records } = db.devices.logger;
/** The initials the board's codes carry: "MB". */
const MB = person.name
  .split(' ')
  .map((w) => w[0])
  .join('');
/** A figure without its "+", as a part value: "0.5B". */
const bare = (f: db.Figure) => f.short.replace(/\+$/, '');
/** R1's value in ohms is the commit count: "11.8k". */
const COMMITS = bare(commits.total);
/** A four-digit resistor code: three significant digits and a power of ten, so 11,800 is 1182. */
const resistorCode = (n: number) => `${String(n).slice(0, 3)}${String(n).length - 3}`;
/** Y1's frequency is the years building: "19.000". */
const YEARS = yearsBuilding.toFixed(3);
/** The board's revision is the facts' month: "2026-10". */
const REV = fmt.iso(asOf);

/* ------------------------------------------------------------------ board geometry (640 x 560) */

type Pt = [number, number];
const path = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');

// Traces start at a pin of U1 and run out to a part, with 45-degree bends.
const TRACES: { pts: Pt[]; pulse?: number }[] = [
  {
    pts: [
      [397, 190],
      [436, 190],
      [482, 146],
    ],
    pulse: 2.2,
  },
  {
    pts: [
      [397, 204],
      [450, 204],
      [500, 154],
      [500, 146],
    ],
  },
  {
    pts: [
      [397, 260],
      [586, 260],
    ],
    pulse: 1.6,
  },
  {
    pts: [
      [397, 316],
      [420, 316],
      [456, 352],
      [456, 382],
      [464, 382],
    ],
    pulse: 2.6,
  },
  {
    pts: [
      [397, 330],
      [412, 330],
      [448, 366],
      [448, 402],
      [464, 402],
    ],
  },
  {
    pts: [
      [203, 190],
      [150, 190],
      [106, 146],
    ],
    pulse: 2.4,
  },
  {
    pts: [
      [203, 204],
      [144, 204],
      [88, 148],
      [88, 146],
    ],
  },
  {
    pts: [
      [203, 288],
      [150, 288],
      [138, 300],
      [116, 300],
    ],
    pulse: 1.9,
  },
  {
    pts: [
      [203, 330],
      [170, 330],
      [140, 360],
      [140, 420],
      [116, 420],
    ],
    pulse: 2.8,
  },
  {
    pts: [
      [286, 357],
      [286, 430],
      [256, 460],
      [256, 474],
    ],
    pulse: 2.1,
  },
  {
    pts: [
      [314, 357],
      [314, 430],
      [344, 460],
      [344, 474],
    ],
  },
  {
    pts: [
      [258, 163],
      [258, 110],
      [330, 38],
      [422, 38],
    ],
    pulse: 3,
  },
  {
    pts: [
      [300, 163],
      [300, 120],
    ],
  },
  {
    pts: [
      [314, 163],
      [314, 108],
    ],
  },
  {
    pts: [
      [328, 163],
      [328, 96],
    ],
  },
];
const VIAS: Pt[] = [
  [436, 190],
  [450, 204],
  [150, 190],
  [144, 204],
  [170, 330],
  [140, 420],
  [300, 120],
  [314, 108],
  [328, 96],
  [258, 110],
  [420, 316],
  [412, 330],
];
const PIN_OFFSETS = Array.from({ length: 11 }, (_, i) => i * 14);

function Board() {
  const reduced = useReducedMotion();
  const glow = `glow-${useId().replace(/:/g, '')}`;

  return (
    <svg
      className={s.board}
      viewBox="0 0 640 560"
      role="img"
      aria-label={`A circuit board: the main chip, U1, is ${profile.name}, ${current.title} at ${current.company}. Traces run to chips for ${products.neurobuild.title}, ${products.attendum.title} and ${products.smartclaim.title}, a GSM antenna, an LED, a crystal marked ${YEARS} for years, a resistor marked ${COMMITS} for commits and a capacitor marked ${bare(records)} for sensor records.`}
    >
      <defs>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {(
        [
          [16, 16],
          [624, 16],
          [16, 544],
          [624, 544],
        ] as Pt[]
      ).map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={10} className={s.padRing} />
          <circle cx={x} cy={y} r={5} className={s.hole} />
        </g>
      ))}

      {TRACES.map(({ pts }) => (
        <path key={pts.join()} d={path(pts)} className={s.trace} />
      ))}
      {VIAS.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={4.5} className={s.padRing} />
          <circle cx={x} cy={y} r={2} className={s.hole} />
        </g>
      ))}

      {/* U1: the main chip */}
      <text x={190} y={160} className={s.silk}>
        U1
      </text>
      {PIN_OFFSETS.map((o) => (
        <g key={o} className={s.pin}>
          <rect x={203} y={188 + o} width={12} height={5} />
          <rect x={385} y={188 + o} width={12} height={5} />
          <rect x={228 + o} y={163} width={5} height={12} />
          <rect x={228 + o} y={345} width={5} height={12} />
        </g>
      ))}
      <rect x={215} y={175} width={170} height={170} rx={3} className={s.chip} />
      <circle cx={229} cy={189} r={4} className={s.pinOne} />
      <text x={300} y={250} textAnchor="middle" className={s.chipName}>
        {profile.name.toUpperCase()}
      </text>
      <text x={300} y={270} textAnchor="middle" className={s.chipSub}>
        {`${current.title} · ${current.company}`.toUpperCase()}
      </text>
      <text
        x={300}
        y={318}
        textAnchor="middle"
        className={s.chipCode}
      >{`${MB}${person.since}-QFP44 · REV ${String(asOf.y).slice(2)}`}</text>

      {/* U2 NeuroBuild */}
      <text x={470} y={84} className={s.silk}>
        U2
      </text>
      {[482, 500, 518, 536].map((x) => (
        <g key={x} className={s.pin}>
          <rect x={x - 4} y={82} width={8} height={10} />
          <rect x={x - 4} y={136} width={8} height={10} />
        </g>
      ))}
      <rect x={470} y={92} width={90} height={44} rx={3} className={s.chip} />
      <text x={515} y={118} textAnchor="middle" className={s.partMark}>
        {products.neurobuild.title.toUpperCase()}
      </text>

      {/* U3 Attendum */}
      <text x={470} y={362} className={s.silk}>
        U3
      </text>
      {[382, 392, 402, 412, 422].map((y) => (
        <g key={y} className={s.pin}>
          <rect x={464} y={y - 2} width={6} height={4} />
          <rect x={534} y={y - 2} width={6} height={4} />
        </g>
      ))}
      <rect x={470} y={370} width={64} height={64} rx={4} className={s.chip} />
      <text x={502} y={406} textAnchor="middle" className={s.partMark}>
        {products.attendum.title.toUpperCase()}
      </text>

      {/* U4 SmartClaim */}
      <text x={40} y={84} className={s.silk}>
        U4
      </text>
      {[52, 70, 88, 106].map((x) => (
        <g key={x} className={s.pin}>
          <rect x={x - 4} y={82} width={8} height={10} />
          <rect x={x - 4} y={136} width={8} height={10} />
        </g>
      ))}
      <rect x={40} y={92} width={90} height={44} rx={3} className={s.chip} />
      <text x={85} y={118} textAnchor="middle" className={s.partMark}>
        {products.smartclaim.title.toUpperCase()}
      </text>

      {/* R1, C1: R1 carries the commit count as ohms, marked with its resistor code; C1 the sensor records */}
      <text x={58} y={284} className={s.silk}>{`R1 ${COMMITS}Ω`}</text>
      <rect x={60} y={292} width={10} height={16} className={s.padRect} />
      <rect x={106} y={292} width={10} height={16} className={s.padRect} />
      <rect x={70} y={293} width={36} height={14} className={s.resistor} />
      <text x={88} y={303.5} textAnchor="middle" className={s.resMark}>
        {resistorCode(commits.total.n)}
      </text>

      <text x={58} y={404} className={s.silk}>{`C1 ${bare(records)}`}</text>
      <rect x={60} y={412} width={10} height={16} className={s.padRect} />
      <rect x={106} y={412} width={10} height={16} className={s.padRect} />
      <rect x={70} y={413} width={36} height={14} className={s.capacitor} />

      {/* Y1: crystal */}
      <rect x={250} y={474} width={12} height={14} className={s.padRect} />
      <rect x={338} y={474} width={12} height={14} className={s.padRect} />
      <rect x={262} y={468} width={76} height={26} rx={13} className={s.crystal} />
      <text x={300} y={485} textAnchor="middle" className={s.resMark}>
        {YEARS}
      </text>
      <text x={250} y={512} className={s.silk}>{`Y1 ${YEARS}Y`}</text>

      {/* D1: power LED */}
      <text x={420} y={22} className={s.silk}>
        D1 PWR
      </text>
      <rect x={422} y={31} width={8} height={14} className={s.padRect} />
      <rect x={446} y={31} width={8} height={14} className={s.padRect} />
      <rect x={430} y={31} width={16} height={14} rx={2} className={s.led} />

      {/* J1: GSM antenna */}
      <circle cx={600} cy={260} r={14} className={s.padRing} />
      <circle cx={600} cy={260} r={6} className={s.hole} />
      <text x={582} y={292} className={s.silk}>
        J1 GSM
      </text>

      <text
        x={30}
        y={540}
        className={s.silkDim}
      >{`${MB}-${person.since} · REV ${REV} · ${yearsBuilding} YRS · 2 LAYERS · ENIG`}</text>

      {!reduced &&
        TRACES.filter((t) => t.pulse).map(({ pts, pulse }, i) => (
          <circle key={pts.join()} r={3.2} className={s.pulse} filter={`url(#${glow})`}>
            <animateMotion
              dur={`${pulse}s`}
              begin={`${(i * 0.37).toFixed(2)}s`}
              repeatCount="indefinite"
              path={path(pts)}
            />
          </circle>
        ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ page */

const BOM_STATS = [
  { ref: 'R1', value: `${COMMITS}Ω`, note: `commits since ${commits.since}` },
  { ref: 'C1', value: bare(records), note: 'sensor records logged' },
  { ref: 'Y1', value: YEARS, note: `years building, since ${person.since}` },
  { ref: `D1–D${hardware.length}`, value: String(hardware.length), note: 'devices in production' },
  { ref: `U2–U${1 + db.productsLive.n}`, value: db.productsLive.short, note: 'products live' },
];

function Zone({
  id,
  refDes,
  title,
  children,
}: {
  id: string;
  refDes: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.zone} aria-labelledby={`${id}-title`}>
      <header className={s.zoneHead}>
        <span className={s.via} aria-hidden="true" />
        <span className={s.refDes}>{refDes}</span>
        <h2 id={`${id}-title`}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

export default function Circuit() {
  return (
    <div className={s.root}>
      <header className={s.top}>
        <a href="#u1" className={s.brand}>
          <span className={s.mark} aria-hidden="true" />
          {person.site}
        </a>
        <nav aria-label="Board zones">
          <a href="#about">U1 About</a>
          <a href="#experience">J2 Experience</a>
          <a href="#platforms">U7 Platforms</a>
          <a href="#hardware">M1 Hardware</a>
          <a href="#oss">TP Open source</a>
          <a href="#contact">J5 Contact</a>
        </nav>
      </header>

      <main>
        <section id="u1" className={s.hero}>
          <div className={s.heroText}>
            <p className={s.eyebrow}>{`REF U1 · MAIN PROCESSOR · REV ${asOf.y}`}</p>
            <h1>{profile.name}</h1>
            <p className={s.role}>
              {`${current.title} at `}
              <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                {profile.company}
              </a>
            </p>
            <p
              className={s.lede}
            >{`I architect AI-driven platforms, and the boards, firmware and teams underneath them. Building since ${person.since}.`}</p>
            <div className={s.actions}>
              <a href="#platforms" className={`${s.pad} ${s.padSolid}`}>
                See the board
              </a>
              <a href={profile.cv} target="_blank" rel="noreferrer" className={s.pad}>
                CV · PDF
              </a>
            </div>
            <table className={s.bom}>
              <caption>BILL OF MATERIALS</caption>
              <tbody>
                {BOM_STATS.map((b) => (
                  <tr key={b.ref}>
                    <th scope="row">{b.ref}</th>
                    <td className={s.bomValue}>{b.value}</td>
                    <td>{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Board />
        </section>

        <Zone id="about" refDes="U1" title="About">
          <div className={s.about}>
            <div className={s.prose}>
              {about.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <figure className={s.camera}>
              <Image src={person.photo} width={600} height={600} alt={profile.name} />
              <figcaption>{`CAM1 · OV-${MB}${asOf.y}`}</figcaption>
            </figure>
          </div>
          <div className={s.tableWrap}>
            <table className={s.parts}>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Value</th>
                  <th>Footprint</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((k, i) => (
                  <tr key={k}>
                    <td>U{i + 20}</td>
                    <td>{k}</td>
                    <td>{i < 4 ? 'daily driver' : 'production'}</td>
                    <td>1</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Zone>

        <Zone id="experience" refDes="J2" title="Experience">
          <ol className={s.header}>
            {jobs.map((job, i) => (
              <li key={job.company}>
                <span className={s.pinPad} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={s.pinTrace} aria-hidden="true" />
                <article className={s.slot}>
                  <p className={s.slotRange}>{job.range}</p>
                  <h3>
                    {job.title} ·{' '}
                    {job.url ? (
                      <a href={job.url} target="_blank" rel="noreferrer">
                        {job.company}
                      </a>
                    ) : (
                      job.company
                    )}
                  </h3>
                  <ul>
                    {job.duties.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ol>
          <h3 className={s.subhead}>GND · WHERE IT STARTED</h3>
          <ul className={s.roots}>
            {roots.map((r) => (
              <li key={r.title}>
                <span>{r.year}</span>
                <b>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                  ) : (
                    r.title
                  )}
                </b>
                <small>{r.detail}</small>
              </li>
            ))}
          </ul>
        </Zone>

        <Zone id="platforms" refDes={`U7–U${6 + featuredProjects.length}`} title="Platforms">
          <div className={s.ics}>
            {featuredProjects.map((p, i) => (
              <article key={p.title} className={s.ic}>
                <span className={s.icRef}>U{i + 7}</span>
                <div className={s.icBody}>
                  <div className={s.die}>
                    <Image src={p.image} width={1280} height={800} alt={p.title} />
                  </div>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                  <p className={s.marking}>{p.tech.join(' · ')}</p>
                  <div className={s.links}>
                    {projectLinks(p.links).map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                        {l.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <h3 className={s.subhead}>PASSIVES · OTHER WORK</h3>
          <ul className={s.passives}>
            {otherProjects.map((p, i) => (
              <li key={p.title}>
                <span className={s.passiveRef}>R{i + 12}</span>
                <b>{p.title}</b>
                <p>{p.description}</p>
                <span className={s.links}>
                  {projectLinks(p.links).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                      {l.label} ↗
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Zone>

        <Zone id="hardware" refDes={`M1–M${hardware.length}`} title="Hardware">
          <p
            className={s.zoneLede}
          >{`${fmt.Spell(hardware.length)} devices in production. These are the boards that ship.`}</p>
          <div className={s.modules}>
            {hardware.map((d) => (
              <article key={d.tag} className={s.module}>
                <header>
                  <span>{d.tag}</span>
                  <span className={s.moduleStatus}>● IN PRODUCTION</span>
                </header>
                <h3>{d.name}</h3>
                <p className={s.moduleKind}>{d.kind}</p>
                <p>{d.detail}</p>
                <ul>
                  {d.figures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Zone>

        <Zone id="oss" refDes={`TP1–TP${oss.length}`} title="Open source">
          <p
            className={s.zoneLede}
          >{`Test points on other people’s boards: fixes merged upstream into packages downloaded ${db.downloads.weekly.short} times a week.`}</p>
          <ol className={s.testPoints}>
            {oss.map((c, i) => (
              <li key={c.repo}>
                <span className={s.tp} aria-hidden="true" />
                <span className={s.tpRef}>TP{i + 1}</span>
                <div>
                  <h3>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.repo}
                    </a>
                  </h3>
                  <p>
                    {c.change} {c.impact}
                  </p>
                </div>
                <div className={s.reading}>
                  <b>★ {c.stars}</b>
                  <span>{c.weekly}/wk</span>
                  <span className={`${s.kind} ${c.kind === 'Security' ? s.kindHot : ''}`}>
                    {c.kind}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Zone>

        <Zone id="contact" refDes="J5" title="Contact">
          <div className={s.contact}>
            <div className={s.usb} aria-hidden="true">
              <span />
            </div>
            <div>
              <p className={s.contactLede}>
                Plug in. Write about a platform, a device or a team that needs building.
              </p>
              <a className={s.email} href={`mailto:${profile.email}`}>
                {profile.email}
              </a>
              <div className={s.links}>
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
          </div>
        </Zone>
      </main>

      <footer className={s.footer}>
        <span>{`${MB}-${person.since} · REV ${REV} · CONCEPT ${concept('circuit-board').letter}`}</span>
        <span>
          2 LAYERS · ENIG · <span className={s.maskBlack}>MATTE BLACK</span>
          <span className={s.maskWhite}>MATTE WHITE</span>
        </span>
      </footer>
    </div>
  );
}
