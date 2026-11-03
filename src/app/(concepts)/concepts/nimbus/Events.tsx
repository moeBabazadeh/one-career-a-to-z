'use client';

import { Fragment, useMemo, useState } from 'react';
import { db } from '../_shared/data';
import {
  EVENTS,
  LISTINGS,
  PUBLISHED,
  eventTime,
  type CareerEvent,
  type Listing,
} from './inventory';
import { runInShell } from './Shell';
import { Card, Ext, Icon, JsonView, PageHead, Pill, cx } from './ui';
import { href } from './store';
import s from './console.module.scss';

/* ------------------------------------------------------------------ audit trail */

const ATTRS = [
  {
    id: 'any',
    label: 'Any attribute',
    get: (e: CareerEvent) => `${e.name} ${e.source} ${e.resource} ${e.summary}`,
  },
  { id: 'name', label: 'Event name', get: (e: CareerEvent) => e.name },
  { id: 'source', label: 'Event source', get: (e: CareerEvent) => e.source },
  { id: 'resource', label: 'Resource name', get: (e: CareerEvent) => e.resource },
] as const;

const NAMES = [...new Set(EVENTS.map((e) => e.name))].sort();
const PAGE = 20;

function download(rows: CareerEvent[]) {
  const blob = new Blob([JSON.stringify({ Records: rows.map((e) => e.record) }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audit-trail.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Events() {
  const [attr, setAttr] = useState<(typeof ATTRS)[number]['id']>('any');
  const [q, setQ] = useState('');
  const [name, setName] = useState('all');
  const [dated, setDated] = useState<'all' | 'dated' | 'undated'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const get = ATTRS.find((a) => a.id === attr)?.get ?? ATTRS[0].get;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return EVENTS.filter(
      (e) =>
        (name === 'all' || e.name === name) &&
        (dated === 'all' || (dated === 'dated') === Boolean(e.at)) &&
        terms.every((t) => get(e).toLowerCase().includes(t)),
    );
  }, [attr, q, name, dated]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * PAGE, at * PAGE + PAGE);
  const reset = () => setPage(0);

  return (
    <div className={s.page}>
      <PageHead
        kicker="Global"
        title="Audit trail"
        lede="Career events with their real dates: roles assumed and ended, degrees, awards, papers, pull requests and every build archived to storage. Events with no date on record are listed as undated."
        actions={
          <>
            <button
              type="button"
              className={s.btn}
              onClick={() => runInShell('cloud events list --limit 10')}
            >
              <Icon name="terminal" size={16} /> Tail in CloudShell
            </button>
            <button type="button" className={s.btn} onClick={() => download(rows)}>
              <Icon name="download" size={16} /> Download
            </button>
          </>
        }
      />
      <div className={s.table}>
        <div className={s.tableTools}>
          <label className={s.select}>
            <span>Lookup</span>
            <select
              value={attr}
              onChange={(e) => {
                setAttr(e.target.value as typeof attr);
                reset();
              }}
            >
              {ATTRS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className={s.find}>
            <Icon name="search" size={15} />
            <input
              type="search"
              value={q}
              placeholder="Enter a lookup value"
              aria-label="Lookup value"
              onChange={(e) => {
                setQ(e.target.value);
                reset();
              }}
            />
          </label>
          <label className={s.select}>
            <span>Event</span>
            <select
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                reset();
              }}
            >
              <option value="all">All events</option>
              {NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className={s.segmented} role="radiogroup" aria-label="Dates">
            {(['all', 'dated', 'undated'] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={dated === d}
                onClick={() => {
                  setDated(d);
                  reset();
                }}
              >
                {d === 'all' ? 'All' : d === 'dated' ? 'Dated' : 'Undated'}
              </button>
            ))}
          </div>
          {pages > 1 && (
            <nav className={s.pager} aria-label="Pages">
              <button
                type="button"
                aria-label="Previous page"
                disabled={at === 0}
                onClick={() => setPage(at - 1)}
              >
                <Icon name="left" size={15} />
              </button>
              <span>
                {at + 1} / {pages}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={at >= pages - 1}
                onClick={() => setPage(at + 1)}
              >
                <Icon name="right" size={15} />
              </button>
            </nav>
          )}
        </div>
        <p className={s.resultCount}>
          {rows.length} of {EVENTS.length} events
        </p>
        <div className={s.tableScroll}>
          <table className={s.eventTable}>
            <thead>
              <tr>
                <th scope="col">Event time</th>
                <th scope="col">Event name</th>
                <th scope="col" className={s.wide}>
                  Source
                </th>
                <th scope="col">Summary</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <Fragment key={e.id}>
                  <tr className={cx(s.eventRow, open === e.id && s.eventOpen)}>
                    <td className={s.mono}>
                      <button
                        type="button"
                        className={s.expand}
                        aria-expanded={open === e.id}
                        aria-label={`Event record for ${e.name}, ${eventTime(e)}`}
                        onClick={() => setOpen(open === e.id ? null : e.id)}
                      >
                        <Icon name={open === e.id ? 'down' : 'right'} size={14} />
                        {e.at ? eventTime(e) : <Pill tone="muted">undated</Pill>}
                      </button>
                    </td>
                    <td>
                      <code className={s.eventName}>{e.name}</code>
                    </td>
                    <td className={cx(s.wide, s.muted)}>{e.source}</td>
                    <td>{e.summary}</td>
                  </tr>
                  {open === e.id && (
                    <tr className={s.eventDetail}>
                      <td colSpan={4}>
                        <div className={s.eventDetailInner}>
                          <dl className={s.stMeta}>
                            <div>
                              <dt>Resource</dt>
                              <dd>
                                {e.href ? (
                                  <a href={href(e.href)}>{e.resource}</a>
                                ) : (
                                  <code>{e.resource}</code>
                                )}
                              </dd>
                            </div>
                          </dl>
                          <JsonView
                            value={e.record}
                            label={`${e.name} event record`}
                            title="Event record"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={4} className={s.noRows}>
                    No events match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ marketplace */

const KINDS = [...new Set(LISTINGS.map((l) => l.kind))];

function ListingCard({ l }: { l: Listing }) {
  return (
    <li className={cx(s.card, s.listing)}>
      <header>
        <span className={s.listingIcon} aria-hidden="true">
          <Icon name={l.pr ? 'code' : 'marketplace'} size={18} />
        </span>
        <div>
          <b className={s.mono}>{l.repo}</b>
          <small>
            {l.pr ? `Pull request #${l.pr}` : 'Published by this account'} · {l.year}
          </small>
        </div>
        <Pill tone={l.kind === 'Security' ? 'warn' : l.kind === 'Data loss' ? 'warn' : 'info'}>
          {l.kind}
        </Pill>
      </header>
      <p className={s.listingChange}>{l.change}</p>
      {l.pr && (
        <p className={s.listingImpact}>
          <span>Why it mattered</span>
          {l.impact}
        </p>
      )}
      <footer>
        {l.stars && (
          <span title="Stars on the repository">
            <Icon name="ml" size={13} /> {l.stars} stars
          </span>
        )}
        {l.weekly && (
          <span title="Weekly downloads">
            <Icon name="download" size={13} /> {l.weekly}/week
          </span>
        )}
        {!l.pr && <span>{l.impact}</span>}
        <Ext url={l.url} className={s.btn}>
          {l.pr ? 'View pull request' : 'View code'}
        </Ext>
      </footer>
    </li>
  );
}

export function Marketplace() {
  const [kind, setKind] = useState<string>('all');
  const shown = LISTINGS.filter((l) => kind === 'all' || l.kind === kind);
  return (
    <div className={s.page}>
      <PageHead
        kicker="Contributions"
        title="Marketplace"
        lede={`Fixes he sent upstream to open-source packages downloaded ${db.downloads.weekly.long} times a week, and what he published himself.`}
        actions={
          <button
            type="button"
            className={s.btn}
            onClick={() => runInShell('cloud marketplace list')}
          >
            <Icon name="terminal" size={16} /> List in CloudShell
          </button>
        }
      />
      <ul className={s.miniStats}>
        <li>
          <span>Pull requests</span>
          <b>{LISTINGS.length}</b>
        </li>
        <li>
          <span>Weekly downloads, combined</span>
          <b>{db.downloads.weekly.short}</b>
        </li>
        <li>
          <span>Exact sum</span>
          <b>{db.downloads.exact}</b>
        </li>
        <li>
          <span>Published</span>
          <b>{PUBLISHED.length}</b>
        </li>
      </ul>
      <div className={s.chips} role="radiogroup" aria-label="Kind">
        {['all', ...KINDS].map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={s.chip}
            onClick={() => setKind(k)}
          >
            {k === 'all' ? 'All' : k}
            <span>
              {k === 'all' ? LISTINGS.length : LISTINGS.filter((l) => l.kind === k).length}
            </span>
          </button>
        ))}
      </div>
      <ul className={s.listings}>
        {shown.map((l) => (
          <ListingCard key={l.id} l={l} />
        ))}
      </ul>
      <h2 className={s.sectionTitle}>Published by this account</h2>
      <ul className={s.listings}>
        {PUBLISHED.map((l) => (
          <ListingCard key={l.id} l={l} />
        ))}
      </ul>
      <Card title="Profile">
        <p className={s.prose}>
          Everything public lives on <Ext url={db.person.github}>GitHub</Ext>.
        </p>
      </Card>
    </div>
  );
}
