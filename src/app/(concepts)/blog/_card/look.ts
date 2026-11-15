import type { Topic } from '../posts';

/*
 * The look of a post's cover, shared by the share image (card.tsx, drawn at 1200 × 630) and the
 * covers on the blog's pages (Cover.tsx), so a post looks the same in a LinkedIn feed as on the site.
 */

export const TILE = '#111214';
export const INK = '#ffffff';
export const MUTED = '#a3adb9';
export const CORAL = '#ff5f6d';

/** The title's size on a 1200-wide card: long titles step down so three lines always fit. */
export const titleSize = (title: string) =>
  title.length <= 34 ? 92 : title.length <= 64 ? 74 : 58;

const lines = (colour: string, size: number) => ({
  backgroundImage: `linear-gradient(${colour} 1px, transparent 1px), linear-gradient(90deg, ${colour} 1px, transparent 1px)`,
  backgroundSize: `${size}px ${size}px`,
});

/**
 * Each topic's pattern behind the cover: dots, a circuit-board grid, diagonal stripes, or a coral
 * bar along the bottom. Written as CSS backgrounds, which both the page and the image renderer draw.
 */
export const patterns: Record<Topic, { backgroundImage: string; backgroundSize: string }> = {
  'side-projects': {
    // In percentages and without a shape: the image renderer skips `circle` and pixel stops.
    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.24) 9%, transparent 11%)',
    backgroundSize: '22px 22px',
  },
  hardware: lines('rgba(255, 95, 109, 0.2)', 36),
  platforms: {
    backgroundImage:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.07) 12.5%, transparent 12.5%, transparent 50%, rgba(255, 255, 255, 0.07) 50%, rgba(255, 255, 255, 0.07) 62.5%, transparent 62.5%, transparent 100%)',
    backgroundSize: '24px 24px',
  },
  notes: {
    backgroundImage: `linear-gradient(0deg, ${CORAL} 0px, ${CORAL} 10px, transparent 10px, transparent 100%)`,
    backgroundSize: '100% 100%',
  },
};
