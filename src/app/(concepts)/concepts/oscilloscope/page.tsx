import { conceptMetadata } from '../_shared/metadata';
import Signal from './Signal';

export const metadata = conceptMetadata('oscilloscope');

export default function Page() {
  return <Signal />;
}
