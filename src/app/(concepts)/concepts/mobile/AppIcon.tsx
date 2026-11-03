// An app's icon: a squircle tile with its glyph. Calendar shows today's date, like the real thing.
// In dark mode the tiles go dark and the glyphs take the colour.
import type { AppDef } from './content';
import { Glyph } from './icons';
import type { Clock } from './ui';
import s from './phone.module.scss';

export function AppIcon({ app, clock, size }: { app: AppDef; clock: Clock | null; size?: number }) {
  return (
    <span
      className={`${s.icon} ${s[`ic_${app.icon}`] ?? ''}`}
      style={size ? ({ '--icon': `${size}px` } as React.CSSProperties) : undefined}
      aria-hidden="true"
      data-tile
    >
      {app.icon === 'calendar' ? (
        <span className={s.calFace}>
          <b>{clock?.weekday.slice(0, 3) ?? ''}</b>
          <strong>{clock?.day ?? ''}</strong>
        </span>
      ) : (
        <Glyph name={app.icon} />
      )}
    </span>
  );
}
