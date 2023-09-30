import { BloomEffect, EffectPass } from 'postprocessing';
import {
  Color,
  Material,
  Mesh,
  Object3D,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial';
import { OBJLoader } from 'three/addons/loaders/OBJLoader';

import App from '@/core/app';
import { createWireframe } from '@/utils/object-utils';

export default class MainScene extends Scene {
  raycaster = new Raycaster();
  pointer = new Vector2();

  hexObjList: Object3D[] = [];

  init(): void {
    const bloomEffect = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0,
      intensity: 5,
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore : Type definitions are incomplete
    bloomEffect.mipmapBlurPass.radius = 0.2;

    App.addEffectPass(new EffectPass(App.camera, bloomEffect));

    new OBJLoader().load('./assets/models/hex-prism.obj', group => {
      const hexPrism = createWireframe((group.children[0] as Mesh).geometry, { color: 0xc254d5 });

      const COUNT = 12;
      for (let q = -COUNT; q <= COUNT; q++) {
        for (let r = -COUNT; r <= COUNT; r++) {
          if (Math.abs(-q-r) > COUNT) continue;

          const hexObj = new Object3D().add(hexPrism.clone(true));
          (hexObj.children[0] as Mesh).material = (hexPrism.material as Material).clone();
          hexObj.position.x = 3/2 * r;
          hexObj.position.y = Math.sqrt(3) * (q + r/2);
          this.add(hexObj);
          this.hexObjList.push(hexObj);
        }
      }
    });

    window.addEventListener('pointermove', this.onPointerMove.bind(this));
  }

  onPointerMove(event: PointerEvent): void {
    this.pointer.x = (event.clientX / App.width) * 2 - 1;
    this.pointer.y = -(event.clientY / App.height) * 2 + 1;
  }

  update(): void {
    const RADIUS = 4;
    const HEIGHT = 1;

    this.raycaster.setFromCamera(this.pointer, App.camera);

    const intersect = new Vector3();
    const didIntersect = (this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -HEIGHT), intersect) !== null);
    intersect.z = 0;

    this.hexObjList.forEach(obj => {
      const dist = (didIntersect ? intersect.distanceTo(obj.position.clone().setZ(0)) : Infinity);
      const t = (1 - Math.sin(Math.max(0, Math.min(Math.PI/2, (Math.PI * Math.max(0, dist-0.866)) / (2 * RADIUS)))));
      obj.position.z = t*t*t * HEIGHT;
      const lineMat = (obj.children[0] as Mesh).material as LineMaterial;
      lineMat.color.set(new Color(0xc254d5).lerp(new Color(0x55ddf2), t*t*t));
    });
  }
}
