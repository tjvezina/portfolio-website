import { BloomEffect, EffectPass } from 'postprocessing';
import { Mesh, MeshBasicMaterial, Scene } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import ViewManager, { setInputEnabled } from '@/core/view-manager';
import Text, { TextAlignX, TextAlignY } from '@/objects/text';
import { updateBehaviours } from '@/utils/scene-utils';
import IntroAnimation from '@/view/intro-animation';
import StarField from '@/view/star-field';

/** Set depthTest=false and a high renderOrder on all meshes in an object tree. */
function makeOverlay(obj: Mesh | Text, order = 999): void {
  obj.traverse(child => {
    if (child instanceof Mesh) {
      child.renderOrder = order;
      if (child.material instanceof MeshBasicMaterial) {
        child.material.depthTest = false;
      }
    }
  });
}

export default class MainScene extends Scene {
  titleText: Text;

  starField: StarField;
  viewManager: ViewManager;
  intro: IntroAnimation | null;

  /** Rig-local z of the title text (saved for restore on camera swap back). */
  private titleOriginalZ: number;

  init(): void {
    const bloomEffect = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0,
      intensity: (window.devicePixelRatio === 1 ? 5 : 5),
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore : Type definitions are incomplete
    bloomEffect.mipmapBlurPass.radius = 0.2;
    const effectPass = new EffectPass(App.activeCamera, bloomEffect);
    App.effectComposer.addPass(effectPass);
    App.effectPass = effectPass;

    this.viewManager = new ViewManager();
    this.add(this.viewManager);

    this.titleText = new Text('Tyler J Vezina'.toUpperCase(), App.synthaFont, { color: NeonColor.Pink, size: 0.16 * App.pixelRatio, alignX: TextAlignX.Left, alignY: TextAlignY.Top });
    this.titleText.position.x = -5*Math.max(1, App.width/App.height) + 0.3;
    this.titleText.position.y = 5*Math.max(1, App.height/App.width) - 0.3;
    this.titleText.position.z = 5;
    App.cameraRig.attach(this.titleText);
    this.titleOriginalZ = this.titleText.position.z;

    // Title text renders on top of everything (never occluded by grids, etc.)
    makeOverlay(this.titleText);

    this.starField = new StarField(App.camera);
    this.starField.position.z = -15;
    App.cameraRig.add(this.starField);

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

  /** Called when the active camera changes. Adjusts camera-attached UI z positions. */
  onCameraSwapped(matchPlaneLocalZ: number): void {
    // Move title text to the match-plane distance so its screen position is preserved
    this.titleText.position.z = matchPlaneLocalZ;
    this.viewManager.onCameraSwapped(matchPlaneLocalZ);
  }

  /** Called when swapping back to orthographic. Restores original UI z positions. */
  onCameraSwappedToOrtho(): void {
    this.titleText.position.z = this.titleOriginalZ;
    this.viewManager.onCameraSwappedToOrtho();
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
