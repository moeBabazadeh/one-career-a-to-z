'use client';

// The listing: every byte of the image as analysis currently understands it, from undefined
// bytes to instructions, typed struct fields and strings, with plate comments, labels and
// cross-references. Virtualised, keyboard-driven, and synced with the decompiler and hex view.
import { useEffect, useMemo, useRef } from 'react';
import { follow, refOf, stepFunction } from './actions';
import { STAGE } from './analyze';
import { decompiled } from './c';
import { FILE } from './career';
import {
  FN_SRC,
  PROG,
  addrText,
  buildRows,
  fnOf,
  fromText,
  lineOf,
  nameAt,
  refsTo,
  rowOf,
  unitAt,
  type Row,
} from './program';
import { Toks, UnitCols, autoComment, bytesText, useViewport } from './parts';
import { act, useNotes, useUI } from './store';
import s from './re.module.scss';

export const ROW_H = 20;

/** The instructions of the C line the cursor is on, for the soft highlight. */
export function useLineAddrs() {
  const ui = useUI();
  return useMemo(() => {
    const fn = fnOf(ui.cursor, ui.stage);
    if (fn === null) return new Set<number>();
    const at = unitAt(ui.cursor, ui.stage)?.addr ?? ui.cursor;
    const line = ui.dtok && ui.dtok.fn === fn ? ui.dtok.line : lineOf(fn, at);
    return new Set(line >= 0 ? (FN_SRC.get(fn)?.lineAddrs[line] ?? []) : []);
  }, [ui.cursor, ui.stage, ui.dtok]);
}

function LabelRow({
  addr,
  stage,
  names,
}: {
  addr: number;
  stage: number;
  names: Record<string, string>;
}) {
  const name = nameAt(addr, stage, names) ?? addrText(addr);
  const refs = refsTo(addr, stage);
  const fn = stage >= STAGE.CODE && PROG.fns.has(addr);
  const obj = stage >= STAGE.TYPES ? PROG.objs.get(addr) : undefined;
  return (
    <>
      <span className={s.labelCell}>
        <span className={fn ? s.fnLabel : s.label} data-ref={addr}>
          {name}
        </span>
        {obj && (
          <span className={s.ty}>{`  ${obj.type}${obj.count > 1 ? `[${obj.count}]` : ''}`}</span>
        )}
      </span>
      {refs.length > 0 && stage >= STAGE.REFS && (
        <span className={s.xref}>
          {`XREF[${refs.length}]:  `}
          {refs.slice(0, 2).map((x, k) => (
            <span key={x.from}>
              {k ? ', ' : ''}
              <span className={s.xrefFrom} data-ref={x.from}>
                {fromText(x, stage, names)}
              </span>
            </span>
          ))}
          {refs.length > 2 ? ', …' : ''}
        </span>
      )}
    </>
  );
}

function RowView({
  row,
  stage,
  names,
  comments,
}: {
  row: Row;
  stage: number;
  names: Record<string, string>;
  comments: Record<string, string>;
}) {
  switch (row.k) {
    case 'gap':
      return null;
    case 'sec':
      return (
        <span
          className={s.secRow}
        >{`//  ${row.name}   ${row.flags}   ${addrText(row.addr)}-${addrText(row.end - 1)}`}</span>
      );
    case 'plate':
      return <span className={row.edge ? s.plateEdge : s.plate}>{row.text}</span>;
    case 'sig': {
      const toks = decompiled(row.addr)[0];
      return (
        <span className={s.sigRow}>
          {toks ? <Toks toks={toks} stage={stage} names={names} /> : 'undefined FUN(void)'}
        </span>
      );
    }
    case 'label':
      return <LabelRow addr={row.addr} stage={stage} names={names} />;
    case 'unit': {
      const u = row.u;
      const auto = u ? autoComment(u, stage) : null;
      const mine = comments[row.addr];
      return (
        <>
          <span className={s.addr}>{addrText(row.addr)}</span>
          <span className={s.bytes}>{bytesText(row.addr, u?.size ?? 1)}</span>
          <UnitCols u={u} addr={row.addr} stage={stage} names={names} />
          <span className={s.eol}>
            {mine ? (
              <span className={s.mine}>{`; ${mine}`}</span>
            ) : auto ? (
              <span className={auto.str ? s.str : s.cm}>{auto.text}</span>
            ) : null}
          </span>
        </>
      );
    }
  }
}

export default function Listing() {
  const ui = useUI();
  const notes = useNotes();
  const userLabels = useMemo(() => Object.keys(notes.names).map(Number), [notes.names]);
  const { rows, unitRows } = useMemo(() => buildRows(ui.stage, userLabels), [ui.stage, userLabels]);
  const box = useRef<HTMLDivElement>(null);
  const vp = useViewport(box);
  const lines = useLineAddrs();

  const cur = unitAt(ui.cursor, ui.stage)?.addr ?? ui.cursor;
  const cursorRow = rowOf(rows, unitRows, ui.cursor);
  const lastJump = useRef(-1);

  // Keep the cursor in view: a jump brings its header to the top, a step scrolls just enough.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const jumped = lastJump.current !== ui.jump;
    lastJump.current = ui.jump;
    const y = cursorRow * ROW_H;
    const h = el.clientHeight;
    const visible = y >= el.scrollTop && y + ROW_H <= el.scrollTop + h;
    if (jumped && !visible) {
      let head = cursorRow;
      while (
        head > 0 &&
        rows[head - 1].addr === rows[cursorRow].addr &&
        rows[head - 1].k !== 'unit'
      )
        head--;
      const labelled = head < cursorRow;
      el.scrollTop = labelled ? Math.max(0, (head - 1) * ROW_H) : Math.max(0, y - h / 3);
    } else if (!visible) el.scrollTop = y < el.scrollTop ? y : y + ROW_H - h;
  }, [cursorRow, ui.jump, rows]);

  const first = Math.max(0, Math.floor(vp.top / ROW_H) - 8);
  const last = Math.min(rows.length, Math.ceil((vp.top + vp.height) / ROW_H) + 8);

  const move = (delta: number) => {
    const k = unitRows.indexOf(cursorRow);
    const next = unitRows[Math.max(0, Math.min(unitRows.length - 1, k + delta))];
    if (next !== undefined) act.setCursor(rows[next].addr, ui.field);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const page = Math.max(1, Math.floor((box.current?.clientHeight ?? 400) / ROW_H) - 2);
    const keys: Record<string, () => void> = {
      ArrowDown: () => (e.ctrlKey || e.metaKey ? stepFunction(1) : move(1)),
      ArrowUp: () => (e.ctrlKey || e.metaKey ? stepFunction(-1) : move(-1)),
      PageDown: () => move(page),
      PageUp: () => move(-page),
      Home: () => act.goTo(rows[unitRows[0]].addr),
      End: () => act.goTo(rows[unitRows[unitRows.length - 1]].addr),
      ArrowRight: () => act.setCursor(ui.cursor, 'op'),
      ArrowLeft: () => act.setCursor(ui.cursor, 'addr'),
    };
    const run = keys[e.key];
    if (run && !e.altKey) {
      e.preventDefault();
      run();
    }
  };

  const onClick = (e: React.MouseEvent) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (!rowEl) return;
    const row = rows[Number(rowEl.dataset.row)];
    if (!row) return;
    const op = !!(e.target as HTMLElement).closest('[data-op]');
    const xref = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]');
    if (row.k === 'label' && xref && xref.dataset.ref !== String(row.addr)) {
      act.goTo(Number(xref.dataset.ref));
      return;
    }
    if (row.k === 'unit' && op && row.addr === cur && ui.field === 'op') {
      follow(refOf(row.u, ui.stage));
      return;
    }
    act.setCursor(row.addr, op && row.k === 'unit' ? 'op' : 'addr');
  };

  const fn = fnOf(ui.cursor, ui.stage);
  const title = fn !== null ? nameAt(fn, ui.stage, notes.names) : null;

  return (
    <section className={`${s.panel} ${s.listingPanel}`} data-panel="listing" aria-label="Listing">
      <header className={s.panelHead}>
        <span className={s.panelTitle}>Listing</span>
        <span className={s.panelSub}>{`${FILE}${title ? ` · ${title}` : ''}`}</span>
      </header>
      <div
        ref={box}
        className={s.listing}
        tabIndex={0}
        role="listbox"
        aria-label="Disassembly listing"
        aria-activedescendant={cursorRow >= first && cursorRow < last ? `lst-${cur}` : undefined}
        onKeyDown={onKey}
        onClick={onClick}
        onFocus={() => act.focus('listing')}
      >
        <div className={s.listingInner} style={{ height: rows.length * ROW_H }}>
          {rows.slice(first, last).map((row, k) => {
            const i = first + k;
            const isCur = i === cursorRow;
            const isHead = !isCur && row.addr === cur && row.k !== 'gap' && row.k !== 'unit';
            const cls = [
              s.row,
              s[`r_${row.k}`],
              isCur ? s.cur : '',
              isHead ? s.curHead : '',
              row.k === 'unit' && lines.has(row.addr) && !isCur ? s.hl : '',
              isCur && ui.field === 'op' ? s.onOp : '',
            ].join(' ');
            return (
              <div
                key={i}
                className={cls}
                style={{ transform: `translateY(${i * ROW_H}px)` }}
                data-row={i}
                {...(row.k === 'unit'
                  ? { role: 'option', id: `lst-${row.addr}`, 'aria-selected': isCur }
                  : { 'aria-hidden': true })}
              >
                <RowView row={row} stage={ui.stage} names={notes.names} comments={notes.comments} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
