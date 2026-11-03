'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { upper } from './capture';
import { PROMPT } from './content';
import type { AnalyzerId, Config, Frame } from './decode';
import { hex, value } from './draw';
import {
  ANALYZERS,
  BAUDS,
  CHANNELS,
  clearMarkers,
  get,
  rowAn,
  rowFrame,
  reveal,
  set,
  setCfg,
  setQuery,
  stepFrame,
  stepHit,
  toggleShown,
  useLA,
  type Radix,
} from './store';
import { freq, time } from './units';
import s from './logic.module.scss';

const KIND: Record<Frame['k'], string> = {
  byte: 'data',
  start: 'start',
  restart: 'restart',
  stop: 'stop',
  addr: 'address',
  data: 'data',
  word: 'transfer',
};

/** One line of detail for a frame, the data table's last column. */
function detail(an: AnalyzerId, f: Frame, radix: Radix) {
  if (f.err === 'framing') return 'framing error';
  if (f.err === 'partial') return 'cut off at capture edge';
  if (an === 'i2c') {
    if (f.k === 'addr') return `${f.rd ? 'read' : 'write'} · ${f.ack ? 'ACK' : 'NACK'}`;
    if (f.k === 'data') return f.ack ? 'ACK' : 'NACK';
    return '';
  }
  if (an === 'spi') return `MISO ${value(f.m ?? 0, radix)[0]}`;
  return '';
}

const shortName: Record<AnalyzerId, string> = {
  tx: 'UART TX',
  rx: 'UART RX',
  i2c: 'I²C',
  spi: 'SPI',
};

/* ------------------------------------------------------------------ analyzers list */

function Settings({ an }: { an: AnalyzerId }) {
  const cfg = useLA((st) => st.cfg);
  if (an === 'tx' || an === 'rx') {
    return (
      <div className={s.anCfg}>
        <label>
          Bit rate
          <select
            value={cfg[an].baud}
            onChange={(e) => setCfg({ ...cfg, [an]: { baud: Number(e.target.value) } })}
          >
            {BAUDS.map((b) => (
              <option key={b} value={b}>
                {b} bit/s
              </option>
            ))}
          </select>
        </label>
        <p>8 data bits · no parity · 1 stop bit · LSB first · idle high</p>
      </div>
    );
  }
  if (an === 'spi') {
    return (
      <div className={s.anCfg}>
        <label>
          Mode
          <select
            value={cfg.spi.mode}
            onChange={(e) =>
              setCfg({ ...cfg, spi: { ...cfg.spi, mode: Number(e.target.value) as 0 | 1 | 2 | 3 } })
            }
          >
            {[0, 1, 2, 3].map((m) => (
              <option key={m} value={m}>
                {`${m} · CPOL ${m >> 1} · CPHA ${m & 1}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bit order
          <select
            value={cfg.spi.msb ? 'msb' : 'lsb'}
            onChange={(e) => setCfg({ ...cfg, spi: { ...cfg.spi, msb: e.target.value === 'msb' } })}
          >
            <option value="msb">MSB first</option>
            <option value="lsb">LSB first</option>
          </select>
        </label>
        <p>8 bits per transfer · enable is active low on D7</p>
      </div>
    );
  }
  return (
    <div className={s.anCfg}>
      <p>7-bit addressing · SCL on D2, SDA on D3 · repeated starts and clock stretching followed</p>
    </div>
  );
}

function summary(an: AnalyzerId, cfg: Config) {
  if (an === 'tx' || an === 'rx') return `${cfg[an].baud} · 8N1`;
  if (an === 'spi') return `mode ${cfg.spi.mode} · ${cfg.spi.msb ? 'MSB' : 'LSB'}`;
  return '7-bit';
}

function Analyzers() {
  const shown = useLA((st) => st.shown);
  const focus = useLA((st) => st.focus);
  const cfg = useLA((st) => st.cfg);
  const dec = useLA((st) => st.dec);
  const [open, setOpen] = useState<AnalyzerId | null>(null);
  return (
    <ul className={s.anList} aria-label="Analyzers">
      {ANALYZERS.map((a) => {
        const frames = dec?.[a.id] ?? [];
        const errs = frames.reduce((n, f) => n + (f.err ? 1 : 0), 0);
        return (
          <li
            key={a.id}
            className={s.an}
            data-focus={focus === a.id || undefined}
            style={{ '--an': `var(--b-${a.id}-line)` } as React.CSSProperties}
          >
            <div className={s.anRow}>
              <button
                type="button"
                className={s.anMain}
                onClick={() => set({ focus: a.id, sel: null })}
                aria-pressed={focus === a.id}
                title="Show in the terminal and step its frames"
              >
                <i aria-hidden="true" />
                <b>{a.name}</b>
                <span>
                  {a.inputs} · {summary(a.id, cfg)}
                </span>
                <small>
                  {a.chapter}
                  {dec ? ` · ${frames.length} frames` : ''}
                  {errs ? <em>{` · ${errs} errors`}</em> : null}
                </small>
              </button>
              <button
                type="button"
                className={s.iconBtn}
                aria-pressed={shown[a.id]}
                aria-label={`${shown[a.id] ? 'Hide' : 'Show'} ${a.name} bubbles`}
                onClick={() => toggleShown(a.id)}
                title={shown[a.id] ? 'Hide bubbles' : 'Show bubbles'}
              >
                <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
                  <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
                  <circle cx={8} cy={8} r={2} />
                  {!shown[a.id] && <path d="M2.5 13.5l11-11" />}
                </svg>
              </button>
              <button
                type="button"
                className={s.iconBtn}
                aria-expanded={open === a.id}
                aria-label={`${a.name} settings`}
                onClick={() => setOpen(open === a.id ? null : a.id)}
                title="Analyzer settings"
              >
                <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
                  <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
                  <circle cx={10.5} cy={4.5} r={1.6} />
                  <circle cx={5.5} cy={11.5} r={1.6} />
                </svg>
              </button>
            </div>
            {open === a.id && <Settings an={a.id} />}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ search and frame stepping */

function SearchBar() {
  const query = useLA((st) => st.query);
  const hits = useLA((st) => st.hits);
  const hit = useLA((st) => st.hit);
  const dec = useLA((st) => st.dec);
  return (
    <div className={s.search} role="search">
      <label className={s.searchBox}>
        <span className={s.sr}>Search decoded data</span>
        <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
          <circle cx={7} cy={7} r={4.5} />
          <path d="M10.5 10.5l3.5 3.5" />
        </svg>
        <input
          id="la-search"
          type="search"
          placeholder="Find in decoded data"
          value={query}
          disabled={!dec}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              stepHit(e.shiftKey ? -1 : 1);
            }
          }}
        />
        {query && (
          <output>
            {hits.length
              ? `${hit < 0 ? '–' : hit + 1}/${hits.length}${hits.length >= 999 ? '+' : ''}`
              : 'none'}
          </output>
        )}
      </label>
      <button
        type="button"
        className={s.iconBtn}
        onClick={() => stepHit(-1)}
        disabled={!hits.length}
        aria-label="Previous match"
      >
        <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>
      <button
        type="button"
        className={s.iconBtn}
        onClick={() => stepHit(1)}
        disabled={!hits.length}
        aria-label="Next match"
      >
        <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
    </div>
  );
}

export function FrameNav({ compact = false }: { compact?: boolean }) {
  const focus = useLA((st) => st.focus);
  const sel = useLA((st) => st.sel);
  const dec = useLA((st) => st.dec);
  const name = shortName[sel?.an ?? focus];
  return (
    <div className={s.frameNav} role="group" aria-label="Go to frame">
      <button
        type="button"
        className={s.btn}
        onClick={() => stepFrame(-1)}
        disabled={!dec}
        title="Previous frame (Shift+N)"
      >
        <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
          <path d="M10 3.5L5.5 8l4.5 4.5" />
        </svg>
        <span className={compact ? s.sr : undefined}>Prev</span>
      </button>
      <span className={s.frameNavLabel}>{compact ? name : `${name} frame`}</span>
      <button
        type="button"
        className={s.btn}
        onClick={() => stepFrame(1)}
        disabled={!dec}
        title="Next frame (N)"
      >
        <span className={compact ? s.sr : undefined}>Next</span>
        <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
          <path d="M6 3.5L10.5 8 6 12.5" />
        </svg>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ data table */

const ROW_H = 24;

function Table() {
  const rows = useLA((st) => st.rows);
  const dec = useLA((st) => st.dec);
  const radix = useLA((st) => st.radix);
  const sel = useLA((st) => st.sel);
  const hits = useLA((st) => st.hits);
  const hit = useLA((st) => st.hit);
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the selected frame in view.
  useEffect(() => {
    const el = box.current;
    if (!el || !sel) return;
    const code = (['tx', 'rx', 'i2c', 'spi'].indexOf(sel.an) << 24) | sel.i;
    const idx = rows.indexOf(code);
    if (idx < 0) return;
    const y = idx * ROW_H;
    if (y < el.scrollTop + ROW_H || y > el.scrollTop + el.clientHeight - ROW_H * 2)
      el.scrollTop = Math.max(0, y - el.clientHeight / 2);
  }, [sel, rows]);

  const first = Math.max(0, Math.min(rows.length, Math.floor(top / ROW_H) - 10));
  const last = Math.min(rows.length, first + Math.ceil(height / ROW_H) + 20);
  const current = hit >= 0 ? hits[hit] : null;
  const body = [];
  for (let k = first; dec && k < last; k++) {
    const an = rowAn(rows[k]);
    const i = rowFrame(rows[k]);
    const f = dec[an][i];
    const isSel = sel?.an === an && sel.i === i;
    const isHit = !!current && current.an === an && i >= current.f0 && i <= current.f1;
    const val =
      f.k === 'start' || f.k === 'stop' || f.k === 'restart'
        ? ''
        : f.k === 'addr'
          ? hex(f.v)
          : value(f.v, radix)[0];
    body.push(
      <tr
        key={rows[k]}
        tabIndex={0}
        data-sel={isSel || undefined}
        data-hit={isHit || undefined}
        data-err={f.err ? '1' : undefined}
        style={{ '--an': `var(--b-${an}-line)` } as React.CSSProperties}
        onClick={() => reveal(an, i)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            reveal(an, i);
          }
        }}
      >
        <td>
          <i aria-hidden="true" />
          {shortName[an]}
        </td>
        <td>{KIND[f.k]}</td>
        <td className={s.num}>{time(f.t0, 7, true)}</td>
        <td className={s.val}>{val}</td>
        <td>{detail(an, f, radix)}</td>
      </tr>,
    );
  }
  // The box stays mounted between captures, so its scroll position and size stay in step.
  return (
    <div
      className={s.tableBox}
      ref={box}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      tabIndex={-1}
    >
      {!dec && <p className={s.empty}>Frames show up here once the capture is decoded.</p>}
      <table className={s.table} hidden={!dec}>
        <caption className={s.sr}>
          Decoded frames, in time order. Choose a row to show it on the traces.
        </caption>
        <thead>
          <tr>
            <th scope="col">Analyzer</th>
            <th scope="col">Type</th>
            <th scope="col">Start</th>
            <th scope="col">Value</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {first > 0 && (
            <tr aria-hidden="true" className={s.pad}>
              <td colSpan={5} style={{ height: first * ROW_H }} />
            </tr>
          )}
          {body}
          {last < rows.length && (
            <tr aria-hidden="true" className={s.pad}>
              <td colSpan={5} style={{ height: (rows.length - last) * ROW_H }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ terminal */

function Terminal() {
  const focus = useLA((st) => st.focus);
  const text = useLA((st) => st.text);
  const sel = useLA((st) => st.sel);
  const hits = useLA((st) => st.hits);
  const hit = useLA((st) => st.hit);
  const box = useRef<HTMLDivElement>(null);
  const stream = text?.[focus];
  const lines = useMemo(() => stream?.lines ?? [], [stream]);

  // The line holding the selected frame or the current match.
  const target = (() => {
    const h = hit >= 0 ? hits[hit] : null;
    const f = h && h.an === focus ? h.f0 : sel && sel.an === focus ? sel.i : -1;
    if (f < 0) return -1;
    let lo = 0;
    let hi = lines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].frame <= f) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  })();

  useEffect(() => {
    const el = box.current;
    if (!el || target < 0) return;
    const line = el.querySelector<HTMLElement>(`[data-line="${target}"]`);
    if (!line) return;
    const top =
      line.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop -
      el.clientHeight / 3;
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [target]);

  if (!stream)
    return <p className={s.empty}>The decoded text shows up here once the capture is decoded.</p>;
  return (
    <div
      className={s.term}
      ref={box}
      data-an={focus}
      tabIndex={0}
      aria-label={`${ANALYZERS.find((a) => a.id === focus)?.name} terminal`}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('a')) return;
        const line = t.closest<HTMLElement>('[data-frame]');
        if (line) reveal(focus, Number(line.dataset.frame));
      }}
    >
      {lines.map((l, i) => {
        const prompt = focus === 'tx' && l.segs[0]?.text.startsWith(PROMPT);
        return (
          <div
            key={i}
            data-line={i}
            data-frame={l.frame}
            data-kind={l.kind}
            data-target={i === target || undefined}
          >
            {l.segs.map((seg, k) =>
              seg.href ? (
                <a
                  key={k}
                  href={seg.href}
                  target={
                    seg.href.startsWith('/') || seg.href.startsWith('mailto:')
                      ? undefined
                      : '_blank'
                  }
                  rel="noreferrer"
                >
                  {seg.text}
                </a>
              ) : prompt && k === 0 ? (
                <span key={k}>
                  <span className={s.prompt}>{PROMPT}</span>
                  <b>{seg.text.slice(PROMPT.length)}</b>
                </span>
              ) : (
                <span key={k}>{seg.text}</span>
              ),
            )}
            {!l.segs.length && '​'}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ measurements */

function Measure() {
  const markers = useLA((st) => st.markers);
  const cap = useLA((st) => st.cap);
  const { A, B } = markers;
  const both = A !== null && B !== null;
  const stats = useMemo(() => {
    if (!cap || A === null || B === null) return [];
    const lo = Math.min(A, B);
    const hi = Math.max(A, B);
    const span = hi - lo;
    return cap.traces.map((tr, ch) => {
      const { edges, init } = tr;
      const i0 = upper(edges, lo);
      const i1 = upper(edges, hi);
      let level = init ^ (i0 & 1);
      let high = 0;
      let at = lo;
      let rising = 0;
      for (let k = i0; k < i1; k++) {
        if (level) high += edges[k] - at;
        at = edges[k];
        level ^= 1;
        if (level) rising++;
      }
      if (level) high += hi - at;
      return {
        ch,
        edges: i1 - i0,
        rising,
        freq: rising > 1 ? rising / span : null,
        duty: span > 0 ? high / span : 0,
      };
    });
  }, [cap, A, B]);

  return (
    <div className={s.measure}>
      <section>
        <h3>Timing markers</h3>
        <dl className={s.markers}>
          {(['A', 'B'] as const).map((id) => {
            const t = markers[id];
            return (
              <div key={id} data-m={id}>
                <dt>{id}</dt>
                <dd>{t === null ? '—' : time(t, 7, true)}</dd>
              </div>
            );
          })}
          <div>
            <dt>Δt</dt>
            <dd>{A !== null && B !== null ? time(Math.abs(B - A), 6) : '—'}</dd>
          </div>
          <div>
            <dt>1/Δt</dt>
            <dd>{A !== null && B !== null && B !== A ? freq(1 / Math.abs(B - A)) : '—'}</dd>
          </div>
        </dl>
        <p className={s.hint}>
          Click the ruler or press M to drop a marker at the cursor; drag a flag to move it. Markers
          snap to the nearest edge.
        </p>
        {(A !== null || B !== null) && (
          <button type="button" className={s.btn} onClick={clearMarkers}>
            Clear markers
          </button>
        )}
      </section>
      {both && (
        <section>
          <h3>Between A and B</h3>
          <table className={s.mTable}>
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">Edges</th>
                <th scope="col">Frequency</th>
                <th scope="col">Duty</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((m) => (
                <tr key={m.ch} style={{ '--ch': `var(--ch${m.ch})` } as React.CSSProperties}>
                  <th scope="row">
                    <i aria-hidden="true" />D{m.ch} {CHANNELS[m.ch].name}
                  </th>
                  <td className={s.num}>{m.edges}</td>
                  <td className={s.num}>{m.freq ? freq(m.freq) : '—'}</td>
                  <td className={s.num}>{`${(m.duty * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section>
        <h3>Under the cursor</h3>
        <p className={s.hint}>
          Hover a trace for the width, period, frequency and duty cycle of the pulse beneath it, and
          what the analyzer made of it.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ export */

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The data table as CSV, every shown frame, the way the instrument exports it. */
function exportCsv() {
  const st = get();
  if (!st.dec) return;
  const lines = ['analyzer,type,start_s,duration_s,value,detail'];
  for (const r of st.rows) {
    const an = rowAn(r);
    const f = st.dec[an][rowFrame(r)];
    const v =
      f.k === 'start' || f.k === 'stop' || f.k === 'restart'
        ? ''
        : f.k === 'addr'
          ? hex(f.v)
          : value(f.v, st.radix)[0];
    lines.push(
      [
        shortName[an],
        KIND[f.k],
        f.t0.toFixed(9),
        (f.t1 - f.t0).toFixed(9),
        v,
        detail(an, f, st.radix),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `capture-${st.cap?.id ?? 0}-frames.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ the panel */

type Tab = 'analyzers' | 'measure';
type DataView = 'terminal' | 'table';

export default function Panel() {
  const [tab, setTab] = useState<Tab>('analyzers');
  const [data, setData] = useState<DataView>('terminal');
  const radix = useLA((st) => st.radix);
  return (
    <aside className={s.panel} aria-label="Analyzers and measurements">
      <div className={s.tabs} role="tablist" aria-label="Panel">
        {(['analyzers', 'measure'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`la-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`la-pane-${t}`}
            onClick={() => setTab(t)}
          >
            {t === 'analyzers' ? 'Analyzers' : 'Measurements'}
          </button>
        ))}
      </div>
      {tab === 'analyzers' ? (
        <div
          className={s.pane}
          role="tabpanel"
          id="la-pane-analyzers"
          aria-labelledby="la-tab-analyzers"
        >
          <Analyzers />
          <div className={s.dataBar}>
            <div className={s.seg} role="group" aria-label="Show decoded data as">
              {(['terminal', 'table'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={data === d} onClick={() => setData(d)}>
                  {d === 'terminal' ? 'Terminal' : 'Data table'}
                </button>
              ))}
            </div>
            <div className={s.dataEnd}>
              <label className={s.radix}>
                <span className={s.sr}>Display radix</span>
                <select value={radix} onChange={(e) => set({ radix: e.target.value as Radix })}>
                  <option value="ascii">ASCII</option>
                  <option value="hex">Hex</option>
                  <option value="dec">Dec</option>
                  <option value="bin">Bin</option>
                </select>
              </label>
              <button
                type="button"
                className={s.iconBtn}
                onClick={exportCsv}
                aria-label="Export the data table as CSV"
                title="Export CSV"
              >
                <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
                  <path d="M8 2.5v8M4.8 7.5L8 10.7l3.2-3.2M3 13.5h10" />
                </svg>
              </button>
            </div>
          </div>
          <div className={s.dataTools}>
            <SearchBar />
            <FrameNav compact />
          </div>
          {data === 'terminal' ? <Terminal /> : <Table />}
        </div>
      ) : (
        <div
          className={s.pane}
          role="tabpanel"
          id="la-pane-measure"
          aria-labelledby="la-tab-measure"
        >
          <Measure />
        </div>
      )}
    </aside>
  );
}
