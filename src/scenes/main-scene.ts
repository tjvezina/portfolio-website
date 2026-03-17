import { BloomEffect, EffectPass } from 'postprocessing';
import { Scene } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import ViewManager, { setInputEnabled } from '@/core/view-manager';
import Text, { TextAlignX, TextAlignY } from '@/objects/text';
import { updateBehaviours } from '@/utils/scene-utils';
import IntroAnimation from '@/view/intro-animation';
import StarField from '@/view/star-field';

export enum ProjectArea {
  College = 'college',
  Personal = 'personal',
  Career = 'career',
}

export default class MainScene extends Scene {
  titleText: Text;

  starField: StarField;
  viewManager: ViewManager;
  intro: IntroAnimation | null;

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

    this.viewManager = new ViewManager();
    this.add(this.viewManager);

    this.titleText = new Text('Tyler J Vezina'.toUpperCase(), App.synthaFont, { color: NeonColor.Pink, size: 0.16 * App.pixelRatio, alignX: TextAlignX.Left, alignY: TextAlignY.Top });
    this.titleText.position.x = -5*Math.max(1, App.width/App.height) + 0.3;
    this.titleText.position.y = 5*Math.max(1, App.height/App.width) - 0.3;
    this.titleText.position.z = 5;
    App.camera.attach(this.titleText);

    this.starField = new StarField();
    this.starField.position.z = -15;
    App.camera.add(this.starField);

    const initialRoute = App.router.route;
    if (initialRoute.type === 'home') {
      this.intro = new IntroAnimation(
        this.titleText,
        this.viewManager.homeView.sun,
        this.viewManager.homeView.anchorList,
        this.viewManager.homeView.planetList,
        this.viewManager.homeView.planetAnchorRoot,
        this.starField,
        this.starField.introAlphas,
      );
    } else {
      this.intro = null;
      this.starField.introAlphas.fill(1);
      this.viewManager.initializeAtRoute(initialRoute);
    }
  }

  onWindowResized(): void {
    this.titleText.position.x = -5*Math.max(1, App.width/App.height) + 0.3;
    this.titleText.position.y = 5*Math.max(1, App.height/App.width) - 0.3;
    this.viewManager.onWindowResized();
  }

  update(): void {
    if (this.intro) {
      this.intro.update();
      if (this.intro.inputReady) {
        setInputEnabled(true);
      }
      if (this.intro.isComplete) {
        this.intro = null;
      }
    }

    this.starField.update();
    this.viewManager.update();

    updateBehaviours(this);
  }
}
