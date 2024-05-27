import { Object3D, ShapeGeometry, Vector3 } from 'three';
import { Font } from 'three/addons/loaders/FontLoader';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry';

import { TextAlignX, TextAlignY, TextOptions } from '@/objects/text';
import Wireframe, { WireframeOptions } from '@/objects/wireframe';
import { assert } from '@/utils/debug';

export type WireframeTextOptions = WireframeOptions & TextOptions

export default class WireframeText extends Object3D {
  constructor(text: string, font: Font, options?: WireframeTextOptions) {
    super();

    const alignX = options?.alignX ?? TextAlignX.Center;
    const alignY = options?.alignY ?? TextAlignY.Center;

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

    assert(Array.isArray(textGeometry.parameters.shapes), 'Expected shape array in TextGeometry');
    const letters = textGeometry.parameters.shapes.map(shape => new Wireframe(new ShapeGeometry(shape), options));
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
