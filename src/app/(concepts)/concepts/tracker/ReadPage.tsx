'use client';

// Everything in the tracker as one plain page: no board, no shortcuts, just the facts in order.

import { useEffect, useRef } from 'react';
import {
  archive,
  db,
  featuredProjects,
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
import { projectLinks } from '../_shared/links';
import { setReading } from './store';
import { Icon } from './kit';
import s from './tracker.module.scss';

function Links({ links }: { links: { label: string; url: string }[] }) {
  if (!links.length) return null;
  return (
    <p className={s.rpLinks}>
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label}
        </a>
      ))}
    </p>
  );
}

export default function ReadPage() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const pipe = db.builds.find((b) => b.year === '—' && b.madeAt === 'Robotics');

  return (
    <div className={s.reader} ref={ref} tabIndex={-1} role="document" aria-label="Read as a page">
      <div className={s.readerBar}>
        <button type="button" className={s.btn} onClick={() => setReading(false)}>
          <Icon name="chevron" size={12} className={s.flip} /> Back to the tracker
        </button>
        <span className={s.grow} />
        <a className={s.btn} href={profile.cv} target="_blank" rel="noreferrer">
          <Icon name="cv" size={14} /> CV
        </a>
      </div>
      <article className={s.readerDoc}>
        <header>
          <h1>{profile.name}</h1>
          <p className={s.rpRole}>
            {profile.role}, <a href={profile.companyUrl}>{profile.company}</a> · {profile.headline}
          </p>
          <p className={s.rpLede}>{profile.lede}</p>
          <p className={s.rpLinks}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV
            </a>
          </p>
        </header>

        <section>
          <h2>About</h2>
          {db.about.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <dl className={s.rpStats}>
            {stats.map((st) => (
              <div key={st.label}>
                <dt>{st.value}</dt>
                <dd>{st.label}</dd>
              </div>
            ))}
          </dl>
          <p>
            <b>Skills:</b> {skills.join(', ')}.
          </p>
        </section>

        <section>
          <h2>Experience</h2>
          {jobs.map((j) => (
            <div key={`${j.company}-${j.range}`} className={s.rpItem}>
              <h3>
                {j.title}, {j.url ? <a href={j.url}>{j.company}</a> : j.company}
              </h3>
              <p className={s.rpMeta}>{j.range}</p>
              <ul>
                {j.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2>Featured projects</h2>
          {featuredProjects.map((p) => (
            <div key={p.title} className={s.rpItem}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.rpMeta}>{p.tech.join(' · ')}</p>
              <Links links={projectLinks(p.links)} />
            </div>
          ))}
          <h2>Other projects</h2>
          {otherProjects.map((p) => (
            <div key={p.title} className={s.rpItem}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.rpMeta}>{p.tech.join(' · ')}</p>
              <Links links={projectLinks(p.links)} />
            </div>
          ))}
          <Links links={liveLinks} />
        </section>

        <section>
          <h2>Hardware in production</h2>
          {hardware.map((d) => (
            <div key={d.tag} className={s.rpItem}>
              <h3>
                {d.name} <span className={s.rpMeta}>{d.tag}</span>
              </h3>
              <p>
                {d.kind}. {d.detail}
              </p>
              <p className={s.rpMeta}>{d.figures.join(' · ')}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>Open source</h2>
          {oss.map((c) => (
            <div key={c.url} className={s.rpItem}>
              <h3>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.repo}
                </a>{' '}
                <span className={s.rpMeta}>
                  {c.year} · {c.kind} · {c.stars} stars · {c.weekly} weekly downloads
                </span>
              </h3>
              <p>
                {c.change} {c.impact}
              </p>
            </div>
          ))}
        </section>

        <section>
          <h2>Education and roots</h2>
          {roots.map((r) => (
            <div key={r.title} className={s.rpItem}>
              <h3>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}{' '}
                <span className={s.rpMeta}>{r.year}</span>
              </h3>
              <p>{r.detail}</p>
            </div>
          ))}
          <div className={s.rpItem}>
            <h3>
              {db.robots.quadcopter.title} <span className={s.rpMeta}>undated</span>
            </h3>
            <p>{db.robots.quadcopter.detail}</p>
          </div>
          {pipe && (
            <div className={s.rpItem}>
              <h3>
                {pipe.title} <span className={s.rpMeta}>undated</span>
              </h3>
            </div>
          )}
        </section>

        <section>
          <h2>Everything built, by year</h2>
          <div className={s.rpTableWrap}>
            <table className={s.rpTable}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Build</th>
                  <th>Where</th>
                  <th>Stack</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((b) => {
                  const link = projectLinks(b.links)[0];
                  return (
                    <tr key={`${b.year}-${b.title}`}>
                      <td>{b.year}</td>
                      <td>
                        {link ? (
                          <a href={link.url} target="_blank" rel="noreferrer">
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
        </section>

        <footer className={s.rpFoot}>
          <p>
            {profile.name} · <a href={`mailto:${profile.email}`}>{profile.email}</a> ·{' '}
            {db.person.site}
          </p>
        </footer>
      </article>
    </div>
  );
}
