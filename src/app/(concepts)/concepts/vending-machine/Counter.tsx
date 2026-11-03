'use client';

import Image from 'next/image';
import { useId, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { db, fmt, jobs } from '../_shared/data';
import { code39 } from './code39';
import Glyph from './Glyph';
import { cvFile, initials, itemByCode, items, rowById, rows, type Item } from './stock';
import s from './vending.module.scss';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const { person, current, education, awards } = db;

/** A receipt: the transaction, printed once when the item was vended. */
export interface Slip {
  txn: number;
  code: string;
  /** Local date and time of the vend, as printed. */
  at: string;
}

export interface Opened {
  slip: Slip;
  /** Prints line by line; a reopened receipt is already printed. */
  fresh: boolean;
  kept: boolean;
  tossed: boolean;
}

/* ---------------------------------------------------------------- intro */

export function Note({ onPick }: { onPick: (code: string) => void }) {
  const picks = ['A1', 'D1', 'D8', 'D9'].map((c) => itemByCode(c) as Item);
  return (
    <section className={s.note} aria-labelledby="note-title">
      <p className={s.eyebrow}>Operator’s note</p>
      <h2 id="note-title">{`${fmt.Spell(items.length)} slots, one career.`}</h2>
      <p>{db.lede}</p>
      <ol className={s.steps}>
        <li>
          <b>Punch a code</b> on the keypad or your keyboard: a row, <kbd>A</kbd>–
          <kbd>{rows[rows.length - 1].id}</kbd>, then a number. Or tap an item.
        </li>
        <li>
          <b>Press Vend</b> (or <kbd>Enter</kbd>) and watch the coil turn once. The item drops.
        </li>
        <li>
          <b>Reach into the tray</b> to open it. A receipt prints its dates, figures and links.
        </li>
      </ol>
      <p className={s.picksLabel}>Try one</p>
      <ul className={s.picks}>
        {picks.map((p) => (
          <li key={p.code}>
            <button type="button" onClick={() => onPick(p.code)}>
              <b>{p.code}</b> {p.title}
            </button>
          </li>
        ))}
      </ul>
      <p className={s.fine}>
        The coin slot takes nothing: every item is free, and nothing you do here is recorded or
        sent.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- the opened item */

export function Card({
  item,
  headingRef,
  onClose,
}: {
  item: Item;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  const row = rowById(item.row);
  return (
    <article className={s.card} data-tone={item.tone} aria-labelledby="card-title">
      <div className={s.cardArt} data-kind={item.pack}>
        {item.art ? (
          <Image
            src={item.art.src}
            width={1280}
            height={800}
            alt={item.art.alt}
            sizes="(max-width: 1199px) 100vw, 440px"
          />
        ) : item.special === 'about' ? (
          <Image
            src={person.photo}
            width={600}
            height={600}
            alt={`Portrait of ${person.name}`}
            sizes="120px"
            className={s.portrait}
          />
        ) : (
          <Glyph name={item.glyph ?? 'doc'} className={s.cardGlyph} />
        )}
        <span className={s.cardCode}>{item.code}</span>
      </div>
      <div className={s.cardBody}>
        <p className={s.eyebrow}>
          Row {item.row} · {row?.name}
        </p>
        <h2 id="card-title" ref={headingRef} tabIndex={-1}>
          {item.title}
        </h2>
        <p className={s.cardSub}>{item.sub}</p>
        {item.dates && <p className={s.cardDates}>{item.dates}</p>}

        {item.figures && (
          <dl className={s.figs}>
            {item.figures.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {item.special === 'contact' ? (
          <Compose />
        ) : item.list ? (
          <ul className={s.duties}>
            {item.body.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          item.body.map((p) => <p key={p}>{p}</p>)
        )}

        {item.special === 'cv' && <CvContents />}

        {item.tech && item.tech.length > 0 && (
          <p className={s.ingredients}>
            <b>
              {item.special === 'about'
                ? 'Core skills'
                : item.pack === 'bar'
                  ? 'Counts these tags'
                  : 'Ingredients'}
            </b>{' '}
            {item.tech.join(', ')}
          </p>
        )}

        {item.links.length > 0 && item.special !== 'contact' && (
          <ul className={s.cardLinks}>
            {item.links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  {...(l.download ? { download: cvFile } : { target: '_blank', rel: 'noreferrer' })}
                  data-primary={l.download || undefined}
                >
                  {l.label}
                  <span aria-hidden="true">{l.download ? ' ↓' : ' ↗'}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className={s.cardClose} onClick={onClose}>
          Put it away
        </button>
      </div>
    </article>
  );
}

function CvContents() {
  const { bsc, msc } = education;
  return (
    <div className={s.cv}>
      <h3>Experience</h3>
      <ol>
        {jobs.map((j) => (
          <li key={`${j.company}${j.range}`}>
            <b>{j.title}</b>, {j.company}
            <span>{j.range}</span>
          </li>
        ))}
      </ol>
      <h3>Education and awards</h3>
      <ol>
        {[bsc, msc].map((d) => (
          <li key={d.degree}>
            <b>{db.degreeTitle(d)}</b>, {d.school}
            <span>{fmt.yearSpan(d.from, d.to)}</span>
          </li>
        ))}
        <li>
          <b>{`${awards.robocup.event}, ${awards.robocup.place}`}</b>, {awards.robocup.challenge}
          <span>{awards.robocup.year}</span>
        </li>
        <li>
          <b>{`${awards.skills.event}, ${awards.skills.place}`}</b>, {awards.skills.challenge}
          <span>{awards.skills.year}</span>
        </li>
      </ol>
    </div>
  );
}

const TOPICS = [
  'A platform to architect',
  'A device to bring online',
  'A team to build',
  'Something else',
];

/** Writes the email in your own mail app. Nothing is sent from here. */
function Compose() {
  const id = useId();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const subject = `${topic} (via ${person.site})`;
  const body = text || `Hi ${person.first},\n\n`;
  const href = `mailto:${person.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(person.email);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <form className={s.compose} onSubmit={(e) => e.preventDefault()}>
      <p>{`Tell ${person.first} what you’re working on. This only fills in an email in your own mail app; nothing is sent from this page.`}</p>
      <fieldset>
        <legend>What’s it about?</legend>
        <div className={s.topics}>
          {TOPICS.map((t) => (
            <label key={t}>
              <input
                type="radio"
                name={`${id}-topic`}
                value={t}
                checked={topic === t}
                onChange={() => setTopic(t)}
              />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={s.msg}>
        <span>Message (optional)</span>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Hi ${person.first}, …`}
        />
      </label>
      <div className={s.composeActions}>
        <a className={s.primary} href={href}>
          Open in your mail app <span aria-hidden="true">→</span>
        </a>
        <button type="button" onClick={copy}>
          {copied ? 'Address copied' : `Copy ${person.email}`}
        </button>
      </div>
      <p className={s.composeAlt}>
        Or find {person.first} on{' '}
        <a href={person.linkedin} target="_blank" rel="noreferrer">
          LinkedIn
        </a>{' '}
        and{' '}
        <a href={person.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
    </form>
  );
}

/* ---------------------------------------------------------------- the receipt */

function Barcode({ text }: { text: string }) {
  const { bars, width } = code39(text);
  return (
    <svg
      className={s.barcode}
      viewBox={`0 0 ${width} 24`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode: ${text}`}
    >
      {bars.map(([x, w]) => (
        <rect key={x} x={x} y="0" width={w} height="24" />
      ))}
    </svg>
  );
}

const pad = (n: number) => String(n).padStart(4, '0');

export function Receipt({
  item,
  opened,
  onKeep,
  onToss,
}: {
  item: Item;
  opened: Opened;
  onKeep: () => void;
  onToss: () => void;
}) {
  const { slip } = opened;
  const row = rowById(item.row);
  const lines: ReactNode[] = [];
  const kv = (k: string, v: ReactNode) => (
    <p className={s.kv} key={`kv${lines.length}`}>
      <span>{k}</span>
      <span>{v}</span>
    </p>
  );
  const rule = () => <hr key={`hr${lines.length}`} />;

  lines.push(
    <p className={s.rcBrand} key="brand">
      {person.name}
    </p>,
    <p className={s.rcCenter} key="site">
      {`${person.site} · est. ${person.since}`}
    </p>,
    rule(),
  );
  lines.push(kv('Txn', `#${pad(slip.txn)}`));
  lines.push(kv('Date', slip.at));
  lines.push(kv('Slot', `${item.code} · ${row?.name}`));
  lines.push(rule());
  lines.push(
    <p className={s.rcItem} key="item">
      {item.title}
    </p>,
  );
  lines.push(
    <p className={s.rcSub} key="sub">
      {item.sub}
    </p>,
  );
  if (item.dates) lines.push(kv('Dates', item.dates));
  for (const [k, v] of item.facts) lines.push(kv(k, v));
  if (item.figures?.length) {
    lines.push(rule());
    for (const f of item.figures)
      lines.push(
        <p className={s.rcFig} key={`f${f.label}`}>
          <b>{f.value}</b> {f.label}
        </p>,
      );
  }
  if (item.tech?.length) {
    lines.push(rule());
    lines.push(
      <p className={s.rcText} key="tech">
        {`${item.special === 'about' ? 'Skills' : 'Ingredients'}: ${item.tech.join(', ')}`}
      </p>,
    );
  }
  if (item.links.length) {
    lines.push(rule());
    for (const l of item.links)
      lines.push(
        <p className={s.rcLink} key={`l${l.url}`}>
          <a
            href={l.url}
            {...(l.download
              ? { download: cvFile }
              : l.url.startsWith('mailto:')
                ? {}
                : { target: '_blank', rel: 'noreferrer' })}
          >
            → {l.label}
          </a>
        </p>,
      );
  }
  lines.push(rule());
  lines.push(kv('Shelf tag', `${item.code} · ${item.year}`));
  if (item.qty) lines.push(kv('Qty on tag', `${item.qty.n} ${item.qty.unit}`));
  lines.push(kv('Paid', 'Nothing'));
  lines.push(kv('Data collected', 'None'));
  lines.push(
    <div className={s.rcCode} key="code">
      <Barcode text={`${initials}-${item.code}`} />
      <span>{`*${initials}-${item.code}*`}</span>
    </div>,
  );
  lines.push(
    <p className={s.rcCenter} key="bye">
      Thank you · come again
    </p>,
  );

  const done = opened.kept || opened.tossed;
  return (
    <figure
      className={s.receipt}
      data-fresh={opened.fresh || undefined}
      data-tossed={opened.tossed || undefined}
      style={{ '--lines': lines.length } as Vars}
      aria-label={`Receipt #${pad(slip.txn)} for ${item.code}, ${item.title}`}
    >
      <div className={s.slip}>{lines}</div>
      <figcaption className={s.rcActions}>
        {done ? (
          <span>{opened.kept ? 'Kept on the spike.' : 'Tossed.'}</span>
        ) : (
          <>
            <button type="button" className={s.primary} onClick={onKeep}>
              Keep receipt
            </button>
            <button type="button" onClick={onToss}>
              Toss it
            </button>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------- kept receipts */

export function Spike({ kept, onReopen }: { kept: Slip[]; onReopen: (slip: Slip) => void }) {
  return (
    <section className={s.spike} aria-labelledby="spike-title">
      <h2 id="spike-title" tabIndex={-1}>
        Receipts kept <span>{kept.length}</span>
      </h2>
      {kept.length === 0 ? (
        <p>Keep a receipt and it goes on the spike, to reopen later.</p>
      ) : (
        <ol>
          {kept.map((slip, i) => {
            const item = itemByCode(slip.code) as Item;
            return (
              <li key={slip.txn} style={{ '--i': i } as Vars}>
                <button
                  type="button"
                  onClick={() => onReopen(slip)}
                  aria-label={`Reopen receipt #${pad(slip.txn)}: ${item.code}, ${item.title}`}
                >
                  <b>{item.code}</b>
                  <span>{item.title}</span>
                  <small>#{pad(slip.txn)}</small>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** A one-line summary for the live region. */
export const describe = (item: Item) => `${item.code}, ${item.title}`;

/** Current role, for the page header. */
export const roleLine = `${current.title}, ${current.company}`;
