import { hasPosts } from '../../blog/posts';
import { conceptMetadata } from '../_shared/metadata';
import Circuit from './Circuit';

export const metadata = conceptMetadata('circuit-board');

export default async function Page() {
  return <Circuit blog={await hasPosts()} />;
}
