import Image from 'next/image';
import {
  NOW,
  about,
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
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import Controller from './Controller';
import { PLATE, clock, estimate, ncFile } from './gcode';
import { OpSim, PostOutput, SetupTree, type TreeItem } from './Live';
import { opById } from './ops';
import s from './toolpath.module.scss';
import { concept } from '../_shared/concepts';

/* ------------------------------------------------------------------ tool magazine */

type Kind = 'flat' | 'ball' | 'bull' | 'chamfer' | 'face' | 'vbit' | 'drill' | 'thread';

// One cutter per skill, in the order data.ts lists them. The geometry is the metaphor's, not a claim.
const RACK: { kind: Kind; spec: string }[] = [
  { kind: 'flat', spec: 'Flat end mill Ø6 · 3 flute' },
  { kind: 'ball', spec: 'Ball end mill Ø6' },
  { kind: 'bull', spec: 'Bull nose Ø8 R1' },
  { kind: 'chamfer', spec: 'Chamfer mill 90°' },
  { kind: 'face', spec: 'Face mill Ø40 · 5 inserts' },
  { kind: 'vbit', spec: 'V-bit 60°' },
  { kind: 'drill', spec: 'Carbide drill Ø0.8' },
  { kind: 'thread', spec: 'Thread mill M6' },
];

const CUTTER: Record<Kind, { body: string; flutes?: [number, number] }> = {
  flat: { body: 'M26 89 H34 V190 H26 Z', flutes: [134, 190] },
  ball: { body: 'M26 89 H34 V186 A4 4 0 0 1 26 186 Z', flutes: [134, 190] },
  bull: { body: 'M25 89 H35 V186.5 Q35 190 31.5 190 H28.5 Q25 190 25 186.5 Z', flutes: [132, 190] },
  chamfer: { body: 'M26 89 H34 V150 L42 160 L30 172 L18 160 L26 150 Z', flutes: [150, 172] },
  face: { body: 'M23 89 H37 V168 H54 V186 H6 V168 H23 Z' },
  vbit: { body: 'M27 89 H33 V168 L38 174 L30 190 L22 174 L27 168 Z', flutes: [168, 190] },
  drill: { body: 'M28 89 H32 V186 L30 188.5 L28 186 Z', flutes: [118, 188] },
  thread: {
    body: 'M26 89 H34 V160 H37 V163 H34 V166 H37 V169 H34 V172 H37 V175 H34 V178 H37 V181 H34 V184 H37 V187 H23 V184 H26 V181 H23 V178 H26 V175 H23 V172 H26 V169 H23 V166 H26 V163 H23 V160 H26 Z',
  },
};

function ToolGlyph({ kind, id }: { kind: Kind; id: string }) {
  const c = CUTTER[kind];
  return (
    <svg viewBox="0 0 60 200" className={s.glyph} aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={c.body} />
        </clipPath>
      </defs>
      <g className={s.holder}>
        <rect x="25" y="0" width="10" height="10" rx="1.5" />
        <path d="M23 10 H37 L42 42 H18 Z" />
        <rect x="9" y="42" width="42" height="13" rx="1" />
        <path d="M17 55 H43 L39 76 H21 Z" />
        <rect x="19" y="76" width="22" height="13" rx="2.5" />
      </g>
      <path d="M9 48.5 H51" className={s.groove} />
      <path d={c.body} className={s.cutter} />
      {kind === 'face' &&
        [10, 20, 30, 40, 50].map((x) => (
          <rect key={x} x={x - 2} y={181} width={4} height={5} className={s.insert} />
        ))}
      {c.flutes && (
        <g clipPath={`url(#${id})`}>
          <g className={s.flutes}>
            {Array.from({ length: Math.ceil((c.flutes[1] - c.flutes[0]) / 6) + 3 }, (_, i) => (
              <path
                key={i}
                d={`M14 ${c.flutes![0] + i * 6 - 6} L46 ${c.flutes![0] + i * 6 - 16}`}
              />
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ helpers */

// Where Attendum's universities are: "the UK and US".
const ATTENDUM_COUNTRIES = `the ${fmt.list(db.products.attendum.countries)}`;

const { person, current, downloads } = db;
const { logger } = db.devices;
const PRS = Object.values(db.contributions).map((c) => c.pr);
const INITIALS = person.name
  .split(' ')
  .map((w) => w[0])
  .join('');

// The career axis runs from the first year building to the end of this one, a tick every three years.
const YEAR0 = person.since,
  YEAR1 = Math.floor(NOW) + 1;
const TICKS = Array.from({ length: Math.ceil((YEAR1 - YEAR0) / 3) }, (_, i) => YEAR0 + i * 3);
const pct = (y: number) => `${(((y - YEAR0) / (YEAR1 - YEAR0)) * 100).toFixed(2)}%`;

function OpHead({
  id,
  tag,
  title,
  strategy,
}: {
  id: string;
  tag: string;
  title: string;
  strategy?: string;
}) {
  const op = strategy ? null : opById(id);
  return (
    <header className={s.opHead}>
      <span className={s.opTag}>{tag}</span>
      <h2 id={`${id}-title`}>{title}</h2>
      {op && (
        <dl className={s.opMeta}>
          <div>
            <dt>Strategy</dt>
            <dd>{op.strategy}</dd>
          </div>
          <div>
            <dt>Tool</dt>
            <dd>
              T{op.tool.t} ·{' '}
              {op.tool.kind === 'face'
                ? 'face mill'
                : op.tool.kind === 'drill'
                  ? 'drills'
                  : op.tool.kind === 'vbit'
                    ? 'engraver'
                    : 'end mill'}{' '}
              Ø{op.tool.d}
              {op.tool.kind === 'drill' ? '–3.2' : ''}
            </dd>
          </div>
          <div>
            <dt>Speed · feed</dt>
            <dd>
              S{op.rpm} · F{op.feed}
            </dd>
          </div>
          <div>
            <dt>Est. time</dt>
            <dd>{clock(estimate(op.program))}</dd>
          </div>
        </dl>
      )}
      {strategy && <p className={s.opStrategy}>{strategy}</p>}
    </header>
  );
}

const ext = (url: string) =>
  url.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {};

/* ------------------------------------------------------------------ page */

const TREE: TreeItem[] = [
  { id: 'setup', tag: 'SETUP', label: 'Setup sheet', sub: 'About' },
  { id: 'tools', tag: 'TOOLS', label: 'Tool library', sub: `${skills.length} cutters · skills` },
  { id: 'op10', tag: 'OP10', label: 'Roots', sub: 'Face' },
  { id: 'op20', tag: 'OP20', label: 'Experience', sub: 'Adaptive clearing' },
  { id: 'op30', tag: 'OP30', label: 'Platforms', sub: '2D contour' },
  { id: 'op40', tag: 'OP40', label: 'Hardware', sub: 'Drill · G81' },
  { id: 'op50', tag: 'OP50', label: 'Open source', sub: 'Engrave' },
  { id: 'post', tag: 'POST', label: 'Contact', sub: 'Post process' },
];

const roleOf = (company: string) => roles.find((r) => r.org.startsWith(company));

export default function Toolpath() {
  return (
    <div className={s.root}>
      <header className={s.top}>
        <a href="#top" className={s.brand}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 1 H13 V8 L10 19 L7 8 Z" />
          </svg>
          <b>{`${INITIALS}·CNC`}</b>
          <span>{`${PLATE.number} · ${ncFile(PLATE.name)}`}</span>
        </a>
        <nav aria-label="Sections">
          <a href="#setup">Setup</a>
          <a href="#tools">Tools</a>
          <a href="#op10">Ops</a>
          <a href="#post">Post</a>
        </nav>
      </header>

      <main>
        <section id="top" className={s.hero} aria-labelledby="name">
          <div className={s.intro}>
            <div>
              <p
                className={s.eyebrow}
              >{`Program ${PLATE.number} · building since ${person.since}`}</p>
              <h1 id="name">{profile.name}</h1>
              <p className={s.roleLine}>
                {profile.role} at{' '}
                <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                  {profile.company}
                </a>
              </p>
            </div>
            <div>
              <p className={s.lede}>{profile.lede}</p>
              <ul className={s.quick}>
                <li>
                  <a href={`mailto:${profile.email}`}>Email</a>
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
                    CV (PDF) ↗
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <Controller />
          <p className={s.heroNote}>
            The machine above runs real G-code. The name is cut from a single-stroke font made of
            lines and arcs, posted to G1, G2 and G3 by the same code that draws it. Hold the feed,
            single-step it, turn the feed override, or post your own text.
          </p>
        </section>

        <div className={s.sheet}>
          <SetupTree items={TREE} />

          <div className={s.ops}>
            <section id="setup" className={s.section} aria-labelledby="setup-title">
              <OpHead
                id="setup"
                tag="SETUP 1"
                title="Setup sheet"
                strategy="WCS G54 · X0 Y0 front left · Z0 top of stock"
              />
              <div className={s.setup}>
                <figure className={s.programmer}>
                  <Image src={person.photo} width={600} height={600} alt={profile.name} />
                  <figcaption>
                    <span className={s.label}>Programmer</span>
                    <b>{profile.fullName}</b>
                    <span>
                      {profile.role}, {profile.company}
                    </span>
                  </figcaption>
                </figure>
                <div className={s.prose}>
                  <h3 className={s.label}>Job description</h3>
                  {about.map((p) => (
                    <p key={p.slice(0, 24)}>{p}</p>
                  ))}
                </div>
                <div className={s.totals}>
                  <h3 className={s.label}>Totals</h3>
                  <dl>
                    {stats.map((m) => (
                      <div key={m.label}>
                        <dt>{m.label}</dt>
                        <dd>{m.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </section>

            <section id="tools" className={s.section} aria-labelledby="tools-title">
              <OpHead
                id="tools"
                tag="TOOLS"
                title="Tool library"
                strategy={`${skills.length} tools in the magazine · the stack, one cutter per skill`}
              />
              <ol className={s.rack}>
                {skills.map((skill, i) => (
                  <li key={skill} className={s.slot}>
                    <ToolGlyph kind={RACK[i % RACK.length].kind} id={`tp-tool-${i}`} />
                    <span className={s.slotT}>T{i + 1}</span>
                    <b>{skill}</b>
                    <span className={s.slotSpec}>{RACK[i % RACK.length].spec}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section id="op10" className={s.section} aria-labelledby="op10-title">
              <OpHead id="op10" tag="OP10" title="Roots" />
              <div className={s.opBody}>
                <OpSim
                  id="op10"
                  label="A 40 mm face mill takes a zig-zag facing pass across an aluminium block, with arcs at each turn."
                />
                <div>
                  <p className={s.opLede}>
                    Facing comes first: it trues the stock so every later operation has a flat
                    datum. Mine was electrical engineering with a focus on control systems, and
                    university years spent building robots.
                  </p>
                  <ol className={s.passes}>
                    {roots.map((r, i) => (
                      <li key={r.title}>
                        <span className={s.passNo}>{`P${String(i + 1).padStart(2, '0')}`}</span>
                        <span className={s.passYear}>{r.year}</span>
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
                </div>
              </div>
            </section>

            <section id="op20" className={s.section} aria-labelledby="op20-title">
              <OpHead id="op20" tag="OP20" title="Experience" />
              <div className={s.opBody}>
                <OpSim
                  id="op20"
                  label="An 8 mm end mill clears a pocket with trochoidal loops in three lanes, then takes a finishing pass around the walls."
                />
                <p
                  className={s.opLede}
                >{`Adaptive clearing removes most of the material at a steady load. ${fmt.Spell(db.yearsBuilding)} years of it: freelance web work from ${person.since}, IoT platforms and live tracking at ${db.roles.niknam.short}, frontend leadership at ${db.roles.zeroone.org}, and now ${current.title} at ${current.company}.`}</p>
              </div>
              <div className={s.gantt}>
                <div className={s.ganttAxis} aria-hidden="true">
                  {TICKS.map((y, i) => (
                    <span key={y} className={i % 2 ? s.minor : undefined} style={{ left: pct(y) }}>
                      {y}
                    </span>
                  ))}
                  <span className={s.now} style={{ left: pct(NOW) }}>
                    NOW
                  </span>
                </div>
                <ol className={s.jobs}>
                  {jobs.map((job, i) => {
                    const r = roleOf(job.company);
                    return (
                      <li key={job.company}>
                        <div className={s.jobHead}>
                          <span className={s.passNo}>{`P${String(i + 1).padStart(2, '0')}`}</span>
                          <h3>
                            {job.title} ·{' '}
                            {job.url ? (
                              <a href={job.url} target="_blank" rel="noreferrer">
                                {job.company} ↗
                              </a>
                            ) : (
                              job.company
                            )}
                          </h3>
                          <span className={s.jobRange}>{job.range}</span>
                        </div>
                        {r && (
                          <div className={s.track} aria-hidden="true">
                            <span
                              className={`${s.bar} ${r.end ? '' : s.open}`}
                              style={{
                                left: pct(r.start),
                                width: `calc(${pct(r.end ?? NOW)} - ${pct(r.start)})`,
                              }}
                            />
                          </div>
                        )}
                        <ul className={s.duties}>
                          {job.duties.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>

            <section id="op30" className={s.section} aria-labelledby="op30-title">
              <OpHead id="op30" tag="OP30" title="Platforms" />
              <div className={s.opBody}>
                <OpSim
                  id="op30"
                  label="A 6 mm end mill profiles around a 16:9 part in two step-downs, climbing over two holding tabs on the last pass."
                />
                <p
                  className={s.opLede}
                >{`The contour cuts the part free. These are the platforms that shipped: construction AI, R&D tax claims, attendance at universities in ${ATTENDUM_COUNTRIES}, a sensor fleet and an LMS, with links to the live sites and store listings.`}</p>
              </div>
              <div className={s.parts}>
                {featuredProjects.map((p, i) => (
                  <article key={p.title} className={s.part}>
                    <div className={s.shot}>
                      <Image
                        src={p.image}
                        width={1280}
                        height={800}
                        alt={`${p.title} screenshot`}
                      />
                      <span>{`PART ${String(i + 1).padStart(2, '0')}`}</span>
                    </div>
                    <div className={s.partText}>
                      <h3>{p.title}</h3>
                      <p>{p.description}</p>
                      <ul className={s.chips}>
                        {p.tech.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                      <div className={s.links}>
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
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <h3 className={s.subhead}>More parts off the same machine</h3>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th scope="col">Part</th>
                      <th scope="col">Description</th>
                      <th scope="col">Stack</th>
                      <th scope="col">Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherProjects.map((p) => (
                      <tr key={p.title}>
                        <th scope="row">{p.title}</th>
                        <td>{p.description}</td>
                        <td className={s.mono}>{p.tech.join(' · ')}</td>
                        <td className={s.links}>
                          {projectLinks(p.links).map((l) => (
                            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                              {l.label} ↗
                            </a>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="op40" className={s.section} aria-labelledby="op40-title">
              <OpHead id="op40" tag="OP40" title="Hardware" />
              <div className={s.opBody}>
                <OpSim
                  id="op40"
                  label="A PCB drill file runs: DIP and header pins with a 0.8 mm drill, the terminal block at 1.2 mm, then four 3.2 mm mounting holes, in nearest-neighbour order."
                />
                <p
                  className={s.opLede}
                >{`Drilling is where the board meets the world. ${fmt.Spell(hardware.length)} devices in production, from GSM weather stations that have logged for ${logger.online.long} years to BLE beacons updated over the air.`}</p>
              </div>
              <ol className={s.devices}>
                {hardware.map((d) => (
                  <li key={d.tag}>
                    <span className={s.devTag}>{d.tag}</span>
                    <h3>{d.name}</h3>
                    <p className={s.devKind}>{d.kind}</p>
                    <p>{d.detail}</p>
                    <ul className={s.chips}>
                      {d.figures.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>

            <section id="op50" className={s.section} aria-labelledby="op50-title">
              <OpHead id="op50" tag="OP50" title="Open source" />
              <div className={s.opBody}>
                <OpSim
                  id="op50"
                  label={`A fine engraver cuts ${fmt.spell(PRS.length)} pull request numbers into a plate: ${PRS.slice(0, -1).join(', ')} and ${PRS[PRS.length - 1]}.`}
                />
                <p
                  className={s.opLede}
                >{`Engraving is small, precise and permanent. These fixes were merged upstream, into packages downloaded ${downloads.weekly.long} times a week. The plate on the left carries their pull request numbers.`}</p>
              </div>
              <ol className={s.prs}>
                {oss.map((c) => (
                  <li key={c.repo}>
                    <div className={s.prHead}>
                      <a href={c.url} target="_blank" rel="noreferrer">
                        {c.repo} <span>#{c.url.split('/').pop()}</span> ↗
                      </a>
                      <span
                        className={`${s.kind} ${c.kind === 'Security' || c.kind === 'Data loss' ? s.kindHot : ''}`}
                      >
                        {c.kind}
                      </span>
                    </div>
                    <p>{c.change}</p>
                    <p className={s.impact}>{c.impact}</p>
                    <p className={s.reach}>
                      {c.year} · ★ {c.stars} · {c.weekly} downloads a week
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section id="post" className={s.section} aria-labelledby="post-title">
              <OpHead
                id="post"
                tag="POST"
                title="Contact"
                strategy="Post-process the setup into something you can run"
              />
              <div className={s.contact}>
                <div>
                  <p className={s.opLede}>
                    Building a platform, a device or the team behind them? Write to me.
                  </p>
                  <a className={s.email} href={`mailto:${profile.email}`}>
                    {profile.email}
                  </a>
                  <div className={s.links}>
                    <a href={profile.linkedin} {...ext(profile.linkedin)}>
                      LinkedIn ↗
                    </a>
                    <a href={profile.github} {...ext(profile.github)}>
                      GitHub ↗
                    </a>
                    <a href={profile.cv} target="_blank" rel="noreferrer">
                      CV (PDF) ↗
                    </a>
                  </div>
                </div>
                <PostOutput />
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className={s.footer}>
        <span>{`% · ${PLATE.number} · END OF PROGRAM`}</span>
        <span>
          © {profile.fullName}
          {` · ${person.since} → ${db.asOf.y}`}
        </span>
        <span>{`${concept('g-code').name} · concept ${concept('g-code').letter}`}</span>
      </footer>
    </div>
  );
}
