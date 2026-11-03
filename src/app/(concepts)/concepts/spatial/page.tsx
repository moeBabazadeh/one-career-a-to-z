import { conceptMetadata } from '../_shared/metadata';
import Spatial from './Spatial';

export const metadata = conceptMetadata('spatial');

export default function Page() {
  return <Spatial />;
}
