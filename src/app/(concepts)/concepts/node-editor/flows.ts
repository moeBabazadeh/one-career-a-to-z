// The flows of concept N · Node Editor. Every label, status and payload comes from the shared
// data; positions are canvas pixels at 100% zoom.

import {
  NOW,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roles,
  roots,
  type Device,
} from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';
import type { IconName } from './icons';

// The microcontrollers the Mini PLC is built on, and where Attendum's universities are.
const PLC_MCU = db.devices.plc.chip;
const ATTENDUM_COUNTRIES = fmt.list(db.products.attendum.countries);

const { person, current, products, storeApps, productsLive, commits, downloads } = db;
const { logger, epc, plc, attendumReader: reader, attendumBeacon: beacon } = db.devices;
const { attendum, neurobuild, smartclaim, activeClass } = products;

export type Json = string | number | boolean | null | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

export interface Msg {
  _msgid: string;
  topic: string;
  payload: Json;
  seq: number;
}

export interface Status {
  fill: 'green' | 'yellow' | 'blue' | 'grey';
  ring?: boolean;
  text: string;
}

export interface NodeInfo {
  title?: string;
  props?: [string, string][];
  body?: string[];
  bullets?: string[];
  links?: LinkItem[];
  tags?: string[];
  image?: string;
}

interface KindDef {
  type: string;
  color: string;
  icon: IconName;
  inputs: 0 | 1;
  outputs: number;
}

// Node types, with the pastel colors a flow-editor user would expect: inject blue-grey,
// function peach, switch and change yellow, debug green, network thistle, storage burlywood.
export const KINDS = {
  inject: { type: 'inject', color: '#a6bbcf', icon: 'inject', inputs: 0, outputs: 1 },
  debug: { type: 'debug', color: '#87a980', icon: 'debug', inputs: 1, outputs: 0 },
  function: { type: 'function', color: '#fdd0a2', icon: 'fn', inputs: 1, outputs: 1 },
  switch: { type: 'switch', color: '#e2d96e', icon: 'switch', inputs: 1, outputs: 1 },
  change: { type: 'change', color: '#e2d96e', icon: 'change', inputs: 1, outputs: 1 },
  join: { type: 'join', color: '#e2d96e', icon: 'join', inputs: 1, outputs: 1 },
  delay: { type: 'delay', color: '#e6e0f8', icon: 'clock', inputs: 1, outputs: 1 },
  linkOut: { type: 'link out', color: '#d9d9d9', icon: 'link', inputs: 1, outputs: 0 },
  linkIn: { type: 'link in', color: '#d9d9d9', icon: 'link', inputs: 0, outputs: 1 },
  sensor: { type: 'sensor in', color: '#a6bbcf', icon: 'wave', inputs: 0, outputs: 1 },
  gpioIn: { type: 'gpio in', color: '#a6bbcf', icon: 'pins', inputs: 0, outputs: 1 },
  gpioOut: { type: 'gpio out', color: '#87a980', icon: 'pins', inputs: 1, outputs: 1 },
  gsmOut: { type: 'gsm out', color: '#d8bfd8', icon: 'radio', inputs: 1, outputs: 0 },
  gsmIn: { type: 'gsm in', color: '#d8bfd8', icon: 'radio', inputs: 0, outputs: 1 },
  device: { type: 'device', color: '#fdd0a2', icon: 'chip', inputs: 1, outputs: 1 },
  db: { type: 'database', color: '#deb887', icon: 'db', inputs: 1, outputs: 1 },
  api: { type: 'http api', color: '#e7e7ae', icon: 'globe', inputs: 1, outputs: 3 },
  httpIn: { type: 'http in', color: '#e7e7ae', icon: 'globe', inputs: 0, outputs: 1 },
  http: { type: 'http request', color: '#e7e7ae', icon: 'globe', inputs: 1, outputs: 1 },
  app: { type: 'app', color: '#87a980', icon: 'phone', inputs: 1, outputs: 0 },
  web: { type: 'web app', color: '#87a980', icon: 'browser', inputs: 1, outputs: 0 },
  ai: { type: 'ai', color: '#ffc2b3', icon: 'spark', inputs: 1, outputs: 1 },
  project: { type: 'project', color: '#a6bbcf', icon: 'browser', inputs: 1, outputs: 1 },
  contrib: { type: 'contrib', color: '#d8bfd8', icon: 'npm', inputs: 1, outputs: 1 },
  degree: { type: 'degree', color: '#a6bbcf', icon: 'cap', inputs: 0, outputs: 1 },
  robot: { type: 'robot', color: '#fdd0a2', icon: 'robot', inputs: 1, outputs: 1 },
  award: { type: 'award', color: '#e2d96e', icon: 'trophy', inputs: 1, outputs: 1 },
  paper: { type: 'paper', color: '#d9d9d9', icon: 'doc', inputs: 1, outputs: 1 },
  template: { type: 'template', color: '#f3b567', icon: 'braces', inputs: 1, outputs: 1 },
  email: { type: 'email out', color: '#c7e9c0', icon: 'mail', inputs: 1, outputs: 0 },
  file: { type: 'file in', color: '#deb887', icon: 'doc', inputs: 1, outputs: 0 },
} satisfies Record<string, KindDef>;

export type Kind = keyof typeof KINDS;

export interface FlowNode {
  id: string;
  kind: Kind;
  label: string;
  x: number;
  y: number;
  color?: string;
  icon?: IconName;
  outputs?: number;
  status?: Status;
  /** Seconds the node holds each message before passing it on. */
  hold?: number;
  /** Source nodes fire on their own every `every` seconds once deployed, first after `first`. */
  every?: number;
  first?: number;
  /** Payloads a source sends, in turn. */
  emit?: Json[];
  topic?: string;
  /** For nodes with several outputs: which one a message leaves by. */
  route?: (msg: Msg) => number;
  set?: (payload: Json) => Json;
  /** Join this many messages into one array. */
  join?: number;
  info: NodeInfo;
}

export interface Wire {
  from: string;
  to: string;
  port: number;
  /** radio and link wires are virtual (dashed); feedback wires carry nothing. */
  kind?: 'radio' | 'link' | 'feedback';
}

export interface Group {
  label: string;
  nodes: string[];
  color: string;
}

export interface Flow {
  id: string;
  label: string;
  /** A one-line comment drawn on the canvas above the flow. */
  comment: string;
  nodes: FlowNode[];
  wires: Wire[];
  groups: Group[];
}

/* ------------------------------------------------------------------ helpers */

const w = (from: string, to: string, port = 0, kind?: Wire['kind']): Wire => ({
  from,
  to,
  port,
  kind,
});
const host = (url: string) => new URL(url).host.replace(/^www\./, '');
const site = (url: string): LinkItem => ({ label: host(url), url, kind: 'site' });
/** "linkedin.com/in/moe-babazadeh": a profile address without the scheme. */
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** "Compact PLC" → "compact PLC", but "ESP32 card reader" and "GSM weather station" stay. */
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
export const asObject = (p: Json): JsonObject =>
  p && typeof p === 'object' && !Array.isArray(p) ? p : {};

export const outputsOf = (n: FlowNode) => n.outputs ?? KINDS[n.kind].outputs;
export const inputsOf = (n: FlowNode) => KINDS[n.kind].inputs;
export const colorOf = (n: FlowNode) => n.color ?? KINDS[n.kind].color;
export const iconOf = (n: FlowNode) => n.icon ?? KINDS[n.kind].icon;
export const typeOf = (n: FlowNode) => KINDS[n.kind].type;

// Label widths in the node font (Manrope 600, 13px), close enough to size nodes without measuring.
const textW = (label: string) =>
  [...label].reduce(
    (w, c) =>
      w +
      (/[ilj.,:;'!|·\s()/-]/.test(c)
        ? 3.9
        : /[frtI1]/.test(c)
          ? 5
          : /[mwMW@]/.test(c)
            ? 11.5
            : /[A-Z0-9&#=]/.test(c)
              ? 8.6
              : 7.4),
    0,
  );

/** Node size on the canvas: labels set the width, outputs set the height. */
export const nodeW = (n: Pick<FlowNode, 'label'>) => Math.max(100, Math.round(62 + textW(n.label)));
export const nodeH = (n: FlowNode) => Math.max(30, outputsOf(n) * 13 + 6);

/** A Node-RED style 16-digit hex id, stable for a given seed. */
export function hexId(seed: string) {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    a = Math.imul(a ^ k, 2654435761);
    b = Math.imul(b ^ k, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0');
}

const PROJECTS = [...featuredProjects, ...otherProjects];
const storeLinks = (kind: 'appStore' | 'playStore'): LinkItem[] =>
  storeApps.map((p: db.Product) => ({
    label: `${p.title} · ${kind === 'appStore' ? 'App Store' : 'Google Play'}`,
    url: p.links[kind]!,
    kind: 'store',
  }));
const SITES = PROJECTS.filter((p) => p.links.external).map((p) => site(p.links.external!));
/** The year a build went out, from the archive. */
const builtIn = (title: string) => archive.find((a) => a.title === title)!.year;

/* ------------------------------------------------------------------ 1 · sensor → AI */

const MCUS = [PLC_MCU, reader.chip, beacon.chip];
const { niknam } = db.roles;
const pulse = products.pulseIot;

const STACK_FACTS: Json[] = [
  {
    device: logger.name,
    stations: logger.stations.short,
    online: `${logger.online.short} years`,
    uplink: 'GSM',
  },
  { sensor_records: logger.records.short, source: `${logger.name} fleet` },
  { devices_in_production: hardware.length, mcus: MCUS },
  { apps: storeApps.map((p) => p.title), stores: ['App Store', 'Google Play'] },
  { products_live: productsLive.short, [`commits_since_${commits.since}`]: commits.total.short },
  {
    role: current.title,
    company: current.company,
    ai: ['natural-language access to project data', 'early warning on schedule and cost risk'],
  },
  {
    building_since: person.since,
    path: ['robots', 'IoT and firmware', 'web', 'mobile', 'AI platforms'],
  },
];

const stack: Flow = {
  id: 'stack',
  label: 'sensor → AI',
  comment: 'one fact per message, from a sensor in the field to AI in the cloud',
  nodes: [
    {
      id: 'facts',
      kind: 'inject',
      label: 'facts',
      x: 40,
      y: 90,
      every: 3.4,
      first: 0.3,
      emit: STACK_FACTS,
      topic: 'stack',
      info: {
        title: 'facts',
        props: [
          ['Repeat', 'every 3.4 s'],
          ['Payload', `${STACK_FACTS.length} facts, in turn`],
          ['Topic', 'stack'],
        ],
        body: [
          'Sends one fact about the stack each time it fires. Each one runs the whole pipeline, from the sensors to the AI, and prints in the debug pane.',
          'Press the button on its left to inject one by hand.',
        ],
      },
    },
    {
      id: 'sensors',
      kind: 'sensor',
      label: 'sensors',
      x: 190,
      y: 90,
      status: { fill: 'green', text: 'several per station' },
      info: {
        title: 'Sensors',
        props: [
          [logger.name, 'several sensors per station'],
          [reader.name, 'NFC · RFID · BLE'],
          [beacon.name, 'BLE proximity'],
        ],
        body: [
          `Weather sensors on the ${logger.name} stations, and card readers and Bluetooth beacons on the ${attendum.title} devices at universities in the ${ATTENDUM_COUNTRIES}.`,
        ],
      },
    },
    {
      id: 'firmware',
      kind: 'device',
      label: 'firmware',
      x: 348,
      y: 90,
      status: { fill: 'green', text: 'Embedded C' },
      info: {
        title: 'Firmware',
        props: [
          ['Language', 'Embedded C'],
          ['MCUs', MCUS.join(' · ')],
          ['Updates', 'over the air (OTA, DFU)'],
        ],
        body: [
          `Firmware for ${fmt.spell(hardware.length)} devices in production: the ${logger.name} weather stations, the ${epc.name} ${lower(epc.kind)}, the ${plc.name} on ${PLC_MCU} microcontrollers, and the ${attendum.title} card reader (${reader.chip}) and beacon (${beacon.chip}).`,
        ],
      },
    },
    {
      id: 'gsmOut',
      kind: 'gsmOut',
      label: 'GSM out',
      x: 514,
      y: 90,
      status: { fill: 'green', text: 'connected' },
      info: {
        title: 'GSM uplink',
        props: [
          ['Stations', logger.stations.short],
          ['Online', `${logger.online.short} years`],
          ['Records', logger.records.short],
        ],
        body: [
          `Every ${logger.name} station sends its logs home over GSM. The link has no wire, so the editor draws it dashed.`,
        ],
      },
    },
    {
      id: 'gsmIn',
      kind: 'gsmIn',
      label: 'GSM in',
      x: 40,
      y: 290,
      status: { fill: 'green', text: `${logger.online.short} years online` },
      info: {
        title: 'GSM in',
        props: [
          ['From', `${logger.stations.short} ${logger.name} stations`],
          ['Since', `${logger.online.short} years`],
        ],
        body: ['The home end of the link, where the station logs arrive.'],
      },
    },
    {
      id: 'ingest',
      kind: 'function',
      label: 'ingest',
      x: 191,
      y: 290,
      status: { fill: 'green', text: `${niknam.short} · ${pulse.title}` },
      info: {
        title: 'Ingest',
        props: [
          [fmt.yearSpan(niknam.from, niknam.to, ' – '), niknam.org],
          [builtIn(pulse.title), pulse.title],
        ],
        body: [
          `At ${niknam.org} I built IoT platforms and connected systems for monitoring, tracking and data visualisation, and tied hardware into GPS and mapping for live tracking.`,
          `${pulse.title} does it on plain shared PHP hosting: ingest, rollups, alarms with hysteresis, OTA firmware and reports, with no build step.`,
        ],
      },
    },
    {
      id: 'db',
      kind: 'db',
      label: 'telemetry',
      x: 342,
      y: 290,
      status: { fill: 'green', text: `${logger.records.short} records` },
      info: {
        title: 'Telemetry store',
        props: [
          ['Records', logger.records.short],
          ['Engines', 'PostgreSQL · MySQL'],
          ['Vectors', `pgvector, on ${smartclaim.title}`],
        ],
        body: [`${cap(logger.records.long)} sensor records logged by the ${logger.name} fleet.`],
      },
    },
    {
      id: 'apis',
      kind: 'api',
      label: 'APIs',
      x: 515,
      y: 283,
      route: (m) => m.seq % 3,
      status: { fill: 'green', text: 'Laravel · FastAPI' },
      info: {
        title: 'APIs',
        props: [
          ['Laravel', `${neurobuild.title}, on Laravel Vapor`],
          ['FastAPI', `${smartclaim.title}, with pgvector`],
          ['Routing', 'one output per message, in turn'],
        ],
        body: [
          `${neurobuild.title} runs on Next.js and Laravel, hosted on AWS Amplify and Laravel Vapor, with a permission check on every API route, audit trails, and production alarms and GuardDuty alerts kept in infrastructure as code.`,
        ],
      },
    },
    {
      id: 'ios',
      kind: 'app',
      label: 'iOS',
      x: 675,
      y: 230,
      status: { fill: 'green', text: `${storeApps.length} apps` },
      info: {
        title: 'iOS',
        body: [
          `${fmt.Spell(storeApps.length)} React Native apps on the App Store, built with Expo.`,
        ],
        links: storeLinks('appStore'),
      },
    },
    {
      id: 'android',
      kind: 'app',
      label: 'Android',
      x: 675,
      y: 290,
      status: { fill: 'green', text: `${storeApps.length} apps` },
      info: {
        title: 'Android',
        body: [`The same ${fmt.spell(storeApps.length)} apps on Google Play.`],
        links: storeLinks('playStore'),
      },
    },
    {
      id: 'web',
      kind: 'web',
      label: 'web',
      x: 675,
      y: 350,
      status: { fill: 'green', text: `${productsLive.short} live` },
      info: {
        title: 'Web',
        body: [
          `Platforms, dashboards and product sites, mostly React and Next.js. More than ${fmt.spell(productsLive.n)} products live.`,
        ],
        links: SITES,
      },
    },
    {
      id: 'ai',
      kind: 'ai',
      label: 'AI',
      x: 515,
      y: 470,
      status: { fill: 'blue', text: 'early warning' },
      info: {
        title: 'AI',
        props: [
          ['At', current.company],
          ['Asks', 'natural-language access to project data'],
          ['Warns', 'schedule and cost risk, early'],
        ],
        body: [
          `At ${current.company} I’m bringing AI into the platform construction enterprises plan with.`,
          `Also ${smartclaim.title}, AI-assisted R&D tax credit claims on FastAPI, OpenAI and pgvector. Earlier, identity checks during live exams with the Azure Face API for ${activeClass.title}.`,
        ],
      },
    },
    {
      id: 'out',
      kind: 'debug',
      label: 'msg.payload',
      x: 665,
      y: 470,
      info: {
        title: 'debug',
        props: [
          ['Output', 'msg.payload'],
          ['To', 'debug pane'],
        ],
        body: [
          'Prints every message that reaches it in the debug pane. The button on its right turns it off.',
        ],
      },
    },
  ],
  wires: [
    w('facts', 'sensors'),
    w('sensors', 'firmware'),
    w('firmware', 'gsmOut'),
    w('gsmOut', 'gsmIn', 0, 'radio'),
    w('gsmIn', 'ingest'),
    w('ingest', 'db'),
    w('db', 'apis'),
    w('db', 'ai'),
    w('apis', 'ios', 0),
    w('apis', 'android', 1),
    w('apis', 'web', 2),
    w('ai', 'out'),
  ],
  groups: [
    {
      label: 'field · sensors and firmware',
      nodes: ['facts', 'sensors', 'firmware', 'gsmOut'],
      color: '#a6bbcf',
    },
    {
      label: 'home · ingest, store, serve',
      nodes: ['gsmIn', 'ingest', 'db', 'apis'],
      color: '#fdd0a2',
    },
    { label: 'apps', nodes: ['ios', 'android', 'web'], color: '#87a980' },
    { label: 'AI', nodes: ['ai', 'out'], color: '#ffc2b3' },
  ],
};

/* ------------------------------------------------------------------ 2 · career */

// Every role is a delay node that holds the message as long as I held the job.
export const YEAR_S = 0.32;

function roleNode(
  id: db.RoleId,
  x: number,
  y: number,
  opts: { end?: number; title?: string } = {},
): FlowNode {
  const r = roles.find((it) => it.id === id)!;
  const role: db.Role = db.roles[id];
  const company = role.short ?? role.org;
  const job = jobs.find((j) => j.company === company)!;
  const years = (opts.end ?? r.end ?? NOW) - r.start;
  const hold = Math.max(0.3, years * YEAR_S);
  const title = opts.title ?? r.title;
  return {
    id,
    kind: 'delay',
    label: company,
    x,
    y,
    hold,
    status: { fill: r.end ? 'grey' : 'green', ring: !!r.end, text: r.range },
    set: (p) => {
      const o = asObject(p);
      const list = Array.isArray(o.roles) ? o.roles : [];
      return {
        ...o,
        title,
        org: r.org,
        roles: [...list, { org: r.org, title: r.title, range: r.range }],
      };
    },
    info: {
      title: `${job.title}, ${r.org}`,
      props: [
        ['Title', r.title],
        ['Dates', job.range],
        ['Delay', `${years.toFixed(1)} years → ${hold.toFixed(1)} s`],
      ],
      bullets: job.duties,
      links: job.url ? [site(job.url)] : undefined,
    },
  };
}

const started = db.roles.freelance.from;
// The second row starts with the role that started in this year.
const ROW_TWO = String(db.roles.zeroone.from.y);
const { previous } = current;
const yearsBefore = fmt.spell(Math.floor(fmt.monthsBetween(previous.from, current.since) / 12));

const career: Flow = {
  id: 'career',
  label: 'career',
  comment: 'each role is a delay node: the message waits as long as I held the job',
  nodes: [
    {
      id: 'start',
      kind: 'inject',
      label: fmt.mon(started),
      x: 40,
      y: 120,
      every: 13,
      first: 1.2,
      topic: 'career',
      emit: [{ name: profile.name, since: fmt.month(started), roles: [] }],
      info: {
        title: fmt.mon(started),
        props: [
          ['Repeat', 'every 13 s'],
          ['Payload', `{ name: "${profile.name}" }`],
        ],
        body: [
          'The first website, built as a freelancer. Each run walks the whole career, one delay node per role.',
        ],
      },
    },
    roleNode('freelance', 196, 120),
    roleNode('niknam', 359, 120),
    roleNode('alget', 500, 120),
    {
      id: 'toRow2',
      kind: 'linkOut',
      label: ROW_TWO,
      x: 656,
      y: 120,
      info: {
        title: `link out · ${ROW_TWO}`,
        body: [
          'A link node: it hands the message to the link in node of the same name, so the flow can continue on the next row.',
        ],
      },
    },
    {
      id: 'fromRow1',
      kind: 'linkIn',
      label: ROW_TWO,
      x: 40,
      y: 320,
      info: { title: `link in · ${ROW_TWO}`, body: ['Picks up where the first row left off.'] },
    },
    roleNode('zeroone', 180, 320),
    roleNode('neuroject', 320, 320, { end: fmt.frac(current.since), title: previous.title }),
    {
      id: 'cto',
      kind: 'change',
      label: `title = ${current.title}`,
      x: 493,
      y: 284,
      set: (p) => ({ ...asObject(p), title: current.title, since: fmt.month(current.since) }),
      status: { fill: 'green', text: `since ${fmt.mon(current.since)}` },
      info: {
        title: `set title = ${current.title}`,
        props: [
          ['Rule', 'set msg.payload.title'],
          ['To', `"${current.title}"`],
          ['When', fmt.month(current.since)],
        ],
        body: [
          `${current.title} since ${fmt.month(current.since)}, after ${yearsBefore} years as ${previous.title}.`,
        ],
      },
    },
    roleNode('neuroship', 493, 356),
    {
      id: 'now',
      kind: 'debug',
      label: 'msg.payload',
      x: 680,
      y: 320,
      info: {
        title: 'debug',
        props: [['Output', 'msg.payload']],
        body: ['Prints the career so far, with every role it passed through.'],
      },
    },
  ],
  wires: [
    w('start', 'freelance'),
    w('freelance', 'niknam'),
    w('niknam', 'alget'),
    w('alget', 'toRow2'),
    w('toRow2', 'fromRow1', 0, 'link'),
    w('fromRow1', 'zeroone'),
    w('zeroone', 'neuroject'),
    w('neuroject', 'cto'),
    w('neuroject', 'neuroship'),
    w('cto', 'now'),
    w('neuroship', 'now'),
  ],
  groups: [
    {
      label: `${person.since} → ${ROW_TWO} · web, then IoT`,
      nodes: ['start', 'freelance', 'niknam', 'alget', 'toRow2'],
      color: '#a6bbcf',
    },
    {
      label: `${ROW_TWO} → now · lead, chief, ${current.title}`,
      nodes: ['zeroone', 'neuroject', 'cto', 'neuroship', 'now'],
      color: '#ff6b4a',
    },
  ],
};

/* ------------------------------------------------------------------ 3 · platforms */

const PLATFORM_GROUPS: { label: string; color: string; icon: IconName; items: db.Product[] }[] = [
  { label: 'AI platforms', color: '#ffc2b3', icon: 'spark', items: [neurobuild, smartclaim] },
  { label: 'mobile · both stores', color: '#a6bbcf', icon: 'phone', items: storeApps },
  {
    label: 'education · web',
    color: '#fdd0a2',
    icon: 'browser',
    items: [activeClass, products.schoolHow, products.learningKit, products.examKit],
  },
  { label: 'personal', color: '#d8bfd8', icon: 'braces', items: [pulse, products.photoDedup] },
];

const PLATFORM_STATUS: Record<string, string> = {
  [pulse.title]: 'PHP 8 · no build step',
  [products.photoDedup.title]: 'macOS · offline',
};

const platformNodes: FlowNode[] = [];
const platformEmit: Json[] = [];
{
  let y = 60;
  PLATFORM_GROUPS.forEach((g, gi) => {
    if (gi) y += 46;
    for (const p of g.items) {
      const { title, image } = p;
      const payload: JsonObject = { title };
      if (p.links.external) payload.live = host(p.links.external);
      if (p.links.appStore) payload.stores = ['App Store', 'Google Play'];
      payload.stack = p.tech;
      platformEmit.push(payload);
      platformNodes.push({
        id: `p${platformNodes.length}`,
        kind: 'project',
        label: title,
        x: 420,
        y,
        color: g.color,
        icon: g.icon,
        hold: 0.25,
        status: {
          fill: 'green',
          text: p.links.appStore
            ? 'iOS · Android'
            : p.links.external
              ? host(p.links.external)
              : (PLATFORM_STATUS[title] ?? 'live'),
        },
        info: { title, image, body: [p.description], tags: p.tech, links: projectLinks(p.links) },
      });
      y += 52;
    }
  });
}

const platforms: Flow = {
  id: 'platforms',
  label: 'platforms',
  comment: 'one request per product, routed by msg.topic',
  nodes: [
    {
      id: 'req',
      kind: 'httpIn',
      label: 'GET /shipped',
      x: 40,
      y: 363,
      every: 2.8,
      first: 0.8,
      emit: platformEmit,
      topic: 'shipped',
      info: {
        title: 'http in · GET /shipped',
        props: [
          ['Method', 'GET'],
          ['URL', '/shipped'],
        ],
        body: [
          'A simulated request every few seconds asks for one product. The switch sends it to the right node.',
        ],
      },
    },
    {
      id: 'by',
      kind: 'switch',
      label: 'msg.topic',
      x: 232,
      y: 310,
      outputs: platformNodes.length,
      route: (m) => m.seq % platformNodes.length,
      info: {
        title: 'switch · by product',
        props: platformNodes.map((n, i) => [`${i + 1}`, `== "${n.label}"`]),
        body: [
          `Routes each request to one of ${fmt.spell(platformNodes.length)} outputs, one per product.`,
        ],
      },
    },
    ...platformNodes,
    {
      id: 'res',
      kind: 'debug',
      label: 'msg.payload',
      x: 650,
      y: 363,
      info: {
        title: 'debug',
        props: [['Output', 'msg.payload']],
        body: ['Prints each product as it is served: where it lives and what it is built with.'],
      },
    },
  ],
  wires: [w('req', 'by'), ...platformNodes.flatMap((n, i) => [w('by', n.id, i), w(n.id, 'res')])],
  groups: PLATFORM_GROUPS.map((g) => ({
    label: g.label,
    color: g.color,
    nodes: platformNodes.filter((n) => g.items.some((p) => p.title === n.label)).map((n) => n.id),
  })),
};

/* ------------------------------------------------------------------ 4 · hardware */

const device = (tag: string) => hardware.find((d) => d.tag === tag)!;
const devicePayload = (d: Device): Json => ({
  tag: d.tag,
  name: d.name,
  kind: d.kind,
  figures: d.figures,
});
const deviceInfo = (d: Device, extra: Partial<NodeInfo> = {}): NodeInfo => ({
  title: `${d.name} · ${d.tag}`,
  props: [
    ['Tag', d.tag],
    ['Type', d.kind],
  ],
  body: [d.detail],
  tags: d.figures,
  ...extra,
});
const groupOf = (d: Device) => `${d.tag} · ${lower(d.kind)}`;

interface HwRow {
  key: string;
  group: string;
  src: [string, Kind, Status?];
  dev: [string, Status?];
  dst: [string, Kind, Status?];
  payload: Json;
  info: NodeInfo;
  srcInfo: NodeInfo;
  dstInfo: NodeInfo;
}

const [LG, EPC, PLC, AT1, AT2] = [logger, epc, plc, reader, beacon].map((d) => device(d.tag));
const keypad = products.matrixKeypad;

const HW_ROWS: HwRow[] = [
  {
    key: 'lg',
    group: groupOf(LG),
    src: ['weather sensors', 'sensor', { fill: 'green', text: 'several per station' }],
    dev: [`${LG.tag} ${LG.name}`, { fill: 'green', text: `${logger.stations.short} stations` }],
    dst: ['GSM uplink', 'gsmOut', { fill: 'green', text: `${logger.online.short} years online` }],
    payload: devicePayload(LG),
    info: deviceInfo(LG, { image: products.logger.image }),
    srcInfo: {
      title: 'Weather sensors',
      body: [`Several sensors on every ${logger.name} station.`],
    },
    dstInfo: {
      title: 'GSM uplink',
      body: [
        `Logs go home over GSM. The fleet has been online for ${logger.online.long} years and logged ${logger.records.long} records.`,
      ],
    },
  },
  {
    key: 'epc',
    group: groupOf(EPC),
    src: ['pressure · flow', 'sensor'],
    dev: [EPC.tag, { fill: 'green', text: 'in production' }],
    dst: ['setpoint', 'gpioOut', { fill: 'green', ring: true, text: 'held' }],
    payload: devicePayload(EPC),
    info: deviceInfo(EPC),
    srcInfo: {
      title: 'Pressure and flow',
      body: [
        `What the ${epc.name} measures. The dashed wire closes the loop: the output is measured again.`,
      ],
    },
    dstInfo: {
      title: 'Setpoint',
      body: [`The ${epc.name} holds pressure and flow at their setpoints.`],
    },
  },
  {
    key: 'plc',
    group: groupOf(PLC),
    src: ['inputs', 'gpioIn'],
    dev: [PLC.name, { fill: 'green', text: `${PLC_MCU} · in production` }],
    dst: ['outputs', 'gpioOut'],
    payload: devicePayload(PLC),
    info: deviceInfo(PLC),
    srcInfo: { title: 'Inputs', body: [`Inputs into the ${plc.name}.`] },
    dstInfo: { title: 'Outputs', body: ['What the PLC drives, on a small footprint.'] },
  },
  {
    key: 'at1',
    group: groupOf(AT1),
    src: ['NFC · RFID · BLE', 'sensor'],
    dev: [`${AT1.tag} reader`, { fill: 'green', text: `battery ~${reader.batteryMonths} months` }],
    dst: [
      attendum.title,
      'http',
      { fill: 'green', text: `${reader.fleet.online.short} devices online` },
    ],
    payload: devicePayload(AT1),
    info: deviceInfo(AT1, { links: projectLinks(attendum.links) }),
    srcInfo: { title: 'NFC · RFID · BLE', body: ['A student taps a card or phone on the reader.'] },
    dstInfo: {
      title: attendum.title,
      body: [attendum.description],
      links: projectLinks(attendum.links),
    },
  },
  {
    key: 'at2',
    group: groupOf(AT2),
    src: ['BLE proximity', 'sensor'],
    dev: [`${AT2.tag} beacon`, { fill: 'green', text: 'DFU over the air' }],
    dst: ['check-in', 'http'],
    payload: devicePayload(AT2),
    info: deviceInfo(AT2, { links: projectLinks(attendum.links) }),
    srcInfo: { title: 'BLE proximity', body: ['A phone comes within range of the beacon.'] },
    dstInfo: {
      title: 'Check-in',
      body: [`Bluetooth proximity check-in, in the ${attendum.title} app.`],
      links: projectLinks(attendum.links),
    },
  },
  {
    key: 'kp',
    group: `${keypad.title} · open source`,
    src: ['matrix keypad', 'gpioIn'],
    dev: ['keypad task', { fill: 'green', text: 'FreeRTOS' }],
    dst: ['key events', 'function'],
    payload: {
      repo: `${person.githubUser}/${keypad.title}`,
      tech: keypad.tech,
      features: ['debouncing', 'configurable layouts', 'pin maps'],
    },
    info: {
      title: keypad.title,
      body: [keypad.description],
      tags: keypad.tech,
      links: projectLinks(keypad.links),
    },
    srcInfo: { title: 'Matrix keypad', body: ['Rows and columns, scanned as a FreeRTOS task.'] },
    dstInfo: { title: 'Key events', body: ['Debounced key presses, ready for the application.'] },
  },
];

const hwNodes: FlowNode[] = HW_ROWS.flatMap((r, i): FlowNode[] => {
  const y = 70 + i * 96;
  return [
    {
      id: `${r.key}Src`,
      kind: r.src[1],
      label: r.src[0],
      x: 40,
      y,
      status: r.src[2],
      every: 12,
      first: 0.8 + i * 1.9,
      emit: [r.payload],
      topic: r.group.split(' ')[0],
      info: r.srcInfo,
    },
    {
      id: `${r.key}Dev`,
      kind: 'device',
      label: r.dev[0],
      x: 250,
      y,
      status: r.dev[1],
      hold: 0.35,
      info: r.info,
    },
    {
      id: `${r.key}Dst`,
      kind: r.dst[1],
      label: r.dst[0],
      x: 450,
      y,
      status: r.dst[2],
      outputs: 1,
      info: r.dstInfo,
    },
  ];
});

const hwFlow: Flow = {
  id: 'hardware',
  label: 'hardware',
  comment: `${fmt.spell(hardware.length)} devices in production, and a FreeRTOS keypad library`,
  nodes: [
    ...hwNodes,
    {
      id: 'fleet',
      kind: 'debug',
      label: 'msg.payload',
      x: 660,
      y: 310,
      info: {
        title: 'debug · fleet',
        props: [['Output', 'msg.payload']],
        body: ['Prints a report from each device as it comes in.'],
      },
    },
  ],
  wires: [
    ...HW_ROWS.flatMap((r) => [
      w(`${r.key}Src`, `${r.key}Dev`),
      w(`${r.key}Dev`, `${r.key}Dst`),
      w(`${r.key}Dst`, 'fleet'),
    ]),
    w('epcDst', 'epcDev', 0, 'feedback'),
  ],
  groups: HW_ROWS.map((r) => ({
    label: r.group,
    nodes: [`${r.key}Src`, `${r.key}Dev`, `${r.key}Dst`],
    color: r.key === 'kp' ? '#d8bfd8' : '#87a980',
  })),
};

/* ------------------------------------------------------------------ 5 · open source */

const repoLabel = (repo: string) =>
  repo === db.contributions.nanostores.repo ? repo : repo.split('/')[1];
const prNumber = (url: string) => `#${url.split('/').pop()}`;

const contribNodes: FlowNode[] = oss.map((c, i) => ({
  id: `c${i}`,
  kind: 'contrib',
  label: repoLabel(c.repo),
  x: 372,
  y: 50 + i * 70,
  hold: 0.3,
  status: { fill: 'green', text: `★ ${c.stars} · ${c.weekly}/wk` },
  info: {
    title: c.repo,
    props: [
      ['Pull request', prNumber(c.url)],
      ['Year', String(c.year)],
      ['Kind', c.kind],
      ['Stars', `★ ${c.stars}`],
      ['Downloads', `${c.weekly} a week`],
    ],
    body: [c.change, c.impact],
    links: [{ label: `Pull request ${prNumber(c.url)}`, url: c.url, kind: 'code' }],
  },
}));

const ossFlow: Flow = {
  id: 'oss',
  label: 'open source',
  comment: 'fixes merged upstream, with their reach on npm',
  nodes: [
    {
      id: 'push',
      kind: 'inject',
      label: 'git push',
      x: 40,
      y: 190,
      every: 3.6,
      first: 0.6,
      topic: 'upstream',
      emit: oss.map((c) => ({
        repo: c.repo,
        pr: prNumber(c.url),
        year: c.year,
        kind: c.kind,
        fix: c.change,
        stars: c.stars,
        weekly_downloads: c.weekly,
      })),
      info: {
        title: 'git push',
        props: [
          ['Repeat', 'every 3.6 s'],
          ['Payload', `${oss.length} merged pull requests, in turn`],
        ],
        body: ['Replays the fixes I got merged upstream, one at a time.'],
      },
    },
    {
      id: 'byRepo',
      kind: 'switch',
      label: 'msg.repo',
      x: 206,
      y: 170,
      outputs: oss.length,
      route: (m) => m.seq % oss.length,
      info: {
        title: 'switch · by repo',
        props: oss.map((c, i) => [`${i + 1}`, `== "${c.repo}"`]),
        body: ['One output per repository.'],
      },
    },
    ...contribNodes,
    {
      id: 'merged',
      kind: 'debug',
      label: 'msg.payload',
      x: 700,
      y: 190,
      info: {
        title: 'debug',
        props: [['Output', 'msg.payload']],
        body: ['Prints each merged fix with its reach.'],
      },
    },
  ],
  wires: [
    w('push', 'byRepo'),
    ...contribNodes.flatMap((n, i) => [w('byRepo', n.id, i), w(n.id, 'merged')]),
  ],
  groups: [
    {
      label: `merged upstream · ${downloads.weekly.short} weekly downloads`,
      nodes: contribNodes.map((n) => n.id),
      color: '#d8bfd8',
    },
  ],
};

/* ------------------------------------------------------------------ 6 · roots */

const [bsc, ssl, robocup, skillsMedal, msc, paper] = roots;
const record = (r: (typeof roots)[number]): Json => ({
  year: r.year,
  title: r.title,
  detail: r.detail,
});
const edu = db.education;
const award = db.awards.robocup;
const arxiv = db.papers.inverter;
const arxivId = `${arxiv.venue}:${arxiv.id}`;
const thesisYear = String(edu.bsc.to.y);
/** "Control Systems" → "control": a field's first word, for a node label. */
const firstWord = (s: string) => s.split(' ')[0].toLowerCase();

const FAN: { id: string; kind: Kind; label: string; payload: Json; info: NodeInfo }[] = [
  {
    id: 'ssl',
    kind: 'robot',
    label: 'SSL soccer robots',
    payload: record(ssl),
    info: { title: ssl.title, props: [['Years', ssl.year]], body: [ssl.detail] },
  },
  {
    id: 'robocup',
    kind: 'award',
    label: award.event,
    payload: record(robocup),
    // "1st place" reads as "First place" at the start of a sentence.
    info: {
      title: robocup.title,
      props: [
        ['Year', robocup.year],
        ['Challenge', award.challenge],
      ],
      body: [`${award.place.replace(/^1st\b/, 'First')} at ${award.event} ${award.year}.`],
    },
  },
  {
    id: 'medal',
    kind: 'award',
    label: `Skills ${db.awards.skills.place}`,
    payload: record(skillsMedal),
    info: {
      title: skillsMedal.title,
      props: [
        ['Year', skillsMedal.year],
        ['Category', skillsMedal.detail],
      ],
    },
  },
  {
    id: 'balance',
    kind: 'robot',
    label: 'self-balancing robot',
    payload: {
      year: thesisYear,
      title: 'Self-balancing robot',
      detail: `${edu.bsc.degree} thesis: real-time fuzzy control`,
    },
    info: {
      title: 'Self-balancing robot',
      props: [
        ['Year', thesisYear],
        ['Control', 'real-time fuzzy'],
      ],
      body: [`My ${edu.bsc.degree} thesis: ${edu.bsc.thesis}.`],
    },
  },
  {
    id: 'pipe',
    kind: 'robot',
    label: 'pipe inspection robot',
    payload: { title: 'Pipe inspection robot', area: 'Robotics' },
    info: {
      title: 'Pipe inspection robot',
      body: ['A pipe inspection robot, from the robotics work.'],
    },
  },
];

const rootsFlow: Flow = {
  id: 'roots',
  label: 'roots',
  comment: `control systems first: ${fmt.spell(FAN.length)} robotics results joined into one array`,
  nodes: [
    {
      id: 'bsc',
      kind: 'degree',
      label: `${edu.bsc.degree} · ${firstWord(edu.bsc.focus)}`,
      x: 40,
      y: 160,
      every: 9,
      first: 1,
      emit: [{ degree: bsc.title, at: edu.bsc.school, years: bsc.year }],
      topic: edu.bsc.degree,
      info: {
        title: bsc.title,
        props: [
          ['Years', bsc.year],
          ['Where', edu.bsc.school],
        ],
        body: [bsc.detail],
      },
    },
    ...FAN.map((f, i): FlowNode => ({
      id: f.id,
      kind: f.kind,
      label: f.label,
      x: 240,
      y: 50 + i * 55,
      hold: 0.25,
      set: () => f.payload,
      info: f.info,
    })),
    {
      id: 'join',
      kind: 'join',
      label: `join · ${FAN.length}`,
      x: 510,
      y: 160,
      join: FAN.length,
      status: { fill: 'blue', ring: true, text: `${FAN.length} parts → array` },
      info: {
        title: 'join',
        props: [
          ['Mode', 'manual'],
          ['Count', String(FAN.length)],
          ['Output', 'array'],
        ],
        body: [
          `Waits for all ${fmt.spell(FAN.length)} robotics messages, then sends them on as one array.`,
        ],
      },
    },
    {
      id: 'bscOut',
      kind: 'debug',
      label: 'msg.payload',
      x: 666,
      y: 160,
      info: { title: 'debug', props: [['Output', 'msg.payload']] },
    },
    {
      id: 'msc',
      kind: 'degree',
      label: `${edu.msc.degree} · ${firstWord(edu.msc.field)}`,
      x: 40,
      y: 410,
      every: 9,
      first: 4.5,
      topic: edu.msc.degree,
      emit: [{ degree: msc.title, at: edu.msc.school, years: msc.year, thesis: edu.msc.thesis }],
      info: {
        title: msc.title,
        props: [
          ['Years', msc.year],
          ['Where', edu.msc.school],
        ],
        body: [msc.detail],
      },
    },
    {
      id: 'paper',
      kind: 'paper',
      label: `${arxiv.venue} paper`,
      x: 240,
      y: 410,
      hold: 0.3,
      set: (p) => ({
        ...asObject(p),
        paper: { year: arxiv.date.y, title: paper.detail, url: paper.url ?? null },
      }),
      status: { fill: 'green', text: arxivId },
      info: {
        title: paper.title,
        props: [
          ['Year', paper.year],
          ['ID', arxivId],
        ],
        body: [paper.detail],
        links: paper.url ? [{ label: bare(paper.url), url: paper.url, kind: 'site' }] : undefined,
      },
    },
    {
      id: 'mscOut',
      kind: 'debug',
      label: 'msg.payload',
      x: 666,
      y: 410,
      info: { title: 'debug', props: [['Output', 'msg.payload']] },
    },
  ],
  wires: [
    ...FAN.flatMap((f) => [w('bsc', f.id), w(f.id, 'join')]),
    w('join', 'bscOut'),
    w('msc', 'paper'),
    w('paper', 'mscOut'),
  ],
  groups: [
    {
      label: `${edu.bsc.degree} · ${edu.bsc.school} · ${bsc.year}`,
      nodes: ['bsc', ...FAN.map((f) => f.id), 'join', 'bscOut'],
      color: '#a6bbcf',
    },
    {
      label: `${edu.msc.degree} · ${edu.msc.school} · ${msc.year}`,
      nodes: ['msc', 'paper', 'mscOut'],
      color: '#d8bfd8',
    },
  ],
};

/* ------------------------------------------------------------------ 7 · contact */

export const HELLO = {
  to: profile.email,
  subject: `Hello from ${person.site}`,
} satisfies JsonObject;
/** The CV's file name, "resume.pdf". */
export const CV_FILE = profile.cv.split('/').pop()!;

const contact: Flow = {
  id: 'contact',
  label: 'contact',
  comment: 'write a note in the info pane and press Send: it runs through this flow',
  nodes: [
    {
      id: 'hello',
      kind: 'inject',
      label: 'hello',
      x: 40,
      y: 110,
      every: 8,
      first: 2,
      emit: [HELLO],
      topic: 'contact',
      info: {
        title: 'hello',
        props: [
          ['Repeat', 'every 8 s'],
          ['Payload', `{ to: "${profile.email}" }`],
        ],
        body: [
          'Write a note in the info pane and press Send: it runs through this flow and opens in your mail app.',
        ],
      },
    },
    {
      id: 'note',
      kind: 'template',
      label: 'your note',
      x: 190,
      y: 110,
      hold: 0.3,
      set: (p) => {
        const o = asObject(p);
        return {
          ...o,
          body:
            typeof o.body === 'string' && o.body
              ? o.body
              : `Hi ${person.first}, I’m building … and could use a hand.`,
        };
      },
      info: {
        title: 'template',
        props: [
          ['Format', 'plain text'],
          ['Template', `Hi ${person.first}, {{payload.body}}`],
        ],
        body: ['Fills in the email body.'],
      },
    },
    {
      id: 'mail',
      kind: 'email',
      label: profile.email,
      x: 363,
      y: 110,
      status: { fill: 'green', text: 'ready' },
      info: {
        title: 'email out',
        props: [['To', profile.email]],
        body: ['Tell me what you’re building: a platform, a device or a team.'],
        links: [{ label: profile.email, url: `mailto:${profile.email}`, kind: 'site' }],
      },
    },
    {
      id: 'tap',
      kind: 'debug',
      label: 'msg.payload',
      x: 363,
      y: 190,
      info: { title: 'debug', props: [['Output', 'msg.payload']] },
    },
    {
      id: 'connect',
      kind: 'inject',
      label: 'connect',
      x: 40,
      y: 330,
      every: 11,
      first: 5,
      topic: 'links',
      emit: [{ linkedin: profile.linkedin, github: profile.github, cv: profile.cv }],
      info: { title: 'connect', body: ['Everywhere else you can find me.'] },
    },
    {
      id: 'li',
      kind: 'http',
      label: 'LinkedIn',
      x: 198,
      y: 270,
      outputs: 0,
      status: { fill: 'green', text: bare(profile.linkedin).split('/').pop()! },
      info: {
        title: 'LinkedIn',
        props: [['GET', profile.linkedin]],
        links: [{ label: bare(profile.linkedin), url: profile.linkedin, kind: 'site' }],
      },
    },
    {
      id: 'gh',
      kind: 'http',
      label: 'GitHub',
      x: 198,
      y: 330,
      outputs: 0,
      status: { fill: 'green', text: person.githubUser },
      info: {
        title: 'GitHub',
        props: [['GET', profile.github]],
        links: [{ label: bare(profile.github), url: profile.github, kind: 'code' }],
      },
    },
    {
      id: 'cv',
      kind: 'file',
      label: CV_FILE,
      x: 198,
      y: 390,
      status: { fill: 'green', text: 'CV' },
      info: {
        title: `file in · ${CV_FILE}`,
        props: [['Path', profile.cv]],
        links: [{ label: CV_FILE, url: profile.cv, kind: 'site' }],
      },
    },
  ],
  wires: [
    w('hello', 'note'),
    w('note', 'mail'),
    w('note', 'tap'),
    w('connect', 'li'),
    w('connect', 'gh'),
    w('connect', 'cv'),
  ],
  groups: [
    { label: 'write to me', nodes: ['hello', 'note', 'mail', 'tap'], color: '#c7e9c0' },
    { label: 'elsewhere', nodes: ['connect', 'li', 'gh', 'cv'], color: '#e7e7ae' },
  ],
};

export const FLOWS: Flow[] = [stack, career, platforms, hwFlow, ossFlow, rootsFlow, contact];
export const FLOW_MAP = new Map(FLOWS.map((f) => [f.id, f]));
export const NODE_COUNT = FLOWS.reduce((n, f) => n + f.nodes.length, 0);
