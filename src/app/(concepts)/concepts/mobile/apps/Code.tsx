'use client';

// Code: a code-hosting client opened on Moe's profile. His pull requests upstream, filterable by
// label, each with the change, why it mattered and a link to the real pull request.
import Image from 'next/image';
import { useState } from 'react';
import { db, fmt, oss } from '../../_shared/data';
import { Icon } from '../icons';
import { Button, Chip, Group, Row, Screen, Segmented, cx, type AppCtx } from '../ui';
import s from '../apps.module.scss';

const IDS = Object.keys(db.contributions) as db.ContributionId[];
const PRS = IDS.map((id, i) => ({
  id,
  ...oss[i],
  pr: (db.contributions[id] as db.Contribution).pr,
})).sort((a, b) => b.year - a.year);
const KINDS = [...new Set(PRS.map((p) => p.kind))];
const KIND_TONE: Record<string, string> = {
  Security: 'var(--c-red)',
  'Data loss': 'var(--c-orange)',
  'Type safety': 'var(--c-blue)',
  Bug: 'var(--c-purple)',
};

const own = db.products.matrixKeypad;

export function Code({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = useState<'pulls' | 'repos'>('pulls');
  const [kind, setKind] = useState<string | null>(null);

  if (ctx.path.startsWith('pr/')) {
    const pr = PRS.find((p) => p.id === ctx.path.slice(3));
    if (pr) return <PullRequest ctx={ctx} pr={pr} />;
  }

  const shown = PRS.filter((p) => !kind || p.kind === kind);

  return (
    <Screen ctx={ctx} title="Code" className={s.code}>
      <header className={s.gh}>
        <Image className={s.ghAvatar} src={db.person.photo} alt="" width={120} height={120} />
        <div>
          <h3>{db.person.name}</h3>
          <a href={db.person.github} target="_blank" rel="noopener noreferrer">
            @{db.person.githubUser}
          </a>
        </div>
      </header>
      <dl className={s.ghStats}>
        <div>
          <dt>Pull requests</dt>
          <dd>{PRS.length}</dd>
        </div>
        <div>
          <dt>Weekly downloads patched</dt>
          <dd>{db.downloads.weekly.short}</dd>
        </div>
        <div>
          <dt>Commits since {db.commits.since}</dt>
          <dd>{db.commits.total.short}</dd>
        </div>
      </dl>
      <div className={s.pad}>
        <Segmented
          label="Section"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'pulls', label: 'Pull requests' },
            { id: 'repos', label: 'Repositories' },
          ]}
        />
      </div>

      {tab === 'pulls' ? (
        <>
          <div className={s.filters} role="group" aria-label="Filter by label">
            <button type="button" aria-pressed={!kind} onClick={() => setKind(null)}>
              All
            </button>
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(kind === k ? null : k)}
                style={{ '--tone': KIND_TONE[k] } as React.CSSProperties}
              >
                {k}
              </button>
            ))}
          </div>
          <ul className={s.prs}>
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => ctx.push(`pr/${p.id}`)}>
                  <Icon name="pr" size={18} className={s.prIcon} />
                  <span className={s.prBody}>
                    <span className={s.prRepo}>
                      {p.repo} <span>#{p.pr}</span>
                    </span>
                    <strong>{p.change}</strong>
                    <span className={s.prMeta}>
                      <Chip tone={KIND_TONE[p.kind]}>{p.kind}</Chip>
                      <span>{p.year}</span>
                      <span>
                        <Icon name="star" size={12} /> {p.stars}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <Group header="Contributed to">
            {PRS.map((p) => (
              <Row
                key={p.id}
                icon="repo"
                label={p.repo}
                sub={`${p.weekly} weekly downloads`}
                value={<span className={s.stars}>★ {p.stars}</span>}
                onClick={() => ctx.push(`pr/${p.id}`)}
                chevron
              />
            ))}
          </Group>
          {own.links.github && (
            <Group header="Own">
              <Row icon="repo" label={own.title} sub={own.description} href={own.links.github} />
            </Group>
          )}
        </>
      )}
    </Screen>
  );
}

type PR = (typeof PRS)[number];

function PullRequest({ ctx, pr }: { ctx: AppCtx; pr: PR }) {
  return (
    <Screen ctx={ctx} title={`#${pr.pr}`} back="Code" large={false} className={s.code}>
      <article className={s.prView}>
        <p className={s.prRepo}>{pr.repo}</p>
        <h3>
          {pr.change} <span>#{pr.pr}</span>
        </h3>
        <p className={s.prState}>
          <span className={cx(s.prBadge)}>
            <Icon name="pr" size={15} /> {pr.kind}
          </span>
          <span>
            {db.person.githubUser} · {pr.year}
          </span>
        </p>
      </article>
      <Group header="Why it mattered">
        <li className={s.prose}>
          <p>{pr.impact}</p>
        </li>
      </Group>
      <Group header="Repository">
        <Row label="Stars" value={pr.stars} />
        <Row label="Weekly downloads" value={pr.weekly} />
        <Row label="Year" value={String(pr.year)} />
      </Group>
      <div className={s.padBtn}>
        <Button href={pr.url} icon="external">
          Open pull request
        </Button>
      </div>
      <p className={s.count}>
        {fmt.Spell(PRS.length)} pull requests, {db.downloads.weekly.long} downloads a week combined
      </p>
    </Screen>
  );
}
