// Date serials as desktop spreadsheets count them: whole days since 1899-12-30, so 1 March 1900
// is 61. (The 1900 leap-day quirk only matters before that, and nothing here goes back so far.)

const DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30);

export interface YMD {
  y: number;
  m: number;
  d: number;
}

/** A serial from a year, month (1–12, overflow rolls over) and day. */
export const serial = (y: number, m: number, d: number) =>
  Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY);

export function ymd(n: number): YMD {
  const t = new Date(EPOCH + Math.floor(n) * DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** 0 = Sunday. */
export const weekday = (n: number) => new Date(EPOCH + Math.floor(n) * DAY).getUTCDay();

export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The same day `months` later, held to the month's end: EDATE. */
export function addMonths(n: number, months: number) {
  const { y, m, d } = ymd(n);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return serial(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

/** DATEDIF's units: whole years, months or days, and the remainders MD, YM and YD. */
export function datedif(start: number, end: number, unit: string): number | null {
  const a = ymd(start);
  const b = ymd(end);
  const s = Math.floor(start);
  const e = Math.floor(end);
  switch (unit.toUpperCase()) {
    case 'D':
      return e - s;
    case 'M': {
      let months = (b.y - a.y) * 12 + (b.m - a.m);
      if (b.d < a.d) months--;
      return months;
    }
    case 'Y': {
      let years = b.y - a.y;
      if (b.m < a.m || (b.m === a.m && b.d < a.d)) years--;
      return years;
    }
    case 'YM': {
      let months = (b.y - a.y) * 12 + (b.m - a.m);
      if (b.d < a.d) months--;
      return months % 12;
    }
    case 'MD': {
      if (b.d >= a.d) return b.d - a.d;
      // Days from the start's day in the previous month to the end.
      const pm = b.m === 1 ? 12 : b.m - 1;
      const py = b.m === 1 ? b.y - 1 : b.y;
      return e - serial(py, pm, Math.min(a.d, daysInMonth(py, pm)));
    }
    case 'YD': {
      let anchor = serial(b.y, a.m, Math.min(a.d, daysInMonth(b.y, a.m)));
      if (anchor > e) anchor = serial(b.y - 1, a.m, Math.min(a.d, daysInMonth(b.y - 1, a.m)));
      return e - anchor;
    }
    default:
      return null;
  }
}

const lastOfFeb = (d: YMD) => d.m === 2 && d.d === daysInMonth(d.y, 2);
const days360 = (a: YMD, b: YMD, d1: number, d2: number) =>
  (b.y - a.y) * 360 + (b.m - a.m) * 30 + (d2 - d1);

/**
 * YEARFRAC with the five day-count bases: 0 US 30/360, 1 actual/actual, 2 actual/360,
 * 3 actual/365, 4 European 30/360. The 30/360 and actual/actual rules follow the desktop
 * spreadsheet's own, quirks included (February's last day, the averaged year length).
 */
export function yearfrac(start: number, end: number, basis: number): number | null {
  let s = Math.floor(start);
  let e = Math.floor(end);
  if (s === e) return 0;
  if (s > e) [s, e] = [e, s];
  const a = ymd(s);
  const b = ymd(e);
  switch (basis) {
    case 0: {
      let d1 = a.d;
      let d2 = b.d;
      if (d1 === 31 && d2 === 31) {
        d1 = 30;
        d2 = 30;
      } else if (d1 === 31) {
        d1 = 30;
      } else if (d1 === 30 && d2 === 31) {
        d2 = 30;
      } else if (lastOfFeb(a)) {
        d1 = 30;
        if (lastOfFeb(b)) d2 = 30;
      }
      return days360(a, b, d1, d2) / 360;
    }
    case 1: {
      let yearLength: number;
      const overOneYear =
        a.y !== b.y && (a.y + 1 !== b.y || a.m < b.m || (a.m === b.m && a.d < b.d));
      if (overOneYear) {
        let total = 0;
        for (let y = a.y; y <= b.y; y++) total += isLeap(y) ? 366 : 365;
        yearLength = total / (b.y - a.y + 1);
      } else {
        let feb29 = false;
        if (isLeap(a.y)) feb29 = a.y === b.y || a.m <= 2;
        else if (isLeap(b.y)) feb29 = b.m > 2 || (b.m === 2 && b.d === 29);
        yearLength = feb29 ? 366 : 365;
      }
      return (e - s) / yearLength;
    }
    case 2:
      return (e - s) / 360;
    case 3:
      return (e - s) / 365;
    case 4:
      return days360(a, b, Math.min(a.d, 30), Math.min(b.d, 30)) / 360;
    default:
      return null;
  }
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
