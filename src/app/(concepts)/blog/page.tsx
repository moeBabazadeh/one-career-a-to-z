import { List, listMetadata } from './List';
import { getPage } from './posts';

export const metadata = listMetadata(1);

export default async function BlogIndex() {
  // Page 1 always exists, so the blog shows its empty state rather than a 404 before any posts.
  const page = (await getPage(1))!;
  return <List {...page} />;
}
