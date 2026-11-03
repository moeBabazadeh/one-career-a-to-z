import {
  about,
  archive,
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
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import s from './logic.module.scss';

const { person, current } = db;
const quad = db.robots.quadcopter;

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <p className={s.rLinks}>
      {items.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label}
        </a>
      ))}
    </p>
  );
}

/** Everything the buses carry, as a plain page: the capture report, no instrument needed. */
export default function Report() {
  return (
    <article className={s.report} aria-labelledby="la-report-title">
      <header className={s.rHead}>
        <p className={s.rKicker}>Capture report · everything the buses carry, as text</p>
        <h1 id="la-report-title">{profile.name}</h1>
        <p className={s.rRole}>
          {current.title}, <a href={current.companyUrl}>{current.company}</a>: {current.pitch}
        </p>
        <p>
          {person.headline}. {profile.lede}
        </p>
        <p>{profile.tagline}</p>
        <ul className={s.rContact}>
          <li>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
          </li>
          <li>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </li>
          <li>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </li>
          <li>
            <a href={profile.cv}>CV (PDF)</a>
          </li>
        </ul>
        <a className={s.btn} href="#">
          Back to the analyzer
        </a>
      </header>

      <section aria-labelledby="r-about">
        <h2 id="r-about">About</h2>
        {about.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <ul className={s.rStats}>
          {stats.map((st) => (
            <li key={st.label}>
              <b>{st.value}</b> {st.label}
            </li>
          ))}
        </ul>
        <p>
          <strong>Skills:</strong> {skills.join(', ')}
        </p>
      </section>

      <section aria-labelledby="r-roles">
        <h2 id="r-roles">Experience</h2>
        <ol className={s.rList}>
          {db.roleList.map((r, i) => (
            <li key={r.id}>
              <h3>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.org}
                  </a>
                ) : (
                  r.org
                )}
                {r.contract ? ' (contract)' : ''}
              </h3>
              <p className={s.rMeta}>
                {db.titlePath(r)} · {jobs[i].range}
              </p>
              <p>{r.summary}</p>
              <ul>
                {r.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="r-hw">
        <h2 id="r-hw">Hardware in production</h2>
        <ul className={s.rList}>
          {hardware.map((d) => (
            <li key={d.tag}>
              <h3>
                {d.name} <small>{d.tag}</small>
              </h3>
              <p className={s.rMeta}>
                {d.kind} · {d.figures.join(' · ')}
              </p>
              <p>{d.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="r-projects">
        <h2 id="r-projects">Featured projects</h2>
        <ul className={s.rList}>
          {featuredProjects.map((p) => (
            <li key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.rMeta}>{p.tech.join(' · ')}</p>
              <Links links={p.links} />
            </li>
          ))}
        </ul>
        <h2>Other projects</h2>
        <ul className={s.rList}>
          {otherProjects.map((p) => (
            <li key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.rMeta}>{p.tech.join(' · ')}</p>
              <Links links={p.links} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="r-oss">
        <h2 id="r-oss">Open source</h2>
        <p>
          {db.downloads.weekly.short} weekly downloads across the {fmt.spell(oss.length)} packages
          patched.
        </p>
        <ul className={s.rList}>
          {oss.map((c) => (
            <li key={c.url}>
              <h3>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.repo}
                </a>
              </h3>
              <p className={s.rMeta}>
                {c.kind} · {c.year} · {c.stars} stars · {c.weekly} weekly downloads
              </p>
              <p>
                {c.change} {c.impact}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="r-roots">
        <h2 id="r-roots">Education and roots</h2>
        <ul className={s.rList}>
          {roots.map((r) => (
            <li key={r.title}>
              <h3>{r.title}</h3>
              <p className={s.rMeta}>{r.year}</p>
              <p>
                {r.detail}{' '}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    Read it
                  </a>
                )}
              </p>
            </li>
          ))}
          <li>
            <h3>{quad.title}</h3>
            <p className={s.rMeta}>Undated</p>
            <p>{quad.detail}</p>
          </li>
        </ul>
      </section>

      <section aria-labelledby="r-archive">
        <h2 id="r-archive">Archive</h2>
        <div className={s.rTableBox}>
          <table className={s.rTable}>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Build</th>
                <th scope="col">Made at</th>
                <th scope="col">Tech</th>
                <th scope="col">Link</th>
              </tr>
            </thead>
            <tbody>
              {archive.map((b) => {
                const link = projectLinks(b.links)[0];
                return (
                  <tr key={b.title}>
                    <td>{b.year}</td>
                    <td>{b.title}</td>
                    <td>{b.madeAt}</td>
                    <td>{b.tech.join(', ')}</td>
                    <td>
                      {link && (
                        <a href={link.url} target="_blank" rel="noreferrer">
                          {link.label}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="r-contact">
        <h2 id="r-contact">Contact</h2>
        <p>
          Email <a href={`mailto:${profile.email}`}>{profile.email}</a>, find me on{' '}
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>{' '}
          and{' '}
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          , or download the <a href={profile.cv}>CV</a>.
        </p>
        <a className={s.btn} href="#">
          Back to the analyzer
        </a>
      </section>
    </article>
  );
}
