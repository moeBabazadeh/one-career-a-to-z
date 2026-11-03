'use client';

// Files: the CV, the paper and the whole build archive in folders by year, with tags, search,
// list and icon views, sorting, and Quick Look for any file.
import { useState } from 'react';
import { ARCHIVE, ARCHIVE_YEARS, CV, PAPER, TAGS, type FileItem } from '../content';
import { Icon, type UiIcon } from '../icons';
import { Button, Chip, Group, Row, Screen, SearchField, cx, type AppCtx } from '../ui';
import s from '../apps.module.scss';

const ALL = [CV, PAPER, ...ARCHIVE];
const byId = (id: string) => ALL.find((f) => f.id === id);
const UNDATED = '—';
const yearName = (y: string) => (y === UNDATED ? 'In production' : y);

const TAG_TINTS = [
  'var(--c-blue)',
  'var(--c-green)',
  'var(--c-orange)',
  'var(--c-purple)',
  'var(--c-pink)',
  'var(--c-teal)',
  'var(--c-red)',
  'var(--c-yellow)',
  'var(--c-gray)',
];
const tagTint = (t: string) => TAG_TINTS[TAGS.indexOf(t) % TAG_TINTS.length];

const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

const fileIcon = (f: FileItem): UiIcon =>
  f.kind === 'pdf' ? 'pdf' : f.kind === 'link' ? 'link' : f.kind === 'device' ? 'chip' : 'doc';

type Sort = 'name' | 'date';

export function Files({ ctx }: { ctx: AppCtx }) {
  const [q, setQ] = useState('');
  const [grid, setGrid] = useState(false);
  const [sort, setSort] = useState<Sort>('date');
  const p = ctx.path;

  if (p.startsWith('file/')) {
    const f = byId(p.slice(5));
    if (f) return <QuickLook ctx={ctx} f={f} />;
  }

  const view = { grid, setGrid, sort, setSort };

  if (p === 'folder/docs')
    return <Folder key={p} ctx={ctx} title="Documents" back="Browse" files={[CV]} {...view} />;
  if (p === 'folder/papers')
    return <Folder key={p} ctx={ctx} title="Papers" back="Browse" files={[PAPER]} {...view} />;
  if (p.startsWith('folder/archive/')) {
    const y = p.slice(15);
    return (
      <Folder
        key={p}
        ctx={ctx}
        title={yearName(y)}
        back="Archive"
        files={ARCHIVE.filter((f) => f.year === y)}
        {...view}
      />
    );
  }
  if (p === 'folder/archive')
    return <ArchiveRoot key={p} ctx={ctx} grid={grid} setGrid={setGrid} />;
  if (p.startsWith('tag/')) {
    const t = decodeURIComponent(p.slice(4));
    return (
      <Folder
        key={p}
        ctx={ctx}
        title={t}
        back="Browse"
        files={ARCHIVE.filter((f) => f.tags.includes(t))}
        {...view}
      />
    );
  }

  const terms = q.toLowerCase().trim();
  const hits = terms
    ? ALL.filter((f) =>
        `${f.name} ${f.tags.join(' ')} ${f.tech.join(' ')} ${f.year}`.toLowerCase().includes(terms),
      )
    : [];

  return (
    <Screen ctx={ctx} title="Browse" className={s.files}>
      <div className={s.pad}>
        <SearchField value={q} onChange={setQ} label="Search files" />
      </div>
      {terms ? (
        <Group header={`${hits.length} results`}>
          {hits.map((f) => (
            <FileRow key={f.id} f={f} onOpen={() => ctx.push(`file/${f.id}`)} />
          ))}
          {!hits.length && <li className={s.none}>No files match “{q}”.</li>}
        </Group>
      ) : (
        <>
          <Group header="Locations">
            <Row
              icon="phone"
              label="On My Phone"
              sub={items(ALL.length)}
              onClick={() => ctx.push('folder/archive')}
              chevron
            />
          </Group>
          <Group header="Favourites">
            <Row
              icon="folder"
              label="Documents"
              sub="CV"
              onClick={() => ctx.push('folder/docs')}
              chevron
            />
            <Row
              icon="folder"
              label="Archive"
              sub={`${ARCHIVE.length} builds by year`}
              onClick={() => ctx.push('folder/archive')}
              chevron
            />
            <Row
              icon="folder"
              label="Papers"
              sub={PAPER.detail}
              onClick={() => ctx.push('folder/papers')}
              chevron
            />
          </Group>
          <Group header="Tags">
            {TAGS.map((t) => (
              <Row
                key={t}
                lead={
                  <span className={s.dot} style={{ background: tagTint(t) }} aria-hidden="true" />
                }
                label={t}
                value={ARCHIVE.filter((f) => f.tags.includes(t)).length}
                onClick={() => ctx.push(`tag/${encodeURIComponent(t)}`)}
                chevron
              />
            ))}
          </Group>
        </>
      )}
    </Screen>
  );
}

function ViewButtons({ grid, setGrid }: { grid: boolean; setGrid: (g: boolean) => void }) {
  return (
    <button
      type="button"
      className={s.barIcon}
      aria-label={grid ? 'Show as list' : 'Show as icons'}
      onClick={() => setGrid(!grid)}
    >
      <Icon name={grid ? 'list' : 'grid'} size={20} />
    </button>
  );
}

function ArchiveRoot({
  ctx,
  grid,
  setGrid,
}: {
  ctx: AppCtx;
  grid: boolean;
  setGrid: (g: boolean) => void;
}) {
  return (
    <Screen
      ctx={ctx}
      title="Archive"
      back="Browse"
      className={s.files}
      actions={<ViewButtons grid={grid} setGrid={setGrid} />}
    >
      {grid ? (
        <ul className={s.iconGrid}>
          {ARCHIVE_YEARS.map((y) => (
            <li key={y}>
              <button type="button" onClick={() => ctx.push(`folder/archive/${y}`)}>
                <span className={s.folderIcon}>
                  <Icon name="folder" size={52} />
                </span>
                <strong>{yearName(y)}</strong>
                <small>{items(ARCHIVE.filter((f) => f.year === y).length)}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Group>
          {ARCHIVE_YEARS.map((y) => (
            <Row
              key={y}
              icon="folder"
              label={yearName(y)}
              sub={items(ARCHIVE.filter((f) => f.year === y).length)}
              onClick={() => ctx.push(`folder/archive/${y}`)}
              chevron
            />
          ))}
        </Group>
      )}
      <p className={s.count}>
        {ARCHIVE_YEARS.length} folders · {items(ARCHIVE.length)}
      </p>
    </Screen>
  );
}

interface FolderProps {
  ctx: AppCtx;
  title: string;
  back: string;
  files: FileItem[];
  grid: boolean;
  setGrid: (g: boolean) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
}

function Folder({ ctx, title, back, files, grid, setGrid, sort, setSort }: FolderProps) {
  const sorted = [...files].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : b.year.localeCompare(a.year),
  );
  return (
    <Screen
      ctx={ctx}
      title={title}
      back={back}
      className={s.files}
      actions={<ViewButtons grid={grid} setGrid={setGrid} />}
    >
      <div className={s.sortBar}>
        <span>Sort by</span>
        <button type="button" aria-pressed={sort === 'name'} onClick={() => setSort('name')}>
          Name
        </button>
        <button type="button" aria-pressed={sort === 'date'} onClick={() => setSort('date')}>
          Date
        </button>
      </div>
      {grid ? (
        <ul className={s.iconGrid}>
          {sorted.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => ctx.push(`file/${f.id}`)}>
                <span className={cx(s.fileIcon, s[`kind_${f.kind}`])}>
                  <Icon name={fileIcon(f)} size={30} />
                </span>
                <strong>{f.name}</strong>
                <small>{yearName(f.year)}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Group>
          {sorted.map((f) => (
            <FileRow key={f.id} f={f} onOpen={() => ctx.push(`file/${f.id}`)} />
          ))}
        </Group>
      )}
      <p className={s.count}>{items(files.length)}</p>
    </Screen>
  );
}

function FileRow({ f, onOpen }: { f: FileItem; onOpen: () => void }) {
  return (
    <Row
      onClick={onOpen}
      lead={
        <span className={cx(s.fileIcon, s.fileIconSm, s[`kind_${f.kind}`])}>
          <Icon name={fileIcon(f)} size={18} />
        </span>
      }
      label={f.name}
      sub={[yearName(f.year), ...f.tags].join(' · ')}
      chevron
    />
  );
}

function QuickLook({ ctx, f }: { ctx: AppCtx; f: FileItem }) {
  const pdf = f.kind === 'pdf' && f.url?.endsWith('.pdf');
  return (
    <Screen ctx={ctx} title={f.name} back="Back" large={false} className={s.files}>
      <div className={s.look}>
        {pdf ? (
          <div className={s.pdfFrame}>
            <iframe
              src={`${f.url}#toolbar=0&view=FitH`}
              title={`${f.name} preview`}
              loading="lazy"
            />
          </div>
        ) : (
          <span className={cx(s.fileIcon, s.fileIconLg, s[`kind_${f.kind}`])}>
            <Icon name={fileIcon(f)} size={46} />
          </span>
        )}
        <h3>{f.name}</h3>
        {f.detail && <p className={s.lookSub}>{f.detail}</p>}
        <div className={s.lookActions}>
          {f.url && (
            <Button href={f.url} icon="external">
              {f.kind === 'pdf' ? 'Open' : 'Open link'}
            </Button>
          )}
          {pdf && f.url && (
            <Button href={f.url} icon="download" plain download>
              Download
            </Button>
          )}
        </div>
      </div>
      <Group header="Information">
        <Row
          label="Kind"
          value={
            f.kind === 'pdf'
              ? 'PDF document'
              : f.kind === 'link'
                ? 'Link'
                : f.kind === 'device'
                  ? 'Device, in production'
                  : 'Document'
          }
        />
        <Row label="Year" value={f.year === UNDATED ? 'No date on record' : f.year} />
        {f.tags.length > 0 && <Row label="Made at" value={f.tags.join(', ')} />}
        {f.url && (
          <Row label="Where" value={f.url.replace(/^https?:\/\//, '').replace(/\/$/, '')} />
        )}
      </Group>
      {f.tech.length > 0 && (
        <Group header="Tags">
          <li className={s.chips}>
            {f.tech.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </li>
        </Group>
      )}
    </Screen>
  );
}
