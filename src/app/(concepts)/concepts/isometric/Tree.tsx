'use client';

// The model tree: assemblies, parts and patterns with visibility, isolate and a filter. It is a
// real tree widget: arrow keys move through it, right and left open and close, Enter selects.
import { useMemo, useRef, useState } from 'react';
import { Icon, KIND_ICON } from './icons';
import type { Flat, Item } from './models';
import s from './viewer.module.scss';

interface Props {
  flat: Flat;
  selected: string[];
  selParts: Set<string>;
  hidden: Set<string>;
  isolated: Set<string> | null;
  hover: string | null;
  onSelect(id: string, additive: boolean): void;
  onZoom(id: string): void;
  onToggle(id: string): void;
  onIsolate(id: string): void;
  onPreselect(id: string | null): void;
}

export function Tree({
  flat,
  selected,
  selParts,
  hidden,
  isolated,
  hover,
  onSelect,
  onZoom,
  onToggle,
  onIsolate,
  onPreselect,
}: Props) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(flat.order.filter((id) => flat.items[id].depth < 1)),
  );
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<string>(flat.root);
  const rows = useRef(new Map<string, HTMLDivElement>());

  // Rows on show: open branches, plus the way down to anything selected or hovered in the viewport.
  const forced = useMemo(() => {
    const f = new Set<string>();
    for (const id of [...selected, ...(hover ? [hover] : [])]) {
      let p = flat.items[id]?.parent;
      while (p) {
        f.add(p);
        p = flat.items[p].parent;
      }
    }
    return f;
  }, [flat, selected, hover]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const match = (it: Item) => `${it.name} ${it.ref ?? ''} ${it.pn}`.toLowerCase().includes(q);
      const keep = new Set<string>();
      for (const id of flat.order) {
        const it = flat.items[id];
        if (!match(it)) continue;
        let p: string | null = id;
        while (p) {
          keep.add(p);
          p = flat.items[p].parent;
        }
      }
      return flat.order.filter((id) => keep.has(id));
    }
    return flat.order.filter((id) => {
      let p = flat.items[id].parent;
      while (p) {
        if (!open.has(p) && !forced.has(p)) return false;
        p = flat.items[p].parent;
      }
      return true;
    });
  }, [flat, open, forced, query]);

  const toggleOpen = (id: string, to?: boolean) =>
    setOpen((o) => {
      const n = new Set(o);
      if (to ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });

  const move = (id: string) => {
    setFocus(id);
    rows.current.get(id)?.focus();
  };

  const onKey = (e: React.KeyboardEvent, it: Item) => {
    const i = visible.indexOf(it.id);
    const expanded = open.has(it.id) || forced.has(it.id) || !!query;
    switch (e.key) {
      case 'ArrowDown':
        if (i < visible.length - 1) move(visible[i + 1]);
        break;
      case 'ArrowUp':
        if (i > 0) move(visible[i - 1]);
        break;
      case 'ArrowRight':
        if (it.children.length && !expanded) toggleOpen(it.id, true);
        else if (it.children.length) move(it.children[0]);
        break;
      case 'ArrowLeft':
        if (it.children.length && expanded && !forced.has(it.id)) toggleOpen(it.id, false);
        else if (it.parent) move(it.parent);
        break;
      case 'Home':
        move(visible[0]);
        break;
      case 'End':
        move(visible[visible.length - 1]);
        break;
      case 'Enter':
      case ' ':
        onSelect(it.id, e.shiftKey || e.metaKey || e.ctrlKey);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const partCount = flat.parts.filter((p) => flat.items[p].kind !== 'reference').length;

  return (
    <div className={s.tree}>
      <div className={s.paneHead}>
        <h2>Model</h2>
        <span>{`${flat.bom.length} parts · ${partCount} instances`}</span>
      </div>
      <label className={s.filter}>
        <Icon name="search" size={14} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or designator"
          aria-label="Filter the model tree"
        />
      </label>
      <div
        className={s.treeScroll}
        role="tree"
        aria-label={`Parts of ${flat.model.tag} ${flat.model.name}`}
        aria-multiselectable="true"
        onPointerLeave={() => onPreselect(null)}
      >
        {visible.map((id) => {
          const it = flat.items[id];
          const has = it.children.length > 0;
          const expanded = has && (open.has(id) || forced.has(id) || !!query);
          const isSel = selected.includes(id) || (it.part && selParts.has(id));
          const off = it.parts.length > 0 && it.parts.every((p) => hidden.has(p));
          const some = !off && it.parts.some((p) => hidden.has(p));
          const outside =
            !!isolated && it.parts.length > 0 && it.parts.every((p) => !isolated.has(p));
          const isolatedHere =
            !!isolated &&
            it.parts.length > 0 &&
            it.parts.length === isolated.size &&
            it.parts.every((p) => isolated.has(p));
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              role="treeitem"
              aria-level={it.depth + 1}
              aria-expanded={has ? expanded : undefined}
              aria-selected={isSel}
              tabIndex={focus === id ? 0 : -1}
              className={s.row}
              data-hover={hover === id || undefined}
              data-off={off || outside || undefined}
              style={{ '--depth': it.depth } as React.CSSProperties}
              onClick={(e) => {
                setFocus(id);
                onSelect(id, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
              onDoubleClick={() => onZoom(id)}
              onKeyDown={(e) => onKey(e, it)}
              onPointerEnter={() => onPreselect(id)}
              onFocus={() => setFocus(id)}
            >
              {has ? (
                <button
                  type="button"
                  tabIndex={-1}
                  className={s.twist}
                  data-open={expanded || undefined}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOpen(id);
                  }}
                >
                  <Icon name="chevron" size={12} />
                </button>
              ) : (
                <span className={s.twist} />
              )}
              <Icon
                name={it.pattern ? 'layers' : KIND_ICON[it.kind]}
                size={14}
                className={s.rowIcon}
              />
              <span className={s.rowName}>{it.name}</span>
              {it.pattern && <span className={s.qty}>{`×${it.children.length}`}</span>}
              {it.ref && !it.pattern && <span className={s.refTag}>{it.ref}</span>}
              <span className={s.rowTools}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={s.rowTool}
                  data-on={isolatedHere || undefined}
                  aria-label={isolatedHere ? `Exit isolate` : `Isolate ${it.name}`}
                  title={isolatedHere ? 'Exit isolate (I)' : 'Isolate (I)'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onIsolate(id);
                  }}
                >
                  <Icon name="target" size={13} />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  className={s.rowTool}
                  data-state={off ? 'off' : some ? 'some' : undefined}
                  aria-label={off ? `Show ${it.name}` : `Hide ${it.name}`}
                  title={off ? 'Show (H)' : 'Hide (H)'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(id);
                  }}
                >
                  <Icon name={off ? 'eyeOff' : 'eye'} size={13} />
                </button>
              </span>
            </div>
          );
        })}
        {!visible.length && <p className={s.empty}>{`Nothing matches “${query}”.`}</p>}
      </div>
    </div>
  );
}
