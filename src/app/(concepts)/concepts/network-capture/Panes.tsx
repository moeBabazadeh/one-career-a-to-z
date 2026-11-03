'use client';

// The three panes: the packet list (sortable, coloured by rule, with the related-packet gutter
// and a minimap of the colours), the details tree (expansion shared by subtree type across
// packets, as in the real tool), and the bytes pane (hex or bits, with the selected field's bytes
// highlighted and a click on any byte selecting the field it belongs to).

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { fieldsOf } from './filter';
import { lookup } from './fields';
import { hexBytes, ip4, mac, type Node } from './net';
import type { Packet } from './trace';
import { cx } from './ui';
import s from './capture.module.scss';

/* ------------------------------------------------------------------ columns */

export interface Col {
  id: string;
  title: string;
  width: string;
  /** A custom column shows this field. */
  field?: string;
  right?: boolean;
}

export const BASE_COLS: Col[] = [
  { id: 'no', title: 'No.', width: '58px', right: true },
  { id: 'time', title: 'Time', width: '96px', right: true },
  { id: 'src', title: 'Source', width: 'minmax(110px, 1.1fr)' },
  { id: 'dst', title: 'Destination', width: 'minmax(110px, 1.1fr)' },
  { id: 'proto', title: 'Protocol', width: '96px' },
  { id: 'len', title: 'Length', width: '62px', right: true },
  { id: 'info', title: 'Info', width: 'minmax(240px, 4fr)' },
];

/** A field's value in a packet, as a column shows it. */
export function fieldText(p: Packet, f: string): string {
  const def = lookup(f);
  const occ = fieldsOf(p).get(def?.abbrev ?? f) ?? [];
  return occ
    .map(({ v }) => {
      if (v === undefined) return def?.abbrev ?? f;
      if (v instanceof Uint8Array)
        return def?.type === 'ether' ? mac(v) : hexBytes(v.subarray(0, 24));
      if (typeof v === 'number' && def?.type === 'ipv4') return ip4(v);
      if (typeof v === 'number' && def?.type === 'f') return String(+v.toFixed(6));
      return String(v);
    })
    .join(',');
}

export const addrText = (a: { addr: string; name?: string }, resolve: boolean) =>
  resolve && a.name ? a.name : a.addr;

/* ------------------------------------------------------------------ packet list */

export type SortCol = { id: string; desc: boolean } | null;

interface RowProps {
  p: Packet;
  rule: string | null;
  sel: boolean;
  mark: boolean;
  rel?: string;
  time: string;
  resolve: boolean;
  custom: string[];
  cols: Col[];
}

const Row = memo(function Row({ p, rule, sel, mark, rel, time, resolve, custom, cols }: RowProps) {
  let ci = 0;
  const textOf = (c: Col) => {
    switch (c.id) {
      case 'no':
        return String(p.no);
      case 'time':
        return time;
      case 'src':
        return addrText(p.src, resolve);
      case 'dst':
        return addrText(p.dst, resolve);
      case 'proto':
        return p.proto;
      case 'len':
        return String(p.len);
      case 'info':
        return p.info;
      default:
        return custom[ci++];
    }
  };
  const cell = (c: Col) => {
    const text = textOf(c);
    return (
      <span
        key={c.id}
        role="gridcell"
        className={cx(s.cell, s[`c_${c.id}`], c.right && s.right, c.field && s.c_custom)}
        title={c.id === 'info' ? text : undefined}
      >
        {text}
      </span>
    );
  };
  return (
    <div
      role="row"
      id={`pkt-${p.no}`}
      data-no={p.no}
      aria-selected={sel}
      className={cx(s.row, rule && s[`rule_${rule}`], mark && s.marked, sel && s.rowSel)}
    >
      <span role="gridcell" className={s.gutter} aria-hidden="true">
        {rel}
      </span>
      {cols.map((c, i) => {
        // Source and destination share a wrapper: invisible to the desktop grid, one line on phones.
        if (c.id === 'src' && cols[i + 1]?.id === 'dst') {
          return (
            <span key="addrs" className={s.addrs}>
              {cell(c)}
              {cell(cols[i + 1])}
            </span>
          );
        }
        if (c.id === 'dst' && cols[i - 1]?.id === 'src') return null;
        return cell(c);
      })}
    </div>
  );
});

interface ListProps {
  rows: Packet[];
  selected: number | null;
  onSelect: (no: number, via: 'pointer' | 'key') => void;
  onOpen: (no: number) => void;
  onContext: (no: number, x: number, y: number) => void;
  onHeaderContext: (col: Col, x: number, y: number) => void;
  ruleOf: (p: Packet) => string | null;
  marked: ReadonlySet<number>;
  related: ReadonlyMap<number, string>;
  resolve: boolean;
  timeOf: (p: Packet, i: number) => string;
  sort: SortCol;
  onSort: (id: string) => void;
  cols: Col[];
  listRef: RefObject<HTMLDivElement | null>;
  onUserScroll: () => void;
  empty: string;
}

export function PacketList({
  rows,
  selected,
  onSelect,
  onOpen,
  onContext,
  onHeaderContext,
  ruleOf,
  marked,
  related,
  resolve,
  timeOf,
  sort,
  onSort,
  cols,
  listRef,
  onUserScroll,
  empty,
}: ListProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const template = `20px ${cols.map((c) => c.width).join(' ')}`;
  const index = useMemo(() => new Map(rows.map((p, i) => [p.no, i])), [rows]);

  // The minimap: each displayed packet's colour, run-length encoded into one gradient.
  const gradient = useMemo(() => {
    if (!rows.length) return 'none';
    const stops: string[] = [];
    let start = 0;
    const colorOf = (p: Packet) =>
      marked.has(p.no) ? 'var(--marked-bg)' : `var(--rule-${ruleOf(p) ?? 'none'}-bg)`;
    for (let i = 1; i <= rows.length; i++) {
      if (i === rows.length || colorOf(rows[i]) !== colorOf(rows[start])) {
        stops.push(
          `${colorOf(rows[start])} ${((start / rows.length) * 100).toFixed(3)}% ${((i / rows.length) * 100).toFixed(3)}%`,
        );
        start = i;
      }
    }
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
  }, [rows, ruleOf, marked]);

  const syncViewport = () => {
    const el = listRef.current;
    const v = viewport.current;
    if (!el || !v) return;
    const h = el.scrollHeight || 1;
    v.style.top = `${(el.scrollTop / h) * 100}%`;
    v.style.height = `${Math.max(2, (el.clientHeight / h) * 100)}%`;
  };
  useLayoutEffect(syncViewport);

  // Keep the selected row in view when the selection moves.
  useEffect(() => {
    if (selected === null) return;
    document.getElementById(`pkt-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const move = (to: number) => {
    const p = rows[Math.max(0, Math.min(rows.length - 1, to))];
    if (p) onSelect(p.no, 'key');
  };
  const onKey = (e: React.KeyboardEvent) => {
    const at = selected !== null ? (index.get(selected) ?? -1) : -1;
    const page = Math.max(1, Math.floor((listRef.current?.clientHeight ?? 400) / 22) - 1);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at < 0 ? rows.length - 1 : at - 1);
    else if (e.key === 'PageDown') move(at + page);
    else if (e.key === 'PageUp') move(at - page);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(rows.length - 1);
    else if (e.key === 'Enter' && selected !== null) onOpen(selected);
    else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && selected !== null) {
      const r = document.getElementById(`pkt-${selected}`)?.getBoundingClientRect();
      onContext(selected, (r?.left ?? 0) + 80, r?.bottom ?? 0);
    } else return;
    e.preventDefault();
    onUserScroll();
  };
  const rowOf = (e: React.MouseEvent) =>
    Number((e.target as Element).closest<HTMLElement>('[data-no]')?.dataset.no ?? NaN);

  return (
    <div className={s.listPane}>
      <div className={s.listHead} role="row" style={{ gridTemplateColumns: template }}>
        <span className={s.gutter} />
        {cols.map((c) => (
          <button
            key={c.id}
            type="button"
            role="columnheader"
            aria-sort={sort?.id === c.id ? (sort.desc ? 'descending' : 'ascending') : 'none'}
            className={cx(s.colHead, c.right && s.right, s[`h_${c.id}`])}
            onClick={() => onSort(c.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onHeaderContext(c, e.clientX, e.clientY);
            }}
            title={c.field ? `${c.field} (custom column)` : undefined}
          >
            {c.title}
            {sort?.id === c.id && <span className={s.sortMark}>{sort.desc ? '▾' : '▴'}</span>}
          </button>
        ))}
      </div>
      <div
        ref={listRef}
        className={s.list}
        role="grid"
        aria-label="Packet list"
        aria-rowcount={rows.length}
        aria-activedescendant={
          selected !== null && index.has(selected) ? `pkt-${selected}` : undefined
        }
        tabIndex={0}
        style={{ ['--cols' as string]: template }}
        onKeyDown={onKey}
        onScroll={syncViewport}
        onWheel={onUserScroll}
        onTouchStart={onUserScroll}
        onClick={(e) => {
          const no = rowOf(e);
          if (!Number.isNaN(no)) onSelect(no, 'pointer');
        }}
        onDoubleClick={(e) => {
          const no = rowOf(e);
          if (!Number.isNaN(no)) onOpen(no);
        }}
        onContextMenu={(e) => {
          const no = rowOf(e);
          if (Number.isNaN(no)) return;
          e.preventDefault();
          onSelect(no, 'pointer');
          onContext(no, e.clientX, e.clientY);
        }}
      >
        {rows.length === 0 && <div className={s.listEmpty}>{empty}</div>}
        {rows.map((p, i) => (
          <Row
            key={p.no}
            p={p}
            rule={ruleOf(p)}
            sel={p.no === selected}
            mark={marked.has(p.no)}
            rel={related.get(p.no)}
            time={timeOf(p, i)}
            resolve={resolve}
            custom={cols.filter((c) => c.field).map((c) => fieldText(p, c.field as string))}
            cols={cols}
          />
        ))}
      </div>
      <div
        className={s.minimap}
        style={{ background: gradient }}
        aria-hidden="true"
        onPointerDown={(e) => {
          const el = listRef.current;
          if (!el) return;
          const r = e.currentTarget.getBoundingClientRect();
          el.scrollTop = ((e.clientY - r.top) / r.height) * el.scrollHeight - el.clientHeight / 2;
          onUserScroll();
        }}
      >
        <div ref={viewport} className={s.minimapView} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ details tree */

/** The key a subtree's open state is stored under: shared by every packet with that subtree. */
export const ettOf = (n: Node) =>
  n.e ?? (n.f ? `f:${n.f}` : `t:${n.t.replace(/[0-9a-f]{2,}|\d+/gi, '#')}`);

export interface Visible {
  node: Node;
  depth: number;
  path: string;
  open: boolean;
  parent: string | null;
}

export function flatten(
  nodes: Node[],
  expanded: ReadonlySet<string>,
  depth = 0,
  prefix = '',
  out: Visible[] = [],
): Visible[] {
  nodes.forEach((n, i) => {
    if (n.h) return;
    const path = prefix ? `${prefix}.${i}` : String(i);
    const kids = n.k?.some((k) => !k.h);
    const open = !!kids && expanded.has(ettOf(n));
    out.push({ node: n, depth, path, open, parent: prefix || null });
    if (open) flatten(n.k as Node[], expanded, depth + 1, path, out);
  });
  return out;
}

export function nodeAt(nodes: Node[], path: string): Node | null {
  let list = nodes;
  let node: Node | null = null;
  for (const i of path.split('.').map(Number)) {
    node = list[i] ?? null;
    if (!node) return null;
    list = node.k ?? [];
  }
  return node;
}

/** Every subtree key at and under a node, for Expand Subtrees. */
export function ettsUnder(n: Node, out = new Set<string>()) {
  if (n.k?.length) {
    out.add(ettOf(n));
    n.k.forEach((k) => ettsUnder(k, out));
  }
  return out;
}

interface DetailsProps {
  packet: Packet | undefined;
  expanded: ReadonlySet<string>;
  setOpen: (keys: Iterable<string>, open: boolean) => void;
  sel: string | null;
  onSelect: (path: string, node: Node) => void;
  onActivate: (node: Node) => void;
  onContext: (path: string, node: Node, x: number, y: number) => void;
  marked: boolean;
  rule: { name: string; filter: string } | null;
  treeRef: RefObject<HTMLDivElement | null>;
}

const SEV_CLASS: Record<string, string> = {
  comment: 'xComment',
  chat: 'xChat',
  note: 'xNote',
  warn: 'xWarn',
  error: 'xError',
};

function labelOf(n: Node, marked: boolean, rule: DetailsProps['rule']) {
  if (n.f === 'frame.marked') return `[Frame is marked: ${marked ? 'True' : 'False'}]`;
  if (n.f === 'frame.coloring_rule.name') return `[Coloring Rule Name: ${rule?.name ?? ''}]`;
  if (n.f === 'frame.coloring_rule.string') return `[Coloring Rule String: ${rule?.filter ?? ''}]`;
  return n.t;
}

export const Details = memo(function Details({
  packet,
  expanded,
  setOpen,
  sel,
  onSelect,
  onActivate,
  onContext,
  marked,
  rule,
  treeRef,
}: DetailsProps) {
  const rows = useMemo(() => (packet ? flatten(packet.tree, expanded) : []), [packet, expanded]);
  const at = rows.findIndex((r) => r.path === sel);

  useEffect(() => {
    if (sel === null) return;
    document.getElementById(`fld-${sel}`)?.scrollIntoView({ block: 'nearest' });
  }, [sel, packet]);

  if (!packet) return <div className={s.empty}>Select a packet to see its layers.</div>;

  const pick = (i: number) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (r) onSelect(r.path, r.node);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cur = rows[at];
    if (e.key === 'ArrowDown') pick(at + 1);
    else if (e.key === 'ArrowUp') pick(at < 0 ? 0 : at - 1);
    else if (e.key === 'Home') pick(0);
    else if (e.key === 'End') pick(rows.length - 1);
    else if (e.key === 'ArrowRight' && cur) {
      const kids = cur.node.k?.some((k) => !k.h);
      if (e.shiftKey && kids) setOpen(ettsUnder(cur.node), true);
      else if (kids && !cur.open) setOpen([ettOf(cur.node)], true);
      else if (cur.open) pick(at + 1);
    } else if (e.key === 'ArrowLeft' && cur) {
      if (e.shiftKey && cur.open) setOpen(ettsUnder(cur.node), false);
      else if (cur.open) setOpen([ettOf(cur.node)], false);
      else if (cur.parent !== null) {
        const parent = rows.find((r) => r.path === cur.parent);
        if (parent) onSelect(parent.path, parent.node);
      }
    } else if (e.key === 'Enter' && cur) onActivate(cur.node);
    else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && cur) {
      const r = document.getElementById(`fld-${cur.path}`)?.getBoundingClientRect();
      onContext(cur.path, cur.node, (r?.left ?? 0) + 60, r?.bottom ?? 0);
    } else return;
    e.preventDefault();
  };

  return (
    <div
      ref={treeRef}
      className={s.tree}
      role="tree"
      aria-label="Packet details"
      tabIndex={0}
      aria-activedescendant={at >= 0 ? `fld-${sel}` : undefined}
      onKeyDown={onKey}
    >
      {rows.map((r) => {
        const n = r.node;
        const kids = n.k?.some((k) => !k.h);
        const selected = r.path === sel;
        return (
          <div
            key={r.path}
            id={`fld-${r.path}`}
            role="treeitem"
            aria-level={r.depth + 1}
            aria-expanded={kids ? r.open : undefined}
            aria-selected={selected}
            className={cx(
              s.treeRow,
              selected && s.treeSel,
              n.x && s[SEV_CLASS[n.x.sev]],
              !!(n.go || n.url) && s.treeLink,
              r.depth === 0 && s.treeTop,
            )}
            style={{ paddingLeft: 6 + r.depth * 16 }}
            onClick={() => onSelect(r.path, n)}
            onDoubleClick={() => onActivate(n)}
            onContextMenu={(e) => {
              e.preventDefault();
              onSelect(r.path, n);
              onContext(r.path, n, e.clientX, e.clientY);
            }}
          >
            <span
              className={cx(s.twisty, r.open && s.twistyOpen)}
              aria-hidden="true"
              onClick={(e) => {
                if (!kids) return;
                e.stopPropagation();
                setOpen(e.shiftKey ? ettsUnder(n) : [ettOf(n)], !r.open);
                onSelect(r.path, n);
              }}
            >
              {kids ? '▸' : ''}
            </span>
            <span className={s.treeLabel}>{labelOf(n, marked, rule)}</span>
            {selected && (n.go || n.url) && (
              <button
                type="button"
                className={s.treeAction}
                onClick={(e) => {
                  e.stopPropagation();
                  onActivate(n);
                }}
              >
                {n.go ? `Go to frame ${n.go}` : 'Open link ↗'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
});

/* ------------------------------------------------------------------ bytes */

export type ByteMode = 'hex' | 'bits';

/** The deepest visible field covering a byte of one source. */
export function fieldAt(
  nodes: Node[],
  src: number,
  offset: number,
  prefix = '',
): { path: string; node: Node } | null {
  let best: { path: string; node: Node } | null = null;
  nodes.forEach((n, i) => {
    if (n.h) return;
    const path = prefix ? `${prefix}.${i}` : String(i);
    const inside = (n.s ?? 0) === src && n.n > 0 && offset >= n.o && offset < n.o + n.n;
    if (inside) best = { path, node: n };
    if (n.k) {
      const deeper = fieldAt(n.k, src, offset, path);
      if (deeper && (inside || !best)) best = deeper;
    }
  });
  return best;
}

const NARROW = '(max-width: 560px)';
const subscribeNarrow = (cb: () => void) => {
  const q = matchMedia(NARROW);
  q.addEventListener('change', cb);
  return () => q.removeEventListener('change', cb);
};
/** Phones get eight bytes a row, so the hex and ASCII both fit. */
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

/** Where byte j of a row starts in the hex text, in characters. */
const hexCol = (j: number, mode: ByteMode, per: number) =>
  mode === 'bits' ? j * 9 : per === 8 || j < 8 ? j * 3 : 25 + (j - 8) * 3;
const ascCol = (j: number, mode: ByteMode, per: number) =>
  mode === 'bits' || per === 8 || j < 8 ? j : j + 1;

function marked3(text: string, a: number, b: number) {
  if (a >= b) return text;
  return (
    <>
      {text.slice(0, a)}
      <mark className={s.hl}>{text.slice(a, b)}</mark>
      {text.slice(b)}
    </>
  );
}

const ByteRow = memo(function ByteRow({
  off,
  bytes,
  from,
  to,
  mode,
  per,
}: {
  off: number;
  bytes: Uint8Array;
  from: number;
  to: number;
  mode: ByteMode;
  per: number;
}) {
  const split = mode === 'hex' && per === 16;
  const hexText = Array.from(bytes, (b, j) =>
    mode === 'bits'
      ? b.toString(2).padStart(8, '0') + ' '
      : b.toString(16).padStart(2, '0') + (split && j === 7 ? '  ' : ' '),
  ).join('');
  const ascText = Array.from(
    bytes,
    (b, j) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·') + (split && j === 7 ? ' ' : ''),
  ).join('');
  const a = Math.max(from - off, 0);
  const z = Math.min(to - off, bytes.length);
  const on = a < z;
  return (
    <div className={s.byteRow} data-off={off}>
      <span className={s.byteOff}>{off.toString(16).padStart(4, '0')}</span>
      <span className={s.byteHex} data-part="hex">
        {on
          ? marked3(
              hexText,
              hexCol(a, mode, per),
              hexCol(z - 1, mode, per) + (mode === 'bits' ? 8 : 2),
            )
          : hexText}
      </span>
      <span className={s.byteAsc} data-part="asc">
        {on ? marked3(ascText, ascCol(a, mode, per), ascCol(z - 1, mode, per) + 1) : ascText}
      </span>
    </div>
  );
});

interface BytesProps {
  packet: Packet | undefined;
  tab: number;
  setTab: (i: number) => void;
  hl: { s: number; o: number; n: number } | null;
  mode: ByteMode;
  setMode: (m: ByteMode) => void;
  onPick: (src: number, offset: number) => void;
  onHover: (src: number, offset: number | null) => void;
}

export const Bytes = memo(function Bytes({
  packet,
  tab,
  setTab,
  hl,
  mode,
  setMode,
  onPick,
  onHover,
}: BytesProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLSpanElement>(null);
  const narrow = useNarrow();
  const src = packet?.srcs[tab];
  const per = mode === 'bits' || narrow ? 8 : 16;
  const from = hl && hl.s === tab ? hl.o : -1;
  const to = hl && hl.s === tab ? hl.o + hl.n : -1;

  // Bring the highlighted bytes into view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || from < 0) return;
    const row = el.querySelector<HTMLElement>(`[data-off="${Math.floor(from / per) * per}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [from, per, tab, packet]);

  if (!packet || !src)
    return <div className={s.empty}>The selected packet’s bytes appear here.</div>;

  const byteFrom = (e: React.PointerEvent | React.MouseEvent): number | null => {
    const part = (e.target as Element).closest<HTMLElement>('[data-part]');
    const row = (e.target as Element).closest<HTMLElement>('[data-off]');
    if (!part || !row || !meter.current) return null;
    const cw = meter.current.getBoundingClientRect().width / 10;
    const col = Math.floor((e.clientX - part.getBoundingClientRect().left) / cw);
    let j: number;
    if (part.dataset.part === 'hex') {
      if (mode === 'bits') j = Math.floor(col / 9);
      else if (per === 8 || col < 24) j = Math.floor(col / 3);
      else if (col >= 25) j = 8 + Math.floor((col - 25) / 3);
      else return null;
    } else {
      j = mode === 'bits' || per === 8 ? col : col < 8 ? col : col > 8 ? col - 1 : -1;
      if (j < 0) return null;
    }
    const off = Number(row.dataset.off) + j;
    return j >= 0 && j < per && off < src.bytes.length ? off : null;
  };

  const rows = [];
  for (let off = 0; off < src.bytes.length; off += per)
    rows.push(
      <ByteRow
        key={off}
        off={off}
        bytes={src.bytes.subarray(off, off + per)}
        from={from}
        to={to}
        mode={mode}
        per={per}
      />,
    );

  return (
    <div className={s.bytesPane}>
      <div className={s.bytesTabs} role="tablist" aria-label="Byte sources">
        {packet.srcs.map((x, i) => (
          <button
            key={x.label}
            type="button"
            role="tab"
            aria-selected={i === tab}
            className={cx(s.bytesTab, i === tab && s.bytesTabOn)}
            onClick={() => setTab(i)}
          >
            {x.label}
          </button>
        ))}
        <span className={s.grow} />
        <button
          type="button"
          className={s.bytesMode}
          aria-pressed={mode === 'bits'}
          onClick={() => setMode(mode === 'hex' ? 'bits' : 'hex')}
          title="Show bytes as hexadecimal or bits"
        >
          {mode === 'hex' ? 'Hex' : 'Bits'}
        </button>
      </div>
      <div
        ref={scroller}
        className={s.bytes}
        role="region"
        aria-label={`${src.label}, ${mode === 'hex' ? 'hex' : 'bits'} and ASCII`}
        tabIndex={0}
        onClick={(e) => {
          const off = byteFrom(e);
          if (off !== null) onPick(tab, off);
        }}
        onPointerMove={(e) => onHover(tab, byteFrom(e))}
        onPointerLeave={() => onHover(tab, null)}
      >
        <span ref={meter} className={s.meter} aria-hidden="true">
          0000000000
        </span>
        {rows}
      </div>
    </div>
  );
});
