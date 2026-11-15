import { notFound } from 'next/navigation';
import { person } from '@/content/db';
import { card, cardSize, cardType } from '../../../../_card/card';
import { asTopic, blog, getPage, laterTopicPages, parsePage, topics } from '../../../../posts';

export const alt = `${person.name}'s blog`;
export const size = cardSize;
export const contentType = cardType;

// The topic's card again: a share image doesn't carry down from the topic's first page.
export const generateStaticParams = laterTopicPages;

export default async function Image({ params }: { params: Promise<{ topic: string; n: string }> }) {
  const { topic: key, n } = await params;
  const topic = asTopic(key);
  if (!topic || !(await getPage(parsePage(n), topic))) notFound();
  return card(topics[topic], blog.description, topic);
}
