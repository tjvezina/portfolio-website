import { Vector2 } from 'three';

import { ProjectArea } from '@/data/types';

export interface GridLayout {
  positions: Vector2[];
  cellSize: number;
  sides: number;
}

export function generateSquareGrid(count: number, cellSize: number): GridLayout {
  const positions: Vector2[] = [];
  positions.push(new Vector2(0, 0));
  let x = 0; let y = 0; let dx = 1; let dy = 0; let steps = 1; let stepsTaken = 0; let turns = 0;
  while (positions.length < count) {
    x += dx;
    y += dy;
    positions.push(new Vector2(x * cellSize, y * cellSize));
    stepsTaken++;
    if (stepsTaken >= steps) {
      stepsTaken = 0;
      turns++;
      [dx, dy] = [-dy, dx];
      if (turns % 2 === 0) steps++;
    }
  }
  return { positions, cellSize, sides: 4 };
}

export function generateTriangleGrid(count: number, cellSize: number): GridLayout {
  const positions: Vector2[] = [];
  const h = cellSize * Math.sqrt(3) / 2;
  positions.push(new Vector2(0, 0));
  let ring = 1;
  while (positions.length < count) {
    for (let i = 0; i < ring * 6 && positions.length < count; i++) {
      const angle = (i / (ring * 6)) * Math.PI * 2;
      const px = Math.cos(angle) * ring * cellSize * 0.6;
      const py = Math.sin(angle) * ring * h * 0.6;
      positions.push(new Vector2(px, py));
    }
    ring++;
  }
  return { positions, cellSize, sides: 3 };
}

export function generateHexGrid(count: number, cellSize: number): GridLayout {
  const positions: Vector2[] = [];
  const sqrt3 = Math.sqrt(3);
  positions.push(new Vector2(0, 0));
  let ring = 1;
  while (positions.length < count) {
    let q = ring; let r = 0;
    const directions = [
      [-1, 1], [-1, 0], [0, -1],
      [1, -1], [1, 0], [0, 1],
    ];
    for (const [dq, dr] of directions) {
      for (let step = 0; step < ring && positions.length < count; step++) {
        const px = cellSize * (3 / 2 * q);
        const py = cellSize * (sqrt3 / 2 * q + sqrt3 * r);
        positions.push(new Vector2(px, py));
        q += dq;
        r += dr;
      }
    }
    ring++;
  }
  return { positions, cellSize, sides: 6 };
}

export function generateGridForCategory(area: ProjectArea, count: number, cellSize: number): GridLayout {
  switch (area) {
    case ProjectArea.College: return generateSquareGrid(count, cellSize);
    case ProjectArea.Personal: return generateTriangleGrid(count, cellSize);
    case ProjectArea.Career: return generateHexGrid(count, cellSize);
  }
}
