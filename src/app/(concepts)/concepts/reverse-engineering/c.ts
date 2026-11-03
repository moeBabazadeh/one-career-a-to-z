// A tokenizer for the decompiler's C: keywords, types, literals, and identifiers resolved against
// the program's symbols, so a call is a link to its function and a rename shows everywhere.
import { FN_SRC, PROG, STRINGS, SYM_ADDR } from './program';

export type CKind =
  'kw' | 'ty' | 'num' | 'str' | 'chr' | 'cm' | 'fn' | 'glob' | 'fld' | 'var' | 'const' | 'p' | 'ws';

export interface CTok {
  t: CKind;
  v: string;
  /** For a function, global or string: its address. */
  at?: number;
}

const KW = new Set([
  'if',
  'else',
  'do',
  'while',
  'for',
  'return',
  'true',
  'false',
  'break',
  'continue',
  'sizeof',
]);
const TY = new Set([
  'void',
  'char',
  'int',
  'uint',
  'short',
  'long',
  'bool',
  'unsigned',
  'const',
  'struct',
  'undefined',
  'undefined4',
]);

const RE =
  /(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(0x[0-9a-fA-F]+|\d+)|([A-Za-z_]\w*)|(\s+)|(->|[^\sA-Za-z0-9_])/g;

export function tokenize(line: string): CTok[] {
  const out: CTok[] = [];
  let prev = '';
  for (const m of line.matchAll(RE)) {
    const [whole, cm, str, chr, num, id, ws] = m;
    if (cm) out.push({ t: 'cm', v: whole });
    else if (str) {
      let at: number | undefined;
      try {
        at = STRINGS.get(JSON.parse(str) as string);
      } catch {
        at = undefined;
      }
      out.push({ t: 'str', v: str, at });
    } else if (chr) out.push({ t: 'chr', v: whole });
    else if (num) out.push({ t: 'num', v: whole });
    else if (id) {
      const at = SYM_ADDR.get(id);
      if (prev === '->' || prev === '.') out.push({ t: 'fld', v: id });
      else if (at !== undefined) out.push({ t: PROG.fns.has(at) ? 'fn' : 'glob', v: id, at });
      else if (KW.has(id)) out.push({ t: 'kw', v: id });
      else if (TY.has(id) || /_t$/.test(id)) out.push({ t: 'ty', v: id });
      else if (/^[A-Z][A-Z0-9_]+$/.test(id)) out.push({ t: 'const', v: id });
      else out.push({ t: 'var', v: id });
    } else if (ws) out.push({ t: 'ws', v: whole });
    else out.push({ t: 'p', v: whole });
    if (!ws) prev = whole;
  }
  return out;
}

const cache = new Map<number, CTok[][]>();

/** A function's decompiled lines, tokenized once. */
export function decompiled(fn: number): CTok[][] {
  let lines = cache.get(fn);
  if (!lines) {
    lines = (FN_SRC.get(fn)?.c ?? []).map(tokenize);
    cache.set(fn, lines);
  }
  return lines;
}
