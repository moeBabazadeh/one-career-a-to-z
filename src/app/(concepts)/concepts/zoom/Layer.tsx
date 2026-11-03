'use client';

import { useSceneProgress, useStageCanvas, type SceneDraw } from './depth';
import type { LayerInfo } from './layers';
import s from './stack.module.scss';

/**
 * One layer of the descent: a sticky full-screen stage with the scene and its narration, and a
 * story column of cards that scrolls over it. The narration steps with the scroll.
 */
export function Layer({
  info,
  title,
  intro,
  captions,
  scene,
  children,
}: {
  info: LayerInfo;
  title: string;
  intro: React.ReactNode;
  captions: string[];
  scene: (progress: React.RefObject<number>) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [ref, progress] = useSceneProgress<HTMLElement>(captions.length);

  return (
    <section
      ref={ref}
      id={info.id}
      className={`${s.layer} ${s[info.id] ?? ''}`}
      data-step="0"
      style={{ '--accent': info.accent, '--bg': info.bg } as React.CSSProperties}
      aria-labelledby={`${info.id}-title`}
    >
      <p className={s.boundary} aria-hidden="true">
        <span>
          ▼ {String(info.n).padStart(2, '0')} · {info.crossing}
        </span>
      </p>
      <div className={s.stage}>
        <div className={s.scene}>{scene(progress)}</div>
        <div className={s.narration}>
          <p className={s.tag}>
            <b>L{info.n}</b> {info.tech}
            <span>{info.scale}</span>
          </p>
          <ol
            className={s.captions}
            aria-label={`What happens in the ${info.tech.toLowerCase()} layer`}
          >
            {captions.map((c, i) => (
              <li key={c} style={{ '--i': i } as React.CSSProperties}>
                {c}
              </li>
            ))}
          </ol>
          <span className={s.dots} aria-hidden="true">
            {captions.map((c, i) => (
              <i key={c} style={{ '--i': i } as React.CSSProperties} />
            ))}
          </span>
        </div>
      </div>
      <div className={s.story}>
        <header className={s.layerHead}>
          <p className={s.kicker}>
            Layer {info.n} · {info.tech}
          </p>
          <h2 id={`${info.id}-title`}>{title}</h2>
          <div className={s.intro}>{intro}</div>
        </header>
        {children}
      </div>
    </section>
  );
}

/** A full-stage canvas scene. */
export function CanvasScene({
  draw,
  progress,
  label,
  poster,
}: {
  draw: SceneDraw;
  progress: React.RefObject<number>;
  label: string;
  poster?: number;
}) {
  const { wrap, canvas } = useStageCanvas(draw, progress, poster);
  return (
    <div ref={wrap} className={s.canvasWrap}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
