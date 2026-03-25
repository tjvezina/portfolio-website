import { Box3, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Text, { TextAlignX, TextAlignY } from '@/objects/text';

export default class BackButton extends Object3D {
  private text: Text;
  private hitArea: Mesh;
  onClick: (() => void) | null = null;
  private clickHandler: () => void;

  constructor() {
    super();

    this.text = new Text('BACK', App.synthaFont, {
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

    // Invisible hit-area for click detection (layer 0 so the raycaster can find it)
    const bounds = new Box3();
    this.text.traverse(child => {
      if (child instanceof Mesh) {
        child.updateWorldMatrix(true, false);
        const childBounds = new Box3().setFromObject(child);
        bounds.union(childBounds);
      }
    });
    const size = new Vector3();
    const center = new Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const padding = size.y;
    this.hitArea = new Mesh(
      new PlaneGeometry(size.x + padding * 2, size.y + padding * 2),
      new MeshBasicMaterial({ visible: false }),
    );
    this.hitArea.position.copy(center);
    this.add(this.hitArea);

    this.visible = false;

    this.clickHandler = (): void => {
      if (!this.visible) return;
      const intersects = App.raycaster.intersectObject(this.hitArea);
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
