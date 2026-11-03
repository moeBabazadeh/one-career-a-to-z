import { conceptMetadata } from '../_shared/metadata';
import Workbench from './Workbench';

export const metadata = conceptMetadata('editor');

export default function Page() {
  return <Workbench />;
}
