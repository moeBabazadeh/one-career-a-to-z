'use client';

import { about, db, fmt, profile, skills } from '../_shared/data';
import { projectLinks } from '../_shared/links';
import {
  NM_PER_YEAR,
  N_CONTACT,
  P_CONTACT,
  barriers,
  deltas,
  deviceStates,
  dopants,
  duration,
  frameFor,
  hue,
  itemById,
  items,
  states,
  wells,
  type Delta,
  type DeviceState,
  type Dopant,
  type State,
  type Well,
  waveColor,
} from './device';
import { ionizedFraction, type Params, type Snapshot } from './sim';
import s from './bandgap.module.scss';

type Select = (id: string | null) => void;

const KIND: Record<State['kind'], string> = {
  product: 'Product',
  fix: 'Upstream fix',
  personal: 'Personal build',
};
const GLYPH: Record<State['kind'], string> = { product: '●', fix: '◆', personal: '△' };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Which product carries the longer story of each device in production.
const DEVICE_PRODUCT: Partial<Record<db.DeviceId, db.ProductId>> = {
  logger: 'logger',
  epc: 'epc',
  plc: 'miniPlc',
  attendumReader: 'attendum',
  attendumBeacon: 'attendum',
};

function Links({ links }: { links: db.ProjectLinks }) {
  const list = projectLinks(links);
  if (!list.length) return null;
  return (
    <p className={s.noteLinks}>
      {list.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {l.label} ↗
        </a>
      ))}
    </p>
  );
}

function Jump({
  id,
  onSelect,
  children,
}: {
  id: string;
  onSelect: Select;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={s.jump} onClick={() => onSelect(id)}>
      {children}
    </button>
  );
}

function WellNotes({
  w,
  snap,
  params,
  onSelect,
}: {
  w: Well;
  snap: Snapshot | null;
  params: Params;
  onSelect: Select;
}) {
  const r = w.role;
  const wf = frameFor(params.V, params.T).wells[w.index];
  const live = snap?.wells[w.index];
  const before = barriers[w.index - 1];
  const inside = states.filter((st) => st.well === w.index);
  const sheets = deltas.filter((d) => d.well === w.index);
  return (
    <>
      <p className={s.kicker}>
        Quantum well {w.index + 1} of {wells.length} · {fmt.yearSpan(r.from, r.to)}
      </p>
      <h3 className={s.noteTitle}>
        {r.url ? (
          <a href={r.url} target="_blank" rel="noreferrer">
            {r.org} ↗
          </a>
        ) : (
          r.org
        )}
      </h3>
      <p className={s.noteRole}>{db.titlePath(r)}</p>
      <p className={s.noteMeta}>
        {fmt.monthSpan(r.from, r.to)} · {duration(w.months)}
        {r.sector && <> · {r.sector}</>}
      </p>
      <p>{r.summary}</p>
      <ul className={s.duties}>
        {r.duties.map((d) => (
          <li key={d.slice(0, 40)}>{d}</li>
        ))}
      </ul>
      <dl className={s.phys}>
        <div>
          <dt>Width</dt>
          <dd>
            {w.nm.toFixed(2)} nm{' '}
            <small>{`${duration(w.months)} at ${NM_PER_YEAR} nm a year`}</small>
          </dd>
        </div>
        <div>
          <dt>Depth</dt>
          <dd>
            ΔE<sub>c</sub> {w.dEc.toFixed(2)} eV · ΔE<sub>v</sub> {w.dEv.toFixed(2)} eV{' '}
            <small>deeper the longer the role ran</small>
          </dd>
        </div>
        <div>
          <dt>Bound states</dt>
          <dd>
            {wf.e.length} for electrons, {wf.h.length} for holes
            <small>{`flat band: e₁ ${(w.e[0] * 1000).toFixed(0)} meV${w.e.length > 1 ? `, e₂ ${(w.e[1] * 1000).toFixed(0)} meV` : ''} above the floor`}</small>
          </dd>
        </div>
        <div>
          <dt>Emits</dt>
          <dd>
            <i
              className={s.swatch}
              style={{ background: waveColor(wf.lambda) }}
              aria-hidden="true"
            />
            {wf.lambda.toFixed(0)} nm, {hue(wf.lambda)}{' '}
            <small>{`${wf.trans.toFixed(2)} eV at ${params.V.toFixed(2)} V, ${params.T} K`}</small>
          </dd>
        </div>
        <div>
          <dt>Right now</dt>
          <dd>
            {live ? `${live.ne} e⁻ · ${live.nh} h⁺ bound · ${live.emitted} photons emitted` : '—'}
            <small>{`electron–hole overlap ${(wf.ov * 100).toFixed(0)}%`}</small>
          </dd>
        </div>
      </dl>
      {w.steps.map((st) => (
        <p key={st.title} className={s.aside}>
          {`Promoted to ${st.title} in ${fmt.month(r.steps.find((x) => x.title === st.title)?.from ?? r.from)}: the floor steps down there.`}
        </p>
      ))}
      {before && before.overlap > 0 && (
        <p className={s.aside}>
          {`The two roles overlapped for ${before.overlap} months, so the barrier before this well is half as thick and carriers tunnel through it more easily.`}
        </p>
      )}
      {(inside.length > 0 || sheets.length > 0) && (
        <>
          <h4 className={s.noteSub}>Inside this well</h4>
          <ul className={s.jumps}>
            {sheets.map((d) => (
              <li key={d.id}>
                <Jump id={d.id} onSelect={onSelect}>
                  <span aria-hidden="true">δ</span> {d.role.org} <small>contract</small>
                </Jump>
              </li>
            ))}
            {inside.map((st) => (
              <li key={st.id}>
                <Jump id={st.id} onSelect={onSelect}>
                  <span aria-hidden="true">{GLYPH[st.kind]}</span> {st.title}{' '}
                  <small>{st.year}</small>
                </Jump>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function StateNotes({ st, onSelect }: { st: State; onSelect: Select }) {
  const c = st.contribution;
  const w = wells[st.well];
  return (
    <>
      <p className={s.kicker}>
        <span aria-hidden="true">{GLYPH[st.kind]}</span> {KIND[st.kind]} · localized state ·{' '}
        {st.year}
      </p>
      <h3 className={s.noteTitle}>{st.title}</h3>
      {st.madeAt && st.madeAt !== st.title && <p className={s.noteMeta}>{st.madeAt}</p>}
      <p>{st.description}</p>
      {c && (
        <dl className={s.phys}>
          <div>
            <dt>Repository</dt>
            <dd>
              {c.repo} <small>{`★ ${c.stars} · ${c.weekly.short} downloads a week`}</small>
            </dd>
          </div>
          <div>
            <dt>{c.kind}</dt>
            <dd>{c.impact}</dd>
          </div>
          <div>
            <dt>Fix</dt>
            <dd>{c.change}</dd>
          </div>
        </dl>
      )}
      {st.tech.length > 0 && (
        <ul className={s.chips}>
          {st.tech.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <Links links={st.links} />
      <p className={s.aside}>
        It sits in the year it shipped, in the{' '}
        <Jump id={w.id} onSelect={onSelect}>
          {w.org}
        </Jump>{' '}
        well: a small dip in the floor where carriers can settle.
      </p>
    </>
  );
}

function DopantNotes({
  d,
  index,
  snap,
  params,
}: {
  d: Dopant;
  index: number;
  snap: Snapshot | null;
  params: Params;
}) {
  const donor = d.type === 'donor';
  const held = snap?.neutral[index];
  return (
    <>
      <p className={s.kicker}>
        {donor ? 'Donor level · studies and research' : 'Acceptor level · competitions and awards'}
      </p>
      <h3 className={s.noteTitle}>
        {d.url ? <a href={d.url} target="_blank" rel="noreferrer">{`${d.title} ↗`}</a> : d.title}
      </h3>
      <p className={s.noteMeta}>{d.years}</p>
      <p>{d.detail}</p>
      <dl className={s.phys}>
        <div>
          <dt>Ionization</dt>
          <dd>
            {(d.eIon * 1000).toFixed(0)} meV{' '}
            <small>{donor ? 'below the conduction band' : 'above the valence band'}</small>
          </dd>
        </div>
        <div>
          <dt>{`At ${params.T} K`}</dt>
          <dd>
            {(ionizedFraction(d.eIon, params.T) * 100).toFixed(0)}% ionized
            <small>
              {held === undefined
                ? ''
                : `${d.sites.length - held} of ${d.sites.length} sites ionized now`}
            </small>
          </dd>
        </div>
      </dl>
      <p className={s.aside}>
        {donor
          ? 'A donor gives its electron to the conduction band once it is warm enough. Studies are what put carriers into this career, so they are donors. Cool the device down and watch them hold on.'
          : 'An acceptor takes an electron from the valence band and leaves a hole behind. Awards were received, so they accept. These are deeper: they need heat.'}
      </p>
    </>
  );
}

function ContactNotes({ side, onSelect }: { side: 'p' | 'n'; onSelect: Select }) {
  if (side === 'p')
    return (
      <>
        <p className={s.kicker}>p⁺ contact · where the holes come in</p>
        <h3 className={s.noteTitle}>{profile.name}</h3>
        <p className={s.noteRole}>
          {profile.role} at{' '}
          <a href={profile.companyUrl} target="_blank" rel="noreferrer">
            {profile.company}
          </a>
        </p>
        {about.map((p) => (
          <p key={p.slice(0, 32)}>{p}</p>
        ))}
        <h4 className={s.noteSub}>Stack</h4>
        <ul className={s.chips}>
          {skills.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
        <p className={s.noteLinks}>
          <a href={`mailto:${profile.email}`}>Email</a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn ↗
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV ↗
          </a>
        </p>
      </>
    );
  return (
    <>
      <p className={s.kicker}>n⁺ contact · in production today</p>
      <h3 className={s.noteTitle}>Hardware in the field</h3>
      <p>
        {`Electrons leave the device here and become current. The states in this contact are the ${fmt.spell(deviceStates.length)} devices still in production: what the embedded work turned into.`}
      </p>
      <ul className={s.jumps}>
        {deviceStates.map((d) => (
          <li key={d.id}>
            <Jump id={d.id} onSelect={onSelect}>
              <span aria-hidden="true">■</span> {d.name} <small>{d.kind}</small>
            </Jump>
          </li>
        ))}
      </ul>
    </>
  );
}

function DeviceNotes({ d }: { d: DeviceState }) {
  const product = DEVICE_PRODUCT[d.key];
  const p = product ? (db.products[product] as db.Product) : null;
  return (
    <>
      <p className={s.kicker}>
        <span aria-hidden="true">■</span> {d.tag} · in production
      </p>
      <h3 className={s.noteTitle}>{d.name}</h3>
      <p className={s.noteMeta}>{d.kind}</p>
      <p>{d.detail}</p>
      <ul className={s.figures}>
        {d.figures.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {p && p.title !== d.name && <h4 className={s.noteSub}>{p.title}</h4>}
      {p && <p>{p.description}</p>}
      {p && <Links links={p.links} />}
    </>
  );
}

function DeltaNotes({ d, onSelect }: { d: Delta; onSelect: Select }) {
  const r = d.role;
  const w = wells[d.well];
  return (
    <>
      <p className={s.kicker}>δ-doped sheet · a contract alongside</p>
      <h3 className={s.noteTitle}>{r.org}</h3>
      <p className={s.noteRole}>{db.titlePath(r)}</p>
      <p className={s.noteMeta}>
        {fmt.monthSpan(r.from, r.to)} · {duration(fmt.monthsBetween(r.from, r.to ?? db.asOf))}
      </p>
      <p>{r.summary}</p>
      <ul className={s.duties}>
        {r.duties.map((x) => (
          <li key={x.slice(0, 40)}>{x}</li>
        ))}
      </ul>
      <p className={s.aside}>
        A role that runs alongside another is not a layer of its own. It is grown as a single
        δ-doped sheet inside the{' '}
        <Jump id={w.id} onSelect={onSelect}>
          {w.org}
        </Jump>{' '}
        well: a thin V-shaped notch that adds carriers without changing the crystal around it.
      </p>
    </>
  );
}

function Overview({ onSelect }: { onSelect: Select }) {
  const groups: [string, string[]][] = [
    ['Contacts', [P_CONTACT, N_CONTACT]],
    ['Wells · experience', [...wells.map((w) => w.id), ...deltas.map((d) => d.id)]],
    ['Impurity levels · education and awards', dopants.map((d) => d.id)],
    ['Localized states · what shipped', states.map((st) => st.id)],
    ['In production', deviceStates.map((d) => d.id)],
  ];
  return (
    <>
      <p className={s.kicker}>How to read Fig. 1</p>
      <h3 className={s.noteTitle}>A career, grown as a crystal</h3>
      <p>
        {`Position runs left to right from ${fmt.month(wells[0].role.from)} to ${fmt.month(db.asOf)}. Every role is a quantum well as wide as it lasted and deeper the longer it ran; the thin barriers between them are the company changes.`}
      </p>
      <p>
        Click anywhere on the diagram to fire a photon there and open what it hits. Bias the
        junction, change the temperature, or run one of the experiments.
      </p>
      {groups.map(([title, ids]) => (
        <div key={title} className={s.indexGroup}>
          <h4 className={s.noteSub}>{title}</h4>
          <ul className={s.jumps}>
            {ids.map((id) => (
              <li key={id}>
                <Jump id={id} onSelect={onSelect}>
                  {itemById.get(id)?.label}
                </Jump>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** The notes for whatever part of the device is selected, or how to read it when nothing is. */
export default function Notes({
  id,
  snap,
  params,
  onSelect,
}: {
  id: string | null;
  snap: Snapshot | null;
  params: Params;
  onSelect: Select;
}) {
  const item = id ? itemById.get(id) : undefined;
  const at = item ? items.indexOf(item) : -1;
  const go = (step: number) => {
    const next =
      at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
    onSelect(items[next].id);
  };
  let body: React.ReactNode = <Overview onSelect={onSelect} />;
  if (item?.kind === 'well')
    body = (
      <WellNotes
        w={wells.find((w) => w.id === id) as Well}
        snap={snap}
        params={params}
        onSelect={onSelect}
      />
    );
  else if (item?.kind === 'state')
    body = <StateNotes st={states.find((x) => x.id === id) as State} onSelect={onSelect} />;
  else if (item?.kind === 'dopant') {
    const index = dopants.findIndex((d) => d.id === id);
    body = <DopantNotes d={dopants[index]} index={index} snap={snap} params={params} />;
  } else if (item?.kind === 'contact')
    body = <ContactNotes side={id === P_CONTACT ? 'p' : 'n'} onSelect={onSelect} />;
  else if (item?.kind === 'device')
    body = <DeviceNotes d={deviceStates.find((d) => d.id === id) as DeviceState} />;
  else if (item?.kind === 'delta')
    body = <DeltaNotes d={deltas.find((d) => d.id === id) as Delta} onSelect={onSelect} />;

  return (
    <div className={s.notesInner}>
      <div className={s.notesBar}>
        <h2 className={s.notesHead}>Device notes</h2>
        <div className={s.notesNav}>
          <button type="button" onClick={() => go(-1)} aria-label="Previous part of the device">
            ←
          </button>
          <span aria-hidden="true">
            {at >= 0 ? `${at + 1}/${items.length}` : `${items.length} parts`}
          </span>
          <button type="button" onClick={() => go(1)} aria-label="Next part of the device">
            →
          </button>
          <button type="button" onClick={() => onSelect(null)} disabled={!item}>
            Index
          </button>
        </div>
      </div>
      <p className={s.sr} aria-live="polite">
        {item ? `Showing ${item.label}` : 'Showing the index'}
      </p>
      <div className={s.notesBody} key={id ?? 'index'}>
        {body}
      </div>
      <p className={s.notesFoot}>
        {cap(fmt.spell(wells.length))} wells · {fmt.spell(states.length)} states ·{' '}
        {fmt.spell(dopants.length)} impurity levels
      </p>
    </div>
  );
}
