// The chapters each station decodes into, rendered as a dissector's payload view. The decoder
// shows them as frames arrive (`shown` items so far); the station log below the receiver shows
// them whole. Everything is read from db through _shared/data.
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
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { contactLinks, type ChapterId } from './programs';
import { stations } from './stations';
import s from './radio.module.scss';

const ext = { target: '_blank', rel: 'noreferrer' } as const;

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <span className={s.links}>
      {items.map((l) => (
        <a key={l.url} href={l.url} {...ext}>
          {l.label} ↗
        </a>
      ))}
    </span>
  );
}

const Tech = ({ tech }: { tech: string[] }) => (
  <ul className={s.chips} aria-label="Built with">
    {tech.map((t) => (
      <li key={t}>{t}</li>
    ))}
  </ul>
);

/** Where a device is on the air, from the band plan, if it's on the air at all. */
const onAir = (tag: string) =>
  stations
    .filter((st) => st.device.tag === tag)
    .map((st) => st.where)
    .filter((w, i, all) => all.indexOf(w) === i);

/* ------------------------------------------------------------------ items */

function aboutItems(full: boolean) {
  return [
    <div key="id" className={s.ident}>
      {full && (
        <Image
          src={db.person.photo}
          alt={profile.name}
          width={240}
          height={240}
          className={s.photo}
        />
      )}
      <div>
        <h3 className={s.name}>{profile.name}</h3>
        <p className={s.role}>
          {profile.role} ·{' '}
          <a href={profile.companyUrl} {...ext}>
            {profile.company}
          </a>
        </p>
        <p className={s.muted}>
          {profile.headline}. {profile.tagline}
        </p>
      </div>
    </div>,
    ...about.map((p) => (
      <p key={p.slice(0, 32)} className={s.prose}>
        {p}
      </p>
    )),
    <div key="skills">
      <h4 className={s.sub}>Skills</h4>
      <Tech tech={skills} />
    </div>,
    <dl key="stats" className={s.stats}>
      {stats.map((m) => (
        <div key={m.label}>
          <dt>{m.label}</dt>
          <dd>{m.value}</dd>
        </div>
      ))}
    </dl>,
  ];
}

const experienceItems = () =>
  db.roleList.map((r) => (
    <article key={r.id} className={s.entry}>
      <header>
        <h3>
          {r.url ? (
            <a href={r.url} {...ext}>
              {r.org}
            </a>
          ) : (
            r.org
          )}
        </h3>
        <time>{fmt.monthSpan(r.from, r.to)}</time>
      </header>
      <p className={s.role}>
        {db.titlePath(r)}
        {r.contract ? ' · contract' : ''}
      </p>
      <p className={s.muted}>{r.summary}</p>
      <ul className={s.duties}>
        {r.duties.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </article>
  ));

const projectItems = () => [
  ...featuredProjects.map((p) => (
    <article key={p.title} className={s.entry}>
      <header>
        <h3>{p.title}</h3>
        <span className={s.badge}>Featured</span>
      </header>
      <p className={s.prose}>{p.description}</p>
      <Tech tech={p.tech} />
      <Links links={p.links} />
    </article>
  )),
  <div key="more">
    <h4 className={s.sub}>More projects</h4>
    <ul className={s.compact}>
      {otherProjects.map((p) => (
        <li key={p.title}>
          <b>{p.title}</b>
          <span>{p.description}</span>
          <small>{p.tech.join(' · ')}</small>
          <Links links={p.links} />
        </li>
      ))}
    </ul>
  </div>,
  <div key="archive">
    <h4 className={s.sub}>Every build, by year</h4>
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Build</th>
            <th scope="col">Made at</th>
            <th scope="col">Tech</th>
          </tr>
        </thead>
        <tbody>
          {archive.map((b) => {
            const link = projectLinks(b.links)[0];
            return (
              <tr key={`${b.year}${b.title}`}>
                <td>{b.year === '—' ? 'undated' : b.year}</td>
                <td>
                  {link ? (
                    <a href={link.url} {...ext}>
                      {b.title} ↗
                    </a>
                  ) : (
                    b.title
                  )}
                </td>
                <td>{b.madeAt}</td>
                <td>{b.tech.join(', ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>,
];

const hardwareItems = () =>
  hardware.map((d) => {
    const air = onAir(d.tag);
    return (
      <article key={d.tag} className={s.entry}>
        <header>
          <h3>
            <span className={s.tag}>{d.tag}</span> {d.name}
          </h3>
          <span className={s.badge}>{d.kind}</span>
        </header>
        <p className={s.prose}>{d.detail}</p>
        <ul className={s.figures}>
          {d.figures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        {air.length > 0 && <p className={s.air}>On air: {air.join(' · ')}</p>}
      </article>
    );
  });

const ossItems = () => [
  <p key="lead" className={s.prose}>
    Fixes merged into libraries downloaded {db.downloads.weekly.long} times a week.
  </p>,
  ...oss.map((c) => (
    <article key={c.repo} className={s.entry}>
      <header>
        <h3>
          <a href={c.url} {...ext}>
            {c.repo} #{c.url.split('/').pop()} ↗
          </a>
        </h3>
        <span className={`${s.badge} ${c.kind === 'Security' ? s.hot : ''}`}>{c.kind}</span>
      </header>
      <p className={s.prose}>{c.change}</p>
      <p className={s.muted}>{c.impact}</p>
      <p className={s.meta}>
        {c.year} · ★ {c.stars} · {c.weekly} weekly downloads
      </p>
    </article>
  )),
];

const rootItems = () => [
  ...roots.map((r) => (
    <article key={r.title} className={s.entry}>
      <header>
        <h3>
          {r.url ? (
            <a href={r.url} {...ext}>
              {r.title} ↗
            </a>
          ) : (
            r.title
          )}
        </h3>
        <time>{r.year}</time>
      </header>
      <p className={s.prose}>{r.detail}</p>
    </article>
  )),
  <article key="quad" className={s.entry}>
    <header>
      <h3>{db.robots.quadcopter.title}</h3>
      <time>undated</time>
    </header>
    <p className={s.prose}>{db.robots.quadcopter.detail}</p>
  </article>,
];

const contactItems = () => [
  <p key="lead" className={s.prose}>
    The clearest channel is email. Write about a platform, a device or a team that needs building.
  </p>,
  <a key="mail" className={s.email} href={`mailto:${profile.email}`}>
    {profile.email}
  </a>,
  <ul key="links" className={s.contactLinks}>
    {contactLinks.slice(1).map((l) => (
      <li key={l.label}>
        <span>{l.label}</span>
        <a href={l.url} {...ext}>
          {l.text} ↗
        </a>
      </li>
    ))}
  </ul>,
  <div key="stores">
    <h4 className={s.sub}>In the stores</h4>
    <ul className={s.compactLinks}>
      {liveLinks.map((l) => (
        <li key={l.url}>
          <a href={l.url} {...ext}>
            {l.label} ↗
          </a>
        </li>
      ))}
    </ul>
  </div>,
];

const ITEMS: Record<ChapterId, (full: boolean) => React.ReactNode[]> = {
  about: aboutItems,
  experience: experienceItems,
  projects: projectItems,
  hardware: hardwareItems,
  oss: ossItems,
  roots: rootItems,
  contact: contactItems,
};

/**
 * A chapter, `reveal` of it (0 to 1) received so far. The rest shows as placeholder lines,
 * the way a dissector shows bytes it hasn't seen.
 */
export function Chapter({
  id,
  reveal = 1,
  full = false,
}: {
  id: ChapterId;
  reveal?: number;
  full?: boolean;
}) {
  const items = ITEMS[id](full);
  const shown = reveal >= 1 ? items.length : Math.floor(reveal * items.length);
  return (
    <div className={s.chapter}>
      {items.slice(0, shown)}
      {shown < items.length && (
        <div
          className={s.pending}
          aria-label={`${items.length - shown} more items still to receive`}
        >
          {Array.from({ length: Math.min(3, items.length - shown) }, (_, i) => (
            <span key={i} style={{ width: `${88 - i * 21}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}
