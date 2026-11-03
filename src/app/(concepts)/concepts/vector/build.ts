// The file itself, built from the facts: colour and text styles, the components (Button and
// ProjectCard with its variants), a Desktop and a Mobile frame for every section of the site,
// and a Prototype page whose screens are instances of those frames, wired together.

import { concept } from '../_shared/concepts';
import {
  db,
  featuredProjects,
  fmt,
  hardware,
  liveLinks,
  otherProjects,
  profile,
  roots,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { layoutAll } from './autolayout';

import {
  blank,
  Draft,
  FAMILIES,
  type AutoLayout,
  type ColorStyle,
  type Doc,
  type Font,
  type Link,
  type Node,
  type TextStyle,
} from './model';
import { instantiate, override, syncAll } from './sync';

/* ------------------------------------------------------------------ styles */

const COLORS: ColorStyle[] = [
  { id: 'paper', name: 'Surface/Page', color: '#F6F4EF' },
  { id: 'card', name: 'Surface/Card', color: '#FFFFFF' },
  { id: 'sunk', name: 'Surface/Sunken', color: '#ECE9E2' },
  { id: 'ink', name: 'Text/Primary', color: '#151513' },
  { id: 'muted', name: 'Text/Secondary', color: '#5E5C56' },
  { id: 'line', name: 'Border/Default', color: '#E0DCD3' },
  { id: 'accent', name: 'Brand/Accent', color: '#D9481C' },
  { id: 'inverse', name: 'Text/Inverse', color: '#FFFFFF' },
];

type F = TextStyle['font'];
const f = (
  family: F['family'],
  weight: number,
  size: number,
  line: number,
  tracking = 0,
  upper = false,
): F => ({ family, weight, size, line, tracking, ...(upper ? { upper } : {}) });

const TEXTS: TextStyle[] = [
  { id: 'd-display', name: 'Desktop/Display', font: f('schibsted', 800, 88, 88, -3) },
  { id: 'd-h2', name: 'Desktop/Heading', font: f('schibsted', 700, 56, 60, -1.5) },
  { id: 'd-h3', name: 'Desktop/Title', font: f('schibsted', 700, 26, 32, -0.4) },
  { id: 'd-stat', name: 'Desktop/Figure', font: f('schibsted', 700, 40, 44, -1) },
  { id: 'd-lead', name: 'Desktop/Lead', font: f('inter', 400, 23, 33, -0.2) },
  { id: 'd-body', name: 'Desktop/Body', font: f('inter', 400, 17, 27) },
  { id: 'd-strong', name: 'Desktop/Body strong', font: f('inter', 600, 17, 27) },
  { id: 'm-display', name: 'Mobile/Display', font: f('schibsted', 800, 50, 50, -1.8) },
  { id: 'm-h2', name: 'Mobile/Heading', font: f('schibsted', 700, 36, 40, -1) },
  { id: 'm-h3', name: 'Mobile/Title', font: f('schibsted', 700, 21, 26, -0.2) },
  { id: 'm-stat', name: 'Mobile/Figure', font: f('schibsted', 700, 30, 34, -0.6) },
  { id: 'm-lead', name: 'Mobile/Lead', font: f('inter', 400, 19, 28, -0.1) },
  { id: 'm-body', name: 'Mobile/Body', font: f('inter', 400, 16, 25) },
  { id: 'm-strong', name: 'Mobile/Body strong', font: f('inter', 600, 16, 25) },
  { id: 'small', name: 'Shared/Small', font: f('inter', 400, 14, 21) },
  { id: 'label', name: 'Shared/Label', font: f('jetbrains', 400, 12, 16, 1, true) },
  { id: 'nav', name: 'Shared/Nav', font: f('inter', 500, 15, 20) },
  { id: 'button', name: 'Shared/Button', font: f('inter', 600, 15, 20) },
  { id: 'tag', name: 'Shared/Tag', font: f('jetbrains', 400, 12, 16) },
  { id: 'code', name: 'Shared/Code', font: f('jetbrains', 600, 15, 22) },
];

/* ------------------------------------------------------------------ a small builder */

type Pad = number | [number, number] | [number, number, number, number];
const pad4 = (p: Pad = 0): [number, number, number, number] =>
  typeof p === 'number' ? [p, p, p, p] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p;

const colorOf = (id: string) => COLORS.find((c) => c.id === id) as ColorStyle;
const paint = (id: string) => ({ color: colorOf(id).color, opacity: 1, style: id });
const line = (id = 'line', width = 1) => ({ ...paint(id), width });
const fontOf = (id: string, p: Partial<Font> = {}): Font => ({
  ...(TEXTS.find((t) => t.id === id) as TextStyle).font,
  align: 'left',
  style: id,
  ...p,
});

interface Box extends Partial<Node> {
  gap?: number;
  pad?: Pad;
  align?: AutoLayout['align'];
  justify?: AutoLayout['justify'];
  wrap?: boolean;
  rowGap?: number;
  bg?: string;
}

let d = new Draft({ nodes: {}, pages: [], colors: COLORS, texts: TEXTS, seq: 1 });

function node(n: Node, kids: string[] = []) {
  d.put(n);
  for (const k of kids) d.set(k, { parent: n.id });
  d.set(n.id, { children: kids });
  return n.id;
}

function stack(dir: 'h' | 'v', name: string, o: Box, kids: string[]) {
  const { gap = 0, pad, align = 'start', justify = 'start', wrap, rowGap, bg, ...rest } = o;
  return node(
    blank(d.newId(), 'frame', name, {
      layout: {
        dir,
        gap,
        pad: pad4(pad),
        align,
        justify,
        ...(wrap ? { wrap, rowGap: rowGap ?? gap } : {}),
      },
      sw: 'fill',
      sh: 'hug',
      fill: bg ? paint(bg) : null,
      ...rest,
    }),
    kids,
  );
}

const col = (name: string, o: Box, kids: string[]) => stack('v', name, o, kids);
const row = (name: string, o: Box, kids: string[]) => stack('h', name, o, kids);

/** A text layer: fills its parent's width and grows in height, unless told to hug. */
function text(
  name: string,
  value: string,
  style: string,
  color = 'ink',
  p: Partial<Node> & { hug?: boolean; align?: Font['align'] } = {},
) {
  const { hug, align, ...rest } = p;
  return node(
    blank(d.newId(), 'text', name, {
      text: value,
      font: fontOf(style, align ? { align } : {}),
      fill: paint(color),
      sw: hug ? 'hug' : 'fill',
      sh: 'hug',
      named: true,
      h: 20,
      ...rest,
    }),
  );
}

const rect = (name: string, p: Partial<Node>) => node(blank(d.newId(), 'rect', name, p));
const ellipse = (name: string, p: Partial<Node>) => node(blank(d.newId(), 'ellipse', name, p));
const image = (name: string, src: string, p: Partial<Node>) =>
  node(blank(d.newId(), 'image', name, { src, ...p }));
const rule = () => rect('Rule', { h: 1, sw: 'fill', fill: paint('line') });

const url = (href: string): Link => ({
  action: 'url',
  url: href,
  anim: 'instant',
  dir: 'left',
  ms: 0,
  ease: 'out',
});
const go = (to: string, anim: Link['anim'] = 'smart', ms = 450): Link => ({
  action: 'navigate',
  to,
  anim,
  dir: 'left',
  ms,
  ease: 'out',
});

function page(name: string, kids: string[]) {
  const id = node(blank(d.newId(), 'page', name, { w: 0, h: 0, fill: null }), kids);
  d.pages = [...d.pages, id];
  return id;
}

/* ------------------------------------------------------------------ the site's sections */

export type Device = 'desktop' | 'mobile';
type Section = 'home' | 'about' | 'experience' | 'projects' | 'hardware' | 'oss' | 'contact';

export const SECTIONS: { id: Section; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'experience', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'oss', label: 'Open source' },
  { id: 'contact', label: 'Contact' },
];

const DEV = {
  desktop: { name: 'Desktop', w: 1440, px: 120, py: 112, t: 'd' },
  mobile: { name: 'Mobile', w: 390, px: 24, py: 64, t: 'm' },
} as const;

const ts = (dev: Device, k: 'display' | 'h2' | 'h3' | 'stat' | 'lead' | 'body' | 'strong') =>
  `${DEV[dev].t}-${k}`;

/** Ids the editor needs to find again: comments, the components, the screens. */
export const refs = {
  button: { primary: '', secondary: '', set: '' },
  card: { wide: '', stacked: '', compact: '', set: '', tags: '' },
  screens: {} as Record<Device, Record<Section, string>>,
  proto: {} as Record<Device, Record<Section, string>>,
  menu: '',
  pages: { design: '', components: '', prototype: '' },
  colorsBoard: '',
  textsBoard: '',
  heroPhoto: '',
  heroName: '',
  firstCard: '',
  experience: '',
  oss: '',
  contactEmail: '',
  mobileHero: '',
};

/** Indicators that sit under the nav item of their own section, placed once the nav is laid out. */
const indicators: { id: string; item: string }[] = [];

function button(
  style: 'primary' | 'secondary',
  label: string,
  href: string,
  p: Partial<Node> = {},
) {
  const id = instantiate(d, refs.button[style], '');
  const lbl = d.get(id).children[0];
  override(d, lbl, { text: label });
  d.set(id, { name: `Button / ${label}`, link: url(href), parent: '', ...p });
  return id;
}

function nav(dev: Device, active: Section) {
  const { px } = DEV[dev];
  const mark = ellipse('Mark', { w: 10, h: 10, fill: paint('accent') });
  const word = row('Wordmark', { gap: 10, align: 'center', sw: 'hug' }, [
    mark,
    text('Name', profile.name, 'button', 'ink', { hug: true }),
  ]);
  let right: string;
  if (dev === 'desktop') {
    const items = SECTIONS.slice(1).map((s) =>
      text(s.label, s.label, 'nav', s.id === active ? 'ink' : 'muted', { hug: true }),
    );
    const ind = rect('Indicator', {
      w: 24,
      h: 2,
      fill: paint('accent'),
      abs: true,
      visible: active !== 'home',
    });
    const activeItem = items[SECTIONS.findIndex((s) => s.id === active) - 1];
    right = row('Links', { gap: 28, align: 'center', sw: 'hug' }, [...items, ind]);
    indicators.push({ id: ind, item: activeItem ?? items[0] });
  } else {
    const bars = col('Icon', { gap: 5, sw: 'hug', pad: [0, 0] }, [
      rect('Bar', { w: 18, h: 2, radius: 1, fill: paint('ink') }),
      rect('Bar', { w: 18, h: 2, radius: 1, fill: paint('ink') }),
    ]);
    right = row(
      'Menu',
      { gap: 10, align: 'center', sw: 'hug', pad: [8, 14], radius: 99, stroke: line() },
      [text('Label', 'Menu', 'nav', 'ink', { hug: true }), bars],
    );
  }
  const bar = row(
    'Bar',
    { pad: [dev === 'desktop' ? 24 : 14, px], justify: 'between', align: 'center' },
    [word, right],
  );
  return col('Nav', { bg: 'paper', fixed: true }, [bar, rule()]);
}

function header(dev: Device, n: number, label: string, title: string, sub?: string) {
  const { px, py } = DEV[dev];
  const kids = [
    text('Label', `${String(n).padStart(2, '0')} / ${label}`, 'label', 'accent'),
    text('Heading', title, ts(dev, 'h2')),
  ];
  if (sub) kids.push(text('Subheading', sub, ts(dev, 'lead'), 'muted'));
  return col('Header', { pad: [py, px, dev === 'desktop' ? 48 : 32, px], gap: 16 }, kids);
}

function screen(dev: Device, section: Section, kids: string[]) {
  const name = `${DEV[dev].name} / ${SECTIONS.find((s) => s.id === section)?.label}`;
  const id = col(
    name,
    { w: DEV[dev].w, sw: 'fixed', bg: 'paper', clip: true, comp: { props: {} } },
    [nav(dev, section), ...kids],
  );
  (refs.screens[dev] ??= {} as Record<Section, string>)[section] = id;
  return id;
}

/* ------------------------------------------------------------------ components */

function buildButtons() {
  const variant = (style: 'Primary' | 'Secondary') =>
    row(
      `Style=${style}`,
      {
        gap: 8,
        pad: [14, 22],
        align: 'center',
        justify: 'center',
        sw: 'hug',
        radius: 99,
        bg: style === 'Primary' ? 'ink' : 'card',
        stroke: style === 'Primary' ? null : line(),
        comp: { props: { Style: style } },
      },
      [text('Label', 'Button', 'button', style === 'Primary' ? 'inverse' : 'ink', { hug: true })],
    );
  refs.button.primary = variant('Primary');
  refs.button.secondary = variant('Secondary');
  refs.button.set = row(
    'Button',
    {
      gap: 24,
      pad: 32,
      sw: 'hug',
      align: 'center',
      radius: 8,
      set: true,
      stroke: { color: '#9B6BFF', opacity: 1, width: 1 },
    },
    [refs.button.primary, refs.button.secondary],
  );
  for (const v of [refs.button.primary, refs.button.secondary])
    d.set(v, { comp: { ...d.get(v).comp!, set: refs.button.set } });
}

const ALL_PROJECTS = [...featuredProjects, ...otherProjects];
const TAG_SLOTS = Math.max(...ALL_PROJECTS.map((p) => p.tech.length));
const LINK_SLOTS = Math.max(...ALL_PROJECTS.map((p) => projectLinks(p.links).length));

function buildCards() {
  const sample = featuredProjects[0];
  const content = (dev: Device, pad: Pad) => {
    const tags = Array.from({ length: TAG_SLOTS }, (_, i) =>
      row(
        `Tag ${i + 1}`,
        { pad: [5, 10], radius: 99, sw: 'hug', bg: 'sunk', visible: i < sample.tech.length },
        [text('Label', sample.tech[i] ?? 'Tag', 'tag', 'ink', { hug: true })],
      ),
    );
    const links = projectLinks(sample.links);
    const linkKids = Array.from({ length: LINK_SLOTS }, (_, i) =>
      text(`Link ${i + 1}`, `${links[i]?.label ?? 'Link'} ↗`, 'button', 'accent', {
        hug: true,
        visible: i < links.length,
        link: links[i] ? url(links[i].url) : null,
      }),
    );
    return col('Content', { gap: dev === 'desktop' ? 16 : 12, pad }, [
      text('Title', sample.title, ts(dev, 'h3')),
      text('Description', sample.description, dev === 'desktop' ? 'd-body' : 'small', 'muted'),
      row('Tags', { gap: 6, wrap: true }, tags),
      row('Links', { gap: 18, sw: 'hug', pad: [4, 0, 0, 0] }, linkKids),
    ]);
  };
  const card = (name: string, props: Record<string, string>, o: Box, kids: string[]) =>
    col(
      name,
      { radius: 20, bg: 'card', stroke: line(), clip: true, sw: 'fixed', comp: { props }, ...o },
      kids,
    );
  refs.card.wide = card(
    'Type=Featured, Layout=Wide',
    { Type: 'Featured', Layout: 'Wide' },
    { w: 1200, layout: null, align: 'center' },
    [
      image('Image', sample.image, { w: 520, h: 325, radius: 14 }),
      content('desktop', [8, 16, 8, 0]),
    ],
  );
  // A row, so the image sits beside the copy.
  d.set(refs.card.wide, {
    layout: { dir: 'h', gap: 40, pad: [20, 20, 20, 20], align: 'center', justify: 'start' },
  });
  refs.card.stacked = card(
    'Type=Featured, Layout=Stacked',
    { Type: 'Featured', Layout: 'Stacked' },
    { w: 342, pad: 10 },
    [
      image('Image', sample.image, { w: 322, h: 200, radius: 12, sw: 'fill' }),
      content('mobile', [16, 10, 10, 10]),
    ],
  );
  refs.card.compact = card(
    'Type=Compact, Layout=Stacked',
    { Type: 'Compact', Layout: 'Stacked' },
    { w: 384, pad: 8 },
    [content('mobile', 18)],
  );
  refs.card.set = col(
    'ProjectCard',
    {
      gap: 40,
      pad: 40,
      sw: 'hug',
      radius: 8,
      set: true,
      stroke: { color: '#9B6BFF', opacity: 1, width: 1 },
    },
    [refs.card.wide, refs.card.stacked, refs.card.compact],
  );
  for (const v of [refs.card.wide, refs.card.stacked, refs.card.compact])
    d.set(v, { comp: { ...d.get(v).comp!, set: refs.card.set } });
  refs.card.tags = d.get(d.get(refs.card.compact).children[0]).children[2];
}

/** Finds a layer inside an instance (or any frame) by its path of names. */
export function byPath(nodes: Record<string, Node>, root: string, path: string) {
  const want = path.split('/');
  let cur = root;
  for (const name of want) {
    const next = nodes[cur]?.children.find((c) => nodes[c].name === name);
    if (!next) return '';
    cur = next;
  }
  return cur;
}

function projectCard(
  p: (typeof ALL_PROJECTS)[number],
  variant: 'wide' | 'stacked' | 'compact',
  sizing: Partial<Node>,
) {
  const id = instantiate(d, refs.card[variant], '');
  d.set(id, { name: p.title, parent: '', ...sizing });
  if (sizing.w !== undefined) override(d, id, { w: sizing.w });
  const at = (path: string) => byPath(d.nodes, id, path);
  override(d, at('Content/Title'), { text: p.title });
  override(d, at('Content/Description'), { text: p.description });
  if ('image' in p && p.image && variant !== 'compact')
    override(d, at('Image'), { src: p.image as string });
  for (let i = 0; i < TAG_SLOTS; i++) {
    const tag = at(`Content/Tags/Tag ${i + 1}`);
    if (i < p.tech.length) {
      override(d, at(`Content/Tags/Tag ${i + 1}/Label`), { text: p.tech[i] });
      override(d, tag, { visible: true });
    } else override(d, tag, { visible: false });
  }
  const links = projectLinks(p.links);
  for (let i = 0; i < LINK_SLOTS; i++) {
    const l = at(`Content/Links/Link ${i + 1}`);
    if (links[i])
      override(d, l, { text: `${links[i].label} ↗`, link: url(links[i].url), visible: true });
    else override(d, l, { visible: false });
  }
  if (!links.length) override(d, at('Content/Links'), { visible: false });
  return id;
}

/* ------------------------------------------------------------------ sections */

function home(dev: Device) {
  const { px, py } = DEV[dev];
  const role = text('Role', `${db.current.title} · ${db.current.company}`, 'label', 'ink', {
    hug: true,
  });
  const eyebrow = row('Eyebrow', { gap: 10, align: 'center', sw: 'hug' }, [
    ellipse('Dot', { w: 8, h: 8, fill: paint('accent') }),
    role,
  ]);
  const name = text('Name', profile.name, ts(dev, 'display'));
  const tagline = text('Tagline', profile.tagline, ts(dev, 'lead'));
  const lede = text('Lede', profile.lede, ts(dev, 'body'), 'muted');
  const actions =
    dev === 'desktop'
      ? row('Actions', { gap: 12, sw: 'hug', pad: [12, 0, 0, 0] }, [
          button('primary', 'Email me', `mailto:${profile.email}`),
          button('secondary', 'Download CV', profile.cv),
          button('secondary', 'LinkedIn', profile.linkedin),
          button('secondary', 'GitHub', profile.github),
        ])
      : col('Actions', { gap: 10, pad: [8, 0, 0, 0] }, [
          button('primary', 'Email me', `mailto:${profile.email}`, { sw: 'fill' }),
          row('Row', { gap: 10 }, [
            button('secondary', 'CV', profile.cv, { sw: 'fill' }),
            button('secondary', 'LinkedIn', profile.linkedin, { sw: 'fill' }),
            button('secondary', 'GitHub', profile.github, { sw: 'fill' }),
          ]),
        ]);
  const photo = image(
    'Photo',
    db.person.photo,
    dev === 'desktop' ? { w: 400, h: 480, radius: 24 } : { w: 112, h: 112, radius: 56 },
  );
  if (dev === 'desktop') {
    refs.heroPhoto = photo;
    refs.heroName = name;
  }
  const stats = db.headline.map((s) =>
    col('Stat', dev === 'desktop' ? { gap: 10 } : { gap: 6, sw: 'fixed', w: 163 }, [
      rule(),
      text('Value', s.value, ts(dev, 'stat')),
      text('Label', s.label, 'small', 'muted'),
    ]),
  );
  if (dev === 'desktop') {
    const copy = col('Copy', { gap: 24 }, [eyebrow, name, tagline, lede, actions]);
    return [
      row('Hero', { pad: [96, px, 88, px], gap: 80, align: 'center' }, [copy, photo]),
      row('Stats', { pad: [0, px, py, px], gap: 24 }, stats),
    ];
  }
  const hero = col('Hero', { pad: [32, px, 40, px], gap: 18 }, [
    photo,
    eyebrow,
    name,
    tagline,
    lede,
    actions,
  ]);
  refs.mobileHero = hero;
  return [hero, row('Stats', { pad: [0, px, py, px], gap: 16, wrap: true, rowGap: 24 }, stats)];
}

function about(dev: Device) {
  const { px, py } = DEV[dev];
  const paras = db.about.map((p, i) =>
    text(
      `Paragraph ${i + 1}`,
      p,
      i === 0 ? ts(dev, 'lead') : ts(dev, 'body'),
      i === 0 ? 'ink' : 'muted',
    ),
  );
  const tags = db.skills.map((s) =>
    row(s, { pad: [7, 13], radius: 99, sw: 'hug', bg: 'card', stroke: line() }, [
      text('Label', s, 'small', 'ink', { hug: true }),
    ]),
  );
  const skills = col('Skills', dev === 'desktop' ? { gap: 16, sw: 'fixed', w: 380 } : { gap: 14 }, [
    text('Label', 'Skills', 'label', 'muted'),
    row('Tags', { gap: 8, wrap: true }, tags),
  ]);
  const body =
    dev === 'desktop'
      ? row('Body', { pad: [0, px, 72, px], gap: 80 }, [col('Text', { gap: 20 }, paras), skills])
      : col('Body', { pad: [0, px, 48, px], gap: 32 }, [col('Text', { gap: 16 }, paras), skills]);
  const rows: { year: string; title: string; detail: string; url?: string }[] = [
    ...roots,
    { year: '—', title: db.robots.quadcopter.title, detail: db.robots.quadcopter.detail },
  ];
  const items = rows.flatMap((r) => {
    const link = r.url
      ? [
          text('Link', `${db.papers.inverter.venue} ↗`, 'button', 'accent', {
            hug: true,
            link: url(r.url),
          }),
        ]
      : [];
    const kids =
      dev === 'desktop'
        ? [
            text('Year', r.year, 'label', 'muted', { sw: 'fixed', w: 140 }),
            text('Title', r.title, 'd-strong', 'ink', { sw: 'fixed', w: 420 }),
            col('Detail', { gap: 8 }, [text('Text', r.detail, 'd-body', 'muted'), ...link]),
          ]
        : [
            text('Year', r.year, 'label', 'muted'),
            text('Title', r.title, 'm-strong'),
            text('Text', r.detail, 'small', 'muted'),
            ...link,
          ];
    return [
      rule(),
      dev === 'desktop'
        ? row('Root', { pad: [20, 0], gap: 40 }, kids)
        : col('Root', { pad: [16, 0], gap: 6 }, kids),
    ];
  });
  const rootsCol = col('Roots', { pad: [0, px, py, px] }, [
    col('Head', { gap: 8, pad: [0, 0, 20, 0] }, [
      text('Label', 'Education and roots', 'label', 'muted'),
    ]),
    ...items,
  ]);
  return [header(dev, 1, 'About', 'About'), body, rootsCol];
}

function experience(dev: Device) {
  const { px, py } = DEV[dev];
  const list = db.roleList.flatMap((r) => {
    const title = `${db.titlePath(r)}${r.contract ? ' (contract)' : ''}`;
    const org = text(
      'Organisation',
      r.org,
      ts(dev, 'h3'),
      'ink',
      r.url ? { link: url(r.url) } : {},
    );
    const meta = col('Meta', dev === 'desktop' ? { gap: 8, sw: 'fixed', w: 320 } : { gap: 6 }, [
      text('Dates', fmt.monthSpan(r.from, r.to), 'label', 'accent'),
      org,
      text('Title', title, ts(dev, 'body'), 'muted'),
    ]);
    const duties = r.duties.map((t, i) =>
      row(`Duty ${i + 1}`, { gap: 14 }, [
        col(
          'Marker',
          {
            sw: 'fixed',
            w: 6,
            sh: 'fixed',
            h: dev === 'desktop' ? 27 : 25,
            align: 'center',
            justify: 'center',
          },
          [ellipse('Dot', { w: 6, h: 6, fill: paint('accent') })],
        ),
        text('Text', t, ts(dev, 'body'), 'ink'),
      ]),
    );
    const detail = col('Detail', { gap: 14 }, [
      text('Summary', r.summary, ts(dev, 'strong')),
      col('Duties', { gap: 10 }, duties),
    ]);
    return [
      rule(),
      dev === 'desktop'
        ? row(r.short ?? r.org, { pad: [32, 0], gap: 40 }, [meta, detail])
        : col(r.short ?? r.org, { pad: [24, 0], gap: 16 }, [meta, detail]),
    ];
  });
  const sub = `${fmt.Spell(db.yearsBuilding)} years of building, from ${db.roles.freelance.org.toLowerCase()} work to ${db.current.title}.`;
  const id = col('Roles', { pad: [0, px, py, px] }, list);
  if (dev === 'desktop') refs.experience = id;
  return [header(dev, 2, 'Experience', 'Experience', sub), id];
}

function projects(dev: Device) {
  const { px, py } = DEV[dev];
  const featured = col(
    'Featured',
    { pad: [0, px], gap: dev === 'desktop' ? 24 : 16 },
    featuredProjects.map((p) =>
      projectCard(p, dev === 'desktop' ? 'wide' : 'stacked', { sw: 'fill' }),
    ),
  );
  if (dev === 'desktop') refs.firstCard = d.get(featured).children[0];
  const others =
    dev === 'desktop'
      ? row(
          'Others',
          { pad: [0, px], gap: 24, wrap: true, rowGap: 24 },
          otherProjects.map((p) => projectCard(p, 'compact', { sw: 'fixed', w: 384 })),
        )
      : col(
          'Others',
          { pad: [0, px], gap: 16 },
          otherProjects.map((p) => projectCard(p, 'compact', { sw: 'fill' })),
        );
  const subhead = (label: string, title: string) =>
    col(`${label} header`, { pad: [dev === 'desktop' ? 96 : 56, px, 24, px], gap: 10 }, [
      text('Label', label, 'label', 'muted'),
      text('Title', title, ts(dev, 'h3')),
    ]);
  const rows = db.builds.flatMap((b) => {
    const l = projectLinks(b.links)[0];
    const link = text(
      'Link',
      l ? `${l.label} ↗` : '—',
      'small',
      l ? 'accent' : 'muted',
      l
        ? { link: url(l.url), ...(dev === 'desktop' ? { sw: 'fixed', w: 150 } : { hug: true }) }
        : dev === 'desktop'
          ? { sw: 'fixed', w: 150 }
          : { hug: true },
    );
    const kids =
      dev === 'desktop'
        ? [
            text('Year', b.year, 'label', 'muted', { sw: 'fixed', w: 72 }),
            text('Project', b.title, 'd-strong'),
            text('Made at', b.madeAt ?? '', 'small', 'muted', { sw: 'fixed', w: 200 }),
            text('Built with', b.tech.join(' · '), 'small', 'muted', { sw: 'fixed', w: 260 }),
            link,
          ]
        : [
            row('Top', { gap: 12, justify: 'between', align: 'center' }, [
              text('Year', b.year, 'label', 'muted', { hug: true }),
              link,
            ]),
            text('Project', b.title, 'm-strong'),
            text('Built with', [b.madeAt, ...b.tech].filter(Boolean).join(' · '), 'small', 'muted'),
          ];
    return [
      rule(),
      dev === 'desktop'
        ? row('Entry', { pad: [14, 0], gap: 24, align: 'center' }, kids)
        : col('Entry', { pad: [14, 0], gap: 4 }, kids),
    ];
  });
  const archive = col('Archive', { pad: [0, px, py, px] }, rows);
  return [
    header(dev, 3, 'Projects', 'Selected work'),
    featured,
    subhead('More builds', 'Other projects'),
    others,
    subhead('Archive', 'Everything, by year'),
    archive,
  ];
}

function devices(dev: Device) {
  const { px, py } = DEV[dev];
  const cards = hardware.map((h) => {
    const figures = col('Figures', { gap: 8, pad: [6, 0, 0, 0] }, [
      rule(),
      ...h.figures.map((f) =>
        row('Figure', { gap: 10, align: 'center' }, [
          rect('Tick', { w: 8, h: 2, fill: paint('accent') }),
          text('Text', f, 'small', 'ink'),
        ]),
      ),
    ]);
    return col(
      h.name,
      {
        pad: 28,
        gap: 12,
        radius: 20,
        bg: 'card',
        stroke: line(),
        ...(dev === 'desktop' ? { sw: 'fixed', w: 384 } : {}),
      },
      [
        text('Tag', h.tag, 'label', 'accent'),
        text('Name', h.name, ts(dev, 'h3')),
        text('Kind', h.kind, 'small', 'muted'),
        text('Detail', h.detail, ts(dev, 'body')),
        figures,
      ],
    );
  });
  const grid =
    dev === 'desktop'
      ? row('Devices', { pad: [0, px, py, px], gap: 24, wrap: true, rowGap: 24 }, cards)
      : col('Devices', { pad: [0, px, py, px], gap: 16 }, cards);
  return [
    header(
      dev,
      4,
      'Hardware',
      'Hardware in production',
      `${fmt.Spell(Object.keys(db.devices).length)} devices in production.`,
    ),
    grid,
  ];
}

function openSource(dev: Device) {
  const { px, py } = DEV[dev];
  const list = Object.values(db.contributions).flatMap((c) => {
    const badges = row('Badges', { gap: 8, sw: 'hug' }, [
      row('Kind', { pad: [4, 9], radius: 6, sw: 'hug', bg: 'sunk' }, [
        text('Label', c.kind, 'tag', 'ink', { hug: true }),
      ]),
      row('Year', { pad: [4, 9], radius: 6, sw: 'hug', stroke: line() }, [
        text('Label', String(c.year), 'tag', 'muted', { hug: true }),
      ]),
    ]);
    const left = col('Package', dev === 'desktop' ? { gap: 10, sw: 'fixed', w: 380 } : { gap: 8 }, [
      text('Repository', c.repo, 'code'),
      badges,
      text('Reach', `★ ${c.stars} · ${c.weekly.short} weekly downloads`, 'small', 'muted'),
    ]);
    const right = col('Change', { gap: 8 }, [
      text('What', c.change, ts(dev, 'strong')),
      text('Why', c.impact, ts(dev, 'body'), 'muted'),
      text('Pull request', `Pull request #${c.pr} ↗`, 'button', 'accent', {
        hug: true,
        link: url(db.prUrl(c)),
      }),
    ]);
    return [
      rule(),
      dev === 'desktop'
        ? row(c.repo, { pad: [28, 0], gap: 40 }, [left, right])
        : col(c.repo, { pad: [20, 0], gap: 14 }, [left, right]),
    ];
  });
  const id = col('Contributions', { pad: [0, px, py, px] }, list);
  if (dev === 'desktop') refs.oss = id;
  return [
    header(
      dev,
      5,
      'Open source',
      'Open source',
      `Fixes upstream, in packages with ${db.downloads.weekly.long} weekly downloads between them.`,
    ),
    id,
  ];
}

function contact(dev: Device) {
  const { px } = DEV[dev];
  const email = text('Email', profile.email, dev === 'desktop' ? 'd-h2' : 'm-h3', 'accent', {
    hug: dev === 'desktop',
    link: url(`mailto:${profile.email}`),
  });
  if (dev === 'desktop') refs.contactEmail = email;
  const actions = (dev === 'desktop' ? row : col)(
    'Actions',
    { gap: 12, sw: dev === 'desktop' ? 'hug' : 'fill' },
    [
      button(
        'primary',
        'Email me',
        `mailto:${profile.email}`,
        dev === 'mobile' ? { sw: 'fill' } : {},
      ),
      button('secondary', 'LinkedIn', profile.linkedin, dev === 'mobile' ? { sw: 'fill' } : {}),
      button('secondary', 'GitHub', profile.github, dev === 'mobile' ? { sw: 'fill' } : {}),
      button('secondary', 'Download CV', profile.cv, dev === 'mobile' ? { sw: 'fill' } : {}),
    ],
  );
  const stores = col('Stores', { gap: 10 }, [
    text('Label', 'On the stores', 'label', 'muted'),
    (dev === 'desktop' ? row : col)(
      'Links',
      { gap: dev === 'desktop' ? 24 : 8, sw: 'hug' },
      liveLinks.map((l) =>
        text(l.label, `${l.label} ↗`, 'small', 'accent', { hug: true, link: url(l.url) }),
      ),
    ),
  ]);
  const body = col('Body', { pad: [0, px, dev === 'desktop' ? 96 : 56, px], gap: 32 }, [
    email,
    actions,
    stores,
  ]);
  const foot = col('Footer', {}, [
    rule(),
    (dev === 'desktop' ? row : col)('Row', { pad: [28, px], gap: 8, justify: 'between' }, [
      text('Name', `${profile.name} · ${db.person.site}`, 'small', 'muted', { hug: true }),
      text('Credit', `Designed in ${concept('vector').name}`, 'small', 'muted', { hug: true }),
    ]),
  ]);
  return [header(dev, 6, 'Contact', 'Contact', 'Write to me, or find me here.'), body, foot];
}

/* ------------------------------------------------------------------ boards */

function styleBoards() {
  const swatches = COLORS.map((c) =>
    col(c.name, { gap: 8, sw: 'fixed', w: 132 }, [
      rect('Chip', { w: 132, h: 84, radius: 12, fill: paint(c.id), stroke: line() }),
      text('Name', c.name, 'small', 'ink'),
      text('Value', c.color, 'tag', 'muted'),
    ]),
  );
  refs.colorsBoard = col(
    'Color styles',
    { w: 640, sw: 'fixed', pad: 40, gap: 24, bg: 'paper', radius: 8 },
    [
      text('Title', 'Color styles', 'd-h3'),
      row('Swatches', { gap: 20, wrap: true, rowGap: 24 }, swatches),
    ],
  );
  const samples = TEXTS.map((t) => {
    const fam = FAMILIES[t.font.family].label;
    return col(t.name, { gap: 6, pad: [0, 0, 12, 0] }, [
      text(
        'Meta',
        `${t.name} · ${fam} ${t.font.weight} · ${t.font.size}/${t.font.line}`,
        'tag',
        'muted',
      ),
      text('Sample', t.name.split('/')[1], t.id),
    ]);
  });
  refs.textsBoard = col(
    'Text styles',
    { w: 640, sw: 'fixed', pad: 40, gap: 12, bg: 'paper', radius: 8 },
    [text('Title', 'Text styles', 'd-h3'), ...samples],
  );
}

function menuOverlay() {
  const items = SECTIONS.map((s) => text(s.label, s.label, 'm-h2', 'ink', { hug: true }));
  const close = row('Close', { pad: [8, 14], radius: 99, sw: 'hug', stroke: line() }, [
    text('Label', 'Close', 'nav', 'ink', { hug: true }),
  ]);
  refs.menu = col(
    'Mobile / Menu',
    {
      w: 320,
      sw: 'fixed',
      pad: [20, 24, 32, 24],
      gap: 20,
      bg: 'paper',
      overlay: 'right',
      shadow: { x: 0, y: 12, blur: 40, color: '#000000', opacity: 0.18 },
    },
    [
      row('Top', { justify: 'between', align: 'center' }, [
        text('Label', 'Menu', 'label', 'muted', { hug: true }),
        close,
      ]),
      col('Items', { gap: 14 }, items),
      rule(),
      text('Email', profile.email, 'small', 'accent', { link: url(`mailto:${profile.email}`) }),
    ],
  );
}

/* ------------------------------------------------------------------ the file */

function wire(dev: Device) {
  const screens = refs.proto[dev];
  for (const s of SECTIONS) {
    const inst = screens[s.id];
    const at = (p: string) => byPath(d.nodes, inst, p);
    override(d, at('Nav/Bar/Wordmark'), { link: go(screens.home) });
    if (dev === 'desktop') {
      for (const t of SECTIONS.slice(1))
        override(d, at(`Nav/Bar/Links/${t.label}`), { link: go(screens[t.id]) });
    } else {
      override(d, at('Nav/Bar/Menu'), {
        link: { action: 'overlay', to: refs.menu, anim: 'move', dir: 'left', ms: 320, ease: 'out' },
      });
    }
  }
  if (dev === 'mobile') {
    for (const s of SECTIONS)
      d.set(byPath(d.nodes, refs.menu, `Items/${s.label}`), {
        link: go(screens[s.id], 'dissolve', 260),
      });
    d.set(byPath(d.nodes, refs.menu, 'Top/Close'), {
      link: { action: 'close', anim: 'move', dir: 'right', ms: 260, ease: 'out' },
    });
  }
}

export interface Pin {
  id: string;
  at: string;
  fx: number;
  fy: number;
  body: string;
}

function build(): Doc {
  d = new Draft({ nodes: {}, pages: [], colors: COLORS, texts: TEXTS, seq: 1 });
  buildButtons();
  buildCards();
  styleBoards();
  const devicesList: Device[] = ['desktop', 'mobile'];
  const screens: string[] = [];
  for (const dev of devicesList) {
    screens.push(
      screen(dev, 'home', home(dev)),
      screen(dev, 'about', about(dev)),
      screen(dev, 'experience', experience(dev)),
      screen(dev, 'projects', projects(dev)),
      screen(dev, 'hardware', devices(dev)),
      screen(dev, 'oss', openSource(dev)),
      screen(dev, 'contact', contact(dev)),
    );
  }
  refs.pages.design = page('Design', screens);
  refs.pages.components = page('Components', [
    refs.button.set,
    refs.card.set,
    refs.colorsBoard,
    refs.textsBoard,
  ]);
  refs.pages.prototype = page('Prototype', []);
  menuOverlay();
  for (const dev of devicesList) {
    refs.proto[dev] = {} as Record<Section, string>;
    for (const s of SECTIONS) {
      const id = instantiate(d, refs.screens[dev][s.id], refs.pages.prototype);
      d.set(id, {
        name: d.get(refs.screens[dev][s.id]).name,
        ...(s.id === 'home' ? { flow: DEV[dev].name } : {}),
      });
      refs.proto[dev][s.id] = id;
    }
  }
  d.set(refs.menu, { parent: refs.pages.prototype });
  d.set(refs.pages.prototype, { children: [...d.get(refs.pages.prototype).children, refs.menu] });
  wire('desktop');
  wire('mobile');
  // Layout waits for real font metrics (see prepare in the store).
  syncAll(d);
  return d.done();
}

/** Places the indicators and the frames once sizes are known. Runs again with real metrics. */
export function arrange(dd: Draft) {
  for (const { id, item } of indicators) {
    const it = dd.get(item);
    if (it) dd.set(id, { x: it.x, y: it.y + it.h + 6, w: it.w });
  }
  syncAll(dd);
  layoutAll(dd);
  const N = dd.nodes;
  // Design: a column per section, the desktop frame above its mobile one.
  const desk = SECTIONS.map((s) => refs.screens.desktop[s.id]);
  const mob = SECTIONS.map((s) => refs.screens.mobile[s.id]);
  const deskH = Math.max(...desk.map((id) => N[id].h));
  desk.forEach((id, i) => dd.set(id, { x: i * 1640, y: 0 }));
  mob.forEach((id, i) => dd.set(id, { x: i * 1640, y: deskH + 320 }));
  // Prototype: wider gaps, so the connections have room.
  const pd = SECTIONS.map((s) => refs.proto.desktop[s.id]);
  const pm = SECTIONS.map((s) => refs.proto.mobile[s.id]);
  const pdH = Math.max(...pd.map((id) => dd.get(id).h));
  pd.forEach((id, i) => dd.set(id, { x: i * 1840, y: 0 }));
  pm.forEach((id, i) => dd.set(id, { x: i * 790, y: pdH + 480 }));
  dd.set(refs.menu, { x: pm.length * 790, y: pdH + 480 });
  // Components: the sets on the left, the style boards beside them.
  const btn = dd.get(refs.button.set);
  dd.set(refs.button.set, { x: 0, y: 0 });
  dd.set(refs.card.set, { x: 0, y: btn.h + 120 });
  const right = dd.get(refs.card.set).w + 200;
  dd.set(refs.colorsBoard, { x: right, y: 0 });
  dd.set(refs.textsBoard, { x: right, y: dd.get(refs.colorsBoard).h + 120 });
}

function pins(): Pin[] {
  const P = (id: string, at: string, fx: number, fy: number, body: string): Pin => ({
    id,
    at,
    fx,
    fy,
    body,
  });
  const navOf = (dev: Device) =>
    byPath(d.nodes, refs.screens[dev].about, 'Nav/Bar/Links/Indicator');
  return [
    P(
      'photo',
      refs.heroPhoto,
      0.92,
      0.08,
      'The photo is the only image above the fold. Everything else on this frame is live text, so it reflows at any width.',
    ),
    P(
      'display',
      refs.heroName,
      0.98,
      0.5,
      'Every text layer is linked to a text style. Change a style on the Components page and the whole file follows.',
    ),
    P(
      'nav',
      navOf('desktop'),
      0.5,
      1,
      'Same nav, same layer names in every frame. Smart animate matches layers by name, so in the prototype the nav stays still and only this indicator slides.',
    ),
    P(
      'card',
      refs.firstCard,
      0.985,
      0.06,
      'Each card is an instance of ProjectCard. Edit the main component and every card on both pages follows; the text and links here are overrides.',
    ),
    P(
      'tags',
      refs.card.tags,
      1,
      0.5,
      'There are as many tag slots as the project with the most tags needs. Cards with fewer hide the rest: an instance can hide a layer but not delete it.',
    ),
    P(
      'experience',
      refs.experience,
      0.24,
      0.02,
      'Dates get their own column so you can run down them. The duties stay in full; this is the part people actually read.',
    ),
    P(
      'oss',
      refs.oss,
      0.6,
      0.05,
      'Each pull request line is a prototype interaction. Press Play and it opens the real PR.',
    ),
    P(
      'email',
      refs.contactEmail,
      1,
      0.5,
      'Email is the largest thing on this frame on purpose. It is the one action I want from it.',
    ),
    P(
      'mobile',
      refs.mobileHero,
      0.9,
      0.06,
      'Mobile uses the same components and colour styles. Only the variant and the text styles change.',
    ),
    P(
      'proto',
      refs.proto.desktop.home,
      0.5,
      0.02,
      'These screens are instances of the frames on the Design page, so the prototype can never drift from the design.',
    ),
    P(
      'colors',
      refs.colorsBoard,
      0.94,
      0.06,
      'One accent, kept for small things: the dot, the active nav item and links. Buttons are ink.',
    ),
  ];
}

export const DOC = build();
export const PINS = pins();
