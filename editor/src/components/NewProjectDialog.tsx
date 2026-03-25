import { useState } from 'react';

import { createProject } from '../api';
import './NewProjectDialog.css';

interface NewProjectDialogProps {
  category: string;
  onCreated: (slug: string) => void;
  onCancel: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function NewProjectDialog({
  category,
  onCreated,
  onCancel,
}: NewProjectDialogProps): React.ReactElement {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    if (!title || !slug) {
      setError('Title and slug are required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createProject(category, { slug, title });
      onCreated(slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter' && !creating) {
      handleCreate();
    }
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h2>New Project</h2>
        <p className="dialog-category">in <strong>{category}</strong></p>

        {error && <div className="form-error">{error}</div>}

        <label>
          Title
          <input
            type="text"
            value={title}
            autoFocus
            onChange={(e) => {
              setTitle(e.target.value);
              if (autoSlug) setSlug(slugify(e.target.value));
            }}
          />
        </label>

        <label>
          Slug
          <input
            type="text"
            value={slug}
            pattern="[a-z0-9-]+"
            onChange={(e) => {
              setAutoSlug(false);
              setSlug(slugify(e.target.value));
            }}
          />
        </label>

        <div className="dialog-actions">
          <button className="create-btn" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
