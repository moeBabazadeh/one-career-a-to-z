'use client';

// The project's notes: everything the site says, as a plain page. It opens from the Notes tab
// or "Read as page", and it reads the same facts as the viewer, from db.
import {
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
  stats,
  archive,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { Icon } from './icons';
import { DEVICE_IDS, type DeviceId } from './models';
import s from './viewer.module.scss';

const SECTIONS = [
  ['n-profile', 'Profile'],
  ['n-roles', 'Roles'],
  ['n-hardware', 'Hardware'],
  ['n-projects', 'Projects'],
  ['n-oss', 'Open source'],
  ['n-roots', 'Roots'],
  ['n-archive', 'Archive'],
  ['n-contact', 'Contact'],
] as const;

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <p className={s.nLinks}>
      {items.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label}
          <Icon name="out" size={11} />
        </a>
      ))}
    </p>
  );
}

export function Notes({ onOpen, onBack }: { onOpen(id: DeviceId): void; onBack(): void }) {
  const { person, current } = db;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start' });

  return (
    <div className={s.notes}>
      <nav className={s.toc} aria-label="Notes contents">
        <button type="button" className={s.back} onClick={onBack}>
          <Icon name="cube" size={14} />
          Back to the model
        </button>
        <p className={s.tocHead}>Contents</p>
        <ol>
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <button type="button" onClick={() => go(id)}>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <article className={s.doc}>
        <header className={s.docHead}>
          <p className={s.kicker}>{`Project notes · ${person.site}`}</p>
          <h1>{profile.name}</h1>
          <p className={s.lede}>
            <b>{profile.role}</b>
            {' at '}
            <a href={profile.companyUrl} target="_blank" rel="noreferrer">
              {profile.company}
            </a>
            {`, since ${fmt.month(current.since)}. ${profile.headline}.`}
          </p>
          <p className={s.tagline}>{profile.tagline}</p>
        </header>

        <section id="n-profile" className={s.nSec}>
          <h2>Profile</h2>
          <p>{profile.lede}</p>
          {about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <ul className={s.statGrid}>
            {stats.map((st) => (
              <li key={st.label}>
                <b>{st.value}</b>
                <span>{st.label}</span>
              </li>
            ))}
          </ul>
          <p className={s.skills}>
            {skills.map((k) => (
              <span key={k}>{k}</span>
            ))}
          </p>
        </section>

        <section id="n-roles" className={s.nSec}>
          <h2>Roles</h2>
          <ol className={s.roles}>
            {db.roleList.map((r) => (
              <li key={r.id}>
                <p className={s.when}>{fmt.monthSpan(r.from, r.to)}</p>
                <h3>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.org}
                    </a>
                  ) : (
                    r.org
                  )}
                  <span>{`${db.titlePath(r)}${r.contract ? ' (contract)' : ''}`}</span>
                </h3>
                <p className={s.summary}>{r.summary}</p>
                <ul>
                  {r.duties.map((d) => (
                    <li key={d.slice(0, 32)}>{d}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <section id="n-hardware" className={s.nSec}>
          <h2>Hardware</h2>
          <p>{`${DEVICE_IDS.length} devices in production. Open any of them in the viewer.`}</p>
          <ul className={s.devList}>
            {DEVICE_IDS.map((id) => {
              const h = hardware.find((x) => x.tag === db.devices[id].tag);
              const dev = db.devices[id];
              return (
                <li key={id}>
                  <p className={s.devTag}>
                    <span>{dev.tag}</span>
                    {dev.kind}
                  </p>
                  <h3>{dev.name}</h3>
                  <p>{dev.detail}</p>
                  <p className={s.figLine}>{(h?.figures ?? []).join(' · ')}</p>
                  {'chip' in dev && <p className={s.fine}>{`Main chip: ${dev.chip}`}</p>}
                  <button type="button" className={s.ghostBtn} onClick={() => onOpen(id)}>
                    <Icon name="cube" size={14} />
                    Open in the viewer
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="n-projects" className={s.nSec}>
          <h2>Projects</h2>
          <h3 className={s.sub}>Featured</h3>
          <ul className={s.projects}>
            {featuredProjects.map((p) => (
              <li key={p.title}>
                <h4>{p.title}</h4>
                <p>{p.description}</p>
                <p className={s.tech}>{p.tech.join(' · ')}</p>
                <Links links={p.links} />
              </li>
            ))}
          </ul>
          <h3 className={s.sub}>More builds and fixes</h3>
          <ul className={s.projects} data-compact>
            {otherProjects.map((p) => (
              <li key={p.title}>
                <h4>{p.title}</h4>
                <p>{p.description}</p>
                <p className={s.tech}>{p.tech.join(' · ')}</p>
                <Links links={p.links} />
              </li>
            ))}
          </ul>
        </section>

        <section id="n-oss" className={s.nSec}>
          <h2>Open source</h2>
          <p>{`Fixes to packages with ${db.downloads.weekly.long} weekly downloads between them, each one a pull request.`}</p>
          <ul className={s.oss}>
            {oss.map((c) => (
              <li key={c.url}>
                <p className={s.ossHead}>
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.repo}
                  </a>
                  <span>{`${c.kind} · ${c.year} · ${c.stars} stars · ${c.weekly} weekly`}</span>
                </p>
                <p>{c.change}</p>
                <p className={s.fine}>{c.impact}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="n-roots" className={s.nSec}>
          <h2>Roots</h2>
          <ol className={s.rootsList}>
            {roots.map((r) => (
              <li key={r.title}>
                <span className={s.when}>{r.year}</span>
                <div>
                  <h3>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
                  </h3>
                  <p>{r.detail}</p>
                </div>
              </li>
            ))}
            <li>
              <span className={s.when}>Undated</span>
              <div>
                <h3>{db.robots.quadcopter.title}</h3>
                <p>{db.robots.quadcopter.detail}</p>
              </div>
            </li>
          </ol>
        </section>

        <section id="n-archive" className={s.nSec}>
          <h2>Archive</h2>
          <div
            className={s.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Every build by year"
          >
            <table className={s.archive}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Build</th>
                  <th>Made at</th>
                  <th>Stack</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((b) => {
                  const link = projectLinks(b.links)[0];
                  return (
                    <tr key={`${b.year}-${b.title}`}>
                      <td>{b.year === '—' ? 'Undated' : b.year}</td>
                      <td>
                        {link ? (
                          <a href={link.url} target="_blank" rel="noreferrer">
                            {b.title}
                          </a>
                        ) : (
                          b.title
                        )}
                      </td>
                      <td>{b.madeAt ?? ''}</td>
                      <td>{b.tech.join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section id="n-contact" className={s.nSec}>
          <h2>Contact</h2>
          <ul className={s.contact}>
            <li>
              <span>Email</span>
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </li>
            <li>
              <span>LinkedIn</span>
              <a href={profile.linkedin} target="_blank" rel="noreferrer">
                {profile.linkedin.replace(/^https:\/\/(www\.)?/, '')}
              </a>
            </li>
            <li>
              <span>GitHub</span>
              <a href={profile.github} target="_blank" rel="noreferrer">
                {profile.github.replace(/^https:\/\//, '')}
              </a>
            </li>
            <li>
              <span>CV</span>
              <a href={profile.cv} target="_blank" rel="noreferrer">
                Download the CV (PDF)
              </a>
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}
