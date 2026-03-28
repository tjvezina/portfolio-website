import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef, useState } from 'react';

import { importImage } from '../api';
import './DescriptionEditor.css';

interface DescriptionEditorProps {
  category: string;
  slug: string;
  value: string;
  onChange: (markdown: string) => void;
  onBlur: () => void;
}

export default function DescriptionEditor({
  category,
  slug,
  value,
  onChange,
  onBlur,
}: DescriptionEditorProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkUrl, setLinkUrl] = useState('');
  const [linkDismissed, setLinkDismissed] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
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
      for (const file of files) {
        const path = await importImage(category, slug, 'screenshot', file);
        editor.chain().focus().setImage({ src: `/${path}`, alt: '' }).run();
        // Store the relative path as an attribute so we can extract it on save
        // The src uses / prefix for display, but the markdown serializer will preserve it
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
