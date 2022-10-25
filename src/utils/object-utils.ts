import {
  EdgesGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector2,
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { Wireframe } from 'three/examples/jsm/lines/Wireframe.js';

export function createWireframeObject(geometry: THREE.BufferGeometry, {
  color = 0xFFFFFF,
  includeFillMesh = true,
}: {
  color?: number,
  includeFillMesh?: boolean,
}): Object3D {
  const wireframeGeometry = new LineSegmentsGeometry().fromEdgesGeometry(new EdgesGeometry(geometry));

  const lineMaterial = new LineMaterial({
    color,
    linewidth: 4,
    resolution: new Vector2(window.innerWidth, window.innerHeight),
  });

  const wireframe = new Wireframe(wireframeGeometry, lineMaterial);

  if (includeFillMesh) {
    const fillMaterial = new MeshBasicMaterial({
      color: 0x000000,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1,
    });
    const fillMesh = new Mesh(geometry, fillMaterial);
    wireframe.add(fillMesh);
  }

  return wireframe;
}
