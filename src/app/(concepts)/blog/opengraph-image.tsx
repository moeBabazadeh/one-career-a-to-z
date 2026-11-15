import { person } from '@/content/db';
import { card, cardSize, cardType } from './_card/card';
import { blog } from './posts';

export const alt = `${person.name}'s blog`;
export const size = cardSize;
export const contentType = cardType;
// Drawn once, at build time.
export const dynamic = 'force-static';

export default function Image() {
  return card(blog.title, blog.description);
}
