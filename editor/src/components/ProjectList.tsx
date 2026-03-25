import { useRef, useState } from 'react';

import type { CategoryData, ProjectData } from '../api';
import './ProjectList.css';

interface ProjectListProps {
  categories: CategoryData[];
  selectedCategory: string;
  selectedSlug: string | null;
  onSelectCategory: (category: string) => void;
  onSelectProject: (category: string, slug: string) => void;
  onNewProject: () => void;
  onReorder: (category: string, slugs: string[]) => void;
}

export default function ProjectList({
  categories,
  selectedCategory,
  selectedSlug,
  onSelectCategory,
  onSelectProject,
  onNewProject,
  onReorder,
}: ProjectListProps): React.ReactElement {
  const currentCategory = categories.find((c) => c.area === selectedCategory);
  const projects = currentCategory?.projects ?? [];

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragElement = useRef<HTMLDivElement | null>(null);

  function handleDragStart(e: React.DragEvent, index: number): void {
    setDragIndex(index);
    dragElement.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, index: number): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  }

  function handleDragEnd(): void {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      const slugs = projects.map((p) => p.slug);
      const [moved] = slugs.splice(dragIndex, 1);
      slugs.splice(dropIndex, 0, moved);
      onReorder(selectedCategory, slugs);
    }
    setDragIndex(null);
    setDropIndex(null);
    dragElement.current = null;
  }

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
        {projects.map((p: ProjectData, i: number) => (
          <div
            key={p.slug}
            className={
              `project-item${p.slug === selectedSlug ? ' active' : ''}`
              + `${dragIndex === i ? ' dragging' : ''}`
              + `${dropIndex === i && dragIndex !== i ? ' drop-target' : ''}`
            }
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
          >
            <button
              className="project-item-label"
              onClick={() => onSelectProject(selectedCategory, p.slug)}
            >
              {p.title}
            </button>
            <span className="drag-handle" title="Drag to reorder">&#x2261;</span>
          </div>
        ))}
        {projects.length === 0 && <p className="empty">No projects in this category.</p>}
      </div>
      <button className="new-project-btn" onClick={onNewProject}>
        + New Project
      </button>
    </div>
  );
}
