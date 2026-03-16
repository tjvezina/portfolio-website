import { Object3D, Quaternion, Vector3 } from 'three';

import Behaviour from '@/behaviours/behaviour';
import App from '@/core/app';

export interface TumbleConfig {
  /** Base rotation speed in rad/s. */
  rotationRate: number;
  /** How quickly the tumble axis drifts, in rad/s. */
  axisDrift: number;
  /** Amplitude of the organic wobble in radians per second. */
  wobbleStrength: number;
  /** Time-scale multiplier for the wobble oscillation. */
  wobbleSpeed: number;
}

const defaultConfig: TumbleConfig = {
  rotationRate: 1/6 * Math.PI,
  axisDrift: 0.5,
  wobbleStrength: 0.5,
  wobbleSpeed: 1/6 * Math.PI,
};

// Reusable temporaries to avoid per-frame allocations
const _q = new Quaternion();
const _xAxis = new Vector3(1, 0, 0);
const _axis = new Vector3();

export class Tumble extends Behaviour {
  quaternion: Quaternion;
  config: TumbleConfig;

  constructor(owner: Object3D, config: Partial<TumbleConfig> = {}) {
    super(owner);

    this.quaternion = new Quaternion().random();
    this.config = { ...defaultConfig, ...config };
  }

  update(): void {
    const dt = App.deltaTime;

    // Organic wobble signal (sum of incommensurate sines)
    const t = App.clock.elapsedTime * this.config.wobbleSpeed;
    const wiggle = (Math.sin(1.1 * t) + Math.sin(3.4 * t) + Math.sin(6.7 * t)) / 3;

    // Drift the internal reference frame
    this.quaternion.multiply(
      _q.setFromAxisAngle(_xAxis, this.config.axisDrift * dt),
    );
    this.quaternion.multiply(
      _q.setFromAxisAngle(_axis.set(0, 1, 0), wiggle * this.config.wobbleStrength * dt),
    );

    // Apply world rotation along the drifted axis
    _axis.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.owner.rotateOnWorldAxis(_axis, this.config.rotationRate * dt);
  }
}
