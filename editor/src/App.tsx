import { useCallback, useEffect, useState } from 'react';

import type { CategoryData, ProjectData } from './api';
import { fetchCategories, reorderProjects } from './api';
import NewProjectDialog from './components/NewProjectDialog';
import ProjectForm from './components/ProjectForm';
import ProjectList from './components/ProjectList';

interface Selection {
  category: string;
  slug: string | null;
}

export default function App(): React.ReactElement {
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [selection, setSelection] = useState<Selection>({
    category: 'personal',
    slug: null,
  });
  const [showNewDialog, setShowNewDialog] = useState(false);

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
            setSelection({ category, slug: null })
          }
          onSelectProject={(category, slug) =>
            setSelection({ category, slug })
          }
          onNewProject={() => setShowNewDialog(true)}
          onReorder={async (category, slugs) => {
            await reorderProjects(category, slugs);
            await loadCategories();
          }}
        />
        <div className="form-panel">
          {selectedProject && (
            <ProjectForm
              category={selection.category}
              project={selectedProject}
              onSaved={async (savedSlug) => {
                await loadCategories();
                setSelection((prev) => ({ ...prev, slug: savedSlug }));
              }}
              onDeleted={async () => {
                await loadCategories();
                setSelection((prev) => ({ ...prev, slug: null }));
              }}
            />
          )}
          {!selectedProject && (
            <p className="placeholder">Select a project or create a new one.</p>
          )}
        </div>
      </div>
      {showNewDialog && (
        <NewProjectDialog
          category={selection.category}
          onCreated={async (slug) => {
            setShowNewDialog(false);
            await loadCategories();
            setSelection((prev) => ({ ...prev, slug }));
          }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
