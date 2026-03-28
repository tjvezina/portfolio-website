import { useRef } from 'react';

import { importImage } from '../api';
import './ImagePicker.css';

interface ImagePickerProps {
  category: string;
  slug: string;
  currentPath?: string;
  onImported: (path: string) => void;
}

const PLACEHOLDER = '/default-thumbnail.png';

export default function ImagePicker({
  category,
  slug,
  currentPath,
  onImported,
}: ImagePickerProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      const path = await importImage(category, slug, 'thumbnail', files[0]);
      onImported(path);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Image import failed');
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="image-picker">
      <img
        className="image-preview clickable"
        src={currentPath ? `/${currentPath}` : PLACEHOLDER}
        alt="Thumbnail"
        onClick={() => slug && inputRef.current?.click()}
        title={slug ? 'Click to change thumbnail' : 'Save the project first'}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
