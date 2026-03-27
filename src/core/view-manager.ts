import { MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from 'three';

import App, { HOME_AREA_WIDTH } from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { NavigationDirection, Route } from '@/core/router';
import { getProjectData } from '@/data/loader';
import { ProjectArea } from '@/data/types';
import Wireframe from '@/objects/wireframe';
import BackButton from '@/view/back-button';
import CategoryGridView, { PRISM_DEPTH } from '@/view/category-grid-view';
import { HomeView, setInputEnabled } from '@/view/home-view';
import GridTunnelTransition, { computeFlyTarget, TUNNEL_DISTANCE } from '@/view/transition/grid-tunnel-transition';
import PlanetFocusTransition, { computeFaceUpQuat } from '@/view/transition/planet-focus-transition';

export { setInputEnabled };

const GRID_COLS = 4.5;

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
  activeCategory: ProjectArea | null = null;

  /** Planet focus transition for home → category (must run after homeView.update). */
  private activePlanetFocus: PlanetFocusTransition | null = null;

  /** Navigation queuing — holds routes received during active transitions. */
  private busy = false;
  private transitionTarget: Route | null = null;
  private pendingRoutes: { route: Route, direction: NavigationDirection }[] = [];

  /** Project page state */
  private activeGridTunnel: GridTunnelTransition | null = null;
  private viewingProject = false;
  private clickedProjectCol: number | null = null;
  private clickedProjectRow: number | null = null;
  private preProjectCameraPos: Vector3 | null = null;

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
      if (this.viewingProject && this.activeCategory) {
        App.router.navigate({ type: 'category', area: this.activeCategory });
      } else {
        App.router.navigate({ type: 'home' });
      }
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
      if (direction === 'back' && this.viewingProject) {
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
    if (route.type === 'category') return this.activeCategory === route.area && !this.viewingProject;
    if (route.type === 'project') return this.viewingProject;
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

    // If coming from a project, clean up project state first
    if (this.viewingProject && this.activeCategory) {
      this.viewingProject = false;
      this.activeGridTunnel = null;
      const grid = this.categoryViews.get(this.activeCategory);
      if (grid) {
        grid.resetPrismPositions();
        grid.visible = true;
      }
      this.clickedProjectCol = null;
      this.clickedProjectRow = null;
      this.preProjectCameraPos = null;
      App.cameraRig.position.set(0, 0, App.cameraRig.position.z);
    }

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
    grid.onProjectClicked = (project, col, row): void => {
      this.clickedProjectCol = col;
      this.clickedProjectRow = row;
      App.router.navigate({ type: 'project', area, slug: project.slug });
    };
  }

  private showProject(area: ProjectArea, slug: string): void {
    if (!getProjectData(area, slug)) return;

    this.busy = true;
    this.transitionTarget = { type: 'project', area, slug };
    this.viewingProject = true;

    const grid = this.categoryViews.get(area);
    grid?.disableInput();

    // Store camera position so the reverse transition can restore it
    this.preProjectCameraPos = App.cameraRig.position.clone();

    // Look up col/row from slug if not already known (e.g. browser back to project URL)
    if (grid && (this.clickedProjectCol === null || this.clickedProjectRow === null)) {
      const prismData = grid.prisms.find(p => p.project?.slug === slug);
      if (prismData) {
        this.clickedProjectCol = prismData.col;
        this.clickedProjectRow = prismData.row;
      }
    }

    // Start the tunnel transition if we have a clicked cell
    if (grid && this.clickedProjectCol !== null && this.clickedProjectRow !== null) {
      this.activeGridTunnel = new GridTunnelTransition(
        grid, this.clickedProjectCol, this.clickedProjectRow, false,
      );
    } else {
      // No grid cell for this project — show immediately without animation
      if (grid) grid.visible = false;
      this.settle();
    }
  }

  private hideProject(): void {
    this.busy = true;
    this.transitionTarget = { type: 'category', area: this.activeCategory! };
    this.backButton.disable();

    const grid = this.categoryViews.get(this.activeCategory!);

    if (grid && this.clickedProjectCol !== null && this.clickedProjectRow !== null) {
      // Reparent the selected square back to the grid for the reverse transition
      const prism = grid.prisms.find(
        p => p.col === this.clickedProjectCol && p.row === this.clickedProjectRow,
      );
      if (prism?.originalWireframe && prism.wireframe.parent === this) {
        this.remove(prism.wireframe);
        grid.add(prism.wireframe);
      }

      // Animated reverse: square flies back, tunnel reverses, camera un-centers
      grid.visible = true;
      this.activeGridTunnel = new GridTunnelTransition(
        grid, this.clickedProjectCol, this.clickedProjectRow, true,
        this.preProjectCameraPos ?? undefined,
      );
    } else {
      // No animation (direct URL navigation) — just show the grid
      this.viewingProject = false;
      if (grid) {
        grid.visible = true;
        grid.enableInput();
      }
      this.backButton.enable();
      this.settle();
    }
  }

  private onGridTunnelComplete(): void {
    const wasReverse = this.activeGridTunnel!.reverse;
    this.activeGridTunnel = null;

    if (wasReverse) {
      // Returned from project to category grid
      this.viewingProject = false;
      this.clickedProjectCol = null;
      this.clickedProjectRow = null;
      this.preProjectCameraPos = null;
      const grid = this.categoryViews.get(this.activeCategory!);
      grid?.enableInput();
      this.backButton.enable();
      this.settle();
    } else {
      // Arrived at project — hide the grid but keep the selected square visible
      const grid = this.categoryViews.get(this.activeCategory!);
      if (grid) {
        // Reparent the selected square to ViewManager so it survives grid.visible = false
        const prism = grid.prisms.find(
          p => p.col === this.clickedProjectCol && p.row === this.clickedProjectRow,
        );
        if (prism?.originalWireframe) {
          grid.remove(prism.wireframe);
          this.add(prism.wireframe);
        }
        grid.visible = false;
      }
      this.settle();
    }
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

    // Stop orbits so anchor positions are stable for the back-navigation transition
    this.homeView.stopOrbiting();

    // Freeze the selected planet's tumble and align a face toward the camera,
    // so the reverse transition seamlessly replaces the center grid square.
    const planet = this.homeView.planetList.find(p => p.area === area);
    if (planet) {
      const alignedQuat = computeFaceUpQuat(planet.wireframe, planet.wireframe.quaternion);
      planet.wireframe.quaternion.copy(alignedQuat);
      planet.tumble.freeze();
    }

    // Hide home view — the grid replaces it
    this.homeView.visible = false;

    // Switch to perspective camera (grid is flat at z=0)
    App.swapToPerspective(0);

    // Grid at origin, fully built with no animation
    gridView.position.set(0, 0, 0);
    gridView.buildImmediate(HOME_AREA_WIDTH / GRID_COLS);
    gridView.visible = true;
    gridView.enableInput();

    this.activeCategory = area;
    this.backButton.enable();
  }

  private showProjectImmediate(area: ProjectArea, slug: string): void {
    if (!getProjectData(area, slug)) return;

    const grid = this.categoryViews.get(area);
    if (!grid) return;

    grid.disableInput();

    // Find the grid cell for this project
    const prismData = grid.prisms.find(p => p.project?.slug === slug);
    if (!prismData) {
      grid.visible = false;
      this.viewingProject = true;
      return;
    }

    const col = prismData.col;
    const row = prismData.row;
    this.clickedProjectCol = col;
    this.clickedProjectRow = row;

    // Save the default camera position for the reverse transition
    this.preProjectCameraPos = new Vector3(0, 0, App.cameraRig.position.z);

    // Center camera on the clicked cell (as if center-on-camera had completed)
    App.cameraRig.position.x = col * grid.cellSize + grid.position.x;
    App.cameraRig.position.y = row * grid.cellSize + grid.position.y;

    // Create a square at the fly-target position (top-left of screen)
    const square = new Wireframe(new PlaneGeometry(grid.cellSize, grid.cellSize), { color: grid.color });
    const flyTarget = computeFlyTarget(grid.cellSize);
    square.position.copy(flyTarget);

    // Transfer thumbnail from prism to square
    if (prismData.thumbnailMesh?.parent === prismData.wireframe) {
      prismData.wireframe.remove(prismData.thumbnailMesh);
      prismData.thumbnailMesh.position.z = 0.01;
      square.add(prismData.thumbnailMesh);
    }
    // Show thumbnail immediately (bypass fade-in)
    if (prismData.thumbnailMesh) {
      (prismData.thumbnailMesh.material as MeshBasicMaterial).opacity = 1;
      prismData.thumbnailFadeIn = 1;
    }

    // Swap prism for square in PrismData (remove original from grid)
    grid.remove(prismData.wireframe);
    prismData.originalWireframe = prismData.wireframe;
    prismData.wireframe = square;

    // Move other prisms to tunnel-end positions (off-screen forward)
    const baseZ = -PRISM_DEPTH / 2;
    for (const p of grid.prisms) {
      if (p !== prismData) {
        p.wireframe.position.z = baseZ + TUNNEL_DISTANCE;
      }
    }

    // Reparent square to ViewManager so it stays visible when grid is hidden
    this.add(square);
    grid.visible = false;

    this.viewingProject = true;
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
    // Drive grid tunnel transition (category ↔ project)
    if (this.activeGridTunnel) {
      this.activeGridTunnel.update();
      if (this.activeGridTunnel.isComplete) {
        this.onGridTunnelComplete();
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
