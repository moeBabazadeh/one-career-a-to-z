// What the keys act on. Enter follows, L renames, X lists references and ; comments: each
// resolves its target the way a disassembler does, from the field under the cursor in the
// listing, or the token picked in the decompiler.
import { STAGE, type Unit } from './analyze';
import { decompiled } from './c';
import {
  ABS_NOTE,
  PROG,
  addrText,
  fnOf,
  inImage,
  lineOf,
  nameAt,
  unitAt,
  type Names,
} from './program';
import { act, getNotes, getUI, notesAct } from './store';

/** What a unit points at: a call or branch target, a literal's pointer, a data pointer. */
export function refOf(u: Unit | null, stage: number): number | null {
  if (!u) return null;
  if (u.k === 'ins') {
    const target = u.t.ops.find((o) => o.t === 'addr')?.at;
    if (target !== undefined) return target;
    const lit = u.t.ops.find((o) => o.t === 'lit')?.at;
    if (lit === undefined || stage < STAGE.REFS) return null;
    const pool = unitAt(lit, stage);
    return pool && pool.k === 'data' && pool.dt === 'ptr' ? strip(pool.value) : null;
  }
  if (u.k === 'data' && (u.dt === 'ptr' || u.dt === 'addr') && u.value) return strip(u.value);
  return null;
}

/** A Thumb function pointer's address, without its mode bit. */
const strip = (v: number) => (PROG.fns.has(v & ~1) ? v & ~1 : v);

export interface Target {
  /** Where Enter goes. */
  follow: number | null;
  /** What L renames (or labels). */
  rename: number;
  /** What X lists references to. */
  xref: number;
  /** Where ; comments. */
  comment: number;
}

export function target(): Target {
  const s = getUI();
  const stage = s.stage;
  const cur = unitAt(s.cursor, stage);
  const at = cur?.addr ?? s.cursor;
  const fn = fnOf(s.cursor, stage);
  if (s.focus === 'decomp' && fn !== null) {
    const picked = s.dtok && s.dtok.fn === fn ? s.dtok : null;
    const line = decompiled(fn)[picked ? picked.line : lineOf(fn, at)] ?? [];
    const tok =
      picked && picked.tok >= 0 ? line[picked.tok] : line.find((t) => t.t === 'fn' && t.at !== fn);
    if (tok?.at !== undefined) return { follow: tok.at, rename: tok.at, xref: tok.at, comment: at };
  }
  const ref = refOf(cur, stage);
  const onOp = s.field === 'op' && ref !== null;
  const labelled = nameAt(at, stage, getNotes().names) !== null;
  return {
    follow: ref,
    rename: onOp ? (ref as number) : at,
    xref: onOp ? (ref as number) : labelled || fn === null ? at : fn,
    comment: at,
  };
}

const describe = (a: number, names: Names) => nameAt(a, getUI().stage, names) ?? addrText(a);

/** Follows the reference under the cursor. */
export function follow(to: number | null = target().follow) {
  if (to === null) {
    act.log('Nothing to follow here.', 'warn');
    return;
  }
  if (!inImage(to)) {
    const note = ABS_NOTE.get(to);
    act.log(
      `${describe(to, getNotes().names)} is at ${addrText(to)}, outside the image${note ? ` (${note})` : ''}.`,
      'warn',
    );
    return;
  }
  act.goTo(to);
}

export const openRename = () => act.open({ k: 'rename', addr: target().rename });
export const openComment = () => act.open({ k: 'comment', addr: target().comment });
export const openXrefs = () => act.open({ k: 'xrefs', addr: target().xref });

export function undoNote() {
  const ok = notesAct.undo();
  act.log(ok ? 'Undid the last annotation.' : 'Nothing to undo.', ok ? 'info' : 'warn');
}

/** The next or previous function from the cursor (Ctrl+↓ / Ctrl+↑). */
export function stepFunction(dir: 1 | -1) {
  const s = getUI();
  if (s.stage < STAGE.CODE) return;
  const list = PROG.fnList;
  const next =
    dir > 0 ? list.find((a) => a > s.cursor) : [...list].reverse().find((a) => a < s.cursor);
  if (next !== undefined) act.goTo(next);
}
