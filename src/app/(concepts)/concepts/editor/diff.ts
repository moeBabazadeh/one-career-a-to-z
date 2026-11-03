// A line diff (longest common subsequence, after trimming the common head and tail), for the
// gutter's change bars and for blame: lines that survive an edit keep the commit that wrote them,
// and the rest are the visitor's uncommitted changes.

export type LineChange = 'added' | 'modified' | null;

export interface LineDiff {
  /** For each new line, the old line it came from, or null when it is new or changed. */
  from: (number | null)[];
  /** The gutter mark for each new line. */
  change: LineChange[];
  /** New lines that sit just below a deletion. */
  deletedAbove: Set<number>;
  added: number;
  removed: number;
  /** The whole alignment, for a unified diff. */
  ops: { op: ' ' | '-' | '+'; text: string; a: number; b: number }[];
}

export function lineDiff(oldText: string, newText: string): LineDiff {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const from: (number | null)[] = new Array(b.length).fill(null);
  const change: LineChange[] = new Array(b.length).fill(null);
  const deletedAbove = new Set<number>();
  const ops: LineDiff['ops'] = [];
  if (oldText === newText) {
    b.forEach((line, i) => {
      from[i] = i;
      ops.push({ op: ' ', text: line, a: i, b: i });
    });
    return { from, change, deletedAbove, added: 0, removed: 0, ops };
  }
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    from[head] = head;
    ops.push({ op: ' ', text: a[head], a: head, b: head });
    head++;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    from[b.length - 1 - tail] = a.length - 1 - tail;
    tail++;
  }
  const A = a.slice(head, a.length - tail);
  const B = b.slice(head, b.length - tail);
  // LCS table over the middle.
  const L: Uint16Array[] = Array.from(
    { length: A.length + 1 },
    () => new Uint16Array(B.length + 1),
  );
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  // Walk the alignment hunk by hunk: deletions and insertions between matches.
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) {
      from[head + j] = head + i;
      ops.push({ op: ' ', text: A[i], a: head + i, b: head + j });
      i++;
      j++;
      continue;
    }
    let dels = 0;
    const insStart = j;
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) break;
      if (j < B.length && (i >= A.length || L[i][j + 1] >= L[i + 1][j])) {
        ops.push({ op: '+', text: B[j], a: head + i, b: head + j });
        j++;
      } else {
        ops.push({ op: '-', text: A[i], a: head + i, b: head + j });
        i++;
        dels++;
      }
    }
    const ins = j - insStart;
    for (let k = 0; k < ins; k++) change[head + insStart + k] = k < dels ? 'modified' : 'added';
    if (dels > ins) deletedAbove.add(head + insStart + ins);
    added += ins;
    removed += dels;
  }
  for (let k = tail; k > 0; k--)
    ops.push({ op: ' ', text: a[a.length - k], a: a.length - k, b: b.length - k });
  return { from, change, deletedAbove, added, removed, ops };
}

/** A unified diff with three lines of context, the way `git diff` prints one. */
export function unified(oldText: string, newText: string): string[] {
  const { ops } = lineDiff(oldText, newText);
  const out: string[] = [];
  const changed = ops.map((o) => o.op !== ' ');
  let k = 0;
  while (k < ops.length) {
    if (!changed[k]) {
      k++;
      continue;
    }
    let start = Math.max(0, k - 3);
    let end = k;
    // Extend the hunk while changes are within six lines of each other.
    while (end < ops.length) {
      let next = end;
      while (next < ops.length && !changed[next]) next++;
      if (next >= ops.length || next - end > 6) break;
      end = next + 1;
      while (end < ops.length && changed[end]) end++;
    }
    end = Math.min(ops.length, end + 3);
    while (start > 0 && changed[start - 1]) start--;
    const slice = ops.slice(start, end);
    const aStart = slice.find((o) => o.op !== '+')?.a ?? slice[0].a;
    const bStart = slice.find((o) => o.op !== '-')?.b ?? slice[0].b;
    const aLen = slice.filter((o) => o.op !== '+').length;
    const bLen = slice.filter((o) => o.op !== '-').length;
    out.push(`@@ -${aStart + 1},${aLen} +${bStart + 1},${bLen} @@`);
    for (const o of slice) out.push(`${o.op}${o.text}`);
    k = end;
  }
  return out;
}

/** Each new line's owner: the old owner where a line survived, `fresh` where it didn't. */
export function carryBlame(
  oldText: string,
  oldOwners: string[],
  newText: string,
  fresh: string,
): string[] {
  const d = lineDiff(oldText, newText);
  return d.from.map((k) => (k === null ? fresh : (oldOwners[k] ?? fresh)));
}
