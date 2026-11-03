'use client';

// Hardware: the devices Moe built that are in production, as a device manager. Each has its spec
// sheet and the fleet figures on record.
import { db, hardware, type Device } from '../../_shared/data';
import { STORE_IDS } from '../content';
import { Icon } from '../icons';
import { Button, Group, Row, Screen, type AppCtx } from '../ui';
import s from '../apps.module.scss';

type Raw = (typeof db.devices)[db.DeviceId];
const rawOf = (tag: string) => Object.values(db.devices).find((d) => d.tag === tag) as Raw;

/** The product a device belongs to: the one named after it, or the one built on its chip. */
function productOf(d: Device): db.ProductId | undefined {
  const raw = rawOf(d.tag);
  const chip = 'chip' in raw ? raw.chip : undefined;
  return (Object.keys(db.products) as db.ProductId[]).find(
    (id) =>
      db.products[id].title === d.name ||
      (!!chip && db.products[id].tech.includes(chip) && db.products[id].title !== chip),
  );
}

export function Hardware({ ctx }: { ctx: AppCtx }) {
  if (ctx.path.startsWith('device/')) {
    const d = hardware.find((h) => h.tag === ctx.path.slice(7));
    if (d) return <DeviceView ctx={ctx} d={d} />;
  }
  return (
    <Screen ctx={ctx} title="Hardware" className={s.hardware}>
      <p className={s.padText}>
        {hardware.length} devices in production, firmware and boards by {db.person.first}.
      </p>
      <ul className={s.tiles}>
        {hardware.map((d) => (
          <li key={d.tag}>
            <button type="button" onClick={() => ctx.push(`device/${d.tag}`)}>
              <span className={s.tileTop}>
                <span className={s.tileIcon}>
                  <Icon name="chip" size={22} />
                </span>
                <span className={s.tileTag}>{d.tag}</span>
              </span>
              <strong>{d.name}</strong>
              <span className={s.tileKind}>{d.kind}</span>
              <span className={s.tileStat}>
                <i aria-hidden="true" />
                {d.figures[0]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

function DeviceView({ ctx, d }: { ctx: AppCtx; d: Device }) {
  const raw = rawOf(d.tag);
  const product = productOf(d);
  const storeApp = product && STORE_IDS.includes(product) ? product : undefined;
  const spec: [string, string][] = [
    ['Tag', d.tag],
    ['Kind', d.kind],
    ...('chip' in raw ? ([['Chip', raw.chip]] as [string, string][]) : []),
    ...('batteryMonths' in raw
      ? ([['Battery', `about ${raw.batteryMonths} months`]] as [string, string][])
      : []),
    ['Status', 'In production'],
  ];
  const fleet = 'fleet' in raw ? raw.fleet : null;

  return (
    <Screen ctx={ctx} title={d.name} back="Hardware" className={s.hardware}>
      <header className={s.devHero}>
        <span className={s.devChip} aria-hidden="true">
          <Icon name="chip" size={44} />
        </span>
        <p>{d.kind}</p>
      </header>
      <p className={s.padText}>{d.detail}</p>
      {d.figures.length > 1 && (
        <ul className={s.figures}>
          {d.figures.map((f) => {
            const [n, ...rest] = f.split(' ');
            return (
              <li key={f}>
                <strong>{n}</strong>
                <span>{rest.join(' ')}</span>
              </li>
            );
          })}
        </ul>
      )}
      {fleet && (
        <p className={s.count}>
          Figures from {fleet.scope}, the only one with numbers to share, so lower bounds.
        </p>
      )}
      <Group header="Specifications">
        {spec.map(([k, v]) => (
          <Row key={k} label={k} value={v} />
        ))}
      </Group>
      {product && (
        <div className={s.padBtn}>
          {storeApp ? (
            <Button onClick={() => ctx.open(storeApp)} icon="phone">
              Open {db.products[product].title}
            </Button>
          ) : (
            <Button onClick={() => ctx.open('projects', [`project/${product}`])} icon="grid" plain>
              See {db.products[product].title} in Projects
            </Button>
          )}
        </div>
      )}
    </Screen>
  );
}
