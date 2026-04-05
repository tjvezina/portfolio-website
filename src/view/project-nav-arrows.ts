import { Box3, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Text, { TextAlignX, TextAlignY } from '@/objects/text';

const ARROW_SIZE = 0.45;
const HOVER_SCALE = 1.12;
const PRESS_SCALE = 0.88;

export default class ProjectNavArrows extends Object3D {
  onPrev: (() => void) | null = null;
  onNext: (() => void) | null = null;

  private leftContainer: Object3D;
  private rightContainer: Object3D;
  private leftHitArea: Mesh;
  private rightHitArea: Mesh;
  private clickHandler: () => void;
  private pointerDownHandler: () => void;
  private pointerUpHandler: () => void;
  private isPointerDown = false;

  constructor() {
    super();

    this.leftContainer = this.createArrow('<');
    this.rightContainer = this.createArrow('>');
    this.add(this.leftContainer);
    this.add(this.rightContainer);

    this.leftHitArea = this.addHitArea(this.leftContainer);
    this.rightHitArea = this.addHitArea(this.rightContainer);

    this.visible = false;

    this.clickHandler = (): void => {
      if (!this.visible) return;
      if (this.leftContainer.visible) {
        const hits = App.raycaster.intersectObject(this.leftHitArea);
        if (hits.length > 0) { this.onPrev?.(); return; }
      }
      if (this.rightContainer.visible) {
        const hits = App.raycaster.intersectObject(this.rightHitArea);
        if (hits.length > 0) { this.onNext?.(); return; }
      }
    };
    this.pointerDownHandler = (): void => { this.isPointerDown = true; };
    this.pointerUpHandler = (): void => { this.isPointerDown = false; };
  }

  enable(showLeft: boolean, showRight: boolean): void {
    this.leftContainer.visible = showLeft;
    this.rightContainer.visible = showRight;
    this.visible = showLeft || showRight;
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
    const arrows: [Object3D, Mesh][] = [];
    if (this.leftContainer.visible) arrows.push([this.leftContainer, this.leftHitArea]);
    if (this.rightContainer.visible) arrows.push([this.rightContainer, this.rightHitArea]);
    for (const [container, hitArea] of arrows) {
      const hovered = App.pointerActive &&
        App.raycaster.intersectObject(hitArea).length > 0;
      const target = hovered
        ? (this.isPointerDown ? PRESS_SCALE : HOVER_SCALE)
        : 1;
      const current = container.scale.x;
      const next = current + (target - current) * (1 - Math.exp(-15 * App.deltaTime));
      container.scale.setScalar(next);
    }
  }

  updatePosition(): void {
    const edgeX = 5 * Math.max(1, App.width / App.height);
    this.leftContainer.position.set(-edgeX + 0.25, 0, 0);
    this.rightContainer.position.set(edgeX - 0.25, 0, 0);
  }

  private createArrow(char: string): Object3D {
    const container = new Object3D();
    const text = new Text(char, App.synthaFont, {
      color: NeonColor.Pink,
      size: ARROW_SIZE,
      alignX: TextAlignX.Center,
      alignY: TextAlignY.Center,
    });
    container.add(text);

    // Render on top of everything (like back button)
    text.traverse(child => {
      if (child instanceof Mesh) {
        child.renderOrder = 999;
        if (child.material instanceof MeshBasicMaterial) {
          child.material.depthTest = false;
        }
      }
    });

    return container;
  }

  private addHitArea(container: Object3D): Mesh {
    const bounds = new Box3();
    container.traverse(child => {
      if (child instanceof Mesh && child.material instanceof MeshBasicMaterial && child.material.visible !== false) {
        child.updateWorldMatrix(true, false);
        const childBounds = new Box3().setFromObject(child);
        bounds.union(childBounds);
      }
    });

    const size = new Vector3();
    const center = new Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    // Generous hit area — at least 1 world unit tall
    const hitW = Math.max(size.x * 2, 0.6);
    const hitH = Math.max(size.y * 2, 1.0);
    const hitArea = new Mesh(
      new PlaneGeometry(hitW, hitH),
      new MeshBasicMaterial({ visible: false }),
    );
    hitArea.position.copy(center);
    container.add(hitArea);
    return hitArea;
  }
}
