// The station log: everything on the air, as a plain page, for reading without the receiver.
import { memo } from 'react';
import { concept } from '../_shared/concepts';
import { db, profile } from '../_shared/data';
import { Chapter } from './Chapters';
import { stations } from './stations';
import { hz } from './units';
import s from './radio.module.scss';

const me = concept('radio');

function Log({ onTune }: { onTune: (id: (typeof stations)[number]['id']) => void }) {
  return (
    <section id="log" className={s.log} aria-labelledby="log-title">
      <header className={s.logHead}>
        <p className={s.eyebrow}>Station log · every transmission, as text</p>
        <h2 id="log-title">Read as a page</h2>
        <p className={s.lede}>{profile.lede}</p>
        <nav aria-label="Chapters" className={s.logNav}>
          {stations.map((st) => (
            <a key={st.id} href={`#log-${st.id}`}>
              {st.title}
            </a>
          ))}
        </nav>
      </header>
      {stations.map((st) => (
        <section
          key={st.id}
          id={`log-${st.id}`}
          className={s.logSection}
          aria-labelledby={`log-${st.id}-title`}
        >
          <header>
            <h2 id={`log-${st.id}-title`}>{st.title}</h2>
            <p className={s.logAir}>
              <span>{hz(st.freq)}</span> {st.where} · {st.device.name}
              <button type="button" className={s.linkBtn} onClick={() => onTune(st.id)}>
                Tune the receiver here ↑
              </button>
            </p>
          </header>
          <Chapter id={st.id} full />
        </section>
      ))}
      <footer className={s.logFoot}>
        <span>
          {`Concept ${me.letter} · ${me.name}`} · {db.person.site}
        </span>
        <a href="#receiver">Back to the receiver ↑</a>
      </footer>
    </section>
  );
}

export default memo(Log);
