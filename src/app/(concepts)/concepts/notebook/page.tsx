import { conceptMetadata } from '../_shared/metadata';
import Notebook from './Notebook';

export const metadata = conceptMetadata('notebook');

export default function Page() {
  return <Notebook />;
}
