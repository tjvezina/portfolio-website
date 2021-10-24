import Component from '@glimmer/component';
import { action } from '@ember/object';
import THREE from 'three';

const H_FOV = 90;

export default class ThreejsCanvasComponent extends Component {
  @action initialize() {
    this.canvas = document.querySelector('#c');

    const { canvas } = this;
    const { clientWidth, clientHeight } = canvas;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(this.horizontalToVerticalFOV(H_FOV), clientWidth / clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(clientWidth, clientHeight);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    camera.position.z = 5;

    Object.assign(this, { scene, camera, renderer, cube});

    requestAnimationFrame(this.draw.bind(this));
  }

  draw(time) {
    requestAnimationFrame(this.draw.bind(this));
    time /= 1000; // Convert to seconds

    const { canvas, renderer, scene, camera, cube } = this;
    const { clientWidth, clientHeight } = canvas;

    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.fov = this.horizontalToVerticalFOV(H_FOV);
      camera.updateProjectionMatrix();
    }

    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    renderer.render(scene, camera);
  }

  horizontalToVerticalFOV(fov) {
    const { clientWidth, clientHeight } = this.canvas;
    return 2 * Math.atan(Math.tan(fov/2 * THREE.MathUtils.DEG2RAD) * clientHeight / clientWidth) * THREE.MathUtils.RAD2DEG;
  }
}
