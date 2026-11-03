import { conceptMetadata } from '../_shared/metadata';
import Datasheet from './Datasheet';

export const metadata = conceptMetadata('datasheet');

export default function Page() {
  return <Datasheet />;
}
