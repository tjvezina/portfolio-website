import { ProjectArea } from '@/data/types';

export type Route =
  | { type: 'home' }
  | { type: 'category', area: ProjectArea }
  | { type: 'project', area: ProjectArea, slug: string };

const VALID_CATEGORIES = new Set<string>([
  ProjectArea.College,
  ProjectArea.Personal,
  ProjectArea.Career,
]);

function parsePath(pathname: string): Route {
  const segments = pathname.split('/').filter((s) => s.length > 0);

  if (segments.length === 0) {
    return { type: 'home' };
  }

  if (segments.length >= 1 && VALID_CATEGORIES.has(segments[0])) {
    const area = segments[0] as ProjectArea;
    if (segments.length === 1) {
      return { type: 'category', area };
    }
    if (segments.length === 2) {
      return { type: 'project', area, slug: segments[1] };
    }
  }

  // Unknown route — fall back to home
  return { type: 'home' };
}

export function routeDepth(route: Route): number {
  switch (route.type) {
    case 'home': return 0;
    case 'category': return 1;
    case 'project': return 2;
  }
}

export function routeToPath(route: Route): string {
  switch (route.type) {
    case 'home': return '/';
    case 'category': return `/${route.area}`;
    case 'project': return `/${route.area}/${route.slug}`;
  }
}

export type NavigationDirection = 'forward' | 'back';

export default class Router {
  private currentRoute: Route;
  private onChange: (route: Route, direction: NavigationDirection) => void;

  get route(): Route { return this.currentRoute; }

  constructor(onChange: (route: Route, direction: NavigationDirection) => void) {
    this.onChange = onChange;
    this.currentRoute = parsePath(window.location.pathname);

    window.addEventListener('popstate', this.onPopState.bind(this));
  }

  navigate(route: Route): void {
    const path = routeToPath(route);
    window.history.pushState(null, '', path);
    const direction = routeDepth(route) > routeDepth(this.currentRoute) ? 'forward' : 'back';
    this.currentRoute = route;
    this.onChange(route, direction);
  }

  private onPopState(): void {
    const newRoute = parsePath(window.location.pathname);
    const direction = routeDepth(newRoute) >= routeDepth(this.currentRoute) ? 'forward' : 'back';
    this.currentRoute = newRoute;
    this.onChange(newRoute, direction);
  }
}
