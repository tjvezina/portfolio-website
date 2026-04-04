import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

import './ThumbnailEditor.css';

const OUTPUT_SIZE = 256;

interface ThumbnailEditorProps {
  imageUrl: string;
  lossless: boolean;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

function cropImage(imageSrc: string, crop: Area, lossless: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      const canvas = document.createElement('canvas');
      const size = Math.min(crop.width, OUTPUT_SIZE);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(
        img,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, size, size,
      );
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
        lossless ? 'image/png' : 'image/webp',
        lossless ? undefined : 0.95,
      );
    };
    img.onerror = (): void => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });
}

export default function ThumbnailEditor({
  imageUrl,
  lossless,
  onConfirm,
  onCancel,
}: ThumbnailEditorProps): React.ReactElement {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  async function handleConfirm(): Promise<void> {
    if (!croppedArea) return;
    setSaving(true);
    try {
      const blob = await cropImage(imageUrl, croppedArea, lossless);
      onConfirm(blob);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Crop failed');
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="thumbnail-editor" onClick={(e) => e.stopPropagation()}>
        <h2>Crop Thumbnail</h2>
        <p className="thumbnail-editor-hint">
          Drag to pan, scroll to zoom. Displayed as a hexagon ({OUTPUT_SIZE}&times;{OUTPUT_SIZE}px).
        </p>
        <div className="crop-container">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="zoom-control">
          <label htmlFor="zoom-slider">Zoom</label>
          <input
            id="zoom-slider"
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </div>
        <div className="dialog-actions">
          <button className="create-btn" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving\u2026' : 'Apply'}
          </button>
          <button className="cancel-btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
