'use client';

// The home screen: pages of apps and widgets that swipe sideways, page dots, the dock, and badges
// for unread notifications. Gestures are wired up by Phone; this lays it out.
import { db, fmt, hardware, type Device } from '../_shared/data';
import { AppIcon } from './AppIcon';
import { APPS, DOCK, NOTICES, PAGES, current, neuroship, type Widget } from './content';
import { Icon } from './icons';
import type { OS } from './os';
import type { Clock } from './ui';
import s from './phone.module.scss';

interface HomeProps {
  os: OS;
  clock: Clock | null;
  pagesRef: React.Ref<HTMLDivElement>;
  rootRef: React.Ref<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
  open: (app: string, from?: Element | null, stack?: string[]) => void;
  menu: (icon: Element) => void;
  page: (n: number) => void;
  search: () => void;
}

const logger = hardware.find((d) => d.tag === db.devices.logger.tag) as Device;

export function Home({
  os,
  clock,
  pagesRef,
  rootRef,
  onPointerDown,
  onClickCapture,
  open,
  menu,
  page,
  search,
}: HomeProps) {
  const badge = (id: string) =>
    os.muted.includes(id)
      ? 0
      : NOTICES.filter((n) => n.app === id && !os.cleared.includes(n.id)).length;

  const icon = (id: string, dock = false) => {
    const app = APPS[id];
    if (!app) return null;
    const n = badge(id);
    return (
      <li key={id}>
        <button
          type="button"
          className={s.app}
          data-icon={id}
          aria-label={`${app.name}${n ? `, ${n} notification${n > 1 ? 's' : ''}` : ''}`}
          onClick={(e) => open(id, e.currentTarget.querySelector(`.${s.icon}`))}
          onContextMenu={(e) => {
            e.preventDefault();
            menu(e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.preventDefault();
              menu(e.currentTarget);
            }
          }}
        >
          <AppIcon app={app} clock={clock} />
          {n > 0 && (
            <span className={s.badge} aria-hidden="true">
              {n}
            </span>
          )}
          {!dock && <span className={s.appName}>{app.name}</span>}
        </button>
      </li>
    );
  };

  const widget = (w: Widget) => {
    switch (w) {
      case 'now':
        return (
          <li key={w} className={s.wideWidget}>
            <button
              type="button"
              className={`${s.widget} ${s.wNow}`}
              onClick={() => open('calendar', null, [`event/${current.role.id}`])}
            >
              <span className={s.wKicker}>
                <i aria-hidden="true" /> Now
              </span>
              <strong className={s.wTitle}>
                {current.title}, {current.company}
              </strong>
              <span className={s.wSub}>since {fmt.month(current.since)}</span>
              <span className={s.wBody}>
                {db.current.pitch.replace(/^./, (c) => c.toUpperCase())}.
              </span>
              <span className={s.wFoot}>
                <span>
                  Also {neuroship.steps[0].title} (contract), {neuroship.org}
                </span>
              </span>
            </button>
            <span className={s.widgetName}>Calendar</span>
          </li>
        );
      case 'glance':
        return (
          <li key={w} className={s.wideWidget}>
            <button
              type="button"
              className={`${s.widget} ${s.wGlance}`}
              onClick={() => open('settings', null, ['general', 'about'])}
              aria-label={`At a glance: ${db.headline.map((h) => `${h.value} ${h.label}`).join(', ')}`}
            >
              {db.headline.map((h) => (
                <span key={h.label} className={s.stat}>
                  <strong>{h.value}</strong>
                  <span>{h.label}</span>
                </span>
              ))}
            </button>
            <span className={s.widgetName}>At a glance</span>
          </li>
        );
      case 'today':
        return (
          <li key={w} className={s.smallWidget}>
            <button
              type="button"
              className={`${s.widget} ${s.wToday}`}
              onClick={() => open('calendar')}
            >
              <span className={s.wDay}>{clock?.weekday ?? ''}</span>
              <strong className={s.wDate}>{clock?.day ?? ''}</strong>
              <span className={s.wEvent}>
                <i aria-hidden="true" />
                <span>
                  <b>{current.company}</b>
                  {current.title}
                </span>
              </span>
            </button>
            <span className={s.widgetName}>Calendar</span>
          </li>
        );
      case 'devices':
        return (
          <li key={w} className={s.smallWidget}>
            <button
              type="button"
              className={`${s.widget} ${s.wDevices}`}
              onClick={() => open('hardware', null, [`device/${logger.tag}`])}
            >
              <span className={s.wKicker}>
                <Icon name="chip" size={14} /> {logger.name}
              </span>
              {logger.figures.map((f) => {
                const [n, ...rest] = f.split(' ');
                return (
                  <span key={f} className={s.wFig}>
                    <strong>{n}</strong> {rest.join(' ')}
                  </span>
                );
              })}
            </button>
            <span className={s.widgetName}>Hardware</span>
          </li>
        );
    }
  };

  return (
    <div
      ref={rootRef}
      className={s.home}
      data-away={os.mode !== 'home' || os.locked || undefined}
      inert={os.mode !== 'home' || os.locked || !!os.overlay || !!os.menu}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <h2 className={s.srOnly}>Home screen</h2>
      <div className={s.pagesView}>
        <div ref={pagesRef} className={s.pages}>
          {PAGES.map((pg, i) => (
            <section
              key={i}
              className={s.page}
              data-page={i}
              style={{ '--i': i } as React.CSSProperties}
              inert={i !== os.page}
              aria-label={`Page ${i + 1} of ${PAGES.length}`}
            >
              <ul className={s.grid}>
                {pg.widgets.map(widget)}
                {pg.apps.map((id) => icon(id))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <div className={s.homeFoot}>
        <button
          type="button"
          className={s.searchPill}
          onClick={search}
          aria-label="Search (pull down on the home screen, or press /)"
        >
          <Icon name="search" size={13} />
          <span>Search</span>
        </button>
        <div className={s.dots} role="group" aria-label="Pages">
          {PAGES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Page ${i + 1}`}
              aria-pressed={i === os.page}
              onClick={() => page(i)}
            />
          ))}
        </div>
      </div>
      <ul className={s.dock} data-dock aria-label="Dock">
        {DOCK.map((id) => icon(id, true))}
      </ul>
    </div>
  );
}
