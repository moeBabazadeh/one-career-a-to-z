'use client';

import Image from 'next/image';
import { memo, useEffect, useRef, useState } from 'react';
import { about, db, fmt, hardware, oss, profile, roles, roots, stats } from '../_shared/data';
import {
  CV_FILE,
  FLOW_MAP,
  HELLO,
  colorOf,
  hexId,
  iconOf,
  typeOf,
  type Flow,
  type FlowNode,
  type Json,
} from './flows';
import { Icon } from './icons';
import { CONTRIB, PALETTE, usedIn, type Category, type Skill } from './palette';
import s from './flow.module.scss';

const ext = { target: '_blank', rel: 'noreferrer' } as const;

/* ------------------------------------------------------------------ palette */

export const Palette = memo(function Palette({
  active,
  onSkill,
  onContrib,
  onClose,
}: {
  active: string | null;
  onSkill: (id: string) => void;
  onContrib: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || label.toLowerCase().includes(q);
  const contrib = CONTRIB.filter((c) => match(c.label) || match(c.repo));
  const cats = PALETTE.map((c) => ({
    ...c,
    skills: c.skills.filter((sk) => match(sk.label)),
  })).filter((c) => c.skills.length);

  return (
    <nav id="flow-palette" className={s.palette} aria-labelledby="palette-title">
      <div className={s.paletteHead}>
        <h2 id="palette-title" className={s.paneTitle}>
          palette <span>skills</span>
        </h2>
        <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Close palette">
          <Icon name="close" />
        </button>
      </div>
      <label className={s.filter}>
        <Icon name="search" />
        <input
          type="search"
          placeholder="filter nodes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter skills"
        />
      </label>
      <div className={s.paletteScroll}>
        {cats.map((c) => (
          <details key={c.id} className={s.category} open>
            <summary>
              <Icon name="caret" />
              {c.label}
            </summary>
            <ul>
              {c.skills.map((sk) => (
                <li key={sk.id}>
                  <button
                    type="button"
                    className={s.pnode}
                    style={{ '--c': c.color } as React.CSSProperties}
                    aria-pressed={active === sk.id}
                    onClick={() => onSkill(sk.id)}
                  >
                    <span className={s.icon}>
                      <Icon name={c.icon} />
                    </span>
                    <span className={s.plabel}>{sk.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {contrib.length > 0 && (
          <details className={s.category} open>
            <summary>
              <Icon name="caret" />
              contrib <small>merged upstream</small>
            </summary>
            <ul>
              {contrib.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={s.pnode}
                    style={{ '--c': '#d8bfd8' } as React.CSSProperties}
                    onClick={() => onContrib(c.id)}
                    aria-label={`${c.repo}, ${c.weekly} weekly downloads`}
                  >
                    <span className={s.icon}>
                      <Icon name="npm" />
                    </span>
                    <span className={s.plabel}>{c.label}</span>
                    <span className={s.pmeta}>{c.weekly}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {!cats.length && !contrib.length && <p className={s.none}>No nodes match “{query}”.</p>}
      </div>
    </nav>
  );
});

/* ------------------------------------------------------------------ info: flow descriptions */

const Links = ({ items }: { items: { label: string; url: string }[] }) => (
  <ul className={s.linkList}>
    {items.map((l) => (
      <li key={l.url}>
        <a href={l.url} {...(l.url.startsWith('mailto:') ? {} : ext)}>
          {l.label}
          <Icon name="arrow" />
        </a>
      </li>
    ))}
  </ul>
);

const CONTACT = [
  { label: profile.email, url: `mailto:${profile.email}` },
  { label: 'LinkedIn', url: profile.linkedin },
  { label: 'GitHub', url: profile.github },
  { label: `CV · ${CV_FILE}`, url: profile.cv },
];

const { logger } = db.devices;
const { downloads, productsLive, storeApps } = db;

function Compose({ onSend }: { onSend: (note: string) => void }) {
  const [note, setNote] = useState('');
  const body = note.trim() ? `Hi ${db.person.first},\n\n${note.trim()}` : '';
  const href = `mailto:${profile.email}?subject=${encodeURIComponent(HELLO.subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  return (
    <div className={s.compose}>
      <label htmlFor="flow-note">msg.payload.body</label>
      <textarea
        id="flow-note"
        rows={4}
        placeholder="I’m building … and could use a hand."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <a className={s.send} href={href} onClick={() => onSend(note.trim())}>
        <Icon name="mail" />
        Send through the flow
      </a>
      <p className={s.hint}>
        Opens your mail app with the note filled in, after it runs through the flow.
      </p>
    </div>
  );
}

function FlowAbout({ flow, onSend }: { flow: Flow; onSend: (note: string) => void }) {
  switch (flow.id) {
    case 'stack':
      return (
        <>
          <div className={s.hero}>
            <Image
              src={db.person.photo}
              width={600}
              height={600}
              alt={profile.name}
              className={s.avatar}
              priority
            />
            <div>
              <h2>{profile.tagline}</h2>
              <p className={s.role}>
                {`${profile.role} at`}{' '}
                <a href={profile.companyUrl} {...ext}>
                  {profile.company}
                </a>{' '}
                {`· building since ${db.person.since}`}
              </p>
            </div>
          </div>
          <p className={s.lede}>{profile.lede}</p>
          {about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <dl className={s.stats}>
            {stats.map((m) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
          <Links items={CONTACT} />
        </>
      );
    case 'career':
      return (
        <>
          <h2>Career</h2>
          <p>{`${fmt.Spell(db.yearsBuilding)} years and ${fmt.spell(roles.length)} roles, from freelance websites to ${profile.role}. Each role is a delay node that holds the message as long as I held the job.`}</p>
          <ol className={s.roles}>
            {[...roles].reverse().map((r) => (
              <li key={r.id}>
                <span className={s.range}>{r.range}</span>
                <b>
                  {r.url ? (
                    <a href={r.url} {...ext}>
                      {r.org}
                    </a>
                  ) : (
                    r.org
                  )}
                </b>
                <span>{r.title}</span>
                <p>{r.summary}</p>
              </li>
            ))}
          </ol>
        </>
      );
    case 'platforms':
      return (
        <>
          <h2>Platforms</h2>
          <p>{`More than ${fmt.spell(productsLive.n)} products live, and ${fmt.spell(storeApps.length)} apps on the App Store and Google Play. Click a node for the story and the stack.`}</p>
          <ul className={s.plist}>
            {flow.nodes
              .filter((n) => n.kind === 'project')
              .map((n) => (
                <li key={n.id}>
                  <b>{n.label}</b>
                  <Links items={n.info.links ?? []} />
                </li>
              ))}
          </ul>
        </>
      );
    case 'hardware':
      return (
        <>
          <h2>Hardware</h2>
          <p>{`${fmt.Spell(hardware.length)} devices in production, with the firmware I wrote for them. The ${logger.name} stations have been sending data home for ${logger.online.long} years.`}</p>
          <ul className={s.devices}>
            {hardware.map((d) => (
              <li key={d.tag}>
                <span className={s.tag}>{d.tag}</span>
                <b>{d.name}</b> <span>{d.kind}</span>
                <p>{d.detail}</p>
                <small>{d.figures.join(' · ')}</small>
              </li>
            ))}
          </ul>
        </>
      );
    case 'oss':
      return (
        <>
          <h2>Open source</h2>
          <p>{`Fixes merged upstream, in packages downloaded ${downloads.weekly.long} times a week.`}</p>
          <ul className={s.devices}>
            {oss.map((c) => (
              <li key={c.repo}>
                <span className={s.tag}>{c.kind}</span>
                <b>
                  <a href={c.url} {...ext}>
                    {c.repo}
                  </a>
                </b>
                <p>{c.change}</p>
                <small>
                  {c.year} · ★ {c.stars} · {c.weekly}/wk
                </small>
              </li>
            ))}
          </ul>
        </>
      );
    case 'roots':
      return (
        <>
          <h2>Roots</h2>
          <p>Electrical engineering and control systems first, and a lot of robots.</p>
          <ol className={s.roles}>
            {roots.map((r) => (
              <li key={r.title}>
                <span className={s.range}>{r.year}</span>
                <b>
                  {r.url ? (
                    <a href={r.url} {...ext}>
                      {r.title}
                    </a>
                  ) : (
                    r.title
                  )}
                </b>
                <p>{r.detail}</p>
              </li>
            ))}
          </ol>
        </>
      );
    default:
      return (
        <>
          <h2>Contact</h2>
          <p>Tell me what you’re building: a platform, a device or a team that needs one.</p>
          <Compose onSend={onSend} />
          <Links items={CONTACT} />
        </>
      );
  }
}

/* ------------------------------------------------------------------ info: node and skill */

function NodeAbout({ flow, node }: { flow: Flow; node: FlowNode }) {
  const { info } = node;
  return (
    <article className={s.nodeInfo}>
      <header style={{ '--c': colorOf(node) } as React.CSSProperties}>
        <span className={s.badge}>
          <Icon name={iconOf(node)} />
          {typeOf(node)}
        </span>
        <h2>{info.title ?? node.label}</h2>
      </header>
      <table className={s.props}>
        <tbody>
          <tr>
            <th>Node</th>
            <td>
              <code>{hexId(`${flow.id}/${node.id}`)}</code>
            </td>
          </tr>
          <tr>
            <th>Flow</th>
            <td>{flow.label}</td>
          </tr>
          {info.props?.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {info.image && (
        <Image
          src={info.image}
          width={1280}
          height={800}
          alt={`${info.title ?? node.label}, screenshot`}
          className={s.shot}
        />
      )}
      {info.body?.map((p) => (
        <p key={p.slice(0, 24)}>{p}</p>
      ))}
      {info.bullets && (
        <ul className={s.bullets}>
          {info.bullets.map((b) => (
            <li key={b.slice(0, 24)}>{b}</li>
          ))}
        </ul>
      )}
      {info.tags && (
        <ul className={s.tags}>
          {info.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {info.links && info.links.length > 0 && <Links items={info.links} />}
    </article>
  );
}

function SkillAbout({ skill, category }: { skill: Skill; category: Category }) {
  const used = usedIn(skill);
  return (
    <article className={s.nodeInfo}>
      <header style={{ '--c': category.color } as React.CSSProperties}>
        <span className={s.badge}>
          <Icon name={category.icon} />
          {category.label}
        </span>
        <h2>{skill.label}</h2>
      </header>
      <p>
        {skill.core ? 'One of my core tools. ' : ''}
        {used.length
          ? `Used in ${used.length === 1 ? 'one project' : `${used.length} projects`}:`
          : 'Used across my work.'}
      </p>
      <ul className={s.used}>
        {used.map((p) => (
          <li key={p.title}>
            <b>{p.title}</b>
            <small>{p.tech.join(' · ')}</small>
            {p.links.length > 0 && <Links items={p.links} />}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function Info({
  flow,
  node,
  skill,
  onClose,
  closeRef,
  onSend,
}: {
  flow: Flow;
  node: FlowNode | null;
  skill: (Skill & { category: Category }) | null;
  onClose: () => void;
  closeRef: React.Ref<HTMLButtonElement>;
  onSend: (note: string) => void;
}) {
  const crumb = node
    ? [flow.label, node.label]
    : skill
      ? ['palette', skill.label]
      : ['flow', flow.label];
  return (
    <section className={s.info} aria-labelledby="info-title">
      <header className={s.paneHead}>
        <h2 id="info-title" className={s.paneTitle}>
          <Icon name="info" />
          info
        </h2>
        <span className={s.crumb}>
          {crumb[0]} <span aria-hidden="true">›</span> {crumb[1]}
        </span>
        {(node || skill) && (
          <button
            ref={closeRef}
            type="button"
            className={s.iconBtn}
            onClick={onClose}
            aria-label="Close properties"
          >
            <Icon name="close" />
          </button>
        )}
      </header>
      <div className={s.infoScroll}>
        {node ? (
          <NodeAbout key={node.id} flow={flow} node={node} />
        ) : skill ? (
          <SkillAbout key={skill.id} skill={skill} category={skill.category} />
        ) : (
          <FlowAbout key={flow.id} flow={flow} onSend={onSend} />
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ debug */

export interface DebugMsg {
  id: number;
  flow: string;
  node: string;
  time: string;
  topic: string;
  payload: Json;
}

const typeName = (v: Json) =>
  v === null
    ? 'null'
    : Array.isArray(v)
      ? `array[${v.length}]`
      : typeof v === 'object'
        ? 'Object'
        : typeof v === 'string'
          ? `string[${v.length}]`
          : typeof v;

function Scalar({ value }: { value: Json }) {
  if (value === null) return <span className={s.jNull}>null</span>;
  if (typeof value === 'string') return <span className={s.jStr}>&quot;{value}&quot;</span>;
  if (typeof value === 'number') return <span className={s.jNum}>{value}</span>;
  if (typeof value === 'boolean') return <span className={s.jBool}>{String(value)}</span>;
  return (
    <span className={s.jType}>{Array.isArray(value) ? `array[${value.length}]` : 'object'}</span>
  );
}

function Preview({ value }: { value: Json }) {
  if (value === null || typeof value !== 'object') return <Scalar value={value} />;
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value);
  const shown = entries.slice(0, 3);
  const short = (v: Json) => (typeof v === 'string' && v.length > 22 ? `${v.slice(0, 21)}…` : v);
  return (
    <span className={s.jPreview}>
      {Array.isArray(value) ? '[ ' : '{ '}
      {shown.map(([k, v], i) => (
        <span key={k}>
          {!Array.isArray(value) && <span className={s.jKey}>{k}: </span>}
          <Scalar value={short(v)} />
          {i < shown.length - 1 || entries.length > 3 ? ', ' : ''}
        </span>
      ))}
      {entries.length > 3 && '… '}
      {Array.isArray(value) ? ' ]' : ' }'}
    </span>
  );
}

function Tree({ value, open = false }: { value: Json; open?: boolean }) {
  if (value === null || typeof value !== 'object') return <Scalar value={value} />;
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value);
  return (
    <details className={s.jTree} open={open}>
      <summary>
        <span className={s.jType}>
          {Array.isArray(value) ? `array[${value.length}]` : 'object'}
        </span>{' '}
        <Preview value={value} />
      </summary>
      <ul>
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className={s.jKey}>{k}</span>: <Tree value={v} />
          </li>
        ))}
      </ul>
    </details>
  );
}

const Entry = memo(function Entry({
  m,
  onReveal,
}: {
  m: DebugMsg;
  onReveal: (flow: string, node: string) => void;
}) {
  const flow = FLOW_MAP.get(m.flow)!;
  return (
    <li className={s.msg}>
      <div className={s.meta}>
        <time>{m.time}</time>
        <button type="button" onClick={() => onReveal(m.flow, m.node)}>
          node: {flow.label} › {flow.nodes.find((n) => n.id === m.node)?.label}
        </button>
      </div>
      <div className={s.msgPath}>
        {m.topic} : msg.payload : {typeName(m.payload)}
      </div>
      <Tree value={m.payload} open />
    </li>
  );
});

export function Debug({
  messages,
  filter,
  onFilter,
  onClear,
  onReveal,
  empty,
}: {
  messages: DebugMsg[];
  filter: 'current' | 'all';
  onFilter: (f: 'current' | 'all') => void;
  onClear: () => void;
  onReveal: (flow: string, node: string) => void;
  empty: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const last = messages[messages.length - 1]?.id;

  // Follow new messages unless the reader has scrolled up to look at older ones.
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [last, filter]);

  return (
    <section className={s.debug} aria-labelledby="debug-title">
      <header className={s.paneHead}>
        <h2 id="debug-title" className={s.paneTitle}>
          <Icon name="bug" />
          debug
        </h2>
        <select
          value={filter}
          onChange={(e) => onFilter(e.target.value as 'current' | 'all')}
          aria-label="Show messages from"
          className={s.select}
        >
          <option value="current">current flow</option>
          <option value="all">all flows</option>
        </select>
        <button type="button" className={s.iconBtn} onClick={onClear} aria-label="Clear messages">
          <Icon name="trash" />
        </button>
      </header>
      <ol
        ref={list}
        className={s.messages}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {messages.length ? (
          messages.map((m) => <Entry key={m.id} m={m} onReveal={onReveal} />)
        ) : (
          <li className={s.none}>{empty}</li>
        )}
      </ol>
    </section>
  );
}
