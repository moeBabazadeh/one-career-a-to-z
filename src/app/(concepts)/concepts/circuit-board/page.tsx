import { conceptMetadata } from '../_shared/metadata';
import Circuit from './Circuit';

export const metadata = conceptMetadata('circuit-board');

export default function Page() {
  return <Circuit />;
}
