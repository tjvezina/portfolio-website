import { Object3D, PlaneGeometry, Vector3 } from 'three';

import App from '@/core/app';
import Wireframe from '@/objects/wireframe';
import CategoryGridView, { PRISM_DEPTH, PrismData } from '@/view/category-grid-view';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Camera centering speed — world units per second. */
const CENTER_SPEED = 3;

/** Duration for prisms to settle back to base z from cursor interaction offsets. */
const SETTLE_DURATION = 0.3;

/** Duration for the tunnel rush (prisms fly past camera). */
const TUNNEL_DURATION = 2.0;

/** How far forward non-selected prisms travel during tunnel. */
export const TUNNEL_DISTANCE = 25;

/** How far the selected cell recedes during the tunnel phase (linear). */
const SELECTED_RECEDE_TUNNEL = 5;

/** Duration for the selected square to fly to the top-left of the screen. */
const FLY_DURATION = 1.0;

/** Duration for the selected square to fly back from top-left (reverse). */
const RISE_DURATION = 0.8;

/**
 * Category -> Project transition.
 *
 * Forward -- all concurrent from t=0:
 *   Settle:  prisms return to base z (short, finishes early)
 *   Center:  camera pans to clicked cell (duration proportional to distance)
 *   Tunnel:  other prisms rush past camera; selected recedes
 *   Swap:    when center completes (or fly triggers), prism becomes a flat square
 *   Fly:     when selected separates from the grid, square flies to top-left
 *   Done when tunnel complete AND fly complete.
 *
 * Reverse -- all concurrent from t=0:
 *   Un-tunnel:  others slide back over TUNNEL_DURATION
 *   Fly-back:   square returns from top-left; swaps back to prism on arrival
 *   Un-center:  camera pans back (delayed to finish with un-tunnel)
 *   Done when tunnel complete.
 */
export default class GridTunnelTransition {
  readonly reverse: boolean;
  readonly cameraHomePos: Vector3;

  private _isComplete = false;
  get isComplete(): boolean { return this._isComplete; }

  // Grid reference
  private grid: CategoryGridView;
  private selectedPrismData!: PrismData;

  // Selected object (prism initially, square after swap)
  private selectedObj!: Object3D;
  private selectedOriginalX!: number;
  private selectedOriginalY!: number;

  // Other prisms
  private otherObjs: Object3D[] = [];

  private baseZ: number;
  private cameraCellPos: Vector3;
  private centerDuration: number;
  private elapsed = 0;

  // Forward: settle state (z offsets captured at construction)
  private otherSettleStartZ: number[] = [];
  private selectedSettleStartZ = 0;
  private settleDuration = 0;

  // Swap state (prism <-> square)
  private swapped = false;

  // Forward: fly state
  private flyStarted = false;
  private flyElapsed = 0;
  private flyStartPos = new Vector3();
  private flyTargetPos = new Vector3();

  // Reverse: captured start positions
  private selectedReverseStartPos = new Vector3();
  private otherReverseStartZ = 0;

  constructor(
    grid: CategoryGridView,
    selectedCol: number,
    selectedRow: number,
    reverse: boolean,
    cameraHomePos?: Vector3,
  ) {
    this.reverse = reverse;
    this.grid = grid;
    this.baseZ = -PRISM_DEPTH / 2;

    for (const prism of grid.prisms) {
      if (prism.col === selectedCol && prism.row === selectedRow) {
        this.selectedObj = prism.wireframe;
        this.selectedPrismData = prism;
        this.selectedOriginalX = prism.cx;
        this.selectedOriginalY = prism.cy;
        this.selectedSettleStartZ = prism.wireframe.position.z;
        this.swapped = !!prism.originalWireframe;
      } else {
        this.otherObjs.push(prism.wireframe);
        this.otherSettleStartZ.push(prism.wireframe.position.z);
      }
    }

    if (reverse) {
      this.cameraCellPos = App.cameraRig.position.clone();
      this.cameraHomePos = cameraHomePos ?? new Vector3(0, 0, App.cameraRig.position.z);
      this.selectedReverseStartPos.copy(this.selectedObj.position);
      this.otherReverseStartZ = this.otherObjs.length > 0
        ? this.otherObjs[0].position.z
        : this.baseZ + TUNNEL_DISTANCE;
    } else {
      this.cameraHomePos = App.cameraRig.position.clone();
      this.cameraCellPos = new Vector3(
        selectedCol * grid.cellSize + grid.position.x,
        selectedRow * grid.cellSize + grid.position.y,
        App.cameraRig.position.z,
      );
      let maxDisp = Math.abs(this.selectedSettleStartZ - this.baseZ);
      for (const z of this.otherSettleStartZ) {
        maxDisp = Math.max(maxDisp, Math.abs(z - this.baseZ));
      }
      this.settleDuration = maxDisp > 0.01 ? SETTLE_DURATION : 0;
    }

    const dx = this.cameraCellPos.x - this.cameraHomePos.x;
    const dy = this.cameraCellPos.y - this.cameraHomePos.y;
    this.centerDuration = Math.sqrt(dx * dx + dy * dy) / CENTER_SPEED;
  }

  /** Clean up swap state -- restores the original prism if it was swapped for a square. */
  dispose(): void {
    if (this.swapped) {
      this.performSwapBack();
    }
  }

  update(): void {
    if (this._isComplete) return;
    this.elapsed += App.deltaTime;
    if (this.reverse) {
      this.updateReverse();
    } else {
      this.updateForward();
    }
  }

  // ---------------------------------------------------------------------------
  // Forward
  // ---------------------------------------------------------------------------

  private updateForward(): void {
    // --- Settle: prisms return to base z (finishes early) ---
    const settleT = this.settleDuration > 0
      ? Math.min(1, this.elapsed / this.settleDuration) : 1;
    const settleE = easeOutCubic(settleT);

    // --- Center: camera pans to clicked cell ---
    const centerT = this.centerDuration > 0
      ? Math.min(1, this.elapsed / this.centerDuration) : 1;
    if (this.centerDuration > 0) {
      App.cameraRig.position.lerpVectors(
        this.cameraHomePos, this.cameraCellPos, easeInOutCubic(centerT),
      );
    } else {
      App.cameraRig.position.copy(this.cameraCellPos);
    }

    // --- Tunnel: other prisms rush forward ---
    const tunnelT = Math.min(1, this.elapsed / TUNNEL_DURATION);
    const tunnelOffset = TUNNEL_DISTANCE * easeInCubic(tunnelT);

    for (let i = 0; i < this.otherObjs.length; i++) {
      const s = this.otherSettleStartZ[i];
      const settled = s + (this.baseZ - s) * settleE;
      this.otherObjs[i].position.z = settled + tunnelOffset;
    }

    // --- Selected cell: recede + separation check + fly ---
    if (!this.flyStarted) {
      const ss = this.selectedSettleStartZ;
      const selectedSettled = ss + (this.baseZ - ss) * settleE;
      const prismCenterZ = selectedSettled - SELECTED_RECEDE_TUNNEL * tunnelT;

      // Check separation: selected front face clears other prisms' back face
      const frontFaceZ = prismCenterZ + PRISM_DEPTH / 2;
      const idealOtherZ = this.baseZ + tunnelOffset;
      const otherBack = idealOtherZ - PRISM_DEPTH / 2;
      const separated = frontFaceZ < otherBack;

      // Swap prism -> square when center completes or separation occurs
      if (!this.swapped && (centerT >= 1 || separated)) {
        this.performSwap();
      }

      // Position selected: square at front face, prism at center
      this.selectedObj.position.z = this.swapped
        ? prismCenterZ + PRISM_DEPTH / 2
        : prismCenterZ;

      // Begin fly to top-left when separated from grid
      if (separated) {
        this.flyStarted = true;
        this.flyElapsed = 0;
        this.flyStartPos.copy(this.selectedObj.position);
        this.flyTargetPos.copy(this.computeTopLeftTarget());
      }
    }

    if (this.flyStarted) {
      this.flyElapsed += App.deltaTime;
      const ft = Math.min(1, this.flyElapsed / FLY_DURATION);
      const fe = easeInOutCubic(ft);
      this.selectedObj.position.lerpVectors(this.flyStartPos, this.flyTargetPos, fe);
    }

    // Done when tunnel complete AND fly complete
    if (tunnelT >= 1 && this.flyStarted && this.flyElapsed >= FLY_DURATION) {
      this._isComplete = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Reverse
  // ---------------------------------------------------------------------------

  private updateReverse(): void {
    // --- Un-tunnel: others slide back over TUNNEL_DURATION ---
    const tunnelT = Math.min(1, this.elapsed / TUNNEL_DURATION);
    const tunnelE = easeOutCubic(tunnelT);

    for (const obj of this.otherObjs) {
      obj.position.z = this.otherReverseStartZ
        + (this.baseZ - this.otherReverseStartZ) * tunnelE;
    }

    // --- Fly-back: selected returns from top-left to grid position ---
    const riseT = Math.min(1, this.elapsed / RISE_DURATION);
    const riseE = easeOutCubic(riseT);

    const targetX = this.selectedOriginalX;
    const targetY = this.selectedOriginalY;
    // Square targets front face (z=0); prism targets center (baseZ)
    const targetZ = this.swapped ? 0 : this.baseZ;

    this.selectedObj.position.x = this.selectedReverseStartPos.x
      + (targetX - this.selectedReverseStartPos.x) * riseE;
    this.selectedObj.position.y = this.selectedReverseStartPos.y
      + (targetY - this.selectedReverseStartPos.y) * riseE;
    this.selectedObj.position.z = this.selectedReverseStartPos.z
      + (targetZ - this.selectedReverseStartPos.z) * riseE;

    // Swap back to prism when fly-back completes
    if (riseT >= 1 && this.swapped) {
      this.performSwapBack();
      this.selectedObj.position.set(targetX, targetY, this.baseZ);
    }

    // --- Un-center (delayed so it finishes with the tunnel) ---
    const centerDelay = Math.max(0, TUNNEL_DURATION - this.centerDuration);
    const centerElapsed = this.elapsed - centerDelay;
    if (this.centerDuration > 0 && centerElapsed > 0) {
      const centerT = Math.min(1, centerElapsed / this.centerDuration);
      App.cameraRig.position.lerpVectors(
        this.cameraCellPos, this.cameraHomePos, easeInOutCubic(centerT),
      );
    }

    // Done when tunnel complete (un-center finishes at the same time)
    if (tunnelT >= 1) {
      if (this.swapped) this.performSwapBack();
      for (const obj of this.otherObjs) obj.position.z = this.baseZ;
      this.selectedObj.position.set(this.selectedOriginalX, this.selectedOriginalY, this.baseZ);
      App.cameraRig.position.copy(this.cameraHomePos);
      this._isComplete = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Swap helpers
  // ---------------------------------------------------------------------------

  /** Swap the selected prism for a flat square at the front face position. */
  private performSwap(): void {
    this.swapped = true;
    const cs = this.grid.cellSize;

    const square = new Wireframe(new PlaneGeometry(cs, cs), { color: this.grid.color });
    square.position.set(
      this.selectedObj.position.x,
      this.selectedObj.position.y,
      this.selectedObj.position.z + PRISM_DEPTH / 2,
    );

    // Transfer thumbnail to the square
    if (this.selectedPrismData.thumbnailMesh?.parent === this.selectedObj) {
      this.selectedObj.remove(this.selectedPrismData.thumbnailMesh);
      this.selectedPrismData.thumbnailMesh.position.z = 0.01;
      square.add(this.selectedPrismData.thumbnailMesh);
    }

    // Replace in scene graph
    const parent = this.selectedObj.parent!;
    parent.remove(this.selectedObj);
    parent.add(square);

    // Update references
    this.selectedPrismData.originalWireframe = this.selectedPrismData.wireframe;
    this.selectedPrismData.wireframe = square;
    this.selectedObj = square;
  }

  /** Restore the original prism from a square swap. */
  private performSwapBack(): void {
    const original = this.selectedPrismData.originalWireframe;
    if (!original) return;

    const parent = this.selectedObj.parent;
    if (parent) {
      parent.remove(this.selectedObj);
      parent.add(original);
    }

    // Transfer thumbnail back to the prism
    if (this.selectedPrismData.thumbnailMesh?.parent === this.selectedObj) {
      this.selectedObj.remove(this.selectedPrismData.thumbnailMesh);
      this.selectedPrismData.thumbnailMesh.position.z = PRISM_DEPTH / 2 + 0.01;
      original.add(this.selectedPrismData.thumbnailMesh);
    }

    // Restore references
    this.selectedPrismData.wireframe = original;
    this.selectedPrismData.originalWireframe = undefined;
    this.selectedObj = original;
    this.swapped = false;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private computeTopLeftTarget(): Vector3 {
    return computeFlyTarget(this.grid.cellSize);
  }
}

/** Compute the top-left screen position in world coordinates at the grid plane. */
export function computeFlyTarget(cellSize: number): Vector3 {
  const cameraWorldZ = App.cameraRig.position.z + App.perspCamera.position.z;
  const targetZ = 0;
  const distance = cameraWorldZ - targetZ;
  const halfFovRad = App.perspCamera.fov * Math.PI / 360;
  const visibleHalfHeight = distance * Math.tan(halfFovRad);
  const visibleHalfWidth = visibleHalfHeight * App.perspCamera.aspect;

  const margin = cellSize * 1.1;
  return new Vector3(
    App.cameraRig.position.x - visibleHalfWidth + margin,
    App.cameraRig.position.y + visibleHalfHeight - margin,
    targetZ,
  );
}
