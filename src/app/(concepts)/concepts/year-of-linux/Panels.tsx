import { useEffect, useRef, useState } from 'react';
import { db, fmt, profile } from '../_shared/data';
import { Icon, type IconName } from './icons';
import { Menubar, type BarMenu, type MenuItem } from './Menu';
import { APPS, WORKSPACES, onWorkspace, type AppId, type WmState } from './wm';
import s from './desktop.module.scss';

/* ---------------------------------------------------------------- the calendar's events */

interface Event {
  y: number;
  m: number;
  text: string;
}

// Every dated fact with a month, so the clock's calendar can say what happened in the month on
// screen, across the years.
const EVENTS: Event[] = [
  ...db.roleList.flatMap((r) => [
    ...r.steps
      .filter((st) => st.from.m)
      .map((st) => ({ y: st.from.y, m: st.from.m!, text: `${st.title}, ${r.short ?? r.org}` })),
    ...(r.to?.m ? [{ y: r.to.y, m: r.to.m, text: `Left ${r.short ?? r.org}` }] : []),
  ]),
  {
    y: db.awards.robocup.date.y,
    m: db.awards.robocup.date.m!,
    text: `${db.awards.robocup.place}, ${db.awards.robocup.event}`,
  },
  {
    y: db.papers.inverter.date.y,
    m: db.papers.inverter.date.m!,
    text: `Paper on ${db.papers.inverter.venue}`,
  },
].sort((a, b) => a.y - b.y);

function Calendar({ start }: { start: Date }) {
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const first = new Date(view.y, view.m, 1);
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const lead = first.getDay();
  const today =
    start.getFullYear() === view.y && start.getMonth() === view.m ? start.getDate() : -1;
  const events = EVENTS.filter((e) => e.m === view.m + 1);
  const shift = (d: number) => {
    const t = new Date(view.y, view.m + d, 1);
    setView({ y: t.getFullYear(), m: t.getMonth() });
  };
  return (
    <div className={s.calendar}>
      <div className={s.calHead}>
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>
          ◂
        </button>
        <b aria-live="polite">{fmt.month({ y: view.y, m: view.m + 1 })}</b>
        <button type="button" aria-label="Next month" onClick={() => shift(1)}>
          ▸
        </button>
      </div>
      <div className={s.calGrid} role="grid" aria-label="Calendar">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className={s.calDow} aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => (
          <span key={i} className={i + 1 === today ? s.calToday : undefined}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className={s.calEvents}>
        <p className={s.paneHead}>
          In {fmt.monthName({ y: view.y, m: view.m + 1 })}, over the years
        </p>
        {events.length ? (
          <ul>
            {events.map((e) => (
              <li key={`${e.y}${e.text}`}>
                <b>{e.y}</b> {e.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.calNone}>Nothing on record. Try another month.</p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the top panel */

export interface Launcher {
  label: string;
  icon: IconName;
  onClick: () => void;
}

interface TopProps {
  menus: BarMenu[];
  launchers: Launcher[];
  clock: { time: string; date: string };
  updates: number;
  onUpdates: () => void;
  devices: string;
  onDevices: () => void;
  user: MenuItem[];
}

export function TopPanel({
  menus,
  launchers,
  clock,
  updates,
  onUpdates,
  devices,
  onDevices,
  user,
}: TopProps) {
  const [cal, setCal] = useState<Date | null>(null);
  const clockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cal) return;
    const away = (e: PointerEvent) => {
      if (!clockRef.current?.contains(e.target as Node)) setCal(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [cal]);

  return (
    <header className={`${s.panel} ${s.panelTop}`} aria-label="Top panel">
      <Menubar menus={menus} className={s.panelMenus} label="Main menu" />
      <div className={s.launchers} role="toolbar" aria-label="Launchers">
        {launchers.map((l) => (
          <button
            key={l.label}
            type="button"
            className={s.panelBtn}
            aria-label={l.label}
            title={l.label}
            onClick={l.onClick}
          >
            <Icon name={l.icon} size={20} />
          </button>
        ))}
      </div>
      <span className={s.panelFill} />
      <div className={s.tray} role="group" aria-label="Notification area">
        <button
          type="button"
          className={s.panelBtn}
          aria-label={`${updates} updates available`}
          title={`${updates} updates available`}
          onClick={onUpdates}
        >
          <Icon name="update" size={18} />
        </button>
        <button
          type="button"
          className={s.panelBtn}
          aria-label={`Devices in production: ${devices}`}
          title={devices}
          onClick={onDevices}
        >
          <Icon name="signal" size={18} />
        </button>
      </div>
      <div
        ref={clockRef}
        className={s.clockSlot}
        onKeyDown={(e) => e.key === 'Escape' && cal && (e.stopPropagation(), setCal(null))}
      >
        <button
          type="button"
          className={`${s.panelBtn} ${s.clock} ${cal ? s.panelBtnOn : ''}`}
          aria-expanded={!!cal}
          aria-haspopup="dialog"
          title={clock.date}
          onClick={() => setCal(cal ? null : new Date())}
        >
          <span className={s.clockDate}>{clock.date} </span>
          <span>{clock.time || ' '}</span>
        </button>
        {cal && (
          <div className={s.popover} role="dialog" aria-label="Calendar">
            <Calendar start={cal} />
          </div>
        )}
      </div>
      <Menubar
        menus={[{ label: profile.name, icon: 'user', items: user }]}
        className={s.userMenu}
        label="User"
      />
    </header>
  );
}

/** The top panel as a still picture, for the faces of the turning cube. */
export function TopSkin({ clock, launchers }: { clock: string; launchers: Launcher[] }) {
  return (
    <div className={`${s.panel} ${s.panelTop} ${s.skin}`} aria-hidden="true">
      <span className={s.skinMenus}>
        <Icon name="cube" size={18} />
        <span>Applications</span>
        <span>Places</span>
        <span>System</span>
      </span>
      <span className={s.launchers}>
        {launchers.map((l) => (
          <span key={l.label} className={s.panelBtn}>
            <Icon name={l.icon} size={20} />
          </span>
        ))}
      </span>
      <span className={s.panelFill} />
      <span className={s.tray}>
        <span className={s.panelBtn}>
          <Icon name="update" size={18} />
        </span>
        <span className={s.panelBtn}>
          <Icon name="signal" size={18} />
        </span>
      </span>
      <span className={`${s.panelBtn} ${s.clock}`}>{clock}</span>
      <span className={`${s.panelBtn} ${s.skinUser}`}>
        <Icon name="user" size={18} />
        {profile.name}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- the pager */

interface PagerProps {
  state: WmState;
  desk: [number, number];
  current: number;
  onPick?: (ws: number) => void;
}

/** The workspace switcher: four mini desktops with their windows drawn in, as GNOME's pager did. */
export function Pager({ state, desk, current, onPick }: PagerProps) {
  return (
    <div
      className={s.pager}
      role={onPick ? 'group' : undefined}
      aria-label={onPick ? 'Workspace switcher' : undefined}
    >
      {WORKSPACES.map((w, i) => {
        const wins = onWorkspace(state, i)
          .filter((id) => !state.wins[id].min)
          .sort((a, b) => state.wins[a].z - state.wins[b].z);
        const minis = wins.map((id: AppId) => {
          const win = state.wins[id];
          const box = win.max
            ? { left: 0, top: 0, width: 100, height: 100 }
            : {
                left: (win.x / desk[0]) * 100,
                top: (win.y / desk[1]) * 100,
                width: (win.w / desk[0]) * 100,
                height: (Math.max(win.h, 120) / desk[1]) * 100,
              };
          return (
            <i
              key={id}
              className={state.focus === id && i === current ? s.miniOn : undefined}
              style={{
                left: `${box.left}%`,
                top: `${box.top}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
              }}
            >
              <Icon name={APPS[id].icon} size={10} />
            </i>
          );
        });
        const label = `Workspace ${i + 1}: ${w.name}, ${w.about}${i === current ? ' (current)' : ''}`;
        return onPick ? (
          <button
            key={w.name}
            type="button"
            className={`${s.mini} ${i === current ? s.miniCur : ''}`}
            aria-label={label}
            aria-pressed={i === current}
            title={`${w.name}: ${w.about}`}
            data-ws={i}
            onClick={() => onPick(i)}
          >
            {minis}
          </button>
        ) : (
          <span key={w.name} className={`${s.mini} ${i === current ? s.miniCur : ''}`}>
            {minis}
          </span>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- the bottom panel */

interface BottomProps {
  state: WmState;
  desk: [number, number];
  onTask: (id: AppId) => void;
  onShowDesktop: () => void;
  onPick: (ws: number) => void;
  onTrash: () => void;
}

export function BottomPanel({ state, desk, onTask, onShowDesktop, onPick, onTrash }: BottomProps) {
  const here = onWorkspace(state, state.ws);
  return (
    <footer className={`${s.panel} ${s.panelBottom}`} aria-label="Bottom panel">
      <div className={s.bottomRow}>
        <button
          type="button"
          className={s.panelBtn}
          aria-label="Show desktop"
          title="Show desktop"
          onClick={onShowDesktop}
        >
          <Icon name="desktop" size={18} />
        </button>
        <nav className={s.tasks} aria-label={`Windows on ${WORKSPACES[state.ws].name}`}>
          {here.map((id) => {
            const on = state.focus === id && !state.wins[id].min;
            return (
              <button
                key={id}
                type="button"
                data-task={id}
                aria-pressed={on}
                className={`${s.task} ${on ? s.taskOn : ''} ${state.wins[id].min ? s.taskMin : ''}`}
                onClick={() => onTask(id)}
              >
                <Icon name={APPS[id].icon} size={16} />
                <span>{APPS[id].name}</span>
              </button>
            );
          })}
        </nav>
        <Pager state={state} desk={desk} current={state.ws} onPick={onPick} />
        <button
          type="button"
          className={s.panelBtn}
          aria-label="Trash"
          title="Trash"
          onClick={onTrash}
        >
          <Icon name="trashFull" size={18} />
        </button>
      </div>
    </footer>
  );
}

/** The bottom panel as a still picture of one workspace, for the cube's faces. */
export function BottomSkin({
  state,
  desk,
  ws,
}: {
  state: WmState;
  desk: [number, number];
  ws: number;
}) {
  return (
    <div className={`${s.panel} ${s.panelBottom} ${s.skin}`} aria-hidden="true">
      <div className={s.bottomRow}>
        <span className={s.panelBtn}>
          <Icon name="desktop" size={18} />
        </span>
        <span className={s.tasks}>
          {onWorkspace(state, ws).map((id) => (
            <span
              key={id}
              className={`${s.task} ${state.focus === id && ws === state.ws ? s.taskOn : ''}`}
            >
              <Icon name={APPS[id].icon} size={16} />
              <span>{APPS[id].name}</span>
            </span>
          ))}
        </span>
        <Pager state={state} desk={desk} current={ws} />
        <span className={s.panelBtn}>
          <Icon name="trashFull" size={18} />
        </span>
      </div>
    </div>
  );
}
