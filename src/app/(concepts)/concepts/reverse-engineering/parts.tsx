'use client';

// Pieces the views share: C tokens drawn with live names, a listing unit's columns, the
// auto-comments, and a viewport hook for the virtualised lists.
import { useEffect, useState } from 'react';
import { fmt } from '../_shared/data';
import { refOf } from './actions';
import { STAGE, type Unit } from './analyze';
import type { CTok } from './c';
import {
  ABS_NOTE,
  PROG,
  TYPE_FIELDS,
  addrText,
  byte,
  cstr,
  nameAt,
  refText,
  stringAt,
  unitAt,
  ymText,
  type Names,
} from './program';
import { hex } from './thumb';
import s from './re.module.scss';

/* ------------------------------------------------------------------ C tokens */

const TOK_CLASS: Record<string, string> = {
  kw: s.kw,
  ty: s.ty,
  num: s.num,
  str: s.str,
  chr: s.str,
  cm: s.cm,
  fn: s.fnRef,
  glob: s.glob,
  fld: s.fld,
  var: s.var,
  const: s.cst,
};

/** The text a token shows: a symbol's current name, or the token itself. */
export const tokText = (t: CTok, stage: number, names: Names) =>
  t.at !== undefined && (t.t === 'fn' || t.t === 'glob')
    ? (nameAt(t.at, stage, names) ?? t.v)
    : t.v;

export function Toks({
  toks,
  stage,
  names,
  picked,
  same,
  line,
}: {
  toks: CTok[];
  stage: number;
  names: Names;
  picked?: number | null;
  same?: string | null;
  line?: number;
}) {
  return (
    <>
      {toks.map((t, k) => {
        if (t.t === 'ws' || t.t === 'p') return t.v;
        const text = tokText(t, stage, names);
        const cls = [
          TOK_CLASS[t.t],
          k === picked ? s.picked : '',
          same && text === same && k !== picked ? s.same : '',
        ].join(' ');
        return (
          <span key={k} className={cls} data-tok={k} data-line={line} data-ref={t.at}>
            {text}
          </span>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ listing units */

const strip = (v: number) => (PROG.fns.has(v & ~1) ? v & ~1 : v);

/** The C type a data unit is shown as. */
export function dataType(u: Extract<Unit, { k: 'data' }>): string {
  if (u.obj !== undefined) {
    const o = PROG.objs.get(u.obj);
    const field = (u.field ?? '').replace(/^\[\d+\]\.?/, '');
    if (o?.type === 'char *') return 'char *';
    const t = o ? TYPE_FIELDS.get(`${o.type}.${field}`) : undefined;
    if (t) return t;
  }
  if (u.dt === 'addr' || u.dt === 'ptr') return 'addr';
  if (u.dt === 'magic') return 'char[4]';
  if (u.dt === 'ym') return 'ym_t';
  return { u8: 'uint8_t', u16: 'uint16_t', u32: 'uint' }[u.dt];
}

/** A data unit's value, as text. */
export function dataValue(
  u: Extract<Unit, { k: 'data' }>,
  stage: number,
  names: Names,
): { text: string; ref?: number } {
  if (u.dt === 'ptr' || u.dt === 'addr') {
    if (!u.value) return { text: 'NULL' };
    const to = strip(u.value);
    return { text: refText(to, stage, names), ref: to };
  }
  if (u.dt === 'ym') return { text: ymText(u.value) };
  if (u.dt === 'magic')
    return {
      text: cstr(
        String.fromCharCode(
          u.value & 0xff,
          (u.value >> 8) & 0xff,
          (u.value >> 16) & 0xff,
          u.value >>> 24,
        ),
      ),
    };
  if (u.values && u.flags)
    return { text: u.value ? u.values.filter((_, k) => u.value & (1 << k)).join(' | ') : '0' };
  if (u.values?.[u.value]) return { text: u.values[u.value] };
  return { text: String(u.value) };
}

/** What the listing says to the right of a unit, when it says anything. */
export function autoComment(u: Unit, stage: number): { text: string; str: boolean } | null {
  if (u.k === 'data' && u.dt === 'ym' && u.value & 0xffff)
    return { text: fmt.month({ y: u.value & 0xffff, m: (u.value >>> 16) & 0xff }), str: false };
  if (u.k === 'data' && (u.dt === 'u16' || u.dt === 'u32') && u.value > 9 && !u.values)
    return { text: `0x${hex(u.value)}`, str: false };
  const to = refOf(u, stage);
  if (to === null) return null;
  const str = stringAt(to, stage);
  if (str !== null) return { text: cstr(str), str: true };
  const note = stage >= STAGE.SYMBOLS ? ABS_NOTE.get(to) : undefined;
  return note ? { text: note, str: false } : null;
}

export const bytesText = (a: number, size: number) => {
  const n = Math.min(size, 4);
  const out = Array.from({ length: n }, (_, k) => hex(byte(a + k), 2)).join(' ');
  return size > 4 ? `${out}…` : out;
};

/** A unit's mnemonic and operand columns. */
export function UnitCols({
  u,
  addr,
  stage,
  names,
}: {
  u: Unit | null;
  addr: number;
  stage: number;
  names: Names;
}) {
  if (!u) {
    const b = byte(addr);
    return (
      <>
        <span className={s.mn}>??</span>
        <span className={s.ops}>
          <span className={s.num}>{`${hex(b, 2).toUpperCase()}h`}</span>
          {b >= 0x20 && b < 0x7f ? (
            <span className={s.dim}>{`    '${String.fromCharCode(b)}'`}</span>
          ) : null}
        </span>
      </>
    );
  }
  if (u.k === 'ins') {
    return (
      <>
        <span className={s.mn}>{u.t.mn}</span>
        <span className={s.ops} data-op="">
          {u.t.ops.map((o, k) => {
            if (o.t === 'reg')
              return (
                <span key={k} className={s.reg}>
                  {o.v}
                </span>
              );
            if (o.t === 'imm')
              return (
                <span key={k} className={s.num}>
                  {o.v}
                </span>
              );
            if (o.t === 'addr') {
              const at = o.at as number;
              return (
                <span key={k} className={PROG.fns.has(at) ? s.fnRef : s.labRef} data-ref={at}>
                  {refText(at, stage, names)}
                </span>
              );
            }
            if (o.t === 'lit') {
              const pool = stage >= STAGE.REFS ? unitAt(o.at as number, stage) : null;
              if (pool && pool.k === 'data') {
                if (pool.dt !== 'ptr')
                  return <span key={k} className={s.num}>{`=0x${hex(pool.value)}`}</span>;
                const to = strip(pool.value);
                return (
                  <span key={k}>
                    =
                    <span className={PROG.fns.has(to) ? s.fnRef : s.glob} data-ref={to}>
                      {refText(to, stage, names)}
                    </span>
                  </span>
                );
              }
            }
            return <span key={k}>{o.v}</span>;
          })}
        </span>
      </>
    );
  }
  if (u.k === 'data') {
    const v = dataValue(u, stage, names);
    const field =
      u.obj !== undefined && u.field ? (u.field.startsWith('[') ? u.field : `.${u.field}`) : null;
    return (
      <>
        <span className={s.mn}>{dataType(u)}</span>
        <span className={s.ops} data-op="">
          {field && <span className={s.fld}>{`${field}  `}</span>}
          {v.ref !== undefined ? (
            <span className={PROG.fns.has(v.ref) ? s.fnRef : s.glob} data-ref={v.ref}>
              {v.text}
            </span>
          ) : (
            <span className={u.dt === 'magic' ? s.str : s.num}>{v.text}</span>
          )}
        </span>
      </>
    );
  }
  if (u.k === 'str') {
    return (
      <>
        <span className={s.mn}>ds</span>
        <span className={`${s.ops} ${s.str}`}>{cstr(u.s)}</span>
      </>
    );
  }
  return (
    <>
      <span className={s.mn}>align</span>
      <span className={s.ops}>
        <span className={s.num}>{u.size}</span>
        <span className={s.dim}>{u.size === 1 ? ' byte' : ' bytes'}</span>
      </span>
    </>
  );
}

/** One line describing a unit, for the status bar and dialogs. */
export function unitSummary(u: Unit | null, addr: number, stage: number, names: Names): string {
  if (!u) return `?? ${hex(byte(addr), 2).toUpperCase()}h`;
  if (u.k === 'ins') {
    const ops = u.t.ops
      .map((o) => {
        if (o.t === 'addr') return refText(o.at as number, stage, names);
        if (o.t === 'lit' && stage >= STAGE.REFS) {
          const pool = unitAt(o.at as number, stage);
          if (pool?.k === 'data')
            return pool.dt === 'ptr'
              ? `=${refText(strip(pool.value), stage, names)}`
              : `=0x${hex(pool.value)}`;
        }
        return o.v;
      })
      .join('');
    return `${u.t.mn} ${ops}`.trim();
  }
  if (u.k === 'data')
    return `${dataType(u)} ${u.field && u.obj !== undefined ? `${u.field} = ` : ''}${dataValue(u, stage, names).text}`;
  if (u.k === 'str') return `ds ${cstr(u.s.length > 48 ? `${u.s.slice(0, 48)}…` : u.s)}`;
  return `align ${u.size}`;
}

export { addrText };

/* ------------------------------------------------------------------ viewport */

/** The scroll position and height of a virtualised list's box. */
export function useViewport<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [vp, setVp] = useState({ top: 0, height: 640 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setVp((p) =>
        p.top === el.scrollTop && p.height === el.clientHeight
          ? p
          : { top: el.scrollTop, height: el.clientHeight },
      );
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [ref]);
  return vp;
}
