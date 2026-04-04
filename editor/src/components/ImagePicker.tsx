import { useRef, useState } from 'react';

import { importImage } from '../api';
import './ImagePicker.css';
import ThumbnailEditor from './ThumbnailEditor';

interface ImagePickerProps {
  category: string;
  slug: string;
  currentPath?: string;
  onImported: (path: string) => void;
}

const PLACEHOLDER = '/default-thumbnail.webp';

export default function ImagePicker({
  category,
  slug,
  currentPath,
  onImported,
}: ImagePickerProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const url = URL.createObjectURL(files[0]);
    setEditingUrl(url);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleCropConfirm(blob: Blob): Promise<void> {
    if (editingUrl) URL.revokeObjectURL(editingUrl);
    setEditingUrl(null);
    try {
      const file = new File([blob], 'thumbnail.png', { type: 'image/png' });
      const path = await importImage(category, slug, 'thumbnail', file);
      setCacheBust(`?t=${Date.now()}`);
      onImported(path);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Image import failed');
    }
  }

  function handleCropCancel(): void {
    if (editingUrl) URL.revokeObjectURL(editingUrl);
    setEditingUrl(null);
  }

  return (
    <div className="image-picker">
      <img
        className="image-preview clickable"
        src={currentPath ? `/${currentPath}${cacheBust}` : PLACEHOLDER}
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
      {editingUrl && (
        <ThumbnailEditor
          imageUrl={editingUrl}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
