'use client';

import Image from 'next/image';
import { useMemo, useRef, useState } from 'react';
import { NOW, about, db, liveLinks, profile, skills, stats } from '../_shared/data';
import {
  BASE,
  CONTRIBUTIONS,
  DEVICES,
  EDUCATION,
  ENDPOINTS,
  EVENTS,
  EXAMPLE_ID,
  LATEST,
  PLATFORMS,
  RATE_LIMIT,
  ROLES,
  STATUS,
  SUBJECT,
  VERSIONS,
  WEBHOOK_TYPES,
  handle,
  person,
  promotedEvent,
  tooMany,
  type ApiResult,
  type Endpoint,
  type Json,
  type Param,
} from './model';
import { highlight, pretty, type Sample } from './code';
import {
  CodeView,
  CopyButton,
  Icon,
  Md,
  RequestPanel,
  ResponsePanel,
  StatusChip,
  Verb,
  cx,
} from './parts';
import { openConsole, setDraft, useConsole, useRateLimit } from './store';
import s from './api.module.scss';

const endpoint = (id: string) => ENDPOINTS.find((e) => e.id === id) as Endpoint;

/** mulberry32: deterministic noise for simulated values, identical on server and client. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ layout */

export function Section({
  id,
  title,
  eyebrow,
  route,
  children,
  aside,
  className,
}: {
  id: string;
  title: string;
  eyebrow: string;
  route?: Endpoint;
  children: React.ReactNode;
  aside: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} data-spy className={cx(s.section, className)} aria-labelledby={`${id}-title`}>
      <div className={s.prose}>
        <p className={s.eyebrow}>{eyebrow}</p>
        <h2 id={`${id}-title`}>
          <a href={`#${id}`} className={s.anchor} aria-label={`Link to ${title}`}>
            <Icon.link />
          </a>
          {title}
        </h2>
        {route && <Route ep={route} />}
        {children}
      </div>
      <div className={s.aside}>
        <div className={s.sticky} data-reveal>
          {aside}
        </div>
      </div>
    </section>
  );
}

function Route({ ep }: { ep: Endpoint }) {
  return (
    <div className={s.route}>
      <Verb method={ep.method} />
      <code>
        {ep.path.split(/(\{\w+\})/).map((part, i) =>
          part.startsWith('{') ? (
            <span key={i} className={s.pathParam}>
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </code>
      <CopyButton text={`${ep.method} ${BASE}${ep.path}`} label="Copy endpoint" />
    </div>
  );
}

/** What a parameter row lights up: matching request lines and response keys. */
interface Hot {
  request: string[];
  response: string[];
}

const hotFor = (p: Param, sample: Sample): Hot => {
  const request =
    p.in === 'path'
      ? [sample.target.split('/').pop() ?? p.name]
      : p.in === 'body'
        ? [`"${p.name}"`, `    ${p.name}: `]
        : [p.name.replace('[]', '')];
  return { request, response: p.keys ?? [] };
};

function ParamTable({
  params,
  sample,
  onHot,
  title = 'Parameters',
}: {
  params: Param[];
  sample: Sample;
  onHot: (hot: Hot | null) => void;
  title?: string;
}) {
  return (
    <div className={s.tableBlock}>
      <h3 className={s.label}>{title}</h3>
      <table className={s.params}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Required</th>
            <th scope="col">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr
              key={p.name}
              onMouseEnter={() => onHot(hotFor(p, sample))}
              onMouseLeave={() => onHot(null)}
            >
              <td>
                <code className={s.pname}>{p.name}</code>
                <span className={s.pin}>{p.in}</span>
              </td>
              <td className={s.ptype}>
                {p.type}
                {p.options && p.in !== 'path' && (
                  <span className={s.options}>
                    {p.options.map((o) => (
                      <span key={o}>{o}</span>
                    ))}
                  </span>
                )}
              </td>
              <td>
                {p.required ? (
                  <span className={s.required}>required</span>
                ) : (
                  <span className={s.optional}>optional</span>
                )}
              </td>
              <td className={s.pdoc}>
                <Md text={p.doc} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttrTable({
  title,
  attrs,
  onHot,
}: {
  title: string;
  attrs: [string, string, string][];
  onHot: (hot: Hot | null) => void;
}) {
  return (
    <div className={s.tableBlock}>
      <h3 className={s.label}>{title}</h3>
      <dl className={s.attrs}>
        {attrs.map(([name, type, doc]) => (
          <div
            key={name}
            onMouseEnter={() => onHot({ request: [], response: [name] })}
            onMouseLeave={() => onHot(null)}
          >
            <dt>
              <code className={s.pname}>{name}</code>
              <span className={s.ptype}>{type}</span>
            </dt>
            <dd>
              <Md text={doc} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** An endpoint: prose and parameters in the middle, a request and its response on the right. */
function EndpointSection({
  ep,
  lede,
  children,
  sample: given,
  result: givenResult,
  tryLabel,
  attrs,
}: {
  ep: Endpoint;
  lede?: React.ReactNode;
  children?: React.ReactNode;
  sample?: Sample;
  result?: ApiResult;
  tryLabel?: string;
  attrs?: { title: string; rows: [string, string, string][] };
}) {
  const [hot, setHot] = useState<Hot | null>(null);
  const sample = given ?? { method: ep.method, target: ep.example, version: LATEST };
  const example = useMemo(() => handle({ method: ep.method, target: ep.example }), [ep]);
  const result = givenResult ?? example;
  return (
    <Section
      id={ep.id}
      title={ep.title}
      eyebrow={ep.name === ep.title ? 'Endpoint' : ep.name}
      route={ep}
      aside={
        <>
          <RequestPanel
            sample={sample}
            title={
              <>
                <Verb method={sample.method} small />{' '}
                <span className={s.ellip}>{sample.target}</span>
              </>
            }
            hot={hot?.request}
            tryLabel={tryLabel}
            onTry={() =>
              openConsole({
                method: ep.method,
                target: sample.target,
                version: sample.version,
                send: true,
              })
            }
          />
          <ResponsePanel result={result} hot={hot?.response} target={sample.target} />
        </>
      }
    >
      <p className={s.lede}>
        <Md text={ep.doc} />
      </p>
      {lede}
      <ParamTable
        params={ep.params}
        sample={sample}
        onHot={setHot}
        title={ep.method === 'POST' ? 'Body and headers' : 'Parameters'}
      />
      <p className={s.returns}>
        <span className={s.label}>Returns</span> <Md text={ep.returns} />
      </p>
      {attrs && <AttrTable title={attrs.title} attrs={attrs.rows} onHot={setHot} />}
      {children}
    </Section>
  );
}

function TryLink({
  target,
  children,
  method = 'GET',
}: {
  target: string;
  children?: React.ReactNode;
  method?: 'GET' | 'POST';
}) {
  return (
    <button
      type="button"
      className={s.tryLink}
      onClick={() => openConsole({ method, target, send: true })}
    >
      <Icon.play /> {children ?? target}
    </button>
  );
}

const Ext = ({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <a href={href} target="_blank" rel="noreferrer" className={className}>
    {children}
    <Icon.out />
  </a>
);

/* ------------------------------------------------------------------ resources */

const PERSON: [string, string, string][] = [
  ['title', 'string', 'Current title. An older `Api-Version` returns the title of the time.'],
  ['company', 'object', 'The primary employer: `name` and `url`.'],
  ['tagline', 'string', 'What he does, in one line.'],
  ['building_since', 'integer', 'The year of the first freelance website.'],
  ['current_roles', 'array', 'Ids of roles with no end date. Expandable.'],
  ['skills', 'array of strings', 'The stack he reaches for.'],
  ['contact', 'object', '`email`, `linkedin`, `github` and `cv`.'],
  ['avatar_url', 'string', 'A 600 × 600 photo.'],
];

export function Profile() {
  return (
    <EndpointSection
      ep={endpoint('me')}
      attrs={{ title: 'The person object', rows: PERSON }}
      lede={
        <div className={s.about}>
          {about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
      }
    >
      <h3 className={s.label}>
        <code>skills</code>
      </h3>
      <ul className={s.chips}>
        {skills.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <h3 className={s.label}>
        <code>stats</code> · with <code>expand[]=stats</code>
      </h3>
      <dl className={s.stats} data-reveal>
        {stats.map((st) => (
          <div key={st.label}>
            <dt>{st.label}</dt>
            <dd>{st.value}</dd>
          </div>
        ))}
      </dl>
    </EndpointSection>
  );
}

const FIRST = db.person.since;

// A year mark every four years from the first role, leaving room for "now" at the end.
const TICKS: number[] = [];
for (let y = FIRST; y < NOW - 2; y += 4) TICKS.push(y);

function Timeline() {
  const x = (year: number) => ((year - FIRST) / (NOW - FIRST)) * 100;
  return (
    <figure className={s.timeline} data-reveal>
      <ol>
        {[...ROLES].reverse().map((r) => {
          const left = x(r.start);
          const width = x(r.end ?? NOW) - left;
          const place = width > 20 ? 'in' : left > 50 ? 'before' : 'after';
          return (
            <li key={r.id}>
              <a
                href={`#role-${r.id}`}
                className={s.bar}
                data-current={r.end === null || undefined}
                data-place={place}
                style={{ left: `${left}%`, width: `${width}%` }}
                aria-label={`${r.org}, ${r.startMonth} to ${r.endMonth ?? 'now'}`}
              >
                <span>{r.org.split(' ')[0]}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <div className={s.axis} aria-hidden="true">
        {TICKS.map((y) => (
          <span key={y} style={{ left: `${x(y)}%` }}>
            {y}
          </span>
        ))}
        <span style={{ left: '100%' }}>now</span>
      </div>
      <figcaption>{`Roles on a timeline, ${FIRST} to now. Overlaps are real.`}</figcaption>
    </figure>
  );
}

export function Experience() {
  return (
    <EndpointSection ep={endpoint('experience')} lede={<Timeline />}>
      <h3 className={s.label}>All roles</h3>
      <ol className={s.roles}>
        {ROLES.map((r) => (
          <li key={r.id} id={`role-${r.id}`} className={s.item}>
            <div className={s.itemMeta}>
              <code className={s.id}>{r.id}</code>
              <span className={s.dates}>
                {r.startMonth} → {r.endMonth ?? 'now'}
              </span>
              {r.end === null && <span className={s.live}>current</span>}
              {r.contract && <span className={s.tag}>contract</span>}
            </div>
            <h3>
              {r.titles.map(([, t]) => t).join(' → ')}
              <span>
                {' · '}
                {r.url ? <Ext href={r.url}>{r.org}</Ext> : r.org}
              </span>
            </h3>
            <p>{r.summary}</p>
            {r.duties.length > 0 && (
              <details className={s.child}>
                <summary>
                  <code>duties</code> · {r.duties.length} {r.duties.length === 1 ? 'item' : 'items'}
                </summary>
                <ul>
                  {r.duties.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ol>
    </EndpointSection>
  );
}

const linkList = (links: { label: string; url: string; kind: string }[]) =>
  links.length ? (
    <span className={s.links}>
      {links.map((l) => (
        <Ext key={l.url} href={l.url} className={s.linkBtn}>
          {l.label}
        </Ext>
      ))}
    </span>
  ) : (
    <span className={s.muted}>No public link</span>
  );

export function Platforms() {
  const featured = PLATFORMS.filter((p) => p.featured);
  const rest = PLATFORMS.filter((p) => !p.featured);
  return (
    <EndpointSection ep={endpoint('platforms')}>
      <h3 className={s.label}>
        Featured · <code>featured=true</code>
      </h3>
      <ul className={s.platforms}>
        {featured.map((p) => (
          <li key={p.id} id={`platform-${p.id}`} className={s.platform}>
            {p.image && (
              <Image
                src={p.image}
                width={1280}
                height={800}
                alt={`${p.name} screenshot`}
                sizes="(max-width: 700px) 100vw, 220px"
              />
            )}
            <div>
              <div className={s.itemMeta}>
                <code className={s.id}>{p.id}</code>
                {p.year && <span className={s.dates}>{p.year}</span>}
                {p.madeAt && <span className={s.dates}>· {p.madeAt}</span>}
              </div>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <p className={s.stack}>{p.stack.join(' · ')}</p>
              <div className={s.itemActions}>
                {linkList(p.links)}
                <TryLink target={`/v1/platforms/${p.id}`}>Retrieve</TryLink>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <h3 className={s.label}>
        More · <code>featured=false</code>
      </h3>
      <ul className={s.compact}>
        {rest.map((p) => (
          <li key={p.id} id={`platform-${p.id}`} className={s.item}>
            <div className={s.itemMeta}>
              <code className={s.id}>{p.id}</code>
              {p.year && <span className={s.dates}>{p.year}</span>}
              {p.madeAt && <span className={s.dates}>· {p.madeAt}</span>}
            </div>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <p className={s.stack}>{p.stack.join(' · ')}</p>
            <div className={s.itemActions}>{linkList(p.links)}</div>
          </li>
        ))}
      </ul>
    </EndpointSection>
  );
}

export function Platform() {
  return (
    <EndpointSection ep={endpoint('platform')}>
      <h3 className={s.label}>Ids</h3>
      <ul className={s.ids}>
        {PLATFORMS.map((p) => (
          <li key={p.id}>
            <TryLink target={`/v1/platforms/${p.id}`}>{p.id}</TryLink>
          </li>
        ))}
      </ul>
      <p className={s.note}>
        Links are a sub-resource too:{' '}
        <TryLink target={`/v1/platforms/${EXAMPLE_ID.educationGuide}/links`} />
      </p>
      <h3 className={s.label}>On the stores</h3>
      <ul className={s.storeLinks}>
        {liveLinks.map((l) => (
          <li key={l.url}>
            <Ext href={l.url}>{l.label}</Ext>
          </li>
        ))}
      </ul>
    </EndpointSection>
  );
}

export function OpenSource() {
  return (
    <EndpointSection ep={endpoint('open-source')}>
      <ol className={s.compact}>
        {CONTRIBUTIONS.map((c) => (
          <li key={c.id} id={`oss-${c.id}`} className={s.item}>
            <div className={s.itemMeta}>
              <code className={s.id}>{c.type === 'pull_request' ? `#${c.number}` : 'repo'}</code>
              <span className={s.dates}>{c.year}</span>
              {c.kind && (
                <span className={s.tag} data-kind={c.kind}>
                  {c.kind}
                </span>
              )}
              {c.stars && (
                <span className={s.dates}>
                  ★ {c.stars} · {c.weekly}/week
                </span>
              )}
            </div>
            <h3>
              <Ext href={c.url}>{c.repo}</Ext>
            </h3>
            <p>{c.change}</p>
            {c.impact && <p className={s.muted}>{c.impact}</p>}
          </li>
        ))}
      </ol>
    </EndpointSection>
  );
}

export function Hardware() {
  return (
    <EndpointSection ep={endpoint('hardware')}>
      <ul className={s.devices}>
        {DEVICES.map((d) => (
          <li key={d.id} id={`device-${d.id}`} className={s.item}>
            <div className={s.itemMeta}>
              <code className={s.id}>{d.tag}</code>
              <span className={s.dates}>{d.kind}</span>
            </div>
            <h3>{d.name}</h3>
            <p>{d.detail}</p>
            <ul className={s.chips}>
              {d.figures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </EndpointSection>
  );
}

export function Education() {
  return (
    <EndpointSection ep={endpoint('education')}>
      <ol className={s.compact}>
        {EDUCATION.map((e) => (
          <li key={e.id} id={`edu-${e.id}`} className={s.item}>
            <div className={s.itemMeta}>
              <span className={s.dates}>{e.year}</span>
            </div>
            <h3>{e.url ? <Ext href={e.url}>{e.title}</Ext> : e.title}</h3>
            <p>{e.detail}</p>
          </li>
        ))}
      </ol>
    </EndpointSection>
  );
}

const EXAMPLE_DRAFT = {
  email: 'ada@example.com',
  name: 'Ada',
  subject: 'Platform architecture',
  body: `Hi ${db.person.first}, we are scaling a multi-tenant platform and would love your take on it.`,
};

export function Messages() {
  const c = useConsole();
  const typed = Object.values(c.draft).some((v) => v.trim());
  const body = typed
    ? Object.fromEntries(Object.entries(c.draft).filter(([, v]) => v.trim()))
    : EXAMPLE_DRAFT;
  const sample: Sample = {
    method: 'POST',
    target: '/v1/messages',
    version: LATEST,
    body,
    key: c.key,
  };
  const result = useMemo(
    () => handle({ method: 'POST', target: '/v1/messages', body, key: c.key }),
    [body, c.key],
  );
  return (
    <EndpointSection ep={endpoint('messages')} sample={sample} result={result} tryLabel="Send">
      <form
        className={s.compose}
        onSubmit={(e) => {
          e.preventDefault();
          openConsole({ method: 'POST', target: '/v1/messages', send: true });
        }}
      >
        <h3 className={s.label}>Compose</h3>
        <p className={s.muted}>
          Type here and the request on the right is written for you, in whichever language you
          picked.
        </p>
        <div className={s.composeGrid}>
          <label>
            <span>
              email <b>required</b>
            </span>
            <input
              type="email"
              autoComplete="email"
              value={c.draft.email}
              placeholder="you@company.com"
              onChange={(e) => setDraft({ email: e.target.value })}
            />
          </label>
          <label>
            <span>name</span>
            <input
              autoComplete="name"
              value={c.draft.name}
              placeholder="Your name"
              onChange={(e) => setDraft({ name: e.target.value })}
            />
          </label>
          <label className={s.wide}>
            <span>subject</span>
            <input
              value={c.draft.subject}
              placeholder={SUBJECT}
              onChange={(e) => setDraft({ subject: e.target.value })}
            />
          </label>
          <label className={s.wide}>
            <span>
              body <b>required</b>
            </span>
            <textarea
              rows={4}
              value={c.draft.body}
              placeholder="What are you building?"
              onChange={(e) => setDraft({ body: e.target.value })}
            />
          </label>
        </div>
        <button type="submit" className={s.primary}>
          <Icon.play /> POST /v1/messages
        </button>
      </form>
      <h3 className={s.label}>Or skip the API</h3>
      <ul className={s.contact}>
        <li>
          <a href={`mailto:${profile.email}`}>
            <Icon.mail /> {profile.email}
          </a>
        </li>
        <li>
          <Ext href={profile.linkedin}>LinkedIn</Ext>
        </li>
        <li>
          <Ext href={profile.github}>GitHub</Ext>
        </li>
        <li>
          <Ext href={profile.cv}>CV (PDF)</Ext>
        </li>
      </ul>
    </EndpointSection>
  );
}

/* ------------------------------------------------------------------ history */

const OLDEST_FIRST = [...VERSIONS].reverse();

/** Top-level keys whose values differ from the latest profile. */
function changedKeys(a: Json, b: Json) {
  const x = a as Record<string, Json>;
  const y = b as Record<string, Json>;
  return Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
}

export function Versioning() {
  const [index, setIndex] = useState(OLDEST_FIRST.length - 1);
  const travel = useRef<HTMLDivElement>(null);
  const v = OLDEST_FIRST[index];
  const sample: Sample = { method: 'GET', target: '/v1/me', version: v.id };
  const result = useMemo(() => handle({ method: 'GET', target: '/v1/me', version: v.id }), [v.id]);
  const changed = useMemo(
    () => (v.id === LATEST ? [] : changedKeys(person(v), person(VERSIONS[0]))),
    [v],
  );
  const pin = (id: string) => {
    setIndex(OLDEST_FIRST.findIndex((x) => x.id === id));
    // Single column: the panel sits below the changelog, so bring it up.
    if (matchMedia('(max-width: 1199px)').matches)
      travel.current?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
  };
  return (
    <Section
      id="versioning"
      title="Versioning & changelog"
      eyebrow="History"
      aside={
        <>
          <div className={s.panel} ref={travel}>
            <div className={s.panelHead}>
              <span className={s.panelTitle}>Time travel</span>
              <code className={s.mime}>Api-Version: {v.id}</code>
            </div>
            <div className={s.travel}>
              <input
                type="range"
                min={0}
                max={OLDEST_FIRST.length - 1}
                step={1}
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                aria-label="Api-Version"
                aria-valuetext={v.id}
              />
              <div className={s.travelScale} aria-hidden="true">
                <span>{OLDEST_FIRST[0].id}</span>
                <b>{v.id === LATEST ? `${v.id} · latest` : v.id}</b>
                <span>now</span>
              </div>
            </div>
          </div>
          <RequestPanel
            sample={sample}
            title={
              <>
                <Verb method="GET" small /> /v1/me
              </>
            }
            hot={['Api-Version']}
            onTry={() =>
              openConsole({ method: 'GET', target: '/v1/me', version: v.id, send: true })
            }
          />
          <ResponsePanel
            result={result}
            hot={changed}
            label={v.id === LATEST ? 'Response' : `Response as of ${v.id}`}
          />
        </>
      }
    >
      <p className={s.lede}>
        Versions are dates, sent in the <code>Api-Version</code> header. Each one is a point in the
        career, so pinning an older version returns the profile as it was then: the title, the
        company and the roles of the time. Fields added later are left out. Drag the slider, or pin
        a version below.
      </p>
      <h3 className={s.label}>Changelog</h3>
      <ol className={s.changelog}>
        {VERSIONS.map((ver) => (
          <li key={ver.id} id={`v-${ver.id}`} className={cx(s.item, ver.id === v.id && s.pinned)}>
            <div className={s.itemMeta}>
              <code className={s.id}>{ver.id}</code>
              {ver.id === LATEST && <span className={s.live}>latest</span>}
              <button
                type="button"
                className={s.pinBtn}
                aria-pressed={ver.id === v.id}
                onClick={() => pin(ver.id)}
              >
                {ver.id === v.id ? 'Pinned' : 'Pin'}
              </button>
            </div>
            <ul>
              {ver.changes.map(([kind, text]) => (
                <li key={text}>
                  <span className={s.change} data-kind={kind}>
                    {kind}
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Deliveries() {
  const rows = useMemo(() => {
    const rnd = seeded(2007);
    return EVENTS.slice(0, 12).map((e) => ({ ...e, ms: Math.round(38 + rnd() * 140) }));
  }, []);
  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <span className={s.panelTitle}>Recent deliveries</span>
        <span className={s.mime}>
          {rows.length} of {EVENTS.length}
          {` since ${FIRST}`}
        </span>
      </div>
      <ol className={s.deliveries} data-reveal>
        {rows.map((e, i) => (
          <li key={`${e.type}-${e.subject}-${e.date}`} style={{ '--i': i } as React.CSSProperties}>
            <code>{e.date}</code>
            <span className={s.evType}>{e.type}</span>
            <span className={s.evSubject}>{e.subject}</span>
            <StatusChip status={200} small />
            <span className={s.evMs}>{e.ms} ms</span>
          </li>
        ))}
      </ol>
      <p className={s.panelNote}>
        Real events from the CV, replayed. Delivery times are simulated.
      </p>
    </div>
  );
}

const EVENT_LINES = highlight(pretty(promotedEvent()), 'json');

export function Webhooks() {
  return (
    <Section
      id="webhooks"
      title="Webhooks"
      eyebrow="Events"
      aside={
        <>
          <div className={s.panel}>
            <div className={s.panelHead}>
              <span className={s.panelTitle}>role.promoted</span>
              <span className={s.mime}>POST to your endpoint</span>
              <CopyButton text={pretty(promotedEvent())} label="Copy payload" />
            </div>
            <pre className={cx(s.pre, s.json)} tabIndex={0} aria-label="Example event payload">
              <CodeView lines={EVENT_LINES} json wrap hot={['type', 'previous']} />
            </pre>
          </div>
          <Deliveries />
        </>
      }
    >
      <p className={s.lede}>
        Career events, delivered as they happen. Each delivery is a JSON event with a type, a date
        and the object that changed.
      </p>
      <div className={s.tableBlock}>
        <h3 className={s.label}>Event types</h3>
        <dl className={s.attrs}>
          {WEBHOOK_TYPES.map(([type, doc]) => (
            <div key={type}>
              <dt>
                <code className={s.pname}>{type}</code>
                <span className={s.ptype}>
                  {EVENTS.filter((e) => e.type === type).length
                    ? `${EVENTS.filter((e) => e.type === type).length} sent`
                    : 'by email'}
                </span>
              </dt>
              <dd>
                <Md text={doc} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p>
        Deliveries follow the Standard Webhooks spec: every request carries <code>webhook-id</code>,{' '}
        <code>webhook-timestamp</code> and a <code>webhook-signature</code> to verify against your
        secret. A delivery that does not get a <code>2xx</code> is retried with backoff.
      </p>
      <p className={s.note}>
        There is nowhere to register an endpoint yet. The quickest subscription is still an email.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ conventions */

const ERRORS: [number, string, string][] = [
  [200, '—', 'Everything worked.'],
  [202, '—', '`POST /v1/messages` drafted your email.'],
  [
    400,
    'unknown-parameter, invalid-parameter, invalid-cursor',
    'A parameter is unknown or out of range. Typos come back with a `did_you_mean`.',
  ],
  [404, 'not-found', 'Nothing lives at that path. The response suggests the closest one.'],
  [405, 'method-not-allowed', 'Wrong verb for the path. See the `Allow` header.'],
  [418, 'teapot', 'You asked for `/v1/coffee`.'],
  [
    422,
    'validation-failed',
    'A message is missing `email` or `body`, or reused an `Idempotency-Key`.',
  ],
  [429, 'rate-limited', `More than ${RATE_LIMIT} requests in a minute. See \`Retry-After\`.`],
];

// A platform id with a letter dropped, so the 404 has something to suggest.
const TYPO = `/v1/platforms/${EXAMPLE_ID.attendum.slice(0, 2)}${EXAMPLE_ID.attendum.slice(3)}`;

export function Errors() {
  const notFound = useMemo(() => handle({ method: 'GET', target: TYPO }), []);
  const unknown = useMemo(() => handle({ method: 'GET', target: '/v1/experience?sinse=2020' }), []);
  return (
    <Section
      id="errors"
      title="Errors"
      eyebrow="Conventions"
      aside={
        <>
          <ResponsePanel
            result={notFound}
            hot={['did_you_mean']}
            label={
              <>
                <Verb method="GET" small /> <span className={s.ellip}>{TYPO}</span>
              </>
            }
          />
          <ResponsePanel
            result={unknown}
            hot={['did_you_mean']}
            label={
              <>
                <Verb method="GET" small />{' '}
                <span className={s.ellip}>/v1/experience?sinse=2020</span>
              </>
            }
          />
        </>
      }
    >
      <p className={s.lede}>
        Errors are <code>application/problem+json</code> documents (RFC 9457) with a{' '}
        <code>type</code>, a <code>title</code>, the <code>status</code> and a <code>detail</code>{' '}
        written for humans. When a typo is the likely cause, the response says what you probably
        meant.
      </p>
      <div className={s.tableBlock}>
        <h3 className={s.label}>Status codes</h3>
        <table className={s.params}>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Type</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {ERRORS.map(([status, type, doc]) => (
              <tr key={status}>
                <td>
                  <StatusChip status={status} small />
                  <span className={s.statusText}>{STATUS[status]}</span>
                </td>
                <td className={s.ptype}>{type}</td>
                <td className={s.pdoc}>
                  <Md text={doc} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Try one: <TryLink target="/v1/coffee" />
      </p>
    </Section>
  );
}

const LOOP = `const roles = [];
let cursor;
do {
  const url = new URL('${BASE}/v1/experience');
  url.searchParams.set('limit', '2');
  if (cursor) url.searchParams.set('cursor', cursor);

  const page = await (await fetch(url)).json();
  roles.push(...page.data);
  cursor = page.next_cursor;
} while (cursor);`;
const LOOP_LINES = highlight(LOOP, 'javascript');

export function Pagination() {
  const page = useMemo(() => handle({ method: 'GET', target: '/v1/hardware?limit=2' }), []);
  const link = page.headers.find(([k]) => k === 'link')?.[1] ?? '';
  return (
    <Section
      id="pagination"
      title="Pagination"
      eyebrow="Conventions"
      aside={
        <>
          <ResponsePanel
            result={page}
            hot={['has_more', 'next_cursor', 'total_count']}
            target="/v1/hardware?limit=2"
            label={
              <>
                <Verb method="GET" small /> <span className={s.ellip}>/v1/hardware?limit=2</span>
              </>
            }
          />
          <div className={s.panel}>
            <div className={s.panelHead}>
              <span className={s.panelTitle}>Every page, in JavaScript</span>
              <CopyButton text={LOOP} label="Copy code" />
            </div>
            <pre className={s.pre} tabIndex={0} aria-label="Pagination loop">
              <CodeView lines={LOOP_LINES} />
            </pre>
          </div>
        </>
      }
    >
      <p className={s.lede}>
        Lists are cursor-paginated. Every list response has <code>data</code>, <code>has_more</code>{' '}
        and a <code>next_cursor</code>; pass that cursor back to get the next page. Cursors are
        opaque and only fit the list they came from.
      </p>
      <p>
        The next page is also in the <code>Link</code> header, so generic HTTP clients can follow
        it:
      </p>
      <pre className={s.inlinePre}>
        <code>link: {link}</code>
      </pre>
      <p>
        In the console, a <code>next_cursor</code> is a link: click it to fetch the next page.
      </p>
      <p>
        <TryLink target="/v1/hardware?limit=2" />
      </p>
    </Section>
  );
}

const LIMITED = tooMany(42);

export function RateLimits() {
  const { used, remaining, resetIn } = useRateLimit();
  return (
    <Section
      id="rate-limits"
      title="Rate limits"
      eyebrow="Conventions"
      aside={
        <>
          <div className={s.panel}>
            <div className={s.panelHead}>
              <span className={s.panelTitle}>Your budget, live</span>
              <span className={s.mime}>
                {remaining}/{RATE_LIMIT} left
              </span>
            </div>
            <div
              className={s.bucket}
              role="img"
              aria-label={`${remaining} of ${RATE_LIMIT} requests left this minute`}
            >
              {Array.from({ length: RATE_LIMIT }, (_, i) => (
                <span key={i} data-used={i >= RATE_LIMIT - used || undefined} />
              ))}
            </div>
            <dl className={s.rateHeaders}>
              <div>
                <dt>RateLimit-Limit</dt>
                <dd>{RATE_LIMIT}</dd>
              </div>
              <div>
                <dt>RateLimit-Remaining</dt>
                <dd>{remaining}</dd>
              </div>
              <div>
                <dt>RateLimit-Reset</dt>
                <dd>{resetIn}</dd>
              </div>
            </dl>
            <p className={s.panelNote}>
              Every Send in the console spends one, and this meter is wired to it.
            </p>
          </div>
          <ResponsePanel
            result={LIMITED}
            label={<span className={s.ellip}>When you run out</span>}
          />
        </>
      }
    >
      <p className={s.lede}>
        {RATE_LIMIT} requests a minute per visitor, in a fixed window. Every response says where you
        stand, with the <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code> and{' '}
        <code>RateLimit-Reset</code> headers from the IETF draft.
      </p>
      <p>
        Go over and you get a <code>429</code> with a <code>Retry-After</code> header in seconds.
        Wait it out, or skip the API: email has no rate limit.
      </p>
      <p>
        <button type="button" className={s.tryLink} onClick={() => openConsole()}>
          <Icon.play /> Open the console and spend some
        </button>
      </p>
    </Section>
  );
}
