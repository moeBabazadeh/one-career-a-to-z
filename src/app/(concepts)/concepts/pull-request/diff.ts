// A line diff, the way review tools show one: an LCS over lines, cut into hunks with three lines
// of context, and the unchanged runs between hunks folded away until you expand them. Paired
// lines in a change get their changed span marked, for the word-level highlight.

import type { FileDef, Lang } from './changes';

export type OpType = 'eq' | 'del' | 'add';

export interface Row {
  type: OpType;
  text: string;
  /** 1-based line numbers; a side the line is not on has none. */
  oldNo?: number;
  newNo?: number;
  /** The changed span, [start, end), when the line pairs with one on the other side. */
  span?: [number, number];
}

export type Segment =
  | { kind: 'hunk'; id: string; header: string; context: string; rows: Row[] }
  | { kind: 'gap'; id: string; rows: Row[]; at: 'top' | 'mid' | 'end' };

export interface FileDiff {
  rows: Row[];
  segments: Segment[];
  additions: number;
  deletions: number;
}

/** Unchanged lines shown around each change. */
const CONTEXT = 3;

/** LCS by dynamic programming. Every file here is a few hundred lines at most. */
export function diffLines(a: string[], b: string[]): Row[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      rows.push({ type: 'eq', text: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      rows.push({ type: 'add', text: b[j], newNo: j + 1 });
      j++;
    } else {
      rows.push({ type: 'del', text: a[i], oldNo: i + 1 });
      i++;
    }
  }
  // Show deletions before additions within each change, as git does.
  for (let k = 0; k < rows.length;) {
    if (rows[k].type === 'eq') {
      k++;
      continue;
    }
    let end = k;
    while (end < rows.length && rows[end].type !== 'eq') end++;
    const block = rows.slice(k, end);
    rows.splice(
      k,
      block.length,
      ...block.filter((r) => r.type === 'del'),
      ...block.filter((r) => r.type === 'add'),
    );
    k = end;
  }
  markSpans(rows);
  return rows;
}

/** Marks what changed between paired del and add lines: the middle after a common prefix and suffix. */
function markSpans(rows: Row[]) {
  for (let k = 0; k < rows.length;) {
    if (rows[k].type !== 'del') {
      k++;
      continue;
    }
    const dels: Row[] = [];
    while (k < rows.length && rows[k].type === 'del') dels.push(rows[k++]);
    const adds: Row[] = [];
    while (k < rows.length && rows[k].type === 'add') adds.push(rows[k++]);
    for (let p = 0; p < Math.min(dels.length, adds.length); p++) {
      const a = dels[p].text;
      const b = adds[p].text;
      // Suffix first, then prefix: an insertion mid-line then marks only what was inserted.
      let suf = 0;
      while (suf < a.length && suf < b.length && a[a.length - 1 - suf] === b[b.length - 1 - suf])
        suf++;
      let pre = 0;
      while (pre < a.length - suf && pre < b.length - suf && a[pre] === b[pre]) pre++;
      // Snap out to word edges, so the highlight covers whole words.
      while (pre > 0 && /\w/.test(a[pre - 1]) && /\w/.test(a[pre] ?? '')) pre--;
      while (suf > 0 && /\w/.test(a[a.length - suf]) && /\w/.test(a[a.length - suf - 1] ?? ''))
        suf--;
      // Only mark spans when most of the line is shared; otherwise the whole line is the change.
      if (pre + suf < Math.min(a.length, b.length) * 0.3) continue;
      dels[p].span = [pre, a.length - suf];
      adds[p].span = [pre, b.length - suf];
    }
  }
}

/** The nearest heading or top-level key above a line, for the hunk header (git's funcname). */
function contextFor(lines: string[], before: number, lang: Lang): string {
  for (let i = before - 1; i >= 0; i--) {
    const l = lines[i];
    if (lang === 'md' && /^#{1,6}\s/.test(l)) return l;
    if (lang === 'yaml' && /^\S[^:]*:/.test(l) && !l.startsWith('#')) return l;
    if (lang === 'env' && l.startsWith('# ')) return l;
  }
  return '';
}

export function buildDiff(file: FileDef): FileDiff {
  const oldLines = file.old ? file.old.split('\n') : [];
  const newLines = file.text.split('\n');
  const rows = diffLines(oldLines, newLines);
  const changed = rows.map((r) => r.type !== 'eq');
  const visible = rows.map((_, i) => {
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++)
      if (changed[k]) return true;
    return false;
  });

  const segments: Segment[] = [];
  let k = 0;
  while (k < rows.length) {
    const start = k;
    const shown = visible[k];
    while (k < rows.length && visible[k] === shown) k++;
    const slice = rows.slice(start, k);
    if (shown) {
      const first = slice[0];
      // With no lines on a side, git names the line before the hunk (0 for a new file).
      const oldStart =
        slice.find((r) => r.oldNo)?.oldNo ?? rows.slice(0, start).filter((r) => r.oldNo).length;
      const newStart =
        slice.find((r) => r.newNo)?.newNo ?? rows.slice(0, start).filter((r) => r.newNo).length;
      const oldLen = slice.filter((r) => r.type !== 'add').length;
      const newLen = slice.filter((r) => r.type !== 'del').length;
      const header = `@@ -${oldStart},${oldLen} +${newStart},${newLen} @@`;
      segments.push({
        kind: 'hunk',
        id: `h${start}`,
        header,
        context: contextFor(newLines, (first.newNo ?? 1) - 1, file.lang),
        rows: slice,
      });
    } else {
      segments.push({
        kind: 'gap',
        id: `g${start}`,
        rows: slice,
        at: start === 0 ? 'top' : k === rows.length ? 'end' : 'mid',
      });
    }
  }

  return {
    rows,
    segments,
    additions: rows.filter((r) => r.type === 'add').length,
    deletions: rows.filter((r) => r.type === 'del').length,
  };
}

/* ------------------------------------------------------------------ split view */

export interface SplitRow {
  left?: Row;
  right?: Row;
}

/** Pairs rows for the side-by-side view: unchanged lines on both sides, a change's deletions beside its additions. */
export function toSplit(rows: Row[]): SplitRow[] {
  const out: SplitRow[] = [];
  for (let k = 0; k < rows.length;) {
    const r = rows[k];
    if (r.type === 'eq') {
      out.push({ left: r, right: r });
      k++;
      continue;
    }
    const dels: Row[] = [];
    while (k < rows.length && rows[k].type === 'del') dels.push(rows[k++]);
    const adds: Row[] = [];
    while (k < rows.length && rows[k].type === 'add') adds.push(rows[k++]);
    for (let p = 0; p < Math.max(dels.length, adds.length); p++)
      out.push({ left: dels[p], right: adds[p] });
  }
  return out;
}
