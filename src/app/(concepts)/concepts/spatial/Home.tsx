'use client';

import { useState, type CSSProperties, type Ref } from 'react';
import { profile } from '../_shared/data';
import { Icon, type IconName } from './icons';
import s from './spatial.module.scss';

export interface HomeApp {
  id: string;
  label: string;
  icon: IconName;
  /** The icon's colour, as two stops of a gradient. */
  tint: [string, string];
  onOpen: () => void;
  /** For the environment toggles: which one is on. */
  on?: boolean;
}

type HomeTab = 'apps' | 'people' | 'env';

const TABS: { id: HomeTab; label: string; icon: IconName }[] = [
  { id: 'apps', label: 'Apps', icon: 'apps' },
  { id: 'people', label: 'People', icon: 'people' },
  { id: 'env', label: 'Environments', icon: 'mountains' },
];

/** Rows of the honeycomb: five, then four tucked between them, and so on. */
function arrange(n: number) {
  const out: { col: number; row: number }[] = [];
  let row = 0,
    left = n;
  while (left > 0) {
    const width = Math.min(left, row % 2 ? 4 : 5);
    for (let i = 0; i < width; i++) out.push({ col: i - (width - 1) / 2, row });
    left -= width;
    row += 1;
  }
  return { cells: out, rows: row };
}

const STEP = 8.6;

/**
 * Home: app icons on a gently curved grid in front of you, wherever you happen to be looking,
 * with a tab bar on its leading edge for apps, people and environments.
 */
export default function Home({
  open,
  yaw,
  apps,
  people,
  envs,
  layerRef,
}: {
  open: boolean;
  yaw: number;
  apps: HomeApp[];
  people: HomeApp[];
  envs: HomeApp[];
  layerRef: Ref<HTMLDivElement>;
}) {
  const [tab, setTab] = useState<HomeTab>('apps');
  const list = tab === 'apps' ? apps : tab === 'people' ? people : envs;
  const { cells, rows } = arrange(list.length);

  return (
    <div className={s.homeLayer} ref={layerRef}>
      <div
        className={s.home}
        data-open={open || undefined}
        style={{ '--yaw0': `${yaw}deg` } as CSSProperties}
        role="dialog"
        aria-modal="false"
        aria-label="Home"
        inert={!open}
      >
        <div
          className={s.homeTabs}
          role="tablist"
          aria-label="Home"
          style={{ '--a': `${-(STEP * 2 + 7)}deg` } as CSSProperties}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${s.tab} ${s.gz}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={20} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <ul className={s.grid} data-tab={tab} style={{ '--rows': rows } as CSSProperties}>
          {list.map((a, i) => {
            const c = cells[i];
            return (
              <li
                key={a.id}
                style={
                  {
                    '--a': `${c.col * STEP}deg`,
                    '--row': c.row - (rows - 1) / 2,
                    '--i': i,
                    '--t0': a.tint[0],
                    '--t1': a.tint[1],
                  } as CSSProperties
                }
              >
                <button
                  type="button"
                  className={`${s.app} ${s.gz}`}
                  onClick={a.onOpen}
                  aria-pressed={a.on === undefined ? undefined : a.on}
                  data-home-app={i === 0 ? '' : undefined}
                >
                  <span className={s.appIcon} aria-hidden="true">
                    <span className={s.appGlyph}>
                      {tab === 'people' ? (
                        <span className={s.initials}>
                          {profile.name
                            .split(' ')
                            .map((w) => w[0])
                            .join('')}
                        </span>
                      ) : (
                        <Icon name={a.icon} size={38} />
                      )}
                    </span>
                  </span>
                  <span className={s.appLabel}>{a.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
