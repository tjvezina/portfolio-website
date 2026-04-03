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
function generateHexSpiralCoords(count: number): [number, number][] {
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

/** Ring traversal directions (starting at (ring, 0), walking counter-clockwise). */
const RING_DIRS: [number, number][] = [
  [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1],
];

/**
 * Generate a symmetric arrangement of `count` hex cells.
 *
 * Cells are chosen so the layout is symmetric across both the vertical (x=0)
 * and horizontal (y=0) axes.  Cells closest to the center are preferred.
 *
 * Symmetry operations in axial coordinates:
 *   Vertical  (V):  (q, r) → (−q−r, r)
 *   Horizontal (H): (q, r) → (q+r, −r)
 *   180° (VH):      (q, r) → (−q, −r)
 *
 * Each cell belongs to an orbit of size 1, 2, or 4.  The algorithm picks the
 * subset of orbits (sorted by distance, preferring closer) whose sizes sum to
 * exactly `count`, using depth-first search with backtracking.
 *
 * Returns axial (q, r) pairs sorted in reading order (top→bottom, left→right).
 */
export function generateSymmetricLayout(count: number, maxRadius = 8): [number, number][] {
  if (count <= 0) return [];

  type Orbit = { cells: [number, number][], distance: number };
  const orbits: Orbit[] = [];
  const assigned = new Set<string>();

  // Iterate all cells within maxRadius and group into symmetry orbits
  for (let ring = 0; ring <= maxRadius; ring++) {
    const ringCells: [number, number][] = ring === 0
      ? [[0, 0]]
      : (() => {
        const cells: [number, number][] = [];
        let q = ring, r = 0;
        for (const [dq, dr] of RING_DIRS) {
          for (let step = 0; step < ring; step++) {
            cells.push([q, r]);
            q += dq;
            r += dr;
          }
        }
        return cells;
      })();

    for (const [q, r] of ringCells) {
      if (assigned.has(`${q},${r}`)) continue;

      // Compute the full symmetry orbit of (q, r)
      const images: [number, number][] = [
        [q, r],
        [-q - r, r],    // V
        [q + r, -r],    // H
        [-q, -r],        // VH
      ];
      const unique = new Map<string, [number, number]>();
      for (const [cq, cr] of images) {
        unique.set(`${cq},${cr}`, [cq, cr]);
      }
      const cells = [...unique.values()];

      // Mark all orbit members as visited
      for (const [cq, cr] of cells) assigned.add(`${cq},${cr}`);

      // Only include orbits where every cell is within bounds
      if (cells.every(([cq, cr]) => hexDistance(cq, cr) <= maxRadius)) {
        const w = hexToWorld(q, r, 1);
        orbits.push({ cells, distance: Math.sqrt(w.x * w.x + w.y * w.y) });
      }
    }
  }

  // Sort by distance, then prefer smaller orbits at the same distance
  orbits.sort((a, b) => a.distance - b.distance || a.cells.length - b.cells.length);

  // DFS: select orbits whose sizes sum to exactly `count`, preferring closer ones
  function solve(index: number, remaining: number): Orbit[] | null {
    if (remaining === 0) return [];
    for (let i = index; i < orbits.length; i++) {
      if (orbits[i].cells.length > remaining) continue;
      const rest = solve(i + 1, remaining - orbits[i].cells.length);
      if (rest !== null) return [orbits[i], ...rest];
    }
    return null;
  }

  const selected = solve(0, count);
  if (!selected) return generateHexSpiralCoords(count);

  // Collect cells and sort in reading order: top-to-bottom (−r), left-to-right (q)
  const result: [number, number][] = [];
  for (const orbit of selected) {
    for (const cell of orbit.cells) result.push(cell);
  }
  result.sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0] - b[0];
  });

  return result;
}
