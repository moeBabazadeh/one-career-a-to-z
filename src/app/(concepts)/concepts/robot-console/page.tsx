import { conceptMetadata } from '../_shared/metadata';
import RobotConsole from './RobotConsole';

export const metadata = conceptMetadata('robot-console');

export default function Page() {
  return <RobotConsole />;
}
