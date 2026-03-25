import { useEffect, useState } from 'react';

import type { ProjectData } from '../api';
import { createProject, deleteProject, updateProject } from '../api';
import ImagePicker from './ImagePicker';
import './ProjectForm.css';

interface ProjectFormProps {
  category: string;
  project: ProjectData | null; // null = new project
  onSaved: (slug: string) => void;
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
    year: undefined,
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
        year: undefined,
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

  function cleanForm(data: ProjectData): ProjectData {
    const cleaned: ProjectData = { slug: data.slug, title: data.title };
    if (data.description) cleaned.description = data.description;
    if (data.year) cleaned.year = data.year;
    if (data.tags && data.tags.length > 0) cleaned.tags = data.tags;
    if (data.playUrl) cleaned.playUrl = data.playUrl;
    if (data.sourceUrl) cleaned.sourceUrl = data.sourceUrl;
    if (data.thumbnail) cleaned.thumbnail = data.thumbnail;
    if (data.screenshots && data.screenshots.length > 0) cleaned.screenshots = data.screenshots;
    return cleaned;
  }

  async function handleSave(): Promise<void> {
    if (!form.slug || !form.title) {
      setError('Title and slug are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cleaned = cleanForm(form);
      if (isNew) {
        await createProject(category, cleaned);
      } else {
        await updateProject(category, project!.slug, cleaned);
      }
      onSaved(cleaned.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  /** Update an asset field and auto-save so uploads are never lost. */
  async function saveAssetChange<K extends keyof ProjectData>(key: K, value: ProjectData[K]): Promise<void> {
    const updated = { ...form, [key]: value };
    setForm(updated);
    setError(null);
    try {
      await updateProject(category, project!.slug, cleanForm(updated));
      onSaved(updated.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auto-save failed');
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
        Year
        <input
          type="number"
          value={form.year ?? ''}
          onChange={(e) => updateField('year', e.target.value ? Number(e.target.value) : undefined)}
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

      {!isNew && (
        <>
          <ImagePicker
            label="Thumbnail"
            category={category}
            slug={form.slug}
            type="thumbnail"
            currentPath={form.thumbnail}
            onImported={(path) => saveAssetChange('thumbnail', path)}
            onRemove={() => saveAssetChange('thumbnail', '')}
          />

          <div className="image-picker">
            <span className="image-picker-label">Screenshots</span>
            <div className="screenshots-list">
              {(form.screenshots ?? []).map((path, i) => (
                <div key={path} className="image-preview-container">
                  <img className="image-preview" src={`/${path}`} alt={`Screenshot ${i + 1}`} />
                  <button
                    className="image-remove-btn"
                    onClick={() =>
                      saveAssetChange(
                        'screenshots',
                        (form.screenshots ?? []).filter((_, j) => j !== i),
                      )
                    }
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <ImagePicker
              label=""
              category={category}
              slug={form.slug}
              type="screenshot"
              multiple
              onImported={() => {}}
              onMultipleImported={(paths) =>
                saveAssetChange('screenshots', [...(form.screenshots ?? []), ...paths])
              }
            />
          </div>
        </>
      )}
      {isNew && (
        <p className="image-hint">Save the project first, then add images.</p>
      )}

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
