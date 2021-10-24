import Component from '@glimmer/component';
import { action } from '@ember/object';
import THREE from 'three';

export default class ThreejsCanvasComponent extends Component {
  @action initialize() {
    const canvas = document.querySelector('#c');
    const { clientWidth, clientHeight } = canvas;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, clientWidth / clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(clientWidth, clientHeight);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    camera.position.z = 5;

    Object.assign(this, { canvas, scene, camera, renderer, cube});

    this.draw();
  }

  draw() {
    requestAnimationFrame(this.draw.bind(this));

    const { canvas, renderer, scene, camera, cube } = this;
    const { clientWidth: parentWidth, clientHeight: parentHeight } = canvas.parentNode;

    if (canvas.width !== parentWidth || canvas.height !== parentHeight) {
      renderer.setSize(parentWidth, parentHeight, false);
      camera.aspect = parentWidth / parentHeight;
      camera.updateProjectionMatrix();
    }

    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    renderer.render(scene, camera);
  }
}
