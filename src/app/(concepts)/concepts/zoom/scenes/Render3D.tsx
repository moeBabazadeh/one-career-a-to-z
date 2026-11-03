import Image from 'next/image';
import { db, featuredProjects } from '../../_shared/data';
import s from '../stack.module.scss';

// Layer 1: the compositor's view, like the 3D layers panel in DevTools. The page splits into
// its compositing layers (here, the platforms he shipped), a hit-test ray drops through them,
// and the frame pipeline runs underneath. Driven entirely by --p and data-step from the section.

export const PIPELINE = ['Hit test', 'Style', 'Layout', 'Paint', 'Composite'];

export default function Render3D() {
  return (
    <div
      className={s.r3d}
      role="img"
      aria-label="The page exploded into its compositing layers, one per platform, with a hit-test ray dropping through them and the five stages of a frame below."
    >
      <div className={s.r3dView}>
        <div className={s.r3dStack}>
          <div className={`${s.plane} ${s.planeDoc}`} style={{ '--k': 0 } as React.CSSProperties}>
            <span className={s.planeTag}>#document · root layer</span>
            <span className={s.docName}>{db.person.name}</span>
            <span className={s.docButton}>{`Hire ${db.person.first}`}</span>
          </div>
          {featuredProjects.map((p, i) => (
            <div key={p.title} className={s.plane} style={{ '--k': i + 1 } as React.CSSProperties}>
              <Image
                src={p.image}
                width={1280}
                height={800}
                alt=""
                sizes="(max-width: 1100px) 80vw, 480px"
              />
              <span className={s.planeTag}>
                layer {i + 1} · {p.title}
              </span>
            </div>
          ))}
          <span className={s.ray} />
        </div>
      </div>
      <div className={s.frame}>
        <ol className={s.pipeline}>
          {PIPELINE.map((stage, i) => (
            <li key={stage} style={{ '--i': i } as React.CSSProperties}>
              {stage}
            </li>
          ))}
        </ol>
        <div className={s.budget}>
          <span className={s.budgetFill} />
          <span className={s.budgetHead} />
        </div>
        <p className={s.budgetLabel}>
          <span>one frame · 16.7 ms</span>
          <span>played 100× slower</span>
        </p>
      </div>
    </div>
  );
}
