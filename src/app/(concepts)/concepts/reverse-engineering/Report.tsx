'use client';

// Read as a page: everything the image holds, as a plain document, for anyone who'd rather not
// drive a disassembler. Each section names the symbol it lives at, and opens it in the suite.
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
import { FILE, snake } from './career';
import { SYM_ADDR } from './program';
import { act, setPageView } from './store';
import s from './re.module.scss';

function open(sym: string) {
  setPageView(false);
  const a = SYM_ADDR.get(sym);
  if (a !== undefined) act.goTo(a);
}

function At({ sym }: { sym: string }) {
  return (
    <button
      type="button"
      className={s.at}
      onClick={() => open(sym)}
      title={`Open ${sym} in the suite`}
    >
      {sym}
    </button>
  );
}

const productId = (title: string) =>
  (Object.keys(db.products) as db.ProductId[]).find((id) => db.products[id].title === title);
const productSym = (title: string) => {
  const id = productId(title);
  return id ? `product_${snake(id)}_task` : null;
};
const deviceIds = Object.keys(db.devices) as db.DeviceId[];
const patchSym = (repo: string) => {
  const id = (Object.keys(db.contributions) as db.ContributionId[]).find(
    (k) => db.contributions[k].repo === repo,
  );
  return id ? `upstream_${snake(id)}` : null;
};

function Links({ links }: { links: db.ProjectLinks }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <span className={s.repLinks}>
      {items.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label} ↗
        </a>
      ))}
    </span>
  );
}

function Section({
  id,
  title,
  sym,
  children,
}: {
  id: string;
  title: string;
  sym?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`page-${id}`} className={s.repSection} aria-labelledby={`page-${id}-h`}>
      <header>
        <h2 id={`page-${id}-h`}>{title}</h2>
        {sym && <At sym={sym} />}
      </header>
      {children}
    </section>
  );
}

export default function Report() {
  const quad = db.robots.quadcopter;
  return (
    <div className={s.report}>
      <div className={s.repBar}>
        <span className={s.repFile}>{`${FILE} · analysis report`}</span>
        <button type="button" className={s.repBack} onClick={() => setPageView(false)}>
          ← Back to the suite
        </button>
      </div>
      <article className={s.repDoc}>
        <header className={s.repHead}>
          <p className={s.repKicker}>{profile.headline}</p>
          <h1>{profile.name}</h1>
          <p className={s.repRole}>
            {`${profile.role} at `}
            <a href={profile.companyUrl} target="_blank" rel="noreferrer">
              {profile.company}
            </a>
          </p>
          <p className={s.repLede}>{profile.lede}</p>
          <p className={s.repContact}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV ↗
            </a>
          </p>
        </header>

        <Section id="about" title="About" sym="banner_print">
          {about.map((p) => (
            <p key={p.slice(0, 32)}>{p}</p>
          ))}
          <ul className={s.repTags}>
            {skills.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
          <dl className={s.repStats}>
            {stats.map((m) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="experience" title="Experience" sym="main">
          <ol className={s.repRoles}>
            {db.roleList.map((r) => (
              <li key={r.id}>
                <div className={s.repRoleHead}>
                  <h3>
                    {db.titlePath(r)}
                    {r.contract ? ' (contract)' : ''}
                    {' · '}
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.org}
                      </a>
                    ) : (
                      r.org
                    )}
                  </h3>
                  <At sym={`role_${r.id}_main`} />
                </div>
                <p
                  className={s.repDates}
                >{`${fmt.monthSpan(r.from, r.to)}${r.sector ? ` · ${r.sector}` : ''}`}</p>
                <p>{r.summary}</p>
                <ul>
                  {r.duties.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="featured" title="Featured projects">
          <div className={s.repCards}>
            {featuredProjects.map((p) => {
              const sym = productSym(p.title);
              return (
                <article key={p.title} className={s.repCard}>
                  <Image
                    src={p.image}
                    width={1280}
                    height={800}
                    alt={p.title}
                    className={s.repShot}
                  />
                  <div>
                    <div className={s.repRoleHead}>
                      <h3>{p.title}</h3>
                      {sym && <At sym={sym} />}
                    </div>
                    <p>{p.description}</p>
                    <p className={s.repTech}>{p.tech.join(' · ')}</p>
                    <Links links={p.links} />
                  </div>
                </article>
              );
            })}
          </div>
        </Section>

        <Section id="projects" title="More projects">
          <ul className={s.repList}>
            {otherProjects.map((p) => {
              const sym = productSym(p.title);
              return (
                <li key={p.title}>
                  <div className={s.repRoleHead}>
                    <h3>{p.title}</h3>
                    {sym && <At sym={sym} />}
                  </div>
                  <p>{p.description}</p>
                  <p className={s.repTech}>{p.tech.join(' · ')}</p>
                  <Links links={p.links} />
                </li>
              );
            })}
          </ul>
          <ul className={s.repStores}>
            {liveLinks.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="hardware" title="Hardware in production" sym="devices_poll">
          <ul className={s.repDevices}>
            {hardware.map((d, k) => (
              <li key={d.tag}>
                <div className={s.repRoleHead}>
                  <h3>
                    <span className={s.repTag}>{d.tag}</span> {d.name}
                  </h3>
                  <At sym={`dev_${snake(deviceIds[k])}_poll`} />
                </div>
                <p className={s.repDates}>{d.kind}</p>
                <p>{d.detail}</p>
                <ul className={s.repFigures}>
                  {d.figures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="oss" title="Open source" sym="upstream_main">
          <p>{`Fixes merged into packages downloaded ${db.downloads.weekly.long} times a week.`}</p>
          <ul className={s.repList}>
            {oss.map((c) => {
              const sym = patchSym(c.repo);
              return (
                <li key={c.url}>
                  <div className={s.repRoleHead}>
                    <h3>
                      <a href={c.url} target="_blank" rel="noreferrer">
                        {`${c.repo} #${c.url.split('/').pop()}`} ↗
                      </a>
                    </h3>
                    {sym && <At sym={sym} />}
                  </div>
                  <p
                    className={s.repDates}
                  >{`${c.kind} · ${c.year} · ★ ${c.stars} · ${c.weekly} downloads a week`}</p>
                  <p>{c.change}</p>
                  <p className={s.repDim}>{c.impact}</p>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section id="roots" title="Education and roots" sym="roots_init">
          <ul className={s.repList}>
            {roots.map((r) => (
              <li key={r.title}>
                <h3>
                  <span className={s.repTag}>{r.year}</span> {r.title}
                </h3>
                <p>
                  {r.detail}{' '}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      Read it ↗
                    </a>
                  )}
                </p>
              </li>
            ))}
            <li>
              <h3>
                <span className={s.repTag}>undated</span> {quad.title}
              </h3>
              <p>{quad.detail}</p>
            </li>
          </ul>
        </Section>

        <Section id="archive" title="Every build" sym="archive_dump">
          <div className={s.repTableWrap}>
            <table className={s.repTable}>
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col">Build</th>
                  <th scope="col">Made at</th>
                  <th scope="col">Built with</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((b) => {
                  const link = projectLinks(b.links)[0];
                  return (
                    <tr key={`${b.year}-${b.title}`}>
                      <td>{b.year}</td>
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
                      <td>{b.tech.join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="contact" title="Contact" sym="contact_poll">
          <p>Write about a platform, a device or a team that needs building.</p>
          <p className={s.repContact}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV ↗
            </a>
          </p>
        </Section>
      </article>
    </div>
  );
}
