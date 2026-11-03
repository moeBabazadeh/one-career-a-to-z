'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  colorOf,
  iconOf,
  inputsOf,
  nodeH,
  nodeW,
  outputsOf,
  typeOf,
  type Flow,
  type FlowNode,
} from './flows';
import {
  MOBILE,
  commentAt,
  fitView,
  groupRect,
  pathOf,
  pointAt,
  wireSegs,
  zoomAt,
  type Pt,
  type View,
} from './geometry';
import { Icon } from './icons';
import s from './flow.module.scss';

export interface CanvasProps {
  flow: Flow;
  selected: string | null;
  showStatus: boolean;
  isChanged: (id: string) => boolean;
  isMuted: (id: string) => boolean;
  onSelect: (id: string | null) => void;
  onInject: (id: string) => void;
  onToggle: (id: string) => void;
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ node */

interface NodeProps extends Omit<CanvasProps, 'flow' | 'selected' | 'isChanged' | 'isMuted'> {
  node: FlowNode;
  index: number;
  selected: boolean;
  changed: boolean;
  muted: boolean;
  vertical?: boolean;
  style?: React.CSSProperties;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent, id: string) => void;
}

function NodeView({
  node,
  index,
  selected,
  changed,
  muted,
  showStatus,
  vertical,
  style,
  className,
  onSelect,
  onInject,
  onToggle,
  onKeyDown,
}: NodeProps) {
  const outputs = vertical ? Math.min(1, outputsOf(node)) : outputsOf(node);
  const h = nodeH(node);
  return (
    <div
      className={cx(s.node, vertical && s.vertical, selected && s.selected, className)}
      data-node={node.id}
      style={{ '--c': colorOf(node), '--i': index, ...style } as React.CSSProperties}
    >
      {node.kind === 'inject' && (
        <button
          type="button"
          className={s.injectBtn}
          data-nodrag
          aria-label={`Inject ${node.label}`}
          onClick={() => onInject(node.id)}
        />
      )}
      <button
        type="button"
        className={s.body}
        data-body
        data-drag={vertical ? undefined : node.id}
        aria-pressed={selected}
        aria-label={`${node.label}, ${typeOf(node)} node`}
        onClick={() => onSelect(node.id)}
        onKeyDown={onKeyDown ? (e) => onKeyDown(e, node.id) : undefined}
      >
        <span className={s.icon}>
          <Icon name={iconOf(node)} />
        </span>
        <span className={s.label}>{node.label}</span>
        {(node.hold ?? 0) >= 0.3 && <span className={s.hold} data-hold aria-hidden="true" />}
      </button>
      {inputsOf(node) > 0 && <span className={s.portIn} aria-hidden="true" />}
      {Array.from({ length: outputs }, (_, i) => (
        <span
          key={i}
          className={s.portOut}
          style={vertical ? undefined : { top: h / 2 + (i - (outputs - 1) / 2) * 13 - 5 }}
          aria-hidden="true"
        />
      ))}
      {node.kind === 'debug' && (
        <button
          type="button"
          className={s.debugBtn}
          data-nodrag
          aria-pressed={!muted}
          aria-label={`Debug output ${muted ? 'off' : 'on'}`}
          onClick={() => onToggle(node.id)}
        />
      )}
      {changed && <span className={s.changed} aria-hidden="true" />}
      {showStatus && node.status && (
        <span className={s.status}>
          <i className={cx(s.statusDot, s[node.status.fill], node.status.ring && s.ring)} />
          {node.status.text}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ desktop canvas */

interface Gesture {
  id: string | null;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
}

const DOTS = 36;
const FALLBACK = { w: 860, h: 760 };

export function Workspace({
  flow,
  positions,
  selected,
  showStatus,
  isChanged,
  isMuted,
  onSelect,
  onInject,
  onToggle,
  onMove,
  dotsRef,
  footer,
}: CanvasProps & {
  positions: Record<string, Pt>;
  onMove: (id: string, pt: Pt, done: boolean) => void;
  dotsRef: React.Ref<SVGGElement>;
  footer: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [views, setViews] = useState<Record<string, View>>({});
  const [drag, setDrag] = useState<{ id: string; pt: Pt } | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const box = size ?? FALLBACK;
  const fit = fitView(flow.id, box.w, box.h);
  const view = views[flow.id] ?? fit;
  const pos = drag ? { ...positions, [drag.id]: drag.pt } : positions;

  // The wheel handler lives outside React's event system (it must be non-passive), so it reads
  // the current flow and fit from a ref.
  const latest = useRef({ flowId: flow.id, fit });
  useEffect(() => {
    latest.current = { flowId: flow.id, fit };
  });

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setSize({ w: node.clientWidth, h: node.clientHeight }),
    );
    observer.observe(node);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { flowId, fit: base } = latest.current;
      const r = node.getBoundingClientRect();
      const zoom = e.ctrlKey || e.metaKey;
      const [dx, dy, x, y] = [e.deltaX, e.deltaY, e.clientX - r.left, e.clientY - r.top];
      setViews((prev) => {
        const v = prev[flowId] ?? base;
        return {
          ...prev,
          [flowId]: zoom
            ? zoomAt(v, x, y, Math.exp(-dy * 0.01))
            : { ...v, x: v.x - dx, y: v.y - dy },
        };
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  const setView = (v: View | null) =>
    setViews((prev) => {
      const next = { ...prev };
      if (v) next[flow.id] = v;
      else delete next[flow.id];
      return next;
    });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-nodrag]')) return;
    const id = target.closest<HTMLElement>('[data-drag]')?.dataset.drag ?? null;
    target.setPointerCapture(e.pointerId);
    const origin = id ? pos[id] : view;
    gesture.current = {
      id,
      sx: e.clientX,
      sy: e.clientY,
      ox: origin.x,
      oy: origin.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    if (g.id) {
      // snap to a 10px grid while dragging
      const pt = {
        x: Math.round((g.ox + dx / view.k) / 10) * 10,
        y: Math.round((g.oy + dy / view.k) / 10) * 10,
      };
      setDrag({ id: g.id, pt });
      onMove(g.id, pt, false);
    } else {
      setView({ ...view, x: g.ox + dx, y: g.oy + dy });
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.id && g.moved && drag) onMove(g.id, drag.pt, true);
    if (g && !g.id && !g.moved) onSelect(null);
    setDrag(null);
  };

  // Arrow keys nudge the focused node, shift for bigger steps.
  const onNodeKey = (e: React.KeyboardEvent, id: string) => {
    const step = e.shiftKey ? 50 : 10;
    const d = (
      {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      } as Record<string, number[]>
    )[e.key];
    if (!d) return;
    e.preventDefault();
    onMove(id, { x: pos[id].x + d[0], y: pos[id].y + d[1] }, true);
  };

  const center = (factor: number) => setView(zoomAt(view, box.w / 2, box.h / 2, factor));

  return (
    <div className={s.workspace}>
      <div
        ref={el}
        className={s.surface}
        style={
          {
            '--gx': `${view.x}px`,
            '--gy': `${view.y}px`,
            '--gs': `${20 * view.k}px`,
          } as React.CSSProperties
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          key={flow.id}
          className={s.world}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <svg className={s.layer} width={1} height={1} aria-hidden="true">
            <text x={commentAt(flow.id).x} y={commentAt(flow.id).y} className={s.comment}>
              <tspan>{'// '}</tspan>
              {flow.comment}
            </text>
            {flow.groups.map((g) => {
              const r = groupRect(g, pos, flow.id);
              return (
                <g
                  key={g.label}
                  className={s.group}
                  style={{ '--g': g.color } as React.CSSProperties}
                >
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={7} />
                  <text x={r.x + 10} y={r.y + 17}>
                    {g.label}
                  </text>
                </g>
              );
            })}
            {flow.wires.map((wire, i) => {
              const segs = wireSegs(flow, wire, pos);
              const hot = selected === wire.from || selected === wire.to;
              const d = pathOf(segs);
              const mid = pointAt(segs, 0.5);
              return (
                <g key={i} className={cx(s.wire, wire.kind && s[wire.kind], hot && s.hot)}>
                  <path d={d} className={s.wireBg} />
                  <path d={d} className={s.wireFg} pathLength={wire.kind ? undefined : 1} />
                  {wire.kind === 'radio' && (
                    <text x={mid.x} y={mid.y - 9} textAnchor="middle">
                      GSM · over the air
                    </text>
                  )}
                  {wire.kind === 'feedback' && (
                    <text x={mid.x} y={mid.y + 16} textAnchor="middle">
                      feedback
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {flow.nodes.map((node, i) => (
            <NodeView
              key={node.id}
              node={node}
              index={i}
              selected={selected === node.id}
              changed={isChanged(node.id)}
              muted={isMuted(node.id)}
              showStatus={showStatus}
              style={{
                left: pos[node.id].x,
                top: pos[node.id].y,
                width: nodeW(node),
                height: nodeH(node),
              }}
              className={drag?.id === node.id ? s.dragging : undefined}
              onSelect={onSelect}
              onInject={onInject}
              onToggle={onToggle}
              onKeyDown={onNodeKey}
            />
          ))}
          <svg className={s.layer} width={1} height={1} aria-hidden="true">
            <defs>
              <radialGradient id="flow-glow">
                <stop offset="0" stopColor="#ff6b4a" stopOpacity={0.75} />
                <stop offset="1" stopColor="#ff6b4a" stopOpacity={0} />
              </radialGradient>
              <radialGradient id="flow-glow-radio">
                <stop offset="0" stopColor="#d8bfd8" stopOpacity={0.8} />
                <stop offset="1" stopColor="#d8bfd8" stopOpacity={0} />
              </radialGradient>
            </defs>
            <g ref={dotsRef}>
              {Array.from({ length: DOTS }, (_, i) => (
                <g key={i} className={s.dot} style={{ opacity: 0 }}>
                  <circle r={12} className={s.dotGlow} />
                  <circle r={1.7} className={s.dotTrail} />
                  <circle r={2.5} className={s.dotTrail} />
                  <circle r={4} className={s.dotCore} />
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
      <div className={s.wsFooter}>
        {footer}
        <div className={s.zoom} role="group" aria-label="Zoom">
          <button type="button" onClick={() => center(1 / 1.2)} aria-label="Zoom out">
            <Icon name="minus" />
          </button>
          <button
            type="button"
            onClick={() => setView(null)}
            aria-label="Zoom to fit"
            className={s.zoomValue}
          >
            {Math.round(view.k * 100)}%
          </button>
          <button type="button" onClick={() => center(1.2)} aria-label="Zoom in">
            <Icon name="plus" />
          </button>
          <button type="button" onClick={() => setView(null)} aria-label="Fit flow">
            <Icon name="fit" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ phone layout */

export function MobileFlow({
  flow,
  selected,
  showStatus,
  isChanged,
  isMuted,
  onSelect,
  onInject,
  onToggle,
  dotsRef,
}: CanvasProps & { dotsRef: React.Ref<HTMLDivElement> }) {
  const layout = MOBILE[flow.id];
  const node = (id: string, i: number, style?: React.CSSProperties) => {
    const n = flow.nodes.find((it) => it.id === id)!;
    return (
      <NodeView
        key={id}
        node={n}
        index={i}
        vertical
        selected={selected === id}
        changed={isChanged(id)}
        muted={isMuted(id)}
        showStatus={showStatus}
        style={style}
        onSelect={onSelect}
        onInject={onInject}
        onToggle={onToggle}
      />
    );
  };

  return (
    <div key={flow.id} className={s.mflow} style={{ height: layout.height }}>
      {layout.ranks.map((r, i) => {
        const above = layout.ranks[i - 1];
        return (
          <Fragment key={r.ids.join()}>
            {above && !r.start && (
              <span
                className={s.mwire}
                style={{ top: above.y + above.h, height: r.y - above.y - above.h }}
                aria-hidden="true"
              />
            )}
            {r.bank ? (
              <div className={s.bank} style={{ top: r.y, height: r.h }}>
                <span className={s.bankLabel}>×{r.ids.length} in parallel</span>
                {r.ids.map((id, j) => node(id, i + j))}
              </div>
            ) : (
              node(r.ids[0], i, { top: r.y })
            )}
          </Fragment>
        );
      })}
      <div ref={dotsRef} className={s.mdots} aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
    </div>
  );
}
