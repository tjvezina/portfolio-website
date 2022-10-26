import { EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import {
  Clock,
  PerspectiveCamera,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { assert } from '@/core/debug';
import MainScene from '@/scenes/main-scene';

export default class App {
  static #instance: App;

  static get renderer(): WebGLRenderer { return App.#instance.renderer; }
  static get effectComposer(): EffectComposer { return App.#instance.effectComposer; }

  static get camera(): PerspectiveCamera { return App.#instance.camera; }
  static get scene(): MainScene { return App.#instance.scene; }

  static get clock(): Clock { return App.#instance.clock; }

  static get width(): number { return window.innerWidth; }
  static get height(): number { return window.innerHeight; }

  static addEffectPass(effectPass: EffectPass): void { App.#instance.addEffectPass(effectPass); }

  static init(): void {
    new App(); // eslint-disable-line no-new
  }

  renderer: WebGLRenderer;
  effectComposer: EffectComposer;

  camera: PerspectiveCamera;
  scene: MainScene;

  clock = new Clock();

  controls: OrbitControls;

  constructor() {
    assert(App.#instance === undefined, 'Only one App instance may exist');
    App.#instance = this;

    this.renderer = new WebGLRenderer();
    this.renderer.setSize(App.width, App.height);
    document.body.appendChild(this.renderer.domElement);

    this.scene = new MainScene();
    this.camera = new PerspectiveCamera(75, App.width/App.height, 0.1, 1000);
    this.camera.position.z = 10;

    // this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // this.controls.enablePan = false;
    // this.controls.enableDamping = true;
    // this.controls.minAzimuthAngle = -Math.PI * 1/3;
    // this.controls.maxAzimuthAngle = Math.PI * 1/3;
    // this.controls.minPolarAngle = Math.PI * 1/6;
    // this.controls.maxPolarAngle = Math.PI * 5/6;
    // this.controls.minDistance = 5;
    // this.controls.maxDistance = 10;

    this.effectComposer = new EffectComposer(this.renderer);
    this.effectComposer.addPass(new RenderPass(this.scene, this.camera));

    window.addEventListener('resize', this.onWindowResized.bind(this), false);

    this.scene.init();
    this.draw();
  }

  addEffectPass(effectPass: EffectPass): void {
    this.effectComposer.addPass(effectPass);
  }

  onWindowResized(): void {
    this.renderer.setSize(App.width, App.height);
    this.effectComposer.setSize(App.width, App.height);
    this.camera.aspect = App.width/App.height;
    this.camera.updateProjectionMatrix();
  }

  draw(): void {
    requestAnimationFrame(this.draw.bind(this));

    this.clock.getDelta();
    this.scene.update();
    this.controls?.update();

    this.effectComposer.render();
  }
}
