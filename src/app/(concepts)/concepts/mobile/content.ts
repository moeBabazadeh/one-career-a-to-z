// What the phone holds, read from the facts (src/content/db.ts via _shared/data). Apps,
// notifications, calendar events, notes, files and the search index are all built here, so the
// components only lay them out. Nothing in this file types a fact.
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
  roots,
  skills,
  type Device,
} from '../_shared/data';
import type { YearMonth } from '@/content/format';

/* ------------------------------------------------------------------ apps */

export type IconName =
  | 'contacts'
  | 'mail'
  | 'calendar'
  | 'files'
  | 'notes'
  | 'code'
  | 'hardware'
  | 'projects'
  | 'browser'
  | 'settings'
  | 'checkin'
  | 'guide';

export interface AppDef {
  id: string;
  name: string;
  icon: IconName;
  /** The product an app is, for Moe's own store apps. */
  product?: db.ProductId;
}

const SYSTEM: AppDef[] = [
  { id: 'contacts', name: 'Contacts', icon: 'contacts' },
  { id: 'mail', name: 'Mail', icon: 'mail' },
  { id: 'calendar', name: 'Calendar', icon: 'calendar' },
  { id: 'files', name: 'Files', icon: 'files' },
  { id: 'notes', name: 'Notes', icon: 'notes' },
  { id: 'code', name: 'Code', icon: 'code' },
  { id: 'hardware', name: 'Hardware', icon: 'hardware' },
  { id: 'projects', name: 'Projects', icon: 'projects' },
  { id: 'browser', name: 'Browser', icon: 'browser' },
  { id: 'settings', name: 'Settings', icon: 'settings' },
];

/** Moe's apps on both stores, straight from the products that have both store links. */
export const STORE_IDS = (Object.keys(db.products) as db.ProductId[]).filter((id) => {
  const links: db.ProjectLinks = db.products[id].links;
  return !!links.appStore && !!links.playStore;
});

const STORE_ICONS: Partial<Record<db.ProductId, IconName>> = {
  attendum: 'checkin',
  educationGuide: 'guide',
};

const STORE: AppDef[] = STORE_IDS.map((id) => ({
  id,
  name: db.products[id].title,
  icon: STORE_ICONS[id] ?? 'projects',
  product: id,
}));

export const APPS: Record<string, AppDef> = Object.fromEntries(
  [...SYSTEM, ...STORE].map((a) => [a.id, a]),
);

export const DOCK = ['contacts', 'mail', 'calendar', 'files'];

export type Widget = 'now' | 'glance' | 'today' | 'devices';

export interface HomePage {
  widgets: Widget[];
  apps: string[];
}

export const PAGES: HomePage[] = [
  {
    widgets: ['now'],
    apps: [
      ...STORE.map((a) => a.id),
      'projects',
      'code',
      'notes',
      'hardware',
      'browser',
      'settings',
    ],
  },
  { widgets: ['glance', 'today', 'devices'], apps: [] },
];

/* ------------------------------------------------------------------ people and links */

export const current = db.current;
export const neuroship = db.roles.neuroship;

/** "Babazadeh": the family name, from the name. */
const family = db.person.name.split(' ').slice(1).join(' ');

/** The contact card as a vCard 3.0, for Share Contact. */
export function vcard() {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(family)};${esc(db.person.first)};;;`,
    `FN:${esc(db.person.name)}`,
    `TITLE:${esc(current.title)}`,
    `ORG:${esc(current.company)}`,
    `EMAIL;TYPE=INTERNET,PREF:${db.person.email}`,
    `URL:${db.person.url}`,
    `item1.URL:${db.person.linkedin}`,
    'item1.X-ABLabel:LinkedIn',
    `item2.URL:${db.person.github}`,
    'item2.X-ABLabel:GitHub',
    `NOTE:${esc(db.person.headline)}. ${esc(db.person.tagline)}`,
    'END:VCARD',
    '',
  ].join('\r\n');
}

export const vcardName = `${db.person.name.replace(/\s+/g, '-')}.vcf`;

/** A mailto: address with the subject and body filled in. */
export const mailto = (subject: string, body: string) => {
  const q = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body)}`,
  ]
    .filter(Boolean)
    .join('&');
  return `mailto:${db.person.email}${q ? `?${q}` : ''}`;
};

export const host = (url: string) => new URL(url, db.person.url).host.replace(/^www\./, '');

/* ------------------------------------------------------------------ calendar */

export type CalId = 'work' | 'study' | 'awards' | 'papers' | 'oss' | 'builds';

export const CALENDARS: { id: CalId; name: string }[] = [
  { id: 'work', name: 'Work' },
  { id: 'study', name: 'Study' },
  { id: 'awards', name: 'Competitions' },
  { id: 'papers', name: 'Papers' },
  { id: 'oss', name: 'Open source' },
  { id: 'builds', name: 'Builds' },
];

export interface CalEvent {
  id: string;
  cal: CalId;
  title: string;
  where?: string;
  /** Missing for things with no date on record. */
  from?: YearMonth;
  /** `null` while it's ongoing; missing for a single moment. */
  to?: YearMonth | null;
  steps?: { title: string; from: YearMonth }[];
  notes: string[];
  url?: string;
  /** Where it opens in another app. */
  link?: { app: string; path: string };
}

const roleEvents: CalEvent[] = db.roleList.map((r) => ({
  id: r.id,
  cal: 'work',
  title: `${db.titleOf(r)}${r.contract ? ' (contract)' : ''}`,
  where: r.org,
  from: r.from,
  to: r.to,
  steps: r.steps.length > 1 ? r.steps : undefined,
  notes: [r.summary, ...r.duties],
  url: r.url,
}));

const { bsc, msc } = db.education;
const { robocup, skills: skillsAward } = db.awards;
const paper = db.papers.inverter;

const studyEvents: CalEvent[] = [
  {
    id: 'bsc',
    cal: 'study',
    title: db.degreeTitle(bsc),
    where: bsc.school,
    from: bsc.from,
    to: bsc.to,
    notes: [`Thesis: ${bsc.thesis}.`],
  },
  {
    id: 'msc',
    cal: 'study',
    title: db.degreeTitle(msc),
    where: msc.school,
    from: msc.from,
    to: msc.to,
    notes: [`Thesis: ${msc.thesis}.`],
  },
  {
    id: 'ssl',
    cal: 'awards',
    title: db.robots.ssl.title,
    where: bsc.school,
    from: db.robots.ssl.from,
    to: db.robots.ssl.to,
    notes: [db.robots.ssl.detail],
  },
  {
    id: 'robocup',
    cal: 'awards',
    title: `${robocup.event}: ${robocup.place}`,
    where: robocup.challenge,
    from: robocup.date,
    notes: [`${robocup.place}, ${robocup.challenge}.`],
  },
  {
    id: 'skills',
    cal: 'awards',
    title: `${skillsAward.event}: ${skillsAward.place}`,
    where: skillsAward.challenge,
    from: { y: skillsAward.year },
    notes: [`${skillsAward.challenge}.`],
  },
  {
    id: 'paper',
    cal: 'papers',
    title: paper.title,
    where: `${paper.venue} ${paper.id}`,
    from: paper.date,
    notes: [`Published on ${paper.venue}.`],
    url: paper.url,
  },
];

const ossEvents: CalEvent[] = (Object.keys(db.contributions) as db.ContributionId[]).map((id) => {
  const c: db.Contribution = db.contributions[id];
  return {
    id: `pr-${id}`,
    cal: 'oss',
    title: `${c.repo} #${c.pr}`,
    where: c.kind,
    from: { y: c.year },
    notes: [c.change, c.impact],
    url: db.prUrl(c),
    link: { app: 'code', path: `pr/${id}` },
  };
});

const undated: CalEvent[] = [
  {
    id: 'quadcopter',
    cal: 'awards',
    title: db.robots.quadcopter.title,
    notes: [db.robots.quadcopter.detail],
  },
  ...archive
    .filter((b) => b.year === '—')
    .map((b, i): CalEvent => ({
      id: `undated-${i}`,
      cal: 'builds',
      title: b.title,
      where: b.madeAt,
      notes: [b.tech.join(' · ')],
    })),
];

export const EVENTS: CalEvent[] = [...roleEvents, ...studyEvents, ...ossEvents, ...undated];

export const eventById = (id: string) => EVENTS.find((e) => e.id === id);

/** Whether both ends are known to the month; otherwise the event is shown as an all-year entry. */
export const monthly = (e: CalEvent) =>
  !!e.from?.m && (e.to === undefined || e.to === null || !!e.to.m);

const at = (d: YearMonth, fallback: number) => d.y * 12 + (d.m ?? fallback) - 1;

/** Whether a month-precise event is on during month m (0–11) of year y; ongoing runs to `until`. */
export function inMonth(e: CalEvent, y: number, m: number, until: YearMonth) {
  if (!e.from || !monthly(e)) return false;
  const start = at(e.from, 1);
  const end = e.to === undefined ? start : at(e.to ?? until, 12);
  const here = y * 12 + m;
  return here >= start && here <= end;
}

/** Whether an event touches year y at all. */
export function inYear(e: CalEvent, y: number, until: YearMonth) {
  if (!e.from) return false;
  const end = e.to === undefined ? e.from.y : (e.to ?? until).y;
  return y >= e.from.y && y <= end;
}

/** "Oct 2012 – Aug 2020", "2008 – 2012", "Apr 2010", "Sep 2026 – now". */
export function when(e: CalEvent) {
  if (!e.from) return 'No date on record';
  if (e.to === undefined) return fmt.mon(e.from);
  return `${fmt.mon(e.from)} – ${e.to ? fmt.mon(e.to) : 'now'}`;
}

/** The years the calendar covers, from the first dated event to the facts' year. */
export const YEARS = (() => {
  const ys = EVENTS.filter((e) => e.from).map((e) => (e.from as YearMonth).y);
  return { first: Math.min(...ys), last: db.asOf.y };
})();

/* ------------------------------------------------------------------ notes */

export interface NoteDoc {
  id: string;
  title: string;
  folder: 'Notes' | 'Work';
  paragraphs?: string[];
  checklist?: string[];
  list?: { title: string; detail: string; meta?: string; url?: string }[];
}

export const NOTES: NoteDoc[] = [
  { id: 'about', title: 'About me', folder: 'Notes', paragraphs: [profile.tagline, ...about] },
  {
    id: 'now',
    title: `Now: ${current.title}, ${current.company}`,
    folder: 'Work',
    paragraphs: [db.lede, ...current.role.duties],
  },
  { id: 'skills', title: 'Skills', folder: 'Notes', checklist: skills },
  {
    id: 'roots',
    title: 'Roots: study, robots, papers',
    folder: 'Notes',
    list: roots.map((r) => ({ title: r.title, detail: r.detail, meta: r.year, url: r.url })),
  },
  {
    id: 'numbers',
    title: 'Numbers',
    folder: 'Work',
    list: db.headline.map((h) => ({ title: h.value, detail: h.label })),
  },
];

/* ------------------------------------------------------------------ notifications */

export interface Notice {
  id: string;
  app: string;
  title: string;
  body: string;
  when: string;
  /** The in-app path a tap opens. */
  path?: string;
}

const newestPr = [...oss].sort((a, b) => b.year - a.year)[0];
const logger = hardware.find((d) => d.tag === db.devices.logger.tag) as Device;
const fleet = db.devices.attendumReader.fleet;

/** A store app's notice: Attendum reports its fleet, the others their listing. */
function storeNotice(id: db.ProductId): Notice {
  if (id === 'attendum')
    return {
      id: `store-${id}`,
      app: id,
      title: `${fleet.online.short} devices online`,
      body: `At ${fleet.scope}: ${fleet.classes.short} classes covered and ${fleet.records.short} records in ${fleet.recordYears} years.`,
      when: 'live',
    };
  return {
    id: `store-${id}`,
    app: id,
    title: 'On the App Store and Google Play',
    body: db.products[id].description,
    when: 'live',
  };
}

export const NOTICES: Notice[] = [
  {
    id: 'role',
    app: 'calendar',
    title: `${current.title}, ${current.company}`,
    body: `Since ${fmt.month(current.since)}. ${current.role.summary}`,
    when: fmt.mon(current.since),
    path: `event/${current.role.id}`,
  },
  {
    id: 'contract',
    app: 'calendar',
    title: `${neuroship.steps[0].title} (contract), ${neuroship.org}`,
    body: neuroship.summary,
    when: fmt.mon(neuroship.from),
    path: `event/${neuroship.id}`,
  },
  ...STORE_IDS.map(storeNotice),
  {
    id: 'logger',
    app: 'hardware',
    title: `${logger.name}: ${logger.figures[0]}`,
    body: `${logger.figures.slice(1).join(', ')}. ${logger.detail}`,
    when: 'live',
    path: `device/${logger.tag}`,
  },
  {
    id: 'oss',
    app: 'code',
    title: `${fmt.Spell(oss.length)} fixes upstream`,
    body: `Latest: ${newestPr.repo}. ${newestPr.change}`,
    when: String(newestPr.year),
    path: 'pulls',
  },
  {
    id: 'about',
    app: 'notes',
    title: 'About me',
    body: about[0],
    when: fmt.mon(db.asOf),
    path: 'note/about',
  },
];

/* ------------------------------------------------------------------ files */

export interface FileItem {
  id: string;
  name: string;
  kind: 'pdf' | 'link' | 'doc' | 'device';
  year: string;
  tags: string[];
  tech: string[];
  url?: string;
  detail?: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const ARCHIVE: FileItem[] = archive.map((b) => {
  const url = b.links.external ?? b.links.github ?? b.links.appStore;
  return {
    id: slug(`${b.year}-${b.title}`),
    name: b.title,
    kind: b.year === '—' ? 'device' : url ? 'link' : 'doc',
    year: b.year,
    tags: b.madeAt ? [b.madeAt] : [],
    tech: b.tech,
    url,
  };
});

export const ARCHIVE_YEARS = [...new Set(ARCHIVE.map((f) => f.year))];

export const TAGS = [...new Set(ARCHIVE.flatMap((f) => f.tags))];

export const CV: FileItem = {
  id: 'cv',
  name: db.person.cv.split('/').pop() as string,
  kind: 'pdf',
  year: String(db.asOf.y),
  tags: [],
  tech: [],
  url: db.person.cv,
  detail: `${profile.name}, ${profile.headline}`,
};

export const PAPER: FileItem = {
  id: 'paper',
  name: paper.title,
  kind: 'pdf',
  year: String(paper.date.y),
  tags: [paper.venue],
  tech: [],
  url: paper.url,
  detail: `${paper.venue} ${paper.id}`,
};

/* ------------------------------------------------------------------ projects */

export const FEATURED = featuredProjects;
export const OTHER = otherProjects;
export const productId = (title: string) =>
  (Object.keys(db.products) as db.ProductId[]).find((id) => db.products[id].title === title);

/* ------------------------------------------------------------------ search */

export interface Hit {
  id: string;
  app: string;
  title: string;
  sub: string;
  path?: string;
  url?: string;
  words: string;
}

export const INDEX: Hit[] = [
  ...Object.values(APPS).map((a) => ({
    id: `app-${a.id}`,
    app: a.id,
    title: a.name,
    sub: 'App',
    words: a.name,
  })),
  {
    id: 'me',
    app: 'contacts',
    title: profile.name,
    sub: `${current.title}, ${current.company}`,
    words: `${profile.name} ${profile.fullName} ${profile.email} contact email linkedin github cv`,
  },
  ...NOTES.map((n) => ({
    id: `note-${n.id}`,
    app: 'notes',
    title: n.title,
    sub: 'Note',
    path: `note/${n.id}`,
    words: [
      n.title,
      ...(n.paragraphs ?? []),
      ...(n.checklist ?? []),
      ...(n.list ?? []).map((l) => `${l.title} ${l.detail}`),
    ].join(' '),
  })),
  ...EVENTS.map((e) => ({
    id: `event-${e.id}`,
    app: 'calendar',
    title: e.where && e.cal === 'work' ? `${e.where}: ${e.title}` : e.title,
    sub: when(e),
    path: `event/${e.id}`,
    words: [e.title, e.where ?? '', ...e.notes].join(' '),
  })),
  ...oss.map((c, i) => ({
    id: `pr-${i}`,
    app: 'code',
    title: `${c.repo}`,
    sub: c.change,
    url: c.url,
    path: `pr/${(Object.keys(db.contributions) as string[])[i]}`,
    words: `${c.repo} ${c.kind} ${c.change} ${c.impact}`,
  })),
  ...hardware.map((d) => ({
    id: `dev-${d.tag}`,
    app: 'hardware',
    title: d.name,
    sub: `${d.kind} · ${d.figures[0]}`,
    path: `device/${d.tag}`,
    words: `${d.name} ${d.kind} ${d.detail} ${d.tag}`,
  })),
  ...[...FEATURED, ...OTHER].map((p) => ({
    id: `proj-${slug(p.title)}`,
    app: 'projects',
    title: p.title,
    sub: p.tech.join(' · '),
    path: `project/${slug(p.title)}`,
    words: `${p.title} ${p.description} ${p.tech.join(' ')}`,
  })),
  ...ARCHIVE.map((f) => ({
    id: `file-${f.id}`,
    app: 'files',
    title: f.name,
    sub: `${f.year} · ${f.tags.join(', ')}`,
    path: `file/${f.id}`,
    words: `${f.name} ${f.tags.join(' ')} ${f.tech.join(' ')} ${f.year}`,
  })),
  {
    id: 'file-cv',
    app: 'files',
    title: CV.name,
    sub: 'CV · PDF',
    path: 'file/cv',
    words: `cv resume ${CV.name}`,
  },
];

export const projectSlug = slug;

/** Ranked hits: every word must match the start of a word; titles and prefixes rank higher. */
export function search(query: string, limit = 24) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: { hit: Hit; score: number }[] = [];
  for (const hit of INDEX) {
    const title = hit.title.toLowerCase();
    const words = `${title} ${hit.sub.toLowerCase()} ${hit.words.toLowerCase()}`;
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const inTitle = title.startsWith(t)
        ? 6
        : new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title)
          ? 4
          : 0;
      const inWords = inTitle
        ? 0
        : new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(words)
          ? 1
          : 0;
      if (!inTitle && !inWords) {
        ok = false;
        break;
      }
      score += inTitle + inWords;
    }
    if (ok) scored.push({ hit, score: score + (hit.id.startsWith('app-') ? 3 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.hit);
}

/* ------------------------------------------------------------------ wallpapers */

/** Generated wallpapers: a hue each. The system accent is derived from the one in use. */
export const WALLPAPERS = [
  { name: 'Dusk', hue: 252 },
  { name: 'Lagoon', hue: 196 },
  { name: 'Ember', hue: 18 },
  { name: 'Moss', hue: 150 },
  { name: 'Orchid', hue: 310 },
];
