import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { concept } from '../_shared/concepts';
import { db, fmt, hardware, profile } from '../_shared/data';
import { HOST, KERNEL, PKGS, USER, roleFolder } from './fs';
import s from './desktop.module.scss';

// GRUB, a boot log written from the facts, then GDM signing Moe in by itself. Escape, Space,
// a click or the Skip button jumps straight to the desktop.

const ENTRIES = ['Arch Linux', 'Arch Linux (fallback initramfs)', 'MoeOS 95 (retired)'];

const { roles: ROLES, education, awards } = db;

const LOG: { ok: boolean; text: string }[] = [
  { ok: false, text: `Linux version ${KERNEL} (${USER}@${HOST}) #1 SMP PREEMPT` },
  { ok: false, text: ':: Running Hook [udev]' },
  { ok: true, text: `Mounted /home/${USER}.` },
  ...[...db.roleList].reverse().map((r) => ({
    ok: true,
    text: `Started ${roleFolder(r).toLowerCase()}.service: ${db.titlePath(r)} (${fmt.yearSpan(r.from, r.to)}).`,
  })),
  { ok: true, text: `Reached target ${db.degreeTitle(education.bsc)}.` },
  {
    ok: true,
    text: `Reached target ${awards.robocup.place}, ${awards.robocup.event} ${awards.robocup.year}.`,
  },
  { ok: true, text: `Reached target ${db.degreeTitle(education.msc)}.` },
  ...hardware.map((d) => ({
    ok: true,
    text: `Started ${d.tag.toLowerCase()}: ${d.name}, ${d.figures[0].toLowerCase()}.`,
  })),
  {
    ok: true,
    text: `Loaded ${PKGS.length} upstream patches (${db.downloads.weekly.short} downloads a week).`,
  },
  { ok: true, text: `Started ${ROLES.neuroject.org} as ${db.current.title}.` },
  { ok: true, text: 'Started Compiz (cube, wobbly, animation, expo).' },
  { ok: true, text: 'Started GNOME Display Manager.' },
];

const LINE_MS = 55;

export default function Boot({
  onDone,
  from = 'grub',
}: {
  onDone: () => void;
  from?: 'grub' | 'gdm';
}) {
  const [phase, setPhase] = useState<'grub' | 'error' | 'log' | 'gdm'>(from);
  const [pick, setPick] = useState(0);
  const [count, setCount] = useState(3);
  const [shown, setShown] = useState(0);
  const [dots, setDots] = useState(0);
  const [pressed, setPressed] = useState(false);
  const done = useRef(onDone);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    root.current?.focus();
  }, []);

  // Each phase runs on its own timers.
  useEffect(() => {
    const t: number[] = [];
    if (phase === 'grub') {
      t.push(
        window.setTimeout(() => setCount(2), 450),
        window.setTimeout(() => setCount(1), 900),
        window.setTimeout(() => setPhase('log'), 1350),
      );
    } else if (phase === 'log') {
      LOG.forEach((_, i) => t.push(window.setTimeout(() => setShown(i + 1), 80 + i * LINE_MS)));
      t.push(window.setTimeout(() => setPhase('gdm'), 80 + LOG.length * LINE_MS + 380));
    } else if (phase === 'gdm') {
      for (let i = 1; i <= 8; i++) t.push(window.setTimeout(() => setDots(i), 500 + i * 70));
      t.push(window.setTimeout(() => setPressed(true), 1250));
      t.push(window.setTimeout(() => done.current(), 1650));
    }
    return () => t.forEach((id) => window.clearTimeout(id));
  }, [phase]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      done.current();
      return;
    }
    if (phase === 'grub') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCount(-1);
        setPick((pick + (e.key === 'ArrowDown' ? 1 : ENTRIES.length - 1)) % ENTRIES.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setPhase(pick === 2 ? 'error' : 'log');
      }
    } else if (phase === 'error') {
      setPick(0);
      setPhase('grub');
    } else if (e.key !== 'Tab') done.current();
  };

  return (
    <div
      ref={root}
      className={`${s.boot} ${phase === 'gdm' ? s.bootGdm : ''}`}
      role="dialog"
      aria-label="Starting up"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {(phase === 'grub' || phase === 'error') && (
        <div className={s.grub}>
          <p>{'    GNU GRUB  version 0.97  (640K lower / 3072K upper memory)'}</p>
          <div className={s.grubBox} role="listbox" aria-label="Operating systems">
            {ENTRIES.map((e, i) => (
              <p
                key={e}
                role="option"
                aria-selected={i === pick}
                className={i === pick ? s.grubOn : undefined}
                onClick={() => {
                  setPick(i);
                  setCount(-1);
                }}
                onDoubleClick={() => setPhase(i === 2 ? 'error' : 'log')}
              >
                {e}
              </p>
            ))}
          </div>
          {phase === 'error' ? (
            <p className={s.grubHelp}>
              {'    Error 17: Cannot mount selected partition'}
              <br />
              {'    That desktop was retired. Press any key to continue...'}
            </p>
          ) : (
            <p className={s.grubHelp}>
              {'    Use the ↑ and ↓ keys to select which entry is highlighted.'}
              <br />
              {"    Press enter to boot the selected OS, 'e' to edit the"}
              <br />
              {'    commands before booting, or Escape to skip all this.'}
              {count > 0 && (
                <>
                  <br />
                  <br />
                  {`    The highlighted entry will be booted automatically in ${count} second${count === 1 ? '' : 's'}.`}
                </>
              )}
            </p>
          )}
        </div>
      )}
      {phase === 'log' && (
        <pre className={s.bootLog} aria-live="polite">
          {LOG.slice(0, shown).map((l, i) => (
            <span key={i}>
              {l.ok ? (
                <>
                  [<b>{'  OK  '}</b>] {l.text}
                </>
              ) : (
                l.text
              )}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
      {phase === 'gdm' && (
        <div className={s.gdm}>
          <div className={s.gdmBox}>
            <p className={s.gdmHost}>Welcome to {HOST}</p>
            <div className={s.gdmUser}>
              <Image src={db.person.photo} width={600} height={600} alt="" />
              <div>
                <b>{profile.name}</b>
                <span>
                  {profile.role}, {profile.company}
                </span>
              </div>
            </div>
            <label className={s.gdmPass}>
              <span>Password:</span>
              <span className={s.entry} aria-label="Password">
                {'●'.repeat(dots)}
              </span>
            </label>
            <div className={s.gdmBtns}>
              <span className={`${s.btn} ${pressed ? s.btnPressed : ''}`}>Log In</span>
            </div>
          </div>
          <p className={s.gdmFoot}>
            {HOST} · {concept('year-of-linux').name}, concept {concept('year-of-linux').letter} · ©{' '}
            {profile.fullName}, {db.person.since} → {db.asOf.y}
          </p>
        </div>
      )}
      <button type="button" className={s.skip} onClick={() => done.current()}>
        Skip
      </button>
    </div>
  );
}
