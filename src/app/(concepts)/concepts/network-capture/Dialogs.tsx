'use client';

// The windows behind the menus: Follow Stream, Protocol Hierarchy, Conversations, Endpoints,
// Expert Information, Capture File Properties, Coloring Rules, Go to Packet, the shortcut list
// and About. Every number in them is counted from the packets.

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { concept } from '../_shared/concepts';
import { db, fmt } from '../_shared/data';
import { COLOR_RULES, compile, type ColorRule } from './filter';
import { arrival } from './net';
import {
  SEV_ORDER,
  chunkText,
  conversations,
  endpoints,
  expertInfo,
  follow,
  followName,
  hierarchy,
  type ConvKind,
  type FollowKind,
  type Phs,
  type ShowAs,
} from './stats';
import { IFACES, type Capture, type Packet } from './trace';
import { Dialog, Icon, cx } from './ui';
import s from './capture.module.scss';

const n0 = (n: number) => n.toLocaleString('en-US');
const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : '0.0');
export const FILE_NAME = `${db.person.site}.pcapng`;

/* ------------------------------------------------------------------ follow */

const URL_RE = /(https?:\/\/[^\s"'<>]+)/g;

function decorate(text: string, find: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(URL_RE).forEach((part, i) => {
    if (i % 2) {
      out.push(
        <a
          key={`u${i}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className={s.followLink}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>,
      );
      return;
    }
    if (!find) {
      out.push(part);
      return;
    }
    const lower = part.toLowerCase();
    const needle = find.toLowerCase();
    let at = 0;
    for (;;) {
      const hit = lower.indexOf(needle, at);
      if (hit < 0) break;
      out.push(
        part.slice(at, hit),
        <mark key={`m${i}-${hit}`} className={s.findHit}>
          {part.slice(hit, hit + find.length)}
        </mark>,
      );
      at = hit + find.length;
    }
    out.push(part.slice(at));
  });
  return out;
}

interface FollowProps {
  packets: Packet[];
  kind: FollowKind;
  stream: number;
  kinds: FollowKind[];
  streams: number;
  onSwitch: (kind: FollowKind, stream: number) => void;
  onJump: (frame: number) => void;
  onFilterOut: (filter: string) => void;
  onBack: () => void;
  onClose: () => void;
}

export function FollowDialog({
  packets,
  kind,
  stream,
  kinds,
  streams,
  onSwitch,
  onJump,
  onFilterOut,
  onBack,
  onClose,
}: FollowProps) {
  const [as, setAs] = useState<ShowAs>('ascii');
  const [dir, setDir] = useState<'both' | '0' | '1'>('both');
  const [find, setFind] = useState('');
  const [hit, setHit] = useState(0);
  const f = useMemo(() => follow(packets, kind, stream), [packets, kind, stream]);
  const chunks = f.chunks.filter((c) => dir === 'both' || String(c.dir) === dir);
  const offsets = [0, 0];
  const body = chunks.map((c, i) => {
    const text = chunkText(c, as, i, offsets[c.dir], f);
    offsets[c.dir] += c.bytes.length;
    return (
      <span
        key={`${c.frame}-${i}`}
        className={c.dir ? s.peerServer : s.peerClient}
        onClick={() => onJump(c.frame)}
        title={`Frame ${c.frame}`}
      >
        {as === 'ascii' || as === 'utf8' ? decorate(text, find) : text}
      </span>
    );
  });
  const yamlHead =
    as === 'yaml'
      ? `peers:\n  - peer: 0\n    host: ${f.client.split(':')[0]}\n    port: ${f.client.split(':')[1]}\n  - peer: 1\n    host: ${f.server.split(':')[0]}\n    port: ${f.server.split(':')[1]}\npackets:\n`
      : '';
  const next = () => {
    const marks = document.querySelectorAll<HTMLElement>(`.${s.findHit}`);
    if (!marks.length) return;
    const i = hit % marks.length;
    marks.forEach((m) => m.classList.remove(s.findOn));
    marks[i].classList.add(s.findOn);
    marks[i].scrollIntoView({ block: 'center' });
    setHit(i + 1);
  };
  return (
    <Dialog
      size="lg"
      onClose={onClose}
      title={
        <>
          Follow {followName[kind]} ({f.filter}) · <span className={s.dim}>{FILE_NAME}</span>
        </>
      }
      footer={
        <>
          <button type="button" className={s.btn} onClick={() => onFilterOut(`!(${f.filter})`)}>
            Filter Out This Stream
          </button>
          <button type="button" className={s.btn} onClick={onBack}>
            Back
          </button>
          <span className={s.grow} />
          <button type="button" className={cx(s.btn, s.btnMain)} onClick={onClose} data-autofocus>
            Close
          </button>
        </>
      }
    >
      <div className={s.followTabs} role="tablist" aria-label="Follow as">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === kind}
            className={cx(s.tab, k === kind && s.tabOn)}
            onClick={() => onSwitch(k, stream)}
          >
            {followName[k]}
          </button>
        ))}
      </div>
      <pre className={s.followText} tabIndex={0} aria-label={`${followName[kind]} contents`}>
        {yamlHead}
        {body.length ? body : <span className={s.dim}>No payload in this stream.</span>}
      </pre>
      <p className={s.followStats}>
        <span className={s.peerClient}>{f.pkts[0]} client pkts</span>,{' '}
        <span className={s.peerServer}>{f.pkts[1]} server pkts</span>, {f.turns} turns. Click a span
        to select its packet.
      </p>
      <div className={s.followControls}>
        <label className={s.field}>
          <span>Conversation</span>
          <select value={dir} onChange={(e) => setDir(e.target.value as typeof dir)}>
            <option value="both">Entire conversation ({n0(f.bytes[0] + f.bytes[1])} bytes)</option>
            <option value="0">
              {f.client} → {f.server} ({n0(f.bytes[0])} bytes)
            </option>
            <option value="1">
              {f.server} → {f.client} ({n0(f.bytes[1])} bytes)
            </option>
          </select>
        </label>
        <label className={s.field}>
          <span>Show data as</span>
          <select value={as} onChange={(e) => setAs(e.target.value as ShowAs)}>
            <option value="ascii">ASCII</option>
            <option value="utf8">UTF-8</option>
            <option value="hexdump">Hex Dump</option>
            <option value="carrays">C Arrays</option>
            <option value="raw">Raw</option>
            <option value="yaml">YAML</option>
          </select>
        </label>
        <label className={s.field}>
          <span>Stream</span>
          <input
            type="number"
            min={0}
            max={streams - 1}
            value={stream}
            className={s.numInput}
            onChange={(e) =>
              onSwitch(
                kind === 'udp' ? 'udp' : kind,
                Math.max(0, Math.min(streams - 1, Number(e.target.value) || 0)),
              )
            }
          />
        </label>
        <form
          className={s.field}
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <span>Find</span>
          <input
            value={find}
            onChange={(e) => (setFind(e.target.value), setHit(0))}
            className={s.textInput}
            aria-label="Find in stream"
          />
          <button type="submit" className={s.btn} disabled={!find}>
            Find Next
          </button>
        </form>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ protocol hierarchy */

export function HierarchyDialog({
  packets,
  filter,
  onApply,
  onClose,
}: {
  packets: Packet[];
  filter: string;
  onApply: (f: string) => void;
  onClose: () => void;
}) {
  const root = useMemo(() => hierarchy(packets), [packets]);
  const [sel, setSel] = useState<string | null>(null);
  const span = packets.length > 1 ? packets[packets.length - 1].t - packets[0].t : 1;
  const rows: { n: Phs; depth: number }[] = [];
  const walk = (n: Phs, depth: number) => {
    rows.push({ n, depth });
    n.kids.forEach((k) => walk(k, depth + 1));
  };
  walk(root, 0);
  return (
    <Dialog
      size="lg"
      onClose={onClose}
      title={
        <>
          Protocol Hierarchy Statistics · <span className={s.dim}>{FILE_NAME}</span>
        </>
      }
      footer={
        <>
          <span className={s.dim}>Display filter: {filter || 'none'}</span>
          <span className={s.grow} />
          <button
            type="button"
            className={s.btn}
            disabled={!sel}
            onClick={() => sel && onApply(sel)}
          >
            Apply as Filter
          </button>
          <button type="button" className={cx(s.btn, s.btnMain)} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Percent Packets</th>
              <th className={s.num}>Packets</th>
              <th>Percent Bytes</th>
              <th className={s.num}>Bytes</th>
              <th className={s.num}>Bits/s</th>
              <th className={s.num}>End Packets</th>
              <th className={s.num}>End Bytes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ n, depth }) => (
              <tr
                key={`${depth}-${n.proto}-${n.packets}`}
                className={cx(sel === n.proto && s.trSel)}
                onClick={() => setSel(n.proto)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSel(n.proto)}
                aria-selected={sel === n.proto}
              >
                <td style={{ paddingLeft: 8 + depth * 14 }}>{n.name}</td>
                <td>
                  <span className={s.bar}>
                    <span
                      className={s.barFill}
                      style={{ width: `${pct(n.packets, root.packets)}%` }}
                    />
                    <span className={s.barText}>{pct(n.packets, root.packets)}</span>
                  </span>
                </td>
                <td className={s.num}>{n0(n.packets)}</td>
                <td>
                  <span className={s.bar}>
                    <span
                      className={s.barFill}
                      style={{ width: `${Math.min(100, +pct(n.bytes, root.bytes))}%` }}
                    />
                    <span className={s.barText}>{pct(n.bytes, root.bytes)}</span>
                  </span>
                </td>
                <td className={s.num}>{n0(n.bytes)}</td>
                <td className={s.num}>{n0(Math.round((n.bytes * 8) / Math.max(span, 0.001)))}</td>
                <td className={s.num}>{n0(n.endPackets)}</td>
                <td className={s.num}>{n0(n.endBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ conversations */

const CONV_TABS: { k: ConvKind; label: string }[] = [
  { k: 'eth', label: 'Ethernet' },
  { k: 'ip', label: 'IPv4' },
  { k: 'tcp', label: 'TCP' },
  { k: 'udp', label: 'UDP' },
  { k: 'ble', label: 'Bluetooth' },
];

export function ConversationsDialog({
  captured,
  displayed,
  filter,
  onApply,
  onFollow,
  onClose,
}: {
  captured: Packet[];
  displayed: Packet[];
  filter: string;
  onApply: (f: string) => void;
  onFollow: (k: 'tcp' | 'udp', stream: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ConvKind>('tcp');
  const [limit, setLimit] = useState(false);
  const [names, setNames] = useState(true);
  const [sort, setSort] = useState<{ col: string; desc: boolean }>({ col: 'start', desc: false });
  const [sel, setSel] = useState<number | null>(null);
  const source = limit ? displayed : captured;
  const all = useMemo(
    () =>
      Object.fromEntries(CONV_TABS.map(({ k }) => [k, conversations(source, k)])) as Record<
        ConvKind,
        ReturnType<typeof conversations>
      >,
    [source],
  );
  const ports = tab === 'tcp' || tab === 'udp';
  const keyOf: Record<string, (c: (typeof all)[ConvKind][number]) => number | string> = {
    a: (c) => (names ? (c.aName ?? c.a) : c.a),
    b: (c) => (names ? (c.bName ?? c.b) : c.b),
    pa: (c) => c.portA ?? 0,
    pb: (c) => c.portB ?? 0,
    packets: (c) => c.packets,
    bytes: (c) => c.bytes,
    ab: (c) => c.ab[1],
    ba: (c) => c.ba[1],
    start: (c) => c.start,
    dur: (c) => c.end - c.start,
  };
  const list = [...all[tab]].sort((x, y) => {
    const a = keyOf[sort.col](x);
    const b = keyOf[sort.col](y);
    const c =
      typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
    return sort.desc ? -c : c;
  });
  const cur = sel !== null ? list[sel] : undefined;
  const th = (col: string, label: string, num = false) => (
    <th
      className={num ? s.num : undefined}
      aria-sort={sort.col === col ? (sort.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        className={s.thBtn}
        onClick={() => setSort({ col, desc: sort.col === col ? !sort.desc : num })}
      >
        {label}
        {sort.col === col ? (sort.desc ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );
  return (
    <Dialog
      size="lg"
      onClose={onClose}
      title={
        <>
          Conversations · <span className={s.dim}>{FILE_NAME}</span>
        </>
      }
      footer={
        <>
          <label className={s.check}>
            <input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} />{' '}
            Name resolution
          </label>
          <label className={s.check}>
            <input
              type="checkbox"
              checked={limit}
              onChange={(e) => (setLimit(e.target.checked), setSel(null))}
            />{' '}
            Limit to display filter{filter ? ` (${filter})` : ''}
          </label>
          <span className={s.grow} />
          <button
            type="button"
            className={s.btn}
            disabled={!cur || cur.stream === undefined}
            onClick={() =>
              cur && cur.stream !== undefined && onFollow(tab as 'tcp' | 'udp', cur.stream)
            }
          >
            Follow Stream…
          </button>
          <button
            type="button"
            className={s.btn}
            disabled={!cur}
            onClick={() => cur && onApply(cur.filter)}
          >
            Apply as Filter
          </button>
          <button type="button" className={cx(s.btn, s.btnMain)} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className={s.followTabs} role="tablist" aria-label="Conversation types">
        {CONV_TABS.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === tab}
            className={cx(s.tab, k === tab && s.tabOn)}
            onClick={() => (setTab(k), setSel(null))}
          >
            {label} · {all[k].length}
          </button>
        ))}
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              {th('a', 'Address A')}
              {ports && th('pa', 'Port A', true)}
              {th('b', 'Address B')}
              {ports && th('pb', 'Port B', true)}
              {th('packets', 'Packets', true)}
              {th('bytes', 'Bytes', true)}
              {ports && <th className={s.num}>Stream ID</th>}
              {th('ab', 'Bytes A → B', true)}
              {th('ba', 'Bytes B → A', true)}
              {th('start', 'Rel Start', true)}
              {th('dur', 'Duration', true)}
            </tr>
          </thead>
          <tbody>
            {list.map((c, i) => (
              <tr
                key={c.filter}
                className={cx(sel === i && s.trSel)}
                onClick={() => setSel(i)}
                onDoubleClick={() => onApply(c.filter)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onApply(c.filter)}
                aria-selected={sel === i}
              >
                <td>{names ? (c.aName ?? c.a) : c.a}</td>
                {ports && <td className={s.num}>{c.portA}</td>}
                <td>{names ? (c.bName ?? c.b) : c.b}</td>
                {ports && <td className={s.num}>{c.portB}</td>}
                <td className={s.num}>{n0(c.packets)}</td>
                <td className={s.num}>{n0(c.bytes)}</td>
                {ports && <td className={s.num}>{c.stream}</td>}
                <td className={s.num}>{n0(c.ab[1])}</td>
                <td className={s.num}>{n0(c.ba[1])}</td>
                <td className={s.num}>{c.start.toFixed(6)}</td>
                <td className={s.num}>{(c.end - c.start).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

export function EndpointsDialog({
  packets,
  onApply,
  onClose,
}: {
  packets: Packet[];
  onApply: (f: string) => void;
  onClose: () => void;
}) {
  const list = useMemo(() => endpoints(packets).sort((a, b) => b.bytes - a.bytes), [packets]);
  return (
    <Dialog
      size="lg"
      onClose={onClose}
      title={
        <>
          Endpoints · IPv4 · <span className={s.dim}>{FILE_NAME}</span>
        </>
      }
      footer={
        <button type="button" className={cx(s.btn, s.btnMain)} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Address</th>
              <th>Name</th>
              <th className={s.num}>Packets</th>
              <th className={s.num}>Bytes</th>
              <th className={s.num}>Tx Packets</th>
              <th className={s.num}>Tx Bytes</th>
              <th className={s.num}>Rx Packets</th>
              <th className={s.num}>Rx Bytes</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr
                key={e.addr}
                tabIndex={0}
                onDoubleClick={() => onApply(`ip.addr == ${e.addr}`)}
                onKeyDown={(k) => k.key === 'Enter' && onApply(`ip.addr == ${e.addr}`)}
              >
                <td>{e.addr}</td>
                <td>{e.name ?? ''}</td>
                <td className={s.num}>{n0(e.packets)}</td>
                <td className={s.num}>{n0(e.bytes)}</td>
                <td className={s.num}>{n0(e.tx[0])}</td>
                <td className={s.num}>{n0(e.tx[1])}</td>
                <td className={s.num}>{n0(e.rx[0])}</td>
                <td className={s.num}>{n0(e.rx[1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ expert information */

const SEV_LABEL = {
  error: 'Error',
  warn: 'Warning',
  note: 'Note',
  chat: 'Chat',
  comment: 'Comment',
};

export function ExpertDialog({
  packets,
  onJump,
  onClose,
}: {
  packets: Packet[];
  onJump: (frame: number) => void;
  onClose: () => void;
}) {
  const groups = useMemo(() => expertInfo(packets), [packets]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const counts = SEV_ORDER.map(
    (sev) =>
      [sev, groups.filter((g) => g.sev === sev).reduce((n, g) => n + g.frames.length, 0)] as const,
  );
  return (
    <Dialog
      size="lg"
      onClose={onClose}
      title={
        <>
          Expert Information · <span className={s.dim}>{FILE_NAME}</span>
        </>
      }
      footer={
        <>
          <span className={s.dim}>
            {counts.map(([sev, n]) => `${SEV_LABEL[sev]}s: ${n}`).join(' · ')}
          </span>
          <span className={s.grow} />
          <button type="button" className={cx(s.btn, s.btnMain)} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Summary</th>
              <th>Group</th>
              <th>Protocol</th>
              <th className={s.num}>Count</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const key = `${g.sev}|${g.msg}`;
              const isOpen = open.has(key);
              return (
                <Fragment key={key}>
                  <tr
                    className={s[`sev_${g.sev}`]}
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen(
                        (o) => new Set(isOpen ? [...o].filter((x) => x !== key) : [...o, key]),
                      )
                    }
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      setOpen(
                        (o) => new Set(isOpen ? [...o].filter((x) => x !== key) : [...o, key]),
                      )
                    }
                  >
                    <td>
                      <span className={cx(s.twisty, isOpen && s.twistyOpen)}>▸</span>{' '}
                      {SEV_LABEL[g.sev]}
                    </td>
                    <td className={s.mono}>{g.msg}</td>
                    <td>{g.group}</td>
                    <td>{g.proto}</td>
                    <td className={s.num}>{g.frames.length}</td>
                  </tr>
                  {isOpen &&
                    g.frames.slice(0, 60).map((f) => (
                      <tr key={`${key}-${f}`} className={s.expertFrame}>
                        <td />
                        <td colSpan={4}>
                          <button type="button" className={s.linkBtn} onClick={() => onJump(f)}>
                            Frame {f}
                          </button>
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ capture file properties */

export function PropertiesDialog({
  cap,
  captured,
  displayed,
  marked,
  onClose,
}: {
  cap: Capture;
  captured: Packet[];
  displayed: Packet[];
  marked: number;
  onClose: () => void;
}) {
  const first = captured[0];
  const last = captured[captured.length - 1];
  const span = first && last ? last.t - first.t : 0;
  const bytes = (list: Packet[]) => list.reduce((n, p) => n + p.len, 0);
  const stat = (list: Packet[]) => {
    const b = bytes(list);
    const t = list.length > 1 ? list[list.length - 1].t - list[0].t : 0;
    return [
      n0(list.length),
      t.toFixed(3),
      t ? (list.length / t).toFixed(1) : '—',
      list.length ? Math.round(b / list.length) : '—',
      n0(b),
      t ? n0(Math.round(b / t)) : '—',
      t ? `${((b * 8) / t / 1000).toFixed(1)} k` : '—',
    ];
  };
  const rows = [
    'Packets',
    'Time span, s',
    'Average pps',
    'Average packet size, B',
    'Bytes',
    'Average bytes/s',
    'Average bits/s',
  ];
  const cs = stat(captured);
  const ds = stat(displayed);
  const comments = captured.filter((p) => p.comment);
  const size = bytes(captured) + captured.length * 32 + IFACES.length * 40 + 64;
  return (
    <Dialog
      size="lg"
      onClose={onClose}
      title={
        <>
          Capture File Properties · <span className={s.dim}>{FILE_NAME}</span>
        </>
      }
      footer={
        <button type="button" className={cx(s.btn, s.btnMain)} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className={s.props}>
        <h3>File</h3>
        <dl className={s.dl}>
          <dt>Name</dt>
          <dd>{FILE_NAME}</dd>
          <dt>Length</dt>
          <dd>{n0(size)} bytes</dd>
          <dt>Format</dt>
          <dd>pcapng</dd>
          <dt>Encapsulation</dt>
          <dd>Per packet</dd>
          <dt>Snapshot length</dt>
          <dd>262144</dd>
        </dl>
        <h3>Time</h3>
        <dl className={s.dl}>
          <dt>First packet</dt>
          <dd>{first ? arrival(first.epoch) : '—'}</dd>
          <dt>Last packet</dt>
          <dd>{last ? arrival(last.epoch) : '—'}</dd>
          <dt>Elapsed</dt>
          <dd>{`${String(Math.floor(span / 3600)).padStart(2, '0')}:${String(Math.floor((span % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(span % 60)).padStart(2, '0')}`}</dd>
        </dl>
        <h3>Capture</h3>
        <dl className={s.dl}>
          <dt>Application</dt>
          <dd>
            {concept('network-capture').letter} · {concept('network-capture').name}, on{' '}
            {db.person.site}
          </dd>
          <dt>Packet limit</dt>
          <dd>Stop after {n0(cap.limit)} packets</dd>
          <dt>Key log</dt>
          <dd>
            Traffic secrets for the site and the reader’s uplink; product sites stay encrypted
          </dd>
        </dl>
        <h3>Interfaces</h3>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Interface</th>
                <th>Description</th>
                <th className={s.num}>Packets</th>
                <th>Link type</th>
                <th className={s.num}>Dropped</th>
              </tr>
            </thead>
            <tbody>
              {IFACES.map((f, i) => (
                <tr key={f.name}>
                  <td className={s.mono}>{f.name}</td>
                  <td>{f.desc}</td>
                  <td className={s.num}>{n0(captured.filter((p) => p.iface === i).length)}</td>
                  <td>{f.link}</td>
                  <td className={s.num}>0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Statistics</h3>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Measurement</th>
                <th className={s.num}>Captured</th>
                <th className={s.num}>Displayed</th>
                <th className={s.num}>Marked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r}>
                  <td>{r}</td>
                  <td className={s.num}>{cs[i]}</td>
                  <td className={s.num}>
                    {ds[i]} {i === 0 ? `(${pct(displayed.length, captured.length)}%)` : ''}
                  </td>
                  <td className={s.num}>{i === 0 ? marked : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Capture file comments</h3>
        <p className={s.comment}>{db.lede}</p>
        <h3>Packet comments</h3>
        <ul className={s.commentList}>
          {comments.map((p) => (
            <li key={p.no}>
              <span className={s.mono}>Frame {p.no}:</span> {p.comment}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ colouring rules */

export function RulesDialog({
  rules,
  enabled,
  onSave,
  onClose,
}: {
  rules: ColorRule[];
  enabled: ReadonlySet<string>;
  onSave: (rules: ColorRule[], enabled: Set<string>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(rules.map((r) => ({ ...r })));
  const [on, setOn] = useState(new Set(enabled));
  const valid = draft.every((r) => compile(r.filter).ok);
  return (
    <Dialog
      size="lg"
      onClose={onClose}
      title="Coloring Rules · Default"
      footer={
        <>
          <button
            type="button"
            className={s.btn}
            onClick={() => (
              setDraft(COLOR_RULES.map((r) => ({ ...r }))),
              setOn(new Set(COLOR_RULES.map((r) => r.id)))
            )}
          >
            Restore defaults
          </button>
          <span className={s.grow} />
          <span className={s.dim}>
            {valid
              ? 'Rules are checked in order; the first match colours the packet.'
              : 'Fix the red filter before saving.'}
          </span>
          <button type="button" className={s.btn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cx(s.btn, s.btnMain)}
            disabled={!valid}
            onClick={() => onSave(draft, on)}
          >
            OK
          </button>
        </>
      }
    >
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>On</th>
              <th>Name</th>
              <th>Filter</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => {
              const res = compile(r.filter);
              return (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Enable ${r.name}`}
                      checked={on.has(r.id)}
                      onChange={(e) =>
                        setOn(
                          (o) =>
                            new Set(
                              e.target.checked ? [...o, r.id] : [...o].filter((x) => x !== r.id),
                            ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <span className={cx(s.swatch, s[`rule_${r.id}`])}>{r.name}</span>
                    {r.custom && <span className={s.dim}> (added)</span>}
                  </td>
                  <td className={s.ruleFilterCell}>
                    <input
                      className={cx(
                        s.ruleFilter,
                        s[
                          `filter_${!r.filter.trim() ? 'empty' : res.ok ? (res.warning ? 'warn' : 'ok') : 'bad'}`
                        ],
                      )}
                      value={r.filter}
                      spellCheck={false}
                      aria-label={`${r.name} filter`}
                      aria-invalid={!res.ok}
                      title={res.ok ? undefined : res.error}
                      onChange={(e) =>
                        setDraft((d) =>
                          d.map((x, j) => (j === i ? { ...x, filter: e.target.value } : x)),
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ small ones */

export function GoToDialog({
  max,
  onGo,
  onClose,
}: {
  max: number;
  onGo: (n: number) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState('');
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= 1 && n <= max;
  return (
    <Dialog size="sm" onClose={onClose} title="Go to Packet">
      <form
        className={s.gotoForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onGo(n);
        }}
      >
        <label className={s.field}>
          <span>Packet number (1–{max})</span>
          <input
            data-autofocus
            className={cx(s.textInput, v && s[`filter_${ok ? 'ok' : 'bad'}`])}
            inputMode="numeric"
            value={v}
            onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
            aria-invalid={!!v && !ok}
          />
        </label>
        <button type="submit" className={cx(s.btn, s.btnMain)} disabled={!ok}>
          Go to packet
        </button>
      </form>
    </Dialog>
  );
}

export const SHORTCUTS: [string, string][] = [
  ['Ctrl/⌘ F, Ctrl /', 'Focus the display filter'],
  ['Enter (in the filter)', 'Apply the filter'],
  ['Tab, ↑ ↓ (in the filter)', 'Pick a completed field name'],
  ['Ctrl/⌘ E', 'Start or stop the capture'],
  ['Ctrl →', 'Follow the selected packet’s stream'],
  ['Ctrl Alt Shift T / S / H / U', 'Follow TCP / TLS / HTTP / UDP stream'],
  ['↑ ↓, Page Up/Down, Home, End', 'Move in the packet list'],
  ['Ctrl ↑ ↓, F7 F8', 'Previous / next packet from anywhere'],
  ['Ctrl , / Ctrl .', 'Previous / next packet in the conversation'],
  ['Ctrl Home / End', 'First / last packet'],
  ['Ctrl/⌘ G', 'Go to packet by number'],
  ['Ctrl M', 'Mark or unmark the packet'],
  ['Enter (in the list)', 'Open the packet’s details'],
  ['← → (in details)', 'Collapse / expand; Shift for the whole subtree'],
  ['Enter (in details)', 'Follow a frame link or open a URL'],
  ['Shift F10, Menu key', 'Context menu'],
  ['Esc', 'Close a menu or dialog'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      size="md"
      onClose={onClose}
      title="Keyboard Shortcuts"
      footer={
        <button type="button" className={cx(s.btn, s.btnMain)} onClick={onClose}>
          Close
        </button>
      }
    >
      <table className={s.table}>
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td className={s.kbdCell}>
                <kbd className={s.kbd}>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

export function AboutDialog({ onClose, onRead }: { onClose: () => void; onRead: () => void }) {
  const c = concept('network-capture');
  return (
    <Dialog
      size="md"
      onClose={onClose}
      title={`About ${c.name}`}
      footer={
        <>
          <button type="button" className={s.btn} onClick={onRead}>
            <Icon name="page" /> Read as a page
          </button>
          <span className={s.grow} />
          <button type="button" className={cx(s.btn, s.btnMain)} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className={s.about}>
        <p className={s.aboutMark}>{c.letter}</p>
        <p>{c.thesis}</p>
        <p className={s.dim}>
          A packet analyser built for {db.person.site}: the frames are encoded byte by byte, the
          display filter is a real parser, and every value in the payloads comes from the site’s
          facts, last checked {fmt.month(db.asOf)}. Timing, sensor readings and keys are seeded
          texture.
        </p>
      </div>
    </Dialog>
  );
}
