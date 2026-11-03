// The service: every page, composed from the facts. Magazine 1 is the front of the service, 2
// the roles, 3 projects, 4 hardware, 5 open source, 6 roots and 7 contact; 199 is the A–Z.
// Nothing here types a fact: the words around them are the editor's, the facts come from db.
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
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import {
  balancer,
  beacon,
  chip,
  envelope,
  gauge,
  plcModule,
  reader,
  robot,
  station,
  Pix,
} from './art';
import {
  BLUE,
  CYAN,
  GREEN,
  MAGENTA,
  RED,
  Sheet,
  WHITE,
  YELLOW,
  alpha,
  dbl,
  gfx,
  headline,
  host,
  line,
  masthead,
  mosaicRows,
  optional,
  pad,
  paginate,
  para,
  wrap,
  wrapUrl,
  type Line,
  type Link,
  type Look,
  type Page,
  type Part,
} from './build';
import { C } from './decode';
import { sextant } from './glyphs';

const { person, current, awards, robots, devices, education, papers, contributions } = db;

/** The service's name in the header row: the first name and the old "facts" pun. Not a broadcaster. */
export const SERVICE = `${person.first.toUpperCase()}FAX`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LOOK: Record<number, Look> = {
  1: { band: BLUE, ink: YELLOW },
  2: { band: RED, ink: WHITE },
  3: { band: MAGENTA, ink: WHITE },
  4: { band: CYAN, ink: BLUE },
  5: { band: GREEN, ink: BLUE },
  6: { band: YELLOW, ink: RED },
  7: { band: WHITE, ink: BLUE },
};

type Fast = [number, string?];

interface Draft {
  num: number;
  short: string;
  title: string;
  sheets: Sheet[];
  fast: Fast[];
  links: Link[];
}

const drafts: Draft[] = [];

/** A page from blocks of story lines, under its section's masthead, split into subpages as needed. */
function story(
  num: number,
  short: string,
  title: string,
  section: string,
  blocks: Line[][],
  fast: Fast[],
  links: Link[] = [],
  kicker = title,
  spacing = 1,
) {
  const look = LOOK[Math.floor(num / 100)];
  const chunks = paginate(blocks, 5, spacing);
  const sheets = chunks.map((chunk, i) => {
    const s = new Sheet();
    masthead(section, look, chunks.length > 1 ? `${i + 1}/${chunks.length}` : undefined).forEach(
      (row, r) => s.raw(1 + r, row),
    );
    if (i > 0) s.put(4, [alpha(YELLOW), kicker.slice(0, 38)]);
    s.y = 5;
    s.lines(chunk);
    return s;
  });
  drafts.push({ num, short, title, sheets, fast, links });
}

/** A hand-laid page: one sheet per subpage, drawn by `draw`. */
function sheet(
  num: number,
  short: string,
  title: string,
  section: string | null,
  draw: (s: Sheet) => void,
  fast: Fast[],
  links: Link[] = [],
) {
  const s = new Sheet();
  if (section)
    masthead(section, LOOK[Math.floor(num / 100)]).forEach((row, r) => s.raw(1 + r, row));
  s.y = section ? 5 : 1;
  draw(s);
  drafts.push({ num, short, title, sheets: [s], fast, links });
}

/** Art as story lines in one graphics colour, centred on the row. */
const picture = (art: string[], colour: number): Line[] => {
  const rows = mosaicRows(art);
  const indent = Math.max(0, Math.floor((39 - rows[0].length) / 2));
  return rows.map((cells) => line(gfx(colour), ' '.repeat(indent), cells));
};

/** As many items of a list as fit in `w` characters, whole. */
const fitList = (items: string[], w: number) =>
  items.reduce(
    (out, item) => (!out ? item : out.length + 2 + item.length <= w ? `${out}, ${item}` : out),
    '',
  );

/** A link line: a green label and the address in white, which is the hotspot. */
const linkLine = (label: string, href: string, shown = host(href)): Line[] =>
  wrapUrl(shown, 29).map((t, i) =>
    line(alpha(GREEN), pad(i ? '' : label, 8), alpha(WHITE), { t, href }),
  );

/** "See 401" as a line with the number as a hotspot. */
const see = (label: string, num: number, colour = CYAN): Line =>
  line(alpha(colour), `${label} `, alpha(YELLOW), { t: String(num), go: num });

const SECTION: Fast[] = [
  [200, 'Roles'],
  [300, 'Projects'],
  [400, 'Hardware'],
  [500, 'Open source'],
  [600, 'Roots'],
  [700, 'Contact'],
];
/** The next section's front page, for the green and yellow keys. */
const nextSection = (num: number): Fast => SECTION.find(([n]) => n > num) ?? [100, 'Index'];
const INDEX: Fast = [100, 'Index'];

/* ------------------------------------------------------------------ 1xx: the front */

const nowRole = current.role;
const sinceMonths = fmt.monthsBetween(current.since, db.asOf);
const roleNums = new Map(db.roleList.map((r, i) => [r.id, 201 + i]));
const productNums = new Map(db.featuredIds.map((id, i) => [id as string, 301 + i]));
const deviceIds = Object.keys(devices) as (keyof typeof devices)[];
const ossIds = Object.keys(contributions);
const ossNums = new Map(ossIds.map((id, i) => [id, 501 + i]));
const robocupName = awards.robocup.event.split(' ')[0];

sheet(
  100,
  'Index',
  'Index',
  null,
  (s) => {
    masthead(SERVICE, LOOK[1]).forEach((row, r) => s.raw(1 + r, row));
    s.y = 4;
    s.add(dbl(alpha(WHITE), profile.name));
    // A new title flashes, for the first half-year.
    s.add(
      line(
        alpha(CYAN),
        `${profile.role}, ${profile.company}`,
        ...(sinceMonths <= 6 ? [alpha(YELLOW), C.Flash, 'NEW', C.Steady] : []),
      ),
    );
    s.lines(para(person.tagline, WHITE));
    s.skip();
    const entries: [string, number][] = [
      ['Now', 101],
      ['About', 102],
      ['In figures', 103],
      ['Skills', 104],
      ['Quiz', 105],
      ['Roles', 200],
      ['Projects', 300],
      ['Hardware', 400],
      ['Open source', 500],
      ['Roots', 600],
      ['Contact', 700],
      ['A-Z index', 199],
    ];
    const half = entries.length / 2;
    for (let i = 0; i < half; i++) {
      const [a, an] = entries[i],
        [b, bn] = entries[i + half];
      s.add(
        line(
          alpha(WHITE),
          { t: pad(a, 14), go: an },
          alpha(CYAN),
          { t: String(an), go: an },
          ' ',
          alpha(WHITE),
          { t: pad(b, 14), go: bn },
          alpha(CYAN),
          { t: String(bn), go: bn },
        ),
      );
    }
    s.skip();
    s.add(line(gfx(BLUE), C.NewBg, alpha(YELLOW), 'HEADLINES'));
    const n = Object.keys(devices).length;
    const news: [string, number][] = [
      [`${current.title} of ${current.company} since ${fmt.mon(current.since)}`, 101],
      [`${db.productsLive.short} products live`, 300],
      [`${n} devices in production`, 400],
      [`${db.downloads.weekly.short} weekly downloads, patched`, 500],
      [`${awards.robocup.place}, ${awards.robocup.event} ${awards.robocup.year}`, 603],
    ];
    news.forEach(([t, go]) =>
      s.add(line(alpha(WHITE), { t: pad(t, 34), go }, ' ', alpha(CYAN), { t: String(go), go })),
    );
  },
  [
    [101, 'Now'],
    [200, 'Roles'],
    [300, 'Projects'],
    [700, 'Contact'],
  ],
);

story(
  101,
  'Now',
  `${current.title}, ${current.company}`,
  'NOW',
  [
    [
      ...headline(`${current.title}, ${current.company}`),
      ...para(
        `Since ${fmt.month(current.since)}. ${current.previous.title} from ${fmt.month(current.previous.from)}.`,
        CYAN,
      ),
    ],
    para(`${cap(nowRole.sector ?? '')}: ${current.pitch}.`, GREEN),
    para(nowRole.duties[0], WHITE),
    [see('The full role is on page', 201), see(`${db.products.neurobuild.title} is on page`, 301)],
    ...(nowRole.url ? [linkLine('Web', nowRole.url)] : []),
  ],
  [[102, 'About'], [201, current.company], [300, 'Projects'], INDEX],
  nowRole.url ? [{ label: host(nowRole.url), href: nowRole.url }] : [],
);

story(
  102,
  'About',
  'About',
  'ABOUT',
  [
    [...headline(profile.name, WHITE), ...para(person.headline, CYAN)],
    para(db.lede, YELLOW),
    ...about.map((p, i) => para(p, i % 2 ? CYAN : WHITE)),
  ],
  [[103, 'Figures'], [200, 'Roles'], [300, 'Projects'], INDEX],
  [],
  profile.name,
);

sheet(
  103,
  'Figures',
  'In figures',
  'FIGURES',
  (s) => {
    for (let i = 0; i < db.headline.length; i += 2) {
      const [a, b] = [db.headline[i], db.headline[i + 1]];
      s.add(dbl(alpha(YELLOW), pad(a.value, 18), alpha(YELLOW), b ? b.value : ''));
      const la = wrap(cap(a.label), 17),
        lb = b ? wrap(cap(b.label), 18) : [];
      for (let k = 0; k < Math.max(la.length, lb.length); k++)
        s.add(line(alpha(CYAN), ' ', pad(la[k] ?? '', 17), ' ', alpha(CYAN), lb[k] ?? ''));
      s.skip();
    }
  },
  [[104, 'Skills'], [105, 'Quiz'], [500, 'Open source'], INDEX],
);

story(
  104,
  'Skills',
  'Skills',
  'SKILLS',
  [
    [...headline(person.headline, YELLOW)],
    db.skills.map((sk) => line(gfx(GREEN), sextant(0b001100), alpha(WHITE), sk)),
    para(person.tagline, CYAN),
  ],
  [[105, 'Quiz'], [200, 'Roles'], [300, 'Projects'], INDEX],
);

{
  const reader_ = devices.attendumReader,
    beacon_ = devices.attendumBeacon,
    msc = education.msc;
  const quiz: [string, string][] = [
    ['In which year did he start building?', String(person.since)],
    [
      `How many robots were in his ${robots.ssl.title.replace(/ soccer robots$/, '')} team?`,
      `${cap(fmt.spell(robots.ssl.team))}.`,
    ],
    [
      `What did his robot team win at ${awards.robocup.event} ${awards.robocup.year}?`,
      `${cap(awards.robocup.place)}, ${awards.robocup.challenge}.`,
    ],
    [`How long does the ${reader_.name} battery last?`, `About ${reader_.batteryMonths} months.`],
    [`Which chip runs the ${beacon_.name}?`, `The ${beacon_.chip}.`],
    [`What was his ${msc.degree} thesis about?`, `${cap(msc.thesis)}.`],
  ];
  story(
    105,
    'Quiz',
    'Quiz',
    'QUIZ',
    [
      para('Answers are hidden. Press REVEAL (or V) to show them, and again to hide them.', CYAN),
      ...quiz.map(([q, a], i) => [
        ...para(`${i + 1} ${q}`, WHITE),
        ...wrap(a, 36).map((t) => line(alpha(YELLOW), ' ', C.Conceal, t)),
      ]),
    ],
    [[101, 'Now'], [103, 'Figures'], [600, 'Roots'], INDEX],
  );
}

/* ------------------------------------------------------------------ 2xx: roles */

{
  const since = person.since,
    span = db.asOf.y + 1 - since;
  const BAR = 24;
  const colours = [YELLOW, CYAN, GREEN, MAGENTA, RED, WHITE];
  sheet(
    200,
    'Roles',
    'Roles',
    'ROLES',
    (s) => {
      s.add(line(alpha(CYAN), `Every role, ${since} to now. Key a page:`));
      s.skip();
      db.roleList.forEach((r, i) => {
        const p = new Pix(BAR * 2, 3);
        const x0 = ((fmt.frac(r.from) - since) / span) * BAR * 2;
        const x1 = (((r.to ? fmt.frac(r.to) : db.now) - since) / span) * BAR * 2;
        p.fill(Math.round(x0), 0, Math.max(Math.round(x0), Math.round(x1) - 1), 1);
        const num = 201 + i;
        s.add(
          line(
            alpha(WHITE),
            { t: pad(r.short ?? r.org, 9), go: num },
            gfx(colours[i % colours.length]),
            mosaicRows(p.art())[0],
            alpha(CYAN),
            { t: String(num), go: num },
          ),
        );
      });
      // The year axis under the bars.
      const axis = new Array<string>(40).fill(' ');
      const at = (y: number) => 11 + Math.round(((y - since) / span) * BAR);
      const ticks = [
        since,
        ...Array.from({ length: span }, (_, k) => since + k).filter(
          (y) => y % 5 === 0 && y >= since + 5 && y <= db.asOf.y - 5,
        ),
        db.asOf.y,
      ];
      ticks.forEach((y) =>
        [...String(y)].forEach((ch, k) => (axis[Math.min(at(y) + k, 36 + k)] = ch)),
      );
      s.add(line(alpha(YELLOW), axis.slice(1).join('')));
      s.skip();
      db.roleList.forEach((r, i) => {
        const num = 201 + i;
        s.add(
          line(
            alpha(CYAN),
            { t: String(num), go: num },
            alpha(WHITE),
            { t: pad(db.titleOf(r), 25), go: num },
            alpha(YELLOW),
            fmt.yearSpan(r.from, r.to),
          ),
        );
      });
    },
    [[201, db.roleList[0].org], nextSection(200), [101, 'Now'], INDEX],
  );

  db.roleList.forEach((r, i) => {
    const num = 201 + i;
    const last = i === db.roleList.length - 1;
    story(
      num,
      r.short ?? r.org,
      `${db.titleOf(r)}, ${r.org}`,
      'ROLES',
      [
        [
          ...headline(r.org),
          ...para(db.titlePath(r), CYAN),
          line(alpha(GREEN), `${fmt.monthSpan(r.from, r.to)}${r.contract ? ', contract' : ''}`),
          ...(r.sector ? para(cap(r.sector), GREEN) : []),
        ],
        para(r.summary, YELLOW),
        ...r.duties.map((d, k) => para(d, k % 2 ? CYAN : WHITE)),
        ...(r.url ? [linkLine('Web', r.url)] : []),
      ],
      [last ? [201, 'First'] : [num + 1, 'Next'], [200, 'Roles'], nextSection(200), INDEX],
      r.url ? [{ label: host(r.url), href: r.url }] : [],
      r.org,
    );
  });
}

/* ------------------------------------------------------------------ 3xx: projects */

const RELATED: Record<string, [string, number][]> = {
  neurobuild: [['The role is on page', 201]],
  attendum: [
    ['The card reader is on page', 404],
    ['The beacon is on page', 405],
  ],
  logger: [['The station is on page', 401]],
  epc: [['The device is on page', 402]],
  miniPlc: [['The device is on page', 403]],
  reactQueryKit: [['The pull request is on page', ossNums.get('reactQueryKit') ?? 500]],
  gatsby: [['The pull request is on page', ossNums.get('gatsby') ?? 500]],
  nanostores: [['The pull request is on page', ossNums.get('nanostores') ?? 500]],
};

const productIdOf = (title: string) =>
  (Object.keys(db.products) as (keyof typeof db.products)[]).find(
    (id) => db.products[id].title === title,
  ) ?? '';

function projectBlocks(p: {
  title: string;
  description: string;
  tech: string[];
  links: Parameters<typeof projectLinks>[0];
}): Line[][] {
  const id = productIdOf(p.title);
  return [
    [...headline(p.title), ...para(p.tech.join(', '), CYAN)],
    para(p.description, WHITE),
    [
      ...projectLinks(p.links).flatMap((l) =>
        linkLine(
          l.kind === 'site'
            ? 'Web'
            : l.kind === 'code'
              ? 'Code'
              : l.label === 'App Store'
                ? 'iOS'
                : 'Android',
          l.url,
          l.kind === 'store' ? new URL(l.url).host : host(l.url),
        ),
      ),
      ...(RELATED[id] ?? []).map(([t, n]) => see(t, n)),
    ],
  ];
}

const projectLinkList = (links: Parameters<typeof projectLinks>[0]): Link[] =>
  projectLinks(links).map((l) => ({ label: l.label, href: l.url }));

{
  sheet(
    300,
    'Projects',
    'Projects',
    'PROJECTS',
    (s) => {
      s.add(line(gfx(MAGENTA), C.NewBg, alpha(WHITE), 'FEATURED'));
      featuredProjects.forEach((p, i) =>
        s.add(
          line(alpha(CYAN), { t: String(301 + i), go: 301 + i }, alpha(WHITE), {
            t: p.title,
            go: 301 + i,
          }),
        ),
      );
      s.add(
        line(alpha(CYAN), { t: '310', go: 310 }, alpha(WHITE), {
          t: `${otherProjects.length} more builds and fixes`,
          go: 310,
        }),
      );
      s.add(
        line(alpha(CYAN), { t: '390', go: 390 }, alpha(WHITE), {
          t: `The archive: all ${archive.length} builds by year`,
          go: 390,
        }),
      );
      s.skip();
      // Builds per year, from the archive, as a column chart in separated graphics.
      const years = archive.map((b) => Number(b.year)).filter((y) => Number.isFinite(y));
      const y0 = Math.min(...years),
        y1 = db.asOf.y,
        n = y1 - y0 + 1;
      const counts = Array.from({ length: n }, (_, k) => years.filter((y) => y === y0 + k).length);
      const max = Math.max(...counts);
      const H = 15,
        unit = Math.max(1, Math.floor(H / max));
      const p = new Pix(n * 4, H);
      counts.forEach((c, k) => c && p.fill(k * 4, H - c * unit, k * 4 + 1, H - 1));
      const busiest = y0 + counts.indexOf(max);
      s.add(line(alpha(YELLOW), 'BUILDS PER YEAR', alpha(WHITE), `busiest ${busiest}: ${max}`));
      const indent = Math.max(0, Math.floor((38 - n * 2) / 2));
      mosaicRows(p.art()).forEach((cells) =>
        s.add(line(gfx(CYAN), C.Separated, ' '.repeat(indent), cells)),
      );
      const axis = new Array<string>(40).fill(' ');
      for (let k = 0; k < n; k += 3)
        [...String(y0 + k)].forEach((ch, j) => (axis[2 + indent + k * 2 + j] = ch));
      s.add(line(alpha(YELLOW), axis.slice(1).join('')));
    },
    [[301, featuredProjects[0].title], nextSection(300), [390, 'Archive'], INDEX],
  );

  featuredProjects.forEach((p, i) => {
    const num = 301 + i;
    const last = i === featuredProjects.length - 1;
    story(
      num,
      p.title,
      p.title,
      'PROJECTS',
      projectBlocks(p),
      [last ? [310, 'More'] : [num + 1, 'Next'], [300, 'Projects'], nextSection(300), INDEX],
      projectLinkList(p.links),
    );
  });

  // More builds: one subpage each, rotating.
  const more = otherProjects.flatMap((p) =>
    paginate(projectBlocks(p)).map((chunk) => ({ chunk, title: p.title })),
  );
  const sheets = more.map(({ chunk }, i) => {
    const s = new Sheet();
    masthead('BUILDS', LOOK[3], `${i + 1}/${more.length}`).forEach((row, r) => s.raw(1 + r, row));
    s.y = 5;
    s.lines(chunk);
    return s;
  });
  drafts.push({
    num: 310,
    short: 'More',
    title: 'More builds and fixes',
    sheets,
    fast: [[390, 'Archive'], [300, 'Projects'], nextSection(300), INDEX],
    links: otherProjects.flatMap((p) =>
      projectLinkList(p.links).map((l) => ({ ...l, label: `${p.title}: ${l.label}` })),
    ),
  });

  story(
    390,
    'Archive',
    'The archive: every build by year',
    'ARCHIVE',
    archive.map((b) => {
      const href = b.links.external ?? b.links.github ?? b.links.appStore;
      const title: Part = href ? { t: b.title.slice(0, 32), href } : b.title.slice(0, 32);
      return [
        line(alpha(YELLOW), pad(b.year, 5), alpha(WHITE), title),
        line(alpha(CYAN), '      ', fitList([b.madeAt ?? '', ...b.tech].filter(Boolean), 33)),
      ];
    }),
    [[300, 'Projects'], [310, 'More'], nextSection(300), INDEX],
    archive.flatMap((b) => {
      const href = b.links.external ?? b.links.github ?? b.links.appStore;
      return href ? [{ label: b.title, href }] : [];
    }),
    'Every build by year',
    0,
  );
}

/* ------------------------------------------------------------------ 4xx: hardware */

const DEVICE_ART: Record<string, () => string[]> = {
  logger: station,
  epc: gauge,
  plc: plcModule,
  attendumReader: reader,
  attendumBeacon: beacon,
};
const DEVICE_PRODUCT: Record<string, number> = {
  logger: productNums.get('logger') ?? 300,
  attendumReader: productNums.get('attendum') ?? 300,
  attendumBeacon: productNums.get('attendum') ?? 300,
  epc: 310,
  plc: 310,
};

sheet(
  400,
  'Hardware',
  'Hardware',
  'HARDWARE',
  (s) => {
    s.add(line(alpha(CYAN), `${hardware.length} devices in production. Key a page:`));
    s.skip();
    hardware.forEach((d, i) => {
      const num = 401 + i;
      s.add(
        line(
          alpha(YELLOW),
          { t: String(num), go: num },
          alpha(WHITE),
          { t: pad(d.name, 17), go: num },
          alpha(CYAN),
          d.tag,
        ),
      );
      s.add(line(alpha(GREEN), '    ', d.kind));
    });
    s.skip();
    s.lines(picture(chip(), YELLOW));
  },
  [[401, hardware[0].name], nextSection(400), [300, 'Projects'], INDEX],
);

hardware.forEach((d, i) => {
  const num = 401 + i;
  const id = deviceIds[i];
  const last = i === hardware.length - 1;
  const fleet = id === 'attendumReader' ? devices.attendumReader.fleet : null;
  story(
    num,
    d.name,
    `${d.name}, ${d.kind}`,
    'HARDWARE',
    [
      [...headline(d.name), line(alpha(CYAN), d.tag, alpha(WHITE), d.kind)],
      para(d.detail, WHITE),
      [
        ...d.figures.map((f) => line(gfx(GREEN), sextant(0b001100), alpha(YELLOW), f)),
        ...(fleet ? para(`Fleet figures from ${fleet.scope}.`, CYAN) : []),
        see('Product page', DEVICE_PRODUCT[id] ?? 300),
      ],
      optional(picture(DEVICE_ART[id](), [CYAN, YELLOW, GREEN, MAGENTA, CYAN][i % 5])),
    ],
    [last ? [401, 'First'] : [num + 1, 'Next'], [400, 'Hardware'], nextSection(400), INDEX],
  );
});

/* ------------------------------------------------------------------ 5xx: open source */

const repoName = (repo: string) => {
  const name = repo.split('/')[1] ?? repo;
  return name.length <= 15 ? name : name.split('-').slice(-2).join('-');
};

sheet(
  500,
  'Open source',
  'Open source',
  'OPEN SOURCE',
  (s) => {
    s.lines(
      para(
        `${oss.length} pull requests to packages with ${db.downloads.weekly.long} weekly downloads between them.`,
        CYAN,
      ),
    );
    s.skip();
    s.add(line(alpha(YELLOW), 'WEEKLY DOWNLOADS'));
    const all = Object.values(contributions);
    const max = Math.max(...all.map((c) => c.weekly.n));
    const BAR = 18;
    all.forEach((c, i) => {
      const len = Math.max(1, Math.round((c.weekly.n / max) * BAR * 2));
      const p = new Pix(len + (len % 2), 3);
      p.fill(0, 0, len - 1, 1);
      s.add(
        line(
          alpha(WHITE),
          pad(repoName(c.repo), 15),
          gfx([GREEN, CYAN, YELLOW, MAGENTA, WHITE][i % 5]),
          mosaicRows(p.art())[0],
          alpha(YELLOW),
          c.weekly.short,
        ),
      );
    });
    s.skip();
    all.forEach((c, i) => {
      const num = 501 + i;
      s.add(
        line(
          alpha(CYAN),
          { t: String(num), go: num },
          alpha(WHITE),
          { t: pad(repoName(c.repo), 16), go: num },
          alpha(GREEN),
          pad(c.kind, 11),
          alpha(YELLOW),
          String(c.year),
        ),
      );
    });
  },
  [[501, 'First PR'], nextSection(500), [310, 'More'], INDEX],
);

Object.values(contributions).forEach((c, i) => {
  const num = 501 + i;
  const url = db.prUrl(c);
  const last = i === ossIds.length - 1;
  story(
    num,
    repoName(c.repo),
    `${c.repo} #${c.pr}`,
    'OPEN SOURCE',
    [
      [
        ...headline(c.repo),
        line(alpha(CYAN), `Pull request #${c.pr}, ${c.year}`),
        line(alpha(GREEN), `${c.kind}, ${c.stars} stars, ${c.weekly.short} a week`),
      ],
      [line(alpha(YELLOW), 'THE CHANGE'), ...para(c.change, WHITE)],
      [line(alpha(YELLOW), 'THE IMPACT'), ...para(c.impact, CYAN)],
      [
        line(alpha(MAGENTA), 'The link is hidden: press REVEAL (V).'),
        ...wrapUrl(host(url), 37).map((t) => line(alpha(WHITE), { t, href: url, conceal: true })),
      ],
    ],
    [last ? [501, 'First'] : [num + 1, 'Next'], [500, 'Open source'], nextSection(500), INDEX],
    [{ label: `${c.repo} pull request #${c.pr}`, href: url }],
    c.repo,
  );
});

/* ------------------------------------------------------------------ 6xx: roots */

const QUAD = { year: '—', title: robots.quadcopter.title, detail: robots.quadcopter.detail };
const ROOTS: { year: string; title: string; detail: string; url?: string }[] = [...roots, QUAD];
const ROOT_ART: Record<number, () => string[]> = { 0: balancer, 1: robot, 2: robot };

sheet(
  600,
  'Roots',
  'Roots: education, robots and research',
  'ROOTS',
  (s) => {
    s.add(line(alpha(CYAN), `Education, ${robocupName} and research.`));
    s.skip();
    ROOTS.forEach((r, i) => {
      const num = 601 + i;
      s.add(
        line(
          alpha(CYAN),
          { t: String(num), go: num },
          alpha(YELLOW),
          r.year === '—' ? 'Undated' : r.year,
        ),
      );
      wrap(r.title, 34).forEach((t) => s.add(line(alpha(WHITE), '    ', { t, go: num })));
    });
  },
  [[601, 'First'], nextSection(600), [103, 'Figures'], INDEX],
);

ROOTS.forEach((r, i) => {
  const num = 601 + i;
  const last = i === ROOTS.length - 1;
  const { url } = r;
  const extra: Line[] = [];
  if (r.title.startsWith(awards.robocup.event))
    extra.push(line(alpha(GREEN), fmt.month(awards.robocup.date)));
  if (r.title === robots.ssl.title)
    extra.push(
      ...para(
        `A team of ${fmt.spell(robots.ssl.team)}, ${fmt.yearSpan(robots.ssl.from, robots.ssl.to)}.`,
        GREEN,
      ),
    );
  if (url)
    extra.push(
      line(alpha(GREEN), `${papers.inverter.venue} ${papers.inverter.id}`),
      ...linkLine('Paper', url),
    );
  story(
    num,
    r.title.split(',')[0],
    r.title,
    'ROOTS',
    [
      [...headline(r.title), line(alpha(CYAN), r.year === '—' ? 'Undated' : r.year)],
      para(r.detail, WHITE),
      extra,
      ROOT_ART[i] ? optional(picture(ROOT_ART[i](), CYAN)) : [],
    ],
    [last ? [601, 'First'] : [num + 1, 'Next'], [600, 'Roots'], nextSection(600), INDEX],
    url ? [{ label: `${papers.inverter.venue}: ${papers.inverter.title}`, href: url }] : [],
  );
});

/* ------------------------------------------------------------------ 7xx: contact */

const CONTACT: Link[] = [
  { label: 'Email', href: `mailto:${person.email}` },
  { label: 'LinkedIn', href: person.linkedin },
  { label: 'GitHub', href: person.github },
  { label: 'CV', href: person.cv },
  { label: 'Web', href: person.url },
];

sheet(
  700,
  'Contact',
  'Contact',
  'CONTACT',
  (s) => {
    s.lines(headline(profile.name, WHITE));
    s.add(line(alpha(CYAN), `${profile.role}, ${profile.company}`));
    s.skip();
    CONTACT.forEach((l) => {
      const shown = l.href.startsWith('mailto:')
        ? person.email
        : l.href.startsWith('/')
          ? `${person.site}${l.href}`
          : host(l.href);
      s.lines(linkLine(l.label, l.href, shown));
    });
    s.skip();
    s.add(see('Apps on both stores: page', 701, YELLOW));
    s.skip();
    s.lines(picture(envelope(), YELLOW));
  },
  [
    [701, 'Live apps'],
    [100, 'Index'],
    [199, 'A-Z'],
    [101, 'Now'],
  ],
  CONTACT.map((l) => ({ label: l.label === 'Web' ? person.site : l.label, href: l.href })),
);

story(
  701,
  'Live apps',
  'Live apps',
  'LIVE APPS',
  [
    liveLinks.flatMap((l) => [
      line(alpha(YELLOW), { t: l.label, href: l.url }),
      line(alpha(CYAN), '  ', new URL(l.url).host),
    ]),
  ],
  [[700, 'Contact'], [300, 'Projects'], [199, 'A-Z'], INDEX],
  liveLinks.map((l) => ({ label: l.label, href: l.url })),
);

/* ------------------------------------------------------------------ 199: A–Z */

{
  const entries = new Map<string, number>();
  // Labels fit fifteen cells: longer ones are cut back to a whole word.
  const fit = (label: string) => {
    if (label.length <= 15) return label;
    const cut = label.slice(0, 16).search(/[\s,:/-][^\s,:/-]*$/);
    return (cut > 0 ? label.slice(0, cut) : label.slice(0, 15)).replace(/[\s,:/-]+$/, '');
  };
  const add = (label: string, num: number) => {
    const l = fit(label);
    if (![...entries.keys()].some((k) => k.toLowerCase() === l.toLowerCase())) entries.set(l, num);
  };
  drafts.forEach((d) => {
    if (d.num % 100 === 0 || d.num < 200) add(d.short, d.num);
  });
  db.roleList.forEach((r) => add(r.short ?? r.org, roleNums.get(r.id) ?? 200));
  hardware.forEach((d, i) => add(d.name, 401 + i));
  Object.values(contributions).forEach((c, i) => add(repoName(c.repo), 501 + i));
  featuredProjects.forEach((p, i) => add(p.title, 301 + i));
  otherProjects.forEach((p) => add(p.title.split(':')[0], 310));
  add('More builds', 310);
  add('Live apps', 701);
  ROOTS.forEach((r, i) => add(r.title.split(',')[0], 601 + i));
  [education.bsc, education.msc].forEach((d) => {
    const num = roots.findIndex((r) => r.title.startsWith(d.degree)) + 601;
    add(d.degree, num);
    add(d.field.split(' ')[0], num);
  });
  add(robocupName, 603);
  add('Archive', 390);
  ['Email', 'LinkedIn', 'GitHub', 'CV'].forEach((l) => add(l, 700));
  add('Quiz', 105);
  const sorted = [...entries].sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const rows: Line[] = [];
  const perCol = 16;
  for (let start = 0; start < sorted.length; start += perCol * 2) {
    const chunk = sorted.slice(start, start + perCol * 2);
    const h = Math.ceil(chunk.length / 2);
    for (let k = 0; k < h; k++) {
      const [a, an] = chunk[k],
        right = chunk[k + h];
      const parts: Part[] = [
        alpha(WHITE),
        { t: pad(a, 15), go: an },
        alpha(CYAN),
        { t: String(an), go: an },
      ];
      if (right)
        parts.push(alpha(WHITE), { t: pad(right[0], 15), go: right[1] }, alpha(CYAN), {
          t: String(right[1]),
          go: right[1],
        });
      rows.push(line(...parts));
    }
  }
  const chunks: Line[][] = [];
  for (let k = 0; k < rows.length; k += perCol) chunks.push(rows.slice(k, k + perCol));
  const sheets = chunks.map((chunk, i) => {
    const s = new Sheet();
    masthead(
      'A-Z INDEX',
      { band: BLUE, ink: WHITE },
      chunks.length > 1 ? `${i + 1}/${chunks.length}` : undefined,
    ).forEach((row, r) => s.raw(1 + r, row));
    s.y = 5;
    s.lines(chunk);
    return s;
  });
  drafts.push({
    num: 199,
    short: 'A-Z',
    title: 'A-Z index',
    sheets,
    fast: [[101, 'Now'], [200, 'Roles'], [300, 'Projects'], INDEX],
    links: [],
  });
}

/* ------------------------------------------------------------------ the service */

const byNum = new Map(drafts.map((d) => [d.num, d]));

export const PAGES = new Map<number, Page>(
  drafts.map((d) => {
    const labels = d.fast.map(([n, label]) => label ?? byNum.get(n)?.short ?? String(n));
    const fast = d.fast.map(([n]) => n) as Page['fast'];
    return [
      d.num,
      {
        num: d.num,
        short: d.short,
        title: d.title,
        links: d.links,
        fast,
        subs: d.sheets.map((s) => s.done(labels)),
      },
    ];
  }),
);

/** Page numbers in service, in order. */
export const ORDER = [...PAGES.keys()].sort((a, b) => a - b);
