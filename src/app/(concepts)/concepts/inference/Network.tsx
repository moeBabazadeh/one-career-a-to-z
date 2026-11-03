'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { archive, db, featuredProjects, hardware, otherProjects } from '../_shared/data';
import { useAnimationFrame, useInView, useReducedMotion, useScheme } from '../_shared/hooks';
import { projectLinks, type LinkItem } from '../_shared/links';
import { DARK_INK, LAYER_S, drawNet, geometry, readInk, type Geom } from './draw';
import {
  BIAS,
  INPUTS,
  L1,
  L2,
  LAYERS,
  OUTPUTS,
  SUMMARY,
  THRESHOLD,
  allPaths,
  feeds,
  forward,
  necessary,
  trace,
  type NodeRef,
} from './model';
import s from './neural.module.scss';

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const sub = (n: number) => String(n).replace(/\d/g, (d) => SUB[+d]);
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
const same = (a: NodeRef | null, b: NodeRef | null) =>
  !!a && !!b && a.layer === b.layer && a.index === b.index;

/* ------------------------------------------------------------------ what each output is */

interface Product {
  title: string;
  kind: string;
  tag?: string;
  description: string;
  tech: string[];
  figures: string[];
  links: LinkItem[];
  image?: string;
}

const project = (title: string) =>
  [...featuredProjects, ...otherProjects].find((p) => p.title === title);
const archived = (title: string) => archive.find((a) => a.title === title);

const { attendumReader, attendumBeacon } = db.devices;
const attendumApp = `${db.products.attendum.title} app`;

const PRODUCTS: Product[] = OUTPUTS.map((unit) => {
  const device = hardware.find((d) => d.tag === unit.ref);
  if (device) {
    const attendum = device.tag === attendumReader.tag || device.tag === attendumBeacon.tag;
    const p = project(attendum ? db.products.attendum.title : device.name);
    // the archive entry for its firmware: the one built on its chip
    const chip = device.tag === attendumReader.tag ? attendumReader.chip : attendumBeacon.chip;
    const fw = archive.find((a) => a.tech.includes(chip));
    return {
      title: device.name,
      kind: device.kind,
      tag: device.tag,
      description: attendum || !p ? device.detail : p.description,
      tech: attendum ? (fw?.tech ?? []) : (p?.tech ?? []),
      figures: device.figures,
      links: p ? projectLinks({ external: p.links.external }) : [],
      image: attendum ? undefined : featuredProjects.find((f) => f.title === device.name)?.image,
    };
  }
  const p = project(unit.ref);
  const app = unit.label === attendumApp ? archived(attendumApp) : undefined;
  return {
    title: unit.label,
    kind: unit.kind === 'app' ? 'App Store and Google Play' : 'Web platform',
    description: p?.description ?? '',
    tech: app?.tech ?? p?.tech ?? [],
    figures: [],
    links: p ? projectLinks(p.links) : [],
    image: featuredProjects.find((f) => f.title === unit.ref)?.image,
  };
});

/* ------------------------------------------------------------------ inspector */

function Bars({ values, labels, max }: { values: number[]; labels: string[]; max: number }) {
  const order = values
    .map((v, i) => [v, i] as const)
    .filter(([v]) => Math.abs(v) > 0.005)
    .sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))
    .slice(0, 6);
  return (
    <ul className={s.attr}>
      {order.map(([v, i]) => (
        <li key={i}>
          <span className={s.attrLabel}>{labels[i]}</span>
          <span className={s.attrBar}>
            <i
              className={v < 0 ? s.neg : undefined}
              style={{ '--q': Math.abs(v) / max } as React.CSSProperties}
            />
          </span>
          <span className={s.attrVal}>{signed(v)}</span>
        </li>
      ))}
    </ul>
  );
}

function Inspector({
  node,
  x,
  pass,
  paths,
}: {
  node: NodeRef | null;
  x: number[];
  pass: ReturnType<typeof forward>;
  paths: ReturnType<typeof allPaths>;
}) {
  const tr = node ? trace(paths, node) : null;
  const on = pass.p.filter((p) => p >= THRESHOLD).length;

  if (!node || !tr) {
    return (
      <div className={s.inspector}>
        <p className={s.inspKicker}>Inspector</p>
        <h3 className={s.inspTitle}>
          {on} of {OUTPUTS.length} outputs fire
        </h3>
        <p className={s.inspText}>
          Each input is a skill, each output something shipped. Click an input to ablate it and
          watch what stops firing. Select a feature or an output to trace the paths that carry it.
        </p>
        <ul className={s.legend}>
          <li>
            <i className={s.lgPos} /> positive contribution
          </li>
          <li>
            <i className={s.lgNeg} /> negative contribution
          </li>
          <li>
            <i className={s.lgBack} /> gradient, flowing back
          </li>
        </ul>
      </div>
    );
  }

  const chain = (nodes: number[]) => nodes.map((n, l) => LAYERS[l][n].label).join(' → ');
  const topPaths = tr.paths.slice(0, 3);

  if (node.layer === 3) {
    const o = node.index;
    const product = PRODUCTS[o];
    const max = Math.max(...tr.nodes[0].map(Math.abs), 1e-6);
    const need = necessary(x, o);
    return (
      <div className={s.inspector}>
        <p className={s.inspKicker}>
          <span>
            <span className={s.val}>ŷ{sub(o)}</span> · {OUTPUTS[o].kind}
          </span>{' '}
          <span className={`${s.val} ${pass.p[o] >= THRESHOLD ? s.fire : s.quiet}`}>
            p = {pass.p[o].toFixed(2)}
          </span>
        </p>
        <div className={s.inspHead}>
          <div>
            <h3 className={s.inspTitle}>{product.title}</h3>
            <p className={s.inspSub}>
              {product.tag ? `${product.tag} · ` : ''}
              {product.kind}
            </p>
          </div>
          {product.image && (
            <Image
              src={product.image}
              width={1280}
              height={800}
              alt=""
              className={s.inspImg}
              sizes="96px"
            />
          )}
        </div>
        <p className={s.inspText}>{product.description}</p>
        {(product.figures.length > 0 || product.tech.length > 0) && (
          <ul className={`${s.chips}`}>
            {product.figures.map((f) => (
              <li key={f} className={s.chipHot}>
                {f}
              </li>
            ))}
            {product.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {product.links.length > 0 && (
          <p className={s.inspLinks}>
            {product.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                {l.label} ↗
              </a>
            ))}
          </p>
        )}
        <h4 className={s.inspH}>
          Attribution · gradient × input <span>Σ {signed(tr.total)} = logit − b</span>
        </h4>
        {tr.paths.length ? (
          <Bars values={tr.nodes[0]} labels={INPUTS.map((u) => u.label)} max={max} />
        ) : (
          <p className={s.inspNote}>No live paths reach this output. Restore some inputs.</p>
        )}
        <p className={s.inspNote}>
          {need.length
            ? `Ablate ${need.map((i) => INPUTS[i].label).join(' or ')} on its own and this output stops firing.`
            : 'No single ablation stops this output: its evidence is spread across inputs.'}
        </p>
        {topPaths.length > 0 && (
          <>
            <h4 className={s.inspH}>Strongest paths</h4>
            <ol className={s.paths}>
              {topPaths.map((p) => (
                <li key={p.nodes.join()}>
                  <span>{chain(p.nodes.slice(0, 3))}</span>
                  <b>{signed(p.value)}</b>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    );
  }

  const unit = LAYERS[node.layer][node.index];
  const fedBy = feeds(pass, node);
  const outs = tr.nodes[3];
  const fed = OUTPUTS.map((_, o) => o)
    .filter((o) => outs[o] > 0.05)
    .sort((a, b) => outs[b] - outs[a]);
  return (
    <div className={s.inspector}>
      <p className={s.inspKicker}>
        <span>
          {node.layer === 0 ? (
            <>
              <span className={s.val}>x{sub(node.index)}</span> · input
            </>
          ) : (
            `features_${node.layer} · unit ${node.index} · relu`
          )}
        </span>{' '}
        <span className={`${s.val} ${pass.a[node.layer][node.index] > 0 ? s.fire : s.quiet}`}>
          {node.layer ? 'a' : 'x'} = {pass.a[node.layer][node.index].toFixed(2)}
        </span>
      </p>
      <h3 className={s.inspTitle}>{unit.label}</h3>
      <p className={s.inspText}>{'note' in unit ? unit.note : ''}</p>
      {node.layer > 0 && (
        <>
          <h4 className={s.inspH}>
            Fed by <span>Σ = a</span>
          </h4>
          {fedBy.some(Boolean) ? (
            <Bars
              values={fedBy}
              labels={INPUTS.map((u) => u.label)}
              max={Math.max(...fedBy.map(Math.abs), 1e-6)}
            />
          ) : (
            <p className={s.inspNote}>Silent: every input it reads is ablated.</p>
          )}
        </>
      )}
      <h4 className={s.inspH}>
        Drives <span>logit contribution</span>
      </h4>
      {fed.length ? (
        <ul className={s.chips}>
          {fed.map((o) => (
            <li key={o}>
              {OUTPUTS[o].label} <b>{signed(outs[o])}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.inspNote}>
          {node.layer === 0 ? 'Ablated: nothing flows from it.' : 'Nothing right now.'}
        </p>
      )}
      {topPaths.length > 0 && (
        <>
          <h4 className={s.inspH}>Strongest paths</h4>
          <ol className={s.paths}>
            {topPaths.map((p) => (
              <li key={p.nodes.join()}>
                <span>{chain(p.nodes)}</span>
                <b>{signed(p.value)}</b>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ fig. 1 */

const FULL = forward(INPUTS.map(() => 1));
const A_MAX = FULL.a.map((layer) => Math.max(...layer.map(Math.abs)));
const DEFAULT: NodeRef = {
  layer: 3,
  index: OUTPUTS.findIndex((o) => o.label === db.products.neurobuild.title),
};
/** Seconds on the same clock requestAnimationFrame uses. */
const clock = () => performance.now() / 1000;
const delay = (layer: number) =>
  ({ '--d': `${(layer * LAYER_S).toFixed(2)}s` }) as React.CSSProperties;

export default function Network() {
  const reduced = useReducedMotion();
  const scheme = useScheme();
  const [figRef, seen] = useInView<HTMLElement>(true, 0.25);
  const [loopRef, visible] = useInView<HTMLDivElement>(false, 0.02);
  const [ablated, setAblated] = useState<boolean[]>(() => INPUTS.map(() => false));
  const [sel, setSel] = useState<NodeRef | null>(DEFAULT);
  const [hover, setHover] = useState<NodeRef | null>(null);
  const [resetting, setResetting] = useState(false);

  const x = useMemo(() => ablated.map((a) => (a ? 0 : 1)), [ablated]);
  const pass = useMemo(() => forward(x), [x]);
  const paths = useMemo(() => allPaths(pass), [pass]);
  const focus = hover ?? sel;
  const tr = useMemo(() => (focus ? trace(paths, focus) : null), [paths, focus]);
  const live = (seen || reduced) && !resetting;

  /* canvas: sized to the stage, redrawn every frame while on screen */
  const canvas = useRef<HTMLCanvasElement>(null);
  const geom = useRef<Geom | null>(null);
  const passStart = useRef(-1e9);
  const fresh = useRef(true);
  const frame = useRef({ pass, trace: tr, moving: false });
  const ink = useRef(DARK_INK);
  const paint = (t: number) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !geom.current) return;
    const since = live ? t - passStart.current : 0;
    drawNet(ctx, geom.current, {
      ...frame.current,
      since,
      t,
      fresh: fresh.current,
      ink: ink.current,
    });
  };
  const paintRef = useRef(paint);
  // Colours come from the CSS tokens: read again when the scheme flips, then repainted below.
  useEffect(() => {
    if (canvas.current) ink.current = readInk(canvas.current);
  }, [scheme]);
  useEffect(() => {
    frame.current = { pass, trace: tr, moving: !reduced };
    paintRef.current = paint;
    paintRef.current(clock());
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth,
        h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      const card = el.parentElement?.querySelector<HTMLElement>('[data-feature]');
      geom.current = geometry(w, h, (card?.offsetWidth ?? 120) / 2);
      paintRef.current(clock());
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (seen && !reduced) {
      fresh.current = true;
      passStart.current = clock();
    }
  }, [seen, reduced]);

  useAnimationFrame((t) => paintRef.current(t), visible && !reduced);

  const toggle = (i: number) => {
    setAblated(ablated.map((a, k) => (k === i ? !a : a)));
    fresh.current = false;
    passStart.current = clock();
  };
  const restore = () => {
    setAblated(INPUTS.map(() => false));
    fresh.current = false;
    passStart.current = clock();
  };
  const run = () => {
    setResetting(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        fresh.current = true;
        passStart.current = clock();
        setResetting(false);
      }),
    );
  };
  const pick = (node: NodeRef) => setSel(same(sel, node) ? null : node);
  const peek = (node: NodeRef | null) => () => setHover(node);
  const hoverProps = (node: NodeRef) => ({
    onPointerEnter: peek(node),
    onPointerLeave: peek(null),
    onFocus: peek(node),
    onBlur: peek(null),
  });
  // what the input column shows: contributions to a focused feature, else to the focused paths
  const inAttr =
    focus && (focus.layer === 1 || focus.layer === 2) ? feeds(pass, focus) : tr?.nodes[0];
  const lit = (layer: number, i: number) => {
    const values = layer === 0 ? inAttr : tr?.nodes[layer];
    if (!values) return undefined;
    const max = Math.max(...values.map(Math.abs), 1e-6);
    return Math.abs(values[i]) / max;
  };

  const firing = pass.p.filter((p) => p >= THRESHOLD).length;
  const params = SUMMARY.reduce((n, l) => n + l.params, 0);
  const nonzero = SUMMARY.reduce((n, l) => n + l.nonzero, 0);

  return (
    <figure ref={figRef} className={s.fig} aria-labelledby="fig1-cap">
      <div className={s.figBar}>
        <p className={s.figTitle}>
          <b>Fig. 1</b> forward(x)
        </p>
        <p className={s.vec}>
          <span className={s.sr}>
            {x.filter(Boolean).length} of {x.length} inputs on, {firing} of {OUTPUTS.length} outputs
            fire.
          </span>
          <span aria-hidden="true">
            x = [
            {x.map((v, i) => (
              <span key={i} className={v ? s.vecOn : s.vecOff}>
                {v}
              </span>
            ))}
            ]
            <span className={s.vecOut}>
              {' '}
              → {firing}/{OUTPUTS.length} fire
            </span>
          </span>
        </p>
        <div className={s.figActions}>
          <button type="button" className={s.btn} onClick={run}>
            <span aria-hidden="true">▶</span> Run forward pass
          </button>
          <button
            type="button"
            className={s.btn}
            onClick={restore}
            disabled={!ablated.some(Boolean)}
          >
            Restore inputs
          </button>
        </div>
      </div>

      <div className={s.netWrap}>
        <div
          ref={loopRef}
          className={`${s.net} ${live ? s.live : ''} ${resetting ? s.reset : ''} ${tr ? s.tracing : ''}`}
        >
          <p className={`${s.colHead} ${s.colIn}`}>
            x · input <span>· click to ablate</span>
          </p>
          <div className={`${s.colHead} ${s.colMid}`} aria-hidden="true">
            <span style={{ left: '27%' }}>
              features_1 · relu <i>{L1.length}</i>
            </span>
            <span style={{ left: '66%' }}>
              features_2 · relu <i>{L2.length}</i>
            </span>
          </div>
          <p className={`${s.colHead} ${s.colOut}`}>
            ŷ <span>· click to trace</span>
          </p>

          <ol className={s.inputs} aria-label="Inputs. Toggle one to ablate it." style={delay(0)}>
            {INPUTS.map((u, i) => {
              const w = lit(0, i);
              const node = { layer: 0, index: i };
              return (
                <li key={u.label}>
                  <button
                    type="button"
                    className={s.in}
                    aria-pressed={!ablated[i]}
                    aria-label={`${u.label}, input ${i}`}
                    onClick={() => toggle(i)}
                    {...hoverProps(node)}
                    style={w != null ? ({ '--w': w } as React.CSSProperties) : undefined}
                    data-lit={w ? '' : undefined}
                    data-neg={inAttr && inAttr[i] < 0 ? '' : undefined}
                  >
                    <span className={s.idx}>x{sub(i)}</span>
                    <span className={s.inLabel}>{u.label}</span>
                    <span className={s.inVal}>
                      {inAttr && inAttr[i] ? signed(inAttr[i]) : x[i].toFixed(1)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className={s.stage}>
            <canvas ref={canvas} aria-hidden="true" />
            {[L1, L2].map((units, l) =>
              units.map((u, j) => {
                const layer = l + 1;
                const node = { layer, index: j };
                const a = pass.a[layer][j];
                const w = lit(layer, j);
                return (
                  <button
                    key={u.label}
                    type="button"
                    data-feature=""
                    className={`${s.feat} ${layer === 1 ? s.feat1 : s.feat2}`}
                    style={
                      {
                        top: `${((j + 0.5) / units.length) * 100}%`,
                        '--a': live ? a / A_MAX[layer] : 0,
                        '--w': w ?? 0,
                        ...delay(layer),
                      } as React.CSSProperties
                    }
                    aria-pressed={same(sel, node)}
                    aria-label={`${u.label}, features_${layer} unit ${j}, activation ${a.toFixed(2)}`}
                    data-lit={w ? '' : undefined}
                    data-dead={a === 0 ? '' : undefined}
                    onClick={() => pick(node)}
                    {...hoverProps(node)}
                  >
                    <span className={s.featFill} aria-hidden="true" />
                    <span className={s.featLabel}>{u.label}</span>
                  </button>
                );
              }),
            )}
          </div>

          <ol
            className={s.outputs}
            aria-label="Outputs. Select one to trace its attribution."
            style={delay(3)}
          >
            {OUTPUTS.map((u, o) => {
              const node = { layer: 3, index: o };
              const p = pass.p[o];
              return (
                <li key={u.label}>
                  <button
                    type="button"
                    className={s.out}
                    aria-pressed={same(sel, node)}
                    onClick={() => pick(node)}
                    {...hoverProps(node)}
                    data-fire={p >= THRESHOLD ? '' : undefined}
                    data-lit={lit(3, o) ? '' : undefined}
                    aria-label={`${u.label}, ${u.kind}, p ${p.toFixed(2)}`}
                  >
                    <span className={s.outLabel}>{u.label}</span>
                    <span className={s.outVal}>{p.toFixed(2)}</span>
                    <span className={s.outBar} aria-hidden="true">
                      <i style={{ '--p': live ? p : 0 } as React.CSSProperties} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <aside className={s.inspWrap} aria-label="Inspector">
          <Inspector node={focus} x={x} pass={pass} paths={paths} />
        </aside>
      </div>

      <figcaption id="fig1-cap" className={s.caption}>
        <p>
          <b>Fig. 1.</b> A forward pass from skills to what they shipped: 11 inputs, two layers of
          labelled features, and a sigmoid head with a bias that puts every output at p ≈ 0.95 when
          all inputs are on. The weights are set by hand, not learned. With no hidden biases the
          network is piecewise linear, so gradient × input is exact here: the paths into an output
          sum to its logit minus its bias.
        </p>
        <details className={s.summary}>
          <summary>model.summary()</summary>
          <pre>
            {[
              'Layer (type)               Output shape   Param #   Non-zero',
              '────────────────────────────────────────────────────────────',
              `input (InputLayer)         (None, ${INPUTS.length})       0         0`,
              ...SUMMARY.map(
                (l) =>
                  `${`${l.name} (Dense, ${l.activation})`.padEnd(27)}${`(None, ${l.units})`.padEnd(15)}${String(l.params).padEnd(10)}${l.nonzero}`,
              ),
              '────────────────────────────────────────────────────────────',
              `Total params: ${params}   Non-zero: ${nonzero} (${Math.round((1 - nonzero / params) * 100)}% sparse)`,
              `Head bias: [${BIAS.map((b) => b.toFixed(2)).join(', ')}]`,
            ].join('\n')}
          </pre>
        </details>
      </figcaption>
    </figure>
  );
}
