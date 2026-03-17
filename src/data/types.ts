import { ProjectArea } from '@/scenes/main-scene';

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
