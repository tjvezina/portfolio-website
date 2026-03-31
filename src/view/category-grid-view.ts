import { BoxGeometry, BufferGeometry, MathUtils, Mesh, MeshBasicMaterial, Object3D, Plane, PlaneGeometry, SRGBColorSpace, TextureLoader, Vector3 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { getCategoryData } from '@/data/loader';
import { ProjectArea, ProjectData } from '@/data/types';
import Text from '@/objects/text';
import Wireframe from '@/objects/wireframe';
import { fitText } from '@/utils/text-utils';
import { createHexFaceGeometry, createHexPrismGeometry, generateHexSpiralCoords, HEX_DIRECTIONS, hexDistance, hexToWorld } from '@/view/grid/hex-utils';

/** How far (Chebyshev / hex ring distance) the grid extends from the center cell. */
const MAX_GRID_RADIUS = 8;

/** Duration in seconds for each wave's fold animation (square grids). */
const WAVE_DURATION = 0.15;

/** Duration of the initial hex face fade-in (icosahedron inner edges dissolving). */
const HEX_FADE_IN_DURATION = 0.5;

/** Base flight duration per hex ring distance (seconds per ring). */
const HEX_FLIGHT_SPEED = 0.3;

/** Minimum flight duration for the closest ring. */
const HEX_FLIGHT_MIN = 0.15;

/** Slight tilt (radians) applied to each hex during flight to prevent overlap. */
const HEX_FLIGHT_TILT = MathUtils.degToRad(1);

/** Depth of each prism extending behind the grid plane. */
export const PRISM_DEPTH = 5;

/** Maximum distance a prism extends toward the camera (and the cursor-interaction plane z). */
const PRISM_MAX_EXTENSION = 1.0;

/** World-space radius of the cursor's area of influence on surrounding prisms. */
const PRISM_EFFECT_RADIUS = 4;

/** Speed factor for lerping prism z toward its target (units per second, exponential). */
const PRISM_LERP_SPEED = 10;

/** Duration for prisms to settle back to base z during reverse fold. */
const REVERSE_SETTLE_DURATION = 0.3;

/** Duration in seconds for thumbnail textures to fade in/out. */
const THUMBNAIL_FADE_DURATION = 0.2;

/** Duration in seconds for the hover overlay to fade in/out. */
const HOVER_FADE_DURATION = 0.15;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

interface FoldConfig {
  /** Rotation axis (unit vector in the XY plane, along the shared edge). */
  axis: Vector3;
  /** Start angle in radians (π/2 = folded behind grid plane). */
  startAngle: number;
}

interface WaveCell {
  col: number;
  row: number;
  /** Direction from source cell to this cell in grid coordinates. */
  dc: number;
  dr: number;
}

export interface PrismData {
  wireframe: Wireframe;
  originalWireframe?: Wireframe;
  col: number;
  row: number;
  cx: number;
  cy: number;
  project?: ProjectData;
  thumbnailMesh?: Mesh;
  thumbnailFadeIn?: number;
  overlay?: Object3D;
  hoverProgress?: number;
  overlayMaterials?: { material: MeshBasicMaterial, targetOpacity: number }[];
}

/** Generate (col, row) coordinates along a spiral from the center outward. */
function generateSpiralCoords(count: number): [number, number][] {
  const coords: [number, number][] = [[0, 0]];
  let x = 0;
  let y = 0;
  let dx = 1;
  let dy = 0;
  let steps = 1;
  let stepsTaken = 0;
  let turns = 0;
  while (coords.length < count) {
    x += dx;
    y += dy;
    coords.push([x, y]);
    stepsTaken++;
    if (stepsTaken >= steps) {
      stepsTaken = 0;
      turns++;
      [dx, dy] = [-dy, dx];
      if (turns % 2 === 0) steps++;
    }
  }
  return coords;
}

/** Fixed 3x3 grid layout for the 9 college projects. */
const COLLEGE_COORDS: [number, number][] = [
  [-1, 1], [0, 1], [1, 1],
  [-1, 0], [0, 0], [1, 0],
  [-1, -1], [0, -1], [1, -1],
];

/** Cardinal directions for square grid BFS. */
const SQUARE_DIRECTIONS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export default class CategoryGridView extends Object3D {
  area: ProjectArea;
  onProjectClicked: ((project: ProjectData, col: number, row: number) => void) | null = null;

  initialFace: Wireframe | null = null;

  readonly color: NeonColor;

  /** Whether this grid uses hexagonal cells. */
  private get isHex(): boolean { return this.area === ProjectArea.Career; }

  // BFS wave unfold state (square grids)
  private filledCells = new Set<string>();
  cellSize = 0;
  /** Hex circumradius (half of cellSize for hex grids, cellSize for square). */
  private get hexR(): number { return this.cellSize / 2; }
  private allWavePivots: Object3D[] = [];
  private currentWavePivots: Object3D[] = [];
  private currentWaveConfigs: FoldConfig[] = [];
  private currentWaveCells: { col: number, row: number }[] = [];
  private waveActive = false;
  private waveElapsed = 0;
  private waveDuration = 0;
  private onAllWavesComplete: (() => void) | null = null;

  // Hex crossfade state (planet ↔ hex face)
  private hexFadeInActive = false;
  private hexFadeInElapsed = 0;
  private hexFadeInCallback: (() => void) | null = null;
  private hexFadeOutTarget: Wireframe | null = null;
  private hexFadeOutActive = false;
  private hexFadeOutElapsed = 0;
  private hexFadeOutCallback: (() => void) | null = null;
  private hexFadeOutFace: Wireframe | null = null;
  private hexFadeInPlanet: Wireframe | null = null;
  private hexFadeInPlanetPos = new Vector3();
  private hexFadeInPlanetScale = 1;

  // Hex flight state (all cells fly from center simultaneously)
  private hexFlightActive = false;
  private hexFlightReverse = false;
  private hexFlightElapsed = 0;
  private hexFlightCells: {
    face: Wireframe,
    tgtX: number, tgtY: number,
    col: number, row: number,
    duration: number,
    delay: number,
    axis: Vector3,
  }[] = [];
  private hexFlightDeferred: { col: number, row: number }[] = [];

  // Prism grid state (active after unfold completes)
  prisms: PrismData[] = [];
  private prismsActive = false;
  private projectMap = new Map<string, ProjectData>();
  private hoveredPrism: PrismData | null = null;
  private textureLoader = new TextureLoader();

  // Reverse fold state
  private reversePhase: 'idle' | 'fading' | 'settling' | 'folding' = 'idle';
  private reverseFadeElapsed = 0;
  private reverseSettleElapsed = 0;
  private prismStartZ: number[] = [];
  private reverseWaves: WaveCell[][] = [];
  private reverseWaveIndex = 0;
  private onReverseFoldComplete: (() => void) | null = null;
  private squares = new Map<string, Wireframe>();

  constructor(area: ProjectArea, color: NeonColor) {
    super();
    this.area = area;
    this.color = color;

    const projects = getCategoryData(area).projects;
    const coords = area === ProjectArea.College
      ? COLLEGE_COORDS
      : area === ProjectArea.Career
        ? generateHexSpiralCoords(projects.length)
        : generateSpiralCoords(projects.length);
    for (let i = 0; i < projects.length; i++) {
      const [col, row] = coords[i];
      this.projectMap.set(`${col},${row}`, projects[i]);
    }
  }

  // ---------------------------------------------------------------------------
  // Grid-type helpers
  // ---------------------------------------------------------------------------

  /** Convert grid coordinates to world-space XY. */
  cellToWorld(col: number, row: number): { x: number, y: number } {
    if (this.isHex) {
      const v = hexToWorld(col, row, this.hexR);
      return { x: v.x, y: v.y };
    }
    return { x: col * this.cellSize, y: row * this.cellSize };
  }

  /** Neighbor directions appropriate for this grid type. */
  private get neighborDirections(): [number, number][] {
    return this.isHex ? HEX_DIRECTIONS : SQUARE_DIRECTIONS;
  }

  /** Check whether a cell coordinate falls within the maximum grid radius. */
  private inBounds(col: number, row: number): boolean {
    if (this.isHex) return hexDistance(col, row) <= MAX_GRID_RADIUS;
    return Math.abs(col) <= MAX_GRID_RADIUS && Math.abs(row) <= MAX_GRID_RADIUS;
  }

  /** Create a flat face geometry (hex or square) at the current cellSize. */
  createFaceGeometry(): BufferGeometry {
    if (this.isHex) return createHexFaceGeometry(this.hexR);
    return new PlaneGeometry(this.cellSize, this.cellSize);
  }

  /** Create the prism body geometry (hex column or box). */
  private createPrismGeometry(): BufferGeometry {
    if (this.isHex) return createHexPrismGeometry(this.hexR, PRISM_DEPTH);
    return new BoxGeometry(this.cellSize, this.cellSize, PRISM_DEPTH);
  }

  /** Build the first BFS wave: all direct neighbors of (0,0). */
  private makeInitialWave(): WaveCell[] {
    return this.neighborDirections.map(([dc, dr]) => ({
      col: dc, row: dr, dc, dr,
    }));
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  /**
   * Create and show the initial flat face — the first cell of the unfolding animation.
   * Call this once when the planet focus transition completes.
   */
  showInitialFace(cellSize: number): void {
    if (this.initialFace) return;
    this.cellSize = cellSize;
    this.initialFace = new Wireframe(this.createFaceGeometry(), { color: this.color });
    this.add(this.initialFace);
  }

  /**
   * Fade the initial hex face in from transparent over HEX_FADE_IN_DURATION seconds.
   * The planet remains visible behind it so the inner triangle edges appear to dissolve.
   * Calls onComplete when the fade finishes.
   */
  fadeInInitialFace(fadeOutTarget: Wireframe | null, onComplete: () => void): void {
    if (!this.initialFace) { onComplete(); return; }

    // Place the face in front of the planet (z=1) so depth ordering is correct
    this.initialFace.position.z = 2;

    // Set all hex materials to transparent at opacity 0.
    // Disable depthWrite so the invisible hex doesn't occlude the planet
    // in the depth buffer (especially the bloom-layer fill at z=2).
    this.initialFace.lineMaterial.transparent = true;
    this.initialFace.lineMaterial.opacity = 0;
    this.initialFace.lineMaterial.depthWrite = false;
    this.initialFace.traverse((child) => {
      if (child instanceof Mesh) {
        const mat = child.material as MeshBasicMaterial;
        mat.transparent = true;
        mat.opacity = 0;
        mat.depthWrite = false;
      }
    });

    // Prepare the planet wireframe for crossfade (opacity 1 → 0)
    this.hexFadeOutTarget = fadeOutTarget;
    if (fadeOutTarget) {
      fadeOutTarget.lineMaterial.transparent = true;
      fadeOutTarget.traverse((child) => {
        if (child instanceof Mesh) {
          (child.material as MeshBasicMaterial).transparent = true;
        }
      });
    }

    this.hexFadeInActive = true;
    this.hexFadeInElapsed = 0;
    this.hexFadeInCallback = onComplete;
  }

  /**
   * Fade the center hex face out over HEX_FADE_IN_DURATION seconds while
   * simultaneously fading the planet wireframe back in.  Reverse of fadeInInitialFace.
   * Calls onComplete when the crossfade finishes.
   */
  fadeOutCenterFace(fadeInTarget: Wireframe | null, onComplete: () => void): void {
    const face = this.squares.get('0,0');
    if (!face) { onComplete(); return; }

    // Position the face in front of the planet for correct layering
    face.position.z = 2;
    face.lineMaterial.depthWrite = false;
    face.traverse((child) => {
      if (child instanceof Mesh) {
        const mat = child.material as MeshBasicMaterial;
        mat.transparent = true;
        mat.depthWrite = false;
      }
    });

    // Prepare the planet wireframe for crossfade (opacity 0 → 1)
    // Capture its position/scale so we can hold it each frame (homeView.update overrides it)
    this.hexFadeInPlanet = fadeInTarget;
    if (fadeInTarget) {
      this.hexFadeInPlanetPos.copy(fadeInTarget.position);
      this.hexFadeInPlanetScale = fadeInTarget.scale.x;
      fadeInTarget.lineMaterial.transparent = true;
      fadeInTarget.lineMaterial.opacity = 0;
      fadeInTarget.traverse((child) => {
        if (child instanceof Mesh) {
          const mat = child.material as MeshBasicMaterial;
          mat.transparent = true;
          mat.opacity = 0;
        }
      });
    }

    this.hexFadeOutFace = face;
    this.hexFadeOutActive = true;
    this.hexFadeOutElapsed = 0;
    this.hexFadeOutCallback = onComplete;
  }

  /**
   * Build the entire grid instantly (no animation).  Used when navigating
   * directly to a category URL so the grid appears fully formed.
   */
  buildImmediate(cellSize: number): void {
    this.cellSize = cellSize;
    this.filledCells.clear();
    this.filledCells.add('0,0');
    this.createPrism(0, 0);
    this.prismsActive = true;

    this.fillRemainingCells(this.makeInitialWave());
  }

  /**
   * Begin the BFS unfold sequence.  The center cell (0,0) is already placed as
   * initialFace; this creates wave 1 and automatically launches each subsequent
   * wave until MAX_GRID_RADIUS is filled.  Calls onComplete when all waves finish.
   */
  startCrossUnfold(cellSize: number, onComplete?: () => void): void {
    this.cellSize = cellSize;
    this.onAllWavesComplete = onComplete ?? null;

    // Remove all pivots / bloom faces from a previous visit
    for (const pivot of this.allWavePivots) this.remove(pivot);
    this.allWavePivots = [];
    this.currentWavePivots = [];
    this.currentWaveConfigs = [];
    this.currentWaveCells = [];
    for (const b of this.hexFlightCells) this.remove(b.face);
    this.hexFlightCells = [];
    this.hexFlightDeferred = [];
    this.hexFlightActive = false;

    // Remove old prisms from a previous visit
    for (const { wireframe } of this.prisms) this.remove(wireframe);
    this.prisms = [];
    this.prismsActive = false;
    this.hoveredPrism = null;

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

    if (this.isHex) {
      this.startHexFlight();
    } else {
      this.launchWave(this.makeInitialWave(), WAVE_DURATION);
    }
  }

  /**
   * Begin the reverse fold sequence: settle prisms to base z, swap to flat faces,
   * fold faces back in reverse wave order.  Calls onComplete when the center
   * face is the only cell remaining.
   */
  startReverseFold(cellSize: number, onComplete: () => void): void {
    this.cellSize = cellSize;
    this.onReverseFoldComplete = onComplete;

    // Stop cursor interaction
    this.prismsActive = false;
    this.clearHover();

    // Capture starting z for each prism (may differ due to cursor interaction)
    this.prismStartZ = this.prisms.map(p => p.wireframe.position.z);

    // Pre-compute all waves for reverse processing
    this.reverseWaves = this.computeAllWaves();
    this.reverseWaveIndex = this.reverseWaves.length - 1;

    // Fade out thumbnails before settling/folding
    this.reversePhase = 'fading';
    this.reverseFadeElapsed = 0;
  }

  /** Remove the center face left after a completed reverse fold. */
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

    // Hex initial face fade-in (crossfade: hex in, planet out)
    if (this.hexFadeInActive && this.initialFace) {
      this.hexFadeInElapsed += App.deltaTime;
      const t = Math.min(1, this.hexFadeInElapsed / HEX_FADE_IN_DURATION);
      const eased = 1 - (1 - t) * (1 - t); // easeOutQuad

      // Fade hex in
      this.initialFace.lineMaterial.opacity = eased;
      this.initialFace.traverse((child) => {
        if (child instanceof Mesh) {
          (child.material as MeshBasicMaterial).opacity = eased;
        }
      });

      // Fade planet out
      if (this.hexFadeOutTarget) {
        this.hexFadeOutTarget.lineMaterial.opacity = 1 - eased;
        this.hexFadeOutTarget.traverse((child) => {
          if (child instanceof Mesh) {
            (child.material as MeshBasicMaterial).opacity = 1 - eased;
          }
        });
      }

      if (t >= 1) {
        this.hexFadeInActive = false;
        this.initialFace.position.z = 0;
        // Restore depthWrite on hex materials
        this.initialFace.lineMaterial.depthWrite = true;
        this.initialFace.traverse((child) => {
          if (child instanceof Mesh) {
            (child.material as MeshBasicMaterial).depthWrite = true;
          }
        });
        // Restore planet materials before hiding
        if (this.hexFadeOutTarget) {
          this.hexFadeOutTarget.lineMaterial.transparent = false;
          this.hexFadeOutTarget.lineMaterial.opacity = 1;
          this.hexFadeOutTarget.traverse((child) => {
            if (child instanceof Mesh) {
              const mat = child.material as MeshBasicMaterial;
              mat.transparent = false;
              mat.opacity = 1;
            }
          });
          this.hexFadeOutTarget = null;
        }
        this.hexFadeInCallback?.();
        this.hexFadeInCallback = null;
      }
    }

    // Hex center face fade-out (crossfade: hex out, planet in)
    if (this.hexFadeOutActive && this.hexFadeOutFace) {
      this.hexFadeOutElapsed += App.deltaTime;
      const t = Math.min(1, this.hexFadeOutElapsed / HEX_FADE_IN_DURATION);
      const eased = 1 - (1 - t) * (1 - t); // easeOutQuad

      // Fade hex out
      this.hexFadeOutFace.lineMaterial.opacity = 1 - eased;
      this.hexFadeOutFace.traverse((child) => {
        if (child instanceof Mesh) {
          (child.material as MeshBasicMaterial).opacity = 1 - eased;
        }
      });

      // Fade planet in (re-pin position each frame since homeView.update overrides it)
      if (this.hexFadeInPlanet) {
        this.hexFadeInPlanet.position.copy(this.hexFadeInPlanetPos);
        this.hexFadeInPlanet.scale.setScalar(this.hexFadeInPlanetScale);
        this.hexFadeInPlanet.lineMaterial.opacity = eased;
        this.hexFadeInPlanet.traverse((child) => {
          if (child instanceof Mesh) {
            (child.material as MeshBasicMaterial).opacity = eased;
          }
        });
      }

      if (t >= 1) {
        this.hexFadeOutActive = false;
        // Restore planet materials
        if (this.hexFadeInPlanet) {
          this.hexFadeInPlanet.lineMaterial.transparent = false;
          this.hexFadeInPlanet.lineMaterial.opacity = 1;
          this.hexFadeInPlanet.traverse((child) => {
            if (child instanceof Mesh) {
              const mat = child.material as MeshBasicMaterial;
              mat.transparent = false;
              mat.opacity = 1;
            }
          });
          this.hexFadeInPlanet = null;
        }
        this.hexFadeOutFace = null;
        this.hexFadeOutCallback?.();
        this.hexFadeOutCallback = null;
      }
    }

    // Hex flight animation (all cells fly from center simultaneously)
    if (this.hexFlightActive) {
      this.updateHexFlight();
      if (!this.hexFlightActive) {
        this.onAllWavesComplete?.();
        this.onAllWavesComplete = null;
      }
    }

    // Square fold wave animation
    if (this.waveActive) {
      this.waveElapsed += App.deltaTime;
      const t = Math.min(1, this.waveElapsed / this.waveDuration);
      const eased = easeOutCubic(t);

      for (let i = 0; i < this.currentWavePivots.length; i++) {
        const pivot = this.currentWavePivots[i];
        const cfg = this.currentWaveConfigs[i];
        const angle = cfg.startAngle * (1 - eased);
        pivot.quaternion.setFromAxisAngle(cfg.axis, angle);
      }

      if (t >= 1) {
        for (let i = 0; i < this.currentWavePivots.length; i++) {
          this.remove(this.currentWavePivots[i]);
          const cell = this.currentWaveCells[i];
          this.createPrism(cell.col, cell.row);
        }
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

    // Drive thumbnail fade-in (runs even when input is disabled)
    for (const prismData of this.prisms) {
      if (prismData.thumbnailFadeIn !== undefined && prismData.thumbnailFadeIn < 1) {
        prismData.thumbnailFadeIn = Math.min(1, prismData.thumbnailFadeIn + App.deltaTime / THUMBNAIL_FADE_DURATION);
        (prismData.thumbnailMesh!.material as MeshBasicMaterial).opacity = prismData.thumbnailFadeIn;
      }
    }

    // Drive prism cursor interaction
    if (this.prismsActive) {
      this.updatePrisms();
    }
  }

  enableInput(): void {
    this.prismsActive = true;
    window.addEventListener('click', this.clickHandler);
  }

  disableInput(): void {
    this.prismsActive = false;
    this.clearHover();
    window.removeEventListener('click', this.clickHandler);
  }

  /** Reset all prism wireframes to their base grid positions. */
  resetPrismPositions(): void {
    for (const prism of this.prisms) {
      // Restore original wireframe if it was swapped for a flat face during a transition
      if (prism.originalWireframe) {
        if (prism.wireframe.parent) prism.wireframe.parent.remove(prism.wireframe);
        this.add(prism.originalWireframe);
        if (prism.thumbnailMesh?.parent === prism.wireframe) {
          prism.wireframe.remove(prism.thumbnailMesh);
          prism.thumbnailMesh.position.z = PRISM_DEPTH / 2 + 0.01;
          prism.originalWireframe.add(prism.thumbnailMesh);
        }
        prism.wireframe = prism.originalWireframe;
        prism.originalWireframe = undefined;
      }
      prism.wireframe.position.set(prism.cx, prism.cy, -PRISM_DEPTH / 2);
    }
  }

  private clickHandler = (): void => {
    if (this.hoveredPrism?.project) {
      this.onProjectClicked?.(this.hoveredPrism.project, this.hoveredPrism.col, this.hoveredPrism.row);
    }
  };

  // ---------------------------------------------------------------------------
  // Reverse fold helpers
  // ---------------------------------------------------------------------------

  private updateReverse(): void {
    if (this.reversePhase === 'fading') {
      this.reverseFadeElapsed += App.deltaTime;
      const t = Math.min(1, this.reverseFadeElapsed / THUMBNAIL_FADE_DURATION);
      for (const prismData of this.prisms) {
        if (prismData.thumbnailMesh) {
          (prismData.thumbnailMesh.material as MeshBasicMaterial).opacity = 1 - t;
        }
      }
      if (t >= 1) {
        this.reversePhase = 'settling';
        this.reverseSettleElapsed = 0;
      }
      return;
    }

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
        this.swapPrismsToFaces();
        this.cullOffscreenFaces();
        this.reversePhase = 'folding';
        if (this.isHex) {
          this.startReverseHexFlight();
        } else {
          this.launchReverseWave();
        }
      }
      return;
    }

    if (this.reversePhase === 'folding') {
      if (this.hexFlightActive) {
        // Hex reverse flight (all cells fly back to center)
        this.updateHexFlight();
        if (!this.hexFlightActive) {
          this.reversePhase = 'idle';
          this.onReverseFoldComplete?.();
          this.onReverseFoldComplete = null;
        }
      } else if (this.waveActive) {
        // Square reverse fold
        this.waveElapsed += App.deltaTime;
        const t = Math.min(1, this.waveElapsed / this.waveDuration);
        const eased = easeOutCubic(t);

        for (let i = 0; i < this.currentWavePivots.length; i++) {
          const pivot = this.currentWavePivots[i];
          const cfg = this.currentWaveConfigs[i];
          const angle = cfg.startAngle * eased;
          pivot.quaternion.setFromAxisAngle(cfg.axis, angle);
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
            this.reversePhase = 'idle';
            this.onReverseFoldComplete?.();
            this.onReverseFoldComplete = null;
          }
        }
      }
    }
  }

  /** Replace all prisms with flat faces at the same grid positions. */
  private swapPrismsToFaces(): void {
    this.squares.clear();
    for (const { wireframe, col, row, cx, cy } of this.prisms) {
      this.remove(wireframe);
      const face = new Wireframe(this.createFaceGeometry(), { color: this.color });
      face.position.set(cx, cy, 0);
      this.add(face);
      this.squares.set(`${col},${row}`, face);
    }
    this.prisms = [];
  }

  /** Check whether any cell in a wave falls within the visible screen area. */
  private isWaveVisible(wave: WaveCell[]): boolean {
    const cam = App.camera;
    const halfW = cam.right;
    const halfH = cam.top;
    const margin = this.cellSize;
    return wave.some(({ col, row }) => {
      const { x: cx, y: cy } = this.cellToWorld(col, row);
      return Math.abs(cx) < halfW + margin && Math.abs(cy) < halfH + margin;
    });
  }

  /**
   * Remove all faces from waves that are entirely off-screen and adjust
   * reverseWaveIndex so the fold animation starts from the first visible wave.
   */
  private cullOffscreenFaces(): void {
    // Walk inward from the outermost wave to find the first with a visible cell
    let firstVisible = 0;
    for (let i = this.reverseWaves.length - 1; i >= 0; i--) {
      if (this.isWaveVisible(this.reverseWaves[i])) {
        firstVisible = i;
        break;
      }
    }

    // Instantly remove faces for all waves beyond the first visible one
    for (let i = this.reverseWaves.length - 1; i > firstVisible; i--) {
      for (const { col, row } of this.reverseWaves[i]) {
        const key = `${col},${row}`;
        const face = this.squares.get(key);
        if (face) {
          this.remove(face);
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

  /** Launch the next reverse wave (outermost → innermost, square grids only). */
  private launchReverseWave(): void {
    const wave = this.reverseWaves[this.reverseWaveIndex];

    for (const { col, row, dc, dr } of wave) {
      const key = `${col},${row}`;
      const face = this.squares.get(key);
      if (face) {
        this.remove(face);
        this.squares.delete(key);
      }

      const { pivotX, pivotY, faceOffsetX, faceOffsetY, foldAxis } =
        this.computeFoldPivot(col, row, dc, dr);

      const pivot = new Object3D();
      pivot.position.set(pivotX, pivotY, 0);

      const faceGeo = new Wireframe(this.createFaceGeometry(), { color: this.color });
      faceGeo.position.set(faceOffsetX, faceOffsetY, 0);
      pivot.add(faceGeo);

      this.add(pivot);
      this.currentWavePivots.push(pivot);
      this.currentWaveConfigs.push({ axis: foldAxis, startAngle: Math.PI / 2 });
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
   * Compute the pivot position, face offset, and fold axis for a cell being
   * unfolded from its source cell.
   */
  private computeFoldPivot(col: number, row: number, dc: number, dr: number): {
    pivotX: number,
    pivotY: number,
    faceOffsetX: number,
    faceOffsetY: number,
    foldAxis: Vector3,
  } {
    const sourceWorld = this.cellToWorld(col - dc, row - dr);
    const targetWorld = this.cellToWorld(col, row);
    const pivotX = (sourceWorld.x + targetWorld.x) / 2;
    const pivotY = (sourceWorld.y + targetWorld.y) / 2;
    const faceOffsetX = (targetWorld.x - sourceWorld.x) / 2;
    const faceOffsetY = (targetWorld.y - sourceWorld.y) / 2;
    // Fold axis: perpendicular to direction in XY plane, oriented so +π/2 folds behind
    const foldAxis = new Vector3(-faceOffsetY * 2, faceOffsetX * 2, 0).normalize();
    return { pivotX, pivotY, faceOffsetX, faceOffsetY, foldAxis };
  }

  /**
   * Compute all BFS waves from center outward, without modifying instance state.
   * Used by the reverse fold to process waves in reverse order.
   */
  private computeAllWaves(): WaveCell[][] {
    const waves: WaveCell[][] = [];
    const filled = new Set<string>();
    filled.add('0,0');

    const wave1 = this.makeInitialWave();
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
    const dirs = this.neighborDirections;
    const candidates = new Map<string, WaveCell & { horizontal?: boolean }>();

    for (const key of filled) {
      const comma = key.indexOf(',');
      const col = parseInt(key.slice(0, comma), 10);
      const row = parseInt(key.slice(comma + 1), 10);

      for (const [dc, dr] of dirs) {
        const nc = col + dc;
        const nr = row + dr;

        if (!this.inBounds(nc, nr)) continue;

        const nk = `${nc},${nr}`;
        if (filled.has(nk)) continue;

        if (!this.isHex) {
          // Square grid: prefer horizontal fold sources for visual consistency
          const isHorizontal = dc !== 0;
          if (!candidates.has(nk)) {
            candidates.set(nk, { col: nc, row: nr, dc, dr, horizontal: isHorizontal });
          } else if (!candidates.get(nk)!.horizontal && isHorizontal) {
            candidates.set(nk, { col: nc, row: nr, dc, dr, horizontal: isHorizontal });
          }
        } else {
          // Hex grid: first source found wins
          if (!candidates.has(nk)) {
            candidates.set(nk, { col: nc, row: nr, dc, dr });
          }
        }
      }
    }

    return Array.from(candidates.values());
  }

  private computeNextWave(): WaveCell[] {
    return this.computeNextWaveFrom(this.filledCells);
  }

  private clearHover(): void {
    for (const prismData of this.prisms) {
      if (prismData.hoverProgress !== undefined && prismData.hoverProgress > 0) {
        prismData.hoverProgress = 0;
        for (const { material } of prismData.overlayMaterials!) {
          material.opacity = 0;
        }
        prismData.overlay!.visible = false;
      }
    }
    this.hoveredPrism = null;
  }

  /** Create a single prism at the given grid cell and add it to the prism list. */
  private createPrism(col: number, row: number): void {
    const cs = this.cellSize;
    const prism = new Wireframe(this.createPrismGeometry(), { color: this.color });
    const { x: cx, y: cy } = this.cellToWorld(col, row);
    prism.position.set(cx, cy, -PRISM_DEPTH / 2);
    this.add(prism);

    const key = `${col},${row}`;
    const project = this.projectMap.get(key);
    const prismData: PrismData = { wireframe: prism, col, row, cx, cy, project };

    if (project) {
      // Thumbnail texture on front face (starts invisible, fades in when loaded)
      const thumbnailSrc = project.thumbnail ?? '/assets/default-thumbnail.png';
      const thumbnailGeo = this.isHex
        ? createHexFaceGeometry(this.hexR)
        : new PlaneGeometry(cs, cs);
      const thumbnailMat = new MeshBasicMaterial({ transparent: true, opacity: 0 });
      const thumbnailMesh = new Mesh(thumbnailGeo, thumbnailMat);
      thumbnailMesh.position.z = PRISM_DEPTH / 2 + 0.01;
      prism.add(thumbnailMesh);
      prismData.thumbnailMesh = thumbnailMesh;

      this.textureLoader.load(thumbnailSrc, (texture) => {
        texture.colorSpace = SRGBColorSpace;
        thumbnailMat.map = texture;
        thumbnailMat.needsUpdate = true;
        // Only start the fade if it hasn't been bypassed (e.g. by showProjectImmediate)
        if (prismData.thumbnailFadeIn === undefined) {
          prismData.thumbnailFadeIn = 0;
        }
      });

      // Hover overlay: dim layer + word-wrapped title
      const overlay = new Object3D();
      overlay.position.z = PRISM_DEPTH / 2 + 0.02;
      overlay.visible = false;

      const dimMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
      const dimGeo = this.isHex ? createHexFaceGeometry(this.hexR) : new PlaneGeometry(cs, cs);
      overlay.add(new Mesh(dimGeo, dimMat));

      // Use the inner width (apothem for hex, half-edge for square) for text sizing
      const hexOrSquare = this.isHex ? this.hexR : cs;
      const effectiveWidth = this.isHex ? hexOrSquare * Math.sqrt(3) : cs;
      const maxWidth = effectiveWidth * 0.85;
      const { lines: titleLines, size: titleSize } = fitText(project.title, hexOrSquare * 0.09, maxWidth);
      const lineHeight = titleSize * 1.4;
      const titleBlockHeight = lineHeight * titleLines.length;
      const topY = titleBlockHeight / 2;

      for (let i = 0; i < titleLines.length; i++) {
        const lineText = new Text(titleLines[i], App.synthaFont, {
          color: this.color,
          size: titleSize,
        });
        lineText.position.y = topY - lineHeight / 2 - i * lineHeight;
        lineText.position.z = 0.01;
        overlay.add(lineText);
      }

      // Collect all materials in the overlay for fade animation
      const overlayMaterials: PrismData['overlayMaterials'] = [
        { material: dimMat, targetOpacity: 0.6 },
      ];
      overlay.traverse((child) => {
        if (child instanceof Mesh && child.material instanceof MeshBasicMaterial && child.material !== dimMat) {
          child.material.transparent = true;
          child.material.opacity = 0;
          overlayMaterials.push({ material: child.material, targetOpacity: 1.0 });
        }
      });

      prism.add(overlay);
      prismData.overlay = overlay;
      prismData.hoverProgress = 0;
      prismData.overlayMaterials = overlayMaterials;
    }

    this.prisms.push(prismData);
  }

  /** Position prisms based on cursor proximity and manage project hover state. */
  private updatePrisms(): void {
    const ray = App.raycaster.ray;
    const intersect = new Vector3();
    const plane = new Plane(new Vector3(0, 0, 1), -PRISM_MAX_EXTENSION);
    const didIntersect = App.pointerActive && ray.intersectPlane(plane, intersect) !== null;

    // Convert intersection to grid-local XY
    const gridWorld = new Vector3();
    this.getWorldPosition(gridWorld);
    const localX = intersect.x - gridWorld.x;
    const localY = intersect.y - gridWorld.y;

    // Inner radius for proximity falloff (apothem for hex, half-edge for square)
    const innerR = this.isHex ? this.hexR * Math.sqrt(3) / 2 : this.cellSize / 2;

    let newHovered: PrismData | null = null;

    for (const prismData of this.prisms) {
      const { wireframe, cx, cy } = prismData;
      const dx = localX - cx;
      const dy = localY - cy;
      const dist = didIntersect ? Math.sqrt(dx * dx + dy * dy) : Infinity;

      // Smooth falloff: full extension inside the cell, fading to zero over PRISM_EFFECT_RADIUS
      const t = 1 - Math.sin(Math.min(Math.PI / 2,
        (Math.PI * Math.max(0, dist - innerR)) / (2 * PRISM_EFFECT_RADIUS)));
      const extension = t * t * t * PRISM_MAX_EXTENSION;

      const targetZ = -PRISM_DEPTH / 2 + extension;
      wireframe.position.z += (targetZ - wireframe.position.z) * (1 - Math.exp(-PRISM_LERP_SPEED * App.deltaTime));

      // Detect hover: cursor within this project cell's bounds
      if (didIntersect && prismData.project) {
        const inside = this.isHex
          ? this.isInsideHex(dx, dy)
          : Math.abs(dx) <= this.cellSize / 2 && Math.abs(dy) <= this.cellSize / 2;
        if (inside) {
          newHovered = prismData;
        }
      }
    }

    // Drive hover overlay fade animations
    this.hoveredPrism = newHovered;
    for (const prismData of this.prisms) {
      if (prismData.hoverProgress === undefined) continue;
      const target = prismData === newHovered ? 1 : 0;
      if (prismData.hoverProgress === target) continue;
      const step = App.deltaTime / HOVER_FADE_DURATION;
      prismData.hoverProgress = target > prismData.hoverProgress
        ? Math.min(target, prismData.hoverProgress + step)
        : Math.max(target, prismData.hoverProgress - step);
      for (const { material, targetOpacity } of prismData.overlayMaterials!) {
        material.opacity = targetOpacity * prismData.hoverProgress;
      }
      prismData.overlay!.visible = prismData.hoverProgress > 0;
    }
  }

  /** Point-in-hexagon test for a pointy-top regular hex with circumradius hexR. */
  private isInsideHex(dx: number, dy: number): boolean {
    const R = this.hexR;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    return ax <= R * Math.sqrt(3) / 2 && ay <= R - ax / Math.sqrt(3);
  }

  /** Instantiate pivots for a wave and start the fold animation (square grids only). */
  private launchWave(cells: WaveCell[], duration: number): void {
    for (const { col, row, dc, dr } of cells) {
      this.filledCells.add(`${col},${row}`);

      const { pivotX, pivotY, faceOffsetX, faceOffsetY, foldAxis } =
        this.computeFoldPivot(col, row, dc, dr);

      const pivot = new Object3D();
      pivot.position.set(pivotX, pivotY, 0);

      const face = new Wireframe(this.createFaceGeometry(), { color: this.color });
      face.position.set(faceOffsetX, faceOffsetY, 0);
      pivot.add(face);

      const startAngle = Math.PI / 2;
      pivot.quaternion.setFromAxisAngle(foldAxis, startAngle);

      this.add(pivot);
      this.allWavePivots.push(pivot);
      this.currentWavePivots.push(pivot);
      this.currentWaveConfigs.push({ axis: foldAxis, startAngle });
      this.currentWaveCells.push({ col, row });
    }

    this.waveElapsed = 0;
    this.waveDuration = duration;
    this.waveActive = true;
  }

  // ---------------------------------------------------------------------------
  // Hex flight (all cells fly from/to center simultaneously)
  // ---------------------------------------------------------------------------

  /** Start the forward hex flight: all cells begin behind center and fly out. */
  private startHexFlight(): void {
    this.hexFlightCells = [];
    this.hexFlightActive = true;
    this.hexFlightReverse = false;
    this.hexFlightElapsed = 0;

    const cam = App.camera;
    const margin = this.cellSize;

    for (let ring = 1; ring <= MAX_GRID_RADIUS; ring++) {
      let q = -ring;
      let r = 0;
      const clockwiseDirs: [number, number][] = [
        [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1],
      ];
      for (const [dq, dr] of clockwiseDirs) {
        for (let step = 0; step < ring; step++) {
          const tgt = this.cellToWorld(q, r);
          const offScreen = Math.abs(tgt.x) >= cam.right + margin
            || Math.abs(tgt.y) >= cam.top + margin;
          if (offScreen) {
            this.hexFlightDeferred.push({ col: q, row: r });
          } else {
            const face = new Wireframe(this.createFaceGeometry(), { color: this.color });
            face.position.set(0, 0, -0.1);
            const axis = new Vector3(tgt.x, tgt.y, 0).normalize();
            face.setRotationFromAxisAngle(axis, HEX_FLIGHT_TILT);
            this.add(face);
            const dist = hexDistance(q, r);
            this.hexFlightCells.push({
              face, tgtX: tgt.x, tgtY: tgt.y, col: q, row: r,
              duration: Math.max(HEX_FLIGHT_MIN, dist * HEX_FLIGHT_SPEED),
              delay: 0,
              axis,
            });
          }
          q += dq;
          r += dr;
        }
      }
    }
  }

  /** Start the reverse hex flight: all faces fly back to center. */
  private startReverseHexFlight(): void {
    this.hexFlightCells = [];
    this.hexFlightActive = true;
    this.hexFlightReverse = true;
    this.hexFlightElapsed = 0;

    // Build cells with durations first
    let maxDuration = 0;
    for (const [key, face] of this.squares) {
      if (key === '0,0') continue;
      const [col, row] = key.split(',').map(Number);
      const tgt = this.cellToWorld(col, row);
      this.squares.delete(key);
      const dist = hexDistance(col, row);
      const duration = Math.max(HEX_FLIGHT_MIN, dist * HEX_FLIGHT_SPEED);
      maxDuration = Math.max(maxDuration, duration);
      const axis = new Vector3(tgt.x, tgt.y, 0).normalize();
      this.hexFlightCells.push({
        face, tgtX: tgt.x, tgtY: tgt.y, col, row,
        duration, delay: 0, axis,
      });
    }

    // Stagger starts so all cells arrive at center at the same time
    for (const c of this.hexFlightCells) {
      c.delay = maxDuration - c.duration;
    }
  }

  /** Drive all hex flight cells each frame. */
  private updateHexFlight(): void {
    this.hexFlightElapsed += App.deltaTime;

    let allDone = true;
    for (const c of this.hexFlightCells) {
      const localElapsed = this.hexFlightElapsed - c.delay;
      const t = Math.min(1, Math.max(0, localElapsed) / c.duration);
      const eased = easeInOutQuad(t);

      if (this.hexFlightReverse) {
        // Fly from grid position back to center
        c.face.position.x = c.tgtX + (0 - c.tgtX) * eased;
        c.face.position.y = c.tgtY + (0 - c.tgtY) * eased;
        c.face.position.z = -0.1 * eased;
        c.face.setRotationFromAxisAngle(c.axis, HEX_FLIGHT_TILT * eased);
      } else {
        // Fly from center to grid position
        c.face.position.x = c.tgtX * eased;
        c.face.position.y = c.tgtY * eased;
        c.face.position.z = -0.1 + 0.1 * eased;
        c.face.setRotationFromAxisAngle(c.axis, HEX_FLIGHT_TILT * (1 - eased));
      }

      if (t < 1) allDone = false;
    }

    if (allDone) {
      // Clean up all flight faces and create prisms
      for (const c of this.hexFlightCells) {
        this.remove(c.face);
        if (!this.hexFlightReverse) {
          this.createPrism(c.col, c.row);
        }
      }
      this.hexFlightCells = [];
      // Create deferred off-screen prisms now that animation is done
      for (const { col, row } of this.hexFlightDeferred) {
        this.createPrism(col, row);
      }
      this.hexFlightDeferred = [];
      this.hexFlightActive = false;
    }
  }
}
