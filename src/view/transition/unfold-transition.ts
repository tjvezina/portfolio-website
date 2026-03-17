import { Object3D } from 'three';

import App from '@/core/app';
import { ProjectArea } from '@/scenes/main-scene';

export default class UnfoldTransition {
  private elapsed = 0;
  private duration: number;
  private _isComplete = false;
  private target: Object3D;
  private reverse: boolean;

  get isComplete(): boolean { return this._isComplete; }

  constructor(target: Object3D, _area: ProjectArea, reverse: boolean, duration = 1.5) {
    this.target = target;
    this.duration = duration;
    this.reverse = reverse;

    if (!reverse) {
      this.target.visible = false;
    }
  }

  update(): void {
    if (this._isComplete) return;

    this.elapsed += App.deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);

    if (!this.reverse) {
      this.target.visible = t > 0.1;
      this.target.scale.setScalar(Math.min(1, t * 1.2));
    } else {
      this.target.scale.setScalar(Math.max(0.001, 1 - t));
      if (t >= 0.9) this.target.visible = false;
    }

    if (t >= 1) {
      this._isComplete = true;
      if (!this.reverse) {
        this.target.scale.set(1, 1, 1);
        this.target.visible = true;
      }
    }
  }
}
