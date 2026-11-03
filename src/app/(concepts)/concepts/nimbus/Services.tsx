'use client';

import { useMemo, useState } from 'react';
import { db } from '../_shared/data';
import {
  BUCKETS,
  PAGES,
  REGIONS,
  RESOURCES,
  SERVICES,
  STATUS,
  createdSort,
  hash,
  inRegion,
  kebab,
  regionById,
  resourceByKey,
  resourceKey,
  rng,
  serviceById,
  slug,
  type Resource,
  type ServiceId,
  type Stat,
  type Status,
} from './inventory';
import { iconOf } from './labels';
import { runInShell } from './Shell';
import {
  Card,
  Crn,
  DataTable,
  Empty,
  Ext,
  Icon,
  JsonView,
  KeyValues,
  MetricChart,
  PageHead,
  Pill,
  RangePicker,
  StatusBadge,
  Tabs,
  Tags,
  cx,
  type Col,
  type Metric,
  type RangeId,
} from './ui';
import { href, setUi, useUi } from './store';
import s from './console.module.scss';

const { devices } = db;

/* ------------------------------------------------------------------ shared */

export function Figures({ items, label = 'From the record' }: { items: Stat[]; label?: string }) {
  if (!items.length) return null;
  return (
    <div className={s.figures} aria-label={label}>
      {items.map((f) => (
        <div key={`${f.label}-${f.value}`} className={s.figure}>
          <span>{f.label}</span>
          <b>{f.value}</b>
          {f.note && <small>{f.note}</small>}
        </div>
      ))}
    </div>
  );
}

const regionText = (r: Resource) =>
  r.regions.length ? r.regions.map((id) => regionById(id)?.name ?? id).join(', ') : '—';

function RegionNote({ hidden }: { hidden: number }) {
  const ui = useUi();
  if (ui.region === 'all') return null;
  const region = regionById(ui.region);
  return (
    <div className={s.banner} role="note">
      <Icon name="globe" size={16} />
      <span>
        Showing <b>{region?.name ?? ui.region}</b> only.{' '}
        {hidden > 0 &&
          `${hidden} more ${hidden === 1 ? 'resource has' : 'resources have'} no country on record and ${hidden === 1 ? 'shows' : 'show'} under All regions.`}
      </span>
      <button type="button" className={s.linkBtn} onClick={() => setUi({ region: 'all' })}>
        Show all regions
      </button>
    </div>
  );
}

export const resourceCols = (opts: { service?: boolean } = {}): Col<Resource>[] => [
  {
    key: 'name',
    label: 'Name',
    sort: (r) => r.name.toLowerCase(),
    render: (r) => (
      <a href={href(r.href)} className={s.cellName}>
        <b>{r.name}</b>
        <small>{r.kind}</small>
      </a>
    ),
  },
  ...(opts.service
    ? [
        {
          key: 'service',
          label: 'Service',
          sort: (r: Resource) => r.service,
          render: (r: Resource) => serviceById(r.service)?.name,
          wide: true,
        } as Col<Resource>,
      ]
    : []),
  {
    key: 'status',
    label: 'Status',
    sort: (r) => STATUS[r.status].label,
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'region',
    label: 'Regions',
    sort: (r) => regionText(r),
    render: (r) => <span className={s.muted}>{regionText(r)}</span>,
    wide: true,
  },
  {
    key: 'created',
    label: 'Shipped',
    sort: (r) => createdSort(r),
    render: (r) => <span className={s.mono}>{r.created}</span>,
    wide: true,
  },
  {
    key: 'stack',
    label: 'Stack',
    render: (r) => <span className={s.stackCell}>{r.tech.slice(0, 3).join(' · ') || '—'}</span>,
    wide: true,
  },
];

const search = (r: Resource) =>
  `${r.name} ${r.id} ${r.kind} ${r.summary} ${r.tech.join(' ')} ${r.tags.map((t) => t.join(':')).join(' ')} ${r.crn}`;

/* ------------------------------------------------------------------ catalogue */

const TOOLS: {
  path: string;
  name: string;
  blurb: string;
  icon: Parameters<typeof Icon>[0]['name'];
}[] = [
  {
    path: 'resources',
    name: 'All resources',
    blurb: 'Every product, device, store and role in one inventory.',
    icon: 'resources',
  },
  {
    path: 'regions',
    name: 'Regions',
    blurb: 'The countries the products run in.',
    icon: 'regions',
  },
  {
    path: 'events',
    name: 'Audit trail',
    blurb: 'Career events with their real dates, filterable.',
    icon: 'events',
  },
  {
    path: 'billing',
    name: 'Billing',
    blurb: 'Time invested per role, in months, with a chart.',
    icon: 'billing',
  },
  {
    path: 'marketplace',
    name: 'Marketplace',
    blurb: 'Open-source contributions, with pull request links.',
    icon: 'marketplace',
  },
  {
    path: 'iam/simulator',
    name: 'Policy simulator',
    blurb: 'Pick a month; see which roles he held and what they allowed.',
    icon: 'shield',
  },
];

export function Catalogue() {
  return (
    <div className={s.page}>
      <PageHead
        kicker="Catalogue"
        title="All services"
        lede="Six services, each one a part of the career. Open one to see its resources."
      />
      <ul className={s.catalogue}>
        {SERVICES.map((sv) => (
          <li key={sv.id}>
            <a href={href(sv.id)} className={s.svcCard}>
              <span className={s.svcIcon} data-svc={sv.id} data-size="lg">
                <Icon name={iconOf(sv.id)} size={22} />
              </span>
              <span className={s.svcCardText}>
                <b>{sv.name}</b>
                <small>{sv.maps}</small>
                <span>{sv.blurb}</span>
              </span>
              <span className={s.svcCount}>
                {sv.id === 'storage'
                  ? BUCKETS.length
                  : RESOURCES.filter((r) => r.service === sv.id).length}
                <small>
                  {sv.id === 'storage' ? 'buckets' : sv.id === 'iam' ? 'roles' : 'resources'}
                </small>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <h2 className={s.sectionTitle}>Management and governance</h2>
      <ul className={s.tools}>
        {TOOLS.map((t) => (
          <li key={t.path}>
            <a href={href(t.path)}>
              <Icon name={t.icon} size={18} />
              <span>
                <b>{t.name}</b>
                <small>{t.blurb}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ service page */

const SHELL_LIST: Record<string, string> = {
  compute: 'cloud resources list --service compute',
  iot: 'cloud devices list',
  databases: 'cloud resources list --service databases',
  ml: 'cloud resources list --service ml',
};

export function ServicePage({ id }: { id: ServiceId }) {
  const ui = useUi();
  const sv = serviceById(id);
  const all = RESOURCES.filter((r) => r.service === id);
  const rows = all.filter((r) => inRegion(r, ui.region));
  if (!sv) return <NotFound path={id} />;
  const fleet =
    id === 'iot'
      ? all.filter((r) => r.figures.length > 1)
      : id === 'databases'
        ? all.filter((r) => r.figures.length)
        : [];
  const kinds = [...new Set(all.map((r) => r.kind))];
  return (
    <div className={s.page}>
      <PageHead
        kicker={sv.maps}
        title={
          <span className={s.titleIcon}>
            <span className={s.svcIcon} data-svc={sv.id} data-size="lg">
              <Icon name={iconOf(sv.id)} size={22} />
            </span>
            {sv.name}
          </span>
        }
        lede={sv.blurb}
        actions={
          SHELL_LIST[id] && (
            <button type="button" className={s.btn} onClick={() => runInShell(SHELL_LIST[id])}>
              <Icon name="terminal" size={16} /> List in CloudShell
            </button>
          )
        }
      />
      <ul className={s.miniStats}>
        <li>
          <span>Resources</span>
          <b>{all.length}</b>
        </li>
        {kinds.map((k) => (
          <li key={k}>
            <span>{k}</span>
            <b>{all.filter((r) => r.kind === k).length}</b>
          </li>
        ))}
        {(Object.keys(STATUS) as Status[])
          .filter((st) => all.some((r) => r.status === st))
          .map((st) => (
            <li key={st}>
              <span>{STATUS[st].label}</span>
              <b>{all.filter((r) => r.status === st).length}</b>
            </li>
          ))}
      </ul>
      {fleet.map((r) => (
        <Card
          key={r.id}
          title={id === 'iot' ? `${r.name} fleet` : r.name}
          actions={<Pill tone="ok">From the record</Pill>}
        >
          <Figures items={r.figures} />
        </Card>
      ))}
      <RegionNote hidden={all.length - rows.length} />
      <DataTable
        rows={rows}
        cols={resourceCols()}
        rowKey={resourceKey}
        search={search}
        title="Resources"
        initialSort={{ key: 'created', dir: -1 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ all resources */

export function AllResources() {
  const ui = useUi();
  const [service, setService] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const rows = RESOURCES.filter(
    (r) =>
      inRegion(r, ui.region) &&
      (service === 'all' || r.service === service) &&
      (status === 'all' || r.status === status),
  );
  const hidden = RESOURCES.filter((r) => !inRegion(r, ui.region)).length;
  return (
    <div className={s.page}>
      <PageHead
        kicker="Inventory"
        title="All resources"
        lede="Every product, device, data store, bucket and role in the account, with its status, regions and resource name."
      />
      <RegionNote hidden={hidden} />
      <DataTable
        rows={rows}
        cols={resourceCols({ service: true })}
        rowKey={resourceKey}
        search={search}
        title="Resources"
        initialSort={{ key: 'service', dir: 1 }}
        pageSize={15}
        toolbar={
          <>
            <label className={s.select}>
              <span>Service</span>
              <select value={service} onChange={(e) => setService(e.target.value)}>
                <option value="all">All</option>
                {SERVICES.map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.select}>
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All</option>
                {(Object.keys(STATUS) as Status[]).map((st) => (
                  <option key={st} value={st}>
                    {STATUS[st].label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ resource detail */

const days = { '1h': 1 / 24, '12h': 0.5, '1d': 1, '1w': 7, '30d': 30 } as const;

function metricsFor(r: Resource, range: RangeId): Metric[] {
  const rand = rng(hash(r.crn));
  const k = (n: number) => Math.round(n * (0.6 + rand() * 0.8) * 100) / 100;
  if (r.service === 'compute')
    return [
      { id: 'req', label: 'Requests', unit: '/min', base: k(140), swing: k(90) },
      { id: 'p95', label: 'Latency p95', unit: 'ms', base: k(190), swing: k(60) },
      { id: 'err', label: 'Errors', unit: '%', base: k(0.3), swing: k(0.2), digits: 2 },
      { id: 'cpu', label: 'CPU', unit: '%', base: k(30), swing: k(16) },
    ];
  if (r.service === 'databases')
    return [
      { id: 'w', label: 'Writes', unit: '/min', base: k(220), swing: k(140) },
      { id: 'lat', label: 'Read latency', unit: 'ms', base: k(6), swing: k(3), digits: 1 },
      { id: 'conn', label: 'Connections', unit: '', base: k(24), swing: k(10) },
    ];
  if (r.service === 'ml')
    return [
      { id: 'inv', label: 'Invocations', unit: '/min', base: k(40), swing: k(30) },
      { id: 'lat', label: 'Latency p95', unit: 's', base: k(1.4), swing: k(0.6), digits: 2 },
    ];
  if (r.service === 'iot') {
    if (r.id === slug(devices.attendumReader.name)) {
      const points = { '1h': 60, '12h': 72, '1d': 96, '1w': 84, '30d': 90 }[range];
      const perPoint =
        (100 / (devices.attendumReader.batteryMonths * (365.25 / 12))) * (days[range] / points);
      return [
        { id: 'chk', label: 'Check-ins', unit: '/h', base: k(60), swing: k(50) },
        {
          id: 'bat',
          label: 'Battery, one reader',
          unit: '%',
          base: Math.min(94, k(76)),
          swing: 2,
          slope: -perPoint,
          digits: 1,
          max: 100,
          note: `Slope modelled from a battery life of about ${devices.attendumReader.batteryMonths} months; the level is illustrative.`,
        },
        { id: 'rssi', label: 'BLE signal quality', unit: '%', base: k(70), swing: k(10) },
      ];
    }
    if (r.id === slug(devices.logger.name))
      return [
        { id: 'up', label: 'Uplink messages', unit: '/h', base: k(90), swing: k(40) },
        { id: 'gsm', label: 'GSM signal quality', unit: '%', base: k(65), swing: k(12) },
        {
          id: 'tmp',
          label: 'Air temperature, one station',
          unit: '°C',
          base: k(16),
          swing: k(7),
          digits: 1,
        },
      ];
    return [
      { id: 'msg', label: 'Messages', unit: '/min', base: k(30), swing: k(20) },
      { id: 'loop', label: 'Control loop time', unit: 'ms', base: k(4), swing: k(1.5), digits: 1 },
    ];
  }
  return [];
}

const SHELL_DESCRIBE: Partial<Record<ServiceId, (r: Resource) => string>> = {
  compute: (r) => `cloud products describe ${r.id}`,
  iot: (r) =>
    Object.values(devices).some((d) => slug(d.name) === r.id)
      ? `cloud devices get ${r.id}`
      : `cloud products describe ${r.id}`,
};

const asJson = (r: Resource) => ({
  Name: r.name,
  Id: r.id,
  Crn: r.crn,
  Service: r.service,
  Kind: r.kind,
  Status: STATUS[r.status].label,
  Regions: r.regions,
  Shipped: r.created,
  BuiltAt: r.madeAt ?? null,
  Stack: r.tech,
  Endpoints: r.links.map((l) => l.url),
  Figures: Object.fromEntries(r.figures.map((f) => [f.label, f.value])),
  Tags: r.tags.map(([Key, Value]) => ({ Key, Value })),
  Description: r.detail,
});

export function ResourceDetail({ resource: r }: { resource: Resource }) {
  const monitored = r.service !== 'storage' && r.service !== 'iam';
  const [tab, setTab] = useState<'overview' | 'monitoring' | 'tags' | 'json'>('overview');
  const [range, setRange] = useState<RangeId>('1d');
  const metrics = useMemo(() => metricsFor(r, range), [r, range]);
  const sv = serviceById(r.service);
  const describe = SHELL_DESCRIBE[r.service]?.(r);
  const site = r.links.find((l) => l.kind === 'site');
  const related = r.related.map(resourceByKey).filter((x): x is Resource => Boolean(x));
  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    ...(monitored ? [{ id: 'monitoring' as const, label: 'Monitoring' }] : []),
    { id: 'tags' as const, label: 'Tags', count: r.tags.length },
    { id: 'json' as const, label: 'JSON' },
  ];

  return (
    <div className={s.page}>
      <PageHead
        kicker={`${sv?.name} · ${r.kind}`}
        title={r.name}
        actions={
          <>
            {describe && (
              <button type="button" className={s.btn} onClick={() => runInShell(describe)}>
                <Icon name="terminal" size={16} /> Describe
              </button>
            )}
            {site && (
              <Ext url={site.url} className={s.btnPrimary}>
                Open {site.label}
              </Ext>
            )}
          </>
        }
      >
        <div className={s.headMeta}>
          <StatusBadge status={r.status} />
          <Crn value={r.crn} />
        </div>
      </PageHead>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Resource" />

      {tab === 'overview' && (
        <div className={s.detailGrid}>
          <Card title="Details">
            <KeyValues
              items={[
                ['Status', <StatusBadge key="s" status={r.status} />],
                ['Service', sv?.name],
                ['Kind', r.kind],
                ['Regions', regionText(r)],
                ['Shipped', r.created === '—' ? 'Undated' : r.created],
                ...(r.madeAt ? [['Built at', r.madeAt] as [string, string]] : []),
                ['Stack', r.tech.length ? r.tech.join(', ') : '—'],
                [
                  'Endpoints',
                  r.links.length ? (
                    <span className={s.linkList}>
                      {r.links.map((l) => (
                        <Ext key={l.url} url={l.url}>
                          {l.label}
                        </Ext>
                      ))}
                    </span>
                  ) : (
                    <span className={s.muted}>No public endpoint</span>
                  ),
                ],
              ]}
            />
          </Card>
          <Card title="Description">
            <p className={s.prose}>{r.detail}</p>
            {r.figures.length > 0 && r.figures[0].label !== 'Status' && (
              <>
                <h3 className={s.subTitle}>
                  Figures <Pill tone="ok">From the record</Pill>
                </h3>
                <Figures items={r.figures} />
              </>
            )}
          </Card>
          {related.length > 0 && (
            <Card title="Related resources" className={s.span2}>
              <ul className={s.related}>
                {related.map((x) => (
                  <li key={resourceKey(x)}>
                    <a href={href(x.href)}>
                      <span className={s.svcIcon} data-svc={x.service}>
                        <Icon name={iconOf(x.service)} size={15} />
                      </span>
                      <span>
                        <b>{x.name}</b>
                        <small>{x.kind}</small>
                      </span>
                      <StatusBadge status={x.status} />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'monitoring' && (
        <div>
          <div className={s.monitorBar}>
            <p className={s.callout}>
              <Icon name="info" size={16} />
              <span>
                Charts are illustrative series, seeded per resource: the texture of a metric, not a
                measurement.
                {r.figures.length > 0 &&
                  r.figures[0].label !== 'Status' &&
                  ' The figures above them are real, from the record.'}
              </span>
            </p>
            <RangePicker value={range} onChange={setRange} />
          </div>
          {r.figures.length > 0 && r.figures[0].label !== 'Status' && <Figures items={r.figures} />}
          <div className={s.metrics}>
            {metrics.map((m) => (
              <Card key={m.id} flush>
                <MetricChart seed={r.crn} metric={m} range={range} />
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'tags' && (
        <Card title="Tags">
          <Tags tags={r.tags} />
        </Card>
      )}

      {tab === 'json' && (
        <JsonView value={asJson(r)} label={`${r.name} as JSON`} title={`${r.id}.json`} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ regions */

export function Regions() {
  const ui = useUi();
  const unscoped = RESOURCES.filter(
    (r) => !r.regions.length && r.service !== 'iam' && r.service !== 'storage',
  ).length;
  return (
    <div className={s.page}>
      <PageHead
        kicker="Global"
        title="Regions"
        lede={`The countries his products run in, read from each product's record. ${unscoped} resources have no country on record; they show under All regions.`}
      />
      <ul className={s.regionCards}>
        {REGIONS.map((reg) => {
          const res = RESOURCES.filter((r) => r.regions.includes(reg.id));
          const selected = ui.region === reg.id;
          return (
            <li
              key={reg.id}
              className={cx(s.card, s.regionCard)}
              data-selected={selected || undefined}
            >
              <header>
                <span className={s.liveDot} aria-hidden="true" />
                <div>
                  <b>{reg.name}</b>
                  <code>{reg.id}</code>
                </div>
                <Pill tone="ok">Enabled</Pill>
              </header>
              <p className={s.regionProducts}>
                {reg.products.map((p) => {
                  const r = RESOURCES.find((x) => x.service === 'compute' && x.id === kebab(p));
                  return r ? (
                    <a key={p} href={href(r.href)}>
                      {db.products[p].title}
                    </a>
                  ) : (
                    <span key={p}>{db.products[p].title}</span>
                  );
                })}
              </p>
              <footer>
                <span className={s.muted}>
                  {res.length} resources · {reg.products.length}{' '}
                  {reg.products.length === 1 ? 'product' : 'products'}
                </span>
                <button
                  type="button"
                  className={selected ? s.btnPrimary : s.btn}
                  aria-pressed={selected}
                  onClick={() => setUi({ region: selected ? 'all' : reg.id })}
                >
                  {selected ? 'Selected' : 'Switch to'}
                </button>
              </footer>
            </li>
          );
        })}
      </ul>
      <Card title="How regions work here">
        <p className={s.prose}>
          A region is a country named in a product&rsquo;s record. Products carry their own list,
          and devices inherit the regions of the platform they belong to. Identity, billing, the
          audit trail, storage and the marketplace are global. Choosing a region in the top bar
          filters every resource list, and CloudShell uses it as the default <code>--region</code>.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ not found */

export function NotFound({ path }: { path: string }) {
  const near = PAGES.find((p) => p.path && path.startsWith(p.path.split('/')[0]));
  return (
    <div className={s.page}>
      <PageHead kicker="Error" title="Resource not found" />
      <Empty title={`ResourceNotFoundException: nothing at #/${path}`}>
        <span>
          {near ? (
            <>
              Try <a href={href(near.path)}>{near.title}</a>, or go <a href={href('')}>home</a>.
            </>
          ) : (
            <a href={href('')}>Back to Console Home</a>
          )}
        </span>
      </Empty>
    </div>
  );
}
