import { BloomEffect, EffectPass } from 'postprocessing';
import { Scene } from 'three';

import App from '@/core/app';
import ShatterIcosa from '@/objects/shatter-icosa';

export default class MainScene extends Scene {
  icosa: ShatterIcosa;

  init(): void {
    const bloomEffect = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0,
      intensity: 5,
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore : Type definitions are incomplete
    bloomEffect.mipmapBlurPass.radius = 2/3;

    App.addEffectPass(new EffectPass(App.camera, bloomEffect));

    this.icosa = new ShatterIcosa();
    this.icosa.rotation.x = Math.PI/2;
    this.icosa.rotation.y = Math.PI;
    this.add(this.icosa);
  }

  update(): void {
    this.icosa.update();
  }
}
