# Portfolio Website — Design Spec

## Purpose

A game development portfolio that is itself a showcase piece. The entire site is a Three.js experience with a neon wireframe aesthetic — no traditional HTML pages. Visitors browse projects across three categories, launch playable browser demos, and view screenshots/videos. The visual craft demonstrates the author's graphics programming skills.

**Audience:** Friends, family, potential employers — often one-time visitors. First impression matters.

## Site Map

```
/                       Home — solar system with orbiting polyhedra
/college                Square grid (cube unfold) — closed category
/college/:slug          Project page within College
/personal               Triangle grid (octahedron unfold) — ongoing
/personal/:slug         Project page within Personal
/career                 Hexagonal grid (icosahedron unfold) — ongoing
/career/:slug           Project page within Career
```

Three levels of depth: Home → Category Grid → Project Page. All within one continuous Three.js scene.

## Architecture

### Single Scene

One Three.js Scene for the entire site. The existing `MainScene` class (which extends `Scene` and owns the renderer, camera, and bloom post-processing) remains the top-level container. A new `ViewManager` component is added within `MainScene` to handle view lifecycle, transitions, and route-to-view mapping. The existing `MainView` evolves into `HomeView`. Views are Object3D groups managed by the ViewManager. Camera movement drives navigation — objects stay in world space. The solar system persists even when the camera has zoomed past it.

### Camera Rig

Stars and title text ("TYLER J VEZINA") are fixed to the camera, not the world. When the camera zooms toward a planet, the stars remain as a fixed backdrop — like real stars when moving through space. Orthographic projection throughout, so no perspective distortion during camera movement.

The camera rig is the `OrthographicCamera` itself — fixed elements are attached directly to it (as the title text already is). Camera zoom is implemented by translating the camera in world space; the orthographic frustum size stays constant, so objects grow/shrink as the camera moves toward/away from them.

**Migration note:** The title text is already attached to the camera in the current codebase. The star field currently lives in `MainView` (world space) with manual scrolling logic and must be reparented to the camera. This changes the star system's update logic — scrolling/wrapping coordinates change meaning when the coordinate system is camera-relative rather than world-relative. This rework is a prerequisite for the camera-zoom navigation.

### Views

- **HomeView** — Sun + three orbiting polyhedra. Created once at startup, persists always. Hidden only by being outside the camera frustum when zoomed in.
- **CategoryGridView** — Tiled project grid. One instance per category, created on first visit and cached for revisits. Grid type determined by category shape.
- **ProjectPageView** — Project detail page rendered in 3D. Created fresh each time, disposed when navigating away.

## Navigation

### In-App Navigation

- Click a planet → animated camera zoom + unfold transition to category grid
- Click a grid tile → animated prism-push + camera fly-through to project page
- In-scene clickable back element (visual design TBD) → reverse animation
- Browser back/forward buttons → trigger reverse/forward animations
- All transitions push to `history.pushState`

### Direct URL Entry

- `/` → full intro animation (sun scale, planet spiral, star wavefront, title slide)
- `/:category` → solar system built off-screen, camera positioned at grid, grid already unfolded, subtle fade-in
- `/:category/:slug` → solar system built off-screen, camera at project page, subtle fade-in
- Manual URL bar change → full page reload, treated as direct entry

### Router

Custom lightweight router — three route patterns, no library. Parses `location.pathname` on startup to determine initial view state. Listens to `popstate` for browser back/forward. Determines animation direction (forward vs. back) based on navigation depth.

## Transitions

### Home → Category Grid

1. Camera zooms toward the selected planet. Sun, other planets, and stars naturally leave the view frustum — nothing fades or is hidden explicitly.
2. As the planet fills the view, its tumble rotation decelerates and comes to rest on a face.
3. Polyhedron unfolds — the face the planet rested on becomes the first/central cell. Its neighboring faces hinge outward to lie flat beside it. Then their neighbors unfold, and so on.
4. The initial polyhedron doesn't have enough faces to fill the screen, so additional tiles appear by unfolding from behind their neighbors until the visible area is covered. Each cell populates with project thumbnail and title. Target density: roughly 10 cells across the screen width (exact scale tweakable).
5. Title text updates to category name. Input enabled for grid interaction.

**Unfold configuration:** Each shape uses a single hardcoded net — one fixed unfolding sequence chosen for visual appeal, not algorithmically generated.

**Reverse:** Grid collapses inward → faces fold back into polyhedron → camera zooms back out to home view. The solar system is exactly where it was left.

### Category Grid → Project Page

1. Clicked tile pushes inward along Z — grid tiles are prisms with depth, not flat faces.
2. The receding prism opens a gap in the wall of tiles.
3. Camera flies through the gap to the space behind the grid.
4. Project page content is arranged behind the grid wall.

**Reverse:** Camera pulls back through gap → prism slides flush → grid intact. Exact visual details refinable during implementation.

### Grid Types by Category

- **College (Cube):** Unfolds into a square grid.
- **Personal (Octahedron):** Unfolds into a triangular grid.
- **Career (Icosahedron):** Unfolds into a triangular grid initially, then selected edges fade out to leave a hexagonal grid. (Each hexagon is formed from 6 triangles sharing a center vertex — removing the 3 internal edges of each pair of adjacent triangles produces the hex pattern.)

### Grid Interaction

Each category grid displays project tiles with minimal content: icon/thumbnail + title. The grid is a free-form pannable space — click+drag to navigate. This suits the non-rectangular grid shapes (triangles, hexagons) better than a linear scrolling list. Project discoverability in the open space is a known trade-off to monitor during implementation.

## Project Data

### Storage

JSON files in `src/data/{category}/`, one file per project. Webpack imports JSON at build time — no runtime fetching, no CMS.

```
src/data/
  college/
    senior-project.json
    graphics-engine.json
  personal/
    portfolio-website.json
    raytracer.json
  career/
    shipped-title.json
```

### Schema

```json
{
  "slug": "senior-project",
  "title": "Senior Capstone",
  "thumbnail": "senior-project.png",
  "description": "A 3D puzzle game...",
  "screenshots": ["screen1.png"],
  "playUrl": "https://...",
  "sourceUrl": "https://github.com/...",
  "tags": ["Unity", "C#", "3D"],
  "date": "2020-05"
}
```

Required fields: `slug`, `title`. All other fields are optional. The schema is flexible — fields can be added or removed as the site is populated. The slug doubles as the URL path segment and the filename.

### Project Page Content

When a project page is displayed, it renders whichever fields are present:

- Title (always)
- Short description/summary
- Screenshots (static images)
- Play/Launch button (opens browser-playable project in a new tab)
- Source code link (GitHub repo)
- Tags/tech stack
- Date/time period

Video support is out of scope for the initial build and can be added later.

**Image rendering approach:** Screenshots are rendered as texture-mapped planes within the Three.js scene — images loaded as textures and applied to flat wireframe-bordered geometry. This keeps everything within the WebGL pipeline and maintains the neon aesthetic (wireframe border around each image). No CSS3DRenderer or HTML overlay needed for the initial feature set.

## Hosting

### Migration: GitHub Pages → Cloudflare Pages

**Remove:**
- `404.html` redirect hack
- `index.html` redirect script
- GitHub Actions workflow (`.github/workflows/build-and-deploy.yml`)
- GitHub Pages configuration

**Add:**
- Cloudflare Pages project connected to the GitHub repo
- Build config: command `yarn build`, output directory `dist/`
- SPA routing: all paths serve `index.html`
- Update Cloudflare DNS: remove GitHub Pages A records (Pages handles routing)
- Update `CLAUDE.md` deployment documentation

**Rationale:** Cloudflare Pages provides native SPA routing (no 404.html hack needed for clean URLs), auto-deploys on push to `main`, and consolidates hosting with the existing Cloudflare DNS/domain setup. Free tier is sufficient.

**Workflow unchanged:** Develop on `dev` branch, merge to `main` to deploy.

## Open Design Decisions

These are intentionally deferred to implementation, where they can be resolved through iteration:

- **In-scene back element:** A clickable element triggers back navigation; its visual design (wireframe arrow, icon, text, etc.) is deferred.
- **Star field during zoom:** Stars are fixed to the camera, but fine-tuning of parallax or density changes during zoom is an implementation detail.
- **Category → Project transition polish:** The prism-push concept is established; exact timing, easing, and visual details will be refined.
- **Project page layout in 3D:** How text, images, and buttons are arranged spatially within the Three.js scene on a project page.
- **Grid panning discoverability:** If the open panning space makes projects hard to find, consider adding visual cues (minimap, edge indicators, or a subtle guide).
