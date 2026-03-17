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
  screenshots?: string[];
  playUrl?: string;
  sourceUrl?: string;
  tags?: string[];
  date?: string;
}

export interface CategoryData {
  area: ProjectArea;
  projects: ProjectData[];
}
