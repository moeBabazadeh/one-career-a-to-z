import { notFound } from 'next/navigation';
import { person } from '@/content/db';
import { card, cardSize, cardType } from '../../_card/card';
import { asTopic, blog, getPage, topicPages, topics } from '../../posts';

export const alt = `${person.name}'s blog`;
export const size = cardSize;
export const contentType = cardType;

// A topic's card: its name, on its pattern.
export const generateStaticParams = topicPages;

export default async function Image({ params }: { params: Promise<{ topic: string }> }) {
  const topic = asTopic((await params).topic);
  if (!topic || !(await getPage(1, topic))) notFound();
  return card(topics[topic], blog.description, topic);
}
