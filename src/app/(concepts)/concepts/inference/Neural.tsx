'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { about, db, fmt, hardware, oss, profile, roots, skills, stats } from '../_shared/data';
import Inference from './Inference';
import Network from './Network';
import Projector from './Projector';
import Scalars from './Scalars';
import { pretokenize } from './tokens';
import s from './neural.module.scss';
import { concept } from '../_shared/concepts';

const TABS = [
  ['graph', 'Graph'],
  ['card', 'Model card'],
  ['scalars', 'Scalars'],
  ['projector', 'Projector'],
  ['edge', 'Edge'],
  ['evals', 'Evals'],
  ['inference', 'Inference'],
];

/** Follows which section is under the middle of the viewport, for the tab bar. */
function useActiveSection() {
  const [active, setActive] = useState('graph');
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    for (const [id] of TABS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

/** Text that arrives a token at a time, the way a model streams it. Pure CSS, so it renders on the server. */
function Stream({ text }: { text: string }) {
  const tokens = pretokenize(text);
  return (
    <>
      <span className={s.sr}>{text}</span>
      <span className={s.stream} aria-hidden="true">
        {tokens.map((t, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties}>
            {t}
          </span>
        ))}
        <span className={s.caret} style={{ '--i': tokens.length } as React.CSSProperties} />
      </span>
    </>
  );
}

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-title`}>
      <header className={s.secHead}>
        <p className={s.kicker}>{kicker}</p>
        <h2 id={`${id}-title`}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

// Where Attendum's universities are: "the UK and US".
const ATTENDUM_COUNTRIES = `the ${fmt.list(db.products.attendum.countries)}`;

const { person, current, asOf } = db;
const { logger } = db.devices;
/** The model is named after him: "moe-babazadeh". */
const MODEL = person.name.toLowerCase().replace(/\s+/g, '-');
/** The checkpoint is the date of the facts: "2026.10". */
const CKPT = fmt.iso(asOf).replace('-', '.');
/** Trained from the year he started building to the facts' year. */
const TRAINED = `${person.since} → ${asOf.y}`;
/** Current roles besides the main one: "Neuroship, contract". */
const ALSO = db.roleList
  .filter((r) => !r.to && r.id !== current.role.id)
  .map((r) => `${r.org}${r.contract ? ', contract' : ''}`)
  .join('; ');

const INTENDED = [
  'Architecture, roadmap and delivery of cloud-native, multi-tenant platforms.',
  'Bringing AI into products: natural-language access to project data, early warning on schedule and cost risk.',
  'Hardware to cloud: firmware, boards, mobile apps and the platforms behind them.',
  'Setting the engineering bar: a permission check on every API route, audit trails, alarms kept in infrastructure as code.',
];

const weekly = (v: string) => parseFloat(v) * (v.endsWith('k') ? 1000 : 1);
const EVALS = [...oss].sort((a, b) => weekly(b.weekly) - weekly(a.weekly));
const W_MAX = Math.log10(weekly(EVALS[0].weekly));

export default function Neural() {
  const active = useActiveSection();

  return (
    <div className={s.root}>
      <a href="#graph" className={s.skip}>
        Skip to content
      </a>
      <header className={s.top}>
        <a href="#graph" className={s.brand}>
          <span className={s.logo} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <b>{MODEL}</b>
          <span className={s.ckpt}>{`ckpt ${CKPT}`}</span>
        </a>
        <nav aria-label="Sections" className={s.tabs}>
          {TABS.map(([id, label]) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        <section id="graph" className={s.hero} aria-labelledby="name">
          <div className={s.heroTop}>
            <div>
              <p className={s.kicker}>{`model · ${MODEL} · trained ${TRAINED}`}</p>
              <h1 id="name">{profile.name}</h1>
              <p className={s.tagline}>
                <Stream text={`${profile.role} at ${profile.company}. ${profile.tagline}`} />
              </p>
            </div>
            <div className={s.heroSide}>
              <p className={s.lede}>{profile.lede}</p>
              <p className={s.heroLinks}>
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
            </div>
          </div>
          <Network />
        </section>

        <Section id="card" kicker={`model card · v${CKPT}`} title="Model card">
          <div className={s.card}>
            <div className={s.cardMain}>
              <h3>Model details</h3>
              {about.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}

              <h3>Intended use</h3>
              <ul className={s.ticks}>
                {INTENDED.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>

              <h3>Training data</h3>
              <p
                className={s.muted}
              >{`Pre-training on freelance web work from ${db.roles.freelance.from.y}, then electrical engineering, robots and a paper.`}</p>
              <table className={s.data}>
                <thead>
                  <tr>
                    <th scope="col">Split</th>
                    <th scope="col">Dataset</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {roots.map((r) => (
                    <tr key={r.title}>
                      <td className={s.mono}>{r.year}</td>
                      <td className={s.strong}>
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer">
                            {r.title} ↗
                          </a>
                        ) : (
                          r.title
                        )}
                      </td>
                      <td>{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3>Input features</h3>
              <ul className={s.chips}>
                {skills.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>

              <h3>Caveats and recommendations</h3>
              <p className={s.muted}>
                Fig. 1’s weights are set by hand to make the attributions readable, and the loss in
                Fig. 2 is illustrative. The dates, products, devices, links and figures on this card
                are real. For a fuller eval, read the{' '}
                <a href={profile.cv} target="_blank" rel="noreferrer">
                  CV
                </a>{' '}
                or <a href={`mailto:${profile.email}`}>ask the model directly</a>.
              </p>
            </div>

            <aside className={s.cardSide}>
              <figure className={s.photo}>
                <Image
                  src={person.photo}
                  width={600}
                  height={600}
                  alt={profile.name}
                  sizes="(max-width: 900px) 100vw, 360px"
                />
                <figcaption>{profile.fullName}</figcaption>
              </figure>
              <dl className={s.meta}>
                <div>
                  <dt>Checkpoint</dt>
                  <dd>
                    {profile.role},{' '}
                    <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                      {profile.company}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Since</dt>
                  <dd>
                    {`${fmt.month(current.since)}. ${current.previous.title} from `}
                    {fmt.month(current.previous.from)}.
                  </dd>
                </div>
                <div>
                  <dt>Also serving</dt>
                  <dd>{ALSO}</dd>
                </div>
                <div>
                  <dt>Training</dt>
                  <dd>{TRAINED}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>
                    <a href={`mailto:${profile.email}`}>{profile.email}</a>
                  </dd>
                </div>
              </dl>
              <h3 className={s.metricsHead}>Reported metrics</h3>
              <ul className={s.metrics}>
                {stats.map((m) => (
                  <li key={m.label}>
                    <b>{m.value}</b>
                    <span>{m.label}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </Section>

        <Section id="scalars" kicker="scalars · train/loss" title={`Training run, ${TRAINED}`}>
          <Scalars />
        </Section>

        <Section id="projector" kicker="projector · pca" title="Everything shipped, embedded">
          <Projector />
        </Section>

        <Section
          id="edge"
          kicker={`edge · ${hardware.length} devices in production`}
          title="Running at the edge"
        >
          <p
            className={s.lede}
          >{`Not models: boards and firmware, in production. From ${logger.kind}s that have been logging for ${logger.online.long} years to battery-powered card readers at universities in ${ATTENDUM_COUNTRIES}.`}</p>
          <ul className={s.devices}>
            {hardware.map((d) => (
              <li key={d.tag} className={s.device}>
                <p className={s.devHead}>
                  <span className={s.devTag}>{d.tag}</span>
                  <span className={s.status}>
                    <i aria-hidden="true" /> in production
                  </span>
                </p>
                <h3>{d.name}</h3>
                <p className={s.devKind}>{d.kind}</p>
                <p className={s.devText}>{d.detail}</p>
                <ul className={s.chips}>
                  {d.figures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="evals" kicker="evals · upstream" title="Open-source evals">
          <p
            className={s.lede}
          >{`Fixes contributed upstream to libraries that are downloaded ${db.downloads.weekly.long} times a week, sorted by reach.`}</p>
          <table className={s.evals}>
            <thead>
              <tr>
                <th scope="col">Benchmark</th>
                <th scope="col">Task</th>
                <th scope="col">Patch</th>
                <th scope="col">Stars</th>
                <th scope="col">
                  Weekly downloads <span>log</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {EVALS.map((c) => (
                <tr key={c.repo}>
                  <td>
                    <a href={c.url} target="_blank" rel="noreferrer" className={s.repo}>
                      {c.repo} ↗
                    </a>
                    <span className={s.split}>split {c.year}</span>
                  </td>
                  <td>
                    <span
                      className={`${s.task} ${c.kind === 'Security' || c.kind === 'Data loss' ? s.taskHot : ''}`}
                    >
                      {c.kind}
                    </span>
                  </td>
                  <td>
                    {c.change}
                    <small>{c.impact}</small>
                  </td>
                  <td className={s.num}>★ {c.stars}</td>
                  <td className={s.num}>
                    <span className={s.wk}>
                      <i
                        style={
                          { '--q': Math.log10(weekly(c.weekly)) / W_MAX } as React.CSSProperties
                        }
                      />
                    </span>
                    {c.weekly}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="inference" kicker="inference · mailto" title="Prompt me">
          <Inference />
        </Section>
      </main>

      <footer className={s.footer}>
        <span>{`forward_pass · concept ${concept('inference').letter}`}</span>
        <span>
          © {profile.fullName}
          {` · ${TRAINED}`}
        </span>
      </footer>
    </div>
  );
}
