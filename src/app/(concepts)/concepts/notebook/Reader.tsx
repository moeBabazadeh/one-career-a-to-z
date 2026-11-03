// "Read as a page": everything the notebook computes, as a plain document, for anyone who would
// rather read than run cells. Built straight from the shared data, not from the kernel.
import {
  about,
  db,
  featuredProjects,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { I } from './icons';
import s from './notebook.module.scss';

const undated = [
  db.robots.quadcopter.title,
  ...db.builds.filter((b) => b.madeAt === 'Robotics' && b.year === '—').map((b) => b.title),
];

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

export default function Reader({ onBack }: { onBack: () => void }) {
  return (
    <article className={s.reader} aria-labelledby="reader-title">
      <p className={s.rBack}>
        <button type="button" onClick={onBack}>
          <I.back /> Back to the notebook
        </button>
      </p>
      <header>
        <h1 id="reader-title">{profile.name}</h1>
        <p className={s.rLede}>
          <strong>{profile.headline}.</strong> {profile.tagline}
        </p>
        <p>{profile.lede}</p>
      </header>

      <section>
        <h2>About</h2>
        {about.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className={s.rMeta}>Works in: {skills.join(', ')}</p>
      </section>

      <section>
        <h2>Experience</h2>
        {jobs.map((j) => (
          <div key={j.company + j.range} className={s.rItem}>
            <h3>
              {j.title} · {j.url ? <a href={j.url}>{j.company}</a> : j.company}
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

      <section>
        <h2>Featured products</h2>
        {featuredProjects.map((p) => (
          <div key={p.title} className={s.rItem}>
            <h3>{p.title}</h3>
            <p>{p.description}</p>
            <p className={s.rMeta}>{p.tech.join(' · ')}</p>
            <Links links={p.links} />
          </div>
        ))}
        <h2>More builds, sites and fixes</h2>
        {otherProjects.map((p) => (
          <div key={p.title} className={s.rItem}>
            <h3>{p.title}</h3>
            <p>{p.description}</p>
            <p className={s.rMeta}>{p.tech.join(' · ')}</p>
            <Links links={p.links} />
          </div>
        ))}
      </section>

      <section>
        <h2>Devices in production</h2>
        {hardware.map((d) => (
          <div key={d.tag} className={s.rItem}>
            <h3>
              {d.name} <span className={s.rMeta}>· {d.tag}</span>
            </h3>
            <p>
              {d.kind}. {d.detail}
            </p>
            <p className={s.rMeta}>{d.figures.join(' · ')}</p>
          </div>
        ))}
      </section>

      <section>
        <h2>Open source</h2>
        {oss.map((c) => (
          <div key={c.url} className={s.rItem}>
            <h3>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.repo}
              </a>{' '}
              <span className={s.rMeta}>
                · {c.kind} · {c.year} · {c.weekly} weekly downloads
              </span>
            </h3>
            <p>
              {c.change} {c.impact}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2>Roots</h2>
        {roots.map((r) => (
          <div key={r.title} className={s.rItem}>
            <h3>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title}
                </a>
              ) : (
                r.title
              )}{' '}
              <span className={s.rMeta}>· {r.year}</span>
            </h3>
            <p>{r.detail}</p>
          </div>
        ))}
        {undated.map((t) => (
          <div key={t} className={s.rItem}>
            <h3>
              {t} <span className={s.rMeta}>· undated</span>
            </h3>
          </div>
        ))}
      </section>

      <section>
        <h2>Contact</h2>
        <ul className={s.rContact}>
          <li>
            Email <a href={`mailto:${profile.email}`}>{profile.email}</a>
          </li>
          <li>
            LinkedIn{' '}
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              {profile.linkedin.replace(/^https:\/\/(www\.)?/, '')}
            </a>
          </li>
          <li>
            GitHub{' '}
            <a href={profile.github} target="_blank" rel="noreferrer">
              {profile.github.replace(/^https:\/\//, '')}
            </a>
          </li>
          <li>
            CV{' '}
            <a href={profile.cv} target="_blank" rel="noreferrer">
              PDF
            </a>
          </li>
        </ul>
      </section>
    </article>
  );
}
