import { conceptMetadata } from '../_shared/metadata';
import LoadTest from './LoadTest';

export const metadata = conceptMetadata('uptime');

export default function Page() {
  return <LoadTest />;
}
