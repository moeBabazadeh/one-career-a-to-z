'use client';

// N · Network Capture. A packet analyser opened on a live, merged capture of the career: the
// visitor fetching it from the site, an Attendum reader and its beacon, logger stations on GSM,
// and the Mini PLC polling the EPC. Capture runs in real time from a seeded trace; everything
// else (filter, dissection, bytes, Follow, statistics) works on the packets themselves.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { concept } from '../_shared/concepts';
import { db, profile } from '../_shared/data';
import { useAnimationFrame, useReducedMotion } from '../_shared/hooks';
import { API } from './career';
import {
  AboutDialog,
  ConversationsDialog,
  EndpointsDialog,
  ExpertDialog,
  FILE_NAME,
  FollowDialog,
  GoToDialog,
  HierarchyDialog,
  PropertiesDialog,
  RulesDialog,
  ShortcutsDialog,
} from './Dialogs';
import FilterBar, { type FilterButton } from './FilterBar';
import { lookup } from './fields';
import { COLOR_RULES, compile, fieldsOf, filterFor, type ColorRule, type Ctx } from './filter';
import { clock, ip4, isoDay, mac, type Node } from './net';
import {
  BASE_COLS,
  Bytes,
  Details,
  PacketList,
  ettOf,
  ettsUnder,
  fieldAt,
  fieldText,
  nodeAt,
  type ByteMode,
  type Col,
  type SortCol,
} from './Panes';
import Reader from './Reader';
import { SEV_ORDER, expertInfo, followKinds, type FollowKind } from './stats';
import { IFACES, buildCapture, type Capture as Cap, type Packet } from './trace';
import { Icon, Popup, cx, type MenuItem } from './ui';
import s from './capture.module.scss';

const LIMIT = 1000;
const C = concept('network-capture');

const DEFAULT_EXPANDED = [
  'http',
  'json',
  'json.object',
  'json.array',
  'json.member',
  'json.item',
  'mqtt',
  'mbtcp',
  'modbus',
  'epc',
  'btatt',
  'btcommon.eir_ad',
  'dns',
  'dns.queries',
  'dns.answers',
  'tls',
  'tls.record',
  'tls.segments',
  'pkt_comment',
  'frame.comment',
  'ntp',
  'arp',
  'btle.link_layer_data',
];

const q = (v: string) => JSON.stringify(v);
const BUTTONS: FilterButton[] = [
  { label: 'Career API', filter: `http && ip.addr == ${db.person.site}` },
  {
    label: 'Roles',
    filter: `http.request.uri == ${q(API.roles.path)} || http.response_for.uri == ${q(API.roles.path)}`,
  },
  {
    label: 'Projects',
    filter: `http.response_for.uri in {${q(API.projects.path)} ${q(API.builds.path)}}`,
  },
  { label: 'Education', filter: `http.response_for.uri == ${q(API.education.path)}` },
  {
    label: 'Hardware',
    filter: `frame.interface_name in {${IFACES.slice(1)
      .map((i) => q(i.name))
      .join(' ')}}`,
  },
  { label: 'Open source', filter: 'json.value.string contains "/pull/"' },
  { label: 'Contact', filter: 'json.path in {"/email" "/linkedin" "/github" "/cv"}' },
  { label: 'Telemetry', filter: 'mqtt.topic matches "/telemetry$"' },
  { label: 'Bad TCP', filter: 'tcp.analysis.flags' },
];

type TimeFmt = 'rel' | 'delta' | 'tod' | 'utc';
type DialogState =
  | { kind: 'follow'; follow: FollowKind; stream: number }
  | {
      kind: 'phs' | 'conv' | 'endpoints' | 'expert' | 'props' | 'rules' | 'goto' | 'keys' | 'about';
    };

interface MenuState {
  items: MenuItem[];
  x: number;
  y: number;
  label: string;
  top?: number;
}

// The colouring rule each packet matched, cached per rule set.
const ruleCache = new WeakMap<Packet, { key: string; rule: ColorRule | null }>();

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Storage can be blocked; the choice holds for this visit.
  }
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CaptureApp() {
  const reduced = useReducedMotion();
  const [cap, setCap] = useState<Cap | null>(null);
  const [count, setCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [fsel, setFsel] = useState<{ path: string; f?: string; t: string } | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(DEFAULT_EXPANDED));
  const [text, setText] = useState('');
  const [applied, setApplied] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [custom, setCustom] = useState<FilterButton[]>([]);
  const [sort, setSort] = useState<SortCol>(null);
  const [marked, setMarked] = useState<ReadonlySet<number>>(() => new Set());
  const [colorize, setColorize] = useState(true);
  const [rules, setRules] = useState<ColorRule[]>(COLOR_RULES);
  const [rulesOn, setRulesOn] = useState<ReadonlySet<string>>(
    () => new Set(COLOR_RULES.map((r) => r.id)),
  );
  const [resolve, setResolve] = useState(true);
  const [timeFmt, setTimeFmt] = useState<TimeFmt>('rel');
  const [autoScroll, setAutoScroll] = useState(true);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [reading, setReading] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [tab, setTab] = useState<'list' | 'details' | 'bytes'>('list');
  const [byteTab, setByteTab] = useState(0);
  const [byteMode, setByteMode] = useState<ByteMode>('hex');
  const [cols, setCols] = useState<Col[]>(BASE_COLS);
  const [sizes, setSizes] = useState<[number, number, number]>([0.44, 0.32, 0.24]);
  const [status, setStatus] = useState<string | null>(null);
  const [followBack, setFollowBack] = useState('');

  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef(0);
  const lastFrame = useRef(0);
  const touched = useRef(false);
  const built = useRef(false);
  const statusTimer = useRef(0);

  /* ---------------- the capture ---------------- */

  // Build the trace after first paint, then start capturing (or open it whole, for reduced motion).
  useEffect(() => {
    if (built.current) return;
    const id = window.setTimeout(() => {
      built.current = true;
      const c = buildCapture(LIMIT);
      setCap(c);
      setRecent(load<string[]>('nc-recent', []));
      setCustom(load<FilterButton[]>('nc-buttons', []));
      if (reduced) {
        setCount(c.packets.length);
        setStopReason('Opened as a file: motion is reduced');
      } else {
        clockRef.current = 0;
        setRunning(true);
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [reduced]);

  const intro = useMemo(
    () => cap?.packets.find((p) => p.comment && p.protos.includes('json')),
    [cap],
  );

  useAnimationFrame((sec) => {
    if (!cap) return;
    const dt = lastFrame.current ? Math.min(0.1, sec - lastFrame.current) : 0;
    lastFrame.current = sec;
    clockRef.current += dt;
    let n = count;
    while (n < cap.packets.length && cap.packets[n].t <= clockRef.current) n++;
    if (n !== count) {
      setCount(n);
      // First time through, open the profile response so the details pane has something to say.
      if (!touched.current && intro && n >= intro.no) {
        touched.current = true;
        setSelected(intro.no);
        const path = pathWhere(
          intro.tree,
          (x) => x.f === 'json.member_with_value' && String(x.v).startsWith('title:'),
        );
        if (path)
          setFsel({ path, f: 'json.member_with_value', t: (nodeAt(intro.tree, path) as Node).t });
      }
    }
    if (n >= cap.packets.length) {
      setRunning(false);
      lastFrame.current = 0;
      setStopReason(`Capture stopped: reached the packet limit (${cap.limit})`);
    }
  }, running && !!cap);

  const start = useCallback(() => {
    if (!cap) return;
    clockRef.current = 0;
    lastFrame.current = 0;
    setCount(0);
    setSelected(null);
    setFsel(null);
    setMarked(new Set());
    setStopReason(null);
    setAutoScroll(true);
    setRunning(true);
  }, [cap]);
  const stop = useCallback(() => {
    setRunning(false);
    lastFrame.current = 0;
    setStopReason('Capture stopped');
  }, []);
  const toggleCapture = () => (running ? stop() : start());

  const flash = (msg: string) => {
    setStatus(msg);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 4000);
  };

  /* ---------------- filtering, colouring, sorting ---------------- */

  const captured = useMemo(() => (cap ? cap.packets.slice(0, count) : []), [cap, count]);
  const activeRules = useMemo(
    () =>
      rules
        .filter((r) => rulesOn.has(r.id))
        .map((r) => ({ r, c: compile(r.filter) }))
        .filter((x) => x.c.ok && x.c.filter),
    [rules, rulesOn],
  );
  const rulesKey = useMemo(
    () => activeRules.map((x) => `${x.r.id}:${x.r.filter}`).join('|'),
    [activeRules],
  );
  const matchRule = useCallback(
    (p: Packet): ColorRule | null => {
      const hit = ruleCache.get(p);
      if (hit && hit.key === rulesKey) return hit.rule;
      const found = activeRules.find((x) => x.c.ok && x.c.filter?.test(p))?.r ?? null;
      ruleCache.set(p, { key: rulesKey, rule: found });
      return found;
    },
    [activeRules, rulesKey],
  );
  const ruleOf = useCallback(
    (p: Packet) => (colorize ? (matchRule(p)?.id ?? null) : null),
    [colorize, matchRule],
  );
  const ctx: Ctx = useMemo(
    () => ({ marked: (p) => marked.has(p.no), rule: (p) => matchRule(p) }),
    [marked, matchRule],
  );

  const appliedRes = compile(applied);
  const flt = appliedRes.ok ? appliedRes.filter : null;
  const matched = useMemo(
    () => (flt ? captured.filter((p) => flt.test(p, ctx)) : captured),
    [captured, flt, ctx],
  );
  const displayed = useMemo(() => {
    if (!sort) return matched;
    const col = cols.find((c) => c.id === sort.id);
    const key = (p: Packet): number | string => {
      switch (sort.id) {
        case 'no':
          return p.no;
        case 'time':
          return p.t;
        case 'len':
          return p.len;
        case 'src':
          return resolve ? (p.src.name ?? p.src.addr) : p.src.addr;
        case 'dst':
          return resolve ? (p.dst.name ?? p.dst.addr) : p.dst.addr;
        case 'proto':
          return p.proto;
        case 'info':
          return p.info;
        default: {
          const v = col?.field ? fieldText(p, col.field) : '';
          return v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
        }
      }
    };
    const out = [...matched].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const c =
        typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return c || a.no - b.no;
    });
    return sort.desc ? out.reverse() : out;
  }, [matched, sort, cols, resolve]);

  const timeOf = useCallback(
    (p: Packet, i: number) => {
      if (timeFmt === 'delta') return (i > 0 ? p.t - displayed[i - 1].t : 0).toFixed(6);
      if (timeFmt === 'tod') return clock(p.epoch);
      if (timeFmt === 'utc') return `${isoDay(p.epoch)} ${clock(p.epoch)}`;
      return p.t.toFixed(6);
    },
    [timeFmt, displayed],
  );

  // Follow the newest packet while capturing, until the visitor scrolls or picks something.
  useEffect(() => {
    const el = listRef.current;
    if (el && autoScroll && running && !sort) el.scrollTop = el.scrollHeight;
  }, [count, autoScroll, running, sort]);

  /* ---------------- selection ---------------- */

  const packet =
    selected !== null && selected <= count && cap ? cap.packets[selected - 1] : undefined;
  const resolved = useMemo(() => {
    if (!packet || !fsel) return null;
    const at = nodeAt(packet.tree, fsel.path);
    if (at && (at.f ?? at.t) === (fsel.f ?? fsel.t)) return { path: fsel.path, node: at };
    if (fsel.f) {
      const path = pathWhere(packet.tree, (x) => x.f === fsel.f && !x.h);
      if (path) return { path, node: nodeAt(packet.tree, path) as Node };
    }
    return null;
  }, [packet, fsel]);
  const srcCount = packet?.srcs.length ?? 1;
  const activeByteTab =
    resolved && resolved.node.n > 0 && (resolved.node.s ?? 0) < srcCount
      ? (resolved.node.s ?? 0)
      : Math.min(byteTab, srcCount - 1);
  const hl =
    resolved && resolved.node.n > 0
      ? { s: resolved.node.s ?? 0, o: resolved.node.o, n: resolved.node.n }
      : null;
  const rule = packet ? matchRule(packet) : null;

  const selectPacket = useCallback((no: number, via: 'pointer' | 'key' | 'jump' = 'jump') => {
    touched.current = true;
    void via;
    setAutoScroll(false);
    setSelected(no);
  }, []);

  const onListSelect = (no: number, via: 'pointer' | 'key') => {
    if (via === 'pointer' && no === selected && window.matchMedia('(max-width: 760px)').matches)
      setTab('details');
    selectPacket(no, via);
  };

  const jump = (no: number) => {
    if (!cap || no < 1 || no > count) return flash(`Frame ${no} hasn’t been captured yet.`);
    if (!displayed.some((p) => p.no === no)) {
      setText('');
      setApplied('');
    }
    selectPacket(no);
    setDialog(null);
  };

  const step = (by: number) => {
    const at = displayed.findIndex((p) => p.no === selected);
    const next =
      displayed[
        at < 0
          ? by > 0
            ? 0
            : displayed.length - 1
          : Math.max(0, Math.min(displayed.length - 1, at + by))
      ];
    if (next) selectPacket(next.no);
  };
  const edge = (last: boolean) => {
    const p = displayed[last ? displayed.length - 1 : 0];
    if (p) selectPacket(p.no);
  };
  const inConversation = (by: 1 | -1) => {
    if (!packet) return;
    const same = (p: Packet) =>
      packet.tcp !== undefined
        ? p.tcp === packet.tcp
        : packet.udp !== undefined
          ? p.udp === packet.udp
          : p.iface === packet.iface && p.src.addr === packet.src.addr;
    const list =
      by > 0
        ? displayed.filter((p) => p.no > packet.no && same(p))
        : displayed.filter((p) => p.no < packet.no && same(p)).reverse();
    if (list[0]) selectPacket(list[0].no);
  };

  const selectField = (path: string, node: Node) => {
    setFsel({ path, f: node.f, t: node.t });
    if (node.n > 0) setByteTab(node.s ?? 0);
  };
  const setOpen = useCallback((keys: Iterable<string>, open: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (open) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);
  const activate = (n: Node) => {
    if (n.go) jump(n.go);
    else if (n.url) window.open(n.url, '_blank', 'noopener');
  };
  const pickByte = (src: number, offset: number) => {
    if (!packet) return;
    const hit = fieldAt(packet.tree, src, offset);
    if (!hit) return;
    const parts = hit.path.split('.');
    const keys: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const anc = nodeAt(packet.tree, parts.slice(0, i).join('.'));
      if (anc) keys.push(ettOf(anc));
    }
    setOpen(keys, true);
    setFsel({ path: hit.path, f: hit.node.f, t: hit.node.t });
    setByteTab(src);
  };
  const hoverByte = (src: number, offset: number | null) => {
    const el = hoverRef.current;
    if (!el) return;
    const hit = packet && offset !== null ? fieldAt(packet.tree, src, offset) : null;
    el.textContent = hit ? fieldStatus(hit.node) : '';
  };

  const toggleMark = (no = selected) => {
    if (no === null) return;
    setMarked((m) => {
      const next = new Set(m);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  };

  /* ---------------- filters ---------------- */

  const apply = useCallback((t: string) => {
    const r = compile(t);
    if (!r.ok) return;
    setApplied(t);
    setText(t);
    if (t.trim()) {
      setRecent((list) => {
        const next = [t, ...list.filter((x) => x !== t)].slice(0, 12);
        save('nc-recent', next);
        return next;
      });
    }
  }, []);
  const buttons = useMemo(() => [...BUTTONS, ...custom], [custom]);
  const addButton = (b: FilterButton) => {
    const next = [...custom.filter((x) => x.label !== b.label), b];
    setCustom(next);
    save('nc-buttons', next);
  };
  const removeButton = (label: string) => {
    const next = custom.filter((x) => x.label !== label);
    setCustom(next);
    save('nc-buttons', next);
  };
  const combine = (f: string, how: 'only' | 'not' | 'and' | 'or' | 'andnot' | 'ornot') => {
    const cur = text.trim();
    const neg = `!(${f})`;
    if (how === 'only') return f;
    if (how === 'not') return neg;
    if (!cur) return how.endsWith('not') ? neg : f;
    return how === 'and'
      ? `(${cur}) && (${f})`
      : how === 'or'
        ? `(${cur}) || (${f})`
        : how === 'andnot'
          ? `(${cur}) && ${neg}`
          : `(${cur}) || ${neg}`;
  };

  /* ---------------- follow ---------------- */

  const streams = useMemo(
    () => ({
      tcp: captured.reduce((m, p) => Math.max(m, (p.tcp ?? -1) + 1), 0),
      udp: captured.reduce((m, p) => Math.max(m, (p.udp ?? -1) + 1), 0),
    }),
    [captured],
  );
  const openFollow = (want?: FollowKind, p: Packet | undefined = packet) => {
    const kinds = followKinds(p, captured);
    if (!p || !kinds.length)
      return flash(
        p
          ? 'Follow needs a TCP or UDP packet: this one is Bluetooth or ARP.'
          : 'Select a packet to follow its stream.',
      );
    const kind = want && kinds.includes(want) ? want : kinds[0];
    const stream = (kind === 'udp' ? p.udp : p.tcp) as number;
    const f = `${kind === 'udp' ? 'udp' : 'tcp'}.stream eq ${stream}`;
    if (dialog?.kind !== 'follow') setFollowBack(applied);
    apply(f);
    setDialog({ kind: 'follow', follow: kind, stream });
  };
  const followStream = (kind: FollowKind, stream: number) => {
    const first = captured.find((p) => (kind === 'udp' ? p.udp === stream : p.tcp === stream));
    if (first) openFollow(kind, first);
  };

  /* ---------------- details and selection helpers ---------------- */

  const related = useMemo(() => {
    const m = new Map<number, string>();
    if (!packet) return m;
    const same =
      packet.tcp !== undefined
        ? captured.filter((p) => p.tcp === packet.tcp)
        : packet.udp !== undefined
          ? captured.filter((p) => p.udp === packet.udp)
          : [];
    if (same.length > 1) {
      same.forEach((p) => m.set(p.no, '│'));
      m.set(same[0].no, '┌');
      m.set(same[same.length - 1].no, '└');
    }
    const walk = (nodes: Node[]) =>
      nodes.forEach((n) => {
        if (n.go)
          m.set(
            n.go,
            n.f === 'tcp.analysis.acks_frame' ? '✓' : n.f?.startsWith('tls.') ? '⋯' : '⇄',
          );
        if (n.k) walk(n.k);
      });
    walk(packet.tree);
    return m;
  }, [packet, captured]);

  const worst = useMemo(() => {
    const groups = expertInfo(captured);
    return SEV_ORDER.find((sev) => sev !== 'comment' && groups.some((g) => g.sev === sev)) ?? null;
  }, [captured]);

  const conversationFilter = (p: Packet, kind: 'eth' | 'ip' | 'tcp' | 'udp') => {
    const f = fieldsOf(p);
    if (kind === 'tcp' && p.tcp !== undefined) return `tcp.stream eq ${p.tcp}`;
    if (kind === 'udp' && p.udp !== undefined) return `udp.stream eq ${p.udp}`;
    if (kind === 'ip') {
      const a = f.get('ip.src')?.[0]?.v;
      const b = f.get('ip.dst')?.[0]?.v;
      return typeof a === 'number' && typeof b === 'number'
        ? `ip.addr==${ip4(a)} && ip.addr==${ip4(b)}`
        : null;
    }
    if (kind === 'eth') {
      const a = f.get('eth.src')?.[0]?.v;
      const b = f.get('eth.dst')?.[0]?.v;
      return a instanceof Uint8Array && b instanceof Uint8Array
        ? `eth.addr==${mac(a)} && eth.addr==${mac(b)}`
        : null;
    }
    return null;
  };

  const copy = (t: string, what: string) => {
    navigator.clipboard?.writeText(t).then(
      () => flash(`Copied ${what}.`),
      () => flash('The clipboard is blocked here.'),
    );
  };

  const exportText = () => {
    const lines: string[] = [];
    for (const p of displayed) {
      lines.push(
        `No.     Time           Source                Destination           Protocol Length Info`,
      );
      lines.push(
        `${String(p.no).padEnd(7)} ${p.t.toFixed(6).padEnd(14)} ${p.src.name ?? p.src.addr}`.padEnd(
          46,
        ) +
          ` ${(p.dst.name ?? p.dst.addr).padEnd(21)} ${p.proto.padEnd(8)} ${String(p.len).padEnd(6)} ${p.info}`,
      );
      lines.push('');
      const walk = (nodes: Node[], depth: number) =>
        nodes.forEach((n) => {
          if (n.h) return;
          lines.push(`${'    '.repeat(depth)}${n.t}`);
          if (n.k) walk(n.k, depth + 1);
        });
      walk(p.tree, 0);
      lines.push('');
    }
    download(`${FILE_NAME.replace(/\.pcapng$/, '')}-dissections.txt`, lines.join('\n'));
  };

  /* ---------------- menus ---------------- */

  const fieldMenu = (path: string, n: Node): MenuItem[] => {
    const f = filterFor(n);
    const def = n.f ? lookup(n.f) : undefined;
    const how = (h: Parameters<typeof combine>[1]) => (f ? combine(f, h) : '');
    const filterItems = (act: (t: string) => void): MenuItem[] => [
      { label: 'Selected', act: () => act(how('only')) },
      { label: 'Not Selected', act: () => act(how('not')) },
      { label: '…and Selected', act: () => act(how('and')) },
      { label: '…or Selected', act: () => act(how('or')) },
      { label: '…and not Selected', act: () => act(how('andnot')) },
      { label: '…or not Selected', act: () => act(how('ornot')) },
    ];
    return [
      {
        label: 'Expand Subtrees',
        key: 'Shift →',
        disabled: !n.k?.length,
        act: () => setOpen(ettsUnder(n), true),
      },
      {
        label: 'Collapse Subtrees',
        key: 'Shift ←',
        disabled: !n.k?.length,
        act: () => setOpen(ettsUnder(n), false),
      },
      {
        label: 'Expand All',
        act: () =>
          packet &&
          setOpen(
            packet.tree.flatMap((x) => [...ettsUnder(x)]),
            true,
          ),
      },
      { label: 'Collapse All', act: () => setExpanded(new Set()) },
      { sep: true },
      {
        label: 'Apply as Column',
        disabled: !def || def.type === 'proto' || def.type === 'none',
        act: () =>
          def &&
          setCols((c) =>
            c.some((x) => x.field === def.abbrev)
              ? c
              : [
                  ...c,
                  { id: `f:${def.abbrev}`, title: def.name, width: '130px', field: def.abbrev },
                ],
          ),
      },
      { sep: true },
      { label: 'Apply as Filter', disabled: !f, sub: filterItems((t) => apply(t)) },
      {
        label: 'Prepare as Filter',
        disabled: !f,
        sub: filterItems((t) => (setText(t), filterRef.current?.focus())),
      },
      { sep: true },
      ...(n.go
        ? [{ label: `Go to Linked Packet (${n.go})`, act: () => jump(n.go as number) }]
        : []),
      ...(n.url
        ? [{ label: 'Open Link', act: () => window.open(n.url, '_blank', 'noopener') }]
        : []),
      {
        label: 'Copy',
        sub: [
          { label: 'Description', act: () => copy(n.t, 'the description') },
          { label: 'Field Name', disabled: !n.f, act: () => copy(n.f ?? '', 'the field name') },
          {
            label: 'Value',
            disabled: n.v === undefined,
            act: () => copy(n.t.replace(/^[^:]*:\s*/, ''), 'the value'),
          },
          { label: 'As Filter', disabled: !f, act: () => copy(f ?? '', 'the filter') },
        ],
      },
    ];
  };

  const packetMenu = (no: number): MenuItem[] => {
    const p = cap?.packets[no - 1];
    if (!p) return [];
    const kinds = followKinds(p, captured);
    return [
      {
        label: marked.has(no) ? 'Unmark Packet' : 'Mark Packet',
        key: 'Ctrl M',
        act: () => toggleMark(no),
      },
      { sep: true },
      {
        label: 'Conversation Filter',
        sub: (['eth', 'ip', 'tcp', 'udp'] as const).map((k) => {
          const f = conversationFilter(p, k);
          return {
            label: { eth: 'Ethernet', ip: 'IPv4', tcp: 'TCP', udp: 'UDP' }[k],
            disabled: !f,
            act: () => f && apply(f),
          };
        }),
      },
      {
        label: 'Follow',
        disabled: !kinds.length,
        sub: (['tcp', 'udp', 'tls', 'http'] as FollowKind[]).map((k) => ({
          label: `${k.toUpperCase()} Stream`,
          key: `Ctrl Alt Shift ${{ tcp: 'T', udp: 'U', tls: 'S', http: 'H' }[k]}`,
          disabled: !kinds.includes(k),
          act: () => openFollow(k, p),
        })),
      },
      { sep: true },
      {
        label: 'Copy',
        sub: [
          {
            label: 'Summary as Text',
            act: () =>
              copy(
                [
                  p.no,
                  p.t.toFixed(6),
                  p.src.name ?? p.src.addr,
                  p.dst.name ?? p.dst.addr,
                  p.proto,
                  p.len,
                  p.info,
                ].join('\t'),
                'the summary',
              ),
          },
          {
            label: '…as Hex Stream',
            act: () =>
              copy(
                Array.from(p.srcs[0].bytes, (b) => b.toString(16).padStart(2, '0')).join(''),
                'the bytes',
              ),
          },
        ],
      },
    ];
  };

  const MENUS: { label: string; items: () => MenuItem[] }[] = [
    {
      label: 'File',
      items: () => [
        { label: 'Read as a Page', key: 'Ctrl Shift P', act: () => setReading(true) },
        {
          label: 'Export Packet Dissections as Plain Text…',
          disabled: !displayed.length,
          act: exportText,
        },
        { label: 'Download CV', href: profile.cv },
        { sep: true },
        {
          label: 'Capture File Properties',
          key: 'Ctrl Alt Shift C',
          act: () => setDialog({ kind: 'props' }),
        },
      ],
    },
    {
      label: 'Edit',
      items: () => [
        { label: 'Find Packet (Display Filter)', key: 'Ctrl F', act: () => focusFilter() },
        {
          label: marked.has(selected ?? -1) ? 'Unmark Packet' : 'Mark Packet',
          key: 'Ctrl M',
          disabled: selected === null,
          act: () => toggleMark(),
        },
        {
          label: 'Mark All Displayed',
          act: () => setMarked(new Set([...marked, ...displayed.map((p) => p.no)])),
        },
        {
          label: 'Unmark All Displayed',
          act: () =>
            setMarked(new Set([...marked].filter((n) => !displayed.some((p) => p.no === n)))),
        },
        { sep: true },
        {
          label: 'Copy Summary',
          disabled: !packet,
          act: () => packet && copy(packet.info, 'the summary'),
        },
      ],
    },
    {
      label: 'View',
      items: () => [
        {
          label: 'Time Display Format',
          sub: [
            {
              label: 'Seconds Since Beginning of Capture',
              checked: timeFmt === 'rel',
              act: () => setTimeFmt('rel'),
            },
            {
              label: 'Seconds Since Previous Displayed Packet',
              checked: timeFmt === 'delta',
              act: () => setTimeFmt('delta'),
            },
            {
              label: 'Time of Day (UTC)',
              checked: timeFmt === 'tod',
              act: () => setTimeFmt('tod'),
            },
            {
              label: 'UTC Date and Time of Day',
              checked: timeFmt === 'utc',
              act: () => setTimeFmt('utc'),
            },
          ],
        },
        { label: 'Resolve Names', checked: resolve, act: () => setResolve(!resolve) },
        { sep: true },
        { label: 'Colorize Packet List', checked: colorize, act: () => setColorize(!colorize) },
        { label: 'Coloring Rules…', act: () => setDialog({ kind: 'rules' }) },
        {
          label: 'Auto Scroll in Live Capture',
          checked: autoScroll,
          act: () => setAutoScroll(!autoScroll),
        },
        { sep: true },
        {
          label: 'Expand All',
          act: () =>
            packet &&
            setOpen(
              packet.tree.flatMap((x) => [...ettsUnder(x)]),
              true,
            ),
        },
        { label: 'Collapse All', act: () => setExpanded(new Set()) },
        {
          label: 'Reset Layout',
          act: () => (setSizes([0.44, 0.32, 0.24]), setCols(BASE_COLS), setSort(null)),
        },
      ],
    },
    {
      label: 'Go',
      items: () => [
        { label: 'Go to Packet…', key: 'Ctrl G', act: () => setDialog({ kind: 'goto' }) },
        { label: 'Next Packet', key: 'Ctrl ↓', act: () => step(1) },
        { label: 'Previous Packet', key: 'Ctrl ↑', act: () => step(-1) },
        {
          label: 'Next Packet in Conversation',
          key: 'Ctrl .',
          disabled: !packet,
          act: () => inConversation(1),
        },
        {
          label: 'Previous Packet in Conversation',
          key: 'Ctrl ,',
          disabled: !packet,
          act: () => inConversation(-1),
        },
        { label: 'First Packet', key: 'Ctrl Home', act: () => edge(false) },
        { label: 'Last Packet', key: 'Ctrl End', act: () => edge(true) },
      ],
    },
    {
      label: 'Capture',
      items: () => [
        { label: 'Start', key: 'Ctrl E', disabled: running || !cap, act: start },
        { label: 'Stop', key: 'Ctrl E', disabled: !running, act: stop },
        { label: 'Restart', disabled: !cap, act: start },
        { sep: true },
        { label: `Interfaces: ${IFACES.map((i) => i.name).join(', ')}`, disabled: true },
      ],
    },
    {
      label: 'Analyze',
      items: () => {
        const kinds = followKinds(packet, captured);
        return [
          {
            label: 'Apply as Filter',
            disabled: !resolved || !filterFor(resolved.node),
            act: () => resolved && apply(filterFor(resolved.node) as string),
          },
          {
            label: 'Prepare as Filter',
            disabled: !resolved || !filterFor(resolved.node),
            act: () =>
              resolved && (setText(filterFor(resolved.node) as string), focusFilter(false)),
          },
          {
            label: 'Conversation Filter',
            disabled: !packet,
            sub: (['eth', 'ip', 'tcp', 'udp'] as const).map((k) => {
              const f = packet ? conversationFilter(packet, k) : null;
              return {
                label: { eth: 'Ethernet', ip: 'IPv4', tcp: 'TCP', udp: 'UDP' }[k],
                disabled: !f,
                act: () => f && apply(f),
              };
            }),
          },
          { sep: true },
          {
            label: 'Follow Stream',
            key: 'Ctrl →',
            disabled: !kinds.length,
            act: () => openFollow(),
          },
          {
            label: 'Follow TCP Stream',
            key: 'Ctrl Alt Shift T',
            disabled: !kinds.includes('tcp'),
            act: () => openFollow('tcp'),
          },
          {
            label: 'Follow TLS Stream',
            key: 'Ctrl Alt Shift S',
            disabled: !kinds.includes('tls'),
            act: () => openFollow('tls'),
          },
          {
            label: 'Follow HTTP Stream',
            key: 'Ctrl Alt Shift H',
            disabled: !kinds.includes('http'),
            act: () => openFollow('http'),
          },
          {
            label: 'Follow UDP Stream',
            key: 'Ctrl Alt Shift U',
            disabled: !kinds.includes('udp'),
            act: () => openFollow('udp'),
          },
          { sep: true },
          { label: 'Expert Information', act: () => setDialog({ kind: 'expert' }) },
        ];
      },
    },
    {
      label: 'Statistics',
      items: () => [
        { label: 'Capture File Properties', act: () => setDialog({ kind: 'props' }) },
        { label: 'Protocol Hierarchy', act: () => setDialog({ kind: 'phs' }) },
        { label: 'Conversations', act: () => setDialog({ kind: 'conv' }) },
        { label: 'Endpoints', act: () => setDialog({ kind: 'endpoints' }) },
      ],
    },
    {
      label: 'Help',
      items: () => [
        { label: 'Read as a Page', act: () => setReading(true) },
        { label: 'Keyboard Shortcuts', act: () => setDialog({ kind: 'keys' }) },
        { label: 'Display Filter Fields', act: () => (setText('tcp.'), focusFilter(false)) },
        { sep: true },
        { label: `About ${C.name}`, act: () => setDialog({ kind: 'about' }) },
      ],
    },
  ];

  const openTop = (i: number, el?: HTMLElement | null) => {
    const btn = el ?? document.querySelector<HTMLElement>(`[data-menu="${i}"]`);
    const r = btn?.getBoundingClientRect();
    setMenu({
      items: MENUS[i].items(),
      x: r?.left ?? 8,
      y: (r?.bottom ?? 30) + 1,
      label: MENUS[i].label,
      top: i,
    });
  };
  const phoneMenu = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({
      items: MENUS.map((m) => ({ label: m.label, sub: m.items() })),
      x: r.left,
      y: r.bottom + 2,
      label: 'Menu',
    });
  };

  /* ---------------- keyboard ---------------- */

  const focusFilter = (select = true) => {
    const el = filterRef.current;
    if (!el) return;
    if (window.matchMedia('(max-width: 760px)').matches) setTab('list');
    el.focus();
    if (select) el.select();
  };

  const onGlobalKey = (e: KeyboardEvent) => {
    if (dialog || reading || menu) return;
    const t = e.target as HTMLElement;
    const typing =
      t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    const code = e.code;
    const handled = () => e.preventDefault();
    if ((mod && !e.altKey && !e.shiftKey && code === 'KeyF') || (e.ctrlKey && e.key === '/'))
      return (handled(), focusFilter());
    if (mod && !e.altKey && code === 'KeyE') return (handled(), toggleCapture());
    if (mod && !e.altKey && !e.shiftKey && code === 'KeyG')
      return (handled(), setDialog({ kind: 'goto' }));
    if (mod && e.shiftKey && !e.altKey && code === 'KeyP') return (handled(), setReading(true));
    if (e.ctrlKey && e.altKey && e.shiftKey) {
      const k = (
        { KeyT: 'tcp', KeyS: 'tls', KeyH: 'http', KeyU: 'udp' } as Record<string, FollowKind>
      )[code];
      if (k) return (handled(), openFollow(k));
      if (code === 'KeyC') return (handled(), setDialog({ kind: 'props' }));
    }
    if (typing) return;
    if (e.ctrlKey && !e.metaKey && !e.altKey && code === 'KeyM') return (handled(), toggleMark());
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'ArrowRight')
      return (handled(), openFollow());
    if ((e.ctrlKey && e.key === 'ArrowDown') || e.key === 'F8') return (handled(), step(1));
    if ((e.ctrlKey && e.key === 'ArrowUp') || e.key === 'F7') return (handled(), step(-1));
    if (e.ctrlKey && e.key === '.') return (handled(), inConversation(1));
    if (e.ctrlKey && e.key === ',') return (handled(), inConversation(-1));
    if (e.ctrlKey && (e.key === 'Home' || e.key === 'End'))
      return (handled(), edge(e.key === 'End'));
  };
  const keyRef = useRef(onGlobalKey);
  useEffect(() => {
    keyRef.current = onGlobalKey;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* ---------------- splitters ---------------- */

  const drag = (which: 0 | 1) => (e: React.PointerEvent<HTMLDivElement>) => {
    const box = panesRef.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const y = Math.max(0.08, Math.min(0.92, (ev.clientY - box.top) / box.height));
      setSizes(([a, b, c]) => {
        if (which === 0) {
          const na = Math.max(0.1, Math.min(a + b - 0.08, y));
          return [na, a + b - na, c];
        }
        const nb = Math.max(0.08, Math.min(b + c - 0.06, y - a));
        return [a, nb, b + c - nb];
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const nudge = (which: 0 | 1) => (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowUp' ? -0.03 : e.key === 'ArrowDown' ? 0.03 : 0;
    if (!d) return;
    e.preventDefault();
    setSizes(([a, b, c]) =>
      which === 0
        ? [
            Math.max(0.1, Math.min(a + b - 0.08, a + d)),
            b - d + (a + d < 0.1 || a + d > a + b - 0.08 ? d : 0),
            c,
          ]
        : [a, Math.max(0.08, Math.min(b + c - 0.06, b + d)), c - d],
    );
  };

  /* ---------------- render ---------------- */

  const live = running ? `Capturing from ${IFACES.map((i) => i.name).join(', ')}` : FILE_NAME;
  const emptyText = !cap
    ? 'Preparing the capture…'
    : count === 0
      ? 'Waiting for the first packet…'
      : 'No packets match the display filter.';
  const fieldInfo = resolved ? fieldStatus(resolved.node) : null;
  const statusText =
    status ??
    fieldInfo ??
    (running
      ? `Capturing from ${IFACES.length} interfaces · press Ctrl/⌘ E to stop`
      : (stopReason ?? 'Ready to load or capture'));
  const matchCount = applied ? matched.length : null;

  return (
    <div className={s.root} data-tab={tab}>
      <header className={s.menubar}>
        <nav className={s.menus} aria-label="Menu bar">
          {MENUS.map((m, i) => (
            <button
              key={m.label}
              type="button"
              data-menu={i}
              className={cx(s.menuBtn, menu?.top === i && s.menuBtnOn)}
              aria-haspopup="menu"
              aria-expanded={menu?.top === i}
              onClick={(e) => (menu?.top === i ? setMenu(null) : openTop(i, e.currentTarget))}
              onPointerEnter={(e) =>
                menu?.top !== undefined && menu.top !== i && openTop(i, e.currentTarget)
              }
            >
              {m.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className={s.phoneMenu}
          aria-label="Menu"
          aria-haspopup="menu"
          onClick={(e) => phoneMenu(e.currentTarget)}
        >
          <Icon name="menu" />
        </button>
        <p className={s.title} aria-live="polite">
          <span className={cx(s.liveDot, running && s.liveOn)} aria-hidden="true" />
          {live}
        </p>
        <button
          type="button"
          className={s.readBtn}
          onClick={() => setReading(true)}
          aria-label="Read as a page"
        >
          <Icon name="page" /> <span>Read as a page</span>
        </button>
      </header>

      <div className={s.toolbar} role="toolbar" aria-label="Main toolbar">
        <button
          type="button"
          className={cx(s.tool, s.toolStart)}
          onClick={start}
          disabled={running || !cap}
          aria-label="Start capturing packets"
          title="Start capturing packets (Ctrl/⌘ E)"
        >
          <Icon name="start" />
        </button>
        <button
          type="button"
          className={cx(s.tool, s.toolStop)}
          onClick={stop}
          disabled={!running}
          aria-label="Stop capturing packets"
          title="Stop capturing packets (Ctrl/⌘ E)"
        >
          <Icon name="stop" />
        </button>
        <button
          type="button"
          className={s.tool}
          onClick={start}
          disabled={!cap}
          aria-label="Restart current capture"
          title="Restart current capture"
        >
          <Icon name="restart" />
        </button>
        <span className={s.toolSep} />
        <button
          type="button"
          className={s.tool}
          onClick={() => focusFilter()}
          aria-label="Find a packet"
          title="Find a packet: focus the display filter (Ctrl/⌘ F)"
        >
          <Icon name="find" />
        </button>
        <button
          type="button"
          className={s.tool}
          onClick={() => step(-1)}
          aria-label="Previous packet"
          title="Previous packet (Ctrl ↑)"
        >
          <Icon name="up" />
        </button>
        <button
          type="button"
          className={s.tool}
          onClick={() => step(1)}
          aria-label="Next packet"
          title="Next packet (Ctrl ↓)"
        >
          <Icon name="down" />
        </button>
        <button
          type="button"
          className={s.tool}
          onClick={() => setDialog({ kind: 'goto' })}
          aria-label="Go to packet"
          title="Go to packet (Ctrl/⌘ G)"
        >
          <Icon name="goto" />
        </button>
        <button
          type="button"
          className={s.tool}
          onClick={() => edge(false)}
          aria-label="First packet"
          title="First packet"
        >
          <Icon name="first" />
        </button>
        <button
          type="button"
          className={s.tool}
          onClick={() => edge(true)}
          aria-label="Last packet"
          title="Last packet"
        >
          <Icon name="last" />
        </button>
        <button
          type="button"
          className={cx(s.tool, autoScroll && s.toolOn)}
          aria-pressed={autoScroll}
          onClick={() => setAutoScroll(!autoScroll)}
          aria-label="Auto scroll in live capture"
          title="Auto scroll in live capture"
        >
          <Icon name="scroll" />
        </button>
        <span className={s.toolSep} />
        <button
          type="button"
          className={cx(s.tool, colorize && s.toolOn)}
          aria-pressed={colorize}
          onClick={() => setColorize(!colorize)}
          aria-label="Colorize packet list"
          title="Colorize packet list"
        >
          <Icon name="color" />
        </button>
        <button
          type="button"
          className={s.tool}
          onClick={() =>
            packet &&
            setOpen(
              packet.tree.flatMap((x) => [...ettsUnder(x)]),
              true,
            )
          }
          aria-label="Expand all subtrees"
          title="Expand all subtrees"
        >
          <Icon name="expand" />
        </button>
        <button
          type="button"
          className={s.tool}
          onClick={() => setExpanded(new Set())}
          aria-label="Collapse all subtrees"
          title="Collapse all subtrees"
        >
          <Icon name="collapse" />
        </button>
        <span className={s.toolSep} />
        <button
          type="button"
          className={cx(s.tool, s.toolWide)}
          onClick={() => openFollow()}
          disabled={!followKinds(packet, captured).length}
          aria-label="Follow stream"
          title="Follow the selected packet’s stream (Ctrl →)"
        >
          <Icon name="follow" /> <span>Follow</span>
        </button>
        <button
          type="button"
          className={cx(s.tool, s.toolWide)}
          onClick={() => setDialog({ kind: 'conv' })}
          disabled={!count}
          aria-label="Conversations"
          title="Statistics: conversations"
        >
          <Icon name="stats" /> <span>Conversations</span>
        </button>
        <button
          type="button"
          className={cx(s.tool, s.toolWide)}
          onClick={() => setDialog({ kind: 'phs' })}
          disabled={!count}
          aria-label="Protocol hierarchy"
          title="Statistics: protocol hierarchy"
        >
          <Icon name="stats" /> <span>Hierarchy</span>
        </button>
      </div>

      <FilterBar
        text={text}
        setText={setText}
        applied={applied}
        apply={apply}
        recent={recent}
        buttons={buttons}
        addButton={addButton}
        removeButton={removeButton}
        inputRef={filterRef}
        matched={matchCount}
      />

      <div className={s.tabs} role="tablist" aria-label="Panes">
        {(['list', 'details', 'bytes'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={cx(s.paneTab, tab === k && s.paneTabOn)}
            onClick={() => setTab(k)}
          >
            {k === 'list'
              ? `Packets · ${displayed.length}`
              : k === 'details'
                ? `Details${packet ? ` · #${packet.no}` : ''}`
                : 'Bytes'}
          </button>
        ))}
      </div>

      <main
        ref={panesRef}
        className={s.panes}
        style={{ gridTemplateRows: `${sizes[0]}fr 5px ${sizes[1]}fr 5px ${sizes[2]}fr` }}
      >
        <section className={cx(s.pane, s.paneList)} aria-label="Packet list">
          <PacketList
            rows={displayed}
            selected={selected}
            onSelect={onListSelect}
            onOpen={(no) => {
              selectPacket(no);
              if (window.matchMedia('(max-width: 760px)').matches) setTab('details');
              else treeRef.current?.focus();
            }}
            onContext={(no, x, y) =>
              setMenu({ items: packetMenu(no), x, y, label: `Packet ${no}` })
            }
            onHeaderContext={(c, x, y) =>
              setMenu({
                items: [
                  {
                    label: c.field ? `Remove column “${c.title}”` : 'Built-in column',
                    disabled: !c.field,
                    act: () => setCols((list) => list.filter((x2) => x2.id !== c.id)),
                  },
                  { label: 'Sort Ascending', act: () => setSort({ id: c.id, desc: false }) },
                  { label: 'Sort Descending', act: () => setSort({ id: c.id, desc: true }) },
                  { label: 'Remove Sorting', disabled: !sort, act: () => setSort(null) },
                ],
                x,
                y,
                label: `Column ${c.title}`,
              })
            }
            ruleOf={ruleOf}
            marked={marked}
            related={related}
            resolve={resolve}
            timeOf={timeOf}
            sort={sort}
            onSort={(id) =>
              setSort((cur) =>
                cur?.id !== id ? { id, desc: false } : !cur.desc ? { id, desc: true } : null,
              )
            }
            cols={cols}
            listRef={listRef}
            onUserScroll={() => autoScroll && setAutoScroll(false)}
            empty={emptyText}
          />
        </section>
        <div
          className={s.splitter}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the packet list"
          aria-valuenow={Math.round(sizes[0] * 100)}
          aria-valuemin={10}
          aria-valuemax={84}
          tabIndex={0}
          onPointerDown={drag(0)}
          onKeyDown={nudge(0)}
        />
        <section className={cx(s.pane, s.paneDetails)} aria-label="Packet details">
          <Details
            packet={packet}
            expanded={expanded}
            setOpen={setOpen}
            sel={resolved?.path ?? null}
            onSelect={selectField}
            onActivate={activate}
            onContext={(path, n, x, y) =>
              setMenu({ items: fieldMenu(path, n), x, y, label: 'Field' })
            }
            marked={!!packet && marked.has(packet.no)}
            rule={rule}
            treeRef={treeRef}
          />
        </section>
        <div
          className={s.splitter}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the details pane"
          aria-valuenow={Math.round((sizes[0] + sizes[1]) * 100)}
          aria-valuemin={18}
          aria-valuemax={94}
          tabIndex={0}
          onPointerDown={drag(1)}
          onKeyDown={nudge(1)}
        />
        <section className={cx(s.pane, s.paneBytes)} aria-label="Packet bytes">
          <Bytes
            packet={packet}
            tab={activeByteTab}
            setTab={(i) => (setByteTab(i), setFsel(null))}
            hl={hl}
            mode={byteMode}
            setMode={setByteMode}
            onPick={pickByte}
            onHover={hoverByte}
          />
        </section>
      </main>

      <footer className={s.statusbar}>
        <button
          type="button"
          className={cx(s.expertDot, worst && s[`dot_${worst}`])}
          onClick={() => setDialog({ kind: 'expert' })}
          aria-label={`Expert information${worst ? `: highest severity ${worst}` : ''}`}
          title="Expert information"
        />
        <span className={s.statusMsg}>
          {statusText}
          <span ref={hoverRef} className={s.statusHover} />
        </span>
        <span className={s.statusCounts}>
          Packets: {count}
          {cap ? ` / ${cap.limit}` : ''} · Displayed: {displayed.length} (
          {count ? ((displayed.length / count) * 100).toFixed(1) : '0.0'}%)
          {marked.size ? ` · Marked: ${marked.size}` : ''}
        </span>
        <span className={s.statusProfile}>Profile: Default</span>
      </footer>

      <div className={s.credits}>
        <span className={s.creditMark}>{C.letter}</span>
        <span className={s.creditName}>{C.name}</span>
        <a href={`mailto:${profile.email}`}>{profile.email}</a>
        <a href={profile.linkedin} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <a href={profile.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href={profile.cv} target="_blank" rel="noreferrer">
          CV
        </a>
        <button type="button" className={s.linkBtn} onClick={() => setReading(true)}>
          Read as a page
        </button>
      </div>

      {menu && (
        <Popup
          items={menu.items}
          x={menu.x}
          y={menu.y}
          label={menu.label}
          onClose={() => setMenu(null)}
          onSide={
            menu.top !== undefined
              ? (d) => openTop((((menu.top as number) + d + MENUS.length) % MENUS.length) as number)
              : undefined
          }
        />
      )}

      {dialog?.kind === 'follow' && (
        <FollowDialog
          packets={captured}
          kind={dialog.follow}
          stream={dialog.stream}
          kinds={followKinds(
            captured.find((p) =>
              dialog.follow === 'udp' ? p.udp === dialog.stream : p.tcp === dialog.stream,
            ),
            captured,
          )}
          streams={dialog.follow === 'udp' ? streams.udp : streams.tcp}
          onSwitch={followStream}
          onJump={(f) => selectPacket(f)}
          onFilterOut={(f) => (apply(f), setDialog(null))}
          onBack={() => (apply(followBack), setDialog(null))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'phs' && (
        <HierarchyDialog
          packets={displayed}
          filter={applied}
          onApply={(f) => (apply(f), setDialog(null))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'conv' && (
        <ConversationsDialog
          captured={captured}
          displayed={displayed}
          filter={applied}
          onApply={(f) => (apply(f), setDialog(null))}
          onFollow={(k, st) => followStream(k, st)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'endpoints' && (
        <EndpointsDialog
          packets={captured}
          onApply={(f) => (apply(f), setDialog(null))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'expert' && (
        <ExpertDialog packets={captured} onJump={jump} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'props' && cap && (
        <PropertiesDialog
          cap={cap}
          captured={captured}
          displayed={displayed}
          marked={marked.size}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rules' && (
        <RulesDialog
          rules={rules}
          enabled={rulesOn}
          onSave={(r, on) => (setRules(r), setRulesOn(on), setDialog(null))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'goto' && (
        <GoToDialog max={count} onGo={jump} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'keys' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'about' && (
        <AboutDialog
          onClose={() => setDialog(null)}
          onRead={() => (setDialog(null), setReading(true))}
        />
      )}
      {reading && <Reader onClose={() => setReading(false)} />}
    </div>
  );
}

/** The path of the first visible node that matches. */
function pathWhere(nodes: Node[], test: (n: Node) => boolean, prefix = ''): string | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const path = prefix ? `${prefix}.${i}` : String(i);
    if (!n.h && test(n)) return path;
    if (n.k) {
      const deeper = pathWhere(n.k, test, path);
      if (deeper) return deeper;
    }
  }
  return null;
}

/** "Source Port (tcp.srcport), 2 bytes": what the status bar says about a field. */
function fieldStatus(n: Node): string {
  const def = n.f ? lookup(n.f) : undefined;
  const size = n.n ? `, ${n.n} byte${n.n === 1 ? '' : 's'}` : '';
  if (!def) return `${n.t.replace(/^\[|\]$/g, '')}${size}`;
  return `${def.name} (${def.abbrev})${size}`;
}
