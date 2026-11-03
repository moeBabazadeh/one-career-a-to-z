import Image from 'next/image';
import {
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  otherProjects,
  profile,
  skills,
  stats,
} from '../_shared/data';
import { concept } from '../_shared/concepts';
import { projectLinks } from '../_shared/links';
import {
  NM_PER_YEAR,
  barriers,
  deltas,
  deviceStates,
  dopants,
  duration,
  frameFor,
  hue,
  states,
  vbi,
  waveColor,
  wells,
} from './device';
import Lab from './Lab';
import Locate from './Locate';
import s from './bandgap.module.scss';

// Concept B · Bandgap. The career grown as a semiconductor heterostructure: a live band
// diagram you can bias, heat and shine light on, with device notes for every part of it, then
// the same content as a plain reading path, set like a thesis chapter.

const { person, education, robots, builds, downloads } = db;
const credit = concept('bandgap');

const NAV = [
  ['device', 'Device'],
  ['about', 'About'],
  ['experience', 'Experience'],
  ['products', 'Products'],
  ['hardware', 'Hardware'],
  ['open-source', 'Open source'],
  ['education', 'Education'],
  ['contact', 'Contact'],
] as const;

// Near flat band at room temperature: the wavelengths the reading path quotes.
const flat = frameFor(vbi(300) - 0.15, 300);
const lambdas = flat.wells.map((w) => w.lambda);
const visible = lambdas.filter((l) => l >= 380);

/** The part of the device a product sits in, if any. */
const productItem = (title: string) =>
  states.find((st) => st.title === title)?.id ?? deviceStates.find((d) => d.name === title)?.id;
const robotics = builds.filter((b) => b.madeAt === 'Robotics');
// The lede's first sentence repeats the role line above it; the hero keeps the rest.
const story = profile.lede.split('. ').slice(1).join('. ') || profile.lede;

function BandMark() {
  return (
    <svg className={s.mark} viewBox="0 0 28 20" aria-hidden="true">
      <path d="M1 5h7l1 5h6l1-5h4l1 3h2l1-3h3" className={s.markC} />
      <path d="M1 15h7l1-3h6l1 3h4l1-2h2l1 2h3" className={s.markV} />
    </svg>
  );
}

function Links({ links }: { links: db.ProjectLinks }) {
  const list = projectLinks(links);
  if (!list.length) return null;
  return (
    <p className={s.links}>
      {list.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" data-kind={l.kind}>
          {l.label} ↗
        </a>
      ))}
    </p>
  );
}

function Section({
  id,
  num,
  kicker,
  title,
  note,
  children,
}: {
  id: string;
  num: number;
  kicker: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-title`}>
      <header className={s.secHead}>
        <p className={s.secKicker}>
          <span>§{num}</span> {kicker}
        </p>
        <h2 id={`${id}-title`}>{title}</h2>
        {note && <p className={s.secNote}>{note}</p>}
      </header>
      {children}
    </section>
  );
}

export default function Bandgap() {
  const [first] = wells;
  return (
    <div className={s.root}>
      <a href="#device" className={s.skip}>
        Skip to the band diagram
      </a>
      <a href="#about" className={s.skip}>
        Skip to the text
      </a>
      <header className={s.top}>
        <a href="#top" className={s.brand}>
          <BandMark />
          <b>{person.site}</b>
          <span className={s.crumb}>/ bandgap</span>
        </a>
        <nav className={s.nav} aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              data-short={
                id === 'device' || id === 'experience' || id === 'products' || id === 'contact'
                  ? 'true'
                  : undefined
              }
            >
              {label}
            </a>
          ))}
        </nav>
        <a className={s.cvLink} href={profile.cv} target="_blank" rel="noreferrer">
          CV ↗
        </a>
      </header>

      <main>
        <section id="top" className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroText}>
            <p className={s.eyebrow}>Specimen · {person.site}</p>
            <h1 id="hero-title">{profile.name}</h1>
            <p className={s.role}>
              {profile.role} at{' '}
              <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                {profile.company}
              </a>
              . {profile.headline}, trained in {education.msc.field.toLowerCase()}.
            </p>
            <p className={s.tagline}>{profile.tagline}</p>
            <p className={s.lede}>{story}</p>
            <p className={s.heroLinks}>
              <a className={s.primary} href={`mailto:${profile.email}`}>
                Make contact
              </a>
              <a href={profile.linkedin} target="_blank" rel="noreferrer">
                LinkedIn ↗
              </a>
              <a href={profile.github} target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
              <a href="#about">Read it as text ↓</a>
            </p>
          </div>
          <dl className={s.spec} aria-label="The specimen">
            <div>
              <dt>Growth</dt>
              <dd>
                {fmt.mon(first.role.from)} → {fmt.mon(db.asOf)}
                <small>position is time</small>
              </dd>
            </div>
            <div>
              <dt>Quantum wells</dt>
              <dd>
                {fmt.Spell(wells.length)}
                <small>one per role</small>
              </dd>
            </div>
            <div>
              <dt>Barriers</dt>
              <dd>
                {fmt.Spell(barriers.length)}
                <small>company changes</small>
              </dd>
            </div>
            <div>
              <dt>Impurity levels</dt>
              <dd>
                {fmt.Spell(dopants.length)}
                <small>studies and awards</small>
              </dd>
            </div>
            <div>
              <dt>Localized states</dt>
              <dd>
                {fmt.Spell(states.length)}
                <small>products, fixes, builds</small>
              </dd>
            </div>
            <div>
              <dt>Contact states</dt>
              <dd>
                {fmt.Spell(deviceStates.length)}
                <small>devices in production</small>
              </dd>
            </div>
            <div>
              <dt>Emission</dt>
              <dd>
                {Math.round(Math.min(...visible))}–{Math.round(Math.max(...visible))} nm
                <small>one colour per role</small>
              </dd>
            </div>
          </dl>
        </section>

        <Lab />

        <Section id="about" num={1} kicker="Abstract" title="About">
          <div className={s.abstract}>
            <figure className={s.portrait}>
              <Image
                src={person.photo}
                width={600}
                height={600}
                alt={profile.name}
                sizes="(max-width: 720px) 40vw, 200px"
              />
              <figcaption>
                <b>{profile.name}</b>
                <span>
                  {profile.role}, {profile.company}
                </span>
              </figcaption>
            </figure>
            <div className={s.prose}>
              {about.map((p) => (
                <p key={p.slice(0, 32)}>{p}</p>
              ))}
              <h3 className={s.minor}>Stack</h3>
              <ul className={s.chips}>
                {skills.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
            <aside className={s.measured} aria-labelledby="measured-title">
              <h3 id="measured-title">
                Measured <span>not simulated</span>
              </h3>
              <dl>
                {stats.map((m) => (
                  <div key={m.label}>
                    <dt>{m.label}</dt>
                    <dd>{m.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        </Section>

        <Section
          id="experience"
          num={2}
          kicker="Layer stack, top layer first"
          title="Experience"
          note="Every role, with the well it was grown as: the wider and deeper the well, the longer the role."
        >
          <ol className={s.stack}>
            {db.roleList.map((r) => {
              const w = wells.find((x) => x.role === r);
              const d = deltas.find((x) => x.role === r);
              const nm = w ? lambdas[w.index] : null;
              return (
                <li key={r.id} className={s.layerRow}>
                  <div className={s.layerSide}>
                    <span className={s.layerTag} data-delta={nm ? undefined : 'true'}>
                      {nm && (
                        <i
                          className={s.swatch}
                          style={{ background: waveColor(nm) }}
                          aria-hidden="true"
                        />
                      )}
                      {w ? `QW${w.index + 1}` : 'δ-layer'}
                    </span>
                    <span>{fmt.yearSpan(r.from, r.to)}</span>
                    <span>{duration(fmt.monthsBetween(r.from, r.to ?? db.asOf))}</span>
                  </div>
                  <div className={s.layerMain}>
                    <h3>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.org} ↗
                        </a>
                      ) : (
                        r.org
                      )}
                    </h3>
                    <p className={s.layerRole}>
                      {db.titlePath(r)}
                      {r.contract && ' (contract)'}
                    </p>
                    <p className={s.layerRange}>{fmt.monthSpan(r.from, r.to)}</p>
                    <p>{r.summary}</p>
                    <ul className={s.duties}>
                      {r.duties.map((x) => (
                        <li key={x.slice(0, 40)}>{x}</li>
                      ))}
                    </ul>
                    <p className={s.physLine}>
                      {w && nm ? (
                        <span>
                          {`${w.nm.toFixed(2)} nm wide (${NM_PER_YEAR} nm a year) · ${w.dEc.toFixed(2)} eV deep · ${w.e.length} bound electron state${w.e.length === 1 ? '' : 's'} · emits ${Math.round(nm)} nm, ${hue(nm)}`}
                        </span>
                      ) : (
                        <span>
                          A contract alongside: grown as a δ-doped sheet inside the current well,
                          not a layer of its own.
                        </span>
                      )}
                      <Locate id={w?.id ?? d?.id ?? ''} name={r.org} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>

        <Section
          id="products"
          num={3}
          kicker="Localized states"
          title="Products"
          note="What shipped. In the diagram each one is a small dip in the well of the year it shipped, where carriers settle."
        >
          <div className={s.featured}>
            {featuredProjects.map((p) => {
              const item = productItem(p.title);
              return (
                <article key={p.title} className={s.card}>
                  <div className={s.shot}>
                    <Image
                      src={p.image}
                      width={1280}
                      height={800}
                      alt={`${p.title} screenshot`}
                      sizes="(max-width: 720px) 100vw, 420px"
                    />
                  </div>
                  <div className={s.cardBody}>
                    <h3>{p.title}</h3>
                    <p>{p.description}</p>
                    <ul className={s.tags}>
                      {p.tech.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    <div className={s.cardFoot}>
                      <Links links={p.links} />
                      {item && <Locate id={item} name={p.title} />}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <ul className={s.others}>
            {otherProjects.map((p) => {
              const item = productItem(p.title);
              const st = states.find((x) => x.title === p.title);
              return (
                <li key={p.title}>
                  <div>
                    <h3>
                      {p.title}
                      {st && <span>{st.year}</span>}
                    </h3>
                    <p>{p.description}</p>
                    <p className={s.stackLine}>{p.tech.join(' · ')}</p>
                  </div>
                  <div className={s.otherSide}>
                    <Links links={p.links} />
                    {item && <Locate id={item} name={p.title} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          id="hardware"
          num={4}
          kicker="n⁺ contact · in production"
          title="Hardware"
          note="Devices still running in the field. In the diagram they are the states in the n⁺ contact, where electrons leave as current."
        >
          <ul className={s.hardware}>
            {hardware.map((d, i) => (
              <li key={d.tag}>
                <p className={s.hwTag}>{d.tag}</p>
                <h3>{d.name}</h3>
                <p className={s.hwKind}>{d.kind}</p>
                <p>{d.detail}</p>
                <ul className={s.figures}>
                  {d.figures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Locate id={deviceStates[i].id} name={d.name} />
              </li>
            ))}
          </ul>
          <div className={s.alsoBuilt}>
            <h3 className={s.minor}>Robots</h3>
            <ul>
              <li>
                <b>{robots.ssl.title}</b>{' '}
                {`${fmt.yearSpan(robots.ssl.from, robots.ssl.to)}. ${robots.ssl.detail}`}
              </li>
              <li>
                <b>{robots.quadcopter.title}</b> {robots.quadcopter.detail}
              </li>
              {robotics.map((b) => (
                <li key={b.title}>
                  <b>{b.title}</b> {b.tech.join(', ')}.
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section
          id="open-source"
          num={5}
          kicker="Upstream"
          title="Open source"
          note={`Bugs fixed at the source, in packages downloaded ${downloads.weekly.long} times a week.`}
        >
          <ul className={s.oss}>
            {oss.map((c) => {
              const st = states.find((x) => x.contribution?.repo === c.repo);
              return (
                <li key={c.repo}>
                  <p className={s.ossHead}>
                    <span className={s.kind} data-kind={c.kind}>
                      {c.kind}
                    </span>
                    <span>{c.year}</span>
                    <span>{`★ ${c.stars} · ${c.weekly} a week`}</span>
                  </p>
                  <h3>{c.repo}</h3>
                  <p>
                    <b>Impact.</b> {c.impact}
                  </p>
                  <p>
                    <b>Fix.</b> {c.change}
                  </p>
                  <p className={s.ossFoot}>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      Pull request ↗
                    </a>
                    {st && <Locate id={st.id} name={c.repo} />}
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          id="education"
          num={6}
          kicker="Impurity levels"
          title="Education and awards"
          note="Studies are donors, giving the career its carriers; awards were received, so they are acceptors."
        >
          <ol className={s.roots}>
            {dopants.map((d) => (
              <li key={d.id}>
                <span className={s.rootYear}>{d.years}</span>
                <span className={s.rootType} data-type={d.type}>
                  {d.type === 'donor' ? '⊕ donor' : '⊖ acceptor'}
                </span>
                <div>
                  <h3>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer">{`${d.title} ↗`}</a>
                    ) : (
                      d.title
                    )}
                  </h3>
                  <p>{d.detail}</p>
                </div>
                <Locate id={d.id} name={d.title} />
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="contact"
          num={7}
          kicker="Ohmic contact"
          title="Contact"
          note="Low resistance, in both directions."
        >
          <div className={s.contact}>
            <p className={s.contactLead}>
              Building a platform, or growing a team that builds one? Tell me what you’re working
              on.
            </p>
            <a className={s.mail} href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
            <ul className={s.contactLinks}>
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
        </Section>
      </main>

      <footer className={s.footer}>
        <span>{`${credit.name} · concept ${credit.letter} · ${person.site}`}</span>
        <span>The device is an illustration. Every fact on the page is real.</span>
        <span>{`© ${profile.fullName}, ${person.since} → ${db.asOf.y}`}</span>
      </footer>
    </div>
  );
}
