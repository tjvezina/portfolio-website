import { BoxGeometry, CircleGeometry, Color, IcosahedronGeometry, MathUtils, Object3D, OctahedronGeometry, Vector3 } from 'three';

import { Tumble } from '@/behaviours/tumble';
import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { ProjectArea } from '@/data/types';
import Text from '@/objects/text';
import Wireframe from '@/objects/wireframe';
import { addBehaviour } from '@/utils/scene-utils';

let inputEnabled = false;

export function setInputEnabled(enabled: boolean): void {
  inputEnabled = enabled;
}

export class Planet extends Object3D {
  area: ProjectArea;
  wireframe: Wireframe;
  anchor: Object3D;
  text: Text;
  tumble: Tumble;

  isHovered = false;
  glowStrength = 0;

  lineColor: Color;
  glowColor: Color;

  constructor(area: ProjectArea, wireframe: Wireframe, anchor: Object3D) {
    super();

    this.area = area;
    this.wireframe = wireframe;
    this.anchor = anchor;

    this.tumble = new Tumble(this.wireframe);
    addBehaviour(this.wireframe, this.tumble);
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
    const isHovered = inputEnabled && App.raycaster.intersectObject(this).length > 0;

    this.glowStrength = Math.max(0, Math.min(1, (this.glowStrength ?? 0) + (isHovered ? 0.1 : -0.1)));
    this.wireframe.fillMaterial?.color.set(new Color(0, 0, 0).lerp(this.glowColor, this.glowStrength));
    this.wireframe.lineMaterial.color.set(new Color(0, 0, 0).lerp(this.lineColor, 1 - (this.glowStrength * 0.8)));

    const pos = new Vector3();
    this.text.getWorldPosition(pos);
    pos.z = App.cameraRig.position.z;
    this.text.lookAt(pos);

    const s = MathUtils.smoothstep(this.glowStrength, 0, 1);
    this.text.scale.set(s, s, s);

    this.isHovered = isHovered;
  }
}

const BASE_ORBIT_SPEED = -Math.PI / 16;

export class HomeView extends Object3D {
  sun: Wireframe;

  planetList: Planet[] = [];

  planetAnchorRoot: Object3D;
  anchorList: Object3D[] = [];

  onPlanetClicked: ((area: ProjectArea) => void) | null = null;

  private orbitSpeed = BASE_ORBIT_SPEED;
  private orbitDecelerating = false;
  private orbitDecelDuration = 0;
  private orbitDecelElapsed = 0;

  private isRevealing = false;
  private revealElapsed = 0;
  private revealDuration = 0;

  init(): void {
    this.sun = new Wireframe(new CircleGeometry(1, 64), { color: NeonColor.White, fillColor: NeonColor.White });

    this.planetAnchorRoot = new Object3D();
    this.planetAnchorRoot.rotateX(-Math.PI/4);

    for (let i = 0; i < 3; i++) {
      const anchor = new Object3D();
      this.planetAnchorRoot.add(anchor);

      const a = (Math.PI/2) - 2*Math.PI / 3 * i;
      const x = Math.cos(a) * 4;
      const y = Math.sin(a) * 4;

      anchor.position.set(x, y, 0);
      this.anchorList.push(anchor);
    }

    this.planetList.push(
      new Planet(ProjectArea.College, new Wireframe(new BoxGeometry(0.9, 0.9, 0.9), { color: NeonColor.Orange }), this.anchorList[0]),
      new Planet(ProjectArea.Personal, new Wireframe(new OctahedronGeometry(0.75), { color: NeonColor.Green }), this.anchorList[1]),
      new Planet(ProjectArea.Career, new Wireframe(new IcosahedronGeometry(0.75), { color: NeonColor.Cyan }), this.anchorList[2]),
    );

    this.add(this.sun, this.planetAnchorRoot, ...this.planetList);

    window.addEventListener('click', () => {
      if (!inputEnabled) return;
      for (const planet of this.planetList) {
        if (App.raycaster.intersectObject(planet, true).length > 0) {
          this.onPlanetClicked?.(planet.area);
          return;
        }
      }
    });
  }

  stopOrbiting(): void {
    this.orbitSpeed = 0;
    this.orbitDecelerating = false;
  }

  resumeOrbiting(): void {
    this.orbitSpeed = BASE_ORBIT_SPEED;
    this.orbitDecelerating = false;
    this.orbitDecelElapsed = 0;
  }

  /** Scale all home elements from 0 → 1 over the given duration. */
  reveal(duration: number): void {
    this.sun.scale.setScalar(0);
    for (const planet of this.planetList) {
      planet.wireframe.scale.setScalar(0);
    }
    this.isRevealing = true;
    this.revealElapsed = 0;
    this.revealDuration = duration;
  }

  update(): void {
    if (this.orbitDecelerating) {
      this.orbitDecelElapsed += App.deltaTime;
      const t = Math.min(1, this.orbitDecelElapsed / this.orbitDecelDuration);
      this.orbitSpeed = BASE_ORBIT_SPEED * (1 - t);
      if (t >= 1) {
        this.orbitSpeed = 0;
        this.orbitDecelerating = false;
      }
    }

    this.planetAnchorRoot.rotateZ(this.orbitSpeed * App.deltaTime);

    this.planetList.forEach(planet => planet.update());

    if (this.isRevealing) {
      this.revealElapsed += App.deltaTime;
      const t = Math.min(1, this.revealElapsed / this.revealDuration);
      this.sun.scale.setScalar(t);
      for (const planet of this.planetList) {
        planet.wireframe.scale.setScalar(t);
      }
      if (t >= 1) {
        this.isRevealing = false;
      }
    }
  }
}
