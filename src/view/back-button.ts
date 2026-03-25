import { Mesh, MeshBasicMaterial, Object3D } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Text, { TextAlignX, TextAlignY } from '@/objects/text';

export default class BackButton extends Object3D {
  private text: Text;
  onClick: (() => void) | null = null;
  private clickHandler: () => void;

  constructor() {
    super();

    this.text = new Text('< BACK', App.synthaFont, {
      color: NeonColor.Pink,
      size: 0.15 * App.pixelRatio,
      alignX: TextAlignX.Left,
      alignY: TextAlignY.Bottom,
    });
    this.add(this.text);

    // Render on top of everything (never occluded by grids, etc.)
    this.text.traverse(child => {
      if (child instanceof Mesh) {
        child.renderOrder = 999;
        if (child.material instanceof MeshBasicMaterial) {
          child.material.depthTest = false;
        }
      }
    });

    this.visible = false;

    this.clickHandler = (): void => {
      if (!this.visible) return;
      const intersects = App.raycaster.intersectObject(this, true);
      if (intersects.length > 0) {
        this.onClick?.();
      }
    };
  }

  enable(): void {
    this.visible = true;
    window.addEventListener('click', this.clickHandler);
  }

  disable(): void {
    this.visible = false;
    window.removeEventListener('click', this.clickHandler);
  }

  updatePosition(): void {
    this.position.x = -5 * Math.max(1, App.width / App.height) + 0.3;
    this.position.y = -5 * Math.max(1, App.height / App.width) + 0.3;
  }
}
