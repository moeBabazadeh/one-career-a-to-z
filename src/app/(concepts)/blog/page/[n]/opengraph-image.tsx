import { notFound } from 'next/navigation';
import { person } from '@/content/db';
import { card, cardSize, cardType } from '../../_card/card';
import { blog, getPage, laterPages, parsePage } from '../../posts';

export const alt = `${person.name}'s blog`;
export const size = cardSize;
export const contentType = cardType;

// Every page of the list shares the blog's own card; a share image doesn't carry down from /blog.
export const generateStaticParams = laterPages;

export default async function Image({ params }: { params: Promise<{ n: string }> }) {
  if (!(await getPage(parsePage((await params).n)))) notFound();
  return card(blog.title, blog.description);
}
