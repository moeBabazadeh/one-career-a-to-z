import { conceptMetadata } from '../_shared/metadata';
import Vending from './Vending';

export const metadata = conceptMetadata('vending-machine');

export default function Page() {
  return <Vending />;
}
