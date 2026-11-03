'use client';

// Everything on the phone as one plain page, for reading without the device.
import Image from 'next/image';
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
  skills,
} from '../_shared/data';
import { concept } from '../_shared/concepts';
import { projectLinks } from '../_shared/links';
import { Icon } from './icons';
import s from './mobile.module.scss';

const me = concept('mobile');
const years = [...new Set(archive.map((b) => b.year))];

export function Article({ onBack }: { onBack: () => void }) {
  return (
    <article className={s.article}>
      <nav className={s.articleNav}>
        <button type="button" onClick={onBack}>
          <Icon name="chevronLeft" size={18} /> Back to the phone
        </button>
        <span>
          {me.letter} · {me.name}
        </span>
      </nav>

      <header className={s.aHead}>
        <Image
          className={s.aPhoto}
          src={db.person.photo}
          alt={profile.name}
          width={240}
          height={240}
        />
        <div>
          <h1>{profile.name}</h1>
          <p className={s.aRole}>
            {profile.role}, <a href={profile.companyUrl}>{profile.company}</a>
          </p>
          <p className={s.aLede}>{profile.lede}</p>
          <ul className={s.aContact}>
            <li>
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </li>
            <li>
              <a href={profile.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            </li>
            <li>
              <a href={profile.github} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </li>
            <li>
              <a href={profile.cv} target="_blank" rel="noopener noreferrer">
                CV (PDF)
              </a>
            </li>
          </ul>
        </div>
      </header>

      <section className={s.aSection} aria-labelledby="a-about">
        <h2 id="a-about">About</h2>
        <p>{profile.tagline}</p>
        {about.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <dl className={s.aStats}>
          {db.headline.map((h) => (
            <div key={h.label}>
              <dt>{h.label}</dt>
              <dd>{h.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={s.aSection} aria-labelledby="a-work">
        <h2 id="a-work">Experience</h2>
        <ol className={s.aRoles}>
          {db.roleList.map((r) => (
            <li key={r.id}>
              <p className={s.aWhen}>{fmt.monthSpan(r.from, r.to)}</p>
              <h3>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.org}
                  </a>
                ) : (
                  r.org
                )}
              </h3>
              <p className={s.aTitle}>
                {db.titlePath(r)}
                {r.contract ? ' (contract)' : ''}
              </p>
              <ul>
                {r.duties.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.aSection} aria-labelledby="a-projects">
        <h2 id="a-projects">Projects</h2>
        <div className={s.aFeatured}>
          {featuredProjects.map((p) => (
            <figure key={p.title}>
              <Image
                src={p.image}
                alt={`${p.title} screenshot`}
                width={640}
                height={400}
                sizes="(max-width: 700px) 100vw, 420px"
              />
              <figcaption>
                <h3>{p.title}</h3>
                <p>{p.description}</p>
                <p className={s.aTech}>{p.tech.join(' · ')}</p>
                <p className={s.aLinks}>
                  {projectLinks(p.links).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.label}
                    </a>
                  ))}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
        <h3 className={s.aSub}>More</h3>
        <ul className={s.aOther}>
          {otherProjects.map((p) => (
            <li key={p.title}>
              <h4>{p.title}</h4>
              <p>{p.description}</p>
              <p className={s.aTech}>{p.tech.join(' · ')}</p>
              {projectLinks(p.links).length > 0 && (
                <p className={s.aLinks}>
                  {projectLinks(p.links).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.label}
                    </a>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
        <h3 className={s.aSub}>On the stores</h3>
        <ul className={s.aStores}>
          {liveLinks.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.aSection} aria-labelledby="a-hardware">
        <h2 id="a-hardware">Hardware in production</h2>
        <ul className={s.aDevices}>
          {hardware.map((d) => (
            <li key={d.tag}>
              <p className={s.aWhen}>{d.tag}</p>
              <h3>{d.name}</h3>
              <p className={s.aTitle}>{d.kind}</p>
              <p>{d.detail}</p>
              <p className={s.aTech}>{d.figures.join(' · ')}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.aSection} aria-labelledby="a-oss">
        <h2 id="a-oss">Open source</h2>
        <ul className={s.aOss}>
          {oss.map((c) => (
            <li key={c.url}>
              <p className={s.aWhen}>
                {c.year} · {c.kind}
              </p>
              <h3>
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.repo}
                </a>
              </h3>
              <p>{c.change}</p>
              <p className={s.aTech}>
                {c.impact} ★ {c.stars} · {c.weekly} weekly downloads
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.aSection} aria-labelledby="a-roots">
        <h2 id="a-roots">Education and roots</h2>
        <ol className={s.aRoots}>
          {roots.map((r) => (
            <li key={r.title}>
              <p className={s.aWhen}>{r.year}</p>
              <h3>{r.url ? <a href={r.url}>{r.title}</a> : r.title}</h3>
              <p>{r.detail}</p>
            </li>
          ))}
          <li>
            <p className={s.aWhen}>No date on record</p>
            <h3>{db.robots.quadcopter.title}</h3>
            <p>{db.robots.quadcopter.detail}</p>
          </li>
        </ol>
      </section>

      <section className={s.aSection} aria-labelledby="a-skills">
        <h2 id="a-skills">Skills</h2>
        <ul className={s.aSkills}>
          {skills.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      </section>

      <section className={s.aSection} aria-labelledby="a-archive">
        <h2 id="a-archive">Archive</h2>
        {years.map((y) => (
          <div key={y} className={s.aYear}>
            <h3>{y === '—' ? 'In production' : y}</h3>
            <ul>
              {archive
                .filter((b) => b.year === y)
                .map((b) => {
                  const url = b.links.external ?? b.links.github ?? b.links.appStore;
                  return (
                    <li key={b.title}>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {b.title}
                        </a>
                      ) : (
                        b.title
                      )}
                      <span>
                        {b.madeAt ? `${b.madeAt} · ` : ''}
                        {b.tech.join(', ')}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </section>

      <footer className={s.aFoot}>
        <p>
          Facts checked {fmt.month(db.asOf)}.{' '}
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
        </p>
        <button type="button" onClick={onBack}>
          <Icon name="phone" size={16} /> Back to the phone
        </button>
      </footer>
    </article>
  );
}
