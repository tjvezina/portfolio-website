import {
  EdgesGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { Wireframe } from 'three/addons/lines/Wireframe';
import { Font } from 'three/addons/loaders/FontLoader';

import App from '@/core/app';
import { assert } from '@/core/debug';
import { NeonColor } from '@/scenes/main-scene';

export enum WireframeType {
  Solid, // Front-facing edges only, with a solid black fill
  Hollow, // Front- and back-facing edges are visible
}

export type WireframeOptions = {
  color?: NeonColor,
  fillColor?: NeonColor,
  type?: WireframeType,
}

export type TextOptions = {
  color?: NeonColor,
  size?: number,
  alignX?: TextAlignX,
  alignY?: TextAlignY,
}

export type WireframeTextOptions = WireframeOptions & TextOptions

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

export function createWireframe(geometry: THREE.BufferGeometry, options?: WireframeOptions): Wireframe {
  const wireframeGeometry = new LineSegmentsGeometry().fromEdgesGeometry(new EdgesGeometry(geometry));

  const lineMaterial = new LineMaterial({
    color: options?.color ?? NeonColor.White,
    linewidth: App.lineWidth,
    resolution: new Vector2(window.innerWidth, window.innerHeight),
  });

  const wireframe = new Wireframe(wireframeGeometry, lineMaterial);

  switch (options?.type ?? WireframeType.Solid) {
    case WireframeType.Solid: {
      const fillMaterial = new MeshBasicMaterial({
        color: options?.fillColor ?? NeonColor.Black,
        polygonOffset: true,
        polygonOffsetFactor: 3,
        polygonOffsetUnits: 1,
      });
      const fillMesh = new Mesh(geometry, fillMaterial);
      wireframe.add(fillMesh);
    }
  }

  return wireframe;
}

export function createWireframeText(text: string, font: Font, options?: WireframeTextOptions): Object3D {
  const root = new Object3D();

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
  const letters = textGeometry.parameters.shapes.map(shape => createWireframe(new ShapeGeometry(shape), options));
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

    root.add(letterParent);
  }

  return root;
}

export function createText(text: string, font: Font, options?: TextOptions): Object3D {
  const root = new Object3D();

  const alignX = options?.alignX ?? TextAlignX.Center;
  const alignY = options?.alignY ?? TextAlignY.Center;
  const color = options?.color ?? NeonColor.White;

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
  const letters = textGeometry.parameters.shapes.map(shape => new Mesh(new ShapeGeometry(shape), new MeshBasicMaterial({ color })));
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

    root.add(letterParent);
  }

  return root;
}
