# Project Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Vite + React editor app in `editor/` for CRUD operations on portfolio project JSON files and image assets.

**Architecture:** A Vite dev server with custom middleware handles file I/O (read/write JSON, copy images) via REST endpoints. A React SPA provides a two-panel UI (project list + form). The editor is fully isolated from the production webpack build.

**Tech Stack:** Vite, React, TypeScript, Node `fs` (via Vite middleware)

**Spec:** `docs/superpowers/specs/2026-03-22-project-editor-design.md`

**Testing:** This project has no test framework (per CLAUDE.md). Each task includes manual verification steps using the browser and curl.

---

## Chunk 1: Project Scaffold & Server Middleware

### Task 1: Scaffold the editor project

**Files:**
- Create: `editor/package.json`
- Create: `editor/tsconfig.json`
- Create: `editor/vite.config.ts`
- Create: `editor/index.html`
- Create: `editor/src/main.tsx`
- Create: `editor/src/App.tsx`
- Create: `editor/src/App.css`
- Modify: `package.json` (add `editor` script)
- Create: `editor/.gitignore`

- [ ] **Step 1: Create `editor/package.json`**

```json
{
  "name": "portfolio-editor",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "typescript": "^5.8.3",
    "vite": "^6.3.2"
  }
}
```

- [ ] **Step 2: Create `editor/tsconfig.json`**

Standalone tsconfig — does NOT extend root (to avoid `webpack-env` types).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src", "server"]
}
```

- [ ] **Step 3: Create `editor/vite.config.ts`**

Minimal config with React plugin. The middleware plugin will be added in Task 2.

```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});
```

- [ ] **Step 4: Create `editor/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portfolio Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `editor/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Create `editor/src/App.tsx`**

Placeholder shell that will be filled in later tasks.

```tsx
export default function App(): React.ReactElement {
  return (
    <div className="app">
      <h1>Portfolio Editor</h1>
      <p>Loading...</p>
    </div>
  );
}
```

- [ ] **Step 7: Create `editor/src/App.css`**

Minimal reset and layout styles.

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 16px;
}

.app h1 {
  font-size: 1.4rem;
  margin-bottom: 16px;
  color: #7c83ff;
}
```

- [ ] **Step 8: Add `editor` script to root `package.json`**

Add to the `"scripts"` object:
```json
"editor": "cd editor && yarn dev"
```

- [ ] **Step 9: Create `editor/.gitignore`**

```
node_modules
dist
```

- [ ] **Step 10: Install dependencies and verify**

```bash
cd editor && yarn install
cd .. && yarn editor
```

Verify: browser opens at `http://localhost:5173` showing "Portfolio Editor / Loading...".

- [ ] **Step 11: Commit**

```bash
git add editor/ package.json
git commit -m "Scaffold editor project with Vite + React"
```

---

### Task 2: Server middleware — GET /api/categories

**Files:**
- Create: `editor/server/middleware.ts`
- Modify: `editor/vite.config.ts` (register the middleware plugin)

**Context:** The middleware is a Vite plugin that intercepts requests to `/api/*` paths. It reads JSON files from `../src/data/<category>/` (relative to the editor directory). The valid categories are `college`, `personal`, `career` (matching the `ProjectArea` enum in `src/data/types.ts`).

- [ ] **Step 1: Create `editor/server/middleware.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

const CATEGORIES = ['college', 'personal', 'career'] as const;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');

function readProjectsInCategory(category: string): object[] {
  const dir = path.join(DATA_DIR, category);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
}

function sendJson(res: import('http').ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: import('http').ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function parseBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export default function editorApiPlugin(): Plugin {
  return {
    name: 'editor-api',
    configureServer(server: ViteDevServer) {
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };

      server.middlewares.use('/assets', (req, res, next) => {
        // Serve static files from repo-root assets/ for image previews
        const filePath = path.join(ASSETS_DIR, req.url ?? '');
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = mimeTypes[ext] ?? 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/')) return next();

        // GET /api/categories
        if (req.method === 'GET' && url === '/api/categories') {
          const result = CATEGORIES.map((area) => ({
            area,
            projects: readProjectsInCategory(area),
          }));
          return sendJson(res, 200, result);
        }

        next();
      });
    },
  };
}
```

- [ ] **Step 2: Register the plugin in `editor/vite.config.ts`**

```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import editorApiPlugin from './server/middleware';

export default defineConfig({
  plugins: [react(), editorApiPlugin()],
  server: {
    port: 5173,
    open: true,
  },
});
```

- [ ] **Step 3: Verify with curl**

```bash
yarn editor &
# Wait for server to start, then:
curl -s http://localhost:5173/api/categories | jq .
```

Expected: JSON array with three categories, each containing their projects read from the JSON files.

- [ ] **Step 4: Commit**

```bash
git add editor/server/ editor/vite.config.ts
git commit -m "Add server middleware with GET /api/categories endpoint"
```

---

### Task 3: Server middleware — project CRUD endpoints

**Files:**
- Modify: `editor/server/middleware.ts`

**Context:** Add POST (create), PUT (update), DELETE endpoints for projects. All operate on `src/data/<category>/<slug>.json`. PUT handles slug renames (file + asset directory rename). DELETE removes the JSON file and asset directory.

- [ ] **Step 1: Add route matching helper and category validation**

Add to middleware.ts, inside the `configureServer` middleware handler, after the GET /api/categories block:

```typescript
        // Route matching for /api/categories/:category/projects[/:slug]
        const projectMatch = url.match(
          /^\/api\/categories\/(college|personal|career)\/projects(?:\/([a-z0-9-]+))?$/,
        );
        if (!projectMatch) return next();

        const category = projectMatch[1];
        const slug = projectMatch[2]; // undefined for collection endpoints
        const categoryDir = path.join(DATA_DIR, category);
```

- [ ] **Step 2: Add POST /api/categories/:category/projects**

```typescript
        // POST /api/categories/:category/projects
        if (req.method === 'POST' && !slug) {
          const body = JSON.parse(await parseBody(req));
          if (!body.slug) return sendError(res, 400, 'slug is required');
          const filePath = path.join(categoryDir, `${body.slug}.json`);
          if (fs.existsSync(filePath)) return sendError(res, 409, 'Project already exists');
          fs.mkdirSync(categoryDir, { recursive: true });
          fs.writeFileSync(filePath, JSON.stringify(body, null, 2) + '\n');
          return sendJson(res, 201, body);
        }
```

- [ ] **Step 3: Add PUT /api/categories/:category/projects/:slug**

```typescript
        // PUT /api/categories/:category/projects/:slug
        if (req.method === 'PUT' && slug) {
          const filePath = path.join(categoryDir, `${slug}.json`);
          if (!fs.existsSync(filePath)) return sendError(res, 404, 'Project not found');
          const body = JSON.parse(await parseBody(req));
          const newSlug = body.slug ?? slug;

          // Handle slug rename
          if (newSlug !== slug) {
            const newFilePath = path.join(categoryDir, `${newSlug}.json`);
            if (fs.existsSync(newFilePath)) return sendError(res, 409, 'Target slug already exists');

            // Rename asset directory if it exists
            const oldAssetDir = path.join(ASSETS_DIR, 'projects', category, slug);
            const newAssetDir = path.join(ASSETS_DIR, 'projects', category, newSlug);
            if (fs.existsSync(oldAssetDir)) {
              fs.renameSync(oldAssetDir, newAssetDir);
              // Rewrite image paths in the JSON body
              const oldPrefix = `assets/projects/${category}/${slug}/`;
              const newPrefix = `assets/projects/${category}/${newSlug}/`;
              if (body.thumbnail) body.thumbnail = body.thumbnail.replace(oldPrefix, newPrefix);
              if (body.screenshots) {
                body.screenshots = body.screenshots.map((s: string) =>
                  s.replace(oldPrefix, newPrefix),
                );
              }
            }

            fs.unlinkSync(filePath);
          }

          const targetPath = path.join(categoryDir, `${newSlug}.json`);
          fs.writeFileSync(targetPath, JSON.stringify(body, null, 2) + '\n');
          return sendJson(res, 200, body);
        }
```

- [ ] **Step 4: Add DELETE /api/categories/:category/projects/:slug**

```typescript
        // DELETE /api/categories/:category/projects/:slug
        if (req.method === 'DELETE' && slug) {
          const filePath = path.join(categoryDir, `${slug}.json`);
          if (!fs.existsSync(filePath)) return sendError(res, 404, 'Project not found');
          fs.unlinkSync(filePath);

          // Remove asset directory if it exists
          const assetDir = path.join(ASSETS_DIR, 'projects', category, slug);
          if (fs.existsSync(assetDir)) {
            fs.rmSync(assetDir, { recursive: true });
          }

          return sendJson(res, 200, { ok: true });
        }
```

- [ ] **Step 5: Verify with curl**

```bash
# Create
curl -s -X POST http://localhost:5173/api/categories/personal/projects \
  -H 'Content-Type: application/json' \
  -d '{"slug":"test-project","title":"Test Project"}' | jq .

# Verify file was created
cat src/data/personal/test-project.json

# Update
curl -s -X PUT http://localhost:5173/api/categories/personal/projects/test-project \
  -H 'Content-Type: application/json' \
  -d '{"slug":"test-project","title":"Updated Title","tags":["test"]}' | jq .

# Delete
curl -s -X DELETE http://localhost:5173/api/categories/personal/projects/test-project | jq .

# Verify file was deleted
ls src/data/personal/test-project.json  # should not exist
```

- [ ] **Step 6: Commit**

```bash
git add editor/server/middleware.ts
git commit -m "Add project CRUD endpoints (POST, PUT, DELETE)"
```

---

### Task 4: Server middleware — image import endpoint

**Files:**
- Modify: `editor/server/middleware.ts`

**Context:** The `/api/images/import` endpoint accepts multipart form data with the image file and metadata fields (`category`, `slug`, `type`). It copies the file to `assets/projects/<category>/<slug>/` with the conventional name. This requires parsing multipart form data without an external dependency — we'll use a simple boundary-based parser.

- [ ] **Step 1: Add multipart parser helper**

Add to the top of middleware.ts (below existing helpers):

```typescript
interface ParsedUpload {
  fields: Record<string, string>;
  file?: { name: string; data: Buffer };
}

function parseMultipart(req: import('http').IncomingMessage): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] ?? '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) return reject(new Error('No boundary in content-type'));
    const boundary = boundaryMatch[1];

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const parts = buffer
        .toString('binary')
        .split(`--${boundary}`)
        .filter((p) => p.trim() && p.trim() !== '--');

      const result: ParsedUpload = { fields: {} };

      for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const headers = part.slice(0, headerEnd);
        const body = part.slice(headerEnd + 4, part.endsWith('\r\n') ? part.length - 2 : part.length);

        const nameMatch = headers.match(/name="([^"]+)"/);
        if (!nameMatch) continue;
        const name = nameMatch[1];

        const filenameMatch = headers.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          result.file = {
            name: filenameMatch[1],
            data: Buffer.from(body, 'binary'),
          };
        } else {
          result.fields[name] = body.trim();
        }
      }

      resolve(result);
    });
  });
}
```

- [ ] **Step 2: Add the image import endpoint**

Add inside the `configureServer` middleware handler, before the project route matching block:

```typescript
        // POST /api/images/import
        if (req.method === 'POST' && url === '/api/images/import') {
          const upload = await parseMultipart(req);
          const { category, slug, type } = upload.fields;

          if (!category || !slug || !type) {
            return sendError(res, 400, 'category, slug, and type are required');
          }
          if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
            return sendError(res, 400, `Invalid category: ${category}`);
          }
          if (type !== 'thumbnail' && type !== 'screenshot') {
            return sendError(res, 400, 'type must be "thumbnail" or "screenshot"');
          }
          if (!upload.file) {
            return sendError(res, 400, 'No file uploaded');
          }

          const ext = path.extname(upload.file.name).toLowerCase();
          const assetDir = path.join(ASSETS_DIR, 'projects', category, slug);
          fs.mkdirSync(assetDir, { recursive: true });

          let filename: string;
          if (type === 'thumbnail') {
            // Remove any existing thumbnail with a different extension
            const existing = fs.readdirSync(assetDir).filter((f) => f.startsWith('thumbnail.'));
            for (const f of existing) fs.unlinkSync(path.join(assetDir, f));
            filename = `thumbnail${ext}`;
          } else {
            // Find next screenshot number
            const existing = fs.readdirSync(assetDir).filter((f) => f.startsWith('screenshot-'));
            const numbers = existing
              .map((f) => parseInt(f.match(/screenshot-(\d+)/)?.[1] ?? '0', 10))
              .filter((n) => !isNaN(n));
            const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
            filename = `screenshot-${next}${ext}`;
          }

          const destPath = path.join(assetDir, filename);
          fs.writeFileSync(destPath, upload.file.data);
          const relativePath = `assets/projects/${category}/${slug}/${filename}`;
          return sendJson(res, 200, { path: relativePath });
        }
```

- [ ] **Step 3: Verify with curl**

```bash
# Create a test image
convert -size 100x100 xc:red /tmp/test-thumb.png 2>/dev/null \
  || printf '\x89PNG\r\n' > /tmp/test-thumb.png

# Import as thumbnail
curl -s -X POST http://localhost:5173/api/images/import \
  -F "category=personal" \
  -F "slug=portfolio-website" \
  -F "type=thumbnail" \
  -F "file=@/tmp/test-thumb.png" | jq .

# Verify file was created
ls assets/projects/personal/portfolio-website/

# Clean up test files
rm -rf assets/projects/personal/portfolio-website/thumbnail.png
```

- [ ] **Step 4: Commit**

```bash
git add editor/server/middleware.ts
git commit -m "Add image import endpoint with multipart upload support"
```

---

## Chunk 2: Client API Layer & UI Components

### Task 5: Client API layer

**Files:**
- Create: `editor/src/api.ts`

**Context:** Thin fetch wrappers matching the server endpoints. Used by the React components. All functions return typed data.

- [ ] **Step 1: Create `editor/src/api.ts`**

```typescript
// Mirrors ProjectData and CategoryData from src/data/types.ts.
// Keep in sync if fields change.
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
  area: string;
  projects: ProjectData[];
}

export async function fetchCategories(): Promise<CategoryData[]> {
  const res = await fetch('/api/categories');
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.statusText}`);
  return res.json();
}

export async function createProject(category: string, project: ProjectData): Promise<ProjectData> {
  const res = await fetch(`/api/categories/${category}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export async function updateProject(
  category: string,
  slug: string,
  project: ProjectData,
): Promise<ProjectData> {
  const res = await fetch(`/api/categories/${category}/projects/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export async function deleteProject(category: string, slug: string): Promise<void> {
  const res = await fetch(`/api/categories/${category}/projects/${slug}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? res.statusText);
  }
}

export async function importImage(
  category: string,
  slug: string,
  type: 'thumbnail' | 'screenshot',
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.append('category', category);
  formData.append('slug', slug);
  formData.append('type', type);
  formData.append('file', file);

  const res = await fetch('/api/images/import', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? res.statusText);
  }
  const data = await res.json();
  return data.path;
}
```

- [ ] **Step 2: Commit**

```bash
git add editor/src/api.ts
git commit -m "Add client API layer for editor endpoints"
```

---

### Task 6: App shell with project list panel

**Files:**
- Modify: `editor/src/App.tsx`
- Modify: `editor/src/App.css`
- Create: `editor/src/components/ProjectList.tsx`
- Create: `editor/src/components/ProjectList.css`

**Context:** The left panel shows a category selector (tabs) and a scrollable list of project titles. Clicking a project sets it as the selected project. A "New Project" button creates a blank project in the selected category.

- [ ] **Step 1: Create `editor/src/components/ProjectList.tsx`**

```tsx
import type { CategoryData, ProjectData } from '../api';
import './ProjectList.css';

interface ProjectListProps {
  categories: CategoryData[];
  selectedCategory: string;
  selectedSlug: string | null;
  onSelectCategory: (category: string) => void;
  onSelectProject: (category: string, slug: string) => void;
  onNewProject: () => void;
}

export default function ProjectList({
  categories,
  selectedCategory,
  selectedSlug,
  onSelectCategory,
  onSelectProject,
  onNewProject,
}: ProjectListProps): React.ReactElement {
  const currentCategory = categories.find((c) => c.area === selectedCategory);
  const projects = currentCategory?.projects ?? [];

  return (
    <div className="project-list">
      <div className="category-tabs">
        {categories.map((c) => (
          <button
            key={c.area}
            className={`tab ${c.area === selectedCategory ? 'active' : ''}`}
            onClick={() => onSelectCategory(c.area)}
          >
            {c.area}
          </button>
        ))}
      </div>
      <div className="projects">
        {projects.map((p: ProjectData) => (
          <button
            key={p.slug}
            className={`project-item ${p.slug === selectedSlug ? 'active' : ''}`}
            onClick={() => onSelectProject(selectedCategory, p.slug)}
          >
            {p.title}
          </button>
        ))}
        {projects.length === 0 && <p className="empty">No projects in this category.</p>}
      </div>
      <button className="new-project-btn" onClick={onNewProject}>
        + New Project
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `editor/src/components/ProjectList.css`**

```css
.project-list {
  display: flex;
  flex-direction: column;
  width: 260px;
  min-width: 260px;
  border-right: 1px solid #2a2a4a;
  background: #16162a;
  overflow: hidden;
}

.category-tabs {
  display: flex;
  border-bottom: 1px solid #2a2a4a;
}

.category-tabs .tab {
  flex: 1;
  padding: 10px 8px;
  background: none;
  border: none;
  color: #888;
  font-size: 0.8rem;
  text-transform: capitalize;
  cursor: pointer;
}

.category-tabs .tab.active {
  color: #7c83ff;
  border-bottom: 2px solid #7c83ff;
}

.projects {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.project-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  background: none;
  border: none;
  color: #ccc;
  text-align: left;
  cursor: pointer;
  font-size: 0.9rem;
}

.project-item:hover {
  background: #1e1e3a;
}

.project-item.active {
  background: #2a2a4a;
  color: #7c83ff;
}

.empty {
  padding: 16px;
  color: #666;
  font-size: 0.85rem;
}

.new-project-btn {
  padding: 12px;
  background: #2a2a4a;
  border: none;
  border-top: 1px solid #2a2a4a;
  color: #7c83ff;
  cursor: pointer;
  font-size: 0.9rem;
}

.new-project-btn:hover {
  background: #33335a;
}
```

- [ ] **Step 3: Update `editor/src/App.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';

import type { CategoryData, ProjectData } from './api';
import { fetchCategories } from './api';
import ProjectList from './components/ProjectList';

interface Selection {
  category: string;
  slug: string | null;
  isNew: boolean;
}

export default function App(): React.ReactElement {
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [selection, setSelection] = useState<Selection>({
    category: 'personal',
    slug: null,
    isNew: false,
  });

  const loadCategories = useCallback(async () => {
    const data = await fetchCategories();
    setCategories(data);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const selectedProject: ProjectData | undefined = categories
    .find((c) => c.area === selection.category)
    ?.projects.find((p) => p.slug === selection.slug);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Portfolio Editor</h1>
      </header>
      <div className="app-body">
        <ProjectList
          categories={categories}
          selectedCategory={selection.category}
          selectedSlug={selection.slug}
          onSelectCategory={(category) =>
            setSelection({ category, slug: null, isNew: false })
          }
          onSelectProject={(category, slug) =>
            setSelection({ category, slug, isNew: false })
          }
          onNewProject={() =>
            setSelection((prev) => ({ ...prev, slug: null, isNew: true }))
          }
        />
        <div className="form-panel">
          {selection.isNew && <p>New project form (coming in next task)</p>}
          {!selection.isNew && selectedProject && (
            <p>Edit: {selectedProject.title} (form coming in next task)</p>
          )}
          {!selection.isNew && !selectedProject && (
            <p className="placeholder">Select a project or create a new one.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `editor/src/App.css`**

Replace the full contents:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  padding: 12px 20px;
  border-bottom: 1px solid #2a2a4a;
  background: #12122a;
}

.app-header h1 {
  font-size: 1.2rem;
  color: #7c83ff;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.form-panel {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.placeholder {
  color: #666;
  font-size: 0.9rem;
}
```

- [ ] **Step 5: Verify**

Run `yarn editor`. Verify:
- Three category tabs appear (college, personal, career)
- Clicking a tab shows that category's projects
- Clicking a project shows "Edit: <title>" in the right panel
- "New Project" button shows "New project form" placeholder

- [ ] **Step 6: Commit**

```bash
git add editor/src/
git commit -m "Add project list panel with category tabs"
```

---

### Task 7: Project form component (text fields)

**Files:**
- Create: `editor/src/components/ProjectForm.tsx`
- Create: `editor/src/components/ProjectForm.css`
- Modify: `editor/src/App.tsx` (wire in ProjectForm)

**Context:** The form handles both "new project" and "edit project" modes. Text fields for all `ProjectData` properties except images (those come in Task 9). The slug field auto-generates from the title for new projects.

- [ ] **Step 1: Create `editor/src/components/ProjectForm.tsx`**

```tsx
import { useEffect, useState } from 'react';

import type { ProjectData } from '../api';
import { createProject, deleteProject, updateProject } from '../api';
import './ProjectForm.css';

interface ProjectFormProps {
  category: string;
  project: ProjectData | null; // null = new project
  onSaved: () => void;
  onDeleted: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function ProjectForm({
  category,
  project,
  onSaved,
  onDeleted,
}: ProjectFormProps): React.ReactElement {
  const isNew = project === null;
  const [form, setForm] = useState<ProjectData>({
    slug: '',
    title: '',
    description: '',
    date: '',
    tags: [],
    playUrl: '',
    sourceUrl: '',
    thumbnail: '',
    screenshots: [],
  });
  const [autoSlug, setAutoSlug] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setForm({ ...project });
      setAutoSlug(false);
    } else {
      setForm({
        slug: '',
        title: '',
        description: '',
        date: '',
        tags: [],
        playUrl: '',
        sourceUrl: '',
        thumbnail: '',
        screenshots: [],
      });
      setAutoSlug(true);
    }
    setError(null);
  }, [project, category]);

  function updateField<K extends keyof ProjectData>(key: K, value: ProjectData[K]): void {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'title' && autoSlug) {
        next.slug = slugify(value as string);
      }
      return next;
    });
  }

  async function handleSave(): Promise<void> {
    if (!form.slug || !form.title) {
      setError('Title and slug are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Strip empty optional fields before saving
      const cleaned: ProjectData = { slug: form.slug, title: form.title };
      if (form.description) cleaned.description = form.description;
      if (form.date) cleaned.date = form.date;
      if (form.tags && form.tags.length > 0) cleaned.tags = form.tags;
      if (form.playUrl) cleaned.playUrl = form.playUrl;
      if (form.sourceUrl) cleaned.sourceUrl = form.sourceUrl;
      if (form.thumbnail) cleaned.thumbnail = form.thumbnail;
      if (form.screenshots && form.screenshots.length > 0) cleaned.screenshots = form.screenshots;

      if (isNew) {
        await createProject(category, cleaned);
      } else {
        await updateProject(category, project!.slug, cleaned);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm(`Delete "${form.title}"? This cannot be undone.`)) return;
    try {
      await deleteProject(category, form.slug);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="project-form">
      <h2>{isNew ? 'New Project' : `Edit: ${project!.title}`}</h2>

      {error && <div className="form-error">{error}</div>}

      <label>
        Title
        <input
          type="text"
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
        />
      </label>

      <label>
        Slug
        <input
          type="text"
          value={form.slug}
          pattern="[a-z0-9-]+"
          onChange={(e) => {
            setAutoSlug(false);
            updateField('slug', slugify(e.target.value));
          }}
        />
      </label>

      <label>
        Description
        <textarea
          value={form.description ?? ''}
          rows={4}
          onChange={(e) => updateField('description', e.target.value)}
        />
      </label>

      <label>
        Date
        <input
          type="date"
          value={form.date ?? ''}
          onChange={(e) => updateField('date', e.target.value)}
        />
      </label>

      <label>
        Tags (comma-separated)
        <input
          type="text"
          value={(form.tags ?? []).join(', ')}
          onChange={(e) =>
            updateField(
              'tags',
              e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
      </label>

      <label>
        Play URL
        <input
          type="url"
          value={form.playUrl ?? ''}
          onChange={(e) => updateField('playUrl', e.target.value)}
        />
      </label>

      <label>
        Source URL
        <input
          type="url"
          value={form.sourceUrl ?? ''}
          onChange={(e) => updateField('sourceUrl', e.target.value)}
        />
      </label>

      {/* Thumbnail and Screenshots will be added in Task 8 */}

      <div className="form-actions">
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!isNew && (
          <button className="delete-btn" onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `editor/src/components/ProjectForm.css`**

```css
.project-form {
  max-width: 640px;
}

.project-form h2 {
  font-size: 1.1rem;
  color: #7c83ff;
  margin-bottom: 20px;
}

.project-form label {
  display: block;
  margin-bottom: 16px;
  font-size: 0.85rem;
  color: #999;
}

.project-form input[type="text"],
.project-form input[type="url"],
.project-form input[type="date"],
.project-form textarea {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px 10px;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 0.9rem;
  font-family: inherit;
}

.project-form input:focus,
.project-form textarea:focus {
  outline: none;
  border-color: #7c83ff;
}

.project-form textarea {
  resize: vertical;
}

.form-error {
  background: #3a1a1a;
  border: 1px solid #ff4444;
  color: #ff6666;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 0.85rem;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.save-btn {
  padding: 8px 24px;
  background: #7c83ff;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
}

.save-btn:hover {
  background: #6b72ee;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-btn {
  padding: 8px 24px;
  background: none;
  border: 1px solid #ff4444;
  border-radius: 4px;
  color: #ff4444;
  font-size: 0.9rem;
  cursor: pointer;
}

.delete-btn:hover {
  background: #3a1a1a;
}
```

- [ ] **Step 3: Wire ProjectForm into App.tsx**

Replace the `form-panel` content in `App.tsx` with:

```tsx
import ProjectForm from './components/ProjectForm';
```

And replace the `<div className="form-panel">` block:

```tsx
        <div className="form-panel">
          {(selection.isNew || selectedProject) && (
            <ProjectForm
              category={selection.category}
              project={selection.isNew ? null : selectedProject!}
              onSaved={() => {
                loadCategories();
                if (selection.isNew) {
                  setSelection((prev) => ({ ...prev, isNew: false }));
                }
              }}
              onDeleted={() => {
                loadCategories();
                setSelection((prev) => ({ ...prev, slug: null, isNew: false }));
              }}
            />
          )}
          {!selection.isNew && !selectedProject && (
            <p className="placeholder">Select a project or create a new one.</p>
          )}
        </div>
```

- [ ] **Step 4: Verify**

Run `yarn editor`. Verify:
- Click "New Project" — form appears with empty fields, slug auto-generates from title
- Fill in title and click Save — project appears in the list
- Click the project — form populates with saved data
- Edit a field and Save — changes persist after reload
- Click Delete — project removed from list and JSON file deleted

- [ ] **Step 5: Commit**

```bash
git add editor/src/
git commit -m "Add project form with text field editing and CRUD"
```

---

## Chunk 3: Image Handling & Polish

### Task 8: Image picker components

**Files:**
- Create: `editor/src/components/ImagePicker.tsx`
- Create: `editor/src/components/ImagePicker.css`
- Modify: `editor/src/components/ProjectForm.tsx` (add thumbnail and screenshot controls)

**Context:** The ImagePicker is a reusable component for selecting and previewing images. It handles the file picker dialog, uploading via the API, and displaying previews. Used for both thumbnail (single image) and screenshots (multiple images).

- [ ] **Step 1: Create `editor/src/components/ImagePicker.tsx`**

```tsx
import { useRef } from 'react';

import { importImage } from '../api';
import './ImagePicker.css';

interface ImagePickerProps {
  label: string;
  category: string;
  slug: string;
  type: 'thumbnail' | 'screenshot';
  currentPath?: string;
  onImported: (path: string) => void;
  onRemove?: () => void;
}

export default function ImagePicker({
  label,
  category,
  slug,
  type,
  currentPath,
  onImported,
  onRemove,
}: ImagePickerProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = await importImage(category, slug, type, file);
    onImported(path);
    // Reset input so re-selecting the same file triggers onChange
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="image-picker">
      <span className="image-picker-label">{label}</span>
      {currentPath && (
        <div className="image-preview-container">
          <img
            className="image-preview"
            src={`/${currentPath}`}
            alt={label}
          />
          {onRemove && (
            <button className="image-remove-btn" onClick={onRemove} title="Remove">
              &times;
            </button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        className="image-choose-btn"
        onClick={() => inputRef.current?.click()}
        disabled={!slug}
        title={!slug ? 'Save the project first to enable image import' : undefined}
      >
        {currentPath ? 'Replace...' : 'Choose file...'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `editor/src/components/ImagePicker.css`**

```css
.image-picker {
  margin-bottom: 16px;
}

.image-picker-label {
  display: block;
  font-size: 0.85rem;
  color: #999;
  margin-bottom: 6px;
}

.image-preview-container {
  position: relative;
  display: inline-block;
  margin-bottom: 8px;
}

.image-preview {
  max-width: 200px;
  max-height: 150px;
  border-radius: 4px;
  border: 1px solid #2a2a4a;
}

.image-remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ff4444;
  border: none;
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-choose-btn {
  display: block;
  padding: 6px 14px;
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  color: #ccc;
  font-size: 0.85rem;
  cursor: pointer;
}

.image-choose-btn:hover {
  background: #33335a;
}

.image-choose-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.screenshots-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}
```

- [ ] **Step 3: Add image controls to ProjectForm.tsx**

Add the import at the top of ProjectForm.tsx:

```tsx
import ImagePicker from './ImagePicker';
```

Replace the `{/* Thumbnail and Screenshots will be added in Task 9 */}` comment with:

```tsx
      {!isNew && (
        <>
          <ImagePicker
            label="Thumbnail"
            category={category}
            slug={form.slug}
            type="thumbnail"
            currentPath={form.thumbnail}
            onImported={(path) => updateField('thumbnail', path)}
            onRemove={() => updateField('thumbnail', '')}
          />

          <div className="image-picker">
            <span className="image-picker-label">Screenshots</span>
            <div className="screenshots-list">
              {(form.screenshots ?? []).map((path, i) => (
                <div key={path} className="image-preview-container">
                  <img className="image-preview" src={`/${path}`} alt={`Screenshot ${i + 1}`} />
                  <button
                    className="image-remove-btn"
                    onClick={() =>
                      updateField(
                        'screenshots',
                        (form.screenshots ?? []).filter((_, j) => j !== i),
                      )
                    }
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <ImagePicker
              label=""
              category={category}
              slug={form.slug}
              type="screenshot"
              onImported={(path) =>
                updateField('screenshots', [...(form.screenshots ?? []), path])
              }
            />
          </div>
        </>
      )}
      {isNew && (
        <p className="image-hint">Save the project first, then add images.</p>
      )}
```

Add this to ProjectForm.css:

```css
.image-hint {
  color: #666;
  font-size: 0.85rem;
  font-style: italic;
  margin-top: 8px;
}
```

- [ ] **Step 4: Verify**

Run `yarn editor`. Verify:
- Create a new project, save it, then select it
- Thumbnail: click "Choose file...", select an image — preview appears, file is copied to `assets/projects/<category>/<slug>/thumbnail.<ext>`
- Screenshots: click "Choose file..." multiple times — each screenshot added to the row
- Remove an image (x button) — preview disappears, path removed from form
- Save after adding images — paths persist in JSON file on disk

- [ ] **Step 5: Commit**

```bash
git add editor/src/
git commit -m "Add image picker with thumbnail and screenshot support"
```

---

### Task 9: Auto-select newly created projects

**Files:**
- Modify: `editor/src/App.tsx`

**Context:** After creating a new project, the app should auto-select it so the user can immediately add images and continue editing. Currently `onSaved` reloads categories but doesn't select the new project.

- [ ] **Step 1: Update the `onSaved` callback for new projects**

In App.tsx, update the `onSaved` callback to capture the slug from the form before reloading:

Replace the `onSaved` prop:

```tsx
              onSaved={async (savedSlug) => {
                await loadCategories();
                setSelection((prev) => ({
                  ...prev,
                  slug: savedSlug,
                  isNew: false,
                }));
              }}
```

Update the `ProjectFormProps` interface in ProjectForm.tsx to pass the slug back:

```tsx
interface ProjectFormProps {
  category: string;
  project: ProjectData | null;
  onSaved: (slug: string) => void;
  onDeleted: () => void;
}
```

And in `handleSave` in ProjectForm.tsx, change the two `onSaved()` calls (after `createProject` and after `updateProject`) to `onSaved(cleaned.slug)`.

- [ ] **Step 2: Verify**

Run `yarn editor`. Create a new project — after save, it should be auto-selected in the list and the form should switch to edit mode showing image pickers.

- [ ] **Step 3: Commit**

```bash
git add editor/src/
git commit -m "Auto-select project after creation"
```

---

### Task 10: Full end-to-end verification

- [ ] **Step 1: Verify from a clean state**

```bash
cd editor && yarn install && cd ..
yarn editor
```

Verify the complete workflow:
1. All three category tabs show correct projects
2. Create a new project in the "personal" category
3. Auto-selection works after creation
4. Add a thumbnail and two screenshots
5. Edit the title and save
6. Verify the JSON file in `src/data/personal/<slug>.json` has correct content
7. Verify images are in `assets/projects/personal/<slug>/`
8. Delete the test project — JSON file and asset directory removed
9. Refresh the browser — state matches filesystem

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "Finalize editor project with gitignore and integration verification"
```
