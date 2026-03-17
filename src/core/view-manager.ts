import { Object3D, Vector3 } from 'three';

import App from '@/core/app';
import { NavigationDirection, Route } from '@/core/router';
import { ProjectArea } from '@/scenes/main-scene';
import CategoryGridView from '@/view/category-grid-view';
import { HomeView, setInputEnabled } from '@/view/home-view';
import CameraTransition from '@/view/transition/camera-transition';

export { setInputEnabled };

export default class ViewManager extends Object3D {
  homeView: HomeView;
  categoryViews: Map<ProjectArea, CategoryGridView> = new Map();
  activeTransition: CameraTransition | null = null;
  activeCategory: ProjectArea | null = null;

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

    grid.visible = true;
    grid.enableInput();

    setInputEnabled(false);
    this.activeCategory = area;
  }

  showHome(): void {
    if (this.activeCategory) {
      const grid = this.categoryViews.get(this.activeCategory);
      if (grid) {
        grid.visible = false;
        grid.disableInput();
      }
    }

    const cameraTarget = new Vector3(0, 0, App.camera.position.z);
    this.activeTransition = new CameraTransition(cameraTarget, 1.2);

    setInputEnabled(true);
    this.activeCategory = null;
  }

  update(): void {
    if (this.activeTransition) {
      this.activeTransition.update();
      if (this.activeTransition.isComplete) {
        this.activeTransition = null;
      }
    }

    this.homeView.update();
  }
}
