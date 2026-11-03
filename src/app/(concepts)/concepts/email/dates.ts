// Dates in the mailbox. The mailbox lives on the facts' date (db.asOf), not the visitor's
// clock, so "today" is the day the facts were checked and every "2 years ago" is measured
// from it. A message may have only a year or no date at all; it says so instead of guessing.
import type { YearMonth } from '@/content/format';
import { db, fmt } from '../_shared/data';

export type { YearMonth };

export const NOW_DATE: YearMonth = db.asOf;

/** A sort key: later is larger, and undated sorts last. */
export const sortKey = (d: YearMonth | null) => (d ? fmt.frac(d) : -Infinity);

/** "27 October 2026", "September 2026", "2017" or "Undated". */
export function fullDate(d: YearMonth | null) {
  if (!d) return 'Undated';
  return d.d ? `${d.d} ${fmt.month(d)}` : fmt.month(d);
}

/** "27 Oct 2026", "Sep 2026", "2017": the short form. */
export function shortDate(d: YearMonth | null) {
  if (!d) return 'Undated';
  return d.d ? `${d.d} ${fmt.mon(d)}` : fmt.mon(d);
}

const sameDay = (a: YearMonth, b: YearMonth) =>
  a.y === b.y && a.m === b.m && a.d !== undefined && a.d === b.d;

/** How long before the facts' date: "today", "2 months ago", "9 years ago"; `short` gives "2 mo ago". */
export function ago(d: YearMonth | null, short = false): string {
  if (!d) return short ? 'undated' : 'no date on record';
  const now = NOW_DATE;
  if (sameDay(d, now)) return 'today';
  if (d.d && now.d && d.y === now.y && d.m === now.m) {
    const days = now.d - d.d;
    return days === 1 ? 'yesterday' : short ? `${days}d ago` : `${days} days ago`;
  }
  if (!d.m) {
    const years = now.y - d.y;
    if (years <= 0) return 'this year';
    return short ? `${years} yr ago` : years === 1 ? 'last year' : `${years} years ago`;
  }
  const months = fmt.monthsBetween(d, now);
  if (months <= 0) return 'this month';
  if (months < 12)
    return short ? `${months} mo ago` : months === 1 ? 'last month' : `${months} months ago`;
  const years = Math.floor(months / 12);
  return short ? `${years} yr ago` : years === 1 ? 'a year ago' : `${years} years ago`;
}

/** The list's date groups, newest first: Today, This year, then a heading per year, then Undated. */
export function bucket(d: YearMonth | null): { key: string; label: string } {
  if (!d) return { key: 'undated', label: 'Undated' };
  if (sameDay(d, NOW_DATE)) return { key: 'today', label: 'Today' };
  if (d.y === NOW_DATE.y) return { key: 'year', label: 'Earlier this year' };
  if (d.y === NOW_DATE.y - 1) return { key: String(d.y), label: `Last year · ${d.y}` };
  return { key: String(d.y), label: String(d.y) };
}

/** "4 years, 2 months": a span in whole months, to the facts' date when it's still running. */
export function span(from: YearMonth, to: YearMonth | null) {
  const months = fmt.monthsBetween(from, to ?? NOW_DATE);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [
    y ? `${y} year${y === 1 ? '' : 's'}` : '',
    m ? `${m} month${m === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.join(', ') || 'under a month';
}

/** A search date ("2020", "2020/06", "2020-06") as a month ordinal, the first month when only a year is given. */
export function parseQueryDate(v: string): number | null {
  const m = /^(\d{4})(?:[/-](\d{1,2}))?$/.exec(v.trim());
  if (!m) return null;
  const month = m[2] ? Math.min(12, Math.max(1, Number(m[2]))) : 1;
  return Number(m[1]) * 12 + month - 1;
}

/** A message date as its first and last month ordinal: a bare year covers all twelve. */
export function monthRange(d: YearMonth): [number, number] {
  if (d.m) return [d.y * 12 + d.m - 1, d.y * 12 + d.m - 1];
  return [d.y * 12, d.y * 12 + 11];
}
