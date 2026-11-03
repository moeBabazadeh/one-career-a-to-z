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
import { linkList, splitFigure } from './Apps';
import { Icon } from './icons';
import s from './spatial.module.scss';

/** Everything in the windows, as one plain page: no space, no glass, nothing to drag. */
export default function Reader({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.scrollTop = 0;
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={s.reader}
      aria-labelledby="reader-title"
      onClose={onClose}
      onCancel={onClose}
    >
      <div className={s.readerBar}>
        <span>Reading as a page</span>
        <button type="button" className={`${s.pill} ${s.gz}`} onClick={onClose} autoFocus>
          <Icon name="close" size={16} />
          <span>Back to the space</span>
        </button>
      </div>
      <article className={s.readerBody}>
        <header>
          <h1 id="reader-title">{profile.name}</h1>
          <p className={s.lead}>
            {profile.role} at{' '}
            <a href={profile.companyUrl} target="_blank" rel="noreferrer">
              {profile.company}
            </a>
            . {profile.headline}.
          </p>
          <p>{profile.tagline}</p>
          <p>
            <a href={`mailto:${profile.email}`}>{profile.email}</a> ·{' '}
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>{' '}
            ·{' '}
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub
            </a>{' '}
            · <a href={profile.cv}>CV (PDF)</a>
          </p>
        </header>

        <section>
          <h2>About</h2>
          <p>{profile.lede}</p>
          {about.map((p) => (
            <p key={p.slice(0, 32)}>{p}</p>
          ))}
          <ul className={s.readerStats}>
            {stats.map((st) => (
              <li key={st.label}>
                <b>{st.value}</b> {st.label}
              </li>
            ))}
          </ul>
          <p>Works in: {skills.join(', ')}.</p>
        </section>

        <section>
          <h2>Experience</h2>
          {jobs.map((j) => (
            <div key={j.company + j.range}>
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
              <p className={s.readerWhen}>{j.range}</p>
              <ul>
                {j.duties.map((d) => (
                  <li key={d.slice(0, 40)}>{d}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2>Projects</h2>
          {[...featuredProjects, ...otherProjects].map((p) => (
            <div key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.readerWhen}>
                {p.tech.join(' · ')}
                {linkList(p.links).map((l) => (
                  <span key={l.url}>
                    {' · '}
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.label}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          ))}
          <h3>Every build</h3>
          <ul>
            {archive.map((b) => {
              const first = linkList(b.links)[0];
              return (
                <li key={b.title}>
                  {b.year} ·{' '}
                  {first ? (
                    <a href={first.url} target="_blank" rel="noreferrer">
                      {b.title}
                    </a>
                  ) : (
                    b.title
                  )}
                  {b.madeAt ? `, ${b.madeAt}` : ''} ({b.tech.join(', ')})
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2>Hardware</h2>
          {hardware.map((d) => (
            <div key={d.tag}>
              <h3>
                {d.name} <small>{d.tag}</small>
              </h3>
              <p>
                {d.kind}. {d.detail}
              </p>
              <p className={s.readerWhen}>
                {d.figures
                  .map((f) => splitFigure(f))
                  .map((f) => (f.label ? `${f.value} ${f.label}` : f.value))
                  .join(' · ')}
              </p>
            </div>
          ))}
        </section>

        <section>
          <h2>Open source</h2>
          <p>
            {db.downloads.weekly.short}{' '}
            {stats.find((st) => st.value === db.downloads.weekly.short)?.label}.
          </p>
          {oss.map((o) => (
            <div key={o.url}>
              <h3>
                <a href={o.url} target="_blank" rel="noreferrer">
                  {o.repo} #{o.url.split('/').pop()}
                </a>{' '}
                <small>
                  {o.kind}, {o.year}
                </small>
              </h3>
              <p>
                {o.change} {o.impact}
              </p>
              <p className={s.readerWhen}>
                {o.stars} stars · {o.weekly} weekly downloads
              </p>
            </div>
          ))}
        </section>

        <section>
          <h2>Roots</h2>
          <ul>
            {roots.map((r) => (
              <li key={r.title}>
                <b>{r.year}</b> ·{' '}
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}
                . {r.detail}
              </li>
            ))}
            <li>
              <b>Undated</b> · {db.robots.quadcopter.title}. {db.robots.quadcopter.detail}
            </li>
          </ul>
        </section>

        <section>
          <h2>Contact</h2>
          <ul>
            <li>
              Email: <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </li>
            <li>
              LinkedIn:{' '}
              <a href={profile.linkedin} target="_blank" rel="noreferrer">
                {profile.linkedin}
              </a>
            </li>
            <li>
              GitHub:{' '}
              <a href={profile.github} target="_blank" rel="noreferrer">
                {profile.github}
              </a>
            </li>
            <li>
              CV: <a href={profile.cv}>PDF</a>
            </li>
            {(db.storeApps as db.Product[]).map((p) => (
              <li key={p.title}>
                {p.title}:{' '}
                {linkList({ appStore: p.links.appStore, playStore: p.links.playStore }).map(
                  (l, i) => (
                    <span key={l.url}>
                      {i ? ' · ' : ''}
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.label}
                      </a>
                    </span>
                  ),
                )}
              </li>
            ))}
          </ul>
          <p className={s.readerWhen}>Facts as of {fmt.month(db.asOf)}.</p>
        </section>
      </article>
    </dialog>
  );
}
