'use client';

// Projects: the featured products with their screenshots, then everything else he shipped, each
// with its description, stack and real links.
import Image from 'next/image';
import { db } from '../../_shared/data';
import { projectLinks } from '../../_shared/links';
import { FEATURED, OTHER, STORE_IDS, productId, projectSlug } from '../content';
import { Chip, Group, Row, Screen, Button, type AppCtx } from '../ui';
import s from '../apps.module.scss';
import type { Project } from '@/content/projects';

const ALL: (Project & { image?: string })[] = [...FEATURED, ...OTHER];
const find = (key: string) =>
  ALL.find((p) => projectSlug(p.title) === key || productId(p.title) === key);

export function Projects({ ctx }: { ctx: AppCtx }) {
  if (ctx.path.startsWith('project/')) {
    const p = find(ctx.path.slice(8));
    if (p) return <ProjectView ctx={ctx} p={p} />;
  }
  return (
    <Screen ctx={ctx} title="Projects" className={s.projects}>
      <h3 className={s.sectionHead}>Featured</h3>
      <ul className={s.cards} aria-label="Featured projects">
        {FEATURED.map((p) => (
          <li key={p.title}>
            <button type="button" onClick={() => ctx.push(`project/${projectSlug(p.title)}`)}>
              <span className={s.cardImg}>
                <Image src={p.image} alt="" width={640} height={400} sizes="300px" />
              </span>
              <strong>{p.title}</strong>
              <span>{p.tech.slice(0, 3).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
      <Group header="More" footer={`${db.productsLive.long} products live.`}>
        {OTHER.map((p) => (
          <Row
            key={p.title}
            label={p.title}
            sub={p.tech.join(' · ')}
            onClick={() => ctx.push(`project/${projectSlug(p.title)}`)}
            chevron
          />
        ))}
      </Group>
    </Screen>
  );
}

function ProjectView({ ctx, p }: { ctx: AppCtx; p: Project & { image?: string } }) {
  const id = productId(p.title);
  const app = id && STORE_IDS.includes(id) ? id : null;
  const links = projectLinks(p.links);
  return (
    <Screen ctx={ctx} title={p.title} back="Projects" className={s.projects}>
      {p.image && (
        <div className={s.hero}>
          <Image
            src={p.image}
            alt={`${p.title} screenshot`}
            width={1280}
            height={800}
            sizes="390px"
          />
        </div>
      )}
      <p className={s.padText}>{p.description}</p>
      <div className={s.chipsPad}>
        {p.tech.map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
      </div>
      {app && (
        <div className={s.padBtn}>
          <Button onClick={() => ctx.open(app)} icon="phone">
            Open the app
          </Button>
        </div>
      )}
      {links.length > 0 && (
        <Group header="Links">
          {links.map((l) => (
            <Row
              key={l.url}
              icon={l.kind === 'store' ? 'store' : l.kind === 'code' ? 'pr' : 'globe'}
              label={l.label}
              sub={l.kind === 'store' ? 'Store listing' : l.url.replace(/^https?:\/\//, '')}
              href={l.url}
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}
