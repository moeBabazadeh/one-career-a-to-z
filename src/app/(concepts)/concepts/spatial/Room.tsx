import type { ReactNode, Ref } from 'react';
import s from './room.module.scss';

/*
 * The room you're standing in, built from flat planes in 3D: walls, floor, ceiling, a picture
 * window with depth, and a little furniture. It's the passthrough: plain and calm, so the glass
 * has something soft to blur. Day in the light scheme, evening in the dark one; only the tokens
 * change. The view outside sits on two planes far behind the glass, so moving your head shows
 * real parallax between the frame, the trees and the hills.
 */

/** A small seeded generator, so stars and far-off lights land in the same places every time. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = seeded(7);
const STARS = Array.from({ length: 70 }, () => ({
  x: rnd() * 960,
  y: rnd() * 250,
  r: 0.5 + rnd() * 1.1,
  o: 0.35 + rnd() * 0.6,
}));
const LIGHTS = Array.from({ length: 120 }, () => ({
  x: rnd() * 960,
  y: 296 + rnd() * 12,
  w: 1 + rnd() * 2.4,
  o: 0.4 + rnd() * 0.6,
  warm: rnd() > 0.3,
}));
const TREES = Array.from({ length: 36 }, (_, i) => ({
  x: i * 15.5 + rnd() * 8,
  h: 36 + rnd() * 28,
  w: 16 + rnd() * 18,
}));

function Outside() {
  return (
    <svg className={s.svg} viewBox="0 0 960 390" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky-0)" />
          <stop offset="0.55" stopColor="var(--sky-1)" />
          <stop offset="0.78" stopColor="var(--sky-2)" />
          <stop offset="1" stopColor="var(--sky-3)" />
        </linearGradient>
        <radialGradient id="sp-sun" cx="0.28" cy="0.42" r="0.5">
          <stop offset="0" stopColor="var(--sun)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--sun)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="960" height="390" fill="url(#sp-sky)" />
      <rect width="960" height="390" fill="url(#sp-sun)" />
      <g className={s.stars}>
        {STARS.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={t.r} opacity={t.o} />
        ))}
      </g>
      <circle className={s.moon} cx="690" cy="120" r="11" />
      {/* Far hills, paler with distance. */}
      <path
        d="M0 292 C80 270 150 262 230 272 S380 250 470 262 610 248 700 266 860 256 960 270 V390 H0Z"
        fill="var(--hill-0)"
      />
      <path
        d="M0 302 C120 286 200 296 300 288 S470 280 560 292 760 282 960 294 V390 H0Z"
        fill="var(--hill-1)"
      />
      <g className={s.city}>
        {LIGHTS.map((l, i) => (
          <rect
            key={i}
            x={l.x}
            y={l.y}
            width={l.w}
            height="1.6"
            opacity={l.o}
            fill={l.warm ? 'var(--city-warm)' : 'var(--city-cool)'}
          />
        ))}
      </g>
      <rect y="306" width="960" height="84" fill="var(--hill-2)" />
    </svg>
  );
}

function TreeLine() {
  return (
    <svg className={s.svg} viewBox="0 0 540 70" preserveAspectRatio="none">
      {TREES.map((t, i) => (
        <ellipse
          key={i}
          cx={t.x}
          cy={76 - t.h / 2}
          rx={t.w / 2}
          ry={t.h / 2}
          fill={i % 3 ? 'var(--tree-0)' : 'var(--tree-1)'}
        />
      ))}
      <rect y="52" width="540" height="18" fill="var(--tree-0)" />
    </svg>
  );
}

function Mullions() {
  // The opening is 3.0 by 1.19 units: three lights over three, with a transom.
  return (
    <svg className={s.svg} viewBox="0 0 300 119" preserveAspectRatio="none">
      <g fill="var(--frame)">
        <rect width="300" height="2.6" />
        <rect y="116.4" width="300" height="2.6" />
        <rect width="2.6" height="119" />
        <rect x="297.4" width="2.6" height="119" />
        <rect x="98.7" width="2.2" height="119" />
        <rect x="199.1" width="2.2" height="119" />
        <rect y="30" width="300" height="1.8" />
      </g>
      <path
        d="M20 119 L120 0 H170 L70 119Z M190 119 L280 12 V40 L222 119Z"
        fill="var(--pane-glint)"
      />
    </svg>
  );
}

function Plant() {
  return (
    <svg className={s.svg} viewBox="0 0 140 240">
      <g fill="var(--leaf-0)">
        <ellipse cx="52" cy="60" rx="20" ry="30" transform="rotate(-28 52 60)" />
        <ellipse cx="92" cy="48" rx="19" ry="28" transform="rotate(24 92 48)" />
        <ellipse cx="70" cy="22" rx="15" ry="22" />
        <ellipse cx="38" cy="112" rx="21" ry="30" transform="rotate(-44 38 112)" />
        <ellipse cx="104" cy="104" rx="20" ry="28" transform="rotate(40 104 104)" />
      </g>
      <g fill="var(--leaf-1)">
        <ellipse cx="74" cy="76" rx="18" ry="27" transform="rotate(8 74 76)" />
        <ellipse cx="56" cy="138" rx="17" ry="24" transform="rotate(-20 56 138)" />
        <ellipse cx="90" cy="144" rx="16" ry="22" transform="rotate(22 90 144)" />
      </g>
      <path d="M70 196 C70 150 66 110 72 40" stroke="var(--stem)" strokeWidth="2.4" fill="none" />
      <path d="M44 186 H96 L90 238 H50Z" fill="var(--pot)" />
      <path d="M44 186 H96 L95 194 H45Z" fill="var(--pot-rim)" />
    </svg>
  );
}

function Lamp() {
  return (
    <svg className={s.svg} viewBox="0 0 120 300">
      <path
        d="M60 92 L26 298 M60 92 L94 298 M60 92 V298"
        stroke="var(--lamp-leg)"
        strokeWidth="2.4"
        fill="none"
      />
      <path d="M30 34 H90 L98 96 H22Z" className={s.shade} />
      <ellipse cx="60" cy="96" rx="38" ry="4" className={s.shadeLip} />
    </svg>
  );
}

function Art() {
  return (
    <svg className={s.svg} viewBox="0 0 220 150">
      <rect width="220" height="150" fill="var(--art-frame)" />
      <rect x="8" y="8" width="204" height="134" fill="var(--art-ground)" />
      <circle cx="78" cy="70" r="38" fill="var(--art-a)" />
      <circle cx="136" cy="86" r="28" fill="var(--art-b)" opacity="0.9" />
      <rect x="40" y="112" width="140" height="3" fill="var(--art-line)" />
    </svg>
  );
}

export default function Room({
  roomRef,
  children,
}: {
  roomRef: Ref<HTMLDivElement>;
  children?: ReactNode;
}) {
  return (
    <div className={s.room} ref={roomRef} aria-hidden="true">
      <div className={`${s.p} ${s.outside}`}>
        <Outside />
      </div>
      <div className={`${s.p} ${s.trees}`}>
        <TreeLine />
      </div>

      <div className={`${s.p} ${s.wall} ${s.backTop}`} />
      <div className={`${s.p} ${s.wall} ${s.backBottom}`} />
      <div className={`${s.p} ${s.wall} ${s.backLeft}`} />
      <div className={`${s.p} ${s.wall} ${s.backRight}`} />
      <div className={`${s.p} ${s.reveal} ${s.revealLeft}`} />
      <div className={`${s.p} ${s.reveal} ${s.revealRight}`} />
      <div className={`${s.p} ${s.reveal} ${s.revealTop}`} />
      <div className={`${s.p} ${s.sill}`} />
      <div className={`${s.p} ${s.mullions}`}>
        <Mullions />
      </div>

      <div className={`${s.p} ${s.floor}`}>
        <i className={s.sunPatch} />
        <i className={s.rug} />
        <i className={s.lampPool} />
      </div>
      <div className={`${s.p} ${s.ceiling}`}>
        <i className={s.downlight} style={{ left: '30%' }} />
        <i className={s.downlight} style={{ left: '70%' }} />
      </div>

      <div className={`${s.p} ${s.leftWall}`}>
        <i className={s.wallLight} />
      </div>
      <div className={`${s.p} ${s.art}`}>
        <Art />
      </div>
      <div className={`${s.p} ${s.boardFront}`} />
      <div className={`${s.p} ${s.boardTop}`} />

      <div className={`${s.p} ${s.rightWall}`}>
        <i className={s.lampGlow} />
      </div>
      <div className={`${s.p} ${s.shelf}`} />

      <div className={`${s.p} ${s.plant}`}>
        <Plant />
      </div>
      <div className={`${s.p} ${s.lamp}`}>
        <Lamp />
      </div>

      {children}
    </div>
  );
}

/** Texels per P unit: the room is drawn at this scale and is never magnified much. */
export const TEXEL = 360;

/**
 * A window's footprint on the floor: a soft shadow by day, a spill of its light in the evening.
 * It sits straight below the window and fades as the window rises.
 */
export function FloorMark({
  az,
  el,
  r,
  width,
  height,
  open,
  P,
}: {
  az: number;
  el: number;
  r: number;
  width: number;
  height: number;
  open: boolean;
  P: number;
}) {
  const rad = (el * Math.PI) / 180;
  const ground = r * Math.cos(rad);
  const bottom = -r * Math.sin(rad) + height / 2 / P;
  const gap = Math.max(0, 0.56 - bottom);
  const spread = 1 + gap * 0.9;
  const w = (width / P) * spread * 1.05;
  return (
    <i
      className={`${s.p} ${s.mark}`}
      data-open={open || undefined}
      style={{
        width: w * TEXEL,
        height: w * TEXEL * 0.42,
        opacity: open ? Math.max(0.22, Math.min(1, 1.15 - gap * 1.1)) : 0,
        transform: `rotateY(${-az}deg) translate3d(0, ${(0.558 * TEXEL).toFixed(1)}px, ${(-ground * TEXEL).toFixed(1)}px) rotateX(90deg) translate(-50%, -50%)`,
      }}
    />
  );
}
