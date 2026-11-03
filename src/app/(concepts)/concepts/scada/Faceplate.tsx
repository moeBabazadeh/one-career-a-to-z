'use client';

// Level 3: faceplates. On a desk they are popups you can drag by the title bar; on a phone they
// rise as sheets. Commands that move equipment are two-step (select, then confirm), the PLC's
// permissives and interlocks are shown live, and the loop faceplate has the full PID kit.
import Image from 'next/image';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { db, fmt, hardware, profile } from '../_shared/data';
import { forTag, markOf, useHmi } from './context';
import { valveWord } from './Displays';
import {
  exportLines,
  lineByLoop,
  unitById,
  unitName,
  unitTag,
  type UnitDef,
  EPC,
  PLC,
  UPLINK,
} from './plant';
import { alarmDefs, TRIP, type LoopId, type LoopView, type Prio, type Result } from './sim';
import { alarmText, AlarmMark, Analog, MiniTrend, Pump, Valve } from './Symbols';
import { num, PRIO_NAME } from './ui';
import s from './scada.module.scss';

const DEFS = alarmDefs();
const { asOf } = db;

/* ------------------------------------------------------------------ frame */

export function describe(tag: string): string {
  if (tag === 'PIC-010' || tag === 'FIC-020')
    return tag === 'PIC-010' ? 'Header pressure controller' : 'Feed flow controller';
  if (tag === 'ENG') return 'Engineer on call';
  if (tag.startsWith('TK-')) return unitById(tag.slice(3))?.level.what ?? '';
  const ex = exportLines.find((e) => e.tag === tag);
  if (ex) return ex.repo;
  const dev = hardware.find((d) => d.tag === tag);
  if (dev) return dev.kind;
  const line = lineByLoop(tag.split('-')[1] ?? '');
  if (line) {
    const route = `${unitTag(line.from)} → ${unitTag(line.to)}`;
    if (tag.startsWith('P-')) return `Transfer pump ${route}`;
    if (tag.startsWith('XV-')) return `Isolation valve ${route}`;
    if (tag.startsWith('FI-')) return `Transfer flow ${route}`;
  }
  return '';
}

export function knownTag(tag: string) {
  return describe(tag) !== '';
}

export function Faceplate({
  tag,
  onClose,
  msg,
}: {
  tag: string;
  onClose: () => void;
  msg: Result | null;
}) {
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const box = useRef<HTMLElement>(null);
  const title = `fp-${tag}`;

  // Focus moves into the faceplate when it opens, and back where it was when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, [tag]);

  const down = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button') || matchMedia('(max-width: 760px)').matches)
      return;
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const r = box.current?.getBoundingClientRect();
    const nx = d.ox + e.clientX - d.x;
    const ny = d.oy + e.clientY - d.y;
    // Keep the title bar on screen.
    const minX = r ? -(r.left - off.x) + 8 : -Infinity;
    const maxX = r ? innerWidth - (r.right - off.x) - 8 : Infinity;
    const minY = r ? -(r.top - off.y) + 8 : -Infinity;
    const maxY = r ? innerHeight - (r.top - off.y) - 48 : Infinity;
    setOff({ x: Math.min(maxX, Math.max(minX, nx)), y: Math.min(maxY, Math.max(minY, ny)) });
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <>
      <div className={s.fpBackdrop} onClick={onClose} aria-hidden="true" />
      <section
        ref={box}
        className={s.faceplate}
        role="dialog"
        aria-labelledby={title}
        tabIndex={-1}
        style={{ '--dx': `${off.x}px`, '--dy': `${off.y}px` } as React.CSSProperties}
      >
        <header
          className={s.fpHead}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <span className={s.grip} aria-hidden="true" />
          <h2 id={title}>
            <b>{tag}</b>
            <span>{describe(tag)}</span>
          </h2>
          <button
            type="button"
            className={s.close}
            onClick={onClose}
            aria-label="Close faceplate (Esc)"
          >
            ×
          </button>
        </header>
        <div className={s.fpBody}>
          <Body tag={tag} />
        </div>
        {msg && msg.msg && (
          <p className={`${s.fpMsg} ${msg.ok ? '' : s.fpMsgBad}`} aria-live="off">
            {msg.msg}
          </p>
        )}
      </section>
    </>
  );
}

function Body({ tag }: { tag: string }) {
  if (tag === 'PIC-010' || tag === 'FIC-020') return <PidFace id={tag} />;
  if (tag === 'ENG') return <ContactFace />;
  if (tag.startsWith('TK-')) return <TankFace u={unitById(tag.slice(3)) as UnitDef} />;
  const ex = exportLines.find((e) => e.tag === tag);
  if (ex) return <ExportFace e={ex} />;
  const dev = hardware.find((d) => d.tag === tag);
  if (dev) return <DeviceFace tag={tag} />;
  const loop = tag.split('-')[1];
  if (tag.startsWith('P-')) return <PumpFace loop={loop} />;
  if (tag.startsWith('XV-')) return <ValveFace loop={loop} />;
  return <FlowFace loop={loop} />;
}

/* ------------------------------------------------------------------ PID */

function VBar({
  value,
  lo,
  hi,
  sp,
  pos,
  normal,
  limits,
  alarm,
  label,
}: {
  value: number;
  lo: number;
  hi: number;
  sp?: number;
  pos?: number;
  normal?: [number, number];
  limits?: number[];
  alarm?: Prio | null;
  label: string;
}) {
  const pct = (v: number) =>
    `${(100 * Math.max(0, Math.min(1, (v - lo) / (hi - lo)))).toFixed(2)}%`;
  return (
    <div
      className={s.vbar}
      role="meter"
      aria-label={label}
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuemin={lo}
      aria-valuemax={hi}
    >
      <span className={s.vbarScale}>
        <i>{hi}</i>
        <i>{lo}</i>
      </span>
      <span className={s.vbarTrack}>
        {normal && (
          <span
            className={s.vbarBand}
            style={{
              bottom: pct(normal[0]),
              height: `calc(${pct(normal[1])} - ${pct(normal[0])})`,
            }}
          />
        )}
        <span
          className={`${s.vbarFill} ${alarm ? s[`fill${alarm}`] : ''}`}
          style={{ height: pct(value) }}
        />
        {limits?.map((v) => (
          <span key={v} className={s.vbarLimit} style={{ bottom: pct(v) }} />
        ))}
        {sp !== undefined && (
          <span className={s.vbarSp} style={{ bottom: pct(sp) }} title="Setpoint" />
        )}
        {pos !== undefined && (
          <span className={s.vbarPos} style={{ bottom: pct(pos) }} title="Valve position" />
        )}
      </span>
      <b>{label.split(' ')[0]}</b>
    </div>
  );
}

/** A numeric field that shows the live value until you type, then sends on Enter. */
function Entry({
  value,
  digits,
  onCommit,
  disabled,
  label,
  unit,
}: {
  value: number;
  digits: number;
  onCommit: (v: number) => void;
  disabled: boolean;
  label: string;
  unit: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.toFixed(digits);
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Without this, the Enter that sends a value would also press the confirm dialog's button.
      e.preventDefault();
      const v = Number(draft ?? '');
      if (draft !== null && Number.isFinite(v)) onCommit(v);
      setDraft(null);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setDraft(null);
      e.currentTarget.blur();
    }
  };
  return (
    <span className={s.entry}>
      <input
        aria-label={label}
        inputMode="decimal"
        disabled={disabled}
        value={shown}
        onFocus={() => setDraft(value.toFixed(digits))}
        onBlur={() => setDraft(null)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={key}
      />
      <small>{unit}</small>
    </span>
  );
}

function PidFace({ id }: { id: LoopId }) {
  const { snap, plant, say, confirm } = useHmi();
  const [tab, setTab] = useState<'oper' | 'tune' | 'alarms'>('oper');
  const l = snap.loops[id];
  const c = l.cfg;
  const span = c.hi - c.lo;
  const d = span <= 20 ? 2 : 1;
  const m = markOf(snap.alarms, forTag(id));
  const auto = l.mode === 'AUTO';
  const tuning = l.tune?.phase === 'RUN';

  const setSp = (v: number) => {
    if (Math.abs(v - l.sp) > 0.1 * span)
      confirm({
        title: `Large setpoint change on ${id}`,
        body: `SP ${l.sp.toFixed(d)} → ${v.toFixed(d)} ${c.eu}, more than 10 % of span in one step.`,
        verb: 'Send SP',
        run: () => say(plant.setSp(id, v)),
      });
    else say(plant.setSp(id, v));
  };
  const setOut = (v: number) => {
    if (Math.abs(v - l.out) > 10)
      confirm({
        title: `Large output change on ${id}`,
        body: `OUT ${l.out.toFixed(1)} → ${v.toFixed(1)} %: ${c.valve} will stroke by more than 10 %.`,
        verb: 'Send OUT',
        run: () => say(plant.setOut(id, v)),
      });
    else say(plant.setOut(id, v));
  };
  const bump = (k: number) =>
    auto ? say(plant.setSp(id, l.sp + k * 0.005 * span)) : say(plant.setOut(id, l.out + k * 0.5));
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || tab !== 'oper') return;
    const k =
      e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowDown'
          ? -1
          : e.key === 'PageUp'
            ? 10
            : e.key === 'PageDown'
              ? -10
              : 0;
    if (!k) return;
    e.preventDefault();
    bump(e.shiftKey ? k * 10 : k);
  };

  return (
    <div onKeyDown={keys}>
      <div className={s.fpRow}>
        <span className={s.dim}>{`${c.tx} → ${id} → ${c.valve} · ${EPC}`}</span>
        <div className={s.modeSwitch} role="group" aria-label="Mode">
          {(['AUTO', 'MAN'] as const).map((md) => (
            <button
              key={md}
              type="button"
              aria-pressed={l.mode === md}
              onClick={() => say(plant.setMode(id, md))}
            >
              {md}
            </button>
          ))}
        </div>
      </div>
      <div className={s.tabs} role="tablist" aria-label={`${id} pages`}>
        {(['oper', 'tune', 'alarms'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t === 'oper' ? 'Operate' : t === 'tune' ? 'Tune' : 'Alarms'}
          </button>
        ))}
      </div>

      {tab === 'oper' && (
        <>
          <div className={s.pidMain}>
            <VBar
              value={l.pv}
              lo={c.lo}
              hi={c.hi}
              sp={l.sp}
              normal={[c.limits.L?.v ?? c.lo, c.limits.H?.v ?? c.hi]}
              limits={[c.limits.HH?.v, c.limits.H?.v, c.limits.L?.v].filter(
                (v): v is number => v !== undefined,
              )}
              alarm={m?.prio}
              label={`PV ${c.eu}`}
            />
            <VBar value={l.out} lo={0} hi={100} pos={l.valve} label="OUT %" />
            <dl className={s.pidVals}>
              <div>
                <dt>PV</dt>
                <dd className={alarmText(m)}>
                  {m && <AlarmMark prio={m.prio} blink={m.blink} label={`Priority ${m.prio}`} />}
                  {num(l.pv, span)}
                  <small>{c.eu}</small>
                </dd>
              </div>
              <div>
                <dt>SP</dt>
                <dd>
                  <Entry
                    value={l.sp}
                    digits={d}
                    disabled={!auto || tuning}
                    onCommit={setSp}
                    label={`${id} setpoint`}
                    unit={c.eu}
                  />
                </dd>
              </div>
              <div>
                <dt>OUT</dt>
                <dd>
                  <Entry
                    value={l.out}
                    digits={1}
                    disabled={auto || (id === 'PIC-010' && snap.trip)}
                    onCommit={setOut}
                    label={`${id} output`}
                    unit="%"
                  />
                </dd>
              </div>
              <div>
                <dt>{c.valve}</dt>
                <dd className={s.value}>
                  {l.valve.toFixed(1)}
                  <small>% pos</small>
                </dd>
              </div>
              <div>
                <dt>ERR</dt>
                <dd className={s.value}>
                  {(l.sp - l.pv).toFixed(d)}
                  <small>{c.eu}</small>
                </dd>
              </div>
            </dl>
          </div>
          <div
            className={s.raise}
            role="group"
            aria-label={`Lower or raise ${auto ? 'SP' : 'OUT'}`}
          >
            <button
              type="button"
              onClick={() => bump(-10)}
              disabled={tuning}
              aria-label="Lower fast"
            >
              ▼▼
            </button>
            <button type="button" onClick={() => bump(-1)} disabled={tuning} aria-label="Lower">
              ▼
            </button>
            <span>{auto ? 'SP' : 'OUT'}</span>
            <button type="button" onClick={() => bump(1)} disabled={tuning} aria-label="Raise">
              ▲
            </button>
            <button
              type="button"
              onClick={() => bump(10)}
              disabled={tuning}
              aria-label="Raise fast"
            >
              ▲▲
            </button>
          </div>
          <p className={s.hint}>
            <kbd>↑</kbd> <kbd>↓</kbd> nudge {auto ? 'SP' : 'OUT'}, <kbd>Shift</kbd> for ×10. Type a
            value and press <kbd>Enter</kbd>.
          </p>
          <MiniTrend
            plant={plant}
            tag={id}
            lo={c.lo}
            hi={c.hi}
            normal={[l.sp - (c.limits.DEV?.v ?? 0), l.sp + (c.limits.DEV?.v ?? 0)]}
            seconds={120}
            stamp={snap.version}
            label={`${id}: SP dashed, PV solid, OUT thin, last two minutes`}
          />
          <p className={s.legend}>
            <i className={s.lgPv} /> PV <i className={s.lgSp} /> SP <i className={s.lgOut} /> OUT ·
            2 min · SIM
          </p>
          {id === 'PIC-010' && (
            <div className={`${s.intlk} ${snap.trip ? s.intlkTrip : ''}`}>
              <div>
                <b>{TRIP.tag}</b> High header pressure trip at {TRIP.at.toFixed(1)} bar
                <span>{snap.trip ? `TRIPPED · ${c.valve} forced closed` : 'HEALTHY'}</span>
              </div>
              <button
                type="button"
                className={s.btn}
                disabled={!snap.trip}
                onClick={() =>
                  confirm({
                    title: `Reset ${TRIP.tag}?`,
                    body: `The PLC accepts the reset only below ${TRIP.reset.toFixed(1)} bar. The loop stays in MAN.`,
                    verb: 'Reset',
                    run: () => say(plant.resetTrip()),
                  })
                }
              >
                Reset
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'tune' && <TunePage key={`${l.kc}-${l.ti}-${l.td}`} l={l} />}

      {tab === 'alarms' && (
        <div className={s.tableScroll}>
          <table className={s.miniTable}>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Limit</th>
                <th scope="col">Pri</th>
                <th scope="col">DB / delay</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {DEFS.filter((a) => a.loop === id).map((a) => {
                const live = [...snap.alarms, ...snap.suppressed].find((x) => x.id === a.id);
                return (
                  <tr key={a.id}>
                    <td className={s.mono}>{a.tag}</td>
                    <td className={s.mono}>{`${a.kind === 'DEV' ? '±' : ''}${a.limit} ${a.eu}`}</td>
                    <td>
                      <AlarmMark prio={a.prio} label={PRIO_NAME[a.prio]} />
                    </td>
                    <td className={s.mono}>{`${a.deadband.toFixed(2)} / ${a.onDelay} s`}</td>
                    <td className={s.mono}>
                      {live
                        ? live.suppressed
                          ? 'SUPP'
                          : live.shelvedUntil
                            ? 'SHLV'
                            : live.state
                        : 'NORM'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={s.hint}>
            Deviation alarms are suppressed by design in MAN and during a tuning test.
          </p>
        </div>
      )}
    </div>
  );
}

function TunePage({ l }: { l: LoopView }) {
  const { plant, say, confirm } = useHmi();
  const [kc, setKc] = useState(l.kc.toFixed(2));
  const [ti, setTi] = useState(l.ti.toFixed(2));
  const [td, setTd] = useState(l.td.toFixed(2));
  const t = l.tune;
  const apply = () => {
    const v = { kc: Number(kc), ti: Number(ti), td: Number(td) };
    if (![v.kc, v.ti, v.td].every(Number.isFinite))
      return say({ ok: false, msg: 'Tuning values must be numbers.' });
    confirm({
      title: `Download tuning to ${l.id}?`,
      body: `Kc ${v.kc}, Ti ${v.ti} s, Td ${v.td} s. The output stays where it is (bumpless).`,
      verb: 'Download',
      run: () => say(plant.setTuning(l.id, v)),
    });
  };
  return (
    <div className={s.tune}>
      <form
        className={s.tuneForm}
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label>
          <span>Kc</span>
          <input inputMode="decimal" value={kc} onChange={(e) => setKc(e.target.value)} />
          <small>gain, %/%</small>
        </label>
        <label>
          <span>Ti</span>
          <input inputMode="decimal" value={ti} onChange={(e) => setTi(e.target.value)} />
          <small>integral, s</small>
        </label>
        <label>
          <span>Td</span>
          <input inputMode="decimal" value={td} onChange={(e) => setTd(e.target.value)} />
          <small>derivative, s</small>
        </label>
        <button type="submit" className={s.btn}>
          Download
        </button>
      </form>
      <label className={s.check}>
        <input
          type="checkbox"
          checked={l.spTrack}
          onChange={(e) => plant.setTrack(l.id, e.target.checked)}
        />
        SP tracks PV in MAN (bumpless return to AUTO)
      </label>
      <p className={s.hint}>
        Reverse acting: PV above SP closes the valve. Form: ISA dependent, derivative on PV, filter
        Td/8, conditional integration.
      </p>
      <h3 className={s.subhead}>Relay autotune</h3>
      {!t && (
        <>
          <p className={s.hint}>
            Replaces the PID with a relay around the current output until the loop oscillates, then
            reads the ultimate gain Ku and period Pu and proposes Tyreus–Luyben settings.
          </p>
          <button type="button" className={s.btn} onClick={() => say(plant.startTune(l.id))}>
            Start relay test
          </button>
        </>
      )}
      {t?.phase === 'RUN' && (
        <div className={s.tuneRun}>
          <span className={s.progress}>
            <span style={{ width: `${Math.min(100, (t.switches / 9) * 100)}%` }} />
          </span>
          <span className={s.mono}>{`${t.switches}/9 switches · ${t.t.toFixed(1)} s`}</span>
          <button type="button" className={s.btn} onClick={() => plant.stopTune(l.id)}>
            Abort
          </button>
        </div>
      )}
      {t?.phase === 'FAIL' && (
        <div className={s.tuneRun}>
          <span className={s.bad}>{`Test failed: ${t.reason}`}</span>
          <button type="button" className={s.btn} onClick={() => plant.stopTune(l.id)}>
            Dismiss
          </button>
        </div>
      )}
      {t?.phase === 'DONE' && t.pi && t.pid && (
        <>
          <p className={s.mono}>{`Ku ${t.ku?.toFixed(2)} · Pu ${t.pu?.toFixed(2)} s`}</p>
          <table className={s.miniTable}>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Kc</th>
                <th scope="col">Ti s</th>
                <th scope="col">Td s</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Now</th>
                <td className={s.mono}>{l.kc.toFixed(2)}</td>
                <td className={s.mono}>{l.ti.toFixed(2)}</td>
                <td className={s.mono}>{l.td.toFixed(2)}</td>
              </tr>
              {(['pi', 'pid'] as const).map((k) => (
                <tr key={k}>
                  <th scope="row">{k.toUpperCase()}</th>
                  <td className={s.mono}>{t[k]?.kc.toFixed(2)}</td>
                  <td className={s.mono}>{t[k]?.ti.toFixed(2)}</td>
                  <td className={s.mono}>{t[k]?.td.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={s.btnRow}>
            <button
              type="button"
              className={s.btn}
              onClick={() => say(plant.applyTune(l.id, 'pi'))}
            >
              Apply PI
            </button>
            <button
              type="button"
              className={s.btn}
              onClick={() => say(plant.applyTune(l.id, 'pid'))}
            >
              Apply PID
            </button>
            <button type="button" className={s.btn} onClick={() => plant.stopTune(l.id)}>
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pump, valve, flow */

function Related({ loop, skip }: { loop: string; skip: string }) {
  const { open, nav } = useHmi();
  const l = lineByLoop(loop);
  if (!l) return null;
  return (
    <div className={s.btnRow}>
      {['P', 'XV', 'FI']
        .map((p) => `${p}-${loop}`)
        .filter((t) => t !== skip)
        .map((t) => (
          <button key={t} type="button" className={s.btn} onClick={() => open(t)}>
            {t}
          </button>
        ))}
      <button type="button" className={s.btn} onClick={() => nav({ view: 'unit', unit: l.from })}>
        {`${unitTag(l.from)} display`}
      </button>
    </div>
  );
}

function PumpFace({ loop }: { loop: string }) {
  const { snap, plant, say, confirm } = useHmi();
  const v = snap.lines[loop];
  const l = v.def;
  const tag = `P-${loop}`;
  const running = v.pump !== 'STOP';
  return (
    <>
      <div className={s.equipState}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <Pump cx={24} cy={24} r={18} state={v.pump} />
        </svg>
        <div>
          <b>{v.pump === 'RUN' ? 'RUNNING' : v.pump === 'START' ? 'STARTING' : 'STOPPED'}</b>
          <span
            className={s.dim}
          >{`${unitTag(l.from)} ${unitName(l.from)} → ${unitTag(l.to)} ${unitName(l.to)}`}</span>
        </div>
      </div>
      <div className={s.btnRow}>
        <button
          type="button"
          className={s.cmd}
          disabled={running}
          onClick={() =>
            confirm({
              title: `Start ${tag}?`,
              body: `Transfer from ${unitTag(l.from)} to ${unitTag(l.to)} resumes. ${PLC} checks the permissives below before it energises the motor.`,
              verb: 'Start',
              run: () => say(plant.pump(loop, true)),
            })
          }
        >
          Start
        </button>
        <button
          type="button"
          className={s.cmd}
          disabled={!running}
          onClick={() =>
            confirm({
              title: `Stop ${tag}?`,
              body: `Transfer from ${unitTag(l.from)} to ${unitTag(l.to)} stops. FAL-${loop} is suppressed while the pump is off.`,
              verb: 'Stop',
              run: () => say(plant.pump(loop, false)),
            })
          }
        >
          Stop
        </button>
      </div>
      <h3 className={s.subhead}>{`Start permissives · ${PLC}`}</h3>
      <ul className={s.permits}>
        {v.permits.map((p) => (
          <li key={p.label} className={p.ok ? s.ok : s.notOk}>
            <span aria-hidden="true">{p.ok ? '✓' : '✗'}</span>
            {p.label}
            <span className={s.srOnly}>{p.ok ? 'met' : 'not met'}</span>
          </li>
        ))}
      </ul>
      <h3 className={s.subhead}>Interlocks</h3>
      <ul className={s.permits}>
        <li className={running ? s.active : ''}>
          <span aria-hidden="true">{running ? '●' : '○'}</span>
          {`XV-${loop} close blocked while running (dead-head protection)`}
        </li>
      </ul>
      <p className={s.flowLine}>
        <span className={s.mono}>{`FI-${loop}`}</span>
        <Analog
          value={v.flow}
          lo={0}
          hi={30}
          normal={[l.nominal * 0.4, l.nominal * 1.3]}
          limits={{ l: l.nominal * 0.4 }}
          label={`FI-${loop}`}
          compact
        />
        <b className={s.value}>{`${num(v.flow, 30)} m³/h`}</b>
      </p>
      <Related loop={loop} skip={tag} />
    </>
  );
}

function ValveFace({ loop }: { loop: string }) {
  const { snap, plant, say, confirm } = useHmi();
  const v = snap.lines[loop];
  const tag = `XV-${loop}`;
  const zso = v.valve >= 99.5;
  const zsc = v.valve <= 0.5;
  return (
    <>
      <div className={s.equipState}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <Valve cx={24} cy={24} sz={16} pos={v.valve} />
        </svg>
        <div>
          <b>{valveWord(v.valve)}</b>
          <span className={s.dim}>{`Commanded ${v.valveCmd} · stroke 5 s`}</span>
        </div>
      </div>
      <p className={s.flowLine}>
        <span className={s.mono}>ZI</span>
        <Analog value={v.valve} lo={0} hi={100} label={`${tag} position`} compact />
        <b className={s.value}>{`${v.valve.toFixed(0)} %`}</b>
      </p>
      <ul className={s.switches}>
        <li className={zso ? s.lit : ''}>ZSO open</li>
        <li className={zsc ? s.lit : ''}>ZSC closed</li>
      </ul>
      <div className={s.btnRow}>
        <button
          type="button"
          className={s.cmd}
          disabled={v.valveCmd === 'OPEN'}
          onClick={() =>
            confirm({
              title: `Open ${tag}?`,
              body: `The valve strokes open over 5 s. P-${loop} can start once ZSO is made.`,
              verb: 'Open',
              run: () => say(plant.valve(loop, true)),
            })
          }
        >
          Open
        </button>
        <button
          type="button"
          className={s.cmd}
          disabled={v.valveCmd === 'CLOSE'}
          onClick={() =>
            confirm({
              title: `Close ${tag}?`,
              body: v.closeBlocked
                ? `P-${loop} is running: ${PLC} will refuse this to protect the pump.`
                : `Isolates the transfer line to ${unitTag(v.def.to)}.`,
              verb: 'Close',
              run: () => say(plant.valve(loop, false)),
            })
          }
        >
          Close
        </button>
      </div>
      <h3 className={s.subhead}>{`Interlocks · ${PLC}`}</h3>
      <ul className={s.permits}>
        <li className={v.closeBlocked ? s.active : ''}>
          <span aria-hidden="true">{v.closeBlocked ? '●' : '○'}</span>
          {`Close blocked while P-${loop} runs`}
        </li>
      </ul>
      <Related loop={loop} skip={tag} />
    </>
  );
}

function FlowFace({ loop }: { loop: string }) {
  const { snap, plant } = useHmi();
  const v = snap.lines[loop];
  if (!v) return <p>Unknown tag.</p>;
  const l = v.def;
  const def = DEFS.find((a) => a.line === loop);
  const live = [...snap.alarms, ...snap.suppressed].find((a) => a.id === def?.id);
  const m = markOf(snap.alarms, forTag(`FI-${loop}`));
  return (
    <>
      <p className={s.bigValue}>
        {m && <AlarmMark prio={m.prio} blink={m.blink} label={`Priority ${m.prio}`} />}
        <b className={alarmText(m)}>{num(v.flow, 30)}</b>
        <small>m³/h</small>
      </p>
      <Analog
        value={v.flow}
        lo={0}
        hi={30}
        normal={[l.nominal * 0.4, l.nominal * 1.3]}
        limits={{ l: def?.limit }}
        sp={l.nominal}
        alarm={m}
        label={`FI-${loop} flow`}
      />
      <dl className={s.facts}>
        <div>
          <dt>Design flow</dt>
          <dd>{`${l.nominal} m³/h`}</dd>
        </div>
        <div>
          <dt>{def?.tag}</dt>
          <dd>{`< ${def?.limit} m³/h · priority ${def?.prio} · ${live ? (live.suppressed ? 'suppressed by design' : live.state) : 'NORM'}`}</dd>
        </div>
      </dl>
      <MiniTrend
        plant={plant}
        tag={`FI-${loop}`}
        lo={0}
        hi={30}
        normal={[l.nominal * 0.4, l.nominal * 1.3]}
        seconds={120}
        stamp={snap.version}
        label={`FI-${loop}, last two minutes`}
        out={false}
      />
      <p className={s.hint}>
        Flow follows the pump, the valve and the square root of header pressure. Simulated.
      </p>
      <Related loop={loop} skip={`FI-${loop}`} />
    </>
  );
}

/* ------------------------------------------------------------------ facts */

function TankFace({ u }: { u: UnitDef }) {
  const { nav } = useHmi();
  return (
    <>
      <p className={s.bigValue}>
        <b className={s.value}>{u.level.pv}</b>
        <small>{u.level.eu}</small>
      </p>
      <Analog value={u.level.pv} lo={0} hi={u.level.hi} label={u.level.tag} />
      <dl className={s.facts}>
        <div>
          <dt>{u.level.tag}</dt>
          <dd>{`${u.level.what}, range 0–${u.level.hi} ${u.level.eu}`}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{u.open ? 'Filling: the role is still open' : 'Holding'}</dd>
        </div>
        <div>
          <dt>Quality</dt>
          <dd>{`GOOD · from the facts as of ${fmt.iso(asOf)}`}</dd>
        </div>
        {u.role && (
          <div>
            <dt>Unit</dt>
            <dd>{`${u.role.org}: ${db.titlePath(u.role)}, ${fmt.monthSpan(u.role.from, u.role.to)}`}</dd>
          </div>
        )}
      </dl>
      <div className={s.btnRow}>
        <button type="button" className={s.btn} onClick={() => nav({ view: 'unit', unit: u.id })}>
          {`${u.tag} display`}
        </button>
      </div>
    </>
  );
}

function ExportFace({ e }: { e: (typeof exportLines)[number] }) {
  return (
    <>
      <p className={s.bigValue}>
        <b className={s.value}>{e.weekly}</b>
        <small>downloads / week</small>
      </p>
      <dl className={s.facts}>
        <div>
          <dt>Repository</dt>
          <dd>{`${e.repo} · ★ ${e.stars}`}</dd>
        </div>
        <div>
          <dt>Year</dt>
          <dd>{e.year}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd>{e.kind}</dd>
        </div>
        <div>
          <dt>Change</dt>
          <dd>{e.change}</dd>
        </div>
        <div>
          <dt>Why</dt>
          <dd>{e.impact}</dd>
        </div>
      </dl>
      <a className={s.btn} href={e.url} target="_blank" rel="noreferrer">
        Open the pull request ↗
      </a>
    </>
  );
}

function DeviceFace({ tag }: { tag: string }) {
  const d = hardware.find((h) => h.tag === tag);
  if (!d) return null;
  const { logger, attendumReader: ar, plc } = db.devices;
  const extra: [string, string][] =
    tag === logger.tag
      ? [
          ['Stations', logger.stations.long],
          ['Online', `${logger.online.long} years`],
          ['Records', logger.records.long],
          ['Uplink', UPLINK],
        ]
      : tag === ar.tag
        ? [
            ['Chip', ar.chip],
            ['Battery', `about ${ar.batteryMonths} months`],
            ['Fleet scope', ar.fleet.scope],
            ['Online', ar.fleet.online.long],
            ['Classrooms', ar.fleet.classrooms.long],
            ['Classes', ar.fleet.classes.long],
            ['Records', `${ar.fleet.records.long} in ${ar.fleet.recordYears} years`],
          ]
        : tag === plc.tag
          ? [
              ['Chip', plc.chip],
              ['Here', 'Runs this plant’s interlocks and permissives'],
            ]
          : tag === db.devices.attendumBeacon.tag
            ? [['Chip', db.devices.attendumBeacon.chip]]
            : [];
  return (
    <>
      <p className={s.bigValue}>
        <b>{d.name}</b>
      </p>
      <p>{d.detail}</p>
      <dl className={s.facts}>
        {extra.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div>
          <dt>Figures</dt>
          <dd>{d.figures.join(' · ')}</dd>
        </div>
      </dl>
      <p className={s.hint}>Counts that grow are lower bounds, as of {fmt.iso(asOf)}.</p>
    </>
  );
}

function ContactFace() {
  return (
    <div className={s.contactFace}>
      <Image
        src={db.person.photo}
        width={120}
        height={120}
        alt={profile.name}
        className={s.photo}
      />
      <div>
        <p className={s.bigValue}>
          <b>{profile.name}</b>
        </p>
        <p className={s.dim}>{`${profile.role}, ${profile.company}`}</p>
        <p>
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
        </p>
        <p className={s.links}>
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn ↗
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <a href={profile.cv} target="_blank" rel="noreferrer">
            CV ↗
          </a>
        </p>
        <p className={s.hint}>Write about a platform, a device or a team that needs building.</p>
      </div>
    </div>
  );
}
