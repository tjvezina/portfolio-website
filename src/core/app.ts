import { EffectComposer, RenderPass } from 'postprocessing';
import { Clock, Mesh, OrthographicCamera, Raycaster, Vector2, WebGLRenderer } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

import { assert } from '@/core/debug';
import MainScene from '@/scenes/main-scene';
import { findObjectsWhere } from '@/utils/scene-utils';

const VIEW_WIDTH = 10;
const VIEW_HEIGHT = 10;

export default class App {
  static #instance: App;

  static get isTouchscreen(): boolean { return typeof window.ontouchstart !== 'undefined'; }

  static get renderer(): WebGLRenderer { return App.#instance.renderer; }
  static get effectComposer(): EffectComposer { return App.#instance.effectComposer; }

  static get camera(): OrthographicCamera { return App.#instance.camera; }
  static get scene(): MainScene { return App.#instance.scene; }

  static get raycaster(): Raycaster { return App.#instance.raycaster; }

  static get clock(): Clock { return App.#instance.clock; }
  static get deltaTime(): number { return App.#instance.deltaTime; }

  static get width(): number { return window.innerWidth; }
  static get height(): number { return window.innerHeight; }
  static get pixelRatio(): number { return window.devicePixelRatio; }

  static get lineWidth(): number { return Math.min(this.width, this.height) / 325; }

  static init(): void {
    new App(); // eslint-disable-line no-new
  }

  renderer: WebGLRenderer;
  effectComposer: EffectComposer;

  camera: OrthographicCamera;
  scene: MainScene;

  raycaster = new Raycaster();
  pointer = new Vector2();

  clock = new Clock();
  deltaTime = 0;

  constructor() {
    assert(App.#instance === undefined, 'An App instance already exists');
    App.#instance = this;

    this.renderer = new WebGLRenderer();
    this.renderer.setSize(App.width, App.height);
    this.renderer.setPixelRatio(App.pixelRatio);
    document.body.appendChild(this.renderer.domElement);

    this.scene = new MainScene();
    this.camera = new OrthographicCamera();
    this.updateCameraBounds();
    this.camera.position.z = 10;
    this.scene.add(this.camera);

    this.effectComposer = new EffectComposer(this.renderer);
    this.effectComposer.addPass(new RenderPass(this.scene, this.camera));

    window.addEventListener('popstate', this.onWindowPopState.bind(this));
    window.addEventListener('resize', this.onWindowResized.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));

    this.scene.init();
    this.draw();
  }

  onWindowPopState(event: PopStateEvent): void {
    console.log('popstate', event.state)
  }

  onWindowResized(): void {
    const { width, height, pixelRatio, lineWidth } = App;

    this.updateCameraBounds();

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
  }

  updateCameraBounds(): void {
    const { width, height, camera } = App;

    const viewScale = (width/height < VIEW_WIDTH/VIEW_HEIGHT ? width/VIEW_WIDTH : height/VIEW_HEIGHT);

    camera.left = -(width/2) / viewScale;
    camera.right = -camera.left;
    camera.bottom = -(height/2) / viewScale;
    camera.top = -camera.bottom;

    camera.updateProjectionMatrix();
  }

  draw(): void {
    requestAnimationFrame(this.draw.bind(this));

    this.raycaster.setFromCamera(this.pointer, App.camera);

    this.deltaTime = this.clock.getDelta();
    this.scene.update();


    this.effectComposer.render();
  }
}
