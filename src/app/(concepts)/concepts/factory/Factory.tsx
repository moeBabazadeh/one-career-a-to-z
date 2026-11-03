import Image from 'next/image';
import type { Project } from '@/content/projects';
import {
  about,
  archive,
  db,
  featuredProjects,
  jobs,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { SAVE } from './content';
import Floor from './Floor';
import Icon from './Icon';
import { ITEMS, RAW } from './items';
import TechTree from './TechTree';
import s from './factory.module.scss';

// Concept F · Factory. Raw skills are mined, assembled into parts, then into the products he
// shipped, and belted to the docks they ship from: web, App Store, Google Play and the field.

const NAV = [
  ['factory', 'Factory'],
  ['stats', 'Statistics'],
  ['research', 'Research'],
  ['blueprints', 'Blueprints'],
  ['mods', 'Mods'],
  ['manifest', 'Manifest'],
  ['engineer', 'Engineer'],
  ['contact', 'Request'],
];

function Section({
  id,
  index,
  title,
  note,
  children,
}: {
  id: string;
  index: string;
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-title`}>
      <header className={s.secHead}>
        <span className={s.secIndex}>{index}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

type Dock = 'Web' | 'App Store' | 'Google Play' | 'Field' | 'Upstream' | 'Code' | 'Personal';

/** Where a project ships to, from its links and the archive. */
function docksOf(p: Project): Dock[] {
  const entry =
    archive.find((a) => a.title === p.title) ??
    archive.find((a) => a.title.startsWith(p.title.split(':')[0]));
  const out: Dock[] = [];
  if (p.links.external) out.push('Web');
  if (p.links.appStore) out.push('App Store');
  if (p.links.playStore) out.push('Google Play');
  if (p.tech.includes('Hardware') || p.tech.includes('STM')) out.push('Field');
  if (entry?.madeAt === 'Open source') out.push('Upstream');
  else if (p.links.github) out.push('Code');
  if (!out.length) out.push('Personal');
  return out;
}

function Blueprint({ job, wide }: { job: (typeof jobs)[number]; wide?: boolean }) {
  return (
    <article className={s.blueprint} data-wide={wide || undefined}>
      <header>
        <span className={s.bpIcon} aria-hidden="true" />
        <div>
          <h3>{job.url ? <Out href={job.url}>{job.company}</Out> : job.company}</h3>
          <p>{job.title}</p>
        </div>
        <time>{job.range}</time>
      </header>
      <ul>
        {job.duties.map((d) => (
          <li key={d.slice(0, 32)}>{d}</li>
        ))}
      </ul>
    </article>
  );
}

function ModGlyph({ kind }: { kind: string }) {
  const d: Record<string, React.ReactNode> = {
    Security: <path d="M16 4l10 4v7c0 6-4.5 10.5-10 13C10.5 25.5 6 21 6 15V8z M12 16l3 3 6-6" />,
    'Data loss': (
      <>
        <ellipse cx={16} cy={8} rx={9} ry={3.5} />
        <path d="M7 8v16c0 2 4 3.5 9 3.5s9-1.5 9-3.5V8M7 16c0 2 4 3.5 9 3.5s9-1.5 9-3.5" />
      </>
    ),
    'Type safety': (
      <path d="M5 8h10M10 8v16M19 10c-2 0-3 1-3 3v1.5c0 1-1 1.5-2 1.5 1 0 2 .5 2 1.5V19c0 2 1 3 3 3M23 10c2 0 3 1 3 3v1.5c0 1 1 1.5 2 1.5-1 0-2 .5-2 1.5V19c0 2-1 3-3 3" />
    ),
    Bug: (
      <path d="M11 11a5 5 0 0 1 10 0v8a5 5 0 0 1-10 0z M16 11v13M11 15H5M27 15h-6M11 20l-5 3M21 20l5 3M12 8l-3-3M20 8l3-3" />
    ),
  };
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      {d[kind]}
    </svg>
  );
}

function Docks({ p }: { p: Project }) {
  return (
    <p className={s.docks}>
      {docksOf(p).map((d) => (
        <span key={d} data-dock={d}>
          {d}
        </span>
      ))}
    </p>
  );
}

function Links({ p }: { p: Project }) {
  const links = projectLinks(p.links);
  if (!links.length) return null;
  return (
    <span className={s.links}>
      {links.map((l) => (
        <Out key={l.url} href={l.url}>
          {l.label} ↗
        </Out>
      ))}
    </span>
  );
}

const MOD_KIND: Record<string, string> = {
  Security: 'red',
  'Data loss': 'amber',
  'Type safety': 'blue',
  Bug: 'green',
};
const { awards, person } = db;
const ACHIEVEMENTS = roots.filter((r) =>
  [awards.robocup.place, awards.skills.place, db.papers.inverter.venue].some((k) =>
    r.title.includes(k),
  ),
);

/** Roles still running get a wide blueprint. */
const CURRENT = new Set(db.roleList.filter((r) => !r.to).map((r) => r.short ?? r.org));

/** The last part of a link: "moe-babazadeh", "resume.pdf". */
const handle = (url: string) => url.split('/').filter(Boolean).pop();

const Out = ({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <a href={href} target="_blank" rel="noreferrer" className={className}>
    {children}
  </a>
);

function Gear({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z" />
      <circle cx="12" cy="12" r="3.6" />
    </svg>
  );
}

export default function Factory() {
  return (
    <div className={s.root}>
      <a href="#factory" className={s.skip}>
        Skip to the factory
      </a>
      <header className={s.top}>
        <a href="#top" className={s.brand}>
          <Gear className={s.logo} />
          <b>{person.site}</b>
          <span>/ factory</span>
        </a>
        <nav className={s.nav} aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <Out href={profile.cv} className={s.topCv}>
          CV ↗
        </Out>
      </header>

      <main>
        <section id="top" className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroText}>
            <p className={s.kicker}>
              <span className={s.kickerLamp} aria-hidden="true" />
              {`Save file · ${SAVE} · building since ${person.since}`}
            </p>
            <h1 id="hero-title">{profile.name}</h1>
            <p className={s.role}>{profile.tagline}</p>
            <p className={s.lede}>
              {`${profile.role} at `}
              <Out href={profile.companyUrl}>{profile.company}</Out>
              {profile.lede.slice(`${profile.role} at ${profile.company}`.length)}
            </p>
            <p className={s.invite}>
              Below, my skills are the ore: mined, assembled into parts, then into the products I
              shipped, and belted to the docks they ship from. It runs live in your browser. Find
              the bottleneck and fix it.
            </p>
            <div className={s.heroLinks}>
              <a className={s.primary} href={`mailto:${profile.email}`}>
                Send a request
              </a>
              <Out href={profile.linkedin}>LinkedIn ↗</Out>
              <Out href={profile.github}>GitHub ↗</Out>
            </div>
          </div>
          <dl className={s.heroStats} aria-label="Totals">
            {stats.map((st) => (
              <div key={st.label}>
                <dt>{st.label}</dt>
                <dd>{st.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Floor />

        <Section
          id="research"
          index="03"
          title="Research"
          note={`The learning path behind the factory, from the first websites in ${person.since} to ${profile.role}. Each research costs one flask per year it took. Pick one to see what it unlocked.`}
        >
          <TechTree />
        </Section>

        <Section
          id="blueprints"
          index="04"
          title="Blueprints"
          note="Every place I have built for, as a blueprint book."
        >
          <div className={s.book}>
            {jobs
              .filter((j) => CURRENT.has(j.company))
              .map((j) => (
                <Blueprint key={j.company} job={j} wide />
              ))}
            <div className={s.shelf}>
              {jobs
                .filter((j) => !CURRENT.has(j.company))
                .map((j) => (
                  <Blueprint key={j.company} job={j} />
                ))}
            </div>
          </div>
        </Section>

        <Section
          id="mods"
          index="05"
          title="Mods"
          note={
            <>
              Fixes I got merged into other people&apos;s projects. Combined, the packages I patched
              see <b>{`${db.downloads.weekly.short} downloads a week`}</b>.
            </>
          }
        >
          <ul className={s.mods}>
            {oss.map((m) => (
              <li key={m.repo} className={s.mod}>
                <span className={s.modIcon} data-c={MOD_KIND[m.kind]} aria-hidden="true">
                  <ModGlyph kind={m.kind} />
                </span>
                <div className={s.modMain}>
                  <h3>
                    <Out href={m.url}>{m.repo}</Out>
                  </h3>
                  <p className={s.modMeta}>
                    <span data-c={MOD_KIND[m.kind]}>{m.kind}</span> · {m.year}
                    {` · patch by ${person.githubUser}`}
                  </p>
                  <p>{m.change}</p>
                  <p className={s.modImpact}>{m.impact}</p>
                </div>
                <dl className={s.modStats}>
                  <div>
                    <dt>a week</dt>
                    <dd>{m.weekly}</dd>
                  </div>
                  <div>
                    <dt>stars</dt>
                    <dd>{m.stars}</dd>
                  </div>
                  <Out href={m.url} className={s.modLink}>
                    View PR ↗
                  </Out>
                </dl>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="manifest"
          index="06"
          title="Shipping manifest"
          note="Everything that left the factory, and the dock it shipped from."
        >
          <div className={s.crates}>
            {featuredProjects.map((p) => (
              <article key={p.title} className={s.crate}>
                <div className={s.crateShot}>
                  <Image
                    src={p.image}
                    alt=""
                    width={1280}
                    height={800}
                    sizes="(max-width: 720px) 90vw, 460px"
                  />
                </div>
                <div className={s.crateBody}>
                  <Docks p={p} />
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                  <ul className={s.chips} aria-label="Tech">
                    {p.tech.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <Links p={p} />
                </div>
              </article>
            ))}
          </div>
          <div className={s.manifestWrap}>
            <table className={s.manifest}>
              <caption className={s.sr}>More shipments</caption>
              <thead>
                <tr>
                  <th scope="col">Shipment</th>
                  <th scope="col">Contents</th>
                  <th scope="col">Tech</th>
                  <th scope="col">Dock</th>
                </tr>
              </thead>
              <tbody>
                {otherProjects.map((p) => (
                  <tr key={p.title}>
                    <th scope="row">
                      {p.title}
                      <Links p={p} />
                    </th>
                    <td>{p.description}</td>
                    <td>
                      <ul className={s.chips} aria-label="Tech">
                        {p.tech.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <Docks p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="engineer"
          index="07"
          title="The engineer"
          note="Character screen: the portrait, the inventory and the achievements."
        >
          <div className={s.engineer}>
            <figure className={s.portrait}>
              <Image
                src={person.photo}
                width={600}
                height={600}
                alt={profile.name}
                sizes="(max-width: 720px) 60vw, 260px"
              />
              <figcaption>
                <b>{profile.name}</b>
                <span>
                  {profile.role} · {profile.company}
                </span>
              </figcaption>
            </figure>
            <div className={s.bio}>
              {about.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <div className={s.inventory}>
              <h3>Inventory</h3>
              <ul aria-label="Skills">
                {skills.map((sk, k) => (
                  <li key={sk}>
                    <Icon id={RAW.find((id) => ITEMS[id].name === sk) ?? RAW[k]} size={26} />
                    <span>{sk}</span>
                  </li>
                ))}
              </ul>
              <h3>Achievements</h3>
              <ul className={s.achievements}>
                {ACHIEVEMENTS.map((a) => (
                  <li key={a.title}>
                    <span className={s.medal} aria-hidden="true">
                      <svg viewBox="0 0 20 20">
                        <path d="M10 2l2.4 5 5.4.6-4 3.7 1.1 5.4L10 14l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />
                      </svg>
                    </span>
                    <div>
                      <b>{a.title}</b>
                      <span>
                        {a.year} · {a.detail}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <section id="contact" className={s.contact} aria-labelledby="contact-title">
          <div className={s.chest}>
            <header className={s.bar}>
              <div className={s.barTitle}>
                <span className={s.chestIcon} aria-hidden="true" />
                <h2 id="contact-title">Requester chest</h2>
                <span className={s.barMeta}>delivers to {profile.email}</span>
              </div>
            </header>
            <div className={s.chestBody}>
              <p className={s.chestLead}>
                Set a request and it gets delivered: a platform to architect, a team to lead, a
                product to ship end to end.
              </p>
              <ul className={s.slots}>
                <li>
                  <a href={`mailto:${profile.email}`} data-primary>
                    <b>Email</b>
                    <span>{profile.email}</span>
                  </a>
                </li>
                <li>
                  <Out href={profile.linkedin}>
                    <b>LinkedIn</b>
                    <span>{`${handle(profile.linkedin)} ↗`}</span>
                  </Out>
                </li>
                <li>
                  <Out href={profile.github}>
                    <b>GitHub</b>
                    <span>{`${person.githubUser} ↗`}</span>
                  </Out>
                </li>
                <li>
                  <Out href={profile.cv}>
                    <b>CV</b>
                    <span>{`${handle(profile.cv)} ↗`}</span>
                  </Out>
                </li>
                <li>
                  <Out href={profile.companyUrl}>
                    <b>{profile.company}</b>
                    <span>{`${new URL(profile.companyUrl).host} ↗`}</span>
                  </Out>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.foot}>
        <p>
          Every throughput number on this page comes from the simulation running in your browser.
          The products, dates, links and figures are real.
        </p>
        <p>
          © {profile.name} · <a href="#top">Back to the top</a>
        </p>
      </footer>
    </div>
  );
}
