import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

/** Fraction of image width from each edge that counts as a side-by-side drop zone. */
const SIDE_ZONE = 0.3;

type DropZone = 'left' | 'right' | 'top' | 'bottom';

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
 * Determine which drop zone the cursor is in within an image's rect.
 *   left / right 30% → side-by-side
 *   top / bottom half of the middle 40% → separate row above / below
 */
function getDropZone(rect: DOMRect, clientX: number, clientY: number): DropZone {
  const rx = (clientX - rect.left) / rect.width;
  if (rx < SIDE_ZONE) return 'left';
  if (rx > 1 - SIDE_ZONE) return 'right';
  const ry = (clientY - rect.top) / rect.height;
  return ry < 0.5 ? 'top' : 'bottom';
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
          // Write each child image consecutively — no closeBlock between them
          // produces adjacent ![alt](src) tags (= side-by-side in our format).
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
            // markdown-it renders consecutive ![](a)![](b) (no blank line)
            // inside a single <p>. Detect <p> tags with 2+ <img> children
            // and no other content, then wrap them in <div data-image-group>
            // so ProseMirror parses them as an imageGroup node.
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

  addProseMirrorPlugins() {
    // Fixed-position indicator element, managed by the plugin lifecycle.
    const indicator = document.createElement('div');
    indicator.className = 'image-drop-indicator';
    indicator.style.cssText =
      'position:fixed;pointer-events:none;z-index:9999;'
      + 'background:#5a9a5a;border-radius:2px;display:none;';

    /** Reference to the editor content wrapper for toggling dropcursor suppression. */
    let editorContentEl: Element | null = null;

    // Cached drop target info from the last dragover (used by handleDrop so it
    // doesn't need to re-derive the target from event.target, which can be
    // unreliable at drop time).
    let dropTarget: { imagePos: number; zone: DropZone } | null = null;

    const hideIndicator = (): void => {
      indicator.style.display = 'none';
      editorContentEl?.classList.remove('image-drag-active');
      dropTarget = null;
    };

    const showIndicator = (rect: DOMRect, zone: DropZone): void => {
      if (zone === 'left' || zone === 'right') {
        const x = zone === 'left' ? rect.left : rect.right;
        indicator.style.left = `${x - 1.5}px`;
        indicator.style.top = `${rect.top}px`;
        indicator.style.width = '3px';
        indicator.style.height = `${rect.height}px`;
      } else {
        const y = zone === 'top' ? rect.top : rect.bottom;
        indicator.style.left = `${rect.left}px`;
        indicator.style.top = `${y - 1.5}px`;
        indicator.style.width = `${rect.width}px`;
        indicator.style.height = '3px';
      }
      indicator.style.display = 'block';
      editorContentEl?.classList.add('image-drag-active');
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

              const el = e.target;
              if (!(el instanceof HTMLElement)) { hideIndicator(); return false; }
              const imgEl = el.closest('img');
              if (!imgEl) { hideIndicator(); return false; }

              const imagePos = findImagePos(view, imgEl);
              if (imagePos === -1) { hideIndicator(); return false; }

              // Don't show indicator on the image being dragged
              if (sel.from === imagePos) { hideIndicator(); return false; }

              const imgRect = imgEl.getBoundingClientRect();
              const zone = getDropZone(imgRect, e.clientX, e.clientY);

              // For top/bottom, show indicator spanning the whole containing block
              const displayRect =
                zone === 'top' || zone === 'bottom'
                  ? getBlockRect(view, imagePos, imgEl)
                  : imgRect;

              showIndicator(displayRect, zone);
              dropTarget = { imagePos, zone };
              return false;
            },

            dragleave: (_view: EditorView, event: Event) => {
              const e = event as DragEvent;
              const related = e.relatedTarget as Node | null;
              // Don't hide if cursor just moved to a child element
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
              // Hide indicator but DON'T clear dropTarget — handleDrop needs it
              indicator.style.display = 'none';
              editorContentEl?.classList.remove('image-drag-active');
              return false;
            },
          },

          handleDrop: (view: EditorView, _event, slice, _moved) => {
            // Use cached target from the last dragover — more reliable than
            // re-deriving from event.target which can hit the group container
            // or the dropcursor element at drop time.
            const target = dropTarget;
            dropTarget = null;

            if (!target) return false;
            if (!slice || slice.content.childCount !== 1) return false;
            const draggedNode = slice.content.firstChild!;
            if (draggedNode.type.name !== 'image') return false;

            const { imagePos, zone } = target;
            const imageNode = view.state.doc.nodeAt(imagePos);
            if (!imageNode || imageNode.type.name !== 'image') return false;

            // Detect internal image move from the selection state directly,
            // rather than relying solely on the `moved` flag which can be
            // incorrectly false if view.dragging was cleared.
            const sel = view.state.selection;
            const sourcePos =
              sel instanceof NodeSelection
              && sel.node.type.name === 'image'
              && sel.from !== imagePos
                ? sel.from
                : -1;

            const doc = view.state.doc;
            const $target = doc.resolve(imagePos);
            const targetInGroup = $target.parent.type.name === 'imageGroup';
            const groupType = view.state.schema.nodes.imageGroup;
            const tr = view.state.tr;

            if (zone === 'left' || zone === 'right') {
              // ---- Side-by-side ----

              if (targetInGroup) {
                // Target is inside a group — rebuild the group's children list
                // with the dragged image at the correct position. This avoids
                // fragile delete + position-map + insert sequences.
                const groupPos = $target.before($target.depth);
                const groupNode = doc.nodeAt(groupPos)!;

                const children: PMNode[] = [];
                groupNode.forEach((child, _offset, index) => {
                  // Skip the source image if it's in the same group
                  const childPos = groupPos + 1 + _offset;
                  if (childPos === sourcePos) return;

                  // Insert dragged node before/after the target
                  if (childPos === imagePos && zone === 'left') {
                    children.push(draggedNode);
                  }
                  children.push(child);
                  if (childPos === imagePos && zone === 'right') {
                    children.push(draggedNode);
                  }
                });

                // Replace the entire group with the reordered one
                tr.replaceWith(
                  groupPos,
                  groupPos + groupNode.nodeSize,
                  groupType.create(null, children),
                );

                // If source was OUTSIDE this group, delete it
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
                // Target is standalone — wrap in a new group
                const children =
                  zone === 'left' ? [draggedNode, imageNode] : [imageNode, draggedNode];
                tr.replaceWith(
                  imagePos,
                  imagePos + imageNode.nodeSize,
                  groupType.create(null, children),
                );

                // Delete source if it was an internal move
                if (sourcePos !== -1) {
                  const mp = tr.mapping.map(sourcePos);
                  tr.delete(mp, mp + 1);
                }
              }
            } else {
              // ---- Separate row: insert before / after the containing block ----
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

              // Delete source first (if internal move), then insert at mapped pos
              if (sourcePos !== -1) {
                tr.delete(sourcePos, sourcePos + 1);
              }
              const insertPos = zone === 'top'
                ? tr.mapping.map(blockFrom, -1)
                : tr.mapping.map(blockTo);
              tr.insert(insertPos, draggedNode);
            }

            view.dispatch(tr);
            return true;
          },
        },

        // Dissolve imageGroup nodes that end up with 0 or 1 child
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
