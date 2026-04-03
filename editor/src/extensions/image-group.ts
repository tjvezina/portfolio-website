import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

/** Pixels from image top/bottom edge that count as "new row" zone. */
const EDGE_PX = 10;

/** Transaction metadata key set on drop transactions so the host can trigger a save. */
export const IMAGE_DROP_META = 'imageDrop';

type DropTarget =
  | { type: 'imageSide'; imagePos: number; side: 'left' | 'right' }
  | { type: 'imageEdge'; imagePos: number; side: 'top' | 'bottom' }
  | { type: 'betweenImages'; groupPos: number; index: number }
  | { type: 'betweenBlocks'; insertPos: number };

/** Walk the document to find the position of the image node rendered as `imgEl`. */
function findImagePos(view: EditorView, imgEl: Element): number {
  let result = -1;
  view.state.doc.descendants((node, pos) => {
    if (result !== -1) return false;
    if (node.type.name === 'image' && view.nodeDOM(pos) === imgEl) {
      result = pos;
      return false;
    }
  });
  return result;
}

/**
 * Get the bounding rect of the containing block for an image.
 * If the image is inside an imageGroup, returns the group's rect.
 * Otherwise returns the image's own rect.
 */
function getBlockRect(view: EditorView, imagePos: number, imgEl: Element): DOMRect {
  const $pos = view.state.doc.resolve(imagePos);
  if ($pos.parent.type.name === 'imageGroup') {
    const groupPos = $pos.before($pos.depth);
    const groupDom = view.nodeDOM(groupPos) as Element | null;
    if (groupDom) return groupDom.getBoundingClientRect();
  }
  return imgEl.getBoundingClientRect();
}

/** Find the document position of an imageGroup node given its DOM element. */
function findGroupPos(view: EditorView, groupEl: Element): number {
  let result = -1;
  view.state.doc.descendants((node, pos) => {
    if (result !== -1) return false;
    if (node.type.name === 'imageGroup' && view.nodeDOM(pos) === groupEl) {
      result = pos;
      return false;
    }
  });
  return result;
}

/**
 * Walk up from `el` to find the direct child of `parentEl`.
 * Returns null if `el` is not a descendant of `parentEl`.
 */
function findDirectChild(el: HTMLElement, parentEl: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur && cur.parentElement !== parentEl) {
    cur = cur.parentElement;
  }
  return cur && cur.parentElement === parentEl ? cur : null;
}

export const ImageGroup = TiptapNode.create({
  name: 'imageGroup',
  group: 'block',
  content: 'image+',

  parseHTML() {
    return [{ tag: 'div[data-image-group]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-image-group': '',
        class: 'image-group',
      }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          node.forEach((child: PMNode) => {
            if (child.type.name === 'image') {
              state.write(
                '!['
                + state.esc(child.attrs.alt || '')
                + ']('
                + (child.attrs.src || '').replace(/[()]/g, '\\$&')
                + ')',
              );
            }
          });
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const p of [...element.querySelectorAll('p')]) {
              const children = [...p.childNodes];
              const imgs = children.filter(
                (n) => n.nodeType === 1 && (n as Element).tagName === 'IMG',
              );
              const nonImg = children.filter(
                (n) =>
                  !(n.nodeType === 1 && (n as Element).tagName === 'IMG') &&
                  !(n.nodeType === 3 && !n.textContent?.trim()),
              );
              if (imgs.length >= 2 && nonImg.length === 0) {
                const wrapper = document.createElement('div');
                wrapper.setAttribute('data-image-group', '');
                p.replaceWith(wrapper);
                for (const img of imgs) wrapper.appendChild(img);
              }
            }
          },
        },
      },
    };
  },

  addNodeView() {
    return () => {
      const dom = document.createElement('div');
      dom.setAttribute('data-image-group', '');
      dom.className = 'image-group';

      const contentDOM = dom;

      /** Recompute image sizes so the row matches the shortest image's height. */
      const layout = (): void => {
        const imgs = [...dom.querySelectorAll(':scope > img')] as HTMLImageElement[];
        if (imgs.length === 0) return;

        // Reset any previous explicit sizing so naturalWidth/Height are readable
        for (const img of imgs) {
          img.style.width = '';
          img.style.height = '';
        }

        // Need all images loaded to read natural dimensions
        if (imgs.some((img) => !img.naturalWidth)) return;

        const GAP = 4;
        const aspects = imgs.map((img) => img.naturalWidth / img.naturalHeight);
        const totalAspect = aspects.reduce((sum, a) => sum + a, 0);
        const maxWidth = dom.clientWidth - (imgs.length - 1) * GAP;
        const rowHeight = Math.min(
          maxWidth / totalAspect,
          Math.min(...imgs.map((img) => img.naturalHeight)),
        );

        for (let i = 0; i < imgs.length; i++) {
          imgs[i].style.width = `${rowHeight * aspects[i]}px`;
          imgs[i].style.height = `${rowHeight}px`;
        }
      };

      // Observe child changes (images added/removed/reordered)
      const observer = new MutationObserver(layout);
      observer.observe(dom, { childList: true });

      // Listen for image loads
      dom.addEventListener('load', layout, true);

      return {
        dom,
        contentDOM,
        update(node) {
          if (node.type.name !== 'imageGroup') return false;
          // Let ProseMirror update the content, then relayout
          requestAnimationFrame(layout);
          return true;
        },
        destroy() {
          observer.disconnect();
          dom.removeEventListener('load', layout, true);
        },
      };
    };
  },

  addProseMirrorPlugins() {
    const indicator = document.createElement('div');
    indicator.className = 'image-drop-indicator';
    indicator.style.cssText =
      'position:fixed;pointer-events:none;z-index:9999;'
      + 'background:#fff;border-radius:2px;display:none;';

    let editorContentEl: Element | null = null;
    let dropTarget: DropTarget | null = null;

    const hideIndicator = (): void => {
      indicator.style.display = 'none';
      dropTarget = null;
    };

    /** Apply indicator rect, clamped to the editor content bounds. */
    const applyIndicator = (
      left: number, top: number, width: number, height: number,
    ): void => {
      const bounds = editorContentEl?.getBoundingClientRect();
      if (bounds) {
        if (left < bounds.left) { width -= bounds.left - left; left = bounds.left; }
        if (left + width > bounds.right) width = bounds.right - left;
        if (top < bounds.top) { height -= bounds.top - top; top = bounds.top; }
        if (top + height > bounds.bottom) height = bounds.bottom - top;
      }
      if (width <= 0 || height <= 0) { indicator.style.display = 'none'; return; }
      indicator.style.left = `${left}px`;
      indicator.style.top = `${top}px`;
      indicator.style.width = `${width}px`;
      indicator.style.height = `${height}px`;
      indicator.style.display = 'block';
    };

    return [
      new Plugin({
        key: new PluginKey('imageGroupDrop'),

        view(editorView) {
          document.body.appendChild(indicator);
          editorContentEl = editorView.dom.closest('.description-editor-content');
          return {
            destroy() {
              indicator.remove();
              editorContentEl = null;
            },
          };
        },

        props: {
          handleDOMEvents: {
            dragstart: (view: EditorView, event: Event) => {
              // ProseMirror's built-in mightDrag detection can fail after
              // a DOM flush (e.g. right after a transaction). Ensure the
              // NodeSelection exists before ProseMirror's handler runs.
              const e = event as DragEvent;
              const target = e.target;
              if (target instanceof HTMLImageElement) {
                const imagePos = findImagePos(view, target);
                if (imagePos !== -1) {
                  const sel = view.state.selection;
                  if (
                    !(sel instanceof NodeSelection)
                    || sel.from !== imagePos
                  ) {
                    view.dispatch(
                      view.state.tr.setSelection(
                        NodeSelection.create(view.state.doc, imagePos),
                      ),
                    );
                  }
                }
              }
              return false;
            },

            dragover: (view: EditorView, event: Event) => {
              const e = event as DragEvent;

              // Only activate when dragging an image node internally
              const sel = view.state.selection;
              if (
                !(sel instanceof NodeSelection)
                || sel.node.type.name !== 'image'
              ) {
                hideIndicator();
                return false;
              }

              const { clientX, clientY } = e;
              const el = e.target;
              if (!(el instanceof HTMLElement)) { hideIndicator(); return false; }

              const tiptapEl = view.dom as HTMLElement;

              // --- Case 1: Over an <img> ---
              const imgEl = el.closest('img');
              if (imgEl && tiptapEl.contains(imgEl)) {
                const imagePos = findImagePos(view, imgEl);
                if (imagePos === -1 || sel.from === imagePos) {
                  hideIndicator();
                  return false;
                }

                const imgRect = imgEl.getBoundingClientRect();

                // Within EDGE_PX of top/bottom → new row
                if (clientY - imgRect.top < EDGE_PX) {
                  const blockR = getBlockRect(view, imagePos, imgEl);
                  applyIndicator(blockR.left, imgRect.top - 1.5, blockR.width, 3);
                  dropTarget = { type: 'imageEdge', imagePos, side: 'top' };
                  return false;
                }
                if (imgRect.bottom - clientY < EDGE_PX) {
                  const blockR = getBlockRect(view, imagePos, imgEl);
                  applyIndicator(blockR.left, imgRect.bottom - 1.5, blockR.width, 3);
                  dropTarget = { type: 'imageEdge', imagePos, side: 'bottom' };
                  return false;
                }

                // Otherwise → left/right half for same-row placement
                const midX = (imgRect.left + imgRect.right) / 2;
                const side = clientX < midX ? 'left' : 'right';
                const x = side === 'left' ? imgRect.left : imgRect.right;
                applyIndicator(x - 1.5, imgRect.top, 3, imgRect.height);
                dropTarget = { type: 'imageSide', imagePos, side };
                return false;
              }

              // --- Case 2: Over an .image-group gap (between images) ---
              const groupEl = el.closest('.image-group');
              if (groupEl && tiptapEl.contains(groupEl)) {
                const groupPos = findGroupPos(view, groupEl);
                if (groupPos !== -1) {
                  const imgs = [...groupEl.querySelectorAll(':scope > img')];
                  const groupRect = groupEl.getBoundingClientRect();

                  // Find which gap the cursor is in
                  let index = imgs.length;
                  for (let i = 0; i < imgs.length; i++) {
                    const r = imgs[i].getBoundingClientRect();
                    if (clientX < (r.left + r.right) / 2) { index = i; break; }
                  }

                  let x: number;
                  if (imgs.length === 0) {
                    x = groupRect.left;
                  } else if (index === 0) {
                    x = imgs[0].getBoundingClientRect().left;
                  } else if (index >= imgs.length) {
                    x = imgs[imgs.length - 1].getBoundingClientRect().right;
                  } else {
                    const lr = imgs[index - 1].getBoundingClientRect();
                    const rr = imgs[index].getBoundingClientRect();
                    x = (lr.right + rr.left) / 2;
                  }

                  applyIndicator(x - 1.5, groupRect.top, 3, groupRect.height);
                  dropTarget = { type: 'betweenImages', groupPos, index };
                  return false;
                }
              }

              // --- Case 3: Over a block-level element (text, heading, etc.) ---
              if (tiptapEl.contains(el) && el !== tiptapEl) {
                const blockEl = findDirectChild(el, tiptapEl);
                if (blockEl) {
                  const pos = view.posAtDOM(blockEl, 0);
                  const $pos = view.state.doc.resolve(pos);
                  const depth = Math.max($pos.depth, 1);
                  const blockFrom = $pos.before(depth);
                  const blockNode = view.state.doc.nodeAt(blockFrom);
                  if (blockNode) {
                    const blockRect = blockEl.getBoundingClientRect();
                    const tiptapRect = tiptapEl.getBoundingClientRect();
                    const midY = (blockRect.top + blockRect.bottom) / 2;

                    if (clientY < midY) {
                      applyIndicator(
                        tiptapRect.left, blockRect.top - 1.5,
                        tiptapRect.width, 3,
                      );
                      dropTarget = { type: 'betweenBlocks', insertPos: blockFrom };
                    } else {
                      const insertPos = blockFrom + blockNode.nodeSize;
                      applyIndicator(
                        tiptapRect.left, blockRect.bottom - 1.5,
                        tiptapRect.width, 3,
                      );
                      dropTarget = { type: 'betweenBlocks', insertPos };
                    }
                    return false;
                  }
                }
              }

              // --- Case 4: Over the editor root (gap area / padding) ---
              if (el === tiptapEl || editorContentEl?.contains(el)) {
                const tiptapRect = tiptapEl.getBoundingClientRect();
                // Find the nearest inter-block boundary
                let bestY = tiptapRect.top;
                let bestDist = Infinity;
                let bestPos = 0;

                view.state.doc.forEach((node, offset) => {
                  const dom = view.nodeDOM(offset) as Element | null;
                  if (!dom) return;
                  const r = dom.getBoundingClientRect();

                  // Top edge of this block
                  const dTop = Math.abs(clientY - r.top);
                  if (dTop < bestDist) {
                    bestDist = dTop;
                    bestY = r.top;
                    bestPos = offset;
                  }
                  // Bottom edge of this block
                  const dBot = Math.abs(clientY - r.bottom);
                  if (dBot < bestDist) {
                    bestDist = dBot;
                    bestY = r.bottom;
                    bestPos = offset + node.nodeSize;
                  }
                });

                applyIndicator(tiptapRect.left, bestY - 1.5, tiptapRect.width, 3);
                dropTarget = { type: 'betweenBlocks', insertPos: bestPos };
                return false;
              }

              hideIndicator();
              return false;
            },

            dragleave: (_view: EditorView, event: Event) => {
              const e = event as DragEvent;
              const related = e.relatedTarget as Node | null;
              if (
                related
                && (e.currentTarget as Element)?.contains?.(related)
              ) {
                return false;
              }
              hideIndicator();
              return false;
            },

            drop: () => {
              indicator.style.display = 'none';
              return false;
            },
          },

          handleDrop: (view: EditorView, _event, slice, _moved) => {
            const target = dropTarget;
            dropTarget = null;

            const sel = view.state.selection;
            const isImageDrag =
              sel instanceof NodeSelection
              && sel.node.type.name === 'image';

            if (!target || !slice || slice.content.childCount !== 1) {
              return isImageDrag;
            }
            const draggedNode = slice.content.firstChild!;
            if (draggedNode.type.name !== 'image') return false;

            const sourcePos = isImageDrag ? sel.from : -1;

            const doc = view.state.doc;
            const groupType = view.state.schema.nodes.imageGroup;
            const tr = view.state.tr;

            if (target.type === 'imageSide') {
              const { imagePos, side } = target;
              if (sourcePos === imagePos) return true;
              const imageNode = doc.nodeAt(imagePos);
              if (!imageNode || imageNode.type.name !== 'image') return false;

              const $target = doc.resolve(imagePos);
              const targetInGroup = $target.parent.type.name === 'imageGroup';

              if (targetInGroup) {
                const groupPos = $target.before($target.depth);
                const groupNode = doc.nodeAt(groupPos)!;
                const children: PMNode[] = [];
                groupNode.forEach((child, _offset) => {
                  const childPos = groupPos + 1 + _offset;
                  if (childPos === sourcePos) return;
                  if (childPos === imagePos && side === 'left') {
                    children.push(draggedNode);
                  }
                  children.push(child);
                  if (childPos === imagePos && side === 'right') {
                    children.push(draggedNode);
                  }
                });
                tr.replaceWith(
                  groupPos,
                  groupPos + groupNode.nodeSize,
                  groupType.create(null, children),
                );
                if (sourcePos !== -1) {
                  const sourceInThisGroup =
                    sourcePos > groupPos
                    && sourcePos < groupPos + groupNode.nodeSize;
                  if (!sourceInThisGroup) {
                    const mp = tr.mapping.map(sourcePos);
                    tr.delete(mp, mp + 1);
                  }
                }
              } else {
                const children =
                  side === 'left'
                    ? [draggedNode, imageNode]
                    : [imageNode, draggedNode];
                tr.replaceWith(
                  imagePos,
                  imagePos + imageNode.nodeSize,
                  groupType.create(null, children),
                );
                if (sourcePos !== -1) {
                  const mp = tr.mapping.map(sourcePos);
                  tr.delete(mp, mp + 1);
                }
              }
            } else if (target.type === 'imageEdge') {
              const { imagePos, side } = target;
              if (sourcePos === imagePos) return true;
              const imageNode = doc.nodeAt(imagePos);
              if (!imageNode || imageNode.type.name !== 'image') return false;

              const $target = doc.resolve(imagePos);
              const targetInGroup = $target.parent.type.name === 'imageGroup';
              let blockFrom: number;
              let blockTo: number;
              if (targetInGroup) {
                const gp = $target.before($target.depth);
                const gn = doc.nodeAt(gp)!;
                blockFrom = gp;
                blockTo = gp + gn.nodeSize;
              } else {
                blockFrom = imagePos;
                blockTo = imagePos + imageNode.nodeSize;
              }

              if (sourcePos !== -1) {
                tr.delete(sourcePos, sourcePos + 1);
              }
              const insertPos = side === 'top'
                ? tr.mapping.map(blockFrom, -1)
                : tr.mapping.map(blockTo);
              tr.insert(insertPos, draggedNode);
            } else if (target.type === 'betweenImages') {
              const { groupPos, index } = target;
              const groupNode = doc.nodeAt(groupPos);
              if (!groupNode || groupNode.type.name !== 'imageGroup') return false;

              // Build new children list, skipping source if it's in this group
              const children: PMNode[] = [];
              let srcChildIdx = -1;
              let ci = 0;
              groupNode.forEach((child, _offset) => {
                const childPos = groupPos + 1 + _offset;
                if (childPos === sourcePos) {
                  srcChildIdx = ci;
                } else {
                  children.push(child);
                }
                ci++;
              });

              // Adjust insertion index if source was before it in this group
              const adjIndex =
                srcChildIdx !== -1 && srcChildIdx < index
                  ? index - 1
                  : index;
              children.splice(adjIndex, 0, draggedNode);

              tr.replaceWith(
                groupPos,
                groupPos + groupNode.nodeSize,
                groupType.create(null, children),
              );

              // Delete source if it was outside this group
              if (sourcePos !== -1) {
                const sourceInThisGroup =
                  sourcePos > groupPos
                  && sourcePos < groupPos + groupNode.nodeSize;
                if (!sourceInThisGroup) {
                  const mp = tr.mapping.map(sourcePos);
                  tr.delete(mp, mp + 1);
                }
              }
            } else if (target.type === 'betweenBlocks') {
              const { insertPos } = target;
              if (sourcePos !== -1) {
                tr.delete(sourcePos, sourcePos + 1);
              }
              const mp = tr.mapping.map(insertPos);
              tr.insert(mp, draggedNode);
            }

            tr.setMeta(IMAGE_DROP_META, true);
            view.dispatch(tr);
            return true;
          },
        },

        appendTransaction(_transactions, _oldState, newState) {
          let tr: Transaction | null = null;
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'imageGroup' || node.childCount > 1) return;
            if (!tr) tr = newState.tr;
            const from = tr.mapping.map(pos);
            const to = tr.mapping.map(pos + node.nodeSize);
            if (node.childCount === 1) {
              tr.replaceWith(from, to, node.firstChild!);
            } else {
              tr.delete(from, to);
            }
          });
          return tr;
        },
      }),
    ];
  },
});
