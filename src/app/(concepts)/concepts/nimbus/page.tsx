import { conceptMetadata } from '../_shared/metadata';
import Console from './Console';

export const metadata = conceptMetadata('nimbus');

export default function Page() {
  return <Console />;
}
