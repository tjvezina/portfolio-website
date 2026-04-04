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
  const [editingLossless, setEditingLossless] = useState(false);
  const [cacheBust, setCacheBust] = useState('');

  const LOSSLESS_TYPES = new Set(['image/png', 'image/gif', 'image/tiff', 'image/bmp']);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const file = files[0];
    setEditingUrl(URL.createObjectURL(file));
    setEditingLossless(LOSSLESS_TYPES.has(file.type));
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleCropConfirm(blob: Blob): Promise<void> {
    if (editingUrl) URL.revokeObjectURL(editingUrl);
    setEditingUrl(null);
    try {
      const ext = blob.type === 'image/png' ? 'png' : 'webp';
      const file = new File([blob], `thumbnail.${ext}`, { type: blob.type });
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
          lossless={editingLossless}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
