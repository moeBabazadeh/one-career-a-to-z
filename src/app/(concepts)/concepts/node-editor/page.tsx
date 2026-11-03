import { conceptMetadata } from '../_shared/metadata';
import FlowEditor from './Flow';

export const metadata = conceptMetadata('node-editor');

export default function Page() {
  return <FlowEditor />;
}
