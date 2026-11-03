import { db, fmt, roots } from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { LIFETIME, OVERLAP, PAD_TIME, PART, PROMOTION, SPANS, toYear, years } from './content';
import Live from './Live';
import s from './datasheet.module.scss';

const { asOf, person, current } = db;
const { freelance, zeroone, neuroject } = db.roles;
const { bsc, msc } = db.education;
const { logger, attendumReader: reader, attendumBeacon: beacon } = db.devices;
const { neurobuild, smartclaim, attendum, activeClass, educationGuide } = db.products;
const ssl = db.robots.ssl;
const paper = db.papers.inverter;
/** "A, B and C". */
const and = (list: string[]) => `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

/** A wire with a pulse running along it. The pulse is pure CSS and pauses off screen. */
function Wire({
  d,
  delay = 0,
  dashed = false,
  arrow = true,
}: {
  d: string;
  delay?: number;
  dashed?: boolean;
  arrow?: boolean;
}) {
  return (
    <>
      <path
        d={d}
        className={`${s.net} ${dashed ? s.netDashed : ''}`}
        markerEnd={arrow ? 'url(#ds-arrow)' : undefined}
      />
      <path
        d={d}
        pathLength={100}
        className={s.pulse}
        style={{ '--d': `${delay}s` } as React.CSSProperties}
      />
    </>
  );
}

/** "t_NK" as an SVG text run with a real subscript. */
const Sub = ({ sym }: { sym: string }) => {
  const [a, b] = sym.split('_');
  return (
    <>
      {a}
      {b && (
        <tspan dy={3} fontSize="0.78em">
          {b}
        </tspan>
      )}
      {b && <tspan dy={-3}>{'\u200a'}</tspan>}
    </>
  );
};

const Arrow = () => (
  <defs>
    <marker
      id="ds-arrow"
      viewBox="0 0 10 10"
      refX={9}
      refY={5}
      markerWidth={9}
      markerHeight={9}
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
    >
      <path d="M0,1 L10,5 L0,9 z" className={s.arrowHead} />
    </marker>
  </defs>
);

/* ------------------------------------------------------------------ functional block diagram */

const FBD_BLOCKS: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines: string[];
  tone?: 'ctrl';
}[] = [
  {
    x: 210,
    y: 46,
    w: 570,
    h: 52,
    title: `CONTROL UNIT · ${current.title}`,
    lines: ['architecture · roadmap · delivery · security gates'],
    tone: 'ctrl',
  },
  {
    x: 210,
    y: 130,
    w: 170,
    h: 132,
    title: 'FIRMWARE CORE',
    lines: ['Embedded C', `${reader.chip} · ${beacon.chip}`, 'STM · FreeRTOS', 'GSM telemetry'],
  },
  {
    x: 430,
    y: 130,
    w: 170,
    h: 132,
    title: 'PLATFORM CORE',
    lines: ['TypeScript', 'React & Next.js', 'Laravel (PHP)', 'PostgreSQL & MySQL'],
  },
  {
    x: 650,
    y: 130,
    w: 130,
    h: 132,
    title: 'AI ENGINE',
    lines: ['Python & FastAPI', 'OpenAI', 'pgvector', 'risk warning'],
  },
  {
    x: 210,
    y: 296,
    w: 170,
    h: 70,
    title: 'APP BLOCK',
    lines: ['React Native & Expo', 'Office.js add-ins'],
  },
  {
    x: 430,
    y: 296,
    w: 170,
    h: 70,
    title: 'CLOUD I/F',
    lines: ['AWS: Amplify, Vapor,', 'Lambda, GuardDuty'],
  },
  {
    x: 650,
    y: 296,
    w: 130,
    h: 70,
    title: `NVM · ${db.yearsBuilding} YR`,
    lines: ['robots · RoboCup', `${bsc.degree} · ${msc.degree} · paper`],
  },
];
const FBD_IN: [string, number][] = [
  ['Sensors · GSM', 150],
  ['NFC · RFID', 180],
  ['BLE', 210],
  ['GPS', 240],
  ['Users', 331],
];
const FBD_OUT: [string, number][] = [
  neurobuild,
  smartclaim,
  attendum,
  activeClass,
  educationGuide,
].map((p, i) => [p.title, 120 + i * 40]);

export function BlockDiagram() {
  return (
    <Live loop className={s.scrollFig}>
      <svg
        viewBox="0 0 1000 420"
        className={s.fbd}
        role="img"
        aria-label={`Functional block diagram. A control unit (${current.title}) drives a firmware core, a platform core and an AI engine. Sensors, NFC, BLE and GPS enter the firmware core; users enter the app block; the AI engine and platform drive ${and(FBD_OUT.map(([title]) => title))}.`}
      >
        <Arrow />
        <rect x={170} y={22} width={650} height={380} className={s.chip} />
        <text x={182} y={396} className={s.chipName}>
          {PART}
        </text>

        {FBD_BLOCKS.map((b) => (
          <g key={b.title} className={`${s.block} ${b.tone === 'ctrl' ? s.blockCtrl : ''}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} />
            <text x={b.x + b.w / 2} y={b.y + 20} textAnchor="middle" className={s.blockTitle}>
              {b.title}
            </text>
            {b.lines.map((line, i) => (
              <text
                key={line}
                x={b.x + b.w / 2}
                y={b.y + 40 + i * 19}
                textAnchor="middle"
                className={s.blockLine}
              >
                {line}
              </text>
            ))}
          </g>
        ))}

        {FBD_IN.map(([label, y], i) => (
          <g key={label}>
            <text x={154} y={y + 4} textAnchor="end" className={s.extLabel}>
              {label}
            </text>
            <rect x={165} y={y - 5} width={10} height={10} className={s.pinSq} />
            <Wire d={`M175,${y} H208`} delay={i * 0.15} />
          </g>
        ))}
        <text x={154} y={76} textAnchor="end" className={s.extLabel}>
          VDD · {person.since}
        </text>
        <rect x={165} y={67} width={10} height={10} className={s.pinSq} />
        <Wire d="M175,72 H208" delay={0.1} />

        <Wire d="M380,180 H428" delay={0.7} />
        <Wire d="M430,214 H382" delay={1.9} />
        <Wire d="M380,331 H428" delay={0.8} />
        <Wire d="M515,296 V264" delay={1.1} />
        <Wire d="M600,196 H648" delay={1.4} />
        <Wire d="M715,296 V264" delay={1.6} dashed />
        {[295, 515, 715].map((x, i) => (
          <Wire key={x} d={`M${x},98 V128`} delay={0.3 + i * 0.1} dashed />
        ))}

        {FBD_OUT.map(([label, y], i) => (
          <g key={label}>
            <Wire d={`M780,196 H800 V${y} H822`} delay={2 + i * 0.12} arrow={false} />
            <rect x={815} y={y - 5} width={10} height={10} className={s.pinSq} />
            <text x={838} y={y + 4} className={s.extLabel}>
              {label}
            </text>
          </g>
        ))}
        <circle cx={800} cy={196} r={3.5} className={s.junction} />
      </svg>
    </Live>
  );
}

/* ------------------------------------------------------------------ typical application schematic */

const linkOf = (p: db.Product) => projectLinks(p.links);

function Part({
  x,
  y,
  w,
  h,
  des,
  title,
  sub,
  href,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  des: string;
  title: string;
  sub: string;
  href?: string;
}) {
  const body = (
    <g className={s.part}>
      <rect x={x} y={y} width={w} height={h} />
      <text x={x + 8} y={y - 6} className={s.refDes}>
        {des}
      </text>
      <text x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle" className={s.partTitle}>
        {title}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle" className={s.partSub}>
        {sub}
      </text>
    </g>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={s.partLink}
      aria-label={`${title} (opens ${new URL(href).host})`}
    >
      {body}
    </a>
  ) : (
    body
  );
}

function Connector({
  x,
  y,
  des,
  label,
  product,
  href,
}: {
  x: number;
  y: number;
  des: string;
  label: string;
  product: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={s.partLink}
      aria-label={`${product} on ${label}`}
    >
      <g className={s.connector}>
        <line x1={x - 22} x2={x} y1={y} y2={y} className={s.net} />
        <rect x={x} y={y - 8} width={14} height={16} rx={2} />
        <circle cx={x + 7} cy={y} r={2.6} />
        <text x={x + 22} y={y + 4} className={s.refDes}>
          {des}
        </text>
        <text x={x + 44} y={y + 4} className={s.partSub}>
          {label} ↗
        </text>
      </g>
    </a>
  );
}

const U1_LEFT: [string, number][] = [
  ['VDD', 100],
  ['EN', 150],
  ['GSM', 240],
  ['ESP32', 300],
  ['NRF52', 330],
  ['GND', 400],
];
const U1_RIGHT: [string, number][] = [
  ['LEAD', 100],
  ['LLM', 170],
  ['REACT', 240],
  ['RN', 330],
];

export function ApplicationSchematic() {
  const attendumLinks = linkOf(attendum),
    guide = linkOf(educationGuide);
  const store = (links: typeof guide, kind: string) =>
    links.find((l) => l.label === kind)?.url ?? '#';
  return (
    <Live loop className={s.scrollFig}>
      <svg
        viewBox="0 0 1000 460"
        className={s.schematic}
        role="group"
        aria-label={`Typical application schematic: the ${PART} driving ${neurobuild.title}, ${smartclaim.title}, ${activeClass.title}, the ${attendum.title} app and ${educationGuide.title}, with ${logger.name} stations and ${attendum.title} hardware on its firmware pins. Parts and connectors link to the live products and store listings.`}
      >
        <Arrow />
        {/* U1 */}
        <rect x={410} y={70} width={190} height={350} className={s.u1} />
        <text x={418} y={62} className={s.refDes}>
          U1
        </text>
        <text x={505} y={440} textAnchor="middle" className={s.partTitle}>
          {PART}
        </text>
        {U1_LEFT.map(([name, y]) => (
          <g key={name}>
            <line x1={380} x2={410} y1={y} y2={y} className={s.net} />
            <text x={418} y={y + 4} className={s.u1Pin}>
              {name}
            </text>
          </g>
        ))}
        {U1_RIGHT.map(([name, y]) => (
          <g key={name}>
            <line x1={600} x2={630} y1={y} y2={y} className={s.net} />
            <text x={592} y={y + 4} textAnchor="end" className={s.u1Pin}>
              {name}
            </text>
          </g>
        ))}

        {/* supply, pull-up and ground */}
        <path d="M300,62 L310,46 L320,62" className={s.net} />
        <text x={310} y={38} textAnchor="middle" className={s.partSub}>
          +{person.since}
        </text>
        <Wire d="M310,62 V100 H380" delay={0} arrow={false} />
        <circle cx={340} cy={100} r={3} className={s.junction} />
        <path d="M340,100 V112 l6,4 l-12,6 l12,6 l-12,6 l12,6 l-6,4 V150" className={s.net} />
        <text x={354} y={132} className={s.refDes}>
          R1
        </text>
        <text x={354} y={145} className={s.partSub}>
          pull-up
        </text>
        <Wire d="M340,150 H380" delay={0.3} arrow={false} />
        <path d="M380,400 H340 V412 M326,412 H354 M331,418 H349 M336,424 H344" className={s.net} />

        {/* left: hardware on the firmware pins */}
        <Part x={110} y={210} w={170} h={60} des="U5" title={logger.name} sub={`${logger.kind}s`} />
        <path d="M195,210 V178 M185,170 L195,178 L205,170 M195,178 V168" className={s.net} />
        <text x={212} y={180} className={s.refDes}>
          ANT1
        </text>
        <Wire d="M280,240 H378" delay={0.5} />
        <Part
          x={110}
          y={292}
          w={170}
          h={70}
          des="U4A"
          title={`${attendum.title} hardware`}
          sub={`${reader.chip} reader · ${beacon.chip} beacon`}
          href={attendumLinks[0]?.url}
        />
        <Wire d="M280,300 H378" delay={0.7} />
        <Wire d="M280,330 H378" delay={0.9} />

        {/* right: platforms on the output pins */}
        <Part
          x={700}
          y={72}
          w={190}
          h={56}
          des="U2"
          title={neurobuild.title}
          sub="Next.js · Laravel · AWS · APS"
          href={linkOf(neurobuild)[0]?.url}
        />
        <Wire d="M630,100 H698" delay={1.2} />
        <Part
          x={700}
          y={145}
          w={190}
          h={50}
          des="U3"
          title={smartclaim.title}
          sub="FastAPI · OpenAI · pgvector"
          href={linkOf(smartclaim)[0]?.url}
        />
        <Wire d="M630,170 H698" delay={1.4} />
        <Part
          x={700}
          y={215}
          w={190}
          h={50}
          des="U6"
          title={activeClass.title}
          sub="React · Redux · Office.js"
          href={linkOf(activeClass)[0]?.url}
        />
        <Wire d="M630,240 H698" delay={1.6} />
        <Part
          x={700}
          y={300}
          w={150}
          h={50}
          des="U4B"
          title={`${attendum.title} app`}
          sub="React Native"
          href={attendumLinks[0]?.url}
        />
        <Wire d="M630,330 H698" delay={1.8} />
        <circle cx={665} cy={330} r={3} className={s.junction} />
        <Part
          x={700}
          y={378}
          w={150}
          h={50}
          des="U7"
          title={educationGuide.title}
          sub="Expo · React Native"
          href={guide[0]?.url}
        />
        <Wire d="M665,330 V403 H698" delay={2} />
        <Connector
          x={872}
          y={314}
          des="J1"
          label="App Store"
          product={attendum.title}
          href={store(attendumLinks, 'App Store')}
        />
        <Connector
          x={872}
          y={336}
          des="J2"
          label="Google Play"
          product={attendum.title}
          href={store(attendumLinks, 'Google Play')}
        />
        <Connector
          x={872}
          y={392}
          des="J3"
          label="App Store"
          product={educationGuide.title}
          href={store(guide, 'App Store')}
        />
        <Connector
          x={872}
          y={414}
          des="J4"
          label="Google Play"
          product={educationGuide.title}
          href={store(guide, 'Google Play')}
        />
      </svg>
    </Live>
  );
}

/* ------------------------------------------------------------------ timing diagram */

// Twenty years from the year he started, two to a tick.
const T0 = person.since,
  T1 = T0 + 20;
const TX = (year: number) => 150 + ((year - T0) / (T1 - T0)) * 820;
const LANE = 44;

export function TimingDiagram() {
  const lanes = SPANS.map((sp, i) => {
    const y = 40 + i * LANE,
      hi = y,
      lo = y + 22;
    const x0 = TX(toYear(sp.start)),
      x1 = TX(toYear(sp.end)),
      e = 4;
    const d = sp.open
      ? `M${TX(T0)},${lo} H${x0 - e} L${x0 + e},${hi} H${TX(T1)}`
      : `M${TX(T0)},${lo} H${x0 - e} L${x0 + e},${hi} H${x1 - e} L${x1 + e},${lo} H${TX(T1)}`;
    return { ...sp, y, hi, lo, x0, x1, d };
  });
  const ovl = { x0: TX(toYear(OVERLAP.from)), x1: TX(toYear(OVERLAP.to)) };
  const promo = { x0: TX(toYear(PROMOTION.from)), x1: TX(toYear(PROMOTION.to)) };
  const nj = lanes.find((l) => l.id === neuroject.id)!;
  const zo = lanes.find((l) => l.id === zeroone.id)!;
  const bottom = 40 + lanes.length * LANE;
  return (
    <Live className={s.scrollFig}>
      <svg
        viewBox={`0 0 1000 ${bottom + 70}`}
        className={s.timing}
        role="img"
        aria-label={`Timing diagram of ${fmt.spell(SPANS.length)} roles from ${person.since} to ${asOf.y}, each a pulse from its start to its end, with the ${fmt.spell(OVERLAP.to - OVERLAP.from)}-month overlap between ${zeroone.org} and ${neuroject.org} and the promotion to ${current.title} marked.`}
      >
        <Arrow />
        {Array.from({ length: (T1 - T0) / 2 + 1 }, (_, i) => T0 + i * 2).map((yr) => (
          <g key={yr}>
            <line x1={TX(yr)} x2={TX(yr)} y1={26} y2={bottom} className={s.tGrid} />
            <text x={TX(yr)} y={18} textAnchor="middle" className={s.tick}>
              {yr}
            </text>
          </g>
        ))}
        {lanes.map((l, i) => {
          const end = l.open ? TX(db.now) : l.x1;
          const inside = end - l.x0 > 120;
          return (
            <g key={l.org}>
              <text x={0} y={l.lo - 4} className={s.laneName}>
                {l.org.toUpperCase()}
              </text>
              <path
                d={l.d}
                pathLength={1}
                className={`${s.wave} ${s.curve}`}
                style={{ '--i': i } as React.CSSProperties}
              />
              {l.open && <path d={`M${end + 2},${l.hi} h10 m-4,-4 l4,4 l-4,4`} className={s.net} />}
              <text
                x={inside ? (l.x0 + end) / 2 : l.x0 - 10}
                y={inside ? l.hi + 15 : l.lo - 5}
                textAnchor={inside ? 'middle' : 'end'}
                className={s.waveLabel}
              >
                <Sub sym={l.sym} /> = {years(l.end - l.start)} yr
              </text>
            </g>
          );
        })}
        {/* t_OVL between the Neuroject rising edge and the 0&1 falling edge */}
        <line x1={ovl.x0} x2={ovl.x0} y1={nj.lo + 4} y2={bottom + 12} className={s.dim} />
        <line x1={ovl.x1} x2={ovl.x1} y1={zo.lo + 4} y2={bottom + 12} className={s.dim} />
        <path
          d={`M${ovl.x0 - 26},${bottom + 8} H${ovl.x0}`}
          className={s.net}
          markerEnd="url(#ds-arrow)"
        />
        <path
          d={`M${ovl.x1 + 26},${bottom + 8} H${ovl.x1}`}
          className={s.net}
          markerEnd="url(#ds-arrow)"
        />
        <text x={ovl.x0 - 30} y={bottom + 12} textAnchor="end" className={s.waveLabel}>
          <Sub sym={OVERLAP.sym} /> = {years(OVERLAP.to - OVERLAP.from)} yr
        </text>
        {/* t_PROMO above the Neuroject lane, ending on the CTO marker */}
        <path
          d={`M${promo.x0},${nj.hi - 9} H${promo.x1}`}
          className={s.dimRed}
          markerEnd="url(#ds-arrow)"
        />
        <line x1={promo.x1} x2={promo.x1} y1={nj.hi - 16} y2={nj.hi + 6} className={s.dimRed} />
        <circle cx={promo.x1} cy={nj.hi} r={3.5} className={s.ctoDot} />
        <text
          x={promo.x0 - 8}
          y={nj.hi - 5}
          textAnchor="end"
          className={`${s.waveLabel} ${s.redText}`}
        >
          <Sub sym={PROMOTION.sym} /> = {years(PROMOTION.to - PROMOTION.from)} yr to {current.title}
        </text>
        <text x={TX(T1)} y={bottom + 40} textAnchor="end" className={s.tick}>
          Edges at the first month of each role; open roles run on.
        </text>
      </svg>
    </Live>
  );
}

/* ------------------------------------------------------------------ power-up sequence (roots) */

const RAILS = roots.map((r, i) => {
  const [a, b] = r.year.split('–').map(Number);
  return {
    ...r,
    sym: ['V_BSC', 'V_SSL', 'V_RC', 'V_NSC', 'V_MSC', 'V_PUB'][i] ?? `V_${i}`,
    from: a,
    to: b ?? a,
  };
});
// Twelve years from the year he started.
const P0 = person.since,
  P1 = P0 + 12;
const PX = (year: number) => 120 + ((year - P0) / (P1 - P0)) * 860;

export function PowerUp() {
  return (
    <Live className={s.scrollFig}>
      <svg
        viewBox={`0 0 1000 ${30 + RAILS.length * 40 + 30}`}
        className={s.timing}
        role="img"
        aria-label={`Power-up sequence: one rail per root, ramping up over its years: ${bsc.degree} ${bsc.from.y} to ${bsc.to.y}, Small Size League ${ssl.from.y} to ${ssl.to.y}, RoboCup ${db.awards.robocup.year}, National Skills ${db.awards.skills.year}, ${msc.degree} ${msc.from.y} to ${msc.to.y}, the paper in ${paper.date.y}. All rails stay up.`}
      >
        {Array.from({ length: (P1 - P0) / 2 + 1 }, (_, i) => P0 + i * 2).map((yr) => (
          <g key={yr}>
            <line x1={PX(yr)} x2={PX(yr)} y1={24} y2={30 + RAILS.length * 40} className={s.tGrid} />
            <text x={PX(yr)} y={16} textAnchor="middle" className={s.tick}>
              {yr}
            </text>
          </g>
        ))}
        {RAILS.map((r, i) => {
          const y = 34 + i * 40,
            hi = y,
            lo = y + 22;
          const x0 = PX(r.from),
            x1 = PX(r.to === r.from ? r.from + 0.15 : r.to);
          return (
            <g key={r.title}>
              <text x={0} y={lo - 2} className={s.laneName}>
                <Sub sym={r.sym} />
              </text>
              <path
                d={`M${PX(P0)},${lo} H${x0} L${x1},${hi} H${PX(P1)}`}
                pathLength={1}
                className={`${s.wave} ${s.curve}`}
                style={{ '--i': i } as React.CSSProperties}
              />
              <text x={x1 + 8} y={hi + 14} className={s.waveLabel}>
                {r.title}
              </text>
            </g>
          );
        })}
      </svg>
    </Live>
  );
}

/* ------------------------------------------------------------------ package outline */

export function PackageOutline() {
  return (
    <svg
      viewBox="0 0 1000 400"
      className={s.mech}
      role="img"
      aria-label={`Package outline: a square body ${LIFETIME} years on a side, from ${fmt.month(freelance.from)} to ${fmt.month(asOf)}, with a ${PAD_TIME}-year exposed thermal pad for ${neuroject.org}.`}
    >
      <Arrow />
      {/* top view */}
      <text x={170} y={24} textAnchor="middle" className={s.mechTitle}>
        TOP VIEW
      </text>
      <rect x={60} y={60} width={220} height={220} rx={4} className={s.mechBody} />
      <circle cx={78} cy={78} r={5} className={s.pin1} />
      <text x={170} y={176} textAnchor="middle" className={s.mechMark}>
        {PART}
      </text>
      <path
        d="M60,310 H280"
        className={s.dim}
        markerStart="url(#ds-arrow)"
        markerEnd="url(#ds-arrow)"
      />
      <text x={170} y={330} textAnchor="middle" className={s.mechDim}>
        {LIFETIME} ±0.1
      </text>
      <text x={170} y={346} textAnchor="middle" className={s.mechSub}>
        ({fmt.mon(freelance.from)} → {fmt.mon(asOf)})
      </text>
      <path
        d="M30,60 V280"
        className={s.dim}
        markerStart="url(#ds-arrow)"
        markerEnd="url(#ds-arrow)"
      />
      <text transform="translate(22 170) rotate(-90)" textAnchor="middle" className={s.mechDim}>
        {LIFETIME} ±0.1
      </text>

      {/* side view */}
      <text x={500} y={24} textAnchor="middle" className={s.mechTitle}>
        SIDE VIEW
      </text>
      <rect x={390} y={150} width={220} height={26} className={s.mechBody} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={408 + i * 25} y={176} width={12} height={4} className={s.mechLead} />
      ))}
      <text x={500} y={214} textAnchor="middle" className={s.mechSub}>
        SEATING PLANE: {bsc.degree}, {bsc.school.split(' ').pop()}
      </text>

      {/* bottom view */}
      <text x={830} y={24} textAnchor="middle" className={s.mechTitle}>
        BOTTOM VIEW
      </text>
      <rect x={720} y={60} width={220} height={220} rx={4} className={s.mechBody} />
      <rect x={790} y={130} width={80} height={80} className={s.mechPad} />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          <rect x={746 + i * 22} y={264} width={10} height={16} className={s.mechLead} />
          <rect x={746 + i * 22} y={60} width={10} height={16} className={s.mechLead} />
          <rect x={720} y={86 + i * 22} width={16} height={10} className={s.mechLead} />
          <rect x={924} y={86 + i * 22} width={16} height={10} className={s.mechLead} />
        </g>
      ))}
      <path
        d="M790,310 H870"
        className={s.dim}
        markerStart="url(#ds-arrow)"
        markerEnd="url(#ds-arrow)"
      />
      <text x={830} y={330} textAnchor="middle" className={s.mechDim}>
        {PAD_TIME} ±0.1
      </text>
      <text x={830} y={346} textAnchor="middle" className={s.mechSub}>
        ({neuroject.org}, {fmt.mon(neuroject.from)} → now)
      </text>
      <text x={830} y={176} textAnchor="middle" className={s.mechPadText}>
        EXPOSED PAD
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ small icons */

export const Icon = {
  folder: <path d="M2 4h4l1.5 1.5H14v7.5H2z" />,
  cart: (
    <path d="M1.5 2.5h2l1.6 7.5h7.4l1.5-5.5H4.3M6.5 13a1 1 0 1 0 0 .1M11.5 13a1 1 0 1 0 0 .1" />
  ),
  doc: <path d="M4 1.5h5.5l3 3v10h-8.5zM9.5 1.5v3h3M6 8h5M6 10.5h5" />,
  tool: (
    <path d="M10.5 2a3 3 0 0 0-2.8 4L2.5 11.2 4.8 13.5 10 8.3a3 3 0 0 0 4-2.8l-1.7 1.2-1.8-.5-.5-1.8z" />
  ),
  people: (
    <path d="M5.5 7.5a2.2 2.2 0 1 0 0-.1M1.5 13.5c.4-2.5 2-3.6 4-3.6s3.6 1.1 4 3.6M11 7a1.8 1.8 0 1 0 0-.1M10.5 9.6c2 0 3.4.9 4 3.4" />
  ),
};

export function ESDIcon() {
  return (
    <svg viewBox="0 0 48 44" className={s.esd} aria-hidden="true">
      <path d="M24 3 L45 41 H3 z" />
      <g className={s.esdHand}>
        {[
          [18, 19],
          [21.6, 16.5],
          [25.2, 17.5],
          [28.8, 20],
        ].map(([x, y]) => (
          <rect key={x} x={x} y={y} width={3.1} height={14} rx={1.55} />
        ))}
        <rect x={18} y={26} width={13.9} height={10} rx={3.5} />
        <rect
          x={13.2}
          y={27.5}
          width={3.1}
          height={8}
          rx={1.55}
          transform="rotate(-38 14.7 31.5)"
        />
      </g>
      <path d="M11 38 L37 14" className={s.esdSlash} />
    </svg>
  );
}
