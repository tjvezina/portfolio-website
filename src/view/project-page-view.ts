import {
  BufferGeometry, Material, Mesh, MeshBasicMaterial, Object3D,
  PlaneGeometry, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader, Vector3,
} from 'three';

import App, { HOME_AREA_WIDTH } from '@/core/app';
import { BLOOM_LAYER, LIGHTBOX_LAYER } from '@/core/layers';
import { NeonColor } from '@/core/neon-color';
import { ProjectData } from '@/data/types';
import Text, { TextAlignX, TextAlignY } from '@/objects/text';
import Wireframe, { WireframeType } from '@/objects/wireframe';
import { generateCharShapes, measureLineHeight, measureTextWidth, wrapText } from '@/utils/text-utils';

// --- Description parsing types ---

type InlineRun =
  | { type: 'text', text: string }
  | { type: 'link', text: string, url: string }

type ContentBlock =
  | { type: 'paragraph', runs: InlineRun[] }
  | { type: 'image', src: string }
  | { type: 'image-row', sources: string[] }

type ClickTarget = {
  mesh: Mesh,
  url: string,
}

type Word = {
  text: string,
  run: InlineRun,
  bold: boolean,
}

type AnimatedChar = {
  container: Object3D,
  materials: MeshBasicMaterial[],
  baseY: number,
  index: number,
}

// --- Layout constants ---

const TITLE_SIZE = 0.3;
const META_SIZE = 0.2;
const TAG_SIZE = 0.18;
const DESC_SIZE = 0.18;
const BUTTON_TEXT_SIZE = 0.17;
const LINE_HEIGHT_FACTOR = 1.5;
const DESC_LINE_HEIGHT_FACTOR = 1.5;
const SECTION_GAP = 0.5;
const PARAGRAPH_GAP = 0.35;
const IMAGE_ASPECT = 16 / 9;
const IMAGE_ROW_GAP = 0.05;
export const THUMBNAIL_SCALE = 0.75;
const BUTTON_PADDING_X = 0.2;
const BUTTON_PADDING_Y = 0.12;
const BUTTON_GAP = 0.3;
const BUTTON_CORNER_RADIUS = 0.12;
const BUTTON_HOVER_SCALE = 1.06;
const BUTTON_PRESS_SCALE = 0.94;
const LIGHTBOX_ANIM_SPEED = 2.5;
const LIGHTBOX_OVERLAY_OPACITY = 0.85;
const LIGHTBOX_MARGIN_FRAC = 0.08;

type PlayButton = {
  container: Object3D,
  hitArea: Mesh,
}

type ImageInfo = {
  aspect: number,
  naturalWidth: number,
  naturalHeight: number,
}

type ImageEntry = {
  mesh: Mesh,
  bloomFill: Mesh,
  width: number,
  height: number,
  naturalWidth: number,
  naturalHeight: number,
}

function createRoundedRectShape(
  width: number,
  height: number,
  radius: number,
): Shape {
  const shape = new Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default class ProjectPageView extends Object3D {
  private _contentHeight = 0;
  get contentHeight(): number { return this._contentHeight; }
  get lightboxActive(): boolean { return this.lightbox !== null; }

  private clickTargets: ClickTarget[] = [];
  private clickHandler: () => void;
  private playButtons: PlayButton[] = [];
  private animatedChars: AnimatedChar[] = [];
  private isPointerDown = false;
  private pointerDownHandler: () => void;
  private pointerUpHandler: () => void;
  private textureLoader = new TextureLoader();
  private imageDims: Map<string, ImageInfo>;
  private imageEntries: ImageEntry[] = [];
  private lightbox: {
    entry: ImageEntry,
    overlay: Mesh,
    origPos: Vector3,
    progress: number,
    closing: boolean,
  } | null = null;

  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  /** Preload image dimensions, then construct the view with correct layout. */
  static async create(
    project: ProjectData,
    color: NeonColor,
    cellSize: number,
  ): Promise<ProjectPageView> {
    const urls = ProjectPageView.extractImageUrls(project.description ?? '');
    const dims = urls.length > 0
      ? await ProjectPageView.preloadImageDims(urls)
      : new Map<string, ImageInfo>();
    return new ProjectPageView(project, color, cellSize, dims);
  }

  private static extractImageUrls(description: string): string[] {
    const urls: string[] = [];
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(description)) !== null) {
      const raw = match[2];
      urls.push(raw.startsWith('/') ? raw : `/${raw}`);
    }
    return urls;
  }

  private static preloadImageDims(urls: string[]): Promise<Map<string, ImageInfo>> {
    return Promise.all(urls.map(url =>
      new Promise<[string, ImageInfo]>((resolve) => {
        const img = new Image();
        img.onload = (): void => resolve([url, {
          aspect: img.naturalWidth / img.naturalHeight,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        }]);
        img.onerror = (): void => resolve([url, {
          aspect: IMAGE_ASPECT,
          naturalWidth: Infinity,
          naturalHeight: Infinity,
        }]);
        img.src = url;
      }),
    )).then(entries => new Map(entries));
  }

  constructor(
    project: ProjectData,
    color: NeonColor,
    cellSize: number,
    imageDims: Map<string, ImageInfo>,
  ) {
    super();
    this.imageDims = imageDims;

    const contentHalfWidth = HOME_AREA_WIDTH / 2;
    const margin = cellSize * 0.6;
    const gap = cellSize * 0.15;

    // Thumbnail visual size after scaling (center stays at fly target position)
    const thumbVisual = cellSize * THUMBNAIL_SCALE;
    const thumbTop = -cellSize * 1.1 + thumbVisual / 2;
    const thumbBottom = -cellSize * 1.1 - thumbVisual / 2;
    const thumbRight = -contentHalfWidth + cellSize * 1.1 + thumbVisual / 2;

    // Right area for title/year/tags (left-aligned, vertically centered beside thumbnail)
    const rightAreaLeft = thumbRight + gap;
    const rightAreaWidth = (contentHalfWidth - margin) - rightAreaLeft;

    // --- Pre-compute header layout to find total height ---
    const titleText = project.title.toUpperCase();
    let titleSize = TITLE_SIZE;
    const titleWidth = measureTextWidth(titleText, titleSize);
    if (titleWidth > rightAreaWidth) {
      titleSize *= rightAreaWidth / titleWidth;
    }

    const titleAdvance = measureLineHeight(META_SIZE) * LINE_HEIGHT_FACTOR;
    const tagAdvance = measureLineHeight(TAG_SIZE, App.bookerlyFont) * LINE_HEIGHT_FACTOR;

    let headerAdvance = titleAdvance;
    if (project.year) headerAdvance += tagAdvance;
    let tagLines: string[] = [];
    if (project.tags && project.tags.length > 0) {
      const tagStr = project.tags.join('  \u00B7  ');
      tagLines = wrapText(tagStr, TAG_SIZE, rightAreaWidth, App.bookerlyFont);
      headerAdvance += tagLines.length * tagAdvance;
    }

    // Center the header block vertically between thumbTop and thumbBottom
    const thumbCenterY = (thumbTop + thumbBottom) / 2;
    let rightY = thumbCenterY + headerAdvance / 2 + headerAdvance * 0.05;

    // --- Title (single line, shrink to fit) ---
    const title = new Text(titleText, App.synthaFont, {
      color,
      size: titleSize,
      alignX: TextAlignX.Left,
      alignY: TextAlignY.Top,
    });
    title.position.set(rightAreaLeft, rightY, 0);
    this.add(title);
    rightY -= titleAdvance;

    // --- Year ---
    if (project.year) {
      const yearObj = new Text(project.year, App.synthaFont, {
        color,
        size: META_SIZE,
        alignX: TextAlignX.Left,
        alignY: TextAlignY.Top,
      });
      yearObj.position.set(rightAreaLeft, rightY, 0);
      this.add(yearObj);
      rightY -= tagAdvance;
    }

    // --- Tags ---
    for (const line of tagLines) {
      const text = new Text(line, App.bookerlyFont, {
        color,
        size: TAG_SIZE,
        alignX: TextAlignX.Left,
        alignY: TextAlignY.Top,
      });
      text.position.set(rightAreaLeft, rightY, 0);
      this.add(text);
      rightY -= tagAdvance;
    }

    // Content below the header row (thumbnail + right-side info)
    let y = Math.min(thumbBottom, rightY);
    const descLeft = -contentHalfWidth + margin;
    const descWidth = HOME_AREA_WIDTH - margin * 2;

    // --- Play buttons (centered, one per line) ---
    if (project.playUrls && project.playUrls.length > 0) {
      const btnHeight = BUTTON_TEXT_SIZE + BUTTON_PADDING_Y * 2;

      for (const playUrl of project.playUrls) {
        const name = playUrl.name || project.title;
        const label = `PLAY ${name.toUpperCase()}`;
        const { button, hitArea } = this.createPlayButton(label, color);
        button.position.set(0, y - btnHeight / 2, 0);
        this.add(button);
        this.clickTargets.push({ mesh: hitArea, url: playUrl.url });
        this.playButtons.push({ container: button, hitArea });
        y -= btnHeight + BUTTON_GAP;
      }

      y += BUTTON_GAP - SECTION_GAP; // replace trailing button gap with section gap
    }

    // --- Description ---
    if (project.description) {
      const blocks = this.parseDescription(project.description);

      for (const block of blocks) {
        if (block.type === 'paragraph') {
          y = this.renderParagraph(
            block.runs, descLeft, y, descWidth, DESC_SIZE, color,
          );
          y -= PARAGRAPH_GAP;
        } else if (block.type === 'image') {
          y = this.renderImage(block.src, descLeft, y, descWidth);
          y -= PARAGRAPH_GAP;
        } else if (block.type === 'image-row') {
          y = this.renderImageRow(block.sources, descLeft, y, descWidth);
          y -= PARAGRAPH_GAP;
        }
      }
    }

    this._contentHeight = Math.abs(y) + 1.0;

    // Click handler for lightbox, play buttons, and links
    this.clickHandler = (): void => {
      if (this.lightbox) {
        if (!this.lightbox.closing) {
          this.lightbox.closing = true;
        }
        return;
      }

      for (const entry of this.imageEntries) {
        if ((entry.mesh.material as MeshBasicMaterial).opacity === 0) continue;
        if (App.raycaster.intersectObject(entry.mesh).length > 0) {
          this.openLightbox(entry);
          return;
        }
      }

      for (const target of this.clickTargets) {
        if (App.raycaster.intersectObject(target.mesh).length > 0) {
          window.open(target.url, '_blank');
          return;
        }
      }
    };
    this.pointerDownHandler = (): void => { this.isPointerDown = true; };
    this.pointerUpHandler = (): void => { this.isPointerDown = false; };
  }

  enableInput(): void {
    window.addEventListener('click', this.clickHandler);
    window.addEventListener('pointerdown', this.pointerDownHandler);
    window.addEventListener('pointerup', this.pointerUpHandler);
    this.keyHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.lightbox && !this.lightbox.closing) {
        this.lightbox.closing = true;
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  disableInput(): void {
    window.removeEventListener('click', this.clickHandler);
    window.removeEventListener('pointerdown', this.pointerDownHandler);
    window.removeEventListener('pointerup', this.pointerUpHandler);
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.isPointerDown = false;
    if (this.lightbox) this.tearDownLightbox();
  }

  update(): void {
    // Animate bold characters: rainbow hue cycle + sine wave bounce
    const time = App.timer.getElapsed();
    for (const ac of this.animatedChars) {
      // OKLCH hue cycling: perceptually uniform brightness and saturation
      const h = -(time * 0.6 - ac.index * 0.1) * Math.PI * 2;
      const oL = 0.7, oC = 0.2;
      const oa = oC * Math.cos(h);
      const ob = oC * Math.sin(h);
      const l_ = oL + 0.3963377774 * oa + 0.2158037573 * ob;
      const m_ = oL - 0.1055613458 * oa - 0.0638541728 * ob;
      const s_ = oL - 0.0894841775 * oa - 1.2914855480 * ob;
      const l3 = l_ * l_ * l_;
      const m3 = m_ * m_ * m_;
      const s3 = s_ * s_ * s_;
      const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
      const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
      const b = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
      for (const mat of ac.materials) {
        mat.color.setRGB(
          Math.max(0, Math.min(1, r)),
          Math.max(0, Math.min(1, g)),
          Math.max(0, Math.min(1, b)),
        );
      }
      ac.container.position.y = ac.baseY +
        Math.sin(time * 6 - ac.index * 0.6) * 0.012;
    }

    // Button hover/press
    for (const btn of this.playButtons) {
      const hovered = App.pointerActive &&
        App.raycaster.intersectObject(btn.hitArea).length > 0;
      const target = hovered
        ? (this.isPointerDown ? BUTTON_PRESS_SCALE : BUTTON_HOVER_SCALE)
        : 1;
      const current = btn.container.scale.x;
      const next = current + (target - current) *
        (1 - Math.exp(-15 * App.deltaTime));
      btn.container.scale.setScalar(next);
    }

    // Lightbox animation
    if (this.lightbox) {
      const lb = this.lightbox;
      lb.progress += (lb.closing ? -LIGHTBOX_ANIM_SPEED : LIGHTBOX_ANIM_SPEED) * App.deltaTime;
      lb.progress = Math.max(0, Math.min(1, lb.progress));

      const t = easeInOutCubic(lb.progress);

      const cam = App.camera;
      const visW = cam.right - cam.left;
      const visH = cam.top - cam.bottom;
      const maxW = visW * (1 - LIGHTBOX_MARGIN_FRAC * 2);
      const maxH = visH * (1 - LIGHTBOX_MARGIN_FRAC * 2);
      const worldPerPixel = visW / App.width;
      const nativeScale = 2 * lb.entry.naturalWidth * worldPerPixel / lb.entry.width;
      const targetScale = Math.min(nativeScale, maxW / lb.entry.width, maxH / lb.entry.height);

      const centerX = App.cameraRig.position.x - this.position.x;
      const centerY = App.cameraRig.position.y - this.position.y;

      const px = lb.origPos.x + (centerX - lb.origPos.x) * t;
      const py = lb.origPos.y + (centerY - lb.origPos.y) * t;
      lb.entry.mesh.position.set(px, py, lb.origPos.z);

      lb.entry.mesh.scale.setScalar(1 + (targetScale - 1) * t);

      (lb.overlay.material as MeshBasicMaterial).opacity = t * LIGHTBOX_OVERLAY_OPACITY;
      lb.overlay.position.set(centerX, centerY, 0);

      if (lb.closing && lb.progress <= 0) {
        this.tearDownLightbox();
      }
    }
  }

  dispose(): void {
    this.disableInput();
    this.traverse((obj) => {
      if (obj instanceof Mesh) {
        (obj.geometry as BufferGeometry).dispose();
        const mat = obj.material as Material | Material[];
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const m of mats) {
          if (m instanceof MeshBasicMaterial && m.map) {
            m.map.dispose();
          }
          m.dispose();
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Button creation
  // ---------------------------------------------------------------------------

  private createPlayButton(
    label: string,
    color: NeonColor,
  ): { button: Object3D, width: number, hitArea: Mesh } {
    const textWidth = measureTextWidth(label, BUTTON_TEXT_SIZE);
    const width = textWidth + BUTTON_PADDING_X * 2;
    const height = BUTTON_TEXT_SIZE + BUTTON_PADDING_Y * 2;

    const btn = new Object3D();
    const roundedShape = createRoundedRectShape(width, height, BUTTON_CORNER_RADIUS);
    const border = new Wireframe(
      new ShapeGeometry(roundedShape),
      { color, type: WireframeType.Hollow },
    );
    const text = new Text(label, App.synthaFont, {
      color,
      size: BUTTON_TEXT_SIZE,
    });
    btn.add(border, text);

    const hitArea = new Mesh(
      new PlaneGeometry(width, height),
      new MeshBasicMaterial({ visible: false }),
    );
    btn.add(hitArea);

    return { button: btn, width, hitArea };
  }

  // ---------------------------------------------------------------------------
  // Lightbox
  // ---------------------------------------------------------------------------

  private openLightbox(entry: ImageEntry): void {
    const overlay = new Mesh(
      new PlaneGeometry(200, 200),
      new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }),
    );
    overlay.layers.set(LIGHTBOX_LAYER);
    this.add(overlay);

    // Move image to the lightbox layer so it renders after clean + bloom passes
    entry.mesh.layers.set(LIGHTBOX_LAYER);
    entry.mesh.renderOrder = 1;
    (entry.mesh.material as MeshBasicMaterial).depthTest = false;

    this.lightbox = {
      entry,
      overlay,
      origPos: entry.mesh.position.clone(),
      progress: 0,
      closing: false,
    };
  }

  private tearDownLightbox(): void {
    if (!this.lightbox) return;
    const lb = this.lightbox;
    lb.entry.mesh.position.copy(lb.origPos);
    lb.entry.mesh.scale.setScalar(1);
    lb.entry.mesh.layers.set(0);
    lb.entry.mesh.renderOrder = 0;
    (lb.entry.mesh.material as MeshBasicMaterial).depthTest = true;
    this.remove(lb.overlay);
    lb.overlay.geometry.dispose();
    (lb.overlay.material as Material).dispose();
    this.lightbox = null;
  }

  // ---------------------------------------------------------------------------
  // Description parsing
  // ---------------------------------------------------------------------------

  private parseDescription(desc: string): ContentBlock[] {
    // Phase 1: Extract blocks; use 'sep' markers for blank lines between images
    const rawBlocks: (ContentBlock | 'sep')[] = [];
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = imageRegex.exec(desc)) !== null) {
      const textBefore = desc.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        rawBlocks.push(...this.parseTextBlocks(textBefore));
      } else if (textBefore.includes('\n\n')) {
        rawBlocks.push('sep');
      }
      const rawSrc = match[2];
      rawBlocks.push({
        type: 'image',
        src: rawSrc.startsWith('/') ? rawSrc : `/${rawSrc}`,
      });
      lastIndex = match.index + match[0].length;
    }

    const textAfter = desc.slice(lastIndex);
    if (textAfter.trim()) {
      rawBlocks.push(...this.parseTextBlocks(textAfter));
    }

    // Phase 2: Consolidate consecutive images into image-row blocks
    const blocks: ContentBlock[] = [];
    let imageGroup: string[] = [];

    const flushImages = (): void => {
      if (imageGroup.length > 1) {
        blocks.push({ type: 'image-row', sources: [...imageGroup] });
      } else if (imageGroup.length === 1) {
        blocks.push({ type: 'image', src: imageGroup[0] });
      }
      imageGroup = [];
    };

    for (const item of rawBlocks) {
      if (item === 'sep') {
        flushImages();
      } else if (item.type === 'image') {
        imageGroup.push(item.src);
      } else {
        flushImages();
        blocks.push(item);
      }
    }
    flushImages();

    return blocks;
  }

  private parseTextBlocks(text: string): ContentBlock[] {
    return text.split('\n\n')
      .map(p => p.replace(/\n/g, ' ').trim())
      .filter(p => p.length > 0)
      .map(p => ({ type: 'paragraph' as const, runs: this.parseInlineRuns(p) }));
  }

  private parseInlineRuns(text: string): InlineRun[] {
    const runs: InlineRun[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        runs.push({ type: 'text', text: text.slice(lastIndex, match.index) });
      }
      runs.push({ type: 'link', text: match[1], url: match[2] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      runs.push({ type: 'text', text: text.slice(lastIndex) });
    }

    return runs;
  }

  // ---------------------------------------------------------------------------
  // Content rendering
  // ---------------------------------------------------------------------------

  private renderParagraph(
    runs: InlineRun[],
    left: number,
    startY: number,
    maxWidth: number,
    size: number,
    color: NeonColor,
  ): number {
    // Build word list with run and bold tracking
    const words: Word[] = [];
    for (const run of runs) {
      const boldRegex = /\*\*(.+?)\*\*/g;
      let lastIdx = 0;
      let m;
      while ((m = boldRegex.exec(run.text)) !== null) {
        const before = run.text.slice(lastIdx, m.index);
        for (const part of before.split(/\s+/).filter(w => w.length > 0)) {
          words.push({ text: part, run, bold: false });
        }
        for (const part of m[1].split(/\s+/).filter(w => w.length > 0)) {
          words.push({ text: part, run, bold: true });
        }
        lastIdx = m.index + m[0].length;
      }
      const after = run.text.slice(lastIdx);
      for (const part of after.split(/\s+/).filter(w => w.length > 0)) {
        words.push({ text: part, run, bold: false });
      }
    }

    if (words.length === 0) return startY;

    // Word wrap (using Bookerly font metrics)
    const font = App.bookerlyFont;
    const spaceWidth = measureTextWidth(' ', size, font);
    const lines: Word[][] = [];
    let currentLine: Word[] = [];
    let currentWidth = 0;

    for (const word of words) {
      const wordWidth = measureTextWidth(word.text, size, font);
      const extraWidth = currentLine.length > 0
        ? spaceWidth + wordWidth
        : wordWidth;

      if (currentWidth + extraWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [word];
        currentWidth = wordWidth;
      } else {
        currentLine.push(word);
        currentWidth += extraWidth;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    // Render each line using per-character shapes for justified alignment.
    // Generates shapes at origin per character, then positions each at a computed
    // x offset with extra space distributed evenly at word boundaries.
    let y = startY;
    const fontData = font.data as unknown as { resolution: number, boundingBox: { yMax: number } };
    const topToBaseline = fontData.boundingBox.yMax * size / fontData.resolution;
    const lineHeight = measureLineHeight(size, font) * DESC_LINE_HEIGHT_FACTOR;
    const material = new MeshBasicMaterial({ color });

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineWords = lines[lineIdx];
      const isLastLine = lineIdx === lines.length - 1;
      const lineText = lineWords.map(w => w.text).join(' ');

      // Generate per-character shape data for the full line
      const charInfos = generateCharShapes(lineText, font, size);

      // Compute justified spacing
      const naturalWidth = measureTextWidth(lineText, size, font);
      const spaceCount = charInfos.filter(c => c.char === ' ').length;
      const extraPerSpace = (!isLastLine && spaceCount > 0)
        ? (maxWidth - naturalWidth) / spaceCount
        : 0;

      // Lay out character meshes with justified spacing
      let cursorX = 0;
      let spacesSoFar = 0;
      let linkStartX = 0;
      let currentLinkRun: InlineRun | null = null;
      // Track which word we're in for link detection
      let wordIdx = 0;

      for (const info of charInfos) {
        const x = left + cursorX + spacesSoFar * extraPerSpace;
        const charY = y - topToBaseline;
        const isBold = info.char !== ' ' && lineWords[wordIdx]?.bold;

        if (isBold && info.shapes.length > 0) {
          const container = new Object3D();
          container.position.set(x, charY, 0);
          const mats: MeshBasicMaterial[] = [];
          for (const shape of info.shapes) {
            const mat = new MeshBasicMaterial();
            mats.push(mat);
            const mesh = new Mesh(new ShapeGeometry(shape), mat);
            mesh.layers.set(BLOOM_LAYER);
            container.add(mesh);
          }
          this.add(container);
          this.animatedChars.push({
            container,
            materials: mats,
            baseY: charY,
            index: this.animatedChars.length,
          });
        } else {
          for (const shape of info.shapes) {
            const mesh = new Mesh(new ShapeGeometry(shape), material);
            mesh.layers.set(BLOOM_LAYER);
            mesh.position.set(x, charY, 0);
            this.add(mesh);
          }
        }

        // Track link spans using word mapping
        if (info.char === ' ') {
          // Space between words — advance word index
          if (currentLinkRun?.type === 'link') {
            // Check if next word is still the same link
            const nextWord = lineWords[wordIdx + 1];
            if (!nextWord || nextWord.run !== currentLinkRun) {
              this.addLinkHitArea(linkStartX, x, y, size, currentLinkRun.url);
              currentLinkRun = null;
            }
          }
          wordIdx++;
          spacesSoFar++;
        } else {
          const word = lineWords[wordIdx];
          if (word?.run.type === 'link' && currentLinkRun !== word.run) {
            if (currentLinkRun?.type === 'link') {
              this.addLinkHitArea(linkStartX, x, y, size, currentLinkRun.url);
            }
            linkStartX = x;
            currentLinkRun = word.run;
          } else if (word?.run.type !== 'link' && currentLinkRun?.type === 'link') {
            this.addLinkHitArea(linkStartX, x, y, size, currentLinkRun.url);
            currentLinkRun = null;
          }
        }

        cursorX += info.advanceWidth;
      }

      // Close trailing link span
      if (currentLinkRun?.type === 'link') {
        const endX = left + cursorX + spacesSoFar * extraPerSpace;
        this.addLinkHitArea(linkStartX, endX, y, size, currentLinkRun.url);
      }

      y -= lineHeight;
    }

    // Remove trailing inter-line leading after the last line
    y += lineHeight - measureLineHeight(size, font);

    return y;
  }

  private addLinkHitArea(
    startX: number,
    endX: number,
    y: number,
    size: number,
    url: string,
  ): void {
    const width = endX - startX;
    const hitArea = new Mesh(
      new PlaneGeometry(width, size * 1.2),
      new MeshBasicMaterial({ visible: false }),
    );
    hitArea.position.set(startX + width / 2, y - size / 2, 0);
    this.add(hitArea);
    this.clickTargets.push({ mesh: hitArea, url });
  }

  private renderImage(
    src: string,
    left: number,
    startY: number,
    maxWidth: number,
  ): number {
    const info = this.imageDims.get(src);
    const aspect = info?.aspect ?? IMAGE_ASPECT;
    const worldPerPixel = (App.camera.right - App.camera.left) / App.width;
    const nativeWorldWidth = info ? info.naturalWidth * worldPerPixel : Infinity;
    const imageWidth = Math.min(maxWidth, nativeWorldWidth);
    const imageHeight = imageWidth / aspect;
    const centerX = left + maxWidth / 2;

    const geo = new PlaneGeometry(imageWidth, imageHeight);
    const mat = new MeshBasicMaterial({ transparent: true, opacity: 0 });
    const plane = new Mesh(geo, mat);
    plane.position.set(centerX, startY - imageHeight / 2, 0);
    this.add(plane);

    // Black fill on bloom layer to occlude stars behind the image
    const bloomFill = new Mesh(geo, new MeshBasicMaterial({ color: NeonColor.Black }));
    bloomFill.layers.set(BLOOM_LAYER);
    bloomFill.renderOrder = -1;
    bloomFill.position.copy(plane.position);
    this.add(bloomFill);

    this.imageEntries.push({
      mesh: plane,
      bloomFill,
      width: imageWidth,
      height: imageHeight,
      naturalWidth: info?.naturalWidth ?? Infinity,
      naturalHeight: info?.naturalHeight ?? Infinity,
    });

    this.textureLoader.load(src, (texture) => {
      texture.colorSpace = SRGBColorSpace;
      mat.map = texture;
      mat.opacity = 1;
      mat.needsUpdate = true;
    });

    return startY - imageHeight;
  }

  private renderImageRow(
    sources: string[],
    left: number,
    startY: number,
    maxWidth: number,
  ): number {
    const infos = sources.map(src => this.imageDims.get(src));
    const aspects = infos.map(info => info?.aspect ?? IMAGE_ASPECT);
    const totalAspect = aspects.reduce((sum, a) => sum + a, 0);
    const fillHeight = (maxWidth - (sources.length - 1) * IMAGE_ROW_GAP) / totalAspect;
    const worldPerPixel = (App.camera.right - App.camera.left) / App.width;
    const maxNativeHeight = Math.min(
      ...infos.map(info => info ? info.naturalHeight * worldPerPixel : Infinity),
    );
    const rowHeight = Math.min(fillHeight, maxNativeHeight);

    let cursorX = left;
    for (let i = 0; i < sources.length; i++) {
      const imgWidth = rowHeight * aspects[i];
      const centerX = cursorX + imgWidth / 2;

      const geo = new PlaneGeometry(imgWidth, rowHeight);
      const mat = new MeshBasicMaterial({ transparent: true, opacity: 0 });
      const plane = new Mesh(geo, mat);
      plane.position.set(centerX, startY - rowHeight / 2, 0);
      this.add(plane);

      const bloomFill = new Mesh(geo, new MeshBasicMaterial({ color: NeonColor.Black }));
      bloomFill.layers.set(BLOOM_LAYER);
      bloomFill.renderOrder = -1;
      bloomFill.position.copy(plane.position);
      this.add(bloomFill);

      const info = infos[i];
      this.imageEntries.push({
        mesh: plane,
        bloomFill,
        width: imgWidth,
        height: rowHeight,
        naturalWidth: info?.naturalWidth ?? Infinity,
        naturalHeight: info?.naturalHeight ?? Infinity,
      });

      this.textureLoader.load(sources[i], (texture) => {
        texture.colorSpace = SRGBColorSpace;
        mat.map = texture;
        mat.opacity = 1;
        mat.needsUpdate = true;
      });

      cursorX += imgWidth + IMAGE_ROW_GAP;
    }

    return startY - rowHeight;
  }
}
