import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { List, listMetadata } from '../../../../List';
import { asTopic, getPage, laterTopicPages, pageUrl, parsePage } from '../../../../posts';

type Props = { params: Promise<{ topic: string; n: string }> };

// A topic's pages after the first, as /blog/page/[n] is for the whole list.
export const generateStaticParams = laterTopicPages;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic: key, n: number } = await params;
  const topic = asTopic(key);
  const n = parsePage(number);
  return topic && (await getPage(n, topic)) ? listMetadata(n, topic) : {};
}

export default async function TopicListPage({ params }: Props) {
  const { topic: key, n: number } = await params;
  const topic = asTopic(key);
  const n = parsePage(number);
  if (topic && n === 1) permanentRedirect(pageUrl(1, topic));
  const page = topic && (await getPage(n, topic));
  if (!page) notFound();
  return <List {...page} />;
}
