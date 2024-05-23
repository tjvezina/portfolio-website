import { BloomEffect, EffectPass } from 'postprocessing';
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  DodecahedronGeometry,
  IcosahedronGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  Plane,
  Quaternion,
  Raycaster,
  Scene,
  TetrahedronGeometry,
  Vector2,
  Vector3,
} from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader';
import { OBJLoader } from 'three/addons/loaders/OBJLoader';
import { randFloat } from 'three/src/math/MathUtils';

import App from '@/core/app';
import { createText, createWireframe, TextAlignX, TextAlignY, WireframeType } from '@/utils/object-utils';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

const PINK = 0xc254d5;
const BLUE = 0x55ddf2;
const ORANGE = 0xe86b2c;
const GRAY = 0x171717;

export default class MainScene extends Scene {
  bloomPass: EffectPass;

  raycaster = new Raycaster();
  pointer = new Vector2();

  hexObjList: Object3D[] = [];

  icosa: Object3D;
  axes: Object3D;

  init(): void {
    const bloomEffect = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0,
      intensity: (window.devicePixelRatio === 1 ? 5 : 5),
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore : Type definitions are incomplete
    bloomEffect.mipmapBlurPass.radius = 0.2;
    App.effectComposer.addPass(new EffectPass(App.camera, bloomEffect));

    this.createHexGrid();

    // new FontLoader().load('./assets/fonts/syntha/Syntha.json', font => {
    //   const text = createText('Tyler•J•Vezina'.toUpperCase(), font, { color: PINK, size: 0.16 * App.pixelRatio, alignX: TextAlignX.Left, alignY: TextAlignY.Top });
    //   text.position.x = -5*Math.max(1, App.width/App.height) + 0.3;
    //   text.position.y = 5*Math.max(1, App.height/App.width) - 0.3;
    //   text.position.z = 5;
    //   App.camera.attach(text);
    //   this.add(App.camera);
    // });

    // this.icosa = createWireframe(new IcosahedronGeometry(1, 0), { color: BLUE });
    // this.add(this.icosa);

    // const circle1 = createWireframe(new CircleGeometry(2, 64), { color: GRAY, type: WireframeType.Hollow });
    // this.add(circle1);
    // circle1.rotateX(-Math.PI/3);
    // const circle2 = createWireframe(new CircleGeometry(3.5, 64), { color: GRAY, type: WireframeType.Hollow });
    // this.add(circle2);
    // circle2.rotateX(-Math.PI/3);
    // const circle3 = createWireframe(new CircleGeometry(5, 64), { color: GRAY, type: WireframeType.Hollow });
    // this.add(circle3);
    // circle3.rotateX(-Math.PI/3);

    // const planet1 = createWireframe(new DodecahedronGeometry(0.5), { color: BLUE });
    // this.add(planet1);
    // planet1.translateX(2);

    // const planet2 = createWireframe(new BoxGeometry(0.6, 0.6, 0.6), { color: BLUE });
    // this.add(planet2);
    // planet2.translateX(3.5);
    // planet2.rotateX(Math.PI/4);
    // planet2.rotateY(Math.PI/4);

    // const planet3 = createWireframe(new OctahedronGeometry(0.5), { color: BLUE });
    // this.add(planet3);
    // planet3.translateX(5);

    // planet1.parent = planet2.parent = planet3.parent = this.icosa;

    window.addEventListener('click', this.onClick.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
  }

  createHexGrid(): void {
    new OBJLoader().load('./assets/models/hex-prism.obj', group => {
      const hexPrism = createWireframe((group.children[0] as Mesh).geometry, { color: BLUE });

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
  }

  onClick(_event: MouseEvent): void {
    window.history.pushState(null, '', 'foo')
  }

  onPointerMove(event: PointerEvent): void {
    this.pointer.x = (event.clientX / App.width) * 2 - 1;
    this.pointer.y = -(event.clientY / App.height) * 2 + 1;
  }

  icosaRot = new Quaternion().random();

  update(): void {
    // const t = App.clock.elapsedTime * (2*Math.PI) / 5;
    // const wiggle = (Math.sin(1.1*t) + Math.sin(3.4*t) + Math.sin(6.7*t)) / 3;
    // this.icosaRot.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.02));
    // this.icosaRot.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), wiggle / 25));
    // // this.axes.setRotationFromQuaternion(this.icosaRot);
    // this.icosa.rotateOnWorldAxis(new Vector3(0, 1, 0).applyQuaternion(this.icosaRot), 2*Math.PI / 3 * App.deltaTime);

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
