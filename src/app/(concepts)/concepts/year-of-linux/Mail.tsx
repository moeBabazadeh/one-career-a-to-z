import Image from 'next/image';
import { useState } from 'react';
import { db, profile } from '../_shared/data';
import { Icon } from './icons';
import s from './desktop.module.scss';

const address = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** A mail composer addressed to Moe. Send hands the message to the visitor's own mail app. */
export default function Mail() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [cv, setCv] = useState(false);
  const fullBody = `${body}${cv ? `${body ? '\n\n' : ''}(Re: your CV, ${db.person.url}${profile.cv})` : ''}`;
  const href = `mailto:${profile.email}?subject=${encodeURIComponent(subject || `Hello ${db.person.first}`)}${fullBody ? `&body=${encodeURIComponent(fullBody)}` : ''}`;
  return (
    <div className={s.app}>
      <div className={s.toolbar} role="toolbar" aria-label="Compose">
        <a href={href} className={s.toolBtn} data-send>
          <Icon name="mail" size={22} />
          <span>Send</span>
        </a>
        <button type="button" className={s.toolBtn} aria-pressed={cv} onClick={() => setCv(!cv)}>
          <Icon name="pdf" size={22} />
          <span>{cv ? 'CV attached' : 'Mention CV'}</span>
        </button>
        <a href={profile.cv} target="_blank" rel="noreferrer" className={s.toolBtn}>
          <Icon name="document" size={22} />
          <span>Open CV</span>
        </a>
      </div>
      <div className={s.mail}>
        <div className={s.compose}>
          <div className={s.field}>
            <span>To:</span>
            <span className={s.recipient}>
              <Icon name="user" size={16} />
              {profile.name} &lt;{profile.email}&gt;
            </span>
          </div>
          <label className={s.field}>
            <span>Subject:</span>
            <input
              type="text"
              className={s.entry}
              value={subject}
              placeholder={`Hello ${db.person.first}`}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <textarea
            aria-label="Message"
            className={`${s.entry} ${s.mailBody}`}
            value={body}
            placeholder="Tell me what you’re building…"
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <aside className={s.vcard} aria-label="Contact card">
          <Image src={db.person.photo} width={600} height={600} alt={profile.name} />
          <p className={s.vName}>{profile.name}</p>
          <p className={s.vRole}>
            {profile.role},{' '}
            <a href={profile.companyUrl} target="_blank" rel="noreferrer">
              {profile.company}
            </a>
          </p>
          <ul>
            <li>
              <Icon name="mail" size={16} />
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </li>
            <li>
              <Icon name="browser" size={16} />
              <a href={profile.linkedin} target="_blank" rel="noreferrer">
                {address(profile.linkedin)}
              </a>
            </li>
            <li>
              <Icon name="code" size={16} />
              <a href={profile.github} target="_blank" rel="noreferrer">
                {address(profile.github)}
              </a>
            </li>
            <li>
              <Icon name="pdf" size={16} />
              <a href={profile.cv} target="_blank" rel="noreferrer">
                resume.pdf
              </a>
            </li>
          </ul>
        </aside>
      </div>
      <p className={s.statusbar}>
        <span>Send opens your own mail program, addressed to {profile.email}.</span>
      </p>
    </div>
  );
}
