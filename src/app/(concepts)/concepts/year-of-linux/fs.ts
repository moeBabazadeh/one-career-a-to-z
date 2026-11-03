// The machine's file system, generated from the facts: roles are folders and their duties
// are documents, devices sit in /dev, upstream fixes are .patch files and the products are
// launchers. The terminal and the File Browser are two views of this one tree.

import {
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  otherProjects,
  profile,
  roles,
  skills,
  stats,
  type Contribution,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import type { IconName } from './icons';
import type { AppId } from './wm';

const { person, asOf, education, awards, robots, papers, contributions } = db;

export const USER = person.first.toLowerCase();
export const HOST = `${USER}-arch`;
/** The kernel's version is the years building and the facts' month: "19.10-ARCH". */
export const KERNEL = `${db.yearsBuilding}.${asOf.m}-ARCH`;
/** Every role newest first, as the db stores them. */
const ROLE_LIST = db.roleList;

export interface FsNode {
  name: string;
  kind: 'dir' | 'text' | 'link' | 'pdf' | 'device' | 'app';
  icon: IconName;
  children?: FsNode[];
  /** What `cat` prints and the File Browser shows. */
  text?: string[];
  href?: string;
  app?: AppId;
  /** A one-line description for the File Browser's status bar and list view. */
  note?: string;
  /** For list view: the date range the item covers. */
  dates?: string;
  /** For list view: a span on the career timeline, in fractional years. */
  span?: [number, number | null];
  /** A small emblem on the icon. */
  emblem?: 'star' | 'link';
}

const dir = (name: string, children: FsNode[], extra: Partial<FsNode> = {}): FsNode => ({
  name,
  kind: 'dir',
  icon: 'folder',
  children,
  ...extra,
});
const doc = (name: string, text: string[], extra: Partial<FsNode> = {}): FsNode => ({
  name,
  kind: 'text',
  icon: 'document',
  text,
  ...extra,
});

/** "led-the-architecture": a file name from a sentence's first words. */
const slug = (text: string, words = 3) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, words)
    .join('-');

/** Wraps a paragraph to a terminal-friendly width. */
export function wrapText(text: string, width = 72): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/* ---------------------------------------------------------------- README */

const address = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export const README: string[] = [
  `${profile.name} (${profile.fullName})`,
  `${profile.role}, ${profile.company} · building since ${person.since}`,
  '='.repeat(56),
  '',
  profile.tagline,
  '',
  profile.lede,
  '',
  ...about.flatMap((p) => [p, '']),
  'TOOLS',
  ...skills.map((s) => `  * ${s}`),
  '',
  'NUMBERS',
  ...stats.map((s) => `  ${s.value.padEnd(7)} ${s.label}`),
  '',
  'CONTACT',
  `  mail      ${profile.email}`,
  `  linkedin  ${address(profile.linkedin)}`,
  `  github    ${address(profile.github)}`,
  `  cv        ~/Documents/resume.pdf`,
];

/* ---------------------------------------------------------------- work */

export const roleFolder = (r: db.Role) =>
  (r.short ?? r.org).replace(/&/g, 'and').replace(/[^A-Za-z0-9.]+/g, '-');

const work = dir(
  'Work',
  ROLE_LIST.map((r) => {
    const view = roles.find((v) => v.id === r.id)!;
    const range = fmt.monthSpan(r.from, r.to);
    const card = doc(
      'role.txt',
      [
        `${r.org}${r.contract ? ' (contract)' : ''}`,
        db.titlePath(r),
        range,
        '',
        r.summary,
        ...(r.url ? ['', r.url] : []),
      ],
      { note: db.titlePath(r), dates: range },
    );
    const duties = r.duties.map((d, i) =>
      doc(`${String(i + 1).padStart(2, '0')}-${slug(d)}.txt`, [d], { note: d }),
    );
    return dir(roleFolder(r), [card, ...duties], {
      note: `${db.titlePath(r)} · ${r.summary}`,
      dates: range,
      span: [view.start, view.end],
      emblem: r.to ? undefined : 'star',
      ...(r.url ? { href: r.url } : {}),
    });
  }),
  { note: `${ROLE_LIST.length} roles, newest first` },
);

/* ---------------------------------------------------------------- education and awards */

const { bsc, msc } = education;
const { robocup, skills: skillsAward } = awards;
const paper = papers.inverter;

const educationDir = dir(
  'Education',
  [
    doc(
      `${bsc.degree.toLowerCase()}.txt`,
      [
        db.degreeTitle(bsc),
        `${bsc.school}, ${fmt.yearSpan(bsc.from, bsc.to)}`,
        '',
        `Thesis: ${bsc.thesis}.`,
      ],
      { icon: 'diploma', note: db.degreeTitle(bsc), dates: fmt.yearSpan(bsc.from, bsc.to) },
    ),
    doc(
      `${msc.degree.toLowerCase()}.txt`,
      [
        db.degreeTitle(msc),
        `${msc.school}, ${fmt.yearSpan(msc.from, msc.to)}`,
        '',
        `Thesis: ${msc.thesis}.`,
      ],
      { icon: 'diploma', note: db.degreeTitle(msc), dates: fmt.yearSpan(msc.from, msc.to) },
    ),
    doc(
      'soccer-robots.txt',
      [robots.ssl.title, fmt.yearSpan(robots.ssl.from, robots.ssl.to), '', robots.ssl.detail],
      {
        icon: 'robot',
        note: robots.ssl.title,
        dates: fmt.yearSpan(robots.ssl.from, robots.ssl.to),
      },
    ),
    {
      name: `${paper.venue}-${paper.id}.url`,
      kind: 'link',
      icon: 'link',
      href: paper.url,
      text: [
        `Paper on ${paper.venue}, ${fmt.month(paper.date)}`,
        '',
        `${paper.title}.`,
        '',
        paper.url,
      ],
      note: paper.title,
      dates: fmt.month(paper.date),
      emblem: 'link',
    },
  ],
  { note: 'Degrees, robots and a paper' },
);

export const AWARDS = [
  {
    place: robocup.place,
    event: robocup.event,
    challenge: robocup.challenge,
    year: robocup.year,
    when: fmt.month(robocup.date),
  },
  {
    place: skillsAward.place,
    event: skillsAward.event,
    challenge: skillsAward.challenge,
    year: skillsAward.year,
    when: String(skillsAward.year),
  },
];

const awardsDir = dir(
  'Awards',
  AWARDS.map((a, i) =>
    doc(`${slug(a.event, 2)}.txt`, [`${a.event}, ${a.when}`, `${a.place}: ${a.challenge}`], {
      icon: i ? 'medal' : 'trophy',
      note: `${a.place}, ${a.challenge}`,
      dates: a.when,
    }),
  ),
  { note: 'Robot competitions' },
);

/* ---------------------------------------------------------------- projects */

export const PRODUCTS = [
  ...featuredProjects,
  ...otherProjects.filter((p) => !p.links.github?.includes('/pull/')),
];

const projects = dir(
  'Projects',
  PRODUCTS.map((p) => {
    const link = projectLinks(p.links)[0];
    return {
      name: `${slug(p.title, 4)}.desktop`,
      kind: 'link' as const,
      icon: (p.links.appStore
        ? 'phone'
        : link?.kind === 'code'
          ? 'code'
          : link
            ? 'browser'
            : p.tech.includes('Hardware') || p.tech.includes('Firmware')
              ? 'chip'
              : 'document') as IconName,
      href: link?.url,
      text: [
        '[Desktop Entry]',
        `Name=${p.title}`,
        `Comment=${p.description}`,
        `Keywords=${p.tech.join(';')}`,
        ...(link ? [`URL=${link.url}`] : ['NoDisplay=true']),
        'Type=Link',
      ],
      note: p.description,
    };
  }),
  { note: `${PRODUCTS.length} things built and shipped` },
);

/* ---------------------------------------------------------------- upstream fixes */

/** Upstream fixes as packages: the repo's last part is the name, the pull request the version. */
export interface Pkg extends Contribution {
  name: string;
  version: string;
  pr: number;
}

export const PKGS: Pkg[] = oss.map((c) => {
  const pr = Number(c.url.split('/').pop());
  return { ...c, name: c.repo.split('/')[1].toLowerCase(), version: `${pr}-1`, pr };
});

const patches = dir(
  'Patches',
  PKGS.map((p) =>
    doc(
      `${p.name}-${p.pr}.patch`,
      [
        `From: ${profile.name} <${profile.email}>`,
        `Subject: [PATCH] ${p.change}`,
        `Repository: ${p.repo} (★ ${p.stars}, ${p.weekly} downloads a week)`,
        '',
        p.impact,
        '',
        p.url,
      ],
      {
        icon: 'code',
        href: p.url,
        note: `${p.kind}: ${p.change}`,
        dates: String(p.year),
      },
    ),
  ),
  { note: `${PKGS.length} fixes merged upstream` },
);

/* ---------------------------------------------------------------- trash */

const gatsby = contributions.gatsby;
export const TRASHED = {
  name: gatsby.removed,
  from: gatsby.from.join(', '),
  why: oss.find((c) => c.repo === gatsby.repo)!.impact,
  url: db.prUrl(gatsby),
};

const trash = dir(
  'Trash',
  [
    doc(
      TRASHED.name,
      [`${TRASHED.name}`, `Original location: ${TRASHED.from}`, '', TRASHED.why, '', TRASHED.url],
      { icon: 'package', href: TRASHED.url, note: `Deleted from ${TRASHED.from}` },
    ),
  ],
  { icon: 'trashFull', note: 'Deleted upstream' },
);

/* ---------------------------------------------------------------- the tree */

const devTag = (tag: string) => tag.toLowerCase();
const DEVICE_ICON: Record<string, IconName> = {
  [db.devices.logger.tag]: 'antenna',
  [db.devices.epc.tag]: 'gauge',
  [db.devices.plc.tag]: 'chip',
  [db.devices.attendumReader.tag]: 'card',
  [db.devices.attendumBeacon.tag]: 'beacon',
};
export const deviceIcon = (tag: string): IconName => DEVICE_ICON[tag] ?? 'chip';

export const HOME: string[] = ['home', USER];

export const ROOT: FsNode = dir('/', [
  dir(
    'dev',
    hardware.map((d) => ({
      name: devTag(d.tag),
      kind: 'device',
      icon: deviceIcon(d.tag),
      app: 'monitor',
      text: [`${d.tag}  ${d.name}: ${d.kind}`, d.detail, d.figures.join(' · ')],
      note: `${d.name}: ${d.kind}`,
    })),
  ),
  dir('etc', [
    doc('hostname', [HOST]),
    doc('os-release', [
      'NAME="Arch Linux"',
      `PRETTY_NAME="Arch Linux (${HOST})"`,
      `BUILD_ID=rolling-since-${person.since}`,
      `HOME_URL="${person.url}"`,
    ]),
    doc('pacman.conf', [
      '[options]',
      'Color',
      'ILoveCandy',
      '',
      '[upstream]',
      `# ${PKGS.length} fixes, merged`,
      `Server = ${person.github}`,
    ]),
    doc('motd', [`Welcome to ${HOST}. ${profile.tagline}`]),
  ]),
  dir('home', [
    dir(USER, [
      dir('Desktop', [], { icon: 'desktop' }),
      {
        ...dir('Documents', [
          {
            name: 'resume.pdf',
            kind: 'pdf',
            icon: 'pdf',
            href: profile.cv,
            note: `${profile.name}: CV`,
          },
        ]),
        note: 'The CV',
      },
      work,
      educationDir,
      awardsDir,
      projects,
      patches,
      doc('README.txt', README, { app: 'editor', icon: 'editor', note: 'About me' }),
      dir('.local', [dir('share', [trash])]),
    ]),
  ]),
]);

/** Finds the node at an absolute path (a list of names). */
export function nodeAt(path: string[]): FsNode | null {
  let node: FsNode | undefined = ROOT;
  for (const name of path) node = node?.children?.find((c) => c.name === name);
  return node ?? null;
}

export const TRASH_PATH = [...HOME, '.local', 'share', 'Trash'];

/** "~/Work/Neuroject" for display. */
export function pretty(path: string[]) {
  const home = HOME.join('/');
  const p = path.join('/');
  if (p === home) return '~';
  if (p.startsWith(home + '/')) return `~/${p.slice(home.length + 1)}`;
  return `/${p}`;
}

/** Resolves a shell path (absolute, ~, relative, with . and ..) against cwd. */
export function resolvePath(cwd: string[], raw: string): { node: FsNode; path: string[] } | null {
  const input = raw.trim() || '.';
  let at = input.startsWith('/')
    ? []
    : input === '~' || input.startsWith('~/')
      ? [...HOME]
      : [...cwd];
  const rest = input.replace(/^~\/?/, '').split('/');
  for (const part of rest) {
    if (!part || part === '.') continue;
    if (part === '..') {
      at = at.slice(0, -1);
      continue;
    }
    const here = nodeAt(at);
    const hit =
      here?.children?.find((c) => c.name === part) ??
      here?.children?.find((c) => c.name.toLowerCase() === part.toLowerCase());
    if (!hit) return null;
    at = [...at, hit.name];
  }
  const node = nodeAt(at);
  return node ? { node, path: at } : null;
}
