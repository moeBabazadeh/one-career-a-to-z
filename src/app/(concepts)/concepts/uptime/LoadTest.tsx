import Image from 'next/image';
import type { Project } from '@/content/projects';
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import Console from './Console';
import Reveal from './Reveal';
import StatusChip from './StatusChip';
import Trace from './Trace';
import s from './loadtest.module.scss';
import { conceptTitle } from '../_shared/concepts';

const NAV = [
  ['console', 'Overview'],
  ['owner', 'Owner'],
  ['trace', 'Trace'],
  ['services', 'Services'],
  ['runbooks', 'Runbooks'],
  ['postmortems', 'Postmortems'],
  ['oncall', 'On-call'],
];

const { person, products, devices } = db;
const { neuroject, zeroone, alget } = db.roles;
const { smartclaim, attendum } = products;
/** The LinkedIn path and the CV file name, as the on-call list shows them. */
const linkedinPath = new URL(profile.linkedin).pathname.replace(/^\/|\/$/g, '');
const cvFile = profile.cv.split('/').pop();

// How he works, as runbooks. Every step is taken from his roles and projects.
const RUNBOOKS = [
  {
    id: 'RB-01',
    title: 'Securing a multi-tenant platform',
    from: `${neuroject.org} · ${smartclaim.title} · Gatsby`,
    steps: [
      'Put a permission check on every API route, and keep audit trails.',
      'Keep production alarms and GuardDuty alerts in infrastructure as code.',
      'Gate every pull request with secret scanning, Semgrep and Trivy.',
      'When an unsafe dependency ships to everyone, remove it upstream, like the uuid version in Gatsby that could fall back to Math.random().',
    ],
  },
  {
    id: 'RB-02',
    title: 'Leading the architecture',
    from: neuroject.org,
    steps: [
      'Own the architecture, roadmap and delivery of a cloud-native, multi-tenant platform.',
      'Connect BIM, schedules, budgets and risks into traceable decisions.',
      `Build it on Next.js, React 19 and Laravel, hosted on AWS Amplify and Laravel Vapor: ${db.commits.neurobuild.short} commits across ${fmt.spell(db.commits.neurobuildCodebases)} codebases.`,
    ],
  },
  {
    id: 'RB-03',
    title: 'Bringing AI into a product',
    from: `${neuroject.org} · ${smartclaim.title}`,
    steps: [
      'Give people natural-language access to their project data.',
      'Warn early on schedule and cost risk.',
      'Work across the stack: the FastAPI and pgvector API, the SvelteKit app and the TypeScript client SDK.',
    ],
  },
  {
    id: 'RB-04',
    title: 'Shipping a product end to end',
    from: `${attendum.title} at ${zeroone.org}`,
    steps: [
      `Write the firmware for the ${devices.attendumReader.chip} card readers and the ${devices.attendumBeacon.chip} BLE beacons.`,
      'Build the iOS and Android app, and ship it to the App Store and Google Play.',
      'Build the staff dashboard and a Canvas LTI app.',
    ],
  },
  {
    id: 'RB-05',
    title: 'Making releases cheaper',
    from: `${zeroone.org} · ${alget.org}`,
    steps: [
      'Redesign the CI/CD pipelines to cut build and deployment overhead.',
      'Ship MVP features quickly with the product and backend teams.',
    ],
  },
  {
    id: 'RB-06',
    title: 'Taking load off the backend',
    from: alget.org,
    steps: ['Handle state and data on the client, and cut the API requests nobody needed.'],
  },
];

type Life = 'live' | 'production' | 'upstream' | 'code' | 'personal';
const LIFE: Record<Life, string> = {
  live: 'live',
  production: 'in production',
  upstream: 'upstream PR',
  code: 'open source',
  personal: 'personal',
};

/** Who built it and where it stands, from the project archive and links. */
function meta(p: Project) {
  const entry =
    archive.find((a) => a.title === p.title) ?? archive.find((a) => a.title.startsWith(p.title));
  const made = entry?.madeAt;
  const life: Life =
    p.links.external || p.links.appStore
      ? 'live'
      : made === 'In production'
        ? 'production'
        : made === 'Open source'
          ? 'upstream'
          : p.links.github
            ? 'code'
            : 'personal';
  const team =
    made && !['In production', 'Personal', 'Open source'].includes(made) ? made : undefined;
  return {
    life,
    team,
    slug: p.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
  };
}

function Links({ project }: { project: Project }) {
  const links = projectLinks(project.links);
  if (!links.length) return null;
  return (
    <span className={s.endpoints}>
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" data-kind={l.kind}>
          {l.label} ↗
        </a>
      ))}
    </span>
  );
}

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
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-title`}>
      <Reveal>
        <header className={s.secHead}>
          <span className={s.secIndex}>{index}</span>
          <h2 id={`${id}-title`}>{title}</h2>
          {note && <p>{note}</p>}
        </header>
        {children}
      </Reveal>
    </section>
  );
}

export default function LoadTest() {
  return (
    <div className={s.root}>
      <a href="#console" className={s.skip}>
        Skip to the load test
      </a>
      <header className={s.top}>
        <a href="#top" className={s.brand}>
          <span className={s.logo} aria-hidden="true" />
          <b>{person.site}</b>
          <span className={s.crumb}>/ prod / load-test</span>
        </a>
        <nav className={s.nav} aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <StatusChip />
      </header>

      <main>
        <section id="top" className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroText}>
            <p className={s.eyebrow}>
              <span className={s.liveDot} aria-hidden="true" />
              Service owner · on call
            </p>
            <h1 id="hero-title">{profile.name}</h1>
            <p className={s.role}>
              {`${profile.role} at`}{' '}
              <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                {profile.company}
              </a>
              . Full-stack engineer.
            </p>
            <p className={s.tagline}>{profile.tagline}</p>
          </div>
          <div className={s.heroSide}>
            <p className={s.lede}>{profile.lede}</p>
            <p className={s.invite}>
              Below is a production stack in miniature, running in your browser. Send it launch-day
              traffic, kill a node, turn off the cache, and watch what holds.
            </p>
            <div className={s.heroLinks}>
              <a className={s.primary} href={`mailto:${profile.email}`}>
                Page me
              </a>
              <a href={profile.cv} target="_blank" rel="noreferrer">
                CV ↗
              </a>
              <a href={profile.linkedin} target="_blank" rel="noreferrer">
                LinkedIn ↗
              </a>
              <a href={profile.github} target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>
        </section>

        <div className={s.consoleWrap}>
          <Console />
        </div>

        <Section id="owner" index="01" title="Service owner" note="The engineer this page pages.">
          <div className={s.owner}>
            <figure className={s.portrait}>
              <Image
                src={person.photo}
                width={600}
                height={600}
                alt={profile.name}
                sizes="(max-width: 720px) 40vw, 240px"
              />
              <figcaption>
                <b>{profile.name}</b>
                <span>
                  {profile.role} · {profile.company}
                </span>
              </figcaption>
            </figure>
            <div className={s.readme}>
              <p className={s.file}>README.md</p>
              {about.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
              <h3>Stack</h3>
              <ul className={s.chips}>
                {skills.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
            <aside className={s.facts} aria-labelledby="facts-title">
              <h3 id="facts-title">
                Facts <span>not simulated</span>
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
          id="trace"
          index="02"
          title="Career trace"
          note={`Every role as a span, from the first freelance site in ${person.since} to now. Open a span for its logs.`}
        >
          <Trace />
          <div className={s.provenance}>
            <h3>
              Provenance <span>what this engineer was built from</span>
            </h3>
            <ol>
              {roots.map((r, i) => (
                <li key={r.title} style={{ '--i': i } as React.CSSProperties}>
                  <span className={s.provYear}>{r.year}</span>
                  <b>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.title} ↗
                      </a>
                    ) : (
                      r.title
                    )}
                  </b>
                  <span>{r.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        <Section
          id="services"
          index="03"
          title="Service catalog"
          note="Platforms and products he has shipped, with their real endpoints."
        >
          <div className={s.catalog}>
            {featuredProjects.map((p, i) => {
              const m = meta(p);
              return (
                <article
                  key={p.title}
                  className={s.service}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <div className={s.shot}>
                    <Image
                      src={p.image}
                      width={1280}
                      height={800}
                      alt={`${p.title} screenshot`}
                      sizes="(max-width: 720px) 100vw, 440px"
                    />
                  </div>
                  <div className={s.serviceBody}>
                    <header>
                      <h3>{p.title}</h3>
                      <span className={s.life} data-life={m.life}>
                        {LIFE[m.life]}
                      </span>
                    </header>
                    <p className={s.slug}>
                      service/{m.slug}
                      {m.team && <> · {m.team}</>}
                    </p>
                    <p>{p.description}</p>
                    <ul className={s.tags}>
                      {p.tech.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    <Links project={p} />
                  </div>
                </article>
              );
            })}
          </div>
          <div className={s.serviceList}>
            <div className={s.listHead} aria-hidden="true">
              <span>status</span>
              <span>service</span>
              <span>stack</span>
              <span>endpoints</span>
            </div>
            <ul>
              {otherProjects.map((p) => {
                const m = meta(p);
                return (
                  <li key={p.title}>
                    <span className={s.life} data-life={m.life}>
                      {LIFE[m.life]}
                    </span>
                    <div>
                      <h3>
                        {p.title}
                        {m.team && <span> · {m.team}</span>}
                      </h3>
                      <p>{p.description}</p>
                    </div>
                    <span className={s.stack}>{p.tech.join(' · ')}</span>
                    <Links project={p} />
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>

        <Section
          id="runbooks"
          index="04"
          title="Runbooks"
          note="How he works, written down. Each step comes from a role or a project above."
        >
          <div className={s.runbooks}>
            {RUNBOOKS.map((rb, i) => (
              <article
                key={rb.id}
                className={s.runbook}
                style={{ '--i': i } as React.CSSProperties}
              >
                <header>
                  <span className={s.rbId}>{rb.id}</span>
                  <h3>{rb.title}</h3>
                </header>
                <p className={s.rbFrom}>from {rb.from}</p>
                <ol>
                  {rb.steps.map((step) => (
                    <li key={step.slice(0, 32)}>{step}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </Section>

        <Section
          id="postmortems"
          index="05"
          title="Postmortems, fixed upstream"
          note={`Bugs found in other people’s systems and fixed at the source, in packages downloaded ${db.downloads.weekly.long} times a week.`}
        >
          <div className={s.postmortems}>
            {oss.map((c, i) => (
              <article key={c.repo} className={s.pm} style={{ '--i': i } as React.CSSProperties}>
                <header>
                  <span className={s.kind} data-kind={c.kind}>
                    {c.kind}
                  </span>
                  <span className={s.pmYear}>{c.year}</span>
                </header>
                <h3>{c.repo}</h3>
                <dl>
                  <div>
                    <dt>Impact</dt>
                    <dd>{c.impact}</dd>
                  </div>
                  <div>
                    <dt>Fix</dt>
                    <dd>{c.change}</dd>
                  </div>
                  <div>
                    <dt>Reach</dt>
                    <dd>
                      ★ {c.stars} · {c.weekly} downloads a week
                    </dd>
                  </div>
                </dl>
                <a href={c.url} target="_blank" rel="noreferrer" className={s.pmLink}>
                  Pull request ↗
                </a>
              </article>
            ))}
          </div>
        </Section>

        <Section
          id="oncall"
          index="06"
          title="On-call"
          note="Escalation policy for talking to the owner."
        >
          <div className={s.oncall}>
            <div className={s.page}>
              <p className={s.pageKicker}>
                <span className={s.liveDot} aria-hidden="true" />
                Primary · {profile.name}
              </p>
              <p className={s.pageTitle}>
                Building a platform, or need one kept up? Tell me what you’re working on.
              </p>
              <a className={s.cta} href={`mailto:${profile.email}`}>
                <span>Page me</span>
                <b>{profile.email}</b>
              </a>
            </div>
            <ol className={s.policy}>
              <li>
                <span className={s.level}>L1</span>
                <b>Email</b>
                <a href={`mailto:${profile.email}`}>{profile.email}</a>
              </li>
              <li>
                <span className={s.level}>L2</span>
                <b>LinkedIn</b>
                <a href={profile.linkedin} target="_blank" rel="noreferrer">
                  {`${linkedinPath} ↗`}
                </a>
              </li>
              <li>
                <span className={s.level}>L3</span>
                <b>GitHub</b>
                <a href={profile.github} target="_blank" rel="noreferrer">
                  {`${person.githubUser} ↗`}
                </a>
              </li>
              <li>
                <span className={s.level}>CV</span>
                <b>Résumé</b>
                <a href={profile.cv} target="_blank" rel="noreferrer">
                  {`${cvFile} ↗`}
                </a>
              </li>
            </ol>
          </div>
        </Section>
      </main>

      <footer className={s.footer}>
        <span>{`${conceptTitle('uptime')} · a concept for ${person.site}`}</span>
        <span>The console is a simulation. Everything else on this page is real.</span>
        <span>© {profile.fullName}</span>
      </footer>
    </div>
  );
}
