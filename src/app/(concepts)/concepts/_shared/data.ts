// The concepts' view of the facts. Everything here is read from src/content/db.ts, the single
// source: these are the shapes concepts already use, and `db` and `fmt` are re-exported for
// anything else. A concept never types a fact out; it reads it from here.
import * as db from '@/content/db';
import {
  awards,
  contributions,
  current,
  degreeTitle,
  deviceFigures,
  devices,
  education,
  papers,
  person,
  prUrl,
  robots,
  roles as roleTable,
  stores,
  titlePath,
  type DeviceId,
  type RoleId,
} from '@/content/db';
import { frac, yearSpan } from '@/content/format';
import { jobs } from '@/content/jobs';
import { archive, featuredProjects, otherProjects } from '@/content/projects';

export { db };
export * as fmt from '@/content/format';
export { jobs, featuredProjects, otherProjects, archive };

export const profile = {
  name: person.name,
  fullName: person.fullName,
  role: current.title,
  company: current.company,
  companyUrl: current.companyUrl,
  tagline: person.tagline,
  headline: person.headline,
  lede: db.lede,
  email: person.email,
  linkedin: person.linkedin,
  github: person.github,
  cv: person.cv,
};

export const about = db.about;

export const skills = db.skills;

export const stats = db.headline;

/** The facts' month as a fractional year. */
export const NOW = db.now;

export interface Role {
  id: string;
  org: string;
  title: string;
  start: number;
  end: number | null;
  range: string;
  summary: string;
  url?: string;
}

const ROLE_ORDER: RoleId[] = ['freelance', 'niknam', 'alget', 'zeroone', 'neuroject', 'neuroship'];

// Roles on a timeline, oldest first, in fractional years.
export const roles: Role[] = ROLE_ORDER.map((id) => {
  const r: db.Role = roleTable[id];
  return {
    id,
    org: r.org,
    title: `${titlePath(r)}${r.contract ? ' (contract)' : ''}`,
    start: frac(r.from),
    end: r.to ? frac(r.to) : null,
    range: yearSpan(r.from, r.to, ' – '),
    summary: r.summary,
    ...(r.url ? { url: r.url } : {}),
  };
});

const { bsc, msc } = education;
const { robocup } = awards;
const paper = papers.inverter;

export const roots: { year: string; title: string; detail: string; url?: string }[] = [
  {
    year: yearSpan(bsc.from, bsc.to),
    title: degreeTitle(bsc),
    detail: `${bsc.school}. Thesis: ${bsc.thesis}.`,
  },
  {
    year: yearSpan(robots.ssl.from, robots.ssl.to),
    title: robots.ssl.title,
    detail: robots.ssl.detail,
  },
  {
    year: String(robocup.year),
    title: `${robocup.event}, ${robocup.place}`,
    detail: `${robocup.challenge}.`,
  },
  {
    year: String(awards.skills.year),
    title: `${awards.skills.event}, ${awards.skills.place}`,
    detail: `${awards.skills.challenge}.`,
  },
  {
    year: yearSpan(msc.from, msc.to),
    title: degreeTitle(msc),
    detail: `${msc.school}. Thesis: ${msc.thesis}.`,
  },
  {
    year: String(paper.date.y),
    title: `Paper on ${paper.venue}`,
    detail: `${paper.title}.`,
    url: paper.url,
  },
];

export interface Device {
  tag: string;
  name: string;
  kind: string;
  detail: string;
  figures: string[];
}

export const hardware: Device[] = (Object.keys(devices) as DeviceId[]).map((id) => {
  const { tag, name, kind, detail } = devices[id];
  return { tag, name, kind, detail, figures: deviceFigures(id) };
});

export interface Contribution {
  repo: string;
  url: string;
  year: number;
  stars: string;
  weekly: string;
  kind: 'Security' | 'Data loss' | 'Type safety' | 'Bug';
  change: string;
  impact: string;
}

export const oss: Contribution[] = Object.values(contributions).map((c: db.Contribution) => ({
  repo: c.repo,
  url: prUrl(c),
  year: c.year,
  stars: c.stars,
  weekly: c.weekly.short,
  kind: c.kind,
  change: c.change,
  impact: c.impact,
}));

/** Live sites and store listings worth linking from every concept. */
export const liveLinks = [
  { label: `${db.products.attendum.title} on the App Store`, url: stores.attendum.appStore },
  { label: `${db.products.attendum.title} on Google Play`, url: stores.attendum.playStore },
  {
    label: `${db.products.educationGuide.title} on the App Store`,
    url: stores.educationGuide.appStore,
  },
  {
    label: `${db.products.educationGuide.title} on Google Play`,
    url: stores.educationGuide.playStore,
  },
];
