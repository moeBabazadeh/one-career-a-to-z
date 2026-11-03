'use client';

// Settings: the profile, About (the phone's spec sheet, which is Moe's), the radios, appearance
// (which really switches the site between light and dark), wallpaper, notifications, accessibility,
// and the gestures and keys the phone understands.
import Image from 'next/image';
import { useSyncExternalStore } from 'react';
import { db, fmt, hardware, profile } from '../../_shared/data';
import { readChoice, subscribeScheme, writeScheme, type Scheme } from '../../_shared/scheme';
import { APPS, NOTICES, WALLPAPERS, current, neuroship } from '../content';
import { Icon } from '../icons';
import { Group, Row, Screen, Segmented, ToggleRow, cx, type AppCtx } from '../ui';
import { AppIcon } from '../AppIcon';
import s from '../apps.module.scss';

const TINT = {
  gray: '#8e8e93',
  blue: '#2f7cf6',
  orange: '#f7962f',
  green: '#34c25a',
  red: '#f4473d',
  purple: '#8f5cf0',
  indigo: '#5b5ce2',
  teal: '#2fb8c9',
};

export const GESTURES: [string, string][] = [
  ['Swipe up from the bottom', 'Go home'],
  ['Swipe up and pause', 'Open apps'],
  ['Swipe along the bottom edge', 'Switch to the previous app'],
  ['Pull down from the top left', 'Notifications'],
  ['Pull down from the top right', 'Control centre'],
  ['Pull down on the home screen', 'Search'],
  ['Swipe left or right on the home screen', 'Change page'],
  ['Touch and hold an icon', 'Quick actions'],
  ['Swipe a card up in open apps', 'Close the app'],
];

export const KEYS: [string, string][] = [
  ['Esc or H', 'Home'],
  ['S', 'Open apps'],
  ['[ and ]', 'Previous and next app'],
  ['N', 'Notifications'],
  ['C', 'Control centre'],
  ['/ or Ctrl K', 'Search'],
  ['← →', 'Change page on the home screen'],
  ['Backspace', 'Back, inside an app'],
  ['L', 'Lock, or wake'],
  ['Space or Enter', 'Unlock'],
];

const noChoice = () => null;

export function Settings({ ctx }: { ctx: AppCtx }) {
  const { os, dispatch } = ctx;
  const t = os.toggles;
  const p = ctx.path;

  if (p === 'about') return <About ctx={ctx} />;
  if (p === 'bluetooth') return <Bluetooth ctx={ctx} />;
  if (p === 'display') return <Display ctx={ctx} />;
  if (p === 'wallpaper') return <Wallpaper ctx={ctx} />;
  if (p === 'notifications') return <Notifications ctx={ctx} />;
  if (p === 'accessibility') return <Accessibility ctx={ctx} />;
  if (p === 'gestures') return <Gestures ctx={ctx} />;
  if (p === 'general') return <General ctx={ctx} />;
  if (p === 'wifi') return <Wifi ctx={ctx} />;

  return (
    <Screen ctx={ctx} title="Settings" className={s.settings}>
      <Group>
        <Row
          onClick={() => ctx.open('contacts')}
          chevron
          lead={
            <Image className={s.profilePic} src={db.person.photo} alt="" width={120} height={120} />
          }
          label={<span className={s.profileName}>{profile.name}</span>}
          sub="Contact, links and CV"
          className={s.profileRow}
        />
      </Group>
      <Group>
        <ToggleRow
          icon="airplane"
          tint={TINT.orange}
          label="Airplane Mode"
          on={t.airplane}
          onChange={(on) => dispatch({ type: 'toggle', key: 'airplane', on })}
        />
        <Row
          icon="wifi"
          tint={TINT.blue}
          label="Wi-Fi"
          value={t.wifi ? db.person.site : 'Off'}
          onClick={() => ctx.push('wifi')}
          chevron
        />
        <Row
          icon="bluetooth"
          tint={TINT.blue}
          label="Bluetooth"
          value={t.bluetooth ? 'On' : 'Off'}
          onClick={() => ctx.push('bluetooth')}
          chevron
        />
        <ToggleRow
          icon="cellular"
          tint={TINT.green}
          label="Mobile Data"
          on={t.cellular}
          onChange={(on) => dispatch({ type: 'toggle', key: 'cellular', on })}
        />
      </Group>
      <Group>
        <Row
          icon="bell"
          tint={TINT.red}
          label="Notifications"
          onClick={() => ctx.push('notifications')}
          chevron
        />
        <ToggleRow
          icon="moon"
          tint={TINT.indigo}
          label="Do Not Disturb"
          on={t.focus}
          onChange={(on) => dispatch({ type: 'toggle', key: 'focus', on })}
        />
      </Group>
      <Group>
        <Row
          icon="info"
          tint={TINT.gray}
          label="General"
          onClick={() => ctx.push('general')}
          chevron
        />
        <Row
          icon="sun"
          tint={TINT.blue}
          label="Display & Brightness"
          onClick={() => ctx.push('display')}
          chevron
        />
        <Row
          icon="image"
          tint={TINT.teal}
          label="Wallpaper"
          value={WALLPAPERS[os.wallpaper].name}
          onClick={() => ctx.push('wallpaper')}
          chevron
        />
        <Row
          icon="motion"
          tint={TINT.blue}
          label="Accessibility"
          onClick={() => ctx.push('accessibility')}
          chevron
        />
      </Group>
      <Group footer="Everything on this phone, as one plain page.">
        <Row icon="page" tint={TINT.purple} label="Read as a Page" onClick={ctx.read} chevron />
      </Group>
    </Screen>
  );
}

function General({ ctx }: { ctx: AppCtx }) {
  return (
    <Screen ctx={ctx} title="General" back="Settings" className={s.settings}>
      <Group>
        <Row label="About" onClick={() => ctx.push('about')} chevron />
        <Row label="Gestures & Keys" onClick={() => ctx.push('gestures')} chevron />
      </Group>
      <Group>
        <Row label="Lock Now" onClick={() => ctx.dispatch({ type: 'lock' })} />
      </Group>
    </Screen>
  );
}

function About({ ctx }: { ctx: AppCtx }) {
  const rows: [string, React.ReactNode][] = [
    ['Name', profile.name],
    ['Role', current.title],
    ['Company', current.company],
    ['In this role since', fmt.month(current.since)],
    ['Before that', `${current.previous.title}, from ${fmt.month(current.previous.from)}`],
    ['Also', `${neuroship.steps[0].title} (contract), ${neuroship.org}`],
    ['Building since', String(db.person.since)],
  ];
  return (
    <Screen ctx={ctx} title="About" back="General" className={s.settings}>
      <Group>
        {rows.map(([k, v]) => (
          <Row key={k} label={k} value={v} />
        ))}
      </Group>
      <Group
        header="Figures"
        footer={`Counts that grow are lower bounds, checked ${fmt.month(db.asOf)}.`}
      >
        {db.headline.map((h) => (
          <Row
            key={h.label}
            label={h.label.replace(/^./, (c) => c.toUpperCase())}
            value={h.value}
          />
        ))}
      </Group>
      <Group header="Devices">
        {hardware.map((d) => (
          <Row
            key={d.tag}
            label={d.name}
            sub={d.kind}
            value={d.tag}
            onClick={() => ctx.open('hardware', [`device/${d.tag}`])}
            chevron
          />
        ))}
      </Group>
      <Group header="Legal">
        <Row label="Site" value={db.person.site} href={db.person.url} />
      </Group>
    </Screen>
  );
}

function Wifi({ ctx }: { ctx: AppCtx }) {
  const on = ctx.os.toggles.wifi;
  return (
    <Screen ctx={ctx} title="Wi-Fi" back="Settings" className={s.settings}>
      <Group>
        <ToggleRow
          label="Wi-Fi"
          on={on}
          onChange={(v) => ctx.dispatch({ type: 'toggle', key: 'wifi', on: v })}
        />
        {on && (
          <Row
            lead={<Icon name="check" size={16} className={s.checkLead} />}
            label={db.person.site}
            end={<Icon name="wifi" size={18} className={s.rowExt} />}
          />
        )}
      </Group>
    </Screen>
  );
}

function Bluetooth({ ctx }: { ctx: AppCtx }) {
  const on = ctx.os.toggles.bluetooth;
  return (
    <Screen ctx={ctx} title="Bluetooth" back="Settings" className={s.settings}>
      <Group footer="The hardware Moe built that is in production. Open one for its figures.">
        <ToggleRow
          label="Bluetooth"
          on={on}
          onChange={(v) => ctx.dispatch({ type: 'toggle', key: 'bluetooth', on: v })}
        />
      </Group>
      {on && (
        <Group header="My devices">
          {hardware.map((d) => (
            <Row
              key={d.tag}
              label={d.name}
              sub={d.kind}
              value="In production"
              onClick={() => ctx.open('hardware', [`device/${d.tag}`])}
              chevron
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}

function Display({ ctx }: { ctx: AppCtx }) {
  const choice = useSyncExternalStore(subscribeScheme, readChoice, noChoice);
  const value: Scheme | 'auto' = choice ?? 'auto';
  return (
    <Screen ctx={ctx} title="Display & Brightness" back="Settings" className={s.settings}>
      <Group header="Appearance" footer="Switches the whole site. Automatic follows your system.">
        <li className={s.padRow}>
          <Segmented
            label="Appearance"
            value={value}
            onChange={(v) => writeScheme(v === 'auto' ? null : v)}
            options={[
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
              { id: 'auto', label: 'Automatic' },
            ]}
          />
        </li>
      </Group>
      <Group header="Brightness">
        <li className={s.padRow}>
          <Slider
            label="Brightness"
            min={0.35}
            max={1}
            step={0.01}
            value={ctx.os.brightness}
            onChange={(v) => ctx.dispatch({ type: 'set', key: 'brightness', value: v })}
            icon="sun"
          />
        </li>
      </Group>
      <Group header="Text size">
        <li className={s.padRow}>
          <Slider
            label="Text size"
            min={0.85}
            max={1.3}
            step={0.05}
            value={ctx.os.text}
            onChange={(v) => ctx.dispatch({ type: 'set', key: 'text', value: v })}
            icon="text"
          />
        </li>
      </Group>
    </Screen>
  );
}

export function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  icon,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  icon: 'sun' | 'text';
}) {
  return (
    <label
      className={s.slider}
      style={{ '--v': (value - min) / (max - min) } as React.CSSProperties}
    >
      <Icon name={icon} size={15} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <Icon name={icon} size={22} />
    </label>
  );
}

function Wallpaper({ ctx }: { ctx: AppCtx }) {
  return (
    <Screen ctx={ctx} title="Wallpaper" back="Settings" className={s.settings}>
      <p className={s.padText}>The system colours follow the wallpaper.</p>
      <ul className={s.walls}>
        {WALLPAPERS.map((w, i) => (
          <li key={w.name}>
            <button
              type="button"
              aria-pressed={ctx.os.wallpaper === i}
              onClick={() => ctx.dispatch({ type: 'set', key: 'wallpaper', value: i })}
              style={{ '--h': w.hue } as React.CSSProperties}
            >
              <span className={s.wallThumb} />
              <span>{w.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

function Notifications({ ctx }: { ctx: AppCtx }) {
  const apps = [...new Set(NOTICES.map((n) => n.app))];
  return (
    <Screen ctx={ctx} title="Notifications" back="Settings" className={s.settings}>
      <Group
        header="Notification style"
        footer="Turn an app off and its notifications leave the lock screen and notification centre."
      >
        {apps.map((id) => (
          <li key={id} className={s.row}>
            <div className={s.rowHit} data-static>
              <span className={s.rowApp}>
                <AppIcon app={APPS[id]} clock={ctx.clock} size={30} />
              </span>
              <span className={s.rowText}>
                <span className={s.rowLabel}>{APPS[id].name}</span>
                <span className={s.rowSub}>
                  {ctx.os.muted.includes(id) ? 'Off' : 'Banners, lock screen'}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!ctx.os.muted.includes(id)}
                aria-label={`Allow notifications from ${APPS[id].name}`}
                className={s.switch}
                onClick={() =>
                  ctx.dispatch({ type: 'mute', app: id, on: !ctx.os.muted.includes(id) })
                }
              >
                <span />
              </button>
            </div>
          </li>
        ))}
      </Group>
      {ctx.os.cleared.length > 0 && (
        <Group>
          <Row
            label="Restore cleared notifications"
            onClick={() => ctx.dispatch({ type: 'restore' })}
          />
        </Group>
      )}
    </Screen>
  );
}

function Accessibility({ ctx }: { ctx: AppCtx }) {
  return (
    <Screen ctx={ctx} title="Accessibility" back="Settings" className={s.settings}>
      <Group footer="Swaps the springs for instant changes. Your system's reduce motion setting always applies too.">
        <ToggleRow
          icon="motion"
          tint={TINT.blue}
          label="Reduce Motion"
          on={ctx.os.toggles.motion}
          onChange={(on) => ctx.dispatch({ type: 'toggle', key: 'motion', on })}
        />
      </Group>
      <Group header="Larger text">
        <li className={s.padRow}>
          <Slider
            label="Text size"
            min={0.85}
            max={1.3}
            step={0.05}
            value={ctx.os.text}
            onChange={(v) => ctx.dispatch({ type: 'set', key: 'text', value: v })}
            icon="text"
          />
        </li>
      </Group>
      <Group>
        <Row label="Gestures & Keys" onClick={() => ctx.push('gestures')} chevron />
      </Group>
    </Screen>
  );
}

function Gestures({ ctx }: { ctx: AppCtx }) {
  return (
    <Screen ctx={ctx} title="Gestures & Keys" back="Back" className={cx(s.settings, s.gestures)}>
      <Group header="Gestures" footer="A mouse works too: drag where a finger would.">
        {GESTURES.map(([g, what]) => (
          <Row key={g} label={g} value={what} />
        ))}
      </Group>
      <Group header="Keyboard">
        {KEYS.map(([k, what]) => (
          <Row key={k} label={<kbd className={s.kbd}>{k}</kbd>} value={what} />
        ))}
      </Group>
    </Screen>
  );
}
