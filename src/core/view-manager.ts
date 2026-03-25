import { Object3D, Vector3 } from 'three';

import App, { HOME_AREA_WIDTH } from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { NavigationDirection, Route } from '@/core/router';
import { getProjectData } from '@/data/loader';
import { ProjectArea } from '@/data/types';
import BackButton from '@/view/back-button';
import CategoryGridView from '@/view/category-grid-view';
import GridCell from '@/view/grid/grid-cell';
import { HomeView, setInputEnabled } from '@/view/home-view';
import ProjectPageView from '@/view/project-page-view';
import CameraTransition from '@/view/transition/camera-transition';
import PlanetFocusTransition from '@/view/transition/planet-focus-transition';
import PrismPushTransition from '@/view/transition/prism-push-transition';

export { setInputEnabled };

const GRID_COLS = 4.75;

const PHI = (1 + Math.sqrt(5)) / 2;

// World-space edge length of each planet's faces, used to size grid cells.
// Career (icosahedron → hex) cell size is TBD — using icosahedron edge as placeholder.
const PLANET_EDGE_SIZE: Record<ProjectArea, number> = {
  [ProjectArea.College]: 0.9,
  [ProjectArea.Personal]: 0.75 * Math.SQRT2,
  [ProjectArea.Career]: 0.75 * 2 / Math.sqrt(1 + PHI * PHI),
};

const CATEGORY_COLORS: Record<ProjectArea, NeonColor> = {
  [ProjectArea.College]: NeonColor.Orange,
  [ProjectArea.Personal]: NeonColor.Green,
  [ProjectArea.Career]: NeonColor.Cyan,
};

export default class ViewManager extends Object3D {
  homeView: HomeView;
  categoryViews: Map<ProjectArea, CategoryGridView> = new Map();
  activeTransition: CameraTransition | null = null;
  activeCategory: ProjectArea | null = null;

  /** Planet focus transition for home → category (must run after homeView.update). */
  private activePlanetFocus: PlanetFocusTransition | null = null;

  /** Navigation queuing — holds routes received during active transitions. */
  private busy = false;
  private transitionTarget: Route | null = null;
  private pendingRoutes: { route: Route, direction: NavigationDirection }[] = [];

  /** Project page state */
  private activeProjectView: ProjectPageView | null = null;
  private activePrismPush: PrismPushTransition | null = null;
  private activeProjectCell: GridCell | null = null;
  private pendingProjectBack = false;

  /** In-scene back navigation button */
  private backButton: BackButton;
  private backButtonOriginalZ: number;

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
    this.backButtonOriginalZ = this.backButton.position.z;
    this.backButton.updatePosition();
    this.backButton.onClick = (): void => {
      window.history.back();
    };
    App.cameraRig.add(this.backButton);
  }

  onRouteChanged(route: Route, direction: NavigationDirection): void {
    if (this.busy) {
      this.enqueuePendingRoute(route, direction);
      return;
    }
    this.executeRoute(route, direction);
  }

  private executeRoute(route: Route, direction: NavigationDirection): void {
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

  /**
   * Push a route onto the pending queue.  If the new route matches the state
   * we'd be in without the last queued entry, the two cancel out (back+forward).
   */
  private enqueuePendingRoute(route: Route, direction: NavigationDirection): void {
    const q = this.pendingRoutes;
    if (q.length > 0) {
      const stateBeforeLast = q.length >= 2
        ? q[q.length - 2].route
        : this.transitionTarget!;
      if (this.routesMatch(route, stateBeforeLast)) {
        q.pop();
        return;
      }
    }
    q.push({ route, direction });
  }

  private routesMatch(a: Route, b: Route): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'category' && b.type === 'category') return a.area === b.area;
    if (a.type === 'project' && b.type === 'project') return a.area === b.area && a.slug === b.slug;
    return true;
  }

  private routeMatchesCurrent(route: Route): boolean {
    if (route.type === 'home') return this.activeCategory === null;
    if (route.type === 'category') return this.activeCategory === route.area && !this.activeProjectView;
    if (route.type === 'project') return !!this.activeProjectView;
    return false;
  }

  /** Clear busy flag and execute the next pending route, if any. */
  private settle(): void {
    this.busy = false;
    while (this.pendingRoutes.length > 0) {
      const { route, direction } = this.pendingRoutes.shift()!;
      if (!this.routeMatchesCurrent(route)) {
        this.executeRoute(route, direction);
        return;
      }
    }
  }

  showCategory(area: ProjectArea): void {
    this.busy = true;
    this.transitionTarget = { type: 'category', area };
    const color = CATEGORY_COLORS[area];
    let grid = this.categoryViews.get(area);
    if (!grid) {
      grid = new CategoryGridView(area, color);
      this.wireGridCallbacks(grid, area);
      this.categoryViews.set(area, grid);
      this.add(grid);
    }

    // Stop all orbital motion instantly so the planet position is stable
    this.homeView.stopOrbiting();

    const planet = this.homeView.planetList.find(p => p.area === area);
    if (planet) {
      // Grid will be centered at the origin (where the planet flies to)
      grid.position.set(0, 0, 0);

      // Planet flies to screen center and scales up to fill the grid area
      const targetScale = (HOME_AREA_WIDTH / GRID_COLS) / PLANET_EDGE_SIZE[area];
      const otherPlanets = this.homeView.planetList.filter(p => p.area !== area);
      this.activePlanetFocus = new PlanetFocusTransition(
        planet, otherPlanets, this.homeView.sun, targetScale, 1.2,
      );
    }

    // Grid starts hidden; unfold will reveal it after focus transition completes
    grid.visible = false;

    setInputEnabled(false);
    this.activeCategory = area;
    this.backButton.enable();
  }

  showHome(): void {
    this.backButton.disable();
    setInputEnabled(false);

    if (this.activeCategory) {
      this.busy = true;
      this.transitionTarget = { type: 'home' };
      const area = this.activeCategory;
      const grid = this.categoryViews.get(area);
      if (grid) {
        grid.disableInput();

        const cellSize = HOME_AREA_WIDTH / GRID_COLS;
        grid.startReverseFold(cellSize, () => {
          grid.removeCenterSquare();
          grid.visible = false;
          grid.scale.setScalar(1);

          // Swap back to orthographic camera
          App.swapToOrthographic();

          // Show home view — planet positions will be overridden by reverse focus
          this.homeView.visible = true;
          const planet = this.homeView.planetList.find(p => p.area === area);
          if (planet) planet.wireframe.visible = true;

          // Start reverse planet focus transition
          if (planet) {
            planet.tumble.resume();
            const targetScale = (HOME_AREA_WIDTH / GRID_COLS) / PLANET_EDGE_SIZE[area];
            const otherPlanets = this.homeView.planetList.filter(p => p.area !== area);
            this.activePlanetFocus = new PlanetFocusTransition(
              planet, otherPlanets, this.homeView.sun, targetScale, 1.2, true,
            );
          }
        });
      }
    }
  }

  private wireGridCallbacks(grid: CategoryGridView, area: ProjectArea): void {
    grid.onProjectClicked = (project): void => {
      App.router.navigate({ type: 'project', area, slug: project.slug });
    };
  }

  private showProject(area: ProjectArea, slug: string): void {
    const project = getProjectData(area, slug);
    if (!project) return;
    this.busy = true;
    this.transitionTarget = { type: 'project', area, slug };

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
      App.cameraRig.position.x,
      App.cameraRig.position.y,
      App.cameraRig.position.z - 5,
    );
    this.activeTransition = new CameraTransition(cameraTarget, 1.0);
  }

  private hideProject(): void {
    this.busy = true;
    this.transitionTarget = { type: 'category', area: this.activeCategory! };
    // Disable back button during transition to prevent double-navigation
    this.backButton.disable();

    // Start reverse prism push
    if (this.activeProjectCell) {
      this.activePrismPush = new PrismPushTransition(this.activeProjectCell, true);
    }

    // Move camera back to grid plane
    const cameraTarget = new Vector3(
      App.cameraRig.position.x,
      App.cameraRig.position.y,
      App.cameraRig.position.z + 5,
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

    // Grid at origin (no camera movement in this strategy)
    gridView.position.set(0, 0, 0);
    gridView.visible = true;
    gridView.enableInput();

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
    App.cameraRig.position.z = App.cameraRig.position.z - 5;
  }

  onCameraSwapped(matchPlaneLocalZ: number): void {
    this.backButton.position.z = matchPlaneLocalZ;
  }

  onCameraSwappedToOrtho(): void {
    this.backButton.position.z = this.backButtonOriginalZ;
  }

  onWindowResized(): void {
    this.backButton.updatePosition();
  }

  update(): void {
    // Update prism push independently of other transitions
    if (this.activePrismPush) {
      this.activePrismPush.update();
      if (this.activePrismPush.isComplete) {
        this.activePrismPush = null;
      }
    }

    // Camera transitions (used for project view navigation)
    if (this.activeTransition) {
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
          this.settle();
        } else if (this.activeProjectView) {
          // Camera arrived at project
          this.settle();
        } else {
          // Camera returned home
          setInputEnabled(true);
          this.settle();
        }
      }
    }

    this.homeView.update();

    // Drive cross-unfold animation on the active category grid
    if (this.activeCategory) {
      this.categoryViews.get(this.activeCategory)?.update();
    }

    // Must run after homeView.update() so wireframe position overrides take effect.
    if (this.activePlanetFocus) {
      this.activePlanetFocus.update();
      if (this.activePlanetFocus.isComplete) {
        if (this.activePlanetFocus.reverse) {
          // Reverse focus complete — restore home state
          this.homeView.resumeOrbiting();
          this.activePlanetFocus = null;
          this.activeCategory = null;
          setInputEnabled(true);
          this.settle();
        } else if (this.activeCategory) {
          const grid = this.categoryViews.get(this.activeCategory);
          if (grid && !grid.visible) {
            // Hide all home view objects — the grid takes over from here
            this.homeView.visible = false;

            // Switch to perspective camera — the grid face is flat and coplanar,
            // so matching the ortho view at z=0 makes the swap imperceptible.
            App.swapToPerspective(0);

            grid.showInitialFace(HOME_AREA_WIDTH / GRID_COLS);
            grid.visible = true;
            // Unfold outward wave by wave; enable input when all waves complete
            grid.startCrossUnfold(HOME_AREA_WIDTH / GRID_COLS, () => {
              grid.enableInput();
              this.settle();
            });
            this.activePlanetFocus = null;
          }
        }
      }
    }
  }
}
