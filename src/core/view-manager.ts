import { MeshBasicMaterial, Object3D, Vector3 } from 'three';

import App, { HOME_AREA_WIDTH } from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { NavigationDirection, Route } from '@/core/router';
import { getCategoryData, getProjectData, getProjectIndex } from '@/data/loader';
import { ProjectArea, ProjectData } from '@/data/types';
import Wireframe from '@/objects/wireframe';
import BackButton from '@/view/back-button';
import CategoryGridView, { PRISM_DEPTH, PrismData } from '@/view/category-grid-view';
import { HomeView, setInputEnabled } from '@/view/home-view';
import ProjectNavArrows from '@/view/project-nav-arrows';
import ProjectPageView, { THUMBNAIL_SCALE } from '@/view/project-page-view';
import GridTunnelTransition, { computeFlyTarget, computeVisibleHalfHeight, TUNNEL_DISTANCE } from '@/view/transition/grid-tunnel-transition';
import PlanetFocusTransition, { computeTargetQuat } from '@/view/transition/planet-focus-transition';

export { setInputEnabled };

/** Number of hex cell widths (vertex-to-vertex = 2 × circumradius) across HOME_AREA_WIDTH. */
const GRID_COLS: Record<ProjectArea, number> = {
  [ProjectArea.College]: 4.5,
  [ProjectArea.Personal]: 4.5,
  [ProjectArea.Career]: 4.5,
};

const PHI = (1 + Math.sqrt(5)) / 2;

// Vertex-to-vertex diameter of each planet's orthographic hex projection at scale 1.
// The planet scales up so this matches the hex cell's vertex-to-vertex diameter (cellSize).
const PLANET_EDGE_SIZE: Record<ProjectArea, number> = {
  [ProjectArea.College]: 0.9 * 2 * Math.sqrt(6) / 3,
  [ProjectArea.Personal]: 0.75 * 2 * Math.sqrt(6) / 3,
  [ProjectArea.Career]: 0.75 * 4 * PHI / Math.sqrt(3 * (2 + PHI)),
};

const CATEGORY_COLORS: Record<ProjectArea, NeonColor> = {
  [ProjectArea.College]: NeonColor.Orange,
  [ProjectArea.Personal]: NeonColor.Green,
  [ProjectArea.Career]: NeonColor.Cyan,
};

/** Duration for the horizontal slide between projects. */
const SLIDE_DURATION = 0.6;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type ProjectSlide = {
  elapsed: number,
  duration: number,
  startCameraX: number,
  targetCameraX: number,
  oldPageView: ProjectPageView | null,
  oldSquare: Wireframe | null,
  oldCol: number,
  oldRow: number,
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
  private activeProjectSlug: string | null = null;
  private projectSlide: ProjectSlide | null = null;
  private clickedProjectCol: number | null = null;
  private clickedProjectRow: number | null = null;
  private preProjectCameraPos: Vector3 | null = null;
  private projectSquare: Wireframe | null = null;
  private projectPageView: ProjectPageView | null = null;
  private projectScrollTarget = 0;
  private projectScrollOffset = 0;
  private projectPageBaseY = 0;
  private projectSquareBaseY = 0;

  /** In-scene back navigation button */
  private backButton: BackButton;
  private backButtonOriginalZ: number;

  /** Left/right navigation arrows for project pages */
  private navArrows: ProjectNavArrows;

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

    this.navArrows = new ProjectNavArrows();
    this.navArrows.position.z = 5;
    this.navArrows.updatePosition();
    this.navArrows.onPrev = (): void => {
      if (!this.activeProjectSlug || !this.activeCategory) return;
      const projects = getCategoryData(this.activeCategory).projects;
      if (projects.length < 2) return;
      const index = projects.findIndex(p => p.slug === this.activeProjectSlug);
      const prev = projects[(index - 1 + projects.length) % projects.length];
      App.router.navigate({ type: 'project', area: this.activeCategory, slug: prev.slug });
    };
    this.navArrows.onNext = (): void => {
      if (!this.activeProjectSlug || !this.activeCategory) return;
      const projects = getCategoryData(this.activeCategory).projects;
      if (projects.length < 2) return;
      const index = projects.findIndex(p => p.slug === this.activeProjectSlug);
      const next = projects[(index + 1) % projects.length];
      App.router.navigate({ type: 'project', area: this.activeCategory, slug: next.slug });
    };
    App.cameraRig.add(this.navArrows);
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
      if (this.viewingProject && this.activeCategory === route.area) {
        this.slideToProject(route.area, route.slug);
      } else {
        this.showProject(route.area, route.slug);
      }
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
    if (route.type === 'project') {
      return this.viewingProject && route.area === this.activeCategory
        && route.slug === this.activeProjectSlug;
    }
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

  onWheel(deltaY: number): void {
    if (!this.viewingProject || !this.projectPageView || this.activeGridTunnel || this.projectSlide) return;
    if (this.projectPageView.lightboxActive) return;
    this.projectScrollTarget += deltaY * 0.01;
    const visibleHeight = computeVisibleHalfHeight() * 2;
    const maxScroll = Math.max(0, this.projectPageView.contentHeight - visibleHeight);
    this.projectScrollTarget = Math.max(0, Math.min(this.projectScrollTarget, maxScroll));
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
      const targetScale = (HOME_AREA_WIDTH / GRID_COLS[area]) / PLANET_EDGE_SIZE[area];
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
    this.navArrows.disable();
    setInputEnabled(false);

    // If coming from a project, clean up project state first
    if (this.viewingProject && this.activeCategory) {
      this.destroyProjectPage();
      this.viewingProject = false;
      this.activeProjectSlug = null;
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

        const cellSize = HOME_AREA_WIDTH / GRID_COLS[area];
        const startReverseFocus = (): void => {
          grid.removeCenterSquare();
          grid.visible = false;
          grid.scale.setScalar(1);

          const planet = this.homeView.planetList.find(p => p.area === area);

          // Start reverse planet focus transition
          if (planet) {
            planet.tumble.resume();
            const targetScale = (HOME_AREA_WIDTH / GRID_COLS[area]) / PLANET_EDGE_SIZE[area];
            const otherPlanets = this.homeView.planetList.filter(p => p.area !== area);
            this.activePlanetFocus = new PlanetFocusTransition(
              planet, otherPlanets, this.homeView.sun, targetScale, 1.2, true,
            );
          }
        };

        grid.startReverseFold(cellSize, () => {
          // Swap back to orthographic camera
          App.swapToOrthographic();

          // Show home view — planet positions will be overridden by reverse focus
          this.homeView.visible = true;
          const planet = this.homeView.planetList.find(p => p.area === area);
          if (planet) planet.wireframe.visible = true;

          // Hide other planets and sun during the hex fade-out; the
          // PlanetFocusTransition in startReverseFocus will reveal them.
          const otherPlanets = this.homeView.planetList.filter(p => p.area !== area);
          for (const p of otherPlanets) {
            p.wireframe.scale.setScalar(0);
          }
          this.homeView.sun.scale.setScalar(0);

          // Crossfade center hex face out, planet in, then start reverse focus
          const targetScale = (HOME_AREA_WIDTH / GRID_COLS[area]) / PLANET_EDGE_SIZE[area];
          if (planet) {
            planet.wireframe.position.set(0, 0, 1);
            planet.wireframe.scale.setScalar(targetScale);
          }
          grid.fadeOutCenterFace(planet?.wireframe ?? null, startReverseFocus);
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
    const project = getProjectData(area, slug);
    if (!project) return;

    this.busy = true;
    this.transitionTarget = { type: 'project', area, slug };
    this.viewingProject = true;
    this.activeProjectSlug = slug;

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

    // Create the project page at the destination camera position in world space,
    // so the prism grid occludes it as it flies past.
    if (grid && this.clickedProjectCol !== null && this.clickedProjectRow !== null) {
      const dest = grid.cellToWorld(this.clickedProjectCol, this.clickedProjectRow);
      const destX = dest.x + grid.position.x;
      const destY = dest.y + grid.position.y;
      this.createProjectPage(project, destX, destY);
    } else {
      this.createProjectPage(project);
    }

    // Start the tunnel transition if we have a clicked cell
    if (grid && this.clickedProjectCol !== null && this.clickedProjectRow !== null) {
      this.activeGridTunnel = new GridTunnelTransition(
        grid, this.clickedProjectCol, this.clickedProjectRow, false,
        undefined, THUMBNAIL_SCALE,
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
    this.navArrows.disable();
    this.projectPageView?.disableInput();

    const grid = this.categoryViews.get(this.activeCategory!);

    if (grid && this.clickedProjectCol !== null && this.clickedProjectRow !== null) {
      // Snap camera to the current project's grid cell so the reverse tunnel
      // un-center distance stays short (avoids jarring snap when the camera was
      // offset by a prior project slide).
      const cellWorld = grid.cellToWorld(this.clickedProjectCol, this.clickedProjectRow);
      const cellX = cellWorld.x + grid.position.x;
      const cellY = cellWorld.y + grid.position.y;
      const dx = cellX - App.cameraRig.position.x;
      const dy = cellY - App.cameraRig.position.y;
      App.cameraRig.position.x = cellX;
      App.cameraRig.position.y = cellY;

      // Reposition content to compensate for the camera jump (invisible on-screen)
      if (this.projectPageView) {
        this.projectPageView.position.x += dx;
        this.projectPageView.position.y += dy;
        this.projectPageBaseY += dy;
      }
      if (this.projectSquare) {
        const target = computeFlyTarget(grid.cellSize);
        this.projectSquareBaseY = target.y;
        this.projectSquare.position.x = target.x;
        this.projectSquare.position.y = target.y + this.projectScrollOffset;
      }

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
        this.preProjectCameraPos ?? undefined, THUMBNAIL_SCALE,
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
      this.destroyProjectPage();
      this.viewingProject = false;
      this.activeProjectSlug = null;
      this.clickedProjectCol = null;
      this.clickedProjectRow = null;
      this.preProjectCameraPos = null;
      this.projectSquare = null;
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
          this.projectSquare = prism.wireframe as Wireframe;
        }
        grid.visible = false;

        // Lock base positions now that the transition is done
        if (this.projectPageView) {
          this.projectPageView.position.x = App.cameraRig.position.x;
          this.projectPageBaseY = App.cameraRig.position.y + computeVisibleHalfHeight();
          this.projectPageView.position.y = this.projectPageBaseY + this.projectScrollOffset;
          this.projectPageView.enableInput();
        }
        if (this.projectSquare) {
          this.projectSquareBaseY = this.projectSquare.position.y;
        }
      }
      this.updateNavArrows();
      this.settle();
    }
  }

  // ---------------------------------------------------------------------------
  // Project slide (lateral navigation between projects in same category)
  // ---------------------------------------------------------------------------

  private slideToProject(area: ProjectArea, slug: string): void {
    const project = getProjectData(area, slug);
    if (!project) return;

    this.busy = true;
    this.transitionTarget = { type: 'project', area, slug };

    // Determine slide direction from project ordering
    const currentIndex = this.activeProjectSlug
      ? getProjectIndex(area, this.activeProjectSlug) : -1;
    const newIndex = getProjectIndex(area, slug);
    // Use shortest-path around the circular list to pick slide direction
    const count = getCategoryData(area).projects.length;
    const forwardSteps = (newIndex - currentIndex + count) % count;
    const slideRight = forwardSteps <= count / 2;

    // Disable page input (arrows stay visible — clicks are queued via busy flag)
    this.projectPageView?.disableInput();

    // Compute slide distance = full visible width
    const halfHeight = computeVisibleHalfHeight();
    const visibleHalfWidth = halfHeight * App.perspCamera.aspect;
    const slideDistance = visibleHalfWidth * 2 * (slideRight ? 1 : -1);

    const startCameraX = App.cameraRig.position.x;
    const targetCameraX = startCameraX + slideDistance;

    // Save old state
    const oldPageView = this.projectPageView;
    const oldSquare = this.projectSquare;
    const oldCol = this.clickedProjectCol ?? 0;
    const oldRow = this.clickedProjectRow ?? 0;

    // Set up new project's grid prism as a square
    const grid = this.categoryViews.get(area)!;
    const newPrismData = grid.prisms.find(p => p.project?.slug === slug);

    if (newPrismData && !newPrismData.originalWireframe) {
      this.swapPrismToSquare(newPrismData, grid);
    }

    const newCol = newPrismData?.col ?? 0;
    const newRow = newPrismData?.row ?? 0;

    // Position new square at fly target for the target camera position
    if (this.projectSquare) {
      const flyTarget = this.computeFlyTargetAt(targetCameraX, grid.cellSize);
      this.projectSquare.position.copy(flyTarget);
      this.projectSquare.scale.setScalar(THUMBNAIL_SCALE);
      this.projectSquareBaseY = flyTarget.y;
    }

    // Create new project page at target camera position
    this.projectPageView = null;
    this.createProjectPage(project, targetCameraX, App.cameraRig.position.y);

    // Update tracking state
    this.activeProjectSlug = slug;
    this.clickedProjectCol = newCol;
    this.clickedProjectRow = newRow;
    this.projectScrollTarget = 0;
    this.projectScrollOffset = 0;

    // Start slide animation
    this.projectSlide = {
      elapsed: 0,
      duration: SLIDE_DURATION,
      startCameraX,
      targetCameraX,
      oldPageView,
      oldSquare,
      oldCol,
      oldRow,
    };
  }

  private onProjectSlideComplete(): void {
    const slide = this.projectSlide!;
    this.projectSlide = null;

    const grid = this.categoryViews.get(this.activeCategory!)!;

    // Restore old project's grid prism state
    const oldPrism = grid.prisms.find(p => p.col === slide.oldCol && p.row === slide.oldRow);
    if (oldPrism?.originalWireframe) {
      // Transfer thumbnail back to the original prism
      if (oldPrism.thumbnailMesh?.parent === slide.oldSquare) {
        slide.oldSquare!.remove(oldPrism.thumbnailMesh);
        oldPrism.thumbnailMesh.position.z = PRISM_DEPTH / 2 + 0.01;
        oldPrism.originalWireframe.add(oldPrism.thumbnailMesh);
      }
      oldPrism.wireframe = oldPrism.originalWireframe;
      oldPrism.originalWireframe = undefined;
      grid.add(oldPrism.wireframe);
    }

    // Clean up old content
    if (slide.oldPageView) {
      slide.oldPageView.dispose();
      this.remove(slide.oldPageView);
    }
    if (slide.oldSquare?.parent) {
      slide.oldSquare.parent.remove(slide.oldSquare);
    }

    // Snap camera to the new project's grid cell so the back transition works cleanly
    const snapWorld = grid.cellToWorld(this.clickedProjectCol!, this.clickedProjectRow!);
    const cellX = snapWorld.x + grid.position.x;
    const cellY = snapWorld.y + grid.position.y;
    App.cameraRig.position.x = cellX;
    App.cameraRig.position.y = cellY;

    // Reposition content to match the snapped camera position
    if (this.projectSquare) {
      const target = computeFlyTarget(grid.cellSize);
      this.projectSquareBaseY = target.y;
      this.projectSquare.position.x = target.x;
      this.projectSquare.position.y = target.y;
    }
    if (this.projectPageView) {
      this.projectPageView.position.x = App.cameraRig.position.x;
      this.projectPageBaseY = App.cameraRig.position.y + computeVisibleHalfHeight();
      this.projectPageView.position.y = this.projectPageBaseY;
      this.projectPageView.enableInput();
    }

    this.projectScrollTarget = 0;
    this.projectScrollOffset = 0;

    this.updateNavArrows();
    this.settle();
  }

  private updateNavArrows(): void {
    if (!this.viewingProject || !this.activeProjectSlug || !this.activeCategory) {
      this.navArrows.disable();
      return;
    }
    const projects = getCategoryData(this.activeCategory).projects;
    const index = projects.findIndex(p => p.slug === this.activeProjectSlug);
    if (index === -1) {
      this.navArrows.disable();
      return;
    }
    this.navArrows.enable(projects.length > 1, projects.length > 1);
  }

  private swapPrismToSquare(prismData: PrismData, grid: CategoryGridView): void {
    const square = new Wireframe(grid.createFaceGeometry(), { color: grid.color });

    // Transfer thumbnail to the square
    if (prismData.thumbnailMesh?.parent === prismData.wireframe) {
      prismData.wireframe.remove(prismData.thumbnailMesh);
      prismData.thumbnailMesh.position.z = 0.01;
      square.add(prismData.thumbnailMesh);
    }
    if (prismData.thumbnailMesh) {
      (prismData.thumbnailMesh.material as MeshBasicMaterial).opacity = 1;
      prismData.thumbnailFadeIn = 1;
    }

    // Remove original prism from grid
    grid.remove(prismData.wireframe);
    prismData.originalWireframe = prismData.wireframe;
    prismData.wireframe = square;

    // Add square to ViewManager
    this.add(square);
    this.projectSquare = square;
  }

  private computeFlyTargetAt(cameraX: number, cellSize: number): Vector3 {
    const cameraWorldZ = App.cameraRig.position.z + App.perspCamera.position.z;
    const halfFovRad = App.perspCamera.fov * Math.PI / 360;
    const visibleHalfHeight = cameraWorldZ * Math.tan(halfFovRad);
    const contentHalfWidth = HOME_AREA_WIDTH / 2;
    const margin = cellSize * 1.1;
    return new Vector3(
      cameraX - contentHalfWidth + margin,
      App.cameraRig.position.y + visibleHalfHeight - margin,
      0,
    );
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

    // Freeze the selected planet's tumble and align it toward the camera,
    // so the reverse transition seamlessly replaces the center grid hex.
    const planet = this.homeView.planetList.find(p => p.area === area);
    if (planet) {
      const alignedQuat = computeTargetQuat(planet.wireframe, planet.wireframe.quaternion, area);
      planet.wireframe.quaternion.copy(alignedQuat);
      planet.tumble.freeze();
    }

    // Hide home view — the grid replaces it
    this.homeView.visible = false;

    // Switch to perspective camera (grid is flat at z=0)
    App.swapToPerspective(0);

    // Grid at origin, fully built with no animation
    gridView.position.set(0, 0, 0);
    gridView.buildImmediate(HOME_AREA_WIDTH / GRID_COLS[area]);
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
    const cellPos = grid.cellToWorld(col, row);
    App.cameraRig.position.x = cellPos.x + grid.position.x;
    App.cameraRig.position.y = cellPos.y + grid.position.y;

    // Create a flat face at the fly-target position (top-left of screen)
    const square = new Wireframe(grid.createFaceGeometry(), { color: grid.color });
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
    this.activeProjectSlug = slug;
    this.projectSquare = square;
    this.projectSquare.scale.setScalar(THUMBNAIL_SCALE);
    this.projectSquareBaseY = square.position.y;

    // Create the project page content
    const project = getProjectData(area, slug);
    if (project) {
      this.createProjectPage(project);
    }

    this.updateNavArrows();
  }

  private createProjectPage(
    project: ProjectData,
    camX?: number,
    camY?: number,
  ): void {
    const grid = this.categoryViews.get(this.activeCategory!);
    if (!grid) return;

    const cx = camX ?? App.cameraRig.position.x;
    const cy = camY ?? App.cameraRig.position.y;
    const expectedSlug = project.slug;

    const color = CATEGORY_COLORS[this.activeCategory!];
    ProjectPageView.create(project, color, grid.cellSize).then(view => {
      // Guard: user navigated away or project changed during image preload
      if (!this.viewingProject || this.projectPageView || this.activeProjectSlug !== expectedSlug) {
        view.dispose();
        return;
      }

      this.projectPageView = view;
      // During any transition, use captured target position; otherwise use live camera
      const transitioning = !!this.projectSlide || !!this.activeGridTunnel;
      const posX = transitioning ? cx : App.cameraRig.position.x;
      const posY = (transitioning ? cy : App.cameraRig.position.y) + computeVisibleHalfHeight();
      view.position.x = posX;
      view.position.y = posY;
      view.position.z = -0.5; // behind thumbnail/grid for correct occlusion
      this.add(view);

      // Only enable input when no transition is active
      if (!this.projectSlide && !this.activeGridTunnel) {
        view.enableInput();
      }

      this.projectPageBaseY = view.position.y;
      this.projectScrollTarget = 0;
      this.projectScrollOffset = 0;
    });
  }

  private destroyProjectPage(): void {
    if (this.projectPageView) {
      this.projectPageView.dispose();
      this.remove(this.projectPageView);
      this.projectPageView = null;
    }
  }

  onCameraSwapped(matchPlaneLocalZ: number): void {
    this.backButton.position.z = matchPlaneLocalZ;
    this.navArrows.position.z = matchPlaneLocalZ;
  }

  onCameraSwappedToOrtho(): void {
    this.backButton.position.z = this.backButtonOriginalZ;
  }

  onWindowResized(): void {
    this.backButton.updatePosition();
    this.navArrows.updatePosition();

    // Reposition the project square and page view to the updated content area
    if (this.viewingProject && this.projectSquare && !this.activeGridTunnel) {
      const grid = this.categoryViews.get(this.activeCategory!);
      if (grid) {
        const target = computeFlyTarget(grid.cellSize);
        this.projectSquareBaseY = target.y;
        this.projectSquare.position.x = target.x;
        this.projectSquare.position.y = target.y + this.projectScrollOffset;

        if (this.projectPageView) {
          const halfHeight = computeVisibleHalfHeight();
          this.projectPageBaseY = App.cameraRig.position.y + halfHeight;
          this.projectPageView.position.y = this.projectPageBaseY + this.projectScrollOffset;
        }
      }
    }

    // Update the in-flight target during a transition
    if (this.activeGridTunnel) {
      this.activeGridTunnel.onWindowResized();
    }
  }

  update(): void {
    // Drive grid tunnel transition (category ↔ project)
    if (this.activeGridTunnel) {
      this.activeGridTunnel.update();
      if (this.activeGridTunnel.isComplete) {
        this.onGridTunnelComplete();
      }
    }

    // Drive project slide transition
    if (this.projectSlide) {
      this.projectSlide.elapsed += App.deltaTime;
      const t = Math.min(1, this.projectSlide.elapsed / this.projectSlide.duration);
      const e = easeInOutCubic(t);
      App.cameraRig.position.x = this.projectSlide.startCameraX
        + (this.projectSlide.targetCameraX - this.projectSlide.startCameraX) * e;
      if (t >= 1) {
        this.onProjectSlideComplete();
      }
    }

    // Apply smooth scroll offset on the project page (only when not transitioning)
    if (this.viewingProject && this.projectPageView && !this.activeGridTunnel && !this.projectSlide) {
      this.projectScrollOffset += (this.projectScrollTarget - this.projectScrollOffset) *
        (1 - Math.exp(-12 * App.deltaTime));
      this.projectPageView.position.y = this.projectPageBaseY + this.projectScrollOffset;
      if (this.projectSquare) {
        this.projectSquare.position.y = this.projectSquareBaseY + this.projectScrollOffset;
      }
    }

    // Update project page interactions (button hover/press)
    this.projectPageView?.update();
    this.projectSlide?.oldPageView?.update();

    this.backButton.update();
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
            const area = this.activeCategory;
            const cellSize = HOME_AREA_WIDTH / GRID_COLS[area];

            grid.showInitialFace(cellSize);
            grid.visible = true;

            // Crossfade the planet out while the hex face fades in.
            // Keep orthographic + activePlanetFocus alive during the fade so the
            // planet stays pinned at center, then hide it and swap to perspective.
            const planet = this.homeView.planetList.find(p => p.area === area);
            grid.fadeInInitialFace(planet?.wireframe ?? null, () => {
              this.homeView.visible = false;
              this.activePlanetFocus = null;
              App.swapToPerspective(0);
              grid.startCrossUnfold(cellSize, () => {
                grid.enableInput();
                this.settle();
              });
            });
          }
        }
      }
    }
  }
}
