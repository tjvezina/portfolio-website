import { BufferGeometry, Mesh, Quaternion, Vector3 } from 'three';

import App from '@/core/app';
import { ProjectArea } from '@/data/types';
import Wireframe from '@/objects/wireframe';
import { Planet } from '@/view/home-view';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getGeometry(wireframe: Wireframe): BufferGeometry | null {
  for (const child of wireframe.children) {
    if (child instanceof Mesh) return child.geometry as BufferGeometry;
  }
  return null;
}

/**
 * Compute a target quaternion that:
 *   1. Aligns the face whose normal is closest to world +Z (face F) to face +Z exactly.
 *   2. Rotates around Z so the vector from F's centroid to F's lowest edge midpoint
 *      points in the world -Y direction (upright).
 */
function computeFaceUpQuat(wireframe: Wireframe, currentQuat: Quaternion): Quaternion {
  const geometry = getGeometry(wireframe);
  if (!geometry) return new Quaternion();

  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const faceCount = index ? index.count / 3 : positions.count / 3;

  const va = new Vector3();
  const vb = new Vector3();
  const vc = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();
  const n = new Vector3();

  // Group triangles by local-space face normal
  type FaceGroup = { normal: Vector3, triangles: [number, number, number][] };
  const groups = new Map<string, FaceGroup>();

  for (let i = 0; i < faceCount; i++) {
    const i0 = index ? index.getX(i * 3) : i * 3;
    const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2;

    va.fromBufferAttribute(positions, i0);
    vb.fromBufferAttribute(positions, i1);
    vc.fromBufferAttribute(positions, i2);
    e1.subVectors(vb, va);
    e2.subVectors(vc, va);
    n.crossVectors(e1, e2).normalize();

    const key = `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, { normal: n.clone(), triangles: [] });
    groups.get(key)!.triangles.push([i0, i1, i2]);
  }

  // Find face F — the group whose world-space normal is closest to +Z
  const worldZ = new Vector3(0, 0, 1);
  let bestGroup: FaceGroup | null = null;
  let bestDot = -Infinity;

  for (const group of groups.values()) {
    const dot = group.normal.clone().applyQuaternion(currentQuat).dot(worldZ);
    if (dot > bestDot) { bestDot = dot; bestGroup = group; }
  }
  if (!bestGroup) return new Quaternion();

  // Collect unique vertices of F and compute its centroid (local space)
  const vertexSet = new Set<number>();
  for (const tri of bestGroup.triangles) for (const vi of tri) vertexSet.add(vi);

  const centroid = new Vector3();
  for (const vi of vertexSet) {
    centroid.x += positions.getX(vi);
    centroid.y += positions.getY(vi);
    centroid.z += positions.getZ(vi);
  }
  centroid.divideScalar(vertexSet.size);

  // Find boundary edges of F (edges that appear exactly once within the face group)
  const edgeCounts = new Map<string, { v0: number, v1: number, count: number }>();
  for (const [i0, i1, i2] of bestGroup.triangles) {
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as [number, number][]) {
      const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
      const entry = edgeCounts.get(key);
      if (entry) entry.count++;
      else edgeCounts.set(key, { v0: a, v1: b, count: 1 });
    }
  }
  const boundaryEdges = [...edgeCounts.values()].filter(e => e.count === 1);

  // Find edge E — the boundary edge whose midpoint has the lowest world-Y
  let bestEdge: { v0: number, v1: number } | null = null;
  let lowestY = Infinity;

  for (const edge of boundaryEdges) {
    va.set(positions.getX(edge.v0), positions.getY(edge.v0), positions.getZ(edge.v0));
    vb.set(positions.getX(edge.v1), positions.getY(edge.v1), positions.getZ(edge.v1));
    const worldY = va.clone().add(vb).multiplyScalar(0.5).applyQuaternion(currentQuat).y;
    if (worldY < lowestY) { lowestY = worldY; bestEdge = edge; }
  }
  if (!bestEdge) return new Quaternion();

  // Direction from F's centroid to E's midpoint (local space)
  va.set(positions.getX(bestEdge.v0), positions.getY(bestEdge.v0), positions.getZ(bestEdge.v0));
  vb.set(positions.getX(bestEdge.v1), positions.getY(bestEdge.v1), positions.getZ(bestEdge.v1));
  const edgeMid = va.clone().add(vb).multiplyScalar(0.5);
  const faceToEdge = edgeMid.sub(centroid).normalize();

  // R1: rotate face normal → world +Z
  const R1 = new Quaternion().setFromUnitVectors(bestGroup.normal.clone().normalize(), worldZ);

  // After R1, faceToEdge lands in the XY plane; rotate around Z to point it toward -Y
  const faceToEdgeXY = faceToEdge.clone().applyQuaternion(R1).setZ(0).normalize();
  const R2 = new Quaternion().setFromUnitVectors(faceToEdgeXY, new Vector3(0, -1, 0));

  // Combined: apply R1 first, then R2
  return R2.multiply(R1);
}

/**
 * Compute a target quaternion that:
 *   1. Aligns the vertex closest to world +Z to face +Z exactly (vertex-toward-camera,
 *      producing a hexagonal silhouette for a cube).
 *   2. Among that vertex's edge-connected neighbors, picks the one with the lowest
 *      world-Y and rotates around Z so it points straight down (-Y).
 */
function computeVertexUpQuat(wireframe: Wireframe, currentQuat: Quaternion): Quaternion {
  const geometry = getGeometry(wireframe);
  if (!geometry) return new Quaternion();

  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();

  // Deduplicate vertices by position (BoxGeometry has 24 buffer vertices for 8 corners)
  const vertices: Vector3[] = [];
  const vertexMap = new Map<string, number>();
  const bufferToUnique = new Int32Array(positions.count);
  const v = new Vector3();

  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let ui = vertexMap.get(key);
    if (ui === undefined) {
      ui = vertices.length;
      vertexMap.set(key, ui);
      vertices.push(v.clone());
    }
    bufferToUnique[i] = ui;
  }

  // Find the vertex whose world-space direction is closest to +Z
  const worldZ = new Vector3(0, 0, 1);
  let bestIdx = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const dot = vertices[i].clone().applyQuaternion(currentQuat).normalize().dot(worldZ);
    if (dot > bestDot) { bestDot = dot; bestIdx = i; }
  }

  // R1: rotate chosen vertex direction → +Z
  const vertexDir = vertices[bestIdx].clone().normalize();
  const R1 = new Quaternion().setFromUnitVectors(vertexDir, worldZ);

  // Build triangle adjacency for the chosen vertex
  const triCount = index ? index.count / 3 : positions.count / 3;
  const adjacent = new Set<number>();
  for (let i = 0; i < triCount; i++) {
    const i0 = bufferToUnique[index ? index.getX(i * 3) : i * 3];
    const i1 = bufferToUnique[index ? index.getX(i * 3 + 1) : i * 3 + 1];
    const i2 = bufferToUnique[index ? index.getX(i * 3 + 2) : i * 3 + 2];
    if (i0 === bestIdx) { adjacent.add(i1); adjacent.add(i2); }
    if (i1 === bestIdx) { adjacent.add(i0); adjacent.add(i2); }
    if (i2 === bestIdx) { adjacent.add(i0); adjacent.add(i1); }
  }

  // Filter to true edge neighbors (shortest distance only — excludes face diagonals)
  const chosenPos = vertices[bestIdx];
  let shortestDist = Infinity;
  for (const ni of adjacent) {
    const d = vertices[ni].distanceTo(chosenPos);
    if (d < shortestDist - 0.001) shortestDist = d;
  }
  const neighbors: number[] = [];
  for (const ni of adjacent) {
    if (vertices[ni].distanceTo(chosenPos) < shortestDist + 0.001) {
      neighbors.push(ni);
    }
  }

  // After R1, find the neighbor with the lowest Y
  let lowestIdx = -1;
  let lowestY = Infinity;
  for (const ni of neighbors) {
    const y = vertices[ni].clone().applyQuaternion(R1).y;
    if (y < lowestY) { lowestY = y; lowestIdx = ni; }
  }
  if (lowestIdx === -1) return R1;

  // R2: rotate around Z so that neighbor points toward -Y
  const neighborXY = vertices[lowestIdx].clone().applyQuaternion(R1).setZ(0).normalize();
  const R2 = new Quaternion().setFromUnitVectors(neighborXY, new Vector3(0, -1, 0));

  return R2.multiply(R1);
}

/**
 * Pick the appropriate target-orientation function for a given planet.
 * Cube → vertex-toward-camera (hexagonal silhouette).
 * Others → face-toward-camera (current default).
 */
export function computeTargetQuat(
  wireframe: Wireframe, currentQuat: Quaternion, area: ProjectArea,
): Quaternion {
  if (area === ProjectArea.College) {
    return computeVertexUpQuat(wireframe, currentQuat);
  }
  return computeFaceUpQuat(wireframe, currentQuat);
}

/** Z offset for shrinking elements to prevent clipping with the selected planet. */
const SHRINK_Z = -5;

export default class PlanetFocusTransition {
  readonly reverse: boolean;

  private selectedPlanet: Planet;
  private otherPlanets: Planet[];
  private sun: Wireframe;
  private duration: number;
  private elapsed = 0;
  private _isComplete = false;

  private selectedStartPos: Vector3;
  private selectedTargetPos: Vector3;
  private selectedStartScale: number;
  private selectedTargetScale: number;
  private selectedStartQuat: Quaternion;
  private selectedTargetQuat: Quaternion;
  private otherStartPositions: Vector3[];
  private otherTargetPositions: Vector3[];
  private otherStartScale: number;
  private otherTargetScale: number;
  private sunStartScale: number;
  private sunTargetScale: number;
  private sunStartZ: number;
  private sunTargetZ: number;

  get isComplete(): boolean { return this._isComplete; }

  constructor(
    selectedPlanet: Planet,
    otherPlanets: Planet[],
    sun: Wireframe,
    targetScale: number,
    duration: number,
    reverse = false,
  ) {
    this.reverse = reverse;
    this.selectedPlanet = selectedPlanet;
    this.otherPlanets = otherPlanets;
    this.sun = sun;
    this.duration = duration;

    if (reverse) {
      // Reverse: from focused position back to orbit
      this.selectedStartPos = new Vector3(0, 0, 1);
      const anchorPos = new Vector3();
      selectedPlanet.anchor.getWorldPosition(anchorPos);
      this.selectedTargetPos = anchorPos;
      this.selectedStartScale = targetScale;
      this.selectedTargetScale = 1;
      this.selectedStartQuat = selectedPlanet.wireframe.quaternion.clone();
      this.selectedTargetQuat = this.selectedStartQuat.clone();
      this.otherStartPositions = otherPlanets.map(() => new Vector3(0, 0, SHRINK_Z));
      this.otherTargetPositions = otherPlanets.map(p => {
        const pos = new Vector3();
        p.anchor.getWorldPosition(pos);
        return pos;
      });
      this.otherStartScale = 0;
      this.otherTargetScale = 1;
      this.sunStartScale = 0;
      this.sunTargetScale = 1;
      this.sunStartZ = SHRINK_Z;
      this.sunTargetZ = 0;
    } else {
      // Forward: from orbit to focused center position
      selectedPlanet.tumble.freeze();
      this.selectedStartPos = selectedPlanet.wireframe.position.clone();
      this.selectedTargetPos = new Vector3(0, 0, 1);
      this.selectedStartScale = 1;
      this.selectedTargetScale = targetScale;
      this.selectedStartQuat = selectedPlanet.wireframe.quaternion.clone();
      this.selectedTargetQuat = computeTargetQuat(selectedPlanet.wireframe, this.selectedStartQuat, selectedPlanet.area);
      this.otherStartPositions = otherPlanets.map(p => p.wireframe.position.clone());
      this.otherTargetPositions = otherPlanets.map(() => new Vector3(0, 0, SHRINK_Z));
      this.otherStartScale = 1;
      this.otherTargetScale = 0;
      this.sunStartScale = 1;
      this.sunTargetScale = 0;
      this.sunStartZ = 0;
      this.sunTargetZ = SHRINK_Z;
    }
  }

  /**
   * Must be called AFTER homeView.update() each frame so that planet.update()'s
   * anchor-based position writes are overridden by this transition.
   */
  update(): void {
    if (this._isComplete) {
      if (!this.reverse) {
        // Hold final state — planet.update() would override wireframe positions otherwise.
        this.selectedPlanet.wireframe.position.copy(this.selectedTargetPos);
        this.selectedPlanet.wireframe.quaternion.copy(this.selectedTargetQuat);
      }
      return;
    }

    this.elapsed += App.deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = easeInOutCubic(t);

    // Selected planet: interpolate position, scale, and (forward only) rotation
    this.selectedPlanet.wireframe.position.lerpVectors(
      this.selectedStartPos, this.selectedTargetPos, eased,
    );
    const scale = this.selectedStartScale + (this.selectedTargetScale - this.selectedStartScale) * eased;
    this.selectedPlanet.wireframe.scale.setScalar(scale);
    if (!this.reverse) {
      this.selectedPlanet.wireframe.quaternion.slerpQuaternions(
        this.selectedStartQuat, this.selectedTargetQuat, eased,
      );
    }

    // Other planets: interpolate position and scale
    for (let i = 0; i < this.otherPlanets.length; i++) {
      this.otherPlanets[i].wireframe.position.lerpVectors(
        this.otherStartPositions[i], this.otherTargetPositions[i], eased,
      );
      const s = this.otherStartScale + (this.otherTargetScale - this.otherStartScale) * eased;
      this.otherPlanets[i].wireframe.scale.setScalar(s);
    }

    // Sun: interpolate scale and z position
    const sunScale = this.sunStartScale + (this.sunTargetScale - this.sunStartScale) * eased;
    this.sun.scale.setScalar(sunScale);
    this.sun.position.z = this.sunStartZ + (this.sunTargetZ - this.sunStartZ) * eased;

    if (t >= 1) {
      this.selectedPlanet.wireframe.position.copy(this.selectedTargetPos);
      this.selectedPlanet.wireframe.scale.setScalar(this.selectedTargetScale);
      if (!this.reverse) {
        this.selectedPlanet.wireframe.quaternion.copy(this.selectedTargetQuat);
      }
      for (let i = 0; i < this.otherPlanets.length; i++) {
        this.otherPlanets[i].wireframe.position.copy(this.otherTargetPositions[i]);
        this.otherPlanets[i].wireframe.scale.setScalar(this.otherTargetScale);
      }
      this.sun.scale.setScalar(this.sunTargetScale);
      this.sun.position.z = this.sunTargetZ;
      this._isComplete = true;
    }
  }

  /** Restore all objects to their pre-transition state. */
  restore(): void {
    this.selectedPlanet.wireframe.scale.setScalar(1);
    for (const planet of this.otherPlanets) {
      planet.wireframe.scale.setScalar(1);
    }
    this.sun.scale.setScalar(1);
  }
}
