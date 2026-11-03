import { conceptMetadata } from '../_shared/metadata';
import Viewer from './Viewer';

export const metadata = conceptMetadata('isometric');

export default function Page() {
  return <Viewer />;
}
