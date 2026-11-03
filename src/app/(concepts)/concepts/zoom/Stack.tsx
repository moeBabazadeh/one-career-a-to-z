'use client';

import Image from 'next/image';
import { useEffect } from 'react';
import {
  NOW,
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
  roles,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import Gauge from './Gauge';
import { readFonts } from './kit';
import { CanvasScene, Layer } from './Layer';
import { LAYERS } from './layers';
import Ascent from './scenes/Ascent';
import { DB_CAPTIONS, DB_ROWS, drawBtree } from './scenes/btree';
import { CPU_CAPTIONS, drawCpu } from './scenes/cpu';
import { KERNEL_CAPTIONS, drawKernel } from './scenes/kernel';
import { LOOP, drawLoop } from './scenes/loop';
import { NET_CAPTIONS, drawNetwork } from './scenes/network';
import Render3D, { PIPELINE } from './scenes/Render3D';
import { SERVER_CAPTIONS, drawServers } from './scenes/servers';
import { SILICON_CAPTIONS, drawSilicon } from './scenes/silicon';
import Surface from './scenes/Surface';
import { TLS_CAPTIONS, drawTls } from './scenes/tls';
import s from './stack.module.scss';
import { conceptTitle } from '../_shared/concepts';

const L = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

const RENDER_CAPTIONS = [
  `${PIPELINE[0]}: the pointer’s (x, y) is walked down the layer tree to the topmost element there: a.hire.`,
  `${PIPELINE[1]}: :active now matches, so the button’s computed style changes.`,
  `${PIPELINE[2]}: geometry is recomputed only for boxes that moved. A transform moves none.`,
  `${PIPELINE[3]}: each layer records its draw calls, then rasterises them into tiles.`,
  `${PIPELINE[4]}: the GPU stacks the layers into one frame. The budget is 16.7 ms.`,
];

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (year: number) =>
  `${MONTHS[Math.min(11, Math.floor((year % 1) * 12))]} ${Math.floor(year)}`;
const span = (a: number, b: number) => {
  const months = Math.round((b - a) * 12);
  const y = Math.floor(months / 12),
    m = months % 12;
  return [y && `${y}y`, m && `${m}m`].filter(Boolean).join(' ') || '<1m';
};

const { person, products, commits, education, papers } = db;
const { logger } = db.devices;
const { bsc, msc } = education;

/** The Logger's record count as a plain size: "half a billion". */
const LOGGED = logger.records.long.replace(/^(over|more than) /, '');

// Other projects, minus the open-source fixes that already have their own layer.
const fixes = new Set(oss.map((c) => c.url));
const POOLS: { name: string; titles: string[] }[] = [
  {
    name: 'web and mobile',
    titles: [
      products.educationGuide,
      products.schoolHow,
      products.learningKit,
      products.examKit,
    ].map((p) => p.title),
  },
  {
    name: 'devices and IoT',
    titles: [products.epc, products.miniPlc, products.pulseIot].map((p) => p.title),
  },
  {
    name: 'tools and libraries',
    titles: [products.photoDedup, products.matrixKeypad].map((p) => p.title),
  },
];
const pool = (titles: string[]) =>
  otherProjects.filter(
    (p) => titles.includes(p.title) && !(p.links.github && fixes.has(p.links.github)),
  );

/** A job title as a function name: "Chief Full Stack Engineer" → chiefFullStackEngineer. */
const fnName = (title: string) =>
  title
    .split(/\s+/)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join('');

const current = jobs.filter((j) => j.range.endsWith('Present'));
const past = jobs.filter((j) => !j.range.endsWith('Present'));
const ROLES = [...roles].sort((a, b) => b.start - a.start);
// The career axis runs from the first year building to the end of this one, a tick every five years.
const Y0 = person.since,
  Y1 = Math.floor(NOW) + 1;
const GX = (y: number) => ((y - Y0) / (Y1 - Y0)) * 100;
const TICKS = Array.from({ length: Math.ceil((Y1 - Y0) / 5) }, (_, i) => Y0 + i * 5);

export default function Stack() {
  useEffect(() => {
    readFonts();
    document.fonts?.ready.then(readFonts);
  }, []);

  return (
    <div className={s.root}>
      <a href="#render" className={s.skip}>
        Skip the intro
      </a>
      <main>
        <Surface />
        <Gauge />

        <Layer
          info={L.render}
          title="Platforms I’ve shipped"
          intro={
            <p>
              The click lands on one pixel. To learn who owns it, the browser hit-tests down through
              the page’s compositing layers. These are the layers I’ve built and led.
            </p>
          }
          captions={RENDER_CAPTIONS}
          scene={() => <Render3D />}
        >
          {featuredProjects.map((p, i) => (
            <article key={p.title} className={s.card}>
              <p className={s.cardMeta}>
                <span>
                  layer {i + 1} of {featuredProjects.length}
                </span>
                <span>{p.tech.join(' · ')}</span>
              </p>
              <figure className={s.shot}>
                <Image
                  src={p.image}
                  width={1280}
                  height={800}
                  alt={`${p.title} screenshot`}
                  sizes="(max-width: 1100px) 92vw, 440px"
                />
              </figure>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <Links links={p.links} />
            </article>
          ))}
        </Layer>

        <Layer
          info={L.loop}
          title="What’s on my call stack"
          intro={<p>{profile.lede}</p>}
          captions={LOOP.map((st) => st.caption)}
          scene={(progress) => (
            <CanvasScene
              draw={drawLoop}
              progress={progress}
              poster={0.45}
              label="The event loop: a call stack, Web APIs, a task queue and a microtask queue, stepping through a click, a fetch and its response."
            />
          )}
        >
          <div className={`${s.card} ${s.trace}`}>
            <p className={s.cardMeta}>
              <span>console.trace()</span>
              <span>{fmt.month(db.asOf)}</span>
            </p>
            <pre>
              {'Trace: now\n'}
              {current
                .map(
                  (j) =>
                    `    at ${fnName(j.title)} (${j.url ? new URL(j.url).host : j.company.toLowerCase()})\n`,
                )
                .join('')}
              {`    at <anonymous> (${person.since})`}
            </pre>
          </div>
          {current.map((j) => (
            <article key={j.company} className={s.card}>
              <p className={s.cardMeta}>
                <span>running</span>
                <span>{j.range}</span>
              </p>
              <h3>
                {j.title} ·{' '}
                {j.url ? (
                  <a href={j.url} target="_blank" rel="noreferrer">
                    {j.company} ↗
                  </a>
                ) : (
                  j.company
                )}
              </h3>
              <ul className={s.duties}>
                {j.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </article>
          ))}
        </Layer>

        <Layer
          info={L.tls}
          title="About"
          intro={<p>The request leaves over TLS 1.3. Here’s what comes back.</p>}
          captions={TLS_CAPTIONS}
          scene={(progress) => (
            <CanvasScene
              draw={drawTls}
              progress={progress}
              poster={0.7}
              label="A sequence diagram: the TCP handshake, a one round trip TLS 1.3 handshake, then an HTTP/2 POST and its 200 response."
            />
          )}
        >
          <article className={`${s.card} ${s.response}`}>
            <p className={s.cardMeta}>
              <span>response · stream 1</span>
              <span>HEADERS</span>
            </p>
            <div className={s.headersRow}>
              <figure className={s.portrait}>
                <Image
                  src={person.photo}
                  width={600}
                  height={600}
                  alt={profile.name}
                  sizes="120px"
                />
              </figure>
              <dl className={s.headers}>
                <div>
                  <dt>:status</dt>
                  <dd>200</dd>
                </div>
                <div>
                  <dt>x-name</dt>
                  <dd>
                    {profile.fullName}
                    {` (${person.first})`}
                  </dd>
                </div>
                <div>
                  <dt>x-role</dt>
                  <dd>
                    {profile.role}, {profile.company}
                  </dd>
                </div>
                <div>
                  <dt>x-building-since</dt>
                  <dd>{person.since}</dd>
                </div>
              </dl>
            </div>
            <dl className={s.headers}>
              <div className={s.wide}>
                <dt>x-stack</dt>
                <dd>{skills.join(', ')}</dd>
              </div>
            </dl>
          </article>
          {about.map((para, i) => (
            <article key={para.slice(0, 24)} className={s.card}>
              <p className={s.cardMeta}>
                <span>DATA · stream 1</span>
                <span>
                  frame {i + 1} of {about.length}
                  {i === about.length - 1 ? ' · END_STREAM' : ''}
                </span>
              </p>
              <p className={s.prose}>{para}</p>
            </article>
          ))}
        </Layer>

        <Layer
          info={L.network}
          title="Patches I sent upstream"
          intro={
            <p>{`Upstream is where packets go, and where fixes belong. Pull requests to open source packages that, together, are downloaded ${db.downloads.weekly.long} times a week.`}</p>
          }
          captions={NET_CAPTIONS}
          scene={(progress) => (
            <CanvasScene
              draw={drawNetwork}
              progress={progress}
              poster={0.5}
              label="A route across the network: routers hop by hop, a subsea cable across the ocean, packets losing one TTL per router, and a traceroute filling in."
            />
          )}
        >
          {oss.map((c) => (
            <article key={c.repo} className={`${s.card} ${s.packet}`}>
              <p className={s.packetHead}>
                <span>{`src ${person.githubUser}`}</span>
                <span>dst {c.repo}</span>
                <span>{c.year}</span>
                <span
                  className={c.kind === 'Security' || c.kind === 'Data loss' ? s.flagHot : s.flag}
                >
                  {c.kind}
                </span>
              </p>
              <h3>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.repo} ↗
                </a>
              </h3>
              <p>{c.change}</p>
              <p className={s.muted}>{c.impact}</p>
              <p className={s.cardMeta}>
                <span>★ {c.stars}</span>
                <span>{c.weekly} downloads a week</span>
              </p>
            </article>
          ))}
        </Layer>

        <Layer
          info={L.servers}
          title="More I’ve built"
          intro={
            <p>
              Behind one hostname, a pool of instances. Behind the platforms, a pool of smaller
              builds: apps, sites, firmware and tools.
            </p>
          }
          captions={SERVER_CAPTIONS}
          scene={(progress) => (
            <CanvasScene
              draw={drawServers}
              progress={progress}
              poster={0.7}
              label="A load balancer spreading requests across a pool of servers, with health checks, one instance drained and autoscaling. The traffic is simulated."
            />
          )}
        >
          {POOLS.map((group) => (
            <article key={group.name} className={s.card}>
              <p className={s.cardMeta}>
                <span>target group</span>
                <span>{group.name}</span>
              </p>
              <ul className={s.instances}>
                {pool(group.titles).map((p, i) => (
                  <li key={p.title}>
                    <span className={s.instanceId}>i-0{i + 1}</span>
                    <div>
                      <h3>{p.title}</h3>
                      <p>{p.description}</p>
                      <p className={s.tech}>{p.tech.join(' · ')}</p>
                      <Links links={p.links} />
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </Layer>

        <Layer
          info={L.database}
          title="The numbers"
          intro={
            <p>{`Finding one row among ${LOGGED} takes a handful of page reads. Here are the rows that describe me, then the whole archive.`}</p>
          }
          captions={DB_CAPTIONS}
          scene={(progress) => (
            <CanvasScene
              draw={drawBtree}
              progress={progress}
              poster={0.95}
              label={`A B+tree index lookup: root, inner page and leaf, then tuple IDs followed into heap pages, returning ${fmt.spell(DB_ROWS)} rows from the archive.`}
            />
          )}
        >
          <article className={s.card}>
            <p className={s.query}>=# SELECT value, label FROM stats;</p>
            <table className={s.result}>
              <thead>
                <tr>
                  <th>value</th>
                  <th>label</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((st) => (
                  <tr key={st.label}>
                    <td className={s.num}>{st.value}</td>
                    <td>{st.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={s.rows}>({stats.length} rows)</p>
          </article>
          <article className={s.card}>
            <p className={s.query}>
              =# SELECT year, title, made_at FROM archive ORDER BY year DESC;
            </p>
            <table className={`${s.result} ${s.archive}`}>
              <thead>
                <tr>
                  <th>year</th>
                  <th>title</th>
                  <th>made_at</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((a) => {
                  const link = projectLinks(a.links)[0];
                  return (
                    <tr key={a.title}>
                      <td className={s.num}>{a.year}</td>
                      <td>
                        {link ? (
                          <a href={link.url} target="_blank" rel="noreferrer">
                            {a.title} ↗
                          </a>
                        ) : (
                          a.title
                        )}
                      </td>
                      <td className={s.muted}>{a.madeAt ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={s.rows}>({archive.length} rows)</p>
          </article>
        </Layer>

        <Layer
          info={L.kernel}
          title="Career"
          intro={
            <p>{`The kernel decides what runs, when, and with what permissions. Here’s what has been scheduled since ${person.since}.`}</p>
          }
          captions={KERNEL_CAPTIONS}
          scene={(progress) => (
            <CanvasScene
              draw={drawKernel}
              progress={progress}
              poster={0.5}
              label="An strace of the request’s syscalls crossing from user space into the kernel, above a scheduler timeline of four CPU cores."
            />
          )}
        >
          <article className={s.card}>
            <p className={s.query}>$ ps -o pid,stat,start,time,cmd --sort=-start</p>
            <svg
              className={s.gantt}
              viewBox="0 0 100 64"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {TICKS.map((y) => (
                <line key={y} x1={GX(y)} x2={GX(y)} y1={0} y2={64} className={s.ganttGrid} />
              ))}
              {[...roles]
                .sort((a, b) => a.start - b.start)
                .map((r, i) => (
                  <rect
                    key={r.id}
                    x={GX(r.start)}
                    y={2 + i * 10}
                    width={Math.max(0.8, GX(r.end ?? NOW) - GX(r.start))}
                    height={7}
                    rx={1}
                    className={r.end ? s.ganttPast : s.ganttLive}
                  />
                ))}
            </svg>
            <p className={s.ganttAxis} aria-hidden="true">
              {TICKS.map((y) => (
                <span key={y}>{y}</span>
              ))}
              <span>now</span>
            </p>
            <table className={s.ps}>
              <thead>
                <tr>
                  <th>STAT</th>
                  <th>START</th>
                  <th>TIME</th>
                  <th>CMD</th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r) => (
                  <tr key={r.id}>
                    <td className={r.end ? s.muted : s.live}>{r.end ? 'exit 0' : 'R'}</td>
                    <td>{month(r.start)}</td>
                    <td>{span(r.start, r.end ?? NOW)}</td>
                    <td>
                      <b>{r.org}</b> · {r.title}
                      <span className={s.muted}>{r.summary}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          {past.map((j) => (
            <article key={j.company} className={s.card}>
              <p className={s.cardMeta}>
                <span>exit 0</span>
                <span>{j.range}</span>
              </p>
              <h3>
                {j.title} ·{' '}
                {j.url ? (
                  <a href={j.url} target="_blank" rel="noreferrer">
                    {j.company} ↗
                  </a>
                ) : (
                  j.company
                )}
              </h3>
              <ul className={s.duties}>
                {j.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </article>
          ))}
        </Layer>

        <Layer
          info={L.cpu}
          title="Toolchain"
          intro={
            <p>
              Everything above compiles down to fetch, decode, execute. These are the languages and
              platforms I write in, and the instructions retired so far.
            </p>
          }
          captions={CPU_CAPTIONS}
          scene={(progress) => (
            <CanvasScene
              draw={drawCpu}
              progress={progress}
              poster={0.6}
              label="A binary search in x86-64 running through a five-stage pipeline, with live register values, a branch flush and a 64-byte cache line."
            />
          )}
        >
          <article className={s.card}>
            <p className={s.cardMeta}>
              <span>instruction set</span>
              <span>{skills.length} extensions</span>
            </p>
            <ul className={s.isa}>
              {skills.map((k, i) => (
                <li key={k}>
                  <span>{`0x${(i + 1).toString(16).padStart(2, '0')}`}</span>
                  {k}
                </li>
              ))}
            </ul>
          </article>
          <article className={s.card}>
            <p className={s.cardMeta}>
              <span>perf stat</span>
              <span>instructions retired</span>
            </p>
            <p className={s.retired}>
              <b>{stats[0].value}</b> {stats[0].label}
            </p>
            <p
              className={s.muted}
            >{`${commits.neurobuild.short} of them across the ${fmt.spell(commits.neurobuildCodebases)} codebases of ${products.neurobuild.title}.`}</p>
          </article>
        </Layer>

        <Layer
          info={L.silicon}
          title="Roots"
          intro={
            <p>{`The bottom of the stack is what I studied: ${bsc.field.toLowerCase()} with a focus on ${bsc.focus.toLowerCase()}, then ${msc.field.replace(/ Engineering$/, '').toLowerCase()}. Below it: the degrees, the robots and ${fmt.spell(hardware.length)} devices in production.`}</p>
          }
          captions={SILICON_CAPTIONS}
          scene={(progress) => (
            <CanvasScene
              draw={drawSilicon}
              progress={progress}
              poster={0.8}
              label="Zooming from standard cells on a die into one n-channel MOSFET, its channel forming and vanishing as the gate voltage crosses threshold."
            />
          )}
        >
          <article className={s.card}>
            <p className={s.cardMeta}>
              <span>education and early work</span>
              <span>{fmt.yearSpan(bsc.from, papers.inverter.date, ' – ')}</span>
            </p>
            <ol className={s.roots}>
              {roots.map((r) => (
                <li key={r.title}>
                  <span className={s.rootYear}>{r.year}</span>
                  <div>
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
                  </div>
                </li>
              ))}
            </ol>
          </article>
          <article className={s.card}>
            <p className={s.cardMeta}>
              <span>devices in production</span>
              <span>{hardware.length}</span>
            </p>
            <ul className={s.devices}>
              {hardware.map((d) => (
                <li key={d.tag}>
                  <span className={s.instanceId}>{d.tag}</span>
                  <div>
                    <h3>
                      {d.name} · <span className={s.muted}>{d.kind}</span>
                    </h3>
                    <p>{d.detail}</p>
                    <p className={s.tech}>{d.figures.join(' · ')}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </Layer>

        <Ascent />
      </main>
      <footer className={s.footer}>
        <span>{`${conceptTitle('zoom')} · a concept for ${person.site}`}</span>
        <span>
          © {profile.fullName}
          {` · ${person.since} → `}
          {Math.floor(NOW)}
        </span>
      </footer>
    </div>
  );
}
