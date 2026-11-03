import Image from 'next/image';
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  liveLinks,
  otherProjects,
  profile,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { concept } from '../_shared/concepts';
import s from './console.module.scss';

const { robots, awards, education, papers, contributions } = db;
const me = concept('robot-console');

function Links({ links }: { links: { label: string; url: string }[] }) {
  if (!links.length) return null;
  return (
    <p className={s.rLinks}>
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label} ↗
        </a>
      ))}
    </p>
  );
}

/** Everything the console shows, as one plain page. */
export default function Reader() {
  const { bsc, msc } = education;
  const paper = papers.inverter;
  return (
    <article id="read" className={s.reader}>
      <nav className={s.readerBar} aria-label="Page">
        <a href="#console">← Back to the console</a>
        <span>{`${me.letter} · ${me.name}, read as a page`}</span>
      </nav>

      <header className={s.rHead}>
        <h2>{profile.name}</h2>
        <p className={s.rRole}>
          {`${profile.role} at `}
          <a href={profile.companyUrl} target="_blank" rel="noreferrer">
            {profile.company}
          </a>
          {`. ${profile.headline}.`}
        </p>
        <p>{profile.tagline}</p>
        <p className={s.rLinks}>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn ↗
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV ↗
          </a>
        </p>
      </header>

      <section aria-labelledby="r-about">
        <h3 id="r-about">About</h3>
        {about.map((p) => (
          <p key={p.slice(0, 32)}>{p}</p>
        ))}
        <ul className={s.rTags}>
          {skills.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
        <dl className={s.rStats}>
          {stats.map((m) => (
            <div key={m.label}>
              <dt>{m.value}</dt>
              <dd>{m.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="r-roles">
        <h3 id="r-roles">Experience</h3>
        {db.roleList.map((r) => (
          <article key={r.id} className={s.rItem}>
            <h4>
              {db.titlePath(r)}
              {', '}
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.org}
                </a>
              ) : (
                r.org
              )}
            </h4>
            <p
              className={s.rMeta}
            >{`${fmt.monthSpan(r.from, r.to)}${r.contract ? ' · contract' : ''}${r.sector ? ` · ${r.sector}` : ''}`}</p>
            <ul>
              {r.duties.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section aria-labelledby="r-projects">
        <h3 id="r-projects">Projects</h3>
        <div className={s.rFeatured}>
          {featuredProjects.map((p) => (
            <article key={p.title} className={s.rItem}>
              <Image
                src={p.image}
                width={1280}
                height={800}
                alt={`${p.title}, a screenshot`}
                className={s.rShot}
              />
              <h4>{p.title}</h4>
              <p>{p.description}</p>
              <p className={s.rMeta}>{p.tech.join(' · ')}</p>
              <Links links={projectLinks(p.links)} />
            </article>
          ))}
        </div>
        <h4 className={s.rSub}>More projects</h4>
        <ul className={s.rList}>
          {otherProjects.map((p) => (
            <li key={p.title}>
              <b>{p.title}</b>
              {`. ${p.description} `}
              <span className={s.rMeta}>{p.tech.join(' · ')}</span>
              <Links links={projectLinks(p.links)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="r-hardware">
        <h3 id="r-hardware">Hardware in production</h3>
        <ul className={s.rList}>
          {hardware.map((d) => (
            <li key={d.tag}>
              <b>{`${d.name} (${d.tag})`}</b>
              {`, ${d.kind}. ${d.detail} `}
              <span className={s.rMeta}>{d.figures.join(' · ')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="r-roots">
        <h3 id="r-roots">Roots and RoboCup</h3>
        <ul className={s.rList}>
          <li>
            <b>{db.degreeTitle(bsc)}</b>
            {`, ${bsc.school}, ${fmt.yearSpan(bsc.from, bsc.to)}. Thesis: ${bsc.thesis}.`}
          </li>
          <li>
            <b>{db.degreeTitle(msc)}</b>
            {`, ${msc.school}, ${fmt.yearSpan(msc.from, msc.to)}. Thesis: ${msc.thesis}.`}
          </li>
          <li>
            <b>{robots.ssl.title}</b>
            {`, ${fmt.yearSpan(robots.ssl.from, robots.ssl.to)}. ${robots.ssl.detail}`}
          </li>
          <li>
            <b>{`${awards.robocup.event}, ${awards.robocup.place}`}</b>
            {`, ${fmt.month(awards.robocup.date)}. ${awards.robocup.challenge}.`}
          </li>
          <li>
            <b>{`${awards.skills.event}, ${awards.skills.place}`}</b>
            {`, ${awards.skills.year}. ${awards.skills.challenge}.`}
          </li>
          <li>
            <b>{robots.quadcopter.title}</b>
            {`, undated. ${robots.quadcopter.detail}`}
          </li>
          <li>
            <b>{`Paper on ${paper.venue}`}</b>
            {`, ${fmt.month(paper.date)}. ${paper.title}. `}
            <a
              href={paper.url}
              target="_blank"
              rel="noreferrer"
            >{`${paper.venue} ${paper.id} ↗`}</a>
          </li>
        </ul>
      </section>

      <section aria-labelledby="r-oss">
        <h3 id="r-oss">Open source</h3>
        <p>{`Fixes merged into libraries downloaded ${db.downloads.weekly.long} times a week.`}</p>
        <ul className={s.rList}>
          {Object.values(contributions).map((c: db.Contribution) => (
            <li key={c.repo}>
              <b>{c.repo}</b>
              {` (${c.year}, ${c.kind.toLowerCase()}, ★ ${c.stars}, ${c.weekly.short} downloads a week). ${c.change} ${c.impact} `}
              <a href={db.prUrl(c)} target="_blank" rel="noreferrer">{`Pull request #${c.pr} ↗`}</a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="r-archive">
        <h3 id="r-archive">Everything built, by year</h3>
        <div className={s.rScroll}>
          <table className={s.rTable}>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Build</th>
                <th scope="col">Made at</th>
                <th scope="col">With</th>
              </tr>
            </thead>
            <tbody>
              {archive.map((b) => (
                <tr key={`${b.year}-${b.title}`}>
                  <td>{b.year}</td>
                  <td>
                    {projectLinks(b.links)[0] ? (
                      <a href={projectLinks(b.links)[0].url} target="_blank" rel="noreferrer">
                        {b.title}
                      </a>
                    ) : (
                      b.title
                    )}
                  </td>
                  <td>{b.madeAt}</td>
                  <td>{b.tech.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="r-contact">
        <h3 id="r-contact">Contact</h3>
        <p>Write about a platform, a device or a team that needs building.</p>
        <p className={s.rLinks}>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn ↗
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV ↗
          </a>
        </p>
        <Links links={liveLinks} />
      </section>
    </article>
  );
}
