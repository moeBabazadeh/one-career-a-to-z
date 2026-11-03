import {
  fig,
  frac,
  grouped,
  list,
  month,
  monthsBetween,
  spell,
  type Figure,
  type YearMonth,
} from './format';

/*
 * The single source for everything the site says about Moe: who he is, his roles, education,
 * awards, devices, products, open-source work and the headline numbers. The classic site's
 * content files and every concept read from here, and nothing else types a fact out, so a fact
 * changes in exactly one place. Facts are stored as values (numbers, dates, names, links) and
 * formatted with ./format; prose that carries a fact builds it from the value.
 */

export type { Figure, YearMonth };

/** When the facts were last checked. Counts that grow are lower bounds as of this day. */
export const asOf: YearMonth = { y: 2026, m: 10, d: 27 };

/* ------------------------------------------------------------------ person */

export const person = {
  name: 'Moe Babazadeh',
  fullName: 'Mohammad Babazadeh',
  first: 'Moe',
  email: 'moe@babazadeh.dev',
  site: 'babazadeh.dev',
  url: 'https://babazadeh.dev',
  linkedin: 'https://www.linkedin.com/in/moe-babazadeh/',
  github: 'https://github.com/moeBabazadeh',
  githubUser: 'moeBabazadeh',
  cv: '/resume.pdf',
  photo: '/assets/images/me.jpg',
  /** The year he started building. */
  since: 2007,
  tagline: 'I architect AI-driven platforms and scalable digital products.',
  /** What he is, in a line. */
  headline: 'Full-stack and embedded engineer',
};

/** Years building, as of the facts' date: 19 in 2026. */
export const yearsBuilding = asOf.y - person.since;

/* ------------------------------------------------------------------ counts */

export const commits = {
  /** Counted from his own commits since this year, across every codebase. */
  since: 2021,
  total: fig(11800, '11.8k+', 'more than 11,800'),
  neurobuild: fig(4700, '4,700+', 'more than 4,700'),
  neurobuildCodebases: 5,
};

/* ------------------------------------------------------------------ roles */

export interface RoleStep {
  title: string;
  from: YearMonth;
}

export interface Role {
  id: string;
  org: string;
  /** The name where a shorter one reads better ("Niknam"). */
  short?: string;
  url?: string;
  /** What the organisation is, as a phrase: "an edtech company". */
  sector?: string;
  /** Titles held, in order; the first starts with the role. */
  steps: RoleStep[];
  from: YearMonth;
  /** `null` while it's current. */
  to: YearMonth | null;
  contract?: boolean;
  /** One line on the role. */
  summary: string;
  /** The CV bullets. */
  duties: string[];
}

/** The title held last, or now. */
export const titleOf = (r: Role) => r.steps[r.steps.length - 1].title;

/** "Chief Full Stack Engineer → CTO", "Software → Senior Software Engineer": every title held, a shared ending said once. */
export function titlePath(r: Role) {
  return r.steps
    .map((s, i) => {
      const next = r.steps[i + 1]?.title;
      const end = s.title.split(' ').pop() as string;
      return next?.endsWith(` ${end}`) && s.title !== end
        ? s.title.slice(0, -end.length - 1)
        : s.title;
    })
    .join(' → ');
}

const NEUROJECT_PITCH = 'the alignment layer for construction enterprises';

const chief: RoleStep = { title: 'Chief Full Stack Engineer', from: { y: 2024, m: 6 } };
const cto: RoleStep = { title: 'CTO', from: { y: 2026, m: 9 } };
const niknamSenior: RoleStep = { title: 'Senior Software Engineer', from: { y: 2017 } };
const niknamStart: RoleStep = { title: 'Software Engineer', from: { y: 2012, m: 10 } };

/** Every role, newest first. */
export const roles = {
  neuroject: {
    id: 'neuroject',
    org: 'Neuroject',
    url: 'https://neuroject.com',
    sector: 'a construction-tech company',
    steps: [chief, cto],
    from: chief.from,
    to: null,
    summary: `Built NeuroBuild, then CTO of ${NEUROJECT_PITCH}.`,
    duties: [
      `${cto.title} since ${month(cto.from)}, after ${spell(Math.floor(monthsBetween(chief.from, cto.from) / 12))} years as ${chief.title}. I lead the architecture, roadmap, and delivery of a cloud-native, multi-tenant platform that connects BIM, schedules, budgets, and risks into traceable decisions.`,
      'Bringing AI into the platform, from natural-language access to project data to early warning on schedule and cost risk.',
      `Led the architecture and build of NeuroBuild on Next.js, React 19, and Laravel, hosted on AWS Amplify and Laravel Vapor, with ${commits.neurobuild.short} commits across ${spell(commits.neurobuildCodebases)} codebases.`,
      'Set the engineering bar: a permission check on every API route, audit trails, and production alarms and GuardDuty alerts kept in infrastructure as code.',
    ],
  },
  neuroship: {
    id: 'neuroship',
    org: 'Neuroship',
    steps: [{ title: 'Chief Full Stack Engineer', from: { y: 2026, m: 5 } }],
    from: { y: 2026, m: 5 },
    to: null,
    contract: true,
    summary: 'Contract role alongside Neuroject.',
    duties: ['Chief Full Stack Engineer on contract, alongside my role at Neuroject.'],
  },
  zeroone: {
    id: 'zeroone',
    org: '0&1',
    url: 'https://0and1.co.uk',
    sector: 'an edtech company',
    steps: [{ title: 'Lead Frontend Developer', from: { y: 2021, m: 2 } }],
    from: { y: 2021, m: 2 },
    to: { y: 2024, m: 12 },
    summary: 'Active-Class LMS and proctoring, Attendum firmware and apps on both stores.',
    duties: [
      'Led the frontend architecture of Active-Class, an integrated LMS and exam monitoring platform, including identity checks during live exams with the Microsoft Azure Face API.',
      'Shipped Attendum end to end: firmware for the ESP32 card readers and nRF52840 BLE beacons, the iOS and Android app, the staff dashboard, and a Canvas LTI app.',
      'Built Office.js add-ins for PowerPoint and Word, the School.how dashboard, the Education Guide app, and the Learning Kit and Exam Kit websites.',
      'Redesigned the CI/CD pipelines to cut build and deployment overhead, then stayed on as a technical consultant for architecture, performance, and release reliability.',
    ],
  },
  alget: {
    id: 'alget',
    org: 'Alget.nl',
    sector: 'a grocery marketplace',
    steps: [{ title: 'Senior Frontend Developer', from: { y: 2020, m: 8 } }],
    from: { y: 2020, m: 8 },
    to: { y: 2021, m: 2 },
    summary: 'A React marketplace that took local grocers online.',
    duties: [
      'Built the React frontend of a digital marketplace that helps local supermarkets and grocery businesses sell online.',
      'Implemented state management and client-side data handling that cut unnecessary API requests.',
      'Shipped MVP features quickly with the product and backend teams, and improved deployment workflows with CI/CD.',
    ],
  },
  niknam: {
    id: 'niknam',
    org: 'Niknam Electronic Rayan',
    short: 'Niknam',
    sector: 'an electronics and IoT company',
    steps: [niknamStart, niknamSenior],
    from: niknamStart.from,
    to: { y: 2020, m: 8 },
    summary: 'IoT platforms, live GPS tracking and connected devices.',
    duties: [
      'At Niknam Electronic Rayan, built IoT platforms and connected systems for monitoring, tracking, and data visualisation across multiple industries.',
      'Designed web applications and real-time dashboards, and integrated hardware devices with GPS and mapping services for live tracking.',
      `Modernised legacy platforms for performance, usability, and maintainability. ${niknamStart.title} from ${niknamStart.from.y}, ${niknamSenior.title} from ${niknamSenior.from.y}.`,
    ],
  },
  freelance: {
    id: 'freelance',
    org: 'Freelance',
    steps: [{ title: 'Web Developer', from: { y: person.since, m: 8 } }],
    from: { y: person.since, m: 8 },
    to: { y: 2012, m: 10 },
    summary: 'Websites and web apps for clients in PHP, JavaScript and jQuery.',
    duties: [
      'Built websites and web applications for clients with PHP, JavaScript, jQuery, HTML, and CSS.',
    ],
  },
} satisfies Record<string, Role>;

export type RoleId = keyof typeof roles;

/** Roles newest first. */
export const roleList: Role[] = Object.values(roles);

/** The role he leads now, and its title: CTO at Neuroject. */
export const current = {
  role: roles.neuroject as Role,
  title: cto.title,
  company: roles.neuroject.org,
  companyUrl: roles.neuroject.url,
  pitch: NEUROJECT_PITCH,
  /** The step before the current title. */
  previous: chief,
  /** When the current title started. */
  since: cto.from,
};

/* ------------------------------------------------------------------ education and awards */

export interface Degree {
  degree: string;
  field: string;
  focus?: string;
  school: string;
  from: YearMonth;
  to: YearMonth;
  thesis: string;
}

export const education = {
  bsc: {
    degree: 'BSc',
    field: 'Electrical Engineering',
    focus: 'Control Systems',
    school: 'University of Tabriz',
    from: { y: 2008 },
    to: { y: 2012 },
    thesis: 'a two-wheel self-balancing robot with real-time fuzzy control',
  },
  msc: {
    degree: 'MSc',
    field: 'Nanoelectronics Engineering',
    school: 'University of Tabriz',
    from: { y: 2014 },
    to: { y: 2016 },
    thesis: 'plasmonic wave sources based on multilayer structures',
  },
} satisfies Record<string, Degree>;

/** "BSc Electrical Engineering, Control Systems". */
export const degreeTitle = (d: Degree) => `${d.degree} ${d.field}${d.focus ? `, ${d.focus}` : ''}`;

const IRANOPEN: YearMonth = { y: 2010, m: 4 };
const DEMINER = 'Deminer';

export const awards = {
  /** 5–9 April 2010, Tehran. */
  robocup: {
    event: 'RoboCup IranOpen',
    place: '1st place',
    game: DEMINER,
    challenge: `${DEMINER} Technical Challenge`,
    short: `${DEMINER} Challenge`,
    date: IRANOPEN,
    year: IRANOPEN.y,
  },
  skills: {
    event: 'National Skills Competitions',
    place: 'bronze',
    challenge: 'Mobile Robotics',
    year: 2010,
  },
};

export const robots = {
  ssl: {
    title: 'Small Size League soccer robots',
    from: { y: 2009 },
    to: { y: 2011 },
    team: 5,
    detail: `A team of ${spell(5)} fully autonomous robots playing a real match.`,
  },
  /** He took part; no years, events or results are on record yet. */
  quadcopter: {
    title: 'Quadcopter robotics competitions',
    detail: 'Took part in quadcopter robotics competitions.',
  },
};

export const papers = {
  inverter: {
    title:
      'Design, engineering and optimization of a grid-tie multicell inverter for energy storage',
    venue: 'arXiv',
    id: '1708.08008',
    url: 'https://arxiv.org/abs/1708.08008',
    date: { y: 2017, m: 8 },
  },
};

/* ------------------------------------------------------------------ devices in production */

export interface Device {
  tag: string;
  name: string;
  kind: string;
  detail: string;
}

const BATTERY_MONTHS = 16;
const PLC_CHIP = 'STM';

export const devices = {
  logger: {
    tag: 'LG-01',
    name: 'Logger',
    kind: 'GSM weather station',
    detail: 'Several sensors per station, with logs sent home over GSM.',
    stations: fig(50, '50+', 'more than 50'),
    /** Years the fleet has been online. */
    online: fig(15, '15+', 'over 15'),
    records: fig(5e8, '0.5B+', 'over half a billion'),
  },
  epc: {
    tag: 'EPC-01',
    name: 'EPC',
    kind: 'Pressure and flow controller',
    detail: 'Embedded hardware and firmware that hold pressure and flow at their setpoints.',
  },
  plc: {
    tag: 'PLC-01',
    name: 'Mini PLC',
    kind: 'Compact PLC',
    chip: PLC_CHIP,
    detail: `Built on ${PLC_CHIP} microcontrollers, for automation on a small footprint.`,
  },
  attendumReader: {
    tag: 'AT-01',
    name: 'Attendum reader',
    kind: 'ESP32 card reader',
    chip: 'ESP32',
    batteryMonths: BATTERY_MONTHS,
    detail: `NFC, RFID, BLE and over-the-air updates. Wireless, with a battery that lasts about ${BATTERY_MONTHS} months.`,
    /** Figures from one university, the only one with numbers to share, so lower bounds. */
    fleet: {
      scope: 'one university',
      online: fig(200, '200+', 'more than 200'),
      records: fig(3e6, '3M+', 'over 3 million'),
      recordYears: 2,
      classrooms: fig(100, '100+', 'over 100'),
      classes: fig(10000, '10K+', 'over 10,000'),
    },
  },
  attendumBeacon: {
    tag: 'AT-02',
    name: 'Attendum beacon',
    kind: 'nRF52840 BLE beacon',
    chip: 'nRF52840',
    detail: 'Bluetooth proximity check-in, updated over the air with DFU.',
  },
};

// Every device has the base fields; some carry their own figures as well.
devices satisfies Record<string, Device>;

export type DeviceId = keyof typeof devices;

/** The headline figures each device shows, or "In production". */
export function deviceFigures(id: DeviceId): string[] {
  if (id === 'logger') {
    const l = devices.logger;
    return [
      `${l.stations.short} stations`,
      `${l.online.short} years online`,
      `${l.records.short} records`,
    ];
  }
  if (id === 'attendumReader') {
    const f = devices.attendumReader.fleet;
    return [
      `${f.online.short} devices online`,
      `${f.records.short} records in ${f.recordYears} years`,
      `${f.classes.short} classes covered`,
    ];
  }
  return ['In production'];
}

/* ------------------------------------------------------------------ open source */

export interface Contribution {
  repo: string;
  pr: number;
  year: number;
  stars: string;
  weekly: Figure;
  kind: 'Security' | 'Data loss' | 'Type safety' | 'Bug';
  change: string;
  impact: string;
}

const UUID = 'uuid@3.4.0';
const UUID_FROM = ['gatsby-cli', 'gatsby-plugin-sharp'];

export const contributions = {
  gatsby: {
    repo: 'gatsbyjs/gatsby',
    pr: 35657,
    year: 2022,
    stars: '56k',
    weekly: fig(163000, '163k', '163k'),
    kind: 'Security',
    /** The package version the fix removed, and the packages it was removed from. */
    removed: UUID,
    from: UUID_FROM,
    change: `Removed the deprecated ${UUID} from ${list(UUID_FROM)}.`,
    impact:
      'That version can fall back to Math.random(), which is unsafe for IDs. npm flagged it on every install.',
  },
  nanostores: {
    repo: 'nanostores/persistent',
    pr: 20,
    year: 2022,
    stars: '383',
    weekly: fig(82000, '82k', '82k'),
    kind: 'Data loss',
    change: 'Synced storage events only for the store’s own key.',
    impact: 'Opening the app in a second tab wiped saved data.',
  },
  reactQueryKit: {
    repo: 'HuolalaTech/react-query-kit',
    pr: 78,
    year: 2026,
    stars: '486',
    weekly: fig(31000, '31k', '31k'),
    kind: 'Type safety',
    change: 'Opt-in strictVariables: typed query variables become required at the call site.',
    impact: 'A forgotten argument compiled fine and only failed at runtime.',
  },
  definitelyTyped: {
    repo: 'DefinitelyTyped/DefinitelyTyped',
    pr: 72780,
    year: 2025,
    stars: '51k',
    weekly: fig(22000, '22k', '22k'),
    kind: 'Type safety',
    change: 'Typed the optional RegExp filters on the Forge Viewer’s getPropertyHashes.',
    impact: 'Calls that Autodesk documents failed to type-check.',
  },
  i18next: {
    repo: 'microapps/gatsby-plugin-react-i18next',
    pr: 93,
    year: 2021,
    stars: '119',
    weekly: fig(5400, '5.4k', '5.4k'),
    kind: 'Bug',
    change: 'Added forwardRef support to the localized Link.',
    impact: 'Refs passed to localized links were silently dropped.',
  },
  // Extra fields allowed (the Gatsby fix's package names), base fields checked.
} satisfies Record<string, Contribution & Record<string, unknown>>;

export type ContributionId = keyof typeof contributions;

/** The pull request's address. */
export const prUrl = (c: Contribution) => `https://github.com/${c.repo}/pull/${c.pr}`;

const weeklyTotal = Object.values(contributions).reduce((sum, c) => sum + c.weekly.n, 0);

/** Weekly downloads of the packages he patched, combined: 303.4k, shown as 300k+. */
export const downloads = {
  weekly: fig(
    weeklyTotal,
    `${Math.floor(weeklyTotal / 1e5) * 100}k+`,
    `more than ${Math.floor(weeklyTotal / 1e5) * 100}k`,
  ),
  /** The exact sum, for pages that show their working: "303k". */
  exact: `${Math.round(weeklyTotal / 1000)}k`,
};

/* ------------------------------------------------------------------ products and builds */

export interface ProjectLinks {
  external?: string;
  github?: string;
  appStore?: string;
  playStore?: string;
}

export const stores = {
  attendum: {
    appStore: 'https://apps.apple.com/us/app/attendum/id6450669101',
    playStore: 'https://play.google.com/store/apps/details?id=com.attendum',
  },
  educationGuide: {
    appStore: 'https://apps.apple.com/us/app/education-guide/id6504922721',
    playStore: 'https://play.google.com/store/apps/details?id=guide.education',
  },
};

export interface Product {
  title: string;
  description: string;
  tech: string[];
  links: ProjectLinks;
  /** A screenshot, for products that get one. */
  image?: string;
}

const logger = devices.logger;
const fleet = devices.attendumReader.fleet;
const SMARTCLAIM_COUNTRIES = ['UK', 'Ireland', 'Australia', 'South Africa'];
const ATTENDUM_COUNTRIES = ['UK', 'US'];

/** Products he built or shipped. The first five are featured; the rest are smaller builds and fixes. */
export const products = {
  neurobuild: {
    title: 'NeuroBuild',
    description: `${NEUROJECT_PITCH.replace(/^t/, 'T')}: one multi-tenant platform for BIM models, WBS, quantity take-off, bills of quantities, tenders, and 4D progress reports, now with AI for natural-language questions and early risk warnings. I lead it as ${cto.title}.`,
    tech: ['Next.js', 'Laravel', 'AWS', 'Autodesk APS'],
    links: { external: roles.neuroject.url },
    image: '/assets/images/projects/neurobuild.jpg',
  },
  smartclaim: {
    title: 'SmartClaim',
    /** Where it files claims. */
    countries: SMARTCLAIM_COUNTRIES,
    description: `AI-assisted R&D tax credit claims for the ${list(SMARTCLAIM_COUNTRIES)}. I work across the FastAPI and pgvector API, the SvelteKit app, and the TypeScript client SDK, and added its security gates: secret scanning, Semgrep, and Trivy on every pull request.`,
    tech: ['FastAPI', 'OpenAI', 'pgvector', 'SvelteKit', 'TypeScript'],
    links: { external: 'https://smartclaim.uk' },
    image: '/assets/images/projects/smartclaim.jpg',
  },
  attendum: {
    title: 'Attendum',
    /** Where its universities are. */
    countries: ATTENDUM_COUNTRIES,
    description: `Attendance monitoring live at universities in the ${list(ATTENDUM_COUNTRIES)}. I wrote the firmware for the ${devices.attendumReader.chip} card readers (NFC, RFID, BLE, over-the-air updates) and the ${devices.attendumBeacon.chip} Bluetooth beacons, and built the iOS and Android app, the staff dashboard, and a Canvas LTI app. At a single university, it has ${fleet.online.long} devices online, covers ${fleet.classrooms.long} classrooms and ${grouped(fleet.classes.n)} classes, and has received ${fleet.records.long} records in the past ${spell(fleet.recordYears)} years.`,
    tech: [devices.attendumReader.chip, devices.attendumBeacon.chip, 'React Native', 'Next.js'],
    links: { external: 'https://attendum.com', ...stores.attendum },
    image: '/assets/images/projects/attendum.jpg',
  },
  logger: {
    title: logger.name,
    description: `GSM weather stations that take several sensors each and send their logs home. The fleet has been online for ${logger.online.long} years: ${logger.stations.long} active stations and ${logger.records.long} records.`,
    tech: ['Hardware', 'Firmware', 'GSM', 'Sensors', 'Telemetry'],
    links: {},
    image: '/assets/images/projects/logger.svg',
  },
  activeClass: {
    title: 'Active-Class',
    description:
      'An LMS with live exam proctoring and Azure Face identity checks. I built the user dashboard, an Office add-in that brings live polls and word clouds into PowerPoint and Word, and the product website.',
    tech: ['React', 'Redux', 'Firebase', 'Office.js'],
    links: { external: 'https://active-class.com' },
    image: '/assets/images/projects/active-class.jpg',
  },
  educationGuide: {
    title: 'Education Guide',
    description:
      'A React Native app on both stores that helps students starting university get to know their course, campus, city, and career options.',
    tech: ['Expo', 'React Native', 'TypeScript'],
    links: { external: 'https://education.guide', ...stores.educationGuide },
  },
  schoolHow: {
    title: 'School.how',
    description:
      'Online tutoring for every child: diagnostic tests, courses, quizzes, and 1-to-1 lessons over live video. I built the dashboard and the website.',
    tech: ['Next.js', 'MUI', 'VideoSDK', 'Uppy'],
    links: { external: 'https://school.how' },
  },
  epc: {
    title: devices.epc.name,
    description:
      'An electronic pressure and flow controller: embedded hardware and firmware that hold pressure and flow at their setpoints. In production.',
    tech: ['Hardware', 'Firmware', 'Process control'],
    links: {},
  },
  miniPlc: {
    title: devices.plc.name,
    description: `A compact PLC controller built on ${PLC_CHIP} microcontrollers: the board and firmware for automation on a small footprint. In production.`,
    tech: [PLC_CHIP, 'Firmware', 'PLC'],
    links: {},
  },
  reactQueryKit: {
    title: 'react-query-kit: strictVariables',
    description: `An opt-in flag I added to react-query-kit (${contributions.reactQueryKit.weekly.short} weekly downloads) so a forgotten query argument fails at compile time instead of at runtime.`,
    tech: ['TypeScript', 'React Query'],
    links: { github: prUrl(contributions.reactQueryKit) },
  },
  gatsby: {
    title: 'Gatsby: insecure uuid removed',
    description: `Removed a deprecated uuid version from ${list(UUID_FROM)} that could fall back to Math.random() and was flagged on every Gatsby install.`,
    tech: ['Node.js', 'Security'],
    links: { github: prUrl(contributions.gatsby) },
  },
  pulseIot: {
    title: 'Pulse IoT',
    description:
      'Device telemetry on plain shared PHP hosting: ingest, rollups, alarms with hysteresis, OTA firmware, and reports. No Composer, npm, or build step.',
    tech: ['PHP 8', 'Vanilla JS', 'OpenAPI'],
    links: {},
  },
  photoDedup: {
    title: 'Photo Dedup',
    description:
      'A native macOS app that finds duplicate and look-alike photos by how they look. Fully offline, and nothing is ever deleted.',
    tech: ['Swift', 'SwiftUI', 'Vision'],
    links: {},
  },
  matrixKeypad: {
    title: 'matrix-keypad-freertos',
    description:
      'Reads matrix keypads as a FreeRTOS task, with built-in debouncing and configurable layouts and pin maps. Portable across microcontrollers.',
    tech: ['C', 'FreeRTOS'],
    links: { github: `${person.github}/matrix-keypad-freertos` },
  },
  nanostores: {
    title: 'nanostores/persistent: tab sync fix',
    description: `Fixed persisted data being wiped when the app was opened in a second tab, in a store used ${contributions.nanostores.weekly.short} times a week.`,
    tech: ['TypeScript'],
    links: { github: prUrl(contributions.nanostores) },
  },
  learningKit: {
    title: 'Learning Kit',
    description: `The product website for Learning Kit, built for ${roles.zeroone.org}.`,
    tech: ['Next.js', 'AWS Amplify'],
    links: { external: 'https://learningkit.com' },
  },
  examKit: {
    title: 'Exam Kit',
    description: `The product website for Exam Kit, an online exam monitoring system by ${roles.zeroone.org}.`,
    tech: ['Nuxt', 'Tailwind CSS'],
    links: { external: 'https://examkit.com' },
  },
};

products satisfies Record<string, Product>;

export type ProductId = keyof typeof products;

export const featuredIds: ProductId[] = [
  'neurobuild',
  'smartclaim',
  'attendum',
  'logger',
  'activeClass',
];

/** Products that are live, a lower bound. */
export const productsLive = fig(10, '10+', 'more than 10');

/** Apps he shipped to both the App Store and Google Play. */
export const storeApps = Object.values(products).filter(
  (p: Product) => p.links.appStore && p.links.playStore,
);

/** Every build by year, newest first. "—" marks devices still in production. */
export interface Build {
  year: string;
  title: string;
  madeAt?: string;
  tech: string[];
  links: ProjectLinks;
}

const oss = 'Open source';
const z = roles.zeroone.org;
const tabriz = education.bsc.school;

export const builds: Build[] = [
  {
    year: String(contributions.reactQueryKit.year),
    title: products.reactQueryKit.title,
    madeAt: oss,
    tech: ['TypeScript'],
    links: products.reactQueryKit.links,
  },
  {
    year: '2026',
    title: 'SmartClaim',
    madeAt: 'SmartClaim',
    tech: ['FastAPI', 'OpenAI', 'pgvector', 'SvelteKit'],
    links: products.smartclaim.links,
  },
  {
    year: '2026',
    title: 'Pulse IoT',
    madeAt: 'Personal',
    tech: ['PHP', 'Vanilla JS', 'OpenAPI'],
    links: {},
  },
  {
    year: '2026',
    title: 'Photo Dedup',
    madeAt: 'Personal',
    tech: ['Swift', 'SwiftUI', 'Vision'],
    links: {},
  },
  {
    year: String(contributions.definitelyTyped.year),
    title: 'Forge Viewer types',
    madeAt: 'DefinitelyTyped',
    tech: ['TypeScript'],
    links: { github: prUrl(contributions.definitelyTyped) },
  },
  {
    year: String(roles.neuroject.from.y),
    title: 'NeuroBuild',
    madeAt: roles.neuroject.org,
    tech: ['Next.js', 'React', 'Laravel', 'AWS'],
    links: products.neurobuild.links,
  },
  {
    year: '2024',
    title: 'Education Guide',
    madeAt: z,
    tech: ['Expo', 'React Native'],
    links: products.educationGuide.links,
  },
  {
    year: '2024',
    title: 'Attendum Canvas LTI app',
    madeAt: z,
    tech: ['Preact', 'Vite'],
    links: {},
  },
  {
    year: '2023',
    title: 'Attendum app',
    madeAt: z,
    tech: ['Expo', 'React Native'],
    links: { ...stores.attendum },
  },
  {
    year: '2023',
    title: 'Attendum card reader firmware',
    madeAt: z,
    tech: [devices.attendumReader.chip, 'ESP-IDF', 'BLE', 'NFC'],
    links: { external: products.attendum.links.external },
  },
  {
    year: '2023',
    title: 'Attendum BLE beacon',
    madeAt: z,
    tech: [devices.attendumBeacon.chip, 'Zephyr'],
    links: {},
  },
  {
    year: '2023',
    title: 'Learning Kit website',
    madeAt: z,
    tech: ['Next.js'],
    links: products.learningKit.links,
  },
  {
    year: '2023',
    title: 'Exam Kit website',
    madeAt: z,
    tech: ['Nuxt'],
    links: products.examKit.links,
  },
  {
    year: '2023',
    title: `${z} website`,
    madeAt: z,
    tech: ['Next.js', 'AWS Lambda'],
    links: { external: roles.zeroone.url },
  },
  {
    year: '2023',
    title: products.matrixKeypad.title,
    madeAt: 'Personal',
    tech: ['C', 'FreeRTOS'],
    links: products.matrixKeypad.links,
  },
  {
    year: '2022',
    title: 'School.how',
    madeAt: z,
    tech: ['Next.js', 'MUI', 'VideoSDK'],
    links: products.schoolHow.links,
  },
  {
    year: '2022',
    title: 'UK Flour Millers dashboard',
    madeAt: z,
    tech: ['Next.js'],
    links: { external: 'https://ukflourmillers.active-class.com' },
  },
  {
    year: String(contributions.gatsby.year),
    title: products.gatsby.title,
    madeAt: oss,
    tech: ['Node.js'],
    links: products.gatsby.links,
  },
  {
    year: String(contributions.nanostores.year),
    title: products.nanostores.title,
    madeAt: oss,
    tech: ['TypeScript'],
    links: products.nanostores.links,
  },
  {
    year: '2021',
    title: 'Active-Class dashboard',
    madeAt: z,
    tech: ['React', 'Redux', 'MUI', 'Firebase'],
    links: { external: 'https://user.active-class.com' },
  },
  {
    year: '2021',
    title: 'Active-Class Office add-in',
    madeAt: z,
    tech: ['Office.js', 'React'],
    links: {},
  },
  {
    year: '2021',
    title: 'Active-Class website',
    madeAt: z,
    tech: ['Gatsby', 'MUI'],
    links: products.activeClass.links,
  },
  {
    year: String(contributions.i18next.year),
    title: 'gatsby-plugin-react-i18next: Link refs',
    madeAt: oss,
    tech: ['React'],
    links: { github: prUrl(contributions.i18next) },
  },
  {
    year: String(papers.inverter.date.y),
    title: 'Grid-tie multicell inverter (paper)',
    madeAt: papers.inverter.venue,
    tech: ['Power electronics'],
    links: { external: papers.inverter.url },
  },
  {
    year: String(education.bsc.to.y),
    title: 'Self-balancing robot with fuzzy control',
    madeAt: tabriz,
    tech: ['Control systems', 'Embedded'],
    links: {},
  },
  {
    year: String(awards.robocup.year),
    title: `${awards.robocup.event} ${awards.robocup.short}, ${awards.robocup.place}`,
    madeAt: tabriz,
    tech: ['Robotics'],
    links: {},
  },
  {
    year: String(robots.ssl.from.y),
    title: robots.ssl.title,
    madeAt: tabriz,
    tech: ['Robotics', 'Control systems'],
    links: {},
  },
  {
    year: '—',
    title: `${logger.name}: GSM weather stations`,
    madeAt: 'In production',
    tech: ['Hardware', 'Firmware', 'GSM'],
    links: {},
  },
  {
    year: '—',
    title: `${devices.epc.name}: pressure and flow controller`,
    madeAt: 'In production',
    tech: ['Hardware', 'Firmware'],
    links: {},
  },
  {
    year: '—',
    title: devices.plc.name,
    madeAt: 'In production',
    tech: [PLC_CHIP, 'Firmware'],
    links: {},
  },
  { year: '—', title: 'Pipe inspection robot', madeAt: 'Robotics', tech: ['Robotics'], links: {} },
];

/* ------------------------------------------------------------------ headline numbers */

export const headline = [
  { value: commits.total.short, label: `commits since ${commits.since}` },
  { value: productsLive.short, label: 'products live' },
  { value: String(Object.keys(devices).length), label: 'devices in production' },
  { value: logger.records.short, label: 'sensor records logged' },
  { value: String(storeApps.length), label: 'apps on App Store and Google Play' },
  { value: downloads.weekly.short, label: 'weekly downloads of packages I patched' },
];

/* ------------------------------------------------------------------ words */

export const skills = [
  'TypeScript',
  'React & Next.js',
  'Laravel (PHP)',
  'Python & FastAPI',
  'AWS',
  'React Native & Expo',
  'Embedded C',
  'PostgreSQL & MySQL',
];

/** One line: what he does now and how long he's been building. */
export const lede = `${cto.title} at ${roles.neuroject.org}, building ${NEUROJECT_PITCH}. Building since ${person.since}: robots, IoT and firmware, then web, mobile and AI platforms.`;

const sectors = [roles.niknam, roles.alget, roles.zeroone, roles.neuroject].map(
  (r) => r.sector as string,
);

/** About, in three paragraphs. */
export const about = [
  `I started building websites as a freelancer in ${person.since}, studied electrical engineering with a focus on control systems, and spent my university years building robots, including a ${awards.robocup.place} at ${awards.robocup.event} ${awards.robocup.year}.`,
  `Since then I’ve built for ${sectors.slice(0, -1).join(', ')} and ${sectors[sectors.length - 1]}. Today I’m ${cto.title} at ${roles.neuroject.org}, leading the platform that connects BIM, schedules, budgets and risks for construction enterprises, and bringing AI into it.`,
  `Along the way I’ve shipped apps to the App Store and Google Play, hardware that’s still logging data after ${logger.online.n} years, and fixes to open source projects like Gatsby and DefinitelyTyped.`,
];

/** The facts' date as a fractional year, for timelines: 2026.82. */
export const now = frac(asOf);
