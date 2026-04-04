import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

const CATEGORIES = ['college', 'personal', 'career'] as const;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');

function orderFilePath(category: string): string {
  return path.join(DATA_DIR, category, 'order.json');
}

function readOrder(category: string): string[] {
  const p = orderFilePath(category);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return []; }
}

function writeOrder(category: string, order: string[]): void {
  const dir = path.join(DATA_DIR, category);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(orderFilePath(category), JSON.stringify(order, null, 2) + '\n');
}

function readProjectsInCategory(category: string): object[] {
  const dir = path.join(DATA_DIR, category);
  if (!fs.existsSync(dir)) return [];
  const projects = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'order.json')
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
  const order = readOrder(category);
  const indexed = new Map(projects.map((p: Record<string, unknown>) => [p.slug, p]));
  const sorted: object[] = [];
  for (const slug of order) {
    const p = indexed.get(slug);
    if (p) {
      sorted.push(p);
      indexed.delete(slug);
    }
  }
  // Append any projects not listed in order.json
  for (const p of indexed.values()) sorted.push(p);
  return sorted;
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
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

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

    const chunks: Uint8Array[] = [];
    req.on('data', (chunk: Uint8Array) => chunks.push(chunk));
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

/** Extract all image paths from markdown text (matches ![...](path) syntax). */
function extractImagePaths(markdown: string): Set<string> {
  const paths = new Set<string>();
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(markdown)) !== null) {
    // Strip leading slash if present (editor uses /assets/... but JSON stores assets/...)
    paths.add(match[1].replace(/^\//, ''));
  }
  return paths;
}

/** Delete image files that were removed from the description. */
function cleanupOrphanedImages(
  oldDescription: string | undefined,
  newDescription: string | undefined,
): void {
  const oldPaths = extractImagePaths(oldDescription ?? '');
  const newPaths = extractImagePaths(newDescription ?? '');
  for (const p of oldPaths) {
    if (!newPaths.has(p)) {
      const absPath = path.join(REPO_ROOT, p);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
    }
  }
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
        const urlPath = (req.url ?? '').split('?')[0];
        const filePath = path.resolve(ASSETS_DIR, urlPath.replace(/^\/+/, ''));
        if (!filePath.startsWith(ASSETS_DIR)) return next();
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = mimeTypes[ext] ?? 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/')) return next();

        try { return await handleApi(req, res, next); }
        catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ECONNRESET' || code === 'ECONNABORTED') return;
          if (!res.headersSent) sendError(res, 500, 'Internal server error');
          else res.end();
        }
      });

      async function handleApi(
        req: import('http').IncomingMessage,
        res: import('http').ServerResponse,
        next: () => void,
      ): Promise<void> {
        const url = req.url ?? '';

        // GET /api/categories
        if (req.method === 'GET' && url === '/api/categories') {
          const result = CATEGORIES.map((area) => ({
            area,
            projects: readProjectsInCategory(area),
          }));
          return sendJson(res, 200, result);
        }

        // PUT /api/categories/:category/order
        const orderMatch = url.match(/^\/api\/categories\/(college|personal|career)\/order$/);
        if (req.method === 'PUT' && orderMatch) {
          let body: string[];
          try { body = JSON.parse(await parseBody(req)); }
          catch { return sendError(res, 400, 'Invalid JSON body'); }
          if (!Array.isArray(body)) return sendError(res, 400, 'Body must be an array of slugs');
          writeOrder(orderMatch[1], body);
          return sendJson(res, 200, { ok: true });
        }

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
          fs.writeFileSync(destPath, new Uint8Array(upload.file.data));
          const relativePath = `assets/projects/${category}/${slug}/${filename}`;
          return sendJson(res, 200, { path: relativePath });
        }

        // POST /api/images/import-url
        if (req.method === 'POST' && url === '/api/images/import-url') {
          let body: { category: string; slug: string; url: string };
          try { body = JSON.parse(await parseBody(req)); }
          catch { return sendError(res, 400, 'Invalid JSON body'); }

          const { category: cat, slug: s, url: imageUrl } = body;
          if (!cat || !s || !imageUrl) {
            return sendError(res, 400, 'category, slug, and url are required');
          }
          if (!CATEGORIES.includes(cat as typeof CATEGORIES[number])) {
            return sendError(res, 400, `Invalid category: ${cat}`);
          }
          if (!/^https?:\/\//.test(imageUrl)) {
            return sendError(res, 400, 'url must be an HTTP(S) URL');
          }

          let fetchRes: Response;
          try { fetchRes = await fetch(imageUrl); }
          catch { return sendError(res, 502, 'Failed to fetch image'); }
          if (!fetchRes.ok) {
            return sendError(res, 502, `Failed to download image: ${fetchRes.status}`);
          }

          const ct = (fetchRes.headers.get('content-type') ?? '').split(';')[0].trim();
          const extMap: Record<string, string> = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
          };
          const ext = extMap[ct] ?? '.png';

          const buffer = Buffer.from(await fetchRes.arrayBuffer());
          const assetDir = path.join(ASSETS_DIR, 'projects', cat, s);
          fs.mkdirSync(assetDir, { recursive: true });

          const existing = fs.readdirSync(assetDir).filter((f) => f.startsWith('screenshot-'));
          const numbers = existing
            .map((f) => parseInt(f.match(/screenshot-(\d+)/)?.[1] ?? '0', 10))
            .filter((n) => !isNaN(n));
          const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
          const filename = `screenshot-${next}${ext}`;

          const destPath = path.join(assetDir, filename);
          fs.writeFileSync(destPath, new Uint8Array(buffer));
          const relativePath = `assets/projects/${cat}/${s}/${filename}`;
          return sendJson(res, 200, { path: relativePath });
        }

        // Route matching for /api/categories/:category/projects[/:slug]
        const projectMatch = url.match(
          /^\/api\/categories\/(college|personal|career)\/projects(?:\/([a-z0-9-]+))?$/,
        );
        if (!projectMatch) return next();

        const category = projectMatch[1];
        const slug = projectMatch[2]; // undefined for collection endpoints
        const categoryDir = path.join(DATA_DIR, category);

        // POST /api/categories/:category/projects
        if (req.method === 'POST' && !slug) {
          let body: Record<string, unknown>;
          try { body = JSON.parse(await parseBody(req)); }
          catch { return sendError(res, 400, 'Invalid JSON body'); }
          if (!body.slug) return sendError(res, 400, 'slug is required');
          if (!/^[a-z0-9-]+$/.test(body.slug as string)) {
            return sendError(res, 400, 'slug must contain only lowercase letters, digits, and hyphens');
          }
          const filePath = path.join(categoryDir, `${body.slug}.json`);
          if (fs.existsSync(filePath)) return sendError(res, 409, 'Project already exists');
          fs.mkdirSync(categoryDir, { recursive: true });
          fs.writeFileSync(filePath, JSON.stringify(body, null, 2) + '\n');
          const order = readOrder(category);
          order.push(body.slug as string);
          writeOrder(category, order);
          return sendJson(res, 201, body);
        }

        // PUT /api/categories/:category/projects/:slug
        if (req.method === 'PUT' && slug) {
          const filePath = path.join(categoryDir, `${slug}.json`);
          if (!fs.existsSync(filePath)) return sendError(res, 404, 'Project not found');
          const oldProject = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          let body: Record<string, unknown>;
          try { body = JSON.parse(await parseBody(req)); }
          catch { return sendError(res, 400, 'Invalid JSON body'); }
          const newSlug = (body.slug as string) ?? slug;

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
              if (typeof body.thumbnail === 'string') {
                body.thumbnail = body.thumbnail.replace(oldPrefix, newPrefix);
              }
              if (typeof body.description === 'string') {
                body.description = (body.description as string).replaceAll(oldPrefix, newPrefix);
              }
            }

            fs.unlinkSync(filePath);
            const order = readOrder(category);
            const idx = order.indexOf(slug);
            if (idx !== -1) order[idx] = newSlug;
            writeOrder(category, order);
          }

          // Clean up images removed from the description.
          // After a slug rename, oldProject still has old paths while body has new paths,
          // but the files have already been moved — so rewrite old paths to match.
          let oldDesc = oldProject.description as string | undefined;
          if (newSlug !== slug && oldDesc) {
            const oldPrefix = `assets/projects/${category}/${slug}/`;
            const newPrefix = `assets/projects/${category}/${newSlug}/`;
            oldDesc = oldDesc.replaceAll(oldPrefix, newPrefix);
          }
          cleanupOrphanedImages(oldDesc, body.description as string | undefined);

          const targetPath = path.join(categoryDir, `${newSlug}.json`);
          fs.writeFileSync(targetPath, JSON.stringify(body, null, 2) + '\n');
          return sendJson(res, 200, body);
        }

        // DELETE /api/categories/:category/projects/:slug
        if (req.method === 'DELETE' && slug) {
          const filePath = path.join(categoryDir, `${slug}.json`);
          if (!fs.existsSync(filePath)) return sendError(res, 404, 'Project not found');
          fs.unlinkSync(filePath);
          const order = readOrder(category);
          writeOrder(category, order.filter((s) => s !== slug));

          // Remove asset directory if it exists
          const assetDir = path.join(ASSETS_DIR, 'projects', category, slug);
          if (fs.existsSync(assetDir)) {
            fs.rmSync(assetDir, { recursive: true });
          }

          return sendJson(res, 200, { ok: true });
        }

        next();
      }
    },
  };
}
