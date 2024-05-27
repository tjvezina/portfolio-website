import { BoxGeometry, CircleGeometry, Color, IcosahedronGeometry, Object3D, OctahedronGeometry } from 'three';

import { Tumble } from '@/behaviours/tumble';
import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Wireframe from '@/objects/wireframe';
import { ProjectArea } from '@/scenes/main-scene';

class Planet extends Object3D {
  area: ProjectArea;
  wireframe: Wireframe;

  isHovered = false;
  glowStrength = 0;

  glowColor: Color;

  constructor(area: ProjectArea, wireframe: Wireframe) {
    super();

    this.area = area;
    this.wireframe = wireframe;
    this.add(wireframe);

    this.glowColor = new Color(0, 0, 0).lerp(new Color(wireframe.lineMaterial.color), 0.1);
  }

  update(): void {
    const isHovered = App.raycaster.intersectObject(this).length > 0;

    this.glowStrength = Math.max(0, Math.min(1, (this.glowStrength ?? 0) + (isHovered ? 0.1 : -0.1)));
    this.wireframe.fillMaterial?.color.set(new Color(0, 0, 0).lerp(this.glowColor, this.glowStrength));
  }
}

export class MainView extends Object3D {
  sun: Wireframe;

  planetList: Planet[] = [];

  planetRoot: Object3D;

  init(): void {
    this.sun = new Wireframe(new CircleGeometry(1, 64), { color: NeonColor.White, fillColor: NeonColor.White });

    this.planetList.push(new Planet(ProjectArea.College, new Wireframe(new BoxGeometry(0.9, 0.9, 0.9), { color: NeonColor.Orange })));
    this.planetList.push(new Planet(ProjectArea.Personal, new Wireframe(new OctahedronGeometry(0.75), { color: NeonColor.Blue })));
    this.planetList.push(new Planet(ProjectArea.Career, new Wireframe(new IcosahedronGeometry(0.75), { color: NeonColor.Green })));

    this.planetRoot = new Object3D();
    this.planetRoot.rotateX(-Math.PI/4);

    this.add(this.sun, this.planetRoot);

    for (const [i, planet] of this.planetList.entries()) {
      this.planetRoot.add(planet);
      (planet.userData.behaviours ??= []).push(new Tumble(planet, 0.5));

      const a = (Math.PI/2) - 2*Math.PI / 3 * i;
      const x = Math.cos(a) * 4;
      const y = Math.sin(a) * 4;

      planet.position.set(x, y, 0);
    }
  }

  update(): void {
    this.planetRoot.rotateZ(-Math.PI/16 * App.deltaTime);

    this.planetList.forEach(planet => planet.update());
  }
}
