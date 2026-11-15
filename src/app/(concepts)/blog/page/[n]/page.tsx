import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { List, listMetadata } from '../../List';
import { blog, getPage, laterPages, parsePage as parse } from '../../posts';

type Props = { params: Promise<{ n: string }> };

// Pages 2 and on of the list, built ahead of time. /blog/page/1 is /blog, and any other number
// (0, 07, one past the end) is a 404. As with the posts, unknown numbers are turned away below rather
// than with `dynamicParams = false`, so a page that a new post adds opens on the running dev server.
export const generateStaticParams = laterPages;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = parse((await params).n);
  return (await getPage(n)) ? listMetadata(n) : {};
}

export default async function BlogPage({ params }: Props) {
  const n = parse((await params).n);
  if (n === 1) permanentRedirect(blog.url);
  const page = await getPage(n);
  if (!page) notFound();
  return <List {...page} />;
}
