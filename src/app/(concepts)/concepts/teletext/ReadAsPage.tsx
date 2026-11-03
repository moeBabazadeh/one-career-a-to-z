'use client';

import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  liveLinks,
  oss,
  otherProjects,
  profile,
  roots,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import s from './teletext.module.scss';

const { person, robots } = db;

function Section({
  id,
  page,
  title,
  onWatch,
  children,
}: {
  id: string;
  page: number;
  title: string;
  onWatch: (n: number) => void;
  children: React.ReactNode;
}) {
  return (
    <section className={s.readSection} aria-labelledby={`read-${id}`}>
      <header className={s.readHead}>
        <h2 id={`read-${id}`}>{title}</h2>
        <button
          type="button"
          className={s.pageTag}
          onClick={() => onWatch(page)}
          title={`Show page ${page} on the set`}
        >
          P{page}
        </button>
      </header>
      {children}
    </section>
  );
}

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <p className={s.readLinks}>
      {items.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label}
        </a>
      ))}
    </p>
  );
}

/** Everything the service carries, as one plain page. */
export default function ReadAsPage({ onWatch }: { onWatch: (n: number) => void }) {
  return (
    <article className={s.read}>
      <header className={s.readTop}>
        <p className={s.readKicker}>Every page, in print</p>
        <h1>{profile.name}</h1>
        <p className={s.readRole}>
          {profile.role}, {profile.company} · {profile.headline}
        </p>
        <p>{profile.tagline}</p>
        <p className={s.readContact}>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={profile.cv}>CV</a>
        </p>
      </header>

      <Section id="now" page={101} title="Now" onWatch={onWatch}>
        <p>{db.lede}</p>
      </Section>

      <Section id="about" page={102} title="About" onWatch={onWatch}>
        {about.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </Section>

      <Section id="figures" page={103} title="In figures" onWatch={onWatch}>
        <dl className={s.readFigures}>
          {db.headline.map((h) => (
            <div key={h.label}>
              <dt>{h.value}</dt>
              <dd>{h.label}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="skills" page={104} title="Skills" onWatch={onWatch}>
        <ul className={s.readTags}>
          {db.skills.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      </Section>

      <Section id="roles" page={200} title="Roles" onWatch={onWatch}>
        {db.roleList.map((r, i) => (
          <div key={r.id} className={s.readItem}>
            <h3>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.org}
                </a>
              ) : (
                r.org
              )}
              <button type="button" className={s.pageTagSmall} onClick={() => onWatch(201 + i)}>
                P{201 + i}
              </button>
            </h3>
            <p className={s.readMeta}>
              {db.titlePath(r)}
              {r.contract ? ' (contract)' : ''} · {fmt.monthSpan(r.from, r.to)}
            </p>
            <p>{r.summary}</p>
            <ul>
              {r.duties.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section id="projects" page={300} title="Projects" onWatch={onWatch}>
        {featuredProjects.map((p, i) => (
          <div key={p.title} className={s.readItem}>
            <h3>
              {p.title}
              <button type="button" className={s.pageTagSmall} onClick={() => onWatch(301 + i)}>
                P{301 + i}
              </button>
            </h3>
            <p className={s.readMeta}>{p.tech.join(' · ')}</p>
            <p>{p.description}</p>
            <Links links={p.links} />
          </div>
        ))}
        <h3 className={s.readSub}>More builds and fixes</h3>
        {otherProjects.map((p) => (
          <div key={p.title} className={s.readItem}>
            <h4>{p.title}</h4>
            <p className={s.readMeta}>{p.tech.join(' · ')}</p>
            <p>{p.description}</p>
            <Links links={p.links} />
          </div>
        ))}
        <h3 className={s.readSub}>Every build by year</h3>
        <div className={s.readTableWrap}>
          <table className={s.readTable}>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Build</th>
                <th scope="col">Where</th>
                <th scope="col">Tech</th>
              </tr>
            </thead>
            <tbody>
              {archive.map((b) => {
                const href = b.links.external ?? b.links.github ?? b.links.appStore;
                return (
                  <tr key={`${b.year}-${b.title}`}>
                    <td>{b.year}</td>
                    <td>
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer">
                          {b.title}
                        </a>
                      ) : (
                        b.title
                      )}
                    </td>
                    <td>{b.madeAt}</td>
                    <td>{b.tech.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="hardware" page={400} title="Hardware" onWatch={onWatch}>
        {hardware.map((d, i) => (
          <div key={d.tag} className={s.readItem}>
            <h3>
              {d.name}
              <button type="button" className={s.pageTagSmall} onClick={() => onWatch(401 + i)}>
                P{401 + i}
              </button>
            </h3>
            <p className={s.readMeta}>
              {d.tag} · {d.kind}
            </p>
            <p>{d.detail}</p>
            <ul className={s.readTags}>
              {d.figures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section id="oss" page={500} title="Open source" onWatch={onWatch}>
        <p>
          Pull requests to packages with {db.downloads.weekly.long} weekly downloads between them (
          {db.downloads.exact} exactly).
        </p>
        {oss.map((c, i) => (
          <div key={c.url} className={s.readItem}>
            <h3>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.repo}
              </a>
              <button type="button" className={s.pageTagSmall} onClick={() => onWatch(501 + i)}>
                P{501 + i}
              </button>
            </h3>
            <p className={s.readMeta}>
              {c.kind} · {c.year} · {c.stars} stars · {c.weekly} weekly downloads
            </p>
            <p>{c.change}</p>
            <p>{c.impact}</p>
          </div>
        ))}
      </Section>

      <Section id="roots" page={600} title="Roots" onWatch={onWatch}>
        {[
          ...roots,
          {
            year: '',
            title: robots.quadcopter.title,
            detail: robots.quadcopter.detail,
            url: undefined,
          },
        ].map((r, i) => (
          <div key={r.title} className={s.readItem}>
            <h3>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title}
                </a>
              ) : (
                r.title
              )}
              <button type="button" className={s.pageTagSmall} onClick={() => onWatch(601 + i)}>
                P{601 + i}
              </button>
            </h3>
            <p className={s.readMeta}>{r.year || 'Undated'}</p>
            <p>{r.detail}</p>
          </div>
        ))}
      </Section>

      <Section id="contact" page={700} title="Contact" onWatch={onWatch}>
        <ul className={s.readList}>
          <li>
            Email: <a href={`mailto:${person.email}`}>{person.email}</a>
          </li>
          <li>
            LinkedIn:{' '}
            <a href={person.linkedin} target="_blank" rel="noreferrer">
              {person.linkedin.replace(/^https:\/\/(www\.)?/, '')}
            </a>
          </li>
          <li>
            GitHub:{' '}
            <a href={person.github} target="_blank" rel="noreferrer">
              {person.github.replace(/^https:\/\//, '')}
            </a>
          </li>
          <li>
            CV: <a href={person.cv}>{`${person.site}${person.cv}`}</a>
          </li>
        </ul>
        <h3 className={s.readSub}>Live apps</h3>
        <ul className={s.readList}>
          {liveLinks.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}
