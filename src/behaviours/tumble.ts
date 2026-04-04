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

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class Tumble extends Behaviour {
  quaternion: Quaternion;
  config: TumbleConfig;

  private frozen = false;

  // Deceleration state
  private decelerating = false;
  private decelDuration = 0;
  private decelElapsed = 0;

  // Face alignment state (runs after deceleration completes)
  private aligning = false;
  private alignDuration = 0;
  private alignElapsed = 0;
  private alignStart: Quaternion | null = null;
  private alignTarget: Quaternion | null = null;

  constructor(owner: Object3D, config: Partial<TumbleConfig> = {}) {
    super(owner);

    this.quaternion = new Quaternion().random();
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Decelerate tumble to a stop, then slerp to align a face toward the camera.
   * @param decelDuration Seconds to decelerate from current speed to zero
   * @param alignTarget Pre-computed target quaternion for face alignment
   * @param alignDuration Seconds to slerp to the target orientation
   */
  decelerateAndAlign(decelDuration: number, alignTarget: Quaternion, alignDuration: number): void {
    this.decelerating = true;
    this.decelDuration = decelDuration;
    this.decelElapsed = 0;
    this.alignTarget = alignTarget;
    this.alignDuration = alignDuration;
    this.aligning = false;
  }

  /** Freeze rotation in place — holds current quaternion, ignores all further input. */
  freeze(): void {
    this.frozen = true;
    this.decelerating = false;
    this.aligning = false;
  }

  /** Resume normal tumbling after having been stopped or frozen. */
  resume(): void {
    this.frozen = false;
    this.decelerating = false;
    this.aligning = false;
    this.alignStart = null;
    this.alignTarget = null;
    this.decelElapsed = 0;
  }

  update(): void {
    if (this.frozen) return;
    const dt = App.deltaTime;

    // Phase 2: Slerp to face-aligned orientation
    if (this.aligning) {
      this.alignElapsed += dt;
      const t = Math.min(1, this.alignElapsed / this.alignDuration);
      const eased = easeInOutQuad(t);
      this.owner.quaternion.slerpQuaternions(this.alignStart!, this.alignTarget!, eased);
      if (t >= 1) {
        this.owner.quaternion.copy(this.alignTarget!);
        this.aligning = false;
      }
      return;
    }

    // Compute speed multiplier during deceleration
    let speed = 1;
    if (this.decelerating) {
      this.decelElapsed += dt;
      const t = Math.min(1, this.decelElapsed / this.decelDuration);
      speed = 1 - t * t; // quadratic ease-in deceleration
      if (t >= 1) {
        this.decelerating = false;
        speed = 0;
        // Transition to face alignment phase
        if (this.alignTarget) {
          this.aligning = true;
          this.alignElapsed = 0;
          this.alignStart = this.owner.quaternion.clone();
        }
        return;
      }
    }

    if (speed <= 0) return;

    // Organic wobble signal (sum of incommensurate sines)
    const wobbleT = App.timer.getElapsed() * this.config.wobbleSpeed;
    const wiggle = (Math.sin(1.1 * wobbleT) + Math.sin(3.4 * wobbleT) + Math.sin(6.7 * wobbleT)) / 3;

    // Drift the internal reference frame
    this.quaternion.multiply(
      _q.setFromAxisAngle(_xAxis, this.config.axisDrift * dt * speed),
    );
    this.quaternion.multiply(
      _q.setFromAxisAngle(_axis.set(0, 1, 0), wiggle * this.config.wobbleStrength * dt * speed),
    );

    // Apply world rotation along the drifted axis
    _axis.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.owner.rotateOnWorldAxis(_axis, this.config.rotationRate * dt * speed);
  }
}
