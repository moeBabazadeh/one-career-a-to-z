import { concept } from '../_shared/concepts';
import { NOW, db, profile } from '../_shared/data';
import { Archive, Brief, CHAPTERS } from './chapters';
import s from './minefield.module.scss';

const C = concept('minefield');
const { person } = db;

/**
 * Everything the console holds, as a plain page: the brief and every chapter in order, then
 * every build by year. No simulation needed.
 */
export default function Report() {
  return (
    <article id="report" className={s.report} aria-labelledby="report-title">
      <header className={s.reportHead}>
        <p className={s.kicker}>Field report · read as a page</p>
        <h2 id="report-title">{profile.name}</h2>
        <a href="#top" className={s.back}>
          Back to the field
        </a>
      </header>
      <section aria-label="Brief" className={s.reportSection}>
        <Brief />
      </section>
      {CHAPTERS.map((c, i) => (
        <section key={c.id} className={s.reportSection} aria-labelledby={`report-${c.id}`}>
          <p className={s.kicker}>{`Mark ${i + 1} · ${c.blurb}`}</p>
          <h3 id={`report-${c.id}`}>{c.title}</h3>
          <c.Body />
        </section>
      ))}
      <section className={s.reportSection} aria-labelledby="report-archive">
        <p className={s.kicker}>Everything, by year</p>
        <h3 id="report-archive">All builds</h3>
        <Archive />
      </section>
      <footer className={s.footer}>
        <span>{`${C.letter} · ${C.name}`}</span>
        <span>The robot, field and detector are modelled for this simulation.</span>
        <span>{`© ${profile.fullName}, ${person.since} – ${Math.floor(NOW)}`}</span>
      </footer>
    </article>
  );
}
