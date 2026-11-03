'use client';

// The control centre: radios, appearance (the site's real light and dark switch), Do Not Disturb,
// brightness and text size sliders, torch, reduce motion and lock.
import { useSyncExternalStore } from 'react';
import { readScheme, subscribeScheme, writeScheme } from '../_shared/scheme';
import { Icon, type UiIcon } from './icons';
import type { Action, OS, Toggles } from './os';
import s from './phone.module.scss';

const light = () => 'light' as const;

interface Props {
  os: OS;
  dispatch: React.Dispatch<Action>;
  lock: () => void;
  read: () => void;
}

export function Control({ os, dispatch, lock, read }: Props) {
  const scheme = useSyncExternalStore(subscribeScheme, readScheme, light);
  const t = os.toggles;
  const flip = (key: keyof Toggles) => dispatch({ type: 'toggle', key });

  const round = (key: keyof Toggles, icon: UiIcon, label: string) => (
    <button
      type="button"
      className={s.ccRound}
      aria-pressed={t[key]}
      aria-label={label}
      data-key={key}
      onClick={() => flip(key)}
    >
      <Icon name={icon} size={22} />
    </button>
  );

  return (
    <div className={s.cc}>
      <div className={s.ccGrid}>
        <div className={s.ccRadios} role="group" aria-label="Connectivity">
          {round('airplane', 'airplane', 'Airplane mode')}
          {round('cellular', 'cellular', 'Mobile data')}
          {round('wifi', 'wifi', 'Wi-Fi')}
          {round('bluetooth', 'bluetooth', 'Bluetooth')}
        </div>
        <div className={s.ccStack}>
          <button
            type="button"
            className={s.ccWide}
            aria-pressed={scheme === 'dark'}
            onClick={() => writeScheme(scheme === 'dark' ? 'light' : 'dark')}
          >
            <span className={s.ccGlyph}>
              <Icon name={scheme === 'dark' ? 'moon' : 'sun'} size={20} />
            </span>
            <span>
              <b>Appearance</b>
              <small>{scheme === 'dark' ? 'Dark' : 'Light'}</small>
            </span>
          </button>
          <button
            type="button"
            className={s.ccWide}
            aria-pressed={t.focus}
            onClick={() => flip('focus')}
          >
            <span className={s.ccGlyph}>
              <Icon name="moon" size={20} />
            </span>
            <span>
              <b>Do Not Disturb</b>
              <small>{t.focus ? 'On' : 'Off'}</small>
            </span>
          </button>
        </div>

        <label
          className={s.ccSlider}
          style={{ '--v': (os.brightness - 0.35) / 0.65 } as React.CSSProperties}
        >
          <input
            type="range"
            min={0.35}
            max={1}
            step={0.01}
            value={os.brightness}
            aria-label="Brightness"
            onChange={(e) =>
              dispatch({ type: 'set', key: 'brightness', value: Number(e.target.value) })
            }
          />
          <Icon name="sun" size={22} />
        </label>
        <label
          className={s.ccSlider}
          style={{ '--v': (os.text - 0.85) / 0.45 } as React.CSSProperties}
        >
          <input
            type="range"
            min={0.85}
            max={1.3}
            step={0.05}
            value={os.text}
            aria-label="Text size"
            onChange={(e) => dispatch({ type: 'set', key: 'text', value: Number(e.target.value) })}
          />
          <Icon name="text" size={22} />
        </label>

        <button
          type="button"
          className={s.ccTile}
          aria-pressed={t.torch}
          aria-label="Torch"
          onClick={() => flip('torch')}
        >
          <Icon name="torch" size={22} />
        </button>
        <button
          type="button"
          className={s.ccTile}
          aria-pressed={t.motion}
          aria-label="Reduce motion"
          onClick={() => flip('motion')}
        >
          <Icon name="motion" size={22} />
        </button>
        <button type="button" className={s.ccTile} aria-label="Lock" onClick={lock}>
          <Icon name="lock" size={22} />
        </button>
        <button type="button" className={s.ccTile} aria-label="Read as a page" onClick={read}>
          <Icon name="page" size={22} />
        </button>
      </div>
    </div>
  );
}
