import Image from 'next/image';
import { useState } from 'react';
import { db, profile } from '../_shared/data';
import { concept } from '../_shared/concepts';
import { HOST, KERNEL } from './fs';
import { Icon, type IconName } from './icons';
import { COMMANDS } from './shell';
import s from './desktop.module.scss';

/** The Compiz effects, switched live from CompizConfig. */
export interface Fx {
  cube: boolean;
  reflection: boolean;
  wobbly: boolean;
  lamp: boolean;
  expo: boolean;
  zoom: number;
  speed: number;
}

type Flag = 'cube' | 'reflection' | 'wobbly' | 'lamp' | 'expo';

const PLUGINS: {
  cat: string;
  items: { key: Flag | null; name: string; icon: IconName; about: string; page?: boolean }[];
}[] = [
  {
    cat: 'Desktop',
    items: [
      {
        key: 'cube',
        name: 'Desktop Cube',
        icon: 'cube',
        about: 'Place the four workspaces on a cube and rotate it to switch.',
        page: true,
      },
      {
        key: 'reflection',
        name: 'Cube Reflection',
        icon: 'reflect',
        about: 'Draw a reflection of the cube below it while it turns.',
      },
      {
        key: 'expo',
        name: 'Expo',
        icon: 'expo',
        about: 'Show every workspace at once, as a wall (Ctrl+Alt+↑).',
      },
    ],
  },
  {
    cat: 'Effects',
    items: [
      {
        key: 'wobbly',
        name: 'Wobbly Windows',
        icon: 'wobbly',
        about: 'Windows wobble on springs while you drag them.',
      },
      {
        key: 'lamp',
        name: 'Magic Lamp',
        icon: 'lamp',
        about: 'Minimised windows pour into the window list.',
      },
    ],
  },
  {
    cat: 'Window Management',
    items: [
      {
        key: null,
        name: 'Move Window',
        icon: 'desktop',
        about: 'Drag a window by its title bar, or Alt+Space, Move.',
      },
      {
        key: null,
        name: 'Resize Window',
        icon: 'desktop',
        about: 'Drag a window by its edges, or Alt+Space, Resize.',
      },
    ],
  },
];

export function Ccsm({
  fx,
  setFx,
  reduced,
}: {
  fx: Fx;
  setFx: (patch: Partial<Fx>) => void;
  reduced: boolean;
}) {
  const [cat, setCat] = useState('All');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(false);
  const q = filter.trim().toLowerCase();
  const groups = PLUGINS.filter((g) => cat === 'All' || g.cat === cat)
    .map((g) => ({
      ...g,
      items: g.items.filter((p) => !q || `${p.name} ${p.about}`.toLowerCase().includes(q)),
    }))
    .filter((g) => g.items.length);

  return (
    <div className={s.app}>
      <div className={s.ccsm}>
        <aside className={s.ccsmSide}>
          <label className={s.ccsmFilter}>
            <span>Filter</span>
            <input className={s.entry} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <p className={s.paneHead}>Category</p>
          <ul>
            {['All', ...PLUGINS.map((g) => g.cat)].map((c) => (
              <li key={c}>
                <button
                  type="button"
                  className={cat === c && !page ? s.placeOn : undefined}
                  onClick={() => {
                    setCat(c);
                    setPage(false);
                  }}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={s.btn}
            onClick={() =>
              setFx({ cube: true, reflection: true, wobbly: true, lamp: true, expo: true })
            }
          >
            Turn everything on
          </button>
        </aside>
        <div className={s.ccsmMain}>
          {reduced && (
            <p className={s.infoBar} role="note">
              <Icon name="info" size={16} />
              Your system asks for reduced motion, so the cube, wobbly windows and the lamp start
              switched off. Switch them on here if you like.
            </p>
          )}
          {page ? (
            <div className={s.ccsmPage}>
              <button type="button" className={s.btn} onClick={() => setPage(false)}>
                <Icon name="back" size={16} /> Back
              </button>
              <h3>
                <Icon name="cube" size={32} /> Rotate Cube
              </h3>
              <label className={s.slider}>
                <span>Zoom out while turning</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={fx.zoom}
                  onChange={(e) => setFx({ zoom: Number(e.target.value) })}
                />
                <output>{fx.zoom.toFixed(2)}</output>
              </label>
              <label className={s.slider}>
                <span>Speed</span>
                <input
                  type="range"
                  min={0.4}
                  max={2.5}
                  step={0.1}
                  value={fx.speed}
                  onChange={(e) => setFx({ speed: Number(e.target.value) })}
                />
                <output>{fx.speed.toFixed(1)}×</output>
              </label>
              <p className={s.hint}>
                Ctrl+Alt+← and → turn it; Ctrl+Alt+Shift with an arrow takes the focused window
                along. Drag the wallpaper (or Ctrl+Alt+drag anywhere) to spin it freely.
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.cat} className={s.ccsmGroup} aria-label={g.cat}>
                <h3>{g.cat}</h3>
                <ul>
                  {g.items.map((p) => (
                    <li key={p.name} className={s.plugin}>
                      <input
                        type="checkbox"
                        id={`fx-${p.name}`}
                        checked={p.key ? fx[p.key] : true}
                        disabled={!p.key || (p.key === 'reflection' && !fx.cube)}
                        onChange={(e) => p.key && setFx({ [p.key]: e.target.checked })}
                      />
                      <Icon name={p.icon} size={32} />
                      <label htmlFor={`fx-${p.name}`}>
                        <b>{p.name}</b>
                        <span>{p.about}</span>
                      </label>
                      {p.page && (
                        <button
                          type="button"
                          className={s.btn}
                          onClick={() => setPage(true)}
                          aria-label={`${p.name} settings`}
                        >
                          Settings…
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const c = concept('year-of-linux');

export function About({ onClose, onMail }: { onClose: () => void; onMail: () => void }) {
  return (
    <div className={s.about}>
      <Image
        src={db.person.photo}
        width={600}
        height={600}
        alt={profile.name}
        className={s.aboutPhoto}
      />
      <h3>{profile.name}</h3>
      <p className={s.aboutRole}>
        {profile.role},{' '}
        <a href={profile.companyUrl} target="_blank" rel="noreferrer">
          {profile.company}
        </a>
      </p>
      <p>{profile.lede}</p>
      <p className={s.aboutLinks}>
        <button type="button" className={s.btn} onClick={onMail}>
          <Icon name="mail" size={16} /> Mail
        </button>
        <a className={s.btn} href={profile.linkedin} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <a className={s.btn} href={profile.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a className={s.btn} href={profile.cv} target="_blank" rel="noreferrer">
          CV
        </a>
      </p>
      <p className={s.aboutSys}>
        {HOST} · {KERNEL} · GNOME 2.24 · Compiz
      </p>
      <p className={s.credit}>
        © {profile.fullName}, {db.person.since} → {db.asOf.y} · {c.name}, concept {c.letter}
      </p>
      <div className={s.btnRow}>
        <button type="button" className={s.btn} onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}

export function Run({ onRun, onClose }: { onRun: (cmd: string) => void; onClose: () => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className={s.runBox}
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onRun(value.trim());
        onClose();
      }}
    >
      <div className={s.runHead}>
        <Icon name="run" size={48} />
        <label>
          <span>Run a command, a program or an address. Anything else runs in the Terminal.</span>
          <input
            className={s.entry}
            list="run-cmds"
            value={value}
            autoFocus
            data-autofocus
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
        </label>
        <datalist id="run-cmds">
          {COMMANDS.map((cmd) => (
            <option key={cmd} value={cmd} />
          ))}
        </datalist>
      </div>
      <div className={s.btnRow}>
        <button type="button" className={s.btn} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className={s.btn} disabled={!value.trim()}>
          <Icon name="run" size={16} /> Run
        </button>
      </div>
    </form>
  );
}
