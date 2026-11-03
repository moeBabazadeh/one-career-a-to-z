'use client';

// The alarm system's operator side: the banner across the top, the alarm summary (acknowledge,
// shelve with a reason and a time limit, go to the display), and the event journal.
import { useState, type KeyboardEvent } from 'react';
import { useHmi } from './context';
import { HISTORY, stamp, unitById } from './plant';
import type { AlarmView, LogKind, Prio } from './sim';
import { AlarmMark } from './Symbols';
import { clock, num, parse, PRIO_NAME, stampMs } from './ui';
import s from './scada.module.scss';

const PRIOS: Prio[] = [1, 2, 3, 4];

/** The alarm the banner shows: unacknowledged first, then most urgent, then newest. */
export function bannerAlarm(alarms: AlarmView[]) {
  const rank = (a: AlarmView) => (a.state === 'UNACK' ? 0 : a.state === 'RTNUN' ? 1 : 2);
  return (
    alarms
      .filter((a) => a.shelvedUntil === null)
      .sort((a, b) => rank(a) - rank(b) || a.prio - b.prio || b.seq - a.seq)[0] ?? null
  );
}

const stateWord = (a: AlarmView) =>
  a.state === 'UNACK'
    ? 'UNACK'
    : a.state === 'RTNUN'
      ? 'RTN UNACK'
      : a.state === 'ACKED'
        ? 'ACK'
        : 'NORM';

export function Banner({ hornOn, onHorn }: { hornOn: boolean; onHorn: () => void }) {
  const { snap, plant, nav } = useHmi();
  const top = bannerAlarm(snap.alarms);
  const goto = (a: AlarmView) => nav(parse(`#/${a.route}`));
  const unacked = PRIOS.reduce((n, p) => n + snap.unacked[p], 0);
  return (
    <div
      className={`${s.banner} ${top && top.state === 'UNACK' ? s.bannerHot : ''}`}
      role="region"
      aria-label="Alarm banner"
    >
      <ul className={s.counts} aria-label="Unacknowledged alarms by priority">
        {PRIOS.map((p) => (
          <li key={p} className={snap.unacked[p] ? '' : s.zero}>
            <AlarmMark prio={p} label={PRIO_NAME[p]} />
            <span>{snap.unacked[p]}</span>
          </li>
        ))}
      </ul>
      <div className={s.bannerMsg} aria-live="polite">
        {top ? (
          <button
            type="button"
            className={s.bannerAlarm}
            onClick={() => goto(top)}
            title="Go to the display"
          >
            <AlarmMark prio={top.prio} blink={top.state === 'UNACK'} />
            <span className={s.mono}>{clock(top.tIn)}</span>
            <b>{top.tag}</b>
            <span className={s.bannerDesc}>{top.desc}</span>
            <span className={s.bannerState}>{stateWord(top)}</span>
          </button>
        ) : (
          <span className={s.dim}>No active alarms</span>
        )}
      </div>
      <div className={s.bannerBtns}>
        <button
          type="button"
          className={s.bbtn}
          disabled={!top || (top.state !== 'UNACK' && top.state !== 'RTNUN')}
          onClick={() => top && plant.ack([top.id])}
          title="Acknowledge the banner alarm (K)"
        >
          Ack <kbd>K</kbd>
        </button>
        <button
          type="button"
          className={`${s.bbtn} ${snap.horn ? s.hornHot : ''}`}
          disabled={!snap.horn}
          onClick={() => plant.silence()}
          title="Silence the horn (H)"
        >
          Silence <kbd>H</kbd>
        </button>
        <button
          type="button"
          className={s.bbtn}
          aria-pressed={hornOn}
          onClick={onHorn}
          title="Audible horn for priority 1 and 2 alarms"
        >
          {hornOn ? 'Horn on' : 'Horn off'}
        </button>
      </div>
      <span className={s.unackTotal}>{unacked ? `${unacked} unack` : ''}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ alarm summary */

const REASONS = ['Nuisance: chattering', 'Maintenance on the line', 'Testing'];
const DURATIONS = [5, 15, 60];

export function AlarmSummary() {
  const { snap, plant, nav } = useHmi();
  const [tab, setTab] = useState<'active' | 'shelved' | 'suppressed'>('active');
  const [sel, setSel] = useState<string | null>(null);
  const [only, setOnly] = useState<Prio | null>(null);
  const [byPrio, setByPrio] = useState(true);
  const [shelving, setShelving] = useState(false);
  const [mins, setMins] = useState(DURATIONS[1]);
  const [reason, setReason] = useState(REASONS[0]);

  const source =
    tab === 'active'
      ? snap.alarms.filter((a) => a.shelvedUntil === null)
      : tab === 'shelved'
        ? snap.alarms.filter((a) => a.shelvedUntil !== null)
        : snap.suppressed;
  const rows = source
    .filter((a) => only === null || a.prio === only)
    .sort((a, b) => (byPrio ? a.prio - b.prio || b.seq - a.seq : b.seq - a.seq));
  const current = rows.find((a) => a.id === sel) ?? null;
  const unackRows = rows.filter((a) => a.state === 'UNACK' || a.state === 'RTNUN');
  const recent = snap.log.filter((e) => e.kind === 'ALM' && snap.now - e.t < 600000).length;

  const keys = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const i = rows.findIndex((a) => a.id === sel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) {
        setSel(n.id);
        (e.currentTarget.querySelector(`[data-id="${n.id}"]`) as HTMLElement | null)?.focus();
      }
    } else if (e.key === 'Enter' && current) nav(parse(`#/${current.route}`));
    else if ((e.key === 'k' || e.key === 'K' || e.key === ' ') && current) {
      e.preventDefault();
      e.stopPropagation();
      plant.ack([current.id]);
    }
  };

  return (
    <div className={s.alarmView}>
      <header className={s.unitHead}>
        <div>
          <p className={s.kicker}>ALARM SUMMARY</p>
          <h1>Alarms</h1>
          <p
            className={s.identRole}
          >{`${snap.alarms.filter((a) => a.active).length} active · ${PRIOS.reduce((n, p) => n + snap.unacked[p], 0)} unacknowledged · ${snap.alarms.filter((a) => a.shelvedUntil !== null).length} shelved · ${snap.suppressed.length} suppressed by design · ${recent} raised in the last 10 min`}</p>
        </div>
      </header>

      <div className={s.alarmBar}>
        <div className={s.tabs} role="tablist" aria-label="Alarm lists">
          {(['active', 'shelved', 'suppressed'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t === 'active' ? 'Active' : t === 'shelved' ? 'Shelved' : 'Suppressed'}
            </button>
          ))}
        </div>
        <div className={s.filters} role="group" aria-label="Filter by priority">
          {PRIOS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={only === p}
              onClick={() => setOnly(only === p ? null : p)}
              title={PRIO_NAME[p]}
            >
              <AlarmMark prio={p} label={`Only priority ${p}`} />
            </button>
          ))}
          <button type="button" aria-pressed={byPrio} onClick={() => setByPrio(!byPrio)}>
            {byPrio ? 'Sort: priority' : 'Sort: time'}
          </button>
        </div>
        <div className={s.btnRow}>
          <button
            type="button"
            className={s.btn}
            disabled={!current || (current.state !== 'UNACK' && current.state !== 'RTNUN')}
            onClick={() => current && plant.ack([current.id])}
          >
            Ack
          </button>
          <button
            type="button"
            className={s.btn}
            disabled={!unackRows.length}
            onClick={() => plant.ack(unackRows.map((a) => a.id))}
          >
            Ack page
          </button>
          {tab === 'shelved' ? (
            <button
              type="button"
              className={s.btn}
              disabled={!current}
              onClick={() => current && plant.unshelve(current.id)}
            >
              Unshelve
            </button>
          ) : (
            <button
              type="button"
              className={s.btn}
              disabled={!current || tab === 'suppressed'}
              onClick={() => setShelving(true)}
            >
              Shelve…
            </button>
          )}
          <button
            type="button"
            className={s.btn}
            disabled={!current}
            onClick={() => current && nav(parse(`#/${current.route}`))}
          >
            Go to display
          </button>
        </div>
      </div>

      {shelving && current && tab === 'active' && (
        <form
          className={s.shelve}
          onSubmit={(e) => {
            e.preventDefault();
            plant.shelve(current.id, mins, reason);
            setShelving(false);
          }}
        >
          <b>{`Shelve ${current.tag}`}</b>
          <label>
            For
            <select value={mins} onChange={(e) => setMins(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{`${d} min`}</option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button type="submit" className={s.btn}>
            Shelve
          </button>
          <button type="button" className={s.btn} onClick={() => setShelving(false)}>
            Cancel
          </button>
        </form>
      )}

      <div className={s.tableScroll}>
        <table className={s.alarmTable}>
          <thead>
            <tr>
              <th scope="col">Pri</th>
              <th scope="col">Time</th>
              <th scope="col">Tag</th>
              <th scope="col">Description</th>
              <th scope="col">Value</th>
              <th scope="col">Limit</th>
              <th scope="col">{tab === 'shelved' ? 'Remaining' : 'State'}</th>
              <th scope="col">Unit</th>
            </tr>
          </thead>
          <tbody onKeyDown={keys}>
            {rows.map((a) => {
              const left = a.shelvedUntil ? Math.max(0, a.shelvedUntil - snap.now) : 0;
              return (
                <tr
                  key={a.id}
                  data-id={a.id}
                  tabIndex={a.id === sel || (!current && a === rows[0]) ? 0 : -1}
                  aria-selected={a.id === sel}
                  className={`${a.id === sel ? s.selRow : ''} ${a.state === 'UNACK' ? s.unackRow : ''} ${!a.active ? s.rtnRow : ''}`}
                  onClick={() => setSel(a.id)}
                  onFocus={() => setSel(a.id)}
                  onDoubleClick={() => nav(parse(`#/${a.route}`))}
                >
                  <td>
                    <AlarmMark
                      prio={a.prio}
                      blink={a.state === 'UNACK' && tab === 'active'}
                      label={PRIO_NAME[a.prio]}
                    />
                  </td>
                  <td className={s.mono}>{tab === 'suppressed' ? '—' : stampMs(a.tIn)}</td>
                  <td className={s.mono}>
                    <b>{a.tag}</b>
                  </td>
                  <td>{a.desc}</td>
                  <td className={s.mono}>
                    {tab === 'suppressed'
                      ? '—'
                      : `${num(a.value, a.eu === 'bar' ? 10 : 60)} ${a.eu}`}
                  </td>
                  <td
                    className={s.mono}
                  >{`${a.kind === 'DEV' ? '±' : a.kind === 'L' ? '<' : '>'}${a.limit}`}</td>
                  <td className={s.mono}>
                    {tab === 'shelved'
                      ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')} · ${a.reason}`
                      : tab === 'suppressed'
                        ? 'SUPP'
                        : stateWord(a)}
                  </td>
                  <td className={s.mono}>{a.unit}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className={s.empty}>
                  {tab === 'active'
                    ? 'No alarms. The plant is quiet.'
                    : tab === 'shelved'
                      ? 'Nothing shelved.'
                      : 'Nothing suppressed right now.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={s.hint}>
        Click a row to select it, <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>K</kbd> or{' '}
        <kbd>Space</kbd> to acknowledge, <kbd>Enter</kbd> or double-click to go to its display.
        Unacknowledged alarms flash; an alarm that cleared before it was acknowledged stays as RTN
        UNACK until you do.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ event journal */

const KINDS: LogKind[] = [
  'ALM',
  'RTN',
  'ACK',
  'SHLV',
  'UNSHLV',
  'CMD',
  'REJ',
  'INTLK',
  'TUNE',
  'SYS',
];

export function Events() {
  const { snap, nav } = useHmi();
  const [tab, setTab] = useState<'history' | 'shift'>('history');
  const [hide, setHide] = useState<LogKind[]>([]);
  const log = snap.log.filter((e) => !hide.includes(e.kind));
  return (
    <div className={s.alarmView}>
      <header className={s.unitHead}>
        <div>
          <p className={s.kicker}>EVENT JOURNAL</p>
          <h1>Events</h1>
          <p className={s.identRole}>
            The plant’s history is the career, dated from the facts. The shift log is this session:
            alarms, acknowledgements and every operator command.
          </p>
        </div>
      </header>
      <div className={s.alarmBar}>
        <div className={s.tabs} role="tablist" aria-label="Journals">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
          >
            Plant history
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'shift'}
            onClick={() => setTab('shift')}
          >
            {`Shift log (${snap.log.length})`}
          </button>
        </div>
        {tab === 'shift' && (
          <div className={s.filters} role="group" aria-label="Show event kinds">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={!hide.includes(k)}
                onClick={() =>
                  setHide(hide.includes(k) ? hide.filter((x) => x !== k) : [...hide, k])
                }
              >
                {k}
              </button>
            ))}
          </div>
        )}
      </div>
      {tab === 'history' ? (
        <div className={s.tableScroll}>
          <table className={s.alarmTable}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Unit</th>
                <th scope="col">Event</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {HISTORY.map((h) => {
                const u = unitById(h.unit.slice(2));
                return (
                  <tr key={`${h.unit}${h.event}${h.text}`}>
                    <td className={s.mono}>{stamp(h.at)}</td>
                    <td className={s.mono}>
                      {u ? (
                        <button
                          type="button"
                          className={s.tagBtn}
                          onClick={() => nav({ view: 'unit', unit: u.id })}
                        >
                          {h.unit}
                        </button>
                      ) : (
                        h.unit
                      )}
                    </td>
                    <td className={s.mono}>{h.event}</td>
                    <td>
                      {h.url ? (
                        <a href={h.url} target="_blank" rel="noreferrer">
                          {h.text} ↗
                        </a>
                      ) : (
                        h.text
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={s.tableScroll}>
          <table className={s.alarmTable}>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Kind</th>
                <th scope="col">Tag</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => (
                <tr key={e.id}>
                  <td className={s.mono}>{stampMs(e.t)}</td>
                  <td className={s.mono}>
                    {e.prio && (e.kind === 'ALM' || e.kind === 'INTLK') ? (
                      <AlarmMark prio={e.prio} />
                    ) : null}{' '}
                    {e.kind}
                  </td>
                  <td className={s.mono}>{e.tag}</td>
                  <td>{e.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
