import { BufferGeometry, EdgesGeometry, Mesh, MeshBasicMaterial, Vector2 } from 'three';
import { Wireframe as threejsWireframe } from 'three/addons/lines/Wireframe';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';

export enum WireframeType {
  Solid, // Front-facing edges only, (black fill)
  Hollow, // All edges are visible
}

export type WireframeOptions = {
  color?: NeonColor,
  fillColor?: NeonColor,
  type?: WireframeType,
}

export default class Wireframe extends threejsWireframe {
  lineMaterial: LineMaterial;
  fillMaterial?: MeshBasicMaterial;

  constructor(geometry: BufferGeometry, options?: WireframeOptions) {
    const wireframeGeometry = new LineSegmentsGeometry().fromEdgesGeometry(new EdgesGeometry(geometry));

    const lineMaterial = new LineMaterial({
      color: options?.color ?? NeonColor.White,
      linewidth: App.lineWidth,
      resolution: new Vector2(window.innerWidth, window.innerHeight),
    });

    super(wireframeGeometry, lineMaterial);

    this.lineMaterial = lineMaterial;
    switch (options?.type ?? WireframeType.Solid) {
      case WireframeType.Solid: {
        this.fillMaterial = new MeshBasicMaterial({
          color: options?.fillColor ?? NeonColor.Black,
          polygonOffset: true,
          polygonOffsetFactor: 3,
          polygonOffsetUnits: 1,
        });

        this.add(new Mesh(geometry, this.fillMaterial));
      }
    }
  }
}
