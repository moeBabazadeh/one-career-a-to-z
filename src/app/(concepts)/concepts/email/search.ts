// Search, the way mail clients do it: free words and "quoted phrases", operators (from:, to:,
// subject:, label:, has:, is:, in:, before:, after:), a leading minus to exclude, OR between
// terms and parentheses to group. The query is tokenised, parsed into a tree by recursive
// descent and evaluated against each thread; the words it looked for come back as one regex
// so the list and the reading pane can highlight them.
import { labelById, labelSlug, type Thread } from './mailbox';
import { monthRange, parseQueryDate } from './dates';

export type Node =
  | { k: 'and'; items: Node[] }
  | { k: 'or'; items: Node[] }
  | { k: 'not'; item: Node }
  | { k: 'text'; value: string; phrase: boolean }
  | { k: 'op'; op: Op; value: string; raw: string };

export const OPS = [
  'from',
  'to',
  'subject',
  'label',
  'has',
  'is',
  'in',
  'before',
  'after',
  'older',
  'newer',
] as const;
export type Op = (typeof OPS)[number];

type Token =
  | { t: '(' | ')' | 'or' | 'not' }
  | { t: 'word'; value: string; phrase: boolean; raw: string }
  | { t: 'op'; op: Op; value: string; raw: string };

const isOp = (s: string): s is Op => (OPS as readonly string[]).includes(s);

export function tokenize(q: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const readValue = () => {
    if (q[i] === '"') {
      const end = q.indexOf('"', i + 1);
      const v = q.slice(i + 1, end < 0 ? q.length : end);
      i = end < 0 ? q.length : end + 1;
      return { value: v, phrase: true };
    }
    let j = i;
    while (j < q.length && !/[\s()]/.test(q[j])) j++;
    const v = q.slice(i, j);
    i = j;
    return { value: v, phrase: false };
  };
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      out.push({ t: c });
      i++;
      continue;
    }
    if (c === '-' && i + 1 < q.length && !/\s/.test(q[i + 1])) {
      out.push({ t: 'not' });
      i++;
      continue;
    }
    if (c === '|') {
      out.push({ t: 'or' });
      i++;
      continue;
    }
    const start = i;
    const m = /^([a-z]+):/i.exec(q.slice(i));
    if (m && isOp(m[1].toLowerCase())) {
      i += m[0].length;
      const { value } = readValue();
      out.push({ t: 'op', op: m[1].toLowerCase() as Op, value, raw: q.slice(start, i) });
      continue;
    }
    const { value, phrase } = readValue();
    if (!phrase && value === 'OR') out.push({ t: 'or' });
    else if (value) out.push({ t: 'word', value, phrase, raw: q.slice(start, i) });
  }
  return out;
}

/** Parses a query into a tree. Never throws: stray parentheses and dangling ORs are dropped. */
export function parse(q: string): Node {
  const tokens = tokenize(q);
  let pos = 0;
  const peek = () => tokens[pos];

  function unary(): Node | null {
    const tok = tokens[pos++];
    if (!tok) return null;
    if (tok.t === 'not') {
      const item = unary();
      return item ? { k: 'not', item } : null;
    }
    if (tok.t === '(') {
      const inner = and(true);
      if (peek()?.t === ')') pos++;
      return inner;
    }
    if (tok.t === 'word') return { k: 'text', value: tok.value, phrase: tok.phrase };
    if (tok.t === 'op') return { k: 'op', op: tok.op, value: tok.value, raw: tok.raw };
    return null;
  }

  function or(): Node | null {
    const first = unary();
    if (!first) return null;
    const items = [first];
    while (peek()?.t === 'or') {
      pos++;
      const next = unary();
      if (next) items.push(next);
    }
    return items.length > 1 ? { k: 'or', items } : first;
  }

  function and(nested: boolean): Node {
    const items: Node[] = [];
    while (pos < tokens.length) {
      const tok = peek();
      if (tok.t === ')') {
        if (nested) break;
        pos++;
        continue;
      }
      if (tok.t === 'or') {
        pos++;
        continue;
      }
      const n = or();
      if (n) items.push(n);
    }
    return items.length === 1 ? items[0] : { k: 'and', items };
  }

  return and(false);
}

/* ------------------------------------------------------------------ evaluation */

export interface Facts {
  starred: boolean;
  read: boolean;
  box: 'inbox' | 'archive' | 'trash';
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** A word matches at the start of a word, as mail search does; a phrase matches anywhere. */
const textRe = (value: string, phrase: boolean) => {
  const v = escape(norm(value));
  return new RegExp(phrase ? v : `(?<![\\p{L}\\p{N}])${v}`, 'u');
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normed = new Map<string, string>();
const textOf = (t: Thread) => {
  let v = normed.get(t.id);
  if (v === undefined) normed.set(t.id, (v = norm(t.text)));
  return v;
};

function labelMatches(t: Thread, value: string) {
  const v = norm(value).replace(/\s+/g, '-');
  return t.labels.some((id) => {
    const l = labelById.get(id);
    if (!l) return false;
    const slug = labelSlug(l);
    const group = l.group.toLowerCase();
    return (
      id.toLowerCase() === v ||
      slug === v ||
      slug.startsWith(v) ||
      `${group}/${slug}` === v ||
      group === v
    );
  });
}

function dateMatches(t: Thread, op: 'before' | 'after', value: string) {
  const at = parseQueryDate(value);
  if (at === null) return false;
  // Any message in the thread can satisfy it; undated messages never do.
  return t.messages.some((m) => {
    if (!m.date) return false;
    const [first, last] = monthRange(m.date);
    return op === 'after' ? last >= at : first < at;
  });
}

function opMatches(n: Extract<Node, { k: 'op' }>, t: Thread, f: Facts): boolean {
  const v = norm(n.value);
  switch (n.op) {
    case 'from':
      // from:site picks out the site's own reports. The site writes from Moe's address, so only
      // his own mail matches on it; the site matches by its name.
      if (v === 'site') return t.messages.some((m) => m.from.id === 'site');
      return t.messages.some((m) =>
        norm(
          `${m.from.name} ${m.from.short} ${m.from.id === 'moe' ? m.from.address : ''}`,
        ).includes(v),
      );
    case 'to':
      return ['me', 'you'].some((x) => x.startsWith(v));
    case 'subject':
      return norm(t.subject).includes(v);
    case 'label':
      return labelMatches(t, n.value);
    case 'has':
      if (v.startsWith('attach')) return t.hasAttachment;
      if (v.startsWith('link')) return t.hasLink;
      if (v === 'image' || v === 'images')
        return t.messages.some((m) => m.attachments.some((x) => x.kind === 'image'));
      if (v === 'pdf') return t.messages.some((m) => m.attachments.some((x) => x.kind === 'pdf'));
      return false;
    case 'is':
      if (v === 'starred') return f.starred;
      if (v === 'unread') return !f.read;
      if (v === 'read') return f.read;
      if (v === 'archived') return f.box === 'archive';
      return false;
    case 'in':
      if (v === 'anywhere' || v === 'all') return true;
      if (v === 'inbox' || v === 'archive' || v === 'trash') return f.box === v;
      if (v === 'starred') return f.starred;
      return false;
    case 'before':
    case 'older':
      return dateMatches(t, 'before', n.value);
    case 'after':
    case 'newer':
      return dateMatches(t, 'after', n.value);
  }
}

export function matches(n: Node, t: Thread, f: Facts): boolean {
  switch (n.k) {
    case 'and':
      return n.items.every((x) => matches(x, t, f));
    case 'or':
      return n.items.some((x) => matches(x, t, f));
    case 'not':
      return !matches(n.item, t, f);
    case 'text':
      return textRe(n.value, n.phrase).test(textOf(t));
    case 'op':
      return opMatches(n, t, f);
  }
}

/** True when the query names a folder itself, so search shouldn't also drop the Trash. */
export function mentionsIn(n: Node): boolean {
  if (n.k === 'op') return n.op === 'in';
  if (n.k === 'not') return mentionsIn(n.item);
  if (n.k === 'text') return false;
  return n.items.some(mentionsIn);
}

/* ------------------------------------------------------------------ highlighting */

/** The words and phrases a query looks for (not the excluded ones), as one regex for <mark>. */
export function highlighter(n: Node): RegExp | null {
  const terms: { value: string; phrase: boolean }[] = [];
  const walk = (x: Node) => {
    if (x.k === 'text') terms.push(x);
    else if (x.k === 'op' && x.op === 'subject') terms.push({ value: x.value, phrase: true });
    else if (x.k === 'and' || x.k === 'or') x.items.forEach(walk);
  };
  walk(n);
  const parts = terms
    .filter((x) => x.value.trim())
    .map((x) => (x.phrase ? escape(x.value) : `(?<![\\p{L}\\p{N}])${escape(x.value)}`));
  return parts.length ? new RegExp(`(${parts.join('|')})`, 'giu') : null;
}

/** A tree back to query text, quoting where needed and adding the parentheses it needs. */
export function serialize(n: Node, inner = false): string {
  switch (n.k) {
    case 'text':
      return n.phrase || /\s/.test(n.value) ? `"${n.value}"` : n.value;
    case 'op':
      return `${n.op}:${/\s/.test(n.value) ? `"${n.value}"` : n.value}`;
    case 'not':
      return `-${n.item.k === 'and' || n.item.k === 'or' ? `(${serialize(n.item)})` : serialize(n.item)}`;
    case 'or': {
      const text = n.items
        .map((x) => (x.k === 'and' ? `(${serialize(x)})` : serialize(x, true)))
        .join(' OR ');
      return inner ? `(${text})` : text;
    }
    case 'and': {
      const text = n.items.map((x) => serialize(x, true)).join(' ');
      return inner ? `(${text})` : text;
    }
  }
}

const describe = (n: Node): string => {
  if (n.k === 'op') return `${n.op}: ${n.value}`;
  if (n.k === 'text') return n.phrase ? `“${n.value}”` : n.value;
  if (n.k === 'not') return `not ${describe(n.item)}`;
  return n.items.map(describe).join(n.k === 'or' ? ' or ' : ' ');
};

/** The query's top-level terms, as chips under the search box; removing one rewrites the query. */
export function parts(
  q: string,
): { key: string; label: string; kind: 'op' | 'text' | 'not' | 'or'; rest: string }[] {
  const root = parse(q);
  const items = root.k === 'and' ? root.items : [root];
  return items.map((n, i) => ({
    key: `${i}:${serialize(n)}`,
    label: describe(n),
    kind:
      n.k === 'not' ? 'not' : n.k === 'op' ? 'op' : n.k === 'or' || n.k === 'and' ? 'or' : 'text',
    rest: items
      .filter((_, j) => j !== i)
      .map((x) => serialize(x, true))
      .join(' '),
  }));
}

/** Suggestions for the word being typed: operators, then their values. */
export function suggest(
  q: string,
  labelValues: string[],
): { insert: string; label: string; hint: string }[] {
  const m = /(?:^|\s)(-?)([^\s]*)$/.exec(q);
  const word = m ? m[2] : '';
  const neg = m ? m[1] : '';
  const head = q.slice(0, q.length - word.length - neg.length);
  const values: Record<string, string[]> = {
    from: ['moe', 'site'],
    label: labelValues,
    has: ['attachment', 'link', 'image', 'pdf'],
    is: ['starred', 'unread', 'read', 'archived'],
    in: ['inbox', 'archive', 'trash', 'anywhere'],
  };
  const op = /^([a-z]+):(.*)$/i.exec(word);
  if (op && values[op[1].toLowerCase()]) {
    const key = op[1].toLowerCase();
    return values[key]
      .filter((v) => v.startsWith(op[2].toLowerCase()) && v !== op[2].toLowerCase())
      .slice(0, 8)
      .map((v) => ({ insert: `${head}${neg}${key}:${v} `, label: `${key}:${v}`, hint: '' }));
  }
  if (!word) return [];
  const hints: Record<string, string> = {
    from: 'sender',
    subject: 'words in the subject',
    label: 'a label',
    has: 'attachment or link',
    is: 'starred, unread or read',
    in: 'a folder',
    before: 'a year',
    after: 'a year',
  };
  return Object.keys(hints)
    .filter((k) => k.startsWith(word.toLowerCase()) && k !== word.toLowerCase())
    .map((k) => ({ insert: `${head}${neg}${k}:`, label: `${k}:`, hint: hints[k] }));
}
