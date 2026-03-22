import { Vector3 } from 'three';

import App from '@/core/app';

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default class CameraTransition {
  private start: Vector3;
  private getTarget: () => Vector3;
  private startZoom: number;
  private targetZoom: number;
  private duration: number;
  private elapsed = 0;
  private _isComplete = false;

  get isComplete(): boolean { return this._isComplete; }

  constructor(target: Vector3 | (() => Vector3), duration: number, targetZoom = App.camera.zoom) {
    this.start = App.cameraRig.position.clone();
    this.getTarget = typeof target === 'function' ? target : (): Vector3 => target;
    this.startZoom = App.camera.zoom;
    this.targetZoom = targetZoom;
    this.duration = duration;
  }

  update(): void {
    if (this._isComplete) return;

    this.elapsed += App.deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);

    const end = this.getTarget();
    App.cameraRig.position.lerpVectors(this.start, end, easeInOutSine(t));

    if (this.targetZoom !== this.startZoom) {
      App.camera.zoom = this.startZoom + (this.targetZoom - this.startZoom) * easeInOutCubic(t);
      App.camera.updateProjectionMatrix();
    }

    if (t >= 1) {
      App.cameraRig.position.copy(end);
      if (this.targetZoom !== this.startZoom) {
        App.camera.zoom = this.targetZoom;
        App.camera.updateProjectionMatrix();
      }
      this._isComplete = true;
    }
  }
}
