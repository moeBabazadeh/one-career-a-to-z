import { useEffect, useRef, useState } from 'react';
import { db, skills } from '../_shared/data';
import { PKGS } from './fs';
import { Icon } from './icons';
import { candy } from './shell';
import s from './desktop.module.scss';

// A graphical pacman front end. The "packages" are the fixes Moe got merged into other
// people's projects; installing them replays the transaction with pacman's progress bars.

const GROUPS = ['All', ...[...new Set(PKGS.map((p) => p.kind))]];
const pkgSlug = (x: string) =>
  x
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default function Packages({ animate }: { animate: boolean }) {
  const [group, setGroup] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(PKGS[0].name);
  const [run, setRun] = useState<{ step: number; frame: number } | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  const q = query.trim().toLowerCase();
  const local = group === 'Installed';
  const list = PKGS.filter(
    (p) =>
      (group === 'All' || p.kind === group) &&
      (!q || `${p.name} ${p.repo} ${p.change}`.toLowerCase().includes(q)),
  );
  const p = PKGS.find((x) => x.name === sel) ?? PKGS[0];

  useEffect(() => () => window.clearInterval(timer.current), []);

  const apply = () => {
    setDone(false);
    if (!animate) {
      setRun({ step: PKGS.length, frame: 0 });
      setDone(true);
      return;
    }
    let step = 0,
      frame = 0;
    setRun({ step, frame });
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      frame++;
      if (frame > 10) {
        frame = 0;
        step++;
      }
      if (step >= PKGS.length) {
        window.clearInterval(timer.current);
        setDone(true);
      }
      setRun({ step, frame });
    }, 55);
  };

  return (
    <div className={s.app}>
      <div className={s.toolbar} role="toolbar" aria-label="Package Manager">
        <button type="button" className={s.toolBtn} onClick={() => (setRun(null), setDone(false))}>
          <Icon name="reload" size={22} />
          <span>Refresh</span>
        </button>
        <button type="button" className={s.toolBtn} onClick={apply} disabled={!!run && !done}>
          <Icon name="update" size={22} />
          <span>Apply {PKGS.length} Upgrades</span>
        </button>
        <span className={s.toolSep} />
        <label className={s.searchbar}>
          <Icon name="search" size={16} />
          <span className={s.srOnly}>Search packages</span>
          <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div className={s.pkgBody}>
        <nav className={s.places} aria-label="Groups">
          <p className={s.paneHead}>Repositories</p>
          <ul>
            {GROUPS.map((g) => (
              <li key={g}>
                <button
                  type="button"
                  className={group === g ? s.placeOn : undefined}
                  onClick={() => setGroup(g)}
                >
                  <Icon
                    name={
                      g === 'All'
                        ? 'package'
                        : g === 'Security'
                          ? 'lock'
                          : g === 'Bug'
                            ? 'mines'
                            : 'code'
                    }
                    size={16}
                  />
                  {g === 'All' ? 'upstream' : g}
                  <em>{g === 'All' ? PKGS.length : PKGS.filter((x) => x.kind === g).length}</em>
                </button>
              </li>
            ))}
          </ul>
          <hr />
          <ul>
            <li>
              <button
                type="button"
                className={local ? s.placeOn : undefined}
                onClick={() => setGroup('Installed')}
              >
                <Icon name="computer" size={16} /> local
                <em>{skills.length}</em>
              </button>
            </li>
          </ul>
        </nav>
        <div className={s.pkgMain}>
          {local ? (
            <div className={s.table} role="table" aria-label="Installed skills">
              <div className={`${s.thead} ${s.skillRow}`} role="row">
                <span role="columnheader">Package</span>
                <span role="columnheader">Description</span>
              </div>
              {skills.map((k) => (
                <div key={k} className={`${s.trow} ${s.skillRow}`} role="row">
                  <span role="cell" className={s.tname}>
                    <Icon name="package" size={16} /> {pkgSlug(k)}
                  </span>
                  <span role="cell">{k}, explicitly installed</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className={s.table} role="grid" aria-label="Upstream fixes">
                <div className={`${s.thead} ${s.pkgRow}`} role="row">
                  <span role="columnheader">S</span>
                  <span role="columnheader">Package</span>
                  <span role="columnheader">Version</span>
                  <span role="columnheader">Downloads/wk</span>
                  <span role="columnheader">★</span>
                </div>
                {list.map((x) => (
                  <button
                    key={x.name}
                    type="button"
                    role="row"
                    aria-selected={x.name === sel}
                    className={`${s.trow} ${s.pkgRow} ${x.name === sel ? s.trowOn : ''}`}
                    onClick={() => setSel(x.name)}
                  >
                    <span role="gridcell" aria-label={done ? 'merged' : 'upgradeable'}>
                      <Icon name={done ? 'star' : 'update'} size={16} />
                    </span>
                    <span role="gridcell" className={s.tname}>
                      {x.name}
                    </span>
                    <span role="gridcell">{x.version}</span>
                    <span role="gridcell">{x.weekly}</span>
                    <span role="gridcell">{x.stars}</span>
                  </button>
                ))}
                {!list.length && <p className={s.empty}>No packages match.</p>}
              </div>
              {run ? (
                <div className={s.pacLog} role="log" aria-live="polite" aria-label="Transaction">
                  <p>:: Starting full system upgrade...</p>
                  {PKGS.slice(0, Math.min(run.step + 1, PKGS.length)).map((x, i) => (
                    <p key={x.name}>
                      {`(${i + 1}/${PKGS.length}) upgrading ${x.name}`.padEnd(42)}
                      <span className={i < run.step ? s.cGreen : s.cYellow}>
                        {candy(i < run.step ? 1 : run.frame / 10, run.frame)}
                      </span>
                    </p>
                  ))}
                  {done && (
                    <p
                      className={s.cGreen}
                    >{`:: ${PKGS.length} fixes merged upstream, ${db.downloads.weekly.long} downloads a week.`}</p>
                  )}
                </div>
              ) : (
                <fieldset className={s.frame} aria-live="polite">
                  <legend>
                    {p.repo} {p.version}
                  </legend>
                  <dl className={s.kv}>
                    <dt>Change</dt>
                    <dd>{p.change}</dd>
                    <dt>Fixes</dt>
                    <dd>{p.impact}</dd>
                    <dt>Group</dt>
                    <dd>
                      {p.kind} · merged {p.year}
                    </dd>
                    <dt>Popularity</dt>
                    <dd>
                      ★ {p.stars} · {p.weekly} downloads a week
                    </dd>
                  </dl>
                  <a className={s.btn} href={p.url} target="_blank" rel="noreferrer">
                    View pull request #{p.pr} ↗
                  </a>
                </fieldset>
              )}
            </>
          )}
        </div>
      </div>
      <p className={s.statusbar}>
        <span>
          {local
            ? `${skills.length} packages installed locally`
            : `${list.length} packages listed · ${done ? 'system is up to date' : `${PKGS.length} upgradeable`}`}
        </span>
        <span>{db.downloads.exact} downloads a week in total</span>
      </p>
    </div>
  );
}
