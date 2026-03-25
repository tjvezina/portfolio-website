import { useEffect, useRef, useState } from 'react';

import type { ProjectData } from '../api';
import { deleteProject, updateProject } from '../api';
import ImagePicker from './ImagePicker';
import './ProjectForm.css';

interface ProjectFormProps {
  category: string;
  project: ProjectData;
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
  const [form, setForm] = useState<ProjectData>({ ...project });
  const [error, setError] = useState<string | null>(null);
  const [ssDragIndex, setSsDragIndex] = useState<number | null>(null);
  const [ssDropIndex, setSsDropIndex] = useState<number | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    setForm({ ...project });
    setError(null);
  }, [project, category]);

  function updateField<K extends keyof ProjectData>(key: K, value: ProjectData[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
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

  /** Save the current form state. Called on blur from text fields. */
  async function autoSave(): Promise<void> {
    const current = formRef.current;
    if (!current.slug || !current.title) return;
    setError(null);
    try {
      await updateProject(category, project.slug, cleanForm(current));
      onSaved(current.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auto-save failed');
    }
  }

  /** Update a field and save immediately. Used for non-text changes (assets, screenshots). */
  async function saveFieldNow<K extends keyof ProjectData>(key: K, value: ProjectData[K]): Promise<void> {
    const updated = { ...formRef.current, [key]: value };
    setForm(updated);
    setError(null);
    try {
      await updateProject(category, project.slug, cleanForm(updated));
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

  function handleSsDragStart(e: React.DragEvent, index: number): void {
    setSsDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleSsDragOver(e: React.DragEvent, index: number): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setSsDropIndex(index);
  }

  function handleSsDragEnd(): void {
    if (ssDragIndex !== null && ssDropIndex !== null && ssDragIndex !== ssDropIndex) {
      const screenshots = [...(form.screenshots ?? [])];
      const [moved] = screenshots.splice(ssDragIndex, 1);
      screenshots.splice(ssDropIndex, 0, moved);
      saveFieldNow('screenshots', screenshots);
    }
    setSsDragIndex(null);
    setSsDropIndex(null);
  }

  return (
    <div className="project-form">
      <h2>Edit: {project.title}</h2>

      {error && <div className="form-error">{error}</div>}

      <label>
        Title
        <input
          type="text"
          value={form.title}
          onChange={(e) => updateField('title', e.target.value)}
          onBlur={autoSave}
        />
      </label>

      <label>
        Slug
        <input
          type="text"
          value={form.slug}
          pattern="[a-z0-9-]+"
          onChange={(e) => updateField('slug', slugify(e.target.value))}
          onBlur={autoSave}
        />
      </label>

      <label>
        Description
        <textarea
          value={form.description ?? ''}
          rows={4}
          onChange={(e) => updateField('description', e.target.value)}
          onBlur={autoSave}
        />
      </label>

      <label>
        Year
        <input
          type="number"
          value={form.year ?? ''}
          onChange={(e) => updateField('year', e.target.value ? Number(e.target.value) : undefined)}
          onBlur={autoSave}
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
          onBlur={autoSave}
        />
      </label>

      <label>
        Play URL
        <input
          type="url"
          value={form.playUrl ?? ''}
          onChange={(e) => updateField('playUrl', e.target.value)}
          onBlur={autoSave}
        />
      </label>

      <label>
        Source URL
        <input
          type="url"
          value={form.sourceUrl ?? ''}
          onChange={(e) => updateField('sourceUrl', e.target.value)}
          onBlur={autoSave}
        />
      </label>

      <ImagePicker
        label="Thumbnail"
        category={category}
        slug={form.slug}
        type="thumbnail"
        currentPath={form.thumbnail}
        onImported={(path) => saveFieldNow('thumbnail', path)}
        onRemove={() => saveFieldNow('thumbnail', '')}
      />

      <div className="image-picker">
        <span className="image-picker-label">Screenshots</span>
        <div className="screenshots-list">
          {(form.screenshots ?? []).map((path, i) => (
            <div
              key={path}
              className={
                'image-preview-container'
                + (ssDragIndex === i ? ' dragging' : '')
                + (ssDropIndex === i && ssDragIndex !== i ? ' drop-target' : '')
              }
              draggable
              onDragStart={(e) => handleSsDragStart(e, i)}
              onDragOver={(e) => handleSsDragOver(e, i)}
              onDragEnd={handleSsDragEnd}
            >
              <img className="image-preview" src={`/${path}`} alt={`Screenshot ${i + 1}`} />
              <button
                className="image-remove-btn"
                onClick={() =>
                  saveFieldNow(
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
            saveFieldNow('screenshots', [...(form.screenshots ?? []), ...paths])
          }
        />
      </div>

      <div className="form-actions">
        <button className="delete-btn" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
