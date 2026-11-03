'use client';

// A cell's outputs: printed text, the Out[n] value, tables, figures, the inspector's pager and
// tracebacks. Tracebacks are laid out the way IPython prints them, and each "Cell In[n], line k"
// is a link back to that line.
import { useState, type ReactNode } from 'react';
import Chart from './Chart';
import type { ErrorInfo, Output, TableData } from './lang/interp';
import { getNotebook, jumpTo } from './store';
import s from './notebook.module.scss';

const LINK =
  /(https?:\/\/[^\s'"<>)\]]*[^\s'"<>)\].,;:])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(^|\s)(\/[\w-]+\.pdf)\b/g;

/** Text with its URLs, emails and the CV path made into links, as notebook frontends do. */
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (let m = LINK.exec(text); m; m = LINK.exec(text)) {
    const lead = m[3] ?? '';
    const start = m.index + lead.length;
    if (start > last) out.push(text.slice(last, start));
    const href = m[1] ?? (m[2] ? `mailto:${m[2]}` : m[4]);
    const label = m[1] ?? m[2] ?? m[4];
    out.push(
      <a key={n++} href={href} {...(m[1] ? { target: '_blank', rel: 'noreferrer' } : {})}>
        {label}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  LINK.lastIndex = 0;
  return out;
}

function TableOut({ data }: { data: TableData }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const rows = data.rows.map((r, i) => ({ r, i }));
  if (sort) {
    rows.sort((a, b) => {
      const x = a.r[sort.col];
      const y = b.r[sort.col];
      const c =
        x.num !== null && y.num !== null
          ? x.num - y.num
          : x.text.localeCompare(y.text, 'en', { numeric: true });
      return c * sort.dir || a.i - b.i;
    });
  }
  const numeric = data.columns.map(
    (_, c) =>
      data.rows.length > 0 && data.rows.every((r) => r[c].num !== null || r[c].text === 'None'),
  );
  const toggle = (col: number) =>
    setSort((cur) =>
      cur?.col !== col ? { col, dir: 1 } : cur.dir === 1 ? { col, dir: -1 } : null,
    );

  return (
    <div className={s.tableOut}>
      {data.title && <p className={s.tableTitle}>{data.title}</p>}
      <div
        className={s.tableWrap}
        tabIndex={0}
        role="region"
        aria-label={data.title ?? 'Table output'}
      >
        <table className={s.df}>
          <thead>
            <tr>
              <th aria-label="Row" />
              {data.columns.map((c, i) => (
                <th
                  key={c}
                  aria-sort={
                    sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined
                  }
                  className={numeric[i] ? s.num : undefined}
                >
                  <button type="button" onClick={() => toggle(i)} title={`Sort by ${c}`}>
                    {c}
                    <span className={s.sortMark} aria-hidden="true">
                      {sort?.col === i ? (sort.dir === 1 ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, i }) => (
              <tr key={i}>
                <th scope="row">{i}</th>
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className={numeric[j] ? s.num : cell.text === 'None' ? s.none : undefined}
                  >
                    {cell.link ? (
                      <a
                        href={cell.link}
                        {...(/^https?:/.test(cell.link)
                          ? { target: '_blank', rel: 'noreferrer' }
                          : {})}
                      >
                        {cell.text}
                      </a>
                    ) : (
                      cell.text
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.tableFoot}>
        {data.rows.length} rows × {data.columns.length} columns
      </p>
    </div>
  );
}

function Loc({ cell, count, line }: { cell: string; count: number | null; line: number }) {
  const exists = getNotebook().cells.some((c) => c.id === cell);
  const text = `Cell In[${count ?? ' '}], line ${line}`;
  if (!exists) return <span className={s.tbLoc}>{text}</span>;
  return (
    <button
      type="button"
      className={s.tbLoc}
      onClick={() => jumpTo(cell, line)}
      title="Go to this line"
    >
      {text}
    </button>
  );
}

function Traceback({ err }: { err: ErrorInfo }) {
  const head = (
    <>
      <span className={s.tbName}>{err.ename}</span>
      {err.evalue ? `: ${err.evalue}` : ''}
    </>
  );
  if (err.syntax) {
    const sx = err.syntax;
    return (
      <pre className={s.tb}>
        {'  '}
        <Loc cell={sx.cell} count={sx.count} line={sx.line} />
        {'\n    '}
        {sx.text}
        {'\n    '}
        {' '.repeat(Math.max(0, sx.col - 1))}
        <span className={s.tbCaret}>
          {'^'.repeat(Math.min(sx.width, Math.max(1, sx.text.length - sx.col + 2)))}
        </span>
        {'\n'}
        {head}
      </pre>
    );
  }
  return (
    <pre className={s.tb}>
      <span className={s.tbRule}>{'-'.repeat(75)}</span>
      {'\n'}
      <span className={s.tbName}>{err.ename.padEnd(42)}</span>
      {'Traceback (most recent call last)\n'}
      {err.frames.map((f, i) => {
        const digits = Math.max(...f.context.map((c) => String(c.n).length), 1);
        return (
          <span key={i}>
            {f.skipped !== undefined ? (
              <span
                className={s.tbSkip}
              >{`    [... skipping similar frames: ${f.fn} at line ${f.line} (${f.skipped} times)]\n`}</span>
            ) : (
              <>
                <Loc cell={f.cell} count={f.count} line={f.line} />
                {f.fn && (
                  <>
                    {', in '}
                    <span className={s.tbFn}>{f.fn}</span>
                  </>
                )}
                {'\n'}
                {f.context.map((c) =>
                  c.n === f.line ? (
                    <span key={c.n} className={s.tbCur}>
                      <span className={s.tbArrow}>{'----> '}</span>
                      <span className={s.tbNum}>{String(c.n).padStart(digits)}</span> {c.text}
                      {'\n'}
                    </span>
                  ) : (
                    <span key={c.n}>
                      {'      '}
                      <span className={s.tbNum}>{String(c.n).padStart(digits)}</span> {c.text}
                      {'\n'}
                    </span>
                  ),
                )}
              </>
            )}
            {'\n'}
          </span>
        );
      })}
      {head}
      {err.note && <span className={s.tbNote}>{`\n\n${err.note}`}</span>}
    </pre>
  );
}

export default function Outputs({ outputs }: { outputs: Output[] }) {
  return (
    <div className={s.outputs}>
      {outputs.map((o, i) => {
        const prompt = o.t === 'data' && o.count !== null ? `[${o.count}]:` : '';
        let body: ReactNode;
        if (o.t === 'stream') body = <pre className={s.stream}>{linkify(o.text)}</pre>;
        else if (o.t === 'error') body = <Traceback err={o.err} />;
        else if (o.data.kind === 'text')
          body = <pre className={s.result}>{linkify(o.data.text)}</pre>;
        else if (o.data.kind === 'help') body = <pre className={s.pager}>{o.data.text}</pre>;
        else if (o.data.kind === 'table') body = <TableOut data={o.data.table} />;
        else body = <Chart spec={o.data.spec} />;
        return (
          <div key={i} className={s.outRow} data-kind={o.t === 'data' ? o.data.kind : o.t}>
            <div className={s.outPrompt} aria-hidden={!prompt}>
              {prompt && <span className={s.visuallyHidden}>Out </span>}
              {prompt}
            </div>
            <div className={s.outBody}>{body}</div>
          </div>
        );
      })}
    </div>
  );
}
