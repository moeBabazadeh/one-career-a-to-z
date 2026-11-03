import Console from './Console';
import Report from './Report';
import s from './minefield.module.scss';

// Concept M · Minefield. A demining robot simulator in the spirit of the RoboCup challenge Moe
// placed in: the console fills the first screen (field, probability map, telemetry, the career
// in chapters that open as mines are marked, and the log), and the same content follows as a
// plain field report for reading without the tool.
export default function Minefield() {
  return (
    <div className={s.root} id="top">
      <a href="#report" className={s.skip}>
        Skip to the page version
      </a>
      <Console />
      <Report />
    </div>
  );
}
