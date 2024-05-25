import { Object3D, Quaternion, Vector3 } from 'three';

import App from '@/core/app';

export class Tumble {
  object: Object3D;
  quaternion: Quaternion;
  speedMultiplier: number;

  constructor(object: Object3D, speedMultiplier = 1) {
    this.object = object;
    this.quaternion = new Quaternion().random();
    this.speedMultiplier = speedMultiplier;
  }

  update() {
    const m = this.speedMultiplier;
    const t = App.clock.elapsedTime * (2*Math.PI) / 5;
    const wiggle = (Math.sin(1.1*t) + Math.sin(3.4*t) + Math.sin(6.7*t)) / (3/m);
    this.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 2*Math.PI / (360/m)));
    this.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), wiggle / 25));
    this.object.rotateOnWorldAxis(new Vector3(0, 1, 0).applyQuaternion(this.quaternion), 2*Math.PI / (3/m) * App.deltaTime);
  }
}
