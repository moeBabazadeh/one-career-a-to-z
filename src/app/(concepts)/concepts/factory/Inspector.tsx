'use client';

import Image from 'next/image';
import { DOCK_INFO, FEEDS, PRODUCT_INFO, RESOURCE_NOTE, usedIn } from './content';
import { fmtRate } from './draw';
import Icon from './Icon';
import { ITEMS, type ItemId, type PartId, type ProductId } from './items';
import { isProduct, type Ref } from './sim';
import type { Fix, Sel } from './snap';
import { MACHINES, type DockId } from './world';
import s from './factory.module.scss';

const machineOf = (id: ItemId): Ref | null => {
  const i = MACHINES.findIndex((m) => m.recipe === id && !m.ghost);
  return i >= 0 ? `m${i}` : null;
};

const DOCK_REF: Record<DockId, Ref> = { web: 'k0', appstore: 'k1', play: 'k2', field: 'k3' };

function Meter({
  label,
  value,
  max,
  unit,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  tone?: string;
}) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className={s.meter} data-tone={tone}>
      <span className={s.meterLabel}>{label}</span>
      <span className={s.meterValue}>
        {fmtRate(value)}
        <small>
          {' '}
          / {fmtRate(max)} {unit}
        </small>
      </span>
      <span className={s.meterBar} aria-hidden="true">
        <i style={{ width: `${pct * 100}%` }} />
      </span>
    </div>
  );
}

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Product({
  id,
  compact,
  onSelect,
}: {
  id: ProductId;
  compact?: boolean;
  onSelect: (ref: Ref) => void;
}) {
  const p = PRODUCT_INFO[id];
  return (
    <article className={s.product} data-compact={compact || undefined}>
      {p.image && !compact && (
        <div className={s.shot}>
          <Image
            src={p.image}
            alt={`${p.title} screenshot`}
            width={1280}
            height={800}
            sizes="320px"
          />
        </div>
      )}
      <h4>
        <Icon id={id} size={16} />
        {p.title}
      </h4>
      {!compact && <p>{p.description}</p>}
      {!compact && p.note && <p className={s.note}>{p.note}</p>}
      {p.figures && (
        <div className={s.figures}>
          <span>{p.figures.caption}</span>
          <ul>
            {p.figures.items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <ul className={s.chips} aria-label="Tech">
        {p.tech.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className={s.links}>
        {p.links.map((l) => (
          <Out key={l.url} href={l.url}>
            {l.label} ↗
          </Out>
        ))}
        {p.docks.map((d) => (
          <button key={d} type="button" className={s.textBtn} onClick={() => onSelect(DOCK_REF[d])}>
            → {DOCK_INFO[d].title} dock
          </button>
        ))}
        {compact && (
          <button type="button" className={s.textBtn} onClick={() => onSelect(machineOf(id) ?? '')}>
            → assembler
          </button>
        )}
      </p>
    </article>
  );
}

function Action({
  fix,
  onAction,
  primary,
}: {
  fix: Fix;
  onAction: (fix: Fix) => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={s.action}
      data-primary={primary || undefined}
      onClick={() => onAction(fix)}
    >
      {fix.label}
    </button>
  );
}

export default function Inspector({
  sel,
  reduced,
  onAction,
  onSelect,
  onClose,
}: {
  sel: Sel | null;
  reduced: boolean;
  onAction: (fix: Fix) => void;
  onSelect: (ref: Ref) => void;
  onClose: () => void;
}) {
  if (!sel) {
    return (
      <div className={s.inspBody}>
        <h3 className={s.inspTitle}>Nothing selected</h3>
        <p className={s.muted}>
          Click a building, a belt or a splitter to open it. With the map focused, the arrow keys
          move the selection.
        </p>
        <ul className={s.legend}>
          <li>
            <i data-c="green" />
            Working
          </li>
          <li>
            <i data-c="amber" />
            Waiting for an ingredient
          </li>
          <li>
            <i data-c="cream" />
            Output full: overproducing
          </li>
          <li>
            <i data-c="red" />
            Bottleneck
          </li>
          <li>
            <i data-c="blue" />
            Ghost: click to build
          </li>
        </ul>
      </div>
    );
  }

  const head = (icon: ItemId | null, title: string, kind: string) => (
    <header className={s.inspHead}>
      {icon && <Icon id={icon} size={26} />}
      <div>
        <span className={s.inspKind}>{kind}</span>
        <h3 className={s.inspTitle}>{title}</h3>
      </div>
      {sel.root && <span className={s.flag}>Bottleneck</span>}
      <button type="button" className={s.close} onClick={onClose} aria-label="Close the inspector">
        ×
      </button>
    </header>
  );

  if (sel.kind === 'machine') {
    const out = sel.recipe.out;
    const product = isProduct(out);
    const ghost = sel.built < 1;
    return (
      <div className={s.inspBody}>
        {head(out, ITEMS[out].name, product ? 'Product assembler' : 'Assembler')}
        <p className={s.status} data-tone={sel.tone}>
          <i aria-hidden="true" />
          {sel.status}
        </p>
        {ghost && !sel.building && (
          <button
            type="button"
            className={s.action}
            data-primary
            onClick={() => onAction({ label: 'Build', action: 'build', ref: sel.ref })}
          >
            Build it {reduced ? '(skips ahead a minute)' : ''}
          </button>
        )}
        <div className={s.recipe} aria-label="Recipe">
          {sel.recipe.inputs.map(([id, n], k) => (
            <span key={id} className={s.ing}>
              {k > 0 && <b aria-hidden="true">+</b>}
              <Icon id={id} size={22} />
              <span>
                {n > 1 ? `${n} × ` : ''}
                {ITEMS[id].name}
              </span>
            </span>
          ))}
          <span className={s.arrow} aria-hidden="true">
            →
          </span>
          <span className={s.ing}>
            <Icon id={out} size={22} />
            <span>{ITEMS[out].name}</span>
          </span>
          <span className={s.time}>{sel.recipe.time} s</span>
        </div>
        {!ghost && (
          <>
            <Meter
              label="Output"
              value={sel.rate}
              max={sel.max}
              unit="/min"
              tone={sel.root ? 'err' : undefined}
            />
            <Meter label="Busy" value={Math.round(sel.work * 100)} max={100} unit="%" />
            <div className={s.buffers} aria-label="Input buffers">
              {sel.buf.map((b) => (
                <span key={b.id} data-short={b.have < b.need || undefined}>
                  <Icon id={b.id} size={16} />
                  {b.have}/{b.need * 2}
                </span>
              ))}
              <span>
                <Icon id={out} size={16} />
                out {sel.out}/2
              </span>
            </div>
          </>
        )}
        {sel.root && sel.fix && <Action fix={sel.fix} onAction={onAction} primary />}
        <p className={s.tech}>{sel.recipe.tech}</p>
        {product ? (
          <Product id={out as ProductId} onSelect={onSelect} />
        ) : (
          <div className={s.feeds}>
            <h4>Ends up in</h4>
            {FEEDS[out as PartId].map((p) => (
              <Product key={p} id={p} compact onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (sel.kind === 'drill') {
    const ghost = sel.built < 1;
    return (
      <div className={s.inspBody}>
        {head(sel.res, ITEMS[sel.res].name, 'Mining drill')}
        <p className={s.status} data-tone={sel.tone}>
          <i aria-hidden="true" />
          {sel.status}
        </p>
        {ghost && !sel.building && (
          <button
            type="button"
            className={s.action}
            data-primary
            onClick={() => onAction({ label: 'Build', action: 'build', ref: sel.ref })}
          >
            Build it
          </button>
        )}
        {!ghost && (
          <Meter
            label="Mined"
            value={sel.rate}
            max={sel.max}
            unit="/min"
            tone={sel.root ? 'err' : undefined}
          />
        )}
        {sel.root && sel.fix && <Action fix={sel.fix} onAction={onAction} primary />}
        <p className={s.tech}>{RESOURCE_NOTE[sel.res]}</p>
        <div className={s.feeds}>
          <h4>Used in</h4>
          <p className={s.links}>
            {usedIn(sel.res).map((id) => (
              <button
                key={id}
                type="button"
                className={s.textBtn}
                onClick={() => onSelect(machineOf(id) ?? '')}
              >
                <Icon id={id} size={14} /> {ITEMS[id].name}
              </button>
            ))}
          </p>
        </div>
      </div>
    );
  }

  if (sel.kind === 'belt') {
    return (
      <div className={s.inspBody}>
        {head(sel.item, `${ITEMS[sel.item].name} belt`, 'Transport belt')}
        <p className={s.status} data-tone={sel.on ? 'ok' : 'err'}>
          <i aria-hidden="true" />
          {sel.on ? 'Moving' : 'Disabled by its circuit condition'}
        </p>
        <Meter label="Throughput" value={sel.rate} max={sel.max} unit="/min" />
        <dl className={s.facts}>
          <div>
            <dt>Length</dt>
            <dd>{sel.len} tiles</dd>
          </div>
          <div>
            <dt>On it now</dt>
            <dd>{sel.count} items</dd>
          </div>
          <div>
            <dt>Underground</dt>
            <dd>{sel.under ? `${sel.under} tiles` : 'none'}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>1.875 tiles/s</dd>
          </div>
        </dl>
        <button
          type="button"
          className={s.action}
          data-primary={!sel.on || undefined}
          onClick={() => onAction({ label: '', action: 'toggle', ref: sel.ref })}
        >
          {sel.on ? 'Disable the belt' : 'Enable the belt'}
        </button>
        <p className={s.muted}>
          A circuit condition on the belt: off, nothing on it moves, and whatever it feeds runs dry.
        </p>
      </div>
    );
  }

  if (sel.kind === 'splitter') {
    return (
      <div className={s.inspBody}>
        {head(sel.item, `${ITEMS[sel.item].name} splitter`, 'Splitter')}
        <p className={s.status} data-tone={sel.root ? 'err' : 'ok'}>
          <i aria-hidden="true" />
          {sel.label[0].toUpperCase() + sel.label.slice(1)}
        </p>
        <div className={s.split}>
          {sel.names.map((n, k) => (
            <div key={n} data-on={sel.mode === 0 || sel.mode === k + 1 || undefined}>
              <span>
                {k ? 'Right' : 'Left'} → {n}
              </span>
              <b>{fmtRate(sel.rates[k])}/min</b>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={s.action}
          data-primary
          onClick={() => onAction({ label: '', action: 'rotate', ref: sel.ref })}
        >
          Rotate <kbd>R</kbd>
        </button>
        <p className={s.muted}>
          Balanced, then favour the left output, then the right. A favoured output takes everything
          it can; the other gets the rest.
        </p>
      </div>
    );
  }

  const d = DOCK_INFO[sel.id];
  return (
    <div className={s.inspBody}>
      {head(null, `${sel.name} dock`, 'Shipping dock')}
      <p className={s.status} data-tone="ok">
        <i aria-hidden="true" />
        {sel.total.toLocaleString('en-US')} shipped · {fmtRate(sel.rate)}/min
      </p>
      <p className={s.tech}>{d.blurb}</p>
      <ul className={s.got}>
        {sel.got.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              className={s.textBtn}
              onClick={() => onSelect(machineOf(g.id) ?? '')}
            >
              <Icon id={g.id} size={16} />
              {ITEMS[g.id].name}
            </button>
            <b>{g.n.toLocaleString('en-US')}</b>
          </li>
        ))}
      </ul>
      {d.links.length > 0 && (
        <p className={s.links}>
          {d.links.map((l) => (
            <Out key={l.url + l.label} href={l.url}>
              {l.label} ↗
            </Out>
          ))}
        </p>
      )}
      {d.id === 'field' && (
        <div className={s.feeds}>
          <Product id="lg" compact onSelect={onSelect} />
          <Product id="at" compact onSelect={onSelect} />
        </div>
      )}
      {d.extra && <p className={s.muted}>{d.extra}</p>}
    </div>
  );
}
