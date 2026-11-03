import { conceptMetadata } from '../_shared/metadata';
import Terminal from './Terminal';

export const metadata = conceptMetadata('terminal');

export default function Page() {
  return <Terminal />;
}
