import { about, db, fmt, jobs, profile, stats } from '../_shared/data';
import { projectLinks } from '../_shared/links';
import {
  contributionsByReach,
  devicesFlown,
  downloadsPerDrone,
  kindLed,
  lanes,
  legOf,
  productsFlown,
  rootsFlown,
  waypoints,
} from './mission';
import s from './swarm.module.scss';

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

const cvFile = profile.cv.split('/').pop();

/** What the formation in the sky is showing, to read in full. */
export default function Payload({ wp, onFly }: { wp: number; onFly: (i: number) => void }) {
  const w = waypoints[wp];
  const leg = legOf(wp);
  return (
    <div className={s.payload}>
      <header className={s.payHead}>
        <p className={s.kicker}>
          <span>{w.code}</span> {leg.name}
        </p>
        <h2 id="payload-title">{w.leg === 'numbers' ? stats[w.sub].label : w.title}</h2>
      </header>
      <div className={s.payBody}>
        <Body wp={wp} onFly={onFly} />
      </div>
      <a className={s.payMore} href={`#${leg.section}`}>
        Read {leg.name.toLowerCase()} in full <span aria-hidden="true">↓</span>
      </a>
    </div>
  );
}

function Body({ wp, onFly }: { wp: number; onFly: (i: number) => void }) {
  const w = waypoints[wp];
  switch (w.leg) {
    case 'callsign':
      return (
        <>
          <p className={s.payLead}>{profile.lede}</p>
          <p>{about[1]}</p>
        </>
      );
    case 'years':
      return (
        <>
          <p className={s.payBig}>
            <b>{db.yearsBuilding}</b>
            <span>{`years building, since ${db.person.since}`}</span>
          </p>
          <p>{about[0]}</p>
        </>
      );
    case 'timeline':
      return (
        <ol className={s.payRoles}>
          {[...lanes].reverse().map((lane) => {
            const job = jobs.find((j) => db.roles[lane.id as db.RoleId].org.startsWith(j.company));
            return (
              <li key={lane.id} style={{ '--c': `var(--led-${lane.c})` } as Vars}>
                <b>{lane.label}</b>
                <span>{job?.title}</span>
                <small>{job?.range}</small>
              </li>
            );
          })}
        </ol>
      );
    case 'numbers':
      return (
        <>
          <p className={s.payBig}>
            <b>{stats[w.sub].value}</b>
            <span>{stats[w.sub].label}</span>
          </p>
          <ul className={s.payStats} aria-label="All figures">
            {stats.map((st, k) => {
              const i = wp - w.sub + k;
              return (
                <li key={st.label}>
                  <button type="button" aria-pressed={k === w.sub} onClick={() => onFly(i)}>
                    <b>{st.value}</b> {st.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      );
    case 'products': {
      const p = productsFlown[w.sub].project;
      return (
        <>
          <p>{p.description}</p>
          <ul className={s.chips}>
            {p.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <Links links={projectLinks(p.links)} />
        </>
      );
    }
    case 'hardware': {
      const d = devicesFlown[w.sub].device;
      return (
        <>
          <p className={s.payLead}>
            <b>{d.tag}</b> · {d.kind}
          </p>
          <p>{d.detail}</p>
          <ul className={s.payFigures}>
            {d.figures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      );
    }
    case 'oss':
      return (
        <>
          <p>{`Weekly downloads of the packages he patched, ${db.downloads.weekly.long} in all. One drone stands for ${fmt.compact(downloadsPerDrone)} a week.`}</p>
          <ol className={s.payRepos}>
            {contributionsByReach.map((c) => (
              <li key={c.repo} style={{ '--c': `var(--led-${kindLed(c.kind)})` } as Vars}>
                <a href={db.prUrl(c)} target="_blank" rel="noreferrer">
                  {c.repo} ↗
                </a>
                <span>
                  {c.weekly.short}/wk · {c.kind}
                </span>
              </li>
            ))}
          </ol>
        </>
      );
    case 'roots': {
      const r = rootsFlown[w.sub];
      return (
        <>
          {r.year && <p className={s.payLead}>{r.year}</p>}
          <p>{r.detail}</p>
          {r.url && (
            <p>
              <a href={r.url} target="_blank" rel="noreferrer">
                Read the paper ↗
              </a>
            </p>
          )}
        </>
      );
    }
    case 'contact':
      return w.sub === 0 ? (
        <>
          <p>Building a platform, a device or a team? Tell me what you’re working on.</p>
          <p className={s.payMail}>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
          </p>
          <Links
            links={[
              { label: 'LinkedIn', url: profile.linkedin, kind: 'site' },
              { label: 'GitHub', url: profile.github, kind: 'code' },
            ]}
          />
        </>
      ) : (
        <>
          <p>The full résumé, every role and duty, as a PDF.</p>
          <Links links={[{ label: `${cvFile}`, url: profile.cv, kind: 'site' }]} />
        </>
      );
  }
}

function Links({ links }: { links: { label: string; url: string; kind: string }[] }) {
  if (!links.length) return <p className={s.payNote}>No public link.</p>;
  return (
    <ul className={s.payLinks}>
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer" data-kind={l.kind}>
            {l.label} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
