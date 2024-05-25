import { Tumble } from '@/behaviours/tumble';
import App from '@/core/app';
import { NeonColor } from '@/scenes/main-scene';
import { createWireframe } from '@/utils/object-utils';
import { BoxGeometry, CircleGeometry, Color, IcosahedronGeometry, Mesh, MeshBasicMaterial, Object3D, OctahedronGeometry } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

export class MainView extends Object3D {
  sun: Object3D;

  planetList: Object3D[] = [];

  root: Object3D;

  tumbleList: Tumble[] = [];

  init(): void {
    this.sun = createWireframe(new CircleGeometry(1, 64), { color: NeonColor.White, fillColor: NeonColor.White });

    this.planetList.push(createWireframe(new BoxGeometry(0.9, 0.9, 0.9), { color: NeonColor.Orange }));
    this.planetList.push(createWireframe(new OctahedronGeometry(0.75), { color: NeonColor.Blue }));
    this.planetList.push(createWireframe(new IcosahedronGeometry(0.75), { color: NeonColor.Green }));

    this.root = new Object3D();
    this.root.rotateX(-Math.PI/4);

    this.add(this.sun, this.root);

    for (const [i, planet] of this.planetList.entries()) {
      this.root.add(planet);
      this.tumbleList.push(new Tumble(planet, 0.5));

      const a = (Math.PI/2) - 2*Math.PI / 3 * i;
      const x = Math.cos(a) * 4;
      const y = Math.sin(a) * 4;

      planet.position.set(x, y, 0);
    }
  }

  update(): void {
    this.planetList.forEach(planet => {
      const isHovered = App.raycaster.intersectObject(planet).length > 0;
      planet.userData.glowStrength = Math.max(0, Math.min(1, (planet.userData.glowStrength ?? 0) + (isHovered ? 0.1 : -0.1)));

      const lineMaterial = (planet as Mesh).material as LineMaterial;
      const material = (planet.children[0] as Mesh).material as MeshBasicMaterial;
      material.color.set(new Color(NeonColor.Black).lerp(new Color(lineMaterial.color), planet.userData.glowStrength * 0.1));
    });

    this.root.rotateZ(-Math.PI/16 * App.deltaTime);

    this.tumbleList.forEach(tumble => tumble.update());
  }
}
