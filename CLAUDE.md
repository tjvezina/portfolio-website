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

- Pushes to `main` auto-deploy via GitHub Actions (`.github/workflows/build-and-deploy.yml`)
- Develop on the `dev` branch
- `yarn build` uses `--mode production` (minified, tree-shaken); `yarn serve` uses the `development` mode from webpack.config.js

## DNS & Hosting

- Domain registered with Squarespace Domains, nameservers pointed to Cloudflare
- Cloudflare manages all DNS: A records for root domain → GitHub Pages IPs, tunnel CNAMEs for home server access
- Cloudflare SSL/TLS mode: "Full" (not "strict" — GitHub Pages cert doesn't validate for custom domain through Cloudflare proxy)
- Squarespace DNS records are inactive (still exist but nameservers bypass them)

## Key Decisions

- No test framework — solo visual project, manual verification only
- SPA routing on GitHub Pages via `404.html` redirect trick
- Browser-only target (`node: false` in ESLint env)
- Viewer experience is the top priority — cross-device/browser compatibility matters
