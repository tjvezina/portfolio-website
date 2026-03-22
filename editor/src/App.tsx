import { useCallback, useEffect, useState } from 'react';

import type { CategoryData, ProjectData } from './api';
import { fetchCategories } from './api';
import ProjectForm from './components/ProjectForm';
import ProjectList from './components/ProjectList';

interface Selection {
  category: string;
  slug: string | null;
  isNew: boolean;
}

export default function App(): React.ReactElement {
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [selection, setSelection] = useState<Selection>({
    category: 'personal',
    slug: null,
    isNew: false,
  });

  const loadCategories = useCallback(async () => {
    const data = await fetchCategories();
    setCategories(data);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const selectedProject: ProjectData | undefined = categories
    .find((c) => c.area === selection.category)
    ?.projects.find((p) => p.slug === selection.slug);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Portfolio Editor</h1>
      </header>
      <div className="app-body">
        <ProjectList
          categories={categories}
          selectedCategory={selection.category}
          selectedSlug={selection.slug}
          onSelectCategory={(category) =>
            setSelection({ category, slug: null, isNew: false })
          }
          onSelectProject={(category, slug) =>
            setSelection({ category, slug, isNew: false })
          }
          onNewProject={() =>
            setSelection((prev) => ({ ...prev, slug: null, isNew: true }))
          }
        />
        <div className="form-panel">
          {(selection.isNew || selectedProject) && (
            <ProjectForm
              category={selection.category}
              project={selection.isNew ? null : selectedProject!}
              onSaved={() => {
                loadCategories();
                if (selection.isNew) {
                  setSelection((prev) => ({ ...prev, isNew: false }));
                }
              }}
              onDeleted={() => {
                loadCategories();
                setSelection((prev) => ({ ...prev, slug: null, isNew: false }));
              }}
            />
          )}
          {!selection.isNew && !selectedProject && (
            <p className="placeholder">Select a project or create a new one.</p>
          )}
        </div>
      </div>
    </div>
  );
}
