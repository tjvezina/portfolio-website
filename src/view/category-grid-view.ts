import { BoxGeometry, Object3D, Plane, PlaneGeometry, Vector2, Vector3 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { ProjectArea, ProjectData } from '@/data/types';
import Wireframe from '@/objects/wireframe';

/** How far (Chebyshev distance) the grid extends from the center cell. */
const MAX_GRID_RADIUS = 8;

/** Duration in seconds for each wave's fold animation. */
const WAVE_DURATION = 0.15;

/** Depth of each prism extending behind the grid plane. */
const PRISM_DEPTH = 5;

/** Maximum distance a prism extends toward the camera (and the cursor-interaction plane z). */
const PRISM_MAX_EXTENSION = 1.0;

/** World-space radius of the cursor's area of influence on surrounding prisms. */
const PRISM_EFFECT_RADIUS = 4;

/** Speed factor for lerping prism z toward its target (units per second, exponential). */
const PRISM_LERP_SPEED = 10;

/** Duration for prisms to settle back to base z during reverse fold. */
const REVERSE_SETTLE_DURATION = 0.3;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface FoldConfig {
  axis: 'x' | 'y';
  startAngle: number;
}

interface WaveCell {
  col: number;
  row: number;
  /** Direction from source cell to this cell: one of (±1,0) or (0,±1). */
  dc: number;
  dr: number;
}

export default class CategoryGridView extends Object3D {
  area: ProjectArea;
  onProjectClicked: ((project: ProjectData) => void) | null = null;

  initialFace: Wireframe | null = null;

  private color: NeonColor;
  private isPanning = false;
  private panStart = new Vector2();
  private dragDistance = 0;
  private originalPosition = new Vector3();

  // BFS wave unfold state
  private filledCells = new Set<string>();
  private cellSize = 0;
  private allWavePivots: Object3D[] = []; // every pivot ever created — for cleanup
  private currentWavePivots: Object3D[] = [];
  private currentWaveConfigs: FoldConfig[] = [];
  private currentWaveCells: { col: number, row: number }[] = [];
  private waveActive = false;
  private waveElapsed = 0;
  private waveDuration = 0;
  private onAllWavesComplete: (() => void) | null = null;

  // Prism grid state (active after unfold completes)
  private prisms: { wireframe: Wireframe, col: number, row: number, cx: number, cy: number }[] = [];
  private prismsActive = false;

  // Reverse fold state
  private reversePhase: 'idle' | 'settling' | 'folding' = 'idle';
  private reverseSettleElapsed = 0;
  private prismStartZ: number[] = [];
  private reverseWaves: WaveCell[][] = [];
  private reverseWaveIndex = 0;
  private onReverseFoldComplete: (() => void) | null = null;
  private squares = new Map<string, Wireframe>();

  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;

  constructor(area: ProjectArea, color: NeonColor) {
    super();
    this.area = area;
    this.color = color;

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
  }

  /** Store the current position as the original so resetPan can restore it. */
  saveOriginalPosition(): void {
    this.originalPosition.copy(this.position);
  }

  /** Reset position to the stored original, undoing any pan drift. */
  resetPan(): void {
    this.position.copy(this.originalPosition);
  }

  /**
   * Create and show the initial flat face square — the first cell of the unfolding animation.
   * Call this once when the planet focus transition completes.
   */
  showInitialFace(cellSize: number): void {
    if (this.initialFace) return;
    this.initialFace = new Wireframe(new PlaneGeometry(cellSize, cellSize), { color: this.color });
    this.add(this.initialFace);
  }

  /**
   * Begin the BFS unfold sequence.  The center cell (0,0) is already placed as
   * initialFace; this creates wave 1 (the cross) and automatically launches each
   * subsequent wave until MAX_GRID_RADIUS is filled.  All waves use WAVE_DURATION
   * so the rhythm is uniform throughout.  Calls onComplete when all waves finish.
   */
  startCrossUnfold(cellSize: number, onComplete?: () => void): void {
    this.cellSize = cellSize;
    this.onAllWavesComplete = onComplete ?? null;

    // Remove all pivots from a previous visit
    for (const pivot of this.allWavePivots) this.remove(pivot);
    this.allWavePivots = [];
    this.currentWavePivots = [];
    this.currentWaveConfigs = [];
    this.currentWaveCells = [];

    // Remove old prisms from a previous visit
    for (const { wireframe } of this.prisms) this.remove(wireframe);
    this.prisms = [];
    this.prismsActive = false;

    // Reset BFS state
    this.filledCells.clear();
    this.filledCells.add('0,0');

    // Swap the initial face (0,0) to a prism immediately
    if (this.initialFace) {
      this.remove(this.initialFace);
      this.initialFace = null;
    }
    this.createPrism(0, 0);
    this.prismsActive = true;

    // Wave 1: the four direct neighbours of (0,0)
    const wave1: WaveCell[] = [
      { col: 0, row: 1, dc: 0, dr: 1 },
      { col: 0, row: -1, dc: 0, dr: -1 },
      { col: 1, row: 0, dc: 1, dr: 0 },
      { col: -1, row: 0, dc: -1, dr: 0 },
    ];
    this.launchWave(wave1, WAVE_DURATION);
  }

  /**
   * Begin the reverse fold sequence: settle prisms to base z, swap to squares,
   * fold squares back in reverse wave order.  Calls onComplete when the center
   * square is the only cell remaining.
   */
  startReverseFold(cellSize: number, onComplete: () => void): void {
    this.cellSize = cellSize;
    this.onReverseFoldComplete = onComplete;

    // Stop cursor interaction
    this.prismsActive = false;

    // Capture starting z for each prism (may differ due to cursor interaction)
    this.prismStartZ = this.prisms.map(p => p.wireframe.position.z);

    // Pre-compute all waves for reverse processing
    this.reverseWaves = this.computeAllWaves();
    this.reverseWaveIndex = this.reverseWaves.length - 1;

    // Start settling phase
    this.reversePhase = 'settling';
    this.reverseSettleElapsed = 0;
  }

  /** Remove the center square left after a completed reverse fold. */
  removeCenterSquare(): void {
    const center = this.squares.get('0,0');
    if (center) {
      this.remove(center);
      this.squares.delete('0,0');
    }
  }

  update(): void {
    // Drive reverse fold phases if active
    if (this.reversePhase !== 'idle') {
      this.updateReverse();
      return;
    }

    // Animate active unfold wave
    if (this.waveActive) {
      this.waveElapsed += App.deltaTime;
      const t = Math.min(1, this.waveElapsed / this.waveDuration);
      const eased = easeOutCubic(t);

      for (let i = 0; i < this.currentWavePivots.length; i++) {
        const pivot = this.currentWavePivots[i];
        const cfg = this.currentWaveConfigs[i];
        const angle = cfg.startAngle * (1 - eased);
        if (cfg.axis === 'x') {
          pivot.rotation.x = angle;
        } else {
          pivot.rotation.y = angle;
        }
      }

      if (t >= 1) {
        // Remove this wave's pivots and replace with prisms
        for (let i = 0; i < this.currentWavePivots.length; i++) {
          this.remove(this.currentWavePivots[i]);
          const cell = this.currentWaveCells[i];
          this.createPrism(cell.col, cell.row);
        }
        // Remove completed pivots from the allWavePivots tracking list
        const completed = new Set(this.currentWavePivots);
        this.allWavePivots = this.allWavePivots.filter(p => !completed.has(p));

        this.currentWavePivots = [];
        this.currentWaveConfigs = [];
        this.currentWaveCells = [];
        this.waveActive = false;

        const nextWave = this.computeNextWave();
        if (nextWave.length > 0 && this.isWaveVisible(nextWave)) {
          this.launchWave(nextWave, WAVE_DURATION);
        } else {
          if (nextWave.length > 0) {
            this.fillRemainingCells(nextWave);
          }
          this.onAllWavesComplete?.();
          this.onAllWavesComplete = null;
        }
      }
    }

    // Drive prism cursor interaction
    if (this.prismsActive) {
      this.updatePrisms();
    }
  }

  enableInput(): void {
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  disableInput(): void {
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  // ---------------------------------------------------------------------------
  // Reverse fold helpers
  // ---------------------------------------------------------------------------

  private updateReverse(): void {
    if (this.reversePhase === 'settling') {
      this.reverseSettleElapsed += App.deltaTime;
      const t = Math.min(1, this.reverseSettleElapsed / REVERSE_SETTLE_DURATION);
      const eased = easeOutCubic(t);
      const baseZ = -PRISM_DEPTH / 2;

      for (let i = 0; i < this.prisms.length; i++) {
        const startZ = this.prismStartZ[i];
        this.prisms[i].wireframe.position.z = startZ + (baseZ - startZ) * eased;
      }

      if (t >= 1) {
        this.swapPrismsToSquares();
        this.cullOffscreenSquares();
        this.reversePhase = 'folding';
        this.launchReverseWave();
      }
      return;
    }

    if (this.reversePhase === 'folding' && this.waveActive) {
      this.waveElapsed += App.deltaTime;
      const t = Math.min(1, this.waveElapsed / this.waveDuration);
      const eased = easeOutCubic(t);

      for (let i = 0; i < this.currentWavePivots.length; i++) {
        const pivot = this.currentWavePivots[i];
        const cfg = this.currentWaveConfigs[i];
        // Reverse: fold from flat (0°) to folded (startAngle)
        const angle = cfg.startAngle * eased;
        if (cfg.axis === 'x') {
          pivot.rotation.x = angle;
        } else {
          pivot.rotation.y = angle;
        }
      }

      if (t >= 1) {
        for (const pivot of this.currentWavePivots) this.remove(pivot);
        this.currentWavePivots = [];
        this.currentWaveConfigs = [];
        this.currentWaveCells = [];
        this.waveActive = false;

        this.reverseWaveIndex--;
        if (this.reverseWaveIndex >= 0) {
          this.launchReverseWave();
        } else {
          // All waves folded back — only center square remains
          this.reversePhase = 'idle';
          this.onReverseFoldComplete?.();
          this.onReverseFoldComplete = null;
        }
      }
    }
  }

  /** Replace all prisms with flat squares at the same grid positions. */
  private swapPrismsToSquares(): void {
    const cs = this.cellSize;
    this.squares.clear();
    for (const { wireframe, col, row, cx, cy } of this.prisms) {
      this.remove(wireframe);
      const square = new Wireframe(new PlaneGeometry(cs, cs), { color: this.color });
      square.position.set(cx, cy, 0);
      this.add(square);
      this.squares.set(`${col},${row}`, square);
    }
    this.prisms = [];
  }

  /** Check whether any cell in a wave falls within the visible screen area. */
  private isWaveVisible(wave: WaveCell[]): boolean {
    const cam = App.camera;
    const halfW = cam.right;
    const halfH = cam.top;
    const margin = this.cellSize / 2;
    return wave.some(({ col, row }) => {
      const cx = col * this.cellSize;
      const cy = row * this.cellSize;
      return Math.abs(cx) < halfW + margin && Math.abs(cy) < halfH + margin;
    });
  }

  /**
   * Remove all squares from waves that are entirely off-screen and adjust
   * reverseWaveIndex so the fold animation starts from the first visible wave.
   */
  private cullOffscreenSquares(): void {
    // Walk inward from the outermost wave to find the first with a visible cell
    let firstVisible = 0;
    for (let i = this.reverseWaves.length - 1; i >= 0; i--) {
      if (this.isWaveVisible(this.reverseWaves[i])) {
        firstVisible = i;
        break;
      }
    }

    // Instantly remove squares for all waves beyond the first visible one
    for (let i = this.reverseWaves.length - 1; i > firstVisible; i--) {
      for (const { col, row } of this.reverseWaves[i]) {
        const key = `${col},${row}`;
        const square = this.squares.get(key);
        if (square) {
          this.remove(square);
          this.squares.delete(key);
        }
      }
    }

    this.reverseWaveIndex = firstVisible;
  }

  /**
   * Create prisms for all remaining unfilled cells at once (used when the
   * forward unfold has expanded past the visible screen area).
   */
  private fillRemainingCells(startingWave: WaveCell[]): void {
    for (const { col, row } of startingWave) {
      this.filledCells.add(`${col},${row}`);
      this.createPrism(col, row);
    }
    while (true) {
      const next = this.computeNextWave();
      if (next.length === 0) break;
      for (const { col, row } of next) {
        this.filledCells.add(`${col},${row}`);
        this.createPrism(col, row);
      }
    }
  }

  /** Launch the next reverse wave (outermost → innermost). */
  private launchReverseWave(): void {
    const wave = this.reverseWaves[this.reverseWaveIndex];
    const cs = this.cellSize;

    for (const { col, row, dc, dr } of wave) {
      // Remove the square for this cell
      const key = `${col},${row}`;
      const square = this.squares.get(key);
      if (square) {
        this.remove(square);
        this.squares.delete(key);
      }

      // Create pivot on the shared edge (same geometry as forward unfold)
      const pivotX = (col - dc) * cs + dc * cs / 2;
      const pivotY = (row - dr) * cs + dr * cs / 2;

      const pivot = new Object3D();
      pivot.position.set(pivotX, pivotY, 0);

      const face = new Wireframe(new PlaneGeometry(cs, cs), { color: this.color });
      face.position.set(dc * cs / 2, dr * cs / 2, 0);
      pivot.add(face);

      // Target angle matches the forward start angle
      let targetAngle: number;
      if (dc !== 0) {
        targetAngle = dc * Math.PI / 2;
      } else {
        targetAngle = -dr * Math.PI / 2;
      }

      this.add(pivot);
      this.currentWavePivots.push(pivot);
      this.currentWaveConfigs.push({ axis: dc !== 0 ? 'y' : 'x', startAngle: targetAngle });
      this.currentWaveCells.push({ col, row });
    }

    this.waveElapsed = 0;
    this.waveDuration = WAVE_DURATION;
    this.waveActive = true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute all BFS waves from center outward, without modifying instance state.
   * Used by the reverse fold to process waves in reverse order.
   */
  private computeAllWaves(): WaveCell[][] {
    const waves: WaveCell[][] = [];
    const filled = new Set<string>();
    filled.add('0,0');

    const wave1: WaveCell[] = [
      { col: 0, row: 1, dc: 0, dr: 1 },
      { col: 0, row: -1, dc: 0, dr: -1 },
      { col: 1, row: 0, dc: 1, dr: 0 },
      { col: -1, row: 0, dc: -1, dr: 0 },
    ];
    for (const cell of wave1) filled.add(`${cell.col},${cell.row}`);
    waves.push(wave1);

    while (true) {
      const next = this.computeNextWaveFrom(filled);
      if (next.length === 0) break;
      for (const cell of next) filled.add(`${cell.col},${cell.row}`);
      waves.push(next);
    }

    return waves;
  }

  /**
   * BFS: find the next ring of empty cells adjacent to the given filled set.
   */
  private computeNextWaveFrom(filled: Set<string>): WaveCell[] {
    const R = MAX_GRID_RADIUS;
    const candidates = new Map<string, WaveCell & { horizontal: boolean }>();

    for (const key of filled) {
      const comma = key.indexOf(',');
      const col = parseInt(key.slice(0, comma), 10);
      const row = parseInt(key.slice(comma + 1), 10);

      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const nc = col + dc;
        const nr = row + dr;

        if (Math.abs(nc) > R || Math.abs(nr) > R) continue;

        const nk = `${nc},${nr}`;
        if (filled.has(nk)) continue;

        const isHorizontal = dc !== 0;

        if (!candidates.has(nk)) {
          candidates.set(nk, { col: nc, row: nr, dc, dr, horizontal: isHorizontal });
        } else if (!candidates.get(nk)!.horizontal && isHorizontal) {
          // Upgrade to horizontal source
          candidates.set(nk, { col: nc, row: nr, dc, dr, horizontal: isHorizontal });
        }
      }
    }

    return Array.from(candidates.values());
  }

  private computeNextWave(): WaveCell[] {
    return this.computeNextWaveFrom(this.filledCells);
  }

  /** Create a single prism at the given grid cell and add it to the prism list. */
  private createPrism(col: number, row: number): void {
    const cs = this.cellSize;
    const prism = new Wireframe(new BoxGeometry(cs, cs, PRISM_DEPTH), { color: this.color });
    const cx = col * cs;
    const cy = row * cs;
    prism.position.set(cx, cy, -PRISM_DEPTH / 2);
    this.add(prism);
    this.prisms.push({ wireframe: prism, col, row, cx, cy });
  }

  /** Position prisms based on cursor proximity. */
  private updatePrisms(): void {
    const ray = App.raycaster.ray;
    const intersect = new Vector3();
    const plane = new Plane(new Vector3(0, 0, 1), -PRISM_MAX_EXTENSION);
    const didIntersect = ray.intersectPlane(plane, intersect) !== null;

    // Convert intersection to grid-local XY
    const gridWorld = new Vector3();
    this.getWorldPosition(gridWorld);
    const localX = intersect.x - gridWorld.x;
    const localY = intersect.y - gridWorld.y;

    const halfCell = this.cellSize / 2;

    for (const { wireframe, cx, cy } of this.prisms) {
      const dx = localX - cx;
      const dy = localY - cy;
      const dist = didIntersect ? Math.sqrt(dx * dx + dy * dy) : Infinity;

      // Smooth falloff: full extension inside the cell, fading to zero over PRISM_EFFECT_RADIUS
      const t = 1 - Math.sin(Math.min(Math.PI / 2,
        (Math.PI * Math.max(0, dist - halfCell)) / (2 * PRISM_EFFECT_RADIUS)));
      const extension = t * t * t * PRISM_MAX_EXTENSION;

      const targetZ = -PRISM_DEPTH / 2 + extension;
      wireframe.position.z += (targetZ - wireframe.position.z) * (1 - Math.exp(-PRISM_LERP_SPEED * App.deltaTime));
    }
  }

  /** Instantiate pivots for a wave and start the animation. */
  private launchWave(cells: WaveCell[], duration: number): void {
    const cs = this.cellSize;

    for (const { col, row, dc, dr } of cells) {
      this.filledCells.add(`${col},${row}`);

      // Hinge sits on the shared edge between source and target cell centres
      const pivotX = (col - dc) * cs + dc * cs / 2;
      const pivotY = (row - dr) * cs + dr * cs / 2;

      const pivot = new Object3D();
      pivot.position.set(pivotX, pivotY, 0);

      // Face is offset from pivot toward the target cell centre
      const face = new Wireframe(new PlaneGeometry(cs, cs), { color: this.color });
      face.position.set(dc * cs / 2, dr * cs / 2, 0);
      pivot.add(face);

      // Initial rotation: folded 90° behind
      let startAngle: number;
      if (dc !== 0) {
        startAngle = dc * Math.PI / 2; // y-axis: +1 → +90°, -1 → -90°
        pivot.rotation.y = startAngle;
      } else {
        startAngle = -dr * Math.PI / 2; // x-axis: +1 → -90°, -1 → +90°
        pivot.rotation.x = startAngle;
      }

      this.add(pivot);
      this.allWavePivots.push(pivot);
      this.currentWavePivots.push(pivot);
      this.currentWaveConfigs.push({ axis: dc !== 0 ? 'y' : 'x', startAngle });
      this.currentWaveCells.push({ col, row });
    }

    this.waveElapsed = 0;
    this.waveDuration = duration;
    this.waveActive = true;
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
}
