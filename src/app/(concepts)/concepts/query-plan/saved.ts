// Saved queries: the story, told as SQL. A story quotes its own query's result where it can (row
// counts, the top tech) and reads every other fact from db, so the two can't drift apart.
import { db, fmt, oss } from '../_shared/data';
import { execute } from './sql/engine';
import type { Row } from './sql/types';

export interface Saved {
  id: string;
  file: string;
  title: string;
  story: string;
  sql: string;
}

const { current, commits, downloads } = db;
const { freelance, niknam, alget, zeroone, neuroject, neuroship } = db.roles;
const { neurobuild, smartclaim, attendum } = db.products;
const { logger } = db.devices;
const { bsc, msc } = db.education;
const { robocup } = db.awards;
const league = db.robots.ssl.title.replace(/ soccer robots$/, '');
const cap = (text: string) => text[0].toUpperCase() + text.slice(1);

type Draft = Omit<Saved, 'story'> & { story: string | ((rows: Row[]) => string) };

/** Runs a query once, so its story can quote what it returns. */
const tell = ({ story, ...q }: Draft): Saved => ({
  ...q,
  story: typeof story === 'string' ? story : story(execute(q.sql).rows),
});

const byYear = (rows: Row[]) => [...rows].sort((a, b) => Number(a[1]) - Number(b[1]));

const DRAFTS: Draft[] = [
  {
    id: 'now',
    file: 'current_roles.sql',
    title: 'Where he works today',
    story: (rows) =>
      `${fmt.Spell(rows.length)} open rows. ${current.title} at ${current.company} since ${fmt.month(current.since)}, after joining as ${current.previous.title} in ${fmt.month(current.previous.from)}, and a contract role at ${neuroship.org} since ${fmt.month(neuroship.from)}.`,
    sql: `-- Where he works today
SELECT o.name AS org, r.title, r.started
FROM roles r
JOIN orgs o ON o.id = r.org_id
WHERE r.ended IS NULL
ORDER BY r.started DESC;`,
  },
  {
    id: 'cto',
    file: `${current.company.toLowerCase()}_duties.sql`,
    title: `What the ${current.title} does`,
    story: `In his words: the architecture, roadmap and delivery of a multi-tenant platform for construction enterprises, AI in the product, ${neurobuild.title} with ${commits.neurobuild.short} commits across ${fmt.spell(commits.neurobuildCodebases)} codebases, and the engineering bar.`,
    sql: `-- What he does at ${current.company}
SELECT d.seq, d.text
FROM duties d
JOIN orgs o ON o.id = d.org_id
WHERE o.name = '${current.company}'
ORDER BY d.seq;`,
  },
  {
    id: 'career',
    file: 'career.sql',
    title: `Every role since ${db.person.since}`,
    story: (rows) =>
      `${fmt.Spell(rows.length)} rows over ${db.yearsBuilding} years: freelance web work from ${freelance.from.y}, almost ${fmt.spell(Math.ceil(fmt.monthsBetween(niknam.from, niknam.to) / 12))} years of web apps and IoT platforms at ${niknam.short}, frontend roles at ${alget.org} and ${zeroone.org} (senior, then lead), then ${neuroject.org}. The years column is derived from the dates.`,
    sql: `-- Every role since ${db.person.since}
SELECT r.started, r.ended, o.name AS org,
       r.title, r.years
FROM roles r
JOIN orgs o ON o.id = r.org_id
ORDER BY r.started;`,
  },
  {
    id: 'ai',
    file: 'ai.sql',
    title: 'Where the AI is',
    story: (rows) =>
      `${fmt.Spell(rows.length)} products describe AI: ${neurobuild.title}, which now answers natural-language questions and warns early on risk, and ${smartclaim.title}, AI-assisted R&D tax credit claims, where he works across the FastAPI and pgvector API. Note the planner guessed 1 row: LIKE is hard to estimate.`,
    sql: `-- Products with AI in them
SELECT title, made_at, url
FROM projects
WHERE description LIKE '% AI%'
   OR description LIKE 'AI%';`,
  },
  {
    id: 'tech',
    file: 'top_tech.sql',
    title: 'The most-used tech',
    story: ([first, second]) =>
      `${first[0]} leads with ${fmt.spell(Number(first[1]))} products, from ${neurobuild.title} to the ${zeroone.org} websites, then ${second[0]} with ${fmt.spell(Number(second[1]))}. Parts of one product, like ${attendum.title}’s app, firmware and beacon, count once through coalesce(parent_id, id).`,
    sql: `-- Most-used tech, counted once per product
SELECT t.name AS tech,
       count(DISTINCT coalesce(p.parent_id, p.id))
         AS products
FROM project_tech pt
JOIN tech t ON t.id = pt.tech_id
JOIN projects p ON p.id = pt.project_id
GROUP BY t.name
ORDER BY products DESC, tech
LIMIT 10;`,
  },
  {
    id: 'stores',
    file: 'app_stores.sql',
    title: 'On the App Store and Google Play',
    story: (rows) => {
      const [first, second] = byYear(rows);
      return `${fmt.Spell(rows.length)} apps, each live on both stores and both built with Expo and React Native at ${zeroone.org}: the ${first[0]} (${first[1]}) and ${second[0]} (${second[1]}). The links open the listings.`;
    },
    sql: `-- Shipped to both app stores
SELECT title, year, made_at,
       app_store, play_store
FROM projects
WHERE app_store IS NOT NULL
   OR play_store IS NOT NULL;`,
  },
  {
    id: 'hardware',
    file: 'hardware.sql',
    title: 'Hardware in production',
    story: (rows) =>
      `${fmt.Spell(rows.length)} devices in the field. The ${logger.name} fleet: ${logger.stations.short} ${logger.kind}s, online for ${logger.online.short} years, with ${logger.records.long} records. ${attendum.title}’s readers and beacons run firmware he wrote; their figures come from a single university.`,
    sql: `-- Devices running in the field
SELECT d.tag, d.name, p.title AS project,
       d.kind, d.figures, d.note
FROM devices d
JOIN projects p ON p.id = d.project_id
ORDER BY d.tag;`,
  },
  {
    id: 'oss',
    file: 'upstream_fixes.sql',
    title: 'Open-source fixes by reach',
    story: (rows) =>
      `${fmt.Spell(rows.length)} fixes sent upstream, in packages downloaded about ${downloads.exact} times a week combined: the ${downloads.weekly.short} in his headline numbers. The biggest removed a uuid version from Gatsby that could fall back to Math.random().`,
    sql: `-- Upstream fixes, by weekly downloads
SELECT repo, kind, weekly_downloads,
       stars, year, url
FROM contributions
ORDER BY weekly_downloads DESC;`,
  },
  {
    id: 'roots',
    file: 'roots.sql',
    title: 'Engineering roots',
    story: `${cap(bsc.field.toLowerCase())} with a focus on ${bsc.focus.toLowerCase()}, and robots during it: a ${league} team and ${robocup.place} at ${robocup.event} ${robocup.year}, in the ${robocup.challenge}. An ${msc.degree} in ${msc.field.toLowerCase()} and a paper on ${db.papers.inverter.venue} followed.`,
    sql: `-- Engineering roots
SELECT period, title, detail
FROM roots
ORDER BY id;`,
  },
  {
    id: 'typo',
    file: 'typo.sql',
    title: 'A typo, on purpose',
    story:
      'Errors come back the way Postgres writes them: the message, the line, a caret under the problem and a hint. Fix the column name and press ⌘↵.',
    sql: `-- Mistakes get Postgres-grade errors
SELECT title, startd
FROM roles
WHERE ended IS NULL;`,
  },
];

export const SAVED: Saved[] = DRAFTS.map(tell);

/** Queries behind the headline numbers, so each one can be checked. */
export const VERIFY: Record<string, { sql: string; story: string }> = {
  downloads: {
    sql: `-- Weekly downloads of the packages he patched
SELECT count(*) AS fixes,
       sum(weekly_downloads) AS weekly
FROM contributions;`,
    story: `The ${fmt.spell(oss.length)} packages he patched add up to about ${fmt.grouped(downloads.weekly.n)} downloads a week, from the rounded figures on each repo.`,
  },
  records: {
    sql: `-- The weather station fleet
SELECT tag, name, figures
FROM devices
WHERE tag = '${logger.tag}';`,
    // "over half a billion", without the "over".
    story: `${cap(logger.records.long.replace(/^over /, ''))} records come from the ${logger.name} fleet: ${logger.kind}s online for ${logger.online.long} years. A lookup by primary key, so the planner uses the index.`,
  },
};
