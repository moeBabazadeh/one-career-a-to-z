// Meter readings from the display's loop to whatever shows them, ten times a second, without
// going through React state: the meters write their own DOM.

export interface Telemetry {
  /** Channel power in the passband, dBFS. */
  chan: number;
  /** The same at the antenna, dBm. */
  dbm: number;
  s: { s: number; over: number; frac: number };
  snr: number;
  gain: number;
  overload: boolean;
  squelched: boolean;
  /** Frames drawn a second, 0 while the picture holds still. */
  fps: number;
}

const listeners = new Set<(t: Telemetry) => void>();
let last: Telemetry | null = null;

export function emitTelemetry(t: Telemetry) {
  last = t;
  listeners.forEach((fn) => fn(t));
}

export function onTelemetry(fn: (t: Telemetry) => void) {
  listeners.add(fn);
  if (last) fn(last);
  return () => {
    listeners.delete(fn);
  };
}
