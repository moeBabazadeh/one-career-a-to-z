// What the firmware under test says on each bus, built from the facts. Nothing here is typed out:
// every line reads db (via _shared/data). The serial console answers a scripted host session,
// the I²C devices hand back their descriptors, and the SPI flash holds the project records.
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';

const { person, current } = db;

/** Lines on the wire end the way a serial console ends them. */
export const CRLF = '\r\n';

/** The console's prompt: the firmware's name for itself. */
export const PROMPT = `${person.first.toLowerCase()}> `;

/** A site path as a full address, so the terminal can link it. */
const absolute = (path: string) => (path.startsWith('/') ? `${person.url}${path}` : path);

/* ------------------------------------------------------------------ UART: the console session */

export interface Exchange {
  /** What the host types on RX, without the Enter. */
  cmd: string;
  /** What the firmware prints on TX in reply, lines joined with CRLF. */
  out: string;
}

const pad = (text: string, width: number) => text + ' '.repeat(Math.max(1, width - text.length));

const rolesOut = db.roleList.map((r, i) => {
  const job = jobs[i];
  const head = `${r.org}${r.sector ? `, ${r.sector}` : ''}${r.contract ? ' (contract)' : ''}`;
  return [
    `${head}${r.url ? `  ${r.url}` : ''}`,
    `  ${db.titlePath(r)}`,
    `  ${job.range}`,
    `  ${r.summary}`,
    ...r.duties.map((d) => `  - ${d}`),
  ].join(CRLF);
});

const statWidth = Math.max(...stats.map((s) => s.value.length)) + 2;

const contactOut = [
  ['email', profile.email],
  ['linkedin', profile.linkedin],
  ['github', profile.github],
  ['cv', absolute(profile.cv)],
  ['web', person.url],
] as const;

const COMMANDS: Exchange[] = [
  {
    cmd: 'whoami',
    out: [
      `${person.name} (${person.fullName})`,
      person.headline,
      `${current.title}, ${current.company}: ${current.pitch}`,
      current.companyUrl ?? '',
      '',
      db.lede,
      person.tagline,
    ].join(CRLF),
  },
  { cmd: 'about', out: about.join(CRLF + CRLF) },
  { cmd: 'roles', out: rolesOut.join(CRLF + CRLF) },
  { cmd: 'stats', out: stats.map((s) => `  ${pad(s.value, statWidth)}${s.label}`).join(CRLF) },
  { cmd: 'skills', out: skills.join(', ') },
  { cmd: 'contact', out: contactOut.map(([k, v]) => `  ${pad(k, 10)}${v}`).join(CRLF) },
];

/** The host's script: an empty Enter for a prompt, then `help`, which lists the rest. */
export const session: Exchange[] = [
  { cmd: '', out: '' },
  { cmd: 'help', out: `commands: ${COMMANDS.map((c) => c.cmd).join(' ')}` },
  ...COMMANDS,
];

/* ------------------------------------------------------------------ I²C: devices and the roots EEPROM */

export interface I2cRead {
  /** 7-bit address. */
  addr: number;
  /** Register or memory address written before the repeated start, high byte first. */
  reg: number[];
  /** What the device returns. */
  text: string;
  /** Who answers, for the read-as-page view and the terminal's headings. */
  label: string;
}

/** The first address the bus scan probes, and the last (the usable 7-bit range). */
export const SCAN_FROM = 0x08;
export const SCAN_TO = 0x77;

/** The devices sit from 0x20 up; the EEPROM holding the roots sits at 0x50, where they usually do. */
export const DEVICE_BASE = 0x20;
export const EEPROM = 0x50;

export const deviceReads: I2cRead[] = hardware.map((d, i) => ({
  addr: DEVICE_BASE + i,
  reg: [0x00],
  label: `${d.tag} ${d.name}`,
  text: [`${d.tag} ${d.name}: ${d.kind}`, d.figures.join(' · '), d.detail].join(CRLF) + CRLF,
}));

const quad = db.robots.quadcopter;

const rootLines = [
  ...roots.map((r) =>
    [`${r.year}  ${r.title}`, `  ${r.detail}`, ...(r.url ? [`  ${r.url}`] : [])].join(CRLF),
  ),
  // No years on record for these, so they're listed undated.
  [`----  ${quad.title}`, `  ${quad.detail}`].join(CRLF),
];

/** The roots, one EEPROM read each, a 256-byte block apart. */
export const eepromReads: I2cRead[] = rootLines.map((text, i) => ({
  addr: EEPROM,
  reg: [i, 0x00],
  label: 'roots',
  text: text + CRLF,
}));

/* ------------------------------------------------------------------ SPI: the flash records */

export interface FlashRecord {
  /** 24-bit flash address, one 4 KB sector per record. */
  addr: number;
  text: string;
  /** The chapter it belongs to, for headings. */
  group: 'featured' | 'projects' | 'oss' | 'archive';
}

const linkKey = (l: ReturnType<typeof projectLinks>[number]) =>
  l.kind === 'store' ? l.label.toLowerCase().replace(/\s+/g, '-') : l.kind;
const linkLines = (links: Parameters<typeof projectLinks>[0]) =>
  projectLinks(links).map((l) => `${pad(linkKey(l), 12)}${l.url}`);

const projectRecord = (p: (typeof featuredProjects)[number] | (typeof otherProjects)[number]) =>
  [
    `# ${p.title}`,
    p.description,
    `${pad('tech', 12)}${p.tech.join(', ')}`,
    ...linkLines(p.links),
  ].join(CRLF);

const ossRecord = (c: (typeof oss)[number]) =>
  [
    `# ${c.repo} · ${c.kind} · ${c.year}`,
    `${c.stars} stars · ${c.weekly} weekly downloads`,
    c.change,
    c.impact,
    `${pad('pr', 12)}${c.url}`,
  ].join(CRLF);

const archiveRecord = [
  '# archive',
  ...archive.map((b) => {
    const link = projectLinks(b.links)[0];
    return `${pad(b.year, 6)}${b.title}${b.madeAt ? ` · ${b.madeAt}` : ''} · ${b.tech.join(', ')}${link ? `  ${link.url}` : ''}`;
  }),
].join(CRLF);

const ossSummary = `# open source: ${db.downloads.weekly.short} weekly downloads across ${fmt.spell(oss.length)} patched packages`;

const records: Omit<FlashRecord, 'addr'>[] = [
  ...featuredProjects.map((p) => ({ group: 'featured' as const, text: projectRecord(p) })),
  { group: 'oss', text: ossSummary },
  ...oss.map((c) => ({ group: 'oss' as const, text: ossRecord(c) })),
  ...otherProjects.map((p) => ({ group: 'projects' as const, text: projectRecord(p) })),
  { group: 'archive', text: archiveRecord },
];

export const flashRecords: FlashRecord[] = records.map((r, i) => ({
  ...r,
  addr: (i + 1) * 0x1000,
  text: r.text + CRLF,
}));

/** The flash's READ command, and the byte the master clocks out while the flash answers. */
export const FLASH_READ = 0x03;
export const FLASH_DUMMY = 0x00;
