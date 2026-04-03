import { MathUtils, Mesh, MeshBasicMaterial, Object3D, Plane, SRGBColorSpace, TextureLoader, Vector3 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { getCategoryData } from '@/data/loader';
import { ProjectArea, ProjectData } from '@/data/types';
import Text from '@/objects/text';
import Wireframe from '@/objects/wireframe';
import { fitText } from '@/utils/text-utils';
import { createHexFaceGeometry, createHexPrismGeometry, generateSymmetricLayout, hexDistance, hexToWorld } from '@/view/grid/hex-utils';

/** How far (hex ring distance) the grid extends from the center cell. */
const MAX_GRID_RADIUS = 8;

/** Duration of the initial hex face fade-in (planet inner edges dissolving). */
const HEX_FADE_IN_DURATION = 0.5;

/** Base flight duration per hex ring distance (seconds per ring). */
const HEX_FLIGHT_SPEED = 0.3;

/** Minimum flight duration for the closest ring. */
const HEX_FLIGHT_MIN = 0.15;

/** Slight tilt (radians) applied to each hex during flight to prevent overlap. */
const HEX_FLIGHT_TILT = MathUtils.degToRad(1);

/** Pause between the hex crossfade and the cell flight animation (both directions). */
const CROSSFADE_PAUSE = 0.5;

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

/** Clockwise hex ring traversal directions (starting from -q axis). */
const RING_DIRS: [number, number][] = [
  [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1],
];

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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

export default class CategoryGridView extends Object3D {
  area: ProjectArea;
  onProjectClicked: ((project: ProjectData, col: number, row: number) => void) | null = null;

  initialFace: Wireframe | null = null;

  readonly color: NeonColor;

  cellSize = 0;
  /** Hex circumradius (half of cellSize). */
  private get hexR(): number { return this.cellSize / 2; }

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
  private onAllFlightsComplete: (() => void) | null = null;

  // Forward pause between crossfade and hex flight
  private forwardPauseRemaining = 0;
  /** Suppress center cell thumbnail until other cells land. */
  private holdCenterThumbnail = false;

  // Prism grid state (active after unfold completes)
  prisms: PrismData[] = [];
  private prismsActive = false;
  private projectMap = new Map<string, ProjectData>();
  private hoveredPrism: PrismData | null = null;
  private textureLoader = new TextureLoader();

  // Reverse fold state
  private reversePhase: 'idle' | 'fading' | 'settling' | 'folding' | 'pausing' = 'idle';
  private reverseFadeElapsed = 0;
  private reverseSettleElapsed = 0;
  private reversePauseElapsed = 0;
  private prismStartZ: number[] = [];
  private onReverseFoldComplete: (() => void) | null = null;
  private squares = new Map<string, Wireframe>();

  constructor(area: ProjectArea, color: NeonColor) {
    super();
    this.area = area;
    this.color = color;

    const projects = getCategoryData(area).projects;
    const coords = generateSymmetricLayout(projects.length);
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
    const v = hexToWorld(col, row, this.hexR);
    return { x: v.x, y: v.y };
  }

  /** Create a flat hex face geometry at the current cellSize. */
  createFaceGeometry(): import('three').BufferGeometry {
    return createHexFaceGeometry(this.hexR);
  }

  /** Create the hex prism body geometry. */
  private createPrismGeometry(): import('three').BufferGeometry {
    return createHexPrismGeometry(this.hexR, PRISM_DEPTH);
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
   * The planet remains visible behind it so the inner edges appear to dissolve.
   * Calls onComplete when the fade finishes.
   */
  fadeInInitialFace(fadeOutTarget: Wireframe | null, onComplete: () => void): void {
    if (!this.initialFace) { onComplete(); return; }

    // Place the face in front of the planet (z=2) so depth ordering is correct
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
    this.createPrism(0, 0);
    for (let ring = 1; ring <= MAX_GRID_RADIUS; ring++) {
      let q = -ring;
      let r = 0;
      for (const [dq, dr] of RING_DIRS) {
        for (let step = 0; step < ring; step++) {
          this.createPrism(q, r);
          q += dq;
          r += dr;
        }
      }
    }
    this.prismsActive = true;
  }

  /**
   * Begin the hex flight unfold sequence.  The center cell (0,0) is already placed as
   * initialFace; this replaces it with a prism and launches all other cells flying
   * outward from the center.  Calls onComplete when all flights finish.
   */
  startCrossUnfold(cellSize: number, onComplete?: () => void): void {
    this.cellSize = cellSize;
    this.onAllFlightsComplete = onComplete ?? null;

    // Remove flight faces from a previous visit
    for (const b of this.hexFlightCells) this.remove(b.face);
    this.hexFlightCells = [];
    this.hexFlightDeferred = [];
    this.hexFlightActive = false;

    // Remove old prisms from a previous visit
    for (const { wireframe } of this.prisms) this.remove(wireframe);
    this.prisms = [];
    this.prismsActive = false;
    this.hoveredPrism = null;

    // Swap the initial face (0,0) to a prism immediately
    if (this.initialFace) {
      this.remove(this.initialFace);
      this.initialFace = null;
    }
    this.createPrism(0, 0);
    this.prismsActive = true;
    this.holdCenterThumbnail = true;

    // Pause before cells fly out
    this.forwardPauseRemaining = CROSSFADE_PAUSE;
  }

  /**
   * Begin the reverse fold sequence: settle prisms to base z, swap to flat faces,
   * fly faces back to center.  Calls onComplete when the center face is the only
   * cell remaining.
   */
  startReverseFold(cellSize: number, onComplete: () => void): void {
    this.cellSize = cellSize;
    this.onReverseFoldComplete = onComplete;

    // Stop cursor interaction
    this.prismsActive = false;
    this.clearHover();

    // Capture starting z for each prism (may differ due to cursor interaction)
    this.prismStartZ = this.prisms.map(p => p.wireframe.position.z);

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

    // Forward pause between crossfade and hex flight
    if (this.forwardPauseRemaining > 0) {
      this.forwardPauseRemaining -= App.deltaTime;
      if (this.forwardPauseRemaining <= 0) {
        this.startHexFlight();
      }
    }

    // Hex flight animation (all cells fly from center simultaneously)
    if (this.hexFlightActive) {
      this.updateHexFlight();
      if (!this.hexFlightActive) {
        this.onAllFlightsComplete?.();
        this.onAllFlightsComplete = null;
      }
    }

    // Drive thumbnail fade-in (runs even when input is disabled)
    for (const prismData of this.prisms) {
      if (this.holdCenterThumbnail && prismData.col === 0 && prismData.row === 0) continue;
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
        this.startReverseHexFlight();
      }
      return;
    }

    if (this.reversePhase === 'folding') {
      this.updateHexFlight();
      if (!this.hexFlightActive) {
        this.reversePhase = 'pausing';
        this.reversePauseElapsed = 0;
      }
    }

    if (this.reversePhase === 'pausing') {
      this.reversePauseElapsed += App.deltaTime;
      if (this.reversePauseElapsed >= CROSSFADE_PAUSE) {
        this.reversePhase = 'idle';
        this.onReverseFoldComplete?.();
        this.onReverseFoldComplete = null;
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

  /**
   * Remove faces that are entirely off-screen so they don't need to animate.
   * Keeps the center face (0,0) always.
   */
  private cullOffscreenFaces(): void {
    const cam = App.camera;
    const halfW = cam.right;
    const halfH = cam.top;
    const margin = this.cellSize;

    for (const [key, face] of this.squares) {
      if (key === '0,0') continue;
      const [col, row] = key.split(',').map(Number);
      const { x, y } = this.cellToWorld(col, row);
      if (Math.abs(x) >= halfW + margin || Math.abs(y) >= halfH + margin) {
        this.remove(face);
        this.squares.delete(key);
      }
    }
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
      const thumbnailGeo = createHexFaceGeometry(this.hexR);
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
      const dimGeo = createHexFaceGeometry(this.hexR);
      overlay.add(new Mesh(dimGeo, dimMat));

      const effectiveWidth = this.hexR * Math.sqrt(3);
      const maxWidth = effectiveWidth * 0.85;
      const { lines: titleLines, size: titleSize } = fitText(project.title, this.hexR * 0.18, maxWidth);
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

    // Inner radius for proximity falloff (apothem)
    const innerR = this.hexR * Math.sqrt(3) / 2;

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

      // Detect hover: cursor within this project cell's bounds (only if thumbnail visible)
      if (didIntersect && prismData.project && (prismData.thumbnailFadeIn ?? -1) >= 0) {
        if (this.isInsideHex(dx, dy)) {
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
      for (const [dq, dr] of RING_DIRS) {
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
      if (!this.hexFlightReverse) {
        this.holdCenterThumbnail = false;
      }
      this.hexFlightActive = false;
    }
  }
}
