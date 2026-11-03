'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { concept } from '../_shared/concepts';
import { BAGS, CONFIG, type Bag } from './bags';
import type { EchoLine } from './msgs';
import { TOPICS } from './msgs';
import s from './console.module.scss';
import {
  DISPLAYS,
  FOLLOW_TARGETS,
  FRAMES,
  SSL_FRAMES,
  TOOLS,
  VIEWS,
  type DisplayId,
  type Displays,
  type InspectTarget,
  type PropDef,
  type PropVal,
  type Snapshot,
  type Tool,
  type TopicRow,
  type ViewState,
} from './store';

const me = concept('robot-console');

export interface Controls {
  toggle: () => void;
  loadBag: (i: number) => void;
  seek: (t: number) => void;
  step: (d: 1 | -1) => void;
  jump: (d: 1 | -1) => void;
  start: () => void;
  rate: (r: number) => void;
  loop: (l: boolean) => void;
  reset: () => void;
  zero: () => void;
}

/* ------------------------------------------------------------------ icons */

const PATHS: Record<string, string> = {
  interact: 'M7 3.5v8.2l2-1.8 1.6 3.6 1.7-.8-1.6-3.5H13z',
  move: 'M10 2.5v15M2.5 10h15M10 2.5 8 4.5M10 2.5l2 2M10 17.5l-2-2M10 17.5l2-2M2.5 10l2-2M2.5 10l2 2M17.5 10l-2-2M17.5 10l-2 2',
  select: 'M3 3h3M8 3h3M13 3h3v3M16 8v3M3 6v3M3 11v3h3M9 9l7 3-3 1-1 3z',
  focus: 'M10 3v3M10 14v3M3 10h3M14 10h3M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  measure: 'M2.5 13.5 13.5 2.5l4 4-11 11zM5.5 10.5l1.5 1.5M8 8l1.5 1.5M10.5 5.5 12 7',
  goal: 'M3 17 15 5M15 5h-5M15 5v5',
  point: 'M10 17.5s5-5 5-9a5 5 0 0 0-10 0c0 4 5 9 5 9zM10 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  play: 'M6 4l10 6-10 6z',
  pause: 'M6 4h3v12H6zM11 4h3v12h-3z',
  start: 'M5 4v12M15 4 7 10l8 6z',
  prev: 'M10 4 4 10l6 6M16 4l-6 6 6 6',
  next: 'M10 4l6 6-6 6M4 4l6 6-6 6',
  step: 'M5 4l8 6-8 6zM15 4v12',
  chevron: 'M7 5l5 5-5 5',
  close: 'M5 5l10 10M15 5 5 15',
};

export function Icon({ name, fill = false }: { name: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={s.icon} data-fill={fill || undefined} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ------------------------------------------------------------------ toolbar */

export function Toolbar({
  tool,
  onTool,
  onHelp,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  onHelp: () => void;
}) {
  return (
    <header className={s.top}>
      <div className={s.brand}>
        <span className={s.letter} aria-hidden="true">
          {me.letter}
        </span>
        <b>{me.name}</b>
        <span className={s.file}>{CONFIG}</span>
      </div>
      <nav className={s.tools} aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={s.tool}
            aria-pressed={tool === t.id}
            onClick={() => onTool(t.id)}
            title={`${t.label} (${t.key.toUpperCase()})`}
          >
            <Icon name={t.id} fill={t.id === 'interact'} />
            <span className={s.toolLabel}>{t.label}</span>
            <kbd>{t.key.toUpperCase()}</kbd>
          </button>
        ))}
      </nav>
      <div className={s.actions}>
        <a href="#read" className={s.readBtn}>
          Read as a page
        </a>
        <button
          type="button"
          className={s.helpBtn}
          onClick={onHelp}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ chapter overlay */

export function ChapterCard({
  bag,
  card,
  t,
  variant,
  onJump,
}: {
  bag: Bag;
  card: number;
  t: number;
  variant: 'overlay' | 'dock';
  onJump: (d: 1 | -1) => void;
}) {
  const c = bag.cards[card];
  const p = Math.min(1, Math.max(0, (t - c.start) / c.dur));
  return (
    <article
      className={variant === 'overlay' ? s.overlay : s.chapter}
      aria-label={`${bag.title}, card ${card + 1} of ${bag.cards.length}`}
    >
      <header className={s.chHead}>
        <span className={s.chTopic}>/chapter</span>
        <span className={s.chBag}>{bag.file}</span>
        <span className={s.chIdx}>{c.kicker}</span>
        <span className={s.chNav}>
          <button
            type="button"
            onClick={() => onJump(-1)}
            aria-label="Previous card"
            title="Previous card ([)"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onJump(1)}
            aria-label="Next card"
            title="Next card (])"
          >
            ›
          </button>
        </span>
      </header>
      <div className={s.chScroll}>
        <h2 className={s.chTitle}>{c.title}</h2>
        {c.meta && <p className={s.chMeta}>{c.meta}</p>}
        {c.image && (
          <Image
            className={s.chImage}
            src={c.image}
            width={1280}
            height={800}
            alt={`${c.title}, a screenshot`}
          />
        )}
        {c.list ? (
          <ul className={s.chList}>
            {c.body.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          c.body.map((b) => (
            <p key={b} className={s.chBody}>
              {b}
            </p>
          ))
        )}
        {c.figures && (
          <dl className={s.chFigs}>
            {c.figures.map((f) => (
              <div key={f.label}>
                <dt>{f.value}</dt>
                <dd>{f.label}</dd>
              </div>
            ))}
          </dl>
        )}
        {c.tags && (
          <ul className={s.chTags}>
            {c.tags.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
        {c.links && (
          <p className={s.chLinks}>
            {c.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                {...(l.url.startsWith('mailto:') || l.url.startsWith('/')
                  ? {}
                  : { target: '_blank', rel: 'noreferrer' })}
              >
                {l.label}
              </a>
            ))}
          </p>
        )}
      </div>
      <div className={s.chProgress} aria-hidden="true">
        <span style={{ transform: `scaleX(${p})` }} />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ displays */

function Editor({
  id,
  def,
  value,
  colors,
  onChange,
}: {
  id: string;
  def: PropDef;
  value: PropVal;
  colors: Record<string, string>;
  onChange: (v: PropVal) => void;
}) {
  if (def.kind === 'bool')
    return (
      <input
        id={id}
        type="checkbox"
        className={s.check}
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  if (def.kind === 'enum')
    return (
      <select
        id={id}
        className={s.select}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {def.options!.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  if (def.kind === 'color')
    return (
      <span className={s.colour}>
        <span className={s.swatch} style={{ background: `var(${def.token})` }} />
        {colors[def.token!] ?? '…'}
      </span>
    );
  return <span className={s.mono}>{String(value)}</span>;
}

export function DisplaysPanel({
  displays,
  status,
  colors,
  onChange,
}: {
  displays: Displays;
  status: Snapshot['status'];
  colors: Record<string, string>;
  onChange: (d: Displays) => void;
}) {
  const [open, setOpen] = useState<DisplayId[]>(['global']);
  const toggle = (id: DisplayId) =>
    setOpen(open.includes(id) ? open.filter((x) => x !== id) : [...open, id]);
  const setOn = (id: DisplayId, on: boolean) =>
    onChange({ ...displays, [id]: { ...displays[id], on } });
  const setProp = (id: DisplayId, key: string, v: PropVal) =>
    onChange({
      ...displays,
      [id]: { ...displays[id], props: { ...displays[id].props, [key]: v } },
    });
  return (
    <section
      className={s.panel}
      id="panel-displays"
      data-panel="displays"
      aria-labelledby="h-displays"
    >
      <header className={s.panelHead}>
        <h2 id="h-displays">Displays</h2>
        <span
          className={s.panelMeta}
        >{`${DISPLAYS.filter((d) => displays[d.id].on && !d.fixed).length} of ${DISPLAYS.length - 1} on`}</span>
      </header>
      <ul className={`${s.panelBody} ${s.tree}`}>
        {DISPLAYS.map((d) => {
          const st = displays[d.id];
          const isOpen = open.includes(d.id);
          return (
            <li key={d.id} className={s.dItem} data-on={st.on || undefined}>
              <div className={s.dRow}>
                <button
                  type="button"
                  className={s.twisty}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${d.name}`}
                  onClick={() => toggle(d.id)}
                >
                  <Icon name="chevron" />
                </button>
                <span className={s.dIcon} data-kind={d.id} aria-hidden="true" title={d.type} />
                <span className={s.dName} onDoubleClick={() => toggle(d.id)}>
                  {d.name}
                </span>
                {!d.fixed && (
                  <input
                    type="checkbox"
                    className={s.check}
                    checked={st.on}
                    onChange={(e) => setOn(d.id, e.target.checked)}
                    aria-label={`Show ${d.name}`}
                  />
                )}
              </div>
              {isOpen && (
                <dl className={s.props}>
                  <div className={s.prop}>
                    <dt>Status</dt>
                    <dd className={s.statusText} data-off={(!st.on && !d.fixed) || undefined}>
                      {!st.on && !d.fixed ? 'Disabled' : (status[d.id] ?? 'Ok')}
                    </dd>
                  </div>
                  {d.props.map((p) => {
                    const id = `prop-${d.id}-${p.key}`;
                    const editable = p.kind === 'bool' || p.kind === 'enum';
                    return (
                      <div key={p.key} className={s.prop}>
                        <dt>{editable ? <label htmlFor={id}>{p.label}</label> : p.label}</dt>
                        <dd>
                          <Editor
                            id={id}
                            def={p}
                            value={st.props[p.key]}
                            colors={colors}
                            onChange={(v) => setProp(d.id, p.key, v)}
                          />
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ topics */

export function TopicsPanel({
  rows,
  selected,
  playing,
  onPick,
}: {
  rows: TopicRow[];
  selected: string | null;
  playing: boolean;
  onPick: (name: string) => void;
}) {
  return (
    <section className={s.panel} id="panel-topics" data-panel="topics" aria-labelledby="h-topics">
      <header className={s.panelHead}>
        <h2 id="h-topics">Topics</h2>
        <span className={s.panelMeta}>{playing ? 'rate over 2 s' : 'paused'}</span>
      </header>
      <div className={s.panelBody}>
        <table className={s.topics}>
          <colgroup>
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">Hz</th>
              <th scope="col" title="Bandwidth">
                Bw
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} data-sel={selected === r.name || undefined}>
                <th scope="row">
                  <button
                    type="button"
                    aria-pressed={selected === r.name}
                    onClick={() => onPick(r.name)}
                    title={`Inspect ${r.name}`}
                  >
                    <span className={s.tName}>{r.name}</span>
                    <span className={s.tType}>{r.type}</span>
                  </button>
                </th>
                <td data-idle={r.hz === '—' || undefined}>{r.hz}</td>
                <td data-idle={r.bw === '—' || undefined}>{r.bw}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ views */

export function ViewsPanel({
  view,
  info,
  onView,
  onZero,
}: {
  view: ViewState;
  info: Snapshot['view'];
  onView: (v: ViewState) => void;
  onZero: () => void;
}) {
  return (
    <section className={s.panel} id="panel-views" data-panel="views" aria-labelledby="h-views">
      <header className={s.panelHead}>
        <h2 id="h-views">Views</h2>
        <button type="button" className={s.smallBtn} onClick={onZero} title="Zero the view (Z)">
          Zero
        </button>
      </header>
      <div className={s.panelBody}>
        <div className={s.viewTypes} role="radiogroup" aria-label="View controller">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view.type === v.id}
              onClick={() => onView({ ...view, type: v.id })}
            >
              {v.label}
            </button>
          ))}
        </div>
        <dl className={s.props}>
          <div className={s.prop}>
            <dt>
              <label htmlFor="view-target">Target Frame</label>
            </dt>
            <dd>
              <select
                id="view-target"
                className={s.select}
                value={view.target}
                disabled={view.type !== 'follow'}
                onChange={(e) => onView({ ...view, target: e.target.value })}
              >
                {FOLLOW_TARGETS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </dd>
          </div>
          <div className={s.prop}>
            <dt>Distance</dt>
            <dd className={s.mono}>{info.distance}</dd>
          </div>
          <div className={s.prop}>
            <dt>Yaw</dt>
            <dd className={s.mono}>{info.yaw}</dd>
          </div>
          <div className={s.prop}>
            <dt>Pitch</dt>
            <dd className={s.mono}>{info.pitch}</dd>
          </div>
          <div className={s.prop}>
            <dt>Focal Point</dt>
            <dd className={s.mono}>{info.focal}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ inspector */

const KIND: Record<string, string> = {
  num: s.eNum,
  str: s.eStr,
  bool: s.eBool,
  arr: s.eArr,
  more: s.eMore,
};

export function InspectorPanel({
  target,
  lines,
  note,
  noarr,
  onNoarr,
  onTarget,
}: {
  target: InspectTarget;
  lines: EchoLine[];
  note: string;
  noarr: boolean;
  onNoarr: (v: boolean) => void;
  onTarget: (t: InspectTarget) => void;
}) {
  return (
    <section
      className={s.panel}
      id="panel-inspector"
      data-panel="inspector"
      aria-labelledby="h-inspector"
    >
      <header className={s.panelHead}>
        <h2 id="h-inspector">Inspector</h2>
        <label className={s.noarr}>
          <input
            type="checkbox"
            className={s.check}
            checked={noarr}
            onChange={(e) => onNoarr(e.target.checked)}
          />
          Hide arrays
        </label>
      </header>
      <div className={s.inspectBar}>
        <label htmlFor="inspect-target">Echo</label>
        <select
          id="inspect-target"
          className={s.select}
          value={`${target.kind}:${target.name}`}
          onChange={(e) => {
            const [kind, ...rest] = e.target.value.split(':');
            onTarget({ kind: kind as InspectTarget['kind'], name: rest.join(':') });
          }}
        >
          <optgroup label="Topics">
            {TOPICS.map((t) => (
              <option key={t.name} value={`topic:${t.name}`}>
                {t.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Frames, from the fixed frame">
            {[...FRAMES, ...SSL_FRAMES].map((f) => (
              <option key={f} value={`frame:${f}`}>
                {f}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <p className={s.echoNote}>{note}</p>
      <pre
        className={`${s.panelBody} ${s.echo}`}
        tabIndex={0}
        aria-label={`Latest message on ${target.name}`}
      >
        {lines.map((l, i) => (
          <span key={i} className={s.eLine}>
            {'  '.repeat(l.depth)}
            {l.dash ? '- ' : ''}
            <span className={l.kind === 'more' ? s.eMore : s.eKey}>{l.key}</span>
            {l.kind !== 'more' && ':'}
            {l.value ? (
              <>
                {' '}
                <span className={KIND[l.kind ?? ''] ?? ''}>{l.value}</span>
              </>
            ) : null}
            {'\n'}
          </span>
        ))}
        {lines.length > 0 && <span className={s.eSep}>---</span>}
      </pre>
    </section>
  );
}

/* ------------------------------------------------------------------ time */

function BagInfo({ bag }: { bag: Bag }) {
  const periodic = TOPICS.filter((t) => t.rate);
  const total = periodic.reduce((n, t) => n + Math.round((t.rate as number) * bag.duration), 0);
  return (
    <details className={s.info}>
      <summary>Info</summary>
      <div className={s.infoPop}>
        <dl>
          <div>
            <dt>path</dt>
            <dd>{bag.file}</dd>
          </div>
          <div>
            <dt>chapter</dt>
            <dd>{bag.title}</dd>
          </div>
          <div>
            <dt>duration</dt>
            <dd>{`${bag.duration.toFixed(1)}s`}</dd>
          </div>
          <div>
            <dt>cards</dt>
            <dd>{bag.cards.length}</dd>
          </div>
          <div>
            <dt>messages</dt>
            <dd>{total}</dd>
          </div>
        </dl>
        <table>
          <tbody>
            {periodic.map((t) => (
              <tr key={t.name}>
                <th scope="row">{t.name}</th>
                <td>{`${Math.round((t.rate as number) * bag.duration)} msgs`}</td>
                <td>{t.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TimePanel({
  snap,
  controls,
  rates,
  sheetFull,
  onSheet,
}: {
  snap: Snapshot;
  controls: Controls;
  rates: number[];
  sheetFull: boolean;
  onSheet: () => void;
}) {
  const bag = BAGS[snap.bag];
  const card = bag.cards[snap.card];
  return (
    <footer className={s.time} aria-label="Time and playback">
      <button
        type="button"
        className={s.grip}
        aria-label={sheetFull ? 'Shrink the panels' : 'Expand the panels'}
        aria-expanded={sheetFull}
        onClick={onSheet}
      >
        <span />
      </button>
      <div className={s.timeRow}>
        <label className={s.srOnly} htmlFor="bag-select">
          Recorded run
        </label>
        <select
          id="bag-select"
          className={`${s.select} ${s.bagSel}`}
          value={snap.bag}
          onChange={(e) => controls.loadBag(Number(e.target.value))}
        >
          {BAGS.map((b, i) => (
            <option key={b.id} value={i}>{`${i + 1} · ${b.file}`}</option>
          ))}
        </select>
        <BagInfo bag={bag} />
        <div className={s.transport} role="group" aria-label="Transport">
          <button
            type="button"
            onClick={controls.start}
            aria-label="Back to the start"
            title="Start (Home)"
          >
            <Icon name="start" fill />
          </button>
          <button
            type="button"
            onClick={() => controls.jump(-1)}
            aria-label="Previous card"
            title="Previous card ([)"
          >
            <Icon name="prev" />
          </button>
          <button
            type="button"
            className={s.play}
            onClick={controls.toggle}
            aria-label={snap.playing ? 'Pause' : 'Play'}
            title="Play or pause (Space)"
          >
            <Icon name={snap.playing ? 'pause' : 'play'} fill />
          </button>
          <button
            type="button"
            onClick={() => controls.step(1)}
            aria-label="Step forward"
            title="Step one scan (.)"
          >
            <Icon name="step" fill />
          </button>
          <button
            type="button"
            onClick={() => controls.jump(1)}
            aria-label="Next card"
            title="Next card (])"
          >
            <Icon name="next" />
          </button>
        </div>
        <label className={s.rate}>
          <span>Rate</span>
          <select
            className={s.select}
            value={snap.rate}
            onChange={(e) => controls.rate(Number(e.target.value))}
          >
            {rates.map((r) => (
              <option key={r} value={r}>{`${r}×`}</option>
            ))}
          </select>
        </label>
        <label className={s.loopLbl}>
          <input
            type="checkbox"
            className={s.check}
            checked={snap.loop}
            onChange={(e) => controls.loop(e.target.checked)}
          />
          Loop
        </label>
        <dl className={s.clocks}>
          <div>
            <dt>Sim Time</dt>
            <dd>{snap.simTime.toFixed(2)}</dd>
          </div>
          <div className={s.wall}>
            <dt>Wall Time</dt>
            <dd>{snap.ready ? snap.wallTime.toFixed(2) : '—'}</dd>
          </div>
          <div>
            <dt>Wall Elapsed</dt>
            <dd>{snap.wallElapsed.toFixed(2)}</dd>
          </div>
        </dl>
      </div>
      <div className={s.scrub}>
        <span className={s.tNow}>{snap.t.toFixed(2)}</span>
        <div className={s.track}>
          <div
            className={s.fill}
            style={{ transform: `scaleX(${snap.t / snap.duration})` }}
            aria-hidden="true"
          />
          {bag.cards.map((c, i) => (
            <span
              key={c.start}
              className={s.tick}
              style={{ left: `${(c.start / snap.duration) * 100}%` }}
              data-on={i === snap.card || undefined}
              aria-hidden="true"
            />
          ))}
          <input
            type="range"
            min={0}
            max={snap.duration}
            step={0.05}
            value={snap.t}
            onChange={(e) => controls.seek(Number(e.target.value))}
            aria-label="Bag time"
            aria-valuetext={`${snap.t.toFixed(1)} of ${snap.duration} seconds, card ${snap.card + 1}: ${card.title}`}
          />
        </div>
        <span className={s.tEnd}>{snap.duration.toFixed(2)}</span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ help */

const SHORTCUTS: [string, [string, string][]][] = [
  [
    'Tools',
    [
      ...TOOLS.map((t) => [t.key.toUpperCase(), t.label] as [string, string]),
      ['Esc', 'Back to Interact'],
    ],
  ],
  [
    'Camera',
    [
      ['Left-drag', 'Rotate (pan in the ortho views)'],
      ['Shift or middle-drag', 'Pan'],
      ['Right-drag, scroll', 'Zoom'],
      ['V', 'Next view controller'],
      ['Z', 'Zero the view'],
    ],
  ],
  [
    'Playback',
    [
      ['Space', 'Play or pause'],
      ['← →', 'Seek a second (Shift: five)'],
      ['[ ]', 'Previous or next card'],
      ['. ,', 'Step one scan forward or back'],
      ['Home', 'Back to the start'],
      ['− +', 'Slower or faster'],
      ['L', 'Loop'],
      [`1–${BAGS.length}`, 'Open a recorded run'],
    ],
  ],
  [
    'Page',
    [
      ['R', 'Reset the displays'],
      ['P', 'Read as a page'],
      ['?', 'These shortcuts'],
    ],
  ],
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.help}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="help-title"
    >
      <header className={s.helpHead}>
        <h2 id="help-title">Keyboard shortcuts</h2>
        <button type="button" className={s.smallBtn} onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      <div className={s.helpGrid}>
        {SHORTCUTS.map(([group, keys]) => (
          <section key={group}>
            <h3>{group}</h3>
            <dl>
              {keys.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
