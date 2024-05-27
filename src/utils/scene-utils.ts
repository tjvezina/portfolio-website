import { Object3D } from 'three';

import Behaviour from '@/behaviours/behaviour';

export function findObjectsWhere<T extends Object3D>(root: Object3D, predicate: (obj: Object3D) => obj is T): T[] {
  const matchingObjectList: T[] = [];

  matchingObjectList.push(...root.children.filter(predicate));

  for (const child of root.children) {
    matchingObjectList.push(...findObjectsWhere(child, predicate));
  }

  return matchingObjectList;
}

export function updateBehaviours(root: Object3D): void {
  for (const child of root.children) {
    child.userData.behaviours?.forEach((behaviour: Behaviour) => behaviour.update());

    updateBehaviours(child);
  }
}
