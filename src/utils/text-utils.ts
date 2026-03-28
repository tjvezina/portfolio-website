import { Shape } from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader';
import { ShapePath } from 'three/src/extras/core/ShapePath';

import App from '@/core/app';

interface FontGlyphData {
  resolution: number;
  glyphs: Record<string, { ha: number, o?: string, _cachedOutline?: string[] }>;
  boundingBox: { yMin: number, yMax: number };
}

export function measureTextWidth(text: string, size: number, font?: Font): number {
  const { resolution, glyphs } = (font ?? App.synthaFont).data as unknown as FontGlyphData;
  const scale = size / resolution;
  let width = 0;
  for (const char of text) {
    const glyph = glyphs[char];
    if (glyph) width += glyph.ha * scale;
  }
  return width;
}

/** Actual rendered line height based on the font's bounding box, not just the em-square size. */
export function measureLineHeight(size: number, font?: Font): number {
  const { resolution, boundingBox } = (font ?? App.synthaFont).data as unknown as FontGlyphData;
  return (boundingBox.yMax - boundingBox.yMin) * size / resolution;
}

export type CharInfo = {
  char: string,
  shapes: Shape[],
  advanceWidth: number,
}

/**
 * Generate per-character shape data directly from font glyph outlines.
 * Unlike TextGeometry, this gives a 1:1 mapping between characters and shape groups
 * (spaces produce 0 shapes, compound glyphs like "i" produce 2+).
 * All shapes are generated at the origin — the caller positions them.
 */
export function generateCharShapes(text: string, font: Font, size: number): CharInfo[] {
  const { resolution, glyphs } = font.data as unknown as FontGlyphData;
  const scale = size / resolution;
  const result: CharInfo[] = [];

  for (const char of text) {
    const glyph = glyphs[char];
    if (!glyph) continue;

    const advanceWidth = glyph.ha * scale;
    const path = new ShapePath();

    if (glyph.o) {
      const outline: string[] = glyph._cachedOutline ??
        (glyph._cachedOutline = glyph.o.split(' '));

      for (let i = 0, l = outline.length; i < l;) {
        switch (outline[i++]) {
          case 'm': {
            const x = Number(outline[i++]) * scale;
            const y = Number(outline[i++]) * scale;
            path.moveTo(x, y);
            break;
          }
          case 'l': {
            const x = Number(outline[i++]) * scale;
            const y = Number(outline[i++]) * scale;
            path.lineTo(x, y);
            break;
          }
          case 'q': {
            const cpx = Number(outline[i++]) * scale;
            const cpy = Number(outline[i++]) * scale;
            const cpx1 = Number(outline[i++]) * scale;
            const cpy1 = Number(outline[i++]) * scale;
            path.quadraticCurveTo(cpx1, cpy1, cpx, cpy);
            break;
          }
          case 'b': {
            const cpx = Number(outline[i++]) * scale;
            const cpy = Number(outline[i++]) * scale;
            const cpx1 = Number(outline[i++]) * scale;
            const cpy1 = Number(outline[i++]) * scale;
            const cpx2 = Number(outline[i++]) * scale;
            const cpy2 = Number(outline[i++]) * scale;
            path.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, cpx, cpy);
            break;
          }
        }
      }
    }

    result.push({ char, shapes: path.toShapes(false), advanceWidth });
  }

  return result;
}

export function wrapText(text: string, size: number, maxWidth: number, font?: Font): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (measureTextWidth(testLine, size, font) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/** Wrap text and reduce font size if any line still overflows maxWidth. */
export function fitText(
  text: string,
  preferredSize: number,
  maxWidth: number,
  font?: Font,
): { lines: string[], size: number } {
  let size = preferredSize;
  for (let i = 0; i < 5; i++) {
    const lines = wrapText(text, size, maxWidth, font);
    let widest = 0;
    for (const line of lines) {
      widest = Math.max(widest, measureTextWidth(line, size, font));
    }
    if (widest <= maxWidth) return { lines, size };
    size *= maxWidth / widest;
  }
  return { lines: wrapText(text, size, maxWidth, font), size };
}
