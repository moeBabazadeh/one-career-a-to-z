'use client';

import { useEffect, useRef } from 'react';
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
import { useStore } from './store';
import { Icon } from './ui';
import s from './sheet.module.scss';

// Everything in the workbook as a plain page, for reading without the tool.

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <p className={s.rLinks}>
      {items.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
          {l.label}
        </a>
      ))}
    </p>
  );
}

export default function Reader() {
  const st = useStore();
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    head.current?.focus();
    window.scrollTo({ top: 0 });
  }, []);
  const { quadcopter } = db.robots;
  return (
    <div className={s.reader}>
      <div className={s.rBar}>
        <button type="button" className={s.readBtn} onClick={() => st.set({ reader: false })}>
          <Icon.sheet />
          <span>Back to the spreadsheet</span>
        </button>
      </div>
      <article className={s.rPage}>
        <header>
          <h1 ref={head} tabIndex={-1}>
            {profile.name}
          </h1>
          <p className={s.rRole}>
            {profile.role} at{' '}
            <a href={profile.companyUrl} target="_blank" rel="noopener noreferrer">
              {profile.company}
            </a>
            . {profile.headline}.
          </p>
          <p className={s.rLede}>{profile.lede}</p>
          <p className={s.rLinks}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.linkedin} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            <a href={profile.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href={profile.cv}>CV (PDF)</a>
          </p>
        </header>

        <section aria-labelledby="r-figures">
          <h2 id="r-figures">In figures</h2>
          <dl className={s.rFigures}>
            {stats.map((x) => (
              <div key={x.label}>
                <dt>{x.label}</dt>
                <dd>{x.value}</dd>
              </div>
            ))}
            <div>
              <dt>years building</dt>
              <dd>{db.yearsBuilding}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="r-about">
          <h2 id="r-about">About</h2>
          {about.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p>
            <b>Skills:</b> {fmt.list(skills)}.
          </p>
        </section>

        <section aria-labelledby="r-roles">
          <h2 id="r-roles">Experience</h2>
          {jobs.map((j) => (
            <div key={j.company + j.range} className={s.rItem}>
              <h3>
                {j.title} ·{' '}
                {j.url ? (
                  <a href={j.url} target="_blank" rel="noopener noreferrer">
                    {j.company}
                  </a>
                ) : (
                  j.company
                )}
              </h3>
              <p className={s.rMeta}>{j.range}</p>
              <ul>
                {j.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section aria-labelledby="r-featured">
          <h2 id="r-featured">Featured projects</h2>
          {featuredProjects.map((p) => (
            <div key={p.title} className={s.rItem}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.rMeta}>{p.tech.join(' · ')}</p>
              <Links links={p.links} />
            </div>
          ))}
          <h2>Other projects</h2>
          {otherProjects.map((p) => (
            <div key={p.title} className={s.rItem}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.rMeta}>{p.tech.join(' · ')}</p>
              <Links links={p.links} />
            </div>
          ))}
        </section>

        <section aria-labelledby="r-hardware">
          <h2 id="r-hardware">Hardware in production</h2>
          {hardware.map((d) => (
            <div key={d.tag} className={s.rItem}>
              <h3>
                {d.name} <span className={s.rMeta}>{d.tag}</span>
              </h3>
              <p>
                {d.kind}. {d.detail}
              </p>
              <p className={s.rMeta}>{d.figures.join(' · ')}</p>
            </div>
          ))}
        </section>

        <section aria-labelledby="r-oss">
          <h2 id="r-oss">Open source</h2>
          {oss.map((c) => (
            <div key={c.url} className={s.rItem}>
              <h3>
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.repo}
                </a>{' '}
                <span className={s.rMeta}>
                  {c.year} · {c.kind} · {c.stars} stars · {c.weekly} weekly downloads
                </span>
              </h3>
              <p>
                {c.change} {c.impact}
              </p>
            </div>
          ))}
        </section>

        <section aria-labelledby="r-roots">
          <h2 id="r-roots">Education and roots</h2>
          <ul className={s.rRoots}>
            {roots.map((r) => (
              <li key={r.title}>
                <b>{r.year}</b>{' '}
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}
                . {r.detail}
              </li>
            ))}
            <li>
              <b>Undated</b> {quadcopter.title}. {quadcopter.detail}
            </li>
          </ul>
        </section>

        <section aria-labelledby="r-archive">
          <h2 id="r-archive">Archive</h2>
          <table className={s.rTable}>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Build</th>
                <th scope="col">Made at</th>
                <th scope="col">Link</th>
              </tr>
            </thead>
            <tbody>
              {archive.map((b) => {
                const l = projectLinks(b.links)[0];
                return (
                  <tr key={b.title}>
                    <td>{b.year}</td>
                    <td>{b.title}</td>
                    <td>{b.madeAt}</td>
                    <td>
                      {l && (
                        <a href={l.url} target="_blank" rel="noopener noreferrer">
                          {l.label}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <footer className={s.rFoot}>
          <p>
            Write to <a href={`mailto:${profile.email}`}>{profile.email}</a>, or find me on{' '}
            <a href={profile.linkedin} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>{' '}
            and{' '}
            <a href={profile.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            .
          </p>
        </footer>
      </article>
    </div>
  );
}
