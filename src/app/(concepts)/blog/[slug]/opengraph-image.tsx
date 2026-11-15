import { notFound } from 'next/navigation';
import { person } from '@/content/db';
import { card, cardSize, cardType } from '../_card/card';
import { cardLine, getPost, getPosts } from '../posts';

export const alt = `A post on ${person.name}'s blog`;
export const size = cardSize;
export const contentType = cardType;

// Drawn once per post at build time, like the pages.
export async function generateStaticParams() {
  return (await getPosts()).map(({ slug }) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  return card(post.title, cardLine(post), post.topic);
}
