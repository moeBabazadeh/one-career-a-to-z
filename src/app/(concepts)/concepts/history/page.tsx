import { conceptMetadata } from '../_shared/metadata';
import Commits from './Commits';

export const metadata = conceptMetadata('history');

export default function Page() {
  return <Commits />;
}
