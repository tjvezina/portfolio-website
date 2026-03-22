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
