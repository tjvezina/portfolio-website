import { BufferGeometry, Mesh, Object3D, Quaternion, Vector3 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { NavigationDirection, Route } from '@/core/router';
import { getProjectData } from '@/data/loader';
import { ProjectArea } from '@/data/types';
import Wireframe from '@/objects/wireframe';
import BackButton from '@/view/back-button';
import CategoryGridView from '@/view/category-grid-view';
import GridCell from '@/view/grid/grid-cell';
import { HomeView, Planet, setInputEnabled } from '@/view/home-view';
import ProjectPageView from '@/view/project-page-view';
import CameraTransition from '@/view/transition/camera-transition';
import PrismPushTransition from '@/view/transition/prism-push-transition';
import UnfoldTransition from '@/view/transition/unfold-transition';

export { setInputEnabled };

const CAMERA_FORWARD = new Vector3(0, 0, 1);

/**
 * Extract unique face normals from a BufferGeometry.
 */
function getFaceNormals(geometry: BufferGeometry): Vector3[] {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const normals: Vector3[] = [];
  const seen = new Set<string>();

  const v0 = new Vector3();
  const v1 = new Vector3();
  const v2 = new Vector3();
  const edge1 = new Vector3();
  const edge2 = new Vector3();
  const normal = new Vector3();

  const faceCount = index ? index.count / 3 : positions.count / 3;

  for (let i = 0; i < faceCount; i++) {
    const i0 = index ? index.getX(i * 3) : i * 3;
    const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2;

    v0.fromBufferAttribute(positions, i0);
    v1.fromBufferAttribute(positions, i1);
    v2.fromBufferAttribute(positions, i2);

    edge1.subVectors(v1, v0);
    edge2.subVectors(v2, v0);
    normal.crossVectors(edge1, edge2).normalize();

    const key = `${normal.x.toFixed(3)},${normal.y.toFixed(3)},${normal.z.toFixed(3)}`;
    if (!seen.has(key)) {
      seen.add(key);
      normals.push(normal.clone());
    }
  }

  return normals;
}

/**
 * Compute a target quaternion that aligns the nearest face toward a direction.
 */
function computeFaceAlignTarget(
  currentQuat: Quaternion,
  faceNormals: Vector3[],
  targetDir: Vector3,
): Quaternion {
  let bestNormal = faceNormals[0];
  let bestDot = -Infinity;

  for (const fn of faceNormals) {
    const worldNormal = fn.clone().applyQuaternion(currentQuat);
    const dot = worldNormal.dot(targetDir);
    if (dot > bestDot) {
      bestDot = dot;
      bestNormal = fn;
    }
  }

  const currentDir = bestNormal.clone().applyQuaternion(currentQuat);
  const correction = new Quaternion().setFromUnitVectors(currentDir, targetDir);
  return correction.multiply(currentQuat.clone());
}

/**
 * Get the source BufferGeometry from a Wireframe's fill mesh child.
 */
function getSourceGeometry(wireframe: Wireframe): BufferGeometry | null {
  for (const child of wireframe.children) {
    if (child instanceof Mesh) {
      return child.geometry as BufferGeometry;
    }
  }
  return null;
}

const CATEGORY_COLORS: Record<ProjectArea, NeonColor> = {
  [ProjectArea.College]: NeonColor.Orange,
  [ProjectArea.Personal]: NeonColor.Green,
  [ProjectArea.Career]: NeonColor.Cyan,
};

export default class ViewManager extends Object3D {
  homeView: HomeView;
  categoryViews: Map<ProjectArea, CategoryGridView> = new Map();
  activeTransition: CameraTransition | null = null;
  activeUnfold: UnfoldTransition | null = null;
  activeCategory: ProjectArea | null = null;

  /** When navigating home, we run unfold-reverse first, then camera. */
  private pendingHomeTransition = false;

  /** Project page state */
  private activeProjectView: ProjectPageView | null = null;
  private activePrismPush: PrismPushTransition | null = null;
  private activeProjectCell: GridCell | null = null;
  private pendingProjectBack = false;

  /** In-scene back navigation button */
  private backButton: BackButton;

  constructor() {
    super();

    this.homeView = new HomeView();
    this.homeView.init();
    this.add(this.homeView);

    this.homeView.onPlanetClicked = (area: ProjectArea): void => {
      App.router.navigate({ type: 'category', area });
    };

    this.backButton = new BackButton();
    this.backButton.position.z = 5;
    this.backButton.updatePosition();
    this.backButton.onClick = (): void => {
      window.history.back();
    };
    App.camera.add(this.backButton);
  }

  onRouteChanged(route: Route, direction: NavigationDirection): void {
    if (route.type === 'category') {
      if (direction === 'back' && this.activeProjectView) {
        this.hideProject();
      } else {
        this.showCategory(route.area);
      }
    } else if (route.type === 'home') {
      this.showHome();
    } else if (route.type === 'project') {
      this.showProject(route.area, route.slug);
    }
  }

  showCategory(area: ProjectArea): void {
    const color = CATEGORY_COLORS[area];
    let grid = this.categoryViews.get(area);
    if (!grid) {
      grid = new CategoryGridView(area, color);
      this.wireGridCallbacks(grid, area);
      this.categoryViews.set(area, grid);
      this.add(grid);
    }

    // Stop all orbital motion so the camera target is stable
    this.homeView.stopOrbiting();

    // Get planet world position for camera target
    const planet = this.homeView.planetList.find(p => p.area === area);
    if (planet) {
      const planetPos = new Vector3();
      planet.wireframe.getWorldPosition(planetPos);

      // Position grid at planet location
      grid.position.set(planetPos.x, planetPos.y, 0);
      grid.saveOriginalPosition();

      // Camera target: planet x,y but keep current z
      const cameraTarget = new Vector3(planetPos.x, planetPos.y, App.camera.position.z);
      this.activeTransition = new CameraTransition(cameraTarget, 1.2);

      // Decelerate tumble and align a face toward the camera
      this.startTumbleDecel(planet);
    }

    // Grid starts hidden; unfold will reveal it after camera transition completes
    grid.visible = false;

    setInputEnabled(false);
    this.activeCategory = area;
    this.backButton.enable();
  }

  showHome(): void {
    this.backButton.disable();
    if (this.activeCategory) {
      const grid = this.categoryViews.get(this.activeCategory);
      if (grid) {
        grid.disableInput();
        grid.resetPan();
        // Start reverse unfold; camera transition starts after it completes
        this.activeUnfold = new UnfoldTransition(grid, this.activeCategory, true, 0.8);
        this.pendingHomeTransition = true;
      }

      // Resume tumble on the planet that was stopped
      const planet = this.homeView.planetList.find(p => p.area === this.activeCategory);
      if (planet) {
        planet.tumble.resume();
      }
    }

    // Resume orbital motion
    this.homeView.resumeOrbiting();

    setInputEnabled(false);
  }

  private startTumbleDecel(planet: Planet): void {
    const geometry = getSourceGeometry(planet.wireframe);
    if (!geometry) return;

    const faceNormals = getFaceNormals(geometry);
    const alignTarget = computeFaceAlignTarget(
      planet.wireframe.quaternion,
      faceNormals,
      CAMERA_FORWARD,
    );

    // Decelerate over 0.8s, then align to face over 0.4s
    planet.tumble.decelerateAndAlign(0.8, alignTarget, 0.4);
  }

  private wireGridCallbacks(grid: CategoryGridView, area: ProjectArea): void {
    grid.onProjectClicked = (project): void => {
      // Find the clicked cell to pass to the transition
      const cell = grid.cells.find(c => c.project === project);
      if (cell) {
        this.activeProjectCell = cell;
      }
      App.router.navigate({ type: 'project', area, slug: project.slug });
    };
  }

  private showProject(area: ProjectArea, slug: string): void {
    const project = getProjectData(area, slug);
    if (!project) return;

    const color = CATEGORY_COLORS[area];

    // Disable grid input during transition
    const grid = this.categoryViews.get(area);
    grid?.disableInput();

    // Create project page behind the grid
    const projectView = new ProjectPageView(project, color);
    if (grid) {
      projectView.position.set(grid.position.x, grid.position.y, -5);
    }
    this.add(projectView);
    this.activeProjectView = projectView;

    // Start prism push transition if we have a clicked cell
    if (this.activeProjectCell) {
      this.activePrismPush = new PrismPushTransition(this.activeProjectCell, false);
    }

    // Move camera forward through the grid
    const cameraTarget = new Vector3(
      App.camera.position.x,
      App.camera.position.y,
      App.camera.position.z - 5,
    );
    this.activeTransition = new CameraTransition(cameraTarget, 1.0);
  }

  private hideProject(): void {
    // Disable back button during transition to prevent double-navigation
    this.backButton.disable();

    // Start reverse prism push
    if (this.activeProjectCell) {
      this.activePrismPush = new PrismPushTransition(this.activeProjectCell, true);
    }

    // Move camera back to grid plane
    const cameraTarget = new Vector3(
      App.camera.position.x,
      App.camera.position.y,
      App.camera.position.z + 5,
    );
    this.activeTransition = new CameraTransition(cameraTarget, 1.0);
    this.pendingProjectBack = true;
  }

  initializeAtRoute(route: Route): void {
    switch (route.type) {
      case 'home':
        // Default — intro animation plays as usual
        break;
      case 'category': {
        this.showCategoryImmediate(route.area);
        break;
      }
      case 'project': {
        this.showCategoryImmediate(route.area);
        this.showProjectImmediate(route.area, route.slug);
        break;
      }
    }
  }

  private showCategoryImmediate(area: ProjectArea): void {
    const color = CATEGORY_COLORS[area];
    // Create and cache grid view
    if (!this.categoryViews.has(area)) {
      const gridView = new CategoryGridView(area, color);
      this.wireGridCallbacks(gridView, area);
      this.categoryViews.set(area, gridView);
      this.add(gridView);
    }
    const gridView = this.categoryViews.get(area)!;

    // Get planet world position
    const planet = this.homeView.planetList.find((p) => p.area === area)!;
    const targetPos = new Vector3();
    planet.wireframe.getWorldPosition(targetPos);

    // Position grid at planet location, make visible
    gridView.position.set(targetPos.x, targetPos.y, 0);
    gridView.saveOriginalPosition();
    gridView.visible = true;
    gridView.enableInput();

    // Position camera directly at grid (no animation)
    App.camera.position.x = targetPos.x;
    App.camera.position.y = targetPos.y;

    setInputEnabled(false);
    this.activeCategory = area;
    this.backButton.enable();
  }

  private showProjectImmediate(area: ProjectArea, slug: string): void {
    const projectData = getProjectData(area, slug);
    if (!projectData) return;

    const color = CATEGORY_COLORS[area];
    const projectView = new ProjectPageView(projectData, color);

    // Position behind the grid
    const gridView = this.categoryViews.get(area);
    if (gridView) {
      projectView.position.set(gridView.position.x, gridView.position.y, -5);
      gridView.disableInput();
    }

    projectView.visible = true;
    this.add(projectView);
    this.activeProjectView = projectView;

    // Move camera to project page position (no animation)
    App.camera.position.z = App.camera.position.z - 5;
  }

  onWindowResized(): void {
    this.backButton.updatePosition();
  }

  private startHomeCamera(): void {
    const cameraTarget = new Vector3(0, 0, App.camera.position.z);
    this.activeTransition = new CameraTransition(cameraTarget, 1.2);
    this.pendingHomeTransition = false;
    this.activeCategory = null;
  }

  update(): void {
    // Update prism push independently of other transitions
    if (this.activePrismPush) {
      this.activePrismPush.update();
      if (this.activePrismPush.isComplete) {
        this.activePrismPush = null;
      }
    }

    // Sequence: camera transition first, then unfold (for forward navigation)
    // For back navigation: unfold reverse first, then camera
    if (this.activeUnfold) {
      this.activeUnfold.update();
      if (this.activeUnfold.isComplete) {
        this.activeUnfold = null;
        if (this.pendingHomeTransition) {
          this.startHomeCamera();
        } else if (this.activeCategory) {
          // Forward unfold complete — enable grid input
          const grid = this.categoryViews.get(this.activeCategory);
          grid?.enableInput();
        }
      }
    } else if (this.activeTransition) {
      this.activeTransition.update();
      if (this.activeTransition.isComplete) {
        this.activeTransition = null;

        if (this.pendingProjectBack) {
          // Camera returned to grid — clean up project view, re-enable grid
          this.pendingProjectBack = false;
          if (this.activeProjectView) {
            this.activeProjectView.dispose();
            this.remove(this.activeProjectView);
            this.activeProjectView = null;
          }
          this.activeProjectCell = null;
          if (this.activeCategory) {
            const grid = this.categoryViews.get(this.activeCategory);
            grid?.enableInput();
          }
          this.backButton.enable();
        } else if (this.activeProjectView) {
          // Camera arrived at project — project page is now visible
          // Nothing extra needed; the view is already added to the scene
        } else if (this.activeCategory) {
          // Camera arrived at category — start unfold
          const grid = this.categoryViews.get(this.activeCategory);
          if (grid) {
            this.activeUnfold = new UnfoldTransition(grid, this.activeCategory, false);
          }
        } else {
          // Camera returned home
          setInputEnabled(true);
        }
      }
    }

    this.homeView.update();
  }
}
