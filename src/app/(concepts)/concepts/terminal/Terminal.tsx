'use client';

import { useEffect, useRef, useState } from 'react';
import {
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
} from '../_shared/data';
import { useInView, useReducedMotion } from '../_shared/hooks';
import { projectLinks } from '../_shared/links';
import s from './terminal.module.scss';

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
const link = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noreferrer">${escapeHtml(text)}</a>`;
const pad = (text: string, width: number) => text + ' '.repeat(Math.max(1, width - text.length));
const lower = (text: string) => text.toLowerCase();

/* ------------------------------------------------------------------ facts */

const { person, current, commits, yearsBuilding } = db;
const { freelance, niknam, alget, zeroone, neuroject, neuroship } = db.roles;
const { logger, attendumReader: reader, attendumBeacon: beacon, epc, plc } = db.devices;
const { robocup } = db.awards;
const { bsc } = db.education;
const paper = db.papers.inverter;
const attendum = db.products.attendum.title;

// Illustrative: no start date for the Attendum fleet is on record, so its uptime isn't derived.
const ATTENDUM_UPTIME = '3y11m';

/** A figure without its "+": "0.5B". */
const bare = (f: db.Figure) => f.short.replace(/\+$/, '');
/** A profile link as people type it: "github.com/moeBabazadeh". */
const address = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
/** A title as a command-line flag: "Chief Full Stack Engineer" is "chief-fullstack". */
const flag = (title: string) =>
  lower(title)
    .replace(/ engineer$/, '')
    .replace('full stack', 'fullstack')
    .replaceAll(' ', '-');

/* ------------------------------------------------------------------ boot log */

// Timestamps are years since he started building, counted from the start of each month,
// so [3.300000] is April, three years in.
const stamp = (d: db.YearMonth) =>
  `${(d.y + ((d.m ?? 1) - 1) / 12 - person.since).toFixed(1)}00000`;
const [league, robocupEvent] = robocup.event.split(' ');
const [deminer] = robocup.challenge.split(' ');
// The year the Attendum reader firmware shipped.
const attendumYear = Number(db.builds.find((b) => b.tech.includes(reader.chip))?.year);

const BOOT: [string, string, string][] = [
  [stamp({ y: person.since }), lower(freelance.org), 'web stack up · PHP, JavaScript, jQuery'],
  [stamp(bsc.from), 'uni', `${bsc.degree} ${lower(bsc.field)}, ${lower(bsc.focus)}`],
  [
    stamp(robocup.date),
    lower(league),
    `${robocupEvent} ${lower(deminer)} challenge ...... <span class="g">${robocup.place}</span>`,
  ],
  [stamp(niknam.from), lower(niknam.short), 'IoT platforms, GPS tracking, devices'],
  [stamp(paper.date), lower(paper.venue), `grid-tie multicell inverter · ${paper.id}`],
  [stamp(alget.from), lower(alget.org.split('.')[0]), 'React marketplace for local grocers'],
  [stamp(zeroone.from), zeroone.org.replace('&', 'and'), 'LMS + proctoring · Azure Face API'],
  [
    stamp({ y: attendumYear }),
    lower(attendum),
    `${reader.chip} readers, ${beacon.chip} beacons, iOS/Android`,
  ],
  [
    stamp(neuroject.from),
    lower(neuroject.org),
    `${lower(current.previous.title)} · ${db.products.neurobuild.title}`,
  ],
  [stamp(neuroship.from), lower(neuroship.org), `${lower(db.titleOf(neuroship))} · contract`],
  [
    stamp(current.since),
    lower(current.company),
    `${current.title} <span class="g">[  OK  ]</span>`,
  ],
];

/* ------------------------------------------------------------------ top */

interface Proc {
  pid: number;
  base: number;
  cpu: number;
  time: string;
  cmd: string;
  color: string;
}

/** Time in a role as of the facts' date, as years:months: "0:05mo". */
const tenure = (from: db.YearMonth) => {
  const months = fmt.monthsBetween(from, db.asOf);
  return `${Math.floor(months / 12)}:${String(months % 12).padStart(2, '0')}mo`;
};
const plcChip = db.devices.plc.chip;

// CPU shares are illustrative.
const PROCS: Proc[] = [
  {
    pid: 1,
    base: 58,
    cpu: 58,
    time: tenure(current.since),
    cmd: `${lower(current.company)} --role=${flag(current.title)} --ai=on`,
    color: 'g',
  },
  {
    pid: 2,
    base: 20,
    cpu: 20,
    time: tenure(neuroship.from),
    cmd: `${lower(neuroship.org)} --role=${flag(db.titleOf(neuroship))}`,
    color: 'b',
  },
  {
    pid: 3,
    base: 7,
    cpu: 7,
    time: `${logger.online.n}y+`,
    cmd: `${lower(logger.name)}-fleet --stations=${logger.stations.n} --gsm`,
    color: 'y',
  },
  {
    pid: 4,
    base: 4,
    cpu: 4,
    time: ATTENDUM_UPTIME,
    cmd: `${lower(attendum)} --${lower(reader.chip)} --${lower(beacon.chip)}`,
    color: 'm',
  },
  {
    pid: 5,
    base: 2,
    cpu: 2,
    time: 'prod',
    cmd: `${lower(epc.name)} --pressure --flow`,
    color: 'c',
  },
  {
    pid: 6,
    base: 2,
    cpu: 2,
    time: 'prod',
    cmd: `${lower(plc.name).replace(' ', '-')} --mcu=${lower(plcChip)}`,
    color: 'c',
  },
];
const RUNNING = db.roleList.filter((r) => !r.to).length;

const bar = (frac: number, width: number) => {
  const n = Math.max(0, Math.min(width, Math.round(frac * width)));
  return '|'.repeat(n) + ' '.repeat(width - n);
};

function renderTop(procs: Proc[]) {
  const total = Math.round(procs.reduce((sum, p) => sum + p.cpu, 0));
  let out = `<span class="d">  CPU</span>[<span class="g">${bar(total / 100, 24)}</span>${String(total).padStart(3)}%]  <span class="d">Tasks:</span> ${procs.length}, ${RUNNING} running\n`;
  out += `<span class="d">  Mem</span>[<span class="b">${bar(0.84, 24)}</span>${bare(logger.records)}]  <span class="d">Load:</span> ${bare(commits.total)} commits\n`;
  out += `<span class="d">  Uptime:</span> ${yearsBuilding} years <span class="d">· ${hardware.length} devices in production</span>\n\n`;
  out += `<span class="hdr">  PID USER  CPU%  TIME+   COMMAND                        </span>\n`;
  for (const p of procs)
    out += `  ${String(p.pid).padStart(3)} moe  ${p.cpu.toFixed(1).padStart(5)}  ${pad(p.time, 8)}<span class="${p.color}">${p.cmd}</span>\n`;
  return out;
}

/* ------------------------------------------------------------------ logger feed */

// A simulated feed; the counter starts just past the records the fleet has logged.
function feedLine(record: number) {
  const st = String(1 + Math.floor(Math.random() * 52)).padStart(2, '0');
  const ts = new Date().toTimeString().slice(0, 8);
  const temp = (8 + Math.random() * 14).toFixed(1);
  const hum = Math.round(45 + Math.random() * 45);
  const pres = (1004 + Math.random() * 18).toFixed(1);
  const rssi = -(55 + Math.round(Math.random() * 30));
  return `<span class="d">${ts}</span> <span class="y">st-${st}</span> t=${temp}C h=${hum}% p=${pres}hPa <span class="d">rssi=${rssi}</span> <span class="g">#${record.toLocaleString('en-US')}</span>`;
}

/* ------------------------------------------------------------------ shell */

const NEOFETCH_LOGO = [' __  __ ___ ', '|  \\/  | _ )', '| |\\/| | _ \\', '|_|  |_|___/'];

const COMMANDS: Record<string, () => string> = {
  help: () =>
    '<span class="d">commands:</span> about  work  hardware  oss  contact  cv  neofetch  man moe  clear\n<span class="d">try:</span> sudo hire moe',
  ls: () => 'about  work  hardware  oss  contact  cv',
  whoami: () => 'moe',
  about: () => escapeHtml(about[0]),
  work: () =>
    [...featuredProjects, ...otherProjects.slice(0, 4)]
      .map((p) => {
        const first = projectLinks(p.links)[0];
        return `${first ? link(first.url, p.title) : escapeHtml(p.title)}${' '.repeat(Math.max(1, 34 - p.title.length))}<span class="d">${escapeHtml(p.tech.slice(0, 3).join(', '))}</span>`;
      })
      .join('\n'),
  hardware: () =>
    hardware
      .map(
        (d) =>
          `<span class="y">${pad(d.name, 18)}</span>${escapeHtml(d.kind)} <span class="d">· ${escapeHtml(d.figures.join(' · '))}</span>`,
      )
      .join('\n'),
  oss: () =>
    oss
      .map(
        (c) =>
          `${link(c.url, pad(c.repo, 38))}<span class="y">★${c.stars.padEnd(5)}</span> <span class="d">${c.kind.toLowerCase()}</span>`,
      )
      .join('\n'),
  contact: () =>
    `email     ${escapeHtml(profile.email)}\nlinkedin  ${link(profile.linkedin, address(profile.linkedin))}\ngithub    ${link(profile.github, address(profile.github))}`,
  cv: () => link(profile.cv, 'resume.pdf'),
  neofetch: () => {
    const info = [
      `<span class="g">moe</span>@<span class="g">babazadeh</span>`,
      '<span class="d">---------------</span>',
      `<span class="b">Role</span>: ${current.title} @ ${profile.company}`,
      `<span class="b">Uptime</span>: ${yearsBuilding} years (since ${person.since})`,
      `<span class="b">Kernel</span>: ${bsc.field}, ${lower(bsc.focus)}`,
      '<span class="b">Shell</span>: TypeScript, Python, PHP, C',
      `<span class="b">Packages</span>: ${commits.total.short} commits since ${commits.since}`,
      `<span class="b">Devices</span>: ${hardware.length} in production`,
      `<span class="b">Records</span>: ${logger.records.short}`,
    ];
    return info
      .map((line, i) => `<span class="y">${(NEOFETCH_LOGO[i] ?? '').padEnd(14)}</span>${line}`)
      .join('\n');
  },
  'sudo hire moe': () =>
    `<span class="d">[sudo] password for recruiter:</span> ********\n<span class="g">access granted.</span> Write to ${escapeHtml(profile.email)}`,
};

interface Line {
  id: number;
  html: string;
}

function Session() {
  const reduced = useReducedMotion();
  const [paneRef, visible] = useInView<HTMLDivElement>(false, 0.05);
  const [procs, setProcs] = useState(PROCS);
  const [feed, setFeed] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [clock, setClock] = useState('--:--');
  const record = useRef(logger.records.n + 12_408_113);
  const nextId = useRef(0);
  const history = useRef<string[]>([]);
  const hIndex = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const out = useRef<HTMLDivElement>(null);

  const print = (html: string) => setLines((prev) => [...prev, { id: nextId.current++, html }]);

  const run = (raw: string) => {
    const cmd = raw.trim();
    print(`<span class="g">moe@babazadeh</span>:<span class="b">~</span>$ ${escapeHtml(cmd)}`);
    if (!cmd) return;
    if (cmd === 'clear') {
      setLines([]);
      return;
    }
    if (cmd === 'man moe') {
      print('<span class="d">opening MOE(1) below…</span>');
      document.getElementById('man')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    const fn = COMMANDS[cmd.toLowerCase()];
    print(
      fn
        ? fn()
        : `<span class="r">zsh: command not found:</span> ${escapeHtml(cmd)} <span class="d">(try help)</span>`,
    );
  };

  // First frame: a filled feed and a help screen, so the session never opens empty.
  useEffect(() => {
    const first: string[] = [];
    for (let i = 0; i < 14; i++) {
      record.current += 1 + Math.floor(Math.random() * 4);
      first.push(feedLine(record.current));
    }
    const timer = window.setTimeout(() => {
      setFeed(first);
      setLines([
        {
          id: nextId.current++,
          html: '<span class="g">moe@babazadeh</span>:<span class="b">~</span>$ help',
        },
        { id: nextId.current++, html: COMMANDS.help() },
      ]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        `${d.toTimeString().slice(0, 5)} ${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-GB', { month: 'short' })}-${String(d.getFullYear()).slice(2)}`,
      );
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    const feedTimer = window.setInterval(() => {
      record.current += 1 + Math.floor(Math.random() * 4);
      const line = feedLine(record.current);
      setFeed((prev) => [...prev.slice(-13), line]);
    }, 900);
    const topTimer = window.setInterval(() => {
      setProcs((prev) =>
        prev.map((p) => ({
          ...p,
          cpu: Math.max(0.1, p.base + (Math.random() - 0.5) * p.base * 0.3),
        })),
      );
    }, 1500);
    return () => {
      window.clearInterval(feedTimer);
      window.clearInterval(topTimer);
    };
  }, [reduced, visible]);

  useEffect(() => {
    if (out.current) out.current.scrollTop = out.current.scrollHeight;
  }, [lines]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (e.key === 'Enter') {
      if (el.value.trim()) history.current.push(el.value);
      hIndex.current = history.current.length;
      run(el.value);
      el.value = '';
    } else if (e.key === 'ArrowUp' && history.current.length) {
      e.preventDefault();
      hIndex.current = Math.max(0, hIndex.current - 1);
      el.value = history.current[hIndex.current];
    } else if (e.key === 'ArrowDown' && history.current.length) {
      e.preventDefault();
      hIndex.current = Math.min(history.current.length, hIndex.current + 1);
      el.value = history.current[hIndex.current] ?? '';
    }
  };

  return (
    <div ref={paneRef} className={s.session}>
      <div className={s.grid}>
        <section className={`${s.pane} ${s.boot}`} aria-label="Boot log">
          <span className={s.paneTitle}>
            <b>0:boot</b> · dmesg
          </span>
          <pre>
            {BOOT.map(([ts, sys, msg]) => (
              <span key={ts} className={s.bootLine}>
                <span className="d">[{ts.padStart(10)}]</span> <span className="b">{sys}</span>:{' '}
                <span dangerouslySetInnerHTML={{ __html: msg }} />
                {'\n'}
              </span>
            ))}
            <span className="g">moe@babazadeh</span>:<span className="b">~</span>$ whoami{'\n'}
          </pre>
          <p className={s.whoami}>{profile.name}</p>
          <p className={s.whoamiSub}>
            {`${current.title} at `}
            {profile.company}. I architect AI-driven platforms, and the hardware under them.
          </p>
        </section>

        <section className={`${s.pane} ${s.top}`} aria-label="Roles as processes">
          <span className={s.paneTitle}>
            <b>1:top</b> · roles
          </span>
          <pre dangerouslySetInnerHTML={{ __html: renderTop(procs) }} />
        </section>

        <section
          className={`${s.pane} ${s.shell} ${s.active}`}
          aria-label="Shell"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('a'))
              input.current?.focus({ preventScroll: true });
          }}
        >
          <span className={s.paneTitle}>
            <b>3:shell</b> · zsh
          </span>
          <div className={s.out} ref={out} aria-live="polite">
            {lines.map((l) => (
              <div key={l.id} dangerouslySetInnerHTML={{ __html: l.html }} />
            ))}
          </div>
          <label className={s.prompt}>
            <span>
              <span className="g">moe@babazadeh</span>:<span className="b">~</span>$
            </span>
            <input
              ref={input}
              type="text"
              autoComplete="off"
              spellCheck={false}
              aria-label="Shell command"
              onKeyDown={onKeyDown}
            />
          </label>
        </section>

        <section className={`${s.pane} ${s.tail}`} aria-label="Weather station feed, simulated">
          <span className={s.paneTitle}>
            <b>2:logger</b> · tail -f stations.log <span className="d">(simulated feed)</span>
          </span>
          <pre dangerouslySetInnerHTML={{ __html: feed.join('\n') }} />
        </section>
      </div>

      <footer className={s.status}>
        <span className={s.sess}>babazadeh</span>
        <span className={s.wins}>
          <a href="#man">0:boot</a>
          <a href="#man-experience">1:top</a>
          <a href="#man-hardware">2:logger</a>
          <span className={s.cur}>3:shell*</span>
        </span>
        <span>
          <span className="d">{`${lower(current.company)} · ${lower(current.title)} ·`}</span>{' '}
          {clock}
        </span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ man page */

function ManSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={s.manSection}>
      <h2>{title}</h2>
      <div className={s.manBody}>{children}</div>
    </section>
  );
}

export default function Terminal() {
  return (
    <div className={s.root}>
      <Session />

      <article id="man" className={s.man} aria-label="Manual page">
        <header className={s.manHead}>
          <span>MOE(1)</span>
          <span>General Commands Manual</span>
          <span>MOE(1)</span>
        </header>

        <ManSection title="NAME">
          <p>
            <b>moe</b>
            {` — ${current.title}, engineer, and builder of platforms and the hardware under them`}
          </p>
        </ManSection>

        <ManSection title="SYNOPSIS">
          <p>
            <b>moe</b> [<u>--role</u>
            {`=${lower(current.title)}] [`}
            <u>--company</u>
            {`=${lower(current.company)}] [`}
            <u>--since</u>
            {`=${person.since}] [`}
            <u>--stack</u>=typescript,python,php,c]
          </p>
        </ManSection>

        <ManSection title="DESCRIPTION">
          {about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </ManSection>

        <ManSection id="man-experience" title="EXPERIENCE">
          {jobs.map((job) => (
            <div key={job.company} className={s.entry}>
              <p className={s.entryHead}>
                <b>{job.company}</b> <span className={s.dim}>({job.range})</span>
                <br />
                <u>{job.title}</u>
              </p>
              <ul>
                {job.duties.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          ))}
        </ManSection>

        <ManSection title="PROJECTS">
          {[...featuredProjects, ...otherProjects].map((p) => (
            <div key={p.title} className={s.entry}>
              <p className={s.entryHead}>
                <b>{p.title}</b> <span className={s.dim}>[{p.tech.join(', ')}]</span>
              </p>
              <p>{p.description}</p>
              {projectLinks(p.links).length > 0 && (
                <p className={s.links}>
                  {projectLinks(p.links).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                      {l.label}
                    </a>
                  ))}
                </p>
              )}
            </div>
          ))}
        </ManSection>

        <ManSection id="man-hardware" title="HARDWARE">
          {hardware.map((d) => (
            <div key={d.tag} className={s.entry}>
              <p className={s.entryHead}>
                <b>{d.name}</b>{' '}
                <span className={s.dim}>
                  {d.tag} · {d.kind}
                </span>
              </p>
              <p>
                {d.detail} {d.figures.join(' · ')}.
              </p>
            </div>
          ))}
        </ManSection>

        <ManSection title="OPEN SOURCE">
          {oss.map((c) => (
            <div key={c.repo} className={s.entry}>
              <p className={s.entryHead}>
                <a href={c.url} target="_blank" rel="noreferrer">
                  <b>{c.repo}</b>
                </a>{' '}
                <span className={s.dim}>
                  ({c.year}, ★{c.stars}, {c.weekly}/week)
                </span>
              </p>
              <p>
                {c.change} {c.impact}
              </p>
            </div>
          ))}
        </ManSection>

        <ManSection title="EDUCATION">
          {roots.map((r) => (
            <p key={r.title}>
              <b>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}
              </b>{' '}
              <span className={s.dim}>({r.year})</span> — {r.detail}
            </p>
          ))}
        </ManSection>

        <ManSection title="ENVIRONMENT">
          <p>{skills.join(', ')}.</p>
        </ManSection>

        <ManSection title="SEE ALSO">
          <p>
            <a href={profile.github} target="_blank" rel="noreferrer">
              github
            </a>
            (1),{' '}
            <a href={profile.linkedin} target="_blank" rel="noreferrer">
              linkedin
            </a>
            (1),{' '}
            <a href={profile.cv} target="_blank" rel="noreferrer">
              resume
            </a>
            (5),{' '}
            <a href={profile.companyUrl} target="_blank" rel="noreferrer">
              {lower(current.company)}
            </a>
            (7)
          </p>
        </ManSection>

        <ManSection title="AUTHOR">
          <p>
            {profile.fullName} &lt;<a href={`mailto:${profile.email}`}>{profile.email}</a>&gt;
          </p>
        </ManSection>

        <footer className={s.manHead}>
          <span>{person.site}</span>
          <span>{fmt.month(db.asOf)}</span>
          <span>MOE(1)</span>
        </footer>
      </article>
    </div>
  );
}
