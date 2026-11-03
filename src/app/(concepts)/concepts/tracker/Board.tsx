'use client';

// The board: a column per status and real drag and drop. Mouse drags start after a few pixels,
// touch drags after a long press (so a swipe still scrolls). The card under the pointer leaves a
// gap where it will land, the board scrolls near its edges, Escape cancels, and the drop writes
// the new status and a manual position between its neighbours.

import { useEffect, useRef, useState } from 'react';
import { STATUSES, type Issue, type StatusId } from './model';
import { moveIssue, openCreate, sortIssues, visibleOf, type State } from './store';
import { Card, useFocusFollow } from './Cards';
import { Icon, StatusIcon } from './kit';
import s from './tracker.module.scss';

interface Drag {
  id: string;
  over: StatusId | null;
  index: number;
  h: number;
  w: number;
}

interface Pending {
  issue: Issue;
  x: number;
  y: number;
  offX: number;
  offY: number;
  w: number;
  h: number;
  touch: boolean;
  timer: number;
  live: boolean;
}

const EDGE = 64;

export function columnsOf(state: State): { id: StatusId; name: string; issues: Issue[] }[] {
  const list = visibleOf(state);
  const sorted = sortIssues(list, state.display.ordering);
  return STATUSES.map((st) => ({
    id: st.id,
    name: st.name,
    issues: sorted.filter((i) => i.status === st.id),
  })).filter((c) => state.display.showEmpty || c.issues.length);
}

export default function Board({ state }: { state: State }) {
  const columns = columnsOf(state);
  const order = columns.flatMap((c) => c.issues.map((i) => i.id));
  const scroller = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const pending = useRef<Pending | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const justDragged = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const manual = state.display.ordering === 'manual';
  const live = useRef({ columns, manual });
  const api = useRef<{ begin: () => void } | null>(null);
  const ghostPlacer = useRef<(() => void) | null>(null);
  useEffect(() => {
    live.current = { columns, manual };
  });

  useFocusFollow(state.focus, scroller);

  // Everything the drag does lives here, on refs, wired once.
  useEffect(() => {
    let current: Drag | null = null;
    let frame = 0;

    // Where the pointer would drop: the column under it, and the gap between cards.
    const locate = (x: number, y: number): { over: StatusId | null; index: number } => {
      const root = scroller.current;
      if (!root) return { over: null, index: 0 };
      const cols = [...root.querySelectorAll<HTMLElement>('[data-column]')];
      const col = cols.find((c) => {
        const r = c.getBoundingClientRect();
        return x >= r.left && x <= r.right;
      });
      if (!col) return { over: null, index: 0 };
      const over = col.dataset.column as StatusId;
      const cards = [...col.querySelectorAll<HTMLElement>('[data-issue]')].filter(
        (c) => c.dataset.issue !== pending.current?.issue.id,
      );
      let index = 0;
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        if (y > r.top + r.height / 2) index++;
      }
      return { over, index };
    };

    const update = (next: Drag | null) => {
      if (current && next && current.over === next.over && current.index === next.index) return;
      current = next;
      setDrag(next);
    };

    const retarget = () => {
      const p = pending.current;
      if (!p) return;
      const at = locate(pointer.current.x, pointer.current.y);
      update({ id: p.issue.id, over: at.over, index: at.index, h: p.h, w: p.w });
    };

    const placeGhost = () => {
      const p = pending.current;
      const g = ghost.current;
      if (p && g)
        g.style.transform = `translate(${pointer.current.x - p.offX}px, ${pointer.current.y - p.offY}px) rotate(2deg)`;
    };

    const begin = () => {
      const p = pending.current;
      if (!p || p.live) return;
      p.live = true;
      document.documentElement.dataset.trackerDragging = '';
      retarget();
      if (p.touch) navigator.vibrate?.(8);
      // The edge-scroll loop only runs while a card is in the air.
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const finish = (drop: boolean) => {
      const p = pending.current;
      const d = current;
      if (p) window.clearTimeout(p.timer);
      pending.current = null;
      delete document.documentElement.dataset.trackerDragging;
      update(null);
      if (!p?.live || !d || !drop || !d.over) return;
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
      const { columns: cols, manual: byHand } = live.current;
      const rest = (cols.find((c) => c.id === d.over)?.issues ?? []).filter(
        (i) => i.id !== p.issue.id,
      );
      const before = rest[d.index - 1]?.sort;
      const after = rest[d.index]?.sort;
      const same =
        d.over === p.issue.status &&
        (!byHand || ((before ?? -Infinity) < p.issue.sort && p.issue.sort < (after ?? Infinity)));
      if (same) return;
      const sort =
        before !== undefined && after !== undefined
          ? (before + after) / 2
          : before !== undefined
            ? before + 1024
            : after !== undefined
              ? after - 1024
              : p.issue.sort;
      moveIssue(p.issue.id, d.over, byHand ? sort : p.issue.sort);
    };

    api.current = { begin };
    ghostPlacer.current = placeGhost;

    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!p.live) {
        const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        // A touch that moves before the long press is a scroll; a mouse that moves is a drag.
        if (p.touch) {
          if (dist > 8) finish(false);
          return;
        }
        if (dist <= 4) return;
        begin();
      }
      placeGhost();
      retarget();
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pending.current?.live) {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pending.current?.live && e.cancelable) e.preventDefault();
    };
    // Near an edge the board scrolls sideways and the column under the pointer up or down,
    // faster the closer the pointer gets.
    const push = (at: number, lo: number, hi: number) =>
      at < lo + EDGE ? -(lo + EDGE - at) : at > hi - EDGE ? at - (hi - EDGE) : 0;
    function tick() {
      const p = pending.current;
      const root = scroller.current;
      if (p?.live && root) {
        const { x, y } = pointer.current;
        const r = root.getBoundingClientRect();
        const dx = push(x, r.left, r.right);
        const body = [...root.querySelectorAll<HTMLElement>('[data-column]')].find((c) => {
          const b = c.getBoundingClientRect();
          return x >= b.left && x <= b.right;
        });
        const br = body?.getBoundingClientRect();
        const dy = body && br ? push(y, br.top, br.bottom) : 0;
        if (dx) root.scrollBy(Math.max(-24, Math.min(24, dx * 0.3)), 0);
        if (dy && body) body.scrollBy(0, Math.max(-24, Math.min(24, dy * 0.3)));
        if (dx || dy) retarget();
      }
      frame = p?.live ? requestAnimationFrame(tick) : 0;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      pending.current = null;
      delete document.documentElement.dataset.trackerDragging;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, issue: Issue) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const touch = e.pointerType !== 'mouse';
    pointer.current = { x: e.clientX, y: e.clientY };
    pending.current = {
      issue,
      x: e.clientX,
      y: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      w: r.width,
      h: r.height,
      touch,
      live: false,
      timer: 0,
    };
    if (touch) pending.current.timer = window.setTimeout(() => api.current?.begin(), 280);
  };

  const dragged = drag ? columns.flatMap((c) => c.issues).find((i) => i.id === drag.id) : undefined;
  const tabbable = state.focus && order.includes(state.focus) ? state.focus : order[0];

  return (
    <div
      className={s.board}
      ref={scroller}
      onClickCapture={(e) => {
        if (justDragged.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      {columns.map((col) => {
        const over = drag?.over === col.id;
        // The dragged card stays mounted, hidden, so a touch keeps its target; the gap goes
        // between the cards that remain.
        const rest = col.issues.filter((i) => i.id !== drag?.id).length;
        let seen = 0;
        return (
          <section
            key={col.id}
            className={s.column}
            data-over={over || undefined}
            aria-label={`${col.name}, ${col.issues.length} issues`}
          >
            <header className={s.columnHead}>
              <StatusIcon status={col.id} />
              <h3>{col.name}</h3>
              <span className={s.count}>{col.issues.length}</span>
              <span className={s.grow} />
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => openCreate({ status: col.id })}
                aria-label={`Create an issue in ${col.name}`}
                title={`Create in ${col.name}`}
              >
                <Icon name="compose" size={14} />
              </button>
            </header>
            <div className={s.columnBody} data-column={col.id} role="list">
              {col.issues.map((issue) => {
                const lifted = issue.id === drag?.id;
                const at = lifted ? -1 : seen++;
                return (
                  <div
                    key={issue.id}
                    role="listitem"
                    className={s.cardSlot}
                    data-lifted={lifted || undefined}
                  >
                    {over && manual && drag.index === at && (
                      <div className={s.dropGap} style={{ height: drag.h }} aria-hidden="true" />
                    )}
                    <Card
                      issue={issue}
                      props={state.display.props}
                      focused={state.focus === issue.id}
                      selected={state.selected.includes(issue.id)}
                      order={order}
                      tabbable={tabbable === issue.id}
                      onPointerDown={onPointerDown}
                    />
                  </div>
                );
              })}
              {over && manual && drag.index >= rest && (
                <div className={s.dropGap} style={{ height: drag.h }} aria-hidden="true" />
              )}
              {!col.issues.length && !over && (
                <button
                  type="button"
                  className={s.columnEmpty}
                  onClick={() => openCreate({ status: col.id })}
                >
                  No issues. Drop one here, or press <kbd className={s.kbd}>C</kbd>
                </button>
              )}
            </div>
          </section>
        );
      })}
      {drag && dragged && (
        <div
          className={s.ghost}
          ref={(el) => {
            ghost.current = el;
            if (el) ghostPlacer.current?.();
          }}
          style={{ width: drag.w }}
          aria-hidden="true"
        >
          <Card
            issue={dragged}
            props={state.display.props}
            focused={false}
            selected={false}
            order={[]}
            tabbable={false}
          />
        </div>
      )}
    </div>
  );
}
