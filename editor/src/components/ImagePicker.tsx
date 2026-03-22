import { useRef } from 'react';

import { importImage } from '../api';
import './ImagePicker.css';

interface ImagePickerProps {
  label: string;
  category: string;
  slug: string;
  type: 'thumbnail' | 'screenshot';
  currentPath?: string;
  onImported: (path: string) => void;
  onRemove?: () => void;
}

export default function ImagePicker({
  label,
  category,
  slug,
  type,
  currentPath,
  onImported,
  onRemove,
}: ImagePickerProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const path = await importImage(category, slug, type, file);
      onImported(path);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Image import failed');
    }
    // Reset input so re-selecting the same file triggers onChange
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="image-picker">
      <span className="image-picker-label">{label}</span>
      {currentPath && (
        <div className="image-preview-container">
          <img
            className="image-preview"
            src={`/${currentPath}`}
            alt={label}
          />
          {onRemove && (
            <button className="image-remove-btn" onClick={onRemove} title="Remove">
              &times;
            </button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        className="image-choose-btn"
        onClick={() => inputRef.current?.click()}
        disabled={!slug}
        title={!slug ? 'Save the project first to enable image import' : undefined}
      >
        {currentPath ? 'Replace...' : 'Choose file...'}
      </button>
    </div>
  );
}
