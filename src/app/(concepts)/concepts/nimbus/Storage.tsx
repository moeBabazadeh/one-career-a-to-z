'use client';

import { useState } from 'react';
import { BUCKETS, bucketById, crn, type Bucket, type StoredObject } from './inventory';
import { runInShell } from './Shell';
import { useReducedMotion } from '../_shared/hooks';
import { Card, Crn, Ext, Icon, JsonView, KeyValues, PageHead, Pill, cx } from './ui';
import { href, setUi, toast, useUi } from './store';
import s from './console.module.scss';

const bytes = (n: number | null) =>
  n === null ? '—' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
const total = (b: Bucket) => b.objects.reduce((sum, o) => sum + (o.size ?? 0), 0);

export function StorageHome() {
  return (
    <div className={s.page}>
      <PageHead
        kicker="Object storage"
        title={
          <span className={s.titleIcon}>
            <span className={s.svcIcon} data-svc="storage" data-size="lg">
              <Icon name="storage" size={22} />
            </span>
            Storage
          </span>
        }
        lede="The archive: every build under the year it shipped, the documents, and the roots in the Archive class. Archive objects list their titles; restore one to read its body."
        actions={
          <button type="button" className={s.btn} onClick={() => runInShell('cloud storage ls')}>
            <Icon name="terminal" size={16} /> ls in CloudShell
          </button>
        }
      />
      <ul className={s.buckets}>
        {BUCKETS.map((b) => (
          <li key={b.id}>
            <a href={href(`storage/${b.id}`)} className={cx(s.card, s.bucketCard)}>
              <header>
                <Icon name="storage" size={18} />
                <b className={s.mono}>{b.id}</b>
                <Pill tone={b.storageClass === 'Archive' ? 'warn' : 'muted'}>{b.storageClass}</Pill>
              </header>
              <p>{b.blurb}</p>
              <footer>
                <span>{b.objects.length} objects</span>
                <span>{bytes(total(b))} of JSON</span>
              </footer>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Row {
  name: string;
  path: string;
  folder: boolean;
  object?: StoredObject;
  count?: number;
}

function listing(b: Bucket, prefix: string): Row[] {
  const dirs = new Map<string, number>();
  const files: Row[] = [];
  for (const o of b.objects) {
    if (!o.key.startsWith(prefix)) continue;
    const rest = o.key.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash >= 0) {
      const d = rest.slice(0, slash + 1);
      dirs.set(d, (dirs.get(d) ?? 0) + 1);
    } else files.push({ name: rest, path: `storage/${b.id}/${o.key}`, folder: false, object: o });
  }
  const folders = [...dirs.entries()]
    .sort((x, y) =>
      /^\d/.test(x[0]) && /^\d/.test(y[0]) ? y[0].localeCompare(x[0]) : x[0].localeCompare(y[0]),
    )
    .map(([d, n]) => ({
      name: d,
      path: `storage/${b.id}/${prefix}${d.slice(0, -1)}`,
      folder: true,
      count: n,
    }));
  return [...folders, ...files];
}

export function BucketView({ bucket, rest }: { bucket: string; rest: string }) {
  const b = bucketById(bucket) as Bucket;
  const object = b.objects.find((o) => o.key === rest);
  if (object) return <ObjectDetail bucket={b} object={object} />;
  const prefix = rest ? `${rest.replace(/\/$/, '')}/` : '';
  const rows = listing(b, prefix);
  return (
    <div className={s.page}>
      <PageHead
        kicker={`Bucket · ${b.storageClass}`}
        title={
          <span className={s.mono}>
            {b.id}
            {prefix && <span className={s.muted}>/{prefix}</span>}
          </span>
        }
        lede={b.blurb}
        actions={
          <button
            type="button"
            className={s.btn}
            onClick={() => runInShell(`cloud storage ls ${b.id}/${prefix}`)}
          >
            <Icon name="terminal" size={16} /> ls in CloudShell
          </button>
        }
      >
        <div className={s.headMeta}>
          <Crn value={crn('storage', '', 'bucket', b.id)} />
        </div>
      </PageHead>
      <div className={s.table}>
        <div className={s.tableHead}>
          <h2>
            Objects <span className={s.count}>({rows.length})</span>
          </h2>
        </div>
        <div className={s.tableScroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Title</th>
                <th scope="col" className={s.wide}>
                  Class
                </th>
                <th scope="col" className={cx(s.wide, s.end)}>
                  Size
                </th>
                <th scope="col" className={s.wide}>
                  Modified
                </th>
              </tr>
            </thead>
            <tbody>
              {prefix && (
                <tr>
                  <td colSpan={5}>
                    <a
                      href={href(
                        `storage/${b.id}${prefix.split('/').slice(0, -2).length ? `/${prefix.split('/').slice(0, -2).join('/')}` : ''}`,
                      )}
                      className={s.objName}
                    >
                      <Icon name="up" size={15} /> ..
                    </a>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.path}>
                  <td>
                    <a href={href(r.path)} className={s.objName}>
                      <Icon name={r.folder ? 'storage' : 'file'} size={15} />
                      {r.name}
                    </a>
                  </td>
                  <td className={s.objTitle}>
                    {r.folder ? (
                      <span className={s.muted}>{r.count} objects</span>
                    ) : (
                      r.object?.title
                    )}
                  </td>
                  <td className={s.wide}>
                    {r.object ? (
                      <Pill tone={r.object.storageClass === 'Archive' ? 'warn' : 'muted'}>
                        {r.object.storageClass}
                      </Pill>
                    ) : (
                      <span className={s.muted}>Folder</span>
                    )}
                  </td>
                  <td className={cx(s.wide, s.end, s.mono)}>
                    {r.object ? bytes(r.object.size) : '—'}
                  </td>
                  <td className={cx(s.wide, s.mono)}>{r.object?.modified ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ObjectDetail({ bucket: b, object: o }: { bucket: Bucket; object: StoredObject }) {
  const ui = useUi();
  const reduced = useReducedMotion();
  const path = `${b.id}/${o.key}`;
  const restored = ui.restored.includes(path);
  const [restoring, setRestoring] = useState(false);
  const archived = o.storageClass === 'Archive' && !restored;

  const restore = () => {
    setRestoring(true);
    setTimeout(
      () => {
        setUi((st) => ({ restored: [...new Set([...st.restored, path])] }));
        setRestoring(false);
        toast(`Restored ${o.key.split('/').pop()}`);
      },
      reduced ? 0 : 1600,
    );
  };

  return (
    <div className={s.page}>
      <PageHead
        kicker={`Object · ${b.id}`}
        title={<span className={s.mono}>{o.key.split('/').pop()}</span>}
        lede={o.title}
        actions={
          <>
            {o.body && (
              <button
                type="button"
                className={s.btn}
                onClick={() => runInShell(`cloud storage cat ${path}`)}
              >
                <Icon name="terminal" size={16} /> cat in CloudShell
              </button>
            )}
            {o.link && (
              <Ext url={o.link.url} className={s.btnPrimary}>
                Open {o.link.label}
              </Ext>
            )}
          </>
        }
      />
      <div className={s.detailGrid}>
        <Card title="Properties">
          <KeyValues
            items={[
              ['Key', <code key="k">{o.key}</code>],
              [
                'Bucket',
                <a key="b" href={href(`storage/${b.id}`)}>
                  {b.id}
                </a>,
              ],
              [
                'Storage class',
                <Pill key="c" tone={o.storageClass === 'Archive' ? 'warn' : 'muted'}>
                  {restored ? 'Archive (restored copy)' : o.storageClass}
                </Pill>,
              ],
              ['Content type', o.contentType],
              ['Size', bytes(o.size)],
              ['Last modified', o.modified === '—' ? 'Undated' : o.modified],
              ['Tags', o.tags.join(', ') || '—'],
            ]}
          />
        </Card>
        <Card title="Body">
          {archived ? (
            <div className={s.archived}>
              <Icon name="lock" size={22} />
              <b>This object is in the Archive storage class</b>
              <p>Its title is listed above. Restore a temporary copy to read the body.</p>
              {restoring ? (
                <div className={s.progress} role="progressbar" aria-label="Restoring">
                  <i />
                </div>
              ) : (
                <button type="button" className={s.btnPrimary} onClick={restore}>
                  <Icon name="restore" size={16} /> Restore
                </button>
              )}
              <p className={s.muted}>
                or in CloudShell: <code>cloud storage restore {path}</code>
              </p>
            </div>
          ) : o.body ? (
            <JsonView value={o.body} label={o.key} title={o.key.split('/').pop()} />
          ) : (
            <p className={s.prose}>
              Binary object, served from its own address.{' '}
              {o.link && <Ext url={o.link.url}>Open {o.link.label}</Ext>}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
