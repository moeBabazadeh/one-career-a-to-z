import { conceptMetadata } from '../_shared/metadata';
import Transit from './Transit';

export const metadata = conceptMetadata('journey-planner');

export default function Page() {
  return <Transit />;
}
