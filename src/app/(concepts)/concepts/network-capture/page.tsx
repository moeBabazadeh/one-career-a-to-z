import { conceptMetadata } from '../_shared/metadata';
import CaptureApp from './Capture';

export const metadata = conceptMetadata('network-capture');

export default function Page() {
  return <CaptureApp />;
}
