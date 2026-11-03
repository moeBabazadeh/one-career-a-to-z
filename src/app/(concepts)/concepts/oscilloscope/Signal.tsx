'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NOW,
  about,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roles,
  skills,
  stats,
} from '../_shared/data';
import {
  useAnimationFrame,
  useInView,
  useReducedMotion,
  useScaledCanvas,
  useScheme,
} from '../_shared/hooks';
import { projectLinks } from '../_shared/links';
import {
  COL,
  drawForecast,
  drawScope,
  drawSpark,
  palette,
  type Ch,
  type Palette,
  type SparkKind,
} from './draw';
import s from './signal.module.scss';
import { concept } from '../_shared/concepts';

const { person, asOf, yearsBuilding } = db;
const smartclaim = db.products.smartclaim;
const [smartclaimApi, smartclaimLlm, smartclaimVectors] = smartclaim.tech;
/** The scope's model number: his initials and the year he started building. */
const MODEL = `${person.name
  .split(' ')
  .map((w) => w[0])
  .join('')}-${person.since}`;
/** The span the scope has sampled: from the start to the facts' year. */
const SAMPLED = `${person.since} → ${asOf.y}`;

type Draw = (ctx: CanvasRenderingContext2D, t: number, colors: Palette) => void;

/** A canvas that animates while on screen, and holds still when paused or for reduced motion. */
function LiveCanvas({
  W,
  H,
  draw,
  label,
  className,
  paused = false,
}: {
  W: number;
  H: number;
  draw: Draw;
  label: string;
  className?: string;
  paused?: boolean;
}) {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [wrap, visible] = useInView<HTMLDivElement>(false, 0.05);
  const time = useRef(3);
  const last = useRef(0);
  const drawRef = useRef(draw);
  const pausedRef = useRef(paused);
  // The screen's colours, read from the tokens once and again when the scheme changes.
  const colors = useRef<Palette | null>(null);
  useEffect(() => {
    drawRef.current = draw;
    pausedRef.current = paused;
  });

  const paint = (ctx: CanvasRenderingContext2D) =>
    drawRef.current(ctx, time.current, (colors.current ??= palette(ctx.canvas)));
  const canvas = useScaledCanvas(W, H, paint);

  useAnimationFrame((sec) => {
    const dt = last.current ? Math.min(0.05, sec - last.current) : 0;
    last.current = sec;
    if (!pausedRef.current) time.current += dt;
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paint(ctx);
  }, visible && !reduced);

  useEffect(() => {
    colors.current = null;
  }, [scheme]);

  // Redraw once when the drawing or the scheme changes, so toggles show up even while still.
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) draw(ctx, time.current, (colors.current ??= palette(ctx.canvas)));
  }, [draw, canvas, scheme]);

  return (
    <div ref={wrap} className={className}>
      <canvas ref={canvas} role="img" aria-label={label} style={{ aspectRatio: `${W} / ${H}` }} />
    </div>
  );
}

const SPARKS: SparkKind[] = ['weather', 'step', 'square', 'burst', 'beacon'];
const chOf = (i: number) => ((i % 4) + 1) as Ch;
const SPARK_DRAWS: Draw[] = SPARKS.map(
  (kind, i) => (ctx, t, colors) => drawSpark(ctx, kind, t, chOf(i), colors),
);

/* ------------------------------------------------------------------ logic analyzer */

const LA_ROWS = [...roles]
  .sort((a, b) => a.start - b.start)
  .map((r, i) => ({ ...r, color: COL[chOf(i)] }));
// The axis runs from the year he started to the end of the facts' year.
const LX0 = 190,
  LX1 = 980,
  LY0 = person.since,
  LY1 = asOf.y + 1,
  LANE = 58;
const lx = (y: number) => LX0 + ((y - LY0) / (LY1 - LY0)) * (LX1 - LX0);
const LA_H = 34 + LA_ROWS.length * LANE + 30;

function LogicAnalyzer() {
  const svg = useRef<SVGSVGElement>(null);
  const cursor = useRef<SVGGElement>(null);
  const readout = useRef<SVGTextElement>(null);

  const hide = () => {
    if (cursor.current) cursor.current.style.opacity = '0';
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    if (!el || !cursor.current || !readout.current) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 1000;
    if (x < LX0 || x > LX1) return hide();
    cursor.current.style.opacity = '1';
    cursor.current.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
    const year = LY0 + ((x - LX0) / (LX1 - LX0)) * (LY1 - LY0);
    readout.current.textContent = `${Math.floor(year)}-${String(Math.floor((year % 1) * 12) + 1).padStart(2, '0')}`;
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 1000 ${LA_H}`}
      className={s.la}
      onPointerMove={onMove}
      onPointerLeave={hide}
      role="img"
      aria-label={`Logic analyzer view: one lane per role from ${person.since} to ${asOf.y}.`}
    >
      {Array.from({ length: (LY1 - LY0) / 2 + 1 }, (_, i) => LY0 + 1 + i * 2)
        .filter((y) => y <= LY1)
        .map((y) => (
          <g key={y}>
            <line x1={lx(y)} y1={24} x2={lx(y)} y2={LA_H - 26} className={s.laGrid} />
            <text x={lx(y)} y={LA_H - 8} textAnchor="middle" className={s.laAxis}>
              {y}
            </text>
          </g>
        ))}
      <line x1={lx(NOW)} y1={20} x2={lx(NOW)} y2={LA_H - 26} className={s.laNow} />
      <text x={lx(NOW) - 6} y={16} textAnchor="end" className={s.laAxis}>
        NOW
      </text>
      {LA_ROWS.map((r, i) => {
        const y = 30 + i * LANE,
          hi = y + 10,
          lo = y + 38;
        const xs = lx(r.start),
          xe = lx(r.end ?? NOW);
        const wave = r.end
          ? `M${LX0},${lo} H${xs} V${hi} H${xe} V${lo} H${LX1}`
          : `M${LX0},${lo} H${xs} V${hi} H${xe}`;
        return (
          <g key={r.id}>
            <text
              x={0}
              y={y + 22}
              className={s.laChannel}
              style={{ fill: r.color }}
            >{`D${i}`}</text>
            <text x={34} y={y + 22} className={s.laOrg}>
              {r.org}
            </text>
            <text x={34} y={y + 38} className={s.laRange}>
              {r.range}
            </text>
            <rect
              x={xs + 2}
              y={hi + 3}
              width={Math.max(0, xe - xs - 4)}
              height={lo - hi - 6}
              style={{ fill: r.color }}
              className={s.laBox}
            />
            <path d={wave} style={{ stroke: r.color }} className={s.laWave} />
            {!r.end && (
              <path d={`M${xe},${hi} H${LX1}`} style={{ stroke: r.color }} className={s.laDash} />
            )}
            {xe - xs > 120 && (
              <text x={xs + 9} y={(hi + lo) / 2 + 4} className={s.laDecode}>
                {r.title}
              </text>
            )}
          </g>
        );
      })}
      <g ref={cursor} className={s.laCursor} style={{ opacity: 0 }}>
        <line x1={0} y1={22} x2={0} y2={LA_H - 26} />
        <rect x={-34} y={2} width={68} height={18} rx={3} />
        <text ref={readout} x={0} y={15} textAnchor="middle">
          {fmt.iso(asOf)}
        </text>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ page */

function Section({
  id,
  ch,
  kicker,
  title,
  children,
}: {
  id: string;
  ch?: Ch;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={s.section}
      style={{ '--c': ch ? COL[ch] : 'var(--txt)' } as React.CSSProperties}
      aria-labelledby={`${id}-title`}
    >
      <header className={s.secHead}>
        <span className={s.badge}>{ch ?? '·'}</span>
        <span className={s.kicker}>{kicker}</span>
        <h2 id={`${id}-title`}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

const CHANNELS: { ch: Ch; id: string; label: string }[] = [
  { ch: 1, id: 'ch1', label: 'Hardware' },
  { ch: 2, id: 'ch2', label: 'Platforms' },
  { ch: 3, id: 'ch3', label: 'Code' },
  { ch: 4, id: 'ch4', label: 'AI' },
];

export default function Signal() {
  const [on, setOn] = useState<Record<Ch, boolean>>({ 1: true, 2: true, 3: true, 4: true });
  const [frozen, setFrozen] = useState(false);
  const drawHero = useCallback<Draw>(
    (ctx, t, colors) => drawScope(ctx, t, on, frozen, colors),
    [on, frozen],
  );

  return (
    <div className={s.root}>
      <header className={s.top}>
        <a href="#top" className={s.brand}>
          <b>{MODEL}</b>
          <span>{`MIXED SIGNAL OSCILLOSCOPE · 4 CH · ${yearsBuilding} YR MEMORY`}</span>
        </a>
        <div className={s.keys} role="group" aria-label="Scope controls">
          <button
            type="button"
            className={`${s.key} ${s.run}`}
            aria-pressed={!frozen}
            onClick={() => setFrozen(!frozen)}
          >
            {frozen ? 'STOP' : 'RUN'}
          </button>
          {CHANNELS.map(({ ch }) => (
            <button
              key={ch}
              type="button"
              className={`${s.key} ${s.ch}`}
              style={{ '--c': COL[ch] } as React.CSSProperties}
              aria-pressed={on[ch]}
              aria-label={`Channel ${ch}`}
              onClick={() => setOn({ ...on, [ch]: !on[ch] })}
            >
              CH{ch}
            </button>
          ))}
        </div>
      </header>

      <main>
        <section id="top" className={s.hero}>
          <LiveCanvas
            W={800}
            H={480}
            draw={drawHero}
            paused={frozen}
            className={s.screen}
            label={`Four live traces: sensor readings, GSM uplink bursts, a UART line spelling ${profile.name}, and an AI forecast.`}
          />

          <aside className={s.panel}>
            <div className={s.knobs}>
              <div>
                <span className={s.knob} style={{ '--rot': '-40deg' } as React.CSSProperties} />
                <b>TIME/DIV</b>
                <i>500 µs</i>
              </div>
              <div>
                <span className={s.knob} style={{ '--rot': '25deg' } as React.CSSProperties} />
                <b>TRIGGER</b>
                <i>1.20 V</i>
              </div>
              <div>
                <span className={s.knob} style={{ '--rot': '70deg' } as React.CSSProperties} />
                <b>MEMORY</b>
                <i>{`${yearsBuilding} yr`}</i>
              </div>
            </div>
            <div className={s.measure}>
              <h2>MEASURE</h2>
              <dl>
                {stats.map((m) => (
                  <div key={m.label}>
                    <dt>{m.label}</dt>
                    <dd>{m.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>

          <div className={s.name}>
            <div>
              <h1>{profile.name}</h1>
              <p>
                {`${profile.role} at `}
                {profile.company}. From sensor to AI: firmware, platforms and the teams that build
                them.
              </p>
            </div>
            <nav className={s.probes} aria-label="Sections">
              {CHANNELS.map(({ ch, id, label }) => (
                <a key={ch} href={`#${id}`} style={{ '--c': COL[ch] } as React.CSSProperties}>
                  CH{ch} {label}
                </a>
              ))}
              <a href="#contact" style={{ '--c': 'var(--txt)' } as React.CSSProperties}>
                Trigger · Contact
              </a>
            </nav>
          </div>
        </section>

        <Section id="about" kicker="PROBE NOTES" title="About">
          <div className={s.about}>
            <div className={s.prose}>
              {about.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <div>
              <figure className={s.photo}>
                <Image src={person.photo} width={600} height={600} alt={profile.name} />
              </figure>
              <ul className={s.tags}>
                {skills.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section id="timeline" kicker={`LOGIC ANALYZER · ${SAMPLED}`} title="Experience">
          <div className={s.scroll}>
            <LogicAnalyzer />
          </div>
          <ol className={s.packets}>
            {jobs.map((job, i) => (
              <li key={job.company}>
                <span className={s.packetId}>{`PKT ${String(i).padStart(2, '0')}`}</span>
                <div>
                  <h3>
                    {job.title} ·{' '}
                    {job.url ? (
                      <a href={job.url} target="_blank" rel="noreferrer">
                        {job.company}
                      </a>
                    ) : (
                      job.company
                    )}
                  </h3>
                  <p className={s.packetRange}>{job.range}</p>
                  <ul>
                    {job.duties.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="ch1" ch={1} kicker="CH1 · SENSORS AND FIRMWARE" title="Hardware">
          <div className={s.devices}>
            {hardware.map((d, i) => (
              <article
                key={d.tag}
                className={s.device}
                style={{ '--c': COL[chOf(i)] } as React.CSSProperties}
              >
                <header>
                  <span className={s.devTag}>{d.tag}</span>
                  <span>{d.kind}</span>
                </header>
                <LiveCanvas
                  W={300}
                  H={80}
                  draw={SPARK_DRAWS[i]}
                  className={s.spark}
                  label={`${d.name}: an illustrative live trace`}
                />
                <h3>{d.name}</h3>
                <p>{d.detail}</p>
                <ul className={s.readouts}>
                  {d.figures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Section>

        <Section id="ch2" ch={2} kicker="CH2 · CAPTURES" title="Platforms">
          <div className={s.captures}>
            {featuredProjects.map((p, i) => (
              <article key={p.title} className={s.capture}>
                <div className={s.captureScreen}>
                  <Image src={p.image} width={1280} height={800} alt={p.title} />
                  <span className={s.captureTag}>{`CAP ${String(i + 1).padStart(2, '0')}`}</span>
                </div>
                <div className={s.captureText}>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                  <ul className={s.meas}>
                    {p.tech.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <div className={s.links}>
                    {projectLinks(p.links).map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                        {l.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <h3 className={s.subhead}>STORED WAVEFORMS</h3>
          <ul className={s.stored}>
            {otherProjects.map((p) => (
              <li key={p.title}>
                <b>{p.title}</b>
                <p>{p.description}</p>
                <span className={s.storedTech}>{p.tech.join(' · ')}</span>
                <span className={s.links}>
                  {projectLinks(p.links).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                      {l.label} ↗
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="ch3"
          ch={3}
          kicker="CH3 · DECODE · MERGED UPSTREAM"
          title="Code and open source"
        >
          <p
            className={s.lede}
          >{`Packets merged into libraries downloaded ${db.downloads.weekly.long} times a week.`}</p>
          <div className={s.scroll}>
            <table className={s.decode}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Address</th>
                  <th>Data</th>
                  <th>Flags</th>
                  <th>Reach</th>
                  <th>Ack</th>
                </tr>
              </thead>
              <tbody>
                {oss.map((c) => (
                  <tr key={c.repo}>
                    <td>{c.year}</td>
                    <td className={s.addr}>{c.repo}</td>
                    <td>
                      {c.change}
                      <br />
                      <small>{c.impact}</small>
                    </td>
                    <td>
                      <span className={`${s.flag} ${c.kind === 'Security' ? s.flagHot : ''}`}>
                        {c.kind}
                      </span>
                    </td>
                    <td>
                      ★ {c.stars}
                      <br />
                      {c.weekly}/wk
                    </td>
                    <td>
                      <a href={c.url} target="_blank" rel="noreferrer">
                        ACK ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="ch4" ch={4} kicker="CH4 · MODEL OUTPUT" title="AI">
          <div className={s.ai}>
            <LiveCanvas
              W={800}
              H={300}
              draw={drawForecast}
              className={s.screenWide}
              label="An illustrative forecast: actual costs, a fitted model, and a dashed forecast that crosses a risk threshold, raising an early warning."
            />
            <div className={s.prose}>
              <p>{`At ${profile.company} I’m bringing AI into the platform construction enterprises plan with: natural-language access to project data, and early warning on schedule and cost risk, so problems surface weeks before they hit the site.`}</p>
              <p>{`Before that, at ${smartclaim.title}, I worked on AI-assisted R&D tax claims built on ${smartclaimApi}, ${smartclaimLlm} and ${smartclaimVectors}.`}</p>
              <p className={s.note}>The chart is illustrative, not client data.</p>
            </div>
          </div>
        </Section>

        <Section id="contact" kicker="TRIGGER · ARMED" title="Contact">
          <div className={s.contact}>
            <p>
              Waiting for a rising edge. Write about a platform, a device or a team that needs
              building.
            </p>
            <a className={s.email} href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
            <div className={s.links}>
              <a href={profile.linkedin} target="_blank" rel="noreferrer">
                LinkedIn ↗
              </a>
              <a href={profile.github} target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
              <a href={profile.cv} target="_blank" rel="noreferrer">
                CV ↗
              </a>
            </div>
          </div>
        </Section>
      </main>

      <footer className={s.footer}>
        <span>{`${MODEL} · ${concept('oscilloscope').name.toUpperCase()} · CONCEPT ${concept('oscilloscope').letter}`}</span>
        <span>{`SAMPLED ${SAMPLED}`}</span>
      </footer>
    </div>
  );
}
