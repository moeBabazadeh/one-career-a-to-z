import Image from 'next/image';
import {
  NOW,
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roles,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import Exploded from './Exploded';
import LiveMatch from './LiveMatch';
import MatchBar, { type Stop } from './MatchBar';
import RobotTop from './RobotTop';
import Seen from './Seen';
import s from './robocup.module.scss';
import { concept } from '../_shared/concepts';

// Concept K · Kickoff. The page is a match report: a live Small Size League match up top, then
// the line-up, the match timeline, the playbook, half-time under the cover, VAR, the trophy
// cabinet and a transfer request. The match clock in the top bar follows the scroll.

const { person, current, downloads } = db;
const { freelance, niknam, alget, zeroone, neuroject, neuroship } = db.roles;
const { bsc, msc } = db.education;
const { robocup, skills: nationals } = db.awards;
const ssl = db.robots.ssl;
const paper = db.papers.inverter;
/** "Nanoelectronics": the MSc field without its "Engineering". */
const nano = msc.field.replace(/ Engineering$/, '');
/** "MB", on the tactics board. */
const INITIALS = person.name
  .split(' ')
  .map((w) => w[0])
  .join('');

const STOPS: Stop[] = [
  { id: 'kickoff', label: 'Kickoff', minute: "0'" },
  { id: 'lineup', label: 'Line-up', minute: "10'" },
  { id: 'timeline', label: 'Timeline', minute: "25'" },
  { id: 'playbook', label: 'Playbook', minute: "40'" },
  { id: 'halftime', label: 'Half-time', minute: 'HT' },
  { id: 'var', label: 'VAR', minute: "60'" },
  { id: 'trophies', label: 'Trophies', minute: "75'" },
  { id: 'transfer', label: 'Transfer', minute: "90'" },
];

function Head({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  const stop = STOPS.find((st) => st.id === id) as Stop;
  return (
    <header className={s.head}>
      <p className={s.kicker}>
        <span className={s.clock}>{stop.minute}</span>
        {stop.label}
      </p>
      <h2 id={`${id}-title`}>{title}</h2>
      {children && <p className={s.sub}>{children}</p>}
    </header>
  );
}

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

/* ------------------------------------------------------------------ playbook diagrams */

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A chalkboard play on half a field: pass, pass, one-touch shot. Same seed, same play. */
function PlayDiagram({ seed }: { seed: number }) {
  const r = prng(seed * 7919 + 13);
  const p1 = { x: 22 + r() * 18, y: 22 + r() * 56 };
  const p2 = { x: 70 + r() * 22, y: r() < 0.5 ? 18 + r() * 16 : 66 + r() * 16 };
  const p3 = { x: 112 + r() * 14, y: 36 + r() * 28 };
  const goal = { x: 158, y: 44 + r() * 12 };
  const robots = [p1, p2, p3];
  const opp = [
    { x: 96 + r() * 12, y: 40 + r() * 20 },
    { x: 130 + r() * 10, y: p3.y > 50 ? 30 : 70 },
  ];
  return (
    <svg viewBox="0 0 164 100" className={s.diagram} aria-hidden="true">
      <rect x={1} y={1} width={162} height={98} rx={3} className={s.dField} />
      <path d="M1,1 V99 M161,30 A20,20 0 0,0 141,45 V55 A20,20 0 0,0 161,70" className={s.dLine} />
      <path d="M1,30 A20,20 0 0,1 1,70" className={s.dLine} />
      <path d={`M${p1.x},${p1.y} L${p2.x},${p2.y} L${p3.x},${p3.y}`} className={s.dPass} />
      <path d={`M${p3.x},${p3.y} L${goal.x},${goal.y}`} className={s.dShot} />
      {opp.map((o) => (
        <circle key={`${o.x}`} cx={o.x} cy={o.y} r={5} className={s.dOpp} />
      ))}
      {robots.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5.5} className={s.dBot} />
          <text x={p.x} y={p.y - 8} textAnchor="middle" className={s.dNum}>
            {i + 1}
          </text>
        </g>
      ))}
      <circle cx={p1.x + 6} cy={p1.y + 3} r={2.4} className={s.dBall} />
    </svg>
  );
}

/* ------------------------------------------------------------------ match timeline */

// Twenty seasons on the axis, from the first.
const START = person.since;
const SEASONS = 20;
const TX = (year: number) => 60 + ((year - START) / SEASONS) * 1030;
const AXIS = 176;

// roles on lanes above the axis, packed so overlapping roles stack
const LANES = (() => {
  const ends: number[] = [];
  return [...roles]
    .sort((a, b) => a.start - b.start)
    .map((r) => {
      let lane = ends.findIndex((e) => e <= r.start + 0.01);
      if (lane < 0) lane = ends.length;
      ends[lane] = r.end ?? NOW;
      return { ...r, lane };
    });
})();

const ROOT_MARKS = [
  { from: bsc.from.y, to: bsc.to.y, lane: 0, text: `${bsc.degree} ${bsc.field}` },
  { from: ssl.from.y, to: ssl.to.y, lane: 1, text: 'SSL robots' },
  { from: msc.from.y, to: msc.to.y, lane: 0, text: `${msc.degree} ${nano}` },
];

const TIMELINE_LABEL =
  `Career timeline from ${START} to ${db.asOf.y}: ${freelance.org.toLowerCase()} ${db.titleOf(freelance).toLowerCase()}, ${niknam.org}, ${alget.org}, ${zeroone.org}, ${neuroject.org} (now ${current.title}) and ${neuroship.org}; ` +
  `below the line, a ${bsc.degree}, ${ssl.title.replace(/ soccer robots$/, '')} robots, ${robocup.event} ${robocup.place} and a ${nationals.event.replace(/ Competitions$/, '')} ${nationals.place} in ${nationals.year}, an ${msc.degree} and an ${paper.venue} paper.`;

function Trophy({
  kind,
  size,
}: {
  kind: 'cup' | 'medal' | 'degree' | 'robot' | 'paper';
  size?: number;
}) {
  if (kind === 'cup')
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} className={s.icon} aria-hidden="true">
        <path d="M18 8h28v12a14 14 0 0 1-28 0z" className={s.gold} />
        <path d="M18 12H9a9 9 0 0 0 10 12M46 12h9a9 9 0 0 1-10 12" className={s.goldLine} />
        <path d="M28 33h8v10h-8z M20 44h24v6H20z M16 50h32v6H16z" className={s.gold} />
        <path
          d="M26 14l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z"
          transform="translate(6 0) scale(0.8)"
          className={s.goldStar}
        />
      </svg>
    );
  if (kind === 'medal')
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} className={s.icon} aria-hidden="true">
        <path d="M20 4l8 22M44 4l-8 22" className={s.ribbon} />
        <circle cx={32} cy={40} r={16} className={s.bronze} />
        <circle cx={32} cy={40} r={10} className={s.bronzeLine} />
        <text x={32} y={44} textAnchor="middle" className={s.medalNo}>
          3
        </text>
      </svg>
    );
  if (kind === 'degree')
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} className={s.icon} aria-hidden="true">
        <path d="M6 24l26-12 26 12-26 12z" className={s.cap} />
        <path d="M16 29v12c0 4 8 8 16 8s16-4 16-8V29l-16 7z" className={s.cap} />
        <path d="M54 26v16" className={s.tassel} />
        <circle cx={54} cy={44} r={3} className={s.tasselEnd} />
      </svg>
    );
  if (kind === 'paper')
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} className={s.icon} aria-hidden="true">
        <path d="M14 6h26l10 10v42H14z" className={s.paper} />
        <path d="M40 6v10h10M20 26h24M20 33h24M20 40h18M20 47h22" className={s.paperLine} />
      </svg>
    );
  return <RobotTop id={3} className={s.icon} />;
}

const trophyKind = (title: string) =>
  title.includes(robocup.place)
    ? 'cup'
    : title.includes(nationals.place)
      ? 'medal'
      : title.includes(paper.venue)
        ? 'paper'
        : title === ssl.title
          ? 'robot'
          : 'degree';

function Timeline() {
  return (
    <svg viewBox="0 0 1200 330" className={s.timeline} role="img" aria-label={TIMELINE_LABEL}>
      {Array.from({ length: SEASONS + 1 }, (_, i) => START + i).map((y) => (
        <g key={y}>
          <line x1={TX(y)} y1={AXIS - 4} x2={TX(y)} y2={AXIS + 4} className={s.tTick} />
          {(y - START) % 2 === 0 && (
            <text x={TX(y)} y={AXIS + 22} textAnchor="middle" className={s.tYear}>
              {y}
            </text>
          )}
        </g>
      ))}
      <line x1={TX(START)} y1={AXIS} x2={TX(START + SEASONS)} y2={AXIS} className={s.tAxis} />

      {LANES.map((r, i) => {
        const x0 = TX(r.start),
          x1 = TX(r.end ?? NOW),
          y = 136 - r.lane * 36,
          wide = x1 - x0 > 80;
        return (
          <g
            key={r.id}
            className={s.tRole}
            data-now={r.end ? undefined : true}
            style={{ '--i': i } as React.CSSProperties}
          >
            <rect x={x0} y={y} width={Math.max(4, x1 - x0 - 2)} height={26} rx={5} />
            {wide ? (
              <text x={x0 + 10} y={y + 17}>
                {r.org}
              </text>
            ) : (
              <text
                x={r.id === 'neuroship' ? x1 + 8 : x0}
                y={r.id === 'neuroship' ? y + 17 : y - 8}
                className={s.tOutside}
              >
                {r.org}
              </text>
            )}
          </g>
        );
      })}

      {/* substitutions at every change of club */}
      {LANES.slice(1).map((r) => (
        <g key={r.id} transform={`translate(${TX(r.start)} ${AXIS})`} className={s.tSub}>
          <circle r={9} />
          <path d="M-4 3V-4l-2.5 2.5M-4-4l2.5 2.5" className={s.tIn} />
          <path d="M4-3v7l-2.5-2.5M4 4l2.5-2.5" className={s.tOff} />
        </g>
      ))}

      {ROOT_MARKS.map((m) => (
        <g key={m.text} className={s.tRoot}>
          <rect
            x={TX(m.from)}
            y={204 + m.lane * 44}
            width={TX(m.to) - TX(m.from)}
            height={8}
            rx={4}
          />
          <text x={TX(m.from)} y={228 + m.lane * 44}>
            {m.text}
          </text>
        </g>
      ))}
      <g transform={`translate(${TX(robocup.year + 0.4) - 15} 282)`}>
        <Trophy kind="cup" size={30} />
      </g>
      <text
        x={TX(robocup.year + 0.4) + 22}
        y={300}
        className={s.tEvent}
      >{`${robocup.year} · ${robocup.event}, ${robocup.place} · ${nationals.event}, ${nationals.place}`}</text>
      <g transform={`translate(${TX(paper.date.y + 0.4) - 15} 218)`}>
        <Trophy kind="paper" size={30} />
      </g>
      <text
        x={TX(paper.date.y + 0.4) + 22}
        y={238}
        className={s.tEvent}
      >{`${paper.date.y} · ${paper.venue} paper`}</text>

      <g className={s.tNow} transform={`translate(${TX(NOW)} 0)`}>
        <line y1={64} y2={AXIS + 6} />
        <rect x={-26} y={44} width={52} height={20} rx={10} />
        <text y={58} textAnchor="middle">
          LIVE
        </text>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ page */

export default function Kickoff() {
  const ticker = [
    `${profile.name} · ${profile.role}, ${profile.company}`,
    `Building since ${person.since}`,
    ...stats.map((st) => `${st.value} ${st.label}`),
    `${robocup.event}, ${robocup.place} · ${robocup.year}`,
  ];

  return (
    <div className={s.root}>
      <a href="#lineup" className={s.skip}>
        Skip the match
      </a>
      <MatchBar stops={STOPS} />

      <main>
        <section id="kickoff" className={s.hero} aria-labelledby="kickoff-title">
          <div className={s.intro}>
            <p className={s.kicker}>
              <span className={s.clock}>0&apos;</span>
              Small Size League · live
            </p>
            <h1 id="kickoff-title">{profile.name}</h1>
            <p className={s.role}>{profile.tagline}</p>
            <p>{profile.lede}</p>
            <p>
              {`From ${ssl.from.y} to ${ssl.to.y} I built ${ssl.title} at the ${bsc.school}: a team of ${fmt.spell(ssl.team)} fully autonomous robots playing a real match. This is that game, simulated and playing live.`}
            </p>
            <div className={s.ctas}>
              <a href="#transfer" className={s.ctaMain}>
                Transfer request
              </a>
              <Out href={profile.cv} className={s.ctaGhost}>
                CV ↗
              </Out>
            </div>
          </div>
          <LiveMatch />
        </section>

        <div className={s.ticker} aria-hidden="true">
          <div className={s.tickerRun}>
            {[0, 1].map((k) => (
              <span key={k}>
                {ticker.map((t) => (
                  <span key={t}>
                    <i />
                    {t}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        <section id="lineup" className={s.section} aria-labelledby="lineup-title">
          <Head id="lineup" title="Team sheet" />
          <div className={s.sheet}>
            <figure className={s.card}>
              <div className={s.photo}>
                <Image src={person.photo} width={600} height={600} alt={profile.name} />
                <span className={s.detect} aria-hidden="true">
                  <i>player · conf .99</i>
                </span>
              </div>
              <figcaption>
                <b>{profile.name}</b>
                <span>{profile.fullName}</span>
              </figcaption>
              <dl>
                <div>
                  <dt>Position</dt>
                  <dd>{profile.role}</dd>
                </div>
                <div>
                  <dt>Club</dt>
                  <dd>
                    <Out href={profile.companyUrl}>{profile.company}</Out>
                  </dd>
                </div>
                <div>
                  <dt>Also</dt>
                  <dd>{`${neuroship.org}, on contract`}</dd>
                </div>
                <div>
                  <dt>Since</dt>
                  <dd>{person.since}</dd>
                </div>
              </dl>
            </figure>
            <div className={s.report}>
              <h3>Scouting report</h3>
              {about.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
          </div>

          <h3 className={s.h3}>
            Starting line-up <span>the toolchain, by squad number</span>
          </h3>
          <Seen className={s.squad}>
            <ol>
              {skills.map((k, i) => (
                <li key={k} style={{ '--i': i } as React.CSSProperties}>
                  <RobotTop id={i} className={s.squadBot} />
                  <span className={s.squadNo}>#{i}</span>
                  <b>{k}</b>
                </li>
              ))}
            </ol>
          </Seen>
          <p className={s.note}>
            Each robot wears a team dot and four pink or green markers: the pattern the cameras use
            to tell robots apart.
          </p>

          <h3 className={s.h3}>Career stats</h3>
          <dl className={s.stats}>
            {stats.map((st) => (
              <div key={st.label}>
                <dt>{st.label}</dt>
                <dd>{st.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="timeline" className={s.section} aria-labelledby="timeline-title">
          <Head
            id="timeline"
            title={`${fmt.Spell(db.yearsBuilding)} seasons, ${person.since} to now`}
          >
            Clubs above the line, roots below it. Every change of club is a substitution.
          </Head>
          <Seen className={s.timelineWrap} threshold={0.3}>
            <Timeline />
          </Seen>
          <ol className={s.commentary}>
            {jobs.map((job) => (
              <li key={job.company}>
                <div className={s.when}>
                  <span>{job.range}</span>
                  {job.range.includes('Present') && <b className={s.livePill}>Live</b>}
                </div>
                <div>
                  <h3>
                    {job.title} · {job.url ? <Out href={job.url}>{job.company}</Out> : job.company}
                  </h3>
                  <ul>
                    {job.duties.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="playbook" className={s.section} aria-labelledby="playbook-title">
          <Head id="playbook" title="Plays that shipped">
            Platforms in production, with links to the live sites and the stores.
          </Head>
          <div className={s.plays}>
            {featuredProjects.map((p, i) => {
              const links = projectLinks(p.links);
              return (
                <article key={p.title} className={s.play}>
                  <div className={s.shot}>
                    <Image src={p.image} width={1280} height={800} alt={`${p.title} screenshot`} />
                    <span className={s.playNo}>Play {String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <div className={s.playBody}>
                    <div className={s.playHead}>
                      <h3>{p.title}</h3>
                      <PlayDiagram seed={i + 1} />
                    </div>
                    <p>{p.description}</p>
                    <ul className={s.chips} aria-label="Stack">
                      {p.tech.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    {links.length > 0 && (
                      <div className={s.links}>
                        {links.map((l) => (
                          <Out key={l.url} href={l.url} className={s.link}>
                            {l.label} ↗
                          </Out>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <h3 className={s.h3}>More set pieces</h3>
          <ul className={s.pieces}>
            {otherProjects.map((p) => (
              <li key={p.title}>
                <h4>{p.title}</h4>
                <p>{p.description}</p>
                <span className={s.stack}>{p.tech.join(' · ')}</span>
                <span className={s.links}>
                  {projectLinks(p.links).map((l) => (
                    <Out key={l.url} href={l.url} className={s.link}>
                      {l.label} ↗
                    </Out>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="halftime"
          className={`${s.section} ${s.halftime}`}
          aria-labelledby="halftime-title"
        >
          <Head id="halftime" title="Under the cover">
            Half-time, so the robot comes apart. A Small Size robot packs a microcontroller, a
            radio, four motors, a kicker and a dribbler into 180 mm. I spent my university years
            building robots like this one; since then the hardware has gone into production.
          </Head>
          <Exploded />
          <h3 className={s.h3}>
            In production <span>{`${fmt.spell(hardware.length)} devices, still running`}</span>
          </h3>
          <ul className={s.devices}>
            {hardware.map((d) => (
              <li key={d.tag}>
                <span className={s.devTag}>{d.tag}</span>
                <h4>{d.name}</h4>
                <span className={s.devKind}>{d.kind}</span>
                <p>{d.detail}</p>
                <ul className={s.chips}>
                  {d.figures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section id="var" className={s.section} aria-labelledby="var-title">
          <Head id="var" title="Reviews upstream">
            {`${fmt.Spell(oss.length)} incidents in other people's code, reviewed and patched upstream, in packages downloaded ${downloads.weekly.long} times a week.`}
          </Head>
          <div className={s.vars}>
            {oss.map((c, i) => (
              <Seen key={c.repo} className={s.var} threshold={0.4}>
                <article data-kind={c.kind} style={{ '--i': i } as React.CSSProperties}>
                  <header>
                    <span className={s.varTag}>VAR</span>
                    <span className={s.varState}>
                      <i>Checking</i>
                      <b>Check complete</b>
                    </span>
                    <span className={s.varYear}>{c.year}</span>
                  </header>
                  <h3>
                    <Out href={c.url}>{c.repo}</Out>
                  </h3>
                  <p className={s.reach}>
                    ★ {c.stars} · {c.weekly} downloads a week
                  </p>
                  <dl>
                    <dt>
                      Incident <span className={s.kind}>{c.kind}</span>
                    </dt>
                    <dd>{c.impact}</dd>
                    <dt>Decision</dt>
                    <dd>{c.change}</dd>
                  </dl>
                  <Out href={c.url} className={s.link}>
                    Review the PR ↗
                  </Out>
                </article>
              </Seen>
            ))}
          </div>
        </section>

        <section id="trophies" className={s.section} aria-labelledby="trophies-title">
          <Head
            id="trophies"
            title="Roots"
          >{`Robotics, ${bsc.focus.toLowerCase()} and a little ${nano.toLowerCase()}, before the software took over.`}</Head>
          <ul className={s.cabinet}>
            {roots.map((r) => (
              <li key={r.title} data-kind={trophyKind(r.title)}>
                <Trophy kind={trophyKind(r.title)} />
                <span className={s.plate}>{r.year}</span>
                <h3>{r.title}</h3>
                <p>{r.detail}</p>
                {r.url && (
                  <Out href={r.url} className={s.link}>{`Read it on ${paper.venue} ↗`}</Out>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section id="transfer" className={s.section} aria-labelledby="transfer-title">
          <Head id="transfer" title="Make an approach" />
          <div className={s.transfer}>
            <div className={s.form}>
              <header>
                <b>Transfer request</b>
                <span>Form TR-1 · {Math.floor(NOW)}</span>
              </header>
              <dl>
                <div>
                  <dt>Player</dt>
                  <dd>
                    {profile.fullName} ({profile.name})
                  </dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>{profile.role}</dd>
                </div>
                <div>
                  <dt>Current club</dt>
                  <dd>
                    {profile.company}
                    {`, since ${fmt.month(neuroject.from)}`}
                  </dd>
                </div>
                <div>
                  <dt>Also playing for</dt>
                  <dd>{`${neuroship.org}, ${db.titleOf(neuroship)} on contract, since ${fmt.month(neuroship.from)}`}</dd>
                </div>
                <div>
                  <dt>Career start</dt>
                  <dd>{fmt.month(freelance.from)}</dd>
                </div>
              </dl>
              <p className={s.ask}>
                Write about a platform, a device or a team that needs building.
              </p>
              <a href={`mailto:${profile.email}`} className={s.email}>
                {profile.email}
              </a>
              <div className={s.contactLinks}>
                <Out href={profile.linkedin} className={s.link}>
                  LinkedIn ↗
                </Out>
                <Out href={profile.github} className={s.link}>
                  GitHub ↗
                </Out>
                <Out href={profile.cv} className={s.link}>
                  CV ↗
                </Out>
              </div>
            </div>
            <figure className={s.board}>
              <svg
                viewBox="0 0 400 300"
                role="img"
                aria-label={`A tactics board: you play the ball in, ${person.first} takes it first time, and it ends in the goal.`}
              >
                <rect x={6} y={6} width={388} height={288} rx={10} className={s.bField} />
                <path
                  d="M200,6 V294 M394,105 A45,45 0 0,0 349,140 V160 A45,45 0 0,0 394,195 M6,105 A45,45 0 0,1 51,140 V160 A45,45 0 0,1 6,195"
                  className={s.bLine}
                />
                <circle cx={200} cy={150} r={40} className={s.bLine} />
                <path d="M92,226 Q170,250 268,150" className={s.bPass} />
                <path d="M268,150 L386,142" className={s.bShot} />
                <g className={s.bYou}>
                  <path d="M80,214 l24,24 M104,214 l-24,24" />
                </g>
                <text x={92} y={268} textAnchor="middle" className={s.bText}>
                  you
                </text>
                <g transform="translate(268 150) scale(0.2)">
                  <RobotTop id={7} />
                </g>
                <text x={268} y={122} textAnchor="middle" className={s.bText}>
                  {INITIALS}
                </text>
                <text x={380} y={124} textAnchor="end" className={s.bText}>
                  shipped
                </text>
              </svg>
              <figcaption>
                The set piece: you play the problem in, it ends in the back of the net.
              </figcaption>
            </figure>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <span>
          <b>FT</b> · {`${concept('kickoff').name} · concept ${concept('kickoff').letter}`}
        </span>
        <span>
          Field drawn to the 2010 SSL rules: 6050 × 4050 mm, 500 mm defense radius, 350 mm stretch.
          The match is a simulation.
        </span>
        <span>
          © {profile.fullName}
          {`, ${person.since} → `}
          {Math.floor(NOW)}
        </span>
      </footer>
    </div>
  );
}
