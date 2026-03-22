import { BufferAttribute, BufferGeometry, Matrix4, OrthographicCamera, Points, ShaderMaterial } from 'three';

import App from '@/core/app';

const STAR_VERTEX = /* glsl */`
  uniform mat4 uOrthoProjection;
  uniform mat4 uOrthoView;

  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vColor = color;
    gl_Position = uOrthoProjection * uOrthoView * modelMatrix * vec4(position, 1.0);
    gl_PointSize = 1.0;
  }
`;

const STAR_FRAGMENT = /* glsl */`
  precision mediump float;
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

export default class StarField extends Points {
  introAlphas: Float32Array;
  private orthoCamera: OrthographicCamera;
  private baseColors: Float32Array;
  private twinkleSeeds: Float32Array;
  private twinkleSpeeds: Float32Array;

  constructor(orthoCamera: OrthographicCamera) {
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
      positions[i * 3 + 2] = 0;

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

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));

    const material = new ShaderMaterial({
      uniforms: {
        uOrthoProjection: { value: new Matrix4() },
        uOrthoView: { value: new Matrix4() },
      },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      depthWrite: false,
      depthTest: false,
    });

    super(geometry, material);

    // Render before everything else so scene content naturally covers stars
    this.renderOrder = -1;

    this.orthoCamera = orthoCamera;
    this.baseColors = new Float32Array(colors);
    this.twinkleSeeds = new Float32Array(starCount);
    this.twinkleSpeeds = new Float32Array(starCount);
    for (let j = 0; j < starCount; j++) {
      this.twinkleSeeds[j] = rand() * Math.PI * 2;
      this.twinkleSpeeds[j] = 0.2 + rand() * 0.3;
    }
    this.introAlphas = new Float32Array(starCount);
  }

  update(): void {
    const posAttr = this.geometry.getAttribute('position') as BufferAttribute;
    const colAttr = this.geometry.getAttribute('color') as BufferAttribute;
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
      const phase = time * this.twinkleSpeeds[i] + this.twinkleSeeds[i];
      const twinkle = 1 - 0.85 * Math.pow(Math.abs(Math.sin(phase)), 80);
      const alpha = this.introAlphas[i];
      colors[i * 3] = this.baseColors[i * 3] * twinkle * alpha;
      colors[i * 3 + 1] = this.baseColors[i * 3 + 1] * twinkle * alpha;
      colors[i * 3 + 2] = this.baseColors[i * 3 + 2] * twinkle * alpha;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Update ortho projection uniforms so stars always render with orthographic projection
    const mat = this.material as ShaderMaterial;
    mat.uniforms.uOrthoProjection.value.copy(this.orthoCamera.projectionMatrix);
    mat.uniforms.uOrthoView.value.copy(this.orthoCamera.matrixWorldInverse);
  }
}
