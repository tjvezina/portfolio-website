# Portfolio Website Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing Three.js landing page into a full portfolio website with category grids, project pages, animated transitions, and clean URL routing.

**Architecture:** Single Three.js scene with camera-driven navigation. A ViewManager orchestrates view lifecycle and transitions. Stars and title are fixed to the camera rig. A lightweight custom router maps URL paths to view states. Project data lives in JSON files imported at build time.

**Tech Stack:** Three.js, TypeScript, webpack, Cloudflare Pages

**Spec:** `docs/superpowers/specs/2026-03-16-portfolio-website-design.md`

**Important:** This project has no test framework (solo visual project, manual verification only per CLAUDE.md). All verification steps use `yarn serve` and visual inspection at http://localhost:8080.

**Code style:** 2-space indent, always semicolons, trailing commas on multiline, explicit return types on all functions, `simple-import-sort`, interfaces use `;` delimiters, type aliases use `,`. See `.eslintrc` for full rules.

---

## Chunk 1: Foundation

### File Map — Chunk 1

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/data/types.ts` | TypeScript interfaces for project data |
| Create | `src/data/loader.ts` | Build-time data loading and indexing |
| Create | `src/data/college/sample-project.json` | Placeholder project for testing |
| Create | `src/data/personal/portfolio-website.json` | Placeholder project for testing |
| Create | `src/data/career/sample-career.json` | Placeholder project for testing |
| Create | `src/core/router.ts` | URL parsing, history management, route matching |
| Modify | `webpack.config.js` | Remove 404.html plugin, add image asset loader |
| Modify | `index.html` | Remove SPA redirect script |
| Modify | `src/core/app.ts` | Integrate router, pass route to scene |

---

### Task 1: Project Data Types and Loader

**Files:**
- Create: `src/data/types.ts`
- Create: `src/data/loader.ts`
- Create: `src/data/college/sample-project.json`
- Create: `src/data/personal/portfolio-website.json`
- Create: `src/data/career/sample-career.json`

- [ ] **Step 1: Create the ProjectData interface and Category type**

```typescript
// src/data/types.ts
import { ProjectArea } from '@/scenes/main-scene';

export interface ProjectData {
  slug: string;
  title: string;
  thumbnail?: string;
  description?: string;
  screenshots?: string[];
  playUrl?: string;
  sourceUrl?: string;
  tags?: string[];
  date?: string;
}

export interface CategoryData {
  area: ProjectArea;
  projects: ProjectData[];
}
```

- [ ] **Step 2: Create sample project JSON files**

```json
// src/data/college/sample-project.json
{
  "slug": "sample-project",
  "title": "Sample College Project",
  "description": "A placeholder project for development.",
  "tags": ["Unity", "C#"]
}
```

```json
// src/data/personal/portfolio-website.json
{
  "slug": "portfolio-website",
  "title": "Portfolio Website",
  "description": "This website — a Three.js neon wireframe experience.",
  "sourceUrl": "https://github.com/tylerjvezina/portfolio-website",
  "tags": ["Three.js", "TypeScript", "WebGL"]
}
```

```json
// src/data/career/sample-career.json
{
  "slug": "sample-career",
  "title": "Sample Career Project",
  "description": "A placeholder career project.",
  "tags": ["Unreal", "C++"]
}
```

- [ ] **Step 3: Create the data loader**

The loader uses webpack's `require.context` to import all JSON files from each category directory at build time, indexed by category and slug.

```typescript
// src/data/loader.ts
import { ProjectArea } from '@/scenes/main-scene';
import { CategoryData, ProjectData } from '@/data/types';

function loadCategory(context: __WebpackModuleApi.RequireContext): ProjectData[] {
  return context.keys().map((key) => {
    const mod = context(key);
    // webpack may wrap JSON as { default: ... } or return directly — handle both
    return (mod.default ?? mod) as ProjectData;
  });
}

const collegeContext = require.context('./college', false, /\.json$/);
const personalContext = require.context('./personal', false, /\.json$/);
const careerContext = require.context('./career', false, /\.json$/);

const categories: Map<ProjectArea, CategoryData> = new Map([
  [ProjectArea.College, { area: ProjectArea.College, projects: loadCategory(collegeContext) }],
  [ProjectArea.Personal, { area: ProjectArea.Personal, projects: loadCategory(personalContext) }],
  [ProjectArea.Career, { area: ProjectArea.Career, projects: loadCategory(careerContext) }],
]);

export function getCategoryData(area: ProjectArea): CategoryData {
  return categories.get(area)!;
}

export function getProjectData(area: ProjectArea, slug: string): ProjectData | undefined {
  return getCategoryData(area).projects.find((p) => p.slug === slug);
}

export function getAllCategories(): CategoryData[] {
  return [...categories.values()];
}
```

- [ ] **Step 4: Install webpack types for require.context**

Run: `yarn add -D @types/webpack-env`

- [ ] **Step 5: Verify build compiles and data loads correctly**

Run: `yarn build`
Expected: Compiles without errors. JSON files are bundled.

Then run `yarn serve`, open the browser console, and temporarily add to `src/index.ts`:
```typescript
import { getCategoryData } from '@/data/loader';
import { ProjectArea } from '@/scenes/main-scene';
console.log('College data:', getCategoryData(ProjectArea.College));
```
Verify the console shows the expected project objects with correct `slug` and `title` fields. Remove the temporary console log after verifying.

- [ ] **Step 6: Commit**

```bash
git add src/data/ && git commit -m "Add project data types, loader, and sample data"
```

---

### Task 2: Router

**Files:**
- Create: `src/core/router.ts`

- [ ] **Step 1: Create the Route type and Router class**

The router parses URL paths into a `Route` object, manages `pushState`/`popstate`, and notifies a callback on navigation.

```typescript
// src/core/router.ts
import { ProjectArea } from '@/scenes/main-scene';

export type Route =
  | { type: 'home' }
  | { type: 'category'; area: ProjectArea }
  | { type: 'project'; area: ProjectArea; slug: string };

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
```

- [ ] **Step 2: Verify build compiles**

Run: `yarn build`
Expected: Compiles without errors. Router is not yet wired into the app.

- [ ] **Step 3: Commit**

```bash
git add src/core/router.ts && git commit -m "Add lightweight client-side router"
```

---

### Task 3: Webpack & HTML Cleanup

**Files:**
- Modify: `webpack.config.js`
- Modify: `index.html`

- [ ] **Step 1: Update webpack.config.js**

In `webpack.config.js`:
1. Remove the second `HtmlWebpackPlugin` entry (lines 43-46) that generates `404.html`:
```javascript
// REMOVE this block:
new HtmlWebpackPlugin({
  filename: '404.html',
  template: '404.html',
}),
```

2. Add a rule for image assets (PNG/JPG) so thumbnails and screenshots can be imported:
```javascript
// Add to module.rules array:
{
  test: /\.(png|jpg|jpeg|gif|webp)$/,
  type: 'asset/resource',
}
```

Note: The `404.html` source file itself is deleted in Task 16 (hosting migration cleanup).

- [ ] **Step 2: Remove SPA redirect script from index.html**

Remove the `<script>` block (lines 16-37) that handles the `?/` redirect from 404.html. The resulting index.html should be:

```html
<!DOCTYPE html>
<html lang="">

<head>
  <title>Tyler J Vezina</title>
  <link rel="icon" href="./assets/favicon.png" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      background-color: #2A2A2A;
      overflow: hidden;
    }
  </style>
</head>

</html>
```

- [ ] **Step 3: Verify dev server still works**

Run: `yarn serve`
Expected: Site loads at http://localhost:8080 with the existing solar system animation. No console errors. Navigating to http://localhost:8080/college should still load the page (webpack dev server's `historyApiFallback: true` handles this).

- [ ] **Step 4: Commit**

```bash
git add webpack.config.js index.html && git commit -m "Remove 404.html SPA hack, add image asset loader"
```

---

### Task 4: Wire Router into App

**Files:**
- Modify: `src/core/app.ts`

- [ ] **Step 1: Import Router and create instance in App constructor**

In `src/core/app.ts`:
- Import `Router` and `Route`
- Add a `router` property
- Create the Router in the constructor, replacing the manual `popstate` listener
- Add a static accessor for the router
- The `onChange` callback is a placeholder for now (logs the route) — ViewManager integration comes in Chunk 2

```typescript
// Add to imports:
import Router, { Route, NavigationDirection } from '@/core/router';

// Add to App class:
static get router(): Router { return App.#instance.router; }
router: Router;

// In constructor, replace the popstate listener line with:
this.router = new Router(this.onRouteChanged.bind(this));

// Remove the old onWindowPopState method, add:
onRouteChanged(route: Route, direction: NavigationDirection): void {
  console.log('Route changed:', route, direction);
}
```

- [ ] **Step 2: Verify dev server works with routing**

Run: `yarn serve`
- Load http://localhost:8080 → console logs initial route (home)
- Load http://localhost:8080/college → console logs category route
- Use browser back → console logs back to home

- [ ] **Step 3: Commit**

```bash
git add src/core/app.ts && git commit -m "Wire router into App singleton"
```

---

## Chunk 2: Scene Restructuring

### File Map — Chunk 2

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/view/star-field.ts` | Star field rendering, twinkling, scrolling — camera-attached |
| Create | `src/view/home-view.ts` | Sun + orbiting polyhedra (extracted from MainView) |
| Create | `src/core/view-manager.ts` | View lifecycle, route-to-view mapping, transition orchestration |
| Modify | `src/scenes/main-scene.ts` | Replace MainView with ViewManager, attach star field to camera |
| Modify | `src/view/intro-animation.ts` | Update references for new star field location |
| Modify | `src/core/app.ts` | Connect router onChange to ViewManager |
| Delete | `src/view/main-view.ts` | Replaced by home-view.ts + star-field.ts |

---

### Task 5: Extract Star Field to Camera Rig

**Files:**
- Create: `src/view/star-field.ts`
- Modify: `src/view/main-view.ts` (remove star code)
- Modify: `src/scenes/main-scene.ts` (attach star field to camera)
- Modify: `src/view/intro-animation.ts` (update star references)

- [ ] **Step 1: Create StarField class**

Extract star generation and update logic from `MainView` into a standalone class. The star field will be attached to the camera so it stays fixed in screen space.

```typescript
// src/view/star-field.ts
import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three';

import App from '@/core/app';

export default class StarField extends Points {
  introAlphas: Float32Array;
  private baseColors: Float32Array;
  private twinkleSeeds: Float32Array;
  private twinkleSpeeds: Float32Array;

  constructor() {
    const starCount = 400;

    let seed = 0x8BADF00D;
    const rand = (): number => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    const minDist = 0.1;
    const minDistSq = minDist * minDist;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      let x = (rand() - 0.5) * 40;
      let y = (rand() - 0.5) * 16;
      for (let attempt = 0; attempt < 50; attempt++) {
        let tooClose = false;
        for (let j = 0; j < i; j++) {
          const dx = x - positions[j * 3];
          const dy = y - positions[j * 3 + 1];
          if (dx * dx + dy * dy < minDistSq) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) break;
        x = (rand() - 0.5) * 40;
        y = (rand() - 0.5) * 16;
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = -5;

      const brightness = 0.1 + rand() * 0.9;
      const tint = rand();
      let r: number, g: number, b: number;
      if (tint < 0.3) {
        r = brightness;
        g = brightness * (0.6 + rand() * 0.2);
        b = brightness * (0.3 + rand() * 0.2);
      } else if (tint < 0.6) {
        r = brightness * (0.5 + rand() * 0.2);
        g = brightness * (0.6 + rand() * 0.2);
        b = brightness;
      } else {
        r = brightness;
        g = brightness;
        b = brightness;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));

    super(geometry, new PointsMaterial({
      size: 1,
      sizeAttenuation: false,
      vertexColors: true,
    }));

    const baseColors = new Float32Array(colors);
    const twinkleSeeds = new Float32Array(starCount);
    const twinkleSpeeds = new Float32Array(starCount);
    for (let j = 0; j < starCount; j++) {
      twinkleSeeds[j] = rand() * Math.PI * 2;
      twinkleSpeeds[j] = 0.2 + rand() * 0.3;
    }
    const introAlphas = new Float32Array(starCount);

    this.baseColors = baseColors;
    this.twinkleSeeds = twinkleSeeds;
    this.twinkleSpeeds = twinkleSpeeds;
    this.introAlphas = introAlphas;
  }

  update(): void {
    const posAttr = this.geometry.getAttribute('position') as BufferAttribute;
    const colAttr = this.geometry.getAttribute('color') as BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    const time = App.clock.elapsedTime;
    const count = posAttr.count;

    const scrollSpeed = 0.2;

    for (let i = 0; i < count; i++) {
      positions[i * 3] -= scrollSpeed * App.deltaTime;
      if (positions[i * 3] < -20) {
        positions[i * 3] += 40;
      }

      const phase = time * this.twinkleSpeeds[i] + this.twinkleSeeds[i];
      const twinkle = 1 - 0.85 * Math.pow(Math.abs(Math.sin(phase)), 80);
      const alpha = this.introAlphas[i];
      colors[i * 3] = this.baseColors[i * 3] * twinkle * alpha;
      colors[i * 3 + 1] = this.baseColors[i * 3 + 1] * twinkle * alpha;
      colors[i * 3 + 2] = this.baseColors[i * 3 + 2] * twinkle * alpha;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}
```

- [ ] **Step 2: Update MainScene to own and camera-attach the star field**

In `src/scenes/main-scene.ts`:
- Import `StarField` from `@/view/star-field`
- Add `starField: StarField` property
- In `init()`, after creating the camera but before IntroAnimation, create the star field and attach to camera:

```typescript
// After titleText creation, before IntroAnimation:
this.starField = new StarField();
this.starField.position.z = -15; // Behind everything, relative to camera
App.camera.add(this.starField);
```

- Update the IntroAnimation constructor call to use the new star field:

```typescript
this.intro = new IntroAnimation(
  this.titleText,
  this.mainView.sun,
  this.mainView.anchorList,
  this.mainView.planetList,
  this.mainView.planetAnchorRoot,
  this.starField,           // was: this.mainView.stars
  this.starField.introAlphas, // was: this.mainView.starIntroAlphas
);
```

- In `update()`, add `this.starField.update()` before `this.mainView.update()`:

```typescript
update(): void {
  // ... intro logic unchanged ...
  this.starField.update();
  this.mainView.update();
  updateBehaviours(this);
}
```

- [ ] **Step 3: Remove star code from MainView**

In `src/view/main-view.ts`:
- Remove `stars`, `starIntroAlphas`, `starBaseColors`, `starTwinkleSeeds`, `starTwinkleSpeeds` properties
- Remove all star generation code from `init()`
- Remove `updateStars()` method
- Remove `this.add(this.stars, ...)` — only add sun, planetAnchorRoot, and planets

- [ ] **Step 4: Update IntroAnimation for new star field reference**

In `src/view/intro-animation.ts`: the constructor already takes `stars: Points` and `starIntroAlphas: Float32Array` as parameters. Now `MainScene` passes `this.starField` and `this.starField.introAlphas` instead of `this.mainView.stars` and `this.mainView.starIntroAlphas`.

- [ ] **Step 5: Verify visually**

Run: `yarn serve`
Expected: Site looks and behaves identically to before — stars twinkle, scroll, and fade in during intro. The only difference is architectural (stars are now camera-attached).

- [ ] **Step 6: Commit**

```bash
git add src/view/star-field.ts src/scenes/main-scene.ts src/view/main-view.ts src/view/intro-animation.ts && git commit -m "Extract star field to camera rig"
```

---

### Task 6: Refactor MainView → HomeView

**Files:**
- Create: `src/view/home-view.ts`
- Delete: `src/view/main-view.ts`
- Modify: `src/scenes/main-scene.ts`

- [ ] **Step 1: Rename and refactor MainView to HomeView**

Copy the Task 5-modified `src/view/main-view.ts` (with star code already removed) to `src/view/home-view.ts`, then:
- Rename `MainView` class to `HomeView`
- The `Planet` class stays as an inner class of this file
- Keep `inputEnabled` and `setInputEnabled` as module-scoped exports
- Export the `Planet` class (it will be needed by transitions later)

- [ ] **Step 2: Update MainScene imports**

In `src/scenes/main-scene.ts`: change import from `MainView` to `HomeView`, update property name from `mainView` to `homeView`, and update all references.

- [ ] **Step 3: Delete main-view.ts**

Remove `src/view/main-view.ts`.

- [ ] **Step 4: Verify visually**

Run: `yarn serve`
Expected: Identical behavior. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/view/home-view.ts src/scenes/main-scene.ts && git rm src/view/main-view.ts && git commit -m "Rename MainView to HomeView"
```

---

### Task 7: Create ViewManager

**Files:**
- Create: `src/core/view-manager.ts`
- Modify: `src/scenes/main-scene.ts`
- Modify: `src/core/app.ts`

- [ ] **Step 1: Create ViewManager class**

The ViewManager maps routes to views, manages view lifecycle, and will eventually orchestrate transitions. For now, it handles the HomeView and stubs out CategoryGridView and ProjectPageView.

```typescript
// src/core/view-manager.ts
import { Object3D } from 'three';

import { Route, NavigationDirection } from '@/core/router';
import { HomeView, setInputEnabled } from '@/view/home-view';

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
    // Transition logic will be added in Chunk 3
  }

  update(): void {
    this.homeView.update();
  }
}
```

- [ ] **Step 2: Integrate ViewManager into MainScene**

In `src/scenes/main-scene.ts`:
- Replace `homeView: HomeView` property with `viewManager: ViewManager`
- In `init()`: create ViewManager instead of HomeView directly, add to scene
- Update IntroAnimation constructor to access homeView through ViewManager:

```typescript
this.viewManager = new ViewManager();
this.add(this.viewManager);

// IntroAnimation now references through viewManager:
this.intro = new IntroAnimation(
  this.titleText,
  this.viewManager.homeView.sun,
  this.viewManager.homeView.anchorList,
  this.viewManager.homeView.planetList,
  this.viewManager.homeView.planetAnchorRoot,
  this.starField,
  this.starField.introAlphas,
);
```

- In `update()`, replace `this.homeView.update()` with `this.viewManager.update()`

- [ ] **Step 3: Wire router to ViewManager in App**

In `src/core/app.ts`, update `onRouteChanged` to forward to the scene's ViewManager:

```typescript
onRouteChanged(route: Route, direction: NavigationDirection): void {
  this.scene.viewManager.onRouteChanged(route, direction);
}
```

- [ ] **Step 4: Verify visually**

Run: `yarn serve`
Expected: Identical behavior. Navigating to /college logs in console.

- [ ] **Step 5: Commit**

```bash
git add src/core/view-manager.ts src/scenes/main-scene.ts src/core/app.ts && git commit -m "Add ViewManager, integrate with MainScene and router"
```

---

## Chunk 3: Category Grid Views

### File Map — Chunk 3

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/view/grid/grid-geometry.ts` | Generate square, triangle, and hexagonal grid geometries |
| Create | `src/view/grid/grid-cell.ts` | Single grid cell: prism mesh with project thumbnail + title |
| Create | `src/view/category-grid-view.ts` | Grid layout, panning, project data binding |
| Create | `src/view/transition/camera-transition.ts` | Camera zoom animation helper |
| Create | `src/view/transition/unfold-transition.ts` | Polyhedron unfold/refold animation |
| Modify | `src/core/view-manager.ts` | Orchestrate home↔category transitions |
| Modify | `src/view/home-view.ts` | Expose planet click handler, expose planet world positions |

---

### Task 8: Grid Geometry Generator

**Files:**
- Create: `src/view/grid/grid-geometry.ts`

- [ ] **Step 1: Create grid position generators**

Each generator returns an array of 2D cell positions (center of each cell) for a given grid type. The unfold animation will use these positions as targets.

```typescript
// src/view/grid/grid-geometry.ts
import { Vector2 } from 'three';

import { ProjectArea } from '@/scenes/main-scene';

export interface GridLayout {
  /** Center positions of each cell in local 2D space */
  positions: Vector2[];
  /** Cell size (width for square, side length for tri/hex) */
  cellSize: number;
  /** Number of sides per cell shape (4=square, 3=tri, 6=hex) */
  sides: number;
}

/**
 * Generate a square grid centered at origin.
 * @param count Number of cells to generate (fills outward from center in spiral)
 * @param cellSize Width/height of each cell
 */
export function generateSquareGrid(count: number, cellSize: number): GridLayout {
  const positions: Vector2[] = [];
  // Spiral outward from center
  positions.push(new Vector2(0, 0));
  let x = 0, y = 0, dx = 1, dy = 0, steps = 1, stepsTaken = 0, turns = 0;
  while (positions.length < count) {
    x += dx;
    y += dy;
    positions.push(new Vector2(x * cellSize, y * cellSize));
    stepsTaken++;
    if (stepsTaken >= steps) {
      stepsTaken = 0;
      turns++;
      [dx, dy] = [-dy, dx]; // turn left
      if (turns % 2 === 0) steps++;
    }
  }
  return { positions, cellSize, sides: 4 };
}

/**
 * Generate a triangular grid centered at origin.
 * @param count Number of cells to generate
 * @param cellSize Side length of each triangle
 */
export function generateTriangleGrid(count: number, cellSize: number): GridLayout {
  const positions: Vector2[] = [];
  const h = cellSize * Math.sqrt(3) / 2;
  // Generate in rings outward from center
  positions.push(new Vector2(0, 0));
  let ring = 1;
  while (positions.length < count) {
    for (let i = 0; i < ring * 6 && positions.length < count; i++) {
      const angle = (i / (ring * 6)) * Math.PI * 2;
      const px = Math.cos(angle) * ring * cellSize * 0.6;
      const py = Math.sin(angle) * ring * h * 0.6;
      positions.push(new Vector2(px, py));
    }
    ring++;
  }
  return { positions, cellSize, sides: 3 };
}

/**
 * Generate a hexagonal grid centered at origin using axial coordinates.
 * @param count Number of cells to generate
 * @param cellSize Hex radius (center to vertex)
 */
export function generateHexGrid(count: number, cellSize: number): GridLayout {
  const positions: Vector2[] = [];
  const sqrt3 = Math.sqrt(3);
  // Ring-based hex generation (axial coordinates)
  positions.push(new Vector2(0, 0));
  let ring = 1;
  while (positions.length < count) {
    // Walk the 6 edges of each ring
    let q = ring, r = 0;
    const directions = [
      [-1, 1], [-1, 0], [0, -1],
      [1, -1], [1, 0], [0, 1],
    ];
    for (const [dq, dr] of directions) {
      for (let step = 0; step < ring && positions.length < count; step++) {
        const px = cellSize * (3 / 2 * q);
        const py = cellSize * (sqrt3 / 2 * q + sqrt3 * r);
        positions.push(new Vector2(px, py));
        q += dq;
        r += dr;
      }
    }
    ring++;
  }
  return { positions, cellSize, sides: 6 };
}

export function generateGridForCategory(area: ProjectArea, count: number, cellSize: number): GridLayout {
  switch (area) {
    case ProjectArea.College: return generateSquareGrid(count, cellSize);
    case ProjectArea.Personal: return generateTriangleGrid(count, cellSize);
    case ProjectArea.Career: return generateHexGrid(count, cellSize);
  }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `yarn build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/view/grid/grid-geometry.ts && git commit -m "Add grid geometry generators (square, triangle, hex)"
```

---

### Task 9: Grid Cell and Category Grid View

**Files:**
- Create: `src/view/grid/grid-cell.ts`
- Create: `src/view/category-grid-view.ts`

- [ ] **Step 1: Create GridCell class**

Each cell is a wireframe prism (with depth along Z) displaying a project thumbnail and title. The prism shape matches the grid type (square, triangle, or hexagon).

```typescript
// src/view/grid/grid-cell.ts
import { BoxGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, Object3D, Shape, ExtrudeGeometry } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Text from '@/objects/text';
import Wireframe from '@/objects/wireframe';
import { ProjectData } from '@/data/types';

const PRISM_DEPTH = 0.3;

function createPrismGeometry(sides: number, cellSize: number): ExtrudeGeometry | BoxGeometry {
  if (sides === 4) {
    return new BoxGeometry(cellSize * 0.95, cellSize * 0.95, PRISM_DEPTH);
  }
  // Triangle or hexagon
  const shape = new Shape();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * cellSize * 0.45;
    const y = Math.sin(angle) * cellSize * 0.45;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: PRISM_DEPTH, bevelEnabled: false });
}

export default class GridCell extends Object3D {
  project: ProjectData;
  prism: Wireframe;
  label: Text;

  constructor(project: ProjectData, sides: number, cellSize: number, color: NeonColor) {
    super();

    this.project = project;

    const geometry = createPrismGeometry(sides, cellSize);
    this.prism = new Wireframe(geometry, { color });
    this.add(this.prism);

    this.label = new Text(project.title, App.synthaFont, { color, size: cellSize * 0.08 });
    this.label.position.z = PRISM_DEPTH / 2 + 0.01;
    this.add(this.label);
  }
}
```

- [ ] **Step 2: Create CategoryGridView class**

The view lays out GridCells according to the grid geometry, handles click-drag panning, and dispatches click events on cells.

```typescript
// src/view/category-grid-view.ts
import { Object3D, Vector2 } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { ProjectArea } from '@/scenes/main-scene';
import { getCategoryData } from '@/data/loader';
import { ProjectData } from '@/data/types';
import GridCell from '@/view/grid/grid-cell';
import { generateGridForCategory, GridLayout } from '@/view/grid/grid-geometry';

const CATEGORY_COLORS: Record<ProjectArea, NeonColor> = {
  [ProjectArea.College]: NeonColor.Orange,
  [ProjectArea.Personal]: NeonColor.Green,
  [ProjectArea.Career]: NeonColor.Cyan,
};

export default class CategoryGridView extends Object3D {
  area: ProjectArea;
  cells: GridCell[] = [];
  layout: GridLayout;

  private isPanning = false;
  private panStart = new Vector2();
  private dragDistance = 0;

  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private onClick: (e: MouseEvent) => void;

  constructor(area: ProjectArea) {
    super();
    this.area = area;

    const data = getCategoryData(area);
    const color = CATEGORY_COLORS[area];
    const cellSize = 1; // ~10 cells across screen width (VIEW_WIDTH = 10)

    this.layout = generateGridForCategory(area, data.projects.length, cellSize);

    for (let i = 0; i < data.projects.length; i++) {
      const cell = new GridCell(data.projects[i], this.layout.sides, cellSize, color);
      cell.position.set(this.layout.positions[i].x, this.layout.positions[i].y, 0);
      this.cells.push(cell);
      this.add(cell);
    }

    // Panning handlers — bound so they can be removed later
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onClick = this.handleClick.bind(this);
  }

  enableInput(): void {
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('click', this.onClick);
  }

  disableInput(): void {
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('click', this.onClick);
  }

  private handlePointerDown(e: PointerEvent): void {
    this.isPanning = true;
    this.dragDistance = 0;
    this.panStart.set(e.clientX, e.clientY);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.isPanning) return;
    const dx = (e.clientX - this.panStart.x) / App.width * 10; // scale to world units
    const dy = -(e.clientY - this.panStart.y) / App.height * 10;
    this.dragDistance += Math.abs(e.clientX - this.panStart.x) + Math.abs(e.clientY - this.panStart.y);
    this.position.x += dx;
    this.position.y += dy;
    this.panStart.set(e.clientX, e.clientY);
  }

  private handlePointerUp(): void {
    this.isPanning = false;
  }

  private handleClick(): void {
    if (this.dragDistance > 5) return; // Suppress clicks after drag (threshold in pixels)
    // Raycaster is already set from camera each frame in App.draw()
    for (const cell of this.cells) {
      const intersects = App.raycaster.intersectObject(cell, true);
      if (intersects.length > 0) {
        this.onCellClicked(cell);
        return;
      }
    }
  }

  private onCellClicked(cell: GridCell): void {
    // Navigate to project page — wired in transition task
    console.log('Cell clicked:', cell.project.slug);
  }

  dispose(): void {
    this.disableInput();
    // Dispose geometries and materials
    for (const cell of this.cells) {
      cell.prism.geometry.dispose();
      cell.prism.lineMaterial.dispose();
      cell.prism.fillMaterial?.dispose();
    }
  }
}
```

- [ ] **Step 3: Verify build compiles**

Run: `yarn build`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/view/grid/grid-cell.ts src/view/category-grid-view.ts && git commit -m "Add GridCell and CategoryGridView"
```

---

### Task 10: Home ↔ Category Transition

**Files:**
- Create: `src/view/transition/camera-transition.ts`
- Modify: `src/core/view-manager.ts`
- Modify: `src/view/home-view.ts`

- [ ] **Step 1: Create CameraTransition helper**

Animates the orthographic camera position from current to target with easing.

```typescript
// src/view/transition/camera-transition.ts
import { Vector3 } from 'three';

import App from '@/core/app';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default class CameraTransition {
  private start: Vector3;
  private end: Vector3;
  private duration: number;
  private elapsed = 0;
  private _isComplete = false;

  get isComplete(): boolean { return this._isComplete; }

  constructor(target: Vector3, duration: number) {
    this.start = App.camera.position.clone();
    this.end = target;
    this.duration = duration;
  }

  update(): void {
    if (this._isComplete) return;

    this.elapsed += App.deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = easeInOutCubic(t);

    App.camera.position.lerpVectors(this.start, this.end, eased);

    if (t >= 1) {
      App.camera.position.copy(this.end);
      this._isComplete = true;
    }
  }
}
```

- [ ] **Step 2: Add planet click handling to HomeView**

In `src/view/home-view.ts`, add click detection to `Planet.update()`. When a planet is clicked and input is enabled, emit a callback. Add an `onPlanetClicked` callback property to HomeView:

```typescript
// Add to HomeView class:
onPlanetClicked: ((area: ProjectArea) => void) | null = null;

// In Planet.update(), after hover detection:
if (isHovered && inputEnabled) {
  // Check for click via a flag set by HomeView
  if (this.wasClicked) {
    this.wasClicked = false;
    // Callback handled by HomeView
  }
}
```

The actual click registration uses a `pointerup` listener on the window, checking raycaster intersection. Add to HomeView:

```typescript
// In HomeView, add click listener in init():
window.addEventListener('click', () => {
  if (!inputEnabled) return;
  for (const planet of this.planetList) {
    if (App.raycaster.intersectObject(planet, true).length > 0) {
      this.onPlanetClicked?.(planet.area);
      return;
    }
  }
});
```

- [ ] **Step 3: Wire transitions in ViewManager**

Update `ViewManager.onRouteChanged` to:
1. On `home` → `category`: Start camera zoom toward the clicked planet's world position. Create and cache the CategoryGridView. After zoom completes, the unfold animation would play (stubbed for now — just show the grid immediately).
2. On `category` → `home`: Reverse — hide grid, zoom camera back.

```typescript
// In view-manager.ts, add:
import { Vector3 } from 'three';

import CameraTransition from '@/view/transition/camera-transition';
import CategoryGridView from '@/view/category-grid-view';
import { ProjectArea } from '@/scenes/main-scene';

// Properties:
private categoryViews = new Map<ProjectArea, CategoryGridView>();
private activeTransition: CameraTransition | null = null;
private activeCategory: ProjectArea | null = null;

// In constructor, wire planet click:
this.homeView.onPlanetClicked = (area) => {
  App.router.navigate({ type: 'category', area });
};

// onRouteChanged:
onRouteChanged(route: Route, direction: NavigationDirection): void {
  if (route.type === 'category') {
    this.showCategory(route.area);
  } else if (route.type === 'home') {
    this.showHome();
  }
}

private showCategory(area: ProjectArea): void {
  // Get or create grid view
  if (!this.categoryViews.has(area)) {
    const gridView = new CategoryGridView(area);
    this.categoryViews.set(area, gridView);
    this.add(gridView);
  }
  const gridView = this.categoryViews.get(area)!;

  // Get planet world position as camera target
  const planet = this.homeView.planetList.find(p => p.area === area)!;
  const targetPos = planet.wireframe.position.clone();
  targetPos.z = App.camera.position.z; // Keep camera Z

  // Position grid at planet location
  gridView.position.copy(planet.wireframe.position);
  gridView.visible = true;
  gridView.enableInput();

  // Disable home input
  setInputEnabled(false);

  // Start camera zoom
  this.activeTransition = new CameraTransition(targetPos, 1.5);
  this.activeCategory = area;
}

private showHome(): void {
  // Hide active grid
  if (this.activeCategory) {
    const gridView = this.categoryViews.get(this.activeCategory);
    if (gridView) {
      gridView.visible = false;
      gridView.disableInput();
    }
  }

  // Zoom camera back to home position
  const homePos = new Vector3(0, 0, App.camera.position.z);
  this.activeTransition = new CameraTransition(homePos, 1.5);
  this.activeCategory = null;

  // Re-enable home input after transition
  // (simplified — ideally wait for transition to complete)
  setInputEnabled(true);
}

// Update method:
update(): void {
  this.activeTransition?.update();
  this.homeView.update();
}
```

- [ ] **Step 4: Verify visually**

Run: `yarn serve`
Expected: Clicking a planet zooms the camera toward it. A grid of cells appears at the planet's position. Clicking browser back zooms the camera back. The URL updates. Grid cells display project titles.

This will need iteration — positions, timing, and visual polish will be refined.

- [ ] **Step 5: Commit**

```bash
git add src/view/transition/camera-transition.ts src/core/view-manager.ts src/view/home-view.ts && git commit -m "Add home-to-category camera transition"
```

---

### Task 11: Polyhedron Unfold Animation (Stub)

**Files:**
- Create: `src/view/transition/unfold-transition.ts`
- Modify: `src/core/view-manager.ts`

- [ ] **Step 1: Create UnfoldTransition stub**

The full unfold animation (polyhedron faces hinging outward into a tiled net) is visually complex and will require significant iteration. Create the class structure with the key interface, but implement it as a simple fade-in initially. The animation refinement is an iteration task, not a structural one.

```typescript
// src/view/transition/unfold-transition.ts
import { Object3D } from 'three';

import App from '@/core/app';
import { ProjectArea } from '@/scenes/main-scene';

export default class UnfoldTransition {
  private elapsed = 0;
  private duration: number;
  private _isComplete = false;
  private target: Object3D;
  private reverse: boolean;

  get isComplete(): boolean { return this._isComplete; }

  constructor(target: Object3D, area: ProjectArea, reverse: boolean, duration = 1.5) {
    this.target = target;
    this.duration = duration;
    this.reverse = reverse;

    // Initial state
    if (!reverse) {
      this.target.visible = false;
    }
  }

  update(): void {
    if (this._isComplete) return;

    this.elapsed += App.deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);

    // Placeholder: simple fade via visibility toggle at midpoint
    // Real unfold animation (face hinging) replaces this during iteration
    if (!this.reverse) {
      this.target.visible = t > 0.1;
      this.target.scale.setScalar(Math.min(1, t * 1.2));
    } else {
      this.target.scale.setScalar(Math.max(0.001, 1 - t));
      if (t >= 0.9) this.target.visible = false;
    }

    if (t >= 1) {
      this._isComplete = true;
      if (!this.reverse) {
        this.target.scale.set(1, 1, 1);
        this.target.visible = true;
      }
    }
  }
}
```

The stub uses scale as a placeholder — the real unfold animation (faces hinging flat, net tiling outward) will replace this during iteration. The interface stays the same.

- [ ] **Step 2: Integrate into ViewManager transition flow**

Wire `UnfoldTransition` into `showCategory()` — after camera zoom completes, start the unfold. Update the `update()` method to sequence transitions.

- [ ] **Step 3: Verify visually**

Run: `yarn serve`
Expected: Click planet → camera zooms → grid scales in. Back → grid scales out → camera zooms back. Functional but visually placeholder.

- [ ] **Step 4: Commit**

```bash
git add src/view/transition/unfold-transition.ts src/core/view-manager.ts && git commit -m "Add unfold transition stub (scale placeholder)"
```

---

## Chunk 4: Project Pages, Back Navigation & Hosting

### File Map — Chunk 4

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/view/project-page-view.ts` | 3D project detail page rendering |
| Create | `src/view/transition/prism-push-transition.ts` | Grid cell push-through animation |
| Create | `src/view/back-button.ts` | In-scene clickable back navigation element |
| Modify | `src/core/view-manager.ts` | Add category↔project transitions, direct URL entry, back nav |
| Modify | `src/view/category-grid-view.ts` | Wire cell clicks to navigation |
| Modify | `src/core/app.ts` | Handle initial route on startup |
| Modify | `CLAUDE.md` | Update deployment docs |
| Delete | `404.html` | No longer needed |
| Delete | `.github/workflows/build-and-deploy.yml` | Replaced by Cloudflare Pages |

---

### Task 12: ProjectPageView

**Files:**
- Create: `src/view/project-page-view.ts`

- [ ] **Step 1: Create ProjectPageView class**

Renders project details in 3D using wireframe-aesthetic text, image planes, and clickable link buttons.

```typescript
// src/view/project-page-view.ts
import { Object3D, PlaneGeometry } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import { ProjectData } from '@/data/types';
import Text, { TextAlignX } from '@/objects/text';
import Wireframe, { WireframeType } from '@/objects/wireframe';

export default class ProjectPageView extends Object3D {
  project: ProjectData;

  constructor(project: ProjectData, color: NeonColor) {
    super();
    this.project = project;

    let yOffset = 2;

    // Title
    const title = new Text(project.title.toUpperCase(), App.synthaFont, {
      color,
      size: 0.3 * App.pixelRatio,
      alignX: TextAlignX.Left,
    });
    title.position.set(-3, yOffset, 0);
    this.add(title);
    yOffset -= 1;

    // Description
    if (project.description) {
      const desc = new Text(project.description, App.synthaFont, {
        color: NeonColor.White,
        size: 0.12 * App.pixelRatio,
        alignX: TextAlignX.Left,
      });
      desc.position.set(-3, yOffset, 0);
      this.add(desc);
      yOffset -= 0.8;
    }

    // Tags
    if (project.tags && project.tags.length > 0) {
      const tagText = new Text(project.tags.join(' · '), App.synthaFont, {
        color,
        size: 0.1 * App.pixelRatio,
        alignX: TextAlignX.Left,
      });
      tagText.position.set(-3, yOffset, 0);
      this.add(tagText);
      yOffset -= 0.6;
    }

    // Date
    if (project.date) {
      const dateText = new Text(project.date, App.synthaFont, {
        color: NeonColor.White,
        size: 0.1 * App.pixelRatio,
        alignX: TextAlignX.Left,
      });
      dateText.position.set(-3, yOffset, 0);
      this.add(dateText);
      yOffset -= 0.8;
    }

    // Screenshots — wireframe-bordered placeholder planes
    // Texture loading deferred to iteration (see iteration items at end of plan)
    if (project.screenshots) {
      for (const _screenshot of project.screenshots) {
        const plane = new PlaneGeometry(3, 2);
        const border = new Wireframe(plane, { color, type: WireframeType.Hollow });
        border.position.set(-1.5, yOffset - 1, 0);
        this.add(border);
        yOffset -= 2.5;
      }
    }

    // Action buttons (Play, Source)
    if (project.playUrl) {
      const playBtn = this.createButton('PLAY', color);
      playBtn.position.set(-3, yOffset, 0);
      playBtn.userData.url = project.playUrl;
      this.add(playBtn);
      yOffset -= 0.8;
    }

    if (project.sourceUrl) {
      const sourceBtn = this.createButton('SOURCE', color);
      sourceBtn.position.set(-3, yOffset, 0);
      sourceBtn.userData.url = project.sourceUrl;
      this.add(sourceBtn);
    }
  }

  private createButton(label: string, color: NeonColor): Object3D {
    const btn = new Object3D();
    const bg = new Wireframe(new PlaneGeometry(2, 0.5), { color, type: WireframeType.Hollow });
    const text = new Text(label, App.synthaFont, { color, size: 0.12 * App.pixelRatio });
    btn.add(bg, text);
    return btn;
  }

  dispose(): void {
    this.traverse((obj) => {
      if ('geometry' in obj && obj.geometry) {
        (obj as any).geometry.dispose();
      }
      if ('material' in obj && obj.material) {
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose());
        else (mat as any).dispose();
      }
    });
  }
}
```

This is a starting point — the layout will need visual iteration. The key interface (constructor takes ProjectData + color, `dispose()` for cleanup) is what matters for the ViewManager.

- [ ] **Step 2: Verify build compiles**

Run: `yarn build`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/view/project-page-view.ts && git commit -m "Add ProjectPageView with 3D content layout"
```

---

### Task 13: Category ↔ Project Transition

**Files:**
- Create: `src/view/transition/prism-push-transition.ts`
- Modify: `src/view/category-grid-view.ts`
- Modify: `src/core/view-manager.ts`

- [ ] **Step 1: Create PrismPushTransition stub**

Like the unfold, the full prism-push animation (cell recedes, camera flies through gap) will need iteration. Create the class with the correct interface and a simple placeholder animation.

```typescript
// src/view/transition/prism-push-transition.ts
import { Vector3 } from 'three';

import App from '@/core/app';
import GridCell from '@/view/grid/grid-cell';

const PUSH_DEPTH = 5;

export default class PrismPushTransition {
  private cell: GridCell;
  private elapsed = 0;
  private duration: number;
  private reverse: boolean;
  private _isComplete = false;
  private startZ: number;

  get isComplete(): boolean { return this._isComplete; }

  constructor(cell: GridCell, reverse: boolean, duration = 1.0) {
    this.cell = cell;
    this.reverse = reverse;
    this.duration = duration;
    this.startZ = cell.prism.position.z;
  }

  update(): void {
    if (this._isComplete) return;

    this.elapsed += App.deltaTime;
    const t = Math.min(1, this.elapsed / this.duration);

    if (this.reverse) {
      this.cell.prism.position.z = this.startZ - PUSH_DEPTH * (1 - t);
    } else {
      this.cell.prism.position.z = this.startZ - PUSH_DEPTH * t;
    }

    if (t >= 1) {
      this._isComplete = true;
    }
  }
}
```

- [ ] **Step 2: Wire cell clicks in CategoryGridView to navigate**

In `src/view/category-grid-view.ts`, update `onCellClicked` to call the router:

```typescript
// Add callback property:
onProjectClicked: ((project: ProjectData) => void) | null = null;

private onCellClicked(cell: GridCell): void {
  this.onProjectClicked?.(cell.project);
}
```

- [ ] **Step 3: Add project page management to ViewManager**

In `src/core/view-manager.ts`:
- Handle `route.type === 'project'`: create `ProjectPageView`, position it behind the grid, start prism-push transition + camera move
- Handle back from project to category: reverse transition, dispose ProjectPageView
- Wire `CategoryGridView.onProjectClicked` callback

- [ ] **Step 4: Verify visually**

Run: `yarn serve`
Expected: Click planet → grid appears → click cell → project page appears with title/description. Back button returns to grid. URLs update correctly.

- [ ] **Step 5: Commit**

```bash
git add src/view/transition/prism-push-transition.ts src/view/category-grid-view.ts src/core/view-manager.ts && git commit -m "Add category-to-project transition and ProjectPageView wiring"
```

---

### Task 14: Direct URL Entry

**Files:**
- Modify: `src/core/view-manager.ts`
- Modify: `src/core/app.ts`
- Modify: `src/scenes/main-scene.ts`

- [ ] **Step 1: Add initial route handling to ViewManager**

Add a method `initializeAtRoute(route: Route)` that builds the scene at the target state without animations:

```typescript
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
  // Create and cache grid view
  if (!this.categoryViews.has(area)) {
    const gridView = new CategoryGridView(area);
    this.categoryViews.set(area, gridView);
    this.add(gridView);
  }
  const gridView = this.categoryViews.get(area)!;

  // Get planet world position
  const planet = this.homeView.planetList.find((p) => p.area === area)!;
  const targetPos = planet.wireframe.position.clone();

  // Position grid at planet location, make visible
  gridView.position.copy(targetPos);
  gridView.visible = true;
  gridView.enableInput();

  // Position camera directly at grid (no animation)
  App.camera.position.x = targetPos.x;
  App.camera.position.y = targetPos.y;

  setInputEnabled(false);
  this.activeCategory = area;
}

private showProjectImmediate(area: ProjectArea, slug: string): void {
  const projectData = getProjectData(area, slug);
  if (!projectData) return;

  const color = CATEGORY_COLORS[area];
  const projectView = new ProjectPageView(projectData, color);

  // Position behind the grid
  const gridView = this.categoryViews.get(area);
  if (gridView) {
    projectView.position.copy(gridView.position);
    projectView.position.z -= PRISM_DEPTH + 1;
    gridView.disableInput();
  }

  projectView.visible = true;
  this.add(projectView);
  this.activeProjectView = projectView;

  // Move camera to project page position (no animation)
  App.camera.position.z = projectView.position.z + 10;
}
```

- [ ] **Step 2: Call initializeAtRoute from MainScene.init()**

In `src/scenes/main-scene.ts`, after creating the ViewManager:

```typescript
const initialRoute = App.router.route;
if (initialRoute.type !== 'home') {
  this.intro = null; // Skip intro animation
  this.viewManager.initializeAtRoute(initialRoute);
}
```

- [ ] **Step 3: Verify direct URL entry**

Run: `yarn serve`
- http://localhost:8080/ → intro animation plays normally
- http://localhost:8080/college → grid appears immediately, no intro
- http://localhost:8080/personal/portfolio-website → project page appears immediately
- Browser back from project page → animates back to grid

- [ ] **Step 4: Commit**

```bash
git add src/core/view-manager.ts src/core/app.ts src/scenes/main-scene.ts && git commit -m "Support direct URL entry at any route"
```

---

### Task 15: In-Scene Back Navigation Element

**Files:**
- Create: `src/view/back-button.ts`
- Modify: `src/core/view-manager.ts`

- [ ] **Step 1: Create BackButton class**

A simple clickable wireframe element that appears during category and project views. Visual design is minimal — a wireframe arrow or "BACK" text that triggers `Router.navigate()` on click.

```typescript
// src/view/back-button.ts
import { Object3D } from 'three';

import App from '@/core/app';
import { NeonColor } from '@/core/neon-color';
import Text from '@/objects/text';

export default class BackButton extends Object3D {
  private text: Text;
  onClick: (() => void) | null = null;
  private clickHandler: () => void;

  constructor() {
    super();

    this.text = new Text('< BACK', App.synthaFont, {
      color: NeonColor.White,
      size: 0.15 * App.pixelRatio,
    });
    this.add(this.text);

    this.clickHandler = (): void => {
      if (!this.visible) return;
      const intersects = App.raycaster.intersectObject(this, true);
      if (intersects.length > 0) {
        this.onClick?.();
      }
    };
  }

  enable(): void {
    window.addEventListener('click', this.clickHandler);
  }

  disable(): void {
    window.removeEventListener('click', this.clickHandler);
  }
}
```

- [ ] **Step 2: Add BackButton to ViewManager**

Create a BackButton instance attached to the camera (like title text). Show/hide based on current view. Wire `onClick` to navigate back.

- [ ] **Step 3: Verify visually**

Run: `yarn serve`
Expected: "< BACK" text appears in the scene when viewing a category or project page. Clicking it navigates back with animation.

- [ ] **Step 4: Commit**

```bash
git add src/view/back-button.ts src/core/view-manager.ts && git commit -m "Add in-scene back navigation button"
```

---

### Task 16: Hosting Migration Cleanup

**Files:**
- Delete: `404.html`
- Delete: `.github/workflows/build-and-deploy.yml`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove 404.html**

```bash
git rm 404.html
```

- [ ] **Step 2: Remove GitHub Actions workflow**

```bash
git rm .github/workflows/build-and-deploy.yml
```

- [ ] **Step 3: Update CLAUDE.md deployment section**

Replace the Deployment section with:

```markdown
## Deployment

- Hosted on Cloudflare Pages (auto-deploys on push to `main`)
- Build command: `yarn build`, output: `dist/`
- SPA routing: all paths serve `index.html`
- Develop on the `dev` branch
- `yarn build` uses `--mode production` (minified, tree-shaken); `yarn serve` uses the `development` mode from webpack.config.js
```

Update the DNS & Hosting section:

```markdown
## DNS & Hosting

- Domain registered with Squarespace Domains, nameservers pointed to Cloudflare
- Hosted on Cloudflare Pages — auto-deploys from GitHub repo
- Cloudflare manages DNS and hosting in one place
- Clean URL routing handled natively by Cloudflare Pages SPA mode
```

- [ ] **Step 4: Verify build still works**

Run: `yarn build`
Expected: Builds successfully. `dist/` does not contain `404.html`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Remove GitHub Pages artifacts, update docs for Cloudflare Pages"
```

**Note:** The actual Cloudflare Pages project setup (connecting GitHub repo, configuring build, updating DNS) is done through the Cloudflare dashboard, not in code. This should be done when merging to `main` for the first time after this work.

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Foundation | 1-4 | Project data layer, router, webpack cleanup, App integration |
| 2: Scene Restructuring | 5-7 | Star field on camera, HomeView, ViewManager |
| 3: Category Grid | 8-11 | Grid geometry, GridCell, CategoryGridView, camera transitions, unfold stub |
| 4: Project Pages & Polish | 12-16 | ProjectPageView, prism-push, direct URL entry, back button, hosting cleanup |

**After each chunk:** Verify with `yarn serve` that existing functionality is preserved and new features work. Commit frequently — each task produces a working, deployable state.

**Iteration items** (not in this plan — separate work after the structure is in place):
- Polyhedron unfold animation (replace scale stub with face-hinge animation)
- Prism-push animation polish (cell recession, camera fly-through)
- Tumble deceleration during category transition
- Grid cell hover effects
- Project page visual layout refinement
- Screenshot texture loading and display
- Button click handling (open URLs in new tab)
- Responsive adjustments for mobile
