import { conceptMetadata } from '../_shared/metadata';
import Scada from './Scada';

export const metadata = conceptMetadata('scada');

export default function Page() {
  return <Scada />;
}
