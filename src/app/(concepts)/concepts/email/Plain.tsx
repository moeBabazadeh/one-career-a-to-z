'use client';

import Image from 'next/image';
import { db, profile } from '../_shared/data';
import { Blocks } from './Body';
import { fullDate } from './dates';
import { Icon } from './icons';
import { GROUPS, THREADS } from './mailbox';
import s from './mail.module.scss';

/** Every mail as one plain page, grouped by subject, for reading without the client. */
export default function Plain() {
  return (
    <div className={s.plain}>
      <header className={s.plainTop}>
        <a href="#inbox" className={s.ghostBtn}>
          <Icon.back size={16} /> Back to the mailbox
        </a>
      </header>
      <article className={s.plainDoc}>
        <header className={s.plainHead}>
          <Image src={db.person.photo} width={144} height={144} alt="" className={s.plainPhoto} />
          <div>
            <h1>{profile.name}</h1>
            <p>
              {profile.role}, <a href={profile.companyUrl}>{profile.company}</a>. {profile.headline}
              .
            </p>
            <p className={s.plainContact}>
              <a href={`mailto:${profile.email}`}>{profile.email}</a> ·{' '}
              <a href={profile.linkedin}>LinkedIn</a> · <a href={profile.github}>GitHub</a> ·{' '}
              <a href={profile.cv}>CV (PDF)</a>
            </p>
          </div>
        </header>
        <nav className={s.plainToc} aria-label="Sections">
          {GROUPS.map((g) => (
            <a
              key={g.id}
              href="#read"
              onClick={(e) => {
                // The hash is the view, so section links scroll instead of navigating.
                e.preventDefault();
                document.getElementById(`plain-${g.id}`)?.scrollIntoView();
              }}
            >
              {g.title}
            </a>
          ))}
        </nav>
        {GROUPS.map((g) => {
          const list = THREADS.filter((t) => t.group === g.id);
          return (
            <section
              key={g.id}
              id={`plain-${g.id}`}
              className={s.plainSection}
              aria-labelledby={`plain-h-${g.id}`}
            >
              <h2 id={`plain-h-${g.id}`}>{g.title}</h2>
              {list.map((t) => (
                <section key={t.id} className={s.plainThread}>
                  <h3>{t.subject}</h3>
                  {t.messages.map((m) => (
                    <div key={m.id} className={s.plainMsg}>
                      <p className={s.plainDate}>
                        {fullDate(m.date)} · {m.from.name}
                      </p>
                      <div className={s.msgBody}>
                        <Blocks blocks={m.blocks} />
                      </div>
                      {m.attachments.length > 0 && (
                        <p className={s.plainAtt}>
                          {m.attachments.map((x) => (
                            <a key={x.href} href={x.href} target="_blank" rel="noreferrer">
                              <Icon.clip size={14} /> {x.name}
                            </a>
                          ))}
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </section>
          );
        })}
        <section className={s.plainSection} aria-labelledby="plain-h-contact">
          <h2 id="plain-h-contact">Contact</h2>
          <p>
            Email <a href={`mailto:${profile.email}`}>{profile.email}</a>, or find me on{' '}
            <a href={profile.linkedin}>LinkedIn</a> and <a href={profile.github}>GitHub</a>. My CV
            is at{' '}
            <a href={profile.cv}>
              {db.person.site}
              {profile.cv}
            </a>
            .
          </p>
        </section>
      </article>
    </div>
  );
}
