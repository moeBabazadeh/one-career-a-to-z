'use client';

import { useEffect, useRef, useState } from 'react';
import { errorText, type RunResult } from './sql/engine';
import { arrayText } from './sql/compile';
import type { Value } from './sql/types';
import { onStream, setTab, useWorkbench, type LogEntry } from './store';
import s from './query.module.scss';

const isUrl = (v: string) => /^(https?:\/\/|\/[\w-]+\.pdf$)/.test(v);
const shortUrl = (v: string) => v.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function Cell({ v }: { v: Value }) {
  if (v === null) return <span className={s.null}>&lt;null&gt;</span>;
  if (Array.isArray(v))
    return (
      <span className={s.arr} title={arrayText(v)}>
        {v.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </span>
    );
  if (typeof v === 'boolean')
    return (
      <span className={s.bool} data-v={v}>
        {String(v)}
      </span>
    );
  if (typeof v === 'number') return <span className={s.num}>{String(v)}</span>;
  if (isUrl(v))
    return (
      <a href={v} target="_blank" rel="noreferrer" className={s.link}>
        {shortUrl(v)}
      </a>
    );
  return <span title={v.length > 48 ? v : undefined}>{v}</span>;
}

function Transcript({ log }: { log: LogEntry[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);
  return (
    <div ref={box} className={s.transcript} tabIndex={0} aria-label="Messages">
      {log.map((e) => (
        <div key={e.id} className={s.logEntry} data-ok={e.ok}>
          {e.prompt && (
            <p className={s.prompt}>
              <span>career=&gt;</span> {e.prompt}
            </p>
          )}
          {e.lines.map((l, i) => (
            <p
              key={i}
              data-tone={
                /^ERROR/.test(l)
                  ? 'err'
                  : /^HINT/.test(l)
                    ? 'hint'
                    : /^(DETAIL|LINE|\s)/.test(l)
                      ? 'dim'
                      : undefined
              }
            >
              {l}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function ErrorView({ result, onJump }: { result: RunResult; onJump?: () => void }) {
  const lines = errorText(result.error!);
  return (
    <div className={s.errorBox} role="alert">
      <pre>
        {lines.map((l, i) => {
          const m = /^(ERROR|DETAIL|HINT|LINE \d+):(.*)$/.exec(l);
          return (
            <span key={i} data-tone={m?.[1].startsWith('LINE') ? 'line' : m?.[1].toLowerCase()}>
              {m ? (
                <>
                  <b>{m[1]}:</b>
                  {m[2]}
                </>
              ) : (
                <span className={s.caret}>{l}</span>
              )}
              {'\n'}
            </span>
          );
        })}
      </pre>
      {onJump && result.error?.position && (
        <button type="button" className={s.ghost} onClick={onJump}>
          Jump to the error
        </button>
      )}
    </div>
  );
}

export default function Results({ pending, onJump }: { pending: boolean; onJump: () => void }) {
  const wb = useWorkbench();
  const r = wb.result;
  const table = useRef<HTMLTableElement>(null);
  const [record, setRecord] = useState<{ run: number; index: number } | null>(null);
  const status = useRef<HTMLSpanElement>(null);

  // Rows appear as the plan view delivers them to the client.
  useEffect(
    () =>
      onStream((e) => {
        const el = table.current;
        if (!el || e.runId !== wb.runId) return;
        const rows = el.tBodies[0]?.rows;
        if (e.type === 'start') {
          el.setAttribute('data-stream', '');
          el.removeAttribute('data-done');
          if (rows) for (const row of rows) row.removeAttribute('data-in');
          if (status.current) status.current.textContent = 'streaming…';
        } else if (e.type === 'row') {
          rows?.[e.index]?.setAttribute('data-in', '');
        } else {
          el.setAttribute('data-done', '');
          if (status.current) status.current.textContent = '';
        }
      }),
    [wb.runId],
  );

  const open = record && record.run === wb.runId ? record.index : null;
  const shown = open !== null ? r.rows[open] : null;
  const isPlanText = r.kind === 'explain';

  return (
    <section className={s.results} aria-labelledby="results-title">
      <header className={s.paneHead}>
        <h2 id="results-title" className={s.sr}>
          Output
        </h2>
        <div className={s.tabs} role="tablist" aria-label="Output">
          <button
            type="button"
            role="tab"
            aria-selected={wb.tab === 'results'}
            onClick={() => setTab('results')}
          >
            Results
            {r.ok && r.columns.length ? <span className={s.count}>{r.rows.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={wb.tab === 'messages'}
            onClick={() => setTab('messages')}
          >
            Messages
            {!r.ok && (
              <span className={s.count} data-tone="err">
                1
              </span>
            )}
          </button>
        </div>
        <p className={s.meta}>
          {r.ok ? (
            <>
              <span>{r.command}</span>
              {(r.kind === 'select' || r.kind === 'explain') && (
                <span>{(r.planning + r.execution).toFixed(3)} ms</span>
              )}
              <span ref={status} className={s.streaming} />
            </>
          ) : (
            <span data-tone="err">ERROR</span>
          )}
        </p>
      </header>

      {wb.tab === 'messages' ? (
        <Transcript log={wb.log} />
      ) : !r.ok ? (
        <ErrorView result={r} onJump={onJump} />
      ) : !r.columns.length ? (
        <div className={s.planEmpty}>
          <p>
            <b>{r.command || 'Done'}</b> · no rows to show. The messages tab has the details.
          </p>
        </div>
      ) : (
        <div className={s.gridWrap} data-record={shown ? '' : undefined}>
          <div className={s.grid} tabIndex={0} aria-label="Result rows">
            <table
              ref={table}
              key={wb.runId}
              data-stream={pending || undefined}
              data-plan={isPlanText || undefined}
            >
              <caption className={s.sr}>
                {r.rows.length} row{r.rows.length === 1 ? '' : 's'} from the query
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={s.rowNum}>
                    #
                  </th>
                  {r.columns.map((c, i) => (
                    <th key={`${c.name}-${i}`} scope="col">
                      <span>{c.name}</span>
                      <small>{c.type}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row, i) => (
                  <tr
                    key={i}
                    aria-selected={open === i || undefined}
                    onClick={() =>
                      !isPlanText && setRecord(open === i ? null : { run: wb.runId, index: i })
                    }
                  >
                    <th scope="row" className={s.rowNum}>
                      {isPlanText ? (
                        i + 1
                      ) : (
                        <button
                          type="button"
                          aria-label={`Inspect row ${i + 1}`}
                          aria-pressed={open === i}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecord(open === i ? null : { run: wb.runId, index: i });
                          }}
                        >
                          {i + 1}
                        </button>
                      )}
                    </th>
                    {row.map((v, j) => (
                      <td key={j} data-type={r.columns[j].type}>
                        <Cell v={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown && open !== null && (
            <aside className={s.record} aria-label={`Row ${open + 1}`}>
              <header>
                <b>Row {open + 1}</b>
                <button
                  type="button"
                  className={s.close}
                  onClick={() => setRecord(null)}
                  aria-label="Close the row"
                >
                  ×
                </button>
              </header>
              <dl>
                {r.columns.map((c, j) => (
                  <div key={`${c.name}-${j}`}>
                    <dt>
                      {c.name} <small>{c.type}</small>
                    </dt>
                    <dd>
                      <Cell v={shown[j]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </aside>
          )}
        </div>
      )}
      {r.truncated && (
        <p className={s.note}>
          Fetched the first {r.truncated} rows, like a client with a fetch size of 500.
        </p>
      )}
    </section>
  );
}
