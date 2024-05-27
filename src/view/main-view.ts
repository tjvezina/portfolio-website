import { BoxGeometry, CircleGeometry, Color, IcosahedronGeometry, MathUtils, Object3D, OctahedronGeometry, Vector3 } from 'three';

import { Tumble } from '@/behaviours/tumble';
import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Text from '@/objects/text';
import Wireframe from '@/objects/wireframe';
import { ProjectArea } from '@/scenes/main-scene';
import { addBehaviour } from '@/utils/scene-utils';

class Planet extends Object3D {
  area: ProjectArea;
  wireframe: Wireframe;
  anchor: Object3D;
  text: Text;

  isHovered = false;
  glowStrength = 0;

  lineColor: Color;
  glowColor: Color;

  constructor(area: ProjectArea, wireframe: Wireframe, anchor: Object3D) {
    super();

    this.area = area;
    this.wireframe = wireframe;
    this.anchor = anchor;

    addBehaviour(this.wireframe, new Tumble(this.wireframe));
    this.add(this.wireframe);

    this.text = new Text(this.area.toUpperCase(), App.synthaFont, { color: this.wireframe.lineMaterial.color, size: 0.3 });
    this.text.position.y = 2;
    this.add(this.text);

    this.lineColor = this.wireframe.lineMaterial.color.clone();
    this.glowColor = new Color(0, 0, 0).lerp(new Color(this.wireframe.lineMaterial.color), 0.1);
  }

  update(): void {
    const anchorPos = new Vector3();
    this.anchor.getWorldPosition(anchorPos);
    this.wireframe.position.copy(anchorPos);
    anchorPos.z += 2;
    this.text.position.copy(anchorPos);

    // const wasHovered = this.isHovered;
    const isHovered = App.raycaster.intersectObject(this).length > 0;

    this.glowStrength = Math.max(0, Math.min(1, (this.glowStrength ?? 0) + (isHovered ? 0.1 : -0.1)));
    this.wireframe.fillMaterial?.color.set(new Color(0, 0, 0).lerp(this.glowColor, this.glowStrength));
    this.wireframe.lineMaterial.color.set(new Color(0, 0, 0).lerp(this.lineColor, 1 - (this.glowStrength * 0.8)));

    const pos = new Vector3();
    this.text.getWorldPosition(pos);
    pos.z = App.camera.position.z;
    this.text.lookAt(pos);

    const s = MathUtils.smoothstep(this.glowStrength, 0, 1);
    this.text.scale.set(s, s, s);

    this.isHovered = isHovered;
  }
}

export class MainView extends Object3D {
  sun: Wireframe;

  planetList: Planet[] = [];

  planetAnchorRoot: Object3D;

  init(): void {
    this.sun = new Wireframe(new CircleGeometry(1, 64), { color: NeonColor.White, fillColor: NeonColor.White });

    this.planetAnchorRoot = new Object3D();
    this.planetAnchorRoot.rotateX(-Math.PI/4);

    const anchorList: Object3D[] = [];
    for (let i = 0; i < 3; i++) {
      const anchor = new Object3D();
      this.planetAnchorRoot.add(anchor);

      const a = (Math.PI/2) - 2*Math.PI / 3 * i;
      const x = Math.cos(a) * 4;
      const y = Math.sin(a) * 4;

      anchor.position.set(x, y, 0);
      anchorList.push(anchor);
    }

    this.planetList.push(
      new Planet(ProjectArea.College, new Wireframe(new BoxGeometry(0.9, 0.9, 0.9), { color: NeonColor.Orange }), anchorList[0]),
      new Planet(ProjectArea.Personal, new Wireframe(new OctahedronGeometry(0.75), { color: NeonColor.Green }), anchorList[1]),
      new Planet(ProjectArea.Career, new Wireframe(new IcosahedronGeometry(0.75), { color: NeonColor.Cyan }), anchorList[2]),
    );

    this.add(this.sun, this.planetAnchorRoot, ...this.planetList);
  }

  update(): void {
    this.planetAnchorRoot.rotateZ(-Math.PI/16 * App.deltaTime);

    this.planetList.forEach(planet => planet.update());
  }
}
