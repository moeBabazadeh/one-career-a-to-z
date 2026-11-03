'use client';

// Notes: about, skills, roots and the numbers, as notes in folders with search and checklists.
import { useState } from 'react';
import { db, fmt } from '../../_shared/data';
import { NOTES, type NoteDoc } from '../content';
import { Icon } from '../icons';
import { copy, Screen, SearchField, type AppCtx } from '../ui';
import s from '../apps.module.scss';

const preview = (n: NoteDoc) =>
  n.paragraphs?.[0] ?? n.checklist?.join(', ') ?? n.list?.map((l) => l.title).join(', ') ?? '';

const plain = (n: NoteDoc) =>
  [
    n.title,
    '',
    ...(n.paragraphs ?? []),
    ...(n.checklist ?? []).map((c) => `- [x] ${c}`),
    ...(n.list ?? []).map((l) => `${l.meta ? `${l.meta}: ` : ''}${l.title}. ${l.detail}`),
  ].join('\n');

export function Notes({ ctx }: { ctx: AppCtx }) {
  const [q, setQ] = useState('');
  const id = ctx.path.startsWith('note/') ? ctx.path.slice(5) : null;
  const note = id ? NOTES.find((n) => n.id === id) : null;

  if (note) return <NoteView ctx={ctx} note={note} />;

  const terms = q.toLowerCase().trim();
  const shown = NOTES.filter((n) => !terms || plain(n).toLowerCase().includes(terms));
  const folders = [...new Set(shown.map((n) => n.folder))];

  return (
    <Screen
      ctx={ctx}
      title="Notes"
      className={s.notes}
      foot={
        <div className={s.toolbar}>
          <span />
          <span className={s.toolbarText}>{NOTES.length} Notes</span>
          <span />
        </div>
      }
    >
      <div className={s.pad}>
        <SearchField value={q} onChange={setQ} label="Search notes" />
      </div>
      {folders.map((f) => (
        <section key={f} className={s.group}>
          <h3 className={s.groupHead}>{f}</h3>
          <ul className={s.list}>
            {shown
              .filter((n) => n.folder === f)
              .map((n) => (
                <li key={n.id} className={s.row}>
                  <button
                    type="button"
                    className={s.noteRow}
                    onClick={() => ctx.push(`note/${n.id}`)}
                  >
                    <strong>{n.title}</strong>
                    <span>
                      <time>{fmt.mon(db.asOf)}</time> {preview(n)}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {!shown.length && <p className={s.empty}>No notes match “{q}”.</p>}
    </Screen>
  );
}

function NoteView({ ctx, note }: { ctx: AppCtx; note: NoteDoc }) {
  // Ticks are the visitor's own, like any checklist; they aren't saved.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(note.checklist ?? []));

  return (
    <Screen
      ctx={ctx}
      title=""
      back="Notes"
      large={false}
      className={s.noteView}
      actions={
        <button
          type="button"
          className={s.barIcon}
          aria-label="Copy note"
          onClick={async () => {
            if (await copy(plain(note))) ctx.toast('Note copied');
          }}
        >
          <Icon name="share" size={21} />
        </button>
      }
    >
      <article className={s.note}>
        <p className={s.noteDate}>Checked {fmt.month(db.asOf)}</p>
        <h3>{note.title}</h3>
        {note.paragraphs?.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {note.checklist && (
          <ul className={s.checklist}>
            {note.checklist.map((c) => {
              const on = ticked.has(c);
              return (
                <li key={c}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      setTicked((t) => {
                        const next = new Set(t);
                        if (on) next.delete(c);
                        else next.add(c);
                        return next;
                      })
                    }
                  >
                    <span className={s.tick}>{on && <Icon name="check" size={14} />}</span>
                    <span>{c}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {note.list && (
          <ul className={s.noteList}>
            {note.list.map((l) => (
              <li key={l.title + l.detail}>
                {l.meta && <span className={s.noteMeta}>{l.meta}</span>}
                <strong>
                  {l.url ? (
                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.title}
                    </a>
                  ) : (
                    l.title
                  )}
                </strong>
                <span>{l.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </Screen>
  );
}
