import { Color, Mesh, MeshBasicMaterial, Object3D, ShapeGeometry, Vector3 } from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry';
import { Font } from 'three/examples/jsm/loaders/FontLoader';

import { BLOOM_LAYER } from '@/core/layers';
import { NeonColor } from '@/core/neon-color';
import { assert } from '@/utils/debug';

export enum TextAlignX {
  Left,
  Center,
  Right,
}

export enum TextAlignY {
  Top,
  Center,
  Bottom,
}

export type TextOptions = {
  color?: NeonColor | Color,
  size?: number,
  alignX?: TextAlignX,
  alignY?: TextAlignY,
  bloom?: boolean,
}

export default class Text extends Object3D {
  /** Actual rendered bounding-box size of the text geometry. */
  readonly textSize: Vector3;

  constructor(text: string, font: Font, options?: TextOptions) {
    super();

    const alignX = options?.alignX ?? TextAlignX.Center;
    const alignY = options?.alignY ?? TextAlignY.Center;
    const color = options?.color ?? NeonColor.White;
    const bloom = options?.bloom ?? true;

    const textGeometry = new TextGeometry(text, {
      font,
      size: options?.size ?? 1,
      height: 0,
      curveSegments: 1,
    });

    const textSize = new Vector3();
    const textCenter = new Vector3();
    textGeometry.computeBoundingBox();
    textGeometry.boundingBox?.getSize(textSize);
    textGeometry.boundingBox?.getCenter(textCenter);
    this.textSize = textSize;

    assert(Array.isArray(textGeometry.parameters.shapes), 'Expected shape array in TextGeometry');
    const letters = textGeometry.parameters.shapes.map(shape => {
      const mesh = new Mesh(new ShapeGeometry(shape), new MeshBasicMaterial({ color }));
      if (bloom) mesh.layers.set(BLOOM_LAYER);
      return mesh;
    });
    for (const letter of letters) {
      const letterCenter = new Vector3();
      letter.geometry.computeBoundingBox();
      letter.geometry.boundingBox?.getCenter(letterCenter);

      const letterParent = new Object3D();
      letterParent.position.copy(letterCenter);
      letterParent.attach(letter);
      letterParent.position.sub(textCenter);

      switch (alignX) {
        case TextAlignX.Left: letterParent.position.x += textSize.x/2; break;
        case TextAlignX.Right: letterParent.position.x -= textSize.x/2; break;
      }
      switch (alignY) {
        case TextAlignY.Bottom: letterParent.position.y += textSize.y/2; break;
        case TextAlignY.Top: letterParent.position.y -= textSize.y/2; break;
      }

      this.add(letterParent);
    }
  }
}
