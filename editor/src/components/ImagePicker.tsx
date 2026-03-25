import { useRef } from 'react';

import { importImage } from '../api';
import './ImagePicker.css';

interface ImagePickerProps {
  label: string;
  category: string;
  slug: string;
  type: 'thumbnail' | 'screenshot';
  currentPath?: string;
  multiple?: boolean;
  onImported: (path: string) => void;
  onMultipleImported?: (paths: string[]) => void;
  onRemove?: () => void;
}

export default function ImagePicker({
  label,
  category,
  slug,
  type,
  currentPath,
  multiple,
  onImported,
  onMultipleImported,
  onRemove,
}: ImagePickerProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      const paths = await Promise.all(
        files.map((file) => importImage(category, slug, type, file)),
      );
      if (onMultipleImported) {
        onMultipleImported(paths);
      } else {
        for (const path of paths) onImported(path);
      }
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
        multiple={multiple}
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
