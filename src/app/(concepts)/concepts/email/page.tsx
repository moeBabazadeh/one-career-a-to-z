import { conceptMetadata } from '../_shared/metadata';
import Mail from './Mail';

export const metadata = conceptMetadata('email');

export default function Page() {
  return <Mail />;
}
