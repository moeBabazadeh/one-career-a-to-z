'use client';

import { useState } from 'react';
import { db, fmt } from '../_shared/data';
import Icon from './Icon';
import { ITEMS, type ItemId } from './items';
import s from './factory.module.scss';

// His learning path as a research tree. Dates, names and figures come from db; the cost of a
// research is the years it took, one flask a year.

type Glyph =
  | 'web'
  | 'control'
  | 'robot'
  | 'iot'
  | 'nano'
  | 'chip'
  | 'front'
  | 'phone'
  | 'radio'
  | 'ship'
  | 'cloud'
  | 'ai'
  | 'cto';

interface Tech {
  id: string;
  name: string;
  when: string;
  years?: number;
  glyph: Glyph;
  col: number;
  row: number;
  after: string[];
  detail: string[];
  unlocks?: ItemId[];
  active?: boolean;
}

const { freelance, niknam, alget, zeroone, neuroject } = db.roles;
const { bsc, msc } = db.education;
const { robocup, skills: nationals } = db.awards;
const { ssl } = db.robots;
const paper = db.papers.inverter;
const { logger, epc, plc, attendumReader: reader, attendumBeacon: beacon } = db.devices;
const { fleet } = reader;
const { attendum, educationGuide, neurobuild, smartclaim, activeClass } = db.products;
const { current, commits } = db;

/** The year a build from the archive shipped. */
const shipped = (pick: (b: db.Build) => boolean) => Number(db.builds.find(pick)?.year);
const appYear = shipped((b) => b.title === `${attendum.title} app`);
const guideYear = shipped((b) => b.title === educationGuide.title);
const firmwareYear = shipped((b) => b.tech.includes(reader.chip));
const aiYear = shipped((b) => b.title === smartclaim.title);

const lower = (t: string) => t[0].toLowerCase() + t.slice(1);

const TECH: Tech[] = [
  {
    id: 'web',
    name: 'Web development',
    when: String(freelance.from.y),
    years: freelance.to.y - freelance.from.y,
    glyph: 'web',
    col: 0,
    row: 0,
    after: [],
    detail: [
      `Freelance websites and web apps for clients in PHP, JavaScript and jQuery, from ${freelance.from.y} to ${freelance.to.y}.`,
    ],
  },
  {
    id: 'control',
    name: 'Control systems',
    when: fmt.yearSpan(bsc.from, bsc.to),
    years: bsc.to.y - bsc.from.y,
    glyph: 'control',
    col: 0,
    row: 2,
    after: [],
    detail: [`${db.degreeTitle(bsc)}, at the ${bsc.school}.`, `Thesis: ${bsc.thesis}.`],
  },
  {
    id: 'robotics',
    name: 'Robotics',
    when: fmt.yearSpan(ssl.from, ssl.to),
    years: ssl.to.y - ssl.from.y,
    glyph: 'robot',
    col: 0,
    row: 3,
    after: ['control'],
    detail: [
      `${ssl.title}: a team of ${fmt.spell(ssl.team)} fully autonomous robots playing a real match.`,
      `${robocup.year}: ${robocup.event}, ${robocup.place}, in the ${robocup.challenge}.`,
      `${nationals.year}: ${nationals.event}, ${nationals.place}, in ${nationals.challenge}.`,
    ],
  },
  {
    id: 'nano',
    name: msc.field.replace(/ Engineering$/, ''),
    when: fmt.yearSpan(msc.from, msc.to),
    years: msc.to.y - msc.from.y,
    glyph: 'nano',
    col: 1,
    row: 3,
    after: ['control'],
    detail: [
      `${db.degreeTitle(msc)} at the ${msc.school}. Thesis: ${msc.thesis}.`,
      `${paper.date.y}: a paper on ${paper.venue} on the ${lower(paper.title)}.`,
    ],
  },
  {
    id: 'iot',
    name: 'Web and IoT platforms',
    when: fmt.yearSpan(niknam.from, niknam.to),
    years: niknam.to.y - niknam.from.y,
    glyph: 'iot',
    col: 1,
    row: 2,
    after: ['web', 'control'],
    detail: [
      `At ${niknam.org}: web applications and real-time dashboards, IoT platforms and connected systems for monitoring, tracking and data visualisation, and hardware wired to GPS and maps for live tracking.`,
    ],
  },
  {
    id: 'devices',
    name: 'Devices in production',
    when: 'in production',
    glyph: 'chip',
    col: 2,
    row: 2,
    after: ['iot'],
    detail: [
      `${logger.name} ${logger.kind}s: ${logger.stations.short} stations, online for ${logger.online.short} years, ${logger.records.short} records.`,
      `The ${epc.name} ${lower(epc.kind)}, and the ${plc.name} on STM microcontrollers.`,
    ],
    unlocks: ['lg'],
  },
  {
    id: 'front',
    name: 'Frontend at scale',
    when: fmt.yearSpan(alget.from, zeroone.to),
    years: zeroone.to.y - alget.from.y,
    glyph: 'front',
    col: 2,
    row: 0,
    after: ['web'],
    detail: [
      `${alget.org}: the React frontend of a marketplace that took local grocers online.`,
      `${zeroone.org}: ${db.titleOf(zeroone).toLowerCase()}. ${activeClass.title}, an LMS with live exam proctoring and Azure Face identity checks, and Office add-ins for PowerPoint and Word.`,
    ],
    unlocks: ['web'],
  },
  {
    id: 'mobile',
    name: 'Mobile apps',
    when: `${appYear}–${guideYear}`,
    years: guideYear - appYear,
    glyph: 'phone',
    col: 3,
    row: 0,
    after: ['front'],
    detail: [
      `The ${attendum.title} app (${appYear}) and ${educationGuide.title} (${guideYear}): React Native with Expo, both on the App Store and Google Play.`,
    ],
    unlocks: ['mob', 'eg'],
  },
  {
    id: 'radio',
    name: 'Wireless firmware',
    when: String(firmwareYear),
    glyph: 'radio',
    col: 3,
    row: 2,
    after: ['devices'],
    detail: [
      `Firmware for the ${attendum.title} ${reader.chip} card readers (NFC, RFID, BLE and over-the-air updates) and the ${beacon.chip} BLE beacons on Zephyr.`,
    ],
    unlocks: ['fw'],
  },
  {
    id: 'ship',
    name: 'Shipping end to end',
    when: String(appYear),
    glyph: 'ship',
    col: 4,
    row: 2,
    after: ['radio', 'mobile'],
    detail: [
      `${attendum.title}: the firmware, the iOS and Android app, the staff dashboard and a Canvas LTI app.`,
      `At ${fleet.scope} it has ${fleet.online.short} devices online, covers ${fleet.classrooms.short} classrooms and ${fleet.classes.short} classes, and has received ${fleet.records.short} records in ${fmt.spell(fleet.recordYears)} years.`,
    ],
    unlocks: ['at'],
  },
  {
    id: 'cloud',
    name: 'Cloud platforms',
    when: String(neuroject.from.y),
    years: aiYear - neuroject.from.y,
    glyph: 'cloud',
    col: 4,
    row: 1,
    after: ['front'],
    detail: [
      `${neurobuild.title}: led the architecture and build on Next.js, React 19 and Laravel, hosted on AWS Amplify and Laravel Vapor, with ${commits.neurobuild.short} commits across ${fmt.spell(commits.neurobuildCodebases)} codebases.`,
      'A permission check on every API route, audit trails, and production alarms and GuardDuty alerts kept in infrastructure as code.',
    ],
    unlocks: ['api', 'cloud', 'nb'],
  },
  {
    id: 'ai',
    name: 'AI in production',
    when: `${aiYear} · now`,
    glyph: 'ai',
    col: 5,
    row: 1,
    after: ['cloud'],
    active: true,
    detail: [
      `${smartclaim.title}: AI-assisted R&D tax credit claims, on FastAPI, OpenAI and pgvector, with a SvelteKit app and a TypeScript client SDK.`,
      `At ${neuroject.org}: natural-language access to project data, and early warning on schedule and cost risk.`,
    ],
    unlocks: ['ai', 'sdk', 'sc'],
  },
  {
    id: 'cto',
    name: current.title,
    // the card spells September "Sept"
    when: fmt.mon(current.since).replace(/^Sep\b/, 'Sept'),
    glyph: 'cto',
    col: 5,
    row: 2,
    after: ['cloud'],
    detail: [
      `${current.title} at ${current.company} since ${fmt.month(current.since)}, after ${fmt.spell(Math.floor(fmt.monthsBetween(current.previous.from, current.since) / 12))} years as ${current.previous.title} from ${fmt.month(current.previous.from)}.`,
      'Leads the architecture, roadmap and delivery of a cloud-native, multi-tenant platform that connects BIM, schedules, budgets and risks.',
    ],
  },
];

const CW = 168,
  CH = 104,
  GX = 44,
  GY = 30;
const X = (c: number) => c * (CW + GX);
const Y = (r: number) => r * (CH + GY);
const TW = X(5) + CW,
  TH = Y(3) + CH;

/** Elbow from the right edge of one card to the left edge of another, turning in the gap. */
function edge(a: Tech, b: Tech) {
  if (a.col === b.col) {
    const x = X(a.col) + CW / 2;
    return `M${x},${Y(a.row) + CH} V${Y(b.row)}`;
  }
  const x0 = X(a.col) + CW,
    y0 = Y(a.row) + CH / 2;
  const x1 = X(b.col),
    y1 = Y(b.row) + CH / 2;
  // sources lower in the tree turn a little later, so parallel runs stay apart
  const mid = x0 + GX * (0.3 + 0.4 * (a.row / 3));
  return y0 === y1 ? `M${x0},${y0} H${x1}` : `M${x0},${y0} H${mid} V${y1} H${x1}`;
}

function GlyphSvg({ g }: { g: Glyph }) {
  const p: Record<Glyph, React.ReactNode> = {
    web: (
      <>
        <circle cx={16} cy={16} r={11} />
        <ellipse cx={16} cy={16} rx={5} ry={11} />
        <path d="M5 16h22M7 10h18M7 22h18" />
      </>
    ),
    control: <path d="M4 26h24M4 26V6M4 24C8 24 9 8 13 8s4 6 7 6 4-2 8-2" />,
    robot: (
      <>
        <circle cx={16} cy={17} r={10} />
        <path d="M9 13h14" />
        <circle cx={16} cy={20} r={2.5} />
        <path d="M16 7V3" />
      </>
    ),
    iot: (
      <>
        <path d="M16 28V14M11 28l5-14 5 14" />
        <path d="M10 10a8 8 0 0 1 12 0M6 6a14 14 0 0 1 20 0" />
      </>
    ),
    nano: (
      <>
        <circle cx={16} cy={16} r={2.5} />
        <ellipse cx={16} cy={16} rx={12} ry={5} />
        <ellipse cx={16} cy={16} rx={12} ry={5} transform="rotate(60 16 16)" />
        <ellipse cx={16} cy={16} rx={12} ry={5} transform="rotate(-60 16 16)" />
      </>
    ),
    chip: (
      <>
        <rect x={9} y={9} width={14} height={14} rx={1.5} />
        <path d="M13 9V4M19 9V4M13 28v-5M19 28v-5M9 13H4M9 19H4M28 13h-5M28 19h-5" />
      </>
    ),
    front: (
      <>
        <rect x={3} y={6} width={26} height={20} rx={2} />
        <path d="M3 11h26M12 16l-3 3 3 3M20 16l3 3-3 3" />
      </>
    ),
    phone: (
      <>
        <rect x={10} y={3} width={12} height={26} rx={2.5} />
        <path d="M14 25h4" />
      </>
    ),
    radio: (
      <>
        <path d="M11 9l10 8-5 4V3l5 4-10 8" />
        <path d="M24 11a6 6 0 0 1 0 6M7 11a6 6 0 0 0 0 6" />
      </>
    ),
    ship: (
      <>
        <path d="M4 12l12-6 12 6-12 6z" />
        <path d="M4 12v10l12 6 12-6V12M16 18v10" />
      </>
    ),
    cloud: <path d="M9 24a6 6 0 0 1-.5-12A8 8 0 0 1 24 11a6.5 6.5 0 0 1-1 13z" />,
    ai: (
      <>
        <circle cx={7} cy={9} r={2.5} />
        <circle cx={7} cy={23} r={2.5} />
        <circle cx={16} cy={16} r={2.5} />
        <circle cx={25} cy={9} r={2.5} />
        <circle cx={25} cy={23} r={2.5} />
        <path d="M9 10l5 5M9 22l5-5M18 15l5-5M18 17l5 5" />
      </>
    ),
    cto: <path d="M5 24h22M6 24l-2-13 7 6 5-10 5 10 7-6-2 13" />,
  };
  return (
    <svg viewBox="0 0 32 32" className={s.glyph} aria-hidden="true">
      {p[g]}
    </svg>
  );
}

function Flasks({ n }: { n: number }) {
  return (
    <span className={s.flasks} aria-label={`${n} ${n === 1 ? 'year' : 'years'}`}>
      {Array.from({ length: n }, (_, k) => (
        <svg key={k} viewBox="0 0 10 14" aria-hidden="true" width={10} height={14}>
          <path d="M3.5 1h3M4 1v4L1 12h8L6 5V1" />
          <path d="M2.4 9h5.2L9 12H1z" className={s.liquid} />
        </svg>
      ))}
    </span>
  );
}

export default function TechTree() {
  const [pick, setPick] = useState('cto');
  const t = TECH.find((x) => x.id === pick) ?? TECH[0];
  const lit = new Set<string>();
  const walk = (id: string) => {
    lit.add(id);
    TECH.find((x) => x.id === id)?.after.forEach(walk);
  };
  walk(pick);

  return (
    <div className={s.research}>
      <div className={s.treeScroll} style={{ overflowX: 'auto' }}>
        <div className={s.tree} style={{ width: TW, height: TH }}>
          <svg
            className={s.edges}
            viewBox={`0 0 ${TW} ${TH}`}
            width={TW}
            height={TH}
            aria-hidden="true"
          >
            {TECH.flatMap((b) =>
              b.after.map((id) => {
                const a = TECH.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <path
                    key={`${id}-${b.id}`}
                    d={edge(a, b)}
                    data-lit={(lit.has(a.id) && lit.has(b.id)) || undefined}
                  />
                );
              }),
            )}
          </svg>
          {TECH.map((x) => (
            <button
              key={x.id}
              type="button"
              className={s.techCard}
              style={{ left: X(x.col), top: Y(x.row), width: CW, height: CH }}
              aria-pressed={pick === x.id}
              data-lit={lit.has(x.id) || undefined}
              data-active={x.active || undefined}
              onClick={() => setPick(x.id)}
            >
              <span className={s.techTop}>
                <GlyphSvg g={x.glyph} />
                <span className={s.techWhen}>{x.when}</span>
              </span>
              <span className={s.techName}>{x.name}</span>
              <span className={s.techCost}>
                {x.active ? (
                  <span className={s.researching}>researching</span>
                ) : x.years ? (
                  <Flasks n={x.years} />
                ) : (
                  <span className={s.done}>researched</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className={s.treeHint} aria-hidden="true">
        Swipe sideways to see the whole tree.
      </p>
      <div className={s.techInfo} aria-live="polite">
        <p className={s.techKicker}>
          {t.when}
          {t.years ? ` · ${t.years} ${t.years === 1 ? 'year' : 'years'}` : ''}
          {t.active ? ' · in progress' : ''}
        </p>
        <h3>{t.name}</h3>
        {t.detail.map((d) => (
          <p key={d}>{d}</p>
        ))}
        {t.unlocks && (
          <div className={s.unlocks}>
            <span>Unlocks in the factory</span>
            <ul>
              {t.unlocks.map((id) => (
                <li key={id}>
                  <Icon id={id} size={18} />
                  {ITEMS[id].name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {t.after.length > 0 && (
          <p className={s.prereq}>
            Needs:{' '}
            {t.after.map((id, k) => (
              <span key={id}>
                {k > 0 && ', '}
                <button type="button" className={s.textBtn} onClick={() => setPick(id)}>
                  {TECH.find((x) => x.id === id)?.name}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
