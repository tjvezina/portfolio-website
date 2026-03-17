# Portfolio Website

Personal portfolio site built with Three.js, TypeScript, and webpack. Hosted on GitHub Pages at https://tylerjvezina.com/.

## Commands

- `yarn` — install dependencies
- `yarn serve` — dev server on http://localhost:8080/ with hot reload
- `yarn build` — webpack build to `./dist/`
- Lint: no standalone script; ESLint config is in `.eslintrc`

## Architecture

- **Entry:** `src/index.ts` → `App` singleton (`src/core/app.ts`) manages renderer, camera, scene, and frame loop
- **Rendering:** Orthographic camera, wireframe aesthetic with bloom post-processing (`postprocessing` library)
- **Scenes/Views:** `scenes/` for Three.js Scenes, `view/` for visual compositions within a scene
- **Objects:** Reusable 3D object classes in `objects/` (Text, Wireframe, WireframeText, ShatterIcosa)
- **Behaviours:** Frame-updated components attached via `Object3D.userData.behaviours` — see `behaviours/behaviour.ts` base class
- **Utilities:** `utils/` for helpers (assertions, scene traversal)
- **Path alias:** `@/*` maps to `src/*` (configured in both tsconfig and webpack)

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
