/**
 * One-time migration: download all external image URLs referenced in project
 * descriptions, save them as local screenshots, and update the JSON files.
 *
 * Run from repo root:  npx tsx editor/scripts/migrate-external-images.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');
const ASSETS_DIR = path.join(REPO_ROOT, 'assets');
const CATEGORIES = ['college', 'personal', 'career'];

const IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;

const EXT_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

function nextScreenshotNumber(assetDir: string): number {
  if (!fs.existsSync(assetDir)) return 1;
  const existing = fs.readdirSync(assetDir).filter((f) => f.startsWith('screenshot-'));
  const numbers = existing
    .map((f) => parseInt(f.match(/screenshot-(\d+)/)?.[1] ?? '0', 10))
    .filter((n) => !isNaN(n));
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

async function downloadImage(
  url: string,
  category: string,
  slug: string,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  const ext = EXT_MAP[ct] ?? '.png';

  const buffer = Buffer.from(await res.arrayBuffer());
  const assetDir = path.join(ASSETS_DIR, 'projects', category, slug);
  fs.mkdirSync(assetDir, { recursive: true });

  const num = nextScreenshotNumber(assetDir);
  const filename = `screenshot-${num}${ext}`;
  fs.writeFileSync(path.join(assetDir, filename), new Uint8Array(buffer));

  return `assets/projects/${category}/${slug}/${filename}`;
}

async function main(): Promise<void> {
  let totalDownloaded = 0;

  for (const category of CATEGORIES) {
    const dir = path.join(DATA_DIR, category);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json') || file === 'order.json') continue;

      const filePath = path.join(dir, file);
      const project = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!project.description) continue;

      // Collect all external image URLs
      const matches: { full: string; alt: string; url: string }[] = [];
      let m;
      while ((m = IMAGE_RE.exec(project.description)) !== null) {
        matches.push({ full: m[0], alt: m[1], url: m[2] });
      }
      if (matches.length === 0) continue;

      console.log(`${category}/${file}: found ${matches.length} external image(s)`);

      let desc = project.description as string;
      for (const { full, alt, url } of matches) {
        try {
          console.log(`  Downloading: ${url.slice(0, 80)}...`);
          const localPath = await downloadImage(url, category, project.slug);
          desc = desc.replace(full, `![${alt}](${localPath})`);
          totalDownloaded++;
          console.log(`  → ${localPath}`);
        } catch (err) {
          console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
        }
      }

      project.description = desc;
      fs.writeFileSync(filePath, JSON.stringify(project, null, 2) + '\n');
    }
  }

  console.log(`\nDone. Downloaded ${totalDownloaded} image(s).`);
}

main();
