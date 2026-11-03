import { conceptMetadata } from '../_shared/metadata';
import Teletext from './Teletext';

export const metadata = conceptMetadata('teletext');

export default function Page() {
  return <Teletext />;
}
