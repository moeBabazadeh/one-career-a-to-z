'use client';

import { db, profile } from '../../_shared/data';
import { useSceneProgress } from '../depth';
import { LAYERS } from '../layers';
import s from '../stack.module.scss';

// The climb back up: the response rides every layer in reverse while the shaft streams past,
// and the page surfaces where it started, on the button, which now says it worked.

export default function Ascent() {
  const [ref] = useSceneProgress<HTMLElement>();
  return (
    <>
      <section
        ref={ref}
        id="ascent"
        className={s.ascent}
        aria-label="The climb back to the surface"
      >
        <div className={s.ascentStage}>
          <div className={s.streaks} aria-hidden="true" />
          <ol className={s.shaft} aria-hidden="true">
            {LAYERS.map((l) => (
              <li key={l.id} style={{ '--accent': l.accent } as React.CSSProperties}>
                <b>{String(l.n).padStart(2, '0')}</b>
                <span>{l.tech}</span>
                <i>{l.scale}</i>
              </li>
            ))}
          </ol>
          <p className={s.climbPacket} aria-hidden="true">
            <span>↑</span> HTTP/2 200 · stream 1 · END_STREAM
          </p>
          <p className={s.ascentText}>
            The response climbs back up: out of the silicon, through the kernel, the database and
            the servers, across the ocean, decrypted, resolved, painted. Every click does this.
          </p>
          <div className={s.daylight} aria-hidden="true" />
        </div>
      </section>

      <section id="contact" className={s.contact} aria-labelledby="contact-title">
        <p className={s.ok}>
          <span aria-hidden="true">✓</span> 200 OK · back at the surface
        </p>
        <h2 id="contact-title">{`Hire ${db.person.first}`}</h2>
        <p className={s.contactLede}>
          {profile.role} at {profile.company}
          {`, building since ${db.person.since}. Tell me what you’re building: the platform, the product or the team behind it.`}
        </p>
        <a className={s.email} href={`mailto:${profile.email}`}>
          {profile.email}
        </a>
        <ul className={s.contactLinks}>
          <li>
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              LinkedIn ↗
            </a>
          </li>
          <li>
            <a href={profile.github} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
          </li>
          <li>
            <a href={profile.cv} target="_blank" rel="noreferrer">
              CV (PDF) ↗
            </a>
          </li>
          <li>
            <a href="#surface">Back to the top ↑</a>
          </li>
        </ul>
      </section>
    </>
  );
}
