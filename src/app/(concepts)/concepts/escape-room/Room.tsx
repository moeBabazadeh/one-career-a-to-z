'use client';

import { useEffect, useRef, useState } from 'react';
import { db } from '../_shared/data';
import {
  OBJECTS,
  ROOM,
  SHELF_ORDER,
  SLIDER_IMAGE,
  ZONES,
  type LockId,
  type ObjectDef,
  type ObjectId,
  type Zone,
} from './puzzles';
import type { Progress } from './store';
import s from './escape.module.scss';

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

/** Books on a shelf row: x, width, height, and a colour slot. */
function row(x0: number, base: number, sizes: [number, number][], slot = 0) {
  let x = x0;
  return sizes.map(([w, h], i) => {
    const b = { x, y: base - h, w, h, c: (slot + i) % 6 };
    x += w + 2;
    return b;
  });
}

const TOP_ROW = row(70, 222, [
  [18, 100],
  [22, 92],
  [16, 108],
  [24, 96],
  [20, 86],
  [14, 102],
]);
const ROLE_ROW = (() => {
  const sizes: [number, number][] = [
    [30, 118],
    [26, 108],
    [34, 122],
    [28, 112],
    [32, 120],
    [26, 110],
  ];
  const plain: Record<number, [number, number]> = { 1: [18, 98], 4: [24, 106], 6: [16, 92] };
  let x = 74;
  const out: { x: number; y: number; w: number; h: number; role: boolean; c: number }[] = [];
  SHELF_ORDER.forEach((_, i) => {
    const p = plain[i];
    if (p) {
      out.push({ x, y: 368 - p[1], w: p[0], h: p[1], role: false, c: 6 });
      x += p[0] + 2;
    }
    out.push({ x, y: 368 - sizes[i][1], w: sizes[i][0], h: sizes[i][1], role: true, c: i });
    x += sizes[i][0] + 2;
  });
  return out;
})();
const FOURTH_ROW = row(72, 650, [
  [22, 104],
  [18, 96],
  [26, 112],
  [20, 100],
  [16, 90],
  [24, 108],
  [20, 98],
  [18, 104],
  [22, 94],
]);

function RoomArt({ open }: { open: Set<LockId> }) {
  const is = (id: LockId) => open.has(id);
  return (
    <svg
      viewBox={`0 0 ${ROOM.w} ${ROOM.h}`}
      className={s.roomArt}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="esc-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={s.gWallTop} />
          <stop offset="1" className={s.gWallBottom} />
        </linearGradient>
        <pattern id="esc-stripes" width="56" height="10" patternUnits="userSpaceOnUse">
          <rect width="28" height="10" className={s.stripe} />
          <rect x="27" width="2" height="10" className={s.stripeLine} />
        </pattern>
        <radialGradient id="esc-lamp" cx="745" cy="540" r="640" gradientUnits="userSpaceOnUse">
          <stop offset="0" className={s.gLamp0} />
          <stop offset="0.4" className={s.gLamp1} />
          <stop offset="1" className={s.gLamp2} />
        </radialGradient>
        <linearGradient id="esc-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={s.gFloorTop} />
          <stop offset="1" className={s.gFloorBottom} />
        </linearGradient>
        <radialGradient id="esc-vignette" cx="0.5" cy="0.55" r="0.78">
          <stop offset="0.55" className={s.gVig0} />
          <stop offset="1" className={s.gVig1} />
        </radialGradient>
        <linearGradient id="esc-sun" x1="0.8" y1="0" x2="0.3" y2="1">
          <stop offset="0" className={s.gSun0} />
          <stop offset="1" className={s.gSun1} />
        </linearGradient>
        <linearGradient id="esc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={s.gSkyTop} />
          <stop offset="1" className={s.gSkyBottom} />
        </linearGradient>
        <linearGradient id="esc-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className={s.gSteel0} />
          <stop offset="1" className={s.gSteel1} />
        </linearGradient>
        <linearGradient id="esc-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className={s.gBrass0} />
          <stop offset="0.5" className={s.gBrass1} />
          <stop offset="1" className={s.gBrass2} />
        </linearGradient>
        <linearGradient id="esc-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={s.gWood0} />
          <stop offset="1" className={s.gWood1} />
        </linearGradient>
        <pattern id="esc-cork" width="9" height="9" patternUnits="userSpaceOnUse">
          <rect width="9" height="9" className={s.corkFill} />
          <circle cx="2" cy="3" r="1" className={s.corkDot} />
          <circle cx="7" cy="7" r="0.8" className={s.corkDot} />
        </pattern>
        <clipPath id="esc-screen-clip">
          <rect x="884" y="460" width="148" height="104" rx="2" />
        </clipPath>
        <clipPath id="esc-glass-clip">
          <rect x="1258" y="146" width="144" height="288" />
        </clipPath>
      </defs>

      {/* walls */}
      <rect width="1600" height="704" fill="url(#esc-wall)" />
      <rect y="112" width="1600" height="444" fill="url(#esc-stripes)" className={s.stripes} />
      <rect width="1600" height="34" className={s.ceiling} />
      <rect y="34" width="1600" height="8" className={s.trim} />
      <rect y="108" width="1600" height="5" className={s.trim} />
      <ellipse cx="745" cy="470" rx="620" ry="470" fill="url(#esc-lamp)" className={s.lampGlow} />

      {/* wainscot and floor */}
      <rect y="556" width="1600" height="148" className={s.wainscot} />
      {Array.from({ length: 10 }, (_, i) => (
        <rect
          key={i}
          x={i * 160 + 16}
          y="580"
          width="128"
          height="98"
          rx="2"
          className={s.wainPanel}
        />
      ))}
      <rect y="550" width="1600" height="12" className={s.trim} />
      <rect y="692" width="1600" height="14" className={s.trimDark} />
      <rect y="704" width="1600" height="196" fill="url(#esc-floor)" />
      {[742, 786, 838].map((y, i) => (
        <g key={y} className={s.boards}>
          <line x1="0" y1={y} x2="1600" y2={y} />
          {Array.from({ length: 9 }, (_, k) => (
            <line
              key={k}
              x1={k * 190 + (i % 2) * 95 + 40}
              y1={y}
              x2={k * 190 + (i % 2) * 95 + 40}
              y2={y + (i === 0 ? 38 : i === 1 ? 44 : 62)}
            />
          ))}
        </g>
      ))}
      <path d="M520 742 L1296 742 L1400 884 L420 884 Z" className={s.rug} />
      <path d="M548 754 L1270 754 L1356 872 L464 872 Z" className={s.rugBorder} />
      <path d="M590 770 L1228 770 L1296 856 L524 856 Z" className={s.rugInner} />

      {/* window, and the weather station outside */}
      <rect x="1240" y="128" width="180" height="324" rx="3" className={s.wood} />
      <rect x="1258" y="146" width="144" height="288" fill="url(#esc-sky)" />
      <g clipPath="url(#esc-glass-clip)">
        <g className={s.starsRoom}>
          {[
            [1272, 170],
            [1300, 200],
            [1344, 160],
            [1388, 190],
            [1280, 250],
            [1376, 238],
            [1310, 300],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />
          ))}
        </g>
        <circle cx="1372" cy="186" r="14" className={s.orbRoom} />
        <g className={s.cloudsRoom}>
          <ellipse cx="1290" cy="214" rx="26" ry="8" />
          <ellipse cx="1306" cy="208" rx="16" ry="8" />
          <ellipse cx="1372" cy="262" rx="22" ry="6" />
        </g>
        <path d="M1258 392 Q1300 372 1340 384 T1402 378 V434 H1258 Z" className={s.hillsRoom} />
        <g className={s.stationRoom}>
          <rect x="1302" y="328" width="3" height="104" />
          <rect x="1288" y="372" width="30" height="22" rx="2" />
          <rect x="1306" y="346" width="28" height="12" transform="rotate(-18 1320 352)" />
          <g className={s.anemoRoom}>
            <line x1="1292" y1="326" x2="1316" y2="326" />
            <line x1="1304" y1="314" x2="1304" y2="338" />
            <circle cx="1292" cy="326" r="3.4" />
            <circle cx="1316" cy="326" r="3.4" />
            <circle cx="1304" cy="314" r="3.4" />
            <circle cx="1304" cy="338" r="3.4" />
          </g>
          <circle cx="1311" cy="380" r="1.8" className={s.ledBlink} />
        </g>
      </g>
      <rect x="1327" y="146" width="6" height="288" className={s.woodHi} />
      <rect x="1258" y="286" width="144" height="6" className={s.woodHi} />
      <rect x="1234" y="430" width="192" height="16" rx="2" className={s.woodHi} />
      <path
        d="M1222 122 C1236 200 1226 330 1240 470 L1262 470 C1252 330 1262 200 1252 122 Z"
        className={s.curtain}
      />
      <path
        d="M1438 122 C1424 200 1434 330 1420 470 L1398 470 C1408 330 1398 200 1408 122 Z"
        className={s.curtain}
      />
      <rect x="1214" y="116" width="232" height="8" rx="4" className={s.brassRod} />
      <path
        d="M1258 434 L1402 434 L1186 900 L880 900 Z"
        fill="url(#esc-sun)"
        className={s.sunbeam}
      />

      {/* bookshelf */}
      <rect x="62" y="96" width="246" height="690" className={s.shelfBack} />
      {TOP_ROW.map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx="2"
          className={s.bookArt}
          style={{ '--c': `var(--book-${b.c})` } as Vars}
        />
      ))}
      <g className={s.globe}>
        <rect x="240" y="212" width="40" height="10" rx="3" />
        <line x1="260" y1="212" x2="260" y2="196" />
        <circle cx="260" cy="168" r="28" />
        <path d="M236 160 q24 12 48 0 M240 182 q20 -10 40 2 M256 141 q-10 27 4 55" />
      </g>
      <rect
        x="66"
        y="236"
        width="238"
        height="132"
        className={s.alcoveRoom}
        data-open={is('shelf')}
      />
      <g className={s.roleRow} data-open={is('shelf')}>
        {ROLE_ROW.map((b) => (
          <g key={b.x}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx="2"
              className={s.bookArt}
              style={{ '--c': b.role ? `var(--book-${b.c})` : 'var(--book-plain)' } as Vars}
            />
            {b.role && (
              <rect
                x={b.x + 4}
                y={b.y + 14}
                width={b.w - 8}
                height="10"
                rx="1"
                className={s.bookLabel}
              />
            )}
            {b.role && (
              <rect
                x={b.x + 3}
                y={b.y + b.h - 18}
                width={b.w - 6}
                height="3"
                className={s.bookBand}
              />
            )}
          </g>
        ))}
      </g>
      <g className={s.cryptexRoom} data-open={is('cryptex')}>
        <rect x="104" y="492" width="12" height="18" className={s.woodHi} />
        <rect x="226" y="492" width="12" height="18" className={s.woodHi} />
        <rect x="128" y="500" width="88" height="8" rx="4" className={s.scrollRoom} />
        <g className={s.capRoomL}>
          <path d="M100 470 h22 v26 h-22 a13 13 0 0 1 0 -26z" fill="url(#esc-brass)" />
        </g>
        <rect x="122" y="468" width="98" height="30" rx="3" fill="url(#esc-brass)" />
        {[130, 162, 194].map((x) => (
          <rect key={x} x={x} y="466" width="22" height="34" rx="3" className={s.ringRoom} />
        ))}
        <g className={s.capRoomR}>
          <path d="M220 470 h22 a13 13 0 0 1 0 26 h-22z" fill="url(#esc-brass)" />
        </g>
      </g>
      <rect
        x="262"
        y="420"
        width="20"
        height="90"
        rx="2"
        className={s.bookArt}
        transform="rotate(12 272 510)"
        style={{ '--c': 'var(--book-2)' } as Vars}
      />
      {FOURTH_ROW.map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx="2"
          className={s.bookArt}
          style={{ '--c': `var(--book-${b.c})` } as Vars}
        />
      ))}
      <rect
        x="276"
        y="560"
        width="22"
        height="90"
        rx="2"
        className={s.bookArt}
        style={{ '--c': 'var(--book-plain)' } as Vars}
      />
      <rect x="74" y="700" width="104" height="86" rx="3" className={s.boxArt} />
      <rect x="110" y="726" width="34" height="14" rx="1" className={s.paperArt} />
      <rect
        x="186"
        y="748"
        width="110"
        height="18"
        rx="2"
        className={s.bookArt}
        style={{ '--c': 'var(--book-0)' } as Vars}
      />
      <rect
        x="192"
        y="730"
        width="98"
        height="18"
        rx="2"
        className={s.bookArt}
        style={{ '--c': 'var(--book-3)' } as Vars}
      />
      <rect
        x="182"
        y="766"
        width="118"
        height="20"
        rx="2"
        className={s.bookArt}
        style={{ '--c': 'var(--book-5)' } as Vars}
      />
      {[222, 368, 510, 650, 786].map((y) => (
        <rect key={y} x="54" y={y} width="262" height="13" className={s.woodHi} />
      ))}
      <rect x="40" y="88" width="22" height="764" className={s.wood} />
      <rect x="308" y="88" width="22" height="764" className={s.wood} />
      <rect x="30" y="76" width="310" height="20" rx="2" className={s.woodHi} />
      <rect x="40" y="799" width="290" height="53" className={s.wood} />

      {/* diploma */}
      <path d="M510 126 L432 152 M510 126 L588 152" className={s.wire} />
      <circle cx="510" cy="126" r="3" className={s.brassFlat} />
      <rect x="410" y="150" width="200" height="150" rx="2" className={s.frameGold} />
      <rect x="422" y="162" width="176" height="126" className={s.paperArt} />
      <rect x="470" y="176" width="80" height="6" rx="2" className={s.inkLine} />
      <rect x="452" y="196" width="116" height="9" rx="2" className={s.inkLineBold} />
      {[216, 228, 240].map((y, i) => (
        <rect
          key={y}
          x={462 + i * 6}
          y={y}
          width={96 - i * 12}
          height="4"
          rx="2"
          className={s.inkLine}
        />
      ))}
      <rect x="486" y="256" width="48" height="8" rx="2" className={s.inkLineBold} />
      <circle cx="574" cy="266" r="10" className={s.rosetteArt} />

      {/* safe */}
      <rect x="418" y="340" width="188" height="204" rx="6" className={s.safeRecess} />
      {is('safe') ? (
        <g>
          <rect x="428" y="350" width="168" height="184" rx="4" className={s.safeInsideArt} />
          <path
            d="M498 470 h28 v-8 c10 0 14-26 14-34 h-56 c0 8 4 34 14 34z M506 470 h12 v18 h-12z M494 488 h36 v8 h-36z"
            className={s.trophyArt}
          />
          <rect x="440" y="500" width="40" height="22" rx="2" className={s.paperArt} />
          <path d="M428 350 L404 340 L404 544 L428 534 Z" fill="url(#esc-steel)" />
        </g>
      ) : (
        <g>
          <rect x="428" y="350" width="168" height="184" rx="6" fill="url(#esc-steel)" />
          <rect x="438" y="360" width="148" height="164" rx="4" className={s.safeBevel} />
          <circle cx="508" cy="442" r="36" fill="url(#esc-brass)" />
          <circle cx="508" cy="442" r="27" className={s.dialFaceArt} />
          <circle cx="508" cy="442" r="11" fill="url(#esc-brass)" />
          <path d="M508 402 l-4 -6 h8z" className={s.brassFlat} />
          <rect x="558" y="432" width="30" height="10" rx="5" fill="url(#esc-brass)" />
          <circle cx="560" cy="437" r="9" fill="url(#esc-brass)" />
          <rect x="424" y="376" width="8" height="26" rx="2" className={s.brassFlat} />
          <rect x="424" y="482" width="8" height="26" rx="2" className={s.brassFlat} />
          <rect x="476" y="496" width="64" height="12" rx="2" className={s.brassFlat} />
        </g>
      )}

      {/* wall calendar */}
      <circle cx="726" cy="166" r="3" className={s.brassFlat} />
      <path d="M726 166 L692 184 M726 166 L760 184" className={s.wire} />
      <rect x="676" y="182" width="100" height="122" rx="2" className={s.paperArt} />
      <rect x="676" y="182" width="100" height="30" rx="2" className={s.oxbloodArt} />
      {Array.from({ length: 35 }, (_, i) => (
        <rect
          key={i}
          x={684 + (i % 7) * 12.4}
          y={222 + Math.floor(i / 7) * 15}
          width="7"
          height="6"
          rx="1"
          className={i === 25 ? s.calHit : s.inkLine}
        />
      ))}

      {/* corkboard */}
      <rect x="828" y="160" width="226" height="202" rx="3" className={s.wood} />
      <rect x="838" y="170" width="206" height="182" fill="url(#esc-cork)" />
      <g transform="rotate(-5 902 236)">
        <rect x="856" y="190" width="94" height="98" className={s.polaroidArt} />
        <image
          href={SLIDER_IMAGE}
          x="862"
          y="196"
          width="82"
          height="62"
          preserveAspectRatio="xMidYMid slice"
        />
        <rect x="874" y="268" width="56" height="5" rx="2" className={s.inkLine} />
      </g>
      <g transform="rotate(4 996 226)">
        <rect x="960" y="198" width="74" height="54" className={s.paperArt} />
        <rect x="966" y="206" width="44" height="6" rx="2" className={s.inkLineBold} />
        {[220, 230, 240].map((y) => (
          <rect key={y} x="966" y={y} width="50" height="3" rx="1" className={s.inkLine} />
        ))}
      </g>
      <rect
        x="968"
        y="272"
        width="50"
        height="50"
        transform="rotate(-3 993 297)"
        className={s.stickyArt}
      />
      <circle cx="903" cy="194" r="4" className={s.pinRed} />
      <circle cx="996" cy="202" r="4" className={s.brassFlat} />

      {/* desk */}
      <path d="M692 566 L1213 566 L1226 612 L679 612 Z" fill="url(#esc-wood)" />
      <rect x="679" y="610" width="547" height="12" className={s.woodHi} />
      <rect x="690" y="622" width="525" height="74" className={s.wood} />
      <rect x="694" y="696" width="24" height="168" className={s.wood} />
      <rect x="1188" y="696" width="24" height="168" className={s.wood} />
      <ellipse cx="952" cy="872" rx="300" ry="10" className={s.shadow} />
      {is('drawer') ? (
        <g>
          <rect x="874" y="628" width="158" height="16" className={s.safeInsideArt} />
          <rect x="884" y="626" width="138" height="14" className={s.paperArt} />
          <rect x="856" y="640" width="194" height="64" rx="3" className={s.drawerFrontArt} />
          <rect x="924" y="662" width="58" height="20" rx="3" fill="url(#esc-brass)" />
        </g>
      ) : (
        <g>
          <rect x="870" y="630" width="166" height="58" rx="3" className={s.drawerFrontArt} />
          <rect x="902" y="648" width="102" height="22" rx="4" fill="url(#esc-brass)" />
          {Array.from({ length: 9 }, (_, i) => (
            <rect
              key={i}
              x={906 + i * 10.8}
              y="652"
              width="8"
              height="14"
              rx="1"
              className={s.dialFaceArt}
            />
          ))}
        </g>
      )}

      {/* desk lamp */}
      <path d="M690 523 L794 523 L862 610 L610 610 Z" className={s.lampCone} />
      <ellipse cx="742" cy="590" rx="36" ry="8" fill="url(#esc-brass)" />
      <rect x="738" y="522" width="8" height="68" fill="url(#esc-brass)" />
      <path d="M684 524 Q742 484 800 524 Z" className={s.lampShade} />
      <rect x="684" y="522" width="116" height="5" rx="2" fill="url(#esc-brass)" />
      <line x1="776" y1="527" x2="776" y2="556" className={s.chain} />

      {/* envelope */}
      <g transform="rotate(-8 826 560)">
        {is('seal') && <rect x="798" y="500" width="56" height="50" className={s.paperArt} />}
        <rect x="790" y="528" width="72" height="52" rx="2" className={s.envelopeArt} />
        <path
          d={is('seal') ? 'M790 528 L826 500 L862 528' : 'M790 528 L826 556 L862 528'}
          className={s.envFlapArt}
        />
        {!is('seal') && <circle cx="826" cy="556" r="7.5" className={s.waxArt} />}
      </g>

      {/* laptop */}
      <ellipse
        cx="958"
        cy="506"
        rx="120"
        ry="70"
        className={s.screenGlow}
        data-open={is('laptop')}
      />
      <rect x="876" y="452" width="164" height="120" rx="7" className={s.lidArt} />
      <rect x="884" y="460" width="148" height="104" rx="2" className={s.screenArt} />
      {is('laptop') ? (
        <image
          href={SLIDER_IMAGE}
          x="884"
          y="460"
          width="148"
          height="104"
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#esc-screen-clip)"
        />
      ) : (
        <g>
          {Array.from({ length: 8 }, (_, i) => {
            const pos = [4, 0, 2, 7, 1, 5, 3, 6][i];
            return (
              <rect
                key={i}
                x={888 + (pos % 3) * 48}
                y={464 + Math.floor(pos / 3) * 33}
                width="44"
                height="29"
                rx="1"
                className={s.tileArt}
                style={{ '--t': i } as Vars}
              />
            );
          })}
        </g>
      )}
      <path d="M866 572 L1050 572 L1064 592 L852 592 Z" className={s.baseArt} />

      {/* reader, card, card file */}
      <rect x="1056" y="544" width="32" height="46" rx="7" className={s.readerArt} />
      <circle cx="1072" cy="553" r="2.4" className={s.ledBlink} />
      <path
        d="M1066 566 q6 6 0 12 M1071 563 q9 9 0 18 M1076 560 q12 12 0 24"
        className={s.nfcArt}
      />
      <path d="M1100 590 L1112 572 M1140 590 L1128 572" className={s.chain} />
      <rect
        x="1098"
        y="556"
        width="44"
        height="26"
        rx="1"
        transform="rotate(-5 1120 569)"
        className={s.cardArt}
      />
      <rect
        x="1104"
        y="562"
        width="24"
        height="4"
        rx="1"
        transform="rotate(-5 1120 569)"
        className={s.inkLineBold}
      />
      <rect
        x="1104"
        y="570"
        width="30"
        height="3"
        rx="1"
        transform="rotate(-5 1120 569)"
        className={s.inkLine}
      />
      <rect x="1152" y="582" width="70" height="10" rx="3" className={s.metalArt} />
      <path d="M1160 584 L1170 556 M1214 584 L1204 556" className={s.chain} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect
          key={i}
          x="1162"
          y="528"
          width="50"
          height="30"
          rx="2"
          transform={`rotate(${(i - 4) * 11} 1187 560)`}
          className={s.rdxArt}
        />
      ))}
      <rect x="1164" y="522" width="46" height="30" rx="2" className={s.cardArt} />
      <circle cx="1154" cy="556" r="6" className={s.metalArt} />
      <circle cx="1220" cy="556" r="6" className={s.metalArt} />

      {/* parts cabinet */}
      <rect x="1248" y="600" width="172" height="248" rx="2" className={s.wood} />
      <rect x="1242" y="594" width="184" height="12" rx="2" className={s.woodHi} />
      {Array.from({ length: 12 }, (_, i) => {
        const cx = 1256 + (i % 3) * 54;
        const cy = 614 + Math.floor(i / 3) * 56;
        const out = is('cabinet') && (i === 4 || i === 9);
        return (
          <g key={i} transform={out ? 'translate(0 6)' : undefined}>
            <rect
              x={cx}
              y={cy}
              width="50"
              height="50"
              rx="2"
              className={out ? s.drawerOut : s.drawerFrontArt}
            />
            <rect x={cx + 13} y={cy + 10} width="24" height="10" rx="1" className={s.brassFlat} />
            <rect x={cx + 15} y={cy + 12} width="20" height="6" className={s.paperArt} />
            <circle cx={cx + 25} cy={cy + 34} r="4" fill="url(#esc-brass)" />
          </g>
        );
      })}
      <rect x="1328" y="660" width="12" height="70" rx="2" fill="url(#esc-brass)" />
      {is('cabinet') ? (
        <g transform="rotate(24 1334 716)">
          <path d="M1324 714 v-22 a10 10 0 0 1 20 0 v-6" className={s.shackleArt} />
          <rect x="1318" y="712" width="32" height="30" rx="5" fill="url(#esc-brass)" />
        </g>
      ) : (
        <g>
          <path d="M1324 712 v-14 a10 10 0 0 1 20 0 v14" className={s.shackleArt} />
          <rect x="1318" y="708" width="32" height="30" rx="5" fill="url(#esc-brass)" />
          <rect x="1324" y="716" width="20" height="10" rx="2" className={s.dialFaceArt} />
        </g>
      )}

      {/* door */}
      <rect x="1432" y="140" width="168" height="724" className={s.trim} />
      {is('door') && <rect x="1446" y="156" width="146" height="700" className={s.outsideLight} />}
      <g className={s.doorRoom} data-open={is('door')}>
        <rect x="1446" y="156" width="146" height="700" className={s.doorLeafArt} />
        <rect x="1462" y="176" width="114" height="250" rx="3" className={s.doorPanelArt} />
        <rect x="1462" y="456" width="114" height="380" rx="3" className={s.doorPanelArt} />
        <rect x="1452" y="440" width="28" height="44" rx="3" fill="url(#esc-brass)" />
        <rect x="1456" y="445" width="20" height="8" rx="1" className={s.dialFaceArt} />
        {Array.from({ length: 9 }, (_, i) => (
          <circle
            key={i}
            cx={1460 + (i % 3) * 6}
            cy={460 + Math.floor(i / 3) * 7}
            r="1.8"
            className={s.dialFaceArt}
          />
        ))}
        <circle cx="1466" cy="512" r="9" fill="url(#esc-brass)" />
        <circle cx="1474" cy="446" r="1.6" className={is('door') ? s.ledOk : s.ledNo} />
      </g>
      {is('door') && (
        <path d="M1446 856 L1592 856 L1560 900 L1360 900 Z" className={s.outsideSpill} />
      )}

      <rect width="1600" height="900" fill="url(#esc-vignette)" className={s.vignette} />
    </svg>
  );
}

interface RoomProps {
  progress: Progress;
  onPick: (id: ObjectId, from: DOMRect) => void;
}

export default function Room({ progress, onPick }: RoomProps) {
  const open = new Set(progress.open);
  const noted = new Set(progress.noted);
  const scroller = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<Zone>('desk');

  // On a phone the room is a panorama: it opens on the desk, where the envelope is, and the zone
  // label follows the scroll.
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    const stage = el.firstElementChild as HTMLElement;
    const z = ZONES.find((x) => x.id === 'desk') as (typeof ZONES)[number];
    el.scrollLeft = ((z.from + z.to) / 2 / ROOM.w) * stage.offsetWidth - el.clientWidth / 2;
    const onScroll = () => {
      const mid = ((el.scrollLeft + el.clientWidth / 2) / stage.offsetWidth) * ROOM.w;
      const found = ZONES.find((x) => mid >= x.from && mid < x.to);
      if (found) setZone(found.id);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const goZone = (dir: number) => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.max(0, Math.min(ZONES.length - 1, ZONES.findIndex((z) => z.id === zone) + dir));
    const z = ZONES[i];
    const stage = el.firstElementChild as HTMLElement;
    el.scrollTo({
      left: ((z.from + z.to) / 2 / ROOM.w) * stage.offsetWidth - el.clientWidth / 2,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };
  const zi = ZONES.findIndex((z) => z.id === zone);

  const label = (o: ObjectDef) => {
    if (o.kind === 'clue') return `${o.name}${noted.has(o.id) ? ', noted' : ', look closer'}`;
    return `${o.name}, ${open.has(o.id) ? `open: ${o.section === 'oss' ? 'open source' : o.section}` : `locked: ${o.mechanism.toLowerCase()}`}`;
  };

  return (
    <div className={s.roomWrap}>
      <div className={s.panorama} ref={scroller}>
        <div className={s.stage}>
          <RoomArt open={open} />
          {ZONES.map((z) => (
            <span
              key={z.id}
              className={s.snap}
              style={{ left: pct((z.from + z.to) / 2, ROOM.w) }}
              aria-hidden="true"
            />
          ))}
          <ul className={s.hotspots} aria-label="Things in the study">
            {OBJECTS.map((o) => {
              const state =
                o.kind === 'lock'
                  ? open.has(o.id)
                    ? 'open'
                    : 'locked'
                  : noted.has(o.id)
                    ? 'noted'
                    : 'new';
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className={s.hot}
                    data-kind={o.kind}
                    data-state={state}
                    data-tall={o.box.h > o.box.w * 2.5}
                    style={{
                      left: pct(o.box.x, ROOM.w),
                      top: pct(o.box.y, ROOM.h),
                      width: pct(o.box.w, ROOM.w),
                      height: pct(o.box.h, ROOM.h),
                    }}
                    aria-label={label(o)}
                    onClick={(e) => onPick(o.id, e.currentTarget.getBoundingClientRect())}
                    onKeyDown={(e) => {
                      // Handled on keydown so the same keystroke can't also press whatever the dialog focuses.
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      onPick(o.id, e.currentTarget.getBoundingClientRect());
                    }}
                  >
                    <span className={s.hotName} aria-hidden="true">
                      {o.name}
                    </span>
                    <span className={s.badge} aria-hidden="true">
                      {state === 'open' ? (
                        <svg viewBox="0 0 16 16">
                          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                        </svg>
                      ) : state === 'locked' ? (
                        <svg viewBox="0 0 16 16">
                          <circle cx="8" cy="6.5" r="2.6" />
                          <path d="M8 8.6 V12" />
                        </svg>
                      ) : state === 'new' ? (
                        <svg viewBox="0 0 16 16">
                          <circle cx="7" cy="7" r="3.6" />
                          <path d="M9.8 9.8 13 13" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 16 16">
                          <path d="M4 12.5 11.5 5 M10 3.5 12.5 6" />
                        </svg>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className={s.roomNav}>
        <button type="button" onClick={() => goZone(-1)} disabled={zi <= 0} aria-label="Look left">
          ‹
        </button>
        <p aria-live="polite">
          <b>{ZONES[zi]?.name}</b>
          <span>
            {zi + 1} / {ZONES.length} · swipe to look around
          </span>
        </p>
        <button
          type="button"
          onClick={() => goZone(1)}
          disabled={zi >= ZONES.length - 1}
          aria-label="Look right"
        >
          ›
        </button>
      </div>
      <p className={s.sr}>
        {db.person.name}’s study. Every object below can be examined; locks open with facts written
        elsewhere in the room.
      </p>
    </div>
  );
}
