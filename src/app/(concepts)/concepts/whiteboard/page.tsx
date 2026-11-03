import { conceptMetadata } from '../_shared/metadata';
import Whiteboard from './Whiteboard';

export const metadata = conceptMetadata('whiteboard');

export default function Page() {
  return <Whiteboard />;
}
