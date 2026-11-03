'use client';

// The bytes: sixteen to a row with their ASCII, structure overlays coloured by what analysis
// made of them, the cursor's item selected, and a data inspector that reads the bytes under the
// cursor every way a firmware engineer would want: integers, a pointer, a date, an instruction.
import { useEffect, useRef } from 'react';
import type { Unit } from './analyze';
import { useLineAddrs } from './Listing';
import {
  ABS_NOTE,
  BASE,
  END,
  PROG,
  addrText,
  byte,
  fnOf,
  nameAt,
  objOf,
  refText,
  u16,
  u32,
  unitAt,
  ymText,
} from './program';
import { unitSummary, useViewport } from './parts';
import { act, useNotes, useUI } from './store';
import { decode, hex, text } from './thumb';
import s from './re.module.scss';

const H = 20;
const ROWS = Math.ceil((END - BASE) / 16);
const FN_INDEX = new Map(PROG.fnList.map((a, k) => [a, k]));
const UNIT_INDEX = new Map(PROG.units.map((u, k) => [u.addr, k]));

function cellClass(u: Unit | null, stage: number): string {
  if (!u) return s.hUndef;
  if (u.k === 'ins') {
    const fn = fnOf(u.addr, stage);
    return (FN_INDEX.get(fn ?? -1) ?? 0) % 2 ? s.hCodeB : s.hCode;
  }
  if (u.k === 'str') return u.sym ? s.hSym : s.hStr;
  if (u.k === 'align') return s.hPad;
  if (u.addr < BASE + 64) return s.hVec;
  if (u.obj === undefined) return s.hPool;
  if (u.obj === PROG.symtab) return s.hSym;
  return (UNIT_INDEX.get(u.addr) ?? 0) % 2 ? s.hFieldB : s.hField;
}

const LEGEND: [string, string][] = [
  [s.hCode, 'code'],
  [s.hPool, 'literal pool'],
  [s.hField, 'struct field'],
  [s.hStr, 'string'],
  [s.hSym, 'symbol table'],
  [s.hVec, 'vectors'],
  [s.hPad, 'padding'],
];

function Inspector({
  at,
  stage,
  names,
}: {
  at: number;
  stage: number;
  names: Record<string, string>;
}) {
  const u = unitAt(at, stage);
  const room = END - at;
  const b = byte(at);
  const w = room >= 2 ? u16(at) : null;
  const d = room >= 4 ? u32(at) : null;
  const ins = room >= 2 ? decode(u16(at), room >= 4 ? u16(at + 2) : 0) : null;
  const obj = objOf(at, stage);
  const field =
    u && u.k === 'data' && u.field && obj !== null
      ? `${nameAt(obj, stage, names) ?? addrText(obj)}${u.field.startsWith('[') ? '' : '.'}${u.field}`
      : null;
  const ptr =
    d !== null &&
    ((d >= BASE && d < END) || (d >= 0x20000000 && d < 0x20020000) || ABS_NOTE.has(d));
  let ch = '';
  try {
    const n = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    ch = new TextDecoder('utf-8', { fatal: true }).decode(
      PROG.bytes.subarray(at - BASE, at - BASE + n),
    );
  } catch {
    ch = '';
  }
  const row = (k: string, v: React.ReactNode) => (
    <div key={k}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <aside className={s.inspector} aria-label="Data inspector">
      <h3>Inspector</h3>
      <dl>
        {row('Address', <b>{addrText(at)}</b>)}
        {row('Offset', `0x${hex(at - BASE)} (${(at - BASE).toLocaleString('en-US')})`)}
        {field && row('Field', field)}
        {row('Item', unitSummary(u, at, stage, names))}
        {row('uint8', `${b}  0x${hex(b, 2)}  0b${b.toString(2).padStart(8, '0')}`)}
        {w !== null && row('uint16 LE', `${w}  (int16 ${(w << 16) >> 16})`)}
        {d !== null && row('uint32 LE', `${d}  (int32 ${d | 0})`)}
        {d !== null && row('ym_t', ymText(d))}
        {row('UTF-8', ch && ch.charCodeAt(0) >= 0x20 ? `'${ch}'` : '—')}
        {d !== null &&
          row(
            'Pointer',
            ptr ? (
              <span className={s.glob}>
                {refText(d & ~(PROG.fns.has(d & ~1) ? 1 : 0), stage, names)}
              </span>
            ) : (
              '—'
            ),
          )}
        {row(
          'Thumb',
          ins ? (
            <code>
              {text(ins.ins, at).mn}{' '}
              {text(ins.ins, at)
                .ops.map((o) => o.v)
                .join('')}
            </code>
          ) : (
            '—'
          ),
        )}
      </dl>
    </aside>
  );
}

export default function Hex() {
  const ui = useUI();
  const notes = useNotes();
  const box = useRef<HTMLDivElement>(null);
  const vp = useViewport(box);
  const lines = useLineAddrs();
  const stage = ui.stage;
  const cur = unitAt(ui.cursor, stage);
  const selFrom = cur?.addr ?? ui.cursor;
  const selTo = selFrom + (cur?.size ?? 1);
  const hl = new Set<number>();
  lines.forEach((a) => {
    const u = unitAt(a, stage);
    for (let k = 0; k < (u?.size ?? 0); k++) hl.add(a + k);
  });

  const lastJump = useRef(-1);
  const row = Math.floor((ui.cursor - BASE) / 16);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const y = row * H;
    const jumped = lastJump.current !== ui.jump;
    lastJump.current = ui.jump;
    if (y < el.scrollTop || y + H > el.scrollTop + el.clientHeight)
      el.scrollTop = jumped
        ? Math.max(0, y - el.clientHeight / 3)
        : y < el.scrollTop
          ? y
          : y + H - el.clientHeight;
  }, [row, ui.jump]);

  const first = Math.max(0, Math.floor(vp.top / H) - 4);
  const last = Math.min(ROWS, Math.ceil((vp.top + vp.height) / H) + 4);

  const onClick = (e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (cell) act.setCursor(Number(cell.dataset.a));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const page = Math.max(1, Math.floor((box.current?.clientHeight ?? 200) / H) - 1) * 16;
    const delta: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 16,
      ArrowUp: -16,
      PageDown: page,
      PageUp: -page,
    };
    if (e.key in delta && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      act.setCursor(Math.max(BASE, Math.min(END - 1, ui.cursor + delta[e.key])));
    }
  };

  return (
    <div className={s.hexWrap}>
      <div className={s.hexMain}>
        <ul className={s.legend} aria-label="Overlay colours">
          {LEGEND.map(([cls, label]) => (
            <li key={label}>
              <i className={cls} />
              {label}
            </li>
          ))}
        </ul>
        <div
          ref={box}
          className={s.hex}
          tabIndex={0}
          onClick={onClick}
          onKeyDown={onKey}
          onFocus={() => act.focus('hex')}
          aria-label={`Bytes, cursor at ${addrText(ui.cursor)}`}
        >
          <div className={s.hexInner} style={{ height: ROWS * H }}>
            {Array.from({ length: last - first }, (_, k) => {
              const r = first + k;
              const a0 = BASE + r * 16;
              const cells = Array.from({ length: 16 }, (_, c) => a0 + c).filter((a) => a < END);
              return (
                <div key={r} className={s.hexRow} style={{ transform: `translateY(${r * H}px)` }}>
                  <span className={s.addr}>{addrText(a0)}</span>
                  <span className={s.hexBytes}>
                    {cells.map((a) => {
                      const u = unitAt(a, stage);
                      const cls = [
                        s.hb,
                        cellClass(u, stage),
                        a >= selFrom && a < selTo ? s.hSel : '',
                        a === ui.cursor ? s.hCur : '',
                        hl.has(a) && !(a >= selFrom && a < selTo) ? s.hHl : '',
                        (a & 15) === 8 ? s.hMid : '',
                      ].join(' ');
                      return (
                        <span key={a} className={cls} data-a={a}>
                          {hex(byte(a), 2)}
                        </span>
                      );
                    })}
                  </span>
                  <span className={s.hexAscii}>
                    {cells.map((a) => {
                      const b = byte(a);
                      return (
                        <span
                          key={a}
                          className={`${a >= selFrom && a < selTo ? s.hSel : ''} ${b >= 0x20 && b < 0x7f ? '' : s.dim}`}
                          data-a={a}
                        >
                          {b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'}
                        </span>
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Inspector at={ui.cursor} stage={stage} names={notes.names} />
    </div>
  );
}
