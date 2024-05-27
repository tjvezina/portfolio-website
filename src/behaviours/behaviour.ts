import { Object3D } from 'three';

export default abstract class Behaviour {
  owner: Object3D;

  constructor(owner: Object3D) {
    this.owner = owner;
  }

  abstract update(): void;
}
