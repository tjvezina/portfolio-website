import { CategoryData, ProjectArea, ProjectData } from '@/data/types';

/** Ensure an asset path is absolute so it resolves correctly on nested routes. */
function absPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function loadCategory(
  context: __WebpackModuleApi.RequireContext,
  orderContext: __WebpackModuleApi.RequireContext,
  orderKey: string,
): ProjectData[] {
  const projects = context.keys()
    .filter((key) => key !== './order.json')
    .map((key) => {
      const mod = context(key);
      // webpack may wrap JSON as { default: ... } or return directly — handle both
      const project = (mod.default ?? mod) as ProjectData;
      // Normalize asset paths to absolute
      if (project.thumbnail) project.thumbnail = absPath(project.thumbnail);
      return project;
    });

  let order: string[] = [];
  try {
    const mod = orderContext(orderKey);
    order = (mod.default ?? mod) as string[];
  } catch {
    // No order.json — return in discovery order
  }

  if (order.length === 0) return projects;
  const indexed = new Map(projects.map((p) => [p.slug, p]));
  const sorted: ProjectData[] = [];
  for (const slug of order) {
    const p = indexed.get(slug);
    if (p) {
      sorted.push(p);
      indexed.delete(slug);
    }
  }
  for (const p of indexed.values()) sorted.push(p);
  return sorted;
}

const collegeContext = require.context('./college', false, /\.json$/);
const personalContext = require.context('./personal', false, /\.json$/);
const careerContext = require.context('./career', false, /\.json$/);

const categories: Map<ProjectArea, CategoryData> = new Map([
  [ProjectArea.College, { area: ProjectArea.College, projects: loadCategory(collegeContext, collegeContext, './order.json') }],
  [ProjectArea.Personal, { area: ProjectArea.Personal, projects: loadCategory(personalContext, personalContext, './order.json') }],
  [ProjectArea.Career, { area: ProjectArea.Career, projects: loadCategory(careerContext, careerContext, './order.json') }],
]);

export function getCategoryData(area: ProjectArea): CategoryData {
  return categories.get(area)!;
}

export function getProjectData(area: ProjectArea, slug: string): ProjectData | undefined {
  return getCategoryData(area).projects.find((p) => p.slug === slug);
}

export function getAllCategories(): CategoryData[] {
  return [...categories.values()];
}

export function getProjectIndex(area: ProjectArea, slug: string): number {
  return getCategoryData(area).projects.findIndex(p => p.slug === slug);
}

export function getAdjacentProject(
  area: ProjectArea, slug: string, offset: number,
): ProjectData | undefined {
  const projects = getCategoryData(area).projects;
  const index = projects.findIndex(p => p.slug === slug);
  if (index === -1) return undefined;
  const newIndex = index + offset;
  if (newIndex < 0 || newIndex >= projects.length) return undefined;
  return projects[newIndex];
}
