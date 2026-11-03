'use client';

// Contacts (Moe's card, with a real vCard to share) and Mail (a compose sheet that hands a
// filled-in message to the visitor's own mail app).
import Image from 'next/image';
import { useState } from 'react';
import { db, profile } from '../../_shared/data';
import { current, host, mailto, vcard, vcardName } from '../content';
import { Icon } from '../icons';
import { Button, copy, Group, Row, save, Screen, type AppCtx } from '../ui';
import s from '../apps.module.scss';

const linkedinPath = new URL(db.person.linkedin).pathname.replace(/\/$/, '');

export function Contacts({ ctx }: { ctx: AppCtx }) {
  const share = () => {
    save(vcardName, vcard(), 'text/vcard');
    ctx.toast('Contact card saved');
  };
  const copyEmail = async () => {
    if (await copy(db.person.email)) ctx.toast('Email address copied');
  };

  return (
    <Screen
      ctx={ctx}
      title={profile.name}
      large={false}
      className={s.contact}
      actions={
        <button type="button" className={s.barButton} onClick={share}>
          Share
        </button>
      }
    >
      <header className={s.card}>
        <Image
          className={s.avatar}
          src={db.person.photo}
          alt={`${profile.name}`}
          width={240}
          height={240}
          priority={false}
        />
        <h3 className={s.cardName}>{profile.name}</h3>
        <p className={s.cardRole}>
          {current.title}, {current.company}
        </p>
        <p className={s.cardSub}>{profile.headline}</p>
      </header>

      <div className={s.quick} role="group" aria-label="Contact">
        <a href={`mailto:${db.person.email}`}>
          <Icon name="mail" size={22} />
          <span>mail</span>
        </a>
        <a href={db.person.linkedin} target="_blank" rel="noopener noreferrer">
          <Icon name="person" size={22} />
          <span>LinkedIn</span>
        </a>
        <a href={db.person.github} target="_blank" rel="noopener noreferrer">
          <Icon name="code" size={22} />
          <span>GitHub</span>
        </a>
        <a href={db.person.cv} target="_blank" rel="noopener noreferrer">
          <Icon name="pdf" size={22} />
          <span>CV</span>
        </a>
      </div>

      <Group>
        <Row
          label="email"
          sub={db.person.email}
          href={`mailto:${db.person.email}`}
          aria={`Email ${db.person.email}`}
        />
        <Row
          label="LinkedIn"
          sub={`${host(db.person.linkedin)}${linkedinPath}`}
          href={db.person.linkedin}
        />
        <Row label="GitHub" sub={`@${db.person.githubUser}`} href={db.person.github} />
        <Row label="homepage" sub={db.person.site} href={db.person.url} />
        {current.companyUrl && (
          <Row
            label="work"
            sub={`${current.title}, ${current.company}`}
            href={current.companyUrl}
          />
        )}
      </Group>

      <Group>
        <Row icon="pdf" label="CV" sub={db.person.cv.split('/').pop()} href={db.person.cv} />
        <Row icon="download" label="Download CV" href={db.person.cv} download />
      </Group>

      <Group header="notes">
        <li className={s.prose}>
          <p>{profile.tagline}</p>
          <p>{profile.lede}</p>
        </li>
      </Group>

      <Group>
        <Row label="Send Message" onClick={() => ctx.open('mail')} />
        <Row label="Copy Email Address" onClick={copyEmail} />
        <Row label="Share Contact" sub={`${vcardName}, vCard`} onClick={share} />
        <Row
          label="Open in Calendar"
          sub="Every role, with dates"
          onClick={() => ctx.open('calendar', ['event/' + current.role.id])}
        />
      </Group>
    </Screen>
  );
}

export function Mail({ ctx }: { ctx: AppCtx }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const href = mailto(subject, body);
  const ready = subject.trim() || body.trim();

  return (
    <Screen
      ctx={ctx}
      title="New Message"
      large={false}
      className={s.compose}
      lead={
        <button type="button" className={s.barButton} onClick={ctx.home}>
          Cancel
        </button>
      }
      actions={
        <a
          className={s.send}
          href={href}
          aria-label="Send: opens your mail app with this message"
          data-ready={ready ? true : undefined}
        >
          <Icon name="send" size={18} />
        </a>
      }
    >
      <div className={s.fields}>
        <div className={s.field}>
          <span>To:</span>
          <span className={s.to}>
            {profile.name}
            <small>{db.person.email}</small>
          </span>
          <button
            type="button"
            className={s.fieldBtn}
            aria-label="Copy address"
            onClick={async () => {
              if (await copy(db.person.email)) ctx.toast('Email address copied');
            }}
          >
            <Icon name="copy" size={17} />
          </button>
        </div>
        <label className={s.field}>
          <span>Subject:</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Hello" />
        </label>
        <textarea
          className={s.body}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Message"
          placeholder="Write to Moe"
          rows={10}
        />
      </div>
      <div className={s.composeFoot}>
        <Button href={href} icon="send">
          Send with your mail app
        </Button>
        <p className={s.hint}>
          Send opens your own mail app with this message filled in, addressed to {db.person.email}.
        </p>
      </div>
    </Screen>
  );
}
