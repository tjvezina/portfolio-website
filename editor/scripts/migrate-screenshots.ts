/**
 * One-time migration: move screenshots[] into description as markdown images,
 * then remove the screenshots field from each project JSON.
 *
 * Run from repo root:  npx tsx editor/scripts/migrate-screenshots.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');
const CATEGORIES = ['college', 'personal', 'career'];

for (const category of CATEGORIES) {
  const dir = path.join(DATA_DIR, category);
  if (!fs.existsSync(dir)) continue;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'order.json') continue;

    const filePath = path.join(dir, file);
    const project = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!project.screenshots || project.screenshots.length === 0) continue;

    // Append screenshots as markdown images to the end of description
    const desc = project.description ?? '';
    const imageLines = project.screenshots.map((p: string) => `![](${p})`).join('\n\n');
    project.description = desc ? `${desc}\n\n${imageLines}` : imageLines;

    // Remove the screenshots field
    delete project.screenshots;

    fs.writeFileSync(filePath, JSON.stringify(project, null, 2) + '\n');
    console.log(`Migrated ${category}/${file}: moved ${project.screenshots?.length ?? 'N/A'} screenshots → description`);
  }
}

console.log('Done.');
