// The recorded runs. Each bag is one chapter of the site, and each card in it is a fact the
// overlay shows while the bag plays (and a waypoint the rover drives to). Everything is read
// from db through _shared/data; the only numbers typed here are playback timings.
import {
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  liveLinks,
  otherProjects,
  profile,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';

export interface Link {
  label: string;
  url: string;
}

export interface Card {
  /** Small line above the title: the bag's own index for the card. */
  kicker: string;
  title: string;
  /** Dates, place, kind. */
  meta?: string;
  body: string[];
  /** Render the body as a list (duties) rather than paragraphs. */
  list?: boolean;
  tags?: string[];
  figures?: { value: string; label: string }[];
  links?: Link[];
  image?: string;
  /** The text on the card's station marker in the 3D view. */
  marker: string;
  /** Seconds on screen, from how much there is to read. */
  dur: number;
  start: number;
}

export type Focus = 'field' | 'arena' | 'quad';

export interface Bag {
  id: string;
  file: string;
  title: string;
  /** Where the camera looks when the bag is opened. */
  focus: Focus;
  cards: Card[];
  duration: number;
}

const { person, robots, awards, education, papers, contributions } = db;

/** Reading time: a few seconds plus a little per character, within limits. */
function readTime(c: Omit<Card, 'dur' | 'start'>) {
  const chars =
    c.title.length +
    (c.meta?.length ?? 0) +
    c.body.join(' ').length +
    (c.tags?.join(' ').length ?? 0) +
    (c.figures?.length ?? 0) * 24;
  return Math.min(14, Math.max(5.5, 3.5 + chars * 0.026));
}

function bag(id: string, title: string, focus: Focus, raw: Omit<Card, 'dur' | 'start'>[]): Bag {
  let t = 0.6;
  const cards = raw.map((c, i) => {
    const card: Card = {
      ...c,
      kicker: `${i + 1}/${raw.length} · ${c.kicker}`,
      dur: readTime(c),
      start: t,
    };
    t += card.dur;
    return card;
  });
  return { id, file: `${id}.bag`, title, focus, cards, duration: Math.ceil(t + 1.4) };
}

const contact: Link[] = [
  { label: profile.email, url: `mailto:${profile.email}` },
  { label: 'LinkedIn', url: profile.linkedin },
  { label: 'GitHub', url: profile.github },
  { label: 'CV (PDF)', url: profile.cv },
];

const about0 = bag('about', 'Who', 'field', [
  {
    kicker: 'whoami',
    title: profile.name,
    meta: `${profile.role} at ${profile.company}`,
    body: [`${profile.headline}. ${profile.tagline}`, db.lede],
    links: [{ label: profile.company, url: profile.companyUrl }, ...contact.slice(0, 1)],
    marker: 'whoami',
  },
  ...about.map((p, i) => ({
    kicker: 'about',
    title: i ? 'About, continued' : 'About',
    body: [p],
    marker: `about ${i + 1}`,
  })),
  { kicker: 'skills', title: 'Skills', body: [], tags: skills, marker: 'skills' },
  {
    kicker: 'figures',
    title: 'In numbers',
    body: [],
    figures: stats.map((m) => ({ value: m.value, label: m.label })),
    marker: 'figures',
  },
]);

const { bsc, msc } = education;
const { robocup, skills: skillsAward } = awards;
const paper = papers.inverter;

const roots = bag('roots_robocup', 'Roots and RoboCup', 'field', [
  {
    kicker: 'education',
    title: db.degreeTitle(bsc),
    meta: fmt.yearSpan(bsc.from, bsc.to),
    body: [`${bsc.school}.`, `Thesis: ${bsc.thesis}.`],
    marker: bsc.degree,
  },
  {
    kicker: 'robots',
    title: robots.ssl.title,
    meta: `${fmt.yearSpan(robots.ssl.from, robots.ssl.to)} · ${bsc.school}`,
    body: [robots.ssl.detail],
    figures: [{ value: String(robots.ssl.team), label: 'robots on the team' }],
    marker: 'SSL team',
  },
  {
    kicker: 'award',
    title: robocup.event,
    meta: fmt.month(robocup.date),
    body: [`${robocup.place}, ${robocup.challenge}.`],
    marker: `${robocup.year}`,
  },
  {
    kicker: 'award',
    title: skillsAward.event,
    meta: String(skillsAward.year),
    body: [
      `${skillsAward.place[0].toUpperCase()}${skillsAward.place.slice(1)} in ${skillsAward.challenge}.`,
    ],
    marker: skillsAward.challenge,
  },
  {
    kicker: 'robots',
    title: robots.quadcopter.title,
    meta: 'Undated: no years or results on record',
    body: [robots.quadcopter.detail],
    marker: 'quadcopter',
  },
  {
    kicker: 'education',
    title: db.degreeTitle(msc),
    meta: fmt.yearSpan(msc.from, msc.to),
    body: [`${msc.school}.`, `Thesis: ${msc.thesis}.`],
    marker: msc.degree,
  },
  {
    kicker: 'paper',
    title: paper.title,
    meta: `${paper.venue} · ${fmt.month(paper.date)}`,
    body: [],
    links: [{ label: `${paper.venue} ${paper.id}`, url: paper.url }],
    marker: paper.venue,
  },
]);

// Oldest first: the bag plays the career forward in time and ends on today's role.
const roles = bag(
  'roles',
  'Every role',
  'arena',
  [...db.roleList].reverse().map((r) => ({
    kicker: r.org,
    title: db.titlePath(r),
    meta: `${fmt.monthSpan(r.from, r.to)}${r.contract ? ' · contract' : ''}${r.sector ? ` · ${r.sector}` : ''}`,
    body: r.duties,
    list: r.duties.length > 1,
    links: r.url ? [{ label: new URL(r.url).host, url: r.url }] : undefined,
    marker: r.short ?? r.org,
  })),
);

const projects = bag('projects', 'Projects', 'arena', [
  ...featuredProjects.map((p) => ({
    kicker: 'featured',
    title: p.title,
    body: [p.description],
    tags: p.tech,
    links: projectLinks(p.links).map((l) => ({ label: l.label, url: l.url })),
    image: p.image,
    marker: p.title,
  })),
  ...otherProjects.map((p) => ({
    kicker: 'project',
    title: p.title,
    body: [p.description],
    tags: p.tech,
    links: projectLinks(p.links).map((l) => ({ label: l.label, url: l.url })),
    marker: p.title.split(':')[0],
  })),
]);

const devices = bag(
  'hardware',
  'Hardware',
  'quad',
  hardware.map((d) => ({
    kicker: d.tag,
    title: d.name,
    meta: d.kind,
    body: [d.detail],
    figures: d.figures.map((f) => {
      const [value, ...rest] = f.split(' ');
      return /^\d/.test(value) ? { value, label: rest.join(' ') } : { value: '●', label: f };
    }),
    marker: d.tag,
  })),
);

const source = bag('open_source', 'Open source', 'arena', [
  {
    kicker: 'upstream',
    title: 'Open source',
    body: [
      `Fixes merged into libraries downloaded ${db.downloads.weekly.long} times a week (${db.downloads.exact} combined).`,
    ],
    figures: [{ value: db.downloads.weekly.short, label: 'weekly downloads' }],
    marker: 'upstream',
  },
  ...Object.values(contributions).map((c: db.Contribution) => ({
    kicker: c.kind,
    title: c.repo,
    meta: `${c.year} · pull request #${c.pr}`,
    body: [c.change, c.impact],
    figures: [
      { value: `★ ${c.stars}`, label: 'stars' },
      { value: c.weekly.short, label: 'downloads a week' },
    ],
    links: [{ label: `PR #${c.pr}`, url: db.prUrl(c) }],
    marker: c.repo.split('/')[1],
  })),
]);

const reach = bag('contact', 'Contact', 'quad', [
  {
    kicker: 'contact',
    title: 'Contact',
    meta: person.site,
    body: ['Write about a platform, a device or a team that needs building.'],
    links: contact,
    marker: 'contact',
  },
  {
    kicker: 'live',
    title: 'In the stores',
    body: ['Apps shipped to both stores, live now.'],
    links: liveLinks.map((l) => ({ label: l.label, url: l.url })),
    marker: 'stores',
  },
]);

export const BAGS: Bag[] = [about0, roots, roles, projects, devices, source, reach];

/** The card playing at time t, or the last one before it. */
export function cardAt(b: Bag, t: number) {
  let k = 0;
  for (let i = 0; i < b.cards.length; i++) if (t >= b.cards[i].start) k = i;
  return k;
}

/** A config name for the title bar, from his name: "moe_babazadeh.rcfg". */
export const CONFIG = `${person.name.toLowerCase().replace(/\s+/g, '_')}.rcfg`;
