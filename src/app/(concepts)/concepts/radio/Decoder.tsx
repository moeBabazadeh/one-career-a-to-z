'use client';

// The decoder: what the VFO is on and whether it locks, then the chapter it decodes, three
// ways. Payload is the dissected content, Frames a sniffer's packet list with a field tree and
// a hex dump for the selected frame, and Raw the reassembled bytes as text.
import { memo, useEffect, useRef } from 'react';
import { Chapter } from './Chapters';
import { h2, hex } from './codec';
import { program, type ChapterId } from './programs';
import type { Lock, Rx } from './rx';
import { MODE_NAME, bleChannelOf, stationById } from './stations';
import { onTelemetry } from './telemetry';
import { hz, width } from './units';
import s from './radio.module.scss';

export interface Entry {
  /** Running number across the session, like a capture's frame number. */
  n: number;
  /** Seconds since the receiver started. */
  t: number;
  /** Index in the transmitter's cycle. */
  k: number;
  /** The frequency it was heard on (the BLE channel matters for whitening). */
  f: number;
}

export type Tab = 'payload' | 'frames' | 'raw';

interface Props {
  rx: Rx;
  lock: Lock;
  viewing: ChapterId;
  got: Uint8Array;
  log: Entry[];
  tab: Tab;
  onTab: (t: Tab) => void;
  sel: number | null;
  onSel: (n: number | null) => void;
}

const STATUS: Record<Lock['status'], string> = {
  stopped: 'Stopped',
  idle: 'Searching',
  other: 'Carrier',
  mode: 'Wrong mode',
  narrow: 'Filter',
  weak: 'Weak',
  squelch: 'Squelch',
  overload: 'Overload',
  locked: 'Locked',
};

function message(rx: Rx, lock: Lock) {
  const st = lock.station ? stationById[lock.station] : null;
  switch (lock.status) {
    case 'stopped':
      return 'The receiver is stopped. Press Space or Start to run it again.';
    case 'idle':
      return 'Nothing under the VFO. Pick a station from the bookmarks, click a signal on the waterfall, or press N for the next station.';
    case 'other':
      return `${lock.other?.label}. ${lock.other?.note}`;
    case 'overload':
      return 'The ADC is clipping: a strong signal in the band is overdriving the front end. Lower the gain, or turn the AGC back on.';
    case 'mode':
      return st
        ? `${st.title} is ${st.modulation}. ${MODE_NAME[rx.mode]} can’t recover it: switch to ${st.modes.join(' or ')} (M cycles the modes, Shift+M goes back).`
        : '';
    case 'narrow':
      if (!st) return '';
      return rx.span < st.minBw
        ? `The span (the sample rate) is narrower than the signal. Zoom out to at least ${width(st.minBw * 1.2)} so the filter can open.`
        : `${st.narrowHint} Drag the filter edges, or press ] to widen.`;
    case 'weak':
      return st
        ? `Signal too weak to decode: it needs ${st.minSnr} dB of SNR. Raise the gain, or narrow the filter to let in less noise.`
        : '';
    case 'squelch':
      return `The squelch is closed at ${rx.sqlLevel} dBFS and the channel is at ${Math.round(lock.level)} dBFS. Lower the squelch to open it.`;
    case 'locked':
      return st ? `Locked. ${st.decodes}` : '';
  }
}

/** A hex dump: offset, sixteen bytes, and their printable characters. */
function dump(b: Uint8Array) {
  const lines: string[] = [];
  for (let off = 0; off < b.length; off += 16) {
    const row = b.slice(off, off + 16);
    const ascii = Array.from(row, (x) =>
      x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '·',
    ).join('');
    lines.push(`${off.toString(16).padStart(4, '0')}  ${hex(row).padEnd(47, ' ')}  ${ascii}`);
  }
  return lines.join('\n');
}

/** Live SNR and level from the meter loop, written straight into the DOM. */
function LiveFigures() {
  const snr = useRef<HTMLElement>(null);
  const chan = useRef<HTMLElement>(null);
  useEffect(
    () =>
      onTelemetry((t) => {
        if (snr.current) snr.current.textContent = `${Math.max(-9, Math.round(t.snr))} dB`;
        if (chan.current) chan.current.textContent = `${Math.round(t.chan)} dBFS`;
      }),
    [],
  );
  return (
    <dl className={s.live}>
      <div>
        <dt>SNR</dt>
        <dd ref={snr}>–</dd>
      </div>
      <div>
        <dt>Channel</dt>
        <dd ref={chan}>–</dd>
      </div>
    </dl>
  );
}

function Frames({
  id,
  log,
  sel,
  onSel,
}: {
  id: ChapterId;
  log: Entry[];
  sel: number | null;
  onSel: (n: number | null) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const st = stationById[id];
  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  const chosen = log.find((e) => e.n === sel) ?? log[log.length - 1];
  const frame = chosen ? program(id, bleChannelOf(chosen.f)).frames[chosen.k] : null;
  const chLabel = (e: Entry) =>
    st.proto === 'ble'
      ? `${bleChannelOf(e.f)}`
      : st.proto === 'nfc'
        ? program(id).frames[e.k].dir
        : st.proto === 'wifi'
          ? `${(st.freq / 1e6 - 2407) / 5}`
          : st.where.split('ARFCN ')[1];
  const chHead =
    st.proto === 'ble' ? 'Ch' : st.proto === 'nfc' ? 'Dir' : st.proto === 'wifi' ? 'Ch' : 'ARFCN';

  if (!log.length)
    return (
      <p className={s.empty}>
        No frames captured on this station yet. Tune to it and lock to start capturing.
      </p>
    );
  return (
    <div className={s.frames}>
      <div
        ref={list}
        className={s.frameList}
        onScroll={(ev) => {
          const el = ev.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Time</th>
              <th scope="col">{chHead}</th>
              <th scope="col">Len</th>
              <th scope="col">Info</th>
            </tr>
          </thead>
          <tbody>
            {log.map((e) => {
              const f = program(id, bleChannelOf(e.f)).frames[e.k];
              const on = chosen?.n === e.n;
              return (
                <tr key={e.n} className={on ? s.rowOn : undefined}>
                  <td>
                    <button
                      type="button"
                      onClick={() => onSel(e.n)}
                      aria-label={`Frame ${e.n}: ${f.summary}`}
                    >
                      {e.n}
                    </button>
                  </td>
                  <td>{e.t.toFixed(3)}</td>
                  <td>{chLabel(e)}</td>
                  <td>{f.bytes.length}</td>
                  <td className={f.ok ? undefined : s.bad}>{f.summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {frame && chosen && (
        <div className={s.detail}>
          <p className={s.detailHead}>
            Frame {chosen.n} · {frame.bytes.length} bytes{' '}
            {st.proto === 'ble' ? `on channel ${bleChannelOf(chosen.f)}` : ''}
            {sel !== null && (
              <button type="button" className={s.linkBtn} onClick={() => onSel(null)}>
                follow live
              </button>
            )}
          </p>
          <ul className={s.tree}>
            {frame.rows.map(([k, v, depth], i) => (
              <li key={`${i}${k}`} style={{ paddingLeft: `${(depth ?? 0) * 14}px` }}>
                <b>{k}</b> <span>{v}</span>
              </li>
            ))}
          </ul>
          <pre className={s.hex} aria-label="Hex dump">
            {dump(frame.bytes)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Decoder({ rx, lock, viewing, got, log, tab, onTab, sel, onSel }: Props) {
  const st = stationById[viewing];
  const total = got.length;
  const have = got.reduce((n, x) => n + x, 0);
  const here = lock.station === viewing;
  const status = here || lock.status === 'stopped' || !lock.station ? lock.status : 'idle';
  const tabs: [Tab, string][] = [
    ['payload', 'Payload'],
    ['frames', `Frames ${log.length ? log.length : ''}`],
    ['raw', 'Raw'],
  ];
  return (
    <section className={s.decoder} aria-labelledby="decoder-title">
      <header className={s.decHead}>
        <span className={s.lamp} data-status={status}>
          {STATUS[status]}
        </span>
        <div className={s.decTitle}>
          <h2 id="decoder-title">{st.title}</h2>
          <p>
            <span className={s.tag}>{st.device.tag}</span> {st.device.name} · {st.device.kind}
          </p>
        </div>
        <LiveFigures />
      </header>
      <p className={s.decWhere}>
        <span>{hz(lock.station === viewing && lock.freq ? lock.freq : st.freq)}</span> · {st.where}{' '}
        · {st.modulation}
      </p>
      <div
        className={s.progress}
        role="progressbar"
        aria-label="Frames received"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={have}
      >
        <span style={{ width: `${(have / total) * 100}%` }} />
        <i>
          {have === total ? 'Complete' : `${have} of ${total} frames`}
          {have === total
            ? ` · ${total} frames, every ${st.proto === 'ble' ? 'CRC' : st.proto === 'wifi' ? 'FCS' : st.proto === 'nfc' ? 'CRC_A' : 'part'} ok`
            : ''}
        </i>
      </div>
      <p className={s.hint} role="status" aria-live="polite">
        {here || !lock.station
          ? message(rx, lock)
          : `Showing what was received from ${st.title}. The VFO is on ${stationById[lock.station].title}.`}
      </p>

      <div className={s.tabs} role="tablist" aria-label="Decoder views">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-controls="decoder-panel"
            aria-selected={tab === k}
            onClick={() => onTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="decoder-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className={s.decBody}
        tabIndex={0}
      >
        {tab === 'payload' &&
          (have ? (
            <Chapter id={viewing} reveal={have / total} />
          ) : (
            <p className={s.empty}>
              Nothing decoded from {st.title} yet. Tune to {hz(st.freq)} in {st.mode} with at least{' '}
              {width(st.minBw)} of filter, or pick it from the bookmarks.
            </p>
          ))}
        {tab === 'frames' && <Frames id={viewing} log={log} sel={sel} onSel={onSel} />}
        {tab === 'raw' && (
          <pre className={s.raw}>
            {have ? program(viewing).assemble(got) : 'No bytes yet.'}
            {have && st.proto === 'gsm'
              ? `\n\n— ${total} parts, reference 0x${h2(program(viewing).frames[0].bytes[14])}, reassembled by sequence number`
              : ''}
          </pre>
        )}
      </div>
    </section>
  );
}

export default memo(Decoder);
