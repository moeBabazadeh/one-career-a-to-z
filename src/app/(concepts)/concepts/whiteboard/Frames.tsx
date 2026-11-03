'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NOW,
  about,
  db,
  featuredProjects,
  fmt,
  jobs,
  oss,
  otherProjects,
  profile,
  roles,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import {
  BLUE,
  FRAMES,
  GREEN,
  INK,
  ORANGE,
  RED,
  STICKY,
  STICKY_BLUE,
  STICKY_GREEN,
  STICKY_RED,
  type FrameId,
  type FrameSpec,
} from './geometry';
import { hachure, hash, line, path, prng, rect, toPath, arrowHead, type Pt } from './rough';
import s from './whiteboard.module.scss';

/* ------------------------------------------------------------------ hand-drawn primitives */

/**
 * A rough rectangle around its parent, sized to whatever the parent turns out to be. The
 * parent needs `position: relative`. With `fill`, the box is hachured in that colour.
 */
export function Rough({
  seed,
  fill,
  stroke = INK,
  width = 1.6,
  className,
}: {
  seed: string;
  fill?: string;
  stroke?: string;
  width?: number;
  className?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<[number, number] | null>(null);

  useEffect(() => {
    const el = svg.current?.parentElement;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize([el.offsetWidth, el.offsetHeight]));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const d = useMemo(() => {
    if (!size || !size[0]) return null;
    const r = prng(hash(seed));
    const [w, h] = size;
    const k = Math.min(1, Math.max(0.5, Math.min(w, h) / 120));
    return {
      outline: toPath(rect(r, 1, 1, w - 2, h - 2, k)),
      fill: fill
        ? toPath(
            hachure(
              r,
              [
                [2, 2],
                [w - 2, 2],
                [w - 2, h - 2],
                [2, h - 2],
              ],
              7,
              -41,
              k,
            ),
          )
        : null,
    };
  }, [size, seed, fill]);

  return (
    <svg ref={svg} className={`${s.rough} ${className ?? ''}`} aria-hidden="true">
      {d?.fill && <path d={d.fill} style={{ stroke: fill }} strokeWidth={width * 0.6} />}
      {d && <path d={d.outline} style={{ stroke }} strokeWidth={width} />}
    </svg>
  );
}

/** A small hand-drawn arrow in a fixed box, for margin notes. */
function Doodle({
  points,
  w,
  h,
  color = RED,
  seed,
  className,
}: {
  points: Pt[];
  w: number;
  h: number;
  color?: string;
  seed: string;
  className?: string;
}) {
  const d = useMemo(() => {
    const r = prng(hash(seed));
    return toPath([
      ...path(r, points, 0.8),
      ...arrowHead(r, points[points.length - 2], points[points.length - 1], 16, 0.8),
    ]);
  }, [points, seed]);
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={d} style={{ stroke: color }} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** A hand-drawn underline that stretches to its parent's width. */
function Underline({ seed, color = RED }: { seed: string; color?: string }) {
  const d = useMemo(() => toPath(line(prng(hash(seed)), 2, 6, 298, 3, 0.8)), [seed]);
  return (
    <svg className={s.underline} viewBox="0 0 300 10" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} style={{ stroke: color }} />
    </svg>
  );
}

function Sticky({
  children,
  tone = STICKY,
  tilt = 0,
  className,
}: {
  children: React.ReactNode;
  tone?: string;
  tilt?: number;
  className?: string;
}) {
  return (
    <div
      className={`${s.sticky} ${className ?? ''}`}
      style={{ '--tone': tone, '--tilt': `${tilt}deg` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

function Links({ links }: { links: Parameters<typeof projectLinks>[0] }) {
  const items = projectLinks(links);
  if (!items.length) return null;
  return (
    <span className={s.links}>
      {items.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label} ↗
        </a>
      ))}
    </span>
  );
}

function Head({
  id,
  kicker,
  title,
  children,
}: {
  id: FrameId;
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={s.fhead}>
      <p className={s.kicker}>{kicker}</p>
      <h2 id={`f-${id}-h`}>
        {title}
        <Underline seed={`u-${id}`} color={id === 'contact' ? RED : BLUE} />
      </h2>
      {children}
    </header>
  );
}

/* ------------------------------------------------------------------ frames */

// "Building since 2007: robots, IoT and firmware, then ..." as a heading and the rest.
const SINCE = profile.lede.split('. ')[1].split(': ');
const { neuroship } = db.roles;

function About() {
  return (
    <div className={s.about}>
      <figure className={s.polaroid} style={{ '--tilt': '-3deg' } as React.CSSProperties}>
        <span className={s.tape} aria-hidden="true" />
        <Image
          src={db.person.photo}
          width={600}
          height={600}
          alt={profile.name}
          draggable={false}
        />
        <figcaption>
          {profile.name} · {profile.role} @ {profile.company}
        </figcaption>
      </figure>
      <div className={s.prose}>
        <p className={s.lead}>{profile.tagline}</p>
        {about.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </div>
      <aside className={s.aboutSide}>
        <Sticky tilt={2}>
          <b>Now</b>
          {`${profile.role} at `}
          <a href={profile.companyUrl} target="_blank" rel="noreferrer">
            {profile.company}
          </a>
          {` since ${fmt.month(db.current.since)}, and ${db.titleOf(neuroship)} at ${neuroship.org} on contract.`}
        </Sticky>
        <Sticky tone={STICKY_BLUE} tilt={-2}>
          <b>{SINCE[0]}</b>
          {SINCE[1]}
        </Sticky>
        <ul className={s.contactList}>
          <li>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
          </li>
          <li>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
          </li>
          <li>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
          </li>
          <li>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV (PDF) ↗
            </a>
          </li>
        </ul>
      </aside>
    </div>
  );
}

const PINS = [RED, BLUE, GREEN, ORANGE, RED];
const TILTS = [-2.2, 1.6, -1, 2, -1.6];

function Shipped() {
  return (
    <ul className={s.polaroids}>
      {featuredProjects.map((p, i) => (
        <li
          key={p.title}
          className={`${s.polaroid} ${s.project}`}
          style={{ '--tilt': `${TILTS[i]}deg`, '--pin': PINS[i] } as React.CSSProperties}
        >
          <span className={s.pin} aria-hidden="true" />
          <Image
            src={p.image}
            width={1280}
            height={800}
            alt={`${p.title} screenshot`}
            draggable={false}
          />
          <h3>{p.title}</h3>
          <p>{p.description}</p>
          <span className={s.tech}>{p.tech.join(' · ')}</span>
          <Links links={p.links} />
        </li>
      ))}
    </ul>
  );
}

// Open-source pull requests have their own frame upstream.
const ALSO = otherProjects.filter((p) => !p.links.github?.includes('/pull/'));

function More() {
  return (
    <ul className={s.cards}>
      {ALSO.map((p) => (
        <li key={p.title} className={s.card}>
          <Rough seed={p.title} />
          <h3>{p.title}</h3>
          <p>{p.description}</p>
          <span className={s.tech}>{p.tech.join(' · ')}</span>
          <Links links={p.links} />
        </li>
      ))}
    </ul>
  );
}

// The axis runs from the year he started to the end of the facts' year.
const Y0 = db.person.since,
  Y1 = Math.floor(NOW) + 1;
const pct = (y: number) => `${(((y - Y0) / (Y1 - Y0)) * 100).toFixed(2)}%`;
const LANE_TONES = [BLUE, GREEN, RED, ORANGE, BLUE, GREEN];
const LANES = [...roles].sort(
  (a, b) => (b.end ?? NOW + 1) - (a.end ?? NOW + 1) || a.start - b.start,
);
const jobFor = (org: string) => jobs.find((j) => org.startsWith(j.company));
/** "February 2021 – December 2024" as "Feb 2021 – Dec 2024", so it fits on one line. */
const short = (range: string) =>
  range.replace(/([A-Z][a-z]{2})[a-z]+ (\d{4})/g, '$1 $2').replace('Present', 'now');

function Work() {
  return (
    <div
      className={s.timeline}
      style={{ '--now': ((NOW - Y0) / (Y1 - Y0)).toFixed(4) } as React.CSSProperties}
    >
      <ol className={s.lanes}>
        {LANES.map((r, i) => {
          const job = jobFor(r.org);
          const late = (r.start - Y0) / (Y1 - Y0) > 0.55;
          return (
            <li key={r.id} className={s.lane}>
              <div className={s.laneLabel}>
                <h3>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.org}
                    </a>
                  ) : (
                    r.org
                  )}
                </h3>
                <p>{r.title}</p>
                <code className={r.end ? s.exited : s.up}>
                  {r.end ? '○ Exited (0)' : '● Up'} · {job ? short(job.range) : r.range}
                </code>
              </div>
              <div className={s.track}>
                <span
                  className={`${s.bar} ${r.end ? '' : s.open}`}
                  style={{
                    left: pct(r.start),
                    width: `calc(${pct(r.end ?? NOW)} - ${pct(r.start)})`,
                  }}
                >
                  <Rough
                    seed={r.id}
                    fill={`color-mix(in srgb, ${LANE_TONES[i]} 40%, transparent)`}
                    width={1.5}
                  />
                </span>
                <span
                  className={`${s.summary} ${late ? s.summaryEnd : ''}`}
                  style={
                    late ? { right: `calc(100% - ${pct(r.end ?? NOW)})` } : { left: pct(r.start) }
                  }
                >
                  {r.summary}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className={s.axis} aria-hidden="true">
        {Array.from({ length: Math.floor((Y1 - Y0) / 2) + 1 }, (_, i) => Y0 + i * 2).map((y) => (
          <span key={y} style={{ left: pct(y) }}>
            {y}
          </span>
        ))}
      </div>
      <span className={s.nowLine} aria-hidden="true">
        <b>now</b>
      </span>
    </div>
  );
}

function Log() {
  return (
    <div className={s.changelog}>
      {jobs.map((j) => (
        <article key={j.company}>
          <h3>
            <span className={s.version}>[{j.range}]</span> {j.title} ·{' '}
            {j.url ? (
              <a href={j.url} target="_blank" rel="noreferrer">
                {j.company}
              </a>
            ) : (
              j.company
            )}
          </h3>
          <ul>
            {j.duties.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

// Each record restates something from the roles and projects above; nothing here is new.
const { neuroject, zeroone } = db.roles;
const { neurobuild, smartclaim, activeClass } = db.products;
const ADRS = [
  {
    title: 'One platform for BIM, schedules, budgets and risks',
    decision: `A cloud-native, multi-tenant platform that connects them into traceable decisions: ${neurobuild.title}.`,
    where: neuroject.org,
  },
  {
    title: `${neurobuild.title}’s stack`,
    decision: `Next.js and React 19 on AWS Amplify, Laravel on Laravel Vapor. ${db.commits.neurobuild.short} commits across ${fmt.spell(db.commits.neurobuildCodebases)} codebases so far.`,
    where: neuroject.org,
  },
  {
    title: 'A permission check on every API route',
    decision: 'Every route checks permissions, backed by audit trails.',
    where: neuroject.org,
  },
  {
    title: 'Alarms live in code',
    decision: 'Production alarms and GuardDuty alerts are kept in infrastructure as code.',
    where: neuroject.org,
  },
  {
    title: 'AI inside the platform',
    decision:
      'Natural-language access to project data, and early warning on schedule and cost risk.',
    where: neuroject.org,
  },
  {
    title: 'Security gates on every pull request',
    decision: 'Secret scanning, Semgrep and Trivy run on every PR.',
    where: smartclaim.title,
  },
  {
    title: 'Identity checks in live exams',
    decision: 'The Microsoft Azure Face API checks who is sitting the exam.',
    where: `${zeroone.org} · ${activeClass.title}`,
  },
  {
    title: 'Leaner CI/CD',
    decision: 'Redesigned the pipelines to cut build and deployment overhead.',
    where: zeroone.org,
  },
];

function Decisions() {
  return (
    <ol className={s.adrs}>
      {ADRS.map((a, i) => (
        <li key={a.title} className={s.card}>
          <Rough seed={a.title} />
          <p className={s.adrMeta}>
            <code>ADR-{String(i + 1).padStart(3, '0')}</code>
            <span className={s.accepted}>Accepted</span>
          </p>
          <h3>{a.title}</h3>
          <p>{a.decision}</p>
          <span className={s.tech}>{a.where}</span>
        </li>
      ))}
    </ol>
  );
}

function Oss() {
  return (
    <div className={s.ossGrid}>
      <ul className={s.prs}>
        {oss.map((c) => (
          <li key={c.repo} className={s.card}>
            <Rough seed={c.repo} />
            <p className={s.prMeta}>
              <code>#{c.url.split('/').pop()}</code>
              <span
                className={`${s.kind} ${c.kind === 'Security' || c.kind === 'Data loss' ? s.hot : ''}`}
              >
                {c.kind}
              </span>
              <span>{c.year}</span>
            </p>
            <h3>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.repo} ↗
              </a>
            </h3>
            <p>{c.change}</p>
            <p className={s.why}>{c.impact}</p>
            <span className={s.tech}>
              ★ {c.stars} · {c.weekly} downloads a week
            </span>
          </li>
        ))}
      </ul>
      <Sticky tilt={3} className={s.ossNote}>
        <b>{stats[5].value}</b>
        {stats[5].label}
      </Sticky>
    </div>
  );
}

const TONES = [STICKY, STICKY_BLUE, STICKY_GREEN, STICKY_RED, STICKY, STICKY_BLUE];

function Numbers() {
  return (
    <div className={s.numbers}>
      <ul className={s.stats}>
        {stats.map((m, i) => (
          <li key={m.label}>
            <Sticky tone={TONES[i]} tilt={[-2, 1.5, -1, 2.5, -1.8, 1][i]}>
              <b className={s.big}>{m.value}</b>
              {m.label}
            </Sticky>
          </li>
        ))}
      </ul>
      <div className={s.entity}>
        <Rough seed="entity" />
        <p className={s.entityHead}>
          <code>TABLE</code> moe.stack
        </p>
        <ol>
          {skills.map((k, i) => (
            <li key={k}>
              <code>{i === 0 ? 'PK' : String(i + 1).padStart(2, '0')}</code>
              {k}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Roots() {
  return (
    <ol className={s.roots}>
      {roots.map((r) => (
        <li key={r.title}>
          <code>{r.year}</code>
          <h3>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.title} ↗
              </a>
            ) : (
              r.title
            )}
          </h3>
          <p>{r.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function Contact() {
  return (
    <div className={s.contact}>
      <div className={s.contactMain}>
        <p className={s.contactLead}>
          Building a platform, growing a team, or stuck on an architecture call? Write to me.
        </p>
        <a className={s.email} href={`mailto:${profile.email}`}>
          <Rough seed="email" fill={STICKY} width={2} />
          {profile.email}
        </a>
        <ul className={s.contactLinks}>
          <li>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
          </li>
          <li>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
          </li>
          <li>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV (PDF) ↗
            </a>
          </li>
        </ul>
      </div>
      <div className={s.request} aria-hidden="true">
        <Rough seed="request" />
        <pre>
          <b>POST</b> /hello HTTP/1.1{'\n'}
          {`Host: ${db.person.site}`}
          {'\n'}
          Content-Type: text/plain{'\n'}
          {'\n'}
          <i>{`Hi ${db.person.first}, we’re building …`}</i>
        </pre>
      </div>
      <p className={s.emailMe} aria-hidden="true">
        email me!
      </p>
      <Doodle
        seed="email-arrow"
        className={s.emailArrow}
        w={200}
        h={120}
        points={[
          [176, 18],
          [170, 72],
          [104, 96],
          [16, 52],
        ]}
      />
    </div>
  );
}

const CONTENT: Record<FrameId, { kicker: string; title: string; body: () => React.ReactNode }> = {
  about: { kicker: 'API gateway → about me', title: `Hi, I’m ${db.person.first}.`, body: About },
  shipped: { kicker: 'Client → what people use', title: 'Shipped', body: Shipped },
  more: { kicker: 'Client → also shipped', title: 'Also shipped', body: More },
  work: { kicker: 'Services → where I’ve worked', title: 'Where I’ve worked', body: Work },
  log: { kicker: 'Services → what each role shipped', title: 'Changelog', body: Log },
  decisions: { kicker: 'Team → how I lead', title: 'Decision log', body: Decisions },
  oss: { kicker: 'Upstream → open-source fixes', title: 'Upstream fixes', body: Oss },
  data: { kicker: 'Data → numbers & stack', title: 'Numbers & stack', body: Numbers },
  roots: { kicker: 'Cold storage → roots', title: 'Roots', body: Roots },
  contact: { kicker: 'Inbox → POST /hello', title: 'Email me', body: Contact },
};

/** One frame on the board: named above its top-left corner, outlined by hand. */
export function Frame({ spec, onFocus }: { spec: FrameSpec; onFocus: (id: FrameId) => void }) {
  const { kicker, title, body: Body } = CONTENT[spec.id];
  const n = FRAMES.indexOf(spec) + 1;
  const { x, y, w, h } = spec.rect;
  return (
    <section
      id={`f-${spec.id}`}
      className={`${s.frame} ${s[`f_${spec.id}`] ?? ''}`}
      style={{ '--x': x, '--y': y, '--w': w, '--h': h } as React.CSSProperties}
      tabIndex={0}
      aria-labelledby={`f-${spec.id}-h`}
      data-content=""
      onFocus={() => onFocus(spec.id)}
    >
      <p className={s.frameName} aria-hidden="true">
        <span>Frame {String(n).padStart(2, '0')}</span> {spec.name}
      </p>
      <Rough seed={`frame-${spec.id}`} className={s.frameEdge} width={1.8} />
      <Head id={spec.id} kicker={kicker} title={title} />
      <Body />
    </section>
  );
}
