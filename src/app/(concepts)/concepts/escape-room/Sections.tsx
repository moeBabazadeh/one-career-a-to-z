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
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import type { SectionId } from './puzzles';
import s from './escape.module.scss';

const { person, roleList, titlePath, robots, downloads } = db;
const linkedinPath = new URL(profile.linkedin).pathname.replace(/^\/|\/$/g, '');
const cvFile = profile.cv.split('/').pop();

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <p className={s.links}>
      {items.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" data-kind={l.kind}>
          {l.label} ↗
        </a>
      ))}
    </p>
  );
}

function About() {
  return (
    <div className={s.letter}>
      <figure className={s.letterPhoto}>
        <Image src={person.photo} width={600} height={600} alt={profile.name} sizes="128px" />
        <figcaption>{person.first}</figcaption>
      </figure>
      <p className={s.salutation}>Dear visitor,</p>
      <p className={s.letterLede}>{profile.lede}</p>
      {about.map((p) => (
        <p key={p.slice(0, 24)}>{p}</p>
      ))}
      <p className={s.letterLede}>{profile.tagline}</p>
      <p className={s.signoff}>{person.first}</p>
      <p className={s.ps}>
        P.S. Every lock in this room opens with something the room tells you. Keep this letter; one
        of them needs it.
      </p>
    </div>
  );
}

function Experience() {
  return (
    <ol className={s.ledger}>
      {roleList.map((r) => (
        <li key={r.id}>
          <header>
            <h4>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.org} ↗
                </a>
              ) : (
                r.org
              )}
            </h4>
            <span>{fmt.monthSpan(r.from, r.to)}</span>
          </header>
          <p className={s.roleTitle}>
            {titlePath(r)}
            {r.contract && ' · contract'}
            {r.sector && <span> · {r.sector}</span>}
          </p>
          <ul>
            {r.duties.map((d) => (
              <li key={d.slice(0, 32)}>{d}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function Products() {
  return (
    <>
      <div className={s.shots}>
        {featuredProjects.map((p) => (
          <article key={p.title} className={s.shotCard}>
            <div className={s.shot}>
              <Image
                src={p.image}
                width={1280}
                height={800}
                alt={`${p.title}, a screenshot`}
                sizes="(max-width: 720px) 90vw, 360px"
              />
            </div>
            <h4>{p.title}</h4>
            <p>{p.description}</p>
            <ul className={s.chips}>
              {p.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <Links links={p.links} />
          </article>
        ))}
      </div>
      <h4 className={s.subhead}>Also built</h4>
      <ul className={s.also}>
        {otherProjects.map((p) => (
          <li key={p.title}>
            <b>{p.title}</b>
            <span>{p.description}</span>
            <small>{p.tech.join(' · ')}</small>
            <Links links={p.links} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Hardware() {
  return (
    <ul className={s.parts}>
      {hardware.map((d) => (
        <li key={d.tag}>
          <span className={s.partTag}>{d.tag}</span>
          <h4>{d.name}</h4>
          <p className={s.partKind}>{d.kind}</p>
          <p>{d.detail}</p>
          <ul className={s.figures}>
            {d.figures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function OpenSource() {
  return (
    <>
      <p className={s.lead}>
        Bugs found in other people’s code and fixed at the source, in packages downloaded{' '}
        {downloads.weekly.long} times a week.
      </p>
      <ol className={s.prs}>
        {oss.map((c) => (
          <li key={c.repo}>
            <header>
              <span className={s.kind}>{c.kind}</span>
              <span>{c.year}</span>
            </header>
            <h4>{c.repo}</h4>
            <p>{c.change}</p>
            <p className={s.impact}>{c.impact}</p>
            <p className={s.reach}>
              ★ {c.stars} · {c.weekly} downloads a week ·{' '}
              <a href={c.url} target="_blank" rel="noreferrer">
                pull request ↗
              </a>
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

function Education() {
  return (
    <>
      <ol className={s.roots}>
        {roots.map((r) => (
          <li key={r.title}>
            <span className={s.rootYear}>{r.year}</span>
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
      </ol>
      <p className={s.lead}>{robots.quadcopter.detail}</p>
    </>
  );
}

function Cv() {
  return (
    <div className={s.cv}>
      <header>
        <h4>{profile.name}</h4>
        <p>
          {profile.role}, {profile.company}
        </p>
      </header>
      <dl className={s.stats}>
        {stats.map((m) => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd>{m.value}</dd>
          </div>
        ))}
      </dl>
      <h4 className={s.subhead}>Stack</h4>
      <ul className={s.chips}>
        {skills.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <a className={s.primary} href={profile.cv} target="_blank" rel="noreferrer">
        Take the CV with you · {cvFile} ↗
      </a>
    </div>
  );
}

function Contact() {
  return (
    <div className={s.contact}>
      <p className={s.contactLead}>
        You’re out. If you’re building a platform, a product or a device and want a hand, tell me
        what you’re working on.
      </p>
      <a className={s.primary} href={`mailto:${profile.email}`}>
        {profile.email}
      </a>
      <ul className={s.ways}>
        <li>
          <span>LinkedIn</span>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            {linkedinPath} ↗
          </a>
        </li>
        <li>
          <span>GitHub</span>
          <a href={profile.github} target="_blank" rel="noreferrer">
            {person.githubUser} ↗
          </a>
        </li>
        <li>
          <span>CV</span>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            {cvFile} ↗
          </a>
        </li>
        <li>
          <span>Site</span>
          <a href={person.url}>{person.site}</a>
        </li>
      </ul>
    </div>
  );
}

const PAGES: Record<SectionId, () => React.ReactNode> = {
  about: About,
  experience: Experience,
  products: Products,
  hardware: Hardware,
  oss: OpenSource,
  education: Education,
  cv: Cv,
  contact: Contact,
};

export default function SectionBody({ id }: { id: SectionId }) {
  const Page = PAGES[id];
  return <Page />;
}
