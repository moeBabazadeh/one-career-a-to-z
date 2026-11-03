// What the career API on the site's own host returns, and what the devices report about
// themselves. Every value is read from the facts (db), shaped as JSON a real service would send.

import { db, featuredProjects, fmt, hardware, oss, otherProjects } from '../_shared/data';
import type { DeviceId } from '@/content/db';

const { person, current, education, awards, robots, papers, devices } = db;

const links = (l: db.ProjectLinks) => Object.fromEntries(Object.entries(l).filter(([, v]) => v));
const project = (p: {
  title: string;
  description: string;
  tech: string[];
  links: db.ProjectLinks;
}) => ({ title: p.title, description: p.description, tech: p.tech, links: links(p.links) });

/** The site's host, and the hosts of the products' own sites. */
export const SITE = person.site;
export const hostOf = (url: string) => new URL(url).host.replace(/^www\./, '');

export const API = {
  profile: {
    path: '/api/profile',
    body: () => ({
      name: person.name,
      full_name: person.fullName,
      headline: person.headline,
      title: current.title,
      company: current.company,
      company_url: current.companyUrl,
      title_since: fmt.iso(current.since),
      pitch: current.pitch,
      tagline: person.tagline,
      lede: db.lede,
      building_since: person.since,
      about: db.about,
      skills: db.skills,
      numbers: db.headline.map((h) => ({ value: h.value, label: h.label })),
    }),
  },
  roles: {
    path: '/api/roles',
    body: () => ({
      roles: db.roleList.map((r) => ({
        org: r.org,
        ...(r.url ? { url: r.url } : {}),
        ...(r.sector ? { sector: r.sector } : {}),
        title: db.titleOf(r),
        steps: r.steps.map((s) => ({ title: s.title, from: fmt.iso(s.from) })),
        from: fmt.iso(r.from),
        to: r.to ? fmt.iso(r.to) : null,
        ...(r.contract ? { contract: true } : {}),
        summary: r.summary,
        duties: r.duties,
      })),
    }),
  },
  education: {
    path: '/api/education',
    body: () => ({
      degrees: [education.bsc, education.msc].map((d) => ({
        degree: db.degreeTitle(d),
        school: d.school,
        from: d.from.y,
        to: d.to.y,
        thesis: d.thesis,
      })),
      robotics: [
        {
          title: robots.ssl.title,
          from: robots.ssl.from.y,
          to: robots.ssl.to.y,
          detail: robots.ssl.detail,
        },
        {
          title: `${awards.robocup.event} ${awards.robocup.challenge}`,
          place: awards.robocup.place,
          date: fmt.iso(awards.robocup.date),
        },
        {
          title: `${awards.skills.event}, ${awards.skills.challenge}`,
          place: awards.skills.place,
          year: awards.skills.year,
        },
        { title: robots.quadcopter.title, detail: robots.quadcopter.detail, date: null },
      ],
      papers: Object.values(papers).map((p) => ({
        title: p.title,
        venue: p.venue,
        id: p.id,
        url: p.url,
        date: fmt.iso(p.date),
      })),
    }),
  },
  projects: {
    path: '/api/projects',
    body: () => ({ featured: featuredProjects.map(project), other: otherProjects.map(project) }),
  },
  builds: {
    path: '/api/builds',
    body: () => ({
      builds: db.builds.map((b) => ({
        year: b.year === '—' ? null : b.year,
        title: b.title,
        ...(b.madeAt ? { made_at: b.madeAt } : {}),
        tech: b.tech,
        ...(Object.keys(links(b.links)).length ? { links: links(b.links) } : {}),
      })),
    }),
  },
  devices: {
    path: '/api/devices',
    body: () => ({
      in_production: Object.keys(devices).length,
      devices: (Object.keys(devices) as DeviceId[]).map((id, i) => {
        const d = devices[id];
        return {
          tag: d.tag,
          name: d.name,
          kind: d.kind,
          ...('chip' in d ? { chip: d.chip } : {}),
          detail: d.detail,
          figures: hardware[i].figures,
          ...(id === 'logger'
            ? {
                stations_min: devices.logger.stations.n,
                online_years_min: devices.logger.online.n,
                records_min: devices.logger.records.n,
              }
            : id === 'attendumReader'
              ? {
                  battery_months: devices.attendumReader.batteryMonths,
                  fleet: {
                    scope: devices.attendumReader.fleet.scope,
                    online_min: devices.attendumReader.fleet.online.n,
                    records_min: devices.attendumReader.fleet.records.n,
                    record_years: devices.attendumReader.fleet.recordYears,
                    classrooms_min: devices.attendumReader.fleet.classrooms.n,
                    classes_min: devices.attendumReader.fleet.classes.n,
                  },
                }
              : {}),
        };
      }),
    }),
  },
  oss: {
    path: '/api/oss',
    body: () => ({
      weekly_downloads_combined: db.downloads.weekly.short,
      contributions: oss.map((c) => ({
        repo: c.repo,
        url: c.url,
        year: c.year,
        kind: c.kind,
        stars: c.stars,
        weekly_downloads: c.weekly,
        change: c.change,
        impact: c.impact,
      })),
    }),
  },
  contact: {
    path: '/api/contact',
    body: () => ({
      name: person.name,
      email: person.email,
      linkedin: person.linkedin,
      github: person.github,
      cv: `${person.url}${person.cv}`,
      site: person.url,
    }),
  },
};

/* ------------------------------------------------------------------ devices */

const { logger, attendumReader: reader, attendumBeacon: beacon, plc, epc } = devices;

export const DEVICES = { logger, reader, beacon, plc, epc };

/** The fleet status the broker keeps retained for the logger stations. */
export const loggerFleet = () => ({
  tag: logger.tag,
  name: logger.name,
  kind: logger.kind,
  detail: logger.detail,
  stations_min: logger.stations.n,
  online_years_min: logger.online.n,
  records_min: logger.records.n,
});

/** What a Modbus Read Device Identification returns for a device. */
export const identity = (d: typeof plc | typeof epc): [number, string][] => [
  [0, person.name],
  [1, d.tag],
  [2, db.deviceFigures(d === plc ? 'plc' : 'epc')[0]],
  [3, person.url],
  [4, d.name],
  [5, d.kind],
  [6, d.detail],
];

/** Every product site the career links to, the featured ones first. */
export const PRODUCT_HOSTS = [
  ...new Set(
    [...featuredProjects, ...otherProjects]
      .map((p) => p.links.external)
      .filter((u): u is string => !!u)
      .map(hostOf),
  ),
];
export const FEATURED_HOSTS = featuredProjects
  .map((p) => p.links.external)
  .filter((u): u is string => !!u)
  .map(hostOf);
export const ATTENDUM_HOST = hostOf(db.products.attendum.links.external);
