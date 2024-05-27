import { BufferAttribute, BufferGeometry, Object3D, Vector3 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Wireframe from '@/objects/wireframe';

const SIDE_ANGLE = 2*Math.PI / 5;

export default class ShatterIcosa extends Object3D {
  size: number;

  shardNormal: Vector3;

  constructor(size = 1) {
    super();

    this.size = size;

    this.#buildGeometry();
  }

  #buildGeometry(): void {
    const v1 = new Vector3(0, 1, 0).multiplyScalar(this.size);
    const v2 = v1.clone().applyAxisAngle(new Vector3(1, 0, 0), (Math.PI/2 - Math.atan(0.5)));
    const v3 = v2.clone().applyAxisAngle(new Vector3(0, 1, 0), SIDE_ANGLE);

    this.shardNormal = v1.clone().add(v2).add(v3).normalize();

    const geometry = new BufferGeometry();
    geometry.setIndex([
      0, 1, 2,
      0, 2, 3,
      0, 3, 1,
      1, 3, 2,
    ]);
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      v1.x, v1.y, v1.z,
      v2.x, v2.y, v2.z,
      v3.x, v3.y, v3.z,
      0, 0, 0,
    ]), 3));

    const shards = [new Object3D().add(new Wireframe(geometry, { color: NeonColor.Green }))];

    for (let i = 0; i < 4; i++) {
      const shard = shards[0].clone();
      shard.rotation.y = SIDE_ANGLE * (i + 1);
      shards.push(shard);
    }

    for (let i = 0; i < 5; i++) {
      const shard = shards[0].clone();
      shard.rotateOnWorldAxis(v3.clone().normalize(), SIDE_ANGLE);
      shard.rotateOnWorldAxis(new Vector3(0, 1, 0), SIDE_ANGLE * i);
      shards.push(shard);
    }

    for (let i = 0; i < 10; i++) {
      const shard = shards[i].clone();
      shard.rotateOnWorldAxis(new Vector3(0, 0, 1), Math.PI);
      shard.rotateOnWorldAxis(new Vector3(0, 1, 0), Math.PI);
      shards.push(shard);
    }

    this.add(...shards);
  }

  update(): void {
    const t = Math.max(0, -Math.cos(App.clock.elapsedTime));

    this.children.forEach(shard => {
      const mesh = shard.children[0];
      mesh.position.copy(
        this.shardNormal.clone().multiplyScalar(t),
      );
      mesh.rotation.set(0, 0, 0);
      mesh.rotateOnAxis(this.shardNormal, Math.PI/3 * (-Math.cos(t * Math.PI) /2 + 0.5));
    });
  }
}
