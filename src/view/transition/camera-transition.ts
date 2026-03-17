import { Vector3 } from 'three';

import App from '@/core/app';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default class CameraTransition {
  private start: Vector3;
  private end: Vector3;
  private duration: number;
  private elapsed = 0;
  private _isComplete = false;

  get isComplete(): boolean { return this._isComplete; }

  constructor(target: Vector3, duration: number) {
    this.start = App.camera.position.clone();
    this.end = target;
    this.duration = duration;
  }

  update(): void {
    if (this._isComplete) return;

    this.elapsed += App.deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = easeInOutCubic(t);

    App.camera.position.lerpVectors(this.start, this.end, eased);

    if (t >= 1) {
      App.camera.position.copy(this.end);
      this._isComplete = true;
    }
  }
}
