'use client';

import Image from 'next/image';
import { createContext, useContext, useEffect, useState } from 'react';
import { db, profile } from '../_shared/data';
import { Icon } from './icons';
import type { Attachment, Block, Inline, Label, Sender } from './mailbox';
import s from './mail.module.scss';

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ highlighting */

/** The search's highlighter, for every piece of text below it. */
export const HlContext = createContext<RegExp | null>(null);

export function Hl({ text }: { text: string }) {
  const re = useContext(HlContext);
  if (!re) return <>{text}</>;
  const parts = text.split(re);
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

const external = (href: string) => /^https?:/.test(href);
const linkProps = (href: string) => (external(href) ? { target: '_blank', rel: 'noreferrer' } : {});

export function Inlines({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((x, i) => {
        if (typeof x === 'string') return <Hl key={i} text={x} />;
        if ('b' in x)
          return (
            <strong key={i}>
              <Hl text={x.b} />
            </strong>
          );
        if ('code' in x) return <kbd key={i}>{x.code}</kbd>;
        return (
          <a key={i} href={x.href} {...linkProps(x.href)}>
            <Hl text={x.a} />
          </a>
        );
      })}
    </>
  );
}

const LINK_ICON = { site: Icon.out, store: Icon.download, code: Icon.code, paper: Icon.page };
const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** A message body, block by block. */
export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((bl, i) => {
        switch (bl.t) {
          case 'p':
            return (
              <p key={i}>
                <Inlines c={bl.c} />
              </p>
            );
          case 'h':
            return (
              <h4 key={i} className={s.bh}>
                <Hl text={bl.text} />
              </h4>
            );
          case 'ul':
            return (
              <ul key={i}>
                {bl.items.map((it, j) => (
                  <li key={j}>
                    <Inlines c={it} />
                  </li>
                ))}
              </ul>
            );
          case 'kv':
            return (
              <dl key={i} className={s.kv}>
                {bl.rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <Inlines c={v} />
                    </dd>
                  </div>
                ))}
              </dl>
            );
          case 'stats':
            return (
              <ul key={i} className={s.stats}>
                {bl.items.map((st) => (
                  <li key={st.label}>
                    <b>{st.value}</b>
                    <span>
                      <Hl text={st.label} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case 'table':
            return (
              <div key={i} className={s.tableWrap} tabIndex={0} role="region" aria-label="Table">
                <table>
                  <thead>
                    <tr>
                      {bl.head.map((hd) => (
                        <th key={hd} scope="col">
                          {hd}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bl.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c}>
                            <Inlines c={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'links':
            return (
              <ul key={i} className={s.linkCards}>
                {bl.items.map((l) => {
                  const I = LINK_ICON[l.kind];
                  return (
                    <li key={l.url}>
                      <a href={l.url} {...linkProps(l.url)}>
                        <span className={s.linkIcon}>
                          <I size={16} />
                        </span>
                        <span className={s.linkText}>
                          <b>
                            <Hl text={l.label} />
                          </b>
                          <small>{l.label === host(l.url) ? 'Website' : host(l.url)}</small>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            );
          case 'cta':
            return (
              <p key={i}>
                <a className={s.cta} href={bl.url} {...linkProps(bl.url)}>
                  {bl.label} <Icon.out size={14} />
                </a>
              </p>
            );
          case 'tags':
            return (
              <ul key={i} className={s.tags}>
                {bl.items.map((tg) => (
                  <li key={tg}>
                    <Hl text={tg} />
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </>
  );
}

/* ------------------------------------------------------------------ people */

export function Avatar({ sender, size = 36 }: { sender: Sender; size?: number }) {
  if (sender.id === 'moe')
    return (
      <span className={s.avatar} style={{ width: size, height: size }}>
        <Image src={db.person.photo} width={size * 2} height={size * 2} alt="" />
      </span>
    );
  return (
    <span
      className={s.avatar}
      data-kind={sender.id}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {sender.id === 'site' ? sender.name.charAt(0) : <Icon.user size={size * 0.55} />}
    </span>
  );
}

export function LabelChip({ label, href }: { label: Label; href?: string }) {
  const style = { '--h': label.hue } as React.CSSProperties;
  if (href)
    return (
      <a className={s.chip} style={style} href={href} title={`${label.group}: ${label.name}`}>
        {label.name}
      </a>
    );
  return (
    <span className={s.chip} style={style}>
      {label.name}
    </span>
  );
}

/** Moe's signature, after the "-- " that mail clients know to trim. */
export function Signature() {
  return (
    <div className={s.sig}>
      <span className={s.sigDash} aria-hidden="true">
        --{' '}
      </span>
      <b>{profile.name}</b>
      <span>
        {profile.role},{' '}
        <a href={profile.companyUrl} target="_blank" rel="noreferrer">
          {profile.company}
        </a>
      </span>
      <span>
        <a href={`mailto:${profile.email}`}>{profile.email}</a> ·{' '}
        <a href={db.person.url}>{db.person.site}</a>
      </span>
      <span>
        <a href={profile.linkedin} target="_blank" rel="noreferrer">
          LinkedIn
        </a>{' '}
        ·{' '}
        <a href={profile.github} target="_blank" rel="noreferrer">
          GitHub
        </a>{' '}
        ·{' '}
        <a href={profile.cv} target="_blank" rel="noreferrer">
          CV (PDF)
        </a>
      </span>
    </div>
  );
}

/** The footer the site puts under its own reports. */
export function SiteFooter() {
  return (
    <p className={s.siteFoot}>
      Sent by {db.person.site} on behalf of {profile.name}. Replies go to{' '}
      <a href={`mailto:${profile.email}`}>{profile.email}</a>.{' '}
      <a href="#read">Read everything as one page</a>.
    </p>
  );
}

/* ------------------------------------------------------------------ attachments */

const sizes = new Map<string, string>();

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/** The real size of a file on the server, from a HEAD request, once per file. */
export function useFileSize(href: string) {
  const [size, setSize] = useState(() => sizes.get(href) ?? '');
  useEffect(() => {
    if (sizes.has(href)) return;
    let live = true;
    fetch(href, { method: 'HEAD' })
      .then((r) => {
        const n = Number(r.headers.get('content-length'));
        if (r.ok && n > 0) {
          sizes.set(href, kb(n));
          if (live) setSize(kb(n));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [href]);
  return size;
}

function AttachmentCard({ att, onOpen }: { att: Attachment; onOpen: (a: Attachment) => void }) {
  const size = useFileSize(att.href);
  const kind = att.kind === 'pdf' ? 'PDF' : (att.name.split('.').pop() ?? '').toUpperCase();
  if (att.kind === 'image')
    return (
      <li className={s.attImage}>
        <button type="button" onClick={() => onOpen(att)} aria-label={`Preview ${att.name}`}>
          <Image
            src={att.href}
            width={att.w ?? 1280}
            height={att.h ?? 800}
            alt=""
            sizes="(max-width: 860px) 100vw, 560px"
          />
        </button>
        <span className={s.attMeta}>
          <Icon.image size={16} />
          <b>{att.name}</b>
          <small>
            {kind}
            {size && ` · ${size}`}
          </small>
          <a
            href={att.href}
            download
            className={s.iconBtn}
            aria-label={`Download ${att.name}`}
            title="Download"
          >
            <Icon.download size={16} />
          </a>
        </span>
      </li>
    );
  return (
    <li className={s.attFile}>
      <a href={att.href} target="_blank" rel="noreferrer">
        <span className={s.pdfIcon} aria-hidden="true">
          PDF
        </span>
        <span>
          <b>{att.name}</b>
          <small>
            {kind}
            {size && ` · ${size}`} · opens in a new tab
          </small>
        </span>
      </a>
      <a
        href={att.href}
        download
        className={s.iconBtn}
        aria-label={`Download ${att.name}`}
        title="Download"
      >
        <Icon.download size={16} />
      </a>
    </li>
  );
}

export function Attachments({
  list,
  onOpen,
}: {
  list: Attachment[];
  onOpen: (a: Attachment) => void;
}) {
  if (!list.length) return null;
  return (
    <div className={s.atts}>
      <p className={s.attsHead}>
        <Icon.clip size={15} />{' '}
        {list.length === 1 ? 'One attachment' : `${list.length} attachments`}
      </p>
      <ul>
        {list.map((att) => (
          <AttachmentCard key={att.href} att={att} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}
