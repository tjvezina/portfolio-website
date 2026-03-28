import { Material, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Shape, ShapeGeometry } from 'three';

import App from '@/core/app';
import { BLOOM_LAYER } from '@/core/layers';
import { NeonColor } from '@/core/neon-color';
import Text from '@/objects/text';
import Wireframe, { WireframeType } from '@/objects/wireframe';
import { measureTextWidth } from '@/utils/text-utils';

const LABEL = 'BACK';
const TEXT_SIZE = 0.15;
const PADDING_X = 0.2;
const PADDING_Y = 0.12;
const CORNER_RADIUS = 0.12;
const HOVER_SCALE = 1.06;
const PRESS_SCALE = 0.94;

function createRoundedRectShape(
  width: number,
  height: number,
  radius: number,
): Shape {
  const shape = new Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

export default class BackButton extends Object3D {
  onClick: (() => void) | null = null;

  private container: Object3D;
  private hitArea: Mesh;
  private buttonWidth: number;
  private buttonHeight: number;
  private clickHandler: () => void;
  private pointerDownHandler: () => void;
  private pointerUpHandler: () => void;
  private isPointerDown = false;

  constructor() {
    super();

    const size = TEXT_SIZE * App.pixelRatio;
    const textWidth = measureTextWidth(LABEL, size);
    this.buttonWidth = textWidth + PADDING_X * 2;
    this.buttonHeight = size + PADDING_Y * 2;

    this.container = new Object3D();

    const roundedShape = createRoundedRectShape(this.buttonWidth, this.buttonHeight, CORNER_RADIUS);
    const border = new Wireframe(
      new ShapeGeometry(roundedShape),
      { color: NeonColor.Pink, type: WireframeType.Hollow },
    );
    const fillGeo = new ShapeGeometry(roundedShape);
    const fill = new Mesh(fillGeo, new MeshBasicMaterial({ color: NeonColor.Black }));
    fill.renderOrder = 998;
    // Matching fill on bloom layer to occlude bloom-pass lines (additive: black adds nothing)
    const bloomFill = new Mesh(fillGeo, new MeshBasicMaterial({ color: NeonColor.Black }));
    bloomFill.layers.set(BLOOM_LAYER);
    bloomFill.renderOrder = 998;
    const text = new Text(LABEL, App.synthaFont, {
      color: NeonColor.Pink,
      size,
    });
    this.container.add(fill, bloomFill, border, text);

    // Render on top of everything (never occluded by grids, etc.)
    this.container.traverse(child => {
      if (child instanceof Mesh) {
        child.renderOrder = 999;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats as Material[]) {
          mat.depthTest = false;
        }
      }
    });

    // Invisible hit-area for click detection (layer 0 so the raycaster can find it)
    this.hitArea = new Mesh(
      new PlaneGeometry(this.buttonWidth + PADDING_Y * 2, this.buttonHeight + PADDING_Y * 2),
      new MeshBasicMaterial({ visible: false }),
    );
    this.container.add(this.hitArea);

    this.add(this.container);
    this.visible = false;

    this.clickHandler = (): void => {
      if (!this.visible) return;
      const intersects = App.raycaster.intersectObject(this.hitArea);
      if (intersects.length > 0) {
        this.onClick?.();
      }
    };
    this.pointerDownHandler = (): void => { this.isPointerDown = true; };
    this.pointerUpHandler = (): void => { this.isPointerDown = false; };
  }

  enable(): void {
    this.visible = true;
    window.addEventListener('click', this.clickHandler);
    window.addEventListener('pointerdown', this.pointerDownHandler);
    window.addEventListener('pointerup', this.pointerUpHandler);
  }

  disable(): void {
    this.visible = false;
    window.removeEventListener('click', this.clickHandler);
    window.removeEventListener('pointerdown', this.pointerDownHandler);
    window.removeEventListener('pointerup', this.pointerUpHandler);
    this.isPointerDown = false;
  }

  update(): void {
    if (!this.visible) return;
    const hovered = App.pointerActive &&
      App.raycaster.intersectObject(this.hitArea).length > 0;
    const target = hovered
      ? (this.isPointerDown ? PRESS_SCALE : HOVER_SCALE)
      : 1;
    const current = this.container.scale.x;
    const next = current + (target - current) * (1 - Math.exp(-15 * App.deltaTime));
    this.container.scale.setScalar(next);
  }

  updatePosition(): void {
    const edgeMargin = 0.3;
    this.position.x = -5 * Math.max(1, App.width / App.height) + this.buttonWidth / 2 + edgeMargin;
    this.position.y = -5 * Math.max(1, App.height / App.width) + this.buttonHeight / 2 + edgeMargin;
  }
}
