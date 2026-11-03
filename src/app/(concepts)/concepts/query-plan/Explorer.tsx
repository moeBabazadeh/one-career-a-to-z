'use client';

import { useState } from 'react';
import { TABLES } from './sql/catalog';
import { SAVED } from './saved';
import { loadSaved, runText, useWorkbench } from './store';
import s from './query.module.scss';

export function KeyIcon({ kind }: { kind: 'pk' | 'fk' | 'col' }) {
  if (kind === 'pk')
    return (
      <svg viewBox="0 0 16 16" className={s.keyIcon} data-kind="pk" aria-label="primary key">
        <circle cx="5.5" cy="8" r="3" />
        <path d="M8.5 8H14M12 8v2.5M14 8v2" />
      </svg>
    );
  if (kind === 'fk')
    return (
      <svg viewBox="0 0 16 16" className={s.keyIcon} data-kind="fk" aria-label="foreign key">
        <path d="M6.5 9.5l3-3M5 7.5L3.6 8.9a2.1 2.1 0 0 0 3 3L8 10.5M11 8.5l1.4-1.4a2.1 2.1 0 0 0-3-3L8 5.5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 16 16" className={s.keyIcon} data-kind="col" aria-hidden="true">
      <rect x="5" y="5" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={s.fileIcon}>
      <path d="M4 1.5h5.5L13 5v9.5H4z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  );
}

function SavedList() {
  const wb = useWorkbench();
  return (
    <ol className={s.savedList}>
      {SAVED.map((q, i) => (
        <li key={q.id}>
          <button
            type="button"
            aria-current={wb.saved === q.id || undefined}
            onClick={() => loadSaved(q.id)}
          >
            <span className={s.savedNum}>{String(i + 1).padStart(2, '0')}</span>
            <span className={s.savedText}>
              <b>{q.title}</b>
              <span>
                <FileIcon />
                {q.file}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function SchemaTree() {
  const [open, setOpen] = useState<string | null>('roles');
  return (
    <ul className={s.tree} aria-label="Tables in career.public">
      {TABLES.map((t) => {
        const expanded = open === t.name;
        return (
          <li key={t.name}>
            <div className={s.treeRow}>
              <button
                type="button"
                className={s.treeToggle}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : t.name)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className={s.chev}>
                  <path d="M6 4l4 4-4 4" />
                </svg>
                <svg viewBox="0 0 16 16" aria-hidden="true" className={s.tableIcon}>
                  <rect x="2" y="3" width="12" height="10" rx="1.5" />
                  <path d="M2 6.5h12M6.5 6.5V13" />
                </svg>
                <span>{t.name}</span>
                <small>{t.rows.length}</small>
              </button>
              <button
                type="button"
                className={s.treeRun}
                onClick={() => runText(`SELECT *\nFROM ${t.name}\nLIMIT 50;`)}
                aria-label={`Run SELECT * FROM ${t.name}`}
                title={`SELECT * FROM ${t.name}`}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5 3.5v9l7-4.5z" />
                </svg>
              </button>
            </div>
            {expanded && (
              <ul className={s.cols}>
                {t.columns.map((c) => (
                  <li key={c.name}>
                    <KeyIcon kind={c.pk ? 'pk' : c.fk ? 'fk' : 'col'} />
                    <span>{c.name}</span>
                    <small>{c.type}</small>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function Explorer() {
  const [tab, setTab] = useState<'saved' | 'schema'>('saved');
  return (
    <aside className={s.explorer} aria-label="Explorer">
      <header className={s.paneHead}>
        <div className={s.seg} role="tablist" aria-label="Explorer">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'saved'}
            onClick={() => setTab('saved')}
          >
            Saved queries
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'schema'}
            onClick={() => setTab('schema')}
          >
            Schema
          </button>
        </div>
      </header>
      <div className={s.explorerBody}>
        {tab === 'saved' ? (
          <>
            <p className={s.explorerNote}>
              The story, as ten queries. Each runs live against his data.
            </p>
            <SavedList />
          </>
        ) : (
          <>
            <p className={s.explorerNote}>
              career <span>›</span> public <span>›</span> {TABLES.length} tables
            </p>
            <SchemaTree />
          </>
        )}
      </div>
    </aside>
  );
}

/** The saved queries as a strip of chips, for narrow screens. */
export function SavedChips() {
  const wb = useWorkbench();
  return (
    <nav className={s.chips} aria-label="Saved queries">
      <ol>
        {SAVED.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              aria-current={wb.saved === q.id || undefined}
              onClick={() => loadSaved(q.id)}
            >
              {q.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
