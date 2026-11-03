'use client';

// Calendar: every role, degree, competition, paper and fix as events on their real dates. A year
// view marks the months each one covers; the list runs through them all; calendars toggle.
import { useState } from 'react';
import { db, fmt } from '../../_shared/data';
import {
  CALENDARS,
  EVENTS,
  YEARS,
  eventById,
  inMonth,
  inYear,
  monthly,
  when,
  type CalEvent,
  type CalId,
} from '../content';
import { Icon } from '../icons';
import { CAL_TINT, Group, Row, Screen, Segmented, Switch, cx, type AppCtx } from '../ui';
import s from '../apps.module.scss';

const MONTHS = Array.from({ length: 12 }, (_, m) =>
  fmt.monthName({ y: db.asOf.y, m: m + 1 }, true),
);
const MONTHS_LONG = Array.from({ length: 12 }, (_, m) => fmt.monthName({ y: db.asOf.y, m: m + 1 }));

/** Ongoing events run to this month: the visitor's own, once the clock is known. */
const untilOf = (clock: AppCtx['clock']): db.YearMonth =>
  clock ? { y: clock.year, m: clock.month + 1 } : db.asOf;

/** "7 yrs 10 mos": how long a month-precise event ran, to now if it's ongoing. */
function span(e: CalEvent, until: db.YearMonth) {
  if (!e.from || e.to === undefined || !monthly(e)) return null;
  const n = fmt.monthsBetween(e.from, e.to ?? until) + 1;
  const y = Math.floor(n / 12);
  const m = n % 12;
  return [y && `${y} yr${y > 1 ? 's' : ''}`, m && `${m} mo${m > 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(' ');
}

export function Calendar({ ctx }: { ctx: AppCtx }) {
  const until = untilOf(ctx.clock);
  const [view, setView] = useState<'year' | 'list'>('year');
  const [year, setYear] = useState(db.asOf.y);
  const [month, setMonth] = useState<number | null>(null);
  const [hidden, setHidden] = useState<CalId[]>([]);

  const shown = EVENTS.filter((e) => !hidden.includes(e.cal));
  const toggle = (id: CalId, on: boolean) =>
    setHidden((h) => (on ? h.filter((x) => x !== id) : [...h, id]));

  if (ctx.path.startsWith('event/')) {
    const e = eventById(ctx.path.slice(6));
    if (e) return <EventView ctx={ctx} e={e} />;
  }
  if (ctx.path === 'calendars') return <Calendars ctx={ctx} hidden={hidden} toggle={toggle} />;

  const today = ctx.clock;
  const goYear = (y: number) => {
    setYear(Math.min(Math.max(YEARS.last, until.y), Math.max(YEARS.first, y)));
    setMonth(null);
  };

  const foot = (
    <div className={s.toolbar}>
      <button type="button" className={s.toolText} onClick={() => goYear(until.y)}>
        Today
      </button>
      <button type="button" className={s.toolText} onClick={() => ctx.push('calendars')}>
        Calendars
      </button>
      <span className={s.toolbarText}>{shown.length} events</span>
    </div>
  );

  if (view === 'list') {
    const years = [
      ...new Set(shown.filter((e) => e.from).map((e) => (e.from as db.YearMonth).y)),
    ].sort((a, b) => b - a);
    const undated = shown.filter((e) => !e.from);
    return (
      <Screen ctx={ctx} title="All Events" className={s.calendar} foot={foot}>
        <div className={s.pad}>
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { id: 'year', label: 'Year' },
              { id: 'list', label: 'List' },
            ]}
          />
        </div>
        {years.map((y) => (
          <Group key={y} header={String(y)}>
            {shown
              .filter((e) => e.from?.y === y)
              .sort((a, b) => ((b.from as db.YearMonth).m ?? 0) - ((a.from as db.YearMonth).m ?? 0))
              .map((e) => (
                <EventRow key={e.id} e={e} onOpen={() => ctx.push(`event/${e.id}`)} />
              ))}
          </Group>
        ))}
        {undated.length > 0 && (
          <Group
            header="No date on record"
            footer="These have no dates in the record yet, so they're listed without one."
          >
            {undated.map((e) => (
              <EventRow key={e.id} e={e} onOpen={() => ctx.push(`event/${e.id}`)} />
            ))}
          </Group>
        )}
      </Screen>
    );
  }

  const allYear = shown.filter((e) => !monthly(e) && inYear(e, year, until));
  const inThisYear = shown.filter(
    (e) => monthly(e) && MONTHS.some((_, m) => inMonth(e, year, m, until)),
  );
  const listed =
    month === null ? inThisYear : inThisYear.filter((e) => inMonth(e, year, month, until));

  return (
    <Screen
      ctx={ctx}
      title={String(year)}
      className={s.calendar}
      foot={foot}
      actions={
        <>
          <button
            type="button"
            className={s.barIcon}
            aria-label="Previous year"
            disabled={year <= YEARS.first}
            onClick={() => goYear(year - 1)}
          >
            <Icon name="chevronLeft" size={20} />
          </button>
          <button
            type="button"
            className={s.barIcon}
            aria-label="Next year"
            disabled={year >= Math.max(YEARS.last, until.y)}
            onClick={() => goYear(year + 1)}
          >
            <Icon name="chevronRight" size={20} />
          </button>
        </>
      }
    >
      <div className={s.pad}>
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { id: 'year', label: 'Year' },
            { id: 'list', label: 'List' },
          ]}
        />
      </div>
      <div className={s.years} role="group" aria-label="Years">
        {Array.from(
          { length: Math.max(YEARS.last, until.y) - YEARS.first + 1 },
          (_, i) => Math.max(YEARS.last, until.y) - i,
        ).map((y) => {
          const any = shown.some((e) => inYear(e, y, until));
          return (
            <button
              key={y}
              type="button"
              aria-pressed={y === year}
              data-any={any || undefined}
              onClick={() => goYear(y)}
            >
              {y}
            </button>
          );
        })}
      </div>
      <div className={s.months} role="group" aria-label={`Months of ${year}`}>
        {MONTHS.map((name, m) => {
          const on = inThisYear.filter((e) => inMonth(e, year, m, until));
          const isToday = today && today.year === year && today.month === m;
          return (
            <button
              key={name}
              type="button"
              className={cx(s.month, month === m && s.monthOn)}
              aria-pressed={month === m}
              aria-label={`${MONTHS_LONG[m]} ${year}: ${on.length ? on.map((e) => e.title).join(', ') : 'no events'}`}
              onClick={() => setMonth(month === m ? null : m)}
            >
              <span className={cx(s.monthName, isToday && s.monthToday)}>{name}</span>
              <span className={s.bars}>
                {on.slice(0, 4).map((e) => (
                  <i key={e.id} style={{ background: CAL_TINT[e.cal] }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {allYear.length > 0 && (
        <Group header="All year" footer="Only the year is on record for these.">
          {allYear.map((e) => (
            <EventRow key={e.id} e={e} onOpen={() => ctx.push(`event/${e.id}`)} />
          ))}
        </Group>
      )}
      <Group header={month === null ? `During ${year}` : `${MONTHS_LONG[month]} ${year}`}>
        {listed.length ? (
          listed.map((e) => <EventRow key={e.id} e={e} onOpen={() => ctx.push(`event/${e.id}`)} />)
        ) : (
          <li className={s.none}>No events</li>
        )}
      </Group>
    </Screen>
  );
}

function EventRow({ e, onOpen }: { e: CalEvent; onOpen: () => void }) {
  return (
    <Row
      onClick={onOpen}
      chevron
      lead={<span className={s.dot} style={{ background: CAL_TINT[e.cal] }} aria-hidden="true" />}
      label={e.cal === 'work' && e.where ? e.where : e.title}
      sub={e.cal === 'work' ? e.title : e.where}
      value={<span className={s.when}>{when(e)}</span>}
    />
  );
}

function EventView({ ctx, e }: { ctx: AppCtx; e: CalEvent }) {
  const cal = CALENDARS.find((c) => c.id === e.cal);
  const length = span(e, untilOf(ctx.clock));
  return (
    <Screen ctx={ctx} title="Event Details" back="Calendar" large={false} className={s.calendar}>
      <header className={s.event}>
        <span className={s.eventBar} style={{ background: CAL_TINT[e.cal] }} aria-hidden="true" />
        <h3>{e.cal === 'work' && e.where ? `${e.where}` : e.title}</h3>
        {e.cal === 'work' ? (
          <p className={s.eventWhere}>{e.title}</p>
        ) : (
          e.where && <p className={s.eventWhere}>{e.where}</p>
        )}
        <p className={s.eventWhen}>
          {when(e)}
          {e.to === null && <span className={s.live}>ongoing</span>}
        </p>
        {length && <p className={s.eventLen}>{length}</p>}
      </header>

      {e.steps && (
        <Group header="Titles">
          {e.steps.map((st) => (
            <Row key={st.title} label={st.title} value={`from ${fmt.mon(st.from)}`} />
          ))}
        </Group>
      )}

      <Group>
        <Row
          lead={
            <span className={s.dot} style={{ background: CAL_TINT[e.cal] }} aria-hidden="true" />
          }
          label="Calendar"
          value={cal?.name}
        />
        {e.url && <Row label="URL" sub={e.url.replace(/^https?:\/\//, '')} href={e.url} />}
        {e.link && (
          <Row
            label="Open in Code"
            onClick={() => ctx.open(e.link?.app as string, [e.link?.path as string])}
            chevron
          />
        )}
      </Group>

      <Group header="Notes">
        <li className={s.prose}>
          {e.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </li>
      </Group>
    </Screen>
  );
}

function Calendars({
  ctx,
  hidden,
  toggle,
}: {
  ctx: AppCtx;
  hidden: CalId[];
  toggle: (id: CalId, on: boolean) => void;
}) {
  return (
    <Screen ctx={ctx} title="Calendars" back="Calendar" className={s.calendar}>
      <Group
        header="On this phone"
        footer="Hidden calendars drop out of the year view and the list."
      >
        {CALENDARS.map((c) => (
          <li key={c.id} className={s.row}>
            <div className={s.rowHit} data-static>
              <span className={s.dot} style={{ background: CAL_TINT[c.id] }} aria-hidden="true" />
              <span className={s.rowText}>
                <span className={s.rowLabel}>{c.name}</span>
                <span className={s.rowSub}>
                  {EVENTS.filter((e) => e.cal === c.id).length} events
                </span>
              </span>
              <Switch
                on={!hidden.includes(c.id)}
                onChange={(on) => toggle(c.id, on)}
                label={`Show ${c.name}`}
              />
            </div>
          </li>
        ))}
      </Group>
    </Screen>
  );
}
