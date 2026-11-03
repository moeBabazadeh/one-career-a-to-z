'use client';

// Moe's own store apps, opened on the phone: each a small working app built from its product
// record, with its real App Store and Google Play links. Attendum also gets its devices and a
// proximity check-in you can try against a simulated beacon.
import { useEffect, useState } from 'react';
import { archive, db, hardware } from '../../_shared/data';
import { APPS, host } from '../content';
import { Glyph, Icon } from '../icons';
import { Chip, Group, Row, cx, type AppCtx } from '../ui';
import s from '../apps.module.scss';

type Tab = 'overview' | 'checkin' | 'devices' | 'get';

/** "Attendance monitoring live at universities in the UK and US.": a description's first sentence. */
const lead = (text: string) => text.split(/(?<=\.)\s/)[0];

export function StoreApp({ ctx, product }: { ctx: AppCtx; product: db.ProductId }) {
  const p = db.products[product];
  const links: db.ProjectLinks = p.links;
  // Devices built on the chips this product lists.
  const devices = hardware.filter((d) => {
    const raw = Object.values(db.devices).find((x) => x.tag === d.tag);
    return !!raw && 'chip' in raw && p.tech.includes(raw.chip);
  });
  const fleet = devices.length ? db.devices.attendumReader.fleet : null;
  const tabs: { id: Tab; label: string; icon: 'home' | 'bluetooth' | 'chip' | 'store' }[] = [
    { id: 'overview', label: 'Overview', icon: 'home' },
    ...(devices.length
      ? [
          { id: 'checkin' as const, label: 'Check in', icon: 'bluetooth' as const },
          { id: 'devices' as const, label: 'Devices', icon: 'chip' as const },
        ]
      : []),
    { id: 'get', label: 'Get', icon: 'store' },
  ];
  const [tab, setTab] = useState<Tab>('overview');
  const madeAt = archive.find(
    (b) => b.title === p.title || b.title.startsWith(`${p.title} app`),
  )?.madeAt;
  const countries = 'countries' in p ? (p.countries as string[]) : null;
  const active = ctx.os.mode === 'app' && ctx.os.app === ctx.id && !ctx.os.locked;

  return (
    <div className={cx(s.storeApp, s[`brand_${product}`])}>
      <div className={s.storeScroll}>
        {tab === 'overview' && (
          <div className={s.storePage}>
            <header className={s.storeHero}>
              <span className={s.storeGlyph}>
                <Glyph name={APPS[product]?.icon ?? 'projects'} />
              </span>
              <h2>{p.title}</h2>
              <p>{lead(p.description)}</p>
            </header>
            {fleet && (
              <>
                <ul className={s.storeStats}>
                  <li>
                    <strong>{fleet.online.short}</strong>
                    <span>devices online</span>
                  </li>
                  <li>
                    <strong>{fleet.classrooms.short}</strong>
                    <span>classrooms</span>
                  </li>
                  <li>
                    <strong>{fleet.classes.short}</strong>
                    <span>classes covered</span>
                  </li>
                  <li>
                    <strong>{fleet.records.short}</strong>
                    <span>records in {fleet.recordYears} years</span>
                  </li>
                </ul>
                <p className={s.storeNote}>
                  At {fleet.scope}, the only one with numbers to share, so lower bounds.
                </p>
              </>
            )}
            <section className={s.storeCard}>
              <h3>About</h3>
              <p>{p.description}</p>
              {countries && (
                <p className={s.storeMeta}>
                  <Icon name="globe" size={14} /> {countries.join(' · ')}
                </p>
              )}
            </section>
            <section className={s.storeCard}>
              <h3>Built with</h3>
              <div className={s.chipsRow}>
                {p.tech.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </div>
              {madeAt && (
                <p className={s.storeMeta}>
                  Built by {db.person.first} at {madeAt}
                </p>
              )}
            </section>
          </div>
        )}

        {tab === 'checkin' && (
          <CheckIn
            active={active}
            beacon={devices.find((d) => d.kind.includes('beacon'))?.name ?? devices[0]?.name}
          />
        )}

        {tab === 'devices' && (
          <div className={s.storePage}>
            <h2 className={s.storeTitle}>Devices</h2>
            {devices.map((d) => (
              <section key={d.tag} className={s.storeCard}>
                <p className={s.storeTag}>{d.tag}</p>
                <h3>{d.name}</h3>
                <p className={s.storeKind}>{d.kind}</p>
                <p>{d.detail}</p>
                {d.figures.length > 1 && (
                  <ul className={s.storeFigs}>
                    {d.figures.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className={s.storeLink}
                  onClick={() => ctx.open('hardware', [`device/${d.tag}`])}
                >
                  Open in Hardware <Icon name="chevronRight" size={14} />
                </button>
              </section>
            ))}
          </div>
        )}

        {tab === 'get' && (
          <div className={s.storePage}>
            <h2 className={s.storeTitle}>Get {p.title}</h2>
            <div className={s.storeButtons}>
              {links.appStore && (
                <a
                  className={s.storeBadge}
                  href={links.appStore}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="store" size={24} />
                  <span>
                    <small>iPhone and iPad</small>App Store
                  </span>
                </a>
              )}
              {links.playStore && (
                <a
                  className={s.storeBadge}
                  href={links.playStore}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="play" size={22} />
                  <span>
                    <small>Android</small>Google Play
                  </span>
                </a>
              )}
            </div>
            <Group>
              {links.external && (
                <Row
                  icon="globe"
                  label="Website"
                  sub={host(links.external)}
                  href={links.external}
                />
              )}
              <Row
                icon="grid"
                label="In Projects"
                onClick={() => ctx.open('projects', [`project/${product}`])}
                chevron
              />
            </Group>
          </div>
        )}
      </div>

      <nav className={s.tabBar} aria-label={`${p.title} sections`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ proximity check-in */

// Illustrative constants for the demo, not the product's: the signal at one metre and how fast
// it falls off indoors.
const TX = -59;
const PATH_N = 2.2;
const NOISE = 2.6;
const CHECK_IN_M = 1.5;

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal noise from two uniforms (Box–Muller). */
const gauss = (rand: () => number) =>
  Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

interface Reading {
  raw: number;
  /** Kalman-filtered RSSI. */
  est: number;
  p: number;
  meters: number;
  /** Ticks spent inside the check-in radius. */
  near: number;
  checked: boolean;
}

const start: Reading = { raw: -80, est: -80, p: 10, meters: 10, near: 0, checked: false };

function CheckIn({ active, beacon }: { active: boolean; beacon?: string }) {
  const [distance, setDistance] = useState(4);
  const [r, setR] = useState<Reading>(start);
  const [rand] = useState(() => prng(0x5eed));

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setR((prev) => {
        const raw = TX - 10 * PATH_N * Math.log10(distance) + gauss(rand) * NOISE;
        // A one-dimensional Kalman filter on RSSI: predict (q), then correct by the gain.
        const q = 0.12;
        const R = NOISE * NOISE;
        const p = prev.p + q;
        const k = p / (p + R);
        const est = prev.est + k * (raw - prev.est);
        const meters = Math.pow(10, (TX - est) / (10 * PATH_N));
        const near = meters < CHECK_IN_M ? prev.near + 1 : 0;
        return { raw, est, p: (1 - k) * p, meters, near, checked: prev.checked || near >= 5 };
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [active, distance, rand]);

  const bars = Math.max(0, Math.min(4, Math.round((r.est + 95) / 9)));

  return (
    <div className={s.storePage}>
      <h2 className={s.storeTitle}>Check in</h2>
      <div
        className={s.radar}
        data-checked={r.checked || undefined}
        style={{ '--near': Math.max(0, Math.min(1, 1 - r.meters / 8)) } as React.CSSProperties}
      >
        <span />
        <span />
        <span />
        <div className={s.radarCore}>
          {r.checked ? <Icon name="check" size={34} /> : <Icon name="bluetooth" size={30} />}
        </div>
      </div>
      <p className={s.radarState} aria-live="polite">
        {r.checked
          ? 'Checked in'
          : r.meters < CHECK_IN_M
            ? 'Hold still…'
            : 'Move closer to the beacon'}
      </p>
      <dl className={s.readings}>
        <div>
          <dt>RSSI</dt>
          <dd>{Math.round(r.raw)} dBm</dd>
        </div>
        <div>
          <dt>Filtered</dt>
          <dd>{Math.round(r.est)} dBm</dd>
        </div>
        <div>
          <dt>Estimate</dt>
          <dd>{r.meters.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>Signal</dt>
          <dd className={s.sigBars} aria-label={`${bars} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} data-on={i < bars || undefined} />
            ))}
          </dd>
        </div>
      </dl>
      <label className={s.distance}>
        <span>
          Distance to the {beacon ?? 'beacon'}: <b>{distance.toFixed(1)} m</b>
        </span>
        <input
          type="range"
          min={0.3}
          max={8}
          step={0.1}
          value={distance}
          onChange={(e) => {
            setDistance(Number(e.target.value));
          }}
        />
      </label>
      {r.checked && (
        <button type="button" className={s.storeLink} onClick={() => setR(start)}>
          Reset
        </button>
      )}
      <p className={s.storeNote}>
        A simulated beacon. The phone turns signal strength into distance with the log-distance
        path-loss model and smooths it with a Kalman filter; inside {CHECK_IN_M} m for a second, you
        are checked in. The constants are illustrative.
      </p>
    </div>
  );
}
