'use client';

import Image from 'next/image';
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { about, db, fmt, profile, skills } from '../_shared/data';
import {
  ACCOUNT,
  PERIOD,
  RESOURCES,
  ROLES,
  accountIdPretty,
  roleById,
  ym,
  type RoleInfo,
} from './inventory';
import { POLICIES, USER, simulate, type Statement } from './policy';
import { runInShell } from './Shell';
import {
  Card,
  Crn,
  DataTable,
  Ext,
  Icon,
  JsonView,
  KeyValues,
  PageHead,
  Pill,
  StatusBadge,
  Tabs,
  Tags,
  cx,
  useWidth,
  type Col,
} from './ui';
import { href } from './store';
import s from './console.module.scss';

const { asOf, person, current } = db;

const lastActivity = (r: RoleInfo) => (r.role.to ? fmt.mon(r.role.to) : 'Active now');
const duration = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || '0 mo';
};

const roleCols: Col<RoleInfo>[] = [
  {
    key: 'name',
    label: 'Role name',
    sort: (r) => r.id,
    render: (r) => (
      <a href={href(`iam/roles/${r.id}`)} className={s.cellName}>
        <b>{r.id}</b>
        <small>{r.path}</small>
      </a>
    ),
  },
  { key: 'org', label: 'Trusted entity', sort: (r) => r.role.org, render: (r) => r.role.org },
  {
    key: 'created',
    label: 'Created',
    sort: (r) => ym(r.role.from),
    render: (r) => <span className={s.mono}>{fmt.iso(r.role.from)}</span>,
    wide: true,
  },
  {
    key: 'last',
    label: 'Last activity',
    sort: (r) => ym(r.role.to ?? asOf),
    render: (r) => lastActivity(r),
    wide: true,
  },
  {
    key: 'session',
    label: 'Max session',
    sort: (r) => r.months,
    render: (r) => duration(r.months),
    align: 'end',
  },
  {
    key: 'status',
    label: 'Status',
    sort: (r) => (r.active ? 0 : 1),
    render: (r) => <StatusBadge status={r.active ? 'active' : 'ended'} />,
  },
];

/* ------------------------------------------------------------------ identity home */

export function IamHome() {
  const active = ROLES.filter((r) => r.active);
  return (
    <div className={s.page}>
      <PageHead
        kicker="Global service"
        title={
          <span className={s.titleIcon}>
            <span className={s.svcIcon} data-svc="iam" data-size="lg">
              <Icon name="iam" size={22} />
            </span>
            Identity
          </span>
        }
        lede="Every job is an IAM role. Its trust policy names the organisation that could assume it, and when; its permissions policy allows the duties he actually had, word for word."
        actions={
          <button type="button" className={s.btn} onClick={() => runInShell('cloud roles list')}>
            <Icon name="terminal" size={16} /> List in CloudShell
          </button>
        }
      />
      <ul className={s.miniStats}>
        <li>
          <span>Roles</span>
          <b>{ROLES.length}</b>
        </li>
        <li>
          <span>Active</span>
          <b>{active.length}</b>
        </li>
        <li>
          <span>Policies</span>
          <b>{ROLES.length * 2}</b>
        </li>
        <li>
          <span>Users</span>
          <b>1</b>
        </li>
      </ul>
      <div className={s.iamGrid}>
        <a href={href('iam/roles')} className={cx(s.card, s.iamTile)}>
          <Icon name="iam" size={20} />
          <b>Roles</b>
          <span>
            {active.map((r) => `${r.title}, ${r.role.org}`).join(' · ')}, and{' '}
            {ROLES.length - active.length} ended.
          </span>
        </a>
        <a href={href('iam/simulator')} className={cx(s.card, s.iamTile)}>
          <Icon name="shield" size={20} />
          <b>Policy simulator</b>
          <span>
            Pick any month since {PERIOD.from.y}: which roles could he assume, and what did they
            allow?
          </span>
        </a>
        <a href={href(`iam/users/${ACCOUNT}`)} className={cx(s.card, s.iamTile)}>
          <Icon name="user" size={20} />
          <b>User {ACCOUNT}</b>
          <span>
            {profile.name}, {profile.headline.toLowerCase()}.
          </span>
        </a>
      </div>
      <DataTable
        rows={ROLES}
        cols={roleCols}
        rowKey={(r) => r.id}
        title="Roles"
        search={(r) => `${r.id} ${r.role.org} ${r.path}`}
        placeholder="Find roles"
      />
    </div>
  );
}

export function RolesList() {
  return (
    <div className={s.page}>
      <PageHead
        kicker="Identity"
        title="Roles"
        lede="Every role, newest first. Open one for its trust relationship and its permissions."
      />
      <DataTable
        rows={ROLES}
        cols={roleCols}
        rowKey={(r) => r.id}
        title="Roles"
        search={(r) => `${r.id} ${r.role.org} ${r.path} ${r.role.duties.join(' ')}`}
        placeholder="Find roles or duties"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ role */

const resourceLink = (crn: string) => {
  const r = RESOURCES.find((x) => x.crn === crn);
  return r ? (
    <a key={crn} href={href(r.href)} className={s.mono}>
      {crn}
    </a>
  ) : (
    <code key={crn}>{crn}</code>
  );
};

const conditionText = (st: Statement) => {
  const c = st.Condition ?? {};
  const from = Object.values(c.DateGreaterThanEquals ?? {})[0];
  const to = Object.values(c.DateLessThan ?? {})[0];
  return `${from ? `from ${from}` : ''}${to ? ` until ${to}` : ' with no end'}`;
};

export function RoleDetail({ id }: { id: string }) {
  const info = roleById(id) as RoleInfo;
  const r = info.role;
  const [tab, setTab] = useState<'permissions' | 'trust' | 'tags'>('permissions');
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const p = POLICIES[id];
  return (
    <div className={s.page}>
      <PageHead
        kicker="IAM role"
        title={r.id}
        actions={
          <>
            <button
              type="button"
              className={s.btn}
              onClick={() => runInShell(`cloud roles describe ${r.id}`)}
            >
              <Icon name="terminal" size={16} /> Describe
            </button>
            <a className={s.btn} href={href('iam/simulator')}>
              <Icon name="shield" size={16} /> Simulate
            </a>
          </>
        }
      >
        <div className={s.headMeta}>
          <StatusBadge status={info.active ? 'active' : 'ended'} />
          <Crn value={info.crn} />
        </div>
      </PageHead>

      <div className={s.detailGrid}>
        <Card title="Summary">
          <KeyValues
            items={[
              ['Trusted entity', r.url ? <Ext url={r.url}>{r.org}</Ext> : r.org],
              ...(r.sector ? [['Sector', r.sector] as [string, string]] : []),
              ['Created', fmt.month(r.from)],
              ['Last activity', r.to ? fmt.month(r.to) : 'Active now'],
              ['Max session duration', `${info.months} months (${duration(info.months)})`],
              ['Contract', r.contract ? 'Yes' : 'No'],
              ['Description', r.summary],
            ]}
          />
        </Card>
        <Card title="Titles">
          <ol className={s.steps}>
            {r.steps.map((st, i) => {
              const to = r.steps[i + 1]?.from ?? r.to;
              return (
                <li key={st.title} data-current={(!to && !r.to) || undefined}>
                  <b>{st.title}</b>
                  <span className={s.mono}>
                    {fmt.mon(st.from)} – {to ? fmt.mon(to) : 'now'}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      <Tabs
        tabs={[
          { id: 'permissions', label: 'Permissions', count: p.permissions.Statement.length },
          { id: 'trust', label: 'Trust relationships' },
          { id: 'tags', label: 'Tags', count: r.steps.length + 2 },
        ]}
        value={tab}
        onChange={setTab}
        label="Role"
      />

      {tab === 'permissions' && (
        <Card
          title={
            <>
              Policy <code>{r.id}-duties</code> <Pill>Customer managed</Pill>
            </>
          }
          actions={
            <div className={s.segmented} role="radiogroup" aria-label="Policy view">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'visual'}
                onClick={() => setMode('visual')}
              >
                Visual
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'json'}
                onClick={() => setMode('json')}
              >
                JSON
              </button>
            </div>
          }
        >
          {mode === 'visual' ? (
            <ol className={s.statements}>
              {p.permissions.Statement.map((st) => (
                <li key={st.Sid}>
                  <header>
                    <Pill tone="ok">{st.Effect}</Pill>
                    <code className={s.action}>{st.Action as string}</code>
                  </header>
                  <p className={s.duty}>{st.Duty}</p>
                  <dl className={s.stMeta}>
                    <div>
                      <dt>Resource</dt>
                      <dd className={s.linkList}>
                        {(Array.isArray(st.Resource) ? st.Resource : [st.Resource]).map(
                          resourceLink,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Condition</dt>
                      <dd>{conditionText(st)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            <JsonView
              value={p.permissions}
              label={`${r.id} permissions policy`}
              title={`${r.id}-duties.json`}
            />
          )}
        </Card>
      )}

      {tab === 'trust' && (
        <div className={s.detailGrid}>
          <Card title="Trusted entities">
            <p className={s.prose}>
              {r.org} could assume this role{r.contract ? ', on contract,' : ''} from{' '}
              {fmt.month(r.from)}
              {r.to ? ` until ${fmt.month(r.to)}` : ', and still can'}, under the{' '}
              {r.steps.length === 1 ? 'title' : 'titles'} {fmt.list(r.steps.map((x) => x.title))}.
            </p>
          </Card>
          <JsonView value={p.trust} label={`${r.id} trust policy`} title="trust-policy.json" />
        </div>
      )}

      {tab === 'tags' && (
        <Card title="Tags">
          <Tags
            tags={[
              ['org', r.org],
              ...r.steps.map((x) => ['title', x.title] as [string, string]),
              ['contract', r.contract ? 'true' : 'false'],
            ]}
          />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ simulator */

const MIN = ym(PERIOD.from);
const MAX = ym(asOf);
const toYm = (n: number) => ({ y: Math.floor(n / 12), m: (n % 12) + 1 });
const ORDER = [...ROLES].sort((a, b) => ym(a.role.from) - ym(b.role.from));

function Gantt({ at, onPick }: { at: number; onPick: (n: number) => void }) {
  const [box, width] = useWidth<HTMLDivElement>(900);
  const W = 1000;
  const row = 26;
  const H = ORDER.length * row + 26;
  const x = (n: number) => ((n - MIN) / (MAX + 1 - MIN)) * W;
  const step = width < 520 ? 4 : 2;
  const years = Array.from(
    { length: asOf.y - PERIOD.from.y + 1 },
    (_, i) => PERIOD.from.y + i,
  ).filter((y) => y % step === 0);
  const pick = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onPick(Math.round(MIN + ((e.clientX - rect.left) / rect.width) * (MAX - MIN)));
  };
  return (
    <div className={s.gantt} ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Roles over time; the line marks the simulated month"
        onPointerDown={(e) => {
          pick(e);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pick(e);
        }}
      >
        {years.map((y) => (
          <line
            key={y}
            x1={x(y * 12)}
            x2={x(y * 12)}
            y1={0}
            y2={H - 18}
            className={s.grid}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {ORDER.map((r, i) => {
          const end = ym(r.role.to ?? asOf) + (r.role.to ? 0 : 1);
          return (
            <rect
              key={r.id}
              x={x(ym(r.role.from))}
              y={i * row + 5}
              width={Math.max(3, x(end) - x(ym(r.role.from)))}
              height={row - 10}
              rx={4}
              className={s.ganttBar}
              data-series={i}
            />
          );
        })}
        <line
          x1={x(at) + 0.5}
          x2={x(at) + 0.5}
          y1={0}
          y2={H - 18}
          className={s.ganttCursor}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className={s.ganttLabels} aria-hidden="true">
        {ORDER.map((r, i) => {
          const start = x(ym(r.role.from)) / W;
          const end = x(ym(r.role.to ?? asOf) + (r.role.to ? 0 : 1)) / W;
          // Inside the bar when the name fits there (about 7px a letter), else just before it.
          const inside = (end - start) * width > r.name.length * 7 + 16;
          return (
            <span
              key={r.id}
              data-inside={inside || undefined}
              style={
                inside
                  ? { top: i * row + 4, left: `${start * 100}%` }
                  : { top: i * row + 4, right: `${(1 - start) * 100}%` }
              }
            >
              {r.name}
            </span>
          );
        })}
      </div>
      <div className={s.ganttYears} aria-hidden="true">
        {years.map((y) => (
          <span key={y} style={{ left: `${(x(y * 12) / W) * 100}%` }}>
            {y}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Simulator() {
  const [at, setAt] = useState(MAX);
  const when = toYm(at);
  const results = simulate(when);
  const held = results.filter((r) => r.trust.decision === 'Allow');
  const clamp = (n: number) => Math.max(MIN, Math.min(MAX, n));
  return (
    <div className={s.page}>
      <PageHead
        kicker="Identity"
        title="Policy simulator"
        lede="Choose a month. The simulator evaluates every role's trust policy for identity:AssumeRole, then each permissions statement, with the month as the request time. Deny wins, then Allow; anything unmatched is implicitly denied."
      />
      <Card>
        <div className={s.simControls}>
          <label className={s.simMonth}>
            <span>Request time</span>
            <input
              type="month"
              value={fmt.iso(when)}
              min={fmt.iso(toYm(MIN))}
              max={fmt.iso(toYm(MAX))}
              onChange={(e) =>
                e.target.value &&
                setAt(
                  clamp(
                    ym({
                      y: Number(e.target.value.slice(0, 4)),
                      m: Number(e.target.value.slice(5, 7)),
                    }),
                  ),
                )
              }
            />
          </label>
          <input
            className={s.simRange}
            type="range"
            min={MIN}
            max={MAX}
            step={1}
            value={at}
            onChange={(e) => setAt(Number(e.target.value))}
            aria-label="Month"
            aria-valuetext={fmt.month(when)}
          />
          <div className={s.simPresets}>
            {ORDER.map((r) => (
              <button
                key={r.id}
                type="button"
                className={s.chip}
                onClick={() => setAt(ym(r.role.from))}
              >
                {r.name} {r.role.from.y}
              </button>
            ))}
            <button type="button" className={s.chip} onClick={() => setAt(MAX)}>
              Now
            </button>
          </div>
        </div>
        <Gantt at={at} onPick={(n) => setAt(clamp(n))} />
        <p className={s.simSummary} aria-live="polite">
          <b>{fmt.month(when)}</b>:{' '}
          {held.length
            ? `${held.length === 1 ? 'one role' : `${fmt.spell(held.length)} roles`} in effect, ${held.map((h) => `${h.title}, ${h.info.role.org}`).join('; ')}.`
            : 'no role could be assumed. Every action is implicitly denied.'}
        </p>
      </Card>
      <ul className={s.simResults}>
        {results.map((r) => {
          const allowed = r.trust.decision === 'Allow';
          return (
            <li key={r.info.id} className={s.card} data-allowed={allowed || undefined}>
              <header>
                <a href={href(`iam/roles/${r.info.id}`)}>
                  <b>{r.info.id}</b>
                </a>
                <span className={s.muted}>{r.info.role.org}</span>
                <Pill tone={allowed ? 'ok' : 'muted'}>
                  {allowed ? 'AssumeRole: Allow' : 'AssumeRole: ImplicitDeny'}
                </Pill>
              </header>
              {allowed && (
                <ul className={s.simActions}>
                  {r.actions.map((a) => (
                    <li key={a.sid}>
                      <Icon name="check" size={14} />
                      <span>
                        <code>{a.action}</code>
                        <small>{a.duty}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ user */

export function UserDetail() {
  return (
    <div className={s.page}>
      <PageHead kicker="IAM user" title={ACCOUNT}>
        <div className={s.headMeta}>
          <StatusBadge status="active" />
          <Crn value={USER.crn} />
        </div>
      </PageHead>
      <div className={s.detailGrid}>
        <Card title="Profile">
          <div className={s.userHead}>
            <Image
              src={person.photo}
              width={160}
              height={160}
              alt={profile.name}
              className={s.userPhoto}
            />
            <div>
              <b>{profile.name}</b>
              <span>{profile.fullName}</span>
              <span>{profile.headline}</span>
            </div>
          </div>
          <p className={s.prose}>{profile.tagline}</p>
          <KeyValues
            items={[
              ['User name', ACCOUNT],
              ['Account ID', accountIdPretty],
              ['Title', current.title],
              [
                'Organization',
                <Ext key="o" url={current.companyUrl}>
                  {current.company}
                </Ext>,
              ],
              ['Building since', String(person.since)],
              [
                'Email',
                <a key="e" href={`mailto:${person.email}`}>
                  {person.email}
                </a>,
              ],
            ]}
          />
        </Card>
        <Card title="About">
          {about.map((p) => (
            <p key={p.slice(0, 20)} className={s.prose}>
              {p}
            </p>
          ))}
        </Card>
        <Card title="Skills" actions={<Pill>Permissions boundary</Pill>}>
          <p className={s.skillsLine}>
            {skills.map((k) => (
              <Pill key={k}>{k}</Pill>
            ))}
          </p>
        </Card>
        <Card title="Contact methods">
          <ul className={s.contactList}>
            <li>
              <Icon name="mail" size={16} />
              <a href={`mailto:${person.email}`}>{person.email}</a>
            </li>
            <li>
              <Icon name="link" size={16} />
              <Ext url={person.linkedin}>LinkedIn</Ext>
            </li>
            <li>
              <Icon name="code" size={16} />
              <Ext url={person.github}>GitHub</Ext>
            </li>
            <li>
              <Icon name="file" size={16} />
              <Ext url={person.cv}>CV (PDF)</Ext>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
