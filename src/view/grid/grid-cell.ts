import { BoxGeometry, ExtrudeGeometry, Object3D, Shape } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { ProjectData } from '@/data/types';
import Text from '@/objects/text';
import Wireframe from '@/objects/wireframe';

const PRISM_DEPTH = 0.3;

function createPrismGeometry(sides: number, cellSize: number): ExtrudeGeometry | BoxGeometry {
  if (sides === 4) {
    return new BoxGeometry(cellSize * 0.95, cellSize * 0.95, PRISM_DEPTH);
  }
  const shape = new Shape();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * cellSize * 0.45;
    const y = Math.sin(angle) * cellSize * 0.45;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: PRISM_DEPTH, bevelEnabled: false });
}

export default class GridCell extends Object3D {
  project: ProjectData;
  prism: Wireframe;
  label: Text;

  constructor(project: ProjectData, sides: number, cellSize: number, color: NeonColor) {
    super();
    this.project = project;
    const geometry = createPrismGeometry(sides, cellSize);
    this.prism = new Wireframe(geometry, { color });
    this.add(this.prism);
    this.label = new Text(project.title, App.synthaFont, { color, size: cellSize * 0.08 });
    this.label.position.z = PRISM_DEPTH / 2 + 0.01;
    this.add(this.label);
  }
}
