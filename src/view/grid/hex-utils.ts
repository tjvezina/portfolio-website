import { BufferGeometry, CircleGeometry, CylinderGeometry, Vector2 } from 'three';

/** 6 axial neighbor directions for a hex grid. */
export const HEX_DIRECTIONS: [number, number][] = [
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
];

/** Convert axial hex coordinates to world-space XY (pointy-top orientation). */
export function hexToWorld(q: number, r: number, size: number): Vector2 {
  return new Vector2(
    size * Math.sqrt(3) * (q + r / 2),
    size * (3 / 2) * r,
  );
}

/** Hex ring distance (number of steps from the origin). */
export function hexDistance(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

/**
 * Create a regular hexagonal face geometry (pointy-top, in the XY plane).
 * `radius` is the circumradius (center to vertex).
 */
export function createHexFaceGeometry(radius: number): BufferGeometry {
  // CircleGeometry with 6 segments + thetaStart=π/6 → pointy-top hexagon
  // (vertices at 30°, 90°, 150°, 210°, 270°, 330°).
  return new CircleGeometry(radius, 6, Math.PI / 6);
}

/**
 * Create a hexagonal prism geometry (pointy-top, axis along Z, centered at origin).
 * Front face at +depth/2, back face at -depth/2.
 */
export function createHexPrismGeometry(radius: number, depth: number): BufferGeometry {
  const geo = new CylinderGeometry(radius, radius, depth, 6);
  // CylinderGeometry axis is Y — rotate to Z.
  // sin/cos parametrization places the first vertex at (0, y, R), which after
  // rotateX(π/2) lands at (0, -R) in XY — already pointy-top.
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Generate hex spiral coordinates (center first, then ring 1, ring 2, …).
 * Returns axial (q, r) pairs in ring-traversal order.
 */
export function generateHexSpiralCoords(count: number): [number, number][] {
  const coords: [number, number][] = [[0, 0]];
  let ring = 1;
  while (coords.length < count) {
    let q = ring;
    let r = 0;
    const directions: [number, number][] = [
      [-1, 1], [-1, 0], [0, -1],
      [1, -1], [1, 0], [0, 1],
    ];
    for (const [dq, dr] of directions) {
      for (let step = 0; step < ring && coords.length < count; step++) {
        coords.push([q, r]);
        q += dq;
        r += dr;
      }
    }
    ring++;
  }
  return coords;
}
