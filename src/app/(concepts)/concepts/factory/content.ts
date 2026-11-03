// What each building in the factory stands for, from the shared data. Nothing here is new:
// descriptions, links and figures come from db.

import { db, fmt } from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';
import { RECIPES, type ItemId, type PartId, type ProductId } from './items';
import type { DockId } from './world';

export interface ProductInfo {
  id: ProductId;
  title: string;
  description: string;
  tech: string[];
  links: LinkItem[];
  image?: string;
  figures?: { caption: string; items: string[] };
  note?: string;
  docks: DockId[];
}

const { neurobuild, smartclaim, attendum, educationGuide, logger } = db.products;
const { epc, plc } = db.devices;
const { fleet } = db.devices.attendumReader;

/** The save file's name: "moe-babazadeh". */
export const SAVE = db.person.name.toLowerCase().replace(/\s+/g, '-');

const info = (
  id: ProductId,
  p: db.Product,
  docks: DockId[],
  extra: Partial<ProductInfo> = {},
): ProductInfo => ({
  id,
  title: p.title,
  description: p.description,
  tech: p.tech,
  links: projectLinks(p.links),
  image: p.image,
  docks,
  ...extra,
});

export const PRODUCT_INFO: Record<ProductId, ProductInfo> = {
  nb: info('nb', neurobuild, ['web'], {
    note: db.roles.neuroject.duties[2],
  }),
  sc: info('sc', smartclaim, ['web']),
  at: info('at', attendum, ['appstore', 'play', 'field'], {
    figures: {
      caption: `At ${fleet.scope}`,
      items: [
        `${fleet.online.short} devices online`,
        `${fleet.records.short} records in ${fmt.spell(fleet.recordYears)} years`,
        `${fleet.classrooms.short} classrooms`,
        `${fleet.classes.short} classes`,
      ],
    },
  }),
  eg: info('eg', educationGuide, ['appstore', 'play']),
  lg: info('lg', logger, ['field'], {
    figures: { caption: 'The fleet', items: db.deviceFigures('logger') },
  }),
};

/** Which products each part ends up in. */
export const FEEDS: Record<PartId, ProductId[]> = {
  web: ['nb', 'at'],
  api: ['nb'],
  cloud: ['nb'],
  ai: ['sc'],
  sdk: ['sc'],
  mob: ['at', 'eg'],
  fw: ['at', 'lg'],
};

/** Recipes that take an item, for "used in". */
export const usedIn = (id: ItemId) =>
  Object.values(RECIPES)
    .filter((r) => r.inputs.some(([i]) => i === id))
    .map((r) => r.out);

export interface DockInfo {
  id: DockId;
  title: string;
  blurb: string;
  links: LinkItem[];
  extra?: string;
}

const storeLinks = (kind: 'appStore' | 'playStore') =>
  db.storeApps.map((p: db.Product) => ({
    label: p.title,
    url: p.links[kind] as string,
    kind: 'store' as const,
  }));

export const DOCK_INFO: Record<DockId, DockInfo> = {
  web: {
    id: 'web',
    title: 'Web',
    blurb: 'Platforms that ship to the browser.',
    links: [neurobuild, smartclaim].flatMap((p) =>
      projectLinks(p.links).map((l) => ({ ...l, label: `${p.title} · ${l.label}` })),
    ),
  },
  appstore: {
    id: 'appstore',
    title: 'App Store',
    blurb: `${fmt.Spell(db.storeApps.length)} React Native apps live on the App Store.`,
    links: storeLinks('appStore'),
  },
  play: {
    id: 'play',
    title: 'Google Play',
    blurb: `The same ${fmt.spell(db.storeApps.length)} apps on Google Play.`,
    links: storeLinks('playStore'),
  },
  field: {
    id: 'field',
    title: 'Field',
    blurb: `Hardware that leaves the building: ${logger.title} weather stations, and ${attendum.title} card readers and beacons.`,
    links: [],
    extra: `Also in production, though not in this factory: the ${epc.name} ${epc.kind.toLowerCase()} and the ${plc.name}.`,
  },
};

export const RESOURCE_NOTE: Partial<Record<ItemId, string>> = {
  react: `From the skills list. ${neurobuild.title} runs on Next.js and React 19.`,
  php: `From the skills list. Laravel is the ${neurobuild.title} back end, hosted on Laravel Vapor.`,
  aws: `From the skills list. ${neurobuild.title} is hosted on AWS Amplify and Laravel Vapor.`,
  py: `From the skills list. The ${smartclaim.title} API is FastAPI.`,
  sql: `From the skills list. ${smartclaim.title} keeps its vectors in pgvector.`,
  ts: `From the skills list. ${educationGuide.title} and the ${smartclaim.title} client SDK are TypeScript.`,
  rn: `From the skills list. The ${attendum.title} app and ${educationGuide.title} are built with Expo and React Native.`,
  c: `From the skills list. His ${db.products.matrixKeypad.title} driver is C; here it becomes the firmware that ${attendum.title} and ${logger.title} need.`,
};
