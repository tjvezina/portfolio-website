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

      server.middlewares.use(async (req, res, next) => {
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
          const body = JSON.parse(await parseBody(req));
          if (!body.slug) return sendError(res, 400, 'slug is required');
          const filePath = path.join(categoryDir, `${body.slug}.json`);
          if (fs.existsSync(filePath)) return sendError(res, 409, 'Project already exists');
          fs.mkdirSync(categoryDir, { recursive: true });
          fs.writeFileSync(filePath, JSON.stringify(body, null, 2) + '\n');
          return sendJson(res, 201, body);
        }

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

        next();
      });
    },
  };
}
