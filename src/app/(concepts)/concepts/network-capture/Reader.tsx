'use client';

// Everything the capture carries, as a plain page: File ▸ Export ▸ As a Page. For anyone who
// would rather read than dissect.

import { useEffect, useRef } from 'react';
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
import { projectLinks } from '../_shared/links';
import { FILE_NAME } from './Dialogs';
import { Icon } from './ui';
import s from './capture.module.scss';

const { person, robots } = db;

function Project({
  p,
}: {
  p: { title: string; description: string; tech: string[]; links: db.ProjectLinks };
}) {
  const links = projectLinks(p.links);
  return (
    <li className={s.readItem}>
      <h4>{p.title}</h4>
      <p>{p.description}</p>
      <p className={s.readMeta}>{p.tech.join(' · ')}</p>
      {links.length > 0 && (
        <p className={s.readLinks}>
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
        </p>
      )}
    </li>
  );
}

export default function Reader({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => before?.focus?.();
  }, []);
  return (
    <div
      className={s.reader}
      role="dialog"
      aria-modal="true"
      aria-label="The capture, read as a page"
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}
    >
      <div className={s.readerBar}>
        <span className={s.dim}>
          File ▸ Export ▸ As a Page · <span className={s.mono}>{FILE_NAME}</span>
        </span>
        <button type="button" className={s.btn} onClick={onClose}>
          <Icon name="close" /> Back to the capture
        </button>
      </div>
      <div className={s.readerScroll} ref={ref} tabIndex={-1}>
        <article className={s.readerPage}>
          <header className={s.readHead}>
            <p className={s.readKicker}>{profile.headline}</p>
            <h1>{profile.name}</h1>
            <p className={s.readRole}>
              {profile.role},{' '}
              <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                {profile.company}
              </a>
            </p>
            <p className={s.readLede}>{profile.lede}</p>
            <ul className={s.readContact}>
              <li>
                <a href={`mailto:${profile.email}`}>{profile.email}</a>
              </li>
              <li>
                <a href={profile.linkedin} target="_blank" rel="noreferrer">
                  LinkedIn ↗
                </a>
              </li>
              <li>
                <a href={profile.github} target="_blank" rel="noreferrer">
                  GitHub ↗
                </a>
              </li>
              <li>
                <a href={profile.cv} target="_blank" rel="noreferrer">
                  CV (PDF) ↗
                </a>
              </li>
            </ul>
          </header>

          <section aria-labelledby="r-about">
            <h2 id="r-about">About</h2>
            {about.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <ul className={s.readStats}>
              {stats.map((x) => (
                <li key={x.label}>
                  <strong>{x.value}</strong> {x.label}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="r-roles">
            <h2 id="r-roles">Experience</h2>
            <ol className={s.readList}>
              {jobs.map((j) => (
                <li key={j.company + j.range} className={s.readItem}>
                  <h4>
                    {j.title},{' '}
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noreferrer">
                        {j.company}
                      </a>
                    ) : (
                      j.company
                    )}
                  </h4>
                  <p className={s.readMeta}>{j.range}</p>
                  <ul>
                    {j.duties.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="r-featured">
            <h2 id="r-featured">Featured projects</h2>
            <ul className={s.readList}>
              {featuredProjects.map((p) => (
                <Project key={p.title} p={p} />
              ))}
            </ul>
            <h3>More builds</h3>
            <ul className={s.readList}>
              {otherProjects.map((p) => (
                <Project key={p.title} p={p} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="r-hw">
            <h2 id="r-hw">Hardware in production</h2>
            <ul className={s.readList}>
              {hardware.map((d) => (
                <li key={d.tag} className={s.readItem}>
                  <h4>
                    {d.name} <span className={s.readMeta}>{d.tag}</span>
                  </h4>
                  <p className={s.readMeta}>{d.kind}</p>
                  <p>{d.detail}</p>
                  <p className={s.readFigures}>{d.figures.join(' · ')}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="r-oss">
            <h2 id="r-oss">Open source</h2>
            <p>Fixes to packages downloaded {db.downloads.weekly.long} times a week, combined.</p>
            <ul className={s.readList}>
              {oss.map((c) => (
                <li key={c.url} className={s.readItem}>
                  <h4>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.repo} ↗
                    </a>
                  </h4>
                  <p className={s.readMeta}>
                    {c.year} · {c.kind} · {c.stars} stars · {c.weekly} weekly downloads
                  </p>
                  <p>{c.change}</p>
                  <p className={s.dim}>{c.impact}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="r-roots">
            <h2 id="r-roots">Education and roots</h2>
            <ul className={s.readList}>
              {roots.map((r) => (
                <li key={r.title} className={s.readItem}>
                  <h4>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.title} ↗
                      </a>
                    ) : (
                      r.title
                    )}
                  </h4>
                  <p className={s.readMeta}>{r.year}</p>
                  <p>{r.detail}</p>
                </li>
              ))}
              <li className={s.readItem}>
                <h4>{robots.quadcopter.title}</h4>
                <p className={s.readMeta}>Undated</p>
                <p>{robots.quadcopter.detail}</p>
              </li>
            </ul>
          </section>

          <section aria-labelledby="r-skills">
            <h2 id="r-skills">Skills</h2>
            <p>{skills.join(' · ')}</p>
          </section>

          <section aria-labelledby="r-archive">
            <h2 id="r-archive">Everything built, by year</h2>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Build</th>
                    <th>Made at</th>
                    <th>Built with</th>
                  </tr>
                </thead>
                <tbody>
                  {archive.map((b) => {
                    const link = projectLinks(b.links)[0];
                    return (
                      <tr key={b.title}>
                        <td className={s.mono}>{b.year === '—' ? 'Undated' : b.year}</td>
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
                        <td className={s.dim}>{b.tech.join(', ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={s.readLinks}>
              {liveLinks.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </p>
          </section>

          <footer className={s.readFoot}>
            <p>
              {person.name} · <a href={`mailto:${person.email}`}>{person.email}</a> · Facts as of{' '}
              {fmt.month(db.asOf)}.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
