import { conceptMetadata } from '../_shared/metadata';
import Api from './Api';

export const metadata = conceptMetadata('api-reference');

export default function Page() {
  return <Api />;
}
