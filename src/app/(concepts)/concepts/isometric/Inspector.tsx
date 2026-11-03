'use client';

// The right-hand inspector: the device document (its real figures, description and links from
// db) and the properties of whatever is selected, with mass properties computed from the mesh.
import { db, fmt, hardware } from '../_shared/data';
import { projectLinks } from '../_shared/links';
import type { PartStats, Totals } from './engine';
import { Icon, KIND_ICON } from './icons';
import { KIND_LABEL, MAT_LOOK, type DeviceId, type Flat, type Item, type V3 } from './models';
import s from './viewer.module.scss';

type ProductId = keyof typeof db.products;
const PRODUCT: Record<DeviceId, ProductId> = {
  logger: 'logger',
  epc: 'epc',
  plc: 'miniPlc',
  attendumReader: 'attendum',
  attendumBeacon: 'attendum',
};

/** What db says about a device and what it belongs to. */
export function deviceFacts(id: DeviceId) {
  const dev = db.devices[id];
  const chip = 'chip' in dev ? dev.chip : undefined;
  const product = db.products[PRODUCT[id]];
  const build = db.builds.find(
    (b) => b.title.startsWith(dev.name) || (chip !== undefined && b.tech.includes(chip)),
  );
  const role = db.roleList.find((r) => r.duties.some((d) => d.includes(product.title)));
  const card = hardware.find((h) => h.tag === dev.tag);
  return {
    dev,
    chip,
    product,
    build,
    role,
    figures: card?.figures ?? db.deviceFigures(id),
    links: projectLinks(product.links),
  };
}

const n3 = (v: number) => v.toFixed(3);
const vec = (v: V3, d = 2) => v.map((x) => x.toFixed(d)).join(', ');
const dirLabel = (d: V3) =>
  d
    .map((v, i) => (Math.abs(v) > 0.5 ? `${v > 0 ? '+' : '−'}${'XYZ'[i]}` : ''))
    .filter(Boolean)
    .join(' ');

function aggregate(ids: string[], stats: Record<string, PartStats> | undefined) {
  if (!stats) return null;
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  let volume = 0,
    area = 0,
    tris = 0,
    n = 0;
  for (const id of ids) {
    const st = stats[id];
    if (!st) continue;
    n++;
    volume += st.volume;
    area += st.area;
    tris += st.tris;
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], st.center[i] - st.size[i] / 2);
      hi[i] = Math.max(hi[i], st.center[i] + st.size[i] / 2);
    }
  }
  if (!n) return null;
  return {
    size: [0, 1, 2].map((i) => hi[i] - lo[i]) as V3,
    center: [0, 1, 2].map((i) => (hi[i] + lo[i]) / 2) as V3,
    volume,
    area,
    tris,
    n,
  };
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className={s.props}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={s.propGroup}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

interface Props {
  flat: Flat;
  doc: DeviceId;
  tab: 'device' | 'props';
  onTab(t: 'device' | 'props'): void;
  sel: string[];
  selParts: string[];
  hidden: Set<string>;
  stats?: Record<string, PartStats>;
  totals?: Totals;
  onZoom(ids: string[]): void;
  onHide(ids: string[]): void;
  onIsolate(ids: string[]): void;
  onNotes(): void;
}

export function Inspector(p: Props) {
  return (
    <div className={s.inspector}>
      <div className={s.inspTabs} role="tablist" aria-label="Inspector">
        {(['device', 'props'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`insp-${t}`}
            aria-selected={p.tab === t}
            aria-controls={`insp-${t}-panel`}
            className={s.inspTab}
            onClick={() => p.onTab(t)}
          >
            {t === 'device' ? 'Device' : 'Properties'}
            {t === 'props' && p.selParts.length > 0 && (
              <span className={s.badge}>{p.selParts.length}</span>
            )}
          </button>
        ))}
      </div>
      <div
        className={s.inspBody}
        role="tabpanel"
        id={`insp-${p.tab}-panel`}
        aria-labelledby={`insp-${p.tab}`}
      >
        {p.tab === 'device' ? <DevicePanel {...p} /> : <PropsPanel {...p} />}
      </div>
    </div>
  );
}

function DevicePanel({ flat, doc, totals, onNotes }: Props) {
  const f = deviceFacts(doc);
  const reader = doc === 'attendumReader' ? db.devices.attendumReader : null;
  return (
    <div className={s.device}>
      <p className={s.devTag}>
        <span>{f.dev.tag}</span>
        {f.dev.kind}
      </p>
      <h2 className={s.devName}>{f.dev.name}</h2>
      <p className={s.devDetail}>{f.dev.detail}</p>
      <ul className={s.figures}>
        {f.figures.map((fig) => {
          const [num, ...rest] = fig.split(' ');
          const big = /\d/.test(num);
          return (
            <li key={fig} data-status={!big || undefined}>
              {big ? (
                <>
                  <b>{num}</b>
                  <span>{rest.join(' ')}</span>
                </>
              ) : (
                <b>{fig}</b>
              )}
            </li>
          );
        })}
        {reader && (
          <li>
            <b>{reader.fleet.classrooms.short}</b>
            <span>classrooms</span>
          </li>
        )}
      </ul>
      {reader && (
        <p className={s.fine}>{`Fleet figures from ${reader.fleet.scope}, so lower bounds.`}</p>
      )}

      <Group title="Main chip">
        {f.chip ? (
          <p className={s.chipLine}>
            <Icon name="chip" size={15} />
            <b>{f.chip}</b>
            <span>marked on the model’s main package</span>
          </p>
        ) : (
          <p className={s.fine}>Not on record, so the model’s main package carries no marking.</p>
        )}
      </Group>

      <Group title={`Product · ${f.product.title}`}>
        <p className={s.prose}>{f.product.description}</p>
        <Rows
          rows={[
            ...(f.build
              ? ([
                  [
                    'Build',
                    f.build.year === '—'
                      ? `Undated · ${f.build.madeAt ?? ''}`
                      : `${f.build.year}${f.build.madeAt ? ` · ${f.build.madeAt}` : ''}`,
                  ],
                ] as [string, React.ReactNode][])
              : []),
            ...(f.role
              ? ([['Role', `${f.role.org}, ${fmt.yearSpan(f.role.from, f.role.to, ' – ')}`]] as [
                  string,
                  React.ReactNode,
                ][])
              : []),
            ['Stack', f.product.tech.join(', ')],
            ...(reader
              ? ([['Battery', `about ${reader.batteryMonths} months`]] as [
                  string,
                  React.ReactNode,
                ][])
              : []),
          ]}
        />
        {f.links.length > 0 && (
          <ul className={s.linkList}>
            {f.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.label}
                  <Icon name="out" size={12} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Group>

      <Group title="Document">
        <Rows
          rows={[
            ['Assembly', `${flat.model.tag} ${flat.model.name}`],
            ['Parts', `${flat.bom.length} unique · ${totals?.parts ?? '—'} instances`],
            ['Triangles', totals ? fmt.grouped(totals.tris) : '—'],
            ['Envelope', totals ? `${vec(totals.size)} u` : '—'],
            ['Explodes along', flat.model.axis],
            ['Units', 'model units (u)'],
          ]}
        />
        <p className={s.disclaimer}>
          Illustrative geometry, not production CAD. Shapes, sizes and inner parts are generic; no
          dimensions are claimed.
        </p>
      </Group>

      <button type="button" className={s.ghostBtn} onClick={onNotes}>
        <Icon name="notes" size={14} />
        Read the project notes
      </button>
    </div>
  );
}

function PropsPanel({ flat, sel, selParts, hidden, stats, onZoom, onHide, onIsolate }: Props) {
  if (!sel.length) {
    const agg = aggregate(flat.parts, stats);
    return (
      <div className={s.noSel}>
        <p>Nothing selected. Pick a part in the viewport, the tree or the BOM.</p>
        <Group title="Whole assembly">
          <Rows
            rows={[
              ['Name', flat.items[flat.root].name],
              ['Part number', flat.items[flat.root].pn],
              ['Instances', String(flat.parts.length)],
              ['Volume', agg ? `${n3(agg.volume)} u³` : '—'],
              ['Surface area', agg ? `${agg.area.toFixed(2)} u²` : '—'],
            ]}
          />
        </Group>
      </div>
    );
  }

  const one: Item | null = sel.length === 1 ? flat.items[sel[0]] : null;
  const agg = aggregate(selParts, stats);
  const allHidden = selParts.every((id) => hidden.has(id));
  const node = one?.node;
  const mark = node?.decal?.kind === 'mark' ? node.decal.text : null;
  const bomRow = one
    ? flat.bom.find((r) => r.pn === one.pn)
    : flat.bom.find(
        (r) => r.ids.length === selParts.length && r.ids.every((id) => selParts.includes(id)),
      );

  const identity: [string, React.ReactNode][] = one
    ? [
        ['Part number', one.pn],
        ['Type', one.pattern ? `Pattern of ${one.children.length}` : KIND_LABEL[one.kind]],
        ...(one.ref && !one.pattern
          ? ([['Designator', one.ref]] as [string, React.ReactNode][])
          : []),
        ...(node?.desc ? ([['Description', node.desc]] as [string, React.ReactNode][]) : []),
        ...(mark !== null && mark !== undefined
          ? ([['Marking', mark || 'Not on record']] as [string, React.ReactNode][])
          : []),
        ...(node?.mat && !one.children.length
          ? ([
              [
                'Appearance',
                <span key="m" className={s.swatchLine}>
                  <i className={s.swatch} style={{ background: MAT_LOOK[node.mat].color }} />
                  {MAT_LOOK[node.mat].label}
                </span>,
              ],
            ] as [string, React.ReactNode][])
          : []),
        ...(one.parent
          ? ([['Parent', flat.items[one.parent].name]] as [string, React.ReactNode][])
          : []),
        ...(one.instance
          ? ([['Instance', `${one.instance.i + 1} of ${one.instance.n}`]] as [
              string,
              React.ReactNode,
            ][])
          : []),
        ...(node?.ex
          ? ([
              ['Explode', `${dirLabel(node.ex.d)} · step ${Math.round(node.ex.st * 3) + 1} of 4`],
            ] as [string, React.ReactNode][])
          : []),
        ...(bomRow && bomRow.qty > 1
          ? ([['In BOM', `Item ${bomRow.item}, quantity ${bomRow.qty}`]] as [
              string,
              React.ReactNode,
            ][])
          : []),
      ]
    : [
        ['Selected', `${selParts.length} parts`],
        ...(bomRow
          ? ([
              ['BOM item', `${bomRow.item} · ${bomRow.pn}`],
              ['Name', bomRow.name],
            ] as [string, React.ReactNode][])
          : []),
      ];

  return (
    <div className={s.selProps}>
      <header className={s.selHead}>
        <Icon name={one ? (one.pattern ? 'layers' : KIND_ICON[one.kind]) : 'layers'} size={18} />
        <div>
          <h2>{one ? one.name : bomRow ? bomRow.name : `${selParts.length} parts`}</h2>
          <p>
            {one
              ? one.children.length
                ? `${KIND_LABEL.assembly} · ${one.parts.length} parts`
                : KIND_LABEL[one.kind]
              : 'Multiple selection'}
          </p>
        </div>
      </header>
      <div className={s.selActions}>
        <button type="button" onClick={() => onZoom(selParts)}>
          <Icon name="fit" size={14} />
          Zoom to
        </button>
        <button type="button" onClick={() => onHide(selParts)}>
          <Icon name={allHidden ? 'eye' : 'eyeOff'} size={14} />
          {allHidden ? 'Show' : 'Hide'}
        </button>
        <button type="button" onClick={() => onIsolate(selParts)}>
          <Icon name="target" size={14} />
          Isolate
        </button>
      </div>
      <Group title="Identity">
        <Rows rows={identity} />
      </Group>
      <Group title="Mass properties">
        <Rows
          rows={[
            ['Bounding box', agg ? `${agg.size.map(n3).join(' × ')} u` : '—'],
            ['Volume', agg ? `${n3(agg.volume)} u³` : '—'],
            ['Surface area', agg ? `${agg.area.toFixed(2)} u²` : '—'],
            ['Centre', agg ? `${vec(agg.center, 3)}` : '—'],
            ['Triangles', agg ? fmt.grouped(agg.tris) : '—'],
          ]}
        />
        <p className={s.fine}>
          Computed from the tessellated mesh in model units. Overlapping features count twice.
        </p>
      </Group>
    </div>
  );
}
