import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef, useState } from 'react';

import { importImage, importImageFromUrl } from '../api';
import { ImageGroup, IMAGE_DROP_META } from '../extensions/image-group';
import './DescriptionEditor.css';

interface DescriptionEditorProps {
  category: string;
  slug: string;
  value: string;
  onChange: (markdown: string) => void;
  onBlur: () => void;
  onSave: (markdown: string) => void;
}

export default function DescriptionEditor({
  category,
  slug,
  value,
  onChange,
  onBlur,
  onSave,
}: DescriptionEditorProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadingUrls = useRef(new Set<string>());

  const [linkUrl, setLinkUrl] = useState('');
  const [linkDismissed, setLinkDismissed] = useState(false);

  function processExternalImages(ed: Editor): void {
    if (!slug) return;
    const toDownload: string[] = [];
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'image') {
        const src = node.attrs.src as string;
        if (/^https?:\/\//.test(src) && !downloadingUrls.current.has(src)) {
          toDownload.push(src);
        }
      }
    });
    for (const src of toDownload) {
      downloadingUrls.current.add(src);
      importImageFromUrl(category, slug, src)
        .then((localPath) => {
          const { state } = ed;
          const tr = state.tr;
          let modified = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && node.attrs.src === src) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: `/${localPath}` });
              modified = true;
            }
          });
          if (modified) {
            tr.setMeta(IMAGE_DROP_META, true);
            ed.view.dispatch(tr);
          }
        })
        .catch((err) => {
          console.error(`Failed to download image: ${src}`, err);
        })
        .finally(() => {
          downloadingUrls.current.delete(src);
        });
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      Image.configure({ inline: false }).extend({
        addStorage() {
          return {
            markdown: {
              serialize(state: any, node: any, parent: any) {
                state.write(
                  '!['
                  + state.esc(node.attrs.alt || '')
                  + ']('
                  + (node.attrs.src || '').replace(/[()]/g, '\\$&')
                  + ')',
                );
                // Close the block for standalone images (not inside imageGroup)
                // so consecutive images get a blank line separator in markdown.
                if (parent?.type?.name !== 'imageGroup') {
                  state.closeBlock(node);
                }
              },
              parse: {},
            },
          };
        },
      }),
      ImageGroup,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    onUpdate: ({ editor: ed }) => {
      onChange((ed.storage as Record<string, any>).markdown.getMarkdown());
      processExternalImages(ed);
    },
    onTransaction: ({ editor: ed, transaction }) => {
      if (transaction.getMeta(IMAGE_DROP_META)) {
        const md = (ed.storage as Record<string, any>).markdown.getMarkdown();
        onSave(md);
      }
    },
    onSelectionUpdate: ({ editor: ed }) => {
      setLinkDismissed(false);
      if (ed.isActive('link')) {
        setLinkUrl(ed.getAttributes('link').href ?? '');
      }
    },
    onBlur: () => {
      onBlur();
    },
  });

  // Sync content when the project changes (but not on every keystroke)
  const prevValue = useRef(value);
  useEffect(() => {
    if (editor && value !== prevValue.current) {
      prevValue.current = value;
      // Only reset if the markdown actually differs from what the editor has
      const current = (editor.storage as Record<string, any>).markdown.getMarkdown();
      if (current !== value) {
        editor.commands.setContent(value);
      }
    }
  }, [editor, value]);

  async function handleImageInsert(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !editor) return;
    try {
      const paths: string[] = [];
      for (const file of files) {
        paths.push(await importImage(category, slug, 'screenshot', file));
      }
      if (paths.length === 1) {
        editor.chain().focus().insertContent(
          { type: 'image', attrs: { src: `/${paths[0]}`, alt: '' } },
        ).run();
      } else {
        editor.chain().focus().insertContent({
          type: 'imageGroup',
          content: paths.map((p) => ({ type: 'image', attrs: { src: `/${p}`, alt: '' } })),
        }).run();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Image import failed');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (!editor) return <div />;

  return (
    <div className="description-editor">
      <span className="description-label">Description</span>
      <div className="editor-toolbar">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'active' : ''}
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'active' : ''}
          title="Italic"
        >
          I
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
          title="Heading"
        >
          H
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'active' : ''}
          title="Bullet list"
        >
          &bull;
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'active' : ''}
          title="Numbered list"
        >
          1.
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor.isActive('codeBlock') ? 'active' : ''}
          title="Code block"
        >
          &lt;/&gt;
        </button>
        <button
          type="button"
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
            } else {
              const url = window.prompt('URL');
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }
          }}
          className={editor.isActive('link') ? 'active' : ''}
          title="Link"
        >
          Link
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!slug}
          title={!slug ? 'Save the project first' : 'Insert image'}
        >
          Image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageInsert}
          style={{ display: 'none' }}
        />
      </div>
      {editor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: ed }: { editor: typeof editor }) => ed.isActive('link')}
          updateDelay={0}
        >
          <div
            className="link-bubble"
            style={linkDismissed ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
            onBlur={(e) => {
              const related = e.relatedTarget as Node | null;
              if (related && (e.currentTarget.contains(related) || editor.view.dom.contains(related))) {
                return;
              }
              setLinkDismissed(true);
            }}
          >
            <input
              type="url"
              className="link-bubble-input"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (linkUrl) {
                    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
                  } else {
                    editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  }
                  setLinkDismissed(true);
                }
              }}
            />
            <button
              type="button"
              className="link-bubble-remove"
              title="Remove link"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
              }}
            >
              &times;
            </button>
          </div>
        </BubbleMenu>
      )}
      <div className="description-editor-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
