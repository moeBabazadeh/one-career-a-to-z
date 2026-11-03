// SI formatting for times, rates and frequencies, the way an instrument prints them.

const MINUS = '−';

const TIME_UNITS: [number, string][] = [
  [1, 's'],
  [1e-3, 'ms'],
  [1e-6, 'µs'],
  [1e-9, 'ns'],
];

/** The unit a magnitude reads best in. */
export function timeUnit(t: number): [number, string] {
  const a = Math.abs(t);
  return TIME_UNITS.find(([u]) => a >= u * 0.9995) ?? TIME_UNITS[TIME_UNITS.length - 1];
}

/** "12.35 ms", "−840 ns": a duration or offset with `sig` significant digits. */
export function time(t: number, sig = 4, signed = false) {
  if (t === 0 || !Number.isFinite(t)) return signed ? '0 s' : '0 s';
  const [u, name] = timeUnit(t);
  const v = t / u;
  const whole = Math.floor(Math.log10(Math.abs(v))) + 1;
  const dec = Math.max(0, sig - whole);
  const text = Math.abs(v).toFixed(dec);
  const sign = t < 0 ? MINUS : signed ? '+' : '';
  return `${sign}${text} ${name}`;
}

/** A ruler label for a tick, with as many decimals as the tick step needs. */
export function tick(t: number, step: number) {
  if (Math.abs(t) < step / 2) return '0 s';
  const [u, name] = timeUnit(Math.abs(t) >= step ? t : step);
  const dec = Math.max(0, Math.ceil(-Math.log10(step / u) - 1e-9));
  return `${t < 0 ? MINUS : '+'}${Math.abs(t / u).toFixed(dec)} ${name}`;
}

/** 1, 2 or 5 times a power of ten, at least `raw`. */
export function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** "115.2 kHz", "1.000 MHz". */
export function freq(hz: number, sig = 4) {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  const [u, name] = hz >= 1e6 ? [1e6, 'MHz'] : hz >= 1e3 ? [1e3, 'kHz'] : [1, 'Hz'];
  const v = hz / u;
  const whole = Math.floor(Math.log10(v)) + 1;
  return `${v.toFixed(Math.max(0, sig - whole))} ${name}`;
}

/** "25 MS/s", "500 kS/s". */
export function rate(r: number) {
  return r >= 1e6 ? `${r / 1e6} MS/s` : `${r / 1e3} kS/s`;
}

/** "25.0 M", "312 k": a sample or edge count. */
export function count(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return String(n);
}

/** "1 s", "250 ms": a capture length. */
export function duration(d: number) {
  return d >= 1 ? `${d} s` : `${Math.round(d * 1000)} ms`;
}
