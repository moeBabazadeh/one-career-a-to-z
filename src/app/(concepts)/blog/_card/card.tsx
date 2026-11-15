import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { person } from '@/content/db';
import type { Topic } from '../posts';
import { INK, MUTED, TILE, CORAL, patterns, titleSize } from './look';

/*
 * The blog's share card, the image a link to a post unfurls into: the wordmark, the blog's
 * address, the post's title and a line under it, on its topic's pattern, drawn at 1200 × 630. The
 * covers on the blog's own pages are the same card in HTML (Cover.tsx). Inter is read from the two
 * files beside this one (Open Font License, see OFL.txt), since the image renderer can't use the
 * site's web fonts.
 */

export const cardSize = { width: 1200, height: 630 };
export const cardType = 'image/png';

const inter = (weight: 500 | 800) =>
  readFile(join(process.cwd(), 'src/app/(concepts)/blog/_card', `inter-${weight}.woff`));

export async function card(title: string, line: string, topic?: Topic) {
  const [medium, extraBold] = await Promise.all([inter(500), inter(800)]);
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '64px 72px',
        backgroundColor: TILE,
        ...(topic ? patterns[topic] : {}),
        color: INK,
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 50, fontWeight: 800, letterSpacing: '-0.04em' }}>
          {person.first.toLowerCase()}
          <span style={{ color: CORAL }}>.</span>
        </div>
        <div style={{ display: 'flex', color: MUTED, fontSize: 28, fontWeight: 500 }}>
          {`${person.site}/blog`}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div
          style={{
            display: 'flex',
            fontSize: titleSize(title),
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: '-0.035em',
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', color: MUTED, fontSize: 28, fontWeight: 500 }}>{line}</div>
      </div>
    </div>,
    {
      ...cardSize,
      fonts: [
        { name: 'Inter', data: medium, weight: 500, style: 'normal' },
        { name: 'Inter', data: extraBold, weight: 800, style: 'normal' },
      ],
    },
  );
}
