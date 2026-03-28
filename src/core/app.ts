import { EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { Camera, Clock, Mesh, Object3D, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, WebGLRenderer } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader';

import { BLOOM_LAYER } from '@/core/layers';
import Router, { NavigationDirection, Route } from '@/core/router';
import MainScene from '@/scenes/main-scene';
import { assert } from '@/utils/debug';
import { findObjectsWhere } from '@/utils/scene-utils';

export const HOME_AREA_WIDTH = 10;
export const HOME_AREA_HEIGHT = 10;
export const PERSP_FOV = 75;

export default class App {
  static #instance: App;

  static get isTouchscreen(): boolean { return typeof window.ontouchstart !== 'undefined'; }

  static get camera(): OrthographicCamera { return App.#instance.orthoCamera; }
  static get activeCamera(): Camera { return App.#instance._activeCamera; }
  static get cameraRig(): Object3D { return App.#instance.cameraRig; }
  static get perspCamera(): PerspectiveCamera { return App.#instance.perspCamera; }
  static get scene(): MainScene { return App.#instance.scene; }
  static get renderer(): WebGLRenderer { return App.#instance.renderer; }
  static get effectComposer(): EffectComposer { return App.#instance.effectComposer; }
  static get effectPass(): EffectPass | null { return App.#instance.effectPass; }
  static set effectPass(pass: EffectPass | null) { App.#instance.effectPass = pass; }

  static get clock(): Clock { return App.#instance.clock; }
  static get deltaTime(): number { return App.#instance.deltaTime; }

  static get raycaster(): Raycaster { return App.#instance.raycaster; }
  static get pointerActive(): boolean { return App.#instance.pointerActive; }
  static get router(): Router { return App.#instance.router; }

  static get width(): number { return window.innerWidth; }
  static get height(): number { return window.innerHeight; }
  static get pixelRatio(): number { return window.devicePixelRatio; }

  static get lineWidth(): number { return Math.min(this.width, this.height) / 325; }

  static get synthaFont(): Font { return App.#instance.synthaFont; }
  static get bookerlyFont(): Font { return App.#instance.bookerlyFont; }

  static init(): void {
    new App(); // eslint-disable-line no-new
  }

  /** Swap the active camera to perspective, matching the ortho view at the given world-z plane. */
  static swapToPerspective(matchPlaneZ: number): void {
    const app = App.#instance;
    const ortho = app.orthoCamera;
    const persp = app.perspCamera;

    const orthoHeight = ortho.top - ortho.bottom;
    const fovRad = persp.fov * Math.PI / 180;
    const dist = orthoHeight / (2 * Math.tan(fovRad / 2));

    // Position persp camera so its view at matchPlaneZ matches the ortho view
    persp.position.set(0, 0, matchPlaneZ + dist - app.cameraRig.position.z);
    persp.aspect = App.width / App.height;
    persp.updateProjectionMatrix();

    app._activeCamera = persp;
    app.perspMatchPlaneZ = matchPlaneZ;
    app.renderPass.mainCamera = persp;
    if (app.effectPass) app.effectPass.mainCamera = persp;

    // Move camera-attached UI to the match-plane distance so screen positions are preserved
    app.scene.onCameraSwapped(matchPlaneZ - app.cameraRig.position.z);
  }

  /** Swap the active camera back to orthographic and restore UI positions. */
  static swapToOrthographic(): void {
    const app = App.#instance;
    app._activeCamera = app.orthoCamera;
    app.renderPass.mainCamera = app.orthoCamera;
    if (app.effectPass) app.effectPass.mainCamera = app.orthoCamera;
    app.scene.onCameraSwappedToOrtho();
  }

  orthoCamera: OrthographicCamera;
  perspCamera: PerspectiveCamera;
  cameraRig: Object3D;
  private _activeCamera: Camera;
  private renderPass: RenderPass;
  effectPass: EffectPass | null = null;
  private perspMatchPlaneZ = 0;

  scene: MainScene;
  renderer: WebGLRenderer;
  effectComposer: EffectComposer;

  clock = new Clock();
  deltaTime = 0;

  raycaster = new Raycaster();
  pointer = new Vector2();
  pointerActive = false;

  router: Router;

  synthaFont: Font;
  bookerlyFont: Font;

  constructor() {
    assert(App.#instance === undefined, 'An App instance already exists');
    App.#instance = this;

    this.renderer = new WebGLRenderer();
    this.renderer.setSize(App.width, App.height);
    this.renderer.setPixelRatio(App.pixelRatio);
    document.body.appendChild(this.renderer.domElement);

    this.scene = new MainScene();

    // Camera rig: shared parent for both cameras and camera-attached objects
    this.cameraRig = new Object3D();
    this.cameraRig.position.z = 10;
    this.scene.add(this.cameraRig);

    this.orthoCamera = new OrthographicCamera();
    this.updateCameraBounds();
    this.cameraRig.add(this.orthoCamera);

    this.perspCamera = new PerspectiveCamera(PERSP_FOV, App.width / App.height, 0.1, 100);
    this.cameraRig.add(this.perspCamera);

    this._activeCamera = this.orthoCamera;

    this.effectComposer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this._activeCamera);
    this.effectComposer.addPass(this.renderPass);

    this.router = new Router(this.onRouteChanged.bind(this));
    window.addEventListener('resize', this.onWindowResized.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    document.addEventListener('pointerleave', this.onPointerLeave.bind(this));
    window.addEventListener('blur', this.onPointerLeave.bind(this));

    this.load();
  }

  load(): void {
    let remaining = 2;
    const onLoaded = (): void => {
      if (--remaining > 0) return;
      this.scene.init();
      window.addEventListener('wheel', this.onWheel.bind(this), { passive: true });
      this.draw();
    };

    new FontLoader().load('/assets/fonts/syntha/Syntha.json', font => {
      this.synthaFont = font;
      onLoaded();
    });

    new TTFLoader().load('/assets/fonts/bookerly/Bookerly.ttf', json => {
      this.bookerlyFont = new Font(json);
      onLoaded();
    });
  }

  onRouteChanged(route: Route, direction: NavigationDirection): void {
    this.scene.viewManager.onRouteChanged(route, direction);
  }

  onWindowResized(): void {
    const { width, height, pixelRatio, lineWidth } = App;

    this.updateCameraBounds();
    this.perspCamera.aspect = width / height;
    this.perspCamera.updateProjectionMatrix();

    // If perspective is active, recalculate its z to match the new ortho bounds
    if (this._activeCamera === this.perspCamera) {
      const orthoHeight = this.orthoCamera.top - this.orthoCamera.bottom;
      const fovRad = this.perspCamera.fov * Math.PI / 180;
      const dist = orthoHeight / (2 * Math.tan(fovRad / 2));
      this.perspCamera.position.z = this.perspMatchPlaneZ + dist - this.cameraRig.position.z;
    }

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.effectComposer.setSize(width, height);

    const resolution = new Vector2(width, height);
    const lineMaterialMeshList = findObjectsWhere(this.scene, (obj): obj is Mesh => obj instanceof Mesh && obj.material instanceof LineMaterial);
    for (const mesh of lineMaterialMeshList) {
      const lineMaterial = mesh.material as LineMaterial;
      lineMaterial.resolution = resolution;
      lineMaterial.linewidth = lineWidth;
    }

    this.scene.onWindowResized();
  }

  onPointerMove(event: PointerEvent): void {
    this.pointer.x = (event.clientX / App.width) * 2 - 1;
    this.pointer.y = -(event.clientY / App.height) * 2 + 1;
    this.pointerActive = true;
  }

  onPointerLeave(): void {
    this.pointerActive = false;
  }

  onWheel(event: WheelEvent): void {
    this.scene.viewManager.onWheel(event.deltaY);
  }

  updateCameraBounds(): void {
    const { width, height } = App;
    const camera = this.orthoCamera;

    const viewScale = (width/height < HOME_AREA_WIDTH/HOME_AREA_HEIGHT ? width/HOME_AREA_WIDTH : height/HOME_AREA_HEIGHT);

    camera.left = -(width/2) / viewScale;
    camera.right = -camera.left;
    camera.bottom = -(height/2) / viewScale;
    camera.top = -camera.bottom;

    camera.updateProjectionMatrix();
  }

  draw(): void {
    requestAnimationFrame(this.draw.bind(this));

    this.raycaster.setFromCamera(this.pointer, App.activeCamera);
    this.deltaTime = this.clock.getDelta();

    this.scene.update();

    // Pass 1: Render non-bloom objects (thumbnails, visible fills)
    this._activeCamera.layers.set(0);
    this.renderer.render(this.scene, this._activeCamera);

    // Pass 2: Render bloom objects on top (additive — black adds nothing, glow adds color)
    this._activeCamera.layers.set(BLOOM_LAYER);
    this.renderer.autoClear = false;
    this.effectComposer.render();
    this.renderer.autoClear = true;
  }
}
