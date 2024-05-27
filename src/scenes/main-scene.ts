import { BloomEffect, EffectPass } from 'postprocessing';
import { Scene } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Text, { TextAlignX, TextAlignY } from '@/objects/text';
import { updateBehaviours } from '@/utils/scene-utils';
import { MainView } from '@/view/main-view';

export enum ProjectArea {
  College = 'college',
  Personal = 'personal',
  Career = 'career',
}

export default class MainScene extends Scene {
  titleText: Text;

  mainView: MainView;

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

    this.mainView = new MainView();
    this.mainView.init();
    this.add(this.mainView);

    this.titleText = new Text('Tyler•J•Vezina'.toUpperCase(), App.synthaFont, { color: NeonColor.Pink, size: 0.16 * App.pixelRatio, alignX: TextAlignX.Left, alignY: TextAlignY.Top });
    this.titleText.position.x = -5*Math.max(1, App.width/App.height) + 0.3;
    this.titleText.position.y = 5*Math.max(1, App.height/App.width) - 0.3;
    this.titleText.position.z = 5;
    App.camera.attach(this.titleText);

    // window.addEventListener('click', this.onClick.bind(this));
  }

  // createHexGrid(): void {
  //   new OBJLoader().load('./assets/models/hex-prism.obj', group => {
  //     const hexPrism = createWireframe((group.children[0] as Mesh).geometry, { color: NeonColor.Pink });

  //     const COUNT = 12;
  //     for (let q = -COUNT; q <= COUNT; q++) {
  //       for (let r = -COUNT; r <= COUNT; r++) {
  //         if (Math.abs(-q-r) > COUNT) continue;

  //         const hexObj = new Object3D().add(hexPrism.clone(true));
  //         (hexObj.children[0] as Mesh).material = (hexPrism.material as Material).clone();
  //         hexObj.position.x = 3/2 * r;
  //         hexObj.position.y = Math.sqrt(3) * (q + r/2);
  //         this.add(hexObj);
  //         this.hexObjList.push(hexObj);
  //       }
  //     }
  //   });
  // }

  // onClick(_event: MouseEvent): void { }

  onWindowResized(): void {
    this.titleText.position.x = -5*Math.max(1, App.width/App.height) + 0.3;
    this.titleText.position.y = 5*Math.max(1, App.height/App.width) - 0.3;
  }

  update(): void {
    this.mainView.update();

    updateBehaviours(this);
  }
}
