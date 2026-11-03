'use client';

// The plain way in: a printable plant report with everything the displays hold, read top to
// bottom without operating anything.
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  liveLinks,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { concept } from '../_shared/concepts';
import { Links } from './Displays';
import s from './scada.module.scss';

const me = concept('scada');

export function Report() {
  return (
    <article className={s.report} aria-labelledby="report-title">
      <header className={s.reportHead}>
        <p className={s.kicker}>{`PLANT REPORT · ${fmt.iso(db.asOf)}`}</p>
        <h1 id="report-title">{profile.name}</h1>
        <p className={s.reportLede}>
          {`${profile.role} at `}
          <a href={profile.companyUrl} target="_blank" rel="noreferrer">
            {profile.company}
          </a>
          {`. ${profile.headline}. ${profile.tagline}`}
        </p>
        <p>{profile.lede}</p>
        <p className={s.links}>
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
        <button type="button" className={s.btn} onClick={() => window.print()}>
          Print report
        </button>
      </header>

      <section>
        <h2>About</h2>
        {about.map((p) => (
          <p key={p.slice(0, 20)}>{p}</p>
        ))}
        <p className={s.dim}>{skills.join(' · ')}</p>
        <dl className={s.reportKpis}>
          {stats.map((k) => (
            <div key={k.label}>
              <dt>{k.label}</dt>
              <dd>{k.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2>Experience</h2>
        {jobs.map((j) => (
          <div key={j.company} className={s.reportItem}>
            <h3>
              {j.title},{' '}
              {j.url ? (
                <a href={j.url} target="_blank" rel="noreferrer">
                  {j.company}
                </a>
              ) : (
                j.company
              )}
            </h3>
            <p className={s.dim}>{j.range}</p>
            <ul>
              {j.duties.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2>Products</h2>
        {featuredProjects.map((p) => (
          <div key={p.title} className={s.reportItem}>
            <h3>{p.title}</h3>
            <p>{p.description}</p>
            <p className={s.dim}>
              {p.tech.join(' · ')} <Links links={p.links} />
            </p>
          </div>
        ))}
        <h3 className={s.subhead}>More</h3>
        <ul className={s.reportList}>
          {otherProjects.map((p) => (
            <li key={p.title}>
              <b>{p.title}.</b> {p.description} <Links links={p.links} />
            </li>
          ))}
        </ul>
        <p className={s.links}>
          {liveLinks.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
        </p>
      </section>

      <section>
        <h2>Hardware in production</h2>
        <ul className={s.reportList}>
          {hardware.map((d) => (
            <li key={d.tag}>
              <b>{`${d.name} (${d.kind}).`}</b> {d.detail}{' '}
              <span className={s.dim}>{d.figures.join(' · ')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Open source</h2>
        <ul className={s.reportList}>
          {oss.map((c) => (
            <li key={c.url}>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.repo} ↗
              </a>{' '}
              <span
                className={s.dim}
              >{`${c.year} · ${c.kind} · ★ ${c.stars} · ${c.weekly}/wk`}</span>
              . {c.change} {c.impact}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Roots</h2>
        <ul className={s.reportList}>
          {roots.map((r) => (
            <li key={r.title}>
              <b>{r.year}</b>{' '}
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title} ↗
                </a>
              ) : (
                r.title
              )}
              . {r.detail}
            </li>
          ))}
          <li>
            <b>—</b> {db.robots.quadcopter.detail}
          </li>
        </ul>
      </section>

      <section>
        <h2>Every build</h2>
        <ul className={s.reportList}>
          {archive.map((b) => (
            <li key={b.title}>
              <b>{b.year}</b> {b.title}
              {b.madeAt ? `, ${b.madeAt}` : ''} <span className={s.dim}>{b.tech.join(', ')}</span>{' '}
              <Links links={b.links} />
            </li>
          ))}
        </ul>
      </section>

      <footer
        className={s.dim}
      >{`Concept ${me.letter} · ${me.name}. Plant figures are from the facts; flows, pressures, alarms and trends on the displays are a seeded simulation.`}</footer>
    </article>
  );
}
