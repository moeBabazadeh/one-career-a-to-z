'use client';

import {
  memo,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Icon } from './icons';
import { SPEC, dynamicScale, type Placement, type WinId } from './space';
import s from './spatial.module.scss';

export type Grip = 'move' | 'left' | 'right';

/** What a window can ask of the space it stands in. */
export interface Manager {
  grab: (id: WinId, grip: Grip, e: ReactPointerEvent<HTMLElement>) => void;
  nudge: (id: WinId, grip: Grip, e: KeyboardEvent<HTMLElement>) => void;
  close: (id: WinId) => void;
}

export interface Chrome {
  id: WinId;
  place: Placement;
  wm: Manager;
  /** Hidden while Home or an immersive space is up. */
  away: boolean;
  /** Its turn in the opening stagger. */
  order: number;
  /** On a phone every window is a card in the carousel, open or not. */
  phone?: boolean;
}

/**
 * One window: a pane of glass on a sphere around you, facing you. The glass, its ornaments, the
 * window bar under it and the two resize corners are each their own plane in 3D, placed from
 * the same position with their own offset, so the ornaments float a little in front of the
 * glass the way attached toolbars do. (Each part is transformed on its own rather than sharing
 * one 3D context: that keeps the glass blurring the room behind it, and keeps windows from being
 * sliced along each other's planes.)
 */
function WindowFrame({
  id,
  place,
  wm,
  away,
  order,
  phone,
  children,
  ornament,
  tabs,
  label,
}: Chrome & { children: ReactNode; ornament?: ReactNode; tabs?: ReactNode; label?: string }) {
  const title = SPEC[id].title;
  const style = {
    '--sp-az': `${place.az}deg`,
    '--sp-el': `${place.el}deg`,
    '--sp-r': place.r,
    '--sp-s': dynamicScale(place.r),
    '--w': `${place.w}px`,
    '--h': `${place.h}px`,
    '--order': order,
  } as CSSProperties;

  return (
    <section
      className={s.win}
      id={`win-${id}`}
      data-win={id}
      data-open={place.open && !away ? '' : undefined}
      data-ornament={ornament ? '' : undefined}
      style={style}
      aria-labelledby={`${id}-title`}
      inert={phone ? away : !place.open || away}
    >
      <div className={`${s.part} ${s.panel}`} data-part="panel">
        <i className={s.rim} data-rim={id} aria-hidden="true" />
        <div className={s.scroll} tabIndex={-1} data-scroll>
          {children}
        </div>
      </div>
      {tabs && (
        <nav className={`${s.part} ${s.tabs}`} data-part="" aria-label={`${title} sections`}>
          {tabs}
        </nav>
      )}
      {ornament && (
        <div
          className={`${s.part} ${s.ornament}`}
          data-part=""
          role="toolbar"
          aria-label={label ?? `${title} toolbar`}
        >
          {ornament}
        </div>
      )}
      <div className={`${s.part} ${s.bar}`} data-part="">
        <button
          type="button"
          className={`${s.close} ${s.gz}`}
          aria-label={`Close ${title}`}
          onClick={() => wm.close(id)}
        >
          <Icon name="close" size={14} />
        </button>
        <button
          type="button"
          className={s.grab}
          aria-label={`Move ${title}. Drag, or use the arrow keys; scroll while dragging, or Page Up and Page Down, to push it away or pull it closer.`}
          onPointerDown={(e) => wm.grab(id, 'move', e)}
          onKeyDown={(e) => wm.nudge(id, 'move', e)}
        >
          <i />
        </button>
      </div>
      <button
        type="button"
        className={`${s.part} ${s.corner} ${s.cornerL}`}
        data-part=""
        aria-label={`Resize ${title} from the left corner`}
        onPointerDown={(e) => wm.grab(id, 'left', e)}
        onKeyDown={(e) => wm.nudge(id, 'left', e)}
      >
        <i />
      </button>
      <button
        type="button"
        className={`${s.part} ${s.corner} ${s.cornerR}`}
        data-part=""
        aria-label={`Resize ${title} from the right corner`}
        onPointerDown={(e) => wm.grab(id, 'right', e)}
        onKeyDown={(e) => wm.nudge(id, 'right', e)}
      >
        <i />
      </button>
    </section>
  );
}

export default memo(WindowFrame);

/** The big navigation title every window opens with. */
export function Title({ id, children, sub }: { id: WinId; children: ReactNode; sub?: ReactNode }) {
  return (
    <header className={s.navTitle}>
      <h2 id={`${id}-title`}>{children}</h2>
      {sub && <p>{sub}</p>}
    </header>
  );
}

/** A segmented control, for an ornament or the top of a window. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string; icon?: Parameters<typeof Icon>[0]['name'] }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`${s.segBtn} ${s.gz}`}
          onClick={() => onChange(o.id)}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A tab bar ornament on the leading edge: icons that show their names when you look at them. */
export function TabBar<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string; icon: Parameters<typeof Icon>[0]['name'] }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={s.tabList} role="tablist" aria-label={label} aria-orientation="vertical">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`${s.tab} ${s.gz}`}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.id === value);
            const step =
              e.key === 'ArrowDown' || e.key === 'ArrowRight'
                ? 1
                : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
                  ? -1
                  : 0;
            if (!step) return;
            e.preventDefault();
            const next = options[(i + step + options.length) % options.length];
            onChange(next.id);
            (
              e.currentTarget.parentElement?.querySelector(
                `[data-tab="${next.id}"]`,
              ) as HTMLElement | null
            )?.focus();
          }}
          data-tab={o.id}
          tabIndex={value === o.id ? 0 : -1}
        >
          <Icon name={o.icon} size={20} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
