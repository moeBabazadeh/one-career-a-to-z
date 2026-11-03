import { conceptMetadata } from '../_shared/metadata';
import Tracker from './Tracker';

export const metadata = conceptMetadata('tracker');

export default function Page() {
  return <Tracker />;
}
