import { conceptMetadata } from '../_shared/metadata';
import Blueprint from './Blueprint';

export const metadata = conceptMetadata('blueprint');

export default function Page() {
  return <Blueprint />;
}
