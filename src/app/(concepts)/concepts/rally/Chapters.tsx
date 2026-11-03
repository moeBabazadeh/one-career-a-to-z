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
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import s from './rally.module.scss';

// The page, in nine chapters. Each lives in a zone on the bot's half of the table: land a ball
// there and it opens. Every fact is read from the shared data.

export interface Chapter {
  id: string;
  title: string;
  /** The label painted in its zone. */
  short: string;
}

export const CHAPTERS: Chapter[] = [
  { id: 'about', title: 'About', short: 'About' },
  { id: 'experience', title: 'Experience', short: 'Experience' },
  { id: 'products', title: 'Products', short: 'Products' },
  { id: 'hardware', title: 'Hardware', short: 'Hardware' },
  { id: 'open-source', title: 'Open source', short: 'Open source' },
  { id: 'numbers', title: 'Numbers', short: 'Numbers' },
  { id: 'education', title: 'Education & awards', short: 'Education' },
  { id: 'contact', title: 'Contact', short: 'Contact' },
  { id: 'cv', title: 'CV', short: 'CV' },
];

/**
 * Which chapter each zone holds, by zone (row × 3 + column; rows short, half-long, long from the
 * net, columns left to right as you face them). About sits in the middle, where a first ball
 * lands; the rest fan out from there.
 */
export const ZONES = [7, 6, 8, 4, 0, 5, 3, 1, 2];

const { person, current } = db;

const Out = ({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <a href={href} target="_blank" rel="noreferrer" className={className}>
    {children}
  </a>
);

function About() {
  return (
    <>
      <p className={s.lead}>{profile.tagline}</p>
      {about.map((p) => (
        <p key={p.slice(0, 24)}>{p}</p>
      ))}
      <ul className={s.chips} aria-label="Skills">
        {skills.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    </>
  );
}

function Experience({ compact }: { compact: boolean }) {
  return (
    <ol className={s.roles}>
      {db.roleList.map((r) => (
        <li key={r.id}>
          <div className={s.roleHead}>
            <b>{r.url ? <Out href={r.url}>{r.org}</Out> : r.org}</b>
            <span>{fmt.yearSpan(r.from, r.to, '–', 'now')}</span>
          </div>
          <p className={s.roleTitle}>
            {db.titlePath(r)}
            {r.contract ? ', on contract' : ''}
          </p>
          {compact ? (
            <p>{r.summary}</p>
          ) : (
            <ul className={s.duties}>
              {r.duties.map((d) => (
                <li key={d.slice(0, 24)}>{d}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
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
}

function Products({ compact }: { compact: boolean }) {
  return (
    <>
      <ul className={s.products}>
        {featuredProjects.map((p) => (
          <li key={p.title}>
            <b>{p.title}</b>
            <p className={compact ? s.clamp : undefined}>{p.description}</p>
            <span className={s.tech}>{p.tech.join(' · ')}</span>
            <Links links={p.links} />
          </li>
        ))}
      </ul>
      <h4 className={s.minor}>Smaller builds and fixes</h4>
      <ul className={s.others}>
        {otherProjects.map((p) => (
          <li key={p.title}>
            <b>{p.title}</b>
            {!compact && <p>{p.description}</p>}
            <Links links={p.links} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Hardware() {
  return (
    <ul className={s.devices}>
      {hardware.map((d) => (
        <li key={d.tag}>
          <span className={s.tag}>{d.tag}</span>
          <b>{d.name}</b>
          <i>{d.kind}</i>
          <p>{d.detail}</p>
          <span className={s.figures}>
            {d.figures.map((f) => (
              <em key={f}>{f}</em>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OpenSource() {
  return (
    <>
      <p className={s.lead}>
        <b className={s.big}>{db.downloads.weekly.short}</b> weekly downloads, combined, of the
        packages these fixes went into.
      </p>
      <ul className={s.prs}>
        {oss.map((c) => (
          <li key={c.url}>
            <div className={s.roleHead}>
              <Out href={c.url}>{c.repo} ↗</Out>
              <span>
                {c.kind} · {c.year}
              </span>
            </div>
            <p>{c.change}</p>
            <p className={s.impact}>{c.impact}</p>
            <span className={s.tech}>
              {c.stars} stars · {c.weekly} weekly downloads
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

const NUMBERS = [
  { value: String(db.yearsBuilding), label: `years building, since ${person.since}` },
  ...stats,
];

function Numbers() {
  return (
    <ul className={s.numbers}>
      {NUMBERS.map((n) => (
        <li key={n.label}>
          <b>{n.value}</b>
          <span>{n.label}</span>
        </li>
      ))}
    </ul>
  );
}

function Education() {
  const quad = db.robots.quadcopter;
  return (
    <ol className={s.roots}>
      {roots.map((r) => (
        <li key={r.title}>
          <span className={s.year}>{r.year}</span>
          <div>
            <b>{r.title}</b>
            <p>{r.detail}</p>
            {r.url && <Out href={r.url}>Read the paper ↗</Out>}
          </div>
        </li>
      ))}
      <li>
        <span className={s.year}>—</span>
        <div>
          <b>{quad.title}</b>
          <p>{quad.detail}</p>
        </div>
      </li>
    </ol>
  );
}

function Contact() {
  return (
    <>
      <p className={s.lead}>
        A platform to architect, a device to bring online, or a team to build: write and say what
        you are working on.
      </p>
      <a className={s.email} href={`mailto:${profile.email}`}>
        {profile.email}
      </a>
      <span className={s.links}>
        <Out href={profile.linkedin}>LinkedIn ↗</Out>
        <Out href={profile.github}>GitHub ↗</Out>
        <Out href={profile.cv}>CV ↗</Out>
      </span>
    </>
  );
}

const cvFile = person.cv.split('/').pop();

function Cv() {
  const { bsc, msc } = db.education;
  return (
    <>
      <p className={s.lead}>{db.lede}</p>
      <a className={s.download} href={profile.cv} target="_blank" rel="noreferrer">
        <b>{cvFile}</b>
        <span>
          {fmt.Spell(db.roleList.length)} roles, {fmt.spell(Object.keys(db.education).length)}{' '}
          degrees and {fmt.spell(oss.length)} upstream fixes. Open the PDF ↗
        </span>
      </a>
      <ul className={s.cvList}>
        <li>
          <span>Now</span>
          {`${current.title}, ${current.company}, since ${fmt.month(current.since)}`}
        </li>
        <li>
          <span>Before</span>
          {db.roleList
            .filter((r) => r.to)
            .map((r) => r.short ?? r.org)
            .join(', ')}
        </li>
        <li>
          <span>Study</span>
          {`${db.degreeTitle(bsc)}; ${db.degreeTitle(msc)}`}
        </li>
      </ul>
    </>
  );
}

/** A chapter's content. Compact is the reader beside the table; full is the page below. */
export function ChapterBody({ id, compact = false }: { id: string; compact?: boolean }) {
  switch (id) {
    case 'about':
      return <About />;
    case 'experience':
      return <Experience compact={compact} />;
    case 'products':
      return <Products compact={compact} />;
    case 'hardware':
      return <Hardware />;
    case 'open-source':
      return <OpenSource />;
    case 'numbers':
      return <Numbers />;
    case 'education':
      return <Education />;
    case 'contact':
      return <Contact />;
    default:
      return <Cv />;
  }
}
