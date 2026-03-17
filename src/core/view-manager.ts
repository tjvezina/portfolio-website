import { Object3D, Vector3 } from 'three';

import App from '@/core/app';
import { NavigationDirection, Route } from '@/core/router';
import { ProjectArea } from '@/scenes/main-scene';
import CategoryGridView from '@/view/category-grid-view';
import { HomeView, setInputEnabled } from '@/view/home-view';
import CameraTransition from '@/view/transition/camera-transition';
import UnfoldTransition from '@/view/transition/unfold-transition';

export { setInputEnabled };

export default class ViewManager extends Object3D {
  homeView: HomeView;
  categoryViews: Map<ProjectArea, CategoryGridView> = new Map();
  activeTransition: CameraTransition | null = null;
  activeUnfold: UnfoldTransition | null = null;
  activeCategory: ProjectArea | null = null;

  /** When navigating home, we run unfold-reverse first, then camera. */
  private pendingHomeTransition = false;

  constructor() {
    super();

    this.homeView = new HomeView();
    this.homeView.init();
    this.add(this.homeView);

    this.homeView.onPlanetClicked = (area: ProjectArea): void => {
      App.router.navigate({ type: 'category', area });
    };
  }

  onRouteChanged(route: Route, direction: NavigationDirection): void {
    if (route.type === 'category') {
      this.showCategory(route.area);
    } else if (route.type === 'home') {
      this.showHome();
    }
    console.log('ViewManager: route changed', route.type, direction);
  }

  showCategory(area: ProjectArea): void {
    let grid = this.categoryViews.get(area);
    if (!grid) {
      grid = new CategoryGridView(area);
      this.categoryViews.set(area, grid);
      this.add(grid);
    }

    // Get planet world position for camera target
    const planet = this.homeView.planetList.find(p => p.area === area);
    if (planet) {
      const planetPos = new Vector3();
      planet.wireframe.getWorldPosition(planetPos);

      // Position grid at planet location
      grid.position.set(planetPos.x, planetPos.y, 0);

      // Camera target: planet x,y but keep current z
      const cameraTarget = new Vector3(planetPos.x, planetPos.y, App.camera.position.z);
      this.activeTransition = new CameraTransition(cameraTarget, 1.2);
    }

    // Grid starts hidden; unfold will reveal it after camera transition completes
    grid.visible = false;

    setInputEnabled(false);
    this.activeCategory = area;
  }

  showHome(): void {
    if (this.activeCategory) {
      const grid = this.categoryViews.get(this.activeCategory);
      if (grid) {
        grid.disableInput();
        // Start reverse unfold; camera transition starts after it completes
        this.activeUnfold = new UnfoldTransition(grid, this.activeCategory, true, 0.8);
        this.pendingHomeTransition = true;
      }
    }

    setInputEnabled(false);
  }

  private startHomeCamera(): void {
    const cameraTarget = new Vector3(0, 0, App.camera.position.z);
    this.activeTransition = new CameraTransition(cameraTarget, 1.2);
    this.pendingHomeTransition = false;
    this.activeCategory = null;
  }

  update(): void {
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

        if (this.activeCategory) {
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
