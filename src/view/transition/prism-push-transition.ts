import App from '@/core/app';
import GridCell from '@/view/grid/grid-cell';

const PUSH_DEPTH = 5;

export default class PrismPushTransition {
  private cell: GridCell;
  private elapsed = 0;
  private duration: number;
  private reverse: boolean;
  private _isComplete = false;
  private startZ: number;

  get isComplete(): boolean { return this._isComplete; }

  constructor(cell: GridCell, reverse: boolean, duration = 1.0) {
    this.cell = cell;
    this.reverse = reverse;
    this.duration = duration;
    this.startZ = cell.prism.position.z;
  }

  update(): void {
    if (this._isComplete) return;

    this.elapsed += App.deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);

    if (this.reverse) {
      this.cell.prism.position.z = this.startZ - PUSH_DEPTH * (1 - t);
    } else {
      this.cell.prism.position.z = this.startZ - PUSH_DEPTH * t;
    }

    if (t >= 1) {
      this._isComplete = true;
    }
  }
}
