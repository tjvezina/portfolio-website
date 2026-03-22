import type { CategoryData, ProjectData } from '../api';
import './ProjectList.css';

interface ProjectListProps {
  categories: CategoryData[];
  selectedCategory: string;
  selectedSlug: string | null;
  onSelectCategory: (category: string) => void;
  onSelectProject: (category: string, slug: string) => void;
  onNewProject: () => void;
}

export default function ProjectList({
  categories,
  selectedCategory,
  selectedSlug,
  onSelectCategory,
  onSelectProject,
  onNewProject,
}: ProjectListProps): React.ReactElement {
  const currentCategory = categories.find((c) => c.area === selectedCategory);
  const projects = currentCategory?.projects ?? [];

  return (
    <div className="project-list">
      <div className="category-tabs">
        {categories.map((c) => (
          <button
            key={c.area}
            className={`tab ${c.area === selectedCategory ? 'active' : ''}`}
            onClick={() => onSelectCategory(c.area)}
          >
            {c.area}
          </button>
        ))}
      </div>
      <div className="projects">
        {projects.map((p: ProjectData) => (
          <button
            key={p.slug}
            className={`project-item ${p.slug === selectedSlug ? 'active' : ''}`}
            onClick={() => onSelectProject(selectedCategory, p.slug)}
          >
            {p.title}
          </button>
        ))}
        {projects.length === 0 && <p className="empty">No projects in this category.</p>}
      </div>
      <button className="new-project-btn" onClick={onNewProject}>
        + New Project
      </button>
    </div>
  );
}
