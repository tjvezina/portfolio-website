# Portfolio Website

Personal portfolio site built with Three.js, TypeScript, and webpack. Hosted on GitHub Pages at https://tylerjvezina.com/.

## Commands

- `yarn` — install dependencies
- `yarn serve` — dev server on http://localhost:8080/ with hot reload
- `yarn build` — webpack build to `./dist/`
- Lint: no standalone script; ESLint config is in `.eslintrc`

## Architecture

- **Entry:** `src/index.ts` → `App` singleton (`src/core/app.ts`) manages renderer, camera, scene, and frame loop
- **Rendering:** Orthographic camera, wireframe aesthetic with selective bloom (see Rendering Pipeline below)
- **Scenes/Views:** `scenes/` for Three.js Scenes, `view/` for visual compositions within a scene
- **Objects:** Reusable 3D object classes in `objects/` (Text, Wireframe, WireframeText, ShatterIcosa)
- **Behaviours:** Frame-updated components attached via `Object3D.userData.behaviours` — see `behaviours/behaviour.ts` base class
- **Utilities:** `utils/` for helpers (assertions, scene traversal)
- **Path alias:** `@/*` maps to `src/*` (configured in both tsconfig and webpack)

## Rendering Pipeline

Two-pass selective bloom so image assets (thumbnails) render clean while wireframes get neon glow:

1. **Clean pass** (layer 0): Thumbnails, visible fills, stars — rendered directly via `renderer.render()`
2. **Bloom pass** (`BLOOM_LAYER`): Wireframe lines, text, black fills — rendered via `EffectComposer` with `BloomEffect`, composited on top using **additive blending**

**Why additive blending:** Alpha compositing failed because the `postprocessing` bloom shader outputs alpha=1 everywhere, making the bloom pass fully opaque. Additive sidesteps this — black adds nothing, bloom glow adds on top.

**Fill mesh strategy** (`Wireframe` class creates three meshes):
- Wireframe line segments → `BLOOM_LAYER` only
- Visible fill (black/colored) → layer 0 (rendered in clean pass)
- Black fill → `BLOOM_LAYER` at `renderOrder: -1` (occludes stars and backface edges within the bloom pass; black contributes nothing in additive composite)

**Stars** render in the bloom pass at `renderOrder: -2` (before fills), so black fills correctly cover them where geometry exists.

## Code Style

Enforced by `.eslintrc` — key rules:
- 2-space indent, always semicolons, trailing commas on multiline
- Explicit return types on all functions
- `simple-import-sort` for import ordering
- Interfaces use `;` delimiters, type aliases use `,`
- TypeScript strict: `strictNullChecks`, `noImplicitAny`, `noImplicitOverride`

## Deployment

- Hosted on Cloudflare Pages (auto-deploys on push to `main`)
- Build command: `yarn build`, output: `dist/`
- SPA routing: all paths serve `index.html`
- Develop on the `dev` branch
- `yarn build` uses `--mode production` (minified, tree-shaken); `yarn serve` uses the `development` mode from webpack.config.js

## DNS & Hosting

- Domain registered with Squarespace Domains, nameservers pointed to Cloudflare
- Hosted on Cloudflare Pages — auto-deploys from GitHub repo
- Cloudflare manages DNS and hosting in one place
- Clean URL routing handled natively by Cloudflare Pages SPA mode

## Key Decisions

- No test framework — solo visual project, manual verification only
- SPA routing via Cloudflare Pages (all paths serve `index.html`)
- Browser-only target (`node: false` in ESLint env)
- Viewer experience is the top priority — cross-device/browser compatibility matters
