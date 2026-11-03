'use client';

import { useState } from 'react';
import { db, fmt } from '../_shared/data';
import { cvFile, items, rows } from './stock';
import s from './vending.module.scss';

/**
 * Behind the service door: the planogram an operator stocks the machine from. Every slot as a
 * readable line, with everything the packaging holds, so the whole career reads without a coin
 * or a keypad.
 */
export default function Planogram({ onVend }: { onVend: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section id="service" className={s.service} aria-labelledby="service-title">
      <header className={s.serviceHead}>
        <p className={s.eyebrow}>Service panel · door open</p>
        <h2 id="service-title">Planogram</h2>
        <p>
          {`Every slot in the machine, ${fmt.spell(items.length)} in ${fmt.spell(rows.length)} rows, as the operator stocks it. Open any line to read the whole item, or vend it from here. Facts as of ${fmt.month(db.asOf)}.`}
        </p>
        <button
          type="button"
          className={s.expand}
          onClick={() => setOpen((v) => !v)}
          aria-pressed={open}
        >
          {open ? 'Close every line' : 'Open every line'}
        </button>
      </header>

      {rows.map((row) => (
        <div key={row.id} className={s.pgRow}>
          <h3>
            <span className={s.pgLetter}>{row.id}</span>
            {row.name}
            <small>{row.blurb}</small>
          </h3>
          <ol>
            {row.items.map((item) => (
              <li key={item.code}>
                <details open={open || undefined}>
                  <summary>
                    <span className={s.pgCode}>{item.code}</span>
                    <span className={s.pgTitle}>
                      <b>{item.title}</b>
                      <span>{item.sub}</span>
                    </span>
                    <span className={s.pgYear}>{item.dates ?? item.year}</span>
                    <span className={s.pgQty}>
                      {item.qty ? `${item.qty.n} ${item.qty.unit}` : ''}
                    </span>
                  </summary>
                  <div className={s.pgBody}>
                    {item.list ? (
                      <ul>
                        {item.body.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    ) : (
                      item.body.map((p) => <p key={p}>{p}</p>)
                    )}
                    {item.figures && (
                      <p className={s.pgFigs}>
                        {item.figures.map((f) => (
                          <span key={f.label}>
                            <b>{f.value}</b> {f.label}
                          </span>
                        ))}
                      </p>
                    )}
                    {item.tech && item.tech.length > 0 && (
                      <p className={s.pgTech}>
                        {item.pack === 'bar'
                          ? 'Counts: '
                          : item.special === 'about'
                            ? 'Skills: '
                            : 'Made of: '}
                        {item.tech.join(', ')}
                      </p>
                    )}
                    {item.facts.length > 0 && (
                      <dl className={s.pgFacts}>
                        {item.facts.map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <p className={s.pgActions}>
                      {item.links.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          {...(l.download
                            ? { download: cvFile }
                            : l.url.startsWith('mailto:')
                              ? {}
                              : { target: '_blank', rel: 'noreferrer' })}
                        >
                          {l.label}
                          <span aria-hidden="true">
                            {l.download ? ' ↓' : l.url.startsWith('mailto:') ? '' : ' ↗'}
                          </span>
                        </a>
                      ))}
                      <button type="button" onClick={() => onVend(item.code)}>
                        Vend {item.code}
                      </button>
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
