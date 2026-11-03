import Image from 'next/image';
import { db, profile } from '../_shared/data';
import Contact from './Contact';
import Erd from './Erd';
import Facts from './Facts';
import { TABLES } from './sql/catalog';
import Workbench from './Workbench';
import s from './query.module.scss';
import { conceptTitle } from '../_shared/concepts';

const { person } = db;
const { attendum, activeClass } = db.products;
const ROWS = TABLES.reduce((n, t) => n + t.rows.length, 0);
const FKS = TABLES.reduce((n, t) => n + t.columns.filter((c) => c.fk).length, 0);

function Logo() {
  return (
    <svg viewBox="0 0 28 28" className={s.logo} aria-hidden="true">
      <ellipse cx="14" cy="7" rx="9" ry="3.5" />
      <path d="M5 7v14c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5V7M5 14c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5" />
      <circle cx="21.5" cy="21" r="3" className={s.logoDot} />
    </svg>
  );
}

const UNDER_THE_HOOD = [
  [
    'Parser',
    'A lexer and a recursive-descent parser that keep a position on every node, so an error can point at its character.',
  ],
  [
    'Planner',
    'Pushes filters into scans, uses the primary-key index for lookups, and picks Hash Join or Nested Loop with a cost model in Postgres’ units.',
  ],
  [
    'Executor',
    'Every operator is a generator, so rows really stream: a Limit stops its scan early, a Sort or Hash takes everything first.',
  ],
  [
    'Replay',
    'Each row that moves between operators is logged on a simulated clock, and the plan view replays the log as particles.',
  ],
];

export default function Query() {
  return (
    <div className={s.root}>
      <a href="#workbench" className={s.skip}>
        Skip to the workbench
      </a>
      <header className={s.top}>
        <a href="#top" className={s.brand}>
          <Logo />
          <b>{person.site}</b>
          <span>/ career.sql</span>
        </a>
        <nav className={s.nav} aria-label="Sections">
          <a href="#workbench">Workbench</a>
          <a href="#schema">Schema</a>
          <a href="#write">Write</a>
        </nav>
        <nav className={s.topLinks} aria-label="Elsewhere">
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV ↗
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn ↗
          </a>
        </nav>
      </header>

      <main>
        <section id="top" className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroMain}>
            <p className={s.conninfo}>
              <span>career=&gt;</span> \conninfo
              <br />
              You are connected to database &quot;career&quot; as user &quot;visitor&quot;.
              <br />
              <span>career=&gt;</span> <i className={s.cursor} aria-hidden="true" />
            </p>
            <div className={s.who}>
              <Image
                src={person.photo}
                width={600}
                height={600}
                alt={profile.name}
                className={s.avatar}
                priority
                sizes="84px"
              />
              <div>
                <h1 id="hero-title">{profile.name}</h1>
                <p className={s.role}>
                  {`${profile.role} at`}{' '}
                  <a href={profile.companyUrl} target="_blank" rel="noreferrer">
                    {profile.company}
                  </a>{' '}
                  {`· building since ${person.since}`}
                </p>
              </div>
            </div>
            <p className={s.tagline}>{profile.tagline}</p>
            <p className={s.lede}>{profile.lede}</p>
            <p className={s.invite}>
              Here his career is a database: {TABLES.length} tables, {ROWS} rows, {FKS} foreign
              keys. Pick a saved query or write your own, and watch each row stream up through the
              query plan.
            </p>
            <div className={s.cta}>
              <a href="#workbench" className={s.primary}>
                Open the workbench
              </a>
              <a href={`mailto:${profile.email}`}>Email</a>
              <a href={profile.cv} target="_blank" rel="noreferrer">
                CV ↗
              </a>
            </div>
          </div>
          <Facts />
        </section>

        <Workbench />

        <section className={s.hood} aria-labelledby="hood-title">
          <h2 id="hood-title" className={s.sr}>
            Under the hood
          </h2>
          {UNDER_THE_HOOD.map(([t, d], i) => (
            <div key={t}>
              <span className={s.hoodIdx}>0{i + 1}</span>
              <b>{t}</b>
              <p>{d}</p>
            </div>
          ))}
        </section>

        <section id="schema" className={s.section} aria-labelledby="schema-title">
          <header className={s.secHead}>
            <span className={s.secIdx}>\d+</span>
            <h2 id="schema-title">Schema</h2>
            <p>
              {TABLES.length} tables and {FKS}
              {` foreign keys, built from his CV and project list. Projects and tech are many-to-many; ${attendum.title} and ${activeClass.title} are umbrella rows whose parts point back with parent_id. Click a table to query it.`}
            </p>
          </header>
          <Erd />
        </section>

        <section id="write" className={s.section} aria-labelledby="write-title">
          <header className={s.secHead}>
            <span className={s.secIdx}>INSERT</span>
            <h2 id="write-title">Write to him</h2>
            <p>
              The only write a visitor may make. Fill in the string literals and execute: the engine
              checks the constraints, then your mail app takes over.
            </p>
          </header>
          <Contact />
        </section>
      </main>

      <footer className={s.footer}>
        <span>{`${conceptTitle('query-plan')} · a concept for ${person.site}`}</span>
        <span>
          Rows are real, from his CV and projects. Plan costs come from the engine’s cost model;
          timings are simulated.
        </span>
        <span>© {profile.fullName}</span>
      </footer>
    </div>
  );
}
