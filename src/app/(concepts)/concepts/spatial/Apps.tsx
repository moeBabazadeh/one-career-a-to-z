'use client';

import Image from 'next/image';
import { memo, useState } from 'react';
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
  roles,
  roots,
  skills,
  stats,
  NOW,
  type Contribution,
} from '../_shared/data';
import { Icon, type IconName } from './icons';
import WindowFrame, { Segmented, TabBar, Title, type Chrome } from './Window';
import s from './spatial.module.scss';

/* ------------------------------------------------------------------ shared bits */

type Links = { external?: string; github?: string; appStore?: string; playStore?: string };

/** A project's links, named for what they open. */
export function linkList(l: Links): { label: string; url: string; icon: IconName }[] {
  const out: { label: string; url: string; icon: IconName }[] = [];
  if (l.external) out.push({ label: 'Website', url: l.external, icon: 'globe' });
  if (l.appStore) out.push({ label: 'App Store', url: l.appStore, icon: 'store' });
  if (l.playStore) out.push({ label: 'Google Play', url: l.playStore, icon: 'store' });
  if (l.github)
    out.push({
      label: l.github.includes('/pull/') ? 'Pull request' : 'Source',
      url: l.github,
      icon: 'code',
    });
  return out;
}

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** "2 yrs 4 mos", for how long a role ran (or has run, as of the facts' date). */
export function tenure(from: db.YearMonth, to: db.YearMonth | null) {
  const m = Math.max(1, fmt.monthsBetween(from, to ?? db.asOf));
  const y = Math.floor(m / 12),
    r = m % 12;
  return [y ? `${y} yr${y > 1 ? 's' : ''}` : '', r ? `${r} mo${r > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(' ');
}

/** "50+ stations" as a figure and its label; "In production" stays as it is. */
export function splitFigure(f: string) {
  const m = /^([\d.,]+[kKMB]?\+?)\s+(.*)$/.exec(f);
  return m ? { value: m[1], label: m[2] } : { value: f, label: '' };
}

function Out({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

function Pill({
  href,
  icon,
  children,
  onClick,
  download,
}: {
  href?: string;
  icon: IconName;
  children: React.ReactNode;
  onClick?: () => void;
  download?: boolean;
}) {
  const body = (
    <>
      <Icon name={icon} size={17} />
      <span>{children}</span>
    </>
  );
  if (href)
    return (
      <a
        className={`${s.pill} ${s.gz}`}
        href={href}
        {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
        {...(download ? { download: '' } : {})}
      >
        {body}
      </a>
    );
  return (
    <button type="button" className={`${s.pill} ${s.gz}`} onClick={onClick}>
      {body}
    </button>
  );
}

/* ------------------------------------------------------------------ About */

export const About = memo(function About(c: Chrome & { onReader: () => void }) {
  return (
    <WindowFrame
      {...c}
      ornament={
        <>
          <Pill href={`mailto:${profile.email}`} icon="envelope">
            Email
          </Pill>
          <Pill href={profile.cv} icon="download">
            CV
          </Pill>
          <Pill icon="doc" onClick={c.onReader}>
            Read as page
          </Pill>
        </>
      }
    >
      <Title id="about" sub={profile.headline}>
        About
      </Title>
      <div className={s.profile}>
        <Image src={db.person.photo} width={160} height={160} alt={profile.name} />
        <div>
          <h3>{profile.name}</h3>
          <p>
            {profile.role} ·{' '}
            <Out href={profile.companyUrl} className={s.link}>
              {profile.company}
            </Out>
          </p>
        </div>
      </div>
      <p className={s.lead}>{profile.tagline}</p>
      <div className={s.prose}>
        <p>{profile.lede}</p>
        {about.map((p) => (
          <p key={p.slice(0, 32)}>{p}</p>
        ))}
      </div>
      <h3 className={s.head}>In numbers</h3>
      <dl className={s.stats}>
        {stats.map((st) => (
          <div key={st.label}>
            <dt>{st.label}</dt>
            <dd>{st.value}</dd>
          </div>
        ))}
      </dl>
      <h3 className={s.head}>Works in</h3>
      <ul className={s.chips}>
        {skills.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    </WindowFrame>
  );
});

/* ------------------------------------------------------------------ Experience */

type ExpView = 'list' | 'timeline';

function Timeline() {
  const y0 = Math.floor(Math.min(...roles.map((r) => r.start)));
  const y1 = Math.ceil(NOW);
  const span = y1 - y0;
  const pos = (y: number) => `${(((y - y0) / span) * 100).toFixed(2)}%`;
  const ticks = Array.from({ length: Math.floor(span / 2) + 1 }, (_, i) => y0 + i * 2).filter(
    (y) => y < y1,
  );
  const newest = [...roles].reverse();
  return (
    <figure className={s.gantt}>
      <div className={s.ganttAxis} aria-hidden="true">
        {ticks.map((y) => (
          <span key={y} style={{ left: pos(y) }}>
            {y}
          </span>
        ))}
        <span className={s.ganttNow} style={{ left: pos(NOW) }}>
          now
        </span>
      </div>
      <ol className={s.ganttRows}>
        {newest.map((r) => (
          <li key={r.id}>
            <span className={s.ganttLabel}>
              <b>{r.org}</b>
              <small>{r.range}</small>
            </span>
            <span className={s.ganttTrack}>
              <i
                className={r.end === null ? s.ganttLive : undefined}
                style={{
                  left: pos(r.start),
                  width: `calc(${pos(r.end ?? NOW)} - ${pos(r.start)})`,
                }}
                title={`${r.title}, ${r.range}`}
              />
            </span>
          </li>
        ))}
      </ol>
      <figcaption>
        Each bar runs from the month a role started to the month it ended, or to now.
      </figcaption>
    </figure>
  );
}

export const Experience = memo(function Experience(c: Chrome) {
  const [view, setView] = useState<ExpView>('list');
  return (
    <WindowFrame
      {...c}
      ornament={
        <Segmented<ExpView>
          label="Show experience as"
          value={view}
          onChange={setView}
          options={[
            { id: 'list', label: 'Roles', icon: 'list' },
            { id: 'timeline', label: 'Timeline', icon: 'timeline' },
          ]}
        />
      }
    >
      <Title
        id="experience"
        sub={`${fmt.Spell(db.roleList.length)} roles since ${db.person.since}`}
      >
        Experience
      </Title>
      {view === 'timeline' ? (
        <Timeline />
      ) : (
        <ol className={s.roles}>
          {db.roleList.map((r) => (
            <li key={r.id} className={s.role}>
              <div className={s.roleHead}>
                <h3>{r.url ? <Out href={r.url}>{r.org}</Out> : r.org}</h3>
                {r.to === null && <span className={s.badgeLive}>Now</span>}
                {r.contract && <span className={s.badge}>Contract</span>}
              </div>
              <p className={s.roleTitle}>{db.titlePath(r)}</p>
              <p className={s.when}>
                <time dateTime={fmt.iso(r.from)}>{fmt.mon(r.from)}</time> –{' '}
                {r.to ? <time dateTime={fmt.iso(r.to)}>{fmt.mon(r.to)}</time> : 'Present'} ·{' '}
                {tenure(r.from, r.to)}
                {r.sector ? ` · ${r.sector.replace(/^an? /, '')}` : ''}
              </p>
              {r.steps.length > 1 && (
                <ol className={s.steps}>
                  {r.steps.map((st) => (
                    <li key={st.title}>
                      <span>{st.title}</span>
                      <time dateTime={fmt.iso(st.from)}>{fmt.mon(st.from)}</time>
                    </li>
                  ))}
                </ol>
              )}
              <p className={s.summary}>{r.summary}</p>
              <details className={s.duties}>
                <summary className={s.gz}>
                  <Icon name="chevronRight" size={14} />
                  What I did
                </summary>
                <ul>
                  {r.duties.map((d) => (
                    <li key={d.slice(0, 40)}>{d}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      )}
    </WindowFrame>
  );
});

/* ------------------------------------------------------------------ Projects */

type ProjTab = 'featured' | 'more' | 'archive';

function LinkRow({ links }: { links: Links }) {
  const list = linkList(links);
  if (!list.length) return null;
  return (
    <p className={s.linkRow}>
      {list.map((l) => (
        <Out key={l.url} href={l.url} className={`${s.mini} ${s.gz}`}>
          <Icon name={l.icon} size={14} />
          <span>{l.label}</span>
        </Out>
      ))}
    </p>
  );
}

export const Projects = memo(function Projects(c: Chrome) {
  const [tab, setTab] = useState<ProjTab>('featured');
  const label = tab === 'featured' ? 'Featured' : tab === 'more' ? 'More builds' : 'Archive';
  return (
    <WindowFrame
      {...c}
      tabs={
        <TabBar<ProjTab>
          label="Projects"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'featured', label: 'Featured', icon: 'star' },
            { id: 'more', label: 'More', icon: 'grid' },
            { id: 'archive', label: 'Archive', icon: 'list' },
          ]}
        />
      }
    >
      <Title id="projects" sub={label}>
        Projects
      </Title>
      {tab === 'featured' && (
        <ul className={s.cards}>
          {featuredProjects.map((p) => (
            <li key={p.title} className={s.card}>
              <div className={s.shot}>
                <Image src={p.image} width={640} height={400} alt={`${p.title}, screenshot`} />
              </div>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.tech}>{p.tech.join(' · ')}</p>
              <LinkRow links={p.links} />
            </li>
          ))}
        </ul>
      )}
      {tab === 'more' && (
        <ul className={s.group}>
          {otherProjects.map((p) => (
            <li key={p.title} className={s.rowItem}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p className={s.tech}>{p.tech.join(' · ')}</p>
              <LinkRow links={p.links} />
            </li>
          ))}
        </ul>
      )}
      {tab === 'archive' && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <caption>
              Every build, newest first. A dash marks hardware that is still in production.
            </caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Build</th>
                <th scope="col">Made at</th>
                <th scope="col">Built with</th>
                <th scope="col">Link</th>
              </tr>
            </thead>
            <tbody>
              {archive.map((b) => {
                const first = linkList(b.links)[0];
                return (
                  <tr key={b.title}>
                    <td className={s.num}>{b.year}</td>
                    <th scope="row">{b.title}</th>
                    <td>{b.madeAt}</td>
                    <td className={s.dim}>{b.tech.join(', ')}</td>
                    <td>
                      {first ? (
                        <Out href={first.url} className={s.link}>
                          {first.label}
                        </Out>
                      ) : (
                        <span className={s.dim}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </WindowFrame>
  );
});

/* ------------------------------------------------------------------ Hardware */

const devicesLabel = stats.find((st) => st.value === String(hardware.length))?.label ?? 'devices';

export const Hardware = memo(function Hardware(c: Chrome & { onImmersive: () => void }) {
  return (
    <WindowFrame
      {...c}
      ornament={
        <>
          <span className={s.ornNote}>Turn them in 3D</span>
          <Pill icon="cube" onClick={c.onImmersive}>
            View in your space
          </Pill>
        </>
      }
    >
      <Title id="hardware" sub={`${fmt.Spell(hardware.length)} ${devicesLabel}`}>
        Hardware
      </Title>
      <ul className={s.devices}>
        {hardware.map((d) => (
          <li key={d.tag} className={s.device}>
            <div className={s.deviceHead}>
              <span className={s.tag}>{d.tag}</span>
              <h3>{d.name}</h3>
            </div>
            <p className={s.kind}>{d.kind}</p>
            <p>{d.detail}</p>
            <dl className={s.figs}>
              {d.figures.map((f) => {
                const { value, label } = splitFigure(f);
                return (
                  <div key={f} data-text={label ? undefined : ''}>
                    <dd>{value}</dd>
                    {label && <dt>{label}</dt>}
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>
    </WindowFrame>
  );
});

/* ------------------------------------------------------------------ Open source */

type Kind = 'All' | Contribution['kind'];
const KINDS: Kind[] = ['All', ...Array.from(new Set(oss.map((o) => o.kind)))];
const weeklyLabel = stats.find((st) => st.value === db.downloads.weekly.short)?.label ?? '';

export const OpenSource = memo(function OpenSource(c: Chrome) {
  const [kind, setKind] = useState<Kind>('All');
  const shown = oss.filter((o) => kind === 'All' || o.kind === kind);
  return (
    <WindowFrame
      {...c}
      ornament={
        <Segmented<Kind>
          label="Filter by kind of fix"
          value={kind}
          onChange={setKind}
          options={KINDS.map((k) => ({ id: k, label: k }))}
        />
      }
    >
      <Title
        id="oss"
        sub={`${fmt.Spell(oss.length)} pull requests to projects other people depend on`}
      >
        Open source
      </Title>
      <div className={s.hero}>
        <b>{db.downloads.weekly.short}</b>
        <span>{weeklyLabel}</span>
      </div>
      <ul className={s.prs} aria-live="polite">
        {shown.map((o) => (
          <li key={o.url} className={s.pr}>
            <div className={s.prHead}>
              <span className={s.repo}>{o.repo}</span>
              <span className={s.badge} data-kind={o.kind}>
                {o.kind}
              </span>
            </div>
            <p className={s.change}>{o.change}</p>
            <p className={s.dim}>{o.impact}</p>
            <p className={s.prMeta}>
              <span>
                <Icon name="star" size={13} /> {o.stars}
              </span>
              <span>
                <Icon name="download" size={13} /> {o.weekly}/wk
              </span>
              <span>{o.year}</span>
              <Out href={o.url} className={`${s.mini} ${s.gz}`}>
                <Icon name="branch" size={14} />
                <span>#{o.url.split('/').pop()}</span>
              </Out>
            </p>
          </li>
        ))}
      </ul>
    </WindowFrame>
  );
});

/* ------------------------------------------------------------------ Roots */

const ROOT_ICONS: IconName[] = ['cap', 'robot', 'trophy', 'trophy', 'cap', 'paper'];

export const Roots = memo(function Roots(c: Chrome) {
  return (
    <WindowFrame {...c}>
      <Title id="roots" sub="Where it started: degrees, robots and a paper">
        Roots
      </Title>
      <ol className={s.roots}>
        {roots.map((r, i) => (
          <li key={r.title}>
            <span className={s.rootIcon}>
              <Icon name={ROOT_ICONS[i] ?? 'leaf'} size={18} />
            </span>
            <div>
              <p className={s.when}>{r.year}</p>
              <h3>{r.url ? <Out href={r.url}>{r.title}</Out> : r.title}</h3>
              <p>{r.detail}</p>
            </div>
          </li>
        ))}
        <li>
          <span className={s.rootIcon}>
            <Icon name="robot" size={18} />
          </span>
          <div>
            <p className={s.when}>Undated</p>
            <h3>{db.robots.quadcopter.title}</h3>
            <p>{db.robots.quadcopter.detail}</p>
          </div>
        </li>
      </ol>
    </WindowFrame>
  );
});

/* ------------------------------------------------------------------ Contact */

export const Contact = memo(function Contact(c: Chrome & { onCopy: (text: string) => void }) {
  const rows: { icon: IconName; label: string; value: string; href: string }[] = [
    { icon: 'envelope', label: 'Email', value: profile.email, href: `mailto:${profile.email}` },
    { icon: 'person', label: 'LinkedIn', value: host(profile.linkedin), href: profile.linkedin },
    { icon: 'code', label: 'GitHub', value: host(profile.github), href: profile.github },
    { icon: 'download', label: 'CV', value: 'PDF', href: profile.cv },
    { icon: 'globe', label: 'Website', value: db.person.site, href: db.person.url },
  ];
  return (
    <WindowFrame
      {...c}
      ornament={
        <>
          <Pill icon="copy" onClick={() => c.onCopy(profile.email)}>
            Copy email
          </Pill>
          <Pill href={`mailto:${profile.email}`} icon="envelope">
            Write
          </Pill>
        </>
      }
    >
      <Title id="contact" sub={`${profile.role} at ${profile.company}`}>
        Contact
      </Title>
      <div className={s.card2}>
        <Image src={db.person.photo} width={120} height={120} alt="" />
        <div>
          <h3>{profile.name}</h3>
          <p className={s.dim}>{profile.fullName}</p>
        </div>
      </div>
      <ul className={s.group}>
        {rows.map((r) => (
          <li key={r.label}>
            <a
              className={`${s.contactRow} ${s.gz}`}
              href={r.href}
              {...(r.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              <span className={s.rowIcon}>
                <Icon name={r.icon} size={17} />
              </span>
              <span className={s.rowLabel}>{r.label}</span>
              <span className={s.rowValue}>{r.value}</span>
              <Icon name="chevronRight" size={14} className={s.rowChevron} />
            </a>
          </li>
        ))}
      </ul>
      <h3 className={s.head}>On the stores</h3>
      <ul className={s.group}>
        {(db.storeApps as db.Product[]).map((p) => (
          <li key={p.title} className={s.storeRow}>
            <span className={s.rowLabel}>{p.title}</span>
            <LinkRow links={{ appStore: p.links.appStore, playStore: p.links.playStore }} />
          </li>
        ))}
      </ul>
    </WindowFrame>
  );
});
