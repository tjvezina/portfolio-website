import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { ProjectData } from '../api';
import { deleteProject, updateProject } from '../api';
import DescriptionEditor from './DescriptionEditor';
import ImagePicker from './ImagePicker';
import './ProjectForm.css';

interface ProjectFormProps {
  category: string;
  project: ProjectData;
  allTags: string[];
  onSaved: (slug: string) => void;
  onDeleted: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function TagsInput({
  tags,
  allTags,
  onChange,
  onCommit,
}: {
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
  onCommit: (tags: string[]) => void;
}): React.ReactElement {
  const [input, setInput] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions: match input, exclude already-added tags
  const suggestions = input.trim()
    ? allTags.filter((t) => !tags.includes(t) && t.toLowerCase().includes(input.trim().toLowerCase()))
    : [];

  function addTag(value: string): void {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
    setHighlightIndex(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        addTag(suggestions[highlightIndex]);
      } else {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if (e.key === 'Escape') {
      setInput('');
      setHighlightIndex(-1);
    }
  }

  function removeTag(index: number): void {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div className="tags-field">
      <span className="tags-label">Tags</span>
      <div className="tags-input-box" onClick={() => inputRef.current?.focus()}>
        {tags.map((tag, i) => (
          <span key={`${tag}-${i}`} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-remove"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
            >
              &times;
            </button>
          </span>
        ))}
        <div className="tag-input-wrapper">
          <input
            ref={inputRef}
            className="tag-text-input"
            type="text"
            value={input}
            placeholder={tags.length === 0 ? 'Add tags…' : ''}
            onChange={(e) => { setInput(e.target.value); setHighlightIndex(-1); }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              const trimmed = input.trim();
              let result = tags;
              if (trimmed && !tags.includes(trimmed)) {
                result = [...tags, trimmed];
                onChange(result);
              }
              setInput('');
              setHighlightIndex(-1);
              onCommit(result);
            }}
          />
          {suggestions.length > 0 && (
            <ul className="tag-suggestions">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  className={'tag-suggestion' + (i === highlightIndex ? ' highlighted' : '')}
                  onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                  onMouseEnter={() => setHighlightIndex(i)}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectForm({
  category,
  project,
  allTags,
  onSaved,
  onDeleted,
}: ProjectFormProps): React.ReactElement {
  const [form, setForm] = useState<ProjectData>({ ...project });
  const [error, setError] = useState<string | null>(null);
  const [yearInvalid, setYearInvalid] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    setForm({ ...project });
    setError(null);
  }, [project, category]);

  function isValidYear(value: string): boolean {
    if (value.trim() === '') return true;
    return value.split(',').every((part) => {
      const trimmed = part.trim();
      if (/^\d{4}$/.test(trimmed)) return true;
      const match = trimmed.match(/^(\d{4})-(\d{4})$/);
      return match !== null && Number(match[1]) < Number(match[2]);
    });
  }

  function updateField<K extends keyof ProjectData>(key: K, value: ProjectData[K]): void {
    const updated = { ...formRef.current, [key]: value };
    formRef.current = updated;
    setForm(updated);
  }

  function cleanForm(data: ProjectData): ProjectData {
    const cleaned: ProjectData = { slug: data.slug, title: data.title };
    if (data.description) cleaned.description = data.description;
    if (data.year) cleaned.year = data.year;
    const tags = data.tags?.filter(Boolean);
    if (tags && tags.length > 0) cleaned.tags = tags;
    if (data.playUrls && data.playUrls.length > 0) cleaned.playUrls = data.playUrls;
    if (data.thumbnail) cleaned.thumbnail = data.thumbnail;
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

  return (
    <div className="project-form">

      {error && <div className="form-error">{error}</div>}

      <div className="form-header">
        <ImagePicker
          category={category}
          slug={form.slug}
          currentPath={form.thumbnail}
          onImported={(path) => saveFieldNow('thumbnail', path)}
        />
        <div className="form-header-fields">
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
        </div>
      </div>

      <div className="year-tags-row">
        <label className="year-label">
          Year
          <input
            type="text"
            className={yearInvalid ? 'input-error' : undefined}
            value={form.year ?? ''}
            placeholder="e.g. 2010-2012"
            onChange={(e) => { updateField('year', e.target.value); setYearInvalid(false); }}
            onBlur={() => {
              if (isValidYear(form.year ?? '')) {
                setYearInvalid(false);
                autoSave();
              } else {
                setYearInvalid(true);
              }
            }}
          />
        </label>

        <TagsInput
          tags={form.tags ?? []}
          allTags={allTags}
          onChange={(tags) => updateField('tags', tags)}
          onCommit={(tags) => {
            const filtered = tags.filter(Boolean);
            saveFieldNow('tags', filtered.length > 0 ? filtered : undefined);
          }}
        />
      </div>

      <div className="play-urls-field">
        <div className="play-urls-header">
          <span className="play-urls-label">Play URLs</span>
          <button
            type="button"
            className="play-urls-add"
            onClick={() => {
              updateField('playUrls', [...(form.playUrls ?? []), { name: '', url: '' }]);
            }}
          >
            +
          </button>
        </div>
        {(form.playUrls ?? []).map((entry, i) => (
          <div key={i} className="play-url-row">
            <input
              type="text"
              className="play-url-name"
              placeholder="Name"
              value={entry.name}
              onChange={(e) => {
                const urls = [...(form.playUrls ?? [])];
                urls[i] = { ...urls[i], name: e.target.value };
                updateField('playUrls', urls);
              }}
              onBlur={autoSave}
            />
            <input
              type="url"
              className="play-url-value"
              placeholder="https://…"
              value={entry.url}
              onChange={(e) => {
                const urls = [...(form.playUrls ?? [])];
                urls[i] = { ...urls[i], url: e.target.value };
                updateField('playUrls', urls);
              }}
              onBlur={autoSave}
            />
            <button
              type="button"
              className="play-url-remove"
              onClick={() => {
                const urls = (form.playUrls ?? []).filter((_, j) => j !== i);
                saveFieldNow('playUrls', urls.length > 0 ? urls : undefined);
              }}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <DescriptionEditor
        category={category}
        slug={form.slug}
        value={form.description ?? ''}
        onChange={(md) => updateField('description', md)}
        onBlur={autoSave}
        onSave={(md) => saveFieldNow('description', md)}
      />

      <div className="form-actions">
        <button className="delete-btn" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
