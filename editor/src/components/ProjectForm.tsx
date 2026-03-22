import { useEffect, useState } from 'react';

import type { ProjectData } from '../api';
import { createProject, deleteProject, updateProject } from '../api';
import './ProjectForm.css';

interface ProjectFormProps {
  category: string;
  project: ProjectData | null; // null = new project
  onSaved: () => void;
  onDeleted: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function ProjectForm({
  category,
  project,
  onSaved,
  onDeleted,
}: ProjectFormProps): React.ReactElement {
  const isNew = project === null;
  const [form, setForm] = useState<ProjectData>({
    slug: '',
    title: '',
    description: '',
    date: '',
    tags: [],
    playUrl: '',
    sourceUrl: '',
    thumbnail: '',
    screenshots: [],
  });
  const [autoSlug, setAutoSlug] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setForm({ ...project });
      setAutoSlug(false);
    } else {
      setForm({
        slug: '',
        title: '',
        description: '',
        date: '',
        tags: [],
        playUrl: '',
        sourceUrl: '',
        thumbnail: '',
        screenshots: [],
      });
      setAutoSlug(true);
    }
    setError(null);
  }, [project, category]);

  function updateField<K extends keyof ProjectData>(key: K, value: ProjectData[K]): void {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'title' && autoSlug) {
        next.slug = slugify(value as string);
      }
      return next;
    });
  }

  async function handleSave(): Promise<void> {
    if (!form.slug || !form.title) {
      setError('Title and slug are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Strip empty optional fields before saving
      const cleaned: ProjectData = { slug: form.slug, title: form.title };
      if (form.description) cleaned.description = form.description;
      if (form.date) cleaned.date = form.date;
      if (form.tags && form.tags.length > 0) cleaned.tags = form.tags;
      if (form.playUrl) cleaned.playUrl = form.playUrl;
      if (form.sourceUrl) cleaned.sourceUrl = form.sourceUrl;
      if (form.thumbnail) cleaned.thumbnail = form.thumbnail;
      if (form.screenshots && form.screenshots.length > 0) cleaned.screenshots = form.screenshots;

      if (isNew) {
        await createProject(category, cleaned);
      } else {
        await updateProject(category, project!.slug, cleaned);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm(`Delete "${form.title}"? This cannot be undone.`)) return;
    try {
      await deleteProject(category, form.slug);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="project-form">
      <h2>{isNew ? 'New Project' : `Edit: ${project!.title}`}</h2>

      {error && <div className="form-error">{error}</div>}

      <label>
        Title
        <input
          type="text"
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
        />
      </label>

      <label>
        Slug
        <input
          type="text"
          value={form.slug}
          pattern="[a-z0-9-]+"
          onChange={(e) => {
            setAutoSlug(false);
            updateField('slug', slugify(e.target.value));
          }}
        />
      </label>

      <label>
        Description
        <textarea
          value={form.description ?? ''}
          rows={4}
          onChange={(e) => updateField('description', e.target.value)}
        />
      </label>

      <label>
        Date
        <input
          type="date"
          value={form.date ?? ''}
          onChange={(e) => updateField('date', e.target.value)}
        />
      </label>

      <label>
        Tags (comma-separated)
        <input
          type="text"
          value={(form.tags ?? []).join(', ')}
          onChange={(e) =>
            updateField(
              'tags',
              e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
      </label>

      <label>
        Play URL
        <input
          type="url"
          value={form.playUrl ?? ''}
          onChange={(e) => updateField('playUrl', e.target.value)}
        />
      </label>

      <label>
        Source URL
        <input
          type="url"
          value={form.sourceUrl ?? ''}
          onChange={(e) => updateField('sourceUrl', e.target.value)}
        />
      </label>

      {/* Thumbnail and Screenshots will be added in Task 8 */}

      <div className="form-actions">
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!isNew && (
          <button className="delete-btn" onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
