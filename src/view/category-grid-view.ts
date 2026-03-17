import { Object3D, Vector2 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { getCategoryData } from '@/data/loader';
import { ProjectData } from '@/data/types';
import { ProjectArea } from '@/scenes/main-scene';
import GridCell from '@/view/grid/grid-cell';
import { generateGridForCategory, GridLayout } from '@/view/grid/grid-geometry';

const CATEGORY_COLORS: Record<ProjectArea, NeonColor> = {
  [ProjectArea.College]: NeonColor.Orange,
  [ProjectArea.Personal]: NeonColor.Green,
  [ProjectArea.Career]: NeonColor.Cyan,
};

export default class CategoryGridView extends Object3D {
  area: ProjectArea;
  cells: GridCell[] = [];
  layout: GridLayout;
  onProjectClicked: ((project: ProjectData) => void) | null = null;

  private isPanning = false;
  private panStart = new Vector2();
  private dragDistance = 0;

  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private onClick: (e: MouseEvent) => void;

  constructor(area: ProjectArea) {
    super();
    this.area = area;

    const data = getCategoryData(area);
    const color = CATEGORY_COLORS[area];
    const cellSize = 1;

    this.layout = generateGridForCategory(area, data.projects.length, cellSize);

    for (let i = 0; i < data.projects.length; i++) {
      const cell = new GridCell(data.projects[i], this.layout.sides, cellSize, color);
      cell.position.set(this.layout.positions[i].x, this.layout.positions[i].y, 0);
      this.cells.push(cell);
      this.add(cell);
    }

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onClick = this.handleClick.bind(this);
  }

  enableInput(): void {
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('click', this.onClick);
  }

  disableInput(): void {
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('click', this.onClick);
  }

  private handlePointerDown(e: PointerEvent): void {
    this.isPanning = true;
    this.dragDistance = 0;
    this.panStart.set(e.clientX, e.clientY);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.isPanning) return;
    const dx = (e.clientX - this.panStart.x) / App.width * 10;
    const dy = -(e.clientY - this.panStart.y) / App.height * 10;
    this.dragDistance += Math.abs(e.clientX - this.panStart.x) + Math.abs(e.clientY - this.panStart.y);
    this.position.x += dx;
    this.position.y += dy;
    this.panStart.set(e.clientX, e.clientY);
  }

  private handlePointerUp(): void {
    this.isPanning = false;
  }

  private handleClick(): void {
    if (this.dragDistance > 5) return;
    for (const cell of this.cells) {
      const intersects = App.raycaster.intersectObject(cell, true);
      if (intersects.length > 0) {
        this.onCellClicked(cell);
        return;
      }
    }
  }

  private onCellClicked(cell: GridCell): void {
    this.onProjectClicked?.(cell.project);
  }

  dispose(): void {
    this.disableInput();
    for (const cell of this.cells) {
      cell.prism.geometry.dispose();
      cell.prism.lineMaterial.dispose();
      cell.prism.fillMaterial?.dispose();
    }
  }
}
