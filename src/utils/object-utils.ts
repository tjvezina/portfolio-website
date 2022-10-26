import {
  EdgesGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector2,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { Wireframe } from 'three/addons/lines/Wireframe';

export function createWireframe(geometry: THREE.BufferGeometry, {
  color = 0xFFFFFF,
  includeFillMesh = true,
}: {
  color?: number,
  includeFillMesh?: boolean,
}): Wireframe {
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
