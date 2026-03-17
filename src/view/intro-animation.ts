import { BufferAttribute, Object3D, Points } from 'three';

import App from '@/core/app';
import Text from '@/objects/text';
import Wireframe from '@/objects/wireframe';

const TITLE_SLIDE = 3;

const SUN_START = 1.0;
const SUN_DURATION = 0.8;

const PLANETS_START = 1.8;
const PLANETS_DURATION = 3.0;

const TITLE_START = 4.8;
const TITLE_DURATION = 1.6;

const ORBIT_BOOST = Math.PI;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutCirc(t: number): number {
  return Math.sqrt(1 - Math.pow(t - 1, 2));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export default class IntroAnimation {
  private elapsed = 0;
  private _isComplete = false;

  private titleText: Text;
  private sun: Wireframe;
  private anchors: Object3D[];
  private planets: Object3D[];
  private planetAnchorRoot: Object3D;
  private stars: Points;
  private starIntroAlphas: Float32Array;
  private starDistances: Float32Array;
  private maxStarDist: number;
  private anchorTargets: { x: number, y: number }[];

  get isComplete(): boolean { return this._isComplete; }
  get inputReady(): boolean { return this.elapsed >= PLANETS_START + PLANETS_DURATION; }

  constructor(titleText: Text, sun: Wireframe, anchors: Object3D[], planets: Object3D[], planetAnchorRoot: Object3D, stars: Points, starIntroAlphas: Float32Array) {
    this.titleText = titleText;
    this.sun = sun;
    this.anchors = anchors;
    this.planets = planets;
    this.planetAnchorRoot = planetAnchorRoot;
    this.stars = stars;
    this.starIntroAlphas = starIntroAlphas;
    this.anchorTargets = anchors.map(a => ({ x: a.position.x, y: a.position.y }));

    const posAttr = this.stars.geometry.getAttribute('position') as BufferAttribute;
    const starPositions = posAttr.array as Float32Array;
    this.starDistances = new Float32Array(posAttr.count);
    this.maxStarDist = 0;
    for (let i = 0; i < posAttr.count; i++) {
      const x = starPositions[i * 3];
      const y = starPositions[i * 3 + 1];
      const dist = Math.sqrt(x * x + y * y);
      this.starDistances[i] = dist;
      if (dist > this.maxStarDist) this.maxStarDist = dist;
    }

    this.sun.scale.set(0, 0, 0);
    this.sun.position.z = 1;
    for (const anchor of this.anchors) {
      anchor.position.set(0, 0, 0);
    }
    for (const planet of this.planets) {
      planet.visible = false;
      planet.position.z = -5;
    }
  }

  update(): void {
    if (this._isComplete) return;

    this.elapsed += App.deltaTime;

    // Title: slide down
    const titleT = easeOutCubic(clamp01((this.elapsed - TITLE_START) / TITLE_DURATION));
    const restY = 5 * Math.max(1, App.height / App.width) - 0.3;
    this.titleText.position.y = restY + TITLE_SLIDE * (1 - titleT);

    // Sun: scale up from zero
    const sunT = easeOutCirc(clamp01((this.elapsed - SUN_START) / SUN_DURATION));
    this.sun.scale.set(sunT, sunT, sunT);

    // Planets: spiral out from sun center
    const planetsT = clamp01((this.elapsed - PLANETS_START) / PLANETS_DURATION);
    if (planetsT > 0) {
      for (const planet of this.planets) {
        planet.visible = true;
      }
      const radius = easeOutCubic(planetsT);
      for (let i = 0; i < this.anchors.length; i++) {
        this.anchors[i].position.x = this.anchorTargets[i].x * radius;
        this.anchors[i].position.y = this.anchorTargets[i].y * radius;
      }
      for (const planet of this.planets) {
        planet.position.z = -5 * (1 - radius);
      }
      this.planetAnchorRoot.rotateZ(-ORBIT_BOOST * Math.pow(1 - planetsT, 2) * App.deltaTime);
    }

    // Stars: radial fade from center outward
    const fadeWidth = this.maxStarDist * 0.2;
    const wavefront = planetsT * (this.maxStarDist + fadeWidth);
    for (let i = 0; i < this.starDistances.length; i++) {
      this.starIntroAlphas[i] = clamp01((wavefront - this.starDistances[i]) / fadeWidth);
    }

    if (this.elapsed >= TITLE_START + TITLE_DURATION) {
      this._isComplete = true;
      this.titleText.position.y = restY;
      this.starIntroAlphas.fill(1);
      this.sun.scale.set(1, 1, 1);
      this.sun.position.z = 0;
      for (const planet of this.planets) {
        planet.position.z = 0;
      }
      for (let i = 0; i < this.anchors.length; i++) {
        this.anchors[i].position.x = this.anchorTargets[i].x;
        this.anchors[i].position.y = this.anchorTargets[i].y;
      }
    }
  }
}
