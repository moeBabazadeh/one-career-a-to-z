'use client';

// The left panel: pages, the layer tree and the assets. The tree lists layers top of the stack
// first, as design tools do; rows rename on double-click, hide and lock from their buttons, and
// drag to reorder or move into another frame. Arrow keys walk the tree.

import { memo, useEffect, useRef, useState } from 'react';
import { refs } from './build';
import { cx, Icon, type IconName } from './controls';
import { componentName, inInstance, type Node } from './model';
import { rasterize } from './paint';
import {
  hover,
  insertInstance,
  moveInto,
  rename,
  select,
  setPage,
  set,
  toggle,
  toggleExpanded,
  useHovered,
  useSlice,
  focusOn,
} from './store';
import { viewCenter } from './stage';
import s from './vector.module.scss';

export function iconFor(n: Node): IconName {
  if (n.comp || n.set) return 'component';
  if (n.main) return 'instance';
  if (n.type === 'frame') return n.layout ? (n.layout.dir === 'h' ? 'alH' : 'alV') : 'frame';
  if (n.type === 'text') return 'text';
  if (n.type === 'image') return 'image';
  if (n.type === 'ellipse') return 'ellipse';
  return 'rect';
}

/* ------------------------------------------------------------------ pages */

export function Pages() {
  const doc = useSlice((st) => st.doc);
  const page = useSlice((st) => st.page);
  const [open, setOpen] = useState(true);
  return (
    <section className={s.pages}>
      <header className={s.panelHead}>
        <button
          type="button"
          className={s.disclosure}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'down' : 'chevron'} size={12} />
          Pages
        </button>
      </header>
      {open && (
        <ul className={s.pageList}>
          {doc.pages.map((p) => (
            <li key={p}>
              <button
                type="button"
                className={s.pageRow}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => setPage(p)}
              >
                {p === page ? <Icon name="check" size={13} /> : <span className={s.iconSpace} />}
                {doc.nodes[p].name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ the tree */

interface RowInfo {
  id: string;
  depth: number;
}

function flatten(
  N: Record<string, Node>,
  page: string,
  expanded: Record<string, boolean>,
): RowInfo[] {
  const out: RowInfo[] = [];
  const walk = (id: string, depth: number) => {
    out.push({ id, depth });
    if (!expanded[id]) return;
    const kids = N[id].children;
    for (let i = kids.length - 1; i >= 0; i--) walk(kids[i], depth + 1);
  };
  const tops = N[page].children;
  for (let i = tops.length - 1; i >= 0; i--) walk(tops[i], 0);
  return out;
}

interface Drop {
  parent: string;
  index: number;
  row: string;
  where: 'above' | 'below' | 'into';
}

export function Layers({ readOnly = false }: { readOnly?: boolean }) {
  const doc = useSlice((st) => st.doc);
  const page = useSlice((st) => st.page);
  const expanded = useSlice((st) => st.expanded);
  const sel = useSlice((st) => st.sel);
  const N = doc.nodes;
  const rows = flatten(N, page, expanded);
  const tree = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; on: boolean } | null>(null);
  const selSet = new Set(sel);
  const inSel = new Set<string>();
  for (const id of sel)
    for (let p = N[id]?.parent; p && N[p] && N[p].type !== 'page'; p = N[p].parent) inSel.add(p);

  // Keep the selected row in view when the selection changes from the canvas.
  useEffect(() => {
    const el = tree.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const focusRow = (id: string) => {
    const el = tree.current?.querySelector<HTMLElement>(`[data-row="${id}"]`);
    el?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-row]')?.dataset.row;
    if (!id || renaming) return;
    const i = rows.findIndex((r) => r.id === id);
    const n = N[id];
    const go = (j: number) => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, j))];
      if (!r) return;
      select([r.id]);
      requestAnimationFrame(() => focusRow(r.id));
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'ArrowRight') {
      if (n.children.length && !expanded[id]) toggleExpanded(id);
      else if (n.children.length) go(i + 1);
    } else if (e.key === 'ArrowLeft') {
      if (expanded[id]) toggleExpanded(id);
      else if (N[n.parent]?.type !== 'page') go(rows.findIndex((r) => r.id === n.parent));
    } else if (e.key === 'F2' || (e.key === 'Enter' && !readOnly)) {
      if (!readOnly) setRenaming(id);
    } else if (e.key === ' ') select([id]);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const where = (e: React.PointerEvent): Drop | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row]');
    const id = el?.dataset.row;
    const d = drag.current;
    if (!el || !id || !d || !N[id]) return null;
    const r = el.getBoundingClientRect();
    const fy = (e.clientY - r.top) / r.height;
    const n = N[id];
    const canInto = n.type === 'frame' && !n.ref && !n.set;
    if (canInto && fy > 0.28 && fy < 0.72)
      return { parent: id, index: n.children.length, row: id, where: 'into' };
    if (fy >= 0.5 && expanded[id] && n.children.length && canInto)
      return { parent: id, index: n.children.length, row: id, where: 'below' };
    const p = N[n.parent];
    const at = p.children.indexOf(id);
    return fy < 0.5
      ? { parent: p.id, index: at + 1, row: id, where: 'above' }
      : { parent: p.id, index: at, row: id, where: 'below' };
  };

  return (
    <div
      ref={tree}
      className={s.tree}
      role="tree"
      aria-label="Layers"
      aria-multiselectable="true"
      onKeyDown={onKey}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || readOnly) return;
        if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
        // Capture only once it's a drag, so clicks and double-clicks still reach the row.
        if (!d.on) tree.current?.setPointerCapture(e.pointerId);
        d.on = true;
        setDrop(where(e));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d?.on && drop) {
          const ids = selSet.has(d.id) ? sel : [d.id];
          moveInto(ids, drop.parent, drop.index);
        }
        setDrop(null);
      }}
      onPointerLeave={() => hover.set(null)}
    >
      {rows.length === 0 && <p className={s.empty}>No layers on this page.</p>}
      {rows.map((r) => (
        <Row
          key={r.id}
          node={N[r.id]}
          depth={r.depth}
          selected={selSet.has(r.id)}
          within={inSel.has(r.id)}
          expanded={!!expanded[r.id]}
          focusable={sel.length ? sel[0] === r.id : rows[0]?.id === r.id}
          frozen={inInstance(N, r.id)}
          readOnly={readOnly}
          comp={!!(N[r.id].comp || N[r.id].main || N[r.id].set)}
          drop={drop?.row === r.id ? drop.where : null}
          renaming={renaming === r.id}
          onRename={(name) => {
            if (name !== null) rename(r.id, name);
            setRenaming(null);
            requestAnimationFrame(() => focusRow(r.id));
          }}
          onStartRename={() => !readOnly && setRenaming(r.id)}
          onDown={(e) => {
            if ((e.target as HTMLElement).closest('button, input')) return;
            if (e.button !== 0) return;
            if (e.shiftKey || e.metaKey || e.ctrlKey) select([r.id], { toggle: true });
            else if (!selSet.has(r.id)) select([r.id]);
            drag.current = { id: r.id, x: e.clientX, y: e.clientY, on: false };
          }}
        />
      ))}
    </div>
  );
}

interface RowProps {
  node: Node;
  depth: number;
  selected: boolean;
  within: boolean;
  expanded: boolean;
  focusable: boolean;
  frozen: boolean;
  readOnly: boolean;
  comp: boolean;
  drop: Drop['where'] | null;
  renaming: boolean;
  onRename: (name: string | null) => void;
  onStartRename: () => void;
  onDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const Row = memo(function Row({
  node: n,
  depth,
  selected,
  within,
  expanded,
  focusable,
  frozen,
  readOnly,
  comp,
  drop,
  renaming,
  onRename,
  onStartRename,
  onDown,
}: RowProps) {
  const hovered = useHovered(n.id);
  const kids = n.children.length > 0;
  return (
    <div
      data-row={n.id}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={kids ? expanded : undefined}
      tabIndex={focusable ? 0 : -1}
      className={cx(
        s.row,
        selected && s.rowSel,
        within && s.rowWithin,
        hovered && s.rowHover,
        !n.visible && s.rowHidden,
        comp && s.rowComp,
        depth === 0 && s.rowTop,
      )}
      data-drop={drop ?? undefined}
      style={{ '--depth': depth } as React.CSSProperties}
      onPointerDown={onDown}
      onPointerEnter={() => hover.set(n.id)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if ((e.target as HTMLElement).closest('[data-name]')) onStartRename();
        else focusOn([n.id]);
      }}
    >
      <span className={s.rowIndent} />
      {kids ? (
        <button
          type="button"
          tabIndex={-1}
          className={s.twisty}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(n.id, e.altKey);
          }}
        >
          <Icon name={expanded ? 'down' : 'chevron'} size={11} />
        </button>
      ) : (
        <span className={s.twisty} />
      )}
      <span className={s.rowIcon}>
        <Icon name={iconFor(n)} size={13} />
      </span>
      {renaming ? (
        <input
          className={s.renameInput}
          defaultValue={n.name}
          aria-label="Layer name"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') onRename(e.currentTarget.value);
            if (e.key === 'Escape') onRename(null);
          }}
          onBlur={(e) => onRename(e.currentTarget.value)}
        />
      ) : (
        <span className={s.rowName} data-name="">
          {n.name}
        </span>
      )}
      {!readOnly && (
        <span className={s.rowTools} data-on={n.locked || !n.visible || undefined}>
          <button
            type="button"
            tabIndex={-1}
            className={s.rowBtn}
            data-active={n.locked || undefined}
            aria-label={n.locked ? `Unlock ${n.name}` : `Lock ${n.name}`}
            title={
              frozen
                ? 'Layers in an instance follow the main component'
                : n.locked
                  ? 'Unlock (⇧⌘L)'
                  : 'Lock (⇧⌘L)'
            }
            disabled={frozen}
            onClick={(e) => {
              e.stopPropagation();
              toggle('locked', [n.id]);
            }}
          >
            <Icon name={n.locked ? 'lock' : 'unlock'} size={13} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            className={s.rowBtn}
            data-active={!n.visible || undefined}
            aria-label={n.visible ? `Hide ${n.name}` : `Show ${n.name}`}
            title={n.visible ? 'Hide (⇧⌘H)' : 'Show (⇧⌘H)'}
            onClick={(e) => {
              e.stopPropagation();
              toggle('visible', [n.id]);
            }}
          >
            <Icon name={n.visible ? 'eye' : 'eyeOff'} size={13} />
          </button>
        </span>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ assets */

function Thumb({ id }: { id: string }) {
  const doc = useSlice((st) => st.doc);
  const ready = useSlice((st) => st.ready);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!ready || !img.current) return;
    const n = doc.nodes[id];
    if (!n) return;
    const k = Math.min(1, 200 / Math.max(n.w, n.h));
    const t = setTimeout(() => {
      if (img.current) img.current.src = rasterize(doc.nodes, id, k * 2).toDataURL('image/png');
    }, 30);
    return () => clearTimeout(t);
  }, [doc.nodes, id, ready]);
  // A data URL drawn here, not a file the image optimiser could serve.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={img} alt="" className={s.thumbImg} />;
}

export function Assets() {
  const doc = useSlice((st) => st.doc);
  const [q, setQ] = useState('');
  const N = doc.nodes;
  const mains = Object.values(N).filter((n) => n.comp);
  const groups = new Map<string, Node[]>();
  for (const m of mains) {
    const g = m.comp?.set
      ? componentName(N, m.id)
      : N[m.parent]?.id === refs.pages.design
        ? 'Screens'
        : m.name;
    groups.set(g, [...(groups.get(g) ?? []), m]);
  }
  const match = (n: Node) =>
    !q || `${n.name} ${componentName(N, n.id)}`.toLowerCase().includes(q.toLowerCase());
  return (
    <div className={s.assets}>
      <label className={s.search}>
        <Icon name="search" size={13} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search assets"
          aria-label="Search assets"
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      <p className={s.hint}>
        Click a component to drop an instance into the page or the selected frame.
      </p>
      {[...groups.entries()].map(([name, list]) => {
        const shown = list.filter(match);
        if (!shown.length) return null;
        return (
          <section key={name} className={s.assetGroup}>
            <h3 className={s.overline}>{name}</h3>
            <ul className={s.assetList}>
              {shown.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={s.asset}
                    title={`Insert ${m.name}`}
                    onClick={() => {
                      const [x, y] = viewCenter();
                      insertInstance(m.id, { x, y });
                    }}
                  >
                    <span className={s.thumb}>
                      <Thumb id={m.id} />
                    </span>
                    <span className={s.assetName}>
                      {m.comp?.set
                        ? Object.entries(m.comp.props)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(', ')
                        : m.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function LeftTabs() {
  const left = useSlice((st) => st.left);
  return (
    <div className={s.tabs} role="tablist" aria-label="Left panel">
      {(['layers', 'assets'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={left === t}
          className={s.tab}
          onClick={() => set({ left: t })}
        >
          {t === 'layers' ? 'Layers' : 'Assets'}
        </button>
      ))}
    </div>
  );
}
