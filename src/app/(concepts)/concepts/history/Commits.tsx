'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { useInView, useReducedMotion } from '../_shared/hooks';
import { projectLinks, type LinkItem } from '../_shared/links';
import { readScheme, subscribeScheme, writeScheme } from '../_shared/scheme';
import { blobId } from './git';
import {
  BRANCHES,
  BRANCH_ORDER,
  HEAD,
  LOG,
  TIPS,
  WIP,
  commit,
  commitsOn,
  type BranchId,
} from './history';
import Icon, { type IconName } from './Icon';
import { Diff, Inspector, Log, rowId } from './Log';
import Overview from './Overview';
import Palette, { type PaletteItem } from './Palette';
import s from './commits.module.scss';
import { concept } from '../_shared/concepts';

type Select = (id: string, reveal?: boolean) => void;
type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

const { person, products, roles, current } = db;
const head = commit(HEAD);
const firstOn = (id: BranchId) => {
  const on = commitsOn(id);
  return on[on.length - 1].id;
};

/* ------------------------------------------------------------------ content mapped onto git */

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const submodulePath = (name: string) => `hardware/${slug(name)}`;
const { logger } = db.devices;

// README.md keeps one clause per line (semantic line breaks), so each line can be blamed on the
// commit that put it there. The text is `about`, cut at these markers.
const BLAME_MARKS: [string, string][][] = [
  [
    [`in ${person.since},`, 'freelance'],
    ['control systems,', 'bsc'],
    ['building robots,', 'ssl'],
    [`${db.awards.robocup.event} ${db.awards.robocup.year}.`, 'robocup'],
  ],
  [
    [`${roles.niknam.sector},`, 'niknam'],
    [`${roles.alget.sector},`, 'alget'],
    [roles.zeroone.sector, 'zeroone'],
    [`${roles.neuroject.sector}.`, 'neuroject'],
    [`at ${current.company},`, 'cto'],
    ['construction enterprises,', 'neurobuild'],
    ['into it.', WIP],
  ],
  [
    ['Google Play,', 'app'],
    [`${logger.online.n} years,`, submodulePath(logger.name)],
    ['like Gatsby', 'pr-gatsby'],
    ['DefinitelyTyped.', 'pr-forge'],
  ],
];

interface Line {
  text: string;
  by: string | null;
}

const README: Line[] = [
  { text: `# ${profile.name}`, by: 'init' },
  ...about.flatMap((paragraph, i) => {
    const lines: Line[] = [{ text: '', by: null }];
    let rest = paragraph;
    for (const [mark, by] of BLAME_MARKS[i] ?? []) {
      const end = rest.indexOf(mark);
      if (end < 0) break;
      lines.push({ text: rest.slice(0, end + mark.length).trim(), by });
      rest = rest.slice(end + mark.length);
    }
    if (rest.trim()) lines.push({ text: rest.trim(), by: lines[lines.length - 1].by });
    return lines;
  }),
];

// Roots in the order their tags were made.
const TAGGED = roots
  .map((r, i) => ({ r, c: LOG.find((x) => x.root === i && x.tags.length) }))
  .sort((a, b) => (a.c?.t ?? 0) - (b.c?.t ?? 0));

const SUBMODULES = hardware.map((d) => ({
  ...d,
  path: submodulePath(d.name),
  sha: blobId(JSON.stringify(d)).slice(0, 7),
}));
const submodule = (path: string) => SUBMODULES.find((m) => m.path === path);

// Where each featured product ships from. Its year and team are the archive's, from its first build.
const RELEASES: Record<string, { commit?: string; submodule?: string }> = {
  [products.neurobuild.title]: { commit: 'neurobuild' },
  [products.attendum.title]: { commit: 'app' },
  [products.logger.title]: { submodule: submodulePath(logger.name) },
  [products.activeClass.title]: { commit: 'zeroone' },
};
const firstBuild = (title: string) => archive.findLast((a) => a.title.startsWith(title));
const MORE = otherProjects.filter(
  (p) => !p.links.github?.includes('/pull/') && !hardware.some((d) => d.name === p.title),
);

const REMOTES: [string, string, string][] = [
  ['origin', `mailto:${profile.email}`, 'fetch'],
  ['origin', `mailto:${profile.email}`, 'push'],
  ['linkedin', profile.linkedin, 'fetch'],
  ['github', profile.github, 'fetch'],
  ['cv', profile.cv, 'fetch'],
];
const pretty = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

const SECTIONS: [string, string, IconName, number | null][] = [
  ['readme', 'README', 'readme', null],
  ['history', 'History', 'commit', LOG.length],
  ['branches', 'Branches', 'branch', BRANCH_ORDER.length],
  ['releases', 'Releases', 'release', featuredProjects.length + MORE.length],
  ['pulls', 'Pull requests', 'pr', oss.length],
  ['submodules', 'Submodules', 'chip', hardware.length],
  ['tags', 'Tags', 'tag', roots.length],
  ['remotes', 'Remotes', 'remote', REMOTES.length],
];

/* ------------------------------------------------------------------ small pieces */

function Section({
  id,
  cmd,
  title,
  lede,
  children,
  className = '',
}: {
  id: string;
  cmd: string;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLElement>(true, 0.08);
  return (
    <section
      ref={ref}
      id={id}
      className={`${s.section} ${className}`}
      data-seen={seen || undefined}
      aria-labelledby={`${id}-title`}
    >
      <header className={s.secHead}>
        <p className={s.cmd} style={{ '--n': cmd.length + 2 } as Vars}>
          <span className={s.prompt}>$</span> <span className={s.typed}>{cmd}</span>
        </p>
        <h2 id={`${id}-title`}>{title}</h2>
        {lede && <p className={s.secLede}>{lede}</p>}
      </header>
      {children}
    </section>
  );
}

function Links({ links }: { links: LinkItem[] }) {
  return (
    <ul className={s.assets}>
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer">
            <Icon
              name={l.kind === 'code' ? 'commit' : l.kind === 'store' ? 'release' : 'external'}
            />
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function ShaButton({ id, onSelect }: { id: string; onSelect: Select }) {
  const c = commit(id);
  return (
    <button
      type="button"
      className={s.shaBtn}
      onClick={() => onSelect(id, true)}
      style={{ '--c': c.branch.color } as Vars}
      aria-label={`Open ${c.short} in the history: ${c.subject}`}
    >
      {c.short}
    </button>
  );
}

/* ------------------------------------------------------------------ README with git blame */

function Readme({ onSelect }: { onSelect: Select }) {
  const [mode, setMode] = useState<'blame' | 'preview'>('blame');
  return (
    <div className={s.file}>
      <div className={s.fileBar}>
        <Icon name="readme" />
        <span className={s.fileName}>README.md</span>
        <span className={s.fileInfo}>{README.length} lines</span>
        <div className={s.toggle} role="group" aria-label="View">
          <button type="button" aria-pressed={mode === 'blame'} onClick={() => setMode('blame')}>
            Blame
          </button>
          <button
            type="button"
            aria-pressed={mode === 'preview'}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
        </div>
      </div>
      {mode === 'blame' ? (
        <ol className={s.blame}>
          {README.map((line, i) => {
            const sub = line.by ? submodule(line.by) : undefined;
            const c = line.by && !sub ? commit(line.by) : undefined;
            const age = c ? (c.t - person.since) / (db.yearsBuilding + 1) : 0.4;
            return (
              <li
                key={i}
                style={
                  { '--c': c?.branch.color ?? 'var(--muted)', '--age': age.toFixed(2) } as Vars
                }
                className={line.by ? '' : s.blank}
              >
                {c && (
                  <button
                    type="button"
                    className={s.gutter}
                    onClick={() => onSelect(c.id, true)}
                    aria-label={`Line ${i + 1} is from ${c.short}, ${c.date}: ${c.subject}. Open it.`}
                  >
                    <code>{c.kind === 'wip' ? '00000000' : c.short}</code>
                    <span>{c.kind === 'wip' ? 'Not Committed Yet' : c.date}</span>
                  </button>
                )}
                {sub && (
                  <a
                    className={s.gutter}
                    href="#submodules"
                    aria-label={`Line ${i + 1} is from the ${sub.path} submodule.`}
                  >
                    <code>{sub.sha}</code>
                    <span>{sub.path}</span>
                  </a>
                )}
                {!line.by && <span className={s.gutter} aria-hidden="true" />}
                <span className={s.lineNo} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={s.lineText}>{line.text || ' '}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={s.preview}>
          <p className={s.previewTitle}>{profile.name}</p>
          {about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Commits() {
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState(HEAD);
  const [solo, setSolo] = useState<BranchId | null>(null);
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const [devices, live] = useInView<HTMLDivElement>(false, 0.05);
  const dark = useSyncExternalStore(
    subscribeScheme,
    () => readScheme() === 'dark',
    () => false,
  );

  const select = useCallback<Select>(
    (id, reveal = false) => {
      setSelected(id);
      setSheet(true);
      if (!reveal) return;
      const row = document.getElementById(rowId(id));
      row?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => row?.focus({ preventScroll: true }), 80);
    },
    [reduced],
  );
  const closeSheet = useCallback(() => setSheet(false), []);

  const soloBranch = (id: BranchId) => {
    if (solo === id) return setSolo(null);
    setSolo(id);
    select(firstOn(id), true);
  };

  const go = useCallback(
    (id: string) =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }),
    [reduced],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo<PaletteItem[]>(() => {
    const open = (url: string) => () =>
      url.startsWith('mailto:')
        ? window.location.assign(url)
        : window.open(url, '_blank', 'noopener');
    const links = [...featuredProjects, ...otherProjects].flatMap((p) =>
      projectLinks(p.links).map((l) => ({ ...l, label: `${p.title}: ${l.label}` })),
    );
    return [
      ...SECTIONS.map(([id, label, icon]) => ({
        key: `s-${id}`,
        group: 'Go to',
        label,
        icon,
        run: () => go(id),
      })),
      {
        key: 'v-dark',
        group: 'View',
        label: 'Dark mode',
        icon: 'moon' as const,
        run: () => writeScheme('dark'),
      },
      {
        key: 'v-light',
        group: 'View',
        label: 'Light mode',
        icon: 'sun' as const,
        run: () => writeScheme('light'),
      },
      {
        key: 'v-system',
        group: 'View',
        label: 'Match system appearance',
        icon: 'system' as const,
        run: () => writeScheme(null),
      },
      ...BRANCH_ORDER.map((id) => ({
        key: `b-${id}`,
        group: 'Branch',
        label: BRANCHES[id].ref,
        hint: `${BRANCHES[id].org} · ${BRANCHES[id].range}`,
        icon: 'branch' as const,
        color: BRANCHES[id].color,
        run: () => {
          setSolo(id);
          select(firstOn(id), true);
        },
      })),
      {
        key: 'b-all',
        group: 'Branch',
        label: 'Show all branches',
        icon: 'branch' as const,
        run: () => setSolo(null),
      },
      ...LOG.map((c) => ({
        key: `c-${c.id}`,
        group: 'Commit',
        label: c.subject,
        hint: `${c.short} · ${c.date}`,
        icon: (c.kind === 'pr' ? 'pr' : 'commit') as IconName,
        color: c.branch.color,
        run: () => select(c.id, true),
      })),
      {
        key: 'l-mail',
        group: 'Link',
        label: `Email ${profile.email}`,
        icon: 'remote' as const,
        run: open(`mailto:${profile.email}`),
      },
      {
        key: 'l-in',
        group: 'Link',
        label: 'LinkedIn',
        hint: pretty(profile.linkedin),
        icon: 'external' as const,
        run: open(profile.linkedin),
      },
      {
        key: 'l-gh',
        group: 'Link',
        label: 'GitHub',
        hint: pretty(profile.github),
        icon: 'external' as const,
        run: open(profile.github),
      },
      {
        key: 'l-cv',
        group: 'Link',
        label: 'CV (PDF)',
        hint: profile.cv.split('/').pop(),
        icon: 'external' as const,
        run: open(profile.cv),
      },
      ...links
        .filter((l, i) => links.findIndex((m) => m.url === l.url) === i)
        .map((l) => ({
          key: `l-${l.url}`,
          group: 'Link',
          label: l.label,
          hint: pretty(l.url),
          icon: 'external' as const,
          run: open(l.url),
        })),
    ];
  }, [go, select]);

  return (
    <div className={s.root}>
      <a href="#history" className={s.skip}>
        Skip to the history
      </a>

      <header className={s.bar}>
        <a href="#top" className={s.repo}>
          <svg viewBox="0 0 20 20" width={20} height={20} aria-hidden="true">
            <path
              d="M6 3v14M6 13c0-4 8-3 8-7"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <circle cx={6} cy={3.5} r={2.2} style={{ fill: 'var(--red)' }} />
            <circle cx={14} cy={5} r={2.2} style={{ fill: 'var(--blue)' }} />
            <circle cx={6} cy={16.5} r={2.2} style={{ fill: 'var(--green)' }} />
          </svg>
          <span>
            <span className={s.owner}>{`${person.first.toLowerCase()} /`}</span> <b>career</b>
          </span>
        </a>
        <button
          type="button"
          className={s.headChip}
          onClick={() => select(HEAD, true)}
          aria-label={`HEAD is on ${head.branch.ref} at ${head.short}. Open it.`}
        >
          <Icon name="branch" />
          {head.branch.ref}
          <code>{head.short}</code>
        </button>
        <span className={s.barStatus}>1 change not committed</span>
        <button
          type="button"
          className={s.search}
          onClick={() => setPalette(true)}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Icon name="search" />
          <span>Go to anything</span>
          <kbd>⌘K</kbd>
        </button>
        <button
          type="button"
          className={s.schemeBtn}
          onClick={() => writeScheme(dark ? 'light' : 'dark')}
          aria-label="Dark mode"
          aria-pressed={dark}
          title={dark ? 'Switch to light' : 'Switch to dark'}
        >
          <Icon name="moon" className={s.moon} />
          <Icon name="sun" className={s.sun} />
        </button>
        <a href="#remotes" className={s.barLink}>
          Contact
        </a>
      </header>

      <div className={s.app}>
        <nav className={s.side} aria-label="Repository">
          <p className={s.sideHead}>Workspace</p>
          <ul className={s.sideList}>
            {SECTIONS.map(([id, label, icon, count]) => (
              <li key={id}>
                <a href={`#${id}`}>
                  <Icon name={icon} />
                  {label}
                  {count != null && <span className={s.count}>{count}</span>}
                </a>
              </li>
            ))}
          </ul>
          <p className={s.sideHead}>
            Branches <span>by last commit</span>
          </p>
          <ul className={s.sideList}>
            {BRANCH_ORDER.map((id) => {
              const b = BRANCHES[id];
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={solo === id}
                    onClick={() => soloBranch(id)}
                    style={{ '--c': b.color } as Vars}
                    title={`${b.org}: ${b.title}`}
                  >
                    <span className={s.laneDot} />
                    <span className={s.sideRef}>{b.ref}</span>
                    {id === 'neuroject' && <span className={s.headBadge}>HEAD</span>}
                    <span className={s.sideRange}>
                      {b.range.replace(' – ', '–').replace(/20(\d\d)/g, '’$1')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={s.sideNote}>Select a branch to solo it in the graph.</p>
        </nav>

        <main className={s.main}>
          {/* ---------------------------------------------------------- hero */}
          <section id="top" className={s.hero} aria-labelledby="name">
            <p className={s.byline}>
              <Image src={person.photo} width={56} height={56} alt="" priority />
              <span>
                <b>{profile.name}</b> committed to{' '}
                <span className={s.inlineRef}>{head.branch.ref}</span> · {head.date} ·{' '}
                <code>{head.short}</code>
              </span>
            </p>
            <h1 id="name">{profile.name}</h1>
            <p className={s.tagline}>{profile.tagline}</p>
            <p className={s.lede}>{profile.lede}</p>
            <div className={s.actions}>
              <a className={s.primary} href={`mailto:${profile.email}`}>
                {profile.email}
              </a>
              <a href={profile.linkedin} target="_blank" rel="noreferrer">
                LinkedIn
              </a>
              <a href={profile.github} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <a href={profile.cv} target="_blank" rel="noreferrer">
                CV
              </a>
              <button type="button" className={s.kbdHint} onClick={() => setPalette(true)}>
                <kbd>⌘</kbd>
                <kbd>K</kbd> to jump anywhere
              </button>
            </div>
            <Overview selected={selected} solo={solo} onSelect={select} />
          </section>

          {/* ---------------------------------------------------------- README */}
          <Section
            id="readme"
            cmd="git blame README.md"
            title="README.md"
            lede="Who I am, line by line, with the commit that wrote each line. Select a hash to open that commit."
          >
            <div className={s.readmeGrid}>
              <Readme onSelect={select} />
              <aside className={s.authorCard} aria-label="Author">
                <Image
                  src={person.photo}
                  width={600}
                  height={600}
                  alt={profile.name}
                  sizes="(max-width: 900px) 100vw, 320px"
                />
                <p className={s.authorLine}>
                  <code>
                    Author: {profile.name} &lt;{profile.email}&gt;
                  </code>
                </p>
                <dl className={s.stats}>
                  {stats.map((m) => (
                    <div key={m.label}>
                      <dt>{m.label}</dt>
                      <dd>{m.value}</dd>
                    </div>
                  ))}
                </dl>
                <h3 className={s.miniHead}>Toolchain</h3>
                <ul className={s.chips}>
                  {skills.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </aside>
            </div>
          </Section>

          {/* ---------------------------------------------------------- history */}
          <Section
            id="history"
            cmd="git log --graph --all --date=format:'%b %Y'"
            title="History"
            className={s.historySection}
            lede={
              <>
                {`One commit per highlight, curated from ${db.yearsBuilding} years (the real count is ${db.commits.total.short} commits since ${db.commits.since} alone). The hashes are real SHA-1s of each commit object, so they chain like git’s own. Select a commit to read it, or walk the log with `}
                <kbd>j</kbd> and <kbd>k</kbd>.
              </>
            }
          >
            <div className={s.soloBar} role="group" aria-label="Solo a branch">
              {BRANCH_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={solo === id}
                  onClick={() => soloBranch(id)}
                  style={{ '--c': BRANCHES[id].color } as Vars}
                >
                  <span className={s.laneDot} />
                  {BRANCHES[id].ref}
                </button>
              ))}
            </div>
            {solo && (
              <p className={s.soloNote}>
                Showing <b style={{ color: BRANCHES[solo].ink }}>{BRANCHES[solo].ref}</b> only.{' '}
                <button type="button" onClick={() => setSolo(null)}>
                  Show all branches
                </button>
              </p>
            )}
            <div className={s.client}>
              <Log selected={selected} solo={solo} onSelect={select} />
              <Inspector id={selected} open={sheet} onSelect={select} onClose={closeSheet} />
            </div>
          </Section>

          {/* ---------------------------------------------------------- branches */}
          <Section
            id="branches"
            cmd="git branch --all -vv --sort=-committerdate"
            title="Branches"
            lede="Every role, degree and side of the work, with where it lives today."
          >
            <div className={s.tableWrap}>
              <table className={s.branches}>
                <thead>
                  <tr>
                    <th scope="col">Branch</th>
                    <th scope="col">Where</th>
                    <th scope="col">Role</th>
                    <th scope="col">When</th>
                    <th scope="col">Tip</th>
                  </tr>
                </thead>
                <tbody>
                  {BRANCH_ORDER.map((id) => {
                    const b = BRANCHES[id];
                    const tip =
                      [...TIPS].find(([, branch]) => branch === id)?.[0] ?? commitsOn(id)[0].id;
                    const merged = LOG.find((c) => c.kind === 'merge' && c.parents[1] === tip);
                    return (
                      <tr key={id} style={{ '--c': b.color, '--lane-ink': b.ink } as Vars}>
                        <th scope="row">
                          <button
                            type="button"
                            className={s.branchName}
                            aria-pressed={solo === id}
                            onClick={() => soloBranch(id)}
                          >
                            <span className={s.star} aria-hidden="true">
                              {id === 'neuroject' ? '*' : ' '}
                            </span>
                            {b.ref}
                          </button>
                        </th>
                        <td>
                          {b.url ? (
                            <a href={b.url} target="_blank" rel="noreferrer">
                              {b.org}
                            </a>
                          ) : (
                            b.org
                          )}
                          <span className={s.summary}>{b.summary}</span>
                        </td>
                        <td>{b.title}</td>
                        <td className={s.mono}>{b.range}</td>
                        <td className={s.mono}>
                          <ShaButton id={tip} onSelect={select} />
                          <span className={s.track}>
                            {merged
                              ? 'merged into main'
                              : id === 'main'
                                ? 'default branch'
                                : id === 'neuroject'
                                  ? 'HEAD, open'
                                  : id === 'upstream'
                                    ? 'merged upstream'
                                    : 'open'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ---------------------------------------------------------- releases */}
          <Section
            id="releases"
            cmd="gh release list"
            title="Releases"
            lede="Platforms, apps and devices that shipped, with their live links."
          >
            <div className={s.releases}>
              {featuredProjects.map((p, i) => {
                const meta = RELEASES[p.title];
                const entry = firstBuild(p.title);
                const links = projectLinks(p.links);
                return (
                  <article
                    key={p.title}
                    className={`${s.release} ${i === 0 ? s.releaseWide : ''}`}
                    style={{ '--i': i } as Vars}
                  >
                    <div className={s.shot}>
                      <Image
                        src={p.image}
                        width={1280}
                        height={800}
                        alt={`${p.title} screenshot`}
                        sizes="(max-width: 900px) 100vw, 560px"
                      />
                    </div>
                    <div className={s.releaseText}>
                      <p className={s.releaseMeta}>
                        <Icon name="tag" />
                        <span>
                          {entry?.year === '—' ? entry.madeAt : `${entry?.year} · ${entry?.madeAt}`}
                        </span>
                        {meta?.commit && <ShaButton id={meta.commit} onSelect={select} />}
                        {meta?.submodule && (
                          <a className={s.shaBtn} href="#submodules">
                            {meta.submodule}
                          </a>
                        )}
                      </p>
                      <h3>{p.title}</h3>
                      <p>{p.description}</p>
                      <p className={s.builtWith}>{p.tech.join(' · ')}</p>
                      {links.length > 0 ? (
                        <Links links={links} />
                      ) : (
                        <p className={s.noAssets}>No public assets: it runs in the field.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <h3 className={s.subHead}>More releases</h3>
            <ul className={s.more}>
              {MORE.map((p) => (
                <li key={p.title}>
                  <h4>{p.title}</h4>
                  <p>{p.description}</p>
                  <p className={s.builtWith}>{p.tech.join(' · ')}</p>
                  {projectLinks(p.links).length > 0 && <Links links={projectLinks(p.links)} />}
                </li>
              ))}
            </ul>
          </Section>

          {/* ---------------------------------------------------------- pull requests */}
          <Section
            id="pulls"
            cmd={`gh pr list --author ${person.githubUser} --state merged`}
            title="Pull requests"
            lede={`Fixes sent upstream to packages downloaded ${db.downloads.weekly.long} times a week. Each diff reads as the problem, then the fix.`}
          >
            <div className={s.pulls}>
              {oss.map((c, i) => {
                const id = LOG.find((x) => x.pr?.repo === c.repo)?.id;
                return (
                  <article key={c.repo} className={s.pull} style={{ '--i': i } as Vars}>
                    <header>
                      <span className={s.merged}>
                        <Icon name="pr" />
                        Merged
                      </span>
                      <a href={c.url} target="_blank" rel="noreferrer" className={s.pullRepo}>
                        <b>{c.repo}</b> #{c.url.split('/').pop()}
                      </a>
                      <span className={s.pullYear}>{c.year}</span>
                    </header>
                    <p className={s.prMeta}>
                      <span
                        className={`${s.label} ${c.kind === 'Security' || c.kind === 'Data loss' ? s.labelHot : ''}`}
                      >
                        {c.kind}
                      </span>
                      ★ {c.stars} · {c.weekly} downloads a week
                      {id && (
                        <button
                          type="button"
                          className={s.shaBtn}
                          onClick={() => select(id, true)}
                          style={{ '--c': BRANCHES.upstream.color } as Vars}
                        >
                          Find in history
                        </button>
                      )}
                    </p>
                    <Diff
                      minus={c.impact}
                      plus={c.change}
                      label={`What the pull request to ${c.repo} changed`}
                    />
                  </article>
                );
              })}
            </div>
          </Section>

          {/* ---------------------------------------------------------- submodules */}
          <Section
            id="submodules"
            cmd="git submodule status"
            title="Submodules"
            lede={`Hardware lives in its own repositories, pinned here. ${fmt.Spell(hardware.length)} devices, all in production.`}
          >
            <div ref={devices} data-live={(live && !reduced) || undefined}>
              <pre className={s.status} aria-label="Submodule status">
                {SUBMODULES.map((m) => (
                  <span key={m.path}>
                    {' '}
                    <span className={s.statusSha}>{m.sha}</span> {m.path} ({m.tag}){'\n'}
                  </span>
                ))}
              </pre>
              <div className={s.devices}>
                {SUBMODULES.map((d, i) => (
                  <article key={d.tag} className={s.device} style={{ '--i': i } as Vars}>
                    <header>
                      <span className={s.led} aria-hidden="true" />
                      <code>{d.path}</code>
                      <span className={s.devTag}>{d.tag}</span>
                    </header>
                    <h3>{d.name}</h3>
                    <p className={s.devKind}>{d.kind}</p>
                    <p>{d.detail}</p>
                    <ul className={s.figures}>
                      {d.figures.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          </Section>

          {/* ---------------------------------------------------------- tags */}
          <Section
            id="tags"
            cmd="git tag -n --sort=creatordate"
            title="Tags"
            lede={`The roots: ${db.education.bsc.focus.toLowerCase()}, robots, ${fmt.spell(Object.keys(db.education).length)} degrees and a paper.`}
          >
            <ol className={s.tags}>
              {TAGGED.map(({ r, c }) => (
                <li key={r.title}>
                  {c ? (
                    <button type="button" className={s.tagName} onClick={() => select(c.id, true)}>
                      <Icon name="tag" />
                      {c.tags[0]}
                    </button>
                  ) : (
                    <span />
                  )}
                  <div>
                    <h3>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}
                    </h3>
                    <p>{r.detail}</p>
                  </div>
                  <span className={s.tagYear}>{r.year}</span>
                </li>
              ))}
            </ol>
          </Section>

          {/* ---------------------------------------------------------- remotes */}
          <Section id="remotes" cmd="git remote -v" title="Remotes">
            <div className={s.remotes}>
              <div className={s.push}>
                <p className={s.pushBig}>Pull requests welcome.</p>
                <p>
                  A platform to architect, a device to bring online, or a team to build: send it to
                  origin.
                </p>
                <a className={s.mail} href={`mailto:${profile.email}`}>
                  {profile.email}
                </a>
              </div>
              <table className={s.remoteTable}>
                <caption className={s.sr}>Remotes</caption>
                <tbody>
                  {REMOTES.map(([name, url, dir]) => (
                    <tr key={`${name}-${dir}`}>
                      <th scope="row">{name}</th>
                      <td>
                        <a
                          href={url}
                          target={url.startsWith('mailto:') ? undefined : '_blank'}
                          rel="noreferrer"
                        >
                          {url.startsWith('/') ? `${person.site}${url}` : pretty(url)}
                        </a>
                      </td>
                      <td className={s.dir}>({dir})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <footer className={s.footer}>
            <p>
              <code>
                {`On branch ${head.branch.ref} · Changes not committed: `}
                <span className={s.untracked}>{commit(WIP).subject}</span>
              </code>
            </p>
            <p>
              © {profile.fullName}
              {`, ${person.since} → ${db.asOf.y} · ${concept('history').name}, concept ${concept('history').letter}`}
            </p>
          </footer>
        </main>
      </div>

      <Palette open={palette} items={items} onClose={() => setPalette(false)} />
    </div>
  );
}
