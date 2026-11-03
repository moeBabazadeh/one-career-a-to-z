import { conceptMetadata } from '../_shared/metadata';
import Spreadsheet from './Spreadsheet';

export const metadata = conceptMetadata('spreadsheet');

export default function Page() {
  return <Spreadsheet />;
}
