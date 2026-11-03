// Autocomplete for the editor: tables after FROM and JOIN, columns after an alias and a dot,
// and otherwise the columns in scope, functions and keywords.
import { CATALOG, TABLES } from './catalog';
import { FUNCTION_NAMES } from './compile';
import { lex, significant, statementAt } from './lexer';

export interface Suggestion {
  label: string;
  kind: 'table' | 'column' | 'function' | 'keyword';
  detail: string;
  insert: string;
}

export interface Completion {
  from: number;
  to: number;
  items: Suggestion[];
}

const KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'ON',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS NULL',
  'IS NOT NULL',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  'GROUP BY',
  'HAVING',
  'ORDER BY',
  'ASC',
  'DESC',
  'LIMIT',
  'OFFSET',
  'DISTINCT',
  'AS',
  'COUNT(*)',
  'EXPLAIN ANALYZE',
  'INSERT INTO',
  'VALUES',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'NULLS LAST',
];
const TABLE_CONTEXT = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE']);

/** Aliases in the statement around the caret: `FROM roles r` makes r → roles. */
export function aliasesAt(text: string, caret: number) {
  const seg = statementAt(text, caret);
  const map = new Map<string, string>();
  if (!seg) return map;
  const toks = significant(lex(seg.text));
  let inFrom = false;
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i];
    if (
      t.kind === 'kw' &&
      ['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'SELECT', 'ON'].includes(t.value)
    )
      inFrom = false;
    if (t.kind === 'kw' && (t.value === 'FROM' || t.value === 'JOIN')) inFrom = true;
    const opener =
      (t.kind === 'kw' && (t.value === 'FROM' || t.value === 'JOIN')) ||
      (inFrom && t.kind === 'punct' && t.text === ',');
    if (!opener) continue;
    const name = toks[i + 1];
    if (name.kind !== 'ident' || !CATALOG.has(name.value)) continue;
    map.set(name.value, name.value);
    let a = toks[i + 2];
    if (a?.kind === 'kw' && a.value === 'AS') a = toks[i + 3];
    if (a?.kind === 'ident') map.set(a.value, name.value);
  }
  return map;
}

export function complete(text: string, caret: number, force = false): Completion | null {
  const before = text.slice(0, caret);
  const toks = lex(before);
  const last = toks[toks.length - 1];
  if (
    last &&
    (last.kind === 'comment' ||
      last.kind === 'str' ||
      (last.kind === 'bad' && last.text.startsWith("'")))
  )
    return null;

  const prefix = /[A-Za-z_][\w$]*$/.exec(before)?.[0] ?? '';
  const from = caret - prefix.length;
  const lower = prefix.toLowerCase();
  const match = (label: string) => label.toLowerCase().startsWith(lower);
  const aliases = aliasesAt(text, caret);

  // alias. → that table's columns
  const dotted = /([A-Za-z_][\w$]*)\.$/.exec(before.slice(0, from));
  if (dotted) {
    const table = CATALOG.get(aliases.get(dotted[1].toLowerCase()) ?? dotted[1].toLowerCase());
    if (!table) return null;
    const items = table.columns
      .filter((c) => match(c.name))
      .map((c): Suggestion => ({
        label: c.name,
        kind: 'column',
        detail: `${c.type}${c.pk ? ' · pk' : c.fk ? ` · → ${c.fk.table}` : ''}`,
        insert: c.name,
      }));
    return items.length ? { from, to: caret, items } : null;
  }

  if (!prefix && !force) return null;
  const sig = significant(lex(before.slice(0, from)));
  const prev = sig[sig.length - 1];
  // Naming an alias (`FROM roles r`, `AS r`): nothing to suggest.
  const prev2 = sig[sig.length - 2];
  if (
    !force &&
    prev &&
    ((prev.kind === 'kw' && prev.value === 'AS') ||
      (prev.kind === 'ident' &&
        CATALOG.has(prev.value) &&
        prev2?.kind === 'kw' &&
        (prev2.value === 'FROM' || prev2.value === 'JOIN')))
  )
    return null;
  const tables = TABLES.filter((t) => match(t.name)).map((t): Suggestion => ({
    label: t.name,
    kind: 'table',
    detail: `${t.rows.length} rows`,
    insert: t.name,
  }));
  if (prev && ((prev.kind === 'kw' && TABLE_CONTEXT.has(prev.value)) || prev.kind === 'meta'))
    return tables.length ? { from, to: caret, items: tables } : null;

  const inScope = [...new Set(aliases.values())];
  const named = new Map<string, string>();
  for (const [alias, table] of aliases)
    if (alias !== table || !named.has(table)) named.set(table, alias);
  const columns: Suggestion[] = [];
  for (const t of inScope) {
    const table = CATALOG.get(t)!;
    for (const c of table.columns)
      if (match(c.name))
        columns.push({
          label: c.name,
          kind: 'column',
          detail: `${named.get(t) ?? t}.${c.name} · ${c.type}`,
          insert: c.name,
        });
  }
  const fns = FUNCTION_NAMES.filter(match).map((f): Suggestion => ({
    label: f,
    kind: 'function',
    detail: 'function',
    insert: `${f}(`,
  }));
  const kws = KEYWORDS.filter(match).map((k): Suggestion => ({
    label: k,
    kind: 'keyword',
    detail: 'keyword',
    insert: k,
  }));
  const items = [...columns, ...fns, ...kws, ...tables].slice(0, 40);
  if (!items.length) return null;
  // Nothing left to complete.
  if (items.length === 1 && items[0].insert.toLowerCase() === lower) return null;
  return { from, to: caret, items };
}
