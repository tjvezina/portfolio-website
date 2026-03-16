import { BoxGeometry, BufferAttribute, BufferGeometry, CircleGeometry, Color, IcosahedronGeometry, MathUtils, Object3D, OctahedronGeometry, Points, PointsMaterial, Vector3 } from 'three';

import { Tumble } from '@/behaviours/tumble';
import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Text from '@/objects/text';
import Wireframe from '@/objects/wireframe';
import { ProjectArea } from '@/scenes/main-scene';
import { addBehaviour } from '@/utils/scene-utils';

let inputEnabled = false;

export function setInputEnabled(enabled: boolean): void {
  inputEnabled = enabled;
}

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
    const isHovered = inputEnabled && App.raycaster.intersectObject(this).length > 0;

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
  stars: Points;
  starIntroAlphas: Float32Array;
  private starBaseColors: Float32Array;
  private starTwinkleSeeds: Float32Array;
  private starTwinkleSpeeds: Float32Array;

  planetList: Planet[] = [];

  planetAnchorRoot: Object3D;
  anchorList: Object3D[] = [];

  init(): void {
    this.sun = new Wireframe(new CircleGeometry(1, 64), { color: NeonColor.White, fillColor: NeonColor.White });

    let seed = 0x8BADF00D; // fixed seed
    const rand = (): number => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    const starCount = 400;
    const minDist = 0.1;
    const minDistSq = minDist * minDist;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      let x = (rand() - 0.5) * 40;
      let y = (rand() - 0.5) * 16;
      for (let attempt = 0; attempt < 50; attempt++) {
        let tooClose = false;
        for (let j = 0; j < i; j++) {
          const dx = x - positions[j * 3];
          const dy = y - positions[j * 3 + 1];
          if (dx * dx + dy * dy < minDistSq) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) break;
        x = (rand() - 0.5) * 40;
        y = (rand() - 0.5) * 16;
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = -5;

      const brightness = 0.1 + rand() * 0.9;
      const tint = rand();
      let r, g, b;
      if (tint < 0.3) {
        // Warm: amber/yellow
        r = brightness;
        g = brightness * (0.6 + rand() * 0.2);
        b = brightness * (0.3 + rand() * 0.2);
      } else if (tint < 0.6) {
        // Cool: blue-white
        r = brightness * (0.5 + rand() * 0.2);
        g = brightness * (0.6 + rand() * 0.2);
        b = brightness;
      } else {
        // Neutral white
        r = brightness;
        g = brightness;
        b = brightness;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.stars = new Points(starGeometry, new PointsMaterial({
      size: 1,
      sizeAttenuation: false,
      vertexColors: true,
    }));
    this.starBaseColors = new Float32Array(colors);
    this.starTwinkleSeeds = new Float32Array(starCount);
    this.starTwinkleSpeeds = new Float32Array(starCount);
    for (let j = 0; j < starCount; j++) {
      this.starTwinkleSeeds[j] = rand() * Math.PI * 2;
      this.starTwinkleSpeeds[j] = 0.2 + rand() * 0.3;
    }
    this.starIntroAlphas = new Float32Array(starCount);

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

    this.add(this.stars, this.sun, this.planetAnchorRoot, ...this.planetList);
  }

  update(): void {
    this.updateStars();
    this.planetAnchorRoot.rotateZ(-Math.PI/16 * App.deltaTime);

    this.planetList.forEach(planet => planet.update());
  }

  private updateStars(): void {
    const posAttr = this.stars.geometry.getAttribute('position') as BufferAttribute;
    const colAttr = this.stars.geometry.getAttribute('color') as BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    const time = App.clock.elapsedTime;
    const count = posAttr.count;

    const scrollSpeed = 0.2;

    for (let i = 0; i < count; i++) {
      // Scroll left and wrap within fixed band
      positions[i * 3] -= scrollSpeed * App.deltaTime;
      if (positions[i * 3] < -20) {
        positions[i * 3] += 40;
      }

      // Twinkle: brief dip in brightness
      const phase = time * this.starTwinkleSpeeds[i] + this.starTwinkleSeeds[i];
      const twinkle = 1 - 0.85 * Math.pow(Math.abs(Math.sin(phase)), 80);
      const alpha = this.starIntroAlphas[i];
      colors[i * 3] = this.starBaseColors[i * 3] * twinkle * alpha;
      colors[i * 3 + 1] = this.starBaseColors[i * 3 + 1] * twinkle * alpha;
      colors[i * 3 + 2] = this.starBaseColors[i * 3 + 2] * twinkle * alpha;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}
