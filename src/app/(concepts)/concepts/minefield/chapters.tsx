import Image from 'next/image';
import type { ReactNode } from 'react';
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
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import s from './minefield.module.scss';

// The career, in the chapters a find opens: a brief that is open from the start, then one
// chapter per mark. The side panel and the read-as-a-page report render the same pieces.

const { person, current, downloads } = db;
const { robocup } = db.awards;
const neuroship = db.roles.neuroship;
const quad = db.robots.quadcopter;

const Out = ({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) => (
  <a href={href} target="_blank" rel="noreferrer" className={className}>
    {children}
  </a>
);

const Links = ({ links }: { links: Parameters<typeof projectLinks>[0] }) => {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <span className={s.links}>
      {items.map((l) => (
        <Out key={l.url} href={l.url}>
          {l.label} ↗
        </Out>
      ))}
    </span>
  );
};

/** The RoboCup result this simulation is modelled on, stated as it stands in the record. */
export const challengeLine = `${robocup.place} in the ${robocup.challenge} at ${robocup.event}, ${fmt.month(robocup.date)}.`;

/* ------------------------------------------------------------------ brief */

export function Brief({ how }: { how?: ReactNode }) {
  return (
    <div className={s.chapter}>
      <p className={s.role}>
        {profile.role} at <Out href={profile.companyUrl}>{profile.company}</Out>
        <span>{` · also ${db.titleOf(neuroship)} at ${neuroship.org}, on contract`}</span>
      </p>
      <p className={s.lede}>{profile.tagline}</p>
      {about.map((p) => (
        <p key={p.slice(0, 32)}>{p}</p>
      ))}
      <dl className={s.stats}>
        {stats.map((st) => (
          <div key={st.label}>
            <dt>{st.label}</dt>
            <dd>{st.value}</dd>
          </div>
        ))}
      </dl>
      <ul className={s.chips} aria-label="Toolchain">
        {skills.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <aside className={s.origin}>
        <h4>The challenge behind this</h4>
        <p>{challengeLine}</p>
        <p>
          What runs here is a simulation inspired by that challenge. The field, the robot and the
          detector are modelled for the simulation; none of it is the original robot&apos;s
          specification.
        </p>
      </aside>
      {how}
    </div>
  );
}

/* ------------------------------------------------------------------ 1 · roots */

function Roots() {
  return (
    <div className={s.chapter}>
      <ol className={s.timeline}>
        {roots.map((r) => (
          <li key={r.title}>
            <span className={s.when}>{r.year}</span>
            <div>
              <h4>{r.title}</h4>
              <p>{r.detail}</p>
              {r.url && <Out href={r.url}>Read the paper ↗</Out>}
            </div>
          </li>
        ))}
        <li>
          <span className={s.when}>undated</span>
          <div>
            <h4>{quad.title}</h4>
            <p>{quad.detail}</p>
          </div>
        </li>
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ 2 · roles */

function Roles() {
  return (
    <div className={s.chapter}>
      <ol className={s.roles}>
        {db.roleList.map((r) => (
          <li key={r.id} data-now={r.to ? undefined : true}>
            <div className={s.roleHead}>
              <h4>{r.url ? <Out href={r.url}>{r.short ?? r.org}</Out> : (r.short ?? r.org)}</h4>
              <span className={s.when}>{fmt.monthSpan(r.from, r.to)}</span>
            </div>
            <p className={s.title}>
              {db.titlePath(r)}
              {r.contract ? ' · contract' : ''}
            </p>
            <ul>
              {r.duties.map((d) => (
                <li key={d.slice(0, 40)}>{d}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ 3 · projects */

function Projects() {
  return (
    <div className={s.chapter}>
      <ul className={s.featured}>
        {featuredProjects.map((p) => (
          <li key={p.title}>
            <div className={s.shot}>
              <Image
                src={p.image}
                width={1280}
                height={800}
                alt={`${p.title} screenshot`}
                sizes="(max-width: 760px) 92vw, 360px"
              />
            </div>
            <div>
              <h4>{p.title}</h4>
              <p>{p.description}</p>
              <p className={s.stack}>{p.tech.join(' · ')}</p>
              <Links links={p.links} />
            </div>
          </li>
        ))}
      </ul>
      <h4 className={s.sub}>More builds</h4>
      <ul className={s.others}>
        {otherProjects.map((p) => (
          <li key={p.title}>
            <h5>{p.title}</h5>
            <p>{p.description}</p>
            <p className={s.stack}>{p.tech.join(' · ')}</p>
            <Links links={p.links} />
          </li>
        ))}
      </ul>
      <h4 className={s.sub}>In the stores</h4>
      <ul className={s.plain}>
        {liveLinks.map((l) => (
          <li key={l.url}>
            <Out href={l.url}>{l.label} ↗</Out>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ 4 · hardware */

function Hardware() {
  return (
    <div className={s.chapter}>
      <ul className={s.devices}>
        {hardware.map((d) => (
          <li key={d.tag}>
            <span className={s.tag}>{d.tag}</span>
            <h4>{d.name}</h4>
            <p className={s.kind}>{d.kind}</p>
            <p>{d.detail}</p>
            <ul className={s.chips}>
              {d.figures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ 5 · open source */

function OpenSource() {
  return (
    <div className={s.chapter}>
      <p>{`${fmt.Spell(oss.length)} fixes merged upstream, in packages downloaded ${downloads.weekly.long} times a week combined.`}</p>
      <ul className={s.prs}>
        {oss.map((c) => (
          <li key={c.repo}>
            <div className={s.roleHead}>
              <h4>
                <Out href={c.url}>{c.repo}</Out>
              </h4>
              <span className={s.when}>{c.year}</span>
            </div>
            <p className={s.kind}>
              {c.kind} · ★ {c.stars} · {c.weekly} weekly downloads
            </p>
            <p>{c.change}</p>
            <p className={s.impact}>{c.impact}</p>
            <Out href={c.url} className={s.pr}>
              The pull request ↗
            </Out>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ 6 · contact */

function Contact() {
  return (
    <div className={s.chapter}>
      <p>{`Write about a platform, a device or a team that needs building. I'm ${current.title} at ${current.company} and building since ${person.since}.`}</p>
      <a href={`mailto:${profile.email}`} className={s.email}>
        {profile.email}
      </a>
      <ul className={s.contact}>
        <li>
          <Out href={profile.linkedin}>LinkedIn ↗</Out>
        </li>
        <li>
          <Out href={profile.github}>GitHub ↗</Out>
        </li>
        <li>
          <Out href={profile.cv}>CV ↗</Out>
        </li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ the set */

export interface Chapter {
  id: string;
  title: string;
  blurb: string;
  Body: () => ReactNode;
}

export const CHAPTERS: Chapter[] = [
  { id: 'roots', title: 'Roots', blurb: 'Control systems, robots, a paper', Body: Roots },
  { id: 'roles', title: 'Roles', blurb: 'Every role, newest first', Body: Roles },
  { id: 'projects', title: 'Projects', blurb: 'Platforms, apps and builds', Body: Projects },
  { id: 'hardware', title: 'Hardware', blurb: 'Devices in production', Body: Hardware },
  { id: 'oss', title: 'Open source', blurb: 'Fixes merged upstream', Body: OpenSource },
  { id: 'contact', title: 'Contact', blurb: 'Email, LinkedIn, GitHub, CV', Body: Contact },
];

/** Every build by year, for the report. */
export function Archive() {
  return (
    <div className={s.archiveWrap}>
      <table className={s.archive}>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Build</th>
            <th scope="col">Where</th>
            <th scope="col">Stack</th>
          </tr>
        </thead>
        <tbody>
          {archive.map((b) => (
            <tr key={`${b.year}-${b.title}`}>
              <td>{b.year === '—' ? 'undated' : b.year}</td>
              <td>
                {b.title}
                <Links links={b.links} />
              </td>
              <td>{b.madeAt}</td>
              <td>{b.tech.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
