import { conceptMetadata } from '../_shared/metadata';
import Toolpath from './Toolpath';

export const metadata = conceptMetadata('g-code');

export default function Page() {
  return <Toolpath />;
}
