import THREE from 'three';

const H_FOV = 75;

export default class SceneManager {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  cube: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(horizontalToVerticalFOV(H_FOV, aspect), aspect, 0.1, 1000);
    this.camera.position.z = 5;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    const cube = new THREE.Mesh(geometry, material);
    this.scene.add(cube);
    this.cube = cube;

    requestAnimationFrame(this.draw.bind(this));
  }

  draw(): void {
    requestAnimationFrame(this.draw.bind(this));

    const { canvas, renderer, scene, camera } = this;
    const { clientWidth, clientHeight } = canvas;

    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.fov = horizontalToVerticalFOV(H_FOV, camera.aspect);
      camera.updateProjectionMatrix();
    }

    this.cube.rotation.x += 0.01;
    this.cube.rotation.y += 0.01;

    renderer.render(scene, camera);
  }
}

function horizontalToVerticalFOV(fov: number, aspect: number) {
  return 2 * Math.atan(Math.tan(fov/2 * THREE.MathUtils.DEG2RAD) / aspect) * THREE.MathUtils.RAD2DEG;
}
