import { CategoryData, ProjectArea, ProjectData } from '@/data/types';

function loadCategory(context: __WebpackModuleApi.RequireContext): ProjectData[] {
  return context.keys().map((key) => {
    const mod = context(key);
    // webpack may wrap JSON as { default: ... } or return directly — handle both
    return (mod.default ?? mod) as ProjectData;
  });
}

const collegeContext = require.context('./college', false, /\.json$/);
const personalContext = require.context('./personal', false, /\.json$/);
const careerContext = require.context('./career', false, /\.json$/);

const categories: Map<ProjectArea, CategoryData> = new Map([
  [ProjectArea.College, { area: ProjectArea.College, projects: loadCategory(collegeContext) }],
  [ProjectArea.Personal, { area: ProjectArea.Personal, projects: loadCategory(personalContext) }],
  [ProjectArea.Career, { area: ProjectArea.Career, projects: loadCategory(careerContext) }],
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
