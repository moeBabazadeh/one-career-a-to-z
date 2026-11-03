// Frequencies and bandwidths the way a receiver prints them.

/** "2.402 GHz", "902.400 MHz", "13.560 MHz", "847.5 kHz". */
export function hz(f: number, digits?: number) {
  const a = Math.abs(f);
  if (a >= 1e9) return `${(f / 1e9).toFixed(digits ?? 6).replace(/0{1,3}$/, '')} GHz`;
  if (a >= 1e6) return `${(f / 1e6).toFixed(digits ?? 3)} MHz`;
  if (a >= 1e3) return `${trim((f / 1e3).toFixed(digits ?? 1))} kHz`;
  return `${Math.round(f)} Hz`;
}

const trim = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);

/** "200 kHz", "2 MHz", "12.5 kHz": a width, trimmed. */
export function width(f: number) {
  if (f >= 1e6) return `${trim((f / 1e6).toFixed(2))} MHz`;
  if (f >= 1e3) return `${trim((f / 1e3).toFixed(2))} kHz`;
  return `${Math.round(f)} Hz`;
}

/** A label for a gridline at `f` when lines are `step` apart, in MHz with just enough decimals. */
export function tick(f: number, step: number) {
  const dec = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step / 1e6) - 1e-9)));
  return (f / 1e6).toFixed(dec);
}

/** A 1-2-5 step that puts about `n` gridlines across `span`. */
export function niceStep(span: number, n: number) {
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Signal strength in S-units: S9 is −73 dBm below 30 MHz and −93 dBm above, six dB a unit. */
export function sUnits(dbm: number, f: number) {
  const s9 = f < 30e6 ? -73 : -93;
  const over = dbm - s9;
  if (over > 0) return { s: 9, over: Math.round(over), frac: Math.min(1, 0.6 + over / 150) };
  const s = Math.max(0, Math.min(9, Math.round(9 + over / 6)));
  return { s, over: 0, frac: Math.max(0, (9 + over / 6) / 15) };
}
