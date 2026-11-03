import { conceptMetadata } from '../_shared/metadata';
import PullRequest from './PullRequest';

export const metadata = conceptMetadata('pull-request');

export default function Page() {
  return <PullRequest />;
}
