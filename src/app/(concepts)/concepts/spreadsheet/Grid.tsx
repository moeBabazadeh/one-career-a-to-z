'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';
import { cfMap, highlight } from './analysis';
import { a1, colName } from './engine/address';
import { isErr, MAX_C, MAX_R } from './engine/types';
import { FormulaInput, Assist } from './Editor';
import { ChartView } from './Charts';
import { TraceLayer } from './Trace';
import { boxOf, geometry, HEAD_H, ROW_H, ROWHEAD_W, type Pos, type Rect } from './model';
import { canPoint, shown, useStore } from './store';
import { cx, focusGrid, isPhone, Icon } from './ui';
import s from './sheet.module.scss';

// The grid: a real <table> with sticky headers and frozen panes, selection drawn on the cells,
// text that overflows into empty neighbours, conditional formats, and an overlay layer for the
// charts, trace arrows, the copy marquee, the formula's coloured reference boxes and the fill
// handle. Mouse, touch and keyboard all drive the same store.

const LINKY = /^(https?:\/\/|mailto:)\S+$/;

type Drag = {
  kind: 'sel' | 'point' | 'fill' | 'extend' | 'cols' | 'rows';
  start: Pos;
  src?: Rect;
  last?: { x: number; y: number };
};

export default function Grid() {
  const st = useStore();
  const { ui, book } = st;
  const view = ui.view;
  const L = st.layouts[view];
  const sel = st.sel();
  const x = st.rect();
  const act = sel.active;
  const edit = ui.edit;
  const editHere = edit && edit.sheet === view ? edit : null;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const scroller = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const drag = useRef<Drag | null>(null);
  const tap = useRef<{ pos: Pos; x: number; y: number } | null>(null);
  const handled = useRef({ copy: false, paste: false });
  const [fillTo, setFillTo] = useState<Rect | null>(null);
  const fillRef = useRef<Rect | null>(null);

  const g = geometry(L);
  const ncols = L.cols.length;
  const W = g.colX[ncols];
  const H = g.rowY[L.rows];
  const cf = cfMap(book, view, L);
  const editRefs =
    edit && edit.text.startsWith('=')
      ? highlight(edit.text, book, edit.sheet).refs.filter((r) => r.area.sheet === view)
      : [];
  const pointing = !!edit && canPoint(edit);
  const wholeCols = x.r0 === 0 && x.r1 === L.rows - 1;
  const wholeRows = x.c0 === 0 && x.c1 === ncols - 1;

  /* ------------------------------------------------------------ keep the active cell in view */

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const Lv = st.layouts[st.ui.view];
    const gv = geometry(Lv);
    const p = st.sel().focus;
    const left = gv.colX[p.c];
    const right = gv.colX[Math.min(p.c + 1, gv.colX.length - 1)];
    const top = gv.rowY[p.r];
    const bottom = gv.rowY[Math.min(p.r + 1, gv.rowY.length - 1)];
    if (p.c >= Lv.freeze.c) {
      if (left < el.scrollLeft + ROWHEAD_W + gv.frozenW)
        el.scrollLeft = left - ROWHEAD_W - gv.frozenW;
      else if (right > el.scrollLeft + el.clientWidth)
        el.scrollLeft = Math.min(right - el.clientWidth, left - ROWHEAD_W - gv.frozenW);
    }
    if (p.r >= Lv.freeze.r) {
      if (top < el.scrollTop + HEAD_H + gv.frozenH) el.scrollTop = top - HEAD_H - gv.frozenH;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    }
  }, [st, view, sel.focus.r, sel.focus.c]);

  /* ------------------------------------------------------------ pointer */

  const toCell = (clientX: number, clientY: number): Pos => {
    const el = scroller.current as HTMLDivElement;
    const b = el.getBoundingClientRect();
    const vx = clientX - b.left;
    const vy = clientY - b.top;
    const gv = geometry(st.layouts[st.ui.view]);
    const cxp = vx < ROWHEAD_W + gv.frozenW ? vx : vx + el.scrollLeft;
    const cyp = vy < HEAD_H + gv.frozenH ? vy : vy + el.scrollTop;
    let c = gv.colX.findIndex((v, i) => i < gv.colX.length - 1 && cxp >= v && cxp < gv.colX[i + 1]);
    let r = gv.rowY.findIndex((v, i) => i < gv.rowY.length - 1 && cyp >= v && cyp < gv.rowY[i + 1]);
    if (c < 0) c = cxp < ROWHEAD_W ? 0 : gv.colX.length - 2;
    if (r < 0) r = cyp < HEAD_H ? 0 : gv.rowY.length - 2;
    return { r, c };
  };

  const onDragMove = (clientX: number, clientY: number) => {
    const d = drag.current;
    if (!d) return;
    d.last = { x: clientX, y: clientY };
    const p = toCell(clientX, clientY);
    if (d.kind === 'sel' || d.kind === 'extend') st.select(p, true);
    else if (d.kind === 'point') st.pointTo(st.ui.view, d.start, p);
    else if (d.kind === 'cols') st.selectCols(Math.min(d.start.c, p.c), Math.max(d.start.c, p.c));
    else if (d.kind === 'rows') st.selectRows(Math.min(d.start.r, p.r), Math.max(d.start.r, p.r));
    else if (d.kind === 'fill' && d.src) {
      const src = d.src;
      const down = p.r - src.r1;
      const up = src.r0 - p.r;
      const right = p.c - src.c1;
      const left = src.c0 - p.c;
      const best = Math.max(down, up, right, left);
      const next =
        best <= 0
          ? null
          : best === down
            ? { ...src, r1: p.r }
            : best === up
              ? { ...src, r0: p.r }
              : best === right
                ? { ...src, c1: p.c }
                : { ...src, c0: p.c };
      fillRef.current = next;
      setFillTo(next);
    }
  };

  const startDrag = (d: Drag, e: RPointerEvent) => {
    drag.current = { ...d, last: { x: e.clientX, y: e.clientY } };
    let raf = 0;
    fillRef.current = null;
    const move = (ev: PointerEvent) => onDragMove(ev.clientX, ev.clientY);
    // Dragging past the edge scrolls the grid, as it does in any spreadsheet.
    const tick = () => {
      const el = scroller.current;
      const last = drag.current?.last;
      if (el && last) {
        const b = el.getBoundingClientRect();
        const gv = geometry(st.layouts[st.ui.view]);
        let dx = 0;
        let dy = 0;
        if (last.x > b.right - 20) dx = 16;
        else if (last.x < b.left + ROWHEAD_W + gv.frozenW + 6 && el.scrollLeft > 0) dx = -16;
        if (last.y > b.bottom - 20) dy = 16;
        else if (last.y < b.top + HEAD_H + gv.frozenH + 4 && el.scrollTop > 0) dy = -16;
        if (dx || dy) {
          el.scrollBy(dx, dy);
          onDragMove(last.x, last.y);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const up = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const dd = drag.current;
      drag.current = null;
      if (dd?.kind === 'fill') {
        const target = fillRef.current;
        fillRef.current = null;
        setFillTo(null);
        if (target) st.fill(target);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(`.${s.overlayUi}`)) return;
    const th = target.closest<HTMLElement>('th');
    const td = target.closest<HTMLElement>('td[data-r]');
    const touch = e.pointerType === 'touch';
    if (th) {
      if (target.closest(`.${s.resizer}`)) return;
      if (st.ui.edit) st.commit(null);
      if (th.dataset.col) {
        const c = Number(th.dataset.col);
        const startC = e.shiftKey ? st.sel().anchor.c : c;
        st.selectCols(Math.min(startC, c), Math.max(startC, c));
        if (!touch) startDrag({ kind: 'cols', start: { r: 0, c: startC } }, e);
      } else if (th.dataset.row) {
        const r = Number(th.dataset.row);
        const startR = e.shiftKey ? st.sel().anchor.r : r;
        st.selectRows(Math.min(startR, r), Math.max(startR, r));
        if (!touch) startDrag({ kind: 'rows', start: { r: startR, c: 0 } }, e);
      } else if (th.dataset.corner) st.selectAll();
      focusGrid();
      return;
    }
    if (!td) return;
    const pos = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
    const ed = st.ui.edit;
    if (ed && canPoint(ed)) {
      // Pointing: the click writes a reference into the formula instead of moving away.
      e.preventDefault();
      st.pointTo(st.ui.view, pos, pos);
      if (!touch) startDrag({ kind: 'point', start: pos }, e);
      return;
    }
    if (touch) {
      tap.current = { pos, x: e.clientX, y: e.clientY };
      return;
    }
    if (ed) st.commit(null);
    st.select(pos, e.shiftKey);
    table.current?.focus({ preventScroll: true });
    startDrag({ kind: 'sel', start: pos }, e);
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const t = tap.current;
    tap.current = null;
    if (!t || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) return;
    // A tap on the cell that's already active opens the editor; otherwise it selects.
    const a = st.sel().active;
    const single = st.rect().r0 === st.rect().r1 && st.rect().c0 === st.rect().c1;
    if (st.ui.edit) st.commit(null);
    if (single && a.r === t.pos.r && a.c === t.pos.c && !(e.target as HTMLElement).closest('a'))
      st.startEdit(isPhone() ? 'sheet' : 'cell', 'edit');
    else st.select(t.pos);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>('td[data-r]');
    if (!td || st.ui.edit || (e.target as HTMLElement).closest('a')) return;
    st.startEdit(isPhone() ? 'sheet' : 'cell', 'edit');
  };

  /* ------------------------------------------------------------ column resize */

  const startResize = (c: number, e: RPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sheet = st.ui.view;
    const startX = e.clientX;
    const before = st.layouts[sheet].cols[c];
    let w = before;
    const move = (ev: PointerEvent) => {
      w = Math.max(24, Math.round(before + ev.clientX - startX));
      st.previewCol(sheet, c, w);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      st.previewCol(sheet, c, before);
      st.resizeCol(sheet, c, before, w);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Double-clicking a column's edge fits it to its widest value. */
  const autofit = (c: number) => {
    const probe = table.current?.querySelector('td');
    const ctx = document.createElement('canvas').getContext('2d');
    if (!probe || !ctx) return;
    const cs = getComputedStyle(probe);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let w = 0;
    const sheet = st.ui.view;
    const Lv = st.layouts[sheet];
    for (let r = 0; r < Lv.rows; r++) {
      if (Lv.merges.some((m) => m.r === r && c >= m.c0 && c <= m.c1)) continue;
      const cell = st.book.cell(sheet, r, c);
      if (!cell) continue;
      const bold = cell.style?.b ? 1.06 : 1;
      w = Math.max(w, ctx.measureText(shown(cell, st.ui.showFormulas).text).width * bold);
    }
    const next = Math.max(40, Math.min(640, Math.ceil(w + 18)));
    st.resizeCol(sheet, c, Lv.cols[c], next);
  };

  /* ------------------------------------------------------------ keyboard */

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (st.ui.edit || e.target !== e.currentTarget) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    const rowsPerPage = Math.max(
      1,
      Math.floor((scroller.current?.clientHeight ?? 400) / ROW_H) - 2,
    );
    const arrows: Record<string, [number, number]> = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
    };
    if (arrows[k] && !e.altKey) {
      e.preventDefault();
      st.move(arrows[k][0], arrows[k][1], e.shiftKey, mod);
      return;
    }
    if (e.altKey && (k === 'ArrowDown' || k === 'ArrowUp' || k === 'PageDown' || k === 'PageUp')) {
      e.preventDefault();
      const n = st.layouts.length;
      st.setView((st.ui.view + (k === 'ArrowDown' || k === 'PageDown' ? 1 : n - 1)) % n);
      return;
    }
    if (mod && (k === 'PageDown' || k === 'PageUp')) {
      e.preventDefault();
      const n = st.layouts.length;
      st.setView((st.ui.view + (k === 'PageDown' ? 1 : n - 1)) % n);
      return;
    }
    switch (k) {
      case 'Enter':
        e.preventDefault();
        if (e.altKey) {
          const cell = st.book.cell(st.ui.view, st.sel().active.r, st.sel().active.c);
          const href =
            cell?.link ??
            (typeof cell?.value === 'string' && LINKY.test(cell.value) ? cell.value : null);
          if (href) window.open(href, '_blank', 'noopener');
          return;
        }
        st.advance(e.shiftKey ? -1 : 1, 0);
        return;
      case 'Tab':
        e.preventDefault();
        st.advance(0, e.shiftKey ? -1 : 1);
        return;
      case 'F2':
        e.preventDefault();
        st.startEdit(isPhone() ? 'sheet' : 'cell', 'edit');
        return;
      case 'F9':
        e.preventDefault();
        st.recalcAll();
        return;
      case 'Escape':
        if (st.ui.clip) st.set({ clip: null });
        else if (st.ui.trace) st.set({ trace: null });
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        st.clear();
        return;
      case 'Home':
        e.preventDefault();
        st.select(mod ? { r: 0, c: 0 } : { r: st.sel().active.r, c: 0 }, e.shiftKey);
        return;
      case 'End': {
        e.preventDefault();
        const used = Math.max(0, st.book.usedRows(st.ui.view) - 1);
        st.select(
          mod ? { r: used, c: ncols - 1 } : { r: st.sel().active.r, c: ncols - 1 },
          e.shiftKey,
        );
        return;
      }
      case 'PageDown':
      case 'PageUp':
        e.preventDefault();
        st.page(k === 'PageDown' ? 1 : -1, rowsPerPage, e.shiftKey);
        return;
    }
    if (k === ' ' && e.shiftKey && !mod) {
      e.preventDefault();
      st.selectRows(x.r0, x.r1);
      return;
    }
    if (k === ' ' && e.ctrlKey) {
      e.preventDefault();
      st.selectCols(x.c0, x.c1);
      return;
    }
    if (e.altKey && e.code === 'Equal') {
      e.preventDefault();
      st.autoSum();
      return;
    }
    if (mod) {
      const lower = k.toLowerCase();
      if (lower === 'a') {
        e.preventDefault();
        st.selectAll();
      } else if (lower === 'b' || lower === 'i') {
        e.preventDefault();
        st.toggleStyle(lower);
      } else if (lower === '[') {
        e.preventDefault();
        st.selectPrecedents();
      } else if (lower === 'c' || lower === 'x') {
        // The copy event does the work; this is the fallback where a browser doesn't send one.
        handled.current.copy = false;
        const cut = lower === 'x';
        setTimeout(() => {
          if (handled.current.copy) return;
          const text = st.copy(cut);
          navigator.clipboard?.writeText(text).catch(() => {});
        }, 0);
      } else if (lower === 'v') {
        handled.current.paste = false;
        setTimeout(() => {
          if (!handled.current.paste) st.paste();
        }, 30);
      }
      return;
    }
    if (k.length === 1 && !e.altKey) {
      e.preventDefault();
      st.startEdit(isPhone() ? 'sheet' : 'cell', 'enter', k);
    }
  };

  /* ------------------------------------------------------------ rendering */

  const shadow = (
    r: number,
    c: number,
    c1: number,
    inSel: boolean,
    isActive: boolean,
  ): string | undefined => {
    const parts: string[] = [];
    if (isActive) parts.push('inset 0 0 0 2px var(--sel)');
    else if (inSel) {
      if (r === x.r0) parts.push('inset 0 1px 0 0 var(--sel)');
      if (r === x.r1) parts.push('inset 0 -1px 0 0 var(--sel)');
      if (c === x.c0) parts.push('inset 1px 0 0 0 var(--sel)');
      if (c1 === x.c1) parts.push('inset -1px 0 0 0 var(--sel)');
    }
    return parts.length ? parts.join(', ') : undefined;
  };

  const rows: ReactNode[] = [];
  for (let r = 0; r < L.rows; r++) {
    const tds: ReactNode[] = [];
    const frozenR = r < L.freeze.r;
    for (let c = 0; c < ncols; c++) {
      const m = L.merges.find((mm) => mm.r === r && mm.c0 === c);
      if (L.merges.some((mm) => mm.r === r && c > mm.c0 && c <= mm.c1)) continue;
      const c1 = m ? m.c1 : c;
      const cell = book.cell(view, r, c);
      const editing = !!editHere && editHere.r === r && editHere.c === c;
      const inCellEditor = editing && editHere?.where === 'cell';
      const formulas = ui.showFormulas && !!cell?.input.startsWith('=');
      const sh = editing ? { text: editHere?.text ?? '' } : shown(cell, ui.showFormulas);
      const v = cell?.value;
      const kind =
        editing || formulas
          ? 'text'
          : typeof v === 'number'
            ? 'num'
            : typeof v === 'boolean'
              ? 'bool'
              : isErr(v)
                ? 'err'
                : 'text';
      const style = cell?.style;
      const align =
        style?.align ??
        (kind === 'num' ? 'right' : kind === 'bool' || kind === 'err' ? 'center' : 'left');
      const hit = cf.get(r * MAX_C + c);
      const tone = hit?.tone ?? style?.tone;
      const inSel = r >= x.r0 && r <= x.r1 && c1 >= x.c0 && c <= x.c1;
      const isActive = r === act.r && c === act.c;
      const frozenC = c < L.freeze.c;
      const link =
        !editing && !formulas
          ? (cell?.link ?? (typeof v === 'string' && LINKY.test(v) ? v : undefined))
          : undefined;

      // Text spills into empty cells to its right, unless it wraps or clips.
      let spill = 0;
      if (
        align === 'left' &&
        kind === 'text' &&
        style?.wrap === undefined &&
        sh.text &&
        !m &&
        !inCellEditor
      ) {
        let w = L.cols[c];
        for (let n = c + 1; n < ncols && w < 1800; n++) {
          const next = book.cell(view, r, n);
          if (
            (next && next.input !== '') ||
            L.merges.some((mm) => mm.r === r && n >= mm.c0 && n <= mm.c1) ||
            (editHere && editHere.r === r && editHere.c === n)
          )
            break;
          w += L.cols[n];
        }
        if (w > L.cols[c]) spill = w;
      }

      const st2: CSSProperties = {};
      if (frozenR) st2.top = g.rowY[r];
      if (frozenC) st2.left = g.colX[c];
      const sh2 = shadow(r, c, c1, inSel, isActive && !inCellEditor);
      if (sh2) st2.boxShadow = sh2;
      if (hit?.scale !== undefined)
        st2.background = `color-mix(in oklab, var(--scale-hi) ${Math.round(hit.scale * 100)}%, var(--scale-lo))`;
      const err = isErr(v) ? v : null;
      const tip = err ? `${err.code} ${err.why}`.trim() : cell?.note;

      tds.push(
        <td
          key={c}
          id={`${uid}-${r}-${c}`}
          data-r={r}
          data-c={c}
          colSpan={m ? m.c1 - m.c0 + 1 : undefined}
          aria-selected={inSel}
          title={tip && !isActive ? tip : undefined}
          className={cx(
            s.cell,
            s[`al_${align}`],
            tone && s[`tone_${tone}`],
            style?.b && s.b,
            style?.i && s.i,
            style?.size && s[`size_${style.size}`],
            style?.fill && s[`fill_${style.fill}`],
            (style?.mono || formulas) && s.mono,
            style?.wrap === true && s.wrap,
            spill > 0 && s.spill,
            inSel && !isActive && s.inSel,
            isActive && s.active,
            frozenR && s.frozenR,
            frozenC && s.frozenC,
            r === L.freeze.r - 1 && s.freezeB,
            c === L.freeze.c - 1 && s.freezeR,
            err && s.isErr,
            editing && s.editing,
            ui.clip && st.inClip(view, r, c) && s.clipped,
          )}
          style={st2}
        >
          {hit?.bar !== undefined && (
            <span
              className={s.dataBar}
              style={{ width: `${Math.round(hit.bar * 100)}%` }}
              aria-hidden="true"
            />
          )}
          <div
            className={s.cv}
            style={
              spill
                ? { maxWidth: spill - 1 }
                : style?.wrap === true
                  ? { maxHeight: (L.rowH[r] ?? ROW_H) - 6 }
                  : undefined
            }
          >
            {link ? (
              <a
                href={link}
                target={link.startsWith('mailto:') ? undefined : '_blank'}
                rel="noopener noreferrer"
                tabIndex={-1}
                className={s.cellLink}
              >
                {sh.text}
              </a>
            ) : (
              sh.text
            )}
          </div>
          {cell?.note && <i className={s.noteMark} aria-hidden="true" />}
          {err && <i className={s.errMark} aria-hidden="true" />}
          {inCellEditor && editHere && (
            <div
              className={s.cellEditor}
              style={{ '--cw': `${g.colX[c1 + 1] - g.colX[c] + 1}px` } as CSSProperties}
            >
              <FormulaInput where="cell" label={`Contents of ${a1(r, c)}`} />
              <Assist edit={editHere} className={s.cellAssist} />
            </div>
          )}
        </td>,
      );
    }
    rows.push(
      <tr key={r} style={{ height: L.rowH[r] ?? ROW_H }}>
        <th
          scope="row"
          data-row={r}
          className={cx(
            s.rowHead,
            r >= x.r0 && r <= x.r1 && s.headOn,
            wholeRows && r >= x.r0 && r <= x.r1 && s.headFull,
            frozenR && s.frozenR,
          )}
          style={frozenR ? { top: g.rowY[r] } : undefined}
        >
          {r + 1}
        </th>
        {tds}
      </tr>,
    );
  }

  /* ------------------------------------------------------------ overlays */

  const handle = !edit && !ui.chart ? boxOf(g, x) : null;
  const clip = ui.clip && ui.clip.sheet === view ? boxOf(g, ui.clip.rect) : null;
  const card = !edit ? st.card(view, act.r, act.c) : null;
  const actCell = book.cell(view, act.r, act.c);
  const actLink =
    actCell?.link ??
    (typeof actCell?.value === 'string' && LINKY.test(actCell.value) ? actCell.value : null);
  const actBox = boxOf(g, {
    r0: act.r,
    c0: act.c,
    r1: act.r,
    c1: st.mergeAt(act.r, act.c)?.c1 ?? act.c,
  });

  return (
    <div
      ref={scroller}
      className={cx(s.scroller, !ui.gridlines && s.noLines, pointing && s.pointing)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onMouseDown={(e) => {
        // Keep the caret in the formula while pointing at cells.
        if (st.ui.edit && canPoint(st.ui.edit) && (e.target as HTMLElement).closest('td'))
          e.preventDefault();
      }}
    >
      <div className={s.content} style={{ width: W, height: H }}>
        <table
          ref={table}
          role="grid"
          tabIndex={0}
          data-grid-focus=""
          aria-label={`${L.name} sheet`}
          aria-rowcount={L.rows + 1}
          aria-colcount={ncols + 1}
          aria-multiselectable="true"
          aria-activedescendant={`${uid}-${act.r}-${act.c}`}
          className={s.table}
          style={{ width: W }}
          onKeyDown={onKeyDown}
          onCopy={(e) => {
            if (st.ui.edit) return;
            e.preventDefault();
            handled.current.copy = true;
            e.clipboardData.setData('text/plain', st.copy(false));
          }}
          onCut={(e) => {
            if (st.ui.edit) return;
            e.preventDefault();
            handled.current.copy = true;
            e.clipboardData.setData('text/plain', st.copy(true));
          }}
          onPaste={(e) => {
            if (st.ui.edit) return;
            e.preventDefault();
            handled.current.paste = true;
            st.paste(e.clipboardData.getData('text/plain'));
          }}
        >
          <colgroup>
            <col style={{ width: ROWHEAD_W }} />
            {L.cols.map((w, c) => (
              <col key={c} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: HEAD_H }}>
              <th className={s.corner} data-corner="1" aria-label="Select all">
                <span className={s.cornerMark} />
              </th>
              {L.cols.map((_, c) => (
                <th
                  key={c}
                  scope="col"
                  data-col={c}
                  className={cx(
                    s.colHead,
                    c >= x.c0 && c <= x.c1 && s.headOn,
                    wholeCols && c >= x.c0 && c <= x.c1 && s.headFull,
                    c < L.freeze.c && s.frozenC,
                  )}
                  style={c < L.freeze.c ? { left: g.colX[c] } : undefined}
                >
                  {colName(c)}
                  <span
                    className={s.resizer}
                    onPointerDown={(e) => startResize(c, e)}
                    onDoubleClick={() => autofit(c)}
                    aria-hidden="true"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>

        {L.charts.map((ch) => (
          <ChartView key={ch.id} def={ch} g={g} />
        ))}

        <TraceLayer g={g} />

        {editRefs.map((ref, i) => {
          const b = boxOf(g, ref.area);
          const live =
            !!edit?.point &&
            edit.point.end === edit.caret &&
            edit.text.slice(edit.point.start, edit.point.end) === ref.text;
          return (
            <div
              key={i}
              className={cx(s.refBox, s[`refBox${ref.color}`], live && s.refLive)}
              style={b}
              aria-hidden="true"
            />
          );
        })}

        {clip && (
          <svg
            className={s.ants}
            style={{
              left: clip.left - 1,
              top: clip.top - 1,
              width: clip.width + 2,
              height: clip.height + 2,
            }}
            aria-hidden="true"
          >
            <rect x={1} y={1} width={clip.width} height={clip.height} pathLength={100} />
          </svg>
        )}

        {fillTo && <div className={s.fillPreview} style={boxOf(g, fillTo)} aria-hidden="true" />}

        {handle && x.r1 < MAX_R && (
          <span
            className={cx(s.fillHandle, s.overlayUi)}
            style={{ left: handle.left + handle.width - 4, top: handle.top + handle.height - 4 }}
            title="Drag to fill; double-click to fill down"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const src = st.rect();
              startDrag(
                e.pointerType === 'touch'
                  ? { kind: 'extend', start: { r: src.r1, c: src.c1 } }
                  : { kind: 'fill', start: { r: src.r1, c: src.c1 }, src },
                e,
              );
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              st.fillDown();
            }}
          />
        )}

        {(card || actLink) && !fillTo && (
          <div
            className={cx(s.hoverCard, s.overlayUi)}
            style={
              actBox.left + actBox.width > 300
                ? {
                    left: actBox.left + actBox.width,
                    top: actBox.top + actBox.height + 4,
                    transform: 'translateX(-100%)',
                  }
                : { left: actBox.left, top: actBox.top + actBox.height + 4 }
            }
            role="note"
          >
            {card?.error && <p className={s.cardErr}>{card.error}</p>}
            {card?.note && <p className={s.cardNote}>{card.note}</p>}
            {actLink && (
              <a
                href={actLink}
                target={actLink.startsWith('mailto:') ? undefined : '_blank'}
                rel="noopener noreferrer"
                className={s.cardLink}
              >
                <Icon.link /> {actLink.replace(/^mailto:/, '')}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
