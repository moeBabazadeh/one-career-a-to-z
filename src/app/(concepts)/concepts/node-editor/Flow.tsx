'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db, profile } from '../_shared/data';
import { useAnimationFrame, useInView, useReducedMotion } from '../_shared/hooks';
import {
  CV_FILE,
  FLOWS,
  FLOW_MAP,
  HELLO,
  NODE_COUNT,
  hexId,
  nodeH,
  nodeW,
  outputsOf,
  typeOf,
  type Json,
} from './flows';
import {
  INITIAL,
  MOBILE,
  lengthOf,
  nodeOf,
  pointAt,
  wireSegs,
  type Positions,
  type Pt,
} from './geometry';
import { Icon, Logo } from './icons';
import { Debug, Info, Palette, type DebugMsg } from './Panels';
import { SKILLS } from './palette';
import { Sim, type Duration, type SimEvent } from './sim';
import { MobileFlow, Workspace } from './Workspace';
import s from './flow.module.scss';

const MAX_MESSAGES = 120;
const ext = { target: '_blank', rel: 'noreferrer' } as const;
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

// A node lights up while it handles a message.
const FLASH: Keyframe[] = [
  { boxShadow: '0 0 0 0 rgba(255,107,74,0)', filter: 'brightness(1)' },
  {
    boxShadow: '0 0 0 3px rgba(255,107,74,.6), 0 0 24px 4px rgba(255,107,74,.5)',
    filter: 'brightness(1.1)',
    offset: 0.2,
  },
  { boxShadow: '0 0 0 0 rgba(255,107,74,0)', filter: 'brightness(1)' },
];

export default function FlowEditor() {
  const reduced = useReducedMotion();
  // The runtime pauses when neither the canvas nor the info and debug panes are on screen.
  const rootRef = useRef<HTMLDivElement>(null);
  const [mainRef, mainInView] = useInView<HTMLElement>(false, 0);
  const [sideRef, sideInView] = useInView<HTMLElement>(false, 0);
  const inView = mainInView || sideInView;
  const [sim] = useState(() => new Sim());
  const [current, setCurrent] = useState(FLOWS[0].id);
  const [positions, setPositions] = useState<Positions>(INITIAL);
  const [selected, setSelected] = useState<{ flow: string; node: string } | null>(null);
  const [skillId, setSkillId] = useState<string | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState<ReadonlySet<string>>(() => new Set());
  const [muted, setMuted] = useState<ReadonlySet<string>>(() => new Set());
  const [messages, setMessages] = useState<DebugMsg[]>([]);
  const [filter, setFilter] = useState<'current' | 'all'>('current');
  const [toast, setToast] = useState<{ id: number; text: string; warn: boolean } | null>(null);
  const [tour, setTour] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const posRef = useRef(INITIAL);
  const live = useRef({ current, muted, reduced });
  const deskDots = useRef<SVGGElement>(null);
  const mobDots = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const deployMenu = useRef<HTMLDetailsElement>(null);
  const userMenu = useRef<HTMLDetailsElement>(null);
  const toastTimer = useRef(0);
  const lastFrame = useRef(0);
  const msgCount = useRef(0);

  useEffect(() => {
    live.current = { current, muted, reduced };
  });

  const flow = FLOW_MAP.get(current)!;
  const animate = deployed && running && !reduced;

  /* ---------------------------------------------------------------- runtime */

  // Wires take time in proportion to their length; radio and link hops take a little longer.
  const duration = useCallback<Duration>((f, wire) => {
    if (wire.kind === 'radio' || wire.kind === 'link') return 1.05;
    if (wire.kind === 'feedback') return 0.9;
    return Math.min(0.85, Math.max(0.26, lengthOf(wireSegs(f, wire, posRef.current[f.id])) / 520));
  }, []);

  const flash = useCallback(
    (node: string, hold: number) => {
      rootRef.current?.querySelectorAll(`[data-node="${node}"]`).forEach((el) => {
        el.querySelector('[data-body]')?.animate(FLASH, { duration: 650, easing: 'ease-out' });
        if (hold >= 0.3)
          el.querySelector('[data-hold]')?.animate(
            [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
            { duration: hold * 1000 },
          );
      });
    },
    [rootRef],
  );

  const handle = useCallback(
    (events: SimEvent[]) => {
      const time = new Date().toLocaleString('en-GB');
      const fresh: DebugMsg[] = [];
      for (const e of events) {
        if (e.type === 'busy') {
          if (!live.current.reduced && e.flow === live.current.current) flash(e.node, e.hold);
        } else if (!live.current.muted.has(`${e.flow}:${e.node}`)) {
          fresh.push({
            id: ++msgCount.current,
            flow: e.flow,
            node: e.node,
            time,
            topic: e.msg.topic,
            payload: e.msg.payload,
          });
        }
      }
      if (fresh.length) setMessages((m) => [...m, ...fresh].slice(-MAX_MESSAGES));
    },
    [flash],
  );

  // Places the glowing dots: on the bezier wires on desktop, along the spine on phones.
  const draw = () => {
    const id = live.current.current;
    const f = FLOW_MAP.get(id)!;
    const active = sim.transits.filter((t) => t.flow === id);
    const g = deskDots.current;
    if (g) {
      const pos = posRef.current[id];
      for (let i = 0; i < g.children.length; i++) {
        const dot = g.children[i] as SVGGElement;
        const t = active[i];
        dot.style.opacity = t ? '1' : '0';
        if (!t) continue;
        const segs = wireSegs(f, t.wire, pos);
        const p = Math.min(1, (sim.time - t.t0) / t.dur);
        dot.dataset.kind = t.wire.kind ?? '';
        [p, p - 0.08, p - 0.04, p].forEach((q, j) => {
          const pt = pointAt(segs, Math.max(0, q));
          const c = dot.children[j];
          c.setAttribute('cx', pt.x.toFixed(1));
          c.setAttribute('cy', pt.y.toFixed(1));
        });
      }
    }
    const m = mobDots.current;
    if (m) {
      const layout = MOBILE[id];
      let i = 0;
      for (const t of active) {
        const a = layout.rankOf[t.wire.from];
        const b = layout.rankOf[t.wire.to];
        if (b <= a || i >= m.children.length) continue;
        const y0 = layout.ranks[a].y + layout.ranks[a].h;
        const y1 = layout.ranks[b].y;
        const el = m.children[i++] as HTMLElement;
        el.style.opacity = '1';
        el.style.transform = `translate(-50%, ${(y0 + (y1 - y0) * Math.min(1, (sim.time - t.t0) / t.dur)).toFixed(1)}px)`;
      }
      for (; i < m.children.length; i++) (m.children[i] as HTMLElement).style.opacity = '0';
    }
  };

  useAnimationFrame((sec) => {
    const dt = lastFrame.current ? Math.min(0.05, sec - lastFrame.current) : 0;
    lastFrame.current = sec;
    handle(sim.step(dt, duration));
    draw();
  }, animate && inView);

  // When the flows stop, nothing is in flight: hide the dots.
  useEffect(() => {
    lastFrame.current = 0;
    if (animate) return;
    const dots = [...(deskDots.current?.children ?? []), ...(mobDots.current?.children ?? [])] as (
      HTMLElement | SVGElement
    )[];
    for (const el of dots) el.style.opacity = '0';
  }, [animate, current]);

  /* ---------------------------------------------------------------- editor actions */

  const notify = useCallback((text: string, warn = false) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, warn });
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const closeMenus = () => {
    for (const m of [deployMenu.current, userMenu.current]) if (m) m.open = false;
  };

  const deploy = (auto = false) => {
    sim.start();
    setDeployed(true);
    setRunning(true);
    setDirty(new Set());
    setTour(false);
    closeMenus();
    // With reduced motion every flow runs once, straight to the end: a still, full picture.
    if (reduced) handle(sim.snapshot(duration));
    if (!(auto && reduced)) notify('Successfully deployed');
  };

  const setRun = (on: boolean) => {
    closeMenus();
    if (on) {
      sim.start();
      if (reduced) handle(sim.snapshot(duration));
    } else sim.stop();
    setRunning(on);
    notify(on ? 'Flows started' : 'Flows stopped');
  };

  // Visitors who don't press Deploy get a deploy anyway after a while (at once with reduced motion).
  const deployRef = useRef(deploy);
  useEffect(() => {
    deployRef.current = deploy;
  });
  useEffect(() => {
    if (deployed) return;
    const id = window.setTimeout(() => deployRef.current(true), reduced ? 0 : 9000);
    return () => window.clearTimeout(id);
  }, [deployed, reduced]);

  // The whole career in the editor's own export format: tabs, groups, and nodes with their wires.
  const exportFlows = () => {
    closeMenus();
    const id = (flowId: string, nodeId?: string) => hexId(nodeId ? `${flowId}/${nodeId}` : flowId);
    const out: object[] = [];
    for (const f of FLOWS) {
      out.push({ id: id(f.id), type: 'tab', label: f.label, info: f.comment });
      for (const g of f.groups)
        out.push({
          id: id(f.id, `group/${g.label}`),
          type: 'group',
          z: id(f.id),
          name: g.label,
          nodes: g.nodes.map((n) => id(f.id, n)),
        });
      for (const n of f.nodes) {
        const p = posRef.current[f.id][n.id];
        const from = f.wires.filter((w) => w.from === n.id);
        const links = from
          .filter((w) => w.kind === 'radio' || w.kind === 'link')
          .map((w) => id(f.id, w.to));
        out.push({
          id: id(f.id, n.id),
          type: typeOf(n),
          z: id(f.id),
          name: n.label,
          x: Math.round(p.x + nodeW(n) / 2),
          y: Math.round(p.y + nodeH(n) / 2),
          wires: Array.from({ length: outputsOf(n) }, (_, port) =>
            from.filter((w) => !w.kind && w.port === port).map((w) => id(f.id, w.to)),
          ),
          ...(links.length ? { links } : {}),
        });
      }
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'babazadeh-flows.json';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Exported ${FLOWS.length} flows and ${NODE_COUNT} nodes to babazadeh-flows.json`);
  };

  const inject = (nodeId: string) => {
    const node = nodeOf(current, nodeId);
    if (!deployed)
      return notify(`Inject failed: “${node.label}” isn’t deployed yet. Press Deploy first.`, true);
    if (!running) return notify('Inject failed: the flows are stopped.', true);
    handle(sim.inject(current, nodeId, duration, { instant: reduced }));
    notify(`Successfully injected: ${node.label}`);
  };

  const send = (note: string) => {
    if (!deployed || !running) deploy();
    const payload: Json = { ...HELLO, body: note || null };
    handle(sim.inject('contact', 'hello', duration, { instant: reduced, payload }));
    notify('Sent through the flow. Opening your mail app…');
  };

  const move = (id: string, pt: Pt, done: boolean) => {
    posRef.current = { ...posRef.current, [current]: { ...posRef.current[current], [id]: pt } };
    if (!done) return;
    setPositions(posRef.current);
    if (deployed) setDirty((d) => new Set(d).add(`${current}:${id}`));
  };

  const select = (id: string | null) => {
    setSkillId(null);
    setSelected(id ? { flow: current, node: id } : null);
  };

  const switchTo = (id: string) => {
    setCurrent(id);
    setSelected(null);
    setSkillId(null);
  };

  const reveal = useCallback((flowId: string, nodeId: string) => {
    setCurrent(flowId);
    setSkillId(null);
    setSelected({ flow: flowId, node: nodeId });
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const pickSkill = useCallback((id: string) => {
    setSelected(null);
    setSkillId(id);
    setPaletteOpen(false);
  }, []);

  const pickContrib = useCallback(
    (id: string) => {
      reveal('oss', id);
      setPaletteOpen(false);
    },
    [reveal],
  );

  const toggleMuted = (id: string) =>
    setMuted((m) => {
      const next = new Set(m);
      const key = `${current}:${id}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = FLOWS[(i + d + FLOWS.length) % FLOWS.length];
    switchTo(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  // Menus close on an outside click.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      for (const m of [deployMenu.current, userMenu.current])
        if (m?.open && !m.contains(target)) m.open = false;
      if (!target.closest('#flow-palette, [aria-controls="flow-palette"]')) setPaletteOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const node = selected && selected.flow === current ? nodeOf(current, selected.node) : null;
  const skill = skillId ? (SKILLS.find((k) => k.id === skillId) ?? null) : null;
  const sheet = Boolean(node || skill);

  // On phones the properties open as a sheet: move focus into it.
  useEffect(() => {
    if (sheet && matchMedia('(max-width: 900px)').matches) closeRef.current?.focus();
  }, [sheet, node, skill]);

  const closeInfo = () => {
    const id = selected?.node;
    setSelected(null);
    setSkillId(null);
    // back to the node that opened the sheet (the visible copy: desktop and phone views both exist)
    if (id && matchMedia('(max-width: 900px)').matches)
      [...(rootRef.current?.querySelectorAll<HTMLElement>(`[data-node="${id}"] [data-body]`) ?? [])]
        .find((el) => el.offsetParent)
        ?.focus();
  };

  const pending = !deployed || dirty.size > 0;
  const shown = filter === 'all' ? messages : messages.filter((m) => m.flow === current);
  const empty = !deployed
    ? 'Nothing yet. Press Deploy and messages print here.'
    : !running
      ? 'The flows are stopped.'
      : `Waiting for “${filter === 'current' ? flow.label : 'any flow'}” to send something…`;

  const canvas = {
    flow,
    selected: node?.id ?? null,
    showStatus: deployed && running,
    isChanged: (id: string) => !deployed || dirty.has(`${current}:${id}`),
    isMuted: (id: string) => muted.has(`${current}:${id}`),
    onSelect: select,
    onInject: inject,
    onToggle: toggleMuted,
  };

  return (
    <div
      ref={rootRef}
      className={cx(s.root, paletteOpen && s.paletteOpen)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          closeMenus();
          setPaletteOpen(false);
          if (sheet) closeInfo();
        }
      }}
    >
      <header className={s.header}>
        <div className={s.brand}>
          <Logo />
          <div>
            <h1>{profile.name}</h1>
            <p>
              {`${profile.role} at ${profile.company}`}
              <span>{` · flows since ${db.person.since}`}</span>
            </p>
          </div>
        </div>

        {tour && !deployed && (
          <p className={s.tour}>
            <span>
              <b>{`Hi, I’m ${db.person.first}.`}</b> This is my career, wired as flows. Press Deploy
              to run them.
            </span>
            <button
              type="button"
              className={s.tourClose}
              onClick={() => setTour(false)}
              aria-label="Dismiss hint"
            >
              <Icon name="close" />
            </button>
          </p>
        )}

        <div className={s.actions}>
          <div className={cx(s.deploy, pending && s.pending)}>
            <button type="button" className={s.deployBtn} onClick={() => deploy()}>
              <Icon name="deploy" />
              Deploy
            </button>
            <details ref={deployMenu} className={s.menu}>
              <summary aria-label="Deploy options">
                <Icon name="caret" />
              </summary>
              <div className={s.menuList}>
                <button type="button" onClick={() => deploy()}>
                  Full deploy
                </button>
                <button type="button" onClick={() => setRun(true)} disabled={!deployed}>
                  {running ? 'Restart flows' : 'Start flows'}
                </button>
                <button
                  type="button"
                  onClick={() => setRun(false)}
                  disabled={!deployed || !running}
                >
                  Stop flows
                </button>
                <hr />
                <button type="button" onClick={exportFlows}>
                  Export flows.json
                </button>
              </div>
            </details>
          </div>
          <details ref={userMenu} className={cx(s.menu, s.user)}>
            <summary aria-label="Contact links">
              <Image src={db.person.photo} width={64} height={64} alt="" />
            </summary>
            <div className={s.menuList}>
              <p>
                Signed in as <b>{db.person.first.toLowerCase()}</b>
              </p>
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
              <a href={profile.linkedin} {...ext}>
                LinkedIn
              </a>
              <a href={profile.github} {...ext}>
                GitHub
              </a>
              <a href={profile.cv} {...ext}>
                {`CV · ${CV_FILE}`}
              </a>
            </div>
          </details>
        </div>
      </header>

      <main ref={mainRef} className={s.main}>
        <div className={s.tabs}>
          <button
            type="button"
            className={s.paletteToggle}
            aria-expanded={paletteOpen}
            aria-controls="flow-palette"
            onClick={() => setPaletteOpen(!paletteOpen)}
          >
            <Icon name="search" />
            palette
          </button>
          <div role="tablist" aria-label="Flows" className={s.tablist}>
            {FLOWS.map((f, i) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                id={`tab-${f.id}`}
                className={s.tab}
                aria-selected={f.id === current}
                aria-controls="flow-panel"
                tabIndex={f.id === current ? 0 : -1}
                onClick={() => switchTo(f.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.toastWrap} role="status" aria-live="polite">
          {toast && (
            <p key={toast.id} className={cx(s.toast, toast.warn && s.warn)}>
              {toast.text}
            </p>
          )}
        </div>

        <div role="tabpanel" id="flow-panel" aria-labelledby={`tab-${current}`} className={s.panel}>
          <Workspace
            {...canvas}
            positions={positions[current]}
            onMove={move}
            dotsRef={deskDots}
            footer={
              <p className={s.runState}>
                <i
                  className={cx(
                    s.statusDot,
                    deployed && running ? s.green : deployed ? s.grey : s.blue,
                    !(deployed && running) && s.ring,
                  )}
                />
                {!deployed ? 'not deployed' : running ? 'running' : 'stopped'} · {FLOWS.length}{' '}
                flows · {NODE_COUNT} nodes
                <span className={s.hintText}>
                  drag nodes · drag the canvas to pan · ctrl + scroll to zoom
                </span>
              </p>
            }
          />
          <p className={s.mhint}>
            <span>{`// ${flow.comment}`}</span>
            Tap a node for its properties. Messages print in the debug pane below.
          </p>
          <MobileFlow {...canvas} dotsRef={mobDots} />
        </div>
      </main>

      <aside ref={sideRef} className={s.side} data-sheet={sheet || undefined}>
        <button
          type="button"
          className={s.scrim}
          tabIndex={-1}
          aria-hidden="true"
          onClick={closeInfo}
        />
        <Info
          flow={flow}
          node={node}
          skill={skill}
          onClose={closeInfo}
          closeRef={closeRef}
          onSend={send}
        />
        <Debug
          messages={shown}
          filter={filter}
          onFilter={setFilter}
          onClear={() => setMessages([])}
          onReveal={reveal}
          empty={empty}
        />
      </aside>

      <Palette
        active={skillId}
        onSkill={pickSkill}
        onContrib={pickContrib}
        onClose={closePalette}
      />
    </div>
  );
}
