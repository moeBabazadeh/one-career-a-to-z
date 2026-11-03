import Image from 'next/image';
import { concept } from '../_shared/concepts';
import { about, db, fmt, jobs, otherProjects, profile, skills, stats } from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';
import FlyButton from './FlyButton';
import Gcs from './Station';
import {
  contributionsByReach,
  devicesFlown,
  downloadsPerDrone,
  firstOf,
  kindLed,
  lanes,
  productsFlown,
  rootsFlown,
} from './mission';
import Preview from './Preview';
import { N } from './sim';
import s from './swarm.module.scss';

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

const { person } = db;
const credit = concept('swarm');
const cvFile = person.cv.split('/').pop();
const linkedinPath = new URL(profile.linkedin).pathname.replace(/^\/|\/$/g, '');

const NAV: [string, string][] = [
  ['about', 'About'],
  ['experience', 'Experience'],
  ['numbers', 'Numbers'],
  ['products', 'Products'],
  ['hardware', 'Hardware'],
  ['open-source', 'Open source'],
  ['roots', 'Roots'],
  ['contact', 'Contact'],
];

function Links({ links }: { links: LinkItem[] }) {
  if (!links.length) return null;
  return (
    <ul className={s.links}>
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer" data-kind={l.kind}>
            {l.label} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

function Section({
  id,
  code,
  kicker,
  title,
  note,
  wp,
  children,
}: {
  id: string;
  code: string;
  kicker: string;
  title: string;
  note?: string;
  wp?: number;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-title`}>
      <header className={s.secHead}>
        <div className={s.secText}>
          <p className={s.secKicker}>
            <span>{code}</span> {kicker}
          </p>
          <h2 id={`${id}-title`}>{title}</h2>
          {note && <p className={s.secNote}>{note}</p>}
        </div>
        {wp !== undefined && (
          <figure className={s.secFig}>
            <Preview wp={wp} />
            <figcaption>
              <FlyButton wp={wp} label={`Fly the ${title.toLowerCase()} formation`}>
                Fly this formation
              </FlyButton>
            </figcaption>
          </figure>
        )}
      </header>
      {children}
    </section>
  );
}

export default function Swarm() {
  const numbers = firstOf('numbers');
  const products = firstOf('products');
  const hw = firstOf('hardware');
  const roots = firstOf('roots');
  const maxWeekly = contributionsByReach[0]?.weekly.n ?? 1;

  return (
    <div className={s.root}>
      <a href="#gcs" className={s.skip}>
        Skip to the ground station
      </a>
      <a href="#about" className={s.skip}>
        Skip to the briefing
      </a>
      <header className={s.top}>
        <a href="#gcs" className={s.brand}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5.5" cy="5.5" r="3.2" />
            <circle cx="18.5" cy="5.5" r="3.2" />
            <circle cx="5.5" cy="18.5" r="3.2" />
            <circle cx="18.5" cy="18.5" r="3.2" />
            <path d="M8 8l8 8M16 8l-8 8" />
          </svg>
          <b>Swarm GCS</b>
          <span>/ {person.site}</span>
        </a>
        <nav className={s.nav} aria-label="Briefing sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <a className={s.topCv} href={profile.cv} target="_blank" rel="noreferrer">
          CV ↗
        </a>
      </header>

      <main>
        <Gcs />

        <div className={s.briefing}>
          <p className={s.briefIntro}>
            <span>Briefing</span> Everything the swarm flies, to read at your own pace. Each
            formation above has its section here, and each section can send the swarm up again.
          </p>

          <Section id="about" code="WP01" kicker="Pilot" title="About" wp={firstOf('callsign')}>
            <div className={s.about}>
              <figure className={s.portrait}>
                <Image
                  src={person.photo}
                  width={600}
                  height={600}
                  alt={profile.name}
                  sizes="(max-width: 760px) 40vw, 220px"
                />
                <figcaption>
                  <b>{profile.name}</b>
                  <span>{`${profile.role}, ${profile.company}`}</span>
                </figcaption>
              </figure>
              <div className={s.prose}>
                <p className={s.lede}>{profile.lede}</p>
                {about.map((p) => (
                  <p key={p.slice(0, 32)}>{p}</p>
                ))}
              </div>
              <aside className={s.aboutSide} aria-labelledby="stack-title">
                <h3 id="stack-title">Stack</h3>
                <ul className={s.chips}>
                  {skills.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
                <p className={s.since}>
                  <b>{db.yearsBuilding}</b>
                  <span>{`years building, since ${person.since}`}</span>
                  <FlyButton wp={firstOf('years')} label="Fly the years formation">
                    Fly it
                  </FlyButton>
                </p>
              </aside>
            </div>
          </Section>

          <Section
            id="experience"
            code="WP03"
            kicker="Flight log"
            title="Experience"
            note={`${jobs.length} roles from ${person.since} to now. In the sky, one drone per year marks the axis and each role flies as a bar from its first month to its last.`}
            wp={firstOf('timeline')}
          >
            <ol className={s.jobs}>
              {jobs.map((j) => {
                const lane = lanes.find((l) =>
                  db.roles[l.id as db.RoleId].org.startsWith(j.company),
                );
                return (
                  <li
                    key={`${j.company}-${j.range}`}
                    style={{ '--c': lane ? `var(--led-${lane.c})` : 'var(--accent)' } as Vars}
                  >
                    <p className={s.jobRange}>{j.range}</p>
                    <div>
                      <h3>
                        {j.url ? (
                          <a href={j.url} target="_blank" rel="noreferrer">
                            {j.company} ↗
                          </a>
                        ) : (
                          j.company
                        )}
                      </h3>
                      <p className={s.jobTitle}>{j.title}</p>
                      <ul>
                        {j.duties.map((d) => (
                          <li key={d.slice(0, 40)}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Section>

          <Section
            id="numbers"
            code="WP04"
            kicker="Telemetry"
            title="Numbers"
            note="The headline figures, each flown as giant digits. Counts that grow are lower bounds."
            wp={numbers}
          >
            <ul className={s.numbers}>
              {stats.map((st, k) => (
                <li key={st.label}>
                  <b>{st.value}</b>
                  <span>{st.label}</span>
                  <FlyButton wp={numbers + k} label={`Fly ${st.value} ${st.label}`}>
                    Fly it
                  </FlyButton>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            id="products"
            code="WP05"
            kicker="Payloads"
            title="Products"
            note="Products he built or shipped, with their real links. Each one has a shape the swarm can fly."
            wp={products}
          >
            <div className={s.products}>
              {productsFlown.map(({ project: p }, k) => (
                <article key={p.title} className={s.product}>
                  <div className={s.shot}>
                    <Image
                      src={p.image}
                      width={1280}
                      height={800}
                      alt={`${p.title} screenshot`}
                      sizes="(max-width: 760px) 100vw, 420px"
                    />
                  </div>
                  <div className={s.productBody}>
                    <h3>{p.title}</h3>
                    <p>{p.description}</p>
                    <ul className={s.chips}>
                      {p.tech.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    <div className={s.productFoot}>
                      <Links links={projectLinks(p.links)} />
                      <FlyButton wp={products + k} label={`Fly the ${p.title} shape`}>
                        Fly it
                      </FlyButton>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <h3 className={s.subhead}>More builds</h3>
            <ul className={s.more}>
              {otherProjects.map((p) => (
                <li key={p.title}>
                  <div>
                    <h4>{p.title}</h4>
                    <p>{p.description}</p>
                    <p className={s.moreTech}>{p.tech.join(' · ')}</p>
                  </div>
                  <Links links={projectLinks(p.links)} />
                </li>
              ))}
            </ul>
          </Section>

          <Section
            id="hardware"
            code="WP06"
            kicker="Airframes"
            title="Hardware"
            note={`${fmt.Spell(devicesFlown.length)} devices in production.`}
            wp={hw}
          >
            <ul className={s.devices}>
              {devicesFlown.map(({ device: d }, k) => (
                <li key={d.tag}>
                  <p className={s.tag}>{d.tag}</p>
                  <h3>{d.name}</h3>
                  <p className={s.kind}>{d.kind}</p>
                  <p>{d.detail}</p>
                  <ul className={s.figures}>
                    {d.figures.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <FlyButton wp={hw + k} label={`Fly the ${d.name} shape`}>
                    Fly it
                  </FlyButton>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            id="open-source"
            code="WP07"
            kicker="Upstream"
            title="Open source"
            note={`Fixes he sent upstream, to packages downloaded ${db.downloads.weekly.long} times a week. In the sky it's a unit chart: one drone for every ${fmt.compact(downloadsPerDrone)} weekly downloads.`}
            wp={firstOf('oss')}
          >
            <ol className={s.oss}>
              {contributionsByReach.map((c) => (
                <li
                  key={c.repo}
                  style={
                    {
                      '--c': `var(--led-${kindLed(c.kind)})`,
                      '--share': c.weekly.n / maxWeekly,
                    } as Vars
                  }
                >
                  <div className={s.ossHead}>
                    <span className={s.ossKind}>{c.kind}</span>
                    <h3>
                      <a href={db.prUrl(c)} target="_blank" rel="noreferrer">
                        {c.repo} ↗
                      </a>
                    </h3>
                    <span className={s.ossMeta}>
                      {c.year} · ★ {c.stars}
                    </span>
                  </div>
                  <p className={s.ossBar}>
                    <span aria-hidden="true" />
                    <b>{c.weekly.short}</b> downloads a week ·{' '}
                    {Math.max(1, Math.round(c.weekly.n / downloadsPerDrone))} drones
                  </p>
                  <dl>
                    <div>
                      <dt>Fix</dt>
                      <dd>{c.change}</dd>
                    </div>
                    <div>
                      <dt>Why</dt>
                      <dd>{c.impact}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          </Section>

          <Section
            id="roots"
            code="WP08"
            kicker="Pre-flight"
            title="Roots"
            note="Education, robots and awards, before the career."
            wp={roots + rootsFlown.length - 1}
          >
            <ol className={s.roots}>
              {rootsFlown.map((r, k) => (
                <li key={r.key}>
                  <p className={s.rootYear}>{r.year || 'no date on record'}</p>
                  <div>
                    <h3>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">{`${r.title} ↗`}</a>
                      ) : (
                        r.title
                      )}
                    </h3>
                    <p>{r.detail}</p>
                  </div>
                  <FlyButton wp={roots + k} label={`Fly the ${r.title} shape`}>
                    Fly it
                  </FlyButton>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="contact" code="WP09" kicker="Comms" title="Contact" wp={firstOf('contact')}>
            <div className={s.contact}>
              <p className={s.contactLead}>
                A platform to architect, a device to bring online, or a team to build: tell me what
                you’re working on.
              </p>
              <a className={s.mail} href={`mailto:${profile.email}`}>
                {profile.email}
              </a>
              <ul className={s.channels}>
                <li>
                  <span>LinkedIn</span>
                  <a
                    href={profile.linkedin}
                    target="_blank"
                    rel="noreferrer"
                  >{`${linkedinPath} ↗`}</a>
                </li>
                <li>
                  <span>GitHub</span>
                  <a
                    href={profile.github}
                    target="_blank"
                    rel="noreferrer"
                  >{`${person.githubUser} ↗`}</a>
                </li>
                <li>
                  <span>Résumé</span>
                  <a href={profile.cv} target="_blank" rel="noreferrer">{`${cvFile} ↗`}</a>
                </li>
              </ul>
            </div>
          </Section>
        </div>
      </main>

      <footer className={s.footer}>
        <span>{`${credit.letter} · ${credit.name}, a concept for ${person.site}`}</span>
        <span>{`The flight of ${N} drones is simulated in your browser. Every word and number it flies is real.`}</span>
        <span>{`© ${profile.fullName}, ${person.since} → ${db.asOf.y}`}</span>
      </footer>
    </div>
  );
}
