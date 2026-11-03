'use client';

// The function call graph, laid out left to right from the reset vector: main, the eras it calls
// in order, then the products, devices and drivers below them. Drag to pan, wheel or pinch to
// zoom, click a function to open it. Arrow keys walk the graph: up and down within a column,
// left to a caller, right to a callee.
import { useEffect, useMemo, useRef, useState } from 'react';
import { STAGE } from './analyze';
import { LIB, PROG, fnOf, nameAt, type Names } from './program';
import { act, useNotes, useUI } from './store';
import s from './re.module.scss';

const CH = 7.25;
const NODE_H = 24;
const STEP = 32;
const GAP_X = 72;

interface GNode {
  addr: number;
  x: number;
  y: number;
  w: number;
  layer: number;
  label: string;
  kind: string;
}

const kindOf = (addr: number) => {
  const sym = PROG.labels.get(addr)?.sym ?? '';
  if (LIB.has(addr)) return 'lib';
  if (/^(role_|roots_)/.test(sym)) return 'era';
  if (sym.startsWith('product_')) return 'product';
  if (sym.startsWith('dev_') || sym.startsWith('devices_')) return 'device';
  if (sym.startsWith('upstream_')) return 'patch';
  if (sym === 'main' || sym === 'Reset_Handler') return 'entry';
  if (/^(projects_|archive_|banner_|contact_)/.test(sym)) return 'era';
  return 'driver';
};

function layout(stage: number, showLib: boolean, names: Names) {
  const visible = PROG.fnList.filter((a) => showLib || !LIB.has(a));
  const set = new Set(visible);
  const calls = (a: number) => (PROG.fns.get(a)?.calls ?? []).filter((c) => set.has(c) && c !== a);
  const callers = (a: number) =>
    (PROG.fns.get(a)?.callers ?? []).filter((c) => set.has(c) && c !== a);
  const roots = visible.filter((a) => !callers(a).length);
  const depth = new Map<number, number>();
  const queue = [...roots];
  roots.forEach((r) => depth.set(r, 0));
  while (queue.length) {
    const a = queue.shift() as number;
    for (const c of calls(a)) {
      if (!depth.has(c)) {
        depth.set(c, (depth.get(a) as number) + 1);
        queue.push(c);
      }
    }
  }
  const layers: number[][] = [];
  for (const a of visible) {
    const d = depth.get(a) ?? 0;
    (layers[d] ??= []).push(a);
  }
  const label = (a: number) => nameAt(a, stage, names) ?? `FUN_${a.toString(16)}`;
  const pos = new Map<number, { x: number; y: number; w: number; layer: number }>();
  let x = 0;
  layers.forEach((layer, d) => {
    const w = Math.max(...layer.map((a) => label(a).length * CH + 22));
    const want = (a: number) => {
      const ps = callers(a)
        .map((p) => pos.get(p))
        .filter((p): p is { x: number; y: number; w: number; layer: number } => !!p && p.layer < d);
      return ps.length ? ps.reduce((sum, p) => sum + p.y, 0) / ps.length : 0;
    };
    const order = d === 0 ? layer : [...layer].sort((a, b) => want(a) - want(b) || a - b);
    let prev = -Infinity;
    const ys = order.map((a, k) => {
      const y = d === 0 ? k * STEP : Math.max(want(a), prev + STEP);
      prev = y;
      return y;
    });
    const shift =
      d === 0 ? 0 : order.reduce((sum, a, k) => sum + (want(a) - ys[k]), 0) / order.length;
    order.forEach((a, k) => pos.set(a, { x, y: ys[k] + shift, w, layer: d }));
    x += w + GAP_X;
  });
  const minY = Math.min(...[...pos.values()].map((p) => p.y));
  const nodes: GNode[] = visible.map((a) => {
    const p = pos.get(a) as { x: number; y: number; w: number; layer: number };
    return {
      addr: a,
      x: p.x,
      y: p.y - minY,
      w: p.w,
      layer: p.layer,
      label: label(a),
      kind: kindOf(a),
    };
  });
  const byAddr = new Map(nodes.map((n) => [n.addr, n]));
  const edges = nodes.flatMap((n) =>
    (PROG.fns.get(n.addr)?.calls ?? [])
      .filter((c) => set.has(c))
      .map((c) => {
        const t = byAddr.get(c) as GNode;
        const x1 = n.x + n.w;
        const y1 = n.y + NODE_H / 2;
        if (c === n.addr) return { from: n.addr, to: c, d: `M${x1},${y1 - 5} c22,-18 22,28 0,10` };
        const x2 = t.x;
        const y2 = t.y + NODE_H / 2;
        const dx = Math.max(36, Math.abs(x2 - x1) / 2);
        return {
          from: n.addr,
          to: c,
          d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`,
        };
      }),
  );
  const width = Math.max(...nodes.map((n) => n.x + n.w)) + 30;
  const height = Math.max(...nodes.map((n) => n.y)) + NODE_H;
  return { nodes, edges, width, height, byAddr, layers };
}

interface View {
  x: number;
  y: number;
  k: number;
}

export default function Graph() {
  const ui = useUI();
  const notes = useNotes();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 320 });
  /** null follows the current function; 'fit' shows the whole graph; a View is the visitor's own. */
  const [view, setView] = useState<View | 'fit' | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const ready = ui.stage >= STAGE.CODE;
  const g = useMemo(
    () => (ready ? layout(ui.stage, ui.showLib, notes.names) : null),
    [ready, ui.stage, ui.showLib, notes.names],
  );

  const current = fnOf(ui.cursor, ui.stage);
  const fit = useMemo<View>(() => {
    if (!g) return { x: 0, y: 0, k: 1 };
    const k = Math.min(
      1.1,
      Math.max(0.12, Math.min((size.w - 32) / g.width, (size.h - 32) / g.height)),
    );
    return { k, x: (size.w - g.width * k) / 2, y: Math.max(16, (size.h - g.height * k) / 2) };
  }, [g, size]);
  const follow = useMemo<View>(() => {
    const n = g
      ? (g.byAddr.get(current ?? -1) ??
        g.byAddr.get(PROG.fnList.find((a) => PROG.labels.get(a)?.sym === 'main') ?? -1))
      : undefined;
    if (!g || !n) return fit;
    const k = Math.max(fit.k, size.w < 520 ? 0.7 : 0.85);
    return { k, x: size.w / 2 - (n.x + n.w / 2) * k, y: size.h / 2 - (n.y + NODE_H / 2) * k };
  }, [g, current, fit, size]);
  const v = view === 'fit' ? fit : (view ?? follow);
  const vRef = useRef(v);
  useEffect(() => {
    vRef.current = v;
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth || 800, h: el.clientHeight || 320 }),
    );
    ro.observe(el);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const cur = vRef.current;
      const k = Math.min(3, Math.max(0.12, cur.k * Math.exp(-e.deltaY * 0.0015)));
      setView({ k, x: px - ((px - cur.x) * k) / cur.k, y: py - ((py - cur.y) * k) / cur.k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pointers.current;
    const last = p.get(e.pointerId);
    if (!last) return;
    const cur = vRef.current;
    if (p.size === 1) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      setView({ ...cur, x: cur.x + dx, y: cur.y + dy });
    } else if (p.size === 2) {
      const [a, b] = [...p.entries()].map(([id, q]) =>
        id === e.pointerId ? { x: e.clientX, y: e.clientY } : q,
      );
      const [a0, b0] = [...p.values()];
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
      const d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = (box.current as HTMLElement).getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - r.left;
      const cy = (a.y + b.y) / 2 - r.top;
      const k = Math.min(3, Math.max(0.12, (cur.k * d1) / d0));
      moved.current += 10;
      setView({ k, x: cx - ((cx - cur.x) * k) / cur.k, y: cy - ((cy - cur.y) * k) / cur.k });
    }
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const zoom = (f: number) => {
    const cur = vRef.current;
    const k = Math.min(3, Math.max(0.12, cur.k * f));
    setView({
      k,
      x: size.w / 2 - ((size.w / 2 - cur.x) * k) / cur.k,
      y: size.h / 2 - ((size.h / 2 - cur.y) * k) / cur.k,
    });
  };

  const focusNode = (a: number) => {
    setSel(a);
    const n = g?.byAddr.get(a);
    if (!n) return;
    const cur = vRef.current;
    const sx = n.x * cur.k + cur.x;
    const sy = n.y * cur.k + cur.y;
    if (sx < 8 || sy < 8 || sx + n.w * cur.k > size.w - 8 || sy + NODE_H * cur.k > size.h - 8)
      setView({
        ...cur,
        x: size.w / 2 - (n.x + n.w / 2) * cur.k,
        y: size.h / 2 - (n.y + NODE_H / 2) * cur.k,
      });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!g || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === '+' || e.key === '=') return zoom(1.25);
    if (e.key === '-') return zoom(0.8);
    if (e.key === '0') return setView('fit');
    const at = sel ?? current ?? g.nodes[0]?.addr;
    const n = g.byAddr.get(at);
    if (!n) return;
    const column = g.layers[n.layer].map((a) => g.byAddr.get(a) as GNode).sort((a, b) => a.y - b.y);
    const idx = column.findIndex((c) => c.addr === at);
    let next: number | undefined;
    if (e.key === 'ArrowDown') next = column[idx + 1]?.addr;
    if (e.key === 'ArrowUp') next = column[idx - 1]?.addr;
    if (e.key === 'ArrowRight')
      next = (PROG.fns.get(at)?.calls ?? []).find((c) => g.byAddr.has(c) && c !== at);
    if (e.key === 'ArrowLeft')
      next = (PROG.fns.get(at)?.callers ?? []).find((c) => g.byAddr.has(c));
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      act.goTo(at);
      return;
    }
    if (next !== undefined) {
      e.preventDefault();
      focusNode(next);
    }
  };

  const onClick = (e: React.MouseEvent) => {
    if (moved.current > 6) return;
    const node = (e.target as Element).closest<SVGGElement>('[data-fn]');
    if (node) {
      const a = Number(node.dataset.fn);
      setSel(a);
      act.goTo(a);
    }
  };

  const hot = current ?? -1;
  const selected = sel ?? -1;

  return (
    <div className={s.graphWrap}>
      <div className={s.graphTools} role="toolbar" aria-label="Graph controls">
        <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => setView('fit')}>
          Fit
        </button>
        <button
          type="button"
          onClick={() => setView(null)}
          title="Centre on the function at the cursor"
        >
          Follow
        </button>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={ui.showLib}
            onChange={() => {
              act.toggleLib();
              setView(null);
            }}
          />
          Library calls
        </label>
        <span className={s.graphHint}>
          {g ? `${g.nodes.length} functions · ${g.edges.length} calls` : ''}
        </span>
      </div>
      <div
        ref={box}
        className={s.graph}
        tabIndex={0}
        role="application"
        aria-roledescription="call graph"
        aria-label={`Function call graph. Arrow keys move between functions, Enter opens one, plus and minus zoom.${sel !== null ? ` Selected: ${nameAt(sel, ui.stage, notes.names)}` : ''}`}
        onKeyDown={onKey}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={onClick}
        onFocus={() => sel === null && current !== null && setSel(current)}
      >
        {!g ? (
          <p className={s.empty}>
            The call graph is drawn once the disassembler has found the functions.
          </p>
        ) : (
          <svg width="100%" height="100%" aria-hidden="true">
            <defs>
              <marker
                id="re-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" className={s.gArrow} />
              </marker>
            </defs>
            <g transform={`translate(${v.x},${v.y}) scale(${v.k})`}>
              {g.edges.map((e) => (
                <path
                  key={`${e.from}-${e.to}`}
                  d={e.d}
                  className={`${s.gEdge} ${e.from === hot || e.to === hot ? s.gEdgeHot : ''} ${LIB.has(e.to) ? s.gEdgeLib : ''}`}
                  markerEnd="url(#re-arrow)"
                />
              ))}
              {g.nodes.map((n) => (
                <g
                  key={n.addr}
                  data-fn={n.addr}
                  className={`${s.gNode} ${s[`g_${n.kind}`]} ${n.addr === hot ? s.gCur : ''} ${n.addr === selected ? s.gSel : ''}`}
                  transform={`translate(${n.x},${n.y})`}
                >
                  <rect width={n.w} height={NODE_H} rx={4} />
                  <text x={11} y={16}>
                    {n.label}
                  </text>
                  <title>{n.label}</title>
                </g>
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
