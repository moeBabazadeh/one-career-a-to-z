'use client';

// Play mode: the frames become the site. Each layer with an interaction is a real link or button
// over the canvas; navigating runs the transition the interaction asks for (dissolve, move in,
// push, slide in, or Smart animate, which matches layers by name between the two frames and
// tweens their position, size, colour and opacity). Fixed layers stay put while the frame
// scrolls; overlays open over a dimmed frame.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../_shared/hooks';
import { Icon, Select } from './controls';
import {
  localMat,
  mixHex,
  mul,
  namePath,
  worldBox,
  type Doc,
  type Link,
  type Mat,
  type Node,
} from './model';
import { onImage, paintSelf, paintTree, type PaintOpts } from './paint';
import { set, useSlice } from './store';
import s from './vector.module.scss';

interface Hotspot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fixed: boolean;
  link: Link;
  label: string;
}

const EASE: Record<Link['ease'], (t: number) => number> = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  'in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  linear: (t) => t,
};

function textOf(N: Record<string, Node>, id: string): string {
  const n = N[id];
  if (n.type === 'text') return n.text ?? n.name;
  for (const c of n.children) {
    const t = N[c].visible ? textOf(N, c) : '';
    if (t) return t;
  }
  return '';
}

function hotspots(doc: Doc, frame: string): Hotspot[] {
  const N = doc.nodes;
  const f = N[frame];
  const out: Hotspot[] = [];
  const walk = (id: string, fixed: boolean) => {
    const n = N[id];
    if (!n.visible) return;
    const fx = fixed || (!!n.fixed && n.parent === frame);
    if (n.link && id !== frame) {
      const b = worldBox(N, id);
      out.push({
        id,
        x: b.x - f.x,
        y: b.y - f.y,
        w: b.w,
        h: b.h,
        fixed: fx,
        link: n.link,
        label: (textOf(N, id) || n.name).replace(/\s*↗$/, ''),
      });
    }
    n.children.forEach((c) => walk(c, fx));
  };
  f.children.forEach((c) => walk(c, false));
  return out;
}

/** The screens a flow reaches, in canvas order, without its overlays. */
function flowFrames(doc: Doc, start: string) {
  const N = doc.nodes;
  const seen = new Set<string>([start]);
  const overlays = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift() as string;
    const walk = (nid: string) => {
      const n = N[nid];
      const to = n.link?.to;
      if (
        to &&
        N[to] &&
        !seen.has(to) &&
        (n.link?.action === 'navigate' || n.link?.action === 'overlay')
      ) {
        seen.add(to);
        if (n.link?.action === 'overlay') overlays.add(to);
        queue.push(to);
      }
      n.children.forEach(walk);
    };
    walk(id);
  }
  return [...seen]
    .filter((id) => !overlays.has(id))
    .sort((a, b) => N[a].y - N[b].y || N[a].x - N[b].x);
}

interface Item {
  key: string;
  node: Node;
  m: Mat;
  a: number;
  fixed: boolean;
}

/** Every visible layer of a frame with its transform relative to the frame, for Smart animate. */
function flat(N: Record<string, Node>, frame: string): Item[] {
  const out: Item[] = [];
  const count = new Map<string, number>();
  const f = N[frame];
  const walk = (id: string, pm: Mat, a: number, fixed: boolean) => {
    const n = N[id];
    if (!n.visible) return;
    const m = id === frame ? ([1, 0, 0, 1, 0, 0] as Mat) : mul(pm, localMat(n));
    const fx = fixed || (!!n.fixed && n.parent === frame);
    const path = id === frame ? '' : namePath(N, frame, id);
    const k = count.get(path) ?? 0;
    count.set(path, k + 1);
    const alpha = a * n.opacity;
    out.push({ key: `${path}#${k}`, node: n, m, a: alpha, fixed: fx });
    n.children.forEach((c) => walk(c, m, alpha, fx));
  };
  void f;
  walk(frame, [1, 0, 0, 1, 0, 0], 1, false);
  return out;
}

interface Trans {
  from: string;
  fromScroll: number;
  to: string;
  link: Link;
  t0: number;
  kind: 'navigate' | 'open' | 'close';
}

export default function Player({ start }: { start: string }) {
  const doc = useSlice((st) => st.doc);
  const reduced = useReducedMotion();
  const N = doc.nodes;
  const flows = Object.values(N).filter((n) => n.flow && N[n.parent]?.id === N[start]?.parent);
  const startFlow = N[start]?.flow
    ? start
    : (flows.find((f) => flowFrames(doc, f.id).includes(start))?.id ?? start);
  const [flow, setFlow] = useState(startFlow);
  const [cur, setCur] = useState(start);
  const [overlay, setOverlay] = useState<{ id: string; link: Link } | null>(null);
  const [hist, setHist] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(0);
  const [showHot, setShowHot] = useState(false);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const trans = useRef<Trans | null>(null);
  const raf = useRef(0);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const drawRef = useRef<() => void>(() => {});

  const frames = flowFrames(doc, flow);
  const f = N[cur];
  const k = size.W && f ? Math.min(1, (size.W - (size.W > f.w + 48 ? 48 : 0)) / f.w) : 1;
  const ox = f ? Math.max(0, (size.W - f.w * k) / 2) : 0;
  const top = f && f.w < 600 && size.W > 600 ? 24 : 0;

  const close = useCallback(() => set({ play: null }), []);

  const draw = useCallback(() => {
    const c = canvas.current;
    const sc = scroller.current;
    const st = stage.current;
    if (!c || !sc || !st) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = st.clientWidth,
      H = st.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, c.width, c.height);
    const N2 = doc.nodes;
    const scroll = sc.scrollTop;
    const o: PaintOpts = { scale: dpr, placeholder: '#E3E1DC' };
    const kOf = (id: string) => Math.min(1, (W - (W > N2[id].w + 48 ? 48 : 0)) / N2[id].w);
    const oxOf = (id: string) => Math.max(0, (W - N2[id].w * kOf(id)) / 2);
    const topOf = (id: string) => (N2[id].w < 600 && W > 600 ? 24 : 0);

    // A frame drawn at a screen offset: its scrolled content, then its fixed layers on top.
    const frameAt = (id: string, dx: number, dy: number, scrollY: number, alpha = 1) => {
      const n = N2[id];
      const kk = kOf(id);
      const x0 = oxOf(id) + dx,
        y0 = topOf(id) + dy;
      const at: Mat = [1, 0, 0, 1, -n.x, -n.y];
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.rect(x0, y0, n.w * kk, Math.min(H - y0, n.h * kk - scrollY));
      ctx.clip();
      paintTree(
        ctx,
        N2,
        id,
        at,
        [kk * dpr, 0, 0, kk * dpr, x0 * dpr, (y0 - scrollY) * dpr],
        alpha,
        { ...o, scale: kk * dpr, skipFixed: true },
      );
      const fm: Mat = [1, 0, 0, 1, 0, 0];
      for (const ch of n.children)
        if (N2[ch].fixed)
          paintTree(
            ctx,
            N2,
            ch,
            fm,
            [kk * dpr, 0, 0, kk * dpr, x0 * dpr, y0 * dpr],
            alpha * n.opacity,
            { ...o, scale: kk * dpr },
          );
      ctx.restore();
    };

    const tr = trans.current;
    const now = performance.now();
    // A transition starts on the first frame drawn after it was asked for.
    if (tr && !tr.t0) tr.t0 = now;
    const p = tr ? Math.min(1, (now - tr.t0) / Math.max(1, tr.link.ms)) : 1;
    const e = tr ? EASE[tr.link.ease](p) : 1;
    const base = tr && tr.kind === 'navigate' ? tr.to : cur;

    if (tr && tr.kind === 'navigate' && p < 1) {
      const { anim, dir } = tr.link;
      const vx = dir === 'left' ? 1 : dir === 'right' ? -1 : 0;
      const vy = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
      if (anim === 'smart')
        smart(ctx, N2, tr.from, tr.to, tr.fromScroll, e, dpr, kOf, oxOf, topOf, W, H);
      else if (anim === 'dissolve') {
        frameAt(tr.from, 0, 0, tr.fromScroll);
        frameAt(tr.to, 0, 0, 0, e);
      } else if (anim === 'move') {
        frameAt(tr.from, 0, 0, tr.fromScroll);
        frameAt(tr.to, vx * W * (1 - e), vy * H * (1 - e), 0);
      } else if (anim === 'push') {
        frameAt(tr.from, -vx * W * e, -vy * H * e, tr.fromScroll);
        frameAt(tr.to, vx * W * (1 - e), vy * H * (1 - e), 0);
      } else if (anim === 'slide') {
        frameAt(tr.from, -vx * W * 0.3 * e, -vy * H * 0.3 * e, tr.fromScroll);
        frameAt(tr.to, vx * W * (1 - e), vy * H * (1 - e), 0);
      } else frameAt(tr.to, 0, 0, 0);
    } else frameAt(base, 0, 0, scroll);

    // An overlay over the frame: dim the frame, then slide the overlay in.
    const ov = tr && tr.kind !== 'navigate' ? { id: tr.to, link: tr.link } : overlay;
    if (ov && N2[ov.id]) {
      const amount = tr && tr.kind !== 'navigate' ? (tr.kind === 'open' ? e : 1 - e) : 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.45 * amount;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalAlpha = 1;
      const on = N2[ov.id];
      const kk = Math.min(1, (W - 24) / on.w, kOf(base));
      const fw = N2[base].w * kOf(base);
      const fx = oxOf(base),
        fy = topOf(base);
      let x = on.overlay === 'right' ? fx + fw - on.w * kk : fx + (fw - on.w * kk) / 2;
      let y = on.overlay === 'center' ? fy + (H - fy - on.h * kk) / 2 : fy;
      if (ov.link.anim === 'move' || ov.link.anim === 'slide' || ov.link.anim === 'push') {
        const d = ov.link.dir;
        const off = 1 - amount;
        if (d === 'left') x += on.w * kk * off;
        if (d === 'right') x -= on.w * kk * off;
        if (d === 'up') y += (H - y) * off;
        if (d === 'down') y -= (on.h * kk + y) * off;
      }
      ctx.globalAlpha = ov.link.anim === 'dissolve' ? amount : 1;
      paintTree(
        ctx,
        N2,
        ov.id,
        [1, 0, 0, 1, -on.x, -on.y],
        [kk * dpr, 0, 0, kk * dpr, x * dpr, y * dpr],
        ov.link.anim === 'dissolve' ? amount : 1,
        { ...o, scale: kk * dpr },
      );
      ctx.globalAlpha = 1;
    }

    if (tr && p >= 1) {
      trans.current = null;
      setBusy(false);
      if (tr.kind === 'close') setOverlay(null);
    }
    if (trans.current) raf.current = requestAnimationFrame(() => drawRef.current());
  }, [doc, cur, overlay]);

  useEffect(() => {
    drawRef.current = draw;
  });

  const kick = () => {
    setBusy(true);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => drawRef.current());
  };

  // Size, images and redraws.
  useEffect(() => {
    const st = stage.current;
    if (!st) return;
    const ro = new ResizeObserver(() => {
      setSize({ W: st.clientWidth, H: st.clientHeight });
      draw();
    });
    ro.observe(st);
    const offImg = onImage(draw);
    return () => {
      ro.disconnect();
      offImg();
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw, size]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    closeBtn.current?.focus({ preventScroll: true });
  }, []);

  const run = (link: Link, from: string) => {
    const target = link.to;
    if (link.action === 'url' && link.url) return;
    if (link.action === 'back') {
      const prev = hist[hist.length - 1];
      if (!prev) return;
      setHist(hist.slice(0, -1));
      return go(prev, { ...link, anim: 'dissolve', ms: 240 }, false);
    }
    if (link.action === 'close') {
      if (!overlay) return;
      if (reduced || link.anim === 'instant') return setOverlay(null);
      trans.current = {
        from: cur,
        fromScroll: 0,
        to: overlay.id,
        link: { ...overlay.link, ms: link.ms || 240, ease: link.ease },
        t0: 0,
        kind: 'close',
      };
      kick();
      return;
    }
    if (!target || !N[target]) return;
    if (link.action === 'overlay') {
      setOverlay({ id: target, link });
      if (!reduced && link.anim !== 'instant') {
        trans.current = { from: cur, fromScroll: 0, to: target, link, t0: 0, kind: 'open' };
        kick();
      }
      return;
    }
    void from;
    setOverlay(null);
    go(target, link, true);
  };

  const go = (to: string, link: Link, remember: boolean) => {
    if (to === cur && !overlay) return;
    const sc = scroller.current;
    if (remember) setHist([...hist, cur]);
    if (!reduced && link.anim !== 'instant' && link.ms > 0) {
      trans.current = {
        from: cur,
        fromScroll: sc?.scrollTop ?? 0,
        to,
        link,
        t0: 0,
        kind: 'navigate',
      };
      kick();
    }
    setCur(to);
    if (sc) sc.scrollTop = 0;
  };

  const step = (d: 1 | -1) => {
    const i = frames.indexOf(cur);
    const next = frames[(i + d + frames.length) % frames.length];
    if (next)
      go(
        next,
        { action: 'navigate', anim: 'push', dir: d > 0 ? 'left' : 'right', ms: 380, ease: 'out' },
        true,
      );
  };

  const restart = () => {
    setOverlay(null);
    setHist([]);
    go(flow, { action: 'navigate', anim: 'dissolve', dir: 'left', ms: 260, ease: 'out' }, false);
  };

  // Keys, as the prototype viewer has them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (overlay)
          run({ action: 'close', anim: 'move', dir: 'right', ms: 220, ease: 'out' }, cur);
        else close();
      } else if (e.key === 'ArrowRight' && !e.metaKey) step(1);
      else if (e.key === 'ArrowLeft' && !e.metaKey) step(-1);
      else if (e.key === 'r' || e.key === 'R') restart();
      else return;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const spots = f ? hotspots(doc, cur) : [];
  const ovSpots = overlay && N[overlay.id] ? hotspots(doc, overlay.id) : [];
  const contentH = f ? f.h * k + top * 2 : 0;
  const on = overlay ? N[overlay.id] : null;
  const okk = on ? Math.min(1, (size.W - 24) / on.w, k) : 1;
  const ovx = on
    ? on.overlay === 'right'
      ? ox + f.w * k - on.w * okk
      : ox + (f.w * k - on.w * okk) / 2
    : 0;
  const ovy = on ? (on.overlay === 'center' ? top + (size.H - top - on.h * okk) / 2 : top) : 0;

  const spot = (h: Hotspot, scale: number, dx: number, dy: number) => {
    const style = {
      left: dx + h.x * scale,
      top: dy + h.y * scale,
      width: h.w * scale,
      height: h.h * scale,
    };
    if (h.link.action === 'url' && h.link.url) {
      const external = /^https?:/.test(h.link.url);
      return (
        <a
          key={h.id}
          className={s.hot}
          style={style}
          href={h.link.url}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
          aria-label={`${h.label}${external ? ' (opens in a new tab)' : ''}`}
        />
      );
    }
    const dest = h.link.to ? N[h.link.to]?.name : '';
    return (
      <button
        key={h.id}
        type="button"
        className={s.hot}
        style={style}
        aria-label={
          h.link.action === 'close' ? 'Close menu' : `${h.label}${dest ? `: go to ${dest}` : ''}`
        }
        onClick={() => run(h.link, cur)}
      />
    );
  };

  return (
    <div
      className={s.player}
      role="dialog"
      aria-modal="true"
      aria-label="Prototype"
      data-flash={flash || undefined}
      data-hot={showHot || undefined}
    >
      <header className={s.playerBar}>
        <button
          ref={closeBtn}
          type="button"
          className={s.playerBtn}
          onClick={close}
          title="Close (Esc)"
        >
          <Icon name="close" size={14} /> <span>Close</span>
        </button>
        {flows.length > 1 && (
          <Select
            value={flow}
            label="Flow"
            options={flows.map((fl) => ({ value: fl.id, label: fl.flow as string }))}
            onChange={(v) => {
              setFlow(v);
              setOverlay(null);
              setHist([]);
              go(
                v,
                { action: 'navigate', anim: 'dissolve', dir: 'left', ms: 260, ease: 'out' },
                false,
              );
            }}
          />
        )}
        <span className={s.playerTitle} aria-live="polite">
          {f?.name}
        </span>
        <span className={s.playerCount}>
          {frames.indexOf(cur) + 1} / {frames.length}
        </span>
        <button
          type="button"
          className={s.playerBtn}
          onClick={() => step(-1)}
          aria-label="Previous frame"
          title="Previous frame (←)"
        >
          <Icon name="chevron" size={14} className={s.flip} />
        </button>
        <button
          type="button"
          className={s.playerBtn}
          onClick={() => step(1)}
          aria-label="Next frame"
          title="Next frame (→)"
        >
          <Icon name="chevron" size={14} />
        </button>
        <button type="button" className={s.playerBtn} onClick={restart} title="Restart (R)">
          <Icon name="reset" size={14} /> <span>Restart</span>
        </button>
        <button
          type="button"
          className={s.playerBtn}
          aria-pressed={showHot}
          onClick={() => setShowHot(!showHot)}
          title="Show hotspots"
        >
          <Icon name="target" size={14} /> <span>Hotspots</span>
        </button>
      </header>
      <div ref={stage} className={s.playerStage}>
        <canvas ref={canvas} className={s.playerCanvas} aria-hidden="true" />
        <div
          ref={scroller}
          className={s.playerScroll}
          onScroll={draw}
          data-busy={busy || undefined}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('a, button')) return;
            setFlash((n) => n + 1);
            setTimeout(() => setFlash(0), 700);
          }}
        >
          <div className={s.playerSpace} style={{ height: contentH }}>
            {!busy && spots.filter((h) => !h.fixed).map((h) => spot(h, k, ox, top))}
          </div>
        </div>
        <div className={s.playerFixed}>
          {!busy && spots.filter((h) => h.fixed).map((h) => spot(h, k, ox, top))}
        </div>
        {overlay && !busy && (
          <div
            className={s.playerOverlay}
            onPointerDown={(e) =>
              e.target === e.currentTarget &&
              run({ action: 'close', anim: 'move', dir: 'right', ms: 220, ease: 'out' }, cur)
            }
          >
            {ovSpots.map((h) => spot(h, okk, ovx, ovy))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Smart animate: layers with the same name path tween from where they were to where they are. */
function smart(
  ctx: CanvasRenderingContext2D,
  N: Record<string, Node>,
  from: string,
  to: string,
  fromScroll: number,
  t: number,
  dpr: number,
  kOf: (id: string) => number,
  oxOf: (id: string) => number,
  topOf: (id: string) => number,
  W: number,
  H: number,
) {
  const A = flat(N, from),
    B = flat(N, to);
  const byKey = new Map(A.map((it) => [it.key, it]));
  const inB = new Set(B.map((it) => it.key));
  const screen = (frame: string, it: Item, scroll: number): Mat => {
    const k = kOf(frame);
    return mul(
      [k * dpr, 0, 0, k * dpr, oxOf(frame) * dpr, (topOf(frame) - (it.fixed ? 0 : scroll)) * dpr],
      it.m,
    );
  };
  const o: PaintOpts = { scale: dpr, placeholder: '#E3E1DC' };
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  const draw = (n: Node, m: Mat, a: number) => {
    if (a <= 0.001) return;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.globalAlpha = a;
    paintSelf(ctx, n, { ...o, scale: Math.hypot(m[0], m[1]) });
  };
  // What leaves fades out underneath.
  for (const it of A) {
    if (inB.has(it.key)) continue;
    draw(it.node, screen(from, it, fromScroll), it.a * (1 - t));
  }
  for (const it of B) {
    const was = byKey.get(it.key);
    const m1 = screen(to, it, 0);
    if (!was) {
      draw(it.node, m1, it.a * t);
      continue;
    }
    const m0 = screen(from, was, fromScroll);
    const m = m0.map((v, i) => v + (m1[i] - v) * t) as Mat;
    const text = it.node.type === 'text';
    const n: Node = {
      ...it.node,
      w: text ? it.node.w : was.node.w + (it.node.w - was.node.w) * t,
      h: text ? it.node.h : was.node.h + (it.node.h - was.node.h) * t,
      fill:
        it.node.fill && was.node.fill
          ? {
              ...it.node.fill,
              color: mixHex(was.node.fill.color, it.node.fill.color, t),
              opacity: was.node.fill.opacity + (it.node.fill.opacity - was.node.fill.opacity) * t,
            }
          : it.node.fill,
    };
    draw(n, m, was.a + (it.a - was.a) * t);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
