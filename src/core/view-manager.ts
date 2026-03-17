import { Object3D } from 'three';

import { NavigationDirection, Route } from '@/core/router';
import { HomeView, setInputEnabled } from '@/view/home-view';

export { setInputEnabled };

export default class ViewManager extends Object3D {
  homeView: HomeView;

  constructor() {
    super();

    this.homeView = new HomeView();
    this.homeView.init();
    this.add(this.homeView);
  }

  onRouteChanged(route: Route, direction: NavigationDirection): void {
    console.log('ViewManager: route changed', route.type, direction);
  }

  update(): void {
    this.homeView.update();
  }
}
