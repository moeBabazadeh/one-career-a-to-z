import { conceptMetadata } from '../_shared/metadata';
import Die from './Die';

export const metadata = conceptMetadata('x-ray');

export default function Page() {
  return <Die />;
}
