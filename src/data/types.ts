export enum ProjectArea {
  College = 'college',
  Personal = 'personal',
  Career = 'career',
}

export interface ProjectData {
  slug: string;
  title: string;
  thumbnail?: string;
  description?: string;
  playUrls?: { name: string; url: string }[];
  tags?: string[];
  year?: string;
}

export interface CategoryData {
  area: ProjectArea;
  projects: ProjectData[];
}
