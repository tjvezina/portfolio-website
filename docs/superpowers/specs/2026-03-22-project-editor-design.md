# Project Editor Tool — Design Spec

A local web-based editor for creating and editing portfolio project entries (JSON files in `src/data/`), with image import support.

## Goals

- Visual form-based UI for managing projects without hand-editing JSON
- Browse all projects by category, add new entries, edit existing ones
- Import images from disk (thumbnail, screenshots) with automatic file placement and naming
- Single-command startup, zero friction for the developer

## Non-goals

- Not user-facing — this is a local dev tool, no auth or polish needed
- No image cropping/resizing in v1 (just copy as-is)
- No deployment — runs only on localhost

## Project structure

```
editor/
  package.json          # Deps: vite, react, react-dom, @types/react, @types/react-dom
  vite.config.ts        # Vite config with custom middleware plugin for file I/O
  tsconfig.json         # Own tsconfig for React JSX support (does not extend root, to avoid inheriting webpack-env types)
  index.html            # Vite entry HTML
  src/
    main.tsx            # React app entry point
    components/         # React components
    api.ts              # Client-side fetch wrappers for the file I/O API
  server/
    middleware.ts       # Vite plugin: REST API endpoints for file operations
```

The editor lives at the repo root in `editor/`, fully isolated from the production webpack build. A root-level script `yarn editor` runs `cd editor && npx vite` to start everything.

## Data model

The editor reads and writes `ProjectData` as defined in `src/data/types.ts`:

```typescript
interface ProjectData {
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
```

Projects are organized into three categories matching the `ProjectArea` enum: `college`, `personal`, `career`. Each project is a single JSON file at `src/data/<category>/<slug>.json`.

## API design

The Vite dev server exposes REST endpoints via a custom middleware plugin. All endpoints read/write directly to the filesystem using Node's `fs` module. The JSON files on disk are the sole source of truth.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/categories` | GET | List all categories with their projects |
| `/api/categories/:category/projects` | POST | Create a new project JSON file |
| `/api/categories/:category/projects/:slug` | PUT | Update an existing project's JSON file |
| `/api/categories/:category/projects/:slug` | DELETE | Delete a project's JSON file |
| `/api/images/import` | POST | Upload an image, copy it to the correct asset location |

### Request/response details

**GET `/api/categories`**
Returns an array of categories, each containing an array of project objects read from the corresponding JSON files.

```json
[
  {
    "area": "personal",
    "projects": [
      { "slug": "portfolio-website", "title": "Portfolio Website", ... }
    ]
  },
  ...
]
```

**POST `/api/categories/:category/projects`**
Body: `ProjectData` JSON (slug required). Creates `src/data/<category>/<slug>.json`. Returns 409 if file already exists.

**PUT `/api/categories/:category/projects/:slug`**
Body: `ProjectData` JSON. Overwrites `src/data/<category>/<slug>.json`. If the slug field in the body differs from the URL `:slug`, the server renames the JSON file and asset directory to match the new slug, and rewrites any image paths in the JSON. Returns 409 if the new slug's file already exists. If the old asset directory does not exist, the rename is skipped.

**DELETE `/api/categories/:category/projects/:slug`**
Deletes `src/data/<category>/<slug>.json` and its asset directory (`assets/projects/<category>/<slug>/`), if one exists.

**POST `/api/images/import`**
Multipart form upload with fields: `category`, `slug`, `type` (`thumbnail` or `screenshot`). Creates the asset directory (`assets/projects/<category>/<slug>/`) if it does not exist. Copies the uploaded file to the correct location. If importing a thumbnail and a previous thumbnail exists with a different extension, the old file is deleted first. Returns the path: `{ "path": "assets/projects/<category>/<slug>/thumbnail.png" }`.

### Error responses

All error responses use a consistent format: `{ "error": "<message>" }` with an appropriate HTTP status code (400 for bad input, 404 for not found, 409 for conflicts).

## Image asset convention

Images are stored in the root-level static assets directory (which `CopyWebpackPlugin` copies to `dist/` during the production build):

```
assets/projects/<category>/<slug>/
```

Naming:
- Thumbnail: `thumbnail.<ext>` (preserves original extension)
- Screenshots: `screenshot-1.<ext>`, `screenshot-2.<ext>`, etc.
- New screenshots always use the next available number (max existing + 1). Gaps from deleted screenshots are accepted, not renumbered.

The JSON `thumbnail` and `screenshots` fields store root-relative paths, e.g.:
- `"thumbnail": "assets/projects/personal/portfolio-website/thumbnail.png"`
- `"screenshots": ["assets/projects/personal/portfolio-website/screenshot-1.png"]`

These paths work directly as URLs in the production build since `CopyWebpackPlugin` copies `assets/` to `dist/assets/`.

On import, the server copies the selected file to the correct location with the conventional name.

In v1, images are copied as-is with no processing. Cropping/resizing can be added later as a step between file selection and save.

### Image preview serving

The editor's Vite middleware serves static files from the repo-root `assets/` directory under the `/assets/` URL path, so image previews in the editor UI can reference the same root-relative paths stored in the JSON.

## UI design

Single-page app with a two-panel layout:

### Left panel — Project list

- Category selector (dropdown or tabs) for College / Personal / Career
- Scrollable list of project titles for the selected category
- "New Project" button
- Clicking a project opens it in the right panel

### Right panel — Project form

Form fields mapped to `ProjectData`:

| Field | Control |
|---|---|
| Title | Text input |
| Slug | Text input (auto-generated from title for new projects, editable) |
| Description | Textarea |
| Date | Date input |
| Tags | Tag input (add/remove individual tags) |
| Play URL | Text input |
| Source URL | Text input |
| Thumbnail | Image preview + "Choose file" button (system file picker) |
| Screenshots | Multiple image previews + "Add screenshot" button |

Action buttons:
- **Save** — writes the project JSON to disk via PUT (or POST for new)
- **Delete** — removes the project with a confirmation prompt

### Styling

Minimal and functional. Basic custom CSS or a lightweight utility framework. This is a dev tool — clean defaults are sufficient.

## Tech stack

| Concern | Choice |
|---|---|
| Bundler / dev server | Vite |
| UI framework | React |
| Language | TypeScript |
| Server-side file I/O | Vite custom plugin middleware (Node `fs`) |
| Styling | Basic CSS (no framework in v1) |

## Startup

From the repo root:

```bash
yarn editor
```

This runs `cd editor && npx vite`, which starts the Vite dev server with the middleware plugin. The editor opens in the browser at `http://localhost:5173` (Vite's default port).
