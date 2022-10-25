import { Scene } from 'three';

import ShatterIcosa from '@/objects/shatter-icosa';

export default class MainScene extends Scene {
  icosa: ShatterIcosa;

  constructor() {
    super();

    this.icosa = new ShatterIcosa();
    this.add(this.icosa);
  }

  update(): void {
    this.icosa.update();
  }
}
