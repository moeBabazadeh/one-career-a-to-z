import { conceptMetadata } from '../_shared/metadata';
import Query from './Query';

export const metadata = conceptMetadata('query-plan');

export default function Page() {
  return <Query />;
}
