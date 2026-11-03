import { conceptMetadata } from '../_shared/metadata';
import Desktop from './Desktop';

export const metadata = conceptMetadata('year-of-linux');

export default function Page() {
  return <Desktop />;
}
