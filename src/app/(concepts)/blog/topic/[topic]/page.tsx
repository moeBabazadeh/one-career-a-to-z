import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { List, listMetadata } from '../../List';
import { asTopic, getPage, topicPages } from '../../posts';

type Props = { params: Promise<{ topic: string }> };

// One topic's posts, built for each topic that has any. An unknown topic, or one with nothing in it
// yet, is a 404.
export const generateStaticParams = topicPages;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = asTopic((await params).topic);
  return topic && (await getPage(1, topic)) ? listMetadata(1, topic) : {};
}

export default async function TopicPage({ params }: Props) {
  const topic = asTopic((await params).topic);
  const page = topic && (await getPage(1, topic));
  if (!page) notFound();
  return <List {...page} />;
}
