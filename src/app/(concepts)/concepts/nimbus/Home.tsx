'use client';

import Image from 'next/image';
import { about, db, fmt, profile, skills, stats } from '../_shared/data';
import {
  ACCOUNT,
  BILL_TOTAL,
  BUCKETS,
  CHART_ORDER,
  EVENTS,
  PERIOD,
  REGIONS,
  RESOURCES,
  ROLES,
  SERVICES,
  STATUS,
  SPAN,
  eventTime,
  type Status,
} from './inventory';
import { runInShell } from './Shell';
import { Card, Ext, Icon, PageHead, Pill } from './ui';
import { href, openPanel, useUi } from './store';
import { crumbLabel, iconOf } from './labels';
import s from './console.module.scss';

const { current, education, awards, robots, papers } = db;

/** Resources by status, for the health widget. */
const health = (Object.keys(STATUS) as Status[])
  .map((st) => ({ st, n: RESOURCES.filter((r) => r.status === st).length }))
  .filter((x) => x.n > 0);

export function Home() {
  const ui = useUi();
  const longest = Math.max(...ROLES.map((r) => r.months));
  return (
    <div className={s.page}>
      <PageHead
        kicker={`Account ${profile.name}`}
        title="Console Home"
        actions={
          <>
            <a className={s.btn} href={href('read')}>
              <Icon name="book" size={16} /> Read as a page
            </a>
            <button
              type="button"
              className={s.btnPrimary}
              onClick={() => runInShell('cloud whoami')}
            >
              <Icon name="terminal" size={16} /> Open CloudShell
            </button>
          </>
        }
      />

      <div className={s.homeGrid}>
        <Card className={s.hero}>
          <div className={s.heroMain}>
            <Image
              src={db.person.photo}
              width={240}
              height={240}
              alt={profile.name}
              className={s.heroPhoto}
              priority
              sizes="96px"
            />
            <div>
              <p className={s.heroKicker}>
                <span className={s.liveDot} aria-hidden="true" /> Signed in as {ACCOUNT} ·{' '}
                {profile.fullName}
              </p>
              <h2 className={s.heroName}>{profile.name}</h2>
              <p className={s.heroRole}>
                {current.title}, <Ext url={current.companyUrl}>{current.company}</Ext>
                {' · '}
                {profile.headline}
              </p>
            </div>
          </div>
          <p className={s.heroTag}>{profile.tagline}</p>
          <p className={s.heroLede}>{profile.lede}</p>
          <div className={s.heroActions}>
            <button type="button" className={s.btnPrimary} onClick={() => openPanel('support')}>
              <Icon name="mail" size={16} /> Contact
            </button>
            <a className={s.btn} href={href(`iam/roles/${current.role.id}`)}>
              <Icon name="iam" size={16} /> Current role
            </a>
            <Ext url={profile.cv} className={s.btn}>
              <Icon name="download" size={16} /> CV
            </Ext>
            <Ext url={profile.linkedin} className={s.btnGhost}>
              LinkedIn
            </Ext>
            <Ext url={profile.github} className={s.btnGhost}>
              GitHub
            </Ext>
          </div>
        </Card>

        <Card
          title="Account summary"
          className={s.summary}
          actions={<Pill tone="ok">From the record</Pill>}
        >
          <ul className={s.stats}>
            {stats.map((st) => (
              <li key={st.label}>
                <b>{st.value}</b>
                <span>{st.label}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Resource health"
          actions={<a href={href('resources')}>All resources</a>}
          className={s.healthCard}
        >
          <div
            className={s.healthBar}
            role="img"
            aria-label={health.map((h) => `${h.n} ${STATUS[h.st].label}`).join(', ')}
          >
            {health.map((h) => (
              <span key={h.st} data-tone={STATUS[h.st].tone} style={{ flexGrow: h.n }} />
            ))}
          </div>
          <ul className={s.healthList}>
            {health.map((h) => (
              <li key={h.st}>
                <span className={s.status} data-tone={STATUS[h.st].tone}>
                  <i aria-hidden="true" />
                  {STATUS[h.st].label}
                </span>
                <b>{h.n}</b>
              </li>
            ))}
          </ul>
          <ul className={s.svcMini}>
            {SERVICES.map((sv) => (
              <li key={sv.id}>
                <a href={href(sv.id)}>
                  <span className={s.svcIcon} data-svc={sv.id}>
                    <Icon name={iconOf(sv.id)} size={15} />
                  </span>
                  <span>{sv.name}</span>
                  <small>
                    {sv.id === 'storage'
                      ? BUCKETS.length
                      : RESOURCES.filter((r) => r.service === sv.id).length}
                  </small>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Cost and usage"
          actions={<a href={href('billing')}>Billing</a>}
          className={s.costCard}
        >
          <p className={s.costTotal}>
            <b>{BILL_TOTAL}</b> months billed
            <span>
              {SPAN} calendar months since {fmt.mon(PERIOD.from)}
            </span>
          </p>
          <ul className={s.costRows}>
            {[...CHART_ORDER].reverse().map((id, i) => {
              const r = ROLES.find((x) => x.id === id);
              if (!r) return null;
              return (
                <li key={id}>
                  <span
                    className={s.swatch}
                    data-series={CHART_ORDER.length - 1 - i}
                    aria-hidden="true"
                  />
                  <a href={href(`iam/roles/${id}`)}>{r.name}</a>
                  <span className={s.costBar}>
                    <i
                      data-series={CHART_ORDER.length - 1 - i}
                      style={{ width: `${(r.months / longest) * 100}%` }}
                    />
                  </span>
                  <b>{r.months}</b>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title="Latest events"
          actions={<a href={href('events')}>Audit trail</a>}
          className={s.eventsCard}
        >
          <ol className={s.feed}>
            {EVENTS.slice(0, 6).map((e) => (
              <li key={e.id}>
                <time>{eventTime(e)}</time>
                <code>{e.name}</code>
                <span>{e.summary}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card
          title="Regions"
          actions={<a href={href('regions')}>Manage</a>}
          className={s.regionsCard}
        >
          <ul className={s.regionMini}>
            {REGIONS.map((r) => (
              <li key={r.id}>
                <span className={s.liveDot} aria-hidden="true" />
                <b>{r.name}</b>
                <code>{r.id}</code>
                <span>{r.products.map((p) => db.products[p].title).join(', ')}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recently visited" className={s.recentCard}>
          <ul className={s.recent}>
            {ui.recent.map((p) => (
              <li key={p}>
                <a href={href(p)}>
                  <Icon name={iconOf(p.split('/')[0])} size={16} />
                  {crumbLabel(p)}
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="About this account" className={s.aboutCard}>
          {about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <p className={s.skillsLine}>
            {skills.map((k) => (
              <Pill key={k}>{k}</Pill>
            ))}
          </p>
        </Card>

        <Card
          title="Roots"
          actions={<a href={href('storage/roots')}>Cold storage</a>}
          className={s.rootsCard}
        >
          <ul className={s.rootsList}>
            {Object.values(education).map((d) => (
              <li key={d.degree}>
                <time>{fmt.yearSpan(d.from, d.to)}</time>
                <span>
                  <b>{db.degreeTitle(d)}</b>, {d.school}
                </span>
              </li>
            ))}
            <li>
              <time>{fmt.yearSpan(robots.ssl.from, robots.ssl.to)}</time>
              <span>
                <b>{robots.ssl.title}</b>
              </span>
            </li>
            <li>
              <time>{awards.robocup.year}</time>
              <span>
                <b>
                  {awards.robocup.event}, {awards.robocup.place}
                </b>
                , {awards.robocup.challenge}
              </span>
            </li>
            <li>
              <time>{papers.inverter.date.y}</time>
              <span>
                <b>Paper</b>, <Ext url={papers.inverter.url}>{papers.inverter.venue}</Ext>
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
