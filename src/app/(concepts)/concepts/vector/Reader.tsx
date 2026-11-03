// "Read as page": everything in the file as a plain, semantic page, for anyone who would rather
// read than drive a design tool. It is server-rendered, so it is also what shows without JS.

import {
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
import s from './vector.module.scss';

export default function Reader({ open, onClose }: { open: boolean; onClose?: () => void }) {
  return (
    <div
      className={s.reader}
      id="read"
      hidden={!open}
      role="region"
      aria-label="The file as a page"
    >
      <div className={s.readerBar}>
        <span>
          {db.person.site} <span className={s.readerDim}>· read as a page</span>
        </span>
        {onClose && (
          <button type="button" className={s.readerClose} onClick={onClose}>
            Back to the file <kbd>Esc</kbd>
          </button>
        )}
      </div>
      <article className={s.readerBody}>
        <header className={s.readerHero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={db.person.photo}
            alt={profile.name}
            width={120}
            height={120}
            className={s.readerPhoto}
          />
          <p className={s.readerEyebrow}>
            {db.current.title} · <a href={db.current.companyUrl}>{db.current.company}</a>
          </p>
          <h1>{profile.name}</h1>
          <p className={s.readerLead}>{profile.tagline}</p>
          <p>{profile.lede}</p>
          <p className={s.readerLinks}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.linkedin}>LinkedIn</a>
            <a href={profile.github}>GitHub</a>
            <a href={profile.cv}>CV (PDF)</a>
          </p>
          <ul className={s.readerStats}>
            {db.headline.map((h) => (
              <li key={h.label}>
                <b>{h.value}</b> {h.label}
              </li>
            ))}
          </ul>
        </header>

        <section aria-labelledby="r-about">
          <h2 id="r-about">About</h2>
          {db.about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <h3>Skills</h3>
          <ul className={s.readerTags}>
            {db.skills.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="r-exp">
          <h2 id="r-exp">Experience</h2>
          {db.roleList.map((r) => (
            <article key={r.id} className={s.readerRole}>
              <h3>
                {r.url ? <a href={r.url}>{r.org}</a> : r.org}
                <span className={s.readerDim}>
                  {' '}
                  · {db.titlePath(r)}
                  {r.contract ? ' (contract)' : ''}
                </span>
              </h3>
              <p className={s.readerDate}>{fmt.monthSpan(r.from, r.to)}</p>
              <p>{r.summary}</p>
              <ul>
                {r.duties.map((d) => (
                  <li key={d.slice(0, 32)}>{d}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section aria-labelledby="r-projects">
          <h2 id="r-projects">Projects</h2>
          {featuredProjects.map((p) => (
            <article key={p.title} className={s.readerProject}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt="" loading="lazy" />
              <div>
                <h3>{p.title}</h3>
                <p>{p.description}</p>
                <p className={s.readerDim}>{p.tech.join(' · ')}</p>
                <p className={s.readerLinks}>
                  {projectLinks(p.links).map((l) => (
                    <a key={l.url} href={l.url}>
                      {l.label}
                    </a>
                  ))}
                </p>
              </div>
            </article>
          ))}
          <h3>Other projects</h3>
          <ul className={s.readerList}>
            {otherProjects.map((p) => (
              <li key={p.title}>
                <b>{p.title}</b>. {p.description}{' '}
                <span className={s.readerDim}>{p.tech.join(' · ')}</span>{' '}
                {projectLinks(p.links).map((l) => (
                  <a key={l.url} href={l.url}>
                    {l.label}
                  </a>
                ))}
              </li>
            ))}
          </ul>
          <h3>Archive</h3>
          <div className={s.readerTable}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col">Project</th>
                  <th scope="col">Made at</th>
                  <th scope="col">Built with</th>
                  <th scope="col">Link</th>
                </tr>
              </thead>
              <tbody>
                {db.builds.map((b) => {
                  const l = projectLinks(b.links)[0];
                  return (
                    <tr key={b.title}>
                      <td>{b.year}</td>
                      <td>{b.title}</td>
                      <td>{b.madeAt}</td>
                      <td>{b.tech.join(', ')}</td>
                      <td>{l ? <a href={l.url}>{l.label}</a> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="r-hw">
          <h2 id="r-hw">Hardware in production</h2>
          <ul className={s.readerList}>
            {hardware.map((h) => (
              <li key={h.tag}>
                <b>
                  {h.name} <span className={s.readerDim}>({h.tag})</span>
                </b>
                . {h.kind}. {h.detail} <span className={s.readerDim}>{h.figures.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="r-oss">
          <h2 id="r-oss">Open source</h2>
          <p>Packages with {db.downloads.weekly.long} weekly downloads between them.</p>
          <ul className={s.readerList}>
            {oss.map((c) => (
              <li key={c.url}>
                <b>{c.repo}</b>{' '}
                <span className={s.readerDim}>
                  ({c.kind}, {c.year}, ★ {c.stars}, {c.weekly} weekly)
                </span>
                . {c.change} {c.impact} <a href={c.url}>Pull request</a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="r-roots">
          <h2 id="r-roots">Education and roots</h2>
          <ul className={s.readerList}>
            {roots.map((r) => (
              <li key={r.title}>
                <b>{r.year}</b> · {r.title}. {r.detail} {r.url && <a href={r.url}>Read it</a>}
              </li>
            ))}
            <li>
              <b>Undated</b> · {db.robots.quadcopter.title}. {db.robots.quadcopter.detail}
            </li>
          </ul>
        </section>

        <section aria-labelledby="r-contact">
          <h2 id="r-contact">Contact</h2>
          <p className={s.readerLinks}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.linkedin}>LinkedIn</a>
            <a href={profile.github}>GitHub</a>
            <a href={profile.cv}>CV (PDF)</a>
          </p>
          <p className={s.readerLinks}>
            {liveLinks.map((l) => (
              <a key={l.url} href={l.url}>
                {l.label}
              </a>
            ))}
          </p>
        </section>
      </article>
    </div>
  );
}
