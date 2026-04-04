import { BloomEffect, EffectPass } from 'postprocessing';
import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three';

import App from '@/core/app';
import { BLOOM_LAYER } from '@/core/layers';
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
      intensity: 5,
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore : Type definitions are incomplete
    bloomEffect.mipmapBlurPass.radius = 0.15 * App.pixelRatio;
    const effectPass = new EffectPass(App.activeCamera, bloomEffect);
    effectPass.fullscreenMaterial.transparent = true;
    effectPass.fullscreenMaterial.blending = AdditiveBlending;
    App.effectComposer.addPass(effectPass);
    App.effectPass = effectPass;

    this.viewManager = new ViewManager();
    this.add(this.viewManager);

    this.titleText = new Text('Tyler J Vezina'.toUpperCase(), App.synthaFont, { color: NeonColor.Pink, size: 0.16, alignX: TextAlignX.Left, alignY: TextAlignY.Top });
    this.titleText.position.x = -5*Math.max(1, App.width/App.height) + 0.3;
    this.titleText.position.y = 5*Math.max(1, App.height/App.width) - 0.3;
    this.titleText.position.z = 5;
    App.cameraRig.attach(this.titleText);
    this.titleOriginalZ = this.titleText.position.z;

    // Title text renders on top of everything (never occluded by grids, etc.)
    makeOverlay(this.titleText);

    // Soft gradient background behind title for readability
    this.createTitleBackground();

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

  private createTitleBackground(): void {
    // Title text must be in the transparent queue so renderOrder is respected
    // vs the gradient fills (Three.js renders all opaques before all transparents)
    this.titleText.traverse(child => {
      if (child instanceof Mesh && child.material instanceof MeshBasicMaterial) {
        child.material.transparent = true;
      }
    });

    const textW = this.titleText.textSize.x;
    const textH = this.titleText.textSize.y;

    // Plane extends beyond the text by this much on each side for the gradient fade
    const pad = textH * 2;
    const planeW = textW + pad * 2;
    const planeH = textH + pad * 2;

    // Generate gradient texture: solid black center, smoothstep fade at edges
    const canvas = document.createElement('canvas');
    const cw = 128, ch = 64;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(cw, ch);
    const px = img.data;
    const fadeX = pad / planeW;
    const fadeY = pad / planeH;

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const nx = x / (cw - 1);
        const ny = y / (ch - 1);

        let ax = 1;
        if (nx < fadeX) ax = nx / fadeX;
        else if (nx > 1 - fadeX) ax = (1 - nx) / fadeX;

        let ay = 1;
        if (ny < fadeY) ay = ny / fadeY;
        else if (ny > 1 - fadeY) ay = (1 - ny) / fadeY;

        // Smoothstep for soft falloff
        ax = ax * ax * (3 - 2 * ax);
        ay = ay * ay * (3 - 2 * ay);

        const i = (y * cw + x) * 4;
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = Math.round(ax * ay * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const texture = new CanvasTexture(canvas);

    const geo = new PlaneGeometry(planeW, planeH);

    // Layer 0 fill (occludes clean-pass objects like thumbnails)
    const fill = new Mesh(geo, new MeshBasicMaterial({
      map: texture, transparent: true, depthTest: false,
    }));
    fill.renderOrder = 998;

    // Bloom layer fill (occludes bloom-pass wireframes; black adds nothing in additive)
    const bloomFill = new Mesh(geo, new MeshBasicMaterial({
      map: texture, transparent: true, depthTest: false,
    }));
    bloomFill.layers.set(BLOOM_LAYER);
    bloomFill.renderOrder = 998;

    // Title is left-top aligned → text extends right (+x) and down (-y)
    const cx = textW / 2;
    const cy = -textH / 2;
    fill.position.set(cx, cy, -0.01);
    bloomFill.position.set(cx, cy, -0.01);

    this.titleText.add(fill, bloomFill);
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
