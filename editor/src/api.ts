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
