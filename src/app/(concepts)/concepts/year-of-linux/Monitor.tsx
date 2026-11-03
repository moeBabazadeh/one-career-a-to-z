import { useEffect, useRef, useState } from 'react';
import { db, fmt, hardware, profile } from '../_shared/data';
import { useScheme } from '../_shared/hooks';
import { token } from '../_shared/scheme';
import { HOST, KERNEL, deviceIcon } from './fs';
import { Icon } from './icons';
import s from './desktop.module.scss';

// The System Monitor, where the processes are the devices Moe has in production and the
// resources are their fleets' real numbers.

const { logger, attendumReader: reader } = db.devices;
const fleet = reader.fleet;

/** Every fleet figure the db has, drawn on one log scale. */
const SERIES = [
  { label: `${logger.name}: stations`, fig: logger.stations, color: '--s1' },
  { label: `${logger.name}: records`, fig: logger.records, color: '--s1' },
  { label: `${reader.name}s online`, fig: fleet.online, color: '--s2' },
  { label: `${reader.name}: classrooms`, fig: fleet.classrooms, color: '--s2' },
  { label: `${reader.name}: classes`, fig: fleet.classes, color: '--s2' },
  { label: `${reader.name}: records, ${fleet.recordYears} yrs`, fig: fleet.records, color: '--s2' },
];

function Resources() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scheme = useScheme();

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const draw = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = el.clientWidth,
        H = el.clientHeight;
      if (!W || !H) return;
      el.width = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (n: string) => token(el, n);
      const font = t('--font-ui') || 'sans-serif';
      ctx.fillStyle = t('--graph-bg');
      ctx.fillRect(0, 0, W, H);
      const left = Math.min(190, W * 0.42),
        right = 14,
        top = 26,
        row = (H - top - 26) / SERIES.length;
      const lo = 1,
        hi = 9;
      const x = (v: number) => left + ((Math.log10(v) - lo) / (hi - lo)) * (W - left - right);
      // A gridline per decade, like the monitor's graphs.
      ctx.font = `10px ${font}`;
      ctx.textAlign = 'center';
      for (let d = lo; d <= hi; d++) {
        const gx = Math.round(x(10 ** d)) + 0.5;
        ctx.strokeStyle = t('--graph-grid');
        ctx.beginPath();
        ctx.moveTo(gx, top - 6);
        ctx.lineTo(gx, H - 22);
        ctx.stroke();
        ctx.fillStyle = t('--graph-text');
        ctx.fillText(
          d >= 9
            ? '1B'
            : d >= 6
              ? `${10 ** (d - 6)}M`
              : d >= 3
                ? `${10 ** (d - 3)}k`
                : String(10 ** d),
          gx,
          H - 8,
        );
      }
      ctx.textAlign = 'left';
      ctx.fillText('log scale; every bar is a lower bound', left, 14);
      SERIES.forEach((sr, i) => {
        const y = top + i * row;
        const bh = Math.max(8, Math.min(18, row * 0.55));
        ctx.fillStyle = t('--graph-text');
        ctx.font = `12px ${font}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(sr.label, 6, y + row / 2, left - 12);
        const grad = ctx.createLinearGradient(0, y, 0, y + bh);
        grad.addColorStop(0, t(`${sr.color}a`));
        grad.addColorStop(1, t(sr.color));
        ctx.fillStyle = grad;
        const bx = x(10),
          bw = Math.max(2, x(sr.fig.n) - bx);
        ctx.fillRect(bx, y + (row - bh) / 2, bw, bh);
        ctx.fillStyle = t('--graph-text');
        ctx.font = `bold 11px ${font}`;
        const label = sr.fig.short;
        const lw = ctx.measureText(label).width;
        ctx.fillText(label, bx + bw + 6 + lw > W - 4 ? bx + bw - lw - 6 : bx + bw + 6, y + row / 2);
        if (bx + bw + 6 + lw > W - 4) {
          ctx.fillStyle = '#fff';
          ctx.fillText(label, bx + bw - lw - 6, y + row / 2);
        }
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheme]);

  return (
    <div className={s.resources}>
      <fieldset className={s.frame}>
        <legend>Fleets in the field</legend>
        <canvas
          ref={canvas}
          className={s.graph}
          role="img"
          aria-label={SERIES.map((sr) => `${sr.label}: ${sr.fig.long}`).join('; ')}
        />
      </fieldset>
      <p className={s.legend}>
        <span className={s.sw1} /> {logger.name}, {logger.kind}, online for {logger.online.long}{' '}
        years
        <span className={s.sw2} /> {reader.name}, at {fleet.scope}
      </p>
    </div>
  );
}

type SortKey = 'name' | 'tag' | 'kind';

export default function Monitor() {
  const [tab, setTab] = useState<'system' | 'processes' | 'resources' | 'fs'>('processes');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'tag', dir: 1 });
  const [sel, setSel] = useState(hardware[0].tag);
  const rows = [...hardware].sort((a, b) => a[sort.key].localeCompare(b[sort.key]) * sort.dir);
  const picked = hardware.find((h) => h.tag === sel)!;
  const TABS: [typeof tab, string][] = [
    ['system', 'System'],
    ['processes', 'Processes'],
    ['resources', 'Resources'],
    ['fs', 'File Systems'],
  ];
  const head = (key: SortKey, label: string) => (
    <button
      type="button"
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
      onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : 1 })}
    >
      {label} {sort.key === key ? (sort.dir === 1 ? '▾' : '▴') : ''}
    </button>
  );
  const share = db.commits.neurobuild.n / db.commits.total.n;

  return (
    <div className={s.app}>
      <div className={s.tabs} role="tablist" aria-label="System Monitor">
        {TABS.map(([id, label], i) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`mon-${id}`}
            aria-selected={tab === id}
            aria-controls="mon-panel"
            tabIndex={tab === id ? 0 : -1}
            className={`${s.tab} ${tab === id ? s.tabOn : ''}`}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const next =
                TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length][0];
              setTab(next);
              requestAnimationFrame(() => document.getElementById(`mon-${next}`)?.focus());
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={s.tabPanel} role="tabpanel" id="mon-panel" aria-labelledby={`mon-${tab}`}>
        {tab === 'system' && (
          <div className={s.sysTab}>
            <Icon name="computer" size={64} />
            <div>
              <h3>{HOST}</h3>
              <p>Release {KERNEL}, GNOME 2.24, Compiz</p>
              <dl className={s.kv}>
                <dt>Owner</dt>
                <dd>
                  {profile.fullName}, {profile.role}, {profile.company}
                </dd>
                <dt>Processor</dt>
                <dd>
                  {db.education.bsc.field}, {db.education.bsc.focus}
                </dd>
                <dt>Building since</dt>
                <dd>
                  {db.person.since} ({db.yearsBuilding} years)
                </dd>
                <dt>Devices</dt>
                <dd>{hardware.length} in production</dd>
              </dl>
            </div>
          </div>
        )}
        {tab === 'processes' && (
          <div className={s.procs}>
            <p className={s.procNote}>
              Load averages for the last 1, 5, 15 minutes: everything in production, nothing idle.
            </p>
            <div
              className={s.table}
              role="grid"
              aria-label="Devices in production"
              aria-rowcount={rows.length + 1}
            >
              <div className={s.thead} role="row">
                <span role="columnheader">{head('name', 'Process Name')}</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">{head('tag', 'ID')}</span>
                <span role="columnheader">{head('kind', 'Type')}</span>
              </div>
              {rows.map((d) => (
                <button
                  key={d.tag}
                  type="button"
                  role="row"
                  aria-selected={d.tag === sel}
                  className={`${s.trow} ${d.tag === sel ? s.trowOn : ''}`}
                  onClick={() => setSel(d.tag)}
                >
                  <span role="gridcell" className={s.tname}>
                    <Icon name={deviceIcon(d.tag)} size={16} /> {d.name}
                  </span>
                  <span role="gridcell">Running</span>
                  <span role="gridcell">{d.tag}</span>
                  <span role="gridcell">{d.kind}</span>
                </button>
              ))}
            </div>
            <fieldset className={s.frame} aria-live="polite">
              <legend>
                {picked.name} ({picked.tag})
              </legend>
              <p>{picked.detail}</p>
              <ul className={s.figs}>
                {picked.figures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </fieldset>
            <div className={s.btnRow}>
              <button type="button" className={s.btn} disabled title="Still in production">
                End Process
              </button>
            </div>
          </div>
        )}
        {tab === 'resources' && <Resources />}
        {tab === 'fs' && (
          <div className={s.procs}>
            <div className={s.table} role="table" aria-label="Commits">
              <div className={`${s.thead} ${s.fsRow}`} role="row">
                <span role="columnheader">Device</span>
                <span role="columnheader">Directory</span>
                <span role="columnheader">Type</span>
                <span role="columnheader">Used</span>
              </div>
              <div className={`${s.trow} ${s.fsRow}`} role="row">
                <span role="cell">/dev/commits</span>
                <span role="cell">~/Work</span>
                <span role="cell">git</span>
                <span role="cell">
                  {db.commits.total.short} since {db.commits.since}
                  <i className={s.meter}>
                    <b style={{ width: '100%' }} />
                  </i>
                </span>
              </div>
              <div className={`${s.trow} ${s.fsRow}`} role="row">
                <span role="cell">/dev/{db.products.neurobuild.title.toLowerCase()}</span>
                <span role="cell">~/Work/{db.roles.neuroject.org}</span>
                <span role="cell">git ×{db.commits.neurobuildCodebases}</span>
                <span role="cell">
                  {db.commits.neurobuild.short} ({Math.round(share * 100)}%)
                  <i className={s.meter}>
                    <b style={{ width: `${share * 100}%` }} />
                  </i>
                </span>
              </div>
            </div>
            <p className={s.procNote}>
              {fmt.Spell(db.commits.neurobuildCodebases)} codebases make up{' '}
              {db.products.neurobuild.title}: {db.commits.neurobuild.long} of{' '}
              {db.commits.total.long} commits.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
