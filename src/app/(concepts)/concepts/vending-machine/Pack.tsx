import Image from 'next/image';
import type { CSSProperties } from 'react';
import { db } from '../_shared/data';
import Glyph from './Glyph';
import type { Item } from './stock';
import s from './vending.module.scss';

/**
 * One item as it sits on the coil: a bag, a blister pack, a box, a can, a tube, a gum pack or a
 * candy bar, depending on what it is. Sized by its slot (or its tray spot) and drawn in CSS, so
 * the same packaging falls, lands and opens. Decorative: the slot's button carries the name.
 */
export default function Pack({ item }: { item: Item }) {
  // Names are set as large as their packaging allows: --fit is the length the type has to fit.
  const fit =
    item.pack === 'can' && item.special !== 'about'
      ? item.title.length
      : item.pack === 'gum'
        ? Math.max(...item.title.split(/[-/ ]/).map((w) => w.length))
        : 0;
  return (
    <span
      className={`${s.pack} ${s[item.pack]}`}
      data-tone={item.tone}
      style={fit ? ({ '--fit': fit } as CSSProperties) : undefined}
    >
      <Inner item={item} />
    </span>
  );
}

function Inner({ item }: { item: Item }) {
  const { title, sub, tag, glyph, art, qty, year } = item;
  switch (item.pack) {
    case 'bag':
      return (
        <>
          <span className={s.crimp} />
          <span className={s.bagFace}>
            <span className={s.bagTitle}>{title}</span>
            {art && (
              <span className={s.bagArt}>
                <Image src={art.src} width={1280} height={800} alt="" sizes="160px" />
              </span>
            )}
            <span className={s.bagFoot}>{qty ? `${qty.n} ${qty.unit}` : sub}</span>
          </span>
          <span className={`${s.crimp} ${s.crimpLow}`} />
        </>
      );
    case 'blister':
      return (
        <>
          <span className={s.hang} />
          <span className={s.blTag}>{tag ?? (year === '—' ? item.code : year)}</span>
          <span className={s.bubble}>{glyph && <Glyph name={glyph} />}</span>
          <span className={s.blName}>{title}</span>
        </>
      );
    case 'box':
      return (
        <>
          <span className={s.boxLid} />
          <span className={s.boxFace}>
            <span className={s.boxKind}>{tag}</span>
            {glyph && <Glyph name={glyph} className={s.boxGlyph} />}
            <span className={s.boxName}>{title}</span>
          </span>
        </>
      );
    case 'can':
      return (
        <>
          <span className={s.canTop} />
          <span className={s.canBody}>
            {item.special === 'about' && (
              <span className={s.canPhoto}>
                <Image src={db.person.photo} width={600} height={600} alt="" sizes="48px" />
              </span>
            )}
            <span className={item.special === 'about' ? s.canNameFlat : s.canName}>
              {item.special === 'about' ? db.person.first : title}
            </span>
            <span className={s.canYear}>{year}</span>
          </span>
        </>
      );
    case 'doc':
      return (
        <span className={s.docSheet}>
          <span className={s.docTitle}>CV</span>
          <span className={s.docLines} />
          <span className={s.docYear}>{year}</span>
        </span>
      );
    case 'envelope':
      return (
        <>
          <span className={s.envFlap} />
          <span className={s.envAt}>@</span>
          <span className={s.envName}>{title}</span>
        </>
      );
    case 'tube':
      return (
        <>
          <span className={s.tubeCap} />
          <span className={s.tubeBody}>
            <span className={s.tubeName}>{title}</span>
            <span className={s.tubeSub}>{tag}</span>
          </span>
        </>
      );
    case 'sheet':
      return (
        <>
          <span className={s.sheetHead}>{title}</span>
          <span className={s.sheetId}>{tag}</span>
          <span className={s.docLines} />
        </>
      );
    case 'gum':
      return (
        <>
          <span className={s.gumStripe} />
          <span className={s.gumPr}>{tag}</span>
          <span className={s.gumName}>{title}</span>
          {glyph && <Glyph name={glyph} className={s.gumGlyph} />}
        </>
      );
    case 'bar':
      return (
        <>
          <span className={s.crimp} />
          <span className={s.barBody}>
            <span className={s.barName}>{title}</span>
          </span>
          <span className={`${s.crimp} ${s.crimpLow}`} />
        </>
      );
  }
}
