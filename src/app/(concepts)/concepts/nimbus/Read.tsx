'use client';

import { concept } from '../_shared/concepts';
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
} from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';
import { Icon, Mark } from './ui';
import { href } from './store';
import s from './console.module.scss';

const C = concept('nimbus');

function Links({ links }: { links: LinkItem[] }) {
  if (!links.length) return null;
  return (
    <span className={s.readLinks}>
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label}
        </a>
      ))}
    </span>
  );
}

export function Read() {
  const { person, robots } = db;
  return (
    <div className={s.read}>
      <header className={s.readBar}>
        <a href={href('')} className={s.btn}>
          <Icon name="left" size={16} /> Back to the console
        </a>
        <span className={s.readBrand}>
          <Mark size={20} /> Read as a page
        </span>
        <button type="button" className={s.btnGhost} onClick={() => window.print()}>
          Print
        </button>
      </header>
      <article className={s.readDoc}>
        <header>
          <h1 tabIndex={-1} data-page-title>
            {profile.name}
          </h1>
          <p className={s.readRole}>
            {profile.role}, <a href={profile.companyUrl}>{profile.company}</a> · {profile.headline}
          </p>
          <p className={s.readTag}>{profile.tagline}</p>
          <p>{profile.lede}</p>
          <p className={s.readContact}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV (PDF)
            </a>
          </p>
        </header>

        <section>
          <h2>About</h2>
          {about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <p className={s.readSkills}>{skills.join(' · ')}</p>
        </section>

        <section>
          <h2>Experience</h2>
          {db.roleList.map((r) => (
            <div key={r.id} className={s.readItem}>
              <h3>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.org}
                  </a>
                ) : (
                  r.org
                )}
                <span>{fmt.monthSpan(r.from, r.to)}</span>
              </h3>
              <p className={s.readMeta}>
                {db.titlePath(r)}
                {r.contract ? ' (contract)' : ''}
                {r.sector ? ` · ${r.sector}` : ''}
              </p>
              <ul>
                {r.duties.map((d) => (
                  <li key={d.slice(0, 30)}>{d}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2>Featured projects</h2>
          {featuredProjects.map((p) => (
            <div key={p.title} className={s.readItem}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.readMeta}>
                {p.tech.join(' · ')} <Links links={projectLinks(p.links)} />
              </p>
            </div>
          ))}
        </section>

        <section>
          <h2>Other projects</h2>
          {otherProjects.map((p) => (
            <div key={p.title} className={s.readItem}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.readMeta}>
                {p.tech.join(' · ')} <Links links={projectLinks(p.links)} />
              </p>
            </div>
          ))}
        </section>

        <section>
          <h2>Hardware in production</h2>
          {hardware.map((d) => (
            <div key={d.tag} className={s.readItem}>
              <h3>
                {d.name} <span>{d.tag}</span>
              </h3>
              <p className={s.readMeta}>{d.kind}</p>
              <p>{d.detail}</p>
              <p className={s.readMeta}>{d.figures.join(' · ')}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>Open source</h2>
          {oss.map((c) => (
            <div key={c.url} className={s.readItem}>
              <h3>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.repo}
                </a>
                <span>{c.year}</span>
              </h3>
              <p className={s.readMeta}>
                {c.kind} · {c.stars} stars · {c.weekly} weekly downloads
              </p>
              <p>
                {c.change} {c.impact}
              </p>
            </div>
          ))}
        </section>

        <section>
          <h2>Education and roots</h2>
          {roots.map((r) => (
            <div key={r.title} className={s.readItem}>
              <h3>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}
                <span>{r.year}</span>
              </h3>
              <p>{r.detail}</p>
            </div>
          ))}
          <div className={s.readItem}>
            <h3>
              {robots.quadcopter.title}
              <span>undated</span>
            </h3>
            <p>{robots.quadcopter.detail}</p>
          </div>
        </section>

        <section>
          <h2>Everything built, by year</h2>
          <ul className={s.readArchive}>
            {archive.map((b) => (
              <li key={`${b.year}-${b.title}`}>
                <span>{b.year}</span>
                <span>
                  {b.title}
                  {b.madeAt ? <small> · {b.madeAt}</small> : null}{' '}
                  <Links links={projectLinks(b.links)} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Email <a href={`mailto:${person.email}`}>{person.email}</a>, or find him on{' '}
            <a href={person.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>{' '}
            and{' '}
            <a href={person.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
            . The <a href={person.cv}>CV</a> is a PDF.
          </p>
        </section>
        <footer className={s.readFoot}>
          Concept {C.letter} · {C.name}, read as a page. Facts last checked {fmt.month(db.asOf)}.
        </footer>
      </article>
    </div>
  );
}
